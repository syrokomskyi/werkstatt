---
id: RFC-0669
title: "Context checkpoint between batch items in full-pipeline orchestrator"
status: draft
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
reviewers: []
createdAt: 2026-08-04
updatedAt: 2026-08-04
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0537
  - RFC-0581
  - RFC-0664
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
versionBump: patch
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
  - "fo-idea-i-just-want-to-see-the-result SKILL.md contains context checkpoint directive for batch processing"
  - "Checkpoint YAML block emitted between batch items in conversation output"
  - "Checkpoint block includes completed RFC id, status, commit SHAs, lessons learned, and next item"
nonGoals:
  - "Mechanical context window clearing (LLM context is platform-level, not skill-level)"
  - "Checkpoint for single-RFC invocations (only batch with >=2 documents)"
  - "Checkpoint in standalone batch skills (fo-idea-audit, fo-idea-enhance, fo-idea-plan, fo-idea-implement)"
  - "New Site OS commands or validators"
  - "New DNA invariants"
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

# RFC-0669: Context checkpoint between batch items in full-pipeline orchestrator

## Context

The `fo-idea-i-just-want-to-see-the-result` orchestrator skill runs the full pipeline (idea, audit, enhance, plan, implement, review, fix) for each RFC/ADR in a batch. Its SKILL.md explicitly states: "No pauses between pipeline steps. The operator's invocation is the instruction to run the entire pipeline. Proceed automatically."

When multiple documents are processed, the orchestrator loops through each one sequentially without pauses. A single RFC implementation easily generates 50-100+ tool calls (file reads, code searches, edits, validation commands, build checks). After 2-3 RFCs, the LLM context window is saturated with stale details from completed work — file contents, search results, edit operations, intermediate reasoning — that are no longer actionable but still consume tokens.

The existing session persistence layer (RFC-0537 `session.save`, RFC-0581 `fo-session-retro`, RFC-0664 `.agents/memory/`) provides cross-session continuity but does not address intra-session context management between batch items.

## Problem

The orchestrator's "without pauses" directive has no context management between batch items. The LLM carries the full weight of previous RFC context (file contents, search results, edit operations, validation output, intermediate reasoning) into the next RFC. This causes:

- **Context saturation**: after 2-3 RFCs, the context window is filled with stale details from completed work, leaving less room for the current RFC's details.
- **Cross-RFC confusion**: the agent loses track of which files belong to which RFC, confuses validation output across RFCs, and may apply patterns from one RFC to another incorrectly.
- **Mid-implementation context limits**: on RFC #3+, the agent may hit context limits mid-implementation, losing access to early steps of the current RFC.
- **Resume ambiguity**: when resuming an interrupted batch, the agent has no structured marker to identify which RFCs completed and which are pending — it must reconstruct state from git log and file status.

There is no explicit instruction telling the LLM to release detailed context from completed RFCs and start the next RFC with a fresh read phase. The "without pauses" directive actually worsens the problem by implying that all context should be carried forward.

## Decision

The `fo-idea-i-just-want-to-see-the-result` orchestrator skill performs a **context checkpoint** between batch items (when processing >=2 documents): after completing one RFC/ADR and before starting the next, the agent emits a structured YAML checkpoint block in conversation output and explicitly releases detailed context from the completed item, retaining only the RFC ID, status, commit SHAs, cross-RFC dependency notes, and lessons learned.

## Architectural fit

This RFC is a **policy change** in the skill pipeline, not a new command or architectural invariant.

- **RFC-0537 (session documentation)**: Checkpoint blocks become part of the session transcript when `session.save` runs, providing durable traceability of batch progress.
- **RFC-0581 (session-end retro)**: The checkpoint's `lessons` field feeds into `fo-session-retro` insights — lessons captured at checkpoint time are fresher than end-of-session recollections.
- **RFC-0664 (file-based memory layer)**: Checkpoint blocks complement the memory layer — memory is for cross-session continuity, checkpoints are for intra-session context management.
- **`fo-pipeline-conventions.md`**: The checkpoint directive lives in the shared conventions file, referenced by the orchestrator skill.
- **Resume logic**: The checkpoint block doubles as a resume marker. When resuming an interrupted batch, the agent scans conversation output for the last checkpoint block, extracts completed RFC IDs and their statuses, and continues with the next uncompleted item.

