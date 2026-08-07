---
rfcId: RFC-0735
planId: PLAN-RFC-0735-01
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
    - "@warpgogol/site-kernel-checks"
  services:
    - services/rate-fetcher-worker
  docs:
    - docs/rfcs/rfc-0735-multi-currency-pricing-module-program-charter.md
    - docs/rfcs/rfc-0736-currency-pricing-policy-entity.md
    - docs/rfcs/rfc-0737-rate-policy-and-rate-schedule-entities.md
    - docs/rfcs/rfc-0738-rate-snapshot-entity.md
    - docs/rfcs/rfc-0739-currency-conversion-derivation-contract.md
    - docs/rfcs/rfc-0740-derived-price-materialization.md
    - docs/rfcs/rfc-0741-multi-currency-entitled-feature-and-build-pipeline.md
    - docs/rfcs/rfc-0742-currency-aware-price-projection.md
    - docs/rfcs/rfc-0743-currency-selector-ui-component.md
    - docs/rfcs/rfc-0744-rate-fetcher-service.md
    - docs/rfcs/rfc-0745-currency-aware-schema-org-mapping.md
    - packages/pbp/AGENTS.md
    - packages/share/AGENTS.md
    - packages/ui/AGENTS.md
---

# Implementation Plan: RFC-0735 — Multi-Currency Pricing Module — Program Charter

## 1. Objectives

This is a **program charter plan** — it orchestrates the sequential implementation of 10 child RFCs (0736–0745). Each child RFC goes through its own audit → enhance → plan → implement pipeline. The charter itself produces no code changes; its acceptance criteria are program-level.

- [ ] Objective 1 — All 10 child RFCs (0736–0745) pass `rfc.validate` (maps to: "All 11 RFCs written and validated")
- [ ] Objective 2 — PBP entities exported: `PbpCurrencyPricingPolicy`, `PbpRatePolicy`, `PbpRateSchedule`, `PbpRateSnapshot` (maps to: RFC-0736, 0737, 0738 criteria)
- [ ] Objective 3 — `currency-conversion` derivation registered in compiler (maps to: RFC-0739 criterion)
- [ ] Objective 4 — `derived-prices.materialize` command produces materialized prices (maps to: RFC-0740 criterion)
- [ ] Objective 5 — `multi-currency` in `ENTITLED_FEATURES`, build pipeline gated (maps to: RFC-0741 criterion)
- [ ] Objective 6 — Price projection envelope includes currency-aware data (maps to: RFC-0742 criterion)
- [ ] Objective 7 — Currency selector UI renders on warpgogol-com (maps to: RFC-0743 criterion)
- [ ] Objective 8 — Rate fetcher service creates rate snapshots (maps to: RFC-0744 criterion)
- [ ] Objective 9 — Schema.org output emits business-declared prices only (maps to: RFC-0745 criterion)
- [ ] Objective 10 — `pnpm build:check` and `pnpm test` pass across all affected packages (maps to: build/test criteria)

## 2. Affected artifacts

### 2.1 Code and commands

| Package | Changes (via child RFCs) |
|---|---|
| `@warpgogol/pbp` | New entities: `PbpCurrencyPricingPolicy` (0736), `PbpRatePolicy` + `PbpRateSchedule` (0737), `PbpRateSnapshot` (0738). New derivation: `currency-conversion` (0739). Compiler extension: materialize derived prices (0740). |
| `@warpgogol/share` | New entitled feature: `multi-currency` (0741). Stripe lookup key mapping. Price projection envelope (0742). |
| `@warpgogol/ui` | New components: `currency-selector` (0743), currency-aware price display (0742). |
| `@warpgogol/site-kernel-checks` | New commands: `rate-snapshot.resolve` (0741), `currency-pricing.compile` (0741), `derived-prices.materialize` (0740). Pipeline extension. |
| `services/rate-fetcher-worker` | New service workspace (0744). Daily rate fetching, rate snapshot creation. |

