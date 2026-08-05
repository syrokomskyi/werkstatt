---
id: RFC-0699
title: "Remove forge. domain from CLI command names"
status: accepted
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0542
  - RFC-0543
versionBump: minor
commands:
  proposed:
    - create
    - doctor
    - upgrade
    - scaffold
    - build
    - validate
    - dev
    - agents.generate
    - assets.list
    - assets.check
    - determinism.check
    - profile.validate
    - release.prepare
    - release.publish
    - skill.list
    - skill.validate
    - skill.knowledge.compact
    - port.scaffold
    - port.validate
  added: []
  changed:
    - forge.create
    - forge.doctor
    - forge.upgrade
    - forge.scaffold
    - forge.build
    - forge.validate
    - forge.dev
    - forge.agents.generate
    - forge.assets.list
    - forge.assets.check
    - forge.determinism.check
    - forge.profile.validate
    - forge.release.prepare
    - forge.release.publish
    - forge.skill.list
    - forge.skill.validate
    - forge.skill.knowledge.compact
    - forge.port.scaffold
    - forge.port.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/forge
successSignals:
  - "[x] `forge --help` lists commands without the leading 'forge.' prefix (evidence: packages/forge/bin/cli.ts:228)"
  - "[x] `forge create --name my-project --profile editframe` runs successfully (evidence: packages/forge/bin/cli.ts:228)"
  - "[x] All package/AGENTS.md and README examples use unqualified forge command names (evidence: packages/forge/README.md:450)"
  - "[x] `rfc.validate --id RFC-0699` passes (evidence: packages/forge/bin/cli.ts:1)"
nonGoals:
  - "Rename the 'forge' binary"
  - "Change non-forge command namespaces (rfc.*, compass.*, workflow.*, naming.*, session.*, werkstatt.*, etc.)"
  - "Introduce shell aliases or tab-completion in this RFC"
  - "Rewrite skill implementation logic beyond command string references"
---

# RFC-0699: Remove forge. domain from CLI command names

## Context

`@warpgogol/forge` exposes its commands under the `forge.` namespace: `forge.create`, `forge.doctor`, `forge.upgrade`, `forge.build`, etc. The entrypoint binary is also named `forge`. This produces the redundant and awkward invocation `forge forge.create --name my-project`.

README and onboarding examples written for end users (e.g. `forge create my-project --profile editframe`) currently fail with `Unknown command: create` because the CLI only accepts the fully-qualified `forge.create` form. The mismatch between documentation and implementation is confusing for new operators.

## Problem

The `forge.` prefix is semantically redundant on the `forge` binary. Every other top-level namespace (`rfc.*`, `compass.*`, `workflow.*`, `naming.*`, `session.*`, `werkstatt.*`) groups commands by a distinct concern, but `forge.*` merely duplicates the binary name. The redundancy:

1. Forces operators to remember a meaningless prefix for the most common commands.
2. Causes the CLI and the README to contradict each other.
3. Makes the help output harder to scan because the most frequently used commands share a long common prefix.

## Decision

Drop the `forge.` domain from all `forge`-namespace commands. Register and document them as `create`, `doctor`, `upgrade`, `build`, `skill.validate`, `port.scaffold`, etc. The `forge` binary remains the entrypoint; the command after it is the canonical name.

For a deprecation window of one minor version, the CLI MAY continue to accept the old `forge.*` names and print a one-time stderr warning: `Warning: 'forge.X' is deprecated, use 'X'`. After the window, `forge.*` names are rejected with the standard `Unknown command` message.

## Architectural fit

- **CLI contract:** `bin/cli.ts` resolves the command name before dispatch. This is the only place that needs command-name mapping logic.
- **Command registry:** The `ForgeCliRegistry` already stores commands by string key. Renaming keys is a registration change, not a registry redesign.
- **Other namespaces are untouched:** `rfc.*`, `compass.*`, `workflow.*`, `naming.*`, `session.*`, and `werkstatt.*` remain qualified because they distinguish distinct domains under the same `forge` binary.
- **Skills and docs:** Skills that reference `forge.create` or other `forge.*` commands are updated to use the unqualified names. `AGENTS.md`, `README.md`, and `README.uk.md` are aligned.

## Design

### CLI surface

```sh
forge create --name my-brand-video --profile editframe
forge doctor
forge upgrade
forge build
forge skill.validate
forge port.scaffold
```

Equivalent deprecated forms (warning, not error):

```sh
forge forge.create --name my-brand-video --profile editframe
forge forge.doctor
```

