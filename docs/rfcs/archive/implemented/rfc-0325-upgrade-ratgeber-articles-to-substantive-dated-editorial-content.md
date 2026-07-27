---
id: RFC-0325
title: "Upgrade Ratgeber articles to substantive dated editorial content"
status: implemented
kind: contract
scope: app
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-06
implementedAt: 2026-07-06
closedAt:
supersedes: []
supersededBy:
  - RFC-0500
amends: []
amendedBy: []
related:
  - RFC-0167
  - RFC-0317
  - RFC-0320
commands:
  proposed: []
  added:
    - article.depth.validate
  changed:
    - blog.validate
    - feed.generate
    - feed.validate
    - page.markdown.generate
    - page.markdown.validate
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-content"
  - "@gogol/surface"
  - "@gogol/ontology"
  - "@gogol/ui"
successSignals:
  - "Ratgeber pages are dated editorial articles with enough substance for their genre, not teaser stubs."
  - "Website-cost and local-visibility articles use the site's own transparent offer math as concrete examples."
  - "Dated articles appear in RSS/JSON feeds and Markdown twins with published/updated provenance."
nonGoals:
  - "Do not implement this RFC while it is draft."
  - "Do not pad articles with generic SEO filler to satisfy a word count."
  - "Do not rewrite Ukrainian article translations in this RFC unless a later owner decision expands scope."
acceptance:
  - probe: command-registered
    name: "article.depth.validate"
---

# RFC-0325: Upgrade Ratgeber articles to substantive dated editorial content

## Context

The July 5 public audit found that three German Ratgeber pages read like article stubs: roughly 120-150 words, two bullet points, and one QA. The tone is useful, but the genre promise is larger than the content. The owner decision is to write an RFC now and keep it in `draft`; article work will happen later.

RFC-0167 already defines articles and blog/Ratgeber metadata. RFC-0317 already moves feeds toward dated editorial content and away from evergreen product pages. This RFC specifies the editorial target for the later Ratgeber upgrade.

## Problem

Thin Ratgeber pages create three defects:

- they compete for informational queries without answering the topic in enough depth;
- they underuse the site's strongest material, especially transparent price math and exit/ownership questions;
- generated public surfaces lack article dates and feed inclusion, weakening crawler and agent trust.

The platform needs a generic definition of "substantive article" before agents expand the current pages.

## Decision

Draft a Ratgeber content upgrade contract, but do not implement it until this RFC is accepted.

When accepted, German Ratgeber articles on `webgogol-com` should become dated editorial pages with:

- at least 500 words of substantive body text per article;
- `publishedAt` and `updatedAt` metadata in `system.md` article declarations;
- inclusion in RSS and JSON Feed via RFC-0317;
- Markdown twin provenance via RFC-0320;
- concrete examples grounded in the site's own offer data where relevant;
- no generic filler paragraphs or unsourced market facts.

## Architectural fit

This RFC will extend RFC-0167's article model rather than creating a second Ratgeber system. Articles remain block-declarative pages with body prose in `src/content/prose/{lang}/`. Feed and Markdown twin behavior comes from the existing public artifact generators.

The proposed `article.depth.validate` is generic. It should not know webgogol-com article slugs; it checks article pages by semantic type and site policy.

## Design

### Article requirements

For each Ratgeber article:

- `system.md pages[].semanticType` is `article`;
- `article.publishedAt` is required;
- `article.updatedAt` is required once the page is materially revised;
- the article has a prose body, not only frontmatter blocks;
- normalized body text excluding navigation, footer, FAQ schema wrappers, and repeated CTAs has at least 500 words;
- each H2 section has at least one substantive paragraph, table, list, or QA item beneath it.

Word count is a floor, not the target. `article.depth.validate` should also catch heading-only sections and repeated boilerplate.

### webgogol-com editorial targets

When this RFC becomes accepted, update at least:

1. `website-kosten`
   - include a table: one-time costs, running costs, hidden costs;
   - use `200 EUR`, `70 EUR / month`, `700 EUR / year`, `15 EUR per additional change`, and `90 EUR / hour` from canonical offer data, not duplicated prose;
   - include a checklist: domain, content, ownership, exit.

2. `lokale-sichtbarkeit`
   - explain concrete signals such as NAP consistency, opening hours, load-time threshold, structured data, and regional search intent;
   - include at least one measurable example that is source-backed or explicitly framed as a process example, not an external market fact.

