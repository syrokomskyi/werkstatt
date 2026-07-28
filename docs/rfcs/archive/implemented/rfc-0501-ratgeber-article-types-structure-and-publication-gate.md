---
id: RFC-0501
title: "Ratgeber article types, mandatory structure, and publication gate"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-23
updatedAt: 2026-07-23
enhancedAt: 2026-07-23
implementedAt: 2026-07-23
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0500
amendedBy:
  - RFC-0504
related:
  - RFC-0193
  - RFC-0325
  - RFC-0478
  - RFC-0479
  - RFC-0480
  - RFC-0500
  - RFC-0502
  - RFC-0503
satisfies:
  - DNA-24
breaksC: false
versionBump: minor
commands:
  proposed:
    - ratgeber.article.validate
  added:
    - ratgeber.article.validate
  changed:
    - article.depth.validate
    - surface.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every published article has one of seven article types: grundlagenartikel, entscheidungshilfe, checkliste, vergleich, rechenmodell, methodik, begriffserklaerung."
  - "Every published article has a mandatory 10-section structure in its prose body: Einleitung, Kernfrage, Wissensbasis, Praxisbezug, Häufige Missverständnisse, Kosten/Trade-offs, Checkliste, FAQ, Zusammenfassung, Quellen."
  - "ratgeber.article.validate enforces the 10-section structure and type-specific requirements."
  - "Each article type has a context-specific closing CTA — not a generic 'contact us' button."
  - "Articles with fewer than 500 words fail the publication gate."
  - "Articles missing any mandatory section heading fail the publication gate."
nonGoals:
  - "Does not change the article collection schema — that is RFC-0500."
  - "Does not define authors, sources, or claims — that is RFC-0502."
  - "Does not define the editorial policy page — that is RFC-0503."
  - "Does not create new block archetypes — uses existing block types."
  - "Does not define a third mandatory language — DE and UK section headings are defined; additional languages require a follow-up RFC."
---

# RFC-0501: Ratgeber article types, mandatory structure, and publication gate

## Context

RFC-0500 introduced the `articles` collection with an `articleType` field and a `status` gate. This RFC defines the seven article types, the mandatory 10-section prose structure, type-specific requirements, and the publication gate that enforces them.

## Problem

1. **No article types.** The current ratgeber has no type distinction. A cost calculator and a glossary entry follow the same structure, which leads to inconsistent articles that do not serve their specific editorial purpose.

2. **No mandatory structure.** The current prose bodies are free-form markdown with no required sections. Articles vary wildly in structure — some have FAQs, some do not; some have cost tables, some do not. The expert requires a consistent 10-section structure so every article answers the same editorial questions.

3. **No publication gate.** The current `article.depth.validate` checks word count and heading content but does not enforce a mandatory section structure or type-specific requirements. Articles can be published with missing sections.

4. **Generic CTAs.** All article pages end with the same generic "contact us" CTA. The expert requires context-specific CTAs that match the article type — a cost calculator should end with a pricing reference, a glossary entry should end with related terms.

## Decision

### Seven article types

| Type | slug | Purpose | Context-specific CTA |
| --- | --- | --- | --- |
| Grundlagenartikel | `grundlagenartikel` | Foundational knowledge article | Link to related articles in the same category |
| Entscheidungshilfe | `entscheidungshilfe` | Decision framework for a specific question | Link to relevant service pages |
| Checkliste | `checkliste` | Actionable checklist | Link to contact for implementation help |
| Vergleich | `vergleich` | Side-by-side comparison of options | Link to pricing or service pages |
| Rechenmodell | `rechenmodell` | Cost or value calculation model | Link to pricing page |
| Methodik | `methodik` | How-to methodology guide | Link to related articles |
| Begriffserklärung | `begriffserklaerung` | Glossary term explanation | Link to related glossary terms |

### Mandatory 10-section structure

Every published article's prose body (`prose/{lang}/ratgeber-{slug}.md`) must contain these 10 section headings in order:

| # | Section heading (DE) | Section heading (UK) | Purpose |
| --- | --- | --- | --- |
| 1 | `## Einleitung` | `## Вступ` | Context and scope |
| 2 | `## Kernfrage` | `## Ключове питання` | The guiding question and short answer |
| 3 | `## Wissensbasis` | `## База знань` | Factual foundation |
| 4 | `## Praxisbezug` | `## Практична частина` | Real-world application |
| 5 | `## Häufige Missverständnisse` | `## Поширені помилки` | Common misconceptions |
| 6 | `## Kosten und Trade-offs` | `## Витрати і компроміси` | Cost considerations and trade-offs |
| 7 | `## Checkliste` | `## Контрольний список` | Actionable checklist |
| 8 | `## FAQ` | `## Поширені запитання` | Frequently asked questions |
| 9 | `## Zusammenfassung` | `## Підсумок` | Summary and key takeaways |
| 10 | `## Quellen` | `## Джерела` | Sources and references |

