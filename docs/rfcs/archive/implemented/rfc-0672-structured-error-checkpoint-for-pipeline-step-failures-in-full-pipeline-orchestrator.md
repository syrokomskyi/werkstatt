---
id: RFC-0672
title: "Structured error checkpoint for pipeline step failures in full-pipeline orchestrator"
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
  - RFC-0670
  - RFC-0671
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
  - "Orchestrator emits a structured error checkpoint when a pipeline step fails and cannot be auto-fixed within 2 attempts"
  - "Error checkpoint contains: failed step, error summary, partial state, files modified, resume point"
  - "Resume logic can resume from the error checkpoint instead of restarting the pipeline from scratch"
  - "Error checkpoint is distinct from progress beacon (RFC-0671) and context checkpoint (RFC-0669/0670)"
nonGoals:
  - "No error checkpoint for auto-fixable errors — the agent fixes those autonomously per existing skill behavior"
  - "No new commands — this is a skill-text directive"
  - "No error reporting to external services — the checkpoint is conversation-internal"
  - "No mechanical enforcement — the error checkpoint is an LLM directive"
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

# RFC-0672: Structured error checkpoint for pipeline step failures in full-pipeline orchestrator

## Context

The orchestrator skill runs the full pipeline without pauses. When a pipeline step fails (e.g., `rfc.validate` returns violations, `build:check` fails, a command times out), the agent fixes the error autonomously and retries. This works well for simple errors — a missing import, a type mismatch, a validation violation.

However, some errors are not auto-fixable within the 6-minute command timeout or 2-attempt retry limit:

- A build dependency is missing and cannot be installed in-session.
- A validator reports a violation that requires a design decision the agent cannot make autonomously.
- A command hangs indefinitely.
- A pre-existing error in an unimpacted workspace blocks a scoped check.

When the session is interrupted during an error recovery cycle, the resume logic has no structured information about what failed. The agent must re-discover the error by re-running the failing command, which may re-trigger the same timeout or hang.

## Problem

1. **No structured error state.** When a pipeline step fails and the session is interrupted, the resume logic detects that the RFC is `accepted` and a plan exists, but has no information about which step failed, what the error was, or what partial state exists. The agent must re-run the failing command to re-discover the error.

2. **Repeated error reproduction.** If a command takes 5 minutes to fail (e.g., a slow build check), re-running it during resume wastes another 5 minutes. A structured error checkpoint would capture the error summary, allowing the agent to skip re-production and go straight to fixing.

3. **No distinction between auto-fixable and blocking errors.** The current skill text says "fix every error" but does not distinguish between errors the agent can fix (missing import) and errors that require operator input (missing dependency, design decision). The agent may loop on an unfixable error until the retry limit is reached.

## Decision

The `fo-idea-i-just-want-to-see-the-result` orchestrator skill emits a **structured error checkpoint** when a pipeline step fails and cannot be auto-fixed within 2 attempts. The error checkpoint is a YAML block in conversation output that captures the failed step, error summary, partial state, files modified, and resume point. The error checkpoint doubles as a resume marker: when resuming an interrupted session, the agent scans for error checkpoints and resumes from the failed step instead of restarting the pipeline.

If the error is auto-fixable (fixed within 2 attempts), no error checkpoint is emitted — the progress beacon (RFC-0671) shows `✗ (fixing...)` then `✓`, and the pipeline continues.

## Architectural fit

This RFC is a **policy change** in the orchestrator skill, not a new command or architectural invariant.

- **RFC-0669 (context checkpoint between batch items)**: The error checkpoint is a different signal — it fires on failure, not on completion. It is emitted in addition to, not instead of, the batch checkpoint.
- **RFC-0670 (step-level checkpoint)**: The step checkpoint fires after successful step completion. The error checkpoint fires after failed step completion (when auto-fix fails).
- **RFC-0671 (progress beacon)**: The beacon shows `✗ (fixing...)` during the fix attempt. If the fix fails after 2 attempts, the error checkpoint is emitted.
- **`fo-pipeline-conventions.md`**: The error checkpoint directive lives in the shared conventions file.
- **Existing retry discipline**: `fo-pipeline-conventions.md` §Command execution timeout discipline specifies 2 attempts max. The error checkpoint fires when those 2 attempts are exhausted.

