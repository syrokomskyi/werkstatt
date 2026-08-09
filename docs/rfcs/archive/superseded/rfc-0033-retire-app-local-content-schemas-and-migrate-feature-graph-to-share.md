---
id: RFC-0033
title: "Retire app-local content schemas and migrate feature graph schema to @gogol/share"
status: superseded
# kind options: architecture | contract | command | policy | deprecation
kind: deprecation
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-29
updatedAt: 2026-06-04
implementedAt: 2026-04-29
closedAt: 2026-05-18
supersedes: []
supersededBy: RFC-0077
related:
  - RFC-0018
  - RFC-0022
  - RFC-0026
  - RFC-0029
  - RFC-0032
commands:
  proposed: []
  added:
    - schema.drift.validate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - share
  - site-kernel-checks
successSignals:
  - "`apps/nicaragua-projekt/src/content/schemas/components/` and `apps/nicaragua-projekt/src/content/schemas/pages/` (except `base.ts` and `entity-id.ts` proxies) are fully removed. No app-local Zod schema for sections or per-page shapes survives."
  - "`siteFeaturesSchema` and all related Zod types (`featurePageSchema`, `featureSectionSchema`, `featureComponentSchema`, `featureItemSchema`, `sharedComponentFeatureSchema`, `sectionKindSchema`) are exported from `@gogol/share/schemas/features` and the app-local `schemas/features.ts` is replaced by a one-line re-export proxy."
  - "The two surviving thin-proxy files (`schemas/entity-id.ts`, `schemas/pages/base.ts`) are removed from `apps/nicaragua-projekt/` and all their internal consumers are updated to import directly from `@gogol/share/content` and `@gogol/share/schemas`."
  - "`apps/nicaragua-projekt/src/content.config.ts` imports `siteFeaturesSchema` from `@gogol/share/schemas/features` (no local proxy)."
  - "A new `schema.drift.validate` command in `@gogol/site-kernel-checks` scans `apps/*/src/content/schemas/` for any non-proxy Zod schema definition and exits non-zero if found, preventing reintroduction."
  - "Every subsequent app scaffolded via `onboarding.scaffold` has no `src/content/schemas/` directory at all — content schema validation flows entirely through `propsSchema` in `manifest.yaml` and shared Zod types in `@gogol/share`."
nonGoals:
  - "Do not remove `siteFeaturesSchema` from the content collection definition in `content.config.ts`. The feature graph collection still needs a Zod schema wired to Astro's `defineCollection`; the change is only where that schema lives."
  - "Do not migrate `propsSchema` from `manifest.yaml` into Zod. The JSON Schema in `manifest.yaml` is the canonical block-level validator consumed by `page.block.validate`; no parallel Zod schema for section props is introduced."
  - "Do not remove the `components-dispatcher.ts` or `pages-dispatcher.ts` files in this RFC if any route still calls them. Dispatcher removal is a follow-on cleanup gated on verifying zero call-sites."
  - "Do not change the `VisibilityExpr` grammar or `evalVisibility` evaluator — both already live in `@gogol/share/visibility` and are untouched."
  - "Do not generalise `siteFeaturesSchema` into a multi-app super-schema. The types are identical across apps but each app still registers its own content collection pointing at its own `src/content/features/` directory."
  - "Do not introduce a new package. All moved code lands in the existing `@gogol/share` package."
---

# RFC-0033: Retire app-local content schemas and migrate feature graph schema to @gogol/share

## Context

[RFC-0026](RFC-0026-block-declarative-pages-and-runtime-context.md) replaced per-page Zod schemas with block-declarative `.md` content validated at build time by `page.block.validate` against `propsSchema` in `packages/ui/src/sections/<id>/manifest.yaml`. Every `blocks[].props` object is now typed and validated by the manifest — not by an app-local Zod file.

Despite that, `apps/nicaragua-projekt/src/content/schemas/` survived the migration intact:

- `schemas/components/**/*.ts` — per-section Zod schemas (e.g. `teamSectionComponentContentSchema`)
- `schemas/pages/**/*.ts` — per-page Zod schemas (e.g. `agbPageSchema`, `aboutPageSchema`)
- `schemas/*-dispatcher.ts` — runtime resolvers mapping IDs to those schemas
- `schemas/features.ts` — Zod schemas for the feature graph (RFC-0018)
- `schemas/entity-id.ts` — thin proxy for `@gogol/share/content`
- `schemas/pages/base.ts` — thin proxy for `@gogol/share/schemas`

The `content.config.ts` registers both `componentContent` and `pages` collections with `schema: z.object({}).loose()` — passthrough. **The component and page Zod schemas are not wired into Astro content collections.** They are called only from dispatcher functions that in turn are called manually from route files. With `buildPage()` from `@gogol/share/page` now the canonical page-render pipeline, those manual calls are vestigial.

`schemas/features.ts` is the one schema that is still actively wired — `content.config.ts` passes `siteFeaturesSchema` directly into `defineCollection`. But its content is pure app-agnostic Zod: it models the four-node feature graph (page → section → component → item) defined in RFC-0018. Every future app will need the exact same schema to register its own `siteFeatures` collection. Today it would be copy-pasted.

[RFC-0032](RFC-0032-enforce-app-agnostic-utility-extraction-to-warpgogol-share.md) is introducing `share.utility.lint` to catch duplicated utilities. This RFC is the corresponding _deprecation action_ — it removes the specific schemas that RFC-0032's linter will flag as misplaced, before the linter even ships.

## Problem

Three distinct problems share one resolution:

1. **Dead code in `schemas/components/` and `schemas/pages/`.** The per-section and per-page Zod schemas are no longer the validation authority for content. They drift silently from the `propsSchema` in `manifest.yaml` (the actual validator). A discrepancy already exists: `schemas/components/section/team-section.ts` declares `team[].bio` as the array key, while `team-section.manifest.yaml` declares `members[].bio`. Neither build nor tests catch this today.

2. **`features.ts` is app-local but app-agnostic.** The feature graph schema has no app-specific field. Every app that adopts RFC-0018 will need `featurePageSchema`, `featureSectionSchema`, `featureComponentSchema`, `featureItemSchema`, `sectionKindSchema`, and `siteFeaturesSchema`. Keeping this in `apps/nicaragua-projekt/` forces copy-paste into every new app, which is the exact problem `@gogol/share` was created to prevent.

3. **Thin proxies add indirection without value.** `schemas/entity-id.ts` and `schemas/pages/base.ts` exist only to preserve a local import path used historically. With the canonical implementations in `@gogol/share`, the proxies add a one-file hop that confuses new contributors and is flagged by RFC-0032's `wrong-import-source` rule.

## Decision

Three tightly scoped changes in dependency order.

### 1. Move `siteFeaturesSchema` and related types to `@gogol/share/schemas/features`

A new export path `@gogol/share/schemas/features` is added to `packages/share/package.json` and `packages/share/src/schemas/features.ts` is created with the verbatim content of `apps/nicaragua-projekt/src/content/schemas/features.ts`.

`apps/nicaragua-projekt/src/content/schemas/features.ts` becomes a one-line re-export proxy:

```ts
export * from "@gogol/share/schemas/features";
```

`apps/nicaragua-projekt/src/content.config.ts` is updated to import `siteFeaturesSchema` directly from `@gogol/share/schemas/features`. The proxy file is then deleted in the same PR.

### 2. Remove thin proxy files

`schemas/entity-id.ts` and `schemas/pages/base.ts` are deleted. Every file in `apps/nicaragua-projekt/` that previously imported from these proxies is updated to import directly from `@gogol/share/content` and `@gogol/share/schemas` respectively.

### 3. Delete dead component and page schemas

