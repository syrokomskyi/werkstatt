---
rfcId: RFC-0825
planId: PLAN-RFC-0825-01
status: draft
owner: architecture
createdAt: 2026-08-13
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - docs/verification-plan.xml
    - services/AGENTS.md
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0825

## 1. Objectives

- [ ] O1 — Smoke runner with multi-endpoint fetch, status-code matching, body-contains, timeout, and contentType serialization — maps to acceptance criterion "service.smoke.run command registered and functional" and "site.smoke.run command registered and functional"
- [ ] O2 — `service.smoke.run` and `site.smoke.run` kernel commands registered and callable via CLI — maps to acceptance criteria 1 and 2
- [ ] O3 — `service-smoke.yaml` and `site-smoke.yaml` definition files created with entries for all existing services and warpgogol-com — maps to acceptance criteria 3 and 4
- [ ] O4 — Leitstand pipeline integration: all 5 deployment commands call smoke tests after health check — maps to acceptance criteria 5–9
- [ ] O5 — Smoke evidence persisted in deployment state (`smokeResult` field) and registry (`smokeStatus` field) — maps to acceptance criterion 10
- [ ] O6 — Unit tests for `smoke-runner.ts` covering status-code matching, body-contains, timeout, missing-YAML behavior — maps to acceptance criterion 11
- [ ] O7 — Documentation sync: `docs/verification-plan.xml`, `services/AGENTS.md`, `packages/werkstatt-site/AGENTS.md` — maps to RFC "Compass and AGENTS.md synchronization" section

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/testing/smoke/types.ts` — new shared TypeScript types (`SmokeEndpoint`, `SmokeRunInput`, `SmokeRunResult`, `SmokeCheckResult`, `SmokeEvidence`) — lives in the engine package so both engine and site plugin can import without cross-package violations (DNA-64)
- `packages/werkstatt-site/src/testing/smoke/smoke-runner.ts` — new shared smoke test runner (fetch + verify), imports types from `@warpgogol/werkstatt/testing/smoke`
- `packages/werkstatt-site/src/testing/smoke/service-smoke.yaml` — new service smoke endpoint definitions
- `packages/werkstatt-site/src/testing/smoke/site-smoke.yaml` — new site smoke endpoint definitions
- `packages/werkstatt-site/src/testing/module.ts` — new `createTestingModule()` kernel module registering `service.smoke.run` and `site.smoke.run` commands (separate from check module — smoke is deployment verification, not content validation)
- `packages/werkstatt-site/src/index.ts` — add `testing` to `moduleLoaders` in `werkstattSitePlugin`
- `packages/werkstatt/src/leitstand/service-deploy-helpers.ts` — extend `ServiceDevDeployData` and `ServicePromoteData` with `smokeResult?: SmokeRunResult`; add `runSmokeCheck` helper
- `packages/werkstatt/src/leitstand/service-dev-deploy.ts` — call `service.smoke.run` via `executeKernelCommand` after health check
- `packages/werkstatt/src/leitstand/service-promote.ts` — call `service.smoke.run` via `executeKernelCommand` after health check
- `packages/werkstatt/src/leitstand/leitstand-commands.ts` — call `site.smoke.run` via `executeKernelCommand` after Axiom in `leitstand.dev-deploy`, after freshness in `leitstand.propagate` and `leitstand.promote`
- `packages/werkstatt/src/leitstand/leitstand-propagate.ts` (or equivalent) — call `site.smoke.run` after CDN freshness verification
- `packages/werkstatt/src/leitstand/leitstand-promote.ts` (or equivalent) — call `site.smoke.run` after CDN freshness verification
- `services/registry.yaml` — add `smokeStatus` field to `lastDevDeployed` and `lastDeployed` entries (written by service deploy commands)

### 2.2 Configuration and data

- `packages/werkstatt-site/src/testing/smoke/service-smoke.yaml` — seeded from `services/registry.yaml` `healthCheckPath` values for all 5 services
- `packages/werkstatt-site/src/testing/smoke/site-smoke.yaml` — seeded with critical paths for warpgogol-com: `/`, `/de`, `/de/kontakt`, `/robots.txt`, `/sitemap.xml`, `/api/send-message`

### 2.3 Documentation and specs

- `docs/verification-plan.xml` — add smoke test verification step to deployment verification section
- `services/AGENTS.md` — document `service.smoke.run` command and smoke YAML format
- `packages/werkstatt-site/AGENTS.md` — document `testing/smoke/` directory and its role in the testing pyramid
- `docs/rfcs/rfc-0825-add-post-deploy-smoke-testing.md` — read-only reference (acceptance criteria source of truth)

### 2.4 Validation and pipelines

- `packages/werkstatt-site/src/index.ts` — add `testing` module loader to `werkstattSitePlugin.moduleLoaders`
- No new pipeline phase — smoke tests run as post-deploy verification, not as a build pipeline step
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass with new smoke module
- `pnpm --filter @warpgogol/werkstatt run build:check` — must pass with leitstand changes

## 3. Step sequence

### Step 1. TypeScript contracts and types in engine package

**Goal:** Define all shared types for the smoke testing system in the engine package so both engine and site plugin can import them without cross-package violations (DNA-64).

**Agent actions:**

- Create `packages/werkstatt/src/testing/smoke/types.ts` with `SmokeEndpoint`, `SmokeRunInput`, `SmokeRunResult`, `SmokeCheckResult`, and `SmokeEvidence` interfaces per RFC-0825 § TypeScript contracts
- Include `contentType?: string` field on `SmokeEndpoint` with default `application/json`
- Export types from `packages/werkstatt/src/testing/smoke/index.ts` barrel and from the package entry point

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — type-check passes

**Completion criterion:** Types file exists in engine package, compiles, and exports all 5 interfaces matching the RFC contracts

**Human review:** no

---

### Step 2. Smoke runner implementation

**Goal:** Implement the shared smoke test runner that fetches endpoints and verifies responses.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/smoke/smoke-runner.ts`
- Import types from `@warpgogol/werkstatt/testing/smoke` (engine package)
- Implement `runSmokeChecks(input: SmokeRunInput): Promise<SmokeRunResult>` — reads YAML, resolves target URL, iterates endpoints, fetches each with `fetch()` + `AbortController` timeout, checks status code and body-contains
- Body serialization: if `contentType` is `application/json`, serialize body as JSON; if `application/x-www-form-urlencoded`, serialize as form-encoded; default to `application/json`
- Missing YAML file behavior: throw error for direct CLI invocation; export a `runSmokeChecksOrSkip` variant that returns `{ status: "skipped" }` for pipeline integration
- Missing entry in YAML: throw error "no smoke configuration found for <id>"
- Each endpoint check: construct URL from base URL + path, set method (default GET), attach body with Content-Type, set timeout via `AbortController`, fetch, compare status code, check body contains substring if specified
- Return `SmokeRunResult` with `checks[]` array containing per-endpoint results

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — type-check passes

