# Code Review: PBP Migration Cutover

- **Date:** 2026-07-21
- **Reviewer:** fo-review (Cascade)
- **Scope:** `git diff HEAD` — 10 files changed, 31 insertions(+), 27 deletions(-)
- **Mission:** warpgogol-com-m000006

## Diff summary

| File | Change |
| --- | --- |
| `packages/pbp/src/semantic-profile.ts` | `strictness: "production"` → `"migration"`; fallback `try/catch` removed |
| `packages/pbp/src/semantic-model.ts` | `getCollection("business")` → `getCollection("faq")` |
| `packages/share/src/astro/people-routes.ts` | `getCollection("business")` → `getCollection("people")` |
| `packages/share/src/astro/site-content-handlers.ts` | Footer handler: `business` → `business-profile`, field path remapping |
| `packages/ui/src/sections/donation-card/donation-card-section.astro` | `getEntry("business", …)` → `getEntry("site", …)` |
| `packages/ui/src/sections/faq-list/faq-list-section.astro` | `getCollection("business", …)` → `getCollection("faq", …)` |
| `packages/ui/src/sections/send-message/send-message-section.astro` | `getEntry("business", …)` → `getEntry("business-profile", …)` |
| `packages/os/site-kernel-onboarding/src/templates/package.template.json` | Added `@warpgogol/content-source` and `@warpgogol/faq` deps |
| `systems/registry.yaml` | `currentMission: null` → `warpgogol-com-m000006` |
| `pnpm-lock.yaml` | Lockfile updated for mission workpiece path |

## Mechanical floor

| Package            | Command                                      | Result |
| ------------------ | -------------------------------------------- | ------ |
| `@warpgogol/pbp`   | `pnpm --filter @warpgogol/pbp build:check`   | PASS   |
| `@warpgogol/share` | `pnpm --filter @warpgogol/share build:check` | PASS   |
| `@warpgogol/ui`    | `pnpm --filter @warpgogol/ui build:check`    | PASS   |

No RFC files touched — `ref(forge.yaml bindings.commands.validateRfc)` not required.

---

## Axis A — Structural correctness

### A-1. FAIL — Stale FAQ filter prefix in `semantic-model.ts`

**File:** `packages/pbp/src/semantic-model.ts:122-126`

The collection name was changed from `"business"` to `"faq"`, but the filter prefix was not updated:

```typescript
const entries = await getCollection("faq");
const faqEntries = entries.filter(
  (e: { id: string }) =>
    e.id.startsWith(`faq/${lang}/`) || e.id.startsWith(`faq/${DEFAULT_LANGUAGE_CODE}/`),
);
```

The `faq` collection has `base: "src/content/faq"`, so entry IDs are `${lang}/${slug}` (e.g. `de/df-baukasten`). The filter `e.id.startsWith("faq/de/")` matches nothing. The `faq/` prefix was an artifact of the old `business` collection where FAQ entries lived under `business/de/faq/`.

**Fix:** Change to `e.id.startsWith(`${lang}/`)` || `e.id.startsWith(`${DEFAULT_LANGUAGE_CODE}/`)`.

**Severity:** High — silently returns empty FAQ list for all pages.

### A-2. FAIL — Stale people filter prefix in `people-routes.ts`

**File:** `packages/share/src/astro/people-routes.ts:74-77`

Same pattern. The collection changed from `"business"` to `"people"`, but the filter still checks for `people/` subdirectory prefix:

```typescript
const entries = await getCollection("people");
const people = entries.filter((e: { id: string }) =>
  stripEntryLanguage(toDataEntryId(e.id)).startsWith("people/"),
);
```

The `people` collection has `base: "src/content/people"`, so entry IDs are `${lang}/${slug}` (e.g. `de/andrii-syrokomskyi`). `stripEntryLanguage("de/andrii-syrokomskyi")` → `"andrii-syrokomskyi"`, which does not start with `"people/"`.

