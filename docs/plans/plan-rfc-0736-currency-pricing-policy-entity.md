---
rfcId: RFC-0736
planId: PLAN-RFC-0736-01
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
    - packages/pbp/AGENTS.md
---

# Implementation Plan: RFC-0736

## 1. Objectives

- [ ] Objective 1 — Create `PbpCurrencyPricingPolicy` entity interface and closed unions in `@warpgogol/pbp` (maps to acceptance criteria 1–4)
- [ ] Objective 2 — Create `CURRENCY_PRICING_POLICY_SCHEMA_ID` constant using `pbpSchemaId()` (maps to acceptance criterion 5)
- [ ] Objective 3 — Create `pbpCurrencyPricingPolicySchema` Zod schema following `pbpEntitySchema.extend().strict()` pattern (maps to acceptance criterion 6)
- [ ] Objective 4 — Register schema in `pbpSchemaById` and `pbpEntityDiscriminatedUnion` (maps to acceptance criterion 6)
- [ ] Objective 5 — Re-export all new types and schemas from `@warpgogol/pbp` entry points (maps to acceptance criteria 1–6)
- [ ] Objective 6 — Pass `tsc --noEmit`, `vitest run`, and `rfc.validate` (maps to acceptance criteria 7–9)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/entities/currency-pricing-policy.ts` — **new file**: entity interface + closed unions
- `packages/pbp/src/schemas/currency-pricing-policy.ts` — **new file**: Zod schema
- `packages/pbp/src/schemas/index.ts` — **edit**: register schema in `pbpSchemaById` and `pbpEntityDiscriminatedUnion`
- `packages/pbp/src/index.ts` — **edit**: re-exports for entity types and schema ID constant
- `packages/pbp/src/astro.ts` — **verify**: existing `business-profile` collection already covers `src/content/business-profile/{lang}/currency-pricing-policy/{id}.md` via `fsDataCollectionLoader` with `base: "src/content/business-profile"`. No change expected unless per-entity collection isolation is needed.

### 2.2 Configuration and data

No configuration or data files. Content files are deferred to RFC-0740.

### 2.3 Documentation and specs

- `packages/pbp/AGENTS.md` — add `PbpCurrencyPricingPolicy`, `PbpCurrencyStrategy`, `PbpCurrentUses`, `PbpCurrencyTarget`, `CURRENCY_PRICING_POLICY_SCHEMA_ID` to the API surface section.

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/pbp run build:check` (tsc --noEmit)
- `pnpm --filter @warpgogol/pbp run test` (vitest run)
- `pnpm exec site-kernel run rfc.validate --id RFC-0736`

No new pipeline steps. No CI workflow changes.

## 3. Step sequence

### Step 1. Create entity types file

**Goal:** Define the `PbpCurrencyPricingPolicy` entity interface and supporting types.

**Agent actions:**

- Create `packages/pbp/src/entities/currency-pricing-policy.ts`
- Import `PbpEntity` from `../envelope.js`, `PbpEntityRef` from `../entity-ref.js`, `pbpSchemaId` from `../schema-id.js`
- Define `PbpCurrencyStrategy` type union (`"derived" | "fixed"`)
- Define `PBP_CURRENCY_STRATEGIES` readonly const array
- Define `isPbpCurrencyStrategy` type guard function
- Define `PbpCurrentUses` interface (6 boolean fields: presentation, aiAnswers, quote, contract, invoice, settlement)
- Define `PbpCurrencyTarget` interface (currency, strategy, derivationContractRef?, ratePolicyRef?, currentUses)
- Define `PbpCurrencyPricingPolicy` interface extending `PbpEntity` (type: "currency-pricing-policy", businessRef, baseCurrency, targetCurrencies)
- Define `CURRENCY_PRICING_POLICY_SCHEMA_ID = pbpSchemaId("currency-pricing-policy")`
- Follow the existing entity file pattern (see `packages/pbp/src/entities/business.ts`)

**Validation:**

- File exists and imports resolve
- `tsc --noEmit` passes after Step 4 (re-exports added)

