---
id: RFC-0275
title: "Scale programmatic surface generation with record-driven sharded artifacts"
status: superseded
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-03
updatedAt: 2026-07-13
implementedAt:
closedAt: 2026-07-13
supersedes: []
supersededBy: RFC-0384
amends: []
amendedBy: []
related:
  - RFC-0081
  - RFC-0087
  - RFC-0255
  - RFC-0258
  - RFC-0269
  - RFC-0270
  - RFC-0274
commands:
  proposed:
    - surface.plan.generate
    - surface.graph.validate
  added: []
  changed:
    - surface.generate
    - surface.validate
    - pseo.validate
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
successSignals:
  - "Programmatic surface generation scales by matched records and live prefixes, not by full cartesian enumeration of every axis universe."
  - "Large page corpora are written as sharded artifacts with a small registry, not one giant inline JSON file."
  - "Internal-link graphs are computed from prebuilt adjacency indexes instead of repeated full-array scans."
  - "CI memory and build time are bounded by explicit budgets and cache keys."
  - "The scale target is many client sites with bounded managed coverage, not one site with unbounded route multiplication."
nonGoals:
  - "Do not introduce runtime server rendering for PSEO pages."
  - "Do not weaken deterministic output or generated-file governance."
  - "Do not remove Astro SSG; make its input surface scalable."
---

# RFC-0275: Scale programmatic surface generation with record-driven sharded artifacts

> **Superseded by [RFC-0384](rfc-0384-add-surface-plan-generate-for-pre-build-sizing-visibility-and-supersede-rfc-0275.md) on 2026-07-13.**
>
> RFC-0275 proposed a monolithic scaling overhaul. After review, two actionable ideas were extracted into focused RFCs:
>
> - **AC-1/AC-2** (`surface.plan.generate` + cardinality warnings) → **RFC-0384**
> - **AC-8** (`surface.graph.validate`) → **RFC-0383**
>
> The remaining criteria are dropped as premature optimization for the current product stage (bounded managed coverage, not six-figure route counts):
>
> - **AC-4** (universe dedup) — `expand.ts` already filters geo-axes to record-referenced values; remaining cartesian product is milliseconds at current scale.
> - **AC-5** (adjacency indexes) — `liveChildrenOf`/`liveSiblingsOf` scan `liveKeysByDepth` sets; instantaneous at dozens to low-hundreds of entries. RFC-0383 computes the graph in-memory.
> - **AC-6** (sharded artifacts) — current artifact is ~1MB; sharding is relevant at 10+ MB.
> - **AC-9** (dirty flags) — full rebuild is seconds to minutes; incremental rebuilds are a fleet-scheduling concern, not per-site.
>
> Two criteria were already covered by existing RFCs:
>
> - **AC-3** (record-driven expansion) — RFC-0281 made deep pages record-driven via evidence joins; shallow hubs remain cartesian by design.
> - **AC-7** (shard fingerprints) — RFC-0283 implemented content-addressed `SurfaceState` using whole-artifact hashing; per-shard fingerprints are unnecessary without sharding.
>
> See RFC-0384 §"Supersession rationale" for the full criterion-by-criterion resolution.

## Context

The current PSEO pilot is small: dozens of routes, a roughly megabyte-scale generated surface artifact, and no CI pressure. The target product is different: dozens of industries, hundreds of cities, many demands, multiple languages, and white-label tenants.

At that scale, two current assumptions break:

- candidate generation can enumerate cartesian tuples per depth and deduplicate later;
- the generated artifact can inline every page and every block in one JSON file.

## Problem

The audit identified several scale bottlenecks:

- eligibility enumerates cartesian candidates before filtering;
- duplicate demand records can multiply candidate work before pageId dedupe;
- page baking uses repeated full-entry scans for children and siblings;
- freshness checks can re-filter all records per entry;
- lazy entries reduce inline blocks but not registry size or SSG path count;
- validators may load whole artifacts when they only need graph or metadata;
- build budgets are not tied to surface cardinality.

## Decision

