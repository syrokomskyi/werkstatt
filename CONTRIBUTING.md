# Contributing

This repository is optimized for a high-signal workflow for both humans and AI assistants. The main goal is to keep behavior stable while iterating quickly.

## Prerequisites

- Node.js (recent LTS)
- pnpm

## Commands

- `pnpm dev`
  - Start the reference site dev server (`pnpm --filter warpgogol-com start`).
- `pnpm build`
  - Turbo build across all workspaces.
- `pnpm build:check`
  - Turbo type-check across all workspaces.
- `pnpm test`
  - Run vitest in CI-like mode (turbo).
- `pnpm check:all`
  - Turbo check across all workspaces.
- `pnpm lint:packages`
  - ESLint for `packages/**/*.ts` (includes `local-rules/no-as-any`).
- `pnpm format`
  - Prettier write across the repo.
- `pnpm format:check`
  - Prettier check (CI gate).
- `pnpm compass:validate`
  - Run Compass validation workspace-wide.
- `pnpm exec werkstatt run tokens.ds.lint`
  - Validate ultra-strict design token rule: only `--ds-*` CSS custom properties are allowed.
- `pnpm exec werkstatt run tokens.colors.lint`
  - Validate no raw colors in app CSS.

## Project invariants (do not break)

- Sites are Sternsystemen registered in `systems/registry.yaml`; the `apps/*` directory is retired (RFC-0381).
- Default language is served unprefixed; non-default languages live under `/<lang>/`.
- Interactive effects must be hydrated on demand and delayed to protect CWV.
- Ultra-strict design tokens: only `--ds-*` CSS custom properties are allowed.
- Cookies are permanently forbidden — `localStorage` only for client-side persistence.
- Use `pnpm` (not npm/yarn); 2 spaces indentation; imports at the top of the file.

## Coding conventions

- Use 2 spaces indentation.
- Keep imports at the top of the file.
- Prefer small, focused modules.
- When moving logic out of an entry file, keep the initialization order unchanged.
- Use `pnpm` for all package management and script execution.
- Use relative imports with `.ts` extensions in `packages/**/*.ts(x)` (RFC-0092).

## PR / Change checklist

### Correctness

- [ ] `pnpm build:check` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm lint:packages` passes.
- [ ] `pnpm exec werkstatt run tokens.ds.lint` passes.
- [ ] URL routing behavior is unchanged unless explicitly intended.

### Performance

- [ ] No new heavy dependencies imported from `.astro` components.
- [ ] Any new interactive feature follows the on-demand hydration pattern.

### i18n

- [ ] New user-facing strings are compatible with the `data-lid` based pipeline.
- [ ] Localized pages mirror default-language block structure (arrays are replaced wholesale, not deep-merged).

### Safety

- [ ] No secrets or tokens were committed.
- [ ] No logs print full keys/tokens.

### Maintainability

- [ ] Module responsibilities are clear.
- [ ] Public contracts (`data-*`, exported init functions) are stable.
