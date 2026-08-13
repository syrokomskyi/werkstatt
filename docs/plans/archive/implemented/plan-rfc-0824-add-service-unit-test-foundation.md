---
rfcId: RFC-0824
planId: PLAN-RFC-0824-01
status: draft
owner: architecture
createdAt: 2026-08-13
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services:
    - services/cf-analytics-poller
    - services/check-runner
    - services/fleet-probe-runner
    - services/lagebild-sync
    - services/matomo-proxy
    - services/maturity-score
    - services/observability-stack
    - services/rate-fetcher
    - services/telegram-alert-bridge
  docs:
    - services/AGENTS.md
---

# Implementation Plan: RFC-0824

## 1. Objectives

- [ ] Objective 1 — `classifyTier` extended with `services/` branch (maps to acceptance criterion: `test.signal.validate` scans `services/*/package.json` and emits diagnostics)
- [ ] Objective 2 — `service.test.run` command registered and implemented (maps to acceptance criterion: `service.test.run` command registered)
- [ ] Objective 3 — All 9 `services/*/package.json` get `test` and `test:watch` scripts (maps to acceptance criterion: All `services/*/package.json` have `test` and `test:watch` scripts)
- [ ] Objective 4 — Per-service `vitest.config.ts` created for each service (maps to acceptance criterion: `turbo run test` includes service tests)
- [ ] Objective 5 — At least one unit test per service in `packages/werkstatt-site/src/testing/unit/services/<service-id>/` (maps to acceptance criterion: At least one unit test exists for each service)
- [ ] Objective 6 — `services/AGENTS.md` updated with unit test requirement (maps to acceptance criterion: `services/AGENTS.md` updated)
- [ ] Objective 7 — `test.signal.policy.validate` verified to enforce owner/rationale/reviewAfter for services (maps to acceptance criterion: `test.signal.policy.validate` enforces owner/rationale/reviewAfter for services)
- [ ] Objective 8 — `rfc.validate` passes and `turbo run test` includes service tests (maps to acceptance criteria: `rfc.validate` passes, `turbo run test` includes service tests)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/test-signal.ts` — `classifyTier` function: add `if (signal.directory.startsWith("services/")) return 1;` branch
- `packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts` — register `service.test.run` command
- `packages/werkstatt-site/src/checks/test-signal-service-test-run.ts` — new handler file for `service.test.run`
- `packages/werkstatt-site/src/checks/command-tables/index.ts` — no change needed (already imports `20-ecosystem.ts`)
- `packages/werkstatt-site/src/testing/unit/services/<service-id>/*.test.ts` — new unit test files (9 services)
- `services/*/vitest.config.ts` — new per-service vitest config (9 files)
- `services/*/package.json` — add `test` and `test:watch` scripts (9 files)

### 2.2 Configuration and data

- `services/registry.yaml` — no changes needed (test scripts are in `package.json`, not registry)
- `turbo.json` — no changes needed (existing `test` task covers all workspaces)

### 2.3 Documentation and specs

- `services/AGENTS.md` — add unit test requirement section
- `docs/rfcs/rfc-0824-add-service-unit-test-foundation.md` — read-only reference
- `docs/audits/audit-rfc-0824-add-service-unit-test-foundation.md` — read-only reference

### 2.4 Validation and pipelines

- `test.signal.validate` — extended via `classifyTier` change (already in PACKAGES_CHECK_PIPELINE)
- `test.signal.policy.validate` — no change needed (existing logic applies automatically)
- `service.test.run` — standalone command, not wired into any pipeline
- CI: `turbo run test` automatically includes services once they have `test` scripts

## 3. Step sequence

### Step 1. Extend `classifyTier` with `services/` branch

**Goal:** Make `test.signal.validate` aware of services by adding a `services/` branch to the `classifyTier` function.

**Agent actions:**

- Open `packages/werkstatt-site/src/checks/test-signal.ts`
- In the `classifyTier` function (line ~103), add `if (signal.directory.startsWith("services/")) return 1;` after the `apps/` check and before the `packages/ui` check
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` to verify TypeScript compiles

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- `pnpm exec werkstatt run test.signal.validate --json` includes services in its output

**Completion criterion:** `test.signal.validate --json` output contains entries for all 9 `services/*` directories with `tier: 1`.

**Human review:** no

---

### Step 2. Implement `service.test.run` command

**Goal:** Create the `service.test.run` kernel command that runs vitest for a specific service and returns structured `--json` results.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/test-signal-service-test-run.ts` with a handler function `runServiceTestRun` that:
  - Accepts `--service <id>` flag
  - Resolves the service's test directory at `packages/werkstatt-site/src/testing/unit/services/<service-id>/`
  - Runs `vitest run` against that directory using `execFile` or `execFileSync`
  - Parses vitest output and returns `ServiceTestRunResult` shape
  - Returns warning (not error) if directory exists but has no test files
  - Returns error if directory does not exist
- Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks to the new file
- Register the command in `packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts`:
  ```ts
  {
    name: "service.test.run",
    description: "Run vitest unit tests for a specific service (RFC-0824).",
    scope: "workspace",
    reads: ["services/*/package.json", "packages/werkstatt-site/src/testing/unit/services/**"],
    flags: { service: { kind: "string", description: "Service id (e.g. lagebild-sync)" } },
    execute: runServiceTestRun,
  },
  ```
- Export `runServiceTestRun` from the appropriate barrel or command-tables index
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` to verify TypeScript compiles

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- `pnpm exec werkstatt run service.test.run --service lagebild-sync` executes (may report no test files yet — that's expected at this step)

**Completion criterion:** `service.test.run --service <id>` command is registered, executes without crashing, and returns structured JSON when `--json` flag is passed.

**Human review:** no

---

### Step 3. Add `test` and `test:watch` scripts to all service `package.json` files

**Goal:** Make all 9 services visible to `turbo run test` by adding test scripts.

**Agent actions:**

- For each of the 9 services (`cf-analytics-poller`, `check-runner`, `fleet-probe-runner`, `lagebild-sync`, `matomo-proxy`, `maturity-score`, `observability-stack`, `rate-fetcher`, `telegram-alert-bridge`):
  - Open `services/<service-id>/package.json`
  - Add `"test": "vitest run"` and `"test:watch": "vitest"` to `scripts`
  - Ensure `vitest` is available as a dev dependency (it should be via workspace hoisting, but verify)
- Run `pnpm install` to update lockfile if needed

**Validation:**

- `rtk grep '"test"' services/*/package.json` shows all 9 services
- `pnpm exec turbo run test --dry=json` includes all 9 services in the task list

**Completion criterion:** All 9 `services/*/package.json` files have `test` and `test:watch` scripts.

**Human review:** no

---

### Step 4. Create per-service `vitest.config.ts` files

**Goal:** Each service has a local vitest config that points to its test directory in the package.

**Agent actions:**

- For each of the 9 services, create `services/<service-id>/vitest.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";
  import { resolve } from "node:path";
  
  export default defineConfig({
    test: {
      include: [resolve(__dirname, "../../packages/werkstatt-site/src/testing/unit/services/<service-id>/**/*.test.ts")],
    },
  });
  ```
  Replace `<service-id>` with the actual service id in each file.
- Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks to each file (or mark as generated/config if exempt)

**Validation:**

- `pnpm --filter <service-id> run build:check` passes for each service (or vitest config is not type-checked, verify)
- `pnpm --filter lagebild-sync run test -- --run` executes (finds no test files yet — expected)

**Completion criterion:** All 9 services have `vitest.config.ts` files that resolve to the correct package-level test directory.

**Human review:** no

---

### Step 5. Create unit test directories and write initial health-endpoint tests

**Goal:** Create the test directory structure and write at least one unit test per service.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/unit/services/` directory
- For each of the 9 services, create `packages/werkstatt-site/src/testing/unit/services/<service-id>/` directory
- For each service, write a minimal unit test file `health-endpoint.test.ts` that tests the service's `/health` endpoint handler or core logic:
  - For CF Worker services: test the health endpoint response shape `{"status":"ok","service":"<id>"}`
  - For Node.js services: test the core module's basic functionality
  - For `observability-stack`: test the SigNoz configuration or skip with a placeholder test
