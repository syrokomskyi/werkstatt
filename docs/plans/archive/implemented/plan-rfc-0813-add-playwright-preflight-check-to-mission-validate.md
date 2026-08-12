---
rfcId: RFC-0813
planId: PLAN-RFC-0813-01
status: draft
owner: architecture
createdAt: 2026-08-12
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - docs/rfcs/rfc-0813-add-playwright-preflight-check-to-mission-validate.md
---

# Implementation Plan: RFC-0813

## 1. Objectives

- [ ] O1 — Extract `isChromiumInstalled` async pure function from `ensureChromium` (maps to acceptance: "isChromiumInstalled async pure function extracted and shared")
- [ ] O2 — Create `playwright.preflight.check` command handler and register it (maps to acceptance: "playwright.preflight.check command registered in infra-contracts.ts")
- [ ] O3 — Wire preflight call into `runMissionValidate` after distribution-reuse, before `build.prepare` (maps to acceptance: "Runs as first operation inside runMissionValidate, after distribution-reuse check, before build.prepare")
- [ ] O4 — Unit tests for preflight check (maps to acceptance: "Unit test: missing Chromium → exit code 1" and "Unit test: installed Chromium → exit code 0")
- [ ] O5 — Verify acceptance criteria and stamp implemented (maps to acceptance: "rfc.validate passes on this file before merging")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts` — extract `isChromiumInstalled` from existing `ensureChromium`, refactor `ensureChromium` to use it
- `packages/werkstatt-site/src/checks/playwright-preflight.ts` — **new file**: `runPlaywrightPreflightCheck` handler
- `packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts` — register `playwright.preflight.check` command
- `packages/werkstatt-site/src/checks/index.ts` — re-export `isChromiumInstalled` and `runPlaywrightPreflightCheck`
- `packages/werkstatt/src/mission/mission-materialization-commands.ts` — insert preflight call in `runMissionValidate` after distribution-reuse early-return, before `build.prepare`

### 2.2 Configuration and data

None.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0813-add-playwright-preflight-check-to-mission-validate.md` — read-only reference (acceptance criteria checked off during stamping)
- No AGENTS.md updates needed (no new governance rules, no new package boundaries)
- No Compass XML updates needed (no repository-wide requirement changes)
- No `docs/architecture-dna.md` updates needed (no new DNA invariant)

### 2.4 Validation and pipelines

- No pipeline definition changes (preflight is a direct function call inside `runMissionValidate`, not a pipeline step)
- `command.manifest.generate` should be re-run after registering the new command

## 3. Step sequence

### Step 1. Extract `isChromiumInstalled` pure function

**Goal:** Extract the Chromium launch-check phase from `ensureChromium` into a standalone async pure function that both `ensureChromium` and the new preflight handler can call.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts`:
  - Add `isChromiumInstalled(workspaceRoot: string): Promise<{ installed: boolean; error?: string; revision?: string }>` — attempts `chromium.launch({ headless: true })`, returns `{ installed: true, revision }` on success, returns `{ installed: false, error }` on failure (catch block captures the error message)
  - Refactor `ensureChromium` to call `isChromiumInstalled` as its first phase instead of inlining the launch check
  - Keep `ensureChromium`'s existing behavior: if `isChromiumInstalled` returns `installed: true`, return early with `{ installed: true, chromiumRevision, skipped: true }`; if `installed: false`, proceed to `preflightChromium` auto-install + retry
- Export `isChromiumInstalled` from `packages/werkstatt-site/src/checks/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- Existing `playwright-chromium-ensure.test.ts` tests still pass: `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose playwright-chromium-ensure`

**Completion criterion:** `isChromiumInstalled` is exported, `ensureChromium` uses it, existing tests pass, typecheck clean.

**Human review:** no

---

### Step 2. Create `playwright.preflight.check` command handler

