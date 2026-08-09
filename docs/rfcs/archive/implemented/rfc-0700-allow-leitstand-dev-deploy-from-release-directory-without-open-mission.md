---
id: RFC-0700
title: "Allow leitstand.dev-deploy from release directory without open mission"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt: 2026-08-05
closedAt:
supersedes: []
supersededBy:
  - RFC-0724
amends:
  - RFC-0628
amendedBy:
  - RFC-0726
related:
  - RFC-0628
  - RFC-0666
  - RFC-0698
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
    - leitstand.dev-deploy
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "Operator can deploy an existing release to dev without opening a new mission"
  - "leitstand.dev-deploy --release <id> deploys from releases/<id>/dist/ and exits 0"
  - "leitstand.dev-deploy without --release behaves exactly as before (requires open mission)"
nonGoals:
  - "Does not change leitstand.propagate, leitstand.promote, or leitstand.rollback"
  - "Does not change the release state machine or Axiom evidence gate"
  - "Does not add registry tracking or bordbuch entries for dev deploys (same as RFC-0628)"
  - "Does not run Axiom checks in the release path — the release was already validated during release.prepare"
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

# RFC-0700: Allow leitstand.dev-deploy from release directory without open mission

## Context

`leitstand.dev-deploy` (RFC-0628) is the primary mechanism for deploying a mission workpiece to the dev channel. It requires an open mission (`entry.currentMission` in `systems/registry.yaml`) — if no mission is open, the command throws `[leitstand.dev-deploy] system '<id>' has no active mission`.

After `mission.close`, the workpiece is frozen and `currentMission` is cleared. To deploy again to dev, operators must open a new mission solely for the purpose of running `dev-deploy`. This was observed during the warpgogol-com-r000012 release cycle: after closing mission m000030, a new mission m000031 had to be opened just to run `dev-deploy` and fix a `commitSha` mismatch.

`leitstand.propagate` and `leitstand.rollback` already deploy from `releases/<id>/dist/` to alt/main channels without an open mission. The dev channel lacks an equivalent path.

## Problem

Operators must open a new mission (with brief, bordbuch entry, pin validation, materialization) solely to re-deploy an existing release to the dev channel. This is slow, creates unnecessary mission records, and forces workpiece materialization when the release dist is already available in `releases/<id>/dist/`.

The gap is in `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:608-610` — the hard requirement for `entry.currentMission` prevents any release-based dev deployment path.

## Decision

`leitstand.dev-deploy` accepts an optional `--release <id>` flag that deploys an existing release's pre-built dist to the dev channel without requiring an open mission.

- When `--release` is provided: deploy from `releases/<id>/dist/`, skip build, skip axiom checks, skip auto-commit, run CDN purge and health check.
- When `--release` is not provided: current behavior (require open mission, build from workpiece, auto-commit, run axiom checks).

## Architectural fit

- **Site OS operator model**: extends `leitstand.dev-deploy` with a new flag rather than introducing a separate command. The dev channel gains parity with `leitstand.propagate` (alt/main) and `leitstand.rollback` — both deploy from release directories without open missions.
- **RFC-0628**: amends the dev deployment channel to support release-based deployment alongside the existing workpiece-based path. The `amends: [RFC-0628]` frontmatter field formalises this relationship.
- **RFC-0666**: convention-based `.env.alt`/`.env.main` paths are reused for secrets resolution. The release path uses `releases/<id>/.env.alt` (dev channel maps to `.env.alt` per RFC-0666).
- **RFC-0698**: auto-commit logic is only relevant for the workpiece path; the release path skips it since the dist is already committed.
- **DNA-48 (Release discipline)**: not affected — the release state machine is unchanged. The release remains an immutable artifact; this RFC only deploys its pre-built dist to an additional channel.
- **DNA-49 (Fleet propagation)**: not affected — `leitstand.propagate` and `leitstand.promote` gates are unchanged. This RFC adds a dev-channel deploy path that bypasses the Axiom gate (the release was already validated during `release.prepare`).

## Design

### CLI surface

```sh
# Current behavior (unchanged) — requires open mission:
pnpm exec werkstatt run leitstand.dev-deploy --system warpgogol-com

# New behavior — deploy existing release to dev without open mission:
pnpm exec werkstatt run leitstand.dev-deploy --system warpgogol-com --release warpgogol-com-r000012
```

Flags:

- `--system` (required) — Sternsystem id.
- `--release` (optional) — Release id. When present, deploys from `releases/<id>/dist/` without requiring an open mission. The release's `systemId` in `release.yaml` must match `--system`; mismatch exits 1 with `[leitstand.dev-deploy] release '<id>' does not belong to system '<system>'`.
- `--force-build` (existing, ignored when `--release` is set — a warning is logged: `[leitstand.dev-deploy] --force-build ignored because --release is set`).
- `--skip-evidence-sync` (existing, ignored when `--release` is set — evidence sync is already skipped in the release path).

### TypeScript contracts

The existing `DevDeployResult` interface in `leitstand-commands.ts:563-586` gains one new optional field:

```ts
export interface DevDeployResult {
  command: "leitstand.dev-deploy";
  systemId: string;
  missionId: string;          // from releaseManifest.missionId when --release is set
  commitSha: string;           // from releaseManifest.commitSha when --release is set
  buildState: "succeeded" | "failed";
  buildSkipped: boolean;       // true when --release is set (no build step)
  deployState: "succeeded" | "failed" | "failed-stale" | "in-progress";
  deploymentUrl: string;
  buildIdentity: {
    releaseId: string;
    written: boolean;          // false when --release is set (no new build-identity)
    path: string;
  };
  axiom: {
    status: "pass" | "fail" | "not-run";  // "not-run" when --release is set
    errors: number;
    warnings: number;
    exitCode: number;
    freshness: FreshnessResult;
  };
  evidenceSynced: boolean;     // false when --release is set
  evidenceSyncError: string | null;
  releaseDeployed?: string;    // NEW: set to the release id when --release is used
}
```

No new `DevDeployInput` interface is needed — the `--release` flag is read via `flagString(input, "release")` in the handler, same as existing flags.

### File system responsibilities

| Path | Role |
| --- | --- |
| `releases/<id>/dist/` | Source dist when `--release` is set |
| `missions/<id>/workpiece/dist/` | Source dist when `--release` is not set (current behavior) |
| `systems/registry.yaml` | Read for system config; `currentMission` not required when `--release` is set |
| `releases/<id>/release.yaml` | Read for release manifest (`missionId`, `commitSha`, `systemId`, `distTreeHash`) |
| `releases/<id>/.env.alt` | Secrets for dev channel (resolved via `resolveConventionSecretsPath`, same convention as propagate) |
| `node_modules/.bin/` (workspace root) | Wrangler binary fallback when release dir has no `node_modules/` |

### Module registration update

The `leitstand.dev-deploy` command registration in `leitstand.module.ts` must add `releases/{release}/**` to `reads`:

```ts
reads: ["systems/registry.yaml", "missions/{mission}/workpiece/**", "releases/{release}/**"],
```

### Release path: field resolution

When `--release` is set, the handler reads `releases/<id>/release.yaml` via `readReleaseManifest` and populates:

- `missionId` ← `releaseManifest.missionId`
- `commitSha` ← `releaseManifest.commitSha`
- `systemId` ← verified against `releaseManifest.systemId` (mismatch exits 1)
- `axiom.status` ← `"not-run"` (all counts zero, freshness not verified)
- `buildIdentity.written` ← `false` (release dist already contains `build-identity.json`)
- `evidenceSynced` ← `false` (no evidence to sync)
- `buildSkipped` ← `true`

### Wrangler binary resolution

The release directory does not contain `node_modules/`. The handler resolves `wrangler` from the workspace root `node_modules/.bin/` (where `wrangler` is installed as a devDependency). If the workspace root bin path does not exist, `nodeModulesBinPath` is `undefined` and the adapter falls back to `PATH` resolution (same as `leitstand.propagate` when workpiece `node_modules/.bin` is missing).

### No registry or bordbuch writes

The release path does NOT write to `systems/registry.yaml` (`lastPropagated.dev` is not updated) and does NOT append to bordbuch — same as the workpiece path per RFC-0628. Dev deploys are ephemeral and untracked.

### Output format

When `--release` is used, the `--json` output includes all existing `DevDeployResult` fields with release-path values:

```json
{
  "command": "leitstand.dev-deploy",
  "systemId": "warpgogol-com",
  "missionId": "warpgogol-com-m000030",
  "commitSha": "abc123def456",
  "buildState": "succeeded",
  "buildSkipped": true,
  "deployState": "succeeded",
  "deploymentUrl": "https://dev.warpgogol.com",
  "buildIdentity": {
    "releaseId": "warpgogol-com-r000012",
    "written": false,
    "path": ""
  },
  "axiom": {
    "status": "not-run",
    "errors": 0,
    "warnings": 0,
    "exitCode": 0,
    "freshness": {
      "verified": false,
      "cdnDistTreeHash": null,
      "localDistTreeHash": "",
      "attempts": 0,
      "error": "release path — axiom skipped"
    }
  },
  "evidenceSynced": false,
  "evidenceSyncError": null,
  "releaseDeployed": "warpgogol-com-r000012"
}
```

