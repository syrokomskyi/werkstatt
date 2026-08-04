---
id: RFC-0671
title: "Progress beacon after each pipeline step in full-pipeline orchestrator"
status: accepted
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
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0669
  - RFC-0670
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
  - "Orchestrator emits a one-line progress beacon after completing each pipeline step (audit, enhance, plan, implement, review, fix)"
  - "Beacon contains: pipeline step name, RFC id, status (done/failed), and next step name"
  - "Beacon is visible to operator without scrolling — it is a single line, not a block"
  - "Beacon does not pause the pipeline — it is informational, not interactive"
nonGoals:
  - "No beacon for single-step skills invoked directly (fo-idea-audit, fo-idea-enhance, etc.) — only the orchestrator needs it"
  - "No new commands — this is a skill-text directive"
  - "No structured checkpoint — beacon is a one-line visibility signal, not a context release mechanism (RFC-0669/0670 handle context release)"
  - "No mechanical enforcement — the beacon is an LLM directive"
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

# RFC-0671: Progress beacon after each pipeline step in full-pipeline orchestrator

## Context

The `fo-idea-i-just-want-to-see-the-result` orchestrator runs the full pipeline (audit → enhance → plan → implement → review → fix) without pauses. During long sessions, the operator has no visibility into where the pipeline is. Each pipeline step can take minutes — the operator sees tool calls flying by but cannot easily tell if the pipeline is on step 2 (enhance) or step 5 (fix).

During the RFC-0669 implementation session, the full pipeline for a single small RFC took ~15 minutes and produced hundreds of tool calls. The operator had to scroll through the conversation to determine which step was running. For batch processing of multiple RFCs, this problem compounds — the operator cannot tell which RFC is being processed or which pipeline step is active.

RFC-0669's checkpoint block (between RFCs) and RFC-0670's step checkpoint (within an RFC) provide structured context management, but neither provides a lightweight, real-time progress signal. The checkpoint blocks are emitted after a step completes, not during, and they are multi-line YAML blocks — too verbose for a quick glance.

## Problem

1. **No real-time pipeline visibility.** The operator cannot tell at a glance which pipeline step is running. The orchestrator skill says "no pauses between pipeline steps" — this is correct for execution, but the operator still needs a progress signal.

2. **Batch processing opacity.** When processing multiple RFCs, the operator cannot tell which RFC is current. RFC-0669's checkpoint block appears after an RFC completes, but during processing there is no signal.

3. **No failure signal.** If a pipeline step fails (e.g., `rfc.validate` returns violations), the agent fixes it autonomously, but the operator may not notice the failure and fix cycle — it looks like normal tool calls.

## Decision

The `fo-idea-i-just-want-to-see-the-result` orchestrator skill emits a **progress beacon** — a single-line message in conversation output — after completing each pipeline step (audit, enhance, plan, implement, review, fix) for each RFC. The beacon is informational only: it does not pause the pipeline, does not request operator input, and does not release context. It exists solely for operator visibility.

The beacon is emitted in `aiLanguage` per the language policy in `fo-pipeline-conventions.md`.

## Architectural fit

This RFC is a **policy change** in the orchestrator skill, not a new command or architectural invariant.

- **RFC-0669 (context checkpoint between batch items)**: The beacon is complementary — it provides real-time visibility, while the checkpoint provides structured context release. The beacon is one line; the checkpoint is a YAML block.
- **RFC-0670 (step-level checkpoint)**: The beacon fires after each pipeline step (audit, enhance, plan, implement, review, fix); the step checkpoint fires after each plan step within the implement phase. Different granularity.
- **`fo-pipeline-conventions.md`**: The beacon directive lives in the shared conventions file, referenced by the orchestrator skill.
- **Language policy**: The beacon text must use `aiLanguage` — it is operator-facing output.

## Design

### Beacon format

The beacon is a single line in `aiLanguage`, formatted as:

```
[beacon] RFC-XXXX | <step> ✓ | next: <next-step>
```

For failed steps:

```
[beacon] RFC-XXXX | <step> ✗ (fixing...) | next: <next-step>
```

Where:

- `<step>` is the pipeline step name in `aiLanguage` (e.g., "аудит", "улучшение", "план", "реализация", "ревью", "исправление")
- `✓` indicates success, `✗` indicates failure (being fixed autonomously)
- `next` is the next pipeline step name in `aiLanguage`

### Beacon directive (added to `fo-pipeline-conventions.md`)

```markdown
## Progress beacon

The orchestrator skill emits a one-line progress beacon after completing
each pipeline step (audit, enhance, plan, implement, review, fix) for each
RFC. The beacon is informational only — it does not pause the pipeline,
does not request operator input, and does not release context.

Format: `[beacon] RFC-XXXX | <step> ✓ | next: <next-step>`

For failed steps being fixed: `[beacon] RFC-XXXX | <step> ✗ (fixing...) | next: <next-step>`

The beacon text must use `aiLanguage` per the language policy.
```

### Orchestrator skill reference (added to `fo-idea-i-just-want-to-see-the-result/SKILL.md`)

In the Process section, after the existing pipeline step descriptions, add:

```markdown
**Progress beacon:** After completing each pipeline step, emit a one-line
progress beacon per `_shared/fo-pipeline-conventions.md` §Progress beacon.
The beacon is informational — it does not pause the pipeline.
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/_shared/fo-pipeline-conventions.md` | New §Progress beacon section added |
| `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` | References beacon convention |
| `.agents/skills/_shared/fo-pipeline-conventions.md` | Synced copy updated in same commit |
| `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md` | Synced copy updated in same commit |
| `packages/forge/AGENTS.md` | No change needed — documents skill infrastructure, not individual skill behavior |

### Failure modes

- **Beacon not emitted**: if the agent skips the beacon, the operator loses visibility but the pipeline continues. This is a skill discipline issue.
- **Beacon too verbose**: if the agent writes a multi-line beacon, it defeats the purpose. The directive specifies a single line.
- **Beacon in wrong language**: if the agent emits the beacon in English instead of `aiLanguage`, it violates the language policy.

## Rollout

- **Default behavior**: the progress beacon is active immediately upon RFC acceptance.
- **Existing apps**: no app-level changes — skill-level directive only.
- **Sync**: `packages/forge/skills/` source and `.agents/skills/` synced copies must be updated in the same commit.
- **No deprecation**: this RFC adds a new directive; it does not supersede or deprecate any existing RFC.

## Alternatives considered

### Structured progress JSON

Emit a JSON progress object after each step instead of a one-line beacon.

**Rejected**: JSON is machine-readable but human-unfriendly. The beacon is for the operator, not for tooling. A one-line human-readable format is more useful.

### Progress in commit messages

Rely on commit messages to indicate pipeline progress.

**Rejected**: commit messages are only visible after the step completes and the operator checks git log. The beacon provides real-time visibility during step execution.

## Risks

- **Beacon noise in batch processing**: processing 5 RFCs × 6 steps = 30 beacons. This is acceptable — each beacon is one line, and the operator can scroll past them.
- **Beacon during fix cycles**: if a step fails and the agent runs fix → re-check → fix → re-check, multiple beacons may be emitted for the same step. The directive specifies `✗ (fixing...)` for the first failure and `✓` for the eventual success.
- **No mechanical enforcement**: the beacon is an LLM directive, not a validator.

## Acceptance criteria

- [ ] `packages/forge/skills/_shared/fo-pipeline-conventions.md` contains a new §Progress beacon section
- [ ] `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` references the beacon convention
- [ ] `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md` synced copy updated in same commit
- [ ] `.agents/skills/_shared/fo-pipeline-conventions.md` synced copy updated in same commit
- [ ] Beacon format documented with examples (success and failure variants)
- [ ] Beacon text uses `aiLanguage` per language policy
- [ ] `forge.doctor` passes with zero stale skill copies after sync
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement skill text changes ONLY when this RFC has status: accepted.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Implementation is skill-text-only: edit `fo-pipeline-conventions.md` and `fo-idea-i-just-want-to-see-the-result/SKILL.md`, then sync to `.agents/skills/`.
- After editing skills, run `forge.doctor` to verify synced copies are not stale.
- Agents MUST NOT weaken or remove the beacon directive without a new RFC that supersedes it.
- The beacon directive applies ONLY to `fo-idea-i-just-want-to-see-the-result`.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
