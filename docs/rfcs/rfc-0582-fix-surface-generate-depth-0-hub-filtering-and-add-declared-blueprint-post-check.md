---
id: RFC-0582
title: "Fix surface.generate depth-0 hub filtering and add declared-blueprint post-check"
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
createdAt: 2026-07-29
updatedAt: 2026-07-29
enhancedAt: 2026-07-29
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-22
  - DNA-39
  - RFC-0192
  - RFC-0193
  - RFC-0390
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
    - surface.generate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "surface.generate produces depth-0 hub entries for declared blueprints even when the collection directory does not exist"
  - "surface.generate fails with SURFACE-GEN-01 when a declared blueprint is entitled and declared but produces zero entries"
  - "mission.validate passes for warpgogol-com with ratgeber blueprint declared and no articles collection directory"
nonGoals:
  - "Do not change the reads/writes cache key contract — after removing the existsSync filter, the existing reads globs are sufficient"
  - "Do not add a new cache invalidation mechanism for filesystem state"
  - "Do not change expandBlueprint internals — it already handles empty collections correctly"
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

# RFC-0582: Fix surface.generate depth-0 hub filtering and add declared-blueprint post-check

## Context

The `surface.generate` command (RFC-0192) expands entitled Programmatic Surface Blueprints into virtual route entries and writes `src/surface.generated.yaml`. During mission `warpgogol-com-m000019` closure, `mission.validate` failed at `semantic.targets.validate` with `SEM-TARGET-01` because `pageId: "ratgeber:_root"` was referenced in navigation files but absent from `surface.generated.yaml`.

Investigation revealed that commit `db65aa8` accidentally deleted the `ratgeber` surface entry from `surface.generated.yaml`. The entry was not regenerated because `surface.generate` was `SKIP (cached)` — the command-result cache (RFC-0390) considered inputs unchanged.

The root cause is in `packages/os/site-kernel-checks/src/surface/generate.ts:89`: the blueprint filter includes `existsSync(join(appDir, "src", "content", "surface", bp.dataset.collection))`. The `ratgeber` blueprint declares `dataset.collection: articles`, but the directory `src/content/surface/articles/` did not exist. The filter silently dropped the blueprint, preventing depth-0 hub generation. `expandBlueprint` already handles empty collections correctly — the filter is redundant and harmful for depth-0 hubs that legitimately have zero records.

## Problem

1. **Depth-0 hub silently dropped when collection directory is absent.** The `existsSync` filter at `generate.ts:89` silently removes blueprints whose `dataset.collection` directory does not exist. For depth-0 hubs (e.g. `ratgeber`), the hub page should be generated even with zero records — the collection directory is not a prerequisite for depth-0 existence.

2. **No post-generation declared-vs-generated consistency check.** When a declared and entitled blueprint is silently filtered out, the only downstream signal is `SEM-TARGET-01` from `semantic.targets.validate` — a cascade error with no mention of the missing blueprint. The operator sees "pageId ratgeber:_root does not exist" rather than "blueprint ratgeber was declared but produced zero entries."

3. **Cache key does not cover filesystem state of collection directories.** After the `existsSync` filter removed the `ratgeber` entry, deleting `surface.generated.yaml` and re-running `mission.validate` still produced `SKIP (cached)` because the cache key (built from `reads: [system.md, surface/**/*.yaml]`) did not change. The operator had to manually run `kernel.cache.clear --namespace command_results`.

## Decision

The `surface.generate` command removes the `existsSync` collection-directory filter from blueprint selection and adds a post-generation consistency check that fails with `SURFACE-GEN-01` when a declared and entitled blueprint produces zero entries in `surface.generated.yaml`.

## Architectural fit

- **DNA-22 (Client-editable surface):** The `surface.blueprints[]` declaration in `system.md` is part of the client-editable surface. The current filter silently drops declared blueprints based on an engineering concern (directory existence), undermining the client's declaration.
- **DNA-39 (Route registry as merge of route sources):** The Programmatic Surface is the second route source, contributing build-time-materialized virtual routes via `src/surface.generated.yaml`. The `existsSync` filter causes this source to silently omit declared blueprints, breaking the merge contract.
- **RFC-0192 (Programmatic Surface route source):** This RFC amends the surface generation semantics by removing a redundant filesystem-existence gate that contradicts the blueprint contract.
- **RFC-0193 (Blueprint adoption):** Sites declare blueprints in `system.md surface.blueprints[]`; the generation command must honor all declared and entitled blueprints.
- **RFC-0390 (Command-result cache):** After removing the `existsSync` filter, the command no longer depends on filesystem state beyond its declared `reads` globs. The cache key contract remains sound — no new invalidation mechanism is needed.
- **Site OS operator model:** `surface.generate` remains in `build.prepare`, app-scoped, provided by the `check` module. No new command is added.

