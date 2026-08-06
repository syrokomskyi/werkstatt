---
rfcId: RFC-0719
auditId: AUDIT-RFC-0719-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0719

## Verdict: Needs revision

The RFC's core idea (validate `body.kind` against the archetype's declared body schema) is sound and already partially implemented in the codebase, but the design section proposes hardcoded Zod schemas with wrong field names that duplicate and contradict the existing JSON Schema fragment system in `packages/ontology/src/shared-section-props/body-fragments.ts`. The RFC also fails mechanical validation (V-24 error: empty `satisfies[]`) and is missing 7 required sections.

## Mechanical validation (rfc.validate)

Fail — 1 error, 8 warnings:

- **V-24 (error)**: architecture RFC created 2026-08-06 (>= 2026-07-07) must declare at least one DNA invariant in `satisfies` (RFC-0331). `satisfies: []` is empty but `related` lists DNA-24 — it should be in `satisfies`.
- **V-20 (warning)**: unknown frontmatter key `supersedesBy` — should be `supersededBy` (spelling).
- **V-13 (warning)**: missing required sections: `## Problem`, `## Architectural fit`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Acceptance criteria`, `## Implementation notes for agents`.

## Axis A — Structural completeness

1. **Missing 7 required sections** (V-13): `## Problem`, `## Architectural fit`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Acceptance criteria`, `## Implementation notes for agents`. The RFC uses `## Context` and `## Decision` instead of `## Problem` and `## Architectural fit`.

2. **No acceptance criteria** — The RFC has no `## Acceptance criteria` section. Without checkable criteria, `fo-idea-implement` cannot verify the implementation.

3. **No rollout section** — The RFC doesn't describe how existing sites transition to compliance: do they pass without changes, or is there a migration window?

4. **No alternatives considered** — The RFC doesn't discuss why extending the existing JSON Schema fragment system is insufficient vs. adding new Zod schemas.

5. **No risks section** — The RFC doesn't address false-positive rate for custom archetypes or agent misinterpretation risk.

6. **No implementation notes for agents** — No behavioral rules for agents writing block content.

## Axis B — DNA alignment

1. **`satisfies: []` is empty** (V-24 error). The RFC references DNA-24 in `related[]` but doesn't list it in `satisfies[]`. DNA-24 (Block-declarative pages) is the invariant this RFC enforces — it belongs in `satisfies`.

2. **DNA-24 relationship is real** — DNA-24 establishes that `blocks[].type` is a `PlanetName` and `page.block.validate` enforces the contract. This RFC extends `page.block.validate` with body.kind validation, directly enforcing DNA-24's block structure contract.

## Axis C — Ecosystem fit

1. **RFC design duplicates existing JSON Schema fragments** — The RFC proposes hardcoded Zod schemas (`paragraphBodySchema`, `listBodySchema`, `cardsBodySchema`) in `page-block-validate.ts`. But the codebase already has canonical JSON Schema fragments for all 7 body kinds in `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/ontology/src/shared-section-props/body-fragments.ts:24-182` (`BODY_LIST_FRAGMENT`, `BODY_PARAGRAPHS_FRAGMENT`, `BODY_CARDS_FRAGMENT`, etc.). These fragments are composed into each section manifest's `propsSchema` via `composeManifestPropsSchema()` and already validated by the existing B-03 check in `page-block.ts`. Adding separate Zod schemas creates a second source of truth for body shape contracts.

2. **RFC's Zod schemas have wrong field names** — The proposed schemas don't match the existing fragments:
   - `paragraphBodySchema` uses `text: z.string().min(1)` — the actual fragment (`BODY_PARAGRAPHS_FRAGMENT`, line 114-127) uses `paragraphs: array of { type: "string", minLength: 1 }`.
   - `listBodySchema` uses `items: array of { label?, value }` — the actual fragment (`BODY_LIST_FRAGMENT`, line 24-40) uses `items: array of StandardListItem` (`{ text, icon? }`).
   - `cardsBodySchema` uses `cards: array of { title, body }` — the actual fragment (`BODY_CARDS_FRAGMENT`, line 94-111) uses `cards: array of StandardCard` with different fields.

3. **RFC covers only 3 of 7+1 body kinds** — The RFC proposes schemas for `paragraphs`, `list`, `cards`. The ecosystem has 7 non-composite body kinds (`list`, `split-list`, `stats`, `cards`, `paragraphs`, `comparison`, `rich`) plus `composite`. The RFC is incomplete.