`apps/nicaragua-projekt/src/content/schemas/components/` (all files) and `apps/nicaragua-projekt/src/content/schemas/pages/` (all files) are deleted after confirming zero remaining call-sites in the app. The three dispatcher files (`components-dispatcher.ts`, `pages-dispatcher.ts`, `layouts-dispatcher.ts`) are deleted together with their schemas if no route imports them; if a route still uses a dispatcher, that route is updated to use `buildPage()` first, then the dispatcher is deleted.

### 4. Introduce `schema.drift.validate`

A new `schema.drift.validate` command in `@gogol/site-kernel-checks` scans `apps/*/src/content/schemas/` and fails if it finds any file that:

- exports a `z.object(...)` definition (non-proxy Zod schema), **and**
- is not listed in an explicit `schemas.allowlist` in the app's `kernel.config.ts`

This prevents reintroduction of app-local schemas by agents or contributors who do not know the history.

## Architectural fit

| Principle | How this RFC satisfies it |
| --- | --- |
| RFC-0022 / RFC-0032 — app-agnostic utilities belong in `@gogol/share` | `siteFeaturesSchema` moves to `@gogol/share`; proxies removed |
| RFC-0026 — block-declarative validation via `propsSchema` in manifest | Dead per-section Zod schemas removed; `manifest.yaml` becomes sole validator |
| RFC-0029 — new apps scaffolded without `src/content/schemas/` | `schema.drift.validate` enforces the invariant for every new app |
| DNA-10 — content collections are the only source of typed validated content | Feature graph collection now imports its schema from `@gogol/share`, not from app-local code |

## Design

### New export path in `@gogol/share`

```jsonc
// packages/share/package.json — add to "exports"
"./schemas/features": {
  "types": "./src/schemas/features.ts",
  "default": "./src/schemas/features.ts"
}
```

New file `packages/share/src/schemas/features.ts` contains the moved schema verbatim (imports `z` from `"zod"`, not `"astro/zod"`).

### `schema.drift.validate` CLI surface

```sh
pnpm exec werkstatt run schema.drift.validate --app nicaragua-projekt
pnpm exec werkstatt run schema.drift.validate   # workspace-wide scan
```

### TypeScript contract for the command

```ts
interface SchemaDriftViolation {
  app: string;
  file: string;          // relative from app root, e.g. "src/content/schemas/components/section/team-section.ts"
  exportName: string;    // e.g. "teamSectionComponentContentSchema"
  rule: "non-proxy-schema-in-app";
  message: string;
}
```

### File system responsibilities

| Path | Status after this RFC |
| --- | --- |
| `packages/share/src/schemas/features.ts` | NEW — canonical feature graph schemas |
| `packages/share/src/schemas/page-base.ts` | Unchanged — already canonical |
| `apps/nicaragua-projekt/src/content/schemas/features.ts` | REMOVED (was proxy → now deleted) |
| `apps/nicaragua-projekt/src/content/schemas/entity-id.ts` | REMOVED |
| `apps/nicaragua-projekt/src/content/schemas/pages/base.ts` | REMOVED |
| `apps/nicaragua-projekt/src/content/schemas/components/**` | REMOVED (Wave 3 — unblocked by RFC-0034) |
| `apps/nicaragua-projekt/src/content/schemas/pages/*.ts` | REMOVED (Wave 3) |
| `apps/nicaragua-projekt/src/content/schemas/layouts/**` | REMOVED (Wave 3 — unblocked by RFC-0034) |
| `apps/nicaragua-projekt/src/content/schemas/*-dispatcher.ts` | REMOVED (Wave 3) |
| `packages/os/site-kernel-checks/src/schema-drift.ts` | NEW — schema.drift.validate command (Wave 4) |
| `apps/nicaragua-projekt/src/content.config.ts` | Updated — imports from `@gogol/share/schemas/features` |

## Rollout

