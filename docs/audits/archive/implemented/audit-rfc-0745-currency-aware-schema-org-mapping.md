---
rfcId: RFC-0745
auditId: AUDIT-RFC-0745-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0745

## Verdict: Needs revision

The RFC identifies a real risk (derived prices leaking into Schema.org) but references file paths and functions that do not exist in the codebase. Two separate Schema.org emission paths are active today, and the RFC only addresses one. The validation rule placement in `semantic.ts` (Phase 10) is architecturally wrong for a projection-level check.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **Non-existent file path.** The RFC's file system responsibilities table and TypeScript contracts reference `packages/share/src/astro/seo/schema-org.ts`. This file does not exist. The actual Schema.org generation lives in two separate locations:
   - `packages/pbp/src/compiler/projection.ts` — `generateSchemaOrg()` function (PBP compiler Phase 12)
   - `packages/share/src/semantic/jsonld/organization.ts` — `buildOrganizationNode()` which emits `makesOffer` with `priceSpecification`

2. **Non-existent function.** The TypeScript contract shows `buildOfferingSchemaOrg(offering, options)`. This function does not exist anywhere in the codebase. The existing function is `generateSchemaOrg(graph)` in `projection.ts`, which operates on the whole resolved graph, not individual offerings.

3. **Validation rule placement mismatch.** The RFC places the validation rule in `packages/pbp/src/compiler/semantic.ts`. The existing `semantic.ts` is Phase 10 — entity-level validation (HTML tags, empty strings, locale-in-IDs, legacy keys, sensitive data). Schema.org price validation is a projection-level check (Phase 12) and belongs in or near `projection.ts`, not in entity-level semantic validation.

4. **Example output diverges from current code.** The RFC's example shows `Offer` with both `price: "70.00"` and `priceCurrency: "EUR"`. The current `generateSchemaOrg` in `projection.ts:55-63` emits `priceCurrency` but does NOT emit `price` at all. The RFC doesn't clarify whether it's also adding the `price` field or whether the example is aspirational.

## Axis B — DNA alignment

1. **DNA-16 satisfaction is thin.** The RFC's `satisfies: [DNA-16]` claims alignment with "Semantic layer shares topology with navigation." The Architectural fit section says "Schema.org output is derived from the same page topology" but doesn't explain how this RFC _enforces_ or _protects_ DNA-16 — it constrains price output, which is tangential to topology sharing. The `related: [DNA-16]` would be more accurate than `satisfies: [DNA-16]` unless the RFC explains the enforcement mechanism.

## Axis C — Ecosystem fit

1. **Second Schema.org path not addressed.** `packages/share/src/semantic/jsonld/organization.ts:79-91` emits `makesOffer` with `Offer` nodes containing `priceSpecification.price` (but no `priceCurrency`). This is a separate Schema.org emission path from the PBP compiler projection. The RFC only constrains the PBP compiler path. Both paths need the constraint.

2. **Pipeline placement not specified.** The RFC proposes a validation rule but doesn't name which pipeline step it belongs to (`build.prepare`, `build.check`) or whether it's blocking (fail the build) or advisory (warn). The Failure modes section says "the build fails" but doesn't specify the pipeline step.

3. **Compass sync not addressed.** If the RFC changes Schema.org output contracts, `docs/requirements.xml` or `docs/technology.xml` may need synchronization. The RFC doesn't mention Compass document duties.

## Axis D — Forward-only compliance

No issues. The RFC constrains existing output without adding compatibility layers or dual-paths.

## Axis E — Agent-facing policy

No issues. Standard status gate language. No self-authorizing language. Implementation notes are explicit behavioral rules.

## Axis F — Pragmatism

1. **Always-false option is over-engineered.** The `includeDerivedPrices: false` option is always `false` by design. An always-false option adds API surface without value. A code comment or build-time assertion achieves the same explicitness without speculative generality. If the option is never `true`, it shouldn't exist in the type signature.

2. **Validation rule error code not registered.** The RFC introduces `PBP-SCHEMA-PRICE` error code but doesn't specify whether it goes in `PbpValidationError` (used by the compiler) or a separate validation mechanism. The existing `PbpValidationError` codes in `semantic.ts` are entity-level — a projection-level error code may need a different error type.

## Axis G — Blind spots

1. **Current `generateSchemaOrg` doesn't emit `price`.** The existing code at `projection.ts:55-63` emits `name` and `priceCurrency` only. The RFC's example shows `price: "70.00"`. The RFC doesn't address whether adding the `price` field is part of this RFC's scope or a prerequisite. If `price` is never emitted, the validation rule (checking for derived prices in the `price` field) has nothing to validate.

2. **No false-positive analysis.** The validation rule checks "if a derived price value appears in `price` field." How would a derived price value accidentally appear? The RFC doesn't trace the code path where this could happen. Without understanding the leak vector, the validation rule may be guarding against an impossible scenario.

3. **Edge case: offerings without pricing.** The RFC doesn't consider offerings that have no `pricing` field. The current code falls back to `priceCurrency: ""` (empty string). The RFC's validation rule should specify behavior for this case.

## Questions for the author

1. Which Schema.org emission path does this RFC constrain — the PBP compiler projection (`generateSchemaOrg` in `projection.ts`), the share JSON-LD builder (`buildOrganizationNode` in `organization.ts`), or both? If both, the file system responsibilities table and TypeScript contracts need to reference both paths.

2. Should the validation rule live in `semantic.ts` (Phase 10, entity-level) or in `projection.ts` (Phase 12, projection-level)? The current placement is architecturally inconsistent with the existing separation of concerns in the compiler pipeline.

3. The current `generateSchemaOrg` does not emit the `price` field — only `priceCurrency`. Is adding `price` part of this RFC's scope, or is it expected to be added by another RFC (e.g. RFC-0742)? If `price` is never emitted, what does the validation rule validate?
