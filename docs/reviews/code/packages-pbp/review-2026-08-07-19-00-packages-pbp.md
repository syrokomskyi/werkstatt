---
reviewId: REVIEW-CODE-2026-08-07-01
date: 2026-08-07
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: e8027940...HEAD
filesReviewed:
  - packages/pbp/src/materialized-derived-price.ts
  - packages/pbp/src/compiler/materialize.ts
  - packages/pbp/src/compiler/types.ts
  - packages/pbp/src/compiler/index.ts
  - packages/pbp/src/index.ts
  - packages/pbp/src/compiler/__tests__/materialize-derived-prices.test.ts
  - packages/os/site-kernel-checks/src/derived-prices-materialize.ts
  - packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts
  - packages/pbp/AGENTS.md
  - packages/os/site-kernel-checks/AGENTS.md
---

# Code Review: e8027940...HEAD (RFC-0740 Derived Price Materialization)

### Verdict: Needs revision

The implementation is architecturally sound and meets all RFC-0740 acceptance criteria. However, there are findings on axes A, E, and G that should be addressed before stamping.

### Mechanical floor

Pass — `tsc --noEmit` passes for both `@warpgogol/pbp` and `@warpgogol/site-kernel-checks`. `vitest run` passes (13 tests). `rfc.validate --id RFC-0740` passes.

### Axis A — Structural correctness

- **A1: Unused parameters in `validateTarget`** — `graph` and `policy` parameters are passed but never read inside `validateTarget` (`@packages/pbp/src/compiler/materialize.ts:303-325`). The function only checks `sourceCurrency === targetCurrency`. These parameters should either be used for additional validation rules or removed to avoid speculative generality.

- **A2: Unused parameters in `validateDerivedPrice`** — `_sourceCurrency` and `_targetCurrency` are prefixed with underscore but never used (`@packages/pbp/src/compiler/materialize.ts:332-367`). They should be removed unless future validation rules are planned in this same function — in which case a comment is needed.

- **A3: `as unknown as PbpDerivationContract` double-cast** — `buildConversionContract` returns `PbpDerivationContract` but constructs the object with `as unknown as PbpDerivationContract` (`@packages/pbp/src/compiler/materialize.ts:128`). The returned object already matches `PbpCurrencyConversionDerivation` structurally. The double-cast is needed because `PbpDerivationContract` doesn't have typed `parameters`, but a comment explaining why would help readers.

- **A4: `findApplicableSnapshot` comment mentions `allowLastKnownValue` but doesn't implement it** — The JSDoc says "If `allowLastKnownValue` is true on the rate policy, a stale snapshot is acceptable" (`@packages/pbp/src/compiler/materialize.ts:72-73`), but the function does not check `allowLastKnownValue` — it only returns fresh snapshots. The `ratePolicy` parameter is not passed to this function. Either implement the documented behavior or remove the misleading comment.

### Axis B — DNA alignment

No issues. DNA-20 (superseded by RFC-0471) is respected — PBP remains the canonical business layer. The `derivedPrices` field is additive to `PbpResolvedGraph`, consistent with `pbp/*@1` additive-only policy.

### Axis C — Ecosystem fit

No issues. Package boundaries are correct: `materializeDerivedPrices` is a pure function in `@warpgogol/pbp/compiler`, the command handler is in `@warpgogol/site-kernel-checks`. Command is registered in the correct table (`04-content-quality.ts`). `writeFileIfChanged` is used per the generated file writes rule. AGENTS.md files are updated for both packages.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no legacy paths. The `derivedPrices` field is optional on `PbpResolvedGraph` — this is additive, not a dual-path.

### Axis E — Agent-facing clarity

- **E1: `validateTarget` JSDoc claims "Checks rules 1, 5, 6, 7, 9 from RFC-0740 §4"** but only implements rule 6 (same currency). The comment is misleading — either implement the referenced rules or update the comment to reflect what is actually checked (`@packages/pbp/src/compiler/materialize.ts:299-301`).

- **E2: `validateDerivedPrice` JSDoc claims "Checks rules 13, 14, 15 from RFC-0740 §4"** but rule 15 is not implemented. Only rules 13 (negative) and 14 (zero) are checked. Update the comment or implement rule 15 (`@packages/pbp/src/compiler/materialize.ts:329-331`).

