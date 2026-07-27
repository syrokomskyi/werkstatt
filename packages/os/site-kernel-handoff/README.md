# @gogol/site-kernel-handoff

RFC-0221 package for internal site handoff between developers who already have the WGogol ecosystem checked out.

This package provides the RFC-0221/RFC-0479 internal handoff surface:

- `handoff.validate` — validates a handoff bundle lock, manifest, and file hashes.
- `migrator.registry.validate` — validates the RFC-0479 migrator registry (id uniqueness, ordering, test coverage).
- `handoff.pack --site <app>` — writes a thin internal bundle containing authored site files, lock, manifest, provenance, and a golden `validation/` pack.
- `handoff.absorb --bundle <path>` — builds the version/capability catch-up report, refuses downgrades, then **materializes**: injects the authored set into `apps/<target>`, and delegates regeneration + validation to `build.prepare` / `build.check`.
- `mission.migrate --mission <id>` — applies pending RFC-0479 migrators to a mission workpiece.
- Helper APIs for ecosystem version comparison, capability diffing, bundle IO, migrator registry selection, and materialization.

### `handoff.absorb` flags

- `--report-only` — print the catch-up report and stop before any write.
- `--as <name>` — materialize under a different app name (safe / non-destructive).
- `--regen` — run `build.prepare` + `build.check` after injection (otherwise regeneration is delegated and the exact command is printed).
- `--force` — materialize even when the overall tier is **red** (red otherwise requires manual migration decisions and is refused).

### Authored partition

`handoff.pack` carries the **Compass-complete authored partition** (`packages/os/site-kernel-handoff/src/authored-set.ts`): code files are classified by the shared Compass inventory (`createCompassInventoryEntries`, which honours the RFC-0081 generated marker, `*.generated.*`, `dist/`, framework-config, etc.), and non-code data (content `.md`, `.json`/`.yaml`, public assets, root config) by the generated marker plus path rules — including the `build.prepare` public outputs (sitemap/robots/feed/llms/ai/pseo) that lack a marker. Everything else is excluded and regenerated on absorb.

### Golden validation pack

`handoff.pack` also emits `validation/pack.json` (route list, `sitemap.xml` hash, `llms.txt`/`llms-full.txt` hashes, passport scores) and `sitemap.snapshot.xml` from the app's build output (`validation-pack.ts`). After `handoff.absorb --regen` rebuilds the site, absorb diffs a freshly built pack against this golden one and reports any route/sitemap/llms/score drift — the "significant properties" check that the catch-up preserved the site.

### New-app materialization

When the target app does not exist, absorb materializes a complete skeleton: the bundle force-includes the bootstrap config (`package.json`, `astro.config.mjs`, `postcss.config.cjs` — template-synced files that carry the generated marker but are the app's identity and build config), so the injected layout is buildable. With `--regen`, a new app runs `pnpm install` (to register the workspace member) before `build.prepare` / `build.check`; `build.prepare`'s `kernel.wire` step regenerates the tool wiring and codegen reconstructs the derived surface.

> Remaining verification: the heavy from-scratch `--regen` run (install + astro build) has not been exercised in-session — the skeleton and the install ordering are verified, the full build run is the open follow-up.

## Commands

```sh
pnpm exec site-kernel run migrator.registry.validate
pnpm exec site-kernel run handoff.validate --bundle ../handoff/<app>
pnpm exec site-kernel run handoff.pack --site <app>
pnpm exec site-kernel run handoff.absorb --bundle ../handoff/<app> --report-only
pnpm exec site-kernel run handoff.absorb --bundle ../handoff/<app> --regen
pnpm --filter @gogol/site-kernel-handoff build:check
```

## Contract

- The bundle is a thin authored-site transfer unit, not a full exported workspace.
- `client.export` remains the external full-fork deliverable.
- Absorb/migrators are forward-only; downgrades are refused by the version-compare matrix.
- Generated files are disposable and must be regenerated on absorb, never treated as source of truth.
