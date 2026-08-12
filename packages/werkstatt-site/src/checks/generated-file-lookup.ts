/*
<MODULE_CONTRACT>
<purpose>
  RFC-0375: generated.file.lookup — agent-facing command that resolves any file
  path to its generation metadata (generated, category, ownerCommand, regenerate
  command, edit-instead target, detection method). Supports --path for single
  lookup and --diff for batch lookup of all changed files in the git diff.
</purpose>
<non-goals>
  <item>Do not validate markers or file existence — use generated.marker.validate or generated.files.validate.</item>
  <item>Do not modify any files — read-only query.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0375: initial implementation.</item>
  <item>RFC-0811: extract pattern-matching utilities to ownership-pattern-match.ts.</item>
</CHANGE_SUMMARY>
*/
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import type { OwnershipEntry } from "./generator-ownership.ts";
import { toPosix, matchOwnershipEntry } from "./ownership-pattern-match.ts";

export interface FileLookupResult {
  command: "generated.file.lookup";
  results: Array<{
    path: string;
    generated: boolean;
    category: "A" | "B" | null;
    ownerCommand: string | null;
    regenerateCommand: string | null;
    editInstead: string | null;
    detectionMethod: "embedded-marker" | "registry-match" | null;
    module: string | null;
  }>;
}

function resolvePath(rawPath: string, app: string | undefined, _workspaceRoot: string): string {
  const posixPath = toPosix(rawPath);

  const isWorkspaceAbsolute =
    posixPath.startsWith("packages/") ||
    posixPath.startsWith("docs/") ||
    posixPath.startsWith("apps/") ||
    posixPath.startsWith(".gitattributes") ||
    posixPath.startsWith(".env");

  if (isWorkspaceAbsolute) {
    return posixPath;
  }

  if (app) {
    return `apps/${app}/${posixPath}`;
  }

  return posixPath;
}

function buildLookupResult(
  relPath: string,
  entry: OwnershipEntry | null,
): FileLookupResult["results"][number] {
  if (!entry) {
    return {
      path: relPath,
      generated: false,
      category: null,
      ownerCommand: null,
      regenerateCommand: null,
      editInstead: null,
      detectionMethod: null,
      module: null,
    };
  }

  const isRegistryOnly = entry.markerPolicy === "registry-only";
  const category = isRegistryOnly ? "B" : "A";
  const regenerateCommand = `pnpm exec werkstatt run ${entry.command}`;

  return {
    path: relPath,
    generated: true,
    category,
    ownerCommand: entry.command,
    regenerateCommand,
    editInstead: entry.module ?? null,
    detectionMethod: isRegistryOnly ? "registry-match" : "embedded-marker",
    module: entry.module ?? null,
  };
}

async function resolveChangedFiles(
  context: Pick<KernelRuntimeContext, "workspaceRoot" | "io">,
  range: string | undefined,
): Promise<string[]> {
  const args = range ? ["diff", "--name-only", range] : ["diff", "--name-only", "HEAD"];
  const result = await context.io.exec("git", args, { cwd: context.workspaceRoot });
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => toPosix(line.trim()))
    .filter(Boolean);
}

export async function runGeneratedFileLookup(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<FileLookupResult>> {
  const rawPath = input.flags.path as string | undefined;
  const useDiff = input.flags.diff === true;
  const app = input.flags.site as string | undefined;
  const base = input.flags.base as string | undefined;
  const range = (input.flags.range as string | undefined) ?? (base ? `${base}..HEAD` : undefined);

  const results: FileLookupResult["results"] = [];

  if (useDiff) {
    let changedFiles: string[];
    try {
      changedFiles = await resolveChangedFiles(context, range);
    } catch {
      return {
        data: { command: "generated.file.lookup", results: [] },
        exitCode: 0,
        summary: "generated.file.lookup: git not available — no files to check.",
      };
    }

    for (const relPath of changedFiles) {
      const entry = matchOwnershipEntry(relPath, app);
      results.push(buildLookupResult(relPath, entry));
    }
  } else if (rawPath) {
    const resolvedPath = resolvePath(rawPath, app, context.workspaceRoot);
    const entry = matchOwnershipEntry(resolvedPath, app);
    results.push(buildLookupResult(resolvedPath, entry));
  } else {
    return {
      data: { command: "generated.file.lookup", results: [] },
      exitCode: 0,
      summary: "generated.file.lookup: no --path or --diff provided.",
    };
  }

  const generatedCount = results.filter((r) => r.generated).length;
  const summary = `generated.file.lookup: ${generatedCount}/${results.length} generated`;

  return {
    data: { command: "generated.file.lookup", results },
    exitCode: 0,
    summary,
  };
}
