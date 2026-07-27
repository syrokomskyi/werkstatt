/*
<MODULE_CONTRACT>
<purpose>
Implements cosmic.catalog.validate and cosmic.name.unique — the OS commands
that enforce the closed cosmic-catalog contract (DNA-23, RFC-0025) across all
apps and packages.
</purpose>
<non-goals>
  <item>Do not parse or validate the full manifest schema (manifest.contract.validate handles that).</item>
  <item>Do not extend catalogs — violations require a superseding RFC (DNA-19).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0025): Initial creation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import { starNameSchema, planetNameSchema, moonNameSchema } from "@warpgogol/ontology/cosmic";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { collectFiles } from "@warpgogol/share/fs";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface RawManifest {
  layer?: string;
  cosmicName?: unknown;
  id?: string;
}

async function collectManifestFiles(roots: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const root of roots) {
    results.push(
      ...(await collectFiles(root, { extensions: [".manifest.yaml"], ignore: () => false })),
    );
  }
  return results;
}

/** Scan roots for packages/ui only (RFC-0023). Returns all manifest.yaml paths. */
async function collectAllManifests(
  workspaceRoot: string,
  appDirectory?: string,
): Promise<string[]> {
  const roots: string[] = [];

  if (appDirectory) {
    // App-scoped scan: scan app's src directory
    roots.push(
      join(appDirectory, "src", "components"),
      join(appDirectory, "src", "sections"),
      join(appDirectory, "src", "pages"),
    );
  } else {
    // Workspace-wide scan: only scan packages/ui/src (RFC-0023)
    // Apps consume UI from packages/ui, they do not ship manifests
    roots.push(join(workspaceRoot, "packages", "ui", "src"));
  }

  return collectManifestFiles(roots);
}

// ---------------------------------------------------------------------------
// cosmic.catalog.validate
// ---------------------------------------------------------------------------

interface CatalogViolation {
  file: string;
  layer: string;
  cosmicName: unknown;
  error: string;
}

interface CatalogResult {
  scanned: number;
  violations: number;
  details: CatalogViolation[];
}

/**
 * Validates that every cosmicName value in every manifest.yaml belongs to
 * the correct closed catalog for its layer:
 *   page      → StarCatalog
 *   section   → PlanetCatalog
 *   component → MoonCatalog
 *
 * Exits non-zero on any violation. No warn-only mode.
 */
export async function runCosmicCatalogValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CatalogResult>> {
  const manifestFiles = await collectAllManifests(context.workspaceRoot, context.site?.directory);

  const violations: CatalogViolation[] = [];
  let scanned = 0;

  for (const filePath of manifestFiles) {
    const rel = relative(context.workspaceRoot, filePath);
    let raw: RawManifest;

    try {
      const content = await readFile(filePath, "utf-8");
      raw = (parseYaml(content) ?? {}) as RawManifest;
    } catch {
      continue; // YAML errors are manifest.contract.validate's responsibility
    }

    const { layer, cosmicName } = raw;

    if (!layer) continue; // malformed — manifest.contract.validate catches this
    scanned++;

    let parseResult: { success: boolean; error?: { issues: Array<{ message: string }> } };

    if (layer === "page") {
      parseResult = starNameSchema.safeParse(cosmicName);
      if (!parseResult.success) {
        const msg = `cosmicName "${cosmicName}" is not a valid StarCatalog entry (layer=page)`;
        violations.push({ file: rel, layer, cosmicName, error: msg });
        context.logger.error(`${rel}: ${msg}`);
      }
    } else if (layer === "section") {
      parseResult = planetNameSchema.safeParse(cosmicName);
      if (!parseResult.success) {
        const msg = `cosmicName "${cosmicName}" is not a valid PlanetCatalog entry (layer=section)`;
        violations.push({ file: rel, layer, cosmicName, error: msg });
        context.logger.error(`${rel}: ${msg}`);
      }
    } else if (layer === "component") {
      parseResult = moonNameSchema.safeParse(cosmicName);
      if (!parseResult.success) {
        const msg = `cosmicName "${cosmicName}" is not a valid MoonCatalog entry (layer=component)`;
        violations.push({ file: rel, layer, cosmicName, error: msg });
        context.logger.error(`${rel}: ${msg}`);
      }
    }
  }

  if (violations.length === 0) {
    context.logger.info(
      `cosmic.catalog.validate: OK — ${scanned} manifest${scanned === 1 ? "" : "s"} all have valid cosmicName values`,
    );
  }

  return {
    data: { scanned, violations: violations.length, details: violations },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `OK — ${scanned} manifests, all cosmicName values valid`
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// cosmic.name.unique
// ---------------------------------------------------------------------------

interface UniqueViolation {
  cosmicName: string;
  files: string[];
}

interface UniqueResult {
  scanned: number;
  duplicates: number;
  details: UniqueViolation[];
}

/**
 * Validates that every cosmicName value is unique across the entire workspace.
 * Two manifests sharing the same cosmicName is a contract violation (DNA-23).
 *
 * Scope: workspace-wide (scans all apps and packages/ui/).
 * Exits non-zero on any duplicate. No warn-only mode.
 */
export async function runCosmicNameUnique(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<UniqueResult>> {
  // Always workspace-wide for uniqueness
  const manifestFiles = await collectAllManifests(context.workspaceRoot);

  const nameToFiles = new Map<string, string[]>();
  let scanned = 0;

  for (const filePath of manifestFiles) {
    const rel = relative(context.workspaceRoot, filePath);
    let raw: RawManifest;

    try {
      const content = await readFile(filePath, "utf-8");
      raw = (parseYaml(content) ?? {}) as RawManifest;
    } catch {
      continue;
    }

    if (!raw.cosmicName || typeof raw.cosmicName !== "string") continue;
    scanned++;

    const existing = nameToFiles.get(raw.cosmicName) ?? [];
    existing.push(rel);
    nameToFiles.set(raw.cosmicName, existing);
  }

  const violations: UniqueViolation[] = [];

  for (const [cosmicName, files] of nameToFiles) {
    if (files.length > 1) {
      violations.push({ cosmicName, files });
      context.logger.error(
        `cosmic.name.unique: "${cosmicName}" used by ${files.length} manifests: ${files.join(", ")}`,
      );
    }
  }

  if (violations.length === 0) {
    context.logger.info(
      `cosmic.name.unique: OK — ${scanned} cosmicName${scanned === 1 ? "" : "s"} all unique`,
    );
  }

  return {
    data: {
      scanned,
      duplicates: violations.length,
      details: violations,
    },
    exitCode: violations.length > 0 ? 1 : 0,
    summary: violations.length === 0 ? `OK — ${scanned} cosmicNames, all unique` : undefined,
  };
}
