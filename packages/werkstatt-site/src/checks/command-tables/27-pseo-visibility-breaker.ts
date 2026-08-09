/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/27-pseo-visibility-breaker.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0282/RFC-0283: initial command table for PSEO visibility and breaker/rollback.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import {
  runVisibilityActionPlan,
  runVisibilityImport,
  runVisibilityReconcile,
} from "../pseo/pseo-visibility.ts";
import {
  runSurfaceBreakerEvaluate,
  runSurfaceRollbackApply,
  runSurfaceRollbackPlan,
} from "../surface-breaker.ts";

export const PSEO_VISIBILITY_BREAKER_COMMANDS: CheckCommandEntry[] = [
  {
    name: "visibility.import",
    description:
      "Import aggregate, PII-free offline visibility exports into versioned per-cluster snapshots (RFC-0282).",
    scope: "app",
    flags: {
      input: {
        kind: "string",
        description: "Input file path.",
      },
      source: {
        kind: "string",
        description: "Source descriptor id or source label.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/surface/visibility/*.snapshot.json"],
    cacheable: false,
    execute: runVisibilityImport,
  },
  {
    name: "visibility.reconcile",
    description:
      "Reconcile visibility snapshots against generated PSEO clusters and write outcome records (RFC-0282).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/surface/visibility/outcomes.generated.yaml"],
    reads: ["<app>/src/surface/visibility/*.snapshot.json"],
    execute: runVisibilityReconcile,
  },
  {
    name: "visibility.action.plan",
    description:
      "Apply the PSEO visibility action policy and propose expand/hold/prune/enrich/escalate per cluster (RFC-0282).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/surface/visibility/outcomes.generated.yaml"],
    reads: ["<app>/src/surface/visibility/*.snapshot.json"],
    execute: runVisibilityActionPlan,
  },
  {
    name: "surface.breaker.evaluate",
    description:
      "Evaluate PSEO safety tripwires, freeze affected scopes, demote autonomy, and open escalations on trips (RFC-0283).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: [
      "<app>/src/surface/freeze.generated.yaml",
      "<app>/src/surface/breaker.log.ndjson",
      "<app>/src/surface/autonomy.state.yaml",
      "<app>/src/surface/escalations.ndjson",
      "<app>/src/bordbuch/**",
      "<app>/public/.well-known/bordbuch/**",
    ],
    reads: [
      "<app>/src/surface/visibility/outcomes.generated.yaml",
      "<app>/src/surface/autonomy.state.yaml",
    ],
    execute: runSurfaceBreakerEvaluate,
  },
  {
    name: "surface.rollback.plan",
    description:
      "Plan a URL-non-destructive rollback to a recorded lastKnownGood surface state (RFC-0283).",
    scope: "app",
    flags: {
      to: {
        kind: "string",
        description: "Target value.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/surface/rollback-plan.generated.yaml"],
    reads: ["<app>/src/surface/states/pointer.yaml", "<app>/src/surface/breaker.log.ndjson"],
    execute: runSurfaceRollbackPlan,
  },
  {
    name: "surface.rollback.apply",
    description:
      "Apply a safe pointer rollback to a recorded surface state without deleting public URLs (RFC-0283).",
    scope: "app",
    flags: {
      to: {
        kind: "string",
        description: "Target value.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: [
      "<app>/src/surface/states/pointer.yaml",
      "<app>/src/surface/breaker.log.ndjson",
      "<app>/src/bordbuch/**",
      "<app>/public/.well-known/bordbuch/**",
    ],
    reads: ["<app>/src/surface/rollback-plan.generated.yaml"],
    execute: runSurfaceRollbackApply,
  },
];
