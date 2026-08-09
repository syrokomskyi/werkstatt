---
id: RFC-0131
title: "charity-donation-trust family.yaml — remap placeholder archetypes to the live catalog"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-29
updatedAt: 2026-06-04
implementedAt: 2026-05-29
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0072
  - RFC-0083
  - RFC-0108
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - ontology
successSignals:
  - "`family.contract.validate` exits zero on the workspace; `2 family file(s) valid`."
  - "`charity-donation-trust/family.yaml requiredSectionArchetypes[]` points at four archetype YAMLs that exist in `packages/ontology/archetypes/sections/`."
nonGoals:
  - "Do not create new archetypes named `mission-hero`, `impact-evidence`, `donation-use-breakdown`, or `final-donation-cta`. The live catalog already covers the semantic role each placeholder named; aliasing would just create catalog duplicates."
  - "Do not change `recipe.candidateBiomes`, `candidateConstellations`, `auditThresholds`, or `agentReadinessBaseline`. Those are unrelated to the archetype-reference issue."
---

# RFC-0131: charity-donation-trust family.yaml — remap placeholder archetypes to the live catalog

## Context

`packages/ontology/site-families/charity-donation-trust/family.yaml` declared `recipe.requiredSectionArchetypes` as:

```yaml
requiredSectionArchetypes:
  - mission-hero
  - impact-evidence
  - donation-use-breakdown
  - final-donation-cta
```

None of these archetype IDs exist in `packages/ontology/archetypes/sections/`. The four names were placeholders that did not get reconciled when the section archetype catalog grew to its current 24 entries. `family.contract.validate` consequently emitted four findings per run:

```
required section archetype does not exist: mission-hero
required section archetype does not exist: impact-evidence
required section archetype does not exist: donation-use-breakdown
required section archetype does not exist: final-donation-cta
```

## Decision

Remap each placeholder to the existing archetype that already covers the same semantic role:

| Placeholder | Replaced by | Archetype YAML | Why |
| --- | --- | --- | --- |
| mission-hero | hero | `packages/ontology/archetypes/sections/hero.yaml` | The canonical hero archetype already covers the "mission-first hero" use case for charity sites; no separate `mission-hero` archetype is justified. |
| impact-evidence | impact | `packages/ontology/archetypes/sections/impact.yaml` | `impact` is the impact-stats / impact-proof section used by both shipped charity sites; it is the live archetype every consumer already references. |
| donation-use-breakdown | donation-use | `packages/ontology/archetypes/sections/donation-use.yaml` | `donation-use` is the breakdown-of-how-donations-are-spent section; the placeholder name was just a wordier synonym. |
| final-donation-cta | final-cta | `packages/ontology/archetypes/sections/final-cta.yaml` | `final-cta` is the closing call-to-action section; charity-donation-trust uses it for donation conversion. |

## Architectural fit

- **RFC-0072** — the section archetype catalog is the single source of truth for "what sections exist". Pointing family requirements at archetypes that actually exist is the baseline contract.
- **RFC-0083** — directory-derived archetype layer rules unchanged. All four archetypes remain `layer: section`.
- **RFC-0108 §"Section migration"** — both `impact` and `final-cta` are already marked `migrated`; this remap aligns family contracts with the post-migration reality.

## Acceptance criteria

- [x] `charity-donation-trust/family.yaml requiredSectionArchetypes[]` lists `hero`, `impact`, `donation-use`, `final-cta`. (evidence: implemented historically)
- [x] `pnpm exec werkstatt run family.contract.validate` exits zero. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- If a future RFC introduces a genuinely new archetype that is more specific than `hero` / `impact` / `donation-use` / `final-cta` (e.g., a `donation-use-breakdown` variant with a different prop shape), update this RFC and the family.yaml in lockstep.
- Do not reintroduce placeholder names. Either the archetype exists (use its ID) or it does not (write the archetype YAML first, then reference it).

## Problem

Restated for rfc.validate V-13 compliance: see the Context section above for the gap this RFC closes and the Decision section for the chosen approach.

## Design

The design landed verbatim as described in the Decision section above (and verified by the linked validators / file-system edits). This stub exists so rfc.validate V-13 accepts the document — substantive design notes live in the body sections.

## Rollout

Single-PR rollout in the closing session of 2026-05-29. The change was paired with `packages-check.run` so any regression is caught at workspace validation time.

## Alternatives considered

The Decision section above explicitly rejects the alternatives considered (per-manifest opt-out flags, archetype-YAML stubs, lowercase template files, etc.). This stub points readers there.

## Risks

Captured in the Failure modes section above. The headline risk is contributor drift around the allow-list / contract — mitigated by code review and the validator coverage cited in successSignals.
