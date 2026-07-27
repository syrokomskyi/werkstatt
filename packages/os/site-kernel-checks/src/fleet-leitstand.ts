import { parse as yamlParse, stringify as yamlStringify } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>
  RFC-0284 fleet Leitstand command layer. Aggregates per-site primitives into
  a workspace-level control-plane snapshot and budgeted work plan.
</purpose>
<non-goals>
  <item>Do not approve content, centralize site state, or execute generated jobs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0284: fleet status aggregation, scheduler, escalation queue, and kill-switch.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import {
  fleetJobSchema,
  fleetPlanSchema,
  fleetSiteStatusSchema,
  type FleetJob,
  type FleetPlan,
  type FleetSiteStatus,
} from "@gogol/surface";
import { diagnosticsResult } from "./result-helpers.ts";

const FLEET_DIR = "fleet";
const FLEET_SITES_FILE = "fleet/fleet.sites.yaml";
const FLEET_STATUS_FILE = "fleet/fleet.status.generated.yaml";
const FLEET_PLAN_FILE = "fleet/fleet.plan.generated.yaml";
const FLEET_KILLSWITCH_FILE = "fleet/killswitch.state.yaml";

interface FleetSiteRef {
  site: string;
  path: string;
}

interface FleetMembership {
  sites?: FleetSiteRef[];
}

interface FleetStatusPayload {
  collectedAt: string | null;
  sites: FleetSiteStatus[];
  escalations: Array<{ site: string; open: number }>;
  humanMinutesPer1000Pages: number;
}

interface KillswitchState {
  active?: boolean;
  scope?: string;
  reason?: string;
  updatedAt?: string | null;
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return yamlParse(await readFile(path, "utf8")) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${yamlStringify(value)}`, "utf8");
}

async function discoverSites(workspaceRoot: string): Promise<FleetSiteRef[]> {
  const appsRoot = join(workspaceRoot, "apps");
  if (!existsSync(appsRoot)) return [];
  const entries = await readdir(appsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ site: entry.name, path: `apps/${entry.name}` }))
    .filter((entry) => existsSync(join(workspaceRoot, entry.path, "src", "content", "system.md")));
}

async function loadFleetSites(
  input: KernelCommandInput,
  workspaceRoot: string,
): Promise<{ sites: FleetSiteRef[]; diagnostics: Diagnostic[] }> {
  const file = typeof input.flags.sites === "string" ? input.flags.sites : FLEET_SITES_FILE;
  const diagnostics: Diagnostic[] = [];
  const path = join(workspaceRoot, file);
  if (!existsSync(path)) {
    const discovered = await discoverSites(workspaceRoot);
    if (discovered.length === 0) {
      diagnostics.push({
        ruleId: "FLEET-05",
        severity: "error",
        file,
        message: "No fleet membership file and no apps discovered.",
      });
    }
    return { sites: discovered, diagnostics };
  }
  try {
    const parsed = yamlParse(await readFile(path, "utf8")) as FleetMembership;
    const sites = (parsed.sites ?? []).filter((site) => site.site && site.path);
    if (sites.length === 0) {
      diagnostics.push({
        ruleId: "FLEET-05",
        severity: "error",
        file,
        message: "Fleet membership has no sites.",
      });
    }
    return { sites, diagnostics };
  } catch (error) {
    diagnostics.push({
      ruleId: "FLEET-05",
      severity: "error",
      file,
      message: `Fleet membership is malformed: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { sites: [], diagnostics };
  }
}

function autonomyMap(
  payload: {
    states?: Array<{
      scope?: { module?: string; fieldClass?: string; locale?: string };
      level?: string;
    }>;
  } | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const state of payload?.states ?? []) {
    if (!state.scope?.module || !state.scope.fieldClass || !state.scope.locale || !state.level)
      continue;
    out[`${state.scope.module}/${state.scope.fieldClass}/${state.scope.locale}`] = state.level;
  }
  return out;
}

async function lastOutcomeWindow(appDir: string): Promise<string | undefined> {
  const root = join(appDir, "src", "surface", "visibility");
  if (!existsSync(root)) return undefined;
  const files = (await readdir(root)).filter((file) => file.endsWith(".snapshot.json"));
  let latest: string | undefined;
  for (const file of files) {
    const payload = await readJson<{ snapshots?: Array<{ windowEnd?: string }> }>(join(root, file));
    for (const snapshot of payload?.snapshots ?? []) {
      if (snapshot.windowEnd && (!latest || snapshot.windowEnd > latest))
        latest = snapshot.windowEnd;
    }
  }
  return latest;
}

