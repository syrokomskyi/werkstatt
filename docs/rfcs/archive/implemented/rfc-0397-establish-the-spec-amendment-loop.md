---
id: RFC-0397
title: "Establish the spec amendment loop"
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
  - RFC-0334
  - RFC-0335
  - RFC-0394
  - RFC-0395
  - RFC-0396
satisfies: []
commands:
  proposed: []
  added: []
  changed:
    - spec.validate
    - spec.status
  removed: []
appsImpacted: []
packagesImpacted:
  - "@wgogol/forge"
successSignals:
  - "An implementation finding produces an amendment file that survives spec.validate and is visible in spec.status"
  - "Snapshot files remain byte-identical through any number of amendments"
  - "Unmaterialized roadmap nodes are read in their amended form at materialization"
  - "A major spec revision re-vendors as <spec-id>@2 with an explicit supersession link"
nonGoals:
  - "Does not allow editing snapshot files — immutability (RFC-0394) is preserved absolutely"
  - "Does not amend repository RFCs — existing amends[]/supersedes[] governance covers those"
  - "Does not auto-accept amendments — each amendment is a decision with a human gate"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app webgogol-com"
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

# RFC-0397: Establish the spec amendment loop

## Context

RFC-0394 makes vendored spec snapshots immutable, and RFC-0396 materializes RFCs lazily against them. Implementation will inevitably contradict parts of any real spec: a field type proves wrong, an invariant proves unimplementable, a dependency proves inverted. RFC-0395 already needs a pre-acceptance correction channel for grilling findings. Both point at the same missing mechanism: a governed way to change what a spec _means_ without touching what it _says_.

## Problem

1. **No correction channel.** With snapshots immutable and `forge-spec.yaml` mutation restricted to `materializedAs`/`promotedTo`, a discovered spec error has nowhere to go — agents would either edit snapshots (breaking integrity) or fork the truth into RFC prose (silent divergence between spec and reality).
2. **Unmaterialized nodes inherit stale errors.** RFC-0396's lazy model exists precisely so later RFCs benefit from earlier lessons — but without amendments, those lessons never reach the roadmap the later RFCs are generated from.
3. **No major-revision path.** When the spec's author delivers version 2.0, there is no defined way to re-vendor without destroying the `specRef` history of version 1.

## Decision

Specs gain a **governed amendment loop**. A point correction is an **amendment file** `docs/specs/<spec-id>/amendments/amd-NNN-<slug>.md` — YAML frontmatter (id, status `proposed | accepted | rejected`, `targets[]` naming the affected snapshot sections / decisions / roadmap nodes, `discoveredBy` naming the triggering RFC or session, reviewers) plus a body stating what changes and why. Amendments are decisions: they take effect only with `status: accepted` set by the operator (lightweight gate, ADR-style, not a full RFC). `spec.validate` gains amendment rules (unique ids, resolvable targets, accepted amendments never contradict each other); `spec.status` and materialization (RFC-0396) read roadmap nodes **as amended**. A **major revision** (new spec version from its authors) re-vendors as a sibling spec `<spec-id>@2` (own snapshot, integrity, projection) whose `forge-spec.yaml` records `supersedes: <spec-id>`; the old spec gets `status: superseded` and stops materializing. Snapshot files are never modified in either path.

## Architectural fit

- **RFC-0394 (immutability):** amendments are the _only_ semantic change channel; the snapshot stays an honest historical document, the delta is explicit and reviewable — the same philosophy as `amends[]` on RFCs.
- **RFC-0334 (supersede escalation):** when a materialized RFC's implementation hits a spec contradiction, the escalation is: propose an amendment (spec-level analogue of `rfc.supersede.propose`), wait for the operator's acceptance, then proceed — never work around silently.
- **RFC-0335 (reviewer identity):** accepted amendments record `human:<handle>` reviewers.
- **RFC-0396 (lazy materialization):** the amended view is what makes laziness pay off — later portions are generated from corrected knowledge.
- **Forward-only:** the `@2` re-vendor supersedes rather than migrates; no compatibility interpretation layer between spec versions.

## Design

### CLI surface

No new commands. Existing spec commands gain amendment awareness:

```sh
pnpm exec site-kernel run spec.validate --spec=pbp --json   # now also checks amendments/
pnpm exec site-kernel run spec.status --spec=pbp --json     # shows amendment counts and amended nodes
```

Amendment files are authored by agents (during fo pipeline work or `fo-spec-ingest` grilling) and accepted by the operator — a judgment flow, not a CLI flow.

### TypeScript contracts

Extension of `packages/forge/os/spec/`:

```ts
interface SpecAmendment {
  schema: "forge/spec-amendment@1";
  id: string;                        // "amd-001"
  title: string;
  status: "proposed" | "accepted" | "rejected";
  createdAt: string;
  reviewers: string[];               // human:<handle>, required when accepted
  /** What this amendment changes. Each target must resolve. */
  targets: Array<
    | { kind: "section"; document: string; anchor: string }   // snapshot doc section
    | { kind: "decision"; id: string }                        // spec decision
    | { kind: "node"; id: string }                            // roadmap node
  >;
  /** Repo RFC or session that discovered the need. */
  discoveredBy: string;              // "RFC-0412" | "ingest-grilling"
}

/** Roadmap node with accepted amendments applied (used by spec.status / spec.materialize). */
function resolveAmendedNode(spec: ForgeSpec, nodeId: string, amendments: SpecAmendment[]): SpecRfcNode;
```

