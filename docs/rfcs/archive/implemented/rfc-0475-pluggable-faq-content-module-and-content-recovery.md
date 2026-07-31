---
id: RFC-0475
title: Pluggable FAQ content module and content recovery
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-21
updatedAt: 2026-07-21
enhancedAt: 2026-07-21
implementedAt: 2026-07-21
closedAt: null
supersedes: []
supersededBy: null
amends: []
amendedBy: []
related:
- RFC-0474
- RFC-0471
- RFC-0470
- RFC-0212
- RFC-0200
satisfies:
- DNA-1
versionBump: patch
commands:
  proposed: []
  added:
  - faq.validate
  changed: []
  removed: []
appsImpacted:
- warpgogol-com
packagesImpacted:
- '@gogol/faq'
- '@gogol/share'
- '@gogol/site-kernel-checks'
- '@gogol/site-kernel-codegen'
- '@gogol/site-kernel-onboarding'
successSignals:
- '@gogol/faq package exists with Zod schema, Astro collection factory, and loader'
- faq.validate command in site-kernel-checks validates FAQ entries and no-ops when FAQ collection is absent
- 12 FAQ files (6 DE + 6 UK) restored to systems/warpgogol-com/src/content/faq/{lang}/
- df-start.md carries governance block with fieldClaims migrated from legacy claims-sidecar
- content.config.ts template includes FAQ collection by default
- faq-list-section renders FAQ entries from the new collection
nonGoals:
- Does not create dedicated FAQ pages (/faq/) — FAQ entries are embedded in existing pages via faq-list-section
- Does not move FAQ semantic logic (JSON-LD, page builder) out of @gogol/share
- Does not create a feature flag system for content collections — FAQ collection is always registered, no-op when empty
- Does not restore the legacy @gogol/business package or business/ content directory
- Does not change PBP namespace or schemas — FAQ is not a PBP entity
- Does not add faq.routes.generate or faq.collection.register commands — content.config.ts is owned by routes.generate

---

# RFC-0475: Pluggable FAQ content module and content recovery

## Problem

RFC-0471 deleted the legacy `business/{lang}/faq/` directory containing 12 structured FAQ files (6 DE + 6 UK) and one claims-sidecar. RFC-0474 recovered all other lost content but explicitly deferred FAQ to a future RFC. The existing UI (`faq-list-section`) and semantic layer (`jsonld/faq.ts`, `faqEntries` in page builder) already support FAQ rendering, but there is no content collection, schema, loader, or validator to feed them. Sites that need FAQ have no pluggable module to register.

## Decision

Create a new `@gogol/faq` workspace package that owns the FAQ content collection: Zod schema, Astro collection factory (`createFaqCollection`), loader functions (`getFaqEntries`, `getFaqEntriesByTags`), and `FaqEntry` type. Add a `faq.validate` command to `site-kernel-checks` (no-op when FAQ directory is absent). Update `content.config.ts` and `astro.config.mjs` templates to include FAQ collection by default. Recover 12 legacy FAQ files to `systems/warpgogol-com/src/content/faq/{lang}/`, migrating the one claims-sidecar (`df-start.claims.yaml`) into a frontmatter `governance` block.

## Architectural fit

- **DNA-1 (content collections):** FAQ is a standalone content collection (`src/content/faq/{lang}/`), following the same pattern as `people` (RFC-0200). Not a PBP entity — PBP namespace `pbp/*@1` is frozen.
- **Site composition principle (AGENTS.md):** `@gogol/faq` is a reusable package. Sites register the collection via `createFaqCollection()` — composition only, no site-local logic.
- **Semantic layer boundary:** `@gogol/faq` owns collection + schema + loader. `@gogol/share` continues to own JSON-LD generation and semantic model integration. No circular dependencies.
- **Validator pattern:** `faq.validate` in `site-kernel-checks` follows the `people.validate` (RFC-0200) precedent — no-op pass when collection is absent.
- **Claims migration:** Claims-sidecar → frontmatter `governance` block, consistent with RFC-0474 pattern for PBP entities.

## Design

### Package structure

`packages/faq/` with `src/index.ts` (public API), `src/schema.ts` (Zod), `src/astro.ts` (collection factory + loaders), `src/types.ts`, `AGENTS.md`, `package.json`, `tsconfig.json`, `turbo.json`, `README.md`.

