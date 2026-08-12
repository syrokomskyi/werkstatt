/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runSitemapGenerate, runSitemapValidate } from "../sitemap.ts";
import { runSitemapImagesGenerate, runSitemapImagesValidate } from "../sitemap-images.ts";
import {
  runDistGeneratedMarkerStrip,
  runDistGeneratedMarkerValidate,
} from "../dist-generated-marker.ts";
import { runDistHtmlStructureValidate } from "../dist-html-structure.ts";
import { runBlogValidate } from "../blog.ts";
import { runArticleDepthValidate } from "../article-depth.ts";
import { runParticipantValidate } from "../participant.ts";
import { runTeamHubValidate } from "../team-hub.ts";
import { runParticipantProfileValidate } from "../participant-profile.ts";
import { runParticipantAiAgentValidate } from "../participant-ai-agent.ts";
import { runParticipantJsonValidate } from "../participant-json.ts";
import { runTeamLifecycleValidate } from "../team-lifecycle.ts";
import { runTeamCrossPageValidate } from "../team-cross-page.ts";
import { runFaqValidate } from "../faq.ts";
import { runLiveMediaValidate } from "../live-media.ts";
import { runVideoMediaValidate } from "../video/video-media.ts";
import { runVideoIosFallbackValidate } from "../video/video-fallback.ts";
import {
  runMaterialCreditsDriftValidate,
  runMaterialCreditsReport,
  runMaterialCreditsValidate,
} from "../material-credits.ts";
import { runGenerateMaterialCreditsPage } from "@warpgogol/werkstatt-site/codegen";
import { runMaterialMetadataValidate } from "../material-metadata.ts";
import { runPersonCreate } from "../person-create.ts";
import { runRootCanonicalValidate } from "../root-canonical.ts";
import { runRouteTopologyValidate } from "../route-topology.ts";
import { runLlmsGenerate, runLlmsValidate } from "../llms.ts";
import { runPageMarkdownGenerate, runPageMarkdownValidate } from "../page-markdown.ts";
import { runPageBlocksValidate } from "../page-blocks-validate.ts";
import { runEntitlementsResolve, runEntitlementsValidate } from "../entitlements.ts";
import { BUILD_ARTIFACT_COMMANDS_PART2 } from "./09b-build-artifacts-part2.ts";

