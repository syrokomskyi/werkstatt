---
id: RFC-0890
title: "Raw website screenshot ingestion and archival for Nachweis evidence"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-20
updatedAt: 2026-08-20
enhancedAt: 2026-08-20
implementedAt: 2026-08-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0885
  - RFC-0886
  - RFC-0887
  - DNA-46
  - DNA-59
dependsOn:
  - RFC-0885
  - RFC-0886
batch: nachweis-screenshot-pipeline
satisfies:
  - DNA-46
  - DNA-59
versionBump: minor
commands:
  proposed:
    - nachweis.screenshot.ingest
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt
  - werkstatt-site
successSignals:
  - "nachweis.screenshot.ingest copies a raw screenshot from an external path into the cache clone and R2 private storage"
  - "EvidenceSource.websiteScreenshot.rawArtifact records the raw screenshot's SHA-256, dimensions, original filename, and capturedAt"
  - "capturedAt is extracted from CaptureX_YYYY-MM-DD_HHMMSS_domain.ext filename pattern"
  - "Raw screenshots are persisted in R2 private storage at {systemId}/screenshots/{slug}/raw/{filename}"
  - "Raw screenshots are copied to the cache clone at trust/evidence/screenshots/{slug}/raw/{filename} for local reprocessing"
  - "Re-ingesting the same file (same SHA-256) is idempotent — skips upload and Bordbuch append, returns existing rawArtifact metadata"
  - "ingest can run before upload — display fields (sha256, mediaType, storage) are optional when only rawArtifact is present"
nonGoals:
  - "Does not crop, resize, or convert the raw screenshot — that belongs to RFC-0891"
  - "Does not upload a public display variant to R2 — that belongs to RFC-0891"
  - "Does not generate screenshots — use external capture tooling (e.g. CaptureX)"
  - "Does not validate screenshot content quality or visual correctness"
  - "Does not modify the nachweis publication gate — raw archival is not gate-gated"
---

# RFC-0890: Raw website screenshot ingestion and archival for Nachweis evidence

## Context

RFC-0886 introduced `nachweis.screenshot.upload` — a command that uploads a pre-processed screenshot to R2 public storage and updates `EvidenceSource.websiteScreenshot`. RFC-0887 added the `capturedAt` field for UI display. The UI component (`nachweis-detail-component.astro`) renders the screenshot at 1280×720 (16:9).

The current workflow has a critical gap: **there is no mechanism to ingest and archive raw full-page screenshots**. Operators capture full-page screenshots using external tooling (e.g. CaptureX), which produces very tall images (e.g. 3708×27210px). These raw files live on external storage (Google Drive, local disk) that may be ephemeral. The operator needs a command that:

1. Copies the raw screenshot into the system for persistent archival (R2 private + cache clone local copy).
2. Extracts metadata (SHA-256, dimensions, capturedAt from filename).
3. Records the raw artifact reference on `EvidenceSource.websiteScreenshot`.

Without this, raw screenshots are at risk of loss, and the downstream processing step (RFC-0891) has no reliable source to work from.

## Problem

1. **No raw screenshot archival**: `nachweis.screenshot.upload` (RFC-0886) uploads a file to R2 public storage but does not preserve the original raw screenshot. If the operator provides a pre-cropped image, the raw original is lost.

2. **No capturedAt extraction**: The `capturedAt` field (RFC-0887) exists on `PbpWebsiteScreenshot` but no command populates it automatically. Operators must provide it manually.

3. **No raw artifact tracking**: `PbpWebsiteScreenshot` has no field to record that a raw original exists, where it is stored, or its dimensions. The schema only tracks a single screenshot artifact (the display variant).

4. **External file ephemerality**: Raw screenshots often live on Google Drive or other external storage. Links expire, drives get cleaned up. The system needs to copy these files into its own storage before they are lost.

## Decision

A new `nachweis.screenshot.ingest` command copies a raw screenshot from a local file path into both R2 private storage and the cache clone's local `trust/evidence/screenshots/{slug}/raw/` directory. It extracts `capturedAt` from the filename pattern, reads image dimensions, and updates `EvidenceSource.websiteScreenshot.rawArtifact` with the raw artifact metadata.

The `PbpWebsiteScreenshot` schema is extended with an optional `rawArtifact` sub-object that tracks the raw original separately from the display variant.

## Architectural fit

