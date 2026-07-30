/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/maintenance-debt-queue.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not accept new advisory debt into the baseline.</item>
  <item>Do not edit app content or generated app files while reporting queues.</item>
  <item>Do not replace maintenance.debt.report or maintenance.debt.triage.report.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0256: introduce authored advisory maintenance debt queues and generated projection/report commands.</item>
</CHANGE_SUMMARY>
*/

import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { byteHash } from "@warpgogol/fingerprint";
import {
  GENERATED_MARKER,
  listSiteWorkspaces,
  listRegisteredKernelCommands,
  writeFileAtomic,
  type CheckResult,
  type Diagnostic,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelRuntimeContext,
  buildGeneratedHeader,
} from "@warpgogol/site-kernel";
import { parse as parseYaml, stringify as yamlStringify } from "yaml";
import { z } from "zod";
import {
  collectMaintenanceDebtItems,
  maintenanceDebtKey,
  type MaintenanceDebtReport,
} from "../ecosystem.ts";
import { DIAGNOSTIC_RULES, listRuleIds } from "../diagnostics/rules.ts";
import { diagnosticsResult } from "../result-helpers.ts";

export type DebtQueueStatus = "active" | "paused" | "complete" | "superseded";
export type DebtQueueSeverity = "warning" | "info" | "skipped";
export type DebtQueueItem = MaintenanceDebtReport["items"][number] & { key: string };

export interface DebtQueue {
  id: string;
  title: string;
  status: DebtQueueStatus;
  owner: string;
  priority: number;
  createdAt: string;
  reviewAfter: string;
  rationale: string;
  sourceCommands: string[];
  selectors: {
    apps?: string[];
    ruleIds?: string[];
    severity?: DebtQueueSeverity[];
  };
  batchPolicy: {
    maxItemsPerSession: number;
    commitAfterEachBatch?: boolean;
    push?: boolean;
  };
  acceptance: {
    commands: string[];
  };
  notes?: string[];
  items?: string[];
}

export interface DebtQueueDocument {
  file: string;
  queue?: DebtQueue;
  diagnostics: Diagnostic[];
}

export interface DebtQueueReport {
  command: "maintenance.debt.queue.report";
  status: "pass" | "warn" | "fail";
  queue: Pick<DebtQueue, "id" | "title" | "priority" | "owner" | "status"> | null;
  selectedApp?: string;
  selectedSourceCommands: string[];
  selectedRuleIds: string[];
  totalMatchingItems: number;
  batch: {
    maxItems: number;
    items: DebtQueueItem[];
  };
  acceptanceCommands: string[];
  reminder: string;
  diagnostics?: Diagnostic[];
}

export interface DebtQueueProjection {
  meta: {
    schemaVersion: 1;
    deterministic: true;
    generatedAt: null;
    contentHash: string;
    sourceReportHash: string;
    baselineHash: string;
    queueSpecHash: string;
  };
  command: "maintenance.debt.queue.generate";
  ignoredDebtClasses: typeof DEFERRED_DEBT_CLASSES;
  queues: Array<{
    id: string;
    title: string;
    status: DebtQueueStatus;
    owner: string;
    priority: number;
    reviewAfter: string;
    sourceCommands: string[];
    selectors: DebtQueue["selectors"];
    batchPolicy: DebtQueue["batchPolicy"];
    totalMatchingItems: number;
    matchingItemKeys: string[];
    nextBatchKeys: string[];
    acceptanceCommands: string[];
  }>;
}

export interface DebtQueueValidationInput {
  documents: DebtQueueDocument[];
  currentItems: MaintenanceDebtReport["items"];
  acceptedKeys: Set<string>;
  registeredCommands: Set<string>;
  registeredRuleIds: Set<string>;
  registeredApps: Set<string>;
  queueId?: string;
}

const QUEUE_DIRECTORY = "docs/maintenance-debt/queues";
const QUEUE_PROJECTION_PATH = "docs/maintenance-debt.queues.generated.yaml";
const BASELINE_PATH = "docs/maintenance-debt.baseline.generated.yaml";

const queueSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["active", "paused", "complete", "superseded"]),
  owner: z.string().min(1),
  priority: z.number().int().positive(),
  createdAt: z.string().min(1),
  reviewAfter: z.string().min(1),
  rationale: z.string().min(1),
  sourceCommands: z.array(z.string().min(1)).min(1),
  selectors: z.object({
    apps: z.array(z.string().min(1)).optional(),
    ruleIds: z.array(z.string().min(1)).optional(),
    severity: z.array(z.enum(["warning", "info", "skipped"])).optional(),
  }),
  batchPolicy: z.object({
    maxItemsPerSession: z.number().int().positive(),
    commitAfterEachBatch: z.boolean().optional(),
    push: z.boolean().optional(),
  }),
  acceptance: z.object({
    commands: z.array(z.string().min(1)).optional().default([]),
  }),
  notes: z.array(z.string()).optional(),
  items: z.array(z.string().min(1)).optional(),
});

const DEFERRED_DEBT_CLASSES = [
  {
    sourceCommand: "text.normalize.report",
    ruleId: "TEXT-NORM-01",
    severity: "info" as const,
    rationale:
      "High-volume text normalization cleanup remains deferred outside the initial RFC-0256 queues.",
  },
  {
    sourceCommand: "material.metadata.validate",
    ruleId: "material.metadata.toolchain-missing",
    severity: "info" as const,
    rationale: "Toolchain availability info remains visible but is not an initial burn-down queue.",
  },
];

const INITIAL_QUEUE_TEMPLATES: Record<string, string> = {
  "prose-credit-sidecars.yaml": [
    "id: prose-credit-sidecars",
    'title: "Add prose authorship credit sidecars"',
    "status: active",
    "owner: content-architecture",
    "priority: 1",
    'createdAt: "2026-07-01"',
    'reviewAfter: "2026-08-01"',
    "rationale: >",
    "  Prose records need explicit authorship credit sidecars so published",
    "  legal, editorial, and narrative material has a reviewable origin.",
    "sourceCommands:",
    "  - material.credits.validate",
    "selectors:",
    "  apps:",
    "    - warpgogol-com",
    "    - nicaragua-projekt",
    "  ruleIds:",
    "    - material.credits.missing-prose-credit",
    "  severity:",
    "    - warning",
    "batchPolicy:",
    "  maxItemsPerSession: 8",
    "  commitAfterEachBatch: true",
    "  push: false",
    "acceptance:",
    "  commands:",
    '    - "pnpm exec site-kernel run maintenance.debt.queue.validate --queue prose-credit-sidecars --json"',
    '    - "pnpm exec site-kernel run material.credits.validate --site <app> --json"',
    '    - "pnpm exec site-kernel run maintenance.debt.baseline.validate --json"',
    "notes:",
    '  - "Do not invent authorship. Use NEED_THIS-style placeholders or documented asserted ownership only where policy allows."',
    "",
  ].join("\n"),
  "surface-substance-assets-and-narratives.yaml": [
    "id: surface-substance-assets-and-narratives",
    'title: "Improve surface narrative and image substance"',
    "status: active",
    "owner: content-architecture",
    "priority: 2",
    'createdAt: "2026-07-01"',
    'reviewAfter: "2026-08-15"',
    "rationale: >",
    "  Programmatic and authored surfaces with weak narrative or image substance",
    "  need bounded review because fixes may touch generated projections, material",
    "  credits, and CKL provenance.",
    "sourceCommands:",
    "  - surface.validate",
    "selectors:",
    "  apps:",
    "    - warpgogol-com",
    "    - nicaragua-projekt",
    "  ruleIds:",
    "    - surface.validate",
    "  severity:",
    "    - warning",
    "batchPolicy:",
    "  maxItemsPerSession: 6",
    "  commitAfterEachBatch: true",
    "  push: false",
    "acceptance:",
    "  commands:",
    '    - "pnpm exec site-kernel run maintenance.debt.queue.validate --queue surface-substance-assets-and-narratives --json"',
    '    - "pnpm exec site-kernel run surface.validate --site <app> --json"',
    '    - "pnpm exec site-kernel run asset.reference.validate --site <app> --json"',
    '    - "pnpm exec site-kernel run material.credits.validate --site <app> --json"',
    '    - "pnpm exec site-kernel run maintenance.debt.baseline.validate --json"',
    "notes:",
    '  - "Prefer improving authored source records over editing generated surface output."',
    '  - "Preserve bare image tokens and add material credits when introducing new material."',
    "",
  ].join("\n"),
  "demand-slug-overrides.yaml": [
    "id: demand-slug-overrides",
    'title: "Review demand hierarchy slug overrides"',
    "status: active",
    "owner: architecture",
    "priority: 3",
    'createdAt: "2026-07-01"',
    'reviewAfter: "2026-09-01"',
    "rationale: >",
    "  Demand hierarchy slug override warnings are route-affecting and need a",
    "  separate review queue so accidental drift is fixed without changing",
    "  intentional public URLs blindly.",
    "sourceCommands:",
    "  - demands.hierarchy.validate",
    "selectors:",
    "  apps:",
    "    - warpgogol-com",
    "    - nicaragua-projekt",
    "  ruleIds:",
    "    - demands.hierarchy.validate",
    "  severity:",
    "    - warning",
    "batchPolicy:",
    "  maxItemsPerSession: 4",
    "  commitAfterEachBatch: true",
    "  push: false",
    "acceptance:",
    "  commands:",
    '    - "pnpm exec site-kernel run maintenance.debt.queue.validate --queue demand-slug-overrides --json"',
    '    - "pnpm exec site-kernel run demands.hierarchy.validate --site <app> --json"',
    '    - "pnpm exec site-kernel run maintenance.debt.baseline.validate --json"',
    "notes:",
    '  - "Treat URL changes as high-risk; handle redirects, canonical URLs, sitemap effects, and localized pairs together."',
    '  - "Represent intentional overrides with first-class metadata rather than warning strings."',
    "",
  ].join("\n"),
};

