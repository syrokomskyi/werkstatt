---
rfcId: RFC-0763
planId: PLAN-RFC-0763-01
status: draft
owner: architecture
createdAt: 2026-08-08
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0763

## 1. Objectives

- [ ] Objective 1 — Add `commitBordbuchProjections` cleanup before `build.prepare` failure early-return (maps to acceptance criterion: "mission.validate calls commitBordbuchProjections before the build.prepare failure early-return")
- [ ] Objective 2 — Add `commitBordbuchProjections` cleanup before `!passed` failure early-return (maps to acceptance criterion: "mission.validate calls commitBordbuchProjections before the !passed failure early-return")
- [ ] Objective 3 — Cleanup is non-fatal (try/catch with `logger.warn`), exit code remains 1 (maps to acceptance criterion: "Cleanup on failure paths is non-fatal — exit code remains 1")
- [ ] Objective 4 — Non-bordbuch dirty files not touched (maps to acceptance criterion: "Non-bordbuch dirty files in cache clone are not touched")
- [ ] Objective 5 — Unit tests cover both failure paths + cleanup failure + non-bordbuch (maps to acceptance criteria: 4 unit test checkboxes)
- [ ] Objective 6 — AGENTS.md updated with failure-path cleanup rule

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — add `commitBordbuchProjections` cleanup calls at two failure-path early-returns:
  - **build.prepare failure** (~line 370): after `atomicWriteFile(validation-report.json)`, before `return { exitCode: 1, ... }` at line 371
  - **validation failure** (~line 587): inside the `if (!passed)` block, before `return { exitCode: 1, ... }` at line 587
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts` — no changes (existing `commitBordbuchProjections` function, already non-throwing per RFC-0702)
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` CHANGE_SUMMARY — add RFC-0763 entry

### 2.2 Configuration and data

No configuration or data changes.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add rule: "RFC-0763: mission.validate calls commitBordbuchProjections on failure paths (build.prepare failure and !passed) to clean bordbuch projections from cache clone. Non-fatal — exit code remains 1."
- `docs/rfcs/rfc-0763-*.md` — read-only reference (accepted status)
- No `docs/*.xml` Compass sync needed (no new commands, no pipeline topology change)
- No `docs/architecture-dna.md` changes (DNA-46 already satisfied)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — vitest unit tests
- `pnpm exec site-kernel run rfc.validate --id RFC-0763` — RFC validation

## 3. Step sequence

### Step 1. Add bordbuch cleanup to build.prepare failure path

**Goal:** Insert `commitBordbuchProjections` cleanup call before the `build.prepare` failure early-return at line 371.

**Agent actions:**

- In `mission-materialization-commands.ts`, locate the `build.prepare` failure return block (lines 340-376). The return is at line 371 after `atomicWriteFile(validation-report.json)` at line 367-370.
- Insert the cleanup call between the `atomicWriteFile` and the `return`:
```ts
    // RFC-0763: clean bordbuch projections on build.prepare failure path
    try {
      const failBordbuch = await commitBordbuchProjections(workspaceRoot, manifest.systemId);
      if (failBordbuch.committed) {
        logger.info(
          `  Bordbuch cleanup on build.prepare failure: committed ${failBordbuch.filesCommitted.length} file(s)`,
        );
      }
    } catch (err) {
      logger.warn(
        `  Bordbuch cleanup on build.prepare failure failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
