/*
<MODULE_CONTRACT>
<purpose>RFC-0629: One-shot Axiom accessibility check for a mission. Uses native axiom components (PlaywrightEvidenceDriver, CrawleeDiscoveryExecutor, runAccessibilityInstrument, findingsForObservation, evaluateClosure) to capture evidence, project findings, and evaluate closure. Writes native capsule files (staged-capsule.json, observation-bundle.json, study-run.json, evidence-metadata.json).</purpose>
<non-goals>
  <item>Does not support local mode (build + static server) — external-preview only.</item>
  <item>Does not integrate with Observatory runtime (local-dev only).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0012: initial implementation of mission.check command.</item>
  <item>RFC-0629: migrated to native axiom capsules with PlaywrightEvidenceDriver, CrawleeDiscoveryExecutor, and automated-web-accessibility methodology.</item>
</CHANGE_SUMMARY>
*/

import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  writeFileIfChanged,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelRuntimeContext,
} from "@warpgogol/site-kernel";

import { resolveMissionDir } from "@warpgogol/site-kernel-handoff/mission";

import { mintAxiomId } from "@syrokomskyi/axiom-contracts";
import { createCanonicalJsonDigestRef } from "@syrokomskyi/axiom-provenance";

import {
  PlaywrightEvidenceDriver,
  CrawleeDiscoveryExecutor,
  captureContractSchema,
  contractDigest,
  evaluateClosure,
  capabilityManifestSchema,
  capabilityReceiptSchema,
  runtimeAttestationSchema,
  archiveReceiptSchema,
  replayReceiptSchema,
  stagedCapsuleSchema,
  type CaptureContract,
  type StagedCapsule,
  type CapabilityManifest,
  type CapturedBrowserEvidence,
} from "@syrokomskyi/axiom-capture";

import {
  runAccessibilityInstrument,
  toDeterministicContext,
  studyRunSchema,
  type AxeEvidenceState,
  type Observation,
  type Finding,
  type ObservationBundle,
  type StudyRun,
} from "@syrokomskyi/axiom-study";

import {
  createAutomatedWebAccessibilityMethodology,
  findingsForObservation,
  methodologyPackageDigest,
  type MethodologyPackage,
} from "@syrokomskyi/axiom-methodology";

export interface MissionCheckResult {
  command: "mission.check";
  status: "pass" | "fail";
  exitCode: 0 | 1;
  capsule: StagedCapsule;
  studyRun: StudyRun;
  findingsCount: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  findings: { errors: number; warnings: number; total: number };
  closureDecision: { satisfied: boolean; status: string; reason: string };
  evidenceDir: string;
  summary: string;
  nextSteps: string[];
}

const LOCAL_PRODUCER = {
  producerId: "local-dev",
  name: "mission.check",
  version: "1.0.0",
} as const;

function failResult(
  evidenceDir: string,
  exitCode: number,
  summary: string,
): KernelCommandResult<MissionCheckResult> {
  return {
    data: {
      command: "mission.check",
      status: "fail",
      exitCode: exitCode as 0 | 1,
      capsule: null as unknown as StagedCapsule,
      studyRun: null as unknown as StudyRun,
      findingsCount: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      findings: { errors: 0, warnings: 0, total: 0 },
      closureDecision: { satisfied: false, status: "blocked", reason: summary },
      evidenceDir,
      summary,
      nextSteps: [],
    },
    exitCode,
    summary,
  };
}

function safeNameFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "index";
  } catch {
    return "page";
  }
}

function buildCaptureContract(baseUrl: string, recordedAt: string): CaptureContract {
  const origin = new URL(baseUrl).origin;
  return captureContractSchema.parse({
    schema: "capture-contract@1",
    contractId: mintAxiomId("capture-contract"),
    businessId: mintAxiomId("business"),
    webPresenceId: mintAxiomId("web-presence"),
    lockedIdentityAssertions: [],
    origins: [origin],
    urlPolicy: {
      allowedOrigins: [origin],
      includePatterns: ["/**"],
      excludePatterns: [],
      maxDepth: 3,
    },
    locales: ["en-US"],
    profiles: [
      {
        profileId: "desktop",
        width: 1440,
        height: 900,
        colorScheme: "no-preference",
        reducedMotion: false,
      },
    ],
    publicSession: { kind: "public", authenticated: false, cookies: [], secrets: [] },
    journeys: [],
    robotsRatePolicy: {
      respectRobots: true,
      respectRetryAfter: true,
      perHostConcurrency: 1,
      crawlDelayMs: 1000,
    },
    thirdPartyPolicy: {
      allowDeclaredThirdParties: false,
      allowedOrigins: [],
      blockedHosts: [],
    },
    limits: {
      maxUrls: 100,
      maxBytes: 100_000_000,
      maxDurationMs: 30_000,
      maxRetries: 1,
    },
    behaviors: {
      enableAutoscroll: true,
      enableFiniteLinkDiscovery: true,
      enableFingerprintSpoofing: false,
      enableProxyRotation: false,
      enableAuthBypass: false,
    },
    settleRules: { networkIdleMs: 1000, maxSettleMs: 15000 },
    volatilityPasses: 1,
    toolProfile: {
      crawleeVersion: "local-dev",
      playwrightVersion: "unknown",
      chromiumRevision: "unknown",
    },
    closureThresholds: {
      requiredCapabilities: [
        "http",
        "browser",
        "accessibility",
        "archive",
        "replay",
        "closure",
        "runtime-attestation",
      ],
      allowPartial: true,
    },
    stopConditions: ["maxUrls", "maxBytes", "maxDurationMs", "boundedFixpoint"],
    recordedAt,
    producer: LOCAL_PRODUCER,
  });
}