- **DNA-46 (Mission lifecycle)**: Screenshot ingestion is a kernel command that mutates Sternsystem state through the mission lifecycle. It acquires system and bordbuch locks, appends a Bordbuch entry, and commits the evidence-source file.
- **DNA-59 (Evidence preservation)**: Raw screenshots are preserved in R2 private storage (durable) and the cache clone (local working copy). The R2 copy is the durable backup; the cache clone copy enables local reprocessing without an R2 download.
- **RFC-0885**: Extends the `PbpWebsiteScreenshot` schema introduced by RFC-0885.
- **RFC-0886**: Complements `nachweis.screenshot.upload` — ingest handles the raw original, upload handles the display variant. The two commands are independent but composable.
- **RFC-0891**: This RFC is the prerequisite for RFC-0891 (screenshot processing), which reads the raw artifact to produce the 16:9 display variant.

### Compass sync

- `docs/verification-plan.xml` — add `NACHWEIS-RAW-SCREENSHOT-01` validation rule: `websiteScreenshot.rawArtifact` must reference an existing file in R2 or cache clone when present.
- `packages/werkstatt/AGENTS.md` — add rule: `nachweis.screenshot.ingest` is the entry point for raw screenshot archival; `nachweis.screenshot.upload` remains for pre-processed display variants only.

## Design

### CLI surface

```sh
# Ingest a raw full-page screenshot from an external path
pnpm exec werkstatt run nachweis.screenshot.ingest \
  --system warpgogol-com \
  --slug client-xyz \
  --file /home/operator/google-drive-push/projects/Warpgogol/clients/style-expert-online/screenshots/CaptureX_2026-08-20_134440_style-expert.online.png

# Dry-run mode: compute metadata without copying or uploading
pnpm exec werkstatt run nachweis.screenshot.ingest \
  --system warpgogol-com \
  --slug client-xyz \
  --file ./screenshot.png \
  --dry-run

# JSON output
pnpm exec werkstatt run nachweis.screenshot.ingest \
  --system warpgogol-com \
  --slug client-xyz \
  --file ./screenshot.png \
  --json

# Override capturedAt (ISO 8601 with timezone) when filename doesn't match CaptureX pattern
pnpm exec werkstatt run nachweis.screenshot.ingest \
  --system warpgogol-com \
  --slug client-xyz \
  --file ./manual-screenshot.png \
  --captured-at 2026-08-20T13:44:40Z
```

### Filename pattern parsing

The command extracts `capturedAt` from filenames matching the CaptureX pattern:

```
CaptureX_YYYY-MM-DD_HHMMSS_domain.ext
```

Regex: `^CaptureX_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})_(.+)\.([a-zA-Z0-9]+)$`

Extracted groups → ISO 8601:

- `2026-08-20_134440` → `2026-08-20T13:44:40Z`

If the filename does not match the pattern, `capturedAt` is left unset (not an error — the operator can set it manually or via the `--captured-at` flag). The `--captured-at` flag accepts ISO 8601 with timezone (e.g. `2026-08-20T13:44:40Z`) and overrides any filename-parsed value.

### TypeScript contracts

#### Schema extension: PbpWebsiteScreenshot

```ts
// packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts

// RFC-0890: raw screenshot artifact (the original full-page capture)
const pbpRawScreenshotArtifactSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mediaType: nonEmptyString,
  originalFilename: nonEmptyString,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  r2Key: nonEmptyString.optional(),
  localPath: nonEmptyString.optional(),
  capturedAt: nonEmptyString.optional(),
});

const pbpWebsiteScreenshotSchema = z.object({
  // Display variant (existing fields — populated by nachweis.screenshot.upload or RFC-0891 processing)
  // RFC-0890: display fields are optional when only rawArtifact is present (ingest before upload)
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  mediaType: nonEmptyString.optional(),
  storage: z.enum(["private", "public"]).optional(),
  url: nonEmptyString.optional(),
  capturedAt: nonEmptyString.optional(),
  // RFC-0890: raw original artifact (populated by nachweis.screenshot.ingest)
  rawArtifact: pbpRawScreenshotArtifactSchema.optional(),
}).superRefine((data, ctx) => {
  // RFC-0890: at least one of display variant or rawArtifact must be present
  const hasDisplay = data.sha256 != null && data.mediaType != null && data.storage != null;
  const hasRaw = data.rawArtifact != null;
  if (!hasDisplay && !hasRaw) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "websiteScreenshot must have either display variant (sha256, mediaType, storage) or rawArtifact (RFC-0890)",
      path: ["rawArtifact"],
    });
  }
});
```

