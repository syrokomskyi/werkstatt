---
id: RFC-0335
title: "Require reviewer identity on newly decided RFCs"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
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
amends:
  - RFC-0224
amendedBy: []
related:
  - RFC-0278
  - RFC-0279
  - RFC-0330
  - RFC-0331
commands:
  proposed: []
  added: []
  changed:
    - rfc.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
satisfies:
  - DNA-35
successSignals:
  - "Every RFC created on or after 2026-07-07 that reaches a decided status (accepted, implemented, rejected, superseded) carries at least one typed reviewer identity — 'who decided' is a one-field read, not a git-archaeology exercise."
  - "AGENTS.md requires reviewer identity for every human RFC decision made after 2026-07-07, including pre-cutoff drafts that are decided later; V-25 is the machine-enforced floor, not the whole governance rule."
  - "rfc.validate (V-25) rejects post-cutoff decided RFCs with empty reviewers, malformed identities, or (until separately authorized) agent: identities."
  - "Historical RFCs are untouched: no fabricated retroactive reviewer data exists anywhere in the corpus."
nonGoals:
  - "No backfill of reviewers onto pre-cutoff RFCs — retroactively stamping approvals that were never recorded would fabricate audit data (founder decision, 2026-07-06)."
  - "No AI reviewer authority for RFC governance in this RFC — the agent: identity format is reserved and validated as an error until a future RFC explicitly grants an AI reviewer (in the spirit of RFC-0279) authority over RFC decisions."
  - "No review-workflow tooling (assignment, reminders, sign-off UI) — this RFC types the recorded outcome, not the process."
  - "No change to who may transition statuses — RFC-0224's split (humans decide, agents implement) stands; this RFC only makes the deciding human's identity mandatory in the record."
acceptance:
  - probe: file-contains
    path: "packages/os/site-kernel/src/rfc/handlers/validate-rules.ts"
    pattern: "V-25"
  - probe: file-contains
    path: "docs/rfcs/rfc-0000-template.md"
    pattern: "human:<handle>"
  - probe: run
    command: "site-kernel run rfc.validate"
    expect:
      exitCode: 0
---

# RFC-0335: Require reviewer identity on newly decided RFCs

## Context

The frontmatter schema has carried a `reviewers?: string[]` field since the template's inception — and it is empty in all 316 RFCs, including every accepted and implemented one. The de-facto convention (single founder reviewing everything) made the field feel redundant; the record therefore says nothing about who exercised decision authority, when the corpus already spans two years of decisions.

