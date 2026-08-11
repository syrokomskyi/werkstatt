---
id: RFC-0806
title: "Add service deployment pipeline with dev-deploy, promote, and rollback"
status: implemented
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
createdAt: 2026-08-11
updatedAt: 2026-08-11
enhancedAt: 2026-08-11
implementedAt: 2026-08-11
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0751
amendedBy: []
related:
  - DNA-40
  - RFC-0628
  - RFC-0751
  - RFC-0805
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-40
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed:
    - leitstand.service.dev-deploy
    - leitstand.service.promote
    - leitstand.service.rollback
  added: []
  changed:
    - deploy.preflight
  removed:
    - lagebild.worker.deploy
    - leitstand.service.deploy
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "Any `services/*` Cloudflare Worker can be deployed to a dev Worker via `leitstand.service.dev-deploy --service <id>` with pre-deploy gates blocking on failure."
  - "Any `services/*` Cloudflare Worker can be promoted to production via `leitstand.service.promote --service <id>` with pre-deploy gates blocking on failure."
  - "Any `services/*` Cloudflare Worker can be rolled back via `leitstand.service.rollback --service <id>`."
  - "Pre-deploy gates (service.naming.validate, service.registry.validate, services.check.run, build:check, deploy.preflight) run before every dev-deploy and promote, blocking on any failure."
  - "Dev Workers use `<service>-dev` naming convention with `wrangler.dev.jsonc` config and `.env.dev` secrets."
  - "All Cloudflare Worker services have a `/health` endpoint for post-deploy health checks."
  - "`lagebild.worker.deploy` duplicate command is removed — `leitstand.service.*` commands supersede it."
  - "`leitstand.service.deploy` is removed — `leitstand.service.promote` replaces it with pre-deploy gates."
  - "`services/*/package.json` has `deploy:dev` and `deploy:prod` proxy scripts calling leitstand commands."
  - "DNA-40 is amended to allow leitstand-command-based deploy scripts, not just direct wrangler calls."
nonGoals:
  - "Do not implement release manifests for services — Workers deploy source directly, no dist to hash."
  - "Do not implement Axiom evidence gates for services — services have no visitor-facing HTML to audit."
  - "Do not implement CDN cache purge for services — Workers are not cached behind CDN."
  - "Do not implement build-identity verification — services have no build step."
  - "Do not implement Bordbuch event recording for service deploys — services are not Sternsystemen."
  - "Do not register non-Cloudflare-Worker services (node-runner, compose-stack) — this pipeline covers Cloudflare Worker services only."
  - "Do not implement multi-tenant dev Worker routing — dev Workers use `<account>.workers.dev` URLs only."
---

# RFC-0806: Add service deployment pipeline with dev-deploy, promote, and rollback

## Context

RFC-0751 established the service deployment protocol with `leitstand.service.deploy` — a single production deploy command. The operator now wants a **multi-stage deployment pipeline** for services analogous to the site pipeline (`leitstand.dev-deploy` → `leitstand.propagate` → `leitstand.promote`), with:

1. **Pre-deploy validation gates** — naming, registry, workspace, build, and env validation before every deploy.
2. **Dev deploy** — deploy to a remote dev Worker for testing before production.
3. **Promote to production** — after verifying the dev deployment, promote to production.
4. **Rollback** — roll back to the previous Worker version.
5. **Post-deploy verification** — health checks via `/health` endpoint on all Workers.

The exploration note at `docs/explorations/service-deploy-pipeline.md` documents the full analysis and operator decisions.

### Current gaps

- **No pre-deploy gates**: `leitstand.service.deploy` (RFC-0751) only runs `deploy.preflight` and `subdomain.validate`. It does not run `service.naming.validate`, `service.registry.validate`, `services.check.run`, or `build:check`.
- **No dev deploy**: No way to deploy a service to a dev Worker for testing before production.
- **No promote**: No promote workflow from dev to production.
- **No rollback**: No `leitstand.service.rollback` command. RFC-0751 nonGoal says "use `wrangler rollback` directly".
- **No health check for scheduled workers**: `publicEndpoints: false` services skip health checks entirely.
- **Duplicate command**: `lagebild.worker.deploy` duplicates `leitstand.service.deploy` for a single service.
- **DNA-40 contradiction**: DNA-40 requires deploy scripts in `package.json`, but RFC-0751 says "no per-service deploy script remains".
- **No lock**: RFC-0751 says "assumed single-operator" — no lock mechanism.

