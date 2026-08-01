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

// RFC-0630: Mock playwright for pre-flight check
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
import { findingsForObservation } from "@syrokomskyi/axiom-methodology";
import { evaluateClosure } from "@syrokomskyi/axiom-capture";

describe("mission.check (RFC-0629)", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "mission-check-test-"));
    // Reset only specific mock return values — do NOT clearAllMocks
    // because that would wipe factory mock implementations
    vi.mocked(findingsForObservation).mockReturnValue([]);
    vi.mocked(evaluateClosure).mockReturnValue({
      schema: "closure-decision@1",
      status: "seal_allowed",
      satisfied: true,
      missingCapabilities: [],
      partialCapabilities: [],
      blockedCapabilities: [],
      reason: "All required evidence capabilities completed.",
    });
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

  it("passes when no high/critical findings and closure is satisfied", async () => {
    const missionId = "test-m000005";
    await createMockMission(workspaceRoot, missionId);

    vi.mocked(findingsForObservation).mockReturnValue([
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
        extension: {},
      },
    ]);

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
    expect(result.data?.findingsCount.high).toBe(0);
    expect(result.data?.findingsCount.critical).toBe(0);
    expect(result.data?.findingsCount.low).toBe(1);
    expect(result.data?.findings.total).toBe(1);
    expect(result.data?.findings.warnings).toBe(1);
    expect(result.data?.findings.errors).toBe(0);
  });

  it("fails when high severity findings are present", async () => {
    const missionId = "test-m000006";
    await createMockMission(workspaceRoot, missionId);

    vi.mocked(findingsForObservation).mockReturnValue([
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
    ]);

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

    vi.mocked(evaluateClosure).mockReturnValue({
      schema: "closure-decision@1",
      status: "blocked",
      satisfied: false,
      missingCapabilities: ["browser"],
      partialCapabilities: [],
      blockedCapabilities: ["browser"],
      reason: "Required evidence capabilities are blocked or missing.",
    });

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

  it("returns exit code 2 when no pages are discovered", async () => {
    const missionId = "test-m000008";
    await createMockMission(workspaceRoot, missionId);

    const { CrawleeDiscoveryExecutor } = await import("@syrokomskyi/axiom-capture");
    vi.mocked(CrawleeDiscoveryExecutor).mockImplementationOnce(function () {
      return {
        discover: vi.fn().mockResolvedValue({
          records: [],
          omissions: [],
          reachedFixpoint: true,
        }),
      };
    });

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
    expect(result.summary).toContain("no pages discovered");
  });

  // RFC-0630: Pre-flight check tests
  it("returns exit code 2 when chromium pre-flight check fails", async () => {
    const missionId = "test-m000009";
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

  // RFC-0630: --locales flag validation
  it("returns exit code 2 when --locales format is invalid", async () => {
    const missionId = "test-m000010";
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
    const missionId = "test-m000011";
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

  // RFC-0630: Page-language matching
  it("resolves locale from URL path segment using workpiece i18n config", async () => {
    const missionId = "test-m000012";
    await createMockMission(workspaceRoot, missionId, { withI18n: true });

    const { CrawleeDiscoveryExecutor } = await import("@syrokomskyi/axiom-capture");
    const { PlaywrightEvidenceDriver } = await import("@syrokomskyi/axiom-capture");

    vi.mocked(CrawleeDiscoveryExecutor).mockImplementationOnce(function () {
      return {
        discover: vi.fn().mockResolvedValue({
          records: [
            { normalizedUrl: "http://example.com/de/leistungen", depth: 0, discoveredFrom: null },
            { normalizedUrl: "http://example.com/uk/kontakty", depth: 0, discoveredFrom: null },
          ],
          omissions: [],
          reachedFixpoint: true,
        }),
      };
    });

    const captureMock = vi.fn().mockResolvedValue({
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
    });

    vi.mocked(PlaywrightEvidenceDriver).mockImplementationOnce(function () {
      return {
        capture: captureMock,
        close: vi.fn().mockResolvedValue(undefined),
      };
    });

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

    expect(captureMock).toHaveBeenCalledTimes(2);
    const firstCall = captureMock.mock.calls[0]!;
    expect(firstCall[0].request.locale).toBe("de-DE");
    const secondCall = captureMock.mock.calls[1]!;
    expect(secondCall[0].request.locale).toBe("uk-UA");
  });

  it("falls back to default locale when URL has no recognizable path segment", async () => {
    const missionId = "test-m000013";
    await createMockMission(workspaceRoot, missionId, { withI18n: true });

    const { CrawleeDiscoveryExecutor } = await import("@syrokomskyi/axiom-capture");
    const { PlaywrightEvidenceDriver } = await import("@syrokomskyi/axiom-capture");

    vi.mocked(CrawleeDiscoveryExecutor).mockImplementationOnce(function () {
      return {
        discover: vi.fn().mockResolvedValue({
          records: [
            { normalizedUrl: "http://example.com/impressum", depth: 0, discoveredFrom: null },
          ],
          omissions: [],
          reachedFixpoint: true,
        }),
      };
    });

    const captureMock = vi.fn().mockResolvedValue({
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
    });

    vi.mocked(PlaywrightEvidenceDriver).mockImplementationOnce(function () {
      return {
        capture: captureMock,
        close: vi.fn().mockResolvedValue(undefined),
      };
    });

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

    expect(captureMock).toHaveBeenCalledTimes(1);
    const call = captureMock.mock.calls[0]!;
    expect(call[0].request.locale).toBe("de-DE");
  });

  it("falls back to en-US when workpiece has no i18n config", async () => {
    const missionId = "test-m000014";
    await createMockMission(workspaceRoot, missionId);

    const { PlaywrightEvidenceDriver } = await import("@syrokomskyi/axiom-capture");

    const captureMock = vi.fn().mockResolvedValue({
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
    });

    vi.mocked(PlaywrightEvidenceDriver).mockImplementationOnce(function () {
      return {
        capture: captureMock,
        close: vi.fn().mockResolvedValue(undefined),
      };
    });

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

    expect(captureMock).toHaveBeenCalledTimes(1);
    const call = captureMock.mock.calls[0]!;
    expect(call[0].request.locale).toBe("en-US");
  });
});
