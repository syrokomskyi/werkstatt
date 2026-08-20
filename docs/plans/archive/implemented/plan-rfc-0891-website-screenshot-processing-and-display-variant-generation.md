---
rfcId: RFC-0891
planId: PLAN-RFC-0891-01
status: draft
owner: architecture
createdAt: 2026-08-20
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
  services: []
  docs:
    - docs/verification-plan.xml
    - packages/werkstatt/AGENTS.md
---

# Implementation Plan: RFC-0891

## 1. Objectives

- [ ] Objective 1 — Add `resolveNachweisScreenshotDisplayR2Path` and `downloadFromR2` helpers to `nachweis-io.ts` (maps to acceptance criterion: "resolveNachweisScreenshotDisplayR2Path helper added" + "downloadFromR2 helper added")
- [ ] Objective 2 — Implement `nachweis.screenshot.process` command handler with crop/resize/WebP pipeline via sharp (maps to acceptance criteria: command registered, reads rawArtifact, resolves raw file, computes 16:9 crop, crops+resizes+converts, uploads to R2, updates EvidenceSource, propagates capturedAt, preserves rawArtifact, appends Bordbuch, dry-run mode, crop-offset flag)
- [ ] Objective 3 — Register `nachweis.screenshot.process` in `nachweis.module.ts` and export from `index.ts` (maps to acceptance criterion: command registered with flags)
- [ ] Objective 4 — Add unit tests covering happy path, dry-run, crop-offset boundary, missing rawArtifact, R2 fallback, capturedAt propagation (maps to all acceptance criteria via test verification)
- [ ] Objective 5 — Update `packages/werkstatt/AGENTS.md` and `docs/verification-plan.xml` (maps to Compass sync requirements)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts` — **new file**: `runNachweisScreenshotProcess` command handler
- `packages/werkstatt/src/nachweis/nachweis-io.ts` — **modified**: add `resolveNachweisScreenshotDisplayR2Path`, `downloadFromR2`, `NachweisScreenshotProcessResult` interface
- `packages/werkstatt/src/nachweis/nachweis.module.ts` — **modified**: register `nachweis.screenshot.process` command with `--system`, `--slug`, `--dry-run`, `--json`, `--crop-offset` flags
- `packages/werkstatt/src/nachweis/index.ts` — **modified**: export `runNachweisScreenshotProcess` and `NachweisScreenshotProcessResult`
- `packages/werkstatt/package.json` — **modified**: add `sharp` to devDependencies (if RFC-0890 has not already added it)

### 2.2 Configuration and data

- No YAML/JSON/manifest changes. The `websiteScreenshot` schema already supports all fields (`sha256`, `mediaType`, `storage`, `url`, `capturedAt`). The `rawArtifact` sub-object is added by RFC-0890.

### 2.3 Documentation and specs

- `packages/werkstatt/AGENTS.md` — add section: `nachweis.screenshot.process (RFC-0891)` documenting command behavior, flags, R2 paths, relationship with `nachweis.screenshot.upload`
- `docs/verification-plan.xml` — add `NACHWEIS-SCREENSHOT-DISPLAY-01` documentation-only rule: when `websiteScreenshot.rawArtifact` is present, `websiteScreenshot.url` should also be present

### 2.4 Validation and pipelines

- `pnpm exec werkstatt run rfc.validate --id RFC-0891`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt test` (nachweis-screenshot-process.test.ts)
- `nachweis.screenshot.process` is NOT part of any build pipeline — operator-initiated only

## 3. Step sequence

**Precondition:** RFC-0890 must be `implemented` before starting this plan. RFC-0890 adds the `rawArtifact` sub-object to `PbpWebsiteScreenshot` and the `nachweis.screenshot.ingest` command that populates it. Without RFC-0890, `websiteScreenshot.rawArtifact` does not exist and `nachweis.screenshot.process` has no input.

### Step 1. Add I/O helpers to nachweis-io.ts

**Goal:** Add `resolveNachweisScreenshotDisplayR2Path`, `downloadFromR2`, and `NachweisScreenshotProcessResult` interface to the I/O layer.

**Agent actions:**

