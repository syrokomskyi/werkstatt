/*
<MODULE_CONTRACT>
<purpose>knowledge.release.manifest — generates release manifest with canonical/source/projection hashes.</purpose>
<keywords>release, manifest, hashes, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate canonical data — produces manifest output only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial release manifest command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface ReleaseManifestData {
  command: string;
  status: "pass" | "fail" | "pending";
  manifestPath: string | null;
  message: string;
}

export async function runReleaseManifest(
  workspaceRoot: string,
): Promise<KernelCommandResult<ReleaseManifestData>> {
  return {
    data: {
      command: "knowledge.release.manifest",
      status: "pending",
      manifestPath: null,
      message: `Release manifest not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.release.manifest: pending (stub)",
  };
}

export function createReleaseManifestCommand(): KernelCommandDefinition<ReleaseManifestData> {
  return {
    name: "knowledge.release.manifest",
    description: "Generate release manifest with canonical/source/projection hashes",
    scope: "workspace",
    cacheable: false,
    reads: ["knowledge/**", ".generated/knowledge/**", "../*-source/**"],
    writes: [".generated/knowledge/release-manifest.yaml"],
    async execute(_input, context) {
      return runReleaseManifest(context.workspaceRoot);
    },
  };
}