function extractAxeResult(captured: CapturedBrowserEvidence): AxeEvidenceState["result"] | null {
  const axeEvidence = captured.evidence.find((e) => e.role === "axe-raw-result");
  if (!axeEvidence) return null;
  const text = new TextDecoder().decode(axeEvidence.bytes);
  return JSON.parse(text) as AxeEvidenceState["result"];
}

function buildCapabilityManifest(contract: CaptureContract, pageCount: number): CapabilityManifest {
  const contractRef = contractDigest(contract);
  const completeReceipts = ["http", "browser", "accessibility", "closure"].map((capability) =>
    capabilityReceiptSchema.parse({
      capability,
      state: "complete",
      expectedCount: pageCount,
      observedCount: pageCount,
      evidence: [],
      diagnostics: [],
    }),
  );
  const excludedReceipts = [
    capabilityReceiptSchema.parse({
      capability: "archive",
      state: "excluded",
      expectedCount: 0,
      observedCount: 0,
      evidence: [],
      diagnostics: [
        "Archive capability excluded — Docker/Browsertrix not available in local mode.",
      ],
    }),
    capabilityReceiptSchema.parse({
      capability: "replay",
      state: "excluded",
      expectedCount: 0,
      observedCount: 0,
      evidence: [],
      diagnostics: ["Replay capability excluded — Docker/Browsertrix not available in local mode."],
    }),
    capabilityReceiptSchema.parse({
      capability: "runtime-attestation",
      state: "complete",
      expectedCount: 1,
      observedCount: 1,
      evidence: [],
      diagnostics: [],
    }),
  ];
  return capabilityManifestSchema.parse({
    schema: "capability-manifest@1",
    contractDigest: contractRef,
    receipts: [...completeReceipts, ...excludedReceipts],
  });
}

function buildStagedCapsule(
  contract: CaptureContract,
  manifest: CapabilityManifest,
  closureDecision: ReturnType<typeof evaluateClosure>,
  rawEvidenceDigests: import("@syrokomskyi/axiom-contracts").DigestRef[],
): StagedCapsule {
  const runtimeAttestation = runtimeAttestationSchema.parse({
    schema: "runtime-attestation@1",
    workerProfile: "local-direct-playwright",
    os: process.platform,
    toolDigests: {
      playwright: contract.toolProfile.playwrightVersion,
      chromium: contract.toolProfile.chromiumRevision,
      crawlee: contract.toolProfile.crawleeVersion,
    },
    recordedAt: contract.recordedAt,
    producer: contract.producer,
  });
  const archiveReceipt = archiveReceiptSchema.parse({
    schema: "archive-receipt@1",
    state: "excluded",
    archiveDigest: null,
    waczDigest: null,
    execution: null,
    diagnostics: ["Archive capability excluded — Docker/Browsertrix not available in local mode."],
  });
  const replayReceipt = replayReceiptSchema.parse({
    schema: "replay-receipt@1",
    state: "excluded",
    offlineReplay: false,
    unresolvedEgressCount: 0,
    execution: null,
    diagnostics: ["Replay capability excluded — Docker/Browsertrix not available in local mode."],
  });
  return stagedCapsuleSchema.parse({
    schema: "staged-website-evidence-capsule@1",
    contract,
    contractDigest: contractDigest(contract),
    capabilityManifest: manifest,
    classification: "local-dev",
    closureDecision,
    runtimeAttestation,
    archiveReceipt,
    replayReceipt,
    rawEvidence: rawEvidenceDigests,
    normalizedEvidence: [],
  });
}

