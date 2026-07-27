# Generator Contract (RFC-0143)

Build-time **file generators** project content/config from `src/content/system.md` into machine-readable files under `public/` during `build.prepare`. Astro then copies them verbatim to `dist/`. This document is the single contract every such generator follows so that thin sites stay standard and predictable as the set of generators grows.

Established generators: `sitemap.generate` (RFC-0049), `llms.generate` (RFC-0050 / RFC-0142), `ai.generate` (RFC-0051), `robots.generate` (RFC-0052).

> This is a **contract / convention, not a runtime registry.** The `STANDARD_BUILD_PREPARE_PIPELINE` (in `@gogol/site-kernel-checks`) plus the kernel command registry are the only registry. Do **not** add a generic `generators:` catalog to the manifest.

## Two config families

A generator's config belongs to exactly one family. Pick the right one:

| Family | Where it lives | Examples | Use when |
| --- | --- | --- | --- |
| **Per-page projection** | a key under `pages[].output` | `output.sitemap`, `output.llms` | the file is a projection of the page set, and each page may opt in/out or vary |
| **Site-wide policy** | a typed top-level block in `system.md` | `ai:`, `robots:` | the file expresses one declaration for the whole site |

These two surfaces are kept **separate and both typed**. Never fold a site-wide policy block under `output` (it is per-page), and never wrap policy blocks in a generic container.

### The `output` block is closed

`pages[].output` is a **closed** (`.strict`) object in `systemManifestSchema` ([`packages/ontology/src/schemas/system.ts`](../../../ontology/src/schemas/system.ts)). Only keys for known generators are accepted; unknown keys are a validation error. A new per-page generator **extends `pageOutputSchema`** in the same change that adds the generator — that schema edit is the intended, reviewed extension point. Per-page projection resolution is centralized in [`resolvePageOutput`](../../../share/src/semantic/output-projection.ts); never inline projection logic in a loader, command, or formatter.

## Contract — every file generator MUST

1. **Typed config** in one of the two families above, **formalized in `systemManifestSchema`**. No unvalidated extension fields.
2. A **pure formatter** in `@gogol/share` — no I/O.
3. A **command pair** `*.generate` + `*.validate` in `@gogol/site-kernel-checks`; `*.generate` is registered with `mutatesState: true`.
4. **Pipeline registration** in `STANDARD_BUILD_PREPARE_PIPELINE`.
5. A **safe default**: absent config yields valid output and unchanged bytes for pages/sites that do not opt in.

## Contract — every file generator MUST NOT

- Introduce a `src/pages/*` runtime route for the file (it is a static `public/` artifact).
- Introduce a config file outside `system.md`.
- Duplicate formatter logic inside the command (command stays thin: load → format → writeFile).

## Out of scope

**Codegen** generators (`routes`, `styles`, `icons`, `agents`, `biome.css`, `i18n.middleware`, `open-source`) are engineering-derived artifacts, not client-editable content projections. They are not governed by this contract.
