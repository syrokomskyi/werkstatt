---
rfcId: RFC-0580
planId: PLAN-RFC-0580-01
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
    - "packages/os/site-kernel-handoff/AGENTS.md"
---

# Implementation Plan: RFC-0580

## 1. Objectives

- [ ] Objective 1 — Create `commitWerkstattSideEffects` helper with idempotent skip, specific-file staging, and throw-on-failure behavior (maps to acceptance criterion: "Unit tests for `commitWerkstattSideEffects`")
- [ ] Objective 2 — Create shared `git-exec.ts` with `allowNonZero` support and refactor `bordbuch-io.ts` to import from it (maps to acceptance criterion: "Helper uses `gitExec` for git operations")
- [ ] Objective 3 — Wire `commitWerkstattSideEffects` into all 6 mission lifecycle handlers (maps to acceptance criteria: each handler "calls helper with ...")
- [ ] Objective 4 — Ensure commit message format `werkstatt: <command> <missionId>` (maps to acceptance criterion: "Commit message format")
- [ ] Objective 5 — Integration test: clean working tree after `mission.open` (maps to acceptance criterion: "after `mission.open`, `git status` in monorepo is clean")
- [ ] Objective 6 — `rfc.validate` passes (maps to acceptance criterion: "`rfc.validate` passes on this file before merging")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts` — **new file**: shared `gitExec` utility with `allowNonZero` option (moved from `bordbuch-io.ts`)
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` — replace private `gitExec` with import from `../werkstatt/git-exec.ts`
- `packages/os/site-kernel-handoff/src/werkstatt/werkstatt-commit.ts` — **new file**: `commitWerkstattSideEffects` helper
- `packages/os/site-kernel-handoff/src/werkstatt/index.ts` — add exports for `commitWerkstattSideEffects` and `gitExec`
- `packages/os/site-kernel-handoff/src/mission/mission-open.ts` — add `commitWerkstattSideEffects` call after `writeRegistry` (line ~155)
- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — add `commitWerkstattSideEffects` call after `writeRegistry` + `writeMissionManifest`
- `packages/os/site-kernel-handoff/src/mission/mission-abort.ts` — add `commitWerkstattSideEffects` call after `writeRegistry` + `writeMissionManifest`
- `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` — add `commitWerkstattSideEffects` call after `writeMissionManifest` (line ~908)
- `packages/os/site-kernel-handoff/src/mission/mission-migrate.ts` — add `commitWerkstattSideEffects` call after `writeMissionManifest` (line ~217)
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — add `commitWerkstattSideEffects` call in `runMissionReconcile` after `writeMissionManifest` (line ~807)

### 2.2 Configuration and data

- No YAML/JSON/NDJSON changes. The helper operates on existing files: `systems/registry.yaml`, `missions/<id>/mission.yaml`, `pnpm-lock.yaml`.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update "Bordbuch git synchronization (RFC-0477)" section to document the parallel werkstatt auto-commit pattern (RFC-0580).
- No `docs/*.xml` Compass files need updates — this is an internal package change, not a repository-wide semantic change.
- No `docs/architecture-dna.md` changes — DNA-45, DNA-46, DNA-51 are existing invariants; this RFC extends their enforcement, not their definition.

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/site-kernel-handoff test` — unit + integration tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0580` — RFC mechanical validation

## 3. Step sequence

### Step 1. Create shared `git-exec.ts` and refactor `bordbuch-io.ts`

**Goal:** Move `gitExec` to a shared location and extend it with `allowNonZero` support.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts`:
  ```ts
  import { execSync } from "node:child_process";

  export function gitExec(
    cwd: string,
    args: string,
    options?: { allowNonZero?: boolean },
  ): string {
    try {
      return execSync(`git ${args}`, {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30_000,
      }).trim();
    } catch (err) {
      if (options?.allowNonZero) {
        // Return exit code indicator — for `git diff --cached --quiet`, exit 1 means "has changes"
        return "";
      }
      throw err;
    }
  }
  ```
  - Note: when `allowNonZero` is true, the function returns an empty string on failure. Callers check the return value or use the exit code semantics of the specific git command.
- In `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts`:
  - Remove the private `gitExec` function (line 319–326).
  - Add `import { gitExec } from "../werkstatt/git-exec.ts";` at the top.
- Update `packages/os/site-kernel-handoff/src/werkstatt/index.ts` to export `gitExec` from `./git-exec.ts`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes.

**Completion criterion:** `gitExec` is exported from `werkstatt/git-exec.ts`; `bordbuch-io.ts` imports from it; `build:check` passes.

**Human review:** no

---

### Step 2. Create `commitWerkstattSideEffects` helper

**Goal:** Implement the new helper in `packages/os/site-kernel-handoff/src/werkstatt/werkstatt-commit.ts`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/werkstatt/werkstatt-commit.ts`.
- Import `gitExec` from `./git-exec.ts`.
- Implement `commitWerkstattSideEffects(workspaceRoot: string, files: string[], message: string): Promise<{ committed: boolean; commitSha: string | null }>`.
- Logic:
  1. For each file in `files`, run `gitExec(workspaceRoot, \`add -- \${JSON.stringify(file)}\`, { allowNonZero: true })`. If git add fails (non-existent path), it's silently skipped.
  2. Check if there are staged changes using `execSync` directly (not `gitExec`) to access the exit code: `execSync("git diff --cached --quiet", { cwd: workspaceRoot, stdio: "pipe" })` — if it throws (exit 1), there ARE staged changes; if it doesn't throw (exit 0), there are no changes → return `{ committed: false, commitSha: null }`.
  3. Run `gitExec(workspaceRoot, \`commit -m \${JSON.stringify(message)}\`)` — throw on failure.
  4. Get commit SHA: `gitExec(workspaceRoot, "rev-parse HEAD")`.
  5. Return `{ committed: true, commitSha }`.