function buildStudyRun(
  methodology: MethodologyPackage,
  bundle: ObservationBundle,
  findings: Finding[],
  capsuleRef: import("@syrokomskyi/axiom-contracts").ArtifactRef,
  recordedAt: string,
): StudyRun {
  const methodologyDigest = methodologyPackageDigest(methodology);
  const designMaterial = {
    kind: "snapshot" as const,
    methodologyDigest,
    capsuleDigests: [capsuleRef.rootDigest],
    rebased: false,
  };
  const designDigest = createCanonicalJsonDigestRef(designMaterial);
  const runMaterial = {
    designDigest,
    bundleIds: [bundle.bundleId],
  };
  return studyRunSchema.parse({
    studyRunId: `study-run_${createCanonicalJsonDigestRef(runMaterial).digest}`,
    design: { designId: `study-design_${designDigest.digest}`, ...designMaterial },
    observationBundleIds: runMaterial.bundleIds,
    assessments: [
      {
        assessmentId: `assessment_${createCanonicalJsonDigestRef(findings).digest}`,
        findingIds: findings.map((f) => f.findingId),
        limitations: methodology.limitations,
      },
    ],
    findings,
    recordedAt,
    producer: LOCAL_PRODUCER,
  });
}

function countFindingsBySeverity(findings: Finding[]): MissionCheckResult["findingsCount"] {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  return counts;
}

