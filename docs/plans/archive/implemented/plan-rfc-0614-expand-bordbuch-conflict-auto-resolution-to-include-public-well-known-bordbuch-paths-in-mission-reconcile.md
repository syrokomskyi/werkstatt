---
rfcId: RFC-0614
planId: PLAN-RFC-0614-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - docs/rfcs/archive/implemented/rfc-0584-auto-resolve-bordbuch-delete-modify-conflicts-in-mission-reconcile.md
---

# Implementation Plan: RFC-0614

## 1. Objectives

- [ ] Objective 1 — Expand `isBordbuchPath` to match `public/.well-known/bordbuch*` paths (maps to acceptance criterion 1)
- [ ] Objective 2 — Replace hardcoded `git checkout --ours`/`git add` path literals with dynamic `conflictedPaths` array (maps to acceptance criterion 2)
- [ ] Objective 3 — Auto-resolve `public/.well-known/bordbuch*` delete/modify conflicts without manual intervention (maps to acceptance criterion 3)
- [ ] Objective 4 — Preserve abort-on-non-bordbuch-conflicts behavior (maps to acceptance criterion 4)
- [ ] Objective 5 — Add regression test covering both RFC-0584 `bordbuch/` and RFC-0614 `public/.well-known/bordbuch*` scenarios (maps to acceptance criterion 5)
- [ ] Objective 6 — Update RFC-0584 `amendedBy` field for V-19 bidirectional integrity (maps to acceptance criterion 8)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — modify `isBordbuchPath` (line 789-790) and `git checkout --ours`/`git add` commands (lines 796-811) to use dynamic `conflictedPaths`
- No new commands. `mission.reconcile` CLI surface unchanged.

### 2.2 Configuration and data

- None.

### 2.3 Documentation and specs

- `docs/rfcs/archive/implemented/rfc-0584-auto-resolve-bordbuch-delete-modify-conflicts-in-mission-reconcile.md` — add `RFC-0614` to `amendedBy` frontmatter field
- No AGENTS.md update needed (confirmed during audit — internal implementation detail)
- No `docs/*.xml` Compass sync needed (no repository-wide semantics change)
- No `docs/architecture-dna.md` change (DNA-51 is protective, not extending)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff test -- --run` — unit tests
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck + build
- `pnpm exec werkstatt run rfc.validate --id RFC-0614 --json` — RFC validation

## 3. Step sequence

### Step 1. Modify `isBordbuchPath` and dynamic conflict resolution

**Goal:** Expand the bordbuch path matching and replace hardcoded path literals with dynamic `conflictedPaths`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` (lines 789-790), verify `isBordbuchPath` already matches `public/.well-known/bordbuch` prefix — it does: `p.startsWith("public/.well-known/bordbuch")`. No change needed to the predicate itself.
- Replace the hardcoded `git checkout --ours bordbuch/ public/.well-known/bordbuch.json public/.well-known/bordbuch/` command (lines 796-803) with a dynamic version:
  ```ts
  const pathArgs = conflictedPaths.map((p) => JSON.stringify(p)).join(" ");
  execSync(`git checkout --ours -- ${pathArgs}`, { cwd: systemDir, stdio: "pipe", encoding: "utf-8" });
  ```
- Replace the hardcoded `git add bordbuch/ public/.well-known/bordbuch.json public/.well-known/bordbuch/` command (lines 804-811) with:
  ```ts
  execSync(`git add -- ${pathArgs}`, { cwd: systemDir, stdio: "pipe", encoding: "utf-8" });
  ```
- Update the RFC-0584 comment on line 759 to reference both RFC-0584 and RFC-0614.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — confirms TypeScript compiles

**Completion criterion:** `isBordbuchPath` matches both `bordbuch/` and `public/.well-known/bordbuch*`; `git checkout --ours` and `git add` use `conflictedPaths` dynamically; `build:check` passes.

**Human review:** no

---

### Step 2. Add regression test

**Goal:** Create a test file that verifies auto-resolution for both `bordbuch/` and `public/.well-known/bordbuch*` conflict scenarios.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/rfc-0614-public-well-known-bordbuch-conflict.test.ts`
- Follow the `reconcile-3way-fallback.test.ts` precedent: test git operations directly in temp dirs using real `execSync`, not through `runMissionReconcile`.
- Test case 1 (RFC-0584 regression): create a `bordbuch/events.ndjson` delete/modify conflict in a real git repo, verify `git checkout --ours -- <path>` + `git add -- <path>` resolves it and `git commit --no-edit` succeeds
- Test case 2 (RFC-0614 new): `public/.well-known/bordbuch.json` delete/modify conflict → same resolution pattern
- Test case 3 (RFC-0614 new): `public/.well-known/bordbuch/index.html` delete/modify conflict → same resolution pattern
- Test case 4 (partial bordbuch set): only `bordbuch/events.ndjson` conflicted, `public/.well-known/bordbuch*` does not exist → verify that dynamic `conflictedPaths`-based checkout/add does NOT error on missing paths (the key robustness fix)
- Test case 5 (mixed conflict): `bordbuch/events.ndjson` + `src/content/page.md` conflicts → verify that a non-bordbuch path in the conflict set prevents auto-resolution (the `allBordbuch` check fails, merge is aborted)
- Use `gitInit`/`gitCommit` helper functions following the `reconcile-3way-fallback.test.ts` pattern
- Simulate delete/modify: create a file in the common ancestor, delete it in the workpiece branch, modify it in the cache clone branch, then merge — this produces a `DU` conflict status

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test -- --run` — all tests pass

**Completion criterion:** All 5 test cases pass; test file is discovered by vitest (`src/**/*.test.ts` glob).

**Human review:** no

---

### Step 3. Update RFC-0584 `amendedBy` field

**Goal:** Fix V-19 bidirectional referential integrity warning.

**Agent actions:**

- Edit `docs/rfcs/archive/implemented/rfc-0584-auto-resolve-bordbuch-delete-modify-conflicts-in-mission-reconcile.md`
- Add `RFC-0614` to the `amendedBy` frontmatter field (currently `amendedBy: []`)

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0614 --json` — V-19 warning is resolved

**Completion criterion:** `rfc.validate` passes with zero warnings for RFC-0614.

**Human review:** no

---

### Step 4. Check off acceptance criteria and verify

**Goal:** Verify all acceptance criteria are met and check them off with evidence.

**Agent actions:**

- Check each acceptance criterion in the RFC against the implemented code
- Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0614 --json` — confirms all criteria checked

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0614 --json`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test -- --run`

**Completion criterion:** All 8 acceptance criteria checked off with evidence; `rfc.validate` passes clean (no warnings).

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Run code review, fix findings, stamp RFC as implemented.

**Agent actions:**

- Run code review: invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0614 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0614`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0614`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test -- --run`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0614` in the subject line (RFC-0265 commit hygiene)
- Test file `packages/os/site-kernel-handoff/src/tests/rfc-0614-public-well-known-bordbuch-conflict.test.ts` as regression evidence

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Over-broad path matching (`public/.well-known/bordbuch` prefix) | Step 2 test case 4 verifies non-bordbuch conflicts still abort |
| Agent misinterpretation (thinking auto-resolution applies to all `.well-known/`) | RFC implementation notes explicitly constrain to `bordbuch` prefix; Step 2 test case 4 verifies |
| Partial bordbuch artifact sets (some paths don't exist) | Step 1 uses dynamic `conflictedPaths`; Step 2 test case 5 verifies this scenario |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-51, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0614 --reason "..." --invariant "DNA-51"` instead of working around it.
