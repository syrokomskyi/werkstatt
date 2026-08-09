---
id: RFC-0776
title: "Migrate this workshop to npm engine consumption"
status: draft
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
  - RFC-0774
  - RFC-0775
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
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals:
  - "tools/kernel.config.ts imports from @warpgogol/werkstatt and @warpgogol/werkstatt-site"
  - "Full mission lifecycle (open → materialize → validate → dev-deploy → release → promote) green on warpgogol-com"
  - "No packages/os/* directories remain"
nonGoals:
  - "No engine or plugin code changes — this RFC rewrites the workshop composition point only"
  - "No new workshops — RFC-0779"
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

# RFC-0776: Migrate this workshop to npm engine consumption

## Context

After RFC-0772 (engine consolidation), RFC-0774/0775 (site plugin), this workshop still wires everything together via `tools/kernel.config.ts` with ~30 `moduleLoaders` entries pointing at old `@warpgogol/site-kernel*` and domain package paths. This RFC flips the workshop to consume the consolidated `@warpgogol/werkstatt` + `@warpgogol/werkstatt-site` packages and deletes the old package directories.

## Problem

The workshop is the dogfooding target: it must run the same code external workshops will run from npm. Until `tools/kernel.config.ts` imports from the new packages and old directories are gone, the migration is incomplete and hidden coupling persists.

## Decision

### 1. Rewrite `tools/kernel.config.ts`

The kernel config becomes:

```ts
import { defineKernelConfig } from "@warpgogol/werkstatt/types";
import { werkstattSitePlugin } from "@warpgogol/werkstatt-site";
import { PACKAGES_CHECK_PIPELINE } from "@warpgogol/werkstatt-site/checks";

export default defineKernelConfig({
  name: "warpgogol-site-workshop",
  description: "Warpgogol site workshop",
  plugins: [werkstattSitePlugin],
  moduleLoaders: {
    // Engine modules (from @warpgogol/werkstatt)
    "forge-core": async () => (await import("@warpgogol/forge/os/core")).forgeCoreModule,
    "forge-compass": async () => (await import("@warpgogol/forge/os/compass")).forgeCompassModule,
    // ... other forge modules (unchanged)
  },
  pipelines: {
    "packages.check": [...PACKAGES_CHECK_PIPELINE],
  },
});
```

Engine modules (mission, release, leitstand, bordbuch, sternsystem, etc.) are registered by the plugin through the plugin registry, not listed individually in `kernel.config.ts`. Forge modules stay direct imports (forge is a separate npm package, unchanged).

### 2. Rewrite all import specifiers

Mechanical sweep across the monorepo:

| Old specifier | New specifier |
| --- | --- |
| `@warpgogol/site-kernel` | `@warpgogol/werkstatt` |
| `@warpgogol/site-kernel-handoff` | `@warpgogol/werkstatt` (subpath) |
| `@warpgogol/site-kernel-checks` | `@warpgogol/werkstatt-site/checks` |
| `@warpgogol/site-kernel-codegen` | `@warpgogol/werkstatt-site/codegen` |
| `@warpgogol/site-kernel-content` | `@warpgogol/werkstatt-site/content` |
| `@warpgogol/site-kernel-onboarding` | `@warpgogol/werkstatt-site/onboarding` |
| `@warpgogol/site-kernel-astro` | `@warpgogol/werkstatt-site/paths` |
| `@warpgogol/site-kernel-deploy` | `@warpgogol/werkstatt-site/deploy` |
| `@warpgogol/site-kernel-integrity` | `@warpgogol/werkstatt/integrity` |
| `@warpgogol/site-kernel-observability` | `@warpgogol/werkstatt/observability` |
| `@warpgogol/site-kernel-changelog` | `@warpgogol/werkstatt-site/changelog` |
| `@warpgogol/site-kernel-audit` | `@warpgogol/werkstatt-site/audit` |
| `@warpgogol/fingerprint` | `@warpgogol/werkstatt/fingerprint` |
| `@warpgogol/agent-gate` | `@warpgogol/werkstatt/agent-gate` |
| `@warpgogol/ui` | `@warpgogol/werkstatt-site/ui` |
| `@warpgogol/pbp` | `@warpgogol/werkstatt-site/pbp` |
| `@warpgogol/ontology` | `@warpgogol/werkstatt-site/ontology` |
| `@warpgogol/tokens` | `@warpgogol/werkstatt-site/tokens` |
| `@warpgogol/share` | `@warpgogol/werkstatt-site/share` |
| `@warpgogol/surface` | `@warpgogol/werkstatt-site/surface` |
| ... (all domain packages) | `@warpgogol/werkstatt-site/<name>` |

