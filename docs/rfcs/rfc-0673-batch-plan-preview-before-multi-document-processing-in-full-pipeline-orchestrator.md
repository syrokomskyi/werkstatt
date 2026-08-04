---
id: RFC-0673
title: "Batch plan preview before multi-document processing in full-pipeline orchestrator"
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
  - RFC-0671
  - RFC-0672
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
  - "Orchestrator emits a batch plan preview before starting multi-document processing (>=2 documents)"
  - "Preview contains: document list, processing order, complexity estimate, dependency notes"
  - "Preview is informational — it does not pause for operator approval unless explicitly requested"
  - "Preview helps operator verify the batch order and catch dependency issues before processing starts"
nonGoals:
  - "No mandatory operator approval — the preview is informational, not a gate (unless operator explicitly requests confirmation)"
  - "No new commands — this is a skill-text directive"
  - "No complexity estimation algorithm — the agent provides a rough heuristic estimate, not a precise measurement"
  - "No mechanical enforcement — the preview is an LLM directive"
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

# RFC-0673: Batch plan preview before multi-document processing in full-pipeline orchestrator

## Context

The `fo-idea-i-just-want-to-see-the-result` orchestrator processes multiple documents sequentially without pauses. When the operator provides a batch (e.g., "RFC-0670, RFC-0671, RFC-0672, RFC-0673"), the orchestrator immediately starts processing the first document. The operator has no opportunity to verify the processing order, check for dependencies, or estimate the total effort before the pipeline starts.

During this session, 4 RFCs were created in sequence (RFC-0670 through RFC-0673). They have dependencies: RFC-0671 references RFC-0669 and RFC-0670, RFC-0672 references RFC-0669/0670/0671, RFC-0673 references all three. Processing them in the wrong order would cause audit findings for forward references to non-existent RFCs.

The current orchestrator skill says "process them in dependency order — the same order `fo-idea` created them" but does not show the operator the planned order before starting.

## Problem

1. **No order verification.** The operator cannot verify the processing order before the pipeline starts. If the agent picks the wrong order (e.g., processes RFC-0672 before RFC-0670), it may produce audit findings for forward references that would have been avoided with the correct order.

2. **No complexity estimate.** The operator cannot estimate how long the batch will take. A batch of 4 small policy RFCs (skill-text-only) is very different from a batch of 4 architecture RFCs (new commands, TypeScript contracts, tests). Without a preview, the operator cannot decide whether to start the batch now or split it.

3. **No dependency visibility.** The operator cannot see cross-RFC dependencies before processing starts. If RFC-B depends on RFC-A for a schema field, processing RFC-B first will fail or produce incorrect results.

## Decision

The `fo-idea-i-just-want-to-see-the-result` orchestrator skill emits a **batch plan preview** before starting multi-document processing (>=2 documents). The preview is a concise table showing each document's id, type, processing order, complexity estimate, and dependency notes. The preview is informational — it does not pause for operator approval unless the operator explicitly requests confirmation.

The preview is emitted in `aiLanguage` per the language policy.

## Architectural fit

This RFC is a **policy change** in the orchestrator skill, not a new command or architectural invariant.

- **RFC-0669 (context checkpoint between batch items)**: The batch plan preview is emitted before the first document starts; RFC-0669's checkpoint is emitted between documents. They are complementary — preview before, checkpoint between.
- **`fo-pipeline-conventions.md`**: The batch plan preview directive lives in the shared conventions file.
- **Language policy**: The preview text must use `aiLanguage` — it is operator-facing output.
- **Existing order logic**: The orchestrator already says "process them in dependency order." This RFC adds visibility into that order, not a new ordering algorithm.

## Design

### Batch plan preview format

The preview is a table in `aiLanguage`, formatted as:

```
## <Batch Plan Preview in aiLanguage>

| # | ID | Type | Complexity | Dependencies | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | RFC-XXXX | RFC | low | none | skill-text-only |
| 2 | RFC-YYYY | RFC | medium | RFC-XXXX | new command |
| 3 | ADR-ZZZZ | ADR | low | none | decision implementation |

### <Total estimated steps: N>
### <Processing order: dependency-based>
```

Where:

- `#` is the processing order (1-based)
- `Complexity` is a rough heuristic: `low` (skill-text-only, <5 plan steps), `medium` (new command or 5-10 plan steps), `high` (new architecture, >10 plan steps, multi-package)
- `Dependencies` lists RFC/ADR ids that must be processed first
- `Notes` is a short hint about the nature of the work

