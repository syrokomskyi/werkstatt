---
id: RFC-0843
title: "Amend mobile.layout.check — robust Playwright navigation and type-safe evaluate"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-14
updatedAt: 2026-08-14
enhancedAt: 2026-08-14
implementedAt: 2026-08-14
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0838
amendedBy: []
related:
  - DNA-69
  - RFC-0838
  - RFC-0647
satisfies:
  - DNA-69
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - mobile.layout.check
    - print.pdf.generate
    - qa.independent.run
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "mobile.layout.check no longer times out on pages with external analytics/CDN/pulse references."
  - "print.pdf.generate and qa.independent.run no longer use waitUntil: networkidle."
  - "A type-safe evaluateInPage wrapper prevents the page.evaluate(string) footgun across all Playwright-based validators."
  - "MOBILE-GEO-04 error message distinguishes timeouts from other failures."
nonGoals:
  - "This RFC does not change the rule catalog, thresholds, or pipeline integration of mobile.layout.check."
  - "This RFC does not introduce visual regression or baseline-based comparison."
  - "This RFC does not modify the PlaywrightCaptureAdapter in playwright-adapter.ts — it uses domcontentloaded and is not affected."
---

# RFC-0843: Amend mobile.layout.check — robust Playwright navigation and type-safe evaluate

## Context

RFC-0838 introduced `mobile.layout.check` with `waitUntil: "networkidle"` for page navigation. During mission `warpgogol-com-m000056`, this caused **every route** (163 pages) to time out at 30 seconds each — over 80 minutes of wasted time. The root cause: `networkidle` waits for all network requests to settle, but external analytics endpoints (`matomo-proxy.warpgogol.com`, `pulse.warpgogol.com`) never resolve in headless environments.

A code fix was applied and committed (platform 5.51.34): block external requests via `ctx.route()` and switch to `waitUntil: "load"`. However, RFC-0838 still specifies `networkidle` in its design text (line 179), and two other validators — `print.pdf.generate` and `qa.independent.run` — still use `networkidle` with the same timeout risk.

A second bug was discovered during the fix: `GEOMETRY_SCRIPT` was a template string containing `() => { ... }`, passed to `page.evaluate(string)`. Playwright evaluates the string as a JS expression and returns the **function object**, not the result of calling it. This caused `"portrait is not iterable"` when `computeMaxDelta` tried to iterate the function object. The bug was masked by the `networkidle` timeout — pages never reached `page.evaluate()`.

## Problem

### 1. `waitUntil: "networkidle"` is unsafe for headless validators

`networkidle` waits for zero network activity for 500ms. Any page that references external resources (analytics, CDN fonts, pulse endpoints) will never reach this state in a headless environment where those endpoints are unreachable or slow. This affects:

- `mobile.layout.check` (line 400, fixed in code but not in RFC)
- `print.pdf.generate` (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt-site/src/checks/print-pdf.ts:258`)
- `qa.independent.run` (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt-site/src/checks/independent-qa.ts:312`)

### 2. `page.evaluate(string)` footgun

Playwright's `page.evaluate()` accepts both functions and strings. When passed a string containing `() => { ... }`, it evaluates the string as a JS expression — returning the function object itself, not the result of calling it. TypeScript does not distinguish between `page.evaluate(string)` and `page.evaluate(fn)` — both are typed as accepting `EvaluateExpression` (string) or `EvaluateFunction` (function). This is a known Playwright API design issue that has no compile-time guard.

Note: `print-pdf.ts` and `independent-qa.ts` already pass functions (not strings) to `page.evaluate()`. The `evaluateInPage` wrapper is introduced as a **convention** for these files — a compile-time guard preventing future regressions — not as a bugfix for an existing string-passing bug in those files.

### 3. MOBILE-GEO-04 error message is misleading

The `MOBILE-GEO-04` diagnostic says "Route timed out" for **any** error during route processing, not just timeouts. This caused significant debugging time during the m000056 release — the actual error was "portrait is not iterable", but the diagnostic said "timed out".

