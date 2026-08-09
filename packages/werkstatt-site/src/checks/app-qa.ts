/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0074 app.qa.validate aggregator over deterministic validators and cached LLM audits.</purpose>
<non-goals>
  <item>Do not mutate content or auto-fix findings.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
  <item>RFC-0602: replace volatile generatedAt with null in audit report frontmatter.</item>
</CHANGE_SUMMARY>
*/

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { readdir } from "node:fs/promises";
import { executeKernelCommand } from "@warpgogol/site-kernel";
import {
  loadAuditAppContext,
  buildAuditResult,
  renderAuditReportMarkdown,
} from "./audit/helpers.ts";
import { type AuditFinding, type AuditResult } from "./audit/types.ts";

// RFC-0085: author-phase deterministic audits — safe to run without
// apps/<id>/dist/. These mirror the deterministic subset of
// SITES_CHECK_AUTHOR_PIPELINE that app.qa.validate cares about.
const DETERMINISTIC_AUTHOR_COMMANDS = [
  "seo.structured-data.validate",
  "seo.internal-linking.validate",
  "analytics.config.validate",
  "first-party-data.validate",
  "infra.brief.validate",
  // RFC-0233: Visual Control System Tier-1 positional invariants.
  "visual.contract.validate",
] as const;

// RFC-0085: postbuild-only deterministic audits — only run when
// apps/<id>/dist/ exists. Previously these ran unconditionally and produced
// confusing failures during 05-audit (before any build).
const DETERMINISTIC_POSTBUILD_COMMANDS = [
  "audit.agent.readiness.validate",
  "seo.technical.validate",
] as const;

const CORE_LLM_KINDS = ["cultural", "linguistic", "emotional", "brand-alignment"] as const;

function hasFlag(input: KernelCommandInput, name: string): boolean {
  if (input.flags[name] === true) return true;
  return false;
}

function readFlag(input: KernelCommandInput, name: string): string | undefined {
  const direct = input.flags[name];
  if (typeof direct === "string") return direct;
  return undefined;
}

/**
 * RFC-0085: shallow detector for "has the app been built?" — returns true
 * iff `<dir>/` (or any direct subdirectory) contains a `*.html` file.
 * Faster and more honest than checking `existsSync(dir)` because Astro and
 * passport emission can each create a partial `dist/` without ever running
 * the page renderer.
 */
