---
id: RFC-0197
title: "Enrich blueprint fields with build-time frozen LLM generation"
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
amendedBy:
  - RFC-0207
related:
  - RFC-0141
  - RFC-0143
  - RFC-0192
  - RFC-0193
  - RFC-0194
commands:
  proposed: []
  added:
    - surface.enrich
    - enrich.validate
  changed: []
  removed: []
appsImpacted:
  - apps/webgogol-com
packagesImpacted:
  - packages/surface
  - packages/content-source
  - packages/os/site-kernel-checks
successSignals:
  - "A Blueprint can declare AI-generated fields (e.g. a per-city local-market paragraph) that are generated once, reviewed, and stored as content — never regenerated per build or per request."
  - "Enriched fields raise substance with provenance: every generated sentence is traceable to its prompt, model, and approval state."
  - "Removing the enrichment provider leaves the site fully buildable from the frozen content."
nonGoals:
  - "Do not call an LLM at request time or during a normal build — generation is an explicit, separate, gated step."
  - "Do not let unreviewed AI text reach production — provenance + approval gate it."
  - "Do not use LLM output in the deterministic substance gate decision (RFC-0194)."
---

# RFC-0197: Enrich blueprint fields with build-time frozen LLM generation

## Context

The legacy backlog (`industry-intelligence-blocks-for-pseo-pages`, `local-marketing-signals-for-pseo-pages`) calls for per-page micro-analytics — a real, location- or industry-specific paragraph that makes a generated page substantively unique rather than a template with a swapped noun. Writing those by hand for thousands of combinations is infeasible; generating them per build is nondeterministic, slow, and risks shipping hallucinations. The ecosystem already has the discipline to do this safely: content flows through the content-source port (RFC-0141), pages have provenance, and the studio runs an AI content pipeline (changelog/audit) under review.

The right model is **generate once, freeze, review, store as content** — so AI raises substance without compromising determinism or trust.

## Problem

- Substance (RFC-0194) needs genuinely unique per-page material; the dataset alone often cannot supply it across every combination.
- Ad-hoc per-build LLM calls would make builds nondeterministic and could ship unreviewed text.
- There is no contract for declaring which Blueprint fields are AI-augmented, how their output is reviewed, or how their provenance is recorded.

## Decision

A Blueprint may declare **enriched fields**: named fields whose values are produced by an explicit, separate `surface.enrich` step (never the normal build, never request time). For each axis tuple in scope, `surface.enrich` calls the configured LLM provider with a Blueprint-declared prompt + the record's structured data, then writes the result as a **content-source entry** carrying provenance (prompt id, model, timestamp, and an `approved` flag). Normal builds read these frozen entries like any other content. Unapproved entries are excluded from production rendering. Removing the enrichment provider does not break the build — frozen content remains. Enriched text contributes to substance only as ordinary rendered content; it never participates in the deterministic substance _decision_.

## Architectural fit

- **RFC-0141:** enriched output is stored and read as content-source entries; the engine and renderer treat it as authored content.
- **RFC-0143:** enriched fields feed the same projection as authored fields.
- **RFC-0192/0193:** enrichment is declared per Blueprint field; the generic provider reads frozen values, never generating at resolve time.
- **RFC-0194:** the substance gate measures resolved content; enriched paragraphs raise substance by _being real content_, but the gate's scoring stays deterministic and never invokes an LLM.
- **Provenance/audit discipline:** every generated string is traceable and review-gated, consistent with the platform's existing AI-content provenance.

## Design

### CLI surface

```sh
# Explicit, separate, rate-limited generation step — NOT part of build.check
pnpm exec site-kernel run surface.enrich --app webgogol-com --blueprint website-local --json
```

### TypeScript contracts

```ts
// Blueprint (RFC-0193) declares enriched fields
export interface EnrichedField {
  field: string;                 // target field name used in the constellation
  promptId: string;             // references a reviewed prompt template
  scopeDepth: number;           // which axis depth this field is generated for
  maxTokens: number;
}

// Frozen content-source entry shape
export interface EnrichedEntry {
  pageId: string;
  field: string;
  value: string;
  provenance: {
    promptId: string;
    model: string;              // e.g. "claude-opus-4-8"
    generatedAt: string;        // ISO
    approved: boolean;          // production-gated
  };
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/src/content/enriched/<blueprint>/{lang}/<pageId>.<field>.md` | Frozen, reviewable AI content (content-source) |
| `packages/ontology/blueprints/prompts/<promptId>.md` | Reviewed prompt templates |

