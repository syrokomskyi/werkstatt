---
rfcId: RFC-0741
planId: PLAN-RFC-0741-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/share"
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/share/AGENTS.md
    - packages/os/site-kernel-checks/AGENTS.md
prerequisites:
  - RFC-0740 must be accepted and implemented first (PbpMaterializedDerivedPrice type, derivedPrices on PbpResolvedGraph, materialization logic)
  - A pbp.compile command must exist in the pipeline (currently missing — see escalation trigger)
---

# Implementation Plan: RFC-0741

## 1. Objectives

- [ ] Objective 1 — Verify prerequisites: RFC-0740 implemented, `pbp.compile` command exists
- [ ] Objective 2 — Add `multi-currency` to `ENTITLED_FEATURES` and `STRIPE_FEATURE_LOOKUP_MAP` (acceptance criteria 1, 2)
- [ ] Objective 3 — Register `rate-snapshot.resolve` and `currency-pricing.compile` commands with `gate.conditional.entitlement` (acceptance criteria 3, 4, 7)
- [ ] Objective 4 — Integrate `derived-prices.materialize` (from RFC-0740) into both `build-prepare` pipelines (acceptance criteria 5, 6, 8)
- [ ] Objective 5 — Verify `gate.conditional.entitlement` mechanism works for pipeline steps (not just standalone commands)
- [ ] Objective 6 — Verify `entitlement.module.validate` recognizes `multi-currency` without code changes (acceptance criterion 9)
- [ ] Objective 7 — Confirm no route registry changes needed (acceptance criterion 10)
- [ ] Objective 8 — Pass `tsc --noEmit`, `vitest run`, and `rfc.validate` (acceptance criteria 11, 12, 13)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/entitlement.ts` — add `"multi-currency"` to `ENTITLED_FEATURES` array and `feature_multi_currency: "multi-currency"` to `STRIPE_FEATURE_LOOKUP_MAP`
- `packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts` — new file: `runRateSnapshotResolve` command handler
- `packages/os/site-kernel-checks/src/currency-pricing-compile.ts` — new file: `runCurrencyPricingCompile` command handler
- `packages/os/site-kernel-checks/src/derived-prices-materialize.ts` — new file: `runDerivedPricesMaterialize` command handler (from RFC-0740, depends on RFC-0740 types being implemented)
- `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` — add 3 new `CheckCommandEntry` entries with `gate.conditional.entitlement: multi-currency`
- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — insert 3 new `KernelPipelineStep` entries into both `SITES_BUILD_PREPARE_PIPELINE` and `SITES_BUILD_PREPARE_DEV_PIPELINE` after `entitlements.resolve` and before `surface.generate`
- Note: `pbp.compile` command is a prerequisite (see escalation triggers) — must exist in pipeline before `derived-prices.materialize`

### 2.2 Configuration and data

- No YAML/JSON config changes — entitlement catalog is TypeScript
- Stripe admin: configure `feature_multi_currency` lookup key (manual, not code)

### 2.3 Documentation and specs

- `packages/share/AGENTS.md` — document new `multi-currency` feature in entitlement catalog
- `packages/os/site-kernel-checks/AGENTS.md` — document new commands and pipeline steps
- No `docs/*.xml` Compass changes required (catalog addition, not structural contract change)
- No `docs/architecture-dna.md` changes (no new DNA invariant)

### 2.4 Validation and pipelines

- `SITES_BUILD_PREPARE_PIPELINE` — gains 3 steps after `entitlements.resolve` (line 49), before `surface.generate` (line 52)
- `SITES_BUILD_PREPARE_DEV_PIPELINE` — gains 3 steps after `entitlements.resolve` (line 170), before `surface.generate` (line 171)
- `sites-check-author` pipeline — no changes (`entitlement.module.validate` already covers new feature)
- No new CI workflows needed

## 3. Step sequence

### Step 0. Verify prerequisites

**Goal:** Confirm RFC-0740 is implemented and `pbp.compile` command exists in the pipeline.

**Agent actions:**

- Check RFC-0740 status: `grep 'status:' docs/rfcs/rfc-0740-*.md` — must be `implemented`
- Check `PbpMaterializedDerivedPrice` type exists: `grep -r 'PbpMaterializedDerivedPrice' packages/pbp/src/`
- Check `derivedPrices` field on `PbpResolvedGraph`: `grep 'derivedPrices' packages/pbp/src/compiler/types.ts`
- Check `pbp.compile` command exists: `grep -r 'pbp.compile' packages/os/site-kernel-checks/src/`
- If any prerequisite is missing, STOP and escalate (see escalation triggers)

**Validation:**

- All prerequisite checks pass

**Completion criterion:** RFC-0740 is `implemented`, `PbpMaterializedDerivedPrice` type exists, `pbp.compile` command is registered.

**Human review:** no

---

### Step 1. Add `multi-currency` to entitlement catalog

**Goal:** Add the feature to the closed catalog and Stripe lookup map.

**Agent actions:**

- Edit `packages/share/src/entitlement.ts`: add `"multi-currency"` to `ENTITLED_FEATURES` array (after `"nachweis"`)
- Edit `packages/share/src/entitlement.ts`: add `feature_multi_currency: "multi-currency"` to `STRIPE_FEATURE_LOOKUP_MAP`
- Verify `EntitledFeature` type union now includes `"multi-currency"` (automatic via `as const`)

**Validation:**

- `pnpm --filter @warpgogol/share run build:check` — tsc passes
- `grep -n "multi-currency" packages/share/src/entitlement.ts` — confirms both entries

**Completion criterion:** `"multi-currency"` in `ENTITLED_FEATURES` and `feature_multi_currency` in `STRIPE_FEATURE_LOOKUP_MAP`.

**Human review:** no

---

### Step 2. Implement `rate-snapshot.resolve` command handler

**Goal:** Create the command that resolves rate snapshots for the business.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts`:
  - Export `runRateSnapshotResolve(input: KernelCommandInput, context: KernelRuntimeContext): Promise<KernelCommandResult>`
  - Read RatePolicy entities from PBP content for the business
  - For `mode: "business-fixed"`: resolve applicable rate from RateSchedule, create/reuse RateSnapshot
  - For `mode: "external"`: check if Rate Fetcher Service (RFC-0744) is available; if not, fail with clear error
  - Return `RateSnapshotResolveResult` with `snapshotsCreated`, `snapshotsReused`, `errors`
  - Respect `failure.noAcceptableRate` setting: `"block-publication"` → exitCode 1, `"source-price-only"` → exitCode 0 with warnings

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — tsc passes
- File exists at `packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts`

**Completion criterion:** `runRateSnapshotResolve` function exported and compiles.

**Human review:** no

---

### Step 3. Implement `currency-pricing.compile` command handler

**Goal:** Create the command that validates and compiles the CurrencyPricingPolicy.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/currency-pricing-compile.ts`:
  - Export `runCurrencyPricingCompile(input: KernelCommandInput, context: KernelRuntimeContext): Promise<KernelCommandResult>`
  - Read CurrencyPricingPolicy for the business from PBP content
  - Validate: target currencies registered, ratePolicyRefs resolve, derivationContractRefs resolve, `currentUses` valid for current phase
  - Do NOT duplicate RFC-0740 compiler validation rules (1-24) — those are enforced in `derived-prices.materialize`
  - Return `CurrencyPricingCompileResult` with `policyId`, `targetCurrencies`, `errors`
  - If no CurrencyPricingPolicy found, exit with error

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — tsc passes
- File exists at `packages/os/site-kernel-checks/src/currency-pricing-compile.ts`

**Completion criterion:** `runCurrencyPricingCompile` function exported and compiles.

**Human review:** no

---

### Step 4. Implement `derived-prices.materialize` command handler (from RFC-0740)

**Goal:** Create the command that materializes derived prices into the compiled graph.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/derived-prices-materialize.ts`:
  - Export `runDerivedPricesMaterialize(input: KernelCommandInput, context: KernelRuntimeContext): Promise<KernelCommandResult>`
  - Read compiled PBP graph (from `pbp.compile` output or inline compilation)
  - Read compiled CurrencyPricingPolicy (from `currency-pricing.compile` output)
  - For each Offering → each Charge → each target currency: execute `computeCurrencyConversion`, create `PbpMaterializedDerivedPrice`
  - Write `src/content/generated/derived-prices.json`
  - Enforce RFC-0740 compiler validation rules (1-24) — block publication on violations
  - Copy `allowedUses` from CurrencyPricingPolicy

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — tsc passes
- File exists at `packages/os/site-kernel-checks/src/derived-prices-materialize.ts`

**Completion criterion:** `runDerivedPricesMaterialize` function exported and compiles.

**Human review:** no

---

### Step 5. Register commands in command table

**Goal:** Add the 3 new commands to the `BUILD_ARTIFACT_COMMANDS` array with entitlement gates.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts`:
  - Import `runRateSnapshotResolve`, `runCurrencyPricingCompile`, `runDerivedPricesMaterialize`
  - Add 3 `CheckCommandEntry` entries with:
    - `name`: `"rate-snapshot.resolve"`, `"currency-pricing.compile"`, `"derived-prices.materialize"`
    - `scope: "app"`, `supportsAllSites: true`
    - `gate: { severity: "error", phase: "author", conditional: { kind: "entitlement", ref: "multi-currency", description: "Only runs when multi-currency entitlement is active" } }`
    - `execute`: respective handler functions
    - Appropriate `reads`, `writes`, `modulePaths`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — tsc passes
- `grep -n "rate-snapshot.resolve" packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` — entry present
- `grep -n "gate.*conditional.*entitlement.*multi-currency" packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` — gate present

**Completion criterion:** All 3 commands registered in `BUILD_ARTIFACT_COMMANDS` with `gate.conditional.entitlement: multi-currency`.

**Human review:** no

---

### Step 6. Wire pipeline steps into `build-prepare.ts`

**Goal:** Insert the 3 new steps into both pipelines at the correct position.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`:
  - In `SITES_BUILD_PREPARE_PIPELINE`: insert 3 steps after `{ command: "entitlements.resolve" }` (line 49) and before `{ command: "surface.generate" }` (line 52):
    ```ts
    // RFC-0741: multi-currency steps (gated by gate.conditional.entitlement: multi-currency)
    { command: "rate-snapshot.resolve" },
    { command: "currency-pricing.compile" },
    { command: "derived-prices.materialize" },
    ```
  - In `SITES_BUILD_PREPARE_DEV_PIPELINE`: insert same 3 steps after `{ command: "entitlements.resolve" }` (line 170) and before `{ command: "surface.generate" }` (line 171)
  - Add `CHANGE_SUMMARY` entry: `<item>RFC-0741: added rate-snapshot.resolve, currency-pricing.compile, derived-prices.materialize after entitlements.resolve in both pipelines.</item>`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — tsc passes
- `grep -n "rate-snapshot.resolve" packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — present in both pipelines
- `grep -c "derived-prices.materialize" packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — count is 2 (both pipelines)

**Completion criterion:** Both `SITES_BUILD_PREPARE_PIPELINE` and `SITES_BUILD_PREPARE_DEV_PIPELINE` contain the 3 new steps between `entitlements.resolve` and `surface.generate`.

**Human review:** no

---

### Step 7. Verify `gate.conditional.entitlement` mechanism for pipeline steps

**Goal:** Confirm that the pipeline runner checks `gate.conditional` before executing each step, not just for standalone command execution.

**Agent actions:**

- Explore the pipeline runner code in `packages/os/site-kernel/` to find where `KernelPipelineStep` entries are executed
- Check if the runner reads `CheckCommandEntry.gate.conditional` before calling `execute`
- If the runner does NOT check `gate.conditional` for pipeline steps, add imperative entitlement checks inside each command handler (`readEntitledFeatures(appDir)` → skip if `multi-currency` not present)
- If the runner DOES check, no additional code needed — document the mechanism in the implementation notes

**Validation:**

- `grep -r 'gate.conditional' packages/os/site-kernel/src/` — find where gate is checked
- `grep -r 'conditional.*entitlement' packages/os/site-kernel/src/` — find entitlement gate logic
- Test: run pipeline with `multi-currency` NOT in entitlements → steps are skipped
- Test: run pipeline with `multi-currency` IN entitlements → steps execute

**Completion criterion:** Either the pipeline runner checks `gate.conditional` (documented), or imperative checks are added inside handlers.

**Human review:** no

---

### Step 8. Write tests

**Goal:** Verify entitlement gating, pipeline membership, and command behavior.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/rate-snapshot-resolve.test.ts`:
  - Test: skips when `multi-currency` not in entitlements (gate skips)
  - Test: resolves business-fixed rate from RateSchedule
  - Test: fails with clear error for external mode when service unavailable
- Create `packages/os/site-kernel-checks/src/tests/currency-pricing-compile.test.ts`:
  - Test: skips when not entitled
  - Test: validates CurrencyPricingPolicy structure
  - Test: fails when no CurrencyPricingPolicy found
- Create `packages/os/site-kernel-checks/src/tests/derived-prices-materialize.test.ts`:
  - Test: skips when not entitled
  - Test: materializes derived prices for each Charge × target currency
  - Test: blocks publication on validation rule violations (RFC-0740 rules)
  - Test: copies `allowedUses` from CurrencyPricingPolicy
- Create or update `packages/os/site-kernel-checks/src/tests/build-prepare-pipeline.test.ts`:
  - Test: `SITES_BUILD_PREPARE_PIPELINE` contains `rate-snapshot.resolve`, `currency-pricing.compile`, `derived-prices.materialize` after `entitlements.resolve` and before `surface.generate`
  - Test: `SITES_BUILD_PREPARE_DEV_PIPELINE` contains the same 3 steps in the same position

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run vitest run -- --reporter=verbose` — all new tests pass
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — tsc passes

**Completion criterion:** All new tests pass; pipeline membership tests confirm step ordering.

**Human review:** no

---

### Step 9. Update AGENTS.md files

**Goal:** Document the new feature and commands for agents.

**Agent actions:**

- Edit `packages/share/AGENTS.md`: add `multi-currency` to the entitlement catalog section (if one exists) or add a note about the new feature
- Edit `packages/os/site-kernel-checks/AGENTS.md`: document the 3 new commands (`rate-snapshot.resolve`, `currency-pricing.compile`, `derived-prices.materialize`) and their pipeline placement

**Validation:**

- `grep -n "multi-currency" packages/share/AGENTS.md` — mentioned
- `grep -n "rate-snapshot.resolve" packages/os/site-kernel-checks/AGENTS.md` — mentioned

**Completion criterion:** Both AGENTS.md files reference the new feature and commands.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files (root, `packages/share/`, `packages/os/site-kernel-checks/`) with new feature and commands.
- Verify no `docs/*.xml` Compass files need updates (catalog addition, not structural change).
- Verify no `docs/architecture-dna.md` changes needed (no new DNA invariant).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion against implemented code. Mark `[x]` with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0741 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0741`
- `pnpm --filter @warpgogol/share run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run vitest run`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0741`
- `pnpm --filter @warpgogol/share run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run vitest run`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0741` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0741.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0741` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Stripe configuration drift | Step 1 adds the lookup key; operator manually configures Stripe admin. `entitlements.resolve` logs resolved features for verification. |
| Pipeline step ordering | Step 7 inserts steps at exact line positions (after `entitlements.resolve`, before `surface.generate`). Pipeline membership test in Step 8 verifies ordering. |
| Rate fetch service dependency | Step 3 implements `business-fixed` mode (no external service) and clear error for `external` mode when RFC-0744 service is not deployed. |
| Agent misinterpretation risk | Enhanced RFC explicitly notes `entitlement.module.validate` is NOT in `build-prepare`. Step 7 only modifies `build-prepare.ts`, not `sites-check-author.ts`. |
| Validation duplication with RFC-0740 | Step 4 explicitly excludes RFC-0740 compiler rules from `currency-pricing.compile`. Step 5 enforces them in `derived-prices.materialize`. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1 or DNA-4, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0741 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `gate.conditional.entitlement` mechanism does not work for pipeline steps (only command entries), add imperative `readEntitledFeatures()` checks inside command handlers as a fallback. Document the gap and consider a new RFC for pipeline-level conditional gating.
- If `pbp.compile` command does not exist (prerequisite not met), create a new RFC for `pbp.compile` that exposes the PBP compiler as a site-kernel command. RFC-0741 cannot be implemented without it.
- If RFC-0740 is not yet implemented, run the full pipeline for RFC-0740 first (audit → enhance → plan → implement). RFC-0741 depends on RFC-0740's types and materialization logic.
- If RFC-0740's `PbpMaterializedDerivedPrice` type conflicts with existing PBP types in a way that requires schema changes, stop and create a new RFC for the schema change.