### 2.2 Configuration and data

- `src/content/business-profile/{lang}/currency-pricing-policy.md` — authored CurrencyPricingPolicy (0736)
- `src/content/business-profile/{lang}/rate-policy.md` — authored RatePolicy (0737)
- `src/content/business-profile/{lang}/rate-schedule.md` — authored RateSchedule (0737)
- Rate snapshots — immutable observations (0738, 0744)
- `ENTITLED_FEATURES` catalog in `packages/share/src/entitlement.ts` (0741)
- Stripe lookup key mapping (0741)

### 2.3 Documentation and specs

- `packages/pbp/AGENTS.md` — new entity exports, derivation contract, compiler extension
- `packages/share/AGENTS.md` — new entitled feature, projection envelope
- `packages/ui/AGENTS.md` — new currency selector component
- `docs/*.xml` Compass files — update if repository-wide semantics changed (per child RFC plans)

### 2.4 Validation and pipelines

- `build.check` / `build.prepare` — new pipeline steps for currency compilation (0740, 0741)
- `rfc.validate` — all 11 RFCs must pass
- `pnpm --filter @warpgogol/pbp build:check` and `test`
- `pnpm --filter @warpgogol/share build:check` and `test`
- `pnpm --filter @warpgogol/ui build:check`
- `pnpm --filter @warpgogol/site-kernel-checks build:check` and `test`

## 3. Step sequence

### Step 1. Accept and implement RFC-0736 (CurrencyPricingPolicy Entity)

**Goal:** Define and export `PbpCurrencyPricingPolicy` entity from `@warpgogol/pbp`.

**Agent actions:**

- Run `fo-idea-audit` on RFC-0736
- Run `fo-idea-enhance` on RFC-0736 (integrate audit findings)
- Run `fo-idea-plan` on RFC-0736 (transition to accepted, create implementation plan)
- Run `fo-idea-implement` on RFC-0736 (execute plan, stamp implemented)
- Verify: `PbpCurrencyPricingPolicy` exported from `@warpgogol/pbp` barrel
- Verify: Zod schema `currencyPricingPolicySchema` in `@warpgogol/pbp/schemas`
- Verify: `pnpm --filter @warpgogol/pbp build:check` passes
- Verify: `pnpm --filter @warpgogol/pbp test` passes

**Completion criterion:** RFC-0736 status is `implemented`; `PbpCurrencyPricingPolicy` is exported; build:check and test pass.

**Human review:** no — child RFC goes through its own pipeline.

---

### Step 2. Accept and implement RFC-0737 (RatePolicy and RateSchedule Entities)

**Goal:** Define and export `PbpRatePolicy`, `PbpRateSchedule` entities from `@warpgogol/pbp`.

**Agent actions:**

- Run full pipeline (audit → enhance → plan → implement) on RFC-0737
- Verify: `PbpRatePolicy`, `PbpRateSchedule` exported from `@warpgogol/pbp`
- Verify: Zod schemas in `@warpgogol/pbp/schemas`
- Verify: `pnpm --filter @warpgogol/pbp build:check` and `test` pass

**Completion criterion:** RFC-0737 status is `implemented`; entities exported; build:check and test pass.

**Human review:** no

---

### Step 3. Accept and implement RFC-0738 (RateSnapshot Entity)

**Goal:** Define and export `PbpRateSnapshot` entity from `@warpgogol/pbp`.

**Agent actions:**

- Run full pipeline on RFC-0738
- Verify: `PbpRateSnapshot` exported from `@warpgogol/pbp`
- Verify: Zod schema in `@warpgogol/pbp/schemas`
- Verify: `pnpm --filter @warpgogol/pbp build:check` and `test` pass

**Completion criterion:** RFC-0738 status is `implemented`; entity exported; build:check and test pass.

**Human review:** no

---

### Step 4. Accept and implement RFC-0739 (Currency Conversion Derivation Contract)

