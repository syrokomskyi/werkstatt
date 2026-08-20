/*
<MODULE_CONTRACT>
<purpose>knowledge-source module — registers source boundary commands.</purpose>
<keywords>source, scan, bind, verify, knowledge</keywords>
<non-goals>
  <item>Do not implement full domain logic — Phase 1 stubs only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial knowledge-source module per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";
import { createSourceScanCommand } from "./scan.ts";
import { createSourceStatusCommand } from "./status.ts";
import { createSourceBindCommand } from "./bind.ts";
import { createSourceVerifyCommand } from "./verify.ts";

export function createKnowledgeSourceModule(): KernelModule {
  return {
    name: "knowledge-source",
    version: "0.1.0",
    register(registry) {
      registry.registerCommand(createSourceScanCommand());
      registry.registerCommand(createSourceStatusCommand());
      registry.registerCommand(createSourceBindCommand());
      registry.registerCommand(createSourceVerifyCommand());
    },
  };
}
