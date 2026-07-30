/***************************************************************
<MODULE_CONTRACT>
<purpose>Open-source page generator: deployment-specific SBOM registry with i18n, SPDX normalization, CycloneDX SBOM, and downloadable artifacts.</purpose>
<non-goals>
  <item>Does not validate the generated output — that lives in @warpgogol/site-kernel-checks.</item>
  <item>Does not render UI — the UI section in @warpgogol/ui handles structured rendering.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0489: New module for open-source page generation with i18n, compact prose, JSON data file, SBOM, SPDX normalization, and downloadable artifacts.</item>
  <item>RFC-0608: remove deploymentMetadata from registry JSON (UI fetches build-identity.json at request time); remove resolveDeploymentMetadata/resolveGitCommitSha/resolveBuildTimestamp; SBOM uses placeholder metadata.</item>
</CHANGE_SUMMARY>
***************************************************************/

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import spdxLicenseList from "spdx-license-list";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { GENERATED_MARKER, hasGeneratedMarker, buildGeneratedHeader } from "./generated-marker.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

type QuantcoDependency = {
  name: string;
  version: string;
  path: string;
  license: string;
  author?: string | undefined;
  homepage?: string | undefined;
  description?: string | undefined;
  additionalText?: string | undefined;
  licenseText?: string | undefined;
};

type DistributionScope =
  "runtime" | "browser-bundle" | "worker-runtime" | "build-only" | "development-only" | "test-only";

type LicenseStatus = "verified" | "normalized" | "unknown";

type ClassifiedDependency = {
  name: string;
  version: string;
  license: string;
  normalizedLicense: { status: LicenseStatus; spdxId: string | null };
  scope: DistributionScope;
  relationship: "direct" | "transitive";
  homepage?: string | undefined;
  author?: string | undefined;
  description?: string | undefined;
  licenseText?: string | undefined;
  additionalText?: string | undefined;
};

type SbomComponent = {
  type: "library";
  name: string;
  version: string;
  purl: string;
  licenses: string[];
  scope: DistributionScope;
  relationship: "direct" | "transitive";
};

// ─── Label schema ────────────────────────────────────────────────────────────

export const openSourceLabelsSchema = z
  .object({
    heading: z.string().min(1),
    leadText: z.string().min(1),
    summaryHeading: z.string().min(1),
    componentsTotalLabel: z.string().min(1),
    directDependenciesLabel: z.string().min(1),
    transitiveDependenciesLabel: z.string().min(1),
    licensesTotalLabel: z.string().min(1),
    componentsWithNoticeLabel: z.string().min(1),
    licenseDistributionHeading: z.string().min(1),
    deploymentMetadataHeading: z.string().min(1),
    deploymentIdLabel: z.string().min(1),
    buildTimestampLabel: z.string().min(1),
    commitShaLabel: z.string().min(1),
    scopeHeading: z.string().min(1),
    scopeIncludedLabel: z.string().min(1),
    scopeIncludedText: z.string().min(1),
    scopeExcludedLabel: z.string().min(1),
    scopeExcludedText: z.string().min(1),
    downloadsHeading: z.string().min(1),
    noticeFileLabel: z.string().min(1),
    licenseFileLabel: z.string().min(1),
    sbomFileLabel: z.string().min(1),
    componentTableHeading: z.string().min(1),
    processNoteText: z.string().min(1),
  })
  .strict();

export type OpenSourceLabels = z.infer<typeof openSourceLabelsSchema>;

// ─── Registry data schema (JSON data file for UI section) ─────────────────────

export const openSourceRegistryDataSchema = z
  .object({
    summary: z.object({
      componentsTotal: z.number(),
      directDependencies: z.number(),
      transitiveDependencies: z.number(),
      licensesTotal: z.number(),
      componentsWithNotice: z.number(),
      licenseDistribution: z.array(
        z.object({
          license: z.string(),
          count: z.number(),
        }),
      ),
    }),
    downloads: z.array(
      z.object({
        label: z.string(),
        url: z.string(),
        filename: z.string(),
      }),
    ),
    components: z.array(
      z.object({
        name: z.string(),
        version: z.string(),
        license: z.string(),
        scope: z.string(),
        relationship: z.string(),
        source: z.string().optional(),
      }),
    ),
  })
  .strict();

