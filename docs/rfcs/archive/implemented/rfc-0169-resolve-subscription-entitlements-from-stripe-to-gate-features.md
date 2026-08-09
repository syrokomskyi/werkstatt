---
id: RFC-0169
title: "Resolve subscription entitlements from Stripe to gate features"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-06
updatedAt: 2026-06-06
implementedAt: 2026-06-06
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0018
  - RFC-0143
  - RFC-0161
  - RFC-0167
  - RFC-0168
commands:
  proposed:
    - entitlements.resolve
    - entitlements.validate
  added:
    - entitlements.resolve
    - entitlements.validate
  changed:
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/share
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-content
successSignals:
  - "A site compiles exactly the feature modules its active Stripe subscription entitles, resolved at build time, with no hand-edited flag drift."
  - "Pipedrive stays the CRM/sales source of truth; Stripe Entitlements is the single source of truth for what is paid."
  - "Disabling a subscription removes the gated module from the next build without code changes."
nonGoals:
  - "Do not build a custom billing or entitlements datastore — Stripe Entitlements is the source of truth."
  - "Do not move Pipedrive into the entitlement path — it remains CRM only."
---

# RFC-0169: Resolve subscription entitlements from Stripe to gate features

## Context

The studio sells features per site by subscription (Blog RFC-0167; channel/CRM integrations RFC-0168; analytics RFC-0170). It needs a reliable, off-the-shelf way to turn "what the client paid for" into "what is built into the site," while keeping clients in Pipedrive as the CRM.

Two systems are in play, with distinct jobs. **Pipedrive** is a CRM (pre-sale: deals, contacts, pipeline); it has no concept of "active subscription → unlocked features." **Stripe Entitlements** (GA 2024: `Product → Feature → Entitlement`, `GET /v1/entitlements`) is purpose-built for exactly that and is also the billing system. Building entitlements on Pipedrive would mean writing a custom billing layer on a tool not designed for it.

The platform already has the consuming concepts: the RFC-0018 feature graph and RFC-0161 (growth/passport are "features," not DNA). What is missing is the **source layer** that decides which features are on.

## Problem

- There is no machine source of truth for "what this site is entitled to," so module inclusion would rely on hand-edited flags that drift from billing.
- Pipedrive cannot answer the entitlement question; using it for that would be custom and fragile.
- Static SSG means entitlement must be resolved at build time into the compiled output, with a runtime re-check for dynamic endpoints.

## Decision

Stripe Entitlements is adopted as the single source of truth for paid features. Each app records a `stripeCustomerId` in `system.md`. A build-time command `entitlements.resolve` calls the Stripe Entitlements API for that customer and writes a resolved, content-driven feature set (`entitlements.generated`) that gates which modules compile into the static site. Pipedrive remains the CRM; the deal-won → Stripe-subscription bridge uses Stripe's/Pipedrive's off-the-shelf integration, not custom code. Runtime endpoints (RFC-0168 channels/CRM) re-check the resolved entitlement at request time. `entitlements.validate` enforces that every gated module maps to a known feature and joins `apps-check.run`.

## Architectural fit

- **RFC-0161:** "feature" is already a blessed governance category; this RFC supplies the authoritative source that flips features on/off.
- **RFC-0018 feature graph:** resolved entitlements feed the existing per-app feature visibility, not a parallel mechanism.
- **RFC-0143 Generator Contract:** `entitlements.resolve` is content-driven (keyed by `system.md stripeCustomerId`), single-owner, and idempotent for a given Stripe state; the resolved file carries the `GENERATED` marker.
- **RFC-0167/0168/0170:** Blog, Integrations, and Analytics are the first gated modules.

## Design

### CLI surface

```sh
pnpm exec werkstatt run entitlements.resolve --app warpgogol-com
pnpm exec werkstatt run entitlements.validate --all --json
```

### TypeScript contracts

```ts
// Closed feature catalog (packages/ontology)
export type EntitledFeature =
  | "blog"
  | "integrations.channels"
  | "integrations.crm"
  | "analytics";

export interface ResolvedEntitlements {
  customerId: string;
  features: EntitledFeature[];
  resolvedAt: string;        // ISO; provenance
  source: "stripe" | "override";
}

// system.md
//   billing: { stripeCustomerId: "cus_…" }
//   # optional offline override for dev/CI:
//   entitlementsOverride: ["blog"]
```

