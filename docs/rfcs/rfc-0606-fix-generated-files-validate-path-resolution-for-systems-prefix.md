---
id: RFC-0606
title: "Fix generated.files.validate path resolution for systems prefix"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-07-30
updatedAt: 2026-07-30
enhancedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0604
  - RFC-0375
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
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
    - generated.files.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "generated.files.validate resolves systems/{system}/ paths from workspace root"
  - "bordbuch.json and bordbuch/index.html are found by generated.files.validate after build.prepare"
nonGoals:
  - "Does not change the GENERATOR_OWNERSHIP_MAP entries themselves — only the path resolution logic in generated.files.validate."
  - "Does not add any new commands to the build.prepare pipeline — that is RFC-0604."
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

# RFC-0606: Fix generated.files.validate path resolution for systems prefix

## Context

`generated.files.validate` (RFC-0375) checks that every registry-declared generated file in `GENERATOR_OWNERSHIP_MAP` exists on disk. The path resolution logic in `packages/os/site-kernel-checks/src/generated-files-validate.ts` uses `WORKSPACE_ABSOLUTE_PREFIXES` (line 35) to determine which paths are workspace-root-relative: `["packages/", "docs/", "apps/", ".gitattributes", ".env"]`.

The `GENERATOR_OWNERSHIP_MAP` includes entries with paths like `systems/{system}/public/.well-known/bordbuch.json` (line 386 of `generator-ownership.ts`). The `systems/` prefix is not in `WORKSPACE_ABSOLUTE_PREFIXES`, so `resolveEntryPath` falls through to the `siteDirectory` or `apps/<app>/` branch, resolving the path incorrectly (e.g., `apps/warpgogol-com/systems/warpgogol-com/public/...` instead of `systems/warpgogol-com/public/...`).

## Problem

`generated.files.validate` cannot find files declared with `systems/{system}/` paths in `GENERATOR_OWNERSHIP_MAP`. The bordbuch entries (`systems/{system}/public/.well-known/bordbuch.json` and `systems/{system}/public/.well-known/bordbuch/index.html`) are workspace-root-relative but not recognized as such. This means:

1. `generated.files.validate` reports false-positive `GEN-FILES-01` errors for bordbuch files even after `bordbuch.generate` has written them.
2. RFC-0604 cannot use `generated.files.validate` as an acceptance criterion for bordbuch files without this fix.

## Decision

`WORKSPACE_ABSOLUTE_PREFIXES` in `generated-files-validate.ts` is extended to include `"systems/"`, so that `GENERATOR_OWNERSHIP_MAP` entries with `systems/{system}/` paths are resolved from the workspace root.

## Architectural fit

- **RFC-0375**: `generated.files.validate` was designed to check registry-declared files, but the `systems/` prefix was overlooked when bordbuch entries were added to `GENERATOR_OWNERSHIP_MAP` (RFC-0473). This RFC fixes the oversight.
- **Sternsystem model**: `systems/{system}/` paths are workspace-root-relative by convention (the `systems/` directory is at the monorepo root). Adding `"systems/"` to `WORKSPACE_ABSOLUTE_PREFIXES` aligns with how `packages/`, `docs/`, and `apps/` are already handled.

## Design

### CLI surface

No CLI surface change. The fix is internal to `generated.files.validate` path resolution:

```sh
# After the fix, this correctly finds bordbuch files at systems/<id>/public/.well-known/
pnpm exec site-kernel run generated.files.validate --site warpgogol-com
```

### TypeScript contracts

```ts
// Before:
const WORKSPACE_ABSOLUTE_PREFIXES = ["packages/", "docs/", "apps/", ".gitattributes", ".env"];

// After:
const WORKSPACE_ABSOLUTE_PREFIXES = ["packages/", "docs/", "apps/", "systems/", ".gitattributes", ".env"];
```

The `isWorkspaceAbsolute` function (line 37) already checks `WORKSPACE_ABSOLUTE_PREFIXES`, so adding `"systems/"` is a one-line change. The `resolveEntryPath` function (line 42) will then resolve `systems/{system}/...` paths from `workspaceRoot` instead of falling through to the `apps/<app>/` branch.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/generated-files-validate.ts` | `WORKSPACE_ABSOLUTE_PREFIXES` array updated |
| `systems/{system}/public/.well-known/bordbuch.json` | Now correctly found by `generated.files.validate` |
| `systems/{system}/public/.well-known/bordbuch/index.html` | Now correctly found by `generated.files.validate` |

### Output format

No change to output format. The fix eliminates false-positive `GEN-FILES-01` errors for `systems/{system}/` paths.

### Failure modes

No new failure modes. The fix only affects path resolution, not validation logic.

## Rollout

- One-line change to `WORKSPACE_ABSOLUTE_PREFIXES` in `generated-files-validate.ts`.
- No flag day, no migration. Existing `systems/{system}/` entries in `GENERATOR_OWNERSHIP_MAP` that were previously false-positive are now correctly resolved.
- Must be implemented before RFC-0604 can use `generated.files.validate` as an acceptance criterion for bordbuch files.

## Alternatives considered

- **Fix in RFC-0604 itself**: rejected because the path resolution bug is a pre-existing issue in `generated.files.validate` that affects any `systems/{system}/` entry, not just bordbuch. A separate RFC keeps the fix focused.
- **Remove bordbuch entries from GENERATOR_OWNERSHIP_MAP**: rejected because the ownership map is the canonical registry for generated file validation (RFC-0375). Removing entries would mean bordbuch files are not validated at all.

## Risks

- **Glob expansion for systems/{system}/ patterns**: The `{system}` placeholder in `systems/{system}/public/...` is a glob-like pattern. The existing `expandGlob` function handles `{` patterns (line 66: `path.includes("{")`). Adding `"systems/"` to `WORKSPACE_ABSOLUTE_PREFIXES` means these patterns will be expanded from the workspace root, which should work correctly since `systems/` is at the root.

## Acceptance criteria

- [ ] `"systems/"` added to `WORKSPACE_ABSOLUTE_PREFIXES` in `packages/os/site-kernel-checks/src/generated-files-validate.ts`
- [ ] `generated.files.validate --site warpgogol-com` finds `systems/warpgogol-com/public/.well-known/bordbuch.json` after `bordbuch.generate` has run
- [ ] No false-positive `GEN-FILES-01` errors for `systems/{system}/` paths
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
