/*
<MODULE_CONTRACT>
<purpose>RFC-0143: pure resolution of the per-page `output` projection container. Single resolution point shared by every per-page output generator (sitemap, llms) so the static disk loader, the Astro runtime path, and the sitemap command cannot drift.</purpose>
<non-goals>
  <item>Do not read files — pure function only.</item>
  <item>Do not own site-wide policy blocks (ai:, robots:) — those are separate top-level surfaces.</item>
  <item>Do not own per-generator value semantics beyond defaulting (llms depth lives in llms-policy.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0143: Initial implementation. Folds legacy sitemapExclude + per-page sitemap block into output.sitemap.</item>
  <item>RFC-0328: Apply legal-page default sitemap category when semanticType is "legal".</item>
  <item>RFC-0143 cleanup: Removed deprecated sitemapExclude and top-level sitemap alias handling.</item>
</CHANGE_SUMMARY>
*/

import type {
  PageOutputProjection,
  RobotsProjection,
  SemanticImage,
  SitemapProjection,
} from "./models.ts";
import { resolveLlmsPolicy, type RawLlmsPolicy } from "./llms-policy.ts";

/** Raw `output.image` as authored in system.md. RFC-0165/0167. */
export type RawImageProjection = {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
};

/**
 * Resolve the author-declared per-page content image. Returns a SemanticImage
 * tagged `contentImage: true` (eligible for the image sitemap), or undefined
 * when no image is declared or the url is empty.
 */
function resolveImage(raw: RawImageProjection | undefined): SemanticImage | undefined {
  if (!raw || typeof raw.url !== "string" || raw.url.trim() === "") return undefined;
  return {
    url: raw.url,
    ...(raw.alt !== undefined ? { alt: raw.alt } : {}),
    ...(raw.width !== undefined ? { width: raw.width } : {}),
    ...(raw.height !== undefined ? { height: raw.height } : {}),
    contentImage: true,
  };
}

/** Raw `output.robots` as authored in system.md. RFC-0165. */
export type RawRobotsProjection =
  | boolean
  | {
      index?: boolean;
      follow?: boolean;
    };

function resolveRobots(raw: RawRobotsProjection | undefined): RobotsProjection {
  if (typeof raw === "boolean") {
    // `output.robots: false` is shorthand for noindex,nofollow.
    return { index: raw, follow: raw };
  }
  const obj = raw ?? {};
  return { index: obj.index ?? true, follow: obj.follow ?? true };
}

/** Raw `output.sitemap` as authored in system.md (boolean shorthand or object). */
export type RawSitemapProjection =
  | boolean
  | {
      include?: boolean;
      category?: string;
      lastmod?: string;
      includeLastmod?: boolean;
    };

/** Raw `output` block as authored in system.md. Closed: only known generator keys. */
export type RawPageOutput = {
  sitemap?: RawSitemapProjection;
  llms?: RawLlmsPolicy;
  /** RFC-0165: per-page indexability. */
  robots?: RawRobotsProjection;
  /** RFC-0165/0167: author-declared content illustration (absolute https url). */
  image?: RawImageProjection;
};

export interface ResolvePageOutputOptions {
  semanticType?: string;
}

const DEFAULT_SITEMAP_CATEGORY = "content";

function resolveSitemap(
  raw: RawSitemapProjection | undefined,
  defaultCategory: string = DEFAULT_SITEMAP_CATEGORY,
): SitemapProjection {
  // Boolean shorthand: `output.sitemap: false`
  if (typeof raw === "boolean") {
    return {
      include: raw,
      category: defaultCategory,
      lastmod: undefined,
      includeLastmod: true,
    };
  }

  const obj = raw ?? {};
  return {
    include: obj.include ?? true,
    category: obj.category ?? defaultCategory,
    lastmod: obj.lastmod,
    includeLastmod: obj.includeLastmod ?? true,
  };
}

/**
 * RFC-0143: resolve every per-page projection from the raw `output` block.
 * The single resolution point for all per-page output generators.
 */
export function resolvePageOutput(
  raw: RawPageOutput | undefined,
  options: ResolvePageOutputOptions = {},
): PageOutputProjection {
  const output = raw ?? {};
  const defaultCategory = options.semanticType === "legal" ? "legal" : DEFAULT_SITEMAP_CATEGORY;
  return {
    sitemap: resolveSitemap(output.sitemap, defaultCategory),
    llms: resolveLlmsPolicy(output.llms, options.semanticType ?? ""),
    robots: resolveRobots(output.robots),
    ...(resolveImage(output.image) ? { image: resolveImage(output.image) } : {}),
  };
}
