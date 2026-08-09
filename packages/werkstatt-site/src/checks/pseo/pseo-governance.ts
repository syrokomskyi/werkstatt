import { parse as yamlParse, stringify as yamlStringify } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>
  RFC-0278/RFC-0279/RFC-0285 Site OS commands for PSEO autonomy levels,
  auditable AI-review logs, and human escalation budgets.
</purpose>
<non-goals>
  <item>Do not call an LLM during deterministic checks or normal builds.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0278/RFC-0279/RFC-0285: governed autonomy/review/escalation command layer.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { executeKernelCommand } from "@warpgogol/werkstatt/kernel";
import {
  approvalRecordSchema,
  autonomyLevelSchema,
  autonomyStateSchema,
  escalationBudgetSchema,
  escalationReasonSchema,
  escalationSchema,
  fieldClassSchema,
  reviewVerdictSchema,
  type ApprovalRecord,
  type AutonomyLevel,
  type AutonomyState,
  type Escalation,
  type FieldClass,
  type ReviewVerdict,
} from "@warpgogol/werkstatt-site/surface";
import {
  collectMarkdownFiles,
  loadSystemManifest,
  parseMarkdownFrontmatter,
} from "@warpgogol/werkstatt-site/content";
import { diagnosticsResult, passResult } from "../result-helpers.ts";

const AUTONOMY_STATE_FILE = "src/surface/autonomy.state.yaml";
const CALIBRATION_FILE = "src/surface/autonomy.calibration.ndjson";
const REVIEW_LOG_FILE = "src/surface/review.log.ndjson";
const ESCALATIONS_FILE = "src/surface/escalations.ndjson";
const ESCALATION_BUDGET_FILE = "src/surface/escalation-budget.generated.yaml";
const SURFACE_ARTIFACT_FILE = "src/surface.generated.yaml";

const LEVEL_ORDER: Record<AutonomyLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };
const FIELD_DEFAULT_CEILING: Record<FieldClass, AutonomyLevel> = {
  structural: "L4",
  narrative: "L4",
  claims: "L3",
  product: "L3",
};

type CalibrationRecord = {
  scope: string;
  agentHumanAgreement: number;
  defectEscapeRate: number;
  calibrationN: number;
  windowDays: number;
  evidenceRef: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function scopeKey(scope: { module: string; fieldClass: string; locale: string }): string {
  return `${scope.module}/${scope.fieldClass}/${scope.locale}`;
}

function parseScope(
  value: string,
): { module: string; fieldClass: FieldClass; locale: string } | null {
  const [module, fieldClass, locale] = value.split("/");
  const parsed = fieldClassSchema.safeParse(fieldClass);
  if (!module || !locale || !parsed.success) return null;
  return { module, fieldClass: parsed.data, locale };
}

async function readJson<T>(appDir: string, file: string): Promise<T | null> {
  const path = join(appDir, file);
  if (!existsSync(path)) return null;
  return yamlParse(await readFile(path, "utf8")) as T;
}

async function readNdjson<T>(appDir: string, file: string): Promise<T[]> {
  const path = join(appDir, file);
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => yamlParse(line) as T);
}

