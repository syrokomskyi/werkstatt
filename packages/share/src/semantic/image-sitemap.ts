/*
<MODULE_CONTRACT>
<purpose>RFC-0172: pure harvester + formatter for the post-build image sitemap. Reads
rendered HTML (supplied by the caller) and extracts the page's single lead/content image,
then formats a Google image sitemap. Framework-agnostic — the site-OS dist.sitemap.images.generate
command walks dist/client and writes the result; this module touches no filesystem.</purpose>
<non-goals>
  <item>Do not read files or fetch HTML — the caller supplies the HTML string.</item>
  <item>Do not construct /_astro or /cdn-cgi/image URLs — only read what the render emitted (RFC-0152).</item>
  <item>Do not apply policy/severity — the command decides pass/fail from the harvest result.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0172: initial implementation.</item>
</CHANGE_SUMMARY>
*/

/** One resolved image entry harvested from rendered HTML. */
export interface SitemapImageEntry {
  /** Absolute page URL (canonical, from the document). */
  loc: string;
  /** Absolute image URL; provider-emitted (/_astro/<hash> or /cdn-cgi/image/...). */
  imageUrl: string;
  /** From the `<img alt>` / `og:image:alt`, when present. */
  title?: string;
}

/** Result of harvesting one rendered HTML document. */
export interface ContentImageHarvest {
  /** Canonical absolute page URL, or null when no canonical link is present. */
  loc: string | null;
  /** All distinct content-image signals found, absolutized. >1 is a uniqueness violation. */
  imageUrls: string[];
  /** Best-effort image title (alt text), when discoverable. */
  title?: string;
}

/**
 * True when the HTML is a meta-refresh redirect stub (no real content) — e.g. the
 * RFC-0160 prefixed-default-language `/de/…` → `/…` stubs.
 *
 * Note: we deliberately do NOT treat `window.location` as a stub signal. Full
 * content pages (the root home, RFC-0159) carry a *soft* client-side language
 * redirect for non-default browser locales while still serving complete HTML;
 * those must be harvested, not skipped.
 */
export function isHtmlRedirectPage(html: string): boolean {
  return /<meta[^>]+http-equiv=["']refresh["']/i.test(html);
}

/** RFC-0150 preview screenshots and the og-image fallback are NOT content images. */
export function isSyntheticPreviewUrl(url: string): boolean {
  return /\/preview\/[^"']*\.png(\?|$)/i.test(url) || /\/og-image\.png(\?|$)/i.test(url);
}

function extractCanonical(html: string, siteUrl: string): string | null {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  if (!m?.[1]) return null;
  return absolutize(m[1], siteUrl);
}

/** Absolutize a possibly-relative URL against the site origin. Returns null if unresolvable. */
function absolutize(url: string, siteUrl: string): string | null {
  try {
    return new URL(url, ensureTrailingSlash(siteUrl)).toString();
  } catch {
    return null;
  }
}

function ensureTrailingSlash(origin: string): string {
  return origin.endsWith("/") ? origin : `${origin}/`;
}

/** Pull the value of a single attribute from an HTML tag string. */
function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`${name}=["']([^"']*)["']`, "i"));
  return m?.[1];
}

/**
 * Harvest the page's content image(s) from one rendered HTML document.
 *
 * Two signal sources, unified (RFC-0172):
 *   1. `<img ... data-content-image ...>` — render-resolved hero `leadImage` (hashed URL).
 *   2. `<meta name="x-content-image" content="...">` — authored `output.image` (absolute).
 *
 * Returns every distinct, absolutized URL found so the caller can enforce the
 * one-per-page contract. Synthetic preview/og-image URLs are excluded here.
 */
export function harvestContentImage(html: string, siteUrl: string): ContentImageHarvest {
  const loc = extractCanonical(html, siteUrl);
  const urls = new Set<string>();
  let title: string | undefined;

  // 1. <img data-content-image>
  const imgRe = /<img\b[^>]*\bdata-content-image\b[^>]*>/gi;
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(html)) !== null) {
    const tag = im[0];
    const src = attr(tag, "src");
    if (!src) continue;
    const abs = absolutize(src, siteUrl);
    if (!abs || isSyntheticPreviewUrl(abs)) continue;
    urls.add(abs);
    if (!title) title = attr(tag, "alt") || undefined;
  }

  // 2. <meta name="x-content-image" content="...">
  const metaRe = /<meta[^>]+name=["']x-content-image["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  let mm: RegExpExecArray | null;
  while ((mm = metaRe.exec(html)) !== null) {
    const abs = absolutize(mm[1], siteUrl);
    if (!abs || isSyntheticPreviewUrl(abs)) continue;
    urls.add(abs);
  }

  // Fallback title from og:image:alt when an <img> alt was unavailable.
  if (!title) {
    const altMeta = html.match(
      /<meta[^>]+property=["']og:image:alt["'][^>]*content=["']([^"']+)["']/i,
    );
    if (altMeta?.[1]) title = altMeta[1];
  }

  return { loc, imageUrls: [...urls], ...(title ? { title } : {}) };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render the image sitemap XML. Each entry becomes one `<url>` with an
 * `<image:image>` child. An empty entry list yields a valid empty urlset.
 * The caller is responsible for prepending the GENERATED marker if desired.
 */
export function generateImageSitemapXml(entries: SitemapImageEntry[]): string {
  const urls = entries
    .map((e) => {
      const titleXml = e.title ? `\n      <image:title>${escapeXml(e.title)}</image:title>` : "";
      return `  <url>\n    <loc>${escapeXml(e.loc)}</loc>\n    <image:image>\n      <image:loc>${escapeXml(
        e.imageUrl,
      )}</image:loc>${titleXml}\n    </image:image>\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset\n  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"\n>\n${urls}\n</urlset>`;
}
