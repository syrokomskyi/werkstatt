# @warpgogol/faq Agent Guide

Pluggable FAQ content collection package (RFC-0475).

## Scope

- Zod schema for FAQ entries (`faqSchema` with `.loose()`)
- Astro content collection factory (`createFaqCollection`)
- Loader functions (`getFaqEntries`, `getFaqEntriesByTags`)
- Semantic mapping helper (`toSemanticFaqEntries`)
- Content lives at `src/content/faq/{lang}/` in each site

## API surface

| Entry point | Export | What it does |
| --- | --- | --- |
| `@warpgogol/faq` | `faqSchema`, `FaqEntry`, `FaqGovernance` | Zod schema and types |
| `@warpgogol/faq/astro` | `createFaqCollection` | Astro collection factory — spread into `collections` |
| `@warpgogol/faq/astro` | `getFaqEntries(lang)` | Load FAQ entries for a language, sorted by `order` |
| `@warpgogol/faq/astro` | `getFaqEntriesByTags(lang, tags)` | Filter entries by tags |
| `@warpgogol/faq/astro` | `toSemanticFaqEntries(entries)` | Map `FaqEntry[]` → `SemanticFaqEntry[]` (slug → id) |

## Content location

FAQ content files live under `src/content/faq/{lang}/`:

- `df-baukasten.md`, `df-kuendigung.md`, `df-start.md`, `df-vertrag.md`, `df-wer-dahinter.md`, `warum-abonnement.md`

## Validation

`faq.validate` in `@warpgogol/site-kernel-checks` enforces:

- Required fields: `slug`, `question`, `answer`
- Optional field types: `order` (number), `tags` (string[])
- Governance block structure: `governance.fieldClaims` object
- Duplicate slug detection per language
- No-op pass when `src/content/faq/` is absent
- Does NOT enforce cross-language mirroring (follows `people.validate` precedent)

## Non-goals

- Does not define JSON-LD or semantic model logic — that lives in `@warpgogol/share`
- Does not define route generation or page rendering — that is the site's job
- Does not define feature flags or entitlements for FAQ collection
