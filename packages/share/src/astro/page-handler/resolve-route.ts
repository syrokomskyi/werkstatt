/*
<MODULE_CONTRACT>
<purpose>
  [DNA-07][DNA-25][RFC-0026] Universal page route data pipeline. resolvePageRoute() is called
  once per route file and returns everything the route needs: route registry lookup, content
  entry resolution with default-language fallback, system.md shell/growth config, buildPage
  invocation, alternate link generation, localized sibling path computation, biome, layout
  labels, and optional semantic model building via callback.
</purpose>
<non-goals>
  <item>Do not import from @gogol/pbp — semantic model is injected via optional callback.</item>
  <item>Do not render Astro components — this is a build-time data pipeline.</item>
  <item>Do not access Astro global — callers pass Astro.url.origin as siteUrl.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of astro/page-handler.ts (Phase 3 file-size split); helper functions moved to content-fallback.ts and semantic.ts.</item>
  <item>RFC-0510: replaced two-block personSynthetic with buildHumanProfileBlocks six-block structure (hero, responsibility, evidence, career, personal, cta).</item>
  <item>RFC-0511: added buildAiAgentProfileBlocks seven-block structure and participantType dispatch (human vs ai-agent).</item>
  <item>RFC-0512: inject SoftwareApplication JSON-LD for AI-agent profiles, extended Person JSON-LD for human profiles, and CollectionPage JSON-LD for team hub via extraGraphNodes.</item>
  <item>RFC-0513: add status badge to hero block tagline for non-active participants (former, retired, on-leave, temporarily-unavailable, suspended).</item>
</CHANGE_SUMMARY>
*/

// RFC-0141: content reads flow through the Content Source Provider port (the single named
// seam that owns the astro:content dependency), not astro:content directly.
import { getCollection, getEntry } from "@gogol/content-source/astro";
import { EMPTY_RUNTIME_CONTEXT } from "../../runtime-context.ts";
import { buildPage, type PageEntry, type ResolvedPage, type ShellBlockConfig } from "../../page.ts";
import { createDevPropsValidator } from "../../dev-props-validator.ts";
import type { SemanticBreadcrumb } from "../../semantic/models.ts";
import type { BreadcrumbAncestorResolver } from "../../semantic/breadcrumbs.ts";
import { buildBreadcrumbTrail } from "../../semantic/breadcrumbs.ts";
import { resolvePageOutput } from "../../semantic/output-projection.ts";
import {
  getAlternateLinks,
  getRouteRegistry,
  resolvePageIdFromPath,
  resolveLocalizedPagePath,
  localizeUrl,
} from "../routes.ts";
import { getSurfaceEntryByPageId, getSurfaceEntries } from "../surface-routes.ts";
import { getParticipantsForSection, participantPageId, type ParticipantView } from "../people.ts";
import {
  buildSoftwareApplicationJsonLd,
  buildPersonJsonLd,
  buildTeamHubCollectionPageJsonLd,
} from "../participant-json.ts";
import {
  resolveTranslationContext,
  type PageTranslationPolicy,
} from "../../legal/translation-policy.ts";
import type { ResolvedTranslationContext } from "../../legal/translation-policy.ts";
import { pageIdToContentFileSlug } from "../../content/entity-id.ts";
import { deepMergeEntryData } from "../../content/merge.ts";
import { getSiteLabelsData } from "../content.ts";
import {
  deriveOrchestratorConfig,
  substituteBlockPropReferences,
  resolveSurfaceAncestors,
  resolveAuthoredAncestors,
  injectBreadcrumbsBlock,
} from "./semantic.ts";
import {
  loadLocalizedPageEntry,
  applySharedContextFallback,
  buildSurfaceRedirectResult,
  type SharedContextPageEntry,
} from "./content-fallback.ts";
import type {
  SystemGrowthBlock,
  SemanticModelOptions,
  PageRouteData,
  ResolvePageRouteOptions,
} from "./types.ts";

export type {
  SystemGrowthBlock,
  SemanticModelOptions,
  PageRouteData,
  ResolvePageRouteOptions,
} from "./types.ts";
export { deriveOrchestratorConfig, type OrchestratorConfig } from "./semantic.ts";

// RFC-0262: one validator instance per process — createDevPropsValidator()
// memoizes workspace-root and per-planet schema resolution internally, so
// reusing the instance avoids re-walking the filesystem on every route.
let cachedDevPropsValidator: ReturnType<typeof createDevPropsValidator> | undefined;
function devPropsValidator(): ReturnType<typeof createDevPropsValidator> {
  cachedDevPropsValidator ??= createDevPropsValidator();
  return cachedDevPropsValidator;
}

/**
 * RFC-0513: Status badge text for non-active participants.
 * Returns undefined for active/draft (no badge).
 */