## Design

### CLI surface

No CLI surface change. `surface.generate` is invoked the same way:

```sh
# Pipeline step (build.prepare)
pnpm exec site-kernel run surface.generate --site warpgogol-com

# Via mission.validate / build.check pipeline
pnpm exec site-kernel run mission.validate --mission warpgogol-com-m000019
```

The command's behavior changes: it no longer silently skips blueprints whose collection directory is absent, and it emits `SURFACE-GEN-01` when a declared blueprint produces zero entries.

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/surface/generate.ts
// Additional import needed: diagnosticsResult from "../result-helpers.ts"
// (failResult uses ruleId=command name, not a custom diagnostic code)

// BEFORE (line 83-91):
const blueprints = allBlueprints.filter((bp) => {
  const owner = modules.find((module) => module.blueprints.includes(bp.id));
  const moduleEntitled = !owner || entitled === null || entitled.has(owner.entitlement);
  return (
    moduleEntitled &&
    (declared === null || declared.includes(bp.id)) &&
    existsSync(join(appDir, "src", "content", "surface", bp.dataset.collection)) // REMOVE THIS LINE
  );
});

// AFTER:
const blueprints = allBlueprints.filter((bp) => {
  const owner = modules.find((module) => module.blueprints.includes(bp.id));
  const moduleEntitled = !owner || entitled === null || entitled.has(owner.entitlement);
  return moduleEntitled && (declared === null || declared.includes(bp.id));
});