## Decision

### 1. Amend RFC-0838: replace `networkidle` with `load` + external request blocking

All Playwright-based validators in `packages/werkstatt-site` MUST use `waitUntil: "load"` instead of `networkidle`. External requests MUST be blocked via `context.route()` to prevent hang-on-load.

The navigation pattern is:

```ts
// Block external requests before page navigation
await context.route("**/*", (route) => {
  const url = route.request().url();
  if (isExternalUrl(url, allowedOrigins)) {
    return route.abort();
  }
  return route.continue();
});

// Use "load" — waits for all local resources (CSS, images, fonts) but not external
await page.goto(url, { waitUntil: "load", timeout: routeTimeoutMs });
```

Where `isExternalUrl` checks against the local server origin (e.g., `http://127.0.0.1:{port}`).

### 2. Introduce `evaluateInPage<T>` type-safe wrapper

A wrapper function that only accepts function references, making the string footgun a compile-time error:

```ts
/**
 * Type-safe wrapper for page.evaluate.
 * Only accepts function references — strings are rejected by TypeScript.
 * This prevents the footgun where page.evaluate(string) returns the function
 * object instead of the result of calling it.
 */
async function evaluateInPage<T>(page: Page, fn: () => T): Promise<T> {
  return page.evaluate(fn);
}
```

All `page.evaluate()` calls in `mobile-layout-check.ts`, `print-pdf.ts`, and `independent-qa.ts` MUST use this wrapper instead of raw `page.evaluate()`.

### 3. Fix MOBILE-GEO-04 error message and `result.timeout` field

Change from "Route timed out after {timeoutMs}ms" to "Route failed in {orientation}: {errorMessage}". When the error is a genuine timeout, include the timeout duration. When it's another error, include the error message.

Additionally, fix the `result.timeout` field in `RouteResult` — currently set to `true` for ALL errors (line 464), not just timeouts. This is misleading because consumers of the JSON output interpret `timeout: true` as a genuine timeout. The field must only be `true` when the error message indicates a timeout.

## Architectural fit

- **DNA-69:** This RFC amends the implementation of DNA-69 (Playwright mobile layout stability checks) without changing the invariant itself. The geometric assertions remain the same — only the navigation strategy and error reporting change.
- **RFC-0838 amendment:** This RFC amends RFC-0838's execution flow section (line 179: "Navigate to the route with `waitUntil: "networkidle"`") to specify `waitUntil: "load"` with external request blocking.
- **Playwright patterns:** Establishes a reusable pattern for all Playwright-based validators: block external requests + use `load` + type-safe evaluate wrapper.

## Design

### Files to change

| File | Change |
| --- | --- |
| `packages/werkstatt-site/src/checks/mobile-layout-check.ts` | Already fixed in code (platform 5.51.34). Refactor inline `ctx.route()` to use shared `blockExternalRequests`. Add `evaluateInPage` wrapper. Fix `result.timeout` field to only be `true` for real timeouts. |
| `packages/werkstatt-site/src/checks/print-pdf.ts` | Replace `networkidle` with `load` + `blockExternalRequests`. Refactor `browser.newPage()` to `browser.newContext()` + `context.newPage()` (required for `context.route()`). Add `page.waitForTimeout(2000)` after `goto` for font/layout settling. Add `evaluateInPage` wrapper. |
| `packages/werkstatt-site/src/checks/independent-qa.ts` | Replace `networkidle` with `load` + `blockExternalRequests`. Refactor `browser.newPage()` to `browser.newContext()` + `context.newPage()`. Add `evaluateInPage` wrapper. |

### `evaluateInPage` wrapper location

The wrapper should live in a shared utility file that all Playwright-based validators can import:

```
packages/werkstatt-site/src/checks/playwright-utils.ts
```

This is a **new file**. It should export:

- `evaluateInPage<T>(page: Page, fn: () => T): Promise<T>`
- `blockExternalRequests(context: BrowserContext, allowedOrigin: string): Promise<void>`
- `isExternalUrl(url: string, allowedOrigin: string): boolean`

