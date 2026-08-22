---
rfcId: RFC-0913
planId: PLAN-RFC-0913-01
status: draft
owner: architecture
createdAt: 2026-08-21
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - AGENTS.md
---

# Implementation Plan: RFC-0913

## 1. Objectives

- [ ] Objective 1 — Export `FORBIDDEN_PATTERNS` from `sternsystem-validate.ts` for reuse (maps to acceptance criterion: `FORBIDDEN_PATTERNS` exported and reused)
- [ ] Objective 2 — Create `cache-clone-gitignore.ts` module with restoration and untracking functions (maps to acceptance criteria: `.gitignore` restoration, untracking, idempotency)
- [ ] Objective 3 — Add reconcile-freshness gate to `mission.close` with `--skip-reconcile-check` flag (maps to acceptance criteria: blocks on mismatch, passes on match, blocks on missing report, escape hatch)
- [ ] Objective 4 — Add post-merge `.gitignore` restoration and `workpieceHeadAtReconcile` to `mission.reconcile` (maps to acceptance criteria: restoration after merge, report fields)
- [ ] Objective 5 — Extend `CloseReportReconcile` with freshness fields (maps to acceptance criterion: `CloseReportReconcile` includes new fields)
- [ ] Objective 6 — Update root `AGENTS.md` with `--skip-reconcile-check` documentation (maps to acceptance criterion: AGENTS.md updated)
- [ ] Objective 7 — Unit and integration tests for all new behavior (maps to acceptance criteria: unit tests + integration test)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/sternsystem/sternsystem-validate.ts` — export `FORBIDDEN_PATTERNS` constant (currently module-private)
- `packages/werkstatt/src/mission/cache-clone-gitignore.ts` — **new file**: `CACHE_CLONE_GITIGNORE_SENTINEL`, `CACHE_CLONE_GENERATED_PATTERNS`, `CACHE_CLONE_ONLY_PATTERNS`, `restoreCacheCloneGitignore()`, `untrackForbiddenGeneratedFiles()`
- `packages/werkstatt/src/mission/mission-close.ts` — reconcile-freshness gate after `countOperatorCommits` (line ~326), `--skip-reconcile-check` flag parsing (line ~191), `CloseReportReconcile` extension
- `packages/werkstatt/src/mission/mission-materialization-commands.ts` — post-merge `.gitignore` restoration call (after line ~1476), `workpieceHeadAtReconcile` capture (after merge succeeds), report extension (line ~1598)
- `packages/werkstatt/src/mission/mission.module.ts` — register `skip-reconcile-check` flag in `mission.close` command definition (line ~126)
- `packages/werkstatt/src/mission/mission-close.ts` — `CloseReport` type extension (add `freshnessChecked`, `unreconciledCommits`, `workpieceHead`, `reconciledSha` to `CloseReportReconcile`)

### 2.2 Configuration and data

- `evidence/reconciliation-report.json` — new fields: `workpieceHeadAtReconcile`, `gitignoreRestored`, `forbiddenFilesUntracked`
- `evidence/close-report.json` — new fields in `reconcile` object: `freshnessChecked`, `unreconciledCommits`, `workpieceHead`, `reconciledSha`

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add `--skip-reconcile-check` flag to mission lifecycle discipline section
- `docs/rfcs/rfc-0913-*.md` — read-only reference (accepted status)
- `docs/audits/audit-rfc-0913-*.md` — read-only reference (audit findings)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck
- `pnpm --filter @warpgogol/werkstatt run test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0913` — RFC validation
- `pnpm exec werkstatt run werkstatt.autonomy.validate` — DNA-64 enforcement (no stack plugin imports)
- `pnpm exec werkstatt run sternsystem.validate` — bundle contract validation (regression test for `.gitignore` fix)

## 3. Step sequence

### Step 1. Export `FORBIDDEN_PATTERNS` from `sternsystem-validate.ts`

**Goal:** Make the forbidden-file constant reusable by the new `cache-clone-gitignore.ts` module.

**Agent actions:**

- Change `const FORBIDDEN_PATTERNS` to `export const FORBIDDEN_PATTERNS` in `packages/werkstatt/src/sternsystem/sternsystem-validate.ts:67`
- Verify no existing export of the same name exists in the sternsystem barrel

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes

**Completion criterion:** `FORBIDDEN_PATTERNS` is exported and typecheck passes.

**Human review:** no

---

### Step 2. Create `cache-clone-gitignore.ts` module

**Goal:** Create the dedicated module for cache-clone `.gitignore` restoration and forbidden file untracking.

**Agent actions:**

- Create `packages/werkstatt/src/mission/cache-clone-gitignore.ts`
- Import `FORBIDDEN_PATTERNS` from `../sternsystem/sternsystem-validate.ts`
- Define `CACHE_CLONE_GITIGNORE_SENTINEL`, `CACHE_CLONE_GENERATED_PATTERNS`, `CACHE_CLONE_ONLY_PATTERNS` constants
- Implement `restoreCacheCloneGitignore(systemDir: string): boolean` — checks for sentinel, appends patterns if missing, returns `true` if restored
- Implement `untrackForbiddenGeneratedFiles(systemDir: string): string[]` — batch `git rm --cached` with per-pattern fallback, returns list of untracked files
- Use `writeFileIfChanged` from `@warpgogol/werkstatt` for `.gitignore` writes (per packages AGENTS.md generated file writes rule)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- `pnpm --filter @warpgogol/werkstatt run lint` passes

**Completion criterion:** Module exists, exports are typed, typecheck and lint pass.

**Human review:** no

---

### Step 3. Add reconcile-freshness gate to `mission.close`

**Goal:** Block close when workpiece HEAD differs from `workpieceHeadAtReconcile` in reconciliation report.

**Agent actions:**

- Add `skipReconcileCheck` flag parsing at `mission-close.ts:~191` (after `allowNoOp`)
- Add freshness gate after `countOperatorCommits` block (after line ~326) and before git bundle creation (line ~328):
  - Read `evidence/reconciliation-report.json`
  - If missing/unreadable: throw fail-closed error
  - If `workpieceHeadAtReconcile` field missing: throw error
  - Compare `gitExec(workpieceDir, "rev-parse HEAD")` against `report.workpieceHeadAtReconcile`
  - If mismatch: count unreconciled commits via `git rev-list --count`, throw error with count and SHAs
- Extend `CloseReportReconcile` type with `freshnessChecked: boolean`, `unreconciledCommits: number`, `workpieceHead: string | null`, `reconciledSha: string | null`
- Populate the new fields in the `closeReport.reconcile` object (line ~513)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes

**Completion criterion:** Freshness gate code is in place, `CloseReportReconcile` is extended, typecheck passes.

**Human review:** no

---

### Step 4. Register `--skip-reconcile-check` flag in command table

**Goal:** Make the flag discoverable and documented in the command registry.

**Agent actions:**

- Add `"skip-reconcile-check"` entry to the `flags` object in the `mission.close` command registration in `mission.module.ts:~126`:
  ```ts
  "skip-reconcile-check": {
    kind: "boolean",
    description:
      "RFC-0913: Skip reconcile-freshness gate. Escape hatch for edge cases — writes bordbuch audit entry.",
  },
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes

**Completion criterion:** Flag is registered in command table, typecheck passes.

**Human review:** no

---

### Step 5. Add post-merge `.gitignore` restoration and `workpieceHeadAtReconcile` to `mission.reconcile`

**Goal:** Preserve cache-clone `.gitignore` across merges and record workpiece HEAD for freshness gate.

**Agent actions:**

- Import `restoreCacheCloneGitignore`, `untrackForbiddenGeneratedFiles` from `./cache-clone-gitignore.ts`
- After the merge succeeds and after the critical-files restoration block (after line ~1476), add:
  ```ts
  // RFC-0913: Restore cache-clone-only .gitignore patterns after merge
  let gitignoreRestored = false;
  let forbiddenFilesUntracked: string[] = [];
  try {
    gitignoreRestored = restoreCacheCloneGitignore(systemDir);
    if (gitignoreRestored) {
      logger.info(`  Restored cache-clone-only .gitignore patterns after merge`);
      execSync("git add .gitignore", { cwd: systemDir, stdio: "pipe", encoding: "utf-8" });
    }
    forbiddenFilesUntracked = untrackForbiddenGeneratedFiles(systemDir);
    if (forbiddenFilesUntracked.length > 0) {
      logger.info(`  Untracked ${forbiddenFilesUntracked.length} forbidden/generated file(s)`);
    }
  } catch (restoreErr) {
    logger.warn(`  .gitignore restoration failed (non-fatal): ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`);
  }
  ```
