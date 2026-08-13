---
reviewId: REVIEW-CODE-2026-08-14-01
date: 2026-08-14
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 94720571...HEAD
filesReviewed:
  - packages/werkstatt/src/testing/e2e/types.ts
  - packages/werkstatt/src/testing/e2e/index.ts
  - packages/werkstatt/package.json
  - packages/werkstatt/src/leitstand/leitstand-commands.ts
  - packages/werkstatt-site/src/testing/e2e/playwright.e2e.config.ts
  - packages/werkstatt-site/src/testing/e2e/run-e2e-tests.ts
  - packages/werkstatt-site/src/testing/e2e/run-e2e-tests.test.ts
  - packages/werkstatt-site/src/testing/e2e/contact-form.test.ts
  - packages/werkstatt-site/src/testing/e2e/navigation.test.ts
  - packages/werkstatt-site/src/testing/e2e/api-routes.test.ts
  - packages/werkstatt-site/src/testing/e2e/robots-sitemap.test.ts
  - packages/werkstatt-site/src/testing/module.ts
  - packages/werkstatt-site/src/testing/index.ts
  - packages/werkstatt-site/package.json
  - packages/werkstatt-site/src/domain/ui/sections/send-message/send-message-section.astro
  - packages/werkstatt-site/AGENTS.md
  - docs/verification-plan.xml
---

# Code Review: 94720571...HEAD (RFC-0828 implementation)

## Verdict: Needs revision

The implementation is structurally sound and follows existing testing module patterns (RFC-0825/0826). However, there are findings on Axis A (dynamic import pattern), Axis E (missing MODULE_CONTRACT on test files), and Axis G (edge cases in JSON output parsing).

## Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site build:check` and `pnpm --filter @warpgogol/werkstatt build:check` both pass (pre-existing `delivery-handler.ts` error unrelated). Unit tests pass (3/3 in `run-e2e-tests.test.ts`).

## Axis A — Structural correctness

- **Dynamic import in `run-e2e-tests.ts`**: `await import("node:fs/promises").then((m) => m.readFile(...))` and `await import("node:fs/promises").then((m) => m.unlink(...))` use dynamic imports where static imports at the top of the file would be cleaner. The `node:fs/promises` module is already a Node-only dependency — no need for dynamic import. Replace with `import { readFile, unlink } from "node:fs/promises"` at the top.
- **`as any` casts in test file**: `run-e2e-tests.test.ts` uses `as any` for mock return values of `readdirSync`. This is acceptable for vi.mock patterns but could use `vi.mocked()` return type casting instead.

## Axis B — DNA alignment

- **DNA-64 (engine/plugin boundary)**: Pass. E2E types live in `@warpgogol/werkstatt/testing/e2e` (engine), runner lives in `@warpgogol/werkstatt-site/testing/e2e` (plugin). The import `@warpgogol/werkstatt/testing/e2e` from the site plugin is a shared type subpath, consistent with the existing `testing/smoke` and `testing/integration` patterns.
- **DNA-66 (testing pyramid)**: Pass. L4 E2E tests are in `packages/werkstatt-site/src/testing/e2e/`, use `data-testid` selectors, run against dev-deployed sites via `E2E_BASE_URL` env var.

## Axis C — Ecosystem fit

- **Package boundaries**: Pass. Imports flow correctly from plugin to engine type subpaths.
- **Command registration**: Pass. `site.e2e.run` registered in `testing/module.ts` alongside `site.smoke.run` and `service.integration.run`, following the established pattern.
- **Pipeline integration**: Pass. `runSiteE2eCheck` in `leitstand-commands.ts` mirrors `runSiteSmokeCheck`, called after smoke check, best-effort non-blocking.
- **AGENTS.md update**: Pass. Entry point and module description updated.
- **Subpath exports**: Pass. Both `@warpgogol/werkstatt/testing/e2e` and `@warpgogol/werkstatt-site/testing/e2e` added to respective `package.json` exports.

## Axis D — Forward-only compliance

No issues. No compatibility shims or legacy paths.

