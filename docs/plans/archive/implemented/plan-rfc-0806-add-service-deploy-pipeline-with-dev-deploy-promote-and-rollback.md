---
rfcId: RFC-0806
planId: PLAN-RFC-0806-01
status: draft
owner: architecture
createdAt: 2026-08-11
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
    - "@warpgogol/werkstatt-site"
  services:
    - lagebild-sync
    - rate-fetcher
    - maturity-score
    - matomo-proxy
    - telegram-alert-bridge
  docs:
    - docs/architecture-dna.md
    - services/AGENTS.md
    - services/registry.yaml
    - .gitignore
---

# Implementation Plan: RFC-0806

## 1. Objectives

- [ ] Objective 1 — `deploy.preflight` supports `--dev` flag for `.env.dev` validation (maps to acceptance criterion: `deploy.preflight supports --dev flag`)
- [ ] Objective 2 — Three new commands (`dev-deploy`, `promote`, `rollback`) registered and functional (maps to acceptance criteria: command registration + successful deploys)
- [ ] Objective 3 — Pre-deploy gates block on failure (maps to acceptance criterion: pre-deploy gates block deployment)
- [ ] Objective 4 — Legacy commands removed: `leitstand.service.deploy`, `lagebild.worker.deploy` (maps to acceptance criteria: both removal checkboxes)
- [ ] Objective 5 — Dev Worker configs + health endpoints + registry schema + deploy scripts + `.gitignore` + DNA-40 + `services/AGENTS.md` (maps to remaining acceptance criteria)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/env/deploy-preflight.ts` — add `--dev` flag support
- `packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts` — register `--dev` flag in command table
- `packages/werkstatt/src/leitstand/service-deploy.ts` — remove `runLeitstandServiceDeploy` (replaced by promote)
- `packages/werkstatt/src/leitstand/index.ts` — remove `leitstand.service.deploy` registration, add `dev-deploy`, `promote`, `rollback` registrations
- `packages/werkstatt/src/leitstand/service-dev-deploy.ts` — new file: `runLeitstandServiceDevDeploy`
- `packages/werkstatt/src/leitstand/service-promote.ts` — new file: `runLeitstandServicePromote`
- `packages/werkstatt/src/leitstand/service-rollback.ts` — new file: `runLeitstandServiceRollback`
- `packages/werkstatt/src/leitstand/service-deploy-helpers.ts` — new file: shared helpers (lock, pre-deploy gates, health check, state recording)
- `packages/werkstatt/src/kernel/lagebild/handlers.ts` — remove `runLagebildWorkerDeploy`
- `packages/werkstatt/src/kernel/lagebild/lagebild.module.ts` — remove `lagebild.worker.deploy` command registration
- `services/*/wrangler.dev.jsonc` — new dev wrangler config per service
- `services/*/.env.dev.example` — new dev env template per env-consuming service
- `services/*/src/worker.ts` — add `/health` endpoint
- `services/*/package.json` — add `deploy:dev`, `deploy:prod`, `rollback` proxy scripts

### 2.2 Configuration and data

- `services/registry.yaml` — add `lastDevDeployed` field per service entry
- `.gitignore` — add `services/*/.deploy.lock` and `services/*/.env.dev` patterns

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — amend DNA-40 text to allow leitstand-command-based deploy scripts
- `services/AGENTS.md` — document new deployment pipeline commands

### 2.4 Validation and pipelines

- `pnpm exec werkstatt run rfc.validate --id RFC-0806`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm exec werkstatt run service.registry.validate`
- `pnpm exec werkstatt run service.naming.validate`

## 3. Step sequence

### Step 1. Contracts — TypeScript interfaces and shared types

**Goal:** Define the TypeScript interfaces for the three new commands and the registry schema extension.

**Agent actions:**

- Create `packages/werkstatt/src/leitstand/service-deploy-helpers.ts` with shared types: `PreDeployGateResult`, `ServiceDevDeployData`, `ServicePromoteData`, `ServiceRollbackData`, `ServiceRegistryEntry` (extended with `lastDevDeployed`).
- Add shared helper functions: `acquireLock`, `releaseLock`, `runPreDeployGates`, `runHealthCheck`, `recordDeployState`, `generateOperationId`.
- Export types from `packages/werkstatt/src/leitstand/index.ts`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — no type errors.

**Completion criterion:** Shared types and helpers compile without errors; `ServiceRegistryEntry` includes `lastDevDeployed` field.

