---
rfcId: RFC-0740
planId: PLAN-RFC-0740-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/pbp"
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/pbp/AGENTS.md
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0740

## 0. Prerequisites

**Dependency RFCs must be implemented first.** RFC-0735 (program charter) mandates sequential implementation: 0736 → 0737 → 0738 → 0739 → 0740. As of this plan:

- **RFC-0736** (CurrencyPricingPolicy) — `accepted`, entity types in codebase (`packages/pbp/src/entities/currency-pricing-policy.ts`).
- **RFC-0737** (RatePolicy, RateSchedule) — `accepted`, NOT yet implemented. Types `PbpRatePolicy`, `PbpRateSchedule`, `PbpRateDirection` do not exist in codebase.
- **RFC-0738** (RateSnapshot) — `accepted`, NOT yet implemented. Type `PbpRateSnapshot` does not exist in codebase.
- **RFC-0739** (Currency Conversion Derivation Contract) — `accepted`, NOT yet implemented. Types `PbpCurrencyConversionTrace`, `computeCurrencyConversion` do not exist in codebase.

**This plan cannot be executed until RFC-0737, RFC-0738, and RFC-0739 are implemented.** The steps below assume their types and functions are available in `@warpgogol/pbp`.

## 1. Objectives

- [ ] O1 — Export `PbpMaterializedDerivedPrice`, `PbpPriceKind`, `PbpCommercialMeaning` from `@warpgogol/pbp` (maps to acceptance criteria 1, 2)
- [ ] O2 — Add `derivedPrices` optional field to `PbpResolvedGraph` (maps to acceptance criterion 3)
- [ ] O3 — Implement `derived-prices.materialize` command with `scope: "workspace"` (maps to acceptance criteria 4, 5, 6)
- [ ] O4 — Implement 15 validation rules that block publication on invariant violations (maps to acceptance criterion 7)
- [ ] O5 — Copy `allowedUses` from `CurrencyPricingPolicy.targetCurrencies[].currentUses` (maps to acceptance criterion 8)
- [ ] O6 — Skip non-`fixed` charge amounts and Offerings without `pricing` gracefully (maps to acceptance criterion 9)
- [ ] O7 — Pass `tsc --noEmit` and `vitest run` (maps to acceptance criteria 10, 11)
- [ ] O8 — Pass `rfc.validate` (maps to acceptance criterion 12)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/materialized-derived-price.ts` — new file: type definitions, closed unions, const arrays, type guards
- `packages/pbp/src/compiler/materialize.ts` — new file: materialization logic (`materializeDerivedPrices` pure function)
- `packages/pbp/src/compiler/types.ts` — add `derivedPrices?: Record<string, PbpMaterializedDerivedPrice[]>` to `PbpResolvedGraph`
- `packages/pbp/src/compiler/index.ts` — re-export `materializeDerivedPrices` and `PbpMaterializedDerivedPrice`
- `packages/pbp/src/index.ts` — re-export `PbpMaterializedDerivedPrice`, `PbpPriceKind`, `PbpCommercialMeaning` and const arrays
- `packages/os/site-kernel-checks/src/derived-prices-materialize.ts` — new file: command handler (`runDerivedPricesMaterialize`)
- `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` — add `derived-prices.materialize` `CheckCommandEntry` (scope: `workspace`)

### 2.2 Configuration and data

- `src/derived-prices.generated.json` — generated output (gitignored, workpiece `.gitignore`)
- Workpiece `.gitignore` — add `src/derived-prices.generated.json` entry

### 2.3 Documentation and specs

- `packages/pbp/AGENTS.md` — add `PbpMaterializedDerivedPrice`, `PbpPriceKind`, `PbpCommercialMeaning` to API surface
- `packages/os/site-kernel-checks/AGENTS.md` — add `derived-prices.materialize` command to command inventory
- RFC file (read-only reference): `docs/rfcs/rfc-0740-derived-price-materialization.md`

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/pbp run build:check` — type-check
- `pnpm --filter @warpgogol/pbp run test` — unit tests
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — type-check
- `pnpm exec site-kernel run rfc.validate --id RFC-0740` — RFC validation
- Pipeline integration deferred to RFC-0741 (build-prepare, gated by multi-currency entitlement)

## 3. Step sequence

### Step 1. Create `PbpMaterializedDerivedPrice` type and closed unions

**Goal:** Define the materialized derived price type and export it from `@warpgogol/pbp`.

**Agent actions:**

