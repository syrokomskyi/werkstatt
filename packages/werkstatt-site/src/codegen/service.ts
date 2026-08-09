/* 
<MODULE_CONTRACT>
<purpose>Facilitates the generation and management of icon components, open-source documentation, and material credit documentation.</purpose>
<non-goals>
  <item>Do not handle raw JSON parsing or validation of icon data.</item>
  <item>Do not manage application configuration or transport orchestration.</item>
  <item>Do not perform any UI rendering or component lifecycle management.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted inline multi-line templates into separate template files under templates/service/ per RFC-0078.</item>
</CHANGE_SUMMARY>
*/

import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import {
  parseMaterialCreditMap,
  type MaterialCreditRecord,
} from "@warpgogol/werkstatt-site/share/material-credits";
import {
  formatMaterialCreditLine,
  labelForMaterialCreditRole,
  labelForSourceType,
  labelForStatus,
  labelForUsageBasis,
  materialCreditLabelsSchema,
  materialTargetKey,
  type MaterialCreditLabels,
} from "@warpgogol/werkstatt-site/share/schemas/material-credit";
import { hasGeneratedMarker, buildGeneratedHeader } from "./generated-marker.ts";
import { collectFiles as collectFilesShared } from "@warpgogol/werkstatt-site/share/fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "templates", "service");

function readTemplate(templatePath: string): string {
  return readFileSync(path.join(TEMPLATES_DIR, templatePath), "utf8");
}

function applyTokens(template: string, tokens: Record<string, string>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key) => tokens[key] ?? "");
}

async function collectFilesNamed(
  dir: string,
  predicate: (name: string) => boolean,
): Promise<string[]> {
  const all = await collectFilesShared(dir, { ignore: () => false });
  return all.filter((full) => predicate(path.basename(full)));
}

/**
 * Converts a string to kebab-case (lowercase with hyphens).
 * Handles PascalCase and camelCase by inserting hyphens before uppercase letters.
 */
function _toKebabCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

/**
 * Infers a kebab-case component name from a JSON icon filename.
 * Example: "system-regular-42-copy-hover.json" → "copy-icon"
 */
function inferComponentNameFromJsonFilename(filename: string): string {
  const stem = filename.replace(/\.json$/i, "");
  const tokens = stem.split("-").filter(Boolean);
  const numericIndex = tokens.findIndex((token) => /^\d+$/.test(token));
  const nameStartIndex = numericIndex >= 0 ? numericIndex + 1 : 0;
  const stopWords = new Set(["hover", "pinch", "flutter", "hit", "slide", "zoom", "nodding"]);
  const stopWordIndex = tokens.findIndex(
    (token, index) => index >= nameStartIndex && stopWords.has(token),
  );
  const nameTokens =
    stopWordIndex >= 0 ? tokens.slice(nameStartIndex, stopWordIndex) : tokens.slice(nameStartIndex);
  const name = nameTokens.join("-");
  return name.endsWith("-icon") ? name : `${name}-icon`;
}

async function walkJsonFiles(dir: string): Promise<string[]> {
  return collectFilesShared(dir, { extensions: [".json"], ignore: () => false });
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function _writeIfChanged(
  filePath: string,
  content: string,
  dryRun: boolean,
): Promise<"unchanged" | "written"> {
  const existing = await readFileIfExists(filePath);
  if (existing === content) {
    return "unchanged";
  }

  if (!dryRun) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }

  return "written";
}

async function writeGeneratedFile(
  filePath: string,
  content: string,
  dryRun: boolean,
): Promise<"unchanged" | "written" | "skipped"> {
  const existing = await readFileIfExists(filePath);
  if (existing === content) {
    return "unchanged";
  }
  if (existing !== null && !hasGeneratedMarker(existing)) {
    return "skipped";
  }
  if (!dryRun) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }
  return "written";
}

