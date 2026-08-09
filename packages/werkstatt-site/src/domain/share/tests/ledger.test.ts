/*
<MODULE_CONTRACT>
<purpose>RFC-0217: tests for the claim ledger — event-id identity (incl. value),
as-of query, lineage assembly, and the two projections.</purpose>
<keywords>RFC-0217, CKL, ledger, event, lineage, projection, test</keywords>
</MODULE_CONTRACT>
<MODULE_MAP><entry key="tests">stableEventId, queryAsOf, buildLineage, projectGraph, projectTemporalSeo, ndjson round-trip.</entry></MODULE_MAP>
<CHANGE_SUMMARY><item>RFC-0217: initial ledger tests (added in self-review pass).</item></CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  stableEventId,
  parseNdjson,
  serializeEvent,
  buildLineage,
  queryAsOf,
  projectGraph,
  projectTemporalSeo,
  type ClaimEvent,
} from "../knowledge/ledger.ts";

function evt(partial: Partial<ClaimEvent>): ClaimEvent {
  const subject = partial.subject ?? "business/de/location#residents";
  const asOf = partial.asOf ?? "2026-01-01";
  const event = partial.event ?? "genesis";
  const actor = partial.actor ?? "agent:test";
  return {
    id: stableEventId(subject, asOf, event, actor, partial.value),
    ts: partial.ts ?? `${asOf}T00:00:00Z`,
    subject,
    value: partial.value,
    provenance: partial.provenance ?? "external",
    asOf,
    actor,
    event,
    ...partial,
  };
}

test("stableEventId: identical payload is idempotent", () => {
  const a = stableEventId("s#f", "2026-01-01", "genesis", "agent:a", "39120");
  const b = stableEventId("s#f", "2026-01-01", "genesis", "agent:a", "39120");
  expect(a).toBe(b);
  expect(a).toMatch(/^evt_[0-9a-f]{16}$/);
});

test("stableEventId: a different value on the same day/actor/event is a DISTINCT event", () => {
  const first = stableEventId("s#f", "2026-01-01", "verify-update", "agent:a", "39120");
  const corrected = stableEventId("s#f", "2026-01-01", "verify-update", "agent:a", "39200");
  expect(first).not.toBe(corrected);
});

test("ndjson round-trip preserves a compact event", () => {
  const e = evt({ value: "39120" });
  const [parsed] = parseNdjson(`${serializeEvent(e)}\n`);
  expect(parsed).toEqual(e);
});

test("parseNdjson ignores blank lines", () => {
  const e = evt({ value: "1" });
  expect(parseNdjson(`\n${serializeEvent(e)}\n\n`).length).toBe(1);
});

test("queryAsOf: returns the most recent event whose asOf precedes the query date", () => {
  const events = [
    evt({ asOf: "2025-01-15", value: "38500", event: "genesis" }),
    evt({ asOf: "2026-06-18", value: "39120", event: "verify-update" }),
  ];
  expect(queryAsOf(events, "business/de/location#residents", "2025-06-01")?.value).toBe("38500");
  expect(queryAsOf(events, "business/de/location#residents", "2026-12-01")?.value).toBe("39120");
  expect(queryAsOf(events, "business/de/location#residents", "2024-01-01")).toBe(null);
});

test("buildLineage: history is newest → oldest with the latest as current", () => {
  const events = [
    evt({ asOf: "2025-01-15", ts: "2025-01-15T00:00:00Z", value: "38500" }),
    evt({ asOf: "2026-06-18", ts: "2026-06-18T00:00:00Z", value: "39120" }),
  ];
  const lin = buildLineage(events, "business/de/location#residents");
  expect(lin).toBeTruthy();
  expect(lin!.current.value).toBe("39120");
  expect(lin!.history[0].value).toBe("39120");
  expect(lin!.history[1].value).toBe("38500");
});

test("buildLineage: null for an unknown subject", () => {
  expect(buildLineage([evt({ value: "1" })], "business/de/nope#x")).toBe(null);
});

test("projectGraph: one node per subject, newest event wins, history counted", () => {
  const events = [
    evt({ asOf: "2025-01-15", ts: "2025-01-15T00:00:00Z", value: "38500" }),
    evt({ asOf: "2026-06-18", ts: "2026-06-18T00:00:00Z", value: "39120" }),
    evt({ subject: "business/de/company#foundingYear", value: "2026", ts: "2026-02-01T00:00:00Z" }),
  ];
  const graph = projectGraph(events, "warpgogol-com");
  expect(graph.nodes.length).toBe(2);
  const residents = graph.nodes.find((n) => n.subject === "business/de/location#residents")!;
  expect(residents.currentValue).toBe("39120");
  expect(residents.historyCount).toBe(2);
});

test("projectTemporalSeo: datePublished is earliest genesis, dateModified is latest update", () => {
  const subject = "business/de/location#residents";
  const events = [
    evt({ subject, asOf: "2025-01-15", event: "genesis", value: "38500" }),
    evt({ subject, asOf: "2026-06-18", event: "verify-update", value: "39120" }),
  ];
  const map = new Map<string, string[]>([["de/location", [subject]]]);
  const [seo] = projectTemporalSeo(events, map);
  expect(seo.datePublished).toBe("2025-01-15");
  expect(seo.dateModified).toBe("2026-06-18");
  expect(seo.temporalCoverage).toBe("2025-01-15/2026-06-18");
});

test("projectTemporalSeo: no temporalCoverage when published equals modified", () => {
  const subject = "business/de/company#foundingYear";
  const events = [evt({ subject, asOf: "2026-02-01", event: "genesis", value: "2026" })];
  const map = new Map<string, string[]>([["de/company", [subject]]]);
  const [seo] = projectTemporalSeo(events, map);
  expect(seo.datePublished).toBe("2026-02-01");
  expect(seo.dateModified).toBe("2026-02-01");
  expect(seo.temporalCoverage).toBe(undefined);
});
