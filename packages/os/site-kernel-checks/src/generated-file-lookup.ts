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
</CHANGE_SUMMARY>
*/
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { GENERATOR_OWNERSHIP_MAP, type OwnershipEntry } from "./generator-ownership.ts";

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

function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

function segmentToRegexSource(segment: string): string {
  return segment
    .split("*")
    .map((literal) => literal.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
}

function ownPatternToExactRegex(pattern: string): RegExp {
  const segments = pattern.split("/").filter((s) => s.length > 0);
  const pieces: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    pieces.push(
      seg === "**" ? (i === segments.length - 1 ? ".*" : "(?:[^/]+/)*") : segmentToRegexSource(seg),
    );
  }
  let source = "^";
  for (let i = 0; i < pieces.length; i++) {
    source += pieces[i];
    const isRecursiveNonLast = segments[i] === "**" && i !== segments.length - 1;
    if (i < pieces.length - 1 && !isRecursiveNonLast) source += "/";
  }
  return new RegExp(`${source}$`);
}

function normalizeOwnershipPath(rawPath: string): string {
  const pattern = rawPath.replace(/\\/g, "/");
  if (
    pattern.startsWith("packages/") ||
    pattern.startsWith("docs/") ||
    pattern.startsWith("apps/")
  ) {
    return pattern;
  }
  return `apps/*/${pattern}`;
}

function expandPlaceholderVariants(pattern: string): string[] {
  const segments = pattern.split("/");
  const wholeSegmentPlaceholder = (seg: string): boolean => /^\{[a-zA-Z0-9_]+\}$/.test(seg);
  const embeddedPlaceholder = (seg: string): boolean =>
    /\{[a-zA-Z0-9_]+\}/.test(seg) && !wholeSegmentPlaceholder(seg);

  const direct = segments
    .map((seg) => (wholeSegmentPlaceholder(seg) ? "**" : seg.replace(/\{[a-zA-Z0-9_]+\}/g, "*")))
    .join("/");

  const hasEmbedded = segments.some(embeddedPlaceholder);
  if (!hasEmbedded) return [direct];

  const recursive = segments
    .map((seg) => (wholeSegmentPlaceholder(seg) ? "**" : seg.replace(/\{[a-zA-Z0-9_]+\}/g, "**")))
    .join("/");
  return [direct, recursive];
}

function matchOwnershipEntry(relPath: string, app?: string): OwnershipEntry | null {
  const posixPath = toPosix(relPath);

  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    const normalized = normalizeOwnershipPath(entry.path);
    const variants = expandPlaceholderVariants(normalized);

    for (const variant of variants) {
      const regex = ownPatternToExactRegex(variant);
      if (regex.test(posixPath)) {
        return entry;
      }
    }

    if (app) {
      const appPrefixed = `apps/${app}/${entry.path}`;
      const appNormalized = normalizeOwnershipPath(appPrefixed);
      const appVariants = expandPlaceholderVariants(appNormalized);
      for (const variant of appVariants) {
        const regex = ownPatternToExactRegex(variant);
        if (regex.test(posixPath)) {
          return entry;
        }
      }
    }
  }

  return null;
}

function resolvePath(rawPath: string, app: string | undefined, workspaceRoot: string): string {
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
  const regenerateCommand = `pnpm exec site-kernel run ${entry.command}`;

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
