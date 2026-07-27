import { describe, it, expect } from "vitest";
import {
  clusterAlternates,
  groupClustersByCategory,
  generateSitemapIndex,
  generateSitemapXml,
  parseSitemapXml,
  parseSitemapIndex,
  validateSitemapFile,
  type PageCluster,
} from "../sitemap-helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Tests for the pure sitemap helper functions: cluster alternates,
    category grouping, XML generation, XML parsing, and validation logic.
    These are the single source of truth shared by sitemap.generate
    and sitemap.validate — drift between them causes build failures.
  </purpose>
</MODULE_CONTRACT>
*/

function makeCluster(
  pageId: string,
  locales: Array<{ lang: string; path: string; url: string }>,
): PageCluster {
  return { pageId, locales };
}

describe("clusterAlternates", () => {
  it("returns locale entries plus x-default for default language", () => {
    const cluster = makeCluster("home", [
      { lang: "de", path: "/", url: "https://example.com/" },
      { lang: "en", path: "/en/", url: "https://example.com/en/" },
    ]);

    const result = clusterAlternates(cluster, "de");

    expect(result).toEqual([
      { lang: "de", href: "https://example.com/" },
      { lang: "en", href: "https://example.com/en/" },
      { lang: "x-default", href: "https://example.com/" },
    ]);
  });

  it("omits x-default when default language locale is absent", () => {
    const cluster = makeCluster("home", [
      { lang: "en", path: "/en/", url: "https://example.com/en/" },
    ]);

    const result = clusterAlternates(cluster, "de");

    expect(result).toEqual([{ lang: "en", href: "https://example.com/en/" }]);
  });

  it("handles single-language cluster", () => {
    const cluster = makeCluster("about", [
      { lang: "de", path: "/about/", url: "https://example.com/about/" },
    ]);

    const result = clusterAlternates(cluster, "de");

    expect(result).toEqual([
      { lang: "de", href: "https://example.com/about/" },
      { lang: "x-default", href: "https://example.com/about/" },
    ]);
  });
});

describe("groupClustersByCategory", () => {
  it("groups clusters by category, defaults to content", () => {
    const clusters = [
      makeCluster("home", [{ lang: "de", path: "/", url: "https://example.com/" }]),
      makeCluster("about", [{ lang: "de", path: "/about/", url: "https://example.com/about/" }]),
    ];
    const categoryMap = new Map([
      ["home", "root"],
      ["about", "content"],
    ]);

    const result = groupClustersByCategory(clusters, categoryMap);

    expect(result.get("root")).toHaveLength(1);
    expect(result.get("root")![0].pageId).toBe("home");
    expect(result.get("content")).toHaveLength(1);
    expect(result.get("content")![0].pageId).toBe("about");
  });

  it("defaults unknown categories to content", () => {
    const clusters = [makeCluster("unknown", [])];
    const categoryMap = new Map<string, string>();

    const result = groupClustersByCategory(clusters, categoryMap);

    expect(result.get("content")).toHaveLength(1);
  });

  it("handles empty cluster list", () => {
    const result = groupClustersByCategory([], new Map());
    expect(result.size).toBe(0);
  });
});

describe("generateSitemapIndex", () => {
  it("generates valid sitemap index XML", () => {
    const xml = generateSitemapIndex("https://example.com", ["sitemap-0.xml", "sitemap-1.xml"]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("https://example.com/sitemap-0.xml");
    expect(xml).toContain("https://example.com/sitemap-1.xml");
  });

  it("escapes special XML characters in URLs", () => {
    const xml = generateSitemapIndex("https://example.com", ["file&data.xml"]);
    expect(xml).toContain("file&amp;data.xml");
    expect(xml).not.toContain("file&data.xml");
  });

  it("handles empty filename list", () => {
    const xml = generateSitemapIndex("https://example.com", []);
    expect(xml).toContain("<sitemapindex");
    expect(xml).not.toContain("<sitemap>");
  });
});

describe("generateSitemapXml", () => {
  it("generates urlset with loc and hreflang alternates", () => {
    const clusters = [
      makeCluster("home", [
        { lang: "de", path: "/", url: "https://example.com/" },
        { lang: "en", path: "/en/", url: "https://example.com/en/" },
      ]),
    ];

    const xml = generateSitemapXml(clusters, "de");

    expect(xml).toContain("<urlset");
    expect(xml).toContain("https://example.com/");
    expect(xml).toContain("https://example.com/en/");
    expect(xml).toContain('hreflang="de"');
    expect(xml).toContain('hreflang="en"');
    expect(xml).toContain('hreflang="x-default"');
  });

  it("includes lastmod when updateStamp is present", () => {
    const clusters = [
      {
        pageId: "home",
        locales: [{ lang: "de", path: "/", url: "https://example.com/" }],
        updateStamp: { stamp: { date: "2026-01-15" } } as never,
      },
    ];

    const xml = generateSitemapXml(clusters, "de");

    expect(xml).toContain("<lastmod>2026-01-15</lastmod>");
  });

  it("escapes special XML characters in URLs", () => {
    const clusters = [
      makeCluster("home", [{ lang: "de", path: "/", url: "https://example.com/?a=1&b=2" }]),
    ];

    const xml = generateSitemapXml(clusters, "de");

    expect(xml).toContain("a=1&amp;b=2");
  });
});

describe("parseSitemapXml", () => {
  it("extracts loc and hreflang entries from valid XML", () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://example.com/</loc>
    <xhtml:link rel="alternate" hreflang="de" href="https://example.com/" />
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/" />
  </url>
  <url>
    <loc>https://example.com/about/</loc>
    <xhtml:link rel="alternate" hreflang="de" href="https://example.com/about/" />
  </url>
</urlset>`;

    const entries = parseSitemapXml(xml);

    expect(entries).toHaveLength(2);
    expect(entries[0].loc).toBe("https://example.com/");
    expect(entries[0].hreflangs).toEqual([
      { lang: "de", href: "https://example.com/" },
      { lang: "en", href: "https://example.com/en/" },
    ]);
    expect(entries[1].loc).toBe("https://example.com/about/");
    expect(entries[1].hreflangs).toHaveLength(1);
  });

  it("returns empty array for XML without url elements", () => {
    const entries = parseSitemapXml('<?xml version="1.0"?><urlset></urlset>');
    expect(entries).toEqual([]);
  });

  it("handles url with no hreflang links", () => {
    const xml = `<urlset><url><loc>https://example.com/</loc></url></urlset>`;
    const entries = parseSitemapXml(xml);

    expect(entries).toHaveLength(1);
    expect(entries[0].hreflangs).toEqual([]);
  });
});

