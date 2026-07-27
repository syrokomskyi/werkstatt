# @gogol/ui

Shared UI primitives and LordIcon assets for WGogol applications.

## Scope

`@gogol/ui` is a workspace package consumed by apps in `apps/*`.

It owns:

- shared section components (`src/sections/**`)
- shared UI primitives (`src/components/**`)
- the universal block renderer (`src/blocks-renderer.astro`)
- shared icon runtime primitives
- canonical LordIcon JSON assets
- generated Astro icon components
- internal shared modules for manifest loading, API route utilities, and prose rendering

It does not own app-local content, routes, or styling decisions.

## Usage

### Import a generated icon

```astro
---
import { arrowUpIcon as ArrowUpIcon } from "@gogol/ui/icons/lordicon/doodle-outline";
---

<ArrowUpIcon size={24} color="primary" trigger="hover" />
```

### Import the base component

```astro
---
import LordIconBase from "@gogol/ui/icons/lord-icon-base";
import type { LordIconProps } from "@gogol/ui/icons/lord-icon-types";
---
```

## Canonical file layout

```text
packages/ui/
├── src/
│   ├── assets/icons/lordicon/         # Canonical JSON sources
│   ├── icons/
│   │   ├── gen/lordicon/              # Generated Astro components
│   │   ├── lord-icon-base.astro
│   │   ├── lord-icon-types.ts
│   │   └── index.ts
│   ├── sections/                      # Shared section components
│   ├── components/                    # Shared UI primitives
│   ├── blocks-renderer.astro          # Universal block dispatcher
│   ├── generated-manifest-loader.ts   # Shared generated JSON manifest loader
│   ├── section-api-utils.ts           # Shared API route helpers (json, CALLBACK_PATH)
│   └── index.ts
├── AGENTS.md
├── ICONS_GENERATE.md
└── package.json
```

## Generation workflow

When JSON assets change, regenerate the derived icon components from the repository root:

```bash
pnpm exec site-kernel run icons.generate
```

The command:

1. Reads JSON files from `packages/ui/src/assets/icons/lordicon/`
2. Writes Astro components to `packages/ui/src/icons/gen/lordicon/`
3. Rebuilds set-level `index.ts` export files

The command is registered in the workspace root `tools/kernel.config.ts`.

## Consumer requirements

Apps should expose these TypeScript path mappings:

```json
{
  "compilerOptions": {
    "paths": {
      "@gogol/ui": ["../../packages/ui/src/index.ts"],
      "@gogol/ui/*": ["../../packages/ui/src/*"]
    }
  }
}
```

## Public import contract

- `@gogol/ui`
- `@gogol/ui/icons`
- `@gogol/ui/icons/lordicon/doodle-outline`
- `@gogol/ui/icons/lordicon/doodle-color`
- `@gogol/ui/icons/lordicon/doodle-black`
- `@gogol/ui/icons/lordicon/system-regular`
- `@gogol/ui/icons/lord-icon-base`
- `@gogol/ui/icons/lord-icon-types`

## Maintenance rules

- Edit JSON sources in `src/assets/icons/lordicon/**`.
- Do not hand-edit generated files in `src/icons/gen/**`.
- Keep documentation and exports synchronized when import paths or generation behavior change.
