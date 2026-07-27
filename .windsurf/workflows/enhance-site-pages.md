---
description: Apply expert site-page recommendations to UK content (one file at a time)
---

# Enhance site pages (slash-command wrapper)

This is a thin wrapper around the detailed process in `.agents/workflows/enhance-site-pages.md`.

## Usage

```
/enhance-site-pages <number>
```

Where `<number>` is the expert file number (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14.0, 14.1, 14.2, 14.3, 15.0, 15.1, 16.1, 17, 18).

## Steps

1. Read `.agents/workflows/enhance-site-pages.md` for the full process, page mapping, and constraints.
2. Read the expert file by number from:
   ```
   /home/syrokomskyi/projects/obsidian/WarpgogolDocObsidian/Tech/Site/!Research/2026-07-20 Страницы сайта - Улучшения/output/enhance-site-pages/
   ```
3. Follow the workflow steps: read expert file → read UK page(s) → check RFC triggers → apply changes (uk only, translate German to Ukrainian) → verify → report → commit via `mission.git.commit`.

## Key constraints

- **UK only**: edit only `uk/` content files. Never touch `de/` files.
- **Translate**: expert files contain German examples — render all content in Ukrainian.
- **One file per session**: do not batch multiple expert files.
- **RFC gate**: if a change requires package-level or external-surface modifications, pause and discuss.
- **Generated pages** (11 bildnachweise, 14.x website, 15.x ratgeber): may need generator logic changes in `packages/*` — pause for RFC if so.
- **New routes** (16.1 /team/ index): creating new routes requires an RFC — pause and ask operator.
- **Cross-page changes**: if the expert file mentions changes to other pages, defer those to the target page's own session.
- **Expert saw DE, we edit UK**: the expert analysed deployed DE pages. The codebase uses block-declarative YAML, PBP references, archetype contracts, and cosmic naming the expert doesn't know about. Check if UK already has the fix before applying. Do not replace `{business-profile...}` references with hardcoded values.
- **Quality gates**: run `fo-review` after file 2 (first-file gate — most important), after file 8 (mid-point), before file 17, and after file 18. Run `fo-fix` only if `fo-review` finds issues. See "Quality gates" section in the detailed workflow.
