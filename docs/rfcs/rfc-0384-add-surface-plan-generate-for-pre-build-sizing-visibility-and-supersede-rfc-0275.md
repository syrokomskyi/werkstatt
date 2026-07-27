---
id: RFC-0384
title: "Add surface.plan.generate for pre-build sizing visibility and supersede RFC-0275"
status: draft
kind: command
scope: app
owners:
  - architecture
reviewers: []
createdAt: 2026-07-13
updatedAt: 2026-07-13
implementedAt:
closedAt:
supersedes:
  - RFC-0275
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0275
  - RFC-0383
  - RFC-0274
  - RFC-0277
  - RFC-0281
  - RFC-0283
  - RFC-0284
  - RFC-0192
  - DNA-39
satisfies: []
commands:
  proposed:
    - surface.plan.generate
  added: []
  changed:
    - surface.generate
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Route count, indexable estimate, artifact byte size, and language coverage are visible before Astro SSG starts, not after."
  - "Cardinality warnings fire above 10,000 candidate public pages per site unless a high-cardinality experiment is explicitly declared."
  - "Fleet scheduling (RFC-0284 Leitstand) can read the plan to decide whether a full rebuild is worth the CI cost."
  - "RFC-0275 is formally closed; its viable ideas are extracted into RFC-0383 and this RFC; the rest is dropped as premature optimization."
nonGoals:
  - "Do not introduce sharded artifacts, registry-plus-shards layout, or per-shard fingerprints (dropped from RFC-0275 — premature for bounded managed coverage)."
  - "Do not replace cartesian enumeration with a prefix trie for shallow hub depths (RFC-0281 already made deep pages record-driven via evidence joins)."
  - "Do not precompute adjacency indexes as a persistent data structure (RFC-0383 computes the graph in-memory from the artifact)."
  - "Do not introduce dirty flags for incremental rebuilds (full rebuild of a single site is seconds to minutes at current scale)."
  - "Do not modify the surface.generate artifact format."
---

# RFC-0384: Add surface.plan.generate for pre-build sizing visibility and supersede RFC-0275

## Context

RFC-0275 proposed a monolithic scaling overhaul of the programmatic surface pipeline: record-driven expansion, sharded artifacts, adjacency indexes, per-shard fingerprints, dirty flags, a plan command, and a graph validator. After review, RFC-0275 is being superseded — most of its proposals optimize for a scale the product does not target (100K+ pages per site), while its two actionable ideas are extracted into focused RFCs:

- **AC-8** (`surface.graph.validate`) → extracted into **RFC-0383**. SEO link-structure diagnostics with independent value at any scale.
- **AC-1/AC-2** (`surface.plan.generate` + cardinality warnings) → this RFC. Pre-build sizing visibility.

The remaining criteria of RFC-0275 are dropped with reasons documented in the **Supersession rationale** section below.

## Problem

Today, `surface.generate` expands blueprints, bakes pages, and writes the artifact. The operator sees the route count only _after_ generation completes. If a blueprint or record change accidentally explodes the surface from 80 to 8,000 routes, the cost is already paid (generation + Astro SSG + build.check) before anyone notices.

For a single site this is a minor inconvenience. For fleet scheduling (RFC-0284 Leitstand), where many sites are rebuilt from dirty flags, running an expensive build blind is wasteful. The Leitstand needs a cheap pre-flight check: "will this rebuild produce a reasonable number of routes, or has something changed that makes it explode?"

## Decision

The kernel gains a `surface.plan.generate` command that runs the expansion pipeline _without_ baking pages or writing the artifact. It reports candidate counts, indexable estimates, language coverage, and estimated artifact byte size. It warns above a default single-site cardinality limit.

Additionally, `surface.generate` is changed to call `surface.plan.generate` internally and fail early when the plan exceeds a configurable budget, unless `--preview` is requested.

## Architectural fit

- **DNA-39** (route registry as merge of route sources): the plan command runs the same expansion logic as `surface.generate` but stops before baking. No new data source.
- **RFC-0192** (route-source port): the plan is a read-only pre-flight check on the same pipeline. It does not modify the route-source contract.
- **RFC-0277** (managed visibility): the plan exposes route count and artifact cost as "operational facts" — exactly what RFC-0277 §"Architectural fit" says RFC-0275 scaling plans should do.
- **RFC-0284** (Leitstand): `fleet.schedule.plan` can call `surface.plan.generate` to decide whether a full rebuild is worth scheduling under global CI budgets.
- **RFC-0281** (evidence join): the plan command respects evidence-driven existence for deep pages. Candidate counts reflect the evidence-join result, not a raw cartesian product.

## Design

### CLI surface

```sh
pnpm exec site-kernel run surface.plan.generate --app webgogol-com --json
pnpm exec site-kernel run surface.plan.generate --app webgogol-com
```

The command is app-scoped. It runs the expansion pipeline (blueprint discovery, dataset loading, eligibility matrix, evidence gates, dedup) but stops before `bakePage`. No artifact is written. No twins are written. No lazy cache is written.

### TypeScript contracts

