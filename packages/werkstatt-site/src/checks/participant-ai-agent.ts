/*
<MODULE_CONTRACT>
<purpose>
  RFC-0511 participant.ai-agent.validate. Enforces the seven-block AI-agent profile page
  structure for public, active AI-agent participants:
  - aiAgent.accountableHumanId is set and resolves to a public, active human participant
  - aiAgent.autonomyLevel is one of A0–A4
  - aiAgent.purposeStatement is non-empty
  - prose files exist: {slug}-rechte.md, {slug}-verantwortlichkeit.md, {slug}-technik.md
  - (warning) aiAgent.technicalStand.lastEvaluatedAt older than 6 months
  - (warning) accountable human has no page.enabled: true
  No-op pass when the site has no AI-agent participants (same convention as participant.profile.validate).
</purpose>
<non-goals>
  <item>Do not validate the Participant schema contract — that is participant.validate.</item>
  <item>Do not validate the human profile page structure — that is participant.profile.validate.</item>
  <item>Do not read content via the Astro runtime — disk only, like participant.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0511: initial implementation — validates AI-agent profile structure, accountable human resolution, autonomy level enum, prose file presence.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { parseMarkdownFrontmatter, loadSystemManifestSync } from "@warpgogol/werkstatt-site/content";
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

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

const VALID_AUTONOMY_LEVELS = new Set(["A0", "A1", "A2", "A3", "A4"]);

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

export async function runParticipantAiAgentValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "participant.ai-agent.validate";
  const paths = requireAstroSitePaths(context);
  const { manifest } = loadSystemManifestSync(paths.contentDirectory);
  const defaultLang = manifest.i18n?.default ?? "de";

  const records = await collectPeople(paths.appDirectory);

  // Build a lookup of all human participants for accountableHumanId resolution
  const humanBySlug = new Map<string, { data: Record<string, unknown>; lang: string }>();
  for (const { lang, data } of records) {
    if (lang !== defaultLang) continue;
    const pType = data["participantType"];
    if (pType !== "human") continue;
    const slug =
      typeof data["slug"] === "string" && data["slug"] ? (data["slug"] as string) : undefined;
    if (slug) humanBySlug.set(slug, { data, lang });
  }

  // Filter to AI-agent participants in the default language
  const aiAgentRecords = records.filter((r) => {
    if (r.lang !== defaultLang) return false;
    const pType = r.data["participantType"];
    if (pType !== "ai-agent") return false;
    const pageNode = r.data["page"] as { enabled?: unknown } | undefined;
    if (!pageNode || pageNode.enabled !== true) return false;
    const visibility = r.data["visibility"];
    if (visibility === "private") return false;
    return true;
  });

  if (aiAgentRecords.length === 0) {
    return passResult(command, `${command}: OK — no AI-agent participants (skipped)`);
  }

  const diagnostics: Diagnostic[] = [];
  const proseBaseDir = join(paths.appDirectory, "src", "content", "prose");

  for (const { lang, file, data } of aiAgentRecords) {
    const slug = typeof data["slug"] === "string" && data["slug"] ? (data["slug"] as string) : file;

    const id = `${lang}/${slug}`;
    const aiAgent = data["aiAgent"];

    if (!isObject(aiAgent)) {
      diagnostics.push({
        ruleId: command,
        severity: "error",
        message: `[ai-agent-missing] ${id}: aiAgent sub-object is required for participantType: ai-agent`,
      });
      continue;
    }

    // aiAgent.accountableHumanId must be set and resolve to a public, active human
    const accountableHumanId = aiAgent["accountableHumanId"];
    if (typeof accountableHumanId !== "string" || accountableHumanId.trim() === "") {
      diagnostics.push({
        ruleId: command,
        severity: "error",
        message: `[ai-agent-missing-accountable-human] ${id}: aiAgent.accountableHumanId is missing or empty`,
      });
    } else {
      const human = humanBySlug.get(accountableHumanId);
      if (!human) {
        diagnostics.push({
          ruleId: command,
          severity: "error",
          message: `[ai-agent-unresolved-accountable-human] ${id}: aiAgent.accountableHumanId '${accountableHumanId}' does not resolve to a human participant`,
        });
      } else {
        const humanVisibility = human.data["visibility"];
        const humanStatus = human.data["status"];
        if (humanVisibility === "private") {
          diagnostics.push({
            ruleId: command,
            severity: "error",
            message: `[ai-agent-accountable-human-private] ${id}: aiAgent.accountableHumanId '${accountableHumanId}' is private — must be public`,
          });
        }
        if (humanStatus !== undefined && humanStatus !== "active") {
          diagnostics.push({
            ruleId: command,
            severity: "error",
            message: `[ai-agent-accountable-human-inactive] ${id}: aiAgent.accountableHumanId '${accountableHumanId}' is not active (status: '${humanStatus}')`,
          });
        }
        // Warning: accountable human has no profile page
        const humanPage = human.data["page"] as { enabled?: unknown } | undefined;
        if (!humanPage || humanPage.enabled !== true) {
          diagnostics.push({
            ruleId: command,
            severity: "warning",
            message: `[ai-agent-accountable-human-no-profile] ${id}: accountable human '${accountableHumanId}' has no profile page (page.enabled !== true)`,
          });
        }
      }
    }

    // aiAgent.autonomyLevel must be A0–A4
    const autonomyLevel = aiAgent["autonomyLevel"];
    if (typeof autonomyLevel !== "string" || !VALID_AUTONOMY_LEVELS.has(autonomyLevel)) {
      diagnostics.push({
        ruleId: command,
        severity: "error",
        message: `[ai-agent-invalid-autonomy] ${id}: aiAgent.autonomyLevel '${autonomyLevel}' is not one of A0–A4`,
      });
    }

    // aiAgent.purposeStatement must be non-empty
    const purposeStatement = aiAgent["purposeStatement"];
    if (typeof purposeStatement !== "string" || purposeStatement.trim() === "") {
      diagnostics.push({
        ruleId: command,
        severity: "error",
        message: `[ai-agent-empty-purpose] ${id}: aiAgent.purposeStatement is missing or empty`,
      });
    }

    // Required prose files: rechte, verantwortlichkeit, technik
    const requiredProse = [
      { suffix: "rechte", label: "rights" },
      { suffix: "verantwortlichkeit", label: "accountability" },
      { suffix: "technik", label: "technical" },
    ];
    for (const { suffix, label } of requiredProse) {
      const prosePath = join(proseBaseDir, lang, `${slug}-${suffix}.md`);
      if (!(await fileExists(prosePath))) {
        diagnostics.push({
          ruleId: command,
          severity: "error",
          message: `[ai-agent-missing-prose] ${id}: ${label} prose file not found at src/content/prose/${lang}/${slug}-${suffix}.md`,
        });
      }
    }

    // Warning: technicalStand.lastEvaluatedAt older than 6 months
    const technicalStand = aiAgent["technicalStand"];
    if (isObject(technicalStand)) {
      const lastEvaluatedAt = technicalStand["lastEvaluatedAt"];
      if (typeof lastEvaluatedAt === "string" && lastEvaluatedAt) {
        const evalDate = new Date(lastEvaluatedAt);
        if (!isNaN(evalDate.getTime())) {
          const ageMs = Date.now() - evalDate.getTime();
          if (ageMs > SIX_MONTHS_MS) {
            diagnostics.push({
              ruleId: command,
              severity: "warning",
              message: `[ai-agent-stale-evaluation] ${id}: aiAgent.technicalStand.lastEvaluatedAt '${lastEvaluatedAt}' is older than 6 months`,
            });
          }
        }
      }
    }
  }

  return diagnosticsResult(command, diagnostics);
}
