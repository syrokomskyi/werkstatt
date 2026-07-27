---
rfcId: RFC-0507
auditId: AUDIT-RFC-0507-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0507

## Verdict: Needs revision

The RFC is well-scoped and addresses real cross-page editorial inconsistencies, but has four missing required sections (V-13), a significant factual gap between the RFC's claims about the current baker behavior and the actual code, and ambiguous validator rule definitions that will cause implementation confusion. The DNA alignment is decorative rather than explained.

## Mechanical validation (rfc.validate)

**Pass with 4 V-13 warnings** — missing required sections:

1. `## Architectural fit`
2. `## Design`
3. `## Acceptance criteria`
4. `## Implementation notes for agents`

The RFC has a `## Implementation notes` section, but the validator expects the exact title `## Implementation notes for agents`.

## Axis A — Structural completeness

- **Missing `## Architectural fit`.** The RFC changes a baker (`bakeRatgeberHub`) and two validators (`ratgeber.hub.validate`, `content.voice.lint`) in `@gogol/site-kernel-checks`, but doesn't explain how this fits the package architecture or pipeline placement.
- **Missing `## Design`.** No TypeScript contracts, CLI surface details, or file system responsibility tables. The RFC describes content changes but doesn't specify the baker's new card shape or the validator rule signatures.
- **Missing `## Acceptance criteria`.** The `successSignals` in frontmatter serve as informal criteria, but the RFC body lacks a formal `## Acceptance criteria` section with checkable `[x]` items. Per V-14, at least 3 acceptance items are required.
- **Missing `## Implementation notes for agents`.** The existing `## Implementation notes` section has the wrong title. The content is also too vague for agent implementation — it describes what changes but not how to make them.
- **`## Decision` mixes multiple decisions.** The section covers hub card fields, `/leistungen/` corrections, `/website/` surface pages, `/notausgang/` alignment, footer reorganization, and `/preis/` canonicality. While the alternatives section justifies keeping them in one RFC, the decision section should be structured as sub-decisions with clear boundaries.
- **`## Rollout` lacks default behavior and new-app compliance.** The steps describe what to do but not what the default behavior is after implementation (e.g., does `ratgeber.hub.validate` fail existing sites? Do existing articles need migration?).

## Axis B — DNA alignment

- **DNA-16 listed but not explained.** DNA-16 is about the semantic layer sharing topology with navigation. The RFC changes hub card display fields, which is a presentation concern, not a semantic topology concern. The RFC body doesn't explain how card field reduction enforces or protects DNA-16.
- **DNA-24 listed but not explained.** DNA-24 is about block-declarative pages. The RFC changes `bakeRatgeberHub` which produces block-declarative pages, but the connection is not articulated — the RFC doesn't explain how the five-field card standard relates to the block-declarative contract.
- **No DNA conflict.** The RFC doesn't conflict with any existing DNA invariant. It amends RFC-0500 (which also satisfies DNA-16 and DNA-24) without superseding it — appropriate for a card field reduction.

## Axis C — Ecosystem fit

- **Package boundaries correct.** All code changes are in `@gogol/site-kernel-checks`, which is where `bakeRatgeberHub`, `ratgeber.hub.validate`, and `content.voice.lint` live. No cross-boundary imports proposed.
- **Command lifecycle consistent.** `commands.changed: [ratgeber.hub.validate, content.voice.lint]` — both are existing registered commands, correctly listed under `changed` rather than `added`.
- **`amends: [RFC-0500]` is reciprocated.** RFC-0500's `amendedBy` already includes RFC-0507. Good.
- **Compass sync not mentioned.** The RFC changes validator rules and baker behavior — this may require updates to `docs/verification-plan.xml` (new rules RG-HUB-09, VOICE-CTA-01) and potentially `docs/requirements.xml`. The RFC doesn't identify which Compass files need synchronization.
- **AGENTS.md updates not mentioned.** The RFC changes `ratgeber-hub-validate.ts` (new rule RG-HUB-09) and `content-voice.ts` (new rule VOICE-CTA-01). The `packages/os/site-kernel-checks/AGENTS.md` module table for `ratgeber-hub-validate.ts` will need updating to mention RG-HUB-09. The RFC doesn't call this out.

## Axis D — Forward-only compliance

- **No compatibility shims.** The RFC directly removes `category` and `summary` from card display — no dual-path or feature flag. Good.
- **Footer link removal is direct.** Widerruf and Muster-Widerrufsformular links are removed, not deprecated. Routes were already removed by RFC-0487. Good.
- **Amends RFC-0500 directly.** The card standard is changed in-place, not parallel interpretation. Good.

