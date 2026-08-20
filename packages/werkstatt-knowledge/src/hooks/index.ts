/*
<MODULE_CONTRACT>
<purpose>Barrel export for knowledge plugin hooks.</purpose>
<keywords>hooks, knowledge, barrel</keywords>
<non-goals>
  <item>Do not re-export Node-only modules — this barrel is imported by the plugin entry.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial hooks barrel.</item>
</CHANGE_SUMMARY>
*/

export { runKnowledgeMaterializeHook } from "./materialize.ts";
export { runKnowledgeBuildHook } from "./build.ts";
export { runKnowledgeCheckGate } from "./check-gate.ts";
export { runKnowledgeReleaseEvidenceHook } from "./release-evidence.ts";
export { runKnowledgeScaffoldProject } from "./scaffold-project.ts";
