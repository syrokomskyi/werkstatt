---
rfcId: RFC-0590
auditId: AUDIT-RFC-0590-01
date: 2026-07-29
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0590

## Verdict: Needs revision

The RFC is well-structured and the core change (single-line state check tightening) is sound. However, three findings require revision before implementation: (1) `supersedes` should be `amends` since RFC-0590 only changes one transition table entry in RFC-0357, not the entire RFC; (2) the RFC creates a workflow conflict with RFC-0522's `mission.close` releaseId warning that it does not address; (3) the acceptance criterion about updating the archived RFC-0357 transition table needs clarification.

## Mechanical validation (rfc.validate)

**Warning (V-12):** `RFC-0590.supersedes includes RFC-0357, but RFC-0357.supersededBy is "(empty)" (expected RFC-0590)`. This warning would be resolved by switching from `supersedes` to `amends` (see Axis B finding).

## Axis A — Structural completeness

No issues. All required sections contain real content. The decision is a single clear statement. CLI surface, TypeScript contracts, file system responsibilities, output format, failure modes, rollout, alternatives (3 with rejection reasons), risks (including agent misinterpretation and false-positive rate), acceptance criteria (6 checkable items), and implementation notes are all substantive.

## Axis B — DNA alignment

**Finding B1 — `supersedes` should be `amends`:** The RFC frontmatter declares `supersedes: [RFC-0357]`, but the RFC body says "This supersedes the RFC-0357 transition table entry that allowed `open` missions" (line 186). RFC-0357 is a large RFC that established the entire release discipline framework — release.prepare, release.publish, release.validate, release.list, release.rollback, behavior snapshot diff gating, Bordbuch integration, and DNA-48. RFC-0590 only changes one precondition in one transition table entry. Using `supersedes` implies the entire RFC-0357 is replaced by RFC-0590, which is incorrect. The correct relationship is `amends: [RFC-0357]`. This also resolves the V-12 mechanical validation warning.

**DNA-46 and DNA-48 references are correct.** Both invariants exist in `docs/architecture-dna.md`. DNA-46 (Mission lifecycle) is at line 199, DNA-48 (Release discipline) at line 207. The RFC body explains how it enforces each: separation between mission lifecycle and release lifecycle (DNA-46), and tightening the release contract to always produce from a validated, closed mission (DNA-48). The `satisfies` entries are appropriate without needing to amend the DNA invariants themselves — the RFC tightens operational enforcement, not the invariant semantics.

## Axis C — Ecosystem fit

**Finding C1 — Missing AGENTS.md update in acceptance criteria:** `packages/os/site-kernel-handoff/AGENTS.md` documents `mission.close` guards (null `reconciledAt` refusal) but does not mention `release.prepare` state requirements. After implementation, the handoff AGENTS.md should document that `release.prepare` requires `state: closed`. The RFC's acceptance criteria do not include an AGENTS.md update. Add a criterion like: "`packages/os/site-kernel-handoff/AGENTS.md` documents the closed-mission requirement for `release.prepare`."

**Package boundaries, pipeline placement, command lifecycle:** All correct. `packagesImpacted: [@warpgogol/site-kernel-handoff]` is the right package. `commands.changed: [release.prepare]` is correct — it's an existing registered command. No new commands proposed.

## Axis D — Forward-only compliance

No issues. The old behavior (allowing `open` missions) is removed entirely — no compatibility shim, no `--force` flag, no grace period. The RFC explicitly forbids a `--force` bypass in implementation notes (line 217). Deprecation is immediate: "Fail-hard from the first release after acceptance. No grace period, no `--strict` flag" (line 183).

## Axis E — Agent-facing policy

No issues. The status gate is correct: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 215). No self-authorizing language. Implementation notes reference RFC-0224 for the accepted→implemented transition. Anti-fabrication is not applicable (no content authoring in criteria). Storage policy is not applicable.

## Axis F — Pragmatism

No issues. The change is a single-line condition update — maximally minimal. No new commands, no new types, no new flags. Alternatives section honestly evaluates 3 alternatives with rejection reasons. `nonGoals` are explicit and meaningful (no `release.dry-run`, no `mission.close` precondition changes, no `release.publish` changes). `packagesImpacted` lists only the actually impacted package.

## Axis G — Blind spots

**Finding G1 — Workflow conflict with RFC-0522 `mission.close` releaseId warning:** RFC-0522 added a `missing-release-id` warning to `mission.close` when `releaseId` is null, with the message "Run `release.prepare` before close to associate a release" (`packages/os/site-kernel-handoff/src/mission/mission-close.ts:253-260`). RFC-0522 also made `release.prepare` write `releaseId` back to `mission.yaml` after preparation (`release-commands.ts:401-404`). The intended workflow was: `release.prepare` (on open mission) → `mission.close` (with `releaseId` set, no warning).

RFC-0590 reverses this workflow: `mission.close` first → `release.prepare` on closed mission. This creates a conflict:

1. Operator runs `mission.close` → gets `missing-release-id` warning (because `release.prepare` hasn't run yet)
2. Operator runs `release.prepare` on closed mission → writes `releaseId` to `mission.yaml` (now closed)

The warning in step 1 is now always expected and cannot be satisfied — `release.prepare` cannot run before close under the new contract. The RFC does not address this conflict. It should either:

- Amend RFC-0522 to remove or reword the `missing-release-id` warning (since the workflow is reversed), OR
- Explain that the warning is now expected behavior and operators should ignore it, AND clarify that writing `releaseId` to a closed mission's `mission.yaml` is valid

**Finding G2 — Edge case: closed mission with null `reconciledAt`:** The RFC should explicitly state that `state: closed` implies `reconciledAt` is non-null because `mission.close` enforces this as a hard guard (per `packages/os/site-kernel-handoff/AGENTS.md`). This is already the case in the implementation, but stating it in the RFC body makes the invariant chain explicit for future readers.

## Questions for the author

1. Should this RFC use `amends: [RFC-0357]` instead of `supersedes: [RFC-0357]`, given that only one transition table entry changes, not the entire release discipline framework?
2. How should the RFC-0522 `mission.close` `missing-release-id` warning be handled now that `release.prepare` must run after close? Should the warning be removed, reworded, or should the RFC explain that it is expected?
3. How is the acceptance criterion "RFC-0357 transition table is updated to remove the `open` allowance" satisfied when RFC-0357 is archived? Is it a frontmatter `amendedBy` update, a body annotation, or a direct edit to the archived file's transition table?
