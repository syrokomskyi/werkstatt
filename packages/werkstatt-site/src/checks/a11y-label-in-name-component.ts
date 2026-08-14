/*
<MODULE_CONTRACT>
<purpose>
RFC-0836: a11y.label-in-name.component.validate — scan .astro component source
files in packages/werkstatt-site/src/domain/ui/ for interactive elements where
aria-label={...} and visible text {...} are both present but the aria-label
expression does not reference the visible text variable (WCAG 2.5.3 Label in
Name). This is a pre-build static analysis complement to the post-build
a11y.label-in-name.validate (RFC-0832).
</purpose>
<non-goals>
  <item>Do not replace the post-build a11y.label-in-name.validate (RFC-0832) — both validators run.</item>
  <item>Do not validate CSS or non-interactive elements.</item>
  <item>Do not validate server-only .ts files — only .astro component source.</item>
  <item>Do not parse .astro as a full AST — regex-based approach is sufficient for common patterns.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0836: initial — component-level WCAG 2.5.3 Label in Name validator using regex-based .astro scanning.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "./result-helpers.ts";

const RULE_ID = "A11Y-LIN-COMP-01";
const COMMAND_NAME = "a11y.label-in-name.component.validate";
const MESSAGE =
  "aria-label expression does not reference the visible text variable — accessible name may not include visible text (WCAG 2.5.3)";
const FIX_HINT =
  "Merge the visible text into the aria-label or use a resolveLabelInName helper. Pattern: resolvedAriaLabel = ariaLabel && label && !ariaLabel.includes(label) ? `${label} — ${ariaLabel}` : ariaLabel";

const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea"]);
const INTERACTIVE_ROLES = new Set(["button", "link", "checkbox", "radio", "tab", "menuitem"]);

export interface ComponentLabelInNameFinding {
  rule: typeof RULE_ID;
  line: number;
  element: string;
  ariaLabelExpr: string;
  visibleTextExpr: string;
  severity: "error";
  message: string;
  fixHint: string;
}

function hasInteractiveRole(line: string): boolean {
  const roleMatch = line.match(/role\s*=\s*"([^"]+)"/);
  if (!roleMatch) return false;
  return INTERACTIVE_ROLES.has(roleMatch[1]);
}

function getTagName(line: string): string | null {
  const tagMatch = line.match(/<(\w+)/);
  return tagMatch ? tagMatch[1] : null;
}

function extractBraceExpression(line: string, prefix: string): string | null {
  const prefixIdx = line.indexOf(prefix);
  if (prefixIdx === -1) return null;
  const braceStart = line.indexOf("{", prefixIdx);
  if (braceStart === -1) return null;

  let depth = 0;
  for (let i = braceStart; i < line.length; i++) {
    if (line[i] === "{") depth++;
    else if (line[i] === "}") {
      depth--;
      if (depth === 0) {
        return line.substring(braceStart + 1, i).trim();
      }
    }
  }
  return null;
}

function extractElementContent(
  lines: string[],
  startLineIdx: number,
  tagName: string,
): string | null {
  let content = "";
  let foundOpeningEnd = false;
  const ariaLabelIdx = lines[startLineIdx].indexOf("aria-label=");

  for (let i = startLineIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!foundOpeningEnd) {
      const searchFrom = i === startLineIdx ? ariaLabelIdx : 0;
      const gtIdx = line.indexOf(">", searchFrom);
      if (gtIdx !== -1) {
        content = line.substring(gtIdx + 1);
        foundOpeningEnd = true;
        const closingIdx = content.indexOf(`</${tagName}>`);
        if (closingIdx !== -1) {
          return content.substring(0, closingIdx);
        }
      }
    } else {
      const closingIdx = line.indexOf(`</${tagName}>`);
      if (closingIdx !== -1) {
        content += "\n" + line.substring(0, closingIdx);
        return content;
      }
      content += "\n" + line;
    }
  }
  return null;
}

function extractVisibleTextExprs(content: string): string[] {
  const textOnly = content.replace(/<[^>]*>/g, "");
  const exprs: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(textOnly)) !== null) {
    const expr = match[1].trim();
    if (/^(props\.\w+|content\.\w+|[a-zA-Z_]\w*)$/.test(expr)) {
      exprs.push(expr);
    }
  }
  return exprs;
}

function getVariableName(expr: string): string {
  const parts = expr.split(".");
  return parts[parts.length - 1];
}

export function extractComponentLabelInNameViolations(
  astroSource: string,
): ComponentLabelInNameFinding[] {
  const findings: ComponentLabelInNameFinding[] = [];
  const lines = astroSource.split(/\r?\n/);

  let startLine = 0;
  if (lines[0]?.startsWith("---")) {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].startsWith("---")) {
        startLine = i + 1;
        break;
      }
    }
  }

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];

    if (!line.includes("aria-label=")) continue;

    const tagName = getTagName(line);
    if (!tagName) continue;

    if (!INTERACTIVE_TAGS.has(tagName) && !hasInteractiveRole(line)) continue;

    if (line.includes("/>")) continue;

    const ariaLabelExpr = extractBraceExpression(line, "aria-label=");
    if (!ariaLabelExpr) continue;

    const content = extractElementContent(lines, i, tagName);
    if (!content) continue;

    const visibleTextExprs = extractVisibleTextExprs(content);
    if (visibleTextExprs.length === 0) continue;

    for (const visibleTextExpr of visibleTextExprs) {
      const varName = getVariableName(visibleTextExpr);
      if (!ariaLabelExpr.toLowerCase().includes(varName.toLowerCase())) {
        findings.push({
          rule: RULE_ID,
          line: i + 1,
          element: tagName,
          ariaLabelExpr: `{${ariaLabelExpr}}`,
          visibleTextExpr: `{${visibleTextExpr}}`,
          severity: "error",
          message: MESSAGE,
          fixHint: FIX_HINT,
        });
      }
    }
  }

  return findings;
}

export async function runA11yLabelInNameComponentValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];

  const uiDir = join(context.workspaceRoot, "packages", "werkstatt-site", "src", "domain", "ui");

  const astroFiles = await collectFiles(uiDir, { extensions: [".astro"] });

  for (const file of astroFiles) {
    const raw = await readFile(file, "utf-8").catch(() => "");
    if (!raw) continue;

    const relPath = relative(context.workspaceRoot, file).replace(/\\/g, "/");
    const findings = extractComponentLabelInNameViolations(raw);

    for (const finding of findings) {
      diagnostics.push({
        ruleId: RULE_ID,
        severity: "error",
        file: relPath,
        line: finding.line,
        message: MESSAGE,
        fixHint: FIX_HINT,
        data: {
          element: finding.element,
          ariaLabelExpr: finding.ariaLabelExpr,
          visibleTextExpr: finding.visibleTextExpr,
        },
      });
    }
  }

  return diagnosticsResult(COMMAND_NAME, diagnostics);
}
