---
rfcId: RFC-0603
auditId: AUDIT-RFC-0603-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0603

## Verdict: Needs revision

The RFC's Context section factually misrepresents the current rendering pipeline (claims a headless browser is in use; the code already uses `sharp` SVG-to-PNG), the File system responsibilities table cites wrong package paths (`site-kernel-codegen` instead of `site-kernel-checks`), and the proposed `sharp` API usage (`.withMetadata()`) would ADD metadata rather than strip it. The RFC needs a grounded rewrite of Context, Design, and File system responsibilities before implementation.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Context is factually wrong.** The RFC states (line 87): "The current `preview.images.generate` command (RFC-0150) uses a headless browser or canvas-based rendering pipeline." The actual code at `packages/os/site-kernel-checks/src/preview-templates.ts:131-139` already uses `sharp` with SVG input — exactly the approach the RFC proposes as the fix. There is no headless browser, no Puppeteer, no Playwright in the preview image pipeline. The RFC's problem analysis (four sources of non-determinism: font rendering, PNG metadata, color profile, element positioning) needs to be re-grounded in what `sharp` actually does.

- **File system responsibilities table — wrong paths.** The table cites:
  - `packages/os/site-kernel-codegen/src/preview-images.ts` — does not exist. The actual file is `packages/os/site-kernel-checks/src/preview-images.ts`.
  - `packages/os/site-kernel-codegen/src/templates/preview/` — does not exist. The actual file is `packages/os/site-kernel-checks/src/preview-templates.ts` (single file, not a directory).
  - Only `public/preview/{lang}/{slug}.png` is correct.

- **TypeScript contract is trivially unhelpful.** `PreviewRenderOptions` (lines 137-143) is `{ width: 1200; height: 630; format: "png"; deterministic: true }` — hardcoded constants with a boolean that's always true. This doesn't guide implementation. A useful contract would define the rendering options that affect determinism: `compressionLevel`, `adaptiveFiltering`, `density`, `colorspace`, `forceNormalize`.

- **Output format not documented.** The RFC doesn't show the `--json` output shape. The existing command already has a JSON output (`data.items[]`, `data.summary`), but since the RFC changes the command internals, it should confirm the output shape is unchanged or document the delta.

- **Acceptance criterion "Unit test verifies byte-level determinism"** (line 189) is vague — what sample input? How is the test structured (render twice, compare buffers)? The vitest config in `packages/os/site-kernel-checks` requires tests under `src/tests/` (not colocated with source).

## Axis B — DNA alignment

- **DNA-18 connection is weak but consistent with siblings.** DNA-18 text (line 81-83 of `docs/architecture-dna.md`) is about "Uni registry is the single UI index" — machine-generated, never hand-edited, drift fails build.check. It does not mention binary file determinism as a general principle. The RFC says it "extends the determinism principle to binary generated files" — this is a stretch. However, RFC-0601 and RFC-0602 use the same `satisfies: [DNA-18]` with identical "extends the determinism principle" language, so this is an established pattern. Not blocking, but the author should consider whether a new DNA invariant for "generated file determinism" is warranted given the cluster of RFCs (0601, 0602, 0603) all citing DNA-18 for the same purpose.

## Axis C — Ecosystem fit

- **packagesImpacted is wrong.** Lists `@warpgogol/site-kernel-codegen` first, but the codegen package contains zero preview image code. All preview image logic lives in `@warpgogol/site-kernel-checks` (`preview-images.ts`, `preview-templates.ts`, command registration in `command-tables/01-codegen.ts:195`). The `packagesImpacted` array should be `["@warpgogol/site-kernel-checks"]` only.

- **Generator ownership gap not addressed.** `GENERATOR_OWNERSHIP_MAP` (`packages/os/site-kernel-checks/src/generator-ownership.ts:376-382`) only registers `public/og-image.png` under `preview.images.generate`. The per-page `public/preview/{lang}/{slug}.png` files are NOT in the ownership map. This means RFC-0601 (`generated.drift.validate`) cannot check per-page preview images even after this RFC makes them deterministic. The RFC should either add these paths to the ownership map or acknowledge this gap.

- **Pipeline placement** — correct. `preview.images.generate` is in `build.prepare` (`build-prepare.ts:89`), and the RFC confirms "No change — `preview.images.generate` remains in `build.prepare`." ✓

- **Command lifecycle** — `commands.changed: [preview.images.generate]` is correct. No new commands proposed. ✓

## Axis D — Forward-only compliance

No issues. The fix replaces the rendering pipeline directly — no compatibility shim, no dual-path, no deprecation grace period. ✓

## Axis E — Agent-facing policy

- **Status gate** — correct. Implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." ✓

- **Missing reference to RFC-0345.** The acceptance criterion "writeFileIfChanged skips writes for unchanged preview images" (line 188) requires changing `writeFile` to `writeFileIfChanged` in `preview-images.ts`. The current code uses raw `writeFile` from `node:fs/promises` (`preview-images.ts:17`). The RFC doesn't mention this change in the Design section — only in the acceptance criteria. The implementation notes should reference RFC-0345 (idempotent file writes) since `writeFileIfChanged` is its primitive.

## Axis F — Pragmatism