## Problem

The operator needs a reliable, multi-stage deployment pipeline for backend services that:

1. **Catches issues early** — pre-deploy gates block deployment if naming, registry, build, or env validation fails.
2. **Enables iterative development** — dev Worker for testing before production, including cron triggers for scheduled workers.
3. **Provides rollback safety** — `wrangler rollback` wrapped in a leitstand command with state recording.
4. **Verifies post-deploy health** — `/health` endpoint on all Workers, including `publicEndpoints: false` services.
5. **Resolves DNA-40 contradiction** — proxy deploy scripts in `package.json` calling leitstand commands.

Without these, service deployment is a single-shot production deploy with no testing surface, no rollback, incomplete validation, and a DNA-40 contradiction.

## Decision

The platform gains a **3-command service deployment pipeline** amending RFC-0751:

1. **`leitstand.service.dev-deploy --service <id>`** — pre-deploy gates → `wrangler deploy` to dev Worker (`wrangler.dev.jsonc` + `.env.dev`) → health check (`/health`) → state recording.
2. **`leitstand.service.promote --service <id>`** — pre-deploy gates → `wrangler deploy` to production Worker (`wrangler.jsonc` + `.env`) → health check (`/health`) → state recording.
3. **`leitstand.service.rollback --service <id>`** — `wrangler rollback` → state recording.

Additionally:

4. **`leitstand.service.deploy`** (RFC-0751) is **removed** — superseded by `leitstand.service.promote`, which runs all pre-deploy gates before `wrangler deploy`. Existing callers switch to `leitstand.service.promote --service <id>`.
5. **`lagebild.worker.deploy`** is **removed** — superseded by `leitstand.service.dev-deploy` / `leitstand.service.promote`.
6. **`deploy.preflight`** is **extended** with `--dev` flag to support `.env.dev` for dev deploys.
7. **DNA-40** is **amended** — deploy scripts MAY call leitstand commands, not just wrangler directly.
8. **`/health` endpoint** is added to all Cloudflare Worker services.
9. **Lock mechanism** is added to dev-deploy and promote.

### Dev Worker configuration

Each Cloudflare Worker service gains a `wrangler.dev.jsonc` alongside the existing `wrangler.jsonc`:

```jsonc
// wrangler.dev.jsonc
{
  "name": "<service>-dev",
  "main": "src/worker.ts",
  "compatibility_date": "2026-08-11",
  "cron": ["* * * * *"],
  "observability": { "enabled": true }
}
```

Key differences from `wrangler.jsonc`:

- `name`: `<service>-dev` (not `<service>`)
- `cron`: `["* * * * *"]` (every minute, for rapid testing of scheduled workers)
- No custom routes or zones — dev Workers use `<account>.workers.dev` URLs only

### Dev secrets

Each service that consumes environment variables gains `.env.dev` + `.env.dev.example` alongside the existing `.env` + `.env.example`:

- `.env.dev` — secrets for the dev Worker (may point to dev Supabase project, dev API keys, etc.)
- `.env.dev.example` — documented template with `# How to obtain:` instructions, same contract as `.env.example`
- `deploy.preflight --service <id> --dev` validates `.env.dev` against `.env.dev.example`

### Health endpoint

All Cloudflare Worker services gain a minimal `/health` endpoint in their `fetch` handler:

```ts
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }
    // ... existing handler logic
  },
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    // ... existing scheduled logic
  },
} satisfies ExportedHandler<Env>;
```

This applies to **all** Workers, including `publicEndpoints: false` services — Workers have public `*.workers.dev` URLs by default.

### Registry schema extension

`services/registry.yaml` entries gain `lastDevDeployed` alongside the existing `lastDeployed`:

```yaml
services:
  - id: lagebild-sync
    kind: scheduled-worker
    workerName: lagebild-sync
    hostedBy: studio
    url: https://lagebild-sync.syrokomskyi.workers.dev
    publicEndpoints: false
    subdomains: []
    lastDeployed:
      at: null
      state: null
      operationId: null
    lastDevDeployed:
      at: null
      state: null
      operationId: null
```

### Lock mechanism

Dev-deploy and promote acquire a lock file at `services/<id>/.deploy.lock` before executing. The lock contains:

```json
{
  "operationId": "op-...",
  "command": "leitstand.service.dev-deploy",
  "startedAt": "2026-08-11T...",
  "pid": 12345
}
```

The lock is released after the command completes (success or failure). Stale locks (older than 10 minutes) are automatically removed.

### Deploy scripts in package.json

Each `services/*/package.json` gains proxy deploy scripts:

```json
{
  "scripts": {
    "build:check": "tsc --noEmit",
    "deploy:dev": "werkstatt run leitstand.service.dev-deploy --service <id>",
    "deploy:prod": "werkstatt run leitstand.service.promote --service <id>",
    "rollback": "werkstatt run leitstand.service.rollback --service <id>"
  }
}
```

These scripts do NOT call `wrangler` directly — they call leitstand commands which handle pre-deploy gates, wrangler deploy, health checks, and state recording.

### DNA-40 amendment

DNA-40 is amended:

> `services/*/package.json` deploy scripts MUST use `--secrets-file .env` (for production) or `--secrets-file .env.dev` (for dev) and be prefixed with `deploy.preflight` — OR call a leitstand command (`leitstand.service.dev-deploy`, `leitstand.service.promote`) that internally runs `deploy.preflight`. Leitstand-command-based deploy scripts satisfy DNA-40.

## Architectural fit

- **DNA-40**: Amended to allow leitstand-command-based deploy scripts. The env-example and deploy-script contract is extended, not replaced.
- **RFC-0751**: Amended — `leitstand.service.deploy` removed (superseded by `leitstand.service.promote`). New commands `dev-deploy`, `promote`, `rollback` added. `lagebild.worker.deploy` removed.
- **RFC-0628**: Site dev-deploy is workpiece-based. Service dev-deploy deploys from `services/<id>/` directly (no workpiece). Same concept (dev testing before production), different source.
- **RFC-0805**: Service naming validation (SVC-NAME-06) is already integrated. This RFC adds it as a blocking pre-deploy gate.

## Design

### leitstand.service.dev-deploy

1. **Acquire lock** — write `services/<id>/.deploy.lock`.
2. **Read registry** — find service entry by `--service <id>`.
3. **Validate dev config** — check `wrangler.dev.jsonc` exists in `services/<id>/`.
4. **Run pre-deploy gates** (all blocking):
   - `service.naming.validate` — naming consistency across registry, wrangler, config, package.json.
   - `service.registry.validate` — registry structure and cross-checks.
   - `services.check.run` — workspace validation, import rules, runner validation.
   - `build:check` — `tsc --noEmit` in the service directory.
   - `deploy.preflight --service <id> --dev` — validate `.env.dev` against `.env.dev.example`.
5. **Execute `wrangler deploy`** — `wrangler deploy --config wrangler.dev.jsonc` from the service directory, with `--secrets-file .env.dev`.
6. **Health check** — `fetch("https://<service>-dev.<account>.workers.dev/health")`, expect 200.
7. **Record state** — update `lastDevDeployed` in `services/registry.yaml`.
8. **Release lock** — remove `services/<id>/.deploy.lock`.
9. **Return result** — structured JSON with deploy and health state.

### leitstand.service.promote

1. **Acquire lock** — write `services/<id>/.deploy.lock`.
2. **Read registry** — find service entry by `--service <id>`.
3. **Validate prod config** — check `wrangler.jsonc` exists in `services/<id>/`.
4. **Run pre-deploy gates** (all blocking):
   - `service.naming.validate`
   - `service.registry.validate`
   - `services.check.run`
   - `build:check` — `tsc --noEmit` in the service directory.
   - `deploy.preflight --service <id>` — validate `.env` against `.env.example`.
   - `subdomain.validate` (RFC-0752, best-effort) — for services with `subdomains[]`.
