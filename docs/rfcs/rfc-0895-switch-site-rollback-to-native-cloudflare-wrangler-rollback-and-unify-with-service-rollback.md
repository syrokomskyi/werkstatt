---
id: RFC-0895
title: "Switch site rollback to native Cloudflare wrangler rollback and unify with service rollback"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-20
updatedAt: 2026-08-20
enhancedAt: 2026-08-20
implementedAt:
closedAt:
supersedes:
  - RFC-0865
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-49
  - DNA-52
  - DNA-73
  - RFC-0806
  - RFC-0865
  - RFC-0851
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-49
  - DNA-52
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - leitstand.rollback
  removed:
    - leitstand.service.rollback
    - release.rollback
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "`leitstand.rollback --site warpgogol-com --channel main` rolls back to the previous Cloudflare Worker version via `wrangler rollback` without requiring a local release artifact."
  - "`leitstand.rollback --service cf-analytics-poller` rolls back a service Worker to its previous deployment via the same command."
  - "`leitstand.rollback --site warpgogol-com --channel dev` rolls back a dev-channel deployment."
  - "No `--gate-decision` flag is required for rollback — the target version already passed certification when it was deployed."
nonGoals:
  - Fleet-level rollback (rolling back thousands of sites in one command) is deferred to a separate RFC.
  - Rollback to a specific Cloudflare Worker version ID (not just the previous version) is not supported — `wrangler rollback` without arguments is sufficient for the emergency rollback use case.
  - Rollback of non-Cloudflare deployment adapters is not changed.
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0895: Switch site rollback to native Cloudflare wrangler rollback and unify with service rollback

## Context

The Werkstatt platform manages deployments for potentially thousands of Sternsystem sites on Cloudflare Workers. Cloudflare natively supports rolling back to any of the 100 most recently published Worker versions via `wrangler rollback` — no local artifacts are needed because Cloudflare stores version history server-side.

The platform already has rollback infrastructure, but it is split across three commands with inconsistent approaches:

1. **`leitstand.service.rollback`** (`packages/werkstatt/src/leitstand/service-rollback.ts`) — for `services/*` Workers. Correctly uses native `wrangler rollback` via `runWranglerRollback` (`packages/werkstatt/src/leitstand/service-deploy-helpers.ts:114`). No local artifact needed.

2. **`leitstand.rollback`** (`packages/werkstatt/src/leitstand/leitstand-commands.ts:1276`) — for site Sternsystemen. Does **not** use `wrangler rollback`. Instead, the Cloudflare adapter's `rollback()` method (`packages/werkstatt/src/leitstand/adapters/cloudflare-workers.ts:284`) re-deploys from a local `dist/` directory of a previous release via `wrangler deploy`. This requires the old release artifact to exist on disk at `releases/<releaseId>/dist/` and requires a `--gate-decision` flag from the certification authority.

3. **`release.rollback`** (`packages/werkstatt/src/release/release-commands.ts:926`) — only writes a deployment effect record. Does not call any Cloudflare API. Pure bookkeeping.

The operator needs to roll back deployments across thousands of sites. The current site rollback approach (re-deploy from local artifact) does not scale: it requires keeping old `dist/` directories on disk for every release, re-deploys rather than using Cloudflare's version history, and requires a certification gate decision for an emergency operation.

## Problem

1. **Site rollback does not use Cloudflare's native rollback.** The `cloudflare-workers` adapter's `rollback()` method (`packages/werkstatt/src/leitstand/adapters/cloudflare-workers.ts:284`) calls `runWranglerDeployWithRetry` with `wrangler deploy` arguments — a re-deployment of a local artifact, not a true `wrangler rollback`. This is slower, more fragile, and requires the old release `dist/` to exist on disk.

2. **Rollback requires a certification gate decision.** DNA-49 currently mandates `evaluateRollback()` for all deployment commands including `leitstand.rollback`. But rollback targets a version that already passed certification when it was deployed — re-certifying an already-certified version for an emergency rollback is unnecessary friction.

