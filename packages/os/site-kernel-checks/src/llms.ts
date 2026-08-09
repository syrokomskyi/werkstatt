/*
<MODULE_CONTRACT>
<purpose>
  RFC-0050 llms generation and validation commands.
  llms.generate writes public/llms.txt and public/llms-full.txt from disk content.
  llms.validate checks existence, non-emptiness, and structural markers.
</purpose>
<non-goals>
  <item>Do not read content through Astro runtime or astro:content.</item>
  <item>Do not duplicate semantic model construction logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0050: Initial implementation.</item>
  <item>RFC-0184: Enhanced validation with blockquote, Markdown link, absolute URL, and blank-gap checks.</item>
</CHANGE_SUMMARY>
*/

import { join, dirname } from "node:path";
import { readFile, mkdir } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { writeFileIfChanged } from "@warpgogol/site-kernel";
import { parse as yamlParse } from "yaml";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSemanticSiteModel, loadSystemManifest } from "@warpgogol/site-kernel-content";
import { buildLlmsIndex, buildLlmsFull } from "@warpgogol/share/semantic";
import { canonicalPageUrl, type CanonicalUrlOptions } from "@warpgogol/share/canonical-url";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { includeInLlms, type SurfaceArtifact } from "@warpgogol/surface";
import { loadLazySurfacePages } from "@warpgogol/share/astro/surface-routes";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";

/** RFC-0195: build llms.txt link rows for full-GEO Programmatic Surface pages (fail-open to []). */
async function buildSurfaceLlmsRows(
  appDir: string,
  siteUrl: string,
  defaultLang: string,
  canonicalOpts: CanonicalUrlOptions,
): Promise<string[]> {
  let artifact: SurfaceArtifact;
  try {
    const raw = await readFile(join(appDir, "src", "surface.generated.yaml"), "utf8");
    artifact = yamlParse(raw) as SurfaceArtifact;
  } catch {
    return [];
  }
  const rows: string[] = [];
  for (const entry of artifact.entries ?? []) {
    if (!includeInLlms(entry)) continue;
    // RFC-0199: lazy-baked blueprints (e.g. `ratgeber`) do not serialize `entry.pages` into the
    // artifact — the per-language baked pages live in the lazy cache. Without them llms.txt would
    // emit the default-language title under a localized URL, so resolve them from the same cache
    // the page handler/renderer reads.
    const pages =
      entry.pages ?? (entry.lazy ? await loadLazySurfacePages(appDir, entry.pageId) : null);
    for (const [lang, slug] of Object.entries(entry.routes)) {
      const url = canonicalPageUrl({ lang, route: slug, kind: "html" }, canonicalOpts);
      const page = pages?.[lang] ?? pages?.[defaultLang] ?? entry.page;
      const title = page?.title ?? slug;
      const description = page?.description ?? "";
      rows.push(description ? `- [${title}](${url}): ${description}` : `- [${title}](${url})`);
    }
  }
  return rows;
}

// RFC-0375: llms.txt and llms-full.txt are Category B (registry-only) files.
// No GENERATED_MARKER is emitted in the output.

async function writeGeneratedFile(
  filePath: string,
  content: string,
  dryRun: boolean,
): Promise<"written" | "skipped" | "unchanged"> {
  const fullContent = content;
  try {
    const existing = await readFile(filePath, "utf-8");
    if (existing === fullContent) {
      return "unchanged";
    }
  } catch {
    // file doesn't exist — proceed
  }
  if (!dryRun) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFileIfChanged(filePath, fullContent);
  }
  return "written";
}

// ---------------------------------------------------------------------------
// llms.generate
// ---------------------------------------------------------------------------

