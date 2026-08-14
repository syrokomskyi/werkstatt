/*
<MODULE_CONTRACT>
<purpose>Lint CSS files and Astro inline style blocks for mobile layout anti-patterns that cause horizontal overflow or layout shift on mobile devices.</purpose>
<non-goals>
  <item>Do not perform dynamic checks (JS resize handlers, content-induced overflow) — that is RFC-0838.</item>
  <item>Do not modify CSS files — this validator is read-only.</item>
  <item>Do not check non-CSS files (plain .ts/.tsx scripts are out of scope).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0837: initial implementation with six mobile layout anti-pattern rules.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { getLineColumn } from "@warpgogol/werkstatt-site/share/text-position";

interface MobileLayoutViolation {
  filePath: string;
  line: number;
  column: number;
  ruleId: string;
  message: string;
  suggestion: string;
}

interface MobileLayoutLintResult {
  command: "css.mobile-layout.lint";
  violations: number;
  files: number;
  violationsByRule: Record<string, number>;
}

const RULE_MESSAGES: Record<
  string,
  { message: string; suggestion: string; severity: "error" | "warning" }
> = {
  "MOBILE-CSS-01": {
    message:
      "100vh causes layout shift on mobile. Use 100dvh (with 100vh fallback for older browsers).",
    suggestion: "height: 100vh; height: 100dvh;",
    severity: "error",
  },
  "MOBILE-CSS-02": {
    message:
      "100vw with padding/border causes horizontal overflow. Use 100% or calc(100vw - scrollbar-width).",
    suggestion: "width: 100%; box-sizing: border-box;",
    severity: "error",
  },
  "MOBILE-CSS-03": {
    message: "Fixed width exceeds mobile viewport without max-width: 100% safety net.",
    suggestion: "Add max-width: 100% to the rule.",
    severity: "error",
  },
  "MOBILE-CSS-04": {
    message: "Negative margin on root container causes horizontal overflow on mobile.",
    suggestion: "Remove negative margin or use a media query for larger viewports.",
    severity: "error",
  },
  "MOBILE-CSS-05": {
    message:
      "Fixed-position element wider than mobile viewport causes permanent horizontal overflow.",
    suggestion: "Use max-width: 100vw or a responsive width.",
    severity: "error",
  },
  "MOBILE-CSS-06": {
    message:
      "white-space: nowrap without overflow-wrap or word-break may cause horizontal overflow on mobile.",
    suggestion: "Add overflow-wrap: break-word or word-break: break-word.",
    severity: "warning",
  },
};

const ROOT_SELECTORS = new Set(["body", "main", "html", ":root"]);

interface CssRule {
  selector: string;
  body: string;
  startLine: number;
  startOffset: number;
}

interface StyleBlock {
  content: string;
  startLine: number;
  startOffset: number;
}

function extractStyleBlocks(source: string): StyleBlock[] {
  const blocks: StyleBlock[] = [];
  const styleTagRe = /<style(\s[^>]*)?\s*>/gi;
  const closeTagRe = /<\/style\s*>/gi;

  let openMatch: RegExpExecArray | null;
  while ((openMatch = styleTagRe.exec(source)) !== null) {
    const contentStart = openMatch.index + openMatch[0].length;
    closeTagRe.lastIndex = contentStart;
    const closeMatch = closeTagRe.exec(source);
    if (!closeMatch) break;

    const content = source.slice(contentStart, closeMatch.index);
    const startLine = source.slice(0, contentStart).split("\n").length;
    const startOffset = contentStart;

    blocks.push({ content, startLine, startOffset });
  }

  return blocks;
}

function parseCssRules(source: string, baseLine: number, baseOffset: number): CssRule[] {
  const rules: CssRule[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const braceStart = source.indexOf("{", i);
    if (braceStart === -1) break;

    const braceEnd = findMatchingBrace(source, braceStart);
    if (braceEnd === -1) break;

    const selector = source.slice(i, braceStart).trim();
    const body = source.slice(braceStart + 1, braceEnd);
    const startLine = baseLine + source.slice(0, i).split("\n").length - 1;
    const startOffset = baseOffset + i;

    if (selector) {
      rules.push({ selector, body, startLine, startOffset });
    }

    i = braceEnd + 1;
  }

  return rules;
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 1;
  for (let i = openIndex + 1; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface MediaBlock {
  start: number;
  end: number;
}

function findMinWidthMediaBlocks(source: string, baseOffset: number): MediaBlock[] {
  const blocks: MediaBlock[] = [];
  let i = 0;
  while (i < source.length) {
    const mediaIdx = source.indexOf("@media", i);
    if (mediaIdx === -1) break;
    const braceStart = source.indexOf("{", mediaIdx);
    if (braceStart === -1) break;
    const mediaQuery = source.slice(mediaIdx, braceStart);
    const braceEnd = findMatchingBrace(source, braceStart);
    if (braceEnd === -1) break;
    if (/min-width\s*:\s*\d+px/i.test(mediaQuery)) {
      blocks.push({
        start: baseOffset + mediaIdx,
        end: baseOffset + braceEnd,
      });
    }
    i = braceEnd + 1;
  }
  return blocks;
}

function isInsideMinWidthMedia(rule: CssRule, mediaBlocks: MediaBlock[]): boolean {
  for (const block of mediaBlocks) {
    if (rule.startOffset >= block.start && rule.startOffset <= block.end) {
      return true;
    }
  }
  return false;
}

function getRuleProperty(body: string, prop: string): string | null {
  const re = new RegExp(`(?:^|;|\\{)\\s*${prop}\\s*:\\s*([^;]+)`, "i");
  const match = body.match(re);
  return match ? match[1].trim() : null;
}

function hasProperty(body: string, prop: string): boolean {
  const re = new RegExp(`(?:^|;|\\{)\\s*${prop}\\s*:`, "i");
  return re.test(body);
}

function getNumericValue(value: string): number | null {
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*px/i);
  return match ? parseFloat(match[1]) : null;
}

function detectViolations(
  rule: CssRule,
  fullSource: string,
  mediaBlocks: MediaBlock[],
  relativePath: string,
): MobileLayoutViolation[] {
  const violations: MobileLayoutViolation[] = [];
  const body = rule.body;

  if (isInsideMinWidthMedia(rule, mediaBlocks)) {
    return violations;
  }

  if (hasProperty(body, "height") && /100vh/i.test(body) && !/100dvh/i.test(body)) {
    violations.push(
      makeViolation(relativePath, fullSource, rule.startOffset, rule, "MOBILE-CSS-01"),
    );
  }

  if (hasProperty(body, "width") && /100vw/i.test(body)) {
    if (hasProperty(body, "padding") || hasProperty(body, "border")) {
      violations.push(
        makeViolation(relativePath, fullSource, rule.startOffset, rule, "MOBILE-CSS-02"),
      );
    }
  }

  if (hasProperty(body, "width")) {
    const widthValue = getRuleProperty(body, "width");
    if (widthValue) {
      const px = getNumericValue(widthValue);
      if (px !== null && px > 380 && !hasProperty(body, "max-width")) {
        violations.push(
          makeViolation(relativePath, fullSource, rule.startOffset, rule, "MOBILE-CSS-03"),
        );
      }
    }
  }

  const selectorLower = rule.selector.toLowerCase().trim();
  const isRootSelector =
    ROOT_SELECTORS.has(selectorLower) ||
    /\b(body|main|html)\b/.test(selectorLower) ||
    /^section\b/i.test(selectorLower);

  if (isRootSelector && hasProperty(body, "margin")) {
    const marginValue = getRuleProperty(body, "margin");
    if (marginValue) {
      const hasNegative = /-\d/.test(marginValue);
      if (hasNegative) {
        violations.push(
          makeViolation(relativePath, fullSource, rule.startOffset, rule, "MOBILE-CSS-04"),
        );
      }
    }
  }

  if (/position\s*:\s*fixed/i.test(body) && hasProperty(body, "width")) {
    const widthValue = getRuleProperty(body, "width");
    if (widthValue) {
      const px = getNumericValue(widthValue);
      if (px !== null && px > 430) {
        violations.push(
          makeViolation(relativePath, fullSource, rule.startOffset, rule, "MOBILE-CSS-05"),
        );
      }
    }
  }

  if (/white-space\s*:\s*nowrap/i.test(body)) {
    if (!hasProperty(body, "overflow-wrap") && !hasProperty(body, "word-break")) {
      violations.push(
        makeViolation(relativePath, fullSource, rule.startOffset, rule, "MOBILE-CSS-06"),
      );
    }
  }

  return violations;
}

function makeViolation(
  relativePath: string,
  fullSource: string,
  ruleOffset: number,
  _rule: CssRule,
  ruleId: string,
): MobileLayoutViolation {
  const { line, column } = getLineColumn(fullSource, ruleOffset);
  const meta = RULE_MESSAGES[ruleId];
  return {
    filePath: relativePath,
    line,
    column,
    ruleId,
    message: meta.message,
    suggestion: meta.suggestion,
  };
}

async function collectAllFiles(
  appDir: string,
  workspaceRoot: string,
): Promise<{
  files: Array<{ path: string; content: string; relativePath: string }>;
  count: number;
}> {
  const results: Array<{ path: string; content: string; relativePath: string }> = [];

  const appStylesDir = join(appDir, "src", "styles");
  const appCssFiles = await collectFiles(appStylesDir, { extensions: [".css"] });
  for (const filePath of appCssFiles) {
    const content = await readFile(filePath, "utf-8").catch(() => "");
    if (!content) continue;
    const relativePath = relative(appDir, filePath).replace(/\\/g, "/");
    results.push({ path: filePath, content, relativePath });
  }

  const appPagesDir = join(appDir, "src", "pages");
  const appAstroFiles = await collectFiles(appPagesDir, { extensions: [".astro"] });
  for (const filePath of appAstroFiles) {
    const content = await readFile(filePath, "utf-8").catch(() => "");
    if (!content) continue;
    const relativePath = relative(appDir, filePath).replace(/\\/g, "/");
    results.push({ path: filePath, content, relativePath });
  }

  const uiDir = resolve(workspaceRoot, "packages", "werkstatt-site", "src", "domain", "ui");
  const uiCssFiles = await collectFiles(uiDir, { extensions: [".css"] });
  for (const filePath of uiCssFiles) {
    const content = await readFile(filePath, "utf-8").catch(() => "");
    if (!content) continue;
    const relativePath = relative(workspaceRoot, filePath).replace(/\\/g, "/");
    results.push({ path: filePath, content, relativePath });
  }

  const uiAstroFiles = await collectFiles(uiDir, { extensions: [".astro"] });
  for (const filePath of uiAstroFiles) {
    const content = await readFile(filePath, "utf-8").catch(() => "");
    if (!content) continue;
    const relativePath = relative(workspaceRoot, filePath).replace(/\\/g, "/");
    results.push({ path: filePath, content, relativePath });
  }

  return { files: results, count: results.length };
}

function scanContent(
  content: string,
  relativePath: string,
  isAstro: boolean,
): MobileLayoutViolation[] {
  const violations: MobileLayoutViolation[] = [];

  if (isAstro) {
    const blocks = extractStyleBlocks(content);
    for (const block of blocks) {
      const mediaBlocks = findMinWidthMediaBlocks(block.content, block.startOffset);
      const rules = parseCssRules(block.content, block.startLine, block.startOffset);
      for (const rule of rules) {
        violations.push(...detectViolations(rule, content, mediaBlocks, relativePath));
      }
    }
  } else {
    const mediaBlocks = findMinWidthMediaBlocks(content, 0);
    const rules = parseCssRules(content, 1, 0);
    for (const rule of rules) {
      violations.push(...detectViolations(rule, content, mediaBlocks, relativePath));
    }
  }

  return violations;
}

export async function runCssMobileLayoutLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MobileLayoutLintResult>> {
  const mode = (input.flags.mode as string) || "error";
  const isWarningMode = mode === "warning";

  const paths = requireAstroSitePaths(context);
  const { files, count } = await collectAllFiles(paths.appDirectory, context.workspaceRoot);

  const allViolations: MobileLayoutViolation[] = [];

  for (const file of files) {
    const isAstro = file.path.endsWith(".astro");
    const violations = scanContent(file.content, file.relativePath, isAstro);
    allViolations.push(...violations);
  }

  const violationsByRule: Record<string, number> = {};
  for (const v of allViolations) {
    violationsByRule[v.ruleId] = (violationsByRule[v.ruleId] || 0) + 1;
  }

  for (const v of allViolations) {
    const meta = RULE_MESSAGES[v.ruleId];
    const logMsg = `${v.filePath}:${v.line}:${v.column} ${v.ruleId}: ${v.message}`;
    if (meta.severity === "warning" || isWarningMode) {
      context.logger.warn(logMsg);
    } else {
      context.logger.error(logMsg);
    }
  }

  const hasErrors = allViolations.some((v) => RULE_MESSAGES[v.ruleId].severity === "error");
  const exitCode = !isWarningMode && hasErrors ? 1 : 0;

  return {
    data: {
      command: "css.mobile-layout.lint",
      violations: allViolations.length,
      files: count,
      violationsByRule,
    },
    exitCode,
    summary:
      allViolations.length === 0
        ? `[css.mobile-layout.lint] OK (${count} files checked)`
        : isWarningMode
          ? `[css.mobile-layout.lint] ${allViolations.length} warning(s) (${count} files checked)`
          : undefined,
  };
}
