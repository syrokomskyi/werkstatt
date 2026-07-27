# Schema Convention

This rule defines the current schema layout for project-owned Zod contracts.

In the current Turborepo layout, these `src/**` references resolve to `apps/nicaragua-projekt/src/**`.

## Core principle

**Canonical schemas live in shared packages.** App-local schema files are minimal overrides or thin proxies.

The heavy validation contracts for pages, navigation, and site content have moved to `packages/share/schemas/`. Apps should consume them rather than redefine local mirrors.

## App-local schema files

### Navigation schema override

- `src/content/schemas/navigation.ts`
  - defines `appNavigationGroups` array for app-specific navigation grouping
  - imports shared base schemas from `@warpgogol/share/schemas/navigation`

### Entity-ID proxy

- `src/content/schemas/entity-id.ts`
  - thin proxy re-exporting `@warpgogol/share/content` utilities
  - do not re-implement normalization logic here

### Page base proxy

- `src/content/schemas/pages/base.ts`
  - thin proxy re-exporting shared page schemas from `@warpgogol/share/schemas`

## Rules

- Do not recreate `src/content/schemas/components/` or `src/content/schemas/pages/` deep trees.
- Do not recreate `src/content/schemas/components-dispatcher.ts` or `src/content/schemas/pages-dispatcher.ts`.
- App-local schemas should be **overrides**, not duplicate canonical contracts.
- Keep route files thin: import types from `@warpgogol/share/schemas` instead of re-declaring local contracts.
- **FORBIDDEN:** Do not hardcode visitor-facing strings in component templates.

## Validation checklist

Before finishing schema work:

- [ ] app-local schemas are thin overrides, not duplicated canonical contracts
- [ ] `src/content/schemas/components/` was not recreated
- [ ] `src/content/schemas/components-dispatcher.ts` was not recreated
- [ ] no hardcoded visitor-facing strings remain in component templates
- [ ] `pnpm --filter nicaragua-projekt -s astro sync` passes
- [ ] `pnpm --filter nicaragua-projekt -s astro check` passes
