---
rfcId: RFC-0890
planId: PLAN-RFC-0890-01
status: draft
owner: architecture
createdAt: 2026-08-20
updatedAt:
scope:
  apps: []
  packages:
    - werkstatt
    - werkstatt-site
  services: []
  docs:
    - packages/werkstatt/AGENTS.md
    - docs/verification-plan.xml
    - packages/werkstatt-site/src/onboarding/templates/runtime/gitignore.template
---

# Implementation Plan: RFC-0890

## 1. Objectives

- [ ] Objective 1 — Extend `PbpWebsiteScreenshot` schema with optional `rawArtifact` sub-object (maps to acceptance criterion: schema includes `rawArtifact`)
- [ ] Objective 2 — Define `PbpRawScreenshotArtifact` interface in entity file (maps to acceptance criterion: interface defined)
- [ ] Objective 3 — Implement `nachweis.screenshot.ingest` command with idempotency, filename parsing, sharp metadata detection (maps to acceptance criteria: command registered, copies, uploads, computes SHA-256, detects mediaType, reads dimensions, extracts capturedAt, updates entity, appends Bordbuch, dry-run, idempotent, `--captured-at` flag)
- [ ] Objective 4 — Add `trust/evidence/screenshots/` to cache clone `.gitignore` template (maps to acceptance criterion: gitignore updated)
- [ ] Objective 5 — Schema allows display fields absent when `rawArtifact` present (maps to acceptance criterion: ingest before upload)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts` — add `pbpRawScreenshotArtifactSchema`, extend `pbpWebsiteScreenshotSchema` with `rawArtifact` + `superRefine`, make display fields optional
- `packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts` — add `PbpRawScreenshotArtifact` interface, extend `PbpWebsiteScreenshot` with optional display fields + `rawArtifact`
- `packages/werkstatt-site/src/domain/pbp/index.ts` — export `PbpRawScreenshotArtifact` type
- `packages/werkstatt/src/nachweis/nachweis-screenshot-ingest.ts` — new file: `nachweis.screenshot.ingest` command handler
- `packages/werkstatt/src/nachweis/nachweis-io.ts` — add `resolveNachweisRawScreenshotR2Path`, `resolveNachweisRawScreenshotLocalPath`, `detectImageMetadata`, `parseCaptureXFilename`, `NachweisScreenshotIngestResult` interface
- `packages/werkstatt/src/nachweis/nachweis.module.ts` — register `nachweis.screenshot.ingest` command

### 2.2 Configuration and data

- `packages/werkstatt-site/src/onboarding/templates/runtime/gitignore.template` — add `trust/evidence/screenshots/` entry

### 2.3 Documentation and specs

- `packages/werkstatt/AGENTS.md` — add rule: `nachweis.screenshot.ingest` is the entry point for raw screenshot archival; `nachweis.screenshot.upload` remains for display variants
- `docs/verification-plan.xml` — add `NACHWEIS-RAW-SCREENSHOT-01` validation rule

### 2.4 Validation and pipelines

- `pnpm exec werkstatt run rfc.validate --id RFC-0890`
- `pnpm --filter werkstatt run build:check`
- `pnpm --filter werkstatt-site run build:check`
- `pnpm --filter werkstatt run test` (new unit tests)
- `pnpm --filter werkstatt-site run test` (schema tests)

## 3. Step sequence

### Step 1. Schema and entity contracts

**Goal:** Extend `PbpWebsiteScreenshot` with `rawArtifact` and make display fields optional.

**Agent actions:**

- Add `pbpRawScreenshotArtifactSchema` to `packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts` with fields: `sha256`, `mediaType`, `originalFilename`, `width`, `height`, `r2Key?`, `localPath?`, `capturedAt?`
- Extend `pbpWebsiteScreenshotSchema`: make `sha256`, `mediaType`, `storage` optional, add `rawArtifact: pbpRawScreenshotArtifactSchema.optional()`, add `superRefine` requiring at least one of display variant or `rawArtifact`
- Add `PbpRawScreenshotArtifact` interface to `packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts`
- Extend `PbpWebsiteScreenshot`: make `sha256`, `mediaType`, `storage` optional, add `rawArtifact?: PbpRawScreenshotArtifact`
- Export `PbpRawScreenshotArtifact` from `packages/werkstatt-site/src/domain/pbp/index.ts`

**Validation:**

- `pnpm --filter werkstatt-site run build:check`
- Existing schema tests still pass (`pnpm --filter werkstatt-site run test`)

**Completion criterion:** `pbpWebsiteScreenshotSchema` accepts objects with only `rawArtifact` (no display fields) and objects with only display fields (no `rawArtifact`); rejects objects with neither.

**Human review:** no

---

### Step 2. Schema unit tests

**Goal:** Verify the schema extension works correctly.

**Agent actions:**

- Add test file `packages/werkstatt-site/src/domain/pbp/schemas/__tests__/rfc-0890-raw-screenshot-artifact.test.ts`
- Test cases:
  - Accepts `websiteScreenshot` with only `rawArtifact` (no display fields)
  - Accepts `websiteScreenshot` with display fields + `rawArtifact`
  - Accepts `websiteScreenshot` with only display fields (backward compat)
  - Rejects `websiteScreenshot` with neither display fields nor `rawArtifact`
  - Accepts `rawArtifact` with all required fields
  - Rejects `rawArtifact` with invalid SHA-256 (non-64-hex)
  - Rejects `rawArtifact` with non-positive width/height

**Validation:**

- `pnpm --filter werkstatt-site run test`

**Completion criterion:** All new tests pass; existing tests still pass.

**Human review:** no

---

### Step 3. I/O helpers

**Goal:** Add helper functions for raw screenshot paths, metadata detection, and filename parsing.

**Agent actions:**

- Add to `packages/werkstatt/src/nachweis/nachweis-io.ts`:
  - `resolveNachweisRawScreenshotR2Path(systemId, slug, originalFilename)` → `{systemId}/screenshots/{slug}/raw/{originalFilename}`
  - `resolveNachweisRawScreenshotLocalPath(cachePath, slug, originalFilename)` → `{cachePath}/trust/evidence/screenshots/{slug}/raw/{originalFilename}`
  - `parseCaptureXFilename(filename)` → `{ capturedAt: string } | null` using regex `^CaptureX_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})_(.+)\.([a-zA-Z0-9]+)$`
  - `detectImageMetadata(filePath)` → `{ mediaType, width, height }` using dynamic `import("sharp")`
  - `NachweisScreenshotIngestResult` interface

**Validation:**

- `pnpm --filter werkstatt run build:check`

**Completion criterion:** Helpers compile and are exported from `nachweis-io.ts`.

**Human review:** no

---

### Step 4. Command handler

**Goal:** Implement `nachweis.screenshot.ingest` command handler.

**Agent actions:**

- Create `packages/werkstatt/src/nachweis/nachweis-screenshot-ingest.ts`:
  - Read flags: `--system`, `--slug`, `--file`, `--dry-run`, `--json`, `--captured-at`
  - Validate required flags
  - Check nachweis entitlement (reuse `isNachweisEntitled`)
  - Resolve cache path, lang, evidence file
  - Check evidence-source file exists
  - Check input file exists
  - Compute SHA-256 (reuse `computeSourceSha256`)
  - **Idempotency check**: read existing `websiteScreenshot.rawArtifact.sha256`; if matches → return skip result with existing metadata
  - Detect image metadata via `detectImageMetadata` (dynamic `import("sharp")`)
  - Parse `capturedAt` from filename via `parseCaptureXFilename`; `--captured-at` flag overrides
  - If `--dry-run`: return metadata without copying/uploading
  - Copy file to cache clone local path
  - Upload to R2 private via `uploadToR2`
  - Update `EvidenceSource.websiteScreenshot`:
    - If `websiteScreenshot` exists: set `rawArtifact`, preserve existing display fields
    - If `websiteScreenshot` absent: create with only `rawArtifact`
  - Acquire system + bordbuch locks, append Bordbuch entry, release locks
  - Return `NachweisScreenshotIngestResult`

**Validation:**

- `pnpm --filter werkstatt run build:check`

**Completion criterion:** Handler compiles; all flag combinations handled; idempotency check present.

**Human review:** no

---

### Step 5. Module registration

**Goal:** Register `nachweis.screenshot.ingest` in the nachweis module.

**Agent actions:**

- Add dynamic import of `runNachweisScreenshotIngest` to `packages/werkstatt/src/nachweis/nachweis.module.ts`
- Register command with flags: `system`, `slug` (required), `file` (required), `dry-run`, `json`, `captured-at`
- Update module contract comment

**Validation:**

- `pnpm --filter werkstatt run build:check`

**Completion criterion:** Command appears in module registration; `pnpm exec werkstatt run nachweis.screenshot.ingest --help` would show the command.

**Human review:** no

---

### Step 6. Command unit tests

**Goal:** Test the command handler logic.

**Agent actions:**

- Create `packages/werkstatt/src/nachweis/__tests__/nachweis-screenshot-ingest.test.ts`
- Test cases:
  - Dry-run returns metadata without R2 upload or file copy
  - Idempotency: re-ingest with same SHA-256 skips upload and Bordbuch
  - Filename parsing: `CaptureX_2026-08-20_134440_domain.png` → `capturedAt: 2026-08-20T13:44:40Z`
  - Filename parsing: non-matching filename → `capturedAt: null`
  - `--captured-at` flag overrides filename-parsed value
  - Fails when evidence-source not found
  - Fails when file not found
  - Updates `websiteScreenshot.rawArtifact` with correct metadata
  - Preserves existing display fields when `rawArtifact` is added

**Validation:**

- `pnpm --filter werkstatt run test`

**Completion criterion:** All test cases pass.

**Human review:** no

---

### Step 7. Gitignore template update

**Goal:** Add `trust/evidence/screenshots/` to the cache clone `.gitignore` template.

**Agent actions:**

- Edit `packages/werkstatt-site/src/onboarding/templates/runtime/gitignore.template`
- Add entry: `# RFC-0890: raw screenshots — binary artifacts, not git content\ntrust/evidence/screenshots/`

