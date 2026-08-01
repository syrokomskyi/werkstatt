---
reviewId: REVIEW-CODE-2026-08-01-01
date: 2026-08-01
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: f27b853...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/AGENTS.md
  - packages/os/site-kernel-checks/src/mission-check.ts
---

# Code Review: f27b853...HEAD (RFC-0636 implementation)

## Verdict: Approved

The diff contains two minimal, focused changes: an AGENTS.md rule addition documenting the conditional flag semantics contract from RFC-0636, and a pre-existing TypeScript narrowing fix in `mission-check.ts`. Both are correct, forward-only, and ecosystem-aligned. Zero findings across all seven axes.

## Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` exits 0. `vitest run src/tests/generated-stale-validate.test.ts` — 8/8 tests pass. `rfc.validate --id RFC-0636` exits 0.

## Axis A — Structural correctness

No issues. The `mission-check.ts` fix is a minimal type narrowing cast — `(f.extension as Record<string, unknown>)?.["automated-web-accessibility"]` returns `unknown` (values of `Record<string, unknown>` are `unknown`), so a second cast to `Record<string, unknown> | undefined` is required for `.predicate` access. This is the standard TypeScript pattern for nested unknown access, not over-engineering. No magic numbers, no dead code, no duplicated logic.

## Axis B — DNA alignment

No issues. DNA-58 (Generated-file content determinism) is protected by the AGENTS.md rule, which prevents agents from reintroducing the `if (entry.conditional) continue;` skip that caused false positives in `generated.stale.validate`. The `mission-check.ts` fix is unrelated to DNA-58 but is in the same package — no conflict.

## Axis C — Ecosystem fit

No issues. The AGENTS.md rule was added to the correct file (`packages/os/site-kernel-checks/AGENTS.md`), in the "Shared utilities" section alongside other ownership-map rules. No package boundary violations, no pipeline changes, no command lifecycle changes.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy maintenance. The `mission-check.ts` fix is a type narrowing correction, not a backward compatibility layer.

## Axis E — Agent-facing clarity

No issues. The AGENTS.md rule is explicit, references RFC-0636, and lists all three affected validators. The `mission-check.ts` fix doesn't introduce new files — no Compass scaffolding needed. Variable names are clear and unchanged.

## Axis F — Pragmatism

No issues. Both changes are minimal and scoped. No new commands, no speculative generality, no scope creep.

## Axis G — Blind spots

No issues. The AGENTS.md change is documentation-only (zero runtime impact). The `mission-check.ts` fix is a type-level change with no runtime behavior change. No performance, false-positive, edge-case, or security concerns.

## Spec compliance

| Requirement from RFC-0636 | Status | Evidence |
| --- | --- | --- |
| Formalize conditional flag as "skip absence checks, not coverage checks" | Done | `generator-ownership.ts:53-65` docstring, AGENTS.md rule |
| Remove `if (entry.conditional) continue;` from `generated.stale.validate` | Done | `generated-stale-validate.ts` — grep confirms no `entry.conditional` |
| Regression test for conditional coverage | Done | `generated-stale-validate.test.ts:188-208` |
| `ownership.sync.validate` already correct | Done | `ownership-sync-validate.ts:71-110` |
| `generated.files.validate` already correct | Done | `generated-files-validate.ts:218-338` |
| AGENTS.md rule for agents | Done | `packages/os/site-kernel-checks/AGENTS.md:61` |

## Questions for the author

None — the diff is clean and complete.
