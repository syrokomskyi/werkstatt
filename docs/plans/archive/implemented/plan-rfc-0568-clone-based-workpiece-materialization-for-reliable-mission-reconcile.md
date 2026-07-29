---
rfcId: RFC-0568
planId: PLAN-RFC-0568-01
status: draft
owner: architecture
createdAt: 2026-07-28
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0568

## 1. Objectives

- [ ] Objective 1 — Replace `git init` with `git clone` in `mission.materialize` (maps to acceptance criterion: "mission.materialize uses git clone instead of git init")
- [ ] Objective 2 — Stage only data paths in the materialize commit, keeping boilerplate untracked (maps to acceptance criterion: "mission.materialize stages only data paths in the materialize commit")
- [ ] Objective 3 — Replace `git format-patch` + `git am` with `git merge --no-ff` in `mission.reconcile` (maps to acceptance criterion: "mission.reconcile uses git merge --no-ff instead of git format-patch + git am")
- [ ] Objective 4 — Add untracked file origin investigation and `evidence/untracked-files-report.json` output (maps to acceptance criterion: "mission.reconcile detects untracked files, investigates origin, writes report, blocks")
- [ ] Objective 5 — Use dynamic branch name in reconcile fetch, add push-to-origin step (maps to acceptance criteria: "determines workpiece branch dynamically", "pushes merge commit to origin")
- [ ] Objective 6 — Update `packages/os/site-kernel-handoff/AGENTS.md` to reflect new mechanisms (maps to acceptance criterion: "AGENTS.md updated")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` — replace `git init` + `git add -A` with `git clone` + data-only `git add`; add non-data-path file removal after clone
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — replace `git format-patch` + `git am` loop with `git fetch` + `git merge --no-ff`; remove 3-way fallback and auto-resolve; add untracked file investigation; use dynamic branch name; add push step; preserve `message` and `copiedPaths` in report
- `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts` — add `investigateUntrackedFiles` helper function (new, exported)

### 2.2 Configuration and data

- `evidence/untracked-files-report.json` — new evidence artifact (array of `UntrackedFileReport` objects)
- `evidence/reconciliation-report.json` — updated shape with `mergeCommitSha`, `transferredCommits`, preserved `message` and `copiedPaths`

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update "Mission git workpiece" section: `git init` → `git clone`, `git format-patch` + `git am` → `git merge --no-ff`; update "Reconcile dirty cache clone guard" section: remove 3-way fallback description, add untracked file investigation description

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm exec site-kernel run rfc.validate`

## 3. Step sequence

### Step 1. Add `investigateUntrackedFiles` helper and `UntrackedFileReport` type

**Goal:** Create the untracked file investigation function that will be used by `mission.reconcile`.

**Agent actions:**

- Add `UntrackedFileReport` interface to `mission-git-commit.ts` (exported type)
- Add `investigateUntrackedFiles(systemDir: string, files: string[]): UntrackedFileReport[]` function to `mission-git-commit.ts`
- Implementation: for each untracked file, call `fs.stat` to get creation time and size, match path against boilerplate patterns (`.github/workflows/deploy-*.yml`, `package.json`, `astro.config.mjs`, `wrangler.jsonc`, `tsconfig.json`, `.gitignore`, `postcss.config.cjs`), cross-reference Bordbuch entries for `mission.materialize` events to determine time ranges
- Decision rules: `previous-mission` if path matches boilerplate pattern AND creation time falls within a previous mission time range; `direct-commit` if path does not match boilerplate patterns AND not within a mission time range; `unknown` otherwise
- Export from `mission/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `investigateUntrackedFiles` function and `UntrackedFileReport` type are exported from `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts` and the package builds successfully.

**Human review:** no

---

### Step 2. Modify `mission.materialize` — replace `git init` with `git clone`

**Goal:** Change the materialization git initialization from `git init` to `git clone` from the cache clone, with data-only commit.

**Agent actions:**

- In `mission-materialize.ts`, locate the git init block at lines 751-765 (`git init`, `git add -A`, `git commit`)
- Replace with:
  1. `git clone systems/<id>/ <staging-dir>` (after `syncCacheClone` runs, before `atomicMoveDir`) — clone into staging dir instead of copying data paths + generating boilerplate into an empty dir
  2. After clone, remove ALL non-data-path files (everything except `STERNSYSTEM_DATA_PATHS` + `system.pin.json`). This gives codegen generators a clean slate, matching the current behavior where the staging dir starts empty. Files to remove include `bordbuch/` and any other cache-clone-local files.
  3. After `atomicMoveDir` and `build.prepare`, run boilerplate generation (existing `generateFullBoilerplate` call stays)
  4. Replace `git add -A` with `git add src/content public provenance behavior.snapshot.generated.yaml system.pin.json` — stage only data paths
  5. Keep `git commit -m "materialize from pin <version>"` — the commit now contains only data-path changes on top of the cloned history
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` comments in the file header
- The existing `copyDir` loop for `STERNSYSTEM_DATA_PATHS` (lines 644-657) is replaced by the clone — the data is already in the clone

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `mission-materialize.ts` uses `git clone` from `systems/<id>/` instead of `git init`, stages only data paths in the materialize commit, and the package builds successfully.

**Human review:** no

---

### Step 3. Modify `mission.reconcile` — replace `git format-patch` + `git am` with `git merge --no-ff`

**Goal:** Change the reconcile commit transfer mechanism from patch-based to merge-based.

**Agent actions:**

