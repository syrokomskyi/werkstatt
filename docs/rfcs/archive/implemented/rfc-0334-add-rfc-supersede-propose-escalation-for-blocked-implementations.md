---
id: RFC-0334
title: "Add rfc.supersede.propose escalation for blocked implementations"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii
createdAt: 2026-07-06
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0224
  - RFC-0329
  - RFC-0278
commands:
  proposed: []
  added:
    - rfc.supersede.propose
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
satisfies:
  - DNA-35
successSignals:
  - "An agent that cannot implement an accepted RFC without violating a DNA invariant or an implemented RFC has a one-command escalation path that produces a structured consultation draft for the human — instead of a silent workaround in code."
  - "`rfc.supersede.propose --id RFC-XXXX --reason ... --invariant DNA-N` validates the referenced DNA/RFC ids, creates a new draft RFC with supersedes pre-linked, the conflict quoted, and clearly marked TODO sections for the proposed alternative."
  - "AGENTS.md makes escalation mandatory: discovering an invariant conflict during implementation halts the implementation until a human decides."
nonGoals:
  - "The command does NOT modify the blocked RFC — supersededBy is only ever set when a human accepts the replacement (existing governance, RFC-0224); proposal is not supersession."
  - "No automatic conflict detection — the agent's judgment triggers escalation; this RFC gives that judgment a formal, cheap channel."
  - "No notification/inbox machinery — the draft file plus the console escalation banner is the v1 signal; fleet-level surfacing (Leitstand, RFC-0284 family) is out of scope."
acceptance:
  - probe: command-registered
    name: "rfc.supersede.propose"
  - probe: file-exists
    path: "packages/os/site-kernel/src/rfc/handlers/supersede-propose.ts"
  - probe: file-contains
    path: "AGENTS.md"
    pattern: "rfc.supersede.propose"
  - probe: run
    command: "site-kernel run rfc.validate"
    expect:
      exitCode: 0
---

# RFC-0334: Add rfc.supersede.propose escalation for blocked implementations

## Context

The RFC governance model gives agents implementation authority (accepted → implemented, RFC-0224) but reserves decisions for humans. That split has one under-specified seam: **what does an agent do when, mid-implementation, it discovers the accepted specification cannot be realized without breaking something more fundamental** — a DNA invariant, an implemented RFC's contract, a technical impossibility the acceptance review missed?

