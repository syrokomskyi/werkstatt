---
id: RFC-0625
title: "Enforce RFC and ADR implementation completion with process gates and drift detection"
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
createdAt: 2026-07-31
updatedAt: 2026-07-31
enhancedAt: 2026-07-31
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0476
  - RFC-0224
  - RFC-0463
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
  changed:
    - rfc.validate
    - adr.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/forge"
successSignals:
  - "rfc.validate emits V-32 warning when implement: RFC-XXXX commits exist but RFC status is still accepted"
  - "adr.validate emits V-32 warning when implement: ADR-XXXX commits exist but ADR status is not implemented"
  - "fo-idea-implement step 3.11b gate catches missing stamp before reporting completion"
  - "fo-idea-implement step 4.10b gate catches missing ADR status transition before reporting completion"
  - "fo-idea-plan template includes Step 8: Stamp implemented as a separate plan step"
nonGoals:
  - "Does not add a new command — V-32 extends existing rfc.validate and adr.validate"
  - "Does not change the rfc.implement.stamp command or its preconditions"
  - "Does not add ADR stamping infrastructure — ADRs remain manually transitioned per existing process"
  - "Does not make V-32 an error — in-progress implementations with intermediate commits are legitimate"
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

# RFC-0625: Enforce RFC and ADR implementation completion with process gates and drift detection

## Context

RFC-0476 established `rfc.implement.stamp` as the exclusive path for `accepted → implemented` transitions and defined `RFC-IMP-*` preconditions. `fo-idea-implement` (step 3.8) instructs agents to run the stamp command after all acceptance criteria are checked. `fo-idea-plan` (step 4) defines the plan step ordering but ends at step 7 (Review & Fix) without an explicit stamp step.

Despite these instructions, agents sometimes work manually from the plan instead of following the `fo-idea-implement` skill pipeline, and skip the stamp step. The plan template does not remind them. `fo-review` checks code quality but does not verify RFC frontmatter status. `rfc.validate` checks that `implemented` RFCs have all criteria checked (V-26) but does not detect the reverse: `implement:` commits in git history while the RFC status is still `accepted`.

The same gap exists for ADRs: `fo-idea-implement` step 4.10 manually sets `status: implemented`, but there is no gate verifying this happened, and `adr.validate` has no drift detection rule.

## Problem

Three gaps allow RFC/ADR implementation to be reported as complete without the status transition:

1. **Plan template omits stamp step** — `fo-idea-plan` step 4 defines steps 1–7 (Contracts → Commands → Documentation → Tests → Validation → Evidence → Review & Fix) but does not include a final "Stamp implemented" step. An agent working manually from the plan has no reminder to run `rfc.implement.stamp` or transition ADR status.

2. **No post-implementation gate in `fo-idea-implement`** — the skill has step 3.8 (stamp) and step 4.10 (ADR stamp), but no final gate verifying the stamp actually happened before the report step (3.12 / 4.11). If the agent skips step 3.8, the skill proceeds to doc-audit, review, fix, and report without catching the omission.

3. **No drift detection in validators** — `rfc.validate` (V-01..V-31) and `adr.validate` do not check git history for `implement:` commits. An RFC with `implement: RFC-XXXX` commits in git history but `status: accepted` passes validation silently. The same applies to ADRs with `implement: ADR-XXXX` commits but non-`implemented` status.

## Decision

The Forge governance surface gains three layers of defense against incomplete RFC and ADR implementation:

1. **Plan template** — `fo-idea-plan` step 4 gains step 8: "Stamp implemented", making the status transition an explicit plan step that agents working manually cannot miss.

2. **Post-implementation gates** — `fo-idea-implement` gains step 3.11b (RFC) and step 4.10b (ADR): a verification gate that checks `status: implemented`, `implementedAt` set, and `rfc.validate` / `adr.validate` passing before the report step.

3. **Drift detection rules** — `rfc.validate` gains V-32 (warning) and `adr.validate` gains AV-16 (warning): if git history contains commits with `implement: RFC-XXXX` / `implement: ADR-XXXX` prefix since the document's `createdAt`, but the document status is not `implemented`, emit a warning.

