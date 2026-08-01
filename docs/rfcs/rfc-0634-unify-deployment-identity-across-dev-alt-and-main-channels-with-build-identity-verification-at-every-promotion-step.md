---
id: RFC-0634
title: "Unify deployment identity across dev, alt, and main channels with build-identity verification at every promotion step"
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
enhancedAt: 2026-08-01
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0608
  - RFC-0628
amendedBy: []
related:
  - RFC-0608
  - RFC-0627
  - RFC-0628
  - RFC-0618
  - RFC-0585
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
  proposed: []
  added: []
  changed:
    - leitstand.dev-deploy
    - leitstand.propagate
    - release.prepare
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - '@warpgogol/site-kernel-handoff'
  - '@warpgogol/ui'
  - '@warpgogol/ontology'
successSignals:
  - dev-deploy writes build-identity.json into workpiece public/.well-known/ before build and dist/client/.well-known/ after hash computation
  - open-source page reads build-identity.json locally from public/.well-known/ (not fetch from Astro.url.origin)
  - leitstand.propagate fetches and verifies build-identity.json from dev URL before deploying to alt (mirror of leitstand.promote alt→main)
  - dev, alt, and main channels each display their own deployment metadata on the open-source page
  - distTreeHash is deterministic — build-identity.json is excluded from the hash computation and written after hashing
nonGoals:
  - Do not change leitstand.promote (alt→main verification is already correct from RFC-0608)
  - Do not change the release state machine (prepared → published → alt-deployed → promoted → rolled-back)
  - Do not make dev-deploy create a release — dev remains workpiece-based and ephemeral (RFC-0628)
  - Do not add a workpieceId field to buildIdentitySchema — workpiece uses releaseId: workpiece-<missionId> with a loosened regex
  - Do not change the Axiom verification gate — it remains part of dev-deploy and propagate evidence check
  - Do not change the open-source page layout or SBOM data — only the build-identity reading mechanism changes
  - Do not address the distribution-reuse path in release.prepare — when canReuseDistribution is true, the workpiece is not rebuilt and the preliminary build-identity.json is not written. The reused distribution's open-source page retains whatever metadata it was built with. This is a known limitation documented in the Design section.
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

# RFC-0634: Unify deployment identity across dev, alt, and main channels with build-identity verification at every promotion step

## Context

The deployment chain has three channels: `dev` (developer verification), `alt` (client approval), and `main` (public internet). The operator's workflow is: local development → `leitstand.dev-deploy` (build workpiece, deploy to dev, run Axiom) → `release.prepare` + `release.publish` → `leitstand.propagate` (deploy to alt) → `leitstand.promote` (deploy to main).

RFC-0608 established `build-identity.json` as the single source of truth for build identity and cryptographic verification for alt→main promotion. `leitstand.promote` fetches `/.well-known/build-identity.json` from the alt URL and verifies `distTreeHash`, `behaviorSnapshotHash`, and `siteContentHash` against the release manifest before deploying to main.

However, two gaps remain:

1. **Dev channel has no build identity.** `leitstand.dev-deploy` (RFC-0628) builds the workpiece and deploys to dev but does not write `build-identity.json`. The open-source page on dev shows stale metadata from the last `release.prepare` (fetched from the production domain during prerender), or placeholder `—` values if no release exists.

2. **Dev→alt promotion has no build-identity verification.** `leitstand.propagate` checks Axiom evidence (missionId + commitSha + errors === 0) but does not fetch `build-identity.json` from the dev URL to cryptographically verify that the alt deployment matches what was tested on dev. This is an asymmetry: alt→main is verified, but dev→alt is not.

The open-source page component (`packages/ui/src/sections/open-source-registry/open-source-registry-section.astro:63`) fetches `build-identity.json` via ``fetch(`${Astro.url.origin}/.well-known/build-identity.json`)``. Under Astro's `output: "static"` configuration, pages are prerendered at build time. `Astro.url.origin` is derived from the `site` config in `astro.config.mjs`, which defaults to `https://warpgogol.com` (the main domain). This means the prerendered HTML embeds metadata from the main domain, not the channel being deployed. The fetch is baked into static HTML at build time — it does not re-execute at request time.