3. **Two separate rollback commands for sites and services.** `leitstand.rollback` (sites) and `leitstand.service.rollback` (services) do the same conceptual operation but via different code paths. The service command already uses `wrangler rollback` correctly; the site command does not.

4. **`release.rollback` is dead weight.** It only writes an effect record without performing any actual Cloudflare rollback. With native `wrangler rollback` in `leitstand.rollback`, this command is redundant.

5. **`--to-release` flag is no longer meaningful.** With native `wrangler rollback` (no version ID argument), the rollback target is always the previous Cloudflare Worker version. The `--to-release` flag and the `RollbackInput.toReleaseId` field become unnecessary.

## Decision

The `leitstand.rollback` command is changed to use Cloudflare's native `wrangler rollback` (via `runWranglerRollback`) instead of re-deploying from a local release artifact. The command is unified to accept either `--site <id>` or `--service <id>`, replacing both the site-only `leitstand.rollback` and the service-only `leitstand.service.rollback`. The `--gate-decision` flag is removed from rollback — the target version already passed certification when it was deployed. The `--to-release` flag is removed. The `release.rollback` command is removed as redundant.

## Architectural fit

- **DNA-49 (Fleet propagation / Leitstand):** This RFC supersedes RFC-0865's connection of `leitstand.rollback` to the certification authority. The current `leitstand.rollback` already calls `evaluateRollbackRequest` with hardcoded degenerate values (`rollbackArtifactHash: ""`, `rollbackArtifactReadinessVerified: true`, `sharedOutageDetected: false`) — the `--gate-decision` flag is not even registered in the command flags (`leitstand.module.ts:227-231`). The call is already a formality, not a real certification gate. This RFC formally removes the `evaluateRollback()` call from `leitstand.rollback` and removes `release.rollback` entirely. The `evaluateRollback()` function remains available for other deployment commands (`leitstand.propagate`, `leitstand.promote`) that deploy new artifacts. DNA-49 is amended: rollback is no longer connected to the certification authority.
- **DNA-52 (Release artifact store):** This RFC amends DNA-52 by removing the rollback workflow from the artifact store resolution requirement. Site rollback no longer resolves artifacts from the store — `wrangler rollback` operates on Cloudflare's server-side version history, not local artifacts. The `RollbackInput.distPath` field is removed. Other workflows (release, deployment, Notausgang) continue to resolve artifacts through the store unchanged.
- **DNA-73 (Sequential deployment pipeline enforcement):** Not amended. Rollback is not a deployment pipeline step (Dev → Alt → Main). It is an emergency operation that restores a previous version on a specific channel. The `--all` flag remains rejected for rollback in this RFC — fleet-level rollback is a non-goal, deferred to a separate RFC.
- **RFC-0806 (Service deployment pipeline):** The `leitstand.service.rollback` command introduced by RFC-0806 is removed and unified into `leitstand.rollback --service <id>`.
- **RFC-0865 (CERT-007 deployment authority):** The `evaluateRollback()` function remains in the codebase for potential future use, but `leitstand.rollback` no longer calls it.
- **RFC-0851 (Deployment operations):** Deployment effect records are still written after rollback (recording the rollback event), but the `toReleaseId` field is no longer populated from a `--to-release` flag.

## Design

### CLI surface

```sh
# Roll back a site on the main channel (default)
pnpm exec werkstatt run leitstand.rollback --site warpgogol-com

# Roll back a site on a specific channel
pnpm exec werkstatt run leitstand.rollback --site warpgogol-com --channel dev
pnpm exec werkstatt run leitstand.rollback --site warpgogol-com --channel alt

# Roll back a service Worker
pnpm exec werkstatt run leitstand.rollback --service cf-analytics-poller

# JSON output
pnpm exec werkstatt run leitstand.rollback --site warpgogol-com --json
```

Flags:

- `--site <id>` (required if `--service` not given) — Sternsystem ID from `systems/registry.yaml`
- `--service <id>` (required if `--site` not given) — Service ID from `services/registry.yaml`
- `--channel <dev|alt|main>` (optional, default `main`) — Deployment channel. Only meaningful for sites; services have a single production Worker.
- `--json` — machine-readable output
- Exactly one of `--site` or `--service` must be provided.

Removed flags:

- `--gate-decision` — no longer required for rollback
- `--to-release` — no longer applicable (native rollback targets the previous version)

### TypeScript contracts

The `RollbackInput` interface is simplified — `distPath`, `url`, `secretsFilePath`, `nodeModulesBinPath`, and `toReleaseId` are removed. `workerName` is retained because `wrangler rollback` needs it to identify the Worker. The adapter's `rollback()` method no longer re-deploys; it calls `runWranglerRollback` directly.

```ts
// packages/werkstatt/src/leitstand/adapter.ts

export interface RollbackInput {
  systemId: string;
  channel: "dev" | "alt" | "main";
  // For sites: temp directory with minimal wrangler.json (name only)
  // For services: services/<id>/ directory with wrangler.jsonc
  wranglerConfigDir: string;
  workerName: string;
}

export interface RollbackResult {
  systemId: string;
  channel: "dev" | "alt" | "main";
  state: "succeeded" | "failed";
  workerName: string;
  startedAt: string;
  completedAt: string;
  stdout: string;
  stderr: string;
}
```

The `DeploymentAdapter` interface `rollback()` method signature changes from `Promise<PropagationResult>` to `Promise<RollbackResult>`.

**Site wrangler config resolution**: Sites don't have a persistent `wrangler.json` in the cache clone — the wrangler config is generated during build and lives in `releases/<id>/dist/server/wrangler.json`. For native `wrangler rollback`, a minimal `wrangler.json` with just `{"name": "<workerName>"}` is written to a temporary directory. The `workerName` is read from `system-config.yaml` at `deployment.channels.<channel>.workerName` (falling back to `systemId`). This is sufficient because `wrangler rollback` only needs the Worker name to identify which Cloudflare Worker to roll back — it does not need bindings, routes, or other config.

**Service wrangler config resolution**: Services have a persistent `wrangler.jsonc` at `services/<id>/wrangler.jsonc`. `wrangler rollback` runs directly in the service directory, same as the current `leitstand.service.rollback` implementation.