### External request blocking pattern

```ts
function isExternalUrl(url: string, allowedOrigin: string): boolean {
  try {
    const parsed = new URL(url);
    // data: and blob: URLs are local — never block them
    if (parsed.protocol === "data:" || parsed.protocol === "blob:") {
      return false;
    }
    const allowed = new URL(allowedOrigin);
    return parsed.hostname !== allowed.hostname || parsed.port !== allowed.port;
  } catch {
    return false; // Invalid URLs are not external — let Playwright handle them
  }
}

async function blockExternalRequests(
  context: BrowserContext,
  allowedOrigin: string,
): Promise<void> {
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (isExternalUrl(url, allowedOrigin)) {
      return route.abort();
    }
    return route.continue();
  });
}
```

### MOBILE-GEO-04 diagnostic

```ts
// Before (current code, platform 5.51.34 — partially fixed but `result.timeout` is still set for all errors):
result.timeout = true;  // misleading: set for ALL errors, not just timeouts
timedOut = true;        // misleading: set for ALL errors
const errMsg = err instanceof Error ? err.message : String(err);
diagnostics.push({
  ruleId: "MOBILE-GEO-04",
  severity: "error",
  file: `apps/${siteName}/dist/client${route}`,
  message: `Route failed in ${orientation}: ${errMsg}`,
});

// After (accurate + correct timeout classification):
const errMsg = err instanceof Error ? err.message : String(err);
const isTimeout = errMsg.toLowerCase().includes("timeout");
result.timeout = isTimeout;  // only true for real timeouts
timedOut = isTimeout;
diagnostics.push({
  ruleId: "MOBILE-GEO-04",
  severity: "error",
  file: `apps/${siteName}/dist/client${route}`,
  message: isTimeout
    ? `Route timed out in ${orientation} after ${routeTimeoutMs}ms: ${errMsg}`
    : `Route failed in ${orientation}: ${errMsg}`,
});
```

### Unit tests

- **`mobile-layout-check.test.ts`**: Already has a test for `ctx.route()` being called (lines 282-302). Add test verifying MOBILE-GEO-04 message contains the actual error for non-timeout failures.
- **`print-pdf.test.ts`**: Add test verifying `networkidle` is not used (check that `context.route()` is called).
- **`independent-qa.test.ts`**: Add test verifying `networkidle` is not used.
- **`playwright-utils.test.ts`**: New test file for `evaluateInPage`, `blockExternalRequests`, `isExternalUrl`.

## Rollout

1. **Create `playwright-utils.ts`** (new file) with `evaluateInPage`, `blockExternalRequests`, `isExternalUrl`.
2. **Update `mobile-layout-check.ts`** — refactor inline `ctx.route()` to use shared `blockExternalRequests`, add `evaluateInPage` wrapper, fix `result.timeout` field.
3. **Update `print-pdf.ts`** — refactor `browser.newPage()` to `browser.newContext()` + `context.newPage()`, replace `networkidle` with `load` + `blockExternalRequests`, add `page.waitForTimeout(2000)` after `goto`, add `evaluateInPage` wrapper.
4. **Update `independent-qa.ts`** — refactor `browser.newPage()` to `browser.newContext()` + `context.newPage()`, replace `networkidle` with `load` + `blockExternalRequests`, add `evaluateInPage` wrapper.
5. **Add unit tests** for all changes.
6. **Run existing tests** to verify no regressions.

## Alternatives considered

- **`waitUntil: "domcontentloaded"`:** Waits only for DOM parsing, not for CSS/images. Insufficient for layout checks that need rendered geometry. `load` is the correct choice — it waits for all local resources but not for network idle.

- **Per-domain blocklist instead of allowlist:** Instead of blocking all external requests, block specific known-problematic domains (matomo, pulse). Rejected because new external domains may be added in the future, and the allowlist approach (block everything not from the local server) is more robust.

- **Playwright `page.route()` instead of `context.route()`:** `page.route()` only applies to a single page, while `context.route()` applies to all pages in the context. Since validators create new contexts per orientation, `context.route()` is the correct scope.

