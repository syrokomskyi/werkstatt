---
rfcId: RFC-0742
planId: PLAN-RFC-0742-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/pbp"
  services: []
  docs:
    - packages/pbp/AGENTS.md
    - docs/technology.xml
---

# Implementation Plan: RFC-0742

## 1. Objectives

- [ ] O1 — Export `PbpPriceProjection` and `PbpPriceDisplayConfig` interfaces from `@warpgogol/pbp` (maps to acceptance criteria 1, 2)
- [ ] O2 — Export `buildPriceProjection` function from `@warpgogol/pbp` (maps to acceptance criterion 3)
- [ ] O3 — Extend `PbpWebsiteProjection` with optional `priceProjections` field (maps to acceptance criterion 4)
- [ ] O4 — Extend `PbpAiAnswerProjection` with optional `priceTraces` field (maps to acceptance criterion 5)
- [ ] O5 — Implement `allowedUses` enforcement in `buildPriceProjection` returning `null` when prohibited (maps to acceptance criterion 6)
- [ ] O6 — Display config follows RFC-0735 decisions #29, #31, #32, #33, #34 (maps to acceptance criterion 7)
- [ ] O7 — `tsc --noEmit` and `vitest run` pass (maps to acceptance criteria 8, 9)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/projections/price-projection.ts` — **new file**: `PbpPriceProjection`, `PbpPriceDisplayConfig`, `buildPriceProjection`, `DEFAULT_DISPLAY_CONFIG`, disclosure note templates
- `packages/pbp/src/projections/website.ts` — **modified**: add optional `priceProjections?: Record<string, PbpPriceProjection>` to `PbpWebsiteProjection`
- `packages/pbp/src/projections/ai-answer.ts` — **modified**: add optional `priceTraces?: Record<string, PbpCurrencyConversionTrace>` to `PbpAiAnswerProjection`
- `packages/pbp/src/index.ts` — **modified**: re-export `PbpPriceProjection`, `PbpPriceDisplayConfig`, `buildPriceProjection`
- `packages/pbp/src/compiler/projection.ts` — **modified**: Phase 12 `generateProjections` calls `buildPriceProjection` for each materialized derived price per locale and attaches `priceProjections` / `priceTraces`

### 2.2 Configuration and data

- No configuration or data files changed. Price projections are build-time derived data.

### 2.3 Documentation and specs

- `packages/pbp/AGENTS.md` — API surface section: add `PbpPriceProjection`, `PbpPriceDisplayConfig`, `buildPriceProjection` under a new "RFC-0742" subsection
- `docs/technology.xml` — synchronize if projection types are declared in the technology Compass

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/pbp run build:check` — scoped typecheck
- `pnpm --filter @warpgogol/pbp run test` — scoped vitest
- `pnpm exec site-kernel run rfc.validate --id RFC-0742` — RFC validation

## 3. Step sequence

### Step 1. Create `price-projection.ts` with types and `buildPriceProjection`

**Goal:** Create the new projection module with all types, the builder function, display config defaults, and disclosure note templates.

**Agent actions:**

- Create `packages/pbp/src/projections/price-projection.ts`
- Define `PbpPriceDisplayConfig` interface (showSourcePrice, showRate, showRateDateNearPrice, note)
- Define `PbpPriceProjection` interface (amount, priceKind, commercialMeaning, display, allowedUses, rate)
- Define `DEFAULT_DISPLAY_CONFIG` constant with values from RFC-0735 decisions #29, #31, #34
- Define disclosure note templates for UK and DE locales, for `derived-price` and `indicative` commercialMeaning values
- Implement `buildPriceProjection(materialized, locale): PbpPriceProjection | null`:
  - Check `allowedUses.presentation` — return `null` if false
  - Format amount using `Intl.NumberFormat(locale, { style: "currency", currency: targetCurrency })`
  - Format rate using `Intl.NumberFormat(locale, { style: "currency", currency: sourceCurrency })`
  - Compose disclosure note from template based on `commercialMeaning` and `locale`
  - Set `display` from `DEFAULT_DISPLAY_CONFIG` with note filled
  - Copy `allowedUses` from materialized price
  - On `Intl.NumberFormat` failure, fall back to `{value} {currency}` format
  - Validate `locale` against site-supported locales; fall back to site default if unsupported
- Import `PbpPriceKind`, `PbpCommercialMeaning`, `PbpCurrentUses`, `PbpCurrencyConversionTrace`, `PbpMaterializedDerivedPrice` from RFC-0740 modules (these types are expected to exist after RFC-0740 implementation; if RFC-0740 is not yet implemented, use forward-compatible type imports)

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check` — typecheck passes with new file

**Completion criterion:** `packages/pbp/src/projections/price-projection.ts` exists, exports `PbpPriceProjection`, `PbpPriceDisplayConfig`, `buildPriceProjection`, and `tsc --noEmit` passes.

**Human review:** no

---

### Step 2. Extend `PbpWebsiteProjection` and `PbpAiAnswerProjection`

**Goal:** Add optional `priceProjections` and `priceTraces` fields to the existing projection interfaces.

**Agent actions:**

- Edit `packages/pbp/src/projections/website.ts`: add `priceProjections?: Record<string, PbpPriceProjection>` to `PbpWebsiteProjection`
- Edit `packages/pbp/src/projections/ai-answer.ts`: add `priceTraces?: Record<string, PbpCurrencyConversionTrace>` to `PbpAiAnswerProjection`
- Import `PbpPriceProjection` from `./price-projection.js` in `website.ts`
- Import `PbpCurrencyConversionTrace` from the RFC-0740 module in `ai-answer.ts`

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check` — typecheck passes with extended interfaces

