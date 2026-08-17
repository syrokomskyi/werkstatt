---
rfcId: RFC-0870
planId: PLAN-RFC-0870-01
status: draft
owner: architecture
createdAt: 2026-08-17
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - "AGENTS.md"
---

# Implementation Plan: RFC-0870

## 1. Objectives

- [ ] Objective 1 — Add manifest presence check to `sternsystem.validate` (maps to acceptance criterion: "sternsystem.validate emits STERN-MANIFEST-01")
- [ ] Objective 2 — Restore registry-only generated files in `mission.materialize` after `atomicMoveDir` (maps to acceptance criterion: "mission.materialize restores registry-only generated files")
- [ ] Objective 3 — Add pipeline-not-command hint to kernel CLI error messages (maps to acceptance criterion: "Kernel CLI includes pipeline hint")
- [ ] Objective 4 — Register manifest paths in `GENERATOR_OWNERSHIP_MAP` (enabler for Objectives 1 and 2)
- [ ] Objective 5 — Update `AGENTS.md` with pipeline-vs-command note (maps to acceptance criterion: "AGENTS.md updated")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/generator-ownership.ts` — add three manifest entries to `GENERATOR_OWNERSHIP_MAP`
- `packages/werkstatt/src/sternsystem/sternsystem-validate.ts` — add manifest presence check (Change 1)
- `packages/werkstatt/src/mission/mission-materialize.ts` — add `git checkout` for registry-only files after `atomicMoveDir` (Change 2)
- `packages/werkstatt/src/kernel/cli/index.ts` — add pipeline hint to "Unknown command" error path (Change 3)
- `packages/werkstatt/src/kernel/runtime/execute-command.ts` — add pipeline hint to "No target site" error path (Change 3)

### 2.2 Configuration and data

No YAML/JSON/config changes. The manifest paths are hardcoded in the ownership registry, not in config files.

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add note about pipeline vs command distinction in the kernel CLI section
- RFC file is read-only reference

### 2.4 Validation and pipelines

No new pipeline steps. Changes are internal to existing commands (`sternsystem.validate`, `mission.materialize`, CLI error paths).

## 3. Step sequence

### Step 1. Register manifest paths in GENERATOR_OWNERSHIP_MAP

**Goal:** Add `src/image-variants.generated.yaml`, `src/video-manifest.generated.yaml`, and `src/live-video-manifest.generated.yaml` to the generator ownership registry so they are tracked as generated files.

**Agent actions:**

- Add three entries to `GENERATOR_OWNERSHIP_MAP` in `packages/werkstatt-site/src/checks/generator-ownership.ts` with `markerPolicy: "registry-only"` and `conditional: true` (manifests only exist when source images/videos exist)
- Entry for `image-variants.generated.yaml`: command `image.variants.generate`, module `packages/werkstatt-site/src/checks/image-variants.ts`
- Entry for `video-manifest.generated.yaml`: command `video.variants.generate`, module `packages/werkstatt-site/src/checks/video/video-variants.ts`
- Entry for `live-video-manifest.generated.yaml`: command `live.variants.generate`, module `packages/werkstatt-site/src/checks/live-variants.ts`
- Add `CHANGE_SUMMARY` entry: `RFC-0870: register generated manifest paths (image-variants, video-manifest, live-video-manifest) as registry-only conditional entries.`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** Three new entries present in `GENERATOR_OWNERSHIP_MAP`, typecheck passes.

**Human review:** no

---

### Step 2. Add manifest presence check to sternsystem.validate

**Goal:** After existing mirror topology checks, verify that committed generated manifests are present in the cache clone git HEAD. Emit `STERN-MANIFEST-01` for each missing manifest.

**Agent actions:**

- In `packages/werkstatt/src/sternsystem/sternsystem-validate.ts`, add a new function `checkManifestPresence` that:
  - Takes `cacheDir` and `systemId` as arguments
  - Uses `git ls-tree HEAD -- <path>` to check if each manifest path is tracked in git
  - Returns `SternsystemViolation[]` with rule `STERN-MANIFEST-01` for each missing manifest
  - Only checks manifests that are tracked in git (if not tracked, skip — the system hasn't committed one yet)
- Call `checkManifestPresence` after existing checks in the main validate function
- Add the three manifest paths as a constant: `COMMITTED_MANIFEST_PATHS = ["src/image-variants.generated.yaml", "src/video-manifest.generated.yaml", "src/live-video-manifest.generated.yaml"]`
- Add `CHANGE_SUMMARY` entry for RFC-0870

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `sternsystem.validate` emits `STERN-MANIFEST-01` violations when a manifest is tracked in git but missing from HEAD. Typecheck passes.

**Human review:** no

---

### Step 3. Restore registry-only files in mission.materialize

**Goal:** After `atomicMoveDir`, run `git checkout -- <file>` for all git-tracked registry-only generated files to ensure they exist on disk.

**Agent actions:**

- In `packages/werkstatt/src/mission/mission-materialize.ts`, after the `atomicMoveDir` call (line ~1162) and after `.env` restoration (line ~1183), add a new restoration step:
  - Dynamic `import()` the `GENERATOR_OWNERSHIP_MAP` from `@warpgogol/werkstatt-site/checks/generator-ownership` (respects DNA-64)
  - Filter entries: `markerPolicy === "registry-only"` and `conditional !== true` (conditional files may not exist)
  - For each entry, run `git checkout -- <path>` in the workpiece directory
  - Wrap in try/catch — log warning on failure, continue (non-fatal)
  - Log restored file count
- Add `CHANGE_SUMMARY` entry for RFC-0870

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `mission.materialize` runs `git checkout` for non-conditional registry-only generated files after `atomicMoveDir`. Typecheck passes.

**Human review:** no

---

### Step 4. Add pipeline hint to kernel CLI error messages

**Goal:** When `werkstatt run <name>` fails with "Unknown command" or "No target site resolved" and `<name>` matches a known pipeline name, append a hint to the error message.

**Agent actions:**

- In `packages/werkstatt/src/kernel/cli/index.ts`:
  - After the "Unknown command" message (line 39), check if the command name matches a known pipeline name
  - Pipeline names to check: `build.prepare`, `build.check`, `build.post`, `sites.check`, `sites.check.author`, `sites.check.postbuild`, `packages.check`, `standard.compass`
  - If match, append: `\nHint: '<name>' is a pipeline, not a command. Run 'werkstatt pipeline <name>' instead, or use 'mission.validate' which executes the full pipeline.`
- In `packages/werkstatt/src/kernel/runtime/execute-command.ts`:
  - Before the "No target site with a kernel config could be resolved" throw (line 447), check if the command name matches a known pipeline name
  - If match, append the same hint to the error message
- Add `CHANGE_SUMMARY` entries for RFC-0870

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** Both error paths include the pipeline hint when the name matches a known pipeline. Typecheck passes.

**Human review:** no

---

### Step 5. Write tests

**Goal:** Add unit tests for all three changes.

**Agent actions:**

- `packages/werkstatt/src/sternsystem/sternsystem-manifest-presence.test.ts`:
  - Test: `STERN-MANIFEST-01` emitted when manifest is tracked but missing from HEAD
  - Test: No violation when manifest is not tracked (new system)
  - Test: No violation when manifest is present in HEAD
- `packages/werkstatt/src/mission/mission-materialize-registry-restore.test.ts`:
  - Test: `git checkout` called for non-conditional registry-only files after `atomicMoveDir`
  - Test: Failure is non-fatal (warning logged, materialize continues)
  - Mock `@warpgogol/werkstatt-site/checks/generator-ownership` via dynamic import mock
- `packages/werkstatt/src/kernel/cli/cli-pipeline-hint.test.ts`:
  - Test: "Unknown command" includes hint when name is a pipeline
  - Test: "Unknown command" does not include hint when name is not a pipeline
  - Test: "No target site" error includes hint when name is a pipeline

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test`

