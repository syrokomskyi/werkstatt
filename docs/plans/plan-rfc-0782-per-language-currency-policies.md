---
rfcId: RFC-0782
planId: PLAN-RFC-0782-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - werkstatt-site
  services: []
  docs:
    - docs/rfcs/rfc-0782-per-language-currency-policies-via-locale-scoped-pbp-overrides.md
---

# Implementation Plan: RFC-0782

## 1. Objectives

- [ ] O1 — Create UK currency-pricing-policy overlay with EUR base + UAH target (maps to acceptance: "uk/currency-pricing-policies/default.md created")
- [ ] O2 — Change localStorage key from `wg-currency` to `wg-currency:{lang}` pattern in client API (maps to acceptance: "CURRENCY_STORAGE_KEY changed", "getSelectedCurrency(lang)", "setSelectedCurrency(currency, lang)")
- [ ] O3 — Update all three inline scripts to use locale-scoped localStorage key (maps to acceptance: header, currency-selector, currency-aware-price-display inline scripts)
- [ ] O4 — Update `initCurrencySelector` and `initCurrencyAwarePriceDisplay` to accept and use `lang` (maps to acceptance: "initCurrencySelector accepts lang", "currency-aware-price-display-component.client.ts uses getSelectedCurrency(lang)")
- [ ] O5 — Update unit tests for locale-scoped key behavior (maps to acceptance: "Unit test: getCurrencyStorageKey", "Unit test: getSelectedCurrency/setSelectedCurrency")
- [ ] O6 — Verify `loadTargetCurrencies` returns `[EUR, UAH]` for UK locale after RFC-0781 deep-merge (maps to acceptance: "loadTargetCurrencies returns [EUR, UAH] for UK locale")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.client.ts` — locale-scoped key, `lang` parameter on all functions
- `packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.client.test.ts` — update tests for `lang` parameter
- `packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.astro` — pass `lang` to `initCurrencySelector`, update inline script `define:vars`
- `packages/werkstatt-site/src/domain/ui/components/header/header-component.astro` — update inline script `define:vars` with `lang`
- `packages/werkstatt-site/src/domain/ui/components/currency-aware-price-display/currency-aware-price-display-component.client.ts` — `getSelectedCurrency(lang)` call
- `packages/werkstatt-site/src/domain/ui/components/currency-aware-price-display/currency-aware-price-display-component.client.test.ts` — update tests for `lang` parameter
- `packages/werkstatt-site/src/domain/ui/components/currency-aware-price-display/currency-aware-price-display-component.astro` — update inline script to read `document.documentElement.lang`
- `packages/werkstatt-site/src/domain/pbp/__tests__/load-target-currencies.test.ts` — add UK locale test

### 2.2 Configuration and data

- `missions/warpgogol-com-m000042/workpiece/src/content/business-profile/uk/currency-pricing-policies/default.md` — new UK currency policy overlay

### 2.3 Documentation and specs

- RFC file (read-only reference)
- No AGENTS.md updates needed (`packages/werkstatt-site/AGENTS.md` does not mention `wg-currency`)
- No Compass XML sync needed (no repository-wide semantics changed)

### 2.4 Validation and pipelines

- `pnpm --filter werkstatt-site run build:check` (tsc --noEmit)
- `pnpm --filter werkstatt-site run test` (vitest run)
- `pnpm exec werkstatt run rfc.validate --id RFC-0782`

## 3. Step sequence

### Step 1. Create UK currency-pricing-policy overlay

**Goal:** Create the UK overlay file that provides the same currency policy as DE (EUR base + UAH target).

**Agent actions:**

- Create `missions/warpgogol-com-m000042/workpiece/src/content/business-profile/uk/currency-pricing-policies/default.md`
- Use the same entity ID as DE: `https://warpgogol.com/id/currency-pricing-policy/default`
- Same structure as DE: EUR base, UAH target with `derived` strategy, same rate policy ref, same pipeline override, same governance
- Commit via `mission.git.commit`

**Validation:**

- File exists at the correct path
- YAML frontmatter parses correctly
- Entity ID matches DE version

**Completion criterion:** UK overlay file created with EUR base + UAH target, same entity ID as DE.

**Human review:** no

---

### Step 2. Modify `currency-selector-component.client.ts` — locale-scoped key and `lang` parameter

**Goal:** Change the localStorage key from `wg-currency` to `wg-currency:{lang}` and add `lang` parameter to all public functions.