**Completion criterion:** Both interfaces have the new optional fields and `tsc --noEmit` passes.

**Human review:** no

---

### Step 3. Re-export from `packages/pbp/src/index.ts`

**Goal:** Make the new types and function available from the package barrel.

**Agent actions:**

- Add export block to `packages/pbp/src/index.ts`:
  ```ts
  // RFC-0742: Currency-Aware Price Projection
  export {
    type PbpPriceProjection,
    type PbpPriceDisplayConfig,
    buildPriceProjection,
  } from "./projections/price-projection.js";
  ```

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check` — typecheck passes with re-exports

**Completion criterion:** `PbpPriceProjection`, `PbpPriceDisplayConfig`, and `buildPriceProjection` are importable from `@warpgogol/pbp`.

**Human review:** no

---

### Step 4. Extend compiler Phase 12 to call `buildPriceProjection`

**Goal:** Wire `buildPriceProjection` into the existing projection generation step.

**Agent actions:**

- Edit `packages/pbp/src/compiler/projection.ts`:
  - Import `buildPriceProjection` from `../projections/price-projection.js`
  - In `generateProjections`, after building each `PbpWebsiteProjection` and `PbpAiAnswerProjection`, check if `graph.derivedPrices` exists (from RFC-0740)
  - For each Offering with materialized derived prices, call `buildPriceProjection(materialized, locale)` for each target currency
  - Attach non-null results to `priceProjections` on the website projection
  - Attach `materialized.trace` to `priceTraces` on the AI answer projection (when `allowedUses.aiAnswers` is true)
  - Skip entirely when `graph.derivedPrices` is absent (no multi-currency entitlement)

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check` — typecheck passes with extended projection logic

**Completion criterion:** Compiler Phase 12 produces `priceProjections` and `priceTraces` when derived prices are materialized, and omits them otherwise.

**Human review:** no

---

### Step 5. Write unit tests for `buildPriceProjection`

**Goal:** Test the projection builder covering formatting, note composition, `allowedUses` enforcement, and fallback behavior.

**Agent actions:**

- Create `packages/pbp/src/projections/__tests__/price-projection.test.ts`
- Test cases:
  1. `buildPriceProjection` with `commercialMeaning: "derived-price"` and locale `uk` — produces UK note template
  2. `buildPriceProjection` with `commercialMeaning: "derived-price"` and locale `de` — produces DE note template
  3. `buildPriceProjection` with `commercialMeaning: "indicative"` and locale `uk` — produces UK indicative note
  4. `buildPriceProjection` with `allowedUses.presentation: false` — returns `null`
  5. `buildPriceProjection` with valid input — `formatted` field contains non-breaking space (U+00A0)
  6. `buildPriceProjection` with unsupported locale — falls back to site default locale
  7. `DEFAULT_DISPLAY_CONFIG` — `showSourcePrice` is `false`, `showRate` is `true`, `showRateDateNearPrice` is `false`
  8. `buildPriceProjection` output includes `rate.pair` in `"SOURCE/TARGET"` format
- Create a mock `PbpMaterializedDerivedPrice` fixture for tests

**Validation:**

- `pnpm --filter @warpgogol/pbp run test` — all tests pass

**Completion criterion:** All test cases pass and cover the acceptance criteria for display config, note composition, and `allowedUses` enforcement.

**Human review:** no

---

### Step 6. Update `packages/pbp/AGENTS.md` and Compass docs

**Goal:** Synchronize documentation with the new exported types.

**Agent actions:**

- Edit `packages/pbp/AGENTS.md`: add a new "RFC-0742: Currency-Aware Price Projection" subsection under the API surface section listing `PbpPriceProjection`, `PbpPriceDisplayConfig`, `buildPriceProjection`
- Check `docs/technology.xml` for projection type declarations; add entries if the technology Compass tracks projection types
- Verify every file in `scope.docs` is either updated or documented as not-applicable

**Validation:**

- `git diff --name-only` shows updated `packages/pbp/AGENTS.md` and optionally `docs/technology.xml`

**Completion criterion:** `packages/pbp/AGENTS.md` documents the new types; `docs/technology.xml` is updated or documented as not-applicable.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations (RFC-IMP-02). For unchecked `[ ]` criteria, document why.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0742 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0742`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0742`
- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/pbp run test`
- `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0742 --implementation-commit <sha>`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0742` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Localization of disclosure notes | Step 1 defines UK and DE note templates in the projection builder; Step 5 tests both locales |
| Projection size (Offering × currency × locale) | Step 4 only attaches projections when derived prices exist; Step 5 verifies the output shape |
| `Intl.NumberFormat` non-breaking space in formatted output | Step 1 handles fallback; Step 5 tests for U+00A0 presence |
| Unsupported locale fallback | Step 1 validates locale against site-supported locales; Step 5 tests fallback behavior |

## 6. Escalation triggers

- If RFC-0740 types (`PbpMaterializedDerivedPrice`, `PbpCurrencyConversionTrace`, `PbpCurrentUses`, `PbpPriceKind`, `PbpCommercialMeaning`) are not yet implemented, block Step 1 and report: "RFC-0740 must be implemented first — this RFC depends on its types."
- If implementation reveals an invariant conflict with DNA-4 or DNA-55, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0742 --reason "..." --invariant "DNA-N"` instead of working around it.
