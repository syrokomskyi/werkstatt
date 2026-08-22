---
reviewId: REVIEW-CODE-2026-08-22-01
date: 2026-08-22
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 8c24c6f2^...HEAD
filesReviewed:
  - packages/werkstatt-shared/src/share/semantic/ids.ts
  - packages/werkstatt-shared/src/share/semantic/organization-profile.ts
  - packages/werkstatt-site/src/checks/audit/validators/jsonld.ts
  - packages/werkstatt-site/src/checks/audit-validators.ts
  - packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts
  - packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts
  - packages/werkstatt-site/src/checks/tests/jsonld-canonical-entity.test.ts
  - packages/werkstatt-shared/AGENTS.md
  - packages/werkstatt-site/AGENTS.md
  - docs/verification-plan.xml
  - docs/rfcs/rfc-0910-canonical-entity-identity-urls-in-json-ld.md
---

# Code Review: RFC-0910 implementation (8c24c6f2^...HEAD)

## Verdict: Needs revision

The implementation is architecturally sound and covers all RFC-0910 acceptance criteria. Two findings require attention: a duplicated skip-block pattern (Axis A) and a JSONLD-ENTITY-02 false-negative risk for non-default-language prefixes (Axis G).

## Mechanical floor

Pass — both `@warpgogol/werkstatt-shared` and `@warpgogol/werkstatt-site` pass `build:check` (tsc --noEmit). 13 unit tests pass. `rfc.validate --id RFC-0910` passes with 0 errors.

## Axis A — Structural correctness

**Finding A-1: Duplicated skip-block pattern (Duplicated Code)**

`runJsonLdCanonicalEntityValidate` at `jsonld.ts:262-274` and `jsonld.ts:278-290` contains two near-identical skip-and-return blocks: both build an empty `buildAuditResult` with the same fields and return `{ data, exitCode: 0, summary: "skipped (...)" }`. This is the same shape repeated twice with only the summary message differing.

```typescript
// jsonld.ts:262-274 — first skip block
if (htmlFiles.length === 0) {
  const result = buildAuditResult({ command, app, workspaceRoot, findings, runtimeMs });
  return { data: result, exitCode: 0, summary: "skipped (no dist/ HTML)" };
}
// jsonld.ts:278-290 — second skip block (same shape, different message)
if (!siteUrl) {
  const result = buildAuditResult({ command, app, workspaceRoot, findings, runtimeMs });
  return { data: result, exitCode: 0, summary: "skipped (Astro.site not configured)" };
}
```

Suggestion: extract a `skipResult(message)` helper within the function to reduce duplication. Minor — does not block.

## Axis B — DNA alignment

No issues. The diff satisfies DNA-85 (canonical URL integrity) by ensuring entity identity URLs use the unprefixed root. No other DNA invariants are touched.

## Axis C — Ecosystem fit

No issues. Package boundaries are correct: `canonicalRootUrl` lives in `werkstatt-shared` (shared semantic layer), the validator lives in `werkstatt-site` (checks module). Pipeline placement is correct: `jsonld.canonical-entity.validate` is placed in `SITES_CHECK_POSTBUILD_PIPELINE` after `jsonld.url.validate` and before `jsonld.parity`, matching the RFC plan. Command registration in `05-seo-audit.ts` follows the existing pattern. AGENTS.md and verification-plan.xml are updated.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual code paths, no legacy bridges. The `canonicalRootUrl` helper replaces the old `baseUrl` usage directly in `organization-profile.ts:108`.

## Axis E — Agent-facing clarity

No issues. New source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. The test file includes Compass headers. Variable names are clear (`expectedRoot`, `expectedPath`, `siteOrigin`, `defaultPrefix`). The RFC acceptance criteria are all checked with inline `(evidence: ...)` annotations.

## Axis F — Pragmatism

No issues. The validator reuses existing helpers (`collectRenderedHtml`, `extractAllJsonLdNodes`, `jsonLdNodeHasType`, `toComparablePathname`, `readAstroSiteUrl`, `defaultLanguageFromManifest`, `loadSystemManifest`). No new dependencies. The command earns its existence — it checks a distinct concern (entity identity URL canonicality) that `jsonld.url.validate` does not cover.

## Axis G — Blind spots

**Finding G-1: JSONLD-ENTITY-02 may false-negative on non-default-language prefixes**

The BreadcrumbList check at `jsonld.ts:342` only checks `itemPath === expectedPath || itemPath === defaultPrefix`. If a breadcrumb home item uses a non-default-language prefix (e.g. `/uk/` on a site where `de` is default), the path normalizes to `/uk`, which matches neither `expectedPath` (`/`) nor `defaultPrefix` (`/de`). The finding is not emitted.

This is a minor false-negative: in practice, the home breadcrumb item should always be either `/` (canonical) or `/{defaultLang}` (the common mistake). A `/uk/` home breadcrumb on a `de`-default site is an unusual misconfiguration that would be caught by `jsonld.url.validate` or `seo.domain.validate` separately. Not blocking, but worth noting for future hardening.

**Finding G-2: `node["@type"]` in error message may render array values**

At `jsonld.ts:320`, the error message uses `${node["@type"]}` directly. If `@type` is an array (e.g. `["Organization", "NGO"]`), the message renders as `Organization,NGO url (...)` which is readable but not ideal. Minor cosmetic issue — does not affect diagnostics processing.

## Spec compliance

| Requirement from RFC-0910 | Status | Evidence |
| --- | --- | --- |
| `buildOrganizationProfile` uses canonical root | Done | `organization-profile.ts:108` — `url: canonicalRootUrl(baseUrl)` |
| `WebSite.url` inherits from `page.organization.url` | Done | `jsonld/website.ts:22` — `url: page.organization.url` |
| Breadcrumb home uses `localizeUrl` (already correct) | Done | No change needed — `resolve-route.ts:995` |
| `jsonld.canonical-entity.validate` registered | Done | `05-seo-audit.ts:77-86` |
| Validator wired into postbuild pipeline | Done | `sites-check-postbuild.ts:31` |
| JSONLD-ENTITY-03 same-origin only | Done | `jsonld.ts:369-371` — origin check before prefix check |
| Unit tests cover edge cases | Done | `jsonld-canonical-entity.test.ts` — 13 tests |
| AGENTS.md docs updated | Done | `werkstatt-shared/AGENTS.md:58-73`, `werkstatt-site/AGENTS.md:100` |
| verification-plan.xml updated | Done | `docs/verification-plan.xml:565-568` |
| `rfc.validate` passes | Done | 0 errors, 1 warning (status transition) |

## Questions for the author

1. Is the JSONLD-ENTITY-02 false-negative for non-default-language prefixes (e.g. `/uk/` home breadcrumb on a `de`-default site) acceptable, or should the check compare against all configured language prefixes?
2. Could the two skip-blocks in `runJsonLdCanonicalEntityValidate` be extracted into a shared helper to reduce duplication?
