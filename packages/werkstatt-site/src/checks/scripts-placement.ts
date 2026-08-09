/*
<MODULE_CONTRACT>
<purpose>Validates script placements in Astro files per RFC-0011 and RFC-0031.
Recognizes two script surfaces: (1) src/scripts/ — app-global and component-colocated behavioral
scripts (RFC-0011); (2) src/content/glob.client.ts — bounded feature-scoped entry modules (RFC-0031).</purpose>
<non-goals>
  <item>Do not modify source files or enforce runtime behavior.</item>
  <item>Do not handle user input or configuration management.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 2 (RFC-0031): Added recognition of src/content/glob.client.ts.</item>
  <item>RFC-0133: rewrap markers in canonical XML form.</item>
</CHANGE_SUMMARY>
*/

import { join, relative, dirname, basename } from "node:path";
import { readFile } from "node:fs/promises";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { fileExists } from "./lib/file-exists.ts";
type ScriptPlacementRule =
  "SP-01" | "SP-02" | "SP-03" | "SP-04" | "SP-05" | "SP-06" | "SP-07" | "SP-08";
type Severity = "error" | "warning";

interface ScriptPlacementViolation {
  file: string;
  rule: ScriptPlacementRule;
  message: string;
  line: number;
  severity: Severity;
}

const RULE_SEVERITY: Record<ScriptPlacementRule, Severity> = {
  "SP-01": "error",
  "SP-02": "error",
  "SP-03": "error",
  "SP-04": "warning",
  "SP-05": "warning",
  "SP-06": "warning",
  "SP-07": "error",
  "SP-08": "warning",
};
async function readText(p: string): Promise<string> {
  return readFile(p, "utf-8");
}

async function walkAstroFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: [".astro"], ignore: () => false });
}

// Returns the 1-indexed line number of `searchStr` in `source`, or 1 if not found.
function lineOf(source: string, searchStr: string): number {
  const idx = source.indexOf(searchStr);
  if (idx === -1) return 1;
  return source.slice(0, idx).split("\n").length;
}

// Counts content lines inside a <script ...> block starting at `blockStart` in `source`.
// A "content line" is a non-empty, non-whitespace line.
function countBlockLines(source: string, blockStart: number): number {
  const afterOpen = source.indexOf(">", blockStart);
  if (afterOpen === -1) return 0;
  const closeTag = source.indexOf("</script>", afterOpen);
  if (closeTag === -1) return 0;
  const inner = source.slice(afterOpen + 1, closeTag);
  return inner.split("\n").filter((l) => l.trim().length > 0).length;
}

// Returns all match positions of `pattern` in `source`.
function findAll(source: string, pattern: RegExp): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  const re = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    matches.push(m);
  }
  return matches;
}

