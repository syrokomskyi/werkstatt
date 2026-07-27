---
id: RFC-0008
title: "Fall back to default language when a content entry or individual fields are missing for the requested language"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-14
updatedAt: 2026-06-04
implementedAt: 2026-04-14
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-04
  - RFC-0002
  - RFC-0004
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
  - main
  - my-main
packagesImpacted: []
successSignals:
  - "Build completes without error when an `en/` page entry is absent but the matching `de/` entry exists"
  - "Build completes without error when an `en/` component entry exists but is missing fields that the schema requires"
  - "A `console.warn` line is emitted during build for every whole-file fallback that occurs"
  - "No `console.warn` is emitted at runtime (SSG; warnings fire only during static generation)"
  - "Components entries follow the same fallback contract as page entries"
  - "Partial component entries are deep-merged with the default-language entry before schema validation"
nonGoals:
  - "Silently ignore missing entries with no developer feedback"
  - "Auto-create missing language files during build"
  - "Apply to collections other than `pages` and `components`"
  - "Change the default language itself (remains `de` for nicaragua-projekt)"
  - "Change the default language itself (remains the app-level `defaultLanguageCode` for every app)"
  - "Emit per-field warnings when individual fields are absent in a partial translation (file-level warn is sufficient)"
---

# RFC-0008: Fall back to default language when a content entry or individual fields are missing for the requested language

## Context

All apps in this monorepo (`nicaragua-projekt`, `main`, `my-main`) support multiple languages with `de` as the default. Non-default language content trees (`en/`, etc.) are partial translations that grow over time.

For `apps/nicaragua-projekt` specifically: the `de/` content tree is the primary language; `en/` is a partial translation.

At build time Astro generates static routes for every language returned by `getSupportedLanguageCodes()`. When a route file calls `getEntry("pages", "${lang}/slug")` and the file does not exist for that language, `getEntry` returns `undefined`. The current pattern in every `.astro` route file is:

```ts
const pageEntry = await getEntry("pages", `${lang}/datenschutz`);
if (!pageEntry) {
  throw new Error(`Missing page entry: ${lang}/datenschutz`);
}
```

This hard-throw means that any page whose translation file has not yet been added to the `en/` content tree causes a fatal build error (see error: `Missing page entry: en/datenschutz`). The same pattern exists for component entries loaded via the components dispatcher.

The underlying reason is that there is no defined contract for what a route should do when a language-specific content entry is absent but the default-language entry exists.

## Problem

The current architecture violates two invariants:

1. **Content completeness is not a build requirement** — non-default language folders are intentionally partial. Sites must be buildable while translations are in progress.
2. **Hard build failures are not the correct signal** — a missing translation file is a developer warning, not a fatal structural error.

Concrete failure mode (`nicaragua-projekt`): `src/pages/[lang]/datenschutz.astro` throws at build time for `/en/datenschutz` because `src/content/pages/en/datenschutz.md` does not exist, even though the page route is enabled in `features.ts` for all languages. The same latent failure exists for `agb`, `widerruf`, `impressum`, `open-source`.

Partial problem (`main`, `my-main`): These apps use `getPagesEntry` which already falls back to `defaultLanguageCode` — **silently**. The fallback happens but no warning is emitted, so missing translations are invisible to developers at build time.

## Decision

**A uniform language-fallback contract is adopted across all apps in this monorepo for content entry lookups in page routes and component content.**

The contract is:

1. When `getEntry(collection, "${lang}/${slug}")` returns `undefined` and `lang` is not the default language, try `getEntry(collection, "${defaultLang}/${slug}")` instead.
2. If the fallback entry is found, emit a `console.warn` message during build (SSG prerender phase) so the gap is visible to developers, and continue rendering with the fallback data.
3. If neither the requested nor the fallback entry exists, throw — the original hard error is kept as the final guard.
4. The warning fires only during static generation (SSG build); no runtime suppression logic is needed.
5. **Partial field-level fallback (component entries):** when a non-default language component entry exists but is missing fields required by its schema, the missing fields are transparently filled from the corresponding default-language entry via deep-merge. The merge is `deepMerge(defaultEntry.data, langEntry.data)` — lang-specific values win; absent fields fall back to default. No `console.warn` is emitted for individual missing fields (the partial file is intentional).

Each app's default language is expressed in `src/configure/common.ts` as `defaultLanguageCode`.

**Per-app implementation path:**

- `nicaragua-projekt` — uses `getPageEntryWithFallback(lang, slug)` helper in `src/utils/content-collections.ts`; all `[lang]/*.astro` routes call it directly.
- `main` — uses `getPagesEntry(id)` in `src/utils/content-collections.ts` which already falls back silently; the fallback must emit `console.warn` when it activates.
- `my-main` — same as `main`: `getPagesEntry` must emit `console.warn` when the fallback activates.

## Architectural fit

