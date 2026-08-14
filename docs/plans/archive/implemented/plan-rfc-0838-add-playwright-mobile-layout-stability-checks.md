---
rfcId: RFC-0838
planId: PLAN-RFC-0838-01
status: draft
owner: architecture
createdAt: 2026-08-14
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs:
    - docs/architecture-dna.md
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0838

## 1. Objectives

- [ ] Objective 1 — Define TypeScript contracts for `mobile.layout.check` validator (maps to acceptance criterion: "TypeScript types and interfaces defined")
- [ ] Objective 2 — Implement `runMobileLayoutCheck` command handler with Playwright geometric checks (maps to acceptance criteria: MOBILE-GEO-01..04, per-route timeout, no baselines)
- [ ] Objective 3 — Register `mobile.layout.check` in `05-seo-audit.ts` command table (maps to acceptance criterion: "CLI command registered in `05-seo-audit.ts`")
- [ ] Objective 4 — Wire into `SITES_CHECK_POSTBUILD_PIPELINE` after `lighthouse.budget.check` (maps to acceptance criterion: "Integrated into `SITES_CHECK_POSTBUILD_PIPELINE`")
- [ ] Objective 5 — Append DNA-69 to `docs/architecture-dna.md` and update `packages/werkstatt-site/AGENTS.md` (maps to acceptance criteria: "DNA-69 entry appended", "AGENTS.md updated")
- [ ] Objective 6 — Write unit tests for the validator (maps to acceptance criterion: "per-route timeout implemented and tested")
- [ ] Objective 7 — Run validation suite and stamp implemented (maps to acceptance criterion: "`rfc.validate` passes")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/mobile-layout-check.ts` — **new file**: validator implementation (types, `runMobileLayoutCheck` handler, static server reuse, route discovery, Playwright geometric checks)
- `packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts` — **edit**: add `mobile.layout.check` command entry after `lighthouse.budget.check`, import `runMobileLayoutCheck` from `../mobile-layout-check.ts`
- `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` — **edit**: add `{ command: "mobile.layout.check" }` step after `{ command: "lighthouse.budget.check" }` (line 49)
- `packages/werkstatt-site/src/checks/index.ts` — **edit**: re-export `runMobileLayoutCheck` if barrel exports are used by the command table

### 2.2 Configuration and data

No configuration files or data files are introduced. The validator reads `dist/client/**/*.html` at runtime — no persistent state.

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — **edit**: append `## DNA-69 · Playwright mobile layout stability checks` entry at the bottom (after DNA-67)
- `packages/werkstatt-site/AGENTS.md` — **edit**: add `mobile.layout.check` to the "Check commands" section, documenting MOBILE-GEO-01..04 and pipeline integration
- `docs/COMMANDS.md` — **auto-generated**: updated by `docs.commands.generate` (run in final step)

### 2.4 Validation and pipelines

- `SITES_CHECK_POSTBUILD_PIPELINE` — new step after `lighthouse.budget.check`
- `pnpm exec werkstatt run rfc.validate --id RFC-0838`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test` (new test file)
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0838` (RFC-0330, created on or after 2026-07-07)

## 3. Step sequence

### Step 1. TypeScript contracts

**Goal:** Define all types and interfaces for the `mobile.layout.check` validator in a new file.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/mobile-layout-check.ts`
- Define `MobileLayoutCheckResult` interface: `command`, `status`, `site`, `routesChecked`, `routesPassed`, `routesFailed`, `routeResults[]`, `diagnostics[]`
- Define `RouteResult` interface: `route`, `orientation`, `passed`, `overflow` (`scrollWidth`, `clientWidth`), `clsScore`, `stabilityDelta` (`element`, `deltaPx`), `timeout`
- Define `MobileLayoutDiagnostic` interface: `rule`, `severity`, `message`, `route`, `orientation`
- Define `MobileLayoutCheckFlags` type for CLI flags: `--app`, `--all`, `--json`, `--mode` (error|warning), `--route-timeout` (default 30000), `--stability-delta` (default 5), `--viewport-width` (default 390), `--viewport-height` (default 844)
- Import `KernelCommandInput`, `KernelCommandResult`, `KernelRuntimeContext` from `@warpgogol/werkstatt/kernel`
- Import `ensureChromium` from `./playwright-chromium-ensure.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — type-check passes with new file

**Completion criterion:** New file exists with all interfaces defined and type-checks cleanly.

**Human review:** no

---

### Step 2. Command handler implementation

**Goal:** Implement `runMobileLayoutCheck` — the full Playwright geometric check pipeline.

**Agent actions:**

