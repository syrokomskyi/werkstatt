---
rfcId: RFC-0739
planId: PLAN-RFC-0739-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/pbp"
  services: []
  docs:
    - "packages/pbp/AGENTS.md"
    - "docs/knowledge-graph.xml"
---

# Implementation Plan: RFC-0739

## 1. Objectives

- [ ] O1 — Export `PbpCurrencyConversionDerivation`, `PbpCurrencyConversionResult`, `PbpPriceDerivationPipeline`, `PbpRoundingMode`, `PbpPriceEndingMode`, `PbpCurrencyConversionTrace` from `@warpgogol/pbp` (maps to acceptance criteria 1-6)
- [ ] O2 — Implement `computeCurrencyConversion` and register in `executeContract` dispatcher (maps to acceptance criterion 7)
- [ ] O3 — Implement decimal arithmetic helpers with `big.js` (maps to acceptance criteria 8-9)
- [ ] O4 — Golden test vectors pass including negative failure modes and JPY zero-decimal edge case (maps to acceptance criterion 10)
- [ ] O5 — `tsc --noEmit` and `vitest run` pass for `packages/pbp/` (maps to acceptance criteria 11-12)
- [ ] O6 — Documentation sync: `packages/pbp/AGENTS.md` API surface updated (maps to summit findings A2+D1, S1, A1)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/derivations/currency-conversion.ts` — new file: contract, pipeline, trace, result, `computeCurrencyConversion`
- `packages/pbp/src/decimal.ts` — new file: `decimalMultiply`, `decimalAdd`, `decimalDivide`, `decimalRound` using `big.js`
- `packages/pbp/src/compiler/derivations.ts` — add `currency-conversion` branch to `executeContract`
- `packages/pbp/src/derivations/currency-conversion.test.ts` — new file: golden test vectors + failure mode tests
- `packages/pbp/src/index.ts` — re-export new types and function
- `packages/pbp/package.json` — add `big.js` dependency

### 2.2 Configuration and data

- `packages/pbp/package.json` — `dependencies` array gains `big.js`

### 2.3 Documentation and specs

- `packages/pbp/AGENTS.md` — API surface section: add RFC-0739 exports under "Multi-currency pricing (RFC-0735..0745)"
- `docs/knowledge-graph.xml` — sync if derivation contracts are listed
- RFC file (read-only reference): `docs/rfcs/rfc-0739-currency-conversion-derivation-contract.md`

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/pbp build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/pbp test` — vitest golden test vectors
- `pnpm exec site-kernel run rfc.validate --id RFC-0739` — RFC mechanical validation

## 3. Step sequence

### Step 1. Add `big.js` dependency

**Goal:** Add `big.js` to `packages/pbp/package.json` dependencies.

**Agent actions:**

- Add `"big.js": "^6.2.1"` to `packages/pbp/package.json` `dependencies`
- Run `pnpm install` to update lockfile

**Validation:**

- `pnpm install` succeeds without errors
- `big.js` appears in `packages/pbp/node_modules/`

**Completion criterion:** `big.js` is declared in `packages/pbp/package.json` and installed.

**Human review:** no

---

### Step 2. Implement decimal arithmetic helpers

**Goal:** Create `packages/pbp/src/decimal.ts` with `decimalMultiply`, `decimalAdd`, `decimalDivide`, `decimalRound`.

**Agent actions:**

- Create `packages/pbp/src/decimal.ts`
- Define `PbpRoundingMode` type union (`"ceiling" | "floor" | "half-up" | "half-even"`) and `PBP_ROUNDING_MODES` const array in `decimal.ts` — this is the primitive used by `decimalRound`, re-exported from `currency-conversion.ts` to avoid circular dependency
- Implement `decimalMultiply(a: string, b: string): string` using `Big(a).times(Big(b)).toString()`
- Implement `decimalAdd(a: string, b: string): string` using `Big(a).plus(Big(b)).toString()`
- Implement `decimalDivide(a: string, b: string, precision: number): string` using `Big(a).div(Big(b)).round(precision, Big.roundHalfUp).toString()` — precision = target currency decimal places + 2 guard digits
- Implement `decimalRound(value: string, mode: PbpRoundingMode, increment?: string, decimalPlaces?: number): string` — map `ceiling`/`floor`/`half-up`/`half-even` to `big.js` rounding modes; when `increment` is specified, divide by increment, round, multiply back
- Export all four functions, `PbpRoundingMode`, and `PBP_ROUNDING_MODES` from `packages/pbp/src/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/pbp build:check` passes
- Manual check: `decimalMultiply("70.00", "46.18")` returns `"3232.6000"`

**Completion criterion:** `decimal.ts` exists, exports four functions, `tsc --noEmit` passes.

**Human review:** no

---

### Step 3. Implement currency conversion derivation contract types

**Goal:** Create `packages/pbp/src/derivations/currency-conversion.ts` with all TypeScript interfaces.