Today the honest options are all informal: abandon the task with a prose note, leave a TODO, or — the dangerous default under task pressure — implement a workaround that technically satisfies the RFC while quietly violating the invariant. The 2026-07 expert review (Gemini's SASE analysis in particular) identified this "silent hack" channel as a primary architecture-degradation vector precisely at higher autonomy levels: as human review shrinks (RFC-0285 trajectory), a hack merged today is an invariant lost silently.

The supersession vocabulary already exists (`supersedes`/`supersededBy`, validated referentially), and `rfc.create` (RFC-0329-extended) is the scaffolding funnel. What is missing is the escalation ritual: a single command that converts "I am blocked by a conflict" into a reviewable, structured artifact — and a policy making that ritual mandatory.

## Problem

The unprotected invariant is: **an agent blocked by an invariant conflict must escalate to a human decision through a structured channel, and must not work around the conflict.**

Today:

1. No command exists for the escalation; the path of least resistance is the workaround.
2. When agents do stop and write prose, the conflict report has no canonical shape — humans get inconsistent, hard-to-compare consultation requests.
3. Nothing links the blocked RFC, the violated invariant, and the proposed alternative in machine-readable form, so the decision (and its eventual rejection or acceptance) is invisible to the decision log (RFC-0329).

## Decision

The kernel gains `rfc.supersede.propose` (workspace scope, `mutatesState: true`), and AGENTS.md gains a mandatory escalation policy.

1. **Command semantics.** `rfc.supersede.propose --id RFC-XXXX --reason "<why the accepted design is unimplementable>" --invariant "DNA-N[,DNA-M|RFC-YYYY]" [--title "<replacement title>"]`:
   1. Validates the target: must exist and have `status: accepted` or `implemented`; anything else → error (`draft`/`reviewing` need no supersession — comment on them; `rejected`/`superseded` are already closed).
   2. Validates `--invariant`: comma-separated ids each matching `^(DNA-\d+|RFC-\d{4})$`, then verifies that every `DNA-*` exists in `docs/architecture-dna.md` and every `RFC-*` exists in `docs/rfcs/`.
   3. Scaffolds a **new draft RFC** through the same machinery as `rfc.create` (next free number, full template, RFC-0329 decision-log consultation runs as part of it), with:
      - title: `--title` if given, else `Supersede RFC-XXXX: <target title>`;
      - frontmatter `supersedes: [RFC-XXXX]`, `related:` seeded with the `--invariant` ids;
      - the `## Context` section pre-filled with a generated consultation block (see Output format) containing the reason, the violated invariant ids, the target's title/status/file, and explicit `TODO(agent)` markers for the proposed alternative design;
      - the `## Decision` section pre-filled with `TODO(agent): describe the replacement decision that resolves the conflict without violating <ids>.` While the new RFC remains `draft`, its `supersedes` field is a proposal intent only. Consumers MUST NOT treat the target as actively superseded until a human accepts the replacement and updates the target per existing governance.
   4. Prints the escalation banner (pretty mode): `ESCALATION: human decision required — RFC-XXXX conflicts with <ids>. Draft created: <file>. Implementation of RFC-XXXX is halted until a human accepts, rejects, or clarifies.`
   5. Does NOT touch the target RFC file in any way.

2. **AGENTS.md policy** (new paragraph in the RFC-workflow section): _"When an agent determines during implementation that an accepted RFC cannot be realized without violating a DNA invariant, an implemented RFC's contract, or a technical constraint the acceptance missed, the agent MUST stop implementing, run `rfc.supersede.propose` with the conflict stated, complete the TODO sections of the generated draft with its proposed alternative, and report the escalation. Working around the conflict in code — however locally reasonable — is prohibited. Implementation resumes only after a human decision on the proposal (acceptance, rejection with clarification, or amendment of the blocked RFC)."_

3. **Template awareness.** The template's Implementation-notes boilerplate gains one line pointing at the escalation path, so every future RFC carries the instruction where implementing agents actually read.

## Architectural fit

- **RFC-0224**: composes cleanly — 0224 governs status transitions (humans decide, agents implement); this RFC gives the agent a formal artifact _requesting_ a decision without making one. The target's status is untouched by the proposal.
- **RFC-0329 (decision log)**: closing the loop — if the human rejects the proposal, the rejected draft (with its structured conflict statement) enters the decision log, so the next agent blocked the same way finds the precedent at `rfc.create` time.
- **RFC-0278 / RFC-0285 (autonomy)**: escalation-instead-of-hack is the cultural invariant that makes higher autonomy levels safe — the shrinking human budget is spent exactly at conflict points, which is where it belongs.
- **Site OS operator model**: one new command in the `rfc.*` family, registered in `rfc.module.ts`, flags declared for `kernel-flags-lint`.

## Design

### CLI surface

```sh
pnpm exec werkstatt run rfc.supersede.propose --id RFC-0322 \
  --reason "Live slot counter requires client-side state that violates the static-output contract" \
  --invariant "DNA-16,RFC-0307"
pnpm exec werkstatt run rfc.supersede.propose --id RFC-0322 --reason "..." --invariant "DNA-16" --title "Replace live slot counter with build-time capacity waves" --json
```

Flags: `id` (string, required), `reason` (string, required), `invariant` (string, required — comma-separated), `title` (string, optional).

### TypeScript contracts

```ts
// packages/os/site-kernel/src/rfc/handlers/supersede-propose.ts

export interface RfcSupersedeProposeResult {
  command: "rfc.supersede.propose";
  status: "ok";
  /** The newly created draft. */
  file: string;
  id: string;               // "RFC-0341"
  supersedesTarget: string; // "RFC-0322"
  invariants: string[];     // ["DNA-16", "RFC-0307"]
  consultedDecisions: ConsultedDecision[]; // from the RFC-0329 consultation step
}
```

Internally the handler MUST reuse the scaffolding core of `runRfcCreate` (extract a shared `scaffoldRfc(options)` helper from `handlers/list-create.ts` rather than duplicating id-allocation/template logic), then apply the frontmatter seeds and section pre-fills as string edits on the fresh scaffold — the same replacement technique `runRfcCreate` already uses.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/rfc/handlers/supersede-propose.ts` | New: validation, scaffold reuse, section pre-fill, banner |
| `packages/os/site-kernel/src/rfc/handlers/list-create.ts` | `scaffoldRfc` helper extracted (behavior of `rfc.create` unchanged, including atomic docs write behavior) |
| `packages/os/site-kernel/src/rfc/types.ts` | Result type |
| `packages/os/site-kernel/src/rfc/rfc.module.ts` | Register `rfc.supersede.propose` |
| `packages/os/site-kernel-checks/src/workspace-write-boundary.ts` | Ensure any newly introduced docs write path remains allowlisted and atomic |
| `docs/rfcs/rfc-0000-template.md` | One boilerplate line in Implementation notes referencing the escalation path |
| `AGENTS.md` | Mandatory-escalation policy paragraph |
| `packages/os/site-kernel/src/tests/supersede-propose.test.ts` | New: target-status validation, invariant format, scaffold content assertions, target untouched |

### Output format

Generated `## Context` consultation block (inside the new draft):

```markdown
## Context

> **Consultation request (generated by rfc.supersede.propose, 2026-07-06)**
>
> - **Blocked RFC:** RFC-0322 — "Publish offer capacity waves and live slot counter" (status: accepted, docs/rfcs/rfc-0322-....md)
> - **Violated invariant(s):** DNA-16, RFC-0307
> - **Reason:** Live slot counter requires client-side state that violates the static-output contract
> - **Requested decision:** accept this replacement, reject it with clarification, or amend RFC-0322.

TODO(agent): expand — what was attempted, where exactly the conflict surfaces (file paths, contract clauses), and why no conforming implementation exists.
```

JSON mode returns `RfcSupersedeProposeResult`. Pretty mode prints the escalation banner (Decision 1.4) after the standard created-file lines.

### Failure modes

- Target not found → error naming the id and suggesting `rfc.list`.
- Target status `draft`/`reviewing` → error: "target is not decided yet — record the concern in review, not via supersession".
- Target status `rejected`/`superseded` → error: "target is already closed".
- Malformed `--invariant` entry → error with the offending token.
- Unknown `DNA-*` or `RFC-*` reference in `--invariant` → error naming the missing id. Escalation reports must point to real contracts, not placeholders.
- Decision-log consultation failure degrades gracefully (same guarantee as RFC-0329): scaffolding proceeds, `consultedDecisions: []`.
- The command never edits the target file — asserted by test (byte-identical before/after).

## Rollout

1. Extract `scaffoldRfc`, implement the handler + tests, register the command.
2. Add the AGENTS.md policy and the template boilerplate line.
3. Regenerate the command manifest.
4. No pipeline wiring — this is an agent-invoked escalation tool.
5. Depends on RFC-0329 only softly: if 0329 is not yet implemented, the consultation step is absent and `consultedDecisions` is always empty; implement the field anyway so the shape is stable.

## Alternatives considered

- **Free-form escalation (agent just writes a note / asks in chat)**: rejected — it is the status quo; unstructured escalations are inconsistent, unsearchable, and invisible to the decision log.
- **A separate consultation-file format (not an RFC draft)**: rejected — a new artifact type needs its own lifecycle, validation, and storage; a pre-linked draft RFC reuses the entire existing governance machine, and the human's decision lands exactly where decisions live.
- **Letting the command set `supersededBy` on the target immediately**: rejected — that is a decision, and decisions are human (RFC-0224). Proposal ≠ supersession.
- **Automatic conflict detection (static analysis of invariant violations)**: rejected for v1 — DNA invariants are prose+validator hybrids; detection is the validators' job, judgment is the agent's, and the escalation channel must exist regardless of how the conflict was found.
- **Amend-oriented variant (`rfc.amend.propose`)**: deferred — amendment proposals are a milder flavor of the same ritual; if practice shows demand, extend this command with `--mode amend` in a follow-up rather than shipping two commands now.

## Risks

- **Escalation spam** (agents escalating trivial friction instead of solving it): bounded by the required `--reason`/`--invariant` structure — naming a specific invariant forces a specific claim a human can quickly refute; repeated frivolous escalations are visible and correctable via AGENTS.md tuning.
- **Unfinished TODO sections** (agent files the proposal but never completes the alternative design): the draft fails review in that state, which is acceptable — the escalation signal (banner + draft existence) already fired; the human sees an honest "blocked, here is why" even without a polished alternative.
- **Policy circumvention** (agent hacks anyway): no command can prevent that; the policy plus the eventual validator/QA contours (RFC-0333) make hacks detectable, and the cheap escalation path removes the main excuse for them.

## Acceptance criteria

- [x] `rfc.supersede.propose` registered with `id`/`reason`/`invariant`/`title` flags; `kernel-flags-lint` passes. (evidence: implemented historically)
- [x] `scaffoldRfc` extracted; `rfc.create` behavior verified unchanged by existing tests. (evidence: implemented historically)
- [x] Created draft asserts: correct next id; `supersedes: [target]`; `related:` seeded with invariant ids; consultation block with all four bullet lines; TODO markers present in Context and Decision. (evidence: implemented historically)
- [x] Target file byte-identical before/after (test). (evidence: implemented historically)
- [x] Status-validation matrix tested: accepted/implemented → ok; draft, reviewing, rejected, superseded, nonexistent → specific errors. (evidence: implemented historically)
- [x] Invariant validation tested (valid existing DNA-N, valid existing RFC-XXXX, malformed token rejected, nonexistent DNA/RFC rejected). (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] AGENTS.md policy paragraph and template boilerplate line present. (evidence: AGENTS.md:1, agent guide updated)
- [x] `command.manifest.generate` regenerated; `rfc.validate` passes on this file and on a proposal draft produced by the command in a test fixture. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Extract `scaffoldRfc` by refactoring, not duplication — `rfc.create` and this command MUST share id allocation and template handling, or ids will eventually collide.
- Preserve the shared scaffold's atomic docs write behavior. If extraction reveals `rfc.create` is not using `writeFileAtomic` for `docs/rfcs/*.md`, migrate both commands before landing this RFC.
- The generated consultation block is inserted by replacing the template's `## Context` comment block; keep the replacement anchored to the exact template markers so template edits fail loudly in tests rather than silently misplacing the block.
- Never write to the target RFC. If you find a reason to, that reason is a design change — escalate it (yes, recursively, via this very command once implemented).
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions (with RFC-0330 evidence if implemented); reference `rfc-0334` in commits.
- Agents MUST NOT weaken the mandatory-escalation policy in AGENTS.md without a superseding RFC.
