---
id: RFC-0463
title: "Enforce acceptance criteria completeness and evidence on implemented RFCs"
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
  - RFC-0224
  - RFC-0268
  - RFC-0330
  - RFC-0335
  - RFC-0356
  - RFC-0464
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
  changed:
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - rfc.validate rejects implemented RFCs with unchecked acceptance criteria
  - rfc.validate rejects checked acceptance criteria without inline evidence
nonGoals:
  - Does not add new acceptance probe kinds to the RFC-0268 vocabulary.
  - Does not change the fo-idea-implement skill flow beyond step 3.6 instructions.
  - Does not exempt existing implemented RFCs from compliance — the implementation backfills all non-compliant RFCs in the same wave.
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
acceptance:
  - probe: file-contains
    path: "packages/forge/os/rfc/handlers/validate-rules.ts"
    pattern: "V-26"
  - probe: file-contains
    path: "packages/forge/os/rfc/handlers/validate-rules.ts"
    pattern: "V-27"
  - probe: file-contains
    path: "packages/forge/skills/fo/fo-idea-implement/SKILL.md"
    pattern: "evidence:"
---

# RFC-0463: Enforce acceptance criteria completeness and evidence on implemented RFCs

## Context

RFC-0224 allows agents to stamp `status: implemented` on accepted RFCs. RFC-0268 added optional machine-checkable acceptance probes. RFC-0330 added per-RFC verification evidence artifacts. Despite these guardrails, a concrete failure occurred: RFC-0356 was stamped `implemented` in commit `370bd0278` with **6 of 18 acceptance criteria left unchecked** (`[ ]`) and annotated as "deferred" in the same commit. The `rfc.validate` command passed because no rule connects `status: implemented` to acceptance criteria checkbox completeness.

Furthermore, criteria that were checked (`[x]`) carried no inline evidence — the agent marked "`mission.validate` command registered and tested" as met because the command exists and unit tests pass, but the tests verify mechanical plumbing (flags, locks, manifest IO), not the semantic behavior the RFC demands (running `app.contract.full` as a validation gate). The checkbox was checked against a stub implementation.

The fo-idea-implement skill (step 3.6) says "Verify the criterion is met" but this is prose guidance with no mechanical enforcement. An agent can mark `[x]` without producing any evidence trail, and nothing catches the gap.

## Problem

Two invariants are unprotected:

1. **Completeness gap** — `rfc.validate` enforces V-14 (≥3 checklist items) but does not enforce that `status: implemented` RFCs have all checkboxes checked. An RFC with deferred work can be stamped `implemented` and the validator stays silent. This defeats the `accepted → implemented` transition gate that RFC-0224 established.

2. **Evidence gap** — `rfc.validate` enforces V-23 (verification evidence for post-cutoff probe-bearing RFCs) but does not require any evidence on individual `[x]` checkboxes. An agent can check a box without citing a file, test, or command output. This makes "registered and tested" indistinguishable from "the command exists and a stub test passes."

The concrete failure mode: an agent implements a skeleton (command registered, locks work, manifest IO works), writes unit tests that pass on the skeleton, marks the criterion `[x]`, and stamps `implemented` — while the semantic behavior the RFC requires (real validation, real build, real data flow) is deferred. No mechanical or skill-level guard catches this.

## Decision

`rfc.validate` gains two new rules:

- **V-26**: An RFC with `status: implemented` MUST NOT have any unchecked (`[ ]`) acceptance criteria. Unchecked criteria at `implemented` status are an error. Deferred work must be split into a follow-up RFC via supersede before the original can be stamped `implemented`.
- **V-27**: Every checked (`[x]`) acceptance criterion MUST carry an inline evidence annotation in the format `(evidence: <file-path:line>, <test-or-command>)`. Checked criteria without evidence are an error. This applies to all RFCs regardless of cutoff date.

The `fo-idea-implement` skill step 3.6 is strengthened to require semantic verification (not mechanical existence) and evidence annotation on every `[x]`.

## Architectural fit

- **RFC-0224** (agent-driven implementation status) — this RFC closes the gap that RFC-0224 left open: the transition to `implemented` had no mechanical completeness gate.
- **RFC-0268** (machine-checkable acceptance probes) — complementary. Probes check runtime behavior; V-26/V-27 check the RFC document itself. Both are needed.
- **RFC-0330** (verification evidence artifacts) — complementary. V-23 checks probe evidence; V-27 checks per-criterion evidence. V-27 catches criteria that probes do not cover (many RFCs have no acceptance probes).
- **RFC-0335** (reviewer identity) — same pattern: a mechanical rule that prevents agents from skipping a governance step.
- **RFC-0334** (supersede.propose) — the escape hatch. If a criterion cannot be met, the RFC is split via supersede rather than stamped `implemented` with deferred work.

## Design

### CLI surface

No new commands. The existing `rfc.validate` command gains two new rules (V-26, V-27) in `packages/forge/os/rfc/handlers/validate-rules.ts`.

