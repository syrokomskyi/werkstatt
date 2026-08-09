---
rfcId: RFC-0635
planId: PLAN-RFC-0635-01
status: draft
owner: architecture
createdAt: 2026-08-01
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - packages/os/site-kernel/AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0635

## 1. Objectives

- [ ] Objective 1 — Deliver `--force` flag from CLI to command handlers via `input.flags.force` — maps to acceptance criterion "mission.validate accepts --force flag"
- [ ] Objective 2 — Add distribution reuse check to `runMissionValidate` using `computeBuildInputHash` — maps to acceptance criterion "runMissionValidate checks distribution/build-input-hash.json before running the build cycle"
- [ ] Objective 3 — Copy `distribution/dist/` to `workpiece/dist/` when hash matches and workpiece dist is missing — maps to acceptance criterion "runMissionValidate copies distribution/dist/ to workpiece/dist/"
- [ ] Objective 4 — Add `build.check` pipeline phase to `runMissionBuild` between `build.prepare` and `astro build` — maps to acceptance criterion "runMissionBuild runs build.check pipeline"
- [ ] Objective 5 — Update `MissionValidateData` interface with `distributionReused`, `buildInputHash`, `fullBuildRan` fields — maps to acceptance criterion "mission.validate --json output includes distributionReused and buildInputHash"
- [ ] Objective 6 — Set `cacheable: false` on `mission.validate` command registration — maps to acceptance criterion "mission.validate declares cacheable: false"
- [ ] Objective 7 — Update existing tests and add new unit tests for all distribution reuse paths — maps to acceptance criteria for unit tests

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel/src/cli/index.ts` — destructure `force` from `consumeCommonFlags` in the command path, pass to `executeKernelCommand`
- `packages/os/site-kernel/src/types.ts` — add `force?: boolean` to `ExecuteKernelCommandOptions`
- `packages/os/site-kernel/src/runtime/execute-command.ts` — add `force` to `EXECUTE_KERNEL_COMMAND_OPTION_KEYS`, inject `options.force ?? false` into `input.flags.force` after argv parsing in `executeRegisteredCommand`
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — modify `MissionValidateData` interface, add distribution reuse logic to `runMissionValidate`, add `build.check` phase to `runMissionBuild`
- `packages/os/site-kernel-handoff/src/mission/mission.module.ts` — add `cacheable: false` to `mission.validate` command registration

### 2.2 Configuration and data

- No configuration files changed. `distribution/build-input-hash.json` and `distribution/build-manifest.json` are read-only artifacts produced by `mission.build`.

### 2.3 Documentation and specs

- `packages/os/site-kernel/AGENTS.md` — document `--force` flag delivery from CLI to command handlers via `input.flags.force`
- `packages/os/site-kernel-handoff/AGENTS.md` — document distribution reuse in `mission.validate` and `build.check` addition to `mission.build`

### 2.4 Validation and pipelines

- No pipeline topology changes. `build.check` is already a registered pipeline; `mission.build` simply invokes it.
- `ecosystem.manifest.generate` not needed — no new commands or pipeline wiring changes.

## 3. Step sequence

### Step 1. Add `force` to `ExecuteKernelCommandOptions` and type definitions

**Goal:** Extend the kernel command execution type contract to accept a `force` flag.

**Agent actions:**

- In `packages/os/site-kernel/src/types.ts`, add `force?: boolean` to `ExecuteKernelCommandOptions` interface with JSDoc: "RFC-0635: when true, bypasses distribution reuse check in mission.validate. Injected into input.flags.force by the executor."
- In `packages/os/site-kernel/src/types.ts`, add `force?: boolean` to `KernelRuntimeContext` interface (alongside `dryRun`) with JSDoc: "RFC-0635: when true, injected into input.flags.force by executeRegisteredCommand."
- In `packages/os/site-kernel/src/runtime/execute-command.ts`, add `"force"` to `EXECUTE_KERNEL_COMMAND_OPTION_KEYS` array.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` — type-check passes.

**Completion criterion:** `ExecuteKernelCommandOptions` includes `force?: boolean` and `EXECUTE_KERNEL_COMMAND_OPTION_KEYS` includes `"force"`.

**Human review:** no

---

### Step 2. Wire `--force` from CLI to `executeKernelCommand`

**Goal:** Make the `--force` flag available to individual command invocations, not just pipeline invocations.

**Agent actions:**