The section headings must appear as H2 (`##`) in the prose markdown. The validator checks for their presence and order. Heading matching is trimmed (leading/trailing whitespace ignored) and does not accept trailing attributes (e.g., `## Einleitung {#intro}` fails — the heading must be exactly `## Einleitung`). H3 (`###`) and deeper subsections within an H2 section are permitted and do not affect the ordering check — only H2 headings are matched against the mandatory list.

For languages without a defined section list (i.e., neither DE nor UK), the validator skips the section structure check and emits `RG-ART-06` (warning) instead of failing. Adding a third language with mandatory sections requires a follow-up RFC that adds the section list and updates this table.

### Type-specific requirements

Each article type has additional requirements beyond the 10-section structure:

| Type | Additional requirement |
| --- | --- |
| `grundlagenartikel` | Wissensbasis section ≥ 200 words |
| `entscheidungshilfe` | Kernfrage section contains a decision table (markdown table with ≥ 3 rows) |
| `checkliste` | Checkliste section contains ≥ 5 checklist items (markdown list with `- [ ]` or `- [x]`) |
| `vergleich` | Praxisbezug section contains a comparison table (markdown table with ≥ 2 columns and ≥ 3 rows) |
| `rechenmodell` | Kosten section contains a calculation example with explicit numbers |
| `methodik` | Praxisbezug section contains a numbered step-by-step guide (≥ 3 numbered steps) |
| `begriffserklaerung` | Kernfrage section contains a one-sentence definition in bold |

### Publication gate

`ratgeber.article.validate` enforces the publication gate. An article fails the gate when:

- Word count < 500.
- Any mandatory section heading is missing.
- Section headings are out of order.
- Type-specific requirement is not met.
- `status: published` but the article fails any of the above.

Articles with `status: draft` or `status: review-required` are not checked by the publication gate — they may be incomplete works in progress.

### Relationship to `article.depth.validate`

`article.depth.validate` (RFC-0325) is a generic check for all article-typed pages: date validation (ART-DEPTH-01), 500-word floor (ART-DEPTH-02), thin sections (ART-DEPTH-03), feed inclusion (ART-DEPTH-04), and markdown twin provenance (ART-DEPTH-05). `ratgeber.article.validate` is a ratgeber-specific superset that adds the 10-section structure and type-specific requirements on top of the same 500-word floor.

To avoid redundancy, `article.depth.validate` is modified to skip ART-DEPTH-02 (word count) for ratgeber articles — `ratgeber.article.validate` handles it as RG-ART-02. The remaining `article.depth.validate` checks (dates, thin sections, feed, twin) still run on ratgeber articles because they are generic and not duplicated by `ratgeber.article.validate`.

### Context-specific closing CTAs

The `bakeRatgeberArticle` baker (from RFC-0500) emits a context-specific closing CTA based on `articleType`:

| Type | CTA |
| --- | --- |
| `grundlagenartikel` | "Verwandte Artikel" — linked card grid of related articles in the same category |
| `entscheidungshilfe` | "Passende Leistungen" — linked card grid of relevant service pages |
| `checkliste` | "Brauchen Sie Hilfe?" — contact CTA |
| `vergleich` | "Preise ansehen" — link to pricing page |
| `rechenmodell` | "Preise ansehen" — link to pricing page |
| `methodik` | "Verwandte Artikel" — linked card grid of related articles |
| `begriffserklaerung` | "Verwandte Begriffe" — linked card grid of related glossary articles |

## Architectural fit

- **RFC-0500:** amends — adds type-specific structure and CTA requirements to the article model.
- **RFC-0478:** `versionBump: minor` — new validator and extended article checks are Breaks-B (new validation rules).
- **RFC-0480:** `breaksC: false` — no external surface contract changes (URLs, JSON-LD, sitemaps unchanged).
- **DNA-24:** The 10-section structure is enforced through the prose `contentRef` mechanism — the validator checks `prose/{lang}/ratgeber-{slug}.md` files that are referenced via `blocks[].props.contentRef` in block-declarative page entries. No article body copy lives in route files or page frontmatter. The publication gate ensures that only structured prose bodies (not inline route markdown) reach published articles.

