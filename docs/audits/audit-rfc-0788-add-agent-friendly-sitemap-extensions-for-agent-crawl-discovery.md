---
rfcId: RFC-0788
auditId: AUDIT-RFC-0788-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0788

## Verdict: Needs revision

The RFC has a critical implementation gap: the existing `parseSitemapXml` and `validateSitemapFile` in `sitemap-helpers.ts` only recognize `<xhtml:link>` entries with `hreflang` attributes — markdown alternates (`type="text/markdown"` without `hreflang`) would be silently dropped by the parser and flagged as "Unexpected alternate link" by the validator. The RFC also references a reclassified-to-feature DNA invariant and has a scope contradiction.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Scope contradiction**: Frontmatter declares `scope: workspace`, but the Architectural fit section says "scope: app, supportsAllSites: true". The `sitemap.generate`/`sitemap.validate` commands are workspace-scoped (they run per-site via `requireAstroSitePaths`). The frontmatter is correct; the body text is wrong.
- **Twin URL derivation underspecified**: The Design section says "The `markdownTwins` map is built by `runSitemapGenerate` by scanning `public/` for `.md` files and mapping them to page IDs" but does not specify the mapping logic. The Risks section mentions `/about/` → `/about.md` and `/de/preise/` → `/de/preise.md`, but the actual derivation must account for: (a) the `canonicalPageUrl` function with `trailingSlash: "always"`, (b) localized paths via `localizeUrl`, (c) the difference between the HTML URL (`/about/`) and the `.md` twin URL (`/about.md`). The RFC should specify the exact transformation.

## Axis B — DNA alignment

- **DNA-34 is reclassified to feature (RFC-0161)**: `docs/architecture-dna.md` line 153 states: "DNA-34 ... **Reclassified to feature (RFC-0161)** — governed as a product feature by RFC-0028, not enforced as binding DNA." The related RFC-0785 explicitly acknowledges this in a frontmatter comment: "DNA-34 was reclassified to feature (RFC-0161) and is no longer binding." RFC-0788's `satisfies: [DNA-34]` references a non-binding invariant. The RFC body says "DNA-34 (.well-known/ discovery) — sitemap markdown alternates are another discovery path for agent content" but DNA-34 is specifically about Verifiable Credential signing + `/.well-known/` discovery, not sitemap extensions. The `satisfies` entry is decorative and should be removed or replaced with a binding invariant (or removed entirely since `kind: command` does not require `--satisfies`).

## Axis C — Ecosystem fit

- **Missing `amends` entry**: The RFC amends the `sitemap.generate` and `sitemap.validate` commands established by RFC-0049, but `amends: []` is empty. RFC-0049 is listed in `related[]` but not in `amends[]`. If the RFC changes the contract established by RFC-0049 (adding a new parameter to `generateSitemapXml`, new validation rules), it should be in `amends`.
- **Parser/validator update gap**: The current `parseSitemapXml` in `@/packages/werkstatt-site/src/checks/sitemap-helpers.ts:295-316` uses regex `/<xhtml:link[^>]*?hreflang="([^"]*)"[^>]*?href="([^"]*)"[^>]*?\/?>/g` which requires a `hreflang` attribute. A markdown alternate `<xhtml:link rel="alternate" type="text/markdown" href="...">` has no `hreflang` and would NOT be parsed. The `SitemapUrlEntry` interface only has `hreflangs: Array<{ lang, href }>`. The RFC does not mention updating the parser or the `SitemapUrlEntry` type.
- **Validator would reject markdown alternates**: `validateSitemapFile` builds `expectedSet` from `clusterAlternates` (hreflang-only) and checks `actualSet` against it. Any markdown alternate in the sitemap would be flagged as "Unexpected alternate link on <loc>: hreflang=\"undefined\" href=\"...\"". The RFC says `sitemap.validate` should "verify markdown alternate links point to existing .md files" but does not address that the current validator logic would reject them before any such check can run.

## Axis D — Forward-only compliance

No issues. The RFC extends existing commands in-place — no compatibility shims or dual-paths.

## Axis E — Agent-facing policy

No issues. Status gate is correct (`draft` → no implementation). Implementation notes reference the correct governance rules.

## Axis F — Pragmatism

- **Duplicate `generateSitemapXml`**: There are two `generateSitemapXml` functions — one in `sitemap-helpers.ts:254` (used by the CLI command) and one in `domain/share/astro/routes/sitemap.ts:64` (used by the Astro route). The RFC only mentions amending the one in `sitemap-helpers.ts`. The Astro route version would also need updating, or the RFC should clarify that only the CLI command's output needs markdown alternates (the Astro route may serve a different purpose). This is not necessarily a problem, but the RFC should be explicit about which code paths are affected.

## Axis G — Blind spots

- **Orphaned twin detection**: The RFC says "page.markdown.generate already prunes stale twins (RFC-0166)" but does not specify what happens if a `.md` twin exists in `public/` but the corresponding page was removed from `system.md` after the twin was generated. If pruning runs before sitemap generation (it does — `page.markdown.generate` runs in `build.prepare` before `sitemap.generate`), this is fine. But the RFC should state the pipeline ordering dependency explicitly.
- **Empty `public/` directory**: The RFC says "If no `.md` twins exist in `public/`, the sitemap is generated without markdown alternate links." This is correct, but the RFC should specify that the `markdownTwins` map is an empty `Map` (not `undefined`) in this case, so the `generateSitemapXml` function's optional parameter handling is consistent.

## Questions for the author

1. How should `parseSitemapXml` and `validateSitemapFile` be updated to handle `<xhtml:link>` entries with `type` but no `hreflang`? The current parser regex requires `hreflang` — markdown alternates would be invisible to it, and the validator would reject them as unexpected.
2. Why is `DNA-34` in `satisfies[]` when it has been reclassified to feature (RFC-0161) and is not binding? Should this entry be removed, or is there a binding DNA invariant this RFC actually enforces?
3. What is the exact URL transformation from a page's HTML URL (e.g. `https://warpgogol.com/about/`) to its `.md` twin URL (e.g. `https://warpgogol.com/about.md`)? Does it strip the trailing slash and replace the extension, or does it derive from the route slug directly?