**Agent actions:**

- Create `packages/pbp/src/derivations/currency-conversion.ts`
- Define `PbpRoundingMode`, `PBP_ROUNDING_MODES` — re-export from `../decimal.js` (defined in step 2 to avoid circular dependency)
- Define `PbpPriceEndingMode`, `PBP_PRICE_ENDING_MODES`
- Define `PbpPriceDerivationPipeline` interface
- Define `PbpCurrencyConversionDerivation extends PbpDerivationContract` with `derivationRef: "currency-conversion"` and typed `parameters`
- Define `PbpCurrencyConversionResult extends PbpDerivationResult` with typed `value` and `trace: PbpCurrencyConversionTrace`
- Define `PbpCurrencyConversionTrace` interface with `@see RFC-0737` and `@see RFC-0738` JSDoc references for `PbpRateDirection` and `PbpRateSnapshotSourceKind` (summit A2+D1)
- Add `@see` reference noting both types are re-exported from `@warpgogol/pbp`

**Validation:**

- `pnpm --filter @warpgogol/pbp build:check` passes
- All interfaces are exported from `packages/pbp/src/index.ts`

**Completion criterion:** All six types (`PbpRoundingMode`, `PbpPriceEndingMode`, `PbpPriceDerivationPipeline`, `PbpCurrencyConversionDerivation`, `PbpCurrencyConversionResult`, `PbpCurrencyConversionTrace`) are exported from `@warpgogol/pbp`.

**Human review:** no

---

### Step 4. Implement `computeCurrencyConversion` function

**Goal:** Implement the fixed pipeline execution and trace production.

**Agent actions:**

- In `packages/pbp/src/derivations/currency-conversion.ts`, implement `computeCurrencyConversion(graph: PbpResolvedGraph, contract: PbpDerivationContract): PbpCurrencyConversionResult`
- Cast `contract` to `PbpCurrencyConversionDerivation` internally after dispatch (grilling decision: generic + internal cast)
- Extract `parameters.rateSnapshotRef`, `parameters.ratePolicyRef`, `parameters.pipeline` from the cast contract
- Resolve rate snapshot from `graph` by `rateSnapshotRef` — if not found, return `status: "skipped"`
- Check snapshot freshness (`freshUntil` vs current date) — if stale and `allowLastKnownValue` is false, return `status: "skipped"`
- Execute fixed pipeline:
  1. Conversion: `decimalMultiply(sourceAmount, rate)` or `decimalDivide(sourceAmount, rate, precision)` based on direction
  2. Percentage adjustment (optional): `decimalMultiply(rawConverted, decimalAdd("1", decimalDivide(percentage, "100", 10)))`
  3. Fixed adjustment (optional): `decimalAdd(adjusted, fixedAdjustment.value)`
  4. Rounding: `decimalRound(adjusted, mode, increment, decimalPlaces)`
  5. Price ending (optional): `decimalAdd(rounded, "-" + priceEnding.value)` (subtract)
- After each step, record trace entry
- Validate: if result is negative → `status: "failed"`, error code `PBP-CURRENCY-CONVERSION-NEGATIVE`
- Validate: if result is zero for positive source → `status: "failed"`, error code `PBP-CURRENCY-CONVERSION-ZERO`
- Validate: if price ending value is `"1.00"` but increment is not `"10"` or `"100"` → `status: "failed"`, error code `PBP-CURRENCY-CONVERSION-ENDING-INCOMPATIBLE`
- Build `PbpCurrencyConversionResult` with `status: "derived"`, `mode: "exact"`, typed `value`, `trace`, and `provenance` with input digests
- Add JSDoc comment documenting the downcast pattern for consumers (summit A1): "Consumers of `runDerivations` results that need trace access should check `derivationRef === 'currency-conversion'` and cast to `PbpCurrencyConversionResult`."
- Add JSDoc note that trace is server-side only; `snapshotDigest` should be redacted in client-facing projections (summit S1)

**Validation:**

- `pnpm --filter @warpgogol/pbp build:check` passes
- Function is exported from `@warpgogol/pbp`

**Completion criterion:** `computeCurrencyConversion` is exported, `tsc --noEmit` passes.

**Human review:** no

---

### Step 5. Register in derivation engine dispatcher

**Goal:** Add `currency-conversion` branch to `executeContract` in `packages/pbp/src/compiler/derivations.ts`.

**Agent actions:**

- In `packages/pbp/src/compiler/derivations.ts`, add import for `computeCurrencyConversion` from `../derivations/currency-conversion.js`
- Add branch in `executeContract`: `if (contract.derivationRef === "currency-conversion") { return computeCurrencyConversion(graph, contract); }`
- Place the new branch before the existing skip fallback

**Validation:**

- `pnpm --filter @warpgogol/pbp build:check` passes
- Existing derivation tests still pass

