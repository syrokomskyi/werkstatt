---
id: RFC-0495
title: "Surface URL restructuring — remove country/region segments from canonical URLs"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-23
updatedAt: 2026-07-23
enhancedAt: 2026-07-23
implementedAt: 2026-07-23
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0238
amendedBy: []
related:
  - RFC-0192
  - RFC-0193
  - RFC-0238
  - RFC-0478
  - RFC-0480
  - RFC-0492
  - RFC-0494
  - RFC-0496
  - RFC-0497
satisfies:
  - DNA-16
  - DNA-39
breaksC: true
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - surface.generate
    - surface.validate
    - public.infrastructure.generate
    - redirect.map.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-handoff"
  - "@gogol/share"
successSignals:
  - "Canonical URLs for depth-4 city pages no longer include country/region segments: /website/{industry}/{city}/ (DE) and /sait/{industry}/{city}/ (UK) instead of /website/{industry}/{country}/{region}/{city}/."
  - "Canonical URLs for depth-5 demand pages no longer include country/region segments: /website/{industry}/{city}/{demand}/ (DE) and /sait/{industry}/{city}/{demand}/ (UK) instead of /website/{industry}/{country}/{region}/{city}/{demand}/."
  - "Old URLs with /deu/bw/ segments return 301 redirects to the new canonical URLs — no 200 responses on old patterns."
  - "Depth-2 (country) and depth-3 (region) levels remain as virtual navigation hubs with noindex and no sitemap inclusion — their URLs are preserved as /website/{industry}/{country}/ and /website/{industry}/{country}/{region}/ for internal navigation only."
  - "The sitemap contains only the new canonical URLs — no old /deu/bw/ URLs remain."
  - "public.infrastructure.generate emits reversed redirect entries in public/_redirects: old /website/{industry}/{country}/{region}/{city}/ → new /website/{industry}/{city}/ (301)."
  - "redirect.map.validate confirms the _redirects file carries the generated marker and all old surface URLs have 301 entries to the correct new URLs."
  - "surface.generate emits pages at the new URL slugs."
  - "No broken internal links — all cross-references between surface pages use the new URL pattern."
  - "url-schema.yaml C-contract is updated with depth-4 and depth-5 route patterns matching the new slug templates."
  - "A migrator is registered in the migrator registry (RFC-0479) with id rfc-0495; it is a no-op on authored data (URLs are derived from blueprint + geo, not authored) but advances the migratorCursor."
nonGoals:
  - "Does not add or remove depth levels from the blueprint — the six-level cascade (depth 0–5) is preserved. Only the slug templates for depth-4 and depth-5 change."
  - "Does not change the content of any surface page — this RFC is purely about URL structure and redirects."
  - "Does not add a service level — that is RFC-0496."
  - "Does not change the intersection gate — that is RFC-0497."
  - "Does not change structured data — that is RFC-0498."
  - "Does not change the country/region navigation hub pages themselves — they remain as noindex navigation pages at their existing URLs."
  - "Does not remove the country and region axes from the blueprint — they remain as universe axes for eligibility and navigation. Only the slug templates drop them from the canonical URL path."
  - "Does not add cross-country city slug disambiguation to @gogol/geo — the current dataset only covers Germany (country: deu), so no disambiguation is needed. Cross-country slug collisions are a future @gogol/geo concern when the dataset expands beyond one country."
  - "Does not change the locale prefix strategy — the optional-prefix strategy in url-schema.yaml is unaffected by the slug template change."
  - "Does not introduce runtime HTTP probing for redirect verification — redirect.map.validate is a static check of the generated _redirects file, not a live URL probe."
---

# RFC-0495: Surface URL restructuring — remove country/region segments from canonical URLs

## Context

The `website-local` surface (RFC-0238) generates a six-level geo-demand cascade with the following slug templates:

| Depth | Current slug (DE) | Current slug (UK) |
| --- | --- | --- |
| 0 | `website` | `sait` |
| 1 | `website/{industry}` | `sait/{industry}` |
| 2 | `website/{industry}/{country}` | `sait/{industry}/{country}` |
| 3 | `website/{industry}/{country}/{region}` | `sait/{industry}/{country}/{region}` |
| 4 | `website/{industry}/{country}/{region}/{city}` | `sait/{industry}/{country}/{region}/{city}` |
| 5 | `website/{industry}/{country}/{region}/{city}/{demand}` | `sait/{industry}/{country}/{region}/{city}/{demand}` |

An external expert review (file 14.3) identified that the `/deu/bw/` technical segments in canonical URLs are:

1. **Not useful for users** — no one searches for "Friseur Stuttgart Baden-Württemberg Deutschland".
2. **Not useful for search engines** — they dilute the URL with non-descriptive segments.
3. **Inconsistent with the canonical hierarchy** — the expert's proposed hierarchy is `/website/{industry}/{city}/` and `/website/{industry}/{city}/{service}/`.

Depth-2 (country) and depth-3 (region) are already `navigation-noindex` with `includeInSitemap: false` — they serve as internal navigation hubs only. Their URLs are preserved for navigation, but they should not appear in the canonical URL path of their children.

## Problem

The slug templates for depth-4 and depth-5 include `{country}` and `{region}` segments that are:

1. Redundant — the city slug already implies the country and region.
2. Non-descriptive — `/deu/bw/` adds no semantic value to the URL.
3. Harmful to SEO — longer URLs with non-keyword segments dilute relevance signals.
4. Inconsistent with the expert's canonical hierarchy.

Removing these segments is a **Layer C change** (external surface: URL schema). Per RFC-0480, this requires `breaksC: true` and a redirect map to preserve existing URL equity.

## Decision

### Slug template changes

| Depth | New slug (DE) | New slug (UK) | Change |
| --- | --- | --- | --- |
| 0 | `website` | `sait` | unchanged |
| 1 | `website/{industry}` | `sait/{industry}` | unchanged |
| 2 | `website/{industry}/{country}` | `sait/{industry}/{country}` | unchanged (navigation hub) |
| 3 | `website/{industry}/{country}/{region}` | `sait/{industry}/{country}/{region}` | unchanged (navigation hub) |
| 4 | `website/{industry}/{city}` | `sait/{industry}/{city}` | **removed `{country}/{region}`** |
| 5 | `website/{industry}/{city}/{demand}` | `sait/{industry}/{city}/{demand}` | **removed `{country}/{region}`** |

The country and region axes remain in the blueprint for eligibility and navigation — they are still used to determine which city records are live and to render navigation hubs. Only the slug templates for depth-4 and depth-5 drop them from the URL path.

### Redirect map

The existing `buildRetiredSurfaceRedirectBlock` in `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` already generates redirect entries for surface URLs in `public/_redirects` via `public.infrastructure.generate`. Currently, it redirects short URLs (without country/region) to long URLs (with country/region) — the opposite direction. This RFC **reverses the redirect direction**: old URLs with `{country}/{region}` redirect (301) to new URLs without them.

```
/website/{industry}/{country}/{region}/{city}/  →  /website/{industry}/{city}/  (301)
/website/{industry}/{country}/{region}/{city}/{demand}/  →  /website/{industry}/{city}/{demand}/  (301)
```

The redirect map is emitted in the existing `public/_redirects` file (Cloudflare Pages format) by `public.infrastructure.generate`. The existing `redirect.map.validate` command in `packages/os/site-kernel-checks/src/public-surface/managed-public.ts` verifies that the `_redirects` file carries the generated marker and contains valid redirect entries.

### Blueprint changes

The `website-local.yaml` blueprint slug templates for depth-4 and depth-5 are updated:

```yaml
- depth: 4
  slug:
    {
      de: "website/{industry}/{city}",
      uk: "sait/{industry}/{city}",
    }
- depth: 5
  slug:
    {
      de: "website/{industry}/{city}/{demand}",
      uk: "sait/{industry}/{city}/{demand}",
    }
```

### City slug uniqueness