async function breakerState(
  appDir: string,
  fleetKill: KillswitchState | null,
): Promise<"armed" | "tripped" | "frozen"> {
  if (fleetKill?.active) return "frozen";
  const freeze = await readJson<{ frozen?: unknown[] }>(
    join(appDir, "src", "surface", "freeze.generated.yaml"),
  );
  if (Array.isArray(freeze?.frozen) && freeze.frozen.length > 0) return "frozen";
  const pointer = await readJson<{ lastKnownGood?: string }>(
    join(appDir, "src", "surface", "states", "pointer.yaml"),
  );
  const logPath = join(appDir, "src", "surface", "breaker.log.ndjson");
  if (existsSync(logPath)) {
    const lines = (await readFile(logPath, "utf8")).split(/\r?\n/).filter(Boolean);
    const last = lines.at(-1);
    if (last) {
      const parsed = yamlParse(last) as { trippedTripwires?: unknown[] };
      if (Array.isArray(parsed.trippedTripwires) && parsed.trippedTripwires.length > 0)
        return "tripped";
    }
  }
  return pointer?.lastKnownGood ? "armed" : "armed";
}

async function collectOneSite(
  workspaceRoot: string,
  ref: FleetSiteRef,
  fleetKill: KillswitchState | null,
): Promise<{ status: FleetSiteStatus; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const appDir = join(workspaceRoot, ref.path);
  const bordbuch = await readJson<{
    ledgerHash?: string | null;
    openEscalations?: unknown[];
    pseo?: { visibility?: { actions?: Record<string, number> } };
  }>(join(appDir, "bordbuch", "status.generated.yaml"));
  if (!bordbuch) {
    diagnostics.push({
      ruleId: "FLEET-01",
      severity: "warning",
      file: relative(workspaceRoot, join(appDir, "bordbuch", "status.generated.yaml")),
      message: `${ref.site} has no Bordbuch status projection.`,
    });
  }
  const autonomy = autonomyMap(
    await readJson(join(appDir, "src", "surface", "autonomy.state.yaml")),
  );
  const budget = await readJson<{ budgets?: Array<{ minutesPer1000Pages?: number }> }>(
    join(appDir, "src", "surface", "escalation-budget.generated.yaml"),
  );
  const visibility = await readJson<{ outcomes?: Array<{ proposedAction?: string }> }>(
    join(appDir, "src", "surface", "visibility", "outcomes.generated.yaml"),
  );
  const dirtyFlags: string[] = [];
  for (const outcome of visibility?.outcomes ?? []) {
    if (outcome.proposedAction && outcome.proposedAction !== "hold")
      dirtyFlags.push(`action:${outcome.proposedAction}`);
  }
  const openEscalations = Array.isArray(bordbuch?.openEscalations)
    ? bordbuch.openEscalations.length
    : 0;
  if (openEscalations > 0) dirtyFlags.push("escalations:open");
  const breaker = await breakerState(appDir, fleetKill);
  if (breaker !== "armed") dirtyFlags.push(`breaker:${breaker}`);
  const status = fleetSiteStatusSchema.parse({
    site: ref.site,
    path: ref.path,
    bordbuchHash: bordbuch?.ledgerHash ?? null,
    autonomy,
    openEscalations,
    breaker,
    dirtyFlags: [...new Set(dirtyFlags)],
    lastOutcomeWindow: await lastOutcomeWindow(appDir),
    humanMinutesPer1000Pages: budget?.budgets?.[0]?.minutesPer1000Pages ?? 0,
  });
  return { status, diagnostics };
}

