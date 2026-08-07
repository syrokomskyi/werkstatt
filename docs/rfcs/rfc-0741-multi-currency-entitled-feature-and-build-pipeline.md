---
id: RFC-0741
title: "multi-currency Entitled Feature and Build Pipeline"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-07
updatedAt: 2026-08-07
enhancedAt: 2026-08-07
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-1
  - DNA-4
  - RFC-0735
  - RFC-0740
  - RFC-0744
satisfies:
  - DNA-1
versionBump: minor
commands:
  proposed:
    - rate-snapshot.resolve
    - currency-pricing.compile
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/share"
  - "@warpgogol/pbp"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "multi-currency added to ENTITLED_FEATURES catalog"
  - "STRIPE_FEATURE_LOOKUP_MAP has feature_multi_currency mapping"
  - "rate-snapshot.resolve command registered"
  - "currency-pricing.compile command registered"
  - "derived-prices.materialize integrated into build-prepare pipeline"
  - "Pipeline steps gated by multi-currency entitlement"
  - "entitlement.module.validate covers multi-currency module"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define the currency selector UI — that is RFC-0743"
  - "Does not define the price projection — that is RFC-0742"
  - "Does not define the rate fetcher service — that is RFC-0744"
  - "Does not change Stripe billing logic — only the feature catalog and lookup map"
  - "Does not define PBP entity types (CurrencyPricingPolicy, RatePolicy, RateSnapshot) — those are RFC-0736, RFC-0737, RFC-0738"
  - "Does not define compiler validation rules for derived prices — those are RFC-0740"
---

# RFC-0741: multi-currency Entitled Feature and Build Pipeline

## Context

RFC-0740 defines `derived-prices.materialize` which produces materialized derived prices. This RFC defines how the multi-currency capability is gated as a paid module and how the build pipeline is extended with new steps that run only when the `multi-currency` entitlement is resolved.

The existing entitlement system works as follows:

1. `entitlements.resolve` fetches entitlements from Stripe and writes `src/entitlements.generated.yaml`
2. `entitlement.module.validate` checks that compiled modules are a subset of resolved entitlements
3. Route registry gates routes based on entitlements (e.g. `blog`, `pseo`, `nachweis`)

This RFC adds `multi-currency` to the same system.

## Problem

1. **No `multi-currency` entitled feature.** The `ENTITLED_FEATURES` catalog in `packages/share/src/entitlement.ts` does not include `multi-currency`. There is no way to gate the capability as a paid module.

2. **No Stripe lookup key mapping.** `STRIPE_FEATURE_LOOKUP_MAP` has no entry for `multi-currency`. Stripe cannot resolve the feature.

3. **No build pipeline steps.** The `build-prepare` pipeline does not include `rate-snapshot.resolve`, `currency-pricing.compile`, or `derived-prices.materialize`. These steps need to run after `entitlements.resolve` and before `surface.generate` (the first projection generator that consumes entitlement-aware content).

4. **No entitlement gating on pipeline steps.** The pipeline steps must be skipped when `multi-currency` is not entitled. Running them without entitlement would produce derived prices for a site that hasn't paid for the feature.

## Decision

### 1. Add `multi-currency` to `ENTITLED_FEATURES`

```ts
// packages/share/src/entitlement.ts

export const ENTITLED_FEATURES = [
  "blog",
  "integrations.channels",
  // ... existing ...
  "nachweis",
  "multi-currency",
] as const;
```

### 2. Add Stripe lookup key mapping

```ts
export const STRIPE_FEATURE_LOOKUP_MAP: Record<string, EntitledFeature> = {
  // ... existing ...
  feature_multi_currency: "multi-currency",
};
```

### 3. New commands

#### `rate-snapshot.resolve`

```sh
pnpm exec site-kernel run rate-snapshot.resolve --system warpgogol-com
```

Reads all RatePolicy entities for the business. For each `mode: "external"` policy, fetches the latest rate from the configured source (via the Rate Fetcher Service — RFC-0744) and creates a RateSnapshot content file. For `mode: "business-fixed"`, resolves the applicable rate from the RateSchedule and creates a snapshot.

This command is a thin wrapper — the actual rate fetching logic lives in the Rate Fetcher Service (RFC-0744). The command triggers the service and waits for snapshot creation.

#### `currency-pricing.compile`

```sh
pnpm exec site-kernel run currency-pricing.compile --system warpgogol-com
```

Reads the CurrencyPricingPolicy for the business and validates it:

- All target currencies are registered
- All ratePolicyRefs resolve
- All derivationContractRefs resolve
- `currentUses` is valid for the current phase

Produces a compiled currency pricing policy that `derived-prices.materialize` (RFC-0740) consumes.

### 4. Pipeline integration

The `build-prepare` pipeline gains three new steps, inserted after `entitlements.resolve` and before `surface.generate` (the first projection generator):

```
build-prepare pipeline (SITES_BUILD_PREPARE_PIPELINE):
  ... config.regenerate, yaml checks, routes.generate, env.example.generate ...
  entitlements.resolve              (existing — line 49)
  --- multi-currency steps (gated by gate.conditional.entitlement: multi-currency) ---
  rate-snapshot.resolve             (NEW — skipped if not entitled)
  currency-pricing.compile          (NEW — skipped if not entitled)
  derived-prices.materialize        (NEW — from RFC-0740, skipped if not entitled)
  --- end multi-currency steps ---
  surface.generate                  (existing — first projection generator)
  ... remaining build-prepare steps ...
```

Note: `entitlement.module.validate` is NOT in `build-prepare` — it runs in the `sites-check-author` pipeline. The multi-currency module's `entitlement: "multi-currency"` declaration in `surface.modules` is validated there.

The `SITES_BUILD_PREPARE_DEV_PIPELINE` also gains the three multi-currency steps after `entitlements.resolve` (line 170) and before `surface.generate` (line 171). In dev mode, `rate-snapshot.resolve` operates in `business-fixed` mode only — no external API calls. For `external` mode in dev, the command skips and logs a warning.

### 5. Entitlement gating

Each new command entry uses the existing declarative `gate.conditional.entitlement` mechanism (same pattern as `surface.hub.validate`, `surface.industry.validate`, `pseo.validate` in `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts`):

```ts
// Command table entry for rate-snapshot.resolve
{
  name: "rate-snapshot.resolve",
  // ...
  gate: {
    severity: "error",
    phase: "author",
    conditional: {
      kind: "entitlement",
      ref: "multi-currency",
      description: "Only runs when multi-currency entitlement is active",
    },
  },
  execute: runRateSnapshotResolve,
}
```

The pipeline runner checks the `gate.conditional` before executing the step. If `multi-currency` is not in the resolved entitlements (`src/entitlements.generated.yaml`), the step is skipped with a log message. No imperative `readEntitledFeatures()` call is needed inside the command handler.

If `multi-currency` is not entitled, all three steps are skipped. The site builds without derived prices. The currency selector UI (RFC-0743) is not rendered. The site shows source-currency prices only.

### 6. `entitlement.module.validate` — no code change needed

The `entitlement.module.validate` command (in `packages/os/site-kernel-checks/src/entitlement-module.ts`) already validates that compiled modules are a subset of resolved entitlements. It reads `entitlement` from each `surface.modules.<id>` context and checks it against `src/entitlements.generated.yaml`. The multi-currency module declares `entitlement: "multi-currency"` in its surface module context — no code change to the validator is needed. Adding `"multi-currency"` to `ENTITLED_FEATURES` is sufficient for the validator to recognize it.

### 7. Route registry — no new routes

The route registry (`packages/share/src/astro/routes/registry.ts`) does not add new routes for multi-currency. The currency selector UI (RFC-0743) and derived price projections (RFC-0742) are rendered on existing offering pages via build-time data from `src/content/generated/derived-prices.json`. The route registry does not need enrichment — offering page routes already exist, and the rendering layer reads derived prices directly from the generated file. This RFC does not modify `registry.ts`.

## Architectural fit

- **DNA-1 (Monorepo boundary).** Entitlement catalog in `@warpgogol/share`, command handlers in `@warpgogol/site-kernel-checks`, PBP types in `@warpgogol/pbp`. Imports flow packages → packages, never across sites.
- **DNA-4 (Canonical content in `src/content/`).** RateSnapshot and CurrencyPricingPolicy are authored content entities under `src/content/`. Derived prices are generated into `src/content/generated/`.
- **RFC-0740 (Derived Price Materialization).** This RFC integrates `derived-prices.materialize` into the pipeline and adds the entitlement gate.
- **RFC-0744 (Rate Fetcher Service).** `rate-snapshot.resolve` for `mode: "external"` depends on the Rate Fetcher Service. For `mode: "business-fixed"`, no external service is needed.
- **Existing entitlement pattern.** Follows the same `gate.conditional.entitlement` pattern as `surface.hub.validate`, `surface.industry.validate`, `pseo.validate`.

