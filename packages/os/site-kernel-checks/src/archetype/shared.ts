/*
<MODULE_CONTRACT>
<purpose>Shared types, YAML/manifest loaders, and derived-map builders for the RFC-0072
archetype catalog command set.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of archetype.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative, basename, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import { collectFiles as collectFilesShared } from "@gogol/share/fs";
import {
  sectionArchetypeSchema,
  manifestSchema,
  type SectionArchetypeContract,
  type Manifest,
} from "@gogol/ontology";

export const ARCHETYPE_REGISTRY_FILENAME = "packages/ontology/archetypes/index.yaml";

// RFC-0108 §"Proposal E" + RFC-0130: structural primitives introduced by
// RFC-0101..RFC-0106. They carry component manifests so the cosmic catalog +
// import-paths registry know about them, but their `archetype` field points
// at the primitive's own name — there is no separate archetype YAML, because
// these are framework-internal building blocks rather than user-facing
// archetypes. Keeping the set centralised here means `archetype.registry.
// validate` can short-circuit the "references unknown archetype" check for
// the same 12 names every CI run.
export const FRAMEWORK_INTERNAL_ARCHETYPES: ReadonlySet<string> = new Set([
  // RFC-0101 shell primitive
  "section-shell",
  // RFC-0102 header
  "section-header",
  // RFC-0103 body kinds
  "section-body-list",
  "section-body-split-list",
  "section-body-stats",
  "section-body-cards",
  "section-body-paragraphs",
  "section-body-comparison",
  "section-body-rich",
  // RFC-0104 CTA + image primitives
  "section-cta",
  "section-cta-group",
  "section-image",
]);

export interface ArchetypeRegistryEntry {
  id: string;
  displayName: string;
  semanticRole: string;
  version: string;
  layoutHint: string;
  acceptedCosmicNames: string[];
  sourceFile: string;
  // RFC-0083: derived from directory (sections/ → section, components/ → component).
  // Drives cross-catalog validation (PlanetCatalog vs MoonCatalog).
  layer: "section" | "component";
}

export interface ArchetypeRegistry {
  schemaVersion: "1.0.0";
  totalCount: number;
  entries: ArchetypeRegistryEntry[];
  // RFC-0084: derived sets of semanticRole values per layer. Replace the
  // closed SemanticRoleValues enum in @gogol/ontology — manifests'
  // `role` field is now cross-checked against the set matching the manifest's
  // layer. Adding a new archetype with a novel semanticRole no longer
  // requires editing enums.ts.
  sectionRoles: string[];
  componentRoles: string[];
  // RFC-0091: derived maps from manifest cosmicName → import path and
  // archetype id → cosmicName. Derived automatically from every section
  // and non-shell component manifest with a corresponding UI folder.
  planetImportPaths: Record<string, string>;
  blockTypeToCosmicName: Record<string, string>;
  // RFC-0097: derived map of shell-component cosmicName → import path.
  // Sourced from every shell.* archetype manifest under packages/ui/src/components/.
  moonImportPaths: Record<string, string>;
  // RFC-0263: derived map of cosmicName → the manifest's own authored `role`
  // field (not the archetype's semanticRole). Lets dispatch code (buildPage)
  // key role-conditional behavior off the registry instead of hardcoded
  // cosmic-name literals. Entries without a role are omitted.
  roleByCosmicName: Record<string, string>;
}

export interface ValidateResult {
  violations: number;
  details: Array<{ file: string; message: string }>;
}

export async function collectFilesMatching(
  rootDir: string,
  predicate: (filePath: string) => boolean,
): Promise<string[]> {
  const all = await collectFilesShared(rootDir, { ignore: () => false });
  const results = all.filter(predicate);
  return results;
}

export async function readYamlFile<T>(filePath: string, parser: (value: unknown) => T): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return parser(parseYaml(raw));
}

export type ArchetypeLayer = "section" | "component";

export async function loadArchetypeFiles(workspaceRoot: string) {
  // RFC-0083: walk both sections/ and components/ subdirectories. The archetype
  // schema does not carry a `layer` field — layer is derived from which
  // directory the YAML lives in. The returned `layer` tag enables the
  // strengthened cross-catalog validator below.
  const archetypeRoot = join(workspaceRoot, "packages", "ontology", "archetypes");
  const layerDirs: Array<{ layer: ArchetypeLayer; dir: string }> = [
    { layer: "section", dir: join(archetypeRoot, "sections") },
    { layer: "component", dir: join(archetypeRoot, "components") },
  ];
  const entries: Array<{
    filePath: string;
    relFile: string;
    archetype: SectionArchetypeContract;
    layer: ArchetypeLayer;
  }> = [];
  for (const { layer, dir } of layerDirs) {
    const files = await collectFilesMatching(dir, (filePath) => filePath.endsWith(".yaml"));
    for (const filePath of files) {
      const relFile = relative(workspaceRoot, filePath).replace(/\\/g, "/");
      const archetype = await readYamlFile(filePath, (value) =>
        sectionArchetypeSchema.parse(value),
      );
      entries.push({ filePath, relFile, archetype, layer });
    }
  }
  return entries.sort((a, b) => a.archetype.id.localeCompare(b.archetype.id));
}

export async function loadUiManifestFiles(workspaceRoot: string) {
  const roots = [
    join(workspaceRoot, "packages", "ui", "src", "sections"),
    join(workspaceRoot, "packages", "ui", "src", "components"),
  ];
  const manifestFiles: string[] = [];
  for (const root of roots) {
    manifestFiles.push(
      ...(await collectFilesMatching(root, (filePath) => filePath.endsWith(".manifest.yaml"))),
    );
  }
  const manifests: Array<{ filePath: string; relFile: string; manifest: Manifest }> = [];
  for (const filePath of manifestFiles) {
    const relFile = relative(workspaceRoot, filePath).replace(/\\/g, "/");
    const manifest = await readYamlFile(filePath, (value) => manifestSchema.parse(value));
    manifests.push({ filePath, relFile, manifest });
  }
  return manifests;
}

// RFC-0091 + RFC-0097: derive planetImportPaths, blockTypeToCosmicName, and
// moonImportPaths from all UI manifests. Sections + non-shell components feed
// planetImportPaths; shell components (archetype ID starting with "shell.")
// feed moonImportPaths so the shell-block table is also content-derived rather
// than hand-maintained in @gogol/share/page.ts.
export function isShellArchetype(archetypeId: string): boolean {
  return archetypeId.startsWith("shell.");
}

export async function deriveImportPathMaps(workspaceRoot: string): Promise<{
  planetImportPaths: Record<string, string>;
  moonImportPaths: Record<string, string>;
  blockTypeToCosmicName: Record<string, string>;
  roleByCosmicName: Record<string, string>;
}> {
  const manifests = await loadUiManifestFiles(workspaceRoot);
  // Sort: section layer first, then component — so section wins for
  // blockTypeToCosmicName when the same archetype id appears in both
  // layers (e.g. donation-card section vs donation-card component).
  const sorted = [...manifests].sort((a, b) => {
    const aScore = a.manifest.layer === "section" ? 0 : 1;
    const bScore = b.manifest.layer === "section" ? 0 : 1;
    return aScore - bScore;
  });

  const planetImportPaths: Record<string, string> = {};
  const moonImportPaths: Record<string, string> = {};
  const blockTypeToCosmicName: Record<string, string> = {};
  const roleByCosmicName: Record<string, string> = {};

  for (const { filePath, manifest } of sorted) {
    const folderSlug = basename(dirname(filePath));
    const layerPath = manifest.layer === "section" ? "sections" : "components";
    const importPath = `@gogol/ui/${layerPath}/${folderSlug}`;
    const isShell = manifest.layer === "component" && isShellArchetype(manifest.archetype);

    // RFC-0263: propagate the manifest's own authored `role` field (distinct
    // from the archetype's semanticRole) so dispatch code can key
    // role-conditional behavior off the registry instead of cosmic-name
    // literals. Entries without a role are omitted (no default injected).
    if (
      !(manifest.cosmicName in roleByCosmicName) &&
      "role" in manifest &&
      typeof manifest.role === "string" &&
      manifest.role.length > 0
    ) {
      roleByCosmicName[manifest.cosmicName] = manifest.role;
    }

    if (isShell) {
      // moonImportPaths: cosmicName → import path (shell components only).
      if (!(manifest.cosmicName in moonImportPaths)) {
        moonImportPaths[manifest.cosmicName] = importPath;
      }
      // Shell archetypes do not participate in blockTypeToCosmicName — they
      // are referenced from system.md shell blocks by cosmicName directly.
      continue;
    }

    // planetImportPaths: cosmicName → import path. No conflict expected
    // since each manifest has a unique cosmicName per layer.
    if (!(manifest.cosmicName in planetImportPaths)) {
      planetImportPaths[manifest.cosmicName] = importPath;
    }

    // blockTypeToCosmicName: archetype → cosmicName. Section layer wins
    // for the same archetype id (sorted section-first above).
    if (!(manifest.archetype in blockTypeToCosmicName)) {
      blockTypeToCosmicName[manifest.archetype] = manifest.cosmicName;
    }
  }

  return { planetImportPaths, moonImportPaths, blockTypeToCosmicName, roleByCosmicName };
}

// Back-compat alias for callers that imported derivePlanetMaps; remove after
// downstream sweep.
export async function derivePlanetMaps(workspaceRoot: string): Promise<{
  planetImportPaths: Record<string, string>;
  blockTypeToCosmicName: Record<string, string>;
}> {
  const { planetImportPaths, blockTypeToCosmicName } = await deriveImportPathMaps(workspaceRoot);
  return { planetImportPaths, blockTypeToCosmicName };
}

/**
 * RFC-0084: best-effort closest-match hint for an unknown role. Picks the
 * candidate with the smallest Levenshtein distance, returning null when the
 * candidate set is empty. Used to make the cross-check violation message
 * actionable without forcing the agent to grep the catalog manually.
 */
export function findClosestRole(needle: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  let best: { value: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = levenshtein(needle, candidate);
    if (!best || distance < best.distance) {
      best = { value: candidate, distance };
    }
  }
  return best?.value ?? null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}