export async function runLlmsGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);

  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";
  const contentDir = join(paths.appDirectory, "src", "content");

  const { manifest } = await loadSystemManifest(contentDir);
  const lang = defaultLanguageFromManifest(manifest);
  const supportedLangs = Object.keys(
    (manifest.i18n as { supported?: Record<string, unknown> } | undefined)?.supported ?? {
      [lang]: true,
    },
  );
  const canonicalOpts: CanonicalUrlOptions = {
    baseUrl: siteUrl.replace(/\/$/, ""),
    defaultLanguage: lang,
    supportedLanguages: supportedLangs,
    trailingSlash: "always",
  };

  const semanticSite = await loadSemanticSiteModel({
    contentDir,
    lang,
    siteUrl,
  });

  let llmsTxt = buildLlmsIndex(semanticSite);
  const llmsFullTxt = buildLlmsFull(semanticSite);

  // RFC-0195: append the Programmatic Surface (GEO) pages whose Blueprint GEO depth is "full".
  // The artifact only carries entries when `pseo` is entitled, so no separate gate is needed.
  const surfaceRows = await buildSurfaceLlmsRows(paths.appDirectory, siteUrl, lang, canonicalOpts);
  if (surfaceRows.length > 0) {
    llmsTxt += `\n\n## Programmatic pages\n${surfaceRows.join("\n")}`;
  }

  // RFC-0142: breakdown of resolved llms depths across the pages that entered
  // the model. `exclude` pages are dropped by the loader and so are absent here.
  const byDepth = semanticSite.pages.reduce<Record<string, number>>((acc, page) => {
    const depth = page.output?.llms?.depth ?? "full";
    acc[depth] = (acc[depth] ?? 0) + 1;
    return acc;
  }, {});

  const llmsPath = join(paths.publicDirectory, "llms.txt");
  const llmsFullPath = join(paths.publicDirectory, "llms-full.txt");

  const _llmsStatus = await writeGeneratedFile(llmsPath, llmsTxt, context.dryRun ?? false);
  const _fullStatus = await writeGeneratedFile(llmsFullPath, llmsFullTxt, context.dryRun ?? false);

  return {
    data: {
      command: "llms.generate",
      status: "pass",
      site: context.site?.name,
      files: [llmsPath, llmsFullPath],
      pageCount: semanticSite.pages.length,
      byDepth,
      llmsTxtBytes: llmsTxt.length,
      llmsFullTxtBytes: llmsFullTxt.length,
    },
    exitCode: 0,
    summary: context.dryRun
      ? `llms.generate: dry-run — ${semanticSite.pages.length} pages (would write 2 files)`
      : `llms.generate: ${semanticSite.pages.length} pages → 2 files`,
  };
}

// ---------------------------------------------------------------------------
// llms.validate
// ---------------------------------------------------------------------------

/** RFC-0184: Validation rule types for structured error reporting. */
interface LlmsViolation {
  file: "llms.txt" | "llms-full.txt";
  rule: string;
  severity: "error" | "warning";
  message: string;
}

/** RFC-0184: Validate llms.txt structure. */
function validateLlmsTxt(content: string, _siteUrl?: string): LlmsViolation[] {
  const violations: LlmsViolation[] = [];
  const lines = content.split("\n");

  // Skip generated marker if present
  let startIdx = 0;
  if (lines[0]?.includes("GENERATED")) {
    startIdx = 1;
  }

  // missing-h1: must start with '# ' after marker
  const firstContentLine = lines.slice(startIdx).find((l) => l.trim().length > 0);
  if (!firstContentLine?.startsWith("# ")) {
    violations.push({
      file: "llms.txt",
      rule: "missing-h1",
      severity: "error",
      message: "File does not start with '# <name>' header.",
    });
    return violations;
  }

  // Find blockquote lines after H1
  const h1Index = lines.indexOf(firstContentLine);
  const afterH1 = lines.slice(h1Index + 1);
  const blockquoteLines = afterH1.filter((l) => l.startsWith(">"));

  // missing-summary-blockquote
  if (blockquoteLines.length === 0) {
    violations.push({
      file: "llms.txt",
      rule: "missing-summary-blockquote",
      severity: "error",
      message: "No blockquoted summary found after H1 header.",
    });
  }

  // missing-full-link: check for link to llms-full.txt
  const hasFullLink =
    content.includes("llms-full.txt") && /\[.*\]\(https?:\/\/[^)]+llms-full\.txt\)/.test(content);
  if (!hasFullLink) {
    violations.push({
      file: "llms.txt",
      rule: "missing-full-link",
      severity: "error",
      message: "Missing absolute Markdown link to llms-full.txt.",
    });
  }

  // Check for canonical Markdown link rows in Primary sources section
  const primarySourcesMatch = content.match(/## Primary sources\n([\s\S]*?)(\n## |$)/);
  if (primarySourcesMatch) {
    const sourceSection = primarySourcesMatch[1];
    const markdownLinks = sourceSection.match(/^- \[.+\]\(https?:\/\/[^)]+\): .+/gm);

    if (!markdownLinks || markdownLinks.length === 0) {
      violations.push({
        file: "llms.txt",
        rule: "missing-markdown-links",
        severity: "error",
        message: "No canonical Markdown link rows found in Primary sources section.",
      });
    } else {
      // Check for relative URLs in link rows
      const linkRows = sourceSection.match(/^- \[.+\]\([^)]+\): .+/gm) || [];
      for (const row of linkRows) {
        const urlMatch = row.match(/\]\(([^)]+)\)/);
        if (urlMatch) {
          const url = urlMatch[1];
          if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) {
            violations.push({
              file: "llms.txt",
              rule: "relative-link-target",
              severity: "error",
              message: `Primary source link uses a relative URL: ${url}`,
            });
          }
        }
        // malformed-link-row: check format
        if (!/^- \[.+\]\(https?:\/\/[^)]+\): .+/.test(row)) {
          violations.push({
            file: "llms.txt",
            rule: "malformed-link-row",
            severity: "error",
            message: `Malformed link row (expected '- [Title](https://...): description'): ${row.slice(0, 60)}`,
          });
        }
      }
    }
  }

  return violations;
}

