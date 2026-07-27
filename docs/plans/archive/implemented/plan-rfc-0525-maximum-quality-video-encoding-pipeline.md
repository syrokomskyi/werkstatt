---
rfcId: RFC-0525
planId: PLAN-RFC-0525-01
status: draft
owner: architecture
createdAt: 2026-07-25
updatedAt:
scope:
  apps:
    - webgogol-com
    - nicaragua-projekt
  packages:
    - "@gogol/share"
    - "@gogol/ui"
    - "@gogol/site-kernel-checks"
  services: []
  docs: []
---

# Implementation Plan: RFC-0525

## 1. Objectives

- [ ] O1 — Add `av1?: string` to `VideoManifestSources` — maps to acceptance criterion: "`VideoManifestSources` has an `av1?: string` field"
- [ ] O2 — Add `encodeAv1` function using `libsvtav1`, CRF 22, preset 2, 10-bit — maps to acceptance criterion: "`encodeAv1` function added to `video-variants.ts`"
- [ ] O3 — Upgrade `encodeMp4`, `encodeWebm`, `encodeHls`, `encodePoster` parameters — maps to acceptance criteria for each function
- [ ] O4 — Bump `ENCODER_SETTINGS_VERSION` from `"1"` to `"2"` — maps to acceptance criterion: "`ENCODER_SETTINGS_VERSION` is `\"2\"`"
- [ ] O5 — Wire `encodeAv1` into `runVideoVariantsGenerate` for feature profile and populate `sources.av1` — maps to acceptance criterion: "`runVideoVariantsGenerate` calls `encodeAv1` for feature profile"
- [ ] O6 — Update `video.variants.validate` to check `entry.sources.av1` — maps to acceptance criterion: "`video.variants.validate` passes on regenerated manifest"
- [ ] O7 — Update `<Media>` component to emit AV1 `<source>` first — maps to acceptance criteria: "`<Media>` component emits AV1 `<source>`" and "Rendered `<video>` element contains three `<source>` elements"
- [ ] O8 — Extend ffmpeg availability check to verify `libsvtav1` — maps to acceptance criterion: "ffmpeg/ffprobe availability check includes `libsvtav1` verification"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/schemas/media.ts` — add `av1?: string` field to `VideoManifestSources` interface; update `CHANGE_SUMMARY`
- `packages/os/site-kernel-checks/src/video/video-variants.ts` — bump `ENCODER_SETTINGS_VERSION`; update `encodeMp4`, `encodeWebm`, `encodeHls`, `encodePoster`; add `encodeAv1`; add `AUDIO_BITRATE_BY_HEIGHT` mapping; update `runVideoVariantsGenerate` to call `encodeAv1` and populate `sources.av1`; update `runVideoVariantsValidate` to check `entry.sources.av1`; extend ffmpeg availability check with `libsvtav1` verification; update `MODULE_CONTRACT` and `CHANGE_SUMMARY`
- `packages/ui/src/components/media/media.astro` — resolve `av1Url` from `sources?.av1`; emit AV1 `<source>` before WebM and MP4; update `CHANGE_SUMMARY`

### 2.2 Configuration and data

- No configuration files changed. The `ENCODER_SETTINGS_VERSION` bump invalidates `.cache/video/**` (gitignored, ephemeral).

### 2.3 Documentation and specs

- RFC file: `docs/rfcs/rfc-0525-maximum-quality-video-encoding-pipeline.md` (read-only reference)
- `packages/os/site-kernel-checks/AGENTS.md` — update `video-variants.ts` module description if encoding parameters are mentioned (currently not detailed there; likely no change needed)
- No `docs/*.xml` Compass synchronization needed — no repository-wide requirements, shared package contracts, or app-package relationships changed.
- No `docs/architecture-dna.md` changes — no DNA invariant introduced or changed.

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/share run build:check` — typecheck the schema change
- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck the encoding + validator changes
- `pnpm --filter @gogol/ui run build:check` — typecheck the Media component change
- `pnpm exec site-kernel run rfc.validate RFC-0525 --json` — RFC mechanical validation
- No new pipeline wiring — `video.variants.generate` and `video.variants.validate` are already registered in `build.prepare` and `build.check`.

## 3. Step sequence

### Step 1. Add `av1` field to `VideoManifestSources`

**Goal:** Extend the manifest schema to carry the AV1 progressive URL.

**Agent actions:**

- Edit `packages/share/src/schemas/media.ts`: add `av1?: string` field to `VideoManifestSources` with JSDoc comment `/** AV1-in-WebM progressive (RFC-0525). Feature only. */`
- Add `CHANGE_SUMMARY` entry: `<item>RFC-0525: added av1 field to VideoManifestSources for AV1 progressive delivery.</item>`

**Validation:**

- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** `VideoManifestSources` interface has `av1?: string` field; `build:check` passes.

**Human review:** no

---

### Step 2. Bump `ENCODER_SETTINGS_VERSION` and upgrade encoding parameters

**Goal:** Update all encoding functions to maximum-quality parameters and bump the cache version.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/video/video-variants.ts`:
  - Change `ENCODER_SETTINGS_VERSION` from `"1"` to `"2"`
  - Update `encodeMp4`: CRF `23`→`17`, preset `veryfast`→`slow`, add `-profile:v high`, `-level 4.0`
  - Update `encodeWebm`: CRF `34`→`28`, `cpu-used` `5`→`0`, `deadline` `good`→`best`
  - Update `encodePoster`: `-q:v` `2`→`4`
  - Update `encodeHls`: CRF `23`→`17`, preset `veryfast`→`slow`, add `-profile:v high`, `-level 4.0`; add `AUDIO_BITRATE_BY_HEIGHT` mapping (`Record<number, string>`: 360→`"64k"`, 540→`"96k"`, 720→`"128k"`, 1080→`"128k"`); use per-rendition audio bitrate in the rendition loop