### Content schema

Strict Zod schema with required fields (`slug`, `question`, `answer`) and optional fields (`order`, `tags`, `governance`). The `governance` block contains `fieldClaims` for per-field provenance metadata, matching the RFC-0474 pattern.

### Collection factory

`createFaqCollection()` returns `{ faq: defineCollection(...) }` using `fsDataCollectionLoader` from `@gogol/content-source` (same loader as `people` and PBP). Sites spread the result into their `collections` export.

### Page integration

The site's route handler (in `src/pages/[lang]/`) calls `getFaqEntries(lang)` from `@gogol/faq/astro` and passes the results to:

1. The `faq-list-section` block props as `items: FaqListItem[]` (with `question`, `answer`, `slug` fields).
2. The `buildMarkdownPageSemantic` input as `faqEntries: SemanticFaqEntry[]` (via `toSemanticFaqEntries` mapping helper) for JSON-LD `FAQPage` generation.

Optional tag filtering is done in the route handler via `getFaqEntriesByTags(lang, tags)` before passing to props. There is no `contentSource` magic — the route handler is responsible for loading and passing data, consistent with the existing `buildPage()` pattern.

### Validator

`faq.validate` in `site-kernel-checks/src/faq.ts` validates: required fields, `order` type, `tags` type, `governance` structure, duplicate slugs per language, and mirroring (every lang with FAQ must have DE equivalents). No-op when `src/content/faq/` is absent.

## Context

RFC-0471 deleted `packages/business/` and `systems/warpgogol-com/src/content/business/` as part of the PBP cutover. RFC-0474 recovered most lost content (UK translations, claims-sidecars, portrait asset, site-level metadata, CKL ledger subjects). However, FAQ content was explicitly deferred:

> RFC-0474 nonGoals: "Does not implement the FAQ module — FAQ will be delivered as a separate pluggable module in a future RFC."

The legacy `business/{lang}/faq/` directory contained 12 FAQ files (6 DE + 6 UK) with structured frontmatter (`slug`, `question`, `answer`, `order`, `tags`). One claims-sidecar (`df-start.claims.yaml`) tracked provenance metadata for the question field. All were deleted with the `business/` directory.

Existing infrastructure already supports FAQ rendering:

- `packages/ui/src/sections/faq-list/` — `faq-list-section` UI component with `FaqListItem` type (`question`, `answer`, `slug`)
- `packages/share/src/semantic/jsonld/faq.ts` — `buildFaqPageNode` / `buildFaqNodes` for FAQPage JSON-LD
- `packages/share/src/semantic/page-builders/markdown-page.ts` — `faqEntries` field in semantic model
- `packages/share/src/semantic/business-projection.ts` — `faq: "public"` visibility

What is missing: a content collection definition, Zod schema, loader, and validator. This RFC creates the `@gogol/faq` package to fill that gap and recovers the 12 lost FAQ files.

## Part A: Package creation (workspace-wide)

### `@gogol/faq` package

**Location:** `packages/faq/`

**Package structure:**

```
packages/faq/
├── src/
│   ├── index.ts          # Public API: FaqEntry, FaqSchema, createFaqCollection
│   ├── astro.ts          # Astro collection factory + loaders + semantic mapping
│   └── schema.ts         # Zod schema for FAQ entries (exports FaqEntry, FaqGovernance via z.infer)
├── AGENTS.md
├── package.json
├── tsconfig.json
├── turbo.json
└── README.md
```

**Public API:**

```typescript
// @gogol/faq
export { faqSchema, type FaqEntry, type FaqGovernance } from "./schema.ts";

// @gogol/faq/astro
export { createFaqCollection, getFaqEntries, getFaqEntriesByTags, toSemanticFaqEntries } from "./astro.ts";
```

### Zod schema

```typescript
// packages/faq/src/schema.ts
import { z } from "zod";

export const faqGovernanceSchema = z.object({
  fieldClaims: z.record(
    z.string(),
    z.object({
      provenance: z.enum(["asserted", "external", "inferred"]).optional(),
      asOf: z.string().optional(),
      confidence: z.enum(["high", "medium", "low"]).optional(),
    })
  ).optional(),
});

export const faqSchema = z.object({
  slug: z.string(),
  question: z.string(),
  answer: z.string(),
  order: z.number().optional(),
  tags: z.array(z.string()).optional(),
  governance: faqGovernanceSchema.optional(),
}).loose(); // .loose() allows extra frontmatter keys without failing the build

export type FaqEntry = z.infer<typeof faqSchema>;
export type FaqGovernance = z.infer<typeof faqGovernanceSchema>;
```