5. **Execute `wrangler deploy`** — `wrangler deploy --config wrangler.jsonc` from the service directory, with `--secrets-file .env`.
6. **Health check** — `fetch("https://<service>.<account>.workers.dev/health")`, expect 200.
7. **Record state** — update `lastDeployed` in `services/registry.yaml`.
8. **Release lock** — remove `services/<id>/.deploy.lock`.
9. **Return result** — structured JSON with deploy and health state.

### leitstand.service.rollback

1. **Read registry** — find service entry by `--service <id>`.
2. **Execute `wrangler rollback`** — from the service directory, using `wrangler.jsonc` config.
3. **Record state** — update `lastDeployed` in `services/registry.yaml` with `state: "rolled-back"`.
4. **Return result** — structured JSON with rollback state.

### deploy.preflight extension

`deploy.preflight` gains a `--dev` boolean flag to switch the target from `.env` to `.env.dev`:

```sh
# Production (default)
werkstatt run deploy.preflight --service lagebild-sync
# validates .env against .env.example

# Dev
werkstatt run deploy.preflight --service lagebild-sync --dev
# validates .env.dev against .env.dev.example
```

When `--dev` is specified, the target file becomes `.env.dev` and the example file becomes `.env.dev.example`. Default (no flag) targets `.env` / `.env.example` (unchanged from RFC-0761). This does not reverse RFC-0761's removal of the `--env` file-path flag — `--dev` is a boolean mode switch, not a file path parameter.

### CLI surface

```sh
# Deploy a service to dev Worker
pnpm exec werkstatt run leitstand.service.dev-deploy --service lagebild-sync

# Promote a service to production
pnpm exec werkstatt run leitstand.service.promote --service lagebild-sync

# Rollback a service to previous version
pnpm exec werkstatt run leitstand.service.rollback --service lagebild-sync

# Per-service proxy scripts
cd services/lagebild-sync && pnpm deploy:dev
cd services/lagebild-sync && pnpm deploy:prod
cd services/lagebild-sync && pnpm rollback
```

### TypeScript contracts

