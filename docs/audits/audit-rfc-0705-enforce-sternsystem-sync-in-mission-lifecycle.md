---
rfcId: RFC-0705
auditId: AUDIT-RFC-0705-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0705

## Verdict: Needs revision

The RFC correctly identifies a real enforcement gap and proposes a sound two-phase approach (non-fatal sync in reconcile, blocking check in close). However, the implementation note about blocking check placement is incorrect relative to the current `mission.close` code structure, and the RFC overlooks the bordbuch side effect of calling `sternsystem.sync` from within reconcile.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **Implementation note placement error.** The RFC states: "The blocking check in close MUST be placed AFTER `closeReport` assembly but BEFORE `evidence.sync` and state transition." However, in the current `mission-close.ts` code, the state transition (`manifest.state = "closed"`, line 263) and `writeMissionManifest` (line 268) happen **before** `closeReport` assembly (line 376). The RFC's placement instruction is self-contradictory relative to the existing code: it cannot be both after closeReport assembly and before state transition, because state transition precedes closeReport assembly. The RFC must either (a) specify the check before the state transition (which is before closeReport assembly in the current flow), or (b) explicitly call for restructuring the close flow to move the state transition after closeReport assembly and evidence.sync.

## Axis B — DNA alignment

- **DNA-44 referenced in body but missing from `satisfies[]`.** The architectural fit section states: "DNA-44 (Sternsystem bundle contract) — external mirrors are the disaster-recovery source for Sternsystem repos. Enforcing sync protects the durability guarantee." This claims the RFC protects DNA-44, but `satisfies[]` contains only `DNA-46`. Either add `DNA-44` to `satisfies[]`, or remove the DNA-44 claim from the body if the RFC does not meaningfully enforce it.

## Axis C — Ecosystem fit

- **Compass `docs/*.xml` sync not addressed.** The root AGENTS.md requires that changes to mission lifecycle behavior keep `docs/*.xml` files synchronized. The RFC changes `mission.reconcile` and `mission.close` behavior but does not mention whether `docs/verification-plan.xml` or `docs/development-plan.xml` need updates to reflect the new sync enforcement. The RFC should explicitly state whether these files need synchronization or confirm they are unaffected.

## Axis D — Forward-only compliance

No issues. The AGENTS.md rule transitions from conventional to enforced — no backward compatibility layer, no dual-path.

## Axis E — Agent-facing policy

No issues. Implementation notes reference RFC-0224, RFC-0330, RFC-0334 correctly. No self-authorizing language. The `executeKernelCommand` directive is consistent with existing patterns in `mission-close.ts` (used for `evidence.sync` and `sternsystem.pin`).

## Axis F — Pragmatism

No issues. No new commands, minimal `mirrorSync` field, extends existing commands. `packagesImpacted` is accurate — only `@warpgogol/site-kernel-handoff` is affected.

## Axis G — Blind spots

- **`sternsystem.sync` bordbuch side effect not mentioned.** `runSternsystemSync` (in `sternsystem-sync.ts`) appends a `mirror-sync` bordbuch entry and calls `commitAndPushBordbuch` as part of its execution. Calling it from within `mission.reconcile` will produce an additional bordbuch entry and git commit/push in the cache clone. The RFC does not mention this side effect. The reconcile flow currently does not append bordbuch entries or commit bordbuch — only `mission.open`, `mission.close`, `mission.abort`, and `sternsystem.sync` do. The RFC should document that the automatic sync will produce a `mirror-sync` bordbuch entry, and confirm this is acceptable within the reconcile flow (it runs inside the `system:<id>` lock, so concurrent bordbuch access is not a concern).

- **Non-git cache clone edge case.** The reconcile code has a non-git fallback path (line 1162: `// No git in system dir — fall back to copyDir for non-git Sternsystems`) where `sternsystem.sync` would not be applicable. The RFC should state that the automatic sync only applies when the cache clone is a git repository (the `existsSync(gitDir)` branch), matching the existing push-to-origin logic.

## Questions for the author

1. Where exactly should the blocking mirror check be placed in `mission.close`? The current code transitions state (line 263) before assembling `closeReport` (line 376). Should the check move before the state transition, or should the close flow be restructured?
2. Is the `mirror-sync` bordbuch entry produced by `sternsystem.sync` acceptable within the reconcile flow, or should the sync be called in a mode that suppresses the bordbuch entry?
3. Does `docs/verification-plan.xml` or `docs/development-plan.xml` need updates to reflect the new sync enforcement in the mission lifecycle?
