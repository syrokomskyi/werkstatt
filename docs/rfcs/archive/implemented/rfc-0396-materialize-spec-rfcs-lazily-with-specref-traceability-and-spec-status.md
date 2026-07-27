---
id: RFC-0396
title: "Materialize spec RFCs lazily with specRef traceability and spec.status"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
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
  - RFC-0224
  - RFC-0331
  - RFC-0335
  - RFC-0394
  - RFC-0395
  - RFC-0397
satisfies: []
commands:
  proposed: []
  added:
    - spec.status
    - spec.materialize
  changed:
    - rfc.list
    - rfc.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@wgogol/forge"
successSignals:
  - "spec.status shows per-node state (unmaterialized / draft / accepted / implemented) and the current materialization front for a spec"
  - "spec.materialize scaffolds RFC files for the next N front nodes with specRef frontmatter and normative source references"
  - "Materialized RFCs from an accepted spec transition to accepted via fo-idea-plan when their audit verdict is approved, citing the spec acceptance"
  - "rfc.list --spec=<id> filters materialized RFCs by spec"
nonGoals:
  - "Does not bulk-generate the entire roadmap — materialization is lazy by design"
  - "Does not copy spec model content into RFCs — RFCs reference vendored snapshot sections"
  - "Does not change RFC acceptance for non-spec RFCs — the inherited path applies only to RFCs with specRef into an accepted spec"
  - "Does not define amendments — that is RFC-0397"
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

# RFC-0396: Materialize spec RFCs lazily with specRef traceability and spec.status

## Context

After RFC-0394 (vendoring) and RFC-0395 (ingest + acceptance), an accepted spec sits in `docs/specs/<id>/` with a roadmap of dozens of RFC-sized nodes (PBP: ~65 nodes, Wave 1 alone lists 43). The remaining question is how those nodes become real, implementable RFCs in `docs/rfcs/`.

Bulk generation is the obvious and wrong answer: it floods `docs/rfcs/` with drafts whose tails go stale as early implementation teaches lessons, it creates a review mountain, and it degrades `rfc.list`/`rfc.validate` performance for the whole repository.

## Problem

1. **No materialization mechanism.** Nothing converts a `SpecRfcNode` into an RFC file carrying the right frontmatter, dependency links, and normative references back to the spec.
2. **No traceability field.** RFC frontmatter has no `specRef`; without it, neither humans nor commands can answer “which spec node does this RFC implement?” or “which nodes are already done?”.
3. **Acceptance economics.** The status gate (RFC-0224/0335) is per-RFC. For a 43-node wave, demanding a separate human acceptance ceremony per RFC ignores that the operator already accepted the spec as a whole at ingest — while dropping the gate entirely would be reckless.
4. **No progress view.** `rfc.list` sees only materialized files; the operator cannot see roadmap progress (“where are we on PBP?”) or which nodes are ready to materialize next.
5. **Template mismatch.** Spec nodes prescribe rich model content (schemas, field tables, fixtures); copying it into RFCs would duplicate the source of truth established by RFC-0394.

## Decision

Spec roadmap nodes are materialized **lazily, in dependency-front portions** (default 5–12 nodes, operator-adjustable): `spec.materialize --spec=<id> --next=<N>` scaffolds RFC files (via the existing `rfc.create` machinery) only for nodes whose prerequisites are all `implemented`. Materialized RFCs carry a new frontmatter field **`specRef: <spec-id>/<node-id>`**, use the **standard RFC template** with Design sections describing only the in-repo implementation and normatively referencing vendored snapshot sections (never copying model content), and set `related` from the node's resolved `dependsOn`. **Acceptance inheritance:** for an RFC whose `specRef` points into a spec with `status: accepted`, `fo-idea-plan` MAY transition it `draft → accepted` when its audit verdict is `approved`, recording the spec's reviewers and `via spec acceptance <spec-id>` — if the audit verdict is `needs-revision` or `rejected`, inheritance is void and a human decision is required. A new read-only `spec.status` command projects roadmap progress; `rfc.list` gains `--spec=<id>`; `rfc.validate` gains `specRef` checks.

## Architectural fit

