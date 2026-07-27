/*
<MODULE_CONTRACT>
<purpose>RFC-0244: demands.hierarchy.validate — validate demand record folder hierarchy and slug derivation.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0244: add demand hierarchy and derived-slug validation.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@gogol/site-kernel-content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";
import { readFile } from "node:fs/promises";

function computeDerivedSlug(dir: string, file: string): string {
  const relPath = relative(dir, file).replace(/\\/g, "/");
  const relSlug = relPath.replace(/\//g, "-").replace(/\.md$/, "");
  const hasSubfolder = relPath.includes("/");
  if (!hasSubfolder) {
    return relPath.replace(/\.md$/, "");
  }
  return relSlug;
}

function isCanonicalLevel(relPath: string): boolean {
  const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  const segments = parts.length;
  // RFC-0244: 1 segment = legacy flat (city/topic), 2 segments = city or multi-city topic, 3 segments = topic
  return segments >= 1 && segments <= 3;
}

export async function runDemandHierarchyValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "demands.hierarchy.validate must run inside an app context." };
  }

  const demandsDir = join(app.directory, "src", "content", "surface", "demands");
  const diagnostics: Array<{ ruleId: string; severity: "error" | "warning"; message: string }> = [];
  const seenSlugsByLang = new Map<string, Map<string, string>>(); // lang -> derivedSlug -> relPath

  for (const lang of ["de", "uk"]) {
    const dir = join(demandsDir, lang);
    let files: string[];
    try {
      files = await collectMarkdownFiles(dir);
    } catch {
      continue;
    }
    const seenSlugs = seenSlugsByLang.get(lang) ?? new Map<string, string>();
    seenSlugsByLang.set(lang, seenSlugs);
    for (const file of files) {
      const relPath = relative(dir, file).replace(/\\/g, "/");
      const derivedSlug = computeDerivedSlug(dir, file);

      if (!isCanonicalLevel(relPath)) {
        diagnostics.push({
          ruleId: "demands.hierarchy.validate",
          severity: "error",
          message: `invalid-level: "${relPath}" (lang=${lang}) — demand records must be at 1, 2, or 3 path segments below demands/{lang}/`,
        });
        continue;
      }

      // Collision check (per language)
      const existing = seenSlugs.get(derivedSlug);
      if (existing) {
        diagnostics.push({
          ruleId: "demands.hierarchy.validate",
          severity: "error",
          message: `slug-collision: "${derivedSlug}" produced by both "${existing}" and "${relPath}" (lang=${lang})`,
        });
      } else {
        seenSlugs.set(derivedSlug, relPath);
      }

      // Check frontmatter slug override
      const raw = await readFile(file, "utf8");
      const { data } = parseMarkdownFrontmatter(raw);
      const frontmatterSlug = typeof data.slug === "string" ? data.slug.trim() : undefined;
      if (frontmatterSlug && frontmatterSlug !== derivedSlug) {
        diagnostics.push({
          ruleId: "demands.hierarchy.validate",
          severity: "warning",
          message: `slug-override: "${relPath}" (lang=${lang}) frontmatter slug="${frontmatterSlug}" differs from derived slug="${derivedSlug}"`,
        });
      }
    }
  }

  return diagnosticsResult("demands.hierarchy.validate", diagnostics);
}
