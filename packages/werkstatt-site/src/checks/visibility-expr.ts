/*
<MODULE_CONTRACT>
<purpose>
visibility.expr.validate — workspace-wide scan for VisibilityExpr usages in
page content and feature-graph YAML files. Every expression must parse against
VisibilityExprSchema from @warpgogol/share (DNA-26, RFC-0026).
</purpose>
<non-goals>
  <item>Do not evaluate visibility at runtime — only parse/validate the expression structure.</item>
  <item>Do not validate block-level cross-references (page.block.validate does that).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0026): Initial creation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { resultFromViolations, failResult } from "./result-helpers.ts";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { VisibilityExprSchema } from "@warpgogol/share/visibility";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collects all values at the given key from a parsed YAML/JSON tree.
 *  Skips recursing into `props` — visibility inside props (e.g. select.visibility
 *  in people blocks) is a filter value, not a VisibilityExpr. */
function collectByKey(obj: unknown, key: string, results: unknown[] = []): unknown[] {
  if (obj === null || typeof obj !== "object") return results;

  if (Array.isArray(obj)) {
    for (const item of obj) collectByKey(item, key, results);
  } else {
    const rec = obj as Record<string, unknown>;
    for (const [k, v] of Object.entries(rec)) {
      if (k === key) {
        results.push(v);
      } else if (k !== "props") {
        collectByKey(v, key, results);
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// runVisibilityExprValidate
// ---------------------------------------------------------------------------

export async function runVisibilityExprValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];

  let paths: ReturnType<typeof requireAstroSitePaths>;
  try {
    paths = requireAstroSitePaths(context);
  } catch (err) {
    return failResult("visibility.expr.validate", [(err as Error).message]);
  }

  // Scan page content entries for visibility fields
  const pagesDir = join(paths.appDirectory, "src", "content", "pages");

  let markdownFiles: string[] = [];
  try {
    markdownFiles = await collectMarkdownFiles(pagesDir);
  } catch {
    // No pages dir — handled by app.layout.validate
  }

  for (const filePath of markdownFiles) {
    const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");

    let rawContent: string;
    try {
      rawContent = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const { data: frontmatter } = parseMarkdownFrontmatter(rawContent);
    const expressions = collectByKey(frontmatter, "visibility");

    for (let i = 0; i < expressions.length; i++) {
      const expr = expressions[i];
      const result = VisibilityExprSchema.safeParse(expr);
      if (!result.success) {
        for (const issue of result.error.issues) {
          violations.push(
            `${rel}: visibility expression [${i}] invalid — ${issue.path.join(".") || "root"}: ${issue.message}`,
          );
        }
      }
    }
  }

  // Scan feature-graph YAML files for visibility fields
  const featuresDir = join(paths.appDirectory, "src", "content", "features");
  let featureFiles: string[] = [];
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(featuresDir, { recursive: true, withFileTypes: true });
    featureFiles = entries
      .filter((e) => e.isFile() && (e.name.endsWith(".yaml") || e.name.endsWith(".yml")))
      .map((e) => join(e.parentPath ?? featuresDir, e.name));
  } catch {
    // No features dir — handled elsewhere
  }

  for (const filePath of featureFiles) {
    const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");

    let rawContent: string;
    try {
      rawContent = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseYaml(rawContent);
    } catch {
      continue;
    }

    const expressions = collectByKey(parsed, "visibility");
    for (let i = 0; i < expressions.length; i++) {
      const expr = expressions[i];
      const result = VisibilityExprSchema.safeParse(expr);
      if (!result.success) {
        for (const issue of result.error.issues) {
          violations.push(
            `${rel}: visibility expression [${i}] invalid — ${issue.path.join(".") || "root"}: ${issue.message}`,
          );
        }
      }
    }
  }

  return resultFromViolations("visibility.expr.validate", violations);
}
