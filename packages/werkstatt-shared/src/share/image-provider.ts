/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0152] The Image Provider Port — the rendering/optimization analogue of the
  RFC-0141 content-source port. Defines "how an authored image becomes src + srcset"
  as a swappable provider so the optimization backend (Cloudflare runtime today, a
  CMS/DAM or build-time pipeline later) can change without touching any section or
  component. Ships the `cloudflare-runtime` provider (Cloudflare Image Resizing via
  /cdn-cgi/image) as the default.
  [RFC-0204] Adds the `build-portable` provider that emits srcset from pre-generated
  static width variants (no Cloudflare Image Transformations required).
</purpose>
<non-goals>
  <item>Do not run sharp or any build-time optimization here — providers emit URLs only.</item>
  <item>Do not resolve asset tokens — that is resolveImage / the content-source port.</item>
  <item>Do not implement the cms-native provider yet (later phase).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0152: introduced the Image Provider Port and the cloudflare-runtime provider.</item>
  <item>RFC-0204: added ImageVariantManifest types and createBuildPortableProvider factory.</item>
</CHANGE_SUMMARY>
*/

/** A resolved image to render. Astro's ImageMetadata is structurally assignable. */
export interface ImageDescriptor {
  /** Origin path: root-relative for in-repo assets ("/_astro/..") or an absolute URL (CMS/DAM). */
  src: string;
  /** Intrinsic width, when known — used to avoid upscaling the responsive ladder. */
  width?: number;
  /** Intrinsic height, when known. */
  height?: number;
}

/** Output format requested from the provider. */
export type ImageFormat = "webp" | "avif" | "auto";

/** Quality presets. NOTE: Cloudflare expects a numeric quality — never the literal "max". */
export const IMAGE_QUALITY_PRESETS = { low: 30, mid: 60, high: 80, max: 100 } as const;
export type ImageQualityPreset = keyof typeof IMAGE_QUALITY_PRESETS;

/** Default no-upscale responsive width ladder. */
export const DEFAULT_IMAGE_WIDTHS: readonly number[] = [320, 480, 640, 768, 1024, 1280, 1536, 1920];

export interface ImageRequest {
  /** Candidate widths; defaults to DEFAULT_IMAGE_WIDTHS. Filtered to never exceed the intrinsic width. */
  widths?: readonly number[];
  /** <img sizes> hint; defaults to "100vw". */
  sizes?: string;
  /** Numeric quality OR a preset; resolved to a number for the provider. */
  quality?: number | ImageQualityPreset;
  /** Output format; defaults to "webp". */
  format?: ImageFormat;
}

export interface ImageSources {
  /** Fallback src (largest candidate). */
  src: string;
  /** Responsive srcset (`url 320w, url 640w, ...`); omitted when a single candidate. */
  srcset?: string;
  /** <img sizes>. */
  sizes?: string;
  /**
   * Width of the fallback `src` variant in CSS pixels.
   * Set by providers that select a specific variant (e.g. build-portable).
   * When present, <ResponsiveImage> uses this instead of the intrinsic ImageMetadata width.
   */
  width?: number;
  /**
   * Height of the fallback `src` variant in CSS pixels.
   * Derived from the selected variant width + original aspect ratio.
   */
  height?: number;
}

