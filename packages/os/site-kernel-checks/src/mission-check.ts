/*
<MODULE_CONTRACT>
<purpose>RFC-0629: One-shot Axiom check for a mission. Delegates to runActiveMethodologies() from @syrokomskyi/axiom-methodology — the external utility orchestrates capture, discovery, instrument execution, and finding projection. Writes native capsule files (staged-capsule.json, observation-bundles.json, study-run.json, evidence-metadata.json) and auto-generates report.html (RFC-0633) for operator triage.</purpose>
<non-goals>
  <item>Does not support local mode (build + static server) — external-preview only.</item>
  <item>Does not orchestrate capture, instruments, or finding projection — that lives in runActiveMethodologies().</item>
  <item>Does not write raw evidence artifacts — the orchestrator returns digests, not bytes.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0012: initial implementation of mission.check command.</item>
  <item>RFC-0629: migrated to native axiom capsules.</item>
  <item>RFC-0630: hardened capture contract, pre-flight chromium check, i18n locale mapping.</item>
  <item>RFC-0633: auto-generate report.html after evidence files are written.</item>
  <item>RFC-0665: multi-methodology gate via systems/methodologies.md config.</item>
  <item>Refactored to use runActiveMethodologies() orchestrator — removed all duplicated pipeline code (contract builder, capture loop, instrument runner, capsule/study-run builders, raw evidence writer, dev channel detection, tool profile resolver).</item>
</CHANGE_SUMMARY>
*/

