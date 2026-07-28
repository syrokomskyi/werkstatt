---
rfcId: RFC-0487
planId: PLAN-RFC-0487-01
status: draft
owner: architecture
createdAt: 2026-07-22
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/ontology"
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - docs/requirements.xml
    - docs/technology.xml
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0487

## 1. Objectives

- [ ] O1 — Add `retiredRoutes` and `businessModel` fields to `systemManifestSchema` in `@gogol/ontology` (maps to acceptance: `retiredRoutes` field in `system.md`, `businessModel: b2b-only` declared)
- [ ] O2 — Extend `buildRetiredSurfaceRedirectBlock` to emit 410 entries from `retiredRoutes` (maps to acceptance: `/widerruf/` and `/widerruf-formular/` return HTTP 410)
- [ ] O3 — Implement `b2b.model.validate` command in `@gogol/site-kernel-checks` and wire into `sites-check-author` pipeline (maps to acceptance: `b2b.model.validate --app warpgogol-com` exits 0)
- [ ] O4 — Remove widerruf/musterWiderruf from warpgogol-com `system.md`, navigation, labels, PBP terms, site meta, and delete 8 page/prose files (maps to acceptance: no widerruf entries remain, 8 files deleted)
- [ ] O5 — Update Compass docs and AGENTS.md (maps to acceptance: `docs/requirements.xml`, `docs/technology.xml`, `packages/os/site-kernel-checks/AGENTS.md` synchronized)
- [ ] O6 — Validate full pipeline passes (maps to acceptance: `redirect.map.validate`, `surface.contract.validate`, `content.references.validate` all pass)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/schemas/system/manifest.ts` — add `retiredRoutes` and `businessModel` fields to `systemManifestSchema`
- `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` — extend `buildRetiredSurfaceRedirectBlock` to read `retiredRoutes` and emit 410 entries
- `packages/os/site-kernel-codegen/src/app-boilerplate.ts` — no change needed (already calls `buildRetiredSurfaceRedirectBlock`)
- `packages/os/site-kernel-checks/src/b2b-model.ts` — new file: `b2b.model.validate` command handler
- `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` — register `b2b.model.validate` command entry
- `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` — add `{ command: "b2b.model.validate" }` to pipeline
- `packages/os/site-kernel-checks/src/module.ts` — export `runB2bModelValidate` if needed for module registration

### 2.2 Configuration and data

- `systems/warpgogol-com/src/content/system.md` — remove `widerruf` and `musterWiderruf` page entries, add `businessModel: b2b-only` and `retiredRoutes` fields, update page-level rationale
- `systems/warpgogol-com/src/content/navigation/de/navigation.md` — remove widerruf/musterWiderruf nav entries (lines 80-93)
- `systems/warpgogol-com/src/content/navigation/uk/navigation.md` — remove widerruf/musterWiderruf nav entries (lines 80-93)
- `systems/warpgogol-com/src/content/site/de/labels.md` — remove widerruf/musterWiderruf from `legalIds`
- `systems/warpgogol-com/src/content/site/uk/labels.md` — remove widerruf/musterWiderruf from `legalIds`
- `systems/warpgogol-com/src/content/site/de/meta.md` — remove `widerrufCreationDate`, `widerrufFormCreationDate`
- `systems/warpgogol-com/src/content/business-profile/de/documents/terms.md` — remove `widerrufCreationDate`, `widerrufFormCreationDate`
- Delete: `systems/warpgogol-com/src/content/pages/de/widerruf.md`
- Delete: `systems/warpgogol-com/src/content/pages/uk/widerruf.md`
- Delete: `systems/warpgogol-com/src/content/pages/de/muster-widerruf.md`
- Delete: `systems/warpgogol-com/src/content/pages/uk/muster-widerruf.md`
- Delete: `systems/warpgogol-com/src/content/prose/de/widerruf.md`
- Delete: `systems/warpgogol-com/src/content/prose/uk/widerruf.md`
- Delete: `systems/warpgogol-com/src/content/prose/de/muster-widerruf.md`
- Delete: `systems/warpgogol-com/src/content/prose/uk/muster-widerruf.md`

### 2.3 Documentation and specs

- `docs/requirements.xml` — document `businessModel` and `retiredRoutes` fields
- `docs/technology.xml` — add `b2b.model.validate` to command surface
- `packages/os/site-kernel-checks/AGENTS.md` — document `b2b.model.validate` in the command table

### 2.4 Validation and pipelines

- `sites-check-author` pipeline — add `b2b.model.validate` step
- `redirect.map.validate` — existing, validates 410 entries (no change needed)
- `surface.contract.validate` — existing, validates Layer C (no change needed)
- `content.references.validate` — existing, validates content references (no change needed)

## 3. Step sequence

### Step 1. Add `retiredRoutes` and `businessModel` schema fields to `@gogol/ontology`

**Goal:** Extend `systemManifestSchema` with the two new fields so `system.md` can declare them.

**Agent actions:**

- Add `retiredRouteSchema` (z.object with `slug: z.string().min(1)`, `status: z.literal(410)`) to `packages/ontology/src/schemas/system/manifest.ts`
- Add `businessModelSchema` (z.enum(["b2b-only"])) to the same file
- Add `retiredRoutes: z.array(retiredRouteSchema).optional().default([])` to `systemManifestSchema`
- Add `businessModel: businessModelSchema.optional()` to `systemManifestSchema`
- Export `retiredRouteSchema` and `businessModelSchema` from the package entrypoint

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` passes
- `pnpm exec site-kernel run system.manifest.validate --app warpgogol-com` still passes (existing system.md without new fields is valid because fields are optional)

