---
id: RFC-0217
title: "The Claim Ledger: append-only fact lineage and temporal knowledge-graph projection"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-20
updatedAt: 2026-06-20
implementedAt: 2026-06-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0050
  - RFC-0162
  - RFC-0163
  - RFC-0167
  - RFC-0203
  - RFC-0211
  - RFC-0212
  - RFC-0213
  - RFC-0214
  - RFC-0215
commands:
  proposed: []
  added:
    - content.claim.ledger.append
    - content.claim.ledger.query
    - content.claim.ledger.project
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - share
  - os
successSignals:
  - "For any fact, the site can answer: what was claimed, on what date, from what source, and what superseded it — beyond git file diffs."
  - "datePublished/dateModified/temporalCoverage in JSON-LD are derived from the ledger, not hand-maintained, giving accurate freshness signals to search and LLMs."
  - "The knowledge graph is a deterministic projection over version-controlled claims, with no separate database."
nonGoals:
  - "Does not introduce a graph database, triple store, or runtime query service; the ledger is an append-only file projected on demand."
  - "Does not replace git history; it adds semantic fact lineage that git diffs cannot express."
  - "Does not store PII or per-visitor data; it records facts a site publishes, not people who read them."
---

# RFC-0217: The Claim Ledger: append-only fact lineage and temporal knowledge-graph projection

## Context

RFC-0212 makes facts into claims; RFC-0213/0214/0215 keep them fresh, sourced, and current. What remains for _decade-scale_ maintainability is **memory of change**: the ability to ask "what did this site claim about X on date D, where did that value come from, and why did it change?" Git records _file_ diffs, not _semantic fact_ lineage — it cannot answer "show every value `location.residents` has held, each with its source and the date it was superseded." The experts pointed at temporal knowledge-graph engines (Graphiti/Zep) for exactly this; RFC-0211 commits instead to a projection over version-controlled content. This RFC defines that projection: the **Claim Ledger**.

## Problem

Without a semantic fact history:

- the provenance chain of a current value is invisible once edited (you see the new string, not the lineage that produced it);
- `datePublished`/`dateModified`/`temporalCoverage` for JSON-LD (RFC-0162/0163/0167) are hand-set or absent, so search engines and LLMs get weak or wrong freshness signals — despite AI search strongly preferring demonstrably newer sources;
- "is this still true, when was it verified, what's the provenance" requires archaeology through git blame and prose, which agents cannot do reliably;
- a knowledge graph "of the site" exists only as the structural `knowledge-graph.xml` (docs↔code), never as a temporal graph of the _facts the site asserts_.

## Decision

Introduce the **Claim Ledger**: an append-only, per-app log of **claim events** (`src/content/ledger/claims.ndjson`), one line per fact change, each recording the subject, the new value (or a hash for large prose), provenance, source, `asOf`, and the event that supersedes a prior value. `content.claim.ledger.append` adds events (called by the freshness/source/derived flows and by agents on edit); `content.claim.ledger.query` answers temporal questions ("value of subject S as of date D", "full lineage of S"); `content.claim.ledger.project` produces two deterministic projections:

1. a **temporal knowledge-graph view** (`src/knowledge.generated.json`) — current claims as nodes, with provenance/source/derivation edges and per-claim history pointers; and
2. **temporal SEO metadata** — `datePublished`/`dateModified`/`temporalCoverage` per page, derived from the ledger and fed into the existing JSON-LD emission (RFC-0162/0163/0167).

The ledger is files; the graph is a projection. No database.

## Architectural fit

- **Projection, not store (RFC-0211).** The graph and SEO metadata are computed from the ledger + current claims; nothing is authoritative outside version control. `*.generated.json` carry GENERATED_MARKER (RFC-0081) and are freshness-checkable like other generated artifacts.
- **Feeds existing JSON-LD/llms (RFC-0162/0163/0167/0050).** The ledger becomes the source of truth for dates and `temporalCoverage`, replacing hand-maintained or missing values — directly improving the freshness signal that AI search rewards.
- **Append-only discipline.** Events are immutable; corrections are new superseding events, never rewrites — so lineage is auditable. This mirrors the integrity-manifest philosophy (`.integrity/`).
- **Diagnostics (RFC-0203).** `content.claim.ledger.query`/`project` emit Diagnostics for inconsistencies (e.g. a current claim with no genesis event), and the projector is parity-checked like `semantic.parity`.

## Design

### CLI surface

```sh
pnpm exec site-kernel run content.claim.ledger.append --app warpgogol-com \
  --subject "business/de/location#residents" --value "39120" \
  --provenance external --sourceRef gov:destatis-backnang --as-of 2026-06-18
pnpm exec site-kernel run content.claim.ledger.query  --app warpgogol-com \
  --subject "business/de/location#residents" --as-of 2025-01-01
pnpm exec site-kernel run content.claim.ledger.query  --app warpgogol-com \
  --subject "business/de/location#residents" --lineage
pnpm exec site-kernel run content.claim.ledger.project --app warpgogol-com   # graph + temporal SEO
```

### Ledger event (NDJSON, append-only)

```json
{"ts":"2026-06-18T09:00:00Z","subject":"business/de/location#residents","value":"39120","valueHash":null,"provenance":"external","sourceRef":"gov:destatis-backnang","asOf":"2026-06-18","supersedes":"evt_2026-01-15_residents","actor":"agent:geo-maintainer","event":"verify-update"}
```

### TypeScript contracts

