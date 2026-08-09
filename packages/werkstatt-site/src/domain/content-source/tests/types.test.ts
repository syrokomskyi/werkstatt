import { test, expect, describe } from "vitest";
import type {
  ContentDomain,
  ContentEntryRef,
  ContentStatus,
  AssetRef,
  ContentSourceCapabilities,
  ContentSourceProvider,
  ContentEntry,
  ResolvedAsset,
} from "../types.ts";

describe("ContentDomain type", () => {
  test("all expected domains are valid string literals", () => {
    const domains: ContentDomain[] = ["system", "pages", "prose", "business", "navigation", "site"];
    for (const d of domains) {
      expect(typeof d).toBe("string");
      expect(d.length).toBeGreaterThan(0);
    }
  });
});

describe("ContentEntryRef", () => {
  test("constructs a valid ref", () => {
    const ref: ContentEntryRef = { domain: "pages", id: "de/home" };
    expect(ref.domain).toBe("pages");
    expect(ref.id).toBe("de/home");
  });
});

describe("ContentStatus", () => {
  test("draft and published are the only valid values", () => {
    const statuses: ContentStatus[] = ["draft", "published"];
    expect(statuses).toHaveLength(2);
  });
});

describe("AssetRef", () => {
  test("constructs with only token", () => {
    const ref: AssetRef = { token: "hero-bg" };
    expect(ref.token).toBe("hero-bg");
    expect(ref.lang).toBeUndefined();
    expect(ref.subPath).toBeUndefined();
  });

  test("constructs with all fields", () => {
    const ref: AssetRef = { token: "hero-bg", lang: "de", subPath: "projects/assets" };
    expect(ref.lang).toBe("de");
    expect(ref.subPath).toBe("projects/assets");
  });
});

describe("ContentSourceCapabilities", () => {
  test("filesystem adapter capabilities", () => {
    const caps: ContentSourceCapabilities = {
      localAssets: true,
      remoteAssets: false,
      liveFetch: false,
      richText: false,
    };
    expect(caps.localAssets).toBe(true);
    expect(caps.remoteAssets).toBe(false);
  });

  test("CMS adapter capabilities", () => {
    const caps: ContentSourceCapabilities = {
      localAssets: false,
      remoteAssets: true,
      liveFetch: true,
      richText: true,
    };
    expect(caps.remoteAssets).toBe(true);
    expect(caps.liveFetch).toBe(true);
  });
});

describe("ContentSourceProvider interface", () => {
  function makeStubProvider(overrides: Partial<ContentSourceProvider> = {}): ContentSourceProvider {
    return {
      id: "stub",
      capabilities: {
        localAssets: true,
        remoteAssets: false,
        liveFetch: false,
        richText: false,
      },
      async listEntries() {
        return [];
      },
      async getEntry() {
        return null;
      },
      async resolveAsset() {
        return null;
      },
      ...overrides,
    };
  }

  test("stub provider returns entries from listEntries", async () => {
    const entries: ContentEntry[] = [{ id: "de/home", domain: "pages", data: { title: "Home" } }];
    const provider = makeStubProvider({
      listEntries: async () => entries,
    });
    const result = await provider.listEntries("pages", "de");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("de/home");
  });

  test("stub provider returns entry from getEntry", async () => {
    const entry: ContentEntry = { id: "de/home", domain: "pages", data: {} };
    const provider = makeStubProvider({
      getEntry: async () => entry,
    });
    const result = await provider.getEntry({ domain: "pages", id: "de/home" });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("de/home");
  });

  test("stub provider returns null for missing entry", async () => {
    const provider = makeStubProvider();
    const result = await provider.getEntry({ domain: "pages", id: "nonexistent" });
    expect(result).toBeNull();
  });

  test("stub provider resolves local asset", async () => {
    const asset: ResolvedAsset = {
      kind: "local",
      image: {} as never,
    };
    const provider = makeStubProvider({
      resolveAsset: async () => asset,
    });
    const result = await provider.resolveAsset({ token: "hero-bg" });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("local");
  });

  test("stub provider resolves remote asset", async () => {
    const asset: ResolvedAsset = {
      kind: "remote",
      url: "https://cdn.example.com/image.jpg",
      width: 1920,
      height: 1080,
      format: "jpeg",
    };
    const provider = makeStubProvider({
      resolveAsset: async () => asset,
    });
    const result = await provider.resolveAsset({ token: "hero-bg" });
    expect(result).not.toBeNull();
    if (result!.kind === "remote") {
      expect(result!.url).toBe("https://cdn.example.com/image.jpg");
      expect(result!.width).toBe(1920);
    }
  });

  test("stub provider returns null for missing asset", async () => {
    const provider = makeStubProvider();
    const result = await provider.resolveAsset({ token: "nonexistent" });
    expect(result).toBeNull();
  });
});
