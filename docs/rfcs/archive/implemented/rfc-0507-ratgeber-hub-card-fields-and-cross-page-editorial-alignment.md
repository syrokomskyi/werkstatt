---
id: RFC-0507
title: "Ratgeber hub card fields and cross-page editorial alignment"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-23
updatedAt: 2026-07-23
implementedAt: 2026-07-23
enhancedAt: 2026-07-23
supersedes: []
supersededBy:
amends:
  - RFC-0500
amendedBy: []
related:
  - RFC-0193
  - RFC-0325
  - RFC-0487
  - RFC-0498
  - RFC-0500
  - RFC-0501
  - RFC-0502
  - RFC-0504
  - RFC-0505
satisfies:
  - DNA-16
  - DNA-24
breaksC: false
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - ratgeber.hub.validate
    - content.voice.lint
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/site-kernel-checks"
successSignals:
  - "Ratgeber hub article cards display five fields: title, articleType, question, reviewedAt, readTime — the current baker renders only title + description (summary); this RFC adds articleType, question, reviewedAt, readTime and removes description from the card."
  - "The /preis/ page remains the canonical price source — ratgeber articles reference PBP price values but do not become alternative price sheets."
  - "The /leistungen/digitales-fundament/ page does not claim guaranteed KI-Auffindbarkeit, structured data rankings, visitor-to-inquiry conversion, or automatic city-page generation."
  - "The /website/ surface pages reference local visibility rules from the ratgeber article and do not use the article as justification for mass city-page generation."
  - "The /notausgang/ page content is aligned with the migration risk matrix and Übergabe artifacts described in the website-kosten article."
  - "The footer does not link to removed Widerruf or Muster-Widerrufsformular routes (RFC-0487)."
  - "The footer groups Barrierefreiheit, Open Source, and Bildnachweise under a Transparenz section."
  - "ratgeber.hub.validate checks the updated five-field card standard."
nonGoals:
  - "Does not change URL structure for any page — all changes are content and layout only."
  - "Does not create new pages or routes."
  - "Does not change the ratgeber blueprint axis or level configuration."
  - "Does not change JSON-LD emission — that is RFC-0506."
  - "Does not define the 12-section article archetype — that is RFC-0504."
  - "Does not define the claim registry — that is RFC-0505."
---

# RFC-0507: Ratgeber hub card fields and cross-page editorial alignment

## Context

RFC-0500's successSignal described a seven-field hub card standard (category, title, question, summary, articleType, readTime, reviewedAt). However, the actual `bakeRatgeberHub` implementation (`packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-hub.ts`) uses `linkedCardGrid` which renders cards with only `title` and `description` (mapped from `summary`). The fields `articleType`, `question`, `reviewedAt`, and `readTime` were never rendered on cards — they exist in article records but are not displayed on the hub. An external expert review (file 15.1, section 9) requires a five-field card and editorial alignment across multiple pages that reference or are referenced by the ratgeber articles.

The two reference articles (lokale-sichtbarkeit, website-kosten) make corrected claims about local visibility, Core Web Vitals, structured data, cost models, and migration risks. Other pages on the site that make related claims must be aligned to avoid contradictions.

## Problem

1. **Hub card missing fields.** The current `bakeRatgeberHub` renders cards with only `title` and `description` (from `summary`) via `linkedCardGrid`. The expert requires five fields: title, articleType, question, reviewedAt, readTime. The `description` (summary) field is removed from the card (summary is visible on the article page). `category` was never rendered on cards — it is shown via thematic grouping (Themenbereiche section). The actual work is: **add** `articleType`, `question`, `reviewedAt`, `readTime` to card rendering and **remove** `description` (summary) from the card.

2. **`/leistungen/digitales-fundament/` contradictions.** The service page makes claims about KI-Auffindbarkeit, structured data guarantees, visitor-to-inquiry conversion, and regional pages that contradict the corrected ratgeber articles. Specifically:
   - Claims that structured data ensures correct location recognition.
   - Claims that visibility converts to inquiries.
   - Claims that regional pages are automatically recommended.