**Human review:** no

---

### Step 2. Extend `deploy.preflight` with `--dev` flag

**Goal:** Add `--dev` boolean flag to `deploy.preflight` that switches target from `.env`/`.env.example` to `.env.dev`/`.env.dev.example`.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/env/deploy-preflight.ts`:
  - Read `--dev` flag from `input.flags`.
  - When `--dev` is true and `--service` is specified: set `targetPath` to `services/<id>/.env.dev`, `examplePath` to `services/<id>/.env.dev.example`.
  - When `--dev` is false (default): unchanged behavior (`.env` / `.env.example`).
  - Update `targetLabel` to reflect the dev file path.
  - Update module contract comment to mention RFC-0806 `--dev` flag.
- Edit `packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts`:
  - Add `dev` flag to `deploy.preflight` command registration: `{ kind: "boolean", description: "Validate .env.dev instead of .env (for dev deploys)." }`.
  - Update `reads` to include `.env.dev` and `.env.dev.example` patterns.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — no type errors.
- Manual: `pnpm exec werkstatt run deploy.preflight --service lagebild-sync --dev` — should fail with DEPLOY-PREFLIGHT-01 if `.env.dev` doesn't exist yet (expected at this step).

**Completion criterion:** `deploy.preflight --service <id> --dev` targets `.env.dev` / `.env.dev.example`; default behavior unchanged.

**Human review:** no

---

### Step 3. Service dev configs, health endpoints, and registry schema

**Goal:** Create `wrangler.dev.jsonc`, `.env.dev.example`, `/health` endpoint, and registry `lastDevDeployed` field for each Cloudflare Worker service.

**Agent actions:**

- For each service with a `wrangler.jsonc` (`lagebild-sync`, `rate-fetcher`, `maturity-score`, `matomo-proxy`, `telegram-alert-bridge`):
  - Create `services/<id>/wrangler.dev.jsonc` with `name: "<id>-dev"`, `main` matching production, `compatibility_date` matching production, `cron: ["* * * * *"]` for scheduled workers (omit cron for non-scheduled), `observability: { enabled: true }`.
  - If service has `.env.example`: create `services/<id>/.env.dev.example` with same keys but dev values (or placeholders with `# How to obtain:` comments).
  - Add `/health` endpoint to `services/<id>/src/worker.ts` (or equivalent entry point): if `url.pathname === "/health"`, return `new Response("ok", { status: 200 })`. For scheduled-only workers without a `fetch` handler, add a minimal `fetch` handler serving only `/health`.
- Update `services/registry.yaml`: add `lastDevDeployed` field to each service entry with `at: null`, `state: null`, `operationId: null`.
- Update `.gitignore`: add `services/*/.deploy.lock` and `services/*/.env.dev` patterns.

**Validation:**

- `pnpm exec werkstatt run service.registry.validate` — registry structure valid.
- `pnpm exec werkstatt run service.naming.validate` — naming consistency maintained.
- `pnpm --filter @warpgogol/werkstatt run build:check` — no type errors from registry schema changes.

**Completion criterion:** All 5 services have `wrangler.dev.jsonc`; env-consuming services have `.env.dev.example`; all Workers have `/health` endpoint; `services/registry.yaml` has `lastDevDeployed` per entry; `.gitignore` updated.

**Human review:** no

---

### Step 4. Implement `leitstand.service.dev-deploy` and `leitstand.service.promote`

**Goal:** Create the two main deployment commands with pre-deploy gates, lock mechanism, wrangler deploy, health check, and state recording.

**Agent actions:**

- Create `packages/werkstatt/src/leitstand/service-dev-deploy.ts`:
  - `runLeitstandServiceDevDeploy(input, context)` — follows RFC design §leitstand.service.dev-deploy:
    1. Acquire lock (`services/<id>/.deploy.lock`).
    2. Read registry, find service entry.
    3. Validate `wrangler.dev.jsonc` exists.
    4. Run pre-deploy gates: `service.naming.validate`, `service.registry.validate`, `services.check.run`, `build:check`, `deploy.preflight --service <id> --dev`.
    5. Execute `wrangler deploy --config wrangler.dev.jsonc --secrets-file .env.dev`.
    6. Health check: `fetch("https://<service>-dev.<account>.workers.dev/health")`.
    7. Record `lastDevDeployed` state in registry.
    8. Release lock.
    9. Return structured JSON.
