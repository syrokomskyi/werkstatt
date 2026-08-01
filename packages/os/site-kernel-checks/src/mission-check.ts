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
  <item>RFC-0630: hardened capture contract — runtime toolProfile via createRequire, page-language matching from workpiece i18n, pre-flight chromium check, configurable contract via CLI flags.</item>
</CHANGE_SUMMARY>
*/

import { mkdir, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

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

import { parse as parseYaml } from "yaml";

const esmRequire = createRequire(import.meta.url);

interface RuntimeToolProfile {
  crawleeVersion: string;
  playwrightVersion: string;
  chromiumRevision: string;
}

interface MissionCheckOverrides {
  maxDuration?: number;
  maxUrls?: number;
  maxDepth?: number;
}

interface PreflightResult {
  ok: boolean;
  error?: string;
  chromiumRevision?: string;
}

function resolveToolProfile(chromiumRevision: string): RuntimeToolProfile {
  let playwrightVersion = "unknown";
  let crawleeVersion = "unknown";
  try {
    playwrightVersion = esmRequire("playwright/package.json").version ?? "unknown";
  } catch {
    // Fallback — provenance improvement, not correctness requirement
  }
  try {
    crawleeVersion = esmRequire("crawlee/package.json").version ?? "unknown";
  } catch {
    // Fallback — provenance improvement, not correctness requirement
  }
  return { crawleeVersion, playwrightVersion, chromiumRevision };
}

async function runPreflightCheck(): Promise<PreflightResult> {
  // First, try to launch chromium
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const revision = browser.version();
    await browser.close();
    return { ok: true, chromiumRevision: revision };
  } catch {
    // Launch failed — try auto-install
  }

  // Auto-install chromium
  try {
    execSync("pnpm exec playwright install chromium", {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `mission.check: Playwright chromium not installed. Auto-install failed: ${msg}. Run 'pnpm exec playwright install chromium' manually and retry.`,
    };
  }

  // Retry launch after install
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const revision = browser.version();
    await browser.close();
    return { ok: true, chromiumRevision: revision };
  } catch (err) {
    return {
      ok: false,
      error: `mission.check: chromium launch failed after install: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

interface LocaleMapping {
  segmentToLocale: Map<string, string>;
  defaultLocale: string;
}

function resolveLocaleMapping(missionDir: string): LocaleMapping {
  const systemMdPath = join(missionDir, "workpiece", "src", "content", "system.md");
  try {
    const content = readFileSync(systemMdPath, "utf-8");
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return fallbackLocaleMapping();
    const yamlContent = match[1];
    const frontmatter = parseYaml(yamlContent) as Record<string, unknown>;
    const i18n = frontmatter?.i18n as
      { default?: string; supported?: Record<string, { hreflang?: string }> } | undefined;
    if (!i18n?.supported || !i18n.default) return fallbackLocaleMapping();
    const segmentToLocale = new Map<string, string>();
    for (const [segment, config] of Object.entries(i18n.supported)) {
      if (config?.hreflang) {
        segmentToLocale.set(segment, config.hreflang);
      }
    }
    const defaultConfig = i18n.supported[i18n.default];
    const defaultLocale = defaultConfig?.hreflang ?? "en-US";
    return { segmentToLocale, defaultLocale };
  } catch {
    return fallbackLocaleMapping();
  }
}

function fallbackLocaleMapping(): LocaleMapping {
  return { segmentToLocale: new Map(), defaultLocale: "en-US" };
}

function resolveLocaleForUrl(url: string, mapping: LocaleMapping): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const firstSegment = segments[0]!;
      const locale = mapping.segmentToLocale.get(firstSegment);
      if (locale) return locale;
    }
  } catch {
    // Invalid URL — fall through to default
  }
  return mapping.defaultLocale;
}

export interface MissionCheckResult {
  command: "mission.check";
  status: "pass" | "fail";
  exitCode: 0 | 1 | 2;
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
      exitCode: exitCode as 0 | 1 | 2,
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

function buildCaptureContract(
  baseUrl: string,
  recordedAt: string,
  toolProfile: RuntimeToolProfile,
  overrides?: MissionCheckOverrides,
  locales?: string[],
): CaptureContract {
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
      maxDepth: overrides?.maxDepth ?? 3,
    },
    locales: locales ?? ["en-US"],
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
      maxUrls: overrides?.maxUrls ?? 100,
      maxBytes: 100_000_000,
      maxDurationMs: overrides?.maxDuration ?? 120_000,
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
      crawleeVersion: toolProfile.crawleeVersion,
      playwrightVersion: toolProfile.playwrightVersion,
      chromiumRevision: toolProfile.chromiumRevision,
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

  // RFC-0630: Parse optional override flags
  const overrides: MissionCheckOverrides = {};
  const maxDurationRaw = input.flags["max-duration"];
  if (maxDurationRaw !== undefined) {
    const n = Number(maxDurationRaw);
    if (!Number.isNaN(n)) overrides.maxDuration = n;
  }
  const maxUrlsRaw = input.flags["max-urls"];
  if (maxUrlsRaw !== undefined) {
    const n = Number(maxUrlsRaw);
    if (!Number.isNaN(n)) overrides.maxUrls = n;
  }
  const maxDepthRaw = input.flags["max-depth"];
  if (maxDepthRaw !== undefined) {
    const n = Number(maxDepthRaw);
    if (!Number.isNaN(n)) overrides.maxDepth = n;
  }

  let explicitLocales: string[] | undefined;
  const localesRaw = input.flags["locales"];
  const localesFlag = typeof localesRaw === "string" ? localesRaw : undefined;
  if (localesFlag) {
    const parsed = localesFlag
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    const bcp47Pattern = /^[a-z]{2}-[A-Z]{2}$/;
    const invalid = parsed.find((l) => !bcp47Pattern.test(l));
    if (invalid) {
      return failResult(
        "",
        2,
        `mission.check: Invalid --locales format '${invalid}'. Expected comma-separated BCP 47 tags, e.g., 'de-DE,uk-UA'.`,
      );
    }
    explicitLocales = parsed;
    if (parsed.length > 1) {
      logger.warn(
        `  --locales has ${parsed.length} values; only '${parsed[0]}' will be used for all pages (multi-locale per-page matching requires i18n config from workpiece)`,
      );
    }
  }

  const missionDir = resolveMissionDir(workspaceRoot, missionId);
  const evidenceDir = join(missionDir, "evidence", "axiom");
  const rawDir = join(evidenceDir, "raw");

  logger.info(`  External preview mode: ${baseUrl}`);

  // RFC-0630: Pre-flight check — verify chromium is installed before discovery
  logger.info(`  Pre-flight: checking chromium installation...`);
  const preflight = await runPreflightCheck();
  if (!preflight.ok) {
    return failResult(evidenceDir, 2, preflight.error!);
  }
  logger.info(`  Pre-flight: chromium ${preflight.chromiumRevision} OK`);

  // RFC-0630: Resolve i18n locale mapping from mission workpiece system.md
  const localeMapping = resolveLocaleMapping(missionDir);
  if (localeMapping.segmentToLocale.size === 0 && !explicitLocales) {
    logger.warn(`  No i18n config found in workpiece, falling back to en-US locale`);
  }

  // RFC-0630: Build contract locales — explicit override or all from i18n mapping
  const contractLocales = explicitLocales ?? Array.from(localeMapping.segmentToLocale.values());
  if (contractLocales.length === 0) {
    contractLocales.push(localeMapping.defaultLocale);
  }

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

  // RFC-0630: Resolve runtime toolProfile with real versions
  const recordedAt = new Date().toISOString();
  const toolProfile = resolveToolProfile(preflight.chromiumRevision ?? "unknown");
  const contract = buildCaptureContract(
    baseUrl,
    recordedAt,
    toolProfile,
    overrides,
    contractLocales,
  );

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
      // RFC-0630: Page-language matching — resolve browser locale from URL path segment
      const pageLocale = explicitLocales
        ? explicitLocales[0]!
        : resolveLocaleForUrl(pageUrl, localeMapping);
      try {
        const captured = await driver.capture({
          contract,
          request: {
            url: pageUrl,
            profileId: contract.profiles[0]!.profileId,
            locale: pageLocale,
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
            locale: pageLocale,
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
    const warnings = findingsCount.medium + findingsCount.low + findingsCount.info;
    const total = findings.length;

    // Gate logic: fail only on actual axe *violations* (not incomplete results).
    // axe "incomplete" means the rule could not determine a result (e.g. background
    // color obscured by pseudo elements, images, gradients) — these are tool
    // limitations, not confirmed accessibility failures.
    const violationFindings = findings.filter(
      (f) =>
        (
          (f.extension as Record<string, unknown>)?.["automated-web-accessibility"] as
            Record<string, unknown> | undefined
        )?.predicate === "accessibility.axe.violation",
    );
    const violationCounts = countFindingsBySeverity(violationFindings);
    const errors = violationCounts.critical + violationCounts.high;
    const hasHighOrCritical = violationCounts.critical > 0 || violationCounts.high > 0;
    const closureFailed = !closureDecision.satisfied;
    const status: "pass" | "fail" = hasHighOrCritical || closureFailed ? "fail" : "pass";
    const exitCode = status === "fail" ? 1 : 0;
    const durationMs = Date.now() - startTime;

    const summary = `mission.check: ${status} — ${total} finding(s) (${violationFindings.length} violation(s), ${total - violationFindings.length} incomplete), ${errors} error(s), ${warnings} warning(s)${closureFailed ? ", closure blocked" : ""}`;

    const result: MissionCheckResult = {
      command: "mission.check",
      status,
      exitCode: exitCode as 0 | 1 | 2,
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