3. The third audited Ratgeber article
   - must be expanded according to the same standard after the exact source page is confirmed from the current route registry during implementation.

### Feed and twins

`feed.generate` must include accepted Ratgeber articles because RFC-0317 defines feeds as dated editorial surfaces. Markdown twins must carry RFC-0320 provenance, including source-backed `lastModified`.

### Proposed validator

`article.depth.validate` is app-scoped and read-only.

It checks:

- article pages have `publishedAt`;
- `updatedAt >= publishedAt` when present;
- normalized body word count meets the site policy floor;
- headings are followed by substantive content before the next heading;
- article pages with `publishedAt` appear in feed outputs;
- feed item URLs match canonical HTML URLs;
- Markdown twins for article pages include article dates in provenance or body metadata.

Diagnostics:

- `ART-DEPTH-01`: article missing required dates;
- `ART-DEPTH-02`: article body below word floor;
- `ART-DEPTH-03`: heading without substantive content;
- `ART-DEPTH-04`: dated article absent from feed;
- `ART-DEPTH-05`: article twin missing provenance/date metadata.

## Pipeline placement

If accepted and implemented:

- `article.depth.validate` runs in `apps-check.author` and `build.check`;
- feed/twin parity checks remain in their specialized validators;
- public artifact hygiene remains in RFC-0316.

## Rollout

This RFC is draft. Do not implement until accepted.

Later rollout:

1. Confirm the current German Ratgeber route set from `system.md`.
2. Expand German article prose.
3. Add article dates to `system.md`.
4. Wire or implement `article.depth.validate`.
5. Regenerate feed, Markdown twins, llms, and behavior snapshot.
6. Review snapshot and feed diffs.

## Alternatives considered

- **Delete thin Ratgeber pages.** Rejected for now; the topics are useful.
- **Accept the current stub length.** Rejected by audit, but implementation is deferred.
- **Use AI filler to reach 500 words.** Rejected. The goal is helpful depth, not volume.

## Risks

- **Word-count gaming.** Mitigated by heading-content checks and editorial review.
- **Dates become fake freshness.** Mitigated by RFC-0317 source-backed update stamps.
- **Scope creep into Ukrainian translations.** Mitigated by keeping this draft German-first until a later owner decision expands scope.

## Acceptance criteria

- [x] This RFC is accepted before implementation starts. (evidence: implemented historically)
- [x] `article.depth.validate` is registered and fixture-tested. Registered in (evidence: implemented historically) `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts`, wired into `apps-check-author.ts` (and therefore `build.check`). Unit-tested (`src/tests/article-depth.test.ts`, 9 cases covering the word-count floor and thin-heading detection) and verified against the live `webgogol-com` article set (`article.depth.validate: OK — 4 article(s) conform`).
- [x] German Ratgeber articles have at least 500 substantive words each. Confirmed for (evidence: implemented historically) `website-kosten`, `lokale-sichtbarkeit`, and the `ratgeber` hub — each carries a `prose/{lang}/ratgeber-*` body (500-650 words) plus the existing field-driven sections.
- [x] Article dates are present and source-backed. `publishedAt`/`updatedAt`/`author`/`tags` are (evidence: implemented historically) authored on the topic records (depth-1) and the blueprint level (depth-0 hub); resolved into `VirtualRouteEntry.article` and threaded through `resolveAuthoredStamp` (RFC-0317).
- [x] Ratgeber articles appear in RSS and JSON Feed. `feed.generate` now includes Programmatic (evidence: implemented historically) Surface article entries; verified `feed.generate: 4 item(s)` (digitalesFundament + the 3 Ratgeber pages) on a full `webgogol-com` build.
- [x] Article Markdown twins include RFC-0320 provenance. `page.markdown.generate` now emits twins (evidence: implemented historically) for article-typed surface entries (both `de` and `uk` routes); verified frontmatter (`canonical`/`lastModified`/`contentHash`/`license`) and `page.markdown.validate: 56 twin(s)     frontmatter ok`.
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Do not implement while `status: draft`.
- When accepted, edit German article sources, not generated public files.
- Pull prices and offer terms from canonical offer data.
- Treat external factual examples as CKL claims if they describe the outside world.
