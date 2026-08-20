/*
<MODULE_CONTRACT>
<purpose>Unit tests for RFC-0890 — verifies rawArtifact sub-object and optional display fields on PbpWebsiteScreenshot schema.</purpose>
<non-goals>
  <item>Does not test command handler logic — validates schema only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0890: established unit test coverage for rawArtifact and optional display fields.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { evidenceSourceSchema } from "../evidence-source.js";

function makeValidBase() {
  return {
    schema: "pbp/evidence-source@1",
    id: "evidence-001",
    type: "evidence-source",
    name: "Test Evidence",
    kind: "client-statement",
    authority: { kind: "operator" },
    slug: "test-evidence",
    status: "published" as const,
    display: {
      document: "visible" as const,
      screenshot: "visible" as const,
      websiteLink: "visible" as const,
    },
  };
}

const validRawArtifact = {
  sha256: "a".repeat(64),
  mediaType: "image/png",
  originalFilename: "CaptureX_2026-08-20_134440_example.com.png",
  width: 3708,
  height: 27210,
};

describe("RFC-0890: PbpWebsiteScreenshot rawArtifact", () => {
  it("accepts websiteScreenshot with only rawArtifact (no display fields)", () => {
    const data = {
      ...makeValidBase(),
      websiteScreenshot: {
        rawArtifact: validRawArtifact,
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.websiteScreenshot?.rawArtifact?.sha256).toBe("a".repeat(64));
      expect(result.data.websiteScreenshot?.sha256).toBeUndefined();
    }
  });

  it("accepts websiteScreenshot with display fields + rawArtifact", () => {
    const data = {
      ...makeValidBase(),
      websiteScreenshot: {
        sha256: "b".repeat(64),
        mediaType: "image/png",
        storage: "public" as const,
        url: "https://example.com/screenshot.png",
        rawArtifact: validRawArtifact,
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.websiteScreenshot?.sha256).toBe("b".repeat(64));
      expect(result.data.websiteScreenshot?.rawArtifact?.sha256).toBe("a".repeat(64));
    }
  });

  it("accepts websiteScreenshot with only display fields (backward compat)", () => {
    const data = {
      ...makeValidBase(),
      websiteScreenshot: {
        sha256: "b".repeat(64),
        mediaType: "image/png",
        storage: "public" as const,
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects websiteScreenshot with neither display fields nor rawArtifact", () => {
    const data = {
      ...makeValidBase(),
      websiteScreenshot: {
        url: "https://example.com/screenshot.png",
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("accepts rawArtifact with all required fields", () => {
    const data = {
      ...makeValidBase(),
      websiteScreenshot: {
        rawArtifact: {
          ...validRawArtifact,
          r2Key: "warpgogol-com/screenshots/test-evidence/raw/CaptureX_2026-08-20_134440_example.com.png",
          localPath: "trust/evidence/screenshots/test-evidence/raw/CaptureX_2026-08-20_134440_example.com.png",
          capturedAt: "2026-08-20T13:44:40Z",
        },
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects rawArtifact with invalid SHA-256", () => {
    const data = {
      ...makeValidBase(),
      websiteScreenshot: {
        rawArtifact: {
          ...validRawArtifact,
          sha256: "not-a-hash",
        },
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects rawArtifact with non-positive width", () => {
    const data = {
      ...makeValidBase(),
      websiteScreenshot: {
        rawArtifact: {
          ...validRawArtifact,
          width: 0,
        },
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects rawArtifact with non-positive height", () => {
    const data = {
      ...makeValidBase(),
      websiteScreenshot: {
        rawArtifact: {
          ...validRawArtifact,
          height: -1,
        },
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