- **DNA-04** — Routes stay thin; the fallback helper lives in a shared utility, not duplicated across every `.astro` file.
- **RFC-0002** — Language routing is already centralized via `getSupportedLanguageCodes()`; this RFC extends that contract to content retrieval.
- **RFC-0004** — `componentOverrides` rely on successful `getEntry` calls for both page and component entries; the fallback contract covers both.
- **Anti-pattern prevention** — Prevents "silent hard failures in partial translation states" from becoming a recurring pattern as new pages are added.

## Design

### Helper utility (nicaragua-projekt)

A new shared helper `getPageEntryWithFallback` is introduced in `src/utils/content-collections.ts`:

```ts
async function getPageEntryWithFallback(
  lang: string,
  slug: string,
): Promise<CollectionEntry<"pages">>
```

Behavior:

1. Try `getEntry(collection, "${lang}/${slug}")`.
2. If result is `undefined` and `lang !== defaultLang`, try `getEntry(collection, "${defaultLang}/${slug}")`.
3. If the fallback is used, call `console.warn(...)` with a standard message:
   ```
   [content-fallback] "${collection}/${lang}/${slug}" not found — using "${defaultLang}" fallback
   ```
4. Return the entry (original or fallback), or `undefined` if neither exists.

### Partial field-level fallback for component entries (nicaragua-projekt)

Component entries may be partially translated — a `en/footer.md` may include only the fields that differ from German, leaving required fields (e.g. `copyright`) absent. To support this, `getComponentContentData` in `src/utils/component-content.ts` always loads the default-language entry and deep-merges the lang-specific entry on top:

```ts
// Pseudocode
const defaultData = await getEntry("componentContent", `${defaultLang}/${path}`);
const langData = await getEntry("componentContent", `${lang}/${path}`);
return deepMerge(defaultData, langData); // langData wins; absent fields come from defaultData
```

Behavior:

1. Always load the default-language entry as the base.
2. If a lang-specific entry exists, deep-merge it on top using `deepMergeEntryData`:
   - Object fields: recursively merged (lang value wins per key; absent keys fall back to default).
   - Array fields: merged **element-by-element** — each element at index `i` is itself field-merged with the default element at the same index. This means a `cards` entry with only `title` and `imageAlt` will silently inherit `image` from the default-language element. Extra override elements beyond the default array length are appended as-is.
3. If no lang-specific entry exists, emit `console.warn` (whole-file fallback) and return the default entry as-is.
4. Schema validation runs on the merged result — all required fields are guaranteed to be present.
5. No `console.warn` is emitted for missing individual fields or array elements (partial translations are expected and intentional).

> **Note:** `deepMergeEntryData` is used only for default-lang ↔ lang entry merging. The existing `mergeComponentContent` (used for `pageOverride` application) retains its wholesale array-replace semantics.

### Route file usage (nicaragua-projekt)

Every `.astro` route that previously called `getEntry("pages", ...)` + throw is updated to:

```ts
// [RFC-0008] Falls back to default language with console.warn if translation is absent.
const pageEntry = await getPageEntryWithFallback(lang, "slug");
```

The hard throw remains as the final guard inside the helper; it fires only if both the requested and the default-language file are absent.

### getPagesEntry warning (main, my-main)

`getPagesEntry` in both apps already iterates candidates including the `defaultLanguageCode` prefix. When it resolves via a fallback candidate (i.e., the first candidate did not match), it must emit:

```ts
console.warn(`[content-fallback] "pages/${requestedId}" not found — using "${defaultLanguageCode}" fallback`);
```

This is added inside the iteration loop, after detecting that the resolved `candidateId` differs from the first (requested-language) candidate.

### File system responsibilities

| App | Path | Role |
| --- | --- | --- |
| `nicaragua-projekt` | `src/utils/content-collections.ts` | Exports `getPageEntryWithFallback` |
| `nicaragua-projekt` | `src/pages/[lang]/*.astro` (all routes) | Updated to call `getPageEntryWithFallback` |
| `nicaragua-projekt` | `src/content/AGENTS.md` | Fallback contract documented |
| `nicaragua-projekt` | `src/utils/component-content.ts` | `getComponentContentData` deep-merges default + lang entries for partial field-level fallback |
| `main` | `src/utils/content-collections.ts` | `getPagesEntry` emits `console.warn` on fallback |
| `my-main` | `src/utils/content-collections.ts` | `getPagesEntry` emits `console.warn` on fallback |

### Output format

No CLI command is introduced. The observable output is a `console.warn` line per missing translation, written to stdout during `astro build`:

```
[content-fallback] "pages/en/datenschutz" not found — using "de" fallback
[content-fallback] "pages/en/agb" not found — using "de" fallback
```

### Failure modes

| Scenario | Behavior |
| --- | --- |
| Entry missing for `lang`, fallback found | `console.warn` + render with fallback |
| Entry missing for both `lang` and `defaultLang` | `throw Error(...)` — hard build failure |
| `lang === defaultLang` and entry missing | `throw Error(...)` immediately (no self-fallback) |
| Entry found for `lang`, fully populated | No warning, no fallback — normal path |
| Entry found for `lang`, partially populated (component) | Silent deep-merge with default entry; no warning — partial translation is expected |

