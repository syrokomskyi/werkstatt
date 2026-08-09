---
id: RFC-0199
title: "Add per-language record slugs to the Programmatic Surface generator"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-16
updatedAt: 2026-06-16
implementedAt: 2026-06-16
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0193
amendedBy: []
related:
  - RFC-0160
  - RFC-0192
  - RFC-0193
commands:
  proposed: []
  added: []
  changed:
    - surface.generate
    - surface.validate
  removed: []
appsImpacted:
  - apps/warpgogol-com
packagesImpacted:
  - packages/surface
  - packages/ontology
  - packages/content-source
successSignals:
  - "uk surface URLs use Ukrainian slug segments end-to-end (e.g. /uk/sait/elektryk/berlin), with no de-derived segments leaking into uk paths"
  - "a record with no per-language slug falls back to the language-neutral slug, so existing single-language axes are unaffected"
  - "sitemap.validate stays green with fully-localized, non-mixed uk paths"
nonGoals:
  - "Automatic machine translation of slug values — uk slugs are author-provided per record"
  - "Redirect generation for slug changes on already-deployed surfaces (handled by the existing RFC-0160 redirect-stub mechanism)"
---

# RFC-0199: Add per-language record slugs to the Programmatic Surface generator

## Context

RFC-0193 defined the pSEO Blueprint contract and shipped the multilingual surface (RFC-0160 unprefixed-default routing applied to generated pages). The sitemap now emits per-language URLs for every surface page, with `de` and `uk` alternates plus an `x-default`.

However, the Ukrainian surface URLs are not actually Ukrainian below the static prefix. A page like `/uk/website/elektriker/berlin` keeps the German-derived segments `elektriker` and `berlin`, even though the underlying content record (`src/content/surface/industries/uk/elektriker.md`) is fully translated and already carries a Ukrainian `name` ("Електрик"). Editorial system.md leaf pages were localized cleanly (RFC-0160 routes map: `open-source` → `vidkrytyy-kod`, `cosmic/star-map` → `cosmic/zoryana-karta`), but the surface generator has no equivalent capability, so the largest and most SEO-sensitive set of pages is stuck with mixed-language paths.

## Problem

Slug values for the interpolated axis segments come from a single, language-neutral field. In `packages/surface/src/blueprint.ts`:

- `routesFor()` resolves a per-language slug _template_ (`level.slug[lang]`), but the template tokens (`{industry}`, `{city}`, `{topic}`) are filled by `resolveSlug()` from `tuple[axisId]` — a value drawn once from the axis universe.
- The axis universe is built from `universe: { collection, field: slug }`, where `slug` defaults to the record filename stem. The stem is identical across the `de/` and `uk/` record folders, so the tuple value is the same for every language.

The result: only the static template prefix can differ per language. Any path with a record-derived segment cannot be fully localized today. Forcing a translated prefix without translated segments produces mixed-language URLs (e.g. `/uk/sait/elektriker/berlin`), which is worse for SEO and user trust than the current consistent (if German) paths. This is why the RFC-0193 follow-up work translated only the child-free system.md leaf slugs and explicitly deferred the surface slugs.

## Decision

The Programmatic Surface generator gains **per-language record slugs**. An axis value resolves to a language-specific slug when the record provides one, and falls back to the language-neutral slug otherwise. Concretely:

1. A surface collection record MAY declare a `slug` (language-neutral, current behavior) and/or a per-language `slugByLang` map (e.g. `slug: { uk: "elektryk" }` in `industries/uk/elektriker.md`, or a shared `slugByLang` block on the canonical record).
2. The axis universe becomes language-aware: instead of one `string[]` per axis, the generator resolves, per `(axisId, lang)`, the slug to substitute for a given record. The canonical tuple key stays language-neutral (so `pageIdFor` / matrix identity is unchanged); only the emitted URL segment is localized.
3. `resolveSlug()` / `routesFor()` substitute the language-specific slug for the active language, falling back to the neutral slug when none exists.

