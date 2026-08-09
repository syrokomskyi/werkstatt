/*
<MODULE_CONTRACT>
<purpose>
  RFC-0601: generated.drift.validate — detects content drift in text-based
  generated files by re-invoking their owning generator with dryRun: true and
  comparing the rendered output against the committed file on disk. Enforces
  DNA-58 (generated-file content determinism).
</purpose>
<non-goals>
  <item>Do not check binary files — their determinism is covered by RFC-0603.</item>
  <item>Do not check file existence — that is the domain of generated.files.validate (RFC-0375).</item>
  <item>Do not check for stale files — that is the domain of generated.stale.validate (RFC-0600).</item>
  <item>Do not auto-fix drift — the command is read-only; operators must re-run the generator.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0601: initial implementation.</item>
  <item>RFC-0645: promote DRIFT-02 from info to error — generators without dryRun support now fail validation.</item>
</CHANGE_SUMMARY>
*/
import { join, relative } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelExecutionReport,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { executeKernelCommand } from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "./result-helpers.ts";
import { GENERATOR_OWNERSHIP_MAP } from "./generator-ownership.ts";
import {
  toPosix,
  isWorkspaceAbsolute,
  hasGlobPattern,
  resolveEntryPath,
  expandGlob,
} from "./generated-files-validate.ts";
import { SITES_BUILD_PREPARE_PIPELINE } from "./pipelines/build-prepare.ts";

const BINARY_EXTENSIONS = [
  ".png",
  ".ico",
  ".webp",
  ".mp4",
  ".webm",
  ".jpg",
  ".jpeg",
  ".gif",
  ".tiff",
  ".heic",
  ".heif",
  ".svg",
];

const BUILD_PREPARE_COMMANDS = new Set(SITES_BUILD_PREPARE_PIPELINE.map((step) => step.command));

function isBinaryFile(path: string): boolean {
  const lower = path.toLowerCase();
  return BINARY_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function normalizeContent(s: string): string {
  return s.replace(/\r\n/g, "\n").trim();
}

async function getGitTrackedFiles(
  context: KernelRuntimeContext,
  siteDir: string,
): Promise<Set<string>> {
  const relSiteDir = toPosix(relative(context.workspaceRoot, siteDir));
  const result = await context.io.exec("git", ["ls-files", "--", relSiteDir], {
    cwd: context.workspaceRoot,
  });
  const files = new Set<string>();
  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) files.add(trimmed);
  }
  return files;
}

interface RenderedFilesData {
  renderedFiles?: Record<string, string>;
}

function extractRenderedFiles(report: KernelExecutionReport): Record<string, string> | undefined {
  const data = report.data as RenderedFilesData | undefined;
  return data?.renderedFiles;
}

export async function runGeneratedDriftValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = input.flags.site as string | undefined;
  const diagnostics: Diagnostic[] = [];

  const siteDir =
    context.site?.directory ?? (app ? join(context.workspaceRoot, "apps", app) : undefined);
  if (!siteDir) {
    return diagnosticsResult("generated.drift.validate", []);
  }

  let gitTracked: Set<string>;
  try {
    gitTracked = await getGitTrackedFiles(context, siteDir);
  } catch {
    return diagnosticsResult("generated.drift.validate", []);
  }

  const siteName = context.site?.name ?? app;
  if (!siteName) {
    return diagnosticsResult("generated.drift.validate", []);
  }

  const renderedCache = new Map<string, Record<string, string> | undefined>();

  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    if (entry.conditional) continue;
    if (!BUILD_PREPARE_COMMANDS.has(entry.command)) continue;

    const isWorkspaceAbs = isWorkspaceAbsolute(entry.path);
    if (!isWorkspaceAbs && !app && !context.site?.directory) continue;

    const posixPath = toPosix(entry.path);

    let filePaths: string[];
    if (hasGlobPattern(posixPath)) {
      try {
        const basePath = isWorkspaceAbs
          ? context.workspaceRoot
          : (context.site?.directory ?? join(context.workspaceRoot, "apps", app!));
        filePaths = await expandGlob(basePath, posixPath, context.workspaceRoot);
      } catch {
        continue;
      }
    } else {
      const resolved = resolveEntryPath(entry, app, context.workspaceRoot, context.site?.directory);
      filePaths = [resolved];
    }

    for (const absPath of filePaths) {
      if (isBinaryFile(absPath)) continue;

      const relPath = toPosix(relative(context.workspaceRoot, absPath));
      if (!gitTracked.has(relPath)) continue;

      let exists: boolean;
      try {
        exists = await context.io.exists(absPath);
      } catch {
        continue;
      }
      if (!exists) continue;

      if (!renderedCache.has(entry.command)) {
        try {
          const report = await executeKernelCommand({
            workspaceRoot: context.workspaceRoot,
            commandName: entry.command,
            siteName,
            dryRun: true,
            outputFormat: "json",
          });
          const singleReport = Array.isArray(report) ? report[0] : report;
          renderedCache.set(
            entry.command,
            singleReport ? extractRenderedFiles(singleReport) : undefined,
          );
        } catch {
          renderedCache.set(entry.command, undefined);
        }
      }

      const renderedFiles = renderedCache.get(entry.command);
      if (!renderedFiles) {
        diagnostics.push({
          ruleId: "DRIFT-02",
          severity: "error",
          file: relPath,
          message: `Generator "${entry.command}" does not support dryRun mode; cannot verify determinism.`,
          data: { generator: entry.command },
        });
        continue;
      }

      const rendered = renderedFiles[relPath];
      if (rendered === undefined) {
        diagnostics.push({
          ruleId: "DRIFT-02",
          severity: "error",
          file: relPath,
          message: `Generator "${entry.command}" did not render "${relPath}" in dryRun output; cannot verify determinism.`,
          data: { generator: entry.command },
        });
        continue;
      }

      let diskContent: string;
      try {
        diskContent = await context.io.readFile(absPath);
      } catch {
        continue;
      }

      if (normalizeContent(diskContent) !== normalizeContent(rendered)) {
        diagnostics.push({
          ruleId: "DRIFT-01",
          severity: "error",
          file: relPath,
          message: `Committed file "${relPath}" differs from generator "${entry.command}" output.`,
          fixHint: `Re-run: pnpm exec werkstatt run ${entry.command} --site ${siteName}`,
          data: { generator: entry.command },
        });
      }
    }
  }

  return diagnosticsResult("generated.drift.validate", diagnostics);
}
