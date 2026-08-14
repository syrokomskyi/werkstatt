---
id: RFC-0842
title: "Enforce sequential deployment pipeline (Dev → Alt → Main)"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-14
updatedAt: 2026-08-14
enhancedAt:
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-62
  - RFC-0628
  - RFC-0608
satisfies:
  - DNA-73
dependsOn: []
versionBump: patch
commands:
  proposed:
    - leitstand.pipeline.check
  added: []
  changed:
    - leitstand.dev-deploy
    - leitstand.propagate
    - leitstand.promote
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "`leitstand.dev-deploy`, `leitstand.propagate`, and `leitstand.promote` reject the `--all` CLI flag with an explicit error message."
  - "Each deployment command logs its target channel and URL before executing, so the operator can verify the deployment target."
  - "A new `leitstand.pipeline.check` command validates that a release is in the correct state for the requested deployment stage (ready → dev-deployed → alt-deployed → main-deployed)."
  - "The deployment workflow (`.devin/workflows/deploy.md`) documents the exact command syntax with all required flags."
  - "DNA-73 is established in `docs/architecture-dna.md` and `dna.registry.validate` passes."
nonGoals:
  - "This RFC does not add a `--channel` flag to `leitstand.propagate` — the channel is hardcoded to `alt` (RFC-0628 design decision). `leitstand.promote` handles alt→main."
  - "This RFC does not change the state machine (ready → dev-deployed → alt-deployed → main-deployed) — that is already enforced by state checks in each command."
  - "This RFC does not add multi-site deployment orchestration — deployment is always per-site, per-release."
  - "This RFC does not change the Axiom evidence gate or build-identity verification — those are existing gates that remain unchanged."
---

# RFC-0842: Enforce sequential deployment pipeline (Dev → Alt → Main)

## Context

During deployment of mission `warpgogol-com-m000055`, two issues occurred with `leitstand` commands:

1. **`leitstand.dev-deploy` failed with "no active mission"** — After `mission.close`, the mission is closed and `leitstand.dev-deploy` without `--release` fails. The `--release` flag is required for closed missions, but this is not obvious from the error message or the workflow documentation.

2. **`leitstand.propagate` was called with `--all`** — The `--all` CLI flag means "run for all sites", not "deploy to all channels". While `leitstand.propagate` hardcodes `channel: "alt"` (so `--all` is harmless for channel selection), it could cause the command to run for multiple sites simultaneously if multiple sites have releases in `ready` state. This is dangerous for deployment orchestration.

The operator's concern: **"нам нельзя деплоить на все каналы. у нас должен быть четкий процесс: сначала Dev, потом Alt и только потом Main."** The pipeline must be strictly sequential: Dev → Alt → Main, never all at once.

## Problem

### 1. `--all` flag on deployment commands is not rejected

The CLI parses `--all` as a global flag (`allSites = true`) and passes it to `executeKernelCommand`. The command runner uses `ensureTargetSites(workspaceRoot, allSites, siteName)` which returns ALL sites when `allSites: true`. For deployment commands (`leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`), this means:

- `leitstand.propagate --all --release <releaseId>` would try to propagate the release for ALL sites, not just the intended site. Since `--release` is a specific release ID, most sites would fail — but the intent is unclear and dangerous.
- `leitstand.dev-deploy --all` would try to deploy ALL sites to dev simultaneously.

All three commands have `supportsAllSites: false` in their module registration, but the CLI does not enforce this — `--all` is silently accepted and `allSites` is passed through.

### 2. Deployment target is not logged before execution

None of the three deployment commands log their target channel and URL before starting the deployment. The operator cannot verify the target until the command is already in progress. This is especially important for `leitstand.propagate` (alt) vs `leitstand.promote` (main) — a wrong command could deploy to the wrong channel.

### 3. Workflow documentation lacks exact command syntax