**Completion criterion:** `packages/pbp/src/entities/currency-pricing-policy.ts` exports `PbpCurrencyStrategy`, `PBP_CURRENCY_STRATEGIES`, `isPbpCurrencyStrategy`, `PbpCurrentUses`, `PbpCurrencyTarget`, `PbpCurrencyPricingPolicy`, `CURRENCY_PRICING_POLICY_SCHEMA_ID`.

**Human review:** no

---

### Step 2. Create Zod schema file

**Goal:** Define the Zod schema for `PbpCurrencyPricingPolicy` following the established `pbpEntitySchema.extend().strict()` pattern.

**Agent actions:**

- Create `packages/pbp/src/schemas/currency-pricing-policy.ts`
- Import `z` from `"zod"`, `pbpEntitySchema` from `"./envelope.js"`, `pbpEntityRefSchema` from `"./entity-ref.js"`, `nonEmptyString` from `"./primitives.js"`
- Define `pbpCurrentUsesSchema` (z.object with 6 boolean fields)
- Define `pbpCurrencyStrategySchema` (z.enum(["derived", "fixed"]))
- Define `pbpCurrencyTargetSchema` (z.object with currency, strategy, derivationContractRef?, ratePolicyRef?, currentUses)
- Define `pbpCurrencyPricingPolicySchema = pbpEntitySchema.extend({ type: z.literal("currency-pricing-policy"), businessRef, baseCurrency, targetCurrencies: z.record(z.string(), pbpCurrencyTargetSchema).min(1) }).strict()`
- Follow the existing schema file pattern (see `packages/pbp/src/schemas/business.ts`, `packages/pbp/src/schemas/policy.ts`)

**Validation:**

- File exists and imports resolve
- `tsc --noEmit` passes after Step 4

**Completion criterion:** `packages/pbp/src/schemas/currency-pricing-policy.ts` exports `pbpCurrentUsesSchema`, `pbpCurrencyStrategySchema`, `pbpCurrencyTargetSchema`, `pbpCurrencyPricingPolicySchema`.

**Human review:** no

---

### Step 3. Register schema in schemas barrel

**Goal:** Register the new schema in the `pbpSchemaById` registry and `pbpEntityDiscriminatedUnion`.

**Agent actions:**

- Edit `packages/pbp/src/schemas/index.ts`
- Add `export { pbpCurrencyPricingPolicySchema, pbpCurrentUsesSchema, pbpCurrencyStrategySchema, pbpCurrencyTargetSchema } from "./currency-pricing-policy.js"` to the entity schemas export section
- Add `import { pbpCurrencyPricingPolicySchema as _currencyPricingPolicy } from "./currency-pricing-policy.js"` to the imports
- Add `[pbpSchemaId("currency-pricing-policy")]: _currencyPricingPolicy` to the `pbpSchemaById` registry
- Add `_currencyPricingPolicy` to the `pbpEntityDiscriminatedUnion` array

**Validation:**

- `tsc --noEmit` passes after Step 4
- Schema is discoverable via `pbpSchemaById[pbpSchemaId("currency-pricing-policy")]`

**Completion criterion:** `pbpCurrencyPricingPolicySchema` is registered in `pbpSchemaById` and included in `pbpEntityDiscriminatedUnion`.

**Human review:** no

---

### Step 4. Add re-exports to package entry point

**Goal:** Re-export all new types and constants from `@warpgogol/pbp`.

**Agent actions:**

- Edit `packages/pbp/src/index.ts`
- Add export block for entity types: `PbpCurrencyPricingPolicy`, `PbpCurrencyStrategy`, `PbpCurrentUses`, `PbpCurrencyTarget`, `PBP_CURRENCY_STRATEGIES`, `isPbpCurrencyStrategy`, `CURRENCY_PRICING_POLICY_SCHEMA_ID` from `./entities/currency-pricing-policy.js`
- Follow the existing export block pattern (see business entity exports at line 85)

**Validation:**

- `rtk pnpm --filter @warpgogol/pbp run build:check` passes (tsc --noEmit)

**Completion criterion:** All types and constants are importable from `@warpgogol/pbp`. `tsc --noEmit` passes.

**Human review:** no

---

### Step 5. Add golden fixture and entity export tests

**Goal:** Add test coverage for the new schema and entity exports, following the established test patterns.

