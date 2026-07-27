/*
<MODULE_CONTRACT>
<purpose>
  Report, action pack, audience review, and hints artifact builders for check-warpgogol OS commands.
  Re-exports makeCheckReport, makeAgentAction, makeAgentActionPack, renderReportHtml from @warpgogol/check-core.
  Also provides shared utility helpers (numberFlag) and audience/hints builders.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from commands/helpers.ts as part of the module split.</item>
</CHANGE_SUMMARY>
*/

import {
  type AudienceProfile,
  type AudienceReview,
  type SiteEvidenceGraph,
} from "@warpgogol/check-core";
import type { WarpgogolCheckHints } from "@warpgogol/share/check-hints";
import type { KernelCommandInput } from "@warpgogol/site-kernel";

export {
  makeAgentAction,
  makeAgentActionPack,
  makeCheckReport,
  renderReportHtml,
} from "@warpgogol/check-core";

export function numberFlag(input: KernelCommandInput, name: string, fallback: number): number {
  const value = input.flags[name];
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildAudienceReview(
  graph: SiteEvidenceGraph,
  profile: AudienceProfile,
  runId: string,
): AudienceReview {
  const recommendations: AudienceReview["recommendations"] = [];
  for (const page of graph.pages) {
    const lowerText = page.text.toLocaleLowerCase(profile.locale);
    for (const goal of profile.goals) {
      const goalToken = goal.split(/\s+/)[0]?.toLocaleLowerCase(profile.locale);
      if (goalToken && !lowerText.includes(goalToken) && page.text.length < 600) {
        recommendations.push({
          url: page.url,
          severity: "warning",
          message: `The page may not fully answer the audience goal: ${goal}`,
          changeHint:
            "Add a concrete section or paragraph that answers this audience goal in the visitor's language.",
        });
      }
    }
    if (
      profile.vocabulary.length > 0 &&
      !profile.vocabulary.some((word) => lowerText.includes(word.toLocaleLowerCase(profile.locale)))
    ) {
      recommendations.push({
        url: page.url,
        severity: "info",
        message: "Audience vocabulary is weakly represented in the rendered page text.",
        changeHint: `Consider naturally using terms such as: ${profile.vocabulary.slice(0, 5).join(", ")}.`,
      });
    }
  }
  const warningCount = recommendations.filter((r) => r.severity === "warning").length;
  return {
    schemaVersion: 1,
    runId,
    targetId: graph.targetId,
    profileId: profile.id,
    generatedAt: new Date().toISOString(),
    cached: false,
    verdict: warningCount > 0 ? "warn" : "pass",
    summary:
      warningCount > 0
        ? "The rendered site has audience-fit recommendations."
        : "The rendered site has no audience-fit warnings for this profile.",
    recommendations,
  };
}

export function buildHintsFromManifest(
  manifest: unknown,
  fallbackSiteId: string,
): WarpgogolCheckHints {
  const record = manifest as Record<string, unknown>;
  const i18n = record.i18n as { default?: string; supported?: Record<string, unknown> } | undefined;
  const supported = Object.keys(i18n?.supported ?? { [i18n?.default ?? "de"]: {} });
  const rawPages = Array.isArray(record.pages) ? (record.pages as unknown[]) : [];
  const pages = rawPages.filter(
    (p): p is Record<string, unknown> => typeof p === "object" && p !== null,
  );
  const preferredStartPaths = pages
    .map((page) =>
      typeof page.path === "string"
        ? page.path
        : typeof page.route === "string"
          ? page.route
          : undefined,
    )
    .filter((path): path is string => typeof path === "string" && path.startsWith("/"))
    .slice(0, 20);
  return {
    schemaVersion: 1,
    siteId: typeof record.app === "string" ? record.app : fallbackSiteId,
    generatedAt: new Date().toISOString(),
    baseUrl: typeof record.url === "string" ? record.url : undefined,
    languages: {
      default: i18n?.default ?? supported[0] ?? "de",
      supported: supported.length ? supported : [i18n?.default ?? "de"],
    },
    preferredStartPaths: preferredStartPaths.length ? preferredStartPaths : ["/"],
    sectionAnchors: [],
    audienceProfiles: ["business-owner"],
  };
}
