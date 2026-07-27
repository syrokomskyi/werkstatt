import { test, expect } from "vitest";
import {
  harvestContentImage,
  generateImageSitemapXml,
  isHtmlRedirectPage,
  isSyntheticPreviewUrl,
  type SitemapImageEntry,
} from "../semantic/image-sitemap.ts";

const SITE = "https://example.org";

test("harvests a hero data-content-image and absolutizes the /_astro src", () => {
  const html = `
    <link rel="canonical" href="https://example.org/de/about">
    <img src="/_astro/hero-1.BEybXadf.webp" alt="A photo" class="hero__portrait-image" data-content-image>
  `;
  const r = harvestContentImage(html, SITE);
  expect(r.loc).toBe("https://example.org/de/about");
  expect(r.imageUrls).toEqual(["https://example.org/_astro/hero-1.BEybXadf.webp"]);
  expect(r.title).toBe("A photo");
});

test("harvests the authored x-content-image head signal", () => {
  const html = `
    <link rel="canonical" href="https://example.org/">
    <meta name="x-content-image" content="https://cdn.example.org/lead.webp">
    <meta property="og:image:alt" content="Lead alt">
  `;
  const r = harvestContentImage(html, SITE);
  expect(r.imageUrls).toEqual(["https://cdn.example.org/lead.webp"]);
  expect(r.title).toBe("Lead alt");
});

test("excludes RFC-0150 preview screenshots and og-image fallbacks", () => {
  expect(isSyntheticPreviewUrl("https://example.org/preview/de/home.png")).toBe(true);
  expect(isSyntheticPreviewUrl("https://example.org/og-image.png")).toBe(true);
  expect(isSyntheticPreviewUrl("https://example.org/_astro/hero.abc.webp")).toBe(false);

  const html = `
    <link rel="canonical" href="https://example.org/">
    <meta name="x-content-image" content="/preview/de/home.png">
    <img src="/og-image.png" data-content-image>
  `;
  const r = harvestContentImage(html, SITE);
  expect(r.imageUrls).toEqual([]);
});

test("reports multiple distinct content images (uniqueness violation surface)", () => {
  const html = `
    <link rel="canonical" href="https://example.org/x">
    <img src="/_astro/a.1.webp" data-content-image>
    <meta name="x-content-image" content="https://cdn.example.org/b.webp">
  `;
  const r = harvestContentImage(html, SITE);
  expect(r.imageUrls.length).toBe(2);
});

test("deduplicates the same image referenced twice", () => {
  const html = `
    <link rel="canonical" href="https://example.org/x">
    <img src="/_astro/a.1.webp" data-content-image>
    <meta name="x-content-image" content="/_astro/a.1.webp">
  `;
  const r = harvestContentImage(html, SITE);
  expect(r.imageUrls).toEqual(["https://example.org/_astro/a.1.webp"]);
});

test("returns null loc when no canonical link present", () => {
  const r = harvestContentImage(`<img src="/_astro/a.webp" data-content-image>`, SITE);
  expect(r.loc).toBe(null);
});

test("detects meta-refresh stubs but not soft window.location redirects on content pages", () => {
  expect(isHtmlRedirectPage(`<meta http-equiv="refresh" content="0; url=/de/">`)).toBe(true);
  // Full content pages carry a soft language redirect (RFC-0159) — NOT a stub.
  expect(
    isHtmlRedirectPage(`<main>real content</main><script>window.location.href="/en/"</script>`),
  ).toBe(false);
  expect(isHtmlRedirectPage(`<main>real content</main>`)).toBe(false);
});

test("formats a valid image sitemap with escaping", () => {
  const entries: SitemapImageEntry[] = [
    {
      loc: "https://example.org/a?x=1&y=2",
      imageUrl: "https://example.org/_astro/a.webp",
      title: "T & <b>",
    },
  ];
  const xml = generateImageSitemapXml(entries);
  expect(xml).toMatch(/xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  expect(xml).toMatch(/<image:loc>https:\/\/example\.org\/_astro\/a\.webp<\/image:loc>/);
  expect(xml).toMatch(/<loc>https:\/\/example\.org\/a\?x=1&amp;y=2<\/loc>/);
  expect(xml).toMatch(/<image:title>T &amp; &lt;b&gt;<\/image:title>/);
});

test("empty entries still yields a valid urlset", () => {
  const xml = generateImageSitemapXml([]);
  expect(xml).toMatch(/<urlset/);
  expect(xml).toMatch(/<\/urlset>/);
});
