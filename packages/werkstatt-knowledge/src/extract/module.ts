/*
<MODULE_CONTRACT>
<purpose>knowledge-extract module — registers extractor and refresh commands.</purpose>
<keywords>extract, refresh, knowledge</keywords>
<non-goals>
  <item>Do not implement full domain logic — Phase 1 stubs only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial knowledge-extract module per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";
import { createExtractListCommand } from "./list.ts";
import { createExtractRunCommand } from "./run.ts";
import { createExtractVerifyCommand } from "./verify.ts";
import { createRefreshPrepareCommand } from "./refresh-prepare.ts";
import { createRefreshApplyCommand } from "./refresh-apply.ts";

export function createKnowledgeExtractModule(): KernelModule {
  return {
    name: "knowledge-extract",
    version: "0.1.0",
    register(registry) {
      registry.registerCommand(createExtractListCommand());
      registry.registerCommand(createExtractRunCommand());
      registry.registerCommand(createExtractVerifyCommand());
      registry.registerCommand(createRefreshPrepareCommand());
      registry.registerCommand(createRefreshApplyCommand());
    },
  };
}
