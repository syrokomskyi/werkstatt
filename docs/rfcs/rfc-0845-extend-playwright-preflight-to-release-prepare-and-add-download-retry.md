---
id: RFC-0845
title: "Extend Playwright pre-flight to release.prepare and add download retry"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-14
updatedAt: 2026-08-14
enhancedAt: 2026-08-14
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0647
  - RFC-0813
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - release.prepare
    - playwright.chromium.ensure
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "release.prepare fails fast with a clear error message when Playwright Chromium is not installed, before starting the 46-step build.post pipeline."
  - "ensureChromium retries the Chromium download up to 3 times with exponential backoff on network failures."
  - "The pre-flight check in release.prepare produces an actionable next-step message: 'Run: pnpm exec playwright install chromium'."
nonGoals:
  - "This RFC does not change the Playwright version pin or the postinstall script that runs `playwright install chromium`."
  - "This RFC does not add pre-flight checks to leitstand.dev-deploy — its build.post pipeline already includes playwright.chromium.ensure (RFC-0647) which gains retry from this RFC. leitstand.propagate does not run build steps (deploys an already-built release)."
  - "This RFC does not modify preflightChromium in @syrokomskyi/axiom-factory-app — retry is added in the ensureChromium wrapper."
---

# RFC-0845: Extend Playwright pre-flight to release.prepare and add download retry

## Context

RFC-0813 added a Playwright Chromium pre-flight check to `mission.validate` — it calls `playwright.preflight.check` before the expensive `build.prepare` + `build.check` + `astro build` + `build.post` cycle. If Chromium is not installed, `mission.validate` fails within seconds with an actionable error message.

However, `release.prepare` also runs a build pipeline (`build.post` with 46 steps) that requires Playwright Chromium (for `print.pdf.generate` and `qa.independent.run`), but it does **not** have the same pre-flight check. During mission `warpgogol-com-m000056`, `release.prepare` failed at step 1/46 of `build.post` because `playwright.chromium.ensure` tried to download Chromium Headless Shell (114 MiB) and the download stalled at 5%. The operator had to manually run `pnpm exec playwright install chromium` and re-run `release.prepare`.

Additionally, `ensureChromium` (RFC-0647) delegates to `preflightChromium` from `@syrokomskyi/axiom-factory-app` for auto-install, but `preflightChromium` has **no retry logic** — a single network failure during download causes the entire ensure to fail.

## Problem

### 1. `release.prepare` lacks Playwright pre-flight

`mission.validate` has a pre-flight check (RFC-0813, `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt/src/mission/mission-materialization-commands.ts:428-477`) that fails fast if Chromium is not installed. `release.prepare` does not have this check — it discovers the missing Chromium only when `build.post` step 1/46 tries to use it, after the release directory is already set up.

### 2. `ensureChromium` has no download retry

