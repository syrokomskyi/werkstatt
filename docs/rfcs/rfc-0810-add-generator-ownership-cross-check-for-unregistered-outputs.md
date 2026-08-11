---
id: RFC-0810
title: "Add generator ownership cross-check to detect unregistered generator outputs"
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
  - RFC-0785
  - RFC-0601
satisfies: []
versionBump: patch
commands:
  proposed:
    - "ownership.generator.cross-check"
  added: []
  changed:
    - "generator.ownership.lint"
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "New generator command with unregistered outputs fails ownership.cross-check before mission.validate"
  - "Existing generators with full ownership map coverage pass without changes"
  - "Cross-check integrated into build.check pipeline"
nonGoals:
  - "Automatically adding entries to GENERATOR_OWNERSHIP_MAP"
  - "Static analysis of generator source code"
  - "Replacing ownership.sync.validate"
acceptance:
  - probe: command-registered
    name: "ownership.generator.cross-check"
---

# RFC-0810: Add generator ownership cross-check to detect unregistered generator outputs

## Context

The `GENERATOR_OWNERSHIP_MAP` in `packages/werkstatt-site/src/checks/generator-ownership.ts`
is a hand-maintained registry that maps generated file paths to their owning generator
command. When a new generator command is added but its output files are not registered
in this map, `ownership.sync.validate` fails with `OWN-01` (uncovered files) errors
during `mission.validate`.

During the warpgogol-com-m000050 release, `agent.discovery-endpoints.generate` was
added (RFC-0785) writing `public/auth.md`, `public/.well-known/agent-skills/index.json`,
`public/.well-known/oauth-protected-resource`, and `public/.well-known/oauth-authorization-server`
— but these files were never added to `GENERATOR_OWNERSHIP_MAP`. This was only discovered
when `mission.validate` failed, requiring a full pipeline rerun.

## Problem

There is no automated check that verifies every `.generate` command's output files are
covered by `GENERATOR_OWNERSHIP_MAP`. The gap is only discovered at `ownership.sync.validate`
time, which is deep in the `mission.validate` pipeline — costing 2–4 minutes per
discovery cycle.

The root cause is that generator output paths are declared in the generator's source
code (e.g. `agent-discovery-endpoints.ts` writes to `join(wellKnownDir, "oauth-protected-resource")`)
but the ownership map is a separate hand-maintained data structure. There is no
cross-reference between the two.

## Decision

Add a new command `ownership.generator.cross-check` that cross-references all registered
commands with a `.generate` suffix against the `GENERATOR_OWNERSHIP_MAP`. The command
checks that:

1. Every command ending in `.generate` has at least one entry in `GENERATOR_OWNERSHIP_MAP`.
2. Every entry in `GENERATOR_OWNERSHIP_MAP` references a registered command (no phantoms).
3. The `module` path in each ownership entry points to a file that exists.

This command runs early in the `build.check` pipeline — before `ownership.sync.validate`
— so that missing registrations are caught before the expensive build and validate steps.

## Architectural fit

- **DNA-58 (Generated-file content determinism)**: This RFC strengthens the ownership
  contract that underpins `generated.drift.validate` (RFC-0601). If a file's generator
  is not in the ownership map, drift validation cannot verify its determinism.
- **RFC-0785 (Agent discovery endpoints)**: The triggering case. This RFC would have
  caught the missing ownership entries before `mission.validate`.

## Design

### CLI surface

```sh
pnpm exec werkstatt run ownership.generator.cross-check --site warpgogol-com
pnpm exec werkstatt run ownership.generator.cross-check --all
```

### TypeScript contracts

```ts
interface OwnershipCrossCheckResult {
  command: "ownership.generator.cross-check";
  status: "pass" | "fail";
  uncovered: Array<{
    command: string;
    reason: "no-ownership-entry" | "module-not-found";
  }>;
  phantoms: Array<{
    command: string;
    path: string;
    reason: "command-not-registered";
  }>;
  checked: number;
}
```

