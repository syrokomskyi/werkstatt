---
id: RFC-0528
title: "Embed metadata into derived media files from semantic profiles and material credits"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-25
updatedAt: 2026-07-25
enhancedAt: 2026-07-25
implementedAt: 2026-07-25
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0226
  - RFC-0210
  - RFC-0234
  - RFC-0525
amendedBy: []
related:
  - RFC-0226
  - RFC-0220
  - RFC-0527
  - RFC-0529
satisfies: []
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - material.metadata.write
    - material.metadata.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
successSignals:
  - "Every derived media file in public/_video/ and public/_img/ carries embedded metadata (copyright, creator, title, license URL) sourced from MaterialCredit sidecars and SemanticSiteProfile fallback — no second source of truth."
  - "material.metadata.write runs after all variant generators in build-prepare and finds derived files through variant manifests, not by scanning dist/."
  - "material.metadata.validate confirms embedded metadata presence in public/ files before Astro build copies them to dist/."
  - "Credits sidecars use content references (braceless, via RFC-0527) to pull names and legal data from PBP entities — zero duplication."
nonGoals:
  - "Does not build the content reference index — that is RFC-0527."
  - "Does not migrate content references — that is RFC-0529."
  - "Does not change video/image encoding pipelines — metadata is embedded post-encoding, not during encoding."
  - "Does not embed metadata into HLS segments, caption files, or authored source masters."
  - "Does not change runtime playback, URL schema, or JSON-LD output."
  - "Does not create an audio encoding pipeline — audio support is reserved for when a pipeline exists."
---

# RFC-0528: Embed metadata into derived media files from semantic profiles and material credits

## Context

RFC-0226 established `material.metadata.write` and `material.metadata.validate` as build-time commands that embed IPTC/XMP rights and C2PA manifests into generated media variants from `*.credits.yaml` sidecar records. The implementation is partial:

- **Pipeline position bug.** `material.metadata.write` runs in `build-prepare` at line 67 — before `image.variants.generate` (line 97), `video.variants.generate` (line 99), and `live.variants.generate` (line 101). The derived files it should process do not exist yet.

- **File discovery bug.** The command searches `dist/_astro/` for files matching `credit.target.id` by basename. But `dist/` does not exist before Astro build, and derived files live in `public/_video/` and `public/_img/`, not `dist/_astro/`.

- **No SemanticSiteProfile fallback.** Files without a `MaterialCredit` sidecar get no metadata at all. Every derived file should carry at least organizational copyright.

- **No content reference resolution.** `.credits.yaml` sidecars cannot reference PBP entity fields (people names, legal names) without duplicating data. RFC-0527 + RFC-0529 solve this; RFC-0528 consumes the resolved credits.

## Problem

Three structural issues prevent the current `material.metadata.write` from working:

1. **Timing.** The command runs before the variant generators that produce the files it should process. By the time `material.metadata.write` executes, `public/_video/` and `public/_img/` are empty or non-existent.

2. **Discovery.** The command guesses file locations by basename in `dist/_astro/`. This fails for video files (in `public/_video/<lang>/<token>/`), image variants (in `public/_img/<hash>/<width>.webp`), and live photo clips (in `public/_video/live/<lang>/<token>/`). Variant manifests already contain exact file paths — the command should read them.

3. **Coverage gap.** Only files with `MaterialCredit` sidecars get metadata. Files without sidecars (e.g. poster images, OG images, uncited illustrations) get nothing. The organizational copyright from `SemanticSiteProfile` should be the universal fallback.

## Decision

### 1. Pipeline repositioning

Move `material.metadata.write` from its current position (line 67, before variant generators) to after all variant generators:

```
build-prepare pipeline (updated order):
  ...
  content.ref-index.generate          ← RFC-0527 (new, first)
  ...
  material.credits.generate
  ...
  image.variants.generate             ← line 97 (unchanged)
  video.variants.generate             ← line 99 (unchanged)
  live.variants.generate              ← line 101 (unchanged)
  material.metadata.write             ← MOVED here (after all variants)
  manifest.contract.validate          ← line 103 (unchanged)
  ...
```

All derived media files exist in `public/` at this point. `exiftool` writes metadata directly into `public/` files. Astro build then copies `public/` → `dist/` with metadata already embedded.

### 2. Manifest-based file discovery

`material.metadata.write` reads three variant manifests to discover derived files:

| Manifest | Location | Files referenced |
| --- | --- | --- |
| `video-manifest.generated.yaml` | `src/video-manifest.generated.yaml` | `public/_video/<lang>/<token>/progressive.h264.mp4`, `.vp9.webm`, `.av1.webm`, `poster.webp` |
| `live-video-manifest.generated.yaml` | `src/live-video-manifest.generated.yaml` | `public/_video/live/<lang>/<token>/progressive.h264.mp4`, `.vp9.webm` |
| `image-variants.generated.yaml` | `src/image-variants.generated.yaml` | `public/_img/<hash>/<width>.webp` (all width variants) |

For each file in the manifest:

1. Determine the media token (from manifest entry key or path).
2. Look up `MaterialCredit` by `target.kind` + `target.id` (token) in the resolved credits map.
3. If credit found — use credit fields (creator, copyright notice, license URL, title).
4. If no credit — use `SemanticSiteProfile` fallback.
5. Embed metadata via `exiftool`.

**HLS segments** (`*.ts`, `*.m3u8`) are skipped — they are transport segments, not standalone media files, and do not carry IPTC/XMP metadata.

### 3. Metadata tag mapping

| Tag | Source: MaterialCredit | Source: SemanticSiteProfile (fallback) |
| --- | --- | --- |
| `title` | `credit.title` | `<brandName> — <token> (<lang>)` |
| `copyright` | `credit.license.copyrightNotice` | `© <year> <legalName>` (or `brandName` if no legal name) |
| `creator` | `credit.parties[]` where role is `creator` or `coCreator` — join names | `representativeName` (if available) |
| `artist` | `credit.parties[]` where role is `creator` or `rightsHolder` — first match | `representativeName` (if available) |
| `comment` | `credit.license.acquireLicensePage` or credits page URL | `organization.url` |
| `WebStatement` | `credit.license.url` | `organization.url` |
| `encoder` | `WGogol/<ENCODER_SETTINGS_VERSION>` (constant) | same |

### 4. SemanticSiteProfile fallback