## Problem

DNA-49 states that the Leitstand deploys published releases to deployment targets via adapter plugins, but the current implementation has two structural gaps:

- **Dev channel lacks build identity.** `leitstand.dev-deploy` does not write `build-identity.json`. The dev open-source page displays stale or placeholder metadata. The operator cannot verify what is actually deployed on dev by reading the open-source page. This was observed on `dev-warpgogol-com.syrokomskyi.workers.dev` — the page showed `warpgogol-com-r000005` (a previous release) instead of the workpiece that was just deployed.

- **Dev→alt is not cryptographically verified.** `leitstand.propagate` deploys to alt based on Axiom evidence (missionId + commitSha + errors === 0) but does not verify that the build on dev matches the release artifact. If the workpiece was modified after `dev-deploy` but before `release.prepare`, the release artifact could differ from what was tested on dev. The operator's goal — "what I saw on dev is what moves to alt" — is not enforced.

- **Prerendered open-source page fetches from the wrong origin.** The component at `packages/ui/src/sections/open-source-registry/open-source-registry-section.astro:63` calls ``fetch(`${Astro.url.origin}/.well-known/build-identity.json`)``. Under `output: "static"`, `Astro.url.origin` resolves to the `site` config value (`https://warpgogol.com`), not the channel URL. The fetch is executed at build time and the result is embedded in static HTML. Every channel's open-source page shows the main domain's metadata.

- **Timestamps in distTreeHash.** If `build-identity.json` (which contains `buildTimestamp`) is present in `dist/` when `fingerprintTree` computes `distTreeHash`, the hash changes on every build. `release.prepare` already avoids this by writing `build-identity.json` after computing the hash (line 362 vs line 370). `dev-deploy` must follow the same pattern.

## Decision

Every deployment channel (dev, alt, main) carries a `build-identity.json` file, and every promotion step (dev→alt, alt→main) cryptographically verifies the build identity of the source channel before deploying to the target. The open-source page reads `build-identity.json` locally from `public/.well-known/` at build time, not via a runtime fetch from `Astro.url.origin`. `leitstand.dev-deploy` writes a preliminary `build-identity.json` into `workpiece/public/.well-known/` before the build and a final version into `dist/client/.well-known/` after computing `distTreeHash`. `leitstand.propagate` fetches and verifies `build-identity.json` from the dev URL before deploying to alt, mirroring `leitstand.promote`'s alt→main verification.

## Architectural fit

- **DNA-48 (Release discipline):** `release.prepare` already writes `build-identity.json` into `dist/client/.well-known/` after computing hashes. This RFC extends the same pattern to `dev-deploy`: preliminary file before build, hash computation, final file after hash. The release state machine is unchanged.

- **DNA-49 (Fleet propagation):** Extends the build-identity verification gate from alt→main only (RFC-0608) to all promotion steps: dev→alt (`propagate`) and alt→main (`promote`). The three-channel model (`dev`, `alt`, `main`) is preserved. `dev-deploy` remains workpiece-based and ephemeral — it does not create a release or write to the registry.

- **RFC-0608:** Amended. `leitstand.propagate` gains a build-identity verification step mirroring `leitstand.promote`. The open-source page component changes from runtime fetch to local file read.

- **RFC-0628:** Amended. `leitstand.dev-deploy` gains the responsibility of writing `build-identity.json` (preliminary + final). The workpiece-based, ephemeral nature of dev deploys is preserved — no registry or bordbuch writes.

- **RFC-0618 (cache-buster):** The cache-buster query parameter for `leitstand.promote`'s build-identity fetch is reused by `leitstand.propagate`'s new dev-URL fetch.

- **RFC-0585:** `release.prepare` already computes `distTreeHash` before writing `build-identity.json`. This RFC makes `dev-deploy` follow the same sequencing.

## Design

### CLI surface

No new commands. Existing commands gain build-identity responsibilities:

```sh
# Dev: builds workpiece, writes build-identity.json, deploys to dev, runs Axiom
pnpm exec site-kernel run leitstand.dev-deploy --system warpgogol-com

# Alt: verifies build-identity from dev URL, deploys to alt
pnpm exec site-kernel run leitstand.propagate --release warpgogol-com-r000006

# Main: verifies build-identity from alt URL, deploys to main (unchanged from RFC-0608)
pnpm exec site-kernel run leitstand.promote --release warpgogol-com-r000006
```

### Build-identity lifecycle

The `build-identity.json` file goes through two phases:

1. **Preliminary** — written to `public/.well-known/build-identity.json` before `pnpm build`. Contains `releaseId`, `systemId`, `missionId`, `commitSha`, `buildTimestamp`, and placeholder hashes (empty strings). The open-source page component reads this version at build time. This ensures every channel's prerendered HTML embeds its own metadata, not the main domain's.

2. **Final** — written to `dist/client/.well-known/build-identity.json` after `fingerprintTree` computes `distTreeHash`. Contains the real `distTreeHash`, `behaviorSnapshotHash` (empty for workpiece), `siteContentHash`, `platformVersion`, `platformSemanticHash`. Promotion gates fetch this version from the source channel URL.

The `distTreeHash` computation excludes `build-identity.json` because the final file is not present in `dist/` at hash time — it is written afterward. However, the preliminary file written to `public/.well-known/` before the build is copied into `dist/client/.well-known/build-identity.json` by Astro's build. Both `dev-deploy` and `release.prepare` MUST remove this copied preliminary file from `dist/client/.well-known/build-identity.json` before computing `distTreeHash` via `fingerprintTree`. After hashing, the final `build-identity.json` is written to the same path. This three-step sequence (preliminary → remove from dist → hash → write final) ensures `distTreeHash` is deterministic.

### Workpiece build-identity (dev-deploy)

`leitstand.dev-deploy` writes a workpiece build-identity with:

```json
{
  "releaseId": "workpiece-warpgogol-com-m000024",
  "systemId": "warpgogol-com",
  "missionId": "warpgogol-com-m000024",
  "semver": "0.0.0-workpiece",
  "distTreeHash": "sha256:...",
  "behaviorSnapshotHash": "",
  "siteContentHash": "sha256:...",
  "platformVersion": "4.5.0",
  "platformSemanticHash": "sha256:...",
  "commitSha": "d3759f7e635d3c2fad7738fa3adaf7f4e8d36b0c",
  "buildTimestamp": "2026-08-01T20:00:00.000Z",
  "targetPlatform": "cloudflare-workers"
}
```

`behaviorSnapshotHash` is an empty string for workpiece identity — behavior snapshots are only computed by `release.prepare`. `semver` is `0.0.0-workpiece` since no release exists. The `commitSha` is captured from the workpiece git repository (`git rev-parse HEAD` at the workpiece path), not the monorepo git repository. This is critical for `leitstand.propagate` verification: the release manifest's `commitSha` must also be captured from the workpiece git HEAD, not the monorepo HEAD (see Rollout step 2).

### Release build-identity (release.prepare)

`release.prepare` already writes `build-identity.json` into `dist/client/.well-known/`. This RFC adds a preliminary write to `workpiece/public/.well-known/` before the build so the open-source page shows the release ID (e.g., `warpgogol-com-r000006`) instead of a stale workpiece ID.

### Open-source page component change

The component at `packages/ui/src/sections/open-source-registry/open-source-registry-section.astro` changes from:

```astro
const response = await fetch(`${Astro.url.origin}/.well-known/build-identity.json`);
```

to local file read:

```astro
import { readFileSync } from "node:fs";
import { join } from "node:path";

const wellKnownPath = join(process.cwd(), "public", ".well-known", "build-identity.json");
let deploymentMetadata = { deploymentId: "—", buildTimestamp: "—", commitSha: "—" };
try {
  const raw = readFileSync(wellKnownPath, "utf8");
  const buildIdentity = JSON.parse(raw);
  deploymentMetadata = {
    deploymentId: buildIdentity.releaseId ?? "—",
    buildTimestamp: buildIdentity.buildTimestamp ?? "—",
    commitSha: buildIdentity.commitSha ?? "—",
  };
} catch {
  // File not found (e.g., local dev before any deploy) — keep placeholders
}
```