- Each test file should import from the service's source via `@warpgogol/werkstatt-site/*` subpath or direct relative path
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` to verify TypeScript compiles

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` passes (includes new service tests)
- `pnpm exec turbo run test` passes for all services

**Completion criterion:** Each of the 9 services has at least one `.test.ts` file in `packages/werkstatt-site/src/testing/unit/services/<service-id>/` and all tests pass.

**Human review:** no

---

### Step 6. Update `services/AGENTS.md` with unit test requirement

**Goal:** Document the service unit test requirement in the services agent guide.

**Agent actions:**

- Open `services/AGENTS.md`
- Add a new section "## Unit testing (RFC-0824)" after the existing "## Env-and-deploy contract" section
- Document:
  - All `services/*` MUST have `test` and `test:watch` scripts in `package.json`
  - Unit tests live in `packages/werkstatt-site/src/testing/unit/services/<service-id>/`
  - Each service has a `vitest.config.ts` pointing to its test directory
  - `test.signal.validate` scans services with tier 1 classification
  - Grace period: services without test scripts get `warning` diagnostics until 2026-08-27, then `error`
  - `service.test.run --service <id>` runs vitest for a specific service

**Validation:**

- `services/AGENTS.md` contains the new section
- File is valid markdown (no broken links or formatting)

