---
rfcId: RFC-0735
planId: PLAN-RFC-0735-01
status: accepted
owner: architecture
createdAt: 2026-08-07
updatedAt: 2026-08-07
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

This is a **program charter plan** — it orchestrates the sequential implementation of 10 child RFCs (0736–0745). Each child RFC went through its own audit → enhance → plan → implement pipeline. The charter itself produces no code changes; its acceptance criteria are program-level.

All 10 child RFCs (0736–0745) are `implemented` as of 2026-08-07. The remaining work is program-level verification, documentation sync, review, and stamping.

- [x] Objective 1 — All 10 child RFCs (0736–0745) pass `rfc.validate` (evidence: all 10 archived as implemented)
- [x] Objective 2 — PBP entities exported: `PbpCurrencyPricingPolicy`, `PbpRatePolicy`, `PbpRateSchedule`, `PbpRateSnapshot` (evidence: RFC-0736/0737/0738 implemented)
- [x] Objective 3 — `currency-conversion` derivation registered in compiler (evidence: RFC-0739 implemented)
- [x] Objective 4 — `derived-prices.materialize` command produces materialized prices (evidence: RFC-0740 implemented)
- [x] Objective 5 — `multi-currency` in `ENTITLED_FEATURES`, build pipeline gated (evidence: RFC-0741 implemented)
- [x] Objective 6 — Price projection envelope includes currency-aware data (evidence: RFC-0742 implemented)
- [x] Objective 7 — Currency selector UI renders on warpgogol-com (evidence: RFC-0743 implemented)
- [x] Objective 8 — Rate fetcher service creates rate snapshots (evidence: RFC-0744 implemented)
- [x] Objective 9 — Schema.org output emits business-declared prices only (evidence: RFC-0745 implemented)
- [ ] Objective 10 — `pnpm build:check` and `pnpm test` pass across all affected packages (maps to: build/test criteria)

## 2. Affected artifacts

### 2.1 Code and commands

| Package | Changes (via child RFCs) |
| --- | --- |
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

### Step 1. Program-level verification, documentation sync, review, fix, and stamp

**Goal:** Verify all program-level acceptance criteria, sync documentation, run review, and stamp RFC-0735 as implemented.

All 10 child RFCs (0736–0745) were implemented in prior sessions through their own full pipelines. This step is the only remaining work for the charter.

**Agent actions:**

- Verify all 10 child RFCs (0736–0745) have status `implemented`
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0735` — must pass
- Run `pnpm --filter @warpgogol/pbp build:check` and `test` — must pass
- Run `pnpm --filter @warpgogol/share build:check` and `test` — must pass
- Run `pnpm --filter @warpgogol/ui build:check` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-checks build:check` and `test` — must pass
- Verify `packages/pbp/AGENTS.md` reflects new entity exports and derivation contract (updated by child RFC implementations)
- Verify `packages/share/AGENTS.md` reflects new entitled feature and projection envelope (updated by child RFC implementations)
- Verify `packages/ui/AGENTS.md` reflects currency selector component (updated by child RFC implementation)
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
| --- | --- |
| Decimal arithmetic precision | Step 4 (RFC-0739) mandates bigint-based decimal arithmetic + golden tests |
| Rate source availability | Step 9 (RFC-0744) implements fallback source + last-known-value within max age |
| Entitlement gating complexity | Step 6 (RFC-0741) gates each layer explicitly; pipeline steps skipped if not entitled |
| Scope creep (transactional integration) | `currentUses: prohibited` for all transactional scopes; nonGoals explicitly exclude Quote/Contract/Invoice/Settlement |

## 6. Escalation triggers

- If implementation of any child RFC reveals an invariant conflict with DNA-4 or DNA-55, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-07XX --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `pbp/*@1` namespace cannot accommodate a new entity type additively, escalate to a namespace bump (`@2`) via a new superseding RFC — do not force incompatible changes into `@1`.
- If decimal arithmetic precision cannot be achieved with bigint-based approach, escalate to a dedicated decimal library evaluation RFC — do not use binary float arithmetic.
