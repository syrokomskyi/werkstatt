---
id: RFC-0554
title: "Silent migration on Forge upgrade: detect version change and auto-migrate without operator intervention"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-27
updatedAt: 2026-07-27
enhancedAt: 2026-07-27
implementedAt: 2026-07-27
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0543
amendedBy: []
related:
  - RFC-0540
  - RFC-0543
  - RFC-0546
  - RFC-0547
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-54
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - forge.upgrade
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - "When @webgogol/forge is updated, the next forge-bootstrap invocation detects the version change"
  - "Upgrade migration runs silently inside forge-bootstrap without operator intervention or awareness"
  - "The existing forge.syncedVersion field in forge.yaml records the last-synced Forge version"
  - "forge.upgrade CLI remains available for manual sync alongside the silent session-start check"
  - "No operator-facing text mentions migration, version numbers, or upgrade mechanics"
nonGoals:
  - "Prompting the operator about migration — the migration is silent, no questions asked"
  - "Adding a separate forge.migrate CLI command — forge.upgrade already exists (RFC-0543)"
  - "Removing the forge.upgrade CLI command — it remains available for manual sync; the silent check reuses its internal logic"
  - "Reusing transplant migration adapters (RFC-0546) for upgrade migration — their interface is source-directory-oriented; upgrade migration uses forge.upgrade's existing skill-sync and binding-default logic"
  - "Running version check on every fo-skill invocation — only forge-bootstrap triggers the check to minimize overhead"
  - "Handling major version upgrades with breaking changes — those may require manual intervention and a separate migration guide"
  - "Rollback support — if migration fails, the operator can git-reset; Forge does not provide automatic rollback"
  - "Auto-committing migration changes silently — commits follow the register parameter: creative auto-commits, business asks first (consistent with existing forge-bootstrap behavior)"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app webgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0554: Silent migration on Forge upgrade: detect version change and auto-migrate without operator intervention

## Context

RFC-0543 established the npm publication and consumer upgrade contract for `@webgogol/forge`, including the `forge.upgrade` CLI command and the `forge.syncedVersion` field in `forge.yaml`. `forge.upgrade` already implements: version detection (comparing installed version vs `forge.syncedVersion`), skill sync (`.agents/skills/` from installed package), binding-default additions (RFC-0540), and `forge.syncedVersion` update.

However, `forge.upgrade` is a CLI command that the operator must know to run. After `pnpm update @webgogol/forge`, nothing automatically triggers `forge.upgrade` — the project's skills, binding defaults, and behavioral layer may be stale until the operator manually runs the command. This violates the barrier-free principle (RFC-0547): the operator should not need to know that a migration is needed.

## Problem

`forge.upgrade` (RFC-0543) provides the upgrade mechanism but not the trigger. After a consumer updates `@webgogol/forge`:

1. **No automatic trigger** — `forge.upgrade` exists but nothing invokes it automatically. The operator must know to run `forge upgrade` manually after `pnpm update`.

2. **Stale skills and bindings** — `.agents/skills/` copies, binding defaults, and the behavioral layer in `AGENTS.md` may be out of date until manual `forge.upgrade`.

3. **Operator burden** — the operator must know that an upgrade is needed and which command to run. This breaks the silent/automatic principle for a non-programming creator.

## Decision

The `forge-bootstrap` skill gains a silent version check at its start (step 0, before language selection). The check compares the installed `@webgogol/forge` version against `forge.syncedVersion` in `forge.yaml`. If they differ, `forge-bootstrap` silently runs `forge upgrade` (which internally invokes `runUpgrade` from `packages/forge/src/onboarding/upgrade.ts`) to sync skills, add missing binding defaults, and update `forge.syncedVersion`. The operator is not informed, asked, or interrupted — migration happens transparently before the skill's normal flow begins.

The `forge.upgrade` CLI command remains available for manual sync. This is not a dual-path — it is a single upgrade mechanism (`runUpgrade`) with two entry points: the CLI (operator-initiated) and `forge-bootstrap` (session-initiated, silent).

This RFC amends RFC-0543 by adding the silent session-start trigger to the existing `forge.upgrade` mechanism. No new fields, no new commands, no parallel migration path.

