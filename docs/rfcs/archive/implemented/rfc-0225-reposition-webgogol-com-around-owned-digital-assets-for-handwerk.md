---
id: RFC-0225
title: "Reposition webgogol-com around owned digital assets for Handwerk"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-21
updatedAt: 2026-06-21
implementedAt: 2026-06-23
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0047
  - RFC-0160
  - RFC-0205
  - RFC-0211
  - RFC-0220
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/ontology"
successSignals:
  - "`pnpm exec site-kernel run rfc.validate` passes."
  - "`pnpm exec site-kernel run page.block.validate --app webgogol-com` passes."
  - "`pnpm --filter @gogol/ontology build:check` passes."
  - "`pnpm exec site-kernel run apps-check.run --app webgogol-com` passes or reports only pre-existing unrelated issues."
nonGoals:
  - "No four-segment homepage launch before a signed case proves a second doorway."
  - "No new shared UI package contract unless existing section archetypes cannot express the content."
  - "No guaranteed lead counts, ROI, or Google ranking promises."
  - "No live third-party platform price claim without CKL provenance."
---

# RFC-0225: Reposition webgogol-com around owned digital assets for Handwerk

## Context

The `webgogol-com` homepage is the studio's primary marketing surface for small local businesses and Handwerk in Germany. A June 2026 external communication review (`WarpGogol-STRA.pdf`) found that the page currently explains the product as a technical and contractual foundation, but lets the "Notausgang" exit promise appear too early in the first decision frame. The visitor's first question is "why this provider?", while the page partially answers "how can I leave?" before the result is clear.

The site's long-term strategy remains bigger than a web-studio pitch: Webgogol builds owned digital assets and infrastructure for small businesses. The homepage needs to translate that philosophy into a customer-readable first-screen promise for the current launch market: Handwerk and small local operators around Backnang / Stuttgart.

The app is already an RFC-0047 CMS-friendly content surface. The repositioning should therefore happen through `src/content/system.md`, localized page blocks, prose, navigation, and site labels first, using existing shared section archetypes where they fit.

## Problem

The homepage has three communication failure modes:

1. The hero and decision card emphasize open price, ownership, and exit at the same level. That makes "Notausgang" part of the first buying frame instead of a later trust proof.
2. The audience section still reads like a broad studio surface for Handwerk, local business, and recommenders. Without signed cases in several verticals, this can look like a multi-segment agency promise before the market proof exists.
3. Some visible copy still talks from the engine room: "structured data", "technical model", "digital foundation". These are true, but the Handwerk buyer needs the result first: being found, receiving calls, not having to manage technology, owning the asset, and knowing the exit is clean.

The invariant to protect is not "remove digital sovereignty". It is the opposite: ownership remains the strategic spine, but the first viewport must translate it into business value before explaining the infrastructure.

## Decision

`webgogol-com` adopts a "one proven doorway, modular expansion later" homepage strategy:

- The first screen leads with the result for Handwerk: a website/digital asset that helps the business be found, brings calls and inquiries closer, and belongs to the customer.
- The ownership-versus-rental contrast moves directly below the first proof layer and compares owned digital assets with lead platforms and closed builders.
- "Notausgang" moves out of the hero/first-decision frame and becomes a trust and transparent-terms section near price, responsibility, FAQ, and CTA.
- The audience section becomes a single active Handwerk solution card, with future segments described only as architecture-ready expansion triggered by a signed case and real demand.
- AI visibility is expressed as a customer result ("people can find you when they ask Google or AI assistants") without percentage claims or guaranteed lead promises.
- Legal cleanliness, DSGVO posture, accessibility, and structured data remain engine responsibilities surfaced as "less for you to manage", not fear-based warnings.

## Architectural fit

This is an app-content positioning decision, not a new platform command.

It fits RFC-0047 because visitor-facing meaning stays in content domains: `pages/{lang}`, `prose/{lang}`, `navigation/{lang}`, `site/{lang}`, and `system.md`. Routes remain thin and no page assembly is hardcoded in Astro files.

It fits RFC-0205 because localized `de` and `uk` homepage blocks must remain mirrored in structure. Any new visible German block must be mirrored in Ukrainian with formal address (`Ви`, `Ваш`, `Вас`).

It fits RFC-0211 because volatile third-party price facts should not become live claims without provenance. The comparison can mention platform contact fees and closed hosting models only when framed as stable, sourced categories; exact current prices must go through CKL before publishing.

It fits RFC-0220 because no new material assets are required for the repositioning. If new images or videos are later added, credit sidecars remain mandatory.

## Design

### CLI surface

No new CLI surface is introduced.

Validation uses existing commands:

```sh
pnpm exec site-kernel run rfc.validate
pnpm exec site-kernel run page.block.validate --app webgogol-com
pnpm exec site-kernel run material.credits.validate --app webgogol-com
pnpm exec site-kernel run apps-check.run --app webgogol-com
```