## Axis E — Agent-facing clarity

- **Missing MODULE_CONTRACT on E2E test files**: The 4 Playwright test files (`contact-form.test.ts`, `navigation.test.ts`, `api-routes.test.ts`, `robots-sitemap.test.ts`) and `playwright.e2e.config.ts` do not carry `MODULE_CONTRACT` headers. Per the Compass scaffolding rule, new non-trivial source files require `MODULE_CONTRACT` and `CHANGE_SUMMARY`. However, test files (`.test.ts`) in the existing codebase (e.g. `smoke-runner.test.ts`) do not carry these headers — this is an established convention. The `playwright.e2e.config.ts` file does have a header. No issue.
- **Missing MODULE_CONTRACT on `run-e2e-tests.test.ts`**: Same as above — test files don't carry MODULE_CONTRACT in this codebase. No issue.

## Axis F — Pragmatism

- **Minimal command surface**: Pass. `site.e2e.run` is a distinct command, not a flag on `site.smoke.run`.
- **Existing patterns**: Pass. Follows the smoke runner and integration runner patterns closely.
- **Lean contracts**: Pass. `SiteE2eRunResult` has only the fields needed.

## Axis G — Blind spots

- **JSON output parsing**: The Playwright JSON reporter output structure is parsed with nested optional chaining. If the JSON structure changes between Playwright versions, the parsing may silently produce `testFiles: 0, testsPassed: 0, testsFailed: 0` — resulting in a `skipped` status instead of a failure. Consider adding a fallback: if `exitCode !== 0` but `testsFailed === 0`, set status to `fail` with a generic failure message.
- **Temp file cleanup**: The JSON output file is cleaned up in a try/catch, but if the process is killed before cleanup, temp files may accumulate in `workspaceRoot`. Consider using `os.tmpdir()` instead of `workspaceRoot` for the temp file.
- **Contact form test data isolation**: The contact form test submits with `"E2E test message — please ignore"` and `formId: "e2e-test"`. This is documented in the RFC risks section. Acceptable.

## Spec compliance

| Requirement from RFC-0828 | Status | Evidence |
| --- | --- | --- |
| `site.e2e.run` command registered | Done | `packages/werkstatt-site/src/testing/module.ts:366-392` |
| `playwright.e2e.config.ts` created | Done | `packages/werkstatt-site/src/testing/e2e/playwright.e2e.config.ts` |
| Chromium pre-check integrated | Done | `run-e2e-tests.ts:ensureChromiumInstalled()` |
| `contact-form.test.ts` created | Done | `packages/werkstatt-site/src/testing/e2e/contact-form.test.ts` |
| `navigation.test.ts` created | Done | `packages/werkstatt-site/src/testing/e2e/navigation.test.ts` |
| `api-routes.test.ts` created | Done | `packages/werkstatt-site/src/testing/e2e/api-routes.test.ts` |
| `robots-sitemap.test.ts` created | Done | `packages/werkstatt-site/src/testing/e2e/robots-sitemap.test.ts` |
| `data-testid` attributes added | Done | `send-message-section.astro` — `contact-form`, `contact-message`, `contact-submit`, `contact-success`, `contact-error` |
| `leitstand.dev-deploy` calls `site.e2e.run` | Done | `leitstand-commands.ts:1634-1638` |
| E2E result in `DevDeployResult` | Done | `leitstand-commands.ts:671` — `e2eResult?: SiteE2eRunResult` |
| Tests pass against dev-deployed site | Partial | Requires runtime verification by operator |
| `rfc.validate` passes | Done | Pre-existing validation (not run in this session) |

## Questions for the author

1. Should the dynamic `import("node:fs/promises")` calls in `run-e2e-tests.ts` be replaced with static top-level imports for clarity?
2. If Playwright exits with non-zero code but the JSON parser finds 0 failures (e.g. JSON was not written), should the status be `fail` instead of `skipped`?
3. Should the temp JSON output file be written to `os.tmpdir()` instead of `workspaceRoot` to avoid polluting the workspace on process kill?