function statusBadge(status: string | undefined, lang: string): string | undefined {
  if (!status || status === "active" || status === "draft") return undefined;
  const badges: Record<string, Record<string, string>> = {
    former: { de: "Ehemaliges Mitglied", uk: "Колишній учасник" },
    retired: { de: "Im Ruhestand", uk: "На пенсії" },
    "on-leave": { de: "Beurlaubt", uk: "У відпустці" },
    "temporarily-unavailable": { de: "Vorübergehend nicht verfügbar", uk: "Тимчасово недоступний" },
    suspended: { de: "Gesperrt", uk: "Призупинено" },
  };
  const entry = badges[status];
  if (!entry) return undefined;
  return entry[lang] ?? entry["de"];
}

/**
 * RFC-0510: Build the six-block human profile page structure from a ParticipantView.
 * Blocks: hero, controlled-responsibility-block, evidence markdown, career markdown,
 * personal markdown (consent-gated), final-cta.
 */
function buildHumanProfileBlocks(
  participant: ParticipantView | undefined,
  slug: string,
  lang: string,
): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const name = participant?.name ?? slug;
  const pageId = participantPageId(slug);

  // RFC-0513: Status badge for non-active participants
  const badge = statusBadge(participant?.status, lang);

  // Block 1: Hero (professional identity only — no statement, no stats)
  blocks.push({
    id: "hero",
    type: "hero",
    props: {
      header: {
        heading: name,
        subheading: participant?.role,
        level: 1,
      },
      leadImage: participant?.photo ? { src: participant.photo, alt: name } : undefined,
      tagline: badge ?? participant?.location,
      backgroundImage: "home-bg",
      imageAlt: name,
    },
  });

  // Block 2: Responsibility & Authority (split-list, omitted when both absent)
  const hasResponsibility =
    participant?.responsibility?.summary || participant?.responsibility?.scope;
  const hasAuthority =
    (participant?.authority?.canSignFor?.length ?? 0) > 0 ||
    (participant?.authority?.canCommitTo?.length ?? 0) > 0;
  if (hasResponsibility || hasAuthority) {
    blocks.push({
      id: "responsibility",
      type: "controlled-responsibility-block",
      props: {
        header: {
          heading: "Verantwortung & Entscheidungsbefugnis",
          subheading: "Für diese Entscheidungen und Ergebnisse trage ich persönlich.",
        },
        body: {
          labels: { primary: "Verantwortung", secondary: "Entscheidungsbefugnis" },
          primaryItems: [
            ...(participant?.responsibility?.summary
              ? [{ text: participant.responsibility.summary }]
              : []),
            ...(participant?.responsibility?.scope
              ? [{ text: participant.responsibility.scope }]
              : []),
          ],
          secondaryItems: [
            ...(participant?.authority?.canSignFor ?? []).map((s) => ({ text: s })),
            ...(participant?.authority?.canCommitTo ?? []).map((c) => ({ text: c })),
          ],
        },
      },
    });
  }

  // Block 3: Evidence (prose file)
  blocks.push({
    id: "evidence",
    type: "markdown",
    props: {
      header: {
        heading: "Nachweise & Beiträge",
        subheading: "Belegte Ergebnisse und öffentlich zugängliche Arbeiten.",
      },
      contentRef: `prose/${slug}-nachweise`,
      hideSectionNumber: true,
      pageId,
    },
  });

  // Block 4: Career (prose file)
  blocks.push({
    id: "career",
    type: "markdown",
    props: {
      header: {
        heading: "Beruflicher Werdegang",
      },
      contentRef: `prose/${slug}-beruflich`,
      hideSectionNumber: true,
      pageId,
    },
  });

  // Block 5: Personal (consent-gated prose file)
  const hasPersonalConsent = participant?.consent?.approvedFields?.includes("bio");
  if (hasPersonalConsent) {
    blocks.push({
      id: "personal",
      type: "markdown",
      props: {
        header: {
          heading: "Persönlicher Hintergrund",
          subheading: "Private Einblicke, die ich freiwillig teile.",
        },
        contentRef: `prose/${slug}-persoenlich`,
        hideSectionNumber: true,
        pageId,
      },
    });
  }

  // Block 6: CTA (omitted for former/retired)
  if (participant?.cta && participant.status !== "former" && participant.status !== "retired") {
    blocks.push({
      id: "cta",
      type: "final-cta",
      props: {
        header: { heading: participant.cta.label, align: "center" },
        ctaGroup: {
          align: "center",
          items: [
            {
              label: participant.cta.label,
              variant: "primary",
              target: { kind: "internal", pageId: participant.cta.target },
            },
          ],
        },
      },
    });
  }

  return blocks;
}

/**
 * RFC-0511: Localized autonomy level labels for A0–A4.
 */