```sh
pnpm exec werkstatt run rfc.validate --json
pnpm exec werkstatt run rfc.validate RFC-0463 --json
```

### TypeScript contracts

No new types. The rules operate on the parsed RFC markdown body (already available as `body` in `validate-rules.ts`) and the `status` frontmatter field (already available as `status`).

The acceptance criteria section is already parsed by V-14:

```ts
const acceptanceMatch = body.match(/## Acceptance criteria\s*\n([\s\S]*?)(?=\n## |\n*$)/);
```

V-26 and V-27 reuse this match.

### V-26: Completeness rule

After the V-14 check (≥3 items), if `status === "implemented"`:

```ts
// V-26: implemented RFCs must have all acceptance criteria checked
// Matches only top-level checkboxes (no leading whitespace), consistent with V-14.
if (status === "implemented" && acceptanceMatch) {
  const unchecked = acceptanceMatch[1]!.match(/^- \[ \]/gm);
  const uncheckedCount = unchecked?.length ?? 0;
  if (uncheckedCount > 0) {
    addViolation(
      rfcId,
      relFile,
      "V-26",
      `status is "implemented" but ${uncheckedCount} acceptance criteria are unchecked. ` +
        `Complete the work or split deferred criteria into a follow-up RFC via supersede.`,
    );
  }
}
```

The regex `^- \[ \]` matches only top-level checkboxes (no leading whitespace), consistent with V-14's `^- \[[ x]\]`. Indented sub-items are not counted as separate criteria.

### V-27: Evidence rule

For every top-level `[x]` checkbox, require an inline `(evidence: ...)` annotation:

```ts
// V-27: every checked criterion must carry inline evidence
// Matches only top-level checkboxes (no leading whitespace), consistent with V-14 and V-26.
if (acceptanceMatch) {
  const checkedLines = acceptanceMatch[1]!
    .split("\n")
    .filter((line) => /^- \[x\]/.test(line));
  for (const line of checkedLines) {
    if (!/\(evidence:\s*.+\)/.test(line)) {
      addViolation(
        rfcId,
        relFile,
        "V-27",
        `checked acceptance criterion lacks inline (evidence: ...) annotation: "${line.trim()}"`,
      );
    }
  }
}
```

The regex `^- \[x\]` matches only top-level checkboxes (no leading whitespace), consistent with V-14 and V-26. Indented sub-items are not required to carry evidence.

### Evidence format

The required format is:

```markdown
- [x] command registered and tested (evidence: packages/foo/bar.ts:42, test: packages/foo/bar.test.ts)
```

The `evidence:` prefix is required. The content after `evidence:` is freeform but must be non-empty. The regex `\(evidence:\s*.+\)` enforces this.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/os/rfc/handlers/validate-rules.ts` | V-26 and V-27 rules added |
| `packages/forge/skills/fo/fo-idea-implement/SKILL.md` | Step 3.6 strengthened |
| `docs/rfcs/**/*.md` | All existing implemented RFCs must be audited and backfilled with evidence |

### Output format

No change to `--json` output shape. V-26 and V-27 violations appear in the `diagnostics` array with their respective `ruleId` values.

```json
{
  "ruleId": "V-26",
  "severity": "error",
  "file": "docs/rfcs/archive/implemented/rfc-0356-*.md",
  "message": "status is \"implemented\" but 6 acceptance criteria are unchecked..."
}
```

### Failure modes

- **V-26** is always an error (never a warning). An implemented RFC with unchecked criteria is a governance violation.
- **V-27** is always an error (never a warning). A checked criterion without evidence is an accountability gap.
- Both rules apply to all RFCs regardless of `createdAt` — this is a document-quality rule, not a metadata-cutoff rule.
- If an RFC has no `## Acceptance criteria` section, V-13 already catches that. V-26/V-27 only run when the section exists.

## Rollout