- In `mobile-layout-check.ts`, implement `runMobileLayoutCheck`:
  1. **dist/ existence check:** If `dist/client/` doesn't exist, return skip result (exit 0, "skipped — no dist/client for <site> (run build first)")
  2. **Chromium pre-flight:** Call `ensureChromium(context.workspaceRoot, context.logger)`
  3. **Route discovery:** Scan `dist/client/**/*.html` using `collectFiles` from `@warpgogol/werkstatt-site/share/fs` (or inline glob walk matching `independent-qa.ts` pattern). Filter to `.html` only.
  4. **Static server:** Start a `node:http` static server on a random port serving `dist/client/`. Reuse the `createStaticServer` pattern from `independent-qa.ts` (MIME types, 404.html fallback). Use `server.listen(0)` for random port.
  5. **Per-route checks (both orientations):**
     - Launch Playwright Chromium browser
     - For each route, for each orientation (portrait 390×844, landscape 844×390):
       a. Create new context with viewport `{ width, height }`
       b. Inject `PerformanceObserver` init script for CLS capture
       c. Navigate to `http://localhost:<port>/<route>` with `waitUntil: "networkidle"`, timeout `--route-timeout`
       d. Wait 2 seconds (allow late layout shifts)
       e. Measure `document.documentElement.scrollWidth` and `clientWidth` → MOBILE-GEO-01 if `scrollWidth > clientWidth`
       f. Record geometry of key elements (`header`, `main`, `footer`, first `[data-section]`) via `getBoundingClientRect()`
       g. Read CLS from `PerformanceObserver` buffer → MOBILE-GEO-03 if CLS ≥ 0.1
       h. For portrait pass: store geometry snapshots. For landscape pass: compare to portrait snapshots → MOBILE-GEO-02 if delta > `--stability-delta`
       i. Close page after each route
     - Wrap each route in a timeout race — if timeout fires, emit MOBILE-GEO-04 and continue
  6. **Cleanup:** Close browser, stop static server
  7. **Result aggregation:** Count passed/failed, collect diagnostics
  8. **Exit code:** 0 if all passed (or warning mode), 1 if any failed (error mode), 2 if infrastructure error
- Implement `--json` output: when `--json` flag is set, write `JSON.stringify(result)` to stdout instead of human-readable summary
- Implement `--mode warning`: diagnostics logged to `context.logger.warn`, exit code always 0
- Implement `--mode error` (default): diagnostics logged to `context.logger.error`, exit code 1 on any violation

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — type-check passes
- Manual smoke: `pnpm exec werkstatt run mobile.layout.check --app <test-app> --mode warning` against a built site

**Completion criterion:** Handler compiles, produces structured output, and correctly identifies horizontal overflow / layout shift / CLS violations on a test site.

**Human review:** no

---

### Step 3. Command registration

**Goal:** Register `mobile.layout.check` in the `05-seo-audit.ts` command table.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts`:
  - Add import: `import { runMobileLayoutCheck } from "../mobile-layout-check.ts";`
  - Add command entry after `lighthouse.budget.check` (after line 232):
    ```ts
    {
      name: "mobile.layout.check",
      description: "RFC-0838: Playwright mobile layout stability checks — horizontal overflow, rotation stability, CLS.",
      scope: "app",
      flags: {
        mode: { kind: "string", description: "error (default) or warning" },
        "route-timeout": { kind: "number", description: "Per-route timeout in ms (default 30000)" },
        "stability-delta": { kind: "number", description: "Layout shift threshold in px (default 5)" },
      },
      supportsAllSites: true,
      cacheable: false,
      reads: ["<app>/dist/client/**/*.html"],
      modulePaths: ["checks/mobile-layout-check.ts"],
      execute: runMobileLayoutCheck,
    },
    ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — type-check passes
- `pnpm exec werkstatt run docs.commands.validate` — command registry in sync with `docs/COMMANDS.md`

**Completion criterion:** Command appears in registry, `docs.commands.validate` passes.

**Human review:** no

---

### Step 4. Pipeline wiring

**Goal:** Add `mobile.layout.check` to `SITES_CHECK_POSTBUILD_PIPELINE` after `lighthouse.budget.check`.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts`:
  - After line 49 (`{ command: "lighthouse.budget.check" }`), add:
    ```ts
    // RFC-0838: Playwright mobile layout stability checks — horizontal overflow,
    // rotation stability, CLS. Runs after lighthouse.budget.check.
    { command: "mobile.layout.check", args: ["--mode=warning"] },
    ```
  - Use `--mode=warning` for initial rollout (per RFC rollout plan step 1)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — type-check passes
- `pnpm exec werkstatt run pipeline.dependencies.validate` — pipeline step ordering is valid

**Completion criterion:** Pipeline includes the new step in the correct position with warning mode.

**Human review:** no

---

### Step 5. Documentation — DNA-69 and AGENTS.md

**Goal:** Append DNA-69 to `docs/architecture-dna.md` and update `packages/werkstatt-site/AGENTS.md`.

**Agent actions:**

- In `docs/architecture-dna.md`, append after DNA-67 (line 286):
  ```markdown
  ## DNA-69 · Playwright mobile layout stability checks

  Every site route MUST pass Playwright-based geometric assertions in mobile emulation: no horizontal overflow (`scrollWidth ≤ clientWidth`), stable layout after portrait→landscape rotation (element geometry delta ≤ 5px), and CLS < 0.1. The validator operates without baselines — it asserts invariants directly, not by comparing against stored snapshots. Runs in `SITES_CHECK_POSTBUILD_PIPELINE` after `lighthouse.budget.check`. Enforcement: `mobile.layout.check`. Established by RFC-0838.
  ```
- In `packages/werkstatt-site/AGENTS.md`, add to the "Check commands" section (after the `lighthouse.budget.check` entry):
  - Document `mobile.layout.check` (RFC-0838) — Playwright mobile layout stability checks. Emits MOBILE-GEO-01 (horizontal overflow, error), MOBILE-GEO-02 (rotation stability delta > threshold, error), MOBILE-GEO-03 (CLS ≥ 0.1, error), MOBILE-GEO-04 (route timeout, error). Integrated into `SITES_CHECK_POSTBUILD_PIPELINE` after `lighthouse.budget.check` in warning mode for initial rollout.
  - Add DNA-69 reference to the DNA-67 line context.
- Run `pnpm exec werkstatt run docs.commands.generate` to regenerate `docs/COMMANDS.md` with the new command.

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0838` — no new violations
- `pnpm exec werkstatt run dna.registry.validate` — DNA-69 is registered and RFC-0838's `satisfies` field is in sync

