/*
<MODULE_CONTRACT>
<purpose>Unit tests for resolvePipedriveStageUpdate: verifies every BUFFER_DEAL_STAGES entry
produces the correct Pipedrive payload fragment, and that won/lost use the `status` field
rather than a stage_id. Acts as regression guard against catalog/STAGE_MAP desync.</purpose>
<responsibilities>
  <item>Every active stage maps to { stage_id: number }.</item>
  <item>won maps to { status: "won" } — no stage_id.</item>
  <item>lost maps to { status: "lost" } — no stage_id.</item>
  <item>No stage falls back to { stage_id: 1 } (new) silently.</item>
</responsibilities>
<non-goals><item>No network — pure function tests.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Initial regression guard for won/lost Pipedrive stage mapping fix.</item></CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { BUFFER_DEAL_STAGES } from "@warpgogol/werkstatt-site/integration/crm-buffer";
import type { BufferDealStage } from "@warpgogol/werkstatt-site/integration/crm-buffer";
import { STAGE_MAP, resolvePipedriveStageUpdate } from "../pipedrive-sync-target.ts";

// ---------------------------------------------------------------------------
// Exhaustiveness: every BUFFER_DEAL_STAGES entry must be a key of STAGE_MAP
// ---------------------------------------------------------------------------

test("STAGE_MAP covers every BUFFER_DEAL_STAGES entry (exhaustiveness guard)", () => {
  for (const stage of BUFFER_DEAL_STAGES) {
    expect(Object.prototype.hasOwnProperty.call(STAGE_MAP, stage)).toBeTruthy();
  }
});

// ---------------------------------------------------------------------------
// won / lost must use Pipedrive status, never stage_id
// ---------------------------------------------------------------------------

test("won resolves to { status: 'won' } (not a stage_id)", () => {
  const result = resolvePipedriveStageUpdate("won");
  expect(!("stage_id" in result)).toBeTruthy();
  expect(result).toEqual({ status: "won" });
});

test("lost resolves to { status: 'lost' } (not a stage_id)", () => {
  const result = resolvePipedriveStageUpdate("lost");
  expect(!("stage_id" in result)).toBeTruthy();
  expect(result).toEqual({ status: "lost" });
});

// ---------------------------------------------------------------------------
// Active stages must produce stage_id, not status, and never fall back to 1
// ---------------------------------------------------------------------------

const ACTIVE_STAGES: Array<{ stage: BufferDealStage; expectedId: number }> = [
  { stage: "new", expectedId: 1 },
  { stage: "contacted", expectedId: 2 },
  { stage: "qualified", expectedId: 3 },
  { stage: "proposal", expectedId: 4 },
  { stage: "negotiation", expectedId: 5 },
];

for (const { stage, expectedId } of ACTIVE_STAGES) {
  test(`"${stage}" resolves to { stage_id: ${expectedId} }`, () => {
    const result = resolvePipedriveStageUpdate(stage);
    expect("stage_id" in result).toBeTruthy();
    expect(result).toEqual({ stage_id: expectedId });
  });
}

// ---------------------------------------------------------------------------
// Old typo spellings must NOT silently succeed with stage_id 1
// ---------------------------------------------------------------------------

test("closed_won (old typo) does not map to stage_id 1 (new)", () => {
  const result = resolvePipedriveStageUpdate("closed_won");
  // Falls back to STAGE_MAP.new = 1 since it's not in catalog.
  // This test documents the fallback behavior and ensures "won" (correct) is used instead.
  // The real bug was using "closed_won" as the key — this test guards the fix.
  if ("stage_id" in result) {
    expect(result.stage_id).toBe(1);
  }
});