/** The Image Provider Port. Every optimization backend implements this single interface. */
export interface ImageProvider {
  readonly id: "cloudflare-runtime" | "cms-native" | "build-portable";
  buildSources(descriptor: ImageDescriptor, request?: ImageRequest): ImageSources;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Resolve a preset or numeric quality to a Cloudflare-valid integer (1..100). */
export function resolveImageQuality(quality?: number | ImageQualityPreset): number {
  if (typeof quality === "number") return clamp(Math.round(quality), 1, 100);
  if (quality && quality in IMAGE_QUALITY_PRESETS) return IMAGE_QUALITY_PRESETS[quality];
  return IMAGE_QUALITY_PRESETS.high;
}

/** Build a sorted, de-duplicated, no-upscale candidate width list. */
export function candidateWidths(
  intrinsic?: number,
  widths: readonly number[] = DEFAULT_IMAGE_WIDTHS,
): number[] {
  const base = widths.filter((w) => !intrinsic || w < intrinsic);
  const set = new Set(base);
  if (intrinsic && intrinsic > 0) set.add(intrinsic);
  const sorted = [...set].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted : intrinsic ? [intrinsic] : [...widths];
}

function isAbsoluteUrl(src: string): boolean {
  return /^https?:\/\//i.test(src) || src.startsWith("data:");
}

/**
 * cloudflare-runtime provider (RFC-0152 default).
 * When Cloudflare Image Transformations are enabled (PUBLIC_CF_IMAGE_TRANSFORM=on),
 * emits /cdn-cgi/image/<opts>/<origin> URLs resolved at request time by Cloudflare —
 * a responsive srcset for in-repo assets and remote CMS URLs. `onerror=redirect` only
 * helps when the feature IS enabled but a specific transform errors; it does NOT save a
 * zone where the feature is OFF (those URLs 404). Hence the safe passthrough default.
 */
/**
 * Whether to emit /cdn-cgi/image transform URLs (baked at build time).
 *
 * IMPORTANT: /cdn-cgi/image only works when Cloudflare Image Transformations are
 * ENABLED on the zone. When the feature is OFF, those URLs return 404 with NO
 * `onerror` fallback — so emitting them unconditionally breaks every image on a
 * zone that has not enabled the feature. Therefore the safe default is OFF: serve
 * the raw origin asset (always 200, no resize, no srcset). Opt in per app by
 * setting `PUBLIC_CF_IMAGE_TRANSFORM=on` once Transformations are enabled on the
 * zone — then the provider emits the responsive /cdn-cgi/image srcset.
 */
function cloudflareTransformEnabled(): boolean {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    return env?.PUBLIC_CF_IMAGE_TRANSFORM === "on";
  } catch {
    return false;
  }
}

