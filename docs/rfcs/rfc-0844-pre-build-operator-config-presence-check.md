---
id: RFC-0844
title: "Pre-build operator config presence check — fail fast before expensive build cycle"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-14
updatedAt: 2026-08-14
enhancedAt: 2026-08-14
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0840
amendedBy: []
related:
  - DNA-71
  - RFC-0840
  - RFC-0833
  - RFC-0830
satisfies: []
versionBump: patch
commands:
  proposed:
    - workpiece.config.presence.check
  added: []
  changed:
    - mission.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "mission.validate fails within seconds (not minutes) when OPERATOR_CONFIG_FILES are missing from the workpiece."
  - "Error message includes the exact missing file path and a one-line restore command."
  - "No false positives — files present in the workpiece are not flagged."
nonGoals:
  - "This RFC does not validate file contents — only presence."
  - "This RFC does not add new files to OPERATOR_CONFIG_FILES — adding new entries requires a superseding RFC per RFC-0840's implementation notes."
  - "This RFC does not replace materialize.config.validate — that command checks list sync, not pre-build presence."
---

# RFC-0844: Pre-build operator config presence check — fail fast before expensive build cycle

## Context

RFC-0840 introduced `OPERATOR_CONFIG_FILES` — a canonical list of operator config files (`.lighthouse-budget-ignore`, `src/image-delivery.config.yaml`) that are persisted to the cache clone during `mission.close` and restored during `mission.materialize`. This solved the re-materialization problem.

However, during mission `warpgogol-com-m000056`, both `.lighthouse-budget-ignore` and `src/image-delivery.config.yaml` were **accidentally deleted from the workpiece** during active mission work (not during re-materialization). The `mission.validate` pipeline then ran for **10+ minutes** — through `build.prepare`, `astro build`, and into `build.check` — before failing with confusing LH-12 (unreferenced JS bundles) and IMG-DELIVERY-01/02 errors. The operator had to manually diagnose the root cause, restore the files from the cache clone, and re-run the entire pipeline.

The existing `materialize.config.validate` command (RFC-0840) checks for **dead entries** in `OPERATOR_CONFIG_FILES` and **unrecognized files** in the workpiece — but it does NOT verify that required files are **present** before starting the build. It runs in `PACKAGES_CHECK_PIPELINE` (workspace-scope), not as a pre-build gate.

## Problem

When an `OPERATOR_CONFIG_FILES` entry is missing from the workpiece:

1. **No early detection:** The build pipeline (`build.prepare` → `astro build` → `build.check`) runs to completion (10+ minutes) before a downstream validator fails with a confusing error.
2. **Misleading errors:** `lighthouse.budget.check` reports LH-12 (unreferenced JS bundles) instead of "`.lighthouse-budget-ignore` is missing". `image.delivery.validate` reports IMG-DELIVERY-01/02 instead of "`src/image-delivery.config.yaml` is missing".
3. **Manual diagnosis required:** The operator must trace the error back to a missing config file and know to restore it from the cache clone.
4. **Wasted CI time:** Each failed `mission.validate` run consumes 10+ minutes of build time that could have been caught in seconds.

## Decision

Introduce a `workpiece.config.presence.check` command that verifies all `OPERATOR_CONFIG_FILES` entries are present in the active workpiece **before** the build pipeline starts. Integrate it into `mission.validate` as a pre-build gate, **before** the Playwright Chromium pre-flight check (RFC-0813) and before `build.prepare`. The presence check runs first because it is faster (`existsSync`, <10ms) than the Playwright pre-flight (browser launch, ~100-500ms) — if config files are missing, the operator gets the error immediately without waiting for a browser launch.

## Architectural fit

- **DNA-71:** Extends the operator config file persistence invariant (DNA-71) with a pre-build presence check. RFC-0840 established persistence; this RFC establishes verification.
- **RFC-0840 amendment:** This RFC amends RFC-0840 by adding a pre-build presence check to the operator config file lifecycle. The `OPERATOR_CONFIG_FILES` constant remains the single source of truth.
- **RFC-0813 pattern:** Follows the same fail-fast pattern as the Playwright Chromium pre-flight check — verify infrastructure before expensive build cycles. The presence check runs before the Playwright pre-flight because it is faster (<10ms vs ~100-500ms).
- **Site OS operator model:** App-scoped check command that runs as a pre-build gate in `mission.validate`, not as a post-build validator. It reads the workpiece directory and `OPERATOR_CONFIG_FILES` constant — no build artifacts needed.

