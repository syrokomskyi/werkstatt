import { describe, it, expect } from "vitest";
import {
  generateVideoSitemapXml,
  type VideoSitemapEntry,
} from "../sitemap-helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0912: Tests for generateVideoSitemapXml — the pure function that emits
    sitemap-video.xml from opted-in video entries. Validates XML structure,
    namespace declarations, field escaping, duration handling, and empty urlset.
  </purpose>
</MODULE_CONTRACT>
*/

describe("generateVideoSitemapXml", () => {
  it("emits a valid empty urlset when no entries", () => {
    const xml = generateVideoSitemapXml([]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<urlset");
    expect(xml).toContain('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"');
    expect(xml).not.toContain("<url>");
  });

  it("emits a video entry with all required fields", () => {
    const entries: VideoSitemapEntry[] = [
      {
        pageUrl: "https://example.com/uk/demo",
        thumbnailLoc: "https://example.com/_video/uk/demo/poster.webp",
        title: "Demo Video",
        description: "A demonstration of the platform",
        contentLoc: "https://example.com/_video/uk/demo/progressive.h264.mp4",
        duration: 120,
        publicationDate: "2026-01-15",
      },
    ];

    const xml = generateVideoSitemapXml(entries);

    expect(xml).toContain("<url>");
    expect(xml).toContain("<loc>https://example.com/uk/demo</loc>");
    expect(xml).toContain("<video:video>");
    expect(xml).toContain("<video:thumbnail_loc>https://example.com/_video/uk/demo/poster.webp</video:thumbnail_loc>");
    expect(xml).toContain("<video:title>Demo Video</video:title>");
    expect(xml).toContain("<video:description>A demonstration of the platform</video:description>");
    expect(xml).toContain("<video:content_loc>https://example.com/_video/uk/demo/progressive.h264.mp4</video:content_loc>");
    expect(xml).toContain("<video:duration>120</video:duration>");
    expect(xml).toContain("<video:publication_date>2026-01-15</video:publication_date>");
  });

  it("omits duration when not provided", () => {
    const entries: VideoSitemapEntry[] = [
      {
        pageUrl: "https://example.com/uk/demo",
        thumbnailLoc: "https://example.com/_video/uk/demo/poster.webp",
        title: "Demo Video",
        description: "A demonstration",
        contentLoc: "https://example.com/_video/uk/demo/progressive.h264.mp4",
        publicationDate: "2026-01-15",
      },
    ];

    const xml = generateVideoSitemapXml(entries);

    expect(xml).not.toContain("<video:duration>");
  });

  it("escapes special XML characters in fields", () => {
    const entries: VideoSitemapEntry[] = [
      {
        pageUrl: "https://example.com/uk/demo?a=1&b=2",
        thumbnailLoc: "https://example.com/_video/uk/demo/poster.webp",
        title: "Demo <Video> & Friends",
        description: "A & B < C",
        contentLoc: "https://example.com/_video/uk/demo/progressive.h264.mp4",
        publicationDate: "2026-01-15",
      },
    ];

    const xml = generateVideoSitemapXml(entries);

    expect(xml).toContain("a=1&amp;b=2");
    expect(xml).toContain("Demo &lt;Video&gt; &amp; Friends");
    expect(xml).toContain("A &amp; B &lt; C");
    expect(xml).not.toContain("a=1&b=2");
  });

  it("emits multiple entries", () => {
    const entries: VideoSitemapEntry[] = [
      {
        pageUrl: "https://example.com/uk/demo1",
        thumbnailLoc: "https://example.com/_video/uk/demo1/poster.webp",
        title: "Demo 1",
        description: "First demo",
        contentLoc: "https://example.com/_video/uk/demo1/progressive.h264.mp4",
        publicationDate: "2026-01-15",
      },
      {
        pageUrl: "https://example.com/uk/demo2",
        thumbnailLoc: "https://example.com/_video/uk/demo2/poster.webp",
        title: "Demo 2",
        description: "Second demo",
        contentLoc: "https://example.com/_video/uk/demo2/progressive.h264.mp4",
        publicationDate: "2026-02-01",
      },
    ];

    const xml = generateVideoSitemapXml(entries);

    const urlCount = (xml.match(/<url>/g) || []).length;
    expect(urlCount).toBe(2);
    expect(xml).toContain("Demo 1");
    expect(xml).toContain("Demo 2");
  });
});
