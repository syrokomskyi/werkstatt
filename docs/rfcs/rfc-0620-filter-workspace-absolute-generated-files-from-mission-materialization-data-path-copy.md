---
id: RFC-0620
title: "Filter workspace-absolute generated files from mission materialization data-path copy"
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
createdAt: 2026-07-31
updatedAt: 2026-07-31
enhancedAt: 2026-07-31
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-44
  - DNA-47
  - RFC-0473
  - RFC-0568
  - RFC-0597
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-47
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
    - mission.materialize
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "ownership.sync.validate passes during mission.materialize with zero OWN-01 diagnostics"
  - "No workspace-absolute generated files appear in the workpiece after data-path copy"
nonGoals:
  - "Changing bordbuch.generate to write to the workpiece instead of the cache clone"
  - "Adding bordbuch.generate to the build.prepare.dev pipeline"
  - "Filtering site-relative generated files from the data-path copy (they are overwritten by dev pipeline generators)"
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

# RFC-0620: Filter workspace-absolute generated files from mission materialization data-path copy

## Context

`mission.materialize` copies a curated set of directories (`STERNSYSTEM_DATA_PATHS`) from the Sternsystem cache clone into the mission workpiece. One of these directories is `public/`, which contains both authored static assets (textures, uploaded media) and generated files produced by various kernel commands.

The `GENERATOR_OWNERSHIP_MAP` in `packages/os/site-kernel-checks/src/generator-ownership.ts` distinguishes two path categories:

- **Site-relative** paths (e.g., `public/robots.txt`) — owned by dev-pipeline generators that overwrite them during `build.prepare.dev`.
- **Workspace-absolute** paths (e.g., `systems/{system}/public/.well-known/bordbuch.json`) — owned by commands that write to the cache clone, not the workpiece.

Currently, `STERNSYSTEM_DATA_PATHS` copies `public/` verbatim, including workspace-absolute generated files. These files are not owned by any generator in the workpiece context — `ownership.sync.validate` resolves ownership entries relative to the workpiece directory, and `systems/{system}/public/...` patterns do not match workpiece paths.

## Problem

DNA-47 (Materialization) requires that a mission's Werkstuck is materialized from the Sternsystem's pinned data bundle with runtime scaffolding generated from the pinned platform. The data-path copy violates this when it copies workspace-absolute generated files from the cache clone into the workpiece, creating orphan files that no workpiece-scoped generator owns.

Concrete failure mode observed during `warpgogol-com-m000023` materialization:

1. `STERNSYSTEM_DATA_PATHS` copies `public/` from the cache clone into the workpiece staging directory.
2. The copy includes `public/.well-known/bordbuch.json` and `public/.well-known/bordbuch/index.html` — workspace-absolute generated files owned by `bordbuch.generate`.
3. `bordbuch.generate` writes to the cache clone (`resolveCachePath` -> `systems/{system}/public/.well-known/`), not to the workpiece. It is also not in the `build.prepare.dev` pipeline.
4. `ownership.sync.validate` scans the workpiece for files and checks each against `GENERATOR_OWNERSHIP_MAP`. The bordbuch files in the workpiece (`missions/<id>/workpiece/public/.well-known/bordbuch.json`) match no ownership entry — the ownership entry is `systems/{system}/public/.well-known/bordbuch.json`, a workspace-absolute path.
5. `ownership.sync.validate` emits OWN-01 diagnostics for these orphan files, causing `build.prepare.dev` to fail and blocking materialization.

The root cause is that `STERNSYSTEM_DATA_PATHS` performs an unfiltered copy of `public/`, mixing authored content with workspace-absolute generated artifacts that belong in the cache clone, not the workpiece.

## Decision

