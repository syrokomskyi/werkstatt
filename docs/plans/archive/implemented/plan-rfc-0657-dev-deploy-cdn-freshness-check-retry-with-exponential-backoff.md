---
rfcId: RFC-0657
planId: PLAN-RFC-0657-01
status: draft
owner: architecture
createdAt: 2026-08-02
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0657

## 1. Objectives

- [ ] Objective 1 — `verifyFreshness` retries up to 5 attempts with exponential backoff (maps to acceptance criterion: "verifyFreshness makes 5 attempts: first immediate, then 4 retries with exponential backoff (3s, 6s, 12s, 24s)")
- [ ] Objective 2 — `FreshnessResult` includes `attempts` field for observability (maps to acceptance criterion: "FreshnessResult includes attempts field")
- [ ] Objective 3 — `leitstand.dev-deploy` proceeds to Axiom gate when freshness verified on any attempt (maps to acceptance criterion: "leitstand.dev-deploy proceeds to Axiom gate when freshness is verified on any attempt")
- [ ] Objective 4 — `leitstand.dev-deploy` exits 1 with clear error when all attempts fail (maps to acceptance criterion: "leitstand.dev-deploy exits 1 with clear error when all attempts fail")
- [ ] Objective 5 — `null` adapter skips freshness check, unchanged behavior (maps to acceptance criterion: "null adapter skips freshness check (unchanged)")
- [ ] Objective 6 — Unit tests cover all retry scenarios (maps to acceptance criterion: "Unit tests cover: first-attempt success, retry-then-success, all-attempts-fail, null adapter skip")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — `verifyFreshness` function (lines 148-197): add retry loop with exponential backoff; add `attempts` field to `FreshnessResult`; remove `sleep(6_000)` at line 790; update all inline `FreshnessResult` constructions (lines 645-650, 743, 757-762) to include `attempts: 0`
- `packages/os/site-kernel-handoff/src/tests/leitstand-0649-freshness.test.ts` — update existing hash mismatch test to expect 5 `fetch` calls; add new tests for retry-then-success and all-attempts-fail; use `vi.useFakeTimers()` for retry timing

### 2.2 Configuration and data

None — no YAML/JSON/NDJSON changes, no ontology catalogs, no manifests.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — Leitstand section: update `leitstand.dev-deploy` description to mention retry with exponential backoff for freshness check
- RFC-0649 `amendedBy` frontmatter — add `RFC-0657` to RFC-0649's `amendedBy` array (V-19 resolution)

### 2.4 Validation and pipelines

- No pipeline changes — the retry loop runs inside `leitstand.dev-deploy` between purge and Axiom gate
- No CI workflow changes
- No new validate commands

## 3. Step sequence

### Step 1. Add retry constants and update FreshnessResult type

**Goal:** Add the hardcoded retry constants and `attempts` field to `FreshnessResult`.

**Agent actions:**

- Add `FRESHNESS_MAX_ATTEMPTS = 5` and `FRESHNESS_BACKOFF_DELAYS_MS = [3_000, 6_000, 12_000, 24_000]` constants above `verifyFreshness`
- Add `attempts: number` field to `FreshnessResult` interface
- Update the RFC comment from "RFC-0649" to "RFC-0649 / RFC-0657" on the interface and function

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes with new field

**Completion criterion:** `FreshnessResult` interface has `attempts: number` field; constants are defined.

**Human review:** no

---

### Step 2. Rewrite verifyFreshness with retry loop

**Goal:** Replace single-fetch `verifyFreshness` with a retry loop that makes up to 5 attempts.

**Agent actions:**

- Rewrite `verifyFreshness` function body:
  - Loop from `attempt = 1` to `FRESHNESS_MAX_ATTEMPTS`
  - First attempt: immediate (no delay before)
  - Between attempts: `await sleep(FRESHNESS_BACKOFF_DELAYS_MS[attempt - 1])` before the next attempt
  - On each attempt: `fetch(url)`, check `response.ok`, parse JSON, compare `distTreeHash`
  - If verified: return `{ verified: true, cdnDistTreeHash, localDistTreeHash, attempts: attempt }`
  - If not verified: record last error, continue to next attempt (with delay)
  - After all attempts fail: return `{ verified: false, cdnDistTreeHash: lastCdnHash, localDistTreeHash, attempts: FRESHNESS_MAX_ATTEMPTS, error: lastError }`
- Keep the existing error message format (HTTP status, hash mismatch, network error) — the last attempt's error is what gets reported
- Add `logger` parameter to `verifyFreshness` so it can log retry attempts (or pass logger via a closure — match existing code style)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** `verifyFreshness` makes up to 5 attempts with exponential backoff delays; returns `attempts` count in result.

**Human review:** no

---

### Step 3. Remove fixed sleep and update call site