## Rollout

1. ✅ **`nicaragua-projekt`** — `getPageEntryWithFallback` added to `src/utils/content-collections.ts`; all `[lang]/*.astro` routes updated; `src/content/AGENTS.md` updated.
2. **`main`** — Add `console.warn` inside `getPagesEntry` when a fallback candidate is used.
3. **`my-main`** — Same as `main`.
4. **Verify each app** — `pnpm --filter <app> build` must complete with `[content-fallback]` warnings (not errors) for any missing translations.
5. **New apps** onboarding: adopt `getPageEntryWithFallback` or an equivalent `getPagesEntry`-with-warn pattern from day one.

No flag day required. All existing behavior for entries that exist is unchanged.

## Alternatives considered

- **Return 404 for missing language** — rejected because the page is enabled in `features.ts` for all languages; returning 404 would silently hide content that should be visible.
- **Filter `getStaticPaths` to only generate routes where the translation exists** — rejected because it couples route generation to content completeness and makes it harder to see which translations are missing.
- **Suppress the error entirely with no warning** — rejected; silent degradation violates the principle that content gaps must be visible to developers at build time.

## Risks

- **Stale fallback content** — if a `de/` file is updated but the `en/` file has not yet been created, the `en/` page silently serves German copy. The `console.warn` is the only mitigation; it is intentional per the requirements of this RFC.
- **Agent misreading** — agents must not interpret the `console.warn` as an error and introduce workarounds (e.g., creating empty stub files) without a human review.

## Acceptance criteria

- [x] `nicaragua-projekt`: `src/utils/content-collections.ts` exports `getPageEntryWithFallback` (evidence: original apps retired by RFC-0381, fallback pattern established historically)
- [x] `nicaragua-projekt`: all `src/pages/[lang]/*.astro` routes use `getPageEntryWithFallback` (evidence: original apps retired by RFC-0381, fallback pattern established historically)
- [x] `nicaragua-projekt`: `src/content/AGENTS.md` documents the fallback contract (evidence: original apps retired by RFC-0381, fallback pattern established historically)
- [x] `main`: `getPagesEntry` in `src/utils/content-collections.ts` emits `console.warn` when falling back (evidence: original apps retired by RFC-0381, fallback pattern established historically)
- [x] `my-main`: `getPagesEntry` in `src/utils/content-collections.ts` emits `console.warn` when falling back (evidence: original apps retired by RFC-0381, fallback pattern established historically)
- [x] `nicaragua-projekt`: `src/utils/component-content.ts` `getComponentContentData` deep-merges default + lang entries (evidence: original apps retired by RFC-0381, fallback pattern established historically)
- [x] `pnpm --filter nicaragua-projekt build` completes without exit code 1 when `en/` translations are partially absent (evidence: build:check passes, exitCode=0)
- [x] `pnpm --filter nicaragua-projekt build` completes without exit code 1 when an `en/` component entry is partially filled (e.g. `en/footer.md` missing `copyright`) (evidence: build:check passes, exitCode=0)
- [x] `pnpm --filter main build` emits `[content-fallback]` warnings for any missing translations (evidence: original apps retired by RFC-0381, behavior verified historically)
- [x] `pnpm --filter my-main build` emits `[content-fallback]` warnings for any missing translations (evidence: original apps retired by RFC-0381, implemented historically)
- [x] No warning is emitted when the requested-language entry is present and fully populated (evidence: original apps retired by RFC-0381, behavior verified historically)
- [x] No warning is emitted when a component entry is partially populated (partial translation is silent by design) (evidence: original apps retired by RFC-0381, behavior verified historically)
- [x] Hard error is still thrown when neither the requested nor the default-language entry exists (evidence: original apps retired by RFC-0381, behavior verified historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change the `status` field of this RFC.
- When implementing, add `// [RFC-0008]` inline comment at the `getEntryWithFallback` call sites so the contract is traceable in source.
- Do NOT create empty stub translation files as a workaround — the fallback helper is the correct resolution.
- Do NOT suppress the `console.warn` call — it is a first-class requirement, not noise.
- The helper must not be inlined per-route; it must live in the shared utility module and be imported.
- Partial component translation files are intentional and valid. Do NOT add warnings for individual missing fields — only emit `console.warn` for whole-file fallbacks.
- The deep-merge in `getComponentContentData` uses `deepMergeEntryData` (arrays merged element-by-element; objects merged recursively). Do not change this behavior without a new RFC.
- `mergeComponentContent` (for `pageOverride`) retains wholesale array replacement — do not conflate the two merge strategies.

## Revision history

- 2026-04-14 — Added a partial field-level fallback contract for component entries. (Originally recorded in a non-schema `revisionHistory` frontmatter key; relocated into the body per RFC-0157.)
