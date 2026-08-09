/*
<MODULE_CONTRACT>
<purpose>Defines types for semantic data structures used throughout the Warpgogol ecosystem.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
  <item>RFC-0165/0167: SemanticImage.contentImage flag + PageOutputProjection.image (author-declared per-page content illustration, single source for image:image + top-precedence og:image).</item>
  <item>RFC-0328: Added "legal" to the SemanticPageType closed enum.</item>
  <item>RFC-0490: Added "collection" to the SemanticPageType closed enum.</item>
  <item>RFC-0508: Added "participant" to the SemanticPageType closed enum.</item>
  <item>RFC-0372: Unified SemanticBlock type replaces SemanticAnswerBlock + SemanticContentBlock; SemanticPageModel.blocks replaces answerBlocks/contentBlocks/bodyText.</item>
</CHANGE_SUMMARY>
*/

// NOTE: This closed union is mirrored by `semanticPageTypeSchema` in
// `@warpgogol/werkstatt-site/ontology/src/schemas/system.ts`. `share` owns the compile-time
// contract used by lightweight consumers; `ontology` owns the runtime Zod
// validator for `system.md`. They are kept in sync manually because deriving
// one from the other would create a circular dependency between the two
// packages.
export type SemanticPageType =
  | "home"
  | "about"
  | "projects"
  | "donationContact"
  | "openSource"
  | "content"
  | "article"
  | "person"
  | "participant"
  | "legal"
  | "collection";

/** Runtime counterpart to the `SemanticPageType` closed union. Keep in sync manually. */
export const SEMANTIC_PAGE_TYPES: readonly SemanticPageType[] = [
  "home",
  "about",
  "projects",
  "donationContact",
  "openSource",
  "content",
  "article",
  "person",
  "participant",
  "legal",
  "collection",
];

export type SemanticBreadcrumb = {
  name: string;
  url: string;
};

/**
 * RFC-0372: Unified semantic block — replaces the former SemanticAnswerBlock and SemanticContentBlock.
 * Every block in a SemanticPageModel is represented by this single type, regardless of
 * whether it was derived from prose parsing or frontmatter block extraction.
 */
export type SemanticBlock = {
  /** Stable id from frontmatter block.id (required) or slugified heading for prose-derived blocks. */
  id: string;
  /** Block type from frontmatter (e.g. "hero-decision-card", "markdown") or "prose" for prose-derived blocks. */
  blockType?: string;
  /** Section heading (H2 in markdown twin). Empty string for no-op blocks; rendering checks `if (block.heading)`. */
  heading: string;
  /** Lead / subheading text. Counts as substantive content for ART-DEPTH-03. */
  summary?: string;
  /** Free-form body text (prose paragraphs, descriptions). */
  body?: string;
  /** Bullet-list facts (from markdown answer blocks). */
  facts?: string[];
  /** Structured items (from block extractors: cards, comparison rows, etc.). */
  items?: Array<{ title: string; description?: string }>;
  /** Extractor metadata (absent for prose-derived blocks). */
  extractedAt?: string;
  extractorVersion?: string;
};

/* RFC-0142: per-page llms inclusion depth. */
export type SemanticLlmsDepth = "full" | "summary" | "index-only" | "exclude";

export type SemanticLlmsPolicy = {
  depth: SemanticLlmsDepth;
  sections?: { exclude?: string[] };
};

/* RFC-0143: per-page sitemap projection (resolved). */
export type SitemapProjection = {
  include: boolean;
  category: string;
  lastmod?: string;
  includeLastmod: boolean;
};

/* RFC-0165: resolved per-page robots/indexability directive. */
export type RobotsProjection = {
  index: boolean;
  follow: boolean;
};

/* RFC-0143: resolved per-page `output` projection container. */
export type PageOutputProjection = {
  sitemap: SitemapProjection;
  llms: SemanticLlmsPolicy;
  /* RFC-0165: indexability — drives the robots meta tag and sitemap inclusion. */
  robots: RobotsProjection;
  /**
   * RFC-0165/0167: author-declared per-page content illustration (absolute
   * https url). This is the single CLI-knowable source for the image sitemap
   * (`image:image`) and the highest-precedence source for `og:image`. When
   * present it carries `contentImage: true`. Absent when the page has no
   * author-declared illustration.
   */
  image?: SemanticImage;
};

/* RFC-0162: a resolved social/OG image (absolute https url + intrinsic size). */
export type SemanticImage = {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  /**
   * RFC-0165/0167: marks a genuine content illustration (author-declared or
   * hero `leadImage`) as opposed to a synthetic fallback (RFC-0150 preview
   * screenshot, business logo). Only `contentImage: true` images are eligible
   * for the image sitemap (`image:image`); all images may serve `og:image`.
   */
  contentImage?: boolean;
};

