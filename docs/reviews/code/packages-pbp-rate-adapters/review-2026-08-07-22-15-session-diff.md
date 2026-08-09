# Code Review — Session 2026-08-07

**Scope**: `git diff b51068fa...HEAD` (2 commits, 25 files, +1153/-46) **Fixed point**: `b51068fa` (mission.close warpgogol-com-m000036) **Commits reviewed**:

- `898a0fec` feat: multi-currency UI integration (RFC-0735, mission warpgogol-com-m000036)
- `3bbaf696` feat: add Frankfurter rate source adapter (RFC-0744)

## Mechanical floor

| Package                             | `build:check` | Tests      |
| ----------------------------------- | ------------- | ---------- |
| `@warpgogol/pbp-rate-adapters`      | PASS          | 15/15 PASS |
| `@warpgogol/pbp`                    | PASS          | —          |
| `@warpgogol/share`                  | PASS          | —          |
| `@warpgogol/ui`                     | PASS          | —          |
| `@warpgogol/site-kernel-checks`     | PASS          | —          |
| `@warpgogol/site-kernel-codegen`    | PASS          | —          |
| `@warpgogol/site-kernel-onboarding` | PASS          | —          |

All affected packages pass typecheck. No mechanical failures.

---

## Axis A — Structural correctness

### A-1 · FAIL · `NOTE_TEMPLATES` hardcoded in shared package component

**File**: `packages/ui/src/sections/price-card/price-card-section.astro:96-99` **Severity**: Medium

```ts
const NOTE_TEMPLATES: Record<string, string> = {
  de: "Preis berechnet nach Kurs 1 EUR = {rate} {currency}.",
  uk: "Ціна розрахована за курсом 1 EUR = {rate} {currency}.",
};
```

User-visible copy is hardcoded in a shared UI component. Only `de` and `uk` are supported — any other locale falls back to `de`. Adding a new language requires editing a shared package, not site content.

**Fix**: Move note templates to `src/content/site/{lang}/labels.md` under a `priceCard.noteTemplate` key. Read via `getSiteSectionLabels` (already called on line 38). Fall back to `de` if missing.

### A-2 · FAIL · `offeringRef` accessed via untyped cast instead of `props`

**File**: `packages/ui/src/sections/price-card/price-card-section.astro:112` **Severity**: Low

```ts
const offeringRef = (pageOverride as Record<string, unknown>).offeringRef as string | undefined;
```

`offeringRef` was added to the manifest schema (`price-card-section.manifest.yaml:30`) and generated types (`price-card-section.types.generated.ts:11`), but the code bypasses the typed `props` and casts through `Record<string, unknown>`. Should be:

```ts
const offeringRef = props.offeringRef;
```

### A-3 · FAIL · `DerivedPriceEntry` duplicates `PbpMaterializedDerivedPrice`

**File**: `packages/ui/src/sections/price-card/price-card-section.astro:86-94` **Severity**: Low

The `DerivedPriceEntry` interface is a hand-written subset of `PbpMaterializedDerivedPrice` from `@warpgogol/pbp` (RFC-0740). The two types will diverge over time. Import the canonical type instead.

### A-4 · PASS · Frankfurter adapter follows established ECB adapter pattern

**File**: `packages/pbp-rate-adapters/src/adapters/frankfurter.ts`

Clean implementation. Same `RateSourceAdapter` interface, same `createXxxAdapter(sourceContractRef, fetchFn)` factory, same test structure. No structural issues.

### A-5 · PASS · Command scope corrections are correct

**File**: `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts:748,778,812`

`rate-snapshot.resolve`, `currency-pricing.compile`, `derived-prices.materialize` changed from `scope: "workspace"` to `scope: "app"`. These commands operate per-site (they need a `--system` flag), so `app` is correct.

### A-6 · PASS · `currency-pricing-compile.ts` derivationContractRef removal

**File**: `packages/os/site-kernel-checks/src/currency-pricing-compile.ts:120-127`

The `derivationContractRef` entity lookup was removed. The inline comment explains: it's a derivation model reference (e.g. `pbp-derivation:currency-conversion/1`), not a PBP entity URI. Removal is justified — the old code was a false validation that would fail on valid input.

### A-7 · PASS · CSS token fix is correct

**File**: `packages/ui/src/components/currency-aware-price-display/currency-aware-price-display-component.css:27,35,37`

`--ds-size-text-lg` → `--ds-text-lg`, `--ds-size-text-sm` → `--ds-text-sm`, removed fallback on `--ds-color-text-muted`. These are the correct token names from `@warpgogol/tokens`.

