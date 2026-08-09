/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0141][RFC-0042][RFC-0053] Filesystem asset resolution — the relocated bare-filename
  image resolver that previously lived in @warpgogol/werkstatt-site/share/src/image-utils.ts. It is now the
  filesystem adapter's implementation of the abstract resolveAsset() contract.

  The actual glob map of available images is supplied by the consumer (a Vite
  import.meta.glob in the app/UI build context), because import.meta.glob is resolved at the
  call site against the app root. This module is pure resolution logic over that map.
</purpose>
<non-goals>
  <item>Do not call import.meta.glob here — the map is injected by the consumer.</item>
  <item>Do not change resolution semantics — this is a byte-for-byte relocation of image-utils.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0248: shared content-asset candidate generation now backs runtime resolution and validators.</item>
</CHANGE_SUMMARY>
*/

import type { ImageMetadata } from "astro";
import type { AssetRef, ResolvedAsset } from "../../types.ts";

/** Standard image extensions to try in order of preference */
export const IMAGE_EXTENSIONS = [".webp", ".jpg", ".jpeg", ".png"];
export const CONTENT_ASSET_DOMAINS = ["pages", "business", "people", "site", "surface"] as const;

/** [RFC-0202] Supported living-photo clip extensions (webm-only for now). */
export const VIDEO_EXTENSIONS = [".webm"];

/** [RFC-0210] Source video container extensions an author may drop, in lookup preference order. */
export const MEDIA_SOURCE_EXTENSIONS = [".mp4", ".webm"];

/** Default language for image fallback */
export const DEFAULT_LANGUAGE = "de";

export interface ImageResolverOptions {
  lang?: string;
  defaultLang?: string;
  subPath?: string;
  extensions?: string[];
}

export type ContentAssetDomain = (typeof CONTENT_ASSET_DOMAINS)[number];
export type ContentAssetExtension = (typeof IMAGE_EXTENSIONS)[number];

export interface ContentAssetSyntaxDiagnostic {
  reason: "leading-slash" | "path" | "extension";
  message: string;
  fixHint: string;
}

export interface ContentAssetToken {
  raw: string;
  normalized?: string;
  domain: ContentAssetDomain;
  lang: string;
  subPath?: string;
  sourceFile: string;
}

export interface ContentAssetCandidate {
  domain: ContentAssetDomain;
  lang: string;
  relativePath: string;
  extension: ContentAssetExtension;
  exists: boolean;
  fallback: "requested-lang" | "default-lang" | "flat-surface";
}

export interface ContentAssetResolutionContract {
  token: ContentAssetToken;
  syntaxDiagnostics: ContentAssetSyntaxDiagnostic[];
  candidates: ContentAssetCandidate[];
  resolved?: ContentAssetCandidate;
}

export interface ContentAssetResolutionOptions {
  defaultLanguage: string;
  extensions?: readonly ContentAssetExtension[];
  assetExists?: (relativePath: string) => boolean;
}

const RASTER_EXTENSION_PATTERN = /\.(webp|jpg|jpeg|png)$/i;

function languageFallbacks(
  lang: string,
  defaultLanguage: string,
): Array<{
  lang: string;
  fallback: "requested-lang" | "default-lang";
}> {
  return lang === defaultLanguage
    ? [{ lang, fallback: "requested-lang" }]
    : [
        { lang, fallback: "requested-lang" },
        { lang: defaultLanguage, fallback: "default-lang" },
      ];
}

export function contentAssetSyntaxDiagnostics(raw: string): ContentAssetSyntaxDiagnostic[] {
  const diagnostics: ContentAssetSyntaxDiagnostic[] = [];
  if (raw.startsWith("/")) {
    diagnostics.push({
      reason: "leading-slash",
      message: `Asset token "${raw}" starts with a slash; content must use a bare filename.`,
      fixHint: "Remove the leading slash and keep only the bare filename.",
    });
  }
  if (raw.includes("/") || raw.includes("\\")) {
    diagnostics.push({
      reason: "path",
      message: `Asset token "${raw}" includes a path; content must use a bare filename.`,
      fixHint:
        "Move path ownership to the content-local assets folder and author only the filename.",
    });
  }
  if (RASTER_EXTENSION_PATTERN.test(raw)) {
    diagnostics.push({
      reason: "extension",
      message: `Asset token "${raw}" includes a file extension; content must use the bare filename "${raw.replace(
        RASTER_EXTENSION_PATTERN,
        "",
      )}".`,
      fixHint:
        "Change the authored value to the bare filename and keep the extension only on disk.",
    });
  }
  return diagnostics;
}

