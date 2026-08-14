---
rfcId: RFC-0844
planId: PLAN-RFC-0844-01
status: draft
owner: architecture
createdAt: 2026-08-14
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - packages/werkstatt/AGENTS.md
---

# Implementation Plan: RFC-0844

## 1. Objectives

- [ ] Objective 1 — Create `workpiece.config.presence.check` command handler (maps to acceptance criterion: command handler defined)
- [ ] Objective 2 — Register command in `mission.module.ts` (maps to acceptance criterion: command registered)
- [ ] Objective 3 — Integrate presence check into `mission.validate` before Playwright pre-flight (maps to acceptance criterion: mission.validate calls presence check)
- [ ] Objective 4 — Missing files produce exit code 1 with restore commands (maps to acceptance criterion: missing files produce exit code 1)
- [ ] Objective 5 — All files present produces exit code 0 with <100ms execution (maps to acceptance criterion: all files present passes)
- [ ] Objective 6 — Presence check skipped on distribution-reuse path (maps to acceptance criterion: skipped on reuse path)
- [ ] Objective 7 — Unit tests cover missing files, all present, workpiece not found (maps to acceptance criteria: unit tests)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/mission/workpiece-config-presence-check.ts` — **new** command handler
- `packages/werkstatt/src/mission/workpiece-config-presence-check.test.ts` — **new** unit tests
- `packages/werkstatt/src/mission/mission-materialization-commands.ts` — integrate presence check into `runMissionValidate` before Playwright pre-flight (RFC-0813)
- `packages/werkstatt/src/mission/mission.module.ts` — register `workpiece.config.presence.check` command
- `packages/werkstatt/src/mission/index.ts` — re-export `runWorkpieceConfigPresenceCheck` and `WorkpieceConfigPresenceResult`

### 2.2 Configuration and data

- No configuration changes. `OPERATOR_CONFIG_FILES` constant in `operator-config-files.ts` is read-only — no modifications.

### 2.3 Documentation and specs

- `packages/werkstatt/AGENTS.md` — add `workpiece.config.presence.check` to the "Operator config file persistence (RFC-0840)" section, documenting the new pre-build presence check command.
- No `docs/*.xml` Compass files impacted — no repository-wide semantic changes.
- No `docs/architecture-dna.md` changes — no new DNA invariant (command kind RFC, `satisfies: []`).

### 2.4 Validation and pipelines

- No pipeline changes — the presence check is a direct `executeKernelCommand` call inside `runMissionValidate`, not a pipeline step (same pattern as RFC-0813).
- No CI workflow changes.

## 3. Step sequence

### Step 1. Create `workpiece-config-presence-check.ts` command handler

**Goal:** Implement the `workpiece.config.presence.check` command handler that verifies all `OPERATOR_CONFIG_FILES` entries are present in the active workpiece.

**Agent actions:**

- Create `packages/werkstatt/src/mission/workpiece-config-presence-check.ts`
- Import `OPERATOR_CONFIG_FILES` from `./operator-config-files.ts`
- Import `KernelCommandInput`, `KernelCommandResult`, `KernelRuntimeContext` from kernel types
- Import `existsSync` from `node:fs`, `path` from `node:path`
- Import `readMissionManifest`, `resolveMissionDir` from `./mission-io.ts`
- Implement `runWorkpieceConfigPresenceCheck(input, context)`:
  - Read `--mission` flag from input
  - Resolve workpiece path: `missions/{missionId}/workpiece/`
  - If workpiece directory not found: return exit code 1 with error message
  - For each entry in `OPERATOR_CONFIG_FILES`: check `existsSync(join(workpieceDir, entry))`
  - Build `missing` array with `{ file, restoreCommand }` for each missing file
  - Build `present` array for each present file
  - Restore command: if entry contains `/` (subdirectory), prefix with `mkdir -p {targetDir} && `, then `cp {cacheClonePath}/{entry} {workpiecePath}/{entry}`
  - Resolve system ID from mission ID prefix (convention: `{systemId}-m{number}`) — split on `-m` suffix
  - Return `{ data: { command, status, missionId, missing, present }, exitCode: missing.length > 0 ? 1 : 0 }`
- Export `WorkpieceConfigPresenceResult` interface

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compiles

**Completion criterion:** File exists, TypeScript compiles, `runWorkpieceConfigPresenceCheck` is exported

**Human review:** no

---

### Step 2. Register command in `mission.module.ts`

**Goal:** Register `workpiece.config.presence.check` in the mission module so it can be invoked via the kernel.

**Agent actions:**

- Open `packages/werkstatt/src/mission/mission.module.ts`
- Add dynamic import of `runWorkpieceConfigPresenceCheck` from `./workpiece-config-presence-check.ts` (same pattern as `runMaterializeConfigValidate`)
- Register command: `registry.registerCommand({ name: "workpiece.config.presence.check", description: "Verify OPERATOR_CONFIG_FILES are present in the active workpiece before build (RFC-0844).", scope: "workspace", execute: runWorkpieceConfigPresenceCheck })`
- Place registration near `materialize.config.validate` (line ~407) since they share the `OPERATOR_CONFIG_FILES` domain

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compiles
- `pnpm exec werkstatt run command.manifest.generate` — command appears in manifest

**Completion criterion:** Command registered, appears in generated manifest

**Human review:** no

---

### Step 3. Re-export from `index.ts`

**Goal:** Make the command handler and type available from the mission barrel export.

**Agent actions:**

- Add to `packages/werkstatt/src/mission/index.ts`:
  ```ts
  export { runWorkpieceConfigPresenceCheck, type WorkpieceConfigPresenceResult } from "./workpiece-config-presence-check.ts";
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** Export compiles, accessible from `@warpgogol/werkstatt/mission`

**Human review:** no

---

### Step 4. Integrate into `mission.validate`

**Goal:** Insert the presence check into `runMissionValidate` before the Playwright Chromium pre-flight (RFC-0813) and before `build.prepare`. Both pre-flight checks must be after the distribution-reuse early-return block.

**Agent actions:**

- Open `packages/werkstatt/src/mission/mission-materialization-commands.ts`
- Locate the distribution-reuse early-return block (ends ~line 426) and the Playwright pre-flight block (starts ~line 428)
- Insert the presence check block **before** the Playwright pre-flight block:
  ```ts
  // RFC-0844: Operator config presence check — fail fast before expensive build.
  // Runs BEFORE Playwright pre-flight (existsSync <10ms vs browser launch ~100-500ms).
  // Skipped on distribution-reuse path (returns early above).
  try {
    const presenceResult = (await executeKernelCommand({
      workspaceRoot,
      commandName: "workpiece.config.presence.check",
      inputArgs: ["--mission", missionId],
      outputFormat: "pretty",
    })) as { exitCode?: number; data?: WorkpieceConfigPresenceResult };
    if ((presenceResult.exitCode ?? 0) !== 0) {
      const missing = presenceResult.data?.missing ?? [];
      const missingFiles = missing.map((m) => m.file).join(", ");
      logger.info(`  [preflight] Missing operator config files: ${missingFiles}`);
      for (const m of missing) {
        logger.info(`    Restore: ${m.restoreCommand}`);
      }
      const preflightReport = {
        schemaVersion: "1.0.0",
        missionId,
        contractFull: { passed: false, validators: [] },
        build: {
          succeeded: false,
          routeCount: 0,
          sitemapHash: "sha256:config-presence-failed",
          failedSteps: [{ name: "workpiece.config.presence.check", exitCode: 1 }],
        },
        distributionReused: false,
        buildInputHash: null,
        fullBuildRan: false,
        validatedAt: new Date().toISOString(),
      };
      await atomicWriteFile(
        path.join(evidenceDir, "validation-report.json"),
        JSON.stringify(preflightReport, null, 2) + "\n",
      );
      return {
        data: preflightReport as unknown as MissionValidateData,
        exitCode: 1,
        summary: `[mission.validate] ${missionId} pre-flight FAILED: missing operator config files (${missingFiles})`,
        nextSteps: [
          {
            action: `Restore missing files:\n${missing.map((m) => m.restoreCommand).join("\n")}\nThen re-run: pnpm exec werkstatt run mission.validate --mission ${missionId}`,
            kind: "required",
          },
        ],
      };
    }
    logger.info(`  Operator config files: all present`);
  } catch (err) {
    logger.warn(
      `  Operator config presence check error (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  ```
- Import `WorkpieceConfigPresenceResult` type at the top of the file

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** Presence check block inserted before Playwright pre-flight, TypeScript compiles

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Create comprehensive unit tests for the presence check command handler.

**Agent actions:**

- Create `packages/werkstatt/src/mission/workpiece-config-presence-check.test.ts`
- Test cases:
  1. **Missing `.lighthouse-budget-ignore`** — create workpiece with `src/image-delivery.config.yaml` but no `.lighthouse-budget-ignore`. Assert exit code 1, `status: "fail"`, `missing` array contains `.lighthouse-budget-ignore` with correct restore command (no `mkdir -p` needed for root-level file).
  2. **Missing `src/image-delivery.config.yaml`** — create workpiece with `.lighthouse-budget-ignore` but no `src/image-delivery.config.yaml`. Assert exit code 1, `missing` array contains `src/image-delivery.config.yaml` with restore command including `mkdir -p`.
  3. **All files present** — create workpiece with both files. Assert exit code 0, `status: "pass"`, `missing: []`, `present` contains both files.
  4. **Workpiece directory not found** — pass non-existent mission ID. Assert exit code 1, error message includes "Workpiece directory not found".
  5. **Both files missing** — create workpiece with neither file. Assert exit code 1, `missing` array has 2 entries.
- Use `mkdtempSync` for temp directories, clean up in `afterEach`
- Mock `KernelRuntimeContext` with `workspaceRoot` pointing to temp dir
- Use `flagString` from kernel helpers or construct `KernelCommandInput` with `flags: { mission: "test-m001" }`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test -- --run workpiece-config-presence-check`

**Completion criterion:** All 5 tests pass

**Human review:** no

---

### Step 6. Update `packages/werkstatt/AGENTS.md`

**Goal:** Document the new `workpiece.config.presence.check` command in the package AGENTS.md.

**Agent actions:**

- Open `packages/werkstatt/AGENTS.md`
- In the "Operator config file persistence (RFC-0840)" section, add a bullet for `workpiece.config.presence.check`:
  ```
  - `workpiece.config.presence.check` (RFC-0844): pre-build gate in `mission.validate` that verifies all `OPERATOR_CONFIG_FILES` entries are present in the active workpiece before the build pipeline starts. Runs before the Playwright Chromium pre-flight (RFC-0813). Returns `status: "fail"` with restore commands for each missing file. Non-fatal if the check command itself throws. Skipped on distribution-reuse path.
  ```

**Validation:**

- Visual review — bullet is in the correct section

**Completion criterion:** AGENTS.md updated with new command documentation

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/werkstatt/AGENTS.md` is updated (Step 6).
- No `docs/*.xml` Compass files need updates — no repository-wide semantic changes.
- No `docs/architecture-dna.md` changes — no new DNA invariant.
- Run `pnpm exec werkstatt run command.manifest.generate` if command surfaces changed (Step 2 registration).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0844 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0844`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- Review report exists for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0844`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- No acceptance probes declared — `rfc.verification.emit` not required.
- `pnpm exec werkstatt run command.manifest.generate` — verify command appears in manifest

### 4.2 Evidence artifacts

- No `docs/rfcs/verification/rfc-0844.generated.json` — no acceptance probes.
- Commit messages referencing `RFC-0844` in the subject line (RFC-0265 commit hygiene).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| False sense of safety (presence only, not contents) | Step 1 — handler only checks `existsSync`, does not read file contents. Content validation remains in downstream validators. |
| New operator config files (future RFC adds to `OPERATOR_CONFIG_FILES`) | Step 1 — handler reads `OPERATOR_CONFIG_FILES` constant dynamically. New entries are automatically included. |
| Performance (<10ms total) | Step 1 — uses `existsSync` (synchronous, <1ms per file). Step 5 test verifies <100ms. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-71, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0844 --reason "..." --invariant "DNA-71"` instead of working around it.
- If the `executeKernelCommand` call pattern doesn't work for workspace-scope commands inside `runMissionValidate`, switch to a direct function call (`runWorkpieceConfigPresenceCheck`) — but this requires passing `context` and `input` manually, which is more complex.
