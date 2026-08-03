import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { runAxiomReport, renderAxiomReportHtml } from "../axiom-adapter.ts";
import type { EvidenceMetadata } from "../axiom-adapter.ts";
import { makeTestContext, testInput } from "./helpers.ts";
import type { KernelCommandInput } from "@warpgogol/site-kernel";

import type { StudyRun, Finding, ObservationBundle } from "@syrokomskyi/axiom-study";
import type { StagedCapsule } from "@syrokomskyi/axiom-capture";

const mockDigestRef = {
  digest: "sha256:mock-digest",
  algorithm: "sha256" as const,
  size: 42,
  mediaType: "application/json",
};

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    findingId: "finding_test_001",
    semanticFingerprint: mockDigestRef,
    methodologyId: "method_axe_core",
    ruleId: "color-contrast",
    affectedSubjectId: "https://example.com/",
    title: "Elements must meet minimum color contrast ratio",
    severity: "medium",
    evidence: [
      {
        evidenceRef: {
          artifactId: "artifact_mock",
          rootDigest: mockDigestRef,
          schema: "local-evidence-capsule@1",
        },
        selector: "body > main",
        evidenceClass: "accessibility",
      },
    ],
    uncertainty: [],
    extension: {},
    ...overrides,
  };
}

function makeViolationFinding(overrides: Partial<Finding> = {}): Finding {
  return makeFinding({
    extension: {
      "automated-web-accessibility": {
        predicate: "accessibility.axe.violation",
      },
    },
    ...overrides,
  });
}

function makeStudyRun(findings: Finding[] = []): StudyRun {
  return {
    studyRunId: "study-run_mock",
    design: {
      designId: "study-design_mock",
      kind: "snapshot",
      methodologyDigest: mockDigestRef,
      capsuleDigests: [mockDigestRef],
      rebased: false,
    },
    observationBundleIds: ["bundle_mock"],
    assessments: [
      {
        assessmentId: "assessment_mock",
        findingIds: findings.map((f) => f.findingId),
        limitations: [],
      },
    ],
    findings,
    recordedAt: "2026-08-01T12:00:00Z",
    producer: {
      producerId: "producer_local",
      version: "1.0.0",
    },
  } as unknown as StudyRun;
}

function makeStagedCapsule(satisfied = true): StagedCapsule {
  return {
    schema: "staged-website-evidence-capsule@1",
    contract: {
      schema: "capture-contract@1",
      contractId: "contract_mock",
      seedUrls: ["https://example.com/"],
      scope: { maxUrls: 100, maxDepth: 3 },
      toolProfile: {
        playwrightVersion: "1.40.0",
        chromiumRevision: "r120",
        crawleeVersion: "3.0.0",
      },
      recordedAt: "2026-08-01T12:00:00Z",
      producer: { producerId: "producer_local", version: "1.0.0" },
      requiredCapabilities: ["http", "browser", "accessibility", "closure"],
      viewport: { profileId: "desktop", width: 1280, height: 720, deviceScaleFactor: 1 },
    },
    contractDigest: mockDigestRef,
    capabilityManifest: {
      schema: "capability-manifest@1",
      contractDigest: mockDigestRef,
      receipts: [
        {
          capability: "http",
          state: "complete",
          expectedCount: 1,
          observedCount: 1,
          evidence: [],
          diagnostics: [],
        },
        {
          capability: "browser",
          state: "complete",
          expectedCount: 1,
          observedCount: 1,
          evidence: [],
          diagnostics: [],
        },
        {
          capability: "accessibility",
          state: "complete",
          expectedCount: 1,
          observedCount: 1,
          evidence: [],
          diagnostics: [],
        },
        {
          capability: "closure",
          state: "complete",
          expectedCount: 1,
          observedCount: 1,
          evidence: [],
          diagnostics: [],
        },
        {
          capability: "archive",
          state: "excluded",
          expectedCount: 0,
          observedCount: 0,
          evidence: [],
          diagnostics: [],
        },
        {
          capability: "replay",
          state: "excluded",
          expectedCount: 0,
          observedCount: 0,
          evidence: [],
          diagnostics: [],
        },
        {
          capability: "runtime-attestation",
          state: "complete",
          expectedCount: 1,
          observedCount: 1,
          evidence: [],
          diagnostics: [],
        },
      ],
    },
    closureDecision: {
      schema: "closure-decision@1",
      status: satisfied ? "seal_allowed" : "blocked",
      satisfied,
      missingCapabilities: [],
      partialCapabilities: [],
      blockedCapabilities: satisfied ? [] : ["accessibility"],
      reason: satisfied
        ? "All required capabilities complete"
        : "Accessibility violations detected",
    },
    runtimeAttestation: {
      schema: "runtime-attestation@1",
      workerProfile: "local-direct-playwright",
      os: "linux",
      toolDigests: {
        playwright: "1.40.0",
        chromium: "r120",
        crawlee: "3.0.0",
      },
      recordedAt: "2026-08-01T12:00:00Z",
      producer: { producerId: "producer_local", version: "1.0.0" },
    },
    archiveReceipt: null,
    replayReceipt: null,
    rawEvidence: [],
    normalizedEvidence: [],
  } as unknown as StagedCapsule;
}

