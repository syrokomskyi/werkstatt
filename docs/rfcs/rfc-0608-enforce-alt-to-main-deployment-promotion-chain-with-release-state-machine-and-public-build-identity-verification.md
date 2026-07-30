---
id: RFC-0608
title: "Enforce alt-to-main deployment promotion chain with release state machine and public build identity verification"
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
createdAt: 2026-07-30
updatedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0358
  - RFC-0379
  - RFC-0301
  - RFC-0585
  - RFC-0596
  - RFC-0587
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-48
  - DNA-49
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - leitstand.promote
  added:
    - leitstand.promote
  changed:
    - leitstand.propagate
    - release.prepare
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/ontology"
  - "@warpgogol/site-kernel-codegen"
successSignals:
  - "leitstand.propagate always deploys to alt; --channel flag removed for propagate"
  - "leitstand.promote refuses when release state is not alt-deployed"
  - "leitstand.promote fetches /.well-known/build-identity.json from alt URL and verifies hashes match the release manifest before deploying to main"
  - "release.prepare writes /.well-known/build-identity.json into dist/client/ with all release hashes"
  - "open-source-registry.json deployment metadata is populated from the same build identity object"
nonGoals:
  - "Do not change leitstand.rollback --channel semantics (rollback remains per-channel)"
  - "Do not remove the open-source page; it continues to display build metadata sourced from build-identity.json"
  - "Do not introduce a runtime API endpoint for build identity; a static JSON file is sufficient and agent-friendly"
  - "Do not auto-promote from alt to main without an explicit leitstand.promote invocation"
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

# RFC-0608: Enforce alt-to-main deployment promotion chain with release state machine and public build identity verification

## Context

The release lifecycle currently has three phases: `release.prepare` (build + snapshots + hashes), `release.publish` (store artifact + state → `published`), and `leitstand.propagate --channel alt|main` (deploy to Cloudflare Workers). The gate that should enforce alt-before-main deployment lives inside `leitstand.propagate` as a conditional check:

```ts
if (channel === "main" && dep.channels.alt) {
  const altProp = dep.lastPropagated?.alt;
  if (!altProp || altProp.releaseId !== releaseId || !altProp.healthy) {
    throw new Error("main-channel gate: alt channel must have a healthy propagation...");
  }
}
```

This gate has three structural weaknesses:

1. **Config-conditional**: the gate only fires when `dep.channels.alt` exists in the registry. Removing the alt channel config silently bypasses the gate entirely.
2. **Cached health**: the gate checks `altProp.healthy` from the registry — a stale snapshot written by a previous `leitstand.propagate --channel alt`. There is no live re-verification of the alt deployment at promotion time.
3. **No release state enforcement**: the release manifest state machine (`prepared → published → rolled-back`) does not track deployment phases. A `published` release can be deployed directly to main without any record that alt deployment happened.

Additionally, the open-source page (`/uk/vidkrytyy-kod`) already displays build metadata (`deploymentId`, `buildTimestamp`, `commitSha`, `targetPlatform`) generated by `open-source-page.ts` during `build.post`. However, these fields are computed independently from the release manifest hashes (`distTreeHash`, `behaviorSnapshotHash`, `releaseId`) — there is no single canonical build identity file that agents or promotion gates can fetch to verify that a deployed build matches a specific release.

## Problem

DNA-49 states: "promoting to `main` requires a healthy `alt` propagation of the same release." But the current enforcement is fragile:

- **Bypass by config**: if `deployment.channels.alt` is removed from `systems/registry.yaml`, the gate is silently skipped. An operator or agent could accidentally or intentionally deploy to main without alt verification.
- **Stale health data**: `altProp.healthy` reflects a past health check, not the current state. The alt deployment could have degraded since the last check, and the gate would still pass.
- **No deployment state in release manifest**: there is no way to inspect a release and know whether it has been deployed to alt, promoted to main, or neither. The release state machine does not cover deployment phases.
- **No build identity verification**: when deploying to main, there is no mechanism to verify that the alt deployment is serving the exact same build (same `distTreeHash`, `behaviorSnapshotHash`). The gate only checks `releaseId` string equality, not cryptographic identity.
- **Duplicated build metadata**: `open-source-page.ts` computes `deploymentId`/`commitSha`/`buildTimestamp` independently from the release manifest, creating two sources of truth for build identity that can diverge.

## Decision

