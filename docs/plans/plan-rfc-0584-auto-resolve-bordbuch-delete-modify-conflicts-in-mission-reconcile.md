---
rfcId: RFC-0584
planId: PLAN-RFC-0584-01
status: draft
owner: architecture
createdAt: 2026-07-29
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0584

## 1. Objectives

- [ ] Objective 1 — Add bordbuch delete-modify conflict auto-resolution to `runMissionReconcile` (maps to acceptance criterion: "auto-resolves bordbuch/ delete-modify conflicts by keeping the cache clone version")
- [ ] Objective 2 — Preserve existing hard-failure behavior for non-bordbuch and mixed conflicts (maps to acceptance criteria: "fails with existing error when non-bordbuch conflicts occur" and "aborts merge and fails when mixed bordbuch + non-bordbuch conflicts occur")
- [ ] Objective 3 — Extend `MissionReconcileData` with `autoResolvedPaths?` and include it in evidence report and summary (maps to acceptance criteria: "result includes autoResolvedPaths field" and "log message is emitted")
- [ ] Objective 4 — Add unit tests for auto-resolution and hard-failure scenarios (maps to acceptance criteria: "unit test covers bordbuch delete-modify conflict auto-resolution scenario" and "unit test covers non-bordbuch conflict hard-failure scenario")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — modify `MissionReconcileData` interface (add `autoResolvedPaths?: string[]`), modify `runMissionReconcile` merge try/catch block (add bordbuch conflict detection, auto-resolution, error handling)
- `packages/os/site-kernel-handoff/src/mission/rfc-0584-bordbuch-conflict-autoresolve.test.ts` — new test file

### 2.2 Configuration and data