**Completion criterion:** `smoke-runner.ts` exists, compiles, and exports `runSmokeChecks` function

**Human review:** no

---

### Step 3. Smoke YAML definition files

**Goal:** Create the declarative smoke endpoint definitions for all existing services and warpgogol-com.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/smoke/service-smoke.yaml` with entries for all 5 services from `services/registry.yaml`:
  - `matomo-proxy`: `/_wg/analytics/health` (GET 200)
  - `rate-fetcher`: `/health` (GET 200)
  - `lagebild-sync`: `/health` (GET 200, expectBodyContains `"status":"ok"`)
  - `telegram-alert-bridge`: `/health` (GET 200)
  - `maturity-score`: `/health` (GET 200)
- Create `packages/werkstatt-site/src/testing/smoke/site-smoke.yaml` with entries for warpgogol-com:
  - `/` (GET 200)
  - `/de` (GET 200)
  - `/de/kontakt` (GET 200)
  - `/api/send-message` (POST 200, contentType `application/x-www-form-urlencoded`, body `{ formId: smoke-test, message: "smoke test" }`, expectBodyContains `"ok"`)
  - `/robots.txt` (GET 200)
  - `/sitemap.xml` (GET 200)

**Validation:**

- YAML files parse without errors (can be verified by smoke runner in step 5)

**Completion criterion:** Both YAML files exist with valid YAML syntax and entries for all services and warpgogol-com

**Human review:** no

---

### Step 4. Testing module and kernel command registration

**Goal:** Create a separate `testing` kernel module in the site plugin and register `service.smoke.run` and `site.smoke.run` commands.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/module.ts` with `createTestingModule(): KernelModule` — a new module separate from `check` (smoke is deployment verification, not content validation)
- Register two commands in the testing module:
  - `service.smoke.run` — scope `workspace`, flags `{ service: string, url?: string, json?: boolean }`, executes `runServiceSmokeRun` which loads `service-smoke.yaml` and calls `runSmokeChecks`
  - `site.smoke.run` — scope `workspace`, flags `{ site: string, url?: string, json?: boolean }`, executes `runSiteSmokeRun` which loads `site-smoke.yaml` and calls `runSmokeChecks`
