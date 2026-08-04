---
id: RFC-0670
title: "Mid-RFC context checkpoint after each plan step in full-pipeline orchestrator"
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
enhancedAt: 2026-08-04
createdAt: 2026-08-04
updatedAt: 2026-08-04
implementedAt: 2026-08-04
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0669
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
versionBump: none
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - "Orchestrator emits a step-level checkpoint after each plan step during implementation of a single RFC with >=5 plan steps"
  - "Step checkpoint contains: step number, step title, commit SHA, key decisions, errors encountered"
  - "Agent releases intermediate step context after checkpoint, retaining only the step checkpoint block"
  - "Resume logic can resume from the last completed step within an RFC, not just from the last completed RFC"
nonGoals:
  - "No checkpoint for RFCs with <5 plan steps — the overhead is not justified for small implementations"
  - "No new commands — this is a skill-text directive, not a Site OS command"
  - "No new DNA invariant — this is operational discipline, not architecture"
  - "No mechanical enforcement — the step checkpoint is an LLM directive, not a validator"
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

# RFC-0670: Mid-RFC context checkpoint after each plan step in full-pipeline orchestrator

## Context

RFC-0669 introduced context checkpoints between batch items (between RFCs) in the full-pipeline orchestrator. However, a single large RFC with many plan steps can itself exhaust the LLM context window. The full pipeline for one RFC runs audit → enhance → plan → implement (which includes review and fix). The implement step alone can have 10+ plan steps, each involving codebase exploration, edits, validation, and commits.

During the RFC-0669 implementation session, the pipeline for a single small RFC (4 plan steps) consumed significant context. For larger RFCs (e.g., RFC-0602 with 20+ steps, RFC-0647 with 15+ steps), the implement phase alone can saturate the context window, causing the agent to lose access to early plan steps, forget design decisions, or confuse validation output across steps.

## Problem

1. **Context saturation within a single RFC.** RFC-0669's checkpoint only fires between RFCs. For a single large RFC, the implement phase accumulates context from every plan step — codebase searches, file reads, edits, validation output, error fixes. By step 8+, the agent may have lost access to step 1-3 context.

2. **No structured resume point within an RFC.** If the session is interrupted during step 7 of 12, the resume logic detects that the RFC is `accepted` and a plan exists, but cannot determine which plan steps are complete. The agent must re-read the plan, inspect git log for `implement:` commits, and guess which steps are done.

3. **Design decisions lost mid-implementation.** Plan steps often involve micro-decisions (e.g., "use flag instead of new command", "skip this validator because it's in a different package"). These decisions are captured in commit messages but not in a structured format the agent can reference later in the same implementation run.

## Decision

The `fo-idea-i-just-want-to-see-the-result` orchestrator skill performs a **step-level context checkpoint** after each plan step during the implement phase of a single RFC, when the plan has >=5 steps. After completing each plan step and committing, the agent emits a structured YAML step-checkpoint block in conversation output and explicitly releases detailed context from the completed step, retaining only the step number, title, commit SHA, key decisions, and errors encountered.

The step checkpoint directive applies only to the implement phase (step 4 of the orchestrator pipeline) because that is where plan steps are executed. Audit, enhance, and plan phases do not have plan steps — they are single-phase skills that produce one artifact each.

## Architectural fit

This RFC is a **policy change** in the skill pipeline, not a new command or architectural invariant.

- **RFC-0669 (context checkpoint between batch items)**: Step checkpoints are the intra-RFC complement to RFC-0669's inter-RFC checkpoints. Together they provide context management at both granularities.
- **`fo-pipeline-conventions.md`**: The step checkpoint directive lives in the shared conventions file, referenced by the orchestrator skill — same pattern as RFC-0669.
- **Resume logic**: The step checkpoint block doubles as a resume marker within an RFC. When resuming an interrupted implementation, the agent scans for the last step checkpoint to determine which plan step to resume from.
- **`fo-idea-implement`**: The implement skill already commits after each plan step. The step checkpoint is emitted after the commit, not instead of it.