## Architectural fit

- **DNA-54 (Forge bindings contract)** — this RFC extends DNA-54 by ensuring binding defaults from `FORGE_CLI_BINDING_DEFAULTS` stay current without operator intervention. The silent `forge-bootstrap` check applies new binding defaults added in newer Forge versions, keeping the bindings contract in sync automatically.
- **RFC-0543** (npm publication and upgrade contract) — this RFC amends RFC-0543 by adding the silent `forge-bootstrap` trigger. `forge.upgrade`'s internal logic (`runUpgrade`) is reused as-is.
- **RFC-0540** (autonomous-mode binding defaults) — the silent upgrade applies new binding defaults from `FORGE_CLI_BINDING_DEFAULTS` without operator intervention.
- **RFC-0547** (barrier-free onboarding) — extends the silent/automatic principle to upgrades. The operator never needs to know that `forge.upgrade` exists.
- **RFC-0546** (migration-adapter registry) — not reused. Transplant adapters are source-directory-oriented (`detect(sourceDir)`, `migrate(sourceDir, targetDir)`); upgrade migration syncs skills and binding defaults, which is `forge.upgrade`'s existing responsibility.

## Design

### Version tracking (existing, unchanged)

`forge.yaml` already carries `forge.syncedVersion` (RFC-0543, `packages/forge/src/config/forge-config.ts:173`):

```yaml
forge:
  syncedVersion: 0.1.3   # written by forge.create, forge.upgrade, and now forge-bootstrap
```

