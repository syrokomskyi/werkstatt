---
rfcId: RFC-0625
auditId: AUDIT-RFC-0625-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0625

## Verdict: Needs revision

The RFC identifies a real gap and proposes a sound three-layer defense (plan template, skill gates, drift detection). However, two findings require revision before implementation: the file system responsibilities table references a non-existent `validate-rules.ts` for ADRs (ADR validation is inline in `validate.ts`), and the proposed rule numbering `V-32` for `adr.validate` conflicts with the ADR validation's `AV-XX` naming scheme.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **File path mismatch in file system responsibilities table.** The RFC lists `packages/forge/os/adr/handlers/validate-rules.ts` as the target for ADR V-32 implementation (line 167). This file does not exist — ADR validation is inline in `packages/forge/os/adr/handlers/validate.ts` (single file, `validateSingleAdr` function, lines 152–361). The RFC should reference `validate.ts` or acknowledge that a new file will be created.
- All other sections are fully populated with real content. Decision is in present tense. CLI surface, TypeScript contracts, output format, failure modes, rollout, alternatives, risks, acceptance criteria, and implementation notes are all complete and specific.

## Axis B — DNA alignment

- `satisfies: []` is empty. For `kind: policy`, this is acceptable — V-24 only requires `satisfies` for `architecture`/`contract` RFCs.
- `related` references RFC-0476, RFC-0224, RFC-0463 — all exist and are relevant. RFC-0476 established `rfc.implement.stamp`; RFC-0224 established agent-permitted transitions; RFC-0463 established V-26/V-27 acceptance criteria checks.

## Axis C — Ecosystem fit

- **Rule numbering scheme mismatch.** The RFC proposes `V-32` for both `rfc.validate` and `adr.validate` (line 108). RFC validation rules use `V-XX` (V-01..V-31); ADR validation rules use `AV-XX` (AV-01..AV-15). The ADR drift detection rule should be `AV-16`, not `V-32`. Using `V-32` in `adr.validate` output would be inconsistent with the existing `AV-` prefix convention.
- `commands.changed: [rfc.validate, adr.validate]` — both are registered CLI commands. ✓
- `packagesImpacted: ["@warpgogol/forge"]` — correct, both validation rules and skills live in forge. ✓
- No `docs/*.xml` Compass sync needed — correct for a policy RFC that changes process, not architecture. ✓
- No AGENTS.md updates mentioned — correct, since skill changes are synced to `.agents/skills/` not AGENTS.md. ✓

## Axis D — Forward-only compliance

No issues. No compatibility shim, no dual path, no legacy maintenance. V-32 is additive — it extends existing validators with a new warning-level rule.

## Axis E — Agent-facing policy

- No self-authorizing language. The RFC explicitly states "Agents MAY implement this RFC only after it is accepted." ✓
- Implementation notes are explicit behavioral rules with MUST/MUST NOT. ✓
- The RFC correctly does not change `rfc.implement.stamp` or its preconditions. ✓

## Axis F — Pragmatism

- Minimal command surface: no new commands, extends existing ones. ✓
- Lean TypeScript contracts: minimal interface, no speculative generality. ✓
- Existing patterns: extends `rfc.validate` and `adr.validate` rather than creating a new command. ✓
- `nonGoals` are explicit and meaningful (no new command, no stamp changes, no ADR stamping, no error severity). ✓

## Axis G — Blind spots

- **ADR status values differ from RFC.** The RFC says V-32 checks if status "is not `implemented`" (line 155–156). ADR statuses include `proposed` (not `draft`) and `reviewing` — the same logic applies, but the RFC should explicitly list the ADR statuses that trigger the warning (`proposed`, `reviewing`, `accepted`) to avoid agent confusion during implementation.
- **`implement:` commit prefix matching.** The RFC says "commits whose message starts with `implement: ` and includes the RFC id" (line 158). The actual commit message format from `fo-idea-implement` step 3.3 is `implement: RFC-XXXX — <phase description>`. The regex should match `^implement: RFC-\d{4}` on the subject line. The RFC says "MUST be on the commit message subject line, not the body" (line 258) which is correct, but the matching pattern could be more precise (e.g., `^implement: RFC-\d{4}\b`).
- **Squash merge false negative** — acknowledged in Risks. ✓
- **Performance** — `git log --since` is fast. ✓
- **V-32 false positive during in-progress implementation** — acknowledged and correctly classified as safe. ✓

## Questions for the author

1. Should the ADR drift detection rule be numbered `AV-16` (continuing the `AV-XX` scheme) instead of `V-32`? Using `V-32` in `adr.validate` output would break the existing `AV-` prefix convention.
2. Should the file system responsibilities table reference `packages/forge/os/adr/handlers/validate.ts` (where ADR validation actually lives) instead of the non-existent `validate-rules.ts`?
3. Should the RFC explicitly list the ADR statuses that trigger the drift warning (`proposed`, `reviewing`, `accepted`) to avoid implementation ambiguity?
