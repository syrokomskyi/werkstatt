/*
<MODULE_CONTRACT>
<purpose>Plugin entry for werkstatt-knowledge — evidence-backed knowledge systems stack.</purpose>
<keywords>plugin, knowledge, evidence, plugin-entry</keywords>
<responsibilities>
  <item>Exports werkstattKnowledgePlugin implementing WerkstattPlugin (werkstatt/plugin@1).</item>
  <item>Registers 5 kernel module loaders: source, core, extract, materialize, release.</item>
  <item>Registers all 5 hooks: materialize, build, checkGate, releaseEvidence, scaffoldProject.</item>
  <item>Declares KNO-001..028 stack invariants.</item>
  <item>deployAdapters intentionally absent — deployment is workspace infrastructure.</item>
</responsibilities>
<non-goals>
  <item>Do not import from @warpgogol/werkstatt-site or any other stack plugin.</item>
  <item>Do not import from the engine package beyond plugin contract types.</item>
  <item>Do not add deploy adapters — SPEC-v1.0 section 7 explicitly requires empty.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial werkstatt-knowledge plugin entry per SPEC-v1.0 and RFC-0894.</item>
</CHANGE_SUMMARY>
*/

import type { WerkstattPlugin } from "@warpgogol/werkstatt/plugin";
import { knowledgePathConventions } from "./paths/knowledge-paths.ts";
import { KNOWLEDGE_INVARIANTS } from "./invariants/knowledge-invariants.ts";
import { runKnowledgeMaterializeHook } from "./hooks/materialize.ts";
import { runKnowledgeBuildHook } from "./hooks/build.ts";
import { runKnowledgeCheckGate } from "./hooks/check-gate.ts";
import { runKnowledgeReleaseEvidenceHook } from "./hooks/release-evidence.ts";
import { runKnowledgeScaffoldProject } from "./hooks/scaffold-project.ts";

export const werkstattKnowledgePlugin: WerkstattPlugin = {
  schema: "werkstatt/plugin@1",
  id: "werkstatt-knowledge",
  profileId: "knowledge-typescript-turborepo",
  paths: knowledgePathConventions,
  moduleLoaders: {
    "knowledge-source": () =>
      import("./source/module.ts").then((m) => m.createKnowledgeSourceModule()),
    "knowledge-core": () => import("./core/module.ts").then((m) => m.createKnowledgeCoreModule()),
    "knowledge-extract": () =>
      import("./extract/module.ts").then((m) => m.createKnowledgeExtractModule()),
    "knowledge-materialize": () =>
      import("./materialize/module.ts").then((m) => m.createKnowledgeMaterializeModule()),
    "knowledge-release": () =>
      import("./release/module.ts").then((m) => m.createKnowledgeReleaseModule()),
  },
  hooks: {
    materialize: runKnowledgeMaterializeHook,
    build: runKnowledgeBuildHook,
    checkGate: runKnowledgeCheckGate,
    releaseEvidence: runKnowledgeReleaseEvidenceHook,
    scaffoldProject: runKnowledgeScaffoldProject,
  },
  invariants: KNOWLEDGE_INVARIANTS,
};

export { knowledgePathConventions, KNOWLEDGE_PATHS } from "./paths/knowledge-paths.ts";
export { KNOWLEDGE_INVARIANTS } from "./invariants/knowledge-invariants.ts";
export type { SourceScanData } from "./source/scan.ts";
export type { SourceStatusData } from "./source/status.ts";
export type { SourceBindData } from "./source/bind.ts";
export type { SourceVerifyData } from "./source/verify.ts";
