/*
<MODULE_CONTRACT>
<purpose>
  RFC-0508: build-time enumerator of per-member profile routes. Reads the `people`
  collection for Participant records with `page.enabled`, `visibility: public`, and
  `status: active`, and materializes one virtual route per participant (pageId
  `participant:<slug>`) in every supported language, under a localized base segment.
  The single seam the route-registry merge uses; gated there by the
  `team.profiles` entitlement. Mirrors surface-routes.ts (no import of routes.ts,
  to avoid a cycle).
</purpose>
<non-goals>
  <item>Do not gate by entitlement — the registry merge owns the team.profiles gate.</item>
  <item>Do not import routes.ts — keep this a leaf to avoid an import cycle.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0200: initial implementation.</item>
  <item>RFC-0508: renamed personPageId to participantPageId, getPersonProfileRoutes to getParticipantProfileRoutes, PersonRouteEntry to ParticipantRouteEntry. Added visibility/status filters.</item>
  <item>RFC-0510: changed breadcrumb parent from about page to team page (pageId === "team" or semanticType === "collection"). Team page takes precedence over about page.</item>
  <item>RFC-0511: added AI_AGENT_SEGMENT_SUFFIX_BY_LANG and AI-agent route generation (appends suffix to team page base for participantType: ai-agent).</item>
</CHANGE_SUMMARY>
*/

import { getCollection } from "astro:content";
import { getEntryLanguage, stripEntryLanguage, toDataEntryId } from "../content/entity-id.ts";
import { DEFAULT_PROFILE_BASE_BY_LANG } from "./people-profile-defaults.ts";

/** RFC-0511: localized suffix appended to the team page base segment for AI-agent routes. */
export const AI_AGENT_SEGMENT_SUFFIX_BY_LANG: Record<string, string> = {
  de: "ki-agenten",
  en: "ai-agents",
  uk: "ki-agenty",
};

/** RFC-0508: synthetic pageId for a participant's profile page. */
export function participantPageId(slug: string): string {
  return `participant:${slug}`;
}

/** @deprecated Use participantPageId instead. */
export function personPageId(slug: string): string {
  return participantPageId(slug);
}

export interface ParticipantRouteEntry {
  pageId: string;
  slug: string;
  /** lang -> localized path (`<base>/<slug>`). */
  routes: Record<string, string>;
  /**
   * RFC-0229/0510: the Team page this profile lives under, so the breadcrumb trail nests
   * `Home → Team → <Participant>` (matching the URL `<team-slug>/<participant-slug>`).
   * Falls back to the About page when no Team page exists. Absent when neither exists
   * (profiles then fall back to a flat `Home → <Participant>` trail).
   */
  parentPageId?: string;
}

/** @deprecated Use ParticipantRouteEntry instead. */
export type PersonRouteEntry = ParticipantRouteEntry;

interface SystemView {
  i18n?: { default?: string; supported?: Record<string, unknown> };
  pages?: Array<{
    pageId?: string;
    semanticType?: string;
    routes?: Record<string, string>;
  }>;
}

/**
 * Profile routes for every Participant record whose default-language anchor sets
 * `page.enabled: true`, `visibility: public`, and `status: active`. The base segment
 * per language is the site's About/team page slug when one exists, else a localized
 * default (`team` / `komanda`).
 */
export async function getParticipantProfileRoutes(): Promise<ParticipantRouteEntry[]> {
  const systemEntries = await getCollection("system");
  const system = (systemEntries.find((e: { id: string }) => e.id === "system")?.data ??
    {}) as SystemView;
  if (!system.i18n?.default) {
    throw new Error("[participant-routes] system.md i18n.default is required.");
  }
  const defaultLang = system.i18n.default;
  const supportedLangs = Object.keys(system.i18n.supported ?? { [defaultLang]: true });

  // RFC-0510: prefer the Team page (pageId === "team") as the breadcrumb parent and base
  // segment. Fall back to any collection-typed page, then the About page.
  const teamPage =
    (system.pages ?? []).find((p) => p.pageId === "team") ??
    (system.pages ?? []).find((p) => p.semanticType === "collection");
  const aboutPage = (system.pages ?? []).find((p) => p.semanticType === "about");
  const parentPage = teamPage ?? aboutPage;
  const parentPageId = typeof parentPage?.pageId === "string" ? parentPage.pageId : undefined;
  const baseFor = (lang: string): string =>
    parentPage?.routes?.[lang] ?? DEFAULT_PROFILE_BASE_BY_LANG[lang] ?? "team";

  const entries = await getCollection("people");
  const participants = entries.filter((e: { id: string }) => {
    const entryLang = getEntryLanguage(e.id);
    return entryLang === defaultLang;
  });

  const routesList: ParticipantRouteEntry[] = [];
  for (const entry of participants) {
    const entryLang = getEntryLanguage(entry.id) ?? defaultLang;
    if (entryLang !== defaultLang) continue; // page.enabled lives on the anchor
    const data = entry.data as Record<string, unknown>;
    const page = data["page"] as { enabled?: unknown } | undefined;
    if (!page || page.enabled !== true) continue;
    // RFC-0508: only public, active participants get profile routes
    const visibility = data["visibility"];
    const status = data["status"];
    if (visibility === "private") continue;
    if (status !== undefined && status !== "active") continue;
    const slug =
      typeof data["slug"] === "string"
        ? (data["slug"] as string)
        : stripEntryLanguage(toDataEntryId(entry.id));

    const routes: Record<string, string> = {};
    const pType = data["participantType"];
    const isAiAgent = pType === "ai-agent";
    for (const lang of supportedLangs) {
      const base = baseFor(lang);
      routes[lang] = isAiAgent
        ? `${base}/${AI_AGENT_SEGMENT_SUFFIX_BY_LANG[lang] ?? "ki-agenten"}/${slug}`
        : `${base}/${slug}`;
    }
    routesList.push({
      pageId: participantPageId(slug),
      slug,
      routes,
      ...(parentPageId ? { parentPageId: parentPageId } : {}),
    });
  }
  return routesList;
}

/** @deprecated Use getParticipantProfileRoutes instead. */
export async function getPersonProfileRoutes(): Promise<ParticipantRouteEntry[]> {
  return getParticipantProfileRoutes();
}
