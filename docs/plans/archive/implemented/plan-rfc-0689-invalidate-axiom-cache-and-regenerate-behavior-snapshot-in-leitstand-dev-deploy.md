---
rfcId: RFC-0689
planId: PLAN-RFC-0689-01
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

# Implementation Plan: RFC-0689

## 1. Objectives

- [ ] Objective 1 — `leitstand.dev-deploy` clears Axiom browser evidence cache before `mission.check` (maps to acceptance criterion 1)
- [ ] Objective 2 — `leitstand.dev-deploy` auto-regenerates behavior snapshot when `behavior.snapshot.validate` fails with SNAP-01 after `pnpm build` failure (maps to acceptance criterion 2)
- [ ] Objective 3 — `leitstand.dev-deploy` re-runs `pnpm build` after regeneration and blocks if re-build fails (maps to acceptance criterion 3)
- [ ] Objective 4 — `leitstand.dev-deploy` checks for stale snapshot when build is skipped (RFC-0653) (maps to acceptance criterion 2)
- [ ] Objective 5 — No manual `--no-cache` flag or `behavior.snapshot.generate` invocation needed (maps to acceptance criterion 4)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — Modified: add Axiom cache clearing before `mission.check`; add SNAP-01 detection and auto-regeneration in the build failure path; add stale snapshot check when `buildSkipped=true`
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — Modified: extract shared `autoRegenerateSnapshotOnSnap01` helper from existing RFC-0615 logic (lines 445–499) for reuse by `leitstand.dev-deploy`
- `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts` — Reviewed: update `writes` patterns for `leitstand.dev-deploy` to include `.cache/**` (already declared in `mission.check`, but `leitstand.dev-deploy` should declare it too since it now clears the cache)

### 2.2 Configuration and data

- No configuration files changed. The Axiom cache directory path (`missions/{mission}/evidence/axiom/.cache/`) is already the default for `mission.check`.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — Updated: document the automatic cache invalidation and snapshot auto-regeneration behavior in the Leitstand section
- RFC file (read-only reference): `docs/rfcs/rfc-0689-invalidate-axiom-cache-and-regenerate-behavior-snapshot-in-leitstand-dev-deploy.md`

### 2.4 Validation and pipelines

- No pipeline changes. Both changes are internal to `leitstand.dev-deploy` orchestration.
- Unit tests in `packages/os/site-kernel-handoff/src/tests/`

## 3. Step sequence

### Step 1. Extract shared `autoRegenerateSnapshotOnSnap01` helper

**Goal:** Extract the SNAP-01 detection and auto-regeneration logic from `mission-materialization-commands.ts` (RFC-0615, lines 445–499) into a reusable helper function.

**Agent actions:**

- Create `autoRegenerateSnapshotOnSnap01` function in `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` (or a new shared file in the same directory)
- The helper should accept: `workspaceRoot`, `systemId`, `missionId`, `logger`, and a `buildPostReport` (optional — for the `mission.validate` path that has step-level diagnostics) or a `validateResult` (for the `leitstand.dev-deploy` path that runs validate separately)
- The helper should: detect SNAP-01 diagnostics, run `behavior.snapshot.generate`, commit via `mission.git.commit`, and return a boolean indicating whether regeneration was attempted and succeeded
- Refactor the existing RFC-0615 code in `runMissionValidate` to call the new helper instead of inline logic
- Verify `mission.validate` still works identically after refactoring

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Existing tests: `pnpm --filter @warpgogol/site-kernel-handoff exec vitest run src/tests/mission-validate-snapshot-auto-regen.test.ts`

**Completion criterion:** Helper function exists, `mission.validate` uses it, existing tests pass.

**Human review:** no

---

### Step 2. Add Axiom cache clearing before `mission.check`

**Goal:** Clear the Axiom browser evidence cache directory before `mission.check` runs in `leitstand.dev-deploy`.

**Agent actions:**

- In `runLeitstandDevDeploy` (`leitstand-commands.ts`), add cache clearing logic before the "Step 5: Run Axiom verification gate" section (around line 916)
- Use `path.join(missionDir, "evidence", "axiom", ".cache")` to construct the cache path (matching `resolveMissionEvidenceDir` convention)
- Use `fs.rm(cacheDir, { recursive: true, force: true })` with an `existsSync` guard
- Log: `[leitstand.dev-deploy] Cleared Axiom browser evidence cache before mission.check`
- Wrap in try/catch — on failure, log `logger.warn` and continue (non-fatal, equivalent to first-run state)
- Update `leitstand.module.ts` `writes` patterns for `leitstand.dev-deploy` to include `missions/{mission}/evidence/axiom/.cache/**`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** Cache directory is cleared before `mission.check`; `leitstand.dev-deploy` `writes` includes `.cache/**`.

**Human review:** no

---

### Step 3. Add SNAP-01 detection and auto-regeneration in build failure path

**Goal:** When `pnpm build` fails in `leitstand.dev-deploy`, check for SNAP-01 diagnostics and auto-regenerate the behavior snapshot before re-running the build.

**Agent actions:**

