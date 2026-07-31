---
rfcId: RFC-0615
planId: PLAN-RFC-0615-01
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
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0615

## 1. Objectives

- [ ] Objective 1 — Add `dist/` cleanup before astro build in `runMissionValidate` (maps to acceptance criterion: "cleans dist/ before running the astro build")
- [ ] Objective 2 — Add dirty workpiece check before `build.post` and skip auto-regeneration when dirty (maps to acceptance criterion: "checks isWorkpieceDirty() before build.post and skips auto-regeneration when dirty")
- [ ] Objective 3 — Replace `runPipelinePhase` with `executeKernelPipeline` for `build.post` to inspect step-level diagnostics (maps to acceptance criterion: "auto-regenerates the behavior snapshot when behavior.snapshot.validate reports SNAP-01 and the workpiece was clean")
- [ ] Objective 4 — Implement SNAP-01 detection, auto-regeneration, auto-commit, and re-validation loop (maps to acceptance criteria: "re-runs build.post and passes if the routes match", "does NOT auto-regenerate when the workpiece is dirty")
- [ ] Objective 5 — Ensure non-SNAP-01 errors are NOT auto-resolved (maps to acceptance criterion: "does NOT auto-resolve non-SNAP-01 errors")
- [ ] Objective 6 — Write unit tests covering all acceptance criteria (maps to acceptance criteria: "pnpm --filter @warpgogol/site-kernel-handoff test -- --run passes with new tests")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — `runMissionValidate` function (lines ~230-330): add dist cleanup, dirty check, switch from `runPipelinePhase` to `executeKernelPipeline`, add SNAP-01 detection + auto-regeneration + commit + re-validation
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — add import of `executeKernelCommand` from `@warpgogol/site-kernel`
- No new commands, no registry changes, no pipeline wiring changes

### 2.2 Configuration and data

- None — no YAML/JSON/ontology catalog changes

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add note about dist cleanup and snapshot auto-regeneration in `mission.validate`
- RFC file is read-only reference (already accepted)

### 2.4 Validation and pipelines

- No pipeline topology changes — `build.post` pipeline structure is unchanged
- `mission.validate` internal flow changes but its lifecycle position (before `mission.close`) is unchanged
- CI workflows unchanged

## 3. Step sequence

### Step 1. Add dist cleanup before astro build

**Goal:** Remove stale `dist/` directory before the astro build runs, preventing false positives from leftover artifacts.

**Agent actions:**

- In `runMissionValidate` (`mission-materialization-commands.ts`), after the `staticPassed` check (line ~241) and before the `execSync("pnpm exec astro build")` call (line ~245), add:
  ```ts
  const distDir = path.join(workpieceDir, "dist");
  if (existsSync(distDir)) {
    logger.info(`  Cleaning stale dist/ before build…`);
    await fs.rm(distDir, { recursive: true, force: true });
  }
  ```
- The `fs` import (`node:fs/promises`) and `existsSync` (`node:fs`) are already imported at the top of the file (lines 27-28).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — TypeScript compiles

**Completion criterion:** `dist/` is removed before the astro build in `runMissionValidate`; TypeScript compiles without errors.

**Human review:** no

---

### Step 2. Add dirty workpiece check before build.post

**Goal:** Check `isWorkpieceDirty()` before running `build.post` and record the result for use in the auto-regeneration decision.

**Agent actions:**

- Before the `build.post` call (line ~273), add:
  ```ts
  const dirtyBeforeBuildPost = isWorkpieceDirty(workpieceDir);
  if (dirtyBeforeBuildPost.dirty) {
    logger.info(`  [warn] workpiece has ${dirtyBeforeBuildPost.fileCount} uncommitted file(s) — snapshot auto-regeneration will be skipped`);
  }
  ```
- `isWorkpieceDirty` is already imported from `./mission-git-commit.ts` (line 42).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — TypeScript compiles

**Completion criterion:** `isWorkpieceDirty()` is called before `build.post`; the result is stored in `dirtyBeforeBuildPost` for later use; TypeScript compiles.

**Human review:** no

---

### Step 3. Replace runPipelinePhase with executeKernelPipeline for build.post

**Goal:** Switch from `runPipelinePhase` (which throws on failure) to `executeKernelPipeline` (which returns a report) so the SNAP-01 diagnostic can be inspected.

**Agent actions:**

