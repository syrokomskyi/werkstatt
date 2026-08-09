/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/15-demand.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0238: add demand.modifier.lint command registration.</item>
  <item>RFC-0244: add demands.hierarchy.validate command registration.</item>
  <item>RFC-0280/RFC-0281: add demand signal and Werk evidence commands.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runDemandModifierLint } from "../demand-modifier.ts";
import { runDemandHierarchyValidate } from "../demand-hierarchy.ts";
import {
  runDemandMapReport,
  runDemandSignalImport,
  runDemandSignalValidate,
  runSurfaceEvidenceJoin,
  runWerkRecordValidate,
} from "../surface-demand.ts";

export const DEMAND_COMMANDS: CheckCommandEntry[] = [
  {
    name: "demand.signal.import",
    description:
      "Offline-import aggregate GSC/Keyword Planner/manual search-demand exports into versioned demand-signal records (RFC-0280).",
    scope: "app",
    flags: {
      input: {
        kind: "string",
        description: "Input file path.",
      },
      lang: {
        kind: "string",
        description: "Language code.",
      },
      source: {
        kind: "string",
        description: "Source descriptor id or source label.",
      },
      importId: {
        kind: "string",
        description: "Deterministic import id for the demand-signal import.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/content/surface/demand-signals/{lang}/{signal}.md"],
    cacheable: false,
    execute: runDemandSignalImport,
  },
  {
    name: "demand.signal.validate",
    description:
      "Validate demand-signal schema, axis resolution, freshness, duplicate query bindings, and PII guards (RFC-0280).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/surface/demand-signals/**/*.md"],
    execute: runDemandSignalValidate,
  },
  {
    name: "demand.map.report",
    description:
      "Generate the query → volume → intent demand map from versioned demand-signal records (RFC-0280).",
    scope: "app",
    flags: {
      blueprint: {
        kind: "string",
        description: "Limit the command to one Blueprint id.",
      },
      lang: {
        kind: "string",
        description: "Language code.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/surface/demand-map.generated.yaml"],
    reads: ["<app>/src/content/surface/demand-signals/**/*.md"],
    execute: runDemandMapReport,
  },
  {
    name: "werk.record.validate",
    description:
      "Validate anchored, consented Werk records and their axis bindings before they can back public pages (RFC-0281).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/surface/werk-records/**/*.md"],
    execute: runWerkRecordValidate,
  },
  {
    name: "surface.evidence.join",
    description:
      "Generate the tuple → consented Werk evidence join used to bound deep PSEO existence by facts (RFC-0281).",
    scope: "app",
    flags: {
      blueprint: {
        kind: "string",
        description: "Limit the command to one Blueprint id.",
      },
      lang: {
        kind: "string",
        description: "Language code.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/surface/evidence-join.generated.yaml"],
    reads: ["<app>/src/content/surface/werk-records/**/*.md"],
    execute: runSurfaceEvidenceJoin,
  },
  {
    name: "demand.modifier.lint",
    description:
      "Scan the demands collection and fail when a demand slug is an intent modifier (price, urgent, near, best, etc.). RFC-0238.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/demands/**/*.md"],
    execute: runDemandModifierLint,
  },
  {
    name: "demands.hierarchy.validate",
    description:
      "Validate demand record folder hierarchy (canonical 1/2/3 segment levels), detect derived-slug collisions, and warn on slug frontmatter overrides. RFC-0244.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/demands/**/*.md"],
    execute: runDemandHierarchyValidate,
  },
];