```ts
// packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts

export interface PbpRawScreenshotArtifact {
  sha256: string;
  mediaType: string;
  originalFilename: string;
  width: number;
  height: number;
  r2Key?: string;
  localPath?: string;
  capturedAt?: string;
}

export interface PbpWebsiteScreenshot {
  // RFC-0890: display fields optional when only rawArtifact is present
  sha256?: string;
  mediaType?: string;
  storage?: "private" | "public";
  url?: string;
  capturedAt?: string;
  rawArtifact?: PbpRawScreenshotArtifact;
}
```

#### Command result

```ts
// packages/werkstatt/src/nachweis/nachweis-screenshot-ingest.ts

interface NachweisScreenshotIngestResult {
  slug: string;
  systemId: string;
  sha256: string;
  mediaType: string;          // detected from file content, not extension
  originalFilename: string;
  width: number;
  height: number;
  capturedAt: string | null;  // ISO 8601 or null if filename didn't match pattern
  r2Key: string;              // {systemId}/screenshots/{slug}/raw/{originalFilename}
  localPath: string;          // trust/evidence/screenshots/{slug}/raw/{originalFilename}
  bordbuchEventId: string;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/nachweis/nachweis-screenshot-ingest.ts` | New file: `nachweis.screenshot.ingest` command handler |
| `packages/werkstatt/src/nachweis/nachweis-io.ts` | Add `resolveNachweisRawScreenshotR2Path`, `resolveNachweisRawScreenshotLocalPath`, `detectImageMetadata` helpers |
| `packages/werkstatt/src/nachweis/nachweis.module.ts` | Register `nachweis.screenshot.ingest` command |
| `packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts` | Add `pbpRawScreenshotArtifactSchema`, extend `pbpWebsiteScreenshotSchema` with `rawArtifact` |
| `packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts` | Add `PbpRawScreenshotArtifact` interface, extend `PbpWebsiteScreenshot` |
| `trust/evidence/screenshots/{slug}/raw/` | Cache clone directory for raw screenshot copies (gitignored) |

### Idempotency

`nachweis.screenshot.ingest` is idempotent by SHA-256. When re-ingesting the same file for an existing `rawArtifact`:

1. Compute SHA-256 of the incoming file.
2. If `websiteScreenshot.rawArtifact.sha256` already matches → skip R2 upload, skip local copy, skip Bordbuch append. Return the existing `rawArtifact` metadata with `bordbuchEventId: ""` and a summary indicating "already ingested".
3. If the SHA-256 differs → overwrite the local copy and R2 object, update `rawArtifact` metadata, append a new Bordbuch entry. This handles the case where the operator re-captures and re-ingests a different screenshot for the same slug.

This follows the same idempotency-by-hash pattern as `nachweis.public-derivative` (RFC-0714).

### Ordering: ingest before upload

`nachweis.screenshot.ingest` and `nachweis.screenshot.upload` are independent — either can run first. When ingest runs before upload, the `websiteScreenshot` object is created with only `rawArtifact` populated (display fields `sha256`, `mediaType`, `storage` are absent). The schema enforces that at least one of display variant or `rawArtifact` is present via `superRefine`.

When `nachweis.screenshot.upload` subsequently runs, it populates the display fields (`sha256`, `mediaType`, `storage`, `url`) alongside the existing `rawArtifact`. The upload command must not overwrite or remove an existing `rawArtifact`.

### R2 and local storage paths

```
R2 private:   {systemId}/screenshots/{slug}/raw/{originalFilename}
Cache clone:  trust/evidence/screenshots/{slug}/raw/{originalFilename}
```

The cache clone directory `trust/evidence/screenshots/` is added to `.gitignore` — raw screenshots are binary artifacts, not git content. The R2 private copy is the durable backup; the cache clone copy is the local working copy for reprocessing.

### Output format

```json
{
  "command": "nachweis.screenshot.ingest",
  "data": {
    "slug": "client-xyz",
    "systemId": "warpgogol-com",
    "sha256": "a1b2c3...",
    "mediaType": "image/jpeg",
    "originalFilename": "CaptureX_2026-08-20_134440_style-expert.online.png",
    "width": 3708,
    "height": 27210,
    "capturedAt": "2026-08-20T13:44:40Z",
    "r2Key": "warpgogol-com/screenshots/client-xyz/raw/CaptureX_2026-08-20_134440_style-expert.online.png",
    "localPath": "trust/evidence/screenshots/client-xyz/raw/CaptureX_2026-08-20_134440_style-expert.online.png",
    "bordbuchEventId": "event-000005"
  },
  "exitCode": 0
}
```

### Failure modes

