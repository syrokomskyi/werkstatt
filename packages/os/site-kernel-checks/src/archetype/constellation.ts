/*
<MODULE_CONTRACT>
<purpose>constellation.contract.validate — validates constellation YAML files against the
ontology schema plus catalog linkage (every slot cosmicName must be declared by an archetype).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of archetype.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { constellationSchema } from "@gogol/ontology";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import {
  collectFilesMatching,
  loadArchetypeFiles,
  readYamlFile,
  type ValidateResult,
} from "./shared.ts";

export async function runConstellationContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ValidateResult>> {
  const constellationsRoot = join(context.workspaceRoot, "packages", "ontology", "constellations");
  const files = await collectFilesMatching(constellationsRoot, (filePath) =>
    filePath.endsWith(".yaml"),
  );
  const archetypes = await loadArchetypeFiles(context.workspaceRoot);
  const knownCosmicNames = new Set(
    archetypes.flatMap(({ archetype }) => archetype.acceptedCosmicNames),
  );
  const details: ValidateResult["details"] = [];

  for (const filePath of files) {
    const relFile = relative(context.workspaceRoot, filePath).replace(/\\/g, "/");
    try {
      const parsed = await readYamlFile(filePath, (value) => constellationSchema.parse(value));
      for (const slot of parsed.slots) {
        if (!knownCosmicNames.has(slot.cosmicName)) {
          details.push({
            file: relFile,
            message: `slot cosmicName \"${slot.cosmicName}\" is not declared by any archetype`,
          });
        }
      }
    } catch (error) {
      details.push({
        file: relFile,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    exitCode: details.length > 0 ? 1 : 0,
    data: { violations: details.length, details },
    summary: details.length === 0 ? `OK - ${files.length} constellations valid` : undefined,
  };
}
