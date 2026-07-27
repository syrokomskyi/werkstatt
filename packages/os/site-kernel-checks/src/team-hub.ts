/*
<MODULE_CONTRACT>
<purpose>
  RFC-0509 team.hub.validate. Enforces the team hub page structure:
  - team page exists in system.md with semanticType: collection
  - team page has >=3 people blocks (human, organization-unit, ai-agent)
  - all people blocks have select.visibility: public and select.status: active
  - founder pageId absent from system.md
  - at least one 301 redirect exists in retiredRoutes (founder redirect)
  - navigation has team entry (not founder)
  No-op pass when the site has no team page.
</purpose>
<non-goals>
  <item>Do not validate participant records — that is participant.validate.</item>
  <item>Do not validate route resolution — that is route.topology.validate.</item>
  <item>Do not validate specific redirect slugs — site-specific slugs belong in system.md, not in shared validators.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0509: initial implementation.</item>
  <item>RFC-0509 review fix: replaced hardcoded gruender/zasnovnyk slugs with general 301 redirect existence check.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { loadSystemManifestSync, parseMarkdownFrontmatter } from "@gogol/site-kernel-content";
import { passResult, resultFromViolations } from "./result-helpers.ts";

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

export async function runTeamHubValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "team.hub.validate";
  const paths = requireAstroSitePaths(context);
  const { manifest } = loadSystemManifestSync(paths.contentDirectory);

  const pages = manifest.pages ?? [];
  const teamPage = pages.find((p) => p.pageId === "team") as
    ((typeof pages)[number] & { semanticType?: string }) | undefined;

  if (!teamPage) {
    return passResult(command, `${command}: OK — no team page (skipped)`);
  }

  const violations: string[] = [];

  const teamSemanticType = teamPage.semanticType ?? "content";
  if (teamSemanticType !== "collection") {
    violations.push(`team page has semanticType '${teamSemanticType}' — expected 'collection'`);
  }

  const founderPage = pages.find((p) => p.pageId === "founder");
  if (founderPage) {
    violations.push("founder pageId still exists in system.md — must be removed");
  }

  const retiredRoutes = manifest.retiredRoutes ?? [];
  const has301Redirect = retiredRoutes.some((r) => r.status === 301);
  if (!has301Redirect) {
    violations.push(
      "no 301 redirect found in retiredRoutes — founder redirect is required when team page exists",
    );
  }

  const langs = teamPage.routes ? Object.keys(teamPage.routes) : [];
  const requiredParticipantTypes = new Set(["human", "organization-unit", "ai-agent"]);
  const foundParticipantTypes = new Set<string>();

  for (const lang of langs) {
    const pageDir = join(paths.contentDirectory, "pages", lang);
    let files: string[];
    try {
      files = await readdir(pageDir);
    } catch {
      violations.push(`team page content directory not found: pages/${lang}/`);
      continue;
    }

    const teamFile = files.find((f) => f === "team.md");
    if (!teamFile) {
      violations.push(`team.md not found in pages/${lang}/`);
      continue;
    }

    const raw = await readFile(join(pageDir, teamFile), "utf-8");
    const data = parseMarkdownFrontmatter(raw).data as { blocks?: TeamHubBlock[] };
    const blocks = data.blocks ?? [];

    for (const block of blocks) {
      if (block.type === "people" && block.props?.select?.participantType) {
        foundParticipantTypes.add(block.props.select.participantType);

        if (block.props.select.visibility !== "public") {
          violations.push(
            `pages/${lang}/team.md: people block '${block.id ?? "?"}' has select.visibility '${block.props.select.visibility ?? "undefined"}' — expected 'public'`,
          );
        }
        if (block.props.select.status !== "active") {
          violations.push(
            `pages/${lang}/team.md: people block '${block.id ?? "?"}' has select.status '${block.props.select.status ?? "undefined"}' — expected 'active'`,
          );
        }
      }
    }
  }

  for (const required of requiredParticipantTypes) {
    if (!foundParticipantTypes.has(required)) {
      violations.push(`team page missing people block with select.participantType: ${required}`);
    }
  }

  for (const lang of langs) {
    const navPath = join(paths.contentDirectory, "navigation", lang, "navigation.md");
    let navRaw: string;
    try {
      navRaw = await readFile(navPath, "utf-8");
    } catch {
      continue;
    }
    const navData = parseMarkdownFrontmatter(navRaw).data as {
      targets?: Array<{ id: string; pageId?: string }>;
    };
    const targets = navData.targets ?? [];
    const hasTeam = targets.some((t) => t.id === "team");
    const hasFounder = targets.some((t) => t.id === "founder");
    if (!hasTeam) {
      violations.push(`navigation/${lang}/navigation.md: missing 'team' entry`);
    }
    if (hasFounder) {
      violations.push(
        `navigation/${lang}/navigation.md: 'founder' entry still present — must be replaced by 'team'`,
      );
    }
  }

  return resultFromViolations(command, violations);
}