### Failure modes

- `--release <id>` not found in `releases/`: exit 1 with `[leitstand.dev-deploy] release '<id>' not found`.
- `releases/<id>/dist/` missing or empty: exit 1 with `[leitstand.dev-deploy] release '<id>' has no dist directory`.
- `releaseManifest.systemId` does not match `--system`: exit 1 with `[leitstand.dev-deploy] release '<id>' does not belong to system '<system>'`.
- Deploy fails: exit 1 (same as current behavior).
- CDN purge fails: warning (same as current behavior for cloudflare-workers adapter).
- Health check fails: exit 1 (same as current behavior).

## Rollout

- **Default behavior**: `--release` is opt-in. Without the flag, `leitstand.dev-deploy` behaves exactly as before (requires open mission, builds from workpiece).
- **Existing apps**: no changes needed. The flag is additive.
- **New apps**: automatically benefit from the release-based path when `--release` is used.
- **No migration path needed**: the flag is backward-compatible.
- **Pipeline integration**: not integrated into `build.check` — `leitstand.dev-deploy` remains a standalone operator command.

## Alternatives considered

- **New command `leitstand.redeploy`**: rejected — adds a separate command for what is essentially the same operation (deploy to dev). The `--release` flag on the existing command is simpler and discoverable.
- **Extend `leitstand.propagate` to support `--channel dev`**: rejected — `propagate` has evidence and release-manifest gates that are inappropriate for dev channel (dev is for testing, not production). Mixing the two modes in one command creates confusing flag interactions.
- **Allow `leitstand.dev-deploy` to auto-detect release when mission is closed**: rejected — implicit behavior is dangerous. The operator should explicitly choose `--release` to avoid accidentally deploying a stale release when they intended to open a new mission.

## Risks

- **Stale deploy risk**: an operator might deploy an old release to dev and forget it's not the latest workpiece state. Mitigation: the output includes `releaseDeployed` and `buildSkipped: true` to make the source explicit.
- **Agent misinterpretation**: agents might use `--release` when they should be iterating on a workpiece. Mitigation: implementation notes specify that `--release` is for re-deploying existing releases, not for active development.
- **No axiom verification**: deploying a release to dev without axiom checks means the dev environment is not independently verified. This is acceptable because the release was already validated during `release.prepare` and `mission.check`.

## Acceptance criteria

- [x] `--release` flag accepted by `leitstand.dev-deploy` command registration (evidence: `leitstand.module.ts:44-48`, `command.manifest.generate` passed)
- [x] When `--release` is provided, command deploys from `releases/<id>/dist/` without requiring `entry.currentMission` (evidence: `leitstand-commands.ts:618-772`, test `--release succeeds without currentMission`)
- [x] When `--release` is not provided, command behaves exactly as before (requires open mission) (evidence: `leitstand-commands.ts:774-785`, test `without --release, workpiece path is unchanged`)
- [x] CDN purge runs after release-based deploy (same as workpiece path) (evidence: `leitstand-commands.ts:713-724`, `runPurgeStep` called in release path)
- [x] Health check runs after release-based deploy (same as workpiece path) (evidence: `leitstand-commands.ts:727-735`, `adapter.health` called in release path)
- [x] `--json` output includes `releaseDeployed` and `buildSkipped` fields when `--release` is used, with `axiom.status: "not-run"` and `buildIdentity.written: false` (evidence: `leitstand-commands.ts:741-768`, test `--release deploys from releases/<id>/dist/ and returns success`)
- [x] Unit test covers the `--release` path in `leitstand-commands.ts` (release found, system mismatch, dist missing) (evidence: `leitstand-0700-release-dev-deploy.test.ts`, 7 tests pass)
- [x] `leitstand.module.ts` `reads` updated to include `releases/{release}/**` (evidence: `leitstand.module.ts:59-63`)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0700 --json` → 0 errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT use `--release` as a shortcut during active mission development — it is for re-deploying existing releases to dev, not for skipping the build step.
- Agents MUST NOT weaken or remove the open-mission requirement for the workpiece path — only the `--release` path bypasses it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0700 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
