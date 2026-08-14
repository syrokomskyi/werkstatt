---
rfcId: RFC-0845
planId: PLAN-RFC-0845-01
status: draft
owner: architecture
createdAt: 2026-08-14
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - docs/rfcs/rfc-0845-extend-playwright-preflight-to-release-prepare-and-add-download-retry.md
---

# Implementation Plan: RFC-0845

## 1. Objectives

- [ ] Add retry logic (3 attempts, 2s/4s exponential backoff) to `ensureChromium` — maps to acceptance criteria 1–3
- [ ] Add Playwright pre-flight check to `release.prepare` (after distribution-reuse check, before build steps) — maps to acceptance criteria 4–6
- [ ] Add unit tests for retry behavior (succeed on retry, exhaust retries, no retry when installed) — maps to acceptance criteria 7–9
- [ ] Update existing `playwright-chromium-ensure.test.ts` tests for retry behavior — maps to acceptance criterion 10
- [ ] Pass `rfc.validate` and stamp as implemented — maps to acceptance criterion 11

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts` — add retry constants and retry loop in `ensureChromium`
- `packages/werkstatt/src/release/release-commands.ts` — add `playwright.preflight.check` call in `runReleasePrepare` after `canReuseDistribution` check, before `build.prepare`
- `packages/werkstatt-site/src/checks/tests/playwright-chromium-ensure.test.ts` — add retry tests, update existing tests for retry behavior

### 2.2 Configuration and data

None.

### 2.3 Documentation and specs

- RFC file (read-only reference)
- No AGENTS.md updates needed — no new commands, no new modules, no ownership changes
- No `docs/*.xml` Compass sync needed — `release.prepare` behavior change is operational, not structural

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm --filter @warpgogol/werkstatt run test`

## 3. Step sequence

### Step 1. Add retry logic to `ensureChromium`

**Goal:** Wrap the `preflightChromium` call in a retry loop with exponential backoff.

**Agent actions:**

- Add constants `ENSURE_CHROMIUM_MAX_ATTEMPTS = 3` and `ENSURE_CHROMIUM_BACKOFF_DELAYS_MS = [2_000, 4_000]` at module level in `packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts`
- Add a `sleep` helper function (or inline `await new Promise(resolve => setTimeout(resolve, delayMs))`)
- Rewrite the download section of `ensureChromium` (lines 79–86) into a retry loop:
  - Attempt 1: call `preflightChromium(false)`, then verify launch
  - On failure: log warning, sleep 2s, attempt 2
  - On failure: log warning, sleep 4s, attempt 3
  - On failure: throw last error
- Keep the `isChromiumInstalled` fast path unchanged — no retry when already installed
- Update the `MODULE_CONTRACT` CHANGE_SUMMARY with an RFC-0845 entry

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- Existing tests in `playwright-chromium-ensure.test.ts` may need updates (see Step 3)

**Completion criterion:** `ensureChromium` function contains a retry loop with 3 max attempts and 2s/4s backoff delays; `isChromiumInstalled` fast path is unchanged; TypeScript compiles.

**Human review:** no

---

### Step 2. Add pre-flight check to `release.prepare`

**Goal:** Insert `playwright.preflight.check` call in `runReleasePrepare` after the `canReuseDistribution` check, before `build.prepare`.

**Agent actions:**

- In `packages/werkstatt/src/release/release-commands.ts`, locate the `canReuseDistribution` block (around line 227–277) and the `build.prepare` call (around line 294–300)
- Insert the pre-flight check **after** the `canReuseDistribution` check resolves to `false` (i.e., inside the `else if (existsSync(workpieceDir))` branch, before `runPipelinePhase` for `build.prepare`)
- The pre-flight check follows the RFC-0813 pattern:
  - Call `executeKernelCommand({ workspaceRoot, commandName: "playwright.preflight.check", outputFormat: "pretty" })`
  - If `exitCode !== 0`: return early with `exitCode: 1`, actionable summary, and `nextSteps` with install command
  - If check passes: log success, continue to `build.prepare`
  - If check itself throws: log warning (non-fatal), continue to `build.prepare`
- Verify `executeKernelCommand` is already imported (it is used in `mission-materialization-commands.ts`); if not, add the import
- Update the `MODULE_CONTRACT` CHANGE_SUMMARY with an RFC-0845 entry

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compiles

**Completion criterion:** `runReleasePrepare` calls `playwright.preflight.check` after `canReuseDistribution` returns false and before `build.prepare`; pre-flight failure returns early with exit code 1 and actionable nextSteps; pre-flight exception is non-fatal.

**Human review:** no

---

### Step 3. Update and add unit tests

**Goal:** Add retry tests and update existing tests for the new retry behavior.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/tests/playwright-chromium-ensure.test.ts`:
  - **Update existing test "throws when preflightChromium fails"** (line 69–75): now expects 3 attempts before throwing. Mock `preflightChromium` to reject all 3 calls. Use `vi.useFakeTimers()` to skip backoff delays. Assert `preflightChromium` was called 3 times.
  - **Add test "retries preflightChromium and succeeds on second attempt"**: Mock `preflightChromium` to reject once, then resolve. Mock `chromium.launch` to fail once (triggering download path), then succeed. Use fake timers for backoff. Assert result is successful, `preflightChromium` called twice.
  - **Add test "retries preflightChromium and succeeds on third attempt"**: Mock `preflightChromium` to reject twice, then resolve. Assert `preflightChromium` called 3 times, result successful.
  - **Add test "does not retry when Chromium is already installed"**: Mock `chromium.launch` to succeed immediately. Assert `preflightChromium` was never called.
  - **Update existing test "throws when launch fails after preflightChromium"** (line 77–83): now needs to account for 3 retry attempts of `preflightChromium` before the final launch failure. Mock `preflightChromium` to resolve all 3 times, but `chromium.launch` fails all 4 times (1 initial + 3 post-install). Assert it throws after 3 attempts.
- Use `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync()` to avoid real 2s/4s waits in tests
- Restore real timers in `afterEach`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass

**Completion criterion:** All retry tests pass; existing tests updated for retry behavior; no real-time delays in tests (fake timers used).

**Human review:** no

---

### Step 4. Run full validation suite

**Goal:** Verify all acceptance criteria pass.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt-site run build:check`
- Run `pnpm --filter @warpgogol/werkstatt run build:check`
- Run `pnpm --filter @warpgogol/werkstatt-site run test`
- Run `pnpm --filter @warpgogol/werkstatt run test`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0845`

**Validation:**

- All commands exit 0

**Completion criterion:** All build:check and test commands pass; `rfc.validate` passes with 0 violations.

**Human review:** no

---

### Step 5. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files if any ownership or module changes are needed (likely none — no new commands or modules).
- Update affected `docs/*.xml` Compass files if repository-wide semantics changed (likely none — operational change only).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0845 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0845`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0845`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0845` in the subject line (RFC-0265 commit hygiene)
- No acceptance probes declared in RFC frontmatter — `rfc.verification.emit` not required

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Retry adds latency (up to 6s worst case) | Step 1 — backoff constants are bounded (2s, 4s); tests use fake timers to avoid real waits |
| `release.prepare` pre-flight false negative | Step 2 — non-fatal pattern from RFC-0813; pre-flight is best-effort, not a guarantee |
| Exponential backoff in CI | Step 1 — 3 attempts with 2s/4s is a reasonable default; constants can be adjusted via env vars in a future RFC |
| Existing tests break due to retry behavior | Step 3 — existing tests updated to account for 3 retry attempts; fake timers prevent real delays |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0845 --reason "..." --invariant "DNA-N"` instead of working around it.
