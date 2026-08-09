import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/public-surface/indexnow.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not submit Markdown twins, static assets, API routes, well-known artifacts, redirects, or noindex pages.</item>
  <item>Do not run live network submission during local build preparation or offline package checks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0311: complete IndexNow key validation, canonical URL selection, batching, live submission, offline fixtures, and Bordbuch event logging.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { byteHash } from "@warpgogol/fingerprint";
import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { executeKernelCommand } from "@warpgogol/site-kernel";
import {
  asString,
  deriveIndexNowKey,
  diagnostics,
  extractSitemapUrls,
  INDEXNOW_KEY_PATTERN,
  loadPublicContext,
  normalizeUrl,
  readTextIfExists,
  workspaceRel,
} from "./shared.ts";
import { passResult } from "../result-helpers.ts";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_BATCH_SIZE = 10000;
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const STATIC_EXTENSIONS =
  /\.(?:avif|css|gif|ico|jpeg|jpg|js|json|map|mp4|pdf|png|svg|txt|webm|webmanifest|webp|woff2?|xml)$/i;

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

export interface IndexNowBatchResult {
  batch: number;
  attempted: number;
  submitted: number;
  failed: number;
  status: number;
  statusText: string;
}

export function keyLocation(baseUrl: string, key: string): string {
  return `${normalizeUrl(baseUrl)}/${key}.txt`;
}

export function batchHash(urls: readonly string[]): string {
  return byteHash([...urls].sort().join("\n")).slice(("sha" + "256:").length);
}

export function isIndexNowCanonicalHtmlUrl(url: string, baseUrl: string): boolean {
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(url);
    base = new URL(baseUrl);
  } catch {
    return false;
  }
  if (parsed.origin !== base.origin) return false;
  const path = parsed.pathname;
  if (parsed.search || parsed.hash) return false;
  if (path === "/robots.txt" || path === "/ai.txt" || path === "/humans.txt") return false;
  if (path === "/llms.txt" || path === "/llms-full.txt") return false;
  if (path.startsWith("/api/") || path.startsWith("/.well-known/")) return false;
  if (path.endsWith(".md")) return false;
  if (STATIC_EXTENSIONS.test(path)) return false;
  return path === "/" || path.endsWith("/");
}

export function buildIndexNowBatches(
  host: string,
  key: string,
  baseUrl: string,
  urls: readonly string[],
  batchSize = INDEXNOW_BATCH_SIZE,
): IndexNowPayload[] {
  const batches: IndexNowPayload[] = [];
  for (let index = 0; index < urls.length; index += batchSize) {
    batches.push({
      host,
      key,
      keyLocation: keyLocation(baseUrl, key),
      urlList: urls.slice(index, index + batchSize),
    });
  }
  return batches;
}

