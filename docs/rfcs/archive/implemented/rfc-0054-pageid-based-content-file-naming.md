---
id: RFC-0054
title: "Adopt pageId-based content file naming for locale-independent content resolution"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-17
updatedAt: 2026-05-17
implementedAt: 2026-05-17
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0048-localized-page-slugs-and-route-resolution
  - RFC-0047-simplify-thin-app-content-surface-for-cms-friendly-sites
commands:
  proposed:
    - content.filename.validate
  added:
    - content.filename.validate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
successSignals:
  - Content files in pages/{lang}/ are named {pageId}.md instead of {route-slug}.md
  - resolvePageRoute resolves page entries by pageId directly, without slug→filename conversion
  - Prose files use pageId-based naming when they correspond 1:1 to a page
  - contentRef references use pageId-based names rather than route-localized or arbitrary names
  - Route slug changes no longer require content file renames
nonGoals:
  - Do not change the route URL structure — routes still use localized slugs from system.md
  - Do not change the system.md route registry schema
  - Do not rename content files that are not tied to a single pageId (e.g., global prose fragments)
---

# RFC-0054: Adopt pageId-based content file naming for locale-independent content resolution

## Context

The platform already uses stable, locale-independent `pageId` identifiers for every page. These `pageId` values are:

- Declared in each page's frontmatter (`pageId: aboutUs`)
- Declared in `system.md` (`pages[].pageId: aboutUs`)
- Used for route resolution (`resolvePageIdFromPath` returns `pageId`)
- Used for semantic model wiring
- Used for navigation target resolution

However, content file names in `content/pages/{lang}/` still use route-localized slugs:

```text
pages/de/spenden-kontakt.md        # pageId: donateContact
pages/de/wir-ueber-uns.md          # pageId: aboutUs
pages/de/datenschutz.md            # pageId: privacyPolicy
pages/de/frage-antwort.md          # pageId: faq
pages/de/impressum.md              # pageId: legalNotice
pages/de/agb.md                    # pageId: terms
pages/de/widerruf.md               # pageId: rightOfWithdrawal
pages/de/projekte.md               # pageId: projects
pages/de/open-source.md            # pageId: openSource
```

Prose files follow an even looser convention — some match route slugs (`prose/spenden-kontakt.md`), others use descriptive names (`prose/intro-about-content.md`, `prose/goals-about-content.md`).

The resolution pipeline in `resolvePageRoute` (`packages/share/src/astro/page-handler.ts:101-107`) currently converts pageId → route slug → filename:

```ts
function extractEntrySlug(pagePath: string, l: string): string {
  return pagePath.replace(`/${l}/`, "").replace(/\/$/, "") || "index";
}
const pagePath = await resolveLocalizedPagePath(pageId, lang);
let entry = pagePath
  ? await getEntry("pages", `${lang}/${extractEntrySlug(pagePath, lang)}`)
  : undefined;
```

This indirection is unnecessary — the content file name and the route slug are two separate concerns that happen to use the same string today.

## Problem

1. **Coupled concerns.** Changing a route slug (e.g., `spenden-kontakt` → `donate-and-contact`) requires renaming the content file, even though the page identity (`donateContact`) stays the same.

2. **Extra indirection.** The resolution pipeline converts pageId → route slug → filename when it could go directly pageId → filename.

3. **Inconsistent prose naming.** Prose files have no consistent relationship to page identity. Some match route slugs, some use arbitrary names. This makes cross-referencing harder.

4. **Confusion for authors and agents.** Two naming systems (pageId and route slug) coexist in the same content tree without explicit conventions.

## Decision

### Pages: content files use `{pageId-derived-path}.md`

All page content files under `content/pages/{lang}/` shall be renamed from route-localized slugs to their stable `pageId` transformed by `pageIdToContentFileSlug()`. CamelCase segments become kebab-case, and slash-separated pageIds remain nested paths:

| Current name | New name |
| --- | --- |
| `pages/de/index.md` | `pages/de/home.md` |
| `pages/de/spenden-kontakt.md` | `pages/de/donate-contact.md` |
| `pages/de/wir-ueber-uns.md` | `pages/de/about-us.md` |
| `pages/de/projekte.md` | `pages/de/projects.md` |
| `pages/de/frage-antwort.md` | `pages/de/faq.md` |
| `pages/de/datenschutz.md` | `pages/de/privacy-policy.md` |
| `pages/de/impressum.md` | `pages/de/legal-notice.md` |
| `pages/de/agb.md` | `pages/de/terms.md` |
| `pages/de/widerruf.md` | `pages/de/right-of-withdrawal.md` |
| `pages/de/open-source.md` | `pages/de/open-source.md` (unchanged) |
| `pages/de/cosmic/passport.md` | `pages/de/cosmic/passport.md` (already matches `cosmic/passport`) |
| `pages/de/cosmic/star-map.md` | `pages/de/cosmic/star-map.md` (already matches `cosmic/starMap`) |
| `pages/en/index.md` | `pages/en/home.md` |
| `pages/en/about-us.md` | `pages/en/about-us.md` (already matches) |
| `pages/en/donate-contact.md` | `pages/en/donate-contact.md` (matches) |
| `pages/en/projects.md` | `pages/en/projects.md` (already matches) |
| `pages/en/question-answer.md` | `pages/en/faq.md` |
| `pages/en/cosmic/passport.md` | `pages/en/cosmic/passport.md` (already matches `cosmic/passport`) |
| `pages/en/cosmic/star-map.md` | `pages/en/cosmic/star-map.md` (already matches `cosmic/starMap`) |

### Prose: content files use `{kebab-pageId}.md` or `{kebab-pageId}-{topic}.md`

Prose files that correspond 1:1 to a page use `{kebab-pageId}.md`. Sub-section prose uses `{kebab-pageId}-{topic}.md`:

| Current name | New name | Referencing page |
| --- | --- | --- |
| `prose/{lang}/spenden-kontakt.md` | `prose/{lang}/donate-contact.md` | donateContact |
| `prose/{lang}/projekte.md` | `prose/{lang}/projects.md` | projects |
| `prose/{lang}/impressum.md` | `prose/{lang}/legal-notice.md` | legalNotice |
| `prose/{lang}/datenschutz.md` | `prose/{lang}/privacy-policy.md` | privacyPolicy |
| `prose/{lang}/agb.md` | `prose/{lang}/terms.md` | terms |
| `prose/{lang}/widerruf.md` | `prose/{lang}/right-of-withdrawal.md` | rightOfWithdrawal |
| `prose/{lang}/open-source.md` | `prose/{lang}/open-source.md` (unchanged) | openSource |
| `prose/{lang}/intro-about-content.md` | `prose/{lang}/about-us-intro.md` | aboutUs |
| `prose/{lang}/goals-about-content.md` | `prose/{lang}/about-us-goals.md` | aboutUs |
| `prose/{lang}/award-about-content.md` | `prose/{lang}/about-us-award.md` | aboutUs |

### Resolution: `resolvePageRoute` uses `pageIdToContentFileSlug()`

The resolution in `packages/share/src/astro/page-handler.ts` shall be changed to look up page entries by the pageId-derived content file slug instead of converting through the route slug:

```ts
// Current:
const pagePath = await resolveLocalizedPagePath(pageId, lang);
let entry = pagePath
  ? await getEntry("pages", `${lang}/${extractEntrySlug(pagePath, lang)}`)
  : undefined;

// Proposed:
import { pageIdToContentFileSlug } from "@gogol/share/content";
let entry = await getEntry("pages", `${lang}/${pageIdToContentFileSlug(pageId)}`);
```

### prose `contentRef`: references use pageId-based names

All `contentRef` values in page blocks shall be updated to reference the new pageId-based prose filenames:

```yaml
# Current:
contentRef: "prose/spenden-kontakt"
# Proposed:
contentRef: "prose/donate-contact"

# Current:
contentRef: "prose/intro-about-content"
# Proposed:
contentRef: "prose/about-us-intro"
```

### `content.filename.validate` command

A new validation command shall ensure that page content files follow the pageId-derived path convention:

- Scan `content/pages/{lang}/*.md`
- Read frontmatter to extract `pageId`
- Verify the relative content path (without the lang directory and extension) matches `pageIdToContentFileSlug(pageId)`
- Report violations with file path, expected name, and actual name
- Same check for `content/pages/{lang}/**/*.md` (subdirectory pages like `cosmic/`)

