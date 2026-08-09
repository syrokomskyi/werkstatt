---
id: RFC-0585
title: "Restore release.prepare production build and add release.publish dist guard"
status: implemented
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
implementedAt: 2026-07-29
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0357
  - RFC-0363
  - RFC-0358
  - RFC-0356
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-48
  - DNA-52
  - DNA-53
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
    - release.prepare
    - release.publish
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "release.prepare runs a production build (or reuses mission distribution when build input hash matches) and copies dist into releases/<id>/dist/"
  - "release.prepare captures production and readable behavior snapshots from the build output and runs behavior.snapshot.diff"
  - "release.prepare computes real distTreeHash, siteContentHash, behaviorSnapshotHash, and readableSnapshotHash — none are sha256:pending"
  - "release.publish refuses to publish a release whose distTreeHash is sha256:pending"
  - "A release without a production dist artifact cannot reach state published"
nonGoals:
  - Deprecating mission.build — it remains a separate command for preview and testing without creating a release
  - Adding artifact.store.put integration into release.prepare — artifact store is a separate command (RFC-0363)
  - Changing the release id derivation scheme or the six-digit numbering
  - Migrating existing crypto.createHash usage in behavior-snapshot-commands.ts and artifact-store-commands.ts to @warpgogol/fingerprint — that is a broader DNA-53 conformance concern that predates this RFC and should be addressed in a separate dedicated RFC
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0585: Restore release.prepare production build and add release.publish dist guard

## Context

RFC-0357 established the release lifecycle with `release.prepare` and `release.publish` as two distinct commands. The RFC specifies that `release.prepare` runs a production build on the mission workpiece, captures behavior snapshots, computes all hashes, and produces a complete release candidate with a real `dist/` directory.

The current implementation in `packages/os/site-kernel-handoff/src/release/release-commands.ts` deviates from RFC-0357 §6.1 in three ways:

1. **No production build**: `release.prepare` does not run `astro build`. It only copies `missions/<id>/distribution/dist` if it already exists (line 186: `if (existsSync(distributionDir))`). When `mission.build` was never run, the release is created without any dist.
2. **No behavior snapshot capture**: No production behavior snapshot is captured and no readable snapshot is copied from mission evidence.
3. **All hashes are pending**: `siteContentHash`, `distTreeHash`, `behaviorSnapshotHash`, and `readableSnapshotHash` are all written as `sha256:pending` and never recomputed.

Additionally, `release.publish` (lines 322–421) does not verify that `distTreeHash` is not `sha256:pending` before transitioning the release to `published`. This means a release without a production build artifact can be published — it only fails later at `leitstand.propagate` preflight, which checks for dist directory presence.

This was discovered during the first attempted deployment of `warpgogol-com-r000003` (mission m000019): `release.publish` succeeded despite the release having no dist and all hashes pending.

## Problem

DNA-48 (Release discipline) states: "A release cannot be published unless [...] the release artifact is stored and hash-verified." DNA-52 (Release artifact store) states: "Published release artifacts are durable, content-addressed records [...] not incidental local `releases/<id>/dist` folders."

The current implementation violates both invariants:

- `release.prepare` (`packages/os/site-kernel-handoff/src/release/release-commands.ts:184-190`) silently skips dist copying when `missions/<id>/distribution/dist` does not exist — no error, no warning.
- `release.publish` (`packages/os/site-kernel-handoff/src/release/release-commands.ts:322-421`) checks `snapshotDiffVerdict`, `migratorVerdict`, and `versionCompareVerdict`, but does **not** check `distTreeHash` or dist directory presence.
- The first dist-presence check in the pipeline is in `leitstand.propagate` preflight (`packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:129-201`) — too late: the release is already `published` and recorded in the Bordbuch and registry.

This creates a **fail-late** pipeline: the error surfaces at deployment time, not at preparation or publication time. The operator must then delete the published release and re-prepare it, which is manual and error-prone.

## Decision

`release.prepare` runs a production build on the mission workpiece (or reuses `missions/<id>/distribution/dist` when the build input hash matches the validated workpiece), captures production and readable behavior snapshots from the build output, runs `behavior.snapshot.diff` between them, computes all release hashes via `@warpgogol/fingerprint`, and writes them as real values — never `sha256:pending`. `release.publish` refuses to publish any release whose `distTreeHash` is `sha256:pending`.