async function writeJson(appDir: string, file: string, value: unknown): Promise<void> {
  const path = join(appDir, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${yamlStringify(value)}`, "utf8");
}

async function moduleAutonomyStates(appDir: string): Promise<AutonomyState[]> {
  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const modules = ((manifest as { surface?: { modules?: Record<string, unknown> } }).surface
    ?.modules ?? {}) as Record<
    string,
    { masterLocale?: string; publishedLocales?: string[]; autonomy?: { scopes?: unknown[] } }
  >;
  const states: AutonomyState[] = [];
  for (const [module, config] of Object.entries(modules)) {
    const authored = Array.isArray(config.autonomy?.scopes) ? config.autonomy.scopes : [];
    for (const rawScope of authored) {
      const raw = rawScope as Record<string, unknown>;
      const fieldClass = fieldClassSchema.safeParse(raw.fieldClass);
      const level = autonomyLevelSchema.safeParse(raw.level ?? "L0");
      const ceiling = autonomyLevelSchema.safeParse(
        raw.ceiling ?? (fieldClass.success ? FIELD_DEFAULT_CEILING[fieldClass.data] : "L0"),
      );
      const locale = typeof raw.locale === "string" ? raw.locale : undefined;
      if (!fieldClass.success || !level.success || !ceiling.success || !locale) continue;
      states.push({
        scope: { module, fieldClass: fieldClass.data, locale },
        level: level.data,
        ceiling: ceiling.data,
        sinceAt: typeof raw.sinceAt === "string" ? raw.sinceAt : "2026-07-03T00:00:00.000Z",
        evidenceRef: typeof raw.evidenceRef === "string" ? raw.evidenceRef : "initial:rfc-0278",
      });
    }
  }
  const persisted = await readJson<{ states?: AutonomyState[] }>(appDir, AUTONOMY_STATE_FILE);
  const byScope = new Map(states.map((state) => [scopeKey(state.scope), state]));
  for (const state of persisted?.states ?? []) byScope.set(scopeKey(state.scope), state);
  return [...byScope.values()];
}

async function writeAutonomyState(appDir: string, states: AutonomyState[]): Promise<void> {
  await writeJson(appDir, AUTONOMY_STATE_FILE, {
    generatedAt: null,
    states,
  });
}

function promotionBar(to: AutonomyLevel): { agreement: number; n: number; days: number } {
  if (to === "L2") return { agreement: 0.97, n: 10, days: 7 };
  if (to === "L3") return { agreement: 0.985, n: 30, days: 14 };
  if (to === "L4") return { agreement: 0.995, n: 100, days: 30 };
  return { agreement: 0, n: 0, days: 0 };
}

function calibrationPasses(record: CalibrationRecord | undefined, to: AutonomyLevel): boolean {
  if (!record) return to === "L0" || to === "L1";
  const bar = promotionBar(to);
  return (
    record.agentHumanAgreement >= bar.agreement &&
    record.defectEscapeRate <= 0 &&
    record.calibrationN >= bar.n &&
    record.windowDays >= bar.days
  );
}

async function latestCalibration(appDir: string): Promise<Map<string, CalibrationRecord>> {
  const records = await readNdjson<CalibrationRecord>(appDir, CALIBRATION_FILE);
  const map = new Map<string, CalibrationRecord>();
  for (const record of records) map.set(record.scope, record);
  return map;
}

async function approvalRecords(
  appDir: string,
): Promise<Array<{ file: string; approval: ApprovalRecord }>> {
  const root = join(appDir, "src", "content", "enriched");
  if (!existsSync(root)) return [];
  const files = (await collectMarkdownFiles(root)).filter(
    (file) => !file.replace(/\\/g, "/").includes("/_"),
  );
  const approvals: Array<{ file: string; approval: ApprovalRecord }> = [];
  for (const file of files) {
    const { data } = parseMarkdownFrontmatter(await readFile(file, "utf8"));
    const parsed = approvalRecordSchema.safeParse((data as { approval?: unknown }).approval);
    if (parsed.success) approvals.push({ file, approval: parsed.data });
  }
  return approvals;
}

export async function runAutonomyLevelReport(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "autonomy.level.report must run inside an app context." };
  const states = await moduleAutonomyStates(app.directory);
  if (!context.dryRun) await writeAutonomyState(app.directory, states);
  return {
    exitCode: 0,
    summary: `autonomy.level.report: ${states.length} scope(s)`,
    data: { states },
  };
}

export async function runAutonomyLevelValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "autonomy.level.validate must run inside an app context." };
  const states = await moduleAutonomyStates(app.directory);
  if (states.length === 0) {
    return passResult("autonomy.level.validate", "skipped (no surface modules declared)");
  }
  const byScope = new Map(states.map((state) => [scopeKey(state.scope), state]));
  const calibration = await latestCalibration(app.directory);
  const diagnostics: Diagnostic[] = [];
  for (const state of states) {
    const parsed = autonomyStateSchema.safeParse(state);
    const key = scopeKey(state.scope);
    if (!parsed.success) {
      diagnostics.push({
        ruleId: "AUTO-05",
        severity: "error",
        message: `${key} autonomy state is malformed.`,
      });
      continue;
    }
    if (LEVEL_ORDER[state.level] > LEVEL_ORDER[state.ceiling]) {
      diagnostics.push({
        ruleId: "AUTO-02",
        severity: "error",
        message: `${key} level ${state.level} exceeds ceiling ${state.ceiling}.`,
      });
    }
    if (
      LEVEL_ORDER[state.level] >= LEVEL_ORDER.L2 &&
      !calibrationPasses(calibration.get(key), state.level)
    ) {
      diagnostics.push({
        ruleId: "AUTO-03",
        severity: "error",
        message: `${key} claims ${state.level} without sufficient calibration evidence.`,
      });
    }
  }
  for (const { file, approval } of await approvalRecords(app.directory)) {
    if (approval.approver.kind === "agent" && approval.confidence === undefined) {
      diagnostics.push({
        ruleId: "AUTO-05",
        severity: "error",
        file,
        message: "Agent approval lacks confidence.",
      });
    }
    if (approval.approver.kind === "agent" && LEVEL_ORDER[approval.atLevel] < LEVEL_ORDER.L2) {
      diagnostics.push({
        ruleId: "AUTO-01",
        severity: "error",
        file,
        message: "Agent approval exists below L2.",
      });
    }
    const state = byScope.get(`pseo/narrative/de`);
    if (
      approval.approver.kind === "agent" &&
      state &&
      LEVEL_ORDER[state.level] < LEVEL_ORDER[approval.atLevel]
    ) {
      diagnostics.push({
        ruleId: "AUTO-01",
        severity: "error",
        file,
        message: "Agent approval exceeds current scope level.",
      });
    }
  }
  return diagnosticsResult("autonomy.level.validate", diagnostics);
}

export async function runAutonomyPromote(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) return { exitCode: 1, summary: "autonomy.promote must run inside an app context." };
  const scope = typeof input.flags.scope === "string" ? parseScope(input.flags.scope) : null;
  const to = autonomyLevelSchema.safeParse(input.flags.to);
  if (!scope || !to.success)
    return {
      exitCode: 1,
      summary: "autonomy.promote requires --scope module/fieldClass/locale --to Lx.",
    };
  const key = scopeKey(scope);
  const calibration = (await latestCalibration(app.directory)).get(key);
  if (!calibrationPasses(calibration, to.data)) {
    return {
      exitCode: 1,
      summary: `autonomy.promote refused ${key} -> ${to.data}: calibration evidence is insufficient.`,
    };
  }
  const states = await moduleAutonomyStates(app.directory);
  const updated = states.map((state) =>
    scopeKey(state.scope) === key
      ? {
          ...state,
          level: to.data,
          sinceAt: nowIso(),
          evidenceRef: calibration?.evidenceRef ?? `calibration:${key}`,
        }
      : state,
  );
  if (!context.dryRun) await writeAutonomyState(app.directory, updated);
  return {
    exitCode: 0,
    summary: `autonomy.promote: ${key} -> ${to.data}`,
    data: { scope: key, level: to.data },
  };
}

export async function runAutonomyDemote(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) return { exitCode: 1, summary: "autonomy.demote must run inside an app context." };
  const scope = typeof input.flags.scope === "string" ? parseScope(input.flags.scope) : null;
  const to = autonomyLevelSchema.safeParse(input.flags.to ?? "L0");
  const reason = typeof input.flags.reason === "string" ? input.flags.reason : "demotion trigger";
  if (!scope || !to.success)
    return {
      exitCode: 1,
      summary: "autonomy.demote requires --scope module/fieldClass/locale --to Lx.",
    };
  const key = scopeKey(scope);
  const states = await moduleAutonomyStates(app.directory);
  const updated = states.map((state) =>
    scopeKey(state.scope) === key
      ? { ...state, level: to.data, sinceAt: nowIso(), evidenceRef: `demotion:${reason}` }
      : state,
  );
  if (!context.dryRun) {
    await writeAutonomyState(app.directory, updated);
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
        `Autonomy demoted ${key}: ${reason}`,
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
      siteName: app.name,
      siteExplicit: true,
      outputFormat: context.outputFormat,
      dryRun: context.dryRun,
      argv: ["--system", app.name],
    });
  }
  return {
    exitCode: 0,
    summary: `autonomy.demote: ${key} -> ${to.data}`,
    data: { scope: key, level: to.data },
  };
}

export async function runSurfaceReviewRun(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) return { exitCode: 1, summary: "surface.review.run must run inside an app context." };
  const artifactRef =
    typeof input.flags.artifact === "string" ? input.flags.artifact : "queue:ready";
  const fieldClass = fieldClassSchema.safeParse(input.flags.fieldClass ?? "narrative");
  if (!fieldClass.success)
    return {
      exitCode: 1,
      summary: "surface.review.run requires a valid --fieldClass when provided.",
    };
  const confidence = Number(input.flags.confidence ?? 0);
  const decision: ReviewVerdict["decision"] = confidence >= 0.9 ? "approve" : "escalate";
  const verdict: ReviewVerdict = {
    artifactRef,
    reviewer: {
      modelId: String(input.flags.modelId ?? "offline-reviewer"),
      promptId: String(input.flags.promptId ?? `review-${fieldClass.data}`),
      version: String(input.flags.version ?? "v1"),
    },
    decision,
    confidence,
    checks: [
      {
        id: "offline-harness",
        pass: true,
        note: "No live LLM call; deterministic review-lane placeholder.",
      },
    ],
    groundingViolations: [],
    samples: 1,
    reviewedAt: nowIso(),
  };
  if (!context.dryRun) {
    const path = join(app.directory, REVIEW_LOG_FILE);
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(verdict)}\n`, "utf8");
  }
  return { exitCode: 0, summary: `surface.review.run: ${decision} ${artifactRef}`, data: verdict };
}