- Add `MODULE_CONTRACT` header with purpose and change summary referencing RFC-0580.
- Update `packages/os/site-kernel-handoff/src/werkstatt/index.ts` to export `commitWerkstattSideEffects` from `./werkstatt-commit.ts`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes.

**Completion criterion:** `commitWerkstattSideEffects` is exported from `werkstatt/index.ts`; `build:check` passes.

**Human review:** no

---

### Step 3. Wire helper into `mission.open`

**Goal:** Add `commitWerkstattSideEffects` call to `runMissionOpen` after `writeRegistry`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-open.ts`:
  - Import `commitWerkstattSideEffects` from `../werkstatt/index.ts` (add to existing import on line 36).
  - After `await writeRegistry(workspaceRoot, registry)` (line 155), add:
    ```ts
    // RFC-0580: auto-commit werkstatt side-effects
    await commitWerkstattSideEffects(
      workspaceRoot,
      [
        path.join("systems", "registry.yaml"),
        path.join("missions", missionId, "mission.yaml"),
      ],
      `werkstatt: mission.open ${missionId}`,
    );
    ```
  - Update `CHANGE_SUMMARY` with RFC-0580 entry.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes.

**Completion criterion:** `mission.open` calls `commitWerkstattSideEffects` with `registry.yaml` + `mission.yaml`; `build:check` passes.

**Human review:** no

---

### Step 4. Wire helper into `mission.close`

**Goal:** Add `commitWerkstattSideEffects` call to `runMissionClose` after `writeRegistry` + `writeMissionManifest`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-close.ts`:
  - Import `commitWerkstattSideEffects` from `../werkstatt/index.ts`.
  - After the registry write block (conditional `writeRegistry` when `entry.currentMission === missionId`), add:
    ```ts
    // RFC-0580: auto-commit werkstatt side-effects
    await commitWerkstattSideEffects(
      workspaceRoot,
      [
        path.join("systems", "registry.yaml"),
        path.join("missions", missionId, "mission.yaml"),
      ],
      `werkstatt: mission.close ${missionId}`,
    );
    ```
  - Note: the helper's idempotent skip handles the case where `registry.yaml` was not modified (conditional write).
  - Update `CHANGE_SUMMARY` with RFC-0580 entry.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes.

**Completion criterion:** `mission.close` calls `commitWerkstattSideEffects` with `registry.yaml` + `mission.yaml`; `build:check` passes.

**Human review:** no

---

### Step 5. Wire helper into `mission.abort`

**Goal:** Add `commitWerkstattSideEffects` call to `runMissionAbort` after `writeRegistry` + `writeMissionManifest`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-abort.ts`:
  - Import `commitWerkstattSideEffects` from `../werkstatt/index.ts`.
  - After the registry write block (conditional `writeRegistry` when `entry.currentMission === missionId`), add:
    ```ts
    // RFC-0580: auto-commit werkstatt side-effects
    await commitWerkstattSideEffects(
      workspaceRoot,
      [
        path.join("systems", "registry.yaml"),
        path.join("missions", missionId, "mission.yaml"),
      ],
      `werkstatt: mission.abort ${missionId}`,
    );
    ```
  - Update `CHANGE_SUMMARY` with RFC-0580 entry.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes.

**Completion criterion:** `mission.abort` calls `commitWerkstattSideEffects` with `registry.yaml` + `mission.yaml`; `build:check` passes.

**Human review:** no

---

### Step 6. Wire helper into `mission.materialize`

**Goal:** Add `commitWerkstattSideEffects` call to `runMissionMaterialize` after `writeMissionManifest`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts`:
  - Import `commitWerkstattSideEffects` from `../werkstatt/index.ts` (add to existing import on line 59).
  - After `await writeMissionManifest(workspaceRoot, manifest)` (line ~908), add:
    ```ts
    // RFC-0580: auto-commit werkstatt side-effects
    await commitWerkstattSideEffects(
      workspaceRoot,
      [
        path.join("missions", missionId, "mission.yaml"),
        "pnpm-lock.yaml",
      ],
      `werkstatt: mission.materialize ${missionId}`,
    );
    ```
  - Update `CHANGE_SUMMARY` with RFC-0580 entry.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes.

