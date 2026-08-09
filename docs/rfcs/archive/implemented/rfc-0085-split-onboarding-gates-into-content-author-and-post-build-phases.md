---
id: RFC-0085
title: "Split onboarding gates into content-author and post-build phases"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-23
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0074
  - RFC-0075
  - RFC-0076
commands:
  proposed: []
  added: []
  changed:
    - apps-check.run
    - app.contract.full
    - app.qa.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
  - os/site-kernel
successSignals:
  - 04-author and 05-audit can declare green without a built dist/ directory.
  - Build-dependent audits (passport.verify, audit.agent.readiness, first-party-data undeclared-field check, generated.marker on public/*, audit.llm post-build cache) live in a clearly named post-build gate that 06-handoff invokes after pnpm --filter <app> build.
  - apps-check.run no longer mixes content-discipline failures with missing-dist failures, making the diagnostic actionable.
nonGoals:
  - Removing any existing validator.
  - Auto-running pnpm --filter <app> build from a kernel command.
---

# RFC-0085: Split onboarding gates into content-author and post-build phases

## Context

`apps-check.run` aggregates every per-app validator the workspace ships, including:

- Content-discipline validators (`content.business.validate`, `content.references.validate`, `content.voice.lint`, `content.coverage.validate`, `naming.content.lint`, `mirroring.validate`, `semantic.drift.validate`, `page.block.validate`, etc.).
- Build-output validators (`passport.verify`, `audit.agent.readiness.validate`, `generated.marker.validate` against `public/sitemap.xml` / `public/llms.txt`, `lighthouse.budget.check`).
- LLM cache validators (`audit.llm.run`) that depend on the rendered HTML in `dist/`.

During the May 2026 warpgogol-com onboarding, every author-phase iteration tripped `apps-check.run` with `dist/`-missing errors that had nothing to do with the content being authored. The errors masked the real signal: the content-discipline validators that _did_ matter for the author phase were green, but the agent had to filter the noise to see it. The workflow `04-author.md` and `05-audit.md` both list `apps-check.run` as a required gate, forcing the agent to either run `pnpm --filter <app> build` (out of scope for content phases) or accept the workflow exiting non-zero and document the deferral.

## Problem

1. **One command, two concerns.** `apps-check.run` conflates "is the authored content disciplined?" with "is the built artifact production-ready?" The conflation has no name in the architecture and no documented contract.
2. **04-author and 05-audit cannot legitimately turn green.** Their workflows list `apps-check.run` as the final gate, but build-dependent checks fail before any build has happened. Agents either ignore the workflow's "exit 0 required" checkpoint or pre-build (a side effect not in the workflow).
3. **06-handoff carries the build expectation implicitly.** The workflow expects the agent to start the dev server but never asks for a build, so first-time agents discover the gap only at the handoff gate.

## Decision

Split `apps-check.run` into two cleanly scoped composite commands:

- **`apps-check.author`** — every per-app validator that reads `src/content/`, manifests, configs, and onboarding outputs. NO `dist/` access. This is the gate for 04-author and 05-audit.
- **`apps-check.postbuild`** — every per-app validator that requires `apps/<id>/dist/` (passport.verify, audit.agent.readiness.validate, public/\* generated-marker checks, lighthouse.budget.check, post-build audit.llm cache). This is the gate for 06-handoff, run after `pnpm --filter <app> build`.

`apps-check.run` remains as an alias for "run both, in order" — useful for CI and for humans who want the full pass without distinguishing.

The workflows are updated accordingly:

- `04-author.md` lists `apps-check.author` instead of `apps-check.run`.
- `05-audit.md` lists `apps-check.author` plus the deterministic audit list (already there).
- `06-handoff.md` adds an explicit `pnpm --filter <client.id> build` step and lists `apps-check.postbuild` plus `apps-check.run` (full pass).

## Architectural fit

- **RFC-0074** designed the audit validators; this RFC clarifies the run-order contract without changing their internal logic.
- **RFC-0075** introduced the workflow files; this RFC tightens which gate each workflow runs.
- **RFC-0076** declared phase artifacts; this RFC ensures the phase-validator and the per-phase gates have the same answer about "did this phase pass."

## Design

### CLI surface

```sh
pnpm exec werkstatt run apps-check.author --app <id>
pnpm exec werkstatt run apps-check.postbuild --app <id>
pnpm exec werkstatt run apps-check.run --app <id>  # = author + postbuild
```

### Membership

The split is mechanical, based on whether each validator reads from `dist/`:

| Validator | Phase |
| --- | --- |
| `content.*` (business / references / voice / coverage / discipline) | author |
| `page.block.validate` | author |
| `naming.content.lint` | author |
| `mirroring.validate` | author |
| `semantic.drift.validate` | author |
| `grace.validate` | author |
| `uni.registry.validate` | author |
| `cosmic.name.unique` | author |
| `seo.internal-linking.validate` | author |
| `seo.structured-data.validate` | author (reads system.md + page blocks) |
| `analytics.config.validate` | author |
| `first-party-data.validate` (YAML check) | author |
| `infra.brief.validate` | author |
| `biome.contract.validate` | author |
| `constellation.contract.validate` | author |
| `archetype.registry.validate` | author |
| `seo.technical.validate` | postbuild |
| `passport.verify` | postbuild |
| `audit.agent.readiness.validate` | postbuild |
| `generated.marker.validate` (public/\*) | postbuild |
| `lighthouse.budget.check` | postbuild |
| `audit.llm.run` (HTML-based kinds) | postbuild |

### Failure modes

- Running `apps-check.postbuild` without a build → single, helpful error: `apps-check.postbuild requires apps/<id>/dist/. Run: pnpm --filter <id> build`.
- Running `apps-check.author` after a build → unchanged behavior; the build's existence is irrelevant.

## Rollout

1. Land the two new commands as composites; `apps-check.run` stays an alias.
2. Update `.agents/workflows/04-author.md`, `05-audit.md`, and `06-handoff.md` to reference the right composite.
3. Update `app.qa.validate` to call `apps-check.author` (its current `apps-check.run` invocation is the source of most 05-audit noise).
4. Add a `05.5-postbuild` workflow OR fold the build + `apps-check.postbuild` into the start of `06-handoff` — recommend the latter, since 06-handoff already pauses for a human deploy decision.

## Alternatives considered

- **Add a `--skip-postbuild` flag to `apps-check.run`.** Half-measure: agents still have to know which flag to pass per phase, and the noise persists when the flag is forgotten.
- **Auto-build inside the kernel command.** Rejected: builds are long, expensive, and side-effecting; the kernel should not start one without an explicit human / workflow request.

## Risks

- Splitting changes the gate semantics for any tooling that currently parses `apps-check.run` output. Mitigation: `apps-check.run` keeps its output envelope; only the workflows that invoke it change.

## Acceptance criteria

- [x] `apps-check.author` and `apps-check.postbuild` registered as composite commands. (evidence: implemented historically)
- [x] `apps-check.run` remains and is documented as "author + postbuild, in order." (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Workflow files `04-author.md`, `05-audit.md`, `06-handoff.md` updated. (evidence: implemented historically)
- [x] `app.qa.validate` calls `apps-check.author`. (evidence: implemented historically)
- [x] `06-handoff.md` lists `pnpm --filter <client.id> build` as a workflow step. (evidence: implemented historically)
- [x] Regression: warpgogol-com `apps-check.author` exits 0 against the May 2026 authored content. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- Agents implementing this RFC MUST run the resulting workflows end-to-end against `apps/nicaragua-projekt/` AND `apps/warpgogol-com/` to confirm the split does not regress either side.
