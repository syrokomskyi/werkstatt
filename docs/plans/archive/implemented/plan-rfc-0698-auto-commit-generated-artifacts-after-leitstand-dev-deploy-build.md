---
rfcId: RFC-0698
planId: PLAN-RFC-0698-01
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

# Implementation Plan: RFC-0698

## 1. Objectives

- [ ] Objective 1 — Add `mission.git.commit` auto-commit call after `pnpm build` completes and before `distTreeHash` computation (maps to acceptance criterion: "leitstand.dev-deploy calls mission.git.commit after pnpm build completes and before distTreeHash computation")
- [ ] Objective 2 — Re-read `commitSha` from workpiece HEAD after auto-commit so `build-identity.json` and Axiom evidence reference post-commit HEAD (maps to acceptance criterion: "commitSha is re-read from workpiece HEAD after auto-commit")
- [ ] Objective 3 — Abort `leitstand.dev-deploy` with fatal error if `mission.git.commit` fails (maps to acceptance criterion: "If mission.git.commit fails, leitstand.dev-deploy returns exitCode: 1 and does not proceed to deploy")
- [ ] Objective 4 — Move build-skip cache write to after the auto-commit with post-commit `commitSha` (maps to acceptance criterion: "Build-skip cache is written after the auto-commit with the post-commit commitSha")
- [ ] Objective 5 — Ensure idempotent skip: no commit when workpiece is clean (maps to acceptance criterion: "If the workpiece is clean after build, no commit is created")
- [ ] Objective 6 — Add unit tests covering dirty workpiece, clean workpiece, and commit failure scenarios (maps to acceptance criteria: "If the workpiece is clean after build, no commit is created" and "Auto-commit works when build is skipped")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — `runLeitstandDevDeploy` handler: add auto-commit call, move cache write, re-read `commitSha`
- `packages/os/site-kernel-handoff/src/tests/rfc-0698-dev-deploy-auto-commit.test.ts` — new unit test file

### 2.2 Configuration and data

No configuration or data files changed.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update Leitstand section to document auto-commit behavior after build

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — scoped typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff test` — scoped tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0698` — RFC validation

## 3. Step sequence

### Step 1. Add auto-commit after build, before distTreeHash

**Goal:** Insert `mission.git.commit` call via `executeKernelCommand` after `pnpm build` completes (including build-skip and snapshot regeneration paths) and before `distTreeHash` computation. Re-read `commitSha` from workpiece HEAD after the auto-commit.

**Agent actions:**

- In `runLeitstandDevDeploy` (`leitstand-commands.ts`), after the build block (lines ~761-905) and after the `distPath` existence check (line ~942), but before the preliminary `build-identity.json` removal from `dist/` and `distTreeHash` computation (line ~957):
  - Import `executeKernelCommand` is already available via dynamic `import("@warpgogol/site-kernel")` (same pattern as `methodologies.validate`, `axiom.report`, `evidence.sync` calls already in the function).
  - Call `executeKernelCommand` with `commandName: "mission.git.commit"`, `argv: ["--mission=<missionId>", "--message=chore: regenerate artifacts from dev-deploy build.prepare"]`.
  - Check `commitResult.exitCode !== 0` — if non-zero, return fatal error result with `exitCode: 1` and descriptive summary. Do NOT proceed to deploy.
  - After successful commit, re-read `commitSha` via `execSync("git rev-parse HEAD", { cwd: workpiecePath, ... })`.
  - Log the auto-commit result: `logger.info("[leitstand.dev-deploy] auto-committed workpiece (<sha-prefix>)")` if committed, or `logger.info("[leitstand.dev-deploy] workpiece clean — no auto-commit needed")` if no commit was created.
- The auto-commit must run in **both** paths: normal build and build-skip (cache hit). In the build-skip path, the snapshot regeneration may have produced dirty files. The auto-commit after the build-skip block covers this.
- Place the auto-commit **after** the `distPath` existence check (line ~942) and **before** the preliminary `build-identity.json` removal from `dist/` (line ~943). This ensures:
  1. Build completed successfully (dist/ exists).
  2. Auto-commit captures all generated files from the build.
  3. `commitSha` is refreshed before `build-identity.json` is written with the final hash.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck passes
- Code review: auto-commit call is between build completion and `distTreeHash` computation

**Completion criterion:** `runLeitstandDevDeploy` calls `mission.git.commit` via `executeKernelCommand` after build and before `distTreeHash`; `commitSha` is re-read after the commit; fatal error returned on commit failure.

