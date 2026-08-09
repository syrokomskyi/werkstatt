/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/surface/freshness.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted freshness handler from surface.ts into surface/freshness.ts.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import type { SurfaceArtifact } from "@warpgogol/werkstatt-site/surface";
import { failResult, passResult } from "../result-helpers.ts";
import { ARTIFACT_FILE } from "./shared.ts";

export async function runSurfaceFreshness(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "surface.freshness must run inside an app context." };
  }
  const artifactPath = join(app.directory, ARTIFACT_FILE);
  if (!existsSync(artifactPath)) {
    return passResult("surface.freshness", "skipped (no surface artifact)");
  }
  let artifact: SurfaceArtifact;
  try {
    artifact = yamlParse(await readFile(artifactPath, "utf8")) as SurfaceArtifact;
  } catch {
    return failResult("surface.freshness", [`${ARTIFACT_FILE} is not valid YAML`]);
  }
  const entries = Array.isArray(artifact.entries) ? artifact.entries : [];
  const decayed = entries.filter((e) => e.decision?.reason === "decayed");
  return {
    exitCode: 0,
    summary: `surface.freshness: ${decayed.length} decayed page(s) of ${entries.length}`,
    data: {
      decayed: decayed.length,
      examples: decayed
        .slice(0, 5)
        .map((e) => ({ pageId: e.pageId, slug: Object.values(e.routes)[0] })),
    },
  };
}
