---
id: RFC-0773
title: "Engine publication pipeline via repo-extract to private npm"
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
  - RFC-0772
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-62
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
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/werkstatt
  - packages/werkstatt-site
  - packages/werkstatt-game
  - packages/werkstatt-video
successSignals:
  - "Dry-run extraction of packages/werkstatt succeeds and the packed tarball's CLI runs"
  - "Private npm install of @warpgogol/werkstatt in a scratch folder resolves and typechecks"
nonGoals:
  - "No changes to @warpgogol/repo-extract itself unless a gap is found (then upstream issue/PR)"
  - "No public npm publication"
  - "No automated publish-on-merge — publication stays operator-triggered"
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

# RFC-0773: Engine publication pipeline via repo-extract to private npm

## Context

The operator's publication model: development happens in this monorepo; each publishable package is exported via `@warpgogol/repo-extract` into an external folder and published to npm from there. The forge precedent (`packages/forge/extract.config.yaml`, standalone mode, `git.autoPush` to an external repo) is live and proven. This RFC extends the model to the engine (`@warpgogol/werkstatt`) and the three plugins, as **private** npm packages.

## Problem

Without a defined pipeline: (1) there is no versioning policy across engine and plugins; (2) nothing verifies that an extracted package actually installs and runs outside the monorepo (workspace deps become `*` — silent breakage risk); (3) private-package access (`.npmrc`, tokens) is undefined; (4) large plugin packages (ui assets under Git LFS) have never been extracted.

## Decision

Each published package (`werkstatt`, `werkstatt-site`, `werkstatt-game`, `werkstatt-video`) carries an `extract.config.yaml` (standalone mode) and is published to npm as a **private scoped package** from its external extraction folder. A publication runbook and verification gate are added.

### Versioning policy

- Engine and plugins version **independently** (SemVer each), but every plugin declares a `peerDependency` on a compatible engine range (e.g. `@warpgogol/werkstatt: ^1.x`).
- Workspace `workspace:*` deps between engine and plugins are rewritten by repo-extract; plugins pin the engine peer range in their own `package.json` explicitly (not `*`).
- Version bumps follow the existing platform version log discipline (`ecosystem.commit`).
- **Breaking engine major → all plugins republished simultaneously.** A breaking contract change (engine major) requires all plugin packages to be updated with the new peerDependency range and republished in the same publication window. Compatible plugins are not silently left on an stale peer range.
- **Workshop version migration.** After full RFC-0769..0779 implementation (all waves complete), the workshop Turborepo package is bumped from version 4 to version 5 to mark the engine extraction milestone.

## Architectural fit

- **Forge precedent** — identical mechanism; this RFC only standardizes it as policy and adds a verification gate.
- **DNA-62 (pinned files)** — `extract.config.yaml` files join `.forge/pinned.yaml` (protect mode) so they cannot be silently deleted. This RFC extends DNA-62 by adding a new category of pinned file (extraction configs) to the manifest.

## Design

### File system responsibilities

| Path | Action |
| --- | --- |
| `packages/werkstatt/extract.config.yaml` | Created — engine extraction config |
| `packages/werkstatt-site/extract.config.yaml` | Created — site plugin extraction config |
| `packages/werkstatt-game/extract.config.yaml` | Created — game plugin extraction config (wave 5) |
| `packages/werkstatt-video/extract.config.yaml` | Created — video plugin extraction config (wave 5) |
| `.forge/pinned.yaml` | Modified — add `extract.config.yaml` entries (protect mode) |
| `docs/technology.xml` | Modified — add publication pipeline technology entry |
| `docs/authoring/publication-runbook.md` | Created — operator-facing publication runbook |
| Engine package README | Modified — versioning policy + runbook reference |
| Root `AGENTS.md` | Modified — agent publication rules (agents MUST NOT trigger npm publish) |

### Extraction configs

Each published package: `packages/<name>/extract.config.yaml` with `standalone: true`, `stripScopes: ["@warpgogol/"]`, `preservePackages` for the package itself plus its published `@warpgogol/*` dependencies (engine for plugins), `ignoreDirs`, secret scanning enabled, `git.remote` pointing to a private repo, `autoPush: true`. All extraction configs MUST include `excludePathSegments: [".npmrc"]` to prevent npm tokens from being extracted or committed (following the forge precedent at `packages/forge/extract.config.yaml`).

### Private access

- Packages carry `"private": false` with `"publishConfig": { "access": "restricted" }`.
- Consumer workshops need an `.npmrc` with an npm token that has read access to the `@warpgogol` scope; documented in the runbook and in RFC-0779 scaffolding.
- **Token management:** the npm token lives in `.npmrc` inside the extraction folder only. It is never committed to git (excluded via `excludePathSegments` in `extract.config.yaml`). Token rotation is operator-triggered; the old token is revoked in the npm dashboard before the new one is written. The runbook documents the token scope (`read` for consumers, `publish` for the operator).

