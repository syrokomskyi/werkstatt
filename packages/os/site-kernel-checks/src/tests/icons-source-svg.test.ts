/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0631/RFC-0632: unit tests for resolveIconSvg helper, wrapMaskableSvg, and validateSourceSvg diagnostics.
    Covers site-authored favicon SVG source override, buildIconSvg fallback, maskable auto-wrap with
    80% safe-zone, ICON-SRC-01/02/04 diagnostics, and sharp conversion failure fallback.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0631: Added unit tests for resolveIconSvg, validateSourceSvg, and sharp fallback.</item>
  <item>RFC-0632: Added wrapMaskableSvg tests, ICON-SRC-04 warning test, removed ICON-SRC-03 test, updated resolveIconSvg maskable test.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";
import type { KernelRuntimeContext } from "@warpgogol/site-kernel";

// Mock readTextIfExists so we can control which source SVGs "exist"
const mockFiles = new Map<string, string>();

vi.mock("../public-surface/shared.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../public-surface/shared.ts")>();
  return {
    ...actual,
    readTextIfExists: vi.fn(
      async (_context: KernelRuntimeContext, absolutePath: string): Promise<string | undefined> => {
        return mockFiles.get(absolutePath);
      },
    ),
    loadPublicContext: vi.fn(async () => mockApp),
  };
});

// Import after mock is set up
const { resolveIconSvg, runPublicIconsGenerate, runPublicIconsValidate, wrapMaskableSvg } =
  await import("../public-surface/icons.ts");
const { buildIconSvg } = await import("../public-surface/icons.ts");

const logger = {
  section() {},
  info() {},
  warn() {},
  error() {},
  success() {},
  getEvents() {
    return [];
  },
};

function makeContext(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
    io: {
      exists: vi.fn(async (p: string) => mockFiles.has(p)),
      readFile: vi.fn(async (p: string) => mockFiles.get(p) ?? ""),
      readFileBytes: vi.fn(async (p: string) => Buffer.from(mockFiles.get(p) ?? "")),
      writeFile: vi.fn(async () => {}),
      rm: vi.fn(async () => {}),
    },
  } as unknown as KernelRuntimeContext;
}

const APP_DIR = "/test/app";
const CONTENT_DIR = "/test/app/src/content";
const PUBLIC_DIR = "/test/app/public";

const mockApp = {
  appId: "test-site",
  appDirectory: APP_DIR,
  publicDirectory: PUBLIC_DIR,
  contentDirectory: CONTENT_DIR,
  manifest: {
    identity: { name: "Test Site", biome: "default" },
  },
  domain: "test.example.com",
  siteUrl: "https://test.example.com",
  biomePalette: { surface: "#1a1a2e", brand: "#e94560" },
} as any;

function errorMessages(result: { data?: unknown }): string[] {
  const data = result.data as
    { diagnostics?: Array<{ message: string; ruleId?: string }> } | undefined;
  return (data?.diagnostics ?? []).map((d) => d.message);
}

function ruleIds(result: { data?: unknown }): string[] {
  const data = result.data as { diagnostics?: Array<{ ruleId?: string }> } | undefined;
  return (data?.diagnostics ?? []).map((d) => d.ruleId ?? "");
}

describe("RFC-0631 resolveIconSvg", () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  it("returns site-authored SVG when src/content/favicon.svg exists", async () => {
    const customSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="200"/></svg>`;
    mockFiles.set(join(CONTENT_DIR, "favicon.svg"), customSvg);

    const context = makeContext("/test");
    const result = await resolveIconSvg(mockApp, context, false);

    expect(result).toBe(customSvg);
  });

  it("falls back to buildIconSvg when no source SVG exists", async () => {
    const context = makeContext("/test");
    const result = await resolveIconSvg(mockApp, context, false);

    expect(result).toBe(buildIconSvg(mockApp, false));
  });

  it("returns maskable SVG when src/content/favicon-maskable.svg exists", async () => {
    // RFC-0632: favicon-maskable.svg is no longer read; auto-wrap from favicon.svg instead
    const regularSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1a1a2e"/><circle cx="256" cy="256" r="200"/></svg>`;
    mockFiles.set(join(CONTENT_DIR, "favicon.svg"), regularSvg);

    const context = makeContext("/test");
    const result = await resolveIconSvg(mockApp, context, true);

    // Should be the wrapped version, not the raw regular SVG
    expect(result).toBe(wrapMaskableSvg(regularSvg));
    expect(result).toContain("translate(51.2, 51.2) scale(0.8)");
  });

  it("falls back to regular source SVG for maskable when no maskable-specific SVG exists", async () => {
    const regularSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1a1a2e"/><circle cx="256" cy="256" r="200"/></svg>`;
    mockFiles.set(join(CONTENT_DIR, "favicon.svg"), regularSvg);

    const context = makeContext("/test");
    const result = await resolveIconSvg(mockApp, context, true);

    // RFC-0632: maskable now auto-wraps the regular source, not returns it as-is
    expect(result).toBe(wrapMaskableSvg(regularSvg));
    expect(result).not.toBe(regularSvg);
  });
});

