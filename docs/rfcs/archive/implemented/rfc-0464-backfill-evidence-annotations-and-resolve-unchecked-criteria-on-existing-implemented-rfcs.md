---
id: RFC-0464
title: "Backfill evidence annotations and resolve unchecked criteria on existing implemented RFCs"
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
createdAt: 2026-07-20
updatedAt: 2026-07-20
enhancedAt: 2026-07-20
implementedAt: 2026-07-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0463
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals:
  - rfc.validate --json reports zero V-26 violations
  - rfc.validate --json reports zero V-27 violations
  - rfc.validate --json exits 0 on the full RFC tree
nonGoals:
  - Does not introduce new validation rules — V-26 and V-27 are already defined by RFC-0463.
  - Does not change the rfc.validate command interface.
  - Does not modify RFC-0463's rules or acceptance criteria.
  - Does not introduce new commands, types, or code changes — this is a document-editing operation only.
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

# RFC-0464: Backfill evidence annotations and resolve unchecked criteria on existing implemented RFCs

## Context

RFC-0463 introduced V-26 (implemented RFCs must have all acceptance criteria checked) and V-27 (checked criteria must carry inline `(evidence: ...)` annotations). These rules apply retroactively to all RFCs regardless of creation date. A detection pass identified **165 RFCs** with V-26 violations (unchecked `[ ]` at `implemented` status) and **342 RFCs** with V-27 violations (2846 checked `[x]` items without evidence annotations). This RFC covers the one-time backfill to bring all existing implemented RFCs into compliance.

## Problem

RFC-0463's V-26 and V-27 rules are enforced by `rfc.validate`, which runs in `build.check`. Until the 3011 violations are resolved, `rfc.validate` fails on the full RFC tree. This blocks CI and prevents any new RFC from being validated cleanly.

The backfill is mechanical but large:

- **V-27 (2846 violations in 342 files)**: each `[x]` without evidence needs an `(evidence: ...)` annotation pointing to the real implementation file and/or test.
- **V-26 (165 violations in 165 files)**: each unchecked `[ ]` at `implemented` status needs triage — was the work completed (check `[x]` + add evidence) or genuinely deferred (split via supersede).

## Decision

This RFC authorizes a batch backfill operation:

1. **V-27 backfill**: For each of the 2846 evidenceless `[x]` items, add `(evidence: <file-path>, <test-or-command>)` by inspecting the actual implementation. The evidence must point to a real file in the codebase.
2. **V-26 triage**: For each of the 165 RFCs with unchecked `[ ]` at `implemented` status:
   - If the work was completed, check `[x]` and add evidence.
   - If the work is genuinely deferred, split via `rfc.supersede.propose` (RFC-0334) — create a follow-up RFC for the deferred work.
3. **Validation**: `rfc.validate --json` must pass with zero V-26 and V-27 violations after backfill is complete.

## Architectural fit

- **RFC-0463** — this RFC is the backfill companion to RFC-0463. RFC-0463 introduced the rules; this RFC executes the one-time compliance pass.
- **RFC-0334** (supersede.propose) — the escape hatch for V-26 triage. RFCs with genuinely deferred work are split via supersede rather than left with unchecked `[ ]`.
- **RFC-0224** (agent-driven implementation status) — this RFC ensures that all existing `implemented` RFCs actually deserve that status.

## Design

### CLI surface

No new commands. The backfill uses existing `rfc.validate --json` to detect violations and standard `edit`/`multi_edit` tools to fix RFC files.

```sh
pnpm exec site-kernel run rfc.validate --json
```

### TypeScript contracts

No new types. This is a document-editing operation, not a code change.

### File system responsibilities

No packages are impacted — this RFC only edits `docs/rfcs/**/*.md` files.

| Path | Role |
| --- | --- |
| `docs/rfcs/archive/implemented/**/*.md` | 342 files with V-27 violations, backfilled with evidence annotations |
| `docs/rfcs/archive/implemented/**/*.md` | 165 files with V-26 violations, triaged (checked + evidence or split via supersede) |

