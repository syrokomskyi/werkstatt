---
rfcId: RFC-0736
auditId: AUDIT-RFC-0736-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0736

## Verdict: Needs revision

The RFC defines a clean, well-scoped entity with correct DNA alignment and forward-only compliance. However, the Zod schema deviates from the established `pbpEntitySchema.extend({...}).strict()` pattern used by all existing PBP entity schemas, and the file system responsibilities omit registration in the `pbpSchemaById` registry and `pbpEntityDiscriminatedUnion`. These are fixable structural gaps that will cause implementation friction.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **Zod schema does not extend `pbpEntitySchema`.** The RFC defines `pbpCurrencyPricingPolicySchema` as a standalone `z.object({...})` (line 130–138). All existing entity schemas follow the pattern `pbpEntitySchema.extend({...}).strict()` (see `packages/pbp/src/schemas/business.ts:16`, `packages/pbp/src/schemas/policy.ts:25`). The standalone definition is missing `name`, `summary`, and `governance` optional fields that `PbpEntity` declares and `pbpEntitySchema` validates. Since `PbpCurrencyPricingPolicy extends PbpEntity` (line 253), the schema should validate the full envelope contract.

2. **`CURRENCY_PRICING_POLICY_SCHEMA_ID` hardcoded instead of using `pbpSchemaId()`.** The RFC defines `CURRENCY_PRICING_POLICY_SCHEMA_ID = "pbp/currency-pricing-policy@1"` as a raw string (line 260). The existing pattern uses `pbpSchemaId("business")` from `packages/pbp/src/schema-id.ts`, which constructs the schema ID from the entity name and ensures consistency with the `pbp/*@1` namespace convention.

3. **File system responsibilities omit `schemas/index.ts` registration.** The table (line 300–304) lists `entities/currency-pricing-policy.ts`, `schemas/currency-pricing-policy.ts`, and `index.ts`, but does not mention `schemas/index.ts`. Every new entity schema must be registered in the `pbpSchemaById` registry and added to `pbpEntityDiscriminatedUnion` in `packages/pbp/src/schemas/index.ts` (lines 98–123, 129–154). Without this, the schema is exported but not discoverable by the compiler's collection-level validation.

4. **`successSignals` incomplete.** The list (line 37–42) has 5 items but `acceptance criteria` (line 338–346) has 9 items. `PbpCurrencyTarget` interface, `CURRENCY_PRICING_POLICY_SCHEMA_ID` constant, `tsc --noEmit`, `vitest run`, and `rfc.validate` are in acceptance criteria but not in success signals. Success signals should cover the key deliverables — at minimum `PbpCurrencyTarget` and the schema ID constant.

## Axis B — DNA alignment

No issues. DNA-1 (Monorepo boundary) — entity types in `packages/pbp/` ✓. DNA-55 (Spec vendoring) — new entity extends `pbp/*@1` as a platform extension, not a spec amendment ✓. The RFC body explains how each invariant is satisfied (line 209–210).

## Axis C — Ecosystem fit

1. **Schema registration gap.** As noted in Axis A finding 3, the RFC does not mention registration in `pbpSchemaById` or `pbpEntityDiscriminatedUnion`. This is an ecosystem fit requirement — all PBP entity schemas are registered there.

2. **Astro collection not mentioned.** PBP content collections are defined in `packages/pbp/src/astro.ts` via `pbpCollections`. The RFC declares a content file location (`src/content/business-profile/{lang}/currency-pricing-policy/{id}.md`, line 153–156) but does not mention adding the collection definition to `pbpCollections`. Without this, the content files won't be discovered by Astro's content layer.

3. **`appsImpacted` vs Rollout inconsistency.** `appsImpacted: [warpgogol-com]` (line 33) is listed, but the Rollout section says "No site impact yet" (line 319). The content file is created in RFC-0740, not this RFC. Either `appsImpacted` should be empty (no impact until RFC-0740) or the Rollout should acknowledge the content file location declaration as the impact.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual-paths. Legacy code paths are not applicable (new entity).

## Axis E — Agent-facing policy

No issues. Status gate is correct: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 350). No self-authorizing language. No `NEEDS CLARIFICATION` markers. No storage policy or cookie concerns.

## Axis F — Pragmatism

1. **`strategy: "fixed"` lacks example.** The example content (line 162–204) only shows `strategy: "derived"`. A `strategy: "fixed"` example (with `ratePolicyRef` pointing to a `business-fixed` RatePolicy and no `derivationContractRef`) would clarify the difference between the two strategies. Minor — the validation rules (line 146–147) describe the requirement, but an example is worth a thousand words.

2. **`targetCurrencies` record key not validated.** The Zod schema uses `z.record(z.string(), pbpCurrencyTargetSchema)` (line 137). The key is an arbitrary string, but the RFC's example uses lowercase currency codes (`uah`, `usd`) as keys. The validation rule "Each `targetCurrencies[].currency` MUST be unique within the policy" (line 145) applies to the `currency` field, not the record key. If the key and `currency` field diverge (e.g. key `uah` with `currency: "USD"`), the schema won't catch it. The RFC should state whether the key is authoritative or the `currency` field is, and whether they must match.

## Axis G — Blind spots

1. **`derivationContractRef` ref format.** The example uses `ref: pbp-derivation:currency-conversion/1` (line 179), which is a non-URI scheme. `PbpEntityRef.ref` is typed as `string` and `pbpEntityRefSchema` validates it as `nonEmptyString` — no URI validation is performed. But `validatePbpUri` (exported from `@warpgogol/pbp`) enforces HTTPS URIs for PBP entity IDs. The RFC should clarify whether `derivationContractRef` is exempt from URI validation or whether it should use an HTTPS URI like other entity refs.

2. **Empty `targetCurrencies` edge case.** The schema accepts `z.record(z.string(), pbpCurrencyTargetSchema)` which allows an empty record `{}`. A CurrencyPricingPolicy with no target currencies is semantically meaningless. The RFC should state whether at least one target currency is required (schema-level `.min(1)` or compiler validation).

## Questions for the author

1. Should `pbpCurrencyPricingPolicySchema` follow the established `pbpEntitySchema.extend({...}).strict()` pattern, and if so, should it include `name`, `summary`, and `governance` optional fields from the base envelope?
2. Should the `targetCurrencies` record key be validated to match the `currency` field (e.g. key `uah` must have `currency: "UAH"`), or is the key arbitrary?
3. Is `derivationContractRef.ref: "pbp-derivation:currency-conversion/1"` a valid ref format, or should it be an HTTPS URI consistent with other PBP entity refs?