**Completion criterion:** DNA-69 entry exists in `docs/architecture-dna.md`, AGENTS.md documents the command, `dna.registry.validate` passes.

**Human review:** no

---

### Step 6. Tests

**Goal:** Write unit tests for the `mobile.layout.check` validator.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/mobile-layout-check.test.ts`
- Test cases:
  1. **Skip when no dist/:** Mock `dist/client/` absence → result has `status: "pass"`, `routesChecked: 0`, exit code 0
  2. **Route discovery:** Create a temp `dist/client/` with `index.html`, `about/index.html`, `sitemap.xml` → validator discovers 2 HTML routes, skips XML
  3. **MOBILE-GEO-01 detection:** Create an HTML file with a fixed-width element exceeding viewport → validator emits MOBILE-GEO-01
  4. **MOBILE-GEO-03 detection:** Create an HTML file with a layout-shift-triggering animation → validator emits MOBILE-GEO-03 if CLS ≥ 0.1
  5. **MOBILE-GEO-04 timeout:** Mock a route that never loads → validator emits MOBILE-GEO-04 and continues
  6. **Warning mode:** With `--mode warning`, violations produce exit code 0
  7. **Error mode:** With `--mode error`, violations produce exit code 1
  8. **JSON output:** With `--json`, output is valid JSON matching `MobileLayoutCheckResult` schema
- Use `vitest` with Playwright mocked or real Chromium (follow `independent-qa.test.ts` patterns for test setup)
- Tests that require Playwright Chromium should be guarded with `skipIf` when Chromium is not available

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- mobile-layout-check` — all tests pass

**Completion criterion:** All test cases pass, covering skip path, route discovery, each diagnostic rule, timeout, and both modes.

**Human review:** no

---

### Step 7. Validation suite

**Goal:** Run the full validation suite to confirm everything passes.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0838` — must pass (V-18 warning for DNA-68 is acceptable, will resolve when RFC-0837 is implemented)
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass
- Run `pnpm exec werkstatt run docs.commands.validate` — command registry in sync
- Run `pnpm exec werkstatt run dna.registry.validate` — DNA-69 registered
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0838` — emit verification evidence (RFC-0330, required for RFCs created on or after 2026-07-07)

**Validation:**

- All commands above exit with code 0

**Completion criterion:** All validation commands pass, verification evidence emitted to `docs/rfcs/verification/rfc-0838.generated.json`.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/werkstatt-site/AGENTS.md` is updated with `mobile.layout.check` documentation.
- Verify `docs/architecture-dna.md` has DNA-69 entry.
- Run `pnpm exec werkstatt run docs.commands.generate` to regenerate `docs/COMMANDS.md` if not already done.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0838 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0838`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0838`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run docs.commands.validate`
- `pnpm exec werkstatt run dna.registry.validate`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0838` (RFC-0330, for probe-bearing RFCs created on or after 2026-07-07)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0838.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0838` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Execution time (~2–5s per route, 2 orientations) | Step 2: per-route timeout (30s default) caps worst-case; runs in postbuild pipeline which is already long-running |
| False positives from dynamic content | Step 2: 2-second wait after `networkidle` + 5px stability delta threshold; `--stability-delta` flag for tuning |
| Playwright Chromium version drift | Step 2: fixed viewport sizes (390×844, 844×390) instead of Playwright device descriptors for deterministic measurements |
| CLS measurement accuracy | Step 2: `PerformanceObserver` captures shifts during load + 2s settle window; acceptable for common cases per RFC |
| Concurrent execution memory | Step 2: random port selection; documented in failure modes; operators avoid parallel `--all` runs |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-66 (testing pyramid) or DNA-67 (Lighthouse parity gate), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0838 --reason "..." --invariant "DNA-66"` instead of working around it.
- If the static server pattern from `independent-qa.ts` cannot be reused (e.g., API incompatibility), escalate by creating a shared utility in `@warpgogol/werkstatt-site/share` and documenting the extraction in an ADR.
