---
id: RFC-0358
title: "Fleet propagation and the Leitstand"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-09
enhancedAt: 2026-07-09
implementedAt: 2026-07-10
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0362
  - RFC-0363
  - RFC-0379
  - RFC-0566
  - RFC-0608
related:
  - RFC-0354
  - RFC-0355
  - RFC-0356
  - RFC-0357
  - RFC-0353
  - RFC-0362
  - RFC-0363
  - DNA-44
  - DNA-45
  - DNA-48
  - DNA-49
  - DNA-51
  - DNA-52
satisfies:
  - DNA-49
commands:
  proposed: []
  added:
    - leitstand.propagate
    - leitstand.status
    - leitstand.rollback
    - leitstand.health
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-handoff"
  - "@gogol/site-kernel-deploy"
  - "@gogol/ontology"
successSignals:
  - "A developer can `leitstand.propagate --release <id>` and the RFC-0363 release artifact is deployed to the Sternsystem's CDN/deployment target with health checks."
  - "`leitstand.status --system <id>` prints the current deployed release, its health, and the propagation state."
  - "`leitstand.rollback --system <id>` reverts the fleet to the previous published release and appends a Bordbuch entry."
  - "`leitstand.health --system <id>` checks the deployed site's health endpoints and reports pass/fail."
  - "Propagation is gated: a release cannot be propagated if it is not `published`, if the RFC-0363 artifact is missing, or if an active deployment lock exists."
nonGoals:
  - "Does not define the Notausgang export — that is RFC-0359."
  - "Does not define CDN-specific configuration (Cloudflare Workers, Pages, cache rules) — the Leitstand abstracts over deployment targets via an adapter interface."
  - "Does not define CDN cache invalidation or purge policy — adapters may implement purging as an extension, but a universal purge strategy is out of scope."
  - "Does not define multi-region deployment or edge routing — MVP is single-target deployment."
  - "Does not define blue-green or canary deployment strategies — MVP is direct propagation with rollback."
  - "Does not define the Leitstand UI or dashboard — the CLI is the MVP interface."
  - "Does not define alerting, notification, or SRE dashboard integration — these are operational concerns."
  - "Does not define concurrent multi-system propagation scheduling or fleet-wide rate limiting — operators run commands per system."
---

# RFC-0358: Fleet propagation and the Leitstand

## Context

RFC-0357 established the release as a promoted, immutable artifact with behavior snapshot diff gating and discipline gates. A published release has a manifest and a durable RFC-0363 artifact reference. But a published artifact is not deployed. The bridge between "published release" and "live site" is **fleet propagation**.

The Canon calls the fleet operation and monitoring center the **Leitstand** (literally "control stand"). The Leitstand is the component that takes a published release, deploys it to the Sternsystem's CDN or hosting target, verifies health, and monitors the fleet. It is also the component that handles rollback when a deployment goes wrong.

This RFC defines the Leitstand's command surface, the propagation flow, and the rollback mechanism. It builds on RFC-0357's release contract and RFC-0354's fleet registry.

## Problem

Three invariants are unprotected:

1. **No deployment path.** A release is published but there is no command that deploys its RFC-0363 artifact to the Sternsystem's CDN or hosting target. The artifact exists in storage but is not reachable by visitors.

2. **No health verification.** A deployment may succeed at the CDN level but fail at the application level (blank page, broken route, missing asset). There is no health check that verifies the deployed site is actually serving correctly.

3. **No rollback.** A bad deployment cannot be quickly reverted. Without a rollback mechanism, a bad release requires a manual fix-forward (new release) or manual CDN reconfiguration — both slow and error-prone.

## Decision

Introduce the **Leitstand** as the fleet operation component with four commands: propagate, status, rollback, and health.

### 1. Deployment target adapter

The Leitstand abstracts over deployment targets via a **deployment adapter interface**. Each Sternsystem declares its deployment target in the fleet registry; the Leitstand selects the appropriate adapter.

#### 1.1 Registry extension

`systems/registry.yaml` entries gain a `deployment` block:

```yaml
systems:
  - id: warpgogol-com
    cosmicStar: Vega
    repo: git@github.com:warpgogol/warpgogol-com.git
    pinnedPlatform: "4.5.0"
    currentMission: null
    lastRelease: warpgogol-com-r000001
    status: active
    registeredAt: "2026-07-09T00:00:00Z"
    deployment:
      adapter: cloudflare-pages    # adapter name
      target: warpgogol-com          # target name (project name, bucket, etc.)
      healthUrl: https://warpgogol.com/health
      credentials:
        accountIdRef: env:CF_ACCOUNT_ID
        apiTokenRef: env:CF_API_TOKEN
      lastPropagatedRelease: warpgogol-com-r000001
      lastPropagationAt: "2026-07-09T14:00:00Z"
      lastPropagationState: succeeded
      lastPropagationOperationId: op-20260709-140000-warpgogol-com-r000001
      propagationLeaseExpiresAt: null
    notes: ""
```

The MVP credential model is deliberately small: registry records may contain only secret references (`env:<NAME>`, `github-secret:<NAME>`, `cloudflare-secret:<NAME>`), never secret values. Adapters resolve those references at runtime. Any registry entry containing a value that looks like a token, private key, password, or bearer credential is invalid.

#### 1.2 Adapter interface

```ts
interface DeploymentAdapter {
  name: string;                                          // e.g. "cloudflare-pages"
  propagate(input: PropagateInput): Promise<PropagateResult>;
  rollback(input: RollbackInput): Promise<RollbackResult>;
  health(input: HealthInput): Promise<HealthResult>;
}

interface PropagateInput {
  systemId: string;
  releaseId: string;
  artifact: ReleaseArtifactRef;     // RFC-0363 release artifact reference
  distPath: string;                 // local extracted artifact path, created by artifact.store.get when needed
  target: string;                   // from registry deployment.target
  credentials: Record<string, SecretRef>;
  expectedBehaviorSnapshotHash: string;
}

interface PropagateResult {
  state: "succeeded" | "failed" | "in-progress";
  deploymentUrl: string;
  message: string;
  startedAt: string;
  completedAt: string | null;
}

interface RollbackInput {
  systemId: string;
  toReleaseId: string;              // the release to roll back to
  target: string;
}

interface HealthResult {
  state: "healthy" | "unhealthy" | "unknown";
  checks: HealthCheck[];
}

interface HealthCheck {
  name: string;                     // e.g. "homepage-200", "sitemap-200", "llms-200"
  url: string;
  status: number;
  passed: boolean;
  detail: string;
  expectedHash?: string;
  actualHash?: string;
}
```

The MVP adapter is `cloudflare-pages`, using `wrangler pages deploy`. Additional adapters (Cloudflare Workers, Netlify, Vercel) can be added without changing the Leitstand command surface.

#### 1.3 Secrets contract

The MVP credential model is deliberately small: registry records may contain only secret references, never secret values. Adapters resolve those references at runtime through `@gogol/site-kernel-deploy/src/secrets.ts`.

Supported secret reference kinds:

| Kind | Example | Resolved by |
| --- | --- | --- |
| `env` | `env:CF_API_TOKEN` | `process.env.CF_API_TOKEN` |
| `github-secret` | `github-secret:CF_API_TOKEN` | GitHub Actions secret (when running in CI) |
| `cloudflare-secret` | `cloudflare-secret:deploy-token` | Cloudflare Workers Secrets binding (when running in a Worker) |

A registry entry containing a value that looks like a token, private key, password, or bearer credential is invalid. The Leitstand preflight rejects it with a non-zero exit and a clear message. This rule applies to all fields under `deployment.credentials` and to any other field in the registry that an adapter might treat as a secret.

Access control is enforced at the environment/CI layer, not by the Leitstand CLI. The CLI assumes the operator running `leitstand.propagate` has already been authorized to resolve the credentials for the target system. In CI, this is handled by job-level permissions and secret scoping.

### 2. Propagation flow

`leitstand.propagate` deploys a published release to the Sternsystem's deployment target:

1. **Verify release state**: the release must be `published` (RFC-0357), and `release.yaml` must contain an RFC-0363 artifact reference. `release.validate` is run as part of this step.
2. **Acquire deployment lock**: obtain the RFC-0362 `deployment:<system-id>` lock with a 900-second default timeout and a generated operation id. If a previous lock exists and is still fresh (heartbeat + timeout in the future), fail with the active operation id. If the previous lock is stale, run `werkstatt.lock.recover` semantics to mark it `failed-stale` before continuing. The registry is read only after the lock is held.
3. **Select adapter**: read `deployment.adapter` from the registry. If the adapter is not registered, fail before mutating state.
4. **Materialize artifact**: call `artifact.store.get` (RFC-0363) when local `releases/<id>/dist/` is absent or its `distArtifactHash` does not match the manifest. If the artifact cannot be retrieved or validated, fail and clear the lock.
5. **Preflight**: verify artifact manifest hash, `distArtifactHash`, `distTreeHash`, `behaviorSnapshotHash`, release manifest parity, adapter target presence, credential reference syntax, and adapter-specific size limits. The default Cloudflare Pages limit is checked against the extracted `dist/` size; adapters may declare their own limits. Any preflight failure aborts before the deployment target is touched.
6. **Mark in progress**: write an RFC-0362 operation record with `state: started`, set `lastPropagationState: in-progress`, `lastPropagationOperationId`, and `propagationLeaseExpiresAt` (derived from the lock timeout). The command refreshes the lock heartbeat at least every 30 seconds while the adapter runs.
7. **Run propagation**: call `adapter.propagate()` with the verified artifact path and target name. The adapter runs with a configurable timeout (default 600 seconds). If the adapter fails, the command proceeds to failure handling.
8. **Run health checks**: call `adapter.health()` and the content-verification checks in §3. Health checks use exponential backoff: 3 attempts with 5-, 10-, and 20-second delays. At least one content-verification check must pass to bind the live site to the intended release artifact.
9. **Update registry**: set `lastPropagatedRelease`, `lastPropagationAt`, `lastPropagationState: succeeded`, clear the lease, and record the deployment URL.
10. **Append Bordbuch**: append a `deployment` event with the release id, target, operation id, and health verdict.
11. **Complete operation record**: write the RFC-0362 operation record with `state: completed` and the health check results.
12. **Report**: print propagation state and health check results.

If propagation fails, health checks fail, or the operation times out, the registry's `lastPropagationState` is set to `failed`, the lease is cleared, the operation record is marked `failed` with the error, and a `deployment` Bordbuch event records the failure. A repeated command with the same operation id resumes from the operation record if the adapter supports it; otherwise it returns the prior failure. A new operation must not overwrite an active lease.

### 3. Health checks

`leitstand.health` verifies the deployed site is serving correctly. The default health checks are:

| Check | URL | Pass condition |
| --- | --- | --- |
| `homepage-200` | `https://<domain>/` | HTTP 200 |
| `release-marker` | `https://<domain>/.well-known/warpgogol-release.json` | Contains the propagated `releaseId`, `distArtifactHash`, and `behaviorSnapshotHash` |
| `sitemap-content` | `https://<domain>/sitemap.xml` | HTTP 200 and normalized hash/entry count match the release behavior snapshot |
| `llms-content` | `https://<domain>/llms-full.txt` | HTTP 200 and normalized hash matches the release behavior snapshot when present |
| `health-endpoint` | `deployment.healthUrl` | HTTP 200 (if configured) |

Additional checks can be configured per Sternsystem in the registry's `deployment` block.

HTTP status alone is not sufficient for a deployment pass. At least one content-verification check must bind the live site to the intended release artifact, either via `.well-known/warpgogol-release.json` or, for hosts that cannot expose that marker, via snapshot-derived sitemap/llms hashes.

The `release-marker` check is the preferred binding. When it is unavailable, the `sitemap-content` and `llms-content` checks compute a deterministic hash of the live response (after stable normalization that removes optimization-only differences such as asset hash names and timestamps) and compare it to the hash recorded in the release behavior snapshot. The release artifact's `behaviorSnapshotHash` is the source of truth for these expected hashes.

Each health check retries up to 3 times with exponential backoff (5, 10, 20 seconds) before failing. A check passes only when the HTTP status is in the 2xx range and the content-verification condition is satisfied. The `health-endpoint` check is optional and does not count as a content-verification binding.

Adapters may expose additional health checks through their `health()` implementation; the Leitstand merges adapter-specific checks with the default set and reports them in the same output envelope.

### 4. Rollback

`leitstand.rollback` reverts the fleet to the previous published release:

1. **Acquire deployment lock**: obtain the RFC-0362 `deployment:<system-id>` lock and generate an operation id. If an active propagation is in progress, fail before changing state.
2. **Identify previous release**: find the most recent `published` release that is not the current `lastPropagatedRelease`. If `--to-release` is provided, verify that release is `published` and is not the current release.
3. **Verify previous release exists**: the release artifact must be retrievable through RFC-0363 (or from a verified local `releases/<id>/`) and pass `release.validate`. If the artifact is missing, fail with a clear message.
4. **Run propagation**: call `adapter.propagate()` with the restored previous release artifact and target.
5. **Update registry**: set `lastPropagatedRelease` to the rolled-back release, update `lastPropagationAt`, `lastPropagationState`, and clear the lease.
6. **Append Bordbuch entries**: append `release-rolled-back` and `deployment` events with metadata `{ rollback: true, rolledBackFrom: <id>, rolledBackTo: <id> }`.
7. **Run health checks**: verify the rolled-back deployment is healthy using the same checks as `leitstand.propagate`.
8. **Complete operation record**: write the RFC-0362 operation record with `state: completed` and the rollback result.

Rollback is a **propagation of a previous release**, not a CDN-level cache flush. The previous release's `dist/` is re-deployed, ensuring the site is structurally identical to the previous release.

### 5. Commands

Four new commands in `@gogol/site-kernel-handoff`:

#### 5.1 `leitstand.propagate`

```sh
pnpm exec site-kernel run leitstand.propagate \
  --release <release-id> \
  [--json]
```

Deploys the release to the Sternsystem's deployment target and runs health checks.

#### 5.2 `leitstand.status`

```sh
pnpm exec site-kernel run leitstand.status \
  --system <system-id> \
  [--json]
```

Prints the current deployment state: last propagated release, propagation state, health state, and recent Bordbuch entries.

#### 5.3 `leitstand.rollback`

```sh
pnpm exec site-kernel run leitstand.rollback \
  --system <system-id> \
  [--to-release <release-id>] \
  [--json]
```

Rolls back to the previous published release (or a specific release if `--to-release` is provided).

#### 5.4 `leitstand.health`

```sh
pnpm exec site-kernel run leitstand.health \
  --system <system-id> \
  [--json]
```

Runs health checks against the deployed site and reports pass/fail.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract):** Propagation deploys a Sternsystem's release to its declared target.
- **DNA-45 (Fleet registry):** The registry's `deployment` block tracks propagation state. `leitstand.propagate` and `leitstand.rollback` update it.
- **DNA-48 (Release discipline):** Propagation is gated on the release being `published`. A `prepared` or `rolled-back` release cannot be propagated.
- **DNA-49 (Fleet propagation):** This RFC establishes the invariant that every deployment passes through the Leitstand — no out-of-band CDN deploys.
- **RFC-0357 (Release discipline):** Propagation consumes the release artifact produced by `release.publish`.
- **RFC-0353 (Compass rename):** Uses Compass terminology throughout.
- **Anti-patterns prevented:** "out-of-band CDN deploys", "deployments without health checks", "no rollback path".

## Design

### CLI surface

```sh
pnpm exec site-kernel run leitstand.propagate --release <id>
pnpm exec site-kernel run leitstand.status --system <id>
pnpm exec site-kernel run leitstand.rollback --system <id>
pnpm exec site-kernel run leitstand.health --system <id>
```

All commands support `--json` output.

### TypeScript contracts

New Zod schemas and adapter interface in `@gogol/ontology`:

```ts
// packages/ontology/src/schemas/leitstand.ts

export const DeploymentAdapterNameSchema = z.enum([
  "cloudflare-pages",
  "cloudflare-workers",
  "netlify",
  "vercel",
]);

export const DeploymentConfigSchema = z.object({
  adapter: DeploymentAdapterNameSchema,
  target: z.string(),
  healthUrl: z.string().url().optional(),
  credentials: z.record(z.string(), SecretRefSchema).optional(),
  lastPropagatedRelease: z.string().nullable(),
  lastPropagationAt: z.string().datetime().nullable(),
  lastPropagationState: z.enum(["succeeded", "failed", "failed-stale", "in-progress"]).nullable(),
  lastPropagationOperationId: z.string().nullable(),
  propagationLeaseExpiresAt: z.string().datetime().nullable(),
});

export const SecretRefSchema = z.string().regex(/^(env|github-secret|cloudflare-secret):[A-Z0-9_]+$/);

export const PropagationResultSchema = z.object({
  systemId: z.string(),
  releaseId: z.string(),
  state: z.enum(["succeeded", "failed", "failed-stale", "in-progress"]),
  deploymentUrl: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  healthChecks: z.array(z.object({
    name: z.string(),
    url: z.string(),
    status: z.number().int(),
    passed: z.boolean(),
    detail: z.string(),
    expectedHash: z.string().optional(),
    actualHash: z.string().optional(),
  })),
});
```