async function readUtf8KeyBody(path: string): Promise<{ body?: string; error?: string }> {
  try {
    const buffer = await readFile(path);
    const body = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function stripSingleTrailingLf(value: string): string | null {
  if (value.endsWith("\r\n")) return null;
  if (value.endsWith("\n")) {
    const stripped = value.slice(0, -1);
    return stripped.includes("\n") || stripped.includes("\r") ? null : stripped;
  }
  return value.includes("\n") || value.includes("\r") ? null : value;
}

async function readLocalSitemapPageUrls(
  context: KernelRuntimeContext,
  publicDirectory: string,
  baseUrl: string,
  fileName = "sitemap.xml",
  seen = new Set<string>(),
): Promise<string[]> {
  if (seen.has(fileName)) return [];
  seen.add(fileName);
  const sitemapPath = join(publicDirectory, fileName);
  const sitemap = await readTextIfExists(context, sitemapPath);
  if (!sitemap) return [];
  const locs = extractSitemapUrls(sitemap);
  const nested: string[] = [];
  const pages: string[] = [];
  for (const loc of locs) {
    const parsed = new URL(loc, baseUrl);
    const nestedMatch = parsed.pathname.match(/^\/(sitemap[^/]*\.xml)$/);
    if (nestedMatch) {
      nested.push(
        ...(await readLocalSitemapPageUrls(
          context,
          publicDirectory,
          baseUrl,
          nestedMatch[1],
          seen,
        )),
      );
    } else {
      pages.push(loc);
    }
  }
  return [...pages, ...nested];
}

async function readProvidedUrls(context: KernelRuntimeContext, path: string): Promise<string[]> {
  const raw = await context.io.readFile(path);
  const parsed = yamlParse(raw) as unknown;
  if (Array.isArray(parsed))
    return parsed.filter((item): item is string => typeof item === "string");
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const candidates = record.urls ?? record.urlList ?? record.changedUrls;
    if (Array.isArray(candidates)) {
      return candidates.filter((item): item is string => typeof item === "string");
    }
  }
  throw new Error("--urls JSON must be an array or an object with urls/urlList/changedUrls.");
}

async function readNoindexCanonicals(appDirectory: string): Promise<Set<string>> {
  const snapshotPath = join(appDirectory, "behavior.snapshot.generated.yaml");
  try {
    const snapshot = yamlParse(await readFile(snapshotPath, "utf8")) as {
      routes?: Array<{ canonical?: string | null; robotsMeta?: string | null }>;
    };
    return new Set(
      (snapshot.routes ?? [])
        .filter((route) => route.robotsMeta?.toLowerCase().includes("noindex"))
        .map((route) => route.canonical)
        .filter((url): url is string => typeof url === "string" && url.length > 0),
    );
  } catch {
    return new Set();
  }
}

export async function resolveIndexNowUrls(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
  publicDirectory: string,
  appDirectory: string,
  baseUrl: string,
): Promise<string[]> {
  const sitemapUrls = await readLocalSitemapPageUrls(context, publicDirectory, baseUrl);
  const canonicalSet = new Set(
    sitemapUrls.filter((url) => isIndexNowCanonicalHtmlUrl(url, baseUrl)),
  );
  const explicitPath = asString(input.flags.urls);
  const sourceUrls = explicitPath
    ? await readProvidedUrls(context, explicitPath)
    : [...canonicalSet];
  const noindex = await readNoindexCanonicals(appDirectory);
  const resolved = sourceUrls
    .map((url) => {
      try {
        return new URL(url, baseUrl).toString();
      } catch {
        return "";
      }
    })
    .filter((url) => url && canonicalSet.has(url))
    .filter((url) => !noindex.has(url))
    .filter((url) => isIndexNowCanonicalHtmlUrl(url, baseUrl));
  return [...new Set(resolved)].sort((a, b) => a.localeCompare(b));
}

async function validateRemoteKey(baseUrl: string, key: string): Promise<string | undefined> {
  const response = await fetch(keyLocation(baseUrl, key), { method: "GET" });
  if (!response.ok) return `key file returned HTTP ${response.status}`;
  const text = await response.text();
  return stripSingleTrailingLf(text) === key ? undefined : "key file body does not match key";
}

async function postWithRetries(payload: IndexNowPayload, maxAttempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      });
      if (!TRANSIENT_STATUS.has(response.status) || attempt === maxAttempts) return response;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function appendBordbuchEvent(
  context: KernelRuntimeContext,
  key: string,
  urls: readonly string[],
): Promise<void> {
  const app = context.site;
  if (!app) return;
  const ledgerPath = join(app.directory, "src", "bordbuch", "events.ndjson");
  if (!(await context.io.exists(ledgerPath))) return;
  const hash = batchHash(urls);
  const appendReport = await executeKernelCommand({
    workspaceRoot: context.workspaceRoot,
    commandName: "bordbuch.append",
    siteName: app.name,
    siteExplicit: true,
    outputFormat: context.outputFormat,
    dryRun: context.dryRun,
    argv: [
      "--system",
      app.name,
      "--kind",
      "indexnow.submit",
      "--summary",
      `Submitted ${urls.length} canonical URL(s) to IndexNow with key ${key}; batch ${"sha" + "256:"}${hash}.`,
      "--actor",
      "agent",
      "--writer-role",
      "runtime",
      "--metadata",
      JSON.stringify({
        status: "done",
        ref: `indexnow:${key},batchHash:${hash},urlCount:${urls.length}`,
      }),
    ],
  });
  const appendResult = Array.isArray(appendReport) ? appendReport[0] : appendReport;
  if ((appendResult.exitCode ?? 0) === 0) {
    await executeKernelCommand({
      workspaceRoot: context.workspaceRoot,
      commandName: "bordbuch.generate",
      siteName: app.name,
      siteExplicit: true,
      outputFormat: context.outputFormat,
      dryRun: context.dryRun,
      argv: ["--system", app.name],
    });
  }
}

