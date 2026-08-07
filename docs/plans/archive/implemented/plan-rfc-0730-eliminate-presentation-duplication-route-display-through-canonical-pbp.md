---
rfcId: RFC-0730
planId: PLAN-RFC-0730-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/pbp"
    - "@warpgogol/share"
    - "@warpgogol/ui"
  services: []
  docs:
    - docs/rfcs/rfc-0730-eliminate-presentation-duplication-route-display-through-canonical-pbp.md
    - packages/pbp/AGENTS.md
---

# Implementation Plan: RFC-0730

## 1. Objectives

- [ ] O1 — Schema: remove `presentation` from `offeringSchema`, add `guarantees` field, extend `pbpRelatedOfferingSchema` with `label`/`description` (maps to acceptance criteria 1, 2)
- [ ] O2 — Content: migrate all 12 offering files (6 UK + 6 DE) from `presentation` to canonical fields (maps to acceptance criteria 2–7)
- [ ] O3 — Formatter + Component: add `formatRecurrence` utility in `@warpgogol/share`, update price-card to accept structured `PriceCardPricingProp` props and format via `Intl.NumberFormat` + `formatRecurrence` (maps to acceptance criterion 8)
- [ ] O4 — References: update all `presentation.*` content references in pages, prose, and funnel files to canonical paths with pipe syntax (maps to acceptance criteria 9, 10)
- [ ] O5 — Tests: add unit tests for schema changes and component formatting (maps to acceptance criteria 11–13)
- [ ] O6 — Verify: `rfc.validate`, `build:check`, `astro check`, `pnpm test` all pass (maps to acceptance criteria 11–14)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/schemas/offering.ts` — remove `presentation` field, add `guarantees` field, extend `pbpRelatedOfferingSchema` with `label`/`description`
- `packages/share/src/formula-eval.ts` — export `formatRecurrence` utility (maps ISO 8601 duration → locale-specific suffix)
- `packages/ui/src/sections/price-card/price-card-section.astro` — accept structured `PriceCardPricingProp` props, format via `Intl.NumberFormat` + `formatRecurrence`
- `packages/ui/src/sections/price-card/price-card-section.manifest.yaml` — update `propsSchema` for `monthly`/`yearly`/`setup` from `type: string` to structured object
- `packages/ui/src/sections/price-card/price-card-section.types.generated.ts` — regenerated from manifest

### 2.2 Configuration and data

- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/uk/offerings/*.md` — 6 UK offering files
- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/de/offerings/*.md` — 6 DE offering files
- `missions/warpgogol-com-m000035/workpiece/src/content/pages/{lang}/home.md` — price card block props
- `missions/warpgogol-com-m000035/workpiece/src/content/pages/{lang}/digitales-fundament.md` — price card + guarantee card references
- `missions/warpgogol-com-m000035/workpiece/src/content/pages/{lang}/pricing.md` — price card block props + inline references
- `missions/warpgogol-com-m000035/workpiece/src/content/prose/{lang}/agb.md` — `presentation.price.*Amount`, `presentation.changePrice`, `presentation.hourlyRate`, `presentation.billingDay` references
- `missions/warpgogol-com-m000035/workpiece/src/content/prose/{lang}/ratgeber-website-kosten.md` — `presentation.price.*`, `presentation.changePrice`, `presentation.hourlyRate` references
- `missions/warpgogol-com-m000035/workpiece/src/content/funnel/{lang}/create-site.md` — `presentation.price.*`, `presentation.guarantees.*`, `presentation.growthModules.*` references; fix malformed nested `=(...)` expressions
- `missions/warpgogol-com-m000035/workpiece/src/content/funnel/{lang}/change-site.md` — `presentation.changePrice` reference

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0730-eliminate-presentation-duplication-route-display-through-canonical-pbp.md` — read-only reference
- `packages/pbp/AGENTS.md` — update Presentation fields section to reflect removal from offeringSchema
- `docs/audits/audit-rfc-0730-eliminate-presentation-duplication-route-display-through-canonical-pbp.md` — audit report (read-only reference)
- `docs/summits/summit-rfc-0730.md` — summit report (read-only reference)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/pbp build:check` — TypeScript typecheck
- `pnpm --filter @warpgogol/pbp test` — unit tests
- `pnpm --filter warpgogol-com exec astro check` — Astro typecheck
- `pnpm exec site-kernel run rfc.validate --id RFC-0730` — RFC validation
- `pnpm exec site-kernel run content.references.validate --site warpgogol-com` — content reference validation (if available)

## 3. Step sequence

### Step 1. Schema changes in `offeringSchema`

**Goal:** Remove `presentation`, add `guarantees`, extend `pbpRelatedOfferingSchema` with display fields.

**Agent actions:**

- In `packages/pbp/src/schemas/offering.ts`:
  - Remove the `presentation: z.record(z.string(), z.unknown()).optional()` field from `offeringSchema`
  - Add `guarantees: z.record(z.string(), z.object({ label: nonEmptyString, detail: nonEmptyString })).optional()` field
  - Extend `pbpRelatedOfferingSchema` with `label: nonEmptyString.optional()` and `description: nonEmptyString.optional()`
  - Update the `CHANGE_SUMMARY` comment block with RFC-0730 changes

**Validation:**

- `pnpm --filter @warpgogol/pbp build:check` passes
- `pnpm --filter @warpgogol/pbp test` passes (existing tests may need updates if they use `presentation` in offering fixtures)

**Completion criterion:** `offeringSchema` no longer accepts `presentation`, accepts `guarantees`, and `pbpRelatedOfferingSchema` includes `label`/`description`. TypeScript compiles.

**Human review:** no

---

### Step 2. Unit tests for schema changes

**Goal:** Verify schema enforcement with unit tests.

**Agent actions:**

- Add test cases in `packages/pbp/src/schemas/__tests__/` (or appropriate test directory):
  1. `offeringSchema.safeParse()` rejects an offering with `presentation` field (`.strict()` enforcement)
  2. `offeringSchema.safeParse()` accepts an offering with `guarantees` field containing `{ label, detail }` entries
  3. `offeringSchema.safeParse()` rejects `guarantees` with missing `label` or `detail`
  4. `pbpRelatedOfferingSchema.safeParse()` accepts `label` and `description` fields
  5. `pbpRelatedOfferingSchema.safeParse()` accepts related offering without `label`/`description` (backward compat)

**Validation:**

- `pnpm --filter @warpgogol/pbp test` passes with new test cases

**Completion criterion:** All 5 test cases pass.

**Human review:** no

---

### Step 3. Migrate UK offering content files

**Goal:** Remove `presentation` from all 6 UK offering files and migrate data to canonical fields.

**Agent actions:**

- For each UK offering file in `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/uk/offerings/*.md`:
  1. Remove the `presentation:` block entirely
  2. Ensure `guarantees` is at the top level with `{ label, detail }` structure (if the file has guarantees)
  3. Migrate `capacity` data to `fulfillment.capacity` (if present)
  4. Migrate `growthModules` to `relatedOfferings` with `label`/`description` display fields (if present)
  5. Migrate `changePrice` to `pricing.charges.additionalChange` (charge with `type: usage`, `model: unit-rate`, `purpose: additional-change`, `amount: { model: fixed, value: "29.00" }`)
  6. Migrate `hourlyRate` to `pricing.charges.hourlyWork` (charge with `type: usage`, `model: unit-rate`, `purpose: hourly-work`, `amount: { model: fixed, value: "59.00" }`)
  7. Migrate `billingDay` to `fulfillment.billingDay` (number)
  8. Quote all decimal string values in charges (e.g. `"70.00"`, not `70.00`)
  9. Include `model` and `purpose` on every charge per RFC-0728

- Start with `digital-foundation.md` (the most complex file), then migrate the other 5 files
- Use `mission.git.commit` to commit after completing the UK files

**Validation:**

- `offeringSchema.safeParse()` accepts each migrated file (can verify via `pnpm --filter @warpgogol/pbp test` with golden fixtures, or by running `astro check`)
- No `presentation.*` references remain in UK offering files

**Completion criterion:** All 6 UK offering files have `presentation` removed and data migrated to canonical fields. All decimal strings are quoted. All charges have `model` and `purpose`.

**Human review:** no

---

### Step 4. Migrate DE offering content files

**Goal:** Translate UK changes to DE maintaining semantic parity.

**Agent actions:**

- For each DE offering file in `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/de/offerings/*.md`:
  1. Apply the same structural changes as the UK version (remove `presentation`, add `guarantees`, migrate `capacity`/`growthModules`/`changePrice`/`hourlyRate`/`billingDay`)
  2. Translate any display text (label, detail, description fields) from UK to DE following `docs/translate/2026-07-28-uk-de-after-rebuild.md`
  3. Remove DE-only `*Amount` presentation fields (`monthlyAmount`, `yearlyAmount`, `setupAmount`, `module*Amount`) — these are already available as canonical decimal strings in `pricing.charges`
  4. Verify semantic parity block-by-block between UK and DE versions

- Use `mission.git.commit` to commit after completing the DE files

**Validation:**

- `offeringSchema.safeParse()` accepts each migrated DE file
- No `presentation.*` references remain in DE offering files

**Completion criterion:** All 6 DE offering files mirror their UK counterparts structurally, with translated display text. No `*Amount` presentation fields remain.

**Human review:** no

---

### Step 5. Add `formatRecurrence` utility and update price-card component

**Goal:** Add a `formatRecurrence` utility in `@warpgogol/share`, update price-card to accept structured `PriceCardPricingProp` props and format via `Intl.NumberFormat` + `formatRecurrence`.

**Implementation note:** The page handler's `substituteBlockPropReferences` (in `packages/share/src/astro/page-handler/semantic.ts`) already resolves `=(...)` expressions in block props via `resolveReferencesDeep`. So the component receives already-resolved values (e.g. `{ amount: "70.00", currency: "EUR", recurrence: "P1M" }`), not raw content refs. The component formats these resolved values directly.

**Agent actions:**

- In `packages/share/src/formula-eval.ts`:
  - Export a `formatRecurrence(recurrence: string, lang: string): string` utility function that maps ISO 8601 duration codes to locale-specific suffixes:
    - `P1M` → `/ Monat` (de), `/ місяць` (uk)
    - `P1Y` → `/ Jahr` (de), `/ рік` (uk)
    - One-time charges (no recurrence or empty string) → empty string
    - Unknown codes → empty string (graceful degradation)
  - This is a standalone utility, not a pipe formatter (pipe formatters receive numeric values; recurrence is a string code)

- In `packages/ui/src/sections/price-card/price-card-section.manifest.yaml`:
  - Change `monthly`, `yearly`, `setup` from `type: string` to structured object schema with `amount`, `currency`, and optional `recurrence` properties (all `type: string`)

- In `packages/ui/src/sections/price-card/price-card-section.astro`:
  - Import `formatRecurrence` from `@warpgogol/share/formula-eval`
  - Update the component to accept `PriceCardPricingProp` objects instead of strings
  - Add a `formatPrice(prop: PriceCardPricingProp, lang: string): string` function that:
    1. Parses `prop.amount` (decimal string like `"70.00"`) to a number
    2. Formats with `new Intl.NumberFormat(lang, { style: "currency", currency: prop.currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)`
    3. Appends `formatRecurrence(prop.recurrence, lang)` suffix
  - Handle failure: if `prop.amount` is empty or unparseable, render an empty string for that price row (don't throw)
  - Use the `lang` prop already available in the component context to determine locale

- Regenerate types: run the section types generator or `pnpm --filter @warpgogol/ui run build:check` to regenerate `price-card-section.types.generated.ts` from the manifest

**Validation:**

- `pnpm --filter @warpgogol/share run build:check` passes
- `pnpm --filter @warpgogol/ui run build:check` passes
- `price-card-section.types.generated.ts` reflects the new structured prop types
- `formatRecurrence` is exported from `@warpgogol/share/formula-eval`

**Completion criterion:** `formatRecurrence` utility added to `@warpgogol/share`. Price-card component accepts structured props, formats prices via `Intl.NumberFormat` with locale-aware recurrence suffix via `formatRecurrence`, and handles unresolvable values gracefully.

**Human review:** no

---

### Step 6. Update page content references (UK first)

**Goal:** Update all `presentation.*` content references in UK pages, prose, and funnel files to canonical paths.

**Agent actions:**

- In `missions/warpgogol-com-m000035/workpiece/src/content/pages/uk/home.md`:
  - Change price-card block props from `=(business-profile.offerings/digital-foundation.presentation.price.monthly)` to structured objects:
    ```yaml
    monthly:
      amount: =(business-profile.offerings/digital-foundation.pricing.charges.monthlySubscription.amount.value)
      currency: =(business-profile.offerings/digital-foundation.pricing.currency)
      recurrence: =(business-profile.offerings/digital-foundation.pricing.charges.monthlySubscription.recurrence)
    ```
  - Update inline `presentation.price.*` references to `=(...pricing.charges.<charge>.amount.value | money currency=EUR locale=uk)`
  - Update `presentation.guarantees.*` references to `business-profile.offerings/digital-foundation.guarantees.<key>.label` and `.detail`

- In `missions/warpgogol-com-m000035/workpiece/src/content/pages/uk/digitales-fundament.md`:
  - Same changes as home.md for price-card blocks and guarantee card references

- In `missions/warpgogol-com-m000035/workpiece/src/content/pages/uk/pricing.md`:
  - Same changes for price-card blocks and inline references

- In `missions/warpgogol-com-m000035/workpiece/src/content/prose/uk/agb.md`:
  - Change `presentation.price.monthlyAmount` to `=(business-profile.offerings/digital-foundation.pricing.charges.monthlySubscription.amount.value)` (resolves to numeric `70`)
  - Change `presentation.price.setupAmount` to `=(...pricing.charges.setup.amount.value)`
  - Change `presentation.price.yearlyAmount` to `=(...pricing.charges.yearlySubscription.amount.value)`
  - Change `presentation.changePrice` to `=(...pricing.charges.additionalChange.amount.value)`
  - Change `presentation.hourlyRate` to `=(...pricing.charges.hourlyWork.amount.value)`
  - Change `presentation.billingDay` to `=(business-profile.offerings/digital-foundation.fulfillment.billingDay)`

- In `missions/warpgogol-com-m000035/workpiece/src/content/prose/uk/ratgeber-website-kosten.md`:
  - Same reference updates as agb.md

- In `missions/warpgogol-com-m000035/workpiece/src/content/funnel/uk/create-site.md`:
  - Update `presentation.price.*` references to canonical paths
  - Update `presentation.guarantees.delivery.label` to `business-profile.offerings/digital-foundation.guarantees.delivery.label`
  - Update `presentation.growthModules.*` references to `relatedOfferings` canonical paths
  - Fix malformed nested `=(...)` expressions on lines 46–50

- In `missions/warpgogol-com-m000035/workpiece/src/content/funnel/uk/change-site.md`:
  - Change `presentation.changePrice` to `=(...pricing.charges.additionalChange.amount.value)`

- Use `mission.git.commit` to commit after completing UK content updates

**Validation:**

- `grep -r "presentation\." missions/warpgogol-com-m000035/workpiece/src/content/pages/uk/ missions/warpgogol-com-m000035/workpiece/src/content/prose/uk/ missions/warpgogol-com-m000035/workpiece/src/content/funnel/uk/` returns no results (offering presentation refs only; non-offering presentation refs in barrierefreiheit.md, impressum.md, datenschutz.md are intentionally unchanged)

**Completion criterion:** No `presentation.*` references to offering fields remain in UK pages, prose, or funnel files. Non-offering `presentation` references (legal-identity, web-presence, documents) are unchanged.

**Human review:** no

---

### Step 7. Translate content reference updates to DE

**Goal:** Apply the same reference updates to DE pages, prose, and funnel files.

**Agent actions:**

- Repeat Step 6 for all DE files:
  - `pages/de/home.md`, `pages/de/digitales-fundament.md`, `pages/de/pricing.md`
  - `prose/de/agb.md`, `prose/de/ratgeber-website-kosten.md`
  - `funnel/de/create-site.md`, `funnel/de/change-site.md`
- Use `locale=de` in pipe formatter params instead of `locale=uk`
- Translate any new display text (recurrence suffixes are handled by the component, not in content)
- Fix malformed nested `=(...)` expressions in `funnel/de/create-site.md` lines 46–50

- Use `mission.git.commit` to commit after completing DE content updates

**Validation:**

- `grep -r "presentation\." missions/warpgogol-com-m000035/workpiece/src/content/pages/de/ missions/warpgogol-com-m000035/workpiece/src/content/prose/de/ missions/warpgogol-com-m000035/workpiece/src/content/funnel/de/` returns no offering-related results

**Completion criterion:** All DE content files mirror UK reference updates with `locale=de` in pipe params.

**Human review:** no

---

### Step 8. Update `packages/pbp/AGENTS.md`

**Goal:** Update the Presentation fields section to reflect removal from `offeringSchema`.

**Agent actions:**

- In `packages/pbp/AGENTS.md`, find the "Presentation fields (RFC-0482)" section
- Update to note that `presentation` has been removed from `offeringSchema` by RFC-0730
- Note that `guarantees` is now a schema-validated field on offerings
- Note that `pbpRelatedOfferingSchema` now includes optional `label`/`description` display fields

**Validation:**

- Visual inspection — section is updated and accurate

**Completion criterion:** AGENTS.md reflects the schema changes.

**Human review:** no

---

### Step 9. Full validation and acceptance criteria verification

**Goal:** Run all validation commands and verify acceptance criteria.

**Agent actions:**

- Run all validation commands:
  - `pnpm --filter @warpgogol/pbp build:check`
  - `pnpm --filter @warpgogol/pbp test`
  - `pnpm --filter warpgogol-com exec astro check`
  - `pnpm exec site-kernel run rfc.validate --id RFC-0730`
- Verify all acceptance criteria from the RFC:
  1. `pbpRelatedOfferingSchema` includes `label` and `description`
  2. All 12 offering files have `presentation` removed
  3. `capacity` migrated to `fulfillment.capacity`
  4. `growthModules` migrated to `relatedOfferings` with display fields
  5. `changePrice` migrated to `pricing.charges.additionalChange`
  6. `hourlyRate` migrated to `pricing.charges.hourlyWork`
  7. `billingDay` migrated to `fulfillment.billingDay`
  8. Price-card accepts structured props and formats via `Intl.NumberFormat`
  9. Page content references use canonical paths with pipe syntax
  10. No `presentation.*` references remain in pages, prose, or funnel files
  11. `pnpm --filter @warpgogol/pbp build:check` passes
  12. `pnpm --filter @warpgogol/pbp test` passes
  13. `pnpm --filter warpgogol-com exec astro check` passes
  14. `rfc.validate` passes
- Check off each criterion in the RFC with `[x]` and add `(evidence: ...)` annotations
- Commit the RFC with checked-off criteria

**Validation:**

- All 4 validation commands pass
- All 14 acceptance criteria are checked off

**Completion criterion:** All validation commands pass, all acceptance criteria verified.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, stamp RFC as implemented.

**Agent actions:**

- Verify `packages/pbp/AGENTS.md` is updated (Step 8)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if pipeline topology changed (unlikely — no new commands)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0730` and commit the evidence file (RFC-0330)
- Stamp the RFC as implemented: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0730 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the session
- `pnpm exec site-kernel run rfc.validate --id RFC-0730` passes
- Review report exists in `docs/reviews/code/` for this session
- Verification evidence file committed

**Completion criterion:** All documentation updated; code review passed; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0730`
- `pnpm --filter @warpgogol/pbp build:check`
- `pnpm --filter @warpgogol/pbp test`
- `pnpm --filter warpgogol-com exec astro check`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0730` (RFC-0330)
- `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0730 --implementation-commit <sha>`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0730.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0730` in the subject line (RFC-0265)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Content reference breakage | Steps 6–7 update all references in the same commit; `content.references.validate` catches unresolved refs |
| Price-card component prop change | Step 5 updates component + manifest + generated types; Steps 6–7 update all page blocks using price-card |
| `growthModules` prices in `relatedOfferings` | Step 3 migrates growthModules to `relatedOfferings` with `label`/`description`; prices referenced via content refs to related offering's canonical charges |
| `fulfillment` remains loose-typed | Accepted risk — values are simple and site-specific; follow-up RFC can type fulfillment |
| Non-offering `presentation` remains | Accepted risk — non-offering entities retain their own `presentation` fields; explicitly out of scope |
| RFC-0729 dependency | Verified: RFC-0729 is `implemented` — pipe syntax and `money` formatter exist in `packages/share/src/formula-eval.ts` |
| Page handler resolves block props before component | Step 5 documents that component receives already-resolved values; component uses `Intl.NumberFormat` directly, not `resolveFormula` |
| Recurrence suffix mapping | Step 5 adds `formatRecurrence` utility in `@warpgogol/share/formula-eval` (`P1M` → `/ Monat` / `/ місяць`, `P1Y` → `/ Jahr` / `/ рік`); price-card component calls it directly |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0730 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `offeringSchema.strict()` rejection of `guarantees` reveals a schema design conflict (e.g. `guarantees` conflicts with `policyRefs` semantics), create a follow-up RFC rather than loosening the schema.
- If the recurrence suffix mapping requires more than 3 variants, consider a follow-up RFC for a `recurrenceFormatter` pipe formatter instead of hardcoding in the component.
