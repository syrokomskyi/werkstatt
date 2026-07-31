---
rfcId: RFC-0618
auditId: AUDIT-RFC-0618-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0618

## Verdict: Needs revision

The RFC is a well-scoped one-line fix to a real CDN cache problem in `leitstand.promote`. One minor finding on Axis G: the acceptance criteria lack a negative test verifying that health check route probes do NOT receive the cache-buster, despite the implementation notes explicitly requiring this constraint.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

No issues. All sections contain real content. Decision is present tense. TypeScript contracts show the exact two-line diff. File system responsibilities table names the correct file (`packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`). Failure modes, rollout, alternatives, and risks are all substantive. Acceptance criteria are checkable.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-49]` is correct — DNA-49 governs the Leitstand promotion chain including `leitstand.promote`'s `build-identity.json` verification. The RFC improves the reliability of that verification step without changing the state machine or verification logic. `related: [RFC-0608]` is the establishing RFC for the alt-to-main promotion chain.

## Axis C — Ecosystem fit

No issues. Package boundaries are correct — the change is entirely within `@warpgogol/site-kernel-handoff`. `commands.changed: [leitstand.promote]` is accurate (existing command, no new commands). `packagesImpacted` lists only the impacted package. No Compass XML or AGENTS.md updates needed — the cache-buster is an implementation detail, not a behavioral contract change.

## Axis D — Forward-only compliance

No issues. No compatibility shim or dual-path. The cache-buster is always applied — no flag, no opt-out. Legacy fetch path is replaced, not maintained.

## Axis E — Agent-facing policy

No issues. Status gate language is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)"). Implementation notes are explicit: cache-buster MUST be applied only to `build-identity.json` fetch, NOT to health check route probes. Anti-retry note is clear. No storage or persistence changes.

## Axis F — Pragmatism

No issues. No new commands — the fix extends an existing one. TypeScript contract is a two-line diff. `appsImpacted: []` and `packagesImpacted` are minimal and accurate. `nonGoals` are meaningful (no state machine changes, no health check logic changes, no retry logic for other fetches).

## Axis G — Blind spots

**Finding G-1 (minor):** The acceptance criteria include a positive test ("Unit test: build-identity fetch URL includes cache-buster query param") but do not explicitly mention a negative test verifying that health check route probes do NOT receive the cache-buster. The implementation notes state this constraint explicitly (line 164: "The cache-buster MUST be applied only to the `build-identity.json` fetch in `leitstand.promote`, not to health check route probes"), but without a corresponding acceptance criterion, an implementing agent could write only the positive test and miss the negative case. Adding a criterion like "Unit test: health check route probe URLs do NOT include cache-buster query param" would close this gap.

## Questions for the author

1. Should the acceptance criteria explicitly require a negative test for health check route probes (no cache-buster), or is the implementation note sufficient guidance for the implementing agent?