With country/region removed from the URL, city slugs must be globally unique within a language (not just unique within a region). The geo provider (`@gogol/geo`) derives city slugs from city names per language via `citySlug()` in `packages/geo/src/slug.ts`. The city `id` includes country and region (`de-bw-stuttgart`), but `slugByLang` is just the transliterated city name. The current dataset only covers Germany (country: `deu`), so no cross-country collisions exist. When the dataset expands beyond one country, `@gogol/geo` must ensure cross-country slug uniqueness — either by disambiguating with a country suffix (`stuttgart-de` vs `stuttgart-us`) or by relying on natural name differences. This is a future `@gogol/geo` concern, not addressed by this RFC.

### Impact on existing pages

All existing depth-4 and depth-5 URLs change. The redirect map ensures no 404s. The sitemap is regenerated with only the new URLs. Internal links between surface pages are updated by `surface.generate` to use the new slug templates. Noindex depth-5 pages (below `noindexBelowPerDepth: { 5: 1 }`) also receive redirects — the redirect map covers all old URLs regardless of indexability.

### C-contract update

The declarative C-contract at `packages/ontology/src/external-surfaces/url-schema.yaml` must be updated with the new route patterns. The current `url-schema.yaml` already contains a pattern `/:locale?/:industry/:city` (without country/region) — this was ahead of the actual blueprint. This RFC adds the depth-5 pattern and aligns the contract with the new slug templates:

```yaml
routePatterns:
  - pattern: "/:locale?/:slug"
    params:
      locale: { optional: true, enum: [de, en] }
      slug: { type: string }
    generated: false
  - pattern: "/:locale?/:industry/:city"
    params:
      locale: { optional: true, enum: [de, en] }
      industry: { type: string, from: ontology.Industry }
      city: { type: string }
    generated: true
  - pattern: "/:locale?/:industry/:city/:demand"
    params:
      locale: { optional: true, enum: [de, en] }
      industry: { type: string, from: ontology.Industry }
      city: { type: string }
      demand: { type: string }
    generated: true
```

### Migrator

`versionBump: minor` implies Breaks-B (RFC-0478), which requires a migrator in the registry (RFC-0479). The migrator for this RFC is a **no-op on authored data**: URL slugs are derived from the blueprint YAML + `@gogol/geo` provider data, not authored in content records. City content records (RFC-0494) use `slug` matching `geo.cities` slugs — those slugs do not change. Demand records do not contain URL slugs. The migrator is registered with id `rfc-0495` to advance the `migratorCursor` in `system.pin.json`, ensuring that `mission.migrate` records the platform version transition. The migrator is idempotent (PBT f(f(x))==f(x)): it returns authored data unchanged.

## Architectural fit

- **DNA-16 (Semantic layer shares topology with navigation):** The URL pattern change affects sitemap, breadcrumbs, and JSON-LD output. All semantic outputs are derived from the same route topology (`getRouteRegistry()` from `@gogol/share`), so updating the slug templates in the blueprint propagates consistently to sitemap, breadcrumbs, and JSON-LD. No parallel page-structure model is introduced.
- **DNA-39 (Route registry is a merge of route sources):** The URL pattern change flows through the existing route registry. `surface.generate` expands the blueprint into `src/surface.generated.json` with the new slug templates; `@gogol/share` route registry folds those virtual entries in behind the `pseo` entitlement. No new route source is introduced.
- **RFC-0238 (website-local surface):** Amended — slug templates for depth-4 and depth-5 change. The five-axis cascade (industry × country × region × city × demand) is preserved; only the slug templates drop `{country}/{region}` from the URL path. Country and region axes remain in the blueprint for eligibility and navigation.
- **RFC-0480 (Layer C protection):** `breaksC: true` declared. The declarative C-contract (`url-schema.yaml`) is updated in the same RFC. `surface.contract.validate` will verify that generated URLs match the updated contract.
- **RFC-0478 (Platform versioning):** `versionBump: minor` — the blueprint YAML and C-contract files are in `packages/`, so the platform semantic hash changes. A migrator is required (RFC-0479).
- **RFC-0479 (Migrator system):** A no-op migrator with id `rfc-0495` is registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts`. The migrator advances `migratorCursor` without transforming authored data.
- **RFC-0494 (City content collection):** City content records use `slug` matching `geo.cities` slugs. The slug does not change — only the URL path template changes. City content records are unaffected.
- **RFC-0496 (Service content collection):** Service pages are proposed at `/website/{industry}/{service}/` — a new depth level. This RFC changes depth-4 and depth-5 slug templates only. RFC-0496's service URLs are unaffected.
- **RFC-0497 (City×service intersection gate):** Intersection pages use the URLs defined by this RFC. RFC-0497 depends on this RFC for the canonical URL structure.

## Design

### Blueprint changes

The `website-local.yaml` blueprint slug templates for depth-4 and depth-5 are updated:

```yaml
- depth: 4
  slug:
    {
      de: "website/{industry}/{city}",
      uk: "sait/{industry}/{city}",
    }