- In `runLeitstandDevDeploy` (`leitstand-commands.ts`), modify the build failure catch block (around line 759)
- Instead of immediately returning on build failure, run `behavior.snapshot.validate` via `executeKernelCommand` to check for SNAP-01 diagnostics
- If SNAP-01 is detected, call the shared `autoRegenerateSnapshotOnSnap01` helper (from Step 1) to regenerate the snapshot
- After regeneration, re-run `pnpm build` via `execSync`
- If the re-run succeeds, set `buildState = "succeeded"` and continue the pipeline
- If the re-run fails, return the existing build-failure result
- If SNAP-01 is NOT detected (the build failed for a different reason), return the existing build-failure result immediately
- Log each step clearly with `[leitstand.dev-deploy]` prefix

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** Build failure path checks for SNAP-01, regenerates snapshot, and re-runs build when applicable.

**Human review:** no

---

### Step 4. Add stale snapshot check when build is skipped

**Goal:** When `buildSkipped=true` (RFC-0653), run `behavior.snapshot.validate` separately to detect and regenerate stale snapshots.

**Agent actions:**

- In `runLeitstandDevDeploy` (`leitstand-commands.ts`), after the `buildSkipped` check (around line 742–743), add a `behavior.snapshot.validate` call
- If SNAP-01 is detected, call `behavior.snapshot.generate` via `executeKernelCommand`
- Log the detection and regeneration
- This is non-blocking — if validation fails for non-SNAP-01 reasons, log a warning and continue (the build was skipped, so the existing dist/ is valid)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** Stale snapshot is detected and regenerated when build is skipped.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Add unit tests covering all new behavior in `leitstand.dev-deploy`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/leitstand-0689-cache-snapshot.test.ts`
- Test cases:
  1. **Cache clearing:** verify `fs.rm` is called on the `.cache` directory before `mission.check`
  2. **SNAP-01 auto-regeneration on build failure:** mock `execSync("pnpm build")` to throw, mock `behavior.snapshot.validate` to return SNAP-01 diagnostics, verify `behavior.snapshot.generate` is called and `pnpm build` is re-run
  3. **Non-SNAP-01 build failure:** mock `execSync("pnpm build")` to throw, mock `behavior.snapshot.validate` to return no SNAP-01, verify no regeneration and early return
  4. **Build-skip stale snapshot:** mock `buildSkipped=true`, mock `behavior.snapshot.validate` to return SNAP-01, verify `behavior.snapshot.generate` is called
  5. **Cache directory does not exist:** verify no error when `.cache` directory is absent
- Follow existing test patterns from `leitstand-0628-dev-deploy.test.ts` (mock `@warpgogol/site-kernel`, `node:child_process`, temp directory with `package.json`)
- Include `logger: { info: () => {}, warn: () => {} }` in test context

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff exec vitest run src/tests/leitstand-0689-cache-snapshot.test.ts`

**Completion criterion:** All test cases pass; test file covers cache clearing, SNAP-01 auto-regeneration, non-SNAP-01 failure, build-skip stale snapshot, and missing cache directory.

**Human review:** no

---

### Step 6. Update AGENTS.md documentation

**Goal:** Document the new automatic cache invalidation and snapshot auto-regeneration behavior.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section
- Add: "RFC-0689: `leitstand.dev-deploy` automatically clears the Axiom browser evidence cache (`missions/{mission}/evidence/axiom/.cache/`) before `mission.check` to ensure fresh captures. When `pnpm build` fails, it runs `behavior.snapshot.validate` separately to check for SNAP-01 diagnostics; if detected, it auto-regenerates the snapshot via `behavior.snapshot.generate` and re-runs the build. When the build is skipped (RFC-0653), it still checks for stale snapshots."

**Validation:**

- Visual review of AGENTS.md changes

**Completion criterion:** AGENTS.md documents both automatic behaviors with RFC-0689 reference.

**Human review:** no

---

### Step 7. Validation suite

**Goal:** Run all validation checks to verify the implementation is complete and correct.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0689`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run full test suite: `pnpm --filter @warpgogol/site-kernel-handoff exec vitest run`
- Run typecheck: `pnpm --filter @warpgogol/site-kernel-handoff exec tsc --noEmit`

**Validation:**

- All commands pass with zero errors

**Completion criterion:** `rfc.validate` passes, `build:check` passes, all tests pass, typecheck passes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated with RFC-0689 behavior
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `leitstand.dev-deploy` writes changed — check if manifest needs update)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0689 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0689`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0689`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff exec vitest run`
- `pnpm --filter @warpgogol/site-kernel-handoff exec tsc --noEmit`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0689` in the subject line (RFC-0265 commit hygiene)
- No acceptance probes declared (commented out in RFC frontmatter) — `rfc.verification.emit` will produce no evidence file (expected behavior)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Snapshot auto-regeneration masks unintended changes | Step 3: re-run `pnpm build` after regeneration; if it still fails, pipeline blocks — only passes if the new snapshot is internally consistent |
| Cache clearing adds I/O | Step 2: cache directory is small (Playwright captures for ~100 pages); cost is negligible vs. 40-second Axiom scan |
| Agent reliance on auto-regeneration | Step 6: AGENTS.md documents the automatic behavior; agents can rely on it as the correct workflow |
| Concurrent `leitstand.dev-deploy` runs | Step 6: AGENTS.md documents that concurrent execution on the same mission is not supported |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0689 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the shared helper extraction from `mission.validate` reveals that the two paths (`executeKernelPipeline` vs `execSync`) cannot be unified, implement the SNAP-01 detection logic separately in `leitstand-commands.ts` without a shared helper, and document the divergence.
