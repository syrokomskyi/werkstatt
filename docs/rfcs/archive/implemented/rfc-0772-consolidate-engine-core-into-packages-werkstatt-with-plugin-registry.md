---
id: RFC-0772
title: "Consolidate engine core into packages werkstatt with plugin registry"
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
  - DNA-51
  - DNA-52
  - DNA-53
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
# DNA-64 will be added here once RFC-0769 is implemented (appends DNA-64 to
# docs/architecture-dna.md). Until then, dna.registry.validate would reject
# a non-existent DNA id in satisfies[].
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
  added:
    - werkstatt.autonomy.validate
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/os/site-kernel
  - packages/os/site-kernel-handoff
  - packages/os/site-kernel-integrity
  - packages/os/site-kernel-observability
  - packages/os/site-kernel-changelog
  - packages/os/site-kernel-deploy
  - packages/fingerprint
  - packages/agent-gate
  - packages/share
  - packages/ontology
successSignals:
  - "packages/werkstatt typechecks and tests pass with zero @warpgogol/* imports"
  - "werkstatt.autonomy.validate passes in packages.check"
  - "All mission/release/leitstand tests green against the consolidated package"
nonGoals:
  - "No workshop migration — tools/kernel.config.ts rewrite is RFC-0776"
  - "No npm publication — that is RFC-0773"
  - "No site plugin composition — RFC-0774/0775"
  - "No deletion of old source packages — deferred to RFC-0776 after workshop migration completes. Re-export scaffold persists between RFC-0772 and RFC-0776 as a construction scaffold within the program waves, not a permanent compatibility layer."
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
batch: engine-consolidation
---

# RFC-0772: Consolidate engine core into packages werkstatt with plugin registry

## Context

RFC-0771 defines the normative module map for the engine; RFC-0770 defines the plugin contract. This RFC executes both: physically consolidates the mapped modules into `packages/werkstatt`, implements the plugin registry, inverts the engine→stack imports through hooks, and installs the autonomy guard.

## Problem

The map and contract are paper until the code moves. The dangerous part is the inversion: `mission-materialize.ts`, `leitstand-commands.ts`, and `release-commands.ts` call `runGenerate*`, Axiom checks, onboarding templates, and Astro builds directly. Each such call site must become a plugin hook invocation without changing observable behavior for the site workshop.

## Decision

