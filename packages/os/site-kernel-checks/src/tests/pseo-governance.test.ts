import { describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KernelCommandInput, KernelRuntimeContext } from "@gogol/site-kernel";
import {
  runAutonomyLevelValidate,
  runAutonomyPromote,
  runEscalationBudgetValidate,
  runSurfaceReviewValidate,
} from "../pseo/pseo-governance.ts";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0278/RFC-0279/RFC-0285 regression coverage for governance gates.</purpose>
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

function input(flags: Record<string, unknown> = {}): KernelCommandInput {
  return { argv: [], args: [], flags } as unknown as KernelCommandInput;
}

async function fixture(): Promise<{ root: string; appDir: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "pseo-governance-"));
  const appDir = join(root, "apps", "demo");
  await mkdir(join(appDir, "src", "content"), { recursive: true });
  await writeFile(
    join(appDir, "src", "content", "system.md"),
    `---
app: demo
version: 1.0.0
i18n: { default: de, supported: { de: {} } }
surface:
  modules:
    pseo:
      entitlement: pseo
      blueprints: [website-local]
      masterLocale: de
      publishedLocales: []
      autonomy:
        scopes:
          - { fieldClass: narrative, locale: de, level: L0, ceiling: L4, sinceAt: "2026-07-03T00:00:00.000Z", evidenceRef: initial:test }
---
`,
    "utf8",
  );
  return {
    root,
    appDir,
    context: {
      workspaceRoot: root,
      site: { name: "demo", directory: appDir, toolsDirectory: join(appDir, "tools") },
      dryRun: false,
      logger,
    } as unknown as KernelRuntimeContext,
  };
}

describe("PSEO governance (RFC-0278/RFC-0279/RFC-0285)", () => {
  it("refuses autonomy promotion without calibration evidence", async () => {
    const { root, context } = await fixture();
    try {
      expect((await runAutonomyLevelValidate(input(), context)).exitCode).toBe(0);
      const promoted = await runAutonomyPromote(
        input({ scope: "pseo/narrative/de", to: "L2" }),
        context,
      );
      expect(promoted.exitCode).toBe(1);
      expect(promoted.summary).toContain("insufficient");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects self-review verdicts", async () => {
    const { root, appDir, context } = await fixture();
    try {
      await mkdir(join(appDir, "src", "surface"), { recursive: true });
      await writeFile(
        join(appDir, "src", "surface", "review.log.ndjson"),
        `${JSON.stringify({
          artifactRef: "artifact:test",
          reviewer: { modelId: "same", promptId: "same", version: "v1" },
          generator: { modelId: "same", promptId: "same" },
          decision: "approve",
          confidence: 0.99,
          checks: [{ id: "grounding", pass: true }],
          groundingViolations: [],
          samples: 1,
          reviewedAt: "2026-07-03T00:00:00.000Z",
        })}\n`,
        "utf8",
      );
      const result = await runSurfaceReviewValidate(input(), context);
      expect(result.exitCode).toBe(1);
      expect(result.data?.diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain("REV-01");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires feedback on resolved escalations", async () => {
    const { root, appDir, context } = await fixture();
    try {
      await mkdir(join(appDir, "src", "surface"), { recursive: true });
      await writeFile(
        join(appDir, "src", "surface", "escalations.ndjson"),
        `${JSON.stringify({
          id: "esc-000001",
          scope: "pseo/narrative/de",
          reason: "low-reviewer-confidence",
          openedAt: "2026-07-03T00:00:00.000Z",
          resolvedAt: "2026-07-03T00:10:00.000Z",
          resolvedBy: { kind: "human", handle: "operator" },
          verdict: "approve",
          minutesSpent: 10,
          feedback: {},
        })}\n`,
        "utf8",
      );
      const result = await runEscalationBudgetValidate(input(), context);
      expect(result.exitCode).toBe(1);
      expect(result.data?.diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain("ESC-02");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