### TypeScript contracts

No new types are required. The resolver changes in `bin/cli.ts`:

```ts
function resolveCommandName(commandName: string, registry: ForgeCliRegistry): string | undefined {
  if (registry.getCommand(commandName)) return commandName;
  if (!commandName.includes(".") && registry.getCommand(`forge.${commandName}`)) {
    logger.warn(`'forge.${commandName}' is deprecated; use '${commandName}'`);
    return `forge.${commandName}`;
  }
  return undefined;
}
```

For a hard removal (no alias), the function simply returns `undefined` for unknown names and `bin/cli.ts` errors normally.

### File system responsibilities

| Path                                    | Role                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| `packages/forge/bin/cli.ts`             | Command-name resolution and dispatch                   |
| `packages/forge/os/core/core.module.ts` | Registration of `create`, `doctor`, `build`, etc.      |
| `packages/forge/os/*/...module.ts`      | Registration of `skill.*`, `port.*`, `release.*`, etc. |
| `packages/forge/README.md`              | Examples use unqualified names                         |
| `packages/forge/README.uk.md`           | Examples use unqualified names                         |
| `packages/forge/skills/*/SKILL.md`      | Command references use unqualified names               |

### Failure modes

- Unknown command: same as today — `logger.error('Unknown command: create')` and `exit 1`.
- Ambiguous: no command has the same unqualified name across domains, so no ambiguity is introduced.
- Deprecation warning: printed to stderr, does not affect exit code.

## Rollout

1. **Phase 1 (this RFC):** Register all `forge.*` commands under unqualified names and make `bin/cli.ts` accept them. Keep `forge.*` as deprecated aliases. Update README/AGENTS.md/skill references. Release as `minor` because command names change, but aliases keep existing scripts working.
2. **Phase 2 (future RFC or major, before the next `major` version):** Remove the deprecated `forge.*` aliases entirely. The deprecation window is exactly one `minor` release; the superseding RFC that removes the aliases must be filed and accepted before the next `major` bump.

## Alternatives considered

1. **Keep `forge.*` and update README only.** Rejected because the prefix is genuinely redundant and the documented examples would remain verbose.
2. **Add a generic alias table in `forge.yaml`.** Rejected as over-engineering. The convention should be built-in, not configured per project.
3. **Rename the binary to something else.** Rejected. The binary name `forge` is established and changing it only shifts the redundancy elsewhere.

## Risks

- **Documentation drift:** Examples, skills, and agent instructions may still use `forge.X` after the change. A search-replace pass is required in `packages/forge/README.md`, `packages/forge/README.uk.md`, `packages/forge/skills/`, and the workspace `AGENTS.md` files.
- **Operator confusion during deprecation:** Operators who already learned `forge.X` need a clear one-release warning before removal.
- **Skill commands:** Skills that invoke `forge.X` via the chat interface must reference the new names. Updating skill `SKILL.md` files without regenerating project `.agents/skills/` copies can cause stale instructions. `forge.create` and `forge.upgrade` must sync the updated skill files.

## Acceptance criteria

- [x] All `forge.*` commands are registered under unqualified names. (evidence: packages/forge/bin/cli.ts:228)
- [x] `forge create --name my-project --profile editframe` runs successfully. (evidence: packages/forge/bin/cli.ts:228)
- [x] `forge --help` lists the unqualified names. (evidence: packages/forge/src/cli-output.ts:53)
- [x] Deprecated `forge.X` names still work with a warning (Phase 1) or are rejected cleanly (Phase 2). (evidence: packages/forge/bin/cli.ts:228)
- [x] `packages/forge/README.md` and `packages/forge/README.uk.md` use unqualified names. (evidence: packages/forge/README.md:450)
- [x] Skill references in `packages/forge/skills/` use unqualified names. (evidence: packages/forge/skills/meta/port-to-forge/SKILL.md:18)
- [x] `rfc.validate --id RFC-0699` passes. (evidence: docs/audits/audit-rfc-0699-remove-forge-domain-from-cli-command-names.md:1)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST update all `README.md`, `README.uk.md`, and `SKILL.md` command references in the same commit that renames the commands.
- If implementation reveals that `rfc.*`, `compass.*`, or other namespaced commands collide with the unqualified `forge` names, agents MUST NOT weaken the rule; instead, run `rfc.supersede.propose` with the invariant that is in conflict.
- The `commands.proposed` entries in this RFC are new alias keys registered for existing command handlers, not new command implementations; `commands.changed` lists the existing qualified names that now also accept the new unqualified aliases.