### File system responsibilities

| Path | Role |
|---|---|
| `packages/werkstatt-site/src/checks/generator-ownership.ts` | Source of `GENERATOR_OWNERSHIP_MAP` |
| `packages/werkstatt-site/src/checks/ownership-cross-check.ts` | New command implementation |
| `packages/werkstatt-site/src/checks/command-tables/*.ts` | Command registration for cross-check |
| Pipeline definitions (`build.check`) | Add `ownership.generator.cross-check` before `ownership.sync.validate` |

### Output format

```json
{
  "command": "ownership.generator.cross-check",
  "status": "fail",
  "uncovered": [
    {
      "command": "agent.discovery-endpoints.generate",
      "reason": "no-ownership-entry"
    }
  ],
  "phantoms": [],
  "checked": 45
}
```

### Failure modes

- **OWN-XCHECK-01**: A `.generate` command has no entry in `GENERATOR_OWNERSHIP_MAP`.
  Error: `OWN-XCHECK-01: command "agent.discovery-endpoints.generate" has no ownership map entry`.
- **OWN-XCHECK-02**: An ownership map entry references a command that is not registered.
  Error: `OWN-XCHECK-02: ownership entry for path "public/foo.json" references unregistered command "foo.generate"`.
- **OWN-XCHECK-03**: An ownership map entry references a `module` path that does not exist.
  Error: `OWN-XCHECK-03: ownership entry for "public/foo.json" points to non-existent module "packages/nonexistent/foo.ts"`.

## Rollout

- **Default behavior**: Warn-only on first introduction. Existing sites may have
  generators that predate the ownership map. After a grace period (one release cycle),
  escalate to error.
- **Pipeline integration**: Add as step 2 in `build.check` pipeline (after
  `config.regenerate`, before `ownership.sync.validate`).
- **New sites**: Must pass from day one — `onboarding.scaffold` should include
  ownership entries for all initial generators.

## Alternatives considered

- **Declared outputs on command registration**: Adding a `declaredOutputs: string[]`
  field to `KernelCommandDefinition`. Rejected because it duplicates the ownership map
  and requires changing every generator's registration. The ownership map already
  serves as the declared-outputs registry.
- **Static analysis of generator source code**: Parsing generator `.ts` files to
  extract `writeFile` calls. Rejected — too fragile and would require a TypeScript
  AST walker.
- **Merging ownership map into command registration**: Rejected — the ownership map
  is site-stack-specific (`werkstatt-site`), while command registration is in
  `command-tables/`. They live in the same package but serve different concerns.

## Risks

- **False positives for conditional generators**: Some generators only produce files
  under certain conditions (e.g. `image.variants.generate` only when source images
  exist). The cross-check should only verify that an ownership map entry **exists**,
  not that files are present on disk — `conditional: true` entries are still valid.
- **Maintenance burden**: The cross-check itself needs to be maintained. However,
  it is a simple registry cross-reference with minimal logic.

## Acceptance criteria

- [ ] `ownership.generator.cross-check` command registered
- [ ] Cross-references all `.generate` commands against `GENERATOR_OWNERSHIP_MAP`
- [ ] Reports `OWN-XCHECK-01` for uncovered generators
- [ ] Reports `OWN-XCHECK-02` for phantom command references
- [ ] Reports `OWN-XCHECK-03` for non-existent module paths
- [ ] Integrated into `build.check` pipeline before `ownership.sync.validate`
- [ ] `--json` output format documented and stable
- [ ] Unit tests for all three failure modes
- [ ] Existing sites pass without changes (or warnings are non-blocking)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The cross-check reads `GENERATOR_OWNERSHIP_MAP` and the command registry — both are
  in-memory data structures, so the command is fast (no file I/O beyond checking
  `module` path existence).
- The command scope is `workspace` (it checks all registered generators, not per-site).
- When integrating into `build.check`, place it early — before any build steps — so
  that missing ownership is caught before expensive operations.