import { rm, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

import {
  writeFileIfChanged,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelRuntimeContext,
} from "@warpgogol/site-kernel";

import { resolveMissionDir } from "@warpgogol/site-kernel";

import type { StagedCapsule } from "@syrokomskyi/axiom-capture";
import type { Finding, ObservationBundle, StudyRun } from "@syrokomskyi/axiom-study";
import {
  runActiveMethodologies,
  type RunActiveMethodologiesInput,
} from "@syrokomskyi/axiom-methodology";

import { renderAxiomReportHtml, type EvidenceMetadata } from "./axiom-report.ts";
import { tryLoadMethodologiesConfig, isBlockingFinding } from "./methodologies-config.ts";

import { parse as parseYaml } from "yaml";

interface PreflightResult {
  ok: boolean;
  error?: string;
}

async function runPreflightCheck(): Promise<PreflightResult> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return { ok: true };
  } catch {
    // Launch failed — try auto-install
  }

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

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `mission.check: chromium launch failed after install: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function resolveLocales(missionDir: string, explicit?: string[]): string[] {
  if (explicit && explicit.length > 0) return explicit;

  const systemMdPath = join(missionDir, "workpiece", "src", "content", "system.md");
  try {
    const content = readFileSync(systemMdPath, "utf-8");
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return ["en-US"];
    const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
    const i18n = frontmatter?.i18n as
      { default?: string; supported?: Record<string, { hreflang?: string }> } | undefined;
    if (!i18n?.supported || !i18n.default) return ["en-US"];

    const locales = Object.values(i18n.supported)
      .map((c) => c?.hreflang)
      .filter((l): l is string => typeof l === "string");
    return locales.length > 0 ? locales : ["en-US"];
  } catch {
    return ["en-US"];
  }
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

function countFindingsBySeverity(findings: Finding[]): MissionCheckResult["findingsCount"] {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  return counts;
}

function buildMethodologiesInput(
  config:
    | { ok: true; config: import("./methodologies-config.ts").MethodologiesConfig }
    | { ok: false; error: string },
): RunActiveMethodologiesInput["methodologies"] {
  if (!config.ok) return [];
  return config.config.methodologies.map((m) => ({
    methodologyId: m.id,
    active: m.active,
  }));
}

function buildMethodologiesEvidence(
  config:
    | { ok: true; config: import("./methodologies-config.ts").MethodologiesConfig }
    | { ok: false; error: string },
  orchestratorDigests: {
    methodologyId: string;
    digest: import("@syrokomskyi/axiom-contracts").DigestRef;
  }[],
): Array<{ id: string; digest: string; blockOn: string[] }> {
  if (!config.ok) return [];
  const digestMap = new Map(orchestratorDigests.map((d) => [d.methodologyId, d.digest.digest]));
  return config.config.methodologies
    .filter((m) => m.active)
    .map((m) => ({
      id: m.id,
      digest: digestMap.get(m.id) ?? `pending-phase2:${m.id}`,
      blockOn: m.blockOn,
    }));
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

  // RFC-0650: Parse --run-timestamp flag
  const runTimestampFlag = input.flags["run-timestamp"] as string | undefined;
  let runTimestamp: string;
  if (runTimestampFlag !== undefined) {
    const tsPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
    if (!tsPattern.test(runTimestampFlag)) {
      return failResult(
        "",
        1,
        `mission.check: Invalid --run-timestamp format '${runTimestampFlag}'. Expected YYYY-MM-DDTHH-MM-SS-mmmZ (ISO 8601 UTC with colons replaced by hyphens).`,
      );
    }
    runTimestamp = runTimestampFlag;
  } else {
    runTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  }

  // Parse optional override flags for orchestrator limits
  const limits: { maxUrls?: number; maxDurationMs?: number } = {};
  const maxDurationRaw = input.flags["max-duration"];
  if (maxDurationRaw !== undefined) {
    const n = Number(maxDurationRaw);
    if (!Number.isNaN(n)) limits.maxDurationMs = n;
  }
  const maxUrlsRaw = input.flags["max-urls"];
  if (maxUrlsRaw !== undefined) {
    const n = Number(maxUrlsRaw);
    if (!Number.isNaN(n)) limits.maxUrls = n;
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
  }

  const missionDir = resolveMissionDir(workspaceRoot, missionId);
  const evidenceDir = join(missionDir, "evidence", "axiom");

  logger.info(`  External preview mode: ${baseUrl}`);

  // Pre-flight check — verify chromium is installed
  logger.info(`  Pre-flight: checking chromium installation...`);
  const preflight = await runPreflightCheck();
  if (!preflight.ok) {
    return failResult(evidenceDir, 2, preflight.error!);
  }
  logger.info(`  Pre-flight: chromium OK`);

  // Resolve locales from workpiece i18n config or explicit override
  const locales = resolveLocales(missionDir, explicitLocales);
  if (locales.length === 1 && locales[0] === "en-US" && !explicitLocales) {
    logger.warn(`  No i18n config found in workpiece, falling back to en-US locale`);
  }

  // Load methodologies config
  const methodologiesConfig = tryLoadMethodologiesConfig(workspaceRoot);
  const methodologiesInput = buildMethodologiesInput(methodologiesConfig);

  // Clean stale evidence from previous runs
  if (existsSync(evidenceDir)) {
    logger.info(`  Cleaning stale evidence in ${evidenceDir}`);
    await rm(join(evidenceDir, "raw"), { recursive: true, force: true });
    await rm(join(evidenceDir, "screenshots"), { recursive: true, force: true });
    await rm(join(evidenceDir, "staged-capsule.json"), { force: true });
    await rm(join(evidenceDir, "observation-bundle.json"), { force: true });
    await rm(join(evidenceDir, "study-run.json"), { force: true });
    await rm(join(evidenceDir, "evidence-metadata.json"), { force: true });
    await rm(join(evidenceDir, "report.html"), { force: true });
  }

  await mkdir(evidenceDir, { recursive: true });

  // Delegate to runActiveMethodologies() — the external utility orchestrates
  // capture, discovery, instrument execution, and finding projection.
  logger.info(`  Running active methodologies via orchestrator...`);
  let orchestratorResult;
  try {
    orchestratorResult = await runActiveMethodologies({
      methodologies: methodologiesInput,
      baseUrl,
      missionId,
      ...(commitSha ? { commitSha } : {}),
      locales,
      ...(Object.keys(limits).length > 0
        ? {
            limits: {
              maxUrls: limits.maxUrls ?? 100,
              maxDurationMs: limits.maxDurationMs ?? 120_000,
              maxBytes: 100_000_000,
            },
          }
        : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failResult(evidenceDir, 2, `mission.check: orchestrator failed: ${msg}`);
  }

  const { studyRun, stagedCapsule, observationBundles, findings, methodologyDigests } =
    orchestratorResult;

  if (findings.length === 0 && observationBundles.length === 0) {
    return failResult(evidenceDir, 2, `mission.check: no pages could be captured at ${baseUrl}`);
  }

  // Write evidence files
  await writeFileIfChanged(
    join(evidenceDir, "staged-capsule.json"),
    JSON.stringify(stagedCapsule, null, 2) + "\n",
  );
  // Write the first observation bundle (accessibility is primary)
  const primaryBundle = observationBundles[0]!;
  await writeFileIfChanged(
    join(evidenceDir, "observation-bundle.json"),
    JSON.stringify(primaryBundle, null, 2) + "\n",
  );
  await writeFileIfChanged(
    join(evidenceDir, "study-run.json"),
    JSON.stringify(studyRun, null, 2) + "\n",
  );

  // Build evidence-metadata.json with methodologies from orchestrator digests
  const methodologiesEvidence = buildMethodologiesEvidence(methodologiesConfig, methodologyDigests);
  const evidenceMetadata: EvidenceMetadata = {
    missionId,
    runTimestamp,
    ...(commitSha ? { commitSha } : {}),
    ...(methodologiesEvidence.length > 0 ? { methodologies: methodologiesEvidence } : {}),
  };
  await writeFileIfChanged(
    join(evidenceDir, "evidence-metadata.json"),
    JSON.stringify(evidenceMetadata, null, 2) + "\n",
  );

  // Auto-generate report.html (RFC-0633)
  try {
    const reportHtml = renderAxiomReportHtml(
      studyRun,
      stagedCapsule,
      primaryBundle,
      evidenceMetadata,
    );
    await writeFileIfChanged(join(evidenceDir, "report.html"), reportHtml);
    logger.info(`  Report: ${join(evidenceDir, "report.html")}`);
  } catch (reportErr) {
    logger.warn(
      `  Report generation failed (non-blocking): ${reportErr instanceof Error ? reportErr.message : String(reportErr)}`,
    );
  }

  // Compute findings counts
  const findingsCount = countFindingsBySeverity(findings);
  const warnings = findingsCount.medium + findingsCount.low + findingsCount.info;
  const total = findings.length;

  // Gate logic: use isBlockingFinding from methodologies-config for multi-methodology gate
  const closureDecision = stagedCapsule.closureDecision;
  const closureFailed = !closureDecision.satisfied;

  let blockingCount = 0;
  if (methodologiesConfig.ok) {
    for (const m of methodologiesConfig.config.methodologies.filter((m) => m.active)) {
      for (const f of findings) {
        if (isBlockingFinding(f, m.id, m.blockOn)) blockingCount++;
      }
    }
  } else {
    // Fallback: count high/critical severity findings
    blockingCount = findingsCount.critical + findingsCount.high;
  }

  const status: "pass" | "fail" = blockingCount > 0 || closureFailed ? "fail" : "pass";
  const exitCode = status === "fail" ? 1 : 0;
  const durationMs = Date.now() - startTime;

  const summary = `mission.check: ${status} — ${total} finding(s), ${blockingCount} blocking, ${warnings} warning(s)${closureFailed ? ", closure blocked" : ""}`;

  const result: MissionCheckResult = {
    command: "mission.check",
    status,
    exitCode: exitCode as 0 | 1 | 2,
    capsule: stagedCapsule,
    studyRun,
    findingsCount,
    findings: { errors: blockingCount, warnings, total },
    closureDecision: {
      satisfied: closureDecision.satisfied,
      status: closureDecision.status,
      reason: closureDecision.reason,
    },
    evidenceDir,
    summary,
    nextSteps: [],
  };

  logger.info(`  Findings: ${total} (${blockingCount} blocking, ${warnings} warnings)`);
  logger.info(`  Closure: ${closureDecision.status} — ${closureDecision.reason}`);
  logger.info(`  Evidence: ${evidenceDir}`);
  logger.info(`  Duration: ${durationMs}ms`);

  return {
    data: result,
    exitCode,
    summary,
  };
}
