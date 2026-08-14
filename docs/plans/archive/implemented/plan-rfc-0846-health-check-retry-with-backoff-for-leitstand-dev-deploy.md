---
rfcId: RFC-0846
planId: PLAN-RFC-0846-01
status: draft
owner: architecture
createdAt: 2026-08-14
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - docs/rfcs/rfc-0846-health-check-retry-with-backoff-for-leitstand-dev-deploy.md
---

# Implementation Plan: RFC-0846

## 1. Objectives

- [ ] Objective 1 — Rename `ALT_HEALTH_*` constants to shared `HEALTH_CHECK_*` constants (maps to acceptance criterion: "Shared constants extracted via forward-only rename")
- [ ] Objective 2 — Add retry loop to `leitstand.dev-deploy` health check (maps to: "Health check retry loop added")
- [ ] Objective 3 — Update summary to include attempt count (maps to: "Summary includes attempt count")
- [ ] Objective 4 — Add unit tests for retry behavior (maps to: 4 unit test criteria)
- [ ] Objective 5 — Verify no regressions in `leitstand.promote` (maps to: "Existing tests pass")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/leitstand/leitstand-commands.ts` — rename constants (line ~346), add retry loop to `leitstand.dev-deploy` health check (line ~844), update all references in `leitstand.promote` (lines ~2347-2371)
- `packages/werkstatt/src/tests-handoff/leitstand-0628-dev-deploy.test.ts` — add 4 new test cases for retry behavior

### 2.2 Configuration and data

None. No YAML/JSON/manifest changes.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0846-health-check-retry-with-backoff-for-leitstand-dev-deploy.md` — read-only reference (acceptance criteria source of truth)
- No AGENTS.md updates needed — this is an internal implementation change, not a new command or policy
- No `docs/*.xml` Compass sync needed — no repository-wide semantics changed
- No `docs/architecture-dna.md` update needed — DNA-49 is existing, this RFC strengthens it

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck
- `pnpm --filter @warpgogol/werkstatt run test` — unit tests (including new retry tests)
- `pnpm exec werkstatt run rfc.validate --id RFC-0846` — RFC validation

## 3. Step sequence

### Step 1. Rename `ALT_HEALTH_*` constants to `HEALTH_CHECK_*`

**Goal:** Forward-only rename of the retry constants from `ALT_HEALTH_MAX_ATTEMPTS`/`ALT_HEALTH_BACKOFF_DELAYS_MS` to shared `HEALTH_CHECK_MAX_ATTEMPTS`/`HEALTH_CHECK_BACKOFF_DELAYS_MS`.

**Agent actions:**

- In `packages/werkstatt/src/leitstand/leitstand-commands.ts`, rename `ALT_HEALTH_MAX_ATTEMPTS` → `HEALTH_CHECK_MAX_ATTEMPTS` (line ~346)
- Rename `ALT_HEALTH_BACKOFF_DELAYS_MS` → `HEALTH_CHECK_BACKOFF_DELAYS_MS` (line ~347)
- Update the comment from "RFC-0747: Retry constants for alt health check in leitstand.promote." to "Shared health check retry constants (RFC-0747, RFC-0846). Used by leitstand.dev-deploy (dev health) and leitstand.promote (alt health)."
- Update all references in the `leitstand.promote` alt health check loop (lines ~2347-2371): `ALT_HEALTH_MAX_ATTEMPTS` → `HEALTH_CHECK_MAX_ATTEMPTS`, `ALT_HEALTH_BACKOFF_DELAYS_MS` → `HEALTH_CHECK_BACKOFF_DELAYS_MS`
- Update the error message in `leitstand.promote` (line ~2371) to use `HEALTH_CHECK_MAX_ATTEMPTS`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes with no errors
- `grep -r "ALT_HEALTH" packages/werkstatt/src/` — returns zero matches (no stale references)

**Completion criterion:** All `ALT_HEALTH_*` references are renamed to `HEALTH_CHECK_*`. Typecheck passes. Zero stale `ALT_HEALTH` references in source.

**Human review:** no

---

### Step 2. Add retry loop to `leitstand.dev-deploy` health check

**Goal:** Replace the single `adapter.health()` call in `leitstand.dev-deploy` (line ~844) with a retry loop using the shared `HEALTH_CHECK_*` constants.

