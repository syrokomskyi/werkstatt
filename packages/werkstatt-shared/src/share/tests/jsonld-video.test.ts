import { describe, it, expect } from "vitest";
import { buildVideoObjectNodes } from "../semantic/jsonld/video.ts";
import { createJsonLdContext } from "../semantic/jsonld/context.ts";
import type { SemanticPageModel, VideoSeoData } from "../semantic/models.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0912: Tests for buildVideoObjectNodes — the JSON-LD builder that emits
    VideoObject nodes from SemanticBlock.video data on opted-in content video blocks.
  </purpose>
</MODULE_CONTRACT>
*/

function makeMinimalPage(overrides: Partial<SemanticPageModel> = {}): SemanticPageModel {
  return {
    url: "https://example.com/uk/demo",
    type: "article",
    lang: "uk",
    title: "Demo Page",
    description: "A demo page",
    blocks: [],
    organization: { name: "Test Org", description: "Test", url: "https://example.com" },
    ...overrides,
  } as unknown as SemanticPageModel;
}

const sampleVideoSeo: VideoSeoData = {
  seo: {
    name: "Demo Video",
    description: "A demonstration of the platform",
    uploadDate: "2026-01-15T00:00:00Z",
  },
  manifest: {
    posterUrl: "https://example.com/_video/uk/demo/poster.webp",
    contentUrl: "https://example.com/_video/uk/demo/progressive.h264.mp4",
    durationSec: 120,
  },
};

describe("buildVideoObjectNodes", () => {
  it("returns empty array when no blocks have video data", () => {
    const page = makeMinimalPage({
      blocks: [{ id: "block-1", heading: "Intro" }],
    });
    const ctx = createJsonLdContext(page);
    const nodes = buildVideoObjectNodes(ctx);
    expect(nodes).toHaveLength(0);
  });

  it("emits a VideoObject node for a block with video data", () => {
    const page = makeMinimalPage({
      blocks: [{ id: "video-section", heading: "Demo", video: sampleVideoSeo }],
    });
    const ctx = createJsonLdContext(page);
    const nodes = buildVideoObjectNodes(ctx);

    expect(nodes).toHaveLength(1);
    const node = nodes[0]!;
    expect(node["@type"]).toBe("VideoObject");
    expect(node.name).toBe("Demo Video");
    expect(node.description).toBe("A demonstration of the platform");
    expect(node.uploadDate).toBe("2026-01-15T00:00:00Z");
    expect(node.thumbnailUrl).toBe("https://example.com/_video/uk/demo/poster.webp");
    expect(node.contentUrl).toBe("https://example.com/_video/uk/demo/progressive.h264.mp4");
  });

  it("includes ISO 8601 duration when durationSec is present", () => {
    const page = makeMinimalPage({
      blocks: [{ id: "v1", heading: "Demo", video: sampleVideoSeo }],
    });
    const ctx = createJsonLdContext(page);
    const nodes = buildVideoObjectNodes(ctx);

    expect(nodes[0]!.duration).toBe("PT2M0S");
  });

  it("omits duration when durationSec is absent", () => {
    const videoWithoutDuration: VideoSeoData = {
      seo: sampleVideoSeo.seo,
      manifest: {
        posterUrl: sampleVideoSeo.manifest.posterUrl,
        contentUrl: sampleVideoSeo.manifest.contentUrl,
      },
    };
    const page = makeMinimalPage({
      blocks: [{ id: "v1", heading: "Demo", video: videoWithoutDuration }],
    });
    const ctx = createJsonLdContext(page);
    const nodes = buildVideoObjectNodes(ctx);

    expect(nodes[0]!.duration).toBeUndefined();
  });

  it("emits multiple nodes for multiple video blocks", () => {
    const page = makeMinimalPage({
      blocks: [
        { id: "v1", heading: "Demo 1", video: sampleVideoSeo },
        {
          id: "v2",
          heading: "Demo 2",
          video: {
            seo: { name: "Second", description: "Second video", uploadDate: "2026-02-01" },
            manifest: {
              posterUrl: "https://example.com/_video/uk/demo2/poster.webp",
              contentUrl: "https://example.com/_video/uk/demo2/progressive.h264.mp4",
              durationSec: 3661,
            },
          },
        },
      ],
    });
    const ctx = createJsonLdContext(page);
    const nodes = buildVideoObjectNodes(ctx);

    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.name).toBe("Demo Video");
    expect(nodes[1]!.name).toBe("Second");
    expect(nodes[1]!.duration).toBe("PT1H1M1S");
  });

  it("generates unique @id per video block", () => {
    const page = makeMinimalPage({
      blocks: [
        { id: "v1", heading: "Demo 1", video: sampleVideoSeo },
        {
          id: "v2",
          heading: "Demo 2",
          video: {
            ...sampleVideoSeo,
            seo: { name: "Second", description: "d", uploadDate: "2026-02-01" },
          },
        },
      ],
    });
    const ctx = createJsonLdContext(page);
    const nodes = buildVideoObjectNodes(ctx);

    expect(nodes[0]!["@id"]).not.toBe(nodes[1]!["@id"]);
    expect(nodes[0]!["@id"]).toContain("v1");
    expect(nodes[1]!["@id"]).toContain("v2");
  });
});