export type OpenSourceRegistryData = z.infer<typeof openSourceRegistryDataSchema>;

// ─── Label loading ────────────────────────────────────────────────────────────

function markdownFrontmatterData(markdown: string): Record<string, unknown> | null {
  if (!markdown.startsWith("---")) return null;
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return null;
  const parsed = parseYaml(markdown.slice(3, end));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export async function loadOpenSourceLabels(
  contentDirectory: string,
  lang: string,
  defaultLang: string,
): Promise<OpenSourceLabels | null> {
  const readLabels = async (languageCode: string): Promise<unknown> => {
    const file = path.join(contentDirectory, "site", languageCode, "labels.md");
    const raw = await readFileIfExists(file);
    return raw ? markdownFrontmatterData(raw)?.openSource : undefined;
  };
  const localized = await readLabels(lang);
  const fallback = lang === defaultLang ? localized : await readLabels(defaultLang);
  const parsed = openSourceLabelsSchema.safeParse(localized ?? fallback);
  return parsed.success ? parsed.data : null;
}

// ─── SPDX license normalization ───────────────────────────────────────────────

const LICENSE_ALIASES: Record<string, string> = {
  "Apache 2.0": "Apache-2.0",
  "Apache 2": "Apache-2.0",
  "Apache-2": "Apache-2.0",
  BSD: "BSD-3-Clause",
  "BSD-2": "BSD-2-Clause",
  "MIT License": "MIT",
  "The MIT License": "MIT",
  "ISC License": "ISC",
  "Python-2.0": "PSF-2.0",
  "GNU GPL v3": "GPL-3.0-only",
  "GNU GPL v2": "GPL-2.0-only",
  "GNU LGPL v3": "LGPL-3.0-only",
  "GNU AGPL v3": "AGPL-3.0-only",
  "Mozilla Public License 2.0": "MPL-2.0",
  "Mozilla Public License": "MPL-2.0",
  "CC0 1.0 Universal": "CC0-1.0",
  "CC-BY-4.0": "CC-BY-4.0",
  "CC BY 4.0": "CC-BY-4.0",
  Unlicense: "Unlicense",
  "Public Domain": "Unlicense",
  WTFPL: "WTFPL",
  "BlueOak-1.0.0": "BlueOak-1.0.0",
};

const spdxIds = new Set<string>(Object.keys(spdxLicenseList));

export function normalizeLicense(licenseString: string): {
  status: LicenseStatus;
  spdxId: string | null;
} {
  const trimmed = licenseString.trim();
  if (!trimmed) return { status: "unknown", spdxId: null };

  if (spdxIds.has(trimmed)) {
    return { status: "verified", spdxId: trimmed };
  }

  const aliased = LICENSE_ALIASES[trimmed];
  if (aliased && spdxIds.has(aliased)) {
    return { status: "normalized", spdxId: aliased };
  }

  const lowerTrimmed = trimmed.toLowerCase();
  for (const [alias, spdxId] of Object.entries(LICENSE_ALIASES)) {
    if (alias.toLowerCase() === lowerTrimmed && spdxIds.has(spdxId)) {
      return { status: "normalized", spdxId };
    }
  }

  if (trimmed.includes(" OR ")) {
    const parts = trimmed.split(" OR ").map((p) => p.trim());
    for (const part of parts) {
      if (spdxIds.has(part)) {
        return { status: "verified", spdxId: part };
      }
      const alias = LICENSE_ALIASES[part];
      if (alias && spdxIds.has(alias)) {
        return { status: "normalized", spdxId: alias };
      }
    }
  }

  if (trimmed.includes(" AND ")) {
    const parts = trimmed.split(" AND ").map((p) => p.trim());
    if (parts.every((p) => spdxIds.has(p))) {
      return { status: "verified", spdxId: trimmed };
    }
  }

  return { status: "unknown", spdxId: null };
}

export function detectLicenseConflict(licenses: string[]): boolean {
  const normalized = licenses.map((l) => normalizeLicense(l).spdxId).filter(Boolean);
  const unique = new Set(normalized);
  return unique.size > 1;
}

// ─── Dependency classification ────────────────────────────────────────────────

const BUILD_ONLY_PATTERNS = [
  "@astrojs/check",
  "@astrojs/compiler",
  "@astrojs/markdown-remark",
  "@astrojs/mdx",
  "typescript",
  "ts-node",
  "tsx",
  "esbuild",
  "vite",
  "rollup",
  "postcss",
  "autoprefixer",
  "prettier",
  "eslint",
  "eslint-",
  "stylelint",
  "markdownlint",
  "vitest",
  "@vitest",
  "playwright",
  "@playwright",
  "happy-dom",
  "jsdom",
  "@types/",
  "source-map",
  "acorn",
  "browserslist",
  "caniuse",
  "lightningcss",
  "shiki",
  "rehype",
  "remark",
  "unified",
  "micromark",
  "hast",
  "mdast",
  "unist",
  "vfile",
  "trim-lines",
  "character-",
  "decode-named-character-reference",
  "comma-separated-tokens",
  "space-separated-tokens",
  "property-information",
  "html-url-attributes",
  "bail",
  "is-plain-obj",
  "trough",
  "web-namespaces",
  "zwitch",
  "ccount",
  "escape-string-regexp",
  "markdown-table",
  "longest-streak",
  "starry-night",
  "@shikijs",
  "shiki-",
  "vscode-oniguruma",
  "vscode-textmate",
  "astro-",
  "@astrojs/",
];

const TEST_ONLY_PATTERNS = [
  "vitest",
  "@vitest",
  "playwright",
  "@playwright",
  "happy-dom",
  "jsdom",
  "fast-check",
  "@testing-library",
  "fake-indexeddb",
  "msw",
];

const DEV_ONLY_PATTERNS = [
  "prettier",
  "eslint",
  "eslint-",
  "stylelint",
  "markdownlint",
  "@typescript-eslint",
  "husky",
  "lint-staged",
  "commitlint",
  "@commitlint",
  "standard-version",
  "conventional-changelog",
];

const BROWSER_BUNDLE_PATTERNS = [
  "@fontsource",
  "modern-normalize",
  "normalize.css",
  "sanitize.css",
  "tailwindcss",
  "@tailwindcss",
];

function matchesPatterns(packageName: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.endsWith("/") || pattern.endsWith("-")) {
      if (packageName.startsWith(pattern)) return true;
    } else if (packageName === pattern || packageName.startsWith(pattern + "-")) {
      return true;
    }
  }
  return false;
}