This keeps page identity, eligibility, redirect-stub logic, and the matrix shape exactly as RFC-0193 defined them — the change is confined to how a tuple value is rendered into a URL segment for a given language.

## Architectural fit

- **RFC-0160** (unprefixed-default routing) — extends the same "the URL policy is the single seam" principle from static pages to surface pages; localized segments flow through `localizeUrl` unchanged.
- **RFC-0192/0193** (Programmatic Surface) — amends the Blueprint axis/slug contract; no new route-source port, no change to baking or freshness.
- **Site OS operator model** — no new command; `surface.generate` and `surface.validate` gain localized-slug awareness and stay app-scoped.
- **Scaling Playbook** — the feature is opt-in per record/axis, so single- language sites (e.g. nicaragua-projekt's surfaces, if any) are unaffected.

## Design

### CLI surface

No new commands. Existing surface commands keep their signatures:

```sh
pnpm exec werkstatt run surface.generate --app warpgogol-com
pnpm exec werkstatt run surface.validate --app warpgogol-com --json
```

`surface.generate` now emits localized slug segments; `surface.validate` checks that every per-language slug is collision-free within its axis and language and that fallbacks are well-formed.

### TypeScript contracts

Minimum contract additions in `packages/surface`:

```ts
// A record's slug, optionally localized. Absent langs fall back to `neutral`.
interface LocalizedSlug {
  neutral: string;           // filename stem / existing `slug` field
  byLang?: Record<string, string>;
}

// Axis universe resolved per language: axisId -> (neutralValue -> slug).
type LocalizedUniverse = Record<string, Map<string, LocalizedSlug>>;

// resolveSlug gains the active language + the localized universe so it can
// substitute the per-language segment, falling back to `neutral`.
function resolveSlug(
  template: string,
  tuple: AxisTuple,
  lang: string,
  universe: LocalizedUniverse,
  pattern: RegExp,
): string;
```

The matrix, `pageIdFor`, eligibility, and redirect-stub code continue to key on the neutral tuple values; only segment rendering consults `byLang`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/src/content/surface/<collection>/<lang>/*.md` | MAY add a per-language `slug` to localize that record's segment |
| `packages/ontology/blueprints/*.yaml` | Static `level.slug[lang]` prefixes already supported; unchanged |
| `packages/surface/src/blueprint.ts` | `resolveSlug` / `routesFor` / universe build become language-aware |
| `apps/*/src/surface.generated.json` | Generated `routes` now carry localized uk segments |
| `apps/*/public/sitemap-content.xml` | Regenerated; uk paths become fully localized, non-mixed |

### Output format

`surface.validate --json` carries human-readable `violations` (the house string-array convention) plus structured detail so agents can parse the new diagnostics. A `duplicate-localized-slug` is a hard failure; an `untranslated-route` is an advisory warning (never fails the build):

```json
{
  "command": "surface.validate",
  "status": "fail",
  "violations": [
    "duplicate localized slug \"elektryk\" (lang \"uk\") maps to both website-local:elektriker and website-local:elektroinstallateur"
  ],
  "localizedSlugViolations": [
    {
      "lang": "uk",
      "slug": "elektryk",
      "pageIds": ["website-local:elektriker", "website-local:elektroinstallateur"],
      "rule": "duplicate-localized-slug"
    }
  ],
  "warnings": [
    { "lang": "uk", "slug": "website/elektriker", "pageId": "website-local:elektriker", "rule": "untranslated-route" }
  ]
}
```

### Failure modes

- A per-language slug that collides with another record's slug in the same axis and language is a hard failure (would produce two pages at one URL).
- A missing per-language slug is **not** an error — it falls back to the neutral slug (preserves today's behavior; single-language axes need no migration).
- Mixed-language detection is advisory: `surface.validate` MAY warn when a uk path still contains a segment equal to its de counterpart, to surface un-translated records.

## Rollout

- **Opt-in, fallback-safe.** With no per-language slugs declared, output is byte-identical to today — so the feature can land without a flag day.
- Adoption is per record: translate `industries/uk/*.md`, `cities/uk/*.md`, `topics/uk/*.md` slugs incrementally; each translated record flips one segment.
- New surfaces comply from day one by authoring localized slugs alongside the already-localized `name`/`intro` fields.
- Because the affected uk surface pages are not yet on production `main` (the multilingual surface shipped on this branch), the initial translation needs no redirects; later slug changes ride the existing RFC-0160 redirect-stub path.
- Integrates into `build.check` via the existing `surface.validate` step.

## Alternatives considered

- **Translate static prefixes only (mixed paths).** Rejected: produces `/uk/sait/elektriker/berlin`, mixing languages within one path — worse SEO and worse UX than consistent German segments. This RFC exists specifically to avoid that compromise.
- **Separate uk blueprints.** Rejected: duplicates axis/level/policy definitions and breaks the single-blueprint-per-surface identity that RFC-0193 relies on.
- **Derive uk slug by transliterating `name` at build time.** Rejected: non-deterministic across transliteration schemes, can't be reviewed as a permanent SEO asset, and offers no author control.

## Risks

- **Slug collisions** after translation (two records mapping to one uk slug). Mitigated by the hard `duplicate-localized-slug` validation.
- **Identity drift**: keying URL localization off the neutral tuple is essential — if `pageIdFor` ever consumed the localized segment, page identity would fork per language. The contract above forbids this; a test must lock it.
- **Partial translation** leaving some uk segments German. Acceptable (fallback-safe) and surfaced by the advisory mixed-path warning.
- **Performance**: universe resolution grows by a factor of the language count; negligible at current axis cardinalities.

## Acceptance criteria

- [x] `LocalizedSlug` / language-aware universe types defined in `packages/surface` (`packages/surface/src/types.ts`, exported from `index.ts`) (evidence: packages/ directory, package exists)
- [x] `resolveSlug` / `routesFor` substitute per-language slugs with neutral fallback (`packages/surface/src/blueprint.ts`) (evidence: packages/ directory, package exists)
- [x] `pageIdFor` and matrix identity proven (test) to stay language-neutral (`packages/os/site-kernel-checks/src/tests/surface-localized-slug.test.ts`, 4 tests pass) (evidence: packages/ directory, package exists)
- [x] `surface.validate` rejects duplicate localized slugs; warns on mixed paths (`untranslated-route` advisory) (`packages/os/site-kernel-checks/src/surface.ts`) (evidence: packages/ directory, package exists)
- [x] `--json` output format for the new diagnostics documented and stable (see Output format above; `localizedSlugViolations` + `warnings`) (evidence: implemented historically)
- [x] Existing single-language surfaces produce byte-identical output (no migration) — empty universe ⇒ neutral fallback (unit test); nicaragua-projekt has no surfaces and is unaffected (evidence: original apps retired by RFC-0381, implemented historically)
- [x] warpgogol-com uk surface URLs fully localized; `sitemap.validate` green (e.g. `/uk/sait/elektryk/berlin`, `/uk/sait/elektryk/posluha/fotovoltaika`; build green) (evidence: implemented historically)
- [x] `AGENTS.md` / surface authoring docs note the per-language slug field (`apps/AGENTS.md` Programmatic Surface § "Per-language URL segments") (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted.
- Agents MUST NOT change status fields in any RFC (including this one or RFC-0193).
- This RFC **amends RFC-0193**; agents MUST NOT alter the RFC-0193 Blueprint identity/eligibility contract — only how a tuple value renders into a URL segment per language.
- The neutral tuple value remains the identity key. Agents MUST NOT feed localized slugs into `pageIdFor`, the eligibility matrix, or redirect-stub keys.
- When implementing, agents MUST reference RFC-0199 in commit messages.
- Agents MUST keep the fallback path: absence of a per-language slug means use the neutral slug — never fail, never invent a translation.
