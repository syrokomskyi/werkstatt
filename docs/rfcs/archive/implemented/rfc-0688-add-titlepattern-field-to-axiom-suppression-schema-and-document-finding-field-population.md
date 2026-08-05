---
id: RFC-0688
title: "Add titlePattern field to Axiom suppression schema and document Finding field population"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
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
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt: 2026-08-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0695
related:
  - RFC-0684
  - RFC-0629
  - RFC-0630
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-49
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
  - "suppressions.validate warns when suppression rules use messagePattern or descriptionPattern without a fallback titlePattern"
  - "Suppression rules using titlePattern successfully match Axiom findings by their populated title field"
  - "RFC-0684 documentation updated to clarify which Finding fields are populated vs empty"
nonGoals:
  - "Does not change the Axiom Finding data model — only documents it"
  - "Does not remove messagePattern or descriptionPattern from the schema — keeps them for forward compatibility if Axiom populates them in future versions"
  - "Does not change suppression matching priority order"
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

# RFC-0688: Add titlePattern field to Axiom suppression schema and document Finding field population

## Context

RFC-0684 introduced the Axiom finding suppression layer with a schema supporting `messagePattern` and `descriptionPattern` fields for substring matching against Finding `message` and `description` fields. During the first real deployment of warpgogol-com (mission m000028, 2026-08-05), two of five default suppression rules failed to match because the Axiom Finding data model does not have `message` or `description` fields at all. The `Finding` type (defined in `@syrokomskyi/axiom-study/src/contracts.ts`) has: `findingId`, `semanticFingerprint`, `methodologyId`, `ruleId`, `affectedSubjectId`, `title`, `severity`, `evidence`, `uncertainty`, `extension`. The `extension` field is a freeform `Record<string, unknown>` populated by Axiom with `{ observationId, predicate }` — it does not contain `message` or `description` keys. The `extractMessage` and `extractDescription` helpers in `suppressions-config.ts` read from `finding.extension.message` and `finding.extension.description`, which are always `undefined`, causing the pattern match to fail silently.

The populated fields on an Axiom Finding are:

| Field | Populated? | Example |
| --- | --- | --- |
| `ruleId` | yes | `runtime-health.console-error` |
| `affectedSubjectId` | yes | `https://dev.warpgogol.com/uk/sait/perukar/` |
| `title` | yes | `runtime-health.console-error: runtime health issue detected` |
| `severity` | yes | `low` |
| `evidence[]` | yes | references to evidence artifact files |
| `extension` | yes | `{ observationId, predicate }` |
| `message` | **does not exist** | — |
| `description` | **does not exist** | — |

The `title` field is always populated (Zod schema enforces `z.string().min(1)`) and contains the ruleId plus a short description, making it the most reliable text field for pattern-based suppression matching.

## Problem

Two concrete gaps in RFC-0684:

1. **`messagePattern` and `descriptionPattern` are non-functional.** Suppression rules that rely on these fields silently fail to match any finding because the `Finding` type does not have `message` or `description` fields. The `extractMessage`/`extractDescription` helpers in `suppressions-config.ts` read from `finding.extension.message` / `finding.extension.description`, which are always `undefined`. The original default rules for Category C (browser deprecation, `messagePattern: "Deprecated API for given entry type"`) and Category D (render-blocking CSS, `descriptionPattern: "preload"`) in `systems/axiom-suppressions.yaml` never fired. This was discovered when 560 findings from these categories remained active after the suppression layer was applied. The default rules have since been fixed by replacing `messagePattern` with `channelNot: main` (Category C) and `descriptionPattern` with `urlPattern: "\\.css$"` (Category D) — see Rollout.

2. **No documented Finding field population contract.** Agents writing suppression rules have no way to know which fields are populated vs empty. The schema in `suppressions-config.ts` defines `messagePattern` and `descriptionPattern` as optional string fields without documenting that they match against always-empty fields.

## Decision

The suppression schema gains a `titlePattern` field that matches against the always-populated `title` field of Axiom findings. The `suppressions.validate` command emits a warning (SUPPRESS-VAL-06) when a rule uses `messagePattern` or `descriptionPattern` without a `titlePattern` fallback, documenting that these fields are typically empty. The RFC-0684 AGENTS.md section and suppression schema documentation are updated to clarify which Finding fields are populated.

## Architectural fit

- **DNA-49 (Fleet propagation):** Suppression rules that silently fail to match cause the Axiom gate to block on false positives, undermining fleet propagation. `titlePattern` makes pattern-based suppression functional, keeping the gate meaningful.
- **RFC-0684:** This RFC amends the suppression schema without changing the matching logic, file structure, or pipeline integration. It adds one field and one validation diagnostic.
- **RFC-0667 (Boundary adapter):** The Finding data model documentation lives in the same `axiom-adapter.ts` boundary layer. No external tool changes.

## Design

### CLI surface

No new CLI commands. `suppressions.validate` gains a new diagnostic (SUPPRESS-VAL-06):