**Goal:** Remove the `sleep(6_000)` after purge and update the `verifyFreshness` call.

**Agent actions:**

- Remove `await sleep(6_000)` at line 790
- Update the log message from "purge + sleep completed" to "purge completed" (or similar)
- Update the `verifyFreshness` call (line 796) — if logger parameter was added, pass it
- Update all inline `FreshnessResult` constructions to include `attempts: 0`:
  - Line 645-650 (dist/ not found): add `attempts: 0`
  - Line 743 (null adapter): add `attempts: 0`
  - Line 757-762 (purge failed): add `attempts: 0`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** `sleep(6_000)` removed; all `FreshnessResult` objects include `attempts` field.

**Human review:** no

---

### Step 4. Update existing unit tests

**Goal:** Update existing RFC-0649 tests to work with retry behavior.

**Agent actions:**

- In `leitstand-0649-freshness.test.ts`:
  - Hash mismatch test (line 227-266): update `mockFetch` to return stale hash on all calls; assert `mockFetch` was called 5 times (not once); assert `freshness.attempts === 5`
  - Freshness verified test (line 268-324): unchanged — first attempt succeeds, `attempts === 1`
  - `--json` output test (line 326-343): add assertion for `freshness.attempts` field existence
  - Add `vi.useFakeTimers()` in `beforeEach` for tests that exercise retry paths; use `vi.advanceTimersByTime()` to advance through backoff delays
  - Null adapter test (line 187-205): unchanged — null adapter skips freshness, `attempts: 0`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` — all existing tests pass

**Completion criterion:** All existing tests pass with retry behavior; hash mismatch test expects 5 fetch calls.

**Human review:** no

---

### Step 5. Add new unit tests for retry scenarios

**Goal:** Add tests covering retry-then-success and all-attempts-fail scenarios.

**Agent actions:**

- Add test: "RFC-0657: retry-then-success — first attempt stale, second attempt fresh" — mock `fetch` to return stale hash on first call, fresh hash on second; assert `freshness.verified === true`, `freshness.attempts === 2`, Axiom gate runs
- Add test: "RFC-0657: all-attempts-fail with HTTP 404" — mock `fetch` to return 404 on all calls; assert `freshness.verified === false`, `freshness.attempts === 5`, `exitCode === 1`, Axiom not run
- Add test: "RFC-0657: all-attempts-fail with hash mismatch" — mock `fetch` to return stale hash on all calls; assert `freshness.attempts === 5`, `exitCode === 1`
- Add test: "RFC-0657: network error retried" — mock `fetch` to throw on first call, succeed on second; assert `freshness.verified === true`, `freshness.attempts === 2`
- Use `vi.useFakeTimers()` and `vi.advanceTimersByTime()` to avoid real-time delays

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` — all new tests pass

**Completion criterion:** 4 new tests pass covering retry-then-success, all-attempts-fail (HTTP + hash), network error retry.

**Human review:** no

---

### Step 6. Update AGENTS.md and RFC-0649 amendedBy

**Goal:** Update documentation to reflect retry behavior.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section: change the freshness check description from single-fetch to "retries up to 5 times with exponential backoff (3s, 6s, 12s, 24s)"
- Add `RFC-0657` to RFC-0649's `amendedBy` frontmatter array
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0649 --json` to verify no violations

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0649 --json` — passes
- `pnpm exec site-kernel run rfc.validate --id RFC-0657 --json` — passes

**Completion criterion:** AGENTS.md updated; RFC-0649 `amendedBy` includes `RFC-0657`; both RFCs validate.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated with retry description
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0657 --json` — passes
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — passes
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test` — all tests pass
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0657 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0657 --json` — passes
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — passes
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — all tests pass
- Review report exists for this session

**Completion criterion:** All documentation artifacts updated; code review passed; all acceptance criteria checked off with evidence; RFC stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0657 --json`
- `pnpm exec site-kernel run rfc.validate --id RFC-0649 --json` (verify amendedBy doesn't break)
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0657` in the subject line (RFC-0265 commit hygiene)
- Test file `leitstand-0649-freshness.test.ts` with updated and new test cases

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| CDN edge variability — different edges propagate at different speeds | Step 2: retry loop polls from the running machine; 5 attempts with 45s total covers normal propagation |
| Rate limiting — 5 HTTP GETs to same URL | Step 2: exponential backoff (3s, 6s, 12s, 24s) spaces requests sufficiently |
| Test timing — retry loop adds real-time delays in tests | Step 4: `vi.useFakeTimers()` and `vi.advanceTimersByTime()` avoid real-time delays |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0657 --reason "..." --invariant "DNA-49"` instead of working around it.
- If the retry loop causes unexpected test failures that cannot be resolved with `vi.useFakeTimers()`, investigate whether the `sleep` function is mockable — if not, consider extracting a `delay` function that can be mocked.
