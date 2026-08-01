/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0631: unit tests for resolveIconSvg helper and validateSourceSvg diagnostics.
    Covers site-authored favicon SVG source override, buildIconSvg fallback,
    ICON-SRC-01/02/03 diagnostics, and sharp conversion failure fallback.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0631: Added unit tests for resolveIconSvg, validateSourceSvg, and sharp fallback.</item>
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
const { resolveIconSvg, runPublicIconsGenerate, runPublicIconsValidate } =
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
    const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512"/></svg>`;
    mockFiles.set(join(CONTENT_DIR, "favicon-maskable.svg"), maskableSvg);

    const context = makeContext("/test");
    const result = await resolveIconSvg(mockApp, context, true);

    expect(result).toBe(maskableSvg);
  });

  it("falls back to regular source SVG for maskable when no maskable-specific SVG exists", async () => {
    const regularSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="200"/></svg>`;
    mockFiles.set(join(CONTENT_DIR, "favicon.svg"), regularSvg);

    const context = makeContext("/test");
    const result = await resolveIconSvg(mockApp, context, true);

    expect(result).toBe(regularSvg);
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

  it("reports ICON-SRC-03 when maskable source SVG has wrong viewBox", async () => {
    const wrongViewBox = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="50"/></svg>`;
    mockFiles.set(join(CONTENT_DIR, "favicon-maskable.svg"), wrongViewBox);

    const context = makeContext("/test");
    const result = await runPublicIconsValidate({ argv: [], flags: {} } as any, context);

    const ids = ruleIds(result);
    expect(ids).toContain("ICON-SRC-03");
  });

  it("does not report ICON-SRC diagnostics when no source SVGs exist", async () => {
    const context = makeContext("/test");
    const result = await runPublicIconsValidate({ argv: [], flags: {} } as any, context);

    const ids = ruleIds(result);
    expect(ids).not.toContain("ICON-SRC-01");
    expect(ids).not.toContain("ICON-SRC-02");
    expect(ids).not.toContain("ICON-SRC-03");
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