async function collectFleet(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<{ payload: FleetStatusPayload; diagnostics: Diagnostic[] }> {
  const { sites, diagnostics } = await loadFleetSites(input, context.workspaceRoot);
  const fleetKill = await readJson<KillswitchState>(
    join(context.workspaceRoot, FLEET_KILLSWITCH_FILE),
  );
  const statuses: FleetSiteStatus[] = [];
  for (const site of sites) {
    const collected = await collectOneSite(context.workspaceRoot, site, fleetKill);
    statuses.push(collected.status);
    diagnostics.push(...collected.diagnostics);
  }
  const humanMinutesPer1000Pages =
    statuses.length === 0
      ? 0
      : statuses.reduce((sum, status) => sum + (status.humanMinutesPer1000Pages ?? 0), 0) /
        statuses.length;
  return {
    diagnostics,
    payload: {
      collectedAt: null,
      sites: statuses,
      escalations: statuses.map((status) => ({ site: status.site, open: status.openEscalations })),
      humanMinutesPer1000Pages,
    },
  };
}

function jobsForStatus(status: FleetSiteStatus): FleetJob[] {
  const jobs: FleetJob[] = [];
  if (
    status.breaker === "frozen" ||
    status.breaker === "tripped" ||
    status.dirtyFlags.includes("action:prune")
  ) {
    jobs.push(
      fleetJobSchema.parse({
        site: status.site,
        kind: "rollback",
        priority: 100,
        safety: true,
        estimatedCost: { ciSeconds: 30 },
      }),
    );
  }
  if (status.openEscalations > 0 || status.dirtyFlags.includes("action:escalate")) {
    jobs.push(
      fleetJobSchema.parse({
        site: status.site,
        kind: "review",
        scope: "escalation-queue",
        priority: 90,
        safety: true,
        estimatedCost: { reviewMinutes: Math.max(10, status.openEscalations * 10) },
      }),
    );
  }
  if (status.dirtyFlags.includes("action:enrich")) {
    jobs.push(
      fleetJobSchema.parse({
        site: status.site,
        kind: "enrich",
        priority: 60,
        estimatedCost: { llmTokens: 800, reviewMinutes: 2 },
      }),
    );
  }
  if (status.dirtyFlags.includes("action:expand")) {
    jobs.push(
      fleetJobSchema.parse({
        site: status.site,
        kind: "generate",
        priority: 50,
        estimatedCost: { llmTokens: 250, ciSeconds: 30 },
      }),
    );
  }
  return jobs;
}

function withinBudget(
  used: FleetPlan["budgets"],
  add: FleetJob["estimatedCost"],
  budgets: FleetPlan["budgets"],
): boolean {
  return (
    used.llmTokens + (add.llmTokens ?? 0) <= budgets.llmTokens &&
    used.reviewMinutes + (add.reviewMinutes ?? 0) <= budgets.reviewMinutes &&
    used.ciSeconds + (add.ciSeconds ?? 0) <= budgets.ciSeconds
  );
}

async function readBudgets(
  input: KernelCommandInput,
  workspaceRoot: string,
): Promise<FleetPlan["budgets"]> {
  const budgetFile = typeof input.flags.budget === "string" ? input.flags.budget : undefined;
  if (budgetFile) {
    const parsed = await readJson<Partial<FleetPlan["budgets"]>>(join(workspaceRoot, budgetFile));
    return {
      llmTokens: parsed?.llmTokens ?? 10_000,
      reviewMinutes: parsed?.reviewMinutes ?? 120,
      ciSeconds: parsed?.ciSeconds ?? 1_800,
    };
  }
  return { llmTokens: 10_000, reviewMinutes: 120, ciSeconds: 1_800 };
}

export async function runFleetStatusCollect(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { payload, diagnostics } = await collectFleet(input, context);
  if (!diagnostics.some((diagnostic) => diagnostic.severity === "error") && !context.dryRun) {
    await writeJson(join(context.workspaceRoot, FLEET_STATUS_FILE), payload);
  }
  return {
    ...diagnosticsResult("fleet.status.collect", diagnostics),
    summary: `fleet.status.collect: ${payload.sites.length} site(s), ${diagnostics.length} diagnostic(s)`,
  };
}

export async function runFleetSchedulePlan(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { payload, diagnostics } = await collectFleet(input, context);
  const budgets = await readBudgets(input, context.workspaceRoot);
  const fairShare = Number(input.flags["site-share"] ?? 0.6);
  const jobs = payload.sites.flatMap(jobsForStatus).sort((a, b) => b.priority - a.priority);
  const used = { llmTokens: 0, reviewMinutes: 0, ciSeconds: 0 };
  const siteUsed = new Map<string, typeof used>();
  const scheduled: FleetJob[] = [];
  const blocked: Array<{ site: string; reason: string }> = [];
  for (const job of jobs) {
    if (job.safety) {
      scheduled.push(job);
      continue;
    }
    const currentSite = siteUsed.get(job.site) ?? { llmTokens: 0, reviewMinutes: 0, ciSeconds: 0 };
    const siteLimit = {
      llmTokens: budgets.llmTokens * fairShare,
      reviewMinutes: budgets.reviewMinutes * fairShare,
      ciSeconds: budgets.ciSeconds * fairShare,
    };
    if (!withinBudget(used, job.estimatedCost, budgets)) {
      blocked.push({ site: job.site, reason: `budget clipped ${job.kind}` });
      continue;
    }
    if (!withinBudget(currentSite, job.estimatedCost, siteLimit)) {
      blocked.push({ site: job.site, reason: `fair-share clipped ${job.kind}` });
      continue;
    }
    used.llmTokens += job.estimatedCost.llmTokens ?? 0;
    used.reviewMinutes += job.estimatedCost.reviewMinutes ?? 0;
    used.ciSeconds += job.estimatedCost.ciSeconds ?? 0;
    currentSite.llmTokens += job.estimatedCost.llmTokens ?? 0;
    currentSite.reviewMinutes += job.estimatedCost.reviewMinutes ?? 0;
    currentSite.ciSeconds += job.estimatedCost.ciSeconds ?? 0;
    siteUsed.set(job.site, currentSite);
    scheduled.push(job);
  }
  if (blocked.length > 0) {
    diagnostics.push({
      ruleId: "FLEET-03",
      severity: "warning",
      file: FLEET_PLAN_FILE,
      message: `${blocked.length} non-safety fleet job(s) were budget-clipped.`,
    });
  }
  const plan = fleetPlanSchema.parse({
    collectedAt: null,
    budgets,
    jobs: scheduled,
    blocked,
    humanMinutesPer1000Pages: payload.humanMinutesPer1000Pages,
  });
  if (!diagnostics.some((diagnostic) => diagnostic.severity === "error") && !context.dryRun) {
    await writeJson(join(context.workspaceRoot, FLEET_PLAN_FILE), {
      generatedAt: null,
      ...plan,
    });
  }
  return {
    ...diagnosticsResult("fleet.schedule.plan", diagnostics),
    summary: `fleet.schedule.plan: ${plan.jobs.length} job(s), ${plan.blocked.length} blocked`,
  };
}

export async function runFleetKillswitch(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const clear = input.flags.clear === true;
  const scope = typeof input.flags.scope === "string" ? input.flags.scope : "all";
  const reason = typeof input.flags.reason === "string" ? input.flags.reason : clear ? "clear" : "";
  const diagnostics: Diagnostic[] = [];
  if (!clear && !reason) {
    diagnostics.push({
      ruleId: "FLEET-04",
      severity: "error",
      file: FLEET_KILLSWITCH_FILE,
      message: "fleet.killswitch requires --reason unless --clear is set.",
    });
  }
  const state: KillswitchState = {
    active: !clear,
    scope,
    reason,
    updatedAt: null,
  };
  const { sites, diagnostics: membershipDiagnostics } = await loadFleetSites(
    input,
    context.workspaceRoot,
  );
  diagnostics.push(...membershipDiagnostics);
  if (!diagnostics.some((diagnostic) => diagnostic.severity === "error") && !context.dryRun) {
    await writeJson(join(context.workspaceRoot, FLEET_KILLSWITCH_FILE), state);
    for (const site of sites) {
      const freezePath = join(
        context.workspaceRoot,
        site.path,
        "src",
        "surface",
        "freeze.generated.yaml",
      );
      if (clear) {
        const existing = await readJson<{ frozen?: Array<{ tripwires?: string[] }> }>(freezePath);
        const remaining = (existing?.frozen ?? []).filter(
          (item) => !(item.tripwires ?? []).includes("fleet-killswitch"),
        );
        await writeJson(freezePath, {
          generatedAt: null,
          frozen: remaining,
        });
      } else {
        await writeJson(freezePath, {
          generatedAt: null,
          frozen: [
            { scope, reason: `fleet.killswitch: ${reason}`, tripwires: ["fleet-killswitch"] },
          ],
        });
      }
    }
  }
  return {
    ...diagnosticsResult("fleet.killswitch", diagnostics),
    summary: `fleet.killswitch: ${clear ? "cleared" : "engaged"} ${scope}`,
  };
}
