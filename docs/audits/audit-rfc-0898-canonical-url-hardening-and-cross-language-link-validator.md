---
rfcId: RFC-0898
auditId: AUDIT-RFC-0898-01
date: 2026-08-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0898

## Verdict: Needs revision

The RFC addresses real gaps (canonical domain drift, cross-language links) and the command surface is well-scoped. However, the DNA alignment is decorative, the template hardening doesn't solve the problem it claims to solve, `SEO-XLANG-02` contradicts the Risks section, and Compass/AGENTS.md sync duties are missing.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **Integration point imprecise.** The RFC says validators are added "after `canonical.url.validate` (RFC-0317) and before `image.delivery.validate`" (line 166). In the actual `SITES_CHECK_POSTBUILD_PIPELINE` (`sites-check-postbuild.ts:45-61`), there are 5 validators between `canonical.url.validate` and `image.delivery.validate` (`passport.verify`, `lighthouse.budget.check`, `mobile.layout.check`, `generated.marker.validate`, `need.markers.validate`, `dist.content-references.validate`, `cloudflare.assets.validate`). The RFC should specify the exact position (e.g. "immediately after `canonical.url.validate`") or acknowledge the intervening validators.

2. **Dev/staging patterns list inconsistency.** The Design section (line 68) lists 5 patterns: `dev.`, `staging.`, `localhost`, `127.0.0.1`, `.local`. The Implementation notes (line 197) lists 6 patterns — adds `0.0.0.0`. These must be reconciled to a single closed list.

## Axis B — DNA alignment

1. **DNA-57 alignment is decorative.** DNA-57 (Dev/prod egress parity) is specifically about the Astro dev server applying the same text normalization as production output. The RFC's validators are build-time post-build checks — they don't touch the dev server or propose dev-mode equivalents. The RFC says "by catching domain drift at build time, we ensure that what operators see in dev matches what will be published" (line 76), but this is a conceptual link, not a mechanical enforcement of DNA-57. The RFC should either drop DNA-57 from `satisfies[]` or explain how it mechanically extends the invariant.

2. **DNA-61 alignment is decorative.** DNA-61 (Resolved content regression gate) is about route-level content snapshot hashing against a golden baseline stored in the cache clone. The RFC's validators are standalone post-build HTML scanners — they don't use the content regression gate mechanism, don't read or write golden snapshots, and don't interact with `content.regression.check`. The RFC says "cross-language link errors are content regressions that should be caught before publication" (line 77), but this is a conceptual argument, not a mechanical enforcement of DNA-61. The RFC should either drop DNA-61 from `satisfies[]` or move it to `related[]`.

## Axis C — Ecosystem fit

1. **Compass sync duties missing.** The RFC adds two new post-build validators to `SITES_CHECK_POSTBUILD_PIPELINE` but does not mention which `docs/*.xml` files need synchronization. At minimum, `docs/verification-plan.xml` should gain entries for the new verification mappings (vm-NN for `SEO-DOMAIN-*` and `SEO-XLANG-*` rules).

2. **AGENTS.md update missing.** The RFC does not mention updating `packages/werkstatt-site/AGENTS.md` with entries for `seo.domain.validate` and `seo.cross-lang-links.validate` in the "Check commands" section. Existing entries for `image.delivery.validate`, `csp.origins.validate`, and `a11y.label-in-name.validate` follow this pattern.

## Axis D — Forward-only compliance

1. **Template hardening is incomplete.** The RFC says page templates are "hardened to pass `canonicalUrl` explicitly to `BaseLayout`, eliminating the `Astro.url.toString()` fallback" (line 72). But the RFC's own code example (line 154) shows `canonicalUrl={data.semanticPage?.url ?? Astro.url.toString()}` — the `Astro.url.toString()` fallback is still present, just moved from the layout to the template. Furthermore, `data.semanticPage.url` is derived from `resolvePageRoute`'s `siteUrl` parameter, which the templates set to `Astro.site?.toString() ?? Astro.url.origin` (`[...slug].template.astro:59`, `[lang]/[...slug].template.astro:75`). If `Astro.site` is undefined, `semanticPage.url` still reflects the request host. The hardening doesn't eliminate the fallback — it relocates it. To truly eliminate it, the templates should pass `canonicalUrl={data.semanticPage?.url}` (no fallback) and `resolvePageRoute` should fail closed when `Astro.site` is undefined.

## Axis E — Agent-facing policy

No issues. Status gate is correct, implementation notes reference governance rules, no NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

1. **Two commands justified.** `seo.domain.validate` (domain origin + dev/staging patterns) and `seo.cross-lang-links.validate` (language-prefix consistency) are distinct concerns from existing validators. The alternatives section correctly explains why extending `canonical.url.validate` was rejected.

2. **Template hardening scope.** The template changes are in `packages/werkstatt-site/src/codegen/templates/` — `appsImpacted: []` is correct. But existing materialized workpieces have copies of the old templates. The RFC doesn't address whether workpieces need re-materialization to get the hardened templates (see Axis G).

## Axis G — Blind spots

1. **`SEO-XLANG-02` contradicts Risks section.** The rule catalog (line 115) defines `SEO-XLANG-02` as a warning for "Internal link crosses language boundary with `hreflang` but target language differs from page language." But the Risks section (line 176) says "the validator skips links with `hreflang` attribute on the `<a>` tag." If links with `hreflang` are skipped entirely, `SEO-XLANG-02` can never fire. Either the rule is dead code, or the skip logic in the Risks section is wrong. The RFC must reconcile this.

2. **JSON-LD `url` field extraction unspecified.** The RFC says `seo.domain.validate` checks "JSON-LD `url` fields" (line 68) but doesn't specify which JSON-LD nodes to scan. A rendered page may contain multiple JSON-LD blocks (WebPage, Organization, BreadcrumbList, etc.) with `url` fields at different levels. The RFC should specify: all `url` properties in all `<script type="application/ld+json">` blocks, or only WebPage-level `url`?

3. **Template migration path for existing workpieces.** The template hardening changes `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/pages/[...slug].template.astro` and `[lang]/[...slug].template.astro`. Existing materialized workpieces have copies of the old templates in `missions/<id>/workpiece/src/pages/`. The RFC doesn't address whether these workpieces need re-materialization or manual template updates to benefit from the hardening.

4. **`canonicalUrl` prop already exists in layout.** The RFC presents passing `canonicalUrl` to `BaseLayout` as a new change, but `layout-component.astro:52` already defines `canonicalUrl?: string` as an optional prop and uses it at line 84: `const canonicalUrl = canonicalUrlOverride ?? Astro.url.toString()`. The RFC should acknowledge this existing prop and frame the change as "templates now pass it" rather than "layout gains a new prop."

## Questions for the author

1. DNA-57 and DNA-61 are in `satisfies[]` but the RFC doesn't mechanically enforce either invariant. Should they be moved to `related[]`, or can you explain how the validators extend the invariants beyond a conceptual link?
2. The template hardening code example still has `Astro.url.toString()` as a fallback. How will you eliminate the fallback entirely — will `resolvePageRoute` fail closed when `Astro.site` is undefined?
3. `SEO-XLANG-02` fires when a link with `hreflang` crosses language boundaries, but the Risks section says links with `hreflang` are skipped. Which behavior is correct?