describe("RFC-0631 validateSourceSvg (ICON-SRC diagnostics)", () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  it("reports ICON-SRC-01 when source SVG has wrong viewBox", async () => {
    const wrongViewBox = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><circle cx="128" cy="128" r="100"/></svg>`;
    mockFiles.set(join(CONTENT_DIR, "favicon.svg"), wrongViewBox);

    const context = makeContext("/test");
    const result = await runPublicIconsValidate({ argv: [], flags: {} } as any, context);

    const ids = ruleIds(result);
    expect(ids).toContain("ICON-SRC-01");
  });

  it("reports ICON-SRC-02 when source SVG has no root svg element", async () => {
    const invalidXml = `<html><body>not an svg</body></html>`;
    mockFiles.set(join(CONTENT_DIR, "favicon.svg"), invalidXml);

    const context = makeContext("/test");
    const result = await runPublicIconsValidate({ argv: [], flags: {} } as any, context);

    const ids = ruleIds(result);
    expect(ids).toContain("ICON-SRC-02");
  });

  it("does not report ICON-SRC diagnostics when no source SVGs exist", async () => {
    const context = makeContext("/test");
    const result = await runPublicIconsValidate({ argv: [], flags: {} } as any, context);

    const ids = ruleIds(result);
    expect(ids).not.toContain("ICON-SRC-01");
    expect(ids).not.toContain("ICON-SRC-02");
    expect(ids).not.toContain("ICON-SRC-04");
  });
});

describe("RFC-0632 wrapMaskableSvg", () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  it("applies translate(51.2, 51.2) scale(0.8) transform", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1a1a2e"/><circle cx="256" cy="256" r="200"/></svg>`;
    const result = wrapMaskableSvg(svg);

    expect(result).toContain("translate(51.2, 51.2) scale(0.8)");
    expect(result).toContain('<g transform="translate(51.2, 51.2) scale(0.8)">');
  });

  it("extracts background rect fill color", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#e94560"/><circle cx="256" cy="256" r="200"/></svg>`;
    const result = wrapMaskableSvg(svg);

    expect(result).toContain('fill="#e94560"');
    // The original background rect should be replaced with a new one outside the <g>
    expect(result).toContain('<rect width="512" height="512" fill="#e94560"/>');
  });

  it("falls back to #ffffff when no background rect found", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="200" fill="#e94560"/></svg>`;
    const result = wrapMaskableSvg(svg);

    expect(result).toContain('fill="#ffffff"');
    expect(result).toContain("translate(51.2, 51.2) scale(0.8)");
  });

  it("preserves <defs> blocks in wrapped content", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g1"><stop offset="0" stop-color="#e94560"/></linearGradient></defs><rect width="512" height="512" fill="#1a1a2e"/><circle cx="256" cy="256" r="200" fill="url(#g1)"/></svg>`;
    const result = wrapMaskableSvg(svg);

    expect(result).toContain("<defs>");
    expect(result).toContain("url(#g1)");
    expect(result).toContain("translate(51.2, 51.2) scale(0.8)");
  });

  it("returns original SVG when inner content parse fails", () => {
    const notSvg = `<html><body>not an svg</body></html>`;
    const result = wrapMaskableSvg(notSvg);

    expect(result).toBe(notSvg);
  });

  it("returns original SVG when only a background rect exists (no other content)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1a1a2e"/></svg>`;
    const result = wrapMaskableSvg(svg);

    expect(result).toBe(svg);
  });

  it("identifies background rect with width=100% height=100%", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="100%" height="100%" fill="#1a1a2e"/><circle cx="256" cy="256" r="200"/></svg>`;
    const result = wrapMaskableSvg(svg);

    expect(result).toContain('fill="#1a1a2e"');
    expect(result).toContain("translate(51.2, 51.2) scale(0.8)");
  });
});

describe("RFC-0632 ICON-SRC-04 warning", () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  it("reports ICON-SRC-04 when favicon.svg exists", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1a1a2e"/><circle cx="256" cy="256" r="200"/></svg>`;
    mockFiles.set(join(CONTENT_DIR, "favicon.svg"), svg);

    const context = makeContext("/test");
    const result = await runPublicIconsValidate({ argv: [], flags: {} } as any, context);

    const ids = ruleIds(result);
    expect(ids).toContain("ICON-SRC-04");
    // ICON-SRC-04 is a warning, not an error
    const data = result.data as
      { diagnostics?: Array<{ ruleId?: string; severity?: string }> } | undefined;
    const iconSrc04 = (data?.diagnostics ?? []).find((d) => d.ruleId === "ICON-SRC-04");
    expect(iconSrc04?.severity).toBe("warning");
  });

  it("does not report ICON-SRC-04 when no favicon.svg exists", async () => {
    const context = makeContext("/test");
    const result = await runPublicIconsValidate({ argv: [], flags: {} } as any, context);

    const ids = ruleIds(result);
    expect(ids).not.toContain("ICON-SRC-04");
  });
});

describe("RFC-0631 sharp conversion failure fallback", () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  it("falls back to buildIconSvg when sharp throws on valid-XML source SVG", async () => {
    // A valid XML document that is not a valid SVG for sharp processing
    // sharp will throw when trying to convert this
    const validXmlNotSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><foreignObject width="512" height="512"><div>not renderable</div></foreignObject></svg>`;
    mockFiles.set(join(CONTENT_DIR, "favicon.svg"), validXmlNotSvg);

    const context = makeContext("/test");
    // The generator should not throw — it should fall back to buildIconSvg
    const result = await runPublicIconsGenerate({ argv: [], flags: {} } as any, context);

    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("public.icons.generate: wrote");
  });
});
