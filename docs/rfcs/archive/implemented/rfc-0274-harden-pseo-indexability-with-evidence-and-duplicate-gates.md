---
id: RFC-0274
title: "Harden PSEO indexability with evidence and duplicate gates"
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
amendedBy:
  - RFC-0318
  - RFC-0324
related:
  - RFC-0205
  - RFC-0213
  - RFC-0215
  - RFC-0220
  - RFC-0248
  - RFC-0269
  - RFC-0271
  - RFC-0272
commands:
  proposed:
    - surface.duplicate.validate
    - surface.evidence.validate
  added:
    - surface.duplicate.validate
    - surface.evidence.validate
  changed:
    - surface.validate
    - pseo.validate
    - demand.modifier.lint
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
successSignals:
  - "A page cannot be indexable only because it has enough structural blocks and internal links."
  - "Depth-5 Bedarfskarten require approved narrative or explicit evidence fields before indexability."
  - "Commercial/local pages are emitted from evidence joins where possible, not from cartesian route desire alone."
  - "Near-duplicate clusters are detected across sibling cities, demands, and languages before pages ship."
  - "Known validator holes from the PSEO audit are closed in the same hardening pass."
nonGoals:
  - "Do not use an LLM as the indexability judge."
  - "Do not lower existing substance gates to make warnings disappear."
  - "Do not add synonym substitution as a duplicate-avoidance strategy."
---

# RFC-0274: Harden PSEO indexability with evidence and duplicate gates

## Context

RFC-0194 introduced the substance gate as a deterministic anti-thin-content guard. The audit showed that the current score is necessary but not sufficient. Pages can score well through block count, FAQ blocks, and link diversity even when the approved per-tuple narrative is missing. Depth-5 Bedarfskarten are the highest SEO-risk surface because they multiply city and demand combinations.

Google risk is not solved by an internal score. The platform needs evidence gates and near-duplicate checks that prove a page has page-specific substance, not only a filled template.

## Problem

Current weaknesses:

- `substanceMin: 24` is a low floor and current d5 pages can exceed it without approved narrative.
- The text extractor undercounts or miscounts nested visible content, so the score is not a faithful projection of rendered text.
- There is no SimHash, MinHash, shingle, or rendered-text duplicate detector.
- Invalid freshness dates can behave as fresh.
- Modifier lint can miss Windows paths.
- Unresolved surface image tokens can drift from the content asset contract.
- Generated phantom roots or empty levels can pollute thin-share metrics.
- Lazy pages can escape some link/content checks if validators only inspect stripped inline blocks.

## Decision

Indexability becomes a two-layer decision:

1. **Structural floor:** the existing deterministic score, improved to use rendered semantic text and per-depth thresholds. It is a sanitary floor, not a proxy for helpfulness.
2. **Evidence profile:** Blueprint-declared required facts, approved narrative state, target-locale approval state, freshness validity, asset resolution, evidence joins, and duplicate-distance gates for each indexable depth.

A page is indexable only when both layers pass. If either layer fails, the page is noindexed, redirected according to policy, or reported as a hard error when the Blueprint declares the depth contract-critical.

For deepest commercial/local pages, missing evidence should usually mean "do not emit the page" rather than "emit a noindex page." Noindex is reserved for reversible rollout states, previews, and upper-level UX continuity; it is not a trash bin for route ideas that lack facts.

## Architectural fit

- RFC-0194 substance scoring stays deterministic but becomes one gate inside a broader indexability decision.
- RFC-0196 freshness remains the freshness source; this RFC tightens invalid-date handling for indexable pages.
- RFC-0238's Bedarfskarte model supplies the evidence fields that d5 pages must prove before indexability.
- RFC-0272 makes approved source and translated narratives visible to indexability checks.

## Design

### Blueprint policy extension

```yaml
policy:
  substanceMinPerDepth:
    0: 24
    1: 36
    4: 52
    5: 64
  evidencePerDepth:
    5:
      approvedNarrative: required
      requiredRecordFields:
        - searchedAs
        - neededPage
        - trustProofs
        - leadLosingMistakes
      preferredEvidenceSources:
        - works
        - references
        - verifiedClaims
      minTupleSpecificFacts: 2
      freshness: valid-and-current
      duplicate:
        method: simhash
        maxSimilarityWithinCluster: 0.86
      leadImage: warning
```

The exact thresholds should be calibrated from generated pilot pages and behavior snapshots, but the policy shape is required.

Variant rotation is explicitly not evidence. Deterministic block-order or CTA rotation may remain a presentation choice, but it must not contribute to indexability and should be removed if duplicate analysis shows it creates a recognizable footprint without information gain.

### Duplicate clusters

`surface.duplicate.validate` compares rendered markdown or rendered semantic text, not raw block JSON. It groups comparisons by meaningful clusters:

- same Blueprint and depth;
- sibling cities for one industry and demand;
- sibling demands for one industry and city;
- translated pages against their source, where high similarity is expected but missing target-language markers are not;
- authoring-language pages against each other, where high similarity is a risk.

Diagnostics report the pair, similarity score, shared shingles, and the first differing evidence fields.

### Evidence validation

`surface.evidence.validate` checks:

- required record fields exist and are non-placeholder;
- required evidence joins exist where the Blueprint declares them;
- approved narrative exists where required;
- translated narrative approval is current for non-authoring languages;
- freshness field parses as a date and meets SLA;
- image tokens resolve through the shared content asset contract;
- material credits exist for newly introduced lead images;
- depth levels without a Blueprint level are skipped, not emitted as thin placeholder routes.
- structural score is calculated on master/source content before decorative enrichment and does not count variant rotation as substance.

### Validator fixes included

- `demand.modifier.lint` uses path parsing, not `split("/")`, and checks both filename-derived slug and frontmatter slug.
- Freshness invalid or missing date is not treated as age `0`; it is a diagnostic.
- `pseo.validate` loads lazy page blocks or reads the sharded page artifact before orphan/link checks.
- `surface.validate` reports generated roots or levels that lack a matching Blueprint level.
- Substance text extraction walks nested visible props and markdown twins, not only top-level block props.

## CLI surface

```sh
pnpm exec site-kernel run surface.evidence.validate --app webgogol-com --blueprint website-local --json
pnpm exec site-kernel run surface.duplicate.validate --app webgogol-com --blueprint website-local --json
pnpm exec site-kernel run pseo.validate --app webgogol-com --json
```

`pseo.validate` becomes the aggregate quality gate that includes substance, evidence, duplicate, freshness, entitlement, and link checks.

## Failure modes

- Missing required evidence on contract-critical depth: page forced noindex and validator error.
- Missing required evidence on deepest commercial/local depth: page is not emitted unless preview/noindex rollout policy explicitly allows it.
- Missing required evidence on rollout depth: page forced noindex and validator warning.
- Duplicate similarity over threshold: warning in early rollout; promotion to error when pilot corpus is calibrated.
- Invalid freshness date: error for any indexable page.
- Translation stale: noindex for translated public page until refreshed and approved.

## Rollout

1. Fix known validator holes first; these are low-risk correctness repairs.
2. Add rendered-text extraction and duplicate reporting in warning mode.
3. Add Blueprint evidence policy for `website-local` d5.
4. Calibrate thresholds on `webgogol-com` pilot pages.
5. Promote d5 missing narrative/evidence from warning to indexability blocker.

## Alternatives considered

- **Raise `substanceMin` only.** Rejected: a higher score still measures structure, not proof of page-specific value.
- **Use LLM quality scoring.** Rejected: non-deterministic and hard to audit; LLMs may help generate content, not judge indexability.
- **Synonym spinning.** Rejected: it creates noise and can worsen spam risk.
- **Keep emitting every eligible tuple as noindex.** Rejected for deep pages: pages without evidence should usually not exist yet.

## Risks

- New gates may noindex many current pilot pages. Mitigation: rollout in report-only mode, then promote d5 requirements after calibration.
- Similarity thresholds can create false positives across legitimate sibling pages. Mitigation: cluster by depth and intent, and report before failing.
- Evidence policy can become too bespoke. Mitigation: express it in Blueprint policy, not app-local code.
- Evidence-first expansion can reduce visible page count. Mitigation: product reporting should celebrate managed coverage quality, not raw route volume.

## Acceptance criteria

- [x] `surface.evidence.validate` and `surface.duplicate.validate` are registered. (evidence: implemented historically)
- [x] Substance extraction covers nested visible content and generated semantic text used for markdown twins. (evidence: implemented historically)
- [x] `website-local` declares per-depth evidence policy for d5 Bedarfskarten. (evidence: implemented historically)
- [x] Missing approved d5 narrative or required demand fields prevents indexability. (evidence: implemented historically)
- [x] Missing required evidence join prevents deep commercial/local page indexing unless preview/noindex rollout policy explicitly allows it. (evidence: implemented historically)
- [x] Duplicate reports include clusters, similarity score, and page ids. (evidence: implemented historically)
- [x] Freshness invalid dates produce diagnostics and cannot pass as fresh. (evidence: implemented historically)
- [x] `demand.modifier.lint` is path-separator-safe and checks frontmatter slugs. (evidence: implemented historically)
- [x] Lazy pages are included in link/orphan/content checks. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Treat the substance score as a coarse filter, not as proof of helpful content.
- Do not tune thresholds to preserve current index counts. Tune them to preserve pages with real evidence.
- Keep duplicate detection deterministic and reproducible; store no model-generated judgments in the gate.
