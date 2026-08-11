---
id: service-deploy-pipeline
title: "Service deployment pipeline: dev-deploy, pre-deploy gates, and promote to production"
createdAt: 2026-08-11
status: resolved
related:
  - RFC-0751
  - RFC-0805
  - RFC-0628
  - DNA-40
---

# Exploration: Service deployment pipeline — dev-deploy, pre-deploy gates, and promote to production

## Idea

The operator wants a unified, reliable deployment pipeline for backend services (`services/*` Cloudflare Workers) analogous to the existing site deployment pipeline (`leitstand.dev-deploy` → `leitstand.propagate` → `leitstand.promote`). The pipeline should:

1. **Pre-deploy validation** — run all relevant validators before deploying a service.
2. **Dev deploy** — deploy a service to a dev environment for testing before production.
3. **Promote to production** — after verifying the dev deployment, promote to production.
4. **Post-deploy verification** — health checks and state recording after each deploy.
5. **Unified workshop** — the same workshop handles both site and service deployments.

The operator specifically asked: "Should we deploy directly via wrangler deploy, or through new commands like we do for site missions?" and "Do we need a dev deploy for workers, like we have for sites?"

## Codebase findings

### Existing site deployment pipeline (3-channel model)

The site pipeline uses a **3-channel model** (dev → alt → main) with release manifests:

| Command | Purpose | Key steps |
| --- | --- | --- |
| `leitstand.dev-deploy` | Deploy workpiece to dev channel | Build → wrangler deploy → health check → Axiom verification gate |
| `leitstand.propagate` | Deploy published release to alt channel | Verify Axiom evidence → wrangler deploy → health check |
| `leitstand.promote` | Promote alt-deployed release to main | CDN freshness → build-identity verification → wrangler deploy → health check |
| `leitstand.rollback` | Rollback to previous release | Auto-detect channel → wrangler deploy |
| `leitstand.status` | Show deployment state for all channels | Read system-state.yaml |
| `leitstand.health` | Health check against deployed channel | fetch + behavior snapshot |

**Key infrastructure:**

- `DeploymentAdapter` interface (`@/leitstand/adapter.ts:62-70`) — `propagate()`, `rollback()`, `health()`, `getLimits()`
- `Channel` type: `"dev" | "alt" | "main"`
- Release manifests in `releases/<id>/release.yaml` with state machine: `draft → ready → alt-deployed → promoted`
- Axiom evidence gate between dev and alt (RFC-0628)
- Build-identity verification between alt and main (RFC-0608)
- CDN freshness verification (RFC-0724)
- Lock mechanism via `acquireLock`/`releaseLock`
- Bordbuch event recording

### Existing service deployment (RFC-0751)

`leitstand.service.deploy --service <id>` (`@/leitstand/service-deploy.ts:97-305`) is the **single production deploy** command. It:

1. Reads `services/registry.yaml` to find the service entry
2. Runs `deploy.preflight` (env validation)
3. Runs `subdomain.validate` (RFC-0752, best-effort)
4. Executes `wrangler deploy` directly (no build step, no release manifest)
5. Runs health check (if `publicEndpoints: true`)
6. Records `lastDeployed` state in `services/registry.yaml`

**Key differences from site pipeline:**

- **No channels** — single production deploy, no dev/alt/main
- **No release manifests** — no `release.yaml`, no state machine
- **No Axiom gate** — services have no visitor-facing HTML to audit
- **No build step** — services deploy source directly via `wrangler deploy`
- **No CDN freshness** — Workers are not cached behind CDN
- **No build-identity** — no `build-identity.json` endpoint
- **No lock mechanism** — assumed single-operator (RFC-0751 nonGoal)
- **No Bordbuch** — services don't write to Bordbuch

### Duplicate deploy command: `lagebild.worker.deploy`

`lagebild.worker.deploy` (`@/kernel/lagebild/handlers.ts:419-477`) is a **legacy duplicate** of `leitstand.service.deploy` that:

- Only works for `lagebild-sync` (hardcoded path)
- Runs `deploy.preflight` via `npx site-kernel` (old CLI, not `executeKernelCommand`)
- Runs `wrangler deploy --secrets-file .env` directly
- No health check, no state recording, no subdomain validation
- No registry integration

This should be **deprecated and removed** — `leitstand.service.deploy --service lagebild-sync` supersedes it entirely.

### Service registry

`services/registry.yaml` contains 5 services:

| Service | Kind | Public endpoints | Secrets | Last deployed |
| --- | --- | --- | --- | --- |
| `matomo-proxy` | proxy-worker | yes | yes (`.env`) | never |
| `rate-fetcher` | scheduled-worker | no | yes (`.env.example` exists, `.env` missing) | never |
| `lagebild-sync` | scheduled-worker | no | yes (`.env`) | never |
| `telegram-alert-bridge` | proxy-worker | yes | unknown | never |
| `maturity-score` | cloudflare-worker | yes | no (stub) | never |

### Pre-deploy validators available

| Validator | Purpose | Blocking? |
| --- | --- | --- |
| `deploy.preflight` | Env file exists, all keys present, no empty values | Yes (already in pipeline) |
| `service.naming.validate` | SVC-NAME-01..06: id=workerName=dir=pkg name, no -worker suffix | Not in deploy pipeline |
| `service.registry.validate` | SVC-REG-01..05: registry structure, required fields, duplicates | Not in deploy pipeline |
| `services.check.run` | Orchestrates workspace validate + runner validate + naming validate | Not in deploy pipeline |
| `services.workspace.validate` | SERVICES-01..10: workspace config, package.json, service.config.yaml | Not in deploy pipeline |
| `deploy.scripts.validate` | DNA-40: deploy scripts use `--secrets-file .env` + `deploy.preflight` prefix | Not in deploy pipeline |
| `build:check` (tsc --noEmit) | TypeScript type checking | Not in deploy pipeline |

### DNA-40 contract

DNA-40 requires:

- `services/*/package.json` deploy scripts MUST use `--secrets-file .env` and be prefixed with `deploy.preflight`
- Services with `.env.example` MUST have `.env` on disk
- Enforced by `env.contract.validate`, `env.local.check`, `deploy.scripts.validate`, `deploy.preflight`

**Current gap:** No `services/*/package.json` has a `deploy` script. The deploy is done via `leitstand.service.deploy` kernel command, not via npm script. DNA-40 says deploy scripts MUST exist — but RFC-0751 says "no per-service `deploy` script remains" (file system responsibilities table). This is a **contradiction** that needs resolution.

### `check-runner` — non-Worker service

`check-runner` is a `node-runner` service (not a Cloudflare Worker). It uses `tsx src/worker.ts` for dev and has no `wrangler.jsonc`. The service deploy pipeline should only cover Cloudflare Worker services (RFC-0751 nonGoal confirms this).

### `wrangler dev` — local development

Cloudflare Workers have `wrangler dev` for local development testing. This runs the Worker on `localhost` with local secrets. It's already available but not integrated into any pipeline command.

## Options

### Option 1: Full 3-channel service pipeline (mirror sites)