export async function runMissionCheck(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionCheckResult>> {
  const { workspaceRoot, logger } = context;
  const startTime = Date.now();

  const missionId = input.flags["mission"] as string | undefined;
  if (!missionId) {
    throw new Error("mission.check requires --mission <mission-id>");
  }

  const externalPreview =
    input.flags["external-preview"] === true || input.flags["external-preview"] === "true";
  if (!externalPreview) {
    throw new Error("mission.check requires --external-preview (local mode removed by RFC-0629)");
  }

  const baseUrlFlag = input.flags["base-url"] as string | undefined;
  if (!baseUrlFlag) {
    throw new Error("mission.check --external-preview requires --base-url");
  }

  const commitSha = input.flags["commit-sha"] as string | undefined;
  const baseUrl = baseUrlFlag.replace(/\/$/, "");

  const missionDir = resolveMissionDir(workspaceRoot, missionId);
  const evidenceDir = join(missionDir, "evidence", "axiom");
  const rawDir = join(evidenceDir, "raw");

  logger.info(`  External preview mode: ${baseUrl}`);

  // Clean stale evidence from previous runs
  if (existsSync(evidenceDir)) {
    logger.info(`  Cleaning stale evidence in ${evidenceDir}`);
    await rm(join(evidenceDir, "raw"), { recursive: true, force: true });
    await rm(join(evidenceDir, "screenshots"), { recursive: true, force: true });
    await rm(join(evidenceDir, "staged-capsule.json"), { force: true });
    await rm(join(evidenceDir, "observation-bundle.json"), { force: true });
    await rm(join(evidenceDir, "study-run.json"), { force: true });
    await rm(join(evidenceDir, "evidence-metadata.json"), { force: true });
  }

  await mkdir(rawDir, { recursive: true });

  const recordedAt = new Date().toISOString();
  const contract = buildCaptureContract(baseUrl, recordedAt);

  // Discover pages via CrawleeDiscoveryExecutor
  const discoveryExecutor = new CrawleeDiscoveryExecutor();
  logger.info(`  Discovering pages via Crawlee...`);
  const discoveryLedger = await discoveryExecutor.discover(contract);
  const discoveredUrls = discoveryLedger.records.map((r) => r.normalizedUrl);

  if (discoveredUrls.length === 0) {
    return failResult(evidenceDir, 2, `mission.check: no pages discovered at ${baseUrl}`);
  }

  logger.info(`  Discovered ${discoveredUrls.length} page(s)`);

  // Capture each page via PlaywrightEvidenceDriver
  const driver = new PlaywrightEvidenceDriver();
  try {
    const axeStates: AxeEvidenceState[] = [];
    const rawEvidenceDigests: import("@syrokomskyi/axiom-contracts").DigestRef[] = [];
    const rawArtifacts: Array<{ filename: string; data: unknown }> = [];

    for (const pageUrl of discoveredUrls) {
      logger.info(`  Checking: ${pageUrl}`);
      try {
        const captured = await driver.capture({
          contract,
          request: {
            url: pageUrl,
            profileId: contract.profiles[0]!.profileId,
            locale: contract.locales[0]!,
          },
          viewportProfileId: contract.profiles[0]!.profileId,
        });

        // Collect raw evidence digests
        for (const ev of captured.evidence) {
          rawEvidenceDigests.push(ev.digest);
        }

        // Write raw evidence artifacts
        const safeName = safeNameFromUrl(pageUrl);
        for (const ev of captured.evidence) {
          const ext = ev.mediaType.startsWith("image/") ? "webp" : "json";
          const filename = `${safeName}-${ev.role}.${ext}`;
          const bytes =
            ev.mediaType.startsWith("image/") || ev.mediaType === "application/octet-stream"
              ? Buffer.from(ev.bytes)
              : new TextDecoder().decode(ev.bytes);
          rawArtifacts.push({ filename, data: bytes });
        }

        // Extract axe results for instrument
        const axeResult = extractAxeResult(captured);
        if (axeResult) {
          axeStates.push({
            url: pageUrl,
            locale: contract.locales[0]!,
            profileId: contract.profiles[0]!.profileId,
            logicalPath: `raw/${safeName}-axe-raw-result.json`,
            result: axeResult,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`  Capture failed for ${pageUrl}: ${message}`);
      }
    }

    if (axeStates.length === 0) {
      return failResult(evidenceDir, 2, `mission.check: no pages could be captured`);
    }

    // Build instrument context
    const localContext = {
      origin: baseUrl,
      recordedAt,
      missionId,
      environment: {
        platform: process.platform,
        nodeVersion: process.version,
        mode: "external-preview",
      },
    };
    const deterministicContext = toDeterministicContext(localContext);
    const capsuleRef = deterministicContext.capsuleRef;

    // Run accessibility instrument
    const instrumentResult = runAccessibilityInstrument({
      context: deterministicContext,
      states: axeStates,
    });
    const bundle = instrumentResult.bundle;

    // Bind methodology and project findings
    const methodology = createAutomatedWebAccessibilityMethodology();
    const findings: Finding[] = bundle.observations.flatMap((observation) =>
      findingsForObservation(methodology, observation),
    );

    // Evaluate closure
    const manifest = buildCapabilityManifest(contract, axeStates.length);
    const closureDecision = evaluateClosure({ contract, manifest });

    // Build staged capsule
    const capsule = buildStagedCapsule(contract, manifest, closureDecision, rawEvidenceDigests);

    // Build study run
    const studyRun = buildStudyRun(methodology, bundle, findings, capsuleRef, recordedAt);

    // Write evidence files
    await writeFileIfChanged(
      join(evidenceDir, "staged-capsule.json"),
      JSON.stringify(capsule, null, 2) + "\n",
    );
    await writeFileIfChanged(
      join(evidenceDir, "observation-bundle.json"),
      JSON.stringify(bundle, null, 2) + "\n",
    );
    await writeFileIfChanged(
      join(evidenceDir, "study-run.json"),
      JSON.stringify(studyRun, null, 2) + "\n",
    );

    // Write evidence-metadata.json
    const evidenceMetadata: { missionId: string; commitSha?: string } = { missionId };
    if (commitSha) {
      evidenceMetadata.commitSha = commitSha;
    }
    await writeFileIfChanged(
      join(evidenceDir, "evidence-metadata.json"),
      JSON.stringify(evidenceMetadata, null, 2) + "\n",
    );

    // Write raw evidence artifacts
    for (const { filename, data } of rawArtifacts) {
      const content = typeof data === "string" ? data : (data as Uint8Array);
      await writeFileIfChanged(join(rawDir, filename), content);
    }

    // Compute findings counts
    const findingsCount = countFindingsBySeverity(findings);
    const errors = findingsCount.critical + findingsCount.high;
    const warnings = findingsCount.medium + findingsCount.low + findingsCount.info;
    const total = findings.length;

    // Gate logic: fail if any high/critical findings or closure not satisfied
    const hasHighOrCritical = findingsCount.critical > 0 || findingsCount.high > 0;
    const closureFailed = !closureDecision.satisfied;
    const status: "pass" | "fail" = hasHighOrCritical || closureFailed ? "fail" : "pass";
    const exitCode = status === "fail" ? 1 : 0;
    const durationMs = Date.now() - startTime;

    const summary = `mission.check: ${status} — ${total} finding(s), ${errors} error(s), ${warnings} warning(s)${closureFailed ? ", closure blocked" : ""}`;

    const result: MissionCheckResult = {
      command: "mission.check",
      status,
      exitCode: exitCode as 0 | 1,
      capsule,
      studyRun,
      findingsCount,
      findings: { errors, warnings, total },
      closureDecision: {
        satisfied: closureDecision.satisfied,
        status: closureDecision.status,
        reason: closureDecision.reason,
      },
      evidenceDir,
      summary,
      nextSteps: [],
    };

    logger.info(`  Findings: ${total} (${errors} errors, ${warnings} warnings)`);
    logger.info(`  Closure: ${closureDecision.status} — ${closureDecision.reason}`);
    logger.info(`  Evidence: ${evidenceDir}`);
    logger.info(`  Duration: ${durationMs}ms`);

    return {
      data: result,
      exitCode,
      summary,
    };
  } finally {
    await driver.close();
  }
}