export function classifyPackage(packageName: string, isDependency: boolean): DistributionScope {
  if (!isDependency) {
    if (matchesPatterns(packageName, TEST_ONLY_PATTERNS)) return "test-only";
    if (matchesPatterns(packageName, DEV_ONLY_PATTERNS)) return "development-only";
    return "build-only";
  }

  if (matchesPatterns(packageName, BROWSER_BUNDLE_PATTERNS)) return "browser-bundle";
  if (matchesPatterns(packageName, BUILD_ONLY_PATTERNS)) return "build-only";

  return "runtime";
}

// ─── Deduplication ─────────────────────────────────────────────────────────────

export function deduplicatePackages(deps: ClassifiedDependency[]): ClassifiedDependency[] {
  const map = new Map<string, ClassifiedDependency>();
  for (const dep of deps) {
    const key = `${dep.name}@${dep.version}`;
    const existing = map.get(key);
    if (existing) {
      if (existing.scope !== dep.scope) {
        const priority: Record<DistributionScope, number> = {
          runtime: 0,
          "browser-bundle": 1,
          "worker-runtime": 2,
          "build-only": 3,
          "development-only": 4,
          "test-only": 5,
        };
        if (priority[dep.scope] < priority[existing.scope]) {
          existing.scope = dep.scope;
        }
      }
    } else {
      map.set(key, { ...dep });
    }
  }
  return Array.from(map.values());
}

// ─── CycloneDX SBOM generation ────────────────────────────────────────────────

export function buildCycloneDxSbom(components: SbomComponent[]): string {
  const bom = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [
        {
          vendor: "Warpgogol",
          name: "open-source.generate",
          version: "1.0.0",
        },
      ],
      component: {
        type: "application",
        name: "warpgogol-site",
        version: "dev",
      },
      properties: [],
    },
    components: components.map((c) => ({
      type: c.type,
      name: c.name,
      version: c.version,
      purl: c.purl,
      licenses: c.licenses.map((l) => ({ expression: l })),
      scope: c.scope,
      properties: [
        { name: "warpgogol:relationship", value: c.relationship },
        { name: "warpgogol:distributionScope", value: c.scope },
      ],
    })),
  };
  return JSON.stringify(bom, null, 2);
}