### A-8 · PASS · `glob` pattern scoping in `pbp/astro.ts` is correct

**File**: `packages/pbp/src/astro.ts:50-54`

Changed from `fsDataCollectionLoader` (which globbed all `.md` and `.yaml` in `business-profile/`) to `glob({ pattern: ["rate-snapshots/**/*.md", "rate-snapshots/**/*.yaml", "!**/AGENTS.md"] })`. This correctly prevents non-entity files (`migration-coverage-report.yaml`, `owner-decision-register.yaml`) from being validated against the strict `rateSnapshotSchema`.

### A-9 · PASS · Frankfurter adapter tests

**File**: `packages/pbp-rate-adapters/src/tests/frankfurter-adapter.test.ts`

6 tests covering: parse valid response, parse invalid JSON, parse missing fields, direct rate fetch, cross-rate fetch, fetch failure. Good coverage.

---

## Axis B — DNA alignment

### B-1 · FAIL · DNA-4 violation — hardcoded copy in shared component

`NOTE_TEMPLATES` (see A-1) violates DNA-4: "All user-visible copy, configuration, and metadata live in `src/content/`. Page routes and components must not hard-code copy strings or configuration that belongs in the content layer."

### B-2 · PASS · DNA-5 (Component ↔ content ↔ schema mirror)

`currency-selector` handler registered in `SITE_CONTENT_HANDLERS`, labels added to `de/labels.md` and `uk/labels.md`. Mirror quintet satisfied.

### B-3 · PASS · DNA-10 (No hardcoded design tokens)

CSS fix corrects invalid token names. No raw colors or sizes introduced.

### B-4 · PASS · DNA-17 (Uni manifest contract)

`offeringRef` added to `price-card-section.manifest.yaml` `propsSchema` and `price-card-section.types.generated.ts`. Manifest and types are in sync.

### B-5 · PASS · DNA-20 (superseded by RFC-0471)

PBP used as canonical business layer. `loadTargetCurrencies` correctly reads from PBP compiler output.

---

## Axis C — Ecosystem fit

### C-1 · FAIL · `packages/ui` reads app-specific generated file from `process.cwd()`

**File**: `packages/ui/src/sections/price-card/price-card-section.astro:103` **Severity**: Medium

```ts
const filePath = join(process.cwd(), "src", "derived-prices.generated.json");
```

A shared UI section reads a workpiece-specific generated file via `process.cwd()`. This creates an implicit contract: any site using `price-card` with `offeringRef` must have `src/derived-prices.generated.json` at that exact path. The file is gitignored and only exists during builds.

The `loadDerivedPrices` function silently returns `null` on failure (file not found), so sites without derived prices degrade gracefully. But the pattern leaks app-specific assumptions into a reusable package.

**Precedent**: The open-source registry section reads `build-identity.json` from `public/.well-known/` the same way (documented in `packages/ui/AGENTS.md`). However, `build-identity.json` is a universal build artifact, while `derived-prices.generated.json` is specific to sites with multi-currency pricing.

**Recommendation**: Either (a) document this as an explicit contract in `packages/ui/AGENTS.md`, or (b) pass derived prices as a prop from the route template (where `loadTargetCurrencies` is already called).

### C-2 · PASS · Package boundary imports

No `apps/*` or `missions/*` imports in `packages/*`. No `services/*` imports in packages. Frankfurter adapter imported via `@warpgogol/pbp-rate-adapters` barrel in the worker service.

### C-3 · PASS · Node-only modules

`readFileSync` and `join` from `node:fs`/`node:path` are used in `.astro` frontmatter (build-time only). Not re-exported from barrel files. Acceptable.

---

## Axis D — Forward-only discipline

### D-1 · PASS · `fsDataCollectionLoader` → `glob` is a fix, not a removal

The old loader was too broad (globbed all YAML in `business-profile/`). The new `glob` pattern is correctly scoped. No functionality lost — `fsDataCollectionLoader` is still used by other collections.

### D-2 · PASS · `derivationContractRef` lookup removal is justified

The inline comment explains the rationale (see A-6). The removed code was a false validation, not a feature.

### D-3 · PASS · Gitignore additions are additive

Rate snapshots, derived prices, and content-ref-index added to both the gitignore template and the workpiece `.gitignore`. No existing gitignore entries removed.

---

## Axis E — Agent clarity

### E-1 · FAIL · `loadTargetCurrencies` silently swallows compiler errors