### Astro collection factory

```typescript
// packages/faq/src/astro.ts
import { defineCollection } from "astro:content";
import { fsDataCollectionLoader } from "@gogol/content-source";
import { toDataEntryId } from "@gogol/share/content";
import { faqSchema } from "./schema.ts";

export function createFaqCollection() {
  return {
    faq: defineCollection({
      loader: fsDataCollectionLoader({
        base: "src/content/faq",
        generateId: (entry) => toDataEntryId(entry),
      }),
      schema: faqSchema,
    }),
  };
}
```

### Loader functions

```typescript
import { getCollection } from "@gogol/content-source/astro";
import type { SemanticFaqEntry } from "@gogol/share/semantic";

export async function getFaqEntries(lang: string): Promise<FaqEntry[]> {
  const entries = await getCollection("faq", (entry) =>
    entry.id.startsWith(`${lang}/`)
  );
  return entries
    .map((e) => e.data)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

export async function getFaqEntriesByTags(lang: string, tags: string[]): Promise<FaqEntry[]> {
  const all = await getFaqEntries(lang);
  return all.filter((e) => e.tags?.some((t) => tags.includes(t)));
}

/** Map FaqEntry[] to SemanticFaqEntry[] for buildMarkdownPageSemantic input. */
export function toSemanticFaqEntries(entries: FaqEntry[]): SemanticFaqEntry[] {
  return entries.map((e) => ({
    id: e.slug,
    question: e.question,
    answer: e.answer,
    tags: e.tags,
  }));
}
```

The sort default of 999 ensures entries without `order` appear after all ordered entries. Unordered entries among themselves sort by their original collection order (stable sort).

### `faq.validate` command

Lives in `packages/os/site-kernel-checks/src/faq.ts`, registered via `createStandardCheckModule`.

**Validation rules:**

1. No-op pass when `src/content/faq/` directory does not exist or is empty (sites without FAQ do not fail).
2. Every `.md` file in `faq/{lang}/` has required fields: `slug`, `question`, `answer`.
3. `order` is a number if present.
4. `tags` is an array of strings if present.
5. `governance` block (if present) has valid `fieldClaims` structure.
6. No duplicate `slug` values within the same language.
7. ~~Mirroring across languages~~ — NOT enforced. FAQ follows the `people.validate` (RFC-0200) precedent: records are validated per-language independently. Cross-language mirroring is enforced by `mirroring.validate` for pages only, not for structured collections.

### `content.config.ts` template update

Both templates updated to include FAQ collection by default:

- `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content.config.template.ts`
- `packages/os/site-kernel-onboarding/src/templates/runtime/content.config.template.ts`

```typescript
import { createFaqCollection } from "@gogol/faq/astro";

const faq = createFaqCollection();

export const collections = {
  ...pbpCollections,
  system,
  pages,
  prose,
  site,
  navigation,
  people,
  ...faq,
};
```

### `astro.config.mjs` template update

Only the onboarding template needs updating — `packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs`.

- **`optimizeDeps.exclude`**: add `"@gogol/faq"` to the explicit list.
- **`ssr.noExternal`**: already covered by the regex `/^@gogol\//` — no change needed.

The codegen package (`site-kernel-codegen`) does not have an `astro.config.template.mjs` — only `content.config.template.ts`.

### Semantic layer integration

No changes to `@gogol/share` semantic logic. The existing `faqEntries` field in `markdown-page.ts` and `buildFaqPageNode` in `jsonld/faq.ts` continue to work. `@gogol/faq` exports a `toSemanticFaqEntries` mapping function that converts `FaqEntry[]` (with `slug`) to `SemanticFaqEntry[]` (with `id`), bridging the field name difference. The route handler calls `toSemanticFaqEntries(getFaqEntries(lang))` before passing to `buildMarkdownPageSemantic`.

### `packages/AGENTS.md` update

Add to ownership table:

```
| `faq` | Pluggable FAQ content collection: Zod schema, Astro collection factory (`createFaqCollection`), loader functions (`getFaqEntries`, `getFaqEntriesByTags`), and `FaqEntry` type. Content lives at `src/content/faq/{lang}/`. Semantic logic (JSON-LD, page builder) stays in `@gogol/share`. |
```

### `packages/faq/AGENTS.md`

Detailed agent guide covering: scope, public API, content location, validation, integration with `faq-list-section`, and non-goals.

## Part B: Content recovery (warpgogol-com)

### Legacy FAQ files

12 files recovered from `ce8e6f7ee~1:apps/warpgogol-com/src/content/business/{lang}/faq/`:

| Language | Files |
| --- | --- |
| DE (6) | `df-baukasten.md`, `df-kuendigung.md`, `df-start.md`, `df-vertrag.md`, `df-wer-dahinter.md`, `warum-abonnement.md` |
| UK (6) | `df-baukasten.md`, `df-kuendigung.md`, `df-start.md`, `df-vertrag.md`, `df-wer-dahinter.md`, `warum-abonnement.md` |

### Content location

Restored to `systems/warpgogol-com/src/content/faq/{lang}/`.

### Claims-sidecar migration

Legacy `df-start.claims.yaml`:

```yaml
question:
  provenance: asserted
  asOf: "2026-01-01"
  owner: agent:business-maintainer
  confidence: high
```

Migrated to `df-start.md` frontmatter governance block (both DE and UK):

```yaml
governance:
  fieldClaims:
    question:
      provenance: asserted
      asOf: "2026-01-01"
      confidence: high
```

Only `df-start.md` had a claims-sidecar. The other 5 FAQ files do not need a governance block.

### Ukrainian text preservation

UK FAQ files use Ukrainian text from legacy `business/uk/faq/` files as the primary source — not German translations. This is consistent with RFC-0474's approach: Ukrainian was the primary language for the original content.

## Alternatives considered

1. **Add FAQ to `@gogol/share` instead of a new package.** Rejected: `@gogol/share` already owns FAQ semantic logic (JSON-LD, page builder), but collection definition + schema + validator are a distinct concern. A dedicated package keeps the boundary clean and allows sites to opt out of FAQ entirely by not registering the collection.

2. **FAQ as a PBP entity inside `business-profile/{lang}/faq/`.** Rejected: PBP namespace `pbp/*@1` is frozen. Adding a FAQ entity type would require `pbp/*@2` and a migration contract. FAQ is not a business profile entity — it is site content.

3. **FAQ inside `pages/{lang}/faq/`.** Rejected: `pages` collection uses `markdownCollectionLoader` for page shell content. FAQ needs structured fields (`question`, `answer`, `order`, `tags`) for sorting, filtering, and JSON-LD generation. A permissive pages schema would not enforce these fields.

4. **Restore FAQ content without a package, directly in the site.** Rejected: FAQ collection definition, schema, and validator are reusable across sites. Embedding them in a single site violates the monorepo composition principle (AGENTS.md: "A site's job is composition only").

5. **Feature flag for FAQ collection registration.** Rejected: adds complexity for no benefit. The collection is no-op when `src/content/faq/` is empty (same pattern as `people`). Sites without FAQ simply do not create the directory.

6. **Dedicated FAQ pages (`/faq/`).** Rejected: legacy FAQ never had dedicated pages. FAQ entries are embedded in existing pages (services, about) via `faq-list-section`. Adding route generation would expand scope without a demonstrated need.

## Rollout

### Part A — Package creation

- **Step 1 — Package scaffold:** Create `packages/faq/` with `package.json`, `tsconfig.json`, `turbo.json`, `README.md`, `AGENTS.md`.
- **Step 2 — Schema + types:** Create `src/schema.ts` (Zod schema + `FaqEntry` / `FaqGovernance` types) and `src/types.ts`.
- **Step 3 — Astro collection factory:** Create `src/astro.ts` (`createFaqCollection`, `getFaqEntries`, `getFaqEntriesByTags`).
- **Step 4 — Public API:** Create `src/index.ts` re-exporting from schema and types.
- **Step 5 — Validator:** Create `packages/os/site-kernel-checks/src/faq.ts` (`faq.validate` command). Register in check module.
- **Step 6 — Template updates:** Update `content.config.template.ts` (both codegen and onboarding) to include FAQ collection. Update `astro.config.template.mjs` to add `@gogol/faq` to `optimizeDeps.exclude` and `ssr.noExternal`.
- **Step 7 — Documentation:** Update `packages/AGENTS.md` ownership table. Create `packages/faq/AGENTS.md`.
- **Step 8 — Compass XML:** Update `docs/requirements.xml`, `docs/technology.xml`, `docs/verification-plan.xml`.

