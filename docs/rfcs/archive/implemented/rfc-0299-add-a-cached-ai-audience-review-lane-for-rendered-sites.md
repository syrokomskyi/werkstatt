---
id: RFC-0299
title: "Add a cached AI audience review lane for rendered sites"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-05
implementedAt: 2026-07-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0074
  - RFC-0203
  - RFC-0233
  - RFC-0279
  - RFC-0293
  - RFC-0294
  - RFC-0297
  - RFC-0298
commands:
  proposed: []
  added:
    - check.audience.profile.validate
    - check.audience.review.run
    - check.audience.review.validate
  changed: []
  removed: []
appsImpacted:
  - check-warpgogol-com
packagesImpacted:
  - "@gogol/check-core"
  - "@gogol/check-runner-node"
  - "@gogol/site-kernel-check-warpgogol"
  - "@gogol/ontology"
successSignals:
  - "AI review evaluates rendered pages against explicit audience profiles, not vague generic taste."
  - "Every AI finding is grounded in evidence graph page text, DOM anchors, screenshots, and optional WGogol hints."
  - "Review results are cached by graph hash, profile hash, prompt hash, model version, and viewport set."
  - "AI findings are warning-class by default and can feed action packs without blocking deploys until explicitly gated."
nonGoals:
  - "Do not let the AI reviewer fetch arbitrary web pages itself."
  - "Do not let AI review approve claims, prices, legal facts, or sourced facts."
  - "Do not replace deterministic checks."
acceptance:
  - probe: command-registered
    name: "check.audience.review.run"
  - probe: command-registered
    name: "check.audience.profile.validate"
  - probe: file-exists
    path: "packages/ontology/check-audiences/handwerk-owner-de.yaml"
---

# RFC-0299: Add a cached AI audience review lane for rendered sites

## Context

The product goal includes questions that deterministic checks cannot answer well:

- Does this page feel trustworthy to the target audience?
- Does each language sound natural for its readers?
- Does the section order answer the visitor's likely doubts?
- Does the page communicate a business value, not only pass technical SEO?

This requires AI judgment, but only in a governed, cached, evidence-grounded lane.

## Problem

Naive LLM review produces vague advice and cannot be repeated reliably. It may hallucinate facts, miss rendered details, or give advice that cannot be mapped to page/section anchors.

## Decision

Add a cached AI audience review lane:

```sh
pnpm exec site-kernel run check.audience.profile.validate --profile handwerk-owner-de --json
pnpm exec site-kernel run check.audience.review.run --run .check-warpgogol/runs/<runId> --profile handwerk-owner-de --json
pnpm exec site-kernel run check.audience.review.validate --run .check-warpgogol/runs/<runId> --json
```

The reviewer receives only the evidence graph, screenshots, deterministic diagnostics, audience profile, and prompt rubric. It never crawls the web directly and never invents factual corrections.

## Architectural fit

- RFC-0074 provides the cached LLM audit pattern.
- RFC-0279 provides the governed reviewer posture: structured verdicts, confidence, grounding, and abstention.
- RFC-0233 defines perceptual checks as warning-first. Audience review follows that policy.
- RFC-0297 converts review diagnostics into action-pack tasks.

## Design

### Audience Profiles

Profiles live in ontology so they can be reused across checks:

```txt
packages/ontology/check-audiences/
  handwerk-owner-de.yaml
  local-service-owner-de.yaml
  nonprofit-donor-de.yaml
  ukrainian-business-owner-de.yaml
```

Shape:

```yaml
id: handwerk-owner-de
version: 1.0.0
displayName: "German Handwerk owner"
languages: [de]
market: DE
reader:
  role: "owner/operator of a local trade business"
  timePressure: high
  trustNeeds:
    - "clear ownership"
    - "no agency lock-in"
    - "price clarity"
    - "local visibility"
rubric:
  valueClarity: 0.25
  trust: 0.25
  actionability: 0.2
  languageNaturalness: 0.2
  visualConfidence: 0.1
forbiddenAdvice:
  - "invent prices"
  - "invent certifications"
  - "recommend manipulative scarcity"
```

### Review Output

AI review emits diagnostics plus per-page scores:

```ts
export interface AudienceReviewResult {
  schemaVersion: "1.0.0";
  runId: string;
  evidenceGraphHash: string;
  profileId: string;
  reviewer: {
    provider: string;
    model: string;
    promptId: string;
    promptHash: string;
  };
  cacheKey: string;
  pageReviews: AudiencePageReview[];
  diagnostics: Diagnostic[];
  summary: {
    strongestPages: string[];
    weakestPages: string[];
    topRepairs: string[];
  };
}
```

### Cache Key

The cache key is:

```txt
sha256(evidenceGraphHash + profileHash + promptHash + modelVersion + viewportSet + deterministicDiagnosticsHash)
```

Cache entries live under:

```txt
.check-warpgogol/cache/audience-review.jsonl
```

### Review Rules

| Rule | Severity | Meaning |
| --- | --- | --- |
| `CW-AUD-01` | warning | Page value proposition unclear for the profile. |
| `CW-AUD-02` | warning | Trust evidence appears too late or is too weak. |
| `CW-AUD-03` | warning | CTA sequence asks for action before resolving likely objections. |
| `CW-AUD-04` | warning | Target-language copy sounds translated or unnatural. |
| `CW-AUD-05` | warning | Section feels visually confusing or overwhelming in screenshot evidence. |
| `CW-AUD-06` | error | Reviewer output schema invalid or ungrounded. |
| `CW-AUD-07` | info | Reviewer abstained because evidence was insufficient. |

Only `CW-AUD-06` is an error by default because it is a harness failure, not a subjective quality judgment.

## Rollout

1. Add audience profile schema and starter profiles.
2. Add prompt templates with pinned prompt ids and output schema.
3. Implement profile validation.
4. Implement cached review run using evidence graph inputs only.
5. Implement review validation.
6. Feed audience diagnostics into reports and action packs.

## Alternatives considered

- **Ask an LLM to review the live URL directly.** Rejected: uncontrolled crawling, unstable evidence, and weak auditability.
- **Make AI score a deploy gate immediately.** Rejected: subjective and uncalibrated; warning-first.
- **One universal audience.** Rejected: business presence quality depends on audience context.

## Risks

- **Vague findings.** Mitigated by schema, required evidence locator, capped diagnostics per page, and action-pack grouping.
- **Cultural overreach.** Mitigated by explicit profiles and no factual invention.
- **Cost.** Mitigated by graph-hash caching and optional execution.

## Acceptance criteria

- [x] Audience profile schema exists and validates starter profiles. (evidence: implemented historically)
- [x] `check.audience.review.run` uses only evidence graph inputs and cached prompt execution. (evidence: implemented historically)
- [x] Invalid AI JSON is retried once and then fails with `CW-AUD-06`. (evidence: implemented historically)
- [x] Every AI diagnostic includes URL and evidence locator data. (evidence: implemented historically)
- [x] AI review is optional in `check.run` and disabled when target policy disallows it. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Do not let AI review write facts or change CKL claims.
- If evidence is insufficient, emit an abstention diagnostic instead of guessing.
- Keep all prompts versioned and hash-included in the cache key.