**File**: `packages/pbp/src/semantic-profile.ts:59-61` **Severity**: Medium

```ts
  } catch {
    // No CurrencyPricingPolicy found — return empty array
  }
```

The catch block comment says "No CurrencyPricingPolicy found" but actually catches **all** errors from `compilePbpProfile` — including schema validation errors, file I/O errors, and compiler crashes. A broken `business-profile/` directory would silently produce an empty currency selector instead of a build error.

**Fix**: Narrow the catch. If the compiler succeeds but no `currency-pricing-policy` entity exists, return `[]`. If the compiler throws, let the error propagate (or log it).

### E-2 · FAIL · `loadDerivedPrices` silently swallows all errors

**File**: `packages/ui/src/sections/price-card/price-card-section.astro:101-108` **Severity**: Low

```ts
function loadDerivedPrices(): Record<string, DerivedPriceEntry[]> | null {
  try {
    const filePath = join(process.cwd(), "src", "derived-prices.generated.json");
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Record<string, DerivedPriceEntry[]>;
  } catch {
    return null;
  }
}
```

Catches both "file not found" (expected — file is gitignored) and JSON parse errors (unexpected — indicates corruption). Should distinguish `ENOENT` from parse errors.

### E-3 · PASS · `currencySelectorHandler` empty currencies is intentional

**File**: `packages/share/src/astro/site-content-handlers.ts:226-232`

The handler returns `currencies: []` because the actual currencies are passed as a prop from the route template (via `loadTargetCurrencies`). The handler only provides the localized `label`. This is a valid split — content handler owns labels, route owns data.

---

## Axis F — Pragmatism

### F-1 · WARN · `compilePbpProfile` called twice per page render

**File**: Route templates (`index.template.astro`, `[...slug].template.astro`, `[lang]/[...slug].template.astro`, `404.template.astro`)

Each route template calls both `loadTargetCurrencies(...)` and `buildPbpSemanticProfile(...)`. Both internally call `compilePbpProfile(...)` with the same arguments. The PBP compiler runs twice per page.

For a static site generator this is not a blocker (build time increases linearly), but it's wasteful. Consider caching the compiler result or merging the two calls.

### F-2 · PASS · Frankfurter adapter is a clean addition

No over-engineering. Same interface as ECB. Worker selects via Supabase `rate_sources.adapter` config. No speculative features.

---

## Axis G — Test coverage

### G-1 · PASS · Frankfurter adapter tests

6 tests covering parsing, direct rate, cross-rate, and error cases.

### G-2 · WARN · No tests for `loadTargetCurrencies`

**File**: `packages/pbp/src/semantic-profile.ts:35-63`

New exported function with no tests. The function has a silent catch block (E-1) that could hide bugs. At minimum, a test should verify: (a) returns currencies when policy exists, (b) returns empty array when no policy, (c) propagates or handles compiler errors.

### G-3 · WARN · No tests for `buildPriceVariants` or `loadDerivedPrices`

**File**: `packages/ui/src/sections/price-card/price-card-section.astro:101-157`

Two new functions with non-trivial logic (file I/O, JSON parsing, price formatting, note generation) and no tests. The functions are in an `.astro` file which makes them harder to test, but the logic could be extracted to a `.ts` module.

---

## Summary

| Axis              | Findings                       |
| ----------------- | ------------------------------ |
| A — Structural    | 3 FAIL (A-1, A-2, A-3), 6 PASS |
| B — DNA           | 1 FAIL (B-1/DNA-4), 4 PASS     |
| C — Ecosystem     | 1 FAIL (C-1), 2 PASS           |
| D — Forward-only  | 3 PASS                         |
| E — Agent clarity | 2 FAIL (E-1, E-2), 1 PASS      |
| F — Pragmatism    | 1 WARN (F-1), 1 PASS           |
| G — Tests         | 1 PASS, 2 WARN (G-2, G-3)      |

**Total**: 6 FAIL, 2 WARN, 13 PASS

### Priority order for fixes

1. **A-1 / B-1** — Move `NOTE_TEMPLATES` to content layer (DNA-4 violation)
2. **E-1** — Narrow catch in `loadTargetCurrencies` to not swallow compiler errors
3. **C-1** — Document or refactor `derived-prices.generated.json` reading pattern
4. **A-2** — Use typed `props.offeringRef` instead of untyped cast
5. **A-3** — Import `PbpMaterializedDerivedPrice` instead of duplicating
6. **E-2** — Distinguish ENOENT from parse errors in `loadDerivedPrices`
7. **G-2, G-3** — Add tests for new functions