Amendment body (markdown, after frontmatter): `## Was` (quote the affected spec statement), `## Becomes` (the corrected statement), `## Why` (evidence from implementation), `## Impact` (affected materialized RFCs, if any).

**New `spec.validate` rules:** `SPEC-08` amendment schema/id violations · `SPEC-09` unresolvable target · `SPEC-10` two accepted amendments target the same anchor with conflicting `Becomes` (manual review flag) · `SPEC-11` accepted amendment without reviewers.

**Normative reference update (RFC-0396):** materialized RFCs referencing an amended section cite it as `docs/specs/pbp/02-….md §4 (as amended by amd-003)`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/specs/<id>/amendments/amd-NNN-<slug>.md` | Amendment records (created by agents, accepted by the operator) |
| `docs/specs/<id>/forge-spec.yaml` | Decision `status: amended` set when a decision is amended; `supersedes`/`status: superseded` on `@2` re-vendor |
| `docs/specs/<id>@2/**` | Major revision: fresh snapshot + integrity + projection via `fo-spec-ingest` |
| `packages/forge/os/spec/` | Amendment schema, `resolveAmendedNode`, SPEC-08..11 rules |
| Snapshot files | **Never touched** — unchanged from RFC-0394 |

### Output format

`spec.status` gains per-spec amendment info:

```json
{
  "id": "pbp",
  "amendments": { "proposed": 1, "accepted": 3, "rejected": 0 },
  "amendedNodes": ["RFC-PBP-032"],
  "amendedDecisions": ["ADR-012"]
}
```

`spec.validate` reports SPEC-08..11 in the standard violations array.

### Failure modes

- SPEC-08, SPEC-09, SPEC-11: errors, exit 1.
- SPEC-10 (conflicting accepted amendments): error, exit 1 — the operator must reject or revise one of them; the tooling never picks a winner.
- `proposed` amendments have no effect on `resolveAmendedNode` — only `accepted` ones apply.
- Materializing a node targeted by a `proposed` amendment: `spec.materialize` warns (node knowledge may be about to change) but proceeds — the operator saw the warning.

## Rollout

1. Add the amendment schema, `resolveAmendedNode`, and SPEC-08..11 to the spec module with unit tests (accepted/proposed/conflicting fixtures).
2. Wire the amended view into `spec.status` and `spec.materialize`.
3. Document the escalation rule (implementation contradicts spec → propose amendment) in `_shared/fo-pipeline-conventions.md` and root `AGENTS.md`.
4. The `@2` re-vendor path reuses `fo-spec-ingest` (RFC-0395) with a supersession question added to its flow — one small skill amendment.

Specs without amendments behave exactly as before — the directory is empty and all rules pass vacuously.

## Alternatives considered

- **Edit `forge-spec.yaml` directly.** Rejected: destroys decision history and makes integrity checking meaningless; the projection would silently drift from the snapshot.
- **Full re-vendor for every correction.** Rejected: `@N+1` per typo-scale finding is absurd ceremony; re-vendor is reserved for author-delivered major revisions.
- **Amendments as full RFCs.** Rejected: a spec correction is spec-scoped, not a repository architecture decision; the lightweight ADR-style gate matches the decision's blast radius. Corrections that DO change repository contracts still require their own RFC — the amendment then references it.
- **Auto-apply amendments as patches to snapshot copies.** Rejected: generated “effective text” artifacts double the surface that can drift; readers compose snapshot + accepted amendments, and materialized RFCs cite both explicitly.

## Risks

- **Amendment sprawl:** dozens of point corrections make the composed truth hard to read. `spec.status` surfaces counts; when amendments on one document exceed readability (operator judgment), that is the signal for an author-side `@2` revision.
- **Weak-agent composition failure:** an agent may read the snapshot section and miss amendments. Mitigated by the citation format (`as amended by amd-NNN`), the SPEC-10 conflict guard, and materialization pre-seeding references with amendment annotations.
- **Gate fatigue:** frequent small amendments each need operator acceptance. Acceptable by design — each is a real decision; batching several findings into one amendment is allowed when they share a cause.
- **Version confusion:** `<id>` vs `<id>@2` in `specRef`s. `spec.status` shows superseded specs; V-SPEC-01 (RFC-0396) still resolves old refs — history stays intact.

## Acceptance criteria

- [x] `SpecAmendment` schema and `resolveAmendedNode` exported from the spec module with unit tests covering accepted / proposed / conflicting amendments (evidence: tests pass, vitest run exitCode=0)
- [x] SPEC-08..11 implemented in `spec.validate` with fixture coverage (evidence: implemented historically)
- [x] `spec.status` reports amendment counts, amended nodes, and amended decisions (evidence: implemented historically)
- [x] `spec.materialize` uses amended nodes and warns on proposed-amendment targets (evidence: implemented historically)
- [x] The escalation rule (contradiction → propose amendment, never work around) documented in `_shared/fo-pipeline-conventions.md` and root `AGENTS.md` (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] `fo-spec-ingest` documents the `@N+1` re-vendor path with supersession linking (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- When implementation contradicts a vendored spec: STOP the contradicting step, author an amendment file with `status: proposed`, present it to the operator, and continue only after the operator's decision. Working around the spec silently is forbidden — this is the spec-level analogue of RFC-0334.
- Agents MUST NOT set an amendment's `status: accepted` — that is the operator's decision, recorded with `reviewers`.
- Agents MUST NOT edit snapshot files to “apply” an amendment — amendments compose at read time.
- When citing an amended section, agents MUST use the `(as amended by amd-NNN)` form.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0397 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