- Add `NachweisScreenshotProcessResult` interface to `packages/werkstatt/src/nachweis/nachweis-io.ts` with fields: `slug`, `systemId`, `rawSha256`, `rawDimensions`, `cropRegion`, `displaySha256`, `displayMediaType`, `displayWidth`, `displayHeight`, `r2Key`, `capturedAt`, `bordbuchEventId`
- Add `resolveNachweisScreenshotDisplayR2Path(systemId, slug)` → returns `${systemId}/screenshots/${slug}/website-screenshot.webp`
- Add `downloadFromR2(r2Path)` → wraps `client.getObject` using `resolveR2ConfigFromEnv(NACHWEIS_BUCKET, "R2_NACHWEIS")` + `createR2Client`, returns `Uint8Array`
- Update MODULE_CONTRACT and CHANGE_SUMMARY comments

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** `resolveNachweisScreenshotDisplayR2Path` and `downloadFromR2` are exported from `nachweis-io.ts` and typecheck passes.

**Human review:** no

---

### Step 2. Implement nachweis-screenshot-process.ts command handler

**Goal:** Create the `runNachweisScreenshotProcess` handler that reads a raw screenshot, crops to 16:9, resizes to 1280×720, converts to WebP, uploads to R2, and updates the evidence-source entity.

**Agent actions:**

- Create `packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts`
- Import `sharp` dynamically: `const sharp = (await import("sharp")).default`
- Follow the same structure as `nachweis-screenshot-upload.ts`:
  - Parse flags: `--system`, `--slug`, `--dry-run`, `--json`, `--crop-offset` (number, default 0)
  - Check entitlement via `isNachweisEntitled`
  - Resolve cache path, default lang, evidence-source entity file
  - Read evidence-source frontmatter, extract `websiteScreenshot.rawArtifact`
  - Fail if `rawArtifact` is not present with clear error message
  - Resolve raw file: check cache clone local copy at `trust/evidence/screenshots/{slug}/raw/{originalFilename}`, fallback to R2 private via `downloadFromR2`
  - Read raw image metadata via `sharp(rawFilePath).metadata()`
  - Compute 16:9 crop region per RFC crop algorithm
  - Validate `cropOffset + cropHeight <= rawHeight` — fail with error including max allowed offset
  - If `--dry-run`: return computed dimensions and crop region without uploading
  - Crop + resize + WebP convert via sharp pipeline: `.extract(...).resize(1280, 720, { fit: "cover" }).webp({ quality: 80 }).toBuffer()`
  - Compute SHA-256 of display buffer
  - Upload to R2 public via `uploadToR2(displayBuffer, r2Key, "image/webp")`
  - Update `EvidenceSource.websiteScreenshot`: set `sha256`, `mediaType: "image/webp"`, `storage: "public"`, `url: r2Key`, `capturedAt: rawArtifact.capturedAt` (if present), preserve `rawArtifact`
  - Acquire system and bordbuch locks, append `nachweis-record` Bordbuch entry with metadata, release locks
  - Return `NachweisScreenshotProcessResult`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** Handler file exists, exports `runNachweisScreenshotProcess`, typecheck passes.

**Human review:** no

---

### Step 3. Register command in nachweis.module.ts and export from index.ts

**Goal:** Wire the new command into the module registry and barrel exports.

**Agent actions:**

- In `packages/werkstatt/src/nachweis/nachweis.module.ts`:
  - Add dynamic import: `const { runNachweisScreenshotProcess } = await import("./nachweis-screenshot-process.ts")`
  - Register `nachweis.screenshot.process` command with flags: `system`, `slug` (required), `dry-run`, `json`, `crop-offset` (kind: "string", description: "Vertical crop offset in pixels (default: 0)")
  - Set `scope: "workspace"`, `supportsAllSites: false`, `mutatesState: true`, `cacheable: false`
- In `packages/werkstatt/src/nachweis/index.ts`:
  - Add `export { runNachweisScreenshotProcess } from "./nachweis-screenshot-process.ts"`
  - Add `type NachweisScreenshotProcessResult` to the existing type exports from `./nachweis-io.ts`
- Update MODULE_CONTRACT and CHANGE_SUMMARY comments in both files

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** Command registered with all 5 flags, exports available from barrel.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Comprehensive test coverage for the command handler.

**Agent actions:**