### Batch plan preview directive (added to `fo-pipeline-conventions.md`)

```markdown
## Batch plan preview

When the orchestrator skill processes multiple documents (>=2), emit a
batch plan preview before starting the first document. The preview is a
table showing: processing order, document id, type, complexity estimate,
dependencies, and notes.

The preview is informational — it does not pause for operator approval
unless the operator explicitly requests confirmation. The operator's
invocation of the orchestrator is the instruction to proceed.

The preview text must use `aiLanguage` per the language policy.
```

### Orchestrator skill reference (added to `fo-idea-i-just-want-to-see-the-result/SKILL.md`)

In the Process section, step 1 (Run the pipeline), before "For each document, run the full pipeline inline", add:

```markdown
**Batch plan preview:** When processing >=2 documents, emit a batch plan
preview per `_shared/fo-pipeline-conventions.md` §Batch plan preview
before starting the first document.
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/_shared/fo-pipeline-conventions.md` | New §Batch plan preview section added |
| `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` | References batch plan preview convention |
| `.agents/skills/_shared/fo-pipeline-conventions.md` | Synced copy updated in same commit |
| `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md` | Synced copy updated in same commit |
| `packages/forge/AGENTS.md` | No change needed — documents skill infrastructure, not individual skill behavior |

### Failure modes

- **Preview not emitted**: if the agent skips the preview, the operator loses visibility but the pipeline continues. This is a skill discipline issue.
- **Wrong complexity estimate**: the complexity heuristic is rough — it may underestimate or overestimate. This is acceptable; the preview is informational, not a commitment.
- **Wrong dependency order**: if the agent processes documents in the wrong order despite the preview, the audit step will catch forward references. The preview is a visibility tool, not an ordering enforcement mechanism.

## Rollout

- **Default behavior**: the batch plan preview is active immediately upon RFC acceptance.
- **Existing apps**: no app-level changes — skill-level directive only.
- **Sync**: `packages/forge/skills/` source and `.agents/skills/` synced copies must be updated in the same commit.
- **No deprecation**: this RFC adds a new directive; it does not supersede or deprecate any existing RFC.

## Alternatives considered

### Mandatory operator approval

Require the operator to confirm the batch plan before processing starts.

**Rejected**: the orchestrator's design principle is "no pauses — the operator's invocation is the instruction to proceed." A mandatory approval gate would violate this principle. The preview is informational; the operator can interrupt if they disagree with the order.

### Automated dependency resolution

Use a tool to automatically resolve dependencies between RFCs and determine the optimal processing order.

**Rejected**: RFC dependencies are expressed in `related[]`, `amends[]`, and `supersedes[]` frontmatter fields, but these are not strictly dependency declarations — they are reference relationships. A full dependency graph would require a new semantic layer. The agent's heuristic (process in creation order, which usually matches dependency order) is sufficient.

## Risks

- **Preview noise for small batches**: a 2-document batch gets a preview table that may seem unnecessary. This is acceptable — the preview is concise (3-5 rows) and provides value even for small batches.
- **Wrong complexity estimate**: the heuristic may misjudge complexity. This is acceptable — the preview is informational, not a commitment.
- **No mechanical enforcement**: the preview is an LLM directive, not a validator.
- **Operator confusion**: the operator may interpret the preview as a request for approval. The directive must be clear: "informational, not a gate."

## Acceptance criteria

- [ ] `packages/forge/skills/_shared/fo-pipeline-conventions.md` contains a new §Batch plan preview section
- [ ] `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` references the batch plan preview convention
- [ ] `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md` synced copy updated in same commit
- [ ] `.agents/skills/_shared/fo-pipeline-conventions.md` synced copy updated in same commit
- [ ] Preview format documented with table example (order, id, type, complexity, dependencies, notes)
- [ ] Preview text uses `aiLanguage` per language policy
- [ ] Directive specifies the preview is informational, not a gate
- [ ] `forge.doctor` passes with zero stale skill copies after sync
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement skill text changes ONLY when this RFC has status: accepted.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Implementation is skill-text-only: edit `fo-pipeline-conventions.md` and `fo-idea-i-just-want-to-see-the-result/SKILL.md`, then sync to `.agents/skills/`.
- After editing skills, run `forge.doctor` to verify synced copies are not stale.
- Agents MUST NOT weaken or remove the batch plan preview directive without a new RFC that supersedes it.
- The batch plan preview directive applies ONLY to `fo-idea-i-just-want-to-see-the-result` with >=2 documents.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
