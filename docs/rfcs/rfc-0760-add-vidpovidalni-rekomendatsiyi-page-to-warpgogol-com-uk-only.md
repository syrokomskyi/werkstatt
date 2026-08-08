---
id: RFC-0760
title: "Add Vidpovidalni Rekomendatsiyi page to warpgogol-com UK-only"
status: draft
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
reviewers: []
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0757
  - RFC-0758
  - RFC-0759
  - RFC-0026
  - RFC-0048
  - RFC-0049
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-17
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
packagesImpacted: []
successSignals:
  - "A new page with route `uk: vidpovidalni-rekomendatsiyi` is registered in system.md and renders at build time on warpgogol-com."
  - "The page is UK-only — no DE route is declared, and the page does not appear in the German site navigation or sitemap."
  - "The page composes ~19 blocks using existing and newly added archetypes (hero, markdown, comparison-cards, audience-cards, controlled-responsibility-block, send-message with custom checklist, dynamic-status-block, faq-list, final-cta, service-metadata-block)."
  - "The page passes page.block.validate, mirror.quintet.validate, and build.check with zero violations."
nonGoals:
  - "Does not create a German (DE) version of the page — UK-only for initial launch."
  - "Does not add new archetypes — RFC-0757, RFC-0758, RFC-0759 define the new archetypes; this RFC consumes them."
  - "Does not change the biome — the page uses the existing `handwerk-material-warm` biome."
  - "Does not add new shell components or navigation entries — the page is linked from existing pages via CTAs."
  - "Does not add server-side API endpoints — the two send-message forms use the existing `/api/send-message` endpoint."
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

# RFC-0760: Add Vidpovidalni Rekomendatsiyi page to warpgogol-com UK-only

## Context

The warpgogol-com site (mission `warpgogol-com-m000039`) needs a new page titled "Відповідальні рекомендації" (Responsible Recommendations). The page content was drafted by an expert and covers two programs: (1) a recommendation program where clients recommend Warpgogol to other businesses, and (2) a Market Steward program where a trusted partner manages open mandates in their region.

The page is initially UK-only — no German translation is needed for the first launch. The content draft includes ~19 sections: hero, program explanation, comparison table, audience cards, responsibility blocks, Market Steward intro, dynamic status (open mandate count), two forms with different informational requirements, FAQ, final CTA, and a service metadata footer.

Three new archetypes are required to render all sections: `send-message` with custom checklist items (RFC-0757), `dynamic-status-block` (RFC-0758), and `service-metadata-block` (RFC-0759). This RFC depends on all three being accepted and implemented first.

## Problem

1. **No route for the recommendation page.** The `system.md` pages array has no entry for `vidpovidalni-rekomendatsiyi`. Visitors cannot reach this content.

2. **No UK-only page precedent.** Existing pages on warpgogol-com have both `de` and `uk` routes. The route registry (RFC-0048) supports per-language routes, but no current page is UK-only. This RFC establishes the pattern: a page with a `uk` route and no `de` route.

3. **Depends on new archetypes.** The page requires three archetypes not yet in the catalog: `send-message` with custom checklist items (RFC-0757), `dynamic-status-block` (RFC-0758), and `service-metadata-block` (RFC-0759). Without these, the page cannot be composed from shared sections.

## Decision

A new page `vidpovidalni-rekomendatsiyi` is added to warpgogol-com's `system.md` with a UK-only route (`uk: vidpovidalni-rekomendatsiyi`, no `de` route). The page is composed of ~19 blocks using existing and newly added archetypes. The page content lives in `src/content/pages/uk/vidpovidalni-rekomendatsiyi.md` as a frontmatter-only block-declarative entry (DNA-24), with prose content in `src/content/prose/vidpovidalni-rekomendatsiyi.uk.md`.

## Architectural fit

- **DNA-17 (Uni manifest contract):** The page entry in `system.md` declares `pageId`, `semanticType`, `routes`, `cosmicStar`, `planets[]`, and `shell` — matching the existing manifest contract.
- **DNA-24 (Block-declarative pages):** The page content file is a frontmatter-only document with `kind: page`, `cosmicStar`, `title`, `description`, `lang: uk`, `blocks[]`. No markdown body — prose lives in `contentRef` entries.
- **DNA-25 (Single buildPage pipeline):** The page is rendered by the standard `buildPage` pipeline — no custom route handler.
- **RFC-0048 (Localized page slugs):** The page declares `routes: { uk: vidpovidalni-rekomendatsiyi }` with no `de` route. The route registry handles UK-only pages — the page is excluded from the German sitemap and hreflang tags.
- **RFC-0049 (hreflang/sitemap generation):** The sitemap generator excludes pages without a route for a given language. A UK-only page appears only in the UK sitemap.
- **RFC-0757 (send-message checklist):** The two forms on the page use `send-message` with custom `checklistItems[]` configurations.
- **RFC-0758 (dynamic-status-block):** The open-mandate counter section uses `dynamic-status-block`.
- **RFC-0759 (service-metadata-block):** The page footer uses `service-metadata-block`.
- **Biome:** The page uses the existing `handwerk-material-warm` biome — no biome changes.
- **Layer C:** New URL (`/vidpovidalni-rekomendatsiyi`), added to UK sitemap — `breaksC: true`.