The `.devin/workflows/deploy.md` workflow documents the pipeline steps but does not include:
- The `--release` flag for `leitstand.dev-deploy` after mission close.
- The fact that `leitstand.propagate` does NOT accept `--site` (it reads `systemId` from the release manifest).
- The fact that `--all` must NOT be used on deployment commands.
- The exact state transitions (ready → dev-deployed → alt-deployed → main-deployed).

## Decision

### 1. Reject `--all` on deployment commands

Add an explicit check at the start of `runLeitstandDevDeploy`, `runLeitstandPropagate`, and `runLeitstandPromote`:

```ts
if (input.flags["all"] === true || input.flags["all"] === "true") {
  throw new Error(
    `[leitstand.${commandName}] --all is not supported on deployment commands. ` +
    `Deployment is always per-site, per-release. Use --site <siteId> and --release <releaseId>.`,
  );
}
```

Note: The CLI parses `--all` as a global flag and does not pass it in `input.flags`. The check needs to be at the CLI level or the `allSites` parameter needs to be checked in the command handler. Since `executeKernelCommand` passes `allSites` to `ensureTargetSites`, the check should be added to the command runner for commands with `supportsAllSites: false`.

**Implementation approach:** In `executeKernelCommand` (or the command runner), when `allSites: true` and the command has `supportsAllSites: false`, throw an explicit error:

```ts
if (options.allSites && command.supportsAllSites === false) {
  throw new Error(
    `[${commandName}] --all is not supported for this command. ` +
    `Use --site <siteId> to target a specific site.`,
  );
}
```

### 2. Log target channel and URL before execution

Each deployment command logs its target before starting:

```ts
logger.info(`  Target: channel=${channel}, url=${channelConfig.url}, worker=${channelConfig.workerName}`);
```

This is printed before the lock is acquired, so the operator sees it immediately.

### 3. `leitstand.pipeline.check` command

A new command that validates the deployment pipeline state for a release:

```sh
pnpm exec werkstatt run leitstand.pipeline.check --release <releaseId>
```

Output:
```
Release: warpgogol-com-r000026
State:   ready
Pipeline:
  [✓] mission.validate    — passed
  [✓] mission.reconcile   — reconciled
  [✓] mission.close       — closed
  [✓] release.prepare     — prepared
  [✓] release.ready       — ready
  [ ] leitstand.dev-deploy — not yet run (next step)
  [ ] leitstand.propagate  — requires dev-deployed
  [ ] leitstand.promote    — requires alt-deployed
```

This gives operators a clear view of where the release is in the pipeline and what the next step is.

### 4. Update deploy.md workflow

Update `.devin/workflows/deploy.md` with:
- Exact command syntax for each step (all required flags).
- State transition diagram.
- Explicit "NEVER use `--all` on deployment commands" in forbidden actions.
- `--release` flag for `leitstand.dev-deploy` after mission close.
- `leitstand.propagate` reads `systemId` from release manifest — `--site` is not needed.

## Architectural fit

- **Architecture DNA:** Establishes DNA-73 (Sequential deployment pipeline enforcement). Extends DNA-62 (Foundation File Integrity) with deployment safety guards.
- **Site OS operator model:** New `leitstand.pipeline.check` command for pipeline state inspection. Existing commands gain `--all` rejection and target logging.
- **RFC-0628 compatibility:** The channel hardcoding (`propagate = alt`, `promote = main`) is preserved. This RFC adds safety guards, not new channel selection.
- **Scaling Playbook:** Deployment is always per-site, per-release. Multi-site deployment is explicitly rejected.

## Design

### `--all` rejection

In `executeKernelCommand` (or the command dispatch layer), add:

```ts
if (options.allSites && command.supportsAllSites === false) {
  throw new Error(
    `[${commandName}] --all is not supported for this command. ` +
    `Use --site <siteId> to target a specific site.`,
  );
}
```

This is a generic guard that applies to ALL commands with `supportsAllSites: false`, not just deployment commands. This is safer and more consistent.

### Target logging

In each deployment command, after resolving the channel config and before acquiring the lock:

```ts
logger.info(`  Target: channel=${channel}, url=${channelConfig.url}, worker=${channelConfig.workerName}`);
```

