---
rfcId: RFC-0907
auditId: AUDIT-RFC-0907-01
date: 2026-08-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0907 — Sitemap integrity validators: placeholder expansion and route coverage

## Verdict: Needs revision

The RFC is structurally well-formed and addresses a real gap (placeholder URLs and coverage gaps in sitemaps). However, it contains a mechanical validation violation (V-28), a pipeline ordering error (proposes insertion before `robots.page.validate` which already runs before `canonical.url.validate`), an unexplained `@warpgogol/werkstatt-shared` in `packagesImpacted`, and a sitemap file path discrepancy with the existing `canonical.url.validate` convention.

## Mechanical validation (rfc.validate)

**Fail** — 1 violation:

- **V-28**: RFC-0907 (createdAt 2026-08-22) has a lower number than RFC-0916 (createdAt 2026-08-21). RFC-ids must be monotonically non-decreasing with respect to createdAt (RFC-0478). Fix: either change createdAt to 2026-08-21 or renumber the RFC to > 0916.

## Axis A — Structural completeness

- **Decision** is present tense and clear. Pass.
- **CLI surface** shows exact invocations. Pass.
- **TypeScript contracts** are minimal signatures. Pass.
- **File system responsibilities** table names concrete paths. Pass.
- **Output format** documents `--json` shape. Pass.
- **Failure modes** specifies exit codes and warn-vs-fail. Pass.
- **Rollout** describes default behavior and adoption. Pass.
- **Alternatives considered** has 3 real alternatives with rejection reasons. Pass.
- **Risks** covers performance, false positives, maintenance. Pass.
- **Acceptance criteria** are checkable but do not cover the V-28 fix or the pipeline ordering correction (see Axis C). Minor gap.
- **Implementation notes** are explicit behavioral rules. Pass.

## Axis B — DNA alignment

- **DNA-58** is listed in `related[]` but not in `satisfies[]`. The RFC body says "DNA-58 ... extends to sitemap integrity" — this is an extension claim. For a `command` kind RFC, `satisfies` is not required, but the body language ("extends") implies a stronger relationship than `related`. Either add `satisfies: [DNA-58]` or soften the body language to "complements" rather than "extends".
- No new DNA invariant is established by this RFC. Pass.
- No conflicts with existing DNA invariants. Pass.

## Axis C — Ecosystem fit

- **Pipeline ordering error**: The RFC proposes inserting the new validators "after `canonical.url.validate` and before `robots.page.validate`" (line 272-279). However, in the actual `SITES_CHECK_POSTBUILD_PIPELINE` (`sites-check-postbuild.ts:44,48`), `robots.page.validate` runs at line 44 and `canonical.url.validate` runs at line 48 — `robots.page.validate` runs BEFORE `canonical.url.validate`, not after. The proposed ordering is impossible. The RFC should propose inserting after `canonical.url.validate` (line 48) and before `dist.sitemap.images.validate` (line 54) or another adjacent step.
- **Command registration table**: The RFC says both commands are registered in `09b-build-artifacts-part2.ts`. This is feasible — the file ends at line 884 and has room. However, `robots.page.validate` (which the RFC references in its pipeline ordering) is registered in `05-seo-audit.ts`, not `09b`. The RFC should verify the table choice is consistent with the pipeline neighbors.
- **Sitemap file path discrepancy**: The RFC says "Glob `dist/client/sitemap*.xml`" (line 140). The existing `canonical.url.validate` reads sitemaps from `paths.publicDirectory` (which resolves to `public/`), not `dist/client/`. This is a convention mismatch. The RFC should either (a) follow the existing convention and read from `public/`, or (b) explain why `dist/client/` is more correct for post-build validators and note the inconsistency with `canonical.url.validate`.
- **`extractSitemapUrls` reuse**: The implementation notes say "Agents MUST reuse `extractSitemapUrls` from `canonical-url.ts`". This function is currently private (not exported) in `canonical-url.ts:41`. The RFC should note that it needs to be exported or extracted to a shared helper.
- **`@warpgogol/werkstatt-shared` in `packagesImpacted`**: The RFC lists this package but no change to it is described anywhere in the body. The `diagnosticsResult` helper is imported from `./result-helpers.ts` within `werkstatt-site`. Either remove `werkstatt-shared` from `packagesImpacted` or document what changes in it.
- **Compass sync**: The RFC identifies `docs/verification-plan.xml` for new rule IDs. Pass. But it does not mention `docs/COMMANDS.md` regeneration (needed for new command registrations).
- **AGENTS.md updates**: The RFC says `packages/werkstatt-site/AGENTS.md` documents both new commands. Pass.

## Axis D — Forward-only compliance

- No backward compatibility layers, shims, or dual-paths. Pass.
- No deprecation of existing commands. Pass.
- Legacy code paths are not maintained behind flags. Pass.

## Axis E — Agent-facing policy

- **Status gate**: The RFC says "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Pass.
- **Implementation notes** reference the correct governance rules. Pass.
- **Anti-fabrication**: No content authoring is claimed as auto-generated. Pass.
- **Storage policy**: No persistence changes. Pass.
- **NEEDS CLARIFICATION markers**: None found. Pass.

## Axis F — Pragmatism

- **Minimal command surface**: Two commands, each with a distinct responsibility (URL validity vs. set completeness). The alternatives section justifies the split. Pass.
- **Lean contracts**: TypeScript types are minimal. Pass.
- **Existing patterns**: The RFC reuses `canonicalPageUrl` and `diagnosticsResult`. Pass.
- **Scope discipline**: `appsImpacted: []` is correct (no app changes). `packagesImpacted` includes `werkstatt-shared` which is unexplained (see Axis C).

## Axis G — Blind spots

- **Performance**: The RFC says "Sitemap files are small (thousands of URLs at most). Performance impact is negligible." This is reasonable. Pass.
- **False positives**: SITEMAP-PH-01 has no false positives (brackets in URLs are always invalid). SITEMAP-COV-01 has no false positives by design. SITEMAP-COV-02 is a warning. Pass.
- **Edge cases**: The RFC considers missing sitemap files (skip with info), missing `system.md` (skip with info), and empty sitemaps (skip with info). Pass. However, it does not consider the case where `output.sitemap` is an object (`{ include: false }`) rather than a boolean — the actual codebase supports both forms (see `isSitemapExcluded` in `routes/registry.ts:93-101`). The RFC should mention both forms.
- **Migration path**: Existing sites with placeholder URLs will fail. The RFC says "The fix is to correct the sitemap generator." This is adequate but could briefly note that the sitemap generator fix is a separate code change (not part of this RFC).
- **Security/privacy**: No user data or PII touched. Pass.

## Questions for the author

1. How should the V-28 violation be resolved — change `createdAt` to 2026-08-21 or renumber the RFC to > 0916?
2. Where should the new validators be inserted in `SITES_CHECK_POSTBUILD_PIPELINE` given that `robots.page.validate` (line 44) already runs before `canonical.url.validate` (line 48)?
3. Should the validators read sitemaps from `dist/client/` (as the RFC proposes) or from `public/` (as `canonical.url.validate` does)? If `dist/client/`, why the convention difference?
4. What change in `@warpgogol/werkstatt-shared` justifies its inclusion in `packagesImpacted`?
5. Should `output.sitemap` object form (`{ include: false }`) be handled in `sitemap.coverage.validate`, or only the boolean form?
