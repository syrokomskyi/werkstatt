---
rfcId: RFC-0702
planId: PLAN-RFC-0702-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0702

## 1. Objectives

- [ ] Objective 1 — Make `commitBordbuchProjections` resilient: wrap git operations in try/catch, return error instead of throwing — maps to acceptance criteria [1], [2], [3], [4]
- [ ] Objective 2 — Add `commitBordbuchProjections` cleanup call in `mission.validate` distribution reuse path — maps to acceptance criteria [5], [6], [7]
- [ ] Objective 3 — Add unit tests for both the resilient try/catch path and the reuse path cleanup — maps to acceptance criteria [8], [9]
- [ ] Objective 4 — Validate, review, fix, and stamp RFC-0702 as implemented — maps to acceptance criterion [10]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts` — add `error?: string` to `BordbuchCommitResult`, wrap git operations in try/catch in `commitBordbuchProjections`, add `logger.warn` in `runBordbuchCommit` on git failure
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — import `commitBordbuchProjections`, add cleanup call in distribution reuse path (inside `canReuse && storedHash` block, before `return` at line 291)

### 2.2 Configuration and data

None. No configuration files, manifests, or ontology catalogs are affected.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update the `bordbuch.commit` rule to note that the command is non-throwing (resilient) and that `mission.validate` reuse path calls `commitBordbuchProjections` for cleanup
- RFC file is read-only reference — no modifications during implementation

### 2.4 Validation and pipelines

- `bordbuch.commit` remains a pipeline step in `SITES_BUILD_PREPARE_PIPELINE` (step 129) — no pipeline topology changes
- No new commands registered — `commands.changed` lists `bordbuch.commit` and `mission.validate` only
- No CI workflow changes needed

## 3. Step sequence

### Step 1. Add `error` field to `BordbuchCommitResult` and make `commitBordbuchProjections` resilient

**Goal:** Wrap the `gitExecWithRetry` calls for `add`, `commit`, and `rev-parse` in `commitBordbuchProjections` in a try/catch so git failures return an error result instead of throwing. Add `error?: string` to `BordbuchCommitResult`.

**Agent actions:**

- Add `error?: string` field to `BordbuchCommitResult` interface in `bordbuch-commit.ts`
- Wrap ALL `gitExecWithRetry` calls (`status --porcelain`, `add`, `commit`, `rev-parse`) in `commitBordbuchProjections` in a single try/catch block covering lines 57-88 of `bordbuch-commit.ts`
- On catch: return `{ committed: false, commitSha: null, systemId, filesCommitted: [], error: <message> }`
- The `status --porcelain` call has `allowNonZero: true` which handles non-zero exits, but it can still throw on lock conflict or missing git — wrapping it ensures full resilience
- Keep the existing `resolveCachePath` try/catch (lines 50-55) unchanged
- Update the `CHANGE_SUMMARY` in the module header comment with an `RFC-0702` entry

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes with the new `error` field

**Completion criterion:** `commitBordbuchProjections` returns `{ committed: false, error: "..." }` instead of throwing when any `gitExecWithRetry` call (`status --porcelain`, `add`, `commit`, `rev-parse`) fails. `BordbuchCommitResult` has `error?: string` field.

**Human review:** no

---

### Step 2. Add `logger.warn` in `runBordbuchCommit` on git failure

**Goal:** Distinguish git failures from the no-dirty-files case in the kernel handler by logging a warning when `committed === false && error` is set.

**Agent actions:**

- In `runBordbuchCommit` (`bordbuch-commit.ts:91-120`), after `const result = await commitBordbuchProjections(...)`, add a check: if `!result.committed && result.error`, call `logger.warn(`[bordbuch.commit] git operation failed for ${systemId}: ${result.error}`)`
- The existing `logger.success` call for the committed case remains unchanged
- The existing no-dirty-files summary remains unchanged

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** `runBordbuchCommit` logs `logger.warn` when `committed === false && error` is set. The no-dirty-files case (`committed === false`, no `error`) does not log a warning.

**Human review:** no

---

### Step 3. Add `commitBordbuchProjections` cleanup call in `mission.validate` reuse path

**Goal:** Call `commitBordbuchProjections` in the distribution reuse path of `mission.validate` to clean up dirty bordbuch files from a previous run before returning success.

**Agent actions:**

- Import `commitBordbuchProjections` from `../bordbuch/bordbuch-commit.ts` in `mission-materialization-commands.ts`
- In the `canReuse && storedHash` block (around line 289, after `buildValidateNextSteps` and before the `return` at line 291), add:
  ```ts
  try {
    const bordbuchResult = await commitBordbuchProjections(workspaceRoot, manifest.systemId);
    if (bordbuchResult.committed) {
      logger.info(`  Bordbuch cleanup: committed ${bordbuchResult.filesCommitted.length} file(s) from previous run`);
    }
  } catch {
    // Non-fatal — reuse path continues regardless
  }
  ```
- Update the `CHANGE_SUMMARY` in the module header comment with an `RFC-0702` entry

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes with the new import

**Completion criterion:** `mission.validate` distribution reuse path calls `commitBordbuchProjections` before returning success. The call is wrapped in try/catch and does not block the reuse path on failure.

**Human review:** no

---

### Step 4. Add unit tests for resilient `commitBordbuchProjections` and reuse path cleanup

**Goal:** Add unit tests covering the new try/catch path in `commitBordbuchProjections` and the reuse path cleanup call in `mission.validate`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/tests/bordbuch-commit.test.ts`:
  - Add test: `commitBordbuchProjections` returns `{ committed: false, error: "..." }` when `gitExecWithRetry` for `add` throws — mock `gitExecWithRetry` to throw for `add` commands, verify `result.committed === false`, `result.error` is set, `result.filesCommitted` is empty
  - Add test: `commitBordbuchProjections` returns `{ committed: false, error: "..." }` when `gitExecWithRetry` for `commit` throws — mock to throw for `commit` commands only, verify `result.committed === false`, `result.error` is set
  - Add test: `runBordbuchCommit` logs `logger.warn` when `committed === false && error` — use a mock logger that captures `warn` calls, verify the warning message contains the error text