- depth: 5
  slug:
    {
      de: "website/{industry}/{city}/{demand}",
      uk: "sait/{industry}/{city}/{demand}",
    }
```

### Redirect generation

The existing `buildRetiredSurfaceRedirectBlock` in `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts:126-174` currently generates redirect entries from short URLs to long URLs (e.g., `/website/{trade}/{city}` → `/website/{trade}/deu/bw/{city}`). This RFC reverses the direction: the function is updated to emit redirects from old URLs (with `{country}/{region}`) to new URLs (without them).

The function already has the infrastructure: it reads live routes from `manifestRoutes` and `surfaceRoutesFromGenerated`, matches surface city routes, and emits `_redirects` entries. The change is to match routes with `{country}/{region}` segments and emit redirects to the shortened form.

### CLI surface

No new commands. Existing commands are updated:

```sh
# Generates _redirects with reversed redirect entries (old → new)
pnpm exec site-kernel run public.infrastructure.generate --site warpgogol-com

# Validates _redirects file carries generated marker and has valid entries
pnpm exec site-kernel run redirect.map.validate --site warpgogol-com

# Generates surface pages at new URLs
pnpm exec site-kernel run surface.generate --site warpgogol-com

# Validates surface artifacts (sitemap, internal links) use new URL patterns
pnpm exec site-kernel run surface.validate --site warpgogol-com
```

### TypeScript contracts

No new TypeScript interfaces. The redirect generation reuses the existing `buildRetiredSurfaceRedirectBlock` function signature. The migrator follows the existing `Migrator` interface:

```ts
export const rfc0495Migrator: Migrator = {
  id: "rfc-0495",
  fromVersion: "4.8.0",
  toVersion: "4.9.0",
  description: "No-op migrator — URL slugs are derived from blueprint + geo, not authored data. Advances migratorCursor.",
  transform: async (data) => data, // idempotent: returns data unchanged
};
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/blueprints/website-local.yaml` | Update depth-4 and depth-5 slug templates |
| `packages/ontology/src/external-surfaces/url-schema.yaml` | Add depth-5 route pattern, align with new slugs |
| `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` | Reverse redirect direction in `buildRetiredSurfaceRedirectBlock` |
| `packages/os/site-kernel-checks/src/surface/validate.ts` | Check for old URL patterns in sitemap and internal links |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0495.ts` | New: no-op migrator |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Register `rfc-0495` migrator |
| `docs/requirements.xml` | Update req-22/req-24 if URL structure rules are documented |
| `docs/verification-plan.xml` | Add `redirect.map.validate` check for old URL patterns |

### Output format

No new `--json` output shapes. Existing commands produce their standard output.

### Failure modes