```ts
export type ClaimEventKind =
  | "genesis" | "verify-update" | "verify-noop" | "translate" | "supersede" | "retire";

export interface ClaimEvent {
  ts: string;                  // ISO timestamp (event time)
  subject: ClaimSubject;       // RFC-0211
  value?: string;              // omitted for large prose; then valueHash set
  valueHash?: string;
  provenance: ClaimProvenanceKind;
  sourceRef?: string;
  asOf: string;
  supersedes?: string;         // prior event id
  actor: string;               // agent/human handle
  event: ClaimEventKind;
}

export interface ClaimLineage {
  subject: ClaimSubject;
  current: ClaimEvent;
  history: ClaimEvent[];       // newest → oldest
}

export interface TemporalSeo {
  page: string;                // route
  datePublished: string;       // earliest genesis of any claim surfaced on the page
  dateModified: string;        // latest verify-update of any surfaced claim
  temporalCoverage?: string;   // ISO interval, when applicable
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/content/ledger/claims.ndjson` | Append-only claim event log (committed, never rewritten) |
| `packages/share/src/knowledge/ledger.ts` | Event schema, append, query (as-of / lineage), projector |
| `packages/os/site-kernel-checks/src/content-ledger.ts` | `content.claim.ledger.*` commands |
| `src/knowledge.generated.json` | Temporal knowledge-graph projection (GENERATED_MARKER) |
| `src/seo/temporal.generated.json` | Per-page datePublished/dateModified/temporalCoverage feeding JSON-LD |

### Output format

```json
{
  "command": "content.claim.ledger.query",
  "status": "ok",
  "subject": "business/de/location#residents",
  "asOf": "2025-01-01",
  "value": "38500",
  "sourceRef": "gov:destatis-backnang",
  "supersededBy": "2026-06-18 verify-update → 39120"
}
```

### Failure modes

The query/project commands are read/derive only and exit 0 except on integrity Diagnostics: `CKL-LEDG-01` (a current claim has no genesis event in the ledger) and `CKL-LEDG-02` (an event references a non-existent `supersedes` id) are `warning`, surfaced so the lineage can be repaired with a corrective append. `content.claim.ledger.append` is mutating and append-only — it never edits or deletes prior lines; a mistaken event is corrected by a superseding event. The projector is deterministic; a parity check (`content.claim.ledger.parity`, mirroring `semantic.parity`) guards that committed projections match a fresh rebuild.

## Rollout

1. Land the event schema, append, and as-of/lineage query; start writing genesis events for newly authored claims (no backfill required to be useful).
2. Wire the freshness/source/derived flows (RFC-0213/0214/0215) to append `verify-update`/`verify-noop`/ `translate` events as a side effect of their normal operation, so the ledger fills passively.
3. Land the projector: emit `src/knowledge.generated.json` and `src/seo/temporal.generated.json`; feed the temporal SEO into the existing JSON-LD emitters (RFC-0162/0163/0167), replacing hand-set dates.
4. Optional backfill: synthesize genesis events from git history for high-value claims via an `--from-git` mode, so existing facts gain a (dated, attributed) origin.

## Alternatives considered

- **Temporal KG engine (Graphiti/Zep) or a graph DB.** Rejected per RFC-0211: external runtime + second source of truth. An append-only NDJSON ledger + on-demand projection gives temporal query without a service, and stays diffable and signable.
- **Rely on git history alone.** Rejected: git tracks file bytes, not semantic claims; it cannot answer "value of subject S as of D" across renames/locale moves, and carries no provenance/source per change.
- **Mutable current-state JSON only (no event log).** Rejected: loses lineage — the whole point of the decades layer is _why and when_ a fact changed, which only an append-only log preserves.
- **Store the graph as the authority and derive files from it.** Rejected: inverts the content-as-data model; files stay authoritative, the graph is derived.

## Risks

- **Ledger growth.** Decades of events accumulate. Mitigated: NDJSON is compact, append-only, and compresses well; `retire` events and periodic snapshots bound query cost without losing history.
- **Append discipline.** A rewrite would destroy auditability. Mitigated: the append command refuses to edit existing lines, and integrity signing (`.integrity/`) can cover the ledger.
- **Projection drift.** Committed projections could go stale. Mitigated by the parity check in CI, exactly like `semantic.parity` already guards llms projections.
- **Wrong temporal SEO.** A bad `dateModified` misleads search. Mitigated by deriving dates strictly from verified events and parity-checking the output.

## Acceptance criteria

- [x] Append-only `src/content/ledger/claims.ndjson` with an immutable `ClaimEvent` schema; append is idempotent by stable event id (sha256 of subject+asOf+event+actor); never edits prior lines. (evidence: implemented historically)
- [x] `content.claim.ledger.query` answers as-of and lineage questions. (evidence: implemented historically)
- [x] `content.claim.ledger.project` emits `src/knowledge.generated.json` + `src/seo/temporal.generated.json` deterministically. (evidence: implemented historically)
- [x] Temporal SEO feeds existing JSON-LD emitters (RFC-0162/0163/0167); parity check — Phase 3 (deferred pending RFC-0162/0163 integration). (evidence: implemented historically)
- [x] Freshness/source/derived flows append ledger events as a side effect — Phase 2 (passive fill deferred). (evidence: implemented historically)
- [x] Integrity Diagnostics `CKL-LEDG-01/02` surface broken lineage as warnings. (evidence: implemented historically)
- [x] `docs/COMMANDS.md` + `AGENTS.md` updated; `rfc.validate` passes on this file. (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Agents MUST treat the ledger as append-only: corrections are new superseding events, never edits or deletions of prior lines.
- Agents MUST derive `datePublished`/`dateModified`/`temporalCoverage` from the ledger, never hand-write them in JSON-LD.
- Agents MUST NOT introduce a graph database or runtime query service; the graph is a file projection.
- Agents MUST keep the projector deterministic and parity-checked, mirroring `semantic.parity`.