- In `mission-materialization-commands.ts`, locate the reconcile git block (lines 487-720)
- Replace the `git format-patch` + `git am` loop (lines 555-705) with:
  1. Determine workpiece branch dynamically: `git -C <workpiece-dir> rev-parse --abbrev-ref HEAD`
  2. `git fetch <workpiece-dir> <branch>` into cache clone
  3. `git merge --no-ff FETCH_HEAD -m "reconcile mission <id>"`
  4. Count transferred commits: `git rev-list --count <preReconcileSha>..HEAD`
  5. `git push origin <branch>` — non-fatal with retry: up to 3 attempts with exponential backoff (1s, 2s, 4s). If all attempts fail, log a warning and continue. The merge commit is in the cache clone locally; the workpiece is preserved on disk until `mission.cleanup`, so the operator can re-run reconcile if needed.
- Remove the 3-way fallback code (lines 604-668) and auto-resolve code
- Remove the `git rm --cached` cleanup (lines 586-593) — not needed with merge
- Remove the patch directory creation and cleanup (lines 556-559)
- Preserve the `copyDir` fallback for non-git Sternsystems (lines 707-720)
- Update the reconciliation report to include `mergeCommitSha`, `transferredCommits`, preserve `message` and `copiedPaths`
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` comments

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `mission-materialization-commands.ts` uses `git merge --no-ff` instead of `git format-patch` + `git am`, uses dynamic branch name, pushes to origin, and the package builds successfully.

**Human review:** no

---

### Step 4. Add untracked file investigation to `mission.reconcile` dirty cache clone guard

**Goal:** Enhance the dirty cache clone guard to investigate untracked file origins and write a report.

**Agent actions:**

- In `mission-materialization-commands.ts`, locate the dirty cache clone guard (lines 506-515)
- After the existing `isWorkpieceDirty` check, if `cacheDirtyCheck.dirty` is true:
  - Filter untracked files from `cacheDirtyCheck.files` (files with `??` status in `git status --porcelain`)
  - Call `investigateUntrackedFiles(systemDir, untrackedFiles)` to get origin analysis
  - Write `evidence/untracked-files-report.json` as `JSON.stringify(report, null, 2) + "\n"`
  - Include the investigation report in the error message
- The existing `isWorkpieceDirty` already detects untracked files via `git status --porcelain` (which includes `??` entries) — no change needed to detection, only to investigation and reporting

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `mission.reconcile` writes `evidence/untracked-files-report.json` with origin analysis when untracked files are detected in the cache clone, and the package builds successfully.

**Human review:** no

---

### Step 5. Update `packages/os/site-kernel-handoff/AGENTS.md`

**Goal:** Update the agent guide to reflect the new materialization and reconcile mechanisms.

**Agent actions:**

- In the "Mission git workpiece and Layer C protection (RFC-0480)" section:
  - Change "initializes a fresh git repo in the workpiece" to "clones the cache clone into the workpiece"
  - Change "transfers commits via `git format-patch` + `git am`" to "transfers commits via `git merge --no-ff`"
  - Add note that materialize commit stages only data paths
- In the "Reconcile dirty cache clone guard, 3-way fallback, and releaseId tracking (RFC-0522)" section:
  - Remove the "3-way fallback for `git am`" paragraph
  - Update the dirty cache clone guard paragraph to mention untracked file investigation and `evidence/untracked-files-report.json`
  - Add note about dynamic branch name and push-to-origin

**Validation:**

- `git diff packages/os/site-kernel-handoff/AGENTS.md` shows the updated sections

**Completion criterion:** `AGENTS.md` reflects clone-based materialization, merge-based reconcile, untracked file investigation, and removal of 3-way fallback.

**Human review:** no

---

### Step 6. Add/update tests

**Goal:** Add unit tests for the new functionality and update existing tests.

**Agent actions:**

- Add test for `investigateUntrackedFiles` function — test with mock files matching boilerplate patterns and non-matching files
- Add integration tests with real git repos in temp directories:
  - Create a temp git repo as the cache clone, run `mission.materialize` against it, verify `git clone` is used, data-only commit, boilerplate untracked
  - Run `mission.reconcile` against the materialized workpiece, verify `git merge --no-ff` is used, dynamic branch name, push step
  - Test untracked file investigation: add untracked files to cache clone, run reconcile, verify `evidence/untracked-files-report.json` is written with correct origin analysis
  - Test idempotency: run reconcile twice, verify second run resets and re-merges
  - Test push retry: mock a failing push, verify 3 attempts with backoff
- Update existing reconcile tests that expect `git format-patch` + `git am` behavior
- Remove tests for 3-way fallback and auto-resolve (no longer needed)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` passes

**Completion criterion:** All new and updated tests pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated (Step 5)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands, but changed command behavior — run to refresh generated projection)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0568 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate` passes
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- `pnpm --filter @warpgogol/site-kernel-handoff test` passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0568` in the subject line (RFC-0265 commit hygiene)
- `evidence/untracked-files-report.json` written by reconcile when untracked files are detected

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Larger workpiece .git directory | Step 2 — full clone is intentional; git GC runs during `mission.cleanup` (existing behavior) |
| Merge conflicts during reconcile | Step 3 — conflicts resolved in workpiece (not cache clone); idempotent re-run via `preReconcileSha` reset |
| Operator confusion from full history | Step 5 — AGENTS.md updated to document the new behavior; materialize commit message marks the boundary |
| Agent misinterpretation (attempting git am) | Step 5 — AGENTS.md explicitly states reconcile mechanism is `git merge --no-ff` |
| Untracked file investigation false positives | Step 1 — `likelyOrigin: "unknown"` fallback; operator makes final decision |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44 (Sternsystem bundle contract — boilerplate files entering cache clone via merge), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0568 --reason "..." --invariant "DNA-44"` instead of working around it.
- If the `git clone` approach fails for non-git Sternsystems in a way that cannot be handled by the `copyDir` fallback, escalate via `rfc.supersede.propose`.