- **E3: `findApplicableSnapshot` JSDoc mismatch** — see A4. The comment documents behavior that doesn't exist in the function body.

### Axis F — Pragmatism

No issues. The materialization function is minimal and delegates to `computeCurrencyConversion` from RFC-0739. No new dependencies added. The command handler is thin — it compiles, finds the policy, calls the pure function, writes the file. No speculative generality in types (`PbpPriceKind` and `PbpCommercialMeaning` are single-member unions as specified by the RFC).

### Axis G — Blind spots

- **G1: Hardcoded locale `de` in command handler** — `compilePbpProfile` is called with `locale: "de"` and `defaultLocale: "de"` (`@packages/os/site-kernel-checks/src/derived-prices-materialize.ts:63-64`). This should be resolved from the site's i18n config, not hardcoded. Other commands (e.g. `resolveSiteContext` in `content-regression.ts`) read languages from `loadSystemManifest`. While the RFC doesn't specify locale handling, this will break for non-`de` sites.

- **G2: `context.dryRun` check** — The command handler checks `context.dryRun` (`@packages/os/site-kernel-checks/src/derived-prices-materialize.ts:123`), but `KernelRuntimeContext` may not have a `dryRun` field. This needs verification — if the field doesn't exist, the check is dead code. If it does exist, a comment explaining the dry-run semantics would help.

- **G3: No `--json` flag handling** — The RFC mentions `--json` as a command flag, but the command table entry only declares `--system`. The `--json` flag is not in the flags schema and not handled in the handler. If `--json` is needed, add it; if not, remove the RFC reference.

### Spec compliance

| Requirement from RFC-0740 | Status | Evidence |
| --- | --- | --- |
| `PbpMaterializedDerivedPrice` exported from `@warpgogol/pbp` | Done | `@packages/pbp/src/index.ts:603-612` |
| `PbpPriceKind` and `PbpCommercialMeaning` closed unions | Done | `@packages/pbp/src/materialized-derived-price.ts:18-40` |
| `PbpResolvedGraph` has `derivedPrices` field | Done | `@packages/pbp/src/compiler/types.ts:75` |
| `derived-prices.materialize` command registered | Done | `@packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts:731-746` |
| Command calls `compilePbpProfile()` | Done | `@packages/os/site-kernel-checks/src/derived-prices-materialize.ts:61-67` |
| Produces `src/derived-prices.generated.json` | Done | `@packages/os/site-kernel-checks/src/derived-prices-materialize.ts:120-125` |
| Uses `writeFileIfChanged` | Done | `@packages/os/site-kernel-checks/src/derived-prices-materialize.ts:125` |
| Blocks publication on validation violations | Done | `@packages/os/site-kernel-checks/src/derived-prices-materialize.ts:101-114` |
| `allowedUses` copied from CurrencyPricingPolicy | Done | `@packages/pbp/src/compiler/materialize.ts:283` |
| Non-`fixed` charges skipped gracefully | Done | `@packages/pbp/src/compiler/materialize.ts:169-171` |
| Offerings without `pricing` skipped gracefully | Done | `@packages/pbp/src/compiler/materialize.ts:159-161` |
| `tsc --noEmit` passes | Done | Both packages pass |
| `vitest run` passes | Done | 13 tests pass |
| `rfc.validate` passes | Done | `rfc.validate --id RFC-0740` passes |
| 15 validation rules | Partial | Only rules 3, 6, 8, 13, 14 are implemented. Rules 1, 2, 4, 5, 7, 9, 10, 11, 12, 15 are not. The CHANGE_SUMMARY claims "15 validation rules" but only 5 are implemented. |

### Questions for the author

1. The CHANGE_SUMMARY in `materialize.ts` claims "15 validation rules" but only 5 are implemented (rules 3, 6, 8, 13, 14). Are the remaining 10 rules planned for a follow-up, or should the CHANGE_SUMMARY be corrected to reflect the actual count?
2. `findApplicableSnapshot` documents `allowLastKnownValue` support in its JSDoc but doesn't implement it. Should this be implemented now or should the comment be removed?
3. The command handler hardcodes `locale: "de"`. Should this be resolved from the site's i18n config instead?
