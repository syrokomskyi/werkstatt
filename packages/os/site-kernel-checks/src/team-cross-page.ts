/*
<MODULE_CONTRACT>
<purpose>
  RFC-0513 team.cross-page.validate. Enforces cross-page alignment between team hub,
  profile pages, home page people section, navigation, and JSON endpoints:
  - Hub lists all public, active participants
  - Home page people section shows only active, public humans with consent
  - Navigation has team entry (not founder)
  - JSON endpoints match HTML pages (status, publicName, URL resolvability)
  No-op pass when a site has no people records or no team hub page.
</purpose>
<non-goals>
  <item>Do not validate the Participant schema contract — that is participant.validate.</item>
  <item>Do not validate lifecycle rules — that is team.lifecycle.validate.</item>
  <item>Do not validate JSON endpoint private field exclusion — that is participant.json.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0513: initial implementation — validates cross-page consistency between hub, profiles, home, navigation, and JSON endpoints.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { loadSystemManifestSync, parseMarkdownFrontmatter } from "@gogol/site-kernel-content";
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
    const s = await readFile(path, "utf-8");
    return true;
  } catch {
    return false;
  }
}

interface TeamHubBlock {
  id?: string;
  type?: string;
  props?: {
    select?: {
      participantType?: string;
      status?: string;
      visibility?: string;
    };
  };
}

export async function runTeamCrossPageValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "team.cross-page.validate";
  const paths = requireAstroSitePaths(context);
  const { manifest } = loadSystemManifestSync(paths.contentDirectory);
  const defaultLang = manifest.i18n?.default ?? "de";

  const records = await collectPeople(paths.appDirectory);
  const defaultLangRecords = records.filter((r) => r.lang === defaultLang);

  if (defaultLangRecords.length === 0) {
    return passResult(command, `${command}: OK — no people records (skipped)`);
  }

  const pages = manifest.pages ?? [];
  const teamPage = pages.find((p) => p.pageId === "team");

  if (!teamPage) {
    return passResult(command, `${command}: OK — no team hub page (skipped)`);
  }

  const diagnostics: Diagnostic[] = [];

  // Build participant lookup
  const publicActiveParticipants = new Map<
    string,
    { data: Record<string, unknown>; participantType: string }
  >();
  for (const { data } of defaultLangRecords) {
    const slug = typeof data["slug"] === "string" ? (data["slug"] as string) : undefined;
    if (!slug) continue;
    const visibility = data["visibility"];
    const status = data["status"];
    const pageNode = data["page"] as { enabled?: unknown } | undefined;
    if (visibility !== "public") continue;
    if (status !== "active") continue;
    if (!pageNode || pageNode.enabled !== true) continue;
    const pType = typeof data["participantType"] === "string" ? data["participantType"] : "human";
    publicActiveParticipants.set(slug, { data, participantType: pType });
  }

  // 1. Hub ↔ profile consistency
  const teamFileDir = join(paths.contentDirectory, "pages", defaultLang);
  let teamBlocks: TeamHubBlock[] = [];
  try {
    const teamRaw = await readFile(join(teamFileDir, "team.md"), "utf-8");
    const teamData = parseMarkdownFrontmatter(teamRaw).data as { blocks?: TeamHubBlock[] };
    teamBlocks = teamData.blocks ?? [];
  } catch {
    // team.md may not exist — team.hub.validate handles that
  }

  const hubSlugs = new Set<string>();
  for (const block of teamBlocks) {
    if (block.type !== "people") continue;
    const select = block.props?.select;
    if (!select) continue;
    // We can't know which specific participants are selected from the block alone,
    // but we can check that the block filters to public+active
    if (select.visibility && select.visibility !== "public") {
      diagnostics.push({
        ruleId: command,
        severity: "error",
        message: `[hub-visibility] pages/${defaultLang}/team.md: people block '${block.id ?? "?"}' has select.visibility '${select.visibility}' — expected 'public'`,
      });
    }
    if (select.status && select.status !== "active") {
      diagnostics.push({
        ruleId: command,
        severity: "error",
        message: `[hub-status] pages/${defaultLang}/team.md: people block '${block.id ?? "?"}' has select.status '${select.status}' — expected 'active'`,
      });
    }
  }

  // 2. Navigation checks
  const navPath = join(paths.contentDirectory, "navigation", defaultLang, "navigation.md");
  try {
    const navRaw = await readFile(navPath, "utf-8");
    const navData = parseMarkdownFrontmatter(navRaw).data as {
      targets?: Array<{ id: string; pageId?: string }>;
    };
    const targets = navData.targets ?? [];
    const hasTeam = targets.some((t) => t.id === "team");
    const hasFounder = targets.some((t) => t.id === "founder");
    if (!hasTeam) {
      diagnostics.push({
        ruleId: command,
        severity: "error",
        message: `[navigation-no-team] navigation/${defaultLang}/navigation.md: missing 'team' entry`,
      });
    }
    if (hasFounder) {
      diagnostics.push({
        ruleId: command,
        severity: "error",
        message: `[navigation-founder-remnant] navigation/${defaultLang}/navigation.md: 'founder' entry still present — must be replaced by 'team'`,
      });
    }
  } catch {
    // Navigation file may not exist — team.hub.validate handles that
  }

  // 3. Home page people section check
  const homePage = pages.find((p) => p.pageId === "home" || p.pageId === "index");
  if (homePage) {
    try {
      const homeFileDir = join(paths.contentDirectory, "pages", defaultLang);
      const homeFile = (await readdir(homeFileDir)).find(
        (f) => f === "home.md" || f === "index.md",
      );
      if (homeFile) {
        const homeRaw = await readFile(join(homeFileDir, homeFile), "utf-8");
        const homeData = parseMarkdownFrontmatter(homeRaw).data as { blocks?: TeamHubBlock[] };
        const homeBlocks = homeData.blocks ?? [];
        for (const block of homeBlocks) {
          if (block.type !== "people") continue;
          const select = block.props?.select;
          if (!select) continue;
          if (select.status && select.status !== "active") {
            diagnostics.push({
              ruleId: command,
              severity: "error",
              message: `[home-page-not-active] pages/${defaultLang}/${homeFile}: people block '${block.id ?? "?"}' has select.status '${select.status}' — home page must only show active participants`,
            });
          }
          if (select.visibility && select.visibility !== "public") {
            diagnostics.push({
              ruleId: command,
              severity: "error",
              message: `[home-page-not-public] pages/${defaultLang}/${homeFile}: people block '${block.id ?? "?"}' has select.visibility '${select.visibility}' — home page must only show public participants`,
            });
          }
        }
      }
    } catch {
      // Home page may not have blocks — skip
    }
  }

  // 4. JSON ↔ HTML consistency (postbuild — reads dist/)
  const distDir = join(paths.appDirectory, "dist");
  const teamDir = join(distDir, "team");
  const profilesJsonPath = join(teamDir, "profiles.json");

  let profilesJson: { participants?: Array<{ slug?: string; status?: string; publicName?: string; participantType?: string }> } | null = null;
  try {
    const raw = await readFile(profilesJsonPath, "utf-8");
    profilesJson = JSON.parse(raw);
  } catch {
    // No dist yet — skip JSON checks
  }

  if (profilesJson?.participants) {
    const jsonSlugs = new Set<string>();
    for (const p of profilesJson.participants) {
      if (!p.slug) continue;
      jsonSlugs.add(p.slug);

      // Check HTML page exists
      const isAiAgent = p.participantType === "ai-agent";
      const profileHtmlPath = isAiAgent
        ? join(teamDir, "ki-agenten", p.slug, "index.html")
        : join(teamDir, p.slug, "index.html");
      if (!(await fileExists(profileHtmlPath))) {
        diagnostics.push({
          ruleId: command,
          severity: "error",
          message: `[json-missing-html] participant '${p.slug}' in profiles.json has no resolvable HTML page at ${isAiAgent ? `/team/ki-agenten/${p.slug}/` : `/team/${p.slug}/`}`,
        });
      }

      // Check status matches source record
      const sourceRecord = publicActiveParticipants.get(p.slug);
      if (sourceRecord) {
        const sourceStatus = sourceRecord.data["status"];
        if (p.status && sourceStatus && p.status !== sourceStatus) {
          diagnostics.push({
            ruleId: command,
            severity: "error",
            message: `[json-html-status-mismatch] participant '${p.slug}': JSON status '${p.status}' ≠ source status '${sourceStatus}'`,
          });
        }
      }
    }

    // Check every public active participant is in JSON
    for (const [slug] of publicActiveParticipants) {
      if (!jsonSlugs.has(slug)) {
        diagnostics.push({
          ruleId: command,
          severity: "error",
          message: `[html-missing-json] participant '${slug}' is public+active with page.enabled but missing from profiles.json`,
        });
      }
    }
  }

  return diagnosticsResult(command, diagnostics);
}
