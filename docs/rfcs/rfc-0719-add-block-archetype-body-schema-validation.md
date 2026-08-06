---
id: RFC-0719
title: "Add block archetype body.kind schema validation to page.block.validate"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
implementedAt: 2026-08-06
enhancedAt: 2026-08-06
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-24
  - RFC-0047
  - RFC-0103
satisfies:
  - DNA-24
versionBump: patch
commands:
  proposed: []
  added:
    - page.block.validate
  changed:
    - page.block.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "page.block.validate fails when a block's body.kind does not match the archetype's declared body schema"
  - "page.block.validate fails when a block's body is missing required fields for its body.kind"
  - "Existing valid blocks continue to pass validation without changes"
nonGoals:
  - "Does not validate block props beyond body — props validation is a separate concern (B-03)"
  - "Does not validate section components — only block-declarative page content"
  - "Does not add runtime validation — this is build-time only"
  - "Does not add hardcoded Zod schemas for body kinds — the existing JSON Schema fragments in packages/ontology/src/shared-section-props/body-fragments.ts are the single source of truth"
---

# RFC-0719: Add block archetype body.kind schema validation to page.block.validate

## Context

This RFC documents and formalizes the existing B-07 check in `page.block.validate` that validates `body.kind` against the archetype's declared `bodyKind`. The check was implemented during RFC-0708/RFC-0715 work and is already live in `packages/os/site-kernel-checks/src/page-block.ts`. This RFC satisfies DNA-24 (block-declarative pages) by ensuring `page.block.validate` provides a specific, actionable diagnostic for body kind mismatches.

## Problem

During RFC-0708/RFC-0715 implementation, a `transparency` block used `body.kind: paragraphs` but the `transparency-section.astro` component expected `body.items` (from a `list` body kind). This caused an Astro build failure that was only caught at build time, not at content validation time.

The root cause: `page.block.validate` validated block `props` against the composed JSON Schema (B-03), but the `body.kind` field — which determines the shape of `body` data — was not explicitly cross-referenced with the archetype's declared `bodyKind`. While B-03's strict JSON Schema validation (`additionalProperties: false`) would eventually catch shape mismatches, the error messages were generic ("extra key not allowed" or "required field is missing") and did not name the body kind mismatch as the root cause. A dedicated B-07 diagnostic provides a clear, actionable error: "body.kind does not match expected bodyKind from section manifest".

## Architectural fit

### DNA-24 alignment

DNA-24 (Block-declarative pages) establishes that every `blocks[].type` is a `PlanetName` and that `page.block.validate` enforces the block structure contract. This RFC extends `page.block.validate` with a B-07 check that validates `body.kind` against the archetype's declared `bodyKind`, directly enforcing DNA-24's block structure contract at validation time rather than at Astro build time.

### RFC-0103 body kind system

RFC-0103 established the closed enum of body kinds (`list`, `split-list`, `stats`, `cards`, `paragraphs`, `comparison`, `rich`, `composite`) and the JSON Schema fragments in `packages/ontology/src/shared-section-props/body-fragments.ts`. Each non-composite archetype declares a `bodyKind` in its archetype YAML and composes the matching `body-{kind}` fragment via `propsSchema.compose`. This RFC ensures `page.block.validate` cross-references the block's `body.kind` with the archetype's declared `bodyKind` through the composed schema.

### Existing validation layers

- **`section.body.contract.validate`** (BODY-01..02) — validates that archetype YAMLs declare `bodyKind` and compose the matching `body-{kind}` fragment. This is the archetype-side check.
- **`page.block.validate` B-03** — validates block `props` against the composed JSON Schema (strict, `additionalProperties: false`). This catches body shape violations generically.
- **`page.block.validate` B-07** (this RFC) — validates that the block's `body.kind` matches the `const` value in the composed schema's `body.properties.kind` field. This provides a specific, actionable diagnostic for body kind mismatches.

## Decision

Add a B-07 check to `page.block.validate` that validates `body.kind` against the archetype's declared body schema by extracting the `const` value from the composed JSON Schema's `body.properties.kind` field.

The check does **not** introduce new Zod schemas or a hardcoded `bodySchemaByKind` map. The existing JSON Schema fragments in `packages/ontology/src/shared-section-props/body-fragments.ts` remain the single source of truth for body shape contracts. The B-07 check reads the expected `body.kind` dynamically from the composed schema — no hardcoded mapping is needed.