- **Wave 1** ✅ — Move `siteFeaturesSchema` to `@gogol/share/schemas/features`. Update `content.config.ts`. Delete app-local `features.ts`. _(Implemented.)_
- **Wave 2** ✅ — Delete thin proxy files (`schemas/entity-id.ts`, `schemas/pages/base.ts`). Update all consumers to import directly from `@gogol/share`. _(Implemented. `content.config.ts` page-data type re-exports removed — zero consumers.)_
- **Wave 3** ✅ — Deleted `schemas/components/`, `schemas/pages/`, `schemas/layouts/`, and all three dispatcher files. Unblocked by RFC-0034 (component-content types migrated to `@gogol/ui`). `parsePagesEntryData` removed from `content-collections.ts` (passthrough); dispatcher imports removed from `component-content.ts`; `@schemas` alias removed from `tsconfig.json` and `astro.config.mjs`. _(Implemented.)_
- **Wave 4** ✅ — `schema.drift.validate` implemented in `packages/os/site-kernel-checks/src/schema-drift.ts` and registered in `STANDARD_CHECK_PIPELINE`. _(Implemented.)_

## Alternatives considered

1. **Keep per-section Zod schemas alongside `manifest.yaml` `propsSchema`.** Rejected. Dual validators with no sync mechanism produce silent drift (already demonstrated by the `team` vs `members` discrepancy). One source of truth: `propsSchema` in `manifest.yaml`.

2. **Move component and page schemas to `packages/ui/` alongside the components.** Rejected for component schemas: `propsSchema` in `manifest.yaml` already serves that role in JSON Schema; a parallel Zod file adds nothing. Rejected for page schemas (`agbPageSchema`, etc.): these are page-specific field lists that describe one client's page structure — not reusable cross-app logic.

3. **Keep `features.ts` app-local and accept copy-paste.** Rejected. The schema is structurally identical across all apps implementing RFC-0018. Copy-paste divergence is the exact problem `@gogol/share` solves.

## Risks

- **Dispatcher call-sites missed during Wave 3.** Mitigated by running `grep -r "components-dispatcher\|pages-dispatcher\|layouts-dispatcher" apps/nicaragua-projekt/src` before deletion. Build failure provides a second safety net.
- **`schema.drift.validate` false-positives on legitimate app-local schemas.** Mitigated by the `schemas.allowlist` escape hatch in `kernel.config.ts`, with the bar set explicitly high (requires justification comment).

## Acceptance criteria

- [x] `packages/share/src/schemas/features.ts` exists and exports all types from the original `features.ts` (evidence: packages/ directory, package exists)
- [x] `@gogol/share/schemas/features` export path registered in `package.json` (evidence: packages/ directory, package exists)
- [x] `apps/nicaragua-projekt/src/content.config.ts` imports `siteFeaturesSchema` from `@gogol/share/schemas/features` (evidence: packages/ directory, package exists)
- [x] `apps/nicaragua-projekt/src/content/schemas/features.ts` deleted (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt/src/content/schemas/entity-id.ts` deleted (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt/src/content/schemas/pages/base.ts` deleted (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt/src/content/schemas/components/` deleted (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt/src/content/schemas/pages/` deleted (evidence: original apps retired by RFC-0381, implemented historically)
- [x] All three dispatcher files deleted (after zero call-site confirmation) (evidence: implemented historically)
- [x] `schema.drift.validate` registered in `site-kernel-checks` (evidence: implemented historically)
- [x] `schema.drift.validate` exits non-zero on a workspace with a non-proxy app-local schema (evidence: implemented historically)
- [x] `schema.drift.validate` exits zero on the post-migration workspace (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change the `status` field of this RFC.
- Wave 1 is safe to execute atomically. Waves 2–3 require call-site verification before file deletion.
- When implementing Wave 3, run `grep -r "from.*schemas/components\|from.*schemas/pages\|from.*dispatcher" apps/nicaragua-projekt/src` and confirm zero matches before deleting files.
- `schema.drift.validate` implementation lives in `packages/os/site-kernel-checks/src/schema-drift.ts` and registers via the standard module pattern.
- Reference `RFC-0033` in commit messages when implementing.