The release lifecycle gains a mandatory alt-to-main promotion chain enforced by a release state machine and a public build identity file. `leitstand.propagate` is restricted to alt deployment only (the `--channel` flag is removed). A new `leitstand.promote` command deploys a verified release to main, requiring the release to be in the `alt-deployed` state and performing a live fetch of `/.well-known/build-identity.json` from the alt URL to cryptographically verify that the alt deployment serves the exact release build before proceeding. `release.prepare` writes a canonical `/.well-known/build-identity.json` into `dist/client/` after computing all release hashes, and the open-source page's deployment metadata is sourced from the same object.

## Architectural fit

- **DNA-48 (Release discipline)**: extends the release state machine from `prepared | published | rolled-back` to `prepared | published | alt-deployed | promoted | rolled-back`. The `alt-deployed` and `promoted` states are new terminal-ish states that track deployment phases. `release.prepare` gains the responsibility of writing `build-identity.json`.
- **DNA-49 (Fleet propagation / Leitstand)**: strengthens the alt-to-main gate from a config-conditional check to a state-machine invariant. `leitstand.promote` replaces `leitstand.propagate --channel main`. The gate is no longer bypassable by removing alt channel config.
- **RFC-0358 / RFC-0379**: the Leitstand channel model is preserved (`alt` and `main` channels in the registry), but the command surface is split: `propagate` → alt, `promote` → main. Health verification is extended with a live build-identity fetch.
- **RFC-0301 (archived)**: established the concept of gating main deployment on alt checks. This RFC formalizes it as a state-machine invariant with cryptographic verification rather than URL-based check reports.
- **RFC-0585**: `release.prepare` already computes `distTreeHash`, `behaviorSnapshotHash`, `siteContentHash`, `platformVersion`, `commitSha`. This RFC extends `release.prepare` to write these into `build-identity.json` — no new hash computation needed.
- **RFC-0596**: `release.publish` stores the artifact and transitions to `published`. This RFC adds `alt-deployed` and `promoted` as post-publish states, preserving the artifact-first invariant.

## Design

### Release state machine

The release state enum is extended:

```
prepared → published → alt-deployed → promoted
                                          ↘ rolled-back
```

| State          | Meaning                                           | Transition command    |
| -------------- | ------------------------------------------------- | --------------------- |
| `prepared`     | Build complete, hashes computed, manifest written | `release.prepare`     |
| `published`    | Artifact stored, release immutable                | `release.publish`     |
| `alt-deployed` | Deployed to alt channel, health checks passed     | `leitstand.propagate` |
| `promoted`     | Deployed to main channel, build identity verified | `leitstand.promote`   |
| `rolled-back`  | Reverted to a previous release on a channel       | `leitstand.rollback`  |

The `alt-deployed` and `promoted` states are stored in the release manifest (`release.yaml`). `leitstand.propagate` transitions `published → alt-deployed`. `leitstand.promote` transitions `alt-deployed → promoted`.

### CLI surface

````sh
# Deploy to alt (was: leitstand.propagate --channel alt)
pnpm exec site-kernel run leitstand.propagate --release <release-id>

# Promote to main (new command)
pnpm exec site-kernel run leitstand.promote --release <release-id>

# Rollback (unchanged, --channel preserved)
pnpm exec site-kernel run leitstand.rollback --channel main --release <release-id>
pnpm exec site-kernel run leitstand.rollback --channel alt --release <release-id>

# Health check (unchanged)
pnpm exec site-kernel run leitstand.health --channel alt
```

**`leitstand.propagate` changes:**
- `--channel` flag removed; always deploys to alt.
- Requires release state `published`.
- On success, transitions release state to `alt-deployed` and updates `deployment.lastPropagated.alt` in the registry.

**`leitstand.promote` (new):**
- `--release <release-id>` (required).
- Requires release state `alt-deployed`.
- Fetches `/.well-known/build-identity.json` from the alt channel URL.
- Verifies `releaseId`, `distTreeHash`, `behaviorSnapshotHash`, `siteContentHash` from the live alt deployment match the release manifest.
- Runs health checks against the alt deployment (live re-check, not cached).
- On all checks passing, deploys to the main channel via the deployment adapter.
- On success, transitions release state to `promoted` and updates `deployment.lastPropagated.main` in the registry.

### Build identity file

`release.prepare` writes `/.well-known/build-identity.json` into `dist/client/` after computing all release hashes:

```json
{
  "releaseId": "warpgogol-com-r000003",
  "systemId": "warpgogol-com",
  "missionId": "warpgogol-com-m000007",
  "semver": "0.1.0",
  "distTreeHash": "sha256:abc123...",
  "behaviorSnapshotHash": "sha256:def456...",
  "siteContentHash": "sha256:789abc...",
  "platformVersion": "4.5.0",
  "platformSemanticHash": "sha256:ghi789...",
  "commitSha": "abc1234",
  "buildTimestamp": "2026-07-30T18:00:00.000Z",
  "targetPlatform": "cloudflare-workers"
}
````