const AUTONOMY_LABELS: Record<string, Record<string, string>> = {
  A0: { de: "Keine Autonomie", uk: "Без автономії", en: "No autonomy" },
  A1: { de: "Vorgeschlagene Aktionen", uk: "Пропоновані дії", en: "Suggested actions" },
  A2: {
    de: "Autonome Ausführung mit Freigabe",
    uk: "Автономне виконання з погодженням",
    en: "Autonomous execution with approval",
  },
  A3: {
    de: "Autonome Ausführung mit Benachrichtigung",
    uk: "Автономне виконання з повідомленням",
    en: "Autonomous execution with notification",
  },
  A4: { de: "Vollautonom", uk: "Повністю автономний", en: "Fully autonomous" },
};

function autonomyLabel(level: string, lang: string): string {
  return AUTONOMY_LABELS[level]?.[lang] ?? AUTONOMY_LABELS[level]?.["de"] ?? level;
}

/**
 * RFC-0511: Build the seven-block AI-agent profile page structure from a ParticipantView.
 * Blocks: hero, purpose (controlled-responsibility-block), rights (markdown),
 * accountability (markdown), technical (markdown), limitations (markdown), cta.
 */
function buildAiAgentProfileBlocks(
  participant: ParticipantView,
  lang: string,
): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const ai = participant.aiAgent;
  const name = participant.publicName ?? participant.name ?? participant.slug;
  const pageId = participantPageId(participant.slug);

  // Block 1: Hero (name, purpose, autonomy level — no portrait)
  // RFC-0513: Status badge takes precedence over purposeStatement for non-active participants
  const badge = statusBadge(participant.status, lang);
  blocks.push({
    id: "hero",
    type: "hero",
    props: {
      header: {
        heading: name,
        subheading: ai ? autonomyLabel(ai.autonomyLevel, lang) : undefined,
        level: 1,
      },
      tagline: badge ?? ai?.purposeStatement,
      backgroundImage: "home-bg",
    },
  });

  // Block 2: Purpose & Capabilities (split-list, same body kind as RFC-0510)
  blocks.push({
    id: "purpose",
    type: "controlled-responsibility-block",
    props: {
      header: {
        heading: "Zweck & Funktionsumfang",
        subheading: "Welche Aufgabe dieser Agent erfüllt und welche Fähigkeiten er hat.",
      },
      body: {
        labels: { primary: "Zweck", secondary: "Fähigkeiten" },
        primaryItems: ai ? [{ text: ai.purposeStatement }] : [],
        secondaryItems: (participant.capabilities ?? []).map((c) => ({ text: c })),
      },
    },
  });

  // Block 3: Rights (prose file)
  blocks.push({
    id: "rights",
    type: "markdown",
    props: {
      header: {
        heading: "Autonomie & Handlungsrechte",
        subheading: "Was dieser Agent tun darf und was menschliche Freigabe erfordert.",
      },
      contentRef: `prose/${participant.slug}-rechte`,
      hideSectionNumber: true,
      pageId,
    },
  });

  // Block 4: Accountability (prose file)
  blocks.push({
    id: "accountability",
    type: "markdown",
    props: {
      header: {
        heading: "Verantwortlichkeit & Eskalation",
        subheading: "Welche Person für diesen Agenten verantwortlich ist und wie eskaliert wird.",
      },
      contentRef: `prose/${participant.slug}-verantwortlichkeit`,
      hideSectionNumber: true,
      pageId,
    },
  });

  // Block 5: Technical Stand (prose file)
  blocks.push({
    id: "technical",
    type: "markdown",
    props: {
      header: {
        heading: "Technischer Stand",
        subheading: "Modellfamilie und Überprüfungszyklus.",
      },
      contentRef: `prose/${participant.slug}-technik`,
      hideSectionNumber: true,
      pageId,
    },
  });

  // Block 6: Limitations (prose file, omitted when empty)
  if (ai?.knownLimitations?.length) {
    blocks.push({
      id: "limitations",
      type: "markdown",
      props: {
        header: {
          heading: "Bekannte Einschränkungen",
          subheading: "Was dieser Agent nicht kann oder nicht tun sollte.",
        },
        contentRef: `prose/${participant.slug}-einschraenkungen`,
        hideSectionNumber: true,
        pageId,
      },
    });
  }

  // Block 7: CTA (omitted for former/retired — defensive guard)
  if (participant.cta && participant.status !== "former" && participant.status !== "retired") {
    blocks.push({
      id: "cta",
      type: "final-cta",
      props: {
        header: { heading: participant.cta.label, align: "center" },
        ctaGroup: {
          align: "center",
          items: [
            {
              label: participant.cta.label,
              variant: "primary",
              target: { kind: "internal", pageId: participant.cta.target },
            },
          ],
        },
      },
    });
  }

  return blocks;
}

