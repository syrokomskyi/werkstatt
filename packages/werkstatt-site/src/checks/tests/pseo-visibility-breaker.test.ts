import { describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { runVisibilityActionPlan, runVisibilityImport } from "../pseo/pseo-visibility.ts";
import { runSurfaceRollbackApply } from "../surface-breaker.ts";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0282/RFC-0283 regression coverage for visibility and breaker safety gates.</purpose>
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
  return { argv: [], flags } as unknown as KernelCommandInput;
}

async function fixture(): Promise<{ root: string; appDir: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "pseo-visibility-"));
  const appDir = join(root, "apps", "demo");
  await mkdir(join(appDir, "src", "surface"), { recursive: true });
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

describe("PSEO visibility and breaker gates (RFC-0282/RFC-0283)", () => {
  it("rejects visibility imports with per-user or PII-like rows", async () => {
    const { root, context } = await fixture();
    try {
      const exportPath = join(root, "gsc.json");
      await writeFile(
        exportPath,
        JSON.stringify([
          {
            clusterId: "website-local|d5|city:stuttgart",
            windowStart: "2026-06-01T00:00:00.000Z",
            windowEnd: "2026-06-28T00:00:00.000Z",
            indexedPages: 1,
            eligiblePages: 1,
            impressions: 10,
            clicks: 0,
            uniqueQueries: 1,
            userId: "person@example.com",
          },
        ]),
        "utf8",
      );
      const result = await runVisibilityImport(
        input({ input: "gsc.json", source: "gsc" }),
        context,
      );
      expect(result.exitCode).toBe(1);
      expect(result.data?.diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain("VIS-05");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("blocks enrich actions without positive demand", async () => {
    const { root, appDir, context } = await fixture();
    try {
      await mkdir(join(appDir, "src", "surface", "visibility"), { recursive: true });
      await writeFile(
        join(appDir, "src", "surface", "visibility", "outcomes.generated.yaml"),
        `${JSON.stringify(
          {
            generatedMarker:
              "GENERATED. Do not change this line unless the file contains project specific changes.",
            generatedAt: null,
            policy: {},
            outcomes: [
              {
                clusterId: "website-local|d5|city:stuttgart",
                surfaceId: "website-local",
                depth: 5,
                eligiblePages: 1,
                indexedPages: 1,
                impressions: 10,
                clicks: 0,
                uniqueQueries: 1,
                indexationRate: 1,
                medianImpressionsPerPage: 10,
                queryDiversityShare: 1,
                positiveDemand: false,
                anomalies: [],
                proposedAction: "enrich",
                rationale: "bad fixture",
              },
            ],
            demandCorrections: [],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      const result = await runVisibilityActionPlan(input(), context);
      expect(result.exitCode).toBe(1);
      expect(result.data?.diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain("VIS-03");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("blocks rollback plans that delete published URLs", async () => {
    const { root, appDir, context } = await fixture();
    try {
      await mkdir(join(appDir, "src", "surface", "states"), { recursive: true });
      await writeFile(
        join(appDir, "src", "surface", "states", "surface-good.state.yaml"),
        `${yamlStringify({
          id: "surface-good",
          app: "demo",
          createdAt: "2026-07-03T00:00:00.000Z",
          status: "lastKnownGood",
          pageCount: 1,
          indexableCount: 1,
          artifactHash: "sha256:abc",
          manifestHash: "sha256:def",
        })}\n`,
        "utf8",
      );
      await writeFile(
        join(appDir, "src", "surface", "states", "pointer.yaml"),
        `${yamlStringify({ current: "surface-bad", lastKnownGood: "surface-good" })}\n`,
        "utf8",
      );
      await writeFile(
        join(appDir, "src", "surface", "rollback-plan.generated.yaml"),
        `${JSON.stringify({
          generatedMarker:
            "GENERATED. Do not change this line unless the file contains project specific changes.",
          generatedAt: null,
          to: "surface-good",
          operations: [{ kind: "delete", target: "/bad-url/", reason: "bad fixture" }],
        })}\n`,
        "utf8",
      );
      const result = await runSurfaceRollbackApply(input(), context);
      expect(result.exitCode).toBe(1);
      expect(result.data?.diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain("BRK-03");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
