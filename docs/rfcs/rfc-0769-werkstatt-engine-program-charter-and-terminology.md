---
id: RFC-0769
title: "Werkstatt engine program charter and terminology"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
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
enhancedAt: 2026-08-09
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-1
  - DNA-2
  - RFC-0398
  - RFC-0574
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
  - DNA-2
  - DNA-64
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: none
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals:
  - "DNA-64 exists in docs/architecture-dna.md and dna.registry.validate passes"
  - "RFC-0770..0779 drafts reference RFC-0769"
  - "Root AGENTS.md documents the engine/plugin/workshop taxonomy"
nonGoals:
  - "No code changes — this is a charter"
  - "No changes to @warpgogol/forge or @warpgogol/repo-extract"
  - "No public npm publication — packages are private"
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

# RFC-0769: Werkstatt engine program charter and terminology

## Context

The Werkstatt platform (missions, mirrors, releases, Bordbuch, Leitstand, plugin-loaded kernel modules) is welded into this monorepo as `packages/os/*` plus site-specific domain packages. The engine can only be used inside this repository. Meanwhile `@warpgogol/forge` already supports three stack profiles (`astro-typescript-turborepo`, `phaser-turborepo`, `editframe` in `packages/forge/profiles/`), and the operator needs game and video workshops that reuse the same mission/mirror/release discipline.

The precedent for shipping platform code outside this monorepo exists: `packages/forge` is developed here and published to npm via `@warpgogol/repo-extract` (`packages/forge/extract.config.yaml`, standalone mode).

This RFC is the program charter for extracting the Werkstatt engine into private npm packages, following the PBP program charter precedent (RFC-0398). It defines terminology, package taxonomy, boundaries, and the wave plan. Downstream RFCs (RFC-0770..0779) implement the program.

## Problem

Three structural couplings prevent reuse of the engine outside this monorepo:

1. **Engine ↔ stack coupling.** `@warpgogol/site-kernel-handoff` (missions, releases, Leitstand) declares Astro-specific packages as dependencies (`site-kernel-astro`, `site-kernel-checks`, `site-kernel-codegen`, `site-kernel-onboarding`) and statically imports from `site-kernel-checks` in production code (`leitstand-commands.ts`). The universal lifecycle engine cannot run without the site stack.
2. **Engine ↔ workshop coupling.** Engine code lives in `packages/os/*` of this monorepo; a new workshop cannot install it — it would have to fork the whole repository.
3. **No plugin contract.** `tools/kernel.config.ts` demonstrates dynamic module loading (`moduleLoaders`), but there is no formal contract binding a forge stack profile to a set of engine modules, paths, validators, and deploy adapters.

## Decision

The Werkstatt engine becomes a family of private npm packages developed in this monorepo and published via `@warpgogol/repo-extract`. The program establishes the following terminology and taxonomy (normative for all downstream RFCs):

### Terminology

| Term | Definition |
| --- | --- |
| **Engine** | `@warpgogol/werkstatt` — the stack-agnostic lifecycle platform: kernel runtime (registry, discovery, CLI, pipelines), missions, mirrors (Sternsystem), releases, Leitstand, Bordbuch, Notausgang, artifact store, evidence, deploy orchestration, werkstatt consistency primitives, fingerprint, integrity, observability. |
| **Plugin** | A stack-specific npm package implementing the plugin contract (RFC-0770): `@warpgogol/werkstatt-site`, `@warpgogol/werkstatt-game`, `@warpgogol/werkstatt-video`. A plugin provides path conventions, validators, codegen, content handling, onboarding templates, deploy adapters, and stack invariants. |
| **Workshop** | A consumer monorepo (pnpm + Turborepo) that installs the engine and exactly one plugin from npm, and contains: `forge.yaml` (stack profile), `tools/kernel.config.ts` (composition point), `systems/registry.yaml`, `missions/`, `docs/`, `.agents/`, hooks, CI, environment, and workshop-local packages/services. |
| **Project** | A Sternsystem registered in the workshop's `systems/registry.yaml`, living outside the workshop in mirrors (cache clone, bare repo, external mirrors) per RFC-0574. |
| **Stack profile** | A forge profile YAML (`packages/forge/profiles/*.yaml`) that declares the workshop's stack. The profile id is the binding key between forge, the engine, and the plugin. |

### Package taxonomy

| npm package | Contents | Source of truth |
| --- | --- | --- |
| `@warpgogol/werkstatt` | Engine (one consolidated package) | `packages/werkstatt` (this monorepo) |
| `@warpgogol/werkstatt-site` | Site plugin: Astro engine modules + full site domain layer (ui, pbp, ontology, tokens, share, growth, integration, chat, surface, geo, faq, passport, ...) | `packages/werkstatt-site` |
| `@warpgogol/werkstatt-game` | Game plugin (phaser-turborepo profile) | `packages/werkstatt-game` |
| `@warpgogol/werkstatt-video` | Video plugin (editframe profile) | `packages/werkstatt-video` |
| `@warpgogol/forge` | Governance (unchanged, already published) | `packages/forge` |
| `@warpgogol/repo-extract` | Extraction tool (unchanged, external) | external repo |

### Program principles