- **Approach:** Create `leitstand.service.dev-deploy`, `leitstand.service.propagate`, `leitstand.service.promote` mirroring the site pipeline. Services get release manifests, channels (dev/alt/main), Axiom gates (adapted for API endpoints), build-identity, and Bordbuch.
- **Trade-offs:**
  - **Pros:** Maximum parity with sites. Full audit trail. Promote-with-verification.
  - **Cons:** Massive complexity. Services don't have HTML to audit (Axiom doesn't apply). No CDN (freshness checks don't apply). No build step (no dist to hash). Release manifests for source-only Workers add overhead without value. Most services are scheduled workers with no public endpoints — channels provide no testing surface.
- **DNA alignment:** DNA-40 (deploy scripts), DNA-44 (Sternsystem bundle — services are not Sternsystemen)
- **Blockers:** Axiom gate doesn't apply to Workers. Build-identity has no equivalent for `wrangler deploy` (no dist). CDN freshness is irrelevant.
- **Estimated effort:** Large — 3 new commands, release manifest schema for services, state machine, adapter extensions.

### Option 2: 2-stage pipeline — dev-deploy + promote

- **Approach:** Two new commands:
  - `leitstand.service.dev-deploy --service <id>` — runs pre-deploy gates (naming, registry, services.check.run, build:check, deploy.preflight), then `wrangler deploy` to a **dev Worker** (separate wrangler name with `-dev` suffix), health check, state recording.
  - `leitstand.service.promote --service <id>` — runs pre-deploy gates again, then `wrangler deploy` to the **production Worker** (bare name), health check, state recording.

  No release manifests, no Axiom, no CDN freshness. The "dev" Worker is a separate Cloudflare Worker with a `-dev` suffix (e.g. `lagebild-sync-dev`). The operator tests the dev Worker, then promotes to production.

- **Trade-offs:**
  - **Pros:** Simple 2-stage model. Dev Worker for testing. Pre-deploy gates catch issues early. No release manifest overhead. Reuses existing `leitstand.service.deploy` infrastructure.
  - **Cons:** No audit trail between dev and promote (just registry state). No build-identity verification. Requires managing two Workers per service (dev + prod). Dev Worker secrets need separate `.env.dev` or shared `.env`.
- **DNA alignment:** DNA-40 (deploy scripts)
- **Blockers:** Need to decide: does `wrangler.jsonc` get a `name` override for dev deploys? Or do we use a separate `wrangler.dev.jsonc`? How are dev Worker secrets managed?
- **Estimated effort:** Medium — 2 new commands, dev/prod Worker naming convention, pre-deploy gate integration, state tracking.

### Option 3: Enhanced single-deploy with pre-deploy gates (no channels)

- **Approach:** Enhance `leitstand.service.deploy` to run all pre-deploy gates (service.naming.validate, service.registry.validate, services.check.run, build:check, deploy.preflight) before `wrangler deploy`. No dev channel, no promote. Remove `lagebild.worker.deploy` duplicate. Add deploy scripts to `package.json` per DNA-40.
- **Trade-offs:**
  - **Pros:** Minimal change. No new commands. Pre-deploy gates catch issues. Keeps RFC-0751's single-channel model. Fastest to implement.
  - **Cons:** No dev testing before production. Operator must test locally via `wrangler dev` before deploying. No promote workflow. Doesn't address the operator's request for a dev-deploy analogy.
- **DNA alignment:** DNA-40 (deploy scripts)
- **Blockers:** None — this is mostly incremental on RFC-0751.
- **Estimated effort:** Small — enhance existing command, add deploy scripts, remove duplicate.

### Option 4: Dev-deploy via `wrangler dev` + production deploy with gates

- **Approach:** Two commands:
  - `leitstand.service.dev --service <id>` — starts `wrangler dev` locally with pre-deploy gate checks (naming, registry, build:check). This is a **local dev server** for the Worker, not a deployed dev Worker. Operator tests locally.
  - `leitstand.service.deploy --service <id>` — enhanced with all pre-deploy gates, then `wrangler deploy` to production.

  No separate dev Worker. No promote. The "dev" stage is local `wrangler dev` (already available), just wrapped with pre-deploy validation.

- **Trade-offs:**
  - **Pros:** No dev Worker to manage. No secrets duplication. `wrangler dev` is already the Cloudflare-recommended local dev workflow. Pre-deploy gates on both commands. Simple.
  - **Cons:** No remote dev environment for testing with real cron triggers. Local `wrangler dev` doesn't test scheduled triggers reliably. No promote workflow. Operator must run `wrangler dev` locally — can't test from CI.
- **DNA alignment:** DNA-40 (deploy scripts)
- **Blockers:** `wrangler dev` is a long-running process — the command would need to be a spawn-with-inherit-stdio command, not a pipeline step.
- **Estimated effort:** Small-medium — 1 new command (dev), enhance existing deploy.

### Option 5: Dev-deploy to remote dev Worker + promote with rollback

- **Approach:** Three commands:
  - `leitstand.service.dev-deploy --service <id>` — pre-deploy gates + `wrangler deploy --name <service>-dev` (remote dev Worker) + health check + state recording in registry.
  - `leitstand.service.promote --service <id>` — pre-deploy gates + `wrangler deploy` (production Worker) + health check + state recording + rollback capability (previous version tracked).
  - `leitstand.service.rollback --service <id>` — `wrangler rollback` on production Worker.

  Dev Worker uses `wrangler.jsonc` with `name: "<service>-dev"`. Production uses `name: "<service>"`. Secrets shared from same `.env`. Registry tracks `lastDevDeployed` and `lastProdDeployed` separately.

- **Trade-offs:**
  - **Pros:** Remote dev Worker for real testing (including cron triggers). Promote workflow. Rollback. Pre-deploy gates. State tracking. No release manifest overhead. Reuses `wrangler rollback` for safety.
  - **Cons:** Two Workers per service (cost). Dev Worker secrets management. Need `wrangler.dev.jsonc` or `--name` override. More complex than Option 3.
- **DNA alignment:** DNA-40 (deploy scripts)
- **Blockers:** Need to decide on dev Worker naming convention and secrets management. Need `wrangler.dev.jsonc` or dynamic name override.
- **Estimated effort:** Medium — 3 new commands, dev Worker config, registry schema extension, rollback integration.

## Recommendation

**Option 5** (dev-deploy + promote + rollback) best matches the operator's vision while staying practical for Workers:

1. **Dev-deploy to remote dev Worker** — gives the operator a real remote testing surface (including cron triggers for scheduled workers). This is the direct analogue of `leitstand.dev-deploy` for sites.
2. **Promote to production** — after verifying the dev Worker, promote to production with pre-deploy gates. This is the analogue of `leitstand.promote`.
3. **Rollback** — `wrangler rollback` provides safety. This is the analogue of `leitstand.rollback`.
4. **Pre-deploy gates on both** — service.naming.validate, service.registry.validate, services.check.run, build:check, deploy.preflight. All blocking.
5. **No release manifests** — Workers deploy source directly, no dist to hash. State is tracked in `services/registry.yaml`.
6. **No Axiom** — services have no visitor-facing HTML. Health checks replace Axiom as the verification gate.
7. **Remove `lagebild.worker.deploy`** — superseded by `leitstand.service.deploy` / `leitstand.service.dev-deploy`.

**Key design decisions to resolve in RFC:**

- Dev Worker naming: `<service>-dev` suffix
- Dev Worker config: separate `wrangler.dev.jsonc` or `--name` override flag
- Secrets: shared `.env` or separate `.env.dev`
- Registry schema: `lastDevDeployed` + `lastProdDeployed` fields
- Deploy scripts in `package.json`: proxy scripts calling `leitstand.service.dev-deploy` / `leitstand.service.promote`
- DNA-40 contradiction: RFC-0751 says "no per-service deploy script" but DNA-40 says "deploy scripts MUST exist". Need to resolve — likely by adding proxy scripts that call the leitstand commands.

## Resolved decisions (operator feedback 2026-08-11)

1. **Dev Worker config** — separate `wrangler.dev.jsonc` with `name: "<service>-dev"`. Clean separation, two files to maintain.
2. **No `wrangler.example.jsonc`** — not needed. `wrangler.jsonc` contains no secrets (secrets go through `.env`), so it's safe to commit and serves as its own example. Scaffold templates are the responsibility of `service.scaffold`, not per-service example files.
3. **Secrets** — separate `.env.dev` + `.env.dev.example` for dev-deploy, `.env` + `.env.example` for production. `deploy.preflight` extended: checks `.env.dev` for dev-deploy, `.env` for promote.
4. **Cron on dev** — short interval (`"* * * * *"` = every minute) in `wrangler.dev.jsonc` instead of production schedule. Enables rapid testing of scheduled workers.
5. **Health check** — add minimal `/health` endpoint to all Workers (including `publicEndpoints: false` services). Workers have public URLs by default. Health check does `fetch("https://<worker>.workers.dev/health")` after deploy.
6. **DNA-40 contradiction** — resolved with proxy scripts + DNA-40 amend. `services/*/package.json` gets `deploy:dev` and `deploy:prod` scripts that call `werkstatt run leitstand.service.dev-deploy --service <id>` and `werkstatt run leitstand.service.promote --service <id>`. DNA-40 amended: deploy scripts MAY call leitstand commands, not just wrangler directly.
7. **Non-Worker services** — `check-runner` (node-runner) excluded. Pipeline covers Cloudflare Worker services only (RFC-0751 nonGoal).
8. **Bordbuch** — no. Services are not Sternsystemen. State tracked in `services/registry.yaml`.
9. **Lock mechanism** — yes. Lock for dev-deploy and promote. Lock file at `services/<id>/.deploy.lock`.
10. **Rollback** — yes, create `leitstand.service.rollback --service <id>` now. Calls `wrangler rollback`, records state in registry.

## Next step

Create an RFC amending RFC-0751 to implement the 3-command service deployment pipeline:

- `leitstand.service.dev-deploy --service <id>` — pre-deploy gates → `wrangler deploy` to dev Worker (`wrangler.dev.jsonc` + `.env.dev`) → health check (`/health`) → state recording
- `leitstand.service.promote --service <id>` — pre-deploy gates → `wrangler deploy` to production Worker (`wrangler.jsonc` + `.env`) → health check (`/health`) → state recording
- `leitstand.service.rollback --service <id>` — `wrangler rollback` → state recording

Pre-deploy gates (all blocking): `service.naming.validate`, `service.registry.validate`, `services.check.run`, `build:check`, `deploy.preflight`.

Remove `lagebild.worker.deploy` duplicate. Add proxy deploy scripts to `services/*/package.json`. Amend DNA-40.
