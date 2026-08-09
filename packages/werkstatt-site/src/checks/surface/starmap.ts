/*
<MODULE_CONTRACT>
<purpose>surface.starmap command handler — project the Programmatic Surface into a cosmic star-map SVG.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted starmap handler from surface.ts into surface/starmap.ts.</item>
  <item>Fix: parse surface.generated.yaml with yaml instead of JSON.parse.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import { writeFileIfChanged } from "@warpgogol/site-kernel";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import type { SurfaceArtifact, VirtualRouteEntry } from "@warpgogol/werkstatt-site/surface";
import { failResult, passResult } from "../result-helpers.ts";
import { ARTIFACT_FILE } from "./shared.ts";

const STARMAP_FILE = "public/.well-known/pseo-star-map.svg";

function entryState(entry: VirtualRouteEntry): { label: string; color: string } {
  if (!entry.indexable) return { label: "redirect", color: "#3b3b3b" };
  const reason = entry.decision?.reason;
  if (reason === "decayed") return { label: "decayed", color: "#9aa0a6" };
  if (reason === "over-budget") return { label: "over-budget", color: "#c98a2b" };
  if (entry.noindex) return { label: "thin", color: "#b4593a" };
  return { label: "indexable", color: "#1d9e75" };
}

export async function runSurfaceStarmap(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "surface.starmap must run inside an app context." };
  }
  const artifactPath = join(app.directory, ARTIFACT_FILE);
  if (!existsSync(artifactPath)) {
    return passResult("surface.starmap", "skipped (no surface artifact)");
  }
  let artifact: SurfaceArtifact;
  try {
    artifact = yamlParse(await readFile(artifactPath, "utf8")) as SurfaceArtifact;
  } catch {
    return failResult("surface.starmap", [`${ARTIFACT_FILE} is not valid YAML`]);
  }
  const entries = Array.isArray(artifact.entries) ? artifact.entries : [];

  const byDepth = new Map<number, VirtualRouteEntry[]>();
  for (const entry of entries) {
    const list = byDepth.get(entry.depth) ?? [];
    list.push(entry);
    byDepth.set(entry.depth, list);
  }
  const depths = [...byDepth.keys()].sort((a, b) => a - b);

  const rowH = 56;
  const dotGap = 26;
  const left = 120;
  const width = Math.max(
    360,
    left + 26 * Math.max(1, ...[...byDepth.values()].map((l) => l.length)) + 40,
  );
  const height = 60 + depths.length * rowH;
  const stars: string[] = [];
  depths.forEach((depth, row) => {
    const y = 60 + row * rowH;
    stars.push(
      `<text x="16" y="${y + 4}" fill="#cfcfcf" font-size="12" font-family="sans-serif">L${depth} (${byDepth.get(depth)!.length})</text>`,
    );
    byDepth.get(depth)!.forEach((entry, i) => {
      const { color } = entryState(entry);
      const cx = left + i * dotGap;
      stars.push(
        `<circle cx="${cx}" cy="${y}" r="7" fill="${color}"><title>${entry.routes.de ?? entry.pageId} — ${entryState(entry).label}</title></circle>`,
      );
    });
  });

  const legend = [
    ["indexable", "#1d9e75"],
    ["thin", "#b4593a"],
    ["over-budget", "#c98a2b"],
    ["decayed", "#9aa0a6"],
    ["redirect", "#3b3b3b"],
  ]
    .map(([label, color], i) => {
      const lx = 16 + i * 110;
      return `<circle cx="${lx}" cy="${height - 16}" r="6" fill="${color}"/><text x="${lx + 12}" y="${height - 12}" fill="#cfcfcf" font-size="11" font-family="sans-serif">${label}</text>`;
    })
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Programmatic Surface star map">` +
    `<rect width="${width}" height="${height}" fill="#0b0d10"/>` +
    `<text x="16" y="28" fill="#f0f0f0" font-size="15" font-family="sans-serif" font-weight="600">Programmatic Surface — ${entries.length} pages</text>` +
    stars.join("") +
    legend +
    `</svg>\n`;

  if (!context.dryRun) {
    await mkdir(join(app.directory, "public", ".well-known"), { recursive: true });
    await writeFileIfChanged(join(app.directory, STARMAP_FILE), svg);
  }
  return {
    exitCode: 0,
    summary: `surface.starmap: ${entries.length} star(s) across ${depths.length} depth(s) → pseo-star-map.svg`,
  };
}
