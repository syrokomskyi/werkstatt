/*
<MODULE_CONTRACT>
<purpose>Shared helpers for the three-phase build pipeline (build.prepare → astro build → build.post) used by mission.build, mission.validate, and release.prepare. Centralizes pipeline execution and build-input-hash computation to eliminate duplication.</purpose>
<non-goals>
  <item>Does not define pipeline composition or command registration — that lives in site-kernel-checks pipelines.</item>
  <item>Does not run astro build directly — callers own the execSync call between build.prepare and build.post.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0008: extracted runPipelinePhase and computeBuildInputHash from mission-materialization-commands.ts and release-commands.ts to eliminate 5x duplicated pipeline execution pattern and 2x duplicated build-input-hash computation.</item>
</CHANGE_SUMMARY>
*/
import path from "node:path";
import { existsSync } from "node:fs";
import type { KernelPipelineReport } from "@warpgogol/site-kernel";
import { executeKernelPipeline } from "@warpgogol/site-kernel";
import { fingerprintTree } from "@warpgogol/fingerprint/semantic";
import { byteHash } from "@warpgogol/fingerprint";
import { resolveCurrentEcosystem, resolvePlatformSemanticHash } from "./bundle-io.ts";

/**
 * Runs a kernel pipeline phase and throws a descriptive error if it fails.
 * Centralizes the executeKernelPipeline → unwrap → ok-check → format-failings pattern
 * that is used by mission.build, mission.validate, and release.prepare.
 */
export async function runPipelinePhase(
  workspaceRoot: string,
  pipelineName: string,
  siteName: string,
): Promise<KernelPipelineReport> {
  const result = await executeKernelPipeline({
    workspaceRoot,
    pipelineName,
    siteName,
    outputFormat: "pretty",
  });
  const report: KernelPipelineReport = Array.isArray(result) ? result[0] : result;
  if (!report.ok) {
    const failed = report.steps
      .filter((s) => !s.ok)
      .map((s) => `${s.commandName} (exit ${s.exitCode})`);
    throw new Error(`${pipelineName} failed: ${failed.join(", ")}`);
  }
  return report;
}

export interface BuildInputHashResult {
  buildInputHash: string;
  workpieceTreeHash: string;
  platformVersion: string;
  platformSemanticHash: string;
}

/**
 * Computes the build input hash for a workpiece directory.
 * Centralizes the content-tree-hash + platform-version + platform-semantic-hash
 * computation used by mission.build (to write build-input-hash.json) and
 * release.prepare (to decide whether to reuse a distribution).
 * Returns intermediate values so release.prepare can populate the release manifest.
 */
export async function computeBuildInputHash(
  workspaceRoot: string,
  workpieceDir: string,
): Promise<BuildInputHashResult> {
  const { version: platformVersion } = await resolveCurrentEcosystem(workspaceRoot);
  const platformSemanticHash = await resolvePlatformSemanticHash(workspaceRoot);
  const contentDir = path.join(workpieceDir, "src", "content");
  let workpieceTreeHash = "sha256:absent";
  if (existsSync(contentDir)) {
    const contentResult = await fingerprintTree(contentDir, { mode: "semantic" });
    workpieceTreeHash = contentResult.value;
  }
  const buildInputHash = byteHash(
    `${workpieceTreeHash}|${platformVersion}|${platformSemanticHash}`,
  );
  return { buildInputHash, workpieceTreeHash, platformVersion, platformSemanticHash };
}