`mission.materialize` filters workspace-absolute generated files from the `public/` directory copy by checking each file path against `GENERATOR_OWNERSHIP_MAP` entries with `systems/{system}/` prefixes. Files matching a workspace-absolute ownership entry are skipped during the copy, ensuring only authored content and site-relative generated files (which are overwritten by dev-pipeline generators) enter the workpiece.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract):** Sternsystem repos are data-only bundles. Workspace-absolute generated files (like bordbuch projections) are runtime artifacts written to the cache clone by their owning commands. They are not authored content and should not be materialized into the workpiece as if they were.
- **DNA-47 (Materialization):** This RFC protects the materialization invariant by ensuring that only authored content and site-relative generated files (overwritten by dev-pipeline generators) enter the workpiece. Workspace-absolute generated files are excluded because their owning commands write to the cache clone, not the workpiece.
- **RFC-0473 (Bordbuch):** Bordbuch public projections are workspace-scoped (`systems/{system}/public/.well-known/bordbuch*`). `bordbuch.generate` writes to the cache clone via `resolveCachePath`. This RFC ensures these files are not leaked into the workpiece.
- **RFC-0568 (Clone-based materialization):** The clone-based approach copies git-tracked content from the cache clone. Workspace-absolute generated files may be git-tracked in the cache clone but are not authored content — they are generated artifacts. This RFC filters them at the copy stage.
- **RFC-0597 (Materialization optimization):** RFC-0597 introduced `STERNSYSTEM_DATA_PATHS` and the `public/` copy. This RFC amends the copy logic to filter workspace-absolute generated files.

## Design

### Approach

No new CLI commands or flags. The change adds a filtering step to the `public/` copy logic in `runMissionMaterialize`:

1. Before copying `public/` from the cache clone to the staging directory, collect all workspace-absolute generated paths from `GENERATOR_OWNERSHIP_MAP` (entries where `path` starts with `systems/{system}/`).
2. Expand the `{system}` placeholder with the current `systemId`.
3. Strip the `systems/{system}/` prefix to get the relative path within the cache clone (e.g., `public/.well-known/bordbuch.json`).
4. During the `public/` copy, skip any file whose relative path matches a workspace-absolute generated path.

### TypeScript contracts

```ts
import { GENERATOR_OWNERSHIP_MAP } from "@warpgogol/site-kernel-checks";

function getWorkspaceAbsoluteGeneratedPaths(systemId: string): Set<string> {
  const prefix = `systems/${systemId}/`;
  const paths = new Set<string>();
  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    if (entry.path.startsWith(prefix)) {
      const relativePath = entry.path.slice(prefix.length);
      paths.add(relativePath);
    }
  }
  return paths;
}
```

`GENERATOR_OWNERSHIP_MAP` must be re-exported from `packages/os/site-kernel-checks/src/index.ts` to make it importable from `@warpgogol/site-kernel-handoff` via the main entry point. This follows the existing import pattern in `mission-materialize.ts` (line 59) which already imports from `@warpgogol/site-kernel-checks`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | Add filtering logic to the `public/` copy step |
| `packages/os/site-kernel-checks/src/index.ts` | Re-export `GENERATOR_OWNERSHIP_MAP` and `OwnershipEntry` from the main entry point to enable cross-package import |
| `packages/os/site-kernel-handoff/src/tests/` | Regression test verifying workspace-absolute generated files are excluded from the workpiece |

### Failure modes

- **No workspace-absolute generated files in ownership map:** The filter set is empty, the copy proceeds as before. No change in behavior.
- **New workspace-absolute generated file added to ownership map:** Automatically filtered on next materialization. No code change needed.
- **Glob patterns in ownership path:** Currently, all workspace-absolute entries use concrete paths (no globs). If a future entry uses a glob pattern (e.g., `systems/{system}/public/.well-known/*.json`), the filter must use picomatch to match. This is a future concern — the current implementation handles concrete paths only and can be extended if globs are introduced.
- **File exists in cache clone but not in ownership map:** Copied to workpiece as before. This is correct — only ownership-map-registered files are filtered.

## Rollout

- **Immediate effect:** All `mission.materialize` invocations filter workspace-absolute generated files from the `public/` copy. No flag day, no migration path — the fix is transparent.
- **Existing missions:** Re-materialization of any existing mission automatically benefits from the fix.
- **New missions:** First materialization filters workspace-absolute generated files from the start.
- **New workspace-absolute generators:** When a new command is added to `GENERATOR_OWNERSHIP_MAP` with a `systems/{system}/...` path, its output is automatically filtered from the workpiece copy on the next materialization. No code change needed in `mission-materialize.ts`.
- **Pipeline integration:** No pipeline definition changes. The filtering happens before the pipeline runs, during the data-path copy stage.

## Alternatives considered

1. **Point removal of bordbuch files only.** Rejected because it is fragile — every new workspace-absolute generated file would require a manual update to the removal list in `mission-materialize.ts`. The ownership-map-driven filter is self-maintaining.

