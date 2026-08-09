/*
<MODULE_CONTRACT>
<purpose>Internal helpers for app-boilerplate generators — file I/O, template tokens, manifest accessors, retired-surface redirects, SEO clamps.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted helpers from app-boilerplate.ts into app-boilerplate-helpers.ts.</item>
  <item>RFC-0495: reverse redirect direction in buildRetiredSurfaceRedirectBlock (old URLs with country/region → new URLs without). Fix surfaceRoutesFromGenerated to use YAML parsing. Add surfaceEntriesFromGenerated for depth-filtered entries.</item>
  <item>RFC-0515: add buildCosmicPageMetadata — locale-aware brand resolution for cosmic pages. Default locale uses tagline-derived brand; non-default locales use manifest.app to avoid embedding master-locale tagline in non-DE metadata.</item>
  <item>RFC-0589: filter 410 from buildRetiredPageRoutesBlock (only 301 in _redirects). Add buildRetiredTombstoneMiddleware for 410 handling via Astro middleware.</item>
</CHANGE_SUMMARY>
*/

import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as yamlParse } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import type { SystemManifest } from "@warpgogol/werkstatt-site/content";
import { hasGeneratedMarker } from "./generated-marker.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "src", "templates", "app-boilerplate");

export type WarningEntry = {
  file: string;
  message: string;
};

export type GeneratedResult = {
  command: string;
  status: "ok" | "fail";
  generated: string[];
  warnings?: WarningEntry[];
};

export async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function ensureDirectoryFor(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function writeManagedFile(
  absolutePath: string,
  content: string,
  context: KernelRuntimeContext,
  warnings: WarningEntry[],
): Promise<"written" | "unchanged" | "skipped"> {
  const existing = await readFileIfExists(absolutePath);
  if (existing !== null && !hasGeneratedMarker(existing)) {
    warnings.push({
      file: absolutePath,
      message: `Existing file is marked as project-specific (no GENERATED marker) — skipped to preserve custom changes.`,
    });
    return "skipped";
  }

  if (existing === content) {
    return "unchanged";
  }

  if (!context.dryRun) {
    await ensureDirectoryFor(absolutePath);
    await fs.writeFile(absolutePath, content, "utf8");
  }

  return "written";
}

export function normalizeAppPath(appDirectory: string, absolutePath: string): string {
  return path.relative(appDirectory, absolutePath).replace(/\\/g, "/");
}

export function readTemplate(templatePath: string): string {
  return readFileSync(path.join(TEMPLATES_DIR, templatePath), "utf8");
}

export function applyTokens(template: string, tokens: Record<string, string>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key) => tokens[key] ?? "");
}

