import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCloudflareResidencyValidate } from "../cloudflare-residency.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0261: red/green fixture coverage for cloudflare.residency.validate (CF-RESIDENCY-01/02).</purpose>
</MODULE_CONTRACT>
*/

const logger = {
  section() {},
  info() {},
  warn() {},
  error() {},
  success() {},
  getEvents() {
    return [];
  },
};

const input = { argv: [], flags: {} } as unknown as KernelCommandInput;

async function fixtureContext(
  wranglerJsonc: string,
): Promise<{ root: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "cf-residency-"));
  const appDir = join(root, "apps", "demo");
  await mkdir(appDir, { recursive: true });
  await writeFile(join(appDir, "wrangler.jsonc"), wranglerJsonc, "utf8");
  const context = {
    workspaceRoot: root,
    site: { name: "demo", directory: appDir, toolsDirectory: join(appDir, "tools") },
    siteExplicit: true,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
  return { root, context };
}

describe("cloudflare.residency.validate (RFC-0181/RFC-0261)", () => {
  it("CF-RESIDENCY-01/02: fails when wrangler.jsonc declares kv_namespaces or queues", async () => {
    const { root, context } = await fixtureContext(
      `{ "kv_namespaces": [{ "binding": "KV" }], "queues": { "producers": [] } }`,
    );
    const result = await runCloudflareResidencyValidate(input, context);
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("CF-RESIDENCY-01");
    expect(ruleIds).toContain("CF-RESIDENCY-02");
    await rm(root, { recursive: true, force: true });
  });

  it("passes a wrangler.jsonc with no kv_namespaces/queues bindings", async () => {
    const { root, context } = await fixtureContext(
      `{ "name": "demo", "compatibility_date": "2026-01-01" }`,
    );
    const result = await runCloudflareResidencyValidate(input, context);
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });
});