**Fix:** Remove the `people/` prefix filter entirely — all entries in the `people` collection are people. Filter to `stripEntryLanguage(toDataEntryId(e.id)).length > 0` or simply drop the filter.

**Severity:** Medium — latent bug (no `.md` files in `people/` collection yet, but will silently produce zero routes when content is added).

### A-3. PASS — No new `any` types introduced

All type casts use `Record<string, unknown>` or specific inline types. No new `any` usage.

### A-4. PASS — No dead code introduced

`buildOrganizationProfile` import in `semantic-profile.ts` is still used at line 138 in `projectToSemanticSiteProfile`. `getCollectionId` in `site-content-handlers.ts` is still used by other handlers (header, breadcrumbs).

### A-5. PASS — Error handling preserved

`getFaqEntries` retains its `try/catch` returning `[]` on failure. `getKnownIdsForCollection` retains its `try/catch` returning empty `Set`.

---

## Axis B — DNA alignment

### B-1. FAIL — App-specific entity paths hardcoded in shared package (DNA-1)

**File:** `packages/share/src/astro/site-content-handlers.ts:110, 119`

The footer handler now hardcodes site-specific PBP entity paths:

```typescript
const contactId = `${ctx.languageCode}/contact/general-email`;
// ...
const locationId = `${ctx.languageCode}/places/backnang`;
```

`@warpgogol/share` AGENTS.md states: _"Do NOT import from apps/_ — handlers are app-agnostic."* The path `places/backnang` is a specific city for warpgogol-com. Another site using `@warpgogol/share` would have a different place slug.

**Fix:** Either (a) make the entity slugs configurable via `SiteContentContext` (add `contactSlug` and `placeSlug` fields), or (b) move the footer handler's PBP entity resolution to the site's own content config and keep the shared handler generic.

**Severity:** High — DNA-1 violation. Blocks reuse of `@warpgogol/share` by any other site.

### B-2. PASS — DNA-4 (canonical content)

No hardcoded copy strings introduced. All data is read from content collections.

### B-3. PASS — DNA-6 (kebab-case)

No new filenames introduced.

### B-4. PASS — DNA-10 (no hardcoded tokens)

No CSS changes.

### B-5. N/A — DNA-5/17 (mirror quintet), DNA-7 (thin routes), DNA-8 (page hierarchy), DNA-23 (cosmic naming), DNA-24 (block-declarative)

No new components, sections, pages, or manifests.

---

## Axis C — Forward-only discipline

### C-1. FAIL — `strictness: "migration"` is a permanent fallback (forward-only violation)

**File:** `packages/pbp/src/semantic-profile.ts:46`

The strictness was changed from `"production"` to `"migration"`. The PBP compiler's `PbpBuildStrictness` type (RFC-0428) defines three levels: `development`, `migration`, `production`. Migration mode is designed for transitional content that is structurally PBP but not yet fully schema-conformant — it silently passes through entities that fail Zod `.strict()` validation.

This is effectively a **new form of the graceful fallback** that was just removed. The stated goal was _"no backward compatibility, no legacy code"_, but `"migration"` mode achieves the same effect: it hides schema violations instead of surfacing them. The content issues that were identified (policy schemas expecting singular `objective`/`remedy`/`condition` while content uses plural forms) remain unfixed — they're just silently ignored.

**Fix:** Either (a) fix the content to conform to the schemas and restore `"production"`, or (b) if the schemas are wrong (plural forms are the correct shape), fix the schemas and restore `"production"`. Do not leave `"migration"` as the permanent runtime strictness.

**Severity:** High — defeats the purpose of the PBP schema validation layer. Every future content error will be silently swallowed.

### C-2. PASS — No compatibility shims

No new compatibility layers or shims introduced (the `try/catch` fallback was removed, not replaced with a shim).

### C-3. PASS — Legacy collection references removed

All `getCollection("business")` and `getEntry("business", …)` calls in runtime code have been updated to the correct new collection names.

---

## Axis D — Ecosystem fit

### D-1. PASS — Package boundaries respected

