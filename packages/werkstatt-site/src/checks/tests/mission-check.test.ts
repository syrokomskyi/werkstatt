import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { runMissionCheck } from "../axiom-adapter.ts";
import { makeTestContext, testInput } from "./helpers.ts";

vi.mock("@syrokomskyi/axiom-factory-app/run/axiom-cli", () => ({
  runAxiomCheck: vi.fn(),
  preflightChromium: vi.fn(),
}));

vi.mock("../playwright-chromium-ensure.ts", () => ({
  ensureChromium: vi.fn(async () => {
    return { installed: true, chromiumRevision: "mock-revision", skipped: true };
  }),
}));

// Import after mocks are set up
import { runAxiomCheck } from "@syrokomskyi/axiom-factory-app/run/axiom-cli";
import type { AxiomCheckResult } from "@syrokomskyi/axiom-factory-app/run/axiom-cli";
import { ensureChromium } from "../playwright-chromium-ensure.ts";

function makeAxiomCheckResult(overrides?: Partial<AxiomCheckResult>): AxiomCheckResult {
  return {
    command: "axiom.check",
    status: "pass",
    exitCode: 0,
    auditId: "test-mission",
    studyRunId: "study-run_mock",
    findingsCount: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    findings: { errors: 0, warnings: 0, total: 0 },
    closureDecision: {
      satisfied: true,
      status: "seal_allowed",
      reason: "All required evidence capabilities completed.",
    },
    methodologyResults: [],
    evidenceFiles: [],
    cacheHits: [],
    cacheMisses: 0,
    durationMs: 1000,
    ...overrides,
  };
}

async function createMockMission(
  workspaceRoot: string,
  missionId: string,
  options?: { withI18n?: boolean },
): Promise<string> {
  const missionDir = join(workspaceRoot, "missions", missionId);
  await mkdir(join(missionDir, "evidence"), { recursive: true });
  await writeFile(
    join(missionDir, "mission.yaml"),
    `missionId: ${missionId}\nsystemId: test-system\nstate: open\noperationId: op-1\n`,
    "utf-8",
  );
  if (options?.withI18n) {
    const contentDir = join(missionDir, "workpiece", "src", "content");
    await mkdir(contentDir, { recursive: true });
    await writeFile(
      join(contentDir, "system.md"),
      `---\ni18n:\n  default: de\n  supported:\n    de:\n      name: Deutsch\n      hreflang: de-DE\n    uk:\n      name: Українська\n      hreflang: uk-UA\n---\n\n# System\n`,
      "utf-8",
    );
  }
  return missionDir;
}