**Goal:** Create the new command handler that calls `isChromiumInstalled` and returns exitCode 1 with a clear error message when Chromium is missing.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/playwright-preflight.ts`:
  - Import `isChromiumInstalled` from `./playwright-chromium-ensure.ts`
  - Implement `runPlaywrightPreflightCheck(input: KernelCommandInput, context: KernelRuntimeContext): Promise<KernelCommandResult>`:
    - Call `await isChromiumInstalled(context.workspaceRoot)`
    - If `installed: true` → return `{ data: { command: "playwright.preflight.check", status: "pass" }, exitCode: 0, summary: "ok" }`
    - If `installed: false` → return `{ data: { command: "playwright.preflight.check", status: "fail", error }, exitCode: 1, summary: \`Playwright Chromium is not installed. Launch error: ${error ?? "unknown"}. Run: pnpm exec playwright install chromium\` }`
  - Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding
- Register in `packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts`:
  - Import `runPlaywrightPreflightCheck` from `../playwright-preflight.ts`
  - Add entry to `INFRA_CONTRACTS_COMMANDS` array:
    ```ts
    {
      name: "playwright.preflight.check",
      description:
        "RFC-0813: Pre-flight check for Playwright Chromium. Fails fast (exitCode 1) " +
        "if Chromium is not launchable. Does not auto-install — use playwright.chromium.ensure " +
        "for that. Used by mission.validate before build.prepare.",
      scope: "workspace",
      supportsAllSites: false,
      execute: runPlaywrightPreflightCheck,
    }
    ```
- Re-export `runPlaywrightPreflightCheck` from `packages/werkstatt-site/src/checks/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- `pnpm exec werkstatt run command.manifest.generate` — new command appears in manifest

**Completion criterion:** `playwright.preflight.check` registered, handler created, typecheck clean, command appears in manifest.

**Human review:** no

---

### Step 3. Wire preflight into `runMissionValidate`

**Goal:** Insert the preflight call in `runMissionValidate` after the distribution-reuse early-return block and before the `build.prepare` pipeline invocation.

**Agent actions:**

- In `packages/werkstatt/src/mission/mission-materialization-commands.ts`:
  - Import `isChromiumInstalled` from `@warpgogol/werkstatt-site/checks` (via subpath export)
  - In `runMissionValidate`, after the distribution-reuse block (after line ~425, after the `if (!force)` block closes) and before `logger.info(\`  Running build.prepare pipeline…\`)` (line ~432):
    ```ts
    // RFC-0813: Playwright Chromium pre-flight check — fail fast before expensive
    // build.prepare + build.check + astro build + build.post cycle.
    // Skipped on distribution-reuse path (returns early above).
    try {
      const { installed, error } = await isChromiumInstalled(workspaceRoot);
      if (!installed) {
        const msg = `Playwright Chromium is not installed. Launch error: ${error ?? "unknown"}. Run: pnpm exec playwright install chromium`;
        logger.info(`  [preflight] ${msg}`);
        const preflightReport = {
          schemaVersion: "1.0.0",
          missionId,
          contractFull: { passed: false, validators: [] },
          build: { succeeded: false, routeCount: 0, sitemapHash: "sha256:preflight-failed", failedSteps: [{ name: "playwright.preflight.check", exitCode: 1 }] },
          distributionReused: false,
          buildInputHash: null,
          fullBuildRan: false,
          validatedAt: new Date().toISOString(),
        };
        await atomicWriteFile(path.join(evidenceDir, "validation-report.json"), JSON.stringify(preflightReport, null, 2) + "\n");
        return {
          data: preflightReport as unknown as MissionValidateData,
          exitCode: 1,
          summary: `[mission.validate] ${missionId} pre-flight FAILED: Playwright Chromium is not installed`,
          nextSteps: [{ action: `Run: pnpm exec playwright install chromium, then re-run: pnpm exec werkstatt run mission.validate --mission ${missionId}`, kind: "required" }],
        };
      }
      logger.info(`  Playwright Chromium: pre-flight check passed`);
    } catch (err) {
      // Non-fatal: if the check itself throws unexpectedly, log and continue
      logger.warn(`  Playwright Chromium pre-flight check error (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    }
    ```
- Verify `@warpgogol/werkstatt-site/checks` subpath export exists in `packages/werkstatt-site/package.json` — if not, add it

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** Preflight call is in `runMissionValidate` after distribution-reuse, before `build.prepare`. Typecheck clean.

**Human review:** no

---

### Step 4. Unit tests for preflight check

**Goal:** Write unit tests for `runPlaywrightPreflightCheck` covering both pass and fail paths.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/playwright-preflight.test.ts`:
  - Mock `playwright` module (same pattern as `playwright-chromium-ensure.test.ts`)
  - Test: "returns exitCode 0 when Chromium is already installed" — mock `chromium.launch` to return a mock browser → `exitCode === 0`, `data.status === "pass"`
  - Test: "returns exitCode 1 when Chromium is not installed" — mock `chromium.launch` to reject with `new Error("Executable not found")` → `exitCode === 1`, `data.status === "fail"`, `summary` contains "playwright install chromium"
  - Test: "error message includes original launch error" — mock `chromium.launch` to reject with specific error message → `data.error` contains the original message
  - Use `makeTestContext` and `testInput` from `./helpers.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose playwright-preflight` — all tests pass

**Completion criterion:** 3 tests pass: installed → exitCode 0, missing → exitCode 1, error includes original launch error.

**Human review:** no

---

### Step 5. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No AGENTS.md updates needed (no new governance rules)
- No Compass XML updates needed (no repository-wide requirement changes)
- Run `pnpm exec werkstatt run command.manifest.generate` to update the command manifest with the new `playwright.preflight.check` command
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0813 --dry-run` first, then without `--dry-run`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0813` — passes with zero violations
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes
- `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose playwright-preflight` — all preflight tests pass
- `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose playwright-chromium-ensure` — existing tests still pass
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0813`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose playwright-preflight`
- `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose playwright-chromium-ensure`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0813` (acceptance probe: `command-registered` for `playwright.preflight.check`)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0813` in the subject line (RFC-0265 commit hygiene)
- `rfc.implement.stamp` produces the stamp commit separately from the implementation commit

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| False negative — detection logic incorrect | Step 1 reuses the same `chromium.launch()` detection from `ensureChromium` — if detection is wrong, both commands are wrong and the issue would have been caught by existing tests |
| Added step to mission.validate (~100–500ms) | Step 3 places preflight after distribution-reuse early-return, so the reuse path adds 0ms. Full-build path adds one browser launch + close. |
| False positive on launch failure (sandbox/lib issues) | Step 2 includes the original launch error in the output so the operator can distinguish "binary not found" from "OS dependency issues" |
| `isChromiumInstalled` extraction breaks `ensureChromium` | Step 1 refactors `ensureChromium` to call `isChromiumInstalled` and existing tests (Step 4 validation) verify no regression |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0813 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `@warpgogol/werkstatt-site/checks` subpath export does not exist and cannot be added without a separate RFC, fall back to calling `executeKernelCommand` with `playwright.preflight.check` from `runMissionValidate` instead of importing `isChromiumInstalled` directly.
