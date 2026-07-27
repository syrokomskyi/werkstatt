import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractRouteBehavior,
  normalizeVolatile,
  buildBehaviorSnapshot,
  runBehaviorSnapshotValidate,
} from "../behavior-snapshot.ts";
import { GENERATED_MARKER, buildGeneratedHeader } from "@warpgogol/site-kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { stringify as yamlStringify } from "yaml";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0269: fixture tests for the behavior snapshot extractor and validator,
    written before wiring into build.post/sites-check.postbuild. Fixture HTML
    -> expected extraction (golden); a dropped meta tag -> SNAP-01 naming the
    route/field; a missing committed snapshot -> SNAP-02; a determinism proof
    (two builds of the same fixture dist produce byte-identical snapshots).
  </purpose>
</MODULE_CONTRACT>
*/

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="de">
<head>
  <title>Impressum — Warpgogol</title>
  <meta name="description" content="Rechtliche Informationen." />
  <link rel="canonical" href="https://example.com/de/impressum/" />
  <link rel="alternate" hreflang="de" href="https://example.com/de/impressum/" />
  <link rel="alternate" hreflang="en" href="https://example.com/en/impressum/" />
  <meta property="og:title" content="Impressum" />
  <meta property="og:image" content="/_astro/hero.abc123XY.webp" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="robots" content="index, follow" />
  <script type="application/ld+json">{"@type":"WebPage","name":"Impressum","url":"https://example.com/de/impressum/"}</script>
  <script type="application/ld+json">{"@graph":[{"@type":"BreadcrumbList","itemListElement":[1,2,3]},{"@type":"Organization","name":"Warpgogol"}]}</script>
</head>
<body></body>
</html>`;

describe("normalizeVolatile (RFC-0269)", () => {
  it("replaces an Astro content-hash segment with a stable placeholder", () => {
    expect(normalizeVolatile("/_astro/hero.abc123XY.webp")).toBe("/_astro/hero.<HASH>.webp");
  });

  it("leaves non-Astro paths untouched", () => {
    expect(normalizeVolatile("/fonts/inter-400.woff2")).toBe("/fonts/inter-400.woff2");
  });
});

describe("extractRouteBehavior (RFC-0269)", () => {
  it("golden fixture: extracts every declared field", () => {
    const behavior = extractRouteBehavior(FIXTURE_HTML, "/de/impressum/", "de", true, false);
    expect(behavior.title).toBe("Impressum — Warpgogol");
    expect(behavior.metaDescription).toBe("Rechtliche Informationen.");
    expect(behavior.canonical).toBe("https://example.com/de/impressum/");
    expect(behavior.hreflang).toEqual({
      de: "https://example.com/de/impressum/",
      en: "https://example.com/en/impressum/",
    });
    expect(behavior.og).toEqual({
      "og:title": "Impressum",
      "og:image": "/_astro/hero.<HASH>.webp",
    });
    expect(behavior.twitter).toEqual({ "twitter:card": "summary_large_image" });
    expect(behavior.robotsMeta).toBe("index, follow");
    expect(behavior.breadcrumbDepth).toBe(3);
    expect(behavior.jsonld).toEqual([
      { type: "BreadcrumbList" },
      { type: "Organization", name: "Warpgogol" },
      { type: "WebPage", name: "Impressum", url: "https://example.com/de/impressum/" },
    ]);
    expect(behavior.inSitemap).toBe(true);
    expect(behavior.hasMarkdownTwin).toBe(false);
  });

  it("returns null for fields absent from the HTML", () => {
    const behavior = extractRouteBehavior(
      "<html><head></head><body></body></html>",
      "/",
      "default",
      false,
      false,
    );
    expect(behavior.title).toBeNull();
    expect(behavior.metaDescription).toBeNull();
    expect(behavior.canonical).toBeNull();
    expect(behavior.robotsMeta).toBeNull();
    expect(behavior.breadcrumbDepth).toBeNull();
    expect(behavior.jsonld).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Filesystem-backed: buildBehaviorSnapshot / runBehaviorSnapshotValidate
// ---------------------------------------------------------------------------

async function fixtureDistClient(root: string): Promise<string> {
  const distClientDir = join(root, "apps", "fixture-app", "dist", "client");
  const pageDir = join(distClientDir, "de", "impressum");
  await mkdir(pageDir, { recursive: true });
  await writeFile(join(pageDir, "index.html"), FIXTURE_HTML, "utf8");
  await writeFile(join(distClientDir, "de", "impressum.md"), "# Impressum\n", "utf8");
  await writeFile(
    join(distClientDir, "sitemap.xml"),
    `<?xml version="1.0"?><urlset><url><loc>https://example.com/de/impressum/</loc></url></urlset>`,
    "utf8",
  );
  await writeFile(join(distClientDir, "_headers"), "/*\n  X-Frame-Options: DENY\n", "utf8");
  await writeFile(join(distClientDir, "_redirects"), "/old /new 301\n", "utf8");
  return distClientDir;
}

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

