/*
<MODULE_CONTRACT>
<purpose>[RFC-0192/0193] Blueprint discovery: reads + validates the Blueprint YAML specs from
packages/ontology/blueprints, and reads a site's declared blueprint opt-ins from system.md.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of surface-expand.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { parseBlueprint, type Blueprint } from "@warpgogol/surface";

const BLUEPRINTS_DIR = join("packages", "ontology", "blueprints");

/**
 * RFC-0193: the Blueprint ids a site explicitly adopts via system.md `surface.blueprints`.
 * Returns the list when declared, or null when omitted (caller falls back to opt-in by datasets).
 */
export async function readDeclaredBlueprints(appDir: string): Promise<string[] | null> {
  try {
    const { loadSystemManifest } = await import("@warpgogol/werkstatt-site/content");
    const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
    const surface = (manifest as unknown as { surface?: { blueprints?: unknown } }).surface;
    return Array.isArray(surface?.blueprints) ? surface.blueprints.map(String) : null;
  } catch {
    return null;
  }
}

/** Discover, parse, and validate Blueprint YAML specs. Returns [] when the directory is absent. */
export async function loadSurfaceBlueprints(workspaceRoot: string): Promise<Blueprint[]> {
  const dir = join(workspaceRoot, BLUEPRINTS_DIR);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch {
    return [];
  }
  const { parse } = await import("yaml");
  const blueprints: Blueprint[] = [];
  for (const file of files) {
    const raw = await readFile(join(dir, file), "utf8");
    const parsed = parseBlueprint(parse(raw));
    if (!parsed.ok || !parsed.blueprint) {
      throw new Error(`Invalid blueprint "${file}": ${parsed.errors.join("; ")}`);
    }
    blueprints.push(parsed.blueprint);
  }
  return blueprints;
}
