/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/public-surface/shared.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not implement command handlers; those live in the seam files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted shared helpers from public-surface.ts into public-surface/shared.ts.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { TextDecoder } from "node:util";
import { parse as parseYaml } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelRuntimeContext,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { hasGeneratedMarker } from "@warpgogol/werkstatt-site/codegen";
import { biomeSchema } from "@warpgogol/werkstatt-site/ontology/schemas";
import { parseMaterialCreditMap } from "@warpgogol/werkstatt-site/share/material-credits";
import { diagnosticsResult } from "../result-helpers.ts";

export const TODAY = "2026-07-06";
export const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;
// RFC-0375: public/ files are Category B (registry-only) — no GENERATED_LINE marker.
export const SECURITY_EXPIRES = "2027-07-01T00:00:00.000Z";
export const DEFAULT_SECURITY_CONTACT = "mailto:hi@warpgogol.com";
export const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export type ManifestLike = Record<string, unknown> & {
  app?: string;
  identity?: { domain?: string; name?: string; brandName?: string };
  i18n?: { default?: string; supported?: Record<string, unknown> };
  credits?: unknown;
};

export interface BiomePaletteColors {
  brand: string;
  surface: string;
}

export interface AppPublicContext {
  appId: string;
  appDirectory: string;
  publicDirectory: string;
  contentDirectory: string;
  manifest: ManifestLike;
  domain: string | undefined;
  siteUrl: string | undefined;
  languages: string[];
  defaultLanguage: string;
  materialCreditNames: string[];
  biomePalette: BiomePaletteColors | undefined;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function normalizePublicRelPath(relPath: string): string {
  return relPath.replace(/\\/g, "/");
}

export function workspaceRel(context: KernelRuntimeContext, absolutePath: string): string {
  return relative(context.workspaceRoot, absolutePath).replace(/\\/g, "/");
}

export function appRel(appDirectory: string, absolutePath: string): string {
  return relative(appDirectory, absolutePath).replace(/\\/g, "/");
}

export function isPublicTextArtifact(relPath: string): boolean {
  const normalized = normalizePublicRelPath(relPath);
  if (normalized.startsWith("textures/")) return false;
  return /\.(?:txt|md|xml|json|webmanifest|svg)$/i.test(normalized);
}

export function stripFencedCode(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

export function sameSiteDefaultPrefixPattern(app: AppPublicContext): RegExp | null {
  if (!app.siteUrl || !app.defaultLanguage) return null;
  const escapedBase = app.siteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedLang = app.defaultLanguage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escapedBase}/${escapedLang}(?:/|\\b)`);
}

export function publicPathFromRelPath(relPath: string): string {
  return `/${normalizePublicRelPath(relPath)}`;
}

export function markdownLinkTargets(text: string): string[] {
  return [...text.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)].map((match) => match[1]);
}

export function sameSitePath(app: AppPublicContext, target: string): string | null {
  try {
    const url = new URL(target, app.siteUrl ?? "https://example.com");
    if (app.siteUrl && url.origin !== new URL(app.siteUrl).origin) return null;
    if (!app.siteUrl && /^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

export function hasSubstantiveMarkdownAfterHeading(lines: string[], start: number): boolean {
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (/^#{1,6}\s+/.test(line)) return true;
    if (!line || line === "---" || line === "-") continue;
    return true;
  }
  return false;
}

export function visibleTextLength(text: string): number {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

export function markdownTwinSourcePath(text: string, app: AppPublicContext): string | null {
  const source = text.match(/^Source:\s+(\S+)/m)?.[1];
  if (!source) return null;
  return sameSitePath(app, source);
}

export function markdownLeadBeforeSource(text: string): string {
  const withoutMarker = text.replace(/^<!--[\s\S]*?-->\s*/, "");
  const afterH1 = withoutMarker.replace(/^#\s+[^\n]+\n+/, "");
  return afterH1.split(/\nSource:\s+\S+/)[0] ?? "";
}

export async function loadPublicContext(context: KernelRuntimeContext): Promise<AppPublicContext> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = await loadSystemManifest(paths.contentDirectory);
  const typedManifest = manifest as unknown as ManifestLike;
  const appId = typedManifest.app ?? context.site?.name;
  if (!appId) {
    throw new Error("Unable to resolve app id from system.md app or kernel context.");
  }

  const domain =
    asString(typedManifest.identity?.domain) ??
    asString(asRecord(typedManifest.identity)?.url)
      ?.replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
  const siteUrl = domain ? `https://${domain}` : undefined;
  const supported = typedManifest.i18n?.supported ? Object.keys(typedManifest.i18n.supported) : [];
  const defaultLanguage = typedManifest.i18n?.default ?? supported[0] ?? "de";
  const creditFiles = await context.io.glob("src/content/**/*.credits.yaml", {
    cwd: paths.appDirectory,
  });
  const rawCreditMap: Record<string, string> = {};
  for (const relPath of creditFiles) {
    const absolutePath = join(paths.appDirectory, relPath);
    rawCreditMap[`/${relPath.replace(/\\/g, "/")}`] = await context.io.readFile(absolutePath);
  }
  const materialCreditNames = parseMaterialCreditMap(rawCreditMap).flatMap((record) =>
    record.credit.parties.map((party) => party.name),
  );

  const biomeId = asString(asRecord(typedManifest.identity)?.biome);
  let biomePalette: BiomePaletteColors | undefined;
  if (biomeId) {
    const biomePath = join(
      context.workspaceRoot,
      "packages",
      "ontology",
      "biomes",
      `${biomeId}.yaml`,
    );
    try {
      const biomeRaw = parseYaml(await readFile(biomePath, "utf-8"));
      const biomeResult = biomeSchema.safeParse(biomeRaw);
      if (biomeResult.success) {
        biomePalette = {
          brand: biomeResult.data.palette.brand,
          surface: biomeResult.data.palette.surface,
        };
      }
    } catch {
      // Biome YAML not found or invalid — fallback to hashColor in icon generator
    }
  }

  return {
    appId,
    appDirectory: paths.appDirectory,
    publicDirectory: paths.publicDirectory,
    contentDirectory: paths.contentDirectory,
    manifest: typedManifest,
    domain,
    siteUrl,
    languages: supported.length > 0 ? supported : [defaultLanguage],
    defaultLanguage,
    materialCreditNames: uniqueSorted(materialCreditNames),
    biomePalette,
  };
}

export async function readTextIfExists(
  context: KernelRuntimeContext,
  absolutePath: string,
): Promise<string | undefined> {
  return (await context.io.exists(absolutePath))
    ? await context.io.readFile(absolutePath)
    : undefined;
}

export async function writeGeneratedTextFile(
  context: KernelRuntimeContext,
  absolutePath: string,
  content: string,
): Promise<"written" | "unchanged" | "skipped"> {
  const existing = await readTextIfExists(context, absolutePath);
  if (existing !== undefined && !hasGeneratedMarker(existing)) {
    return "skipped";
  }
  if (existing === content) {
    return "unchanged";
  }
  await context.io.mkdir(dirname(absolutePath));
  await context.io.writeFile(absolutePath, content);
  return "written";
}

export function diagnostics(
  command: string,
  messages: Array<{
    severity: Diagnostic["severity"];
    message: string;
    file?: string;
    fixHint?: string;
  }>,
): KernelCommandResult<CheckResult> {
  return diagnosticsResult(
    command,
    messages.map((item) => ({
      ruleId: command,
      severity: item.severity,
      message: item.message,
      file: item.file,
      fixHint: item.fixHint,
    })),
  );
}

export function deriveIndexNowKey(appId: string): string {
  return `${appId}-indexnow`;
}

export function extractSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const regex = /<loc>([^<]+)<\/loc>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    urls.push(match[1].trim());
  }
  return urls;
}

