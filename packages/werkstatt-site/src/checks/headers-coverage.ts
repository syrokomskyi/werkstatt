/*
<MODULE_CONTRACT>
<purpose>
  RFC-0904: Post-build validator that cross-references _headers path patterns
  against files in dist/client/. Emits warnings for orphan patterns
  (HDR-COV-01) and errors for typed files without matching path patterns
  (HDR-COV-02). Tracked types: .pdf, .mp4, .webm, .svg.
</purpose>
<non-goals>
  <item>Do not validate header values — headers.security.validate (HDR-01..07) owns that.</item>
  <item>Do not validate CSP directive correctness — csp.elements.validate and csp.origins.validate own that.</item>
  <item>Do not check HTML, CSS, JS, or common image formats — _headers.template already covers them via broad patterns.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0904: initial implementation — headers.coverage.validate with HDR-COV-01 (orphan pattern) and HDR-COV-02 (uncovered typed file) rules.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import picomatch from "picomatch";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectFiles } from "@warpgogol/werkstatt-shared/share/fs";
import { diagnosticsResult, passResult } from "./result-helpers.ts";

const COMMAND = "headers.coverage.validate";

const TRACKED_EXTENSIONS = [".pdf", ".mp4", ".webm", ".svg"];

interface HeadersPattern {
  pattern: string;
  line: number;
}

function parseHeadersPatterns(headersContent: string): HeadersPattern[] {
  const patterns: HeadersPattern[] = [];
  const lines = headersContent.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("/") && !trimmed.includes(" ")) {
      patterns.push({ pattern: trimmed, line: i + 1 });
    }
  }
  return patterns;
}

function headersPatternToPicomatch(pattern: string): string {
  if (pattern === "/") return "*";
  if (pattern === "/*") return "**";
  let p = pattern;
  if (p.startsWith("/")) p = p.slice(1);
  return p;
}

function matchesFile(pattern: string, filePath: string): boolean {
  const glob = headersPatternToPicomatch(pattern);
  try {
    const matcher = picomatch(glob, { dot: true });
    return matcher(filePath);
  } catch {
    return false;
  }
}

export async function runHeadersCoverageValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(ctx);
  const headersPath = join(paths.publicDirectory, "_headers");
  const distDir = join(paths.appDirectory, "dist", "client");

  if (!existsSync(headersPath)) {
    return passResult(
      COMMAND,
      `${COMMAND}: no public/_headers — skipped (headers.security.validate handles HDR-01)`,
    );
  }

  if (!existsSync(distDir)) {
    return passResult(COMMAND, `${COMMAND}: no dist/client/ — skipped`);
  }

  const headersContent = await readFile(headersPath, "utf8");
  const patterns = parseHeadersPatterns(headersContent);

  if (patterns.length === 0) {
    return passResult(COMMAND, `${COMMAND}: no path patterns in _headers — skipped`);
  }

  const allFiles = await collectFiles(distDir, { ignore: () => false });
  const relativeFiles = allFiles.map((f) => relative(distDir, f));

  const diagnostics: Diagnostic[] = [];

  for (const { pattern, line } of patterns) {
    const hasMatch = relativeFiles.some((f) => matchesFile(pattern, f));
    if (!hasMatch) {
      diagnostics.push({
        ruleId: "HDR-COV-01",
        severity: "warning",
        file: headersPath,
        line,
        message: `Path pattern ${pattern} matches no files in dist/client/`,
        fixHint: `Remove orphan path pattern or add files matching it`,
      });
    }
  }

  for (const file of relativeFiles) {
    const ext = file.toLowerCase().slice(file.lastIndexOf("."));
    if (!TRACKED_EXTENSIONS.includes(ext)) continue;

    const hasMatch = patterns.some((p) => matchesFile(p.pattern, file));
    if (!hasMatch) {
      diagnostics.push({
        ruleId: "HDR-COV-02",
        severity: "error",
        file: join(distDir, file),
        message: `File ${ext} has no matching _headers path pattern — will be served without explicit Cache-Control`,
        fixHint: `Add a path pattern for *${ext} files to public/_headers with appropriate Cache-Control`,
      });
    }
  }

  if (diagnostics.length === 0) {
    return passResult(COMMAND, `${COMMAND}: OK — all patterns and tracked files covered`);
  }

  return diagnosticsResult(COMMAND, diagnostics);
}
