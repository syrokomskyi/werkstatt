---
rfcId: RFC-0623
planId: PLAN-RFC-0623-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0623

## 1. Objectives

- [ ] Objective 1 — implement `runWranglerDeployWithRetry` helper with `TRANSIENT_ERROR_PATTERNS` constant (maps to acceptance criterion: helper implemented)
- [ ] Objective 2 — refactor `propagate` and `rollback` to use the helper (maps to acceptance criteria: propagate refactored, rollback refactored)
- [ ] Objective 3 — transient error pattern matching covers 502/503/504/522/Gateway Timeout/malformed response (maps to acceptance criterion: pattern matching)
- [ ] Objective 4 — non-retryable errors fail immediately (maps to acceptance criterion: no retry on auth error)
- [ ] Objective 5 — retry attempts logged to stderr (maps to acceptance criterion: retry logged)
- [ ] Objective 6 — unit tests verify retry on transient, no retry on auth, success after retry (maps to acceptance criterion: unit tests)
- [ ] Objective 7 — update AGENTS.md Leitstand section (maps to file system responsibilities table)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts` — add `TRANSIENT_ERROR_PATTERNS` constant, `runWranglerDeployWithRetry` helper, refactor `propagate` and `rollback` methods
- `packages/os/site-kernel-handoff/src/tests/cloudflare-workers.test.ts` — add unit tests for retry behavior

### 2.2 Configuration and data

None — retry parameters are hardcoded constants, not configurable.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update Leitstand section to document retry behavior for `wrangler deploy`

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0623` — RFC validation

## 3. Step sequence

### Step 1. Implement `TRANSIENT_ERROR_PATTERNS` and `runWranglerDeployWithRetry` helper

**Goal:** Add the transient error pattern constant and the retry helper function to `cloudflare-workers.ts`.

**Agent actions:**

- Add `TRANSIENT_ERROR_PATTERNS: readonly RegExp[]` constant with patterns for 502, 503, 504, 522, "Gateway Timeout", "malformed response", "Received a malformed response from the API"
- Add `isTransientError(stderr: string): boolean` helper that tests stderr against all patterns
- Add `runWranglerDeployWithRetry(runner, args, opts, maxRetries=2, delaysMs=[30_000, 60_000])` async function:
  - Calls `runner("npx", args, opts)`
  - On non-zero exit code, checks `isTransientError(result.stderr)`
  - If transient and retries remain: logs attempt number and delay to stderr, waits via `setTimeout` wrapped in Promise, retries
  - If non-transient or retries exhausted: returns the result
  - On success (exit 0): returns result immediately
- Use `CommandRunner` type from `adapter.ts` for the runner parameter — no new interfaces

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `runWranglerDeployWithRetry` function and `TRANSIENT_ERROR_PATTERNS` constant exist in `cloudflare-workers.ts` and typecheck passes.

**Human review:** no

---

### Step 2. Refactor `propagate` method to use `runWranglerDeployWithRetry`

**Goal:** Replace the direct `runner("npx", wranglerArgs, ...)` call in `propagate` with `runWranglerDeployWithRetry`.

**Agent actions:**

- Replace `const result = await runner("npx", wranglerArgs, { cwd: input.distPath, env });` with `const result = await runWranglerDeployWithRetry(runner, wranglerArgs, { cwd: input.distPath, env });`
- Remove the existing error logging block (lines 193-195) — the retry helper now handles failure logging
- Keep the rest of the `propagate` logic unchanged (success path, URL extraction, return shape)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes
- Existing test `adapter: propagate succeeds when wrangler exits 0` still passes
- Existing test `adapter: propagate fails when wrangler exits non-zero` still passes (non-zero with non-transient stderr → no retry → immediate fail)

**Completion criterion:** `propagate` method calls `runWranglerDeployWithRetry` instead of `runner` directly; existing tests pass.

**Human review:** no

---

### Step 3. Refactor `rollback` method to use `runWranglerDeployWithRetry`

**Goal:** Replace the direct `runner("npx", wranglerArgs, ...)` call in `rollback` with `runWranglerDeployWithRetry`.

**Agent actions:**

- Replace `const result = await runner("npx", wranglerArgs, { cwd: input.distPath, env });` with `const result = await runWranglerDeployWithRetry(runner, wranglerArgs, { cwd: input.distPath, env });`
- Keep the rest of the `rollback` logic unchanged (URL extraction, state determination, return shape)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes
- Existing test `adapter: rollback succeeds when wrangler exits 0` still passes

**Completion criterion:** `rollback` method calls `runWranglerDeployWithRetry` instead of `runner` directly; existing tests pass.

**Human review:** no

---

### Step 4. Add unit tests for retry behavior

**Goal:** Verify retry behavior with unit tests using `vi.useFakeTimers()` to avoid real 30s/60s waits.

**Agent actions:**

- Add test: retry on transient 5xx error (stub runner fails with "504 Gateway Timeout" on first call, succeeds on second; verify runner called twice, state is "succeeded")
- Add test: no retry on auth error (stub runner fails with "Authentication error" exit 1; verify runner called once, state is "failed")
- Add test: success after retry on 522 (stub runner fails with "522" on first call, succeeds on second; verify state is "succeeded")
- Add test: all retries exhausted (stub runner always fails with "503"; verify runner called 3 times, state is "failed")
- Add test: no retry on exit 1 with non-transient stderr (stub runner fails with "Syntax error"; verify runner called once)
- Add test: rollback retries on transient error (same pattern as propagate test but for rollback method)
- Use `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync(30_000)` to skip delays
- Use the existing `stubRunner` pattern but make it stateful (track call count, return different results per call)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` passes with all new tests
- No real-time delays in test output (tests complete in <1s)

**Completion criterion:** 6+ new tests pass covering: retry on transient, no retry on auth, success after retry, retries exhausted, non-transient no-retry, rollback retry.

**Human review:** no

---

### Step 5. Update AGENTS.md

**Goal:** Document the retry behavior in the Leitstand section of `packages/os/site-kernel-handoff/AGENTS.md`.

**Agent actions:**

- Add a bullet point in the Leitstand section documenting: `wrangler deploy` in the cloudflare-workers adapter retries up to 2 times (3 total attempts) with 30s and 60s delays on transient Cloudflare API errors (502, 503, 504, 522, Gateway Timeout, malformed response). Non-retryable errors fail immediately. The retry is internal to the adapter and transparent to callers.

**Validation:**

- `git diff packages/os/site-kernel-handoff/AGENTS.md` shows the addition

**Completion criterion:** AGENTS.md Leitstand section mentions retry behavior for `wrangler deploy`.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated with retry behavior documentation.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0623` — must pass.
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — must pass.
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test` — must pass.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0623 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0623` passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0623`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0623` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positive on stderr pattern matching | Step 4 tests verify non-transient errors (auth, syntax) are not retried |
| Increased wall-clock time on failure (90s worst case) | Step 4 tests use `vi.useFakeTimers()` to verify retry timing without real delays |
| Cloudflare API outage longer than 90s | Step 4 test "all retries exhausted" verifies correct failure behavior |
| Agent misinterpretation (retry applies to all commands) | Step 5 AGENTS.md update explicitly scopes retry to `wrangler deploy` in cloudflare-workers adapter only |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0623 --reason "..." --invariant "DNA-49"` instead of working around it.