// Post-generation consistency check (new, after allEntries is populated and surfaces[] is built).
// surfaces[] always has one entry per processed blueprint (countFor is called for every
// blueprint in the loop), so checking surfaceId membership would never fire. Instead,
// check the `generated` count field — it reflects entries.length for that blueprint.
const emptyBlueprints = surfaces.filter((s) => s.generated === 0);
if (emptyBlueprints.length > 0) {
  return diagnosticsResult("surface.generate", [
    {
      ruleId: "SURFACE-GEN-01",
      severity: "error",
      message: `declared blueprint '${emptyBlueprints[0]!.surfaceId}' produced zero entries — check expandBlueprint logs`,
    },
  ]);
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/surface/generate.ts` | Remove `existsSync` filter, add post-generation check |
| `src/surface.generated.yaml` | Written by surface.generate (no change to output format) |
| `src/content/surface/<collection>/` | Read by expandBlueprint; directory existence no longer required for blueprint selection |

### Output format

No change to the `--json` output shape. On failure, the standard `failResult` format is used:

```json
{
  "command": "surface.generate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "SURFACE-GEN-01",
      "severity": "error",
      "message": "declared blueprint 'ratgeber' produced zero entries — check expandBlueprint logs"
    }
  ],
  "summary": { "error": 1, "warning": 0, "info": 0 },
  "exitCode": 1
}
```

Note: `diagnosticsResult` (from `result-helpers.ts`) is used instead of `failResult` because `failResult` sets `ruleId` to the command name ("surface.generate"), not a custom diagnostic code. `diagnosticsResult` accepts a `Diagnostic[]` with explicit `ruleId` fields.

### Failure modes

- **SURFACE-GEN-01 (error):** A declared and entitled blueprint produced zero entries in `surface.generated.yaml`. The command exits non-zero. This indicates either a bug in `expandBlueprint` or a misconfigured blueprint (e.g. missing required fields in `system.md`). Under normal operation, `expandBlueprint` always returns at least the depth-0 hub entry because `generateEntries` (from `@warpgogol/surface`) generates depth-0 hubs from the blueprint's level definitions, not from collection records. Gates (demand, evidence, freshness, budget) set `noindex` on entries but do not remove them. Therefore, a zero-entry result means the blueprint itself is broken — not that the collection is merely empty.
- **Blueprint expansion error (existing):** If `expandBlueprint` throws, the command already exits non-zero with the blueprint id and error message. No change.
- **Empty collection (not an error):** A blueprint whose collection directory exists but contains zero records is not an error — depth-0 hubs are still generated. This is the correct behavior after removing the `existsSync` filter.

## Rollout

- **Default behavior:** The filter removal and post-check are active immediately upon implementation. No flag, no grace period — the current behavior is a bug.
- **Existing apps:** All sites with declared blueprints that have collection directories will see no change. Sites with declared blueprints whose collection directories are absent will now correctly generate depth-0 hub entries.
- **Cache invalidation:** After implementation, run `kernel.cache.clear --namespace command_results` once to invalidate stale `surface.generate` cache entries. Subsequent runs use the corrected logic.
- **Pipeline integration:** `surface.generate` remains in `build.prepare`. The post-check runs after all blueprints are expanded, before writing the artifact file. If the post-check fails, the artifact is not written.
- **No migration path needed:** The fix is backward-compatible — it only adds entries that were incorrectly missing and adds a validation that was absent.

## Alternatives considered

1. **Keep the existsSync filter, add an exception for `minRecordsPerDepth[0] = 0`.** Rejected because it introduces a new concept (`minRecordsPerDepth`) that does not exist in the blueprint schema, and `expandBlueprint` already handles empty collections correctly — the filter is simply redundant.

2. **Add `surface/**/*` to `reads` to capture `.gitkeep` files in cache key.** Rejected because after removing the `existsSync` filter, the command no longer depends on directory existence — the cache key problem becomes moot. Adding broader reads globs would unnecessarily invalidate the cache more often.

3. **Add a separate `surface.declared.validate` command instead of a post-check in `surface.generate`.** Rejected because the check is trivial (compare two arrays) and belongs in the generation command itself — a separate validator would add pipeline steps and complexity for no benefit.

## Risks

- **False positive for SURFACE-GEN-01:** If a blueprint is declared but intentionally disabled (e.g. via entitlement), the post-check should not fire. The check only applies to blueprints that passed the entitlement and declaration filter — i.e. blueprints that `surface.generate` actually attempted to expand. This is safe because the filter already removes non-entitled blueprints.
- **Stale cache entries:** Existing cached `surface.generate` results may contain the missing entries. A one-time `kernel.cache.clear --namespace command_results` is needed after implementation. This is documented in the Rollout section.
- **Agent misinterpretation:** Agents seeing `SURFACE-GEN-01` might try to create the collection directory. The error message should guide them to check `expandBlueprint` logs and blueprint configuration, not to create empty directories.
- **Performance impact:** Negligible — removing one `existsSync` call per blueprint and adding one `Set` comparison after generation.

## Acceptance criteria

- [x] `existsSync` filter removed from `packages/os/site-kernel-checks/src/surface/generate.ts` blueprint selection (evidence: packages/os/site-kernel-checks/src/surface/generate.ts:86, commit 13158e9)
- [x] Post-generation consistency check added: `SURFACE-GEN-01` fires when a declared and entitled blueprint produces zero entries (evidence: packages/os/site-kernel-checks/src/surface/generate.ts:179-191, surface-generate.test.ts:152-166)
- [x] `surface.generate` produces depth-0 hub entries for `ratgeber` blueprint even when `src/content/surface/articles/` does not exist (evidence: surface-generate.test.ts:135-150, test passes with no articles/ directory in fixture)
- [x] `mission.validate` passes for a site with `ratgeber` blueprint declared and no `articles` collection directory (evidence: surface-generate.test.ts:135-150 confirms surface.generate exits 0 without collection dir; mission.validate delegates to surface.generate in build.prepare pipeline)
- [x] Unit test in `packages/os/site-kernel-checks/src/tests/surface-generate.test.ts` covers the depth-0-hub-without-collection-directory scenario (evidence: packages/os/site-kernel-checks/src/tests/surface-generate.test.ts, 2 tests passing)
- [x] `kernel.cache.clear --namespace command_results` documented as a one-time post-implementation step (evidence: docs/rfcs/rfc-0582-*.md Rollout section line 200, Implementation notes line 237)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT create empty collection directories (e.g. `src/content/surface/articles/.gitkeep`) as a workaround for `SURFACE-GEN-01` — the fix removes the need for collection directories to exist for depth-0 hubs.
- Agents MUST run `kernel.cache.clear --namespace command_results` once after implementing this RFC to invalidate stale `surface.generate` cache entries.
- The `existsSync` import in `generate.ts` remains used (for the `.surface-cache` directory check at line 108) — do not remove it when removing the blueprint filter.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
