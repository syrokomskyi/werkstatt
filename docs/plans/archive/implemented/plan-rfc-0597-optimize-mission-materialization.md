---
rfcId: RFC-0597
planId: PLAN-RFC-0597-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages:
    - site-kernel-checks
    - site-kernel-handoff
    - site-kernel
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0597

## 1. Objectives

- [ ] O1 — Split `build.prepare` pipeline into `.dev` (codegen-only) and `.full` (existing) — maps to acceptance criteria 1, 2
- [ ] O2 — Register `build.prepare.dev` pipeline in kernel config template and existing workpiece configs — maps to acceptance criterion 4
- [ ] O3 — Add materialization state file read/skip logic to `mission.materialize` — maps to acceptance criterion 3
- [ ] O4 — Add `.cache/` warming (cache clone → workpiece) to `mission.materialize` — maps to acceptance criterion 5
- [ ] O5 — Add state file write + `.cache/` copy (workpiece → cache clone) to `mission.close` — maps to acceptance criteria 6, 7
- [ ] O6 — Add `--json` output fields (`preflightSkipped`, `preflightSkipReason`, `pipelineUsed`, `mediaCacheWarmed`) — maps to acceptance criterion 8
- [ ] O7 — Unit tests for preflight skip, state file, media cache copy — maps to acceptance criterion 9
- [ ] O8 — Verify `bordbuch.validate` at `mission.open` unchanged — maps to acceptance criterion 10
- [ ] O9 — Documentation sync (AGENTS.md updates) — maps to RFC risks/mitigation

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — export new `SITES_BUILD_PREPARE_DEV_PIPELINE` constant
- `packages/os/site-kernel-checks/src/pipelines/index.ts` — re-export `SITES_BUILD_PREPARE_DEV_PIPELINE`
- `packages/os/site-kernel-checks/src/module.ts` — re-export `SITES_BUILD_PREPARE_DEV_PIPELINE` from module entry
- `packages/os/site-kernel/src/templates/wire/tools/kernel.config.template.ts` — import and register `build.prepare.dev` pipeline
- `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` — state file read, conditional preflight skip, `.dev` pipeline invocation, `.cache/` warming, `--json` output fields
- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — state file write, `.cache/` copy to cache clone

### 2.2 Configuration and data

- `systems-cache/<id>/.materialization-state.json` — new state file (runtime, outside git)
- `systems-cache/<id>/.cache/video/` — persisted media cache (runtime, outside git)
- `systems-cache/<id>/.cache/video-live/` — persisted media cache (runtime, outside git)

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — document `build.prepare.dev` vs `build.prepare.full` usage in mission lifecycle
- `packages/os/site-kernel-checks/AGENTS.md` — document `SITES_BUILD_PREPARE_DEV_PIPELINE` export in pipelines module table

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm exec werkstatt run rfc.validate`

## 3. Step sequence

### Step 1. Export `SITES_BUILD_PREPARE_DEV_PIPELINE` from `site-kernel-checks`

**Goal:** Define the codegen-only pipeline constant alongside the existing full pipeline.

**Agent actions:**

- Add `SITES_BUILD_PREPARE_DEV_PIPELINE` constant to `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` containing all codegen steps from the existing pipeline up to `i18n.middleware.generate`, plus `uni.registry.build` and `generated.files.validate`. Exclude: `sitemap.generate`, `preview.images.generate`, `llms.generate`, `public.managed.clean`, `page.markdown.generate`, `feed.generate`, `ai.generate`, `ai.policy.generate`, `robots.generate`, `public.artifact.generate`, `image.variants.generate`, `video.variants.generate`, `live.variants.generate`, `material.metadata.write`, `warpgogol.check-hints.generate`, `manifest.contract.validate`, `mirror.quintet.validate`.
- Re-export from `packages/os/site-kernel-checks/src/pipelines/index.ts`.
- Re-export from `packages/os/site-kernel-checks/src/module.ts` (alongside existing `SITES_BUILD_PREPARE_PIPELINE`).
- Add RFC-0597 entry to `CHANGE_SUMMARY` in `build-prepare.ts`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes.
- `SITES_BUILD_PREPARE_DEV_PIPELINE` is importable from `@warpgogol/site-kernel-checks/pipelines`.

**Completion criterion:** `SITES_BUILD_PREPARE_DEV_PIPELINE` exported with all codegen generators + `generated.files.validate` + `uni.registry.build`; no media/static-public generators; `build:check` passes.

**Human review:** no

---

### Step 2. Register `build.prepare.dev` in kernel config template

**Goal:** Wire the new pipeline into the kernel config template so it is available at runtime.

**Agent actions:**

- Edit `packages/os/site-kernel/src/templates/wire/tools/kernel.config.template.ts`:
  - Add `SITES_BUILD_PREPARE_DEV_PIPELINE` to the import from `@warpgogol/site-kernel-checks/pipelines`.
  - Add `"build.prepare.dev": [...SITES_BUILD_PREPARE_DEV_PIPELINE]` to the `pipelines` section.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` passes.