- In `packages/os/site-kernel/src/cli/index.ts`, in the command execution path (around line 195), destructure `force` from the `consumeCommonFlags` result and pass it to `executeKernelCommand` as `force`.
- In `packages/os/site-kernel/src/runtime/execute-command.ts`, in `executeKernelCommand`, set `force: options.force ?? false` on each `KernelRuntimeContext` constructed for workspace-scoped and app-scoped commands (alongside `dryRun: options.dryRun ?? false`).
- In `executeRegisteredCommand`, after `input` is constructed (both schema-carrying and schema-less paths), inject force: `if (context.force) input.flags.force = true;`. This makes `--force` available to all command handlers via `input.flags.force`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` — type-check passes.
- Manual: `pnpm exec werkstatt run mission.status --mission <id> --force` should not error (force is silently accepted and injected into flags).

**Completion criterion:** `consumeCommonFlags` destructures `force`, `executeKernelCommand` receives it, and `executeRegisteredCommand` injects it into `input.flags.force`.

**Human review:** no

---

### Step 3. Update `MissionValidateData` interface

**Goal:** Extend the validation result type with distribution reuse metadata.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts`, update the `MissionValidateData` interface:
  ```ts
  export interface MissionValidateData {
    missionId: string;
    contractFull: { passed: boolean; validators: Array<Record<string, unknown>> };
    build: { succeeded: boolean; routeCount: number; sitemapHash: string; error?: string };
    diagnostics?: Diagnostic[];
    distributionReused: boolean;
    buildInputHash: string | null;
    fullBuildRan: boolean;
    validatedAt: string;
  }
  ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — type-check passes (may have errors in step 4/5 when logic is added; fix incrementally).

**Completion criterion:** `MissionValidateData` includes `distributionReused`, `buildInputHash`, and `fullBuildRan` fields.

**Human review:** no

---

### Step 4. Add distribution reuse logic to `runMissionValidate`

**Goal:** Skip the full build cycle when `distribution/build-input-hash.json` matches the current workpiece hash.

**Agent actions:**

- In `runMissionValidate`, after reading the mission manifest and resolving `missionDir`/`workpieceDir`, and before running `build.prepare`:
  1. Read `force` from `input.flags.force` (boolean, default `false`).
  2. If `!force`, compute `buildInputHash` via `computeBuildInputHash(workspaceRoot, workpieceDir)`.
  3. Read `distribution/build-input-hash.json` (wrap `JSON.parse` in try/catch per AGENTS.md rule). Compare `meta.buildInputHash === buildInputHash`.
  4. If hash matches AND `distribution/dist/` exists:
     - If `workpiece/dist/` does not exist, copy `distribution/dist/` to `workpiece/dist/`.
     - Read `distribution/build-manifest.json` (try/catch) for `routeCount` and `sitemapHash` if available.
     - Construct a success report with `distributionReused: true`, `buildInputHash`, `fullBuildRan: false`, `contractFull.passed: true`, `build.succeeded: true`.
     - Write `evidence/validation-report.json`.
     - Return success with summary: `[mission.validate] ${missionId} validation passed (distribution reused, build-input-hash matched)`.
  5. If hash does not match or `--force` is set, proceed with the existing full build cycle. Set `distributionReused: false`, `buildInputHash: null`, `fullBuildRan: true` in the final report.
- Update all existing report construction sites (prepare-fail, static-fail, build-fail, success) to include the three new fields with appropriate values.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — type-check passes.
- Unit test: hash match → build cycle skipped (step 7).

**Completion criterion:** `runMissionValidate` checks `distribution/build-input-hash.json` before the build cycle and skips it when the hash matches.

**Human review:** no

---

### Step 5. Add `build.check` phase to `runMissionBuild`

**Goal:** Ensure distributions produced by `mission.build` have passed all content validators.

**Agent actions:**

- In `runMissionBuild`, between the `build.prepare` phase and the `astro build` phase:
  1. Add a `build.check` phase using `runPipelinePhase` (same as `build.prepare` and `build.post` for consistency).
  2. If `build.check` fails, `runPipelinePhase` throws — catch the error and set `buildError` with the failed step names, then skip subsequent phases.
  3. The `build-input-hash.json` is only written when `buildSucceeded` is `true` (which now includes `build.check` passing).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — type-check passes.
- Unit test: `mission.build` includes `build.check` pipeline step (step 7).

**Completion criterion:** `runMissionBuild` runs `build.check` between `build.prepare` and `astro build`, and `build-input-hash.json` is only written when all three phases (including `build.check`) succeed.

**Human review:** no

---

### Step 6. Set `cacheable: false` on `mission.validate` command registration

**Goal:** Ensure `mission.validate` is never cached by the command-result cache.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission.module.ts`, add `cacheable: false` to the `mission.validate` command registration (around line 194-208), matching `mission.build` which already has `cacheable: false`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — type-check passes.
- `pnpm exec werkstatt run command.reads.validate` — no CRC-01 violation for `mission.validate`.