// ─── Template helpers ──────────────────────────────────────────────────────────

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const TEMPLATES_DIR = path.join(__dirname, "..", "src", "templates", "service");

function readTemplate(templatePath: string): string {
  return readFileSync(path.join(TEMPLATES_DIR, templatePath), "utf8");
}

function applyTokens(template: string, tokens: Record<string, string>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key) => tokens[key] ?? "");
}

function toCleanText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

async function writeGeneratedFile(
  filePath: string,
  content: string,
  dryRun: boolean,
): Promise<"unchanged" | "written" | "skipped"> {
  const existing = await readFileIfExists(filePath);
  if (existing === content) return "unchanged";
  if (existing !== null && !hasGeneratedMarker(existing)) return "skipped";
  if (!dryRun) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }
  return "written";
}

// ─── System page guard ────────────────────────────────────────────────────────

function hasSystemPage(manifest: { pages?: Array<{ pageId?: string }> }, pageId: string): boolean {
  return Array.isArray(manifest.pages) && manifest.pages.some((page) => page.pageId === pageId);
}

// ─── Declared output paths (RFC-0599) ─────────────────────────────────────────
// Single source of truth for all output file paths produced by runGenerateOpenSourcePage.
// Used by both the fingerprint cache completeness check and the write section.
// Must match GENERATOR_OWNERSHIP_MAP (site-kernel-checks/src/generator-ownership.ts).

type AstroSitePathsLike = {
  contentPagesDirectory: string;
  contentDirectory: string;
  publicDirectory: string;
};

function buildDeclaredOutputPaths(paths: AstroSitePathsLike, supportedLangs: string[]): string[] {
  return [
    ...supportedLangs.map((lang) => path.join(paths.contentPagesDirectory, lang, "open-source.md")),
    ...supportedLangs.map((lang) =>
      path.join(paths.contentDirectory, "prose", lang, "open-source.md"),
    ),
    ...supportedLangs.map((lang) =>
      path.join(paths.contentDirectory, "data", lang, "open-source-registry.json"),
    ),
    path.join(paths.publicDirectory, "open-source", "THIRD_PARTY_NOTICES.txt"),
    path.join(paths.publicDirectory, "open-source", "THIRD_PARTY_LICENSES.txt"),
    path.join(paths.publicDirectory, "open-source", "sbom.cdx.json"),
  ];
}

// ─── Prose builder (text-only) ────────────────────────────────────────────────

function buildOpenSourceProseMarkdown(lang: string, labels: OpenSourceLabels): string {
  const content = applyTokens(readTemplate("src/content/prose/open-source.md.template"), {
    GENERATED_HEADER: buildGeneratedHeader({
      ownerCommand: "open-source.generate",
      filePath: `src/content/prose/${lang}/open-source.md`,
    }).trimEnd(),
    LANG: lang,
    HEADING: labels.heading,
    LEAD_TEXT: labels.leadText,
    SCOPE_HEADING: labels.scopeHeading,
    SCOPE_INCLUDED_LABEL: labels.scopeIncludedLabel,
    SCOPE_INCLUDED_TEXT: labels.scopeIncludedText,
    SCOPE_EXCLUDED_LABEL: labels.scopeExcludedLabel,
    SCOPE_EXCLUDED_TEXT: labels.scopeExcludedText,
    PROCESS_NOTE_TEXT: labels.processNoteText,
  });
  return `${content.trimEnd()}\n`;
}

// ─── Page manifest builder (two blocks) ───────────────────────────────────────

function buildOpenSourcePageManifest(
  lang: string,
  title: string,
  description: string,
  heading: string,
): string {
  const content = applyTokens(readTemplate("src/content/pages/open-source.md.template"), {
    GENERATED_HEADER: buildGeneratedHeader({
      ownerCommand: "open-source.generate",
      filePath: `src/content/pages/${lang}/open-source.md`,
    }).trimEnd(),
    LANG: lang,
    TITLE: title,
    DESCRIPTION: description,
    HEADING: heading,
  });
  return `${content.trimEnd()}\n`;
}

