---
id: RFC-0813
title: "Add Playwright pre-flight check to mission.validate"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-12
updatedAt: 2026-08-12
enhancedAt: 2026-08-12
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0647
satisfies: []
versionBump: patch
commands:
  proposed:
    - "playwright.preflight.check"
  added: []
  changed:
    - "mission.validate"
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
  - "@warpgogol/werkstatt"
successSignals:
  - "mission.validate fails fast when Playwright Chromium is not installed"
  - "Pre-flight check runs before build.check pipeline"
  - "Error message includes install command"
nonGoals:
  - "Auto-installing Chromium during mission.validate"
  - "Checking other Playwright browsers (Firefox, WebKit)"
  - "Changing playwright.chromium.ensure behavior"
acceptance:
  - probe: command-registered
    name: "playwright.preflight.check"
---

# RFC-0813: Add Playwright pre-flight check to mission.validate

## Context

During the warpgogol-com-m000050 release, `mission.validate` ran for ~2 minutes through 203 build.check steps and the Astro build, then failed at `playwright.chromium.ensure` in build.post because Playwright Chromium was not installed. The auto-install attempt downloaded 184 MB and failed at 42%, costing another 2 minutes.

The operator then ran `pnpm exec playwright install chromium` manually and re-ran `mission.validate` — a full 4-minute cycle wasted on a missing prerequisite.

## Problem

`mission.validate` does not check for Playwright Chromium availability before starting the expensive build.check and Astro build pipeline. The `playwright.chromium.ensure` step is step 1 of the `build.post` pipeline, which runs **after** the full build.check pipeline (203 steps) and the Astro build. By the time the missing Chromium is detected, 2–4 minutes have already been spent.

The existing `playwright.chromium.ensure` step (RFC-0647) attempts auto-install when Chromium is missing, but the auto-install can fail (network issues, disk space, timeout). A pre-flight check would detect the missing prerequisite before any work is done and provide a clear error message with the install command.

## Decision

Add a `playwright.preflight.check` command that runs as the **first operation** inside `runMissionValidate` (the command handler for `mission.validate`), after the distribution-reuse check and before `build.prepare`. The command:

1. Checks if Playwright Chromium is installed (using the same detection logic as `playwright.chromium.ensure` — a `chromium.launch()` attempt).
2. If installed: passes silently (sub-second — one browser launch + close).
3. If not installed: fails immediately with a clear error message that includes the original launch error so the operator can distinguish "binary not found" from "sandbox/library issues":
   ```
   [ERROR] playwright.preflight.check: Playwright Chromium is not installed.
   Launch error: <original error message>
   Run: pnpm exec playwright install chromium
   ```
4. Does **not** attempt auto-install — that is `playwright.chromium.ensure`'s job. The pre-flight check is a fast fail, not a remediation step.

## Architectural fit

- **RFC-0647 (Playwright Chromium auto-install)**: The pre-flight check uses the same Chromium detection logic but does not attempt installation. It complements `playwright.chromium.ensure` by catching the missing prerequisite early.
- **Pure function split (DNA pattern)**: The Chromium detection logic should be extracted into an async pure function `isChromiumInstalled(workspaceRoot: string): Promise<{ installed: boolean; error?: string }>` that both `playwright.preflight.check` and `playwright.chromium.ensure` can use. The function returns the original launch error so callers can produce actionable diagnostics.

## Design

### CLI surface

The command is not typically run directly — it is called inside `runMissionValidate`. But it can be run standalone for debugging:

```sh
pnpm exec werkstatt run playwright.preflight.check --site warpgogol-com
```

### TypeScript contracts

```ts
// Pure function shared with playwright.chromium.ensure
// Returns the original launch error so callers can distinguish "binary not found"
// from "sandbox/library issues".
async function isChromiumInstalled(
  workspaceRoot: string,
): Promise<{ installed: boolean; error?: string }>;

// Thin kernel handler
async function runPlaywrightPreflightCheck(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const { installed, error } = await isChromiumInstalled(context.workspaceRoot);
  if (installed) {
    return { data: { command: "playwright.preflight.check", status: "pass" }, exitCode: 0, summary: "ok" };
  }
  return {
    data: { command: "playwright.preflight.check", status: "fail", error },
    exitCode: 1,
    summary: `Playwright Chromium is not installed. Launch error: ${error ?? "unknown"}. Run: pnpm exec playwright install chromium`,
  };
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/checks/playwright-preflight.ts` | New command implementation |
| `packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts` | Extract `isChromiumInstalled` pure function |
| `packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts` | Register `playwright.preflight.check` |
| `packages/werkstatt-site/src/checks/index.ts` | Re-export `isChromiumInstalled` for cross-package import |
| `packages/werkstatt/src/mission/mission-materialization-commands.ts` | Insert preflight call in `runMissionValidate`, after distribution-reuse check, before `build.prepare` |

