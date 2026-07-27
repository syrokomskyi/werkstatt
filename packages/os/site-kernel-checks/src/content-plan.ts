/*
<MODULE_CONTRACT>
<purpose>
RFC-0216: content.plan.build / status / route. Consolidates RFC-0213 freshness
ledger, RFC-0214 source outbox, and RFC-0215 derivation states into deduplicated
MaintenanceTasks with pre-deadline dueAt, owner, and criticality. Writes
src/maintenance-plan.generated.yaml. content.plan.status surfaces due/overdue/
blocking counts and the soonest-due tasks. content.plan.route is deferred to
Phase 2 (Lagebild outbox wiring). Never fails on its own — gate effect is
plan.gate.red consumed by APPS_CHECK (Phase 3).
</purpose>
<non-goals>
  <item>Do not fetch sources or recompute freshness/derivation; read their artifacts only.</item>
  <item>Do not mutate claim sidecars.</item>
  <item>content.plan.route full wiring is deferred (RFC-0186 outbox Phase 2).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0216: initial maintenance planner.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as yamlStringify } from "yaml";
import { recordClaimsSchema } from "@gogol/share/schemas";
import { resolveFieldPath } from "@gogol/share/content/resolve-field-path";
import { derivedState } from "@gogol/share/knowledge/derivation";
import {
  stableTaskId,
  computeDueAt,
  defaultCriticality,
  isRedTask,
  type MaintenanceTask,
  type MaintenancePlan,
  type Criticality,
  type MaintenanceTrigger,
} from "@gogol/share/knowledge/plan";
import type {
  AuthoredFreshnessLedger,
  FreshnessCriticality,
} from "@gogol/share/knowledge/freshness";
import type { DivergenceRecord } from "@gogol/share/knowledge/source";
import { loadSystemManifest } from "@gogol/site-kernel-content";
import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { writeFileIfChanged } from "@gogol/site-kernel";
import { passResult } from "./result-helpers.ts";
import { pathExists, readMarkdownDocument } from "./content-discipline.ts";
import { collectClaimSidecars, recordPathForSidecar, toPosix } from "./content-claims.ts";
import { OUTBOX_FILE, readOutbox } from "./content-source-binding.ts";

const PLAN_FILE = "src/maintenance-plan.generated.yaml";
const FRESHNESS_LEDGER_FILE = "src/freshness.generated.yaml";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Glob match: `*` → any substring, anchored. */
function matchesGlob(glob: string, value: string): boolean {
  const re = new RegExp(
    "^" + glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
  );
  return re.test(value);
}

/** Coerce FreshnessCriticality (RFC-0213) to plan Criticality. */
function fromFreshCrit(c: FreshnessCriticality): Criticality {
  if (c === "blocking") return "blocking";
  if (c === "important") return "important";
  return "advisory";
}

interface PlanPolicy {
  leadTimeDays: number;
  defaultOwner: string;
  criticalityMap: Array<{ match: string; criticality: Criticality }>;
}

async function loadPlanPolicy(appDir: string): Promise<PlanPolicy> {
  const contentDir = join(appDir, "src", "content");
  const defaults: PlanPolicy = {
    leadTimeDays: 30,
    defaultOwner: "agent:content-maintainer",
    criticalityMap: [],
  };
  try {
    // RFC-0216 policy lives under the typed `knowledge.plan` block (RFC-0211 namespace).
    const { manifest } = await loadSystemManifest(contentDir);
    const p = manifest.knowledge?.plan;
    if (!p) return defaults;
    return {
      leadTimeDays: p.leadTimeDays ?? defaults.leadTimeDays,
      defaultOwner: p.defaultOwner ?? defaults.defaultOwner,
      criticalityMap: p.criticalityMap ?? [],
    };
  } catch {
    return defaults;
  }
}

function policyFor(subject: string, policy: PlanPolicy, fallback: Criticality): Criticality {
  for (const rule of policy.criticalityMap) {
    if (matchesGlob(rule.match, subject)) return rule.criticality;
  }
  return fallback;
}

/** Merge a new task into the task map, updating existing open task or adding new. */
function upsertTask(tasks: Map<string, MaintenanceTask>, task: MaintenanceTask): void {
  const existing = tasks.get(task.id);
  if (!existing || existing.status === "done") {
    tasks.set(task.id, task);
    return;
  }
  // Merge diagnostics and pick the earliest dueAt / highest criticality.
  const merged = existing;
  for (const d of task.diagnostics) {
    if (!merged.diagnostics.includes(d)) merged.diagnostics.push(d);
  }
  if (task.dueAt < merged.dueAt) merged.dueAt = task.dueAt;
  const ord: Record<Criticality, number> = { advisory: 0, important: 1, blocking: 2 };
  if (ord[task.criticality] > ord[merged.criticality]) merged.criticality = task.criticality;
}

