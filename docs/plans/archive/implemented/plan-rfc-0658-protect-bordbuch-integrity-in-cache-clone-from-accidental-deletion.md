---
rfcId: RFC-0658
planId: PLAN-RFC-0658-01
status: draft
owner: architecture
createdAt: 2026-08-03
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-handoff
    - packages/os/site-kernel-checks
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0658

## 1. Objectives

- [ ] Objective 1 — Pre-commit hook in cache clone rejects commits deleting `bordbuch/events.ndjson` (maps to acceptance criterion 1)
- [ ] Objective 2 — `mission.materialize` installs the pre-commit hook transparently (maps to acceptance criterion 2)
- [ ] Objective 3 — `mission.close` validates bordbuch before appending close event, fails on violations (maps to acceptance criterion 3)
- [ ] Objective 4 — `build.prepare` pipeline includes `bordbuch.validate` step (maps to acceptance criterion 4)
- [ ] Objective 5 — Existing bordbuch validation tests still pass and new tests cover all three measures (maps to acceptance criterion 5)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-hook.ts` — **new file**: `installBordbuchPreCommitHook` function
- `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` — call `installBordbuchPreCommitHook` after `resolveCachePath`, before workpiece staging
- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — call `validateBordbuch` before `appendBordbuchEntry`, add `bordbuchValidation` to `MissionCloseData`
- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — add `{ command: "bordbuch.validate" }` to `SITES_BUILD_PREPARE_PIPELINE` after `bordbuch.generate` and before `bordbuch.commit`
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch.module.ts` — no change needed (`bordbuch.validate` already registered)

### 2.2 Configuration and data

- No YAML/JSON/NDJSON changes. The pre-commit hook is a shell script written dynamically by `installBordbuchPreCommitHook`.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add RFC-0658 rules: pre-commit hook installation, `mission.close` bordbuch validation, `bordbuch.validate` in `build.prepare`

### 2.4 Validation and pipelines

- `SITES_BUILD_PREPARE_PIPELINE` gains `bordbuch.validate` step
- `SITES_BUILD_PREPARE_DEV_PIPELINE` — no change (dev pipeline excludes bordbuch steps)
- Pipeline membership test: `packages/os/site-kernel-checks/src/tests/build-prepare-pipeline.test.ts` — add test for `bordbuch.validate` membership and ordering

## 3. Step sequence

### Step 1. Create `installBordbuchPreCommitHook` function

**Goal:** Create the pre-commit hook installer that writes the guard script to `.git/hooks/pre-commit` in the cache clone.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-hook.ts`
- Export `installBordbuchPreCommitHook(cacheClonePath: string, systemId: string): Promise<BordbuchHookResult>` where `BordbuchHookResult = { installed: boolean; hookPath: string; systemId: string }`
- The hook script content: `#!/bin/sh\n# Warpgogol bordbuch integrity guard (RFC-0658)\n# Rejects commits that delete bordbuch/events.ndjson\nif git diff --cached --name-status --diff-filter=D | grep -q 'bordbuch/events.ndjson'; then\n  echo "ERROR: refusing to delete bordbuch/events.ndjson (RFC-0658)" >&2\n  echo "If you need to reset bordbuch, use bordbuch.repair instead." >&2\n  exit 1\nfi\n`
- Use `writeFileIfChanged` from `@warpgogol/site-kernel` to write the hook (idempotent)
- `chmod 0o755` the hook file after writing
- If `.git/hooks/` directory doesn't exist, create it
- Return `{ installed: true, hookPath, systemId }`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` compiles without errors

**Completion criterion:** `bordbuch-hook.ts` exists, exports `installBordbuchPreCommitHook`, and compiles cleanly

**Human review:** no

---

### Step 2. Wire hook installation into `mission.materialize`

**Goal:** `mission.materialize` installs the pre-commit hook in the cache clone during every materialization.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts`, after `resolveCachePath` (line 611) and before workpiece staging (line 710), call `installBordbuchPreCommitHook(systemDir, manifest.systemId)`
- Import `installBordbuchPreCommitHook` from `../bordbuch/bordbuch-hook.ts`
- Log the installation: `logger.info(\` Installed bordbuch pre-commit hook in cache clone\`)`
- Make hook installation non-fatal: wrap in try/catch, log `logger.warn` on failure (cache clone without `.git` is valid for non-git Sternsystems)
- Add `bordbuchHookInstalled: boolean` to `MissionMaterializeData` interface

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** `mission.materialize` calls `installBordbuchPreCommitHook` and includes `bordbuchHookInstalled` in output

**Human review:** no

---

### Step 3. Add `bordbuch.validate` to `build.prepare` pipeline

**Goal:** The full `build.prepare` pipeline includes `bordbuch.validate` between `bordbuch.generate` and `bordbuch.commit`.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`, add `{ command: "bordbuch.validate" }` to `SITES_BUILD_PREPARE_PIPELINE` after `bordbuch.generate` (line 124) and before `bordbuch.commit` (line 126)
- Do NOT add it to `SITES_BUILD_PREPARE_DEV_PIPELINE`
- Add CHANGE_SUMMARY entry: `RFC-0658: added bordbuch.validate after bordbuch.generate and before bordbuch.commit`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks build:check`
- `pnpm --filter @warpgogol/site-kernel-checks test` (existing pipeline membership tests pass)

