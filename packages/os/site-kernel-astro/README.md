# @warpgogol/site-kernel-astro

Astro-specific path adapter for the Warpgogol Site OS. Resolves canonical directory paths for any app following the standard Astro site layout.

## Purpose

`site-kernel-checks`, `site-kernel-codegen`, and other OS command packages need to resolve paths like `src/content/pages/`, `src/styles/`, or `src/assets/icons/` for any given app. This package provides a single, authoritative implementation of that resolution so no command duplicates path logic.

## Public API

```typescript
import {
  getAstroSitePaths,
  getAstroSitePathsFromApp,
  requireAstroSitePaths,
  type AstroSitePaths,
} from "@warpgogol/site-kernel-astro";
```

### `AstroSitePaths` shape

| Field                     | Path                         |
| ------------------------- | ---------------------------- |
| `appDirectory`            | `<app>/`                     |
| `srcDirectory`            | `<app>/src/`                 |
| `publicDirectory`         | `<app>/public/`              |
| `contentDirectory`        | `<app>/src/content/`         |
| `contentPagesDirectory`   | `<app>/src/content/pages/`   |
| `stylesDirectory`         | `<app>/src/styles/`          |
| `iconsAssetsDirectory`    | `<app>/src/assets/icons/`    |
| `generatedIconsDirectory` | `packages/ui/src/icons/gen/` |

### Usage in a kernel command

```typescript
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";

export async function runMyCheck(input, context) {
  const paths = requireAstroSitePaths(context); // throws if no app in context
  // use paths.srcDirectory, paths.contentDirectory, etc.
}
```

`requireAstroSitePaths` throws a clear error when invoked without an app-scoped runtime context — use it inside commands that declare `scope: "app"`.

## Validation

```sh
pnpm --filter @warpgogol/site-kernel-astro build:check
```
