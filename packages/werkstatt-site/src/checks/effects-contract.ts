/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0156 effects.contract.validate and effects.coverage.audit — the
discrete, scriptable validators RFC-0134/RFC-0151 specified for the composable effects system.</purpose>
<non-goals>
  <item>Do not redefine the effects contract or the target×kind matrix — @warpgogol/werkstatt-site/share owns it.</item>
  <item>Do not replace effectAssignmentSchema.superRefine in content.validate; this complements it.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0156: introduce effects.contract.validate + effects.coverage.audit reusing the @warpgogol/werkstatt-site/share effect schema.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { effectAssignmentSchema } from "@warpgogol/werkstatt-site/share/schemas/effects";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { passResult, failResult } from "./result-helpers.ts";
import {
  collectMarkdownFilesSafe,
  getContentDisciplinePaths,
  readMarkdownDocument,
} from "./content-discipline.ts";

/** Recursively collect every `effects` array found anywhere in a parsed frontmatter object. */
function collectEffectsArrays(node: unknown, out: unknown[][]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectEffectsArrays(item, out);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "effects" && Array.isArray(value)) out.push(value);
      collectEffectsArrays(value, out);
    }
  }
}

/** Map a zod issue message to a stable, documented rule code. */
export function classifyEffectIssue(message: string): string {
  if (/supports kinds/.test(message)) return "unsupported-kind-for-target";
  if (/allowed per effect stack/.test(message)) return "duplicate-kind-in-stack";
  return "invalid-effect";
}

/**
 * effects.contract.validate — validate every authored effect assignment against
 * the shared effectAssignmentSchema (same predicates as the superRefine guard in
 * content.validate), exposed as a discrete, scriptable command.
 *
 * @rfc RFC-0156
 */
export async function runEffectsContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = getContentDisciplinePaths(context);
  const directories = [paths.pagesDirectory, paths.proseDirectory];
  const files = (
    await Promise.all(directories.map((directory) => collectMarkdownFilesSafe(directory)))
  ).flat();

  const violations: string[] = [];
  let assignmentCount = 0;

  for (const filePath of files) {
    const doc = await readMarkdownDocument(context.workspaceRoot, filePath);
    let data: unknown;
    try {
      data = parseMarkdownFrontmatter(doc.source).data;
    } catch {
      continue;
    }
    const arrays: unknown[][] = [];
    collectEffectsArrays(data, arrays);
    for (const assignments of arrays) {
      assignments.forEach((assignment, index) => {
        const result = effectAssignmentSchema.safeParse(assignment);
        if (result.success) {
          assignmentCount += 1;
          return;
        }
        for (const issue of result.error.issues) {
          const code = classifyEffectIssue(issue.message);
          const where = issue.path.length ? `.${issue.path.join(".")}` : "";
          violations.push(
            `${doc.relativeFile} — [${code}] effects[${index}]${where}: ${issue.message}`,
          );
        }
      });
    }
  }

  return violations.length > 0
    ? failResult("effects.contract.validate", violations)
    : passResult(
        "effects.contract.validate",
        `Validated ${assignmentCount} effect assignment(s) across ${files.length} content file(s)`,
      );
}

async function walkSourceFiles(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkSourceFiles(full, out);
    } else if (/\.(astro|ts|yaml)$/.test(entry.name)) {
      out.push(full);
    }
  }
}

/**
 * effects.coverage.audit — report any surviving legacy effect props in packages/ui
 * renderers and how many files reference the effects system. Passes when the
 * RFC-0134 migration left no legacy `surface.glass` props or bare GlassPanel
 * effect usage outside the effects system.
 *
 * @rfc RFC-0156
 */
export async function runEffectsCoverageAudit(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const uiSrc = join(context.workspaceRoot, "packages", "werkstatt-site", "src", "domain", "ui", "src");
  const files: string[] = [];
  await walkSourceFiles(join(uiSrc, "sections"), files);
  await walkSourceFiles(join(uiSrc, "components"), files);

  const legacy: string[] = [];
  let effectsAware = 0;

  for (const filePath of files) {
    const src = await readFile(filePath, "utf8");
    const rel = filePath.replace(context.workspaceRoot, "").replace(/\\/g, "/").replace(/^\//, "");
    if (/\bsurface\.glass\b/.test(src)) {
      legacy.push(`${rel} — legacy 'surface.glass' effect prop; migrate to effects[] (RFC-0134)`);
    }
    if (/\bGlassPanel\b/.test(src) && !rel.includes("/components/effects/")) {
      legacy.push(
        `${rel} — direct GlassPanel usage; route effect behavior through EffectHost/effects[]`,
      );
    }
    if (/EffectHost|composeEffectPresentation|\beffects\b/.test(src)) {
      effectsAware += 1;
    }
  }

  context.logger.info(
    `effects coverage: ${effectsAware}/${files.length} packages/ui renderer file(s) reference the effects system`,
  );

  return legacy.length > 0
    ? failResult("effects.coverage.audit", legacy)
    : passResult(
        "effects.coverage.audit",
        `0 legacy effect props across ${files.length} packages/ui file(s); ${effectsAware} reference the effects system`,
      );
}