export function wildcardRobotsGroupDisallowsAll(robots: string): boolean {
  const lines = robots.split(/\r?\n/).map((line) => line.trim());
  let inWildcardGroup = false;
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const userAgent = line.match(/^User-agent:\s*(.+)$/i)?.[1]?.trim();
    if (userAgent) {
      inWildcardGroup = userAgent === "*";
      continue;
    }
    if (inWildcardGroup && /^Allow:\s*\/\s*$/i.test(line)) {
      return false;
    }
    if (inWildcardGroup && /^Disallow:\s*\/\s*$/i.test(line)) {
      return true;
    }
  }
  return false;
}

export function hasOpenUsage(ai: string): boolean {
  const usage = ai
    .match(/^usage:\s*(.+)$/im)?.[1]
    ?.trim()
    .toLowerCase();
  if (!usage) return false;
  if (usage === "allow" || usage === "yes") return true;
  return ["indexing", "snippet-generation", "summarization", "translation"].some((token) =>
    usage.includes(token),
  );
}

export function hasOpenCommercial(ai: string): boolean {
  const commercial = ai
    .match(/^commercial:\s*(.+)$/im)?.[1]
    ?.trim()
    .toLowerCase();
  return commercial === "allow" || commercial === "yes";
}

export function publicArtifactPaths(
  publicDirectory: string,
  appId: string,
): Array<{ path: string; label: string }> {
  const key = deriveIndexNowKey(appId);
  return [
    { path: join(publicDirectory, "robots.txt"), label: "robots.txt" },
    { path: join(publicDirectory, "ai.txt"), label: "ai.txt" },
    { path: join(publicDirectory, "humans.txt"), label: "humans.txt" },
    { path: join(publicDirectory, "llms.txt"), label: "llms.txt" },
    { path: join(publicDirectory, "llms-full.txt"), label: "llms-full.txt" },
    { path: join(publicDirectory, "sitemap.xml"), label: "sitemap.xml" },
    {
      path: join(publicDirectory, ".well-known", "security.txt"),
      label: ".well-known/security.txt",
    },
    { path: join(publicDirectory, key + ".txt"), label: key + ".txt" },
    { path: join(publicDirectory, "_headers"), label: "_headers" },
  ];
}

