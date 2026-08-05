---
id: RFC-0695
title: "Add SUPPRESS-VAL-07 warning for titlePattern containing ruleId prefix"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0688
amendedBy: []
related:
  - RFC-0684
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
    - suppressions.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "suppressions.validate warns when titlePattern contains the ruleId prefix (redundant with ruleId matching)"
  - "No default suppression rule in systems/axiom-suppressions.yaml triggers SUPPRESS-VAL-07"
nonGoals:
  - "Does not change the titlePattern matching logic itself — only adds a validation warning"
  - "Does not forbid ruleId prefix in titlePattern — some edge cases may intentionally include it"
  - "Does not add titlePattern to rules that currently use only channelNot or urlPattern"
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

# RFC-0695: Add SUPPRESS-VAL-07 warning for titlePattern containing ruleId prefix

## Context

RFC-0688 added `titlePattern` to the suppression schema and documented that the Axiom Finding `title` field always contains the ruleId as a prefix (e.g. `"runtime-health.console-error: runtime health issue detected"`). The `titlePattern` field matches via substring inclusion: `finding.title.includes(rule.titlePattern)`. Since `ruleId` is already matched exactly in `matchesCondition` (position 0, before any pattern fields), a `titlePattern` that contains the ruleId is redundant — the ruleId match already filters to the same set of findings.

During the RFC-0688 implementation audit (2026-08-05), no default suppression rule in `systems/axiom-suppressions.yaml` currently uses `titlePattern` with a ruleId prefix. However, agents writing new suppression rules may accidentally include the ruleId in `titlePattern` (e.g. `titlePattern: "runtime-health.console-error:"`), which is redundant with the `ruleId` field and makes the rule harder to read.

## Problem

No validation diagnostic warns when `titlePattern` contains the ruleId prefix. This allows redundant patterns that:

1. Make rules harder to read — the ruleId appears twice in the same rule.
2. Create false confidence — the rule author thinks the pattern is more specific than it actually is.
3. Break silently if the ruleId is renamed — the `ruleId` field is updated but the `titlePattern` still contains the old ruleId, and the rule stops matching because `finding.title` no longer contains the old prefix.

## Decision

The `suppressions.validate` command gains a SUPPRESS-VAL-07 warning when a rule's `titlePattern` starts with or contains the rule's `ruleId` value. The warning is non-blocking (severity: warning) and includes a fix hint to remove the ruleId prefix from `titlePattern`.

## Architectural fit

- **RFC-0688 (amended):** This RFC adds a validation diagnostic to the schema introduced by RFC-0688. It does not change the `titlePattern` field, the matching logic, or the `applySuppressions` function.
- **RFC-0684 (suppression layer):** Orthogonal — this is a validation improvement, not a matching logic change.
- **Site OS operator model:** `suppressions.validate` is a workspace-scoped command in `@warpgogol/site-kernel-checks`. The new diagnostic is added to the existing validation loop.

## Design

### CLI surface

No new CLI commands. `suppressions.validate` gains SUPPRESS-VAL-07:

```sh
pnpm exec site-kernel run suppressions.validate --json
```

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/suppressions-validate.ts

// New check added to the validation loop:
function titlePatternContainsRuleId(rule: SuppressionRule): boolean {
  if (!rule.titlePattern || !rule.ruleId) return false;
  return rule.titlePattern.includes(rule.ruleId);
}

