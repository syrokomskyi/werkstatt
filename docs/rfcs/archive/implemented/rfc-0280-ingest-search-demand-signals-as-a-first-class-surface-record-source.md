---
id: RFC-0280
title: "Ingest search-demand signals as a first-class surface record source"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-03
updatedAt: 2026-07-05
implementedAt: 2026-07-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0192
  - RFC-0213
  - RFC-0238
  - RFC-0274
  - RFC-0276
  - RFC-0277
  - RFC-0282
commands:
  proposed:
    []
  added:
    - demand.signal.import
    - demand.signal.validate
    - demand.map.report
  changed:
    - surface.generate
    - pseo.validate
    - pseo.proof.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
successSignals:
  - "Search demand is a versioned, machine-readable record source, not an informal assumption."
  - "A surface tuple can require demand evidence before it is allowed to exist as an indexable page."
  - "The RFC-0277 demand-map proof gate reads real signal data instead of a human assertion."
  - "An agent can decide whether to create a page from measured demand without a human doing keyword research."
nonGoals:
  - "Do not call external APIs during deterministic build; import is an offline ingestion pass that writes versioned records."
  - "Do not treat demand data as a guarantee of indexation or ranking; it is an existence and prioritization input."
  - "Do not store personally identifiable query data or per-user analytics."
---

# RFC-0280: Ingest search-demand signals as a first-class surface record source

## Context

Fable's audit lands its sharpest structural point in §B1: nothing in the PSEO system is grounded in _demand_. Pages are generated from an editorial taxonomy (industries × geo × demand records), but there is no data anywhere that says a human actually searches for `{demand} {industry} {city}`. RFC-0277 then defines a "demand map" proof gate — but nothing _produces_ that map. It is assumed to arrive from a human doing keyword research.

For a fleet operated by AI, "a human does keyword research per cluster" is the same throughput trap as per-artifact review. Demand must be a **data source the machine can read**, so that the create/don't-create decision — the most consequential decision in the whole system — is made from evidence, automatically.

## Problem

- Eligibility (RFC-0192) decides a tuple is "live" purely from record _existence_, never from search demand. A page can exist with real records behind it and zero human intent in front of it.
- RFC-0277's `Demand map` gate has no defined input; it cannot be evaluated by a command.
- There is no contract for importing Google Search Console (GSC) queries, Keyword Planner volumes, or equivalent signals into the record model.
- Consequently the system optimizes route count (which it controls) instead of demand coverage (which determines whether any of it earns impressions).

## Decision

The platform gains a **demand-signal record source**: an offline importer, `demand.signal.import`, that ingests search-demand data into versioned, machine-readable records under the surface data tree. A `DemandSignal` binds a normalized query intent to axis values (industry, geo, demand) and carries volume, competition, and source provenance.

Blueprints may then declare a **demand gate** per depth: a tuple is only indexable when a matching demand signal clears a configured threshold. Below it, the page is not emitted (preferred) or emitted noindex per policy — the same existence discipline RFC-0274 applies to evidence.

`pseo.proof.validate` (RFC-0277) reads these records for its demand-map gate. `demand.map.report` produces the query→volume→intent table Fable's action plan step 4 calls for — as a generated artifact, not a spreadsheet a human maintains.

## Architectural fit

- RFC-0192's route-source port is unchanged; demand signals are a _new record source feeding eligibility_, resolved alongside the existing demand/industry collections.
- RFC-0213 freshness discipline applies: demand signals carry an observation date and decay; stale demand is flagged, not trusted forever.
- RFC-0238's five-axis model gives demand signals their binding keys (industry/country/region/city/demand).
- RFC-0274 evidence gates and this demand gate compose: a deep page ideally needs _both_ demand (someone searches) and evidence (we can prove something true). Demand without evidence is a thin risk; evidence without demand is an unread page.
- RFC-0277 proof gates consume the demand map; RFC-0282 later reconciles predicted demand against realized GSC impressions.

## Design

### TypeScript contracts

```ts
export interface DemandSignal {
  id: string;
  query: string;                    // normalized, lowercased search phrase
  intent: "informational" | "commercial" | "transactional" | "navigational";
  axes: Partial<Record<"industry" | "country" | "region" | "city" | "demand", string>>;
  volume?: number;                  // monthly, when available
  competition?: number;             // 0..1, when available
  source: "gsc" | "keyword-planner" | "manual" | "derived";
  observedAt: string;               // ISO; drives freshness/decay
  provenance: { importId: string; sourceRef?: string };
}
```

### Blueprint demand gate