- Create `packages/pbp/src/materialized-derived-price.ts` with:
  - `PbpPriceKind = "derived"` (single-member union)
  - `PBP_PRICE_KINDS` const array
  - `isPbpPriceKind` type guard
  - `PbpCommercialMeaning = "derived-price"` (single-member union)
  - `PBP_COMMERCIAL_MEANINGS` const array
  - `isPbpCommercialMeaning` type guard
  - `PbpMaterializedDerivedPrice` interface (with JSDoc comments for `chargeRef`, `derivation.modelRef`, `derivation.calculatedAt`)
- Import `PbpCurrencyConversionTrace` from RFC-0739's module (dependency)
- Import `PbpCurrentUses` from `entities/currency-pricing-policy.ts`
- Import `PbpRateDirection` from RFC-0737's module (dependency)
- Add re-exports to `packages/pbp/src/index.ts`
- Add re-exports to `packages/pbp/src/compiler/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check` passes

**Completion criterion:** `PbpMaterializedDerivedPrice`, `PbpPriceKind`, `PbpCommercialMeaning` are exported from `@warpgogol/pbp` and `tsc --noEmit` passes.

**Human review:** no

---

### Step 2. Add `derivedPrices` field to `PbpResolvedGraph`

**Goal:** Extend the compiled graph type to hold materialized derived prices.

**Agent actions:**

- Edit `packages/pbp/src/compiler/types.ts`:
  - Import `PbpMaterializedDerivedPrice` from `../materialized-derived-price.js`
  - Add `derivedPrices?: Record<string, PbpMaterializedDerivedPrice[]>;` to `PbpResolvedGraph` (keyed by Offering ID)
- Verify no existing code breaks (the field is optional)

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check` passes

**Completion criterion:** `PbpResolvedGraph` has `derivedPrices?: Record<string, PbpMaterializedDerivedPrice[]>` field and `tsc --noEmit` passes.

**Human review:** no

---

### Step 3. Implement materialization logic

**Goal:** Create the pure function that iterates Offerings, Charges, and target currencies to produce materialized derived prices.

**Agent actions:**

- Create `packages/pbp/src/compiler/materialize.ts` with:
  - `materializeDerivedPrices(graph: PbpResolvedGraph, policy: PbpCurrencyPricingPolicy, rateSnapshots: Map<string, PbpRateSnapshot>, ratePolicies: Map<string, PbpRatePolicy>, buildTime: string): { prices: Record<string, PbpMaterializedDerivedPrice[]>; errors: PbpValidationError[] }`
  - Iterate `graph.offerings` (sorted by key)
  - Skip Offerings without `pricing` or `pricing.charges`
  - For each charge key in `pricing.charges`:
    - Cast entry to `PbpCharge` (since `PbpPricing.charges` is `Record<string, unknown>`)
    - Skip charges where `amount.model !== "fixed"`
    - For each target currency in `policy.targetCurrencies`:
      - Skip if `strategy: "fixed"` (no derivation needed)
      - Resolve `ratePolicyRef` → `PbpRatePolicy`
      - Find applicable `PbpRateSnapshot` for the currency pair
      - Build `PbpCurrencyConversionDerivation` contract
      - Call `computeCurrencyConversion` (from RFC-0739)
      - If successful, create `PbpMaterializedDerivedPrice` with `allowedUses` copied from `policy.targetCurrencies[].currentUses`
      - If failed, push to `errors` array
  - Return `{ prices, errors }`
- Export from `packages/pbp/src/compiler/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check` passes

**Completion criterion:** `materializeDerivedPrices` function exists, is exported from `@warpgogol/pbp/compiler`, and `tsc --noEmit` passes.

**Human review:** no

---

### Step 4. Implement validation rules

**Goal:** Implement the 15 validation rules from the RFC that block publication.

**Agent actions:**

- In `packages/pbp/src/compiler/materialize.ts` (or a separate `materialize-validate.ts`):
  - Implement rules 1–15 from RFC §4:
    1. Target currency not registered
    2. No single business strategy (conflicting policies)
    3. `strategy: derived` but no RatePolicy
    4. `strategy: fixed` but a derived price exists
    5. Offering overrides currency strategy
    6. Source and target currency are the same
    7. Rate direction undefined
    8. No applicable rate snapshot
    9. RateSchedule duplicate `validFrom`
    10. No applicable internal rate (business-fixed mode)
    11. Price ending `9` without rounding to 10
    12. Price ending `99` without rounding to 100
    13. Derived result is negative
    14. Derived result is zero for positive source price
    15. Derived result not reproducible from trace
  - Each rule produces a `PbpValidationError` with appropriate code (e.g. `PBP-DERIVED-PRICE-01` through `PBP-DERIVED-PRICE-15`)
  - Rules run after materialization; any violation causes the command to exit with error

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check` passes

