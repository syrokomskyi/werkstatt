# Site Kernel Astro Adapter Guide

This file defines the package-specific instruction layer for `packages/os/site-kernel-astro`.

## Package role

- `@gogol/site-kernel-astro` is the Astro-specific adapter layer on top of `@gogol/site-kernel`.
- Keep this package thin and focused on Astro site conventions that are intentionally shared.
- Do not move app-specific business rules into this adapter.

## Implementation rules

- Keep exported helpers explicit about which Astro site layout they assume.
- Prefer path helpers and adapter utilities over hidden side effects.
- When broadening the adapter contract, make sure the abstraction is truly cross-app and not only `apps/main`-specific.

## Validation

- Run `pnpm --filter @gogol/site-kernel-astro build:check` after type or API changes.
- If adapter changes affect consuming apps, validate the affected packages first and then the relevant apps.