export async function resolvePageRoute(options: ResolvePageRouteOptions): Promise<PageRouteData> {
  const { lang, slug, siteUrl, buildSemanticModel } = options;

  const pageId = await resolvePageIdFromPath(lang, slug);
  if (!pageId) {
    throw new Error(`No page found for path: /${lang}/${slug}`);
  }

  const registry = await getRouteRegistry();
  const defaultLang = registry.defaultLanguage;

  const fileSlug = pageIdToContentFileSlug(pageId);

  // RFC-0192: Programmatic Surface routes resolve their blocks from the surface artifact
  // (baked at build time), not a content/pages/*.md file.
  const routeEntry = registry.byPageId.get(pageId);
  const surfaceEntry = routeEntry?.surfaceId ? await getSurfaceEntryByPageId(pageId) : null;

  // Redirect stub: an empty combination 301s to its nearest live ancestor (or home).
  if (surfaceEntry && !surfaceEntry.indexable) {
    const target = surfaceEntry.redirectToPageId
      ? registry.byPageId.get(surfaceEntry.redirectToPageId)
      : undefined;
    const targetSlug = target?.routes?.[lang] ?? target?.routes?.[defaultLang] ?? "";
    const redirectTo = localizeUrl(lang, targetSlug, { defaultLanguage: defaultLang });
    return buildSurfaceRedirectResult(
      pageId,
      lang,
      defaultLang,
      registry.supportedLanguages,
      redirectTo,
    );
  }

  // RFC-0193: the baked page for the requested language (with default-language fallback).
  const surfacePage = surfaceEntry ? (surfaceEntry.pages?.[lang] ?? surfaceEntry.page) : undefined;

  // RFC-0510: a per-member profile route has no content/pages/*.md — synthesize a
  // full profile page with a six-block structure (hero, responsibility, evidence,
  // career, personal, cta) from the canonical Participant record.
  const personSlug = routeEntry?.personSlug;
  let personView: ParticipantView | undefined;
  let personSynthetic: Record<string, unknown> | undefined;
  if (personSlug) {
    const people = await getParticipantsForSection(lang);
    personView = people.find((p) => p.slug === personSlug);
    const isAiAgent = personView?.participantType === "ai-agent";
    const name = personView?.publicName ?? personView?.name ?? personSlug;
    personSynthetic = {
      kind: "page",
      cosmicStar: "",
      title: name,
      description:
        personView?.aiAgent?.purposeStatement ??
        personView?.role ??
        personView?.bio?.split("\n")[0]?.trim() ??
        name,
      lang,
      blocks: isAiAgent
        ? buildAiAgentProfileBlocks(personView!, lang)
        : buildHumanProfileBlocks(personView, personSlug, lang),
    };
  }

  let entryData: Record<string, unknown>;
  if (personSynthetic) {
    entryData = personSynthetic;
  } else if (surfacePage) {
    entryData = surfacePage as unknown as Record<string, unknown>;
  } else {
    let entry = await getEntry("pages", `${lang}/${fileSlug}`);

    if (!entry && lang !== defaultLang) {
      entry = await getEntry("pages", `${defaultLang}/${fileSlug}`);
      if (entry) {
        console.warn(
          `[content-fallback] "pages/${lang}/${slug}" not found — using "${defaultLang}" fallback`,
        );
      }
    }

    if (!entry) {
      throw new Error(`Missing page entry for pageId: ${pageId} in lang: ${lang}`);
    }

    entryData = entry.data as Record<string, unknown>;

    // Deep merge default language entry data onto localized entry data for prop fallback
    // This ensures boolean, numeric, and other parameter types fall back to default language
    if (lang !== defaultLang) {
      const defaultEntry = await getEntry("pages", `${defaultLang}/${fileSlug}`);
      if (defaultEntry) {
        entryData = deepMergeEntryData(
          defaultEntry.data as Record<string, unknown>,
          entryData,
        ) as Record<string, unknown>;
      }
    }
  }

  // Read system.md for shell/growth/config/biome/ctaTarget
  const systemEntries = await getCollection("system");
  const systemEntry = systemEntries.find((e: any) => e.id === "system");
  const systemData = systemEntry?.data as Record<string, any> | undefined;

  const pages = Array.isArray(systemData?.pages) ? systemData.pages : [];
  const pageSystemConfig = pages.find((p: any) => p.pageId === pageId);
  const requiredPageIds = Array.isArray(systemData?.sharedContext?.requiredPageIds)
    ? (systemData.sharedContext.requiredPageIds as string[])
    : [];

  // RFC-0193: Programmatic Surface pages (surfaceEntry) need a default site background
  // when they don't have a pageSystemConfig with shell.background declared.
  const defaultSiteBackground: ShellBlockConfig = {
    enabled: true,
    cosmicMoon: "Hermippe", // cosmic-literals-ignore: authored default shell moon (RFC-0193), not registry dispatch logic.
    pin: "1.0.0",
    props: {
      layers: [
        {
          kind: "image",
          imageName: surfaceEntry?.backgroundImage ?? "home-bg",
          fit: "cover",
          quality: "high",
          loading: "lazy",
        },
      ],
    },
  };

  const shellBlocks = pageSystemConfig?.shell?.background
    ? [pageSystemConfig.shell.background]
    : surfaceEntry
      ? [defaultSiteBackground]
      : [];

  const pageEntries = new Map<string, SharedContextPageEntry>();
  for (const pageConfig of pages) {
    if (!pageConfig?.pageId) continue;
    const localizedEntry = await loadLocalizedPageEntry(pageConfig.pageId, lang, defaultLang);
    if (!localizedEntry) {
      console.warn(
        `[page-handler] Page "${pageConfig.pageId}" has no content entry (lang: ${lang}, defaultLang: ${defaultLang}).`,
      );
      continue;
    }
    pageEntries.set(pageConfig.pageId, {
      pageId: pageConfig.pageId,
      blocks: localizedEntry.blocks,
    });
  }

  const mergedEntry = applySharedContextFallback({
    currentPageId: pageId,
    entry: entryData as unknown as PageEntry,
    pages: pageEntries,
    requiredPageIds,
  });

  const ctx = EMPTY_RUNTIME_CONTEXT(lang);
  // RFC-0262: dev-only fail-fast prop validation. process.env.NODE_ENV is set
  // correctly by both `astro dev` (development) and Node/site-kernel script
  // contexts that import this module outside Vite — unlike import.meta.env,
  // it never throws when accessed from a non-Vite-processed context.
  const validateProps = process.env.NODE_ENV !== "production" ? devPropsValidator() : undefined;
  const builtPage = await buildPage(mergedEntry, ctx, { shellBlocks, validateProps });

  // RFC-0229: build the canonical breadcrumb trail once and project it into BOTH the visible
  // breadcrumbs section and the JSON-LD BreadcrumbList (via the semantic model below), so the two
  // can never diverge. The home page is a single-node trail and stays suppressed.
  const origin = new URL(siteUrl).origin;
  let breadcrumbTrail: SemanticBreadcrumb[] | null = null;
  if (pageId !== "home") {
    const siteLabels = await getSiteLabelsData(lang, defaultLang);
    const breadcrumbsLabels = siteLabels?.breadcrumbs as Record<string, unknown> | undefined;
    const homeLabel = (breadcrumbsLabels?.homeLabel as string) ?? "Home";
    const selfSlug =
      routeEntry?.routes?.[lang] ??
      routeEntry?.routes?.[defaultLang] ??
      pageSystemConfig?.routes?.[lang] ??
      pageSystemConfig?.routes?.[defaultLang] ??
      "";
    const resolver: BreadcrumbAncestorResolver = {
      resolveAncestors: ({ pageId: pid, lang: l, defaultLang: dl }) =>
        surfaceEntry
          ? resolveSurfaceAncestors(pid, l, dl)
          : resolveAuthoredAncestors(
              routeEntry?.parentPageId,
              l,
              dl,
              registry,
              loadLocalizedPageEntry,
            ),
    };
    // RFC-0229: the trail carries root-relative paths so the rendered links work in any environment
    // (local/preview/prod). The JSON-LD BreadcrumbList absolutizes them against the page's canonical
    // origin (Astro.site), which is always the production host even in a local build.
    breadcrumbTrail = await buildBreadcrumbTrail({
      pageId,
      pageTitle: builtPage.title,
      selfUrl: localizeUrl(lang, selfSlug, { defaultLanguage: defaultLang }),
      homeLabel,
      homeUrl: localizeUrl(lang, "", { defaultLanguage: defaultLang }),
      lang,
      defaultLang,
      resolver,
    });
  }

  const blocks = breadcrumbTrail
    ? injectBreadcrumbsBlock(builtPage.blocks, breadcrumbTrail)
    : builtPage.blocks;

  // RFC-0138: resolve {collection.file.field} references in block props before the
  // resolved props are handed to section components as pageOverride.
  const page: ResolvedPage = {
    ...builtPage,
    blocks: await substituteBlockPropReferences(blocks, lang, fileSlug, defaultLang),
  };

  const alternateLinks = await getAlternateLinks(pageId, siteUrl);
  const growthConfig = systemData?.growth as SystemGrowthBlock | undefined;
  const appId = (systemData?.app as string) ?? "app";
  const supportedLangs = registry.supportedLanguages;

  const currentLangIndex = supportedLangs.indexOf(lang);
  const targetLang =
    supportedLangs[(currentLangIndex + 1) % supportedLangs.length] ?? supportedLangs[0];
  // RFC-0192/0193: a Programmatic Surface page is not in system.md pages[], so its sibling-language
  // slug comes from the registry entry's per-language routes (it carries the localized slug for each
  // supported language). Without this, the language switcher fell back to "" → the home page.
  const targetSlug =
    pageSystemConfig?.routes?.[targetLang] ?? routeEntry?.routes?.[targetLang] ?? "";
  const localizedSiblingPath = localizeUrl(targetLang, targetSlug, {
    defaultLanguage: defaultLang,
  });

  // RFC-0192/0193: a Programmatic Surface page is not in system.md pages[], so its semantic type
  // comes from the surface entry (default "content") so OG/JSON-LD are still emitted.
  // RFC-0162/0163: authored pages that are present as a content entry but not registered in
  // system.md pages[] (e.g. the cosmic utility pages `cosmic/passport`, `cosmic/star-map`,
  // listed only in sharedContext.requiredPageIds) still render and are indexable + sitemapped,
  // so they must carry OG/Twitter meta. Default their semantic type to "content" so the layer
  // builds a SemanticPageModel and <SocialMeta> emits. Surface/person pages keep their own type.
  // RFC-0162/0163: an authored/utility page may carry no explicit semanticType
  // (e.g. the cosmic passport/star-map provenance pages: registered in pages[] but
  // intentionally without a semanticType, or pages present only as a content entry).
  // Default it to "content" so the layer builds a SemanticPageModel and OG/JSON-LD
  // emit. Surface/person pages keep their own type.
  const authoredSemanticType = personSlug
    ? "person"
    : (surfaceEntry?.semanticType ?? pageSystemConfig?.semanticType);
  const semanticType = (authoredSemanticType ?? "content") as string | undefined;
  // No llms markdown twin is generated for these defaulted utility pages, so they
  // must not advertise one (RFC-0166 page.markdown.validate). Surface pages set
  // their own llms depth above and are excluded here.
  const isUtilityPageWithoutTwin = !authoredSemanticType && !surfaceEntry;

  // Read biome from system.md identity
  const identity = systemData?.identity as Record<string, any> | undefined;
  const biome = (identity?.biome as string) ?? "default";

  // Read ctaTarget from identity (app-level) with per-page override
  const ctaTarget = (pageSystemConfig?.ctaTarget ?? identity?.ctaTarget) as string | undefined;

  // Read skipLinkLabel + defaultDescription from site/{lang}/layout.md
  let siteEntry = await getEntry("site", `${lang}/layout`);
  if (!siteEntry && lang !== defaultLang) {
    siteEntry = await getEntry("site", `${defaultLang}/layout`);
  }
  const layoutData = siteEntry?.data as Record<string, any> | undefined;
  const skipLinkLabel = (layoutData?.skipLinkLabel as string) ?? "Skip to main content";
  const defaultDescription = (layoutData?.defaultDescription as string) ?? "";

  // Read site-wide orchestrator overrides from site/{lang}/labels.md.
  // Currently used for smoothScroll (Lenis) which cannot be derived from page blocks.
  let labelsEntry = await getEntry("site", `${lang}/labels`);
  if (!labelsEntry && lang !== defaultLang) {
    labelsEntry = await getEntry("site", `${defaultLang}/labels`);
  }
  const labelsData = labelsEntry?.data as Record<string, any> | undefined;
  const siteOrchestrator = (labelsData?.orchestrator ?? {}) as Record<string, unknown>;

  // RFC-0163: the page's own absolute canonical URL (origin + localized path). Passing
  // this (instead of the bare site origin) makes the semantic model's WebPage.url and
  // @id the page URL rather than the site root — fixing the cross-page identity collapse.
  // (`origin` is computed above for the breadcrumb trail and reused here.)
  const canonicalRouteEntry =
    surfaceEntry?.canonicalPageId !== undefined
      ? registry.byPageId.get(surfaceEntry.canonicalPageId)
      : undefined;
  const canonicalSlug =
    canonicalRouteEntry?.routes?.[lang] ??
    canonicalRouteEntry?.routes?.[defaultLang] ??
    routeEntry?.routes?.[lang] ??
    routeEntry?.routes?.[defaultLang] ??
    pageSystemConfig?.routes?.[lang] ??
    pageSystemConfig?.routes?.[defaultLang] ??
    "";
  const pageUrl = new URL(
    localizeUrl(lang, canonicalSlug, { defaultLanguage: defaultLang }),
    origin,
  );

  // RFC-0490: for "collection"-typed surface pages (depth-0 pillar hub), compute
  // collectionItems from depth-1 indexable children for the JSON-LD ItemList node.
  let collectionItems: Array<{ url: string; name: string }> | undefined;
  if (surfaceEntry && semanticType === "collection" && surfaceEntry.depth === 0) {
    const allEntries = await getSurfaceEntries();
    const originStr = pageUrl.origin;
    collectionItems = allEntries
      .filter(
        (e) =>
          e.surfaceId === surfaceEntry!.surfaceId && e.depth === 1 && e.indexable && !e.noindex,
      )
      .map((e) => {
        const slug = e.routes?.[lang] ?? e.routes?.[defaultLang] ?? "";
        const url = `${originStr}${localizeUrl(lang, slug, { defaultLanguage: defaultLang })}`;
        const name = e.pages?.[lang]?.title ?? e.page?.title ?? slug;
        return { url, name };
      });
  }

  // Optional semantic model building via callback — avoids circular dep on @gogol/pbp
  let semanticPage: import("../../semantic/models.ts").SemanticPageModel | null = null;
  if (buildSemanticModel && semanticType) {
    semanticPage = await buildSemanticModel({
      pageId,
      semanticType,
      lang,
      url: pageUrl,
      // RFC-0195/0200: surface + person pages have no content entry — supply the synthetic page
      // as fallback frontmatter so JSON-LD / OG / the Markdown-twin link are emitted like any page.
      ...(personSynthetic
        ? { fallbackFrontmatter: personSynthetic }
        : surfacePage
          ? { fallbackFrontmatter: surfacePage as unknown as Record<string, unknown> }
          : {}),
      // RFC-0229: the canonical trail (Home → live ancestors → self) so the JSON-LD BreadcrumbList
      // matches the visible section exactly.
      ...(breadcrumbTrail ? { breadcrumbs: breadcrumbTrail } : {}),
      // RFC-0490: collection items for the ItemList JSON-LD node on pillar hub pages.
      ...(collectionItems?.length ? { collectionItems } : {}),
      // RFC-0492: surface identity + depth for depth-gated JSON-LD corrections (Service node).
      ...(surfaceEntry?.surfaceId ? { surfaceId: surfaceEntry.surfaceId } : {}),
      ...(surfaceEntry?.depth !== undefined ? { depth: surfaceEntry.depth } : {}),
    } satisfies SemanticModelOptions);
  }

  // RFC-0162: project per-page social meta onto the semantic model so the shared
  // layout's <SocialMeta> partial can emit Open Graph / Twitter Card tags. The
  // preview image is the RFC-0150 per-page artifact (public/preview/<lang>/<slug>.png,
  // 1200x630); og:locale is derived from the system.md i18n hreflang map.
  if (semanticPage) {
    // RFC-0166: resolve the per-page output projection up front so it can drive
    // both the llms depth (rel=alternate Markdown twin) and the primaryImage
    // precedence below.
    semanticPage.output = resolvePageOutput(pageSystemConfig?.output, {
      semanticType: semanticType ?? "",
    });

    // RFC-0194: a Programmatic Surface page suppressed by the substance gate (or any other
    // noindex decision) must render `noindex,follow` so the rendered HTML agrees with its
    // sitemap exclusion.
    if (surfaceEntry?.noindex && semanticPage.output?.robots) {
      semanticPage.output.robots = { ...semanticPage.output.robots, index: false };
    }

    // RFC-0195: advertise the Markdown twin via rel=alternate on Programmatic Surface pages,
    // matching authored-page conventions. The llms depth mirrors the entry's GEO setting (and the
    // twin emission rule): full → "full", twin-only → "summary", off/noindex → "exclude" (no link,
    // no twin). The layout emits the rel=alternate link only for full/summary depths.
    if (surfaceEntry && semanticPage.output) {
      const hasTwin = surfaceEntry.indexable && !surfaceEntry.noindex && surfaceEntry.geo !== "off";
      const depth = !hasTwin ? "exclude" : surfaceEntry.geo === "twin-only" ? "summary" : "full";
      semanticPage.output.llms = { ...semanticPage.output.llms, depth };
    }

    // RFC-0166: utility pages without an authored semanticType (cosmic passport/
    // star-map) get no llms markdown twin, so suppress the rel=alternate markdown
    // link to keep the rendered HTML consistent with what is generated.
    if (isUtilityPageWithoutTwin && semanticPage.output) {
      semanticPage.output.llms = { ...semanticPage.output.llms, depth: "exclude" };
    }

    // RFC-0165/0167/0209: primaryImage precedence —
    //   output.image → resolved hero leadImage → RFC-0150 preview screenshot.
    // This framework-free handler can only resolve the first and last: the hero
    // `leadImage` token cannot be resolved to a URL here (Astro content-hashing /
    // the Image Provider Port run in the render layer). So when there is no
    // explicit output.image, it ships the raw `leadImageToken` for the
    // asset-aware layout to resolve and promote (RFC-0209), and keeps the
    // preview screenshot as the always-present fallback so og:image never empties.
    // Only contentImage:true images reach the image sitemap (RFC-0165).
    semanticPage.primaryImage = semanticPage.output.image ?? {
      url: `${origin}/preview/${lang}/${fileSlug}.png`,
      width: 1200,
      height: 630,
      alt: semanticPage.heading ?? semanticPage.title,
    };
    if (!semanticPage.output.image) {
      // RFC-0209: carry the hero block's leadImage token (the page's genuine
      // content photo) to the render layer. Identify the hero by its declared
      // `leadImage` prop rather than a block-type name, so authored heroes and
      // baked Programmatic Surface heroes (RFC-0207) are handled identically.
      const leadBlock = page.blocks.find((block) => {
        const lead = (block.props as Record<string, unknown> | undefined)?.leadImage;
        return (
          typeof lead === "object" &&
          lead !== null &&
          typeof (lead as { src?: unknown }).src === "string"
        );
      });
      const lead = leadBlock?.props?.leadImage as { src: string; alt?: string } | undefined;
      if (lead) {
        semanticPage.leadImageToken = { src: lead.src, alt: lead.alt ?? "" };
      }
    }
    if (!semanticPage.ogType) {
      semanticPage.ogType = "website";
    }
    // RFC-0200: a per-member profile page is a schema.org ProfilePage.
    if (personSlug) {
      semanticPage.ogType = "profile";
    }
    const i18nSupported = (systemData?.i18n?.supported ?? {}) as Record<
      string,
      { hreflang?: string }
    >;
    const toOgLocale = (code: string): string =>
      (i18nSupported[code]?.hreflang ?? code).replace("-", "_");
    semanticPage.ogLocale = toOgLocale(lang);
    semanticPage.ogLocaleAlternates = supportedLangs
      .filter((other) => other !== lang)
      .map(toOgLocale);

    // RFC-0167/RFC-0325: a page carrying an `article` block (authored in system.md, or baked onto
    // a Programmatic Surface route entry) emits an Article/BlogPosting node and switches og:type to
    // "article" (freshness/Discover + LLM recency/attribution).
    const articleConfig = (pageSystemConfig?.article ?? surfaceEntry?.article) as
      { publishedAt?: string; updatedAt?: string; author?: string; tags?: string[] } | undefined;
    if (articleConfig?.publishedAt) {
      semanticPage.datePublished = articleConfig.publishedAt;
      if (articleConfig.updatedAt) semanticPage.dateModified = articleConfig.updatedAt;
      if (articleConfig.author) semanticPage.author = articleConfig.author;
      if (articleConfig.tags?.length) semanticPage.keywords = articleConfig.tags;
      semanticPage.ogType = "article";
    }
  }

  // RFC-0512: inject JSON-LD nodes for team profile and hub pages.
  // - AI-agent profile pages: SoftwareApplication node (replaces default Person).
  // - Human profile pages: extended Person node with address/knowsAbout/affiliation.
  // - Team hub page: CollectionPage node with hasPart listing all public participants.
  if (semanticPage && personSlug && personView) {
    if (personView.participantType === "ai-agent") {
      semanticPage.extraGraphNodes = [buildSoftwareApplicationJsonLd(personView, siteUrl, lang)];
    } else {
      semanticPage.extraGraphNodes = [buildPersonJsonLd(personView, siteUrl, lang)];
    }
  } else if (semanticPage && pageId === "team") {
    const allParticipants = await getParticipantsForSection(lang);
    semanticPage.extraGraphNodes = [buildTeamHubCollectionPageJsonLd(allParticipants, siteUrl)];
  }

  // RFC-0174: resolve the binding-language legal policy for this render. The
  // `translation` block is authored in the binding-language page file and merged
  // onto every locale entry above, so it is present here when the page is legal.
  const translationPolicy = entryData.translation as PageTranslationPolicy | undefined;
  let translationContext: ResolvedTranslationContext | null = null;
  if (translationPolicy?.binding) {
    const bindingPageId = translationPolicy.bindingPageId ?? pageId;
    const bindingUrl = await resolveLocalizedPagePath(bindingPageId, translationPolicy.binding);
    translationContext = resolveTranslationContext({
      lang,
      pageId,
      policy: translationPolicy,
      resolveBindingUrl: () => bindingUrl,
    });
  }

  return {
    pageId,
    page,
    alternateLinks,
    growthConfig,
    appId,
    defaultLanguageCode: defaultLang,
    supportedLangs,
    localizedSiblingPath,
    ...(semanticType ? { semanticType } : {}),
    semanticPage,
    ...(ctaTarget ? { ctaTarget } : {}),
    biome,
    skipLinkLabel,
    resolvedDescription: page.description || defaultDescription,
    orchestratorConfig: {
      ...deriveOrchestratorConfig(page.blocks),
      smoothScroll: siteOrchestrator.smoothScroll === true,
    },
    translationContext,
    // RFC-0257: print mode and PDF URL
    printMode: false,
    ...(systemData?.output?.printPdf
      ? {
          pdfUrl: `/_print/${lang}/${canonicalSlug || "index"}.pdf`,
        }
      : {}),
  };
}
