/*
<MODULE_CONTRACT>
<purpose>
[RFC-0189] Implements `ui.i18n.lint` — a workspace-scoped validator that scans
shared UI components (`packages/werkstatt-site/src/domain/ui/{sections,components}/`) for hardcoded
human-readable strings and non-trivial `resolveLabel` fallbacks.
</purpose>
<non-goals>
  <item>Do not lint app-level pages or layouts.</item>
  <item>Do not enforce that every resolveLabel key has a translation in every language.</item>
  <item>Do not perform runtime DOM checks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0189: Initial implementation.</item>
  <item>Exclude diagnostic string literals and responsive image `sizes` attributes from UI-copy checks.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";

interface Violation {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
  fixHint?: string;
  excerpt: string;
}

interface I18nLintResult {
  command: "ui.i18n.lint";
  status: "pass" | "warn" | "fail";
  scannedFiles: number;
  violations: Violation[];
}

function findPosition(source: string, index: number): { line: number; column: number } {
  const lines = source.slice(0, index).split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function isHumanReadableString(str: string): boolean {
  if (str.length <= 2) return false;
  if (!/\s/.test(str)) return false;
  if (!/[a-zA-Z\p{L}]/u.test(str)) return false;
  return true;
}

function isAllowlisted(str: string): boolean {
  if (str === "" || str === "..." || str === "—" || str === "-") return true;
  // CSS/BEM class names: only lowercase ASCII, digits, -, _, and spaces
  if (/^[a-z0-9_\-\s]+$/.test(str) && !/[A-Z]/.test(str)) return true;
  // URL paths
  if (str.startsWith("/") || str.startsWith("http")) return true;
  // Single-word keys (no spaces)
  if (!/\s/.test(str)) return true;
  // Inline style fragments
  if (str.startsWith("font-variant-numeric:") || str.includes(" && typeof ")) return true;
  // Meta viewport / similar CSS-like declarations
  if (str.startsWith("width=device-width")) return true;
  // SVG path data (starts with M/m and contains only path commands, numbers, and separators)
  if (/^[Mm][\d\s.,\-MLCZVHSQTAm lc zv hs qt a]+$/.test(str)) return true;
  // String fragments that contain template expression syntax — these live inside
  // backtick template literals and are not standalone string literals.
  if (str.includes("${")) return true;
  // Regex cross-matches inside object literals, e.g. `"image", id: token, domain: "prose"`.
  if (/^,\s*[A-Za-z_$][\w$]*:\s*[A-Za-z_$][\w$]*,\s*[A-Za-z_$][\w$]*:\s*$/.test(str)) return true;
  // Regex cross-matches inside HTML template literals; visitor-facing labels are interpolated.
  if (/[<>]/.test(str) && /\b(?:class|className)\s*=/.test(str)) return true;
  return false;
}

function isTrivialFallback(str: string): boolean {
  const words = str.trim().split(/\s+/).filter(Boolean);
  if (words.length > 3) return false;
  if (/[.!?;]/.test(str)) return false;
  return true;
}

async function walkFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const all = await collectFiles(dir, { ignore: () => false });
  return all.filter((full) => {
    if (/[\/\\]tests[\/\\]/.test(full) || /[\/\\]test[\/\\]/.test(full)) return false;
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(full)) return false;
    return pattern.test(basename(full));
  });
}

// Find all resolveLabel ranges and fallback violations (I18N-02)
function scanResolveLabel(
  source: string,
  relFile: string,
): {
  violations: Violation[];
  protectedRanges: Array<{ start: number; end: number }>;
} {
  const violations: Violation[] = [];
  const protectedRanges: Array<{ start: number; end: number }> = [];

  // Match resolveLabel("key", "fallback") or resolveLabel("key", 'fallback')
  const re = /resolveLabel\s*\(\s*["']([^"']+)["']\s*,\s*(["'])([^"']*)\2\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const fullMatch = m[0];
    const fallback = m[3];
    const matchStart = m.index;
    const matchEnd = matchStart + fullMatch.length;
    protectedRanges.push({ start: matchStart, end: matchEnd });

    if (!isTrivialFallback(fallback)) {
      const pos = findPosition(source, matchStart);
      violations.push({
        file: relFile,
        line: pos.line,
        column: pos.column,
        rule: "I18N-02",
        message:
          "resolveLabel fallback contains a full sentence. Use an empty fallback or add the text to siteLabels / section props.",
        fixHint: "replace-fallback-with-empty-string",
        excerpt: fallback.slice(0, 80),
      });
    }
  }

  return { violations, protectedRanges };
}

function isInsideProtectedRange(
  index: number,
  ranges: Array<{ start: number; end: number }>,
): boolean {
  for (const r of ranges) {
    if (index >= r.start && index < r.end) return true;
  }
  return false;
}

function findCallRanges(
  source: string,
  callPattern: RegExp,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = callPattern.exec(source)) !== null) {
    const open = source.indexOf("(", m.index);
    if (open < 0) continue;

    let depth = 0;
    let quote: string | null = null;
    let escaped = false;
    for (let i = open; i < source.length; i++) {
      const ch = source[i]!;
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === quote) {
          quote = null;
        }
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
      } else if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
        if (depth === 0) {
          ranges.push({ start: m.index, end: i + 1 });
          break;
        }
      }
    }
  }
  return ranges;
}

function findDiagnosticRanges(source: string): Array<{ start: number; end: number }> {
  return findCallRanges(source, /(?:console\.(?:warn|error|info|debug|log)|new\s+Error)\s*\(/g);
}

function scanStringLiterals(
  source: string,
  relFile: string,
  protectedRanges: Array<{ start: number; end: number }>,
): Violation[] {
  const violations: Violation[] = [];
  const re = /(["'])(?:(?!\1)[^\\]|\\.)*?\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const raw = m[0];
    const content = raw.slice(1, -1);

    // Skip matches that span newlines — these are almost always XML attributes
    // inside Compass comment blocks, not real string literals.
    if (raw.includes("\n")) continue;

    if (!isHumanReadableString(content) || isAllowlisted(content)) continue;

    // Skip if inside a protected call (resolveLabel handled by I18N-02, diagnostics are not UI copy)
    if (isInsideProtectedRange(m.index, protectedRanges)) continue;

    // Skip HTML attribute cross-matches: content starts with space and contains
    // `=` — these are matches that span from the closing quote of one HTML
    // attribute to the opening quote of another (e.g. `class="a" id="b"`).
    if (content.startsWith(" ") && content.includes("=")) continue;

    // Skip if on same line as a non-copy HTML attribute.
    const before = source.slice(0, m.index);
    const lineStart = before.lastIndexOf("\n");
    const line = before.slice(lineStart + 1);
    if (/\b(?:class(Name)?|sizes|srcset|media)\s*=\s*$/.test(line.slice(-50))) continue;

    const pos = findPosition(source, m.index);
    violations.push({
      file: relFile,
      line: pos.line,
      column: pos.column,
      rule: "I18N-01",
      message:
        "Hardcoded human-readable string literal: move to resolveLabel, props, or siteLabels.",
      fixHint: "extract-to-localization",
      excerpt: content.slice(0, 80),
    });
  }
  return violations;
}

// RFC-0174 legal chrome components: prescribed bilingual boilerplate that
// is intentionally hardcoded by design and must not vary per app.
const LEGAL_CHROME_FILES = new Set(["packages/werkstatt-site/src/domain/ui/legal/translation-notice.astro"]);

async function scanAstroFile(file: string, relFile: string): Promise<Violation[]> {
  if (LEGAL_CHROME_FILES.has(relFile)) return [];

  const source = await readFile(file, "utf-8");

  // 1. Remove <style>...</style> blocks from source before string scanning
  const sourceWithoutStyle = source.replace(/<style[\s\S]*?<\/style>/gi, "");

  // 2. resolveLabel fallbacks (I18N-02)
  const { violations: i18n02, protectedRanges } = scanResolveLabel(sourceWithoutStyle, relFile);
  protectedRanges.push(...findDiagnosticRanges(sourceWithoutStyle));

  // 3. String literals (I18N-01) excluding protected ranges
  const i18n01 = scanStringLiterals(sourceWithoutStyle, relFile, protectedRanges);

  return [...i18n02, ...i18n01];
}

async function scanTsFile(file: string, relFile: string): Promise<Violation[]> {
  const source = await readFile(file, "utf-8");
  const violations: Violation[] = [];

  // 1. resolveLabel fallbacks (I18N-02)
  const { violations: i18n02, protectedRanges } = scanResolveLabel(source, relFile);
  protectedRanges.push(...findDiagnosticRanges(source));
  violations.push(...i18n02);

  // 2. String literals (I18N-01)
  const i18n01 = scanStringLiterals(source, relFile, protectedRanges);
  violations.push(...i18n01);

  return violations;
}

export async function runUiI18nLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<I18nLintResult>> {
  const workspaceRoot = context.workspaceRoot;
  const scanPath = input.flags.path
    ? join(workspaceRoot, String(input.flags.path))
    : join(workspaceRoot, "packages", "werkstatt-site", "src", "domain", "ui", "src");

  const astroFiles = await walkFiles(scanPath, /\.astro$/);
  const tsFiles = await walkFiles(scanPath, /\.(ts|tsx)$/);

  const allViolations: Violation[] = [];

  for (const file of astroFiles) {
    const relFile = relative(workspaceRoot, file).replace(/\\/g, "/");
    const v = await scanAstroFile(file, relFile);
    allViolations.push(...v);
  }

  for (const file of tsFiles) {
    const relFile = relative(workspaceRoot, file).replace(/\\/g, "/");
    const v = await scanTsFile(file, relFile);
    allViolations.push(...v);
  }

  const scannedFiles = astroFiles.length + tsFiles.length;

  if (allViolations.length > 0) {
    return {
      exitCode: 1,
      data: {
        command: "ui.i18n.lint",
        status: "fail",
        scannedFiles,
        violations: allViolations,
      },
      summary: `ui.i18n.lint: ${allViolations.length} violation(s) (${scannedFiles} files scanned)`,
    };
  }

  return {
    exitCode: 0,
    data: {
      command: "ui.i18n.lint",
      status: "pass",
      scannedFiles,
      violations: [],
    },
    summary: `ui.i18n.lint: OK (${scannedFiles} files scanned)`,
  };
}