- `nachweis.screenshot.ingest` fails when `--system`, `--slug`, or `--file` is missing.
- `nachweis.screenshot.ingest` fails when the evidence-source entity does not exist.
- `nachweis.screenshot.ingest` fails when the file does not exist at the `--file` path.
- `nachweis.screenshot.ingest` fails when the file is not a valid image (sharp metadata read fails).
- `nachweis.screenshot.ingest` fails when R2 credentials are missing (`MissingEnvError`), unless `--dry-run` is set.
- `nachweis.screenshot.ingest` does NOT fail when the filename doesn't match the CaptureX pattern — `capturedAt` is left unset.
- `nachweis.screenshot.ingest` does NOT fail when the file extension doesn't match the actual content — mediaType is detected from file content via sharp metadata.
- `nachweis.screenshot.ingest` does NOT fail on re-ingestion of the same SHA-256 — it skips upload and returns existing metadata (idempotent).

### Image metadata detection

The command uses `sharp` (dynamic import, same pattern as `image.variants.generate` in `werkstatt-site`) to read image metadata:

```ts
const sharp = (await import("sharp")).default;
const metadata = await sharp(filePath).metadata();
// metadata.format: "jpeg" | "png" | "webp" | ...
// metadata.width, metadata.height
```

The `mediaType` is derived from `metadata.format`, not from the file extension. This handles the case where the operator's capture tool saves JPEG data with a `.png` extension (observed in real CaptureX output).

## Rollout

1. **Schema dependency**: RFC-0885 must be implemented first (the `websiteScreenshot` field exists on `EvidenceSource`).
2. **Schema extension**: Add `rawArtifact` optional sub-object to `PbpWebsiteScreenshot`. This is backward-compatible — existing entities without `rawArtifact` continue to validate.
3. **Command implementation**: Implement `nachweis.screenshot.ingest` in `packages/werkstatt/src/nachweis/`.
4. **sharp dependency**: Add `sharp` to `packages/werkstatt/package.json` devDependencies. pnpm strict isolation prevents dynamic `import("sharp")` from resolving unless the package declares it as a direct dependency. The command uses dynamic `import("sharp")` at the call site — no static import. `sharp` is already a devDependency of `packages/werkstatt-site`; adding it to `werkstatt` does not violate DNA-64 (sharp is a native image processing library, not a stack plugin).
5. **Cache clone .gitignore**: Add `trust/evidence/screenshots/` to the cache clone's `.gitignore` template.
6. **No migration**: Existing entities are unaffected — `rawArtifact` is optional. Existing `nachweis.screenshot.upload` usage continues to work for pre-processed display variants.
7. **Pipeline integration**: `nachweis.screenshot.ingest` is NOT part of any build pipeline — it is an operator-initiated command run during missions.
8. **New sites**: New Sternsystemen with `nachweis` entitlement can use `nachweis.screenshot.ingest` from day one.

## Alternatives considered

- **Extend `nachweis.screenshot.upload` with a `--raw` flag**: Rejected — the two operations have different storage paths (private vs public), different metadata (raw tracks dimensions and original filename; display does not), and different downstream consumers. Separate commands are clearer.
- **Store raw screenshots in git (LFS)**: Rejected — raw screenshots can be 5–20MB each. Git LFS adds complexity and the cache clone is already mirrored to external repos that may not support LFS. R2 private storage is the durable backup; the cache clone copy is gitignored.
- **Skip local cache clone copy, rely only on R2**: Rejected — the operator wants local copies for fast reprocessing without an R2 download. The cache clone is the natural local storage location.
- **Use file extension to determine mediaType**: Rejected — real-world CaptureX files have been observed with `.png` extension but JPEG content. Detecting from file content via sharp is more reliable.
- **Make `capturedAt` a required flag instead of filename parsing**: Rejected — the CaptureX filename pattern is consistent and parsing it reduces operator burden. The `--captured-at` flag is available as an override.

## Risks

