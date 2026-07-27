/*
<MODULE_CONTRACT>
<purpose>
  Registry-based dispatch for semantic site component content (RFC-0303 deepening).
  Each component path ("brand-label", "header", "footer", etc.) has a dedicated handler
  function that receives a shared context (labels + navigation targets) and returns its
  content shape. New component paths are added by registering a handler — the dispatcher
  is never edited.
</purpose>
<non-goals>
  <item>Do not export handlers individually — callers use the registry via resolveSiteContentData.</item>
  <item>Do not import from apps/* — handlers are app-agnostic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from astro/content.ts getSemanticSiteContentData — replaces 155-line if/else with registry dispatch.</item>
</CHANGE_SUMMARY>
*/

import { getEntry, getCollection } from "@warpgogol/content-source/astro";

// ---------------------------------------------------------------------------
// Shared helpers (moved from content.ts so handlers are self-contained)
// ---------------------------------------------------------------------------

export function normalizeComponentPath(componentPath: string): string {
  return componentPath.replace(/^\/+|\/+$/g, "").replace(/\\/g, "/");
}

export function getCollectionId(languageCode: string, componentPath: string): string {
  return `${languageCode}/${normalizeComponentPath(componentPath)}`;
}

let _knownIds: Map<string, Set<string>> = new Map();

export async function getKnownIdsForCollection(collectionName: string): Promise<Set<string>> {
  if (!_knownIds.has(collectionName)) {
    try {
      const all = (await getCollection(collectionName)) as Array<{ id: string }>;
      _knownIds.set(collectionName, new Set(all.map((e) => e.id)));
    } catch {
      _knownIds.set(collectionName, new Set());
    }
  }
  return _knownIds.get(collectionName)!;
}

// ---------------------------------------------------------------------------
// Handler context + type
// ---------------------------------------------------------------------------

type NavTarget = Record<string, unknown>;

export interface SiteContentContext {
  labels: Record<string, unknown> | undefined;
  targets: NavTarget[];
  languageCode: string;
  defaultLanguageCode: string;
  /**
   * Optional PBP entity slugs for the footer handler.
   * Sites override these to match their business-profile content structure.
   * Defaults: `contact/general-email`, `places/backnang`.
   */
  footerContactSlug?: string;
  footerPlaceSlug?: string;
}

export type SiteContentHandler = (
  ctx: SiteContentContext,
) => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;

// ---------------------------------------------------------------------------
// Individual handlers
// ---------------------------------------------------------------------------

const brandLabelHandler: SiteContentHandler = (ctx) => ({
  brandLabel: ctx.labels?.brandLabel,
  brandAriaLabel: ctx.labels?.brandAriaLabel,
  brandTagline: ctx.labels?.brandTagline,
  brandImage: ctx.labels?.brandImage,
});

const breadcrumbsHandler: SiteContentHandler = (ctx) =>
  ctx.labels?.breadcrumbs as Record<string, unknown> | undefined;

const langSwitcherHandler: SiteContentHandler = (ctx) =>
  ctx.labels?.langSwitcher as Record<string, unknown> | undefined;

const copyrightHandler: SiteContentHandler = (ctx) => ({ copyright: ctx.labels?.copyright });

const headerHandler: SiteContentHandler = (ctx) => {
  const header = ctx.labels?.header as Record<string, unknown> | undefined;
  const headerNavIds = header?.navIds as string[] | undefined;
  const navTargets = headerNavIds?.length
    ? headerNavIds
        .map((id) => ctx.targets.find((target) => target.id === id))
        .filter((target): target is NonNullable<typeof target> => target != null)
    : ctx.targets.filter((target) => target.group === "navigation");
  return {
    navAriaLabel: header?.navAriaLabel ?? "Main navigation",
    mobileNavAriaLabel: header?.mobileNavAriaLabel ?? "Mobile navigation",
    menuButtonAriaLabel: header?.menuButtonAriaLabel ?? "Open navigation menu",
    overflowMenuLabel: header?.overflowMenuLabel ?? "More",
    overflowMenuAriaLabel: header?.overflowMenuAriaLabel ?? "More navigation links",
    ctaLabel: header?.ctaLabel,
    motto: header?.motto,
    texture: header?.texture ?? true,
    navLinks: navTargets.map((target) => ({
      label: target.label,
      semanticTarget: target.semanticTarget,
    })),
  };
};

const DEFAULT_FOOTER_CONTACT_SLUG = "contact/general-email";
const DEFAULT_FOOTER_PLACE_SLUG = "places/backnang";

