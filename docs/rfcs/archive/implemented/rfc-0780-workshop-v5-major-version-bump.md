---
id: RFC-0780
title: "Workshop v5.0.0 major version bump"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
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
createdAt: 2026-08-09
updatedAt: 2026-08-09
enhancedAt: 2026-08-09
implementedAt: 2026-08-09
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0769
  - RFC-0770
  - RFC-0771
  - RFC-0772
  - RFC-0773
  - RFC-0774
  - RFC-0775
  - RFC-0776
  - RFC-0777
  - RFC-0778
  - RFC-0779
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-62
  - DNA-64
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: major
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/werkstatt
  - packages/werkstatt-site
  - packages/werkstatt-game
  - packages/werkstatt-video
  - packages/forge
successSignals:
  - "Root package.json version is 5.0.0"
  - "ecosystem.commit trailer X-Platform-Bump: major present in commit history"
  - "All RFC-0769..0779 acceptance criteria remain satisfied"
nonGoals:
  - "No source code changes — only version metadata and script binary paths"
  - "No new commands or validators"
  - "No migration scripts — the v4→v5 transition is documentation-only"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0000-template.md § Acceptance probes.
# acceptance:
#   - id: AC-01
#     probe: shell
#     spec: |
#       test "$(jq -r .version package.json)" = "5.0.0"
---

## Context

The Werkstatt Engine Program (RFC-0769..0779) completed a major architectural migration:

- Consolidated 40+ `packages/os/*` and domain packages into 4 packages: `werkstatt`, `werkstatt-site`, `werkstatt-game`, `werkstatt-video`
- Introduced the plugin contract (`werkstatt/plugin@1`) and stack profile binding
- Migrated the workshop to consume engine and plugin packages from npm
- Added consumer workshop scaffolding (`workshop.scaffold`)
- Removed all legacy `site-kernel*` package references from active code

This is a breaking architectural change: the package structure, import paths, and consumption model are fundamentally different from v4. Consumers cannot upgrade without updating all imports from `@warpgogol/site-kernel*` to `@warpgogol/werkstatt*` subpath exports.

## Problem

The v4.x version range (4.0.0–4.90.16) accumulated 90+ patch releases over the pre-migration period. Continuing to version the post-migration workshop as 4.91.x would misrepresent the magnitude of the change and break SemVer expectations for consumers who depend on the `@warpgogol/*` package range.

## Decision

Bump the platform version from 4.90.16 to 5.0.0 via `ecosystem.commit --bump major`.

This RFC serves as the official version marker. The `versionBump: major` frontmatter field instructs `ecosystem.commit` to perform a major bump.

## Architectural fit

- **DNA-62** (Engine program): This RFC formalizes the completion of the engine program.
- **DNA-64** (Plugin contract): The plugin contract is the architectural foundation of v5.

## Design

No code changes. The version bump is performed by `ecosystem.commit --bump major`, which:

1. Reads current version from `package.json` (4.90.16)
2. Computes `5.0.0` via `bumpVersion(current, "major")`
3. Writes the new version to `package.json`
4. Writes `docs/platform-version-log.generated.yaml` with the semantic hash
5. Commits with `X-Platform-Bump: major` and `X-Platform-Version: 5.0.0` trailers

## Rollout

Single commit. No migration scripts needed — the v4→v5 transition is a version marker. All code changes were already committed in the preceding `4.90.16` commit.

## Alternatives considered

- **Continue as 4.91.x**: Rejected — misrepresents the breaking nature of the migration.
- **Minor bump to 4.91.0**: Rejected — SemVer minor implies backward-compatible features, not a package structure overhaul.
- **No version bump**: Rejected — the root `package.json` scripts still referenced `site-kernel` binary paths that no longer exist; these must be updated and committed.

## Risks

- **Consumer confusion**: Consumers who pin `@warpgogol/werkstatt@^4` will not auto-upgrade to v5. This is intentional — the migration requires manual import path updates.
- **Changelog disruption**: The changelog generation pipeline may need to handle the major version boundary. Low risk — the pipeline reads `package.json` version at runtime.

## Acceptance criteria

- [x] Root `package.json` `version` field is `5.0.0` (evidence: package.json:5)
- [x] `ecosystem.commit` commit trailer `X-Platform-Bump: major` present in git log (evidence: git log --format=%B HEAD)
- [x] All RFC-0769..0779 remain in `implemented` status with passing validation (evidence: forge rfc.validate --id RFC-0769..0779)
- [x] Root `package.json` scripts reference `werkstatt` binary, not `site-kernel` (evidence: package.json:12,22-26)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `werkstatt run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `werkstatt run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