## Design

### CLI surface

```sh
pnpm exec site-kernel run rate-snapshot.resolve --system warpgogol-com
pnpm exec site-kernel run currency-pricing.compile --system warpgogol-com
pnpm exec site-kernel run derived-prices.materialize --system warpgogol-com
```

### TypeScript contracts

```ts
// packages/share/src/entitlement.ts — additions

// ENTITLED_FEATURES array gains "multi-currency"
// STRIPE_FEATURE_LOOKUP_MAP gains "feature_multi_currency": "multi-currency"
```

```ts
// packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts

export interface RateSnapshotResolveResult {
  snapshotsCreated: number;
  snapshotsReused: number;
  errors: string[];
}
```

```ts
// packages/os/site-kernel-checks/src/currency-pricing-compile.ts

export interface CurrencyPricingCompileResult {
  policyId: string;
  targetCurrencies: string[];
  errors: string[];
}
```

Note: command handlers receive `KernelCommandInput` and `KernelRuntimeContext` (same as all kernel commands). No custom input type is needed — the system id comes from `context.site`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/entitlement.ts` | `ENTITLED_FEATURES` + `STRIPE_FEATURE_LOOKUP_MAP` additions |
| `packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts` | `rate-snapshot.resolve` command handler |
| `packages/os/site-kernel-checks/src/currency-pricing-compile.ts` | `currency-pricing.compile` command handler |
| `packages/os/site-kernel-checks/src/derived-prices-materialize.ts` | `derived-prices.materialize` command handler (from RFC-0740) |
| `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` | Both `SITES_BUILD_PREPARE_PIPELINE` and `SITES_BUILD_PREPARE_DEV_PIPELINE` gain 3 new steps |
| `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` | Command table entries for new commands with `gate.conditional.entitlement` |
| `packages/os/site-kernel-checks/src/tests/build-prepare-pipeline.test.ts` | Pipeline membership tests for new steps |

### Output format

```json
{
  "command": "rate-snapshot.resolve",
  "status": "ok",
  "system": "warpgogol-com",
  "snapshotsCreated": 2,
  "snapshotsReused": 0,
  "errors": []
}
```

```json
{
  "command": "currency-pricing.compile",
  "status": "ok",
  "system": "warpgogol-com",
  "policyId": "https://warpgogol.com/id/currency-pricing-policy/default",
  "targetCurrencies": ["UAH", "USD"],
  "errors": []
}
```

### Failure modes

- **Not entitled.** All three steps are skipped by the `gate.conditional.entitlement` mechanism. The build continues without derived prices.
- **No CurrencyPricingPolicy.** `currency-pricing.compile` exits with error. `derived-prices.materialize` is skipped (the pipeline runner stops on error). The build fails.
- **Rate fetch failure (external mode).** `rate-snapshot.resolve` logs the error. If `failure.noAcceptableRate: "block-publication"`, the command exits with error and the build fails. If `"source-price-only"`, the command returns with warnings and the build continues without derived prices for that pair.
- **Rate Fetcher Service not deployed (external mode).** `rate-snapshot.resolve` fails with a clear error: "Rate Fetcher Service not available for external mode. Use business-fixed mode or deploy RFC-0744." The build fails if `block-publication` is configured.
- **Business-fixed mode, no applicable RateSchedule entry.** `rate-snapshot.resolve` skips the pair and logs a warning. If `block-publication`, the build fails.
- **Empty state (site with no CurrencyPricingPolicy).** `currency-pricing.compile` exits with error. The pipeline stops. This is correct — a site entitled for multi-currency must have a CurrencyPricingPolicy.

## Rollout

- **Immediate:** Upon acceptance, the feature, commands, and pipeline steps are added.
- **No backward compatibility:** The pipeline is extended. Sites without `multi-currency` entitlement skip the new steps via `gate.conditional.entitlement`.
- **Stripe configuration:** The Stripe product for `multi-currency` must be configured with `lookup_key: feature_multi_currency`. This is a manual Stripe admin action, not code.
- **Phased deployment:** `business-fixed` mode works immediately (no external service). `external` mode requires RFC-0744 (Rate Fetcher Service) to be deployed.
- **Dev pipeline:** Multi-currency steps are included in `SITES_BUILD_PREPARE_DEV_PIPELINE`. In dev, `rate-snapshot.resolve` operates in `business-fixed` mode only; `external` mode is skipped with a warning.
- **AGENTS.md updates:** `packages/share/AGENTS.md` should document the new `multi-currency` feature in the entitlement catalog section. `packages/os/site-kernel-checks/AGENTS.md` should document the new commands and pipeline steps.
- **Compass XML sync:** No `docs/*.xml` changes required — this RFC does not change repository-wide requirements or shared package contracts beyond adding a feature to the catalog.

## Alternatives considered

- **Gate at route level only.** Only gate the currency selector UI, not the build pipeline. Rejected: without gating the pipeline, derived prices would be materialized even for non-entitled sites, wasting build time and producing unused data.

- **Separate pipeline.** Create a `multi-currency-prepare` pipeline separate from `build-prepare`. Rejected: the steps must run in sequence with the existing build. A separate pipeline would require complex pipeline orchestration.

- **Runtime entitlement check.** Check entitlement at render time instead of build time. Rejected: the Werkstatt model is build-time. Derived prices are materialized at build time. The entitlement check must happen before materialization.

## Risks

- **Stripe configuration drift.** If the Stripe product is not configured with the correct `lookup_key`, the feature will not resolve. Mitigation: `entitlements.resolve` logs resolved features. The operator can verify `multi-currency` is present.

- **Pipeline step ordering.** The new steps must run after `entitlements.resolve` (line 49 in `build-prepare.ts`) and before `surface.generate` (line 52). Incorrect ordering would cause surface generation to miss derived prices.

- **Rate fetch service dependency.** `rate-snapshot.resolve` for `mode: "external"` depends on the Rate Fetcher Service (RFC-0744). If the service is not deployed, the command fails with a clear error. Mitigation: `business-fixed` mode works without external service. Sites can start with `business-fixed` and migrate to `external` after RFC-0744 is deployed.

- **Agent misinterpretation risk.** An agent might add `entitlement.module.validate` to `build-prepare` based on the original pipeline diagram. The corrected diagram and the note that it runs in `sites-check-author` prevent this.

- **False-positive rate.** The `gate.conditional.entitlement` mechanism is well-established (used by 3+ existing commands). No new false-positive risk is introduced.

## Acceptance criteria

- [ ] `multi-currency` in `ENTITLED_FEATURES` array
- [ ] `feature_multi_currency` in `STRIPE_FEATURE_LOOKUP_MAP`
- [ ] `rate-snapshot.resolve` command registered
- [ ] `currency-pricing.compile` command registered
- [ ] `derived-prices.materialize` command registered (from RFC-0740)
- [ ] `build-prepare` pipeline includes the 3 new steps in correct order (after `entitlements.resolve`, before `surface.generate`)
- [ ] `SITES_BUILD_PREPARE_DEV_PIPELINE` includes the 3 new steps
- [ ] Steps are skipped when `multi-currency` is not entitled (via `gate.conditional.entitlement`)
- [ ] `entitlement.module.validate` recognizes `multi-currency` (no code change — existing validator reads `ENTITLED_FEATURES` catalog)
- [ ] No route registry changes (offering pages read derived prices from generated file)
- [ ] `tsc --noEmit` passes
- [ ] `vitest run` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The `multi-currency` feature follows the same `gate.conditional.entitlement` pattern as `pseo` commands in `09b-build-artifacts-part2.ts`.
- Use the declarative `gate.conditional.entitlement` mechanism on each `CheckCommandEntry` — do NOT add imperative `readEntitledFeatures()` calls inside command handlers.
- `entitlement.module.validate` does NOT need code changes — it already reads `entitlement` from `surface.modules` and checks against `ENTITLED_FEATURES`.
- `entitlements.resolve` does NOT need code changes — adding `"multi-currency"` to `ENTITLED_FEATURES` and `STRIPE_FEATURE_LOOKUP_MAP` is sufficient.
- The Stripe `lookup_key` must be `feature_multi_currency`. This is configured in Stripe admin, not in code.
- `rate-snapshot.resolve` for `business-fixed` mode reads RateSchedule entries (no network). For `external` mode, it depends on RFC-0744 service.
- `currency-pricing.compile` validates the CurrencyPricingPolicy structure (target currencies registered, ratePolicyRefs resolve, derivationContractRefs resolve, currentUses valid). RFC-0740's compiler validation rules (section 4, rules 1-24) are enforced during `derived-prices.materialize` — do not duplicate them in `currency-pricing.compile`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