```
- Add `RFC-0763` entry to the CHANGE_SUMMARY block at the top of the file: `<item>RFC-0763: add commitBordbuchProjections cleanup on build.prepare failure and validation failure paths to clean bordbuch projections from cache clone on all exit paths.</item>`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `commitBordbuchProjections` is called between `atomicWriteFile` and `return` in the `build.prepare` failure path. The return still has `exitCode: 1`. CHANGE_SUMMARY includes the RFC-0763 entry.

**Human review:** no

---

### Step 2. Add bordbuch cleanup to validation failure path

**Goal:** Insert `commitBordbuchProjections` cleanup call before the `!passed` failure early-return at line 587.

**Agent actions:**

- In `mission-materialization-commands.ts`, locate the `if (!passed)` block (lines 577-593). The return is at line 587.
- Insert the cleanup call inside the `if (!passed)` block, before the `return`:
```ts
    // RFC-0763: clean bordbuch projections on validation failure path
    try {
      const failBordbuch = await commitBordbuchProjections(workspaceRoot, manifest.systemId);
      if (failBordbuch.committed) {
        logger.info(
          `  Bordbuch cleanup on validation failure: committed ${failBordbuch.filesCommitted.length} file(s)`,
        );
      }
    } catch (err) {
      logger.warn(
        `  Bordbuch cleanup on validation failure failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `commitBordbuchProjections` is called inside the `if (!passed)` block before the `return`. The return still has `exitCode: 1`.

**Human review:** no

---

### Step 3. Update AGENTS.md

**Goal:** Document the failure-path cleanup rule in the package AGENTS.md.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`, add a new rule after the existing RFC-0749 rule about post-validation cleanup:
  - `**RFC-0763: mission.validate calls commitBordbuchProjections on failure paths.** When build.prepare fails or validation fails (!passed), mission.validate calls commitBordbuchProjections to clean any bordbuch projections that were generated during build.prepare but not committed (e.g., due to transient bordbuch.commit failure). The cleanup is non-fatal (try/catch with logger.warn) — exit code remains 1. This extends RFC-0749's success-path cleanup to all exit paths.`

**Validation:**

- `git diff packages/os/site-kernel-handoff/AGENTS.md` shows the new rule

**Completion criterion:** AGENTS.md mentions the failure-path cleanup with RFC-0763 reference.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Add four unit tests covering both failure paths, cleanup failure, and non-bordbuch file safety.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/rfc-0763-failure-path-bordbuch-cleanup.test.ts`
- Reuse the test setup pattern from `mission-validate-snapshot-auto-regen.test.ts`:
  - `mockState` with hoisted state (prepareResult, checkResult, postResult, pipelineCalls, commandCalls)
  - `vi.mock("@warpgogol/site-kernel")` with `executeKernelPipeline` mock
  - `vi.mock("node:child_process")` with `execSync` mock for astro build
  - `vi.mock("../mission/mission-git-commit.ts")` with `isWorkpieceDirty` mock
  - `setupWorkspace()` function creating tmp workspace with registry, system, mission, workpiece
  - `makeContext()` and `makeInput()` helpers
- Mock `commitBordbuchProjections` from `../bordbuch/bordbuch-commit.ts`:
  - Track calls with `mockState.commitCalls`
  - Return `{ committed: true, filesCommitted: ["bordbuch/status.generated.yaml"], commitSha: "abc", systemId, error: null }` by default
  - Override via `mockState.commitResult` for failure test
- Test 1: "build.prepare failure: commits stale bordbuch projections"
  - Set `mockState.prepareResult = { ok: false, steps: [...], timing: { failedStep: "bordbuch.validate" } }`
  - Run `runMissionValidate`
  - Assert `result.exitCode === 1`
  - Assert `mockState.commitCalls.length >= 1` (cleanup was called)
- Test 2: "validation failure (!passed): commits stale bordbuch projections"
  - Set `mockState.checkResult = { ok: false, steps: [...], timing: { failedStep: "content.validate" } }`
  - Run `runMissionValidate`
  - Assert `result.exitCode === 1`
  - Assert `mockState.commitCalls.length >= 1` (cleanup was called)
- Test 3: "cleanup failure does not change exit code"
  - Set `mockState.checkResult = { ok: false, ... }` (validation failure path)
  - Set `mockState.commitResult = { committed: false, filesCommitted: [], commitSha: null, systemId: "test-system", error: "git failed" }`
  - Run `runMissionValidate`
  - Assert `result.exitCode === 1` (still fails, not blocked)
- Test 4: "non-bordbuch files not touched"
  - Set `mockState.checkResult = { ok: false, ... }` (validation failure path)
  - Run `runMissionValidate`
  - Assert `mockState.commitCalls` was called — the mock for `commitBordbuchProjections` only stages bordbuch paths (this is guaranteed by the real implementation, not the mock; the test verifies the cleanup was invoked, and the real `commitBordbuchProjections` implementation only stages `bordbuch/` and `public/.well-known/bordbuch/` paths)
  - Document in test comment: "commitBordbuchProjections only stages bordbuch projection paths — non-bordbuch dirty files are not touched. This is guaranteed by the implementation in bordbuch-commit.ts, not by this mock."

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --reporter=verbose rfc-0763` passes

**Completion criterion:** All four tests pass. Tests verify cleanup was called on both failure paths, exit code remains 1 on cleanup failure, and cleanup is invoked (real implementation guarantees non-bordbuch safety).

**Human review:** no

---

### Step 5. Validation suite

**Goal:** Run all validation checks and fix any issues.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0763 --json`
- Fix any TypeScript compilation errors or test failures

**Validation:**

- All three commands exit 0

**Completion criterion:** `build:check` passes, all tests pass, `rfc.validate` passes with 0 violations.

**Human review:** no

---

### Step 6. Evidence emission

**Goal:** Emit verification evidence for RFC-0763.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0763`
- If evidence file is generated, commit it alongside the implementation

**Validation:**

- Evidence file exists at `docs/rfcs/verification/rfc-0763.generated.json` (or skip is reported — RFC-0763 has no acceptance probes, so evidence may be skipped per known behavior)

**Completion criterion:** Evidence file committed or skip documented.

**Human review:** no

---

### Step 7. Review, fix, and stamp implemented

**Goal:** Run code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0763 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0763` passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence annotations. RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0763`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0763` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0763.generated.json` — verification evidence (RFC-0330, if probes declared)
- Commit messages referencing `RFC-0763` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Committing on a failure path changes cache clone HEAD | Step 1/2: cleanup is non-fatal and only stages bordbuch paths — same pattern as RFC-0724/RFC-0749. Cache key invalidation is expected. |
| Non-bordbuch dirty files on failure paths | Step 1/2: `commitBordbuchProjections` only stages bordbuch projection paths. Non-bordbuch dirty state is out of scope (documented in RFC nonGoals). |
| Race condition during cleanup | Step 1/2: `commitBordbuchProjections` is non-throwing (RFC-0702). `logger.warn` on failure, exit code unchanged. |
| bordbuch.commit is the failing step — cleanup re-runs and fails again | Step 1: acknowledged in RFC Failure modes — harmless, non-fatal, cleaned by RFC-0724 pre-validate on next run. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0763 --reason "..." --invariant "DNA-46"` instead of working around it.