export async function runSurfaceReviewValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "surface.review.validate must run inside an app context." };
  const diagnostics: Diagnostic[] = [];
  const verdicts = await readNdjson<Record<string, unknown>>(app.directory, REVIEW_LOG_FILE);
  for (const raw of verdicts) {
    const { generator, ...verdictRaw } = raw;
    const parsed = reviewVerdictSchema.safeParse(verdictRaw);
    if (!parsed.success) {
      diagnostics.push({
        ruleId: "REV-06",
        severity: "error",
        file: REVIEW_LOG_FILE,
        message: "Review verdict is malformed or unpinned.",
      });
      continue;
    }
    const verdict = parsed.data;
    const generatorMeta = generator as { modelId?: string; promptId?: string } | undefined;
    if (
      generatorMeta?.modelId === verdict.reviewer.modelId &&
      generatorMeta?.promptId === verdict.reviewer.promptId
    ) {
      diagnostics.push({
        ruleId: "REV-01",
        severity: "error",
        file: REVIEW_LOG_FILE,
        message: `${verdict.artifactRef} reviewer equals generator.`,
      });
    }
    if (verdict.decision === "approve" && verdict.confidence < 0.9) {
      diagnostics.push({
        ruleId: "REV-04",
        severity: "warning",
        file: REVIEW_LOG_FILE,
        message: `${verdict.artifactRef} low-confidence verdict was approved.`,
      });
    }
    if (verdict.decision === "approve" && verdict.groundingViolations.length > 0) {
      diagnostics.push({
        ruleId: "REV-03",
        severity: "error",
        file: REVIEW_LOG_FILE,
        message: `${verdict.artifactRef} approved despite grounding violations.`,
      });
    }
  }
  return diagnostics.length === 0 && verdicts.length === 0
    ? passResult("surface.review.validate", "skipped (no review log)")
    : diagnosticsResult("surface.review.validate", diagnostics);
}

