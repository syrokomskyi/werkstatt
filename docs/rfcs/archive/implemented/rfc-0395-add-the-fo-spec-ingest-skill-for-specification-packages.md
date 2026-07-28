---
id: RFC-0395
title: "Add the fo-spec-ingest skill for specification packages"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-19
updatedAt: 2026-07-19
implementedAt: 2026-07-19
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0335
  - RFC-0370
  - RFC-0393
  - RFC-0394
  - RFC-0396
  - RFC-0397
satisfies: []
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@wgogol/forge"
successSignals:
  - "fo-spec-ingest vendors the PBP package into docs/specs/pbp/ with a passing spec.validate"
  - "The skill builds forge-spec.yaml from an arbitrary-format package, asking the operator only where mapping is ambiguous"
  - "Spec-level grilling audits the spec delta against the project's invariants file before acceptance"
  - "fo-idea escalates oversized ideas (>7 atomic decisions with a dependency graph) to fo-spec-ingest authoring mode"
nonGoals:
  - "Does not materialize any RFC from the roadmap — that is RFC-0396"
  - "Does not define vendoring storage or spec.validate — that is RFC-0394"
  - "Does not translate spec documents — snapshots are vendored in their original language"
  - "Does not auto-accept specs — acceptance is a human decision, always"
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

# RFC-0395: Add the fo-spec-ingest skill for specification packages

## Context

RFC-0394 defines _where_ an external specification package lives (`docs/specs/<id>/`) and _what_ its machine-readable projection looks like (`forge-spec.yaml`). It deliberately leaves open _how_ a package gets there: someone must copy the snapshot, read arbitrary-format documents, extract decisions/roadmap/waves into the projection, stress-test the spec against the project's architecture, and obtain the human acceptance that later lets materialized RFCs inherit it (RFC-0396).

That someone is an agent following a skill — the work is judgment-heavy (interpreting prose, mapping ad-hoc structures, grilling) and cannot be a mechanical command.

## Problem

1. **No ingest path.** `fo-idea` step 4 decomposes ideas into 2–5 documents with per-document grilling; feeding it a 65-node pre-designed roadmap would mean re-grilling decisions the spec authors already made and re-decomposing a decomposition that already exists. The PBP package cannot enter the pipeline today.
2. **No spec-level stress test.** Grilling 65 RFCs individually is impractical, but skipping stress-testing entirely is dangerous: the spec may conflict with the project's invariants (e.g. a spec that assumes cookies would violate the WGogol storage policy). The right unit of grilling is the **spec delta against the project's invariants**, once.
3. **No acceptance gate.** RFC-0396's inherited-acceptance model needs a defined moment where a human accepts the spec as a whole — with a recorded reviewer identity (RFC-0335 spirit).
4. **No escalation from below.** When an operator's "simple idea" grows past series size during grilling, `fo-idea` has no way to hand over to spec authoring — the operator is left alone with an external editor.

## Decision

Forge gains the **`fo-spec-ingest`** skill (document-only) with two modes. **Ingest mode**: given a path to an external specification package, the skill vendors the snapshot per RFC-0394, builds `forge-spec.yaml` as an adapter over the package's actual format (asking the operator one question at a time only where mapping is ambiguous), runs `spec.validate`, performs **spec-level grilling** of the spec delta against the project's invariants file (`bindings.paths.invariantsFile`, RFC-0393), and presents the projection for the operator's acceptance decision — on acceptance the skill sets `status: accepted` + `reviewers` in `forge-spec.yaml` and commits. **Authoring mode**: invoked by `fo-idea`'s new escalation rule (decomposition yields more than 7 atomic decisions with a non-trivial dependency graph), the skill creates a spec skeleton in `docs/specs/<id>/` from the grilling results instead of vendoring, then follows the same validate→grill→accept flow. `fo-idea` is amended with this escalation rule.

## Architectural fit

- **Stage-evidence model (RFC-0394):** the skill is the point where spec artifacts are converted into pipeline stage credits — `decisions[]` marks grilling done for those decisions, `rfcs[]`+`dependsOn` marks decomposition done. One pipeline, both entrances.
- **RFC-0393 (bindings):** the invariants file for spec-level grilling is resolved via `bindings.paths.invariantsFile`; when it is `null`, the DNA-alignment part of spec grilling degrades explicitly (`Degraded:` report line) — portable to projects without an invariants document.
- **RFC-0335 (reviewer identity):** spec acceptance records `human:<handle>` reviewers in `forge-spec.yaml`, mirroring RFC acceptance discipline.
- **RFC-0370 (preferences):** all operator interaction in `aiLanguage`; `forge-spec.yaml` field values that the skill authors (titles, rationales it writes in authoring mode) use `documentationLanguage`.
- **Skill conventions (RFC-0374):** document-only concern, standard frontmatter, `dependsOn: ['my-preferences', 'grilling']`, commit-own-files discipline.

