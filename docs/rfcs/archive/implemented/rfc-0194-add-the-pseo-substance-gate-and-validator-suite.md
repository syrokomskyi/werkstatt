---
id: RFC-0194
title: "Add the pSEO substance gate and validator suite"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-15
updatedAt: 2026-06-16
implementedAt: 2026-06-16
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0163
  - RFC-0165
  - RFC-0187
  - RFC-0192
  - RFC-0193
commands:
  proposed: []
  added:
    - pseo.validate
  changed: []
  removed: []
appsImpacted:
  - apps/webgogol-com
packagesImpacted:
  - packages/surface
  - packages/os/site-kernel-checks
successSignals:
  - "A generated page that cannot prove substantive uniqueness is automatically excluded from the index, regardless of how many records matched it."
  - "The build reports a per-surface substance distribution so the studio sees how many pages are indexable vs suppressed and why."
  - "Mass-identical template output is detected and fails the build before it ships a footprint Google can penalize."
nonGoals:
  - "Do not define the eligibility engine or record-count thresholds (RFC-0192)."
  - "Do not define tier-based index budgets or freshness decay (RFC-0196)."
  - "Do not generate or rewrite page content to raise substance — the gate only measures and suppresses."
---

# RFC-0194: Add the pSEO substance gate and validator suite

## Context

The legacy engine's anti-thin-page protection was purely quantitative: a combination went live only if enough records matched it (`minProgramsPerLevel`). That is necessary but insufficient — the studio's own backlog (`spec/TODO/no-thin-pages-for-pseo`, `…industry-intelligence-blocks…`, `…local-marketing-signals…`, `…enhanced-many-senses…`) shows the real failure mode is _content density_: a page can match the record threshold yet still be a near-duplicate template with one swapped noun. Google's E-E-A-T and Helpful Content systems penalize exactly that, and mass-generated pages are the highest-risk surface for it.

RFC-0192 gives every generated page a measurable block structure at build time. That makes it possible to _measure_ substance and refuse to index pages that are thin, before they ship.

## Problem

- Record-count gating does not detect template-footprint thinness; a page with enough matches but no unique tokens still indexes.
- The five legacy "make pages richer" proposals are guidance, not enforcement — nothing stops a thin page from shipping.
- There is no validator family for the programmatic surface (substance, slug collisions, orphan links, sitemap budget, rotation coverage), so quality depends on manual review across thousands of pages.

## Decision

A build-time **Page Substance Score** is introduced and made a hard indexability gate. For each generated page the surface computes a score from: the count of independent data blocks rendered, the ratio of unique tokens to template-shared tokens across the family, the presence of declared "signal" blocks (e.g. local/industry micro-data the Blueprint marks as substance-bearing), and outbound internal-link diversity. A page scoring below the Blueprint's `substanceMin` is forced to `noindex` (or redirected, per policy) **regardless of record count**. The score, its components, and the decision are written into `pseo-manifest.json`.

A `pseo.validate` command consolidates the surface's quality checks: substance distribution, duplicate/colliding slugs (with authored pages), orphan internal links, sitemap budget overflow, and template-rotation coverage (RFC-0193). It joins `apps-check.run` and `build.check`.

## Architectural fit

- **RFC-0192:** substance is computed on the engine's `VirtualRouteEntry` + the resolved blocks; the gate composes with the record-count gate (both must pass to index).
- **RFC-0193:** `substanceMin`, signal-block tags, and the family token baseline are Blueprint-declared.
- **RFC-0163/0165:** a suppressed page still renders (valid HTML, JSON-LD, breadcrumbs) but is tagged `noindex` and omitted from the sitemap and image sitemap — consistent with how thin archives are handled.
- **RFC-0187:** mirrors the "validate built output, not just source" stance — substance is measured on resolved content, and unresolved content references already fail there.

## Design

### CLI surface

```sh
pnpm exec site-kernel run pseo.validate --app webgogol-com --json
```

### TypeScript contracts

```ts
export interface SubstanceComponents {
  independentBlocks: number;     // distinct data-bearing blocks rendered
  uniqueTokenRatio: number;      // 0..1 unique vs family-shared tokens
  signalBlocks: number;          // Blueprint-tagged substance blocks present
  linkDiversity: number;         // distinct internal-link targets
}

export interface SubstanceScore {
  value: number;                 // 0..100 weighted composite
  components: SubstanceComponents;
  indexable: boolean;            // value >= blueprint.substanceMin
}

export function scoreSubstance(
  page: PageEntry,
  family: { tokenBaseline: TokenBaseline; signalBlockIds: string[] },
): SubstanceScore;
```