**Agent actions:**

- In `runLeitstandDevDeploy`, replace the single `adapter.health()` call (lines ~844-851) with a retry loop:
  - Initialize `healthResult` with `{ state: "unhealthy", checks: [] }`
  - Loop `for (let attempt = 1; attempt <= HEALTH_CHECK_MAX_ATTEMPTS; attempt++)`
  - On `attempt > 1`: sleep `HEALTH_CHECK_BACKOFF_DELAYS_MS[attempt - 2]` ms, log retry info
  - Call `adapter.health()` with the same arguments as before
  - Break if `healthResult.state === "healthy"`
  - Log warning if not healthy and not last attempt
- Track the attempt count for summary reporting
- Add inline comment: "Note: exceptions from adapter.health() propagate immediately — no retry on exceptions."
- Update the `healthy` computation to use the final `healthResult`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** Retry loop is in place. `adapter.health()` is called inside the loop. Break on `healthy`. No try/catch around `adapter.health()` (exceptions propagate).

**Human review:** no

---

### Step 3. Update summary to include attempt count

**Goal:** When retries were needed, include the attempt count in the dev-deploy summary.

**Agent actions:**

- After the retry loop, compute `healthAttempts`: if `healthResult.state === "healthy"`, use the current `attempt` value; otherwise use `HEALTH_CHECK_MAX_ATTEMPTS`
- Update the summary string to include `${healthAttempts > 1 ? ` (${healthAttempts} attempts)` : ""}` when retries were needed
- Ensure the summary is unchanged when no retries were needed (attempt 1 succeeded)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** Summary includes `(N attempts)` when `healthAttempts > 1`, and is unchanged when `healthAttempts === 1`.

**Human review:** no

---

### Step 4. Add unit tests for retry behavior

**Goal:** Add 4 unit tests to `leitstand-0628-dev-deploy.test.ts` covering the retry behavior.

**Agent actions:**

- Add test: "health check succeeds on first attempt — no retry" — mock `adapter.health` to return `healthy` once. Assert called once. Assert Axiom runs.
- Add test: "health check succeeds on second attempt — 1 retry with 3s delay" — mock `adapter.health` to return `unhealthy` once, then `healthy`. Assert called twice. Assert Axiom runs. Assert summary includes "(2 attempts)".
- Add test: "health check fails all 3 attempts — Axiom skipped" — mock `adapter.health` to always return `unhealthy`. Assert called 3 times. Assert Axiom is skipped (`axiom: not-run`). Assert summary includes "(3 attempts)".
- Add test: "Axiom runs after successful retry" — mock `adapter.health` to return `unknown` once, then `healthy`. Assert Axiom runs. Assert summary includes "(2 attempts)".
- Mock `sleep` if needed to avoid real delays in tests (vi.mock or vi.useFakeTimers)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` — all tests pass (existing + 4 new)

**Completion criterion:** 4 new tests pass. Existing tests still pass. Total test count increases by 4.

**Human review:** no

---

### Step 5. Run full validation suite

**Goal:** Run all validation checks to verify no regressions and RFC compliance.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck
- Run `pnpm --filter @warpgogol/werkstatt run test` — all tests
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0846` — RFC validation
- Check `git status` — no uncommitted changes from this session

**Validation:**

- All three commands pass with exit code 0

**Completion criterion:** build:check passes, all tests pass, rfc.validate passes, clean working tree.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No AGENTS.md updates needed (internal implementation change)
- No Compass XML sync needed (no repository-wide semantics changed)
- No `docs/architecture-dna.md` update needed (DNA-49 is existing)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0846 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0846` — passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence annotations; code review passed (findings fixed if any); RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0846`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0846` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0846.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Increased dev-deploy time (worst case 9s + 3 health calls) | Step 2 — retry loop breaks early on `healthy`; worst case is bounded and acceptable vs. 6+ min manual re-run |
| False positive health on retry | Step 4 — test "health fails all 3 attempts" verifies Axiom is skipped when genuinely unhealthy |
| Shared constants divergence | Step 1 — forward-only rename eliminates `ALT_HEALTH_*` constants; both commands use `HEALTH_CHECK_*` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0846 --reason "..." --invariant "DNA-49"` instead of working around it.