- **R2 storage growth**: Raw screenshots are typically 2–20MB each. At scale (hundreds of client sites), this adds measurable R2 storage. Raw screenshots are stored in private storage (not served publicly), so they don't need CDN caching. A lifecycle policy may be needed in the future to tier old raw screenshots to cheaper storage.
- **sharp native dependency**: Adding `sharp` to `werkstatt` means every environment using the engine needs sharp's native binaries. This is already the case for `werkstatt-site` (which has sharp as devDependency), so the monorepo already installs sharp. Standalone `werkstatt` consumers (non-site) would need to install sharp, but the nachweis module is only used in site contexts.
- **Filename pattern fragility**: The CaptureX pattern may change if the capture tool is updated. The regex is conservative — unmatched filenames leave `capturedAt` unset rather than failing. The operator can pass `--captured-at` explicitly.
- **Cache clone disk usage**: Raw screenshots in the cache clone consume local disk. The `.gitignore` entry prevents git bloat, but operators may need to manually clean old raw files. This is acceptable — the R2 copy is the durable backup.
- **PII in raw screenshots**: Full-page screenshots may capture cookies, user data, session tokens, or sensitive UI elements. The R2 private copy is access-controlled. The cache clone copy at `trust/evidence/screenshots/{slug}/raw/` is a plain file on disk — it must not be exposed in public builds, served by the dev server, or included in logs. The `.gitignore` entry prevents accidental git tracking. Operators should review raw screenshots for sensitive content before ingestion.

## Acceptance criteria

- [x] `PbpWebsiteScreenshot` schema includes optional `rawArtifact` sub-object with `sha256`, `mediaType`, `originalFilename`, `width`, `height`, `r2Key`, `localPath`, `capturedAt` fields (evidence: packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts:152-188)
- [x] `PbpRawScreenshotArtifact` interface defined in `packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts` (evidence: packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts:120-130)
- [x] `nachweis.screenshot.ingest` command registered with `--system`, `--slug`, `--file`, `--dry-run`, `--json`, `--captured-at` flags (evidence: packages/werkstatt/src/nachweis/nachweis.module.ts:501-534)
- [x] `nachweis.screenshot.ingest` copies the raw file to cache clone at `trust/evidence/screenshots/{slug}/raw/{originalFilename}` (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-ingest.ts:172-173)
- [x] `nachweis.screenshot.ingest` uploads the raw file to R2 private at `{systemId}/screenshots/{slug}/raw/{originalFilename}` (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-ingest.ts:169)
- [x] `nachweis.screenshot.ingest` computes SHA-256 of the raw file (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-ingest.ts:105)
- [x] `nachweis.screenshot.ingest` detects actual media type from file content via sharp metadata (not file extension) (evidence: packages/werkstatt/src/nachweis/nachweis-io.ts:594-606)
- [x] `nachweis.screenshot.ingest` reads image dimensions (width, height) via sharp metadata (evidence: packages/werkstatt/src/nachweis/nachweis-io.ts:600-606)
- [x] `nachweis.screenshot.ingest` extracts `capturedAt` from `CaptureX_YYYY-MM-DD_HHMMSS_domain.ext` filename pattern (evidence: packages/werkstatt/src/nachweis/nachweis-io.ts:568-580)
- [x] `nachweis.screenshot.ingest` updates `EvidenceSource.websiteScreenshot.rawArtifact` with metadata (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-ingest.ts:180-194)
- [x] `nachweis.screenshot.ingest` appends a `nachweis-record` Bordbuch entry with raw screenshot metadata (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-ingest.ts:210-227)
- [x] `nachweis.screenshot.ingest` `--dry-run` mode computes metadata without copying or uploading (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-ingest.ts:161-168)
- [x] `nachweis.screenshot.ingest` is idempotent — re-ingesting the same SHA-256 skips upload and Bordbuch append, returns existing metadata (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-ingest.ts:125-142)
- [x] `nachweis.screenshot.ingest` `--captured-at` flag accepts ISO 8601 with timezone and overrides filename-parsed value (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-ingest.ts:153-158)
- [x] `PbpWebsiteScreenshot` schema allows display fields to be absent when `rawArtifact` is present (ingest before upload) (evidence: packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts:166-188)
- [x] `trust/evidence/screenshots/` added to cache clone `.gitignore` template (evidence: packages/werkstatt-site/src/onboarding/templates/runtime/gitignore.template:49-50)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate --id RFC-0890 exit code 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST use dynamic `import("sharp")` at the call site, same pattern as `image.variants.generate` in `werkstatt-site/src/checks/image-variants.ts`. `sharp` MUST be declared in `packages/werkstatt/package.json` devDependencies — pnpm strict isolation prevents dynamic import from resolving undeclared packages.
- Agents MUST NOT upload raw screenshots to R2 public storage — raw screenshots are always private.
- Agents MUST NOT git-track raw screenshot files in the cache clone — the `trust/evidence/screenshots/` directory is gitignored.
- Agents MUST NOT modify the existing `nachweis.screenshot.upload` command — it remains for pre-processed display variants.
- Agents MUST detect mediaType from file content (sharp metadata), not from file extension. Real-world CaptureX files have been observed with `.png` extension but JPEG content.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