**Agent actions:**

- Replace `CURRENCY_STORAGE_KEY = "wg-currency"` with `CURRENCY_STORAGE_KEY_PREFIX = "wg-currency"` and add `getCurrencyStorageKey(lang: string): string` helper returning `"wg-currency:" + lang`
- `getSelectedCurrency(lang: string)` — uses `getCurrencyStorageKey(lang)`
- `setSelectedCurrency(currency: string, lang: string)` — uses `getCurrencyStorageKey(lang)`
- `initCurrencySelector(container, currencies, lang)` — passes `lang` to `getSelectedCurrency` and `setSelectedCurrency`
- Keep `CURRENCY_CHANGE_EVENT` unchanged
- Keep `dispatchCurrencyChange` unchanged (no localStorage interaction)
- Update `CHANGE_SUMMARY` with RFC-0782 entry

**Validation:**

- `pnpm --filter werkstatt-site run build:check` passes

**Completion criterion:** All public functions accept `lang`, localStorage key is locale-scoped, tsc passes.

**Human review:** no

---

### Step 3. Update `currency-selector-component.astro` — pass `lang`, update inline script

**Goal:** Pass `lang` to `initCurrencySelector` and update the inline script to use the locale-scoped key.

**Agent actions:**

- In the module script, pass `lang` to `initCurrencySelector(container, codes, lang)`
- In the inline script `define:vars`, add `lang` (already available from component props)
- In the inline script body, change `localStorage.getItem("wg-currency")` to `localStorage.getItem("wg-currency:" + lang)`
- Update `CHANGE_SUMMARY` with RFC-0782 entry

**Validation:**

- `pnpm --filter werkstatt-site run build:check` passes

**Completion criterion:** Inline script uses locale-scoped key, `initCurrencySelector` receives `lang`.

**Human review:** no

---

### Step 4. Update `header-component.astro` inline script

**Goal:** Update the header inline script to use the locale-scoped localStorage key.

**Agent actions:**

- In the inline script `define:vars`, add `lang: activeLang`
- Change `localStorage.getItem("wg-currency")` to `localStorage.getItem("wg-currency:" + lang)`
- Change `localStorage.setItem("wg-currency", c)` to `localStorage.setItem("wg-currency:" + lang, c)`

**Validation:**

- `pnpm --filter werkstatt-site run build:check` passes

**Completion criterion:** Header inline script uses locale-scoped key with `lang` from `define:vars`.

**Human review:** no

---

### Step 5. Update `currency-aware-price-display` component — inline script, client, and callers

**Goal:** Add `lang` prop to the component, update the inline script to use build-time `lang` via `define:vars`, update the client script to accept `lang`, and pass `lang` from all caller components.

**Agent actions:**

**5a. `currency-aware-price-display-component.astro`:**

- Add `lang: string` to `Props` interface
- Destructure `lang` from `Astro.props`
- In inline script `define:vars`, add `lang` (build-time baking): `define:vars={{ variantCurrencies, lang }}`
- Change `localStorage.getItem("wg-currency")` to `localStorage.getItem("wg-currency:" + lang)`
- In module script, read `document.documentElement.lang` and pass to `initCurrencyAwarePriceDisplay(container, document.documentElement.lang)` (module script runs client-side, `document.documentElement.lang` is set by layout)
- Update `CHANGE_SUMMARY` with RFC-0782 entry

**5b. `currency-aware-price-display-component.client.ts`:**

- `initCurrencyAwarePriceDisplay(container: HTMLElement, lang: string)` — accept `lang` parameter
- Pass `lang` to `getSelectedCurrency(lang)`
- Update `CHANGE_SUMMARY` with RFC-0782 entry

**5c. Update all caller components to pass `lang`:**

- `sections/faq-list/faq-list-section.astro` — 2 instances: `<CurrencyAwarePriceDisplay priceVariants={part.variants} lang={lang} />`
- `sections/price-card/price-card-section.astro` — 3 instances: add `lang={lang}`
- `sections/ownership-block/ownership-block-section.astro` — 1 instance: add `lang={lang}`
- `sections/hero-decision-card/hero-decision-card-section.astro` — 2 instances: add `lang={lang}`
- `sections/transparency/transparency-section.astro` — 1 instance: add `lang={lang}`
- `components/section-body/paragraphs/section-paragraphs.astro` — 1 instance: add `lang={lang}`
- `components/section-body/cards/section-card-grid.astro` — 2 instances: add `lang={langCode}` (component uses `langCode` variable)
- `components/section-body/list/section-list.astro` — check for instances and add `lang={lang}`
- `components/section-header/section-header.astro` — check for instances and add `lang={lang ?? "de"}`
- `sections/markdown/markdown-section.astro` — module script calls `initCurrencyAwarePriceDisplay(container)` — update to `initCurrencyAwarePriceDisplay(container, document.documentElement.lang)`

