---
rfcId: RFC-0475
auditId: AUDIT-RFC-0475-01
date: 2026-07-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0475

## Verdict: Needs revision

The RFC is architecturally sound — new `@gogol/faq` package, standalone collection, strict schema, `faq.validate` command — but has two findings that will cause implementation failures: (1) `FaqEntry` is NOT structurally compatible with `SemanticFaqEntry` (`id` vs `slug` field mismatch), and (2) the page integration design references a `contentSource: faq` pattern that does not exist in the codebase. These must be resolved before implementation.

## Mechanical validation (rfc.validate)

Pass — no violations targeting RFC-0475.

## Axis A — Structural completeness

1. **Page integration is underspecified.** The Design section (line 118) says "Pages embed `faq-list-section` with `contentSource: faq` and optional `filter.tags`." The `contentSource` field does not exist in the codebase — `grep` for `contentSource` in `packages/share/src/` and `packages/ui/src/sections/` returns zero results. The RFC must describe the actual mechanism: how does the route handler know to load FAQ entries? Does the page block props include a `faqFilter` field? Does the route handler call `getFaqEntries(lang)` unconditionally? This is a design gap, not a detail.

2. **`astro.config.template.mjs` in codegen — path uncertainty.** Line 288 says `packages/os/site-kernel-codegen/src/templates/app-boilerplate/astro.config.template.mjs (if exists)`. The file does not exist — only the onboarding template has `astro.config.template.mjs`. The RFC should state definitively that only the onboarding template is updated, not hedge with "(if exists)".

## Axis B — DNA alignment

No issues. `satisfies: [DNA-1]` is correct — FAQ is a standalone content collection in `src/content/faq/{lang}/`, following the `people` precedent (RFC-0200). The RFC body explains how it enforces DNA-1 (monorepo boundary: shared logic in `packages/*`, site composition only).

## Axis C — Ecosystem fit

1. **`FaqEntry` is NOT structurally compatible with `SemanticFaqEntry`.** Line 292 claims: "`@gogol/faq` exports `FaqEntry` type that is structurally compatible with `SemanticFaqEntry` from `@gogol/share/semantic`." This is incorrect. `SemanticFaqEntry` (in `packages/share/src/semantic/models.ts:240`) has `{ id: string, question: string, answer: string, tags?: string[], serviceSlug?: string }`. `FaqEntry` has `{ slug: string, question: string, answer: string, order?: number, tags?: string[], governance?: ... }`. The `id` vs `slug` field name mismatch means these types are NOT assignable. A mapping function (`FaqEntry` → `SemanticFaqEntry`) is needed. The RFC must address this.

2. **`ssr.noExternal` already covers `@gogol/faq`.** Line 285 says to add `@gogol/faq` to `ssr.noExternal`. But the onboarding template (`astro.config.template.mjs`) uses `noExternal: [/^@gogol\//, /^@wgogol\//]` — a regex that already matches `@gogol/faq`. Only `optimizeDeps.exclude` needs the explicit addition. The RFC should correct this.

3. **`zod` dependency not in acceptance criteria.** The schema uses `import { z } from "zod"` (line 177). PBP has `"zod": "^4.4.3"` in `package.json`. The acceptance criteria (line 401) only mention "`workspace:*` dependencies" — should explicitly require `zod` as a dependency.

4. **Loader uses `astro:content` directly.** Line 228 uses `import { getCollection } from "astro:content"`. Per `packages/AGENTS.md`: "Import `getEntry`/`getCollection` from `@gogol/content-source/astro`, never `astro:content`." The loader should import from `@gogol/content-source/astro`.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no backward compatibility layers. Claims-sidecar migration is one-way (frontmatter `governance` block, no `.claims.yaml` restoration).

## Axis E — Agent-facing policy

No issues. Status is `draft` — no self-authorizing language. Implementation notes correctly reference RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation). Anti-fabrication is handled — content recovery is from git history, not auto-generated.

## Axis F — Pragmatism

1. **`src/types.ts` may be redundant.** Line 106 lists `src/types.ts` for `FaqEntry, FaqGovernance` types, but `src/schema.ts` already exports these via `z.infer<typeof faqSchema>` (line 199-200). Unless `types.ts` holds types not derived from Zod, it's unnecessary. Consider removing it or clarifying its purpose.

2. **Mirroring rule for FAQ is questionable.** Validation rule 7 (line 257) requires "every language directory that has FAQ files must have at least the default language (DE) equivalents." `people.validate` (RFC-0200) does not enforce mirroring — it validates Person records per-language independently. FAQ mirroring should follow the `people` precedent, not the `pages` precedent. If mirroring is desired, justify why FAQ differs from `people`.

## Axis G — Blind spots

1. **Strict Zod schema may reject legacy files with extra fields.** The `faqSchema` (line 190) is a strict `z.object()` — by default, Zod strips unknown keys but does not error. However, if the Astro collection loader passes raw frontmatter and the schema is set to `.strict()`, extra fields would error. The RFC should confirm the default Zod behavior (strip unknown keys) is acceptable, or explicitly use `.passthrough()` / `.loose()`.

2. **`getFaqEntries` sort default of 99 is arbitrary.** Line 236: `(a.order ?? 99) - (b.order ?? 99)`. If some files have `order` and others don't, unordered entries will appear last in arbitrary order. This is a minor UX issue but should be documented.

## Questions for the author

1. How does the route handler know to load FAQ entries for a page? The `contentSource: faq` pattern does not exist — describe the actual mechanism (page block props? route handler convention? page builder integration?).

2. How will `FaqEntry` (with `slug`) be mapped to `SemanticFaqEntry` (with `id`)? Will the loader function return `SemanticFaqEntry[]` directly, or will a mapping function be added?

3. Should `faq.validate` enforce mirroring across languages? `people.validate` does not — why should FAQ differ?
