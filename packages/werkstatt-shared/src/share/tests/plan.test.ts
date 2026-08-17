/*
<MODULE_CONTRACT>
<purpose>RFC-0216: tests for maintenance-plan contracts — task-id idempotency,
pre-deadline dueAt, and the shared red/amber gate verdict.</purpose>
<keywords>RFC-0216, CKL, plan, task, gate, test</keywords>
</MODULE_CONTRACT>
<MODULE_MAP><entry key="tests">stableTaskId, computeDueAt, isRedTask, defaultCriticality.</entry></MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0216: initial plan tests (added in self-review pass).</item>
  <item>RFC-0323: blocking review-due comparative claims are red.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  stableTaskId,
  computeDueAt,
  defaultCriticality,
  isRedTask,
  type MaintenanceTask,
} from "../knowledge/plan.ts";

test("stableTaskId: idempotent for the same (subject, trigger)", () => {
  const a = stableTaskId("business/de/offer#price.monthly", "expired");
  const b = stableTaskId("business/de/offer#price.monthly", "expired");
  expect(a).toBe(b);
  expect(a).toMatch(/^t_[0-9a-f]{16}$/);
});

test("stableTaskId: distinct per trigger so two problems on one subject do not collide", () => {
  const expired = stableTaskId("business/de/offer#price.monthly", "expired");
  const review = stableTaskId("business/de/offer#price.monthly", "review-due");
  expect(expired).not.toBe(review);
});

test("computeDueAt: schedules leadTime days before validUntil", () => {
  const due = computeDueAt({ validUntil: "2026-12-31", leadTimeDays: 30, today: "2026-06-20" });
  expect(due).toBe("2026-12-01");
});

test("computeDueAt: clamps to today when the lead window has already passed", () => {
  const due = computeDueAt({ validUntil: "2026-06-25", leadTimeDays: 30, today: "2026-06-20" });
  expect(due).toBe("2026-06-20");
});

test("computeDueAt: uses reviewDueAt when there is no validUntil", () => {
  const future = computeDueAt({ reviewDueAt: "2027-01-01", leadTimeDays: 30, today: "2026-06-20" });
  expect(future).toBe("2027-01-01");
  const past = computeDueAt({ reviewDueAt: "2026-01-01", leadTimeDays: 30, today: "2026-06-20" });
  expect(past).toBe("2026-06-20");
});

function task(partial: Partial<MaintenanceTask>): MaintenanceTask {
  return {
    id: "t_x",
    subject: "business/de/offer#price.monthly",
    trigger: "expired",
    dueAt: "2026-06-20",
    criticality: "advisory",
    owner: "agent:test",
    diagnostics: [],
    status: "open",
    ...partial,
  };
}

test("isRedTask: blocking + expired is red", () => {
  expect(isRedTask(task({ criticality: "blocking", trigger: "expired" }))).toBe(true);
});

test("isRedTask: blocking + source-diverged and derived-outdated are red", () => {
  expect(isRedTask(task({ criticality: "blocking", trigger: "source-diverged" }))).toBe(true);
  expect(isRedTask(task({ criticality: "blocking", trigger: "derived-outdated" }))).toBe(true);
});

test("isRedTask: blocking review-due is red, while expiring-soon stays amber", () => {
  expect(isRedTask(task({ criticality: "blocking", trigger: "review-due" }))).toBe(true);
  expect(isRedTask(task({ criticality: "blocking", trigger: "expiring-soon" }))).toBe(false);
});

test("isRedTask: advisory/important expired never blocks the build", () => {
  expect(isRedTask(task({ criticality: "advisory", trigger: "expired" }))).toBe(false);
  expect(isRedTask(task({ criticality: "important", trigger: "expired" }))).toBe(false);
});

test("isRedTask: a done task is never red", () => {
  expect(isRedTask(task({ criticality: "blocking", trigger: "expired", status: "done" }))).toBe(
    false,
  );
});

test("defaultCriticality: only expired/source-diverged default above advisory", () => {
  expect(defaultCriticality("expired")).toBe("important");
  expect(defaultCriticality("source-diverged")).toBe("important");
  expect(defaultCriticality("review-due")).toBe("advisory");
  expect(defaultCriticality("derived-outdated")).toBe("advisory");
});