- Create thin kernel handler wrappers in `packages/werkstatt-site/src/testing/smoke/handlers.ts` that call the pure `runSmokeChecks` function and wrap result in `KernelCommandResult`
- Add `testing` module loader to `packages/werkstatt-site/src/index.ts` in `werkstattSitePlugin.moduleLoaders`:
  ```ts
  moduleLoaders: {
    check: async (): Promise<KernelModule> =>
      (await import("./checks/module.ts")).createStandardCheckModule(),
    onboarding: async (): Promise<KernelModule> =>
      (await import("./onboarding/module.ts")).createOnboardingModule(),
    testing: async (): Promise<KernelModule> =>
      (await import("./testing/module.ts")).createTestingModule(),
  },
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — type-check passes
- `pnpm exec werkstatt run command.manifest.generate` — commands appear in manifest

**Completion criterion:** Testing module created, both commands registered, plugin moduleLoaders updated, commands appear in manifest

**Human review:** no

---

### Step 5. Unit tests for smoke runner

**Goal:** Comprehensive unit test coverage for the smoke runner.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/smoke/smoke-runner.test.ts`
- Test cases:
  - All endpoints pass → `status: "pass"`
  - One endpoint returns wrong status → `status: "fail"`, check has `error: "expected 200, got 404"`
  - Endpoint unreachable → `status: "fail"`, check has `error: "fetch failed"`, `status: null`
  - Timeout → `status: "fail"`, check has `error: "timeout after Nms"`, `status: null`
  - Body mismatch → `status: "fail"`, check has `error: "expected body to contain ..."`
  - Missing YAML file → throws error "smoke configuration file not found at <path>"
  - Missing entry in YAML → throws error "no smoke configuration found for <id>"
  - POST with JSON body → correct Content-Type header sent
  - POST with form-encoded body → correct Content-Type header sent
  - Default method is GET when not specified
- Use a mock fetch or a local test server (e.g. `node:http` server) for HTTP responses

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass

**Completion criterion:** All test cases pass and cover the scenarios listed above

**Human review:** no

---

### Step 6. Extend service deploy data types with smoke result

**Goal:** Add `smokeResult` field to service deployment state interfaces.

**Agent actions:**

- In `packages/werkstatt/src/leitstand/service-deploy-helpers.ts`, add `smokeResult?: SmokeRunResult` to `ServiceDevDeployData` and `ServicePromoteData` interfaces
- Import `SmokeRunResult` type from `@warpgogol/werkstatt/testing/smoke` (engine package — shared types live in engine per grilling decision)
- Add a `runSmokeCheck` helper function in `service-deploy-helpers.ts` that calls `executeKernelCommand` with `service.smoke.run` and returns the `SmokeRunResult`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — type-check passes

**Completion criterion:** Both interfaces have `smokeResult?` field, `runSmokeCheck` helper exists

**Human review:** no

---

### Step 7. Integrate smoke tests into service deployment commands

**Goal:** Call `service.smoke.run` after health check in `leitstand.service.dev-deploy` and `leitstand.service.promote`.

**Agent actions:**

- In `packages/werkstatt/src/leitstand/service-dev-deploy.ts`:
  - After `runHealthCheck` succeeds (step 5, line ~153), call `runSmokeCheck` helper
  - Record smoke result in dev-deploy state
  - Smoke failure is a warning for dev-deploy (log warn, do not block)
  - Update `services/registry.yaml` `lastDevDeployed.smokeStatus` field