const HASH_PREFIX = "sha" + "256:";

function digestHex(value: string): string {
  return byteHash(value).slice(HASH_PREFIX.length);
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function stringFlag(input: KernelCommandInput, key: string): string | undefined {
  const value = input.flags[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function keyItems(items: MaintenanceDebtReport["items"]): DebtQueueItem[] {
  return items.map((item) => ({ ...item, key: maintenanceDebtKey(item) }));
}

function sortQueueItems(items: DebtQueueItem[]): DebtQueueItem[] {
  return [...items].sort(
    (a, b) =>
      [
        (a.app ?? "").localeCompare(b.app ?? ""),
        a.sourceCommand.localeCompare(b.sourceCommand),
        (a.ruleId ?? "").localeCompare(b.ruleId ?? ""),
        (a.file ?? "").localeCompare(b.file ?? ""),
        (a.line ?? 0) - (b.line ?? 0),
        a.key.localeCompare(b.key),
      ].find((value) => value !== 0) ?? 0,
  );
}

export function debtItemMatchesQueue(
  queue: DebtQueue,
  item: MaintenanceDebtReport["items"][number],
): boolean {
  if (!queue.sourceCommands.includes(item.sourceCommand)) return false;
  const selectors = queue.selectors;
  if (selectors.apps && (!item.app || !selectors.apps.includes(item.app))) return false;
  if (selectors.ruleIds && (!item.ruleId || !selectors.ruleIds.includes(item.ruleId))) return false;
  if (selectors.severity && !selectors.severity.includes(item.severity)) return false;
  return true;
}

function matchingItemsForQueue(
  queue: DebtQueue,
  currentItems: MaintenanceDebtReport["items"],
  app?: string,
): DebtQueueItem[] {
  return sortQueueItems(
    keyItems(currentItems).filter(
      (item) => debtItemMatchesQueue(queue, item) && (!app || item.app === app),
    ),
  );
}

function isDeferredDebtClass(item: MaintenanceDebtReport["items"][number]): boolean {
  return DEFERRED_DEBT_CLASSES.some(
    (deferred) =>
      item.sourceCommand === deferred.sourceCommand &&
      item.ruleId === deferred.ruleId &&
      item.severity === deferred.severity,
  );
}

async function readBaselineKeys(workspaceRoot: string): Promise<Set<string>> {
  try {
    const parsed = parseYaml(await readFile(join(workspaceRoot, BASELINE_PATH), "utf8")) as {
      items?: Array<{ key?: unknown }>;
    };
    return new Set(
      (parsed.items ?? [])
        .map((item) => item.key)
        .filter((key): key is string => typeof key === "string" && key.length > 0),
    );
  } catch {
    return new Set();
  }
}

export async function readDebtQueueDocuments(workspaceRoot: string): Promise<DebtQueueDocument[]> {
  const absoluteDirectory = join(workspaceRoot, QUEUE_DIRECTORY);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true }).catch(() => []);
  const documents: DebtQueueDocument[] = [];
  for (const entry of entries.filter(
    (candidate) => candidate.isFile() && candidate.name.endsWith(".yaml"),
  )) {
    const file = toPosixPath(join(QUEUE_DIRECTORY, entry.name));
    try {
      const parsed = parseYaml(await readFile(join(absoluteDirectory, entry.name), "utf8"));
      const result = queueSchema.safeParse(parsed);
      if (!result.success) {
        documents.push({
          file,
          diagnostics: result.error.issues.map((issue) => ({
            ruleId: "MDQ-01",
            severity: "error",
            file,
            message: `Maintenance debt queue YAML is malformed at ${issue.path.join(".") || "root"}.`,
            fixHint: issue.message,
          })),
        });
        continue;
      }
      documents.push({ file, queue: result.data, diagnostics: [] });
    } catch (error) {
      documents.push({
        file,
        diagnostics: [
          {
            ruleId: "MDQ-01",
            severity: "error",
            file,
            message: "Maintenance debt queue YAML could not be read or parsed.",
            fixHint: error instanceof Error ? error.message : "Check that the file is valid YAML.",
          },
        ],
      });
    }
  }
  return documents.sort((a, b) => a.file.localeCompare(b.file));
}

function queueSummary(queue: DebtQueue): DebtQueueReport["queue"] {
  return {
    id: queue.id,
    title: queue.title,
    priority: queue.priority,
    owner: queue.owner,
    status: queue.status,
  };
}

function chooseQueue(
  queues: DebtQueue[],
  currentItems: MaintenanceDebtReport["items"],
  queueId?: string,
): DebtQueue | undefined {
  if (queueId) return queues.find((queue) => queue.id === queueId);
  const active = queues
    .filter((queue) => queue.status === "active")
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return active.find((queue) => matchingItemsForQueue(queue, currentItems).length > 0) ?? active[0];
}

export function buildDebtQueueReport(
  queues: DebtQueue[],
  currentItems: MaintenanceDebtReport["items"],
  options?: { queueId?: string; app?: string },
): DebtQueueReport {
  const selected = chooseQueue(queues, currentItems, options?.queueId);
  if (!selected) {
    return {
      command: "maintenance.debt.queue.report",
      status: "pass",
      queue: null,
      selectedSourceCommands: [],
      selectedRuleIds: [],
      totalMatchingItems: 0,
      batch: { maxItems: 0, items: [] },
      acceptanceCommands: [],
      reminder: "Agents commit after each completed batch and do not push from agent sessions.",
    };
  }

  const maxItems = selected.batchPolicy.maxItemsPerSession;
  const matching = matchingItemsForQueue(selected, currentItems, options?.app);
  return {
    command: "maintenance.debt.queue.report",
    status: matching.length > 0 ? "warn" : "pass",
    queue: queueSummary(selected),
    ...(options?.app ? { selectedApp: options.app } : {}),
    selectedSourceCommands: selected.sourceCommands,
    selectedRuleIds: selected.selectors.ruleIds ?? [],
    totalMatchingItems: matching.length,
    batch: {
      maxItems,
      items: matching.slice(0, maxItems),
    },
    acceptanceCommands: selected.acceptance.commands,
    reminder: "Agents commit after each completed batch and do not push from agent sessions.",
  };
}

function validateDuplicateIds(documents: DebtQueueDocument[], queueId?: string): Diagnostic[] {
  const byId = new Map<string, DebtQueueDocument[]>();
  for (const document of documents) {
    if (!document.queue) continue;
    byId.set(document.queue.id, [...(byId.get(document.queue.id) ?? []), document]);
  }
  const diagnostics: Diagnostic[] = [];
  for (const [id, matches] of byId) {
    if (matches.length < 2 || (queueId && id !== queueId)) continue;
    for (const duplicate of matches.slice(1)) {
      diagnostics.push({
        ruleId: "MDQ-02",
        severity: "error",
        file: duplicate.file,
        message: `Maintenance debt queue id "${id}" is duplicated.`,
        fixHint: "Queue ids must be unique across docs/maintenance-debt/queues/*.yaml.",
      });
    }
  }
  return diagnostics;
}

function validateQueueSelectors(
  document: DebtQueueDocument,
  currentByKey: Map<string, DebtQueueItem>,
  registeredCommands: Set<string>,
  registeredRuleIds: Set<string>,
  registeredApps: Set<string>,
): Diagnostic[] {
  const queue = document.queue;
  if (!queue) return [];
  const diagnostics: Diagnostic[] = [];

  for (const command of queue.sourceCommands) {
    if (!registeredCommands.has(command)) {
      diagnostics.push({
        ruleId: "MDQ-03",
        severity: "error",
        file: document.file,
        message: `Queue "${queue.id}" references unknown source command "${command}".`,
        fixHint: "Use a live Site OS command name or remove it from sourceCommands.",
      });
    }
  }

  for (const app of queue.selectors.apps ?? []) {
    if (!registeredApps.has(app)) {
      diagnostics.push({
        ruleId: "MDQ-03",
        severity: "error",
        file: document.file,
        message: `Queue "${queue.id}" references unknown app "${app}".`,
        fixHint: "Use an app registered in the workspace or remove it from selectors.apps.",
      });
    }
  }

  for (const ruleId of queue.selectors.ruleIds ?? []) {
    if (!registeredRuleIds.has(ruleId)) {
      diagnostics.push({
        ruleId: "MDQ-03",
        severity: "error",
        file: document.file,
        message: `Queue "${queue.id}" references unknown rule id "${ruleId}".`,
        fixHint: "Use a canonical diagnostic rule id emitted by the selected source command.",
      });
    }
    const owner = DIAGNOSTIC_RULES[ruleId]?.command;
    if (owner && !queue.sourceCommands.includes(owner)) {
      diagnostics.push({
        ruleId: "MDQ-10",
        severity: "error",
        file: document.file,
        message: `Queue "${queue.id}" selects rule "${ruleId}" from command "${owner}" outside its sourceCommands.`,
        fixHint: `Add "${owner}" to sourceCommands or remove "${ruleId}" from selectors.ruleIds.`,
      });
    }
  }

  if (queue.batchPolicy.push === true) {
    diagnostics.push({
      ruleId: "MDQ-07",
      severity: "error",
      file: document.file,
      message: `Queue "${queue.id}" enables batchPolicy.push.`,
      fixHint: "Set batchPolicy.push to false; agents must not push queue batches.",
    });
  }

  if (queue.acceptance.commands.length === 0) {
    diagnostics.push({
      ruleId: "MDQ-08",
      severity: "error",
      file: document.file,
      message: `Queue "${queue.id}" has no acceptance commands.`,
      fixHint: "Add the validation commands agents must run after each batch.",
    });
  }

  for (const key of queue.items ?? []) {
    const item = currentByKey.get(key);
    if (!item) {
      diagnostics.push({
        ruleId: "MDQ-06",
        severity: "error",
        file: document.file,
        message: `Queue "${queue.id}" pins stale debt item "${key}".`,
        fixHint:
          "Remove the item key or regenerate/update the queue after confirming the debt is gone.",
        data: { key },
      });
      continue;
    }
    if (!debtItemMatchesQueue(queue, item)) {
      diagnostics.push({
        ruleId: "MDQ-10",
        severity: "error",
        file: document.file,
        message: `Queue "${queue.id}" pins item "${key}" outside its selectors.`,
        fixHint: "Update the queue selectors or move the item to the correct queue.",
        data: { key, sourceCommand: item.sourceCommand, app: item.app },
      });
    }
  }

  return diagnostics;
}

export function validateDebtQueueHealth(input: DebtQueueValidationInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = [
    ...input.documents.flatMap((document) => document.diagnostics),
    ...validateDuplicateIds(input.documents, input.queueId),
  ];
  const currentByKey = new Map(keyItems(input.currentItems).map((item) => [item.key, item]));
  const selectedDocuments = input.documents.filter(
    (document) => document.queue && (!input.queueId || document.queue.id === input.queueId),
  );

  if (input.queueId && selectedDocuments.length === 0) {
    diagnostics.push({
      ruleId: "MDQ-12",
      severity: "error",
      file: QUEUE_DIRECTORY,
      message: `Maintenance debt queue "${input.queueId}" does not exist.`,
      fixHint: "Create the queue YAML or choose one of the active queue ids.",
    });
  }

  for (const document of selectedDocuments) {
    const queue = document.queue;
    if (!queue) continue;
    diagnostics.push(
      ...validateQueueSelectors(
        document,
        currentByKey,
        input.registeredCommands,
        input.registeredRuleIds,
        input.registeredApps,
      ),
    );

    const matching = matchingItemsForQueue(queue, input.currentItems);
    if (queue.status === "active" && matching.length === 0) {
      diagnostics.push({
        ruleId: "MDQ-04",
        severity: "error",
        file: document.file,
        message: `Active queue "${queue.id}" has no matching current debt.`,
        fixHint: "Mark the queue complete, pause it with rationale, or update its selectors.",
      });
    }
    if (queue.status === "complete" && matching.length > 0) {
      diagnostics.push({
        ruleId: "MDQ-09",
        severity: "error",
        file: document.file,
        message: `Completed queue "${queue.id}" still matches ${matching.length} current debt item(s).`,
        fixHint: "Reopen the queue or clear the matching current debt before marking it complete.",
      });
    }
  }

  if (!input.queueId) {
    const coveringQueues = input.documents
      .map((document) => document.queue)
      .filter((queue): queue is DebtQueue => {
        if (!queue) return false;
        return queue.status === "active" || queue.status === "paused";
      });

    for (const item of input.currentItems) {
      const key = maintenanceDebtKey(item);
      if (item.severity !== "warning" || !input.acceptedKeys.has(key) || isDeferredDebtClass(item))
        continue;
      if (coveringQueues.some((queue) => debtItemMatchesQueue(queue, item))) continue;
      diagnostics.push({
        ruleId: "MDQ-05",
        severity: "warning",
        file: item.file ?? QUEUE_DIRECTORY,
        line: item.line,
        message: `Accepted warning debt from ${item.sourceCommand} is not covered by an active or paused queue.`,
        fixHint:
          "Create a queue, pause an explicit queue with rationale, or document the class as deferred.",
        data: { key, sourceCommand: item.sourceCommand, app: item.app, ruleId: item.ruleId },
      });
    }
  }

  return diagnostics;
}

function buildQueueProjection(
  queues: DebtQueue[],
  currentItems: MaintenanceDebtReport["items"],
  acceptedKeys: Set<string>,
): DebtQueueProjection {
  const queueSpecHash = digestHex(JSON.stringify(queues));
  const keyedItems = keyItems(currentItems);
  const sourceReportHash = digestHex(JSON.stringify(keyedItems));
  const baselineHash = digestHex(JSON.stringify([...acceptedKeys].sort()));
  const queuesProjection = queues
    .map((queue) => {
      const matching = matchingItemsForQueue(queue, currentItems);
      return {
        id: queue.id,
        title: queue.title,
        status: queue.status,
        owner: queue.owner,
        priority: queue.priority,
        reviewAfter: queue.reviewAfter,
        sourceCommands: queue.sourceCommands,
        selectors: queue.selectors,
        batchPolicy: queue.batchPolicy,
        totalMatchingItems: matching.length,
        matchingItemKeys: matching.map((item) => item.key),
        nextBatchKeys: matching
          .slice(0, queue.batchPolicy.maxItemsPerSession)
          .map((item) => item.key),
        acceptanceCommands: queue.acceptance.commands,
      };
    })
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  const withoutHash = {
    meta: {
      schemaVersion: 1 as const,
      deterministic: true as const,
      generatedAt: null,
      contentHash: "",
      sourceReportHash,
      baselineHash,
      queueSpecHash,
    },
    command: "maintenance.debt.queue.generate" as const,
    ignoredDebtClasses: DEFERRED_DEBT_CLASSES,
    queues: queuesProjection,
  };
  return {
    ...withoutHash,
    meta: {
      ...withoutHash.meta,
      contentHash: digestHex(JSON.stringify(withoutHash)),
    },
  };
}

function renderQueueProjection(projection: DebtQueueProjection): string {
  return `${yamlStringify(projection)}`;
}

function missingInitialQueueTemplates(
  documents: DebtQueueDocument[],
): Array<{ file: string; content: string }> {
  const existingIds = new Set(
    documents.map((document) => document.queue?.id).filter((id): id is string => Boolean(id)),
  );
  return Object.entries(INITIAL_QUEUE_TEMPLATES)
    .map(([fileName, content]) => {
      const parsed = queueSchema.parse(parseYaml(content));
      return { file: toPosixPath(join(QUEUE_DIRECTORY, fileName)), id: parsed.id, content };
    })
    .filter((template) => !existingIds.has(template.id))
    .map(({ file, content }) => ({ file, content }));
}

async function queueCommandContext(workspaceRoot: string): Promise<{
  documents: DebtQueueDocument[];
  currentItems: MaintenanceDebtReport["items"];
  acceptedKeys: Set<string>;
  registeredCommands: Set<string>;
  registeredRuleIds: Set<string>;
  registeredApps: Set<string>;
}> {
  const [documents, currentItems, acceptedKeys, commandInfos, apps] = await Promise.all([
    readDebtQueueDocuments(workspaceRoot),
    collectMaintenanceDebtItems(workspaceRoot),
    readBaselineKeys(workspaceRoot),
    listRegisteredKernelCommands(workspaceRoot),
    listSiteWorkspaces(workspaceRoot),
  ]);
  return {
    documents,
    currentItems,
    acceptedKeys,
    registeredCommands: new Set(commandInfos.map((command) => command.name)),
    registeredRuleIds: new Set([
      ...listRuleIds(),
      ...currentItems
        .map((item) => item.ruleId)
        .filter((ruleId): ruleId is string => Boolean(ruleId)),
    ]),
    registeredApps: new Set(apps.sites.map((app) => app.name)),
  };
}

export async function runMaintenanceDebtQueueValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const queueId = stringFlag(input, "queue");
  const commandContext = await queueCommandContext(context.workspaceRoot);
  const diagnostics = validateDebtQueueHealth({ ...commandContext, queueId });
  return diagnosticsResult("maintenance.debt.queue.validate", diagnostics);
}