**Agent actions:**

- Edit `packages/pbp/src/schemas/__tests__/golden-fixtures.test.ts`:
  - Import `pbpCurrencyPricingPolicySchema` from `"../currency-pricing-policy.js"`
  - Add a `describe("pbpCurrencyPricingPolicySchema")` block with:
    - Positive case: valid entity with `type: "currency-pricing-policy"`, `businessRef`, `baseCurrency: "EUR"`, one `targetCurrencies` entry with `strategy: "derived"`, `derivationContractRef`, `ratePolicyRef`, `currentUses` (presentation: true, rest: false)
    - Negative case: rejects empty `targetCurrencies` (`.min(1)` enforcement)
    - Negative case: rejects unknown field (`.strict()` enforcement)
    - Negative case: rejects missing `businessRef`
- Edit `packages/pbp/tests/entities.test.ts`:
  - Import `CURRENCY_PRICING_POLICY_SCHEMA_ID`, `PBP_CURRENCY_STRATEGIES`, `isPbpCurrencyStrategy` from `"../src/index.js"`
  - Add a `describe("RFC-0736: CurrencyPricingPolicy")` block with:
    - Exports `CURRENCY_PRICING_POLICY_SCHEMA_ID` as `"pbp/currency-pricing-policy@1"`
    - Has 2 currency strategies (`derived`, `fixed`)
    - `isPbpCurrencyStrategy` validates known strategies

**Validation:**

- `rtk pnpm --filter @warpgogol/pbp run test` passes

**Completion criterion:** Golden fixture tests and entity export tests pass for the new schema and types.

**Human review:** no

---

### Step 6. Verify astro.ts and run validation

**Goal:** Confirm the existing `business-profile` Astro collection covers the new content path, then run the full validation suite.

**Agent actions:**

- Read `packages/pbp/src/astro.ts` — verify the existing `pbpCollections["business-profile"]` collection with `fsDataCollectionLoader({ base: "src/content/business-profile" })` already covers `currency-pricing-policy/{id}.md` files. No change expected.
- Run `rtk pnpm --filter @warpgogol/pbp run build:check`
- Run `rtk pnpm --filter @warpgogol/pbp run test`
- Run `rtk pnpm exec site-kernel run rfc.validate --id RFC-0736 --json`

**Validation:**

- `build:check` exits 0
- `test` exits 0
- `rfc.validate` exits 0 with zero violations

**Completion criterion:** All three commands pass. If `astro.ts` needs no change, document that in the commit message.

**Human review:** no

---

### Step 7. Update package AGENTS.md

**Goal:** Document the new entity in the `@warpgogol/pbp` AGENTS.md API surface.

**Agent actions:**

- Edit `packages/pbp/AGENTS.md`
- Add a new entry under the entities section: `PbpCurrencyPricingPolicy`, `PbpCurrencyStrategy`, `PbpCurrentUses`, `PbpCurrencyTarget`, `CURRENCY_PRICING_POLICY_SCHEMA_ID` — CurrencyPricingPolicy entity (RFC-0736)

**Validation:**

- `packages/pbp/AGENTS.md` contains the new entity entry

**Completion criterion:** AGENTS.md API surface includes all new exports.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check `packages/pbp/AGENTS.md` against `git diff`.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `rtk pnpm exec site-kernel run rfc.implement.stamp --id RFC-0736 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `rtk pnpm exec site-kernel run rfc.validate --id RFC-0736`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `rtk pnpm exec site-kernel run rfc.validate --id RFC-0736`
- `rtk pnpm --filter @warpgogol/pbp run build:check`
- `rtk pnpm --filter @warpgogol/pbp run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0736` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| ISO 4217 validation deferred to compiler | Step 2: schema uses `nonEmptyString` for `currency` — compiler validation is RFC-0740's scope |
| Future transactional scope (`currentUses` fields) | Step 2: schema allows `true` for all `currentUses` fields — compiler enforces `false` for transactional scopes (RFC-0740) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1 or DNA-55, run `rtk pnpm exec site-kernel run rfc.supersede.propose --id RFC-0736 --reason "..." --invariant "DNA-N"` instead of working around it.
