/*
<MODULE_CONTRACT>
<purpose>Consolidated command table for fleet Bordbuch and Leitstand control-plane commands.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Merged 25-bordbuch.ts and 28-fleet-leitstand.ts into fleet-bordbuch.ts.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import {
  runFleetKillswitch,
  runFleetSchedulePlan,
  runFleetStatusCollect,
} from "../fleet-leitstand.ts";
import { runFleetSitesGenerate } from "../fleet-sites-generate.ts";
import {
  runFleetAgentCatalogGenerate,
  runFleetAgentCatalogValidate,
} from "../fleet-agent-catalog.ts";

export const FLEET_BORDBUCH_COMMANDS: CheckCommandEntry[] = [
  {
    name: "fleet.sites.generate",
    description:
      "Generate fleet/fleet.sites.yaml from workspace site discovery (RFC-0378). Converts the fleet sites file to a generated projection with a GENERATED header.",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    writes: ["fleet/fleet.sites.yaml"],
    reads: ["systems/registry.yaml", "systems/*/system.pin.json"],
    execute: runFleetSitesGenerate,
  },
  {
    name: "fleet.status.collect",
    description:
      "Collect per-site Bordbuch, autonomy, visibility, breaker, and escalation status into one fleet snapshot (RFC-0284).",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    writes: ["fleet/fleet.status.generated.yaml"],
    cacheable: false,
    execute: runFleetStatusCollect,
  },
  {
    name: "fleet.schedule.plan",
    description:
      "Plan cross-site PSEO work from dirty flags under global budgets and fair-share limits; safety jobs are never clipped (RFC-0284).",
    scope: "workspace",
    flags: {
      "site-share": {
        kind: "string",
        description: "Fair-share budget fraction per site.",
      },
    },
    mutatesState: true,
    writes: ["fleet/fleet.plan.generated.yaml"],
    cacheable: false,
    execute: runFleetSchedulePlan,
  },
  {
    name: "fleet.killswitch",
    description:
      "Engage or clear the global fleet freeze state; engaged switches also write per-site freeze projections (RFC-0284).",
    scope: "workspace",
    flags: {
      clear: {
        kind: "boolean",
        description: "Clear the current killswitch state.",
      },
      scope: {
        kind: "string",
        description: "Command-specific scope selector.",
      },
      reason: {
        kind: "string",
        description: "Human-readable reason.",
      },
    },
    mutatesState: true,
    writes: ["fleet/killswitch.state.yaml", "apps/*/src/surface/freeze.generated.yaml"],
    cacheable: false,
    execute: runFleetKillswitch,
  },
  {
    name: "fleet.agent.catalog.generate",
    description:
      "Fold every site's built agent.json into one deterministic fleet catalog at fleet/agent-catalog.generated.yaml (RFC-0292).",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    writes: ["fleet/agent-catalog.generated.yaml"],
    reads: ["systems/*/public/agent.json", "fleet/fleet.sites.yaml"],
    execute: runFleetAgentCatalogGenerate,
  },
  {
    name: "fleet.agent.catalog.validate",
    description:
      "Validate fleet agent catalog coherence: staleness (FAC-01), malformed docs (FAC-02), duplicate baseUrls (FAC-03), posture drift (FAC-04), capability skew (FAC-05) (RFC-0292).",
    scope: "workspace",
    flags: {},
    reads: ["fleet/agent-catalog.generated.yaml", "fleet/fleet.sites.yaml"],
    execute: runFleetAgentCatalogValidate,
  },
];
