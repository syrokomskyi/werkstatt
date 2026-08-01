---
rfcId: RFC-0636
auditId: AUDIT-RFC-0636-01
date: 2026-08-01
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0636

## Verdict: Needs revision

The RFC correctly identifies and formalizes a real inconsistency in conditional flag handling across three validators, and the code fix is already applied and tested. However, there are minor findings on `commands.changed` accuracy, `amends` completeness, AGENTS.md update specification, and evidence citation line ranges that should be addressed before transitioning to `implemented`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0636` exits 0 with zero violations.

## Axis A — Structural completeness

No issues. All required sections contain real content. The Decision is a single present-tense statement. The TypeScript contracts section shows the minimal `OwnershipEntry` interface with the updated docstring. The file system responsibilities table names five concrete paths. The conditional flag contract table is clear and covers all three validators × two states. Alternatives considered has three real alternatives with rejection reasons. Risks includes agent misinterpretation and false-negative scenarios. Acceptance criteria are checkable and all marked `[x]`. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-58]` references a real invariant (`docs/architecture-dna.md` §DNA-58 "Generated-file content determinism"). The RFC body's Architectural fit section explains how formalizing the `conditional` flag ensures transient generated files are correctly covered without false positives, maintaining the generated-file determinism enforcement chain. No conflicts with existing DNA invariants. `related` references (DNA-58, RFC-0087, RFC-0375, RFC-0634) are all relevant and non-decorative.

## Axis C — Ecosystem fit

- **`commands.changed` accuracy**: The RFC lists three commands in `changed`: `generated.stale.validate`, `ownership.sync.validate`, `generated.files.validate`. However, only `generated.stale.validate` had an actual code change (removal of `if (entry.conditional) continue;`). The other two are explicitly described as "already correct, no change needed" in the RFC body (lines 183-184). Listing commands with no behavior change in `changed` is misleading — consider removing `ownership.sync.validate` and `generated.files.validate` from `changed`, or adding a clarifying note that the change is contract documentation only.

- **`amends` completeness**: The RFC amends RFC-0600 and RFC-0612, and both have the `amendedBy: [RFC-0636]` back-reference (verified). However, the RFC also formalizes the contract for `generated.files.validate` (RFC-0375) in its Design section and acceptance criteria (criterion 5). If formalizing the contract counts as amending, RFC-0375 should also be in `amends`. If not, the RFC's claim that it "formalizes the contract" for all three validators is inconsistent — it only amends the two where it changes documentation, not the one where it also only changes documentation.

- **AGENTS.md updates**: The RFC adds an agent-facing rule ("Agents MUST NOT add `if (entry.conditional) continue;` or equivalent skips to any validator that builds an expected-path set from `GENERATOR_OWNERSHIP_MAP`", line 234) but does not specify which `AGENTS.md` file should carry this rule. The rule belongs in `packages/os/site-kernel-checks/AGENTS.md` since that package owns the validators. The RFC should identify this target.

## Axis D — Forward-only compliance

No issues. The fix removes the `continue` skip entirely — no compatibility shim, no dual-path, no flag-gated legacy behavior. The amendment changes RFC-0600's contract directly (removing the conditional skip) rather than adding a parallel interpretation.

## Axis E — Agent-facing policy

- **`reviewers: []`**: The reviewers field is empty. This is valid for `draft` status (V-25 only applies to `implemented`), but the RFC should add at least one reviewer (e.g. `human:andrii-syrokomskyi`) before transitioning to `implemented`.

- **Draft with all criteria checked**: The RFC is in `draft` status with all acceptance criteria marked `[x]` and evidence citations. This is unusual but explained by the Rollout section ("The fix is already applied and committed"). The RFC is formalizing a past fix, not proposing future work. This is acceptable for an amending RFC.

- No self-authorizing language. Implementation notes reference correct governance rules (RFC-0224, RFC-0334). No anti-fabrication or storage policy issues.

## Axis F — Pragmatism

- **Evidence citation accuracy**: Two acceptance criteria have incorrect line ranges:
  - Criterion 2 cites `generator-ownership.ts:517-526` for the `build-identity.json` entry, but the actual entry (including comments) is at lines 525-534. Lines 517-526 span from the `warpgogol-check.json` entry to the middle of the `build-identity.json` comment block.
  - Criterion 3 cites `generated-stale-validate.test.ts:182-201` for the regression test, but the actual test ("green: conditional ownership entry covers file on disk") is at lines 188-208. Lines 182-201 start in the previous test and end mid-test.
  - Criterion 6 cites "deployment log, 2026-08-01" — not a `file:line` citation. V-27 requires `(evidence: <file:line>)` format. This will fail validation when the RFC transitions to `implemented`.
  - Criterion 8 cites "rfc.validate --id RFC-0636 exit 0, 2026-08-01" — also not a `file:line` citation.

- Otherwise: no new commands proposed. No interface changes. `packagesImpacted` lists only `@warpgogol/site-kernel-checks`. `nonGoals` are explicit and meaningful (don't remove the flag, don't add a command, don't change the data structure, don't change build-identity.json lifecycle).

## Axis G — Blind spots

No issues. The fix adds conditional entries to a `Set<string>` lookup — O(1) per entry, no performance impact. The RFC acknowledges the lack of an automated cross-validator consistency check in Risks and mitigates with a regression test. Edge cases (absent conditional entries, present conditional entries) are covered in the contract table. Migration path is documented — existing conditional entries were already absent from disk, so removing the skip is backward-compatible.

## Questions for the author

1. Should `ownership.sync.validate` and `generated.files.validate` remain in `commands.changed` if their code didn't change? If the change is contract documentation only, consider clarifying this or removing them from `changed`.
2. Should RFC-0375 be in `amends` since the RFC also formalizes the contract for `generated.files.validate`? The current `amends` list is inconsistent with the RFC's stated scope of formalizing all three validators.
3. Two evidence citations have incorrect line ranges (criterion 2: `517-526` → `525-534`; criterion 3: `182-201` → `188-208`) and two criteria (6, 8) lack `file:line` evidence. Should these be corrected before transitioning to `implemented` to satisfy V-27?