**Effect record compatibility**: The existing `LeitstandRollbackData` interface has `rolledBackFrom`, `rolledBackTo`, `deploymentUrl`, `purgeResult`, `releaseState`. The new shape simplifies this to `target`, `systemId`/`serviceId`, `channel`, `workerName`, `rollbackState`, `startedAt`, `completedAt`, `operationId`. The deployment effect record written to `systems-cache/{id}/deployment-operations/` preserves backward-compatible fields (`candidateId`, `state`, `channel`, `timestamp`) so `leitstand.status` continues to work without changes. `rolledBackTo` is no longer populated (native rollback doesn't expose the target version ID). `purgeResult` is preserved if cache purging is performed.

**Cache purging**: The current `runLeitstandRollback` performs CDN cache purging after rollback (`leitstand-commands.ts:1380-1389`). With native `wrangler rollback`, Cloudflare does not automatically purge the CDN cache. Cache purging logic is preserved for site rollbacks — after `wrangler rollback` succeeds, the command purges the CDN cache using the same `purgeCacheByUrls` helper, using the channel URL from `system-config.yaml` and any routes from the behavior snapshot of the most recent deployment. Service rollbacks do not purge cache (services use `*.workers.dev` URLs which are not CDN-cached).

The `runLeitstandRollback` command handler (`packages/werkstatt/src/leitstand/leitstand-commands.ts`) is restructured:

```ts
// Simplified command flow
export async function runLeitstandRollback(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<LeitstandRollbackData>> {
  const siteId = flagString(input, "site");
  const serviceId = flagString(input, "service");
  const channel = flagString(input, "channel") as "dev" | "alt" | "main" ?? "main";

  // Exactly one of --site or --service required
  if (!siteId && !serviceId) {
    throw new Error("[leitstand.rollback] --site or --service is required");
  }
  if (siteId && serviceId) {
    throw new Error("[leitstand.rollback] --site and --service are mutually exclusive");
  }

  if (siteId) {
    // 1. Read system-config.yaml → deployment.channels.<channel>.workerName
    // 2. Write minimal wrangler.json ({"name": "<workerName>"}) to temp dir
    // 3. Call runWranglerRollback with the temp dir
    // 4. Purge CDN cache for the channel URL
    // 5. Write deployment effect record (candidateId, state, channel, timestamp)
  } else {
    // 1. Read services/registry.yaml → serviceEntry.workerName
    // 2. Verify services/<id>/wrangler.jsonc exists
    // 3. Call runWranglerRollback with services/<id>/ directory
    // 4. Record rollback state in services/registry.yaml
  }

  // Return result
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/leitstand/adapters/cloudflare-workers.ts` | `rollback()` method rewritten to call `runWranglerRollback` instead of `runWranglerDeployWithRetry` |
| `packages/werkstatt/src/leitstand/adapter.ts` | `RollbackInput` simplified — `distPath`, `toReleaseId`, `url`, `secretsFilePath`, `nodeModulesBinPath` removed |
| `packages/werkstatt/src/leitstand/leitstand-commands.ts` | `runLeitstandRollback` rewritten — accepts `--site` or `--service`, no `--gate-decision`, no `--to-release` |
| `packages/werkstatt/src/leitstand/service-rollback.ts` | `runLeitstandServiceRollback` removed — logic merged into `runLeitstandRollback` |
| `packages/werkstatt/src/leitstand/service-deploy-helpers.ts` | `runWranglerRollback` reused as-is (already correct) |
| `packages/werkstatt/src/release/release-commands.ts` | `runReleaseRollback` removed |
| `packages/werkstatt/src/leitstand/deploy-helpers.ts` | `evaluateRollbackRequest` remains but is no longer called by `leitstand.rollback` |
| `packages/werkstatt/src/certification/deployment/authority.ts` | `evaluateRollback` remains but is no longer called by `leitstand.rollback` |
| `packages/werkstatt/src/leitstand/leitstand.module.ts` | Command registration updated — `leitstand.service.rollback` and `release.rollback` removed |

### Output format

```json
{
  "command": "leitstand.rollback",
  "data": {
    "command": "leitstand.rollback",
    "target": "site",
    "systemId": "warpgogol-com",
    "channel": "main",
    "workerName": "warpgogol-com",
    "rollbackState": "succeeded",
    "startedAt": "2026-08-20T18:00:00.000Z",
    "completedAt": "2026-08-20T18:00:05.000Z",
    "operationId": "op-2026-08-20-180000"
  },
  "exitCode": 0,
  "summary": "[leitstand.rollback] warpgogol-com: rolled back to previous deployment"
}
```

For a service rollback, `target` is `"service"` and `channel` is omitted.

For a failed rollback:

```json
{
  "command": "leitstand.rollback",
  "data": {
    "command": "leitstand.rollback",
    "target": "site",
    "systemId": "warpgogol-com",
    "channel": "main",
    "workerName": "warpgogol-com",
    "rollbackState": "failed",
    "startedAt": "2026-08-20T18:00:00.000Z",
    "completedAt": "2026-08-20T18:00:05.000Z",
    "operationId": "op-2026-08-20-180000"
  },
  "exitCode": 1,
  "summary": "[leitstand.rollback] warpgogol-com: wrangler rollback failed — <stderr tail>"
}
```

### Failure modes

- **`wrangler rollback` exits non-zero:** The command returns `exitCode: 1` with `rollbackState: "failed"`. The stderr tail (last 200 chars) is included in the summary. No partial state is written.
- **No previous version available:** If Cloudflare has no previous Worker version to roll back to (e.g., first deployment), `wrangler rollback` exits non-zero. The command reports this as a failed rollback.
- **Neither `--site` nor `--service` given:** Throws `[leitstand.rollback] --site or --service is required`.
- **Both `--site` and `--service` given:** Throws `[leitstand.rollback] --site and --service are mutually exclusive`.
- **Site or service not found in registry:** Throws with a clear error message indicating the ID was not found.
- **Site has no wrangler config:** Throws if the site's system-config.yaml does not resolve to a wrangler config directory.
- **Service has no `wrangler.jsonc`:** Throws if `services/<id>/wrangler.jsonc` does not exist — not a Cloudflare Worker service.
- **Lock acquisition failure:** For services, the command uses `acquireServiceLock` (same as `leitstand.service.rollback`). For sites, the command uses the existing `werkstatt.lock` primitive with the site's system ID as the lock key.
- **Temp directory cleanup:** The minimal `wrangler.json` written to a temp directory for site rollback is cleaned up in a `finally` block, even if `wrangler rollback` fails.

## Rollout

- **Default behavior:** The rewritten `leitstand.rollback` replaces the existing command in-place. There is no opt-in period — the command signature changes (removed `--gate-decision`, `--to-release`; added `--site`/`--service` duality).
- **Migration for existing callers:** Any script or agent invoking `leitstand.rollback --site <id> --to-release <releaseId> --gate-decision <path>` must drop `--to-release` and `--gate-decision`. The `--site` flag remains. The `--channel` flag defaults to `main`.
- **Migration for `leitstand.service.rollback` callers:** Replace `leitstand.service.rollback --service <id>` with `leitstand.rollback --service <id>`.
- **Migration for `release.rollback` callers:** `release.rollback` is removed. It only wrote an effect record without performing a real rollback. Callers should use `leitstand.rollback` instead.
- **No build pipeline integration:** Rollback is an on-demand emergency operation, not part of the standard build/deploy pipeline.
- **AGENTS.md updates:** Root `AGENTS.md` §Deployment commands — update the `leitstand.rollback` description (remove `--gate-decision`, `--to-release`; add `--site`/`--service` duality). Remove the `release.rollback` and `leitstand.service.rollback` entries from the command list. `packages/werkstatt/AGENTS.md` — update the Leitstand section if it references the old rollback flags.
- **Command manifest regeneration:** After implementation, `command.manifest.generate` is run to update the command registry.

## Alternatives considered

1. **Keep `leitstand.rollback` as re-deploy, add a separate `leitstand.native-rollback` command.** Rejected — two commands for the same conceptual operation is confusing. The re-deploy approach is strictly worse than native rollback (slower, requires local artifacts, doesn't scale). Replacing in-place is cleaner.

2. **Map werkstatt release IDs to Cloudflare Worker version IDs for targeted rollback.** Rejected for this RFC — adds complexity (storing version IDs in effect records, lookup logic) for a use case the operator did not request. `wrangler rollback` without arguments (rollback to previous version) is sufficient. Targeted rollback to a specific version can be added in a future RFC if needed.

3. **Keep `--gate-decision` for rollback, adapt `evaluateRollback` to skip artifact readiness.** Rejected — the operator explicitly stated that rollback targets an already-certified version, so re-certification is unnecessary friction. Removing the gate for rollback simplifies the emergency workflow.

4. **Add fleet-level rollback (`leitstand.fleet.rollback --all --channel main`) in this RFC.** Rejected — the operator chose to defer fleet-level rollback to a separate RFC. Single-site rollback is the building block; fleet rollback composes it.

5. **Keep `release.rollback` as a bookkeeping-only command.** Rejected — it creates confusion by existing alongside a real rollback command. With native `wrangler rollback` in `leitstand.rollback`, the effect record can be written there.

## Risks

- **Cloudflare 100-version limit:** `wrangler rollback` can only roll back to one of the 100 most recently published versions. If a site has had more than 100 deployments since the target version, rollback will fail. This is a Cloudflare platform limitation, not a Werkstatt bug. The error message from `wrangler rollback` will indicate this.
- **Bindings not changed on rollback:** Cloudflare does not change KV, D1, Durable Object, or other bindings during rollback. If a migration introduced a binding schema change between the current and previous version, the rolled-back Worker may not work correctly with the current bindings. This is a known Cloudflare limitation documented in their rollback guide. Operators must be aware of this risk.
- **No `--gate-decision` means no pre-rollback safety check.** The operator explicitly accepted this — rollback is an emergency operation targeting an already-certified version. The risk is that an operator rolls back to a version that was certified but later found to have a runtime issue. Mitigation: the operator can check `leitstand.status` or `leitstand.health` after rollback.
- **Breaking change for existing callers.** Scripts or agents using `--gate-decision` or `--to-release` with `leitstand.rollback` will fail. Mitigation: clear error messages guide callers to the new flag set.
- **Agent misinterpretation risk.** Agents may try to pass `--gate-decision` to `leitstand.rollback` based on outdated AGENTS.md content. Mitigation: AGENTS.md is updated in the same implementation. The command throws a clear error if `--gate-decision` is passed.

## Acceptance criteria

- [ ] `leitstand.rollback --site <id> --channel main` calls `runWranglerRollback` (not `runWranglerDeployWithRetry`) and rolls back to the previous Cloudflare Worker version
- [ ] `leitstand.rollback --service <id>` rolls back a service Worker via the same `runWranglerRollback` code path
- [ ] `leitstand.rollback --site <id> --channel dev` and `--channel alt` work for non-main channels
- [ ] `--gate-decision` flag is rejected by `leitstand.rollback` (not just ignored — throws a clear error)
- [ ] `--to-release` flag is rejected by `leitstand.rollback`
- [ ] `leitstand.service.rollback` command registration is removed from `leitstand.module.ts`
- [ ] `release.rollback` command registration is removed from the release module
- [ ] `RollbackInput` interface in `adapter.ts` no longer contains `distPath`, `toReleaseId`, `url`, `secretsFilePath`, `nodeModulesBinPath` (but retains `workerName`)
- [ ] `cloudflare-workers.ts` adapter `rollback()` method calls `runWranglerRollback` instead of `runWranglerDeployWithRetry`
- [ ] Deployment effect record is written after site rollback with `state: "rolled-back"`, preserving `candidateId`, `channel`, `timestamp` for `leitstand.status` compatibility
- [ ] CDN cache purge is performed after site rollback (not after service rollback)
- [ ] Minimal `wrangler.json` temp file is cleaned up after site rollback
- [ ] `--json` output format matches the documented shape (evidence: test or command output)
- [ ] `AGENTS.md` updated — rollback section reflects unified command, no `--gate-decision`, no `--to-release`
- [ ] `rfc.validate` passes on this file with zero RFC-specific errors

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0895` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT pass `--gate-decision` or `--to-release` to `leitstand.rollback` after this RFC is implemented — the command rejects these flags.
- Agents MUST NOT attempt to call `leitstand.service.rollback` or `release.rollback` after this RFC is implemented — these commands are removed.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0895 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- When implementing, reuse the existing `runWranglerRollback` function from `packages/werkstatt/src/leitstand/service-deploy-helpers.ts` — do not create a duplicate.
- When implementing the site rollback path, resolve the wrangler config directory from the site's `system-config.yaml` (the same resolution logic used by `leitstand.propagate` and `leitstand.promote`).
- When implementing the service rollback path, reuse the service directory resolution from `services/registry.yaml` (the same logic currently in `runLeitstandServiceRollback`).
- The `evaluateRollback` function in `packages/werkstatt/src/certification/deployment/authority.ts` and `evaluateRollbackRequest` in `packages/werkstatt/src/leitstand/deploy-helpers.ts` MUST NOT be deleted — they remain available for other deployment commands. Only the call from `leitstand.rollback` and `release.rollback` is removed. After implementation, verify no other command calls `evaluateRollbackRequest` — if none do, the function becomes dead code and should be noted as a candidate for future cleanup (but not deleted in this RFC).