## Design

### CLI surface

No new commands. The page is created by adding content files and a `system.md` entry — standard authoring workflow.

### Page configuration in system.md

```yaml
- pageId: vidpovidalniRekomendatsiyi
  semanticType: program-page
  routes:
    uk: vidpovidalni-rekomendatsiyi
  cosmicStar: Vega
  planets:
    - hero
    - markdown
    - comparison-cards
    - audience-cards
    - controlled-responsibility-block
    - markdown
    - audience-cards
    - markdown
    - markdown
    - markdown
    - controlled-responsibility-block
    - markdown
    - dynamic-status-block
    - controlled-responsibility-block
    - markdown
    - send-message
    - send-message
    - faq-list
    - final-cta
    - service-metadata-block
  shell:
    background: default
```

### Block composition (~19 blocks)

| § | Block type | Content source |
| --- | --- | --- |
| 1 | `hero` | Authored props (heading, subheading, CTA) |
| 2 | `markdown` | `contentRef: vidpovidalni-rekomendatsiyi/how-it-works.uk.md` |
| 3 | `comparison-cards` | Authored props (what-you-pay table) |
| 4 | `markdown` | `contentRef: vidpovidalni-rekomendatsiyi/openness-to-client.uk.md` |
| 5 | `audience-cards` | Authored props (who-is-this-for) |
| 6 | `controlled-responsibility-block` | Authored props (who-not-recommend) |
| 7 | `markdown` | `contentRef: vidpovidalni-rekomendatsiyi/market-steward-intro.uk.md` |
| 8 | `audience-cards` | Authored props (what-ms-does, 5 zones) |
| 9 | `markdown` | `contentRef: vidpovidalni-rekomendatsiyi/how-mandate-opens.uk.md` |
| 10 | `markdown` | `contentRef: vidpovidalni-rekomendatsiyi/what-ms-gets.uk.md` |
| 11 | `markdown` | `contentRef: vidpovidalni-rekomendatsiyi/mandate-not-lifetime.uk.md` |
| 12 | `dynamic-status-block` | Authored props (value: open mandate count, label) |
| 13 | `controlled-responsibility-block` | Authored props (what-ms-cannot-do) |
| 14 | `markdown` | `contentRef: vidpovidalni-rekomendatsiyi/public-verifiability.uk.md` |
| 15 | `send-message` | Authored props with custom `checklistItems[]` (website URL, CMS, contact) |
| 16 | `send-message` | Authored props with custom `checklistItems[]` (motivation, availability, contact) |
| 17 | `faq-list` | Authored props (FAQ items) |
| 18 | `final-cta` | Authored props (CTA to contact page) |
| 19 | `service-metadata-block` | Authored props (version, dates, links) |

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/warpgogol-com-m000039/workpiece/src/content/system.md` | Add `vidpovidalniRekomendatsiyi` page entry to `pages[]` array |
| `missions/warpgogol-com-m000039/workpiece/src/content/pages/uk/vidpovidalni-rekomendatsiyi.md` | New page content file (frontmatter-only, `kind: page`, `lang: uk`, `blocks[]`) |
| `missions/warpgogol-com-m000039/workpiece/src/content/prose/vidpovidalni-rekomendatsiyi/*.uk.md` | Prose content files referenced by `contentRef` in blocks |

### Output format

No `--json` output. The page renders as static HTML at `/vidpovidalni-rekomendatsiyi` (UK only).

### Failure modes

- **Missing DE route:** The route registry handles UK-only pages. The page is excluded from the German sitemap, hreflang tags, and German navigation. No error — this is the intended behavior for a UK-only page.
- **Missing archetype:** If RFC-0757, RFC-0758, or RFC-0759 are not implemented before this RFC, `page.block.validate` fails with an unknown block type error. This RFC depends on all three being implemented first.
- **Missing prose content:** If a `contentRef` points to a non-existent prose file, `page.block.validate` fails with a content reference resolution error.

## Rollout

- **Dependencies:** RFC-0757 (send-message checklist), RFC-0758 (dynamic-status-block), and RFC-0759 (service-metadata-block) must be accepted and implemented before this RFC can be implemented. The page cannot be composed without the new archetypes.
- **Implementation order:**
  1. Implement RFC-0757 → `send-message` gains `checklistItems[]`
  2. Implement RFC-0758 → `dynamic-status-block` archetype materialized via `section.scaffold`
  3. Implement RFC-0759 → `service-metadata-block` archetype materialized via `section.scaffold`
  4. Implement this RFC → add page content files and `system.md` entry
  5. Run `build.check` to validate block composition, route registry, and sitemap generation
- **UK-only launch:** The page is initially UK-only. A DE translation can be added in a follow-up mission by adding a `de` route and translating the prose content per the UK→DE translation guide.
- **Navigation:** The page is linked from existing pages via CTAs (hero CTA, final CTA). It is not added to the main navigation header — it is a destination page, not a top-level navigation item.
- **Sitemap:** The page appears in the UK sitemap only. The `sitemap.generate` command (RFC-0049) automatically excludes pages without a route for a given language.
- **No migrator needed:** The page is additive — no existing pages are changed.

## Alternatives considered

- **Add both UK and DE routes simultaneously.** Rejected — the operator explicitly requested UK-only for the initial launch. The DE translation can be added in a follow-up mission after the content is validated in production.

- **Add the page as a markdown-only page without new archetypes.** Rejected — the page requires dynamic status (open mandate count), custom form checklists, and a structured metadata footer. These cannot be rendered with `markdown` alone without misusing the archetype.

- **Add the page to a different site (not warpgogol-com).** Rejected — the recommendation and Market Steward programs are specific to warpgogol-com's business model.

- **Create a site-local section for the dynamic status and metadata footer.** Rejected — the operator decided that all archetypes remain shared. RFC-0758 and RFC-0759 create shared archetypes available to all sites.

## Risks

- **Dependency chain.** This RFC depends on RFC-0757, RFC-0758, and RFC-0759 being accepted and implemented first. If any of those RFCs are rejected or significantly changed, this RFC's block composition may need adjustment. Mitigation: the RFC explicitly declares dependencies in `related` and the rollout section.

- **UK-only precedent.** This is the first UK-only page on warpgogol-com. The route registry, sitemap generator, and hreflang tags must correctly handle a page with no DE route. Mitigation: RFC-0048 and RFC-0049 already support per-language routes — a page with only a `uk` route is a valid configuration. The `build.check` pipeline validates route registry consistency.

- **Content volume.** The page has ~19 blocks, which is more than typical pages (home: ~8, services: ~10). Mitigation: the block-declarative system handles arbitrary block counts. `page.block.validate` validates each block independently. Performance impact is negligible — each block is a static SSG render.

- **Two forms on one page.** The page has two `send-message` blocks. Each must have a unique `formId` to distinguish API submissions. Mitigation: the `send-message` section already supports `formId` via props — the two forms use different `formId` values (e.g. `recommendation-form` and `market-steward-form`).

- **Agent misinterpretation.** Agents may try to create the DE version simultaneously. Mitigation: the `Implementation notes for agents` section explicitly states UK-only and references the translation guide for future DE addition.

## Acceptance criteria

- [ ] `vidpovidalniRekomendatsiyi` page entry added to `system.md` `pages[]` with `routes: { uk: vidpovidalni-rekomendatsiyi }` (no `de` route), `cosmicStar`, `planets[]`, and `shell` (evidence: system.md entry)
- [ ] Page content file created at `src/content/pages/uk/vidpovidalni-rekomendatsiyi.md` with `kind: page`, `lang: uk`, `blocks[]` array (evidence: file exists, frontmatter valid)
- [ ] Prose content files created in `src/content/prose/vidpovidalni-rekomendatsiyi/*.uk.md` for all `contentRef` references (evidence: files exist)
- [ ] `page.block.validate` passes with zero violations for the new page (evidence: validator output)
- [ ] `mirror.quintet.validate` passes (evidence: validator output)
- [ ] `build.check` passes for warpgogol-com (evidence: build output, zero errors)
- [ ] Page renders at `/vidpovidalni-rekomendatsiyi` in UK build (evidence: build output, HTML file generated)
- [ ] Page does NOT render in DE build — no `/vidpovidalni-rekomendatsiyi` in German sitemap (evidence: sitemap output)
- [ ] Two `send-message` blocks have unique `formId` values (evidence: block props)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented). Draft RFCs cannot grant implementation permission.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT create a DE version of this page in the same mission. The page is UK-only for the initial launch. A DE translation requires a separate mission and must follow the UK→DE translation guide at `docs/translate/2026-07-28-uk-de-after-rebuild.md`.
- Agents MUST NOT implement this RFC before RFC-0757, RFC-0758, and RFC-0759 are implemented. The page depends on the new archetypes — `page.block.validate` will fail if the archetypes are not yet in the catalog.
- Agents MUST ensure the two `send-message` blocks have unique `formId` values to distinguish API submissions.
- Agents MUST NOT add the page to the main navigation header — it is a destination page linked via CTAs from other pages.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- UK content is the source of truth. When a DE translation is added in the future, UK content must be finalized first, then translated per the guide.
