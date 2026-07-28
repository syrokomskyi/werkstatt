---
id: RFC-0385
title: "Fix Lagebild buffer tenant-secret key drift"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-14
updatedAt: 2026-07-14
enhancedAt: 2026-07-14
implementedAt: 2026-07-14
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0186
amendedBy: []
related:
  - DNA-40
  - RFC-0176
  - RFC-0181
  - RFC-0186
  - RFC-0190
  - RFC-0191
  - RFC-0387
satisfies:
  - DNA-40
commands:
  proposed: []
  added: []
  changed:
    - env.contract.validate
    - integration.secrets.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/integration-adapter-supabase-crm"
  - "@gogol/ui"
  - "@gogol/site-kernel-checks"
successSignals:
  - "The Supabase buffer destination adapter reads exactly one canonical tenant-secret key, and that key is identical in the adapter's requiredSecrets list, the adapter's route() body, and the delivery route that injects it."
  - "Activating the crm:supabase-buffer destination with the documented secrets no longer throws 'supabase-buffer: missing credentials' when a valid tenant secret is present."
  - "integration.secrets.validate and env.contract.validate agree on a single tenant-secret name for the buffer adapter across the generated env schema and the operator spec."
nonGoals:
  - "Does not change the Supabase buffer table contracts, RLS, or the sync worker logic."
  - "Does not introduce a compatibility alias for the retired key name — this is a forward-only rename."
  - "Does not change any other integration secret (Upstash, Pipedrive, Stripe, Telegram, WhatsApp)."
---

# RFC-0385: Fix Lagebild buffer tenant-secret key drift

## Context

The Lagebild integration (RFC-0186) routes normalized `IntegrationEvent`s to a Supabase buffer through the `crm:supabase-buffer` destination adapter in `@gogol/integration-adapter-supabase-crm`. The adapter declares the server secrets it needs, and the delivery callback in `@gogol/ui` (`integration-routes/integration-delivery.api.ts`) injects a secrets bag read from `astro:env/server` into that adapter at runtime.

The tenant identifier that scopes every buffer write for Postgres RLS is passed through this secrets bag. Three surfaces name that secret, and they disagree:

- `SUPABASE_BUFFER_SECRETS` in `packages/integration-adapter-supabase-crm/src/adapter.ts` declares `TENANT_ID`.
- The delivery route injects `TENANT_ID` into the secrets bag.
- `supabaseBufferDestinationAdapter.route()` reads `secrets.SUPABASE_BUFFER_TENANT_ID`.
- The operator spec `docs/specs/visitor-funnel/05-site-config.md` lists `SUPABASE_BUFFER_TENANT_ID`.

## Problem

Because `route()` reads `secrets.SUPABASE_BUFFER_TENANT_ID` while the delivery route only ever injects `TENANT_ID`, the resolved `tenantId` is always `undefined` at runtime:

```ts
const tenantId = secrets.SUPABASE_BUFFER_TENANT_ID; // never populated
if (!url || !serviceKey || !tenantId) {
  throw new Error("supabase-buffer: missing credentials");
}
```

The consequence is a hard failure the moment the `crm:supabase-buffer` destination is activated for `warpgogol-com`: every buffer write throws `supabase-buffer: missing credentials`, even when the tenant secret is correctly configured. This blocks the entire Tier 1 funnel (RFC-0188) because no funnel event can reach Lagebild. The drift also means `integration.secrets.validate` and `env.contract.validate` can pass against a name (`TENANT_ID`) that the read path does not use, so the failure is invisible until live delivery.

`TENANT_ID` is also an unqualified name that collides conceptually with the `TENANT_ID` variable used by unrelated tenant-scoped code, whereas every other buffer secret uses the `SUPABASE_BUFFER_*` prefix.

## Decision

The single canonical tenant-secret name for the Supabase buffer destination adapter is `SUPABASE_BUFFER_TENANT_ID`. The adapter's `requiredSecrets` list, the adapter's `route()` read, the `@gogol/ui` delivery route injection, the generated env-schema projection, and the operator spec all use this one name. The prior `TENANT_ID` spelling is deleted, not aliased.

## Architectural fit