// Returns true when a script block has type="application/ld+json" or type="application/json" (S-X — exempt).
function isDataIsland(scriptTag: string): boolean {
  return /type\s*=\s*["'](application\/ld\+json|application\/json)["']/i.test(scriptTag);
}
// Extracts the component paths referenced by `<script is:inline src="/scripts/components/...">` in layout.
function extractComponentScriptSrcs(source: string): { src: string; line: number }[] {
  const results: { src: string; line: number }[] = [];
  // Matches: <script is:inline src="/scripts/components/..." ...>
  const re =
    /<script\s+[^>]*is:inline\s[^>]*src\s*=\s*["']([^"']*\/scripts\/components\/[^"']*)["'][^>]*>/gi;
  for (const m of findAll(source, re)) {
    if (isDataIsland(m[0])) continue;
    results.push({ src: m[1], line: lineOf(source, m[0]) });
  }
  return results;
}

// Extracts bare `<script is:inline>` blocks (no src attribute) from source.
function extractBareInlineBlocks(source: string): { line: number; lineCount: number }[] {
  const results: { line: number; lineCount: number }[] = [];
  // Matches <script is:inline> without src= attribute and without type= data islands
  const re = /<script\s+is:inline(?![^>]*src\s*=)(?![^>]*type\s*=)[^>]*>/gi;
  for (const m of findAll(source, re)) {
    if (isDataIsland(m[0])) continue;
    const blockStart = m.index;
    const lineCount = countBlockLines(source, blockStart);
    results.push({ line: lineOf(source, m[0]), lineCount });
  }
  return results;
}

// Extracts bare `<script>` blocks (no is:inline, no src) from source and checks if they use import.
function extractBareScriptBlocks(
  source: string,
): { line: number; hasImport: boolean; lineCount: number }[] {
  const results: { line: number; hasImport: boolean; lineCount: number }[] = [];
  // Matches <script> or <script define:vars=...> but NOT is:inline, NOT src=, NOT type=
  const re = /<script(?![^>]*is:inline)(?![^>]*\bsrc\s*=)(?![^>]*\btype\s*=)[^>]*>/gi;
  for (const m of findAll(source, re)) {
    if (isDataIsland(m[0])) continue;
    const blockStart = m.index;
    const afterOpen = source.indexOf(">", blockStart);
    if (afterOpen === -1) continue;
    const closeTag = source.indexOf("</script>", afterOpen);
    if (closeTag === -1) continue;
    const inner = source.slice(afterOpen + 1, closeTag);
    const hasImport = /^\s*import\s+/m.test(inner);
    const lineCount = inner.split("\n").filter((l) => l.trim().length > 0).length;
    results.push({ line: lineOf(source, m[0]), hasImport, lineCount });
  }
  return results;
}

async function checkLayout(
  layoutPath: string,
  componentsDir: string,
  appDir: string,
  violations: ScriptPlacementViolation[],
): Promise<void> {
  const rel = (p: string) => relative(appDir, p).replace(/\\/g, "/");

  if (!(await fileExists(layoutPath))) return;

  const source = await readText(layoutPath);

  // SP-01: layout.astro loads component scripts via is:inline src pointing to /scripts/components/
  for (const { src, line } of extractComponentScriptSrcs(source)) {
    // Derive component stem from src path: /scripts/components/foo/bar.js → foo/bar
    const stemMatch = src.match(/\/scripts\/components\/(.+?)\.js$/);
    const stem = stemMatch ? stemMatch[1] : src;
    violations.push({
      file: rel(layoutPath),
      rule: "SP-01",
      message: `layout.astro loads component script "${src}" globally (AP-18) — move <script is:inline src=...> into the owning component`,
      line,
      severity: RULE_SEVERITY["SP-01"],
    });

    // SP-03: component with @client-script: required also loaded from layout
    const candidatePaths = [
      join(componentsDir, `${stem}.astro`),
      join(componentsDir, `${stem.split("/").pop()}.astro`),
    ];
    for (const candidatePath of candidatePaths) {
      if (!(await fileExists(candidatePath))) continue;
      const compSource = await readText(candidatePath);
      if (/@client-script:\s*required/.test(compSource)) {
        violations.push({
          file: rel(layoutPath),
          rule: "SP-03",
          message: `layout.astro loads "${src}" but the owning component declares @client-script: required — the script must only be loaded from inside the component`,
          line,
          severity: RULE_SEVERITY["SP-03"],
        });
      }
      break;
    }
  }

  // SP-02: layout.astro contains a bare is:inline block with > 5 lines
  for (const { line, lineCount } of extractBareInlineBlocks(source)) {
    if (lineCount > 5) {
      violations.push({
        file: rel(layoutPath),
        rule: "SP-02",
        message: `layout.astro contains bare <script is:inline> block of ${lineCount} lines (limit 5, AP-19) — extract to src/scripts/ and load via Astro import`,
        line,
        severity: RULE_SEVERITY["SP-02"],
      });
    }
  }

  // SP-06: layout.astro contains a <script> block without import (inline logic not using src/scripts/)
  for (const { line, hasImport, lineCount } of extractBareScriptBlocks(source)) {
    if (!hasImport && lineCount > 0) {
      violations.push({
        file: rel(layoutPath),
        rule: "SP-06",
        message: `layout.astro contains a <script> block without an import statement — S-2 scripts must use import from src/scripts/ (RFC-0011)`,
        line,
        severity: RULE_SEVERITY["SP-06"],
      });
    }
  }
}
async function checkComponents(
  componentsDir: string,
  layoutPath: string,
  appDir: string,
  violations: ScriptPlacementViolation[],
): Promise<void> {
  const rel = (p: string) => relative(appDir, p).replace(/\\/g, "/");

  const files = await walkAstroFiles(componentsDir);

  let layoutSource = "";
  if (await fileExists(layoutPath)) {
    layoutSource = await readText(layoutPath);
  }

  for (const file of files) {
    const source = await readText(file);

    // SP-03 (component side): component declares @client-script: required — check if layout also loads it
    if (/@client-script:\s*required/.test(source)) {
      // Build expected public path from component path
      const relComp = relative(componentsDir, file).replace(/\\/g, "/");
      const stem = relComp.replace(/\.astro$/, "");
      const expectedSrc = `/scripts/components/${stem}.js`;
      if (layoutSource && layoutSource.includes(expectedSrc)) {
        violations.push({
          file: rel(file),
          rule: "SP-03",
          message: `Component declares @client-script: required but "${expectedSrc}" is also loaded from layout.astro (AP-18) — remove from layout, keep only in the component`,
          line: 1,
          severity: RULE_SEVERITY["SP-03"],
        });
      }
    }

    // SP-04: bare is:inline block > 5 lines in component (warning)
    for (const { line, lineCount } of extractBareInlineBlocks(source)) {
      if (lineCount > 5) {
        violations.push({
          file: rel(file),
          rule: "SP-04",
          message: `Component contains bare <script is:inline> block of ${lineCount} lines (limit 5) — consider extracting to src/scripts/components/ and loading via import`,
          line,
          severity: RULE_SEVERITY["SP-04"],
        });
      }
    }
  }
}
async function checkPages(
  pagesDir: string,
  appDir: string,
  violations: ScriptPlacementViolation[],
): Promise<void> {
  const rel = (p: string) => relative(appDir, p).replace(/\\/g, "/");

  const files = await walkAstroFiles(pagesDir);

  for (const file of files) {
    const source = await readText(file);

    // SP-05: route file contains is:inline block > 10 lines (warning)
    for (const { line, lineCount } of extractBareInlineBlocks(source)) {
      if (lineCount > 10) {
        violations.push({
          file: rel(file),
          rule: "SP-05",
          message: `Route file contains bare <script is:inline> block of ${lineCount} lines (limit 10 for S-3) — extract to src/scripts/pages/ if reusable`,
          line,
          severity: RULE_SEVERITY["SP-05"],
        });
      }
    }
  }
}
/**
 * Checks feature-scoped asterisk.client.ts files under src/content/asteriskasterisk
 * per RFC-0031. These are valid client-editable entry modules.
 */
async function checkClientTsFiles(
  contentDir: string,
  appDir: string,
  violations: ScriptPlacementViolation[],
): Promise<void> {
  const rel = (p: string) => relative(appDir, p).replace(/\\/g, "/");

  const clientFiles = await collectFiles(contentDir, {
    extensions: [".client.ts"],
    ignore: () => false,
  });
  for (const fullPath of clientFiles) {
    const name = basename(fullPath);
    // RFC-0031: Feature-scoped client entry module
    // Must be named <feature-name>.client.ts where <feature-name> matches the parent directory
    const parentDir = dirname(fullPath).split(/[/\\]/).pop() ?? "";
    const expectedName = `${parentDir}.client.ts`;

    if (name !== expectedName) {
      violations.push({
        file: rel(fullPath),
        rule: "SP-07",
        message: `Feature-scoped client script must be named "${expectedName}" (RFC-0031) — got "${name}"`,
        line: 1,
        severity: "error",
      });
    }

    // Validate content: must not import from src/scripts/ (those are app-global)
    // and should only contain feature-local orchestration logic
    try {
      const content = await readFile(fullPath, "utf-8");

      // Check for imports from src/scripts/ — feature-scoped scripts should be self-contained
      // or only import from shared packages, not app-global script modules
      if (/import\s+.*from\s+["']\.\.\/scripts\//.test(content)) {
        violations.push({
          file: rel(fullPath),
          rule: "SP-08",
          message: `Feature-scoped *.client.ts should not import from src/scripts/ (RFC-0031) — import shared logic from packages instead`,
          line: 1,
          severity: "warning",
        });
      }
    } catch {
      // Skip file read errors
    }
  }
}

export async function runScriptsPlacementValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ errors: number; warnings: number; checkedFiles: number }>> {
  const paths = requireAstroSitePaths(context);
  const appDir = paths.appDirectory;

  const layoutPath = join(paths.srcDirectory, "layouts", "layout.astro");
  const componentsDir = join(paths.srcDirectory, "components");
  const pagesDir = join(paths.srcDirectory, "pages");
  const contentDir = join(paths.srcDirectory, "content");

  const violations: ScriptPlacementViolation[] = [];

  await checkLayout(layoutPath, componentsDir, appDir, violations);
  await checkComponents(componentsDir, layoutPath, appDir, violations);
  await checkPages(pagesDir, appDir, violations);
  await checkClientTsFiles(contentDir, appDir, violations);

  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");

  for (const v of violations) {
    const msg = `[${v.rule}] ${v.file}:${v.line} — ${v.message}`;
    if (v.severity === "error") {
      context.logger.error(msg);
    } else {
      context.logger.warn(msg);
    }
  }

  const checkedFiles = violations.length > 0 ? violations.length : 0;

  return {
    data: { errors: errors.length, warnings: warnings.length, checkedFiles },
    exitCode: errors.length > 0 ? 1 : 0,
    summary:
      errors.length === 0 && warnings.length === 0
        ? `[scripts.placement.validate] OK — no script placement violations found`
        : undefined,
  };
}
