/*
<MODULE_CONTRACT>
<purpose>
RFC-0217: The Claim Ledger — event schema, append helpers, as-of/lineage
query, and knowledge-graph/temporal-SEO projectors. The ledger is an
append-only NDJSON file (`src/content/ledger/claims.ndjson`); each line is
one immutable ClaimEvent. The projector produces two generated JSON artifacts
(knowledge.generated.yaml + seo/temporal.generated.yaml) on demand.
Framework-free; no filesystem access.
</purpose>
<keywords>RFC-0217, CKL, ledger, claim event, lineage, temporal SEO, knowledge graph</keywords>
<responsibilities>
  <item>Define ClaimEvent, ClaimLineage, TemporalSeo, KnowledgeGraph contracts.</item>
  <item>stableEventId — deterministic event identifier.</item>
  <item>buildLineage — assemble lineage from flat event list for a subject.</item>
  <item>queryAsOf — value of a subject as of a given date.</item>
  <item>projectGraph — current claims × lineage as nodes+edges.</item>
  <item>projectTemporalSeo — per-page datePublished/dateModified.</item>
</responsibilities>
<non-goals>
  <item>Do not read/write the filesystem — the kernel command does that.</item>
  <item>Do not parse sidecar files — consume pre-parsed events only.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ClaimEvent / ClaimEventKind">The immutable ledger record shape.</entry>
  <entry key="stableEventId">sha256-based deterministic event id.</entry>
  <entry key="buildLineage">Lineage for a subject: current + history (newest→oldest).</entry>
  <entry key="queryAsOf">Value as of a given date.</entry>
  <entry key="projectGraph / projectTemporalSeo">Deterministic projections.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0217: initial ledger contract and projection helpers.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import type { ClaimProvenanceKind } from "./claim.ts";

export type ClaimEventKind =
  "genesis" | "verify-update" | "verify-noop" | "translate" | "supersede" | "retire";

export interface ClaimEvent {
  /** Stable deterministic id for this event line. */
  id: string;
  /** ISO timestamp (event time, UTC). */
  ts: string;
  /** Canonical subject address (RFC-0211). */
  subject: string;
  /** String value (omitted for large prose; then valueHash set). */
  value?: string;
  /** sha256:<hex> of the value for large prose. */
  valueHash?: string;
  provenance: ClaimProvenanceKind;
  sourceRef?: string;
  /** ISO date of the fact (when the value was true). */
  asOf: string;
  /** Id of the event this supersedes (linking lineage). */
  supersedes?: string;
  /** Agent or human handle that produced this event. */
  actor: string;
  event: ClaimEventKind;
}

export interface ClaimLineage {
  subject: string;
  current: ClaimEvent;
  /** Full history including current, newest → oldest. */
  history: ClaimEvent[];
}

export interface TemporalSeo {
  /** Route/page slug. */
  page: string;
  /** ISO date of earliest genesis event for claims on this page. */
  datePublished: string;
  /** ISO date of latest verify-update event for claims on this page. */
  dateModified: string;
  /** ISO interval "YYYY-MM-DD/YYYY-MM-DD" when earliest ≠ latest. */
  temporalCoverage?: string;
}

export interface KnowledgeGraphNode {
  subject: string;
  currentValue?: string;
  provenance: ClaimProvenanceKind;
  asOf: string;
  sourceRef?: string;
  latestEventId: string;
  historyCount: number;
}

export interface KnowledgeGraph {
  generatedAt: string;
  app: string;
  nodes: KnowledgeGraphNode[];
}

export const LEDGER_GENERATED_MARKER =
  "GENERATED. Do not change this line unless the file contains project specific changes.";

/**
 * Deterministic event id: sha256 of (subject + asOf + event + actor + value).
 * The value (or valueHash for large prose) is part of the identity so that two
 * genuinely distinct corrections on the same day by the same actor produce
 * distinct events, while re-appending an identical event stays idempotent.
 */