function contentAssetPath(
  raw: string,
  subPath?: string,
): { normalized: string; assetPath: string } {
  const normalized = raw.replace(RASTER_EXTENSION_PATTERN, "");
  const assetPath =
    normalized.includes("/") || normalized.includes("\\")
      ? normalized.replace(/\\/g, "/")
      : `${subPath ? subPath + "/" : "assets/"}${normalized}`;
  return { normalized, assetPath };
}

export function describeContentAssetResolution(
  token: ContentAssetToken,
  options: ContentAssetResolutionOptions,
): ContentAssetResolutionContract {
  const extensions = options.extensions ?? IMAGE_EXTENSIONS;
  const exists = options.assetExists ?? (() => false);
  const syntaxDiagnostics = contentAssetSyntaxDiagnostics(token.raw);
  const { normalized, assetPath } = contentAssetPath(token.raw, token.subPath);
  const candidates: ContentAssetCandidate[] = [];

  for (const domain of CONTENT_ASSET_DOMAINS) {
    if (domain === "surface") continue;
    for (const langEntry of languageFallbacks(token.lang, options.defaultLanguage)) {
      for (const extension of extensions) {
        const relativePath = `/src/content/${domain}/${langEntry.lang}/${assetPath}${extension}`;
        candidates.push({
          domain,
          lang: langEntry.lang,
          relativePath,
          extension,
          exists: exists(relativePath),
          fallback: langEntry.fallback,
        });
      }
    }
  }

  for (const extension of extensions) {
    const relativePath = `/src/content/surface/${assetPath}${extension}`;
    candidates.push({
      domain: "surface",
      lang: "",
      relativePath,
      extension,
      exists: exists(relativePath),
      fallback: "flat-surface",
    });
  }

  return {
    token: { ...token, normalized },
    syntaxDiagnostics,
    candidates,
    resolved: candidates.find((candidate) => candidate.exists),
  };
}

/**
 * [RFC-0042] Resolve image by name with auto path construction and language fallback.
 * Accepts bare filenames ("hero-bg"), partial paths ("assets/hero-bg"), or full paths.
 * Automatically tries multiple extensions and falls back to default language.
 */
// @ai-invariant: resolveImage is the ONE shared content-asset resolver (RFC-0141).
// Bare filenames only — no paths, no extensions. Extension priority: .webp → .jpg
// → .jpeg → .png. Automatic fallback to DEFAULT_LANGUAGE ("de"). The glob map is
// supplied by the consumer (packages/ui/src/content-assets.ts — the ONE allowed
// import.meta.glob call site). Never parse AssetRef.token to infer locality.

export function resolveImage(
  images: Record<string, { default: ImageMetadata }>,
  imageName: string | undefined,
  options: ImageResolverOptions = {},
): ImageMetadata | null {
  if (!imageName) return null;

  const {
    lang = DEFAULT_LANGUAGE,
    defaultLang = DEFAULT_LANGUAGE,
    subPath,
    extensions = IMAGE_EXTENSIONS,
  } = options;

  if (imageName.startsWith("/src/content/")) {
    if (images[imageName]) return images[imageName].default;
    for (const ext of extensions) {
      const pathWithExt = imageName.replace(/\.(webp|jpg|jpeg|png)$/i, ext);
      if (images[pathWithExt]) return images[pathWithExt].default;
    }
    const fallbackPath = imageName.replace(
      /(\/src\/content\/pages\/)[^/]+(\/)/,
      `$1${defaultLang}$2`,
    );
    if (fallbackPath !== imageName && images[fallbackPath]) {
      return images[fallbackPath].default;
    }
    console.warn(
      `[resolveImage] Image not found: "${imageName}" (lang: ${lang}, defaultLang: ${defaultLang})`,
    );
    return null;
  }

  const contract = describeContentAssetResolution(
    {
      raw: imageName,
      domain: "pages",
      lang,
      subPath,
      sourceFile: "",
    },
    {
      defaultLanguage: defaultLang,
      extensions: extensions as readonly ContentAssetExtension[],
      assetExists: (relativePath) => Boolean(images[relativePath]),
    },
  );
  if (contract.resolved) return images[contract.resolved.relativePath]!.default;

  console.warn(
    `[resolveImage] Image not found: "${imageName}" (lang: ${lang}, defaultLang: ${defaultLang})`,
  );
  return null;
}