**Completion criterion:** `mission.materialize` calls `commitWerkstattSideEffects` with `mission.yaml` + `pnpm-lock.yaml`; `build:check` passes.

**Human review:** no

---

### Step 7. Wire helper into `mission.migrate`

**Goal:** Add `commitWerkstattSideEffects` call to `runMissionMigrate` after `writeMissionManifest`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-migrate.ts`:
  - Import `commitWerkstattSideEffects` from `../werkstatt/index.ts` (add to existing import on line 26).
  - After `await writeMissionManifest(workspaceRoot, manifest)` (line ~217), add:
    ```ts
    // RFC-0580: auto-commit werkstatt side-effects
    await commitWerkstattSideEffects(
      workspaceRoot,
      [path.join("missions", missionId, "mission.yaml")],
      `werkstatt: mission.migrate ${missionId}`,
    );
    ```
  - Update `CHANGE_SUMMARY` with RFC-0580 entry.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes.

**Completion criterion:** `mission.migrate` calls `commitWerkstattSideEffects` with `mission.yaml`; `build:check` passes.

**Human review:** no

---

### Step 8. Wire helper into `mission.reconcile`

**Goal:** Add `commitWerkstattSideEffects` call to `runMissionReconcile` after `writeMissionManifest`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts`:
  - Import `commitWerkstattSideEffects` from `../werkstatt/index.ts` (add to existing imports).
  - After `await writeMissionManifest(workspaceRoot, manifest)` (line ~807), add:
    ```ts
    // RFC-0580: auto-commit werkstatt side-effects
    await commitWerkstattSideEffects(
      workspaceRoot,
      [path.join("missions", missionId, "mission.yaml")],
      `werkstatt: mission.reconcile ${missionId}`,
    );
    ```
  - Update `CHANGE_SUMMARY` with RFC-0580 entry.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes.

**Completion criterion:** `mission.reconcile` calls `commitWerkstattSideEffects` with `mission.yaml`; `build:check` passes.

**Human review:** no

---

### Step 9. Write unit tests for `commitWerkstattSideEffects`

**Goal:** Test the helper's idempotent skip, specific-file staging, and throw-on-failure behavior.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/werkstatt-commit.test.ts`.
- Test cases:
  1. **Idempotent skip** — no changes to staged files → returns `{ committed: false, commitSha: null }`.
  2. **Specific-file staging** — only named files are staged, other dirty files are not touched.
  3. **Throw on commit failure** — simulate a pre-commit hook that fails → helper throws.
  4. **Non-existent file** — file path in `files` array that doesn't exist → skipped silently.
  5. **Commit message format** — verify the commit message is passed correctly.
- Use `mkdtempSync` + `gitInit` + `gitCommit` pattern from `mission-dirty-guard.test.ts`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test -- --run src/tests/werkstatt-commit.test.ts` passes.

**Completion criterion:** All 5 test cases pass.

**Human review:** no

---

### Step 10. Update `AGENTS.md`

**Goal:** Document the werkstatt auto-commit pattern in the handoff package's AGENTS.md.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`, under the "Bordbuch git synchronization (RFC-0477)" section, add a new subsection or paragraph documenting:
  - RFC-0580: all 6 mission lifecycle commands auto-commit werkstatt-level side-effect files (`registry.yaml`, `mission.yaml`, `pnpm-lock.yaml`) to the monorepo working tree via `commitWerkstattSideEffects`.
  - The helper stages only specific file paths (never `git add -A`), is idempotent (skips when no changes), and throws on commit failure.
  - The helper does NOT push — werkstatt monorepo push is a separate operator-controlled operation.

**Validation:**

- Visual inspection of the AGENTS.md section.

**Completion criterion:** AGENTS.md documents the RFC-0580 werkstatt auto-commit pattern.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated with RFC-0580 pattern documentation.
- Run `pnpm --filter @warpgogol/site-kernel-handoff build:check`.
- Run `pnpm --filter @warpgogol/site-kernel-handoff test`.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0580`.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0580 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0580`.
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes.
- `pnpm --filter @warpgogol/site-kernel-handoff test` passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0580`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0580` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Pre-commit hook blocks commit | Step 9 test case 3 verifies the helper throws on commit failure, surfacing the error to the agent |
| Foreign changes in same files | Step 2 helper stages only specific file paths; locks serialize access (DNA-51); documented in RFC failure modes table |
| `pnpm-lock.yaml` not modified by `pnpm install` | Step 2 helper's idempotent skip handles the case where `pnpm-lock.yaml` has no changes |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-45, DNA-46, or DNA-51, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0580 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the shared `git-exec.ts` approach causes issues, fall back to duplicating the 5-line utility in `werkstatt-commit.ts`.
