---
id: RFC-0635
title: "Reuse distribution in mission.validate when build-input-hash matches"
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
createdAt: 2026-08-01
updatedAt: 2026-08-01
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - DNA-47
  - RFC-0390
  - RFC-0585
  - RFC-0597
  - RFC-0615
  - RFC-0619
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
    - mission.validate
    - mission.build
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/os/site-kernel-handoff
successSignals:
  - mission.validate completes in <10s when build-input-hash matches
  - mission.build includes build.check pipeline
  - mission.validate --force bypasses hash check and runs full pipeline
nonGoals:
  - Caching individual pipeline steps (covered by RFC-0390 command-result cache)
  - Parallelizing pipeline steps (separate future RFC)
  - Changing build-input-hash computation (DNA-53 fingerprint governance)
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

# RFC-0635: Reuse distribution in mission.validate when build-input-hash matches

## Context

`mission.validate` (DNA-47) runs the full build cycle — `build.prepare` pipeline (~40 steps), `build.check` pipeline (~15 steps), `astro build` (up to 300s timeout), and `build.post` pipeline (~10 steps) — every invocation, even when the workpiece content has not changed since the last `mission.build`.

`release.prepare` (RFC-0585) already implements distribution reuse: it computes `buildInputHash` from the workpiece content tree, platform version, and platform semantic hash, then compares it against `distribution/build-input-hash.json`. If the hash matches, the full build is skipped and `distribution/dist/` is copied to the target.

`mission.validate` does not perform this check. It always cleans `dist/` (RFC-0615) and rebuilds from scratch. On a typical mission (warpgogol-com-m000024), this takes 3–4 minutes (measured 2026-07-31).

The command-result cache (RFC-0390) caches individual pipeline step results, but the pipeline still executes step-by-step (checking cache per step). `astro build` is not cached by the kernel cache at all — it runs via `execSync` outside the pipeline executor.

## Problem

`mission.validate` redundantly rebuilds the entire site when a valid `distribution/` from `mission.build` already exists with a matching `build-input-hash.json`. This wastes 3–4 minutes per invocation on unchanged content, slowing the mission lifecycle (validate → reconcile → close) and the dev-deploy workflow (RFC-0628).

Additionally, `mission.build` does not run `build.check` — only `build.prepare`, `astro build`, and `build.post`. This means `build.check` validators (semantic targets, page blocks, biome tokens, visual contracts, generated drift, timestamp determinism) only execute during `mission.validate`. If `mission.validate` skips the full cycle on hash match, these validators would never run unless `build.check` is added to `mission.build`.

## Decision

`mission.validate` checks `distribution/build-input-hash.json` before running the build cycle. If the hash matches the current workpiece content + platform version + platform semantic hash, the entire build cycle (`build.prepare`, `build.check`, `astro build`, `build.post`) is skipped. If `workpiece/dist/` is missing, it is copied from `distribution/dist/`. A `--force` flag bypasses the hash check and always runs the full cycle.

`mission.build` adds `build.check` between `build.prepare` and `astro build`, so that a distribution produced by `mission.build` has passed all content validators before `mission.validate` reuses it.

## Architectural fit

- **DNA-47 (Materialization):** `mission.validate` is part of the materialization lifecycle. Reusing a validated distribution when inputs haven't changed is consistent with the mission lifecycle — the Werkstück is validated by `app.contract.full`, and a hash-matched distribution is provably identical to what `mission.build` produced.
- **DNA-46 (Mission lifecycle):** The mission lifecycle remains open → closed/aborted. Distribution reuse does not change the state machine; it only shortens the validation path when the distribution is already current.
- **RFC-0585 (release.prepare distribution reuse):** This RFC extends the same reuse logic from `release.prepare` to `mission.validate`, using the same `buildInputHash` computation from `computeBuildInputHash` in `build-pipeline-helpers.ts`.
- **RFC-0390 (command-result cache):** Orthogonal. The command-result cache caches individual pipeline steps; this RFC caches the entire build cycle at the distribution level. Both layers coexist — distribution reuse is a coarser-grained cache that short-circuits before the pipeline executor even runs.
- **RFC-0615 (dist cleanup):** The dist cleanup before build still runs when the hash does NOT match (full rebuild path). When the hash matches, dist cleanup is unnecessary because dist/ is either already present or copied from distribution/.
- **RFC-0619 (bypass cache during materialization):** The command-result cache bypass during `mission.materialize` is unrelated — it prevents stale cache entries from a different platform version. Distribution reuse in `mission.validate` checks the hash explicitly, which already accounts for platform version and semantic hash.