**Completion criterion:** `mission.validate` registration includes `cacheable: false`.

**Human review:** no

---

### Step 7. Write and update unit tests

**Goal:** Verify all distribution reuse paths and `build.check` addition.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/mission-validate-distribution-reuse.test.ts`:
  - Test 1: hash match → build cycle skipped, `distributionReused: true`, `fullBuildRan: false`.
  - Test 2: hash mismatch → full build cycle runs, `distributionReused: false`, `fullBuildRan: true`.
  - Test 3: `--force` → full build cycle runs regardless of hash match, `distributionReused: false`.
  - Test 4: `distribution/` missing → full build runs, `distributionReused: false`.
  - Test 5: `build-input-hash.json` corrupt → full build runs, `distributionReused: false`.
  - Test 6: hash matches but `distribution/dist/` missing → full build runs with warning.
  - Mock `executeKernelPipeline`, `executeKernelCommand`, `execSync`, `computeBuildInputHash`, `existsSync`, `fs.readFile` per existing test patterns.
  - Use `logger: { info: () => {} }` in test context per existing pattern.
  - Check `result.summary` for pass/fail (not `result.exitCode === 0`) per existing pattern.
- Create `packages/os/site-kernel-handoff/src/tests/mission-build-check-phase.test.ts`:
  - Test 7: `mission.build` calls `runPipelinePhase` with `pipelineName: "build.check"` between `build.prepare` and `astro build`.
  - Test 8: `build.check` failure → `mission.build` fails, `build-input-hash.json` not written.
- Update existing tests (`mission-validate-dist-cleanup.test.ts`, `mission-validate-snapshot-auto-regen.test.ts`, `mission-validate-cache-clone-warning.test.ts`):
  - Add `distributionReused: false`, `buildInputHash: null`, `fullBuildRan: true` to expected data shapes.
  - Ensure existing tests still pass with the new fields in the report.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` — all tests pass.

**Completion criterion:** All 8 new tests pass; all 3 existing tests pass with updated assertions.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Update AGENTS.md files with new behavior.

**Agent actions:**

- In `packages/os/site-kernel/AGENTS.md`, add to the "Command-result cache (RFC-0390)" section: "RFC-0635: the `--force` flag is now passed through to `executeKernelCommand` for individual command invocations (previously only pipeline execution). Command handlers read it from `input.flags.force`."
- In `packages/os/site-kernel-handoff/AGENTS.md`, add to the mission lifecycle section: "RFC-0635: `mission.validate` checks `distribution/build-input-hash.json` before running the build cycle. If the hash matches, the entire build cycle is skipped and `distribution/dist/` is copied to `workpiece/dist/` if missing. `--force` bypasses this check. `mission.build` now includes `build.check` between `build.prepare` and `astro build` so that reused distributions have passed all content validators."

**Validation:**

- `git diff` shows only the intended AGENTS.md changes.

**Completion criterion:** Both AGENTS.md files updated with RFC-0635 behavior documentation.

**Human review:** no

---

### Final Step. Review, fix, and acceptance criteria verification

**Goal:** Run code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel run build:check` and `pnpm --filter @warpgogol/site-kernel-handoff run build:check`.
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test`.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0635`.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` (no command surface changes, but verify manifest is still valid).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0635 --implementation-commit <sha>`.
- Commit the stamp transition separately.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0635` — passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0635`
- `pnpm --filter @warpgogol/site-kernel run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0635.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0635` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Stale distribution risk (platform change not in hash) | Step 4: `computeBuildInputHash` includes `platformVersion` and `platformSemanticHash` — no mitigation needed beyond existing hash computation |
| Non-content file changes not captured | Step 4: hash only covers `src/content/` but `platformSemanticHash` covers generated files; manual non-content edits are discouraged by DNA-47 |
| `mission.build` now fails on content errors | Step 5: `build.check` failure prevents `build-input-hash.json` from being written, so `mission.validate` falls back to full cycle |
| Agent confusion about skipped build | Step 4: `distributionReused` field and summary line make the skip visible; Step 8: AGENTS.md documents the behavior |
| `workpiece/dist/` divergence | Step 4: dist is copied from `distribution/dist/` when missing; manual edits to generated files are discouraged by RFC-0601 |
| `--force` flag not reaching handler | Step 1-2: CLI wiring changes deliver `force` to `input.flags.force`; Step 7: test 3 verifies `--force` behavior |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-47, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0635 --reason "..." --invariant "DNA-47"` instead of working around it.
- If the `--force` CLI wiring change breaks existing command invocations, revert step 2 and use a command-level flag schema in `mission.module.ts` instead (add `force` to the `mission.validate` flags object so it's parsed by the command's own flag resolver).