- **resvg vs sharp — insufficient justification.** The RFC proposes switching to `@resvg/resvg-js` (line 130) but the current code already uses `sharp` with SVG input. The RFC doesn't explain why `sharp`'s SVG rendering is non-deterministic. The likely sources of non-determinism in the current `sharp` pipeline are: (1) `adaptiveFiltering: true` (`preview-templates.ts:137`) which selects per-row filter strategies, (2) system font availability (the SVG uses `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, ...` — system-dependent), (3) possibly `density: 144` interaction with `resize`. The RFC should first try fixing `sharp` options (disable `adaptiveFiltering`, set `palette: false`, use `forceFilter: 5` or similar) before adding a new dependency. Per the ecosystem preference for existing packages, if `sharp` can achieve determinism with option changes, that's preferable to adding `@resvg/resvg-js`.

- **sharp `.withMetadata()` API misuse.** The RFC proposes (line 126): `sharp(imageBuffer).png({ compressionLevel: 9 }).withMetadata({ exif: false, icc: false })`. In sharp's API, `.withMetadata()` ADDS metadata to the output — it does not strip it. Calling `.withMetadata({ exif: false, icc: false })` preserves other metadata chunks while dropping EXIF/ICC. To strip ALL metadata, simply do NOT call `.withMetadata()` at all — sharp strips metadata by default. The current code (`preview-templates.ts:133-138`) already doesn't call `.withMetadata()`, so metadata is already stripped. This proposal is both unnecessary and based on a misunderstanding of the API.

- **Font bundling contradicts nonGoals.** The RFC says (line 198): "Fonts MUST be loaded via Fontsource (already a project dependency)." But the current SVG template uses system font stacks (`-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif` — `preview-templates.ts:93`). Switching to Fontsource fonts would change the visual appearance of preview images, directly contradicting nonGoal: "Do not change the visual appearance of preview images" (line 59). The RFC must resolve this contradiction — either drop the Fontsource requirement or acknowledge that visual appearance will change.

## Axis G — Blind spots

- **`--force-normalize` flag not addressed.** The current `preview.images.generate` command has a `--force-normalize` flag (`preview-images.ts:210`) that re-renders existing cards when source text carries normalization signals. The RFC doesn't mention how this flag interacts with the deterministic pipeline. Does `--force-normalize` still work? Does it produce deterministic output?

- **`adaptiveFiltering: true` not addressed.** The current code uses `adaptiveFiltering: true, effort: 10` (`preview-templates.ts:137`). `adaptiveFiltering` selects different PNG filter strategies per-row based on content analysis. While this should be deterministic for identical input, it's a potential source of cross-platform differences (different libvips builds may choose different filters). The RFC should address whether to disable it.

- **`resize` call is redundant.** The current code renders an SVG at `width=1200, height=630` (the SVG's native viewBox), then calls `.resize(1200, 630, { fit: "fill" })` (`preview-templates.ts:135-136`). This resize is a no-op in terms of dimensions but may introduce a second pass through the image processing pipeline. Removing it would simplify the pipeline and eliminate a potential source of non-determinism.

- **Cross-platform determinism acknowledged but not quantified.** The RFC says "CI runs on Linux" (line 155) but doesn't estimate how often developers run `build.prepare` locally on macOS/Windows and whether they'll see preview image churn. The `generated.stale.validate` (RFC-0600) and `generated.drift.validate` (RFC-0601) RFCs assume generated files are committed — if developers can't commit preview images from their machines, the workflow needs to be explicit.

- **No mention of `public/og-image.png` ultimate fallback.** The RFC focuses on `public/preview/{lang}/{slug}.png` but the command also generates `public/og-image.png` (the ultimate fallback). The same determinism fixes apply to it, but the File system responsibilities table only lists `public/preview/`.

## Questions for the author

1. The current pipeline already uses `sharp` SVG-to-PNG (not a headless browser). What specific `sharp` option or behavior have you observed producing non-deterministic output? Have you tested disabling `adaptiveFiltering` and removing the redundant `resize` call before proposing a switch to `@resvg/resvg-js`?

2. The File system responsibilities table cites `packages/os/site-kernel-codegen/src/preview-images.ts` and `packages/os/site-kernel-codegen/src/templates/preview/` — these paths don't exist. The actual files are `packages/os/site-kernel-checks/src/preview-images.ts` and `packages/os/site-kernel-checks/src/preview-templates.ts`. Should `packagesImpacted` and the table be corrected to reference `site-kernel-checks` only?

3. The RFC says "Fonts MUST be loaded via Fontsource" but also "Do not change the visual appearance." The current SVG uses system font stacks. Switching to Fontsource fonts will change the appearance. Which requirement takes priority — or should the Fontsource requirement be dropped in favor of keeping system fonts (which are deterministic on the same platform)?

4. The acceptance criterion "writeFileIfChanged skips writes for unchanged preview images" requires changing `writeFile` to `writeFileIfChanged` in `preview-images.ts` (currently uses raw `writeFile` at lines 270, 309, 383, 440). This change is not mentioned in the Design section. Should it be added, and should RFC-0345 be referenced?

5. `public/preview/{lang}/{slug}.png` files are not registered in `GENERATOR_OWNERSHIP_MAP` — only `public/og-image.png` is. Should this RFC add them so that RFC-0601 (`generated.drift.validate`) can check per-page preview images for drift?