- **RFC-0224 (agent status transitions):** inherited acceptance is a controlled extension of the existing rule that the operator's plan instruction IS acceptance — here the operator's acceptance was given once, at spec level, with a recorded reviewer (RFC-0335); the audit-verdict safety valve keeps the human in the loop for anomalies.
- **RFC-0394 (single source of truth):** the no-copy rule keeps the vendored spec authoritative; RFCs describe the _implementation in this repository_, the spec describes the _model_.
- **RFC-0331 (DNA trace):** `specRef` is the spec-track analogue of `satisfies` — a machine-checkable traceability edge.
- **Kernel cache (RFC-0382):** lazy materialization keeps the RFC corpus small; `spec.status` reads `forge-spec.yaml` + cached RFC entries, no new scan surface.
- **fo pipeline:** materialized RFCs flow through the normal audit → enhance → plan → implement pipeline; only the acceptance step is inherited.

## Design

### CLI surface

```sh
pnpm exec site-kernel run spec.status --spec=pbp --json
pnpm exec site-kernel run spec.materialize --spec=pbp --next=8 --json
pnpm exec site-kernel run rfc.list --spec=pbp --json
```

- `spec.status` (workspace, read-only): without `--spec`, summarizes all specs; with it, full per-node table + computed front.
- `spec.materialize` (workspace, mutates): `--spec` required; `--next=<N>` optional (default 8, hard cap 12); `--nodes=<id,id>` optional explicit selection (must still satisfy the front condition).
- `rfc.list --spec=<id>`: filters by `specRef` prefix.

Materialization is orchestrated by the agent (filling sections needs judgment); the command does the mechanical scaffold. The operator-facing entry point is the `fo-idea-i-just-want-to-see-the-result`-style flow: run `spec.materialize`, then the normal fo pipeline per created RFC.

### TypeScript contracts

Extension of `packages/forge/os/spec/` and `packages/forge/os/rfc/types.ts`:

```ts
// RFC frontmatter extension (rfc/types.ts)
interface RfcFrontmatter {
  // ...existing fields...
  /** Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020". */
  specRef?: string;
}

interface SpecStatusResult {
  command: "spec.status";
  specs: Array<{
    id: string;
    status: "vendored" | "accepted" | "superseded";
    nodes: Array<{
      id: string;                    // spec-local node id
      state: "unmaterialized" | "draft" | "accepted" | "implemented";
      materializedAs?: string;       // repo RFC id
      wave: number;
      blockedBy: string[];           // unimplemented prerequisites
    }>;
    front: string[];                 // node ids ready to materialize now
    progress: { implemented: number; total: number };
  }>;
}
```