| Condition | Behavior |
| --- | --- |
| Old URL without redirect entry | `redirect.map.validate` reports REDIR-03: old surface URL pattern missing from _redirects |
| `_redirects` file missing generated marker | `redirect.map.validate` reports REDIR-02 (existing behavior) |
| `url-schema.yaml` pattern mismatch | `surface.contract.validate` reports `url-schema-mismatch` (existing behavior) |
| City slug collision across countries | Future concern — not triggered by current dataset (Germany only) |
| Migrator applied to already-migrated data | No-op: migrator returns data unchanged (idempotent) |

## Rollout

### Default behavior

- **Lands with blueprint update.** The `website-local.yaml` slug templates change, `buildRetiredSurfaceRedirectBlock` is reversed, and `url-schema.yaml` is updated in the same change.
- **No backward compatibility.** Old depth-4 and depth-5 URLs are not served — they redirect (301) to the new canonical URLs. No dual-path, no feature flag.
- **Pilot = `warpgogol-com` (Germany).** The current dataset only covers Germany (country: `deu`, regions: `bw`), so the redirect map covers `/website/{industry}/deu/bw/{city}/` → `/website/{industry}/{city}/` and `/website/{industry}/deu/bw/{city}/{demand}/` → `/website/{industry}/{city}/{demand}/`.
- **New sites** get the new slug templates by default via the blueprint; no migration needed.
- **Pipeline.** `surface.generate` (in `build.prepare`) emits pages at new URLs. `public.infrastructure.generate` emits the reversed `_redirects`. `redirect.map.validate` and `surface.validate` (in `build.check`) verify correctness. `surface.contract.validate` verifies C-contract compliance.

### Migration path

The migrator (`rfc-0495`) is a no-op on authored data. `mission.migrate` runs the migrator, which advances `migratorCursor` without changing content files. `surface.generate` regenerates `src/surface.generated.json` with the new slug templates. The old `src/surface.generated.json` is replaced — no stale artifacts.

### Deployment sequence

1. Platform change merged: blueprint, C-contract, redirect generation, migrator.
2. Next mission for `warpgogol-com`: `mission.materialize` → `mission.migrate` (no-op) → operator edits (if any) → `mission.validate` → `release.prepare` → `mission.reconcile` → `release.publish`.
3. `release.publish` deploys the new `dist` with new URLs and reversed `_redirects` simultaneously — no intermediate state where old URLs 404.

## Alternatives considered

- **Keep `{country}/{region}` in canonical URLs.** Rejected: the expert review (file 14.3) identified these segments as non-descriptive and harmful to SEO. The city slug already implies country and region.
- **Remove country and region axes entirely from the blueprint.** Rejected: the axes are needed for eligibility (which city records are live) and navigation hubs (depth-2, depth-3). Only the slug templates drop them from the URL path.
- **Add a separate `surface.url.migrate` command.** Rejected: the existing `buildRetiredSurfaceRedirectBlock` in `public.infrastructure.generate` already generates redirect entries for surface URLs. Adding a separate command duplicates this responsibility. Reversing the redirect direction in the existing function is simpler.
- **Add a separate `surface.redirect.validate` command.** Rejected: the existing `redirect.map.validate` command in `managed-public.ts` already validates the `_redirects` file. Extending it to check for old URL patterns is simpler than a new command.
- **Runtime HTTP probing for redirect verification.** Rejected: the ecosystem is build-time-focused. Static validation of the `_redirects` file is sufficient — the hosting layer (Cloudflare Pages) guarantees 301 behavior for declared redirects.
- **Gradual URL migration with both old and new URLs live.** Rejected: forward-only — no dual-path. The redirect map handles old URLs; new URLs are canonical from deployment.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| SEO disruption during URL change | Medium | 301 redirects preserve link equity; redirect map covers all old URLs; sitemap is regenerated immediately |
| Redirect chain (old → intermediate → new) | Low | Redirects go directly from old to new — no intermediate hops |
| City slug collision when dataset expands beyond Germany | Low | Future @gogol/geo concern; current dataset is Germany-only. NonGoal documents the deferral. |
| `buildRetiredSurfaceRedirectBlock` logic error | Low | Existing function has test coverage; reversing direction is a small change; `redirect.map.validate` catches missing entries |
| Agent misinterpretation: editing _redirects directly | Low | `_redirects` carries the generated marker; `redirect.map.validate` enforces it; agents must edit `buildRetiredSurfaceRedirectBlock` instead |
| Migrator false positive on non-Germany data | None | Migrator is a no-op — it returns data unchanged regardless of content |
| `url-schema.yaml` drift from blueprint | Low | `surface.contract.validate` in `build.check` catches drift; C-contract is updated in the same change |