export function normalizeRoutePath(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

function isWarpgogolSite(manifest: SystemManifest, domain: string): boolean {
  const appId = (manifest as unknown as { app?: string }).app;
  return appId === "warpgogol-com" || domain === "warpgogol.com";
}

function surfaceRoutesFromGenerated(appDirectory: string, defaultLang: string): string[] {
  const surfacePath = path.join(appDirectory, "src", "surface.generated.yaml");
  let parsed: {
    entries?: Array<{ routes?: Record<string, string>; indexable?: boolean; noindex?: boolean }>;
  };
  try {
    parsed = yamlParse(readFileSync(surfacePath, "utf8"));
  } catch {
    return [];
  }
  return (parsed.entries ?? [])
    .filter((entry) => entry.indexable === true && entry.noindex !== true)
    .flatMap((entry) =>
      Object.entries(entry.routes ?? {}).map(([lang, route]) => {
        const normalized = normalizeRoutePath(route);
        return lang === defaultLang ? normalized : `/${lang}${normalized}`;
      }),
    );
}

interface SurfaceEntryWithDepth {
  depth: number;
  routes: Record<string, string>;
}

function surfaceEntriesFromGenerated(appDirectory: string): SurfaceEntryWithDepth[] {
  const surfacePath = path.join(appDirectory, "src", "surface.generated.yaml");
  let parsed: {
    entries?: Array<{
      depth?: number;
      routes?: Record<string, string>;
      indexable?: boolean;
      noindex?: boolean;
    }>;
  };
  try {
    parsed = yamlParse(readFileSync(surfacePath, "utf8"));
  } catch {
    return [];
  }
  return (parsed.entries ?? [])
    .filter(
      (entry) => entry.indexable === true && entry.noindex !== true && entry.depth !== undefined,
    )
    .map((entry) => ({
      depth: entry.depth!,
      routes: entry.routes ?? {},
    }));
}

function manifestRoutes(manifest: SystemManifest): string[] {
  const pages = (manifest as unknown as { pages?: Array<{ routes?: Record<string, string> }> })
    .pages;
  return (pages ?? []).flatMap((page) =>
    Object.values(page.routes ?? {}).map((route) => normalizeRoutePath(route)),
  );
}

export function buildRetiredSurfaceRedirectBlock(
  manifest: SystemManifest,
  appDirectory: string,
  domain: string,
): string {
  if (!isWarpgogolSite(manifest, domain)) return "";

  const defaultLang = getDefaultLanguage(manifest);
  const liveRoutes = new Set([
    ...manifestRoutes(manifest),
    ...surfaceRoutesFromGenerated(appDirectory, defaultLang),
  ]);
  const redirects = new Map<string, string>();
  const addRedirect = (from: string, to: string, status = 301) => {
    const normalizedFrom = normalizeRoutePath(from);
    const normalizedTo = normalizeRoutePath(to);
    if (liveRoutes.has(normalizedFrom)) return;
    if (!liveRoutes.has(normalizedTo)) return;
    redirects.set(normalizedFrom, `${normalizedFrom} ${normalizedTo} ${status}`);
  };

  addRedirect("/digitales-fundament", "/leistungen/digitales-fundament");
  addRedirect("/leistungen/uebersicht", "/leistungen");

  // RFC-0495: reverse redirect direction — old URLs (with country/region) redirect to new URLs (without).
  // Current dataset only covers Germany (country: deu, region: bw).
  const surfaceEntries = surfaceEntriesFromGenerated(appDirectory);
  const trades = new Set<string>();
  for (const entry of surfaceEntries) {
    for (const [lang, route] of Object.entries(entry.routes)) {
      const normalized = normalizeRoutePath(route);
      const langPrefix = lang === defaultLang ? "" : `/${lang}`;
      if (entry.depth === 4) {
        // depth-4: /website/{industry}/{city}/ → old: /website/{industry}/deu/bw/{city}/
        const match = normalized.match(/^\/(website|sait)\/([^/]+)\/([^/]+)\/$/);
        if (!match) continue;
        const [, prefix, industry, city] = match;
        if (!prefix || !industry || !city) continue;
        trades.add(industry);
        addRedirect(
          `${langPrefix}/${prefix}/${industry}/deu/bw/${city}`,
          `${langPrefix}/${prefix}/${industry}/${city}`,
        );
      } else if (entry.depth === 5) {
        // depth-5: /website/{industry}/{city}/{demand}/ → old: /website/{industry}/deu/bw/{city}/{demand}/
        const match = normalized.match(/^\/(website|sait)\/([^/]+)\/([^/]+)\/([^/]+)\/$/);
        if (!match) continue;
        const [, prefix, industry, city, demand] = match;
        if (!prefix || !industry || !city || !demand) continue;
        addRedirect(
          `${langPrefix}/${prefix}/${industry}/deu/bw/${city}/${demand}`,
          `${langPrefix}/${prefix}/${industry}/${city}/${demand}`,
        );
      }
    }
  }

  for (const trade of trades) {
    const hub = normalizeRoutePath(`/website/${trade}`);
    if (liveRoutes.has(hub)) {
      const from = `/website/${trade}/leistung/*`;
      redirects.set(from, `${from} ${hub} 301`);
    }
  }

  if (redirects.size === 0) return "";
  return `\n${[
    "# [RFC-0318/RFC-0495] Retired generated surface redirects — generated from current surface routes.",
    ...[...redirects.values()].sort(),
    "",
  ].join("\n")}`;
}

export function buildRetiredPageRoutesBlock(manifest: SystemManifest): string {
  const retiredRoutes = manifest.retiredRoutes ?? [];
  if (retiredRoutes.length === 0) return "";

  const entries = retiredRoutes
    .filter((entry) => entry.status === 301)
    .map((entry) => {
      const slug = entry.slug.replace(/^\/+|\/+$/g, "");
      const target = entry.to.replace(/^\/+|\/+$/g, "");
      return `/${slug}/* /${target} 301`;
    })
    .sort();

  if (entries.length === 0) return "";
  return `\n${["# [RFC-0487/RFC-0509] Retired page routes — 301 redirects.", ...entries, ""].join(
    "\n",
  )}`;
}

export function buildRetiredTombstoneSlugs(manifest: SystemManifest): string[] {
  const retiredRoutes = manifest.retiredRoutes ?? [];
  return retiredRoutes
    .filter((entry) => entry.status === 410)
    .map((entry) => entry.slug.replace(/^\/+|\/+$/g, ""))
    .filter((slug) => slug.length > 0)
    .sort();
}

export function getSupportedLanguages(manifest: SystemManifest): string[] {
  const supported = manifest.i18n?.supported ? Object.keys(manifest.i18n.supported) : [];
  if (supported.length > 0) return supported;
  if (manifest.i18n?.default) return [manifest.i18n.default];
  throw new Error("[app-boilerplate] system.md i18n.default is required.");
}

export function getDefaultLanguage(manifest: SystemManifest): string {
  if (!manifest.i18n?.default) {
    throw new Error("[app-boilerplate] system.md i18n.default is required.");
  }
  return manifest.i18n.default;
}

export function getBiomeDisplayName(workspaceRoot: string, biomeId: string): string {
  const biomePath = path.join(workspaceRoot, "packages", "ontology", "biomes", `${biomeId}.yaml`);
  try {
    const raw = readFileSync(biomePath, "utf8");
    const match = raw.match(/^displayName:\s*['"]?(.+?)['"]?\s*$/m);
    return match?.[1] ?? biomeId;
  } catch {
    return biomeId;
  }
}

export function getAppNameDisplay(manifest: SystemManifest): string {
  const tagline = manifest.identity?.tagline;
  if (typeof tagline === "string" && tagline.trim().length > 0) {
    return tagline.trim();
  }
  return manifest.app;
}

export function getBiome(manifest: SystemManifest): string {
  return manifest.identity?.biome ?? "nonprofit-trust";
}

export function getDomainFromManifest(manifest: SystemManifest): string | null {
  if (typeof manifest.identity?.domain === "string" && manifest.identity.domain.trim().length > 0) {
    return manifest.identity.domain.trim();
  }
  const heartbeatUrl = manifest.release?.passport?.heartbeatUrl;
  if (typeof heartbeatUrl === "string") {
    try {
      return new URL(heartbeatUrl).host;
    } catch {
      return null;
    }
  }
  const aiUrl = (manifest as unknown as { ai?: { url?: unknown } }).ai;
  if (typeof aiUrl?.url === "string") {
    try {
      return new URL(aiUrl.url).host;
    } catch {
      return null;
    }
  }
  return null;
}

export async function runGeneratedFileSet(
  command: string,
  context: KernelRuntimeContext,
  files: Array<{ absolutePath: string; content: string }>,
): Promise<KernelCommandResult<GeneratedResult>> {
  const warnings: WarningEntry[] = [];
  const generated: string[] = [];
  const appDirectory = requireAstroSitePaths(context).appDirectory;

  for (const file of files) {
    const status = await writeManagedFile(file.absolutePath, file.content, context, warnings);
    if (status === "written") {
      generated.push(normalizeAppPath(appDirectory, file.absolutePath));
    }
  }

  return {
    data: {
      command,
      status: "ok",
      generated,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    summary: `[${command}] ${generated.length} file(s) ${context.dryRun ? "would be written" : "written"}`,
  };
}

/**
 * Extract the "brand head" of a tagline — everything before the first em-dash
 * (` — `, ` – `, or ` - `) — and trim. Long taglines tend to follow the
 * "Brand — descriptive subtitle" pattern; the head is the short brand label
 * suitable for `<title>` tags, the rest is descriptive text for meta tags.
 * Returns null when the tagline is empty/undefined so callers can fall back
 * to a different signal (typically manifest.app).
 */
export function brandHeadFromTagline(tagline: string | undefined): string | null {
  const trimmed = tagline?.trim();
  if (!trimmed) return null;
  const match = trimmed.split(/\s+[—–-]\s+/, 2);
  return match[0]?.trim() || null;
}

/** Clamp a string to N chars without breaking the trailing word. */
function clampToWordBoundary(input: string, limit: number): string {
  if (input.length <= limit) return input;
  const sliced = input.slice(0, limit);
  const lastSpace = sliced.lastIndexOf(" ");
  return lastSpace > 0 ? sliced.slice(0, lastSpace).trimEnd() : sliced;
}

/** SEO <title> budget: 70 chars (semantic.drift.validate). */
export function clampTitle(input: string): string {
  return clampToWordBoundary(input, 70);
}

/** SEO meta description budget: 160 chars (semantic.drift.validate). */
export function clampMeta(input: string): string {
  return clampToWordBoundary(input, 160);
}

/**
 * Build locale-aware cosmic page metadata (title + description) for passport
 * and star-map pages. The default locale uses the tagline-derived brand;
 * non-default locales use `manifest.app` (locale-neutral) to avoid embedding
 * the master-locale tagline in non-DE page metadata (RFC-0515).
 */
export function buildCosmicPageMetadata(
  manifest: SystemManifest,
  lang: string,
): {
  passportTitle: string;
  passportDescription: string;
  starMapTitle: string;
  starMapDescription: string;
} {
  const defaultLang = getDefaultLanguage(manifest);
  const isDefaultLang = lang === defaultLang;
  const brand = isDefaultLang
    ? (brandHeadFromTagline(manifest.identity?.tagline) ?? manifest.app)
    : manifest.app;
  return {
    passportTitle: clampTitle(`Cosmic Passport · ${brand}`),
    passportDescription: clampMeta(
      `Release manifest for ${brand}: signing keys, source provenance, star-map for audits.`,
    ),
    starMapTitle: clampTitle(`Cosmic Star Map · ${brand}`),
    starMapDescription: clampMeta(
      `Section and component overview of ${brand} as a cosmic map for reviewers and auditors.`,
    ),
  };
}

export type { KernelCommandInput };