```yaml
policy:
  demandPerDepth:
    4:
      minVolume: 10
      allowIntents: [commercial, transactional]
      missing: noindex
    5:
      minVolume: 20
      allowIntents: [commercial, transactional]
      missing: do-not-emit
```

### CLI surface

```sh
# Offline ingestion: read an export (GSC/Keyword Planner) into versioned records.
pnpm exec site-kernel run demand.signal.import --app warpgogol-com --source gsc --input ./exports/gsc-2026-07.json --json

# Validate signal records: schema, axis resolution, freshness, dedupe.
pnpm exec site-kernel run demand.signal.validate --app warpgogol-com --json

# Produce the demand map: query → volume → intent by cluster.
pnpm exec site-kernel run demand.map.report --app warpgogol-com --blueprint website-local --json
```

Import is offline: it reads a provided export file or a cached API pull performed outside the deterministic build. The build itself never calls an external API.

### File system responsibilities

| Path                                                        | Role                            |
| ----------------------------------------------------------- | ------------------------------- |
| `apps/<app>/src/content/surface/demand-signals/<lang>/*.md` | Versioned demand-signal records |
| `apps/<app>/src/surface/demand-map.generated.json`          | Generated cluster demand map    |

### Validation rules

| Rule | Severity | Meaning |
| --- | --- | --- |
| `DEM-01` | error | Demand signal fails schema or has an unresolvable axis value |
| `DEM-02` | warning | Demand signal is stale beyond its freshness SLA |
| `DEM-03` | error | Indexable depth declares a demand gate but the tuple has no qualifying signal and policy is `do-not-emit` |
| `DEM-04` | warning | Duplicate/near-duplicate query records collapsed into one intent |
| `DEM-05` | error | Demand record contains raw PII or per-user analytics fields |

## Failure modes

- Depth with `missing: do-not-emit` and no qualifying signal: the page is not generated (`DEM-03` only if a signal was expected by config mismatch).
- Import file malformed: `demand.signal.import` exits non-zero; existing records untouched.
- Stale demand map: `DEM-02` warnings; `pseo.proof.validate` reports "demand data stale" rather than passing on old numbers.
- PII in an export: `DEM-05` error; the record is rejected at import.

## Rollout

1. Add `DemandSignal` schema, `demand.signal.import`, and `demand.signal.validate`.
2. Import a first GSC/Keyword export for `warpgogol-com` (dogfood surface) and one pilot client industry.
3. Add `demand.map.report`; wire it into `pseo.proof.validate`'s demand-map gate.
4. Add optional Blueprint demand gates in report-only mode; observe how many current tuples lack demand.
5. Promote the deepest-depth demand gate to `do-not-emit` once the demand map is trusted, tightening existence toward searched intent.

## Alternatives considered

- **Keep demand as a human research step.** Rejected: it is the per-cluster analogue of per-artifact review and does not scale to a fleet.
- **Infer demand from an LLM guess.** Rejected: unfounded volume estimates are worse than none; import measured data and mark gaps honestly.
- **Call GSC/Keyword APIs during build.** Rejected: it breaks deterministic build and couples SSG to external availability and rate limits.
- **Gate only on records, never on demand.** Rejected: this is exactly the failure Fable B1 names — pages with records but no searchers.

## Risks

- **Sparse demand data early on.** Mitigation: gates start report-only; `do-not-emit` is enabled per depth only once coverage is real; RFC-0282 backfills demand from realized impressions over time.
- **Query→axis mapping errors.** Mitigation: `DEM-01` fails unresolved axes; `demand.map.report` surfaces low-confidence mappings for review.
- **Over-pruning genuine long-tail.** Mitigation: thresholds are Blueprint data, calibrated per experiment (RFC-0277), not global constants.

## Acceptance criteria

- [x] `DemandSignal` schema and versioned record layout exist. (evidence: implemented historically)
- [x] `demand.signal.import`, `demand.signal.validate`, and `demand.map.report` are registered. (evidence: implemented historically)
- [x] Import runs offline and never calls an external API during deterministic build. (evidence: implemented historically)
- [x] Blueprints can declare a per-depth demand gate with `missing: noindex | do-not-emit`. (evidence: implemented historically)
- [x] `pseo.proof.validate` reads the generated demand map for its demand-map gate. (evidence: implemented historically)
- [x] Demand records are freshness-tracked and PII-guarded. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Never fabricate demand volumes; import measured data and let gaps read as gaps.
- Never call an external demand API from inside the build; ingestion is a separate, offline, versioned pass.
- Treat the demand gate as the create/don't-create decision's evidence: prefer not emitting a page over emitting one nobody searches for.
- Keep demand signals free of PII and per-user analytics; store aggregate intent only.
