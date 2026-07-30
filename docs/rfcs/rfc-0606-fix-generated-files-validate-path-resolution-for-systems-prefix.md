---
id: RFC-0606
title: "Fix generated.files.validate path resolution for systems prefix"
status: accepted
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
reviewers:
  - human:andrii-syrokomskyi
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
  - "generated.files.validate checks file existence for systems/{system}/ entries by expanding {system} to the --site value"
  - "bordbuch.json and bordbuch/index.html are validated by generated.files.validate after build.prepare"
nonGoals:
  - "Does not change the GENERATOR_OWNERSHIP_MAP entries themselves — only the path resolution and brace expansion logic in generated.files.validate."
  - "Does not add any new commands to the build.prepare pipeline — that is RFC-0604."
  - "Does not fix {id} brace expansion for packages/ui/src/sections/{id}/ and packages/ui/src/components/{id}/ entries — same silent-pass issue but separate scope; noted as a known limitation."
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

`generated.files.validate` (RFC-0375) checks that every registry-declared generated file in `GENERATOR_OWNERSHIP_MAP` exists on disk. The path resolution logic in `packages/os/site-kernel-checks/src/generated-files-validate.ts` uses `WORKSPACE_ABSOLUTE_PREFIXES` to determine which paths are workspace-root-relative: `["packages/", "docs/", "apps/", ".gitattributes", ".env"]`.

The `GENERATOR_OWNERSHIP_MAP` includes entries with paths like `systems/{system}/public/.well-known/bordbuch.json` (line 386 of `generator-ownership.ts`). The `systems/` prefix is not in `WORKSPACE_ABSOLUTE_PREFIXES`, so `resolveEntryPath` falls through to the `siteDirectory` or `apps/<app>/` branch, resolving the path incorrectly (e.g., `apps/warpgogol-com/systems/warpgogol-com/public/...` instead of `systems/warpgogol-com/public/...`).

Additionally, the bordbuch paths contain the `{system}` placeholder, which triggers the glob branch in `runGeneratedFilesValidate` (via `hasGlobPattern`). However, `expandGlob` only handles `*` and `**` wildcards — its internal `hasWildcards` helper checks `p.includes("*")`, not `{`. As a result, `{system}` is never expanded: `expandGlob` returns the literal path string, `files.length` is 1, and no `GEN-FILES-01` error is reported. The validator silently passes regardless of whether the bordbuch files exist on disk.

## Problem

`generated.files.validate` cannot validate files declared with `systems/{system}/` paths in `GENERATOR_OWNERSHIP_MAP`. There are two distinct bugs:

1. **Path resolution**: `systems/` is not in `WORKSPACE_ABSOLUTE_PREFIXES`, so `resolveEntryPath` resolves `systems/{system}/...` paths relative to `apps/<app>/` or `siteDirectory` instead of the workspace root.
2. **Brace expansion**: `{system}` is not expanded by `expandGlob`, so the glob branch never checks file existence — it returns the literal path with `{system}` unexpanded, `files.length` is 1, and no error is reported. This means the validator silently passes whether or not the bordbuch files exist.

The RFC's original Problem section claimed "false-positive `GEN-FILES-01` errors" — this is incorrect. Running `generated.files.validate --site warpgogol-com` confirms no bordbuch or `systems/` errors appear in the output. The actual problem is a **silent false negative**: the validator never checks these files at all.

RFC-0604 cannot use `generated.files.validate` as an acceptance criterion for bordbuch files without this fix — the validator would pass even if the files are missing.

## Decision

Two changes in `generated-files-validate.ts`:

1. `WORKSPACE_ABSOLUTE_PREFIXES` is extended to include `"systems/"`, so that `GENERATOR_OWNERSHIP_MAP` entries with `systems/{system}/` paths are resolved from the workspace root.
2. `expandGlob` is extended to expand `{system}` (and generic `{placeholder}`) brace patterns by substituting the `--site` flag value. When `{system}` is present and `--site` is provided, the placeholder is replaced before glob expansion. This makes the glob branch check the actual file path on disk.

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

The `isWorkspaceAbsolute` function already checks `WORKSPACE_ABSOLUTE_PREFIXES`, so adding `"systems/"` ensures `resolveEntryPath` resolves `systems/{system}/...` paths from `workspaceRoot`.

Additionally, `expandGlob` is extended to handle `{placeholder}` brace patterns. When a path segment contains `{placeholder}`, it is replaced with the `--site` value (for `{system}`) before glob expansion. This ensures the glob branch checks the actual file path on disk instead of returning the literal unexpanded path.

```ts
// In runGeneratedFilesValidate, before calling expandGlob:
// Replace {system} with the --site value
const expandedPath = posixPath.replace(/\{system\}/g, app ?? "*");
```