- In a new or existing `mission-validate` test file (follow existing test patterns in `packages/os/site-kernel-handoff/src/tests/`):
  - Add test: distribution reuse path calls `commitBordbuchProjections` — mock `commitBordbuchProjections` and verify it is called when `canReuse` is true. Mock `computeBuildInputHash` to return a matching hash. Mock `executeKernelPipeline` to not be called (build.prepare is skipped in reuse path).
  - Note: `mission.validate` tests require extensive mocking (see system-retrieved memory about mocking `@warpgogol/site-kernel`, `@warpgogol/site-kernel-codegen`, `@warpgogol/site-kernel-onboarding`, `@warpgogol/site-kernel-checks`). Follow the existing test patterns in `mission-validate-*.test.ts` files.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` — all tests pass including new ones

**Completion criterion:** New unit tests pass. `commitBordbuchProjections` try/catch path is covered. Reuse path cleanup call is covered. `runBordbuchCommit` warning on git failure is covered.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/AGENTS.md` — update the `bordbuch.commit` rule to note that the command is non-throwing (resilient) and that `mission.validate` reuse path calls `commitBordbuchProjections` for cleanup
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (no changes expected — `bordbuch.commit` remains in the same pipeline position)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)`. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0702 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). Run with `--dry-run` first, then without.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0702`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0702`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- No acceptance probes declared in RFC-0702 frontmatter — `rfc.acceptance.run` and `rfc.verification.emit` are not required.

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0702` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Silent git failures — making `bordbuch.commit` non-throwing means git failures are logged as warnings but do not block the pipeline | Step 2 adds `logger.warn` for git failures; the existing dirty cache clone warning at lines 557-565 still fires as a second signal |
| Concurrent execution — two `mission.validate` runs could trigger `commitBordbuchProjections` simultaneously | `gitExecWithRetry` has `[12_000, 60_000]` backoff (RFC-0646); Step 1's try/catch ensures the loser does not crash |
| Stale dirty state from failed previous run — reuse path skips `build.prepare` | Step 3 adds `commitBordbuchProjections` call in the reuse path to clean up stale dirty bordbuch files |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0702 --reason "..." --invariant "DNA-N"` instead of working around it.
