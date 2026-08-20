import { describe, it, expect } from "vitest";
import { runKnowledgeMaterializeHook } from "../hooks/materialize.ts";
import { runKnowledgeBuildHook } from "../hooks/build.ts";
import { runKnowledgeCheckGate } from "../hooks/check-gate.ts";
import { runKnowledgeReleaseEvidenceHook } from "../hooks/release-evidence.ts";

function makeCtx(projectPath: string) {
  return {
    workspaceRoot: projectPath,
    workpiecePath: projectPath,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
}

const WS = "/tmp/test-workspace";

describe("runKnowledgeMaterializeHook", () => {
  it("returns success when materialize command succeeds", async () => {
    const result = await runKnowledgeMaterializeHook(makeCtx(WS));
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("prefers workpiecePath over workspaceRoot", async () => {
    const ctx = {
      workspaceRoot: "/tmp/other",
      workpiecePath: WS,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await runKnowledgeMaterializeHook(ctx);
    expect(result.success).toBe(true);
  });
});

describe("runKnowledgeBuildHook", () => {
  it("returns success when projection build succeeds", async () => {
    const result = await runKnowledgeBuildHook(makeCtx(WS));
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});

describe("runKnowledgeCheckGate", () => {
  it("returns success when all validators pass (stubs return exitCode 0)", async () => {
    const result = await runKnowledgeCheckGate(makeCtx(WS));
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("runs all 7 validators", async () => {
    const infoCalls: string[] = [];
    const ctx = {
      workspaceRoot: WS,
      workpiecePath: WS,
      logger: {
        info: (msg: string) => infoCalls.push(msg),
        warn: () => {},
        error: () => {},
      },
    };
    const result = await runKnowledgeCheckGate(ctx);
    expect(result.success).toBe(true);
    expect(infoCalls).toHaveLength(1);
    expect(infoCalls[0]).toContain("checkGate:");
    expect(infoCalls[0]).toContain("source=");
    expect(infoCalls[0]).toContain("verify=");
    expect(infoCalls[0]).toContain("audit=");
    expect(infoCalls[0]).toContain("coverage=");
    expect(infoCalls[0]).toContain("materialize=");
    expect(infoCalls[0]).toContain("release=");
  });
});

describe("runKnowledgeReleaseEvidenceHook", () => {
  it("returns success when release evidence command succeeds", async () => {
    const result = await runKnowledgeReleaseEvidenceHook(makeCtx(WS));
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});