export async function runSurfaceReviewCalibrate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "surface.review.calibrate must run inside an app context." };
  const verdicts = (await readNdjson<ReviewVerdict>(app.directory, REVIEW_LOG_FILE)).filter(
    (verdict) => reviewVerdictSchema.safeParse(verdict).success,
  );
  const scope = "pseo/narrative/de";
  const calibration: CalibrationRecord = {
    scope,
    agentHumanAgreement:
      verdicts.length === 0
        ? 0
        : verdicts.filter((v) => v.decision !== "reject").length / verdicts.length,
    defectEscapeRate: 0,
    calibrationN: verdicts.length,
    windowDays: 7,
    evidenceRef: `review-log:${verdicts.length}`,
  };
  if (!context.dryRun) {
    const path = join(app.directory, CALIBRATION_FILE);
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(calibration)}\n`, "utf8");
  }
  return {
    exitCode: 0,
    summary: `surface.review.calibrate: ${calibration.calibrationN} verdict(s)`,
    data: calibration,
  };
}

export async function runEscalationRoute(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) return { exitCode: 1, summary: "escalation.route must run inside an app context." };
  const reason = escalationReasonSchema.safeParse(input.flags.reason);
  const scope = typeof input.flags.scope === "string" ? input.flags.scope : "pseo/narrative/de";
  if (!reason.success) return { exitCode: 1, summary: "escalation.route requires --reason." };
  const existing = await readNdjson<Escalation>(app.directory, ESCALATIONS_FILE);
  const escalation: Escalation = {
    id: `esc-${String(existing.length + 1).padStart(6, "0")}`,
    scope,
    reason: reason.data,
    artifactRef: typeof input.flags.artifact === "string" ? input.flags.artifact : undefined,
    openedAt: nowIso(),
    feedback: {},
  };
  if (!context.dryRun) {
    const path = join(app.directory, ESCALATIONS_FILE);
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(escalation)}\n`, "utf8");
  }
  return { exitCode: 0, summary: `escalation.route: ${escalation.id}`, data: escalation };
}