- Create `packages/werkstatt/src/leitstand/service-promote.ts`:
  - `runLeitstandServicePromote(input, context)` — follows RFC design §leitstand.service.promote:
    1. Acquire lock.
    2. Read registry, find service entry.
    3. Validate `wrangler.jsonc` exists.
    4. Run pre-deploy gates: `service.naming.validate`, `service.registry.validate`, `services.check.run`, `build:check`, `deploy.preflight --service <id>`.
    5. `subdomain.validate` (best-effort) for services with `subdomains[]`.
    6. Execute `wrangler deploy --config wrangler.jsonc --secrets-file .env`.
    7. Health check: `fetch("https://<service>.<account>.workers.dev/health")`.
    8. Record `lastDeployed` state in registry.
    9. Release lock.
    10. Return structured JSON.
- Register both commands in `packages/werkstatt/src/leitstand/index.ts` with flags, reads, writes, `mutatesState: true`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — no type errors.
- Commands appear in kernel command table.

**Completion criterion:** Both commands registered, compile, and follow the RFC design step sequence.

**Human review:** no

---

### Step 5. Implement `leitstand.service.rollback`

**Goal:** Create the rollback command wrapping `wrangler rollback` with state recording.

**Agent actions:**

- Create `packages/werkstatt/src/leitstand/service-rollback.ts`:
  - `runLeitstandServiceRollback(input, context)` — follows RFC design §leitstand.service.rollback:
    1. Read registry, find service entry.
    2. Execute `wrangler rollback` from service directory using `wrangler.jsonc`.
    3. Record `lastDeployed` state with `state: "rolled-back"` in registry.
    4. Return structured JSON.
- Register command in `packages/werkstatt/src/leitstand/index.ts`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — no type errors.

**Completion criterion:** `leitstand.service.rollback` registered and compiles.

**Human review:** no

---

### Step 6. Remove legacy commands

**Goal:** Remove `leitstand.service.deploy` and `lagebild.worker.deploy` from the kernel command table and delete their handlers.

**Agent actions:**

- Remove `leitstand.service.deploy` registration from `packages/werkstatt/src/leitstand/index.ts`.
- Delete `packages/werkstatt/src/leitstand/service-deploy.ts` (or repurpose its helpers into `service-deploy-helpers.ts`).
- Remove `lagebild.worker.deploy` registration from `packages/werkstatt/src/kernel/lagebild/lagebild.module.ts`.
- Remove `runLagebildWorkerDeploy` from `packages/werkstatt/src/kernel/lagebild/handlers.ts`.
- Remove any imports of the deleted handlers.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — no type errors, no dangling imports.
- `pnpm exec werkstatt run rfc.validate --id RFC-0806` — no violations.

**Completion criterion:** Neither command appears in the kernel command table; no compilation errors from removed code.

**Human review:** no

---

### Step 7. Deploy scripts in `services/*/package.json`

**Goal:** Add `deploy:dev`, `deploy:prod`, `rollback` proxy scripts to each service's `package.json`.

**Agent actions:**

- For each Cloudflare Worker service (`lagebild-sync`, `rate-fetcher`, `maturity-score`, `matomo-proxy`, `telegram-alert-bridge`):
  - Edit `services/<id>/package.json` scripts section:
    - `"deploy:dev": "werkstatt run leitstand.service.dev-deploy --service <id>"`
    - `"deploy:prod": "werkstatt run leitstand.service.promote --service <id>"`
    - `"rollback": "werkstatt run leitstand.service.rollback --service <id>"`
    - Keep existing `"build:check": "tsc --noEmit"` if present.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — no type errors.
- `pnpm exec werkstatt run deploy.scripts.validate` — DNA-40 deploy script validation passes (scripts call leitstand commands, which satisfies the amended DNA-40).

**Completion criterion:** All 5 services have the three proxy scripts in `package.json`.

**Human review:** no

---

### Step 8. Documentation — DNA-40 and `services/AGENTS.md`

**Goal:** Amend DNA-40 text and update service-layer agent documentation.

**Agent actions:**

- Edit `docs/architecture-dna.md` DNA-40 section:
  - Amend the deploy script rule to: "deploy scripts MUST use `--secrets-file .env` (production) or `--secrets-file .env.dev` (dev) and be prefixed with `deploy.preflight` — OR call a leitstand command (`leitstand.service.dev-deploy`, `leitstand.service.promote`) that internally runs `deploy.preflight`. Leitstand-command-based deploy scripts satisfy DNA-40."
  - Add note about `.env.dev` / `.env.dev.example` for dev deploys.