function makeObservationBundle(): ObservationBundle {
  return {
    bundleId: "bundle_mock",
    instrumentRunId: "run_mock",
    observations: [
      {
        observationId: "obs_001",
        instrumentRunId: "run_mock",
        subjectId: "https://example.com/",
        predicate: "has-accessibility-violation",
        value: { ruleId: "color-contrast" },
        evidence: [
          {
            evidenceRef: {
              artifactId: "artifact_mock",
              rootDigest: mockDigestRef,
              schema: "local-evidence-capsule@1",
            },
            selector: "body > main",
            evidenceClass: "accessibility",
          },
        ],
        validTime: { start: "2026-08-01T12:00:00Z", end: "2026-08-01T12:00:00Z" },
        recordedAt: "2026-08-01T12:00:00Z",
        producer: { producerId: "producer_local", version: "1.0.0" },
      },
    ],
    rootDigest: mockDigestRef,
  } as unknown as ObservationBundle;
}

function makeEvidenceMetadata(overrides: Partial<EvidenceMetadata> = {}): EvidenceMetadata {
  return {
    missionId: "test-mission-m000001",
    commitSha: "abc1234",
    ...overrides,
  };
}

function setupEvidenceDir(tmpDir: string, missionId = "test-mission-m000001"): string {
  const evidenceDir = join(tmpDir, "missions", missionId, "evidence", "axiom");
  mkdirSync(evidenceDir, { recursive: true });
  return evidenceDir;
}

function writeEvidenceFiles(
  evidenceDir: string,
  opts: {
    studyRun?: StudyRun;
    capsule?: StagedCapsule;
    bundle?: ObservationBundle;
    metadata?: EvidenceMetadata;
    skipStudyRun?: boolean;
    skipCapsule?: boolean;
    skipBundle?: boolean;
    skipMetadata?: boolean;
  } = {},
): void {
  const studyRun = opts.studyRun ?? makeStudyRun();
  const capsule = opts.capsule ?? makeStagedCapsule();
  const bundle = opts.bundle ?? makeObservationBundle();
  const metadata = opts.metadata ?? makeEvidenceMetadata();

  if (!opts.skipStudyRun) {
    writeFileSync(join(evidenceDir, "study-run.json"), JSON.stringify(studyRun, null, 2));
  }
  if (!opts.skipCapsule) {
    writeFileSync(join(evidenceDir, "staged-capsule.json"), JSON.stringify(capsule, null, 2));
  }
  if (!opts.skipBundle) {
    writeFileSync(join(evidenceDir, "observation-bundle.json"), JSON.stringify(bundle, null, 2));
  }
  if (!opts.skipMetadata) {
    writeFileSync(join(evidenceDir, "evidence-metadata.json"), JSON.stringify(metadata, null, 2));
  }
}

function makeReportInput(missionId: string, dryRun = false): KernelCommandInput {
  return {
    flags: { mission: missionId, ...(dryRun ? { "dry-run": true } : {}) },
    argv: [],
  };
}

