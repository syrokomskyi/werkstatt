---
id: RFC-0379
title: "Implement the cloudflare-workers Leitstand adapter with health verification"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-12
updatedAt: 2026-07-13
enhancedAt: 2026-07-12
implementedAt: 2026-07-13
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0358
amendedBy: []
related:
  - DNA-48
  - DNA-49
  - DNA-51
  - DNA-52
  - DNA-53
  - RFC-0149
  - RFC-0357
  - RFC-0362
  - RFC-0363
  - RFC-0364
  - RFC-0378
  - RFC-0380
  - RFC-0381
satisfies:
  - DNA-49
  - DNA-52
commands:
  proposed: []
  added: []
  changed:
    - leitstand.propagate
    - leitstand.rollback
    - leitstand.health
    - leitstand.status
  removed: []
appsImpacted:
  - apps/warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-handoff"
  - "@gogol/ontology"
  - "@gogol/fingerprint"
successSignals:
  - "leitstand.propagate performs a real Cloudflare Workers deployment via wrangler deploy against a named channel target and records the result in the registry and Bordbuch."
  - "Deployment supports staged channels: propagation defaults to the alt channel; the main (production) channel requires a recorded healthy alt propagation of the same release."
  - "Post-deploy health verification fetches probe routes, normalizes them via @gogol/fingerprint, and compares against the release behavior snapshot with exponential-backoff retries."
  - "Preflight validates artifact hashes (RFC-0363/0364), target presence, credential reference syntax, wrangler availability, and Workers size limits before any deploy starts."
  - "Propagation and rollback rehydrate the release dist from the RFC-0363 artifact store when the local releases/<id>/dist is absent or hash-stale."
  - "Secret values never appear in systems/registry.yaml, Sternsystem repos, or command output — only secret references and local gitignored secrets files."
nonGoals:
  - "Does not implement netlify or any other adapter — the adapter seam stays, but cloudflare-workers is the only concrete adapter in this wave."
  - "Does not implement blue-green, canary, or multi-region strategies — staged alt→main channels are sequential full deployments, not traffic splitting."
  - "Does not define CDN cache purge policy — Workers static assets are content-addressed by the platform."
  - "Does not build a Leitstand UI or dashboard — the CLI remains the interface."
  - "Does not execute the pilot propagation — that is RFC-0381."
acceptance:
  - probe: file-exists
    path: "packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts"
  - probe: command-registered
    name: "leitstand.status"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0379: Implement the cloudflare-workers Leitstand adapter with health verification

## Context

RFC-0358 established the Leitstand (fleet propagation) with a `DeploymentAdapter` interface in `packages/os/site-kernel-handoff/src/leitstand/adapter.ts` and four commands (`leitstand.propagate`, `leitstand.rollback`, `leitstand.health`, `leitstand.status`). Its acceptance criteria explicitly deferred the concrete adapter, health checks, preflight, artifact-store integration, and the pilot. The current state:

- `resolveAdapter()` in `leitstand-commands.ts` returns a `nullAdapter` for every adapter name — propagation logs intent and succeeds without deploying anything.
- Health checks return `unknown` with zero checks; nothing compares deployed output to the release behavior snapshot (RFC-0357/RFC-0269).
- Propagation reads dist from the local `releases/<id>/` directory only; the RFC-0363 artifact store (DNA-52: "deployment, rollback, and Notausgang workflows resolve artifacts through the store") is bypassed.
- The registry default adapter name is `cloudflare-pages`, but the ecosystem's real deployment form is **Cloudflare Workers** (RFC-0149 / DNA-1): `wrangler deploy` with static assets on a single Worker. `apps/warpgogol-com/package.json` already deploys two named Workers — `alt-warpgogol-com` (alt.warpgogol.com) and `warpgogol-com` (production) — via `wrangler deploy --name <worker> --secrets-file <env>`.

The operator decision for the pilot wave (RFC-0381): propagation is staged **alt → main** — a release must be deployed and health-verified on the alt channel before it may reach production.

## Problem

