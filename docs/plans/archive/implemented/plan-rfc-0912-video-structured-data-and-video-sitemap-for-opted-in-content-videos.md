---
rfcId: RFC-0912
planId: PLAN-RFC-0912-01
status: draft
owner: architecture
createdAt: 2026-08-22
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-shared"
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - packages/werkstatt-shared/AGENTS.md
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0912

## 1. Objectives

- [ ] O1 — `video-section` archetype exposes `seo.videoObject` opt-in with required `name`/`description`/`uploadDate`; hero/background archetypes do not — maps to acceptance criterion 1
- [ ] O2 — `VideoObject` JSON-LD node emitted from the variant manifest for opted-in videos — maps to acceptance criterion 2
- [ ] O3 — `sitemap.generate` reordered after `video.variants.generate`; emits `sitemap-video.xml` and index entry when opted-in videos exist; generator ownership registered — maps to acceptance criterion 3
- [ ] O4 — `video.structured-data.validate` registered (app scope, postbuild) with VIDEO-SEO-01..05 and wired into `SITES_CHECK_POSTBUILD_PIPELINE` as error — maps to acceptance criteria 4 and 5
- [ ] O5 — Unit tests: opt-in emits node, hero video never emits, missing field fails, sitemap parity — maps to acceptance criterion 6
- [ ] O6 — warpgogol-com passes the validator (zero opted-in videos → trivial pass) — maps to acceptance criterion 7
- [ ] O7 — `AGENTS.md` updated, `rfc.validate` passes, review and fix complete, RFC stamped implemented — maps to acceptance criteria 8 and 9

## 2. Affected artifacts

### 2.1 Code and commands

| Artifact | Change |
| --- | --- |
| `packages/werkstatt-site/src/domain/ontology/archetypes/sections/video-section.yaml` | Add `seo` opt-in to `propsSchema.shape` |
| `packages/werkstatt-shared/src/share/semantic/models.ts` | `SemanticBlock` extended with optional `video?: VideoSeoData` field |
| `packages/werkstatt-shared/src/share/semantic/build-page.ts` | `buildSemanticPageModelWith` reads variant manifest and populates `video` for opted-in blocks |
| `packages/werkstatt-shared/src/share/semantic/jsonld/video.ts` | New `buildVideoObjectNode` builder |
| `packages/werkstatt-shared/src/share/semantic/jsonld.ts` | `buildJsonLd` composition: include video nodes when opted-in |
| `packages/werkstatt-shared/src/share/semantic/jsonld/types.ts` | Add `VideoObjectNode` type if not inline |
| `packages/werkstatt-site/src/checks/sitemap.ts` | `sitemap.generate` extended to emit `sitemap-video.xml` + index entry |
| `packages/werkstatt-site/src/checks/sitemap-helpers.ts` | Add `VIDEO_SITEMAP_FILENAME` and video sitemap XML formatter |
| `packages/werkstatt-site/src/checks/generator-ownership.ts` | Register `public/sitemap-video.xml` under `sitemap.generate` |
| `packages/werkstatt-site/src/checks/audit/validators/video-structured-data.ts` | New `video.structured-data.validate` handler |
| `packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts` | Register `video.structured-data.validate` command |
| `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` | Add `video.structured-data.validate` to `SITES_CHECK_POSTBUILD_PIPELINE` |
| `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts` | `video.variants.generate` reordered to run before `sitemap.generate` |

### 2.2 Configuration and data

| Artifact | Change |
| --- | --- |
| `packages/werkstatt-site/src/domain/ontology/archetypes/sections/video-section.yaml` | `propsSchema.shape` extended with `seo` object |

### 2.3 Documentation and specs

| Artifact | Change |
| --- | --- |
| `packages/werkstatt-shared/AGENTS.md` | Document new `video.ts` jsonld builder and `VideoObjectNode` export |
| `packages/werkstatt-site/AGENTS.md` | Document `video.structured-data.validate` command and VIDEO-SEO-01..05 rules |

### 2.4 Validation and pipelines

| Pipeline                         | Change                                                    |
| -------------------------------- | --------------------------------------------------------- |
| `SITES_BUILD_PREPARE_PIPELINE`   | `video.variants.generate` moved before `sitemap.generate` |
| `SITES_CHECK_POSTBUILD_PIPELINE` | `video.structured-data.validate` added as error           |

## 3. Step sequence

### Step 1. Extend `video-section` archetype props schema

**Goal:** Add the `seo.videoObject` opt-in to the sole content-video archetype.

**Agent actions:**

- Edit `packages/werkstatt-site/src/domain/ontology/archetypes/sections/video-section.yaml`
- Add `seo` to the `z.object({ ... })` in `propsSchema.shape`:
  ```yaml
  seo: z.object({
    videoObject: z.literal(true),
    name: z.string(),
    description: z.string(),
    uploadDate: z.string(),
  }).optional()
  ```