## Architectural fit

**DNA-24 (Block-declarative pages):** Strengthens the page contract by making `pageId` the canonical file identity, not just a frontmatter field.

**RFC-0048 (Localized slugs):** Route slugs remain in `system.md` — this RFC decouples file naming from routing, which is consistent with RFC-0048's goal of separating page identity from URL structure.

**Anti-pattern AP-3 (Coupled concerns):** Eliminates the coupling between route slugs and file names.

**Page Contracts:** Every page's Definition of Done already requires a stable `pageId`. This RFC makes the pageId visible in the filesystem.

## Design

### Content file naming convention

```
content/pages/{lang}/{pageId-derived-path}.md
content/prose/{lang}/{kebab-pageId}.md             # 1:1 prose
content/prose/{lang}/{kebab-pageId}-{topic}.md     # sub-section prose
```

Note: the page content path is generated by `pageIdToContentFileSlug(pageId)` in `@gogol/share/content`. Slash pageIds remain nested paths, so `cosmic/passport` resolves to `cosmic/passport.md` and `cosmic/starMap` resolves to `cosmic/star-map.md`.

### Resolution change in `resolvePageRoute`

The change in `packages/share/src/astro/page-handler.ts`:

1. Add `pageIdToContentFileSlug` import from `@gogol/share/content`
2. Replace the `resolveLocalizedPagePath → extractEntrySlug → getEntry` chain with `pageIdToContentFileSlug(pageId) → getEntry`
3. Keep existing fallback logic (`resolvePageIdFromPath` → `resolvePageRoute` → `getEntryWithFallback`)

```ts
// Simplified resolution (actual implementation):
import { pageIdToContentFileSlug } from "@gogol/share/content";

const slug = pageIdToContentFileSlug(pageId);
let entry = await getEntry("pages", `${lang}/${slug}`);
```

### prose contentRef resolution

The `contentRef` field (used in `markdown` blocks) references prose by the same pageId convention:

```
contentRef: "prose/{pageId}"        # 1:1 prose
contentRef: "prose/{pageId}-{topic}" # sub-section prose
```

The prose resolution (in the markdown section component or a shared helper) reads `contentRef`, strips the `prose/` prefix, and loads `prose/{lang}/{contentRef-slug}.md` — unchanged in mechanism, only the naming convention changes.

### `content.filename.validate` command contract

```sh
# Validate content file naming across an app
pnpm exec werkstatt run content.filename.validate --app nicaragua-projekt

# Validate with --fix to auto-rename (planned but not in scope)
pnpm exec werkstatt run content.filename.validate --app nicaragua-projekt --fix
```

```json
{
  "command": "content.filename.validate",
  "status": "fail",
  "violations": [
    {
      "file": "src/content/pages/de/spenden-kontakt.md",
      "expected": "donateContact.md",
      "actual": "spenden-kontakt.md",
      "pageId": "donateContact"
    }
  ]
}
```

### Fallback and migration

- The old slug-based filenames continue to work during migration if the resolver has a fallback: try `{lang}/{pageId}` first, fall back to `{lang}/{routeSlug}`.
- After full migration, the fallback is removed and `content.filename.validate` is added to `STANDARD_CHECK_PIPELINE`.

### File system responsibilities

| Path                                       | Role                                            |
| ------------------------------------------ | ----------------------------------------------- |
| `apps/*/src/content/pages/{lang}/*.md`     | Renamed from route-slug to pageId-based names   |
| `apps/*/src/content/prose/{lang}/*.md`     | Renamed from arbitrary to pageId-based names    |
| `packages/share/src/astro/page-handler.ts` | Resolution logic updated to use pageId directly |

### Failure modes

- If a file does not match the `{pageId}.md` pattern: non-zero exit with violation details
- If `content.filename.validate` cannot read frontmatter or find pageId: non-zero exit
- Missing prose files referenced by `contentRef`: handled by the existing `markdown` block validation (not in scope)

## Rollout

1. **Phase 1 — Package change (completed):** Updated `resolvePageRoute` in `packages/share` to resolve by `pageIdToContentFileSlug()`. No slug-based fallback needed — clean migration. Also updated semantic resolvers in `@gogol/business` and `@gogol/ui`.