## Design

### CLI surface

```sh
# Standalone (rarely used directly)
pnpm exec werkstatt run workpiece.config.presence.check --mission warpgogol-com-m000056

# Automatic — runs as pre-build gate in mission.validate
pnpm exec werkstatt run mission.validate --mission warpgogol-com-m000056
```

| Flag        | Kind    | Default    | Description          |
| ----------- | ------- | ---------- | -------------------- |
| `--mission` | string  | (required) | Mission ID to check. |
| `--json`    | boolean | false      | Emit JSON output.    |

### TypeScript contracts

```ts
interface WorkpieceConfigPresenceResult {
  command: "workpiece.config.presence.check";
  status: "pass" | "fail";
  missionId: string;
  missing: Array<{
    file: string;
    restoreCommand: string;
  }>;
  present: string[];
}
```

### Execution flow

1. **Resolve workpiece path:** `missions/{missionId}/workpiece/`
2. **Read `OPERATOR_CONFIG_FILES`** from `operator-config-files.ts`.
3. **Check each file:** `existsSync(join(workpieceDir, entry))`.
4. **If any missing:** Return `status: "fail"` with `missing` array containing the file path and a restore command.
5. **If all present:** Return `status: "pass"`.

### Restore command generation

For each missing file, the diagnostic includes a ready-to-run restore command. If the file is in a subdirectory (e.g., `src/`), the restore command includes `mkdir -p` to ensure the target directory exists:

```
Missing: .lighthouse-budget-ignore
Restore:  cp ../systems-cache/{systemId}/.lighthouse-budget-ignore missions/{missionId}/workpiece/

Missing: src/image-delivery.config.yaml
Restore:  mkdir -p missions/{missionId}/workpiece/src/ && cp ../systems-cache/{systemId}/src/image-delivery.config.yaml missions/{missionId}/workpiece/src/
```

The system ID is resolved from `system-state.yaml` or the mission ID prefix (convention: `{systemId}-m{number}`).

### Integration into `mission.validate`

The presence check is inserted into `runMissionValidate` in `mission-materialization-commands.ts`, after the distribution-reuse early-return block (line ~426) and **before** the Playwright Chromium pre-flight (RFC-0813, line ~428). Both pre-flight checks are skipped on the distribution-reuse path — if the distribution is reused, the build doesn't run, so missing operator config files won't cause build failures.

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
    const preflightReport = {
      // ... same structure as Playwright pre-flight failure ...
      failedSteps: [{ name: "workpiece.config.presence.check", exitCode: 1 }],
    };
    // Write report and return early — do not start build
    return { data: preflightReport, exitCode: 1, ... };
  }
  logger.info(`  Operator config files: all present`);
} catch (err) {
  // Non-fatal: if the check itself throws, log and continue
  logger.warn(`  Operator config presence check error (non-fatal): ${err}`);
}

