/*
<MODULE_CONTRACT>
<purpose>archetype.registry.build / archetype.registry.validate / planet.import-paths.lint —
builds and validates packages/ontology/archetypes/index.yaml from archetype YAML + UI manifests.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of archetype.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileExists as pathExists } from "@warpgogol/werkstatt-site/share/fs";
import { PlanetCatalog, MoonCatalog } from "@warpgogol/werkstatt-site/ontology";
import { writeFileAtomic } from "@warpgogol/werkstatt/kernel";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import {
  ARCHETYPE_REGISTRY_FILENAME,
  FRAMEWORK_INTERNAL_ARCHETYPES,
  loadArchetypeFiles,
  loadUiManifestFiles,
  deriveImportPathMaps,
  derivePlanetMaps,
  findClosestRole,
  type ArchetypeLayer,
  type ArchetypeRegistry,
  type ValidateResult,
} from "./shared.ts";

interface BuildResult {
  written: number;
  outputFile: string;
  dryRun: boolean;
}

interface PlanetImportPathsLintResult {
  violations: number;
  warnings: number;
  details: Array<{ file?: string; severity: "error" | "warn"; message: string }>;
}

export async function runArchetypeRegistryBuild(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<BuildResult>> {
  const archetypes = await loadArchetypeFiles(context.workspaceRoot);
  const { planetImportPaths, moonImportPaths, blockTypeToCosmicName, roleByCosmicName } =
    await deriveImportPathMaps(context.workspaceRoot);
  const sectionRoles = [
    ...new Set(
      archetypes
        .filter(({ layer }) => layer === "section")
        .map(({ archetype }) => archetype.semanticRole),
    ),
  ].sort();
  const componentRoles = [
    ...new Set(
      archetypes
        .filter(({ layer }) => layer === "component")
        .map(({ archetype }) => archetype.semanticRole),
    ),
  ].sort();
  const registry: ArchetypeRegistry = {
    schemaVersion: "1.0.0",
    totalCount: archetypes.length,
    entries: archetypes.map(({ relFile, archetype, layer }) => ({
      id: archetype.id,
      displayName: archetype.displayName,
      semanticRole: archetype.semanticRole,
      version: archetype.version,
      layoutHint: archetype.layoutHint,
      acceptedCosmicNames: [...archetype.acceptedCosmicNames],
      sourceFile: relFile,
      layer,
    })),
    sectionRoles,
    componentRoles,
    // RFC-0091: derived maps from manifests
    planetImportPaths,
    blockTypeToCosmicName,
    // RFC-0097: shell-component import paths derived from shell.* archetypes
    moonImportPaths,
    // RFC-0263: manifest-authored role, derived — replaces name-keyed dispatch literals
    roleByCosmicName,
  };

  const outputFile = join(
    context.workspaceRoot,
    "packages",
    "ontology",
    "archetypes",
    "index.yaml",
  );
  const outputJsonFile = join(
    context.workspaceRoot,
    "packages",
    "ontology",
    "archetypes",
    "index.json",
  );
  if (!context.dryRun) {
    // RFC-0258: workspace-root output (packages/ontology/) — must be atomic.
    await writeFileAtomic(outputFile, yamlStringify(registry) + "\n");
    await writeFileAtomic(outputJsonFile, JSON.stringify(registry, null, 2) + "\n");
  }

  return {
    exitCode: 0,
    data: {
      written: context.dryRun ? 0 : registry.totalCount,
      outputFile: ARCHETYPE_REGISTRY_FILENAME,
      dryRun: context.dryRun,
    },
    summary: context.dryRun
      ? `[dry-run] would write ${registry.totalCount} archetype entries`
      : `OK - wrote ${registry.totalCount} archetype entries (${Object.keys(planetImportPaths).length} planetImportPaths, ${Object.keys(blockTypeToCosmicName).length} blockTypeToCosmicName)`,
  };
}

/**
 * Validates the derived planetImportPaths and blockTypeToCosmicName in the
 * archetype registry against the on-disk UI manifest files. Ensures every
 * manifest cosmicName has a registered import path and vice versa.
 */