No new `apps/* → apps/*` or `apps/* → services/*` imports. All changes are within `packages/*`.

### D-2. PASS — Content-source port used correctly

All `getEntry`/`getCollection` calls import from `@warpgogol/content-source/astro`, not `astro:content` directly (per RFC-0141).

### D-3. PASS — FAQ collection wiring follows RFC-0475

The `faq-list-section.astro` correctly uses the `faq` collection and filters by `${lang}/` prefix (matching the `createFaqCollection` base path).

### D-4. PASS — Onboarding template updated

`package.template.json` correctly adds `@warpgogol/content-source` and `@warpgogol/faq` as dependencies, ensuring new sites scaffolded via `onboarding.scaffold` will have the required packages.

---

## Axis E — Agent clarity

### E-1. FAIL — Stale CHANGE_SUMMARY in `semantic-model.ts`

**File:** `packages/pbp/src/semantic-model.ts:18`

The `CHANGE_SUMMARY` still says:

```
<item>Replaced getBusinessFaqEntries with direct getCollection("business") call — no @warpgogol/business import.</item>
```

This is now outdated — the collection is `"faq"`, not `"business"`.

**Fix:** Update to reflect the `faq` collection change.

**Severity:** Low — misleading but not functionally incorrect.

### E-2. PASS — Module contracts accurate

All other `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks remain accurate for the changes made.

---

## Axis F — Pragmatism

### F-1. PASS — Changes are minimal and focused

Each file change is a targeted collection-name or field-path update. No speculative refactoring.

### F-2. PASS — No over-engineering

No new abstractions, interfaces, or configuration systems introduced.

---

## Axis G — Test coverage

### G-1. N/A — No tests modified

No test files were changed. The existing test suite passes (`build:check` = `tsc --noEmit`). No new tests were added for the collection-name changes.

### G-2. FAIL — No regression test for FAQ filter

The `semantic-model.ts` FAQ filter bug (A-1) would have been caught by a unit test that verifies `getFaqEntries("de")` returns non-empty results when faq content exists.

**Severity:** Medium — the bug is silent (returns `[]`).

---

## Summary

| Axis              | Items  | Pass   | Fail  | N/A   |
| ----------------- | ------ | ------ | ----- | ----- |
| A — Structural    | 5      | 3      | 2     | 0     |
| B — DNA           | 5      | 3      | 1     | 1     |
| C — Forward-only  | 3      | 2      | 1     | 0     |
| D — Ecosystem     | 4      | 4      | 0     | 0     |
| E — Agent clarity | 2      | 1      | 1     | 0     |
| F — Pragmatism    | 2      | 2      | 0     | 0     |
| G — Tests         | 2      | 0      | 1     | 1     |
| **Total**         | **23** | **15** | **6** | **2** |

### Findings by severity

| # | Severity | Axis | Finding |
| --- | --- | --- | --- |
| A-1 | **High** | A | Stale FAQ filter prefix in `semantic-model.ts` — returns empty list |
| B-1 | **High** | B | App-specific entity paths (`places/backnang`) hardcoded in `@warpgogol/share` — DNA-1 violation |
| C-1 | **High** | C | `strictness: "migration"` is a permanent silent fallback — defeats schema validation |
| A-2 | **Medium** | A | Stale people filter prefix in `people-routes.ts` — latent bug |
| G-2 | **Medium** | G | No regression test for FAQ filter |
| E-1 | **Low** | E | Stale `CHANGE_SUMMARY` comment in `semantic-model.ts` |

### Recommended fix order

1. **A-1** — Fix FAQ filter prefix (one-line change, immediate user-facing impact)
2. **A-2** — Fix people filter prefix (one-line change, latent bug)
3. **B-1** — Make footer handler entity paths configurable or move to site
4. **C-1** — Fix content/schemas and restore `strictness: "production"`
5. **E-1** — Update `CHANGE_SUMMARY`
6. **G-2** — Add regression test for `getFaqEntries`