**Completion criterion:** `services/AGENTS.md` has a "Unit testing (RFC-0824)" section documenting all requirements.

**Human review:** no

---

### Step 7. Verify `test.signal.policy.validate` enforcement for services

**Goal:** Confirm that the existing `policyDiagnosticForSignal` function enforces owner/rationale/reviewAfter for services without any code changes.

**Agent actions:**

- Temporarily set one service's `package.json` to have a `gogol.testSignal.signal: "skipped"` without `owner`/`rationale`/`reviewAfter`
- Run `pnpm exec werkstatt run test.signal.policy.validate --json`
- Verify that the service gets error diagnostics for missing owner, rationale, and reviewAfter
- Revert the temporary change
- Run `pnpm exec werkstatt run test.signal.policy.validate --json` again to confirm clean state

**Validation:**

- `test.signal.policy.validate --json` emits error diagnostics for the service with missing metadata
- After revert, `test.signal.policy.validate --json` passes cleanly

**Completion criterion:** `test.signal.policy.validate` enforces owner/rationale/reviewAfter for services without any code changes — confirmed by the temporary-skip test.

**Human review:** no

---

### Step 8. Run full validation suite and verify acceptance criteria

**Goal:** Run all validation commands, verify every acceptance criterion, and prepare for stamping.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0824 --json` — verify pass
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — verify pass
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — verify all tests pass
- Run `pnpm exec turbo run test` — verify all service tests are included and pass
- Run `pnpm exec werkstatt run test.signal.validate --json` — verify services are included
- Run `pnpm exec werkstatt run test.signal.policy.validate --json` — verify pass
- Run `pnpm exec werkstatt run service.test.run --service lagebild-sync --json` — verify structured output
- Check off each acceptance criterion in the RFC with inline evidence:
  - `[x]` `service.test.run` command registered — `(evidence: packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts:NN)`
  - `[x]` `test.signal.validate` scans services — `(evidence: packages/werkstatt-site/src/checks/test-signal.ts:NN)`
  - `[x]` `test.signal.policy.validate` enforces for services — `(evidence: Step 7 verification)`
  - `[x]` All services have test scripts — `(evidence: services/*/package.json)`
  - `[x]` At least one unit test per service — `(evidence: packages/werkstatt-site/src/testing/unit/services/*/health-endpoint.test.ts)`
  - `[x]` `turbo run test` includes service tests — `(evidence: turbo run test output)`
  - `[x]` `services/AGENTS.md` updated — `(evidence: services/AGENTS.md)`
  - `[x]` `rfc.validate` passes — `(evidence: rfc.validate --id RFC-0824 output)`

**Validation:**

- All commands listed above pass
- All acceptance criteria in the RFC are checked off with evidence annotations

**Completion criterion:** All validation commands pass; all 8 acceptance criteria are checked off with inline evidence.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and stamp implemented

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `services/AGENTS.md` is updated (Step 6)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (new `service.test.run` command was added)
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0824 --json` — verify pass
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Verify every acceptance criterion is checked off with `(evidence: ...)` annotations
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0824 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0824` passes
- Review report exists in `docs/reviews/code/` for this session
- `rfc.implement.stamp` succeeds (validates status, criteria, clean tree, commit reachability)

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline evidence; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0824`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec turbo run test`
- `pnpm exec werkstatt run test.signal.validate --json`
- `pnpm exec werkstatt run test.signal.policy.validate --json`
- `pnpm exec werkstatt run service.test.run --service lagebild-sync --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0824` in the subject line (RFC-0265 commit hygiene)
- `docs/reviews/code/` — code review report for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Grace period enforcement relies on agent discipline | Step 6 documents the cutoff date (2026-08-27) in `services/AGENTS.md` |
| Per-service vitest config path resolution | Step 4 uses `resolve(__dirname, "../../packages/...")` which is stable because `services/*` and `packages/*` are siblings |
| Test directory mapping drift if service is renamed | `service.naming.validate` already enforces naming conventions; test directory name follows service id |
| Test script but no test files gives false "real" signal | Step 5 ensures every service has at least one test file; documented as known limitation in RFC |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-66 (testing pyramid), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0824 --reason "..." --invariant "DNA-66"` instead of working around it.
- If `test.signal.policy.validate` does not enforce owner/rationale/reviewAfter for services after `classifyTier` is extended (Step 7 fails), this indicates a deeper issue in the policy validator that may require a separate RFC.