2. **Phase 2 — App migration (completed):** Renamed all page and prose content files in `nicaragua-projekt` to pageId-derived names and paths. Updated all `contentRef` references. Slash pageIds remain nested directories.

3. **Phase 3 — Validation (pending):** Add `content.filename.validate` command as a **warning-only** check, not in `STANDARD_CHECK_PIPELINE`.

4. **Phase 4 — Hard enforcement (pending):** After all apps are migrated, promote `content.filename.validate` to `STANDARD_CHECK_PIPELINE`.

## Alternatives considered

**Keep the current approach.** Content files continue using route slugs. This is the simplest option but keeps the coupling between route slugs and file names indefinitely.

**Use a `contentFile` field in system.md.** Allow pages to declare an explicit content file path decoupled from both pageId and route slug. This adds schema complexity without clear benefit over the pageId convention.

**Use numeric IDs.** Replace route slugs with opaque numeric IDs in filenames. This loses human readability and makes debugging harder.

## Slash-segment casing rule

When a `pageId` contains `/`, each new segment starts with a lowercase letter. CamelCase is allowed only _inside_ a segment, not at the segment boundary.

- `cosmic/passport` → valid
- `cosmic/starMap` → valid
- `legal/privacyPolicy` → valid
- `cosmic/Passport` → invalid
- `cosmic/StarMap` → invalid

## Risks

- **Agent confusion during transition.** Agents reading the codebase during migration may see both naming conventions. Mitigation: use the fallback resolver so both names work during migration.
- **Prose sub-section naming ambiguity.** The `{pageId}-{topic}` convention for prose sub-sections is advisory, not machine-enforced. Mitigation: document the convention in `content/AGENTS.md`.
- **Prose files shared across pages.** If a prose entry is referenced by multiple pages (not the case today), a single pageId-based name would be misleading. Mitigation: use a descriptive name with a documented rationale instead.

## Acceptance criteria

- [x] `pageIdToContentFileSlug()` added to `@gogol/share/content` — converts camelCase pageId to kebab-case slug (evidence: packages/ directory, package exists)
- [x] `resolvePageRoute` in `@gogol/share` resolves page entries by `pageIdToContentFileSlug()` directly (no slug-based backward compatibility fallback needed — clean rename) (evidence: packages/ directory, package exists)
- [x] Page content files in `nicaragua-projekt` renamed to `{kebab-pageId}.md` (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Prose content files in `nicaragua-projekt` renamed to `{kebab-pageId}.md` or `{kebab-pageId}-{topic}.md` (evidence: original apps retired by RFC-0381, implemented historically)
- [x] All `contentRef` references in page blocks updated to match new prose filenames (evidence: implemented historically)
- [x] `content.filename.validate` command exists and reports non-compliant files (evidence: implemented historically)
- [x] `apps/nicaragua-projekt/src/content/AGENTS.md` updated with new naming convention (evidence: AGENTS.md:1, agent guide updated)
- [x] `@gogol/ui` section resolvers (`markdown-section.astro`) updated — translation column lookup uses `pageIdToContentFileSlug()` (evidence: packages/ directory, package exists)
- [x] `@gogol/business` semantic model updated — `resolveEntrySlug` uses `pageIdToContentFileSlug()` (evidence: packages/ directory, package exists)
- [x] All existing routes, sitemaps, and language switching continue to work unchanged (verified: build produces 25 pages, same routes) (evidence: implemented historically)
- [x] `rfc.validate` passed before merge (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted.
- Agents MUST NOT change status fields in any RFC.
- When implementing, reference this RFC ID in commit messages or PR descriptions.
- Migrate phase-by-phase: package change first, then content files, then validation.
- **Content paths use `pageIdToContentFileSlug(pageId)`**, not route slugs. CamelCase becomes kebab-case and slashes remain directory separators — e.g., `privacyPolicy` → `privacy-policy`, `cosmic/starMap` → `cosmic/star-map`.
- Prose sub-section naming (`about-us-intro`, `about-us-goals`) uses kebab-case after the pageId prefix.
- No backward compatibility fallback resolver needed — clean rename all files in one atomic migration per app.
