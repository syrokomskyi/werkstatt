# Section-framework token contract

This is the catalogue of `--ds-*` design-system tokens consumed by the canonical RFC-0101..RFC-0106 section framework. It is enforced statically by:

- **`tokens.colors.section-shell.lint`** (RFC-0122) — no raw `#hex` / `rgb()` / `hsl()` in the scoped CSS.
- **`tokens.section-shell.contract.validate`** (RFC-0124) — every `--ds-*` reference resolves through `@warpgogol/tokens` `TOKEN_NAME_SET`.

Both validators run in `packages-check.run`. Their scope is identical: the eight canonical section-framework component directories under `packages/ui/src/components/`:

```
section-shell/      section-header/     section-body/**     section-cta/
section-cta-group/  section-image/                      site-background/
```

## Why a contract document, not a hand-maintained list

The actual list of consumed tokens is **derived from the code at validate time** (RFC-0124's `TOKEN_REF_REGEX` walks the seven directories). This document categorises the tokens for human readers; if a category grows or shrinks, regenerate the catalogue by re-running the regex.

To refresh:

```bash
grep -rhoE -- '--ds-[a-zA-Z0-9_-]+' \
  packages/ui/src/components/{section-shell,section-header,section-body,section-cta,section-cta-group,section-image,site-background} \
  | sort -u
```

## Categories of tokens consumed (snapshot — 2026-05-28)

### Color tokens

Surface, text, brand, status:

- `--ds-color-bg`, `--ds-color-surface`
- `--ds-color-text`, `--ds-color-text-inverse`, `--ds-color-text-muted`, `--ds-color-text-quiet`
- `--ds-color-primary`, `--ds-color-accent`, `--ds-color-accent-soft`
- `--ds-color-cta`, `--ds-color-cta-hover`, `--ds-color-cta-text`
- `--ds-color-success`, `--ds-color-warning-strong`, `--ds-color-danger`, `--ds-color-danger-bright`
- `--ds-color-border`, `--ds-color-border-glass`
- `--ds-color-card-bg`, `--ds-color-card-border`

### Spacing and sizing

- `--ds-space-1` … `--ds-space-6`
- `--ds-size-section-padding-x`, `--ds-size-section-padding-y`
- `--ds-size-container-max`, `--ds-size-container-narrow`

### Border, radius, shadow

- `--ds-border-2`, `--ds-border-3`
- `--ds-radius-sm`, `--ds-radius-sm-plus`, `--ds-radius-2`, `--ds-radius-pill`
- `--ds-shadow-md`, `--ds-shadow-glass`

### Typography

- `--ds-font-body`, `--ds-font-heading`, `--ds-font-mono`
- `--ds-text-sm`, `--ds-text-sm-80`, `--ds-text-base`, `--ds-text-base-plus`, `--ds-text-2xl`, `--ds-text-3`, `--ds-text-3xl`
- `--ds-line-height-lg`, `--ds-line-height-xl`, `--ds-line-height-heading`
- `--ds-tracking-md`

### Motion and z-order

- `--ds-duration-fast`, `--ds-ease-standard`
- `--ds-z-base`, `--ds-z-behind`

### Texture

- `--ds-image-texture-noise`

## Rules for new section-framework primitives

1. **Reference only tokens declared in `packages/tokens/src/tokens.css`.** If you need a new colour, scale step, or motion duration, add it there first — biomes can then override it per RFC-0025/RFC-0098.
2. **Never introduce a raw colour literal** in the seven scoped directories. Use `var(--ds-color-*)` or `color-mix(in srgb, var(--ds-color-*), ...)`.
3. **Biome overrides are deltas, not replacements.** A biome can change `--ds-color-primary`'s value but cannot remove the declaration. The base sheet is the single source of truth for _which_ tokens exist; biomes decide _what they look like_.
4. **Dynamic suffix concatenation is allowed.** Patterns like `var(--ds-color-${tone})` are skipped by `tokens.section-shell.contract.validate`'s prefix heuristic — only fully formed token references are checked.
