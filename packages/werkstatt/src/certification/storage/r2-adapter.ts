/*
<MODULE_CONTRACT>
<purpose>RFC-0865: R2 durable storage adapter implementing CertificationStorageAdapterV1 via Cloudflare R2 S3-compatible API using fetch() with AWS Signature V4 signing. No SDK dependency — engine is stack-agnostic.</purpose>
<non-goals>
  <item>Do not implement retention GC, dossier events, or root hash recomputation — those live in repository.ts and retention.ts.</item>
  <item>Do not depend on @aws-sdk/* or any external SDK — use fetch() with inline Sig V4 signing.</item>
  <item>Do not log, echo, or serialize secret values.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
<item>RFC-0865: initial R2 durable storage adapter for propagate-alt and promote-main gates.</item>
</CHANGE_SUMMARY>
*/

import { createHmac, createHash } from "node:crypto";
import type { Sha256Digest } from "../../fingerprint/primitives.ts";
import type {
  CertificationStorageAdapterV1,
  StoragePutInputV1,
  StoragePutResultV1,
  StorageHeadResultV1,
} from "./adapter.ts";

export interface R2StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

const R2_SERVICE = "s3";
const R2_REGION = "auto";
const R2_ENDPOINT = (accountId: string) => `https://${accountId}.r2.cloudflarestorage.com`;

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function uriEncodePath(path: string): string {
  return path
    .split("/")
    .map((segment) =>
      segment
        .replace(/!/g, "%21")
        .replace(/'/g, "%27")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29")
        .replace(/\*/g, "%2A")
        .replace(/%2F/g, "/"),
    )
    .join("/");
}

function uriEncodeQueryValue(value: string): string {
  return encodeURIComponent(value);
}

interface SigV4Params {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: Buffer | string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

function signSigV4(params: SigV4Params): Record<string, string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const host = params.url.hostname;
  const canonicalUri = uriEncodePath(params.url.pathname);

  const canonicalQuery = Array.from(params.url.searchParams.entries())
    .map(([k, v]) => `${uriEncodeQueryValue(k)}=${uriEncodeQueryValue(v)}`)
    .sort()
    .join("&");

  const headersWithAmz: Record<string, string> = {
    host,
    "x-amz-content-sha256": sha256Hex(params.body),
    "x-amz-date": amzDate,
    ...params.headers,
  };

  const sortedHeaderKeys = Object.keys(headersWithAmz).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${headersWithAmz[k].trim()}\n`)
    .join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalRequest = [
    params.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    headersWithAmz["x-amz-content-sha256"],
  ].join("\n");

  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmacSha256(`AWS4${params.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, R2_REGION);
  const kService = hmacSha256(kRegion, R2_SERVICE);
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = hmacSha256(kSigning, stringToSign).toString("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...headersWithAmz,
    Authorization: authorization,
  };
}

async function r2Fetch(
  method: string,
  config: R2StorageConfig,
  key: string,
  extraHeaders: Record<string, string> = {},
  body?: Buffer | string,
): Promise<Response> {
  const url = new URL(`${R2_ENDPOINT(config.accountId)}/${config.bucketName}/${key}`);
  const headers: Record<string, string> = { ...extraHeaders };
  const signedHeaders = signSigV4({
    method,
    url,
    headers,
    body: body ?? "",
    accountId: config.accountId,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    bucketName: config.bucketName,
  });

  const bodyBytes = body ? (typeof body === "string" ? Buffer.from(body, "utf8") : body) : null;

  return fetch(url, {
    method,
    headers: signedHeaders,
    body: bodyBytes ? new Uint8Array(bodyBytes) : undefined,
  });
}

export function createR2StorageAdapter(config: R2StorageConfig): CertificationStorageAdapterV1 {
  const adapterId = `r2:${config.bucketName}`;

  return {
    id: adapterId,

    async putObject(input: StoragePutInputV1): Promise<StoragePutResultV1> {
      const body = Buffer.from(input.bytes);
      const response = await r2Fetch(
        "PUT",
        config,
        input.digest,
        {
          "Content-Type": input.mediaType,
          "Content-Length": String(body.byteLength),
        },
        body,
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `CERT-R2-01: putObject failed for digest "${input.digest}" — HTTP ${response.status}: ${text.slice(0, 500)}`,
        );
      }

      const etag = response.headers.get("etag") ?? "";
      return {
        locator: `r2://${config.bucketName}/${input.digest}#${etag}`,
        sizeBytes: body.byteLength,
      };
    },

    async headObject(digest: Sha256Digest): Promise<StorageHeadResultV1> {
      const response = await r2Fetch("HEAD", config, digest);

      if (response.status === 404) {
        return { exists: false };
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `CERT-R2-02: headObject failed for digest "${digest}" — HTTP ${response.status}: ${text.slice(0, 500)}`,
        );
      }

      const contentLength = response.headers.get("content-length");
      const etag = response.headers.get("etag") ?? "";
      return {
        exists: true,
        sizeBytes: contentLength ? Number(contentLength) : undefined,
        digest,
        locator: `r2://${config.bucketName}/${digest}#${etag}`,
      };
    },

    async getObject(digest: Sha256Digest): Promise<Uint8Array> {
      const response = await r2Fetch("GET", config, digest);

      if (response.status === 404) {
        throw new Error(`CERT-STORAGE-01: object "${digest}" not found in adapter "${adapterId}"`);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `CERT-R2-03: getObject failed for digest "${digest}" — HTTP ${response.status}: ${text.slice(0, 500)}`,
        );
      }

      const buf = Buffer.from(await response.arrayBuffer());
      return new Uint8Array(buf);
    },

    async appendAuditRecord(record: Uint8Array): Promise<{ locator: string }> {
      const timestamp = Date.now();
      const key = `audit/${timestamp}-${Math.random().toString(36).slice(2, 10)}`;
      const body = Buffer.from(record);

      const response = await r2Fetch(
        "PUT",
        config,
        key,
        {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(body.byteLength),
        },
        body,
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `CERT-R2-04: appendAuditRecord failed — HTTP ${response.status}: ${text.slice(0, 500)}`,
        );
      }

      const etag = response.headers.get("etag") ?? "";
      return {
        locator: `r2://${config.bucketName}/${key}#${etag}`,
      };
    },
  };
}
