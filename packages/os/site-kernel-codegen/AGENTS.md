# @warpgogol/site-kernel-codegen

File generation commands for all Astro sites in `apps/*`.

## What lives here

| Module | Exports |
| --- | --- |
| `src/service.ts` | `runGenerateIcons`, `runCleanIcons` |
| `src/open-source-page.ts` | `runGenerateOpenSourcePage`, `openSourceLabelsSchema`, `loadOpenSourceLabels`, `normalizeLicense`, `detectLicenseConflict`, `classifyPackage`, `deduplicatePackages`, `buildCycloneDxSbom`, `openSourceRegistryDataSchema` (RFC-0489) |
| `src/compass-backfill.ts` | `runCompassAnchorBackfill` |
| `src/app-boilerplate.ts` | App boilerplate generators (`runGenerateOverlayPages`, `runGenerateRoutes`, etc.) |
| `src/generated-marker.ts` | `GENERATED_MARKER`, `hasGeneratedMarker` (re-export from `@warpgogol/site-kernel`) |
| `src/material-metadata-write.ts` | `runMaterialMetadataWrite` (RFC-0528) |

## Commands

| Command name | Function | What it does |
| --- | --- | --- |
| `icons.generate` | `runGenerateIcons` | Generate `.astro` icon wrappers from JSON assets; skips if no assets found |
| `icons.clean` | `runCleanIcons` | Remove all generated icon wrappers |
| `open-source.generate` | `runGenerateOpenSourcePage` | Generate open-source page, prose, registry JSON, SBOM (CycloneDX 1.5), and downloadable artifacts (THIRD_PARTY_NOTICES.txt, THIRD_PARTY_LICENSES.txt, sbom.cdx.json) from pnpm license data. i18n-aware via `openSourceLabelsSchema`. Fingerprint-cached (RFC-0489) |
| `content.ref-index.generate` | `runContentRefIndexGenerate` | Scan `src/content/**/*.md`, parse frontmatter, and write `src/content-ref-index.generated.yaml` (RFC-0527). Idempotent. |
| `material.metadata.write` | `runMaterialMetadataWrite` | Write IPTC/XMP metadata (title, copyright, creator, artist, comment, WebStatement, encoder) into derived image/video variants from manifests. Uses MaterialCredit sidecars with content reference resolution and SemanticSiteProfile fallback. Gracefully skips when exiftool is unavailable (RFC-0528). |

## Rules

- All functions follow the `(input: KernelCommandInput, context: KernelRuntimeContext)` signature.
- Path resolution for Astro sites goes through `requireAstroSitePaths(context)`.
- No app-specific business logic here.
- Files in `apps/*` that carry the `GENERATED` marker are outputs, not editable sources. When an app route, middleware, `env.d.ts`, `content.config.ts`, stylesheet, or generated AGENTS file must change, edit the owning template or generator in this package first, then re-run the owning command.
- `runGenerateRoutes` is the canonical owner of `apps/*/src/pages/index.astro`, `apps/*/src/pages/[lang]/[...slug].astro`, `apps/*/src/middleware.ts`, `apps/*/src/middleware/retired-tombstones.ts`, `apps/*/src/content.config.ts`, and `apps/*/src/env.d.ts`. Do not keep duplicate route templates in other packages.
- For route boilerplate, the canonical template is `src/templates/app-boilerplate/src/pages/[lang]/[...slug].template.astro`. If you need to change the generated catch-all route behavior, change that file and then run `pnpm exec site-kernel run routes.generate --site=<id>`.
- **410 Gone tombstones (RFC-0589)**: 410 status codes are not supported in `_redirects` for Cloudflare Workers. `buildRetiredPageRoutesBlock` only emits 301 entries to `_redirects`; 410 tombstones are handled by `src/middleware/retired-tombstones.ts` (generated from `retiredRoutes` entries with `status: 410`). The `retiredRoutes` schema in `system.md` still includes 410 as a valid status — the change is in how it's emitted, not the schema.
- **Astro middleware chaining**: when a generated `src/middleware.ts` chains multiple middleware handlers, use `sequence()` from `astro:middleware` — the array syntax `[m1, m2]` does NOT work correctly. Always `import { sequence } from "astro:middleware"` and `export const onRequest = sequence(m1, m2)`.
- **Path resolution in templates**: generated middleware/config files that load content at module level MUST use `import.meta.url`-based path resolution (`dirname(fileURLToPath(import.meta.url))`), not hardcoded relative paths like `"src/content"`. Relative paths break when the dev server's CWD differs from the site root.
- **Declared output paths helper (RFC-0599)**: generators with a fingerprint cache short-circuit MUST centralize their declared output paths in a `buildDeclaredOutputPaths`-style helper function. The helper is the single source of truth used by both the completeness check and the write section. This prevents drift when a new output file is added to the write section but not to the check. The helper's paths must match `GENERATOR_OWNERSHIP_MAP` in `site-kernel-checks/src/generator-ownership.ts`.
- **Strict schema changes require generated file updates**: when removing a field from a `.strict()` Zod schema (e.g. `openSourceRegistryDataSchema`), the already-generated JSON output files in the active mission workpiece must also be manually updated to remove the field. Otherwise the strict validation rejects the stale generated JSON at runtime. The generator will produce correct output on the next `open-source.generate` run, but until then the dev server serves the stale file.
- **dryRun mode for drift validation (RFC-0601)**: generators SHOULD support `dryRun: true` in `KernelRuntimeContext`. When `dryRun` is true, the handler renders output in memory, suppresses all side effects (no file writes, no cache updates, no network requests), and returns rendered content in `data.renderedFiles: { [path: string]: string }`. `dryRun` output MUST be byte-identical to normal mode (after line-ending normalization). Generators without `dryRun` support are skipped by `generated.drift.validate` with a DRIFT-02 info diagnostic — add `dryRun` incrementally, starting with simple generators.

## RFC-0087 invariants (content-driven generation contract)

Three rules that every generator in this package must satisfy:

1. **Single owner** — every generated file under `apps/<id>/` must be written by exactly one kernel command. The `generator.ownership.lint` check in `@warpgogol/site-kernel-checks` enforces this via a static ownership map. When adding a new generator, register all its output paths in `GENERATOR_OWNERSHIP_MAP` (in `site-kernel-checks/src/generator-ownership.ts`).
2. **Content-driven** — generator output must derive from `src/content/system.md` properties (routes, domain, languages, biome). No hardcoded constants or separate config files. Use `getDomainFromManifest()` for the canonical domain, `getSupportedLanguages()` / `getDefaultLanguage()` for i18n, and `getBiomeDisplayName()` for the biome.
3. **Idempotent** — re-running any generator must produce identical output. The `writeManagedFile()` function enforces this: identical content returns `"unchanged"` (0 file writes). Files without the `GENERATED_MARKER` are skipped to preserve project-specific edits. Verify with `pnpm --filter @warpgogol/site-kernel-codegen test`.