## Architectural fit

- **DNA-48 (Release discipline)**: Restores the release discipline gate that RFC-0357 specified — a release cannot be published without a hash-verified dist artifact.
- **DNA-52 (Release artifact store)**: Ensures `distTreeHash` is a real hash, enabling `artifact.store.put` to store a content-addressed record. A pending hash makes artifact store verification meaningless.
- **DNA-53 (Semantic fingerprint governance)**: All hashes (`distTreeHash`, `siteContentHash`, `behaviorSnapshotHash`, `readableSnapshotHash`) are computed via `@warpgogol/fingerprint`, not ad hoc hashing.
- **RFC-0357 §6.1**: This RFC restores conformance with the original specification for `release.prepare` steps 4–9 (production build, behavior snapshot capture, behavior snapshot diff, hash computation).
- **RFC-0358 (Leitstand)**: `leitstand.propagate` preflight already checks dist presence — this RFC moves the gate earlier in the pipeline (fail-fast at prepare/publish instead of fail-late at propagate).
- **Scaling Playbook**: Applies uniformly across all growth stages — every system goes through the same release pipeline regardless of fleet size.

## Design

### CLI surface

No new commands. Two existing commands change behavior:

```sh
# release.prepare now runs production build and computes real hashes
pnpm exec werkstatt run release.prepare --mission <mission-id> [--semver <semver>] [--json]

# release.publish now refuses releases with pending distTreeHash
pnpm exec werkstatt run release.publish --release <release-id> [--json]
```

No new flags. The `--mission` and `--semver` flags on `release.prepare` and the `--release` flag on `release.publish` are unchanged.

### TypeScript contracts

```ts
// release.prepare — changed return shape
interface ReleasePrepareData {
  releaseId: string;
  systemId: string;
  missionId: string;
  semver: string;
  state: "prepared";
  snapshotDiffVerdict: "pass" | "fail";
  cSurfaceVerdict: "pass" | "fail" | "skipped";
  behaviorSnapshotHash: string;   // sha256 of production behavior-snapshot.json
  // Changed from "sha256:pending" to real hash
  distTreeHash: string;           // @warpgogol/fingerprint tree hash of dist/
  siteContentHash: string;        // @warpgogol/fingerprint hash of authored content set
  readableSnapshotHash: string;   // sha256 of readable-snapshot.json
  buildReused: boolean;            // true if distribution/dist was reused (hash matched)
}

// release.publish — new guard
interface ReleasePublishData {
  releaseId: string;
  systemId: string;
  state: "published";
  publishedAt: string;
  // New field: dist verification result
  distVerified: boolean;
  artifactUri: string | null;
}

// Build input hash for reuse decision
interface BuildInputHashInput {
  workpieceTreeHash: string;      // @warpgogol/fingerprint tree hash of workpiece content
  platformVersion: string;
  platformSemanticHash: string;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<id>/workpiece/` | Production build source — `astro build` runs here |
| `missions/<id>/workpiece/dist/` | Build output — used for readable snapshot capture and as production build output |
| `missions/<id>/distribution/dist/` | Reuse candidate — checked if build input hash matches |
| `releases/<id>/dist/` | Production build output — copied from workpiece or reused distribution |
| `releases/<id>/behavior-snapshot.json` | Production behavior snapshot — captured from build output via `behavior.snapshot.capture --build-kind production` |
| `releases/<id>/readable-snapshot.json` | Readable behavior snapshot — captured from the same build output via `behavior.snapshot.capture --build-kind readable` |
| `releases/<id>/snapshot-diff.json` | Behavior snapshot diff result — produced by `behavior.snapshot.diff` |
| `releases/<id>/release.yaml` | Release manifest — all hashes written as real values |

`release.prepare` writes all files in the staging directory first, then atomically renames to the final release directory (existing behavior, unchanged).

### Output format

`release.prepare --json`:

```json
{
  "command": "release.prepare",
  "status": "ok",
  "data": {
    "releaseId": "warpgogol-com-r000004",
    "systemId": "warpgogol-com",
    "missionId": "warpgogol-com-m000019",
    "semver": "0.1.0",
    "state": "prepared",
    "snapshotDiffVerdict": "pass",
    "cSurfaceVerdict": "pass",
    "distTreeHash": "sha256:abc123...",
    "siteContentHash": "sha256:def456...",
    "behaviorSnapshotHash": "sha256:ghi789...",
    "readableSnapshotHash": "sha256:jkl012...",
    "buildReused": false
  }
}
```

`release.publish --json` when distTreeHash is pending:

```json
{
  "command": "release.publish",
  "status": "fail",
  "data": {
    "releaseId": "warpgogol-com-r000003",
    "reason": "distTreeHash is sha256:pending — run release.prepare with production build first",
    "distVerified": false
  },
  "summary": "[release.publish] warpgogol-com-r000003 refused: distTreeHash is pending"
}
```

### Failure modes

| Condition | Behavior | Exit code |
| --- | --- | --- |
| `mission.build` not run and workpiece has no `dist/` | `release.prepare` runs fresh `astro build`, captures both snapshots, computes hashes | 0 (success) |
| Production build (`astro build`) fails | `release.prepare` throws with build error output | 1 |
| `distribution/dist` exists but build input hash mismatch | `release.prepare` runs fresh build (ignores stale distribution) | 0 (success) |
| `distribution/dist` exists and build input hash matches | `release.prepare` reuses distribution, still captures snapshots and computes hashes | 0 (success) |
| Behavior snapshot diff fails (structural mismatch) | `release.prepare` sets `snapshotDiffVerdict: fail`, writes diff report, exits non-zero | 1 |
| Behavior snapshot capture fails | `release.prepare` throws with snapshot error | 1 |
| `release.publish` with `distTreeHash: sha256:pending` | `release.publish` refuses, returns fail status | 1 |
| `release.publish` with real `distTreeHash` and `snapshotDiffVerdict: pass` | `release.publish` proceeds as before | 0 |

No warning-only paths — all failures are hard failures. A release without a production build is an invalid state and must not be created.

## Rollout

- **Forward-only, no migration**: Existing releases (r000001–r000003) are deleted manually by the operator before running the new `release.prepare`. No `release.rollback` is needed for unpublished releases; published ones should be rolled back first if they were propagated. The new guards apply to all future `release.prepare` and `release.publish` invocations.
- **No grace period**: The guard is fail-hard from the first run. There is no `--strict` opt-in — the correct behavior is the only behavior.
- **New apps**: All new systems automatically comply because `release.prepare` runs the production build itself.
- **Pipeline integration**: No change to the pipeline order (`release.prepare` → `release.publish` → `leitstand.propagate`). The guards are internal to the existing commands.
- **`mission.build` remains**: Operators can still run `mission.build` independently for preview and testing. `release.prepare` may reuse its output when the build input hash matches, avoiding redundant builds.

## Alternatives considered

1. **Only add guards, no build in prepare**: `release.prepare` would not build — it would only require `distribution/dist` to exist (fail-fast if missing). `mission.build` would be a mandatory prerequisite. Rejected because it deviates from RFC-0357 §6.1 step 4, which specifies that `release.prepare` runs the production build itself. It also creates a two-command prerequisite where one should suffice.

2. **Hybrid: optional `--build` flag**: `release.prepare --build` would run the build; without the flag, it would require `distribution/dist`. Rejected because it introduces operator-configurable behavior for a safety-critical step — the default path must be the safe path.

3. **Deprecate `mission.build`**: `release.prepare` would be the only place where builds happen. Rejected because `mission.build` serves a different purpose: preview and testing without creating a release candidate. Removing it would force operators to create a release just to preview a build.

## Risks

