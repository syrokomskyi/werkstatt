/*
<MODULE_CONTRACT>
<purpose>RFC-0364: Lightweight hashing primitives — byte hashing and stable JSON hashing. No parser dependencies.</purpose>
<non-goals>
  <item>Do not implement file-type normalizers — those live in normalizers/.</item>
  <item>Do not implement tree fingerprinting — that lives in fingerprint.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Split from fingerprint.ts: byteHash, stableStringify, stableJsonHash moved here so primitive consumers do not transitively load parser packages.</item>
</CHANGE_SUMMARY>
*/

import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

export function byteHash(bytes: Uint8Array | string): string {
  const input = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes;
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

export async function byteHashFile(absPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(absPath);
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk as Buffer));
    stream.on("error", reject);
    stream.on("end", () => {
      const buf = Buffer.concat(chunks);
      resolve(byteHash(buf));
    });
  });
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortForJson(nested)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortForJson(value));
}

export function stableJsonHash(value: unknown): string {
  return byteHash(stableStringify(value));
}