describe("axiom.report", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "axiom-report-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates report.html successfully with valid evidence", async () => {
    const missionId = "test-mission-m000001";
    const evidenceDir = setupEvidenceDir(tmpDir, missionId);
    const findings = [
      makeViolationFinding({ severity: "high", findingId: "f1", title: "High severity issue" }),
      makeViolationFinding({ severity: "medium", findingId: "f2", title: "Medium severity issue" }),
    ];
    writeEvidenceFiles(evidenceDir, { studyRun: makeStudyRun(findings) });

    const result = await runAxiomReport(makeReportInput(missionId), makeTestContext(tmpDir));

    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("2 finding(s)");
    expect(result.data!.findingsCount.high).toBe(1);
    expect(result.data!.findingsCount.medium).toBe(1);
    expect(result.data!.closureSatisfied).toBe(true);
    expect(result.nextSteps!.length).toBeGreaterThan(0);
    expect(existsSync(join(evidenceDir, "report.html"))).toBe(true);
  });

  it("fails with AXIOM-REPORT-01 when evidence directory not found", async () => {
    const result = await runAxiomReport(
      makeReportInput("nonexistent-mission"),
      makeTestContext(tmpDir),
    );

    expect(result.exitCode).toBe(1);
    expect(result.summary).toContain("AXIOM-REPORT-01");
  });

  it("fails with AXIOM-REPORT-02 when study-run.json missing", async () => {
    const missionId = "test-mission-m000002";
    const evidenceDir = setupEvidenceDir(tmpDir, missionId);
    writeEvidenceFiles(evidenceDir, { skipStudyRun: true });

    const result = await runAxiomReport(makeReportInput(missionId), makeTestContext(tmpDir));

    expect(result.exitCode).toBe(1);
    expect(result.summary).toContain("AXIOM-REPORT-02");
  });

  it("fails with AXIOM-REPORT-03 when staged-capsule.json missing", async () => {
    const missionId = "test-mission-m000003";
    const evidenceDir = setupEvidenceDir(tmpDir, missionId);
    writeEvidenceFiles(evidenceDir, { skipCapsule: true });

    const result = await runAxiomReport(makeReportInput(missionId), makeTestContext(tmpDir));

    expect(result.exitCode).toBe(1);
    expect(result.summary).toContain("AXIOM-REPORT-03");
  });

  it("fails with AXIOM-REPORT-04 when observation-bundle.json missing", async () => {
    const missionId = "test-mission-m000004";
    const evidenceDir = setupEvidenceDir(tmpDir, missionId);
    writeEvidenceFiles(evidenceDir, { skipBundle: true });

    const result = await runAxiomReport(makeReportInput(missionId), makeTestContext(tmpDir));

    expect(result.exitCode).toBe(1);
    expect(result.summary).toContain("AXIOM-REPORT-04");
  });

  it("succeeds with AXIOM-REPORT-05 warning when evidence-metadata.json missing", async () => {
    const missionId = "test-mission-m000005";
    const evidenceDir = setupEvidenceDir(tmpDir, missionId);
    writeEvidenceFiles(evidenceDir, { skipMetadata: true });

    const result = await runAxiomReport(makeReportInput(missionId), makeTestContext(tmpDir));

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(evidenceDir, "report.html"))).toBe(true);
  });

  it("dryRun mode returns HTML in renderedFiles without writing to disk", async () => {
    const missionId = "test-mission-m000006";
    const evidenceDir = setupEvidenceDir(tmpDir, missionId);
    writeEvidenceFiles(evidenceDir);

    const result = await runAxiomReport(makeReportInput(missionId, true), makeTestContext(tmpDir));

    expect(result.exitCode).toBe(0);
    expect(result.data!.renderedFiles).toBeDefined();
    const html =
      result.data!.renderedFiles!["missions/test-mission-m000006/evidence/axiom/report.html"];
    expect(html.toLowerCase()).toContain("<!doctype html>");
    expect(existsSync(join(evidenceDir, "report.html"))).toBe(false);
  });

  it("HTML report contains all 9 sections", () => {
    const findings = [
      makeFinding({ severity: "critical", findingId: "f1", title: "Critical issue" }),
      makeFinding({ severity: "info", findingId: "f2", title: "Info issue" }),
    ];
    const html = renderAxiomReportHtml(
      makeStudyRun(findings),
      makeStagedCapsule(false),
      makeObservationBundle(),
      makeEvidenceMetadata(),
    );

    expect(html).toContain("Axiom Report");
    expect(html).toContain("Severity Dashboard");
    expect(html).toContain("Severity Distribution");
    expect(html).toContain("Violations");
    expect(html).toContain("Incomplete");
    expect(html).toContain("mermaid");
    expect(html).toContain("Closure Decision");
    expect(html).toContain("Capability Manifest");
    expect(html).toContain("Violations by Severity");
    expect(html).toContain("Violations by Page");
    expect(html).toContain("Tool Profile");
  });

  it("HTML escapes user-provided content to prevent XSS", () => {
    const findings = [
      makeViolationFinding({
        title: '<script>alert("xss")</script>',
        ruleId: "<img src=x onerror=alert(1)>",
        affectedSubjectId: 'https://example.com/" onmouseover="alert(1)',
      }),
    ];
    const html = renderAxiomReportHtml(
      makeStudyRun(findings),
      makeStagedCapsule(),
      makeObservationBundle(),
      makeEvidenceMetadata(),
    );

    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&quot;");
  });

  it("populates nextSteps with actionable guidance for high-severity violations", async () => {
    const missionId = "test-mission-m000007";
    const evidenceDir = setupEvidenceDir(tmpDir, missionId);
    const findings = [
      makeViolationFinding({ severity: "critical", findingId: "f1" }),
      makeViolationFinding({ severity: "high", findingId: "f2" }),
    ];
    writeEvidenceFiles(evidenceDir, { studyRun: makeStudyRun(findings) });

    const result = await runAxiomReport(makeReportInput(missionId), makeTestContext(tmpDir));

    expect(result.exitCode).toBe(0);
    expect(result.nextSteps!.length).toBe(2);
    expect(result.nextSteps![0].action).toContain("2 high-severity violation");
    expect(result.nextSteps![1].action).toContain("Fix critical/high violation");
  });
});