Programmatic Surface generation moves to a **record-driven, sharded artifact architecture**:

1. Build candidate prefixes from active records and geo selections, not from full cartesian products.
2. Deduplicate universe values before any depth expansion.
3. Keep matched record ids and freshness metadata from eligibility through baking, avoiding repeated record scans.
4. Precompute graph adjacency indexes once per Blueprint/depth.
5. Write a small registry artifact plus one sharded page artifact per page or page bucket.
6. Make lazy page loading the default for high-cardinality depths.
7. Add an explicit `surface.plan.generate` sizing plan before writing artifacts.
8. Add `surface.graph.validate` for orphan, crawl-depth, inbound-distribution, and link-budget diagnostics.
9. Treat full rebuilds as exceptional fleet events; normal operation uses dirty flags from record, claim, freshness, enrichment, and translation changes.

## Architectural fit

- RFC-0192's route-source port remains the public integration point; the registry keeps that stable while storage becomes sharded.
- RFC-0193 Blueprint semantics do not change; only expansion strategy and artifact layout change.
- RFC-0195 SEO/GEO twins still derive from generated page state, but writers can stream from shards.
- RFC-0258 atomic-write governance applies to any shared generated files; app-local shards still carry the RFC-0081 marker.
- RFC-0274 consumes the graph and rendered-text artifacts produced by this scalable pipeline.

## Design

### Record-driven expansion

Instead of:

```txt
for depth in levels:
  enumerate product(axis0..axisN)
  count matching records
```

generation builds a prefix trie from active records:

```txt
for record in activeRecords:
  resolve axis values used by this record
  add every live prefix required by Blueprint levels
  accumulate matched record ids, freshness dates, and evidence fields
```

Geo provider axes still apply selection and entitlement policy, but they do not expand into unused cities or regions. Empty hubs are derived from live descendants, not from full universe multiplication.

The default single-site target is bounded managed coverage, not six-figure route counts. `surface.plan.generate` warns above 10,000 candidate public pages per site unless a module context explicitly opts into a high-cardinality experiment.

### Artifact layout

```txt
apps/<app>/src/surface.generated.json
  small registry: schema, blueprints, entries metadata, artifact pointers

apps/<app>/src/surface.generated/
  website-local/
    d0/root.json
    d1/<hash>.json
    d4/<hash>.json
    d5/<hash>.json
```

The registry remains the single route-source entrypoint. Page blocks, rendered markdown text, link arrays, evidence summaries, and duplicate fingerprints live in shards.

All generated files carry the RFC-0081 marker. Shared writes outside the target app follow RFC-0258 atomic-write rules.

### Plan output

`surface.plan.generate` runs before writing the full surface:

```json
{
  "command": "surface.plan.generate",
  "app": "webgogol-com",
  "blueprints": [
    {
      "id": "website-local",
      "candidatePrefixes": 1042,
      "indexableEstimate": 640,
      "languages": ["uk", "de"],
      "estimatedRegistryBytes": 180000,
      "estimatedShardBytes": 42000000,
      "warnings": []
    }
  ]
}
```

The plan lets CI and agents see whether a change will explode route count before Astro SSG starts.

Across a fleet, a Leitstand process can schedule many small site rebuilds from dirty flags. The individual site generator stays simple and static; the fleet scheduler owns queueing, concurrency, and retry policy.

### Graph indexes

During generation, the engine writes or exposes:

- parent key by page;
- children by parent key;
- siblings by depth and normalized route prefix;
- inbound link count;
- outbound link count;
- breadcrumb depth;
- noindex/indexable status.

`surface.graph.validate` consumes these indexes and reports:

- orphan indexable pages;
- overly deep pages with low inbound count;
- pages exceeding internal-link budget;
- singleton chains collapsed too aggressively;
- d4/d5 clusters with no nearby sibling links;
- lazy pages whose links cannot be validated.

### Cache keys

Each shard records a source fingerprint:

- Blueprint hash;
- module context hash;
- relevant record hashes;
- approved artifact hashes;
- translator note hashes for translated pages;
- generation code version or schema version.