## Design

### Error checkpoint format

```yaml
--- error checkpoint ---
rfc: RFC-XXXX
step: <pipeline-step-name>
planStep: <plan-step-number-or-null>
error:
  command: "<command that failed>"
  exitCode: <code>
  summary: "<one-line error summary>"
  attempts: <number of fix attempts made>
partialState:
  filesModified:
    - "<file-path>"
  commits:
    - "<sha-or-none>"
  rfcStatus: "<current RFC status>"
resumePoint: "<what to do next: re-run step N / ask operator / skip step>"
--- end error checkpoint ---
```

### Error checkpoint directive (added to `fo-pipeline-conventions.md`)

```markdown
## Error checkpoint for pipeline step failures

When a pipeline step fails and cannot be auto-fixed within 2 attempts
(per §Command execution timeout discipline), emit a structured error
checkpoint block in conversation output:

1. **Emit error checkpoint** — output a YAML block with: rfc, step, planStep
   (if within implement phase), error (command, exitCode, summary, attempts),
   partialState (filesModified, commits, rfcStatus), resumePoint.
2. **Stop the pipeline** — do not continue to the next pipeline step. The
   error is not auto-fixable; continuing would compound the problem.
   This is an **explicit exception** to the orchestrator's "no pauses
   between pipeline steps" constraint. The "no pauses" directive assumes
   the pipeline can proceed; when an error is unfixable after 2 attempts,
   continuing is impossible and the exception is justified. The pause is
   for error reporting, not for optional operator input.
3. **Report to operator** — present the error checkpoint in `aiLanguage` and
   ask the operator how to proceed: fix manually, skip the step, or abort
   the RFC.

The error checkpoint doubles as a resume marker: when resuming an interrupted
session, scan for the last error checkpoint. If found, resume from the
failed step using the partialState and resumePoint fields.
```

### Orchestrator skill reference (added to `fo-idea-i-just-want-to-see-the-result/SKILL.md`)

In the Process section, after the existing retry/fix logic, add:

```markdown
**Error checkpoint:** If a pipeline step fails after 2 auto-fix attempts,
emit a structured error checkpoint per `_shared/fo-pipeline-conventions.md`
§Error checkpoint for pipeline step failures. Stop the pipeline and report
to the operator.
```

### Resume behavior

When resuming an interrupted session:

1. **Scan for error checkpoints** — search conversation output for `--- error checkpoint ---` markers. If found, extract the last one.
2. **Verify state** — check that `partialState.rfcStatus` matches the current RFC frontmatter status. If they differ, the state has changed since the checkpoint — fall back to full resume logic.
3. **Resume from resumePoint** — follow the `resumePoint` instruction: re-run the failed step, skip it, or ask the operator.
4. **No error checkpoints** — if no error checkpoint markers are found, fall back to the existing resume logic (RFC-0669 batch checkpoint, RFC-0670 step checkpoint, git log inspection).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/_shared/fo-pipeline-conventions.md` | New §Error checkpoint section added |
| `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` | References error checkpoint convention |
| `.agents/skills/_shared/fo-pipeline-conventions.md` | Synced copy updated in same commit |
| `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md` | Synced copy updated in same commit |
| `packages/forge/AGENTS.md` | No change needed — documents skill infrastructure, not individual skill behavior |

### Failure modes

- **Error checkpoint not emitted**: if the agent skips the error checkpoint and continues to the next step, the error may compound. This is a skill discipline issue.
- **Error checkpoint with stale state**: if the RFC status changes after the checkpoint (e.g., operator manually stamps it), the resume logic detects the mismatch and falls back to full resume.
- **Error checkpoint too verbose**: if the error summary is longer than one line, the checkpoint loses clarity. The directive specifies a one-line summary.

## Rollout

- **Default behavior**: the error checkpoint directive is active immediately upon RFC acceptance.
- **Existing apps**: no app-level changes — skill-level directive only.
- **Sync**: `packages/forge/skills/` source and `.agents/skills/` synced copies must be updated in the same commit.
- **No deprecation**: this RFC adds a new directive; it does not supersede or deprecate any existing RFC.

## Alternatives considered

### Auto-abort on first failure

Stop the pipeline immediately on any failure, without retrying.

**Rejected**: the existing 2-attempt retry discipline handles most transient errors. The error checkpoint only fires when retries are exhausted, preserving auto-recovery for simple errors.

### Error checkpoint as a file artifact

Write the error checkpoint to a file (e.g., `docs/errors/error-<rfc-id>.yaml`) instead of conversation output.

**Rejected**: the error checkpoint is session-scoped — it is only relevant during the current session. Writing it to a file would create git churn and require cleanup. Conversation output is the right medium for ephemeral session state.

## Risks

- **Error checkpoint noise**: if many steps fail in a batch, multiple error checkpoints may be emitted. This is acceptable — each checkpoint is a distinct failure that needs operator attention.
- **Agent continues past error**: if the agent ignores the "stop the pipeline" directive and continues, the error may compound. This is a skill discipline issue — enforcement is through `fo-review`.
- **No mechanical enforcement**: the error checkpoint is an LLM directive, not a validator.
- **Stale checkpoint on resume**: if the operator manually fixes the error between sessions, the error checkpoint may be stale. The resume logic verifies `partialState.rfcStatus` against the current RFC frontmatter to detect this.

## Acceptance criteria

- [x] `packages/forge/skills/_shared/fo-pipeline-conventions.md` contains a new §Error checkpoint for pipeline step failures section (evidence: packages/forge/skills/_shared/fo-pipeline-conventions.md:168)
- [x] `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` references the error checkpoint convention (evidence: packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md:91)
- [x] `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md` synced copy updated in same commit (evidence: commit 4623da5, .agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md:91)
- [x] `.agents/skills/_shared/fo-pipeline-conventions.md` synced copy updated in same commit (evidence: commit 4623da5, .agents/skills/_shared/fo-pipeline-conventions.md:168)
- [x] Error checkpoint block format documented with YAML example (rfc, step, planStep, error, partialState, resumePoint) (evidence: docs/rfcs/rfc-0672-structured-error-checkpoint-for-pipeline-step-failures-in-full-pipeline-orchestrator.md:119-137)
- [x] Resume logic documented: scan for `--- error checkpoint ---` markers, verify state, resume from resumePoint (evidence: docs/rfcs/rfc-0672-structured-error-checkpoint-for-pipeline-step-failures-in-full-pipeline-orchestrator.md:175-180)
- [x] Directive specifies 2-attempt threshold before emitting error checkpoint (evidence: docs/rfcs/rfc-0672-structured-error-checkpoint-for-pipeline-step-failures-in-full-pipeline-orchestrator.md:144)
- [x] `forge.doctor` passes with zero stale skill copies after sync (evidence: forge.doctor output — 0 fail, 2 warn, exitCode: 0)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0672 — status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement skill text changes ONLY when this RFC has status: accepted.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Implementation is skill-text-only: edit `fo-pipeline-conventions.md` and `fo-idea-i-just-want-to-see-the-result/SKILL.md`, then sync to `.agents/skills/`.
- After editing skills, run `forge.doctor` to verify synced copies are not stale.
- Agents MUST NOT weaken or remove the error checkpoint directive without a new RFC that supersedes it.
- The error checkpoint directive applies ONLY to `fo-idea-i-just-want-to-see-the-result`.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