## Design

### CLI surface

No new CLI commands — this RFC ships a skill. The skill invokes existing commands:

```sh
pnpm exec site-kernel run spec.validate --spec=<id> --json   # after building the projection
```

Invocation: `/fo-spec-ingest <path-to-package>` (ingest mode) or inline delegation from `fo-idea` (authoring mode).

### Skill contract (SKILL.md structure)

`packages/forge/skills/fo/fo-spec-ingest/SKILL.md`, frontmatter: `invocation: user`, `category: fo`, `concerns: document-only`, `dependsOn: ['my-preferences', 'grilling']`, `bindings: { optional: [paths.invariantsFile], requires: [commands.specValidate] }` (RFC-0393).

**Ingest mode process (normative step list):**

1. **Locate and inventory** the package: list files, identify candidate roles (spec, entity model, roadmap, decision log, README) by filename and headings. Facts are looked up; only ambiguous role mappings become operator questions (one at a time, recommended answer first).
2. **Choose `spec-id`** (kebab-case, propose from package title; operator confirms).
3. **Vendor the snapshot**: copy files byte-exact into `docs/specs/<id>/`, generate `integrity.yaml`, create empty `amendments/`.
4. **Build `forge-spec.yaml`**: extract `decisions[]`, `rfcs[]` (ids, titles, `dependsOn`, `wave`, `sources`), `waves[]`, `documents{}` from the package documents. Where the package predefines an RFC granularity that mismatches repository practice, the skill MAY merge nodes — but MUST respect any explicit "do not combine" constraints in the package, and MUST record every merge as a mapping note in the node's `title` suffix `(merges <id>, <id>)`.
5. **Validate**: run `spec.validate --spec=<id>`; fix projection errors until clean (snapshot files are never touched).
6. **Spec-level grilling** (invoke `/grilling`): stress-test the spec delta against the project — conflicts with the invariants file, forward-only violations, storage policy, naming collisions, unrealistic dependencies. Findings that require spec changes are recorded as **pre-acceptance amendments** in `amendments/` (RFC-0397 format) — the snapshot stays immutable even before acceptance.
7. **Acceptance decision**: present a compact summary (decisions count, nodes, waves, grilling findings) and ask the operator to accept. On acceptance: set `status: accepted`, `reviewers: [human:<handle>]` in `forge-spec.yaml`. On decline: leave `status: vendored` and stop.
8. **Commit** (`spec: ingest <id> …`) staging only `docs/specs/<id>/**`.
9. **Report**: vendored files, projection stats, grilling verdict, acceptance status, next step (`/fo-spec-materialize` per RFC-0396).

**Authoring mode:** steps 2, 4–9 with the skeleton built from `fo-idea`'s decomposition + grilling output instead of an external package; `documents{}` may be empty; `sourceNote: "authored in-repo via fo-idea escalation"`.

**`fo-idea` amendment (escalation rule).** In `fo-idea` step 2, add: if decomposition yields **more than 7 atomic decisions** with at least one dependency edge, or the operator's description mentions waves/stages/data migration across many documents — propose escalation: “This is a specification, not a document series. Create a spec package via fo-spec-ingest authoring mode?” The operator may decline and stay with the series path.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/fo/fo-spec-ingest/SKILL.md` | The new skill (registered in `FORGE_SKILLS`, deployed to `.agents/skills/`) |
| `packages/forge/skills/fo/fo-idea/SKILL.md` | Amended with the escalation rule (step 2) |
| `docs/specs/<id>/**` | Created by the skill per RFC-0394 (snapshot, projection, integrity, amendments) |
| External package path | Read-only input; never modified |

### Output format

The skill's final report (chat, in `aiLanguage`):

```
## Spec Ingest Summary

### Spec: <id> (<title>)
### Snapshot: <N> files vendored, integrity manifest written
### Projection: <N> decisions, <N> roadmap nodes, <N> waves
### spec.validate: pass
### Spec-level grilling: <N> findings, <N> pre-acceptance amendments
### Degraded: <none | list of skipped capabilities>
### Acceptance: accepted by human:<handle> | declined (status: vendored)
### Next step: /fo-spec-materialize <id> (RFC-0396)
```

