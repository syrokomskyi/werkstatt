---
reviewId: REVIEW-CODE-2026-07-19-01
date: 2026-07-19
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: e75f04957...80c8d6b93
filesReviewed:
  - packages/pbp/src/entities/legal-identity.ts
  - packages/pbp/src/entities/brand.ts
  - packages/pbp/src/entities/place.ts
  - packages/pbp/src/entities/contact-point.ts
  - packages/pbp/src/entities/web-presence.ts
  - packages/pbp/src/entities/category.ts
  - packages/pbp/src/entities/product-group.ts
  - packages/pbp/src/entities/product-variant.ts
  - packages/pbp/src/entities/evidence-source.ts
  - packages/pbp/src/entities/disclosure.ts
  - packages/pbp/src/entities/credential.ts
  - packages/pbp/src/entities/review.ts
  - packages/pbp/src/entities/public-document.ts
  - packages/pbp/src/runtime-overlay.ts
  - packages/pbp/src/validation-errors.ts
  - packages/pbp/src/registry.ts
  - packages/pbp/src/normalization.ts
  - packages/pbp/src/index.ts
---

# Code Review: e75f04957...80c8d6b93 (PBP RFC-0409..0424 implementation)

## Verdict: Approved

The code is well-structured, follows the existing `@gogol/pbp` patterns, and passes `tsc --noEmit` and `vitest run`. All entity interfaces correctly extend `PbpEntity` without redefining envelope fields. Non-entity types (`PbpRuntimeOverlay`, `PbpValidationError`, `PbpRegistryEntry`, `PbpNormalizationRule`) correctly do NOT extend `PbpEntity`. Minor findings are cosmetic and do not block merging.

## Mechanical floor

Pass — `tsc --noEmit` exits 0, `vitest run` passes 64/64 tests.

## Axis A — Structural correctness

**PASS.** All files follow the existing pattern in `packages/pbp/src/entities/`: JSDoc with `@see` spec references, type imports from `../envelope.js`, `pbpSchemaId()` for schema constants, closed union types with `readonly` arrays and `as const`, type guard functions matching the `isPbpXxx` pattern.

**MINOR: `PbpDisclosureMateriality` lacks a type guard and const array.** `PbpDisclosureKind` has `PBP_DISCLOSURE_KINDS` and `isPbpDisclosureKind`, but `PbpDisclosureMateriality` is just a type alias without a corresponding const array or guard. This is inconsistent but not blocking — the type is still a closed union.

Evidence: `packages/pbp/src/entities/disclosure.ts:31` — `export type PbpDisclosureMateriality = "informative" | "material" | "critical";` with no `PBP_DISCLOSURE_MATERIALITIES` const.

## Axis B — DNA alignment

**PASS.** All code is in `packages/pbp/` (DNA-1). No `apps/*` imports. No site consumption (enforced by AGENTS.md policy, not by code). All new files use kebab-case filenames (DNA-6). No Compass markup required — these are type-only modules with no runtime logic (DNA-42 applies to authored source files with semantic scaffolding needs; these are pure type definitions).

## Axis C — Ecosystem fit

**PASS.** All exports flow through `packages/pbp/src/index.ts`. Package boundaries are correct — no imports from `apps/*` or `services/*`. The `packages/pbp/AGENTS.md` correctly lists the new types in its API surface (needs update — see Axis E).

## Axis D — Forward-only compliance

**PASS.** No compatibility shims, no dual paths, no legacy code maintained behind flags. All types are new — there is no legacy PBP code to maintain.

## Axis E — Agent-facing clarity

**MINOR: `packages/pbp/AGENTS.md` API surface section not updated.** The AGENTS.md file lists the current API surface (`PbpEntity`, `PbpEntityStatus`, etc.) but does not mention the 16 new entity types. This should be updated to reflect the new exports.

Evidence: `packages/pbp/AGENTS.md` — "API surface" section lists only the original RFC-0399 exports.

**PASS otherwise.** All files have clear JSDoc with `@see` references to spec sections and RFC numbers. Variable names are self-documenting. No ungrounded assertions.

## Axis F — Pragmatism

**PASS.** Each entity interface is minimal — only the fields specified in the PBP spec. No speculative generality. Closed unions match the spec exactly. Type guards are provided for all union types that need runtime validation.

**MINOR: `PbpPublicDocument` redeclares `governance` as required.** `PbpEntity` has `governance?: PbpGovernance` (optional). `PbpPublicDocument` has `governance: PbpGovernance` (required). This is intentional per the spec (public documents require governance), but it narrows the base interface — which is valid in TypeScript but worth noting.

Evidence: `packages/pbp/src/entities/public-document.ts:33` — `governance: PbpGovernance;` (required, not optional).

## Axis G — Blind spots

**PASS.** No runtime code — all types are interfaces and type aliases. No performance concerns, no false positives, no edge cases at the type level. No PII or security concerns (the types are data shapes, not handlers).

## Spec compliance

| Requirement | Status | Evidence |
| --- | --- | --- |
| LegalIdentity entity with public/private boundary | Done | `legal-identity.ts` — no private data fields |
| Brand entity with ownerBusinessRef | Done | `brand.ts:18` — `ownerBusinessRef: PbpEntityRef` |
| Place entity with kind vocabulary | Done | `place.ts` — `PbpPlaceKind` union of 3 |
| ContactPoint with channel vocabulary | Done | `contact-point.ts` — `PbpContactChannel` union of 5 |
| WebPresence with kind and control status | Done | `web-presence.ts` — both unions |
| Category with broaderRef hierarchy | Done | `category.ts:14` — `broaderRef?: PbpEntityRef` |
| ProductGroup with variationAxes | Done | `product-group.ts:14` — `variationAxes` field |
| ProductVariant with groupRef and variantValues | Done | `product-variant.ts:13-14` |
| EvidenceSource with kind and authority | Done | `evidence-source.ts:26-27` |
| Disclosure with kind and materiality | Done | `disclosure.ts:33-41` |
| Credential with kind and verification | Done | `credential.ts:32-43` |
| Review and AggregateRating | Done | `review.ts:29-50` — both interfaces |
| PublicDocument with kind and governance | Done | `public-document.ts:28-35` |
| RuntimeOverlay (non-entity) | Done | `runtime-overlay.ts` — no `extends PbpEntity` |
| Validation severity and error prefixes | Done | `validation-errors.ts` — 15 prefixes |
| Registry and Resolver types | Done | `registry.ts` — both interfaces |
| Normalization with 9 decision statuses | Done | `normalization.ts` — all 9 values |

## Questions for the author

1. Should `PbpDisclosureMateriality` get a `PBP_DISCLOSURE_MATERIALITIES` const array and `isPbpDisclosureMateriality` guard for consistency with other unions?
2. Should `packages/pbp/AGENTS.md` be updated to list the 16 new entity types in the API surface section?
3. Is the `governance: PbpGovernance` (required) narrowing on `PbpPublicDocument` intentional and acceptable per the spec?