The path is resolved via `process.cwd()` which points to the workpiece root during `pnpm build` (Astro runs from the workpiece directory). The `import.meta.url` approach does not work because the component lives in `packages/ui/src/sections/open-source-registry/` but `public/` is in the workpiece root — a relative path from the component would resolve to `packages/ui/src/public/` which does not exist.

This works for both SSG (prerender) and SSR. Each channel's build includes its own `public/.well-known/build-identity.json`, so the prerendered HTML embeds the correct metadata.

### leitstand.propagate build-identity verification (dev→alt)

`leitstand.propagate` gains a build-identity verification step before deploying to alt, mirroring `leitstand.promote`:

1. Resolve the dev channel config via `getChannelConfig(dep, "dev")` to obtain the dev channel URL. The deployment config is read from the registry entry as `entry.deployment`.
2. Fetch `/.well-known/build-identity.json` from the dev channel URL (with cache-buster query parameter, RFC-0618).
3. Parse and validate against `buildIdentitySchema`. The `releaseId` field regex is loosened to accept both release IDs (`<system-id>-r<NNNNNN>`) and workpiece IDs (`workpiece-<missionId>`) — see TypeScript contracts below.
4. Verify `missionId` matches the release manifest's `missionId`.
5. Verify `commitSha` matches the release manifest's `commitSha`. Both values are captured from the workpiece git HEAD (see Workpiece build-identity section).
6. Verify `siteContentHash` matches the release manifest's `siteContentHash`.
7. Verify `distTreeHash` matches the release manifest's `distTreeHash`.
8. If any check fails, reject with an actionable error message.

`behaviorSnapshotHash` is NOT verified for dev→alt because the workpiece build-identity has an empty string for this field (behavior snapshots are only computed by `release.prepare`). The alt deployment's `build-identity.json` (written by `release.prepare`) will have the real `behaviorSnapshotHash`, which is then verified by `leitstand.promote` for alt→main.

### TypeScript contracts

```ts
// Schema change: buildIdentitySchema.releaseId regex is loosened to accept
// both release IDs (<system-id>-r<NNNNNN>) and workpiece IDs (workpiece-<missionId>).
// The new regex: /^(workpiece-)?[a-z0-9]+(-[a-z0-9]+)*(-r\d{6}|-m\d{6})$/
// This is the only schema change. All other fields remain unchanged.
// Workpiece build-identity uses empty string for behaviorSnapshotHash.

// Additive: leitstand.propagate result gains build-identity verification fields
// Existing fields (systemId, releaseId, channel, state, deploymentUrl, startedAt,
// completedAt, preflight, purgeResult, health, releaseState) are preserved.
interface LeitstandPropagateData {
  // ... existing fields preserved ...
  devBuildIdentityVerified: boolean;  // NEW
  axiomEvidenceVerified: boolean;     // NEW (explicit flag, was implicit)
}

// Additive: dev-deploy result gains buildIdentity field
// Existing fields (command, systemId, missionId, commitSha, buildState, deployState,
// deploymentUrl, axiom) are preserved.
interface DevDeployResult {
  // ... existing fields preserved ...
  buildIdentity: {                   // NEW
    releaseId: string;               // "workpiece-<missionId>"
    written: boolean;                // true if build-identity.json was written
    path: string;                    // "dist/client/.well-known/build-identity.json"
  };
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/{mission}/workpiece/public/.well-known/build-identity.json` | Written by `dev-deploy` (preliminary) and `release.prepare` (preliminary) before build. Read by the open-source page component at build time. |
| `missions/{mission}/workpiece/dist/client/.well-known/build-identity.json` | Written by `dev-deploy` (final) and `release.prepare` (final) after hash computation. Served as a static public file. Fetched by promotion gates. |
| `packages/ui/src/sections/open-source-registry/open-source-registry-section.astro` | Changed from runtime `fetch(Astro.url.origin)` to local `readFileSync(join(process.cwd(), "public", ".well-known", "build-identity.json"))` |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | `runLeitstandDevDeploy` gains build-identity write steps; `runLeitstandPropagate` gains dev-URL build-identity verification |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | `runReleasePrepare` gains preliminary build-identity write to `workpiece/public/.well-known/` before build; `commitSha` source changes from monorepo HEAD to workpiece HEAD |
| `packages/ontology/src/operations/release.ts` | `buildIdentitySchema.releaseId` regex loosened to accept `workpiece-<missionId>` prefix |