- Update `MODULE_CONTRACT` purpose text to mention AV1 and upgraded parameters
- Update `CHANGE_SUMMARY` with RFC-0525 entry

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** All encoding functions use the new parameters; `ENCODER_SETTINGS_VERSION` is `"2"`; `build:check` passes.

**Human review:** no

---

### Step 3. Add `encodeAv1` function

**Goal:** Implement the AV1 encoding function using SVT-AV1.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/video/video-variants.ts`:
  - Add `encodeAv1(source: string, outDir: string, hasAudio: boolean): Promise<void>` function
  - Parameters: `-c:v libsvtav1`, `-preset 2`, `-crf 22`, `-pix_fmt yuv420p10le`, `-svtav1-params tune=vq:enable-overlays=1`, audio `libopus` 128k or `-an`
  - Output: `join(outDir, "progressive.av1.webm")`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `encodeAv1` function exists with correct ffmpeg args; `build:check` passes.

**Human review:** no

---

### Step 4. Wire `encodeAv1` into `runVideoVariantsGenerate`

**Goal:** Call `encodeAv1` for feature profile and populate `sources.av1` in the manifest.

**Agent actions:**

- In `runVideoVariantsGenerate` (around line 446–453):
  - After `encodeWebm` and before `encodeHls`, add: `if (ref.profile === "feature") await encodeAv1(ref.sourceAbs, cacheDir, probe.hasAudio);`
- In the manifest sources population (around line 485–489):
  - Add: `if (ref.profile === "feature") sources.av1 = \`${publicUrlBase}/progressive.av1.webm\`;`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `runVideoVariantsGenerate` calls `encodeAv1` for feature profile; manifest entry includes `sources.av1` for feature videos; `build:check` passes.

**Human review:** no

---

### Step 5. Update `video.variants.validate` to check AV1

**Goal:** Ensure the validator catches missing AV1 files on disk.

**Agent actions:**

- In `runVideoVariantsValidate` (around line 553–560):
  - Add `entry.sources.av1` to the `urls` array alongside `hls`, `mp4`, `webm`, and caption URLs

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** Validator's URL iteration includes `entry.sources.av1`; `build:check` passes.

**Human review:** no

---

### Step 6. Extend ffmpeg availability check for `libsvtav1`

