---
id: RFC-0726
title: "Unify CLI flag --site across all leitstand and release commands, remove --system"
status: accepted
kind: contract
scope: workspace
owners:
  - architecture
reviewers:
  - human:operator
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0700
amendedBy: []
related:
  - RFC-0627
  - RFC-0628
  - RFC-0724
satisfies:
  - DNA-51
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - leitstand.dev-deploy
    - leitstand.status
    - leitstand.rollback
    - leitstand.health
    - release.list
    - release.state.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "All leitstand and release commands accept --site as the system identifier"
  - "No command accepts --system flag"
  - "Error messages reference --site consistently"
nonGoals:
  - "Changing --mission flag naming"
  - "Changing --release flag naming"
  - "Renaming the 'system' concept in registry.yaml or documentation"
  - "Adding --site flag to commands that do not currently accept a system identifier (leitstand.propagate, leitstand.promote, release.prepare, release.publish) — these derive systemId from release/mission manifests"
  - "Adding --site to release.ready (proposed by RFC-0724, not yet accepted) — a separate RFC will handle this if RFC-0724 is accepted"
---

# RFC-0726: Unify CLI flag --site across all leitstand and release commands, remove --system

## Context

During mission warpgogol-com-m000034 publishing, operators and agents encountered flag naming inconsistencies across leitstand and release commands. Six commands accept `--system` as the Sternsystem identifier flag, while no command uses `--site`. The `--system` flag name is inconsistent with the concept of a "site" (Sternsystem) used elsewhere in the platform, and operators naturally try `--site` based on the domain terminology.

The affected commands all use `--system`:

- `leitstand.dev-deploy` — `--system` (required)
- `leitstand.status` — `--system` (required)
- `leitstand.rollback` — `--system` (required)
- `leitstand.health` — `--system` (required)
- `release.list` — `--system` (optional filter)
- `release.state.validate` — `--system` (optional)

## Problem

Six leitstand and release commands accept `--system` as the Sternsystem identifier. The flag name `--system` is inconsistent with the platform's domain terminology — a Sternsystem is referred to as a "site" in composition, authoring, and onboarding contexts. Operators and agents familiar with the `--site` terminology from other tooling naturally try `--site` and get `KERNEL-FLAG-01 · Unknown flag "--site"` errors. The inconsistency causes:

1. Wrong flag errors that cost time mid-publishing
2. Agents must memorize which commands use `--system` vs `--site`
3. Error messages reference `--system`, which doesn't match the "site" concept used in documentation and authoring guides

## Decision

All leitstand and release commands that currently accept `--system` are updated to accept `--site` instead. The `--system` flag is removed entirely from all affected commands — no backward compat alias, no deprecation period.

The flag schema changes apply to six commands:

- `leitstand.dev-deploy`: `--system` → `--site` (required)
- `leitstand.status`: `--system` → `--site` (required)
- `leitstand.rollback`: `--system` → `--site` (required)
- `leitstand.health`: `--system` → `--site` (required)
- `release.list`: `--system` → `--site` (optional filter)
- `release.state.validate`: `--system` → `--site` (optional)

Commands that do not currently accept a system identifier flag (`leitstand.propagate`, `leitstand.promote`, `release.prepare`, `release.publish`) are not affected — they derive `systemId` from release or mission manifests.

## Architectural fit

- **Naming consistency**: The `--site` flag name aligns with the platform's domain terminology — Sternsystems are referred to as "sites" in composition, authoring, and onboarding contexts.
- **Concept alignment**: `--site` refers to the Sternsystem ID, which is the same concept across all commands. The `--system` flag was an inconsistent naming choice.
- **No semantic change**: The flag value is the same — a Sternsystem ID string from `systems/registry.yaml`.
- **DNA-51 alignment**: DNA-51 governs Werkstatt command consistency primitives. The leitstand and release commands are Werkstatt commands that use these primitives (locks, idempotency, atomic writes). Consistent flag naming across these commands supports the operational reliability that DNA-51 enforces — operators and agents can invoke commands predictably without guessing flag names, reducing the risk of misconfigured invocations that could bypass consistency guarantees.

## Design

### CLI surface