export const BUILD_ARTIFACT_COMMANDS: CheckCommandEntry[] = [
  ...BUILD_ARTIFACT_COMMANDS_PART2,

  /* RFC-0049: sitemap generation and validation */
  {
    name: "sitemap.generate",
    description:
      "Dry-run sitemap generation from route registry. Prints XML to stdout and reports URL count (RFC-0049).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/public/sitemap.xml", "<app>/public/sitemap-*.xml"],
    reads: ["<app>/src/content/system.md", "<app>/dist/client/**/*.html"],
    modulePaths: [
      "sitemap.ts",
      "sitemap-helpers.ts",
      "result-helpers.ts",
      "lib/astro-site-url.ts",
      "lib/i18n.ts",
    ],
    execute: runSitemapGenerate,
  },
  {
    name: "sitemap.validate",
    description:
      "Validate built dist/sitemap.xml against route registry. Checks structural correctness, bidirectional hreflang symmetry, and no unexpected URLs (RFC-0049).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/dist/client/sitemap*.xml",
      "<app>/dist/client/**/*.html",
      "<app>/src/content/system.md",
    ],
    modulePaths: [
      "sitemap.ts",
      "sitemap-helpers.ts",
      "result-helpers.ts",
      "lib/astro-site-url.ts",
      "lib/i18n.ts",
    ],
    execute: runSitemapValidate,
  },
  /* RFC-0172: post-build render-sourced image sitemap */
  {
    name: "dist.sitemap.images.generate",
    description:
      "Harvest rendered dist/client HTML for each page's lead/content image and write dist/client/sitemap-images.xml. Post-build (RFC-0172).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html"],
    cacheable: false,
    execute: runSitemapImagesGenerate,
  },
  {
    name: "dist.sitemap.images.validate",
    description:
      "Validate the content-image contract over rendered HTML: exactly one content image per page, absolute URLs, no synthetic previews, and an up-to-date sitemap-images.xml (RFC-0172).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/dist/client/sitemap-images.xml"],
    modulePaths: ["sitemap-images.ts", "result-helpers.ts", "lib/astro-site-url.ts"],
    execute: runSitemapImagesValidate,
  },
  /* RFC-0185: strip generated markers from dist/client */
  {
    name: "dist.generated-marker.strip",
    description:
      "Post-build cleanup: remove the RFC-0081 GENERATED_MARKER from every text artifact under apps/<id>/dist/client (RFC-0185).",
    scope: "app",
    flags: {
      app: {
        kind: "string",
        description: "App name to use when no app context is active.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/dist/client/**"],
    reads: ["<app>/dist/client/**"],
    modulePaths: [
      "dist-generated-marker.ts",
      "result-helpers.ts",
      "strip-html-generated-marker.ts",
    ],
    execute: runDistGeneratedMarkerStrip,
  },
  {
    name: "dist.generated-marker.validate",
    description:
      "Post-build guard: fail if any text artifact under apps/<id>/dist/client still contains the RFC-0081 GENERATED_MARKER (RFC-0185).",
    scope: "app",
    flags: {
      app: {
        kind: "string",
        description: "App name to use when no app context is active.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/dist/client/**"],
    modulePaths: [
      "dist-generated-marker.ts",
      "result-helpers.ts",
      "strip-html-generated-marker.ts",
    ],
    execute: runDistGeneratedMarkerValidate,
  },
  /* RFC-0654: post-build HTML structural integrity validation */
  {
    name: "dist.html-structure.validate",
    description:
      "Post-build guard: check tag balance for structural non-void HTML elements in dist/client. Fails on mismatched open/close counts (RFC-0654).",
    scope: "app",
    flags: {
      app: {
        kind: "string",
        description: "App name to use when no app context is active.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/dist/client/**"],
    cacheable: true,
    modulePaths: ["dist-html-structure.ts"],
    execute: runDistHtmlStructureValidate,
  },
  /* RFC-0167: sellable blog/article module contract */
  {
    name: "blog.validate",
    description:
      "Validate the article contract (publishedAt/updatedAt dates, tag shape, author resolution) over system.md article pages. No-op pass when the blog feature is not entitled (RFC-0167).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/pages/**/*.md"],
    modulePaths: ["blog.ts", "result-helpers.ts", "lib/surface-articles.ts"],
    execute: runBlogValidate,
  },
  /* RFC-0325: dated editorial article substance contract (generic, semanticType-driven) */
  {
    name: "article.depth.validate",
    description:
      "Validate that every 'article'-typed page (system.md or Programmatic Surface) has source-backed dates, a normalized-body word-count floor, substantive H2 sections, feed inclusion, and Markdown twin date provenance (RFC-0325).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/pages/**/*.md"],
    modulePaths: [
      "article-depth.ts",
      "result-helpers.ts",
      "lib/astro-site-url.ts",
      "lib/i18n.ts",
      "lib/surface-articles.ts",
    ],
    execute: runArticleDepthValidate,
  },
  /* RFC-0508: canonical Participant record contract (replaces people.validate) */
  {
    name: "participant.validate",
    description:
      "Validate the canonical Participant record contract (participantType, type-specific required fields, consent for public humans, accountableHumanId for AI agents, visibility rules, consent.approvedFields vocabulary). No-op pass when the site has no Participant records (RFC-0508).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/people/**/*.md"],
    modulePaths: ["participant.ts", "result-helpers.ts"],
    execute: runParticipantValidate,
  },
  /* RFC-0509: team hub page structure and founder retirement validation */
  {
    name: "team.hub.validate",
    description:
      "Validate the team hub page structure: semanticType: collection, >=3 people blocks (human, organization-unit, ai-agent), all select.visibility: public + select.status: active, founder pageId absent, founder 301 redirect in retiredRoutes, navigation has team entry. No-op pass when the site has no team page (RFC-0509).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/system.md",
      "<app>/src/content/pages/**/*.md",
      "<app>/src/content/navigation/**/*.md",
    ],
    modulePaths: ["team-hub.ts", "result-helpers.ts"],
    execute: runTeamHubValidate,
  },
  /* RFC-0510: human profile page structure validation */
  {
    name: "participant.profile.validate",
    description:
      "Validate the six-block human profile page structure: career/evidence/personal prose files exist, consent gating, evidence.claims sourceRef URLs, responsibility/authority non-empty items, no cta for former/retired. No-op pass when the site has no people records (RFC-0510).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/people/**/*.md",
      "<app>/src/content/prose/**/*.md",
      "<app>/src/content/system.md",
    ],
    modulePaths: ["participant-profile.ts", "result-helpers.ts"],
    execute: runParticipantProfileValidate,
  },
  /* RFC-0511: AI-agent profile page structure validation */
  {
    name: "participant.ai-agent.validate",
    description:
      "Validate AI-agent profile pages: accountableHumanId resolution, autonomyLevel enum (A0–A4), purposeStatement, prose file presence (rechte, verantwortlichkeit, technik), public/private field separation. No-op pass when no AI-agent participants exist (RFC-0511).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/people/**/*.md",
      "<app>/src/content/prose/**/*.md",
      "<app>/src/content/system.md",
    ],
    modulePaths: ["participant-ai-agent.ts", "result-helpers.ts"],
    execute: runParticipantAiAgentValidate,
  },
  /* RFC-0512: team JSON endpoint validation (private field exclusion, shape, consent gating) */
  {
    name: "participant.json.validate",
    description:
      "Validate generated team JSON endpoints (dist/team/profiles.json, dist/team/[slug]/profile.json, dist/team/ki-agenten/[slug]/profile.json) for shape correctness, private field exclusion, birthDate absence, and consent-gated field compliance. No-op pass when the site has no public participants (RFC-0512).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/team/**/*.json"],
    modulePaths: ["participant-json.ts", "result-helpers.ts"],
    execute: runParticipantJsonValidate,
  },
  /* RFC-0513: team lifecycle validation (status transitions, CTA removal, review cadence) */
  {
    name: "team.lifecycle.validate",
    description:
      "Validate participant lifecycle: no CTA for former/retired, no public visibility for draft/suspended, warnings for stale consent (>12mo), stale profile review (>12mo), stale AI-agent technical evaluation (>6mo), and past nextReviewAt/nextEvaluationAt. No-op pass when the site has no people records (RFC-0513).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/people/**/*.md"],
    modulePaths: ["team-lifecycle.ts", "result-helpers.ts"],
    execute: runTeamLifecycleValidate,
  },
  /* RFC-0513: cross-page alignment validation (hub ↔ profile ↔ home ↔ navigation ↔ JSON) */
  {
    name: "team.cross-page.validate",
    description:
      "Validate cross-page consistency: hub lists public active participants, home page shows only active public humans, navigation has team (not founder), JSON endpoints match HTML pages. No-op pass when the site has no people records or no team hub page (RFC-0513).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/people/**/*.md",
      "<app>/src/content/system.md",
      "<app>/src/content/pages/**/*.md",
      "<app>/src/content/navigation/**/*.md",
      "<app>/dist/team/**/*.json",
    ],
    modulePaths: ["team-cross-page.ts", "result-helpers.ts"],
    execute: runTeamCrossPageValidate,
  },
  /* RFC-0475: canonical FAQ entry contract */
  {
    name: "faq.validate",
    description:
      "Validate the canonical FAQ entry contract (slug, question, answer, order, tags, governance). No-op pass when the app has no FAQ directory (RFC-0475).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/faq/**/*.md"],
    modulePaths: ["faq.ts", "result-helpers.ts"],
    execute: runFaqValidate,
  },
  /* RFC-0202: living-photos media contract */
  {
    name: "live.media.validate",
    description:
      "Validate the living-photos media contract: every image authored as live has a sibling <token>.webm, and every content .webm has a sibling static poster image (RFC-0202).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/public/**"],
    modulePaths: ["live-media.ts", "result-helpers.ts", "lib/file-exists.ts", "lib/i18n.ts"],
    execute: runLiveMediaValidate,
  },
  /* RFC-0210: unified media contract — explicit-source (feature/background) governance */
  {
    name: "video.media.validate",
    description:
      "Validate explicit media configs: every `media:` source token resolves to a source video, feature media has alt text, and feature media warns when it ships no captions (WCAG 1.2.2) (RFC-0210).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/video-manifest.generated.yaml"],
    modulePaths: ["video/video-media.ts"],
    execute: runVideoMediaValidate,
  },
  /* RFC-0234: refuse to publish a site whose videos lack an iOS-playable delivery format */
  {
    name: "video.ios-fallback.validate",
    description:
      "Refuse to publish without an iOS-playable video format: every `media:` source must expose an existing MP4 rendition, and every living-photo clip must ship a sibling iOS MP4 or be transparent-by-design (poster-only on iOS) (RFC-0234).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/video-manifest.generated.yaml",
      "<app>/src/live-video-manifest.generated.yaml",
    ],
    modulePaths: ["video/video-fallback.ts"],
    execute: runVideoIosFallbackValidate,
  },
  /* RFC-0220: material credits page generation */
  {
    name: "material.credits.generate",
    description:
      "Generate material credits pages (pages/{lang}/credits.md, prose/{lang}/credits.md) from *.credits.yaml sidecars (RFC-0220).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    cacheable: false,
    writes: [
      "<app>/src/content/pages/{lang}/credits.md",
      "<app>/src/content/prose/{lang}/credits.md",
    ],
    reads: ["<app>/src/content/**/*.credits.yaml", "<app>/src/content/system.md"],
    modulePaths: ["service.ts"],
    execute: runGenerateMaterialCreditsPage,
  },
  /* RFC-0220: material credits / provenance governance */
  {
    name: "material.credits.validate",
    description:
      "Validate RFC-0220 material credit sidecars for published media/materials and require a routed credits page.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.credits.yaml", "<app>/src/content/system.md"],
    modulePaths: ["material-credits.ts", "result-helpers.ts", "lib/i18n.ts"],
    execute: runMaterialCreditsValidate,
  },
  /* RFC-0236: generated-file drift guard */
  {
    name: "material.credits.drift.validate",
    description:
      "Detect manual edits in generated prose/{lang}/credits.md files by re-rendering from *.credits.yaml and comparing with disk. Fails when a generated credits page diverges from its source.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.credits.yaml", "<app>/src/content/prose/**/credits.md"],
    modulePaths: ["material-credits.ts", "result-helpers.ts", "lib/i18n.ts"],
    execute: runMaterialCreditsDriftValidate,
  },
  {
    name: "material.credits.report",
    description:
      "Report RFC-0220 material references and matching credit sidecars without mutating files.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runMaterialCreditsReport,
  },
  /* RFC-0528: embedded metadata validation with manifest-based discovery */
  {
    name: "material.metadata.validate",
    description:
      "Validate RFC-0528 embedded IPTC/XMP metadata on derived image/video variants discovered through manifests. Diagnostics META-01..04. Gracefully skips when exiftool is unavailable.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runMaterialMetadataValidate,
  },
  /* RFC-0200: scaffold a canonical Person record */
  {
    name: "person.create",
    description:
      "Scaffold a canonical Person record at people/<lang>/<slug>.md with NEED_THIS_* placeholders. Flags: --slug, --name, --lang (default de), --page (RFC-0200).",
    scope: "app",
    flags: {
      slug: {
        kind: "string",
        description: "Slug to create.",
      },
      name: {
        kind: "string",
        description: "Entity or scaffold name.",
      },
      lang: {
        kind: "string",
        description: "Language code.",
      },
      page: {
        kind: "boolean",
        description: "Create the companion page artifact.",
      },
    },
    mutatesState: true,
    supportsAllSites: false,
    writes: ["<app>/src/content/people/{lang}/{slug}.md"],
    cacheable: false,
    execute: runPersonCreate,
  },
  /* RFC-0159 */
  {
    name: "root.canonical.validate",
    description:
      "Validate that src/pages/index.astro serves the default-language home content (not a redirect stub) and canonicalizes to the default-language home (RFC-0159).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/pages/index.astro", "<app>/src/content/system.md"],
    modulePaths: ["root-canonical.ts", "result-helpers.ts"],
    execute: runRootCanonicalValidate,
  },
  /* RFC-0160 */
  {
    name: "route.topology.validate",
    description:
      "Validate the unprefixed-default-language routing contract: default language served at / and /<slug>, non-default under /<lang>/, no slug/language-code collision (RFC-0160).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/pages/**/*.astro"],
    modulePaths: ["route-topology.ts", "result-helpers.ts", "lib/i18n.ts"],
    execute: runRouteTopologyValidate,
  },
  /* RFC-0050: llms.txt */
  {
    name: "llms.generate",
    description:
      "Generate public/llms.txt and public/llms-full.txt from disk content before Astro build (RFC-0050).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/public/llms.txt", "<app>/public/llms-full.txt"],
    reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md"],
    modulePaths: ["llms.ts", "result-helpers.ts", "lib/astro-site-url.ts", "lib/i18n.ts"],
    execute: runLlmsGenerate,
  },
  {
    name: "llms.validate",
    description:
      "Validate that public/llms.txt and public/llms-full.txt exist, are non-empty, and contain expected structural markers (RFC-0050).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/llms.txt", "<app>/public/llms-full.txt"],
    modulePaths: ["llms.ts", "result-helpers.ts", "lib/astro-site-url.ts", "lib/i18n.ts"],
    execute: runLlmsValidate,
  },
  /* RFC-0166 */
  {
    name: "page.markdown.generate",
    description:
      "Generate a sibling <route>.md twin for every full/summary page from the disk semantic model; home pages keep index.md (RFC-0166/RFC-0306).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/public/index.md", "<app>/public/{route}.md"],
    reads: ["<app>/src/content/system.md", "<app>/src/content/pages/**/*.md"],
    modulePaths: [
      "page-markdown.ts",
      "result-helpers.ts",
      "lib/astro-site-url.ts",
      "lib/i18n.ts",
      "lib/surface-articles.ts",
    ],
    execute: runPageMarkdownGenerate,
  },
  {
    name: "page.markdown.validate",
    description:
      "Validate that every rel=alternate text/markdown link in the rendered HTML resolves to an emitted Markdown twin (RFC-0166).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/public/**/*.md"],
    modulePaths: [
      "page-markdown.ts",
      "result-helpers.ts",
      "lib/astro-site-url.ts",
      "lib/i18n.ts",
      "lib/surface-articles.ts",
    ],
    execute: runPageMarkdownValidate,
  },
  /* RFC-0208 / RFC-0372 */
  {
    name: "page.blocks.extract.validate",
    description:
      "Validate that every block type has a registered extractor and every block has an id. Enforces the unified SemanticBlock contract (RFC-0208/RFC-0372).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/pages/**/*.md"],
    modulePaths: [
      "page-blocks-validate.ts",
      "result-helpers.ts",
      "lib/astro-site-url.ts",
      "lib/i18n.ts",
    ],
    execute: runPageBlocksValidate,
  },
  /* RFC-0169 */
  {
    name: "entitlements.resolve",
    description:
      "Resolve the app's paid-feature set from Stripe Entitlements and write src/entitlements.generated.yaml (RFC-0169).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/entitlements.generated.yaml"],
    cacheable: false,
    execute: runEntitlementsResolve,
  },
  {
    name: "entitlements.validate",
    description:
      "Validate the resolved entitlements file against the closed EntitledFeature catalog (RFC-0169).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/entitlements.generated.yaml",
      "packages/werkstatt-site/src/domain/ontology/entitlements/**/*.yaml",
    ],
    modulePaths: ["entitlements.ts", "result-helpers.ts"],
    execute: runEntitlementsValidate,
  },
];