**Completion criterion:** `systemManifestSchema` includes `retiredRoutes` and `businessModel` fields; `@gogol/ontology` build passes; existing system.md still validates.

**Human review:** no

---

### Step 2. Extend `buildRetiredSurfaceRedirectBlock` to emit 410 entries from `retiredRoutes`

**Goal:** The `_redirects` generator reads `retiredRoutes` from the manifest and emits 410 entries for each retired slug.

**Agent actions:**

- In `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts`, extend `buildRetiredSurfaceRedirectBlock` to read `manifest.retiredRoutes` (if present) and emit `/<slug>/* / 410` lines for each entry
- Add a comment header `# [RFC-0487] Retired page routes — 410 Gone tombstones.` for the retired page routes section
- Ensure 410 entries are sorted and deduplicated against existing redirect entries

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check` passes
- Manual inspection: generated `_redirects` output includes 410 entries when `retiredRoutes` is present in a test manifest

**Completion criterion:** `buildRetiredSurfaceRedirectBlock` emits 410 entries for `retiredRoutes` slugs; codegen build passes.

**Human review:** no

---

### Step 3. Implement `b2b.model.validate` command in `@gogol/site-kernel-checks`

**Goal:** New command that checks B2C references are absent when `businessModel: b2b-only` is declared.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/b2b-model.ts` with `runB2bModelValidate` function
- Read `system.md` frontmatter; if `businessModel` is absent or not `b2b-only`, return exit 0 (no-op)
- Implement checks:
  - B2B-PAGE-01: no `pageId: widerruf` or `pageId: musterWiderruf` in `pages[]`
  - B2B-ROUTE-01: no B2C route slugs in `pages[]` routes
  - B2B-CONFLICT-01: no `retiredRoutes` slug also present as active route in `pages[]`
  - B2B-LABEL-01: no navigation entries with `semanticTarget.pageId: widerruf` or `musterWiderruf`
  - B2B-PROSE-01: no § 312g BGB or § 312j BGB references in prose files
  - B2B-PROSE-02: no "Verbraucher-Widerrufsrecht" in prose files