// ─── JSON data file builder ───────────────────────────────────────────────────

function buildRegistryData(
  deps: ClassifiedDependency[],
  labels: OpenSourceLabels,
  lang: string,
): string {
  const publicDeps = deps.filter(
    (d) => d.scope === "runtime" || d.scope === "browser-bundle" || d.scope === "worker-runtime",
  );

  const directCount = publicDeps.filter((d) => d.relationship === "direct").length;
  const transitiveCount = publicDeps.filter((d) => d.relationship === "transitive").length;

  const licenseMap = new Map<string, number>();
  for (const dep of publicDeps) {
    const licenseKey = dep.normalizedLicense.spdxId ?? dep.license ?? "UNKNOWN";
    licenseMap.set(licenseKey, (licenseMap.get(licenseKey) ?? 0) + 1);
  }
  const licenseDistribution = Array.from(licenseMap.entries())
    .map(([license, count]) => ({ license, count }))
    .sort((a, b) => b.count - a.count);

  const noticeCount = publicDeps.filter((d) => d.additionalText || d.licenseText).length;

  const data: OpenSourceRegistryData = {
    summary: {
      componentsTotal: publicDeps.length,
      directDependencies: directCount,
      transitiveDependencies: transitiveCount,
      licensesTotal: licenseMap.size,
      componentsWithNotice: noticeCount,
      licenseDistribution,
    },
    downloads: [
      {
        label: labels.noticeFileLabel,
        url: "/open-source/THIRD_PARTY_NOTICES.txt",
        filename: "THIRD_PARTY_NOTICES.txt",
      },
      {
        label: labels.licenseFileLabel,
        url: "/open-source/THIRD_PARTY_LICENSES.txt",
        filename: "THIRD_PARTY_LICENSES.txt",
      },
      {
        label: labels.sbomFileLabel,
        url: "/open-source/sbom.cdx.json",
        filename: "sbom.cdx.json",
      },
    ],
    components: publicDeps
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({
        name: d.name,
        version: d.version,
        license: d.normalizedLicense.spdxId ?? d.license ?? "UNKNOWN",
        scope: d.scope,
        relationship: d.relationship,
        source: d.homepage,
      })),
  };

  const header = buildGeneratedHeader({
    ownerCommand: "open-source.generate",
    filePath: `src/content/data/${lang}/open-source-registry.json`,
  });

  return `${header}\n${JSON.stringify(data, null, 2)}\n`;
}

// ─── Downloadable artifacts ────────────────────────────────────────────────────