**Materialization scaffold (per node):** create via the `rfc.create` handler with: `title` from the node, `kind` inferred (`contract` for schema/model nodes, `command` for validator/compiler nodes — the agent confirms during filling), `specRef`, `related` = repo ids of resolved `dependsOn` nodes (+ the spec's establishing RFCs), and a Design section pre-seeded with the node's `sources` as normative references: `Data model: see docs/specs/pbp/02-….md §4 (amendments: none)`. After creation, `spec.materialize` writes `materializedAs` back into `forge-spec.yaml`.

**`rfc.validate` new rules:** `V-SPEC-01` — `specRef` must parse as `<spec-id>/<node-id>` and resolve to an existing node in an existing spec; `V-SPEC-02` — the node's `materializedAs` must equal this RFC's id (bidirectional link); `V-SPEC-03` — an RFC with `specRef` into a non-`accepted` spec cannot have status beyond `draft`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/rfcs/rfc-NNNN-*.md` | Created by `spec.materialize` (standard template + `specRef`) |
| `docs/specs/<id>/forge-spec.yaml` | `materializedAs` fields updated by `spec.materialize` (the only projection mutation this RFC allows) |
| `packages/forge/os/spec/` | `spec.status` + `spec.materialize` handlers (extends RFC-0394 module) |
| `packages/forge/os/rfc/` | `specRef` in types, `rfc.list --spec`, V-SPEC-01..03 in validate rules |
| `docs/rfcs/rfc-0000-template.md` | Gains a commented `specRef:` line |

### Output format

```json
{
  "command": "spec.materialize",
  "status": "pass",
  "spec": "pbp",
  "created": [
    { "node": "RFC-PBP-000", "rfc": "RFC-0412", "file": "docs/rfcs/rfc-0412-....md" }
  ],
  "skipped": [
    { "node": "RFC-PBP-030", "reason": "blocked by RFC-PBP-025 (unimplemented)" }
  ],
  "front": ["RFC-PBP-001", "RFC-PBP-002"]
}
```

`spec.status` returns `SpecStatusResult` (above).

### Failure modes

- `spec.materialize` on a spec with `status: vendored`: exit 1 — `Spec <id> is not accepted. Run /fo-spec-ingest to complete acceptance.`
- `spec.materialize` with `spec.validate` failing: exit 1 — integrity first.
- `--nodes` selecting a blocked node: exit 1 naming the unimplemented prerequisites; no partial creation of the invalid selection.
- `spec.status` with no specs: exit 0, empty list.
- V-SPEC-01..03 violations: `rfc.validate` errors (exit 1), same severity model as existing V-rules.

## Rollout

1. Add `specRef` to RFC frontmatter types, template comment, and V-SPEC-01..03 rules; extend `rfc.list` with `--spec`.
2. Implement `spec.status` (read-only projection) with unit tests over fixture specs.
3. Implement `spec.materialize` (front computation, scaffold via `rfc.create` handler, `materializedAs` write-back) with unit tests.
4. Document the inherited-acceptance rule in `fo-idea-plan/SKILL.md` (step 0.3 extension: check `specRef` → spec status → audit verdict) and in root `AGENTS.md`.
5. Pilot: materialize the first PBP portion (the spec's own recommended first sequence) and run it through the fo pipeline.

RFCs without `specRef` are untouched by every rule here — zero impact on the existing corpus.

## Alternatives considered

- **Bulk generation of the whole roadmap.** Rejected: review debt, stale tails invalidated by early implementation lessons, corpus bloat degrading RFC command performance.
- **Strictly one-at-a-time materialization.** Rejected: loses parallelism of independent graph branches and batch review convenience; the front-portion model keeps freshness without serializing everything.
- **Extended 20-section template for spec RFCs.** Rejected: copying model content creates a second source of truth that diverges at the first amendment; normative references keep the spec authoritative (RFC-0394).
- **Wave-level acceptance ceremony (human accepts each wave).** Rejected: adds a gate with no information — waves are already described in the accepted spec; the audit-verdict valve covers per-RFC anomalies.
- **Fully human per-RFC acceptance (status quo).** Rejected: 43 ceremonies for Wave 1 re-litigate a decision the operator already made at spec acceptance; the reviewer identity is preserved via inheritance.

## Risks

- **Inherited acceptance abuse:** an agent might treat inheritance as blanket permission. Guarded threefold: V-SPEC-03 (no progress past draft under a non-accepted spec), the audit-verdict precondition (only `approved` inherits), and the explicit MUST NOT rules below.
- **Front miscomputation:** a wrong dependency graph would materialize nodes too early. `spec.validate` guarantees graph consistency; blocked-node errors are loud, and materializing slightly late is cheap.
- **Kind inference errors:** `spec.materialize` may guess `kind` wrong. The filling agent confirms kind during the fo pipeline; kind is draft-stage editable.
- **Write-back conflicts:** two concurrent materializations could race on `forge-spec.yaml`. The command re-reads and fails on unexpected `materializedAs` values — last-writer detection, no silent overwrite.

## Acceptance criteria

- [x] `specRef` exists in RFC frontmatter types and the template; V-SPEC-01..03 implemented in `rfc.validate` with unit tests (evidence: tests pass, vitest run exitCode=0)
- [x] `spec.status --json` returns per-node states, blockers, front, and progress for fixture specs (evidence: implemented historically)
- [x] `spec.materialize` creates front-node RFCs with `specRef`, normative source references, resolved `related`, and writes `materializedAs` back; blocked/invalid selections fail loudly (evidence: implemented historically)
- [x] `rfc.list --spec=<id>` filters correctly (evidence: implemented historically)
- [x] `fo-idea-plan/SKILL.md` documents the inherited-acceptance precondition chain (accepted spec → approved audit → transition citing spec reviewers) (evidence: implemented historically)
- [x] Root `AGENTS.md` documents `specRef` and inherited acceptance (evidence: AGENTS.md:1, agent guide updated)
- [x] Existing RFCs (no `specRef`) pass `rfc.validate` unchanged (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MAY transition a materialized RFC `draft → accepted` in `fo-idea-plan` ONLY when ALL hold: its `specRef` resolves to a spec with `status: accepted`; its audit report exists with verdict `approved`; `enhancedAt` is set. Record `reviewers` from the spec's `reviewers` and note `via spec acceptance <spec-id>` in the commit message.
- Agents MUST NOT bulk-materialize past the front or above the `--next` cap — no “while I'm here” generation of future waves.
- Agents filling a materialized RFC MUST NOT copy schemas, field tables, or invariant lists from the spec — reference snapshot sections (and applicable amendments) instead.
- Agents MUST NOT edit `materializedAs`/`forge-spec.yaml` by hand — only `spec.materialize` writes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0396 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
