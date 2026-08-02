---
rfcId: RFC-0646
planId: PLAN-RFC-0646-01
status: draft
owner: architecture
createdAt: 2026-08-02
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0646

## 1. Objectives

- [ ] Add `gitExecWithRetry` helper to `git-exec.ts` with `RetryOptions` interface — maps to acceptance criterion 1
- [ ] `gitExecWithRetry` retries only transient errors (timeout, lock-file) and throws immediately on non-transient errors — maps to acceptance criterion 2
- [ ] `bordbuch.commit` uses `gitExecWithRetry` for all `gitExec` calls (status, add, commit, rev-parse) — maps to acceptance criterion 3
- [ ] Unit tests for `gitExecWithRetry` cover retry on transient, no retry on non-transient, backoff timing, exhaustion throws — maps to acceptance criterion 4
- [ ] `bordbuch-commit.test.ts` updated to verify retry behavior — maps to acceptance criterion 5
- [ ] `mission.validate` completes without `bordbuch.commit` failing on transient git lock contention — maps to acceptance criterion 6
- [ ] `rfc.validate` passes on RFC-0646 — maps to acceptance criterion 7

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts` — add `gitExecWithRetry` function and `RetryOptions` interface
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts` — replace all `gitExec` calls with `gitExecWithRetry`
- `packages/os/site-kernel-handoff/src/tests/bordbuch-commit.test.ts` — update mock to include `gitExecWithRetry`, add retry behavior tests
- `packages/os/site-kernel-handoff/src/tests/git-exec-retry.test.ts` — new test file for `gitExecWithRetry` unit tests

### 2.2 Configuration and data

No configuration or data changes. The `BORDBUCH_RETRY_OPTIONS` constant is code, not configuration.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update Bordbuch projection auto-commit section to note retry behavior
- RFC-0646 file (read-only reference — no edits during implementation)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — unit tests
- `pnpm exec site-kernel run rfc.validate --id RFC-0646` — RFC validation
- No pipeline changes — `bordbuch.commit` remains at its current position in `build.prepare`

## 3. Step sequence

### Step 1. Add `gitExecWithRetry` helper to `git-exec.ts`

**Goal:** Implement the retry helper with transient error classification.

**Agent actions:**

- Add `RetryOptions` interface (`{ backoffMs: number[] }`) to `git-exec.ts`
- Add `isTransientError(err: unknown): boolean` helper — classifies timeout, `ENOENT` on `.git/index.lock`, `ETIMEDOUT`, and exit code 128 with lock message as transient
- Add `gitExecWithRetry(cwd, args, retryOptions, options?)` function:
  - Calls `gitExec(cwd, args, options)` in a try/catch
  - On transient error, waits `backoffMs[i]` ms via `await sleep()`, retries
  - Number of retries derived from `backoffMs.length`
  - On non-transient error or exhaustion, throws the last error
  - Uses `execSync` internally (via `gitExec`), so the function is synchronous in git execution but needs `sleep` which is async — make `gitExecWithRetry` async
