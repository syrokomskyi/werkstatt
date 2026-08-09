/*
<MODULE_CONTRACT>
<purpose>cosmic.name.pick / cosmic.name.rename — pick a deterministic unused cosmic name for
an archetype, and safely rename a cosmic name across the catalog-managed surface.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of archetype.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { collectFiles as collectFilesShared } from "@warpgogol/werkstatt-site/share/fs";
import { PlanetCatalog, MoonCatalog } from "@warpgogol/werkstatt-site/ontology";
import { hasGeneratedMarker } from "@warpgogol/werkstatt/kernel";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { loadArchetypeFiles, loadUiManifestFiles, type ArchetypeLayer } from "./shared.ts";

interface CosmicPickResult {
  archetype: string;
  cosmicName?: string;
  available: string[];
  used: string[];
}

export async function runCosmicNamePick(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CosmicPickResult>> {
  const archetypeId = String(input.flags.archetype ?? "").trim();
  if (!archetypeId) {
    return {
      exitCode: 1,
      data: { archetype: "", available: [], used: [] },
      summary: "cosmic.name.pick requires --archetype=<id>",
    };
  }

  const archetypes = await loadArchetypeFiles(context.workspaceRoot);
  const target = archetypes.find(({ archetype }) => archetype.id === archetypeId)?.archetype;
  if (!target) {
    return {
      exitCode: 1,
      data: { archetype: archetypeId, available: [], used: [] },
      summary: `unknown archetype: ${archetypeId}`,
    };
  }

  const manifests = await loadUiManifestFiles(context.workspaceRoot);
  const used = manifests.map(({ manifest }) => manifest.cosmicName);
  const usedSet = new Set(used);
  const picked = target.acceptedCosmicNames.find((name) => !usedSet.has(name));

  return {
    exitCode: picked ? 0 : 1,
    data: {
      archetype: archetypeId,
      cosmicName: picked,
      available: [...target.acceptedCosmicNames],
      used,
    },
    summary: picked
      ? `OK - picked ${picked} for ${archetypeId}`
      : `no available cosmic names for ${archetypeId}`,
  };
}

// ---------------------------------------------------------------------------
// RFC-0083: cosmic.name.rename
// ---------------------------------------------------------------------------

interface CosmicNameRenameResult {
  command: "cosmic.name.rename";
  status: "ok" | "fail" | "noop";
  filesChanged: string[];
  violations: string[];
  dryRun: boolean;
}

const COSMIC_RENAME_SCAN_ROOTS = [
  "packages/werkstatt-site/src/domain/ontology/archetypes",
  "packages/werkstatt-site/src/domain/ontology/constellations",
  "packages/werkstatt-site/src/domain/ui/sections",
  "packages/werkstatt-site/src/domain/ui/components",
  "apps",
  "onboarding/.output",
] as const;

const COSMIC_RENAME_EXTENSIONS = new Set([".yaml", ".yml", ".md"]);

const COSMIC_RENAME_SKIP_SEGMENTS = new Set([
  "node_modules",
  "dist",
  ".astro",
  ".turbo",
  ".cache",
  ".git",
]);

function buildCosmicWordPattern(name: string): RegExp {
  // Match the cosmic name as a whole identifier so that "Mimas" does not also
  // hit "MimasExtra". The boundary check accepts letters, digits and
  // underscore — matches yaml scalars and markdown frontmatter values.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "g");
}

async function collectCosmicRenameCandidates(workspaceRoot: string): Promise<string[]> {
  // Skips heavy directories (node_modules, dist, .astro, .turbo, .cache, .git)
  // to avoid scanning tens of thousands of files under apps/<id>/dist and
  // apps/<id>/node_modules. Confined to source-controlled scan roots.
  const files: string[] = [];
  for (const root of COSMIC_RENAME_SCAN_ROOTS) {
    const found = await collectFilesShared(join(workspaceRoot, root), {
      ignore: (name) => COSMIC_RENAME_SKIP_SEGMENTS.has(name),
    });
    for (const full of found) {
      const idx = full.lastIndexOf(".");
      if (idx < 0) continue;
      if (COSMIC_RENAME_EXTENSIONS.has(full.slice(idx).toLowerCase())) {
        files.push(full);
      }
    }
  }
  return files;
}

export async function runCosmicNameRename(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CosmicNameRenameResult>> {
  const from = String(input.flags.from ?? "").trim();
  const to = String(input.flags.to ?? "").trim();
  const layer = String(input.flags.layer ?? "").trim() as ArchetypeLayer | "";
  const dryRun = Boolean(input.flags["dry-run"]) || context.dryRun;
  const violations: string[] = [];

  if (!from || !to) {
    violations.push("cosmic.name.rename requires --from=<oldName> and --to=<newName>.");
  }
  if (layer !== "section" && layer !== "component") {
    violations.push(
      `cosmic.name.rename requires --layer=section or --layer=component (got "${layer}").`,
    );
  }
  if (from && to && from === to) {
    violations.push(`--from and --to are identical ("${from}"); nothing to rename.`);
  }

  if (violations.length > 0) {
    return {
      exitCode: 1,
      data: { command: "cosmic.name.rename", status: "fail", filesChanged: [], violations, dryRun },
      summary: `cosmic.name.rename: ${violations.length} violation(s)`,
    };
  }

  const catalogs = {
    section: { allow: new Set<string>(PlanetCatalog), name: "PlanetCatalog" },
    component: { allow: new Set<string>(MoonCatalog), name: "MoonCatalog" },
  } as const;
  const catalog = catalogs[layer as ArchetypeLayer];
  if (!catalog.allow.has(to)) {
    violations.push(
      `--to "${to}" is not a member of ${catalog.name} (the ${layer}-layer cosmic catalog).`,
    );
  }

  // Confirm --to is not already in use by another archetype of the same layer.
  const archetypes = await loadArchetypeFiles(context.workspaceRoot);
  for (const { archetype, layer: aLayer } of archetypes) {
    if (aLayer !== layer) continue;
    const accepted: string[] = [...archetype.acceptedCosmicNames];
    if (accepted.includes(to) && !accepted.includes(from)) {
      violations.push(
        `--to "${to}" is already in use by ${layer} archetype "${archetype.id}"; pick a different name.`,
      );
    }
  }

  if (violations.length > 0) {
    return {
      exitCode: 1,
      data: { command: "cosmic.name.rename", status: "fail", filesChanged: [], violations, dryRun },
      summary: `cosmic.name.rename: ${violations.length} violation(s)`,
    };
  }

  // Pre-flight: every candidate file that mentions --from must either carry the
  // GENERATED marker OR live under packages/werkstatt-site/src/domain/ontology/ (canonical source-of-truth
  // YAMLs) OR under onboarding/.output/ (agent-authored artifacts). Anything
  // else is treated as a project-specific edit and the command refuses to
  // overwrite it.
  const candidates = await collectCosmicRenameCandidates(context.workspaceRoot);
  const pattern = buildCosmicWordPattern(from);
  type Touch = { path: string; relPath: string; content: string; nextContent: string };
  const touches: Touch[] = [];
  for (const filePath of candidates) {
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    pattern.lastIndex = 0;
    if (!pattern.test(content)) continue;
    const relPath = relative(context.workspaceRoot, filePath).replace(/\\/g, "/");
    // Allow-list of paths that ALWAYS belong to the systematic catalog and may
    // be rewritten by cosmic.name.rename without the GENERATED marker:
    //   - canonical ontology yamls (archetypes/, constellations/, biomes/)
    //   - section/component manifests + stories (managed by section.scaffold)
    //   - per-app compiled system.md (managed by system-md.compile)
    //   - onboarding output artifacts (agent-authored, RFC-0076)
    const isCanonicalOntology = relPath.startsWith("packages/werkstatt-site/src/domain/ontology/");
    const isUiSectionOrComponent =
      relPath.startsWith("packages/werkstatt-site/src/domain/ui/sections/") ||
      relPath.startsWith("packages/werkstatt-site/src/domain/ui/components/");
    const isCompiledSystemMd = /^apps\/[^/]+\/src\/content\/system\.md$/.test(relPath);
    const isAgentArtifact = relPath.startsWith("onboarding/.output/");
    const isCatalogManaged =
      isCanonicalOntology || isUiSectionOrComponent || isCompiledSystemMd || isAgentArtifact;
    if (!isCatalogManaged && !hasGeneratedMarker(content)) {
      violations.push(
        `${relPath}: references "${from}" but is project-specific (no GENERATED marker); refuse to overwrite. Edit by hand or add the marker.`,
      );
      continue;
    }
    pattern.lastIndex = 0;
    const nextContent = content.replace(pattern, to);
    if (nextContent !== content) {
      touches.push({ path: filePath, relPath, content, nextContent });
    }
  }

  if (violations.length > 0) {
    return {
      exitCode: 1,
      data: { command: "cosmic.name.rename", status: "fail", filesChanged: [], violations, dryRun },
      summary: `cosmic.name.rename: ${violations.length} violation(s)`,
    };
  }
  if (touches.length === 0) {
    return {
      exitCode: 0,
      data: {
        command: "cosmic.name.rename",
        status: "noop",
        filesChanged: [],
        violations: [],
        dryRun,
      },
      summary: `cosmic.name.rename: no references to "${from}" found`,
    };
  }

  const filesChanged = touches.map((touch) => touch.relPath).sort();
  if (!dryRun) {
    for (const touch of touches) {
      await writeFile(touch.path, touch.nextContent, "utf8");
    }
  }

  return {
    exitCode: 0,
    data: {
      command: "cosmic.name.rename",
      status: "ok",
      filesChanged,
      violations: [],
      dryRun,
    },
    summary: dryRun
      ? `[dry-run] cosmic.name.rename: ${filesChanged.length} file(s) would be updated`
      : `cosmic.name.rename: ${filesChanged.length} file(s) updated (run archetype.registry.build to refresh index.yaml)`,
  };
}