`entitlements.resolve` reads `STRIPE_SECRET_KEY` from server env, calls the Entitlements API, maps Stripe Feature lookup keys → `EntitledFeature`, and writes `src/content/entitlements.generated.json` (or a typed module). An offline `entitlementsOverride` (or `null` source) keeps dev/CI deterministic without network access.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/src/content/system.md` | `billing.stripeCustomerId` (+ optional override) |
| `packages/ontology/entitlements/*` | Closed `EntitledFeature` catalog + Stripe lookup-key map |
| `packages/os/site-kernel-content/**` | `entitlements.resolve` — Stripe call → resolved file |
| `apps/*/src/content/entitlements.generated.json` | Generated resolved entitlements (GENERATED marker) |
| `packages/share/src/entitlement.ts` | `isEntitled(feature)` reader used by build gates + runtime endpoints |
| `packages/os/site-kernel-checks/src/entitlements.ts` | `entitlements.validate` |

### Output format

```json
{
  "command": "entitlements.resolve",
  "status": "ok",
  "customerId": "cus_123",
  "features": ["blog", "integrations.channels"],
  "source": "stripe"
}
```

### Failure modes

`entitlements.resolve` fails the build if `stripeCustomerId` is set but the API call errors with no usable cached/override result (fail-closed: an unresolved paid feature must not silently ship). With no `stripeCustomerId` and no override, it resolves to an empty feature set (all gated modules off). `entitlements.validate` fails if a gated module references a feature outside the catalog, or if a compiled module is present without a matching entitlement.

## Rollout

- `entitlements.resolve` registers early in `APPS_BUILD_PREPARE_PIPELINE`, before module-gating generators (blog routes, integration env schema).
- Dev/CI use `entitlementsOverride` so builds are deterministic and offline.
- Stripe Features are created to mirror the `EntitledFeature` catalog; Pipedrive deals are linked to Stripe customers via the existing integration.
- Runtime endpoints call `isEntitled()` (cached) so a lapsed subscription stops serving a gated endpoint without a redeploy.

## Alternatives considered

- **Pipedrive as entitlement source:** rejected — it is a CRM, not a billing/entitlements system; would require a custom layer (the thing we are avoiding).
- **Custom entitlements datastore:** rejected — duplicates Stripe Entitlements; more code, more drift, no benefit.
- **Runtime-only gating (no build-time resolve):** rejected — static SSG cannot conditionally include routes/modules at request time; build-time resolution is required, with runtime re-check as the complement.

## Risks

- **Build depends on Stripe availability:** mitigated by a short-TTL cached resolution + the offline override; fail-closed on truly unresolved paid features.
- **Stripe/Pipedrive sync gap:** the deal-won → subscription bridge is off-the-shelf; a missing link surfaces as "no entitlement," which `entitlements.validate` makes visible.
- **Feature catalog drift:** the closed `EntitledFeature` enum + lookup-key map keep Stripe and code aligned; validated.
- **Secrets:** `STRIPE_SECRET_KEY` is server-only (build env / GitHub secrets); never committed or exposed to the client.

## Acceptance criteria

- [x] `EntitledFeature` catalog + Stripe lookup-key map defined in ontology (evidence: implemented historically)
- [x] `system.md billing.stripeCustomerId` (+ optional override) supported (evidence: implemented historically)
- [x] `entitlements.resolve` writes a GENERATED resolved feature set (fail-closed on unresolved paid features) (evidence: implemented historically)
- [x] `isEntitled()` reader implemented <!-- gating *consumption* (blog/integrations routes/endpoints) lands with RFC-0167 pt2 / RFC-0168 pt2 --> (evidence: implemented historically)
- [x] `entitlements.validate` registered and in `apps-check.run` (evidence: implemented historically)
- [x] Dev/CI deterministic via `entitlementsOverride` (evidence: implemented historically)
- [x] Pipedrive remains CRM-only; no entitlement logic on Pipedrive (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Stripe Entitlements is the ONLY source of truth for paid features; do not add a custom entitlements store, and do not read entitlements from Pipedrive.
- Build-time resolution must fail-closed: never ship a gated paid module when a configured customer's entitlement could not be resolved.
- `STRIPE_SECRET_KEY` is server-only; never expose it to the client or commit it.
- Gated modules MUST compile to nothing when not entitled, without breaking the build.
- Agents MUST NOT weaken `entitlements.validate` without a superseding RFC.
