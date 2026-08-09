---
id: RFC-0773
title: "Engine publication pipeline via repo-extract to private npm"
status: draft
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
reviewers: []
createdAt: 2026-08-09
updatedAt: 2026-08-09
implementedAt:
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
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals:
  - "Dry-run extraction of packages/werkstatt succeeds and the packed tarball's CLI runs"
  - "Private npm install of @warpgogol/werkstatt in a scratch folder resolves and typechecks"
nonGoals:
  - "No changes to @warpgogol/repo-extract itself unless a gap is found (then upstream issue/PR)"
  - "No public npm publication"
  - "No automated publish-on-merge — publication stays operator-triggered"
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

## Architectural fit

- **Forge precedent** — identical mechanism; this RFC only standardizes it as policy and adds a verification gate.
- **DNA-62 (pinned files)** — `extract.config.yaml` files join `.forge/pinned.yaml` (protect mode) so they cannot be silently deleted.

## Design

### Extraction configs

Each published package: `packages/<name>/extract.config.yaml` with `standalone: true`, `stripScopes: ["@warpgogol/"]`, `preservePackages` for the package itself plus its published `@warpgogol/*` dependencies (engine for plugins), `ignoreDirs`, secret scanning enabled, `git.remote` pointing to a private repo, `autoPush: true`.

### Private access

- Packages carry `"private": false` with `"publishConfig": { "access": "restricted" }`.
- Consumer workshops need an `.npmrc` with an npm token that has read access to the `@warpgogol` scope; documented in the runbook and in RFC-0779 scaffolding.

### Verification gate (runbook, operator-triggered)

1. `repo-extract --config packages/<name>/extract.config.yaml --dry-run` — plan review.
2. Real extraction to the external folder.
3. In the extraction folder: `pnpm install && pnpm build && pnpm test`.
4. `npm pack` → install the tarball into a scratch project → run the `werkstatt` CLI smoke command (`werkstatt --version`, `werkstatt run werkstatt.plugin.validate` in a fixture workshop).
5. `npm publish` (restricted) from the extraction folder.

### Failure modes

- Secret scan hit → abort publication; fix in monorepo, re-extract.
- Tarball smoke test failure → abort; the monorepo dogfooding gap that allowed it must be closed (add the missing check to `packages.check`).

## Rollout

- First publication happens after RFC-0772 (engine) and again after RFC-0774/0775 (site plugin).
- The runbook lives in the engine package README (extracted with it) and in `docs/authoring/`.
- Game/video plugins reuse the identical config shape when they land.

## Alternatives considered

- **Publishing from the monorepo directly (pnpm publish with workspace protocol rewrite).** Rejected by the operator: the repo-extract external-folder flow is the established model, keeps the private monorepo boundary clean, and produces a standalone git repo per package.
- **Changesets-based automated versioning.** Rejected for now: four packages, operator-triggered releases; `ecosystem.commit` version log already exists.

## Risks

- **LFS-tracked binaries in werkstatt-site (ui assets).** repo-extract must materialize real content, not LFS pointers. Verification step 3 catches pointer files (build fails); if repo-extract lacks LFS support, that is an upstream fix before wave 3.
- **Peer-range drift.** A plugin published against engine `^1.2` may be installed with engine `1.5`. Mitigation: engine minor releases keep the plugin contract stable (`werkstatt/plugin@1`); breaking contract → engine major + plugin majors.

## Acceptance criteria

- [ ] `extract.config.yaml` exists for `packages/werkstatt` (and plugin packages as they land)
- [ ] Versioning policy (independent SemVer + engine peerDependency ranges) documented in engine README
- [ ] Publication runbook written and verified end-to-end once (dry-run → extract → build → pack → scratch install → publish)
- [ ] Extraction configs pinned in `.forge/pinned.yaml`
- [ ] `rfc.validate` passes on this file before merging

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
