---
id: RFC-0755
title: "Validate RFC frontmatter YAML parseability in rfc.validate"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
enhancedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0476
  - RFC-0330
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - rfc.validate
    - rfc.implement.stamp
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/forge"
successSignals:
  - "rfc.validate fails with a clear V-RFC-XX violation when an RFC file's frontmatter cannot be parsed as valid YAML."
  - "The violation message includes the file name, line number, and the YAML parser error message."
  - "rfc.implement.stamp no longer fails with a generic 'Could not parse target RFC' — the operator catches the YAML error during rfc.validate first."
nonGoals:
  - Do not add a YAML linter or style checker — only parseability is checked.
  - Do not validate frontmatter field values (that is already covered by existing V-RFC rules).
  - Do not change the RFC-IMP-01 rule ID or violation structure — only augment the message text with parse error details.
---

# RFC-0755: Validate RFC frontmatter YAML parseability in rfc.validate

## Context

During RFC-0752 implementation, `rfc.implement.stamp` failed with `RFC-IMP-01: Could not parse target RFC RFC-0752`. The root cause was unquoted backtick strings in the `successSignals` field of the frontmatter — YAML treats `` ` `` as a reserved character, causing a parse error.

`rfc.validate` was run successfully on the same RFC file earlier in the session — meaning the validate command does not fully parse the frontmatter as YAML, or it catches the error but does not report it as a validation failure.

## Problem

- **Silent YAML parse failures**: `rfc.validate` passes even when the frontmatter YAML is malformed. The error only surfaces later during `rfc.implement.stamp`, which gives a generic "Could not parse" message without the YAML parser's error details.
- **No early feedback**: operators and agents learn about YAML errors at stamping time, not at validation time — wasting a round-trip.
- **Unclear error message**: `rfc.implement.stamp` says "Could not parse" but does not show the YAML parser error (file, line, column, message).

## Decision

`rfc.validate` gains a new validation rule `V-RFC-33` that fully parses each RFC file's frontmatter as YAML and fails if parsing throws. The violation message includes the file name, line, column, and the parser's error message.

Additionally, `rfc.implement.stamp` is updated to include the YAML parser error in its `RFC-IMP-01` violation message when `readAndParseRfc` returns a parse error result.

## Architectural fit

- **RFC-0476 (rfc.implement.stamp)** — the stamp command already calls `readAndParseRfc`, which returns `undefined` on parse failure. This RFC adds the parser error to the violation message.
- **RFC-0330 (rfc.validate rules)** — extends the existing V-RFC rule set with a new rule number.
- **Forge OS module** — both `rfc.validate` and `rfc.implement.stamp` handlers live in `packages/forge/os/rfc/handlers/`.

## Design

### CLI surface

```sh
# No change to interface — rfc.validate already runs all rules
pnpm exec site-kernel run rfc.validate --id RFC-0752

# Now fails if frontmatter YAML is malformed:
# [ERROR] V-RFC-33 · RFC frontmatter YAML parse error in rfc-0752-...md at line 40, column 5:
#   Plain value cannot start with reserved character `
```

### TypeScript contracts

```ts
// New rule ID added to the V-RFC rule set
type RfcValidationRule =
  | "V-RFC-01"
  | "V-RFC-02"
  // ... existing rules through V-32 ...
  | "V-RFC-33"; // Frontmatter YAML parseability

// readAndParseRfc is updated to return parse error details instead of silently returning undefined
type ReadAndParseRfcResult =
  | { fileName: string; parsed: ParsedRfc }
  | { fileName: string; error: string }; // YAML parser error message with line/column