- Do NOT add `seo` to hero, background, or any other archetype.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `video-section.yaml` props schema includes `seo` with `videoObject`, `name`, `description`, `uploadDate`; no other archetype is touched.

**Human review:** no

---

### Step 2. Create `VideoObject` JSON-LD builder and extend `SemanticBlock`

**Goal:** Add the `video.ts` node builder in `werkstatt-shared`, extend `SemanticBlock` with video data, and wire it into `buildJsonLd`.

**Agent actions:**

- Edit `packages/werkstatt-shared/src/share/semantic/models.ts`:
  - Add `VideoSeoData` interface: `{ seo: { name, description, uploadDate }, manifest: { posterUrl, durationSec?, contentUrl } }`
  - Add optional `video?: VideoSeoData` field to `SemanticBlock`
- Edit `packages/werkstatt-shared/src/share/semantic/build-page.ts`:
  - In `buildSemanticPageModelWith`, after extracting blocks, read the variant manifest (`src/video-manifest.generated.yaml`)
  - For each block with `seo.videoObject: true`, match the block's video source to the manifest entry and populate `block.video`
  - Skip blocks without the opt-in (hero/background blocks never get `video` data)
- Create `packages/werkstatt-shared/src/share/semantic/jsonld/video.ts` with `buildVideoObjectNode(context)`:
  - Reads `context.page.blocks` for blocks with `video` field
  - Returns `VideoObjectNode` or `null` when no opted-in video on the page
- Add `VideoObjectNode` type to `packages/werkstatt-shared/src/share/semantic/jsonld/types.ts`
- Update `packages/werkstatt-shared/src/share/semantic/jsonld.ts` `buildJsonLd`:
  - Import `buildVideoObjectNode`
  - Add `...(videoNode ? [videoNode] : [])` to the `dedupeGraph` array
- Export `buildVideoObjectNode` from `packages/werkstatt-shared/src/share/semantic/jsonld/index.ts` barrel

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run build:check`

**Completion criterion:** `SemanticBlock` has optional `video` field, `buildSemanticPageModelWith` populates it from variant manifest, `buildVideoObjectNode` is exported, `buildJsonLd` includes video nodes when opted-in, typecheck passes.

**Human review:** no

---

### Step 3. Reorder `video.variants.generate` in build-prepare pipeline

**Goal:** Move `video.variants.generate` before `sitemap.generate` so the variant manifest is available when the sitemap is generated.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts`
- Move the `{ command: "video.variants.generate", expectedDurationMs: 180_000, timeoutMs: 1_200_000 }` step from its current position (line 136) to just before `{ command: "sitemap.generate" }` (line 113)
- `sitemap.generate` is NOT in `SITES_BUILD_PREPARE_DEV_PIPELINE` (excluded per RFC-0597), so no dev pipeline change is needed
- Verify no step between the old and new position depends on `video.variants.generate` being after them (image.variants.generate at 134 is independent, live.variants.generate at 138 is independent, material.metadata.write at 141 reads variants but runs after both positions)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `video.variants.generate` appears before `sitemap.generate` in `SITES_BUILD_PREPARE_PIPELINE`. No change to `SITES_BUILD_PREPARE_DEV_PIPELINE`.

**Human review:** no

---

### Step 4. Extend `sitemap.generate` to emit `sitemap-video.xml`

**Goal:** Add video sitemap emission to the existing sitemap generator.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/sitemap-helpers.ts`:
  - Add `VIDEO_SITEMAP_FILENAME = "sitemap-video.xml"`
  - Add `generateVideoSitemapXml(entries)` — formats `<urlset>` with `xmlns:video` and `<video:video>` entries; writes empty `<urlset>` when entries is empty
  - Add `buildVideoSitemapEntries(clusters, videoManifest, siteUrl)` — scans page frontmatter for `seo.videoObject: true`, matches to variant manifest entries, builds `<url> → <video:video>` per language
- Edit `packages/werkstatt-site/src/checks/sitemap.ts`:
  - In `runSitemapGenerate`, after generating content/legal sub-sitemaps, scan for opted-in videos
  - Always write `public/sitemap-video.xml` (empty `<urlset>` when no opted-in videos)
  - Always add `<sitemap>` entry for `sitemap-video.xml` to the sitemap index
- Register `public/sitemap-video.xml` in `GENERATOR_OWNERSHIP_MAP` (`packages/werkstatt-site/src/checks/generator-ownership.ts`):
  ```ts
  {
    path: "public/sitemap-video.xml",
    command: "sitemap.generate",
    markerPolicy: "registry-only",
    module: "packages/werkstatt-site/src/checks/sitemap.ts",
  },
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `sitemap.generate` always writes `sitemap-video.xml` (empty when no opted-in videos) and includes it in the sitemap index; ownership map includes the new file; typecheck passes.