If the fingerprint is unchanged, generation may reuse the shard. Existence-only skip is forbidden.

Dirty flags are produced by changes to source records, CKL claims, freshness ledgers, approved enriched artifacts, translations, translator notes, glossaries, and relevant Blueprint/module context. A dirty flag identifies the smallest affected page set when possible.

## CLI surface

```sh
pnpm exec site-kernel run surface.plan.generate --app webgogol-com --json
pnpm exec site-kernel run surface.generate --app webgogol-com --json
pnpm exec site-kernel run surface.graph.validate --app webgogol-com --json
```

`surface.generate` may call `surface.plan.generate` internally and fail early when module budget or CI memory policy would be exceeded.

## Failure modes

- Plan exceeds module index budget: generation fails before writing shards unless `--preview` is requested.
- Plan exceeds default single-site cardinality limit: warning or error by module policy, before Astro SSG.
- Shard fingerprint mismatch: stale shard is purged and regenerated.
- Missing shard for registry entry: validator error.
- Registry points to unmarked generated shard: validator error.
- Graph orphan at indexable depth: error after rollout, warning during migration.

## Rollout

1. Add `surface.plan.generate` in report-only mode.
2. Deduplicate universes and carry matched record ids through the current in-memory generator.
3. Add adjacency maps to remove full-array children/siblings scans.
4. Introduce registry-plus-shards while keeping the old inline artifact as a compatibility output for one migration window.
5. Switch consumers and validators to the sharded artifact reader.
6. Remove inline page blocks from the registry once parity is proven by behavior snapshots.

## Alternatives considered

- **Keep one giant JSON and raise CI memory.** Rejected: it delays the failure and makes local agent work unpleasant.
- **Generate every route in Astro directly from records.** Rejected: it bypasses the route-source port and weakens validation artifacts.
- **Use SSR for long-tail pages.** Rejected for this product stage: static delivery and deterministic artifacts are still core constraints.
- **Optimize for 100k+ pages on one client site now.** Rejected: the product need is fleet-scale managed coverage, and editorial review remains the real bottleneck.

## Risks

- Sharding can make consumers inconsistent if some read the registry and others read old inline blocks. Mitigation: provide one sharded reader API and migrate consumers through it.
- Cache keys can be incomplete and serve stale pages. Mitigation: store explicit source fingerprints and forbid existence-only skips.
- Record-driven expansion can miss intended empty hubs. Mitigation: derive parent hubs from live descendants and assert expected hub policies in `surface.graph.validate`.
- Fleet scheduling can become a hidden second system. Mitigation: keep per-site artifacts deterministic and make Leitstand consume explicit dirty flags and Bordbuch events.

## Acceptance criteria

- [ ] `surface.plan.generate` reports candidate, indexable, byte-size, language, and budget estimates.
- [ ] `surface.plan.generate` warns above default single-site cardinality limits unless a high-cardinality experiment is declared.
- [ ] Candidate expansion is record-driven or demonstrably bounded by live prefixes, not full cartesian products.
- [ ] Universe values are deduplicated before expansion.
- [ ] Children/sibling/internal-link computation uses adjacency indexes.
- [ ] Registry-plus-sharded artifacts are generated with RFC-0081 markers.
- [ ] Shard fingerprints invalidate stale derived artifacts by source hash, never by existence-only checks.
- [ ] `surface.graph.validate` reports orphans, inbound distribution, crawl depth, and link budget.
- [ ] Dirty-flag inputs are defined for records, claims, freshness, enriched artifacts, translations, translator notes, glossaries, Blueprint, and module context.
- [ ] Existing pilot output remains behavior-equivalent under RFC-0269 snapshot review.
- [ ] `rfc.validate` passes on this file.

## Implementation notes for agents

- Do not optimize by dropping validation metadata. Large surfaces need more machine-readable evidence, not less.
- Keep the sharded reader as the only consumer API so Astro routes, validators, and reports agree on page state.
- Treat route count and artifact byte size as product signals; they should be visible before the expensive build starts.