**Goal:** Fail early with a clear error when the build environment lacks SVT-AV1 support.

**Agent actions:**

- In `runVideoVariantsGenerate` (around line 408–410):
  - After the existing `ffmpeg -version` / `ffprobe -version` checks, add a `libsvtav1` encoder check:
    - Run `ffmpeg -encoders` and check for `libsvtav1` in the output
    - If absent, return a fail result with message: `ffmpeg lacks libsvtav1 encoder — install ffmpeg 8.0+ with SVT-AV1 support or warm the .cache/video cache (RFC-0525).`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** ffmpeg availability check includes `libsvtav1` verification; `build:check` passes.

**Human review:** no

---

### Step 7. Update `<Media>` component to emit AV1 `<source>`

**Goal:** Render the AV1 source first in the `<video>` element for feature profile.

**Agent actions:**

- In `packages/ui/src/components/media/media.astro`:
  - Add `const av1Url = sources?.av1;` near the existing `mp4Url` / `webmUrl` resolution (around line 86–88)
  - In the feature `<video>` element (around line 166–167), insert AV1 `<source>` **before** WebM and MP4:
    ```astro
    {av1Url && <source src={av1Url} type='video/webm; codecs="av01.0.05M.08"' />}
    {webmUrl && <source src={webmUrl} type="video/webm" />}
    {mp4Url && <source src={mp4Url} type="video/mp4" />}
    ```
  - Update `MODULE_CONTRACT` purpose text: change "progressive MP4 (+WebM) `<source>`s" to "progressive AV1 (+MP4 +WebM) `<source>`s"
  - Update `CHANGE_SUMMARY` with RFC-0525 entry

**Validation:**

- `pnpm --filter @gogol/ui run build:check`

**Completion criterion:** `<Media>` feature video emits AV1 `<source>` (type `video/webm; codecs="av01"`) before WebM and MP4; `MODULE_CONTRACT` purpose text updated; `build:check` passes.

**Human review:** no

---

### Step 8. Documentation sync and acceptance criteria verification

**Goal:** Synchronize documentation artifacts, verify all acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Check `packages/os/site-kernel-checks/AGENTS.md` — update if the `video-variants.ts` module description mentions encoding parameters (currently it does not; verify and skip if no change needed).
- No `docs/*.xml` Compass files need updates — no repository-wide semantics changed.
- No `docs/architecture-dna.md` changes — no DNA invariant introduced.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands added; skip).
- **Verify every acceptance criterion** against the implemented code. For each `[x]`, add inline `(evidence: <file:line>, <test-or-command>)`.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0525 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.
- Commit the stamped RFC separately from the implementation commit.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate RFC-0525 --json`
- All acceptance criteria checked off with evidence annotations.

**Completion criterion:** All acceptance criteria verified with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; `rfc.validate` passes.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0525 --json`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/ui run build:check`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0525` in the subject line (RFC-0265 commit hygiene)
- Acceptance criteria checkboxes with inline `(evidence: ...)` annotations in the RFC file

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Encoding time (20-40 min for AV1) | Step 2 bumps `ENCODER_SETTINGS_VERSION` — one-time re-encode; subsequent builds use cache |
| Cloudflare 25 MiB asset limit for longer content | Step 2 uses CRF 17 for MP4 (larger); AV1 at CRF 22 is smaller; HLS segments are individually small; `video.dist.prune` and non-bundled `media/` folder mitigate |
| 10-bit AV1 playback on older devices | Step 7 emits AV1 first, WebM second, MP4 third — browsers without AV1 fall through transparently |
| ffmpeg without `libsvtav1` | Step 6 adds explicit `libsvtav1` encoder check with clear error message |
| Cache invalidation | Step 2 bumps `ENCODER_SETTINGS_VERSION` to `"2"` — all existing caches invalidated, forcing clean re-encode |
| Concurrent encoding race | Existing issue, amplified by longer encode times; Turbo cache prevents re-runs within same pipeline; operator discipline for cross-pipeline |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0525 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If `libsvtav1` is not available in the build environment and cannot be installed, escalate to the operator — do not silently skip AV1 encoding.