### File system responsibilities

| Path                                         | Role                                 |
| -------------------------------------------- | ------------------------------------ |
| `packages/surface/src/substance.ts`          | Substance scoring + gate composition |
| `packages/os/site-kernel-checks/src/pseo.ts` | `pseo.validate` aggregate command    |

### Output format

```json
{
  "command": "pseo.validate",
  "status": "fail",
  "summary": { "surface": "website-local", "indexable": 712, "suppressedThin": 168, "median": 64 },
  "violations": [
    { "rule": "below-substance-min", "pageId": "website-local:maler:kleinstadt", "score": 28, "min": 45 },
    { "rule": "slug-collision", "pageId": "website-local:...", "with": "authored:website" },
    { "rule": "orphan-link", "pageId": "website-local:...", "target": "website-local:dead" },
    { "rule": "sitemap-budget-exceeded", "surface": "website-local", "indexable": 9001, "budget": 5000 }
  ]
}
```

### Failure modes

`below-substance-min` is informational by default (the page auto-`noindex`es, build still passes) but `pseo.validate` **fails** when the _share_ of thin pages in a family exceeds a Blueprint ceiling (a family that is mostly thin is a design error, not a per-page accident). `slug-collision`, `orphan-link`, and `sitemap-budget-exceeded` are hard errors. `rotation-coverage` warns when too many pages share one constellation variant.

## Rollout

- Introduce the score in "report-only" mode first: compute and emit to the manifest, do not yet suppress.
- Flip the gate on per Blueprint via `substanceMin`; `website-local` is the first to enforce.
- Wire `pseo.validate` into `apps-check.run` (author phase) and `build.check`.
- New Blueprints inherit a default `substanceMin` from the ontology so they are protected from day one.

## Alternatives considered

- **Word-count threshold:** rejected — trivially gamed and orthogonal to real uniqueness; block-structure + token-uniqueness is harder to fake.
- **Manual review:** rejected — does not scale to thousands of pages.
- **LLM "is this thin?" judgement at build:** rejected for the gate — nondeterministic and slow; LLM enrichment is a separate, frozen-at-build concern (RFC-0197). The gate stays deterministic.
- **Only suppress, never fail the build:** rejected — a family that is mostly thin should block, not silently ship a near-empty index.

## Risks

- **False suppression** of legitimately concise pages. Mitigation: `substanceMin` is per-Blueprint and tunable; report-only mode precedes enforcement; the manifest shows the distribution.
- **Token-baseline cost:** computing family-wide token uniqueness over many pages is O(pages × tokens). Mitigation: hash-based shingling and a single pass during `surface.generate`.
- **Gaming via filler:** authors padding pages with boilerplate. Mitigation: signal-block presence and link diversity, not raw length, dominate the score.

## Acceptance criteria

- [x] `scoreSubstance()` with the four declared components and a per-Blueprint `substanceMin` (`@gogol/surface/substance.ts`) (evidence: packages/ directory, package exists)
- [x] Substance gate composes with the record-count gate; below-min pages auto-`noindex`, render `noindex,follow`, and leave the sitemap (verified: at `substanceMin: 60` the pillar — score 48 — is suppressed; indexable 7→6) (evidence: implemented historically)
- [x] `pseo.validate` registered; hard-fails on slug collisions, orphan links, sitemap-budget overflow, and excessive family-wide thinness (`maxThinShare`) (evidence: implemented historically)
- [x] Per-page score + decision (in `surface.generated.json`) and per-surface distribution (`thin`, `medianSubstance`) written to `pseo-manifest.json` (evidence: implemented historically)
- [x] Report-only mode (`substanceMin: 0`) always scores without suppressing; `website-local` enforces a tuned `substanceMin: 20` (evidence: implemented historically)
- [x] `pseo.validate` joins `apps-check.author` (→ `apps-check.run` + `build.check`) (evidence: implemented historically)
- [x] `AGENTS.md` documents the substance contract and the suppression behavior (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- The gate only measures and suppresses; it MUST NOT mutate or fabricate page content to raise a score.
- Substance scoring MUST be deterministic — no network or LLM calls in the gate path.
- A suppressed page MUST still render valid HTML/JSON-LD; suppression means `noindex` + sitemap omission, never a broken page.
- Agents MUST NOT lower `substanceMin` to pass a build; fix the dataset/constellation or the Blueprint instead.
- Agents MUST NOT weaken `pseo.validate` without a superseding RFC.