const footerHandler: SiteContentHandler = async (ctx) => {
  const bpIds = await getKnownIdsForCollection("business-profile");
  const contactSlug = ctx.footerContactSlug ?? DEFAULT_FOOTER_CONTACT_SLUG;
  const contactId = `${ctx.languageCode}/${contactSlug}`;
  const defaultContactId = `${ctx.defaultLanguageCode}/${contactSlug}`;
  const contactEntry = bpIds.has(contactId)
    ? await getEntry("business-profile", contactId)
    : bpIds.has(defaultContactId)
      ? await getEntry("business-profile", defaultContactId)
      : undefined;
  const contact = contactEntry?.data as Record<string, unknown> | undefined;

  const placeSlug = ctx.footerPlaceSlug ?? DEFAULT_FOOTER_PLACE_SLUG;
  const locationId = `${ctx.languageCode}/${placeSlug}`;
  const defaultLocationId = `${ctx.defaultLanguageCode}/${placeSlug}`;
  const locationEntry = bpIds.has(locationId)
    ? await getEntry("business-profile", locationId)
    : bpIds.has(defaultLocationId)
      ? await getEntry("business-profile", defaultLocationId)
      : undefined;
  const location = locationEntry?.data as Record<string, unknown> | undefined;
  const address = location?.address as Record<string, unknown> | undefined;

  const footer = ctx.labels?.footer as Record<string, unknown> | undefined;
  const navIds = footer?.navIds as string[] | undefined;
  const navTargets = ctx.targets.filter((target) => target.group === "navigation");
  const filteredNavTargets = navIds?.length
    ? navIds
        .map((id) => navTargets.find((target) => target.id === id))
        .filter((target): target is NonNullable<typeof target> => target != null)
    : navTargets;
  const navigationLinks = filteredNavTargets.map((target) => ({
    label: target.label,
    semanticTarget: target.semanticTarget,
  }));
  const legalIds = footer?.legalIds as string[] | undefined;
  const legalTargets = ctx.targets.filter((target) => target.group === "legal");
  const filteredLegalTargets = legalIds?.length
    ? legalIds
        .map((id) => legalTargets.find((target) => target.id === id))
        .filter((target): target is NonNullable<typeof target> => target != null)
    : legalTargets;
  const legalLinks = filteredLegalTargets.map((target) => ({
    label: target.label,
    semanticTarget: target.semanticTarget,
  }));

  return {
    qrAlt: footer?.qrAlt ?? "",
    taglineLines: footer?.taglineLines,
    motto: footer?.motto ?? ctx.labels?.brandTagline ?? "",
    pulseUrl: footer?.pulseUrl,
    texture: footer?.texture ?? true,
    backgroundImage: footer?.backgroundImage,
    navAriaLabel: footer?.navAriaLabel ?? "Footer navigation",
    navGroups: footer?.navGroups ?? {
      navigationTitle: "Navigation",
      legalTitle: "Legal",
      contactTitle: "Contact",
    },
    navigationLinks,
    legalLinks,
    disabledContactHref: footer?.disabledContactHref ?? "#",
    copyEmailAriaLabel: footer?.copyEmailAriaLabel ?? "Copy email address",
    copyEmailTitle: footer?.copyEmailTitle ?? "Copy email address",
    statusLinkTitleSuffix: footer?.statusLinkTitleSuffix,
    statusLinkAriaLabelSuffix: footer?.statusLinkAriaLabelSuffix,
    statusIconAriaLabel: footer?.statusIconAriaLabel,
    contact: {
      email: contact?.value,
      city: address?.locality,
      region: address?.administrativeArea,
      country: address?.countryCode,
    },
    contactIds: footer?.contactIds,
    copyrightSuffix: footer?.copyrightSuffix ?? "",
    photo: footer?.photo,
  };
};

const footerPromoHandler: SiteContentHandler = (ctx) =>
  (ctx.labels?.footerPromo as Record<string, unknown> | undefined) ?? { text: "", cards: [] };

// ---------------------------------------------------------------------------
// Registry — new component paths are added here only
// ---------------------------------------------------------------------------

const SITE_CONTENT_HANDLERS: Map<string, SiteContentHandler> = new Map([
  ["brand-label", brandLabelHandler],
  ["breadcrumbs", breadcrumbsHandler],
  ["lang-switcher", langSwitcherHandler],
  ["copyright", copyrightHandler],
  ["header", headerHandler],
  ["footer", footerHandler],
  ["footer-promo", footerPromoHandler],
]);

// ---------------------------------------------------------------------------
// Dispatcher — loads common context, looks up handler, delegates
// ---------------------------------------------------------------------------

export async function resolveSiteContentData(
  componentPath: string,
  languageCode: string,
  defaultLanguageCode: string,
): Promise<Record<string, unknown> | undefined> {
  const handler = SITE_CONTENT_HANDLERS.get(componentPath);
  if (!handler) {
    console.warn(`[content] Unknown componentPath for semantic site content: "${componentPath}".`);
    return undefined;
  }

  // Load common context shared by most handlers
  const siteIds = await getKnownIdsForCollection("site");
  const siteId = getCollectionId(languageCode, "labels");
  const defaultSiteId = getCollectionId(defaultLanguageCode, "labels");
  const siteEntry = siteIds.has(siteId)
    ? await getEntry("site", siteId)
    : siteIds.has(defaultSiteId)
      ? await getEntry("site", defaultSiteId)
      : undefined;
  const labels = siteEntry?.data as Record<string, unknown> | undefined;

  const navigationIds = await getKnownIdsForCollection("navigation");
  const navigationId = getCollectionId(languageCode, "navigation");
  const defaultNavigationId = getCollectionId(defaultLanguageCode, "navigation");
  const navigationEntry = navigationIds.has(navigationId)
    ? await getEntry("navigation", navigationId)
    : navigationIds.has(defaultNavigationId)
      ? await getEntry("navigation", defaultNavigationId)
      : undefined;
  const navData = navigationEntry?.data as { targets?: NavTarget[] } | undefined;
  const targets: NavTarget[] = Array.isArray(navData?.targets) ? navData.targets : [];

  const footerConfig = labels?.footer as Record<string, unknown> | undefined;
  const footerContactSlug = footerConfig?.contactSlug as string | undefined;
  const footerPlaceSlug = footerConfig?.placeSlug as string | undefined;

  return handler({
    labels,
    targets,
    languageCode,
    defaultLanguageCode,
    ...(footerContactSlug ? { footerContactSlug } : {}),
    ...(footerPlaceSlug ? { footerPlaceSlug } : {}),
  });
}