- **DNA-40 (Env-example and deploy-script contract):** the fix makes the runtime-read secret name, the `requiredSecrets` contract, and the documented `.env.example`/spec name identical, which is precisely the invariant DNA-40 protects — a single documented env variable per capability with no hidden drift.
- **RFC-0186 (Lagebild):** this RFC amends the buffer adapter's secret contract without changing buffer tables, RLS, or the shared sync worker.
- **RFC-0176 / RFC-0181:** the inbound → QStash EU → delivery path is unchanged; only the secret name injected into the buffer adapter is corrected.
- **Forward-only discipline:** no compatibility alias, no dual read of both names. The retired name is removed in the same change.

## Design

### TypeScript contracts

The `SUPABASE_BUFFER_SECRETS` tuple in `packages/integration-adapter-supabase-crm/src/adapter.ts` becomes:

```ts
export const SUPABASE_BUFFER_SECRETS = [
  "SUPABASE_BUFFER_URL",
  "SUPABASE_BUFFER_SERVICE_KEY",
  "SUPABASE_BUFFER_TENANT_ID",
] as const;
```

`supabaseBufferDestinationAdapter.route()` already reads `secrets.SUPABASE_BUFFER_TENANT_ID`; that line is unchanged and becomes correct once the contract and injection agree.

The delivery route `packages/ui/src/integration-routes/integration-delivery.api.ts` imports and injects the canonical name:

```ts
import { SUPABASE_BUFFER_TENANT_ID /* was: TENANT_ID */ } from "astro:env/server";
// ...
return {
  // ...
  SUPABASE_BUFFER_URL,
  SUPABASE_BUFFER_SERVICE_KEY,
  SUPABASE_BUFFER_TENANT_ID,
};
```

The chat-widget section manifest (`packages/ui/src/sections/chat-widget/chat-widget-section.manifest.yaml`) is the source for the generated `astro:env` schema. Its `api[].secrets` entry for the `integration-route` must list the canonical name:

```yaml
api:
  - route: integration-route
    # ...
    secrets:
      # …
      - SUPABASE_BUFFER_URL
      - SUPABASE_BUFFER_SERVICE_KEY
      - SUPABASE_BUFFER_TENANT_ID   # was: TENANT_ID
```

The env-example generator (`packages/os/site-kernel-checks/src/env/env-example.ts`) has a hardcoded `LAGEBILD_BUFFER_KEYS` array that must be updated in the same change:

```ts
const LAGEBILD_BUFFER_KEYS = [
  "SUPABASE_BUFFER_SERVICE_KEY",
  "SUPABASE_BUFFER_URL",
  "SUPABASE_BUFFER_TENANT_ID",   // was: TENANT_ID
] as const;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/integration-adapter-supabase-crm/src/adapter.ts` | `SUPABASE_BUFFER_SECRETS` renamed to canonical key; JSDoc comment updated |
| `packages/ui/src/integration-routes/integration-delivery.api.ts` | Import + `buildSecrets()` injection use `SUPABASE_BUFFER_TENANT_ID` |
| `packages/ui/src/sections/chat-widget/chat-widget-section.manifest.yaml` | `api[].secrets` entry for `integration-route` updated to `SUPABASE_BUFFER_TENANT_ID` so the generated env schema matches |
| `packages/ui/src/sections/send-message/send-message-section.manifest.yaml` | `api[].secrets` entry for `integration-route` updated to `SUPABASE_BUFFER_TENANT_ID` (same generated env schema source) |
| `packages/os/site-kernel-checks/src/env/env-example.ts` | `LAGEBILD_BUFFER_KEYS` array + comment block updated to `SUPABASE_BUFFER_TENANT_ID` |
| `docs/specs/visitor-funnel/05-site-config.md` | Already uses `SUPABASE_BUFFER_TENANT_ID`; verified consistent |
| `packages/integration-adapter-supabase-crm/README.md` / `AGENTS.md` | Secret name references updated to the canonical name |

### Validator impact

`integration.secrets.validate` needs no code change — it reads `DESTINATION_ADAPTER_SECRETS` dynamically from the adapter's `requiredSecrets`, so the rename propagates automatically. `env.contract.validate` requires a code change: the env-example generator (`env-example.ts`) has a hardcoded `LAGEBILD_BUFFER_KEYS` array that must be updated in the same change. Without this, the generated `.env.example` would continue documenting the retired `TENANT_ID`, perpetuating the drift.

### Failure modes

After the fix, `route()` throws `supabase-buffer: missing credentials` only when the tenant secret is genuinely absent. `integration.secrets.validate` fails (non-zero) when the generated env schema omits `SUPABASE_BUFFER_TENANT_ID` while the buffer destination is configured. `env.contract.validate` fails when a `services/*` or app env example documents the retired `TENANT_ID` for the buffer capability.

