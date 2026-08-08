---
rfcId: RFC-0755
auditId: AUDIT-RFC-0755-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0755

## Verdict: Needs revision

The RFC correctly identifies a real problem (silent YAML parse failures in `readAndParseRfc`), but proposes a rule number that is already taken (V-RFC-30 ≡ breaksC field consistency, RFC-0480), underestimates the blast radius of the `readAndParseRfc` signature change (~16 call sites across 13 files vs. 3 files listed), and contains a contradiction between a non-goal and the decision.

## Mechanical validation (rfc.validate)

Pass — 0 violations. `rfc.validate --id RFC-0755 --json` exits 0.

## Axis A — Structural completeness

- **Rule number conflict**: The RFC proposes `V-RFC-30` (line 59, 90), but V-30 is already assigned to "breaksC field consistency (RFC-0480)" at `packages/forge/os/rfc/handlers/validate-rules.ts:812`. The highest existing rule is V-32 (RFC-0625). The RFC should propose **V-RFC-33**.

- **Non-goal contradicts decision**: `nonGoals` line 40 says "Do not change the rfc.implement.stamp error message format." But the Decision (line 61) says "rfc.implement.stamp is updated to include the YAML parser error in its RFC-IMP-01 violation message" and acceptance criterion 3 (line 144) says "rfc.implement.stamp RFC-IMP-01 violation includes parse error details when applicable." Adding parse error details IS a change to the message format. Either remove the non-goal or clarify what "format" means (structure vs. content).

- **Missing output format documentation**: The audit template asks for `--json` shape documentation. The RFC doesn't document the new violation's shape in the `--json` output. This is minor — the violation follows the existing `{ rule, message, severity? }` pattern — but should be stated explicitly.

## Axis B — DNA alignment

No issues. `satisfies: []` is correct for `kind: command` (RFC-0331 only requires `--satisfies` for architecture/contract RFCs). `related: [RFC-0476, RFC-0330]` are both relevant — RFC-0476 established `rfc.implement.stamp`, RFC-0330 established the V-RFC rule set.

## Axis C — Ecosystem fit

- **`commands.changed` is incomplete**: The RFC changes both `rfc.validate` (new validation rule) and `rfc.implement.stamp` (RFC-IMP-01 message update), but `commands.changed` (line 28) only lists `rfc.validate`. `rfc.implement.stamp` must also be listed. This will cause `command.manifest.generate` to produce a stale manifest.

- **File system responsibilities table is incomplete**: The table (lines 112-116) lists 3 files: `frontmatter-io.ts`, `validate-rules.ts`, `implement-stamp.ts`. But the proposed `readAndParseRfc` signature change affects at least 13 additional files with ~16 call sites:
  - `os/rfc/handlers/validate.ts` (2 calls)
  - `os/rfc/handlers/pipeline-status.ts` (1 call)
  - `os/rfc/handlers/index-graph.ts` (2 calls)
  - `os/rfc/handlers/list-create.ts` (1 call)
  - `os/rfc/handlers/check.ts` (1 call)
  - `os/rfc/handlers/lifecycle.ts` (1 call)
  - `os/rfc/frontmatter-io.ts` (2 calls: `getRfcStatusById`, `loadRfcStatusMap`)
  - `os/session/handlers/validate.ts` (1 call)
  - `os/core/core.module.ts` (1 call)
  - `os/spec/live-spec-merge.ts` (1 call)
  - `os/spec/live-spec-validate.ts` (1 call)
  - `os/rfc/decision-log.ts` (1 call)

  All callers that check `if (!result)` or `if (result)` must be updated to `if ('error' in result)` or `if ('parsed' in result)`.

## Axis D — Forward-only compliance

No issues. The RFC does not propose compatibility shims or dual-paths. The signature change is a direct replacement, which is forward-only compliant. However, the RFC must update all call sites in the same commit — partial migration would create a broken state.

## Axis E — Agent-facing policy

No issues. Status gate is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted"). No self-authorizing language. No NEEDS CLARIFICATION markers. No storage policy concerns. Implementation notes reference the correct governance rules.

## Axis F — Pragmatism

- **Over-engineered signature change**: The proposed `readAndParseRfc` return type change from `Promise<{ fileName, parsed } | undefined>` to `Promise<ReadAndParseRfcResult | { error: ReadAndParseRfcError }>` affects 16 call sites across 13 files. Simpler alternatives exist:
  1. **Add a separate function** `readAndParseRfcDetailed` that returns error details, used only by `validate.ts` and `implement-stamp.ts`. Leave `readAndParseRfc` unchanged for all other callers.
  2. **Catch YAML errors in `validate.ts` directly**: before the main loop, read each file, call `parseRfcFile` in a try/catch, and add a V-RFC-33 violation on error. No signature change needed.
  3. **Make `readAndParseRfc` throw** on parse errors instead of returning `undefined`, and update only the callers that need error details. Callers that currently check `if (!result)` would use try/catch instead.

  The RFC should justify why changing the shared function's signature is preferred over these alternatives, or adopt one of them.

## Axis G — Blind spots

- **Blast radius not documented**: The RFC doesn't mention the 16 call sites affected by the signature change. This is a planning gap — the implementer would discover them during implementation and need to update the plan.
- **False-positive rate**: The RFC's Risks section mentions "YAML parser quirks" but doesn't estimate the false-positive rate or describe suppression. Since V-RFC-33 uses the same parser that `readAndParseRfc` already uses, false positives should be zero — but this should be stated explicitly.
- **Edge case — empty frontmatter**: The RFC mentions checking for non-empty frontmatter when YAML parses to `null`/`undefined` (line 121). `parseRfcFile` already handles this: `YAML.parse(match[1]!) ?? {}` — if YAML.parse returns `null`, it defaults to `{}`. So this edge case is already handled. The RFC should verify this before adding a redundant check.

## Questions for the author

1. **V-RFC-30 is already taken by breaksC field consistency (RFC-0480). Should this RFC use V-RFC-33 instead?** The current rule numbering in `validate-rules.ts` goes up to V-32.

2. **Why change `readAndParseRfc`'s signature (affecting 16 call sites) instead of adding a separate function or catching YAML errors directly in `validate.ts`?** The current proposal has a large blast radius for a problem that only affects 2 consumers (`validate.ts` and `implement-stamp.ts`).

3. **How does the non-goal "Do not change the rfc.implement.stamp error message format" reconcile with the decision to include parse error details in the RFC-IMP-01 message?** These appear contradictory.