- Replace the `build.post` call block (lines ~273-282):
  ```ts
  // OLD:
  if (buildSucceeded) {
    logger.info(`  Running build.post pipeline for ${manifest.systemId}…`);
    try {
      await runPipelinePhase(workspaceRoot, "build.post", manifest.systemId);
    } catch (err) {
      buildError = err instanceof Error ? err.message : String(err);
      buildSucceeded = false;
      logger.info(`  build.post failed: ${buildError}`);
    }
  }
  ```
  with:
  ```ts
  // NEW:
  let postPipelineReport: KernelPipelineReport | undefined;
  if (buildSucceeded) {
    logger.info(`  Running build.post pipeline for ${manifest.systemId}…`);
    try {
      const postResult = await executeKernelPipeline({
        workspaceRoot,
        pipelineName: "build.post",
        siteName: manifest.systemId,
        outputFormat: "pretty",
      });
      postPipelineReport = Array.isArray(postResult) ? postResult[0] : postResult;
      if (!postPipelineReport.ok) {
        buildError = `build.post failed at step: ${postPipelineReport.timing.failedStep ?? "unknown"}`;
        buildSucceeded = false;
        logger.info(`  ${buildError}`);
      }
    } catch (err) {
      buildError = err instanceof Error ? err.message : String(err);
      buildSucceeded = false;
      logger.info(`  build.post failed: ${buildError}`);
    }
  }
  ```
- Add `KernelPipelineReport` to the type imports from `@warpgogol/site-kernel` (line 31-37).
- `executeKernelPipeline` is already imported (line 38).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — TypeScript compiles

**Completion criterion:** `build.post` uses `executeKernelPipeline` instead of `runPipelinePhase`; the pipeline report is stored in `postPipelineReport`; TypeScript compiles.

**Human review:** no

---

### Step 4. Implement SNAP-01 detection and auto-regeneration

**Goal:** When `build.post` fails with SNAP-01 and the workpiece was clean, auto-regenerate the snapshot, commit it, and re-validate.

**Agent actions:**

- After the `build.post` block (Step 3), add the auto-regeneration logic:
  ```ts
  // RFC-0615: auto-regenerate behavior snapshot on SNAP-01 when workpiece was clean
  if (postPipelineReport && !postPipelineReport.ok && !dirtyBeforeBuildPost.dirty && buildSucceeded === false) {
    const snapshotStep = postPipelineReport.steps.find(
      (s) => s.commandName === "behavior.snapshot.validate"
    );
    const snap01Diagnostics = (snapshotStep?.data as { diagnostics?: { ruleId: string }[] } | undefined)?.diagnostics?.filter(
      (d) => d.ruleId === "SNAP-01"
    ) ?? [];

    if (snap01Diagnostics.length > 0) {
      logger.info(`  SNAP-01 detected — auto-regenerating behavior snapshot…`);
      try {
        // 1. Regenerate snapshot
        await executeKernelCommand({
          workspaceRoot,
          commandName: "behavior.snapshot.generate",
          siteName: manifest.systemId,
        });

        // 2. Commit updated snapshot (safe — workpiece was clean before build.post)
        await executeKernelCommand({
          workspaceRoot,
          commandName: "mission.git.commit",
          argv: [`--mission=${missionId}`, "--message=chore: auto-regenerate behavior snapshot"],
        });

        // 3. Re-run build.post to re-validate
        logger.info(`  Re-running build.post after snapshot regeneration…`);
        const revalidateResult = await executeKernelPipeline({
          workspaceRoot,
          pipelineName: "build.post",
          siteName: manifest.systemId,
          outputFormat: "pretty",
        });
        const revalidateReport = Array.isArray(revalidateResult) ? revalidateResult[0] : revalidateResult;

        if (revalidateReport.ok) {
          buildSucceeded = true;
          buildError = undefined;
          logger.info(`  build.post passed after snapshot regeneration`);
        } else {
          buildError = `build.post still failing after snapshot regeneration: ${revalidateReport.timing.failedStep ?? "unknown"}`;
          logger.info(`  ${buildError}`);
        }
      } catch (regenErr) {
        buildError = `snapshot auto-regeneration failed: ${regenErr instanceof Error ? regenErr.message : String(regenErr)}`;
        logger.info(`  ${buildError}`);
      }
    }
  }
  ```