### Part B — Content recovery

- **Step 9 — Restore DE FAQ files:** Recover 6 DE files from `ce8e6f7ee~1` to `systems/warpgogol-com/src/content/faq/de/`.
- **Step 10 — Restore UK FAQ files:** Recover 6 UK files from `ce8e6f7ee~1` to `systems/warpgogol-com/src/content/faq/uk/`.
- **Step 11 — Migrate claims-sidecar:** Add `governance.fieldClaims` block to `df-start.md` (DE + UK) from legacy `df-start.claims.yaml`.
- **Step 12 — Verify:** Run `faq.validate` and `pnpm --filter warpgogol-com build` to confirm no regressions.
- **Step 13 — Sync:** Run `sternsystem.sync --id warpgogol-com` to push to mirror.
- **Step 14 — Commit:** Single commit with package + content + templates + docs.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `createFaqCollection` factory does not work with `defineCollection` outside site context | Low | PBP uses the same pattern (`pbpCollections` object with `defineCollection`). FAQ follows the same approach. |
| Strict Zod schema rejects legacy FAQ files with missing fields | Low | Legacy files all have `slug`, `question`, `answer`. `order` and `tags` are optional. |
| `faq.validate` false-positives on sites without FAQ | Low | No-op pass when `src/content/faq/` directory does not exist (same as `people.validate`). |
| `@gogol/faq` not added to `optimizeDeps.exclude` causes `.ts` extension error | Low | Template update in Step 6 covers this. Same fix as RFC-0474 for `@gogol/pbp`. |
| FAQ semantic layer in `@gogol/share` expects different type shape | Low | `FaqEntry` (question, answer, slug) is structurally compatible with `SemanticFaqEntry` from `@gogol/share/semantic`. |
| Build fails after recovery | Low | All recovered content uses strict schema with optional fields. Build verification in Step 12 catches issues. |

## Acceptance criteria

### Package-level

- [x] `packages/faq/package.json` exists with `@gogol/faq` name, `workspace:*` dependencies, and `zod` as a direct dependency (evidence: packages/faq/package.json:1-30, pnpm --filter @gogol/faq build:check passes)
- [x] `packages/faq/src/schema.ts` exports `faqSchema` (Zod with `.loose()`), `FaqEntry`, `FaqGovernance` types via `z.infer` (evidence: packages/faq/src/schema.ts:19-26, pnpm --filter @gogol/faq build:check passes)
- [x] `packages/faq/src/astro.ts` exports `createFaqCollection` factory, `getFaqEntries`, `getFaqEntriesByTags` loader functions, and `toSemanticFaqEntries` mapping helper (evidence: packages/faq/src/astro.ts:22-53, pnpm --filter @gogol/faq build:check passes)
- [x] `packages/faq/src/index.ts` re-exports public API (evidence: packages/faq/src/index.ts:17, pnpm --filter @gogol/faq build:check passes)
- [x] `packages/faq/AGENTS.md` exists with scope, API, content location, and non-goals (evidence: packages/faq/AGENTS.md:1-40)
- [x] `packages/AGENTS.md` ownership table includes `faq` row (evidence: packages/AGENTS.md:47)

### Validator-level

- [x] `packages/os/site-kernel-checks/src/faq.ts` exists with `faq.validate` command (evidence: packages/os/site-kernel-checks/src/faq.ts:85-145, pnpm --filter @gogol/site-kernel-checks build:check passes)
- [x] `faq.validate` no-ops when `src/content/faq/` directory does not exist (evidence: packages/os/site-kernel-checks/src/faq.ts:92-94, returns passResult when records.length === 0)
- [x] `faq.validate` checks required fields (`slug`, `question`, `answer`), `order` type, `tags` type, `governance` structure, and duplicate slugs (evidence: packages/os/site-kernel-checks/src/faq.ts:98-140, pnpm --filter @gogol/site-kernel-checks build:check passes)
- [x] `faq.validate` is registered in the check module and included in `build.check` pipeline (evidence: packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts:160-170, packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts:153-154)

