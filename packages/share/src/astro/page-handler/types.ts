/*
<MODULE_CONTRACT>
<purpose>Public type surface for resolvePageRoute, extracted so content-fallback.ts and
resolve-route.ts can both reference PageRouteData without a circular runtime import.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of astro/page-handler.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import type { ResolvedPage } from "../../page.ts";
import type { SemanticPageModel, SemanticBreadcrumb } from "../../semantic/models.ts";
import type { ResolvedTranslationContext } from "../../legal/translation-policy.ts";
import type { OrchestratorConfig } from "./semantic.ts";

export interface SystemGrowthBlock {
  vendor: { adapter: string; options?: Record<string, string> };
  funnels?: string[];
  experiments?: string[];
}

export interface SemanticModelOptions {
  pageId: string;
  semanticType: string;
  lang: string;
  url: URL;
  /** RFC-0195: synthetic frontmatter for pages with no content entry (Programmatic Surface pages). */
  fallbackFrontmatter?: Record<string, unknown>;
  /** RFC-0229: the canonical breadcrumb trail (Home → live ancestors → self) for this page. */
  breadcrumbs?: SemanticBreadcrumb[];
  /** RFC-0490: collection items for "collection"-typed surface pages (pillar hub industry links). */
  collectionItems?: Array<{ url: string; name: string }>;
  /** RFC-0492: surface identity for depth-gated JSON-LD corrections. */
  surfaceId?: string;
  /** RFC-0492: surface depth for depth-gated JSON-LD corrections. */
  depth?: number;
}

export interface PageRouteData {
  pageId: string;
  page: ResolvedPage;
  alternateLinks: Array<{ lang: string; href: string }>;
  growthConfig: SystemGrowthBlock | undefined;
  appId: string;
  defaultLanguageCode: string;
  supportedLangs: string[];
  localizedSiblingPath: string;
  semanticType?: string;
  semanticPage: SemanticPageModel | null;
  ctaTarget?: string;
  biome: string;
  skipLinkLabel: string;
  resolvedDescription: string;
  /** RFC-0106 / RFC-0108 §LAY: per-page S-2 orchestrator opt-in flags. */
  orchestratorConfig: OrchestratorConfig;
  /**
   * RFC-0174: binding-language legal policy decision for this render. Null when the
   * page declares no `translation.binding` (i.e. it is not a legal page under policy).
   * Drives the mandatory language notice + "unofficial translation" indicator and,
   * for a `disabled` locale, a redirect to the binding-language document.
   */
  translationContext: ResolvedTranslationContext | null;
  /**
   * RFC-0192: when set, the route must emit a 301 to this path instead of rendering.
   * Used by Programmatic Surface redirect stubs (empty combinations → live ancestor).
   */
  redirectTo?: string;
  /** RFC-0257: print mode flag from ?print query param (always false for static builds). */
  printMode: boolean;
  /** RFC-0257: root-relative URL to the generated PDF, when output.printPdf is enabled. */
  pdfUrl?: string;
}

export interface ResolvePageRouteOptions {
  lang: string;
  slug: string;
  siteUrl: string;
  buildSemanticModel?: (opts: SemanticModelOptions) => Promise<SemanticPageModel | null>;
}