DNA-49 (Fleet propagation) and DNA-52 (Release artifact store) are currently satisfied only on paper:

1. No release can actually reach a visitor — the null adapter makes `leitstand.propagate` a green no-op, which is worse than a missing command because it produces false Bordbuch evidence of deployment.
2. `DeploymentConfig` models exactly one `target: string`; the staged alt→main flow cannot be expressed, so production deploys would have no verification gate.
3. Nothing verifies that what is deployed matches the published release — the behavior snapshot diff gate (RFC-0357) stops at publish time and has no post-deploy counterpart.
4. Rollback cannot work after `releases/` cleanup because artifact-store rehydration is unimplemented.
5. The default adapter name `cloudflare-pages` contradicts RFC-0149, which retired the Pages form — a latent misconfiguration for every future registry entry.

## Decision

The Leitstand gains a concrete `cloudflare-workers` adapter that wraps `wrangler deploy`, a **channel model** (`alt` staging channel, `main` production channel) in `DeploymentConfig`, hard preflight, post-deploy health verification against the release behavior snapshot via `@gogol/fingerprint`, and artifact-store rehydration for propagate and rollback. `cloudflare-pages` is removed from the adapter name enum. This RFC amends RFC-0358 and closes its deferred acceptance criteria.

## Architectural fit

- **DNA-49 (Fleet propagation / Leitstand)** — this RFC turns the invariant from declared to enforced: propagation is gated on `published` releases (unchanged), uses RFC-0362 locks (unchanged), and now actually deploys and verifies. The DNA-49 descriptive text in `docs/architecture-dna.md` ("MVP: Cloudflare Pages") must be updated to "MVP: Cloudflare Workers" as part of implementation, reflecting the adapter established here.
- **DNA-52 (Release artifact store)** — propagate/rollback resolve dist through `artifact.store.get` with hash verification, closing the bypass.
- **DNA-53 (Fingerprint governance)** — health checks and dist staleness use `@gogol/fingerprint` normalized hashes; no ad hoc hashing.
- **DNA-48 (Release discipline)** — the alt→main channel gate extends the RFC-0357 gate chain into the deployment phase: publish-gate → alt-deploy-gate → main-deploy.
- **RFC-0149 / DNA-1** — the adapter deploys the single-Worker static-assets form; no Pages surface is reintroduced.
- **RFC-0346 (env contract)** — secrets files follow the established `.env` / `.env.production` shape; the adapter consumes them, never stores them.

## Design

### CLI surface

```sh
# stage a published release on the alt channel (default)
pnpm exec site-kernel run leitstand.propagate --release warpgogol-com-r000001 --json

# promote the same release to production after alt is healthy
pnpm exec site-kernel run leitstand.propagate --release warpgogol-com-r000001 --channel main --json

# verify a deployed channel on demand
pnpm exec site-kernel run leitstand.health --system warpgogol-com --channel alt --json

# rollback production to the previous published release
pnpm exec site-kernel run leitstand.rollback --system warpgogol-com --channel main --json

# show both channels' deployment state (optional --channel to filter)
pnpm exec site-kernel run leitstand.status --system warpgogol-com --json
```

All four commands stay workspace-scoped. New flag `--channel <alt|main>` (default `alt` for propagate/health; required for rollback; optional filter for status, which shows both channels by default).

### TypeScript contracts

The adapter enum removes `cloudflare-pages` (retired by RFC-0149) and `vercel` (a speculative value from RFC-0358 that was never implemented — no adapter, no references in the codebase). The forward-only discipline requires removing dead enum values rather than carrying them. `null` is added as an explicit adapter name for test fixtures.