- Capture `workpieceHeadAtReconcile` right after the merge succeeds (after line ~1438, before `commitSha` is computed at line ~1440):
  ```ts
  let workpieceHeadAtReconcile: string | null = null;
  try {
    workpieceHeadAtReconcile = gitExec(workpieceDir, "rev-parse HEAD");
  } catch {
    workpieceHeadAtReconcile = null;
  }
  ```
- Extend the report object (line ~1598) with `workpieceHeadAtReconcile`, `gitignoreRestored`, `forbiddenFilesUntracked`
- If `gitignoreRestored` or `forbiddenFilesUntracked.length > 0`, commit the changes via `cacheCloneCommit` before computing `commitSha`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes

**Completion criterion:** Post-merge restoration is wired, `workpieceHeadAtReconcile` is captured, report is extended, typecheck passes.

**Human review:** no

---

### Step 6. Update root `AGENTS.md`

**Goal:** Document the `--skip-reconcile-check` flag in the mission lifecycle discipline section.

**Agent actions:**

- Find the "Mission lifecycle discipline" or "Reconcile sequence" section in root `AGENTS.md`
- Add documentation for `--skip-reconcile-check` flag: purpose, when to use (edge cases only), bordbuch audit behavior

**Validation:**

- `AGENTS.md` diff shows the new documentation

**Completion criterion:** `AGENTS.md` includes `--skip-reconcile-check` documentation.

**Human review:** no

---

### Step 7. Unit tests

**Goal:** Test all new behavior in isolation.

**Agent actions:**

- Create `packages/werkstatt/src/tests/cache-clone-gitignore.test.ts`:
  - `restoreCacheCloneGitignore`: appends sentinel + patterns when missing (returns `true`)
  - `restoreCacheCloneGitignore`: skips when sentinel present (returns `false`, idempotent)
  - `restoreCacheCloneGitignore`: handles missing `.gitignore` gracefully
  - `untrackForbiddenGeneratedFiles`: untracks tracked files, returns list
  - `untrackForbiddenGeneratedFiles`: skips untracked files silently
- Add tests to existing `mission-no-op-guard.test.ts` or new `mission-freshness-gate.test.ts`:
  - Freshness gate blocks when workpiece HEAD != `workpieceHeadAtReconcile`
  - Freshness gate passes when workpiece HEAD == `workpieceHeadAtReconcile`
  - Freshness gate blocks (fail-closed) when reconciliation report is missing
  - Freshness gate blocks when report lacks `workpieceHeadAtReconcile` field
  - `--skip-reconcile-check` bypasses the gate

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` passes

**Completion criterion:** All new tests pass, covering all acceptance criteria.

**Human review:** no

---

### Step 8. Integration test

**Goal:** Simulate the `m000080` scenario end-to-end.

**Agent actions:**

- Add integration test that:
  1. Creates a mission workpiece with operator commits
  2. Runs `mission.reconcile` (records `workpieceHeadAtReconcile`)
  3. Adds more commits to the workpiece
  4. Attempts `mission.close` — verifies it blocks with unreconciled commits error
  5. Runs `mission.reconcile` again
  6. Attempts `mission.close` — verifies it passes

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` passes

**Completion criterion:** Integration test passes, simulating the real-world bug scenario.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify root `AGENTS.md` is updated with `--skip-reconcile-check` flag documentation.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands, only a new flag — likely not needed, but verify).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0913 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0913`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run werkstatt.autonomy.validate`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476). Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0913`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run werkstatt.autonomy.validate`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0913` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0913.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0913` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| False positive on freshness gate (auto-commit creates new HEAD) | Step 3: gate is placed after `commitWorkpieceIfDirty` — the auto-committed HEAD is what gets compared, which is correct behavior |
| `.gitignore` pattern list drift | Step 2: reuses `FORBIDDEN_PATTERNS` from `sternsystem-validate.ts` (single source of truth for forbidden files); generated patterns are in a dedicated, reviewable module |
| Sentinel comment removal | Step 2: `restoreCacheCloneGitignore` is idempotent — re-appends if sentinel missing, does not duplicate if present |
| Escape hatch abuse | Step 4: flag documented as edge-case only; Step 3: bordbuch audit entry written when used |
| Reconciliation report missing | Step 3: fail-closed design blocks close, directing operator to re-run reconcile |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-47, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0913 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `workpieceHeadAtReconcile` field cannot be reliably captured (e.g., workpiece `.git` is corrupted), escalate rather than silently skipping the freshness gate.
