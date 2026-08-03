import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

import { runMissionCheck } from "../mission-check.ts";
import { makeTestContext, testInput } from "./helpers.ts";

const mockDigestRef = {
  digest: "sha256:mock-digest",
  algorithm: "sha256" as const,
  size: 42,
  mediaType: "application/json",
};

const mockClosureAllowed = {
  schema: "closure-decision@1",
  status: "seal_allowed",
  satisfied: true,
  missingCapabilities: [],
  partialCapabilities: [],
  blockedCapabilities: [],
  reason: "All required evidence capabilities completed.",
};

const mockClosureBlocked = {
  schema: "closure-decision@1",
  status: "blocked",
  satisfied: false,
  missingCapabilities: ["browser"],
  partialCapabilities: [],
  blockedCapabilities: ["browser"],
  reason: "Required evidence capabilities are blocked or missing.",
};

const mockStudyRun = {
  studyRunId: "study-run_mock",
  design: {
    designId: "study-design_mock",
    kind: "snapshot" as const,
    methodologyDigest: mockDigestRef,
    capsuleDigests: [mockDigestRef],
    rebased: false,
  },
  observationBundleIds: ["observation-bundle_mock"],
  assessments: [],
  findings: [] as Array<Record<string, unknown>>,
  recordedAt: "2026-01-01T00:00:00.000Z",
  producer: { producerId: "local-dev", name: "mission.check", version: "1.0.0" },
};

const mockCapsule = {
  schema: "staged-website-evidence-capsule@1" as const,
  contract: {},
  contractDigest: mockDigestRef,
  capabilityManifest: {
    schema: "capability-manifest@1" as const,
    contractDigest: mockDigestRef,
    receipts: [],
  },
  classification: "local-dev" as const,
  closureDecision: mockClosureAllowed,
  runtimeAttestation: {},
  archiveReceipt: {},
  replayReceipt: {},
  rawEvidence: [],
  normalizedEvidence: [],
};

const mockBundle = {
  bundleId: "observation-bundle_mock",
  observations: [],
  rootDigest: mockDigestRef,
};

function makeOrchestratorResult(overrides?: {
  findings?: Array<Record<string, unknown>>;
  closureDecision?: Record<string, unknown>;
}): Awaited<ReturnType<typeof runActiveMethodologies>> {
  return {
    studyRun: {
      ...mockStudyRun,
      findings: overrides?.findings ?? [],
    },
    stagedCapsule: {
      ...mockCapsule,
      closureDecision: overrides?.closureDecision ?? mockClosureAllowed,
    },
    observationBundles: [mockBundle],
    methodologyDigests: [{ methodologyId: "automated-web-accessibility", digest: mockDigestRef }],
    findings: overrides?.findings ?? [],
    methodologyResults: [],
  } as unknown as Awaited<ReturnType<typeof runActiveMethodologies>>;
}

vi.mock("@syrokomskyi/axiom-methodology", () => ({
  runActiveMethodologies: vi.fn(),
}));

vi.mock("@syrokomskyi/axiom-capture", () => ({}));
vi.mock("@syrokomskyi/axiom-study", () => ({}));
vi.mock("@syrokomskyi/axiom-contracts", () => ({}));
vi.mock("@syrokomskyi/axiom-provenance", () => ({}));

// Mock playwright for pre-flight check
vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      version: vi.fn().mockReturnValue("131.0.6778.87"),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock execSync to prevent real chromium install during tests
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execSync: vi.fn().mockImplementation(() => {
      throw new Error("mocked: install not available in test");
    }),
  };
});

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

// Import after mocks are set up
import { runActiveMethodologies } from "@syrokomskyi/axiom-methodology";

