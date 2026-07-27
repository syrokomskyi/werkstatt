/*
<MODULE_CONTRACT>
<purpose>
[RFC-0205] Implements `ui.silent-defaults.lint` — a workspace-scoped validator that scans
shared UI components (`packages/ui/src/{sections,components}/`) for empty-string fallbacks
on UI-visible text props. These silent defaults produce invisible or broken UI instead of
failing loudly, allowing missing content to ship undetected.
</purpose>
<non-goals>
  <item>Do not lint app-level pages or layouts.</item>
  <item>Do not flag legitimate `?? ""` on data attributes (`data-prefix`, `data-suffix`).</item>
  <item>Do not replace or deprecate `need()` markers; this validator is parallel to `need.markers.validate`.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0205: Initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { collectFiles } from "@gogol/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";

interface Violation {
  file: string;
  line: number;
  column: number;
  rule: string;
  severity: "error" | "warn";
  pattern: string;
  propName: string;
  message: string;
  fixHint: string;
}

interface SilentDefaultsResult {
  command: "ui.silent-defaults.lint";
  status: "pass" | "fail";
  scanned: number;
  violations: Violation[];
}

function findPosition(source: string, index: number): { line: number; column: number } {
  const lines = source.slice(0, index).split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

/**
 * UI-visible text prop names that must never silently default to empty strings.
 * When any of these props uses `?? ""`, `= ""`, `|| ""`, or appears in a
 * `defaultContent` object with an empty-string value, the linter flags it.
 */
const UI_VISIBLE_PROP_NAMES: ReadonlySet<string> = new Set([
  // Section / component chrome
  "title",
  "heading",
  "subheading",
  "lead",
  "label",
  "caption",
  "description",
  "emptyLabel",
  // Data field labels
  "ibanLabel",
  "bicLabel",
  "bankLabel",
  "kontoLabel",
  "blzLabel",
  // Buttons / CTAs
  "copyButtonLabel",
  "qrCodeButtonLabel",
  "donationInfoLinkLabel",
  "oldDetailsButtonLabel",
  "oldDetailsButtonExpandedLabel",
  "oldDetailsLabel",
  // Modal chrome
  "qrCodeModalTitle",
  "qrCodeModalCloseLabel",
  "qrCodeAltText",
  "qrInstruction",
  "modalCloseIcon",
  // Generic labels (often used in lists, cards, stats)
  "ariaLabel",
  "imageAlt",
  "alt",
  "placeholder",
  "hint",
  "helperText",
  "errorMessage",
  // Passport / star-map
  "pillarLabels",
  // Hero / stats
  "prefix",
  "suffix",
]);

/** Structural / data-attribute prop names that are allowed to use `?? ""`. */
const ALLOWLISTED_PROP_NAMES: ReadonlySet<string> = new Set([
  "data-prefix",
  "data-suffix",
  "data-numeric",
  "data-start",
  "data-decimals",
  "data-duration",
  "data-copy-value",
  "data-qr-modal-trigger",
  "data-qr-modal-close",
  "data-component",
  "data-action",
  "data-target",
  // GSAP counter animation props (rendered as data-* attributes, not visible text)
  "prefix",
  "suffix",
  // Image accessibility: empty alt is valid for decorative images per HTML spec
  "alt",
  "imageAlt",
  // CSS class props
  "class",
  "className",
  "classList",
]);

/**
 * Extract a prop name from the source code around the pattern match.
 * This is a best-effort heuristic; we look backwards for the nearest
 * identifier before the operator.
 */
function extractPropName(source: string, matchIndex: number): string | null {
  const before = source.slice(0, matchIndex);
  // Look for identifier.propName or const { propName = ... } or propName ??
  // Match the last identifier sequence before the operator position
  const m = before.match(/(?:\{|\.|\,|\s)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*$/);
  return m ? m[1] : null;
}

function isUiVisibleProp(name: string | null): boolean {
  if (!name) return false;
  if (ALLOWLISTED_PROP_NAMES.has(name)) return false;
  if (UI_VISIBLE_PROP_NAMES.has(name)) return true;
  // Heuristic: generic label-like suffixes
  if (name.endsWith("Label") || name.endsWith("Title") || name.endsWith("Heading")) return true;
  if (name.endsWith("Alt") || name.endsWith("Hint") || name.endsWith("Message")) return true;
  return false;
}

async function walkFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const all = await collectFiles(dir, { ignore: () => false });
  return all.filter((full) => pattern.test(basename(full)));
}