**Goal:** Register `currency-conversion` derivation in the PBP compiler.

**Agent actions:**

- Run full pipeline on RFC-0739
- Implement `currency-conversion` derivation in `packages/pbp/src/compiler/derivations.ts`
- Implement decimal-string arithmetic (bigint-based or equivalent)
- Add golden tests for conversion precision
- Verify: `runDerivations` handles `derivationRef: "currency-conversion"`
- Verify: `pnpm --filter @warpgogol/pbp build:check` and `test` pass

**Completion criterion:** RFC-0739 status is `implemented`; `currency-conversion` derivation registered; golden tests pass.

**Human review:** no

---

### Step 5. Accept and implement RFC-0740 (Derived Price Materialization)

**Goal:** `derived-prices.materialize` command produces materialized derived prices in the compiled graph.

**Agent actions:**

- Run full pipeline on RFC-0740
- Implement `derived-prices.materialize` command in `@warpgogol/site-kernel-checks`
- Wire into build pipeline (`build.prepare`)
- Verify: materialized prices appear in compiled graph
- Verify: `pnpm --filter @warpgogol/site-kernel-checks build:check` and `test` pass

**Completion criterion:** RFC-0740 status is `implemented`; `derived-prices.materialize` command works; build pipeline extended.

**Human review:** no

---

### Step 6. Accept and implement RFC-0741 (multi-currency Entitled Feature and Build Pipeline)

**Goal:** Add `multi-currency` to `ENTITLED_FEATURES` and gate build pipeline steps.

**Agent actions:**

- Run full pipeline on RFC-0741
- Add `multi-currency` to `ENTITLED_FEATURES` in `packages/share/src/entitlement.ts`
- Add Stripe lookup key mapping
- Gate currency compilation pipeline steps by entitlement
- Verify: `pnpm --filter @warpgogol/share build:check` and `test` pass

**Completion criterion:** RFC-0741 status is `implemented`; `multi-currency` in `ENTITLED_FEATURES`; pipeline steps gated.

**Human review:** no

---

### Step 7. Accept and implement RFC-0742 (Currency-Aware Price Projection)

**Goal:** Price projection envelope includes currency-aware data.

**Agent actions:**

- Run full pipeline on RFC-0742
- Extend price projection in `@warpgogol/pbp` and `@warpgogol/share`
- Verify: projection envelope carries currency-aware price data
- Verify: `pnpm --filter @warpgogol/pbp build:check` and `test` pass

**Completion criterion:** RFC-0742 status is `implemented`; price projection envelope includes currency data.

**Human review:** no

---

### Step 8. Accept and implement RFC-0743 (Currency Selector UI Component)

**Goal:** Currency selector UI component renders on warpgogol-com.

**Agent actions:**

- Run full pipeline on RFC-0743
- Create `currency-selector` component in `packages/ui/src/components/currency-selector/`
- Add manifest.yaml, .astro, .css, .types.ts
- Register in `MOON_IMPORT_PATHS` in `packages/share/src/page.ts`
- Wire into warpgogol-com page composition
- Verify: `pnpm --filter @warpgogol/ui build:check` passes
- Verify: component renders on warpgogol-com dev preview

**Completion criterion:** RFC-0743 status is `implemented`; currency selector component exists with manifest; renders on warpgogol-com.

**Human review:** no

---

### Step 9. Accept and implement RFC-0744 (Rate Fetcher Service)

**Goal:** Rate fetcher service creates rate snapshots from external sources.

**Agent actions:**

- Run full pipeline on RFC-0744
- Create `services/rate-fetcher-worker/` service workspace
- Implement rate fetching from external source (ECB or equivalent)
- Implement fallback source
- Create rate snapshots via `rate-snapshot.resolve`
- Verify: service workspace has `.env.example`, `AGENTS.md`, `package.json`
- Verify: `pnpm --filter @warpgogol/site-kernel-checks build:check` passes