- Template token substitution still works (no new tokens needed).

**Completion criterion:** `build.prepare.dev` pipeline registered in the template; `build:check` passes.

**Human review:** no

---

### Step 3. Add materialization state file and preflight skip logic to `mission.materialize`

**Goal:** Read `.materialization-state.json`, compare cache clone HEAD, skip preflight when matched.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts`:
  - Define `MaterializationState` interface (`systemId`, `cacheCloneHead`, `lastValidatedAt`, `lastMissionId`).
  - After `syncCacheClone` and before preflight, read `systems-cache/<id>/.materialization-state.json`.
  - Get current cache clone HEAD via `git rev-parse HEAD` in `systemDir`.
  - If state file exists, is parseable, and `cacheCloneHead === currentHead` and `--skip-preflight` is NOT set: skip preflight, append bordbuch `preflight-skipped` entry with reason `"cache-clone-head-unchanged"`.
  - If `--skip-preflight` IS set: skip preflight (existing behavior), append bordbuch entry with reason `"operator override via --skip-preflight flag"`. State file is not consulted.
  - If state file missing, corrupt, or HEAD mismatch: run preflight normally (existing behavior).
  - Add `preflightSkipped: boolean`, `preflightSkipReason: string | null` to the `--json` output data.
- Add `pipelineUsed: "build.prepare.dev"` to the `--json` output data.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes.
- Unit test: state file with matching HEAD → preflight skipped, bordbuch appended.
- Unit test: missing state file → preflight runs normally.
- Unit test: `--skip-preflight` flag → preflight skipped, state file not consulted.

**Completion criterion:** `mission.materialize` reads state file, skips preflight on HEAD match, `--skip-preflight` flag takes precedence, `--json` output includes `preflightSkipped`/`preflightSkipReason`/`pipelineUsed`.

**Human review:** no

---

### Step 4. Switch `mission.materialize` to `build.prepare.dev` pipeline

**Goal:** Run the codegen-only pipeline instead of the full pipeline.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts`:
  - Change `pipelineName: "build.prepare"` to `pipelineName: "build.prepare.dev"` in the `executeKernelPipeline` call (line ~786).
  - Update the log message to reflect `.dev` pipeline.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes.
- `mission.materialize` invokes `build.prepare.dev` (verifiable via `--json` output `pipelineUsed` field).

**Completion criterion:** `mission.materialize` runs `build.prepare.dev` pipeline; `pipelineUsed` field in `--json` output is `"build.prepare.dev"`.

**Human review:** no

---

### Step 5. Add `.cache/` warming to `mission.materialize`

**Goal:** Copy `.cache/video/` and `.cache/video-live/` from cache clone to workpiece after git clone.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts`:
  - After the git clone and data-path copy (after line ~725), before `generateFullBoilerplate`:
    - Check if `systems-cache/<id>/.cache/video/` exists. If yes, `rm -rf workpiece/.cache/video` then copy to `workpiece/.cache/video/`.
    - Same for `.cache/video-live/`.
    - Log `"  Warmed .cache/video from cache clone (N entries)"` on success.
    - On copy failure: log warning, continue (fail-safe).
  - Add `mediaCacheWarmed: boolean`, `mediaCacheSources: number` to `--json` output data.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes.
- Unit test: cache clone has `.cache/video/` → workpiece gets `.cache/video/` after materialization.
- Unit test: cache clone has no `.cache/` → `mediaCacheWarmed: false`, `mediaCacheSources: 0`.

**Completion criterion:** `mission.materialize` copies `.cache/video/` and `.cache/video-live/` from cache clone to workpiece; `--json` output includes `mediaCacheWarmed`/`mediaCacheSources`.

**Human review:** no

---

### Step 6. Add state file write and `.cache/` copy to `mission.close`

**Goal:** Persist materialization state and media cache at mission close.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-close.ts`:
  - As the **final step** in `mission.close` — AFTER git bundle creation, bordbuch commit, and state transition to `closed`, but BEFORE returning success:
    - Get current cache clone HEAD via `git rev-parse HEAD` in `systemDir`.
    - Write `.materialization-state.json` to `systems-cache/<id>/` with `{ systemId, cacheCloneHead, lastValidatedAt: now, lastMissionId: missionId }`.
    - If `workpiece/.cache/video/` exists: `rm -rf systemDir/.cache/video` then copy to `systemDir/.cache/video/`. Same for `.cache/video-live/`.
    - On `.cache/` copy failure: log warning, continue (fail-safe — close still succeeds, next materialization re-encodes).
  - **Ordering rationale:** The state file must only be written if the close succeeded. If close fails midway (bundle creation, bordbuch commit, state transition), no state file is written — the next materialization runs full preflight, which is the safe fallback.
  - `mission.reconcile` is NOT modified — it does not write the state file or copy `.cache/`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes.
