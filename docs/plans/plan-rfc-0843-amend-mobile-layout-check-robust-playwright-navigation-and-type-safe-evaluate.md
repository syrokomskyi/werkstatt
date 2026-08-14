---
rfcId: RFC-0843
planId: PLAN-RFC-0843-01
status: draft
owner: architecture
createdAt: 2026-08-14
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - docs/rfcs/rfc-0843-amend-mobile-layout-check-robust-playwright-navigation-and-type-safe-evaluate.md
---

# Implementation Plan: RFC-0843

## 1. Objectives

- [ ] O1 — Create `playwright-utils.ts` with `evaluateInPage`, `blockExternalRequests`, `isExternalUrl` (acceptance: wrapper + utilities defined, `isExternalUrl` handles `data:`/`blob:`)
- [ ] O2 — Refactor `mobile-layout-check.ts` to use shared utilities, add `evaluateInPage`, fix `result.timeout` (acceptance: shared utils used, `result.timeout` only true for real timeouts)
- [ ] O3 — Refactor `print-pdf.ts` to use `browser.newContext()` + `context.newPage()`, replace `networkidle` with `load` + `blockExternalRequests`, add settle wait, add `evaluateInPage` (acceptance: no `networkidle`, context-based, 2s settle)
- [ ] O4 — Refactor `independent-qa.ts` to use `browser.newContext()` + `context.newPage()`, replace `networkidle` with `load` + `blockExternalRequests`, add `evaluateInPage` (acceptance: no `networkidle`, context-based)
- [ ] O5 — Add unit tests for `playwright-utils.ts` and MOBILE-GEO-04 non-timeout error message (acceptance: tests pass)
- [ ] O6 — Verify no `networkidle` references remain in `packages/werkstatt-site/src/checks/` or `packages/werkstatt-site/src/domain/check-runner/`

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/playwright-utils.ts` — **new file**: `evaluateInPage<T>`, `blockExternalRequests`, `isExternalUrl`
- `packages/werkstatt-site/src/checks/mobile-layout-check.ts` — refactor inline `ctx.route()` to `blockExternalRequests`, replace `page.evaluate()` with `evaluateInPage`, fix `result.timeout` field
- `packages/werkstatt-site/src/checks/print-pdf.ts` — refactor `browser.newPage()` → `browser.newContext()` + `context.newPage()`, replace `networkidle` with `load` + `blockExternalRequests`, add `page.waitForTimeout(2000)`, replace `page.evaluate()` with `evaluateInPage`
- `packages/werkstatt-site/src/checks/independent-qa.ts` — refactor `browser.newPage()` → `browser.newContext()` + `context.newPage()`, replace `networkidle` with `load` + `blockExternalRequests`, replace `page.evaluate()` with `evaluateInPage`

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- RFC file (read-only reference)
- No `AGENTS.md` updates needed — no new commands, no pipeline changes, no ownership changes
- No `docs/*.xml` Compass sync needed — no repository-wide semantics changed
- No `docs/architecture-dna.md` changes — DNA-69 invariant unchanged

### 2.4 Validation and pipelines

- No pipeline changes — `mobile.layout.check` remains in `SITES_CHECK_POSTBUILD_PIPELINE`
- No CI workflow changes
- No new validate commands

## 3. Step sequence

### Step 1. Create `playwright-utils.ts` shared utilities

**Goal:** Create the new shared utility file with three exports.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/playwright-utils.ts`
- Implement `isExternalUrl(url: string, allowedOrigin: string): boolean` — parse URL, return `false` for `data:`/`blob:` protocols, compare hostname+port against allowed origin, return `false` for invalid URLs
- Implement `blockExternalRequests(context: BrowserContext, allowedOrigin: string): Promise<void>` — call `context.route("**/*", ...)` using `isExternalUrl`
- Implement `evaluateInPage<T>(page: Page, fn: () => T): Promise<T>` — thin wrapper calling `page.evaluate(fn)`, type signature rejects strings
- Import `Page` and `BrowserContext` types from `playwright`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles

**Completion criterion:** File exists with all three exports, TypeScript compiles without errors.

**Human review:** no

---

### Step 2. Refactor `mobile-layout-check.ts`

**Goal:** Replace inline `ctx.route()` with `blockExternalRequests`, replace `page.evaluate()` calls with `evaluateInPage`, fix `result.timeout` field.

**Agent actions:**

