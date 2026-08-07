---
rfcId: RFC-0737
planId: PLAN-RFC-0737-01
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

# Implementation Plan: RFC-0737

## 1. Objectives

- [ ] Objective 1 — Create `PbpRatePolicy` and `PbpRateSchedule` entity interfaces with closed unions — maps to acceptance criteria [PbpRatePolicy interface exported], [PbpRateSchedule interface exported], [PbpRateMode closed union exported], [PbpRateDirection closed union exported]
- [ ] Objective 2 — Create shared `PbpCurrencyPair` and `PbpQuotation` interfaces — maps to acceptance criteria [PbpCurrencyPair interface exported], [PbpQuotation interface exported]
- [ ] Objective 3 — Create `PbpRateScheduleEntry` interface and schema ID constants — maps to acceptance criteria [PbpRateScheduleEntry interface exported], [RATE_POLICY_SCHEMA_ID exported], [RATE_SCHEDULE_SCHEMA_ID exported]
- [ ] Objective 4 — Create Zod schemas using `pbpEntitySchema.extend().strict()` pattern and register in `pbpSchemaById` — maps to acceptance criteria [pbpRatePolicySchema exported and registered], [pbpRateScheduleSchema exported and registered]
- [ ] Objective 5 — Re-export all new types and schemas from barrel files — maps to all "exported" acceptance criteria
- [ ] Objective 6 — Write unit tests for both schemas — maps to acceptance criteria [tsc --noEmit passes], [vitest run passes]
- [ ] Objective 7 — Update `packages/pbp/AGENTS.md` API surface listing — maps to architectural fit section

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/entities/rate-policy.ts` — **new file**: RatePolicy + RateSchedule entity interfaces, closed unions (`PbpRateMode`, `PbpRateDirection`), shared types (`PbpCurrencyPair`, `PbpQuotation`), `PbpRateScheduleEntry`, schema ID constants
- `packages/pbp/src/schemas/rate-policy.ts` — **new file**: Zod schemas (`pbpRatePolicySchema`, `pbpRateScheduleSchema`, `pbpRateScheduleEntrySchema`, `pbpRateModeSchema`, `pbpRateDirectionSchema`, `pbpCurrencyPairSchema`, `pbpQuotationSchema`)
- `packages/pbp/src/schemas/index.ts` — **edit**: export new schemas, register in `pbpSchemaById` and `pbpEntityDiscriminatedUnion`
- `packages/pbp/src/index.ts` — **edit**: re-export new types and constants from `entities/rate-policy.ts`
- `packages/pbp/src/schemas/__tests__/golden-fixtures.test.ts` — **edit**: add `rate-policy` and `rate-schedule` to `expectedIds` array, increment schema count from 25 to 27

### 2.2 Configuration and data

No configuration or data files affected. No CLI commands. Library-only.

### 2.3 Documentation and specs

- `packages/pbp/AGENTS.md` — **edit**: add new types to API surface listing under a new "### Multi-currency pricing (RFC-0735..0744)" subsection
- `docs/rfcs/rfc-0737-rate-policy-and-rate-schedule-entities.md` — **read-only reference** (accepted RFC)

### 2.4 Validation and pipelines

No pipeline changes. No new commands. Existing validation commands apply:
- `pnpm --filter @warpgogol/pbp build:check`
- `pnpm --filter @warpgogol/pbp test`

## 3. Step sequence

### Step 1. Create entity interfaces and shared types

**Goal:** Create `packages/pbp/src/entities/rate-policy.ts` with all TypeScript interfaces, closed unions, type guards, and schema ID constants.

**Agent actions:**

- Create `packages/pbp/src/entities/rate-policy.ts`
- Import `PbpEntity` from `../envelope.js`, `PbpEntityRef` from `../entity-ref.js`, `pbpSchemaId` from `../schema-id.js`
- Define `PbpRateMode` type and `PBP_RATE_MODES` const array + `isPbpRateMode` type guard
- Define `PbpRateDirection` type and `PBP_RATE_DIRECTIONS` const array + `isPbpRateDirection` type guard
- Define `PbpCurrencyPair` interface
- Define `PbpQuotation` interface
- Define `PbpRatePolicy extends PbpEntity` with `type: "rate-policy"`, `pair: PbpCurrencyPair`, `quotation: PbpQuotation`, `mode`, `sources?`, `freshness`, `failure`
- Define `PbpRateScheduleEntry` interface with `value: string` and `validFrom: string`
- Define `PbpRateSchedule extends PbpEntity` with `type: "rate-schedule"`, `pair: PbpCurrencyPair`, `quotation: PbpQuotation`, `entries: Record<string, PbpRateScheduleEntry>`
- Define `RATE_POLICY_SCHEMA_ID = pbpSchemaId("rate-policy")` and `RATE_SCHEDULE_SCHEMA_ID = pbpSchemaId("rate-schedule")`
- Follow the pattern of `packages/pbp/src/entities/currency-pricing-policy.ts` (the most recent entity in the same RFC series)

**Validation:**

- `pnpm --filter @warpgogol/pbp exec tsc --noEmit` — file compiles without errors

**Completion criterion:** File exists, imports resolve, `tsc --noEmit` passes for `packages/pbp/`

**Human review:** no

---

### Step 2. Create Zod schemas

**Goal:** Create `packages/pbp/src/schemas/rate-policy.ts` with Zod schemas for all types defined in Step 1.

**Agent actions:**

- Create `packages/pbp/src/schemas/rate-policy.ts`
- Import `z` from `zod`, `pbpEntitySchema` from `./envelope.js`, `pbpEntityRefSchema` from `./entity-ref.js`, `nonEmptyString` and `decimalString` from `./primitives.js`
- Define `pbpRateModeSchema = z.enum(["external", "business-fixed"])`
- Define `pbpRateDirectionSchema = z.enum(["target-per-source", "source-per-target"])`
- Define `pbpCurrencyPairSchema = z.object({ sourceCurrency: nonEmptyString, targetCurrency: nonEmptyString })`
- Define `pbpQuotationSchema = z.object({ direction: pbpRateDirectionSchema })`
- Define `pbpRatePolicySchema = pbpEntitySchema.extend({ type: z.literal("rate-policy"), ... }).strict()`
- Define `pbpRateScheduleEntrySchema = z.object({ value: decimalString, validFrom: nonEmptyString })`
- Define `pbpRateScheduleSchema = pbpEntitySchema.extend({ type: z.literal("rate-schedule"), ... }).strict()`
- Follow the pattern of `packages/pbp/src/schemas/currency-pricing-policy.ts` (uses `pbpEntitySchema.extend().strict()`)

**Validation:**

- `pnpm --filter @warpgogol/pbp exec tsc --noEmit` — file compiles without errors

**Completion criterion:** File exists, all schemas defined, `tsc --noEmit` passes

**Human review:** no

---

### Step 3. Register schemas in barrel and registry

**Goal:** Update `packages/pbp/src/schemas/index.ts` to export new schemas and register them in `pbpSchemaById` and `pbpEntityDiscriminatedUnion`.

**Agent actions:**

- Add export statements for `pbpRatePolicySchema`, `pbpRateScheduleSchema`, `pbpRateScheduleEntrySchema`, `pbpRateModeSchema`, `pbpRateDirectionSchema`, `pbpCurrencyPairSchema`, `pbpQuotationSchema` from `./rate-policy.js`
- Add import aliases for registry: `import { pbpRatePolicySchema as _ratePolicy } from "./rate-policy.js"` and `import { pbpRateScheduleSchema as _rateSchedule } from "./rate-policy.js"`
- Add `[pbpSchemaId("rate-policy")]: _ratePolicy` and `[pbpSchemaId("rate-schedule")]: _rateSchedule` to `pbpSchemaById`
- Add `_ratePolicy` and `_rateSchedule` to `pbpEntityDiscriminatedUnion` array

**Validation:**

- `pnpm --filter @warpgogol/pbp exec tsc --noEmit` — registry compiles, no type errors

**Completion criterion:** Schemas exported and registered in both `pbpSchemaById` and `pbpEntityDiscriminatedUnion`

**Human review:** no

---

### Step 4. Re-export from main barrel

**Goal:** Update `packages/pbp/src/index.ts` to re-export all new types and constants.

**Agent actions:**

- Add export block after the RFC-0736 section (line ~552):
  ```ts
  // RFC-0737: RatePolicy and RateSchedule Entities
  export {
    type PbpRateMode,
    type PbpRateDirection,
    type PbpCurrencyPair,
    type PbpQuotation,
    type PbpRatePolicy,
    type PbpRateScheduleEntry,
    type PbpRateSchedule,
    PBP_RATE_MODES,
    isPbpRateMode,
    PBP_RATE_DIRECTIONS,
    isPbpRateDirection,
    RATE_POLICY_SCHEMA_ID,
    RATE_SCHEDULE_SCHEMA_ID,
  } from "./entities/rate-policy.js";
  ```

**Validation:**

- `pnpm --filter @warpgogol/pbp exec tsc --noEmit` — all exports resolve

**Completion criterion:** All types and constants re-exported from `@warpgogol/pbp`

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Add unit tests for `pbpRatePolicySchema` and `pbpRateScheduleSchema` in the golden-fixtures test file.

**Agent actions:**

- Edit `packages/pbp/src/schemas/__tests__/golden-fixtures.test.ts`
- Add `"rate-policy"` and `"rate-schedule"` to the `expectedIds` array in the `pbpSchemaById registry` describe block
- Update the schema count assertion from `25` to `27`
- Add a new `describe("pbpRatePolicySchema", ...)` block with tests:
  - Accepts valid external-mode policy with sources
  - Accepts valid business-fixed-mode policy without sources
  - Rejects unknown field (`.strict()`)
  - Rejects missing `freshness`
  - Rejects invalid `mode` value
  - Rejects missing `pair`
- Add a new `describe("pbpRateScheduleSchema", ...)` block with tests:
  - Accepts valid schedule with entries
  - Rejects unknown field (`.strict()`)
  - Rejects empty entries (if `.refine` is added) or accepts empty entries (if not — match RFC spec)
  - Rejects non-decimal `value` (e.g. `"abc"`)
  - Rejects missing `pair`
- Follow the pattern of the existing `describe("pbpCurrencyPricingPolicySchema", ...)` block

**Validation:**

- `pnpm --filter @warpgogol/pbp exec vitest run --reporter=verbose` — all tests pass

**Completion criterion:** All new tests pass, existing tests still pass, schema count assertion is 27

**Human review:** no

---

### Step 6. Update AGENTS.md API surface

**Goal:** Update `packages/pbp/AGENTS.md` to list the new exported types in the API surface.

**Agent actions:**

- Add a new subsection after the RFC-0736 entry (or in a new "### Multi-currency pricing (RFC-0735..0744)" section):
  ```
  - `PbpRateMode`, `PbpRateDirection` — closed union types for rate sourcing mode and quotation direction (RFC-0737)
  - `PbpCurrencyPair`, `PbpQuotation` — shared sub-interfaces for currency pair and quotation direction (RFC-0737)
  - `PbpRatePolicy` — RatePolicy entity declaring rate source, freshness, and failure behavior (RFC-0737)
  - `PbpRateSchedule`, `PbpRateScheduleEntry` — RateSchedule entity for business-fixed mode with validFrom entries (RFC-0737)
  - `RATE_POLICY_SCHEMA_ID`, `RATE_SCHEDULE_SCHEMA_ID` — schema ID constants (RFC-0737)
  ```

**Validation:**

- Visual inspection — entries are accurate and match exported names

**Completion criterion:** AGENTS.md lists all new types with RFC-0737 reference

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/pbp/AGENTS.md` is updated (Step 6).
- No `docs/*.xml` Compass files need updates (additive to `pbp/*@1`, no repository-wide semantic changes).
- No `docs/architecture-dna.md` changes (no new DNA invariant).
- Run `pnpm --filter @warpgogol/pbp build:check` — confirms `tsc --noEmit` and `vitest run` pass.
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0737` — confirms RFC is valid.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations (RFC-IMP-02). For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0737 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0737`
- `pnpm --filter @warpgogol/pbp build:check`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0737`
- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/pbp run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0737` in the subject line (RFC-0265 commit hygiene)
- Inline `(evidence: ...)` annotations on each checked acceptance criterion (RFC-IMP-02)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Stale rates — business-fixed schedule not updated | Step 2: `governance.reviewEvery` is inherited from `PbpEntity` — the schema validates it via `pbpGovernanceSchema` in `pbpEntitySchema` |
| External source unavailability | Step 1-2: `sources.fallback` and `freshness.allowLastKnownValue` are schema-validated fields — downstream consumption is RFC-0744's responsibility |
| Schema registry drift | Step 3: `pbpSchemaById` and `pbpEntityDiscriminatedUnion` updated in same step; Step 5: golden-fixtures test asserts count = 27 |

## 6. Escalation triggers

- If implementation reveals that `pbpEntitySchema.extend().strict()` conflicts with the `schema` literal type (discriminated union key), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0737 --reason "schema literal conflict with discriminated union" --invariant "DNA-55"` instead of working around it.
- If `decimalString` regex is insufficient for rate values (e.g. needs to support negative rates), do not weaken the regex — create a new RFC to extend the primitive.