1. **Dependency inversion.** The engine never imports a plugin. Plugins import engine contracts and register themselves through the plugin registry (RFC-0770). Enforced by an autonomy guard analogous to forge's.
2. **Dogfooding.** This monorepo remains the site workshop and consumes the engine and site plugin as workspace packages (`workspace:*`) during development; external workshops consume the same code from npm.
3. **No legacy.** No compatibility shims, no re-export stubs, no backward-compatible migrators. Retired packages are deleted after consolidation (removal discipline per root `AGENTS.md` still applies — investigate before deleting).
4. **Publication via repo-extract.** Each published package carries an `extract.config.yaml`; publication happens from an external extraction folder, never from this monorepo directly (RFC-0773).
5. **Workshop layout is stable.** The workshop directory contract (registry, missions, docs, hooks, tools, environment) does not change shape as a result of this program; only where the engine code comes from changes.

### Wave plan

| Wave | RFCs | Content |
| --- | --- | --- |
| 0 | RFC-0769 | Charter (this document) |
| 1 | RFC-0770, RFC-0771 | Plugin contract; engine core composition |
| 2 | RFC-0772, RFC-0773 | Physical consolidation + plugin registry; publication pipeline |
| 3 | RFC-0774, RFC-0775 | Site plugin: engine modules; domain layer |
| 4 | RFC-0776 | Migrate this workshop to the consolidated packages |
| 5 | RFC-0777, RFC-0778, RFC-0779 | Game plugin; video plugin; consumer workshop scaffolding |

Waves execute sequentially; RFCs inside a wave may proceed in parallel. Implementation happens in separate sessions, one RFC at a time.

**DNA-64 established by this RFC:** Engine/plugin/workshop boundary — see Architectural fit.

## Architectural fit

- **DNA-1 (monorepo boundary)** — extended: shared reusable logic still lives in `packages/*`; the engine and plugins are the published subset. Projects remain Sternsystemen outside the workshop.
- **DNA-2 (pnpm + Turborepo)** — preserved; consumer workshops use the same layout.
- **DNA-46..52 (missions, materialization, releases, Leitstand, Notausgang, consistency primitives, artifact store)** — these contracts move into the engine package unchanged in semantics; only the physical home changes.
- **DNA-53 (fingerprint governance)** — the fingerprint package folds into the engine; the "no ad hoc hashing" rule survives as an engine rule.
- **DNA-54 (forge bindings)** — the plugin contract reuses the same de-hardcoding philosophy: stack-specific values live in profiles and plugins, never in engine code.
- **New DNA-64 · Engine/plugin/workshop boundary.** The Werkstatt engine (`@warpgogol/werkstatt`) is stack-agnostic and MUST NOT import stack plugins. Stack-specific logic lives in plugin packages (`@warpgogol/werkstatt-<stack>`) bound to a forge stack profile. A workshop composes engine + exactly one plugin in `tools/kernel.config.ts`. Established by this RFC; enforced from RFC-0772 (`werkstatt.autonomy.validate`).

## Design

This is a charter (prose-only). It introduces no CLI surface, types, or files beyond the DNA-64 registry entry. Design authority for the concrete mechanisms is delegated:

| Concern                                                                | RFC                |
| ---------------------------------------------------------------------- | ------------------ |
| Plugin interface, profile binding, dependency inversion mechanics      | RFC-0770           |
| Engine module map (what folds into `@warpgogol/werkstatt`)             | RFC-0771           |
| Physical consolidation, plugin registry implementation, autonomy guard | RFC-0772           |
| Extraction configs, private npm, versioning, CI                        | RFC-0773           |
| Site plugin composition                                                | RFC-0774, RFC-0775 |
| This workshop's migration                                              | RFC-0776           |
| Game/video plugins, consumer scaffolding                               | RFC-0777..0779     |

## Rollout

- Waves execute in order; each downstream RFC is audited/enhanced/planned/implemented in its own session.
- This monorepo migrates in wave 4 (RFC-0776); until then, existing `packages/os/*` continue to operate unchanged.
- No flag day: dogfooding via `workspace:*` means the site workshop always runs the same code it publishes.
- After wave 4, retired package directories are deleted — no deprecation shims (program principle 3).

## Alternatives considered

- **Vendored spec package (DNA-55) instead of an RFC series.** Rejected: DNA-55 targets external specifications; this program is internal and iterates with the codebase. The PBP charter precedent (RFC-0398) fits better.
- **Separate engine repository.** Rejected by the operator: development stays in this monorepo; publication goes through repo-extract, matching the forge precedent.
- **Publishing current `packages/os/*` as ~10 packages.** Rejected by the operator: consumer installs one engine + one plugin; the version matrix of 10 interdependent packages is operational noise.
- **Keeping domain packages (ui, pbp, ontology, ...) in the workshop.** Rejected by the operator: any site workshop gets the full site capability from `@warpgogol/werkstatt-site`.

## Risks

- **Big-bang consolidation risk.** Folding ~11 os packages into one breaks import paths everywhere. Mitigated by wave sequencing and by keeping this workshop on `workspace:*` during the transition (dogfooding catches breakage immediately).
- **Plugin contract too narrow.** If the contract misses a capability the site stack needs (e.g. surface expansion hooks), the site plugin will be forced to bypass the registry. Mitigated: RFC-0770 is derived from the actual `tools/kernel.config.ts` module inventory, not designed from scratch.
- **repo-extract feature gaps.** Consolidated packages are much larger than forge; extraction may hit unknown limits (LFS assets in ui, binary fixtures). RFC-0773 must include a dry-run verification gate.
- **DNA renumbering hazard.** DNA-64 must be appended, never renumbered (registry rule).

## Acceptance criteria

- [ ] DNA-64 entry appended to `docs/architecture-dna.md` referencing this RFC
- [ ] Root `AGENTS.md` gains a "Werkstatt engine program" section with terminology and package taxonomy
- [ ] All downstream RFCs (RFC-0770..0779) exist in draft with `related: [RFC-0769]`
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
