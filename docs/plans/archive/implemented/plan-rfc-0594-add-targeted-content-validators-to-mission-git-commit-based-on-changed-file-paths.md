---
rfcId: RFC-0594
planId: PLAN-RFC-0594-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0594

## 1. Objectives

- [ ] Objective 1 — Add pre-commit validation step to `mission.git.commit` that runs targeted content validators based on changed file paths — maps to acceptance criterion "mission.git.commit runs targeted validators based on changed file paths before committing"
- [ ] Objective 2 — Define and wire `VALIDATOR_MAPPINGS` table covering `business-profile/`, `pages/`, `faq/` — maps to acceptance criterion "Validator mapping table covers business-profile/, pages/, faq/ content directories"
- [ ] Objective 3 — Refuse commit with exit code 1 on validator failure; collect all failures — maps to acceptance criteria "Commit is refused with exit code 1 when any validator fails" and "All validator failures are collected and reported together"
- [ ] Objective 4 — Preserve staged changes on validation failure (no unstage) — maps to acceptance criterion "Auto-staged changes remain in the git index after a validation failure (not unstaged)"
- [ ] Objective 5 — Skip validators when no content files changed; skip unregistered validators with warning — maps to acceptance criteria "No validators run when no content files are changed" and "Unregistered validator commands are skipped with a warning (commit proceeds)"
- [ ] Objective 6 — Update `AGENTS.md` with pre-commit validation behavior — maps to acceptance criterion "AGENTS.md updated with the pre-commit validation behavior"
- [ ] Objective 7 — Unit tests cover pass, fail, and no-content-files paths — maps to acceptance criterion "Unit tests cover: validator passes → commit succeeds, validator fails → commit blocked, no content files → no validators"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts` — add `VALIDATOR_MAPPINGS`, `PreCommitValidationResult` interface, `runPreCommitValidation()` function, and integrate pre-commit step into `runMissionGitCommit` before `git commit`
- `packages/os/site-kernel-handoff/src/mission/mission.module.ts` — no changes needed (command already registered, only handler behavior changes)
- No new commands. `mission.git.commit` is listed in `commands.changed` in the RFC frontmatter.

### 2.2 Configuration and data

- No YAML/JSON/NDJSON changes. The `VALIDATOR_MAPPINGS` array is a TypeScript constant inside `mission-git-commit.ts`.

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add a rule under the mission lifecycle section stating that `mission.git.commit` runs targeted content validators before committing, and that invalid content is refused.
- `packages/os/site-kernel-handoff/AGENTS.md` — add a note in the mission section about the pre-commit validation gate.
- No `docs/*.xml` Compass files need updates — no repository-wide semantics change.
- No `docs/architecture-dna.md` change — DNA-46 is satisfied, not modified.

### 2.4 Validation and pipelines

- No pipeline changes. Validators run inside `mission.git.commit` itself, not in `build.check` or `build.prepare`.
- No CI workflow changes.

## 3. Step sequence

### Step 1. Define `VALIDATOR_MAPPINGS` and `PreCommitValidationResult` types

**Goal:** Establish the validator mapping table and result interface as TypeScript contracts.

**Agent actions:**

- Add `ValidatorMapping` interface (without `scope` field, per audit enhancement) and `VALIDATOR_MAPPINGS` constant array with three entries: `business-profile/` → `pbp.content.validate`, `pages/` → `semantic.drift.validate`, `faq/` → `faq.validate`
- Add `PreCommitValidationResult` interface with `passed`, `validatorsRun`, `failures` fields
- Place these at module level in `mission-git-commit.ts`, above `runMissionGitCommit`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes with the new types

**Completion criterion:** `VALIDATOR_MAPPINGS` and `PreCommitValidationResult` are defined and exported from `mission-git-commit.ts`; build:check passes

**Human review:** no

---

### Step 2. Implement `runPreCommitValidation()` function

**Goal:** Create the function that determines which validators to run based on changed file paths, invokes them via `executeKernelCommand`, and collects results.

**Agent actions:**

- Import `executeKernelCommand` from `@warpgogol/site-kernel` (same import as `mission-materialize.ts:33`)
- Implement `runPreCommitValidation(workpieceDir, changedFiles, systemId, workspaceRoot)`:
  - Filter `changedFiles` against `VALIDATOR_MAPPINGS` prefixes to determine which validators to run
  - If no changed files match any mapping prefix, return `{ passed: true, validatorsRun: [], failures: [] }` immediately
  - For each matched validator, call `executeKernelCommand({ workspaceRoot, commandName: validator, siteName: systemId, siteExplicit: true })` — same pattern as `mission-materialize.ts:439-443`
  - If a validator command is not registered (throws or returns not-found), log a warning and skip it (commit proceeds)
  - Collect failures from validators that return `ok: false` or non-zero exit code
  - Return `PreCommitValidationResult` with all failures collected

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `runPreCommitValidation` function is implemented, uses `executeKernelCommand` with `siteName: manifest.systemId`, handles unregistered validators gracefully, and collects all failures

**Human review:** no

---

### Step 3. Integrate pre-commit validation into `runMissionGitCommit`

**Goal:** Wire the pre-commit validation step into the existing `runMissionGitCommit` handler, between `git add -A` and `git commit`.

**Agent actions:**

- In `runMissionGitCommit` (`mission-git-commit.ts:242`), after `git add -A` and the `hasChanges` check, but before the signing key / commit logic:
  - Get changed files from `git status --porcelain` (reuse `isWorkpieceDirty` which already returns `files[]`)
  - Call `runPreCommitValidation(workpieceDir, dirtyResult.files, manifest.systemId, workspaceRoot)`
  - If `result.passed === false`, return early with `exitCode: 1` and the `preCommitValidation` data block (matching the RFC output format)
  - If validation passes, proceed to the existing commit logic (signed or unsigned)
- Update `MissionGitCommitData` interface to include optional `preCommitValidation` field
- Update the MODULE_CONTRACT non-goals: remove "Does not validate — use mission.validate for that" since this RFC adds validation
- Add CHANGE_SUMMARY entry: "RFC-0594: add pre-commit content validation based on changed file paths"

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- `pnpm --filter @warpgogol/site-kernel-handoff test` passes (existing tests still pass)

**Completion criterion:** `runMissionGitCommit` runs pre-commit validation after staging and before commit; failed validation exits with code 1 and `preCommitValidation` data; passed validation proceeds to commit; build:check and existing tests pass

**Human review:** no

---

### Step 4. Write unit and integration tests

**Goal:** Cover the three test paths from acceptance criteria with unit tests for the validation logic and integration tests through the full handler.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/mission-git-commit-validation.test.ts`
- **Unit tests** (test `runPreCommitValidation` directly with mocked `executeKernelCommand`):
  - Test 1: **No content files changed** — changed files list contains only non-content paths (e.g., `astro.config.mjs`); assert `validatorsRun` is empty and `passed` is true
  - Test 2: **Prefix matching** — changed files include `src/content/business-profile/de/offerings/x.md` and `src/content/pages/de/index.md`; assert both `pbp.content.validate` and `semantic.drift.validate` are in `validatorsRun`
  - Test 3: **Unregistered validator** — mock `executeKernelCommand` to throw for a non-existent command; assert the validator is skipped with a warning and `passed` is true
- **Integration tests** (through `runMissionGitCommit` with mock mission manifest and synthetic `KernelRuntimeContext`):
  - Test 4: **Validator fails → commit blocked** — set up a workpiece with a `src/content/business-profile/` file containing a schema violation; run `runMissionGitCommit`; assert `exitCode: 1`, `preCommitValidation` in output, and `git log` shows no new commit
  - Test 5: **No content files → no validators → commit succeeds** — set up a workpiece with only a non-content file change; run `runMissionGitCommit`; assert `exitCode: 0` and `git log` shows the new commit
  - Test 6: **Staged changes preserved on failure** — after Test 4's validation failure, assert `git status --porcelain` still shows the files as staged
- Use the same tmpdir + git init pattern as `mission-dirty-guard.test.ts` and `rfc-0568-clone-reconcile.test.ts`
- For integration tests, construct a synthetic `KernelRuntimeContext` pointing to the tmpdir workpiece — follow the `mission-preview.ts:80-88` pattern for synthetic site context

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` passes with all new tests

**Completion criterion:** All 6 test cases pass; unit tests cover prefix-matching and unregistered-validator logic; integration tests verify commit succeeds/blocked end-to-end; test file is discovered by vitest (include pattern `src/**/*.test.ts`)

**Human review:** no

---

### Step 5. Update AGENTS.md files

**Goal:** Document the pre-commit validation behavior for agents and operators.

**Agent actions:**

- Root `AGENTS.md`: add a bullet under the mission lifecycle section stating that `mission.git.commit` runs targeted content validators (pbp.content.validate, semantic.drift.validate, faq.validate) based on changed file paths before committing, and that invalid content is refused with exit code 1
- `packages/os/site-kernel-handoff/AGENTS.md`: add a note in the mission section about the pre-commit validation gate, referencing RFC-0594

**Validation:**

- `git diff AGENTS.md` shows the new rule
- `git diff packages/os/site-kernel-handoff/AGENTS.md` shows the new note

**Completion criterion:** Both AGENTS.md files have a clearly worded rule/note about the pre-commit validation behavior

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (not expected — no new commands).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0594 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0594`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0594`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0594` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Performance — validators scan entire directories | Step 2: `runPreCommitValidation` only runs validators whose directory prefix has changed files; performance note in RFC confirms directory-level scan is acceptable (10–50 files) |
| False positives — validator bug blocks legitimate commits | Step 4: test case 3 verifies valid content passes; validators are already tested in `mission.validate` |
| Agent confusion — raw `git commit` bypass | Step 5: AGENTS.md update reinforces that workpiece edits must go through `mission.git.commit` |
| Circular dependency — handoff → checks | Step 2: uses `executeKernelCommand` from `@warpgogol/site-kernel` (runtime dispatcher), no direct import from `site-kernel-checks` |
| Unregistered validator — missing command | Step 2: unregistered validators are skipped with warning; Step 4: test case 4 verifies this behavior |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-47, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0594 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `executeKernelCommand` call pattern does not work for app-scoped validators from a workspace-scoped command (e.g., context resolution fails for workpiece paths), stop and report to the operator — do not switch to direct imports from `site-kernel-checks`.
