/*
<MODULE_CONTRACT>
<purpose>
Manifest resolver: reads section/component manifest YAML from packages/ui/src
and returns the composed propsSchema for a given cosmicName. Concentrates all
filesystem I/O, YAML parsing, and fragment composition behind one interface.
</purpose>
<non-goals>
  <item>Do not define Zod schemas here — pure resolution and I/O.</item>
  <item>Do not validate cross-system.yaml references — that is page.block.validate's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-10: extracted from page-entry.ts to separate declarative schemas from runtime I/O.</item>
  <item>RFC-0484: suppress console.debug for directories without manifests — group directories are expected to have none.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { sectionManifestSchema } from "../manifest.ts";
import { composeManifestPropsSchema } from "../shared-section-props/index.ts";

/**
 * Reads the manifest YAML for the section assigned to `planetName` and returns
 * its `propsSchema` (JSON Schema object) along with the section's `semanticId`
 * and current `version`.
 *
 * Returns null when no manifest is found for the given planet name, or when
 * the manifest has no `propsSchema` declared.
 *
 * @param cosmicName — PlanetCatalog or passport-reserved MoonCatalog name
 * @param packagesUiRoot — absolute path to packages/ui/src (for locating manifests)
 *
 * Usage (in page.block.validate):
 * ```ts
 * const schema = await getSectionPropsSchema("Europa", "/workspace/packages/ui/src");
 * ```
 */
export async function getSectionPropsSchema(
  cosmicName: string,
  packagesUiRoot: string,
): Promise<{
  propsSchema: Record<string, unknown>;
  semanticId: string;
  version: string;
} | null> {
  // Scan section AND component manifests — the five PASSPORT-RESERVED moons
  // resolve to component manifests (passport components are invoked as
  // page-blocks on cosmic/passport and cosmic/star-map routes — RFC-0028).
  const candidates: Array<{ dir: string; layer: "sections" | "components" }> = [];
  for (const layer of ["sections", "components"] as const) {
    const layerDir = join(packagesUiRoot, layer);
    try {
      const entries = await readdir(layerDir);
      for (const e of entries) candidates.push({ dir: e, layer });
    } catch (err) {
      console.debug(
        `[manifest-resolver] ${layerDir} not readable — skipping (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }

  for (const { dir, layer } of candidates) {
    const layerSuffix = layer === "sections" ? "-section" : "-component";
    const layerDir = join(packagesUiRoot, layer);
    const manifestPath = join(layerDir, dir, `${dir}${layerSuffix}.manifest.yaml`);
    const manifestPathAlt = join(layerDir, dir, `${dir}.manifest.yaml`);

    let raw: string | null = null;
    try {
      raw = await readFile(manifestPath, "utf8");
    } catch {
      try {
        raw = await readFile(manifestPathAlt, "utf8");
      } catch {
        // No manifest file found for this directory — expected for group
        // directories (effects, section-body, seo) that contain sub-components
        // but are not components themselves. Skip silently (RFC-0484).
        continue;
      }
    }

    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = parseYaml(raw);
    } catch (err) {
      console.debug(
        `[manifest-resolver] YAML parse failed for ${dir}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    const result = sectionManifestSchema.safeParse(parsed);
    if (!result.success) continue;

    if (result.data.cosmicName === cosmicName) {
      const compose = result.data.propsSchemaCompose;
      const local = result.data.propsSchema;

      // RFC-0101 + RFC-0102 + RFC-0103: when the manifest declares
      // propsSchemaCompose, merge the referenced shared fragments before
      // validation. A manifest without either field disables strict prop
      // validation (existing behaviour preserved).
      if (!compose && !local) return null;

      const composed = composeManifestPropsSchema({
        compose,
        local: local as Record<string, unknown> | undefined,
      });
      return {
        propsSchema: composed,
        semanticId: result.data.semanticId,
        version: result.data.version,
      };
    }
  }

  return null;
}