export async function runPlanetImportPathsLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PlanetImportPathsLintResult>> {
  const details: PlanetImportPathsLintResult["details"] = [];
  const outputFile = join(
    context.workspaceRoot,
    "packages",
    "ontology",
    "archetypes",
    "index.yaml",
  );

  let currentRegistry: ArchetypeRegistry;
  try {
    currentRegistry = yamlParse(await readFile(outputFile, "utf8")) as ArchetypeRegistry;
  } catch {
    details.push({
      file: ARCHETYPE_REGISTRY_FILENAME,
      severity: "error",
      message: "registry file is missing or invalid YAML; run archetype.registry.build",
    });
    return { exitCode: 1, data: { violations: 1, warnings: 0, details } };
  }

  const { planetImportPaths: registryPaths, blockTypeToCosmicName: registryBlockTypes } =
    currentRegistry;

  const manifests = await loadUiManifestFiles(context.workspaceRoot);

  // 1. Every manifest cosmicName must appear in registry planetImportPaths,
  //    except shell component archetypes.
  const registeredSet = new Set(Object.keys(registryPaths ?? {}));
  for (const { relFile, manifest } of manifests) {
    if (manifest.layer === "component" && manifest.archetype.startsWith("shell.")) continue;

    if (!registeredSet.has(manifest.cosmicName)) {
      details.push({
        file: relFile,
        severity: "error",
        message: `manifest cosmicName "${manifest.cosmicName}" (archetype: ${manifest.archetype}) has no entry in registry planetImportPaths; run archetype.registry.build`,
      });
    }
  }

  // 2. Every registry planetImportPaths key should correspond to at least
  //    one on-disk manifest. Warn for entries without a manifest (they may
  //    be intentional reserved/fallback entries like Amalthea).
  const manifestCosmicNames = new Set<string>(manifests.map((m) => m.manifest.cosmicName));
  for (const [cosmicName, importPath] of Object.entries(registryPaths ?? {})) {
    if (!manifestCosmicNames.has(cosmicName as string)) {
      details.push({
        severity: "warn",
        message: `registry planetImportPaths has "${cosmicName}" → "${importPath}" but no on-disk manifest claims this cosmicName (reserved/fallback entry)`,
      });
    }
  }

  // 3. No shell archetype accidental leak into planetImportPaths
  for (const { relFile, manifest } of manifests) {
    if (manifest.layer === "component" && manifest.archetype.startsWith("shell.")) {
      if (registeredSet.has(manifest.cosmicName)) {
        details.push({
          file: relFile,
          severity: "error",
          message: `shell component archetype "${manifest.archetype}" (cosmicName: ${manifest.cosmicName}) is registered in planetImportPaths; shell components belong in MOON_IMPORT_PATHS`,
        });
      }
    }
  }

  // 4. Validate blockTypeToCosmicName freshness: every archetype id used
  //    in a manifest (section + non-shell component) should map correctly.
  const derivedBlockTypes: Record<string, string> = {};
  const sortedManifests = [...manifests].sort((a, b) => {
    const aScore = a.manifest.layer === "section" ? 0 : 1;
    const bScore = b.manifest.layer === "section" ? 0 : 1;
    return aScore - bScore;
  });
  for (const { manifest } of sortedManifests) {
    if (manifest.layer === "component" && manifest.archetype.startsWith("shell.")) continue;
    if (!(manifest.archetype in derivedBlockTypes)) {
      derivedBlockTypes[manifest.archetype] = manifest.cosmicName;
    }
  }
  for (const [archetypeId, expectedCosmic] of Object.entries(derivedBlockTypes)) {
    const registeredCosmic = registryBlockTypes?.[archetypeId];
    if (registeredCosmic !== expectedCosmic) {
      const expected = expectedCosmic
        ? `expected "${expectedCosmic}"`
        : "expected no mapping (shell archetype without manifest)";
      details.push({
        severity: "error",
        message: `blockTypeToCosmicName mismatch for archetype "${archetypeId}": registry has "${registeredCosmic ?? "(missing)"}" but ${expected}; run archetype.registry.build`,
      });
    }
  }

  const violations = details.filter((d) => d.severity === "error").length;
  const warnings = details.filter((d) => d.severity === "warn").length;

  return {
    exitCode: violations > 0 ? 1 : 0,
    data: { violations, warnings, details },
    summary:
      violations === 0 && warnings === 0
        ? "OK - all planet import paths in sync"
        : `${violations} violation(s), ${warnings} warning(s)`,
  };
}