// Updated signature — callers must check which variant they received
async function readAndParseRfc(
  rfcDirPath: string,
  fileName: string,
): Promise<ReadAndParseRfcResult | undefined>; // undefined = file not found
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/os/rfc/frontmatter-io.ts` | `readAndParseRfc` updated to capture and return parse errors instead of silently returning `undefined` on YAML parse failure |
| `packages/forge/os/rfc/handlers/validate-rules.ts` | New `V-RFC-33` rule implementation |
| `packages/forge/os/rfc/handlers/implement-stamp.ts` | `RFC-IMP-01` message includes parse error details when `readAndParseRfc` returns an error result |

### Call sites affected by signature change

`readAndParseRfc` currently returns `Promise<{ fileName, parsed } | undefined>`. The new return type is `Promise<{ fileName, parsed } | { fileName, error } | undefined>`. All callers that check `if (!result)` or `if (result)` must be updated to distinguish between the parse-error variant (`'error' in result`) and the success variant (`'parsed' in result`).

| File | Call sites | Update |
| --- | --- | --- |
| `os/rfc/handlers/validate.ts` | 2 | Check `'parsed' in result` before accessing `result.parsed`; add V-RFC-33 violation on `'error' in result` |
| `os/rfc/handlers/pipeline-status.ts` | 1 | Skip on error variant |
| `os/rfc/handlers/index-graph.ts` | 2 | Skip on error variant |
| `os/rfc/handlers/list-create.ts` | 1 | Skip on error variant |
| `os/rfc/handlers/check.ts` | 1 | Skip on error variant |
| `os/rfc/handlers/lifecycle.ts` | 1 | Skip on error variant |
| `os/rfc/frontmatter-io.ts` | 2 | `getRfcStatusById` and `loadRfcStatusMap` — skip on error variant |
| `os/session/handlers/validate.ts` | 1 | Skip on error variant |
| `os/core/core.module.ts` | 1 | Skip on error variant |
| `os/spec/live-spec-merge.ts` | 1 | Skip on error variant |
| `os/spec/live-spec-validate.ts` | 1 | Skip on error variant |
| `os/rfc/decision-log.ts` | 1 | Skip on error variant |

All 16 call sites must be updated in the same commit. Partial migration would create a broken state where error results are silently skipped.

### Output format

The new violation follows the existing `{ rule, message, severity? }` shape in `--json` output:

```json
{
  "rule": "V-RFC-33",
  "message": "RFC frontmatter YAML parse error in rfc-0752-...md at line 40, column 5: Plain value cannot start with reserved character `",
  "severity": "error"
}
```

### Failure modes

- **YAML parse error** — `rfc.validate` fails with `V-RFC-33` violation including file, line, column, and parser message. Exit code 1.
- **Missing frontmatter delimiters** — existing `parseRfcFile` returns `{ frontmatter: {}, body: source }` when no `---` delimiters are found. This is handled by existing V-13 (missing required sections) and V-06 (owners must be non-empty) — no additional check needed in V-RFC-33.
- **YAML parses to `null`** — `parseRfcFile` already handles this: `YAML.parse(match[1]!) ?? {}` defaults to `{}`. No redundant check needed.

## Rollout

- **Default behavior**: `V-RFC-33` is active immediately for all RFCs. No grace period — YAML parse errors are always bugs.
- **Existing RFCs**: all existing RFCs must pass `V-RFC-33`. If any have YAML issues, they are caught on the next `rfc.validate` run and fixed.
- **Pipeline integration**: `rfc.validate` is already part of the RFC lifecycle. No new pipeline step needed.

## Alternatives considered

- **Pre-commit hook for YAML parsing** — rejected as the primary solution. Hooks are local and can be bypassed. `rfc.validate` is the canonical validation path.
- **Auto-quote frontmatter strings in `rfc.create`** — complementary, not alternative. This prevents future issues, but `V-RFC-33` catches existing ones. Both should be implemented.
- **Change `rfc.implement.stamp` only** — rejected. The stamp is too late in the pipeline. `rfc.validate` runs earlier and more frequently.

## Risks

- **False positives from YAML parser quirks**: the `yaml` package may flag constructs that are technically valid YAML but unusual. False-positive rate is expected to be zero — V-RFC-33 uses the same `yaml` parser that `parseRfcFile` already calls. If a file parses successfully in `readAndParseRfc` today, it will pass V-RFC-33. No suppression mechanism is needed.
- **Existing RFCs with latent YAML issues**: this RFC may surface previously undetected errors. This is a feature, not a risk — but operators should be prepared to fix them.
- **Blast radius of signature change**: 16 call sites across 13 files must be updated in the same commit. Partial migration would create a broken state where error results are silently skipped by callers still checking `if (!result)`.

## Acceptance criteria

- [ ] `rfc.validate` fails with `V-RFC-33` when an RFC file's frontmatter cannot be parsed as YAML
- [ ] The violation message includes file name, line number, column, and parser error text
- [ ] `rfc.implement.stamp` `RFC-IMP-01` violation includes parse error details when applicable
- [ ] `readAndParseRfc` returns parse error information instead of silently returning `undefined` on YAML parse failure
- [ ] All 16 call sites across 13 files are updated to handle the new return type
- [ ] All existing RFCs in `docs/rfcs/` pass `V-RFC-33`
- [ ] Unit test verifies a malformed-YAML RFC file triggers `V-RFC-33`
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT change the YAML parser package (`yaml` is the established parser).
- Agents SHOULD also implement auto-quoting in `rfc.create` as a complementary preventive measure, but that is outside this RFC's scope.