## Architectural fit

- **RFC-0476:** extends the stamp-based transition model with drift detection. RFC-0476 created the exclusive mutation path; this RFC adds the safety net that catches when the path was not taken.
- **RFC-0224:** retains the only agent-permitted lifecycle transition (`accepted → implemented`). This RFC does not change transition authority — it adds verification gates and warnings.
- **RFC-0463:** V-26 and V-27 check `implemented` RFCs for incomplete criteria. V-32 is the reverse: checking `accepted` RFCs for implementation commits. Together they form a bidirectional drift detection pair.
- **Site OS operator model:** V-32 extends existing `rfc.validate` and `adr.validate` commands — no new command is added. The gate steps extend existing `fo-idea-implement` and `fo-idea-plan` skills — no new skill is created.
- **Skill invocation tracking:** the gates in `fo-idea-implement` (3.11b, 4.10b) reinforce the PREFERENCES.md mandate that agents follow the skill pipeline to completion.

## Design

### CLI surface

No new commands. V-32 is emitted by existing commands:

```sh
pnpm exec site-kernel run rfc.validate --json
pnpm exec site-kernel run rfc.validate --id RFC-XXXX --json
pnpm exec site-kernel run adr.validate --id ADR-XXXX --json
```

V-32 (RFC) and AV-16 (ADR) warnings appear in the `violations` array with `severity: "warning"`.

### TypeScript contracts

```ts
interface RfcValidationViolation {
  rfcId: string;
  file: string;
  rule: string; // "V-32" for RFCs, "AV-16" for ADRs
  message: string;
  severity: "error" | "warning"; // V-32/AV-16 is always "warning"
}
```

The V-32 check function signature (internal, not exported):

```ts
async function checkImplementationCommitDrift(
  workspaceRoot: string,
  rfcId: string,
  createdAt: string,
  currentStatus: string,
): Promise<RfcValidationViolation | null>
```

Returns a V-32 warning if:

- `currentStatus` is not `implemented` (i.e. `accepted`, `draft`, `reviewing`)
- `git log --since="<createdAt>" --oneline` contains commits whose message starts with `implement: ` and includes the RFC id

