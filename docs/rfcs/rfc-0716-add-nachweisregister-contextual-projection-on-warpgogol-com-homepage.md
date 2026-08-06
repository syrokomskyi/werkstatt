---
id: RFC-0716
title: "Add Nachweisregister contextual projection on warpgogol-com homepage"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: app
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0708
  - ADR-0028
  - RFC-0706
  - RFC-0707
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-24
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals:
  - "Homepage renders Nachweisregister trust-strip section with CTA to /nachweise/"
  - "Services page references Nachweise as project evidence"
  - "Pricing page references Nachweise as verification context for fixed-price promise"
  - "Team page links to /nachweise/ as evidence of project experience"
  - "Notausgang page references Nachweise as trust signal for exit safety"
  - "All projections use existing block types (trust-strip, transparency) — no new components"
nonGoals:
  - "Does not add Nachweis projections to every page — only pages where Nachweis context adds trust value"
  - "Does not project individual Nachweis records onto pages — records remain draft and not publicly visible"
  - "Does not create new UI components — uses existing trust-strip and transparency block types"
  - "Does not change the Nachweis page architecture established by RFC-0708"
  - "Does not publish pilot records — both remain with status: draft"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0716: Add Nachweisregister contextual projection on warpgogol-com homepage

## Context

RFC-0708 implemented the Nachweis UI components, site pages, and pilot content for warpgogol-com. It explicitly deferred contextual projections on non-Nachweis pages as a nonGoal: "Does not implement contextual projections on service pages — deferred."

The warpgogol-com homepage (`/`) and key pages (services, pricing, team, notausgang) currently have no reference to the Nachweisregister. Visitors on these pages have no signal that Warpgogol documents project evidence with cryptographic verification. The Nachweisregister exists as an isolated set of pages at `/nachweise/` with no entry point from the site's main content flow.

ADR-0028 establishes Nachweisregister as a PBP trust-layer extension. The trust value of the Nachweisregister increases when it is visible in the contexts where visitors make decisions — not only on a dedicated page that few will discover on their own.

## Problem

1. **No Nachweisregister visibility on the homepage.** The homepage is the primary entry point for most visitors. It has trust signals (availability, exit conditions, pricing transparency) but no reference to the Nachweisregister. Visitors who would value documented project evidence never discover it.

2. **No Nachweis context on services page.** The services page describes what Warpgogol does, but does not link to evidence that Warpgogol has done it. A visitor evaluating services has no path from "what we do" to "proof we did it".

3. **No Nachweis context on pricing page.** The pricing page promises fixed prices and transparent scope. The Nachweisregister supports this trust claim by showing that Warpgogol documents its work — but the pricing page does not reference it.

4. **No Nachweis context on team page.** The team page lists people and AI agents. It does not link to project evidence associated with the team.

5. **No Nachweis context on notausgang page.** The notausgang page promises safe exit conditions. The Nachweisregister as a trust signal (documented, verifiable, timestamped records) supports this promise — but the notausgang page does not reference it.

## Decision

Add Nachweisregister contextual projections to five key pages on warpgogol-com using existing block types (trust-strip, transparency). No new UI components, no new commands, no new packages. Each projection is a content-only addition to an existing page's `blocks[]` array.

### Homepage (`home.md`, UK + DE)

Add a `nachweis-register` trust-strip block before the final `availability` CTA. The block contains:

- Heading: "Nachweisregister" / "Реєстр доказів"
- Subheading explaining cryptographic verification
- Three list items: SHA-256 hash, Ed25519 operator signature, RFC 3161 qualified timestamp
- CTA linking to `/nachweise/`

### Services page (`services.md`, UK + DE)

Add a `nachweis-reference` transparency block after the services list, before the final CTA. The block references the Nachweisregister as project evidence with a CTA to `/nachweise/`.

### Pricing page (`pricing.md`, UK + DE)

Add a `nachweis-reference` transparency block in the transparency section, linking the fixed-price promise to documented project evidence.

### Team page (`team.md`, UK + DE)

Add a `nachweis-reference` transparency block after the team lists, linking team experience to the Nachweisregister. The team page's `planets[]` in `system.md` must be extended with `Tethys` (pin 1.3.0) — it is not currently pinned for this page, and `page.block.validate` (rule B-02) will reject the `transparency` block without it.

### Notausgang page (`notausgang.md`, UK + DE)

Add a `nachweis-reference` transparency block in the exit-safety section, referencing the Nachweisregister as a trust signal for documented, verifiable operations.

## Architectural fit

- **Block-declarative pages (RFC-0047, DNA-24):** All projections are content-only additions to existing pages' `blocks[]` arrays. No new page entries in `system.md`, no new routes, no new components. The `trust-strip` and `transparency` block types already exist in the archetype registry.
- **RFC-0708 scope:** RFC-0708 established the Nachweis pages and explicitly deferred contextual projections. This RFC implements the deferred item without changing the Nachweis page architecture.
- **PBP trust layer (ADR-0028):** Contextual projections increase the visibility of the Nachweisregister trust layer, connecting it to the site's main content flow.
- **UK as source of truth:** All content additions are authored in UK first, then translated to DE maintaining semantic parity.
- **No new commands or packages:** This RFC is pure content composition — no kernel commands, no schema changes, no package boundaries.

## Design

### Block structure

All projections use existing block types from the archetype registry. No new archetypes, no new components, no new cosmic names.

#### Homepage `nachweis-register` block

