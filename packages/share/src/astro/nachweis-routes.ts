/*
<MODULE_CONTRACT>
<purpose>
  RFC-0708: build-time enumerator of Nachweis routes. Reads PBP EvidenceSource
  entities from the `business-profile` content collection with Nachweis evidence
  kinds (client-statement, project-confirmation, certificate, operational-evidence),
  filters by publication.visibility: published (excludes preview records), and
  materializes one virtual route per record (pageId `nachweis:<slug>`) in every
  supported language. Also generates verify routes with version suffixes.
  The single seam the route-registry merge uses; gated there by the
  `nachweis` entitlement. Mirrors people-routes.ts (no import of routes.ts,
  to avoid a cycle).
</purpose>
<non-goals>
  <item>Do not gate by entitlement — the registry merge owns the nachweis gate.</item>
  <item>Do not import routes.ts — keep this a leaf to avoid an import cycle.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0708: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { getCollection } from "astro:content";
import { getEntryLanguage, stripEntryLanguage, toDataEntryId } from "../content/entity-id.ts";

/** Nachweis evidence kinds from RFC-0706. */
const NACHWEIS_EVIDENCE_KINDS = new Set([
  "client-statement",
  "project-confirmation",
  "certificate",
  "operational-evidence",
]);

/** Synthetic pageId for a Nachweis detail page. */
export function nachweisPageId(slug: string): string {
  return `nachweis:${slug}`;
}

/** Synthetic pageId for a Nachweis verify page. */
export function nachweisVerifyPageId(slug: string, version: string): string {
  return `nachweis-verify:${slug}:${version}`;
}

export interface NachweisRouteEntry {
  pageId: string;
  slug: string;
  /** lang -> localized path (`/nachweise/<slug>`). */
  routes: Record<string, string>;
}

export interface NachweisVerifyRouteEntry {
  pageId: string;
  slug: string;
  version: string;
  /** lang -> localized path (`/nachweise/verify/<version>`). */
  routes: Record<string, string>;
}

interface SystemView {
  i18n?: { default?: string; supported?: Record<string, unknown> };
}

interface EvidenceSourceData {
  type?: string;
  kind?: string;
  publication?: { visibility?: string };
}

/**
 * Nachweis detail routes for every published EvidenceSource record with a
 * Nachweis evidence kind. Preview records are excluded — no route is
 * generated for them.
 */
export async function getNachweisRoutes(): Promise<NachweisRouteEntry[]> {
  const systemEntries = await getCollection("system");
  const system = (systemEntries.find((e: { id: string }) => e.id === "system")?.data ??
    {}) as SystemView;
  if (!system.i18n?.default) {
    throw new Error("[nachweis-routes] system.md i18n.default is required.");
  }
  const defaultLang = system.i18n.default;
  const supportedLangs = Object.keys(system.i18n.supported ?? { [defaultLang]: true });

  const entries = await getCollection("business-profile");
  const defaultLangEntries = entries.filter((e: { id: string }) => {
    const entryLang = getEntryLanguage(e.id);
    return entryLang === defaultLang;
  });

  const routesList: NachweisRouteEntry[] = [];
  for (const entry of defaultLangEntries) {
    const data = entry.data as EvidenceSourceData;
    if (data.type !== "evidence-source") continue;
    if (!data.kind || !NACHWEIS_EVIDENCE_KINDS.has(data.kind)) continue;

    // Only published records get routes — preview records are excluded
    const visibility = data.publication?.visibility;
    if (visibility !== "published") continue;

    const slug = stripEntryLanguage(toDataEntryId(entry.id));

    const routes: Record<string, string> = {};
    for (const lang of supportedLangs) {
      routes[lang] = `/nachweise/${slug}/`;
    }
    routesList.push({
      pageId: nachweisPageId(slug),
      slug,
      routes,
    });
  }
  return routesList;
}

/**
 * Nachweis verify routes for every published EvidenceSource record.
 * Generates version-suffixed routes (`/nachweise/verify/v1/`, etc.).
 * Preview records are excluded.
 */
export async function getNachweisVerifyRoutes(): Promise<NachweisVerifyRouteEntry[]> {
  const systemEntries = await getCollection("system");
  const system = (systemEntries.find((e: { id: string }) => e.id === "system")?.data ??
    {}) as SystemView;
  if (!system.i18n?.default) {
    throw new Error("[nachweis-routes] system.md i18n.default is required.");
  }
  const defaultLang = system.i18n.default;
  const supportedLangs = Object.keys(system.i18n.supported ?? { [defaultLang]: true });

  const entries = await getCollection("business-profile");
  const defaultLangEntries = entries.filter((e: { id: string }) => {
    const entryLang = getEntryLanguage(e.id);
    return entryLang === defaultLang;
  });

  const routesList: NachweisVerifyRouteEntry[] = [];
  for (const entry of defaultLangEntries) {
    const data = entry.data as EvidenceSourceData;
    if (data.type !== "evidence-source") continue;
    if (!data.kind || !NACHWEIS_EVIDENCE_KINDS.has(data.kind)) continue;

    const visibility = data.publication?.visibility;
    if (visibility !== "published") continue;

    const slug = stripEntryLanguage(toDataEntryId(entry.id));
    // Generate v1 verify route for each published record
    const version = "v1";

    const routes: Record<string, string> = {};
    for (const lang of supportedLangs) {
      routes[lang] = `/nachweise/verify/${version}/`;
    }
    routesList.push({
      pageId: nachweisVerifyPageId(slug, version),
      slug,
      version,
      routes,
    });
  }
  return routesList;
}