- Edit `services/AGENTS.md`:
  - Document the 3-command deployment pipeline (`dev-deploy`, `promote`, `rollback`).
  - Document pre-deploy gates.
  - Document `wrangler.dev.jsonc` and `.env.dev` conventions.
  - Document `/health` endpoint requirement.
  - Document lock mechanism.
  - Remove references to `leitstand.service.deploy` (replaced by `promote`).
  - Remove references to `lagebild.worker.deploy` (removed).

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0806` — no violations.
- `pnpm exec werkstatt run env.contract.validate` — DNA-40 contract validation passes with amended text.

**Completion criterion:** DNA-40 text amended; `services/AGENTS.md` documents the new pipeline; no validation violations.

**Human review:** no

---

### Step 9. Tests

**Goal:** Write unit tests for the new commands and the `deploy.preflight` `--dev` flag.

**Agent actions:**

- Write test file `packages/werkstatt/src/leitstand/tests/service-dev-deploy.test.ts`:
  - Test: pre-deploy gates run and block on failure.
  - Test: lock acquisition and release.
  - Test: health check after deploy.
  - Test: state recording in registry.
- Write test file `packages/werkstatt/src/leitstand/tests/service-promote.test.ts`:
  - Test: pre-deploy gates run and block on failure.
  - Test: subdomain.validate best-effort behavior.
  - Test: state recording in registry.
- Write test file `packages/werkstatt/src/leitstand/tests/service-rollback.test.ts`:
  - Test: wrangler rollback called.
  - Test: state recording with `rolled-back` state.
- Write test file `packages/werkstatt-site/src/checks/tests/deploy-preflight-dev.test.ts`:
  - Test: `--dev` flag targets `.env.dev` / `.env.dev.example`.
  - Test: default (no `--dev`) targets `.env` / `.env.example` (unchanged).
  - Test: `--dev` with missing `.env.dev` reports DEPLOY-PREFLIGHT-01.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — all tests compile.
- `pnpm --filter @warpgogol/werkstatt test` — all tests pass.
- `pnpm --filter @warpgogol/werkstatt-site test` — all tests pass.

**Completion criterion:** All new tests pass; existing tests still pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files (root, `packages/werkstatt/`, `services/`) with new commands and removal of legacy commands.
- Update affected `docs/*.xml` Compass files if command surfaces or pipeline topology changed.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0806 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0806`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm exec werkstatt run service.registry.validate`
- `pnpm exec werkstatt run service.naming.validate`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0806`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm exec werkstatt run service.registry.validate`
- `pnpm exec werkstatt run service.naming.validate`
- `pnpm exec werkstatt run deploy.scripts.validate`
- `pnpm --filter @warpgogol/werkstatt test`
- `pnpm --filter @warpgogol/werkstatt-site test`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0806.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0806` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Two Workers per service (cost) | Step 3: dev Workers use `wrangler.dev.jsonc` with short cron; operator runs `wrangler delete` after testing |
| Pre-deploy gate performance (10-30s) | Step 4: gates run in sequence, combined time acceptable for pre-deploy (not per-file-save) |
| `.env.dev` secrets management | Step 3: `.env.dev.example` with `# How to obtain:` instructions; Step 2: `deploy.preflight --dev` validates |
| `wrangler.dev.jsonc` maintenance | Step 3: dev config is minimal (name, main, compatibility_date, cron); production is source of truth |
| `/health` on scheduled-only workers | Step 3: minimal `fetch` handler serving only `/health`, no business logic |
| Lock file stale detection | Step 1: 10-minute stale threshold in shared helper; threshold is configurable |
| `lagebild.worker.deploy` removal breaks callers | Step 6: no CI references (checked); manual callers switch to `leitstand.service.promote` |
| `leitstand.service.deploy` removal breaks callers | Step 6: callers switch to `leitstand.service.promote` (same behavior + pre-deploy gates) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-40 that the amendment does not cover, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0806 --reason "..." --invariant "DNA-40"` instead of working around it.
- If `wrangler deploy --config wrangler.dev.jsonc` is not supported by the wrangler version in use, escalate to the operator — the dev Worker config approach may need a `--name` override instead.
- If `wrangler rollback` requires a deployment ID (not available via CLI), escalate — the rollback command may need to use the Cloudflare API instead.