### Output format

No output format changes. `rfc.validate --json` is the verification command.

### Failure modes

- If an evidence annotation points to a non-existent file, it is fake evidence. The agent must verify each file path exists before writing the annotation.
- If an RFC with unchecked `[ ]` cannot be triaged (unclear whether work was completed), default to supersede rather than guessing.

## Rollout

- **Batch processing**: backfill in batches of 20-50 RFCs per commit to keep diffs reviewable.
- **V-27 first**: backfill evidence annotations (2846 items in 342 files) — this is mechanical and low-risk.
- **V-26 second**: triage unchecked criteria (165 files) — this requires reading each RFC and may result in supersede proposals.
- **Validation**: after each batch, run `rfc.validate --json` and confirm the violation count decreased.
- **Completion**: `rfc.validate --json` passes with zero V-26 and V-27 violations.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Scripted generic evidence (auto-add `(evidence: TODO)` to every `[x]`) | Fake evidence defeats the purpose of V-27. The RFC-0463 Risks section explicitly warns against this. |
| Skip backfill, leave violations in place | `rfc.validate` runs in `build.check` and CI. 3011 violations would block all pipelines indefinitely. |
| Mass-supersede all 165 V-26 RFCs | Some RFCs may have completed work that was simply not checked. Triage is needed before supersede. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Evidence annotations are inaccurate (point to wrong file) | Medium | Agent must verify each file path exists before writing evidence. Spot-check by running `rfc.validate` after each batch. |
| Triage of 165 V-26 RFCs produces too many supersede proposals | Medium | Batch triage: group by owner/package, prioritize RFCs where work was clearly completed. |
| Backfill takes multiple sessions | High | This is expected. At 20-50 RFCs per batch and 507 files to process (342 V-27 + 165 V-26), the backfill requires approximately 10-25 sessions. Commit progress in batches. The RFC stays `accepted` until all violations are resolved. |
| New RFCs created during backfill also need evidence | Low | New RFCs should comply from creation per RFC-0463. Only pre-RFC-0463 RFCs need backfill. The backfill target is a snapshot taken at implementation start; any new RFCs created during the backfill window are out of scope and must self-comply. |

## Acceptance criteria

- [x] V-27 backfill complete: all 2846 evidenceless `[x]` items in 342 RFCs have `(evidence: ...)` annotations pointing to real files (evidence: rfc.validate --json, V-27 count = 0)
- [x] V-26 triage complete: all 165 RFCs with unchecked `[ ]` at `implemented` status are resolved — completed work checked with evidence, deferred work split via supersede (evidence: rfc.validate --json, V-26 count = 0)
- [x] `rfc.validate --json` passes on the full RFC tree with zero V-26 and V-27 violations (evidence: rfc.validate --json, V-26=0 V-27=0)
- [x] No fake evidence: spot-check confirms evidence annotations point to existing files (evidence: manual spot-check of RFC-0001, RFC-0005, RFC-0020, RFC-0026, RFC-0040 — all evidence paths verified)
- [x] `rfc.validate` passes on this RFC file (evidence: rfc.validate RFC-0464 --json exitCode=0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by RFC-0463 without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0464 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **Backfill in batches**: commit every 20-50 RFCs to keep diffs reviewable.
- **V-27 first, V-26 second**: V-27 is mechanical (add evidence annotations), V-26 requires triage (read each RFC, decide complete vs. deferred).
- **Verify evidence**: before writing `(evidence: <path>)`, confirm the file at `<path>` exists in the codebase. Do not write fake evidence.
- **Supersede for deferred work**: if an RFC has unchecked `[ ]` because the work was genuinely deferred, use `rfc.supersede.propose` to create a follow-up RFC. Do not mark `[x]` on deferred work.
- Use Compass terminology (not GRACE) in all new code, documentation, and log messages (RFC-0353).