```ts
interface ServiceDevDeployData {
  command: "leitstand.service.dev-deploy";
  serviceId: string;
  workerName: string; // "<service>-dev"
  deployState: "succeeded" | "failed";
  workersDevUrl: string;
  healthState: "healthy" | "unhealthy" | "unknown";
  preDeployGates: PreDeployGateResult[];
  startedAt: string;
  completedAt: string;
  operationId: string;
}

interface ServicePromoteData {
  command: "leitstand.service.promote";
  serviceId: string;
  workerName: string; // "<service>"
  deployState: "succeeded" | "failed";
  workersDevUrl: string;
  healthState: "healthy" | "unhealthy" | "unknown";
  preDeployGates: PreDeployGateResult[];
  startedAt: string;
  completedAt: string;
  operationId: string;
}

interface ServiceRollbackData {
  command: "leitstand.service.rollback";
  serviceId: string;
  workerName: string;
  rollbackState: "succeeded" | "failed";
  startedAt: string;
  completedAt: string;
  operationId: string;
}

interface PreDeployGateResult {
  command: string;
  passed: boolean;
  summary: string;
}

interface ServiceRegistryEntry {
  // ... existing fields from RFC-0751 ...
  lastDeployed: {
    at: string | null;
    state: "succeeded" | "failed" | "rolled-back" | null;
    operationId: string | null;
  };
  lastDevDeployed: {
    at: string | null;
    state: "succeeded" | "failed" | null;
    operationId: string | null;
  };
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `services/<id>/wrangler.jsonc` | Production wrangler config (existing, unchanged) |
| `services/<id>/wrangler.dev.jsonc` | New — dev wrangler config with `<service>-dev` name and short cron |
| `services/<id>/.env` | Production secrets (existing, unchanged) |
| `services/<id>/.env.example` | Production env template (existing, unchanged) |
| `services/<id>/.env.dev` | New — dev secrets |
| `services/<id>/.env.dev.example` | New — dev env template |
| `services/<id>/package.json` | Gains `deploy:dev`, `deploy:prod`, `rollback` proxy scripts |
| `services/<id>/src/worker.ts` | Gains `/health` endpoint in fetch handler |
| `services/<id>/.deploy.lock` | New — transient lock file, gitignored |
| `services/registry.yaml` | Gains `lastDevDeployed` field per service entry |
| `.gitignore` | Gains `services/*/.deploy.lock` and `services/*/.env.dev` patterns |

### Output format

```json
{
  "command": "leitstand.service.dev-deploy",
  "serviceId": "lagebild-sync",
  "workerName": "lagebild-sync-dev",
  "deployState": "succeeded",
  "workersDevUrl": "https://lagebild-sync-dev.syrokomskyi.workers.dev",
  "healthState": "healthy",
  "preDeployGates": [
    { "command": "service.naming.validate", "passed": true, "summary": "pass — 5 service(s) checked" },
    { "command": "service.registry.validate", "passed": true, "summary": "pass — 5 service(s) checked" },
    { "command": "services.check.run", "passed": true, "summary": "pass" },
    { "command": "build:check", "passed": true, "summary": "tsc --noEmit: 0 errors" },
    { "command": "deploy.preflight", "passed": true, "summary": "services/lagebild-sync/.env.dev OK (6 keys checked)" }
  ],
  "startedAt": "2026-08-11T17:30:00.000Z",
  "completedAt": "2026-08-11T17:30:20.000Z",
  "operationId": "op-abc123"
}
```

### Failure modes

- **Pre-deploy gate failure**: Blocks the deploy, records `deployState: "failed"`, releases lock, exits non-zero with gate-specific diagnostics.
- **`wrangler deploy` failure**: Records `deployState: "failed"`, releases lock, exits non-zero.
- **Health check failure**: Records `healthState: "unhealthy"`, releases lock, exits non-zero. The Worker is still deployed but the operator is alerted.
- **Lock acquisition failure**: Another deploy is in progress for this service. Exits non-zero with a clear message.
- **Stale lock**: Lock older than 10 minutes is automatically removed. Deploy proceeds.
- **Missing `wrangler.dev.jsonc`**: `dev-deploy` exits non-zero with a diagnostic.
- **Missing `.env.dev`**: `deploy.preflight --dev` catches this before `wrangler deploy` runs.
- **`wrangler rollback` failure**: Records `rollbackState: "failed"`, exits non-zero.

## Rollout

- **Default behavior**: All three new commands are available immediately for Cloudflare Worker services with a registry entry.
- **`leitstand.service.deploy` removal**: The command is removed from the kernel command table. Callers switch to `leitstand.service.promote --service <id>`.
- **`lagebild.worker.deploy` removal**: The command is removed from the kernel command table. Any callers should switch to `leitstand.service.dev-deploy --service lagebild-sync` or `leitstand.service.promote --service lagebild-sync`.
- **`wrangler.dev.jsonc` creation**: Each Cloudflare Worker service (`lagebild-sync`, `rate-fetcher`, `maturity-score`, `matomo-proxy`, `telegram-alert-bridge`) gets a `wrangler.dev.jsonc` with `<service>-dev` name and `cron: ["* * * * *"]` (for scheduled workers).
- **`.env.dev` creation**: Each service that consumes env vars gets `.env.dev.example` + `.env.dev`. Services without env vars (`maturity-score`) are exempt.
- **`/health` endpoint**: Each Worker's `fetch` handler gets a `/health` route. For services without a `fetch` handler (scheduled-only workers), a minimal `fetch` handler is added that only serves `/health`.
- **`package.json` deploy scripts**: Each `services/*/package.json` gets `deploy:dev`, `deploy:prod`, `rollback` proxy scripts.
- **Registry schema**: `services/registry.yaml` entries gain `lastDevDeployed` field.
- **`.gitignore`**: Add `services/*/.deploy.lock` and `services/*/.env.dev` patterns.
- **DNA-40 amendment**: Update `docs/architecture-dna.md` DNA-40 text to allow leitstand-command-based deploy scripts.
- **`deploy.preflight` extension**: Add `--dev` flag support. Default behavior (no flag) is unchanged from RFC-0761.

## Alternatives considered

- **Full 3-channel service pipeline (mirror sites)**: Rejected — services don't have HTML to audit (Axiom doesn't apply), no CDN (freshness checks don't apply), no build step (no dist to hash). Release manifests for source-only Workers add overhead without value.
- **Enhanced single-deploy with pre-deploy gates only (no channels)**: Rejected — doesn't address the operator's request for a dev-deploy analogy. No testing surface before production.
- **Dev-deploy via `wrangler dev` (local)**: Rejected — local `wrangler dev` doesn't test cron triggers reliably and can't be used from CI. Remote dev Worker provides a real testing surface.
- **No rollback**: Rejected — operator explicitly requested rollback. `wrangler rollback` is available and just needs leitstand wrapping with state recording.
- **No lock**: Rejected — operator explicitly requested lock. Low cost, high safety.

## Risks

- **Two Workers per service (cost)**: Each service has a dev Worker and a production Worker. Cloudflare Workers free tier includes 100,000 requests/day — dev Workers with `cron: ["* * * * *"]` (every minute) consume 1,440 requests/day even with no other traffic. Mitigated by: (1) dev Workers are only deployed when actively testing, not permanently; (2) run `wrangler delete --name <service>-dev` when testing is complete to stop cron consumption; (3) consider a longer cron interval (`*/5 * * * *` = every 5 minutes, 288 requests/day) for services that don't need per-minute testing.
- **Pre-deploy gate performance**: Five blocking gates run before every deploy. Estimated combined time: 10-30 seconds (dominated by `build:check` / `tsc --noEmit`). `service.naming.validate` and `service.registry.validate` are fast YAML parses (<1s each). `services.check.run` runs multiple validators (~5s). `build:check` is the slowest (~10-20s depending on service complexity). This is acceptable for a pre-deploy gate (not run on every file save) and is comparable to the site deployment pipeline's pre-deploy validation cost.
- **`.env.dev` secrets management**: Additional secrets file to manage. Mitigated by: `.env.dev.example` with `# How to obtain:` instructions, same contract as `.env.example`. `deploy.preflight` validates `.env.dev` against `.env.dev.example`.
- **`wrangler.dev.jsonc` maintenance**: Two wrangler configs per service. Mitigated by: dev config is minimal (name, main, compatibility_date, cron). Production config is the source of truth — dev config only overrides name and cron.
- **`/health` endpoint on scheduled-only workers**: Workers that only export `scheduled` need a `fetch` handler added. Mitigated by: minimal handler serving only `/health`, no business logic.
- **Lock file stale detection**: 10-minute threshold may be too short for slow deploys. Mitigated by: threshold is configurable, default 10 minutes is sufficient for `wrangler deploy` (typically <30 seconds).
- **`lagebild.worker.deploy` removal**: Any CI or scripts calling this command will break. Mitigated by: command is not used in CI (checked: no references in `.github/workflows/`). Manual callers switch to `leitstand.service.promote`.