## Axis E — Agent-facing policy

- **No self-authorizing language.** The RFC doesn't grant implementation permission while draft. Good.
- **Content authoring vs code changes not distinguished.** The successSignals include content corrections on `/leistungen/digitales-fundament/`, `/website/` surface pages, `/notausgang/`, and footer navigation. These are prose edits that an agent can make, but the RFC doesn't specify the exact content to remove or add — it says "remove or soften claims about guaranteed KI-Auffindbarkeit" without quoting the specific prose to change. An agent implementing this will need to interpret editorial intent, which is a human-authoring boundary.
- **No governance rule references.** The implementation notes don't reference RFC-0224 (accepted→implemented transition) or RFC-0330 (verification evidence).

## Axis F — Pragmatism

- **Scope is appropriately minimal.** The RFC is a patch-level change (removing 2 card fields, adding 2 validator rules, editing content on 4 page areas, footer cleanup). `versionBump: patch` is correct.
- **`nonGoals` are explicit and meaningful.** The RFC clearly excludes URL changes, new pages, blueprint axis changes, JSON-LD emission (RFC-0506), article archetype (RFC-0504), and claim registry (RFC-0505). Good.
- **No unnecessary new commands.** The RFC extends existing commands rather than creating new ones. Good.
- **Mixed concerns justified.** The alternatives section explains why cross-page editorial alignment and hub card fields are in one RFC (same expert review trigger). Acceptable.

## Axis G — Blind spots

- **Critical factual gap: current baker does not render 7 fields.** The RFC states it is "replacing the seven-field RFC-0500 card standard" and removing `category` and `summary`. However, the actual `bakeRatgeberHub` implementation (`packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-hub.ts:180-244`) uses `linkedCardGrid` which renders cards with only `title` and `description` (mapped from `summary`). It does **not** render `articleType`, `question`, `reviewedAt`, or `readTime` on cards at all. The RFC is actually **adding** three fields (articleType, question, reviewedAt, readTime) and **removing** one (summary/description), not removing two from seven. This fundamentally changes the implementation work — the baker needs a new card rendering function that supports these fields, not just removal of two fields.
- **RG-HUB-09 is ambiguous.** The rule says "Hub cards display exactly five fields: title, articleType, question, reviewedAt, readTime. No `category` or `summary` in card props." But the validator (`ratgeber-hub-validate.ts`) currently checks the surface artifact YAML, not rendered HTML. The RFC doesn't specify how the validator determines which fields are "in card props" — the surface artifact stores blocks with `props`, and the RFC needs to specify what block/props shape the validator should check.
- **VOICE-CTA-01 is ambiguous.** The rule says "Ratgeber article pages do not render a full price table — price references are inline calculations only." The RFC doesn't define what constitutes a "full price table" vs "inline calculations." This could cause false positives on articles that use tabular formatting for non-price data.
- **No false-positive estimation.** Neither new rule (RG-HUB-09, VOICE-CTA-01) estimates false-positive rates or describes suppression mechanisms.
- **Footer structure not specified.** The RFC says "group Barrierefreiheit, Open Source, and Bildnachweise under a Transparenz section" but doesn't show the expected navigation structure (section label, order, DE/UK labels).
- **No edge case consideration.** What happens if an article record is missing `articleType`, `question`, `reviewedAt`, or `readTime`? The current baker silently omits missing fields via conditional spreads. The RFC doesn't specify whether the five-field card requires all five fields to be present, or whether missing fields are omitted gracefully.

## Questions for the author

1. The current `bakeRatgeberHub` renders cards with only `title` and `summary` (via `linkedCardGrid`). The RFC says it's removing `category` and `summary` from a seven-field card, but the baker never rendered `articleType`, `question`, `reviewedAt`, or `readTime` on cards. Is the RFC's intent to **add** these three fields to the card rendering (requiring a new card block type or extended `linkedCardGrid`), or to validate that the article records have these fields (which RG-HUB-08 already partially does)?

2. How should `ratgeber.hub.validate` (RG-HUB-09) determine which fields are "in card props"? The validator checks the surface artifact YAML, not rendered HTML. Should it inspect the `blocks[].props` of the `audience-cards` / `linkedCardGrid` blocks on the hub page, or should it check the article entries' metadata directly?

3. What constitutes a "full price table" for VOICE-CTA-01? Should the rule check for HTML `<table>` elements with price-related class names, check for multiple price values in a single block, or use a different heuristic? How does this interact with the existing `ratgeber.hub.validate` RG-HUB-07 (commercial claim restrictions)?