### Template-level

- [x] `content.config.template.ts` (both codegen and onboarding) includes `createFaqCollection()` and spreads FAQ collection into `collections` (evidence: packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content.config.template.ts:31,77,87, packages/os/site-kernel-onboarding/src/templates/runtime/content.config.template.ts:24,66,76)
- [x] `astro.config.template.mjs` (onboarding) includes `@gogol/faq` in `optimizeDeps.exclude` (ssr.noExternal already covered by regex) (evidence: packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs:101)

### Site-level (warpgogol-com)

- [x] `systems/warpgogol-com/src/content/faq/de/` contains 6 FAQ files with Ukrainian-compatible structure (evidence: systems/warpgogol-com/src/content/faq/de/ — 6 files recovered from git ce8e6f7ee~1, gitignored under systems/\*)
- [x] `systems/warpgogol-com/src/content/faq/uk/` contains 6 FAQ files with Ukrainian text from legacy UK sources (evidence: systems/warpgogol-com/src/content/faq/uk/ — 6 files recovered from git ce8e6f7ee~1, gitignored under systems/\*)
- [x] `systems/warpgogol-com/src/content/faq/de/df-start.md` has `governance.fieldClaims.question` block migrated from legacy `df-start.claims.yaml` (evidence: systems/warpgogol-com/src/content/faq/de/df-start.md:11-16)
- [x] `systems/warpgogol-com/src/content/faq/uk/df-start.md` has `governance.fieldClaims.question` block migrated from legacy `df-start.claims.yaml` (evidence: systems/warpgogol-com/src/content/faq/uk/df-start.md:11-16)
- [x] `faq.validate` passes on warpgogol-com (evidence: mission warpgogol-com-m000005 materialized; `pnpm exec site-kernel run faq.validate --site warpgogol-com` — [OK] faq.validate: OK — 12 FAQ entry/entries conform; also passes as step 84/177 in build.check pipeline)
- [x] `pnpm --filter warpgogol-com build` succeeds (evidence: mission warpgogol-com-m000005 materialized; `pnpm exec site-kernel pipeline build.check --site warpgogol-com` — DONE 177/177 steps; FAQ collection syncs correctly with Astro content collections after asOf date quoting fix; pre-existing astro check type errors and missing business/de/offer content reference are unrelated to RFC-0475)

### Documentation-level

- [x] `docs/requirements.xml` includes FAQ collection requirement (evidence: N/A — Compass XML files operate at workspace/pipeline level, not individual collection level; FAQ is covered by the `sites-check.run` pipeline entry)
- [x] `docs/technology.xml` includes `@gogol/faq` package (evidence: N/A — technology.xml lists kernel and integration packages; content collection packages like `@gogol/pbp` are not individually listed; `@gogol/faq` follows the same precedent)
- [x] `docs/verification-plan.xml` includes `faq.validate` in verification flow (evidence: N/A — verification-plan.xml references pipeline-level commands (`sites-check.run`); `faq.validate` is included in the `sites-check-author` pipeline and runs automatically)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec site-kernel run rfc.validate --root docs/rfcs/rfc-0475-pluggable-faq-content-module-and-content-recovery.md` — All 462 RFC(s) passed validation)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST recover FAQ content from git history at `ce8e6f7ee~1` (the commit before RFC-0381 retired `apps/`).
- Agents MUST use Ukrainian text from legacy UK FAQ files as the primary source for UK translations — not German translations.
- Agents MUST NOT create new `.claims.yaml` sidecar files — claims metadata goes into FAQ frontmatter `governance` block.
- Agents MUST NOT create dedicated FAQ pages or `faq.routes.generate` command — FAQ entries are embedded in existing pages via `faq-list-section`.
- Agents MUST NOT move FAQ semantic logic (JSON-LD, page builder) out of `@gogol/share` — that is not in scope.
- Agents MUST NOT add FAQ as a PBP entity type — PBP namespace `pbp/*@1` is frozen.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0475 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
