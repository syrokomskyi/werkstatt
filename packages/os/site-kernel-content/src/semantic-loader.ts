/*
<MODULE_CONTRACT>
<purpose>Framework-agnostic semantic site model loader that reads content directly from disk without Astro runtime (RFC-0050).</purpose>
<non-goals>
  <item>Do not duplicate semantic model construction logic.</item>
  <item>Do not introduce new content schema — reuses existing frontmatter shapes.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0050: Initial implementation of framework-agnostic semantic loader.</item>
  <item>Fix: Apply disk-based content reference substitution (RFC-0045) to prose body text and frontmatter values.</item>
  <item>RFC-0377: thread optional `audience` from system.md into SemanticPageModel, falling back to AUDIENCE_BY_PAGE_TYPE derivation map.</item>
  <item>RFC-0529: replace disk-based substituteContentReferences with index-based resolveReferencesInString/resolveReferencesDeep from @warpgogol/share/content-reference.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  SemanticSiteModel,
  SemanticPageModel,
  SemanticPerson,
  SemanticInitiative,
  SemanticFaqEntry,
  SemanticContentReader,
} from "@warpgogol/share/semantic";
import {
  buildSemanticPageModelWith,
  buildOrganizationProfile,
  resolvePageOutput,
  projectOffer,
  projectLocation,
  projectPeople,
  projectServices,
  AUDIENCE_BY_PAGE_TYPE,
  type RawPageOutput,
} from "@warpgogol/share/semantic";
import { pageIdToContentFileSlug } from "@warpgogol/share/content";
import { localizeUrl } from "@warpgogol/share/url-policy";
import { DEFAULT_PROFILE_BASE_BY_LANG } from "@warpgogol/share/people-profile-defaults";
import { FS_CAPABILITIES } from "@warpgogol/content-source";
import type {
  ContentEntry,
  ContentEntryRef,
  ContentSourceProvider,
} from "@warpgogol/content-source";
import { parseMarkdownFrontmatter } from "./markdown-frontmatter.ts";
import { loadSystemManifest } from "./system-manifest.ts";
import { collectMarkdownFiles } from "./content-files.ts";
import {
  getContentRefIndex,
  resolveReferencesInString,
  resolveReferencesDeep,
  EMPTY_CONTENT_REF_INDEX,
  type SourceRef,
} from "@warpgogol/share/content-reference";
import { emitPipelineLogEvent } from "./pipeline-log.ts";

export interface SemanticLoaderOptions {
  contentDir: string;
  lang: string;
  siteUrl: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readLocalizedMarkdown(
  contentDir: string,
  collection: string,
  lang: string,
  relativePath: string,
  defaultLang: string,
): Promise<{ data: Record<string, unknown>; content: string } | undefined> {
  const localizedPath = join(contentDir, collection, lang, relativePath);
  try {
    const text = await readFile(localizedPath, "utf-8");
    return parseMarkdownFrontmatter(text);
  } catch {
    if (lang !== defaultLang) {
      const fallbackPath = join(contentDir, collection, defaultLang, relativePath);
      try {
        const text = await readFile(fallbackPath, "utf-8");
        emitPipelineLogEvent({
          severity: "notice",
          kind: "expected-fallback",
          packageName: "@warpgogol/site-kernel-content",
          module: "semantic-loader",
          message: `content fallback: ${collection}/${lang}/${relativePath} -> ${collection}/${defaultLang}/${relativePath}`,
          dedupeKey: `content-fallback:${collection}:${lang}:${relativePath}`,
          data: { collection, lang, defaultLang, relativePath, localizedPath, fallbackPath },
        });
        return parseMarkdownFrontmatter(text);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

async function readLocalizedData(
  contentDir: string,
  collection: string,
  lang: string,
  relativePath: string,
  defaultLang: string,
): Promise<Record<string, unknown> | undefined> {
  const result = await readLocalizedMarkdown(
    contentDir,
    collection,
    lang,
    relativePath,
    defaultLang,
  );
  return result?.data;
}

async function readLocalizedBody(
  contentDir: string,
  collection: string,
  lang: string,
  relativePath: string,
  defaultLang: string,
): Promise<string | undefined> {
  const result = await readLocalizedMarkdown(
    contentDir,
    collection,
    lang,
    relativePath,
    defaultLang,
  );
  return result?.content;
}

// ---------------------------------------------------------------------------
// Site semantic profile
// ---------------------------------------------------------------------------

type SiteProfile = {
  organization: SemanticSiteModel["organization"];
  people: SemanticPerson[];
  initiatives: SemanticInitiative[];
};

// Narrow projections of the three business YAML files that loadSiteSemanticProfile
// reads. The files are validated by pbp.content.validate against their own
// schemas; here we declare only the fields the semantic loader actually uses,
// so each access is type-checked instead of `as any`.
interface CompanyFrontmatter {
  brand?: {
    name?: string;
    founders?: Array<{ name: string; role?: string }>;
  };
  description?: string;
  foundingYear?: string;
  areaServed?: string[];
  boardMembers?: Array<{ name: string; role?: string }>;
  /** RFC-0242: "bodenstation" (studio dogfooding) vs "sternsystem" (client deployment). */
  mode?: string;
}
interface LegalFrontmatter {
  companyName?: string;
  owner?: {
    fullName?: string;
    address?: {
      street?: string;
      streetNumber?: string;
      zip?: string;
      city?: string;
      country?: string;
    };
  };
  bank?: {
    accountHolder?: string;
    iban?: string;
    bic?: string;
    bankName?: string;
    konto?: string;
    blz?: string;
  };
  chamber?: { registernummer?: string };
}
interface ContactFrontmatter {
  email?: string;
  contactType?: string;
}

