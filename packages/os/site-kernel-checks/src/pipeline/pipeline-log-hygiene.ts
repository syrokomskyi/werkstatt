/*
<MODULE_CONTRACT>
<purpose>RFC-0254 static hygiene guard for raw pipeline logging in build/check source paths.</purpose>
<non-goals>
  <item>Do not parse Astro or Vite external tool internals.</item>
  <item>Do not ban explicitly allowlisted interactive CLI output.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0254: add pipeline log hygiene validation for structured diagnostic output.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { diagnosticsResult } from "../result-helpers.ts";

const COMMAND = "pipeline.log.hygiene.validate";

const SCAN_ROOTS = [
  "packages/os/site-kernel/src",
  "packages/os/site-kernel-checks/src",
  "packages/os/site-kernel-content/src",
  "packages/business/src",
  "packages/passport/src",
];

const RAW_CONSOLE_RE = /\bconsole\.(log|warn|error)\s*\(/;
const FALLBACK_TEXT_RE = /fallback|not found|lookup miss|using .* fallback/i;

const ALLOWED_RAW_CONSOLE: Record<string, string> = {
  "packages/os/site-kernel/src/logger.ts":
    "kernel logger console transport is the structured renderer",
  "packages/os/site-kernel/src/cli/index.ts":
    "CLI help and JSON passthrough are direct user-facing command output",
  "packages/os/site-kernel-content/src/pipeline-log.ts":
    "pipeline log emitter is the structured renderer for build-time helpers",
  "packages/os/site-kernel-checks/src/contract-full.ts":
    "contract.full prints a human report assembled by the command",
  "packages/os/site-kernel-checks/src/fonts.ts":
    "font generation reports optional source skips during a mutating generator",
  "packages/os/site-kernel-checks/src/passport.ts":
    "passport key rotation is an interactive operator command",
  "packages/os/site-kernel-checks/src/participant.ts":
    "participant validator reports optional source reads",
  "packages/os/site-kernel-checks/src/semantic-mirror.ts":
    "semantic mirror lint degrades on optional source inspection failures",
};

async function collectTsFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "tests" || entry.name.startsWith("old-") || entry.name.startsWith("-"))
        continue;
      files.push(...(await collectTsFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) files.push(fullPath);
  }
  return files;
}

function hasLocalAllowlist(lines: string[], index: number): boolean {
  const previous = lines.slice(Math.max(0, index - 2), index + 1).join("\n");
  const match = previous.match(/pipeline-log-ok:\s*(.+)/);
  return Boolean(match?.[1]?.trim());
}

function diagnostic(
  ruleId: "PIPELINE-LOG-01" | "PIPELINE-LOG-02" | "PIPELINE-LOG-03" | "PIPELINE-LOG-04",
  file: string,
  line: number,
  message: string,
  fixHint: string,
): Diagnostic {
  return { ruleId, severity: "error", file, line, message, fixHint };
}

function scanFile(relativeFile: string, source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split(/\r?\n/);
  const fileAllowlist = ALLOWED_RAW_CONSOLE[relativeFile];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    if (/pipeline-log-ok:/.test(line) && !/pipeline-log-ok:\s*\S+/.test(line)) {
      diagnostics.push(
        diagnostic(
          "PIPELINE-LOG-04",
          relativeFile,
          lineNumber,
          "pipeline-log-ok allowlist comment is missing a rationale.",
          "Add a short rationale after pipeline-log-ok: or remove the raw console call.",
        ),
      );
    }

    if (RAW_CONSOLE_RE.test(line) && !fileAllowlist && !hasLocalAllowlist(lines, index)) {
      diagnostics.push(
        diagnostic(
          "PIPELINE-LOG-01",
          relativeFile,
          lineNumber,
          "Raw console logging in a standard build/check source path.",
          "Return a canonical Diagnostic or emit a structured PipelineLogEvent with a stable dedupeKey.",
        ),
      );
    }

    if (
      FALLBACK_TEXT_RE.test(line) &&
      (RAW_CONSOLE_RE.test(line) || /\blogger\.(warn|error|info)\s*\(/.test(line)) &&
      !source.includes("dedupeKey") &&
      !relativeFile.endsWith("pipeline-log-hygiene.ts")
    ) {
      diagnostics.push(
        diagnostic(
          "PIPELINE-LOG-02",
          relativeFile,
          lineNumber,
          "Fallback-style string literal appears without a structured dedupe key in the file.",
          "Emit expected fallback through PipelineLogEvent and set dedupeKey.",
        ),
      );
      break;
    }

    if (
      /\b(warn|warning|error|critical)\b/i.test(line) &&
      RAW_CONSOLE_RE.test(line) &&
      !fileAllowlist &&
      !hasLocalAllowlist(lines, index) &&
      !source.includes("diagnosticsResult")
    ) {
      diagnostics.push(
        diagnostic(
          "PIPELINE-LOG-03",
          relativeFile,
          lineNumber,
          "Warning-like raw log has no canonical Diagnostic production in this file.",
          "Represent actionable warnings as Diagnostic[] with a registered ruleId.",
        ),
      );
    }
  }

  return diagnostics;
}

export async function runPipelineLogHygieneValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const diagnostics: Diagnostic[] = [];

  for (const scanRoot of SCAN_ROOTS) {
    const absoluteRoot = join(context.workspaceRoot, scanRoot);
    const files = await collectTsFiles(absoluteRoot);
    for (const file of files) {
      const relativeFile = relative(context.workspaceRoot, file).replace(/\\/g, "/");
      const source = await readFile(file, "utf8");
      diagnostics.push(...scanFile(relativeFile, source));
    }
  }

  return diagnosticsResult(COMMAND, diagnostics);
}