### TypeScript contracts

No new TypeScript contract is required for the initial implementation. Existing section prop contracts are sufficient:

- `hero-decision-card`
- `video-section`
- `comparison-cards`
- `audience-cards`
- `ownership-block`
- `notausgang-block`
- `controlled-responsibility-block`
- `price-card`
- `people`
- `markdown`
- `final-cta`

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/rfcs/rfc-0225-reposition-webgogol-com-around-owned-digital-assets-for-handwerk.md` | Governance record for the repositioning decision. |
| `apps/webgogol-com/src/content/system.md` | Homepage constellation order and page rationale. |
| `apps/webgogol-com/src/content/pages/de/home.md` | German homepage blocks and first-screen communication. |
| `apps/webgogol-com/src/content/pages/uk/home.md` | Ukrainian mirrored homepage blocks. |
| `apps/webgogol-com/src/content/prose/{de,uk}/home-*.md` | Longer FAQ/video explanatory copy. |
| `apps/webgogol-com/src/content/site/{de,uk}/labels.md` | Header/footer copy and nav emphasis. |
| `apps/webgogol-com/src/content/navigation/{de,uk}/navigation.md` | Navigation labels if the public wording changes. |

Generated files and route files are not edited for this repositioning.

### Output format

No new output format is introduced.

### Failure modes

Failure remains covered by existing validators:

- `page.block.validate` fails when block props no longer match section schemas or when homepage planets drift from `system.md`.
- `page.blocks.mirror.validate` fails when localized home blocks diverge in a way that can silently drop visible text.
- `content.claim.validate` / `content.freshness.validate` warn or fail according to CKL policy if volatile claims are changed without provenance.
- `material.credits.validate` fails if new material tokens are introduced without sidecars.

## Rollout

This RFC applies only to `webgogol-com`.

The first rollout is a direct homepage content revision:

1. Rewrite the hero around the Handwerk result and remove Notausgang from the first decision card.
2. Move ownership contrast above transparent exit conditions.
3. Collapse audience segmentation into one active Handwerk doorway and one "future expansion by proof" note.
4. Reframe technical, legal, and AI visibility points as customer outcomes.
5. Mirror the German structure into Ukrainian.
6. Validate with existing app and content checks.

Future rollout opens a second segment only when a signed case and observable demand identify the next doorway. That follow-up may need a separate RFC if it changes the site contract or adds reusable section behavior.

## Alternatives considered

**Scenario A: one Handwerk focus only.** This is fast and clear, but leaves no visible architecture for later segment expansion.

**Scenario B: four public segment doors now.** This uses the segmentation idea too early. Without signed cases in each segment, it risks making Webgogol look like a generic agency for everyone.

**Scenario C: one focus with modular expansion.** This is selected. It preserves launch focus, keeps the founder-scale workload realistic, and leaves a clear condition for future segment expansion.

## Risks

The main risk is overcorrecting into a shallow lead-generation pitch and losing the larger digital-sovereignty strategy. The copy must make the first screen practical for Handwerk while preserving ownership as the reason the offer exists.

Another risk is publishing volatile third-party platform prices from secondary analysis. Exact competitor prices must be verified and claimed through CKL before they become live content.

A third risk is localization drift: German and Ukrainian home blocks must remain structurally mirrored, and Ukrainian copy must keep formal direct address.

## Acceptance criteria

- [x] The German hero leads with customer result, ownership, and being found; it does not use Notausgang as the first decision frame. (evidence: implemented historically)
- [x] The Ukrainian hero mirrors the German structure and uses formal address. (evidence: implemented historically)
- [x] Ownership-versus-rental appears before Notausgang on the homepage. (evidence: implemented historically)
- [x] Notausgang is preserved as transparent terms / trust proof near price, responsibility, FAQ, or CTA. (evidence: implemented historically)
- [x] The audience/solution block exposes one active Handwerk doorway and no empty four-segment showcase. (evidence: implemented historically)
- [x] AI visibility is described as findability without lead-count, ROI, or ranking guarantees. (evidence: implemented historically)
- [x] No exact live competitor price claim is added without CKL provenance. (evidence: implemented historically)
- [x] Existing shared section archetypes are reused unless validation proves they cannot express the design. (evidence: implemented historically)
- [x] Page, mirror, material-credit, and app checks pass or documented unrelated pre-existing issues are listed. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST NOT change this RFC's status fields; only a human with architecture role may do that.
- Agents MUST check accepted RFCs before adding new commands, reusable UI contracts, or validation rules related to this scope.
- Agents MUST NOT publish exact third-party platform prices as live facts without CKL provenance and freshness handling.
- Agents MUST preserve the long-term digital-sovereignty philosophy while translating first-screen copy into Handwerk buyer language.