/* RFC-0162: Open Graph `og:type` discriminator. Defaults to "website"; "article" set by RFC-0167. */
export type OgType = "website" | "article" | "profile";

export type SemanticPostalAddress = {
  streetAddress?: string;
  postalCode?: string;
  addressLocality?: string;
  addressCountry?: string;
};

export type SemanticPerson = {
  name: string;
  role?: string;
  description?: string;
  isDeceased?: boolean;
  /* RFC-0200: governance/presentational affiliations (founder | board | team | patron | author). */
  affiliations?: string[];
  /* RFC-0200: lifespan → schema.org Person.birthDate / deathDate (ISO or year). */
  birthDate?: string;
  deathDate?: string;
  /* RFC-0200: representative portrait (absolute https url) → Person.image. */
  image?: string;
  /* RFC-0200: social/profile URLs → Person.sameAs (entity grounding). */
  sameAs?: string[];
  /* RFC-0200: absolute URL of this person's profile page, when one is live. */
  profileUrl?: string;
  /* RFC-0512: city-level address for Person JSON-LD (consent-gated at emission). */
  address?: { addressLocality: string; addressRegion?: string; addressCountry: string };
  /* RFC-0512: professional expertise areas → Person.knowsAbout. */
  knowsAbout?: string[];
  /* RFC-0512: organization affiliation → Person.affiliation. */
  affiliation?: { name: string; url?: string };
};

export type SemanticContactPoint = {
  contactType: string;
  email?: string;
};

export type SemanticDonationAccount = {
  accountHolder?: string;
  bankName?: string;
  iban?: string;
  bic?: string;
  accountNumber?: string;
  bankCode?: string;
};

export type SemanticInitiative = {
  id: string;
  name: string;
  summary: string;
  facts?: string[];
};

export type SemanticService = {
  id: string;
  name: string;
  description?: string;
};

/* RFC-0147/RFC-0148: business offer projection (prices + written guarantees + growth modules + terms). */
export type SemanticGuarantee = {
  id: string;
  label: string;
  detail?: string;
};

export type SemanticPrice = {
  id: string;
  label: string;
  amount: string;
  currency?: string;
};

export type SemanticGrowthModule = {
  id: string;
  label: string;
  description?: string;
  price?: string;
};

export type SemanticOfferCapacity = {
  enabled: boolean;
  timezone: string;
  startsAt: string;
  cadence: "monthly" | "fixed-days";
  cadenceDays?: number;
  slotRange: { min: number; max: number };
  maxSlotsPerWave: number;
  availabilityStatus: "unknown";
};

export type SemanticOffer = {
  prices?: SemanticPrice[];
  guarantees?: SemanticGuarantee[];
  growthModules?: SemanticGrowthModule[];
  capacity?: SemanticOfferCapacity;
  changePrice?: string;
  hourlyRate?: string;
  billingDay?: string;
};

/* RFC-0148: business location projection (NAP + service area). */
export type SemanticLocation = {
  locality?: string;
  region?: string;
  country?: string;
  serviceArea?: string[];
};

/* RFC-0287: business web/domain identity projection (business/{lang}/web.md). */
export type SemanticWeb = {
  primaryUrl?: string;
  statusUrl?: string;
  domains?: { primary?: string; german?: string };
};

export type SemanticFaqEntry = {
  id: string;
  question: string;
  answer: string;
  tags?: string[];
  serviceSlug?: string;
};

export type SemanticOrganization = {
  name: string;
  legalName?: string;
  description: string;
  url: string;
  foundingYear?: string;
  email?: string;
  registration?: string;
  representative?: string;
  address?: SemanticPostalAddress;
  areaServed?: string[];
  founders?: SemanticPerson[];
  boardMembers?: SemanticPerson[];
  contactPoints?: SemanticContactPoint[];
  donationAccount?: SemanticDonationAccount;
  /* RFC-0147/RFC-0148: projected business catalog (public-visibility schemas). */
  offer?: SemanticOffer;
  services?: SemanticService[];
  location?: SemanticLocation;
  sameAs?: string[];
  /* RFC-0163: organization logo (absolute https url) → schema.org ImageObject. */
  logo?: string;
  /* RFC-0163: representative organization image (absolute https url). */
  image?: string;
  /* RFC-0148: public team members (distinct from governance founders/board). */
  team?: SemanticPerson[];
  /**
   * RFC-0242: explicit schema.org @type override (e.g. `["Organization", "ProfessionalService"]`
   * for a Bodenstation studio deployment). Defaults to `["Organization", "NGO"]` when absent.
   */
  schemaType?: string[];
};

