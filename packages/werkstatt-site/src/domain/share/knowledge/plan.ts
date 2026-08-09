/*
<MODULE_CONTRACT>
<purpose>
RFC-0216: Content Maintenance Plan — shared contracts and task-id hashing. The
planner is a pure consolidator over RFC-0213 (freshness ledger), RFC-0214 (source
outbox), and RFC-0215 (derivation states). Each signal becomes a deduplicated
MaintenanceTask with a pre-deadline dueAt, owner, criticality, and the originating
Diagnostic rule ids. Framework-free; no filesystem access.
</purpose>
<keywords>RFC-0216, CKL, maintenance, plan, task, criticality, calendar</keywords>
<responsibilities>
  <item>Define MaintenanceTask, MaintenancePlan, Criticality, MaintenanceTrigger.</item>
  <item>Stable task id = sha256 of (subject + trigger) so re-runs are idempotent.</item>
  <item>Compute pre-deadline dueAt from validUntil − leadTime or reviewDueAt.</item>
</responsibilities>
<non-goals>
  <item>Do not read the filesystem or fetch sources — the kernel command does that.</item>
  <item>Do not emit Diagnostics — tasks are the plan's output; the gate reads plan.gate.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="MaintenanceTask / MaintenancePlan">Core plan contracts.</entry>
  <entry key="stableTaskId">Idempotent hash for (subject, trigger).</entry>
  <entry key="computeDueAt">Pre-deadline task date from policy + signal.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0216: initial maintenance plan contracts.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";

export type MaintenanceTrigger =
  "review-due" | "expiring-soon" | "expired" | "source-diverged" | "derived-outdated";

export type Criticality = "advisory" | "important" | "blocking";

export interface MaintenanceTask {
  /** Stable hash of (subject + trigger) — idempotent across plan builds. */
  id: string;
  subject: string;
  trigger: MaintenanceTrigger;
  /** Pre-deadline: validUntil − leadTime, or reviewDueAt, or today for already-expired/diverged. */
  dueAt: string;
  criticality: Criticality;
  owner: string;
  /** Originating Diagnostic rule ids (e.g. "CKL-FRESH-02 apps/…/offer.claims.yaml:3"). */
  diagnostics: string[];
  status: "open" | "routed" | "done";
}

export interface MaintenancePlan {
  generatedAt: string | null;
  site: string;
  tasks: MaintenanceTask[];
  gate: {
    /** Amber: important + expired, advisory + any, or important + expiring. Ships with flag. */
    amber: number;
    /** Red: blocking + expired/diverged. Blocks build. */
    red: number;
  };
}

/** Deterministic task id — hash of (subject, trigger). */
export function stableTaskId(subject: string, trigger: MaintenanceTrigger): string {
  return `t_${createHash("sha256").update(`${subject}:${trigger}`, "utf8").digest("hex").slice(0, 16)}`;
}

/**
 * Compute a pre-deadline dueAt for a task.
 * - For time-based signals: validUntil − leadTimeDays (clamped to today if already past).
 * - For already-expired or event-driven signals: today (already overdue).
 */
export function computeDueAt(opts: {
  validUntil?: string;
  reviewDueAt?: string;
  leadTimeDays: number;
  today: string;
}): string {
  const { validUntil, reviewDueAt, leadTimeDays, today } = opts;
  if (validUntil) {
    // Subtract leadTimeDays by finding (validUntil in ms) - (leadTimeDays * ms/day).
    const vu = Date.parse(`${validUntil}T00:00:00Z`);
    if (!Number.isNaN(vu)) {
      const early = new Date(vu - leadTimeDays * 86_400_000).toISOString().slice(0, 10);
      if (early > today) return early;
    }
    return today;
  }
  if (reviewDueAt) return reviewDueAt < today ? today : reviewDueAt;
  return today;
}

/** Default gate policy for a trigger × criticality pair. */
export function defaultCriticality(trigger: MaintenanceTrigger): Criticality {
  if (trigger === "expired") return "important";
  if (trigger === "source-diverged") return "important";
  return "advisory";
}

/**
 * The single source of truth for the red (build-blocking) gate verdict, shared by
 * content.plan.build and (future) APPS_CHECK so the two never diverge. A task is
 * red iff it is `blocking` criticality AND its claim no longer matches reality,
 * has drifted from its source/derivation, or its required comparative-commercial
 * source review is due.
 */
export function isRedTask(
  task: Pick<MaintenanceTask, "criticality" | "trigger" | "status">,
): boolean {
  if (task.status === "done") return false;
  if (task.criticality !== "blocking") return false;
  return (
    task.trigger === "review-due" ||
    task.trigger === "expired" ||
    task.trigger === "source-diverged" ||
    task.trigger === "derived-outdated"
  );
}

export const GENERATED_MARKER =
  "GENERATED. Do not change this line unless the file contains project specific changes.";
