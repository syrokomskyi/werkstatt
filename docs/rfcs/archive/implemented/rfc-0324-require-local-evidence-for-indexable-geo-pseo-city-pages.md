---
id: RFC-0324
title: "Require local evidence for indexable geo PSEO city pages"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-06
implementedAt: 2026-07-06
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0195
  - RFC-0274
amendedBy: []
related:
  - RFC-0194
  - RFC-0196
  - RFC-0214
  - RFC-0271
  - RFC-0280
  - RFC-0317
commands:
  proposed: []
  added: []
  changed:
    - surface.generate
    - surface.evidence.validate
    - surface.duplicate.validate
    - surface.validate
    - pseo.validate
    - sitemap.generate
    - llms.generate
    - page.markdown.generate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Intermediate geo navigation levels can exist for users but are noindex, follow, canonicalized to the trade hub, and excluded from sitemap and GEO outputs until they carry level-specific substance."
  - "Indexable city-level PSEO pages carry at least three source-backed local facts and one city-specific QA."
  - "PSEO medianSubstance measures template-absent unique token share, and duplicate gates fail branch pairs with body similarity above 70 percent."
nonGoals:
  - "Do not use synonym spinning or randomized copy as a duplicate-avoidance strategy."
  - "Do not publish unsourced internet facts as live local evidence."
  - "Do not delete published PSEO URLs without redirect/noindex/rollback policy."
acceptance:
  - probe: run
    command: "site-kernel run surface.evidence.validate --app webgogol-com --blueprint website-local --json"
    expect:
      exitCode: 0
  - probe: run
    command: "site-kernel run surface.duplicate.validate --app webgogol-com --blueprint website-local --json"
    expect:
      exitCode: 0
  - probe: run
    command: "site-kernel run pseo.validate --app webgogol-com --json"
    expect:
      exitCode: 0
---

# RFC-0324: Require local evidence for indexable geo PSEO city pages

## Context

The public audit found that the `website/**` PSEO branch on `webgogol-com` had become a tree of near-identical pages. City pages lacked city facts, intermediate `/deu` and `/deu/bw` levels added no unique substance, related links repeated the same description, and `medianSubstance` reported a healthy value even though the metric mostly counted template volume.

The owner decision is:

1. city-level pages should be made substantive;
2. `/deu` and `/deu/bw` remain navigational but become `noindex,follow`, canonicalized to the trade hub, and excluded from sitemap;
3. `medianSubstance` is recalculated;
4. related-link anchor text varies with city data;
5. no branch pair may have body similarity above 70 percent.

RFC-0274 already created evidence and duplicate gates. This RFC makes the geo-city requirements explicit so future agents do not have to infer them from the audit.

## Problem

Structural PSEO pages can look complete to internal validators while still being thin to search engines and AI readers:

- repeated templates can pass block-count substance scores;
- city routes can be indexable without any local facts;
- intermediate geo levels can duplicate the trade hub and compete with it;
- related links can repeat one description multiple times, creating a visible footprint;
- a single median score can hide branch-level duplicate clusters.

The platform needs a deterministic, source-backed geo policy.

## Decision

Geo PSEO indexability becomes depth-role aware.

For `website-local` and any equivalent geo Blueprint:

1. Intermediate country/state levels that do not have level-specific evidence are navigational pages. They render for users, carry `noindex,follow`, canonicalize to the nearest trade hub, and are excluded from sitemap, llms, Markdown twins, and agent knowledge.
2. City-level pages may be indexable only when they carry at least three source-backed local facts and one city-specific QA.
3. `medianSubstance` is redefined as the median unique token share of generated pages relative to the family template and shared sibling boilerplate, not raw visible-token volume.
4. Duplicate validation fails when any two pages in the same PSEO branch have normalized body similarity above `0.70`, unless an explicit accepted exception marks one page noindex.
5. Related-link labels and descriptions must incorporate target-specific data such as city, region, demand, chamber, or local evidence. Repeating the same trade description for every link is a validation failure.

## Architectural fit

This RFC amends:

- RFC-0195, because GEO/Markdown twin output must exclude navigational noindex levels;
- RFC-0274, because evidence and duplicate gates gain concrete geo thresholds;
- RFC-0317, because canonical URL generation must respect noindex canonicalization and sitemap exclusion.

It keeps the existing PSEO model: generated pages remain block-declarative routes, and validators remain deterministic. It does not introduce LLM scoring.

## Design

### Blueprint policy

Blueprints may declare depth roles:

```yaml
policy:
  depthRoles:
    tradeHub:
      indexability: index
    country:
      indexability: navigation-noindex
      canonicalTarget: tradeHub
      follow: true
      includeInSitemap: false
      geo: off
    state:
      indexability: navigation-noindex
      canonicalTarget: tradeHub
      follow: true
      includeInSitemap: false
      geo: off
    city:
      indexability: evidence-gated
      localEvidence:
        minVerifiedFacts: 3
        minCitySpecificQa: 1
        minUniqueTokenShare: 0.30
        maxBodySimilarityWithinBranch: 0.70
```

Names such as `country`, `state`, and `city` are illustrative. Implementers should bind them to the Blueprint's level identifiers, not hardcoded URL segments.

### Local evidence records

City-level local facts are source-backed records, not generated filler.

Allowed fact classes:

- public authority or chamber region;
- official population or business statistic;
- local demand signal imported through RFC-0280;
- building stock, district, or service-area characteristic from a public source;
- local trust cue from consented Werk/evidence records;
- local operational constraint relevant to the offer.

Each fact must carry:

```yaml
localFacts:
  - id: stuttgart-hwk-region
    text:
      de: "..."
    sourceRef: "external:..."
    asOf: "2026-07-05"
    reviewEvery: P6M
    provenance: external
```