4. **B-07 already exists in the codebase** — `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-checks/src/page-block.ts:332-349` already implements a B-07 check that validates `body.kind` by extracting the `const` value from the composed JSON Schema's `body.properties.kind.const` field. The MODULE_CONTRACT (line 14) and CHANGE_SUMMARY (line 23) already reference RFC-0719. The implementation exists but the RFC design doesn't match it.

5. **Diagnostic codes don't follow convention** — The RFC proposes `BLOCK-BODY-01` and `BLOCK-BODY-02`. The existing `page-block.ts` uses `B-01`..`B-07` (line 8-14). The existing B-07 check uses the `B-07` code, not `BLOCK-BODY-02`.

6. **Command lifecycle is consistent** — `commands.changed: [page.block.validate]` is correct: this is an existing registered command being extended, not a new command.

## Axis D — Forward-only compliance

No issues. The RFC does not propose backward compatibility layers or dual paths. The existing B-03 props validation continues; B-07 is an additive check.

## Axis E — Agent-facing policy

1. **No status gate violation** — The RFC is `draft` and does not contain self-authorizing language.

2. **No NEEDS CLARIFICATION markers** — No unresolved markers found.

3. **No anti-fabrication issues** — The RFC is a code validation change, not content authoring.

4. **No storage policy issues** — No persistence changes.

## Axis F — Pragmatism

1. **Hardcoded Zod schemas vs. existing JSON Schema system** — The RFC proposes a new `bodySchemaByKind` map hardcoded in the validator. The existing system already composes body schemas dynamically from manifest `propsSchemaCompose` references. The RFC's approach is less maintainable: adding a new body kind requires editing both the fragment in `body-fragments.ts` AND the `bodySchemaByKind` map. The existing approach (B-07) reads the composed schema dynamically — no hardcoded map needed.

2. **`section.body.contract.validate` already exists** — `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-checks/src/section-framework/body.ts:24-81` (`runSectionBodyContractValidate`) already validates that archetype YAMLs declare `bodyKind` and that the matching `body-{kind}` fragment is in `propsSchema.compose`. The RFC doesn't acknowledge this existing validation layer.

3. **Scope is narrow** — `packagesImpacted` lists only `@warpgogol/site-kernel-checks`. If the RFC extends the archetype registry (as suggested in "Archetype registry integration"), `@warpgogol/ontology` should be listed too.

## Axis G — Blind spots

1. **Performance** — The RFC doesn't discuss the cost of the new validation. The existing B-07 check is O(1) per block (const lookup in composed schema). The RFC's proposed Zod `.parse()` per block would be O(n) but still cheap. No issue, but not documented.

2. **False positives** — The RFC says unknown body kinds emit a warning (BLOCK-BODY-01). But the existing system has a closed enum of 8 body kinds (`archetypeBodyKindSchema` in `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/ontology/src/schemas/section-archetype.ts:44-53`). An unknown body kind is always invalid, not a warning. The RFC's warning behavior is too lenient.

3. **Composite archetypes** — The RFC doesn't address how `bodyKind: composite` archetypes (hero, people, markdown, etc.) are handled. Composite archetypes don't compose a `body-*` fragment — they own their bespoke layout. The existing B-07 check skips them (no `body.properties.kind.const` in composed schema). The RFC should document this.

4. **Edge case: missing body** — The RFC doesn't specify what happens when a block has no `body` field at all. The existing B-03 check catches this via `required` fields in the composed schema, but the RFC should clarify.

## Questions for the author

1. **Why propose new Zod schemas when the existing B-07 check already validates body.kind via the composed JSON Schema?** The implementation in `page-block.ts:332-349` already exists and works. Should the RFC document the existing implementation rather than propose a divergent design?

2. **Why do the proposed Zod schemas use different field names than the existing JSON Schema fragments?** `paragraphBodySchema.text` vs `BODY_PARAGRAPHS_FRAGMENT.paragraphs`, `listBodySchema.items[].value` vs `BODY_LIST_FRAGMENT.items[].text`. If new schemas are needed, they must match the existing fragment field names.

3. **How are composite archetypes handled?** The RFC's `bodySchemaByKind` map has no entry for `composite`. Should the validator skip body validation for composite archetypes, or should it validate their bespoke body schemas?