**Completion criterion:** All new tests pass.

**Human review:** no

---

### Step 6. Update AGENTS.md with pipeline-vs-command note

**Goal:** Add a note to the root `AGENTS.md` about the pipeline vs command distinction.

**Agent actions:**

- Add a note in the root `AGENTS.md` under the kernel/CLI section: "Pipeline names (e.g. `build.prepare`, `build.check`, `build.post`) are not commands. Run `werkstatt pipeline <name>` to execute a pipeline, or `werkstatt run <command>` for individual commands. The CLI includes a hint when a pipeline name is used as a command."

**Validation:**

- Visual review of `AGENTS.md` change

**Completion criterion:** `AGENTS.md` includes the pipeline-vs-command note.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `AGENTS.md` update is committed
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands added, but verify)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations
- Check off acceptance criteria: verify each criterion against implemented code. Mark `[x]` with inline `(evidence: <file:line>, <test-or-command>)`
- Stamp the RFC: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0870 --dry-run` first, then without `--dry-run`
- Commit the stamped RFC separately from the implementation commit

**Validation:**

- `git status` — no uncommitted changes from current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0870`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All documentation artifacts updated; code review passed; all acceptance criteria checked off with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0870`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0870` in the subject line (RFC-0265 commit hygiene)
- No acceptance probes declared (commented out) — `rfc.verification.emit` will produce no evidence file (expected behavior per RFC-0268)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| False positive on new Sternsystemen | Step 2: `checkManifestPresence` uses `git ls-tree HEAD` — only checks files already tracked in git |
| `git checkout` conflicts with uncommitted changes | Step 3: materialize creates fresh workpiece from staging — no uncommitted changes exist |
| Pipeline hint becomes stale | Step 4: hint checks against a hardcoded list of known pipeline names — update when pipelines change |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-64 (engine importing from site plugin), use dynamic `import()` — the sanctioned escape hatch per `packages/werkstatt/AGENTS.md`. If dynamic import is insufficient, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0870 --reason "..." --invariant "DNA-64"` instead of working around it.