function scanFile(source: string, relFile: string): Violation[] {
  const violations: Violation[] = [];

  // Rule SILENT-DEFAULT-01: prop ?? "" (nullish coalescing to empty string)
  const nullishRe = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\?\?\s*["']/g;
  let m: RegExpExecArray | null;
  while ((m = nullishRe.exec(source)) !== null) {
    const propName = m[1];
    if (!isUiVisibleProp(propName)) continue;
    const pos = findPosition(source, m.index);
    violations.push({
      file: relFile,
      line: pos.line,
      column: pos.column,
      rule: "SILENT-DEFAULT-01",
      severity: "error",
      pattern: `?? ""`,
      propName,
      message: `Empty-string nullish fallback on UI-visible prop \`${propName}\` renders invisible text instead of failing`,
      fixHint: `Remove \`?? ""\`; declare \`${propName}\` as required in section manifest propsSchema with minLength: 1`,
    });
  }

  // Rule SILENT-DEFAULT-02: prop = "" (default value in destructuring)
  const destructRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*""/g;
  while ((m = destructRe.exec(source)) !== null) {
    const propName = m[1];
    // Skip if preceded by hyphen (e.g. `aria-label=""` in JSX markup)
    if (m.index > 0 && source[m.index - 1] === "-") continue;
    if (!isUiVisibleProp(propName)) continue;
    // Narrow context: must be inside a JS/TS block (brace depth > 0).
    // HTML/JSX attributes sit at brace depth 0 and are skipped.
    let braceDepth = 0;
    for (let i = 0; i < m.index; i++) {
      if (source[i] === "{") braceDepth++;
      else if (source[i] === "}") braceDepth--;
    }
    if (braceDepth <= 0) continue;
    const pos = findPosition(source, m.index);
    violations.push({
      file: relFile,
      line: pos.line,
      column: pos.column,
      rule: "SILENT-DEFAULT-02",
      severity: "error",
      pattern: `= ""`,
      propName,
      message: `Empty-string default value on UI-visible prop \`${propName}\` in destructuring`,
      fixHint: `Remove \`= ""\`; declare \`${propName}\` as required in section manifest propsSchema with minLength: 1`,
    });
  }

  // Rule SILENT-DEFAULT-03: defaultContent = { ..., prop: "", ... }
  // We look for defaultContent objects and check if any property has empty string
  const defaultContentRe = /defaultContent\s*[:=]\s*\{/g;
  while ((m = defaultContentRe.exec(source)) !== null) {
    const objStart = m.index + m[0].length - 1; // position of '{'
    const objEnd = findObjectEnd(source, objStart);
    if (objEnd === -1) continue;
    const objBody = source.slice(objStart + 1, objEnd);

    // Find empty-string properties inside the object
    const emptyPropRe = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*["']/g;
    let em: RegExpExecArray | null;
    while ((em = emptyPropRe.exec(objBody)) !== null) {
      const propName = em[1];
      if (!isUiVisibleProp(propName)) continue;
      // Verify the value is actually empty (next char is the closing quote)
      const valueStart = em.index + em[0].length - 1; // position of opening quote
      const nextChar = objBody[valueStart + 1];
      if (nextChar !== '"' && nextChar !== "'") continue; // not empty
      const pos = findPosition(source, objStart + 1 + em.index);
      violations.push({
        file: relFile,
        line: pos.line,
        column: pos.column,
        rule: "SILENT-DEFAULT-03",
        severity: "error",
        pattern: `defaultContent`,
        propName,
        message: `Empty-string value for UI-visible prop \`${propName}\` inside \`defaultContent\` object`,
        fixHint: `Remove \`defaultContent\` fallback; rely on manifest schema + page.block.validate (B-03) to guarantee presence`,
      });
    }
  }

  // Rule SILENT-DEFAULT-04: prop || "" (logical OR to empty string)
  const orRe = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\|\|\s*["']/g;
  while ((m = orRe.exec(source)) !== null) {
    const propName = m[1];
    if (!isUiVisibleProp(propName)) continue;
    const pos = findPosition(source, m.index);
    violations.push({
      file: relFile,
      line: pos.line,
      column: pos.column,
      rule: "SILENT-DEFAULT-04",
      severity: "error",
      pattern: `|| ""`,
      propName,
      message: `Empty-string logical-OR fallback on UI-visible prop \`${propName}\``,
      fixHint: `Remove \`|| ""\`; declare \`${propName}\` as required in section manifest propsSchema with minLength: 1`,
    });
  }

  return violations;
}

/** Find the matching closing brace for an opening brace at `start`. */
function findObjectEnd(source: string, start: number): number {
  let depth = 1;
  let inString: string | null = null;
  let escaped = false;
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (inString) {
      if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export async function runUiSilentDefaultsLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SilentDefaultsResult>> {
  const workspaceRoot = context.workspaceRoot;
  const scanPath = input.flags.path
    ? join(workspaceRoot, String(input.flags.path))
    : join(workspaceRoot, "packages", "ui", "src");

  const files = await walkFiles(scanPath, /\.(astro|ts|tsx)$/);
  const allViolations: Violation[] = [];

  for (const file of files) {
    const relFile = relative(workspaceRoot, file).replace(/\\/g, "/");
    const source = await readFile(file, "utf-8");
    const v = scanFile(source, relFile);
    allViolations.push(...v);
  }

  const scanned = files.length;

  if (allViolations.length > 0) {
    return {
      exitCode: 1,
      data: {
        command: "ui.silent-defaults.lint",
        status: "fail",
        scanned,
        violations: allViolations,
      },
      summary: `ui.silent-defaults.lint: ${allViolations.length} violation(s) in ${scanned} file(s)`,
    };
  }

  return {
    exitCode: 0,
    data: {
      command: "ui.silent-defaults.lint",
      status: "pass",
      scanned,
      violations: [],
    },
    summary: `ui.silent-defaults.lint: OK (${scanned} files scanned)`,
  };
}