export function stableEventId(
  subject: string,
  asOf: string,
  event: ClaimEventKind,
  actor: string,
  value?: string,
): string {
  const key = `${subject}|${asOf}|${event}|${actor}|${value ?? ""}`;
  return `evt_${createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16)}`;
}

/** Parse an NDJSON string into a list of ClaimEvents (skips blank lines). */
export function parseNdjson(ndjson: string): ClaimEvent[] {
  return ndjson
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ClaimEvent);
}

/** Serialize a ClaimEvent to a single NDJSON line (no trailing newline). */
export function serializeEvent(event: ClaimEvent): string {
  return JSON.stringify(event);
}

/** Build a lineage chain for a subject from the flat event list. */
export function buildLineage(events: ClaimEvent[], subject: string): ClaimLineage | null {
  const relevant = events.filter((e) => e.subject === subject);
  if (relevant.length === 0) return null;
  // Sort newest first by ts.
  const sorted = [...relevant].sort((a, b) => b.ts.localeCompare(a.ts));
  return {
    subject,
    current: sorted[0],
    history: sorted,
  };
}

/**
 * Query the value of a subject as of a given ISO date.
 * Returns the most-recent event whose asOf ≤ queryDate, or null.
 */
export function queryAsOf(
  events: ClaimEvent[],
  subject: string,
  queryDate: string,
): ClaimEvent | null {
  const candidates = events
    .filter((e) => e.subject === subject && e.asOf <= queryDate)
    .sort((a, b) => b.asOf.localeCompare(a.asOf) || b.ts.localeCompare(a.ts));
  return candidates[0] ?? null;
}

/** Project current-state knowledge graph from the ledger. */
export function projectGraph(events: ClaimEvent[], app: string): KnowledgeGraph {
  const bySubject = new Map<string, ClaimEvent[]>();
  for (const e of events) {
    const list = bySubject.get(e.subject) ?? [];
    list.push(e);
    bySubject.set(e.subject, list);
  }

  const nodes: KnowledgeGraphNode[] = [];
  for (const [subject, evts] of bySubject) {
    const sorted = [...evts].sort((a, b) => b.ts.localeCompare(a.ts));
    const current = sorted[0];
    nodes.push({
      subject,
      currentValue: current.value,
      provenance: current.provenance,
      asOf: current.asOf,
      sourceRef: current.sourceRef,
      latestEventId: current.id,
      historyCount: evts.length,
    });
  }

  nodes.sort((a, b) => a.subject.localeCompare(b.subject));
  return {
    generatedAt: new Date().toISOString(),
    app,
    nodes,
  };
}

/**
 * Project temporal SEO metadata per page from the ledger.
 * `pageClaimsMap` maps a page route → array of claim subjects surfaced on that page.
 */
export function projectTemporalSeo(
  events: ClaimEvent[],
  pageClaimsMap: Map<string, string[]>,
): TemporalSeo[] {
  const result: TemporalSeo[] = [];
  for (const [page, subjects] of pageClaimsMap) {
    const relevantEvents = events.filter((e) => subjects.includes(e.subject));
    if (relevantEvents.length === 0) continue;

    const genesisDates = relevantEvents
      .filter((e) => e.event === "genesis")
      .map((e) => e.asOf)
      .sort();
    const updateDates = relevantEvents
      .filter((e) => e.event === "verify-update" || e.event === "genesis")
      .map((e) => e.asOf)
      .sort();

    const datePublished = genesisDates[0] ?? updateDates[0] ?? relevantEvents[0].asOf;
    const dateModified = updateDates[updateDates.length - 1] ?? datePublished;
    const temporalCoverage =
      datePublished !== dateModified ? `${datePublished}/${dateModified}` : undefined;

    result.push({ page, datePublished, dateModified, temporalCoverage });
  }
  return result.sort((a, b) => a.page.localeCompare(b.page));
}
