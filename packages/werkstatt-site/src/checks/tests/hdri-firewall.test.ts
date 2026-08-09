import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHdriFirewallValidate } from "../hdri-firewall.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0261: red/green fixture coverage for hdri.firewall.validate (HDRI-01/02).</purpose>
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

async function fixtureContext(): Promise<{
  root: string;
  appDir: string;
  context: KernelRuntimeContext;
}> {
  const root = await mkdtemp(join(tmpdir(), "hdri-firewall-"));
  const appDir = join(root, "apps", "demo");
  await mkdir(join(appDir, "src", "content"), { recursive: true });
  const context = {
    workspaceRoot: root,
    site: { name: "demo", directory: appDir, toolsDirectory: join(appDir, "tools") },
    siteExplicit: true,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
  return { root, appDir, context };
}

describe("hdri.firewall.validate (RFC-0241/RFC-0261)", () => {
  it("HDRI-01: fails on an HDRI ownership/branding signal", async () => {
    const { root, appDir, context } = await fixtureContext();
    await writeFile(
      join(appDir, "src", "content", "page.md"),
      "This is our HDRI methodology.",
      "utf8",
    );
    const result = await runHdriFirewallValidate(input, context);
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("HDRI-01");
    await rm(root, { recursive: true, force: true });
  });

  it("HDRI-02: fails on an HDRI-sourced claim missing provenance/validity", async () => {
    const { root, appDir, context } = await fixtureContext();
    await writeFile(
      join(appDir, "src", "content", "page.claims.yaml"),
      "score:\n  sourceRef: external:hdri\n  provenance: generated\n",
      "utf8",
    );
    const result = await runHdriFirewallValidate(input, context);
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("HDRI-02");
    await rm(root, { recursive: true, force: true });
  });

  it("passes content with no ownership signals and a properly provenanced HDRI claim", async () => {
    const { root, appDir, context } = await fixtureContext();
    await writeFile(
      join(appDir, "src", "content", "page.md"),
      "According to the HDRI index...",
      "utf8",
    );
    await writeFile(
      join(appDir, "src", "content", "page.claims.yaml"),
      'score:\n  sourceRef: external:hdri\n  provenance: external\n  validity:\n    asOf: "2026-01-01"\n',
      "utf8",
    );
    const result = await runHdriFirewallValidate(input, context);
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });
});