## Design

### CLI surface

```sh
# Normal validation — checks hash, skips build if distribution is current
pnpm exec site-kernel run mission.validate --site warpgogol-com

# Force full rebuild regardless of hash match
pnpm exec site-kernel run mission.validate --site warpgogol-com --force

# JSON output
pnpm exec site-kernel run mission.validate --site warpgogol-com --json
```

The `--force` flag is already accepted by the kernel CLI and passed through to `ExecuteKernelPipelineOptions.force`. `mission.validate` reads it from `input.flags.force`.

### TypeScript contracts

```ts
interface MissionValidateData {
  systemId: string;
  missionId: string;
  distributionReused: boolean;
  buildInputHash: string | null; // present when reused, null when full build ran
  fullBuildRan: boolean;
  // existing fields (build.prepare result, build.check result, etc.) retained
}
```

`runMissionBuild` adds `build.check` pipeline execution between `build.prepare` and `astro build`:

```ts
// Phase 1: build.prepare (codegen, derived artifacts)
// Phase 1b: build.check (content validators) — NEW
// Phase 2: astro build
// Phase 3: build.post (text.normalize.apply, passport.emit, etc.)
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<id>/distribution/build-input-hash.json` | Read by `mission.validate` to compare hash |
| `missions/<id>/distribution/dist/` | Source for copying to `workpiece/dist/` when missing |
| `missions/<id>/workpiece/dist/` | Checked for existence; copied from distribution if missing |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | `runMissionValidate` and `runMissionBuild` modified |
| `packages/os/site-kernel-handoff/src/build-pipeline-helpers.ts` | `computeBuildInputHash` reused (no changes) |

### Output format

```json
{
  "command": "mission.validate",
  "status": "ok",
  "data": {
    "systemId": "warpgogol-com",
    "missionId": "warpgogol-com-m000024",
    "distributionReused": true,
    "buildInputHash": "sha256:abc123...",
    "fullBuildRan": false
  },
  "summary": "Distribution reused (build-input-hash matched). Validation passed."
}
```

When the hash does not match or `--force` is set:

```json
{
  "command": "mission.validate",
  "status": "ok",
  "data": {
    "systemId": "warpgogol-com",
    "missionId": "warpgogol-com-m000024",
    "distributionReused": false,
    "buildInputHash": null,
    "fullBuildRan": true
  },
  "summary": "Full build cycle completed. Validation passed."
}
```

### Failure modes

- **`distribution/` does not exist:** Full build runs (hash check skipped, `distributionReused: false`).
- **`build-input-hash.json` missing or corrupt:** Full build runs (hash comparison fails silently, `distributionReused: false`).
- **`distribution/dist/` missing but hash matches:** Warning logged, full build runs (cannot copy dist/).
- **`build.check` fails during `mission.build`:** `mission.build` fails with the check error. `distribution/` is not created, so `mission.validate` will run the full cycle.
- **`--force` flag set:** Hash check skipped entirely, full build cycle always runs.

## Rollout