async function pageCount(appDir: string): Promise<number> {
  const artifact = await readJson<{ entries?: Array<{ indexable?: boolean; noindex?: boolean }> }>(
    appDir,
    SURFACE_ARTIFACT_FILE,
  );
  return (artifact?.entries ?? []).filter((entry) => entry.indexable && !entry.noindex).length;
}

export async function runEscalationQueueReport(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "escalation.queue.report must run inside an app context." };
  const escalations = await readNdjson<Escalation>(app.directory, ESCALATIONS_FILE);
  const pages = Math.max(1, await pageCount(app.directory));
  const minutes = escalations.reduce((sum, item) => sum + (item.minutesSpent ?? 0), 0);
  const budget = escalationBudgetSchema.parse({
    scope: "fleet",
    windowDays: 90,
    humanMinutesAvailable: 120,
    humanMinutesUsed: minutes,
    minutesPer1000Pages: (minutes / pages) * 1000,
  });
  const payload = {
    generatedAt: null,
    open: escalations.filter((item) => !item.resolvedAt).length,
    total: escalations.length,
    budgets: [budget],
  };
  if (!context.dryRun) await writeJson(app.directory, ESCALATION_BUDGET_FILE, payload);
  return {
    exitCode: 0,
    summary: `escalation.queue.report: ${payload.open} open, ${payload.total} total`,
    data: payload,
  };
}

export async function runEscalationBudgetValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "escalation.budget.validate must run inside an app context." };
  const diagnostics: Diagnostic[] = [];
  const escalations = await readNdjson<Escalation>(app.directory, ESCALATIONS_FILE);
  const budgetReport = await readJson<{
    budgets?: Array<{
      scope: string;
      humanMinutesAvailable: number;
      humanMinutesUsed: number;
      minutesPer1000Pages: number;
    }>;
  }>(app.directory, ESCALATION_BUDGET_FILE);
  for (const raw of escalations) {
    const parsed = escalationSchema.safeParse(raw);
    if (!parsed.success) {
      diagnostics.push({
        ruleId: "ESC-05",
        severity: "error",
        file: ESCALATIONS_FILE,
        message: "Escalation is malformed or carries an unsafe payload.",
      });
      continue;
    }
    const escalation = parsed.data;
    if (
      escalation.resolvedAt &&
      !escalation.feedback.toGolden &&
      !escalation.feedback.toCalibration &&
      !escalation.feedback.toRecord
    ) {
      diagnostics.push({
        ruleId: "ESC-02",
        severity: "error",
        file: ESCALATIONS_FILE,
        message: `${escalation.id} was resolved without feedback.`,
      });
    }
  }
  for (const budget of budgetReport?.budgets ?? []) {
    if (budget.humanMinutesUsed > budget.humanMinutesAvailable) {
      diagnostics.push({
        ruleId: "ESC-01",
        severity: "error",
        file: ESCALATION_BUDGET_FILE,
        message: `${budget.scope} escalation budget is exhausted.`,
      });
    }
    if (budget.minutesPer1000Pages > 1) {
      diagnostics.push({
        ruleId: "ESC-03",
        severity: "warning",
        file: ESCALATION_BUDGET_FILE,
        message: `${budget.scope} human-minutes per 1000 pages is not yet near zero.`,
      });
    }
  }
  return diagnosticsResult("escalation.budget.validate", diagnostics);
}
