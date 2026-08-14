---
rfcId: RFC-0839
auditId: AUDIT-RFC-0839-01
date: 2026-08-14
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: resolved
---

# Audit: RFC-0839

## Verdict: Resolved

All findings were addressed in the enhanced version of RFC-0839 (`enhancedAt: 2026-08-14`).

## Resolution summary

1. **`commands.changed` contradiction** — Fixed: `commands.changed` is now `[]`. The RFC body correctly states no code change is needed to `mission.check`.
2. **Acceptance criterion reworded** — Fixed: criterion now reads "Verify that `mission.check` picks up the new methodology config without code changes by running `methodologies.validate`".
3. **Missing `dependsOn`** — Fixed: `dependsOn: [RFC-0837, RFC-0838]` added to frontmatter.
4. **"L5-adjacent" imprecision** — Fixed: RFC now says "Extends DNA-66 (workshop testing pyramid) L5 (post-deploy health and critical-path checks)".
5. **Compass sync** — Fixed: dedicated "Compass sync" section added, identifying `docs/verification-plan.xml` as the file to update.
6. **AGENTS.md scope** — Fixed: acceptance criterion now states "No `AGENTS.md` updates required (this RFC does not change agent behavior rules)".
7. **Error handling one-sidedness** — Fixed: "Error handling for unimplemented instrument" section now specifies both the Werkstatt-side adapter behavior (existing try/catch → `missionCheckFailResult`) and the external expert's instrument dispatcher contract.

## Mechanical validation (rfc.validate)

Pass with 2 warnings:

- V-18: `related "DNA-68"` is not defined in `docs/architecture-dna.md` (expected — RFC-0837 is draft)
- V-18: `related "DNA-69"` is not defined in `docs/architecture-dna.md` (expected — RFC-0838 is draft)

## Axis A — Structural completeness

1. **`commands.changed: [mission.check]` is contradictory.** The RFC body (§ Integration with `mission.check`) explicitly states: "No change is needed — the new methodology is automatically picked up from `systems/methodologies.md` and passed to `runAxiomCheck`." If no code change is needed to `mission.check`, it should not be listed in `commands.changed`. Either remove it or clarify what code change is required.

2. **Acceptance criterion "mission.check passes the new methodology config to runAxiomCheck without code changes" is a verification, not an implementation task.** If no code changes are needed, this criterion should be reworded as a verification step (e.g., "Verify that mission.check picks up the new methodology config without code changes by running methodologies.validate").

## Axis B — DNA alignment

1. **Missing `dependsOn` declaration.** `related` references DNA-68 (established by RFC-0837) and DNA-69 (established by RFC-0838), both of which are still draft RFCs. RFC-0839 should declare `dependsOn: [RFC-0837, RFC-0838]` in frontmatter to make the implementation order explicit. Without this, `rfc.implement.stamp` could proceed before the dependencies are established.

2. **"L5-adjacent" is imprecise.** DNA-66 defines L5 as "post-deploy health and critical-path checks." Mobile-layout monitoring on live URLs IS an L5 methodology. The RFC should say "extends L5" instead of "L5-adjacent." The "adjacent" qualifier introduces ambiguity about where in the testing pyramid this actually sits.

## Axis C — Ecosystem fit

1. **Compass sync not addressed.** The RFC adds a new Axiom methodology to the verification surface. `docs/verification-plan.xml` tracks verification methods and may need synchronization. The RFC should either identify which `docs/*.xml` files need updates or explicitly state that no Compass sync is required (with reasoning).

2. **AGENTS.md update scope is vague.** The acceptance criterion says "AGENTS.md updated where agent behavior rules changed" but the RFC doesn't identify which AGENTS.md files. If no agent behavior rules change (this is a config/schema extension, not a behavioral change), state this explicitly and remove or mark the criterion as N/A.

## Axis D — Forward-only compliance

No issues. The methodology starts `active: false` and is activated later — this is a rollout strategy, not a backward compatibility layer. No shims, no dual-paths.

## Axis E — Agent-facing policy

No issues. Status gate is correct. Implementation notes reference the right governance rules. Anti-fabrication is clear — the RFC distinguishes Werkstatt-side changes (schema, config) from external expert work (instrument implementation). No cookies, no client-side persistence. No NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

No issues. No new command — extends existing `mission.check` via config. Follows the exact pattern of existing methodologies. `packagesImpacted` is minimal. The Finding interface is documented for the external expert, not over-specified for the Werkstatt side.

## Axis G — Blind spots

1. **Error handling for unimplemented instrument type is one-sided.** The RFC says `runAxiomCheck` "should emit a warning and skip the methodology (fail-open)" if the `mobile-layout` instrument is not yet implemented. But `runAxiomCheck` is an external package (`@syrokomskyi/axiom-factory-app`). The Werkstatt side (`axiom-adapter.ts`) should have its own error handling for the case where `runAxiomCheck` throws on an unknown instrument type — the RFC should specify what happens in `axiom-adapter.ts` if the external package doesn't recognize `mobile-layout` (catch + warn + continue, or let it propagate).

## Questions for the author

1. Should RFC-0839 declare `dependsOn: [RFC-0837, RFC-0838]` in frontmatter, since it references DNA-68 and DNA-69 which are established by those (still draft) RFCs?
2. Why is `mission.check` listed in `commands.changed` if the RFC body says no code change is needed to it?
3. Which `docs/*.xml` Compass files need synchronization after adding the new methodology — or is no Compass sync required?