2. **Add `bordbuch.generate` to the `build.prepare.dev` pipeline.** Rejected because `bordbuch.generate` writes to the cache clone (`resolveCachePath`), not to the workpiece. Even if added to the dev pipeline, it would not write bordbuch projections to the workpiece — the orphan files from the data-path copy would remain.

3. **Exempt `public/.well-known/bordbuch*` from `ownership.sync.validate` via `STATIC_ASSET_EXEMPT_DIRS`.** Rejected because it masks the root cause (files that should not be in the workpiece) rather than fixing it. Exempting paths from ownership validation weakens the validator's coverage and creates a precedent for adding more exemptions instead of fixing data hygiene.

4. **Do not copy `public/` at all — let all generated files be created by the dev pipeline.** Rejected because `public/` also contains authored static assets (textures, uploaded media, favicon sources) that are not generated by any pipeline command. These must be copied from the cache clone.

## Risks

- **False positive filtering:** If an authored file happens to match a workspace-absolute generated path, it would be incorrectly excluded from the workpiece. This is extremely unlikely because workspace-absolute paths start with `systems/{system}/` and represent generated artifacts (bordbuch projections), not authored content. Authored content lives at site-relative paths like `public/textures/` or `public/uploads/`.
- **Glob pattern support:** Currently, all workspace-absolute entries in `GENERATOR_OWNERSHIP_MAP` use concrete paths. If a future entry uses a glob pattern, the filter must be extended to use picomatch. This is a minor extension, not a redesign.
- **Performance impact:** Negligible — the filter builds a `Set<string>` from the ownership map (currently 2 entries) and checks each file path during the `public/` copy. The check is O(1) per file.
- **Agent confusion:** Agents may wonder why bordbuch files are missing from the workpiece after materialization. The code comment referencing this RFC explains the rationale. No AGENTS.md change is needed — the behavior is transparent to agents.
- **Regression risk:** If a future refactor removes the filtering logic, the orphan file bug returns. Mitigation: a regression test verifies that workspace-absolute generated files are absent from the workpiece after materialization.

## Acceptance criteria

- [x] `mission.materialize` filters workspace-absolute generated files from the `public/` copy by checking against `GENERATOR_OWNERSHIP_MAP` entries with `systems/{system}/` prefixes (evidence: `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:122-143`, `getWorkspaceAbsoluteGeneratedPaths` function)
- [x] `ownership.sync.validate` passes during `build.prepare.dev` with zero OWN-01 diagnostics for bordbuch files (evidence: bordbuch files are filtered at copy time and removed post-clone, `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:811-823`; regression test `src/tests/rfc-0620-workspace-absolute-generated-files-filter.test.ts` verifies bordbuch files are absent from workpiece)
- [x] No files matching `GENERATOR_OWNERSHIP_MAP` workspace-absolute paths appear in the workpiece after materialization (evidence: regression test `src/tests/rfc-0620-workspace-absolute-generated-files-filter.test.ts` test 1 verifies `bordbuch.json` and `bordbuch/index.html` are absent from workpiece `public/`)
- [x] Adding a new workspace-absolute generated file to `GENERATOR_OWNERSHIP_MAP` automatically excludes it from the workpiece copy without code changes in `mission-materialize.ts` (evidence: regression test `src/tests/rfc-0620-workspace-absolute-generated-files-filter.test.ts` test 4 uses a mock entry `test-generated.json` that is also filtered, proving the filter reads from `GENERATOR_OWNERSHIP_MAP` not hardcoded paths)
- [x] Regression test verifies workspace-absolute generated files are absent from the workpiece after materialization (evidence: `packages/os/site-kernel-handoff/src/tests/rfc-0620-workspace-absolute-generated-files-filter.test.ts`, 4 tests all passing)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0620 --json` exits 0, status: pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The hotfix already applied to `mission-materialize.ts` (point removal of bordbuch files) is a temporary measure. This RFC replaces it with an ownership-map-driven filter. The point removal code should be replaced by the filter during implementation.
- Agents MUST NOT add workspace-absolute generated files to `STERNSYSTEM_DATA_PATHS` or exempt them from `ownership.sync.validate` instead of filtering them at the copy stage.
- If a future workspace-absolute generated file uses glob patterns in its ownership path, the filter must be extended to use picomatch. This is a maintenance task, not an RFC-level change.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
