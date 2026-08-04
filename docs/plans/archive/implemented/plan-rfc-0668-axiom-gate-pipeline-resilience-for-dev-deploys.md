---
rfcId: RFC-0668
planId: PLAN-RFC-0668-01
status: draft
owner: architecture
createdAt: 2026-08-04
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0668

## 1. Objectives

- [ ] Objective 1 — Add 15-minute per-attempt timeout wrapper around `mission.check` call in `leitstand.dev-deploy` — maps to acceptance criterion "wraps mission.check with a 15-minute timeout"
- [ ] Objective 2 — Add one-time retry on infrastructure errors (exit code 2 or any non-0/non-1) in `leitstand.dev-deploy` — maps to acceptance criterion "retries mission.check once on exit code 2, does not retry on exit code 1"
- [ ] Objective 3 — Add Chromium pre-flight check via `ensureChromium` in `mission.check` before captures — maps to acceptance criterion "performs a Chromium pre-flight check before starting captures, auto-installs if missing"
- [ ] Objective 4 — Pass `--max-duration` from `leitstand.dev-deploy` to `mission.check` matching the outer timeout — maps to Problem section gap about insufficient `maxDurationMs` defaults
- [ ] Objective 5 — Document exit code semantics and resilience behavior in AGENTS.md files — maps to acceptance criteria about AGENTS.md documentation
- [ ] Objective 6 — Unit tests for retry, no-retry-on-violations, and timeout — maps to acceptance criteria about unit tests

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — add `MISSION_CHECK_TIMEOUT_MS`, `MAX_RETRIES`, `TimeoutError`, `withTimeout`, `runMissionCheckWithResilience` wrapper; replace the direct `executeKernelCommand("mission.check", ...)` call at ~line 923 with the wrapper; add `--max-duration` to argv
- `packages/os/site-kernel-checks/src/axiom-adapter.ts` — add `ensureChromium()` call before `runAxiomCheck` in `runMissionCheck`
- `packages/os/site-kernel-checks/src/playwright-chromium-ensure.ts` — existing file, no changes (reused)

### 2.2 Configuration and data

No configuration or data files changed. All changes are internal to command handlers.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — document timeout (15 min per-attempt), retry (once on infrastructure error), and `--max-duration` passthrough in the `leitstand.dev-deploy` section
- `packages/os/site-kernel-checks/AGENTS.md` — document Chromium pre-flight via `ensureChromium` and exit code semantics (already partially documented, verify and update)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — unit tests
- `pnpm --filter @warpgogol/site-kernel-checks run test` — unit tests
- `pnpm exec site-kernel run rfc.validate --id RFC-0668` — RFC validation

## 3. Step sequence

### Step 1. Add `withTimeout` utility and `TimeoutError` class in `leitstand-commands.ts`

**Goal:** Create the timeout infrastructure needed by the retry wrapper.

**Agent actions:**

- Add `TimeoutError` class extending `Error` with a timeout message
- Add `withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>` utility using `Promise.race` with a setTimeout reject
- Add `MISSION_CHECK_TIMEOUT_MS = 15 * 60 * 1000` and `MAX_RETRIES = 1` constants
- Place these near the top of `leitstand-commands.ts`, after existing imports and before the first function definition

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** `withTimeout` and `TimeoutError` are defined and exported from `leitstand-commands.ts`, typecheck passes

**Human review:** no

---

### Step 2. Add `runMissionCheckWithResilience` wrapper in `leitstand-commands.ts`

**Goal:** Create the retry+timeout wrapper that replaces the direct `executeKernelCommand` call.

**Agent actions:**

- Implement `runMissionCheckWithResilience(workspaceRoot, missionId, channelUrl, commitSha, logger)` following the TypeScript contract from the RFC
- The wrapper calls `executeKernelCommand` with `mission.check` argv including `--max-duration=${MISSION_CHECK_TIMEOUT_MS}`
- On `result.exitCode === 0` or `1`: return immediately (no retry)
- On any other exit code (2, 3+, 137, null) with `attempt < MAX_RETRIES`: log and retry
- On `TimeoutError`: throw immediately (not retryable)
- On unexpected throw with `attempt < MAX_RETRIES`: log and retry
- After retry exhausted: return result or throw

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** `runMissionCheckWithResilience` function exists, typecheck passes

**Human review:** no

---

### Step 3. Replace direct `executeKernelCommand` call with wrapper in `leitstand.dev-deploy`

**Goal:** Wire the resilience wrapper into the actual pipeline.

**Agent actions:**