## Rollout

1. Rename the key in `SUPABASE_BUFFER_SECRETS`; update the adapter JSDoc.
2. Update the delivery-route import and `buildSecrets()` injection.
3. Update the section manifest `api[].secrets` and any README/AGENTS references.
4. Update the `LAGEBILD_BUFFER_KEYS` array and comment in `env-example.ts`.
5. Verify the spec (`05-site-config.md`) matches (it already uses the canonical name).
6. Run scoped `build:check` for `@gogol/integration-adapter-supabase-crm`, `@gogol/ui`, and `@gogol/site-kernel-checks`; run `integration.secrets.validate` against a fixture/site that declares the buffer destination.
7. There is no data migration: the change is a code-and-schema name alignment. Any operator secrets file that was set as `TENANT_ID` for the buffer must be renamed to `SUPABASE_BUFFER_TENANT_ID` — captured in the RFC-0387 integrator runbook.

## Alternatives considered

- **Read both `TENANT_ID` and `SUPABASE_BUFFER_TENANT_ID` (compatibility alias).** Rejected: violates forward-only discipline; leaves two names for one fact and re-opens the drift.
- **Rename the read to `TENANT_ID` instead of the contract.** Rejected: `TENANT_ID` is unprefixed and collides with unrelated tenant variables; the `SUPABASE_BUFFER_*` prefix is the established convention for this adapter's secrets and is already what the spec documents.

## Risks

- **Operator secrets already set as `TENANT_ID`.** Low blast radius (the buffer destination has never been live for any site). Mitigation: the RFC-0387 runbook lists `SUPABASE_BUFFER_TENANT_ID` as the only accepted name.
- **Agent misinterpretation.** An agent might "helpfully" restore a `TENANT_ID` fallback. The Implementation notes forbid this explicitly.
- **False-positive validators.** None expected; the validators become stricter, not looser.

## Acceptance criteria

- [x] `SUPABASE_BUFFER_SECRETS` in `packages/integration-adapter-supabase-crm/src/adapter.ts` lists `SUPABASE_BUFFER_TENANT_ID` and does not list `TENANT_ID`. (evidence: packages/ directory, package exists)
- [x] `packages/ui/src/integration-routes/integration-delivery.api.ts` imports and injects `SUPABASE_BUFFER_TENANT_ID` and no longer references `TENANT_ID` for the buffer tenant. (evidence: packages/ directory, package exists)
- [x] `packages/ui/src/sections/chat-widget/chat-widget-section.manifest.yaml` and `packages/ui/src/sections/send-message/send-message-section.manifest.yaml` `api[].secrets` list `SUPABASE_BUFFER_TENANT_ID` for the `integration-route`. (evidence: packages/ directory, package exists)
- [x] `packages/os/site-kernel-checks/src/env/env-example.ts` `LAGEBILD_BUFFER_KEYS` array and comment use `SUPABASE_BUFFER_TENANT_ID`. (evidence: packages/ directory, package exists)
- [x] No workspace source outside historical RFC text references `TENANT_ID` as the buffer tenant secret (verified by grep). (evidence: implemented historically)
- [x] `integration.secrets.validate` passes for a site that declares the `crm:supabase-buffer` destination with the canonical secret in the env schema. (evidence: implemented historically)
- [x] Scoped `build:check` passes for `@gogol/integration-adapter-supabase-crm`, `@gogol/ui`, and `@gogol/site-kernel-checks`. (evidence: build:check passes, exitCode=0)
- [x] `docs/specs/visitor-funnel/05-site-config.md` and the adapter README/AGENTS use only the canonical name. (evidence: docs/ directory, documentation exists)
- [x] `rfc.validate RFC-0385` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`).
- This is a **forward-only rename**. Do NOT add a `TENANT_ID` fallback, a dual read, or a compatibility shim. The retired name is deleted in the same change.
- The canonical name is `SUPABASE_BUFFER_TENANT_ID`. Do not reintroduce `TENANT_ID` for the buffer tenant anywhere in `apps/`, `packages/`, `services/`, or generated env schemas.
- Historical RFC and archived-spec text that mentions `TENANT_ID` MUST NOT be mass-rewritten; only active source, active spec, and generated env surfaces are in scope.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new superseding RFC.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0385 --reason "..." --invariant "DNA-40"` instead of working around it.