async function loadSiteSemanticProfile(
  contentDir: string,
  lang: string,
  siteUrl: string,
  defaultLang: string,
): Promise<SiteProfile> {
  const company = ((await readLocalizedData(
    contentDir,
    "business",
    lang,
    "company.md",
    defaultLang,
  )) ?? {}) as CompanyFrontmatter;
  const legal = ((await readLocalizedData(contentDir, "business", lang, "legal.md", defaultLang)) ??
    {}) as LegalFrontmatter;
  const contact = ((await readLocalizedData(
    contentDir,
    "business",
    lang,
    "contact.md",
    defaultLang,
  )) ?? {}) as ContactFrontmatter;

  const rawBrand = company.brand ?? {};
  const companyName = legal.companyName ?? "";
  const rawBrandName = rawBrand.name ?? "";
  const indexPath = join(contentDir, "..", "content-ref-index.generated.yaml");
  const index = getContentRefIndex(indexPath) ?? EMPTY_CONTENT_REF_INDEX;
  const brandName = rawBrandName
    ? resolveReferencesInString(index, rawBrandName, lang, defaultLang, {
        collection: "business",
        file: "company",
      })
    : "";

  // RFC-0200: founders/board/team derive from the canonical Person records'
  // `affiliations` — never from a denormalized company list (removed).
  const peopleRecords = projectPeople(
    await readBusinessCollection(contentDir, lang, "people", defaultLang),
  );
  const founders: SemanticPerson[] = peopleRecords.filter((p) =>
    p.affiliations?.includes("founder"),
  );
  const boardMembers: SemanticPerson[] = peopleRecords.filter((p) =>
    p.affiliations?.includes("board"),
  );

  const legalOwner = legal.owner ?? {};
  const rawLegalBank = legal.bank;
  const bankAccountHolder = rawLegalBank?.accountHolder
    ? resolveReferencesInString(index, rawLegalBank.accountHolder, lang, defaultLang, {
        collection: "business",
        file: "legal",
      })
    : "";

  // RFC-0147/RFC-0148: project the public business catalog (offer, location, team).
  const offer = projectOffer(
    await readLocalizedData(contentDir, "business", lang, "offer.md", defaultLang),
  );
  const location = projectLocation(
    await readLocalizedData(contentDir, "business", lang, "location.md", defaultLang),
  );
  const services = projectServices(
    await readBusinessCollection(contentDir, lang, "services", defaultLang),
  );
  const team = peopleRecords.length ? peopleRecords : undefined;

  // RFC-0148: delegate the org assembly to the single shared builder. This
  // (fs) path resolves content references itself, then passes resolved values.
  return buildOrganizationProfile({
    lang,
    siteUrl,
    brandName,
    description: company.description ?? "",
    foundingYear: company.foundingYear,
    areaServed: company.areaServed,
    founders,
    boardMembers,
    legalName: companyName,
    registration: legal.chamber?.registernummer,
    representativeName: legalOwner.fullName,
    ...(legalOwner.address ? { address: legalOwner.address } : {}),
    ...(rawLegalBank
      ? {
          bank: {
            accountHolder: bankAccountHolder,
            iban: rawLegalBank.iban,
            bic: rawLegalBank.bic,
            bankName: rawLegalBank.bankName,
            konto: rawLegalBank.konto,
            blz: rawLegalBank.blz,
          },
        }
      : {}),
    email: contact.email,
    contactType: contact.contactType,
    ...(offer ? { offer } : {}),
    ...(location ? { location } : {}),
    ...(services.length ? { services } : {}),
    ...(team ? { team } : {}),
    // RFC-0242: Bodenstation dogfooding speaks as the studio (Organization/ProfessionalService +
    // Service), never LocalBusiness/aggregateRating.
    ...(company.mode === "bodenstation"
      ? { schemaType: ["Organization", "ProfessionalService"] }
      : {}),
  });
}