const input = { argv: [], args: [], flags: {} } as unknown as KernelCommandInput;

function ctx(root: string, appDirectory: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    site: { name: "fixture-app", directory: appDirectory },
    siteExplicit: true,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
}

describe("buildBehaviorSnapshot (RFC-0269)", () => {
  it("determinism: two builds of the same fixture dist produce byte-identical snapshots", async () => {
    const root = await mkdtemp(join(tmpdir(), "behavior-snapshot-"));
    try {
      const distClientDir = await fixtureDistClient(root);
      const first = await buildBehaviorSnapshot(distClientDir, "fixture-app");
      const second = await buildBehaviorSnapshot(distClientDir, "fixture-app");
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      expect(first.routes).toHaveLength(1);
      expect(first.routes[0]?.hasMarkdownTwin).toBe(true);
      expect(first.headers).toEqual(["/*", "X-Frame-Options: DENY"]);
      expect(first.redirects).toEqual(["/old /new 301"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("behavior.snapshot.validate (RFC-0269)", () => {
  it("SNAP-02: fails when no committed snapshot exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "behavior-snapshot-"));
    try {
      const appDirectory = join(root, "apps", "fixture-app");
      await fixtureDistClient(root);
      const result = await runBehaviorSnapshotValidate(input, ctx(root, appDirectory));
      expect(result.exitCode).toBe(1);
      const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
        (d) => d.ruleId,
      );
      expect(ruleIds).toContain("SNAP-02");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("SNAP-01: fails and names the route when a meta tag is dropped after the snapshot was committed", async () => {
    const root = await mkdtemp(join(tmpdir(), "behavior-snapshot-"));
    try {
      const appDirectory = join(root, "apps", "fixture-app");
      const distClientDir = await fixtureDistClient(root);
      const committed = await buildBehaviorSnapshot(distClientDir, "fixture-app");
      const header = buildGeneratedHeader({
        filePath: `apps/fixture-app/behavior.snapshot.generated.yaml`,
        ownerCommand: "behavior.snapshot.generate",
      });
      await writeFile(
        join(appDirectory, "behavior.snapshot.generated.yaml"),
        `${header}${yamlStringify(committed)}`,
        "utf8",
      );

      // Drop the description meta tag, simulating an unintended regression.
      const withoutDescription = FIXTURE_HTML.replace(/<meta name="description"[^>]*\/>\n/, "");
      await writeFile(
        join(distClientDir, "de", "impressum", "index.html"),
        withoutDescription,
        "utf8",
      );

      const result = await runBehaviorSnapshotValidate(input, ctx(root, appDirectory));
      expect(result.exitCode).toBe(1);
      const diags = (result.data as { diagnostics: Array<{ ruleId: string; message: string }> })
        .diagnostics;
      const snap01 = diags.find(
        (d) => d.ruleId === "SNAP-01" && d.message.includes("/de/impressum/"),
      );
      expect(snap01).toBeTruthy();
      expect(snap01?.message).toMatch(/metaDescription/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("passes when the committed snapshot matches the fresh build", async () => {
    const root = await mkdtemp(join(tmpdir(), "behavior-snapshot-"));
    try {
      const appDirectory = join(root, "apps", "fixture-app");
      const distClientDir = await fixtureDistClient(root);
      const committed = await buildBehaviorSnapshot(distClientDir, "fixture-app");
      const header = buildGeneratedHeader({
        filePath: `apps/fixture-app/behavior.snapshot.generated.yaml`,
        ownerCommand: "behavior.snapshot.generate",
      });
      await writeFile(
        join(appDirectory, "behavior.snapshot.generated.yaml"),
        `${header}${yamlStringify(committed)}`,
        "utf8",
      );

      const result = await runBehaviorSnapshotValidate(input, ctx(root, appDirectory));
      expect(result.exitCode ?? 0).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
