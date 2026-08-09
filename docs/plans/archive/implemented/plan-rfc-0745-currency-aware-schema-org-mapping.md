---
rfcId: RFC-0745
planId: PLAN-RFC-0745-01
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
  services: []
  docs:
    - packages/pbp/AGENTS.md
    - packages/share/AGENTS.md
---

# Implementation Plan: RFC-0745

## 1. Objectives

- [ ] Add `price` field to PBP compiler Schema.org projection (maps to acceptance criterion: "Schema.org `Offer.price` uses canonical source-currency decimal string (PBP compiler path)")
- [ ] Add `priceCurrency` to share JSON-LD `buildOrganizationNode` `makesOffer` nodes (maps to: "`priceCurrency` added to share JSON-LD `buildOrganizationNode` `makesOffer` nodes")
- [ ] Add projection-level validation function `validateSchemaOrgPrices` (maps to: "Compiler validation blocks publication if derived price appears in Schema.org `price` field" and "Validation runs in Phase 12 (projection), not Phase 10 (semantic)")
- [ ] Ensure no derived/indicative prices in Schema.org output (maps to: "No derived/indicative prices in Schema.org output (both paths)")
- [ ] Handle edge cases: offerings without pricing, non-fixed charge models (maps to: "Offerings without `pricing` field do not trigger false positives")
- [ ] Pass typecheck and tests (maps to: "`tsc --noEmit` passes" and "`vitest run` passes")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/compiler/projection.ts` — extend `generateSchemaOrg` to emit `price` field from canonical source charge; add `validateSchemaOrgPrices` function
- `packages/pbp/src/compiler/pipeline.ts` — call `validateSchemaOrgPrices` after Phase 12 projection, append errors to `validationErrors`
- `packages/share/src/semantic/jsonld/organization.ts` — extend `buildOrganizationNode` `makesOffer` Offer nodes with `priceCurrency` field
- `packages/pbp/src/compiler/types.ts` — no new types needed (validation reuses `PbpValidationError`)

### 2.2 Configuration and data

No configuration changes. No new CLI commands.

### 2.3 Documentation and specs

- `packages/pbp/AGENTS.md` — note Schema.org price validation in compiler phase documentation
- `packages/share/AGENTS.md` — note `priceCurrency` addition to `makesOffer` Offer nodes

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/pbp run build:check` — typecheck
- `pnpm --filter @warpgogol/pbp run test` — unit tests
- `pnpm --filter @warpgogol/share run build:check` — typecheck
- `pnpm --filter @warpgogol/share run test` — unit tests

## 3. Step sequence

### Step 1. Extend `generateSchemaOrg` to emit `price` field

**Goal:** Add canonical source-currency `price` to each `Offer` node in the PBP compiler Schema.org projection.

**Agent actions:**

- Read `packages/pbp/src/compiler/projection.ts` — the `generateSchemaOrg` function (line 48-65)
- For each offering, extract the first fixed-model charge amount from `pricing.charges.<key>.amount.value` where `amount.model === "fixed"`
- Add `price` field to the Offer node object with the canonical source-currency decimal string
- Skip `price` if no `pricing` field, no `charges`, or no fixed-model charge exists
- Update the existing test "generates Schema.org projection with organization data" to verify `price` is present when pricing data exists

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check` passes
- Existing compiler pipeline test still passes

**Completion criterion:** `generateSchemaOrg` emits `price` field (canonical source decimal string) for offerings with fixed-model charges; omits `price` for offerings without pricing or with only non-fixed charges.

**Human review:** no

---

### Step 2. Add `priceCurrency` to share JSON-LD `buildOrganizationNode`

**Goal:** Add canonical source currency code to `makesOffer` Offer nodes in the share JSON-LD builder.

**Agent actions:**

- Read `packages/share/src/semantic/jsonld/organization.ts` — the `makesOffer` section (lines 79-91)
- Add `priceCurrency` field to each Offer node in `makesOffer`, populated from the organization's offer price currency (if available)
- The current `SemanticPrice` type in `packages/share/src/semantic/models.ts` has `id`, `label`, `amount` — check if a `currency` field exists or needs to be added
- If `SemanticPrice` lacks a currency field, add an optional `currency?: string` field to the type
- Update `projectOffer` in `packages/share/src/semantic/business-projection.ts` to populate `currency` from the canonical source currency if available

**Validation:**

- `pnpm --filter @warpgogol/share run build:check` passes
- `pnpm --filter @warpgogol/share run test` passes

**Completion criterion:** `buildOrganizationNode` `makesOffer` Offer nodes include `priceCurrency` when currency data is available.

**Human review:** no

---

### Step 3. Add `validateSchemaOrgPrices` validation function

**Goal:** Create a projection-level validation function that checks Schema.org output for derived price leakage.

**Agent actions:**

- In `packages/pbp/src/compiler/projection.ts`, add a new exported function:

```ts
function validateSchemaOrgPrices(
  schemaOrg: Record<string, unknown>,
  canonicalPrices: Set<string>,
): PbpValidationError[];
```

- The function walks the Schema.org output, finds all `Offer` nodes, and checks that each `price` value is in the `canonicalPrices` set
- If a `price` value is not in the canonical set, emit a `PBP-SCHEMA-PRICE` error
- Skip validation for Offer nodes without a `price` field (edge case: offering without pricing)
- Build the `canonicalPrices` set from the resolved graph's offerings: for each offering with `pricing.charges`, collect all `amount.value` strings where `amount.model === "fixed"`

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check` passes