```ts
interface BlueprintPlan {
  id: string;
  candidatePrefixes: number;
  indexableEstimate: number;
  languages: string[];
  estimatedArtifactBytes: number;
  warnings: string[];
}

interface SurfacePlanReport {
  command: "surface.plan.generate";
  app: string;
  blueprints: BlueprintPlan[];
  totalCandidates: number;
  totalIndexable: number;
  totalEstimatedBytes: number;
  cardinalityLimit: number;
  highCardinalityExperiment: boolean;
  warnings: string[];
}
```

### Cardinality warnings

The default single-site cardinality limit is **10,000 candidate public pages**. Above this threshold, the plan emits a warning unless a high-cardinality experiment is explicitly declared.

A high-cardinality experiment is declared via the app's `system.md`:

```yaml
pseo:
  highCardinalityExperiment: true
```

When `highCardinalityExperiment: true`, the warning is suppressed and the report notes the experiment declaration. This is an explicit opt-in — the default is bounded managed coverage.

### Estimated artifact bytes

The estimate is computed by serializing a sample of baked entries (or using the pre-bake entry count × average bytes per entry from the previous run). On first run (no previous artifact), the estimate uses a heuristic: `candidatePrefixes × 500 bytes` (conservative average for a baked page entry with blocks).

### surface.generate integration

`surface.generate` calls `surface.plan.generate` internally before baking. If the plan exceeds the cardinality limit and no high-cardinality experiment is declared, `surface.generate` fails early with a clear error message pointing to the plan output. This prevents accidental surface explosions from reaching Astro SSG.

