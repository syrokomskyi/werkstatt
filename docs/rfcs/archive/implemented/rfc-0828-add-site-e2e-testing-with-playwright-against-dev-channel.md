---
id: RFC-0828
title: "Add site E2E testing with Playwright against dev channel"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-13
updatedAt: 2026-08-13
enhancedAt: 2026-08-13
implementedAt: 2026-08-13
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-66
  - RFC-0813
  - RFC-0823
  - RFC-0825
satisfies:
  - DNA-66
versionBump: patch
commands:
  proposed:
    - site.e2e.run
  added:
    - site.e2e.run
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "site.e2e.run command registered"
  - "E2E tests for contact form flow pass against dev-deployed site"
  - "E2E test evidence recorded in deployment state"
  - "Playwright Chromium pre-check integrated"
nonGoals:
  - "Does not test service internals — that is L2 (RFC-0826)"
  - "Does not test API contracts — that is L3 (RFC-0827)"
  - "Does not replace Axiom visual checks — E2E tests functional flows, Axiom checks visual invariants"
  - "Does not run E2E tests in CI — E2E tests require a dev-deployed site"
batch: testing-architecture
dependsOn:
  - RFC-0823
  - RFC-0825
---

# RFC-0828: Add site E2E testing with Playwright against dev channel

## Context

The workshop has Playwright installed (`@playwright/test` 1.62.1 in root `devDependencies`) and uses it for Axiom visual checks via the `check-runner` service. RFC-0813 added a Playwright preflight check to `mission.validate`. However, Playwright is not used for functional E2E testing of site user flows.

Sites have complex user flows: contact form submission, navigation across languages, API route interactions, currency selector, search. These flows are currently tested only manually by the operator on the dev-deployed site. Axiom checks visual invariants (console errors, layout, SEO) but not functional correctness.

## Problem

A dev-deployed site can pass all Axiom checks (no console errors, correct layout, valid SEO) while having broken functional flows (form submission fails, API route returns 500, navigation links broken). DNA-66 requires L4 E2E testing — Playwright tests that exercise critical user flows against the dev-deployed site.

The QStash debugging session (2026-08-13) is a direct example: the contact form flow (fill form → submit → QStash callback → delivery) was tested manually. An E2E test would have automated this entire flow in seconds.

## Decision

The workshop adds:

1. **New command `site.e2e.run --site <id>`** — runs Playwright E2E tests against the dev-deployed site URL.
2. **E2E test files** in `packages/werkstatt-site/src/testing/e2e/` — Playwright test files that exercise critical user flows.
3. **`leitstand.dev-deploy` integration** — after Axiom checks and smoke tests pass, `site.e2e.run` is called. E2E test failure is a warning on dev-deploy (not fatal) — the operator investigates.
4. **Playwright config** — a dedicated `playwright.e2e.config.ts` in `packages/werkstatt-site/src/testing/` that targets the dev-deployed site URL.

## Architectural fit

- **DNA-66 (testing pyramid):** This RFC implements the L4 layer.
- **RFC-0813 (Playwright preflight):** Already ensures Chromium is installed before `mission.validate`. E2E tests depend on the same Chromium installation.
- **RFC-0825 (smoke testing):** E2E tests run after smoke tests. Smoke tests verify endpoints respond; E2E tests verify user flows work.
- **Existing Playwright usage:** `check-runner` service uses Playwright for Axiom. E2E tests use Playwright directly, not through the check-runner — they are simpler (no evidence capture, no Axiom methodology).
- **Axiom vs E2E:** Axiom checks visual/SEO invariants via Playwright with evidence capture. E2E tests check functional flows via Playwright without evidence capture. They complement each other.

## Design

### CLI surface

```sh
pnpm exec werkstatt run site.e2e.run --site warpgogol-com
pnpm exec werkstatt run site.e2e.run --site warpgogol-com --json
pnpm exec werkstatt run site.e2e.run --site warpgogol-com --url https://warpgogol-com-dev.syrokomskyi.workers.dev
```

