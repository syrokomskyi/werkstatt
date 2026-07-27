/*
<MODULE_CONTRACT>
<purpose>
  RFC-0513 team.lifecycle.validate. Enforces lifecycle rules for Participant records:
  - No CTA for former/retired participants
  - No public visibility for draft/suspended participants
  - Warning: consent review overdue (>12 months)
  - Warning: profile review overdue (>12 months)
  - Warning: AI-agent technical evaluation overdue (>6 months)
  - Warning: nextReviewAt in the past
  - Warning: aiAgent.technicalStand.nextEvaluationAt in the past
  No-op pass when a site has no Participant records.
</purpose>
<non-goals>
  <item>Do not validate the Participant schema contract — that is participant.validate.</item>
  <item>Do not validate profile page structure — that is participant.profile.validate / participant.ai-agent.validate.</item>
  <item>Do not validate cross-page consistency — that is team.cross-page.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0513: initial implementation — validates lifecycle status rules and review cadence.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { parseMarkdownFrontmatter, loadSystemManifestSync } from "@warpgogol/site-kernel-content";
import { diagnosticsResult, passResult } from "./result-helpers.ts";

interface PeopleRecord {
  lang: string;
  file: string;
  data: Record<string, unknown>;
}

async function collectPeople(appDir: string): Promise<PeopleRecord[]> {
  const peopleBaseDir = join(appDir, "src", "content", "people");
  const records: PeopleRecord[] = [];
  let langs: import("node:fs").Dirent[];
  try {
    langs = await readdir(peopleBaseDir, { withFileTypes: true });
  } catch {
    return records;
  }
  for (const langEntry of langs) {
    if (!langEntry.isDirectory()) continue;
    const lang = langEntry.name;
    const peopleDir = join(peopleBaseDir, lang);
    let files: import("node:fs").Dirent[];
    try {
      files = await readdir(peopleDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".md")) continue;
      const raw = await readFile(join(peopleDir, f.name), "utf-8");
      const data = parseMarkdownFrontmatter(raw).data as Record<string, unknown>;
      records.push({ lang, file: `${lang}/people/${f.name}`, data });
    }
  }
  return records;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const TWELVE_MONTHS_MS = 1000 * 60 * 60 * 24 * 365;
const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

function isStale(dateStr: string, maxAgeMs: number): boolean {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > maxAgeMs;
}

function isPast(dateStr: string): boolean {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

export async function runTeamLifecycleValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "team.lifecycle.validate";
  const paths = requireAstroSitePaths(context);
  const { manifest } = loadSystemManifestSync(paths.contentDirectory);
  const defaultLang = manifest.i18n?.default ?? "de";

  const records = await collectPeople(paths.appDirectory);
  const defaultLangRecords = records.filter((r) => r.lang === defaultLang);

  if (defaultLangRecords.length === 0) {
    return passResult(command, `${command}: OK — no people records (skipped)`);
  }

  const diagnostics: Diagnostic[] = [];

  for (const { file, data } of defaultLangRecords) {
    const slug =
      typeof data["slug"] === "string" && data["slug"] ? (data["slug"] as string) : file;
    const id = `${defaultLang}/${slug}`;
    const status = typeof data["status"] === "string" ? data["status"] : undefined;
    const visibility = typeof data["visibility"] === "string" ? data["visibility"] : undefined;
    const cta = data["cta"];
    const hasCta = isObject(cta) || typeof cta === "string";

    // Error: CTA on former/retired
    if ((status === "former" || status === "retired") && hasCta) {
      diagnostics.push({
        ruleId: command,
        severity: "error",
        message: `[cta-on-former] ${id}: status '${status}' participant must not have a cta field`,
      });
    }

    // Error: public visibility for draft
    if (status === "draft" && visibility === "public") {
      diagnostics.push({
        ruleId: command,
        severity: "error",
        message: `[public-draft] ${id}: draft participant must not have visibility: public`,
      });
    }

    // Error: public visibility for suspended
    if (status === "suspended" && visibility === "public") {
      diagnostics.push({
        ruleId: command,
        severity: "error",
        message: `[public-suspended] ${id}: suspended participant must not have visibility: public`,
      });
    }

    // Warning: consent review overdue
    const consent = data["consent"];
    if (isObject(consent)) {
      const consentDate = consent["consentDate"];
      if (typeof consentDate === "string" && consentDate) {
        if (isStale(consentDate, TWELVE_MONTHS_MS)) {
          diagnostics.push({
            ruleId: command,
            severity: "warning",
            message: `[consent-review-due] ${id}: consent.consentDate '${consentDate}' is older than 12 months`,
          });
        }
      }
    }

    // Warning: profile review overdue
    const lastReviewedAt = data["lastReviewedAt"];
    if (typeof lastReviewedAt === "string" && lastReviewedAt) {
      if (isStale(lastReviewedAt, TWELVE_MONTHS_MS)) {
        diagnostics.push({
          ruleId: command,
          severity: "warning",
          message: `[profile-review-due] ${id}: lastReviewedAt '${lastReviewedAt}' is older than 12 months`,
        });
      }
    }

    // Warning: nextReviewAt in past
    const nextReviewAt = data["nextReviewAt"];
    if (typeof nextReviewAt === "string" && nextReviewAt) {
      if (isPast(nextReviewAt)) {
        diagnostics.push({
          ruleId: command,
          severity: "warning",
          message: `[next-review-past] ${id}: nextReviewAt '${nextReviewAt}' is in the past`,
        });
      }
    }

    // AI-agent specific checks
    const aiAgent = data["aiAgent"];
    if (isObject(aiAgent)) {
      const technicalStand = aiAgent["technicalStand"];
      if (isObject(technicalStand)) {
        const lastEvaluatedAt = technicalStand["lastEvaluatedAt"];
        if (typeof lastEvaluatedAt === "string" && lastEvaluatedAt) {
          if (isStale(lastEvaluatedAt, SIX_MONTHS_MS)) {
            diagnostics.push({
              ruleId: command,
              severity: "warning",
              message: `[stale-technical-evaluation] ${id}: aiAgent.technicalStand.lastEvaluatedAt '${lastEvaluatedAt}' is older than 6 months`,
            });
          }
        }

        const nextEvaluationAt = technicalStand["nextEvaluationAt"];
        if (typeof nextEvaluationAt === "string" && nextEvaluationAt) {
          if (isPast(nextEvaluationAt)) {
            diagnostics.push({
              ruleId: command,
              severity: "warning",
              message: `[next-evaluation-past] ${id}: aiAgent.technicalStand.nextEvaluationAt '${nextEvaluationAt}' is in the past`,
            });
          }
        }
      }
    }
  }

  return diagnosticsResult(command, diagnostics);
}