describe("mission.check (axiom-adapter)", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "mission-check-test-"));
    vi.mocked(runAxiomCheck).mockClear();
    vi.mocked(runAxiomCheck).mockResolvedValue(makeAxiomCheckResult());
    vi.mocked(ensureChromium).mockClear();
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("throws when --mission is missing", async () => {
    await expect(runMissionCheck(testInput(), makeTestContext(workspaceRoot))).rejects.toThrow(
      "mission",
    );
  });

  it("throws when --external-preview is not set (local mode removed)", async () => {
    const missionId = "test-m000001";
    await createMockMission(workspaceRoot, missionId);

    await expect(
      runMissionCheck({ flags: { mission: missionId }, argv: [] }, makeTestContext(workspaceRoot)),
    ).rejects.toThrow("--external-preview");
  });

  it("throws when --external-preview is set without --base-url", async () => {
    const missionId = "test-m000002";
    await createMockMission(workspaceRoot, missionId);

    await expect(
      runMissionCheck(
        { flags: { mission: missionId, "external-preview": true }, argv: [] },
        makeTestContext(workspaceRoot),
      ),
    ).rejects.toThrow("base-url");
  });

  it("passes commitSha to runAxiomCheck and maps result to exitCode 0", async () => {
    const missionId = "test-m000003";
    await createMockMission(workspaceRoot, missionId);

    const result = await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
          "commit-sha": "abc123def456",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    expect(runAxiomCheck).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(runAxiomCheck).mock.calls[0]![0];
    expect(callArgs.commitSha).toBe("abc123def456");
    expect(callArgs.baseUrl).toBe("http://example.com");
    expect(callArgs.auditId).toBe(missionId);
    expect(callArgs.report).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("does not pass commitSha when flag is absent", async () => {
    const missionId = "test-m000004";
    await createMockMission(workspaceRoot, missionId);

    await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    const callArgs = vi.mocked(runAxiomCheck).mock.calls[0]![0];
    expect(callArgs.commitSha).toBeUndefined();
  });

  it("passes when no blocking findings and closure is satisfied", async () => {
    const missionId = "test-m000005";
    await createMockMission(workspaceRoot, missionId);

    vi.mocked(runAxiomCheck).mockResolvedValue(
      makeAxiomCheckResult({
        status: "pass",
        exitCode: 0,
        findingsCount: { critical: 0, high: 0, medium: 0, low: 1, info: 0 },
        findings: { errors: 0, warnings: 1, total: 1 },
      }),
    );

    const result = await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    expect(result.data?.status).toBe("pass");
    expect(result.data?.findingsCount.low).toBe(1);
    expect(result.data?.findings.total).toBe(1);
    expect(result.data?.findings.warnings).toBe(1);
    expect(result.data?.findings.errors).toBe(0);
  });

  it("fails when high severity findings are present", async () => {
    const missionId = "test-m000006";
    await createMockMission(workspaceRoot, missionId);

    vi.mocked(runAxiomCheck).mockResolvedValue(
      makeAxiomCheckResult({
        status: "fail",
        exitCode: 1,
        findingsCount: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
        findings: { errors: 1, warnings: 0, total: 1 },
      }),
    );

    const result = await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    expect(result.data?.status).toBe("fail");
    expect(result.exitCode).toBe(1);
    expect(result.data?.findingsCount.high).toBe(1);
    expect(result.data?.findings.errors).toBe(1);
  });

  it("fails when closure decision is not satisfied", async () => {
    const missionId = "test-m000007";
    await createMockMission(workspaceRoot, missionId);

    vi.mocked(runAxiomCheck).mockResolvedValue(
      makeAxiomCheckResult({
        status: "fail",
        exitCode: 1,
        closureDecision: {
          satisfied: false,
          status: "blocked",
          reason: "Required evidence capabilities are blocked or missing.",
        },
      }),
    );

    const result = await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    expect(result.data?.status).toBe("fail");
    expect(result.exitCode).toBe(1);
    expect(result.data?.closureDecision.satisfied).toBe(false);
    expect(result.summary).toContain("closure blocked");
  });

  it("returns exit code 2 when runAxiomCheck throws (infrastructure error)", async () => {
    const missionId = "test-m000009";
    await createMockMission(workspaceRoot, missionId);

    vi.mocked(runAxiomCheck).mockRejectedValue(new Error("chromium not installed"));

    const result = await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(2);
    expect(result.summary).toContain("chromium not installed");
  });

  // --locales flag validation
  it("returns exit code 2 when --locales format is invalid", async () => {
    const missionId = "test-m000011";
    await createMockMission(workspaceRoot, missionId);

    const result = await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
          locales: "invalid",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(2);
    expect(result.summary).toContain("Invalid --locales format");
  });

  it("accepts valid --locales flag with BCP 47 tags", async () => {
    const missionId = "test-m000012";
    await createMockMission(workspaceRoot, missionId);

    const result = await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
          locales: "de-DE,uk-UA",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(0);
  });

  it("passes locales from i18n config to runAxiomCheck", async () => {
    const missionId = "test-m000013";
    await createMockMission(workspaceRoot, missionId, { withI18n: true });

    await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    expect(runAxiomCheck).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(runAxiomCheck).mock.calls[0]![0];
    expect(callArgs.locales).toContain("de-DE");
    expect(callArgs.locales).toContain("uk-UA");
  });

  it("falls back to en-US when workpiece has no i18n config", async () => {
    const missionId = "test-m000014";
    await createMockMission(workspaceRoot, missionId);

    await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    expect(runAxiomCheck).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(runAxiomCheck).mock.calls[0]![0];
    expect(callArgs.locales).toEqual(["en-US"]);
  });

  it("passes explicit --locales override to runAxiomCheck", async () => {
    const missionId = "test-m000015";
    await createMockMission(workspaceRoot, missionId, { withI18n: true });

    await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
          locales: "fr-FR",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    expect(runAxiomCheck).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(runAxiomCheck).mock.calls[0]![0];
    expect(callArgs.locales).toEqual(["fr-FR"]);
  });

  // RFC-0668: Chromium pre-flight check via ensureChromium
  it("calls ensureChromium before runAxiomCheck (RFC-0668 pre-flight)", async () => {
    const missionId = "test-m000020";
    await createMockMission(workspaceRoot, missionId);

    await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    expect(ensureChromium).toHaveBeenCalledTimes(1);
    expect(runAxiomCheck).toHaveBeenCalledTimes(1);
  });

  it("returns exit code 2 when ensureChromium throws (RFC-0668 pre-flight failure)", async () => {
    const missionId = "test-m000021";
    await createMockMission(workspaceRoot, missionId);

    vi.mocked(ensureChromium).mockRejectedValue(new Error("chromium install failed"));

    const result = await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(2);
    expect(result.summary).toContain("chromium install failed");
    expect(runAxiomCheck).not.toHaveBeenCalled();
  });
});