No new field is added. `forge.syncedVersion` is the single version-tracking field, written by `forge.create` on first init and updated by `forge.upgrade` (and now by `forge-bootstrap`'s silent check).

### Silent version check in forge-bootstrap (step 0)

A new step 0 is added to the `forge-bootstrap` skill, before the existing step 1 (language selection):

1. Read `forge.yaml`. If absent, the skill's existing guardrail refuses — no change.
2. Read `forge.syncedVersion` from `forge.yaml`. If absent or `null`, treat as "never synced".
3. Resolve the installed `@webgogol/forge` version via `resolveForgeRoot` + `readForgePackageVersion` (existing functions in `packages/forge/src/onboarding/upgrade.ts`).
4. If `forge.syncedVersion` equals the installed version — skip to step 1 (language selection), no migration needed.
5. If versions differ (or `syncedVersion` is `null`) — silently invoke `runUpgrade` from `packages/forge/src/onboarding/upgrade.ts` with `dryRun: false`. This syncs `.agents/skills/`, adds missing binding defaults, updates `forge.syncedVersion`, and runs `forge.doctor` — all existing `forge.upgrade` behavior.
6. If `runUpgrade` succeeds — proceed to step 1 (language selection) as if nothing happened.
7. If `runUpgrade` fails — log the error to the session log (not shown to the operator), proceed with the old configuration. `forge.syncedVersion` is not updated, so the next `forge-bootstrap` invocation will retry.

The operator sees no text about migration, version numbers, or upgrade mechanics. The skill proceeds directly to language selection as if step 0 never ran.

### TypeScript contracts

```ts
// packages/forge/src/onboarding/upgrade.ts — existing, reused as-is
export async function runUpgrade(
  input: ForgeCommandInput,
  context: ForgeRuntimeContext,
): Promise<ForgeCommandResult<UpgradeResult>>;

// packages/forge/skills/meta/forge-bootstrap/SKILL.md — new step 0 instruction
// The skill instructs the agent to:
//   1. Read forge.yaml and forge.syncedVersion
//   2. Compare against installed @webgogol/forge version
//   3. If different, run `forge upgrade` CLI silently (output not shown to operator)
//      — internally invokes runUpgrade, which syncs skills, adds binding defaults,
//        updates forge.syncedVersion, and runs forge.doctor
//   4. Proceed to step 1 regardless of success/failure
```

No new TypeScript types are introduced. The silent check reuses `runUpgrade`, `resolveForgeRoot`, `readForgePackageVersion`, and `loadForgeConfig` — all existing exports from `packages/forge/src/onboarding/upgrade.ts` and `packages/forge/src/config/forge-config.ts`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/meta/forge-bootstrap/SKILL.md` | Add step 0: silent version check + `runUpgrade` invocation before language selection |
| `packages/forge/src/onboarding/upgrade.ts` | No changes — `runUpgrade` is reused as-is |
| `packages/forge/src/config/forge-config.ts` | No changes — `forge.syncedVersion` already exists |
| `packages/forge/AGENTS.md` | Document the silent `forge-bootstrap` trigger in the `forge.upgrade` section |

### Output format

The silent check produces no operator-facing output. Internally, the `runUpgrade` result (`UpgradeResult`) is available to the agent for session-log purposes:

```json
{
  "command": "forge.upgrade",
  "status": "pass",
  "fromVersion": "0.1.2",
  "toVersion": "0.1.3",
  "skillsUpdated": ["fo-idea", "fo-idea-create-rfc"],
  "bindingsAdded": [],
  "doctorReport": { "status": "pass", "notices": [] }
}
```

If `runUpgrade` fails, the error is logged to the session log with `status: "fail"` and the error message. The operator never sees this.

### Failure modes

- **`runUpgrade` fails** — log the error to the session log (not shown to the operator), continue with the old configuration. `forge.syncedVersion` is not updated. The next `forge-bootstrap` invocation retries. The operator is not interrupted.
- **`forge.yaml` missing `forge.syncedVersion`** — `runUpgrade` already handles this: `fromVersion === null` triggers a full sync (RFC-0543, `packages/forge/src/onboarding/upgrade.ts:265`). No special handling needed.
- **`node_modules/@webgogol/forge` not found** — `resolveForgeRoot` throws. The skill catches the error, logs it, and proceeds to step 1. Forge may not be installed as a dependency yet (e.g. fresh checkout before `pnpm install`).
- **Major version upgrade with breaking changes** — `runUpgrade` syncs skills and binding defaults but cannot handle structural breaking changes (e.g. renamed config fields). The operator may need to re-run `forge create` or `forge-bootstrap` manually. This is documented as a limitation in nonGoals.
- **Concurrent execution** — two agents running `forge-bootstrap` simultaneously could trigger `runUpgrade` at the same time. `runUpgrade` overwrites `.agents/skills/` files and updates `forge.yaml` — concurrent runs may produce a partial write. Mitigation: `runUpgrade` is idempotent (overwrite semantics); a concurrent run that completes after the other produces the same final state. The `forge.yaml` write is a single `writeFileSync` — last writer wins, and both writers write the same version.
- **Interrupted mid-upgrade** — if the session is interrupted during `runUpgrade`, `.agents/skills/` may be partially synced and `forge.syncedVersion` may not be updated. The next `forge-bootstrap` invocation detects the version mismatch again and retries. `runUpgrade` is idempotent (overwrite semantics, RFC-0543).

## Rollout

- **Default behavior**: silent version check runs at the start of every `forge-bootstrap` invocation. No opt-in flag.
- **Existing projects**: `forge.yaml` with stale or absent `forge.syncedVersion` triggers a full `runUpgrade` on the next `forge-bootstrap` invocation.
- **New projects**: `forge.create` writes `forge.syncedVersion` on first init (RFC-0543, already implemented). The first `forge-bootstrap` invocation finds versions match and skips migration.
- **Integration**: runs inside `forge-bootstrap` (agent chat), not as a CLI command or build pipeline step. The `forge.upgrade` CLI remains available for manual sync.

## Alternatives considered

1. **Prompt the operator to run `forge upgrade`** — rejected because the operator should not need to know about migration or CLI commands. Forge handles it silently.

2. **Separate `forge.migrate` CLI command** — rejected because `forge.upgrade` already exists (RFC-0543) and does exactly this. A second command duplicates the mechanism.

3. **Migration only on `forge-bootstrap` re-run without version check** — rejected because the operator may not know to re-run `forge-bootstrap`. Automatic version detection is more reliable.

4. **Remove `forge.upgrade` CLI, use only silent check** — rejected because the CLI provides a manual recovery path for operators who want to force a sync. Two entry points sharing one mechanism (`runUpgrade`) is not a dual-path.

5. **Run version check on every fo-skill invocation** — rejected for performance. `forge-bootstrap` is the natural entry point (it already reads `forge.yaml`); other skills should not incur upgrade-check overhead.

6. **Reuse transplant migration adapters (RFC-0546) for upgrade migration** — rejected. Transplant adapters are source-directory-oriented (`detect(sourceDir)`, `migrate(sourceDir, targetDir)`). Upgrade migration syncs skills and binding defaults — a fundamentally different operation already handled by `forge.upgrade`.

## Risks

- **Silent migration breaks something** — the operator may not realize what changed. Mitigation: `runUpgrade` is idempotent and tested (RFC-0543). If something breaks, the operator can `git reset` — the migration changes are committed files.
- **Performance impact** — version check runs on every `forge-bootstrap` invocation. Mitigation: it is two file reads (`forge.yaml` + `package.json`) and a string comparison. The full `runUpgrade` only runs when versions differ — once after each `pnpm update @webgogol/forge`.
- **Major version upgrades** — `runUpgrade` may not cover all breaking changes. Mitigation: documented as a nonGoal; major upgrades may require manual re-bootstrap.
- **Agent misinterpretation** — agents may ask the operator about migration or report version numbers. Mitigation: the SKILL.md must explicitly state that migration is silent, no questions are asked, and no version information is shown to the operator.
- **Concurrent `forge-bootstrap` runs** — two agents triggering `runUpgrade` simultaneously. Mitigation: `runUpgrade` is idempotent; last writer wins with the same version. Accepted residual risk.

## Acceptance criteria

- [x] `forge-bootstrap` SKILL.md includes a step 0 (before language selection) that checks `forge.syncedVersion` against the installed `@webgogol/forge` version (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:45-55, forge.skill.validate pass)
- [x] When versions differ, `forge-bootstrap` silently runs `forge upgrade` (which internally invokes `runUpgrade`) to sync skills, add missing binding defaults, and update `forge.syncedVersion` (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:53, runUpgrade in packages/forge/src/onboarding/upgrade.ts:97-357, 281 tests pass)
- [x] The silent check produces no operator-facing text about migration, version numbers, or upgrade mechanics (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:40,55, guardrail "never informs the operator about migration")
- [x] `forge.syncedVersion` is updated in `forge.yaml` after successful silent upgrade (evidence: runUpgrade calls updateSyncedVersion in packages/forge/src/onboarding/upgrade.ts:330, existing test "syncedVersion should be updated" passes)
- [x] If `runUpgrade` fails, the error is logged to the session log and the skill proceeds with the old configuration without interrupting the operator (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:54, "log the error to the session log, proceed with old configuration")
- [x] `forge.upgrade` CLI command remains available and functional for manual sync (evidence: packages/forge/AGENTS.md:16, forgeCoreModule registers forge.upgrade, existing upgrade tests pass)
- [x] `forge-bootstrap` SKILL.md explicitly states that migration is silent and no questions are asked (agent misinterpretation guard) (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:40-41, two guardrails added)
- [x] `rfc.validate` passes on this file before merging (evidence: pnpm exec forge rfc.validate --id RFC-0554 --json, zero RFC-0554 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT inform the operator about migration, version numbers, or upgrade mechanics — migration is silent.
- Agents MUST NOT ask the operator for permission to migrate — migration runs automatically at `forge-bootstrap` step 0.
- Agents MUST NOT skip the version check at `forge-bootstrap` step 0 — it is mandatory.
- Agents MUST NOT add a new `forgeVersion` field to `forge.yaml` — the existing `forge.syncedVersion` (RFC-0543) is the single version-tracking field.
- Agents MUST NOT create a parallel migration mechanism — `runUpgrade` from `packages/forge/src/onboarding/upgrade.ts` is the single upgrade logic, invoked silently from `forge-bootstrap`.
- Agents MUST NOT remove the `forge.upgrade` CLI command — it remains available for manual sync.
- Agents MUST NOT reuse transplant migration adapters (RFC-0546) for upgrade migration — their interface is source-directory-oriented and does not apply.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