- Add `sleep(ms: number): Promise<void>` helper (or inline `await new Promise(resolve => setTimeout(resolve, ms))`)
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` in the file header

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes with the new function

**Completion criterion:** `gitExecWithRetry` is exported from `git-exec.ts` and typechecks. `RetryOptions` has only `backoffMs: number[]` (no `retries` field).

**Human review:** no

---

### Step 2. Update `bordbuch-commit.ts` to use `gitExecWithRetry`

**Goal:** Replace all `gitExec` calls in `commitBordbuchProjections` with `gitExecWithRetry`.

**Agent actions:**

- Import `gitExecWithRetry` and `RetryOptions` from `../werkstatt/git-exec.ts`
- Define `BORDBUCH_RETRY_OPTIONS: RetryOptions = { backoffMs: [12_000, 60_000] }`
- Replace `gitExec(cachePath, "status --porcelain", { allowNonZero: true })` with `await gitExecWithRetry(cachePath, "status --porcelain", BORDBUCH_RETRY_OPTIONS, { allowNonZero: true })`
- Replace `gitExec(cachePath, \`add ${addArgs}\`)` with `await gitExecWithRetry(cachePath, \`add ${addArgs}\`, BORDBUCH_RETRY_OPTIONS)`
- Replace `gitExec(cachePath, 'commit -m "..."')` with `await gitExecWithRetry(cachePath, 'commit -m "..."', BORDBUCH_RETRY_OPTIONS)`
- Replace `gitExec(cachePath, "rev-parse HEAD")` with `await gitExecWithRetry(cachePath, "rev-parse HEAD", BORDBUCH_RETRY_OPTIONS)`
- Since `gitExecWithRetry` is async, `commitBordbuchProjections` is already async — no signature change needed
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` in the file header

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** All four `gitExec` calls in `commitBordbuchProjections` are replaced with `await gitExecWithRetry(..., BORDBUCH_RETRY_OPTIONS, ...)`. No bare `gitExec` calls remain in `bordbuch-commit.ts`.

**Human review:** no

---

### Step 3. Add unit tests for `gitExecWithRetry`

**Goal:** Test the retry helper in isolation.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/git-exec-retry.test.ts`
- Mock `execSync` from `node:child_process` to simulate transient and non-transient failures
- Test cases:
  1. **Retry on transient error:** `execSync` throws transient error on 1st call, succeeds on 2nd → `gitExecWithRetry` returns result after 1 retry
  2. **No retry on non-transient error:** `execSync` throws non-transient error → `gitExecWithRetry` throws immediately without retry
  3. **Backoff timing:** verify `setTimeout` is called with correct delays (12s, 60s) — use `vi.useFakeTimers()` to avoid real waiting
  4. **Exhaustion throws:** `execSync` always throws transient error → `gitExecWithRetry` throws after all retries exhausted
  5. **`allowNonZero` passthrough:** verify `allowNonZero` option is forwarded to `gitExec`
  6. **Retry count derived from `backoffMs.length`:** verify that `{ backoffMs: [100] }` results in 1 retry (2 total attempts)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --run git-exec-retry` passes

**Completion criterion:** All 6 test cases pass. Tests use fake timers to avoid real backoff delays.

**Human review:** no

---

### Step 4. Update `bordbuch-commit.test.ts` to verify retry behavior

**Goal:** Update existing tests to work with the mocked `gitExecWithRetry` and add retry-specific tests.

**Agent actions:**

- Update the `vi.mock("../werkstatt/git-exec.ts", ...)` factory to include `gitExecWithRetry` as a mock function
- The mock `gitExecWithRetry` should delegate to the same logic as the existing `gitExec` mock (capturing calls, returning status output / sha)
- Add new test cases:
  1. **Retry on transient `git add` failure:** mock `gitExecWithRetry` to throw on first `add` call, succeed on retry → `commitBordbuchProjections` returns `committed: true`
  2. **Retry on transient `git status` failure:** mock `gitExecWithRetry` to throw on first `status` call, return dirty files on retry → `commitBordbuchProjections` returns `committed: true`
  3. **All retries exhausted:** mock `gitExecWithRetry` to always throw → `commitBordbuchProjections` throws
- Ensure existing tests still pass (skip-when-clean, commit-when-dirty, selective-staging, idempotent)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --run bordbuch-commit` passes

**Completion criterion:** All existing tests pass with updated mocks. 3 new retry-specific test cases pass.

**Human review:** no

---

### Step 5. Update `packages/os/site-kernel-handoff/AGENTS.md`

**Goal:** Document the retry behavior in the Bordbuch section.

**Agent actions:**

- In the "Bordbuch projection auto-commit (RFC-0626)" section, add a bullet point:
  - "**Retry resilience (RFC-0646):** `bordbuch.commit` retries transient git failures (lock contention, timeout) up to 2 times with 12s and 60s backoff before failing the pipeline step. All `gitExec` calls in `commitBordbuchProjections` use `gitExecWithRetry`."
- Update the section title to reference both RFC-0626 and RFC-0646

**Validation:**

- Visual inspection — the AGENTS.md update is documentation-only

**Completion criterion:** AGENTS.md Bordbuch section includes retry behavior note referencing RFC-0646.

**Human review:** no

---

### Step 6. Run full validation suite

**Goal:** Verify all acceptance criteria pass.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test` — all unit tests
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0646 --json` — RFC validation
- Verify no bare `gitExec` calls remain in `bordbuch-commit.ts` (grep check)

**Validation:**

- All commands exit 0 with no errors

**Completion criterion:** `build:check` passes, all tests pass, `rfc.validate` passes, no bare `gitExec` in `bordbuch-commit.ts`.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, stamp implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated (Step 5)
- Run `pnpm exec site-kernel run command.manifest.generate` if command metadata changed (it should not — no new flags or IO changes)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Commit the implementation** (separate from the stamp commit)
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0646 --implementation-commit <sha> --dry-run` first, then without `--dry-run`
- **Commit the stamped RFC** (separate commit from implementation)

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0646` — passes
- Review report exists in `docs/reviews/code/` for this session
- All acceptance criteria marked `[x]` with evidence

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`; implementation commit and stamp commit are separate.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0646`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0646` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Pipeline latency (72s worst case) | Step 3 uses fake timers to verify backoff without real delays; production latency is acceptable per RFC analysis |
| Retry storms | Step 2 scopes `gitExecWithRetry` to `bordbuch.commit` only — no other pipeline step uses it |
| False positive retry | Step 1 implements conservative `isTransientError` classification — only timeout and lock-file errors are retried |
| Agent misinterpretation | Step 5 documents the scope limit in AGENTS.md; RFC implementation notes explicitly scope to `bordbuch.commit` only |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-51, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0646 --reason "..." --invariant "DNA-51"` instead of working around it.
