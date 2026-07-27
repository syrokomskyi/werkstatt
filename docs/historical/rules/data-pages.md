# Data Pages Contract

**⚠️ DEPRECATED / REMOVED:** This approach has been replaced by the standard Astro content structure.

**For new content work, use `content-migration-strategy.md` instead.**

This file is kept only as a short historical note so old discussions still make sense.

---

Do not use this file as implementation guidance.

## Current status

- The old `src/data/**` architecture is no longer active.
- Project-owned content now lives in semantic domains under `src/content/**`:
  - `src/content/pages/{lang}/**`
  - `src/content/prose/{lang}/**`
  - `src/content/business/{lang}/**`
  - `src/content/navigation/{lang}/**`
  - `src/content/site/{lang}/**`
- Route pages in `src/pages/[lang]/**/*.astro` should stay thin and consume Astro content collections.

## What to use now

- For content location and migration rules, use `content-migration-strategy.md`.
- For frontmatter-only content format, use `content-frontmatter-format.md`.
- For architecture and boundaries, use `project-guide.md`.

## Historical note

If you encounter old discussion mentioning:

- `src/data/pages/**`
- `src/data/components/**`
- `src/data/collections/**`
- `requireTypedPageDataForRoute(...)`
- `requirePageEntryForRoute(...)`

treat those references as obsolete and map them to the current `src/content/**` model instead.