### 3. Delete old package directories

After the sweep and full test suite green: delete `packages/os/*`, `packages/fingerprint`, `packages/agent-gate`, `packages/ui`, `packages/pbp`, `packages/ontology`, `packages/tokens`, `packages/share`, `packages/growth*`, `packages/integration*`, `packages/chat*`, `packages/surface`, `packages/geo`, `packages/faq`, `packages/passport`, `packages/content-source`, `packages/studio-gate`, `packages/check-core`, `packages/check-runner-node`, `packages/observability`, `packages/nebula`, `packages/star-map`, `packages/warpgogol-skills`.

### 4. Update `pnpm-workspace.yaml`

Remove old package globs; add `packages/werkstatt` and `packages/werkstatt-site` (for dogfooding via `workspace:*`).

### 5. Update `forge.yaml` bindings

Commands referencing `site-kernel run` become `werkstatt run`. The `skillPacks` dir updates to point inside `packages/werkstatt-site`.

### 6. Retire `site-kernel` CLI name

All scripts, hooks, CI workflows, and docs referencing `pnpm exec site-kernel run` switch to `pnpm exec werkstatt run`. A temporary `site-kernel` bin alias in `packages/werkstatt` exists only during this RFC's implementation window, then is removed.

## Architectural fit

- **DNA-1, 2** — workshop layout preserved; only package sources change.
- **DNA-64** — the workshop now composes engine + plugin per the contract.
- **DNA-62 (pinned files)** — `tools/kernel.config.ts`, `forge.yaml`, `pnpm-workspace.yaml` are pinned; the migration updates them with `--allow-pinned-override`.

## Design

### Execution gates

| Gate | Check |
| --- | --- |
| Import sweep complete | `imports.validate` green, zero old specifiers in `packages/**` and `services/**` |
| Typecheck | `pnpm -r run build:check` green |
| Test suite | All package tests green |
| Mission lifecycle | `mission.open → materialize → validate → dev-deploy` on warpgogol-com |
| Release lifecycle | `release.prepare → ready → propagate → promote` on a test release |
| Autonomy guard | `werkstatt.autonomy.validate` green |
| Plugin validate | `werkstatt.plugin.validate` green |
| Old dirs gone | No `packages/os/*` or old domain package dirs remain |
| CLI name | `werkstatt --version` works; `site-kernel` alias removed |

### Failure modes

- Hidden import of an old specifier in a generated file or workpiece → `imports.validate` catches it.
- Mission lifecycle regression → gate 4 blocks; must fix before proceeding.

## Rollout

- This RFC is a single atomic migration: the sweep, config rewrite, and deletion happen in one implementation session (possibly multiple commits, but one RFC window).
- The `site-kernel` CLI alias exists only within this RFC's implementation and is removed in the same RFC.
- After this RFC, the workshop is the reference consumer: what external workshops get from npm, this workshop gets from `workspace:*`.

## Alternatives considered

- **Gradual migration package-by-package.** Rejected: the import sweep is mechanical and the old packages have cross-dependencies — partial migration creates a broken intermediate state.
- **Keep `site-kernel` as a permanent CLI alias.** Rejected: charter principle 3 (no legacy).

## Risks

- **Workpiece import breakage.** Active mission workpieces reference old specifiers. The sweep must cover `missions/*/workpiece/` too. Mitigation: `imports.validate` scans workpieces.
- **Service import breakage.** `services/*` import from `@warpgogol/site-kernel*` and domain packages. The sweep covers them.
- **Hook and CI references.** `hooks/pre-commit` references `site-kernel run ecosystem.commit`; CI workflows reference `site-kernel run`. All must be rewritten.
- **Test fixture paths.** Many tests reference old package names in temp workspaces. Budget time for fixture repair.

## Acceptance criteria

- [ ] `tools/kernel.config.ts` imports from `@warpgogol/werkstatt` and `@warpgogol/werkstatt-site` only
- [ ] Zero old `@warpgogol/site-kernel*` or old domain package specifiers in the codebase
- [ ] Full mission lifecycle green on warpgogol-com (open → materialize → validate → dev-deploy)
- [ ] Full release lifecycle green (prepare → ready → propagate → promote)
- [ ] `werkstatt.autonomy.validate` and `werkstatt.plugin.validate` pass
- [ ] All old package directories deleted
- [ ] `pnpm-workspace.yaml` and `forge.yaml` updated
- [ ] `site-kernel` CLI alias removed
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
