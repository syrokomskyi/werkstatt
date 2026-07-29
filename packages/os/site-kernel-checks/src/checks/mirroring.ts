/*
<MODULE_CONTRACT>
<purpose>mirroring.validate — every content page must exist across every declared locale
(RFC-0097 per-page locale scoping respected).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of checks.ts (Phase 3 file-size split).</item>
  <item>RFC-0576: Migrate to diagnosticsResult with registered MIRROR-MISSING ruleId, add fixHint, preserve error/warning severity distinction.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { diagnosticsResult, passResult } from "../result-helpers.ts";

export async function runMirroringValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
  defaultLang?: string,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);

  let rootEntries;
  try {
    rootEntries = await readdir(paths.contentPagesDirectory, { withFileTypes: true });
  } catch {
    return passResult("mirroring.validate", "[mirroring] OK (no content pages directory)");
  }

  const langDirs = rootEntries
    .filter((entry) => entry.isDirectory() && /^[a-z]{2}$/i.test(entry.name))
    .map((entry) => entry.name);

  if (langDirs.length < 2) {
    return passResult(
      "mirroring.validate",
      `[mirroring] OK (only ${langDirs.length} language — nothing to mirror)`,
    );
  }

  const pagesByLang = new Map<string, Map<string, string>>();
  for (const lang of langDirs) {
    const langDir = join(paths.contentPagesDirectory, lang);
    const files = await collectMarkdownFiles(langDir);
    const pageMap = new Map<string, string>();
    for (const file of files) {
      const rel = relative(langDir, file).replace(/\\/g, "/");
      if (rel === "open-source.md") continue;
      if (rel.includes("[")) continue;

      const source = await readFile(file, "utf8");
      const { data } = parseMarkdownFrontmatter(source);
      const pageId = typeof data.pageId === "string" ? data.pageId : rel.replace(/\.md$/i, "");
      pageMap.set(pageId, rel);
    }
    pagesByLang.set(lang, pageMap);
  }

  const allPages = new Set<string>();
  for (const pageMap of pagesByLang.values()) {
    for (const pageId of pageMap.keys()) allPages.add(pageId);
  }

  // RFC-0097: a page may declare the locales it exists in (system.md
  // pages[].locales). Parity must respect that — a page intentionally scoped to a
  // subset of locales (a de-only marketing page, or a uk-only legal page) is not
  // "missing" in locales it never claimed. Pages without a declaration default to
  // all locale directories, preserving the original strict mirroring behavior.
  const declaredLocalesByPage = new Map<string, string[]>();
  try {
    const systemRaw = await readFile(join(paths.contentDirectory, "system.md"), "utf8");
    const { data } = parseMarkdownFrontmatter(systemRaw);
    const pages = Array.isArray((data as { pages?: unknown }).pages)
      ? (data as { pages: Array<Record<string, unknown>> }).pages
      : [];
    for (const page of pages) {
      if (typeof page.pageId === "string" && Array.isArray(page.locales)) {
        declaredLocalesByPage.set(page.pageId, page.locales.map(String));
      }
    }
  } catch {
    // No system.md (or unparseable) → fall back to strict all-locale mirroring.
  }

  const diagnostics: Diagnostic[] = [];
  let checkedPages = 0;

  for (const pageId of allPages) {
    checkedPages += 1;
    const missingIn: string[] = [];
    const existsIn: string[] = [];

    const declaredLocales = declaredLocalesByPage.get(pageId);
    const expectedLangs = declaredLocales
      ? langDirs.filter((l) => declaredLocales.includes(l))
      : langDirs;

    for (const lang of langDirs) {
      if (pagesByLang.get(lang)?.has(pageId)) {
        existsIn.push(lang);
      } else if (expectedLangs.includes(lang)) {
        missingIn.push(lang);
      }
    }

    if (missingIn.length > 0) {
      const missingInDefault = defaultLang ? missingIn.filter((l) => l === defaultLang) : missingIn;
      const missingInNonDefault = defaultLang ? missingIn.filter((l) => l !== defaultLang) : [];
      const sourceLang = existsIn[0] ?? defaultLang ?? langDirs[0];

      for (const lang of missingInDefault) {
        diagnostics.push({
          ruleId: "MIRROR-MISSING",
          severity: "error",
          file: `src/content/pages/${lang}/${pageId}.md`,
          message: `${pageId}: missing in [${lang}] (exists in: ${existsIn.join(", ")})`,
          fixHint: `Create src/content/pages/${lang}/${pageId}.md (copy structure from src/content/pages/${sourceLang}/${pageId}.md). Add ${lang}: route in system.md pages[].routes.`,
        });
      }
      for (const lang of missingInNonDefault) {
        diagnostics.push({
          ruleId: "MIRROR-MISSING",
          severity: "warning",
          file: `src/content/pages/${lang}/${pageId}.md`,
          message: `${pageId}: missing in [${lang}] (exists in: ${existsIn.join(", ")})`,
          fixHint: `Create src/content/pages/${lang}/${pageId}.md (copy structure from src/content/pages/${sourceLang}/${pageId}.md). Add ${lang}: route in system.md pages[].routes.`,
        });
      }
    }
  }

  if (diagnostics.length === 0) {
    return passResult(
      "mirroring.validate",
      `[mirroring] OK (${checkedPages} pages × ${langDirs.length} languages)`,
    );
  }

  return diagnosticsResult("mirroring.validate", diagnostics);
}
