# `icons.generate`

Regenerates Astro icon components for `@warpgogol/ui` from the canonical LordIcon JSON assets.

## Command

Run from the repository root:

```bash
pnpm exec site-kernel run icons.generate
```

## What it does

1. Reads JSON files from `packages/ui/src/assets/icons/lordicon/`
2. Generates Astro components in `packages/ui/src/icons/gen/lordicon/`
3. Rebuilds `index.ts` export files for each icon set

## Output layout

```text
packages/ui/src/icons/gen/lordicon/
├── doodle-outline/
│   ├── index.ts
│   ├── a/
│   │   ├── arrow-down-icon.astro
│   │   ├── arrow-up-icon.astro
│   │   └── ...
│   ├── b/
│   └── ...
├── doodle-color/
├── doodle-black/
└── system-regular/
```

## When to run it

- after adding or removing JSON files in `packages/ui/src/assets/icons/lordicon/`
- after changing generation logic in `packages/os/site-kernel/src/icons/`
- before validating apps that depend on newly added icon exports

## Registration model

`icons.generate` is registered at the workspace level in the repository root `tools/kernel.config.ts`.

Do not register this shared command separately in app-local `tools/kernel.config.ts` files unless the architecture intentionally changes.

## Consumer example

```astro
---
import { arrowUpIcon as ArrowUpIcon } from "@warpgogol/ui/icons/lordicon/doodle-outline";
---

<ArrowUpIcon size={24} color="primary" trigger="hover" />
```

## Maintenance notes

- Treat `packages/ui/src/assets/icons/lordicon/**` as editable source.
- Treat `packages/ui/src/icons/gen/**` as derived output.
- Keep this document, `packages/ui/README.md`, and relevant `AGENTS.md` files aligned when the workflow changes.