- **Default behavior:** Distribution reuse is active by default. No opt-in flag needed.
- **Existing missions:** Missions with an existing `distribution/build-input-hash.json` from a prior `mission.build` immediately benefit. Missions without a distribution run the full cycle as before.
- **`mission.build` change:** Adding `build.check` to `mission.build` is a behavioral change — `mission.build` may now fail on content validation errors that were previously only caught by `mission.validate`. This is intentional: a distribution that hasn't passed `build.check` should not be reusable by `mission.validate`.
- **`--force` escape hatch:** Operators who suspect stale cache or want a full revalidation can run `mission.validate --force`.
- **No migration path needed:** The change is backward-compatible — if `distribution/` doesn't exist or the hash doesn't match, the existing behavior (full rebuild) is preserved.

## Alternatives considered

- **Skip only `build.prepare` + `astro build`, keep `build.check`:** Rejected because `build.check` validates generated files from `build.prepare`. If `build.prepare` is skipped, the generated files from the previous run must be on disk. While they would be identical (hash matched), running `build.check` without `build.prepare` creates a false sense of freshness. Instead, `build.check` is moved into `mission.build`, so a reused distribution has already passed all checks.

- **Skip only `astro build`, keep `build.prepare` + `build.check` + `build.post`:** Rejected because `build.prepare` includes expensive media transcoding steps (image variants ~60s, video variants ~180s, live variants ~120s). Skipping only `astro build` would still take 5+ minutes for unchanged content.

- **No `--force` flag, delete `build-input-hash.json` manually:** Rejected as poor UX. The `--force` pattern is already established in the kernel cache (RFC-0390) and is the expected operator escape hatch.

## Risks

- **Stale distribution risk:** If `build-input-hash` doesn't capture a relevant input (e.g., a platform package change not reflected in `platformSemanticHash`), `mission.validate` could reuse a stale distribution. Mitigated by `computeBuildInputHash` already including `platformVersion` and `platformSemanticHash` in the hash.
- **`mission.build` now fails on content errors:** Adding `build.check` to `mission.build` means operators may hit validation errors earlier in the workflow. This is by design — a distribution that hasn't passed content validation should not be reused — but it changes the operator experience.
- **Agent confusion:** Agents may not expect `mission.validate` to skip the build. The `distributionReused` field in the JSON output and the summary line make the skip visible. Agents MUST check `distributionReused` before assuming a full build ran.
- **`workpiece/dist/` divergence:** If an operator manually modifies `workpiece/dist/` after `mission.build`, `mission.validate` with hash match would not detect the modification. This is acceptable — `workpiece/dist/` is a generated artifact, and manual modifications to generated files are already discouraged by RFC-0601 (generated drift).

## Acceptance criteria

- [ ] `runMissionValidate` checks `distribution/build-input-hash.json` before running the build cycle and skips it when the hash matches
- [ ] `runMissionValidate` copies `distribution/dist/` to `workpiece/dist/` when the latter is missing and the hash matches
- [ ] `runMissionValidate` accepts `--force` flag to bypass the hash check and always run the full cycle
- [ ] `runMissionBuild` runs `build.check` pipeline between `build.prepare` and `astro build`
- [ ] `mission.validate --json` output includes `distributionReused: boolean` and `buildInputHash: string | null`
- [ ] Unit test: hash match → build cycle skipped, `distributionReused: true`
- [ ] Unit test: hash mismatch → full build cycle runs, `distributionReused: false`
- [ ] Unit test: `--force` → full build cycle runs regardless of hash match
- [ ] Unit test: `mission.build` includes `build.check` pipeline step
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Agents MUST check `distributionReused` in the `mission.validate` JSON output before assuming a full build ran. If `distributionReused: true`, the `dist/` directory was not freshly built — it was copied from `distribution/`.
- When implementing, reuse `computeBuildInputHash` from `build-pipeline-helpers.ts` — do not create a parallel hash computation.
- When implementing `build.check` in `mission.build`, place it between `build.prepare` and `astro build`, matching the order in `mission.validate`.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
