/*
<MODULE_CONTRACT>
<purpose>Thin adapter that delegates to @syrokomskyi/axiom-factory-app programmatic API (runAxiomCheck, renderAxiomReportHtml). Replaces ~1000 lines of duplicated Axiom logic (mission-check.ts, axiom-report.ts).</purpose>
<non-goals>
  <item>Does not implement Axiom capture, instruments, or finding projection — that lives in the Axiom CLI package.</item>
  <item>Does not define evidence file formats or gate logic — delegated to runAxiomCheck().</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Migrated from duplicated mission-check.ts + axiom-report.ts to @syrokomskyi/axiom-factory-app programmatic API.</item>
  <item>Review fix: removed capsule/studyRun fields from MissionCheckResult (AxiomCheckResult does not provide them); added --no-report flag for optional report.html generation.</item>
  <item>RFC-0668: add Chromium pre-flight check via ensureChromium (RFC-0647) before runAxiomCheck to fail fast on missing browser instead of wasting capture time.</item>
  <item>Replaced manual evidence file reading with readEvidenceFiles() and manual severity counting with countFindingsBySeverity() from external package. Preserved RFC-0667 fallback chain (raw.auditId ?? raw.missionId ?? missionId) by reading evidence-metadata.json separately for the intermediate missionId fallback.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  writeFileIfChanged,
  resolveMissionDir,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelRuntimeContext,
  type KernelNextStep,
} from "@warpgogol/site-kernel";

import {
  runAxiomCheck,
  readEvidenceFiles,
  countFindingsBySeverity,
  type AxiomCheckResult,
  type MethodologiesConfig as AxiomMethodologiesConfig,
} from "@syrokomskyi/axiom-factory-app/run/axiom-cli";
import {
  renderAxiomReportHtml,
  type EvidenceMetadata,
} from "@syrokomskyi/axiom-factory-app/run/report";
import type { Finding } from "@syrokomskyi/axiom-study";

import { tryLoadMethodologiesConfig } from "./methodologies-config.ts";
import {
  loadWorkshopSuppressions,
  loadWorkpieceSuppressions,
  mergeSuppressions,
  applySuppressions,
  countSuppressedByCategory,
} from "./suppressions-config.ts";
import { ensureChromium } from "./playwright-chromium-ensure.ts";

import { parse as parseYaml } from "yaml";

// ─── Re-exports for downstream consumers ───────────────────────────────────

export { renderAxiomReportHtml, type EvidenceMetadata };

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SuppressionSummary {
  totalSuppressed: number;
  byCategory: Record<string, number>;
}

export interface MissionCheckResult {
  command: "mission.check";
  status: "pass" | "fail";
  exitCode: 0 | 1 | 2;
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
  suppressionSummary?: SuppressionSummary;
}

export interface AxiomReportData {
  command: "axiom.report";
  status: "pass" | "fail";
  missionId: string;
  evidenceDir: string;
  reportPath: string;
  findingsCount: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  totalFindings: number;
  closureSatisfied: boolean;
  renderedFiles?: { [path: string]: string };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

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

function mapMethodologiesConfig(
  werkstattConfig: ReturnType<typeof tryLoadMethodologiesConfig>,
): AxiomMethodologiesConfig | undefined {
  if (!werkstattConfig.ok) return undefined;
  return {
    methodologies: werkstattConfig.config.methodologies.map((m) => ({
      id: m.id,
      active: m.active,
      blockOn: m.blockOn,
    })),
  };
}

function missionCheckFailResult(
  evidenceDir: string,
  exitCode: number,
  summary: string,
): KernelCommandResult<MissionCheckResult> {
  return {
    data: {
      command: "mission.check",
      status: "fail",
      exitCode: exitCode as 0 | 1 | 2,
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

export async function runMissionCheck(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionCheckResult>> {
  const { workspaceRoot, logger } = context;

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

  // RFC-0684: --channel flag for suppression context
  const channelRaw = input.flags["channel"] as string | undefined;
  const channel = channelRaw ?? "main";
  if (channel !== "dev" && channel !== "alt" && channel !== "main") {
    return missionCheckFailResult(
      "",
      1,
      `mission.check: Invalid --channel value '${channel}'. Expected 'dev', 'alt', or 'main'.`,
    );
  }

  const runTimestampFlag = input.flags["run-timestamp"] as string | undefined;
  let runTimestamp: string;
  if (runTimestampFlag !== undefined) {
    const tsPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
    if (!tsPattern.test(runTimestampFlag)) {
      return missionCheckFailResult(
        "",
        1,
        `mission.check: Invalid --run-timestamp format '${runTimestampFlag}'. Expected YYYY-MM-DDTHH-MM-SS-mmmZ (ISO 8601 UTC with colons replaced by hyphens).`,
      );
    }
    runTimestamp = runTimestampFlag;
  } else {
    runTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  }

  let locales: string[] | undefined;
  const localesRaw = input.flags["locales"];
  const localesFlag = typeof localesRaw === "string" ? localesRaw : undefined;
  let explicitLocales: string[] | undefined;
  if (localesFlag) {
    const parsed = localesFlag
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    const bcp47Pattern = /^[a-z]{2}-[A-Z]{2}$/;
    const invalid = parsed.find((l) => !bcp47Pattern.test(l));
    if (invalid) {
      return missionCheckFailResult(
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

  const resolvedLocales = resolveLocales(missionDir, explicitLocales);
  if (resolvedLocales.length === 1 && resolvedLocales[0] === "en-US" && !explicitLocales) {
    logger.warn(`  No i18n config found in workpiece, falling back to en-US locale`);
  }
  locales = resolvedLocales;

  const methodologiesConfig = tryLoadMethodologiesConfig(workspaceRoot);
  const axiomMethodologiesConfig = mapMethodologiesConfig(methodologiesConfig);

  const noReport = input.flags["no-report"] === true || input.flags["no-report"] === "true";
  const cacheDirRaw = input.flags["cache-dir"];
  const noCache = input.flags["no-cache"] === true || input.flags["no-cache"] === "true";

  const maxDurationRaw = input.flags["max-duration"];
  const maxUrlsRaw = input.flags["max-urls"];
  const maxDepthRaw = input.flags["max-depth"];

  let result: AxiomCheckResult;
  try {
    // RFC-0668: Chromium pre-flight check — verify browser is installed before
    // starting captures. Reuses ensureChromium from RFC-0647. If auto-install
    // fails, the catch block below returns exitCode 2 (infrastructure error).
    await ensureChromium(workspaceRoot, logger);

    result = await runAxiomCheck({
      baseUrl,
      auditId: missionId,
      outputDir: evidenceDir,
      locales,
      ...(axiomMethodologiesConfig ? { methodologiesConfig: axiomMethodologiesConfig } : {}),
      ...(commitSha ? { commitSha } : {}),
      runTimestamp,
      ...(maxDurationRaw !== undefined && !Number.isNaN(Number(maxDurationRaw))
        ? { maxDurationMs: Number(maxDurationRaw) }
        : {}),
      ...(maxUrlsRaw !== undefined && !Number.isNaN(Number(maxUrlsRaw))
        ? { maxUrls: Number(maxUrlsRaw) }
        : {}),
      ...(maxDepthRaw !== undefined && !Number.isNaN(Number(maxDepthRaw))
        ? { maxDepth: Number(maxDepthRaw) }
        : {}),
      ...(cacheDirRaw ? { cacheDir: String(cacheDirRaw) } : {}),
      ...(noCache ? { noCache: true } : {}),
      report: !noReport,
      quiet: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return missionCheckFailResult(evidenceDir, 2, `mission.check: ${msg}`);
  }

  // RFC-0684: Apply suppression post-filter after runAxiomCheck writes evidence files.
  // Read study-run.json, apply suppressions, write it back with suppressed flags,
  // then recalculate counts excluding suppressed findings.
  let suppressionSummary: SuppressionSummary | undefined;
  let activeFindingsCount = result.findingsCount;
  let activeFindingsTotals = result.findings;
  let activeClosureDecision = result.closureDecision;

  const studyRunPath = join(evidenceDir, "study-run.json");
  if (existsSync(studyRunPath)) {
    try {
      const studyRunContent = readFileSync(studyRunPath, "utf-8");
      const studyRun = JSON.parse(studyRunContent) as {
        findings?: Array<Record<string, unknown>>;
      };

      if (studyRun.findings && Array.isArray(studyRun.findings)) {
        const workshopSuppressions = loadWorkshopSuppressions(workspaceRoot);
        const workpieceSuppressions = loadWorkpieceSuppressions(missionDir);
        const mergedRules = mergeSuppressions(workshopSuppressions, workpieceSuppressions);

        if (mergedRules.length > 0) {
          const suppressedFindings = applySuppressions(studyRun.findings as never[], mergedRules, {
            channel,
          });

          // Write updated study-run.json with suppressed flags
          const updatedStudyRun = { ...studyRun, findings: suppressedFindings };
          await writeFileIfChanged(studyRunPath, JSON.stringify(updatedStudyRun, null, 2));

          // Calculate suppression summary
          suppressionSummary = countSuppressedByCategory(suppressedFindings as never[]);

          // Recalculate counts excluding suppressed findings
          const activeFindings = suppressedFindings.filter(
            (f) => !(f as { suppressed?: boolean }).suppressed,
          );
          activeFindingsCount = countFindingsBySeverity(activeFindings as never[]);
          const activeErrors = activeFindingsCount.critical + activeFindingsCount.high;
          const activeWarnings = activeFindingsCount.medium + activeFindingsCount.low;
          activeFindingsTotals = {
            errors: activeErrors,
            warnings: activeWarnings,
            total: activeFindings.length,
          };

          // Recalculate closure decision on active findings only
          activeClosureDecision = {
            ...result.closureDecision,
            satisfied: activeErrors === 0 ? result.closureDecision.satisfied : false,
          };

          if (suppressionSummary.totalSuppressed > 0) {
            logger.info(
              `  Suppressions: ${suppressionSummary.totalSuppressed} finding(s) suppressed across ${Object.keys(suppressionSummary.byCategory).length} category(s)`,
            );
          }
        }
      }
    } catch (err) {
      // Fail-open: log warning and proceed without suppressions
      logger.warn(
        `  Suppression post-filter failed: ${err instanceof Error ? err.message : String(err)}. Proceeding without suppressions.`,
      );
    }
  }

  const summary = `mission.check: ${result.status} — ${activeFindingsTotals.total} finding(s)${suppressionSummary ? `, ${suppressionSummary.totalSuppressed} suppressed` : ""}, ${activeFindingsTotals.errors} blocking, ${activeFindingsTotals.warnings} warning(s)${!activeClosureDecision.satisfied ? ", closure blocked" : ""}`;

  const checkResult: MissionCheckResult = {
    command: "mission.check",
    status: activeFindingsTotals.errors > 0 ? "fail" : result.status,
    exitCode: activeFindingsTotals.errors > 0 ? 1 : result.exitCode,
    findingsCount: activeFindingsCount,
    findings: activeFindingsTotals,
    closureDecision: activeClosureDecision,
    evidenceDir,
    summary,
    nextSteps: [],
    ...(suppressionSummary ? { suppressionSummary } : {}),
  };

  logger.info(
    `  Findings: ${activeFindingsTotals.total} (${activeFindingsTotals.errors} blocking, ${activeFindingsTotals.warnings} warnings)`,
  );
  logger.info(`  Closure: ${activeClosureDecision.status} — ${activeClosureDecision.reason}`);
  logger.info(`  Evidence: ${evidenceDir}`);
  logger.info(`  Duration: ${result.durationMs}ms`);

  return {
    data: checkResult,
    exitCode: checkResult.exitCode,
    summary,
  };
}

// ─── axiom.report adapter ──────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function injectSuppressedSection(
  html: string,
  suppressedFindings: Array<
    Finding & {
      suppressed?: boolean;
      suppressedBy?: { ruleId: string; category: string; reason: string };
    }
  >,
  activeCount: number,
): string {
  const byCategory: Record<string, number> = {};
  for (const f of suppressedFindings) {
    const cat = f.suppressedBy?.category ?? "unknown";
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }

  const categorySummary = Object.entries(byCategory)
    .map(([cat, count]) => `<li>${escapeHtml(cat)}: ${count}</li>`)
    .join("");

  const findingRows = suppressedFindings
    .map(
      (f) => `
      <tr class="text-gray-400">
        <td class="px-2 py-1">${escapeHtml(f.severity)}</td>
        <td class="px-2 py-1">${escapeHtml(f.ruleId)}</td>
        <td class="px-2 py-1">${escapeHtml(f.title)}</td>
        <td class="px-2 py-1">${escapeHtml(f.suppressedBy?.category ?? "")}</td>
        <td class="px-2 py-1 text-xs text-gray-500">${escapeHtml(f.suppressedBy?.reason ?? "")}</td>
      </tr>`,
    )
    .join("");

  const suppressedSection = `
  <section class="mb-8">
    <details>
      <summary class="cursor-pointer text-gray-500 font-semibold mb-2">
        Suppressed Findings (${suppressedFindings.length}) — collapsed by default
      </summary>
      <div class="bg-gray-50 border border-gray-200 rounded p-4">
        <p class="text-sm text-gray-500 mb-2">${activeCount} active finding(s) shown above. ${suppressedFindings.length} suppressed finding(s) excluded from gate decision.</p>
        <ul class="text-sm text-gray-500 mb-3 list-disc list-inside">${categorySummary}</ul>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-400 border-b border-gray-200">
              <th class="px-2 py-1">Severity</th>
              <th class="px-2 py-1">Rule ID</th>
              <th class="px-2 py-1">Title</th>
              <th class="px-2 py-1">Category</th>
              <th class="px-2 py-1">Reason</th>
            </tr>
          </thead>
          <tbody>${findingRows}</tbody>
        </table>
      </div>
    </details>
  </section>`;

  // Inject before closing </body> tag
  const bodyCloseIndex = html.lastIndexOf("</body>");
  if (bodyCloseIndex === -1) return html + suppressedSection;
  return html.slice(0, bodyCloseIndex) + suppressedSection + html.slice(bodyCloseIndex);
}

export async function runAxiomReport(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<AxiomReportData>> {
  const { workspaceRoot, logger } = context;

  const missionId = input.flags["mission"] as string | undefined;
  if (!missionId) {
    throw new Error("axiom.report requires --mission <mission-id>");
  }

  const dryRun = input.flags["dry-run"] === true || input.flags["dry-run"] === "true";

  const missionDir = resolveMissionDir(workspaceRoot, missionId);
  const evidenceDir = join(missionDir, "evidence", "axiom");

  if (!existsSync(evidenceDir)) {
    return axiomReportFailResult(
      evidenceDir,
      1,
      `AXIOM-REPORT-01: evidence directory not found at ${evidenceDir}. Run mission.check first.`,
    );
  }

  const studyRunPath = join(evidenceDir, "study-run.json");
  if (!existsSync(studyRunPath)) {
    return axiomReportFailResult(
      evidenceDir,
      1,
      `AXIOM-REPORT-02: cannot read study-run.json at ${studyRunPath}.`,
    );
  }
  const capsulePath = join(evidenceDir, "staged-capsule.json");
  if (!existsSync(capsulePath)) {
    return axiomReportFailResult(
      evidenceDir,
      1,
      `AXIOM-REPORT-03: cannot read staged-capsule.json at ${capsulePath}.`,
    );
  }
  const bundlePath = join(evidenceDir, "observation-bundle.json");
  if (!existsSync(bundlePath)) {
    return axiomReportFailResult(
      evidenceDir,
      1,
      `AXIOM-REPORT-04: cannot read observation-bundle.json at ${bundlePath}.`,
    );
  }

  const metadataPath = join(evidenceDir, "evidence-metadata.json");
  if (!existsSync(metadataPath)) {
    logger.warn(
      `AXIOM-REPORT-05: evidence-metadata.json not found at ${metadataPath}. Using "${missionId}" for missing fields.`,
    );
  }

  let evidence: Awaited<ReturnType<typeof readEvidenceFiles>>;
  try {
    evidence = await readEvidenceFiles(evidenceDir);
  } catch {
    return identifyCorruptEvidenceFile(evidenceDir, studyRunPath, capsulePath, bundlePath);
  }

  const { studyRun, capsule, bundle } = evidence;
  // RFC-0667: fallback chain raw.auditId ?? raw.missionId ?? missionId.
  // readEvidenceFiles() only reads raw.auditId (falls back to "unknown").
  // Read evidence-metadata.json separately to preserve the intermediate missionId fallback.
  let auditId = missionId;
  if (evidence.metadata.auditId !== "unknown") {
    auditId = evidence.metadata.auditId;
  } else if (existsSync(metadataPath)) {
    try {
      const raw = JSON.parse(readFileSync(metadataPath, "utf-8")) as Record<string, unknown>;
      if (typeof raw.missionId === "string" && raw.missionId) {
        auditId = raw.missionId;
      }
    } catch {
      // Already warned above about AXIOM-REPORT-05
    }
  }
  const metadata: EvidenceMetadata = {
    ...evidence.metadata,
    auditId,
  };

  const html = renderAxiomReportHtml(studyRun, capsule, bundle, metadata);

  // RFC-0684: Post-process HTML to inject suppressed findings section.
  // renderAxiomReportHtml from the external package does not support a separate
  // suppressed section. We partition findings and inject a collapsible section.
  const allFindings = studyRun.findings as Array<
    Finding & {
      suppressed?: boolean;
      suppressedBy?: { ruleId: string; category: string; reason: string };
    }
  >;
  const suppressedFindings = allFindings.filter((f) => f.suppressed);
  const activeFindings = allFindings.filter((f) => !f.suppressed);

  let finalHtml = html;
  if (suppressedFindings.length > 0) {
    finalHtml = injectSuppressedSection(html, suppressedFindings, activeFindings.length);
  }

  const reportPath = join(evidenceDir, "report.html");
  const relativeReportPath = `missions/${missionId}/evidence/axiom/report.html`;

  if (!dryRun) {
    await writeFileIfChanged(reportPath, finalHtml);
  }

  const total = activeFindings.length;
  const closureSatisfied = capsule.closureDecision.satisfied;

  const findingsCount = countFindingsBySeverity(activeFindings);
  const errors = findingsCount.critical + findingsCount.high;

  const nextSteps: KernelNextStep[] =
    errors > 0
      ? [
          {
            action: `Review ${errors} high-severity violation(s) at ${relativeReportPath}`,
            kind: "optional",
          },
          {
            action: `Fix critical/high violations and re-run mission.check --external-preview`,
            kind: "required",
          },
        ]
      : [
          {
            action: `Report generated at ${relativeReportPath} — ${total} finding(s)`,
            kind: "optional",
          },
        ];

  const summary = `axiom.report: ${dryRun ? "dry-run" : "generated"} report.html — ${total} finding(s), closure ${closureSatisfied ? "satisfied" : "blocked"}`;

  const data: AxiomReportData = {
    command: "axiom.report",
    status: "pass",
    missionId: metadata.auditId,
    evidenceDir,
    reportPath: relativeReportPath,
    findingsCount,
    totalFindings: total,
    closureSatisfied,
  };

  if (dryRun) {
    data.renderedFiles = { [relativeReportPath]: finalHtml };
  }

  return {
    data,
    exitCode: 0,
    summary,
    nextSteps,
  };
}

function identifyCorruptEvidenceFile(
  evidenceDir: string,
  studyRunPath: string,
  capsulePath: string,
  bundlePath: string,
): KernelCommandResult<AxiomReportData> {
  const tryParse = (p: string): boolean => {
    try {
      JSON.parse(readFileSync(p, "utf-8"));
      return true;
    } catch {
      return false;
    }
  };
  if (!tryParse(studyRunPath)) {
    return axiomReportFailResult(
      evidenceDir,
      1,
      `AXIOM-REPORT-02: cannot read study-run.json at ${studyRunPath}.`,
    );
  }
  if (!tryParse(capsulePath)) {
    return axiomReportFailResult(
      evidenceDir,
      1,
      `AXIOM-REPORT-03: cannot read staged-capsule.json at ${capsulePath}.`,
    );
  }
  return axiomReportFailResult(
    evidenceDir,
    1,
    `AXIOM-REPORT-04: cannot read observation-bundle.json at ${bundlePath}.`,
  );
}

function axiomReportFailResult(
  evidenceDir: string,
  exitCode: 0 | 1,
  summary: string,
): KernelCommandResult<AxiomReportData> {
  return {
    data: {
      command: "axiom.report",
      status: "fail",
      missionId: "",
      evidenceDir,
      reportPath: "",
      findingsCount: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      totalFindings: 0,
      closureSatisfied: false,
    },
    exitCode,
    summary,
    nextSteps: [],
  };
}
