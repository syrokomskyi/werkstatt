import { describe, expect, it } from "vitest";
import { maintenanceDebtKey, type MaintenanceDebtReport } from "../ecosystem.ts";
import {
  buildDebtQueueReport,
  validateDebtQueueHealth,
  type DebtQueue,
  type DebtQueueDocument,
} from "../maintenance/maintenance-debt-queue.ts";

type DebtItem = MaintenanceDebtReport["items"][number];

function item(id: string, overrides?: Partial<DebtItem>): DebtItem {
  return {
    sourceCommand: "example.validate",
    severity: "warning",
    app: "site-a",
    ruleId: "EXAMPLE.RULE",
    message: `Example warning ${id}`,
    file: `src/content/${id}.md`,
    ...overrides,
  };
}

function queue(overrides?: Partial<DebtQueue>): DebtQueue {
  return {
    id: "example-queue",
    title: "Example queue",
    status: "active",
    owner: "architecture",
    priority: 1,
    createdAt: "2026-07-01",
    reviewAfter: "2026-08-01",
    rationale: "Test queue.",
    sourceCommands: ["example.validate"],
    selectors: {
      apps: ["site-a"],
      ruleIds: ["example.rule"],
      severity: ["warning"],
    },
    batchPolicy: {
      maxItemsPerSession: 2,
      commitAfterEachBatch: true,
      push: false,
    },
    acceptance: {
      commands: ["pnpm exec werkstatt run example.validate --json"],
    },
    ...overrides,
  };
}

function document(
  queueValue: DebtQueue,
  file = `docs/maintenance-debt/queues/${queueValue.id}.yaml`,
): DebtQueueDocument {
  return { file, queue: queueValue, diagnostics: [] };
}

function validate(
  documents: DebtQueueDocument[],
  currentItems: DebtItem[],
  acceptedKeys?: string[],
) {
  return validateDebtQueueHealth({
    documents,
    currentItems,
    acceptedKeys: new Set(acceptedKeys ?? []),
    registeredCommands: new Set(["example.validate"]),
    registeredRuleIds: new Set(["example.rule", "other.rule"]),
    registeredApps: new Set(["site-a"]),
  });
}

describe("maintenance debt queue planning", () => {
  it("selects matching queue items and caps the next batch", () => {
    const currentItems = [item("one"), item("two"), item("three")];
    const report = buildDebtQueueReport([queue()], currentItems, { queueId: "example-queue" });

    expect(report.totalMatchingItems).toBe(3);
    expect(report.batch.maxItems).toBe(2);
    expect(report.batch.items).toHaveLength(2);
    expect(report.batch.items.map((entry) => entry.file)).toEqual([
      "src/content/one.md",
      "src/content/three.md",
    ]);
  });

  it("detects completed queues that still match current debt", () => {
    const diagnostics = validate(
      [document(queue({ status: "complete" }))],
      [item("still-present")],
    );

    expect(diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain("MDQ-09");
  });

  it("detects duplicate queue ids", () => {
    const first = document(queue({ status: "complete" }), "docs/maintenance-debt/queues/one.yaml");
    const second = document(queue({ status: "complete" }), "docs/maintenance-debt/queues/two.yaml");
    const diagnostics = validate([first, second], []);

    expect(diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain("MDQ-02");
  });

  it("warns when accepted warning debt is not covered by an active or paused queue", () => {
    const uncovered = item("uncovered");
    const diagnostics = validate(
      [
        document(
          queue({
            status: "paused",
            selectors: { apps: ["site-a"], ruleIds: ["other.rule"], severity: ["warning"] },
          }),
        ),
      ],
      [uncovered],
      [maintenanceDebtKey(uncovered)],
    );

    expect(diagnostics).toMatchObject([
      {
        ruleId: "MDQ-05",
        severity: "warning",
      },
    ]);
  });
});