async function buildPlan(
  siteName: string,
  appDir: string,
  workspaceRoot: string,
): Promise<MaintenancePlan> {
  const policy = await loadPlanPolicy(appDir);
  const todayStr = today();
  const tasks = new Map<string, MaintenanceTask>();

  // — RFC-0213: freshness ledger signals —
  const ledgerPath = join(appDir, FRESHNESS_LEDGER_FILE);
  if (await pathExists(ledgerPath)) {
    try {
      const ledger = parseYaml(await readFile(ledgerPath, "utf-8")) as AuthoredFreshnessLedger;
      for (const entry of ledger.entries) {
        const { state, subject, criticality: rawCrit, reviewDueAt, validUntil } = entry;
        if (state === "fresh" || state === "unsourced") continue;

        const trigger: MaintenanceTrigger =
          state === "expired"
            ? "expired"
            : state === "expiring-soon"
              ? "expiring-soon"
              : "review-due";
        const baseCrit = fromFreshCrit(rawCrit);
        const criticality = policyFor(subject, policy, baseCrit);
        const dueAt = computeDueAt({
          validUntil,
          reviewDueAt,
          leadTimeDays: policy.leadTimeDays,
          today: todayStr,
        });
        const id = stableTaskId(subject, trigger);
        const ruleId =
          state === "expired" && criticality === "blocking"
            ? "CKL-FRESH-04"
            : state === "expired"
              ? "CKL-FRESH-03"
              : state === "expiring-soon"
                ? "CKL-FRESH-02"
                : "CKL-FRESH-01";
        upsertTask(tasks, {
          id,
          subject,
          trigger,
          dueAt,
          criticality,
          // The freshness ledger entry carries no per-claim owner (RFC-0213
          // FreshnessLedgerEntry omits it), so freshness tasks use the app default.
          // The derived path below recovers the per-claim owner from the sidecar.
          owner: policy.defaultOwner,
          diagnostics: [ruleId],
          status: "open",
        });
      }
    } catch {
      // ledger missing or malformed — skip freshness signals
    }
  }

  // — RFC-0214: source outbox divergences —
  const outbox = await readOutbox(workspaceRoot);
  for (const div of outbox as DivergenceRecord[]) {
    if (div.app !== siteName) continue;
    if (div.unreachable) continue; // CKL-SRC-04: informational, not a plan task
    if (div.withinTolerance) continue;
    const trigger: MaintenanceTrigger = "source-diverged";
    const baseCrit = defaultCriticality(trigger);
    const criticality = policyFor(div.subject, policy, baseCrit);
    const id = stableTaskId(div.subject, trigger);
    upsertTask(tasks, {
      id,
      subject: div.subject,
      trigger,
      dueAt: todayStr,
      criticality,
      owner: policy.defaultOwner,
      diagnostics: [`CKL-SRC-03 source:${div.sourceId}`],
      status: "open",
    });
  }

  // — RFC-0215: derivation staleness (re-read sidecars) —
  const businessDirectory = join(appDir, "src", "content", "business");
  const sidecars = await collectClaimSidecars(businessDirectory);
  for (const sidecarPath of sidecars) {
    const relFile = toPosix(workspaceRoot, sidecarPath);
    const raw = await readFile(sidecarPath, "utf-8");
    const parsed = recordClaimsSchema.safeParse(parseYaml(raw));
    if (!parsed.success) continue;

    for (const [fieldPath, ann] of Object.entries(parsed.data)) {
      if (ann.provenance !== "derived" || !ann.derivedFrom) continue;
      const stemFromSidecar = relFile
        .replace(/^apps\/[^/]+\/src\/content\//, "")
        .replace(/\.claims\.yaml$/, "");
      const subject = `${stemFromSidecar}#${fieldPath}`;

      // Resolve source field for the hash check.
      const recordPath = recordPathForSidecar(sidecarPath);
      const record = await readMarkdownDocument(workspaceRoot, recordPath).catch(() => null);
      if (!record) continue;
      const sourceSubjectStr = ann.derivedFrom;
      // Parse source: it's a cross-app canonical address (e.g. business/de/company#tagline).
      // We only stamp/check when we can find the source inside this app.
      const sourceParts = sourceSubjectStr.match(/^(.+)#(.+)$/);
      if (!sourceParts) continue;
      const [, sourceRelPath, sourceField] = sourceParts;
      const candidatePath = join(appDir, "src", "content", `${sourceRelPath}.md`);
      const sourceRecord = await readMarkdownDocument(workspaceRoot, candidatePath).catch(
        () => null,
      );
      if (!sourceRecord) continue;
      const resolution = resolveFieldPath(sourceRecord.frontmatter, sourceField.split("."));
      const sourceValue = typeof resolution.value === "string" ? resolution.value : undefined;
      const { state } = derivedState(ann.sourceHash, sourceValue);
      if (state !== "outdated") continue;

      const trigger: MaintenanceTrigger = "derived-outdated";
      const baseCrit = defaultCriticality(trigger);
      const criticality = policyFor(subject, policy, baseCrit);
      const id = stableTaskId(subject, trigger);
      upsertTask(tasks, {
        id,
        subject,
        trigger,
        dueAt: todayStr,
        criticality,
        owner: ann.owner ?? policy.defaultOwner,
        diagnostics: ["CKL-DERIV-01"],
        status: "open",
      });
    }
  }

  const taskList = [...tasks.values()].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  // Gate verdict via the shared isRedTask helper so APPS_CHECK and the planner agree.
  // Red verdict uses the shared helper: RFC-0323 intentionally promotes
  // blocking review-due comparative claims to red, while expiring-soon remains amber.
  const red = taskList.filter((t) => isRedTask(t)).length;
  const amber = taskList.filter((t) => t.status === "open" && !isRedTask(t)).length;

  return {
    generatedAt: null,
    site: siteName,
    tasks: taskList,
    gate: { amber, red },
  };
}

export async function runContentPlanBuild(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "content.plan.build";
  const siteName = context.site?.name;
  if (!siteName) return passResult(command, "no app — skip");

  const appDir = context.site?.directory ?? join(context.workspaceRoot, "apps", siteName);
  const plan = await buildPlan(siteName, appDir, context.workspaceRoot);

  const out = join(appDir, PLAN_FILE);
  await mkdir(dirname(out), { recursive: true });
  await writeFileIfChanged(out, `${yamlStringify(plan)}`);

  const summary = `${plan.tasks.length} task(s), gate amber=${plan.gate.amber} red=${plan.gate.red}`;
  context.logger.info(`content.plan.build: ${summary}`);
  return passResult(command, summary);
}

export async function runContentPlanStatus(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "content.plan.status";
  const siteName = context.site?.name;
  if (!siteName) return passResult(command, "no app — skip");

  const planPath = join(
    context.site?.directory ?? join(context.workspaceRoot, "apps", siteName),
    PLAN_FILE,
  );
  if (!(await pathExists(planPath))) {
    context.logger.info("No maintenance plan found — run content.plan.build first.");
    return passResult(command, "no plan");
  }

  const plan = parseYaml(await readFile(planPath, "utf-8")) as MaintenancePlan;
  const open = plan.tasks.filter((t) => t.status === "open");
  const overdue = open.filter((t) => t.dueAt < today());
  const blocking = open.filter((t) => t.criticality === "blocking");

  if (context.outputFormat === "pretty") {
    context.logger.section("content.plan.status");
    context.logger.info(
      `  ${open.length} open, ${overdue.length} overdue, ${blocking.length} blocking`,
    );
    const next = open.slice(0, 5);
    for (const t of next) {
      context.logger.info(
        `  [${t.criticality.padEnd(9)}] ${t.dueAt}  ${t.subject}  (${t.trigger})`,
      );
    }
    if (plan.gate.red > 0) {
      context.logger.error(`  Gate: ${plan.gate.red} red (blocking)`);
    } else if (plan.gate.amber > 0) {
      context.logger.info(`  Gate: ${plan.gate.amber} amber`);
    } else {
      context.logger.success("  Gate: green");
    }
  }

  return passResult(
    command,
    `${open.length} open, ${overdue.length} overdue, ${blocking.length} blocking — gate amber=${plan.gate.amber} red=${plan.gate.red}`,
  );
}

export async function runContentPlanRoute(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  // Phase 2: Lagebild outbox wiring. Stub for now.
  context.logger.info("content.plan.route: Phase 2 (Lagebild outbox) not yet implemented — stub.");
  return passResult("content.plan.route", "stub");
}