This file is the **single source of truth** for build identity. The open-source page's `deploymentMetadata` section is populated from the same object during `release.prepare`'s post-build phase, replacing the independent `resolveDeploymentMetadata` computation in `open-source-page.ts`.

### TypeScript contracts

```ts
// packages/ontology/src/operations/release.ts
export const releaseStateSchema = z.enum([
  "prepared", "published", "alt-deployed", "promoted", "rolled-back"
]);

// Build identity file schema
export const buildIdentitySchema = z.object({
  releaseId: z.string().regex(RELEASE_ID_REGEX),
  systemId: z.string().regex(STERNSYSTEM_ID_REGEX),
  missionId: z.string().regex(MISSION_ID_REGEX),
  semver: z.string(),
  distTreeHash: z.string(),
  behaviorSnapshotHash: z.string(),
  siteContentHash: z.string(),
  platformVersion: z.string(),
  platformSemanticHash: z.string(),
  commitSha: z.string(),
  buildTimestamp: z.string().datetime(),
  targetPlatform: z.string(),
});

export type BuildIdentity = z.infer<typeof buildIdentitySchema>;

// leitstand.promote result
interface LeitstandPromoteData {
  releaseId: string;
  systemId: string;
  channel: "main";
  previousState: "alt-deployed";
  newState: "promoted";
  altBuildIdentityVerified: boolean;
  altHealthVerified: boolean;
  deployedAt: string;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `releases/<id>/dist/client/.well-known/build-identity.json` | Written by `release.prepare` after hash computation; served as a static public file |
| `releases/<id>/release.yaml` | Release manifest; `state` field extended with `alt-deployed` and `promoted` |
| `systems/registry.yaml` | `deployment.lastPropagated.alt` and `.main` updated by `propagate` and `promote` respectively |
| `packages/os/site-kernel-codegen/src/open-source-page.ts` | `resolveDeploymentMetadata` replaced — reads from `build-identity.json` instead of computing independently |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | `runLeitstandPropagate` loses `--channel`; new `runLeitstandPromote` added |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | `runReleasePrepare` gains `build-identity.json` write step |

### Output format

`leitstand.promote --json`:

```json
{
  "command": "leitstand.promote",
  "status": "ok",
  "data": {
    "releaseId": "warpgogol-com-r000003",
    "systemId": "warpgogol-com",
    "channel": "main",
    "previousState": "alt-deployed",
    "newState": "promoted",
    "altBuildIdentityVerified": true,
    "altHealthVerified": true,
    "deployedAt": "2026-07-30T18:05:00.000Z"
  },
  "summary": "[leitstand.promote] warpgogol-com-r000003 promoted to main"
}
```

### Failure modes

| Condition | Behavior |
| --- | --- |
| Release state is not `alt-deployed` | `leitstand.promote` throws: "release must be in alt-deployed state" |
| `build-identity.json` not found at alt URL | `leitstand.promote` throws: "build-identity.json not served by alt deployment" |
| Hash mismatch between live alt and release manifest | `leitstand.promote` throws with the specific field that mismatched |
| Alt health check fails | `leitstand.promote` throws: "alt deployment is not healthy" |
| `--channel` flag passed to `leitstand.propagate` | `leitstand.propagate` throws: "--channel is removed; use leitstand.promote for main deployment" |
| Network error fetching build-identity.json | `leitstand.promote` throws: "cannot reach alt deployment at <url>" |

All failures exit non-zero. In `--json` mode, the error is in the `error` field with a machine-readable `code`.

## Rollout

1. **Extend `releaseStateSchema`** in `packages/ontology/src/operations/release.ts` with `alt-deployed` and `promoted`.
2. **Update `release.prepare`** to write `build-identity.json` into `dist/client/.well-known/` after hash computation. Update `open-source-page.ts` to read deployment metadata from this file instead of computing independently.
3. **Update `leitstand.propagate`**: remove `--channel` flag, always deploy to alt, transition release state to `alt-deployed` on success.
4. **Add `leitstand.promote`**: new command in `leitstand-commands.ts`, registered in the Leitstand module. Implements the build-identity fetch, hash verification, live health re-check, and main deployment.
5. **Update `leitstand.rollback`**: preserve `--channel` flag. Rolling back main sets release state to `rolled-back`. Rolling back alt sets release state back to `published` (re-deploy to alt required before another promote).
6. **Update `docs/COMMANDS.md`** and `packages/os/site-kernel-handoff/AGENTS.md` with the new command and state machine.
7. **Existing releases**: all previous test releases can be deleted (operator confirmed). No migration path needed.
8. **New sites**: automatically comply from day one — `release.prepare` writes `build-identity.json`, and the promotion chain is the only path.

## Alternatives considered

- **Keep `--channel` in `leitstand.propagate`, make gate state-machine-based.** Rejected: the `--channel` flag implies that main deployment is just another propagation, which conceptually weakens the alt-first invariant. Splitting into `propagate` (alt) and `promote` (main) makes the promotion chain explicit and self-documenting.
- **Runtime fetch of `build-identity.json` from the open-source section.** Rejected: would make the open-source page depend on client-side JavaScript and a successful fetch. A static file written at build time is simpler, more reliable, and agent-friendly.
- **Separate API endpoint for build identity.** Rejected: adds runtime complexity (a Worker route, request handling) for a static data file. A `/.well-known/` JSON file is the standard approach for agent-discoverable metadata and requires no runtime code.
- **Extend the open-source page with additional hash fields instead of a separate file.** Rejected: the open-source page is HTML — extracting structured data from HTML is fragile for agents. A JSON file is machine-parseable by design. The open-source page continues to display metadata sourced from the same build identity object.

## Risks

- **Alt URL unreachable during promotion.** `leitstand.promote` fetches `build-identity.json` from the alt URL. If the alt deployment is down or the URL is misconfigured, promotion is blocked. Mitigated: this is the intended behavior — promotion should be blocked if alt is not verifiable.
- **`build-identity.json` not served by Cloudflare Workers.** The file is in `dist/client/.well-known/` — the Astro Cloudflare adapter must serve static files from this path. Mitigated: `/.well-known/` is a standard static path; if the adapter does not serve it, this is a bug to fix before implementing this RFC.
- **State machine complexity.** Adding two states (`alt-deployed`, `promoted`) increases the release lifecycle surface. Mitigated: the states are strictly sequential and each has a single entry command. `leitstand.status` already shows channel state.
- **Agent misinterpretation.** An agent might try to run `leitstand.propagate --channel main` after this RFC. Mitigated: the command throws with a clear error message directing to `leitstand.promote`. `AGENTS.md` and `docs/COMMANDS.md` will be updated.
- **Rollback state ambiguity.** Rolling back alt after promotion leaves the release in `promoted` state but alt is at a previous version. Mitigated: rollback does not change release state to `rolled-back` for alt-only rollback; only main rollback transitions to `rolled-back`.

## Acceptance criteria

- [ ] `releaseStateSchema` in `packages/ontology/src/operations/release.ts` includes `alt-deployed` and `promoted` states
- [ ] `release.prepare` writes `/.well-known/build-identity.json` into `dist/client/` with all release hashes
- [ ] `open-source-page.ts` sources `deploymentMetadata` from `build-identity.json` instead of `resolveDeploymentMetadata`
- [ ] `leitstand.propagate` no longer accepts `--channel` flag; always deploys to alt
- [ ] `leitstand.propagate` transitions release state from `published` to `alt-deployed` on success
- [ ] `leitstand.promote` command is registered and requires release state `alt-deployed`
- [ ] `leitstand.promote` fetches and verifies `build-identity.json` from alt URL before deploying to main
- [ ] `leitstand.promote` runs live health checks against alt deployment before deploying to main
- [ ] `leitstand.promote` transitions release state from `alt-deployed` to `promoted` on success
- [ ] `leitstand.rollback --channel main` transitions release state to `rolled-back`
- [ ] `leitstand.propagate --channel alt` throws a clear error directing to the new command surface
- [ ] `docs/COMMANDS.md` and `packages/os/site-kernel-handoff/AGENTS.md` document the new state machine and command surface
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove the alt-to-main promotion chain enforcement established by this RFC without a new RFC that supersedes it.
- Agents MUST NOT add a `--channel` flag back to `leitstand.propagate` or bypass the `leitstand.promote` command for main deployment.
- Agents MUST NOT deploy a release to main without verifying `build-identity.json` from the alt deployment.
- If the Cloudflare Workers adapter does not serve `/.well-known/build-identity.json`, fix the adapter's static file serving before implementing this RFC — do not work around it by skipping the verification.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- The `build-identity.json` file is public and contains no secrets. It is intentionally agent-discoverable via the `/.well-known/` URI convention.
