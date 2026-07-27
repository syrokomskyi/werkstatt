import { test, expect, describe, vi } from "vitest";
import {
  IMAGE_EXTENSIONS,
  CONTENT_ASSET_DOMAINS,
  VIDEO_EXTENSIONS,
  MEDIA_SOURCE_EXTENSIONS,
  DEFAULT_LANGUAGE,
  contentAssetSyntaxDiagnostics,
  describeContentAssetResolution,
  resolveImage,
  resolveVideo,
  resolveMedia,
  createImageResolver,
  resolveImageRequired,
  createFsAssetResolver,
} from "../adapters/fs/assets.ts";
import { FS_CAPABILITIES } from "../adapters/fs/capabilities.ts";
import {
  CMS_GIT_CAPABILITIES,
  buildDecapConfig,
  mergeSamples,
  inferDecapField,
  inferFields,
} from "../adapters/cms-git/index.ts";

describe("FS_CAPABILITIES", () => {
  test("localAssets is true", () => {
    expect(FS_CAPABILITIES.localAssets).toBe(true);
  });
  test("remoteAssets is false", () => {
    expect(FS_CAPABILITIES.remoteAssets).toBe(false);
  });
  test("liveFetch is false", () => {
    expect(FS_CAPABILITIES.liveFetch).toBe(false);
  });
  test("richText is false", () => {
    expect(FS_CAPABILITIES.richText).toBe(false);
  });
});

describe("CMS_GIT_CAPABILITIES", () => {
  test("localAssets is true", () => {
    expect(CMS_GIT_CAPABILITIES.localAssets).toBe(true);
  });
  test("richText is true", () => {
    expect(CMS_GIT_CAPABILITIES.richText).toBe(true);
  });
  test("liveFetch is false", () => {
    expect(CMS_GIT_CAPABILITIES.liveFetch).toBe(false);
  });
});

describe("contentAssetSyntaxDiagnostics", () => {
  test("returns empty for bare filename", () => {
    expect(contentAssetSyntaxDiagnostics("hero-bg")).toEqual([]);
  });

  test("flags leading slash", () => {
    const diags = contentAssetSyntaxDiagnostics("/hero-bg");
    expect(diags.some((d) => d.reason === "leading-slash")).toBe(true);
  });

  test("flags path separator", () => {
    const diags = contentAssetSyntaxDiagnostics("folder/hero-bg");
    expect(diags.some((d) => d.reason === "path")).toBe(true);
  });

  test("flags raster extension", () => {
    const diags = contentAssetSyntaxDiagnostics("hero-bg.webp");
    expect(diags.some((d) => d.reason === "extension")).toBe(true);
  });

  test("flags .jpg extension", () => {
    const diags = contentAssetSyntaxDiagnostics("hero-bg.jpg");
    expect(diags.some((d) => d.reason === "extension")).toBe(true);
  });
});

describe("describeContentAssetResolution", () => {
  test("generates candidates across all domains and extensions", () => {
    const contract = describeContentAssetResolution(
      { raw: "hero", domain: "pages", lang: "de", sourceFile: "" },
      { defaultLanguage: "de" },
    );
    expect(contract.candidates.length).toBeGreaterThan(0);
    // 4 domains × 1 lang × 4 extensions + 4 surface = 20
    expect(contract.candidates.length).toBe(20);
  });

  test("generates language fallback candidates when lang differs from default", () => {
    const contract = describeContentAssetResolution(
      { raw: "hero", domain: "pages", lang: "uk", sourceFile: "" },
      { defaultLanguage: "de" },
    );
    const requestedLang = contract.candidates.filter((c) => c.fallback === "requested-lang");
    const defaultLang = contract.candidates.filter((c) => c.fallback === "default-lang");
    expect(requestedLang.length).toBeGreaterThan(0);
    expect(defaultLang.length).toBeGreaterThan(0);
  });

  test("resolves the first existing candidate", () => {
    const contract = describeContentAssetResolution(
      { raw: "hero", domain: "pages", lang: "de", sourceFile: "" },
      {
        defaultLanguage: "de",
        assetExists: (path) => path.includes("pages/de/assets/hero.webp"),
      },
    );
    expect(contract.resolved).toBeTruthy();
    expect(contract.resolved!.extension).toBe(".webp");
  });

  test("normalized token strips extension", () => {
    const contract = describeContentAssetResolution(
      { raw: "hero.webp", domain: "pages", lang: "de", sourceFile: "" },
      { defaultLanguage: "de" },
    );
    expect(contract.token.normalized).toBe("hero");
  });
});