3. **`/website/` surface pages.** City and industry pages do not reference the local visibility rules from the ratgeber article. The expert requires that these pages link to the article and do not use it as justification for mass city-page generation.

4. **`/notausgang/` misalignment.** The exit page content does not match the migration risk matrix and Übergabe artifacts described in the website-kosten article.

5. **Footer stale links.** The footer still contains links to Widerruf and Muster-Widerrufsformular — routes that were removed by RFC-0487. The footer also groups Barrierefreiheit, Open Source, and Bildnachweise separately, when the expert requires them under a Transparenz section.

6. **`/preis/` canonicality.** The ratgeber website-kosten article references PBP price values. The /preis/ page must remain the canonical price source — the article must not become an alternative price sheet.

## Decision

### Hub card fields

Extend `linkedCardGrid` in `packages/os/site-kernel-checks/src/surface-expand/bake-blocks.ts` to accept optional `articleType`, `question`, `reviewedAt`, `readTime` fields in each card object. Update `bakeRatgeberHub` to pass these fields from article records and stop passing `description` (summary).

Card shape after change:

| Field        | Source                       | Card prop     | Display         |
| ------------ | ---------------------------- | ------------- | --------------- |
| Title        | Article record `title`       | `title`       | H3 heading      |
| Article type | Article record `articleType` | `articleType` | Label/badge     |
| Question     | Article record `question`    | `question`    | Subtitle        |
| Reviewed at  | Article record `reviewedAt`  | `reviewedAt`  | Date string     |
| Read time    | Article record `readTime`    | `readTime`    | Duration string |

Removed from card props: `description` (was mapped from `summary`). `category` was never in card props — it drives thematic grouping via the Themenbereiche section.

Missing fields are omitted gracefully (conditional spread, same pattern as current `description`). If an article record lacks `articleType`, `question`, `reviewedAt`, or `readTime`, the card renders without that field — no error. RG-HUB-08 already validates required article metadata fields at the record level.

`ratgeber.hub.validate` (RFC-0500) updates:

- **RG-HUB-09**: Inspect `blocks[].props.body.cards[]` on the hub page (depth-0, `surfaceId: ratgeber`) for `audience-cards` blocks. Each card object must not contain a `description` key (which was the `summary` mapping). This rule has `warning` severity — it catches residual `description` props from stale bakers without blocking builds during migration. False-positive rate: near-zero — `description` is a specific key name, not a pattern match. Suppression: fix the baker to stop emitting `description` in card props.

### `/leistungen/digitales-fundament/` corrections

Content changes (UK + DE):

- Remove or soften claims about guaranteed KI-Auffindbarkeit.
- Remove claims that structured data ensures correct location recognition.
- Remove claims that visibility converts to inquiries.
- Remove automatic city-page generation recommendation.
- Add link to `/ratgeber/lokale-sichtbarkeit/` (DE) or `/porady/lokalna-vydymist/` (UK) for detailed guidance.

These are content-only changes to prose files — no package changes.

### `/website/` surface pages

Content changes (UK + DE):

- Add reference to local visibility rules from the ratgeber article.
- Do not use the ratgeber article as justification for mass city-page generation.
- Link to `/ratgeber/lokale-sichtbarkeit/` (DE) or `/porady/lokalna-vydymist/` (UK) where local visibility is discussed.

These are content-only changes to surface page prose — no package changes.

### `/notausgang/` alignment

Content changes (UK + DE):

- Align Übergabe and migration artifact descriptions with the website-kosten article's risk matrix.
- Do not claim that migration necessarily destroys history or requires starting from scratch.
- Reference the conditional risk matrix (domain ownership, export format, URL stability, external accounts).

These are content-only changes to prose files — no package changes.

### Footer reorganization

Navigation content changes (UK + DE):

- Remove links to Widerruf and Muster-Widerrufsformular (routes already removed by RFC-0487).
- Group Barrierefreiheit, Open Source, and Bildnachweise under a Transparenz section.
- No URL changes — only navigation structure and link removal.

