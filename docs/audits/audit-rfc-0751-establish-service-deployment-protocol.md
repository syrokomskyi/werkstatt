---
rfcId: RFC-0751
auditId: AUDIT-RFC-0751-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0751

## Verdict: Needs revision

The RFC establishes a needed protocol but has internal contradictions in the naming convention, a `kind` enum that doesn't match existing `service.config.yaml` values, a forward-only violation (keeping per-service deploy scripts as fallback), and missing `packagesImpacted` entries. The naming convention section claims `id = workerName = directory name`, but proposes Worker names (`rate-fetcher`, `lagebild-sync`) that don't match directory names (`rate-fetcher-worker`, `lagebild-sync-worker`).

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0751` reports zero violations.

## Axis A — Structural completeness

- **Decision** is present-tense and clear: "The platform gains a service deployment protocol." ✓
- **CLI surface** shows exact commands with flags. ✓
- **TypeScript contracts** are minimal signatures. ✓ But `kind` enum is incomplete (see Axis C).
- **File system responsibilities** table names concrete paths. ✓
- **Output format** documents the `--json` shape. ✓
- **Failure modes** specifies exit codes and warn-vs-fail behavior. ✓
- **Rollout** describes default behavior and existing-service adoption. ✓ But claims `matomo-proxy` needs renaming from `warpgogol-matomo-proxy` when `wrangler.jsonc` already has `"name": "matomo-proxy"` — no rename needed.
- **Alternatives considered** has 5 real alternatives with rejection reasons. ✓
- **Risks** includes agent misinterpretation risk and false-positive rate. ✓ But mentions "configurable health check paths" without specifying where the path is configured — `ServiceRegistryEntry` has no `healthCheckPath` field.
- **Acceptance criteria** are checkable. ✓
- **Implementation notes** are explicit behavioral rules. ✓

## Axis B — DNA alignment

- `satisfies: [DNA-40]` — the RFC extends DNA-40 (env-example and deploy-script contract) with a centralized leitstand command and registry. The body explains how: `deploy.preflight` runs before `wrangler deploy`, and the registry tracks deployment state. ✓
- No new DNA invariant is established by this RFC. ✓
- No conflict with existing DNA invariants. ✓

## Axis C — Ecosystem fit

- **`kind` enum mismatch**: `ServiceRegistryEntry.kind` allows `"proxy-worker" | "cron-worker" | "api-worker"`, but existing `service.config.yaml` files use `scheduled-worker` (rate-fetcher-worker, cf-analytics-poller, fleet-probe-runner, lagebild-sync-worker), `node-runner` (check-warpgogol-runner), and `compose-stack` (observability-stack). The RFC's `cron-worker` doesn't match the existing `scheduled-worker`. The enum must include all existing kinds or the RFC must declare which kinds are in scope.
- **Non-Worker services in registry**: The rollout says all 8 services are registered, but `observability-stack` (`kind: compose-stack`) and `check-warpgogol-runner` (`kind: node-runner`) are not Cloudflare Workers — they don't have `wrangler.jsonc`. `service.naming.validate` checks `wrangler.jsonc` `name` — it would fail for these. The RFC must either exclude non-Worker services from the registry or make the `wrangler.jsonc` check conditional on `kind`.
- **Package boundary — `services.check.run` location**: The RFC says `service.naming.validate` is "Integrated into `services.check.run`" and lists `@warpgogol/site-kernel-checks` in `packagesImpacted`. But `services.check.run` is registered in `packages/os/site-kernel-check-warpgogol/src/commands/services-check.ts` (per `kernel-flags-lint.ts:152`). `@warpgogol/site-kernel-check-warpgogol` is missing from `packagesImpacted`.
- **Naming convention contradiction**: The RFC states `id = workerName = directory name`, but proposes renaming `gogol-rate-fetcher` → `rate-fetcher` while the directory is `rate-fetcher-worker`. If `id = directory name = rate-fetcher-worker`, then `workerName` must be `rate-fetcher-worker`, not `rate-fetcher`. Same for `gogol-lagebild-sync` → `lagebild-sync` vs directory `lagebild-sync-worker`. Either the directories must be renamed or the Worker names must include the `-worker` suffix.
- **`matomo-proxy` already bare**: The RFC says `warpgogol-matomo-proxy` → `matomo-proxy`, but `services/matomo-proxy/wrangler.jsonc:3` already has `"name": "matomo-proxy"`. No rename is needed. The RFC should state the current state accurately.
- **Registry schema impact**: Adding a `services:` top-level key to `systems/registry.yaml` changes the file's schema. The RFC doesn't mention whether `sternsystem.validate` or existing registry readers need to handle the new key. If `sternsystem.validate` rejects unknown top-level keys, it will fail.
- **Adapter reuse unclear**: The existing `cloudflare-workers.ts` adapter expects a `distPath` (built output) and passes `--config wrangler.json`. Services don't produce `dist/` — `wrangler deploy` handles the build internally. Services use `wrangler.jsonc` (not `wrangler.json`). The RFC doesn't clarify whether `leitstand.service.deploy` reuses the existing adapter or has its own wrangler invocation path.

## Axis D — Forward-only compliance

- **Per-service deploy scripts kept as fallback**: The rollout states "Existing per-service `deploy` scripts remain as a fallback — they are not removed. `leitstand.service.deploy` is the preferred entry point." This is a dual-path — the ecosystem is forward-only: legacy code paths are deleted, not maintained alongside the new one. The per-service `deploy` scripts should be removed or replaced with a thin proxy that calls `leitstand.service.deploy`.

## Axis E — Agent-facing policy

- **Status gate**: The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language. ✓
- **Implementation notes** reference RFC-0224 for the accepted→implemented transition. ✓
- **Anti-fabrication**: Acceptance criteria are code/infrastructure checks, not content authoring. ✓
- **Storage policy**: No cookies or client-side persistence. ✓
- **NEEDS CLARIFICATION markers**: None found. ✓

## Axis F — Pragmatism

- **Minimal command surface**: Three commands (`leitstand.service.deploy`, `service.registry.validate`, `service.naming.validate`) each serve a distinct purpose. `service.naming.validate` could be a flag on `service.registry.validate`, but separating naming consistency is justified because it's integrated into `services.check.run` while registry validation is a deploy-time gate. ✓
- **Lean contracts**: `ServiceRegistryEntry` has `routes?` and `upstreams?` as optional — reasonable. `lastDeployed` is always present with null defaults. ✓
- **Existing patterns**: The RFC builds on the existing `deploy.preflight` gate and leitstand pattern. ✓ But doesn't clarify adapter reuse (see Axis C).
- **Scope discipline**: `packagesImpacted` lists `@warpgogol/site-kernel-handoff`, `@warpgogol/site-kernel-checks`, `@warpgogol/ontology`. Missing `@warpgogol/site-kernel-check-warpgogol` (where `services.check.run` lives). `@warpgogol/ontology` is listed but the RFC doesn't explain what changes in ontology — no ontology files are mentioned in the design.

## Axis G — Blind spots

- **Health check path configurability**: Risks section mentions "allowing configurable health check paths" but `ServiceRegistryEntry` has no `healthCheckPath` field. The design says "fetch the `workersDevUrl` and expect HTTP 200 (or any non-5xx response)" — no configurable path. The risk mitigation is unimplemented in the contract.
- **Concurrent deploys**: The RFC doesn't consider two simultaneous `leitstand.service.deploy --service <id>` invocations. Both would read the registry, deploy, and write `lastDeployed` — the last writer wins, potentially recording a stale state. A lock or compare-and-swap mechanism is not mentioned.
- **Registry write atomicity**: Step 7 ("Record state — update `lastDeployed` in the registry") writes to `systems/registry.yaml`. If the write is interrupted (crash mid-write), the registry could be corrupted. The RFC doesn't mention atomic write (staging + rename) or a backup mechanism.
- **Non-Cloudflare-Worker services**: `observability-stack` (`kind: compose-stack`) and `check-warpgogol-runner` (`kind: node-runner`) are in the rollout list but are not Cloudflare Workers. `leitstand.service.deploy` calls `wrangler deploy` — it would fail for these. The RFC must either exclude them or document how non-Worker services are handled.
- **`workersDevUrl` template**: The registry entry has `workersDevUrl: https://matomo-proxy.<account>.workers.dev` with `<account>` as a placeholder. The RFC doesn't specify how the account subdomain is resolved — is it from `wrangler deploy` output? From an env var? Hardcoded in the registry?

## Questions for the author

1. The naming convention says `id = workerName = directory name`, but proposes `rate-fetcher` as the Worker name while the directory is `rate-fetcher-worker`. Will the directories be renamed to `rate-fetcher/` and `lagebild-sync/`, or will the Worker names keep the `-worker` suffix as `rate-fetcher-worker` and `lagebild-sync-worker`?
2. The `kind` enum (`"proxy-worker" | "cron-worker" | "api-worker"`) doesn't include `scheduled-worker`, `node-runner`, or `compose-stack` — the kinds used by 6 of 8 existing services. Will the enum be extended, or will non-matching services be excluded from the registry?
3. `leitstand.service.deploy` calls `wrangler deploy`, but `observability-stack` and `check-warpgogol-runner` are not Cloudflare Workers. Should they be excluded from the registry, or does the deploy command skip non-Worker services?