// RFC-0813: Playwright Chromium pre-flight (existing)
// ... playwright pre-flight code ...
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/mission/operator-config-files.ts` | Source of `OPERATOR_CONFIG_FILES` constant (existing) |
| `packages/werkstatt/src/mission/workpiece-config-presence-check.ts` | New command handler |
| `packages/werkstatt/src/mission/mission-materialization-commands.ts` | Integration point in `mission.validate` |
| `packages/werkstatt/src/mission/mission.module.ts` | Command registration |

### Output format

```json
{
  "command": "workpiece.config.presence.check",
  "status": "fail",
  "missionId": "warpgogol-com-m000056",
  "missing": [
    {
      "file": ".lighthouse-budget-ignore",
      "restoreCommand": "cp ../systems-cache/warpgogol-com/.lighthouse-budget-ignore missions/warpgogol-com-m000056/workpiece/"
    },
    {
      "file": "src/image-delivery.config.yaml",
      "restoreCommand": "mkdir -p missions/warpgogol-com-m000056/workpiece/src/ && cp ../systems-cache/warpgogol-com/src/image-delivery.config.yaml missions/warpgogol-com-m000056/workpiece/src/"
    }
  ],
  "present": []
}
```

### Failure modes

- **Missing files:** Exits with code 1. Lists all missing files with restore commands. Does not start the build pipeline.
- **Workpiece directory not found:** Exits with code 1. Error message: "Workpiece directory not found: missions/{missionId}/workpiece/".
- **Check command itself throws:** Non-fatal in `mission.validate` — logged as warning, build proceeds. This follows the same pattern as the Playwright pre-flight (RFC-0813).
- **No active mission:** Exits with code 0, reports `status: "pass"` with empty arrays. This is not an error — the command is only called when a mission is active.

## Rollout

1. **Create `workpiece-config-presence-check.ts`** in `packages/werkstatt/src/mission/`.
2. **Register command** in `mission.module.ts` as `workpiece.config.presence.check`.
3. **Integrate into `mission.validate`** before Playwright pre-flight (RFC-0813) and before `build.prepare`. Both pre-flight checks are skipped on the distribution-reuse path.
4. **Add unit tests** in `workpiece-config-presence-check.test.ts`.
5. **Existing sites:** No migration needed — the check is additive. If files are present (normal case), the check passes in <100ms.

## Alternatives considered

- **Extend `materialize.config.validate` (RFC-0840):** Rejected because `materialize.config.validate` is a workspace-scope check in `PACKAGES_CHECK_PIPELINE` that checks list sync (dead entries, unrecognized files). Adding per-workpiece presence checks would mix concerns. A dedicated pre-build gate is cleaner.

- **Add presence check to `build.prepare`:** Rejected because `build.prepare` is a pipeline that generates artifacts — adding a presence check there mixes validation with generation. The pre-flight section of `mission.validate` is the correct location for infrastructure checks.

- **Make `lighthouse.budget.check` and `image.delivery.validate` emit better errors when config is missing:** This is a good complementary improvement, but it doesn't solve the core problem — the build still runs for 10+ minutes before the error is reached. The pre-build gate is needed to fail fast.

- **Git-track operator config files in the workpiece:** Rejected per RFC-0840's analysis — these files are site-specific and git-tracking them causes merge conflicts during `mission.reconcile`.

## Risks

- **False sense of safety:** The check only verifies presence, not contents. A corrupted or empty `.lighthouse-budget-ignore` file will pass the check but still cause LH-12 errors. This is acceptable — content validation is the responsibility of the downstream validators.

- **New operator config files:** When a new file is added to `OPERATOR_CONFIG_FILES` via a future RFC, the presence check will automatically include it. No additional changes needed.

- **Performance:** The check is `existsSync` for each file — <1ms per file. With 2 files in `OPERATOR_CONFIG_FILES`, the total check takes <10ms. No performance concern.

## Acceptance criteria

- [ ] `workpiece.config.presence.check` command handler defined in `packages/werkstatt/src/mission/workpiece-config-presence-check.ts`
- [ ] Command registered in `mission.module.ts` with name `workpiece.config.presence.check` and scope `workspace`
- [ ] `mission.validate` calls the presence check before Playwright pre-flight and before `build.prepare`
- [ ] Missing files produce exit code 1 with restore commands in the output
- [ ] All files present produces exit code 0 with <100ms execution time
- [ ] Unit test: missing `.lighthouse-budget-ignore` fails with correct restore command
- [ ] Unit test: missing `src/image-delivery.config.yaml` fails with correct restore command
- [ ] Unit test: all files present passes
- [ ] Unit test: workpiece directory not found fails with clear error
- [ ] Presence check is skipped on the distribution-reuse path (same as RFC-0813)
- [ ] `mission.validate` fails within seconds when files are missing (not after 10+ minute build)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT add content validation to this check — presence only. Content validation belongs in the downstream validators.
- Agents MUST NOT make the check fatal if the command itself throws unexpectedly — follow the non-fatal pattern from RFC-0813.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0844 --reason "..." --invariant "DNA-N"` instead of working around it.
