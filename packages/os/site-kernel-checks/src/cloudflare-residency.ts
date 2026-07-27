/*
<MODULE_CONTRACT>
<purpose>RFC-0181: residency guard. Cloudflare Queues and KV cannot be pinned to the EU (Regional
Services excludes non-HTTP triggers; KV has no jurisdiction), so this ecosystem forbids them for lead/
event delivery — EU-resident delivery runs on Upstash QStash + Redis (eu-central-1). This validator
fails any app whose wrangler.jsonc (or a nested workers/<name>/wrangler.jsonc) declares `kv_namespaces` or
`queues` bindings, blocking their reintroduction into deployment.</purpose>
<non-goals>
  <item>Do not block other Cloudflare bindings (ASSETS, Durable Objects with jurisdiction=eu, etc.).</item>
  <item>Do not parse runtime source — the enforceable signal is the wrangler binding declaration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0181: initial Cloudflare KV/Queues residency block.</item>
  <item>RFC-0261: migrate to diagnosticsResult with registered CF-RESIDENCY-01/02 ruleIds and a file locator.</item>
</CHANGE_SUMMARY>
*/

import path, { join, relative } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { diagnosticsResult } from "./result-helpers.ts";

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

/** A top-level `"kv_namespaces":` / `"queues":` key in a wrangler config (JSONC-safe). */
const KV_KEY_RE = /"kv_namespaces"\s*:/;
const QUEUES_KEY_RE = /"queues"\s*:/;

/** Collect the app's wrangler.jsonc + any workers/<name>/wrangler.jsonc. */
async function collectWranglerConfigs(appDir: string): Promise<string[]> {
  const out = [join(appDir, "wrangler.jsonc")];
  const workersDir = join(appDir, "workers");
  let entries;
  try {
    entries = await readdir(workersDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) out.push(join(workersDir, entry.name, "wrangler.jsonc"));
  }
  return out;
}

export async function runCloudflareResidencyValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const diagnostics: Diagnostic[] = [];

  for (const configPath of await collectWranglerConfigs(appDir)) {
    let raw: string;
    try {
      raw = await readFile(configPath, "utf-8");
    } catch {
      continue; // no such config — nothing to check
    }
    const relFile = toPosixPath(relative(context.workspaceRoot, configPath));
    if (KV_KEY_RE.test(raw)) {
      diagnostics.push({
        ruleId: "CF-RESIDENCY-01",
        severity: "error",
        file: relFile,
        message: 'wrangler config declares "kv_namespaces".',
        fixHint:
          "Cloudflare KV cannot be EU-pinned and is forbidden for this ecosystem (RFC-0181). Use the Upstash Redis (EU) idempotency ledger instead (UPSTASH_REDIS_REST_URL).",
      });
    }
    if (QUEUES_KEY_RE.test(raw)) {
      diagnostics.push({
        ruleId: "CF-RESIDENCY-02",
        severity: "error",
        file: relFile,
        message: 'wrangler config declares "queues".',
        fixHint:
          "Cloudflare Queues cannot be EU-pinned (Regional Services excludes non-HTTP triggers) and is forbidden (RFC-0181). Use Upstash QStash (EU) instead (UPSTASH_QSTASH_URL).",
      });
    }
  }

  return diagnosticsResult("cloudflare.residency.validate", diagnostics);
}