- In `leitstand-commands.ts` at ~line 923, replace the direct `executeKernelCommand({ commandName: "mission.check", ... })` call with `runMissionCheckWithResilience(workspaceRoot, missionId, channelConfig.url, commitSha, logger)`
- Map the wrapper's return `{ exitCode, data }` to the existing `axiomStatus`, `axiomErrors`, `axiomWarnings`, `axiomExitCode` variables
- Preserve the existing catch block behavior for unexpected errors (set `axiomStatus = "fail"`, `axiomExitCode = 2`)
- Add `--max-duration=${MISSION_CHECK_TIMEOUT_MS}` to the `mission.check` argv (inside the wrapper)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** `leitstand.dev-deploy` uses `runMissionCheckWithResilience` instead of direct `executeKernelCommand`, typecheck passes

**Human review:** no

---

### Step 4. Add `ensureChromium` pre-flight call in `axiom-adapter.ts`

**Goal:** Verify Chromium exists before starting captures, auto-install if missing.

**Agent actions:**

- Import `ensureChromium` from `./playwright-chromium-ensure.ts` in `axiom-adapter.ts`
- In `runMissionCheck`, before the `runAxiomCheck` call (after flag parsing, locale resolution, methodologies config loading), add `await ensureChromium()` with a `logger.info("  Chromium pre-flight: verified")` on success
- If `ensureChromium` throws, the existing catch block already returns `missionCheckFailResult(evidenceDir, 2, ...)` with exit code 2 — no change needed

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** `ensureChromium()` is called before `runAxiomCheck` in `runMissionCheck`, typecheck passes

**Human review:** no

---

### Step 5. Unit tests for `leitstand.dev-deploy` resilience

**Goal:** Verify retry, no-retry-on-violations, and timeout behavior.

**Agent actions:**

- Create or extend test file in `packages/os/site-kernel-handoff/src/tests/` for `leitstand.dev-deploy` resilience (RFC-0668)
- Mock `executeKernelCommand` from `@warpgogol/site-kernel` to return controlled exit codes
- Test 1: `executeKernelCommand` returns exit 2 on first call, exit 0 on second — wrapper retries and succeeds
- Test 2: `executeKernelCommand` returns exit 1 — wrapper does not retry, returns immediately
- Test 3: `executeKernelCommand` returns exit 0 — wrapper does not retry, returns immediately
- Test 4: `executeKernelCommand` returns exit 2 on both calls — wrapper returns exit 2 after retry exhausted
- Test 5: `executeKernelCommand` throws — wrapper retries once, then throws
- Test 6: `withTimeout` rejects after `MISSION_CHECK_TIMEOUT_MS` — wrapper throws `TimeoutError`, does not retry
- Include `package.json` with `{ "version": "1.0.0" }` in temp workspace (required by `resolveCurrentEcosystem`)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` — all tests pass

**Completion criterion:** All 6 test cases pass

**Human review:** no

---

### Step 6. Unit test for Chromium pre-flight in `mission.check`

**Goal:** Verify `ensureChromium` is called before `runAxiomCheck`.

**Agent actions:**

- Extend `packages/os/site-kernel-checks/src/tests/mission-check.test.ts`
- Mock `ensureChromium` from `../playwright-chromium-ensure.ts` (or mock the module)
- Test: `runMissionCheck` calls `ensureChromium` before `runAxiomCheck`
- Test: if `ensureChromium` throws, `runMissionCheck` returns `exitCode: 2` (infrastructure error)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests pass

**Completion criterion:** Pre-flight tests pass

**Human review:** no

---

### Step 7. Update AGENTS.md documentation

**Goal:** Document the resilience behavior and exit code semantics.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/AGENTS.md` in the `leitstand.dev-deploy` section: add note about 15-minute per-attempt timeout, one-time retry on infrastructure errors (exit 2 or any non-0/non-1), `--max-duration` passthrough, and worst-case 30-minute total
- Update `packages/os/site-kernel-checks/AGENTS.md` in the `mission.check` section: verify exit code semantics (0=pass, 1=violations, 2=infrastructure) are documented, add note about Chromium pre-flight via `ensureChromium` (RFC-0647) before captures

**Validation:**

- Manual review of both AGENTS.md files for accuracy

**Completion criterion:** Both AGENTS.md files document the resilience behavior and exit code semantics

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (not expected — no new commands)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0668 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0668`
- Every file in `scope.docs` is either updated or documented as not-applicable
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0668`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0668` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| 15-minute timeout too short for very large sites | Step 2: timeout is per-attempt, configurable via constant; `--max-duration` passed to Axiom CLI |
| Retry masks recurring infrastructure issues | Step 2: error message after retry exhaustion clearly indicates infrastructure issues |
| Exit code 2 semantics not enforced by external Axiom CLI | Step 2: wrapper treats any non-0/non-1 as infrastructure error, not just exit 2 |
| Chromium auto-install hangs | Step 4: outer 15-minute timeout covers the pre-flight; no separate timeout needed |
| Agent confusion about retry scope | Step 7: AGENTS.md documents exit code semantics and retry behavior |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-48 or DNA-49, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0668 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If the external Axiom CLI does not return exit code 2 for infrastructure errors, coordinate with the Axiom expert to fix the exit code convention — do not work around it by retrying on all errors.