## Design

### CLI surface

```sh
pnpm exec site-kernel run ratgeber.article.validate --site warpgogol-com --json
```

Site-scoped, runs in `build.check` (blocking).

Exit codes: `0` = pass, `1` = any error-level rule triggered, `2` = only warning-level rules triggered. The `--json` output shape follows the standard check-command contract: `{ exitCode, summary, diagnostics: Array<{ ruleId, severity, message, file?, fixHint?, data? }> }`.

### TypeScript contracts

```ts
const ARTICLE_TYPES = [
  "grundlagenartikel", "entscheidungshilfe", "checkliste",
  "vergleich", "rechenmodell", "methodik", "begriffserklaerung",
] as const;

const MANDATORY_SECTIONS_DE = [
  "## Einleitung", "## Kernfrage", "## Wissensbasis", "## Praxisbezug",
  "## Häufige Missverständnisse", "## Kosten und Trade-offs",
  "## Checkliste", "## FAQ", "## Zusammenfassung", "## Quellen",
];

const MANDATORY_SECTIONS_UK = [
  "## Вступ", "## Ключове питання", "## База знань", "## Практична частина",
  "## Поширені помилки", "## Витрати і компроміси",
  "## Контрольний список", "## Поширені запитання", "## Підсумок", "## Джерела",
];
```

### Type-specific requirement detection

The validator uses the following detection heuristics for type-specific requirements:

- **Decision table** (`entscheidungshilfe`): a markdown table (lines starting with `|`) with ≥ 3 data rows (excluding header and separator rows).
- **Checklist items** (`checkliste`): markdown lines matching `^- \[[ x]\]` within the Checkliste H2 section, ≥ 5 items.
- **Comparison table** (`vergleich`): a markdown table with ≥ 2 columns (≥ 2 `|` separators per row) and ≥ 3 data rows within the Praxisbezug H2 section.
- **Calculation example** (`rechenmodell`): the Kosten H2 section contains at least one line with explicit numeric values (regex: `\d+[.,]?\d*\s*[€$]?)`.
- **Numbered step-by-step guide** (`methodik`): markdown lines matching `^\d+\.\s` within the Praxisbezug H2 section, ≥ 3 steps.
- **One-sentence definition in bold** (`begriffserklaerung`): the Kernfrage H2 section contains a line matching `**[^*]+**` that is a single sentence (no period within the bold text, period at end allowed).

All checks are scoped to the content beneath the specified H2 heading (up to the next H2). H3 subsections within the target section are included in the scan.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/ratgeber-article-validate.ts` | New: validator |
| `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts` | Updated: context-specific CTAs |
| `packages/os/site-kernel-checks/src/article-depth.ts` | Updated: skip ART-DEPTH-02 for ratgeber articles |
| `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` | Updated: register `ratgeber.article.validate` command entry |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0501-article-status-review.ts` | New: migrator — set existing published articles to `review-required` |
| `docs/verification-plan.xml` | Add check |
| `docs/COMMANDS.md` | Add command |
| `docs/requirements.xml` | Update: article type enum, mandatory section structure |
| `docs/technology.xml` | Update: new validator file, migrator file |
| `docs/knowledge-graph.xml` | Update: RFC-0501 relationships |
| `packages/os/site-kernel-checks/AGENTS.md` | Update: document `ratgeber-article-validate.ts` module |

## Pipeline placement

- `ratgeber.article.validate` runs in `build.check` (blocking) — site-scoped.
- `article.depth.validate` is modified to skip ART-DEPTH-02 (word count) for ratgeber articles; all other ART-DEPTH-* checks continue to run.
- `surface.validate` includes ratgeber article type checks (RG-ART-01) as part of the surface validation pipeline.

## Rollout

1. **Code:** Implement `ratgeber.article.validate` with section, type, and word-count checks.
2. **Code:** Update `bakeRatgeberArticle` with context-specific CTAs based on `articleType`.
3. **Code:** Update `article.depth.validate` to skip ART-DEPTH-02 for ratgeber articles.
4. **Code:** Register `ratgeber.article.validate` in the check module command table.
5. **Migrator:** Implement `rfc-0501-article-status-review` migrator — set all existing `status: published` ratgeber articles to `status: review-required` (their prose bodies don't have the 10-section structure yet). Register in migrator registry.
6. **Content (human):** Update existing article prose bodies to include the 10-section structure. This is human authoring — an agent MUST NOT auto-generate prose bodies. Once an article's prose body is updated, set its `status` back to `published`.
7. **Compass sync:** Update `docs/verification-plan.xml`, `docs/COMMANDS.md`, `docs/requirements.xml`, `docs/technology.xml`, `docs/knowledge-graph.xml`, `packages/os/site-kernel-checks/AGENTS.md`.
8. **Pilot:** Run `ratgeber.article.validate --site warpgogol-com`. Fix any remaining issues.

## Alternatives considered

- **Extend `ratgeber.hub.validate` instead of creating a new command.** Rejected: `ratgeber.hub.validate` validates the surface artifact (`surface.generated.yaml`) — JSON-LD types, hub layout, card fields, reserved slugs. The 10-section structure check reads prose markdown files (`prose/{lang}/ratgeber-{slug}.md`), which is a different I/O pattern and a different concern (content structure vs. surface artifact). Mixing both in one command would blur the boundary between artifact validation and content validation.

- **Extend `article.depth.validate` with ratgeber-specific section checks.** Rejected: `article.depth.validate` is generic across all article-typed surfaces (blog, ratgeber, future surfaces). The 10-section structure, seven article types, and type-specific requirements are ratgeber-specific editorial decisions. Embedding them in the generic validator would couple the generic check to one surface's editorial policy. A separate command keeps the generic validator clean and the ratgeber-specific rules explicit.

- **Make the 10-section structure advisory (warning, not error) for published articles.** Rejected: the expert requires a consistent structure across all published articles. An advisory check would allow incomplete articles to publish, defeating the purpose of the publication gate. The structure is mandatory for `status: published` and advisory for `status: draft` / `status: review-required` (RG-ART-06).

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| **Existing articles fail the gate** | High | Migrator sets existing articles to `review-required`; they are excluded from the gate until manually updated. |
| **Section heading false positives** | Medium | Heading matching is trimmed and documented; H3 subsections are allowed within H2 sections. |
| **Type-specific detection heuristics too strict** | Medium | Detection rules are explicitly specified (regex patterns, row counts). If a valid article is flagged, the rule can be adjusted in a follow-up RFC. |
| **Agent auto-generates prose bodies** | Medium | Implementation notes explicitly forbid auto-generation; acceptance criteria distinguish code-verifiable from content-verifiable items. |
| **Third language added without section list** | Low | Validator skips with RG-ART-06 warning; a follow-up RFC is required to add the section list. |

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted`.
- Agents MUST NOT auto-generate article prose bodies with the 10-section structure — this is human editorial authoring. The agent's job is the validator, baker CTA logic, migrator, and command registration.
- Agents MUST run `ratgeber.article.validate --site warpgogol-com --json` after implementation to verify the validator works.
- Agents MUST implement the `rfc-0501-article-status-review` migrator and register it in the migrator registry.
- Agents MUST update `amendedBy` on RFC-0500 to include RFC-0501.
- Agents MUST update `packages/os/site-kernel-checks/AGENTS.md` to document the new `ratgeber-article-validate.ts` module.
- When implementing, reference RFC-0501 in commit messages.

## Acceptance criteria

- [x] `ratgeber.article.validate` passes on all `status: published` ratgeber articles. (evidence: packages/os/site-kernel-checks/src/ratgeber-article-validate.ts:1-330, command registered in 09b-build-artifacts-part2.ts:169-181)
- [x] Every `status: published` article has a valid `articleType` from the seven allowed types. (evidence: ratgeber-article-validate.ts RG-ART-01, ARTICLE_TYPES const)
- [x] Every `status: published` article has all 10 mandatory H2 sections in order. (evidence: ratgeber-article-validate.ts RG-ART-03/04, MANDATORY_SECTIONS_DE/UK consts)
- [x] Type-specific requirements are met for every `status: published` article. (evidence: ratgeber-article-validate.ts RG-ART-05, checkTypeSpecificRequirement function)
- [x] Context-specific CTAs render correctly for each article type. (evidence: bake-ratgeber-article.ts:130-135, buildContextualCta function:179-302)
- [x] `article.depth.validate` skips ART-DEPTH-02 for ratgeber articles. (evidence: article-depth.ts:251-254, surfaceId check)
- [x] Migrator sets existing published articles to `review-required`. (evidence: packages/os/site-kernel-handoff/src/migrators/rfc-0501.ts:1-82, registered in registry.ts:50)
- [x] `rfc.validate` passes. (evidence: rfc.validate RFC-0501 — 0 violations)