- In `packages/werkstatt/src/leitstand/service-promote.ts`:
  - After `runHealthCheck` succeeds (step 6, line ~202), call `runSmokeCheck` helper
  - Record smoke result in prod deploy state
  - Smoke failure is fatal for promote (block promotion, return exit code 1)
  - Update `services/registry.yaml` `lastDeployed.smokeStatus` field

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — type-check passes

**Completion criterion:** Both service deploy commands call smoke tests after health check and record results

**Human review:** no

---

### Step 8. Integrate smoke tests into site deployment commands

**Goal:** Call `site.smoke.run` after Axiom/freshness in `leitstand.dev-deploy`, `leitstand.propagate`, and `leitstand.promote`.

**Agent actions:**

- In `packages/werkstatt/src/leitstand/leitstand-commands.ts` (`runLeitstandDevDeploy`):
  - After Axiom gate completes (step 5, ~line 1523), call `site.smoke.run` via `executeKernelCommand`
  - Smoke failure is a warning for dev-deploy (log warn, do not block)
  - Add `smoke` field to `DevDeployResult` interface
- In `leitstand.propagate` (locate in `leitstand-commands.ts` or separate file):
  - After deploy and CDN freshness verification, call `site.smoke.run`
  - Smoke failure is fatal — blocks propagation
  - Add `smoke` field to propagate result
- In `leitstand.promote` (locate in `leitstand-commands.ts` or separate file):
  - After deploy and CDN freshness verification, call `site.smoke.run`
  - Smoke failure is fatal — blocks promotion
  - Add `smoke` field to promote result
- Use the `executeKernelCommand` pattern from `runMissionCheckWithResilience` (line 217) as the invocation template
- Handle missing smoke YAML file gracefully in pipeline context (skip with warning)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — type-check passes

**Completion criterion:** All 3 site deployment commands call smoke tests and record results

**Human review:** no

---

### Step 9. Documentation sync

**Goal:** Update all documentation artifacts identified in scope.

**Agent actions:**

- Update `docs/verification-plan.xml` — add smoke test verification step to the deployment verification section
- Update `services/AGENTS.md` — document `service.smoke.run` command, smoke YAML format, and `smokeStatus` registry field
- Update `packages/werkstatt-site/AGENTS.md` — document `testing/smoke/` directory, its role in DNA-66 L5 layer, and the smoke runner API
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed

**Validation:**

- `git diff --name-only` includes all 3 docs files
- `pnpm exec werkstatt run rfc.validate --id RFC-0825` — passes

**Completion criterion:** All 3 documentation files are updated with smoke testing information

**Human review:** no

---

### Step 10. Validation, review, fix, and stamp

**Goal:** Run full validation suite, code review, fix findings, verify acceptance criteria, and stamp RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0825` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all smoke runner tests pass
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Max 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against implemented code. Mark `[x]` with inline `(evidence: <file:line>)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0825 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0825` — passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All validation passes; code review passed (findings fixed if any); all 12 acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476)

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0825`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0825` in the subject line (RFC-0265 commit hygiene)
- Code review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| CDN propagation delays cause false-positive smoke failures | Step 8 — smoke tests run after CDN freshness verification, not before |
| Smoke tests slow down deployment pipeline | Step 2 — each endpoint check has a timeout (default 5–10s); total smoke run < 30s per RFC constraint |
| Missing smoke YAML for new services/sites during transition | Step 2 — `runSmokeChecksOrSkip` variant returns `skipped` for pipeline integration; Step 7/8 — pipeline calls use skip-on-missing pattern |
| Cross-package import violation (engine imports site plugin) | Step 1 — shared types live in engine package (`@warpgogol/werkstatt/testing/smoke`); site plugin imports from engine, not vice versa |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-64 (engine must not import stack plugins), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0825 --reason "..." --invariant "DNA-64"` instead of working around it.
- If the smoke YAML format needs to support more complex assertions (e.g. JSON path matching, header checks), create a follow-up RFC rather than expanding this RFC's scope.
