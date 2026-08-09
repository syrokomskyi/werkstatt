---
rfcId: RFC-0703
planId: PLAN-RFC-0703-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - AGENTS.md
    - .github/workflows/ci.yml
    - tools/kernel.config.ts
---

# Implementation Plan: RFC-0703

## 1. Objectives

- [ ] O1 — Implement `platform.commit.discipline.validate` command (maps to AC: command implemented, `--base` flag, fail-hard, trailer presence check)
- [ ] O2 — Register command in `tools/kernel.config.ts` and command table (maps to AC: command registered)
- [ ] O3 — Add CI step to `ci.yml` and `CI_LOCAL_CHECKED_COMMANDS` (maps to AC: CI step + ci.local.validate)
- [ ] O4 — Integrate `sternsystem.pin` call into `mission.close` (maps to AC: auto-pin on close)
- [ ] O5 — Activate pre-commit hook via `git config core.hooksPath hooks` (maps to AC: hook activated)
- [ ] O6 — Write unit tests for new command and auto-pin behavior (maps to AC: unit tests)
- [ ] O7 — Update root `AGENTS.md` with platform-scope commit discipline rule (maps to AC: AGENTS.md updated)
- [ ] O8 — Fix V-25 (empty reviewers) and pass `rfc.validate` (maps to AC: rfc.validate passes)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/platform-commit-discipline.ts` — **NEW** command handler for `platform.commit.discipline.validate`
- `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts` — register new command entry
- `packages/os/site-kernel-checks/src/ci-local.ts` — add `platform.commit.discipline.validate --check --json` to `CI_LOCAL_CHECKED_COMMANDS`; also add missing `platform.consistency.validate --check --json` to `ci.yml` (audit finding C-2)
- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — insert `sternsystem.pin` call after `writeRegistry`, before `commitWerkstattSideEffects`
- `tools/kernel.config.ts` — no change needed (command registered via `createStandardCheckModule` → `ALL_COMMANDS`)

### 2.2 Configuration and data

- `.github/workflows/ci.yml` — add `platform.commit.discipline.validate --base origin/introduce-axiom-system --json` step to `autonomous-quality` job; also add missing `platform.consistency.validate --check --json` step
- `hooks/pre-commit` — already exists, no code changes needed; activation via `git config core.hooksPath hooks`

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add platform-scope commit discipline rule
- `docs/rfcs/rfc-0703-*.md` — fix V-25 (add reviewer), mark acceptance criteria `[x]` with evidence

### 2.4 Validation and pipelines

- `pnpm exec werkstatt run rfc.validate --id RFC-0703`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks test`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

## 3. Step sequence

### Step 1. Implement `platform.commit.discipline.validate` command handler

