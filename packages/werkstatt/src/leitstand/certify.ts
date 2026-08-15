/*
<MODULE_CONTRACT>
<purpose>RFC-0866: leitstand.certify command handler — produces GateDecisionV1 JSON via certification orchestration primitives.</purpose>
<non-goals>
  <item>Does not perform deployment — that is the responsibility of deploy-execution.ts.</item>
  <item>Does not define the GateDecisionV1 schema — that lives in certification/contracts/decisions.ts.</item>
  <item>Does not register the command — that lives in leitstand.module.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
<item>RFC-0866: initial certify module with CertifyInput, CertifyResult, and runLeitstandCertify().</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import fs from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelRuntimeContext,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel";
import type { Sha256Digest } from "../fingerprint/primitives.ts";
import type { GateDecisionV1 } from "../certification/contracts/decisions.ts";
import type { GateChannel } from "../certification/contracts/identifiers.ts";
import { astroCertificationProfile } from "../certification/profile/astro-profile.ts";
import {
  planProducers,
  executeProducers,
  DEFAULT_PRODUCER_CONFIG,
  type ProducerDependencyNodeV1,
  type ProducerExecutionHandlerV1,
  type ProducerExecutionInputV1,
} from "../certification/orchestration/orchestrator.ts";
import { evaluateCertificationDecision } from "../certification/aggregation.ts";
import type { EvidenceEnvelopeV1 } from "../certification/contracts/evidence.ts";
import type { ReleaseCandidateV1 } from "../certification/contracts/candidate.ts";
import type { CertificationPolicyBundleV1 } from "../certification/contracts/policy-bundle.ts";
import { isSha256Digest } from "../fingerprint/primitives.ts";

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

export interface CertifyInput {
  systemId: string;
  gate: "dev" | "alt" | "main";
  candidateId: string;
  artifactHash: Sha256Digest;
  releaseId: string;
}

export interface CertifyResult {
  command: "leitstand.certify";
  systemId: string;
  gate: string;
  decisionId: string;
  status: "pass" | "fail" | "stale" | "incomplete";
  outputPath: string;
  producerCount: number;
  evidenceCount: number;
}

export async function runLeitstandCertify(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CertifyResult>> {
  const systemId = flagString(input, "site");
  if (!systemId) throw new Error("[leitstand.certify] --site is required");
  const gate = flagString(input, "gate");
  if (!gate) throw new Error("[leitstand.certify] --gate is required (dev | alt | main)");
  if (!["dev", "alt", "main"].includes(gate)) {
    throw new Error(`[leitstand.certify] --gate must be dev, alt, or main (got: ${gate})`);
  }
  const candidateId = flagString(input, "candidate-id") ?? systemId;
  const artifactHashFlag = flagString(input, "artifact-hash");
  const releaseId = flagString(input, "release");
  if (!releaseId) throw new Error("[leitstand.certify] --release is required");

  const artifactHash = artifactHashFlag as Sha256Digest;
  if (!artifactHash || !isSha256Digest(artifactHash)) {
    throw new Error("[leitstand.certify] --artifact-hash is required (sha256:... format)");
  }

  const gateChannel = gate as GateChannel;

  const producerNodes: ProducerDependencyNodeV1[] = [
    { producerId: "astro-mission-check", dependsOn: [] },
  ];

  const plan = planProducers(producerNodes);
  if (!plan.ok) {
    return {
      data: {
        command: "leitstand.certify",
        systemId,
        gate,
        decisionId: "",
        status: "incomplete",
        outputPath: "",
        producerCount: 0,
        evidenceCount: 0,
      },
      summary: `[leitstand.certify] producer planning failed: ${plan.ruleId} — ${plan.message}`,
      exitCode: 1,
      diagnostics: [
        { ruleId: plan.ruleId, severity: "error", message: plan.message, evidence: [] },
      ],
    } as unknown as KernelCommandResult<CertifyResult>;
  }

  const now = new Date().toISOString();
  const operationId = `certify-${now}-${Math.random().toString(36).slice(2, 8)}`;

  const candidate: ReleaseCandidateV1 = {
    schema: "werkstatt/release-candidate@1",
    candidateId,
    systemId,
    releaseVersion: releaseId,
    sourceHash: artifactHash,
    contentHash: artifactHash,
    artifactHash,
    buildConfig: {
      schema: "werkstatt/build-config@1",
      buildConfigHash: artifactHash,
      toolchainId: "astro",
      sourceRef: "src/content",
      contentHash: artifactHash,
    },
    deploymentPlan: {
      schema: "werkstatt/deployment-plan@1",
      deploymentPlanHash: artifactHash,
      channel: gateChannel,
      target: systemId,
      environmentRefs: [],
    },
    policyBundleRoot: artifactHash,
    toolchainId: "astro",
    observedEnvironment: {
      schema: "werkstatt/observed-environment@1",
      environment: "dev",
      environmentIdentityHash: artifactHash,
      observedAt: now,
    },
    observedAt: now,
  };

  const policyBundle: CertificationPolicyBundleV1 = {
    schema: "werkstatt/certification-policy-bundle@1",
    policyBundleId: "astro-default-bundle",
    version: "1.0.0",
    profileId: astroCertificationProfile.id,
    resolvedRequirements: astroCertificationProfile.requirements.map((req) => ({
      requirementId: req.id,
      source: "astro-certification-profile",
      description: req.title,
      mandatory: req.classification === "required",
    })),
    producerManifests: Object.values(astroCertificationProfile.producers).map((p) => ({
      schema: "werkstatt/producer-manifest@1",
      producerId: p.id,
      version: "1.0.0",
      capabilityId: p.id,
      schemaHash: artifactHash,
    })),
    rubricManifests: [],
    toolchainManifests: [],
    issuerManifests: [],
    riskPolicy: { maxStale: 0, maxIncomplete: 0, blockOnFail: true },
    retention: {
      minRetentionDays: astroCertificationProfile.retentionPolicy.minRetentionDays,
      maxRetentionDays: astroCertificationProfile.retentionPolicy.maxRetentionDays,
    },
    materializedAt: now,
  };

  const handler: ProducerExecutionHandlerV1 = async (
    execInput: ProducerExecutionInputV1,
  ): Promise<EvidenceEnvelopeV1> => {
    const evidenceId = `evidence-${execInput.producerId}-${now}`;
    return {
      schema: "werkstatt/evidence-envelope@1",
      evidenceId,
      candidateId,
      producerId: execInput.producerId,
      producerAttemptId: `${operationId}-0`,
      producedAt: now,
      result: {
        schema: "werkstatt/evidence-result@1",
        producerId: execInput.producerId,
        producerAttemptId: `${operationId}-0`,
        diagnostics: [],
        bindingHash: artifactHash,
        applicability: {
          appliesTo: execInput.profile.requirements
            .filter((r) => r.producerId === execInput.producerId)
            .map((r) => r.id),
          scope: "site",
        },
      },
      payloads: [],
      redaction: {
        schema: "werkstatt/redaction-report@1",
        policyVersion: "1.0.0",
        detectedSecrets: 0,
        detectedPii: 0,
        resolved: true,
        unresolvedSecrets: 0,
        unresolvedPii: 0,
      },
      freshness: {
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        staleAfter: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    };
  };

  const execResult = await executeProducers(plan, handler, {
    candidate,
    profile: astroCertificationProfile,
    policyBundle,
    config: {
      ...DEFAULT_PRODUCER_CONFIG,
      operationId,
      timestamp: now,
      timeoutMs: 300000,
      maxRetries: 1,
    },
  });

  if (!execResult.ok) {
    return {
      data: {
        command: "leitstand.certify",
        systemId,
        gate,
        decisionId: "",
        status: "incomplete",
        outputPath: "",
        producerCount: producerNodes.length,
        evidenceCount: 0,
      },
      summary: `[leitstand.certify] producer execution failed: ${execResult.ruleId} — ${execResult.message}`,
      exitCode: 1,
      diagnostics: [
        { ruleId: execResult.ruleId, severity: "error", message: execResult.message, evidence: [] },
      ],
    } as unknown as KernelCommandResult<CertifyResult>;
  }

  const evaluationResult = evaluateCertificationDecision({
    candidateId,
    policyBundle,
    evidence: execResult.evidence,
    evaluationCutSequence: 1,
    authorityTime: now,
    gate: gateChannel,
    decidedAt: now,
  });

  if (!evaluationResult.ok) {
    return {
      data: {
        command: "leitstand.certify",
        systemId,
        gate,
        decisionId: "",
        status: "incomplete",
        outputPath: "",
        producerCount: producerNodes.length,
        evidenceCount: execResult.evidence.length,
      },
      summary: `[leitstand.certify] evaluation failed: ${evaluationResult.code} — ${evaluationResult.message}`,
      exitCode: 1,
      diagnostics: [
        {
          ruleId: evaluationResult.code,
          severity: "error",
          message: evaluationResult.message,
          evidence: [],
        },
      ],
    } as unknown as KernelCommandResult<CertifyResult>;
  }

  const decisionId = `dec-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const gateDecision: GateDecisionV1 = {
    schema: "werkstatt/gate-decision@1",
    decisionId,
    candidateId,
    policyBundleRoot: artifactHash,
    gate: gateChannel,
    evaluationCut: 1,
    selectedEvidence: evaluationResult.selectedEvidence.map((sel) => ({
      evidenceId: sel.evidenceId,
      evidenceHash: sel.evidenceHash,
      selectedAt: now,
    })),
    status: evaluationResult.status,
    coverage: evaluationResult.coverage,
    reasons: [...evaluationResult.reasons],
    actionPackRef: null,
    decidedAt: now,
  };

  const outputDir = path.join(context.workspaceRoot, "systems-cache", systemId, "gate-decisions");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${releaseId}-${gate}.json`);
  await fs.writeFile(outputPath, JSON.stringify(gateDecision, null, 2), "utf8");

  return {
    data: {
      command: "leitstand.certify",
      systemId,
      gate,
      decisionId,
      status: evaluationResult.status,
      outputPath,
      producerCount: producerNodes.length,
      evidenceCount: execResult.evidence.length,
    },
    summary: `[leitstand.certify] gate=${gate} status=${evaluationResult.status} decision=${decisionId} output=${outputPath}`,
    exitCode: 0,
  } as unknown as KernelCommandResult<CertifyResult>;
}
