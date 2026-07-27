---
rfcId: RFC-0528
planId: PLAN-RFC-0528-01
status: draft
owner: architecture
createdAt: 2026-07-25
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-checks"
    - "@gogol/share"
  services: []
  docs:
    - docs/verification-plan.xml
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0528

## 1. Objectives

- [ ] Objective 1 — Move `material.metadata.write` after all variant generators in `build-prepare` pipeline (maps to acceptance criterion 1)
- [ ] Objective 2 — Replace `dist/_astro/` basename search with manifest-based file discovery (maps to acceptance criterion 2)
- [ ] Objective 3 — Embed full metadata tag mapping from `MaterialCredit` sidecars (title, copyright, creator, artist, comment, WebStatement, encoder) (maps to acceptance criterion 3)
- [ ] Objective 4 — Add `SemanticSiteProfile` fallback via `loadSemanticSiteModel` for files without credits sidecars (maps to acceptance criterion 4)
- [ ] Objective 5 — Integrate content reference resolution for `.credits.yaml` sidecars (maps to acceptance criterion 5)
- [ ] Objective 6 — Skip HLS segments and caption files during embedding (maps to acceptance criterion 6)
- [ ] Objective 7 — Update `material.metadata.validate` with manifest-based discovery and `META-01` through `META-04` diagnostics (maps to acceptance criterion 7)
- [ ] Objective 8 — Preserve graceful exiftool-unavailable skip in both commands (maps to acceptance criteria 8, 9)
- [ ] Objective 9 — Embed `ENCODER_SETTINGS_VERSION` as the `encoder` tag (maps to acceptance criterion 10)
- [ ] Objective 10 — Synchronize documentation (Compass XML, AGENTS.md) and pass `rfc.validate` (maps to acceptance criterion 11)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-codegen/src/material-metadata-write.ts` — rewrite `runMaterialMetadataWrite`: manifest-based discovery, `loadSemanticSiteModel` fallback, content ref resolution, full exiftool tag mapping, exiftool batching
- `packages/os/site-kernel-checks/src/material-metadata.ts` — rewrite `runMaterialMetadataValidate`: manifest-based discovery, `META-01` through `META-04` diagnostics, fallback verification
- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — move `material.metadata.write` from line 67 to after `live.variants.generate` (line 101)
- `packages/os/site-kernel-checks/src/generator-ownership.ts` — add `material.metadata.write` entries for `public/_video/**`, `public/_img/**` if not already present
- `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` — add `META-01` through `META-04` rule definitions
- `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` — update `material.metadata.validate` description
- `packages/os/site-kernel/src/templates/wire/tools/modules/service.module.template.ts` — update `material.metadata.write` command description

### 2.2 Configuration and data

- `src/video-manifest.generated.yaml` — read by `material.metadata.write` (no schema change, existing `VideoManifest` type)
- `src/live-video-manifest.generated.yaml` — read by `material.metadata.write` (no schema change, existing `LiveVideoManifest` type)
- `src/image-variants.generated.yaml` — read by `material.metadata.write` (no schema change, existing `ImageVariantManifest` type)

### 2.3 Documentation and specs

- `docs/verification-plan.xml` — update `build-prepare` pipeline step list
- `packages/os/site-kernel-checks/AGENTS.md` — update `material.metadata.validate` module description

### 2.4 Validation and pipelines

- `build-prepare` pipeline — `material.metadata.write` repositioned after variant generators
- `build.check` pipeline — `material.metadata.validate` updated (no position change)
- `rfc.validate` — must pass on RFC-0528
- `command.manifest.validate` — must pass after `GENERATOR_OWNERSHIP_MAP` update

## 3. Step sequence

### Step 1. Move `material.metadata.write` in build-prepare pipeline

**Goal:** Reposition `material.metadata.write` from line 67 (before variant generators) to after `live.variants.generate` (line 101).

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`: remove `{ command: "material.metadata.write" }` from line 67
- Add `{ command: "material.metadata.write" }` after `{ command: "live.variants.generate", expectedDurationMs: 120_000, timeoutMs: 900_000 }` (line 101) and before `{ command: "manifest.contract.validate" }` (line 103)
- Update the RFC-0226 comment to reference RFC-0528

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- Visual inspection: `material.metadata.write` appears after all three variant generators

**Completion criterion:** `material.metadata.write` is positioned after `live.variants.generate` and before `manifest.contract.validate` in the `SITES_BUILD_PREPARE_PIPELINE` array.

**Human review:** no

---

### Step 2. Add manifest reader helpers to `material-metadata-write.ts`

**Goal:** Create helper functions to read the three variant manifests and extract file paths with their media tokens.

**Agent actions:**

- Add imports for `VideoManifest`, `LiveVideoManifest`, `ImageVariantManifest` from `@gogol/share/schemas/media` and `@gogol/share/image-provider`
- Add `readVideoManifest`, `readLiveVideoManifest` helpers (or import existing `readVideoManifest` from `@gogol/site-kernel-checks/video/video-variants.ts` if exported)
- Add `readImageVariantManifest` helper
- Add `collectManifestFiles()` function that returns an array of `{ path: string, token: string, kind: "image"|"video" }` entries from all three manifests
- Skip HLS segments (`.ts`, `.m3u8`) and caption files (`.vtt`) in the collector
- Convert manifest URL paths (e.g. `/_video/<lang>/<token>/progressive.h264.mp4`) to absolute filesystem paths under `public/`

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check` — typecheck passes

**Completion criterion:** `collectManifestFiles()` returns all derived media file paths from the three manifests, excluding HLS segments and captions.

**Human review:** no

---

### Step 3. Add `SemanticSiteProfile` fallback to `material-metadata-write.ts`

**Goal:** Load the semantic site model and extract organization fields for fallback metadata.

**Agent actions:**

- Import `loadSemanticSiteModel` from `@gogol/site-kernel-content`
- Call `loadSemanticSiteModel({ contentDir, lang, siteUrl })` once at the start of `runMaterialMetadataWrite`
- Extract `organization.name`, `organization.legalName`, `organization.url`, `organization.representative`
- Build fallback metadata tags: `© <year> <legalName>` (or `brandName`), `organization.url` as comment/WebStatement, `<brandName> — <token> (<lang>)` as title
- Handle the case where `loadSemanticSiteModel` fails (log warning, skip fallback — files without credits get no metadata, same as current behavior)

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check` — typecheck passes

**Completion criterion:** `runMaterialMetadataWrite` loads the semantic site model and builds fallback metadata tags from the organization profile.

**Human review:** no

---

### Step 4. Add content reference resolution to `material-metadata-write.ts`

**Goal:** Resolve braceless content references in `.credits.yaml` sidecars before parsing.

**Agent actions:**

- Import `substituteContentReferences` from `@gogol/site-kernel-content` (already exported)
- After reading each `.credits.yaml` file, call `substituteContentReferences(raw, contentDir, lang, defaultLang)` before `materialCreditSchema.parse()`
- This resolves references like `people.andrii-syrokomskyi.name` → actual name string
- If RFC-0527 content reference index is not yet implemented, `substituteContentReferences` will return the raw string unchanged (graceful degradation)
- Build a resolved credits map: `{ "image:<token>": MaterialCredit, "video:<token>": MaterialCredit }`

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check` — typecheck passes

**Completion criterion:** `.credits.yaml` sidecars with content references are resolved before schema parsing and credit map lookup.

**Human review:** no

---

### Step 5. Implement full exiftool tag mapping and batching

**Goal:** Replace the limited 3-tag `writeIptcXmp` with the full 7-tag mapping and add exiftool batching.

**Agent actions:**

- Rewrite `writeIptcXmp` to accept a `MetadataTags` object: `{ title, copyright, creator, artist, comment, webStatement, encoder }`
- Build exiftool args array from non-empty fields: `-Title=`, `-Copyright=`, `-Creator=`, `-Artist=`, `-Comment=`, `-WebStatement=`, `-Encoder=`
- Add `ENCODER_SETTINGS_VERSION` constant (e.g. `"WGogol/1.0"` or read from a config)
- Implement batching: group files by media type (image vs video) and call exiftool with multiple file paths in one invocation when tags are identical (fallback metadata is identical for all files without credits)
- For credit-specific metadata (varies per file), call exiftool per file but with a concurrency limit of 4
- Keep `-overwrite_original` flag

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check` — typecheck passes

**Completion criterion:** `writeIptcXmp` writes all 7 metadata tags and batches exiftool calls for files with identical metadata.

**Human review:** no

---

### Step 6. Rewrite `runMaterialMetadataWrite` main flow

**Goal:** Replace the current `dist/_astro/` basename search with the manifest-based flow.

**Agent actions:**

- Replace the current file discovery loop (lines 96-143) with:
  1. Load semantic site model (Step 3)
  2. Load and resolve all `.credits.yaml` sidecars (Step 4)
  3. Load variant manifests and collect manifest files (Step 2)
  4. For each manifest file:
     a. Extract token from manifest entry
     b. Look up `MaterialCredit` by `target.kind + target.id` in resolved credits map
     c. If found: build metadata tags from credit fields
     d. If not found: build fallback tags from `SemanticSiteProfile`
     e. Call `writeIptcXmp` with the tags (Step 5)
  5. Report results: written count, skipped count, fallback count
- Handle empty manifests: report pass with zero files (not a skip)
- Preserve exiftool-unavailable graceful skip

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check` — typecheck passes

**Completion criterion:** `runMaterialMetadataWrite` discovers files through manifests, resolves credits, applies fallback, and embeds full metadata via exiftool.

**Human review:** no

---

### Step 7. Rewrite `runMaterialMetadataValidate`

**Goal:** Replace `dist/` scanning with manifest-based discovery and add `META-01` through `META-04` diagnostics.

**Agent actions:**

- Import the same manifest reader helpers from Step 2
- Replace the current `dist/` scanning loop with manifest-based file discovery
- For each file with a `MaterialCredit` sidecar:
  - Run `exiftool -json` to read embedded metadata
  - Check `META-01`: copyright field present
  - Check `META-02`: creator field present when credit has a creator party
  - Check `META-03`: copyright notice matches `credit.license.copyrightNotice`
  - Check `META-04`: WebStatement field present when credit has `license.url`
- For each file without a sidecar:
  - Check `META-01`: copyright field present (organizational fallback)
- Add `META-01` through `META-04` rule definitions to `diagnostics/rules/core-infra.ts`
- Preserve exiftool-unavailable graceful skip

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** `runMaterialMetadataValidate` discovers files through manifests, checks embedded metadata, and reports `META-01` through `META-04` diagnostics.

**Human review:** no

---

### Step 8. Update `GENERATOR_OWNERSHIP_MAP` and command descriptions

**Goal:** Register `material.metadata.write` outputs in the ownership map and update command descriptions.

**Agent actions:**

- Add entries to `GENERATOR_OWNERSHIP_MAP` in `generator-ownership.ts` for `public/_video/**` and `public/_img/**` if not already present (check existing entries first — `material.metadata.write` may already be registered for `dist/` paths that need updating)
- Update command description in `command-tables/09-build-artifacts.ts` for `material.metadata.validate`
- Update command description in `service.module.template.ts` for `material.metadata.write`
- Run `command.manifest.validate` to verify no CMD-MAN-03 drift

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec site-kernel run command.manifest.validate --json` — no warnings

**Completion criterion:** `GENERATOR_OWNERSHIP_MAP` entries match the command's `writes` declarations, and command descriptions reflect manifest-based discovery.

**Human review:** no

---

### Step 9. Synchronize documentation

**Goal:** Update Compass XML and AGENTS.md files to reflect the new pipeline position and command behavior.

**Agent actions:**

- Update `docs/verification-plan.xml`: move `material.metadata.write` in the `build-prepare` pipeline step list to after `live.variants.generate`
- Update `packages/os/site-kernel-checks/AGENTS.md`: update the `material.metadata.validate` module description to mention manifest-based discovery and `META-01` through `META-04` diagnostics
- Run `ecosystem.manifest.generate` if command surfaces or pipeline topology changed

**Validation:**

- `pnpm exec site-kernel run ecosystem.manifest.validate --json` — no drift
- `pnpm exec site-kernel run workspace.surface.validate --json` — no drift

**Completion criterion:** All documentation artifacts in `scope.docs` are updated and validation passes.

**Human review:** no

---

### Step 10. Final validation and RFC stamping

**Goal:** Verify all acceptance criteria, run full validation suite, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0528 --json` — must pass
- Run `pnpm --filter @gogol/site-kernel-codegen run build:check` — must pass
- Run `pnpm --filter @gogol/site-kernel-checks run build:check` — must pass
- Check off all 11 acceptance criteria in the RFC with inline `(evidence: ...)` annotations
- Stamp the RFC: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0528 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate RFC-0528 --json` — pass

**Completion criterion:** All acceptance criteria verified, RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0528 --json`
- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run command.manifest.validate --json`
- `pnpm exec site-kernel run ecosystem.manifest.validate --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0528` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0528.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| exiftool availability | Step 6 preserves graceful skip; Step 7 preserves graceful skip |
| Manifest staleness | Step 1 positions `material.metadata.write` after variant generators; `generated.files.validate` (line 108) catches missing files |
| WebP metadata support | No mitigation needed — metadata is present in the file regardless of reader support |
| Content reference resolution failures | Step 4 uses `substituteContentReferences` which gracefully degrades when RFC-0527 index is not yet available; `content.ref-index.validate` (RFC-0527) catches unresolved references when implemented |
| exiftool performance with many files | Step 5 implements batching for files with identical metadata and concurrency limit for credit-specific metadata |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0528 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If RFC-0527 (content reference index) is not yet implemented, Step 4 degrades gracefully — `substituteContentReferences` returns raw strings. This is acceptable; the RFC explicitly depends on RFC-0527 but the implementation can proceed with unresolved references (they will be treated as literal strings).
- If `loadSemanticSiteModel` fails to load (e.g. missing `system.md`), log a warning and skip the fallback. Files without credits will get no metadata — same as current behavior. This is a graceful degradation, not a blocking error.
