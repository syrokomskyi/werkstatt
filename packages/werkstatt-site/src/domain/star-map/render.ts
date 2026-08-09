/*
<MODULE_CONTRACT>
<purpose>Generates a deterministic SVG representation of a star map from a resolved cosmic hierarchy.</purpose>
<non-goals>
  <item>Do not parse or validate system manifest or registry data — use manifestToStarMapInput adapter for that.</item>
  <item>Do not handle user interface interactions or event management.</item>
  <item>Do not modify the graph structure after its initial construction.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Refined Compass scaffolding to improve clarity and navigation within the code.</item>
  <item>Architecture review: deepen renderStarMap behind StarMapInput interface. Return { svg, hash }. Add manifestToStarMapInput adapter. Add emitStarMap helper.</item>
  <item>wg-fix: replace SystemManifest with StarMapManifestSubset in adapter to eliminate type casts. Fix ungrounded snapshot test assertion.</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/werkstatt-site/star-map — SVG renderer
 *
 * DNA-32 / RFC-0028
 *
 * DETERMINISM CONTRACT: renderStarMap(input)
 * produces byte-identical SVG for identical inputs. No Math.random() or
 * Date.now() in any code path. Snapshot tests are deferred (testSignal: skipped).
 *
 * Output: { svg, hash } — SVG markup + SHA-256 for change detection.
 * Emits to: dist/.well-known/cosmic-star-map.svg
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  UniRegistry,
  StarMapDepth,
  StarMapInput,
  StarMapOutput,
  StarMapStar,
  StarMapPlanet,
  StarMapMoon,
  StarMapManifestSubset,
  StarMapGraph,
  StarMapNode,
  StarMapEdge,
} from "./types.ts";
import { computeLayout } from "./layout.ts";
import { renderSvg } from "./svg-renderer.ts";

// ---------------------------------------------------------------------------
// Adapter: SystemManifest → StarMapInput
// ---------------------------------------------------------------------------

/**
 * Convert a manifest subset + UniRegistry into a resolved StarMapInput.
 *
 * This is the seam where manifest traversal and route resolution happen.
 * Callers that construct StarMapInput directly bypass this adapter.
 * Accepts StarMapManifestSubset — any SystemManifest satisfying the subset works.
 */
export function manifestToStarMapInput(
  manifest: StarMapManifestSubset,
  registry: UniRegistry,
  depth: StarMapDepth,
): StarMapInput {
  const appId = manifest.app;
  const constellations = manifest.constellations ?? [];
  const constellation = constellations[0] ?? appId;
  const defaultLang = manifest.i18n?.default ?? "de";

  const stars: StarMapStar[] = (manifest.pages ?? []).map((page) => {
    const rawRoute = (page.routes && page.routes[defaultLang]) ?? page.route ?? "";
    const route = rawRoute === "" ? "/" : rawRoute;

    const planets: StarMapPlanet[] = (page.planets ?? []).map((planetPin) => {
      const moons: StarMapMoon[] | undefined =
        depth === 4 ? resolveMoons(registry, planetPin.cosmicPlanet) : undefined;

      return {
        cosmicPlanet: planetPin.cosmicPlanet,
        pin: planetPin.pin,
        moons,
      };
    });

    return { route, cosmicStar: page.cosmicStar, planets };
  });

  return { appId, constellation, depth, stars };
}

function resolveMoons(registry: UniRegistry, cosmicPlanet: string): StarMapMoon[] {
  const registryEntry = Object.values(registry).find(
    (e) => e.cosmicName === cosmicPlanet && e.layer === "section",
  );
  if (!registryEntry) return [];

  return Object.values(registry)
    .filter((e) => e.layer === "component" && e.packagePath === registryEntry.packagePath)
    .map((e) => ({ cosmicName: e.cosmicName }));
}

// ---------------------------------------------------------------------------
// Graph construction (internal)
// ---------------------------------------------------------------------------

function buildGraph(input: StarMapInput): StarMapGraph {
  const nodes: StarMapNode[] = [];
  const edges: StarMapEdge[] = [];

  const constellationNodeId = `constellation:${input.constellation}`;
  nodes.push({
    id: constellationNodeId,
    kind: "constellation",
    label: input.constellation,
    cosmicName: input.constellation,
  });

  for (const star of input.stars) {
    const starId = `star:${star.route}`;
    nodes.push({
      id: starId,
      kind: "star",
      label: star.cosmicStar,
      cosmicName: star.cosmicStar,
      route: star.route,
    });
    edges.push({ from: constellationNodeId, to: starId });

    for (const planet of star.planets) {
      const planetId = `planet:${star.route}:${planet.cosmicPlanet}`;
      nodes.push({
        id: planetId,
        kind: "planet",
        label: planet.cosmicPlanet,
        cosmicName: planet.cosmicPlanet,
        pin: planet.pin,
      });
      edges.push({ from: starId, to: planetId });

      if (input.depth === 4) {
        for (const moon of planet.moons ?? []) {
          const moonId = `moon:${planetId}:${moon.cosmicName}`;
          nodes.push({
            id: moonId,
            kind: "moon",
            label: moon.cosmicName,
            cosmicName: moon.cosmicName,
          });
          edges.push({ from: planetId, to: moonId });
        }
      }
    }
  }

  return { nodes, edges, appId: input.appId, constellation: input.constellation };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the star map as a deterministic SVG + SHA-256 hash.
 *
 * @param input — resolved cosmic hierarchy (construct directly or via manifestToStarMapInput)
 * @returns     — { svg, hash } (byte-stable for identical inputs)
 */
export function renderStarMap(input: StarMapInput): StarMapOutput {
  const width = input.width ?? 1200;
  const height = input.height ?? 800;

  const graph = buildGraph(input);
  const positions = computeLayout(graph, width, height);

  return renderSvg(graph, positions, {
    appId: input.appId,
    depth: input.depth,
    width,
    height,
  });
}

/**
 * Render the star map and write the SVG to a file path.
 * Creates parent directories as needed.
 *
 * @param input   — resolved cosmic hierarchy
 * @param outPath — absolute path to the output SVG file
 * @returns       — { svg, hash } (same as renderStarMap)
 */
export async function emitStarMap(input: StarMapInput, outPath: string): Promise<StarMapOutput> {
  const result = renderStarMap(input);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, result.svg, "utf8");
  return result;
}