The `--preview` flag on `surface.generate` skips this check and proceeds with baking regardless of plan output. This is the escape hatch for intentional large surfaces.

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/surface.generated.yaml` | Read-only input (previous artifact, used for byte-size heuristic) |
| `src/content/surface/**` | Read-only input (datasets, blueprints) |
| `src/content/system.md` | Read-only input (`pseo.highCardinalityExperiment`) |
| `packages/os/site-kernel-checks/src/surface/plan-generate.ts` | New command handler |
| `packages/os/site-kernel-checks/src/surface/generate.ts` | Modified: calls plan before baking |
| `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` | Command registration |

### Output format

```json
{
  "command": "surface.plan.generate",
  "app": "webgogol-com",
  "blueprints": [
    {
      "id": "website-local",
      "candidatePrefixes": 1042,
      "indexableEstimate": 640,
      "languages": ["de", "uk"],
      "estimatedArtifactBytes": 520000,
      "warnings": []
    }
  ],
  "totalCandidates": 1042,
  "totalIndexable": 640,
  "totalEstimatedBytes": 520000,
  "cardinalityLimit": 10000,
  "highCardinalityExperiment": false,
  "warnings": []
}
```

### Failure modes

- No surface blueprints declared: pass with empty plan and a notice.
- No previous artifact for byte-size heuristic: use conservative heuristic, note in warnings.
- Plan exceeds cardinality limit without experiment: warning in plan output; error in `surface.generate` (unless `--preview`).
- Expansion pipeline error (e.g. missing dataset): fail with the same error as `surface.generate`.

## Supersession rationale

RFC-0275 is superseded by this RFC. Each acceptance criterion of RFC-0275 is resolved as follows:

### Extracted into new RFCs

- **AC-1** (`surface.plan.generate` reports estimates) → **this RFC**.
- **AC-2** (cardinality warnings above 10K) → **this RFC**.
- **AC-8** (`surface.graph.validate`) → **RFC-0383**.

### Already covered by existing RFCs

- **AC-3** (record-driven expansion) → **RFC-0281** already made deep pages (d5+) record-driven via evidence joins. Shallow hubs (d0-d1) remain cartesian by design — they aggregate live descendants, which is the correct behavior. Full prefix-trie expansion is not needed.
- **AC-7** (shard fingerprints) → **RFC-0283** already implemented content-addressed `SurfaceState` using whole-artifact hashing (`shared.ts:96-98`). Without sharding (AC-6, dropped), per-shard fingerprints are unnecessary — a whole-artifact hash is simpler and sufficient.
- **AC-10** (behavior-equivalent under RFC-0269) → the pilot surface output is unchanged; no RFC-0275 changes were applied, so behavior equivalence is trivially preserved.

### Dropped as premature optimization

- **AC-4** (universe dedup before expansion) → `expand.ts:107-122` already filters geo-axes to record-referenced values (~10K cities → dozens). Cartesian product on remaining axes at current scale is milliseconds. Optimization is relevant only at 10K+ candidates per site, which is explicitly not the target.
- **AC-5** (adjacency indexes) → `liveChildrenOf`/`liveSiblingsOf` scan `liveKeysByDepth` sets. At dozens to low-hundreds of entries, this is instantaneous. RFC-0383 computes the graph in-memory from the artifact, avoiding persistent adjacency data structures entirely.
- **AC-6** (registry-plus-sharded artifacts) → the current `surface.generated.yaml` is a single file, ~1MB. Sharding is relevant at 10+ MB. The product target is bounded managed coverage across many sites, not one site with unbounded route multiplication.
- **AC-9** (dirty flags) → full rebuild of a single site at current scale is seconds to minutes. Incremental rebuilds via dirty flags are a fleet-scheduling concern (RFC-0284 Leitstand), not a per-site generation concern. The Leitstand's `FleetSiteStatus.dirtyFlags` field remains a placeholder until fleet scale justifies the investment.
- **AC-11** (`rfc.validate` passes) → trivially preserved; RFC-0275 already passes validation.

### Summary

| RFC-0275 AC | Resolution                                  |
| ----------- | ------------------------------------------- |
| AC-1        | This RFC                                    |
| AC-2        | This RFC                                    |
| AC-3        | Already covered by RFC-0281                 |
| AC-4        | Dropped — premature optimization            |
| AC-5        | Dropped — premature optimization            |
| AC-6        | Dropped — premature optimization            |
| AC-7        | Already covered by RFC-0283                 |
| AC-8        | RFC-0383                                    |
| AC-9        | Dropped — fleet-scale concern, not per-site |
| AC-10       | Trivially preserved                         |
| AC-11       | Trivially preserved                         |

## Rollout

1. **Add `surface.plan.generate`** in report-only mode. No side effects, no artifact writes. Operators and agents can run it to preview a surface before committing to a full build.
2. **Integrate into `surface.generate`**: call the plan internally before baking. Fail early on cardinality limit exceeded (unless `--preview`). This is a behavior change for `surface.generate` — existing apps that accidentally exceed 10K candidates will fail. Mitigation: the limit is generous (10K) and the error message is actionable.
3. **Pipeline integration**: `surface.plan.generate` is added to `SITES_BUILD_PREPARE_PIPELINE` (before `surface.generate`). This gives CI visibility into the plan before the expensive generation step.
4. **Leitstand integration** (future): `fleet.schedule.plan` (RFC-0284) may call `surface.plan.generate` to filter jobs that would produce unreasonable surfaces.

## Alternatives considered

- **Keep RFC-0275 as draft and implement fully.** Rejected: 70% of RFC-0275 optimizes for a scale the product does not target. The RFC itself states "the default single-site target is bounded managed coverage, not six-figure route counts" and "editorial review remains the real bottleneck." Implementing sharding, adjacency indexes, and dirty flags now would be weeks of work for no observable benefit.
- **Close RFC-0275 as rejected.** Rejected: two of its ideas (plan command, graph validator) have genuine value. Superseding with extraction is more precise than blanket rejection.
- **Add plan checks to `surface.validate`.** Rejected: `surface.validate` runs _after_ generation. The whole point of the plan is to run _before_ baking and SSG. A separate command is the correct architectural boundary.
- **Use Astro build hooks for cardinality checks.** Rejected: Astro SSG starts after `surface.generate` writes the artifact. By then, the expensive generation is already done. The check must run before baking, inside the kernel command layer.

## Risks

- **`surface.generate` behavior change.** Apps that currently produce >10K candidates will fail after integration. Mitigation: 10K is a generous default; `--preview` is an escape hatch; `highCardinalityExperiment: true` in `system.md` suppresses the check.
- **Byte-size heuristic inaccuracy.** On first run (no previous artifact), the estimate uses `candidatePrefixes × 500 bytes`. This may be off by 2-3×. Mitigation: the estimate is advisory, not gating. It becomes accurate after the first real generation.
- **Plan duplicates expansion work.** `surface.plan.generate` runs the full expansion pipeline (minus baking), and `surface.generate` runs it again. At current scale this is milliseconds. If it becomes a bottleneck, `surface.generate` can cache the plan result internally and skip the re-expansion. This optimization is deferred.

## Acceptance criteria

- [ ] `surface.plan.generate` command registered in `@gogol/site-kernel-checks` with correct name and scope.
- [ ] Command runs expansion without baking or writing artifacts.
- [ ] Report includes per-blueprint: candidate prefixes, indexable estimate, languages, estimated artifact bytes, warnings.
- [ ] Report includes totals: total candidates, total indexable, total estimated bytes.
- [ ] Cardinality warning fires above 10,000 candidate public pages per site.
- [ ] `highCardinalityExperiment: true` in `system.md` suppresses the cardinality warning.
- [ ] `surface.generate` calls the plan internally and fails early on cardinality limit exceeded (unless `--preview`).
- [ ] `--json` output format matches `SurfacePlanReport` contract.
- [ ] Command integrated into `SITES_BUILD_PREPARE_PIPELINE`.
- [ ] RFC-0275 frontmatter updated: `status: superseded`, `supersededBy: RFC-0384`, `closedAt` set.
- [ ] `rfc.validate` passes on this file and on RFC-0275 before merging.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The plan command MUST NOT write any files. It is a read-only pre-flight check.
- The plan command MUST reuse the existing expansion pipeline (`expandBlueprint` without baking). Do not duplicate expansion logic.
- When implementing the `surface.generate` integration, ensure the `--preview` flag is documented and tested.