- **ESLint rule for `page.evaluate(string)`:** Rejected because Playwright's types intentionally allow strings, and writing a custom ESLint rule for a single API is disproportionate. The `evaluateInPage` wrapper achieves the same safety with a simple type constraint.

## Risks

- **External request blocking may hide real issues:** If a page depends on an external resource for layout (e.g., a CDN font that affects text wrapping), blocking it may produce different geometry than production. This is acceptable — the validator's purpose is to catch layout invariant violations, not to perfectly replicate production rendering. The `SETTLE_WAIT_MS` buffer (2 seconds after load) provides time for local reflow.

- **`evaluateInPage` wrapper adoption:** Existing code that uses `page.evaluate()` directly will not be automatically migrated. The wrapper is introduced as a convention — new code must use it, and existing code should be migrated opportunistically. A lint rule could be added later if needed.

- **`print.pdf.generate` behavior change:** Switching from `networkidle` to `load` may cause PDFs to render before all fonts are loaded. The 2-second `SETTLE_WAIT_MS` equivalent (if present) or a `page.waitForTimeout(2000)` after `goto` should be added if not already present.

## Acceptance criteria

- [x] `evaluateInPage<T>` wrapper defined in `packages/werkstatt-site/src/checks/playwright-utils.ts` (evidence: playwright-utils.ts:24-26)
- [x] `blockExternalRequests` and `isExternalUrl` utilities defined in the same file (evidence: playwright-utils.ts:31-33, 43-52)
- [x] `isExternalUrl` handles `data:` and `blob:` URLs as non-external (evidence: playwright-utils.ts:32-33, test playwright-utils.test.ts:44-47)
- [x] `mobile-layout-check.ts` uses shared utilities (refactored from inline code) (evidence: mobile-layout-check.ts:376, 401, 417, 439)
- [x] `mobile-layout-check.ts` `result.timeout` field is `true` only for real timeouts, not all errors (evidence: mobile-layout-check.ts:460-461)
- [x] `print-pdf.ts` uses `waitUntil: "load"` with `blockExternalRequests` instead of `networkidle` (evidence: print-pdf.ts:257, 263)
- [x] `print-pdf.ts` uses `browser.newContext()` + `context.newPage()` (not `browser.newPage()` directly) (evidence: print-pdf.ts:256, 261)
- [x] `print-pdf.ts` has `page.waitForTimeout(2000)` after `goto` for font/layout settling (evidence: print-pdf.ts:264)
- [x] `independent-qa.ts` uses `waitUntil: "load"` with `blockExternalRequests` instead of `networkidle` (evidence: independent-qa.ts:297, 315)
- [x] `independent-qa.ts` uses `browser.newContext()` + `context.newPage()` (not `browser.newPage()` directly) (evidence: independent-qa.ts:296, 305)
- [x] MOBILE-GEO-04 diagnostic distinguishes timeouts from other failures (evidence: mobile-layout-check.ts:467-469)
- [x] Unit tests for `playwright-utils.ts` (evaluateInPage, blockExternalRequests, isExternalUrl) (evidence: playwright-utils.test.ts — 10 tests pass)
- [x] Unit test for MOBILE-GEO-04 non-timeout error message (evidence: mobile-layout-check.test.ts:233-256)
- [x] No `networkidle` references remain in `packages/werkstatt-site/src/checks/` or `packages/werkstatt-site/src/domain/check-runner/` (evidence: grep — zero results)
- [x] Existing `mobile-layout-check.test.ts` tests pass (evidence: 20/20 tests pass)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate — zero errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT reintroduce `waitUntil: "networkidle"` in any Playwright-based validator in `packages/werkstatt-site/`.
- Agents MUST use `evaluateInPage` wrapper instead of raw `page.evaluate()` in all new Playwright-based validators.
- Agents MUST NOT remove the external request blocking — it is required for reliable headless validation.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0843 --reason "..." --invariant "DNA-N"` instead of working around it.