export type SemanticPageModel = {
  type: SemanticPageType;
  lang: string;
  defaultLanguage?: string;
  url: string;
  title: string;
  description: string;
  /** RFC-0377: optional audience override (falls back to SemanticPageType derivation map). */
  audience?: string;
  heading?: string;
  lead?: string;
  breadcrumbs: SemanticBreadcrumb[];
  /** RFC-0372: unified block array — replaces answerBlocks, contentBlocks, and bodyText. */
  blocks: SemanticBlock[];
  organization: SemanticOrganization;
  people?: SemanticPerson[];
  initiatives?: SemanticInitiative[];
  faqEntries?: SemanticFaqEntry[];
  /**
   * RFC-0143/RFC-0142: resolved per-page output projection. Set by the
   * semantic loaders via resolvePageOutput(); read by the llms formatters.
   * Always resolved (never undefined) once a model leaves the loader.
   */
  output?: PageOutputProjection;
  /**
   * RFC-0162: per-page social preview image (resolved from the RFC-0150
   * preview pipeline, with a business-logo fallback). Consumed by <SocialMeta>
   * for og:image / twitter:image and by RFC-0163 for primaryImageOfPage.
   */
  primaryImage?: SemanticImage;
  /**
   * RFC-0209: unresolved hero `leadImage` token ({src, alt}) carried from the
   * framework-free page handler to the asset-aware render layer. Set only when
   * the page declares a hero `leadImage` and no explicit `output.image`. The
   * layout resolves it through the Image Provider Port and promotes it to
   * `primaryImage` (ahead of the RFC-0150 preview-screenshot fallback). The
   * page handler cannot resolve the token to a URL (Astro content-hashing /
   * Image Provider Port run in the render layer), so it ships the raw token.
   */
  leadImageToken?: { src: string; alt: string };
  /** RFC-0162: Open Graph type. Defaults to "website" when unset. */
  ogType?: OgType;
  /** RFC-0162: Open Graph locale in `xx_XX` form (from system.md i18n hreflang). */
  ogLocale?: string;
  /** RFC-0162: Open Graph alternate locales in `xx_XX` form (other supported languages). */
  ogLocaleAlternates?: string[];
  /* RFC-0167: article metadata — when present, the page emits an Article/BlogPosting node. */
  datePublished?: string;
  dateModified?: string;
  author?: string;
  keywords?: string[];
  /**
   * RFC-0506: author record reference for ratgeber depth-1 pages. When present,
   * buildArticleNode emits a structured Person node with name and optional url
   * instead of a plain string author.
   */
  authorRecord?: {
    name: string;
    contactUrl?: string;
  };
  /** RFC-0506: latest reviewedAt date from article frontmatter, used for dateModified computation. */
  reviewedAt?: string;
  /** RFC-0506: changelog entries from article frontmatter (RFC-0504), used for dateModified computation. */
  changelog?: Array<{ date: string; summary: string; authorId: string }>;
  /**
   * RFC-0227: stable @id values for all material credit nodes that appear on this page.
   * When set, the WebPage node emits associatedMedia references so search engines can link
   * disclosed credits to the page entity. Populated by page templates that load credit records.
   */
  materialCreditAtIds?: string[];
  /**
   * RFC-0490: collection items for "collection"-typed pages (e.g. industry links on a pillar hub).
   * Each item is a { url, name } pair emitted as a ListItem in the JSON-LD ItemList node.
   */
  collectionItems?: Array<{ url: string; name: string }>;
  /** RFC-0492: surface identity for depth-gated JSON-LD corrections. */
  surfaceId?: string;
  /** RFC-0492: surface depth for depth-gated JSON-LD corrections. */
  depth?: number;
  /**
   * RFC-0492/RFC-0498: industry-specific Service node metadata for surface pages where Service is required.
   * When present, `buildJsonLd` emits a single industry Service node instead of the
   * organization-level Service nodes. Covers website-local depth-1, website-service depth-1,
   * and website-local depth-5.
   */
  industryService?: {
    serviceType: string;
    audience?: string;
    description?: string;
    areaServed?: string;
  };
  /**
   * RFC-0512: extra JSON-LD nodes injected into the @graph for team profile pages.
   * AI-agent profile pages inject a SoftwareApplication node; the team hub injects
   * a CollectionPage node with hasPart. Human profile pages do not need this —
   * the extended Person node is already emitted by buildPersonNode.
   */
  extraGraphNodes?: import("./jsonld/types.ts").JsonLdNode[];
};

export type SemanticSiteModel = {
  baseUrl: string;
  lang: string;
  defaultLanguage?: string;
  organization: SemanticOrganization;
  pages: SemanticPageModel[];
  /** RFC-0789: agent block from system.md, populated by the semantic loader. */
  agent?: { enabled?: boolean };
};
