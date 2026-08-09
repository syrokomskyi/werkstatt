/*
<MODULE_CONTRACT>
<purpose>RFC-0238: demand.modifier.lint — scan the demands collection and fail when a demand slug is an intent modifier.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0238: add demand modifier lint so modifiers remain page/FAQ detail instead of demand records.</item>
</CHANGE_SUMMARY>
*/

import { basename, join } from "node:path";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { passResult, failResult } from "./result-helpers.ts";
import { readFile } from "node:fs/promises";

/** Closed de/uk intent-modifier lexicon. Modifiers must be page blocks/FAQ, not demand records. */
const MODIFIER_LEXICON = new Set([
  // de
  "preis",
  "guenstig",
  "guenstigste",
  "kosten",
  "kostet",
  "billig",
  "billigste",
  "dringend",
  "sofort",
  "heute",
  "24h",
  "24-stunden",
  "in-der-naehe",
  "naehe",
  "nahe",
  "umgebung",
  "beste",
  "top",
  "empfehlung",
  // uk
  "tsina",
  "cina",
  "dyeshevo",
  "deshevo",
  "doroho",
  "terminovo",
  "termino",
  "prytyagom",
  "poruch",
  "poruch",
  "krashchyj",
  "kraschyy",
  "top",
  "rekomendatsiya",
  // en fallbacks
  "price",
  "cheap",
  "cheapest",
  "cost",
  "urgent",
  "today",
  "24h",
  "near",
  "nearby",
  "best",
  "top",
]);

function isModifier(slug: string): boolean {
  return MODIFIER_LEXICON.has(slug.toLowerCase().replace(/[_\s]+/g, "-"));
}

export async function runDemandModifierLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "demand.modifier.lint must run inside an app context." };
  }

  const demandsDir = join(app.directory, "src", "content", "surface", "demands");
  const violations: string[] = [];

  for (const lang of ["de", "uk"]) {
    const dir = join(demandsDir, lang);
    let files: string[];
    try {
      files = await collectMarkdownFiles(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const raw = await readFile(file, "utf8");
      const data = parseMarkdownFrontmatter(raw).data as Record<string, unknown>;
      const fileSlug = basename(file, ".md");
      const slugs = new Set([fileSlug]);
      if (typeof data.slug === "string" && data.slug.trim()) slugs.add(data.slug.trim());
      for (const slug of slugs) {
        if (!isModifier(slug)) continue;
        violations.push(
          `modifier-as-demand: "${slug}" (lang=${lang}, file=${fileSlug}) — intent modifier must be a block/FAQ inside a Bedarfskarte, not a demand record`,
        );
      }
    }
  }

  if (violations.length > 0) {
    return failResult("demand.modifier.lint", violations);
  }
  return passResult("demand.modifier.lint", "ok (no modifier slugs found)");
}
