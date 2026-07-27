/*
<MODULE_CONTRACT>
<purpose>RFC-0188 Phase 3: prove the canonical→generic stage bridge is total and lands only on
valid generic stages, so the Pipedrive sync worker (STAGE_MAP) keeps working while the precise
funnel_stage is preserved. Pure — no I/O.</purpose>
<responsibilities>
  <item>FUNNEL_STAGE_TO_BUFFER_STAGE covers every canonical stage and maps into BUFFER_DEAL_STAGES.</item>
  <item>Terminal stages bridge to their generic equivalents; isFunnelStage guards the catalog.</item>
</responsibilities>
<non-goals><item>No DB — the bridge is a pure mapping.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0188 Phase 3: initial stage-bridge test.</item></CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  BUFFER_DEAL_STAGES,
  FUNNEL_STAGE_TO_BUFFER_STAGE,
  bridgeFunnelStage,
  isFunnelStage,
} from "../crm-buffer.ts";
import { VISITOR_FUNNEL_STAGES } from "../funnel.ts";

test("the bridge maps every canonical funnel stage onto a valid generic stage", () => {
  const generic = new Set<string>(BUFFER_DEAL_STAGES);
  for (const stage of VISITOR_FUNNEL_STAGES) {
    const mapped = FUNNEL_STAGE_TO_BUFFER_STAGE[stage];
    expect(mapped).toBeTruthy();
    expect(generic.has(mapped)).toBeTruthy();
  }
  // Totality: no extra keys beyond the canonical catalog.
  expect(Object.keys(FUNNEL_STAGE_TO_BUFFER_STAGE).length).toBe(VISITOR_FUNNEL_STAGES.length);
});

test("terminal funnel stages bridge to their generic equivalents", () => {
  expect(bridgeFunnelStage("won")).toBe("won");
  expect(bridgeFunnelStage("lost")).toBe("lost");
  expect(bridgeFunnelStage("offer_presented")).toBe("proposal");
  expect(bridgeFunnelStage("new_session")).toBe("new");
});

test("isFunnelStage guards the canonical catalog", () => {
  expect(isFunnelStage("offer_presented")).toBe(true);
  expect(isFunnelStage("q_website_tier")).toBe(false); // legacy UChat string
  expect(isFunnelStage("new")).toBe(false); // generic buffer stage, not a funnel stage
});
