---
rfcId: RFC-0794
auditId: AUDIT-RFC-0794-01
date: 2026-08-10
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0794

## Verdict: Needs revision

The RFC correctly identifies three real architectural gaps from RFC-0790's first production deployment and proposes minimal fixes. Two findings require revision: the `commands.changed` list omits `mission.close` (which also calls `writeSystemState`), and the concurrent-execution edge case for bare-repo pushes is not addressed.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0794 --json` returns exitCode 0, 0 errors, 0 warnings.

## Axis A — Structural completeness

No issues. All sections contain real content. Decision is present tense. File system responsibilities table names concrete paths. Failure modes specify non-fatal vs. fatal behavior. Three alternatives with concrete rejection reasons. Acceptance criteria are checkable with evidence citations. Implementation notes contain explicit MUST/MAY rules.

## Axis B — DNA alignment

No issues. DNA-44 (Sternsystem bundle contract) — the RFC body explains that the push ensures `system-state.yaml` durability, which is part of the bundle's state contract. DNA-45 (Fleet registry / convention-based discovery) — the RFC body explains that the push makes `discoverSystems` reliable across `syncCacheClone` resets. Both `satisfies` entries are real invariants in `docs/architecture-dna.md`. No conflicts with existing DNA.

## Axis C — Ecosystem fit

**Finding C-1 (minor):** `commands.changed` lists `mission.open`, `mission.reconcile`, `leitstand.propagate` — but omits `mission.close`, which also calls `writeSystemState` and benefits from the push fix. The `commands.changed` list should include `mission.close`.

No other issues. Package boundaries are correct — all changes in `@warpgogol/werkstatt`. No new packages or pipelines. No AGENTS.md updates needed (internal behavior fixes).

## Axis D — Forward-only compliance

No issues. No compatibility shims or dual paths. The fixes directly change existing behavior. No legacy code paths maintained behind flags.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes reference RFC-0224, RFC-0330, RFC-0334 correctly. No NEEDS CLARIFICATION markers. No storage or cookie concerns.

## Axis F — Pragmatism

No issues. No new commands — minimal surface. Changes are internal to existing functions. `packagesImpacted` lists only `@warpgogol/werkstatt`. `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

**Finding G-1 (minor):** The RFC does not address concurrent execution — if two lifecycle commands run simultaneously (e.g., two agents opening missions for different systems), both may push to their respective bare repos concurrently. While the bare repos are per-system (so cross-system concurrency is safe), intra-system concurrency (two commands for the same system) could cause a git push race. The RFC should state whether this is a concern or explicitly declare it out of scope.

No other issues. Push performance is local and fast. Push failure is non-fatal. No security/privacy concerns.

## Questions for the author

1. Should `commands.changed` include `mission.close`? It also calls `writeSystemState` and benefits from the push fix.
2. Is intra-system concurrent execution (two lifecycle commands for the same Sternsystem running simultaneously) a concern for the bare-repo push, or is it already prevented by the single-open-mission constraint (DNA-46)?
3. The `computeInputsHash` fix (acceptance criterion 5) is listed in this RFC but not described in the Design section. Should it be added as Design §4, or is it covered by a separate document?