## Design

### Skill text changes

The orchestrator skill (`packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md`) gains a new step between batch items. The shared conventions file (`packages/forge/skills/_shared/fo-pipeline-conventions.md`) gains a new section referenced by the orchestrator.

#### Checkpoint directive (added to `fo-pipeline-conventions.md`)

```markdown
## Context checkpoint between batch items

When the orchestrator skill processes multiple documents (>=2), perform a
context checkpoint after completing one document and before starting the next:

1. **Emit checkpoint block** — output a YAML-formatted block in conversation
   output with the following fields:
   - `completed`: RFC/ADR id of the completed document
   - `status`: final status (implemented, accepted, draft, failed)
   - `commits`: list of commit SHAs produced for this document
   - `lessons`: 1-3 short freeform sentences capturing key errors, root causes,
     patterns discovered, or validator quirks encountered during this document's
     pipeline run
   - `dependencies`: cross-RFC dependency notes (e.g., "RFC-YYYY depends on
     RFC-XXXX for schema field Z") — empty if none
   - `next`: id of the next document to process, or `null` if this was the last
2. **Release context** — explicitly treat all detailed context from the
   completed document as no longer actionable: file contents, search results,
   edit operations, intermediate reasoning. Retain only the checkpoint block.
3. **Fresh start** — begin the next document with a fresh read phase (step 3.2
   of the implementation flow: read the RFC fully and all related documents).

The checkpoint block doubles as a resume marker: when resuming an interrupted
batch, scan conversation output for the last checkpoint block, extract completed
ids and statuses, and continue with the next uncompleted item.

**Only applies to batch processing (>=2 documents).** Single-document
invocations do not need a checkpoint — the context is already fresh at the
start.
```

#### Orchestrator skill reference (added to `fo-idea-i-just-want-to-see-the-result/SKILL.md`)

In the batch processing section, after the existing "without pauses between pipeline steps" directive, add:

```markdown
**Between batch items:** After completing one document's pipeline and before
starting the next, perform a context checkpoint per
`_shared/fo-pipeline-conventions.md` §Context checkpoint between batch items.
Emit the checkpoint block, release completed-item context, and start the next
item with a fresh read phase. This does not pause for operator input — the
checkpoint is an agent-internal context management step, not a user interaction.
```

### Checkpoint block format

```yaml
--- checkpoint ---
completed: RFC-0670
status: implemented
commits:
  - abc1234
  - def5678
lessons:
  - "rfc.validate requires --id flag, not positional argument"
  - "Zod safeParse silently strips unknown fields — extend schema before adding fields"
dependencies: []
next: RFC-0671
--- end checkpoint ---
```

### Resume behavior

When the orchestrator detects an interrupted batch (step 3 of the existing skill), it scans conversation output for `--- checkpoint ---` markers. The last checkpoint block identifies the most recently completed document. The agent then:

1. Extracts `completed` id and `status` from the last checkpoint.
2. Verifies the completed document's status via git log and file inspection.
3. Continues with the `next` document, or if `next` is null, checks if any documents in the original batch list remain unprocessed.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/_shared/fo-pipeline-conventions.md` | New §Context checkpoint section added |
| `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` | Batch processing section references checkpoint convention |
| `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md` | Synced copy updated in same commit |
| `.agents/skills/_shared/fo-pipeline-conventions.md` | Synced copy updated in same commit |

### Failure modes

- **Checkpoint not emitted**: if the agent skips the checkpoint between batch items, the next RFC may suffer from context saturation. This is a skill discipline issue, not a hard failure — enforcement is through `fo-review` checking for checkpoint blocks in session output when reviewing batch runs.
- **Checkpoint with wrong status**: if the checkpoint reports `implemented` but the RFC file still shows `draft`, the resume logic detects the mismatch via git log verification and re-processes the document.
- **Lessons too verbose**: if the agent writes more than 3 sentences or includes full file contents in `lessons`, the checkpoint loses its compactness advantage. The directive specifies 1-3 short freeform sentences.

## Rollout

- **Default behavior**: the checkpoint directive is active immediately upon RFC acceptance. Any batch invocation of `fo-idea-i-just-want-to-see-the-result` with >=2 documents must emit checkpoint blocks.
- **Existing apps**: no app-level changes needed — this is a skill-level directive, not a command or validator. Apps are unaffected.
- **New apps**: automatically benefit from the checkpoint directive via the shared conventions file.
- **Sync**: `packages/forge/skills/` source and `.agents/skills/` synced copies must be updated in the same commit. `forge.doctor` detects stale copies.
- **No deprecation**: this RFC adds a new directive; it does not supersede or deprecate any existing skill behavior. The "without pauses" directive remains — the checkpoint is an agent-internal step, not a pause for operator input.

## Alternatives considered

### Automatic `fo-handoff` between RFCs

After each RFC completes, automatically invoke `fo-handoff` to create a handoff document in the OS temp directory, then start the next RFC as if picked up by a fresh agent.

**Rejected**: `fo-handoff` is designed for cross-session continuity — it compacts the conversation into a document for a different agent to pick up. Using it between RFCs within the same session would break the session continuity, require the agent to read its own handoff document, and add I/O overhead. The checkpoint block achieves the same context release without the overhead of a full handoff document.

### External context manager command

A new Site OS command (e.g., `session.checkpoint`) that tracks context usage and forces a context reset between batch items.

**Rejected**: the LLM context window is a platform-level constraint managed by the LLM provider, not by Site OS commands. A command cannot programmatically clear or compress the LLM's context window — it can only emit instructions that the LLM interprets. The checkpoint directive achieves the same effect through skill text, which is the appropriate layer for LLM behavior instructions. Adding a command would create the illusion of mechanical enforcement where none is possible.

## Risks

- **Agent misinterpretation**: the agent may interpret "release context" as a command to delete files or discard work. The directive must be clear: release means treat as no longer actionable for reasoning, not delete or undo.
- **Checkpoint verbosity**: if the agent writes verbose lessons or includes full file paths in the checkpoint, the block itself becomes context noise. The 1-3 sentence limit mitigates this, but agents may overshoot.
- **False resume confidence**: the resume logic trusts the checkpoint block's `status` field. If the agent reports `implemented` but the RFC file still shows `draft` (e.g., stamp failed silently), the resume logic may skip re-processing. Git log verification mitigates this.
- **No mechanical enforcement**: the checkpoint is an LLM directive, not a validator. Agents may skip it without any automated detection. `fo-review` can check for checkpoint blocks in session output, but this is post-hoc, not preventive.
- **Single-RFC edge case**: if the operator invokes the orchestrator with one RFC, no checkpoint is emitted. If the operator later adds more RFCs to the same session, the agent must retroactively emit a checkpoint for the first completed RFC. This is an edge case — the directive specifies >=2 documents.

## Acceptance criteria

- [ ] `packages/forge/skills/_shared/fo-pipeline-conventions.md` contains a new §Context checkpoint between batch items section
- [ ] `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` batch processing section references the checkpoint convention
- [ ] `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md` synced copy updated in same commit
- [ ] `.agents/skills/_shared/fo-pipeline-conventions.md` synced copy updated in same commit
- [ ] Checkpoint block format documented with YAML example (completed, status, commits, lessons, dependencies, next)
- [ ] Resume logic documented: scan for `--- checkpoint ---` markers, verify via git log
- [ ] `forge.doctor` passes with zero stale skill copies after sync
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement skill text changes ONLY when this RFC has status: accepted.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Implementation is skill-text-only: edit `fo-pipeline-conventions.md` and `fo-idea-i-just-want-to-see-the-result/SKILL.md`, then sync to `.agents/skills/`.
- After editing skills, run `forge.doctor` to verify synced copies are not stale.
- Agents MUST NOT weaken or remove the checkpoint directive without a new RFC that supersedes it.
- The checkpoint directive applies ONLY to `fo-idea-i-just-want-to-see-the-result` batch processing (>=2 documents). Standalone batch skills (`fo-idea-audit`, `fo-idea-enhance`, `fo-idea-plan`, `fo-idea-implement`) are NOT modified by this RFC.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