## Acceptance criteria

- [x] `leitstand.service.dev-deploy` command registered in the kernel command table (evidence: `packages/werkstatt/src/leitstand/service-dev-deploy.ts`)
- [x] `leitstand.service.promote` command registered in the kernel command table (evidence: `packages/werkstatt/src/leitstand/service-promote.ts`)
- [x] `leitstand.service.rollback` command registered in the kernel command table (evidence: `packages/werkstatt/src/leitstand/service-rollback.ts`)
- [x] `leitstand.service.deploy` removed from the kernel command table (superseded by `leitstand.service.promote`) (evidence: `grep -r leitstand.service.deploy packages/werkstatt/src/leitstand/` returns zero handler)
- [x] `lagebild.worker.deploy` command removed from the kernel command table (evidence: `packages/werkstatt/src/kernel/lagebild/lagebild.module.ts` CHANGE_SUMMARY)
- [x] `deploy.preflight` supports `--dev` flag for `.env.dev` validation (evidence: `packages/werkstatt-site/src/checks/env/deploy-preflight.ts`)
- [x] Each Cloudflare Worker service has `wrangler.dev.jsonc` with `<service>-dev` name (evidence: `ls services/*/wrangler.dev.jsonc`)
- [x] Each env-consuming service has `.env.dev` + `.env.dev.example` (evidence: `ls services/*/.env.dev.example`)
- [x] Each Cloudflare Worker service has `/health` endpoint in its fetch handler (evidence: `grep -rn /health services/*/src/`)
- [x] `services/registry.yaml` entries have `lastDevDeployed` field (evidence: `grep lastDevDeployed services/registry.yaml`)
- [x] Each `services/*/package.json` has `deploy:dev`, `deploy:prod`, `rollback` proxy scripts (evidence: `grep deploy:dev services/*/package.json`)
- [x] `.gitignore` has `services/*/.deploy.lock` and `services/*/.env.dev` patterns (evidence: `grep deploy.lock .gitignore` + `.env*` covers `.env.dev`)
- [x] Lock mechanism prevents concurrent deploys for the same service (evidence: `packages/werkstatt/src/leitstand/service-deploy-helpers.ts:acquireServiceLock`)
- [x] `leitstand.service.dev-deploy --service lagebild-sync` successfully deploys to dev Worker (evidence: operator-confirmed dev deploy)
- [x] `leitstand.service.promote --service lagebild-sync` successfully deploys to production Worker (evidence: operator-confirmed production deploy)
- [x] Pre-deploy gates block deployment when any gate fails (evidence: `packages/werkstatt/src/leitstand/service-dev-deploy.ts` gate loop)
- [x] Health check via `/health` endpoint works for all Workers including `publicEndpoints: false` (evidence: `services/lagebild-sync/src/index.ts:23`)
- [x] DNA-40 text in `docs/architecture-dna.md` amended to allow leitstand-command-based deploy scripts (evidence: `grep RFC-0806 docs/architecture-dna.md`)
- [x] `services/AGENTS.md` updated with new deployment pipeline documentation (evidence: `grep deploy:dev services/AGENTS.md`)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0806 --json` exits 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The `leitstand.service.dev-deploy`, `leitstand.service.promote`, and `leitstand.service.rollback` commands live in `packages/werkstatt/src/leitstand/` (replacing the removed `leitstand.service.deploy`).
- The `deploy.preflight` extension lives in `packages/werkstatt-site/src/checks/env/deploy-preflight.ts`.
- The `lagebild.worker.deploy` removal is in `packages/werkstatt/src/kernel/lagebild/handlers.ts` — remove `runLagebildWorkerDeploy` and its command registration.
- The `leitstand.service.deploy` removal is in `packages/werkstatt/src/leitstand/index.ts` and `packages/werkstatt/src/leitstand/service-deploy.ts` — remove the command registration and the `runLeitstandServiceDeploy` function.
- The `wrangler.dev.jsonc` files are created per-service in `services/<id>/wrangler.dev.jsonc`.
- The `/health` endpoint is added to each Worker's `src/worker.ts` (or equivalent entry point).
- The registry schema extension (`lastDevDeployed`) is in `packages/werkstatt/src/schemas/` and `packages/werkstatt/src/sternsystem/registry-io.ts`.
- The lock mechanism is a simple file-based lock in `services/<id>/.deploy.lock` — no external dependency needed.
- **Implementation order**:
  1. Extend `deploy.preflight` with `--dev` flag.
  2. Create `wrangler.dev.jsonc` + `.env.dev.example` files for each service.
  3. Add `/health` endpoint to each Worker.
  4. Implement `leitstand.service.dev-deploy`.
  5. Implement `leitstand.service.promote`.
  6. Implement `leitstand.service.rollback`.
  7. Remove `leitstand.service.deploy` from the kernel command table.
  8. Remove `lagebild.worker.deploy`.
  9. Add deploy scripts to `services/*/package.json`.
  10. Update `services/registry.yaml` with `lastDevDeployed` field.
  11. Update `.gitignore`.
  12. Amend DNA-40 text.
  13. Update `services/AGENTS.md`.
