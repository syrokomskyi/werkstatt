---
rfcId: RFC-0828
planId: PLAN-RFC-0828-01
status: draft
owner: architecture
createdAt: 2026-08-13
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - docs/verification-plan.xml
    - docs/development-plan.xml
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0828

## 1. Objectives

- [ ] O1 — `site.e2e.run` command registered and functional (maps to acceptance: `site.e2e.run` command registered and functional)
- [ ] O2 — Playwright E2E config and 4 test files created (maps to acceptance: `playwright.e2e.config.ts` created + 4 test files pass)
- [ ] O3 — Chromium pre-check integrated into `site.e2e.run` (maps to acceptance: Chromium pre-check integrated)
- [ ] O4 — `leitstand.dev-deploy` calls `site.e2e.run` after Axiom (maps to acceptance: pipeline integration + evidence recording)
- [ ] O5 — Documentation synchronized (maps to acceptance: `rfc.validate` passes)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/testing/e2e/playwright.e2e.config.ts` — Playwright config for E2E tests (new)
- `packages/werkstatt-site/src/testing/e2e/contact-form.test.ts` — contact form E2E test (new)
- `packages/werkstatt-site/src/testing/e2e/navigation.test.ts` — navigation E2E test (new)
- `packages/werkstatt-site/src/testing/e2e/api-routes.test.ts` — API routes E2E test (new)
- `packages/werkstatt-site/src/testing/e2e/robots-sitemap.test.ts` — robots/sitemap E2E test (new)
- `packages/werkstatt-site/src/checks/command-tables/testing-commands.ts` — new command table for testing commands (new)
- `packages/werkstatt-site/src/testing/e2e/run-e2e-tests.ts` — `site.e2e.run` command handler (new)
- `packages/werkstatt-site/src/domain/ui/` — add `data-testid` attributes to contact form components (modify)
- `packages/werkstatt/src/leitstand/leitstand-commands.ts` — call `site.e2e.run` after Axiom step (modify)

### 2.2 Configuration and data

- `packages/werkstatt-site/package.json` — ensure `@playwright/test` is a direct dependency (already present per DNA)

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — add E2E testing convention note
- `docs/verification-plan.xml` — add L4 E2E testing reference
- `docs/development-plan.xml` — add `site.e2e.run` to deployment pipeline plan

### 2.4 Validation and pipelines

- `site.e2e.run` joins no build pipeline — it is invoked by `leitstand.dev-deploy` post-deploy, not by `build.check` or `build.prepare`
- E2E test failure is a warning (not fatal) for dev-deploy

## 3. Step sequence

### Step 1. Create Playwright E2E config

**Goal:** Create the Playwright configuration file for E2E tests.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/e2e/playwright.e2e.config.ts`
- Configure Playwright with: test dir `./`, Chromium-only, 60s timeout, 1 retry, `baseURL` from `E2E_BASE_URL` env var
- Use `import { defineConfig, devices } from "@playwright/test"`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes with the new file

**Completion criterion:** `playwright.e2e.config.ts` exists and type-checks

**Human review:** no

---

### Step 2. Create `site.e2e.run` command handler

**Goal:** Implement the command handler that runs Playwright E2E tests.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/e2e/run-e2e-tests.ts`
- Implement `runSiteE2eTests(input, context)`:
  - Resolve `--site` (required) and `--url` (optional, falls back to `resolveSiteDevUrl`)
  - Chromium pre-check: call `playwright.preflight.check` via `executeKernelCommand` before running tests
  - Set `E2E_BASE_URL` env var from resolved URL
  - Run Playwright via `pnpm exec playwright test --config <path>` as child process
  - Parse exit code: 0 = pass, 1 = test failures, 2 = infrastructure error
  - Return `E2eTestResult` JSON shape per RFC contract
- Export the handler function

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** `run-e2e-tests.ts` exists, exports `runSiteE2eTests`, type-checks

**Human review:** no

---

### Step 3. Register `site.e2e.run` command

**Goal:** Register the command in the kernel registry so it can be invoked.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/command-tables/testing-commands.ts` — new command table for testing commands
- Add `site.e2e.run` entry to `TESTING_COMMANDS` array in the new file
- Set `scope: "workspace"`, `supportsAllSites: true`, `longRunning: true`
- Reference `runSiteE2eTests` as the execute function
- Add flags: `--site` (string, required), `--url` (string, optional)
- Import `TESTING_COMMANDS` in `packages/werkstatt-site/src/checks/command-tables/index.ts` and spread into `ALL_COMMANDS`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- `pnpm exec werkstatt run site.e2e.run --site warpgogol-com --url https://example.com` is recognized (does not error with "unknown command")

**Completion criterion:** `site.e2e.run` appears in command registry and is invocable

**Human review:** no

---

### Step 4. Add `data-testid` attributes to contact form components

**Goal:** Ensure contact form components have stable `data-testid` selectors for E2E tests.

**Agent actions:**

- Locate the contact form component in `packages/werkstatt-site/src/domain/ui/` (likely `src/domain/ui/src/components/contact-form/` or similar)
- Add `data-testid` attributes: `contact-name`, `contact-email`, `contact-message`, `contact-form-id`, `contact-submit`, `contact-success`, `contact-error`
- If the contact form component does not have a `formId` field, add a hidden input or data attribute for `formId: e2e-test` test data isolation
- Verify existing components are not broken by the new attributes

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- Contact form component renders with `data-testid` attributes