/** RFC-0184: Validate llms-full.txt structure. */
function validateLlmsFull(content: string): LlmsViolation[] {
  const violations: LlmsViolation[] = [];

  if (!content.includes("## Organization facts")) {
    violations.push({
      file: "llms-full.txt",
      rule: "missing-organization-facts",
      severity: "error",
      message: "Missing '## Organization facts' section.",
    });
  }

  // relative-url-line: check that URL: lines have absolute URLs
  const urlLines = content.match(/^URL: .+/gm) || [];
  for (const line of urlLines) {
    const url = line.replace("URL: ", "").trim();
    if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) {
      violations.push({
        file: "llms-full.txt",
        rule: "relative-url-line",
        severity: "error",
        message: `URL line uses a relative URL: ${url}`,
      });
    }
  }

  // excessive-blank-runs: warning for avoidable blank placeholder gaps
  // Detect 3+ consecutive newlines within page sections
  if (/\n\n\n\n/.test(content)) {
    violations.push({
      file: "llms-full.txt",
      rule: "excessive-blank-runs",
      severity: "warning",
      message: "File contains excessive blank runs (3+ consecutive newlines).",
    });
  }

  return violations;
}

export async function runLlmsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);

  const llmsPath = join(paths.publicDirectory, "llms.txt");
  const llmsFullPath = join(paths.publicDirectory, "llms-full.txt");

  const violations: LlmsViolation[] = [];
  let llmsTxt: string | undefined;
  let llmsFullTxt: string | undefined;

  try {
    llmsTxt = await readFile(llmsPath, "utf-8");
  } catch {
    violations.push({
      file: "llms.txt",
      rule: "file-not-found",
      severity: "error",
      message: `llms.txt not found at ${llmsPath}. Run llms.generate first.`,
    });
  }

  try {
    llmsFullTxt = await readFile(llmsFullPath, "utf-8");
  } catch {
    violations.push({
      file: "llms-full.txt",
      rule: "file-not-found",
      severity: "error",
      message: `llms-full.txt not found at ${llmsFullPath}. Run llms.generate first.`,
    });
  }

  if (llmsTxt !== undefined) {
    if (llmsTxt.length === 0) {
      violations.push({
        file: "llms.txt",
        rule: "empty-file",
        severity: "error",
        message: "llms.txt is empty.",
      });
    } else {
      violations.push(...validateLlmsTxt(llmsTxt));
    }
  }

  if (llmsFullTxt !== undefined) {
    if (llmsFullTxt.length === 0) {
      violations.push({
        file: "llms-full.txt",
        rule: "empty-file",
        severity: "error",
        message: "llms-full.txt is empty.",
      });
    } else {
      violations.push(...validateLlmsFull(llmsFullTxt));
    }
  }

  // RFC-0142: advisory (non-fatal) checks. A large full file usually signals a
  // high-volume page that should be demoted via output.llms.
  const warnings: string[] = [];
  const LLMS_FULL_BYTE_CEILING = 256 * 1024;
  if (llmsFullTxt !== undefined && llmsFullTxt.length > LLMS_FULL_BYTE_CEILING) {
    warnings.push(
      `llms-full.txt is ${Math.round(llmsFullTxt.length / 1024)} KB, above the ` +
        `${LLMS_FULL_BYTE_CEILING / 1024} KB advisory ceiling — consider demoting ` +
        `high-volume pages via output.llms (summary / index-only / exclude).`,
    );
  }
  for (const w of warnings) context.logger.warn(`llms.validate: ${w}`);

  const errors = violations.filter((v) => v.severity === "error");
  const warnViolations = violations.filter((v) => v.severity === "warning");

  if (errors.length > 0) {
    return {
      data: {
        command: "llms.validate",
        status: "fail",
        violations: errors.map((v) => ({ file: v.file, rule: v.rule, message: v.message })),
        warnings: [...warnings, ...warnViolations.map((v) => v.message)],
      },
      exitCode: 1,
      summary: `llms.validate: FAIL — ${errors.length} error(s) in llms.txt/llms-full.txt`,
    };
  }

  return {
    data: {
      command: "llms.validate",
      status: "pass",
      violations: [],
      warnings: [...warnings, ...warnViolations.map((v) => v.message)],
    },
    exitCode: 0,
    summary:
      `llms.validate: OK — both files present and well-formed ` +
      `(${llmsTxt?.length ?? 0} + ${llmsFullTxt?.length ?? 0} bytes)` +
      (warnings.length > 0 || warnViolations.length > 0
        ? `, ${warnings.length + warnViolations.length} warning(s)`
        : ""),
  };
}