No configuration or data changes. The `reconciliation-report.json` evidence file gains an `autoResolvedPaths` field, but this is a backward-compatible additive change to an internal evidence artifact.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add a note under "Mission git workpiece and Layer C protection (RFC-0480)" about bordbuch conflict auto-resolution in `mission.reconcile`
- RFC file is read-only reference — no modifications needed during implementation

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff test` — unit tests (including new tests)
- `pnpm exec site-kernel run rfc.validate RFC-0584` — RFC validation

## 3. Step sequence

### Step 1. Extend MissionReconcileData interface

**Goal:** Add `autoResolvedPaths?: string[]` to the `MissionReconcileData` interface so the `--json` output can include the field.

**Agent actions:**

- Open `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts`
- Add `autoResolvedPaths?: string[];` to the `MissionReconcileData` interface (after `reconciledAt: string;`)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `MissionReconcileData` interface has `autoResolvedPaths?: string[]` field

**Human review:** no

---

### Step 2. Implement bordbuch conflict auto-resolution in runMissionReconcile

**Goal:** Replace the existing `try { git merge --no-ff } catch { throw }` block with the enhanced logic from the RFC's TypeScript contracts section.

**Agent actions:**

- Declare `let autoResolvedPaths: string[] = [];` before the merge try/catch
- Replace the existing catch block (lines ~703-709) with the enhanced logic:
  - Try `git status --porcelain` inside a try/catch (fall through to existing error on failure)
  - Parse conflicted paths (DU, UD, AA, UU prefixes)
  - Check `allBordbuch` condition (all paths start with `bordbuch/`)
  - If allBordbuch: try `git checkout --ours bordbuch/` + `git add bordbuch/` + `git commit --no-edit` inside a try/catch; on failure `git merge --abort` and throw auto-resolution error
  - If not allBordbuch: `git merge --abort` (inside try/catch) and throw existing error
  - Set `autoResolvedPaths = conflictedPaths` on successful auto-resolution
  - Log `Auto-resolved bordbuch/ conflict (kept cache clone version)`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** The merge try/catch block in `runMissionReconcile` implements bordbuch conflict detection and auto-resolution per the RFC TypeScript contracts

**Human review:** no

---

### Step 3. Include autoResolvedPaths in evidence report, summary, and return data

**Goal:** Wire `autoResolvedPaths` into the evidence report, summary string, and return data.

**Agent actions:**

- Add `autoResolvedPaths` to the `report` object (alongside `copiedPaths`)
- Extend the summary string: append `, N bordbuch conflict(s) auto-resolved` when `autoResolvedPaths.length > 0`
- Add conditional `autoResolvedPaths` to the return `data` object (spread when non-empty)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** Evidence report includes `autoResolvedPaths`, summary includes auto-resolve suffix when applicable, return data includes `autoResolvedPaths` when non-empty

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Create `rfc-0584-bordbuch-conflict-autoresolve.test.ts` with tests for the auto-resolution scenario and the hard-failure scenario.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/rfc-0584-bordbuch-conflict-autoresolve.test.ts`
- Test 1: "mission.reconcile auto-resolves bordbuch delete-modify conflict" — set up cache clone with bordbuch, clone to workpiece, remove bordbuch from workpiece, modify bordbuch in cache clone, commit in workpiece, run merge — verify auto-resolution: bordbuch content in cache clone matches pre-merge version, merge commit exists, no conflicted files remain
- Test 2: "mission.reconcile fails when non-bordbuch conflict occurs" — set up cache clone with bordbuch + a data file, clone to workpiece, remove bordbuch from workpiece, modify both bordbuch in cache clone AND a data file in both cache clone and workpiece (creating a non-bordbuch conflict), run merge — verify merge fails, `git merge --abort` restores clean state
- Test 3: "mission.reconcile fails when mixed bordbuch + non-bordbuch conflicts occur" — same as test 2 but verify the merge is aborted and cache clone is clean
- Use the same test setup pattern as `rfc-0568-clone-reconcile.test.ts` (git operations via execSync, tmpDir setup/teardown) — test the git-level conflict detection and resolution logic directly, not through `runMissionReconcile` (which requires complex mock context: mission manifest, validation report, locks, cache clone path resolution)
- Add MODULE_CONTRACT and CHANGE_SUMMARY Compass scaffolding (DNA-42)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` passes with all new tests green

**Completion criterion:** Three unit tests pass: auto-resolution, non-bordbuch hard-failure, mixed conflict hard-failure

**Human review:** no

---

### Step 5. Update AGENTS.md documentation

**Goal:** Document the bordbuch conflict auto-resolution behavior in the handoff package's AGENTS.md.

**Agent actions:**

- Open `packages/os/site-kernel-handoff/AGENTS.md`
- Under "Mission git workpiece and Layer C protection (RFC-0480)", add a bullet point:
  - "Bordbuch delete-modify conflict auto-resolution (RFC-0584): `mission.reconcile` auto-resolves `bordbuch/` delete-modify conflicts by keeping the cache clone version (`--ours`) when all conflicted paths are under `bordbuch/`. Non-bordbuch or mixed conflicts abort the merge and throw the existing error. The result includes `autoResolvedPaths` in the `--json` output and `reconciliation-report.json` evidence file."

**Validation:**

- Visual inspection of AGENTS.md

**Completion criterion:** AGENTS.md has a bullet point about bordbuch conflict auto-resolution referencing RFC-0584

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated (Step 5)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands — skip)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0584 --implementation-commit <sha> --dry-run` first, then without `--dry-run`
- Commit the stamped RFC separately from the implementation commit

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate RFC-0584` passes
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- `pnpm --filter @warpgogol/site-kernel-handoff test` passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all 7 acceptance criteria are checked off with inline evidence annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476)

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0584`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0584` in the subject line (RFC-0265 commit hygiene)
- `reconciliation-report.json` evidence file includes `autoResolvedPaths` (runtime evidence)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Silent conflict resolution | Step 3 includes `autoResolvedPaths` in evidence report and summary; Step 4 tests verify the field is populated |
| Future cache-clone-only paths | Out of scope — RFC's nonGoals explicitly limit to `bordbuch/`; a future RFC can extend the list |
| Git porcelain parsing | Step 2 wraps `git status --porcelain` in try/catch; falls through to existing error on failure |
| Auto-resolution step failure | Step 2 wraps auto-resolution steps in try/catch with `git merge --abort` fallback; Step 4 test 1 verifies successful auto-resolution |
| Performance | Negligible — one additional `git status` call only when `git merge` fails; no mitigation needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 (Mission lifecycle), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0584 --reason "..." --invariant "DNA-46"` instead of working around it.
- If the bordbuch conflict detection logic needs to handle paths beyond `bordbuch/`, do NOT extend the auto-resolution list without a new RFC — the RFC's implementation notes explicitly forbid this (line 242).