describe("parseSitemapIndex", () => {
  it("extracts filenames from sitemap index XML", () => {
    const xml = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-0.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
</sitemapindex>`;

    const filenames = parseSitemapIndex(xml, "https://example.com");

    expect(filenames).toEqual(["sitemap-0.xml", "sitemap-1.xml"]);
  });

  it("returns full URL when it does not start with baseUrl", () => {
    const xml = `<sitemapindex><sitemap><loc>https://other.com/sitemap.xml</loc></sitemap></sitemapindex>`;
    const filenames = parseSitemapIndex(xml, "https://example.com");

    expect(filenames).toEqual(["https://other.com/sitemap.xml"]);
  });

  it("returns empty array for XML without sitemap elements", () => {
    const filenames = parseSitemapIndex("<sitemapindex></sitemapindex>", "https://example.com");
    expect(filenames).toEqual([]);
  });
});

describe("validateSitemapFile", () => {
  const defaultLanguage = "de";
  const clusters = [
    makeCluster("home", [
      { lang: "de", path: "/", url: "https://example.com/" },
      { lang: "en", path: "/en/", url: "https://example.com/en/" },
    ]),
  ];

  it("returns no violations for a correct sitemap", () => {
    const parsed = [
      {
        loc: "https://example.com/",
        hreflangs: [
          { lang: "de", href: "https://example.com/" },
          { lang: "en", href: "https://example.com/en/" },
          { lang: "x-default", href: "https://example.com/" },
        ],
      },
      {
        loc: "https://example.com/en/",
        hreflangs: [
          { lang: "de", href: "https://example.com/" },
          { lang: "en", href: "https://example.com/en/" },
          { lang: "x-default", href: "https://example.com/" },
        ],
      },
    ];

    const violations = validateSitemapFile(parsed, clusters, "sitemap-0.xml", defaultLanguage);
    expect(violations).toEqual([]);
  });

  it("detects duplicate loc entries", () => {
    const parsed = [
      { loc: "https://example.com/", hreflangs: [] },
      { loc: "https://example.com/", hreflangs: [] },
    ];

    const violations = validateSitemapFile(parsed, clusters, "sitemap-0.xml", defaultLanguage);
    expect(violations.some((v) => v.includes("Duplicate"))).toBe(true);
  });

  it("detects unexpected URL not in route registry", () => {
    const parsed = [{ loc: "https://example.com/nonexistent/", hreflangs: [] }];

    const violations = validateSitemapFile(parsed, clusters, "sitemap-0.xml", defaultLanguage);
    expect(violations.some((v) => v.includes("Unexpected"))).toBe(true);
  });

  it("detects missing alternate link", () => {
    const parsed = [
      {
        loc: "https://example.com/",
        hreflangs: [{ lang: "de", href: "https://example.com/" }],
      },
    ];

    const violations = validateSitemapFile(parsed, clusters, "sitemap-0.xml", defaultLanguage);
    expect(violations.some((v) => v.includes("Missing alternate"))).toBe(true);
  });

  it("detects unexpected alternate link", () => {
    const parsed = [
      {
        loc: "https://example.com/",
        hreflangs: [
          { lang: "de", href: "https://example.com/" },
          { lang: "en", href: "https://example.com/en/" },
          { lang: "x-default", href: "https://example.com/" },
          { lang: "fr", href: "https://example.com/fr/" },
        ],
      },
    ];

    const violations = validateSitemapFile(parsed, clusters, "sitemap-0.xml", defaultLanguage);
    expect(violations.some((v) => v.includes("Unexpected alternate"))).toBe(true);
  });
});