### Output format

```json
{
  "command": "surface.enrich",
  "status": "ok",
  "blueprint": "website-local",
  "generated": 120,
  "skippedExisting": 760,
  "pendingApproval": 120
}
```

### Failure modes

`surface.enrich` is never on the build path; it is run deliberately, is idempotent (skips entries that already exist unless `--regenerate`), and rate-limits provider calls. A normal build that finds an unapproved enriched entry omits that field (graceful) and the page renders without it. An enriched validator fails the build only if an entry is referenced as required by a constellation but is missing or unapproved past a Blueprint-declared grace.

## Rollout

- Ship with one enriched field on `website-local` (a per-city local-market paragraph) behind `approved: false` until reviewed.
- Generation is an onboarding/maintenance activity, run by the studio, not in CI.
- Provider is injected (no SDK in app/section code), consistent with ports & adapters; the default model is the latest Claude.
- New Blueprints opt in by declaring enriched fields + reviewed prompts.

## Alternatives considered

- **Generate per build:** rejected — nondeterministic builds, cost, and hallucination risk on every CI run.
- **Generate at request time:** rejected — defeats static delivery, adds latency and cost, and is unreviewable.
- **Free LLM text with no provenance/approval:** rejected — unreviewed AI text in production is a trust and legal risk; provenance + approval are mandatory.
- **Feed LLM judgement into the substance gate:** rejected — the gate must stay deterministic (RFC-0194); LLM output is content, not a scoring oracle.

## Risks

- **Hallucination / incorrect local claims** in generated paragraphs. Mitigation: an `approved` gate keeps unreviewed text out of production; provenance makes every sentence traceable to its prompt and model for review.
- **Generation cost / scale** across many combinations. Mitigation: `surface.enrich` is idempotent (skips existing), rate-limited, and run as an explicit maintenance step, not in CI.
- **Provider / model drift** (a model is deprecated). Mitigation: the provider is injected, the model is recorded in provenance, and frozen content survives provider removal — the site still builds.
- **Homogeneous AI tone** creating a template footprint. Mitigation: prompts are seeded with each record's specifics, and the deterministic substance gate (RFC-0194) still measures real token uniqueness — bland uniform output scores low and is suppressed.

## Acceptance criteria

- [x] Blueprint `enrichedFields` declaration with prompt id, scope depth, and token cap (+ reviewed prompt at `packages/ontology/blueprints/prompts/local-market-signal.md`) (evidence: packages/ directory, package exists)
- [x] `surface.enrich` generates per-tuple values and writes content-source entries (`src/content/enriched/<bp>/<lang>/`) with full provenance (`promptId`, `model`, `generatedAt`, `approved`) (evidence: implemented historically)
- [x] Generation is idempotent (`--regenerate` to overwrite) and never on the `build.check` path (a standalone command) (evidence: implemented historically)
- [x] Unapproved enriched entries are excluded from production rendering; pages degrade gracefully (verified: approve → 7 blocks incl. localMarket; revert → 6 blocks) (evidence: implemented historically)
- [x] `enrich.validate` checks provenance + approval and joins `apps-check.author` (→ `apps-check.run`) (evidence: implemented historically)
- [x] Provider is injected (no LLM SDK in app/section code; default model documented as the latest Claude — **the pilot ships a deterministic, network-free stub provider** so the mechanism runs without a key) (evidence: implemented historically)
- [x] `AGENTS.md` documents the generate-once-freeze-review model and the no-build-time-LLM rule (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- LLM generation MUST NOT run during a normal build or at request time — only via the explicit `surface.enrich` step.
- Enriched output MUST be stored as content-source entries with provenance and an approval flag; never inline ungoverned AI text.
- Unapproved entries MUST NOT render in production.
- The deterministic substance gate (RFC-0194) MUST NOT call an LLM; enriched text counts only as ordinary rendered content.
- Removing the enrichment provider MUST leave the site fully buildable from frozen content.
