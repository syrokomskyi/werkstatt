# @warpgogol/site-kernel-codegen

Code generation commands for all Warpgogol Astro apps: LordIcon wrappers, open-source page, biome CSS, and content reference tooling.

## Commands

| Command | Function | What it does |
| --- | --- | --- |
| `icons.generate` | `runGenerateIcons` | Generate `.astro` icon wrapper components from JSON assets in `src/assets/icons/lordicon/`; skips silently if no assets found |
| `icons.clean` | `runCleanIcons` | Remove all generated icon wrappers from `packages/ui/src/icons/gen/` |
| `open-source.generate` | `runGenerateOpenSourcePage` | Generate `open-source.md` from pnpm license data; fingerprint-cached (skips if unchanged). Supports `--show-versions` to include package versions (default: hidden) |
| `biome.css.generate` | `runBiomeCssGenerate` | Generate layered biome-scoped CSS custom property overrides from RFC-0071 biome YAML + app `src/content/system.md` |

## Usage

```sh
# From workspace root
pnpm exec site-kernel run icons.generate --site my-app
pnpm exec site-kernel run open-source.generate --site my-app
pnpm exec site-kernel run open-source.generate --site my-app -- --show-versions
```

## Compass header management

Compass header management (generate, update, audit, cleanup) is handled by the `fo-compass-annotate` Forge skill (RFC-0538). The former `compass.annotate`, `compass.clear`, `compass.markup.migrate`, and `compass.invariant.add` kernel commands have been removed.

## Validation

```sh
pnpm --filter @warpgogol/site-kernel-codegen build:check
```