### Failure modes

- Package path unreadable or empty: stop with a clear message before touching `docs/specs/`.
- `spec-id` already exists in `docs/specs/`: stop; re-vendoring an existing spec is RFC-0397's `@N+1` path, not ingest.
- `spec.validate` cannot be made to pass by projection fixes alone (the package itself is inconsistent, e.g. a real dependency cycle): record the finding, ask the operator — amend at ingest (pre-acceptance amendment) or abort ingest. Never “fix” snapshot files.
- Operator declines acceptance: spec stays `vendored`; materialization (RFC-0396) refuses non-accepted specs — the pipeline is safely parked, nothing is lost.

## Rollout

1. Author `fo-spec-ingest/SKILL.md`, register in `FORGE_SKILLS`, pass `forge.skill.validate`, deploy to `.agents/skills/`.
2. Amend `fo-idea/SKILL.md` with the escalation rule (one commit).
3. Pilot: ingest the PBP package (`docs/specs/pbp/`) as the first real run — this is the acceptance test of the whole spec track.
4. Update root `AGENTS.md` skill surface.

Requires RFC-0394 implemented (`spec.validate` must exist). Benefits from RFC-0393 bindings but can run before it in WGogol (bindings resolve to current literals).

## Alternatives considered

- **Extend `fo-idea` step 4 to handle 65-node series.** Rejected: series decomposition and spec ingest differ in kind — per-document grilling vs. spec-delta grilling, agent decomposition vs. pre-existing roadmap; overloading one skill produces an unreadable instruction set.
- **Three separate skills (ingest / spec-audit / spec-grill), as the external expert proposed.** Rejected: audit and grilling are inseparable steps of the same acceptance flow, exactly as grilling lives inside `fo-idea-create-rfc`; three skills triple the orchestration surface for no autonomy gain.
- **Mechanical `spec.ingest` CLI command.** Rejected: role identification, projection mapping, and grilling need judgment; a command would either fail on real-world packages or hide LLM calls inside a CLI — skills are the ecosystem's tool for judgment work.
- **Per-RFC grilling of every roadmap node at ingest.** Rejected: the spec's decision log is evidence that those decisions were already stress-tested by its authors; re-grilling 65 nodes is waste — the delta against project invariants is the honest unit.

## Risks

- **Projection misrepresentation:** the adapter may mis-extract dependencies from prose. Mitigated by `spec.validate` (structural errors), the acceptance review (operator sees the projection summary), and amendments as the correction path — wrong projections are fixable without re-vendoring.
- **Weak-agent ambiguity flood:** an agent might ask the operator about every mapping. The skill mandates: facts from files, questions only for genuine ambiguity, one at a time, recommended answer first.
- **Escalation threshold misfire:** >7 is a heuristic; borderline ideas may bounce between series and spec paths. The operator always confirms the escalation — the threshold only triggers the question.
- **Acceptance-fatigue shortcut:** an agent may be tempted to auto-accept. The MUST NOT below and the `reviewers` requirement (human handle) block it.

## Acceptance criteria

- [x] `fo-spec-ingest/SKILL.md` exists, registered in `FORGE_SKILLS`, passes `forge.skill.validate`, deployed to `.agents/skills/` (evidence: implemented historically)
- [x] The skill documents both modes (ingest, authoring) with the normative step lists above (evidence: implemented historically)
- [x] `fo-idea/SKILL.md` contains the escalation rule with the >7-decision threshold and operator confirmation (evidence: implemented historically)
- [x] Pilot ingest of the PBP package produces `docs/specs/pbp/` with `spec.validate` passing and an operator acceptance decision recorded (evidence: docs/ directory, documentation exists)
- [x] Root `AGENTS.md` lists `fo-spec-ingest` in the skill surface (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC (author the skill, amend fo-idea) ONLY when it has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents executing the skill MUST NOT set `status: accepted` in `forge-spec.yaml` without an explicit operator acceptance in the session — acceptance is human-only, exactly like RFC acceptance.
- Agents MUST NOT modify snapshot files during ingest, including “obvious typo fixes” — pre-acceptance amendments are the only correction channel.
- Agents MUST ask mapping questions one at a time with a recommended answer first (grilling convention), and MUST NOT ask about anything derivable from the package files.
- Agents MUST record every node merge performed in step 4 — silent re-decomposition of the spec's roadmap is forbidden.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0395 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
