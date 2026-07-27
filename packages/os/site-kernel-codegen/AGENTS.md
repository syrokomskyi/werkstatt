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
- `runGenerateRoutes` is the canonical owner of `apps/*/src/pages/index.astro`, `apps/*/src/pages/[lang]/[...slug].astro`, `apps/*/src/middleware.ts`, `apps/*/src/content.config.ts`, and `apps/*/src/env.d.ts`. Do not keep duplicate route templates in other packages.
- For route boilerplate, the canonical template is `src/templates/app-boilerplate/src/pages/[lang]/[...slug].template.astro`. If you need to change the generated catch-all route behavior, change that file and then run `pnpm exec site-kernel run routes.generate --site=<id>`.

## RFC-0087 invariants (content-driven generation contract)

Three rules that every generator in this package must satisfy:

1. **Single owner** — every generated file under `apps/<id>/` must be written by exactly one kernel command. The `generator.ownership.lint` check in `@warpgogol/site-kernel-checks` enforces this via a static ownership map. When adding a new generator, register all its output paths in `GENERATOR_OWNERSHIP_MAP` (in `site-kernel-checks/src/generator-ownership.ts`).
2. **Content-driven** — generator output must derive from `src/content/system.md` properties (routes, domain, languages, biome). No hardcoded constants or separate config files. Use `getDomainFromManifest()` for the canonical domain, `getSupportedLanguages()` / `getDefaultLanguage()` for i18n, and `getBiomeDisplayName()` for the biome.
3. **Idempotent** — re-running any generator must produce identical output. The `writeManagedFile()` function enforces this: identical content returns `"unchanged"` (0 file writes). Files without the `GENERATED_MARKER` are skipped to preserve project-specific edits. Verify with `pnpm --filter @warpgogol/site-kernel-codegen test`.