```sh
# Before (--system on 6 commands):
pnpm exec site-kernel run leitstand.dev-deploy --system warpgogol-com --release warpgogol-com-r000013
pnpm exec site-kernel run leitstand.status --system warpgogol-com
pnpm exec site-kernel run leitstand.rollback --system warpgogol-com
pnpm exec site-kernel run leitstand.health --system warpgogol-com
pnpm exec site-kernel run release.list --system warpgogol-com
pnpm exec site-kernel run release.state.validate --system warpgogol-com

# After (unified --site):
pnpm exec site-kernel run leitstand.dev-deploy --site warpgogol-com --release warpgogol-com-r000013
pnpm exec site-kernel run leitstand.status --site warpgogol-com
pnpm exec site-kernel run leitstand.rollback --site warpgogol-com
pnpm exec site-kernel run leitstand.health --site warpgogol-com
pnpm exec site-kernel run release.list --site warpgogol-com
pnpm exec site-kernel run release.state.validate --site warpgogol-com
```

### TypeScript contracts

```ts
// All six commands follow the same pattern:
// Before:
const systemId = flagString(input, "system");
// After:
const systemId = flagString(input, "site");

// Error messages updated:
// Before:
if (!systemId) throw new Error("[leitstand.dev-deploy] --system is required");
// After:
if (!systemId) throw new Error("[leitstand.dev-deploy] --site is required");
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | `runLeitstandDevDeploy`, `runLeitstandStatus`, `runLeitstandRollback`, `runLeitstandHealth` — change `flagString(input, "system")` to `flagString(input, "site")` and update error messages |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts` | Flag schema definitions for `leitstand.dev-deploy`, `leitstand.status`, `leitstand.rollback`, `leitstand.health` — rename `system` flag to `site` |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | `runReleaseList`, `runReleaseStateValidate` — change `flagString(input, "system")` to `flagString(input, "site")` |
| `packages/os/site-kernel-handoff/src/release/release.module.ts` | Flag schema definitions for `release.list`, `release.state.validate` — rename `system` flag to `site` |
| `packages/os/site-kernel-handoff/AGENTS.md` | Update leitstand command documentation — replace `--system` references with `--site` |
| `docs/COMMANDS.md` | Update command table entries — replace `--system` with `--site` for all affected commands |

### Failure modes

- **`--system` passed after migration**: `KERNEL-FLAG-01 · Unknown flag "--system"` — same error as any unknown flag. No special handling.
- **`--site` missing**: `KERNEL-FLAG-03 · Required flag "--site" is missing` — same error as other commands.

## Rollout

- **Clean break**: `--system` is removed from all six commands. No alias, no deprecation warning. Any script using `--system` will fail with `KERNEL-FLAG-01`.
- **Update all references**: AGENTS.md, `docs/COMMANDS.md`, and any scripts that reference `--system` for affected commands are updated in the same implementation commit.

## Alternatives considered

- **Add `--system` as alias alongside `--site`**: Rejected — plagues the codebase with synonyms and complicates documentation. Clean break is simpler.
- **Keep `--system` and document it consistently**: Rejected — the platform's domain terminology uses "site" for Sternsystem concepts. `--system` is a mismatch with authoring, composition, and onboarding vocabulary.
- **Accept both `--site` and `--system` in all commands**: Rejected — ambiguity in flag names leads to confusion about which is canonical.

## Risks

- **Existing scripts break**: Any script using `--system` on the six affected commands will fail. This is intentional — clean break, no legacy.
- **Agent confusion during transition**: Agents trained on `--system` will need updated instructions. AGENTS.md update in the same commit mitigates this.
- **Test fixtures break**: Unit tests that pass `--system` in synthetic `input.flags` will fail. All test fixtures must be updated in the same commit.

## Acceptance criteria

- [ ] `leitstand.dev-deploy` accepts `--site` flag (required), does not accept `--system`
- [ ] `leitstand.status` accepts `--site` flag (required), does not accept `--system`
- [ ] `leitstand.rollback` accepts `--site` flag (required), does not accept `--system`
- [ ] `leitstand.health` accepts `--site` flag (required), does not accept `--system`
- [ ] `release.list` accepts `--site` flag (optional), does not accept `--system`
- [ ] `release.state.validate` accepts `--site` flag (optional), does not accept `--system`
- [ ] Error messages for missing `--site` are consistent across all commands
- [ ] `packages/os/site-kernel-handoff/AGENTS.md` updated to reflect `--site` as the canonical flag
- [ ] `docs/COMMANDS.md` updated for all six commands
- [ ] All unit tests passing `--system` in synthetic input are updated to `--site`
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT add `--system` as an alias or backward-compat flag.
- Update all references in the same commit — code, flag schema, AGENTS.md, `docs/COMMANDS.md`, and test fixtures.
- RFC-0724 (draft) proposes renaming `release.publish` to `release.ready`. If RFC-0724 is accepted, a separate amending RFC will add `--site` to `release.ready`. This RFC does not depend on RFC-0724.