describe("mission.check (RFC-0629)", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "mission-check-test-"));
    vi.mocked(runActiveMethodologies).mockClear();
    vi.mocked(runActiveMethodologies).mockResolvedValue(makeOrchestratorResult());
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

  it("writes native capsule files and evidence-metadata.json with commitSha", async () => {
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

    const evidenceDir = join(workspaceRoot, "missions", missionId, "evidence", "axiom");

    expect(existsSync(join(evidenceDir, "staged-capsule.json"))).toBe(true);
    expect(existsSync(join(evidenceDir, "observation-bundle.json"))).toBe(true);
    expect(existsSync(join(evidenceDir, "study-run.json"))).toBe(true);
    expect(existsSync(join(evidenceDir, "evidence-metadata.json"))).toBe(true);

    const metadata = JSON.parse(
      await readFile(join(evidenceDir, "evidence-metadata.json"), "utf-8"),
    );
    expect(metadata.missionId).toBe(missionId);
    expect(metadata.commitSha).toBe("abc123def456");
    expect(result.exitCode).toBe(0);
  });

  it("writes evidence-metadata.json without commitSha when flag is absent", async () => {
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

    const evidenceDir = join(workspaceRoot, "missions", missionId, "evidence", "axiom");
    const metadata = JSON.parse(
      await readFile(join(evidenceDir, "evidence-metadata.json"), "utf-8"),
    );
    expect(metadata.missionId).toBe(missionId);
    expect(metadata.commitSha).toBeUndefined();
  });

  it("passes when no blocking findings and closure is satisfied", async () => {
    const missionId = "test-m000005";
    await createMockMission(workspaceRoot, missionId);

    vi.mocked(runActiveMethodologies).mockResolvedValue(
      makeOrchestratorResult({
        findings: [
          {
            findingId: "finding_low_1",
            semanticFingerprint: mockDigestRef,
            methodologyId: "automated-web-accessibility",
            ruleId: "color-contrast",
            affectedSubjectId: "http://example.com/",
            title: "Low contrast",
            severity: "low",
            evidence: [],
            uncertainty: [],
            extension: {
              "automated-web-accessibility": { predicate: "accessibility.axe.violation" },
            },
          },
        ],
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

    vi.mocked(runActiveMethodologies).mockResolvedValue(
      makeOrchestratorResult({
        findings: [
          {
            findingId: "finding_high_1",
            semanticFingerprint: mockDigestRef,
            methodologyId: "automated-web-accessibility",
            ruleId: "aria-valid-id",
            affectedSubjectId: "http://example.com/",
            title: "ARIA ID not unique",
            severity: "high",
            evidence: [],
            uncertainty: [],
            extension: {
              "automated-web-accessibility": { predicate: "accessibility.axe.violation" },
            },
          },
        ],
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

    vi.mocked(runActiveMethodologies).mockResolvedValue(
      makeOrchestratorResult({
        closureDecision: mockClosureBlocked,
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

  it("returns exit code 2 when orchestrator returns no findings and no bundles", async () => {
    const missionId = "test-m000008";
    await createMockMission(workspaceRoot, missionId);

    vi.mocked(runActiveMethodologies).mockResolvedValue({
      studyRun: { ...mockStudyRun, findings: [] },
      stagedCapsule: mockCapsule,
      observationBundles: [],
      methodologyDigests: [],
      findings: [],
      methodologyResults: [],
    } as unknown as Awaited<ReturnType<typeof runActiveMethodologies>>);

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
    expect(result.data?.exitCode).toBe(2);
    expect(result.summary).toContain("no pages could be captured");
  });

  it("returns exit code 2 when orchestrator throws", async () => {
    const missionId = "test-m000009";
    await createMockMission(workspaceRoot, missionId);

    vi.mocked(runActiveMethodologies).mockRejectedValue(new Error("orchestrator crashed"));

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
    expect(result.summary).toContain("orchestrator failed");
  });

  // Pre-flight check tests
  it("returns exit code 2 when chromium pre-flight check fails", async () => {
    const missionId = "test-m000010";
    await createMockMission(workspaceRoot, missionId);

    const { chromium } = await import("playwright");
    vi.mocked(chromium.launch).mockRejectedValueOnce(new Error("chromium not found"));

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

  it("passes locales from i18n config to orchestrator", async () => {
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

    expect(runActiveMethodologies).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(runActiveMethodologies).mock.calls[0]![0];
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

    expect(runActiveMethodologies).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(runActiveMethodologies).mock.calls[0]![0];
    expect(callArgs.locales).toEqual(["en-US"]);
  });

  it("passes explicit --locales override to orchestrator", async () => {
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

    expect(runActiveMethodologies).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(runActiveMethodologies).mock.calls[0]![0];
    expect(callArgs.locales).toEqual(["fr-FR"]);
  });
});