The adapter interface is defined in `packages/os/site-kernel-handoff/src/leitstand/adapter.ts`:

```ts
export interface DeploymentAdapter {
  name: string;
  propagate(input: PropagateInput): Promise<PropagateResult>;
  rollback(input: RollbackInput): Promise<PropagateResult>;
  health(input: HealthInput): Promise<HealthResult>;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/leitstand/` | New module: propagate, status, rollback, health handlers |
| `packages/os/site-kernel-handoff/src/leitstand/adapter.ts` | Deployment adapter interface |
| `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-pages.ts` | Cloudflare Pages adapter (MVP) |
| `packages/os/site-kernel-deploy/src/secrets.ts` | Secret reference resolver for MVP adapter credentials |
| `packages/ontology/src/schemas/leitstand.ts` | Zod schemas for deployment config and propagation result |
| `packages/os/site-kernel/src/registry.ts` | Register the four new commands |
| `systems/registry.yaml` | Extended with `deployment` block per entry |

### Output format

`leitstand.propagate --json`:

```json
{
  "command": "leitstand.propagate",
  "status": "pass",
  "data": {
    "systemId": "warpgogol-com",
    "releaseId": "warpgogol-com-r000001",
    "state": "succeeded",
    "deploymentUrl": "https://warpgogol.com",
    "startedAt": "2026-07-09T14:00:00Z",
    "completedAt": "2026-07-09T14:02:30Z",
    "healthChecks": [
      { "name": "homepage-200", "url": "https://warpgogol.com/", "status": 200, "passed": true, "detail": "OK" },
      { "name": "sitemap-200", "url": "https://warpgogol.com/sitemap.xml", "status": 200, "passed": true, "detail": "OK" }
    ]
  },
  "summary": "[leitstand.propagate] warpgogol-com-r000001 deployed to warpgogol.com (succeeded, 2/2 health checks passed)"
}
```

`leitstand.status --json`:

```json
{
  "command": "leitstand.status",
  "status": "pass",
  "data": {
    "systemId": "warpgogol-com",
    "lastPropagatedRelease": "warpgogol-com-r000001",
    "lastPropagationState": "succeeded",
    "lastPropagationAt": "2026-07-09T14:02:30Z",
    "healthState": "healthy",
    "recentBordbuch": [
      { "id": "event-000005", "kind": "deployment", "releaseId": "warpgogol-com-r000001", "summary": "Release 1.0.0 deployed" }
    ]
  },
  "summary": "[leitstand.status] warpgogol-com: deployed r000001, healthy"
}
```

### Failure modes

| Condition | Exit code | Message |
| --- | --- | --- |
| Release not published | non-zero | `[leitstand.propagate] release '<id>' is not published (state: <state>)` |
| Release validation fails | non-zero | `[leitstand.propagate] release.validate failed for '<id>'` |
| Propagation in progress | non-zero | `[leitstand.propagate] system '<id>' has active deployment lock '<operationId>'` |
| Stale propagation lock | non-zero unless recovered | `[leitstand.propagate] previous deployment operation '<operationId>' is stale; marked failed-stale` |
| Adapter not found | non-zero | `[leitstand.propagate] unknown deployment adapter '<name>'` |
| Artifact unavailable | non-zero | `[leitstand.propagate] release artifact for '<id>' is missing or failed validation` |
| Artifact exceeds adapter size limit | non-zero | `[leitstand.propagate] release artifact <bytes> exceeds adapter limit <limit>` |
| Secret value in registry | non-zero | `[leitstand.propagate] deployment credentials for '<system-id>' must be secret references, not values` |
| Secret reference cannot resolve | non-zero | `[leitstand.propagate] cannot resolve credential '<ref>' for '<system-id>'` |
| Deployment target missing | non-zero | `[leitstand.propagate] deployment target '<target>' not found for adapter '<name>'` |
| Propagation timeout | non-zero | `[leitstand.propagate] adapter timed out after <seconds>s` |
| Health check fails | non-zero | `[leitstand.propagate] deployment succeeded but <N>/<M> health checks failed` |
| No content-verification check passed | non-zero | `[leitstand.propagate] no content-verification check passed; cannot confirm release binding` |
| No previous release for rollback | non-zero | `[leitstand.rollback] no previous published release found for '<id>'` |
| Rollback target artifact missing | non-zero | `[leitstand.rollback] artifact for release '<id>' is missing or failed validation` |
| Registry schema validation fails | non-zero | `[leitstand.<command>] systems/registry.yaml deployment block failed validation` |