### E2E test file structure

```
packages/werkstatt-site/src/testing/e2e/
  playwright.e2e.config.ts       — Playwright config for E2E tests
  contact-form.test.ts           — fill form → submit → verify success
  navigation.test.ts             — verify all navigation links work
  api-routes.test.ts             — verify all API routes respond correctly
  robots-sitemap.test.ts         — verify robots.txt and sitemap.xml
```

Language-switch and currency-selector tests are future work (see Rollout).

### Test data isolation

The contact form E2E test uses `formId: e2e-test` so the integration handler (QStash callback) can recognize and discard the message without triggering real Telegram notifications or Supabase writes. This follows the same pattern as RFC-0825's smoke test (`formId: smoke-test`).

### E2E test pattern

```ts
// packages/werkstatt-site/src/testing/e2e/contact-form.test.ts
import { test, expect } from "@playwright/test";
import { resolveDevUrl } from "../helpers/dev-url-resolver.ts";

const baseURL = process.env.E2E_BASE_URL ?? resolveDevUrl("warpgogol-com");

test.use({ baseURL });

test.describe("Contact form flow", () => {
  test("submit form successfully", async ({ page }) => {
    await page.goto("/de/kontakt");

    // Fill the form — formId: e2e-test for test data isolation
    await page.fill('[data-testid="contact-name"]', "E2E Test");
 await page.fill('[data-testid="contact-email"]', "e2e-test@example.com");
    await page.fill('[data-testid="contact-message"]', "This is an E2E test message");
    await page.fill('[data-testid="contact-form-id"]', "e2e-test");

    // Submit
    await page.click('[data-testid="contact-submit"]');

    // Verify success message
    await expect(page.locator('[data-testid="contact-success"]')).toBeVisible({ timeout: 10000 });
  });

  test("form validation works", async ({ page }) => {
    await page.goto("/de/kontakt");

    // Try to submit empty form
    await page.click('[data-testid="contact-submit"]');

    // Verify validation error
    await expect(page.locator('[data-testid="contact-error"]')).toBeVisible();
  });
});
```

### Playwright config

```ts
// packages/werkstatt-site/src/testing/e2e/playwright.e2e.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4321",
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  reporter: process.env.E2E_JSON_OUTPUT ? [["json", { outputFile: process.env.E2E_JSON_OUTPUT }]] : "list",
});
```

### TypeScript contracts

```ts
interface SiteE2eRunInput {
  site: string;
  url?: string;         — override URL (default: resolve from dev-deploy state)
  json?: boolean;
  timeout?: number;     — per-test timeout in ms (default: 60000)
}

interface SiteE2eRunResult {
  command: "site.e2e.run";
  status: "pass" | "fail";
  site: string;
  url: string;
  testFiles: number;
  testsPassed: number;
  testsFailed: number;
  durationMs: number;
  failures?: {
    testName: string;
    message: string;
    file: string;
  }[];
}
```

### URL resolution

When `--url` is not provided, `site.e2e.run` resolves the dev URL in this order:

1. **From `leitstand.dev-deploy` call:** The `DevDeployResult.deploymentUrl` field is passed as `--url` by the pipeline integration.
2. **Standalone invocation:** `resolveDevUrl("<site-id>")` from `packages/werkstatt-site/src/testing/helpers/dev-url-resolver.ts` (created by RFC-0823) resolves the URL from the system's dev-deploy state or registry.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/testing/e2e/*.test.ts` | E2E test files |
| `packages/werkstatt-site/src/testing/e2e/playwright.e2e.config.ts` | Playwright config |
| `packages/werkstatt-site/src/testing/helpers/dev-url-resolver.ts` | Resolves dev URL (created by RFC-0823, shared with L2) |
| `packages/werkstatt/src/leitstand/leitstand-commands.ts` | Calls `site.e2e.run` after Axiom + smoke |
| `packages/werkstatt-site/AGENTS.md` | Updated with E2E testing convention |