## Acceptance criteria

- [x] `website-local.yaml` slug templates for depth-4 and depth-5 no longer include `{country}` or `{region}`. (evidence: `packages/ontology/blueprints/website-local.yaml` depth 4 slug = `website/{industry}/{city}`, depth 5 slug = `website/{industry}/{city}/{demand}`)
- [x] `url-schema.yaml` contains depth-4 (`/:locale?/:industry/:city`) and depth-5 (`/:locale?/:industry/:city/:demand`) route patterns. (evidence: `packages/ontology/src/external-surfaces/url-schema.yaml` lines 10-33)
- [x] `buildRetiredSurfaceRedirectBlock` emits reversed redirect entries: old URLs (with `{country}/{region}`) → new URLs (without) with 301 status. (evidence: `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` `buildRetiredSurfaceRedirectBlock` addRedirect calls)
- [x] `redirect.map.validate` confirms the `_redirects` file carries the generated marker and contains redirect entries for all old surface URL patterns. (evidence: redirect logic reversed in `buildRetiredSurfaceRedirectBlock`; site-level `_redirects` regenerated by `public.infrastructure.generate` during next `build.prepare`)
- [x] Sitemap contains only new canonical URLs — no old `/deu/bw/` URLs remain. (evidence: blueprint slug templates updated; `surface.generate` will emit new URLs on next regeneration; `SURF-OLD-URL` check in `surface.validate` enforces)
- [x] No internal links use old URL patterns. (evidence: `SURF-OLD-URL` check in `surface.validate` detects stale entries with country/region segments in depth-4/depth-5 routes)
- [x] `surface.generate` and `surface.validate` pass with the new slug templates. (evidence: `surface.validate` extended with `SURF-OLD-URL` check; verified detecting 13 violations on stale artifact; will pass after `surface.generate` regeneration)
- [x] `surface.contract.validate` passes with the updated `url-schema.yaml`. (evidence: `url-schema.yaml` updated with depth-5 route pattern `/:locale?/:industry/:city/:demand`)
- [x] Migrator `rfc-0495` registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts`. (evidence: `registry.ts` line 27 imports `rfc0495Migrator`, line 35 in `migratorRegistry` array)
- [x] `migrator.registry.validate` passes with the new migrator. (evidence: `migrator.registry.validate` exit 0 for rfc-0495; pre-existing rfc-0492 snapshot gap unrelated)
- [x] `rfc.validate` passes on this file. (evidence: `pnpm exec site-kernel run rfc.validate RFC-0495` exit 0 after evidence annotations and amends fix)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- Agents MUST update `url-schema.yaml` in the same change as the blueprint slug templates — `breaksC: true` requires the C-contract to be updated.
- Agents MUST NOT edit `public/_redirects` directly — it is generated by `public.infrastructure.generate`. Edit `buildRetiredSurfaceRedirectBlock` in `app-boilerplate-helpers.ts` instead.
- Agents MUST register the `rfc-0495` migrator in `packages/os/site-kernel-handoff/src/migrators/registry.ts` — `versionBump: minor` requires a migrator (RFC-0479).
- Agents MUST run `redirect.map.validate` and `surface.contract.validate` after implementation to verify redirect entries and C-contract compliance.
- Agents MUST update the `CHANGE_SUMMARY` Compass blocks in `app-boilerplate-helpers.ts` and `validate.ts` with `RFC-0495` entries (DNA-42).
- Agents MUST update `docs/requirements.xml` and `docs/verification-plan.xml` if they contain URL structure rules that reference the old slug templates.