- Import `blockExternalRequests`, `evaluateInPage` from `./playwright-utils.ts`
- Replace inline `ctx.route("**/*", ...)` block (lines 375-382) with `await blockExternalRequests(ctx, baseUrl)`
- Replace all `page.evaluate(() => ...)` calls (lines 407, 423, 444) with `evaluateInPage(page, () => ...)`
- Fix `result.timeout` field (line 464): change from unconditional `true` to `const isTimeout = errMsg.toLowerCase().includes("timeout"); result.timeout = isTimeout; timedOut = isTimeout;`
- Update MOBILE-GEO-04 diagnostic message to distinguish timeouts: `isTimeout ? "Route timed out in ${orientation} after ${routeTimeoutMs}ms: ${errMsg}" : "Route failed in ${orientation}: ${errMsg}"`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose -- mobile-layout-check`

**Completion criterion:** No inline `ctx.route()` remains, all `page.evaluate()` calls use `evaluateInPage`, `result.timeout` only `true` for real timeouts, existing tests pass.

**Human review:** no

---

### Step 3. Refactor `print-pdf.ts`

**Goal:** Replace `browser.newPage()` with context-based approach, replace `networkidle` with `load` + `blockExternalRequests`, add settle wait, add `evaluateInPage`.

**Agent actions:**

- Import `blockExternalRequests`, `evaluateInPage` from `./playwright-utils.ts`
- Create one `BrowserContext` before the `for (const target of toGenerate)` loop, call `await blockExternalRequests(context, baseUrl)` once
- Inside the loop, replace `const page = await browser.newPage()` (line 256) with `const page = await context.newPage();`
- Replace `waitUntil: "networkidle"` (line 258) with `waitUntil: "load"`
- Add `await page.waitForTimeout(2000)` after `page.goto()` for font/layout settling
- Replace `page.evaluate(() => ...)` call (line 262) with `evaluateInPage(page, () => ...)`
- Close each page after PDF generation (`await page.close()`)
- Close context after the loop in `finally` block (`await context.close()`)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `grep -r "networkidle" packages/werkstatt-site/src/checks/print-pdf.ts` — no results

**Completion criterion:** No `networkidle` in `print-pdf.ts`, uses `browser.newContext()` + `context.newPage()`, has 2s settle wait, `page.evaluate()` uses `evaluateInPage`.

**Human review:** no

---

### Step 4. Refactor `independent-qa.ts`

**Goal:** Replace `browser.newPage()` with context-based approach, replace `networkidle` with `load` + `blockExternalRequests`, add `evaluateInPage`.

**Agent actions:**

- Import `blockExternalRequests`, `evaluateInPage` from `./playwright-utils.ts`
- Create one `BrowserContext` before the `for (const { rfcId, rfcFile, probe } of collected)` loop, call `await blockExternalRequests(context, baseUrl)` once
- Inside the loop, replace `const page = await browser.newPage()` (line 302) with `const page = await context.newPage();`
- Replace `waitUntil: "networkidle"` (line 312) with `waitUntil: "load"`
- Replace `page.evaluate(() => document.body.innerText)` (line 342) with `evaluateInPage(page, () => document.body.innerText)`
- Close each page after probe execution (`await page.close()`)
- Close context after the loop in `finally` block (`await context.close()`)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `grep -r "networkidle" packages/werkstatt-site/src/checks/independent-qa.ts` — no results

**Completion criterion:** No `networkidle` in `independent-qa.ts`, uses `browser.newContext()` + `context.newPage()`, `page.evaluate()` uses `evaluateInPage`.

**Human review:** no

---

### Step 5. Add unit tests

**Goal:** Add tests for `playwright-utils.ts` utilities and MOBILE-GEO-04 non-timeout error message.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/playwright-utils.test.ts`:
  - Test `isExternalUrl`: returns `false` for `data:` URLs, `false` for `blob:` URLs, `false` for same-origin, `true` for different hostname, `true` for different port, `false` for invalid URLs
  - Test `evaluateInPage`: calls `page.evaluate(fn)` with function argument, returns result
  - Test `blockExternalRequests`: calls `context.route("**/*", ...)`, aborts external URLs, continues local URLs
- Update `packages/werkstatt-site/src/checks/tests/mobile-layout-check.test.ts`:
  - Add test verifying MOBILE-GEO-04 message contains actual error text (not "timed out") for non-timeout failures
  - Add test verifying `result.timeout` is `false` for non-timeout errors

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose -- playwright-utils`
- `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose -- mobile-layout-check`

**Completion criterion:** All new tests pass, existing tests still pass.

**Human review:** no

---

### Step 6. Verify no `networkidle` references remain

**Goal:** Confirm no `networkidle` usage in the affected packages.

**Agent actions:**

- Run `grep -r "networkidle" packages/werkstatt-site/src/checks/ packages/werkstatt-site/src/domain/check-runner/`
- Verify zero results

**Validation:**

- `grep -r "networkidle" packages/werkstatt-site/src/checks/ packages/werkstatt-site/src/domain/check-runner/` — no results

**Completion criterion:** Zero `networkidle` references in `packages/werkstatt-site/src/checks/` and `packages/werkstatt-site/src/domain/check-runner/`.

**Human review:** no

---

### Step 7. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, stamp RFC as implemented.

**Agent actions:**

- No `AGENTS.md` updates needed — no new commands or ownership changes
- No `docs/*.xml` Compass sync needed
- No `docs/architecture-dna.md` changes
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0843`
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check`
- Run `pnpm --filter @warpgogol/werkstatt-site run test`
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Max 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against implemented code. Mark `[x]` with `(evidence: ...)` annotations.
- **Stamp implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0843 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0843`
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria checked off, RFC stamped as `implemented`.

**Human review:** no — `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0843`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `grep -r "networkidle" packages/werkstatt-site/src/checks/ packages/werkstatt-site/src/domain/check-runner/` — zero results

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0843` in the subject line
- No verification evidence file needed (RFC has no acceptance probes)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| External request blocking may hide real layout issues | Step 2 — `SETTLE_WAIT_MS` buffer (2s) provides reflow time; blocking is scoped to local server origin only |
| `evaluateInPage` wrapper adoption | Steps 2-4 — all three validators migrated to use wrapper in this plan |
| `print.pdf.generate` behavior change from `networkidle` to `load` | Step 3 — `page.waitForTimeout(2000)` added after `goto` for font/layout settling |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-69, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0843 --reason "..." --invariant "DNA-69"` instead of working around it.