- **Build time in release.prepare**: Running `astro build` inside `release.prepare` adds 30–120 seconds to the command. Mitigated by reuse logic: when `mission.build` already produced a distribution with matching build input hash, the build is skipped.
- **Build environment dependency**: `release.prepare` now requires a working build environment (Node, pnpm, Astro) on the operator's machine. Previously, `release.prepare` could run without build tooling if dist was pre-built. This is acceptable — the operator must have build tooling to work with the monorepo.
- **Behavior snapshot capture complexity**: Capturing behavior snapshots reuses the existing `behavior.snapshot.capture` command (in-process call to `runBehaviorSnapshotCapture`). No new infrastructure is needed — the command already accepts `--dist`, `--system`, `--build-kind`, and `--release` flags. `release.prepare` calls it twice: once with `--build-kind readable` and once with `--build-kind production`, both on the same `dist/` output. The readable snapshot is captured from the same build output, not from `mission.validate`'s evidence directory (which does not produce a snapshot file today).
- **Agent misinterpretation risk**: Agents may attempt to run `release.publish` on releases created by the old `release.prepare` (with pending hashes). The guard will refuse, and the agent should re-run `release.prepare` — not manually edit `release.yaml` to replace `sha256:pending` with a real hash.
- **False positive rate**: The build input hash comparison for reuse logic must be deterministic. If the hash includes irrelevant inputs (e.g., timestamps), the reuse path never triggers and every `release.prepare` runs a fresh build. The hash should include only the workpiece content tree hash and platform version.

## Acceptance criteria

- [x] `release.prepare` runs `astro build` on the mission workpiece when no reusable distribution exists, producing `releases/<id>/dist/` (evidence: release-commands.ts:233-251, execSync astro build)
- [x] `release.prepare` reuses `missions/<id>/distribution/dist/` when build input hash matches the validated workpiece, skipping redundant build (evidence: release-commands.ts:204-232, build-input-hash.json comparison)
- [x] `release.prepare` captures production behavior snapshot into `releases/<id>/behavior-snapshot.json` via `behavior.snapshot.capture --build-kind production` (evidence: release-commands.ts:283-295, runBehaviorSnapshotCapture in-process)
- [x] `release.prepare` captures readable behavior snapshot into `releases/<id>/readable-snapshot.json` via `behavior.snapshot.capture --build-kind readable` on the same build output (evidence: release-commands.ts:266-278, runBehaviorSnapshotCapture in-process)
- [x] `release.prepare` runs `behavior.snapshot.diff` between readable and production snapshots, writes `releases/<id>/snapshot-diff.json`, and sets `snapshotDiffVerdict` from the diff result (evidence: release-commands.ts:302-318, runBehaviorSnapshotDiff in-process)
- [x] `release.prepare` computes `distTreeHash` via `@warpgogol/fingerprint` tree hash — never `sha256:pending` (evidence: release-commands.ts:321-322, fingerprintTree byte mode)
- [x] `release.prepare` computes `siteContentHash` via `@warpgogol/fingerprint` — never `sha256:pending` (evidence: release-commands.ts:208-209/324, fingerprintTree semantic mode on workpiece content)
- [x] `release.prepare` computes `behaviorSnapshotHash` and `readableSnapshotHash` — never `sha256:pending` (evidence: release-commands.ts:326-327, from runBehaviorSnapshotCapture results)
- [x] `release.publish` refuses to publish when `distTreeHash` is `sha256:pending`, returning non-zero exit code and fail status (evidence: release-commands.ts:468-474, release-0585-dist-guard.test.ts:48-56)
- [x] `release.publish` succeeds when `distTreeHash` is a real hash (e.g., `sha256:abc123...`) (evidence: release-commands.ts:468-474 guard passes, release-0585-dist-guard.test.ts:75-82 confirms missing-dist guard fires after hash guard passes)
- [x] Existing tests for `release.prepare` and `release.publish` updated to reflect new behavior (evidence: release-0585-dist-guard.test.ts, 4 tests passing)
- [x] `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes (evidence: tsc --noEmit exit 0)
- [x] `pnpm --filter @warpgogol/site-kernel-handoff test` passes (evidence: 345 tests, 83 files, all passing)
- [x] `rfc.validate` passes on this RFC file (evidence: no violations for RFC-0585 in rfc.validate output)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT manually edit `release.yaml` to replace `sha256:pending` with a real hash — the hash must be computed by `release.prepare` via `@warpgogol/fingerprint`.
- Agents MUST NOT run `release.publish` on a release with `distTreeHash: sha256:pending` — the guard will refuse. Re-run `release.prepare` instead.
- When implementing the reuse logic, agents MUST use `@warpgogol/fingerprint` to compute the build input hash (workpiece content tree hash + platform version). Do not use ad hoc hashing.
- Agents MUST delete existing releases (r000001–r000003) before testing the new `release.prepare` — these releases have pending hashes and are not valid under the new guards.