async function directoryHasHtml(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".html")) return true;
      if (entry.isDirectory()) {
        // One-level deep: dist/<lang>/index.html is the common Astro shape.
        try {
          const nested = await readdir(`${dir}/${entry.name}`, { withFileTypes: true });
          if (nested.some((n) => n.isFile() && n.name.endsWith(".html"))) return true;
        } catch {
          // Skip unreadable entries.
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function runAppQaValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const audit = await loadAuditAppContext(context);
  const continueOnError = hasFlag(input, "continue-on-error");
  const archetype = readFlag(input, "archetype");
  const results: AuditResult[] = [];
  let deterministicFailure = false;

  let phaseData:
    | {
        inputHash?: string;
        status?: "ok" | "warn" | "fail";
        findings?: Array<{
          ruleId: string;
          severity: "info" | "warn" | "error";
          file?: string;
          message: string;
        }>;
      }
    | undefined;

  try {
    const phaseReport = await executeKernelCommand({
      workspaceRoot: context.workspaceRoot,
      commandName: "onboarding.phase.validate",
      siteName: audit.siteName,
      siteExplicit: true,
      outputFormat: "json",
      // ExecuteKernelCommandOptions accepts `argv`, not `args`. The previous
      // `args:` was silently dropped by the `as any` cast, so --phase never
      // reached parseKernelArgv and onboarding.phase.validate reported
      // "phase must be one of ..." on every app.qa run.
      argv: ["--phase=05-audit"],
      dryRun: false,
    });
    const phaseSingle = Array.isArray(phaseReport) ? phaseReport[0] : phaseReport;
    phaseData = phaseSingle?.data as typeof phaseData;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("onboarding.phase.validate")) {
      throw error;
    }
  }

  if (phaseData) {
    const phaseFindings: AuditFinding[] = (phaseData.findings ?? []).map((finding, index) => ({
      id: `onboarding-phase-${index + 1}`,
      ruleId: finding.ruleId,
      // RFC-0203: normalize the upstream phase "warn" spelling into "warning".
      severity: finding.severity === "warn" ? "warning" : finding.severity,
      file: finding.file,
      message: finding.message,
      evidence: finding.file ? [{ kind: "config", file: finding.file }] : [],
    }));
    results.push(
      buildAuditResult({
        command: "onboarding.phase.validate",
        app: audit.siteName,
        findings: phaseFindings,
        runtimeMs: 0,
      }),
    );
    if (phaseData.status === "fail") {
      deterministicFailure = true;
    }
  }

  if (!deterministicFailure || continueOnError) {
    // RFC-0085: skip postbuild audits when apps/<id>/dist/ has no rendered
    // HTML so app.qa.validate doesn't conflate "not yet built" with "build
    // broken". A partial dist/ that holds only star-map.svg + nebula-score.json
    // (the author-time passport emission artifacts) does NOT count as built.
    const distHasHtml = await directoryHasHtml(`${audit.appDirectory}/dist`);
    const deterministicCommands = distHasHtml
      ? [...DETERMINISTIC_AUTHOR_COMMANDS, ...DETERMINISTIC_POSTBUILD_COMMANDS]
      : [...DETERMINISTIC_AUTHOR_COMMANDS];
    for (const commandName of deterministicCommands) {
      const report = await executeKernelCommand({
        workspaceRoot: context.workspaceRoot,
        commandName,
        siteName: audit.siteName,
        siteExplicit: true,
        outputFormat: "json",
        dryRun: false,
      });
      const single = Array.isArray(report) ? report[0] : report;
      if (single?.data) {
        results.push(single.data as AuditResult);
        if ((single.data as AuditResult).status === "fail") {
          deterministicFailure = true;
        }
      }
      if (deterministicFailure && !continueOnError) {
        break;
      }
    }
  }

  if (!deterministicFailure || continueOnError) {
    const llmKinds = archetype ? [...CORE_LLM_KINDS, "archetype-lens"] : [...CORE_LLM_KINDS];
    for (const kind of llmKinds) {
      // Same `as any` mask as the phase call above: `flags:` is not a
      // valid ExecuteKernelCommandOptions key; argv with --kind=<...> is.
      const argv =
        archetype && kind === "archetype-lens"
          ? [`--kind=${kind}`, `--archetype=${archetype}`]
          : [`--kind=${kind}`];
      const report = await executeKernelCommand({
        workspaceRoot: context.workspaceRoot,
        commandName: "audit.llm.run",
        siteName: audit.siteName,
        siteExplicit: true,
        outputFormat: "json",
        argv,
        dryRun: false,
      });
      const single = Array.isArray(report) ? report[0] : report;
      if (single?.data) {
        results.push(single.data as AuditResult);
      }
    }
  }

  await mkdir(audit.onboardingAuditDirectory, { recursive: true });
  const reportPath = join(audit.onboardingAuditDirectory, "audit-report.md");
  const reportBody = renderAuditReportMarkdown(results);
  const reportDocument = [
    "---",
    `phase: 05-audit`,
    `derivedFromInputHash: ${JSON.stringify(phaseData?.inputHash ?? "")}`,
    `generatedAt: null`,
    `generator: ${JSON.stringify("app.qa.validate")}`,
    "---",
    "",
    reportBody,
  ].join("\n");
  await writeFile(reportPath, reportDocument, "utf8");

  const hasBlockingError = results.some(
    (result) => result.status === "fail" || result.status === "pending" || result.summary.error > 0,
  );

  return {
    data: {
      command: "app.qa.validate",
      app: audit.siteName,
      reportPath,
      results,
    },
    exitCode: hasBlockingError ? 1 : 0,
    summary: hasBlockingError
      ? `app.qa.validate: blocking audit findings in ${results.length} result(s)`
      : `app.qa.validate: OK (${results.length} result(s))`,
  };
}