## Design

### B-07 check implementation

In `packages/os/site-kernel-checks/src/page-block.ts`, after the B-03 props validation, the B-07 check:

1. Extracts the `body` property from the composed JSON Schema (`schemaDef.propsSchema.properties.body`)
2. Reads the `const` value from `body.properties.kind` — this is the expected `bodyKind` declared by the archetype's `body-{kind}` fragment
3. Reads the actual `body.kind` from the block's section props (after stripping `UNIVERSAL_BLOCK_PROPS`)
4. If both are present and they differ, emits a B-07 violation

```ts
const bodySchema = (schemaDef.propsSchema as JsonSchemaObject).properties?.body as
  JsonSchemaObject | undefined;
const expectedBodyKind = bodySchema?.properties?.kind as { const?: string } | undefined;
const actualBody = sectionProps.body as Record<string, unknown> | undefined;
const actualBodyKind =
  actualBody && typeof actualBody.kind === "string" ? actualBody.kind : undefined;
if (
  expectedBodyKind?.const &&
  actualBodyKind &&
  expectedBodyKind.const !== actualBodyKind
) {
  violations.push(
    `${blockPath}: B-07 body.kind="${actualBodyKind}" does not match expected bodyKind="${expectedBodyKind.const}" from section manifest`,
  );
}
```

### Composite archetype handling

Composite archetypes (`bodyKind: composite`) do not compose a `body-*` fragment — they own their bespoke layout. The composed schema for a composite archetype has no `body.properties.kind.const` field. The B-07 check implicitly skips composite archetypes: `expectedBodyKind?.const` is `undefined`, so the condition is false and no violation is emitted. Body validation for composite archetypes is handled by B-03's strict JSON Schema validation.

### Edge case: missing body

When a block has no `body` field at all, `actualBodyKind` is `undefined`. The B-07 check does not fire (the condition requires both `expectedBodyKind?.const` and `actualBodyKind` to be present). The missing `body` field is caught by B-03's `required` field validation in the composed schema.

### Diagnostic code

- `B-07` — `body.kind` does not match the expected `bodyKind` from the section manifest (error)

This follows the existing `B-01`..`B-06` naming convention in `page-block.ts`.

### No hardcoded body kind schemas

The RFC does **not** introduce a `bodySchemaByKind` map or new Zod schemas in `page-block-validate.ts`. The existing JSON Schema fragments (`BODY_LIST_FRAGMENT`, `BODY_PARAGRAPHS_FRAGMENT`, `BODY_CARDS_FRAGMENT`, etc.) in `packages/ontology/src/shared-section-props/body-fragments.ts` are composed into each section manifest's `propsSchema` via `composeManifestPropsSchema()`. The B-07 check reads the expected kind dynamically from the composed schema. Adding a new body kind requires only adding a new fragment to `body-fragments.ts` and referencing it in the archetype's `propsSchema.compose` — no changes to `page-block.ts` are needed.

## Rollout

### Default behavior

The B-07 check is additive — it runs after B-03 and does not modify B-03's behavior. Existing valid blocks pass without changes because their `body.kind` already matches the archetype's declared `bodyKind` (otherwise B-03 would have caught the shape mismatch).

### Adoption path for existing sites

Existing sites do not require migration. The B-07 check only fires when `body.kind` differs from the archetype's declared `bodyKind` — a condition that B-03 already catches generically. B-07 provides a more specific diagnostic, not a new gate.

### New-app compliance

New sites are automatically compliant — the B-07 check runs as part of `page.block.validate` in the `build.check` pipeline. No additional configuration is needed.

## Alternatives considered

1. **Hardcoded Zod schemas in `page-block-validate.ts`** — Rejected. Duplicates the existing JSON Schema fragments in `body-fragments.ts`, creating a second source of truth for body shape contracts. Adding a new body kind would require editing both the fragment and the hardcoded map. The existing dynamic approach (reading `const` from composed schema) requires no hardcoded map.

2. **Extend `section.body.contract.validate` instead of `page.block.validate`** — Rejected. `section.body.contract.validate` validates archetype YAMLs (the archetype side), not page content entries (the block side). The body kind mismatch occurs when a content author writes `body.kind: paragraphs` for a block whose archetype declares `bodyKind: list` — this is a page-level error, not an archetype-level error.