function buildThirdPartyNotices(deps: ClassifiedDependency[]): string {
  const lines: string[] = [];
  lines.push("THIRD-PARTY NOTICES");
  lines.push("===================");
  lines.push("");

  const sorted = [...deps].sort((a, b) => a.name.localeCompare(b.name));
  for (const dep of sorted) {
    lines.push(`${dep.name}@${dep.version}`);
    if (dep.author) lines.push(`Author: ${dep.author}`);
    if (dep.homepage) lines.push(`Homepage: ${dep.homepage}`);
    const license = dep.normalizedLicense.spdxId ?? dep.license ?? "UNKNOWN";
    lines.push(`License: ${license}`);
    if (dep.additionalText) {
      lines.push("");
      lines.push(dep.additionalText);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function buildThirdPartyLicenses(deps: ClassifiedDependency[]): string {
  const lines: string[] = [];
  lines.push("THIRD-PARTY LICENSE TEXTS");
  lines.push("==========================");
  lines.push("");

  const licenseTexts = new Map<string, string>();
  const sorted = [...deps].sort((a, b) => a.name.localeCompare(b.name));
  for (const dep of sorted) {
    const licenseKey = dep.normalizedLicense.spdxId ?? dep.license ?? "UNKNOWN";
    if (dep.licenseText && !licenseTexts.has(licenseKey)) {
      licenseTexts.set(licenseKey, dep.licenseText);
    }
  }

  for (const [licenseKey, text] of licenseTexts) {
    lines.push(`## ${licenseKey}`);
    lines.push("");
    lines.push(text);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function runGenerateOpenSourcePage(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ dependencyCount: number }>> {
  const paths = requireAstroSitePaths(context);
  const appDirectory = paths.appDirectory;
  const require = createRequire(import.meta.url);
  const pnpmLicensesBinPath = require.resolve("@quantco/pnpm-licenses/dist/index.mjs");
  const pnpmExecutable = "pnpm";
  const pnpmExecPath = process.env.npm_execpath;
  const commandTimeoutMs = 120_000;
  const cacheDir = path.join(appDirectory, ".cache");
  const fingerprintCacheFile = path.join(cacheDir, "open-source.fingerprint");

  // Load system manifest and guard with hasSystemPage
  const { loadI18nConfigSync, loadSystemManifestSync } =
    await import("@warpgogol/site-kernel-content");
  const system = loadSystemManifestSync(paths.contentDirectory).manifest;

  if (!hasSystemPage(system, "openSource")) {
    return {
      data: { dependencyCount: 0 },
      summary: "[open-source] skipped: no pageId: openSource in system.md",
    };
  }

  const i18n = loadI18nConfigSync(paths.appDirectory);
  if (!i18n) {
    return {
      data: { dependencyCount: 0 },
      exitCode: 1,
      summary: "[open-source] failed: missing i18n config in src/content/system.md",
    };
  }

  const defaultLang = i18n.defaultLanguageCode;
  const supportedLangs = Object.keys(i18n.config.supported);

  // Fingerprint inputs: package.json, lockfiles, system.md, labels.md
  const dependencyFingerprintFiles = [
    path.join(appDirectory, "package.json"),
    path.join(appDirectory, "pnpm-lock.yaml"),
    path.join(context.workspaceRoot, "pnpm-lock.yaml"),
    path.join(paths.contentDirectory, "system.md"),
  ];
  for (const lang of supportedLangs) {
    dependencyFingerprintFiles.push(path.join(paths.contentDirectory, "site", lang, "labels.md"));
  }

  const hash = createHash("sha256");
  for (const filePath of dependencyFingerprintFiles) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      hash.update(path.basename(filePath));
      hash.update("\n");
      hash.update(raw);
      hash.update("\n");
    } catch {
      continue;
    }
  }
  const dependencyFingerprint = hash.digest("hex");

  // Check fingerprint cache
  // RFC-0599: check ALL declared output paths, not just the content page.
  const declaredOutputPaths = buildDeclaredOutputPaths(paths, supportedLangs);
  try {
    const existingFingerprint = await fs.readFile(fingerprintCacheFile, "utf8");
    const fingerprintMatches = toCleanText(existingFingerprint) === dependencyFingerprint;
    if (fingerprintMatches) {
      const allOutputsExist = await Promise.all(
        declaredOutputPaths.map((p) =>
          fs
            .access(p)
            .then(() => true)
            .catch(() => false),
        ),
      );
      if (allOutputsExist.every(Boolean)) {
        return {
          data: { dependencyCount: 0 },
          summary: "[open-source] up to date",
        };
      }
      context.logger.info(
        "[open-source] fingerprint matches, but output file(s) missing; regenerating",
      );
    }
  } catch {
    context.logger.info("[open-source] cache miss; regenerating");
  }

  // Run pnpm licenses and @quantco/pnpm-licenses
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "warpgogol-open-source-"));
  const pnpmLicensesJsonPath = path.join(tmpDir, "pnpm-licenses.json");
  const listJsonPath = path.join(tmpDir, "dependencies.json");
  const disclaimerPath = path.join(tmpDir, "third-party-licenses.txt");

  const runPackageManagerCommand = (args: string[]) => {
    if (pnpmExecPath) {
      return execFileSync(process.execPath, [pnpmExecPath, ...args], {
        cwd: appDirectory,
        encoding: "utf8",
        timeout: commandTimeoutMs,
      });
    }
    return execFileSync(pnpmExecutable, args, {
      cwd: appDirectory,
      encoding: "utf8",
      timeout: commandTimeoutMs,
    });
  };

  const runPnpmLicenses = (args: string[]) => {
    return execFileSync(process.execPath, [pnpmLicensesBinPath, ...args], {
      cwd: appDirectory,
      encoding: "utf8",
      timeout: commandTimeoutMs,
    });
  };

  try {
    const pnpmLicensesJson = runPackageManagerCommand(["licenses", "list", "--prod", "--json"]);
    await fs.writeFile(pnpmLicensesJsonPath, pnpmLicensesJson, "utf8");

    runPnpmLicenses([
      "list",
      "--json-input-file",
      pnpmLicensesJsonPath,
      "--output-file",
      listJsonPath,
    ]);
    runPnpmLicenses([
      "generate-disclaimer",
      "--json-input-file",
      pnpmLicensesJsonPath,
      "--output-file",
      disclaimerPath,
    ]);

    const listRaw = await fs.readFile(listJsonPath, "utf8");
    const deps = JSON.parse(listRaw) as QuantcoDependency[];

    // Classify, normalize, deduplicate
    const classified: ClassifiedDependency[] = deps.map((dep) => ({
      name: dep.name,
      version: dep.version,
      license: dep.license,
      normalizedLicense: normalizeLicense(dep.license),
      scope: classifyPackage(dep.name, true),
      relationship: "direct",
      homepage: dep.homepage,
      author: dep.author,
      description: dep.description,
      licenseText: dep.licenseText,
      additionalText: dep.additionalText,
    }));

    const deduplicated = deduplicatePackages(classified);
    const publicDeps = deduplicated.filter(
      (d) => d.scope === "runtime" || d.scope === "browser-bundle" || d.scope === "worker-runtime",
    );

    // Generate downloadable artifacts
    const noticesContent = buildThirdPartyNotices(publicDeps);
    const licensesContent = buildThirdPartyLicenses(publicDeps);

    const sbomComponents: SbomComponent[] = publicDeps.map((d) => ({
      type: "library" as const,
      name: d.name,
      version: d.version,
      purl: `pkg:npm/${d.name}@${d.version}`,
      licenses: [d.normalizedLicense.spdxId ?? d.license ?? "UNKNOWN"],
      scope: d.scope,
      relationship: d.relationship,
    }));
    const sbomContent = buildCycloneDxSbom(sbomComponents);

    if (!context.dryRun) {
      const artifactsDir = path.join(paths.publicDirectory, "open-source");
      await fs.mkdir(artifactsDir, { recursive: true });
      await fs.writeFile(
        path.join(artifactsDir, "THIRD_PARTY_NOTICES.txt"),
        noticesContent,
        "utf8",
      );
      await fs.writeFile(
        path.join(artifactsDir, "THIRD_PARTY_LICENSES.txt"),
        licensesContent,
        "utf8",
      );
      await fs.writeFile(path.join(artifactsDir, "sbom.cdx.json"), sbomContent, "utf8");
    }

    // Generate per-language files
    for (const lang of supportedLangs) {
      const labels = await loadOpenSourceLabels(paths.contentDirectory, lang, defaultLang);
      if (!labels) {
        return {
          data: { dependencyCount: publicDeps.length },
          exitCode: 1,
          summary: `[open-source] failed: missing openSource labels for ${lang}`,
        };
      }

      const proseMarkdown = buildOpenSourceProseMarkdown(lang, labels);
      const pageManifest = buildOpenSourcePageManifest(
        lang,
        labels.heading,
        labels.leadText,
        labels.heading,
      );
      const registryJson = buildRegistryData(deduplicated, labels, lang);

      if (!context.dryRun) {
        const pagePath = path.join(paths.contentPagesDirectory, lang, "open-source.md");
        const prosePath = path.join(paths.contentDirectory, "prose", lang, "open-source.md");
        const dataPath = path.join(
          paths.contentDirectory,
          "data",
          lang,
          "open-source-registry.json",
        );

        await writeGeneratedFile(pagePath, pageManifest, false);
        await writeGeneratedFile(prosePath, proseMarkdown, false);
        await writeGeneratedFile(dataPath, registryJson, false);
      }
    }

    if (!context.dryRun) {
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(fingerprintCacheFile, `${dependencyFingerprint}\n`, "utf8");
    }

    return {
      data: { dependencyCount: publicDeps.length },
      summary: context.dryRun
        ? `[open-source] dry-run complete (${publicDeps.length} public dependencies)`
        : `[open-source] generated (${publicDeps.length} public dependencies, ${supportedLangs.length} languages)`,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