/**
 * RFC-0148: read a repeatable business collection (e.g. team/) as raw
 * frontmatter rows, with default-language fallback. Mirrors the FAQ read.
 */
async function readBusinessCollection(
  contentDir: string,
  lang: string,
  sub: string,
  defaultLang: string,
): Promise<Array<Record<string, unknown>>> {
  // PBP migration (RFC-0471): people moved to standalone people/<lang>/ collection.
  const dir =
    sub === "people" ? join(contentDir, "people", lang) : join(contentDir, "business", lang, sub);
  let files = await collectMarkdownFiles(dir);
  if (files.length === 0 && lang !== defaultLang) {
    const fallbackDir =
      sub === "people"
        ? join(contentDir, "people", defaultLang)
        : join(contentDir, "business", defaultLang, sub);
    files = await collectMarkdownFiles(fallbackDir);
  }
  const rows: Array<Record<string, unknown>> = [];
  for (const file of files) {
    rows.push(parseMarkdownFrontmatter(await readFile(file, "utf-8")).data);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Page semantic model
// ---------------------------------------------------------------------------

/**
 * RFC-0146: the node-side filesystem ContentSourceProvider. Completes the
 * RFC-0141 port for Node (no astro:content) by reusing the same localized
 * markdown reader the disk loader has always used, so reads are byte-identical.
 * `getEntry` resolves the `{lang}/{slug}` id scheme with default-language
 * fallback and exposes the markdown body for body-bearing domains.
 */
export function createNodeFsContentProvider(
  contentDir: string,
  defaultLang: string,
): ContentSourceProvider {
  const splitId = (id: string): { lang: string; rel: string } => {
    const slash = id.indexOf("/");
    return slash >= 0
      ? { lang: id.slice(0, slash), rel: id.slice(slash + 1) }
      : { lang: defaultLang, rel: id };
  };

  return {
    id: "fs",
    capabilities: FS_CAPABILITIES,

    async getEntry(ref: ContentEntryRef): Promise<ContentEntry | null> {
      const { lang, rel } = splitId(ref.id);
      const parsed = await readLocalizedMarkdown(
        contentDir,
        ref.domain,
        lang,
        `${rel}.md`,
        defaultLang,
      );
      if (!parsed) return null;
      return { id: ref.id, domain: ref.domain, data: parsed.data, body: parsed.content };
    },

    async listEntries(domain, lang) {
      const dir = join(contentDir, domain, lang ?? defaultLang);
      const files = await collectMarkdownFiles(dir);
      const entries: ContentEntry[] = [];
      for (const file of files) {
        const parsed = parseMarkdownFrontmatter(await readFile(file, "utf-8"));
        const slug = file.split(/[\\/]/).pop()?.replace(/\.md$/, "") ?? "";
        entries.push({ id: `${lang ?? defaultLang}/${slug}`, domain, data: parsed.data });
      }
      return entries;
    },

    async resolveAsset() {
      // Build-time no-op (parity with the Astro adapter, which defers assets to
      // the UI call site — RFC-0141).
      return null;
    },
  };
}

/**
 * RFC-0144/RFC-0146: the filesystem SemanticContentReader, now backed by the
 * node-side ContentSourceProvider. Page frontmatter and prose body are read
 * through the port; RFC-0045 content-reference substitution is applied to prose
 * bodies. Construction logic lives once in @warpgogol/share's buildSemanticPageModelWith.
 */
/**
 * RFC-0325: exported so callers outside loadSemanticSiteModel (e.g. page.markdown.generate, which
 * builds SemanticPageModels for Programmatic Surface article pages via `fallbackFrontmatter`) can
 * resolve prose bodies and content references through the same disk reader, rather than
 * reimplementing RFC-0045 substitution.
 */
export function createFsSemanticReader(
  contentDir: string,
  defaultLang: string,
): SemanticContentReader {
  const provider = createNodeFsContentProvider(contentDir, defaultLang);
  const indexPath = join(contentDir, "..", "content-ref-index.generated.yaml");
  const resolveDeepContentReferences = async (
    value: unknown,
    lang: string,
    sourceRef?: SourceRef,
  ): Promise<unknown> => {
    const index = getContentRefIndex(indexPath) ?? EMPTY_CONTENT_REF_INDEX;
    return resolveReferencesDeep(index, value, lang, defaultLang, sourceRef);
  };
  return {
    async getPageFrontmatter(pageId, lang) {
      const entry = await provider.getEntry({
        domain: "pages",
        id: `${lang}/${pageIdToContentFileSlug(pageId)}`,
      });
      if (!entry) return null;
      return (await resolveDeepContentReferences(entry.data, lang, {
        collection: "pages",
        file: pageIdToContentFileSlug(pageId),
      })) as Record<string, unknown>;
    },

    async getProseBody(proseSlug, lang) {
      const entry = await provider.getEntry({ domain: "prose", id: `${lang}/${proseSlug}` });
      const raw = entry?.body ?? "";
      if (!raw) return "";
      const index = getContentRefIndex(indexPath) ?? EMPTY_CONTENT_REF_INDEX;
      return resolveReferencesInString(index, raw, lang, defaultLang, {
        collection: "prose",
        file: proseSlug,
      });
    },

    async getHomeLabel(lang) {
      type SiteLabelsView = {
        breadcrumbs?: { homeLabel?: string };
        header?: { brandLabel?: string };
      };
      const siteLabels = (await readLocalizedData(
        contentDir,
        "site",
        lang,
        "labels.md",
        defaultLang,
      )) as SiteLabelsView | undefined;
      return siteLabels?.breadcrumbs?.homeLabel ?? siteLabels?.header?.brandLabel ?? "Home";
    },

    async getFaqEntries(lang): Promise<SemanticFaqEntry[]> {
      let faqFiles = await collectMarkdownFiles(join(contentDir, "business", lang, "faq"));
      if (faqFiles.length === 0 && lang !== defaultLang) {
        faqFiles = await collectMarkdownFiles(join(contentDir, "business", defaultLang, "faq"));
      }

      interface FaqEntryFrontmatter {
        featureFlag?: boolean;
        question?: string;
        answer?: string;
        tags?: string[];
        serviceSlug?: string;
      }
      const faqEntries: SemanticFaqEntry[] = [];
      for (const file of faqFiles) {
        const parsed = parseMarkdownFrontmatter(await readFile(file, "utf-8"));
        const data = parsed.data as FaqEntryFrontmatter;
        if (data.featureFlag) continue;
        const slug = file.split(/[\\/]/).pop()?.replace(/\.md$/, "") ?? "";
        faqEntries.push({
          id: `faq/${slug}`,
          question: data.question ?? "",
          answer: data.answer ?? "",
          tags: data.tags,
          serviceSlug: data.serviceSlug,
        });
      }
      return faqEntries;
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function loadSemanticSiteModel(
  options: SemanticLoaderOptions,
): Promise<SemanticSiteModel> {
  const { contentDir, lang, siteUrl } = options;

  const { manifest } = await loadSystemManifest(contentDir);
  const defaultLang = manifest.i18n?.default ?? "de";

  // System pages carry extension fields (semanticType, anchors) that
  // systemManifestSchema doesn't formalize today. Narrow locally.
  type SystemPageView = {
    pageId?: string;
    routes?: Record<string, string>;
    semanticType?: string;
    audience?: string;
    output?: RawPageOutput;
    anchors?: Record<string, Record<string, string>>;
  };
  const pages = (manifest.pages ?? []) as SystemPageView[];
  const siteProfile = await loadSiteSemanticProfile(contentDir, lang, siteUrl, defaultLang);
  const reader = createFsSemanticReader(contentDir, defaultLang);

  const pageModels: SemanticPageModel[] = [];

  for (const page of pages) {
    // RFC-0142/RFC-0143: a page enters the semantic model only if it has a
    // semanticType. Sitemap inclusion is no longer coupled here — llms
    // inclusion is governed by the resolved output.llms depth.
    if (!page.semanticType) continue;

    const output = resolvePageOutput(page.output, {
      semanticType: page.semanticType,
    });

    // `exclude` pages contribute to neither llms file — skip early so their
    // prose body is never loaded.
    if (output.llms.depth === "exclude") continue;

    const routes = page.routes as Record<string, string> | undefined;
    const slug = routes?.[lang] ?? "";
    const baseUrl = siteUrl.replace(/\/$/, "");
    // RFC-0160: unprefixed default language; prefixed non-default languages.
    const url = `${baseUrl}${localizeUrl(lang, slug, { defaultLanguage: defaultLang })}`;

    const semanticType = page.semanticType as import("@warpgogol/share/semantic").SemanticPageType;
    const audience = page.audience ?? AUDIENCE_BY_PAGE_TYPE[semanticType];

    const model = await buildSemanticPageModelWith(reader, {
      pageId: page.pageId as string,
      semanticType,
      lang,
      url,
      profile: siteProfile,
      ...(audience ? { audience } : {}),
    });

    if (model) {
      model.defaultLanguage = defaultLang;
      model.organization = siteProfile.organization;
      model.output = output;
      pageModels.push(model);
    }
  }

  // RFC-0200: per-member profile pages (team.profiles-gated) enter the model as
  // `person` pages so they feed llms.txt + Markdown twins like any page. The
  // enabled set comes from the default-language anchor; localized name/role come
  // from the requested-language record.
  if (await isProfilesEntitled(contentDir)) {
    const aboutPage = pages.find((p) => p.semanticType === "about");
    const baseSeg =
      (aboutPage?.routes as Record<string, string> | undefined)?.[lang] ??
      DEFAULT_PROFILE_BASE_BY_LANG[lang] ??
      "team";
    const anchorRecords = await readBusinessCollection(
      contentDir,
      defaultLang,
      "people",
      defaultLang,
    );
    const langRecords = await readBusinessCollection(contentDir, lang, "people", defaultLang);
    const langBySlug = new Map(
      langRecords.map((r) => [String((r as Record<string, unknown>).slug ?? ""), r]),
    );
    const baseUrl = siteUrl.replace(/\/$/, "");
    for (const anchor of anchorRecords) {
      const page = (anchor as Record<string, unknown>).page as { enabled?: unknown } | undefined;
      if (page?.enabled !== true) continue;
      const slug = String((anchor as Record<string, unknown>).slug ?? "");
      if (!slug) continue;
      const localized = (langBySlug.get(slug) ?? anchor) as Record<string, unknown>;
      const name = String(localized.name ?? slug);
      const url = `${baseUrl}${localizeUrl(lang, `${baseSeg}/${slug}`, { defaultLanguage: defaultLang })}`;
      const semanticType = "person" as import("@warpgogol/share/semantic").SemanticPageType;
      const model = await buildSemanticPageModelWith(reader, {
        pageId: `person:${slug}`,
        semanticType,
        lang,
        url,
        profile: siteProfile,
        audience: AUDIENCE_BY_PAGE_TYPE[semanticType],
        fallbackFrontmatter: {
          title: name,
          description: String(localized.role ?? name),
          blocks: [],
        },
      });
      if (model) {
        model.defaultLanguage = defaultLang;
        model.organization = siteProfile.organization;
        model.output = resolvePageOutput(undefined, { semanticType: "person" });
        pageModels.push(model);
      }
    }
  }

  return {
    baseUrl: new URL(siteUrl).origin,
    lang,
    defaultLanguage: defaultLang,
    organization: siteProfile.organization,
    pages: pageModels,
  };
}

/** RFC-0200: is the per-member profile-pages module (`team.profiles`) entitled? Fail-closed. */
async function isProfilesEntitled(contentDir: string): Promise<boolean> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const raw = await readFile(join(contentDir, "..", "entitlements.generated.json"), "utf-8");
    const parsed = JSON.parse(raw) as { features?: unknown };
    return Array.isArray(parsed.features) && parsed.features.includes("team.profiles");
  } catch {
    return false;
  }
}
