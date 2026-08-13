import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDiagnosticShapeLint } from "../diagnostic-shape-lint.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0261: fixture tests for diagnostic.shape.lint's DSL-04 shim-usage
    ratchet — baseline-listed module passes, new offender fails, baseline
    growth is never silently accepted (regenerated only via --write-baseline).
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

const CHECKS_SRC = ["packages", "werkstatt-site", "src", "checks"];
const BASELINE_REL = [...CHECKS_SRC, "diagnostics", "dsl04-baseline.generated.yaml"];

function ctx(
  root: string,
  flags: Record<string, unknown> = {},
): {
  input: KernelCommandInput;
  context: KernelRuntimeContext;
} {
  return {
    input: { argv: [], flags } as unknown as KernelCommandInput,
    context: {
      workspaceRoot: root,
      siteExplicit: false,
      logger,
      dryRun: false,
      outputFormat: "json",
    } as unknown as KernelRuntimeContext,
  };
}

async function setupFixture(shimModuleSource: string, baselineFiles: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dsl04-"));
  const srcDir = join(root, ...CHECKS_SRC);
  const diagnosticsDir = join(root, ...CHECKS_SRC, "diagnostics");
  await mkdir(srcDir, { recursive: true });
  await mkdir(diagnosticsDir, { recursive: true });
  await writeFile(join(srcDir, "sample.ts"), shimModuleSource, "utf8");
  await writeFile(
    join(root, ...BASELINE_REL),
    JSON.stringify({
      generatedMarker: "GENERATED. Do not change this line.",
      rule: "DSL-04",
      files: baselineFiles,
    }),
    "utf8",
  );
  return root;
}

const SHIM_SOURCE = `
  import { resultFromViolations } from "./result-helpers.ts";
  export function runSample() {
    return resultFromViolations("sample.validate", []);
  }
`;

describe("diagnostic.shape.lint DSL-04 (RFC-0261)", () => {
  it("passes when the shim-using module is listed in the baseline", async () => {
    const root = await setupFixture(SHIM_SOURCE, ["packages/werkstatt-site/src/checks/sample.ts"]);
    const { input, context } = ctx(root);
    const result = await runDiagnosticShapeLint(input, context);
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });

  it("DSL-04: fails when a new offending module is not in the baseline", async () => {
    const root = await setupFixture(SHIM_SOURCE, []);
    const { input, context } = ctx(root);
    const result = await runDiagnosticShapeLint(input, context);
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("DSL-04");
    await rm(root, { recursive: true, force: true });
  });

  it("--write-baseline regenerates the baseline to exactly the current offender set", async () => {
    const root = await setupFixture(SHIM_SOURCE, []);
    const { input, context } = ctx(root, { "write-baseline": true });
    const result = await runDiagnosticShapeLint(input, context);
    expect(result.exitCode ?? 0).toBe(0);

    const { input: input2, context: context2 } = ctx(root);
    const validated = await runDiagnosticShapeLint(input2, context2);
    expect(validated.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });
});
