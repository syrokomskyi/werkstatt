---
id: RFC-0772
title: "Consolidate engine core into packages werkstatt with plugin registry"
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
  - RFC-0770
  - RFC-0771
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
  proposed:
    - werkstatt.autonomy.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals:
  - "packages/werkstatt typechecks and tests pass with zero @warpgogol/* imports"
  - "werkstatt.autonomy.validate passes in packages.check"
  - "All mission/release/leitstand tests green against the consolidated package"
nonGoals:
  - "No workshop migration — tools/kernel.config.ts rewrite is RFC-0776"
  - "No npm publication — that is RFC-0773"
  - "No site plugin composition — RFC-0774/0775"
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

# RFC-0772: Consolidate engine core into packages werkstatt with plugin registry

## Context

RFC-0771 defines the normative module map for the engine; RFC-0770 defines the plugin contract. This RFC executes both: physically consolidates the mapped modules into `packages/werkstatt`, implements the plugin registry, inverts the engine→stack imports through hooks, and installs the autonomy guard.

## Problem

The map and contract are paper until the code moves. The dangerous part is the inversion: `mission-materialize.ts`, `leitstand-commands.ts`, and `release-commands.ts` call `runGenerate*`, Axiom checks, onboarding templates, and Astro builds directly. Each such call site must become a plugin hook invocation without changing observable behavior for the site workshop.

## Decision

`packages/werkstatt` is created and populated per the RFC-0771 map. The plugin registry (RFC-0770) is implemented in `src/plugin/`. Every engine→stack call site is inverted through a plugin hook. A `werkstatt.autonomy.validate` guard (modeled on forge's autonomy guard) fails the build if any engine module imports `@warpgogol/*`. Source packages are deleted after their content moves — no re-export shims (charter principle 3).

## Architectural fit

- **DNA-64** — this RFC installs the enforcement (`werkstatt.autonomy.validate`).
- **DNA-51/52/53** — primitives move intact; existing tests move with their modules.
- **Forge precedent** — autonomy guard semantics copied from `forge.doctor`'s `@warpgogol/*` import check on `packages/forge`.

## Design

### Execution phases

| Phase | Content | Gate |
| --- | --- | --- |
| 1 | Create `packages/werkstatt` skeleton, move `site-kernel` core in, wire subpath exports | typecheck + kernel tests |
| 2 | Move handoff modules (mission, sternsystem, release, leitstand, bordbuch, notausgang, artifact-store, evidence, deploy, identity, primitives) | handoff test suite green |
| 3 | Move integrity, observability, fingerprint, agent-gate, changelog core | full `packages.check` |
| 4 | Extract operations schemas from share/ontology into `src/schemas/` | schema consumers typecheck |
| 5 | Implement plugin registry + hooks; invert call sites in `mission-materialize.ts`, `leitstand-commands.ts`, `release-commands.ts` | behavior parity: mission/release/leitstand tests unchanged |
| 6 | Install `werkstatt.autonomy.validate`; delete emptied source packages; update PACKAGE_GRAPH.md | autonomy guard green; no dangling imports |

During phases 1–5 the old packages temporarily re-export from the new location so the workshop keeps building **within this RFC's implementation window only**; phase 6 removes them. This is a construction scaffold, not a compatibility layer — it never ships.

### CLI surface

```sh
pnpm exec site-kernel run werkstatt.autonomy.validate --json
```

Workspace scope. Scans `packages/werkstatt/src/**` for `@warpgogol/*` import specifiers; any match is a violation.

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

- Any `@warpgogol/*` import inside the engine → exit 1.
- Hook invocation with no registered plugin → engine throws `PLUGIN-01` at composition time (RFC-0770), not at hook time.

## Rollout

- Phases are separate commits (possibly separate sessions); each phase gate must be green before the next starts.
- `werkstatt.autonomy.validate` joins `packages.check` permanently in phase 6.
- The temporary re-export scaffold exists only between phases 1 and 6 of this RFC's implementation and is deleted in phase 6.

## Alternatives considered

- **git-filter moves preserving history in a new repo.** Not applicable — development stays in this monorepo; `git log --follow` covers history.
- **Keep old packages as permanent re-export shims.** Rejected: charter principle 3 (no legacy).
- **Invert imports without a registry (constructor injection everywhere).** Rejected: mission/leitstand handlers are invoked by the kernel command table, not constructed by consumers; a registry is the natural seam.

## Risks

- **Behavior drift during inversion.** Mitigated by the phase-5 gate: existing mission/release/leitstand test suites must pass unchanged (tests move, assertions do not).
- **Import-path churn across the monorepo.** ~40 packages/services import `@warpgogol/site-kernel*`. Phase 6 includes a mechanical rewrite sweep; `imports.validate` and typecheck gate it.
- **Test fixture paths.** Many tests build temp workspaces referencing old package names (memories confirm heavy fixture coupling). Budget explicit time for fixture repair in the plan.

## Acceptance criteria

- [ ] `packages/werkstatt` exists and contains all RFC-0771 engine modules
- [ ] Plugin registry and hooks implemented per RFC-0770
- [ ] All engine→stack call sites inverted; behavior parity proven by unchanged test assertions
- [ ] `werkstatt.autonomy.validate` registered and wired into `packages.check`
- [ ] Emptied source packages deleted; no re-export shims remain
- [ ] `docs/PACKAGE_GRAPH.md` regenerated/updated
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