**Validation:**

- `pnpm --filter werkstatt-site run build:check` passes

**Completion criterion:** Component has `lang` prop, inline script uses `define:vars` with build-time `lang`, all callers pass `lang`, client script accepts `lang`, tsc passes.

**Human review:** no

---

### Step 6. Update unit tests

**Goal:** Update existing tests and add new tests for locale-scoped key behavior.

**Agent actions:**

- Update `currency-selector-component.client.test.ts`:
  - All `getSelectedCurrency()` calls → `getSelectedCurrency("de")` (or appropriate lang)
  - All `setSelectedCurrency(currency)` calls → `setSelectedCurrency(currency, "de")`
  - All `initCurrencySelector(container, currencies)` calls → `initCurrencySelector(container, currencies, "de")`
  - All `CURRENCY_STORAGE_KEY` references → `"wg-currency:de"` (or appropriate lang)
  - Add test: `getCurrencyStorageKey` produces `wg-currency:de` for `de`, `wg-currency:uk` for `uk`
  - Add test: `getSelectedCurrency` and `setSelectedCurrency` use correct locale-scoped key
  - Import `getCurrencyStorageKey` instead of `CURRENCY_STORAGE_KEY`
- Update `currency-aware-price-display-component.client.test.ts`:
  - All `CURRENCY_STORAGE_KEY` references → `"wg-currency:de"` (or appropriate lang)
  - `initCurrencyAwarePriceDisplay(container)` → `initCurrencyAwarePriceDisplay(container, "de")`
  - `mockLocalStorage.setItem("wg-currency:de", "UAH")` instead of `CURRENCY_STORAGE_KEY`
- Add UK locale test to `load-target-currencies.test.ts`:
  - Create UK `currency-pricing-policy` entity with EUR base + UAH target
  - Verify `loadTargetCurrencies` returns `[EUR, UAH]` for UK locale

**Validation:**

- `pnpm --filter werkstatt-site run test` passes

**Completion criterion:** All tests pass with locale-scoped key behavior, new tests for `getCurrencyStorageKey` and UK locale exist.

**Human review:** no

---

### Step 7. Validation, review, fix, and stamp

**Goal:** Run all validation, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter werkstatt-site run build:check` (tsc --noEmit)
- Run `pnpm --filter werkstatt-site run test` (vitest run)
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0782`
- Commit all code changes via `ecosystem.commit` (packages/* changes require ecosystem commit)
- Commit mission workpiece changes via `mission.git.commit`
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Maximum 3 iterations
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with `(evidence: ...)` annotations
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0782 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0782` passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All validation passes; code review passed (findings fixed if any); all acceptance criteria checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0782`
- `pnpm --filter werkstatt-site run build:check`
- `pnpm --filter werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0782` in the subject line (RFC-0265 commit hygiene)
- No `rfc.verification.emit` needed — acceptance probes are commented out in RFC frontmatter

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| RFC-0781 dependency | RFC-0781 is `implemented` — verified before starting. Step 1 UK overlay will work with locale-aware deep-merge. |
| Inline script divergence | Steps 3, 4, 5 update all three inline scripts in the same session. Step 6 tests verify the key pattern. |
| `getSelectedCurrency` API change | Step 2 changes the API. Steps 3, 5 update all callers. Step 6 updates all tests. |
| DE policy retains UAH target | No change to DE policy. Visibility condition `activeLang !== defaultLang` is unchanged. Step 4 only updates the inline script key. |

## 6. Escalation triggers

- If the UK overlay causes a `PBP-ID-LOCALE-DUPLICATE` error during compilation, RFC-0781's locale-aware entity index is not working correctly. Escalate to fixing RFC-0781, not working around it.
- If `loadTargetCurrencies` returns an empty array for UK locale after the overlay is created, the deep-merge in `resolveLocales` may not be resolving correctly. Escalate to RFC-0781's locale resolution, not this RFC.