- Scan scope: `src/content/prose/**` and `src/content/pages/**` for declared locales
- Register command in `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` with `scope: "app"`, `supportsAllApps: true`
- Add `{ command: "b2b.model.validate" }` to `sites-check-author` pipeline in `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- `pnpm exec site-kernel run b2b.model.validate --app warpgogol-com --json` exits 0 (no `businessModel` field yet → no-op)

**Completion criterion:** `b2b.model.validate` command is registered, runs as no-op for apps without `businessModel`, and is wired into `sites-check-author` pipeline.

**Human review:** no

---

### Step 4. Update Compass docs and AGENTS.md

**Goal:** Synchronize documentation with the new schema fields and command.

**Agent actions:**

- Update `docs/requirements.xml` — add `businessModel` and `retiredRoutes` field documentation
- Update `docs/technology.xml` — add `b2b.model.validate` to the command surface
- Update `packages/os/site-kernel-checks/AGENTS.md` — add `b2b.model.validate` row to the command table

**Validation:**

- `pnpm exec site-kernel run compass.validate` passes
- `pnpm exec site-kernel run ecosystem.manifest.validate` passes (if applicable)

**Completion criterion:** All three documentation files updated and validated.

**Human review:** no

---

### Step 5. Apply site content changes to warpgogol-com (via mission workpiece)

**Goal:** Remove widerruf/musterWiderruf from warpgogol-com and add `retiredRoutes` + `businessModel` fields.

**Agent actions:**

- **PREREQUISITE:** Cross-page cleanup sessions (expert files 4-8) must be completed first. If not done, STOP and report to the operator.
- Open a mission workpiece for warpgogol-com (RFC-0480)
- Edit `system.md`: remove `widerruf` and `musterWiderruf` page entries, add `businessModel: b2b-only` and `retiredRoutes` with 4 entries, update page-level rationale (line 709)
- Edit `navigation/de/navigation.md`: remove widerruf/musterWiderruf entries
- Edit `navigation/uk/navigation.md`: remove widerruf/musterWiderruf entries
- Edit `site/de/labels.md`: remove widerruf/musterWiderruf from `legalIds`
- Edit `site/uk/labels.md`: remove widerruf/musterWiderruf from `legalIds`
- Edit `site/de/meta.md`: remove `widerrufCreationDate`, `widerrufFormCreationDate`
- Edit `business-profile/de/documents/terms.md`: remove `widerrufCreationDate`, `widerrufFormCreationDate`
- Delete 8 page/prose files (4 page + 4 prose, DE + UK × widerruf + muster-widerruf)
- Run `public.infrastructure.generate` to regenerate routes and `_redirects`

**Validation:**

- `pnpm exec site-kernel run b2b.model.validate --app warpgogol-com --json` exits 0
- `pnpm exec site-kernel run redirect.map.validate --app warpgogol-com` exits 0
- `pnpm exec site-kernel run content.references.validate --app warpgogol-com` exits 0
- `pnpm exec site-kernel run surface.contract.validate --app warpgogol-com` exits 0
- `pnpm exec site-kernel run system.manifest.validate --app warpgogol-com` exits 0

**Completion criterion:** All validation commands pass; no widerruf/musterWiderruf entries remain in system.md, navigation, labels, or PBP terms; 8 files deleted; `retiredRoutes` and `businessModel` declared in system.md.

**Human review:** yes — operator must confirm cross-page cleanup (expert files 4-8) is complete before this step runs.

---

### Step 6. Run full validation suite and stamp implemented

**Goal:** Verify all acceptance criteria pass and transition RFC to `implemented`.

**Agent actions:**

- Run full `build:check` for warpgogol-com
- Run `rfc.validate RFC-0487` to verify frontmatter
- Run `rfc.verification.emit RFC-0487` (if acceptance probes declared)
- Update RFC frontmatter: `status: implemented`, `implementedAt: 2026-07-22`
- Move `b2b.model.validate` from `commands.proposed` to `commands.added`

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0487 --json` exits 0
- `pnpm exec site-kernel run app.contract.full --app warpgogol-com` exits 0

**Completion criterion:** RFC status is `implemented`; all acceptance criteria checkboxes can be checked; full build passes.

**Human review:** yes — operator must verify all acceptance criteria are met before stamping implemented.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0487`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run b2b.model.validate --app warpgogol-com --json`
- `pnpm exec site-kernel run redirect.map.validate --app warpgogol-com`
- `pnpm exec site-kernel run content.references.validate --app warpgogol-com`
- `pnpm exec site-kernel run surface.contract.validate --app warpgogol-com`
- `pnpm exec site-kernel run system.manifest.validate --app warpgogol-com`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0487.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0487` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Build breakage if rollout order is not followed | Step 5 has a prerequisite check: cross-page cleanup must complete first |
| Agent misinterpretation risk | Step 5 implementation notes forbid editing AGB/Impressum/Datenschutz directly |
| False positives in `b2b.model.validate` | Step 3 B2B-LABEL-01 targets `semanticTarget.pageId` entries, not label text |
| Search engine indexing | Step 2 emits 410 Gone — search engines will deindex |
| Legal review | Step 5 prerequisite: AGB session (file 6) must complete first |
| External backlinks | Step 2 emits 410 Gone — correct behavior for permanently removed content |

## 6. Escalation triggers

- If implementation reveals that `retiredRoutes` conflicts with existing `redirect.map.validate` logic (e.g., 410 entries not supported for page routes), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0487 --reason "retiredRoutes 410 mechanism incompatible with redirect.map.validate" --invariant "DNA-39"` instead of working around it.
- If `b2b.model.validate` false positive rate is unacceptably high for legitimate B2B "Widerruf ausschließen" usage, refine the B2B-LABEL-01 check to match only `semanticTarget.pageId: widerruf` entries, not label text. Do not suppress the check entirely.
- If cross-page cleanup sessions (expert files 4-8) cannot be completed, STOP at Step 5 and report to the operator. Do not deploy route removal without cross-page cleanup.