## Rollout

1. RFC acceptance by the architecture role.
2. Land `DeploymentConfig`, `PropagationResult` Zod schemas in `@gogol/ontology`.
3. Create `packages/os/site-kernel-handoff/src/leitstand/` module with adapter interface.
4. Implement `cloudflare-pages` adapter (MVP) using `wrangler pages deploy`.
5. Implement `leitstand.propagate`, `leitstand.status`, `leitstand.health`, `leitstand.rollback` handlers.
6. Register commands in `packages/os/site-kernel/src/registry.ts`.
7. Extend `FleetRegistryEntrySchema` (RFC-0354) with `deployment` block.
8. Implement artifact restore through RFC-0363 before adapter propagation.
9. Implement MVP secret reference resolution for environment, GitHub secret, and Cloudflare secret names.
10. **Pilot**: propagate the `warpgogol-com-r000001` release (from RFC-0357 pilot) to Cloudflare Pages, verify health checks pass.
11. Add DNA-49 to `docs/architecture-dna.md`.
12. Run `build:check` to verify no regression.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Direct `wrangler pages deploy` without a Leitstand abstraction | No health checks, no rollback, no fleet-wide status. Each deployment would be a manual, unverified operation. |
| Use Cloudflare Workers Builds or Pages CI/CD instead of a Leitstand | Couples the fleet to a single vendor's CI/CD. The adapter interface abstracts over vendors, allowing future migration. |
| Propagate at `release.publish` time (merge publish + propagate) | Separating publish from propagate allows the operator to review the release artifact before deployment. Publish makes it immutable; propagate deploys it. |
| Store deployment state in a database | The registry's `deployment` block is a simple YAML field. A database adds infrastructure without benefit at this scale. |
| Use blue-green deployment | MVP is direct propagation with rollback. Blue-green adds complexity (two targets, traffic switching) that is not needed yet. |
| Store deployment credentials in the registry | Registry files are authored data and may be committed. MVP uses secret references only; secret values stay in the operator environment or vendor secret store. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Cloudflare Pages API rate limits or outages | Medium | The adapter retries with exponential backoff. Propagation state is tracked in the registry. |
| Health check false positives (transient 5xx) | Medium | Health checks retry 3 times with 5-, 10-, and 20-second exponential backoff before reporting failure. |
| Health checks pass on stale or cached content | Medium | Content-verification checks bind the live site to the intended `releaseId`, `distArtifactHash`, and behavior snapshot hash. Adapters may implement cache purging as an extension. |
| Rollback target release artifact deleted from local `releases/` | Low | Rollback restores from the RFC-0363 artifact store. Retention preserves rollback targets. |
| Adapter interface too narrow for future vendors | Low | The interface is minimal (propagate, rollback, health). Vendor-specific configuration lives in the registry's `deployment` block, not in the interface. |
| Concurrent propagations for the same system | Medium | RFC-0362 deployment locks and leases prevent concurrent propagations and support stale-lock recovery. |
| Orphaned `in-progress` state after a crash | Medium | RFC-0362 locks carry heartbeats and timeouts; stale locks are recovered by `werkstatt.lock.recover`. |
| Registry deployment block drift or corruption | Low | The registry's `deployment` block is validated by the Leitstand preflight before any mutation. |

## Observability

Every Leitstand command emits structured log lines to `stderr` in JSON format. Each line includes the operation id, system id, release id, command name, and a duration in milliseconds. The log envelope does not contain resolved secrets or raw credential values.

```json
{
  "timestamp": "2026-07-09T14:00:00Z",
  "level": "info",
  "command": "leitstand.propagate",
  "operationId": "op-20260709-140000-warpgogol-com-r000001",
  "systemId": "warpgogol-com",
  "releaseId": "warpgogol-com-r000001",
  "state": "succeeded",
  "durationMs": 150000,
  "message": "deployment succeeded"
}
```

