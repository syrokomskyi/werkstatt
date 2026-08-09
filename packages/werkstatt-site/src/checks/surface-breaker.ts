/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/surface-breaker.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not delete generated pages or bypass RFC-0277 URL non-destruction policy.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0283: safety circuit-breaker, freeze projection, trip log, and rollback pointer commands.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeFileIfChanged, executeKernelCommand } from "@warpgogol/site-kernel";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import {
  breakerVerdictSchema,
  surfaceStateSchema,
  tripwireSchema,
  type BreakerVerdict,
  type ClusterOutcome,
  type SurfaceState,
  type Tripwire,
} from "@warpgogol/werkstatt-site/surface";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { runAutonomyDemote, runEscalationRoute } from "./pseo/pseo-governance.ts";
import { readVisibilityOutcomes } from "./pseo/pseo-visibility.ts";

const STATE_POINTER_FILE = "src/surface/states/pointer.yaml";
const BREAKER_LOG_FILE = "src/surface/breaker.log.ndjson";
const FREEZE_FILE = "src/surface/freeze.generated.yaml";
const ROLLBACK_PLAN_FILE = "src/surface/rollback-plan.generated.yaml";
const AUTONOMY_STATE_FILE = "src/surface/autonomy.state.yaml";

const LEVEL_ORDER: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };

interface PointerFile {
  current?: string;
  shipped?: string;
  lastKnownGood?: string;
  rolledBackFrom?: string;
  updatedAt?: string | null;
}

interface AutonomyStatePayload {
  states?: Array<{
    scope?: { module?: string; fieldClass?: string; locale?: string };
    level?: string;
  }>;
}

interface RollbackPlan {
  generatedAt: string | null;
  to: string;
  from?: string;
  operations: Array<{
    kind: "restore-pointer" | "noindex" | "redirect";
    target: string;
    reason: string;
  }>;
}

async function readJson<T>(appDir: string, file: string): Promise<T | null> {
  const path = join(appDir, file);
  if (!existsSync(path)) return null;
  return yamlParse(await readFile(path, "utf8")) as T;
}