export async function runArchetypeRegistryValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ValidateResult>> {
  const details: ValidateResult["details"] = [];
  const outputFile = join(
    context.workspaceRoot,
    "packages",
    "ontology",
    "archetypes",
    "index.yaml",
  );
  if (!(await pathExists(outputFile))) {
    details.push({
      file: ARCHETYPE_REGISTRY_FILENAME,
      message: "registry file is missing; run archetype.registry.build",
    });
    return { exitCode: 1, data: { violations: details.length, details } };
  }

  let currentRegistry: ArchetypeRegistry;
  try {
    currentRegistry = yamlParse(await readFile(outputFile, "utf8")) as ArchetypeRegistry;
  } catch (error) {
    details.push({
      file: ARCHETYPE_REGISTRY_FILENAME,
      message: `invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { exitCode: 1, data: { violations: details.length, details } };
  }

  const archetypes = await loadArchetypeFiles(context.workspaceRoot);
  const expectedEntries = archetypes.map(({ relFile, archetype, layer }) => ({
    id: archetype.id,
    displayName: archetype.displayName,
    semanticRole: archetype.semanticRole,
    version: archetype.version,
    layoutHint: archetype.layoutHint,
    acceptedCosmicNames: [...archetype.acceptedCosmicNames],
    sourceFile: relFile,
    layer,
  }));

  const expectedSectionRoles = [
    ...new Set(
      archetypes
        .filter(({ layer }) => layer === "section")
        .map(({ archetype }) => archetype.semanticRole),
    ),
  ].sort();
  const expectedComponentRoles = [
    ...new Set(
      archetypes
        .filter(({ layer }) => layer === "component")
        .map(({ archetype }) => archetype.semanticRole),
    ),
  ].sort();
  const {
    planetImportPaths: expectedPlanetImportPaths,
    blockTypeToCosmicName: expectedBlockTypeToCosmicName,
  } = await derivePlanetMaps(context.workspaceRoot);
  const expectedJson = JSON.stringify({
    schemaVersion: "1.0.0",
    totalCount: expectedEntries.length,
    entries: expectedEntries,
    sectionRoles: expectedSectionRoles,
    componentRoles: expectedComponentRoles,
    planetImportPaths: expectedPlanetImportPaths,
    blockTypeToCosmicName: expectedBlockTypeToCosmicName,
  });
  const currentJson = JSON.stringify({
    schemaVersion: currentRegistry.schemaVersion,
    totalCount: currentRegistry.totalCount,
    entries: currentRegistry.entries,
    sectionRoles: currentRegistry.sectionRoles ?? [],
    componentRoles: currentRegistry.componentRoles ?? [],
    planetImportPaths: currentRegistry.planetImportPaths ?? {},
    blockTypeToCosmicName: currentRegistry.blockTypeToCosmicName ?? {},
  });

  if (expectedJson !== currentJson) {
    details.push({
      file: ARCHETYPE_REGISTRY_FILENAME,
      message: "registry is stale; run archetype.registry.build",
    });
  }

  const manifests = await loadUiManifestFiles(context.workspaceRoot);
  const knownIds = new Set(archetypes.map(({ archetype }) => archetype.id));
  for (const { relFile, manifest } of manifests) {
    if (!knownIds.has(manifest.archetype)) {
      // RFC-0108 §"Proposal E" + RFC-0130: section-framework primitives
      // (the structural building blocks introduced by RFC-0101..RFC-0106) are
      // framework-internal — their cosmic names are picked by the framework
      // rather than authored as user-facing archetypes. They carry component
      // manifests for the cosmic catalog + import-paths registry but have no
      // archetype YAML by design.
      if (FRAMEWORK_INTERNAL_ARCHETYPES.has(manifest.archetype)) continue;
      details.push({
        file: relFile,
        message: `references unknown archetype \"${manifest.archetype}\"`,
      });
    }
  }

  // RFC-0084: cross-check section-manifest roles against the archetype-derived
  // sectionRoles[] set. Replaces the closed SemanticRoleValues enum so adding
  // a new section archetype no longer requires editing packages/ontology/src/enums.ts.
  // Component-layer cross-check is deferred until component manifests are
  // reconciled with their archetype semanticRoles (component manifests
  // currently use unprefixed role values while archetypes ship `component-*`
  // prefixed semanticRoles — out of scope for RFC-0084).
  const sectionRoleSet = new Set(expectedSectionRoles);
  for (const { relFile, manifest } of manifests) {
    if (manifest.layer !== "section") continue;
    if (typeof manifest.role !== "string" || manifest.role.length === 0) continue;
    if (!sectionRoleSet.has(manifest.role)) {
      const closest = findClosestRole(manifest.role, expectedSectionRoles);
      const hint = closest ? ` — closest match: "${closest}"` : "";
      details.push({
        file: relFile,
        message: `section manifest uses role \"${manifest.role}\" which is not declared by any section archetype's semanticRole${hint} (RFC-0084)`,
      });
    }
  }

  // RFC-0083: cross-check each archetype's acceptedCosmicNames against the
  // catalog matching its layer (section → PlanetCatalog, component →
  // MoonCatalog) AND reject duplicates within the same layer.
  // Without these checks a section archetype can ship a MoonCatalog name (e.g.
  // Naiad on founder-trust-card during the May 2026 warpgogol-com onboarding)
  // and the mismatch only surfaces when a downstream constellation slot
  // validator opaquely complains.
  const catalogsByLayer: Record<
    ArchetypeLayer,
    { allow: Set<string>; wrong: Set<string>; allowName: string; wrongName: string }
  > = {
    section: {
      allow: new Set<string>(PlanetCatalog),
      wrong: new Set<string>(MoonCatalog),
      allowName: "PlanetCatalog",
      wrongName: "MoonCatalog",
    },
    component: {
      allow: new Set<string>(MoonCatalog),
      wrong: new Set<string>(PlanetCatalog),
      allowName: "MoonCatalog",
      wrongName: "PlanetCatalog",
    },
  };
  const cosmicAssignmentsByLayer: Record<ArchetypeLayer, Map<string, string[]>> = {
    section: new Map(),
    component: new Map(),
  };
  for (const { relFile, archetype, layer } of archetypes) {
    const catalog = catalogsByLayer[layer];
    for (const cosmicName of archetype.acceptedCosmicNames) {
      if (!catalog.allow.has(cosmicName)) {
        const hint = catalog.wrong.has(cosmicName)
          ? ` (this name lives in ${catalog.wrongName}, which is for the other layer; pick a ${catalog.allowName} name or move the archetype to the matching directory)`
          : ` (${catalog.allowName} members only; see packages/ontology/src/cosmic/)`;
        details.push({
          file: relFile,
          message: `archetype \"${archetype.id}\" (${layer}) declares acceptedCosmicNames[\"${cosmicName}\"] but \"${cosmicName}\" is not in the ${layer}-layer ${catalog.allowName}${hint}`,
        });
      }
      const assignments = cosmicAssignmentsByLayer[layer];
      const existing = assignments.get(cosmicName) ?? [];
      existing.push(archetype.id);
      assignments.set(cosmicName, existing);
    }
  }
  for (const [layer, assignments] of Object.entries(cosmicAssignmentsByLayer) as Array<
    [ArchetypeLayer, Map<string, string[]>]
  >) {
    for (const [cosmicName, archetypeIds] of assignments) {
      if (archetypeIds.length > 1) {
        details.push({
          file: ARCHETYPE_REGISTRY_FILENAME,
          message: `cosmicName \"${cosmicName}\" is declared by ${archetypeIds.length} ${layer} archetypes (${archetypeIds.join(", ")}); each name may belong to at most one archetype per layer (RFC-0083)`,
        });
      }
    }
  }

  return {
    exitCode: details.length > 0 ? 1 : 0,
    data: { violations: details.length, details },
    summary:
      details.length === 0 ? `OK - ${expectedEntries.length} archetypes validated` : undefined,
  };
}