### `/preis/` canonicality

No changes to the /preis/ page itself. The ratgeber website-kosten article already references PBP price values via `{business-profile...}` references (applied in this session). The /preis/ page remains the canonical price source.

`content.voice.lint` adds a check:

- **VOICE-CTA-01**: Scan ratgeber article page blocks (depth-1, `surfaceId: ratgeber`) for markdown blocks (`type: markdown`) whose content contains a markdown table (line starting with `|`) with 3+ data rows where any cell matches a price pattern (currency symbol `€`, `EUR`, or PBP reference `{business-profile...price...}`). A single inline price calculation (1-2 rows) is allowed; a full price table (3+ rows) is not. This rule has `warning` severity — it flags potential price-table duplication without blocking builds. False-positive rate: low — the heuristic requires both a markdown table and price-pattern matches in 3+ rows. Suppression: refactor the table into inline prose or reduce to a single calculation example.

## Architectural fit

All code changes are in `@gogol/site-kernel-checks`:

- `src/surface-expand/bake-blocks.ts` — extend `linkedCardGrid` card shape
- `src/surface-expand/bake-ratgeber-hub.ts` — pass new fields, remove `description`
- `src/ratgeber-hub-validate.ts` — add RG-HUB-09 rule
- `src/content-voice.ts` — add VOICE-CTA-01 rule

Pipeline placement: `ratgeber.hub.validate` runs in `sites-check-author` (advisory, non-blocking). `content.voice.lint` runs in `sites-check-author` (advisory, non-blocking). Both new rules are `warning` severity — they do not block builds.

No package boundary violations: all changes are within a single package. No new packages proposed. No imports from `apps/*` or `services/*`.

### Compass sync

- `docs/verification-plan.xml` — add RG-HUB-09 and VOICE-CTA-01 to the rule inventory.
- `packages/os/site-kernel-checks/AGENTS.md` — update the `ratgeber-hub-validate.ts` module entry to mention RG-HUB-09; update the `content-voice.ts` description to mention VOICE-CTA-01.

### AGENTS.md updates

- `packages/os/site-kernel-checks/AGENTS.md` module table: add RG-HUB-09 to `ratgeber-hub-validate.ts` entry; add VOICE-CTA-01 to `content-voice.ts` entry.

## Design

### linkedCardGrid extension

```typescript
// bake-blocks.ts — extended card shape
export function linkedCardGrid(
  heading: string,
  cards: Array<{
    title: string;
    description?: string;   // deprecated for ratgeber hub, retained for other callers
    href: string;
    image?: string;
    imageAlt?: string;
    articleType?: string;   // new — RFC-0507
    question?: string;      // new — RFC-0507
    reviewedAt?: string;    // new — RFC-0507
    readTime?: string;      // new — RFC-0507
  }>,
  anchorId?: string,
): Block;
```

### RG-HUB-09 validation logic

```typescript
// ratgeber-hub-validate.ts — new rule
// For each audience-cards block on the hub page (depth-0):
//   Check each card in props.body.cards[]
//   If card.description exists → warning (RG-HUB-09)
```

### VOICE-CTA-01 validation logic

```typescript
// content-voice.ts — new rule
// For each ratgeber article page (depth-1, surfaceId: ratgeber):
//   Scan markdown blocks for markdown tables (lines starting with |)
//   Count data rows (exclude header + separator)
//   If 3+ data rows AND any cell matches price pattern → warning (VOICE-CTA-01)
```

### Footer structure (DE)

```
Transparenz
  ├── Barrierefreiheit
  ├── Open Source
  └── Bildnachweise
```

UK label: `Прозорість` (grouping label). Individual link labels remain unchanged.

## Rollout

