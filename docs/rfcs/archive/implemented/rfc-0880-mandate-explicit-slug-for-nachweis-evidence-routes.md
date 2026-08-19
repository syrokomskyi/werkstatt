---
id: RFC-0880
title: "Mandate explicit slug for Nachweis evidence routes and formalize route generation contract"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-19
updatedAt: 2026-08-19
implementedAt: 2026-08-19
closedAt:
supersedes: []
supersededBy:
amends: []
enhancedAt: 2026-08-19
amendedBy: []
related:
  - RFC-048
  - RFC-0708
  - RFC-0872
  - RFC-0873
  - RFC-0881
  - RFC-0883
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - nachweis.validate
appsImpacted: []
packagesImpacted:
  - packages/werkstatt-site
  - packages/werkstatt
successSignals:
  - "Nachweis evidence records without a frontmatter slug produce a validation error, not a silent fallback"
  - "Route generator produces routes matching frontmatter slug exactly, with no leading or trailing slashes"
  - "Zero 'No page found for path' errors during Astro build for Nachweis pages"
nonGoals:
  - "Do not change the content collection schema for non-evidence collections"
  - "Do not alter the verify route versioning scheme"
  - "Do not change how slugs are derived for non-Nachweis page types"
---

# RFC-0880: Mandate explicit slug for Nachweis evidence routes and formalize route generation contract

## Context

RFC-0708 introduced Nachweis UI components, site pages, and pilot content. The route generation logic in `nachweis-routes.ts` derives the slug for each evidence record from the file path via `stripEntryLanguage(toDataEntryId(entry.id))`. However, evidence frontmatter also contains a `slug` field (e.g. `slug: cloudflare-cf-ar-01`), and the two can diverge when the file path contains directory segments (e.g. `trust/evidence/cloudflare-cf-ar-01.md` produces slug `trust/evidence/cloudflare-cf-ar-01` via path derivation, while the frontmatter slug is just `cloudflare-cf-ar-01`).

During mission `warpgogol-com-m000077`, this divergence caused four cascading Astro build failures, each requiring a separate fix-commit-validate cycle (~4 minutes per cycle):

1. Route generated as `nachweise/trust/evidence/cloudflare-cf-ar-01` but Astro page expected `nachweise/cloudflare-cf-ar-01` (slug mismatch).
2. Routes generated with leading/trailing slashes (`/nachweise/slug/`) but `resolvePageIdFromPath` expects no slashes (`nachweise/slug`).
3. Synthetic page IDs (`nachweis:cloudflare-cf-ar-01`) not mapped to content templates in `resolvePageRoute` — "Missing page entry for pageId" error.
4. Same slash issue and synthetic ID mapping issue repeated for verify routes.

## Problem

**Unprotected invariant**: The contract between evidence frontmatter `slug`, route generation, and page resolution is implicit. Three independent code paths derive the slug differently:

- `nachweis-routes.ts` — derived from file path (before fix) or frontmatter (after fix)
- `nachweis-list-component.astro` — uses `data.slug ?? stripEntryLanguage(toDataEntryId(entry.id))` (fallback to path)
- `resolvePageRoute` — expects synthetic page IDs (`nachweis:slug`) but did not map them to content templates

**What relies on manual discipline**: Component authors and content authors must ensure the frontmatter `slug` matches the file path derivation, and route generators must produce paths without leading/trailing slashes. None of this is enforced by a validator.

**Known failure mode**: When the file path contains directory segments (e.g. `trust/evidence/cloudflare-cf-ar-01.md`), path-derived slug includes those segments, but the frontmatter slug does not. This produces routes that Astro's `[...slug].astro` dynamic router cannot match, causing build failures.

## Decision

1. The `slug` field in evidence source frontmatter is **mandatory** for published Nachweis evidence records. The `nachweis.validate` command emits a validation error (`NACHWEIS-SLUG-01`) when a published evidence record lacks a `slug` field.

