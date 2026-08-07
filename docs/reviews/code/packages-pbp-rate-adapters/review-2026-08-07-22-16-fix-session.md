# Code Review — Fix Session 2026-08-07

**Scope**: `git diff 3bbaf696...HEAD` (2 commits, 9 files, +732/-94)
**Commits reviewed**:
- `366c6e9e` fix(pbp,ui): review fixes for multi-currency pricing session
- `7498f692` compass: update headers for changed files

**Workpiece commit**: `cd2923b` fix(site): move priceCard noteTemplate to content layer (DNA-4)

## Mechanical floor

| Package | `build:check` | Tests |
| --- | --- | --- |
| `@warpgogol/ui` | PASS | 51/51 PASS |
| `@warpgogol/pbp` | PASS | 263/263 PASS |
| `@warpgogol/pbp-rate-adapters` | PASS | — |

All affected packages pass. No mechanical failures.

---

## Axis A — Structural correctness

### A-1 · WARN · `formatPrice` duplicated between `.astro` and `price-variants.ts`

**File**: `packages/ui/src/sections/price-card/price-card-section.astro:70-87` and `packages/ui/src/sections/price-card/price-variants.ts:39-53`

The `formatPrice` function is duplicated verbatim in both files. The `.astro` file uses it for `monthlyPrice`/`yearlyPrice`/`setupPrice` (the non-variant display), while `price-variants.ts` uses it internally for the source-currency variant. Both have the same `Intl.NumberFormat` options, same `formatRecurrence` suffix logic, same `EUR` fallback.

This is a **Duplicated Code** smell. If the formatting logic changes (e.g. different fraction digits), both copies must be updated in lockstep.

**Fix**: Export `formatPrice` from `price-variants.ts` and import it in the `.astro` file, removing the inline copy.

### A-2 · PASS · `buildPriceVariants` extraction is clean

The function signature takes all dependencies as parameters (`offeringRef`, `derivedPrices`, `noteTemplate`) — no hidden state, no file I/O. Pure function, easily testable. The `.astro` file calls it with the loaded values. Good separation.

### A-3 · PASS · `loadDerivedPrices` ENOENT handling is correct

**File**: `packages/ui/src/sections/price-card/price-card-section.astro:89-99`

The catch block correctly distinguishes `ENOENT` (file not found → return `null`) from all other errors (→ throw). `JSON.parse` errors will now propagate as build failures instead of being silently swallowed. The `(err as NodeJS.ErrnoException).code` cast is the standard Node.js pattern.

### A-4 · PASS · `loadTargetCurrencies` error propagation is correct

**File**: `packages/pbp/src/semantic-profile.ts:36-59`

The catch-all block was removed. `compilePbpProfile` errors now propagate. The function returns `[]` only when the compiler succeeds but no `currency-pricing-policy` entity exists in the index. This is the correct semantic: "no policy" is a valid state, "compiler error" is a build failure.

### A-5 · PASS · `props.offeringRef` typed access

**File**: `packages/ui/src/sections/price-card/price-card-section.astro:102`

`props.offeringRef` is now accessed via the typed `PriceCardSectionContent` interface (which includes `offeringRef?: string` from the manifest schema change). The `Record<string, unknown>` cast is gone.

### A-6 · PASS · `DerivedPriceEntry` interface in `price-variants.ts`

The interface is structurally compatible with `PbpMaterializedDerivedPrice` from `@warpgogol/pbp` but avoids the cross-package dependency. This is the correct trade-off — `@warpgogol/ui` should not depend on `@warpgogol/pbp` (UI package stays business-layer-agnostic). The interface is exported and documented.

### A-7 · PASS · No dead code, no magic numbers

No unreachable branches, no untyped data, no speculative generality introduced.

---

## Axis B — DNA alignment

### B-1 · PASS · DNA-4 (content layer owns copy)

`NOTE_TEMPLATES` removed from `price-card-section.astro`. Note templates now live in `labels.md` under `sections.priceCard.noteTemplate` for both `de` and `uk`. The `.astro` file reads the template via `siteLabels?.noteTemplate`. DNA-4 violation from the previous review is resolved.

### B-2 · PASS · DNA-5 (Component ↔ content ↔ schema mirror)

