import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWarningDiagnosticsLint } from "../warning-diagnostics-lint.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

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

function ctx(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
}

async function setupFixture(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "warning-diagnostics-"));
  const src = join(root, "packages", "os", "site-kernel-checks", "src");
  await mkdir(src, { recursive: true });
  await writeFile(join(src, "sample.ts"), source, "utf8");
  return root;
}

describe("warning.diagnostics.lint (RFC-0247)", () => {
  it("rejects summary-only [warn:...] findings", async () => {
    const root = await setupFixture(`
      import { passResult } from "./result-helpers.ts";
      export function runThing() {
        return passResult("thing.validate", "[warn:missing-credit] hidden debt");
      }
    `);
    const result = await runWarningDiagnosticsLint(input, ctx(root));
    expect(result.exitCode).toBe(1);
    expect(JSON.stringify(result.data)).toContain("WDL-01");
    await rm(root, { recursive: true, force: true });
  });

  it("allows local suppressions for non-actionable warning-like prose", async () => {
    const root = await setupFixture(`
      export const text = [
        // warning-diagnostics-ok: example marker in lint docs, not a command finding
        "[warn:example-only]"
      ];
    `);
    const result = await runWarningDiagnosticsLint(input, ctx(root));
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });
});
