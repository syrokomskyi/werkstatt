---
rfcId: RFC-0826
planId: PLAN-RFC-0826-01
status: draft
owner: architecture
createdAt: 2026-08-13
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
    - "@warpgogol/werkstatt-site"
  services:
    - lagebild-sync
    - matomo-proxy
  docs:
    - services/AGENTS.md
---

# Implementation Plan: RFC-0826

## 1. Objectives

- [ ] O1 — `service.integration.run` command registered and functional — maps to acceptance criterion "service.integration.run command registered and functional"
- [ ] O2 — `test-env.ts` helper updated to read `.env.dev` instead of `.env.test` — maps to acceptance criterion "test-env.ts helper loads .env.dev files"
- [ ] O3 — Integration tests for `lagebild-sync` (health) pass against dev channel — maps to acceptance criterion "Integration tests for lagebild-sync (health) pass against dev channel"
- [ ] O4 — Integration tests for `matomo-proxy` (health, proxy) pass against dev channel — maps to acceptance criterion "Integration tests for matomo-proxy (health, proxy) pass against dev channel"
- [ ] O5 — `leitstand.service.dev-deploy` calls `service.integration.run` after smoke tests — maps to acceptance criterion "leitstand.service.dev-deploy calls service.integration.run after smoke tests (requires RFC-0825)"
- [ ] O6 — Integration test evidence recorded in dev-deploy state — maps to acceptance criterion "Integration test evidence recorded in dev-deploy state"
- [ ] O7 — `services/AGENTS.md` updated with integration test requirement — maps to acceptance criterion "services/AGENTS.md updated with integration test requirement and .env.dev reuse convention"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/testing/helpers/test-env.ts` — update to read `.env.dev` instead of `.env.test`; add `loadServiceDevEnv(serviceId, workspaceRoot)` function
- `packages/werkstatt-site/src/testing/integration/services/lagebild-sync/health.test.ts` — new integration test
- `packages/werkstatt-site/src/testing/integration/services/matomo-proxy/health.test.ts` — new integration test
- `packages/werkstatt-site/src/testing/integration/services/matomo-proxy/proxy.test.ts` — new integration test
- `packages/werkstatt-site/src/checks/command-tables/30-check-warpgogol.ts` — register `service.integration.run` command
- `packages/werkstatt-site/src/checks/services/service-integration-run.ts` — new command handler
- `packages/werkstatt/src/leitstand/service-dev-deploy.ts` — add `service.integration.run` call after health check (or after smoke tests if RFC-0825 is implemented first)
- `packages/werkstatt/src/leitstand/service-deploy-helpers.ts` — add `recordIntegrationTestEvidence` helper

### 2.2 Configuration and data

- `services/registry.yaml` — no changes needed (already has `workersDevUrl` and `healthCheckPath`)

### 2.3 Documentation and specs

- `services/AGENTS.md` — add integration test requirement and `.env.dev` reuse convention
- No `docs/*.xml` Compass sync needed (stated in RFC)

### 2.4 Validation and pipelines

- `service.integration.run` is a standalone workspace-scoped command (not in a pipeline)
- `leitstand.service.dev-deploy` calls it after health check as a warning (not fatal)
- Unit tests for the command handler in `packages/werkstatt-site/src/checks/tests/service-integration-run.test.ts`

## 3. Step sequence

### Step 1. Update `test-env.ts` helper to read `.env.dev`

**Goal:** Change the test env loader from `.env.test` to `.env.dev` to align with the RFC's decision to reuse existing dev credentials.

**Agent actions:**

- Update `loadTestEnv` in `packages/werkstatt-site/src/testing/helpers/test-env.ts` to read `.env.dev` instead of `.env.test`
- Add `loadServiceDevEnv(serviceId: string, workspaceRoot: string)` that reads `services/<serviceId>/.env.dev`
- Update the module contract comment to reflect `.env.dev` usage
- Update existing tests for `test-env.ts` if any reference `.env.test`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

**Completion criterion:** `loadTestEnv` reads from `.env.dev`; `loadServiceDevEnv` resolves service-specific `.env.dev`; TypeScript compiles; existing tests pass.

**Human review:** no

---

### Step 2. Implement `service.integration.run` command handler

**Goal:** Create the command handler that runs vitest integration tests for a service against its dev-deployed URL.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/services/service-integration-run.ts`
- Implement `runServiceIntegrationRun(input, context)` that:
  - Resolves `--service` flag
  - Resolves dev URL from `services/registry.yaml` via `resolveServiceDevUrl` (or `--url` override)
  - Discovers test files in `packages/werkstatt-site/src/testing/integration/services/<serviceId>/*.test.ts`
  - Runs vitest with `RUN_INTEGRATION_TESTS=1` env var, per-test timeout (default 60s), global timeout (default 180s)
  - Returns `ServiceIntegrationRunResult` with pass/fail status, test counts, duration, failures
  - Handles "no test files found" as a warning (not error)
  - Handles "no `.env.dev` file" as an error (services without env vars are exempt)
- Register the command in `packages/werkstatt-site/src/checks/command-tables/30-check-warpgogol.ts` as `service.integration.run` (workspace scope)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm exec werkstatt run rfc.validate --id RFC-0826`

**Completion criterion:** Command is registered, TypeScript compiles, `rfc.validate` passes.

**Human review:** no

---

### Step 3. Write unit tests for `service.integration.run`

**Goal:** Verify the command handler logic without making real HTTP requests.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/service-integration-run.test.ts`
- Test cases:
  - No service flag → error
  - Service not in registry → error
  - No test files found → warning (not error)
  - No `.env.dev` file → error (for services with env vars)
  - Service without env vars (e.g. `maturity-score`) → no `.env.dev` error
  - Successful run with passing tests → status: pass
  - Run with failing tests → status: fail
- Mock `resolveServiceDevUrl`, `loadServiceDevEnv`, and vitest runner

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test`

**Completion criterion:** All unit tests pass.

**Human review:** no

---

### Step 4. Write integration test files for `lagebild-sync` and `matomo-proxy`

**Goal:** Create the actual integration test files that will run against dev-deployed Workers.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/integration/services/lagebild-sync/health.test.ts`:
  - `describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)` guard
  - Test `/health` returns 200 with `{"status":"ok","service":"lagebild-sync"}`
- Create `packages/werkstatt-site/src/testing/integration/services/matomo-proxy/health.test.ts`:
  - Test `/_wg/analytics/health` returns 200
- Create `packages/werkstatt-site/src/testing/integration/services/matomo-proxy/proxy.test.ts`:
  - Test proxy forwards to Matomo correctly (verify response headers/body)
- Remove `.gitkeep` from `packages/werkstatt-site/src/testing/integration/services/`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- Integration tests are skipped without `RUN_INTEGRATION_TESTS=1`

**Completion criterion:** Test files exist, TypeScript compiles, tests are skipped by default.

**Human review:** no

---

### Step 5. Integrate `service.integration.run` into `leitstand.service.dev-deploy`

**Goal:** Call `service.integration.run` after the health check in `service-dev-deploy.ts` and record evidence.

**Agent actions:**

- In `packages/werkstatt/src/leitstand/service-dev-deploy.ts`, after the health check step (step 5), add:
  - Call `service.integration.run --service <id> --url <devUrl>` via `executeKernelCommand`
  - Integration test failure is a warning (not fatal) — log warning, continue
  - Record integration test evidence in dev-deploy state (`integrationTests` field in `ServiceDevDeployData`)
- Add `recordIntegrationTestEvidence` helper to `service-deploy-helpers.ts`
- Update `ServiceDevDeployData` type to include `integrationTests?: { status: string; testsPassed: number; testsFailed: number; durationMs: number }`
- **Note:** If RFC-0825 is not yet implemented, the integration call goes after the existing health check. When RFC-0825 is implemented, it will insert smoke tests before this step.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm exec werkstatt run rfc.validate --id RFC-0826`

**Completion criterion:** `service-dev-deploy.ts` calls `service.integration.run` after health check; TypeScript compiles.

**Human review:** no — but note that this step depends on RFC-0825 for the full pipeline ordering (smoke → integration). If RFC-0825 is not implemented, integration runs after health check only.

---

### Step 6. Update `services/AGENTS.md`

**Goal:** Document the integration test requirement and `.env.dev` reuse convention.

**Agent actions:**

- Add a new section to `services/AGENTS.md` after the "Dev channel" section:
  - Integration tests live in `packages/werkstatt-site/src/testing/integration/services/<service-id>/`
  - `service.integration.run --service <id>` runs them against the dev-deployed Worker
  - Integration tests reuse `.env.dev` credentials (no separate `.env.test`)
  - `leitstand.service.dev-deploy` calls integration tests after health check (warning, not fatal)
  - Tests use `describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)` guard

**Validation:**

- Visual review of `services/AGENTS.md`

**Completion criterion:** `services/AGENTS.md` has integration test section with `.env.dev` reuse convention.

**Human review:** no

---

### Step 7. Run integration tests against dev channel (operator prerequisite)

**Goal:** Verify integration tests pass against real dev-deployed Workers.

**Agent actions:**

- Run `pnpm exec werkstatt run service.integration.run --service lagebild-sync`
- Run `pnpm exec werkstatt run service.integration.run --service matomo-proxy`
- **Note:** This step requires operator-provided `.env.dev` files and dev-deployed Workers. If credentials or deployed Workers are not available, document this as a deferred criterion.

**Validation:**

- `service.integration.run --service lagebild-sync` returns `status: pass`
- `service.integration.run --service matomo-proxy` returns `status: pass`

**Completion criterion:** Integration tests for `lagebild-sync` and `matomo-proxy` pass against dev channel. If not possible due to missing credentials/deployments, document why and leave acceptance criterion unchecked.

**Human review:** yes — operator must provide `.env.dev` credentials and ensure Workers are dev-deployed.

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `services/AGENTS.md` is updated with integration test requirement
- No `docs/*.xml` Compass sync needed (stated in RFC)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surface changed
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- Check off acceptance criteria: verify each criterion against implemented code. Mark `[x]` with `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0826 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0826`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0826`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run service.integration.run --service lagebild-sync` (requires dev-deployed Worker + `.env.dev`)
- `pnpm exec werkstatt run service.integration.run --service matomo-proxy` (requires dev-deployed Worker + `.env.dev`)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0826` in the subject line
- Integration test run output (if dev-deployed Workers are available)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| Test data mutation | Step 4: Integration tests for lagebild-sync only test `/health` (read-only). matomo-proxy proxy test is read-only. |
| External API rate limits | Step 2: Global timeout (180s) limits test duration. Tests are minimal (health + proxy only). |
| Flaky tests | Step 4: Tests use `describe.skipIf` guard. Step 2: Command handler returns warning on failure, not fatal. |
| Credential leakage | Step 1: Reuses `.env.dev` which is already gitignored per RFC-0806. No new credential files created. |

## 6. Escalation triggers

- If implementation reveals that `service.integration.run` needs to be in a pipeline (not just standalone), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0826 --reason "..." --invariant "DNA-66"` instead of working around it.
- If RFC-0825 implementation changes the pipeline ordering in a way that conflicts with this RFC's integration point, coordinate the integration step placement.
- If the `test-env.ts` helper change from `.env.test` to `.env.dev` breaks other consumers (RFC-0827, RFC-0828), update those consumers in the same session.
