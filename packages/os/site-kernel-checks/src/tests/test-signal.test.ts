import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { runTestSignalValidate } from "../test-signal.ts";

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

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("test.signal.validate diagnostics", () => {
  it("does not double-punctuate skipped-test rationale messages", async () => {
    const root = await mkdtemp(join(tmpdir(), "test-signal-"));
    try {
      await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
      await mkdir(join(root, "packages", "example"), { recursive: true });
      await writeJson(join(root, "packages", "example", "package.json"), {
        name: "@warpgogol/example",
        gogol: {
          testSignal: {
            signal: "skipped",
            owner: "architecture",
            rationale: "Covered by a higher-level fixture.",
            reviewAfter: "2026-10-01",
          },
        },
      });

      const result = await runTestSignalValidate(input, ctx(root));
      expect(result.exitCode).toBe(0);
      expect(result.data?.diagnostics[0]?.message).toBe(
        "@warpgogol/example test signal is skipped: Covered by a higher-level fixture.",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
