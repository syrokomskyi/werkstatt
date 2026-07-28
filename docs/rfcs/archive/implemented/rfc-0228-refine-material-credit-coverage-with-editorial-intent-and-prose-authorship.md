---
id: RFC-0228
title: "Refine material credit coverage with editorial intent and prose authorship"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-21
updatedAt: 2026-06-21
implementedAt: 2026-06-21
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0231
related:
  - RFC-0166
  - RFC-0167
  - RFC-0211
  - RFC-0218
  - RFC-0220
commands:
  proposed: []
  added: []
  changed:
    - material.credits.validate
    - material.credits.report
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/site-kernel-checks"
successSignals:
  - "A purely decorative background or UI-chrome image is classified as decorative and does not require a credit record or render a disclosure, removing today's hero-bg/footer-bg noise."
  - "An editorial/published image that a human marks (or a section contract defaults to editorial) requires a credit and fails validation when missing."
  - "A long-form prose/article page — especially an AI-generated one — requires an authorship credit record, closing the RFC-0220 prose gap."
  - "`material.credits.report` shows coverage by intent (editorial required, decorative excluded, prose required) so an agent can see what is and is not gated."
nonGoals:
  - "Does not change the credit record schema's role/party model (RFC-0220) beyond an intent marker."
  - "Does not auto-classify intent with heuristics alone; the default is conservative and human-overridable."
  - "Does not add embedded metadata (RFC-0226) or page-graph linking (RFC-0227)."
  - "Does not retroactively force credits on already-published decorative assets."
---

# RFC-0228: Refine material credit coverage with editorial intent and prose authorship

## Context

RFC-0220's `material.credits.validate` discovers media via `media.source.name` and images via a fixed `IMAGE_TOKEN_KEYS` allowlist (`backgroundImage`, `image`, `imageName`, `photo`, `portraitImage`, `src`) across the `pages`, `business`, and `site` domains. Two consequences emerged in the pilot:

1. **Decorative noise.** `hero-bg` and `footer-bg` are pure decoration but were swept into the credited set and now carry credit records and disclosure rows, which RFC-0220 itself flagged as a UI-clutter and false-positive risk.
2. **Prose gap.** Long-form article/prose pages are not discovered as creditable materials. RFC-0220's acceptance criterion mentioned article/prose, but enforcement only covers media and image tokens. As AI-generated blog content (RFC-0167) grows, undisclosed AI authorship of prose is exactly the provenance gap the initiative set out to close.

## Problem

The discovery model is a single global heuristic that is simultaneously too broad (credits decoration) and too narrow (ignores prose). It cannot distinguish _editorial/published_ material that owes attribution from _decorative/chrome_ material that does not, and it has no notion of page-level authorship for prose.

## Decision

Introduce an explicit **editorial intent** dimension and a **prose authorship** requirement.

- **Intent marker.** A material may be marked `editorial` (requires a credit) or `decorative` (excluded). The marker can be set per image on a section/component contract or per token; the default for an undiscovered ambient/background key is `decorative`, and the default for content/lead/portrait imagery is `editorial`. Human marking always overrides the default.
- **Validator behavior.** `material.credits.validate` requires credits only for `editorial` materials and never flags `decorative` ones. This replaces the blanket `IMAGE_TOKEN_KEYS` requirement with an intent-driven gate (the key list may still seed the default classification).
- **Prose authorship.** A prose/article page (RFC-0166 build-time markdown, RFC-0167 blog) requires a page-level credit record describing authorship, including AI roles when the prose is AI-generated/assisted. Missing prose authorship is a `missing-prose-credit` failure.
- **Reporting.** `material.credits.report` groups discovered materials by intent and surfaces required-vs-excluded counts.

## Architectural fit

- **RFC-0220.** Extends the same validator/report and the same record schema (adds an optional `intent` marker); no new package or render path. The disclosure simply does not render for decorative materials.
- **RFC-0166 / RFC-0167.** Prose/article pages become first-class creditable materials, so AI-authored blog posts disclose authorship the same way media does.
- **RFC-0211 / RFC-0218 (CKL).** Prose authorship is provenance, not a market claim; AI authorship uses the existing AI roles and must be human-confirmed, never invented.

## Design

- Schema: optional `target.intent: "editorial" | "decorative"` (absent ⇒ default by domain/key).
- Section/component contract: an image slot may declare `creditIntent`, threaded like the existing `credit` prop, so a section can mark its background decorative without a per-app sidecar.
- New failure modes: `missing-prose-credit` (fail), and `decorative-credit-present` (warn) when a record marks `decorative` yet a disclosure is forced.

## Rollout

1. Add the optional `intent` marker and the conservative domain/key defaults; existing records stay valid.
2. Switch `material.credits.validate` from the blanket `IMAGE_TOKEN_KEYS` requirement to the intent-driven gate; verify pilot `hero-bg`/`footer-bg` drop out of the required set.
3. Add prose/article authorship discovery and the `missing-prose-credit` failure, warn-only for one build, then fail-hard.
4. Extend `material.credits.report` with by-intent grouping.

## Alternatives considered

- **Pure heuristic classification.** Rejected: heuristics alone repeat today's false positives; a conservative default plus human override is more honest.
- **Separate decorative and prose into two RFCs.** Rejected: both are the same "which materials owe a credit" coverage question and share the validator/report surface.
- **Suppress decorative via an ignore-list per app.** Rejected: an intent marker on the contract/record is reusable and self-documenting, unlike a per-app denylist.

## Risks

- **Mis-defaulting.** A conservative default (ambient/background ⇒ decorative, content/lead ⇒ editorial) reduces noise but could under-credit a meaningful background. Human override and the report mitigate this.
- **Prose burden.** Requiring prose authorship adds author work; mitigated by a single page-level record and by AI roles that make AI-generated authorship explicit rather than hidden.
- **Scope creep with RFC-0227.** Coverage (this RFC) and graph-linking (RFC-0227) are intentionally separate so each lands independently.

## Acceptance criteria

- [x] A material can be marked `editorial` or `decorative`, via record and via section/component contract, with conservative domain/key defaults. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `material.credits.validate` requires credits only for `editorial` materials and never flags `decorative` ones; pilot `hero-bg`/`footer-bg` no longer require records unless marked editorial. (evidence: implemented historically)
- [x] A prose/article page requires an authorship credit record; missing authorship fails with `missing-prose-credit`. (evidence: implemented historically)
- [x] AI-generated/assisted prose discloses AI authorship via the existing AI roles. (evidence: implemented historically)
- [x] `material.credits.report` groups materials by intent with required/excluded counts. (evidence: implemented historically)
- [x] `apps-check.run` passes on both apps after the change. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 once criteria are verified and committed.
- Agents MUST NOT mark editorial material decorative to dodge a missing credit.
- Agents MUST NOT invent prose authorship or AI participation; use `NEED_THIS_*` until a human confirms.
- Agents MUST reference RFC-0228 in commits that implement this contract.