- Create `packages/werkstatt/src/tests-handoff/nachweis-screenshot-process.test.ts`
- Mock `../evidence/r2-client.ts` same pattern as `nachweis-commands.test.ts`:
  - Mock `createR2Client` to return `putObject` and `getObject` mocks
  - Mock `resolveR2ConfigFromEnv` to return test config
  - Track `putCalls`, `getCalls`, stored objects
- Mock `sharp` to return a controlled pipeline: `.metadata()` returns `{ width: 3708, height: 27210 }`, `.extract().resize().webp().toBuffer()` returns a fixed `Buffer`
- Test cases:
  1. **Happy path**: evidence-source with `rawArtifact`, raw file in cache clone → processes, uploads, updates entity, appends Bordbuch
  2. **Dry-run**: returns computed dimensions without uploading
  3. **Missing rawArtifact**: fails with clear error
  4. **Missing evidence-source**: fails with NOT_FOUND
  5. **crop-offset beyond boundary**: `cropOffset + cropHeight > rawHeight` → fails with max-offset error
  6. **R2 fallback**: raw file not in cache clone → downloads from R2 private
  7. **capturedAt propagation**: `rawArtifact.capturedAt` present → display variant has `capturedAt`
  8. **capturedAt absent**: `rawArtifact.capturedAt` unset → display variant `capturedAt` is null/undefined
  9. **rawArtifact preservation**: after update, `rawArtifact` field is unchanged on `websiteScreenshot`
  10. **Not entitled**: returns skip result

**Validation:**

- `pnpm --filter @warpgogol/werkstatt test -- --run nachweis-screenshot-process`

**Completion criterion:** All test cases pass.

**Human review:** no

---

### Step 5. Update documentation (AGENTS.md + verification-plan.xml)

**Goal:** Synchronize Compass and AGENTS.md per RFC Compass sync section.

**Agent actions:**

- In `packages/werkstatt/AGENTS.md`:
  - Add section after `nachweis.screenshot.upload (RFC-0886)`:
    - `nachweis.screenshot.process (RFC-0891)` — documents command behavior, flags, R2 path, relationship with upload
- In `docs/verification-plan.xml`:
  - Add `NACHWEIS-SCREENSHOT-DISPLAY-01` as documentation-only rule: when `websiteScreenshot.rawArtifact` is present, `websiteScreenshot.url` should also be present

**Validation:**

- `git diff packages/werkstatt/AGENTS.md` shows new section
- `git diff docs/verification-plan.xml` shows new rule

**Completion criterion:** Both files updated with RFC-0891 content.

**Human review:** no

---

### Step 6. Validate, review, fix, and stamp implemented

**Goal:** Run full validation suite, code review, fix findings, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0891`
- Run `pnpm --filter @warpgogol/werkstatt run build:check`
- Run `pnpm --filter @warpgogol/werkstatt test -- --run nachweis-screenshot-process`
- Verify every acceptance criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0891 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0891` — passes
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria checked off with evidence annotations; code review passed; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0891`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt test -- --run nachweis-screenshot-process`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0891` in the subject line (RFC-0265 commit hygiene)
- `(evidence: file.ts:line-range)` annotations on each checked acceptance criterion

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Crop quality (top-crop assumption) | Step 2: `--crop-offset` flag allows manual adjustment |
| sharp memory usage (large images) | Step 2: sharp uses libvips streaming; accepted trade-off |
| WebP quality (text artifacts) | Step 2: quality 80 hardcoded; future RFC can add `--quality` |
| R2 download fallback latency | Step 2: cache clone copy checked first; R2 is fallback only |
| Command idempotency (Bordbuch append) | Step 2: accepted — reprocessing is intentional, produces new Bordbuch event |
| Concurrent execution | Step 2: system + bordbuch locks serialize state mutation (same pattern as existing commands) |
| --crop-offset beyond image boundary | Step 2: explicit validation with max-offset error message |
| Raw image smaller than 1280×720 | Step 2: sharp `fit: "cover"` upscales; accepted trade-off documented in RFC |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-59, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0891 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `sharp` cannot be dynamically imported in the kernel runtime, escalate to the operator — do not switch to a different image processing library without a superseding RFC.
- If the `rawArtifact` schema shape from RFC-0890 differs from what RFC-0891 expects, coordinate with RFC-0890 implementation first — do not invent a compatibility shim.