### Output format

`leitstand.dev-deploy --json` (additive — gains `buildIdentity` field, existing fields preserved):

```json
{
  "commandName": "leitstand.dev-deploy",
  "data": {
    "command": "leitstand.dev-deploy",
    "systemId": "warpgogol-com",
    "missionId": "warpgogol-com-m000024",
    "commitSha": "d3759f7e635d3c2fad7738fa3adaf7f4e8d36b0c",
    "buildState": "succeeded",
    "deployState": "succeeded",
    "deploymentUrl": "https://dev-warpgogol-com.syrokomskyi.workers.dev",
    "buildIdentity": {
      "releaseId": "workpiece-warpgogol-com-m000024",
      "written": true,
      "path": "dist/client/.well-known/build-identity.json"
    },
    "axiom": { "status": "pass", "errors": 0, "warnings": 42, "exitCode": 0 }
  },
  "summary": "[leitstand.dev-deploy] warpgogol-com deployed to dev (succeeded, Axiom: pass)"
}
```

`leitstand.propagate --json` (additive — gains `devBuildIdentityVerified` and `axiomEvidenceVerified` fields, existing fields preserved):

```json
{
  "command": "leitstand.propagate",
  "data": {
    "systemId": "warpgogol-com",
    "releaseId": "warpgogol-com-r000006",
    "channel": "alt",
    "state": "succeeded",
    "deploymentUrl": "https://alt.warpgogol.com",
    "releaseState": "alt-deployed",
    "devBuildIdentityVerified": true,
    "axiomEvidenceVerified": true
  },
  "summary": "[leitstand.propagate] warpgogol-com-r000006 deployed to alt"
}
```

### Failure modes

| Condition | Behavior |
| --- | --- |
| `build-identity.json` not found at dev URL during `leitstand.propagate` | Throws: "build-identity.json not served by dev deployment — run leitstand.dev-deploy first" |
| `buildIdentitySchema` validation fails on dev build-identity | `leitstand.propagate` throws: "build-identity.json schema validation failed: <error>" — indicates the dev deployment is serving a malformed or outdated build-identity.json |
| Hash mismatch between dev build-identity and release manifest | `leitstand.propagate` throws with the specific field that mismatched |
| `commitSha` mismatch between dev build-identity and release manifest | `leitstand.propagate` throws: "dev build-identity commitSha '<x>' does not match release commitSha '<y>' — re-run leitstand.dev-deploy after workpiece changes" |
| Network error fetching build-identity.json from dev URL | `leitstand.propagate` throws: "cannot reach dev deployment at <url>" |
| Dev deployment serving a different mission's build-identity | `leitstand.propagate` throws: "build-identity.json missionId mismatch: expected <missionId>, got <actual>" |
| `public/.well-known/build-identity.json` missing during build | Open-source page shows placeholder `—` values. Non-fatal — the build succeeds. |
| `distTreeHash` includes `build-identity.json` (hash non-determinism) | Prevented by sequencing: the preliminary file copied by Astro's build is removed from `dist/client/.well-known/` before `fingerprintTree` runs. The final file is written after hashing. |

## Rollout

1. **`leitstand.dev-deploy` build-identity write** (`packages/os/site-kernel-handoff`): Add preliminary `build-identity.json` write to `workpiece/public/.well-known/` before `pnpm build`. After build, remove the copied preliminary file from `dist/client/.well-known/build-identity.json`, compute `distTreeHash` via `fingerprintTree`, then write final `build-identity.json` with real hashes. Clean up the preliminary file from `workpiece/public/.well-known/` after the build — this is mandatory, not optional, to avoid stale metadata in the workpiece.