`material.metadata.write` loads the semantic site model via `loadSemanticSiteModel` from `@gogol/site-kernel-content` (already exported from the package's public API) and extracts the `organization` field. The organization provides:

- `organization.name` (brand name)
- `organization.legalName`
- `organization.url`
- `organization.representative` (string, if available)

For files without a `MaterialCredit` sidecar, the fallback ensures every derived file carries at least:

- `© <year> <legalName>` as copyright
- `organization.url` as comment/WebStatement
- `<brandName> — <token> (<lang>)` as title

### 5. Content reference resolution integration

`.credits.yaml` sidecars may contain braceless content references (via RFC-0527 + RFC-0529). Before looking up credit fields, `material.metadata.write` resolves references through the content reference index:

```typescript
const index = loadContentRefIndex(indexPath);
const resolvedCredits = resolveReferencesDeep(index, rawCreditRecord, lang, defaultLang);
const credit = materialCreditSchema.parse(resolvedCredits);
```

This allows sidecars like:

```yaml
parties:
  - role: creator
    name: people.andrii-syrokomskyi.name
    kind: Person
  - role: rightsHolder
    name: business.legal.companyName
    kind: Organization
license:
  copyrightNotice: "© 2026 business.legal.companyName"
  url: business.legal.url
```

### 6. Validator update

`material.metadata.validate` is updated to:

- Read variant manifests (same as `material.metadata.write`) to discover files in `public/`.
- For each file with a `MaterialCredit` sidecar: verify IPTC/XMP fields match the credit record.
- For each file without a sidecar: verify organizational copyright is present.
- Report `META-01` (missing copyright), `META-02` (missing creator when credit has one), `META-03` (mismatched copyright notice), `META-04` (missing license URL when credit has one).
- Graceful skip when `exiftool` is unavailable (same as `material.metadata.write`).

### 7. Embedding mechanism

**exiftool batching.** For sites with many derived variants (potentially 200+ files), calling exiftool once per file adds significant build time (~100-300ms per process spawn). The implementation SHOULD batch files by media type and call exiftool with multiple file paths in a single invocation (`exiftool -overwrite_original <tags> file1 file2 ...`). This reduces process spawn overhead by an order of magnitude. If batching is not possible for a specific tag combination, parallel execution with a concurrency limit (e.g. 4 concurrent exiftool processes) is an acceptable alternative.

**Empty manifests.** When variant manifests are empty (new site with no videos or images), `material.metadata.write` reports a pass with zero files processed — not a skip. This is distinct from the exiftool-unavailable skip.

**exiftool** remains the embedding tool for all media types:

- **Video (MP4/WebM):** exiftool writes IPTC/XMP tags into the container.
- **Images (WebP):** exiftool writes EXIF/IPTC/XMP tags.
- **Posters (WebP):** same as images.

C2PA manifest attachment (from RFC-0226) is preserved but not expanded in this RFC — it remains a future phase behind env-gated signing keys.

## Architectural fit

- **RFC-0226 (embedded content credentials).** This RFC amends RFC-0226 by fixing the pipeline position, file discovery, and adding SemanticSiteProfile fallback. The core contract (build-time, idempotent, graceful skip) is preserved.
- **RFC-0210 (unified video playback contract).** This RFC amends RFC-0210 by adding metadata embedding to the video variant output files. The manifest schema and component architecture are unchanged.
- **RFC-0234 (living-photo pipeline).** This RFC amends RFC-0234 by adding metadata embedding to live photo variant outputs.
- **RFC-0525 (AV1 encoding pipeline).** This RFC amends RFC-0525 by adding metadata embedding to AV1 variant outputs.
- **RFC-0527 (content reference index).** This RFC is a consumer of the content reference index — it resolves references in `.credits.yaml` sidecars through the unified resolver.
- **RFC-0529 (braceless migration).** This RFC depends on RFC-0529 for resolved credits — sidecars use braceless references that are resolved before metadata embedding.
- **Layer C (external surfaces).** No impact — embedded metadata is inside binary files, not part of URL schema, JSON-LD, or sitemaps. No `Breaks-C: yes` required.

## Design

### Processing flow

```
material.metadata.write (after all variant generators):

1. Load SemanticSiteProfile (one call)
   ├── organization.name, legalName, url
   └── representative.name

2. Load content reference index (RFC-0527)
   └── ContentRefIndex object

3. Load and resolve all .credits.yaml sidecars
   ├── Collect all *.credits.yaml under src/content/
   ├── For each: parse YAML → resolveReferencesDeep(index, raw, lang, defaultLang)
   └── Build resolved credits map: { "kind:id": MaterialCredit }

4. Load variant manifests
   ├── video-manifest.generated.yaml
   ├── live-video-manifest.generated.yaml
   └── image-variants.generated.yaml

5. For each file in manifests:
   a. Extract token from manifest entry
   b. Look up MaterialCredit by target.kind + target.id
   c. If found: build metadata tags from credit fields
      If not found: build metadata tags from SemanticSiteProfile fallback
   d. Call exiftool with -overwrite_original to embed tags
   e. Count written/skipped

6. Report results
```

### exiftool command

```sh
exiftool \
  -overwrite_original \
  -Title="<title>" \
  -Copyright="<copyright>" \
  -Creator="<creator>" \
  -Artist="<artist>" \
  -Comment="<comment>" \
  -WebStatement="<url>" \
  -Encoder="WGogol/<version>" \
  "<file-path>"
```

## Compass synchronization

- **`docs/verification-plan.xml`** — update the `build-prepare` pipeline step list to reflect the new position of `material.metadata.write` (after `live.variants.generate`, before `manifest.contract.validate`).

## AGENTS.md updates

- **`packages/os/site-kernel-codegen/AGENTS.md`** (if present) or **`packages/AGENTS.md`** — update the `material.metadata.write` description to reflect manifest-based file discovery and `SemanticSiteProfile` fallback via `loadSemanticSiteModel`.
- **`packages/os/site-kernel-checks/AGENTS.md`** — update the `material.metadata.validate` description to reflect manifest-based discovery and `META-01` through `META-04` diagnostics.

## Rollout

1. **Move `material.metadata.write`** in `build-prepare` pipeline from line 67 to after `live.variants.generate` (line 101).
2. **Update `runMaterialMetadataWrite`** in `@gogol/site-kernel-codegen/material-metadata-write.ts`:
   - Replace `dist/_astro/` basename search with manifest-based file discovery.
   - Add `SemanticSiteProfile` loading and fallback.
   - Add content reference index loading and credit resolution.
   - Update exiftool tags to full mapping (title, copyright, creator, artist, comment, WebStatement, encoder).
3. **Update `runMaterialMetadataValidate`** in `@gogol/site-kernel-checks/material-metadata.ts`:
   - Replace `dist/` scanning with manifest-based file discovery.
   - Add fallback metadata verification.
   - Add `META-01` through `META-04` diagnostics.
4. **Register `material.metadata.write`** in `GENERATOR_OWNERSHIP_MAP` if not already present.
5. **Update `docs/verification-plan.xml`** to reflect the new pipeline position.
6. **Run `material.metadata.write`** on a site with exiftool available to verify embedding.
7. **Run `material.metadata.validate`** to verify embedded metadata.

## Alternatives considered

- **Embed during encoding (pass metadata to ffmpeg/sharp).** Rejected — this couples metadata embedding to the encoding pipeline, requiring every encoder to know about credits and profiles. Post-hoc embedding via exiftool is simpler, tool-agnostic, and works uniformly for all media types.

- **Post-build embedding (after Astro build, in dist/).** Rejected — embedding in `public/` before Astro build means metadata is preserved through the copy to `dist/`. Post-build embedding requires an additional pipeline step and risks missing files that Astro hashes or renames.

- **ffmpeg `-metadata` for video, exiftool for images.** Rejected — using exiftool for both is simpler and ensures consistent metadata format across media types. ffmpeg metadata tags are container-specific (MP4 vs WebM) and less standardized than IPTC/XMP.

- **Skip files without credits.** Rejected — every derived file should carry at least organizational copyright. The SemanticSiteProfile fallback ensures universal coverage without requiring a sidecar for every asset.

## Risks

- **exiftool availability.** Same as RFC-0226 — graceful skip when exiftool is not installed. The build does not fail.
- **Manifest staleness.** If variant generators fail or produce incomplete manifests, `material.metadata.write` may miss files. Mitigated by pipeline ordering — variant generators run before `material.metadata.write`, and `generated.files.validate` (line 108) catches missing generated files.
- **WebP metadata support.** exiftool can write EXIF/IPTC/XMP into WebP, but not all WebP readers honor these tags. This is a format limitation, not a bug — the metadata is present in the file regardless.
- **Content reference resolution failures.** If a `.credits.yaml` contains an unresolved reference, `content.ref-index.validate` (RFC-0527) catches it before `material.metadata.write` runs. The build fails early with a clear diagnostic.

## Acceptance criteria

- [x] `material.metadata.write` runs after `live.variants.generate` in `build-prepare` pipeline (evidence: packages/os/site-kernel-checks/src/pipelines/build-prepare.ts line 105)
- [x] `material.metadata.write` discovers derived files through variant manifests, not by scanning `dist/` (evidence: packages/os/site-kernel-codegen/src/material-metadata-write.ts collectManifestFiles reads video-manifest, live-video-manifest, image-variants manifests)
- [x] Files with `MaterialCredit` sidecars get embedded metadata from credit fields (title, copyright, creator, artist, comment, WebStatement) (evidence: material-metadata-write.ts buildCreditTags function lines 164-179)
- [x] Files without `MaterialCredit` sidecars get fallback metadata from `SemanticSiteProfile` (copyright, comment, title) (evidence: material-metadata-write.ts buildFallbackTags function lines 181-197)
- [x] `.credits.yaml` sidecars with content references are resolved through the content reference index before embedding (evidence: material-metadata-write.ts line 276 resolveReferencesDeep call)
- [x] HLS segments and caption files are skipped (evidence: material-metadata-write.ts SKIP_EXTENSIONS = .ts, .m3u8, .vtt; shouldSkipFile function line 98)
- [x] `material.metadata.validate` checks embedded metadata in `public/` files and reports `META-01` through `META-04` diagnostics (evidence: packages/os/site-kernel-checks/src/material-metadata.ts)
- [x] `material.metadata.write` gracefully skips when exiftool is unavailable (evidence: material-metadata-write.ts lines 239-251 toolchainAvailable check)
- [x] `material.metadata.validate` gracefully skips when exiftool is unavailable (evidence: material-metadata.ts graceful skip logic)
- [x] `ENCODER_SETTINGS_VERSION` or equivalent version string is embedded as the `encoder` tag (evidence: material-metadata-write.ts ENCODER_SETTINGS_VERSION = "WGogol/1.0" line 51, buildExiftoolArgs -Encoder flag line 207)
- [x] `rfc.validate` passes on this RFC file (evidence: rfc.validate reports zero RFC-0528-specific errors after manifest regeneration and criteria annotation)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- This RFC depends on RFC-0527 (content reference index) and RFC-0529 (braceless migration) being implemented first — the project is designed as a block of three RFCs.
- The `material.metadata.write` command MUST NOT modify authored source masters under `src/content/` — only derived files in `public/`.
- The `material.metadata.write` command MUST be idempotent — re-running with unchanged content and credits produces identical embedded metadata.
- exiftool is an optional build dependency — the command MUST degrade to a reported skip when it is unavailable.
- Do not embed metadata into HLS segments (`.ts`, `.m3u8`) or caption files (`.vtt`) — they are transport/track files, not standalone media.
- Audio pipeline support is reserved for a future RFC when an audio encoding pipeline exists — the `MaterialCredit` schema already supports `materialKind: "audio"`.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
