---
id: RFC-0579
title: "Add nextSteps to mission.validate and archive commands"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-07-28
updatedAt: 2026-07-28
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0542
  - RFC-0356
  - RFC-0573
  - RFC-0578
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-35
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
    - mission.validate
    - rfc.archive
    - adr.archive
    - plan.archive
    - audit.archive
    - session.archive
    - mission.archive
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel"
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/forge"
successSignals:
  - "mission.validate result includes nextSteps array with pass/fail/dirty guidance"
  - "All 6 archive command handlers populate nextSteps"
  - "KernelCommandResult includes optional nextSteps field"
nonGoals:
  - "Does not change the validation logic of mission.validate"
  - "Does not change the archival logic of any archive command"
  - "Does not add nextSteps to pass-state validators (RFC-0542 allows empty array)"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
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

# RFC-0579: Add nextSteps to mission.validate and archive commands

## Context

RFC-0542 established the `nextSteps` field on `ForgeCommandResult` — a cross-cutting array of `{ action: string, kind: "required" | "optional" }` entries that tell the operator or agent what to do next. Forge CLI commands (`forge.create`, `forge.scaffold`, `forge.doctor`, `forge.port.scaffold`) populate it. The forge CLI renders it as a "Next steps:" block in pretty mode and includes it in `--json` output.

However, `nextSteps` is absent from `KernelCommandResult` in `@warpgogol/site-kernel` (`packages/os/site-kernel/src/types.ts:149-154`). Site OS commands like `mission.validate` cannot populate it. The site-kernel CLI does not render a "Next steps:" block.

Additionally, the 6 archive command handlers (`rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive`, `session.archive`, `mission.archive`) use `ForgeCommandResult` but omit the `nextSteps` field. RFC-0542 states lifecycle commands MUST populate `nextSteps` — archive commands are state-mutating commands that benefit from next-step guidance (e.g., "Run `mission.list` to verify active missions").

## Problem

DNA-35 (`app.contract.full` as the canonical readiness signal) requires `mission.validate` to pass before `mission.close`. When validation fails, the result contains diagnostics and a summary string but no `nextSteps` — the agent must infer what to do next from the error messages. When validation passes but the workpiece is dirty (uncommitted changes), a warning is logged but no structured next-step guidance is provided.

The 6 archive command handlers omit `nextSteps` entirely. After archiving, the operator or agent gets a summary string but no guidance on what to verify or do next.

This creates a gap between the forge CLI (which has `nextSteps`) and the site-kernel CLI (which does not). Agents working across both surfaces get inconsistent guidance.

## Decision

`KernelCommandResult` in `@warpgogol/site-kernel` gains an optional `nextSteps` field (same shape as `ForgeNextStep` in forge). `mission.validate` populates `nextSteps` based on pass/fail/dirty states. All 6 archive command handlers populate `nextSteps` with post-archive verification guidance. The site-kernel CLI renders `nextSteps` as a "Next steps:" block in pretty mode, matching the forge CLI rendering.

## Architectural fit

- **DNA-35 (`app.contract.full`):** `mission.validate` is the readiness gate. `nextSteps` makes the gate output actionable — agents know exactly what to do after pass, fail, or dirty states.
- **RFC-0542 (self-documenting output contract):** This RFC extends the `nextSteps` contract from forge-only to site-kernel, closing the consistency gap between the two CLI surfaces.
- **RFC-0356 (mission lifecycle):** `mission.validate` is defined by RFC-0356. This RFC enriches its output without changing its gating behavior.
- **RFC-0573 (mission.archive):** Added `mission.archive` command. This RFC adds `nextSteps` to it.
- **Site OS operator model:** No new commands. `KernelCommandResult` gains a field; 7 existing handlers populate it; the CLI renders it.
- **Scaling Playbook:** Applies uniformly — all sites use the same mission lifecycle and archive commands.

## Design

### CLI surface

No CLI surface changes. All commands are invoked identically. The pretty-mode output gains a "Next steps:" block after the summary when `nextSteps` is non-empty.

### TypeScript contracts

#### KernelCommandResult extension

In `packages/os/site-kernel/src/types.ts`:

```ts
export interface KernelNextStep {
  action: string;
  kind: "required" | "optional";
}

export interface KernelCommandResult<TData = unknown> {
  data?: TData;
  exitCode?: number;
  summary?: string;
  timing?: KernelCommandTiming;
  nextSteps?: KernelNextStep[];
}
```

