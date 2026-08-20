/*
<MODULE_CONTRACT>
<purpose>knowledge-materialize module — registers materialization and projection commands.</purpose>
<keywords>materialize, projection, knowledge</keywords>
<non-goals>
  <item>Do not implement full domain logic — Phase 1 stubs only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial knowledge-materialize module per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";
import { createMaterializeCommand } from "./materialize.ts";
import { createMaterializeVerifyCommand } from "./materialize-verify.ts";
import { createProjectionStatusCommand } from "./projection-status.ts";
import { createProjectionBuildCommand } from "./projection-build.ts";

export function createKnowledgeMaterializeModule(): KernelModule {
  return {
    name: "knowledge-materialize",
    version: "0.1.0",
    register(registry) {
      registry.registerCommand(createMaterializeCommand());
      registry.registerCommand(createMaterializeVerifyCommand());
      registry.registerCommand(createProjectionStatusCommand());
      registry.registerCommand(createProjectionBuildCommand());
    },
  };
}