**Completion criterion:** RFC-0744 status is `implemented`; rate fetcher service creates snapshots.

**Human review:** yes — external API integration (rate source selection, API key management) should be reviewed.

---

### Step 10. Accept and implement RFC-0745 (Currency-Aware Schema.org Mapping)

**Goal:** Schema.org output emits business-declared prices only.

**Agent actions:**

- Run full pipeline on RFC-0745
- Extend Schema.org mapping in `@warpgogol/pbp` and `@warpgogol/share/semantic`
- Ensure derived prices are emitted only when entitled
- Verify: `pnpm --filter @warpgogol/pbp build:check` and `test` pass
- Verify: `pnpm --filter @warpgogol/share build:check` and `test` pass

**Completion criterion:** RFC-0745 status is `implemented`; Schema.org mapping is currency-aware.

**Human review:** no

---

### Final Step. Program-level verification, documentation sync, review, fix, and stamp

**Goal:** Verify all program-level acceptance criteria, sync documentation, run review, and stamp RFC-0735 as implemented.

**Agent actions:**

- Verify all 10 child RFCs (0736–0745) have status `implemented`
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0735` — must pass
- Run `pnpm --filter @warpgogol/pbp build:check` and `test` — must pass
- Run `pnpm --filter @warpgogol/share build:check` and `test` — must pass
- Run `pnpm --filter @warpgogol/ui build:check` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-checks build:check` and `test` — must pass
- Update `packages/pbp/AGENTS.md` with new entity exports and derivation contract
- Update `packages/share/AGENTS.md` with new entitled feature and projection envelope
- Update `packages/ui/AGENTS.md` with currency selector component
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: invoke `fo-fix` if `fo-review` reported findings. Re-run `fo-review`. Max 3 iterations.
- Check off acceptance criteria: verify each criterion in RFC-0735 against implemented child RFCs. Mark `[x]` with inline `(evidence: ...)` annotations.
- Stamp: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0735 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0735`
- All 10 child RFCs have status `implemented`
- All affected packages pass `build:check` and `test`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All child RFCs implemented; all acceptance criteria checked off with evidence; RFC-0735 stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0735`
- `pnpm exec site-kernel run rfc.validate` (all RFCs, including 0736–0745)
- `pnpm --filter @warpgogol/pbp build:check`
- `pnpm --filter @warpgogol/pbp test`
- `pnpm --filter @warpgogol/share build:check`
- `pnpm --filter @warpgogol/share test`
- `pnpm --filter @warpgogol/ui build:check`
- `pnpm --filter @warpgogol/site-kernel-checks build:check`
- `pnpm --filter @warpgogol/site-kernel-checks test`

### 4.2 Evidence artifacts

- Each child RFC's `implemented` status and `implementedAt` timestamp
- Commit messages referencing `RFC-0735` and child RFC IDs in subject lines
- Review report in `docs/reviews/code/`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
|---|---|
| Decimal arithmetic precision | Step 4 (RFC-0739) mandates bigint-based decimal arithmetic + golden tests |
| Rate source availability | Step 9 (RFC-0744) implements fallback source + last-known-value within max age |
| Entitlement gating complexity | Step 6 (RFC-0741) gates each layer explicitly; pipeline steps skipped if not entitled |
| Scope creep (transactional integration) | `currentUses: prohibited` for all transactional scopes; nonGoals explicitly exclude Quote/Contract/Invoice/Settlement |

## 6. Escalation triggers

- If implementation of any child RFC reveals an invariant conflict with DNA-4 or DNA-55, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-07XX --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `pbp/*@1` namespace cannot accommodate a new entity type additively, escalate to a namespace bump (`@2`) via a new superseding RFC — do not force incompatible changes into `@1`.
- If decimal arithmetic precision cannot be achieved with bigint-based approach, escalate to a dedicated decimal library evaluation RFC — do not use binary float arithmetic.