async function generateIndexFile(
  dir: string,
  dryRun: boolean,
  indexStats?: { skipped: number; written: number },
): Promise<number> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const hasFirstCharFolders = entries.some(
    (entry) => entry.isDirectory() && /^[a-z]$/.test(entry.name),
  );
  if (!hasFirstCharFolders) return 0;

  const indexPath = path.join(dir, "index.ts");

  const exports: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z]$/.test(entry.name)) continue;
    const subDir = path.join(dir, entry.name);
    const subEntries = await fs.readdir(subDir, { withFileTypes: true });

    for (const subEntry of subEntries) {
      if (subEntry.isFile() && subEntry.name.endsWith(".astro")) {
        const fileName = subEntry.name;
        const kebabName = fileName.replace(".astro", "");
        // Convert kebab-case to camelCase for valid JS identifier
        const componentName = kebabName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        exports.push(`export { default as ${componentName} } from './${entry.name}/${fileName}';`);
      }
    }
  }

  if (exports.length === 0) {
    return 0;
  }

  const content = applyTokens(readTemplate("src/components/icons/index.ts.template"), {
    GENERATED_HEADER: buildGeneratedHeader({
      ownerCommand: "icons.generate",
      filePath: "src/components/icons/index.ts",
    }).trimEnd(),
    EXPORTS_LIST: exports.join("\n"),
  });
  const status = await writeGeneratedFile(indexPath, content, dryRun);
  if (status === "written" && indexStats) indexStats.written += 1;
  if (status === "skipped" && indexStats) indexStats.skipped += 1;
  return status === "written" ? 1 : 0;
}

async function generateIndexFilesRecursively(
  dir: string,
  dryRun: boolean,
  indexStats: { skipped: number; written: number },
): Promise<number> {
  let writes = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      writes += await generateIndexFilesRecursively(path.join(dir, entry.name), dryRun, indexStats);
    }
  }
  writes += await generateIndexFile(dir, dryRun, indexStats);
  return writes;
}

function _toCleanText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function hasSystemPage(manifest: { pages?: Array<{ pageId?: string }> }, pageId: string): boolean {
  return Array.isArray(manifest.pages) && manifest.pages.some((page) => page.pageId === pageId);
}