// In runSuppressionsValidate, after SUPPRESS-VAL-06:
if (titlePatternContainsRuleId(rule)) {
  diagnostics.push({
    ruleId: "SUPPRESS-VAL-07",
    severity: "warning",
    file: WORKSHOP_SUPPRESSIONS_PATH,
    message: `Rule at index ${i} (ruleId: ${rule.ruleId}) has a titlePattern containing the ruleId "${rule.ruleId}". The ruleId is already matched exactly — titlePattern should match the descriptive part of the title only.`,
    fixHint: `Remove "${rule.ruleId}" from titlePattern and keep only the descriptive text.`,
  });
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/suppressions-validate.ts` | Modified: add SUPPRESS-VAL-07 check after SUPPRESS-VAL-06 loop |
| `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` | Modified: add SUPPRESS-VAL-07 to the string enumeration of diagnostics in the `suppressions.validate` command table entry |
| `packages/os/site-kernel-checks/AGENTS.md` | Modified: document SUPPRESS-VAL-07 in suppressions-validate.ts entry |
| `packages/os/site-kernel-checks/src/tests/suppressions-validate.test.ts` | Modified: add unit test for SUPPRESS-VAL-07 warning |

### Output format

```json
{
  "command": "suppressions.validate",
  "status": "pass",
  "diagnostics": [
    {
      "ruleId": "SUPPRESS-VAL-07",
      "severity": "warning",
      "message": "Rule at index 2 (ruleId: runtime-health.console-error) has a titlePattern containing the ruleId \"runtime-health.console-error\". The ruleId is already matched exactly — titlePattern should match the descriptive part of the title only.",
      "fixHint": "Remove \"runtime-health.console-error\" from titlePattern and keep only the descriptive text."
    }
  ],
  "summary": { "error": 0, "warning": 1, "info": 0 }
}
```

### Failure modes

- **SUPPRESS-VAL-07 (warning, not error):** A rule with `titlePattern` containing the ruleId does not fail validation. It produces a warning because the rule still functions — the pattern is redundant, not broken.
- **Edge case — ruleId as substring of descriptive text:** If a ruleId like `"error"` appears in a descriptive `titlePattern` like `"error handling guide"`, the warning fires. This is a false positive, but the ruleId `"error"` is unlikely (ruleIds use dotted names like `runtime-health.console-error`). If it occurs, the rule author can ignore the warning or rephrase the pattern.

## Rollout

- **Default behavior on introduction:** `suppressions.validate` emits SUPPRESS-VAL-07 for rules where `titlePattern` contains the `ruleId` value. Existing rules are unaffected — no default rule triggers this warning.
- **Backward compatibility:** No schema change. Existing rules with `titlePattern` containing ruleId continue to function. They receive a warning.
- **No migration required:** No default rule needs updating.
- **Pipeline integration:** `suppressions.validate` in `mission.validate` pipeline will emit warnings for affected rules.

## Alternatives considered

1. **Error (not warning) for titlePattern containing ruleId.** Rejected — the rule still functions correctly. The redundancy is a style issue, not a correctness issue. A warning is sufficient.

2. **Auto-strip ruleId from titlePattern during validation.** Rejected — silently modifying user-authored rules is surprising and destructive. A warning with a fix hint is the right level of intervention.

3. **Check only `startsWith` (not `includes`).** Rejected — the ruleId may appear anywhere in the titlePattern (e.g. `titlePattern: "guide for runtime-health.console-error detection"`). `includes` catches all positions. The false positive risk is low because ruleIds use dotted names unlikely to appear in descriptive text.

## Risks

- **False positives for short ruleIds:** A ruleId like `"seo-runtime"` could appear in a descriptive `titlePattern` like `"seo-runtime analysis guide"`. Mitigation: ruleIds in the Axiom ecosystem use dotted names (`seo-runtime.canonical-mismatch`), making accidental substring matches unlikely.
- **Agent confusion:** Agents may not understand why the warning fires. Mitigation: the `fixHint` explains the issue and suggests the fix.

## Acceptance criteria

- [x] SUPPRESS-VAL-07 warning emitted by `suppressions.validate` when `titlePattern` contains `ruleId` (evidence: `packages/os/site-kernel-checks/src/suppressions-validate.ts:195-207`, test in `suppressions-validate.test.ts:217-230`)
- [x] Warning severity is `warning` (not `error`) (evidence: `packages/os/site-kernel-checks/src/suppressions-validate.ts:201`)
- [x] `fixHint` explains the redundancy and suggests removing the ruleId from `titlePattern` (evidence: `packages/os/site-kernel-checks/src/suppressions-validate.ts:204`)
- [x] No default rule in `systems/axiom-suppressions.yaml` triggers SUPPRESS-VAL-07 (evidence: `suppressions.validate --json` → status: pass, 0 warnings)
- [x] `packages/os/site-kernel-checks/AGENTS.md` documents SUPPRESS-VAL-07 (evidence: `packages/os/site-kernel-checks/AGENTS.md:28`)
- [x] `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` command table description includes SUPPRESS-VAL-07 (evidence: `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts:439-440`)
- [x] Unit test added in `suppressions-validate.test.ts` for SUPPRESS-VAL-07 warning (evidence: `packages/os/site-kernel-checks/src/tests/suppressions-validate.test.ts:217-245`)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0695 --json` → status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST use `includes` (not `startsWith`) for the ruleId-in-titlePattern check to catch all positions.
- Agents MUST NOT make this an error — it is a warning.
- Agents MUST update the command table description in `infra-contracts.ts` to include SUPPRESS-VAL-07 in the string enumeration.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