**Human review:** no

---

### Step 2. Move build-skip cache write to after auto-commit

**Goal:** Move the build-skip cache write (currently at lines ~804-811 and ~853-860) to **after** the auto-commit, so the cache stores the post-commit `commitSha` instead of the pre-build `commitSha`.

**Agent actions:**

- Remove the cache write blocks from:
  - The normal build success path (lines ~804-811)
  - The snapshot regeneration rebuild success path (lines ~853-860)
- Add a single cache write block **after** the auto-commit and `commitSha` re-read, before the `distTreeHash` computation. This block writes `{ commitSha: <post-commit>, platformVersion, platformSemanticHash, writtenAt }` to `buildCachePath`.
- The cache write should only happen if `buildState === "succeeded"` (not on build failure paths).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck passes
- Unit test: verify cache is written with post-commit `commitSha`

**Completion criterion:** Build-skip cache is written exactly once, after the auto-commit, with the post-commit `commitSha`.

**Human review:** no

---

### Step 3. Add unit tests

**Goal:** Create unit tests covering the auto-commit behavior: dirty workpiece, clean workpiece (idempotent skip), and commit failure (fatal abort).

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/rfc-0698-dev-deploy-auto-commit.test.ts`
- Follow the test pattern from `leitstand-0628-dev-deploy.test.ts`:
  - Mock `node:child_process` (`execSync` for `git rev-parse HEAD`, `pnpm build`)
  - Mock `@warpgogol/site-kernel` (`executeKernelCommand` for `methodologies.validate`, `mission.git.commit`, `axiom.report`, `evidence.sync`, `behavior.snapshot.validate`)
  - Create temp workspace with registry, mission manifest, workpiece with `.git`
- Test cases:
  1. **Dirty workpiece → auto-commit created**: `mission.git.commit` mock returns `exitCode: 0`; verify `executeKernelCommand` was called with `commandName: "mission.git.commit"`; verify `commitSha` in result reflects post-commit HEAD.
  2. **Clean workpiece → no commit needed**: `mission.git.commit` mock returns `exitCode: 0` with `committed: false` in data; verify deploy proceeds normally.
  3. **Commit failure → fatal abort**: `mission.git.commit` mock returns `exitCode: 1`; verify `runLeitstandDevDeploy` returns `exitCode: 1` and does not proceed to deploy.
  4. **Build-skip with dirty workpiece**: build is skipped (cache hit), but auto-commit still runs and captures any dirty files (e.g. from snapshot regeneration).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` — all tests pass

**Completion criterion:** All 4 test cases pass; tests cover dirty, clean, failure, and build-skip scenarios.

**Human review:** no

---

### Step 4. Update AGENTS.md documentation

**Goal:** Update `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section to document the auto-commit behavior.

**Agent actions:**

- In the Leitstand section of `packages/os/site-kernel-handoff/AGENTS.md`, update the `leitstand.dev-deploy` description to include:
  - "RFC-0698: after `pnpm build` completes (including `build.post`) and before computing `distTreeHash`, `leitstand.dev-deploy` auto-commits the workpiece via `mission.git.commit` (via `executeKernelCommand`). The `commitSha` is re-read from workpiece HEAD after the auto-commit. If `mission.git.commit` fails, the deploy aborts with a fatal error. The auto-commit is idempotent — no commit is created if the workpiece is clean. The build-skip cache (RFC-0653) is written after the auto-commit with the post-commit `commitSha`."

**Validation:**

- Visual inspection of AGENTS.md update

**Completion criterion:** AGENTS.md Leitstand section documents the auto-commit behavior.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated with auto-commit documentation.
- Run `pnpm exec werkstatt run command.manifest.generate` if command surfaces changed (no new commands — skip).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0698 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0698`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0698`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0698` in the subject line (RFC-0265 commit hygiene)
- Unit test file `packages/os/site-kernel-handoff/src/tests/rfc-0698-dev-deploy-auto-commit.test.ts`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Pre-commit hook blocks | Step 1: fatal error with descriptive message directs operator to resolve hook failure |
| Commit noise | Step 1: `mission.git.commit` is idempotent — no commit when clean |
| Agent confusion | Step 1: `commitSha` in `DevDeployResult` reflects post-commit HEAD; log clearly states auto-commit |
| Build-skip cache interaction | Step 2: cache written after auto-commit with post-commit `commitSha` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-51, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0698 --reason "..." --invariant "DNA-N"` instead of working around it.
