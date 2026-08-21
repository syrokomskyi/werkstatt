---
rfcId: RFC-0911
auditId: AUDIT-RFC-0911-01
date: 2026-08-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0911

## Verdict: Needs revision

The RFC is structurally sound and fills a real gap (uniqueness + anchor-text quality). However, `packagesImpacted` omits `@warpgogol/werkstatt-shared` where the `SystemManifest` interface lives and must be extended, the DNA-72 reference is decorative, the `en` stop-list is speculative, and the two-command split is unjustified vs. a single command with two rule groups.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **`--json` output shape not documented.** The CLI surface (line 112) shows `--json` flag, but the Output format section (lines 155–166) only says "Standard Diagnostic envelope" without showing the JSON shape. The `--json` envelope should be documented or the flag removed from the CLI surface examples.

2. **"Error from day one" vs. SEO-ANCHOR-02 warning.** The Failure modes section (line 170) says "Error diagnostics exit 1 — error from day one" but SEO-ANCHOR-02 is a warning (line 164). The statement should clarify it applies to SEO-UNIQ-01/02 and SEO-ANCHOR-01 only, not SEO-ANCHOR-02.

## Axis B — DNA alignment

1. **DNA-72 reference is decorative.** DNA-72 (line 295 of `docs/architecture-dna.md`) is about "validator config location diagnostics" — warning when config files are found in likely-but-wrong locations (e.g. `image-delivery.config.yaml` in workpiece root instead of `src/`). The RFC's `seo.anchorText.extraStopPhrases` is a config extension point in `system.md`, not a location diagnostic. The architectural fit section (line 101) claims a relationship that does not hold. Either remove the DNA-72 reference from `related[]` or reframe the connection accurately.

## Axis C — Ecosystem fit

1. **`packagesImpacted` omits `@warpgogol/werkstatt-shared`.** The RFC proposes `seo.anchorText.extraStopPhrases` in `system.md` (line 97, line 132–137). The `SystemManifest` interface is defined in `@warpgogol/werkstatt-shared/src/content/system-manifest.ts:20-104` and currently has no `seo` field. Extending it requires modifying `@warpgogol/werkstatt-shared`, which is NOT listed in `packagesImpacted` (line 55–56). Add it.

2. **File system responsibilities table incomplete.** The table (lines 147–153) doesn't mention `packages/werkstatt-shared/src/content/system-manifest.ts` as a file to modify for the `seo` schema extension, nor `packages/werkstatt-site/src/checks/audit-validators.ts` (the re-export barrel that must export the two new validator functions).

3. **Pipeline placement correct.** `SITES_CHECK_POSTBUILD_PIPELINE` (`packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts`) is the right pipeline. `seo.meta.validate` is already at line 27. The new validators slot in naturally after it.

4. **Command table correct.** `05-seo-audit.ts` is the right registration location. Existing SEO validators (`seo.meta.validate`, `seo.domain.validate`, `seo.cross-lang-links.validate`) are registered there.

## Axis D — Forward-only compliance

No issues. The RFC is forward-only — no compatibility shims, no dual-paths, no deprecation grace periods.

## Axis E — Agent-facing policy

1. **Content greening criterion lacks agent/human boundary.** Acceptance criterion "warpgogol-com content greened and passes both validators" (line 201) requires content authoring through a mission workpiece. The RFC's implementation notes (line 210) correctly state content fixes go through a mission, and line 211 says agents must not mechanically suffix titles. But the criterion doesn't clarify whether an agent or the human operator makes the content decisions (rewriting duplicate titles, replacing generic anchors). Since the RFC explicitly forbids mechanical suffixing, the content greening is a human authoring task. The criterion should state this explicitly.

2. **Status gate correct.** The RFC is `draft` and does not contain self-authorizing language. Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). Correct.

3. **No `NEEDS CLARIFICATION` markers.** Clean.

## Axis F — Pragmatism

1. **`en` stop-list is speculative.** No site in the fleet currently uses English as a content language. The built-in `en` stop-list (line 142) is YAGNI. Include only `de` and `uk` (the languages the fleet actually uses). Add `en` when an English-language site is onboarded. The `system.md` extension point handles site-local needs in the meantime.

2. **Two commands unjustified vs. one.** `seo.meta-uniqueness.validate` and `seo.anchor-text.validate` share the same `collectRenderedHtml` infrastructure and both scan `dist/client/**/*.html`. The RFC doesn't justify why two commands are better than one command (`seo.content-quality.validate` or similar) with two rule groups (SEO-UNIQ-* and SEO-ANCHOR-*). Two commands means two full HTML scan passes over `dist/`. If the operator wants separate exit codes, a `--rules=uniqueness|anchor-text|all` flag on a single command achieves the same without double I/O.

## Axis G — Blind spots

1. **Performance: double scan.** Both validators independently call `collectRenderedHtml(audit.distDirectory)`, which reads every HTML file into memory. For warpgogol-com (~124 pages) this is acceptable, but the RFC doesn't mention the cost or consider sharing a single scan pass. If two commands are kept, note the double-scan cost. If merged into one command, the cost is halved.

2. **`lang` extraction logic unspecified.** `PageMeta.lang` (line 123) says `// from <html lang> or route prefix` but doesn't specify the fallback. What if `<html lang>` is absent and the route has no language prefix (e.g. root-level pages like `/impressum`)? This edge case could cause false collisions (two root-level pages treated as same language) or false non-collisions (pages incorrectly assigned different languages). Specify the extraction logic: prefer `<html lang>`, fall back to route prefix, fall back to the manifest's `i18n.default`.

3. **Empty-state behavior.** The RFC says validators "skip gracefully (exit 0) when `dist/` is not built" (line 115), which matches `seo.meta.validate`'s pattern. Good. But what about a site with only one page? Uniqueness is trivially satisfied with one page — confirm this is the intended behavior.

## Questions for the author

1. Should the two validators be a single command with a `--rules` flag to avoid double HTML scan passes, or are there concrete operational scenarios where operators need to run uniqueness without anchor-text lint (or vice versa)?
2. The `SystemManifest` interface in `@warpgogol/werkstatt-shared` has no `seo` field. Should the `seo.anchorText.extraStopPhrases` extension be added to the `SystemManifest` TypeScript interface (typed), or should the validator read it ad-hoc from the raw frontmatter (untyped)? If typed, `@warpgogol/werkstatt-shared` must be in `packagesImpacted`.
3. What is the `lang` extraction fallback chain for `PageMeta.lang`? Specifically, how are root-level pages without a language prefix handled?