export async function runIndexNowKeyGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = await loadPublicContext(context);
  const key = deriveIndexNowKey(app.appId);
  const keyPath = join(app.publicDirectory, `${key}.txt`);

  if (!INDEXNOW_KEY_PATTERN.test(key)) {
    return diagnostics("indexnow.key.generate", [
      {
        severity: "error",
        file: workspaceRel(context, keyPath),
        message: `Derived IndexNow key "${key}" must be 8-128 chars and contain only a-Z, 0-9, or "-".`,
        fixHint: "Use an app id that satisfies the IndexNow key character contract.",
      },
    ]);
  }

  const existing = await readTextIfExists(context, keyPath);
  if (existing === key) {
    return {
      data: { key, file: keyPath },
      exitCode: 0,
      summary: "indexnow.key.generate: unchanged",
    };
  }
  await context.io.mkdir(dirname(keyPath));
  await context.io.writeFile(keyPath, key);
  return {
    data: { key, file: keyPath },
    exitCode: 0,
    summary: context.dryRun
      ? `indexnow.key.generate: dry-run would write ${key}.txt`
      : `indexnow.key.generate: wrote ${key}.txt`,
  };
}

export async function runIndexNowKeyValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const key = deriveIndexNowKey(app.appId);
  const keyPath = join(app.publicDirectory, `${key}.txt`);
  const rel = workspaceRel(context, keyPath);
  const messages: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
    fixHint?: string;
  }> = [];

  if (!INDEXNOW_KEY_PATTERN.test(key)) {
    messages.push({
      severity: "error",
      file: rel,
      message: `Derived IndexNow key "${key}" violates the 8-128 chars / a-Z0-9- contract.`,
      fixHint: "Rename the app id or adjust the accepted key derivation RFC before deploying.",
    });
  }

  if (!(await context.io.exists(keyPath))) {
    messages.push({
      severity: "error",
      file: rel,
      message: `Missing IndexNow key file ${key}.txt.`,
      fixHint: "Run indexnow.key.generate.",
    });
  } else {
    const { body, error } = await readUtf8KeyBody(keyPath);
    const stripped = body === undefined ? null : stripSingleTrailingLf(body);
    if (error) {
      messages.push({
        severity: "error",
        file: rel,
        message: `IndexNow key file must be valid UTF-8: ${error}`,
        fixHint: "Regenerate with indexnow.key.generate.",
      });
    } else if (stripped !== key) {
      messages.push({
        severity: "error",
        file: rel,
        message: `IndexNow key file body must strictly equal "${key}" with at most one trailing LF.`,
        fixHint: "Regenerate with indexnow.key.generate; do not add markers or trailing text.",
      });
    }
  }

  return diagnostics("indexnow.key.validate", messages);
}