```ts
// @gogol/ontology operations/leitstand.ts (schema changes)
export const deploymentAdapterNameSchema = z.enum(["cloudflare-workers", "netlify", "null"]);

export const deploymentChannelSchema = z.object({
  workerName: z.string(), // wrangler --name
  url: z.string().url(), // health-check base URL
  secretsFile: secretRefSchema.optional(), // e.g. "env:WERKSTATT_SECRETS_MAIN" -> resolved to a local file path (see secretsFile resolution below)
});

export const lastPropagatedChannelSchema = z.object({
  releaseId: z.string(),
  at: z.string().datetime(),
  healthy: z.boolean(),
  state: z.enum(["succeeded", "failed", "failed-stale", "in-progress"]),
  operationId: z.string(),
  leaseExpiresAt: z.string().datetime().nullable(),
});

export const deploymentConfigSchema = z.object({
  adapter: deploymentAdapterNameSchema,
  channels: z.object({ alt: deploymentChannelSchema.optional(), main: deploymentChannelSchema }),
  lastPropagated: z
    .record(z.enum(["alt", "main"]), lastPropagatedChannelSchema)
    .default({}),
});
```

The `lastPropagated` record carries per-channel operational state (`state`, `operationId`, `leaseExpiresAt`) to preserve RFC-0362 lock recovery and stale-state detection semantics per channel.

```ts
// packages/os/site-kernel-handoff/src/leitstand/adapter.ts (updated interfaces)
export interface PropagateInput {
  systemId: string;
  releaseId: string;
  channel: "alt" | "main";
  distPath: string;
  workerName: string;
  url: string;
  secretsFilePath: string | undefined; // resolved from secretsFile reference
  expectedBehaviorSnapshotHash: string;
}

export interface RollbackInput {
  systemId: string;
  toReleaseId: string;
  channel: "alt" | "main";
  distPath: string;
  workerName: string;
  url: string;
  secretsFilePath: string | undefined;
}

export interface HealthInput {
  systemId: string;
  channel: "alt" | "main";
  deploymentUrl: string;
  releaseId: string;
  expectedBehaviorSnapshotHash: string;
  workspaceRoot: string;
}
```

```ts
// packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts
export function createCloudflareWorkersAdapter(exec?: CommandRunner): DeploymentAdapter;
```

The adapter shells out to `pnpm exec wrangler deploy --name <workerName> --secrets-file <resolvedSecretsPath>` with `cwd` set to the release's rehydrated build context. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are hardcoded env var names read from the process environment (populated by the sourced secrets file if provided). They are not configurable via the channel config — these are the canonical Cloudflare env var names and have no reason to vary.

### secretsFile resolution

The `secretsFile` field reuses the existing `env:` reference kind with a convention: the env var name (e.g., `WERKSTATT_SECRETS_MAIN`) contains a file path, not a secret value. The adapter resolves the reference by reading the env var, interpreting its value as a path to a dotenv file, and sourcing it into the process environment before invoking `wrangler deploy --secrets-file <path>`. Resolution lives in the adapter module in `@gogol/site-kernel-handoff`; the registry never carries raw paths or secret values.

### Adapter resolution

`resolveAdapter` returns the `cloudflare-workers` adapter for `"cloudflare-workers"`, the `nullAdapter` for `"null"`, and throws `adapter-not-implemented` for `"netlify"` or any other enum value without a concrete implementation. The current behavior (nullAdapter for all names) is replaced — silent no-op deploys are a safety risk.

### Channel gating

`leitstand.propagate --channel main` refuses unless `deployment.lastPropagated.alt` records the **same releaseId** with `healthy: true`. There is no `--force` bypass — the escalation path for emergencies is `leitstand.rollback`, not gate bypassing. Systems whose registry entry defines no `alt` channel (future non-piloted sites) may propagate directly to `main`; defining an `alt` channel opts the system into staging discipline.

### Preflight (runs inside `leitstand.propagate` before any deploy)

1. Release state is `published` (existing gate).
2. RFC-0363 artifact manifest resolves; dist tree hash matches (`artifact.store.get` + verify).
3. Adapter name is registered; channel exists in `deployment.channels`.
4. Credential references parse against `secretRefSchema`; referenced secrets files exist locally and are gitignored.
5. `wrangler` binary resolves; dist size is within Workers static-assets limits.

Any preflight failure aborts with a non-zero exit before wrangler runs.