describe("resolveImage", () => {
  const images = {
    "/src/content/pages/de/assets/hero.webp": {
      default: { src: "/hero.webp", width: 100, height: 100, format: "webp" } as never,
    },
  };

  test("returns null for undefined imageName", () => {
    expect(resolveImage(images, undefined)).toBeNull();
  });

  test("resolves bare filename in default lang", () => {
    const result = resolveImage(images, "hero", { lang: "de", defaultLang: "de" });
    expect(result).toBeTruthy();
  });

  test("falls back to default lang when requested lang not found", () => {
    const result = resolveImage(images, "hero", { lang: "uk", defaultLang: "de" });
    expect(result).toBeTruthy();
  });

  test("returns null for non-existent image", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveImage(images, "nonexistent", { lang: "de" })).toBeNull();
    warnSpy.mockRestore();
  });

  test("resolves full path directly", () => {
    const result = resolveImage(images, "/src/content/pages/de/assets/hero.webp");
    expect(result).toBeTruthy();
  });
});

describe("resolveVideo", () => {
  const videos = {
    "/src/content/pages/de/assets/hero.webm": "/hashed-hero.webm",
  };

  test("returns null for undefined imageName", () => {
    expect(resolveVideo(videos, undefined)).toBeNull();
  });

  test("resolves bare filename", () => {
    expect(resolveVideo(videos, "hero", { lang: "de", defaultLang: "de" })).toBe(
      "/hashed-hero.webm",
    );
  });

  test("falls back to default lang", () => {
    expect(resolveVideo(videos, "hero", { lang: "uk", defaultLang: "de" })).toBe(
      "/hashed-hero.webm",
    );
  });

  test("returns null for non-existent", () => {
    expect(resolveVideo(videos, "nonexistent", { lang: "de", defaultLang: "de" })).toBeNull();
  });
});

describe("resolveMedia", () => {
  const videos = {
    "/src/content/pages/de/media/promo.mp4": "/hashed-promo.mp4",
  };

  test("returns null for undefined token", () => {
    expect(resolveMedia(videos, undefined)).toBeNull();
  });

  test("resolves bare filename in media folder", () => {
    const result = resolveMedia(videos, "promo", { lang: "de", defaultLang: "de" });
    expect(result).toBeTruthy();
    expect(result!.key).toContain("promo.mp4");
  });

  test("returns null for non-existent", () => {
    expect(resolveMedia(videos, "nonexistent", { lang: "de", defaultLang: "de" })).toBeNull();
  });
});

describe("createImageResolver", () => {
  test("returns a bound resolver function", () => {
    const images = {
      "/src/content/pages/de/assets/hero.webp": {
        default: { src: "/hero.webp", width: 100, height: 100, format: "webp" } as never,
      },
    };
    const resolver = createImageResolver(images, { lang: "de", defaultLang: "de" });
    expect(resolver("hero")).toBeTruthy();
    expect(resolver("nonexistent")).toBeNull();
  });
});

describe("resolveImageRequired", () => {
  test("throws when image not found", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => resolveImageRequired({}, "nonexistent", { lang: "de" }, "test context")).toThrow(
      /not found/,
    );
    warnSpy.mockRestore();
  });

  test("returns image when found", () => {
    const images = {
      "/src/content/pages/de/assets/hero.webp": {
        default: { src: "/hero.webp", width: 100, height: 100, format: "webp" } as never,
      },
    };
    const result = resolveImageRequired(images, "hero", { lang: "de", defaultLang: "de" }, "test");
    expect(result).toBeTruthy();
  });
});

