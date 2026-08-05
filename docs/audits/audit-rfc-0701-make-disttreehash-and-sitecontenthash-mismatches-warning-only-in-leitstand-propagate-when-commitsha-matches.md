---
rfcId: RFC-0701
auditId: AUDIT-RFC-0701-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0701

## Verdict: Needs revision

RFC-0701 formalizes a code change that was already applied to `leitstand-commands.ts:1572-1595`. The RFC's Problem section describes a hard error that no longer exists in the code, the `amends` field is empty despite clearly amending RFC-0608, and the `commitSha` `"0000000"` workpiece-build exception is undocumented. Three findings require revision before implementation.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **A1: Problem section describes a hard error that no longer exists.** The RFC states "The hard error is in `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:1572-1595`." However, the actual code at those lines already uses `logger.warn(...)`, not `throw new Error(...)`. The Context section acknowledges the fix was applied ("The fix was applied as a code change in the same session"), but the Problem section presents the hard error as current state. This is misleading — the RFC should describe the pre-fix state in past tense or note that the change was already applied and this RFC formalizes it post-hoc.

- **A2: Design "Before" snippet does not match historical code.** The "Before" code snippet shows `throw new Error(...)`, but the actual code before the fix may have had a different structure (e.g., combined checks). The "After" snippet matches the current code. Since the change is already applied, the RFC should present this as documenting the current behavior rather than proposing a future change.

## Axis B — DNA alignment

- **B1: DNA-49 not referenced despite directly modifying its behavior.** DNA-49 (Fleet propagation) describes `leitstand.propagate` verifying `distTreeHash` and `siteContentHash` against the release manifest. This RFC changes that verification from hard error to warning. The RFC should reference DNA-49 in `related[]` and explain how it amends the behavior established by RFC-0608 (which satisfies DNA-49).

## Axis C — Ecosystem fit

No issues. `commands.changed: [leitstand.propagate]` is correct. `packagesImpacted` correctly lists `@warpgogol/site-kernel-handoff`. No AGENTS.md or Compass sync changes needed — this is a behavior change within an existing command.

## Axis D — Forward-only compliance

No issues. The change is clean: hard error → warning for secondary hashes. No dual-path, no compatibility shim.

## Axis E — Agent-facing policy

- **E1: Code change applied before RFC acceptance — status gate violation.** The code at `leitstand-commands.ts:1572-1595` already implements the warning-only behavior, but the RFC is `status: draft`. The RFC's Context section acknowledges this ("The fix was applied as a code change in the same session"). This is a governance violation: code changes must not precede RFC acceptance. The RFC should either (a) be stamped as `implemented` post-hoc with a reference to the implementation commit, or (b) explicitly acknowledge the pre-application in the Implementation notes and explain why it was necessary (e.g., unblocking an active release cycle).

- **E2: Implementation notes reference RFC-0224 but not the post-hoc formalization path.** The notes say "Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions." Since the code is already applied, the transition path is different from a normal RFC — the implementation commit already exists. The notes should clarify that `rfc.implement.stamp` should reference the existing commit where the warning-only behavior was introduced.

## Axis F — Pragmatism

No issues. The change is minimal (two `throw` → `logger.warn` conversions). No new commands, types, or abstractions. Alternatives section is honest with 4 real alternatives and rejection reasons.

## Axis G — Blind spots

- **G1: `commitSha` `"0000000"` workpiece-build exception undocumented.** The code at lines 1562-1566 skips the `commitSha` mismatch hard error when either side is `"0000000"` (workpiece builds). The RFC's Decision section says "commitSha mismatch remains a hard error" without mentioning this exception. The RFC should document that workpiece builds with `commitSha: "0000000"` bypass the commitSha check entirely, and clarify what happens to secondary hash checks in that case (they still use `logger.warn`).

- **G2: Empty/missing hash fields not considered.** The code checks `releaseDistTreeHash && devBuildIdentity.distTreeHash` before comparing — if either is empty or undefined, the check is skipped entirely. The RFC's Failure modes section does not mention this case. The RFC should document that missing/empty hashes on either side skip the comparison (no warning, no error).

## Questions for the author

1. Код на строках 1572–1595 уже реализует warning-only поведение. Должен ли этот RFC быть `status: implemented` (post-hoc formalization) с указанием commit SHA, где изменение было применено?
2. Должен ли RFC быть в `amends: [RFC-0608]`? Он изменяет поведение propagation gate, установленное RFC-0608.
3. Проверка `commitSha` имеет исключение для `"0000000"` (workpiece builds, строки 1564–1565). Должен ли RFC документировать это исключение и уточнить, что warning-only поведение также применяется, когда `commitSha` равен `"0000000"` на обеих сторонах?
