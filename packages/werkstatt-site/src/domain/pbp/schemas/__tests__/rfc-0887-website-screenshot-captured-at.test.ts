/*
<MODULE_CONTRACT>
<purpose>Unit tests for RFC-0887 — verifies capturedAt field on PbpWebsiteScreenshot schema and display-gated section logic.</purpose>
<non-goals>
  <item>Does not test .astro component rendering — validates schema and conditional logic only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0887: established unit test coverage for capturedAt field and display-gated section logic.</item>
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

describe("RFC-0887: PbpWebsiteScreenshot capturedAt field", () => {
  it("accepts websiteScreenshot with capturedAt", () => {
    const base = makeValidBase();
    const data = {
      ...base,
      websiteScreenshot: {
        sha256: "a".repeat(64),
        mediaType: "image/png",
        storage: "public" as const,
        url: "https://example.com/screenshot.png",
        capturedAt: "2026-08-20T10:00:00Z",
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.websiteScreenshot?.capturedAt).toBe("2026-08-20T10:00:00Z");
    }
  });

  it("accepts websiteScreenshot without capturedAt (optional field)", () => {
    const base = makeValidBase();
    const data = {
      ...base,
      websiteScreenshot: {
        sha256: "a".repeat(64),
        mediaType: "image/png",
        storage: "public" as const,
        url: "https://example.com/screenshot.png",
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.websiteScreenshot?.capturedAt).toBeUndefined();
    }
  });

  it("accepts websiteScreenshot with capturedAt but no url", () => {
    const base = makeValidBase();
    const data = {
      ...base,
      websiteScreenshot: {
        sha256: "a".repeat(64),
        mediaType: "image/png",
        storage: "private" as const,
        capturedAt: "2026-08-20T10:00:00Z",
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.websiteScreenshot?.capturedAt).toBe("2026-08-20T10:00:00Z");
    }
  });

  it("rejects empty string for capturedAt", () => {
    const base = makeValidBase();
    const data = {
      ...base,
      websiteScreenshot: {
        sha256: "a".repeat(64),
        mediaType: "image/png",
        storage: "public" as const,
        capturedAt: "",
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("RFC-0887: display-gated section conditional logic", () => {
  it("display.document visible → PDF section should render", () => {
    const base = makeValidBase();
    const result = evidenceSourceSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.display?.document).toBe("visible");
    }
  });

  it("display.document hidden → PDF section should not render", () => {
    const base = makeValidBase();
    const data = {
      ...base,
      display: {
        document: "hidden" as const,
        screenshot: "visible" as const,
        websiteLink: "visible" as const,
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.display?.document).toBe("hidden");
    }
  });

  it("display.screenshot visible with websiteScreenshot.url → screenshot section should render", () => {
    const base = makeValidBase();
    const data = {
      ...base,
      websiteScreenshot: {
        sha256: "a".repeat(64),
        mediaType: "image/png",
        storage: "public" as const,
        url: "https://example.com/screenshot.png",
        capturedAt: "2026-08-20T10:00:00Z",
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.display?.screenshot).toBe("visible");
      expect(result.data.websiteScreenshot?.url).toBeDefined();
      expect(result.data.websiteScreenshot?.capturedAt).toBeDefined();
    }
  });

  it("display.websiteLink visible with websiteUrl → website link section should render", () => {
    const base = makeValidBase();
    const data = {
      ...base,
      websiteUrl: "https://example.com",
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.display?.websiteLink).toBe("visible");
      expect(result.data.websiteUrl).toBe("https://example.com");
    }
  });

  it("display.websiteLink hidden → website link section should not render", () => {
    const base = makeValidBase();
    const data = {
      ...base,
      display: {
        document: "visible" as const,
        screenshot: "visible" as const,
        websiteLink: "hidden" as const,
      },
      websiteUrl: "https://example.com",
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.display?.websiteLink).toBe("hidden");
    }
  });

  it("all display aspects hidden → no display-gated sections should render", () => {
    const base = makeValidBase();
    const data = {
      ...base,
      display: {
        document: "hidden" as const,
        screenshot: "hidden" as const,
        websiteLink: "hidden" as const,
      },
    };
    const result = evidenceSourceSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.display?.document).toBe("hidden");
      expect(result.data.display?.screenshot).toBe("hidden");
      expect(result.data.display?.websiteLink).toBe("hidden");
    }
  });
});
