/*
<MODULE_CONTRACT>
<purpose>Implements uni.registry.build and uni.registry.validate — the OS commands that
produce and guard the workspace-wide Uni UI Ontology registry (DNA-18, RFC-0023).
uni.registry.build walks every *.manifest.yaml across all apps (and packages/ui/)
and emits uni.registry.yaml at the workspace root.
uni.registry.validate checks registry freshness: new/deleted/content-drifted manifests
are reported as violations so build.check fails on any drift.</purpose>
<non-goals>
  <item>Do not validate manifest schema correctness — manifest.contract.validate handles that.</item>
  <item>Do not write or modify any manifest.yaml file.</item>
  <item>Do not index business content schemas — that belongs to pbp.profile.validate (RFC-0024).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 5 (RFC-0023): Created to implement uni.registry.build and uni.registry.validate.</item>
</CHANGE_SUMMARY>
*/

import { readFile, stat } from "node:fs/promises";
import { join, relative, basename, dirname } from "node:path";
import { parse as parseYaml, stringify as yamlStringify } from "yaml";
import { manifestSchema } from "@warpgogol/werkstatt-site/ontology";
import { discoverSiteWorkspaces, writeFileIfChanged } from "@warpgogol/werkstatt/kernel";
import { collectFiles as collectFilesShared } from "@warpgogol/werkstatt-site/share/fs";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "./result-helpers.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const REGISTRY_FILENAME = "uni.registry.yaml";
const REGISTRY_SCHEMA_VERSION = "1.0.0" as const;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** One row in the Uni registry. */
export interface RegistryEntry {
  id: string;
  uniName: string;
  layer: "page" | "section" | "component";
  /** Narrowed to SemanticRole/ComponentRole for sections/components; free-form for pages. */
  role?: string;
  semanticId: string;
  version: string;
  intent: string[];
  industryFit: string[];
  contentSchemaKey: string | null;
  standalone: boolean;
  /** Kernel app name (e.g. "nicaragua-projekt"), or "@warpgogol/werkstatt-site/ui" for shared packages. */
  siteName: string;
  /** Workspace-relative POSIX path to the manifest.yaml file. */
  manifestFile: string;
  /** Workspace-relative POSIX path to the colocated .astro file. */
  astroFile: string;
}

/** Shape of the uni.registry.yaml file. */
export interface UniRegistry {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  generatedAt: string | null;
  totalCount: number;
  entries: RegistryEntry[];
}

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

interface UniRegistryBuildResult {
  written: number;
  skipped: number;
  outputFile: string;
  dryRun: boolean;
}

// uni.registry.validate emits the canonical RFC-0203 CheckResult; violations are
// REGISTRY-* diagnostics (see diagnostics/rules.ts).

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Stat a path, returning null on any error. */
async function safeStat(filePath: string) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

/** Recursively collect all files matching predicate under rootDir. Silently skips missing roots. */
async function collectFilesMatching(
  rootDir: string,
  predicate: (filePath: string) => boolean,
): Promise<string[]> {
  const all = await collectFilesShared(rootDir, { ignore: () => false });
  return all.filter(predicate);
}

/** Scan roots for a single app directory. */
function getAppScanRoots(appDirectory: string): string[] {
  return [
    join(appDirectory, "src", "components"),
    join(appDirectory, "src", "sections"),
    join(appDirectory, "src", "pages"),
  ];
}

/** Normalize a path to workspace-relative POSIX (forward-slash). */
function toRelPosix(workspaceRoot: string, absPath: string): string {
  return relative(workspaceRoot, absPath).replace(/\\/g, "/");
}

/**
 * Walk every site workspace (Sternsystemen via systems/registry.yaml + transitional apps/*)
 * AND the shared component trees in packages/ui/.
 * Returns workspace-relative POSIX manifest file paths paired with their owning site name.
 */
async function scanWorkspaceManifests(
  workspaceRoot: string,
): Promise<Array<{ manifestFile: string; absPath: string; siteName: string }>> {
  const results: Array<{ manifestFile: string; absPath: string; siteName: string }> = [];

  // Discovered site workspaces (Sternsystemen via systems/registry.yaml + transitional apps/*)
  const apps = await discoverSiteWorkspaces(workspaceRoot);
  for (const app of apps) {
    const roots = getAppScanRoots(app.directory);
    for (const root of roots) {
      const found = await collectFilesMatching(root, (f) => f.endsWith(".manifest.yaml"));
      for (const absPath of found) {
        results.push({
          manifestFile: toRelPosix(workspaceRoot, absPath),
          absPath,
          siteName: app.name,
        });
      }
    }
  }

  // Shared UI package trees (Wave 7 target directories — packages/ui/src/*)
  const pkgUiRoots = [
    join(workspaceRoot, "packages", "ui", "src", "sections"),
    join(workspaceRoot, "packages", "ui", "src", "components"),
    join(workspaceRoot, "packages", "ui", "src", "pages"),
  ];
  for (const root of pkgUiRoots) {
    const found = await collectFilesMatching(root, (f) => f.endsWith(".manifest.yaml"));
    for (const absPath of found) {
      results.push({
        manifestFile: toRelPosix(workspaceRoot, absPath),
        absPath,
        siteName: "@warpgogol/werkstatt-site/ui",
      });
    }
  }

  return results;
}

