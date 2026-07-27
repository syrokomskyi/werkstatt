/*
<MODULE_CONTRACT>
<purpose>
  RFC-0230 workspace validator for UI-facing helpers in `@gogol/share`.
  The command scans a small target registry rather than the whole package, so
  public copy surfaces are governed without flagging schema/protocol constants.
</purpose>
<non-goals>
  <item>Do not scan app content or `packages/ui`; those surfaces have their own validators.</item>
  <item>Do not ban enum values, schema keys, command ids, diagnostics, paths, or protocol constants.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0230: add `share.i18n.lint` with Material Credits as the first classified target.</item>
</CHANGE_SUMMARY>
*/

import { readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { collectFiles } from "@gogol/share/fs";

type ShareI18nRule = "SHARE-I18N-01" | "SHARE-I18N-02" | "SHARE-I18N-03";
type ShareI18nSeverity = "error" | "warning";

interface ShareI18nAllowlistEntry {
  exportName: string;
  reason: string;
}

export interface ShareI18nTarget {
  path: string;
  publicSurface: "ui-helper" | "generated-page-helper" | "semantic-public-text";
  mode: "fail-hard" | "classify-first";
  allowlistedExports?: ShareI18nAllowlistEntry[];
}

export interface ShareI18nViolation {
  file: string;
  line: number;
  column: number;
  rule: ShareI18nRule;
  severity: ShareI18nSeverity;
  message: string;
  excerpt: string;
  fixHint: string;
}

interface ShareI18nLintResult {
  command: "share.i18n.lint";
  status: "pass" | "warn" | "fail";
  scannedFiles: number;
  violations: ShareI18nViolation[];
}

export const SHARE_I18N_TARGETS: ShareI18nTarget[] = [
  {
    path: "packages/share/src/schemas/material-credit.ts",
    publicSurface: "generated-page-helper",
    mode: "fail-hard",
  },
];

function findPosition(source: string, index: number): { line: number; column: number } {
  const lines = source.slice(0, index).split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function isHumanReadableString(str: string): boolean {
  if (str.length <= 2) return false;
  if (!/[a-zA-Z\p{L}]/u.test(str)) return false;
  if (/\s/.test(str)) return true;
  return /[.!?;:]/.test(str);
}

function isLocalizedLabelLiteral(str: string): boolean {
  if (str.length <= 2) return false;
  if (!/[a-zA-Z\p{L}]/u.test(str)) return false;
  if (str.startsWith("/") || str.startsWith("http://") || str.startsWith("https://")) return false;
  if (str.includes("${")) return false;
  return true;
}

function isImplementationLiteral(str: string): boolean {
  if (str === "" || str === "..." || str === "-" || str === "—") return true;
  if (!/\s/.test(str) && /^[a-zA-Z0-9_.:/@#{}[\]-]+$/.test(str)) return true;
  if (str.startsWith("/") || str.startsWith("http://") || str.startsWith("https://")) return true;
  if (/^[a-z0-9_.:-]+$/.test(str)) return true;
  if (/^[A-Z0-9_:-]+$/.test(str)) return true;
  if (str.includes("${")) return true;
  return false;
}

function findCallRanges(
  source: string,
  callPattern: RegExp,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = callPattern.exec(source)) !== null) {
    const open = source.indexOf("(", match.index);
    if (open < 0) continue;

    let depth = 0;
    let quote: string | null = null;
    let escaped = false;
    for (let i = open; i < source.length; i++) {
      const ch = source[i]!;
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          ranges.push({ start: match.index, end: i + 1 });
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

function isInsideRange(index: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function findAllowlistedRanges(
  source: string,
  entries: ShareI18nAllowlistEntry[] = [],
): Array<{ start: number; end: number; reason: string }> {
  const ranges: Array<{ start: number; end: number; reason: string }> = [];
  for (const entry of entries) {
    const declaration = new RegExp(
      `(?:export\\s+)?const\\s+${entry.exportName}\\b|(?:export\\s+)?function\\s+${entry.exportName}\\b`,
      "g",
    );
    let match: RegExpExecArray | null;
    while ((match = declaration.exec(source)) !== null) {
      const start = match.index;
      const nextExport = source
        .slice(start + 1)
        .search(/\nexport\s+(?:const|function|interface|type)\s+/);
      const nextTopConst = source.slice(start + 1).search(/\nconst\s+[A-Z0-9_]+\b/);
      const candidates = [nextExport, nextTopConst]
        .filter((index) => index >= 0)
        .map((index) => start + 1 + index);
      ranges.push({
        start,
        end: candidates.length > 0 ? Math.min(...candidates) : source.length,
        reason: entry.reason,
      });
    }
  }
  return ranges;
}

function classifyRule(
  source: string,
  literalIndex: number,
  target: ShareI18nTarget,
): ShareI18nRule {
  const before = source.slice(Math.max(0, literalIndex - 500), literalIndex);
  if (/\bLABELS\s*:\s*Record\b/.test(before) || /\bLABELS\s*=/.test(before)) return "SHARE-I18N-02";
  return target.mode === "classify-first" ? "SHARE-I18N-03" : "SHARE-I18N-01";
}

export function scanShareI18nSource(
  source: string,
  relFile: string,
  target: ShareI18nTarget,
): ShareI18nViolation[] {
  const violations: ShareI18nViolation[] = [];
  const protectedRanges = [
    ...findDiagnosticRanges(source),
    ...findAllowlistedRanges(source, target.allowlistedExports),
  ];
  const stringLiteral = /(["'])(?:(?!\1)[^\\]|\\.)*?\1/g;
  let match: RegExpExecArray | null;

  while ((match = stringLiteral.exec(source)) !== null) {
    const raw = match[0];
    if (raw.includes("\n")) continue;
    if (isInsideRange(match.index, protectedRanges)) continue;

    const content = raw.slice(1, -1);
    const rule = classifyRule(source, match.index, target);
    const isVisibleCopy =
      rule === "SHARE-I18N-02"
        ? isLocalizedLabelLiteral(content)
        : isHumanReadableString(content) && !isImplementationLiteral(content);
    if (!isVisibleCopy) continue;

    const pos = findPosition(source, match.index);
    const severity: ShareI18nSeverity = rule === "SHARE-I18N-03" ? "warning" : "error";
    violations.push({
      file: relFile,
      line: pos.line,
      column: pos.column,
      rule,
      severity,
      message:
        rule === "SHARE-I18N-02"
          ? "Hardcoded localized label map in @gogol/share must be extracted or explicitly allowed."
          : "Human-readable string literal in a UI-facing @gogol/share helper must be extracted or explicitly allowed.",
      excerpt: content.slice(0, 80),
      fixHint:
        "Move visible text to an approved localization surface, or add a narrow reviewed allowlist entry with a reason.",
    });
  }

  return violations;
}

async function walkFiles(path: string): Promise<string[]> {
  let info;
  try {
    info = await stat(path);
  } catch {
    return [];
  }
  if (info.isFile()) return /\.(ts|tsx)$/.test(path) ? [path] : [];
  if (!info.isDirectory()) return [];

  return collectFiles(path, { extensions: [".ts", ".tsx"], ignore: () => false });
}

function targetForPath(relFile: string, overridePath: boolean): ShareI18nTarget | undefined {
  const registered = SHARE_I18N_TARGETS.find((target) => target.path === relFile);
  if (registered) return registered;
  if (!overridePath) return undefined;
  return {
    path: relFile,
    publicSurface: "ui-helper",
    mode: "classify-first",
  };
}

export async function runShareI18nLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ShareI18nLintResult>> {
  const command = "share.i18n.lint";
  const workspaceRoot = context.workspaceRoot;
  const override = input.flags.path ? String(input.flags.path) : undefined;
  const files = override
    ? await walkFiles(join(workspaceRoot, override))
    : (
        await Promise.all(
          SHARE_I18N_TARGETS.map((target) => walkFiles(join(workspaceRoot, target.path))),
        )
      ).flat();

  const violations: ShareI18nViolation[] = [];
  for (const file of files) {
    const relFile = relative(workspaceRoot, file).replace(/\\/g, "/");
    const target = targetForPath(relFile, Boolean(override));
    if (!target) continue;
    const source = await readFile(file, "utf-8").catch(() => "");
    violations.push(...scanShareI18nSource(source, relFile, target));
  }

  const errors = violations.filter((violation) => violation.severity === "error").length;
  const warnings = violations.filter((violation) => violation.severity === "warning").length;
  const status: ShareI18nLintResult["status"] =
    errors > 0 ? "fail" : warnings > 0 ? "warn" : "pass";

  return {
    exitCode: errors > 0 ? 1 : 0,
    data: {
      command,
      status,
      scannedFiles: files.length,
      violations,
    },
    summary:
      errors > 0 || warnings > 0
        ? `${command}: ${errors} error(s), ${warnings} warning(s) (${files.length} files scanned)`
        : `${command}: OK (${files.length} files scanned)`,
  };
}