1. Extend `linkedCardGrid` in `bake-blocks.ts` with optional `articleType`, `question`, `reviewedAt`, `readTime` card props.
2. Update `bakeRatgeberHub` to pass the four new fields from article records and stop passing `description`.
3. Add RG-HUB-09 to `ratgeber-hub-validate.ts` — check `audience-cards` blocks on hub page for `description` in card props.
4. Add VOICE-CTA-01 to `content-voice.ts` — scan ratgeber article markdown blocks for price tables.
5. Edit `/leistungen/digitales-fundament/` prose (UK + DE) — remove contradicted claims, add ratgeber link.
6. Edit `/website/` surface page prose (UK + DE) — add local visibility reference.
7. Edit `/notausgang/` prose (UK + DE) — align with migration risk matrix.
8. Edit footer navigation (UK + DE) — remove stale links, add Transparenz group.
9. Verify with `ratgeber.hub.validate`, `content.voice.lint`, and dev build.

Default behavior after implementation: existing sites with `surfaceId: ratgeber` will emit five-field cards. The `description` prop is removed from hub cards but retained in `linkedCardGrid` for other callers (non-ratgeber surfaces). No migration needed — article records already carry these fields; they were just not rendered on cards.

## Alternatives considered

**Separate RFC per page.** Rejected — the cross-page changes are all triggered by the same expert file and are editorial content corrections. Splitting would create four RFCs for four one-line content edits.

**Package-level enforcement of claim consistency.** Rejected — cross-page claim consistency is an editorial responsibility, not a build-time check. The claim registry (RFC-0505) provides per-article claim tracking; cross-page consistency is enforced by editorial review.

**Footer as a separate RFC.** Rejected — the footer changes are two link removals and one group rename. This does not warrant a separate RFC.

## Risks

- **Editorial drift.** Content corrections on /leistungen/, /website/, and /notausgang/ could drift from the ratgeber articles over time. Mitigation: the claim registry (RFC-0505) provides traceable claim IDs; editorial reviews check cross-page consistency.
- **Footer link removal without redirect.** Removing Widerruf links could break bookmarks. Mitigation: RFC-0487 already removed the routes; the links are already broken. This RFC cleans up the footer.
- **Agent misinterpretation.** An agent implementing the content edits on /leistungen/, /website/, and /notausgang/ may interpret "remove or soften claims" too broadly, removing accurate content. Mitigation: the RFC lists specific claims to remove (KI-Auffindbarkeit guarantees, structured data location recognition, visibility-to-inquiry conversion, automatic city-page generation). Agents should remove only these specific claims and add the ratgeber link.
- **RG-HUB-09 false positives.** The rule checks for `description` key in card props. If a non-ratgeber surface uses `linkedCardGrid` with `description`, the rule should not fire — it only checks the hub page (depth-0, `surfaceId: ratgeber`). False-positive rate: near-zero.
- **VOICE-CTA-01 false positives.** A ratgeber article that legitimately compares 3+ price points in a table (e.g., a cost calculation article) would trigger the warning. Mitigation: `warning` severity does not block builds. The article can use inline prose instead of a table, or the warning can be reviewed and dismissed.

## Acceptance criteria

