/*
<MODULE_CONTRACT>
<purpose>
  Unit tests for RFC-0650 runTimestamp behavior in mission.check. Verifies
  auto-generation, explicit --run-timestamp override, invalid format rejection,
  and that runTimestamp is always present in evidence-metadata.json.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial: 4 test cases covering runTimestamp auto-generation, explicit override, invalid format rejection, and always-present invariant.</item>
</CHANGE_SUMMARY>
*/
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { runMissionCheck } from "../axiom-adapter.ts";
import { makeTestContext } from "./helpers.ts";

vi.mock("@syrokomskyi/axiom-factory-app/run/axiom-cli", () => ({
  runAxiomCheck: vi.fn(),
  preflightChromium: vi.fn(),
}));

import { runAxiomCheck } from "@syrokomskyi/axiom-factory-app/run/axiom-cli";
import type { AxiomCheckResult } from "@syrokomskyi/axiom-factory-app/run/axiom-cli";

function makeAxiomCheckResult(): AxiomCheckResult {
  return {
    command: "axiom.check",
    status: "pass",
    exitCode: 0,
    missionId: "test-mission",
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
    cacheHits: 0,
    cacheMisses: 0,
    durationMs: 1000,
  };
}

async function createMockMission(workspaceRoot: string, missionId: string): Promise<string> {
  const missionDir = join(workspaceRoot, "missions", missionId);
  await mkdir(join(missionDir, "evidence"), { recursive: true });
  await writeFile(
    join(missionDir, "mission.yaml"),
    `missionId: ${missionId}\nsystemId: test-system\nstate: open\noperationId: op-1\n`,
    "utf-8",
  );
  return missionDir;
}

const tsPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;

describe("mission.check RFC-0650 — runTimestamp", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "mission-check-rfc-0650-"));
    vi.mocked(runAxiomCheck).mockClear();
    vi.mocked(runAxiomCheck).mockResolvedValue(makeAxiomCheckResult());
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("auto-generates runTimestamp when --run-timestamp is not provided", async () => {
    const missionId = "test-m000001";
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
    expect(callArgs.runTimestamp).toBeDefined();
    expect(tsPattern.test(callArgs.runTimestamp!)).toBe(true);
  });

  it("uses explicit --run-timestamp value when provided", async () => {
    const missionId = "test-m000002";
    await createMockMission(workspaceRoot, missionId);
    const explicitTs = "2026-08-02T13-46-00-000Z";

    await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
          "run-timestamp": explicitTs,
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    const callArgs = vi.mocked(runAxiomCheck).mock.calls[0]![0];
    expect(callArgs.runTimestamp).toBe(explicitTs);
  });

  it("returns exit code 1 for invalid --run-timestamp format", async () => {
    const missionId = "test-m000003";
    await createMockMission(workspaceRoot, missionId);

    const result = await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
          "run-timestamp": "2026-08-02T13:46:00.000Z",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(1);
    expect(result.summary).toContain("Invalid --run-timestamp format");
  });

  it("runTimestamp is always present (not optional) in runAxiomCheck call", async () => {
    const missionId = "test-m000004";
    await createMockMission(workspaceRoot, missionId);

    await runMissionCheck(
      {
        flags: {
          mission: missionId,
          "external-preview": true,
          "base-url": "http://example.com",
          "commit-sha": "abc123",
        },
        argv: [],
      },
      makeTestContext(workspaceRoot),
    );

    const callArgs = vi.mocked(runAxiomCheck).mock.calls[0]![0];
    expect(callArgs.runTimestamp).toBeDefined();
    expect(typeof callArgs.runTimestamp).toBe("string");
    expect(callArgs.commitSha).toBe("abc123");
  });
});