**Completion criterion:** `validateSchemaOrgPrices` function exists, is exported from the compiler module, and returns `PbpValidationError[]` with code `PBP-SCHEMA-PRICE` for non-canonical prices.

**Human review:** no

---

### Step 4. Wire validation into pipeline Phase 12

**Goal:** Call `validateSchemaOrgPrices` after projection generation and append errors to the compiler result.

**Agent actions:**

- Read `packages/pbp/src/compiler/pipeline.ts` — Phase 12 section (lines 73-74)
- After `generateProjections` returns, extract the `schemaOrg` projection
- Build `canonicalPrices` set from the resolved graph (`overlaid.offerings`)
- Call `validateSchemaOrgPrices(projections.schemaOrg, canonicalPrices)`
- Append resulting errors to `validationErrors` in the partial result (line 84)
- Export `validateSchemaOrgPrices` from `packages/pbp/src/compiler/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check` passes
- `pnpm --filter @warpgogol/pbp run test` passes

**Completion criterion:** Pipeline calls `validateSchemaOrgPrices` after Phase 12; validation errors appear in `PbpCompilerResult.validationErrors` with code `PBP-SCHEMA-PRICE`.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Add unit tests covering all acceptance criteria edge cases.

**Agent actions:**

- In `packages/pbp/src/compiler/__tests__/compiler-pipeline.test.ts`, add tests:
  1. "Schema.org projection includes canonical price for offering with fixed charge" — verify `price` field is present and matches canonical source amount
  2. "Schema.org projection omits price for offering without pricing" — verify no `price` field, no validation error
  3. "Schema.org projection omits price for offering with only range charges" — verify no `price` field when `amount.model === "range"`
  4. "validateSchemaOrgPrices passes for canonical prices" — verify empty error array
  5. "validateSchemaOrgPrices catches non-canonical price" — verify `PBP-SCHEMA-PRICE` error when `price` value is not in canonical set
- In `packages/share/src/tests/` or `packages/share/src/semantic/`, add test for `buildOrganizationNode` `makesOffer` with `priceCurrency`

**Validation:**

- `pnpm --filter @warpgogol/pbp run test` passes
- `pnpm --filter @warpgogol/share run test` passes

**Completion criterion:** All new tests pass; existing tests still pass.

**Human review:** no

---

### Step 6. Documentation sync

**Goal:** Update AGENTS.md files to reflect the new validation and Schema.org price fields.

**Agent actions:**

- Update `packages/pbp/AGENTS.md` — add note in the compiler section that Phase 12 now includes `validateSchemaOrgPrices` validation
- Update `packages/share/AGENTS.md` — note that `buildOrganizationNode` `makesOffer` now includes `priceCurrency`
- Verify no `docs/*.xml` Compass files need updates (Schema.org output shape is not tracked in Compass XML)

**Validation:**

- `git diff` shows only the expected AGENTS.md files modified

**Completion criterion:** Both AGENTS.md files updated with new validation and field information.

**Human review:** no

---

### Final Step. Review, fix, stamp implemented

**Goal:** Run code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/pbp run build:check` and `pnpm --filter @warpgogol/share run build:check`
- Run `pnpm --filter @warpgogol/pbp run test` and `pnpm --filter @warpgogol/share run test`
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0745`
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0745 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0745`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0745`
- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/pbp run test`
- `pnpm --filter @warpgogol/share run build:check`
- `pnpm --filter @warpgogol/share run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0745` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| SEO impact of multi-currency display | Step 1 ensures only canonical source-currency price is emitted in Schema.org |
| Rich result price mismatch | Step 1-2 ensure `price` and `priceCurrency` are canonical source values |
| False-positive rate | Step 3 builds canonical price set from the same graph; Step 5 tests edge cases (no pricing, non-fixed charges) |
| Agent misinterpretation (adding UAH as priceCurrency) | Step 3 validation catches non-canonical currency; Step 5 tests this scenario |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-4 or DNA-16, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0745 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `SemanticPrice` type in `packages/share/src/semantic/models.ts` cannot accommodate a `currency` field without breaking existing consumers, create a new RFC to extend the type rather than forcing it.