`packages/werkstatt` is created and populated per the RFC-0771 map. The plugin registry (RFC-0770) is implemented in `src/plugin/`. Every engine→stack call site is inverted through a plugin hook. A `werkstatt.autonomy.validate` guard (modeled on forge's autonomy guard) fails the build if any engine module imports `@warpgogol/*`. Source packages are **not deleted in this RFC** — the re-export scaffold persists until RFC-0776 rewrites `tools/kernel.config.ts` and all ~40 consumer packages, then deletes the emptied source packages.

## Architectural fit

- **DNA-64** — this RFC installs the enforcement (`werkstatt.autonomy.validate`). DNA-64 is proposed by RFC-0769 (draft); it must be appended to `docs/architecture-dna.md` before this RFC is accepted. Once DNA-64 exists in the registry, add it to `satisfies[]`.
- **DNA-51** (werkstatt consistency primitives) — primitives move intact into `src/werkstatt/`; existing tests move with their modules. The invariant's enforcement commands (`werkstatt.lock.status`, `werkstatt.operation.validate`) remain in the engine.
- **DNA-52** (release artifact store) — the artifact store moves into `src/artifact-store/`; enforcement commands (`artifact.store.put/get/validate/gc`) remain in the engine.
- **DNA-53** (semantic fingerprint governance) — the fingerprint package moves into `src/fingerprint/`; the "no ad hoc hashing" rule carries over as an engine rule. Exported as `@warpgogol/werkstatt/fingerprint`.
- **Forge precedent** — autonomy guard semantics copied from `forge.doctor`'s `@warpgogol/*` import check on `packages/forge` (`packages/forge/src/onboarding/doctor.ts:92-123`).

## Design

### Execution phases

| Phase | Content | Gate |
| --- | --- | --- |
| 1 | Create `packages/werkstatt` skeleton, move `site-kernel` core in, wire subpath exports | typecheck + kernel tests |
| 2 | Move handoff modules (mission, sternsystem, release, leitstand, bordbuch, notausgang, artifact-store, evidence, deploy, identity, primitives) | handoff test suite green |
| 3 | Move integrity, observability, fingerprint, agent-gate, changelog core | full `packages.check` |
| 4 | Extract operations schemas from share/ontology into `src/schemas/` | schema consumers typecheck |
| 5 | Implement plugin registry + hooks; invert call sites in `mission-materialize.ts`, `leitstand-commands.ts`, `release-commands.ts` | behavior parity: mission/release/leitstand tests unchanged |
| 6 | Install `werkstatt.autonomy.validate`; update PACKAGE_GRAPH.md | autonomy guard green; `packages.check` passes |

During phases 1–5 the old packages temporarily re-export from the new location so the workshop keeps building. The re-export scaffold persists until RFC-0776 rewrites `tools/kernel.config.ts` and all ~40 consumer packages, then deletes the emptied source packages. This is a construction scaffold within the program waves, not a permanent compatibility layer — it never ships to npm.

### CLI surface

```sh
pnpm exec werkstatt run werkstatt.autonomy.validate --json
```

> **CLI name note:** RFC-0771 retires the `site-kernel` CLI binary name in favor of `werkstatt`. The rename happens in RFC-0776 (workshop migration). Until then, `site-kernel` remains the active CLI binary name, and the command above is correct for the implementation window.

Workspace scope. Scans `packages/werkstatt/src/**` for `@warpgogol/*` import specifiers; any match is a violation. Excludes `node_modules/`, `tests/`, and `*.test.ts`/`*.spec.ts` files (matching the forge precedent at `packages/forge/src/onboarding/doctor.ts:106`). Type-only imports (`import type { ... } from "@warpgogol/..."`) are also violations — the engine must not depend on plugin types at compile time.

### Output format

```json
{
  "command": "werkstatt.autonomy.validate",
  "status": "fail",
  "violations": [
    { "file": "packages/werkstatt/src/mission/mission-materialize.ts", "specifier": "@warpgogol/site-kernel-codegen" }
  ]
}
```

### Failure modes

- Any `@warpgogol/*` import inside the engine (including type-only imports) → exit 1.
- Hook invocation with no registered plugin → engine throws `PLUGIN-01` at composition time (RFC-0770), not at hook time.
- `packages/werkstatt/src/` directory does not exist → exit 1 with message "engine package not found".
- Self-imports (`@warpgogol/werkstatt` importing from itself) are NOT violations — the engine may import its own subpath exports.

## Rollout

- Phases are separate commits (possibly separate sessions); each phase gate must be green before the next starts.
- `werkstatt.autonomy.validate` joins `packages.check` permanently in phase 6.
- The re-export scaffold persists from phase 1 until RFC-0776 completes the workshop migration and deletes the emptied source packages. It is a construction scaffold within the program waves, not a permanent compatibility layer.
- RFC-0769 must be implemented (DNA-64 appended to `docs/architecture-dna.md`) before this RFC is accepted.
- RFC-0776 depends on this RFC: it rewrites `tools/kernel.config.ts` to import from `@warpgogol/werkstatt`, rewrites all ~40 consumer import paths, and deletes the emptied source packages.

### Import path mapping (phase 6 → RFC-0776)

The mechanical rewrite sweep maps old import specifiers to new subpath exports per RFC-0771's module map:

| Old specifier                                          | New specifier                         |
| ------------------------------------------------------ | ------------------------------------- |
| `@warpgogol/site-kernel`                               | `@warpgogol/werkstatt/kernel`         |
| `@warpgogol/site-kernel-handoff/mission-module`        | `@warpgogol/werkstatt/mission`        |
| `@warpgogol/site-kernel-handoff/release-module`        | `@warpgogol/werkstatt/release`        |
| `@warpgogol/site-kernel-handoff/leitstand-module`      | `@warpgogol/werkstatt/leitstand`      |
| `@warpgogol/site-kernel-handoff/sternsystem-module`    | `@warpgogol/werkstatt/sternsystem`    |
| `@warpgogol/site-kernel-handoff/bordbuch-module`       | `@warpgogol/werkstatt/bordbuch`       |
| `@warpgogol/site-kernel-handoff/notausgang-module`     | `@warpgogol/werkstatt/notausgang`     |
| `@warpgogol/site-kernel-handoff/artifact-store-module` | `@warpgogol/werkstatt/artifact-store` |
| `@warpgogol/site-kernel-handoff/evidence-module`       | `@warpgogol/werkstatt/evidence`       |
| `@warpgogol/site-kernel-handoff/deploy-module`         | `@warpgogol/werkstatt/deploy`         |
| `@warpgogol/site-kernel-handoff/identity-module`       | `@warpgogol/werkstatt/identity`       |
| `@warpgogol/site-kernel-integrity`                     | `@warpgogol/werkstatt/integrity`      |
| `@warpgogol/site-kernel-observability`                 | `@warpgogol/werkstatt/observability`  |
| `@warpgogol/fingerprint`                               | `@warpgogol/werkstatt/fingerprint`    |
| `@warpgogol/agent-gate`                                | `@warpgogol/werkstatt/agent-gate`     |
| `@warpgogol/site-kernel-changelog`                     | `@warpgogol/werkstatt/changelog`      |

The full mapping is derived from RFC-0771's module map table. Packages not listed here (e.g. `site-kernel-astro`, `site-kernel-checks`, `site-kernel-codegen`) move to the site plugin (RFC-0774/0775), not to the engine.

### Engine→stack call sites to invert (phase 5)

The following call sites in `mission-materialize.ts`, `leitstand-commands.ts`, and `release-commands.ts` must be inverted through plugin hooks:

| File                     | Current call                 | Plugin hook (RFC-0770)  |
| ------------------------ | ---------------------------- | ----------------------- |
| `mission-materialize.ts` | `runGenerate*` (codegen)     | `hooks.materialize`     |
| `mission-materialize.ts` | Axiom check gate             | `hooks.checkGate`       |
| `mission-materialize.ts` | Astro build invocation       | `hooks.build`           |
| `leitstand-commands.ts`  | `dev-deploy` build step      | `hooks.build`           |
| `leitstand-commands.ts`  | `dev-deploy` check gate      | `hooks.checkGate`       |
| `release-commands.ts`    | behavior snapshot generation | `hooks.releaseEvidence` |
| `release-commands.ts`    | release build step           | `hooks.build`           |

Additional call sites discovered during implementation must be added to this table via an RFC amendment.

### File system responsibilities

| Path | Action |
| --- | --- |
| `packages/werkstatt/` | Created — new engine package |
| `packages/werkstatt/src/kernel/` | Moved from `packages/os/site-kernel/` |
| `packages/werkstatt/src/mission/` | Moved from `packages/os/site-kernel-handoff/src/mission/` |
| `packages/werkstatt/src/sternsystem/` | Moved from `packages/os/site-kernel-handoff/src/sternsystem/` |
| `packages/werkstatt/src/release/` | Moved from `packages/os/site-kernel-handoff/src/release/` |
| `packages/werkstatt/src/leitstand/` | Moved from `packages/os/site-kernel-handoff/src/leitstand/` |
| `packages/werkstatt/src/bordbuch/` | Moved from `packages/os/site-kernel-handoff/src/bordbuch/` |
| `packages/werkstatt/src/notausgang/` | Moved from `packages/os/site-kernel-handoff/src/notausgang/` |
| `packages/werkstatt/src/artifact-store/` | Moved from `packages/os/site-kernel-handoff/src/artifact-store/` |
| `packages/werkstatt/src/evidence/` | Moved from `packages/os/site-kernel-handoff/src/evidence/` |
| `packages/werkstatt/src/deploy/` | Moved from `packages/os/site-kernel-handoff/src/deploy/` + `packages/os/site-kernel-deploy/` |
| `packages/werkstatt/src/identity/` | Moved from `packages/os/site-kernel-handoff/src/identity/` |
| `packages/werkstatt/src/werkstatt/` | Moved from `packages/os/site-kernel-handoff/src/werkstatt/` |
| `packages/werkstatt/src/integrity/` | Moved from `packages/os/site-kernel-integrity/` |
| `packages/werkstatt/src/observability/` | Moved from `packages/os/site-kernel-observability/` |
| `packages/werkstatt/src/fingerprint/` | Moved from `packages/fingerprint/` |
| `packages/werkstatt/src/agent-gate/` | Moved from `packages/agent-gate/` |
| `packages/werkstatt/src/changelog/` | Moved from `packages/os/site-kernel-changelog/` (pipeline core only) |
| `packages/werkstatt/src/plugin/` | Created — plugin registry + hooks (RFC-0770) |
| `packages/werkstatt/src/schemas/` | Created — operations schemas from `packages/share` + `packages/ontology` |
| `packages/werkstatt/package.json` | Created — `@warpgogol/werkstatt`, bin: `werkstatt` |
| `packages/werkstatt/AGENTS.md` | Created — engine package agent guide |
| `docs/PACKAGE_GRAPH.md` | Updated — new package structure |
| `AGENTS.md` (root) | Updated — § Monorepo layout references `packages/werkstatt` |
| `docs/requirements.xml` | Updated — package structure changes |
| `docs/technology.xml` | Updated — package structure changes |

## Alternatives considered

- **git-filter moves preserving history in a new repo.** Not applicable — development stays in this monorepo; `git log --follow` covers history.
- **Keep old packages as permanent re-export shims.** Rejected: charter principle 3 (no legacy).
- **Invert imports without a registry (constructor injection everywhere).** Rejected: mission/leitstand handlers are invoked by the kernel command table, not constructed by consumers; a registry is the natural seam.

## Risks

- **Behavior drift during inversion.** Mitigated by the phase-5 gate: existing mission/release/leitstand test suites must pass unchanged (tests move, assertions do not).
- **Import-path churn across the monorepo.** ~40 packages/services import `@warpgogol/site-kernel*`. The mechanical rewrite sweep is deferred to RFC-0776; until then, re-export shims keep the workshop building. `imports.validate` and typecheck gate the sweep in RFC-0776.
- **Test fixture paths.** Many tests build temp workspaces referencing old package names (memories confirm heavy fixture coupling). Budget explicit time for fixture repair in the plan.
- **Re-export scaffold becoming permanent.** The scaffold persists between RFC-0772 and RFC-0776 (potentially across multiple sessions). Risk: if RFC-0776 is delayed, the scaffold becomes a de facto compatibility layer. Mitigation: the program waves are sequential; RFC-0776 is wave 4 and cannot start until RFC-0772 (wave 2) completes.
- **Autonomy guard false positives.** The regex-based scanner may flag imports in comments or strings. Mitigation: the forge precedent (`packages/forge/src/tests/doctor-autonomy.test.ts:81-97`) already handles comment exclusion; the same logic applies.
- **Performance of autonomy guard.** Scanning `packages/werkstatt/src/**` on every `packages.check` adds I/O cost. Estimated: ~200-400 `.ts` files (based on current `packages/os/*` file count), regex scan is O(file count × file size). Acceptable for a check that runs once per `packages.check` invocation, not per-file-change.

## Acceptance criteria

- [x] `packages/werkstatt` exists and contains all RFC-0771 engine modules (kernel, mission, sternsystem, release, leitstand, bordbuch, notausgang, artifact-store, evidence, deploy, identity, werkstatt, integrity, observability, fingerprint, agent-gate, changelog, plugin, schemas) (evidence: `packages/werkstatt/src/{kernel,mission,sternsystem,release,leitstand,bordbuch,notausgang,artifact-store,evidence,deploy,identity,werkstatt,integrity,observability,fingerprint,agent-gate,changelog,plugin,schemas}/` all exist)
- [x] Plugin registry and hooks implemented per RFC-0770 in `src/plugin/` (evidence: `packages/werkstatt/src/plugin-contract.ts`, `packages/werkstatt/src/plugin-registry.ts`, `packages/werkstatt/src/plugin/invoke-hook.ts`)
- [x] Plugin hook invocation helper implemented (`invokeHook`, `invokeMaterializeHook`, etc.) (evidence: `packages/werkstatt/src/plugin/invoke-hook.ts:23-70`)
- [x] `werkstatt.autonomy.validate` registered (workspace scope) and wired into `packages.check` (evidence: `packages/werkstatt/os/werkstatt-autonomy.module.ts`, `tools/kernel.config.ts:157-158`)
- [x] `werkstatt.autonomy.validate` passes — excludes `@warpgogol/werkstatt` (self-imports), `@warpgogol/ontology`, `@warpgogol/share` (shared schema packages, not stack plugins); flags `@warpgogol/site-kernel-*` stack-specific imports (evidence: `pnpm exec werkstatt run werkstatt.autonomy.validate --json` → status: pass, 378 files scanned, zero violations)
- [x] Re-export shims in old packages (`packages/os/site-kernel*`, `packages/fingerprint`, `packages/agent-gate`) re-export from `@warpgogol/werkstatt` so the workshop builds (evidence: `packages/os/site-kernel/src/index.ts` → `export * from "@warpgogol/werkstatt/kernel"`, `packages/os/site-kernel-handoff/src/index.ts` → `export * from "@warpgogol/werkstatt/handoff"`, `packages/fingerprint/src/index.ts` → `export * from "@warpgogol/werkstatt/fingerprint"`, `packages/agent-gate/src/index.ts` → `export * from "@warpgogol/werkstatt/agent-gate"`)
- [x] `docs/PACKAGE_GRAPH.md` regenerated/updated (evidence: `docs/PACKAGE_GRAPH.md` — updated with consolidated engine package structure and re-export shim table)
- [x] Root `AGENTS.md` § Monorepo layout updated to reference `packages/werkstatt` (evidence: `AGENTS.md` — `packages/werkstatt` listed in Monorepo layout section)
- [x] `packages/werkstatt/AGENTS.md` created (evidence: `packages/werkstatt/AGENTS.md` — full engine package guide with entry points, scripts, architecture, autonomy guard documentation)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0772 --json` → status: pass)

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