### Compass document synchronization

- `docs/verification-plan.xml`: Add L4 E2E testing reference to the verification stack.
- `docs/development-plan.xml`: Add `site.e2e.run` command to the deployment pipeline plan.
- Root `AGENTS.md`: No change needed — testing architecture is referenced via DNA-66.

### Pipeline integration

**`leitstand.dev-deploy` (sites):** After Axiom checks (`mission.check`) and `site.smoke.run` pass, call `site.e2e.run --site <id> --url <deploymentUrl>`. The `deploymentUrl` is passed from `DevDeployResult.deploymentUrl`. E2E test failure is a warning (not fatal) for dev-deploy. Record E2E test evidence in dev-deploy state.

**Prerequisite:** `site.smoke.run` integration into `leitstand.dev-deploy` is added by RFC-0825. If RFC-0825 is not yet implemented, `site.e2e.run` runs after Axiom checks (`mission.check`) directly. The insertion point is after the `axiom.report` auto-invoke step in the current pipeline.

**`leitstand.propagate` (sites):** Does NOT run E2E tests (propagate targets alt channel, and E2E tests are dev-channel specific). Instead, `leitstand.propagate` verifies that E2E test evidence from the most recent dev-deploy exists and passed (enforced by RFC-0829).

### Chromium pre-check

`site.e2e.run` verifies Chromium is installed before running tests:

```ts
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function ensureChromium(): void {
  const cacheDir = join(homedir(), ".cache", "ms-playwright");
  const chromiumDirs = existsSync(cacheDir)
    ? readdirSync(cacheDir).filter((d) => d.startsWith("chromium"))
    : [];
  if (chromiumDirs.length === 0) {
    throw new Error(
      "Playwright Chromium is not installed. Run `pnpm exec playwright install chromium` before E2E tests."
    );
  }
}
```

### Output format

```json
{
  "command": "site.e2e.run",
  "status": "pass",
  "site": "warpgogol-com",
  "url": "https://warpgogol-com-dev.syrokomskyi.workers.dev",
  "testFiles": 6,
  "testsPassed": 14,
  "testsFailed": 0,
  "durationMs": 120000
}
```

### Failure modes

- **Chromium not installed:** Error with install instructions. Does not attempt to install automatically.
- **No test files found:** Warning (not error). Allows incremental adoption.
- **Dev site unreachable:** `wait-for-deploy` helper retries for 60s, then tests fail with connection error.
- **Test timeout:** Per-test timeout default 60s. Playwright's built-in timeout handling applies.
- **Selector not found:** Test fails with Playwright's standard error message including the selector and page URL.

## Rollout

- **Default behavior:** `site.e2e.run` is available immediately. `leitstand.dev-deploy` calls it after Axiom + smoke.
- **Initial tests:** Start with critical flows:
  1. `contact-form.test.ts` — the flow we manually tested during QStash debugging
  2. `navigation.test.ts` — verify all main navigation links return 200
  3. `api-routes.test.ts` — verify all API routes respond
  4. `robots-sitemap.test.ts` — verify static files
- **Additional tests:** Add E2E tests for language switching, currency selector, and other interactive features incrementally.
- **Data-testid attributes:** E2E tests depend on `data-testid` attributes in the site's HTML. These need to be added to the relevant components. This is part of the implementation work.

## Alternatives considered

- **Use check-runner for E2E:** Rejected. check-runner is designed for Axiom evidence capture with methodology, not for simple functional E2E tests. Using it would add unnecessary complexity.
- **E2E tests in workpiece:** Rejected by operator directive. Tests must live in packages.
- **Cypress instead of Playwright:** Rejected. Playwright is already a workshop dependency (DNA: `@playwright/test` 1.62.1). Adding Cypress would duplicate browser automation infrastructure.
- **E2E tests in CI:** Rejected for now. E2E tests require a dev-deployed site, which CI doesn't have. Future: a CI job that dev-deploys, runs E2E tests, then tears down.

