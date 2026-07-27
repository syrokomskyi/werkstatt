/*
<MODULE_CONTRACT>
<purpose>
RFC-0269: emits a golden, reviewable behavior snapshot per app — the
structured public-behavior surface (routes, meta, JSON-LD graph shape,
hreflang, headers, redirects) extracted from the built dist/client output.
behavior.snapshot.generate writes the committed golden file;
behavior.snapshot.validate regenerates in-memory and fails on drift (SNAP-01)
so an unintended public-surface regression shows up as a structured diff in
review instead of shipping silently.
</purpose>
<non-goals>
  <item>Do not snapshot rendered pixels or full HTML — only the structured public-behavior surface.</item>
  <item>Do not judge correctness (that is seo.structured-data.validate and friends) — this only detects CHANGE.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0269: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileExists, collectFiles } from "@gogol/share/fs";
import { markdownTwinRelPath } from "@gogol/share/semantic";
import {
  GENERATED_MARKER,
  hasGeneratedMarker,
  writeFileIfChanged,
  type CheckResult,
  type Diagnostic,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelRuntimeContext,
  buildGeneratedHeader,
} from "@gogol/site-kernel";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { diagnosticsResult } from "./result-helpers.ts";

export interface RouteBehavior {
  route: string;
  lang: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  hreflang: Record<string, string>;
  og: Record<string, string>;
  twitter: Record<string, string>;
  jsonld: Array<{ type: string; name?: string; url?: string }>;
  breadcrumbDepth: number | null;
  robotsMeta: string | null;
  inSitemap: boolean;
  hasMarkdownTwin: boolean;
}

export interface BehaviorSnapshot {
  meta: { schemaVersion: 1; deterministic: true; generatedAt: null; contentHash: string };
  site: string;
  routes: RouteBehavior[];
  headers: string[];
  redirects: string[];
}

const SNAPSHOT_FILENAME = "behavior.snapshot.generated.yaml";
const ASTRO_HASH_RE = /(\/_astro\/[^"'\s?#]+?)\.[a-zA-Z0-9_-]{6,10}(\.\w+)(?=["'\s?#]|$)/g;

/** Replace Astro-hashed asset URL segments with a stable `<HASH>` placeholder. */
export function normalizeVolatile(value: string): string {
  return value.replace(ASTRO_HASH_RE, "$1.<HASH>$2");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function matchOne(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? decodeEntities(normalizeVolatile(m[1]!.trim())) : null;
}

function extractAllMeta(
  html: string,
  attrName: "property" | "name",
  prefix: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  const re = new RegExp(
    `<meta\\s+[^>]*${attrName}=["'](${prefix}:[^"']+)["'][^>]*content=["']([^"']*)["'][^>]*>|` +
      `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*${attrName}=["'](${prefix}:[^"']+)["'][^>]*>`,
    "gi",
  );
  for (const m of html.matchAll(re)) {
    const key = m[1] ?? m[4];
    const value = m[2] ?? m[3];
    if (key) result[key] = decodeEntities(normalizeVolatile((value ?? "").trim()));
  }
  return result;
}

function extractHreflang(html: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re =
    /<link\s+[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>|<link\s+[^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*>/gi;
  for (const m of html.matchAll(re)) {
    const lang = m[1] ?? m[3];
    const href = m[2] ?? m[4];
    if (lang && href) result[lang] = normalizeVolatile(href);
  }
  return result;
}

interface JsonLdNode {
  type: string;
  name?: string;
  url?: string;
}

function extractJsonLd(html: string): { nodes: JsonLdNode[]; breadcrumbDepth: number | null } {
  const nodes: JsonLdNode[] = [];
  let breadcrumbDepth: number | null = null;
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const scriptMatch of html.matchAll(scriptRe)) {
    let parsed: unknown;
    try {
      parsed = yamlParse(scriptMatch[1]!);
    } catch {
      continue;
    }
    const graph = Array.isArray((parsed as { "@graph"?: unknown[] })?.["@graph"])
      ? (parsed as { "@graph": unknown[] })["@graph"]
      : [parsed];

    for (const raw of graph) {
      if (!raw || typeof raw !== "object") continue;
      const node = raw as Record<string, unknown>;
      const type = node["@type"];
      const typeStr = Array.isArray(type) ? type.join("+") : typeof type === "string" ? type : null;
      if (!typeStr) continue;
      if (typeStr === "BreadcrumbList" && Array.isArray(node["itemListElement"])) {
        breadcrumbDepth = (node["itemListElement"] as unknown[]).length;
      }
      const entry: JsonLdNode = { type: typeStr };
      if (typeof node["name"] === "string") entry.name = node["name"];
      if (typeof node["url"] === "string") entry.url = normalizeVolatile(node["url"]);
      nodes.push(entry);
    }
  }

  nodes.sort((a, b) => a.type.localeCompare(b.type) || (a.name ?? "").localeCompare(b.name ?? ""));
  return { nodes, breadcrumbDepth };
}

/** Pure, regex-based extractor for one rendered HTML page. */
export function extractRouteBehavior(
  html: string,
  route: string,
  lang: string,
  inSitemap: boolean,
  hasMarkdownTwin: boolean,
): RouteBehavior {
  const title = matchOne(html, /<title>([^<]*)<\/title>/i);
  const metaDescription = matchOne(
    html,
    /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i,
  );
  const canonical = matchOne(html, /<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
  const robotsMeta = matchOne(
    html,
    /<meta\s+[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i,
  );
  const { nodes, breadcrumbDepth } = extractJsonLd(html);

  return {
    route,
    lang,
    title,
    metaDescription,
    canonical,
    hreflang: extractHreflang(html),
    og: extractAllMeta(html, "property", "og"),
    twitter: extractAllMeta(html, "name", "twitter"),
    jsonld: nodes,
    breadcrumbDepth,
    robotsMeta,
    inSitemap,
    hasMarkdownTwin,
  };
}

function routeFromHtmlPath(distClientDir: string, htmlPath: string): string {
  const rel = relative(distClientDir, htmlPath).replace(/\\/g, "/");
  const withoutIndex = rel.replace(/index\.html$/, "").replace(/\.html$/, "/");
  return `/${withoutIndex}`.replace(/\/+/g, "/");
}

function langFromRoute(route: string): string {
  const firstSegment = route.split("/").filter(Boolean)[0];
  return firstSegment && /^[a-z]{2}$/.test(firstSegment) ? firstSegment : "default";
}

async function collectHtmlFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: [".html"], ignore: () => false });
}

async function readLines(filePath: string): Promise<string[]> {
  try {
    const content = await readFile(filePath, "utf8");
    return content
      .split("\n")
      .map((l) => normalizeVolatile(l.trim()))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Builds the full, deterministic BehaviorSnapshot for an app's dist/client output. */
export async function buildBehaviorSnapshot(
  distClientDir: string,
  siteName: string,
): Promise<BehaviorSnapshot> {
  let sitemapContent = "";
  for (const name of ["sitemap.xml", "sitemap-content.xml"]) {
    try {
      sitemapContent += await readFile(join(distClientDir, name), "utf8");
    } catch {
      // absent — fine, inSitemap defaults false for all routes.
    }
  }
  const sitemapUrls = new Set(
    [...sitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
      try {
        return new URL(m[1]!).pathname;
      } catch {
        return m[1]!;
      }
    }),
  );

  const htmlFiles = await collectHtmlFiles(distClientDir);
  const supportedLangs = Array.from(
    new Set(
      htmlFiles
        .map((htmlPath) => routeFromHtmlPath(distClientDir, htmlPath).split("/").filter(Boolean)[0])
        .filter((segment): segment is string => Boolean(segment && /^[a-z]{2}$/.test(segment))),
    ),
  );
  const routes: RouteBehavior[] = [];
  for (const htmlPath of htmlFiles) {
    const route = routeFromHtmlPath(distClientDir, htmlPath);
    const lang = langFromRoute(route);
    const html = await readFile(htmlPath, "utf8");
    const twinPath = join(distClientDir, markdownTwinRelPath(route, { supportedLangs }));
    const hasMarkdownTwin = await fileExists(twinPath);
    routes.push(extractRouteBehavior(html, route, lang, sitemapUrls.has(route), hasMarkdownTwin));
  }
  routes.sort((a, b) => a.route.localeCompare(b.route));

  const headers = await readLines(join(distClientDir, "_headers"));
  const redirects = await readLines(join(distClientDir, "_redirects"));

  const withoutHash: Omit<BehaviorSnapshot, "meta"> & {
    meta: Omit<BehaviorSnapshot["meta"], "contentHash">;
  } = {
    meta: { schemaVersion: 1, deterministic: true, generatedAt: null },
    site: siteName,
    routes,
    headers,
    redirects,
  };
  const contentHash = createHash("sha256").update(JSON.stringify(withoutHash)).digest("hex");

  return { ...withoutHash, meta: { ...withoutHash.meta, contentHash } };
}

function snapshotPath(appDirectory: string): string {
  return join(appDirectory, SNAPSHOT_FILENAME);
}

export async function runBehaviorSnapshotGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<
  KernelCommandResult<{
    command: "behavior.snapshot.generate";
    routeCount: number;
    written: boolean;
  }>
> {
  const { appDirectory } = requireAstroSitePaths(context);
  const distClientDir = join(appDirectory, "dist", "client");
  if (!(await fileExists(distClientDir))) {
    return {
      data: { command: "behavior.snapshot.generate", routeCount: 0, written: false },
      exitCode: 1,
      summary: "behavior.snapshot.generate: dist/client is missing — run the build first",
    };
  }

  const snapshot = await buildBehaviorSnapshot(distClientDir, context.site!.name);
  await mkdir(appDirectory, { recursive: true });
  const header = buildGeneratedHeader({
    ownerCommand: "behavior.snapshot.generate",
    filePath: `apps/${context.site!.name}/behavior.snapshot.generated.yaml`,
  });
  await writeFileIfChanged(snapshotPath(appDirectory), `${header}${yamlStringify(snapshot)}`);

  return {
    data: {
      command: "behavior.snapshot.generate",
      routeCount: snapshot.routes.length,
      written: true,
    },
    exitCode: 0,
    summary: `behavior.snapshot.generate: wrote ${snapshot.routes.length} route(s)`,
  };
}

function diffRoutes(committed: RouteBehavior[], current: RouteBehavior[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const committedByRoute = new Map(committed.map((r) => [r.route, r]));
  const currentByRoute = new Map(current.map((r) => [r.route, r]));

  for (const [route, committedRoute] of committedByRoute) {
    const currentRoute = currentByRoute.get(route);
    if (!currentRoute) {
      diagnostics.push({
        ruleId: "SNAP-01",
        severity: "error",
        message: `Route "${route}" is present in the committed snapshot but missing from the current build.`,
        fixHint:
          "review the diff; if intended, run behavior.snapshot.generate and commit the updated snapshot with your change",
        data: { route, change: "removed" },
      });
      continue;
    }
    const committedJson = JSON.stringify(committedRoute);
    const currentJson = JSON.stringify(currentRoute);
    if (committedJson !== currentJson) {
      const changedFields = (Object.keys(committedRoute) as Array<keyof RouteBehavior>).filter(
        (key) => JSON.stringify(committedRoute[key]) !== JSON.stringify(currentRoute[key]),
      );
      diagnostics.push({
        ruleId: "SNAP-01",
        severity: "error",
        message: `Route "${route}" behavior changed: ${changedFields.join(", ")}.`,
        fixHint:
          "review the diff; if intended, run behavior.snapshot.generate and commit the updated snapshot with your change",
        data: { route, change: "modified", changedFields },
      });
    }
  }

  for (const route of currentByRoute.keys()) {
    if (!committedByRoute.has(route)) {
      diagnostics.push({
        ruleId: "SNAP-01",
        severity: "error",
        message: `Route "${route}" is new in the current build but absent from the committed snapshot.`,
        fixHint:
          "review the diff; if intended, run behavior.snapshot.generate and commit the updated snapshot with your change",
        data: { route, change: "added" },
      });
    }
  }

  return diagnostics;
}

export async function runBehaviorSnapshotValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { appDirectory } = requireAstroSitePaths(context);
  const distClientDir = join(appDirectory, "dist", "client");

  if (!(await fileExists(distClientDir))) {
    return {
      data: {
        command: "behavior.snapshot.validate",
        status: "pass",
        diagnostics: [],
        summary: { error: 0, warning: 0, info: 0 },
      },
      exitCode: 0,
      summary: "behavior.snapshot.validate: skipped — no dist/client (run build first)",
    };
  }

  let committedRaw: string;
  try {
    committedRaw = await readFile(snapshotPath(appDirectory), "utf8");
  } catch {
    return diagnosticsResult("behavior.snapshot.validate", [
      {
        ruleId: "SNAP-02",
        severity: "error",
        file: relative(context.workspaceRoot, snapshotPath(appDirectory)).replace(/\\/g, "/"),
        message: "No committed behavior.snapshot.generated.yaml exists for this app.",
        fixHint:
          "Run: pnpm exec site-kernel run behavior.snapshot.generate --site <app>, then commit the file.",
      },
    ]);
  }

  if (!hasGeneratedMarker(committedRaw)) {
    return diagnosticsResult("behavior.snapshot.validate", [
      {
        ruleId: "SNAP-02",
        severity: "error",
        file: relative(context.workspaceRoot, snapshotPath(appDirectory)).replace(/\\/g, "/"),
        message:
          "Committed behavior.snapshot.generated.yaml does not carry the GENERATED_MARKER (hand-edited?).",
        fixHint: "Never hand-edit this file — regenerate via behavior.snapshot.generate.",
      },
    ]);
  }

  let committed: BehaviorSnapshot;
  try {
    committed = yamlParse(committedRaw);
  } catch {
    return diagnosticsResult("behavior.snapshot.validate", [
      {
        ruleId: "SNAP-02",
        severity: "error",
        file: relative(context.workspaceRoot, snapshotPath(appDirectory)).replace(/\\/g, "/"),
        message: "Committed behavior.snapshot.generated.yaml is not valid JSON.",
        fixHint: "Regenerate via behavior.snapshot.generate.",
      },
    ]);
  }

  const current = await buildBehaviorSnapshot(distClientDir, context.site!.name);
  const diagnostics: Diagnostic[] = [];

  if (JSON.stringify(committed.headers) !== JSON.stringify(current.headers)) {
    diagnostics.push({
      ruleId: "SNAP-01",
      severity: "error",
      message: "_headers rules changed.",
      fixHint:
        "review the diff; if intended, run behavior.snapshot.generate and commit the updated snapshot with your change",
    });
  }
  if (JSON.stringify(committed.redirects) !== JSON.stringify(current.redirects)) {
    diagnostics.push({
      ruleId: "SNAP-01",
      severity: "error",
      message: "_redirects map changed.",
      fixHint:
        "review the diff; if intended, run behavior.snapshot.generate and commit the updated snapshot with your change",
    });
  }
  diagnostics.push(...diffRoutes(committed.routes, current.routes));

  return diagnosticsResult("behavior.snapshot.validate", diagnostics);
}