## Design

### Skill text changes

The orchestrator skill's Process section (step 4 — Implement) gains a step-level checkpoint directive. The shared conventions file gains a new section referenced by the orchestrator.

#### Step checkpoint directive (added to `fo-pipeline-conventions.md`)

```markdown
## Step-level context checkpoint during implementation

When the orchestrator skill implements a single RFC with >=5 plan steps,
perform a step checkpoint after completing each plan step and committing:

1. **Emit step-checkpoint block** — output a YAML-formatted block in conversation
   output with the following fields:
   - `rfc`: RFC id being implemented
   - `step`: plan step number (e.g., 3)
   - `title`: plan step title
   - `commit`: SHA of the commit produced by this step
   - `decisions`: 1-3 short freeform sentences capturing key micro-decisions
     made during this step (e.g., "used flag instead of new command",
     "skipped validator X because it's in package Y, not in scope")
   - `errors`: list of errors encountered and fixed during this step — empty
     if none
   - `nextStep`: number of the next plan step, or `null` if this was the last
2. **Release step context** — treat all detailed context from the completed
   step as no longer actionable: codebase search results, file reads, edit
   operations, validation output. Retain only the step-checkpoint block and
   the RFC's plan file.
3. **Fresh start** — begin the next plan step with a fresh read of the plan
   file and the specific files the next step touches.

The step checkpoint doubles as a resume marker: when resuming an interrupted
implementation, scan conversation output for the last step-checkpoint block,
extract the completed step number, and resume from the next step.

**Only applies to plans with >=5 steps.** Small plans (4 or fewer steps) do
not need step checkpoints — the context is manageable without them.
```

#### Orchestrator skill reference (added to `fo-idea-i-just-want-to-see-the-result/SKILL.md`)

In the Process section, step 4 (Implement), after the existing text about `fo-idea-implement`, add:

```markdown
**Step-level checkpoints:** When implementing an RFC with >=5 plan steps,
perform a step checkpoint after each plan step per
`_shared/fo-pipeline-conventions.md` §Step-level context checkpoint during
implementation. Emit the step-checkpoint block, release completed-step
context, and start the next step with a fresh plan read.
```

### Step-checkpoint block format

```yaml
--- step checkpoint ---
rfc: RFC-0670
step: 3
title: Add checkpoint directive to fo-pipeline-conventions.md
commit: abc1234
decisions:
  - "Placed directive after §Context checkpoint between batch items for logical grouping"
  - "Used >=5 steps threshold instead of >=3 to avoid overhead on small RFCs"
errors: []
nextStep: 4
--- end step checkpoint ---
```

### Resume behavior

When resuming an interrupted implementation:

1. **Scan for step checkpoints** — search conversation output for `--- step checkpoint ---` markers. If found, extract `step` and `commit` from the last block.
2. **Verify via git log** — check that the commit SHA in the last step checkpoint exists in git log and matches an `implement:` commit.
3. **Resume from nextStep** — read the plan file, skip to the step indicated by `nextStep`, and continue implementation.
4. **No step checkpoints** — if no step checkpoint markers are found, fall back to the existing resume logic: inspect git log for `implement:` commits and match them against plan steps.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/_shared/fo-pipeline-conventions.md` | New §Step-level context checkpoint section added |
| `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` | Step 4 references step checkpoint convention |
| `.agents/skills/_shared/fo-pipeline-conventions.md` | Synced copy updated in same commit |
| `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md` | Synced copy updated in same commit |
| `packages/forge/AGENTS.md` | No change needed — documents skill infrastructure, not individual skill behavior |

### Failure modes

- **Step checkpoint not emitted**: if the agent skips the step checkpoint, the next step may suffer from context accumulation. This is a skill discipline issue — enforcement is through `fo-review`.
- **Step checkpoint with wrong step number**: if the checkpoint reports step 5 but the plan only has 4 steps, the resume logic detects the mismatch and falls back to git log inspection.
- **Decisions too verbose**: if the agent writes more than 3 sentences in `decisions`, the checkpoint loses compactness. The directive specifies 1-3 short freeform sentences.

## Rollout

- **Default behavior**: the step checkpoint directive is active immediately upon RFC acceptance. Any orchestrator invocation implementing an RFC with >=5 plan steps must emit step checkpoints.
- **Existing apps**: no app-level changes — skill-level directive only.
- **Sync**: `packages/forge/skills/` source and `.agents/skills/` synced copies must be updated in the same commit.
- **No deprecation**: this RFC adds a new directive; it does not supersede or deprecate RFC-0669. The two checkpoint mechanisms are complementary — RFC-0669 for inter-RFC, RFC-0670 for intra-RFC.

## Alternatives considered

### Automatic fo-handoff between plan steps

After each plan step, invoke `fo-handoff` to create a handoff document, then continue as if picked up by a fresh agent.

**Rejected**: same rationale as RFC-0669 — `fo-handoff` is designed for cross-session continuity, not intra-session context management. The I/O overhead of writing and reading handoff documents for every plan step would be prohibitive.

### Sub-RFC splitting

Split large RFCs into smaller RFCs so each has fewer plan steps.

**Rejected**: some RFCs are inherently large (e.g., timestamp determinism across 20+ modules). Splitting them would create artificial boundaries and cross-RFC dependencies that are harder to manage than step-level checkpoints. The RFC granularity should match the decision granularity, not the context management concern.

## Risks

- **Checkpoint overhead for medium RFCs**: a 5-step RFC now gets 5 step checkpoints, adding ~5 YAML blocks to conversation output. This is acceptable — each block is ~10 lines.
- **Agent confusion between step and batch checkpoints**: the agent may confuse `--- checkpoint ---` (RFC-0669, between RFCs) with `--- step checkpoint ---` (RFC-0670, within an RFC). The different marker names mitigate this.
- **No mechanical enforcement**: same as RFC-0669 — the step checkpoint is an LLM directive, not a validator.
- **False resume confidence**: if the step checkpoint says step 5 is done but the commit SHA doesn't exist in git log (e.g., commit was amended), the resume logic may skip re-processing. Git log verification mitigates this.

## Acceptance criteria

- [x] `packages/forge/skills/_shared/fo-pipeline-conventions.md` contains a new §Step-level context checkpoint during implementation section (evidence: packages/forge/skills/_shared/fo-pipeline-conventions.md:139)
- [x] `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` step 4 references the step checkpoint convention (evidence: packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md:89)
- [x] `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md` synced copy updated in same commit (evidence: commit 4623da5, .agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md:89)
- [x] `.agents/skills/_shared/fo-pipeline-conventions.md` synced copy updated in same commit (evidence: commit 4623da5, .agents/skills/_shared/fo-pipeline-conventions.md:139)
- [x] Step-checkpoint block format documented with YAML example (rfc, step, title, commit, decisions, errors, nextStep) (evidence: docs/rfcs/rfc-0670-mid-rfc-context-checkpoint-after-each-plan-step-in-full-pipeline-orchestrator.md:161-172)
- [x] Resume logic documented: scan for `--- step checkpoint ---` markers, verify via git log (evidence: docs/rfcs/rfc-0670-mid-rfc-context-checkpoint-after-each-plan-step-in-full-pipeline-orchestrator.md:177-182)
- [x] `forge.doctor` passes with zero stale skill copies after sync (evidence: forge.doctor output — 0 fail, 2 warn, exitCode: 0)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0670 — status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement skill text changes ONLY when this RFC has status: accepted.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Implementation is skill-text-only: edit `fo-pipeline-conventions.md` and `fo-idea-i-just-want-to-see-the-result/SKILL.md`, then sync to `.agents/skills/`.
- After editing skills, run `forge.doctor` to verify synced copies are not stale.
- Agents MUST NOT weaken or remove the step checkpoint directive without a new RFC that supersedes it.
- The step checkpoint directive applies ONLY to `fo-idea-i-just-want-to-see-the-result` implement phase with >=5 plan steps.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
