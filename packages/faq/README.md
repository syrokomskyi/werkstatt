# @gogol/faq

Pluggable FAQ content collection package (RFC-0475).

## What lives here

- `faqSchema` — Zod schema for FAQ entries (`slug`, `question`, `answer`, `order?`, `tags?`, `governance?`)
- `createFaqCollection()` — Astro content collection factory
- `getFaqEntries(lang)` — load FAQ entries for a language, sorted by `order`
- `getFaqEntriesByTags(lang, tags)` — filter entries by tags
- `toSemanticFaqEntries(entries)` — map `FaqEntry[]` to `SemanticFaqEntry[]` for JSON-LD

## Usage

```typescript
import { createFaqCollection } from "@gogol/faq/astro";

const faq = createFaqCollection();

export const collections = {
  ...pbpCollections,
  ...faq,
};
```

Content lives at `src/content/faq/{lang}/`.