### `leitstand.pipeline.check` command

```ts
interface PipelineCheckResult {
  command: "leitstand.pipeline.check";
  releaseId: string;
  systemId: string;
  releaseState: string;
  steps: Array<{
    step: string;
    status: "done" | "pending" | "blocked";
    detail?: string;
  }>;
  nextStep: string | null;
}
```

The command reads the release manifest and system state to determine which steps have been completed and what the next step is.

### Flag schema for `leitstand.pipeline.check`

| Flag | Kind | Required | Description |
| --- | --- | --- | --- |
| `--release` | string | yes | Release ID to check. |

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/kernel/runtime/execute-command.ts` | Extended with `--all` rejection for `supportsAllSites: false` |
| `packages/werkstatt/src/leitstand/leitstand-commands.ts` | Target logging added to all three deployment commands |
| `packages/werkstatt/src/leitstand/leitstand.module.ts` | New `leitstand.pipeline.check` command registered |
| `.devin/workflows/deploy.md` | Updated with exact command syntax and forbidden actions |

### Failure modes

- **`--all` on `supportsAllSites: false` command:** Explicit error: "`--all` is not supported for this command. Use `--site <siteId>` to target a specific site."
- **`leitstand.pipeline.check` on unknown release:** Error: "Release '<id>' not found."
- **`leitstand.pipeline.check` on release with no mission:** Steps show as "blocked" with detail "mission not found."

## Rollout

1. Add `--all` rejection to `executeKernelCommand`.
2. Add target logging to `leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`.
3. Implement `leitstand.pipeline.check`.
4. Update `.devin/workflows/deploy.md`.
5. Existing deployments are unaffected — the `--all` rejection only triggers when `--all` is explicitly passed.

## Alternatives considered

- **Remove `--all` from the CLI entirely:** Too broad — `--all` is useful for non-deployment commands (e.g., `sites list --all`, `workflow.lint --all`). The per-command rejection is more precise.
- **Add `--channel` flag to `leitstand.propagate`:** Explicitly rejected by RFC-0628 design. The channel is hardcoded to `alt` — `leitstand.promote` handles alt→main. Adding `--channel` would reintroduce the confusion this RFC aims to eliminate.
- **Make `leitstand.pipeline.check` a pipeline instead of a command:** A command is simpler — it reads state, it doesn't execute steps. A pipeline would imply side effects.

## Risks

- **`--all` rejection breaks existing scripts:** If any scripts or CI pipelines use `--all` with commands that have `supportsAllSites: false`, they will break. This is intentional — `--all` on these commands was always incorrect. The error message guides the fix.
- **`leitstand.pipeline.check` adds maintenance burden:** The command reads release state and system state — if the state schema changes, the command needs updating. This is a small, read-only command with minimal surface area.

## Acceptance criteria

- [ ] `executeKernelCommand` rejects `--all` when `supportsAllSites: false`
- [ ] `leitstand.dev-deploy` logs target channel + URL before execution
- [ ] `leitstand.propagate` logs target channel + URL before execution
- [ ] `leitstand.promote` logs target channel + URL before execution
- [ ] `leitstand.pipeline.check` command registered with `--release` flag
- [ ] `leitstand.pipeline.check` outputs step status and next step
- [ ] `.devin/workflows/deploy.md` updated with exact command syntax
- [ ] `.devin/workflows/deploy.md` forbids `--all` on deployment commands
- [ ] Unit test: `--all` on `supportsAllSites: false` command throws
- [ ] Unit test: `leitstand.pipeline.check` on `ready` release shows `dev-deploy` as next step
- [ ] DNA-73 entry appended to `docs/architecture-dna.md`
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0842` and commit the evidence file in the same commit.
- Agents MUST NOT add a `--channel` flag to `leitstand.propagate` — the channel is hardcoded to `alt` by design (RFC-0628). `leitstand.promote` handles alt→main.
- Agents MUST NOT remove `supportsAllSites: false` from deployment commands to work around the `--all` rejection — the flag is the safety guard.