export async function runGenerateIcons(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<
  KernelCommandResult<{ writtenFiles: number; skippedExists: number; indexSkipped: number }>
> {
  const paths = requireAstroSitePaths(context);

  let jsonFiles: string[];
  try {
    jsonFiles = await walkJsonFiles(paths.iconsAssetsDirectory);
  } catch {
    jsonFiles = [];
  }

  if (jsonFiles.length === 0) {
    // Apps that consume icons only from @warpgogol/werkstatt-site/ui have no app-level icon
    // assets — this is the expected case post-RFC-0023. Silently skip.
    return {
      data: { writtenFiles: 0, skippedExists: 0, indexSkipped: 0 },
      summary: "[icons.generate] no app-level icons (using @warpgogol/werkstatt-site/ui)",
    };
  }

  let writtenFiles = 0;
  let skippedExists = 0;
  await fs.mkdir(paths.generatedIconsDirectory, { recursive: true });

  for (const jsonAbsPath of jsonFiles) {
    const jsonRelFromAssetsRoot = path
      .relative(paths.iconsAssetsDirectory, jsonAbsPath)
      .replace(/\\/g, "/");
    const componentName = inferComponentNameFromJsonFilename(path.basename(jsonAbsPath));
    const sourceDir = path.dirname(jsonRelFromAssetsRoot);
    const firstLetter = componentName.charAt(0).toLowerCase();
    const componentDir = path.join(paths.generatedIconsDirectory, sourceDir, firstLetter);
    const componentPath = path.join(componentDir, `${componentName}.astro`);

    const lordIconBaseImport = path
      .relative(
        componentDir,
        path.join(paths.srcDirectory, "components", "icons", "lord-icon-base.astro"),
      )
      .replace(/\\/g, "/");
    const lordIconBaseSpecifier = lordIconBaseImport.startsWith(".")
      ? lordIconBaseImport
      : `./${lordIconBaseImport}`;
    const jsonSpecifier = `@assets/icons/${jsonRelFromAssetsRoot}`;
    const content = applyTokens(
      readTemplate("src/components/icons/lord-icon-wrapper.astro.template"),
      {
        GENERATED_HEADER: buildGeneratedHeader({
          ownerCommand: "icons.generate",
          filePath: "src/components/icons/lord-icon-wrapper.astro",
        }).trimEnd(),
        LORD_ICON_BASE_SPECIFIER: lordIconBaseSpecifier,
        JSON_SPECIFIER: jsonSpecifier,
      },
    );
    const status = await writeGeneratedFile(componentPath, content, context.dryRun);
    if (status === "written") {
      writtenFiles += 1;
    } else if (status === "skipped") {
      skippedExists += 1;
    }
  }

  const indexStats = { skipped: 0, written: 0 };
  writtenFiles += await generateIndexFilesRecursively(
    paths.generatedIconsDirectory,
    context.dryRun,
    indexStats,
  );

  const summaryParts: string[] = [];
  if (context.dryRun) {
    summaryParts.push(`${writtenFiles} would write`);
    if (skippedExists > 0) {
      summaryParts.push(`${skippedExists} icons would skip (already exist)`);
    }
    if (indexStats.skipped > 0) {
      summaryParts.push(`${indexStats.skipped} index.ts would skip (already exist)`);
    }
  } else {
    summaryParts.push(`${writtenFiles} files updated`);
    if (skippedExists > 0) {
      summaryParts.push(`${skippedExists} icons skipped (already exist)`);
    }
    if (indexStats.skipped > 0) {
      summaryParts.push(`${indexStats.skipped} index.ts skipped (already exist)`);
    }
  }

  return {
    data: { writtenFiles, skippedExists, indexSkipped: indexStats.skipped },
    summary: `[icons.generate] ${summaryParts.join(", ")}`,
  };
}

export async function runCleanIcons(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ target: string }>> {
  const paths = requireAstroSitePaths(context);
  if (!context.dryRun) {
    await fs.rm(paths.generatedIconsDirectory, { recursive: true, force: true });
  }

  return {
    data: { target: paths.generatedIconsDirectory },
    summary: context.dryRun
      ? `[icons.clean] dry-run: would delete ${paths.generatedIconsDirectory}`
      : `Successfully deleted ${paths.generatedIconsDirectory}`,
  };
}

function markdownEscape(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function markdownFrontmatterData(markdown: string): Record<string, unknown> | null {
  if (!markdown.startsWith("---")) return null;
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return null;
  const parsed = parseYaml(markdown.slice(3, end));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

export async function loadMaterialCreditLabels(
  contentDirectory: string,
  lang: string,
  defaultLang: string,
): Promise<MaterialCreditLabels | null> {
  const readLabels = async (languageCode: string): Promise<unknown> => {
    const file = path.join(contentDirectory, "site", languageCode, "labels.md");
    const raw = await readFileIfExists(file);
    return raw ? markdownFrontmatterData(raw)?.materialCredits : undefined;
  };
  const localized = await readLabels(lang);
  const fallback = lang === defaultLang ? localized : await readLabels(defaultLang);
  const parsed = materialCreditLabelsSchema.safeParse(localized ?? fallback);
  return parsed.success ? parsed.data : null;
}

export function renderMaterialCreditProse(
  records: MaterialCreditRecord[],
  lang: string,
  labels: MaterialCreditLabels,
  usageLocations?: Map<string, string[]>,
): string {
  const visibleRecords = [...records].sort((a, b) => {
    const left = materialTargetKey(a.credit.target, a.credit.target.lang ?? a.lang);
    const right = materialTargetKey(b.credit.target, b.credit.target.lang ?? b.lang);
    return left.localeCompare(right);
  });

  const body =
    visibleRecords.length === 0
      ? labels.emptyMessage
      : visibleRecords
          .map((record) => {
            const credit = record.credit;
            const anchor = credit.id;
            const title = markdownEscape(credit.title ?? credit.target.id);
            const line = markdownEscape(formatMaterialCreditLine(credit, labels));
            const partyLines = credit.parties
              .filter((party) => party.role !== "sourceMaterial")
              .map((party) => {
                const role = markdownEscape(labelForMaterialCreditRole(party.role, labels));
                const name = party.url
                  ? `[${markdownEscape(party.name)}](${party.url})`
                  : markdownEscape(party.name);
                const kind = party.kind === "Person" ? "" : ` (${markdownEscape(party.kind)})`;
                const note = party.note ? ` — ${markdownEscape(party.note)}` : "";
                return `- ${role}: ${name}${kind}${note}`;
              })
              .join("\n");
            const license = credit.license.url
              ? `[${markdownEscape(credit.license.label)}](${credit.license.url})`
              : markdownEscape(credit.license.label);
            const rights = credit.license.copyrightNotice
              ? `\n- ${labels.copyrightLabel}: ${markdownEscape(credit.license.copyrightNotice)}`
              : "";
            const sourceTypeLine = `- ${labels.sourceType}: ${markdownEscape(labelForSourceType(credit.sourceType, labels))}`;
            const statusLine = credit.status
              ? `\n- ${markdownEscape(labelForStatus(credit.status, labels))}`
              : "";
            const usageBasisLine = credit.usageBasis
              ? `\n- ${markdownEscape(labelForUsageBasis(credit.usageBasis.type, labels))}${credit.usageBasis.note ? ` — ${markdownEscape(credit.usageBasis.note)}` : ""}`
              : "";
            const aiUsageLines = credit.aiUsage
              ? `\n- ${markdownEscape(credit.aiUsage.kind === "ai-generated" ? labels.aiUsageLabels.aiGenerated : labels.aiUsageLabels.aiAssisted)}\n- ${labels.aiUsageLabels.humanContribution}: ${markdownEscape(credit.aiUsage.humanContribution)}\n- ${markdownEscape(credit.aiUsage.copyrightClaimed ? labels.aiUsageLabels.copyrightClaimed : labels.aiUsageLabels.copyrightNotClaimed)}`
              : "";
            const locations = usageLocations?.get(credit.id);
            const usageLocationsLine =
              locations && locations.length > 0
                ? `\n- ${labels.usedOnLabel}: ${locations.map((l) => markdownEscape(l)).join(", ")}`
                : "";
            return [
              `## ${title} {#${anchor}`,
              "",
              `**${labels.summaryLabel}:** ${line}`,
              "",
              partyLines,
              sourceTypeLine,
              `- ${labels.license}: ${license}${rights}${statusLine}${usageBasisLine}${aiUsageLines}${usageLocationsLine}`,
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n");

  return applyTokens(readTemplate("src/content/prose/credits.md.template"), {
    GENERATED_HEADER: buildGeneratedHeader({
      ownerCommand: "material.credits.generate",
      filePath: "src/content/prose/credits.md",
    }).trimEnd(),
    LANG: lang,
    TITLE: labels.pageTitle,
    DESCRIPTION: labels.pageDescription,
    CREDIT_LIST: body,
    COPYRIGHT_EXPLANATION: labels.copyrightExplanation,
  });
}

/**
 * RFC-0047 credits: pick one credit record per material target for a given
 * language. A target may have sidecars in several languages (e.g. a default
 * `de` sidecar plus a localized `uk` override sharing the same `target.id`).
 * Resolution priority is: exact language match → default language →
 * language-agnostic sidecar. This guarantees the generated per-language
 * `credits.md` never lists the same target twice.
 */
export function selectLocalizedCreditRecords(
  records: MaterialCreditRecord[],
  lang: string,
  defaultLang: string,
): MaterialCreditRecord[] {
  const resolveLang = (record: MaterialCreditRecord): string | undefined =>
    record.credit.target.lang ?? record.lang;
  const identityKey = (record: MaterialCreditRecord): string => {
    const target = record.credit.target;
    return [target.kind, target.domain ?? "", target.id].join(":");
  };
  const priorityFor = (recordLang: string | undefined): number => {
    if (recordLang === lang) return 0;
    if (recordLang === defaultLang) return 1;
    if (!recordLang) return 2;
    return -1;
  };

  const bestByTarget = new Map<string, { record: MaterialCreditRecord; priority: number }>();
  for (const record of records) {
    const priority = priorityFor(resolveLang(record));
    if (priority < 0) continue;
    const key = identityKey(record);
    const current = bestByTarget.get(key);
    if (!current || priority < current.priority) {
      bestByTarget.set(key, { record, priority });
    }
  }
  return [...bestByTarget.values()].map((entry) => entry.record);
}

export async function discoverUsageLocations(
  contentDirectory: string,
  lang: string,
  records: MaterialCreditRecord[],
): Promise<Map<string, string[]>> {
  const locations = new Map<string, string[]>();
  const pagesDir = path.join(contentDirectory, "pages", lang);
  let pageFiles: string[];
  try {
    pageFiles = await collectFilesShared(pagesDir, {
      ignore: (full) => !full.endsWith(".md"),
    });
  } catch {
    return locations;
  }
  for (const record of records) {
    const targetId = record.credit.target.id;
    const _targetDomain = record.credit.target.domain ?? "pages";
    const found: string[] = [];
    for (const pageFile of pageFiles) {
      const rel = path.relative(pagesDir, pageFile).replace(/\\/g, "/").replace(/\.md$/, "");
      try {
        const raw = await fs.readFile(pageFile, "utf8");
        if (raw.includes(targetId)) {
          found.push(rel);
        }
      } catch {
        // skip unreadable
      }
    }
    // Also check prose references
    const proseDir = path.join(contentDirectory, "prose", lang);
    try {
      const proseFiles = await collectFilesShared(proseDir, {
        ignore: (full) => !full.endsWith(".md"),
      });
      for (const proseFile of proseFiles) {
        const rel = path.relative(proseDir, proseFile).replace(/\\/g, "/").replace(/\.md$/, "");
        try {
          const raw = await fs.readFile(proseFile, "utf8");
          if (raw.includes(targetId)) {
            found.push(`prose/${rel}`);
          }
        } catch {
          // skip
        }
      }
    } catch {
      // no prose dir
    }
    // Deduplicate and store under credit.id
    if (found.length > 0) {
      locations.set(record.credit.id, [...new Set(found)]);
    }
  }
  return locations;
}

export async function runGenerateMaterialCreditsPage(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<
  KernelCommandResult<{ writtenFiles: number; creditCount: number; diagnostics?: string[] }>
> {
  const paths = requireAstroSitePaths(context);
  const { loadI18nConfigSync, loadSystemManifestSync } =
    await import("@warpgogol/werkstatt-site/content");
  const i18n = loadI18nConfigSync(paths.appDirectory);
  const system = loadSystemManifestSync(paths.contentDirectory).manifest;

  if (!hasSystemPage(system, "credits")) {
    return {
      data: { writtenFiles: 0, creditCount: 0 },
      summary: "[material.credits] skipped: no pageId: credits in system.md",
    };
  }

  if (!i18n) {
    return {
      data: {
        writtenFiles: 0,
        creditCount: 0,
        diagnostics: ["[ERROR] material.credits.generate requires i18n in src/content/system.md"],
      },
      exitCode: 1,
      summary: "[material.credits] failed: missing i18n config",
    };
  }

  const creditFiles = await collectFilesNamed(paths.contentDirectory, (name) =>
    name.endsWith(".credits.yaml"),
  );
  const rawMap: Record<string, string> = {};
  for (const file of creditFiles) {
    const normalized = `/${path.relative(paths.appDirectory, file).replace(/\\/g, "/")}`;
    rawMap[normalized] = await fs.readFile(file, "utf8");
  }
  const records = parseMaterialCreditMap(rawMap);
  const defaultLang = i18n.defaultLanguageCode;
  let writtenFiles = 0;

  for (const lang of Object.keys(i18n.config.supported)) {
    const labels = await loadMaterialCreditLabels(paths.contentDirectory, lang, defaultLang);
    if (!labels) {
      return {
        data: {
          writtenFiles,
          creditCount: records.length,
          diagnostics: [
            `[ERROR] material.credits.generate requires materialCredits labels in src/content/site/${lang}/labels.md or default language labels.`,
          ],
        },
        exitCode: 1,
        summary: `[material.credits] failed: missing materialCredits labels for ${lang}`,
      };
    }
    const localizedRecords = selectLocalizedCreditRecords(records, lang, defaultLang);
    const usageLocations = await discoverUsageLocations(
      paths.contentDirectory,
      lang,
      localizedRecords,
    );
    const pageManifest = applyTokens(readTemplate("src/content/pages/credits.md.template"), {
      GENERATED_HEADER: buildGeneratedHeader({
        ownerCommand: "material.credits.generate",
        filePath: "src/content/pages/credits.md",
      }).trimEnd(),
      LANG: lang,
      TITLE: labels.pageTitle,
      DESCRIPTION: labels.pageDescription,
    });
    const proseMarkdown = renderMaterialCreditProse(localizedRecords, lang, labels, usageLocations);
    const pagePath = path.join(paths.contentDirectory, "pages", lang, "credits.md");
    const prosePath = path.join(paths.contentDirectory, "prose", lang, "credits.md");
    const pageStatus = await writeGeneratedFile(pagePath, pageManifest, context.dryRun);
    const proseStatus = await writeGeneratedFile(prosePath, proseMarkdown, context.dryRun);
    if (pageStatus === "written") writtenFiles += 1;
    if (proseStatus === "written") writtenFiles += 1;
  }

  return {
    data: { writtenFiles, creditCount: records.length },
    summary: context.dryRun
      ? `[material.credits] dry-run complete (${records.length} credits)`
      : `[material.credits] generated (${records.length} credits, ${writtenFiles} file changes)`,
  };
}

/**
 * Generate language-redirect middleware from content-declared i18n config.
 * Per RFC-0055: eliminates hardcoded language lists by generating them from system.md.
 */
export async function runGenerateI18nMiddleware(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ generated: boolean }>> {
  const paths = requireAstroSitePaths(context);
  const middlewarePath = path.join(paths.srcDirectory, "middleware", "language-redirect.ts");

  // Import dynamically to avoid hard dependency if not used
  const { loadI18nConfigSync } = await import("@warpgogol/werkstatt-site/content");
  const i18n = loadI18nConfigSync(paths.appDirectory);

  if (!i18n) {
    return {
      data: { generated: false },
      summary: "[i18n.middleware] skipped: no i18n config in system.md",
    };
  }

  const supportedLangs = Object.keys(i18n.config.supported);
  const defaultLang = i18n.config.default;

  const content = applyTokens(readTemplate("src/middleware/language-redirect.ts.template"), {
    GENERATED_HEADER: buildGeneratedHeader({
      ownerCommand: "routes.generate",
      site: context.site?.name,
      filePath: "src/middleware/language-redirect.ts",
    }).trimEnd(),
    SUPPORTED_LANGS: JSON.stringify(supportedLangs).replace(/,(?!")/g, ", "),
    DEFAULT_LANG: JSON.stringify(defaultLang),
  });

  const status = await writeGeneratedFile(middlewarePath, content, context.dryRun);

  return {
    data: { generated: status === "written" },
    summary: context.dryRun
      ? `[i18n.middleware] dry-run: ${status === "written" ? "would write" : "unchanged"} ${middlewarePath}`
      : `[i18n.middleware] ${status === "written" ? "generated" : "unchanged"} ${middlewarePath}`,
  };
}