### Output format

```json
{
  "command": "playwright.preflight.check",
  "status": "fail",
  "error": "Executable doesn't exist at /path/to/chromium",
  "summary": "Playwright Chromium is not installed. Launch error: Executable doesn't exist at /path/to/chromium. Run: pnpm exec playwright install chromium"
}
```

### Failure modes

- **Chromium not installed**: Exit code 1, error message includes original launch error and install command.
- **Chromium installed**: Exit code 0, silent pass.
- **Launch failure (non-installation cause)**: Exit code 1, error message includes the original launch error (e.g. sandbox/lib issues) so the operator can distinguish "run `playwright install chromium`" from "install OS dependencies like `libnss3`".

## Rollout

- **Default behavior**: The pre-flight check is always active in `mission.validate` on the full-build path (not the distribution-reuse path). If Chromium is installed (the common case), it is a sub-second silent pass (one browser launch + close).
- **Distribution-reuse path**: When `build-input-hash` matches and the distribution is reused, `build.post` is not run, so Chromium is not needed. The pre-flight check is skipped on this path to avoid a wasteful browser launch.
- **No grace period**: Missing Chromium is always a hard failure on the full-build path. There is no reason to allow `mission.validate` to proceed without it — build.post will fail anyway.
- **Other pipelines**: `build.check` standalone does not need this check (it does not run Playwright). `build.post` standalone already has `playwright.chromium.ensure`.

## Alternatives considered

- **Making `playwright.chromium.ensure` non-fatal**: Rejected — build.post steps that depend on Chromium (behavior snapshots, evidence capture) would fail with confusing errors instead of a clear "Chromium not installed" message.
- **Auto-installing in pre-flight**: Rejected — auto-install can take 30+ seconds and may fail. The operator should explicitly run `pnpm exec playwright install chromium` to have control over the installation.
- **`--check-only` flag on existing `playwright.chromium.ensure`**: Rejected — `playwright.chromium.ensure` is non-fatal (returns exitCode 0 even after auto-install), while the pre-flight check must be fatal (exitCode 1 when Chromium is missing). A flag would conflate two fundamentally different exit semantics in one command. A separate command keeps the contract clear: `ensure` = check + remediate (non-fatal), `preflight.check` = check only (fatal).
- **Checking in `mission.materialize` instead**: Rejected — materialize may run in environments where Playwright is not needed (e.g. content-only missions). The check belongs in `mission.validate` which always runs the full build pipeline.

## Risks

- **False negative**: If the Chromium detection logic is incorrect, `mission.validate` may fail even when Chromium is installed. Mitigated by using the same detection logic as `playwright.chromium.ensure` — if the detection is wrong, both commands are wrong and the issue would have been caught anyway.
- **Added step to mission.validate**: One additional browser launch + close at the start of the full-build path. When Chromium is installed (the common case), it adds ~100–500ms. When not installed, it saves 2–4 minutes.
- **False positive on launch failure**: `chromium.launch()` can fail for reasons other than missing installation (sandbox issues, missing shared libraries). Mitigated by including the original launch error in the output so the operator can distinguish "binary not found" from "OS dependency issues".

## Acceptance criteria

- [ ] `playwright.preflight.check` command registered in `infra-contracts.ts`
- [ ] `isChromiumInstalled` async pure function extracted and shared
- [ ] Runs as first operation inside `runMissionValidate`, after distribution-reuse check, before `build.prepare`
- [ ] Fails fast with clear error message (including original launch error) when Chromium is missing
- [ ] Silent pass when Chromium is installed
- [ ] Skipped on distribution-reuse path (no browser launch when distribution is reused)
- [ ] Unit test: missing Chromium → exit code 1
- [ ] Unit test: installed Chromium → exit code 0
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The `isChromiumInstalled` function should be extracted from the existing `playwright.chromium.ensure` implementation — do not write new detection logic. The existing `ensureChromium` function already does a `chromium.launch()` check as its first phase — extract that phase into `isChromiumInstalled`.
- The pre-flight check should be scoped to `workspace` (Chromium is installed per-workspace, not per-site).
- When adding to `runMissionValidate`, place the preflight call after the distribution-reuse early-return block and before the `build.prepare` pipeline invocation — the earliest possible point on the full-build path.
- The pre-flight check is a direct `executeKernelCommand` or function call inside `runMissionValidate`, not a pipeline step. `mission.validate` is a command handler, not a pipeline.
