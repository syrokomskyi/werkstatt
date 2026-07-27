---
id: RFC-0224
title: "Allow agents to stamp RFC implementation status"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-21
updatedAt: 2026-06-21
implementedAt: 2026-06-21
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0268
  - RFC-0330
  - RFC-0335
  - RFC-0476
related:
  - RFC-0220
  - RFC-0223
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted: []
successSignals:
  - "An agent that has fully implemented and verified an `accepted` RFC may set its status to `implemented` and stamp `implementedAt`/`updatedAt` without a separate human edit."
  - "Root `AGENTS.md` and `RFC-0000-template.md` describe the same, single status-transition policy, with the one agent-permitted transition called out explicitly."
  - "All other status transitions (`draft → reviewing`, `reviewing → accepted`, `→ rejected`, `→ superseded`) remain reserved for the `architecture` human role."
nonGoals:
  - "Does not let agents accept, reject, supersede, or otherwise advance an RFC into or out of `accepted`."
  - "Does not let agents flip an RFC to `implemented` before its acceptance criteria are met and verified."
  - "Does not change machine enforcement in `rfc.validate`; the policy stays documentation-governed as today."
---

# RFC-0224: Allow agents to stamp RFC implementation status

## Context

The RFC lifecycle policy (root `AGENTS.md`, "What an agent MUST NOT do" and "Status transitions (humans only)") currently reserves **all** status transitions for humans with the `architecture` role, and the per-RFC boilerplate in `RFC-0000-template.md` repeats `Agents MUST NOT change status fields in any RFC`.

In practice the `accepted → implemented` transition is mechanical bookkeeping, not a judgement call: it records that an already-accepted RFC's acceptance criteria are now met on disk and verified by the build. During the Material Credits work (RFC-0220, RFC-0223) the agent had to ask a human to flip status purely to record completed, verified work, which adds round-trips without adding governance value. The decisions that _do_ carry judgement — whether to accept, reject, or supersede an RFC — stay human.

## Problem

The policy conflates two very different acts:

1. **Direction-setting transitions** (`draft → reviewing`, `reviewing → accepted`, `→ rejected`, `→ superseded`). These commit the project to or away from a design and must stay human.
2. **Completion bookkeeping** (`accepted → implemented`, plus the `implementedAt`/`updatedAt` date stamps). This only records a fact an agent can fully verify: the acceptance criteria are checked and the build is green.

Because the rule blocks both, agents cannot close out their own verified work, and every RFC's agent-notes section carries a blanket prohibition that is stricter than intended.

## Decision

Relax the policy to permit exactly one agent-performed transition: **`accepted → implemented`**, together with stamping `implementedAt` (and refreshing `updatedAt`).

An agent MAY perform this transition only when **all** of the following hold:

- the RFC is currently `accepted`;
- every acceptance-criteria checkbox is satisfied and checked by the agent;
- the relevant validators/build pass (e.g. `rfc.validate`, the app checks the RFC names);
- the implementing change is committed and references the RFC ID.

All other transitions remain reserved for the `architecture` human role. Agents still MUST NOT move an RFC into `accepted`, `reviewing`, `rejected`, or `superseded`, and MUST NOT set `implemented` on an RFC whose criteria are unmet.

This RFC is itself implemented under explicit human direction; from here forward the relaxed rule is the standing policy.

## Architectural fit

- **`AGENTS.md` governance section** is the single source of truth for agent behavior; it is edited to move `accepted → implemented` from "MUST NOT" to a guarded "MAY", and the "Status transitions" diagram annotates that one edge as agent-permitted.
- **`RFC-0000-template.md`** agent-notes boilerplate is updated so newly created RFCs carry the relaxed rule rather than the blanket prohibition.
- **`rfc.validate`** is unchanged: the lifecycle has always been documentation-governed (no machine actor check), and this RFC keeps it that way.

## Rollout

1. Update `AGENTS.md`: add the guarded `accepted → implemented` permission to "What an agent MAY do", narrow the "MUST NOT" item, and annotate the transition diagram.
2. Update `RFC-0000-template.md` agent-notes so the per-RFC boilerplate matches.
3. Existing RFC files keep their own boilerplate text; the governing policy is `AGENTS.md`. Future RFCs inherit the new template text.

## Alternatives considered

- **Keep all transitions human.** Rejected: it forces a human round-trip for pure completion bookkeeping that an agent can verify deterministically.
- **Let agents perform any transition.** Rejected: acceptance, rejection, and supersession are design commitments that must stay human.
- **Enforce the actor in `rfc.validate`.** Rejected for now: the lifecycle has no machine actor identity; documentation governance is the established mechanism and out of scope to change here.

## Risks

- **Premature `implemented`.** An agent could mark an RFC implemented before criteria are truly met. Mitigated by the explicit precondition list (criteria checked + validators/build green + committed) and by the unchanged requirement that acceptance criteria be honest.
- **Policy drift between docs.** `AGENTS.md` and the template could diverge. Mitigated by updating both in this RFC and keeping `AGENTS.md` as the authority.

## Acceptance criteria

- [x] `AGENTS.md` lists `accepted → implemented` (with date stamping) as an agent-permitted action under stated preconditions. (evidence: AGENTS.md:1, agent guide updated)
- [x] `AGENTS.md` "MUST NOT" no longer blanket-prohibits all status changes; it scopes the prohibition to transitions other than `accepted → implemented`. (evidence: AGENTS.md:1, agent guide updated)
- [x] `AGENTS.md` status-transition diagram annotates the `accepted → implemented` edge as agent-permitted. (evidence: AGENTS.md:1, agent guide updated)
- [x] `RFC-0000-template.md` agent-notes boilerplate reflects the relaxed rule. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted` or `implemented`.
- Agents MAY set an `accepted` RFC to `implemented` and stamp `implementedAt`/`updatedAt` once its acceptance criteria are verified and the implementing change is committed. Agents MUST NOT perform any other status transition.
- Agents MUST NOT mark an RFC `implemented` while any acceptance criterion is unmet.
- Agents MUST reference RFC-0224 in commits that change this policy.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)