- Unit test: `mission.close` writes `.materialization-state.json` with correct HEAD.
- Unit test: `mission.close` copies `.cache/video/` from workpiece to cache clone.
- Unit test: workpiece with no `.cache/` → no copy, no error.

**Completion criterion:** `mission.close` writes state file and copies `.cache/` to cache clone; `mission.reconcile` unchanged.

**Human review:** no

---

### Step 7. Unit tests

**Goal:** Comprehensive test coverage for all new behavior.

**Agent actions:**

- Add tests to `packages/os/site-kernel-handoff/src/tests/` (verify vitest config discovers them):
  - `mission-materialize-preflight-skip.test.ts`:
    - State file with matching HEAD → preflight skipped, bordbuch `preflight-skipped` entry appended with reason `"cache-clone-head-unchanged"`.
    - Missing state file → preflight runs normally.
    - Corrupt state file (invalid JSON) → preflight runs normally.
    - State file with mismatched HEAD → preflight runs normally.
    - `--skip-preflight` flag set → preflight skipped, state file not consulted, bordbuch reason `"operator override via --skip-preflight flag"`.
  - `mission-materialize-media-cache.test.ts`:
    - Cache clone has `.cache/video/` → workpiece gets `.cache/video/` after materialization, `mediaCacheWarmed: true`.
    - Cache clone has no `.cache/` → `mediaCacheWarmed: false`, `mediaCacheSources: 0`.
    - Existing workpiece `.cache/` from failed run → replaced (not merged) by cache clone's `.cache/`.
  - `mission-close-state-file.test.ts`:
    - `mission.close` writes `.materialization-state.json` with current cache clone HEAD.
    - `mission.close` copies `.cache/video/` and `.cache/video-live/` from workpiece to cache clone.
    - Workpiece with no `.cache/` → no copy, no error, close succeeds.
- Run tests: `pnpm --filter @warpgogol/site-kernel-handoff run test`.

**Validation:**

- All new tests pass.
- Existing tests still pass (no regressions).

**Completion criterion:** All test cases pass; `pnpm --filter @warpgogol/site-kernel-handoff run test` is green.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Update AGENTS.md files to document the pipeline split and new behavior.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/AGENTS.md`:
  - In the mission lifecycle section, document that `mission.materialize` uses `build.prepare.dev` (codegen-only) and `mission.validate`/`release.prepare` use `build.prepare.full`.
  - Document the `.materialization-state.json` state file and `.cache/` warming.
- Update `packages/os/site-kernel-checks/AGENTS.md`:
  - In the pipelines module table, add `SITES_BUILD_PREPARE_DEV_PIPELINE` export from `build-prepare.ts`.

**Validation:**

- `git diff` shows only the two AGENTS.md files changed.
- No broken markdown links.

**Completion criterion:** Both AGENTS.md files updated with pipeline split and new behavior documentation.

**Human review:** no

---

### Step 9. Validation suite

**Goal:** Run all validation checks before stamping implemented.

**Agent actions:**

- `pnpm exec werkstatt run rfc.validate` — no violations targeting RFC-0597.
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — passes.
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — passes.
- `pnpm --filter @warpgogol/site-kernel run build:check` — passes.
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — all tests pass.
- Verify `bordbuch.validate` at `mission.open` is unchanged (grep for `mission.open` in modified files — should be no hits in `mission-materialize.ts` or `mission-close.ts`).

**Validation:**

- All commands exit 0.

**Completion criterion:** All validation checks pass; no regressions.

**Human review:** no

---

### Final Step. Review, fix, and acceptance criteria verification

**Goal:** Run code review, fix findings, verify acceptance criteria, stamp as implemented.

**Agent actions:**

- Run code review: invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in RFC-0597 against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0597 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate` — no violations.
- Review report exists for this session.
- All acceptance criteria checked off.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria checked off with inline evidence annotations; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0597` in the subject line (RFC-0265 commit hygiene)
- Unit test files in `packages/os/site-kernel-handoff/src/tests/`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| `build.prepare.dev` missing a generator needed for dev | Step 1 includes all `src/` codegen generators + `generated.files.validate` as safety net; Step 7 tests verify dev server artifacts exist |
| Media cache disk usage | Step 5 uses replace (not merge) semantics; content-addressed cache avoids duplicates |
| State file not committed to git (machine-local) | Step 3 treats missing state file as "no prior validation" — fail-safe |
| Agent confusion about pipeline split | Step 8 updates AGENTS.md files with clear documentation |
| Stale preflight skip after force-push | Step 3 uses `git rev-parse HEAD` — amended commits have different hashes |
| `.cache/` copy failure | Steps 5 and 6 log warnings and continue — fail-safe, falls back to re-encoding |
| Concurrent materialization | Existing `acquireLock` in `mission-materialize.ts:565-578` prevents races — no new locking needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-47, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0597 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `build.prepare.dev` causes dev server failures due to a missing generator, move the generator from `.dev` to `.full` and update the RFC's pipeline list — but this is a bug in classification, not a design flaw.
