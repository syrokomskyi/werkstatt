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
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@gogol/site-kernel-content";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";

export async function runMirroringValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
  defaultLang?: string,
): Promise<KernelCommandResult<{ checkedPages: number }>> {
  const paths = requireAstroSitePaths(context);

  let rootEntries;
  try {
    rootEntries = await readdir(paths.contentPagesDirectory, { withFileTypes: true });
  } catch {
    return {
      data: { checkedPages: 0 },
      exitCode: 0,
      summary: "[mirroring] OK (no content pages directory)",
    };
  }

  const langDirs = rootEntries
    .filter((entry) => entry.isDirectory() && /^[a-z]{2}$/i.test(entry.name))
    .map((entry) => entry.name);

  if (langDirs.length < 2) {
    return {
      data: { checkedPages: 0 },
      exitCode: 0,
      summary: `[mirroring] OK (only ${langDirs.length} language — nothing to mirror)`,
    };
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

  let hasErrors = false;
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

      if (missingInDefault.length > 0) {
        context.logger.error(
          `${pageId}: missing in [${missingInDefault.join(", ")}] (exists in: ${existsIn.join(", ")})`,
        );
        hasErrors = true;
      }
      if (missingInNonDefault.length > 0) {
        context.logger.warn(
          `${pageId}: missing in [${missingInNonDefault.join(", ")}] (exists in: ${existsIn.join(", ")})`,
        );
      }
    }
  }

  return {
    data: { checkedPages },
    exitCode: hasErrors ? 1 : 0,
    summary: hasErrors
      ? undefined
      : `[mirroring] OK (${checkedPages} pages × ${langDirs.length} languages)`,
  };
}