Fetched internet text must be sanitized before an LLM summarizes it. Agents must not publish a found fact until the source binding, `asOf`, and review cadence are present.

### City-specific QA

Each indexable city page needs at least one QA whose answer changes because of the city or region. It may reference the local facts above. It must not be a generic offer FAQ with only the city name inserted.

### Navigational noindex levels

When a generated page resolves to `indexability: navigation-noindex`:

- rendered HTML emits `noindex,follow`;
- canonical URL points to the configured target, usually the trade hub;
- sitemap excludes the page;
- `llms.txt`, `llms-full.txt`, Markdown twins, and agent knowledge exclude it;
- internal links may still point to it when it is needed for user navigation;
- behavior snapshots record the robots/canonical state.

If a later site provides real country/state-level substance, the Blueprint may switch that depth to `evidence-gated` with its own evidence policy.

### Unique substance metric

Replace or extend `medianSubstance` with:

```ts
export interface PseoUniqueSubstanceMetric {
  pageId: string;
  visibleTokenCount: number;
  templateTokenCount: number;
  uniqueTokenCount: number;
  uniqueTokenShare: number; // uniqueTokenCount / visibleTokenCount
}
```

`uniqueTokenCount` excludes:

- tokens from the Blueprint template;
- shared CTA/legal/footer/breadcrumb/chrome text;
- repeated related-link boilerplate;
- known global offer copy reused across every page in the family.

`pseo-manifest.json` should expose median and distribution bands for `uniqueTokenShare`, while retaining old scores only as legacy diagnostics if needed.

### Body similarity threshold

`surface.duplicate.validate` compares normalized rendered body text:

- lowercase;
- strip navigation chrome, breadcrumbs, footer, and structured metadata;
- normalize whitespace and punctuation;
- compare pages within same Blueprint branch and depth first;
- cache token hashes/shingles so large branches do not become quadratic on every run.

Any pair above `0.70` body similarity is an error when both pages are indexable. If one page is `noindex`, the diagnostic may be warning unless it leaks into sitemap/llms/twins.

### Related links

Generated related-link cards must be target-specific.

Invalid pattern:

- six links whose descriptions are byte-identical trade descriptions.

Valid patterns:

- city link mentions target city and one local fact class;
- state/country navigation link says it is an overview, not a duplicate service page;
- demand link mentions target demand or local problem;
- descriptions rotate only because the target data differs, not because of synonym spinning.

`surface.validate` or `pseo.validate` must fail when more than one related-link card on the same page has the same normalized description unless the duplicate is an explicit short label such as a category name.

## Pipeline placement

- `surface.generate` applies depth role policy and robots/canonical decisions.
- `surface.evidence.validate` checks local fact and QA requirements.
- `surface.duplicate.validate` enforces the 70 percent body-similarity threshold.
- `surface.validate` checks related-link diversity.
- `pseo.validate` aggregates the branch verdict.
- `sitemap.generate`, `llms.generate`, and `page.markdown.generate` exclude navigational noindex pages.

## Rollout

1. Add depth-role policy support to the relevant Blueprint schema.
2. Mark `/deu` and `/deu/bw` equivalents as `navigation-noindex` for `website-local`.
3. Add local evidence fields to city records or linked evidence records.
4. Populate `webgogol-com` city pages with at least three source-backed facts and one city-specific QA per indexable city page.
5. Recalculate `medianSubstance` from unique token share.
6. Update related-link generation to use target-specific facts.
7. Regenerate surface artifacts and inspect behavior snapshot diffs before reindexing.

## Alternatives considered

- **Raise the old substance score.** Rejected. Template volume would still count as substance.
- **Use LLM quality review as the gate.** Rejected. LLM review may assist authoring but cannot be a deterministic deploy gate.
- **Noindex the entire branch.** Rejected. The owner decision is to build substantive city pages.
- **Keep intermediate pages indexable until filled.** Rejected. Navigational pages without unique substance should not compete in the index.

## Risks

- **Fact collection takes time.** Accepted. Indexable page count should follow evidence, not route ambition.
- **Similarity threshold false positives.** Mitigated by scoping comparisons by branch/depth and excluding chrome.
- **Noindex/canonical changes are public behavior changes.** Mitigated by behavior snapshot review and RFC-0318 redirect/rollback discipline.
- **Source quality varies.** Mitigated by CKL source binding and review cadence.

## Acceptance criteria

- [x] Intermediate geo levels with no level-specific evidence render `noindex,follow`, canonicalize (evidence: implemented historically) to the trade hub, and are absent from sitemap/llms/Markdown twins.
- [x] Every indexable city-level page has at least three source-backed local facts. (evidence: implemented historically)
- [x] Every indexable city-level page has at least one city-specific QA. (evidence: implemented historically)
- [x] `pseo-manifest.json` reports unique-token-share `medianSubstance`. (evidence: implemented historically)
- [x] `surface.duplicate.validate` fails indexable branch pairs above 70 percent normalized body (evidence: implemented historically) similarity.
- [x] Related-link descriptions vary by target-specific data and do not repeat one trade (evidence: implemented historically) description across a card set.
- [x] `webgogol-com` `website-local` branch passes `surface.evidence.validate`, (evidence: implemented historically) `surface.duplicate.validate`, and `pseo.validate`.
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Do not publish internet-found local facts without source binding, `asOf`, and review cadence.
- Do not use synonym spinning, randomization, or decorative variation to pass duplicate gates.
- Do not include noindex navigation pages in sitemap, llms, Markdown twins, or agent knowledge.
- Review behavior snapshot diffs before any reindexing or IndexNow submission.