/**
 * [RFC-0202] Resolve the sibling living-photo clip for an image token.
 *
 * The clip is, by convention, `<image-name>.webm` living next to the poster image (no path is
 * ever authored). This mirrors resolveImage's path construction and language fallback exactly,
 * searching pages/<lang>/assets then business/<lang>/assets (RFC-0200 co-location), and returns
 * the bundled hashed URL string (the video glob is imported with `?url`) or null.
 */
// @ai-invariant: resolveVideo never receives or constructs a video path from content — the
// clip name is always derived from the image token by swapping the extension to .webm.
export function resolveVideo(
  videos: Record<string, string>,
  imageName: string | undefined,
  options: ImageResolverOptions = {},
): string | null {
  if (!imageName) return null;

  const { lang = DEFAULT_LANGUAGE, defaultLang = DEFAULT_LANGUAGE, subPath } = options;

  const videoExtensions = options.extensions ?? VIDEO_EXTENSIONS;

  // Full-path tokens: swap any raster/video extension to each requested video extension and look it up directly.
  if (imageName.startsWith("/src/content/")) {
    for (const extension of videoExtensions) {
      const videoPath = imageName.replace(/\.(webp|jpg|jpeg|png|webm|mp4)$/i, extension);
      if (videos[videoPath]) return videos[videoPath];
      const fallbackPath = videoPath.replace(
        /(\/src\/content\/pages\/)[^/]+(\/)/,
        `$1${defaultLang}$2`,
      );
      if (fallbackPath !== videoPath && videos[fallbackPath]) return videos[fallbackPath];
    }
    return null;
  }

  const cleanName = imageName.replace(/\.(webp|jpg|jpeg|png|webm|mp4)$/i, "");
  const assetPath = cleanName.includes("/")
    ? cleanName
    : `${subPath ? subPath + "/" : "assets/"}${cleanName}`;

  const langs = lang === defaultLang ? [lang] : [lang, defaultLang];
  for (const dirLang of langs) {
    for (const extension of videoExtensions) {
      const pagesPath = `/src/content/pages/${dirLang}/${assetPath}${extension}`;
      if (videos[pagesPath]) return videos[pagesPath];
    }
  }
  // RFC-0200 co-location: Person photo tokens (and their clips) live under people/<lang>/assets.
  for (const dirLang of langs) {
    for (const extension of videoExtensions) {
      const peoplePath = `/src/content/people/${dirLang}/${assetPath}${extension}`;
      if (videos[peoplePath]) return videos[peoplePath];
    }
  }
  // PBP entity assets live under business-profile/<lang>/assets.
  for (const dirLang of langs) {
    for (const extension of videoExtensions) {
      const businessPath = `/src/content/business-profile/${dirLang}/${assetPath}${extension}`;
      if (videos[businessPath]) return videos[businessPath];
    }
  }

  // Site-wide video assets (e.g. footer background clips) live under site/<lang>/assets/.
  for (const dirLang of langs) {
    for (const extension of videoExtensions) {
      const sitePath = `/src/content/site/${dirLang}/${assetPath}${extension}`;
      if (videos[sitePath]) return videos[sitePath];
    }
  }

  // RFC-0238: surface video assets.
  for (const dirLang of langs) {
    for (const extension of videoExtensions) {
      const surfacePath = `/src/content/surface/${dirLang}/${assetPath}${extension}`;
      if (videos[surfacePath]) return videos[surfacePath];
    }
  }
  for (const extension of videoExtensions) {
    const surfacePath = `/src/content/surface/${assetPath}${extension}`;
    if (videos[surfacePath]) return videos[surfacePath];
  }

  return null;
}