The `KernelNextStep` shape mirrors `ForgeNextStep` exactly — same field names, same `kind` enum. This allows agents to parse both surfaces uniformly.

#### mission.validate nextSteps

In `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts`:

```ts
// On validation failure (static checks or build):
nextSteps: [
  { action: "Fix the failing validators above, then re-run: pnpm exec site-kernel run mission.validate --mission <id>", kind: "required" },
]

// On validation pass with dirty workpiece:
nextSteps: [
  { action: "Commit uncommitted changes: pnpm exec site-kernel run mission.git.commit --mission <id> --message \"<msg>\"", kind: "required" },
  { action: "Then run: pnpm exec site-kernel run mission.reconcile --mission <id>", kind: "optional" },
]

// On validation pass with clean workpiece:
nextSteps: [
  { action: "Run: pnpm exec site-kernel run mission.reconcile --mission <id>", kind: "optional" },
  { action: "Then run: pnpm exec site-kernel run mission.close --mission <id>", kind: "optional" },
]
```

#### Archive command nextSteps

Each archive handler gains:

```ts
// rfc.archive
nextSteps: [{ action: "Run: pnpm exec site-kernel run rfc.list --json to verify archive status", kind: "optional" }]

// adr.archive
nextSteps: [{ action: "Run: pnpm exec site-kernel run adr.list --json to verify archive status", kind: "optional" }]

// plan.archive
nextSteps: [{ action: "Run: pnpm exec site-kernel run plan.list --json to verify archive status", kind: "optional" }]

// audit.archive
nextSteps: [{ action: "Run: pnpm exec site-kernel run audit.list --json to verify archive status", kind: "optional" }]

// session.archive
nextSteps: [{ action: "Run: pnpm exec site-kernel run session.list --json to verify archive status", kind: "optional" }]

// mission.archive
nextSteps: [{ action: "Run: pnpm exec site-kernel run mission.list --json to verify active missions", kind: "optional" }]
```

#### CLI rendering

In `packages/os/site-kernel/src/runtime/execute-command.ts` (or the pretty-mode printer), add rendering for `nextSteps`:

```ts
function renderNextSteps(steps?: KernelNextStep[]): string {
  if (!steps || steps.length === 0) return "";
  const lines = ["\nNext steps:"];
  for (const step of steps) {
    const prefix = step.kind === "required" ? "*" : " ";
    lines.push(`  ${prefix} ${step.action}`);
  }
  return lines.join("\n");
}
```