`noteTemplate` is a content-only field (no schema change needed — it's a label, not a prop). The `offeringRef` prop was already added to the manifest and generated types in the prior session. No mirror quintet changes needed.

### B-3 · PASS · DNA-10 (No hardcoded design tokens)

No CSS changes in this diff. No raw colors or sizes introduced.

### B-4 · PASS · DNA-17 (Uni manifest contract)

No manifest changes in this diff. The `offeringRef` addition was done in the prior session and is already in sync.

---

## Axis C — Ecosystem fit

### C-1 · PASS · Package boundary imports

No new cross-package imports added. `price-variants.ts` imports only from `@warpgogol/share/formula-eval` (already a dependency). The `.astro` file imports from the local `price-variants.ts` module. No `@warpgogol/pbp` import in `@warpgogol/ui` (correctly avoided).

### C-2 · PASS · `derived-prices.generated.json` contract documented

**File**: `packages/ui/AGENTS.md:60`

The contract is now documented alongside the existing `build-identity.json` precedent. The documentation explains: file path, generator command, gitignored status, degradation behavior, and shape.

### C-3 · PASS · Node-only modules

`readFileSync` and `join` from `node:fs`/`node:path` remain in the `.astro` frontmatter (build-time only). Not re-exported from barrel files. `price-variants.ts` has no Node-only imports.

---

## Axis D — Forward-only discipline

### D-1 · PASS · No removals without investigation

The catch-all block in `loadTargetCurrencies` was removed — this is a fix, not a removal of a feature. The `NOTE_TEMPLATES` constant was removed — the copy was moved to the content layer, not deleted. No fields, props, or config entries removed.

### D-2 · PASS · No backward compatibility layers

No compatibility shims introduced. The refactoring is clean — the `.astro` file delegates to the extracted module.

---

## Axis E — Agent clarity

### E-1 · PASS · `loadTargetCurrencies` no longer swallows errors

The function's behavior is now clear: compiler errors propagate, missing policy returns `[]`. An agent reading this function can reason about failure modes without guessing what the catch block hides.

### E-2 · PASS · `loadDerivedPrices` error handling is explicit

The `ENOENT` check is the standard Node.js pattern. An agent reading this function understands: file-not-found is expected (gitignored generated file), all other errors are build failures.

### E-3 · PASS · `price-variants.ts` MODULE_CONTRACT is accurate

The `<purpose>` and `<non-goals>` correctly describe the module's scope. The `CHANGE_SUMMARY` references the review fix that created it.

### E-4 · PASS · Test names are descriptive

All test names describe the scenario being tested (e.g. "returns null when offeringRef is undefined", "builds source + derived variants with note"). An agent can understand test coverage by reading the `describe`/`it` blocks.

---

## Axis F — Pragmatism

### F-1 · PASS · `buildPriceVariants` parameter count

The function takes 6 parameters. While this is on the higher end, all parameters are necessary and the function is pure. Bundling them into a context object would add indirection without clarity. Acceptable for a pure utility function.

### F-2 · PASS · No over-engineering

The extraction is minimal — one function, one type, one helper. No speculative abstractions, no unnecessary interfaces, no factory patterns.

---

## Axis G — Test coverage

### G-1 · PASS · `buildPriceVariants` tests (9 tests)

Covers: all null-return conditions (offeringRef, derivedPrices, sourceProp, offeringRef not in map, chargeRef no match, single variant only), positive case (source + derived with note), undefined noteTemplate. Good edge-case coverage.

### G-2 · PASS · `loadTargetCurrencies` tests (3 tests)

Covers: policy with currencies, no policy (empty array), invalid directory (throws). The `vi.mock("astro:content")` pattern is necessary because `semantic-profile.ts` re-exports from `semantic-model.ts` which imports `astro:content`.

### G-3 · WARN · No test for `loadDerivedPrices` ENOENT vs parse-error distinction

**File**: `packages/ui/src/sections/price-card/price-card-section.astro:89-99`

The `loadDerivedPrices` function has non-trivial error handling (ENOENT → null, other → throw) but no test. The function is in an `.astro` file which makes direct testing difficult. However, the ENOENT behavior is the critical path (sites without derived prices) and deserves coverage.

**Fix**: Either extract `loadDerivedPrices` to `price-variants.ts` (or a separate `derived-prices-loader.ts`) and test it, or accept the risk since the ENOENT path is exercised by every site without multi-currency pricing during build.

---

## Summary

| Axis | Findings |
| --- | --- |
| A — Structural | 0 FAIL, 1 WARN (A-1), 6 PASS |
| B — DNA | 4 PASS |
| C — Ecosystem | 3 PASS |
| D — Forward-only | 2 PASS |
| E — Agent clarity | 4 PASS |
| F — Pragmatism | 2 PASS |
| G — Tests | 2 PASS, 1 WARN (G-3) |

**Total**: 0 FAIL, 2 WARN, 21 PASS

### Remaining findings

1. **A-1 (WARN)** — `formatPrice` duplicated between `.astro` and `price-variants.ts`. Export from `price-variants.ts` and import in `.astro`.
2. **G-3 (WARN)** — `loadDerivedPrices` ENOENT/parse-error distinction untested. Consider extracting to a testable module.

Both are WARN, not FAIL. The fixes from the previous review (6 FAIL, 2 WARN) are all resolved. No new failures introduced.