**Completion criterion:** All 15 validation rules are implemented and produce `PbpValidationError` entries on violations.

**Human review:** no

---

### Step 5. Implement command handler

**Goal:** Create the kernel command handler for `derived-prices.materialize`.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/derived-prices-materialize.ts`:
  - `runDerivedPricesMaterialize(input: KernelCommandInput, context: KernelRuntimeContext): Promise<KernelCommandResult>`
  - Read `--system` flag to get Sternsystem ID
  - Resolve the system's content directory
  - Call `compilePbpProfile()` from `@warpgogol/pbp/compiler` to obtain the compiled graph
  - Read `CurrencyPricingPolicy` from the compiled graph
  - If no policy found, return error: "No CurrencyPricingPolicy found for business {businessRef}"
  - Call `materializeDerivedPrices()` with the graph, policy, rate snapshots, rate policies, and build time
  - Run validation rules on the result
  - If validation errors exist, return `exitCode: 1` with error list
  - Write `derivedPrices` to `src/derived-prices.generated.json` using `writeFileIfChanged` from `@warpgogol/site-kernel`
  - Return `KernelCommandResult` with `data: { command, status, system, materializedCount, offerings, targetCurrencies, errors }`, `exitCode: 0`, `summary`
- Register the command in `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts`:
  - `name: "derived-prices.materialize"`
  - `scope: "workspace"`
  - `flags: { system: { kind: "string", required: true, description: "..." } }`
  - `execute: runDerivedPricesMaterialize`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** `derived-prices.materialize` command is registered in the command table and the handler compiles.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Create unit tests for the materialization logic and command handler.

**Agent actions:**

- Create `packages/pbp/src/tests/materialize.test.ts`:
  - Test: materializes derived prices for a simple Offering with one fixed charge and one target currency
  - Test: skips Offerings without `pricing` or `charges`
  - Test: skips non-`fixed` charge amounts (range, unit-rate, tiered)
  - Test: copies `allowedUses` from `CurrencyPricingPolicy.targetCurrencies[].currentUses`
  - Test: validation rule 1 (target currency not registered) fires
  - Test: validation rule 4 (strategy: fixed but derived price exists) fires
  - Test: validation rule 6 (source and target currency same) fires
  - Test: validation rule 13 (derived result negative) fires
  - Test: no CurrencyPricingPolicy returns empty result
  - Test: deterministic output (same input → same output)
- Create `packages/os/site-kernel-checks/src/tests/derived-prices-materialize.test.ts`:
  - Test: command handler returns `KernelCommandResult` with correct envelope shape
  - Test: command writes `src/derived-prices.generated.json` using `writeFileIfChanged`
  - Test: command exits with `exitCode: 1` on validation rule violation
  - Mock `compilePbpProfile` and `materializeDerivedPrices` to avoid real compilation

**Validation:**

- `pnpm --filter @warpgogol/pbp run test` passes
- `pnpm --filter @warpgogol/site-kernel-checks run test` passes (if test file added)

**Completion criterion:** All unit tests pass and cover the acceptance criteria.

**Human review:** no

---

### Step 7. Update documentation

**Goal:** Synchronize AGENTS.md files with new types and commands.

**Agent actions:**

- Update `packages/pbp/AGENTS.md`:
  - Add `PbpMaterializedDerivedPrice`, `PbpPriceKind`, `PbpCommercialMeaning` to the API surface section under a new "Multi-currency (RFC-0735..0745)" heading
  - Add `materializeDerivedPrices` to the compiler export paths table
- Update `packages/os/site-kernel-checks/AGENTS.md`:
  - Add `derived-prices.materialize` to the command inventory
- Verify every file listed in `scope.docs` is updated

**Validation:**

- `git diff --name-only` shows both AGENTS.md files modified

**Completion criterion:** Both AGENTS.md files are updated with new types and commands.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0740 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0740`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0740`
- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/pbp run test`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0740` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0740.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0740` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Performance — materializing for every Charge × currency could be slow | Step 3: current site has ~48 derivations — trivial. Future parallelization noted in RFC. |
| Generated file size — full traces could be large | Step 5: traces included for current scale. Future optimization to omit traces noted in RFC. |
| Stale materialized prices — rates change without rebuild | Out of scope for this RFC. RFC-0744 (Rate Fetcher Service) triggers rebuilds. |
| Dependency RFCs not yet implemented | Step 0: plan explicitly notes RFC-0737, 0738, 0739 must be implemented first. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1 or DNA-4, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0740 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `PbpCurrencyConversionTrace` or `computeCurrencyConversion` from RFC-0739 has a different shape than expected, stop and request RFC-0739 implementation first.