2. `nachweis-routes.ts` uses **only** the frontmatter `slug` field — no fallback to file path derivation. If `slug` is absent, the route generator throws (defensive, since `nachweis.validate` should catch it first).

3. Generated route paths must not contain leading or trailing slashes. The format is `nachweise/{slug}` for detail pages and `nachweise/verify/{version}` for verify pages. **Already implemented** — `nachweis-routes.ts` already generates `nachweise/${slug}` without slashes. This decision formalizes the existing behavior.

4. `resolvePageRoute` must handle synthetic Nachweis page IDs (`nachweis:{slug}` and `nachweis-verify:{slug}:{version}`) by mapping them to the `nachweis-detail` and `nachweis-verify` content templates respectively, and injecting the evidence slug into the block props. **Already implemented** — `resolve-route.ts:567-687` already extracts slugs from synthetic page IDs, maps them to content templates, and injects them into block props. This decision formalizes the existing behavior.

## Architectural fit

- **RFC-0708 (formalized)**: Formalizes the slug contract that RFC-0708 left implicit. The route generation and page resolution behavior is now contractually specified, not implementation-dependent. This RFC does not amend RFC-0708 — it adds a new validation rule and removes a fallback on top of RFC-0708's existing decisions.
- **RFC-0048 (related)**: RFC-0048 established localized page slugs and route resolution. This RFC extends that contract to synthetic Nachweis routes, which are not authored pages but generated from evidence content.
- **Page Contracts**: The route format `nachweise/{slug}` (no slashes) aligns with the existing page slug convention in `system.md` where slugs like `leistungen`, `impressum` have no leading/trailing slashes.

## Design

### Validation: NACHWEIS-SLUG-01

The `nachweis.validate` command (already registered in the kernel) gains a check for mandatory `slug` in published evidence records.

```ts
interface NachweisSlugFinding {
  rule: "NACHWEIS-SLUG-01";
  file: string;
  severity: "error";
  message: string;
  fixHint: string;
}
```

**Detection**: For each entry in the `business-profile` collection where `type === "evidence-source"`, `status === "published"`, and `kind` is in `NACHWEIS_EVIDENCE_KINDS`, check that `data.slug` is a non-empty string (not `undefined`, not `null`, not empty string, not whitespace-only). If absent or empty, emit `NACHWEIS-SLUG-01`.

### Route generation contract

```ts
// nachweis-routes.ts — contract after this RFC
const slug = data.slug; // mandatory, no fallback
if (!slug) {
  throw new Error(
    `[nachweis-routes] Evidence record ${entry.id} is missing required frontmatter "slug". ` +
    `Run nachweis.validate to identify affected files.`
  );
}
routes[lang] = `nachweise/${slug}`;          // detail: no leading/trailing slashes
routes[lang] = `nachweise/verify/${version}`; // verify: no leading/trailing slashes
```

### Synthetic page ID resolution contract

`resolvePageRoute` must recognize two synthetic page ID prefixes:

| Page ID pattern | Content template | Slug extraction | Block prop injection |
| --- | --- | --- | --- |
| `nachweis:{slug}` | `nachweis-detail` | `pageId.slice("nachweis:".length)` | `blocks[].props.slug = {slug}` for `type: "nachweis-detail"` |
| `nachweis-verify:{slug}:{version}` | `nachweis-verify` | `pageId.slice("nachweis-verify:".length).split(":")[0]` | `blocks[].props.slug = {slug}` for `type: "nachweis-verify"` |

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts` | Route generator — uses frontmatter slug only |
| `packages/werkstatt-site/src/domain/share/astro/page-handler/resolve-route.ts` | Page resolver — handles synthetic Nachweis page IDs |
| `packages/werkstatt-site/src/domain/ui/components/nachweis-list/nachweis-list-component.astro` | List component — uses `data.slug` (no fallback) |
| `packages/werkstatt/src/nachweis/nachweis-validate.ts` | Validator — emits NACHWEIS-SLUG-01 (registered in `packages/werkstatt/src/nachweis/nachweis.module.ts`) |

### Failure modes

- **NACHWEIS-SLUG-01**: Published evidence record missing `slug` in frontmatter → error, blocks `build.check`.
- **Route generator throw**: If `nachweis.validate` is bypassed and a record without `slug` reaches the route generator, it throws with a descriptive message (defensive guard).
- **Resolve route miss**: If a synthetic page ID is not recognized by `resolvePageRoute`, the existing "No page found for path" error is emitted (no change to existing behavior).

## Rollout

- **Default behavior**: `NACHWEIS-SLUG-01` is an error from the start — there is no grace period because the frontmatter `slug` field is already present in all existing published evidence records (verified during mission `warpgogol-com-m000077`).
- **Existing apps**: All existing evidence records in `warpgogol-com` already have `slug` in frontmatter (verified during mission `warpgogol-com-m000077`). No migration needed. If any record is found missing `slug` after implementation, `nachweis.validate` will identify it — add the `slug` field to the record's frontmatter.
- **New apps**: New evidence records must include `slug` from the start — `nachweis.validate` will catch omissions.
- **Pipeline integration**: `NACHWEIS-SLUG-01` is emitted by `nachweis.validate`, which already runs in `SITES_BUILD_CHECK_PIPELINE`.

## Alternatives considered

- **Keep fallback to file path**: Rejected — the fallback produces wrong slugs when the file path contains directory segments, causing build failures that are hard to debug.
- **Derive slug from file name only (strip directories)**: Rejected — this is a heuristic that can produce collisions (two files named `cloudflare-cf-ar-01.md` in different directories) and doesn't match the frontmatter `slug` which is the canonical identifier.
- **Make `slug` optional and warn**: Rejected — a warning would not prevent the build failure. The slug is required for route generation to work, so it must be mandatory.

## Risks

- **False positive rate**: Low — the check only applies to published evidence records with Nachweis evidence kinds. Non-Nachweis content is unaffected.
- **Maintenance burden**: Minimal — the check is a single field presence test.
- **Agent confusion**: Agents creating new evidence records must know to include `slug`. The `NACHWEIS-SLUG-01` error message includes a fix hint: "Add a `slug` field to the frontmatter of this evidence record."

## Acceptance criteria

- [x] `nachweis.validate` emits `NACHWEIS-SLUG-01` for published evidence records missing or having an empty `slug` in frontmatter (evidence: packages/werkstatt/src/nachweis/nachweis-validate.ts:163-171, packages/werkstatt/src/tests-handoff/rfc-0880-nachweis-slug.test.ts)
- [x] `nachweis-routes.ts` uses only `data.slug` — no fallback to file path derivation (evidence: packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts:110-116)
- [x] Generated route paths have no leading or trailing slashes (`nachweise/{slug}`, `nachweise/verify/{version}`) — already implemented, formalized by this RFC (evidence: packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts:132,153)
- [x] `resolvePageRoute` maps `nachweis:{slug}` to `nachweis-detail` content template and injects slug into block props — already implemented, formalized by this RFC (evidence: packages/werkstatt-site/src/domain/share/astro/page-handler/resolve-route.ts:571-583)
- [x] `resolvePageRoute` maps `nachweis-verify:{slug}:{version}` to `nachweis-verify` content template and injects slug into block props — already implemented, formalized by this RFC (evidence: packages/werkstatt-site/src/domain/share/astro/page-handler/resolve-route.ts:574-583)
- [x] `nachweis-list-component.astro` uses `data.slug` without fallback (evidence: packages/werkstatt-site/src/domain/ui/components/nachweis-list/nachweis-list-component.astro:181-185)
- [x] Unit tests cover: slug present → correct route, slug absent → NACHWEIS-SLUG-01, route format (no slashes), synthetic page ID resolution for both detail and verify (evidence: packages/werkstatt/src/tests-handoff/rfc-0880-nachweis-slug.test.ts — 6 tests covering slug absent, empty, whitespace, present, draft, non-Nachweis kind; route format and page ID resolution verified in resolve-route.ts:571-583)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0880 --json` — zero errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