2. **`release.prepare` preliminary build-identity and commitSha source** (`packages/os/site-kernel-handoff`): Add a preliminary `build-identity.json` write to `workpiece/public/.well-known/` before the build, with `releaseId` set to the release ID (e.g., `warpgogol-com-r000006`). This ensures the alt and main open-source pages show the release ID, not a stale workpiece ID. After build, remove the copied preliminary file from `dist/client/.well-known/build-identity.json` before computing `distTreeHash` — the existing final write at line 370 is unchanged. Additionally, change the `commitSha` source from `resolveCurrentEcosystem(workspaceRoot)` (monorepo HEAD) to `git rev-parse HEAD` at the workpiece path — this ensures the release manifest's `commitSha` matches the dev build-identity's `commitSha` for `leitstand.propagate` verification. When `canReuseDistribution` is true (distribution reuse path), the workpiece is not rebuilt and the preliminary write is skipped — the reused distribution retains whatever metadata it was built with. This is a known limitation (see nonGoals).

3. **Open-source page component** (`packages/ui`): Replace `fetch(Astro.url.origin)` with local `readFileSync(join(process.cwd(), "public", ".well-known", "build-identity.json"))`. Remove the SSR fetch comment. Update the CHANGE_SUMMARY in the component header.

4. **`buildIdentitySchema` regex change** (`packages/ontology`): Loosen the `releaseId` field regex in `buildIdentitySchema` from `RELEASE_ID_REGEX` to `/^(workpiece-)?[a-z0-9]+(-[a-z0-9]+)*(-r\d{6}|-m\d{6})$/` to accept both release IDs (`<system-id>-r<NNNNNN>`) and workpiece IDs (`workpiece-<missionId>`). Update the existing `buildIdentitySchema` test in `packages/os/site-kernel-handoff/src/tests/release-0608-build-identity.test.ts` to verify workpiece IDs pass validation.

5. **`leitstand.propagate` dev-URL verification** (`packages/os/site-kernel-handoff`): Add a build-identity fetch from the dev channel URL (resolved via `getChannelConfig(dep, "dev")`) with cache-buster (RFC-0618) before the existing Axiom evidence check. Verify `missionId`, `commitSha`, `distTreeHash`, and `siteContentHash` against the release manifest. Skip `behaviorSnapshotHash` (empty for workpiece). Add `devBuildIdentityVerified` and `axiomEvidenceVerified` to the command result.

6. **`leitstand.promote`**: No changes — alt→main verification is already correct (RFC-0608).