**Human review:** no

---

### Step 5. Create `video.structured-data.validate` command

**Goal:** Implement the postbuild validator with VIDEO-SEO-01..05 rules.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/audit/validators/video-structured-data.ts`:
  - `runVideoStructuredDataValidate(input, context)` — reads `dist/client/**/*.html`, `dist/client/sitemap-video.xml`, and page frontmatter
  - VIDEO-SEO-01: opted-in block missing `name`/`description`/`uploadDate` → error
  - VIDEO-SEO-02: opted-in video has no `VideoObject` in rendered HTML → error
  - VIDEO-SEO-03: rendered `VideoObject` traces to non-opted-in or hero/background block → error
  - VIDEO-SEO-04: `sitemap-video.xml` entry missing for opted-in video, or entry for non-opted-in → error
  - VIDEO-SEO-05: `VideoObject` `duration` absent → warning
  - Skip gracefully when `dist/` is not built (postbuild pattern)
- Register in `packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts`:
  ```ts
  {
    name: "video.structured-data.validate",
    description: "Validate VideoObject JSON-LD and sitemap-video.xml parity for opted-in content videos (RFC-0912).",
    scope: "app",
    ...
    execute: runVideoStructuredDataValidate,
  },
  ```
- Wire into `SITES_CHECK_POSTBUILD_PIPELINE` in `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts`:
  - Add `{ command: "video.structured-data.validate" }` after `dist.sitemap.images.validate`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** Command registered, handler exported, pipeline step added, typecheck passes.

**Human review:** no

---

### Step 6. Unit tests

**Goal:** Cover opt-in emission, hero exclusion, missing field failure, and sitemap parity.

**Agent actions:**

- Create `packages/werkstatt-shared/src/share/tests/jsonld-video.test.ts`:
  - Test: opted-in video block → `buildVideoObjectNode` returns `VideoObject` with `name`, `description`, `uploadDate`, `thumbnailUrl`, `contentUrl` from manifest
  - Test: no opted-in video → `buildVideoObjectNode` returns `null`
  - Test: missing `durationSec` → `duration` absent (VIDEO-SEO-05 condition)
- Create `packages/werkstatt-site/src/checks/tests/video-structured-data.test.ts`:
  - Test: opted-in block with all fields → VIDEO-SEO pass
  - Test: opted-in block missing `name` → VIDEO-SEO-01 error
  - Test: rendered VideoObject without opt-in → VIDEO-SEO-03 error
  - Test: sitemap-video.xml entry missing for opted-in → VIDEO-SEO-04 error
  - Test: hero/background video never produces VideoObject
  - Test: zero opted-in videos → trivial pass, sitemap-video.xml is empty `<urlset>`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run test`
- `pnpm --filter @warpgogol/werkstatt-site run test`

**Completion criterion:** All tests pass; test files exist at the specified paths.

**Human review:** no

---

### Step 7. Documentation updates

**Goal:** Update AGENTS.md files with new command and builder documentation.

**Agent actions:**

- Update `packages/werkstatt-shared/AGENTS.md`: document `video.ts` jsonld builder in the semantic section
- Update `packages/werkstatt-site/AGENTS.md`: add `video.structured-data.validate` to the notable check commands list with VIDEO-SEO-01..05 rule descriptions

**Validation:**

- Visual review of AGENTS.md sections

**Completion criterion:** Both AGENTS.md files mention the new builder and command with rule descriptions.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0912 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0912`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0912`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0912`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476). Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0912`
- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-shared run test`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0912`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0912` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0912.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0912` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Spam-signal inversion — wrong markup on decorative videos | Step 1: `seo` prop only on `video-section` archetype; Step 5: VIDEO-SEO-03 catches markup without opt-in |
| Google video-sitemap schema drift | Step 5: validator checks our own contract, not Google's full schema |
| Manifest coupling — JSON-LD builder depends on variant-manifest fields | Step 2: `buildVideoObjectNode` degrades gracefully on missing fields; Step 5: VIDEO-SEO-05 warns on missing duration |
| Agent misinterpretation — adding opt-in to hero/background | Step 1: explicitly only `video-section`; Step 7: AGENTS.md documents the exclusion |
| Pipeline reorder breaks downstream steps | Step 3: verified no step between 114–136 reads `sitemap.xml` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-16 (semantic layer shares topology with navigation), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0912 --reason "..." --invariant "DNA-16"` instead of working around it.
- If the variant manifest format has changed incompatibly since RFC-0210, do not adapt the builder silently — file a new RFC to amend RFC-0210's manifest contract.