```yaml
- id: nachweis-register
  type: trust-strip
  props:
    header:
      heading: "Реєстр доказів"
      subheading: "Документовані підтвердження проєктів з криптографічною верифікацією."
    background:
      kind: transparent
    body:
      kind: list
      iconColor: primary
      align: center
      items:
        - text: "SHA-256-хеш — незалежна перевірка цілісності документа"
        - text: "Підпис оператора (Ed25519) — гарантія, що запис походить від Warpgogol"
        - text: "Кваліфікована мітка часу (RFC 3161) — незмінна фіксація часу публікації"
    cta:
      label: "Переглянути докази"
      target: nachweise
```

> Note: The homepage already has a `trust-strip` block (`id: promo`). The new `nachweis-register` block has a distinct heading ("Реєстр доказів" / "Nachweisregister") to satisfy axe landmark-unique — both unique IDs and unique accessible names are required.

#### Service pages `nachweis-reference` block

```yaml
- id: nachweis-reference
  type: transparency
  props:
    header:
      heading: "Проєктні докази"
      subheading: "Документовані підтвердження для виконаних проєктів."
    background:
      kind: transparent
    body:
      kind: paragraphs
      paragraphs:
        - "Warpgogol документує результати проєктів з криптографічною верифікацією."
    cta:
      label: "Переглянути докази"
      target: nachweise
```

> Examples show UK text as source of truth. DE translation maintains semantic parity.

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/home.md` | Homepage UK — add nachweis-register block |
| `missions/warpgogol-com-m000033/workpiece/src/content/pages/de/home.md` | Homepage DE — add nachweis-register block |
| `missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/services.md` | Services UK — add nachweis-reference block |
| `missions/warpgogol-com-m000033/workpiece/src/content/pages/de/services.md` | Services DE — add nachweis-reference block |
| `missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/pricing.md` | Pricing UK — add nachweis-reference block |
| `missions/warpgogol-com-m000033/workpiece/src/content/pages/de/pricing.md` | Pricing DE — add nachweis-reference block |
| `missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/team.md` | Team UK — add nachweis-reference block |
| `missions/warpgogol-com-m000033/workpiece/src/content/pages/de/team.md` | Team DE — add nachweis-reference block |
| `missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/notausgang.md` | Notausgang UK — add nachweis-reference block |
| `missions/warpgogol-com-m000033/workpiece/src/content/pages/de/notausgang.md` | Notausgang DE — add nachweis-reference block |
| `missions/warpgogol-com-m000033/workpiece/src/content/system.md` | Add Tethys (pin 1.3.0) to team page `planets[]` |

## Rollout

- **warpgogol-com pilot:** Content blocks are added to the mission workpiece. The projections render immediately — the Nachweisregister page already exists with an empty state (RFC-0708). The CTA links to `/nachweise/` which shows the empty-state message.
- **No entitlement gate needed:** The projections are static content blocks, not dynamic Nachweis components. They render regardless of the `nachweis` entitlement. The CTA target (`/nachweise/`) is itself gated by the entitlement — if the entitlement is removed, the CTA link breaks gracefully (404).
- **Client site adoption:** Client sites that activate the `nachweis` entitlement can add similar contextual projections to their pages. This RFC establishes the pattern for warpgogol-com; client sites follow the same block-declarative approach.

## Alternatives considered

- **Nachweis projections on every page:** Rejected. Adding Nachweis references to every page would dilute the signal and create maintenance burden. Only pages where Nachweis context adds trust value (homepage, services, pricing, team, notausgang) receive projections.
- **Dynamic projections that show published records:** Rejected. No records are published yet (both pilot records have `status: draft`). Dynamic projections would show nothing. Static projections with CTA to `/nachweise/` are appropriate for the pilot phase.
- **New component for contextual projections:** Rejected. Existing `trust-strip` and `transparency` block types are sufficient. Creating a new component for each projection point would violate the composition-only principle.
- **Defer all projections until records are published:** Rejected by operator decision. The Nachweisregister concept is valuable even without published records — the projections explain the verification approach and build trust in the process.

## Risks

- **Empty Nachweisregister page:** The CTA links to `/nachweise/` which shows an empty-state message ("Nachweise werden zur Veröffentlichung vorbereitet"). Visitors following the CTA find a page with no records. Mitigation: the empty-state message is designed as a deliberate "coming soon" section, not a broken page (RFC-0708).
- **Projection staleness:** If the Nachweisregister concept evolves, the projection text on five pages must be updated in both UK and DE. Mitigation: the text is generic enough to remain valid across concept evolution.
- **CTA link breakage if entitlement removed:** If the `nachweis` entitlement is removed from warpgogol-com, the CTA target `/nachweise/` returns 404. Mitigation: the entitlement is declared in `system.md` and is not expected to be removed during the pilot.

## Acceptance criteria

- [ ] Homepage (UK + DE) renders `nachweis-register` trust-strip block with CTA to `/nachweise/`
- [ ] Services page (UK + DE) renders `nachweis-reference` transparency block with CTA to `/nachweise/`
- [ ] Pricing page (UK + DE) renders `nachweis-reference` transparency block with CTA to `/nachweise/`
- [ ] Team page (UK + DE) renders `nachweis-reference` transparency block with CTA to `/nachweise/`
- [ ] Notausgang page (UK + DE) renders `nachweis-reference` transparency block with CTA to `/nachweise/`
- [ ] All projections use existing block types (trust-strip, transparency) — no new components created
- [ ] UK content is source of truth, DE maintains semantic parity
- [ ] `astro check` passes for warpgogol-com
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement content changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Use `mission.git.commit` to commit changes in the workpiece — not direct `git commit`.
- UK content is source of truth — author UK first, then translate to DE.
- All projections use existing block types only — do not create new components.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it (RFC-0334).