For ADRs, the same logic applies with `ADR-XXXX` id matching and `status: implemented` as the target. The ADR statuses that trigger the warning are: `proposed`, `reviewing`, `accepted` (all non-terminal, non-`implemented` statuses). The check function is `checkAdrImplementationCommitDrift`, added to `validateSingleAdr` in `packages/forge/os/adr/handlers/validate.ts`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/os/rfc/handlers/validate-rules.ts` | V-32 check for RFCs — `checkImplementationCommitDrift` |
| `packages/forge/os/adr/handlers/validate.ts` | AV-16 check for ADRs — `checkAdrImplementationCommitDrift` added to `validateSingleAdr` |
| `packages/forge/skills/fo/fo-idea-plan/SKILL.md` | Step 4 gains step 8: "Stamp implemented" |
| `packages/forge/skills/fo/fo-idea-implement/SKILL.md` | Step 3.11b (RFC gate) and step 4.10b (ADR gate) |
| `.agents/skills/fo/fo-idea-plan/SKILL.md` | Synced copy of the plan skill |
| `.agents/skills/fo/fo-idea-implement/SKILL.md` | Synced copy of the implement skill |

### Output format

V-32 warning in `rfc.validate --json` output:

```json
{
  "command": "rfc.validate",
  "status": "pass",
  "violations": [
    {
      "rfcId": "RFC-0620",
      "file": "docs/rfcs/rfc-0620-*.md",
      "rule": "V-32",
      "message": "RFC-0620 has implement: commits in git history since 2026-07-28 but status is still 'accepted'. Run rfc.implement.stamp to transition to implemented.",
      "severity": "warning"
    }
  ]
}
```

AV-16 warning in `adr.validate --json` output:

```json
{
  "command": "adr.validate",
  "status": "pass",
  "violations": [
    {
      "adrId": "ADR-0008",
      "file": "docs/adrs/adr-0008-*.md",
      "rule": "AV-16",
      "message": "ADR-0008 has implement: commits in git history since 2026-07-15 but status is still 'accepted'. Set status: implemented and implementedAt to complete.",
      "severity": "warning"
    }
  ]
}
```

`status: "pass"` because V-32/AV-16 are warnings, not errors. Validation passes with warnings.

### Failure modes

- **V-32/AV-16 false positive during in-progress implementation:** expected and safe. An agent that has committed `implement: RFC-XXXX step N` commits but not yet reached the stamp step will see V-32/AV-16 warnings. These disappear once the status transitions to `implemented`.
- **V-32/AV-16 false negative from squash merges:** if `implement:` commits are squashed into a single commit with a different message, V-32/AV-16 will not detect them. This is acceptable — V-32/AV-16 is a safety net, not a hard gate. The plan template and skill gates are the primary defense.
- **Git history scan performance:** `git log --since="<createdAt>" --oneline` is fast (O(commits-since-date)). For repositories with thousands of commits since the RFC's creation date, this is still sub-second.
- **Gate step 3.11b / 4.10b failure:** if the gate detects that `status` is not `implemented`, it instructs the agent to go back to step 3.8 (stamp) / 4.10 (ADR stamp) before proceeding to the report.

## Rollout

1. Add V-32 to `validate-rules.ts` in the RFC module and AV-16 to `validate.ts` in the ADR module.
2. Add step 3.11b and 4.10b to `fo-idea-implement/SKILL.md` and sync to `.agents/skills/`.
3. Add step 8 to `fo-idea-plan/SKILL.md` step 4 and sync to `.agents/skills/`.
4. Add unit tests for V-32 (both RFC and ADR variants) covering: drift detected (warning emitted), no drift (clean), status already `implemented` (no warning), no `implement:` commits (no warning).
5. Existing RFCs and ADRs are not retroactively affected — V-32 only triggers on `accepted` documents with `implement:` commits since their `createdAt`, which is a forward-looking check.
6. V-32 joins `rfc.validate` and `adr.validate` as a warning-level rule. It does not join `build.check` or `ci.local.validate` as a blocking check — it is advisory.
7. The skill gate steps (3.11b, 4.10b) are mandatory within the `fo-idea-implement` pipeline but do not affect manual workflows outside the skill.

## Alternatives considered

- **Add more prose to AGENTS.md only.** Rejected: the existing PREFERENCES.md already has a mandatory pre-response checklist for RFC implementation. Documentation alone did not prevent the agent from skipping the stamp step — the problem is that agents working manually from the plan never encounter the skill pipeline.

- **Make V-32 an error.** Rejected: an in-progress implementation with intermediate `implement:` commits would break `rfc.validate` for the entire repository until the stamp is run. This is too aggressive for a workflow that legitimately has intermediate commits. Warning is the right severity.

- **Add a `--check-stamp` flag to `rfc.validate`.** Rejected: the check should always run as part of validation. Making it opt-in means agents will forget to use it. V-32 is a standard rule, not a flag.

- **Add a separate `rfc.implementation.drift.check` command.** Rejected: a separate command adds maintenance burden and requires agents to know about it. Integrating into `rfc.validate` and `adr.validate` ensures it runs automatically.

- **Rely on the plan template and skill gates only (no V-32).** Rejected: the plan template and skill gates only work when the agent follows the skill pipeline. V-32 catches the case where the agent worked manually and skipped the pipeline entirely. Defense in depth requires all three layers.

- **Scan all git history instead of since `createdAt`.** Rejected: `implement:` commits cannot exist before the RFC was created. Scanning since `createdAt` is sufficient and faster.

## Risks

- **V-32 false positive rate:** during active implementation, V-32 will warn on every `rfc.validate` run until the stamp is applied. This is expected and safe — the warning message directs the agent to run `rfc.implement.stamp`. Operators running `rfc.validate` during implementation should expect V-32 warnings.
- **V-32 false negative from squash merges:** if implementation commits are squashed into a single commit with a different message (e.g. `feat: implement new feature`), V-32 will not detect them. This is acceptable — V-32 is a safety net, not a hard gate. The plan template step 8 and skill gate 3.11b are the primary defense.
- **Skill gate bypass:** agents that do not use `fo-idea-implement` will not encounter the gate steps. V-32 catches this case, but only if `rfc.validate` is run. CI runs `rfc.validate` on pull requests, providing a third layer.
- **Git history scan performance:** `git log --since="<createdAt>" --oneline` is fast for typical repositories. For repositories with very long histories since the RFC's creation date, performance is still sub-second because `--oneline` only reads commit messages, not diffs.
- **Agent confusion from V-32 warnings:** agents seeing V-32 during implementation might attempt to stamp prematurely. The warning message explicitly says "Run `rfc.implement.stamp` to transition to implemented" — agents should interpret this as a reminder, not an immediate action if implementation is still in progress.
- **ADR V-32 without stamp infrastructure:** ADRs do not have an `adr.implement.stamp` command. The V-32 warning for ADRs directs the agent to manually set `status: implemented` and `implementedAt` per the existing `fo-idea-implement` step 4.10 process.

## Acceptance criteria

- [x] V-32 warning emitted by `rfc.validate` when an RFC with `status: accepted` has `implement: RFC-XXXX` commits in git history since `createdAt` (evidence: packages/forge/os/rfc/handlers/validate-rules.ts:825-844)
- [x] AV-16 warning emitted by `adr.validate` when an ADR with non-`implemented` status (`proposed`, `reviewing`, `accepted`) has `implement: ADR-XXXX` commits in git history since `createdAt` (evidence: packages/forge/os/adr/handlers/validate.ts:365-392)
- [x] V-32/AV-16 does not emit when RFC/ADR status is already `implemented` (evidence: packages/forge/os/rfc/handlers/validate-rules.test.ts:361-378, packages/forge/os/adr/handlers/validate.test.ts:132-149)
- [x] V-32/AV-16 does not emit when no `implement:` commits exist since `createdAt` (evidence: packages/forge/os/rfc/handlers/validate-rules.test.ts:381-393, packages/forge/os/adr/handlers/validate.test.ts:152-165)
- [x] `fo-idea-plan` step 4 includes step 8: "Stamp implemented" as a separate plan step (evidence: packages/forge/skills/fo/fo-idea-plan/SKILL.md:144)
- [x] `fo-idea-implement` step 3.11b verifies RFC `status: implemented`, `implementedAt` set, and `rfc.validate` passing before step 3.12 (report) (evidence: packages/forge/skills/fo/fo-idea-implement/SKILL.md:232-241)
- [x] `fo-idea-implement` step 4.10b verifies ADR `status: implemented`, `implementedAt` set, and `adr.validate` passing before step 4.11 (report) (evidence: packages/forge/skills/fo/fo-idea-implement/SKILL.md:426-435)
- [x] Synced copies in `.agents/skills/` match the forge skill source files (evidence: diff verified — zero differences)
- [x] Unit tests cover V-32 drift detected, no drift, already implemented, no implement commits (evidence: packages/forge/os/rfc/handlers/validate-rules.test.ts:308-401, packages/forge/os/adr/handlers/validate.test.ts:101-175)
- [x] `rfc.validate` passes on this file with zero errors (evidence: rfc.validate --id RFC-0625 --json → status: pass, violations: [])

## Implementation notes for agents

- Agents MAY implement this RFC only after it is accepted.
- Agents MUST add V-32 to `rfc.validate` validation rules and AV-16 to `adr.validate` validation rules.
- Agents MUST add step 3.11b and 4.10b to `fo-idea-implement/SKILL.md` and sync to `.agents/skills/`.
- Agents MUST add step 8 to `fo-idea-plan/SKILL.md` step 4 and sync to `.agents/skills/`.
- Agents MUST NOT make V-32 an error-level rule — it is a warning.
- Agents MUST NOT change `rfc.implement.stamp` or its preconditions — this RFC extends detection, not the stamping mechanism.
- Agents MUST NOT add ADR stamping infrastructure — ADRs remain manually transitioned per the existing process.
- The V-32 git history scan MUST use `--since="<createdAt>"` to limit scope.
- The `implement:` prefix match MUST be on the commit message subject line, not the body. The regex pattern is `^implement: (RFC|ADR)-\d{4}\b`.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