Two pressures end that tolerance. First, scale: at hundreds of decided RFCs per year, "who accepted RFC-0242 and under what authority" becomes a real audit question — the 2026-07 expert review (QWen's HITL analysis) placed decision attribution among the non-negotiable elements of a trustworthy human-in-the-loop protocol. Second, the autonomy trajectory: RFC-0278 introduced typed approver identities (`human:` / `agent:`, `packages/surface/src/governance.ts`) for the PSEO lifecycle, and RFC-0279 added a governed AI reviewer — the moment an AI reviewer is considered for RFC governance itself, the record of _who_ decided must already be structured, or the transition will be unauditable.

The founder decided (2026-07-06): forward-only. New decisions carry identity; history is not rewritten.

## Problem

The unprotected invariant is: **every decided RFC must record the identity that exercised decision authority.**

Today:

1. `reviewers` is schema-sanctioned but semantically empty — nothing requires it, no format is defined, nothing validates it.
2. Decision attribution lives only in git blame on the status line — fragile (rebases, bulk edits, agent commits performing human-instructed transitions) and unreadable to tooling.
3. There is no typed distinction between a human decision and a (future) agent decision, although the ecosystem already has exactly that vocabulary one layer down (RFC-0278's `Approver`).

## Decision

`reviewers` becomes a mandatory, typed field on newly created, decided RFCs, enforced by `rfc.validate` rule **V-25**.

1. **Identity format.** Each `reviewers` entry MUST match `^(human|agent):[a-z0-9][a-z0-9-]*$` — aligned with the `Approver` identity convention of RFC-0278 (`packages/surface/src/governance.ts`; reuse its serialization helper if one is exported, otherwise mirror the format and reference it in a comment). The founder's identity is `human:andrii`.

2. **Rule V-25 in `rfc.validate`** (`handlers/validate.ts`), using `RFC_METADATA_CUTOFF` (`"2026-07-07"`, shared with V-23/V-24 — RFC-0330/0331; whichever RFC lands first exports it from `rfc/types.ts`):
   - **Presence (post-cutoff only):** RFCs with `createdAt >= RFC_METADATA_CUTOFF` and `status` in {`accepted`, `implemented`, `rejected`, `superseded`} MUST have a non-empty `reviewers` — **error** otherwise. All four decided statuses are covered: a rejection is as much a decision as an acceptance. `draft`/`reviewing` RFCs: `reviewers` stays optional (empty is the normal pre-decision state).
   - **Format (all RFCs, any age):** when `reviewers` is non-empty, every entry must match the identity regex — **error** on malformed entries.
   - **Authority (all RFCs, any age):** an `agent:` entry is an **error** with the message _"agent reviewer identities are reserved until an RFC grants AI reviewer authority over RFC governance (see RFC-0279 for the pattern)"_. When that future RFC lands, it downgrades this clause — not silently, but by amending this rule.
   - Pre-cutoff RFCs with empty `reviewers`: V-25 never fires (the entire current corpus).

3. **Recording protocol** (AGENTS.md, RFC-workflow section): _"For every RFC decision made on or after 2026-07-07 (acceptance, rejection, or supersession), the deciding human records their identity in `reviewers` in the same edit that changes `status` — even when the RFC file itself was created before the cutoff. They may edit directly or explicitly instruct an agent to stamp a named identity. Agents MUST NOT populate `reviewers` on their own authority under any circumstances; `rfc.create` and templates MUST leave `reviewers: []` on drafts. When performing the `accepted → implemented` transition (RFC-0224), agents carry the existing `reviewers` value forward unchanged — the acceptance reviewer covers the implementation transition, no new entry is added."_

4. **Template update.** Both templates document the field:

   ```yaml
   # Set by the deciding human together with the status change (RFC-0335).
   # Draft scaffolds must keep this empty; do not prefill a default identity.
   # Format: human:<handle> (agent:<id> reserved — see RFC-0335).
   reviewers: []
   ```

## Architectural fit

- **RFC-0224**: amended narrowly — the transition rules stand; the decided record now must carry identity. The agent self-transition (`accepted → implemented`) needs no new reviewer entry because the decision being recorded is the acceptance, which already has one. For pre-cutoff drafts decided after 2026-07-07, the AGENTS.md rule is stricter than V-25 because the validator has no reliable status-transition timestamp.
- **RFC-0278**: vocabulary reuse — one identity format across PSEO approvals and RFC decisions means a future unified authority model (who may approve what, at which autonomy level) has a single grammar to reason over.
- **RFC-0279**: the explicit bridge-not-yet-built — the AI reviewer exists for content; granting it RFC-governance authority is a deliberate future decision, and V-25's authority clause makes the current boundary machine-enforced instead of implicit.
- **RFC-0330/0331**: third leg of the post-cutoff metadata triad — post-cutoff decided RFCs carry _who decided_ (V-25), _what invariant it serves_ (V-24), and _proof it works_ (V-23), all forward-only on the same cutoff constant.

## Design

### CLI surface

No new commands. The change is a validation rule plus conventions:

```sh
pnpm exec werkstatt run rfc.validate          # now includes V-25
pnpm exec werkstatt run rfc.validate --json
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/rfc/handlers/validate.ts (additions)

const REVIEWER_IDENTITY_PATTERN = /^(human|agent):[a-z0-9][a-z0-9-]*$/;
const DECIDED_STATUSES: readonly RfcStatus[] = [
  "accepted",
  "implemented",
  "rejected",
  "superseded",
];
// V-25 uses RFC_METADATA_CUTOFF from rfc/types.ts (RFC-0330/0331).
```

No `RfcFrontmatter` change — `reviewers?: string[]` already exists; this RFC gives it semantics.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/rfc/handlers/validate.ts` | Rule V-25 (presence, format, authority clauses) |
| `packages/os/site-kernel/src/rfc/types.ts` | `RFC_METADATA_CUTOFF` if neither RFC-0330 nor RFC-0331 has landed yet |
| `docs/rfcs/rfc-0000-template.md` | Documented `reviewers` comment block |
| `AGENTS.md` | Recording-protocol paragraph |
| `packages/os/site-kernel/src/tests/rfc-validate.test.ts` (or the dedicated V-25 test file) | Full firing matrix |

### Output format

V-25 violations surface through the existing `rfc.validate` result shape (`RfcValidationViolation`), e.g.:

```json
{
  "rfcId": "RFC-0340",
  "file": "docs/rfcs/rfc-0340-....md",
  "rule": "V-25",
  "message": "accepted RFC created 2026-07-10 has empty reviewers — the deciding human must record their identity (RFC-0335).",
  "severity": "error"
}
```

### Failure modes

Firing matrix (the test contract):

| createdAt | status | reviewers | V-25 |
| --- | --- | --- | --- |
| pre-cutoff | any | `[]` | silent |
| pre-cutoff | implemented | `["human:andrii"]` | silent (valid format) |
| pre-cutoff | any | `["andrii"]` | error (format, any age) |
| post-cutoff | draft / reviewing | `[]` | silent |
| post-cutoff | accepted / implemented / rejected / superseded | `[]` | error (presence) |
| post-cutoff | accepted | `["human:andrii"]` | silent |
| any | any | `["agent:reviewer-1"]` | error (authority reserved) |
| any | any | `["Human:Andrii"]` | error (format — lowercase enforced) |

## Rollout

1. Implement V-25 + tests. Zero existing RFCs fail: the corpus is entirely pre-cutoff with empty reviewers, and the format/authority clauses only inspect non-empty values (none exist).
2. Update templates and AGENTS.md.
3. Dogfood: when the founder decides this very batch (0329–0335), each decided RFC gets `reviewers: ["human:andrii"]` stamped with the status change. These RFCs are pre-cutoff (created 2026-07-06), so V-25 does not require the stamp — but the AGENTS.md recording protocol does once the decision happens after 2026-07-07, and it gives V-25's format clause its first live data.
4. Future: an RFC granting a governed AI reviewer authority over some class of RFC decisions amends the authority clause — the reserved `agent:` grammar means that RFC changes one validation branch, not the data model.

## Alternatives considered

- **Backfilling `reviewers: ["human:andrii"]` onto all decided historical RFCs**: rejected by founder decision (2026-07-06) — it would be a bulk fabrication of records that were never made; an audit trail that begins with fabricated entries is worse than one that begins late.
- **A separate `rfc.review.validate` command** (per the original expert proposal): rejected — one more command for one rule; `rfc.validate` is the established home for frontmatter integrity, and V-25 is frontmatter integrity.
- **Richer review records (`reviewedAt`, `reviewNotes`) now**: rejected for v1 — `updatedAt` plus git history already dates the decision; notes belong in review conversation. Identity is the one field that cannot be reconstructed later, so it is the one field mandated.
- **Free-form reviewer strings (no typed prefix)**: rejected — the `human:`/`agent:` grammar is already established by RFC-0278; a second, untyped convention for the same concept one layer up would guarantee eventual divergence.
- **Allowing `agent:` entries immediately** (trusting RFC-0279's reviewer): rejected — RFC-0279's reviewer is scoped to content approval; extending its authority to architecture governance is a founder-level decision that deserves its own RFC, not a side effect of a validation rule.

## Risks

- **Ritual stamping** (identity added mechanically without real review): no validation rule can verify attention; the rule guarantees attribution, and attribution itself changes behavior — a named decision is owned differently than an anonymous one.
- **Cutoff-edge confusion** (RFCs created 2026-07-06 decided later): V-25 cannot infer decision time from static frontmatter, so machine enforcement remains `createdAt`-based. The AGENTS.md recording protocol closes the governance gap for future human decisions; a later `decidedAt` field could make that fully machine-enforceable if needed.
- **Handle drift** (`human:andrii` vs future handles): handles are not centrally registered in v1; if multiple humans join, a registry (possibly reusing RFC-0278's approver infrastructure) becomes a follow-up. Accepted as premature to solve for a single-founder present.

## Acceptance criteria

- [x] V-25 implemented with all three clauses (presence post-cutoff on decided statuses; format anywhere; agent: reserved anywhere). (evidence: implemented historically)
- [x] The full firing matrix above is covered by tests, one case each. (evidence: implemented historically)
- [x] `rfc.validate` passes on the entire existing corpus after introduction (proves zero flag-day breakage). (evidence: implemented historically)
- [x] The RFC template carries the documented `reviewers` comment block. (evidence: implemented historically)
- [x] AGENTS.md recording-protocol paragraph present, including the carry-forward rule for the `accepted → implemented` transition and the rule that post-cutoff human decisions on pre-cutoff drafts still record reviewers. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.create` / templates keep `reviewers: []` on drafts; no default human identity is prefilled. (evidence: implemented historically)
- [x] `RFC_METADATA_CUTOFF` shared, not duplicated, across V-23/V-24/V-25 (single export). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT populate `reviewers` on their own authority — not on this RFC, not on any other. If a human instructs "accept this and stamp me", the agent writes the human's stated identity; absent such instruction, the field stays as-is and the human edits it.
- Do not "helpfully" default draft reviewers to `human:andrii` in templates or `rfc.create`. Reviewer identity is a decision record, not scaffold metadata.
- When implementing V-25, check whether `RFC_METADATA_CUTOFF` already exists (RFC-0330/0331 may have landed first); never define it twice.
- Check `packages/surface/src/governance.ts` for an exported identity-format helper before writing the regex; if you mirror it instead, leave a comment linking both sites so they cannot drift silently.
- The carry-forward rule matters: when transitioning any RFC `accepted → implemented` per RFC-0224, do not add, remove, or reorder `reviewers` entries.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions (with RFC-0330 evidence if implemented); reference `rfc-0335` in commits.
- Agents MUST NOT weaken V-25 or extend `agent:` authority without a superseding/amending RFC.
