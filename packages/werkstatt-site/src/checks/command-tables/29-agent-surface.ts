/*
<MODULE_CONTRACT>
<purpose>Command table for the RFC-0286..0290 Agent Surface (capability manifest + protocol projections).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0286..0290: initial command table for Agent Surface (capability manifest + protocol projections).</item>
  <item>RFC-0291: add agent.manifest.verify (local + --url mode).</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runAgentManifestGenerate, runAgentSurfaceValidate } from "../agent/agent-manifest.ts";
import { runAgentKnowledgeGenerate, runAgentKnowledgeValidate } from "../agent/agent-knowledge.ts";
import { runAgentCapabilityValidate } from "../agent/agent-capability.ts";
import { runAgentOpenApiGenerate, runAgentOpenApiValidate } from "../agent/agent-openapi.ts";
import { runAgentRoutesGenerate } from "../agent/agent-routes.ts";
import { runAgentGateFixturesRun } from "../agent/agent-gate-fixtures.ts";
import { runAgentSurfaceSign, runAgentSurfaceVerify } from "../agent/agent-surface-sign.ts";

export const AGENT_SURFACE_COMMANDS: CheckCommandEntry[] = [
  {
    name: "agent.knowledge.generate",
    description:
      "Project the business layer into static per-domain JSON files under public/api/agent/v1/ (RFC-0287).",
    scope: "app",
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/public/api/agent/v1/*.json"],
    flags: {},
    reads: ["<app>/src/content/system.md", "<app>/src/content/business-profile/**/*.md"],
    modulePaths: ["agent/agent-knowledge.ts"],
    execute: runAgentKnowledgeGenerate,
  },
  {
    name: "agent.knowledge.validate",
    description:
      "Validate Agent Knowledge files: privacy boundary, envelope validity, generator↔artifact parity, freshness advisory (RFC-0287, AGK-01..05).",
    scope: "app",
    supportsAllSites: true,
    flags: {},
    reads: ["<app>/public/api/agent/v1/*.json", "<app>/src/content/system.md"],
    modulePaths: ["agent/agent-knowledge.ts"],
    execute: runAgentKnowledgeValidate,
  },
  {
    name: "agent.capability.validate",
    description:
      "Validate the closed capability catalog (packages/ontology/capabilities/) and enforce human-parity + gating for capabilities active on this app (RFC-0288, AGC-01..05).",
    scope: "app",
    supportsAllSites: true,
    flags: {},
    reads: ["packages/ontology/capabilities/**/*.yaml", "<app>/src/content/system.md"],
    modulePaths: ["agent/agent-capability.ts"],
    execute: runAgentCapabilityValidate,
  },
  {
    name: "agent.manifest.generate",
    description:
      "Assemble the Agent Surface Manifest and write src/agent-surface.generated.yaml + public/.well-known/agent.json (RFC-0286).",
    scope: "app",
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/agent-surface.generated.yaml", "<app>/public/.well-known/agent.json"],
    flags: {},
    reads: ["<app>/src/content/system.md", "<app>/public/api/agent/v1/*.json"],
    modulePaths: ["agent/agent-manifest.ts"],
    execute: runAgentManifestGenerate,
  },
  {
    name: "agent.surface.validate",
    description:
      "Validate the Agent Surface Manifest: privacy boundary, manifest↔artifact bijection, entitlement gating, staleness, proof presence (RFC-0286/0291, AGS-01..10).",
    scope: "app",
    supportsAllSites: true,
    flags: {},
    reads: ["<app>/src/agent-surface.generated.yaml", "<app>/public/.well-known/agent.json"],
    modulePaths: ["agent/agent-manifest.ts"],
    execute: runAgentSurfaceValidate,
  },
  {
    name: "agent.openapi.generate",
    description:
      "Generate the OpenAPI 3.1 projection of the Agent Surface Manifest to public/.well-known/agent.openapi.json (RFC-0289).",
    scope: "app",
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/public/.well-known/agent.openapi.json"],
    flags: {},
    reads: ["<app>/src/agent-surface.generated.yaml"],
    modulePaths: ["agent/agent-openapi.ts"],
    execute: runAgentOpenApiGenerate,
  },
  {
    name: "agent.openapi.validate",
    description:
      "Validate the OpenAPI projection: well-formedness and manifest↔document bijection (RFC-0289, AGO-01..04).",
    scope: "app",
    supportsAllSites: true,
    flags: {},
    reads: [
      "<app>/public/.well-known/agent.openapi.json",
      "<app>/src/agent-surface.generated.yaml",
    ],
    modulePaths: ["agent/agent-openapi.ts"],
    execute: runAgentOpenApiValidate,
  },
  {
    name: "agent.routes.generate",
    description:
      "Generate the thin Agent Gate route re-exports (/api/agent/mcp, /api/agent/actions/[id]) when the agent surface is enabled (RFC-0290).",
    scope: "app",
    supportsAllSites: true,
    mutatesState: true,
    writes: [
      "<app>/src/pages/api/agent/mcp.ts",
      "<app>/src/pages/api/agent/actions/[id].ts",
      "<app>/src/agent-capabilities.generated.yaml",
    ],
    flags: {},
    reads: ["<app>/src/agent-surface.generated.yaml"],
    modulePaths: ["agent/agent-routes.ts"],
    execute: runAgentRoutesGenerate,
  },
  {
    name: "agent.surface.sign",
    description:
      "Sign agent surface artifacts (manifest, knowledge files, OpenAPI) with detached Ed25519 proofs using PASSPORT_SIGNING_KEY (RFC-0308).",
    scope: "app",
    supportsAllSites: true,
    mutatesState: true,
    writes: [
      "<app>/src/agent-surface.generated.yaml",
      "<app>/public/.well-known/agent.json",
      "<app>/public/.well-known/agent.openapi.json",
      "<app>/public/api/agent/v1/*.json",
    ],
    flags: {},
    cacheable: false,
    execute: runAgentSurfaceSign,
  },
  {
    name: "agent.surface.verify",
    description:
      "Verify detached Ed25519 proofs on agent surface artifacts against the published cosmic-passport-key.json public key (RFC-0308).",
    scope: "app",
    supportsAllSites: true,
    flags: {},
    reads: [
      "<app>/public/.well-known/agent.json",
      "<app>/public/.well-known/agent.openapi.json",
      "<app>/public/api/agent/v1/*.json",
      "<app>/public/.well-known/cosmic-passport-key.json",
    ],
    modulePaths: ["agent/agent-surface-sign.ts"],
    execute: runAgentSurfaceVerify,
  },
  {
    name: "agent.gate.fixtures.run",
    description:
      "Replay the @warpgogol/agent-gate MCP + action conformance corpus (RFC-0290). Workspace-scoped regression gate for any protocol work.",
    scope: "workspace",
    flags: {},
    reads: ["packages/agent-gate/src/**/*.ts"],
    modulePaths: ["agent/agent-gate-fixtures.ts"],
    execute: runAgentGateFixturesRun,
  },
];