When `--site` is not provided, `{system}` is replaced with `*` (wildcard), which `expandGlob` already handles by scanning all directories under `systems/`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/generated-files-validate.ts` | `WORKSPACE_ABSOLUTE_PREFIXES` array updated; `expandGlob` or `runGeneratedFilesValidate` extended to substitute `{system}` with `--site` value |
| `systems/{system}/public/.well-known/bordbuch.json` | Now correctly validated by `generated.files.validate` |
| `systems/{system}/public/.well-known/bordbuch/index.html` | Now correctly validated by `generated.files.validate` |

### Output format

No change to output format. The fix enables `GEN-FILES-01` errors to be reported when `systems/{system}/` files are missing (previously silent false negatives).

### Failure modes

- If `--site` is not provided and a `systems/{system}/` entry is encountered, `{system}` is replaced with `*` (wildcard). `expandGlob` scans all directories under `systems/` and reports a warning if no files match.
- If `--site` is provided but the system directory does not exist under `systems/`, `expandGlob` returns an empty array and a `GEN-FILES-01` warning is reported.
- No new error-level diagnostics are introduced — the fix enables existing `GEN-FILES-01` to fire correctly for `systems/{system}/` paths.

## Rollout

- Two changes to `generated-files-validate.ts`: add `"systems/"` to `WORKSPACE_ABSOLUTE_PREFIXES`, and add `{system}` → `--site` substitution before glob expansion.
- No flag day, no migration. Existing `systems/{system}/` entries in `GENERATOR_OWNERSHIP_MAP` that were previously silent false negatives are now correctly validated.
- Must be implemented before RFC-0604 can use `generated.files.validate` as an acceptance criterion for bordbuch files.

## Alternatives considered

- **Fix in RFC-0604 itself**: rejected because the path resolution bug is a pre-existing issue in `generated.files.validate` that affects any `systems/{system}/` entry, not just bordbuch. A separate RFC keeps the fix focused.
- **Remove bordbuch entries from GENERATOR_OWNERSHIP_MAP**: rejected because the ownership map is the canonical registry for generated file validation (RFC-0375). Removing entries would mean bordbuch files are not validated at all.

## Risks

- **`expandGlob` does not handle `{placeholder}` brace patterns**: The existing `expandGlob` function only handles `*` and `**` wildcards — its internal `hasWildcards` helper checks `p.includes("*")`, not `{`. The `hasGlobPattern` function (which checks `{`) routes these entries to the glob branch, but `expandGlob` returns the literal unexpanded path. This RFC fixes the issue by substituting `{system}` with the `--site` value before calling `expandGlob`.
- **`{id}` entries have the same issue**: `packages/ui/src/sections/{id}/{id}.types.generated.ts` and `packages/ui/src/components/{id}/{id}.types.generated.ts` use `{id}` and are workspace-absolute (`packages/` prefix), but `{id}` is never expanded. This is a known limitation — fixing `{id}` expansion requires scanning all section/component directories and is out of scope for this RFC. The `{id}` entries silently pass today and will continue to do so after this RFC.
- **False negative → false positive transition**: Before this fix, bordbuch entries silently pass (false negative). After this fix, if bordbuch files are missing, `GEN-FILES-01` errors will be reported. Sites that have not run `bordbuch.generate` will see new errors. This is the correct behavior — the errors were always warranted, just not reported.

## Acceptance criteria

- [x] `"systems/"` added to `WORKSPACE_ABSOLUTE_PREFIXES` in `packages/os/site-kernel-checks/src/generated-files-validate.ts` (evidence: packages/os/site-kernel-checks/src/generated-files-validate.ts:39)
- [x] `{system}` placeholder is substituted with the `--site` value (or `*` when `--site` is not provided) before glob expansion in `runGeneratedFilesValidate` (evidence: packages/os/site-kernel-checks/src/generated-files-validate.ts:176, generated-files-validate.test.ts "wildcard" test)
- [x] `generated.files.validate --site warpgogol-com` reports `GEN-FILES-01` error when `systems/warpgogol-com/public/.well-known/bordbuch.json` does not exist (evidence: generated-files-validate.test.ts "red: reports GEN-FILES-01 for missing bordbuch files")
- [x] `generated.files.validate --site warpgogol-com` passes (no `GEN-FILES-01` for bordbuch) when `systems/warpgogol-com/public/.well-known/bordbuch.json` exists after `bordbuch.generate` has run (evidence: generated-files-validate.test.ts "green: no GEN-FILES-01 for bordbuch when files exist")
- [x] `generated.files.validate` without `--site` expands `{system}` to `*` and scans all `systems/*/` directories (evidence: generated-files-validate.test.ts "wildcard: expands {system} to * when --site is not provided")
- [x] `rfc.validate` passes on this file before merging (evidence: pnpm exec site-kernel run rfc.validate RFC-0606 — All 1 RFC(s) passed)

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