### Health verification

After deploy, the adapter fetches a probe set derived from the release behavior snapshot routes. Routes are selected in a deterministic priority order: home pages per language first, then legal pages, then `sitemap.xml`/`llms.txt`, then remaining routes alphabetically, taking the first N (N configurable, default 10). Deterministic selection ensures the same release always produces the same probe set — no flaky health verdicts from route selection variance. Each response is normalized with `@gogol/fingerprint` HTML normalization and compared to the snapshot's per-route facts (status, content hash where the snapshot carries one, structural facts otherwise). Retries: exponential backoff, default 5 attempts over ~2 minutes, to absorb Cloudflare propagation delay. The verdict (`healthy`/`unhealthy` + per-check detail) is written to `deployment.lastPropagated.<channel>` and appended to the Bordbuch. An `unhealthy` verdict exits non-zero and leaves the channel marked unhealthy — promotion to `main` is thereby blocked.

### Artifact-store rehydration

`leitstand.propagate` and `leitstand.rollback` resolve the dist through the RFC-0363 store: if `releases/<id>/dist` is missing or its tree hash mismatches the artifact manifest, the dist is rehydrated from the content-addressed store into a staging directory (RFC-0362 atomic staging) before deploy. Local `releases/` becomes a cache, not a requirement.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts` | New adapter (Compass scaffolding per DNA-42) |
| `packages/os/site-kernel-handoff/src/leitstand/adapter.ts` | Updated `PropagateInput`/`RollbackInput`/`HealthInput` interfaces with channel fields |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Channel gating, preflight, rehydration wiring; `resolveAdapter` fails for unimplemented adapters; null adapter kept only for tests and `adapter: "null"` registry entries |
| `packages/ontology/src/operations/leitstand.ts` | Schema changes above; `cloudflare-pages` removed |
| `systems/registry.yaml` | `deployment.channels` + `lastPropagated` state (YAML per RFC-0376) |
| `.werkstatt/secrets/<system-id>/*.env` | Local gitignored secrets files resolved from secret references; never committed, never read into logs |
| `systems/<id>/bordbuch/events.ndjson` | Propagation/rollback/health entries (existing writers) |

### Output format

`leitstand.propagate --json` returns the canonical envelope with a `propagation` object mirroring `propagationResultSchema` plus `channel`, `preflight: { passed, checks[] }`, and `health: { state, checks[] }`. Secret values and resolved secrets-file paths outside the workspace are redacted to reference names.

### Failure modes

- Preflight failure → exit non-zero, no wrangler invocation, no registry/Bordbuch mutation beyond an operation record (RFC-0362).
- wrangler non-zero exit → propagation state `failed`, Bordbuch entry appended, registry `lastPropagated` untouched.
- Health check unhealthy after retries → exit non-zero, `lastPropagated.<channel>.healthy: false`; the deploy is NOT rolled back automatically (the alt channel exists precisely to absorb this).
- Main-channel gate violation → exit non-zero with a diagnostic naming the missing/unhealthy alt propagation.
- Artifact store miss (no manifest, hash mismatch) → exit non-zero naming `artifact.store.validate` as the next step.

## Rollout

1. Land ontology schema changes (`channels`, adapter enum without `cloudflare-pages`). The registry is empty (`systems: []`), so no data migration exists — this is the cheapest possible moment for the breaking schema change.
2. Implement the adapter with an injectable `CommandRunner` so tests stub wrangler.
3. Wire preflight, channel gating, and rehydration into the four commands.
4. Cover with unit tests: channel gate, preflight failures, health verdict mapping, rehydration path, secret redaction.
5. First real invocation happens in the RFC-0381 pilot (warpgogol-com r000001 → alt → main).

## Alternatives considered

- **Implement `cloudflare-pages` as RFC-0358 originally named.** Rejected: RFC-0149 retired the Pages form; the ecosystem deploys single Workers. Keeping the name would codify a dead platform shape.
- **Deploy via Cloudflare REST API instead of wrangler.** Rejected: wrangler is already the proven deploy path for `warpgogol-com` (`deploy:alt`/`deploy:main` scripts), handles bundling/limits/secrets natively, and is pinned in the workspace. The adapter seam allows an API-based adapter later without a contract change.
- **Traffic-split canary on one Worker.** Rejected for this wave: adds runtime routing complexity; the alt Worker already provides a full-fidelity staging environment. Canary remains a future adapter extension.
- **Automatic rollback on failed health check.** Rejected: on the alt channel rollback is pointless (nothing user-facing broke); on main it can mask a bad _previous_ release. Rollback stays an explicit operator/agent decision.

## Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| wrangler output format or flags drift across versions | Medium | The adapter pins behavior to the workspace-declared wrangler version and asserts on exit code + deployment URL presence, not on log text. |
| Health probes flake on cold Workers or propagation delay | Medium | Exponential backoff with bounded attempts; probe verdict distinguishes `unknown` (network) from `unhealthy` (content mismatch) — only content mismatch is a hard fail. |
| Secrets leak into logs or JSON output | High | Redaction is a tested invariant: output carries reference names only; the secrets file path is resolved late and never echoed. |
| Behavior snapshot facts too coarse for content verification | Low | The probe compares structural facts already defined by RFC-0269; if a snapshot lacks per-route hashes, the check degrades to status + structural parity and says so in the check detail. |
| Agents bypass the alt→main gate by editing the registry | Medium | `lastPropagated` is written only by the Leitstand under RFC-0362 locks; `sternsystem.validate` flags hand-edits via operation-record mismatch; `packages/AGENTS.md` rule below. |

## Acceptance criteria

- [x] `cloudflare-workers` adapter implemented with injectable command runner and unit tests (evidence: command registered in kernel module)
- [x] `resolveAdapter` throws `adapter-not-implemented` for `netlify` and any unimplemented adapter; only `cloudflare-workers` and `null` resolve to adapters (evidence: implemented historically)
- [x] `deploymentConfigSchema` carries `channels.alt?`/`channels.main` and `lastPropagated` with per-channel `state`/`operationId`/`leaseExpiresAt`; `cloudflare-pages` and `vercel` removed from the enum (evidence: implemented historically)
- [x] DNA-49 descriptive text in `docs/architecture-dna.md` updated from "MVP: Cloudflare Pages" to "MVP: Cloudflare Workers" (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `leitstand.propagate --channel main` refuses without a healthy alt propagation of the same release; no bypass flag exists (evidence: implemented historically)
- [x] `leitstand.status` shows both channels by default; optional `--channel` filters to one (evidence: implemented historically)
- [x] Preflight validates artifact hashes, channel presence, credential reference syntax, wrangler availability, and size limits before deploying (evidence: implemented historically)
- [x] Health verification selects probe routes in deterministic priority order and compares normalized probe responses against the release behavior snapshot with exponential-backoff retries (evidence: implemented historically)
- [x] Propagate and rollback rehydrate dist from the RFC-0363 artifact store when the local copy is absent or stale (evidence: implemented historically)
- [x] Secret values never appear in registry, output, or logs — covered by a redaction test (evidence: tests pass, vitest run exitCode=0)
- [x] Bordbuch entries record channel, verdicts, and release ids for every propagate/rollback/health run (evidence: implemented historically)
- [x] RFC-0358 deferred acceptance criteria are checked off with a reference to this RFC (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; run `site-kernel run rfc.verification.emit --id RFC-0379` and commit the evidence file in the same commit (RFC-0330).
- Agents MUST NOT add a `--force` or gate-bypass flag to `leitstand.propagate`.
- Agents MUST NOT write `deployment.lastPropagated` outside the Leitstand command handlers.
- Agents MUST NOT log, echo, or serialize secret values or resolved secrets-file contents; only secret reference names may appear in output.
- Agents MUST use `@gogol/fingerprint` for all hashing introduced here (DNA-53); `fingerprint.usage.lint` enforces this.
- All state files stay YAML per RFC-0376.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0379 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