/** [RFC-0210] The resolved source video: the content-relative glob key (manifest lookup) + hashed URL. */
export interface ResolvedMediaSource {
  /** Content-relative glob key, e.g. /src/content/pages/uk/assets/promo.mp4 — the video-manifest key. */
  key: string;
  /** Bundled hashed URL of the raw source (dev fallback used when the generated manifest is absent). */
  url: string;
}

/**
 * [RFC-0210] Resolve an explicit media source token (`feature`/`background` profiles) to its
 * content-relative glob key and bundled URL. Mirrors resolveImage/resolveVideo path construction
 * and language fallback exactly (pages/<lang>/assets then business/<lang>/assets), trying the
 * source container extensions (.mp4 → .webm). The returned `key` is the lookup key into the
 * GENERATED video manifest written by video.variants.generate; `url` is the raw source URL used
 * as a dev fallback when the manifest is not yet present.
 */
// @ai-invariant: resolveMedia addresses media by directory language (<lang>/assets/<token>.<ext>),
// the exact analogue of resolveImage — NEVER a "-<lang>" filename suffix.
export function resolveMedia(
  videos: Record<string, string>,
  token: string | undefined,
  options: ImageResolverOptions = {},
): ResolvedMediaSource | null {
  if (!token) return null;

  const { lang = DEFAULT_LANGUAGE, defaultLang = DEFAULT_LANGUAGE, subPath } = options;
  const extensions = options.extensions ?? MEDIA_SOURCE_EXTENSIONS;

  if (token.startsWith("/src/content/")) {
    for (const ext of extensions) {
      const key = token.replace(/\.(mp4|webm|webp|jpg|jpeg|png)$/i, ext);
      if (videos[key]) return { key, url: videos[key]! };
    }
    return null;
  }

  const cleanName = token.replace(/\.(mp4|webm|webp|jpg|jpeg|png)$/i, "");
  // Feature/background masters live in the non-bundled `media/` folder (canonical); `assets/` is
  // accepted for back-compat. A subPath or slashed token overrides the folder convention.
  const subdirs = cleanName.includes("/")
    ? [cleanName]
    : subPath
      ? [`${subPath}/${cleanName}`]
      : [`media/${cleanName}`, `assets/${cleanName}`];

  const langs = lang === defaultLang ? [lang] : [lang, defaultLang];
  for (const domain of ["pages", "business", "site"]) {
    for (const dirLang of langs) {
      for (const sub of subdirs) {
        for (const ext of extensions) {
          const key = `/src/content/${domain}/${dirLang}/${sub}${ext}`;
          if (videos[key]) return { key, url: videos[key]! };
        }
      }
    }
  }

  return null;
}

/**
 * [RFC-0042] Factory for creating a scoped image resolver.
 * Creates a resolver bound to specific images glob and options.
 */
export function createImageResolver(
  images: Record<string, { default: ImageMetadata }>,
  baseOptions: ImageResolverOptions = {},
) {
  return (imageName: string | undefined, overrideOptions: ImageResolverOptions = {}) => {
    return resolveImage(images, imageName, { ...baseOptions, ...overrideOptions });
  };
}

/**
 * [RFC-0042] Resolve image or throw error if not found.
 * Use when image is required and missing image should fail the build.
 */
export function resolveImageRequired(
  images: Record<string, { default: ImageMetadata }>,
  imageName: string | undefined,
  options: ImageResolverOptions,
  context: string,
): ImageMetadata {
  const resolved = resolveImage(images, imageName, options);
  if (!resolved) {
    throw new Error(`Image "${imageName}" not found in ${context}`);
  }
  return resolved;
}

/**
 * [RFC-0141] The filesystem adapter's implementation of the abstract AssetRef → ResolvedAsset
 * resolver. Closes over a Vite glob map (supplied by the consumer) and returns a `local`
 * ResolvedAsset when the bare-filename token resolves, or null otherwise.
 */
export function createFsAssetResolver(
  images: Record<string, { default: ImageMetadata }>,
): (ref: AssetRef) => ResolvedAsset | null {
  return (ref: AssetRef): ResolvedAsset | null => {
    const image = resolveImage(images, ref.token, { lang: ref.lang, subPath: ref.subPath });
    return image ? { kind: "local", image } : null;
  };
}