This matches the forge CLI rendering (RFC-0542 `renderNextSteps` in `packages/forge/src/cli-output.ts`).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/types.ts` | Add `KernelNextStep` interface and `nextSteps?` field to `KernelCommandResult` |
| `packages/os/site-kernel/src/runtime/execute-command.ts` | Render `nextSteps` in pretty mode |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Populate `nextSteps` in `mission.validate` result |
| `packages/forge/os/rfc/handlers/` | Populate `nextSteps` in `rfc.archive` handler |
| `packages/forge/os/adr/handlers/` | Populate `nextSteps` in `adr.archive` handler |
| `packages/forge/src/` (plan, audit, session, mission archive handlers) | Populate `nextSteps` in respective archive handlers |

### Output format

Before (mission.validate, `--json`):

```json
{
  "command": "mission.validate",
  "status": "pass",
  "data": { "missionId": "...", "contractFull": { "passed": true } },
  "summary": "[mission.validate] warpgogol-com-m000016 validation passed (12 steps, 42 routes built)"
}
```

After:

```json
{
  "command": "mission.validate",
  "status": "pass",
  "data": { "missionId": "...", "contractFull": { "passed": true } },
  "summary": "[mission.validate] warpgogol-com-m000016 validation passed (12 steps, 42 routes built)",
  "nextSteps": [
    { "action": "Run: pnpm exec site-kernel run mission.reconcile --mission warpgogol-com-m000016", "kind": "optional" },
    { "action": "Then run: pnpm exec site-kernel run mission.close --mission warpgogol-com-m000016", "kind": "optional" }
  ]
}
```

### Failure modes

- `nextSteps` is optional — commands that don't populate it are unaffected.
- The pretty-mode printer checks `result.nextSteps` existence before rendering — no crash if absent.
- The `--json` output includes `nextSteps` as an empty array if not populated (matching forge CLI behavior).
- Archive command `nextSteps` are all `kind: "optional"` — archiving is terminal, verification is recommended but not required.

## Rollout

- **No flag day.** `nextSteps` is optional on `KernelCommandResult`. Existing commands that don't populate it are unaffected — the field is absent, the printer skips rendering.
- **mission.validate** populates `nextSteps` in all three states (pass, fail, dirty). Agents get structured guidance immediately.
- **Archive commands** populate `nextSteps` with a single optional verification step. Low risk — the archival already succeeded.
- **CLI rendering** is additive — the "Next steps:" block appears only when `nextSteps` is non-empty. Existing output is unchanged.
- **Forge CLI** already renders `nextSteps` (RFC-0542). Site-kernel CLI gains the same rendering, creating a consistent experience across both surfaces.
- **`--json` output** includes `nextSteps` as a top-level field on the result object, matching the forge CLI convention.

## Alternatives considered

1. **Add `nextSteps` to `KernelCommandResult.data` instead of the result object.** Rejected: RFC-0542 established `nextSteps` as a cross-cutting field on the result object directly, not inside command-specific `data`. Keeping it on the result object ensures agents can find it without knowing the `data` shape of each command.

2. **Only add `nextSteps` to `mission.validate`, not archive commands.** Rejected: the archive command gap is ecosystem-wide (all 6 handlers). Adding it to only one would be inconsistent. The coordinated change is small (one `nextSteps` array per handler).

3. **Reuse `ForgeNextStep` type from forge in site-kernel.** Rejected: site-kernel must not import from forge (dependency direction is forge → site-kernel, not the reverse). Defining `KernelNextStep` with the same shape is the correct approach — structural typing ensures compatibility without a runtime dependency.

4. **Make `nextSteps` required on all lifecycle commands.** Rejected: RFC-0542 says lifecycle commands MUST populate it, but making it a required field on `KernelCommandResult` would break all existing commands that don't populate it. The field is optional; the obligation is documented, not type-enforced.

## Risks

- **Type duplication.** `KernelNextStep` and `ForgeNextStep` have the same shape but are defined in separate packages. If one changes without the other, agents parsing both surfaces may encounter drift. Mitigation: the shape is `{ action: string, kind: "required" | "optional" }` — extremely stable. Any change would require an RFC.
- **Maintenance burden.** 7 handlers gain `nextSteps` arrays. Each array is 1-3 entries. Low ongoing maintenance — the next-step guidance is stable (mission lifecycle steps don't change frequently).
- **Agent over-reliance.** Agents might follow `nextSteps` without reading the diagnostics. The `nextSteps` for failure direct the agent to "fix the failing validators above" — they complement, not replace, the diagnostics.
- **CLI output length.** The "Next steps:" block adds 2-4 lines to pretty-mode output. This is intentional — the block is rendered after the summary, not before, so the summary is still the first thing the operator sees.
- **`--json` output shape change.** Adding `nextSteps` to the JSON output is additive — existing consumers that don't parse it are unaffected.

## Acceptance criteria

- [ ] `KernelNextStep` interface defined in `packages/os/site-kernel/src/types.ts`
- [ ] `KernelCommandResult` includes optional `nextSteps?: KernelNextStep[]` field
- [ ] Site-kernel CLI renders `nextSteps` as a "Next steps:" block in pretty mode
- [ ] `mission.validate` populates `nextSteps` for pass, fail, and dirty-workpiece states
- [ ] All 6 archive command handlers (`rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive`, `session.archive`, `mission.archive`) populate `nextSteps`
- [ ] `--json` output includes `nextSteps` as a top-level field when populated
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `KernelNextStep` MUST have the same shape as `ForgeNextStep` (`{ action: string, kind: "required" | "optional" }`) — structural typing ensures compatibility without a runtime dependency.
- The `renderNextSteps` function in site-kernel MAY reuse the forge implementation pattern (pure function, no I/O) but MUST NOT import from `@warpgogol/forge`.
- The `mission.validate` nextSteps for the dirty-workpiece state MUST include the `mission.git.commit` command with the mission ID interpolated.
- Archive command nextSteps are all `kind: "optional"` — archiving is terminal, verification is recommended but not required.
- The site-kernel CLI `--json` output MAY include `nextSteps` as an empty array when not populated, matching the forge CLI convention.