```sh
pnpm exec site-kernel run suppressions.validate --json
```

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/suppressions-config.ts

export const suppressionRuleSchema = z.object({
  ruleId: z.string().min(1),
  category: z.string().min(1),
  channel: z.enum(["dev", "alt", "main"]).optional(),
  channelNot: z.enum(["dev", "alt", "main"]).optional(),
  contentType: z.array(z.string()).optional(),
  urlPattern: z.string().optional(),
  titlePattern: z.string().optional(),       // NEW — matches against finding.title
  messagePattern: z.string().optional(),      // KEPT for forward compatibility
  descriptionPattern: z.string().optional(),  // KEPT for forward compatibility
  reason: z.string().min(1),
});
```

Matching priority (updated, inserting `titlePattern` before `messagePattern`):

1. `channelNot` — suppress if `context.channel !== channelNot`
2. `channel` — suppress if `context.channel === channel`
3. `contentType` — suppress if URL ends with one of the listed extensions
4. `urlPattern` — suppress if URL matches the regex
5. `titlePattern` — suppress if `finding.title` contains the pattern (substring match)
6. `messagePattern` — suppress if `finding.extension.message` contains the pattern (always `undefined` — field does not exist on `Finding`)
7. `descriptionPattern` — suppress if `finding.extension.description` contains the pattern (always `undefined` — field does not exist on `Finding`)

The `extractMessage` and `extractDescription` helpers in `suppressions-config.ts` are kept as-is. They read from `finding.extension.message` / `finding.extension.description` and return `undefined` when the keys are absent. This is the correct behavior: the match fails, the rule does not fire, and SUPPRESS-VAL-06 warns the rule author to switch to `titlePattern`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/suppressions-config.ts` | Modified: add `titlePattern` to schema, add `titlePattern` matching in `matchesCondition` (position 5, before `messagePattern`) |
| `packages/os/site-kernel-checks/src/suppressions-validate.ts` | Modified: add SUPPRESS-VAL-06 warning for rules using `messagePattern`/`descriptionPattern` without `titlePattern`; add `titlePattern` to `ruleSignature` for conflict detection (SUPPRESS-VAL-03); extend `isBroadPattern` check to `titlePattern` (SUPPRESS-VAL-04) |
| `systems/axiom-suppressions.yaml` | Already modified: default rules for Categories C and D were fixed by replacing `messagePattern` with `channelNot: main` and `descriptionPattern` with `urlPattern: "\\.css$"` (not `titlePattern`). No default rule currently uses `titlePattern` — it is primarily for per-site rules where text-based matching is needed |
| `packages/os/site-kernel-checks/AGENTS.md` | Modified: document Finding field population and recommend `titlePattern` over `messagePattern`/`descriptionPattern` |
| `packages/os/site-kernel-checks/src/tests/suppressions-config.test.ts` | Modified: add test for `titlePattern` matching |
| `packages/os/site-kernel-checks/src/tests/suppressions-validate.test.ts` | Modified: add test for SUPPRESS-VAL-06 warning |

### Output format

`suppressions.validate --json` with SUPPRESS-VAL-06:

```json
{
  "command": "suppressions.validate",
  "status": "warn",
  "diagnostics": [
    {
      "ruleId": "SUPPRESS-VAL-06",
      "severity": "warning",
      "file": "systems/axiom-suppressions.yaml",
      "message": "Rule at index 0 (ruleId: runtime-health.console-error) uses messagePattern without titlePattern — messagePattern matches against a non-existent Finding field",
      "fixHint": "Replace messagePattern with titlePattern, or add titlePattern as a fallback"
    }
  ],
  "summary": { "error": 0, "warning": 1, "info": 0 }
}
```

### Failure modes

- **SUPPRESS-VAL-06 (warning, not error):** A rule using `messagePattern` or `descriptionPattern` without `titlePattern` does not fail validation. It produces a warning because the rule may still work if a future Axiom version populates these fields.
- **Default rules already fixed:** The default rules in `systems/axiom-suppressions.yaml` for Categories C and D were already fixed by replacing `messagePattern` with `channelNot: main` (Category C) and `descriptionPattern` with `urlPattern: "\\.css$"` (Category D). No default rule currently uses `titlePattern` — it is primarily for per-site rules where text-based matching against the `title` field is needed. Existing per-site rules that use `messagePattern` continue to function (they just never match) and receive a SUPPRESS-VAL-06 warning.

## Rollout

