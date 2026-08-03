import { describe, expect, it } from "vitest";
import {
  renderAxiomReportHtml,
  type EvidenceMetadata,
  type MethodologyEvidenceEntry,
} from "../axiom-report.ts";

function makeFinding(partial: Record<string, unknown>): unknown {
  return {
    findingId: "test-finding-id",
    semanticFingerprint: {
      algorithm: "sha256",
      digest: "sha256:mock",
      size: 42,
      mediaType: "application/json",
    },
    methodologyId: "automated-web-accessibility",
    subject: "test-subject",
    severity: "high",
    predicate: "accessibility.axe.violation",
    title: "Test Finding",
    ruleId: "test-rule",
    affectedSubjectId: "test-page",
    ...partial,
  };
}

function makeStudyRun(findings: unknown[]): unknown {
  return {
    studyRunId: "test-study",
    recordedAt: "2026-01-01T00:00:00Z",
    design: {
      designId: "test-design",
      kind: "snapshot",
      methodologyDigest: {
        algorithm: "sha256",
        digest: "sha256:mock",
        size: 42,
        mediaType: "application/json",
      },
      capsuleDigests: [],
      rebased: false,
    },
    observationBundleIds: [],
    assessments: [],
    producer: { producerId: "test-producer", recordedAt: "2026-01-01T00:00:00Z" },
    findings,
  };
}

function makeCapsule(): unknown {
  return {
    schema: "staged-website-evidence-capsule@1",
    contract: { schema: "capture-contract@1", contractId: "capture-contract_test" },
    contractDigest: {
      algorithm: "sha256",
      digest: "sha256:mock",
      size: 42,
      mediaType: "application/json",
    },
    classification: { schema: "classification@1" },
    runtimeAttestation: { schema: "runtime-attestation@1", toolDigests: {} },
    closureDecision: {
      schema: "closure-decision@1",
      status: "seal_allowed",
      satisfied: true,
      reason: "All capabilities satisfied",
      missingCapabilities: [],
      partialCapabilities: [],
      blockedCapabilities: [],
    },
    capabilityManifest: {
      schema: "capability-manifest@1",
      manifestId: "test-manifest",
      capabilities: [],
      receipts: [],
    },
    normal: true,
  };
}

function makeBundle(): unknown {
  return {
    schema: "observation-bundle@1",
    bundleId: "test-bundle",
    observations: [],
  };
}

describe("renderAxiomReportHtml — RFC-0665 gate summary", () => {
  it("renders gate summary section when methodologies[] is present", () => {
    const methodologies: MethodologyEvidenceEntry[] = [
      { id: "automated-web-accessibility", digest: "sha256:abc", blockOn: ["high", "critical"] },
    ];
    const metadata: EvidenceMetadata = {
      missionId: "test-mission",
      methodologies,
    };
    const html = renderAxiomReportHtml(
      makeStudyRun([]) as never,
      makeCapsule() as never,
      makeBundle() as never,
      metadata,
    );
    expect(html).toContain("Gate Summary (RFC-0665)");
    expect(html).toContain("automated-web-accessibility");
    expect(html).toContain("PASS");
  });

  it("renders FAIL when blocking findings exist", () => {
    const methodologies: MethodologyEvidenceEntry[] = [
      { id: "automated-web-accessibility", digest: "sha256:abc", blockOn: ["high", "critical"] },
    ];
    const finding = makeFinding({
      severity: "high",
      extension: {
        "automated-web-accessibility": { predicate: "accessibility.axe.violation" },
      },
    });
    const metadata: EvidenceMetadata = {
      missionId: "test-mission",
      methodologies,
    };
    const html = renderAxiomReportHtml(
      makeStudyRun([finding]) as never,
      makeCapsule() as never,
      makeBundle() as never,
      metadata,
    );
    expect(html).toContain("FAIL");
  });

  it("renders legacy message when methodologies[] is absent", () => {
    const metadata: EvidenceMetadata = { missionId: "test-mission" };
    const html = renderAxiomReportHtml(
      makeStudyRun([]) as never,
      makeCapsule() as never,
      makeBundle() as never,
      metadata,
    );
    expect(html).toContain("pre-RFC-0665 evidence");
  });

  it("does not block on incomplete findings", () => {
    const methodologies: MethodologyEvidenceEntry[] = [
      { id: "automated-web-accessibility", digest: "sha256:abc", blockOn: ["high", "critical"] },
    ];
    const finding = makeFinding({
      severity: "high",
      extension: {
        "automated-web-accessibility": { predicate: "accessibility.axe.incomplete" },
      },
    });
    const metadata: EvidenceMetadata = {
      missionId: "test-mission",
      methodologies,
    };
    const html = renderAxiomReportHtml(
      makeStudyRun([finding]) as never,
      makeCapsule() as never,
      makeBundle() as never,
      metadata,
    );
    expect(html).toContain("PASS");
  });
});