`ensureChromium` (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts:69-87`) calls `preflightChromium(false)` which downloads Chromium. If the download fails (network timeout, CDN error), `preflightChromium` throws immediately. There is no retry. The Chromium download is 114 MiB — network reliability for large downloads is not guaranteed, especially in CI environments.

## Decision

### 1. Add Playwright pre-flight to `release.prepare`

Insert a `playwright.preflight.check` call in `release.prepare`, **after** the `canReuseDistribution` check and **before** starting `build.prepare`. If the distribution is reused, `build.post` is not run and Chromium is not needed — the pre-flight is skipped, same as RFC-0813 skips it on the distribution-reuse path in `mission.validate`. If the check fails, return early with an actionable error message — same pattern as RFC-0813.

### 2. Add download retry to `ensureChromium`

Wrap the `preflightChromium` call in a retry loop (3 attempts, exponential backoff: 2s, 4s). If all 3 attempts fail, throw the last error. This is a non-breaking change — callers that already catch the error (e.g., `mission.materialize`) continue to work.

## Architectural fit

- **Builds on RFC-0813:** Extends the pre-flight pattern from `mission.validate` to `release.prepare`. Both commands run expensive build pipelines that require Playwright Chromium.
- **Extends RFC-0647:** Adds retry to the `ensureChromium` wrapper without modifying `preflightChromium` in `@syrokomskyi/axiom-factory-app`. The retry is in the wrapper, not the underlying library.
- **Fail-fast pattern:** Consistent with the existing pre-flight philosophy — verify infrastructure before expensive operations.

## Design

### `release.prepare` pre-flight integration

Insert in `release.prepare`, after the `canReuseDistribution` check (skip pre-flight when distribution is reused) and before starting `build.prepare`:

```ts
// RFC-0845: Playwright Chromium pre-flight — fail fast before expensive build.post cycle.
try {
  const preflightResult = (await executeKernelCommand({
    workspaceRoot,
    commandName: "playwright.preflight.check",
    outputFormat: "pretty",
  })) as { exitCode?: number; summary?: string };
  if ((preflightResult.exitCode ?? 0) !== 0) {
    const msg = preflightResult.summary ?? "Playwright Chromium is not installed";
    logger.info(`  [preflight] ${msg}`);
    return {
      data: { /* ... release prepare failure report ... */ },
      exitCode: 1,
      summary: `[release.prepare] pre-flight FAILED: Playwright Chromium is not installed`,
      nextSteps: [
        {
          action: `Run: pnpm exec playwright install chromium, then re-run: pnpm exec werkstatt run release.prepare --release ${releaseId}`,
          kind: "required",
        },
      ],
    };
  }
  logger.info(`  Playwright Chromium: pre-flight check passed`);
} catch (err) {
  logger.warn(
    `  Playwright Chromium pre-flight check error (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
  );
}
```

### `ensureChromium` download retry

```ts
const ENSURE_CHROMIUM_MAX_ATTEMPTS = 3;
const ENSURE_CHROMIUM_BACKOFF_DELAYS_MS = [2_000, 4_000];

export async function ensureChromium(
  _workspaceRoot: string,
  logger: { info: (msg: string) => void },
): Promise<PlaywrightChromiumEnsureResult> {
  const status = await isChromiumInstalled(_workspaceRoot);
  if (status.installed) {
    logger.info(`  Playwright Chromium: already installed (${status.revision})`);
    return { installed: true, chromiumRevision: status.revision ?? null, skipped: true };
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= ENSURE_CHROMIUM_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const delayMs = ENSURE_CHROMIUM_BACKOFF_DELAYS_MS[attempt - 2];
      logger.info(`  Playwright Chromium: retry ${attempt}/${ENSURE_CHROMIUM_MAX_ATTEMPTS} after ${delayMs / 1000}s...`);
      await sleep(delayMs);
    }
    try {
      await preflightChromium(false);

      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      const revision = browser.version();
      await browser.close();
      logger.info(`  Playwright Chromium: installed (${revision})`);
      return { installed: true, chromiumRevision: revision, skipped: false };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < ENSURE_CHROMIUM_MAX_ATTEMPTS) {
        logger.warn(`  Playwright Chromium: install attempt ${attempt} failed — ${lastError.message}`);
      }
    }
  }

  throw lastError ?? new Error("Playwright Chromium installation failed after all retries");
}
```

### Output format

`release.prepare` failure (pre-flight):

```json
{
  "data": { "/* release prepare failure report */": true },
  "exitCode": 1,
  "summary": "[release.prepare] pre-flight FAILED: Playwright Chromium is not installed",
  "nextSteps": [
    { "action": "Run: pnpm exec playwright install chromium, then re-run: pnpm exec werkstatt run release.prepare --release <releaseId>", "kind": "required" }
  ]
}
```

`playwright.chromium.ensure` after retry exhaustion:

```json
{
  "data": { "installed": false, "chromiumRevision": null, "skipped": false },
  "exitCode": 1,
  "summary": "playwright.chromium.ensure: <last error message>"
}
```

### Failure modes

| Failure | Behavior |
| --- | --- |
| Chromium not installed, pre-flight in release.prepare | Exit code 1, actionable error with install command. Build steps not started. |
| Chromium installed, pre-flight in release.prepare | Exit code 0, silent pass. Build steps proceed. |
| Pre-flight check itself throws | Non-fatal: log warning, continue with build steps (same as RFC-0813). |
| Distribution reused | Pre-flight skipped entirely — no browser launch. |
| ensureChromium: download fails attempt 1 | Retry after 2s backoff. |
| ensureChromium: download fails attempt 2 | Retry after 4s backoff. |
| ensureChromium: download fails attempt 3 | Throw last error. Caller handles (fatal in build.post, non-fatal in mission.materialize). |
| ensureChromium: already installed | Fast path — no download, no retry. |

### File system responsibilities

| File | Change |
| --- | --- |
| `packages/werkstatt/src/release/release-commands.ts` | Add Playwright pre-flight check after `canReuseDistribution`, before `build.prepare` |
| `packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts` | Add retry loop around `preflightChromium` call |
| `packages/werkstatt-site/src/checks/tests/playwright-chromium-ensure.test.ts` | Add tests for retry logic |

### Unit tests

- **Retry succeeds on second attempt:** Mock `preflightChromium` to fail once, then succeed. Verify `ensureChromium` returns successfully.
- **Retry exhausts all attempts:** Mock `preflightChromium` to always fail. Verify `ensureChromium` throws after 3 attempts.
- **No retry when already installed:** Mock `isChromiumInstalled` to return `true`. Verify `preflightChromium` is never called.
- **`release.prepare` pre-flight:** Integration test verifying that `release.prepare` fails fast when Chromium is not installed.

### Compass sync

This RFC changes `release.prepare` behavior. `docs/verification-plan.xml` may need synchronization if it documents the release.prepare step sequence. No other Compass documents are affected.

## Rollout

1. **Update `ensureChromium`** with retry loop in `playwright-chromium-ensure.ts`.
2. **Update `playwright-chromium-ensure.test.ts`** with retry tests.
3. **Add pre-flight to `release.prepare`** in `release-prepare.ts`.
4. **Run existing tests** to verify no regressions.

## Alternatives considered

- **Add retry to `preflightChromium` in `@syrokomskyi/axiom-factory-app`:** Rejected because that package is external to the Werkstatt monorepo. The retry belongs in the Werkstatt wrapper (`ensureChromium`) which is under our control.

- **Make `release.prepare` depend on `mission.validate` having already run:** Rejected because `release.prepare` can be invoked independently (e.g., re-running after a fix). It should be self-contained with its own pre-flight.

- **Use `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` env var to skip download:** This is already handled by `preflightChromium`. The retry is for when download is attempted but fails — a different scenario.

## Risks

- **Retry adds latency:** Worst case (3 failed attempts with 2s + 4s backoff): 6 seconds of waiting plus 3 download attempts. This is acceptable — the alternative is a complete pipeline failure that requires manual intervention.

- **`release.prepare` pre-flight false negative:** If `playwright.preflight.check` passes but Chromium becomes unavailable during `build.post`, the build still fails. This is the same risk as RFC-0813 in `mission.validate` — the pre-flight is a best-effort check, not a guarantee.

- **Exponential backoff in CI:** CI environments may have network issues that persist for longer than 6 seconds. The 3-attempt retry with 2s/4s backoff is a reasonable default. If CI environments need more aggressive retry, the constants can be adjusted via env vars in a future RFC.

## Acceptance criteria

- [x] `ensureChromium` retries `preflightChromium` up to 3 times with 2s/4s exponential backoff (evidence: packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts:70-71, ENSURE_CHROMIUM_MAX_ATTEMPTS=3, ENSURE_CHROMIUM_BACKOFF_DELAYS_MS=[2_000, 4_000])
- [x] `ensureChromium` throws the last error after all retries are exhausted (evidence: packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts:110, throw lastError)
- [x] `ensureChromium` does not retry when Chromium is already installed (fast path) (evidence: packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts:81-85, isChromiumInstalled early return)
- [x] `release.prepare` calls `playwright.preflight.check` before any build steps (evidence: packages/werkstatt/src/release/release-commands.ts:296-323, pre-flight inserted before build.prepare at line 325)
- [x] `release.prepare` fails fast with actionable error message when Chromium is not installed (evidence: packages/werkstatt/src/release/release-commands.ts:319-323, throw with install command and re-run instructions)
- [x] `release.prepare` pre-flight is non-fatal if the check itself throws (same pattern as RFC-0813) (evidence: packages/werkstatt/src/release/release-commands.ts:313-318, catch block logs warning and continues)
- [x] Unit test: retry succeeds on second attempt (evidence: packages/werkstatt-site/src/checks/tests/playwright-chromium-ensure.test.ts:72-88, "retries preflightChromium and succeeds on second attempt")
- [x] Unit test: retry exhausts all 3 attempts and throws (evidence: packages/werkstatt-site/src/checks/tests/playwright-chromium-ensure.test.ts:109-118, "throws after all 3 retry attempts fail")
- [x] Unit test: no retry when already installed (evidence: packages/werkstatt-site/src/checks/tests/playwright-chromium-ensure.test.ts:120-127, "does not retry when Chromium is already installed")
- [x] Existing `playwright-chromium-ensure.test.ts` tests pass (updated for retry behavior) (evidence: vitest run — 9/9 tests pass)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0845 — 0 violations, exitCode 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT modify `preflightChromium` in `@syrokomskyi/axiom-factory-app` — retry is in the `ensureChromium` wrapper only.
- Agents MUST NOT make the `release.prepare` pre-flight fatal if the check command itself throws — follow the non-fatal pattern from RFC-0813.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0845 --reason "..." --invariant "DNA-N"` instead of working around it.