- Add `executeKernelCommand` to the imports from `@warpgogol/site-kernel` (line 38).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — TypeScript compiles

**Completion criterion:** SNAP-01 detection, auto-regeneration, auto-commit, and re-validation logic is implemented; TypeScript compiles.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Create unit tests covering all acceptance criteria.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/mission-validate-dist-cleanup.test.ts`:
  - Test: `mission.validate` removes `dist/` before astro build
  - Mock `executeKernelPipeline` to return a passing pipeline report
  - Assert `fs.rm` was called on the dist directory
- Create `packages/os/site-kernel-handoff/src/tests/mission-validate-snapshot-auto-regen.test.ts`:
  - Test 1: SNAP-01 with clean workpiece → auto-regenerates, commits, re-validates, passes
  - Test 2: SNAP-01 with dirty workpiece → does NOT auto-regenerate, reports failure
  - Test 3: Non-SNAP-01 failure (e.g., STALE-01) → does NOT auto-regenerate
  - Test 4: SNAP-01 auto-regeneration succeeds but re-validation still fails → reports persistent failure
  - Test 5: `mission.git.commit` stages only snapshot file (verify via mock that `git add -A` only sees snapshot changes)
- Mock requirements (per system-retrieved memory):
  - `@warpgogol/site-kernel` — mock `executeKernelPipeline` (return pipeline report with steps), `executeKernelCommand` (return ok)
  - `isWorkpieceDirty` — mock to return `{ dirty: false, fileCount: 0, files: [] }` or `{ dirty: true, fileCount: 1, files: ["some-file"] }`
  - `execSync` — mock to return build output
  - Test context must include `logger: { info: () => {}, warn: () => {} }`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test -- --run` — all tests pass

**Completion criterion:** All test files pass; tests cover all 7 checkable acceptance criteria.

**Human review:** no

---

### Step 6. Update AGENTS.md

**Goal:** Document the new dist cleanup and snapshot auto-regeneration behavior in the handoff package AGENTS.md.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`, add to the mission lifecycle section:
  - `mission.validate` cleans `dist/` before the astro build (RFC-0615)
  - `mission.validate` auto-regenerates the behavior snapshot when `behavior.snapshot.validate` reports SNAP-01 and the workpiece is clean (RFC-0615)
  - Auto-regeneration requires a clean workpiece — `mission.git.commit` stages all changes, so a dirty workpiece would mix unrelated changes
  - The auto-regeneration also fires inside `mission.close`'s inline `mission.validate` gate

**Validation:**

- `git diff packages/os/site-kernel-handoff/AGENTS.md` — shows the new documentation

**Completion criterion:** AGENTS.md is updated with RFC-0615 behavior notes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files (root, apps/, packages/, services/) with new modules, commands, or ownership changes.
- Update affected `docs/*.xml` Compass files (requirements, technology, development-plan, knowledge-graph, verification-plan, source-markup, styling) when repository-wide semantics changed.
- Update `docs/architecture-dna.md` if a new DNA invariant was introduced.
- **Verify every file listed in `scope.docs` is updated** — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (do not hand-edit `docs/ecosystem.generated.yaml`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why (e.g. "requires runtime command blocked by environment").
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0615 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). The command validates all preconditions (status, criteria, clean tree, commit reachability). Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields — use the command.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0615`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0615`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test -- --run`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0615` (RFC-0330, for probe-bearing RFCs created on or after 2026-07-07)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0615.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0615` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| dist/ cleanup on network filesystems | Step 1 uses `fs.rm` with `force: true` — logs and continues on failure |
| Auto-regeneration masking real issues | Step 4 re-runs `build.post` after regeneration — persistent SNAP-01 is reported as failure |
| Commit churn | Step 4 only commits when workpiece was clean (Step 2 dirty check) — deterministic single-file commit |
| Semantic shift — mission.validate becomes mutating | Step 2 dirty check ensures mutation is safe; Step 6 documents the semantic shift in AGENTS.md |
| Agent confusion | Step 6 AGENTS.md documents that only SNAP-01 is auto-resolved |
| build.post modifies git-tracked files | Step 2 dirty check before build.post — current build.post steps only write to dist/ (gitignored) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-47 or DNA-58, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0615 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `executeKernelPipeline` does not return step-level diagnostics in the expected shape, investigate the `KernelPipelineReport` type before modifying the pipeline executor.