3. **Rely solely on B-03 strict JSON Schema validation** — Considered but insufficient. B-03 catches body shape mismatches via `additionalProperties: false` and `required` fields, but the error messages are generic ("extra key not allowed" or "required field is missing"). B-07 provides a specific, actionable diagnostic that names the body kind mismatch as the root cause, guiding agents and content authors to the fix.

## Risks

- **False positives for custom archetypes**: Custom archetypes with non-standard body kinds are not possible in this ecosystem — `archetypeBodyKindSchema` in `section-archetype.ts` is a closed enum of 8 values. An unknown `body.kind` is always invalid (caught by B-03's `additionalProperties: false`). B-07 does not introduce new false positives.

- **Agent misinterpretation**: Agents might confuse B-07 (body.kind mismatch) with B-03 (props schema violation). The B-07 diagnostic message explicitly names `body.kind` and the expected `bodyKind` from the section manifest, making the fix clear: change `body.kind` to match the archetype's declared `bodyKind`.

- **Performance**: The B-07 check is O(1) per block — a const lookup in the composed JSON Schema. No additional file I/O or parsing. The composed schema is already loaded by B-03; B-07 reuses it.

## Acceptance criteria

- [x] `page.block.validate` emits a B-07 violation when a block's `body.kind` does not match the archetype's declared `bodyKind` from the composed JSON Schema (evidence: `packages/os/site-kernel-checks/src/page-block.ts:341-349`, test `rfc-0719-body-kind-validate.test.ts` test case 2)
- [x] `page.block.validate` does not emit B-07 for composite archetypes (no `body.properties.kind.const` in composed schema) (evidence: `page-block.ts:342` — `expectedBodyKind?.const` is undefined for composite, test case 3)
- [x] `page.block.validate` does not emit B-07 when `body` is missing (B-03 catches this via `required` fields) (evidence: `page-block.ts:340-341` — `actualBodyKind` is undefined when body absent, test case 4)
- [x] Existing valid blocks continue to pass validation without changes (evidence: test case 1 — body.kind: list with items passes, full test suite 867 passed)
- [x] B-07 diagnostic message includes the actual `body.kind`, the expected `bodyKind`, and the section manifest source (evidence: `page-block.ts:347` — `B-07 body.kind="${actualBodyKind}" does not match expected bodyKind="${expectedBodyKind.const}" from section manifest`)
- [x] No new Zod schemas or hardcoded `bodySchemaByKind` map are introduced in `page-block.ts` (evidence: `page-block.ts:332-349` — reads `const` dynamically from composed JSON Schema, no hardcoded map)

## Implementation notes for agents

- The B-07 check is implemented in `packages/os/site-kernel-checks/src/page-block.ts` after the B-03 props validation block.
- The check reads `expectedBodyKind` from `schemaDef.propsSchema.properties.body.properties.kind.const` — this is the `const` value set by the `body-{kind}` fragment in the composed schema.
- The check reads `actualBodyKind` from `sectionProps.body.kind` (after stripping `UNIVERSAL_BLOCK_PROPS`).
- The check only fires when both `expectedBodyKind?.const` and `actualBodyKind` are present and differ. This implicitly skips composite archetypes (no `body-*` fragment composed) and missing body fields (caught by B-03).
- The MODULE_CONTRACT in `page-block.ts` documents B-07 as: "body.kind matches the body fragment's declared kind in the composed propsSchema (RFC-0719)".
- The CHANGE_SUMMARY in `page-block.ts` records: "RFC-0719: add B-07 body.kind mismatch check for clearer diagnostics."

## Consequences

- **Positive:** Body kind mismatches are caught at validation time with a specific, actionable diagnostic — not during Astro build with a generic render error.
- **Positive:** Agents get structured feedback: the diagnostic names `body.kind`, the expected `bodyKind`, and the section manifest source.
- **Positive:** No new schemas or hardcoded maps — the check reads dynamically from the existing composed JSON Schema.
- **Negative:** None identified. The check is additive and does not change existing B-01..B-06 behavior.

## Evolution

As new body kinds are introduced (e.g., `timeline`, `gallery`), their JSON Schema fragments are added to `body-fragments.ts` and referenced in archetype `propsSchema.compose`. The B-07 check automatically picks up the new `const` value from the composed schema — no changes to `page-block.ts` are needed. The archetype registry already owns the body kind schemas declaratively via the fragment system.