export async function runIndexNowSubmit(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = await loadPublicContext(context);
  const baseUrl = asString(input.flags["base-url"]) ?? app.siteUrl;
  if (!baseUrl) {
    return passResult(
      "indexnow.submit",
      "indexnow.submit: skipped (missing --base-url or identity.domain)",
    );
  }

  const keyResult = await runIndexNowKeyValidate(input, context);
  if ((keyResult.exitCode ?? 0) !== 0) return keyResult;

  const key = deriveIndexNowKey(app.appId);
  const host = new URL(baseUrl).host;
  const sitemapPath = join(app.publicDirectory, "sitemap.xml");
  if (!(await context.io.exists(sitemapPath))) {
    return diagnostics("indexnow.submit", [
      {
        severity: "error",
        file: workspaceRel(context, sitemapPath),
        message: "Cannot submit IndexNow without public/sitemap.xml.",
        fixHint: "Run sitemap.generate before indexnow.submit.",
      },
    ]);
  }

  const urlList = await resolveIndexNowUrls(
    input,
    context,
    app.publicDirectory,
    app.appDirectory,
    baseUrl,
  );
  if (urlList.length === 0) {
    return diagnostics("indexnow.submit", [
      {
        severity: "error",
        file: workspaceRel(context, sitemapPath),
        message: `No canonical sitemap page URLs match ${baseUrl}.`,
        fixHint:
          "Pass the canonical deployed --base-url, provide matching --urls, or regenerate sitemap.xml.",
      },
    ]);
  }

  const payloads = buildIndexNowBatches(host, key, baseUrl, urlList);
  if (input.flags["dry-run"] === true || context.dryRun) {
    return {
      data: {
        attempted: urlList.length,
        submitted: 0,
        failed: 0,
        batchCount: payloads.length,
        batchHash: batchHash(urlList),
        key,
        baseUrl,
        payloads,
      },
      exitCode: 0,
      summary: `indexnow.submit: dry-run (${urlList.length} URL(s), ${payloads.length} batch(es))`,
    };
  }

  const keyError = await validateRemoteKey(baseUrl, key);
  if (keyError) {
    return diagnostics("indexnow.submit", [
      {
        severity: "error",
        message: `Deployed IndexNow key is not reachable at ${keyLocation(baseUrl, key)}: ${keyError}.`,
        fixHint:
          "Deploy the generated key file and rerun deploy.surface.parity.validate before submitting.",
      },
    ]);
  }

  const results: IndexNowBatchResult[] = [];
  for (const [index, payload] of payloads.entries()) {
    const response = await postWithRetries(payload);
    const ok = response.status >= 200 && response.status < 300;
    results.push({
      batch: index + 1,
      attempted: payload.urlList.length,
      submitted: ok ? payload.urlList.length : 0,
      failed: ok ? 0 : payload.urlList.length,
      status: response.status,
      statusText: response.statusText,
    });
    if (response.status >= 400 && response.status < 500) break;
  }

  const submitted = results.reduce((sum, result) => sum + result.submitted, 0);
  const failed = urlList.length - submitted;
  if (failed === 0) await appendBordbuchEvent(context, key, urlList);
  return {
    data: {
      attempted: urlList.length,
      submitted,
      failed,
      batchCount: payloads.length,
      batchHash: batchHash(urlList),
      key,
      baseUrl,
      results,
    },
    exitCode: failed === 0 ? 0 : 1,
    summary: `indexnow.submit: attempted ${urlList.length}, submitted ${submitted}, failed ${failed}`,
  };
}

export async function runIndexNowSubmitValidate(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const payloads = buildIndexNowBatches(
    "example.com",
    "demo-indexnow",
    "https://example.com",
    ["https://example.com/", "https://example.com/de/"],
    1,
  );
  const filtered = [
    "https://example.com/",
    "https://example.com/page/",
    "https://example.com/page.md",
    "https://example.com/api/agent/mcp",
    "https://example.com/.well-known/agent.json",
    "https://cdn.example.com/page/",
  ].filter((url) => isIndexNowCanonicalHtmlUrl(url, "https://example.com"));
  const messages = [];
  if (
    payloads.length !== 2 ||
    payloads[0].keyLocation !== "https://example.com/demo-indexnow.txt"
  ) {
    messages.push({
      severity: "error" as const,
      message: "IndexNow payload batching or keyLocation derivation is invalid.",
      fixHint: "Keep keyLocation at <base>/<key>.txt and preserve batch slicing.",
    });
  }
  if (filtered.join("|") !== "https://example.com/|https://example.com/page/") {
    messages.push({
      severity: "error" as const,
      message: "IndexNow URL filtering allowed non-canonical URLs.",
      fixHint:
        "Exclude Markdown twins, API routes, well-known artifacts, static files, and off-site URLs.",
    });
  }
  return diagnostics("indexnow.submit.validate", messages);
}
