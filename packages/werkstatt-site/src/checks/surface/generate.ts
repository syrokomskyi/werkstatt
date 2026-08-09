/*
<MODULE_CONTRACT>
<purpose>surface.generate command handler — expand entitled blueprints and write artifact + manifest.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0192: discovery + gate + artifact/manifest; expansion seam for RFC-0193.</item>
  <item>surface.generate now cleans up stale Markdown twins and lazy-cache files from the previous run before writing new ones.</item>
  <item>RFC-0303: extracted generate handler from surface.ts into surface/generate.ts.</item>
  <item>RFC-0496: post-bake injection of service catalog blocks into website-local depth-1 industry pages.</item>
  <item>RFC-0582: remove existsSync collection-directory filter from blueprint selection; add SURFACE-GEN-01 post-generation consistency check.</item>
</CHANGE_SUMMARY>
*/

import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  writeFileIfChanged,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { stringify as yamlStringify } from "yaml";
import {
  type Blueprint,
  type SurfaceArtifact,
  type SurfaceCounts,
  type SurfaceManifest,
  type VirtualRouteEntry,
} from "@warpgogol/werkstatt-site/surface";
import { diagnosticsResult, failResult } from "../result-helpers.ts";
import {
  loadSurfaceBlueprints,
  expandBlueprint,
  readDeclaredBlueprints,
} from "../surface-expand.ts";
import { injectServiceCatalogLinks } from "./service-catalog-links.ts";
import { loadSurfaceModuleContexts } from "../pseo/pseo-module-context.ts";
import {
  ARTIFACT_FILE,
  MANIFEST_FILE,
  countFor,
  pageIdToFile,
  readEntitledFeatures,
  readLangs,
  readPseoIndexBudget,
  readPseoRegionalUnlocked,
  recordSurfaceState,
} from "./shared.ts";

export async function runSurfaceGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "surface.generate must run inside an app context." };
  }
  const appDir = app.directory;
  const features = await readEntitledFeatures(appDir);
  const entitled = features === null ? null : new Set(features);
  const moduleContexts = await loadSurfaceModuleContexts(appDir).catch(() => ({
    modules: {},
    declaredBlueprints: [],
    supportedLocales: [],
  }));
  const modules = Object.values(moduleContexts.modules);
  const hasEntitledSurfaceModule =
    entitled === null ||
    modules.length === 0 ||
    modules.some((module) => entitled.has(module.entitlement));

  const allBlueprints: Blueprint[] = hasEntitledSurfaceModule
    ? await loadSurfaceBlueprints(context.workspaceRoot)
    : [];
  const declared = await readDeclaredBlueprints(appDir);
  const blueprints = allBlueprints.filter((bp) => {
    const owner = modules.find((module) => module.blueprints.includes(bp.id));
    const moduleEntitled = !owner || entitled === null || entitled.has(owner.entitlement);
    return moduleEntitled && (declared === null || declared.includes(bp.id));
  });

  const indexBudget = await readPseoIndexBudget(appDir);
  const regionalUnlocked = await readPseoRegionalUnlocked(appDir);

  const { defaultLang, supportedLangs } = await readLangs(appDir);

  let oldArtifact: SurfaceArtifact | null = null;
  try {
    const oldRaw = await readFile(join(appDir, ARTIFACT_FILE), "utf8");
    oldArtifact = JSON.parse(oldRaw) as SurfaceArtifact;
  } catch {
    oldArtifact = null;
  }
  if (!context.dryRun && oldArtifact) {
    const cacheDir = join(appDir, ".surface-cache");
    if (existsSync(cacheDir)) {
      try {
        await rm(cacheDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  const allEntries: VirtualRouteEntry[] = [];
  const surfaces: SurfaceCounts[] = [];
  let lazyPages = 0;
  for (const blueprint of blueprints) {
    try {
      const entries = await expandBlueprint(blueprint, {
        appDir,
        workspaceRoot: context.workspaceRoot,
        indexBudget,
        regionalUnlocked,
        defaultLang,
        supportedLangs,
        io: context.io,
      });

      surfaces.push(countFor(blueprint.id, entries));

      if (blueprint.policy.bake === "lazy" && !context.dryRun) {
        for (const entry of entries) {
          const full = entry.page;
          if (!full || !entry.pages) continue;
          const dest = join(appDir, ".surface-cache", `${pageIdToFile(entry.pageId)}.yaml`);
          await mkdir(dirname(dest), { recursive: true });
          await writeFile(dest, yamlStringify({ pages: entry.pages }), "utf8");
          entry.page = {
            kind: "page",
            cosmicStar: full.cosmicStar,
            title: full.title,
            description: full.description,
            lang: full.lang,
            blocks: [],
          };
          delete entry.pages;
          entry.lazy = true;
          lazyPages += 1;
        }
      }

      allEntries.push(...entries);
    } catch (err) {
      return failResult("surface.generate", [
        `blueprint "${blueprint.id}" expansion failed: ${err instanceof Error ? err.message : String(err)}`,
      ]);
    }
  }

  // RFC-0582: post-generation consistency check. surfaces[] always has one entry per
  // processed blueprint (countFor is called for every blueprint in the loop), so checking
  // surfaceId membership would never fire. Instead, check the `generated` count field.
  const emptyBlueprints = surfaces.filter((s) => s.generated === 0);
  if (emptyBlueprints.length > 0) {
    return diagnosticsResult("surface.generate", [
      {
        ruleId: "SURFACE-GEN-01",
        severity: "error",
        message: `declared blueprint '${emptyBlueprints[0]!.surfaceId}' produced zero entries — check expandBlueprint logs`,
      },
    ]);
  }

  // RFC-0496: inject service catalog blocks into website-local depth-1 industry pages.
  injectServiceCatalogLinks(allEntries, defaultLang);

  const artifact: SurfaceArtifact = {
    generatedAt: null,
    entries: allEntries,
  };
  const manifest: SurfaceManifest = {
    generatedAt: null,
    surfaces,
  };

  if (!context.dryRun) {
    await mkdir(join(appDir, "public", ".well-known"), { recursive: true });
    await writeFileIfChanged(join(appDir, ARTIFACT_FILE), `${yamlStringify(artifact)}`);
    await writeFileIfChanged(join(appDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
    await recordSurfaceState(appDir, app.name, artifact, manifest);
  }

  const indexable = surfaces.reduce((sum, s) => sum + s.indexable, 0);
  return {
    exitCode: 0,
    summary: `surface.generate: ${blueprints.length} blueprint(s), ${allEntries.length} route(s), ${indexable} indexable, ${lazyPages} lazy`,
    data: { surfaces, total: allEntries.length, lazyPages },
  };
}