**Goal:** Create the new command handler that checks platform-scope commits in a `--base..HEAD` range for `X-Platform-Bump` trailer presence.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/platform-commit-discipline.ts`
- Implement `runPlatformCommitDisciplineValidate(input, context)`:
  - Read `--base` flag (required, no default)
  - Resolve base ref via `git rev-parse --verify <base>` — fail hard if not found (exitCode 1)
  - Get commit list via `git log --format=%H %s <base>..HEAD`
  - For each commit, get changed files via `git diff-tree --no-commit-id --name-only -r <sha>`
  - Classify platform scope: files matching `packages/**`, `integrations/**`, `services/**`
  - For platform-scope commits, check `git log --format=%B -n 1 <sha>` for `X-Platform-Bump:` trailer
  - Collect violations (sha, subject, files, message)
  - Return `{ status, platformScopeCommits, violations }` with exitCode 0 (pass) or 1 (fail)
- Define `PlatformCommitDisciplineResult` interface matching RFC output format
- Export `runPlatformCommitDisciplineValidate` from package barrel

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** File exists, typechecks, exports `runPlatformCommitDisciplineValidate` with correct signature.

**Human review:** no

---

### Step 2. Register command in ecosystem command table

**Goal:** Wire the new command into the data-driven `ECOSYSTEM_COMMANDS` array so `createStandardCheckModule` picks it up automatically.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts`:
  - Import `runPlatformCommitDisciplineValidate` from `../platform-commit-discipline.ts`
  - Add `CHANGE_SUMMARY` entry: `RFC-0703: register platform.commit.discipline.validate.`
  - Add command entry to `ECOSYSTEM_COMMANDS` array with:
    - `name: "platform.commit.discipline.validate"`
    - `scope: "workspace"`
    - `flags: { base: { kind: "string", required: true, description: "..." } }`
    - `reads: [".git", "packages/**", "integrations/**", "services/**"]`
    - `execute: runPlatformCommitDisciplineValidate`
    - `gate: { severity: "error", phase: "workspace", blocks: ["release.prepare"] }`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`

**Completion criterion:** Command appears in `ALL_COMMANDS` via `ECOSYSTEM_COMMANDS` spread.

**Human review:** no

---

### Step 3. Add CI steps to `ci.yml` and `CI_LOCAL_CHECKED_COMMANDS`

**Goal:** Wire the new command into the CI workflow and local validation pipeline. Also fix pre-existing gap (audit C-2: `platform.consistency.validate --check --json` missing from `ci.yml`).

**Agent actions:**

- Edit `.github/workflows/ci.yml`:
  - Add step `Platform commit discipline validate` in `autonomous-quality` job: `pnpm exec werkstatt run platform.commit.discipline.validate --base origin/introduce-axiom-system --json`
  - Add step `Platform consistency validate` (fixing audit C-2): `pnpm exec werkstatt run platform.consistency.validate --check --json`
- Edit `packages/os/site-kernel-checks/src/ci-local.ts`:
  - Add `"pnpm exec werkstatt run platform.commit.discipline.validate --base origin/introduce-axiom-system --json"` to `CI_LOCAL_CHECKED_COMMANDS`
  - Add `CHANGE_SUMMARY` entry for RFC-0703

**Validation:**

- `pnpm exec werkstatt run ci.local.validate --json` — passes with both new commands present in `ci.yml`

**Completion criterion:** `ci.local.validate` passes; both commands present in `ci.yml`.

**Human review:** no

---

### Step 4. Integrate `sternsystem.pin` into `mission.close`

**Goal:** Call `sternsystem.pin` during `mission.close` after registry update and before `commitWerkstattSideEffects`, so both registry changes (currentMission=null + pinnedPlatform) are committed in one commit.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/mission/mission-close.ts`:
  - After `entry.currentMission = null; await writeRegistry(workspaceRoot, registry);` (line ~469)
  - Before `commitWerkstattSideEffects(...)` (line ~473)
  - Insert:
    ```ts
    // RFC-0703: Auto-pin platform version on mission close
    try {
      const { executeKernelCommand } = await import("@warpgogol/site-kernel");
      const pinResult = await executeKernelCommand({
        workspaceRoot,
        commandName: "sternsystem.pin",
        argv: [`--id=${manifest.systemId}`],
      });
      if (pinResult.exitCode && pinResult.exitCode !== 0) {
        throw new Error(
          `sternsystem.pin failed with exitCode ${pinResult.exitCode}: ${pinResult.summary ?? "no summary"}`,
        );
      }
      logger.info(`  Auto-pinned platform version for ${manifest.systemId}`);
    } catch (pinError) {
      throw new Error(
        `[mission.close] sternsystem.pin failed for '${manifest.systemId}': ${pinError instanceof Error ? pinError.message : String(pinError)}`,
      );
    }
    ```
  - This calls pin within the existing lock scope (registry, system, mission locks held). Pin reads/writes registry without acquiring locks — safe inside close's lock scope.
  - Pin's `writeRegistry` overwrites the registry with both `currentMission: null` AND `pinnedPlatform` updated.
  - `commitWerkstattSideEffects` then commits the combined registry change.
  - Also commit `system.pin.json` to the cache clone (similar to `.materialization-state.json` commit pattern):
    ```ts
    // RFC-0703: Commit system.pin.json to cache clone after pin
    try {
      const systemDir = await resolveCachePath(workspaceRoot, manifest.systemId);
      gitExec(systemDir, "add system.pin.json");
      gitExec(systemDir, `commit -m ${JSON.stringify(`chore: auto-pin platform version for ${missionId}`)}`);
      logger.info(`  Committed system.pin.json to cache clone`);
    } catch {
      // Nothing to commit or git not available — non-fatal
    }
    ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `mission.close` calls `sternsystem.pin` between registry write and werkstatt commit; typechecks.

**Human review:** no

---

### Step 5. Activate pre-commit hook

**Goal:** Activate the existing pre-commit hook via `git config core.hooksPath hooks`.

**Agent actions:**

- Run `git config core.hooksPath hooks` in the werkstatt root
- Verify: `git config core.hooksPath` returns `hooks`

**Validation:**

- `git config core.hooksPath` returns `hooks`

**Completion criterion:** `core.hooksPath` is set to `hooks`.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Unit tests for `platform.commit.discipline.validate` (pass, fail, base-not-found, no-platform-commits) and `mission.close` auto-pin behavior.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/platform-commit-discipline.test.ts`:
  - Test: pass — all platform-scope commits have `X-Platform-Bump` trailer
  - Test: fail — platform-scope commit missing trailer
  - Test: base-not-found — invalid base ref returns exitCode 1
  - Test: no-platform-commits — commits touching only `docs/` return pass with `platformScopeCommits: 0`
  - Use temp git repo fixtures (init, commit, set up base..HEAD range)
- Add test for `mission.close` auto-pin in existing mission-close test suite:
  - Test: `mission.close` calls `sternsystem.pin` and registry has `pinnedPlatform` updated
  - Mock `executeKernelCommand` for `sternsystem.pin` to avoid needing a real cache clone

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks test`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

**Completion criterion:** All new tests pass.

**Human review:** no

---

### Step 7. Update root AGENTS.md

**Goal:** Add platform-scope commit discipline rule to root `AGENTS.md`.

**Agent actions:**

- Edit `AGENTS.md` (root):
  - Add a new subsection under "Active instruction model" or similar section:
    ```
    ## Platform-scope commit discipline (RFC-0703)

    - Agents MUST use `ecosystem.commit` for all changes to `packages/**`, `integrations/**`, `services/**`. Direct `git commit` for these paths is blocked by the pre-commit hook (`hooks/pre-commit`) and the CI gate (`platform.commit.discipline.validate`).
    - The pre-commit hook is activated via `git config core.hooksPath hooks` (one-time per clone).
    - `ecosystem.commit` sets `ECOSYSTEM_COMMIT=1` env var to bypass the hook — this is the only sanctioned bypass.
    - `mission.close` auto-pins the platform version by calling `sternsystem.pin` after successful close (RFC-0703).
    ```

**Validation:**

- Visual review of `AGENTS.md` diff

**Completion criterion:** Rule present in root `AGENTS.md`.

**Human review:** no

---

### Step 8. Fix V-25 (empty reviewers) and validate

**Goal:** Add reviewer identity to RFC-0703 frontmatter to fix V-25 violation.

**Agent actions:**

- Edit `docs/rfcs/rfc-0703-*.md`:
  - Set `reviewers: ["human:andrii-syrokomskyi"]` (default reviewer per forge template)
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0703` — must pass with 0 violations

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0703` — 0 violations

**Completion criterion:** `rfc.validate` passes on RFC-0703.

**Human review:** no

---

### Step 9. Commit implementation changes

**Goal:** Commit all implementation changes using `ecosystem.commit` (platform-scope changes require `X-Platform-Bump` trailer).

**Agent actions:**

- Stage all changed files: `packages/os/site-kernel-checks/src/platform-commit-discipline.ts`, `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts`, `packages/os/site-kernel-checks/src/ci-local.ts`, `packages/os/site-kernel-handoff/src/mission/mission-close.ts`, `.github/workflows/ci.yml`, `AGENTS.md`, test files
- Run `pnpm exec werkstatt run ecosystem.commit --message="feat: enforce platform commit discipline and auto-pin on mission close (RFC-0703)" --rfc=RFC-0703`
- This will bump patch version, add `X-Platform-Bump` trailer, and commit

**Validation:**

- `git log -1 --format=%B` contains `X-Platform-Bump: patch`
- `git status` clean

**Completion criterion:** Implementation committed with trailer.

**Human review:** no

---

### Step 10. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: invoke `fo-fix` if `fo-review` reported findings
- Check off all 13 acceptance criteria in the RFC with inline `(evidence: ...)` annotations
- Stamp the RFC as implemented: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0703 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0703`
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria checked off; RFC stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0703`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks test`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm exec werkstatt run ci.local.validate --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0703` in the subject line
- `X-Platform-Bump` trailer on implementation commit

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives (README in packages/) | Step 1: command checks trailer presence only, not bump value; `ecosystem.commit` with `versionBump: none` still produces trailer |
| Hook not activated on fresh clone | Step 3: CI gate is the backstop; Step 7: AGENTS.md documents activation |
| `mission.close` pin failure blocks close | Step 4: pin failure throws descriptive error; intentional behavior per RFC |
| Pre-existing `ci.yml` gap (audit C-2) | Step 3: adds missing `platform.consistency.validate --check --json` alongside new command |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44/46/47, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0703 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `sternsystem.pin` cannot be called within `mission.close`'s lock scope (deadlock or lock re-acquisition), create a superseding RFC to restructure the lock protocol.