**Completion criterion:** `executeContract` dispatches `currency-conversion` to `computeCurrencyConversion`.

**Human review:** no

---

### Step 6. Write golden test vectors and failure mode tests

**Goal:** Create `packages/pbp/src/derivations/currency-conversion.test.ts` with all golden test vectors and negative tests.

**Agent actions:**

- Create `packages/pbp/src/derivations/currency-conversion.test.ts`
- Implement 5 golden test vectors from RFC §9:
  1. Basic conversion + ceiling 10 + subtract 1 → 3239.00
  2. Percentage markup 5% + ceiling 10 → 3400.00 (fixed in enhance)
  3. Fixed adjustment +5 + ceiling 10 → 3240.00
  4. Ceiling 100 + subtract 1 → 3299.00 (...99 ending)
  5. Source-per-target direction (divide) + ceiling 10 + subtract 1 → 3239.00
- Implement 3 failure mode test vectors (summit Q1): 6. Negative result: source=0.01, rate=0.001, pipeline that produces negative after price ending → `status: "failed"`, code `PBP-CURRENCY-CONVERSION-NEGATIVE` 7. Zero result for positive source: source=0.01, rate=0 → `status: "failed"`, code `PBP-CURRENCY-CONVERSION-ZERO` 8. Incompatible price ending: priceEnding.value="1.00" but increment="5" → `status: "failed"`, code `PBP-CURRENCY-CONVERSION-ENDING-INCOMPATIBLE`
- Implement JPY zero-decimal test vector (summit Q2): 9. source=70.00 EUR, rate=172.5 (JPY), direction=target-per-source, rounding: ceiling decimalPlaces=0 → verify precision=2 is sufficient
- Implement 4 rounding mode tests with same input (verify each mode produces correct result): 10. ceiling: 3394.23 → ceiling to 10 → 3400 11. floor: 3394.23 → floor to 10 → 3390 12. half-up: 3395.00 → half-up to 10 → 3400 (tie goes up) 13. half-even: 3395.00 → half-even to 10 → 3400 (tie goes to even — 3400 is even) 14. half-even tie-breaking: 3385.00 → half-even to 10 → 3380 (tie goes to even — 3380 is even, 3390 is odd)
- Each test should verify both the result amount and the trace structure

**Validation:**

- `pnpm --filter @warpgogol/pbp test` passes — all 14 test vectors pass

**Completion criterion:** All 14 test vectors pass in vitest.

**Human review:** no

---

### Step 7. Update `packages/pbp/AGENTS.md` API surface

**Goal:** Add RFC-0739 exports to the "Multi-currency pricing (RFC-0735..0745)" section.

**Agent actions:**

- In `packages/pbp/AGENTS.md`, under "### Multi-currency pricing (RFC-0735..0745)", add:
  - `PbpCurrencyConversionDerivation`, `PbpCurrencyConversionResult`, `PbpPriceDerivationPipeline`, `PbpRoundingMode`, `PbpPriceEndingMode`, `PbpCurrencyConversionTrace`, `computeCurrencyConversion` — currency conversion derivation contract (RFC-0739)

**Validation:**

- `packages/pbp/AGENTS.md` contains all new export names

**Completion criterion:** AGENTS.md API surface includes all RFC-0739 exports.

**Human review:** no

---

### Step 8. Sync `docs/knowledge-graph.xml` (if applicable)

**Goal:** Sync knowledge graph if derivation contracts are listed.

**Agent actions:**

- Check if `docs/knowledge-graph.xml` lists derivation contracts or `@warpgogol/pbp` exports
- If yes, add `currency-conversion` derivation contract entry
- If no, skip and document why

**Validation:**

- `git diff docs/knowledge-graph.xml` shows either the update or no change (with documented reason)

**Completion criterion:** `docs/knowledge-graph.xml` is either updated or documented as not-applicable.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (do not hand-edit `docs/ecosystem.generated.yaml`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0739 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). The command validates all preconditions (status, criteria, clean tree, commit reachability). Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields — use the command.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0739`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0739`
- `pnpm --filter @warpgogol/pbp build:check`
- `pnpm --filter @warpgogol/pbp test`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0739` (RFC-0330, if acceptance probes declared)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0739.generated.json` — verification evidence (RFC-0330, if probes declared)
- Commit messages referencing `RFC-0739` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Decimal library choice (`big.js` insufficient) | Step 2 abstracts library behind `decimal.ts` helpers — swappable without touching derivation logic |
| Rounding mode confusion (`ceiling` vs `half-up`) | Step 6 golden test vectors verify each mode explicitly |
| Price ending edge cases (rounded value already ...9) | Step 6 test vector 1 and 4 verify ...9 and ...99 endings; Step 4 validates increment compatibility |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1 or DNA-55, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0739 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `big.js` proves incompatible with Cloudflare Workers runtime, create a new RFC proposing an alternative decimal library or BigInt-based implementation.