describe("createFsAssetResolver", () => {
  test("returns local ResolvedAsset when found", () => {
    const images = {
      "/src/content/pages/de/assets/hero.webp": {
        default: { src: "/hero.webp", width: 100, height: 100, format: "webp" } as never,
      },
    };
    const resolver = createFsAssetResolver(images);
    const result = resolver({ token: "hero", lang: "de" } as never);
    expect(result).toBeTruthy();
    expect(result!.kind).toBe("local");
  });

  test("returns null when not found", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolver = createFsAssetResolver({});
    expect(resolver({ token: "nonexistent", lang: "de" } as never)).toBeNull();
    warnSpy.mockRestore();
  });
});

describe("buildDecapConfig", () => {
  test("assembles a minimal config", () => {
    const config = buildDecapConfig({
      backend: { name: "git-gateway", branch: "main" },
      mediaFolder: "static/img",
      publicFolder: "/img",
      collections: [],
    });
    expect(config.backend.name).toBe("git-gateway");
    expect(config.media_folder).toBe("static/img");
    expect(config.collections).toEqual([]);
    expect(config.publish_mode).toBeUndefined();
  });

  test("adds publish_mode when editorialWorkflow is true", () => {
    const config = buildDecapConfig({
      backend: { name: "git-gateway" },
      mediaFolder: "static/img",
      publicFolder: "/img",
      editorialWorkflow: true,
      collections: [],
    });
    expect(config.publish_mode).toBe("editorial_workflow");
  });

  test("adds site_url when provided", () => {
    const config = buildDecapConfig({
      backend: { name: "git-gateway" },
      mediaFolder: "static/img",
      publicFolder: "/img",
      siteUrl: "https://example.com",
      collections: [],
    });
    expect(config.site_url).toBe("https://example.com");
  });
});

describe("mergeSamples", () => {
  test("returns b when a is null", () => {
    expect(mergeSamples(null, { x: 1 })).toEqual({ x: 1 });
  });

  test("returns a when b is null", () => {
    expect(mergeSamples({ x: 1 }, null)).toEqual({ x: 1 });
  });

  test("merges objects key-wise (first scalar wins)", () => {
    expect(mergeSamples({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 2, c: 4 });
  });

  test("concatenates arrays", () => {
    expect(mergeSamples([1, 2], [3, 4])).toEqual([1, 2, 3, 4]);
  });

  test("returns first scalar when both are scalars", () => {
    expect(mergeSamples(1, 2)).toBe(1);
  });
});

describe("inferDecapField", () => {
  test("infers boolean field", () => {
    const field = inferDecapField("isActive", true);
    expect(field.widget).toBe("boolean");
    expect(field.name).toBe("isActive");
    expect(field.required).toBe(false);
  });

  test("infers integer field", () => {
    const field = inferDecapField("count", 42);
    expect(field.widget).toBe("number");
    expect(field.value_type).toBe("int");
  });

  test("infers float field", () => {
    const field = inferDecapField("price", 3.14);
    expect(field.widget).toBe("number");
    expect(field.value_type).toBe("float");
  });

  test("infers string field for single-line", () => {
    const field = inferDecapField("title", "Hello");
    expect(field.widget).toBe("string");
  });

  test("infers text field for multi-line", () => {
    const field = inferDecapField("body", "Line 1\nLine 2");
    expect(field.widget).toBe("text");
  });

  test("infers list field for array of objects", () => {
    const field = inferDecapField("items", [{ name: "a" }, { name: "b" }]);
    expect(field.widget).toBe("list");
    expect(field.fields).toBeDefined();
  });

  test("infers list field for array of scalars", () => {
    const field = inferDecapField("tags", ["a", "b"]);
    expect(field.widget).toBe("list");
    expect(field.fields).toBeUndefined();
  });

  test("infers object field for plain object", () => {
    const field = inferDecapField("meta", { key: "value" });
    expect(field.widget).toBe("object");
    expect(field.fields).toBeDefined();
  });

  test("infers string for null/undefined", () => {
    expect(inferDecapField("unknown", null).widget).toBe("string");
    expect(inferDecapField("unknown", undefined).widget).toBe("string");
  });
});

describe("inferFields", () => {
  test("returns alphabetically sorted fields", () => {
    const fields = inferFields({ zebra: 1, apple: "a", mango: true });
    expect(fields[0].name).toBe("apple");
    expect(fields[1].name).toBe("mango");
    expect(fields[2].name).toBe("zebra");
  });
});
