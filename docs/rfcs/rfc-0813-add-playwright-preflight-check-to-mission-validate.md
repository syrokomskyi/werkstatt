---
id: RFC-0813
title: "Add Playwright pre-flight check to mission.validate"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-12
updatedAt: 2026-08-12
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

During the warpgogol-com-m000050 release, `mission.validate` ran for ~2 minutes through
203 build.check steps and the Astro build, then failed at `playwright.chromium.ensure`
in build.post because Playwright Chromium was not installed. The auto-install attempt
downloaded 184 MB and failed at 42%, costing another 2 minutes.

The operator then ran `pnpm exec playwright install chromium` manually and re-ran
`mission.validate` — a full 4-minute cycle wasted on a missing prerequisite.

## Problem

`mission.validate` does not check for Playwright Chromium availability before starting
the expensive build.check and Astro build pipeline. The `playwright.chromium.ensure`
step is step 1 of the `build.post` pipeline, which runs **after** the full build.check
pipeline (203 steps) and the Astro build. By the time the missing Chromium is detected,
2–4 minutes have already been spent.

The existing `playwright.chromium.ensure` step (RFC-0647) attempts auto-install when
Chromium is missing, but the auto-install can fail (network issues, disk space, timeout).
A pre-flight check would detect the missing prerequisite before any work is done and
provide a clear error message with the install command.

## Decision

Add a `playwright.preflight.check` command that runs as the **first step** of
`mission.validate`, before `build.check`. The command:

1. Checks if Playwright Chromium is installed (using the same detection logic as
   `playwright.chromium.ensure`).
2. If installed: passes silently (0ms).
3. If not installed: fails immediately with a clear error message:
   ```
   [ERROR] playwright.preflight.check: Playwright Chromium is not installed.
   Run: pnpm exec playwright install chromium
   ```
4. Does **not** attempt auto-install — that is `playwright.chromium.ensure`'s job.
   The pre-flight check is a fast fail, not a remediation step.

## Architectural fit

- **RFC-0647 (Playwright Chromium auto-install)**: The pre-flight check uses the same
  Chromium detection logic but does not attempt installation. It complements
  `playwright.chromium.ensure` by catching the missing prerequisite early.
- **Pure function split (DNA pattern)**: The Chromium detection logic should be
  extracted into a pure function `isChromiumInstalled(workspaceRoot: string): boolean`
  that both `playwright.preflight.check` and `playwright.chromium.ensure` can use.

## Design

### CLI surface

The command is not typically run directly — it is a pipeline step. But it can be run
standalone for debugging:

```sh
pnpm exec werkstatt run playwright.preflight.check --site warpgogol-com
```

### TypeScript contracts

```ts
// Pure function shared with playwright.chromium.ensure
function isChromiumInstalled(workspaceRoot: string): boolean;

// Thin kernel handler
async function runPlaywrightPreflightCheck(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  if (isChromiumInstalled(context.workspaceRoot)) {
    return { data: { command: "playwright.preflight.check", status: "pass" }, exitCode: 0, summary: "ok" };
  }
  return {
    data: { command: "playwright.preflight.check", status: "fail" },
    exitCode: 1,
    summary: "Playwright Chromium is not installed. Run: pnpm exec playwright install chromium",
  };
}
```

### File system responsibilities

| Path | Role |
|---|---|
| `packages/werkstatt-site/src/checks/playwright-preflight.ts` | New command implementation |
| `packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts` | Extract `isChromiumInstalled` pure function |
| `packages/werkstatt-site/src/checks/command-tables/*.ts` | Register `playwright.preflight.check` |
| Mission validate pipeline definition | Add as first step |

### Output format

```json
{
  "command": "playwright.preflight.check",
  "status": "fail",
  "summary": "Playwright Chromium is not installed. Run: pnpm exec playwright install chromium"
}
```

### Failure modes

- **Chromium not installed**: Exit code 1, clear error message with install command.
- **Chromium installed**: Exit code 0, silent pass.
- **Detection error** (e.g. Playwright cache directory unreadable): Treat as not
  installed — fail safe. The operator can investigate.

## Rollout

- **Default behavior**: The pre-flight check is always active in `mission.validate`.
  If Chromium is installed (the common case), it is a 0ms silent pass.
- **No grace period**: Missing Chromium is always a hard failure. There is no reason
  to allow `mission.validate` to proceed without it — build.post will fail anyway.
- **Other pipelines**: `build.check` standalone does not need this check (it does not
  run Playwright). `build.post` standalone already has `playwright.chromium.ensure`.

## Alternatives considered

- **Making `playwright.chromium.ensure` non-fatal**: Rejected — build.post steps that
  depend on Chromium (behavior snapshots, evidence capture) would fail with confusing
  errors instead of a clear "Chromium not installed" message.
- **Auto-installing in pre-flight**: Rejected — auto-install can take 30+ seconds and
  may fail. The operator should explicitly run `pnpm exec playwright install chromium`
  to have control over the installation.
- **Checking in `mission.materialize` instead**: Rejected — materialize may run in
  environments where Playwright is not needed (e.g. content-only missions). The check
  belongs in `mission.validate` which always runs the full build pipeline.

## Risks

- **False negative**: If the Chromium detection logic is incorrect, `mission.validate`
  may fail even when Chromium is installed. Mitigated by using the same detection logic
  as `playwright.chromium.ensure` — if the detection is wrong, both commands are wrong
  and the issue would have been caught anyway.
- **Added step to pipeline**: One additional step at the start of `mission.validate`.
  When Chromium is installed (the common case), it adds ~0ms. When not installed, it
  saves 2–4 minutes.

## Acceptance criteria

- [ ] `playwright.preflight.check` command registered
- [ ] `isChromiumInstalled` pure function extracted and shared
- [ ] Runs as first step of `mission.validate`
- [ ] Fails fast with clear error message when Chromium is missing
- [ ] Silent pass when Chromium is installed
- [ ] Unit test: missing Chromium → exit code 1
- [ ] Unit test: installed Chromium → exit code 0
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The `isChromiumInstalled` function should be extracted from the existing
  `playwright.chromium.ensure` implementation — do not write a new detection logic.
- The pre-flight check should be scoped to `workspace` (Chromium is installed
  per-workspace, not per-site).
- When adding to the mission.validate pipeline, place it before `build.check` — the
  earliest possible point.