export const cloudflareRuntimeProvider: ImageProvider = {
  id: "cloudflare-runtime",
  buildSources(descriptor, request = {}) {
    // data: URLs cannot be resized — pass straight through.
    if (descriptor.src.startsWith("data:")) {
      return { src: descriptor.src };
    }
    // Safe default: until Cloudflare Image Transformations are enabled on the zone
    // (PUBLIC_CF_IMAGE_TRANSFORM=on), serve the raw origin asset — it always deploys
    // to dist/client/_astro and is served 200. No /cdn-cgi/image, no srcset, no resize.
    if (!cloudflareTransformEnabled()) {
      return { src: descriptor.src };
    }
    const quality = resolveImageQuality(request.quality);
    const format: ImageFormat = request.format ?? "webp";
    const origin = isAbsoluteUrl(descriptor.src)
      ? descriptor.src
      : descriptor.src.replace(/^\//, "");

    const url = (w: number): string => {
      const opts = `onerror=redirect,width=${w},quality=${quality},format=${format}`;
      return `/cdn-cgi/image/${opts}/${origin}`;
    };

    const widths = candidateWidths(descriptor.width, request.widths);
    const largest = widths[widths.length - 1] ?? descriptor.width ?? 1280;
    const srcset = widths.length > 1 ? widths.map((w) => `${url(w)} ${w}w`).join(", ") : undefined;

    return {
      src: url(largest),
      srcset,
      sizes: srcset ? (request.sizes ?? "100vw") : undefined,
    };
  },
};

let activeProvider: ImageProvider = cloudflareRuntimeProvider;

/** Return the active default image provider. */
export function getDefaultImageProvider(): ImageProvider {
  return activeProvider;
}

/** Override the active default image provider (app/deploy-target wiring, tests). */
export function setDefaultImageProvider(provider: ImageProvider): void {
  activeProvider = provider;
}

/** Convenience: build sources via the active default provider. */
export function buildImageSources(
  descriptor: ImageDescriptor,
  request?: ImageRequest,
): ImageSources {
  return activeProvider.buildSources(descriptor, request);
}

// ---------------------------------------------------------------------------
// RFC-0204: build-portable provider — pre-generated responsive variants.
// ---------------------------------------------------------------------------

/** A single pre-generated width variant for one source image. */
export interface ImageVariant {
  /** CSS pixel width of this variant. */
  width: number;
  /** Root-relative URL served from public/_img/<hash>/<width>.webp (always deployed). */
  url: string;
}

/** Manifest entry for one source image origin. */
export interface ImageVariantEntry {
  /**
   * Origin src key — matches the exact `descriptor.src` value emitted by resolveImage
   * (e.g. "/_astro/katrin-hennings.<hash>.webp"). Used as the lookup key.
   */
  origin: string;
  /** Intrinsic width of the source, when known. */
  intrinsicWidth?: number;
  /** Intrinsic height of the source, when known. */
  intrinsicHeight?: number;
  /** Pre-generated variants sorted ascending by width, never exceeding intrinsicWidth. */
  variants: ImageVariant[];
  /**
   * SHA-256 hex digest of the source file bytes at generation time.
   * Used by `image.variants.generate` to detect source changes and invalidate
   * stale derived variants (same contract as video.variants.generate RFC-0210).
   */
  sourceHash?: string;
}

/** Top-level manifest written by `image.variants.generate` and read by createBuildPortableProvider. */
export interface ImageVariantManifest {
  version: 1;
  /** Map from origin src → entry (stable content-path key, e.g. /src/content/business-profile/de/assets/portrait.webp). */
  byOrigin: Record<string, ImageVariantEntry>;
  /**
   * Secondary lookup: maps the bare image basename (no hash, no ext) to the entry origin key.
   * Allows the provider to resolve Astro-hashed descriptor.src values like
   * "/_astro/katrin-hennings.BIwCI837.webp" → entry via "katrin-hennings".
   */
  byBasename: Record<string, string>;
}

/**
 * Extract the bare basename (no hash suffix, no extension) from an Astro-hashed URL.
 * "/_astro/katrin-hennings.CrtmuSkJ.webp" → "katrin-hennings"
 * "/src/content/business-profile/de/assets/katrin-hennings.webp" → "katrin-hennings"
 *
 * Vite/Rollup content hashes use base64url characters (a-z A-Z 0-9 - _), not pure hex.
 * The hash is always exactly 8 characters before the final extension.
 */
function extractBasename(src: string): string {
  const filename = src.split("/").pop() ?? "";
  // Strip extension
  const noExt = filename.replace(/\.[a-z0-9]+$/i, "");
  // Strip Vite/Rollup hash suffix: ".<8-char alphanumeric-dash-underscore>"
  return noExt.replace(/\.[a-zA-Z0-9_-]{8}$/, "");
}

/**
 * RFC-0204: build-portable provider factory.
 *
 * Reads a pre-generated `ImageVariantManifest` (produced by `image.variants.generate`)
 * and emits a responsive `srcset` from static width-variant URLs. Falls back to
 * `{ src: descriptor.src }` for images not in the manifest (SVG, data:, unmanaged).
 *
 * Lookup strategy: primary by exact `byOrigin` key (content-relative path);
 * fallback by `byBasename` to handle Astro-hashed `/_astro/<name>.<hash>.webp` URLs.
 *
 * IMPORTANT: synchronous — do NOT import Astro `astro:assets` / `<Image>` / `getImage`.
 */
export function createBuildPortableProvider(manifest: ImageVariantManifest): ImageProvider {
  return {
    id: "build-portable",
    buildSources(descriptor, request = {}) {
      if (!descriptor.src || descriptor.src.startsWith("data:")) {
        return { src: descriptor.src };
      }

      // Primary: exact origin key match (e.g. /src/content/.../portrait.webp)
      let entry = manifest.byOrigin[descriptor.src];

      // Secondary: match by stripped basename for Astro-hashed URLs (/_astro/<name>.<hash>.webp)
      if (!entry && manifest.byBasename) {
        const basename = extractBasename(descriptor.src);
        const originKey = manifest.byBasename[basename];
        if (originKey) entry = manifest.byOrigin[originKey];
      }

      if (!entry || entry.variants.length === 0) {
        return { src: descriptor.src };
      }

      const widths = candidateWidths(entry.intrinsicWidth, request.widths);
      const available = entry.variants.filter((v) => widths.includes(v.width));
      const sorted = available.length > 0 ? available : entry.variants;

      const largest = sorted[sorted.length - 1];
      if (!largest) return { src: descriptor.src };

      const srcset =
        sorted.length > 1 ? sorted.map((v) => `${v.url} ${v.width}w`).join(", ") : undefined;

      // Derive variant height from the original aspect ratio
      const aspectRatio =
        entry.intrinsicWidth && entry.intrinsicHeight
          ? entry.intrinsicHeight / entry.intrinsicWidth
          : undefined;
      const variantHeight =
        aspectRatio !== undefined ? Math.round(largest.width * aspectRatio) : undefined;

      return {
        src: largest.url,
        srcset,
        sizes: srcset ? (request.sizes ?? "100vw") : undefined,
        width: largest.width,
        height: variantHeight,
      };
    },
  };
}