- [x] `linkedCardGrid` in `bake-blocks.ts` accepts optional `articleType`, `question`, `reviewedAt`, `readTime` card props. (evidence: `pnpm --filter @gogol/site-kernel-checks run build:check` passes, commit 7fed55f47)
- [x] `bakeRatgeberHub` passes `articleType`, `question`, `reviewedAt`, `readTime` from article records to `linkedCardGrid` and does not pass `description`. (evidence: `pnpm --filter @gogol/site-kernel-checks run build:check` passes, commit 7fed55f47)
- [x] `ratgeber.hub.validate` emits RG-HUB-09 warning when a hub page `audience-cards` block card contains a `description` key. (evidence: `ratgeber.hub.validate --site webgogol-com` passes cleanly after surface.generate, commit 7fed55f47)
- [x] `content.voice.lint` emits VOICE-CTA-01 warning when a ratgeber article page markdown block contains a table with 3+ price-pattern data rows. (evidence: `content.voice.lint --site webgogol-com` emits 4 VOICE-CTA-01 warnings on existing price tables, commit 7fed55f47)
- [x] `/leistungen/digitales-fundament/` prose (DE + UK) does not contain claims about guaranteed KI-Auffindbarkeit, structured data location recognition, visibility-to-inquiry conversion, or automatic city-page generation. (evidence: edited digitales-fundament.md DE+UK, mission commit 1a1f)
- [x] `/leistungen/digitales-fundament/` prose (DE + UK) links to `/ratgeber/lokale-sichtbarkeit/` (DE) or `/porady/lokalna-vydymist/` (UK). (evidence: ratgeber link added to included-features subheading and growth-modules visibility card, mission commit 1a1f)
- [x] `/website/` surface page prose (DE + UK) references local visibility rules and links to the ratgeber article. (evidence: website-local.yaml blueprint intro updated with ratgeber link, commit 17f2da672)
- [x] `/notausgang/` prose (DE + UK) references the conditional migration risk matrix (domain ownership, export format, URL stability, external accounts). (evidence: migration-risks markdown block added to notausgang.md DE+UK, mission commit 69f4)
- [x] Footer navigation (DE + UK) does not contain links to Widerruf or Muster-Widerrufsformular. (evidence: legalIds in labels.md DE+UK contains only impressum, datenschutz, agb, mission commit 1b8e)
- [x] Footer navigation (DE + UK) groups Barrierefreiheit, Open Source, and Bildnachweise under a Transparenz section. (evidence: transparencyIds + transparencyTitle added to labels.md DE+UK, footer-component.astro renders Transparenz group, mission commit 1b8e + commit 3275d037b)
- [x] `ratgeber.hub.validate` and `content.voice.lint` pass after all changes. (evidence: `ratgeber.hub.validate --site webgogol-com` → OK, `content.voice.lint --site webgogol-com` → OK with 4 advisory warnings)
- [x] `docs/verification-plan.xml` updated with RG-HUB-09 and VOICE-CTA-01. (evidence: new check-set `apps-ratgeber-hub-card-fields-rfc-0507` added, commit c6f46cf1c)
- [x] `packages/os/site-kernel-checks/AGENTS.md` module table updated for `ratgeber-hub-validate.ts` and `content-voice.ts`. (evidence: RG-HUB-09 added to ratgeber-hub-validate entry, content-voice.ts entry added, commit c6f46cf1c)

## Implementation notes for agents

- **Code changes** (agent-executable): extending `linkedCardGrid`, updating `bakeRatgeberHub`, adding RG-HUB-09 to `ratgeber-hub-validate.ts`, adding VOICE-CTA-01 to `content-voice.ts`, updating `docs/verification-plan.xml`, updating `packages/os/site-kernel-checks/AGENTS.md`.
- **Content changes** (agent-executable with editorial judgment): editing prose on `/leistungen/digitales-fundament/`, `/website/` surface pages, `/notausgang/`, and footer navigation. The RFC lists specific claims to remove — agents should remove only those claims and add the specified ratgeber links. If uncertain about whether a claim matches the RFC's description, the agent should flag it for human review rather than removing it.
- **Governance**: follow RFC-0224 (accepted→implemented transition). Verification evidence per RFC-0330: run `ratgeber.hub.validate` and `content.voice.lint` and capture output.
- The hub card field change is a baker change (`bakeRatgeberHub`), not a content change. The article records still carry `category` and `summary` — `summary` is just not rendered on the card. `category` was never rendered on the card.
- The `description` prop is removed from ratgeber hub cards only. `linkedCardGrid` retains `description` as an optional prop for other callers (non-ratgeber surfaces).
- The footer reorganization is a navigation content edit, not a URL change. The Transparenz section is a navigation group label, not a new route.
- The /preis/ page is not modified — it remains the canonical price source. The ratgeber article references PBP values inline via `{business-profile...}` references.
- Edge case: if an article record is missing `articleType`, `question`, `reviewedAt`, or `readTime`, the card omits that field gracefully (conditional spread). No error is raised — RG-HUB-08 handles required field validation at the record level.
- Edge case: if the ratgeber surface has zero articles, `bakeRatgeberHub` omits the article-list blocks (current behavior). RG-HUB-09 does not fire on empty blocks.