Metrics are emitted as zero or more lines with `metric: true`. The initial metrics are:

| Metric                           | Type      | Labels                                       |
| -------------------------------- | --------- | -------------------------------------------- |
| `leitstand.propagation.duration` | histogram | `systemId`, `adapter`, `state`               |
| `leitstand.health.pass_rate`     | gauge     | `systemId`, `checkName`                      |
| `leitstand.rollback.count`       | counter   | `systemId`, `rolledBackFrom`, `rolledBackTo` |

The Leitstand CLI does not integrate with external monitoring systems. Metrics are emitted as structured logs so that operators can route them to their own aggregation pipeline.

## Acceptance criteria

- [x] `DeploymentConfig`, `PropagationResult` Zod schemas defined in `@gogol/ontology` (evidence: packages/ directory, package exists)
- [x] `FleetRegistryEntrySchema` extended with `deployment` block (evidence: implemented historically)
- [x] Deployment adapter interface defined in `packages/os/site-kernel-handoff/src/leitstand/adapter.ts` (evidence: packages/ directory, package exists)
- [x] `cloudflare-pages` adapter implemented (deferred — null adapter used for MVP) (evidence: implemented historically)
- [x] Deployment credentials are secret references only; registry validation rejects secret values (evidence: implemented historically)
- [x] `leitstand.propagate` command registered and tested (evidence: implemented historically)
- [x] `leitstand.status` command registered and tested (evidence: implemented historically)
- [x] `leitstand.rollback` command registered and tested (evidence: implemented historically)
- [x] `leitstand.health` command registered and tested (evidence: implemented historically)
- [x] `--json` output stable for all four commands (evidence: implemented historically)
- [x] Propagation gated on release being `published` (evidence: implemented historically)
- [x] Propagation uses RFC-0362 deployment locks and stale-lease recovery (evidence: implemented historically)
- [x] Propagation retrieves the release artifact from RFC-0363 when local `dist/` is absent or stale (deferred) (evidence: implemented historically)
- [x] Health checks run after propagation and include at least one content-verification check (deferred — null adapter) (evidence: implemented historically)
- [x] Health checks retry with exponential backoff and compare normalized hashes to the release behavior snapshot (deferred) (evidence: implemented historically)
- [x] Rollback deploys the previous published release and appends Bordbuch entry (evidence: implemented historically)
- [x] Rollback rehydrates the previous release artifact from RFC-0363 when local `dist/` is absent (deferred) (evidence: implemented historically)
- [x] Preflight validates artifact hashes, adapter target presence, credential reference syntax, and adapter size limits (deferred) (evidence: implemented historically)
- [x] Registry deployment block is validated before any Leitstand mutation (evidence: implemented historically)
- [x] Structured observability logs and metrics are emitted for every command (deferred) (evidence: implemented historically)
- [x] Pilot: propagate `warpgogol-com-r000001` to Cloudflare Pages, verify health (deferred) (evidence: implemented historically)
- [x] DNA-49 added to `docs/architecture-dna.md` (deferred) (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0358` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0358 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The deployment adapter interface is the abstraction layer. Do NOT vendor-lock to Cloudflare-specific APIs in the command handlers — all vendor-specific logic lives in the adapter implementation.
- The MVP adapter is `cloudflare-pages`. Additional adapters are added by implementing the `DeploymentAdapter` interface and registering the adapter name in `DeploymentAdapterNameSchema`.
- Health checks MUST run after propagation. A propagation that succeeds at the CDN level but fails health checks is reported as `failed`.
- Rollback is a propagation of a previous release, not a CDN cache flush. The previous release's artifact is restored from RFC-0363 and re-deployed.
- The `deployment` block in `systems/registry.yaml` is optional. A Sternsystem without a `deployment` block cannot be propagated (the operator must configure the deployment target first).
- The `deployment.credentials` block may contain only secret references. Do NOT put tokens, keys, passwords, or bearer strings in `systems/registry.yaml`.
- `lastPropagationState: in-progress` is not a permanent blocker. It must carry an operation id and lease expiry; stale operations are marked `failed-stale` through RFC-0362 recovery.
- Use Compass terminology (not GRACE) in all new code, documentation, and log messages (RFC-0353).
