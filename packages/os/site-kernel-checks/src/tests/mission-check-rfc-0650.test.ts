import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { runMissionCheck } from "../mission-check.ts";
import { makeTestContext, testInput } from "./helpers.ts";

const mockDigestRef = {
  digest: "sha256:mock-digest",
  algorithm: "sha256" as const,
  size: 42,
  mediaType: "application/json",
};
const mockArtifactRef = {
  artifactId: "axiom_artifact_mock",
  rootDigest: mockDigestRef,
  schema: "local-evidence-capsule@1" as const,
};

vi.mock("@syrokomskyi/axiom-contracts", () => ({
  mintAxiomId: vi.fn(() => "axiom_id_mock"),
}));

vi.mock("@syrokomskyi/axiom-provenance", () => ({
  createCanonicalJsonDigestRef: vi.fn(() => mockDigestRef),
}));

vi.mock("@syrokomskyi/axiom-capture", () => {
  const identitySchema = { parse: (v: unknown) => v };
  return {
    PlaywrightEvidenceDriver: vi.fn().mockImplementation(function () {
      return {
        capture: vi.fn().mockResolvedValue({
          receipt: {
            schema: "browser-receipt@1",
            taskKey: "mock-task-key",
            state: "complete",
            finalUrl: "http://example.com/",
            statusCode: 200,
            htmlDigest: mockDigestRef,
            screenshotDigest: mockDigestRef,
            domSnapshotDigest: mockDigestRef,
            accessibilityTreeDigest: mockDigestRef,
            axeDigest: mockDigestRef,
            diagnostics: [],
          },
          evidence: [
            {
              role: "axe-raw-result",
              mediaType: "application/json",
              bytes: new TextEncoder().encode(
                JSON.stringify({ violations: [], incomplete: [], passes: [] }),
              ),
              digest: mockDigestRef,
            },
          ],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
    }),
    CrawleeDiscoveryExecutor: vi.fn().mockImplementation(function () {
      return {
        discover: vi.fn().mockResolvedValue({
          records: [{ normalizedUrl: "http://example.com/", depth: 0, discoveredFrom: null }],
          omissions: [],
          reachedFixpoint: true,
        }),
      };
    }),
    captureContractSchema: identitySchema,
    contractDigest: vi.fn(() => mockDigestRef),
    evaluateClosure: vi.fn(() => ({
      schema: "closure-decision@1",
      status: "seal_allowed",
      satisfied: true,
      missingCapabilities: [],
      partialCapabilities: [],
      blockedCapabilities: [],
      reason: "All required evidence capabilities completed.",
    })),
    capabilityManifestSchema: identitySchema,
    capabilityReceiptSchema: identitySchema,
    runtimeAttestationSchema: identitySchema,
    archiveReceiptSchema: identitySchema,
    replayReceiptSchema: identitySchema,
    stagedCapsuleSchema: identitySchema,
  };
});

vi.mock("@syrokomskyi/axiom-study", () => {
  const identitySchema = { parse: (v: unknown) => v };
  return {
    runAccessibilityInstrument: vi.fn(() => ({
      instrumentRun: {
        instrumentRunId: "instrument-run_mock",
        instrumentId: "accessibility-axe",
        instrumentVersion: "1.0.0",
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:01.000Z",
        state: "complete",
        context: {},
        observations: [],
      },
      bundle: {
        bundleId: "observation-bundle_mock",
        observations: [
          {
            observationId: "obs_mock",
            instrumentRunId: "instrument-run_mock",
            subjectId: "http://example.com/",
            predicate: "accessibility.axe.violation",
            value: {},
            evidence: [],
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        rootDigest: mockDigestRef,
      },
    })),
    toDeterministicContext: vi.fn(() => ({
      capsuleRef: mockArtifactRef,
      producer: { producerId: "local-dev", name: "mission.check", version: "1.0.0" },
      recordedAt: "2026-01-01T00:00:00.000Z",
      validTimeStart: "2026-01-01T00:00:00.000Z",
      environment: {},
    })),
    studyRunSchema: identitySchema,
  };
});

vi.mock("@syrokomskyi/axiom-methodology", () => ({
  createAutomatedWebAccessibilityMethodology: vi.fn(() => ({
    schema: "methodology-package@1",
    methodologyId: "automated-web-accessibility",
    semver: "1.0.0",
    maturity: "VALIDATED",
    authors: [],
    licenses: [],
    researchQuestion: "test",
    nonClaims: [],
    types: [],
    unitsOfAnalysis: [],
    applicability: { jurisdictions: [], languages: [], archetypes: [], exclusions: [] },
    evidenceRequirements: [],
    dependencies: [],
    limitations: [],
    digest: mockDigestRef,
  })),
  findingsForObservation: vi.fn(() => []),
  methodologyPackageDigest: vi.fn(() => mockDigestRef),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      version: vi.fn().mockReturnValue("131.0.6778.87"),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execSync: vi.fn().mockImplementation(() => {
      throw new Error("mocked: install not available in test");
    }),
  };
});

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

    const evidenceDir = join(workspaceRoot, "missions", missionId, "evidence", "axiom");
    const metadata = JSON.parse(
      await readFile(join(evidenceDir, "evidence-metadata.json"), "utf-8"),
    );
    expect(metadata.runTimestamp).toBeDefined();
    expect(tsPattern.test(metadata.runTimestamp)).toBe(true);
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

    const evidenceDir = join(workspaceRoot, "missions", missionId, "evidence", "axiom");
    const metadata = JSON.parse(
      await readFile(join(evidenceDir, "evidence-metadata.json"), "utf-8"),
    );
    expect(metadata.runTimestamp).toBe(explicitTs);
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

  it("runTimestamp is always present (not optional) in evidence-metadata.json", async () => {
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

    const evidenceDir = join(workspaceRoot, "missions", missionId, "evidence", "axiom");
    const metadata = JSON.parse(
      await readFile(join(evidenceDir, "evidence-metadata.json"), "utf-8"),
    );
    expect(metadata.runTimestamp).toBeDefined();
    expect(typeof metadata.runTimestamp).toBe("string");
    expect(metadata.missionId).toBe(missionId);
    expect(metadata.commitSha).toBe("abc123");
  });
});