export async function runMaintenanceDebtQueueReport(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<DebtQueueReport>> {
  const queueId = stringFlag(input, "queue");
  const app = context.site?.name ?? stringFlag(input, "app");
  const documents = await readDebtQueueDocuments(context.workspaceRoot);
  const readDiagnostics = documents.flatMap((document) => document.diagnostics);
  if (readDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return {
      data: {
        command: "maintenance.debt.queue.report",
        status: "fail",
        queue: null,
        selectedSourceCommands: [],
        selectedRuleIds: [],
        totalMatchingItems: 0,
        batch: { maxItems: 0, items: [] },
        acceptanceCommands: [],
        reminder: "Agents commit after each completed batch and do not push from agent sessions.",
        diagnostics: readDiagnostics,
      },
      exitCode: 1,
      summary: `maintenance.debt.queue.report: ${readDiagnostics.length} queue read error(s)`,
    };
  }

  const queues = documents
    .map((document) => document.queue)
    .filter((queue): queue is DebtQueue => Boolean(queue));
  if (queueId && !queues.some((queue) => queue.id === queueId)) {
    return {
      data: {
        command: "maintenance.debt.queue.report",
        status: "fail",
        queue: null,
        selectedSourceCommands: [],
        selectedRuleIds: [],
        totalMatchingItems: 0,
        batch: { maxItems: 0, items: [] },
        acceptanceCommands: [],
        reminder: "Agents commit after each completed batch and do not push from agent sessions.",
        diagnostics: [
          {
            ruleId: "MDQ-12",
            severity: "error",
            file: QUEUE_DIRECTORY,
            message: `Maintenance debt queue "${queueId}" does not exist.`,
            fixHint: "Create the queue YAML or choose one of the active queue ids.",
          },
        ],
      },
      exitCode: 1,
      summary: `maintenance.debt.queue.report: queue ${queueId} not found`,
    };
  }

  const report = buildDebtQueueReport(
    queues,
    await collectMaintenanceDebtItems(context.workspaceRoot),
    {
      ...(queueId ? { queueId } : {}),
      ...(app ? { app } : {}),
    },
  );
  return {
    data: report,
    exitCode: 0,
    summary: report.queue
      ? `maintenance.debt.queue.report: ${report.queue.id} ${report.batch.items.length}/${report.totalMatchingItems} item(s)`
      : "maintenance.debt.queue.report: no active queues",
  };
}

export async function runMaintenanceDebtQueueGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<
  KernelCommandResult<{
    command: "maintenance.debt.queue.generate";
    dryRun: boolean;
    projection: DebtQueueProjection;
    proposedQueueFiles: Array<{ file: string; content: string }>;
    writtenFiles: string[];
  }>
> {
  const dryRun = context.dryRun;
  let documents = await readDebtQueueDocuments(context.workspaceRoot);
  const proposedQueueFiles = missingInitialQueueTemplates(documents);
  const writtenFiles: string[] = [];

  if (!dryRun && proposedQueueFiles.length > 0) {
    await mkdir(join(context.workspaceRoot, QUEUE_DIRECTORY), { recursive: true });
    for (const proposed of proposedQueueFiles) {
      // RFC-0258: docs/ output is workspace-shared — must be atomic.
      await writeFileAtomic(join(context.workspaceRoot, proposed.file), proposed.content);
      writtenFiles.push(proposed.file);
    }
    documents = await readDebtQueueDocuments(context.workspaceRoot);
  }

  const queues = documents
    .map((document) => document.queue)
    .filter((queue): queue is DebtQueue => Boolean(queue));
  const [currentItems, acceptedKeys] = await Promise.all([
    collectMaintenanceDebtItems(context.workspaceRoot),
    readBaselineKeys(context.workspaceRoot),
  ]);
  const projection = buildQueueProjection(queues, currentItems, acceptedKeys);

  if (!dryRun) {
    // RFC-0258: docs/ output is workspace-shared — must be atomic.
    await writeFileAtomic(
      join(context.workspaceRoot, QUEUE_PROJECTION_PATH),
      renderQueueProjection(projection),
    );
    writtenFiles.push(QUEUE_PROJECTION_PATH);
  }

  return {
    data: {
      command: "maintenance.debt.queue.generate",
      dryRun,
      projection,
      proposedQueueFiles,
      writtenFiles,
    },
    exitCode: 0,
    summary: dryRun
      ? `maintenance.debt.queue.generate: dry-run projection for ${queues.length} queue(s)`
      : `maintenance.debt.queue.generate: wrote ${writtenFiles.length} file(s)`,
  };
}