/**
 * Parse a manifest file and build a RegistryEntry.
 * Returns null if the manifest fails schema validation (build skips it; contract.validate reports it).
 */
async function buildEntry(
  absManifestPath: string,
  siteName: string,
  workspaceRoot: string,
): Promise<RegistryEntry | null> {
  let raw: string;
  try {
    raw = await readFile(absManifestPath, "utf-8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch {
    return null;
  }

  const result = manifestSchema.safeParse(parsed);
  if (!result.success) return null;

  const m = result.data;
  const stem = basename(absManifestPath).replace(".manifest.yaml", "");
  const astroAbs = join(dirname(absManifestPath), `${stem}.astro`);

  return {
    id: m.id,
    uniName: m.uniName,
    layer: m.layer,
    // role: page has optional string, section has SemanticRole, component has ComponentRole — all string-compatible
    role: (m as { role?: string }).role,
    semanticId: m.semanticId,
    version: m.version,
    intent: [...m.intent],
    industryFit: [...m.industryFit],
    contentSchemaKey: m.contentSchemaKey,
    standalone: m.standalone ?? false,
    siteName,
    manifestFile: toRelPosix(workspaceRoot, absManifestPath),
    astroFile: toRelPosix(workspaceRoot, astroAbs),
  };
}

// ---------------------------------------------------------------------------
// uni.registry.build
// ---------------------------------------------------------------------------

/**
 * Scans every *.manifest.yaml across all workspace apps (and packages/ui/),
 * parses each against @warpgogol/werkstatt-site/ontology manifestSchema, and emits a
 * deterministic uni.registry.yaml at the workspace root.
 *
 * Manifests that fail schema validation are skipped with a warning (they are
 * reported as errors by manifest.contract.validate, which should run first).
 *
 * Respects --dry-run: when set, logs the would-be output without writing.
 */
export async function runUniRegistryBuild(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<UniRegistryBuildResult>> {
  const { workspaceRoot, dryRun } = context;

  const found = await scanWorkspaceManifests(workspaceRoot);
  const entries: RegistryEntry[] = [];
  const skippedFiles: string[] = [];

  for (const { absPath, siteName } of found) {
    const entry = await buildEntry(absPath, siteName, workspaceRoot);
    if (entry) {
      entries.push(entry);
    } else {
      const rel = toRelPosix(workspaceRoot, absPath);
      skippedFiles.push(rel);
      context.logger.warn(
        `uni.registry.build: skipped invalid manifest (run manifest.contract.validate for details): ${rel}`,
      );
    }
  }

  // Deterministic sort: siteName first, then manifestFile
  entries.sort((a, b) => {
    const appCmp = a.siteName.localeCompare(b.siteName);
    return appCmp !== 0 ? appCmp : a.manifestFile.localeCompare(b.manifestFile);
  });

  const registry: UniRegistry = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    generatedAt: null,
    totalCount: entries.length,
    entries,
  };

  const outputPath = join(workspaceRoot, REGISTRY_FILENAME);
  const jsonOutput = yamlStringify(registry) + "\n";

  if (!dryRun) {
    // RFC-0258/RFC-0345: workspace-root output — idempotent atomic write.
    await writeFileIfChanged(outputPath, jsonOutput);
    context.logger.success(
      `uni.registry.build: wrote ${entries.length} entr${entries.length === 1 ? "y" : "ies"} to ${REGISTRY_FILENAME}` +
        (skippedFiles.length > 0
          ? ` (${skippedFiles.length} invalid manifest${skippedFiles.length === 1 ? "" : "s"} skipped)`
          : ""),
    );
  } else {
    context.logger.info(
      `uni.registry.build [dry-run]: would write ${entries.length} entr${entries.length === 1 ? "y" : "ies"} to ${REGISTRY_FILENAME}`,
    );
  }

  return {
    exitCode: 0,
    data: {
      written: dryRun ? 0 : entries.length,
      skipped: skippedFiles.length,
      outputFile: REGISTRY_FILENAME,
      dryRun,
    },
    summary: dryRun
      ? `[dry-run] would write ${entries.length} entries`
      : `OK — ${entries.length} entr${entries.length === 1 ? "y" : "ies"} written to ${REGISTRY_FILENAME}`,
  };
}

// ---------------------------------------------------------------------------
// uni.registry.validate
// ---------------------------------------------------------------------------

/**
 * Validates that uni.registry.yaml is fresh with respect to the current
 * set of *.manifest.yaml files in the workspace.
 *
 * Three kinds of drift are detected:
 *   NEW    — manifest file exists but has no corresponding registry entry
 *   STALE  — registry entry references a manifest file that no longer exists
 *   CHANGED — entry's id / layer / version no longer matches the on-disk manifest
 *
 * If uni.registry.yaml does not exist at all, the command exits with code 1
 * and a clear message to run uni.registry.build first.
 */
export async function runUniRegistryValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { workspaceRoot } = context;
  const registryPath = join(workspaceRoot, REGISTRY_FILENAME);
  const REBUILD_HINT = "Run `site-kernel run uni.registry.build` to regenerate uni.registry.yaml.";

  // 1. Load existing registry
  let registry: UniRegistry;
  const registryStat = await safeStat(registryPath);
  if (!registryStat) {
    return diagnosticsResult("uni.registry.validate", [
      {
        ruleId: "REGISTRY-MISSING",
        severity: "error",
        message: `${REGISTRY_FILENAME} not found (DNA-18, RFC-0023).`,
        file: REGISTRY_FILENAME,
        fixHint: REBUILD_HINT,
      },
    ]);
  }

  try {
    const raw = await readFile(registryPath, "utf-8");
    registry = parseYaml(raw) as UniRegistry;
  } catch (e) {
    return diagnosticsResult("uni.registry.validate", [
      {
        ruleId: "REGISTRY-MISSING",
        severity: "error",
        message: `Failed to parse ${REGISTRY_FILENAME}: ${e instanceof Error ? e.message : String(e)}`,
        file: REGISTRY_FILENAME,
        fixHint: REBUILD_HINT,
      },
    ]);
  }

  // 2. Scan current workspace manifests
  const found = await scanWorkspaceManifests(workspaceRoot);
  const currentByFile = new Map<string, string>(
    found.map(({ manifestFile, absPath }) => [manifestFile, absPath]),
  );
  const registeredByFile = new Map<string, RegistryEntry>(
    (registry.entries ?? []).map((e) => [e.manifestFile, e]),
  );

  const diagnostics: Diagnostic[] = [];

  // 3a. NEW: manifests on disk not in registry
  for (const [relFile] of currentByFile) {
    if (!registeredByFile.has(relFile)) {
      diagnostics.push({
        ruleId: "REGISTRY-NEW",
        severity: "error",
        message: "Manifest exists on disk but is not in uni.registry.yaml.",
        file: relFile,
        fixHint: REBUILD_HINT,
      });
    }
  }

  // 3b. STALE: registry entries whose manifest file is gone
  for (const [relFile] of registeredByFile) {
    if (!currentByFile.has(relFile)) {
      diagnostics.push({
        ruleId: "REGISTRY-STALE",
        severity: "error",
        message: "Registry entry references a manifest that no longer exists.",
        file: relFile,
        fixHint: REBUILD_HINT,
      });
    }
  }

  // 3c. CHANGED: entries that still exist on disk but id/layer/version drifted
  for (const [relFile, entry] of registeredByFile) {
    const absPath = currentByFile.get(relFile);
    if (!absPath) continue; // already reported as STALE

    let raw: string;
    try {
      raw = await readFile(absPath, "utf-8");
    } catch {
      diagnostics.push({
        ruleId: "REGISTRY-READ-ERROR",
        severity: "error",
        message: "Manifest could not be read.",
        file: relFile,
        fixHint: "Ensure the manifest file is present and readable.",
      });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseYaml(raw);
    } catch {
      diagnostics.push({
        ruleId: "REGISTRY-INVALID",
        severity: "error",
        message: "Manifest fails to parse (YAML parse error).",
        file: relFile,
        fixHint: "Fix the YAML syntax in the manifest.",
      });
      continue;
    }

    const result = manifestSchema.safeParse(parsed);
    if (!result.success) {
      diagnostics.push({
        ruleId: "REGISTRY-INVALID",
        severity: "error",
        message: `Manifest fails schema validation: ${result.error.issues
          .map((i) => `${i.path.map(String).join(".")}: ${i.message}`)
          .join("; ")}`,
        file: relFile,
        fixHint: "Fix the manifest to satisfy @warpgogol/werkstatt-site/ontology manifestSchema.",
      });
      continue;
    }

    const m = result.data;
    const changed = m.id !== entry.id || m.layer !== entry.layer || m.version !== entry.version;
    if (changed) {
      diagnostics.push({
        ruleId: "REGISTRY-CHANGED",
        severity: "error",
        message: `Registry entry drifted from the manifest (registry id=${entry.id} layer=${entry.layer} version=${entry.version}; disk id=${m.id} layer=${m.layer} version=${m.version}).`,
        file: relFile,
        fixHint: REBUILD_HINT,
        data: {
          registry: { id: entry.id, layer: entry.layer, version: entry.version },
          disk: { id: m.id, layer: m.layer, version: m.version },
        },
      });
    }
  }

  return diagnosticsResult("uni.registry.validate", diagnostics);
}