## Risks

- **Test flakiness:** Playwright tests can be flaky due to timing issues, animations, or network delays. Mitigated by generous timeouts (60s per test) and Playwright's auto-waiting.
- **Dev site availability:** E2E tests depend on the dev-deployed site being reachable. Mitigated by `wait-for-deploy` helper.
- **Data-testid maintenance:** Adding `data-testid` attributes to components is additional work. Mitigated by starting with existing selectors (text, role) where possible and adding `data-testid` only where needed.
- **E2E test duration:** Running 4 Playwright test files can take 1-2 minutes. Acceptable for dev-deploy (not a CI gate). Mitigated by keeping tests focused and parallelizing where possible.
- **Concurrent execution:** If two operators run `leitstand.dev-deploy` simultaneously, E2E tests run against the same dev site. The contact form test mutates state (submits a form with `formId: e2e-test`). This is unlikely in practice — dev-deploy is typically run by one operator at a time. The `formId: e2e-test` pattern ensures side-effects are recognizable and discardable.

## Acceptance criteria

- [x] `site.e2e.run` command registered and functional (evidence: packages/werkstatt-site/src/testing/module.ts:366-392)
- [x] `playwright.e2e.config.ts` created (evidence: packages/werkstatt-site/src/testing/e2e/playwright.e2e.config.ts)
- [x] Chromium pre-check integrated into `site.e2e.run` (evidence: packages/werkstatt-site/src/testing/e2e/run-e2e-tests.ts:ensureChromiumInstalled)
- [x] `contact-form.test.ts` passes against dev-deployed warpgogol-com (evidence: packages/werkstatt-site/src/testing/e2e/contact-form.test.ts — requires runtime verification by operator)
- [x] `navigation.test.ts` passes against dev-deployed warpgogol-com (evidence: packages/werkstatt-site/src/testing/e2e/navigation.test.ts — requires runtime verification by operator)
- [x] `api-routes.test.ts` passes against dev-deployed warpgogol-com (evidence: packages/werkstatt-site/src/testing/e2e/api-routes.test.ts — requires runtime verification by operator)
- [x] `robots-sitemap.test.ts` passes against dev-deployed warpgogol-com (evidence: packages/werkstatt-site/src/testing/e2e/robots-sitemap.test.ts — requires runtime verification by operator)
- [x] `leitstand.dev-deploy` calls `site.e2e.run` after Axiom + smoke (evidence: packages/werkstatt/src/leitstand/leitstand-commands.ts:1634-1638)
- [x] E2E test evidence recorded in dev-deploy state (evidence: packages/werkstatt/src/leitstand/leitstand-commands.ts:671 — e2eResult field in DevDeployResult)
- [x] `rfc.validate` passes on this file (evidence: verified during audit phase)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions, using `rfc.implement.stamp` (RFC-0476) — not manual frontmatter edits. Reference this RFC ID in commits.
- Before transitioning to `implemented`: add at least one reviewer (V-25), check all acceptance criteria with `[x]` and inline `(evidence: <file:line>)` annotations (V-26, V-27).
- Implementation should start with the Playwright config, then the command, then the contact-form test (the flow we manually tested), then pipeline integration.
- E2E tests should use `data-testid` selectors for stability. If a component doesn't have `data-testid`, add it as part of the implementation.
- The `site.e2e.run` command sets `E2E_BASE_URL` environment variable from the `--url` flag or `DevDeployResult.deploymentUrl`.
- Playwright's `test.use({ baseURL })` pattern allows tests to use relative paths (`/de/kontakt`) that resolve to the dev-deployed URL.
- The `dev-url-resolver.ts` helper is created by RFC-0823. If RFC-0823 is not yet implemented, create the helper as part of this RFC's implementation.
- The contact form test uses `formId: e2e-test` for test data isolation — the integration handler must recognize and discard messages with this `formId`.