**Validation:**

- Template file contains the new entry

**Completion criterion:** `trust/evidence/screenshots/` present in `gitignore.template`.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Update AGENTS.md and verification-plan.xml.

**Agent actions:**

- Add to `packages/werkstatt/AGENTS.md`: rule that `nachweis.screenshot.ingest` is the entry point for raw screenshot archival; `nachweis.screenshot.upload` remains for display variants
- Add to `docs/verification-plan.xml`: `NACHWEIS-RAW-SCREENSHOT-01` validation rule

**Validation:**

- Files updated; no XML syntax errors

**Completion criterion:** Both files contain the new entries.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0890 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0890`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0890`
- `pnpm --filter werkstatt run build:check`
- `pnpm --filter werkstatt-site run build:check`
- `pnpm --filter werkstatt run test`
- `pnpm --filter werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0890` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| R2 storage growth | Step 4: raw screenshots stored in private storage, not public CDN |
| sharp native dependency | Step 3: dynamic `import("sharp")` — no static import, no `werkstatt` package.json change |
| Filename pattern fragility | Step 3: `parseCaptureXFilename` returns null on non-match; `--captured-at` flag is override |
| Cache clone disk usage | Step 7: `.gitignore` prevents git bloat |
| PII in raw screenshots | Step 4: R2 private storage; `.gitignore` prevents git tracking; RFC notes operator review responsibility |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-59, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0890 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `superRefine` on `pbpWebsiteScreenshotSchema` breaks existing entities (backward compat), investigate whether the schema change requires a superseding RFC rather than an amendment.