- **Default behavior on introduction:** `titlePattern` is added to the schema. `applySuppressions` checks `titlePattern` before `messagePattern`/`descriptionPattern`. Default rules were already fixed by other means (`channelNot`/`urlPattern`), not by `titlePattern`.
- **Backward compatibility:** `messagePattern` and `descriptionPattern` remain in the schema. Existing rules that use them are not broken — they still compile and run, they just receive a SUPPRESS-VAL-06 warning.
- **No migration required:** Sites with per-site suppression files using `messagePattern` do not need to change anything immediately. The warning guides them to switch to `titlePattern`.
- **Pipeline integration:** `suppressions.validate` in `mission.validate` pipeline will emit warnings for rules using `messagePattern`/`descriptionPattern` without `titlePattern`.
- **`ruleSignature` update:** The `ruleSignature` function in `suppressions-validate.ts` is updated to include `titlePattern` in the conflict-detection signature (SUPPRESS-VAL-03). Two rules that differ only in `titlePattern` are now correctly detected as distinct (not conflicting).
- **`isBroadPattern` extension:** The broad-pattern check (SUPPRESS-VAL-04) is extended to `titlePattern`. A `titlePattern` that is a single word or shorter than 10 characters triggers a broad-pattern warning, same as `messagePattern` and `descriptionPattern`.

## Alternatives considered

1. **Remove `messagePattern` and `descriptionPattern` from the schema.** Rejected — a future Axiom version may populate these fields. Removing them would break forward compatibility and existing per-site rules. Keeping them with a warning is safer.

2. **Auto-fallback: treat `messagePattern` as `titlePattern` when `message` is empty.** Rejected — this silently changes the semantics of `messagePattern`. A rule author who writes `messagePattern: "deprecated"` expects it to match the message field, not the title field. Explicit `titlePattern` is clearer.

3. **Document the empty fields in AGENTS.md only, without adding `titlePattern`.** Rejected — documentation alone does not fix the non-functional default rules. Agents will still write `messagePattern` rules that silently fail. A schema-level `titlePattern` field with a validation warning is actionable.

## Risks

- **Title format drift:** If Axiom changes the `title` field format (e.g. removes the ruleId prefix), `titlePattern` rules may stop matching. Mitigation: `suppressions.validate` already warns on unknown ruleIds; `titlePattern` should match on the descriptive part of the title, not the ruleId prefix.
- **Over-suppression via broad titlePattern:** A pattern like `titlePattern: "error"` could match many findings. Mitigation: `suppressions.validate` warns on broad patterns (SUPPRESS-VAL-04) — this check applies to `titlePattern` as well.
- **Agent confusion:** Agents may not understand the difference between `titlePattern` and `messagePattern`. Mitigation: SUPPRESS-VAL-06 warning message explains the issue and suggests the fix.

## Acceptance criteria

- [x] `titlePattern` field added to `suppressionRuleSchema` in `suppressions-config.ts` (evidence: `packages/os/site-kernel-checks/src/suppressions-config.ts:29`)
- [x] `applySuppressions` checks `titlePattern` (position 5, before `messagePattern`) (evidence: `packages/os/site-kernel-checks/src/suppressions-config.ts:119-122`)
- [x] SUPPRESS-VAL-06 warning emitted by `suppressions.validate` for rules using `messagePattern`/`descriptionPattern` without `titlePattern` (evidence: `packages/os/site-kernel-checks/src/suppressions-validate.ts:179-192`, test in `suppressions-validate.test.ts:142-155`)
- [x] Default rules in `systems/axiom-suppressions.yaml` no longer use `messagePattern` or `descriptionPattern` (already done — Categories C and D use `channelNot`/`urlPattern`) (evidence: `suppressions.validate --json` passes with 0 warnings on 7 rules)
- [x] `ruleSignature` in `suppressions-validate.ts` includes `titlePattern` in conflict-detection signature (evidence: `packages/os/site-kernel-checks/src/suppressions-validate.ts:42`)
- [x] `isBroadPattern` check in `suppressions-validate.ts` extended to `titlePattern` (SUPPRESS-VAL-04) (evidence: `packages/os/site-kernel-checks/src/suppressions-validate.ts:169-176`, test in `suppressions-validate.test.ts:202-214`)
- [x] `packages/os/site-kernel-checks/AGENTS.md` documents Finding field population (which fields exist vs do not exist) (evidence: `packages/os/site-kernel-checks/AGENTS.md:27`)
- [x] Unit tests added for `titlePattern` matching in `suppressions-config.test.ts` and SUPPRESS-VAL-06 warning in `suppressions-validate.test.ts` (evidence: `suppressions-config.test.ts:340-390`, `suppressions-validate.test.ts:142-214`)
- [x] `suppressions.validate` passes on `systems/axiom-suppressions.yaml` with zero warnings (no SUPPRESS-VAL-06 since no default rule uses `messagePattern`/`descriptionPattern`) (evidence: `suppressions.validate --json` → status: pass, 0 warnings)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0688 --json` → status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT remove `messagePattern` or `descriptionPattern` from the schema — they are kept for forward compatibility.
- Agents MUST ensure default suppression rules in `systems/axiom-suppressions.yaml` do not use `messagePattern` or `descriptionPattern` (Categories C and D were already fixed with `channelNot`/`urlPattern`). If a future default rule needs text-based matching, use `titlePattern`.
- Agents MUST document the Finding field population contract in `packages/os/site-kernel-checks/AGENTS.md` so future rule authors know which fields to match against.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
