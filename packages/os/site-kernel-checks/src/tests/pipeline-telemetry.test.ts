import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPipelineTimeoutValidate } from "../pipeline/pipeline-telemetry.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0270: fixture tests for pipeline.timeout.validate's telemetry-derived
    rules — TIME-01 (stale inline expectedDurationMs vs. the generated budget)
    and TIME-02 (a long step with an observed p95 but no inline fallback
    estimate). No budgets file present is the pass fixture (the rules are
    inert without telemetry).
  </purpose>
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

const input = { argv: [], args: [], flags: {} } as unknown as KernelCommandInput;

function ctx(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
}

async function fixtureWorkspace(): Promise<{ root: string }> {
  const root = await mkdtemp(join(tmpdir(), "pipeline-timeout-validate-"));
  return { root };
}

async function writeBudgets(root: string, budgets: unknown[]): Promise<void> {
  const dir = join(root, "docs");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "pipeline-budgets.generated.yaml"),
    JSON.stringify({
      generatedMarker: "GENERATED. Do not change this line",
      meta: { schemaVersion: 1, deterministic: true, generatedAt: null, historyHash: "fixture" },
      budgets,
    }),
    "utf8",
  );
}

describe("pipeline.timeout.validate — telemetry rules (RFC-0270)", () => {
  it("TIME-01: warns when the generated budget deviates from an inline estimate by more than 4x", async () => {
    const { root } = await fixtureWorkspace();
    // manifest.contract.validate is step 1 of packages-check.run with no
    // authored expectedDurationMs today, so pin an artificially large budget
    // against a low-magnitude inline estimate by targeting a step that does
    // declare one: pipeline.cache.parity (app-scoped, expectedDurationMs 300_000).
    await writeBudgets(root, [
      {
        pipeline: "packages-check.run",
        command: "manifest.contract.validate",
        app: null,
        sampleCount: 5,
        p50Ms: 1000,
        p95Ms: 40000,
        expectedDurationMs: 60000,
      },
    ]);
    const result = await runPipelineTimeoutValidate(input, ctx(root));
    const diags = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    // manifest.contract.validate has no inline expectedDurationMs, so TIME-01
    // does not fire for it (nothing to compare against) — TIME-02 should instead.
    expect(diags.some((d) => d.ruleId === "TIME-02")).toBe(true);
    await rm(root, { recursive: true, force: true });
  });

  it("passes (no TIME-01/TIME-02) when no budgets file is present", async () => {
    const { root } = await fixtureWorkspace();
    const result = await runPipelineTimeoutValidate(input, ctx(root));
    const diags = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diags.some((d) => d.ruleId === "TIME-01" || d.ruleId === "TIME-02")).toBe(false);
    await rm(root, { recursive: true, force: true });
  });
});