**Completion criterion:** Contact form component has all required `data-testid` attributes

**Human review:** no

---

### Step 5. Create E2E test files

**Goal:** Create the 4 E2E test files that verify functional flows.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/e2e/contact-form.test.ts`:
  - Import `resolveDevUrl` from `../helpers/dev-url-resolver.ts`
  - Test: submit form with `formId: e2e-test` → verify success message
  - Test: form validation (empty submit → error visible)
  - Use `data-testid` selectors
- Create `packages/werkstatt-site/src/testing/e2e/navigation.test.ts`:
  - Test: header nav links resolve (not 404)
  - Test: footer links resolve
  - Test: language switcher links resolve
- Create `packages/werkstatt-site/src/testing/e2e/api-routes.test.ts`:
  - Test: `GET /api/health` returns 200
  - Test: known API routes respond (not 404)
- Create `packages/werkstatt-site/src/testing/e2e/robots-sitemap.test.ts`:
  - Test: `GET /robots.txt` returns 200 and contains expected content
  - Test: `GET /sitemap-index.xml` returns 200 and is valid XML
- Remove `packages/werkstatt-site/src/testing/e2e/.gitkeep` (no longer needed)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- E2E test files are syntactically valid TypeScript

**Completion criterion:** 4 test files exist, type-check, and `.gitkeep` is removed

**Human review:** no

---

### Step 6. Integrate `site.e2e.run` into `leitstand.dev-deploy`

**Goal:** Call `site.e2e.run` from the dev-deploy pipeline after Axiom checks.

**Agent actions:**

- In `packages/werkstatt/src/leitstand/leitstand-commands.ts`, after the `axiom.report` auto-invoke step (around line 1527), add E2E test invocation:
  - Call `executeKernelCommand` with `commandName: "site.e2e.run"`, `argv: ["--site=<systemId>", "--url=<deploymentUrl>"]`
  - E2E failure is a warning (not fatal): log `logger.warn` on failure, continue pipeline
  - Record E2E result in `DevDeployResult` — add `e2e: { status: "pass" | "fail" | "not-run"; testsPassed: number; testsFailed: number; durationMs: number }` field
  - If `site.smoke.run` (RFC-0825) is not yet integrated, E2E runs directly after Axiom. If smoke is integrated, E2E runs after smoke.
- Update `DevDeployResult` interface to include the `e2e` field

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- `pnpm --filter @warpgogol/werkstatt run test` passes (existing tests not broken)

**Completion criterion:** `leitstand.dev-deploy` calls `site.e2e.run` and records result in output

**Human review:** no

---

### Step 7. Add unit test for `site.e2e.run` command

**Goal:** Unit test the command handler's URL resolution and Chromium pre-check logic.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/e2e/run-e2e-tests.test.ts`
- Test: URL resolution from `--url` flag (explicit override)
- Test: URL resolution fallback to `resolveSiteDevUrl` when `--url` not provided
- Test: Chromium pre-check is called before Playwright execution
- Test: infrastructure error (exit code 2) is distinguished from test failure (exit code 1)
- Mock `executeKernelCommand` for Chromium pre-check and `child_process.execFile` for Playwright

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` passes

**Completion criterion:** Unit tests pass and cover URL resolution + pre-check + error classification

**Human review:** no

---

### Step 8. Synchronize documentation

**Goal:** Update Compass XML and AGENTS.md with E2E testing conventions.

**Agent actions:**

- Update `docs/verification-plan.xml`: add L4 E2E testing reference to the verification stack
- Update `docs/development-plan.xml`: add `site.e2e.run` to the deployment pipeline plan
- Update `packages/werkstatt-site/AGENTS.md`: add E2E testing note to the check commands section
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed

**Validation:**

- `git diff` shows only the expected documentation files
- `pnpm exec werkstatt run rfc.validate --id RFC-0828` passes

**Completion criterion:** All 3 documentation files updated, `rfc.validate` passes

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations. For unchecked `[ ]` criteria, document why. Criteria requiring live dev-deployed site (4 E2E test files passing) are marked `[ ]` with note "requires runtime verification by operator" — `leitstand.dev-deploy` must be run against warpgogol-com to verify.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0828 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0828`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476). Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0828`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0828` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0828.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0828` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Test flakiness | Step 4: generous timeouts (60s per test), Playwright auto-waiting |
| Dev site availability | Step 2: `wait-for-deploy` helper from RFC-0823 helpers |
| Data-testid maintenance | Step 4: use existing selectors where possible, add `data-testid` only where needed |
| E2E test duration | Step 4: 4 focused test files, Playwright parallelization |
| Concurrent execution | Step 4: `formId: e2e-test` for test data isolation |
| Contact form side-effects | Step 4: `formId: e2e-test` recognized and discarded by integration handler |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-66, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0828 --reason "..." --invariant "DNA-66"` instead of working around it.
- If `site.e2e.run` cannot be registered due to a name collision, investigate the existing command and resolve via rename or superseding RFC.