async function writeJson(appDir: string, file: string, value: unknown): Promise<void> {
  const path = join(appDir, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFileIfChanged(path, `${yamlStringify(value)}`);
}

async function readState(appDir: string, id: string): Promise<SurfaceState | null> {
  const raw = await readJson<unknown>(appDir, `src/surface/states/${id}.state.yaml`);
  const parsed = surfaceStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function scopeForOutcome(outcome: ClusterOutcome): string {
  return `${outcome.surfaceId ?? "pseo"}/cluster/${outcome.clusterId}`;
}

function defaultTripwires(outcome: ClusterOutcome): Tripwire[] {
  const scope = scopeForOutcome(outcome);
  const tripwires: Tripwire[] = [];
  if (outcome.anomalies.includes("core-degradation")) {
    tripwires.push(
      tripwireSchema.parse({
        id: "core-click-degradation",
        scope,
        metric: "coreClicksRatio",
        threshold: 0.8,
        windowDays: 28,
        onTrip: ["freeze", "escalate", "rollback"],
      }),
    );
  }
  if (outcome.eligiblePages > 0 && outcome.indexationRate < 0.3) {
    tripwires.push(
      tripwireSchema.parse({
        id: "indexation-collapse",
        scope,
        metric: "indexationRate",
        threshold: 0.3,
        windowDays: 56,
        onTrip: ["freeze", "demote"],
      }),
    );
  }
  if (outcome.anomalies.includes("cannibalization")) {
    tripwires.push(
      tripwireSchema.parse({
        id: "cannibalization-surge",
        scope,
        metric: "queryOverlap",
        threshold: 1,
        windowDays: 28,
        onTrip: ["escalate"],
      }),
    );
  }
  return tripwires;
}

function buildVerdict(
  outcomes: readonly ClusterOutcome[],
  pointer: PointerFile | null,
): BreakerVerdict {
  const trippedTripwires = outcomes.flatMap(defaultTripwires);
  return breakerVerdictSchema.parse({
    evaluatedAt: new Date().toISOString(),
    trippedTripwires,
    affectedScopes: [...new Set(trippedTripwires.map((tripwire) => tripwire.scope))],
    recommendedState: trippedTripwires.some((tripwire) => tripwire.onTrip.includes("rollback"))
      ? pointer?.lastKnownGood
      : undefined,
    blastRadius: outcomes
      .filter((outcome) =>
        trippedTripwires.some((tripwire) => tripwire.scope === scopeForOutcome(outcome)),
      )
      .reduce((sum, outcome) => sum + outcome.eligiblePages, 0),
  });
}

async function breakerArmingDiagnostics(
  appDir: string,
  pointer: PointerFile | null,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const autonomy = await readJson<AutonomyStatePayload>(appDir, AUTONOMY_STATE_FILE);
  for (const state of autonomy?.states ?? []) {
    const level = state.level ?? "L0";
    const scope = state.scope
      ? `${state.scope.module}/${state.scope.fieldClass}/${state.scope.locale}`
      : "unknown";
    if ((LEVEL_ORDER[level] ?? 0) >= LEVEL_ORDER.L2 && !pointer?.lastKnownGood) {
      diagnostics.push({
        ruleId: "BRK-05",
        severity: "error",
        file: STATE_POINTER_FILE,
        message: `${scope} is ${level} but no armed lastKnownGood breaker pointer exists.`,
      });
    } else if ((LEVEL_ORDER[level] ?? 0) >= LEVEL_ORDER.L1 && !pointer?.lastKnownGood) {
      diagnostics.push({
        ruleId: "BRK-04",
        severity: "warning",
        file: STATE_POINTER_FILE,
        message: `${scope} has no lastKnownGood pointer yet.`,
      });
    }
  }
  return diagnostics;
}

async function writeFreeze(appDir: string, verdict: BreakerVerdict): Promise<void> {
  await writeJson(appDir, FREEZE_FILE, {
    generatedAt: null,
    frozen: verdict.affectedScopes.map((scope) => ({
      scope,
      reason: "surface.breaker.evaluate",
      tripwires: verdict.trippedTripwires
        .filter((tripwire) => tripwire.scope === scope)
        .map((tripwire) => tripwire.id),
    })),
  });
}

async function appendTripLog(appDir: string, verdict: BreakerVerdict): Promise<void> {
  const path = join(appDir, BREAKER_LOG_FILE);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(verdict)}\n`, "utf8");
}

async function triggerTripReflex(
  context: KernelRuntimeContext,
  verdict: BreakerVerdict,
): Promise<void> {
  if (!context.site || verdict.trippedTripwires.length === 0 || context.dryRun) return;
  await writeFreeze(context.site.directory, verdict);
  await appendTripLog(context.site.directory, verdict);
  if (verdict.trippedTripwires.some((tripwire) => tripwire.onTrip.includes("demote"))) {
    await runAutonomyDemote(
      {
        argv: [],
        flags: { scope: "pseo/narrative/de", to: "L0", reason: "breaker-trip" },
      } as unknown as KernelCommandInput,
      context,
    );
  }
  if (verdict.trippedTripwires.some((tripwire) => tripwire.onTrip.includes("escalate"))) {
    await runEscalationRoute(
      {
        argv: [],
        flags: { reason: "anomaly", scope: "pseo/narrative/de", artifact: BREAKER_LOG_FILE },
      } as unknown as KernelCommandInput,
      context,
    );
  }
  await executeKernelCommand({
    workspaceRoot: context.workspaceRoot,
    commandName: "bordbuch.append",
    siteName: context.site.name,
    siteExplicit: true,
    outputFormat: context.outputFormat,
    dryRun: context.dryRun,
    argv: [
      "--system",
      context.site.name,
      "--kind",
      "pseo",
      "--summary",
      `${verdict.trippedTripwires.length} tripwire(s), ${verdict.blastRadius} page(s) affected.`,
      "--actor",
      "agent",
      "--writer-role",
      "runtime",
      "--metadata",
      JSON.stringify({ status: "escalated" }),
    ],
  });
  await executeKernelCommand({
    workspaceRoot: context.workspaceRoot,
    commandName: "bordbuch.generate",
    siteName: context.site.name,
    siteExplicit: true,
    outputFormat: context.outputFormat,
    dryRun: context.dryRun,
    argv: ["--system", context.site.name],
  });
}

export async function runSurfaceBreakerEvaluate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "surface.breaker.evaluate must run inside an app context." };
  const pointer = await readJson<PointerFile>(app.directory, STATE_POINTER_FILE);
  const diagnostics = await breakerArmingDiagnostics(app.directory, pointer);
  const outcomesPayload = await readVisibilityOutcomes(app.directory);
  if (!outcomesPayload) {
    return diagnostics.length
      ? diagnosticsResult("surface.breaker.evaluate", diagnostics)
      : passResult("surface.breaker.evaluate", "skipped (no visibility outcomes)");
  }
  const verdict = buildVerdict(outcomesPayload.outcomes ?? [], pointer);
  if (verdict.trippedTripwires.length > 0 && !pointer?.lastKnownGood) {
    diagnostics.push({
      ruleId: "BRK-04",
      severity: "warning",
      file: STATE_POINTER_FILE,
      message: "Breaker tripped but no lastKnownGood state exists yet.",
    });
  }
  if (verdict.trippedTripwires.length > 0) {
    await triggerTripReflex(context, verdict);
  }
  return {
    ...diagnosticsResult("surface.breaker.evaluate", diagnostics),
    summary: `surface.breaker.evaluate: ${verdict.trippedTripwires.length} tripwire(s), ${diagnostics.length} diagnostic(s)`,
    data: {
      command: "surface.breaker.evaluate",
      status: diagnostics.some((diagnostic) => diagnostic.severity === "error")
        ? "fail"
        : diagnostics.length
          ? "warn"
          : "pass",
      diagnostics,
      summary: {
        error: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
        warning: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
        info: diagnostics.filter((diagnostic) => diagnostic.severity === "info").length,
      },
      verdict,
    } as CheckResult & { verdict: BreakerVerdict },
  };
}

export async function runSurfaceRollbackPlan(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "surface.rollback.plan must run inside an app context." };
  const pointer = await readJson<PointerFile>(app.directory, STATE_POINTER_FILE);
  const to = typeof input.flags.to === "string" ? input.flags.to : pointer?.lastKnownGood;
  const diagnostics: Diagnostic[] = [];
  if (!to) {
    diagnostics.push({
      ruleId: "BRK-04",
      severity: "error",
      file: STATE_POINTER_FILE,
      message: "Rollback has no --to target and no lastKnownGood pointer.",
    });
  } else if (!(await readState(app.directory, to))) {
    diagnostics.push({
      ruleId: "BRK-04",
      severity: "error",
      file: `src/surface/states/${to}.state.yaml`,
      message: `Rollback target "${to}" does not exist.`,
    });
  }
  const plan: RollbackPlan = {
    generatedAt: null,
    to: to ?? "missing",
    from: pointer?.current,
    operations: [
      {
        kind: "restore-pointer",
        target: to ?? "missing",
        reason:
          "Restore prior good surface state; URL removals must be handled as noindex/redirect proposals.",
      },
    ],
  };
  if (!diagnostics.some((diagnostic) => diagnostic.severity === "error") && !context.dryRun) {
    await writeJson(app.directory, ROLLBACK_PLAN_FILE, plan);
  }
  return {
    ...diagnosticsResult("surface.rollback.plan", diagnostics),
    summary: `surface.rollback.plan: ${diagnostics.some((d) => d.severity === "error") ? "blocked" : `target ${plan.to}`}`,
  };
}

export async function runSurfaceRollbackApply(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "surface.rollback.apply must run inside an app context." };
  const pointer = await readJson<PointerFile>(app.directory, STATE_POINTER_FILE);
  const plan = await readJson<RollbackPlan>(app.directory, ROLLBACK_PLAN_FILE);
  const to =
    typeof input.flags.to === "string" ? input.flags.to : (plan?.to ?? pointer?.lastKnownGood);
  const diagnostics: Diagnostic[] = [];
  if (!to || !(await readState(app.directory, to))) {
    diagnostics.push({
      ruleId: "BRK-04",
      severity: "error",
      file: STATE_POINTER_FILE,
      message: `Rollback target "${to ?? "missing"}" does not exist.`,
    });
  }
  for (const operation of plan?.operations ?? []) {
    if ((operation as { kind?: string }).kind === "delete") {
      diagnostics.push({
        ruleId: "BRK-03",
        severity: "error",
        file: ROLLBACK_PLAN_FILE,
        message: "Rollback plan would delete a published URL.",
      });
    }
  }
  if (!diagnostics.some((diagnostic) => diagnostic.severity === "error") && to && !context.dryRun) {
    await writeJson(app.directory, STATE_POINTER_FILE, {
      current: to,
      shipped: pointer?.shipped,
      lastKnownGood: to,
      rolledBackFrom: pointer?.current,
      updatedAt: null,
    });
    await appendTripLog(app.directory, {
      evaluatedAt: new Date().toISOString(),
      trippedTripwires: [],
      affectedScopes: [],
      recommendedState: to,
      blastRadius: 0,
    });
    await executeKernelCommand({
      workspaceRoot: context.workspaceRoot,
      commandName: "bordbuch.append",
      siteName: app.name,
      siteExplicit: true,
      outputFormat: context.outputFormat,
      dryRun: context.dryRun,
      argv: [
        "--system",
        app.name,
        "--kind",
        "pseo",
        "--summary",
        `Surface pointer restored to ${to}; no URL deletion performed.`,
        "--actor",
        "agent",
        "--writer-role",
        "runtime",
        "--metadata",
        JSON.stringify({ status: "done" }),
      ],
    });
    await executeKernelCommand({
      workspaceRoot: context.workspaceRoot,
      commandName: "bordbuch.generate",
      siteName: app.name,
      siteExplicit: true,
      outputFormat: context.outputFormat,
      dryRun: context.dryRun,
      argv: ["--system", app.name],
    });
  }
  return {
    ...diagnosticsResult("surface.rollback.apply", diagnostics),
    summary: `surface.rollback.apply: ${diagnostics.some((d) => d.severity === "error") ? "blocked" : `restored ${to}`}`,
  };
}