### Verification gate (runbook, operator-triggered)

1. `repo-extract --config packages/<name>/extract.config.yaml --dry-run` — plan review.
2. Real extraction to the external folder.
3. In the extraction folder: `pnpm install && pnpm build && pnpm test`.
4. `npm pack` → install the tarball into a **fixture workshop** (a minimal workshop with `forge.yaml`, `tools/kernel.config.ts`, empty `systems/` and `missions/` directories, maintained in the engine package test fixtures) → run the `werkstatt` CLI smoke command (`werkstatt --version`, `werkstatt run werkstatt.plugin.validate`).
5. `npm publish` (restricted) from the extraction folder.

### Rollback

If `npm publish` succeeds but the published package is broken: `npm deprecate <pkg>@<version> "<reason>"` marks the version as broken, and a fix-forward patch version is published immediately. `npm unpublish` is available within 72h for new packages but is not the primary path — the ecosystem is forward-only. The runbook documents both options.

### Failure modes

- Secret scan hit → abort publication (non-zero exit from the publication script); fix in monorepo, re-extract.
- Tarball smoke test failure → abort (non-zero exit from the smoke test step); the monorepo dogfooding gap that allowed it must be closed (add the missing check to `packages.check`).
- `npm publish` network failure → retry; npm registry is eventually consistent, a failed publish may leave the package in a pending state. Check `npm view <pkg>@<version>` before retrying.

## Rollout

- First publication happens after RFC-0772 (engine) and again after RFC-0774/0775 (site plugin).
- The runbook lives in the engine package README (extracted with it) and in `docs/authoring/publication-runbook.md`.
- Game/video plugins reuse the identical config shape when they land.
- **Compass sync:** `docs/technology.xml` gains an entry for the repo-extract-based private npm publication model.
- **AGENTS.md update:** root `AGENTS.md` gains a rule: "Agents MUST NOT trigger `npm publish` without an explicit operator command. Publication is operator-triggered, never automated."

## Alternatives considered

- **Publishing from the monorepo directly (pnpm publish with workspace protocol rewrite).** Rejected by the operator: the repo-extract external-folder flow is the established model, keeps the private monorepo boundary clean, and produces a standalone git repo per package.
- **Changesets-based automated versioning.** Rejected for now: four packages, operator-triggered releases; `ecosystem.commit` version log already exists.

## Risks

- **LFS-tracked binaries in werkstatt-site (ui assets).** repo-extract must materialize real content, not LFS pointers. Verification step 3 catches pointer files (build fails); if repo-extract lacks LFS support, that is an upstream fix before wave 3.
- **Peer-range drift.** A plugin published against engine `^1.2` may be installed with engine `1.5`. Mitigation: engine minor releases keep the plugin contract stable (`werkstatt/plugin@1`); breaking contract → engine major + plugin majors.

## Acceptance criteria

- [x] `extract.config.yaml` exists for `packages/werkstatt` (and plugin packages as they land) with `excludePathSegments: [".npmrc"]` (evidence: `packages/werkstatt/extract.config.yaml:22`, `pinned.validate` pass)
- [x] Versioning policy (independent SemVer + engine peerDependency ranges + breaking-major-all-plugins-republished rule) documented in engine README (evidence: `packages/werkstatt/README.md:17-23`)
- [x] Publication runbook written at `docs/authoring/publication-runbook.md` (dry-run → extract → build → pack → fixture install → publish) (evidence: `docs/authoring/publication-runbook.md:1-95`)
- [x] Fixture workshop created in engine package test fixtures (evidence: `packages/werkstatt/test-fixtures/fixture-workshop/` — `forge.yaml`, `tools/kernel.config.ts`, `systems/registry.yaml`, `missions/.gitkeep`, `package.json`)
- [x] Extraction configs pinned in `.forge/pinned.yaml` (protect mode) (evidence: `.forge/pinned.yaml:80-82`, `pinned.validate` pass)
- [x] `docs/technology.xml` updated with publication pipeline entry (evidence: `docs/technology.xml:251-267`)
- [x] Root `AGENTS.md` updated with agent publication rule (evidence: `AGENTS.md:36-42`)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0773` → "All 1 RFC(s) passed validation")

## Deferred work

**Operator-executable (requires npm token, registry access):**

- [ ] Publication runbook verified end-to-end once (dry-run → extract → build → pack → fixture install → `npm publish`) — deferred to operator; requires npm token and `@warpgogol` scope registry access.

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