export function flattenCreditNames(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenCreditNames);
  const record = asRecord(value);
  if (!record) return [];
  const ownName = asString(record.name) ?? asString(record.title) ?? asString(record.label);
  const nested = Object.values(record).flatMap(flattenCreditNames);
  return [...(ownName ? [ownName] : []), ...nested];
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function buildHumansTxt(app: AppPublicContext): string {
  const siteName =
    asString(app.manifest.identity?.brandName) ??
    asString(app.manifest.identity?.name) ??
    app.domain ??
    app.appId;
  const creditNames = uniqueSorted([
    ...flattenCreditNames(app.manifest.credits),
    ...app.materialCreditNames,
  ]);
  const lines = [
    "",
    "/* TEAM */",
    `Studio: Warpgogol`,
    `Site: ${siteName}`,
    `Contact: ${DEFAULT_SECURITY_CONTACT}`,
    "",
    "/* AUTHORS AND CREDITS */",
    ...(creditNames.length > 0
      ? creditNames.map((name) => `Credit: ${name}`)
      : ["Credits: See /credits/ and public material-credit disclosures."]),
    "",
    "/* SITE */",
    `App: ${app.appId}`,
    `URL: ${app.siteUrl ?? "local"}`,
    `Language: ${app.defaultLanguage}`,
    `Languages: ${app.languages.join(", ")}`,
    `Last update: ${TODAY}`,
    "",
    "/* TECHNOLOGY */",
    "Astro 6, TypeScript, Turborepo, pnpm, @warpgogol/werkstatt/kernel",
    "",
  ];
  return lines.join("\n");
}

export function buildSecurityTxt(app: AppPublicContext): string {
  return [
    `Contact: ${DEFAULT_SECURITY_CONTACT}`,
    `Expires: ${SECURITY_EXPIRES}`,
    `Preferred-Languages: ${app.languages.join(", ")}`,
    ...(app.siteUrl ? [`Canonical: ${app.siteUrl}/.well-known/security.txt`] : []),
    "",
  ].join("\n");
}