**Completion criterion:** `SITES_BUILD_PREPARE_PIPELINE` contains `bordbuch.validate` between `bordbuch.generate` and `bordbuch.commit`; `SITES_BUILD_PREPARE_DEV_PIPELINE` does not

**Human review:** no

---

### Step 4. Add bordbuch validation to `mission.close`

**Goal:** `mission.close` validates bordbuch integrity before appending the close event, providing defense-in-depth for the distribution-reuse skip path (RFC-0635).

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-close.ts`, import `validateBordbuch` and `BordbuchViolation` from `../bordbuch/bordbuch-io.ts`
- Before the `appendBordbuchEntry` call (line 262), call `validateBordbuch(workspaceRoot, manifest.systemId)`
- If violations exist, throw an error with violation details (same pattern as `mission.open` preflight at mission-open.ts:88-96): `[mission.close] bordbuch for system '<id>' has <N> violation(s) — run bordbuch.repair first\n<violation lines>`
- Add `bordbuchValidation: { violations: BordbuchViolation[]; checked: boolean }` to `MissionCloseData` interface
- Set `bordbuchValidation: { violations: [], checked: true }` on success, or `{ violations, checked: true }` on failure (though failure throws before reaching the return)
- Add CHANGE_SUMMARY entry: `RFC-0658: validate bordbuch before appending close event (defense-in-depth for distribution-reuse skip path)`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** `mission.close` calls `validateBordbuch` before `appendBordbuchEntry` and throws on violations; `MissionCloseData` includes `bordbuchValidation`

**Human review:** no

---

### Step 5. Write tests

**Goal:** Unit tests covering all three measures: hook installation, pipeline membership, and `mission.close` validation.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/bordbuch-hook.test.ts`:
  - Test `installBordbuchPreCommitHook` writes the hook script to `.git/hooks/pre-commit`
  - Test hook script is executable (mode 0o755)
  - Test idempotency: second call is a no-op (content unchanged)
  - Test hook script content matches RFC-0658 spec
  - Test creates `.git/hooks/` directory if missing
- Update `packages/os/site-kernel-checks/src/tests/build-prepare-pipeline.test.ts`:
  - Add test: `bordbuch.validate` is in `SITES_BUILD_PREPARE_PIPELINE`
  - Add test: `bordbuch.validate` appears after `bordbuch.generate` and before `bordbuch.commit`
  - Add test: `bordbuch.validate` is NOT in `SITES_BUILD_PREPARE_DEV_PIPELINE`
- Create `packages/os/site-kernel-handoff/src/tests/rfc-0658-mission-close-bordbuch-validate.test.ts`:
  - Test `mission.close` throws when bordbuch has violations (mock `validateBordbuch` to return violations)
  - Test `mission.close` succeeds when bordbuch is valid (mock `validateBordbuch` to return empty violations)
  - Test `bordbuchValidation` field is populated in the result
  - Mock `readMissionManifest`, `readRegistry`, `writeRegistry`, `runMissionValidate`, `commitAndPushBordbuch`, `appendBordbuchEntry` as needed

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm --filter @warpgogol/site-kernel-checks test`

**Completion criterion:** All new tests pass; existing tests still pass

**Human review:** no

---

### Step 6. Update AGENTS.md

**Goal:** Document the three new bordbuch integrity measures in the handoff package's AGENTS.md.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`, add a new section "## Bordbuch integrity protection (RFC-0658)" after the existing "## Bordbuch repair (RFC-0583)" section
- Document: pre-commit hook installation by `mission.materialize`, hook scope (cache clone only, not workpiece clones), `mission.close` bordbuch validation (defense-in-depth for distribution-reuse skip path), `bordbuch.validate` in `build.prepare` (full pipeline only, not dev)

**Validation:**

- Visual inspection

**Completion criterion:** AGENTS.md has a new RFC-0658 section documenting all three measures

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated (step 6)
- Run `pnpm exec site-kernel run command.manifest.generate` if command surfaces changed (no new commands — `bordbuch.validate` already registered — so this may not be needed; check if pipeline change triggers manifest regeneration)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0658 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0658`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm --filter @warpgogol/site-kernel-checks test`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476)

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0658`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm --filter @warpgogol/site-kernel-checks build:check`
- `pnpm --filter @warpgogol/site-kernel-checks test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0658` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Pre-commit hook missing on old cache clones | Step 3 (pipeline) + Step 4 (mission.close) provide defense-in-depth; hook installed on next materialize (Step 2) |
| False positive on legitimate bordbuch reset | Hook message directs to `bordbuch.repair`; `bordbuch.repair` is the sanctioned override path |
| Pipeline `bordbuch.validate` adds latency to `build.prepare` | `validateBordbuch` reads a single NDJSON file — O(n) in event count, typically <100 events; negligible vs. 30+ existing steps |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-51, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0658 --reason "..." --invariant "DNA-N"` instead of working around it.
