/*
<MODULE_CONTRACT>
<purpose>Agent Control Plane, maintenance debt, CI, and workspace discovery diagnostic rule descriptors.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from diagnostics/rules.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import type { RuleDescriptor } from "./types.ts";
import { rule } from "./types.ts";

/** Agent Control Plane, maintenance debt, CI, and workspace discovery rules. */
export const GOVERNANCE_RULES: Record<string, RuleDescriptor> = {
  // Agent Control Plane (RFC-0245/RFC-0246).
  "ecosystem.manifest.validate": rule(
    "ecosystem.manifest.validate",
    "Agent Control Plane manifest drift",
    "ecosystem.manifest.validate",
  ),
  "workspace.surface.validate": rule(
    "workspace.surface.validate",
    "Workspace surface missing from Agent Control Plane",
    "workspace.surface.validate",
  ),
  "test.signal.validate": rule(
    "test.signal.validate",
    "Package test signal is absent, noop, or inconsistently skipped",
    "test.signal.validate",
    "warning",
  ),
  "test.signal.policy.validate": rule(
    "test.signal.policy.validate",
    "Package test posture lacks owner/rationale/review policy metadata",
    "test.signal.policy.validate",
  ),
  "maintenance.debt.baseline.validate": rule(
    "maintenance.debt.baseline.validate",
    "Maintenance debt baseline drift or review issue",
    "maintenance.debt.baseline.validate",
  ),
  "MDQ-01": rule(
    "MDQ-01",
    "Maintenance debt queue YAML is malformed",
    "maintenance.debt.queue.validate",
  ),
  "MDQ-02": rule(
    "MDQ-02",
    "Maintenance debt queue id is duplicated",
    "maintenance.debt.queue.validate",
  ),
  "MDQ-03": rule(
    "MDQ-03",
    "Maintenance debt queue selector references an unknown scope",
    "maintenance.debt.queue.validate",
  ),
  "MDQ-04": rule(
    "MDQ-04",
    "Active maintenance debt queue has no matching current debt",
    "maintenance.debt.queue.validate",
  ),
  "MDQ-05": rule(
    "MDQ-05",
    "Accepted warning debt is not covered by an active or paused queue",
    "maintenance.debt.queue.validate",
    "warning",
  ),
  "MDQ-06": rule(
    "MDQ-06",
    "Maintenance debt queue pins a stale item",
    "maintenance.debt.queue.validate",
  ),
  "MDQ-07": rule(
    "MDQ-07",
    "Maintenance debt queue enables forbidden push policy",
    "maintenance.debt.queue.validate",
  ),
  "MDQ-08": rule(
    "MDQ-08",
    "Maintenance debt queue has no acceptance commands",
    "maintenance.debt.queue.validate",
  ),
  "MDQ-09": rule(
    "MDQ-09",
    "Completed maintenance debt queue still matches current debt",
    "maintenance.debt.queue.validate",
  ),
  "MDQ-10": rule(
    "MDQ-10",
    "Maintenance debt queue item or rule sits outside selector scope",
    "maintenance.debt.queue.validate",
  ),
  "MDQ-12": rule(
    "MDQ-12",
    "Requested maintenance debt queue does not exist",
    "maintenance.debt.queue.validate",
  ),
  "ci.local.validate": rule(
    "ci.local.validate",
    "Autonomous CI workflow drift",
    "ci.local.validate",
  ),
  "WORKSPACE-DISCOVERY-01": rule(
    "WORKSPACE-DISCOVERY-01",
    "Workspace package directory is not classified",
    "workspace.discovery.validate",
  ),
  "WORKSPACE-DISCOVERY-02": rule(
    "WORKSPACE-DISCOVERY-02",
    "Workspace package is missing package.json name",
    "workspace.discovery.validate",
  ),
  "WORKSPACE-DISCOVERY-03": rule(
    "WORKSPACE-DISCOVERY-03",
    "Workspace glob pattern is unsupported",
    "workspace.discovery.validate",
  ),
  "WORKSPACE-DISCOVERY-04": rule(
    "WORKSPACE-DISCOVERY-04",
    "Workspace package directory has duplicate pattern matches",
    "workspace.discovery.validate",
  ),
  "CI-LOCAL-01": rule(
    "CI-LOCAL-01",
    "Required CI command is missing from run steps",
    "ci.local.validate",
  ),
  "CI-LOCAL-02": rule(
    "CI-LOCAL-02",
    "Required app author check is missing from run steps",
    "ci.local.validate",
  ),
  "CI-LOCAL-03": rule(
    "CI-LOCAL-03",
    "pnpm/action-setup version mismatches root packageManager",
    "ci.local.validate",
  ),
  "CI-LOCAL-04": rule(
    "CI-LOCAL-04",
    "Workflow pnpm setup lacks Corepack or matching setup",
    "ci.local.validate",
  ),
  "CI-LOCAL-05": rule(
    "CI-LOCAL-05",
    "Workflow YAML is malformed or missing jobs",
    "ci.local.validate",
  ),
  "CI-LOCAL-06": rule(
    "CI-LOCAL-06",
    "Required command appears only outside run steps",
    "ci.local.validate",
  ),
};
