---
rfcId: RFC-0737
auditId: AUDIT-RFC-0737-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0737

## Verdict: Needs revision

The RFC has a blocking type conflict: `PbpRateSchedule.governance` redefines the inherited `PbpGovernance` with an incompatible shape, which will cause `tsc --noEmit` to fail. This directly violates `packages/pbp/AGENTS.md` line 188 and the RFC's own implementation notes (line 428). Several minor findings on ecosystem fit and pragmatism also need addressing.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **Blocking: `governance` type conflict on `PbpRateSchedule`.** Lines 132–134 redefine `governance?: { reviewEvery?: string }` on an interface that `extends PbpEntity`. The base `PbpEntity.governance` is `PbpGovernance` (`@/packages/pbp/src/envelope.ts:22-28`), which requires `authorityRef: string`. TypeScript rejects narrowing to a type missing a required field — `tsc --noEmit` will fail on `packages/pbp/`. The RFC's own implementation notes (line 428) say "do not redefine `governance`" — the RFC contradicts itself.

2. **"decision #8" cited without source.** Lines 141 and 399 reference "decision #8" but do not cite where this decision is defined. The reader must infer it comes from RFC-0735 or an external research document. Add an explicit citation (e.g. "RFC-0735 §Decisions, item 8").

3. **Zod `status` field uses `nonEmptyString` instead of `pbpEntityStatusSchema`.** Both `pbpRatePolicySchema` (line 165) and `pbpRateScheduleSchema` (line 195) use `status: nonEmptyString`. The base `pbpEntitySchema` (`@/packages/pbp/src/schemas/envelope.ts:47`) uses `pbpEntityStatusSchema` — a closed enum. Using `nonEmptyString` weakens validation and is inconsistent with the base envelope schema.

## Axis B — DNA alignment

No issues. DNA-1 (monorepo boundary) and DNA-55 (spec vendoring) are correctly cited and explained. Entity types are placed in `packages/pbp/`, extending `pbp/*@1` as platform extensions.

## Axis C — Ecosystem fit

1. **Compass sync not addressed.** The RFC adds new PBP entity types to the namespace but does not identify which `docs/*.xml` files need synchronization. New entity types may require updates to `docs/knowledge-graph.xml` or `docs/requirements.xml`.

2. **`packages/pbp/AGENTS.md` update not mentioned.** The package AGENTS.md maintains a detailed API surface listing all exported types (lines 16–117). New types (`PbpRatePolicy`, `PbpRateSchedule`, `PbpRateMode`, `PbpRateDirection`, etc.) need to be added to this listing. The RFC should mention this documentation duty.

3. **Schema ID construction inconsistent.** The RFC uses string literals `"pbp/rate-policy@1"` (line 146) while the codebase convention is `pbpSchemaId("rate-policy")` (see `@/packages/pbp/src/entities/policy.ts:12`). The implementation should use the helper for consistency, but the RFC should note this.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy code maintained behind flags.

## Axis E — Agent-facing policy

1. **Implementation notes lack specific RFC citations.** Line 431 says "Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it" — correct in principle but does not cite the specific governance RFCs for the accepted→implemented transition, verification evidence, or supersede escalation. Other RFCs in the series (e.g. RFC-0736) have the same gap, but citing the relevant RFCs would improve agent guidance.

No unresolved `NEEDS CLARIFICATION` markers found.

## Axis F — Pragmatism

1. **`appsImpacted: [warpgogol-com]` contradicts Rollout.** The Rollout section (line 393) says "No site impact yet: RatePolicy and RateSchedule are not consumed until RFC-0739 (derivation) and RFC-0740 (materialization)." If there is no site impact, `appsImpacted` should be empty per the AGENTS.md rule: "`appsImpacted` and `packagesImpacted` list only what's actually impacted."

2. **`PbpRateSourceRef` is a single-field wrapper.** The interface wraps `PbpEntityRef` in `sourceContractRef` (lines 83–85). Other entities use `PbpEntityRef` directly (e.g. `PbpCurrencyTarget.ratePolicyRef: PbpEntityRef` in RFC-0736). The wrapper adds indirection without clear benefit — `sources.primary` and `sources.fallback` could be `PbpEntityRef` directly.

3. **`pair` and `quotation` duplicated across both interfaces.** Both `PbpRatePolicy` and `PbpRateSchedule` define `pair: { sourceCurrency: string; targetCurrency: string }` and `quotation: { direction: PbpRateDirection }` with identical shapes. A shared `PbpCurrencyPair` and `PbpQuotation` type would reduce duplication and ensure structural consistency.

## Axis G — Blind spots

1. **`decimalString` allows zero.** The `decimalString` schema (`@/packages/pbp/src/schemas/primitives.ts:27`) uses `/^\d+(\.\d+)?$/` — this matches `"0"` and `"0.00"`. The validation rule (line 224) says "MUST be positive decimal strings." The RFC should note that positivity enforcement is deferred to the compiler (RFC-0740), not the schema — otherwise a reader might assume the schema enforces it.

2. **`freshness.maximumAge` and `governance.reviewEvery` typed as `string`.** Both represent ISO 8601 durations but are typed as plain `string` in the TypeScript interfaces. The existing `PbpIsoDuration` type (`@/packages/pbp/src/primitives.ts`) could be used for better type safety. This is consistent with the `PbpGovernance.reviewEvery: string` pattern in the base type, so it may be intentional — but worth noting.

## Questions for the author

1. Should `PbpRateSchedule.governance` use the inherited `PbpGovernance` type (with `authorityRef`, `effectiveFrom`, etc.) and rely on its `reviewEvery` field, or should the schedule-specific governance be a differently named field (e.g. `scheduleGovernance`)?

2. Is `appsImpacted: [warpgogol-com]` intentional given the Rollout says "No site impact yet"? Should it be empty until RFC-0740?

3. Should `PbpRateSourceRef` be simplified to `PbpEntityRef` directly, matching the pattern in RFC-0736's `PbpCurrencyTarget`?