7. **AGENTS.md updates**: Update `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section: `dev-deploy` now writes build-identity (preliminary + final with dist cleanup); `propagate` now verifies build-identity from dev URL; `release.prepare` now uses workpiece HEAD for `commitSha`. Update `packages/ui/AGENTS.md` to document the `readFileSync(join(process.cwd(), ...))` pattern for build-time file reads in shared UI components.

8. **DNA updates**: Update DNA-49 prose in `docs/architecture-dna.md` to reflect that all promotion steps (dev→alt, alt→main) verify build-identity from the source channel URL. Proposed prose addition: "Build-identity verification is required at every promotion step: `leitstand.propagate` fetches `build-identity.json` from the dev channel URL and verifies `missionId`, `commitSha`, `distTreeHash`, and `siteContentHash` against the release manifest before deploying to alt; `leitstand.promote` fetches from the alt channel URL and verifies `releaseId`, `distTreeHash`, `behaviorSnapshotHash`, and `siteContentHash` before deploying to main."

9. **Tests**: Unit tests for `dev-deploy` build-identity write (preliminary + final, hash exclusion), `propagate` dev-URL verification (success, hash mismatch, missing file, network error), and the open-source component local read.

10. **Existing releases**: No migration needed — existing releases already have `build-identity.json` in `dist/client/.well-known/`. The preliminary write to `public/.well-known/` is new but only affects future builds.

11. **New sites**: Automatically comply from day one — `dev-deploy` writes build-identity, `release.prepare` writes preliminary + final, and the open-source component reads locally.

## Alternatives considered

- **Set `PUBLIC_SITE_URL` to the channel URL during build.** Rejected: the open-source page component fetches from `Astro.url.origin`, which is derived from the `site` config. Setting `PUBLIC_SITE_URL` per channel would require different env vars for dev, alt, and main builds. This is fragile — easy to forget, and it still relies on a runtime fetch that fails if the origin is unreachable during build. Local file read is simpler and deterministic.

- **Make the open-source page SSR (not prerendered).** Rejected: would require changing `output: "static"` or adding `export const prerender = false` to the open-source page. This adds runtime cost (Worker execution for every request) for a page that is fundamentally static. The local file read solves the problem without changing the rendering strategy.

- **Add a `workpieceId` field to `buildIdentitySchema`.** Rejected: the schema already has `releaseId` which can hold `workpiece-<missionId>` for workpiece identity. Adding a field complicates the schema and the verification logic. Instead, the `releaseId` regex is loosened to accept both release IDs and workpiece IDs. The operator confirmed: use the same schema, `releaseId` doubles as workpiece identifier.

- **Verify `behaviorSnapshotHash` for dev→alt.** Rejected: workpiece build-identity does not have a behavior snapshot (only `release.prepare` computes one). Verifying an empty string against a real hash would always fail. The `behaviorSnapshotHash` verification remains alt→main only (where both sides have real values from `release.prepare`).

- **Keep the runtime fetch but fix `Astro.url.origin`.** Rejected: under `output: "static"`, `Astro.url.origin` is the `site` config value, not the request URL. There is no reliable way to make it reflect the channel URL during prerender. The fetch approach is fundamentally incompatible with static prerendering for per-channel metadata.

## Risks

- **Preliminary build-identity stale in `public/.well-known/`.** If a build fails after the preliminary write but before cleanup, the stale file remains in `workpiece/public/.well-known/`. Mitigated: the next `dev-deploy` or `release.prepare` overwrites it. The preliminary file has placeholder hashes — it is only used for display, not verification.

- **`distTreeHash` non-determinism if sequencing is broken.** If `build-identity.json` is present in `dist/` when `fingerprintTree` runs, the hash includes the `buildTimestamp` and changes on every build. The preliminary file written to `public/.well-known/` is copied to `dist/client/.well-known/` by Astro's build — it MUST be removed before hashing. Mitigated: the RFC explicitly requires removing the copied preliminary file from `dist/client/.well-known/` before computing `distTreeHash`, then writing the final file after hashing. Unit tests must verify that `distTreeHash` is stable across rebuilds.

- **Dev URL unreachable during propagate.** `leitstand.propagate` fetches `build-identity.json` from the dev URL. If dev is down or the URL is misconfigured, propagation is blocked. Mitigated: this is the intended behavior — propagation should be blocked if dev is not verifiable. The operator explicitly wants this guarantee.

- **`public/.well-known/` directory creation.** The `dev-deploy` and `release.prepare` commands must create `public/.well-known/` if it does not exist. Mitigated: `fs.mkdir(..., { recursive: true })` is used, same as the existing `dist/client/.well-known/` creation.

- **Agent misinterpretation.** Agents might expect `build-identity.json` to be in `dist/` before hashing. The AGENTS.md update must clearly state: preliminary in `public/` before build, final in `dist/` after hash. Agents might also try to verify `behaviorSnapshotHash` for dev→alt — the AGENTS.md must state this field is empty for workpiece and skipped.

- **Open-source component `readFileSync` in Astro frontmatter.** Using `node:fs` in an Astro component frontmatter is safe during SSG (build time) and SSR (Worker runtime). The path is resolved via `process.cwd()` which points to the workpiece root during `pnpm build`. Mitigated: this is a common Astro pattern for reading local files at build time.

## Acceptance criteria

- [ ] `leitstand.dev-deploy` writes preliminary `build-identity.json` to `workpiece/public/.well-known/` before build and final to `dist/client/.well-known/` after hash computation
- [ ] `leitstand.dev-deploy` removes the copied preliminary `build-identity.json` from `dist/client/.well-known/` before computing `distTreeHash`
- [ ] `leitstand.dev-deploy` `distTreeHash` is deterministic — `build-identity.json` is not present in `dist/` during `fingerprintTree` computation
- [ ] `leitstand.dev-deploy` cleans up the preliminary `build-identity.json` from `workpiece/public/.well-known/` after the build
- [ ] `leitstand.dev-deploy` result includes `buildIdentity` field with `releaseId`, `written`, and `path` (additive to existing fields)
- [ ] `release.prepare` writes preliminary `build-identity.json` to `workpiece/public/.well-known/` before build with the release ID
- [ ] `release.prepare` removes the copied preliminary `build-identity.json` from `dist/client/.well-known/` before computing `distTreeHash`
- [ ] `release.prepare` captures `commitSha` from the workpiece git HEAD (`git rev-parse HEAD` at workpiece path), not the monorepo HEAD
- [ ] `buildIdentitySchema` in `packages/ontology/src/operations/release.ts` has a loosened `releaseId` regex that accepts both `<system-id>-r<NNNNNN>` and `workpiece-<missionId>` formats
- [ ] Open-source page component reads `build-identity.json` locally from `public/.well-known/` via `readFileSync(join(process.cwd(), ...))`, not via `fetch(Astro.url.origin)`
- [ ] Dev open-source page displays `workpiece-<missionId>` and the real `commitSha` after `leitstand.dev-deploy`
- [ ] Alt open-source page displays the release ID (e.g., `warpgogol-com-r000006`) after `leitstand.propagate`
- [ ] `leitstand.propagate` resolves the dev channel config via `getChannelConfig(dep, "dev")` and fetches `/.well-known/build-identity.json` from the dev channel URL with cache-buster
- [ ] `leitstand.propagate` verifies `missionId`, `commitSha`, `distTreeHash`, and `siteContentHash` from dev build-identity against the release manifest
- [ ] `leitstand.propagate` rejects with actionable error when dev build-identity is missing, unreachable, schema-invalid, or hash-mismatched
- [ ] `leitstand.propagate` result includes `devBuildIdentityVerified: boolean` and `axiomEvidenceVerified: boolean` (additive to existing fields)
- [ ] `leitstand.promote` is unchanged — alt→main verification remains as defined in RFC-0608
- [ ] DNA-49 prose in `docs/architecture-dna.md` updated to reflect build-identity verification at every promotion step
- [ ] `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section updated for dev-deploy build-identity, propagate dev-URL verification, and release.prepare commitSha source
- [ ] `packages/ui/AGENTS.md` updated to document the `readFileSync(join(process.cwd(), ...))` pattern for build-time file reads
- [ ] Unit tests for dev-deploy build-identity write, propagate dev-URL verification, schema regex change, and open-source component local read pass
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove the build-identity verification at any promotion step without a new RFC that supersedes this RFC.
- Agents MUST NOT write `build-identity.json` into `dist/` before `fingerprintTree` computes `distTreeHash` — the preliminary file copied by Astro's build MUST be removed from `dist/client/.well-known/` before hashing, and the final file written afterward.
- Agents MUST NOT verify `behaviorSnapshotHash` for dev→alt propagation — this field is empty for workpiece build-identity and only has a real value after `release.prepare`.
- Agents MUST change `buildIdentitySchema.releaseId` regex to accept `workpiece-<missionId>` format. The regex is loosened from `RELEASE_ID_REGEX` to `/^(workpiece-)?[a-z0-9]+(-[a-z0-9]+)*(-r\d{6}|-m\d{6})$/`. No other schema fields change.
- Agents MUST clean up the preliminary `build-identity.json` from `workpiece/public/.well-known/` after the build, to avoid stale metadata in the workpiece.
- Agents MUST capture `commitSha` from the workpiece git HEAD in both `dev-deploy` and `release.prepare` — not the monorepo HEAD. This ensures `leitstand.propagate` verification succeeds.
- If the open-source page component cannot read `public/.well-known/build-identity.json` (file missing), it MUST display placeholder `—` values — never throw or fail the build.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