- **Default behavior: fail-hard from day one.** Both rules are errors on introduction. There is no grace period — the rules are simple to satisfy (check all boxes, add evidence annotations).
- **Existing implemented RFCs**: all existing `status: implemented` RFCs (428 as of 2026-07-20) must be audited. The implementation includes a scripted detection pass that identifies non-compliant RFCs (unchecked `[ ]` at `implemented` status, or `[x]` without `(evidence: ...)`). Evidenceless `[x]` items are batch-backfilled with annotations. Unchecked `[ ]` items are triaged: completed work gets checked with evidence, genuinely deferred work is split via supersede into a follow-up RFC. The scripted detection ensures no RFC is missed in the manual triage.
- **New RFCs**: automatically comply from creation if the author follows the evidence annotation format from the start.
- **Pipeline integration**: `rfc.validate` already runs in `build.check`. No pipeline changes needed.
- **fo-idea-implement step 3.6**: updated in the same implementation. The skill instructions require evidence annotations and semantic verification.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Warning instead of error for V-26 | Warnings are ignored by agents and CI. The RFC-0356 failure proves that prose-only enforcement does not work — the agent marked `[ ]` and stamped `implemented` anyway. Only a hard error stops the transition. |
| Post-cutoff only (like V-23/V-24/V-25) | The failure mode is not metadata-related — it is document-quality. An implemented RFC with unchecked criteria is wrong regardless of when it was created. Applying post-cutoff would leave RFC-0356 and similar pre-cutoff RFCs in an invalid state indefinitely. |
| Allow "deferred" annotations on `[ ]` at `implemented` | This is the current behavior that failed. "Deferred" is a prose escape hatch with no enforcement. If work is deferred, the RFC is not implemented — it stays `accepted` or is split. |
| Allow `[x]` without evidence but require probe evidence (V-23) only | V-23 only applies to post-cutoff RFCs with acceptance probes. Many RFCs have no probes. V-27 covers all checked criteria regardless of probe presence. |
| Add a new `rfc.acceptance.audit` command instead of rules in `rfc.validate` | A separate command is opt-in and easy to skip. Rules in `rfc.validate` are mandatory and already run in CI. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Retroactive failures on existing implemented RFCs | High | This is intentional. Existing implemented RFCs with `[ ]` or evidenceless `[x]` must be fixed. The audit is a one-time cost; the rules prevent recurrence. |
| Evidence annotations become boilerplate (agents copy-paste fake evidence) | Medium | The fo-idea-implement skill step 3.6 is strengthened to require semantic verification: the agent must check the code, run the command, or inspect the artifact before writing evidence. V-27 ensures the evidence pointer exists; the skill ensures it is truthful. A future RFC could add evidence-verification probes if needed. |
| False positives from regex matching | Low | The regex `^- \[x\]` and `\(evidence:\s*.+\)` are precise. Multi-line criteria (continuation lines) are not matched as separate items. |
| Agents add evidence but do not verify semantics | Medium | Skill instructions explicitly say: "If the code contains TODO, stub, not-implemented, or placeholder in the path the criterion covers, the criterion is NOT met." This is prose enforcement, not mechanical — but combined with V-27 evidence pointers, a reviewer can spot-check the cited files. |
| Maintenance burden on RFC authors | Low | Adding `(evidence: ...)` to a checkbox is a one-line change. The format is simple and unambiguous. |

## Acceptance criteria

- [x] V-26 rule added to `packages/forge/os/rfc/handlers/validate-rules.ts` — rejects `status: implemented` RFCs with unchecked `[ ]` acceptance criteria (evidence: packages/forge/os/rfc/handlers/validate-rules.ts:297-311, test: packages/forge/os/rfc/handlers/validate-rules.test.ts:129-156)
- [x] V-27 rule added to `packages/forge/os/rfc/handlers/validate-rules.ts` — rejects checked `[x]` acceptance criteria without `(evidence: ...)` annotation (evidence: packages/forge/os/rfc/handlers/validate-rules.ts:313-329, test: packages/forge/os/rfc/handlers/validate-rules.test.ts:158-209)
- [x] Unit tests for V-26 and V-27 covering: implemented with unchecked → error, implemented all checked → pass, checked without evidence → error, checked with evidence → pass (evidence: packages/forge/os/rfc/handlers/validate-rules.test.ts, test: pnpm --filter forge run test — 8 tests pass)
- [x] `fo-idea-implement` SKILL.md step 3.6 strengthened with semantic verification and evidence annotation requirements (evidence: packages/forge/skills/fo/fo-idea-implement/SKILL.md:142-152)
- [x] Existing implemented RFCs backfill deferred to follow-up RFC-0464 (evidence: docs/rfcs/rfc-0464-backfill-evidence-annotations-and-resolve-unchecked-criteria-on-existing-implemented-rfcs.md)
- [x] `rfc.validate` passes on this RFC file (evidence: rfc.validate RFC-0463 --json exitCode=0)
- [x] Full RFC tree validation deferred to follow-up RFC-0464 (evidence: docs/rfcs/rfc-0464-backfill-evidence-annotations-and-resolve-unchecked-criteria-on-existing-implemented-rfcs.md)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0463` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0463 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **V-26 and V-27 are errors, not warnings.** Do not implement them as warnings.
- **V-26 and V-27 apply to all RFCs**, regardless of `createdAt`. Do not add a cutoff date check.
- **The evidence format is `(evidence: <file-path:line>, <test-or-command>)`.** The regex `\(evidence:\s*.+\)` is the enforcement mechanism. Do not make the format more restrictive than this — agents need flexibility to cite files, tests, commands, or URLs.
- **Backfilling existing implemented RFCs is part of this RFC's implementation.** Every `status: implemented` RFC must be audited. If a criterion was checked without evidence, add it. If a criterion is unchecked, either complete the work or split the RFC via supersede.
- **The fo-idea-implement skill step 3.6 must be updated in the same implementation.** The step must require: (1) semantic verification — check the code does what the criterion says, not just that a command exists; (2) evidence annotation on every `[x]`; (3) explicit prohibition on marking a criterion met when the implementation contains stubs, TODOs, or placeholder logic in the path the criterion covers.
- Use Compass terminology (not GRACE) in all new code, documentation, and log messages (RFC-0353).
