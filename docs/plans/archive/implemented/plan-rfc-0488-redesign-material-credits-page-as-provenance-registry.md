---
rfcId: RFC-0488
planId: PLAN-RFC-0488-01
status: draft
owner: architecture
createdAt: 2026-07-22
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/share"
    - "@gogol/ui"
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - packages/share/AGENTS.md
    - docs/rfcs/archive/implemented/rfc-0220-introduce-site-wide-material-credits-and-provenance-disclosures.md
    - docs/rfcs/archive/implemented/rfc-0232-render-the-material-credits-page-as-an-optimized-media-gallery.md
---

# Implementation Plan: RFC-0488

## 1. Objectives

- [ ] O1 — Extend `materialCreditSchema` with `status`, `usageBasis`, `aiUsage` fields; extend `materialSourceTypeSchema` with 5 new values; extend `creditRoleSchema` with 4 new roles — maps to acceptance criteria 1-3.
- [ ] O2 — Extend `materialCreditLabelsSchema` with `sourceTypeLabels`, `statusLabels`, `usageBasisLabels`, `aiUsageLabels`, `usedOnLabel`, `verifiedAtLabel`, `noPreviewLabel`, `copyrightExplanation`; export label mapping helpers from `@gogol/share` — maps to acceptance criteria 4-5.
- [ ] O3 — Update `material.credits.generate` to render human-readable labels, AI-specific provenance, usage locations, and stable anchors — maps to acceptance criteria 6-9.
- [ ] O4 — Update `credits-gallery-section.astro` to render type badges, AI section, usage locations, status badges, stable anchors, and neutral placeholders — maps to acceptance criteria 10-11.
- [ ] O5 — Add new validation rules to `material.credits.validate` (fail + warn) — maps to acceptance criterion 12.
- [ ] O6 — Implement and register RFC-0488 migrator in `@gogol/site-kernel-handoff` — maps to acceptance criterion 13.
- [ ] O7 — Add new `materialCredits` label keys to `src/content/site/{lang}/labels.md` for DE and UK — maps to acceptance criterion 14.
- [ ] O8 — Operator rights audit of Stuttgart Marathon photo and Komoot screenshot — maps to acceptance criterion 15.
- [ ] O9 — Full validation passes: `material.credits.validate`, `content.references.validate`, dev build, `rfc.validate` — maps to acceptance criteria 16-19.

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/schemas/material-credit.ts` — extend `materialCreditSchema`, `materialSourceTypeSchema`, `creditRoleSchema`, `materialCreditLabelsSchema`.
- `packages/share/src/material-credits.ts` — add `labelForSourceType`, `labelForStatus`, `labelForUsageBasis` helpers; update `formatMaterialCreditLine` to use label mapping.
- `packages/os/site-kernel-codegen/src/service.ts` — update `renderMaterialCreditProse` with label mapping, AI fields, usage locations, anchors; update `runGenerateMaterialCreditsPage` to emit usage locations.
- `packages/ui/src/sections/credits-gallery/credits-gallery-section.astro` — render type badges, AI section, usage locations, status badges, anchors, neutral placeholder, `copyrightExplanation` at bottom.
- `packages/os/site-kernel-checks/src/material-credits.ts` — add new validation rules: `missing-preview`, `blocked-status`, `expired-status`, `missing-usage-basis`, `unverified-usage-basis`, `organization-as-author`, `ai-copyright-overstatement` (fail); `orphaned-status`, `needs-review-status` (warn).
- `packages/os/site-kernel-handoff/src/migrators/rfc-0488.ts` — new migrator file.
- `packages/os/site-kernel-handoff/src/migrators/rfc-0488.pbt.test.ts` — PBT test (idempotency).
- `packages/os/site-kernel-handoff/src/migrators/rfc-0488.snapshot.test.ts` — snapshot test on real data.
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — register `rfc0488Migrator`.
- Site OS commands: `material.credits.validate`, `material.credits.generate`, `material.credits.report` (changed, not new).

### 2.2 Configuration and data

- `missions/*/workpiece/src/content/site/{lang}/labels.md` — new `materialCredits` label keys for DE and UK (all 10 `sourceType` values, 5 `status` values, 8 `usageBasis.type` values, `copyrightExplanation`).
- `missions/*/workpiece/src/content/**/assets/*.credits.yaml` — migrated by the RFC-0488 migrator (status, aiUsage, usageBasis fields added).

### 2.3 Documentation and specs

- `packages/share/AGENTS.md` — document new label mapping helpers and schema extensions.
- `docs/rfcs/archive/implemented/rfc-0220-*.md` — add `RFC-0488` to `amendedBy` frontmatter.
- `docs/rfcs/archive/implemented/rfc-0232-*.md` — add `RFC-0488` to `amendedBy` frontmatter.
- `docs/technology.xml` — update if it tracks `@gogol/share` schema exports (check during implementation).

### 2.4 Validation and pipelines

- `APPS_CHECK_AUTHOR_PIPELINE` — `material.credits.validate` already wired; new rules activate when the validator code is updated.
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/ui run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run migrator.registry.validate`
- `pnpm exec site-kernel run rfc.validate RFC-0488`

## 3. Step sequence

### Step 1. Extend schemas in `@gogol/share`

**Goal:** Add new fields to `materialCreditSchema`, extend enums, extend labels schema.

**Agent actions:**

- Add `status`, `usageBasis`, `aiUsage` optional fields to `materialCreditSchema` in `packages/share/src/schemas/material-credit.ts`.
- Add `commissioned`, `licensed-third-party`, `customer-supplied`, `public-domain`, `screenshot` to `materialSourceTypeSchema`.
- Add `editor`, `contributor`, `photographer`, `illustrator` to `creditRoleSchema`.
- Add `sourceTypeLabels` (Record<MaterialSourceType, string>), `statusLabels` (Record<MaterialCreditStatus, string>), `usageBasisLabels` (Record<UsageBasisType, string>), `aiUsageLabels`, `usedOnLabel`, `verifiedAtLabel`, `noPreviewLabel`, `copyrightExplanation` to `materialCreditLabelsSchema`.
- Export `MaterialCreditStatus`, `UsageBasisType` types.

**Validation:**

- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** `@gogol/share` builds with extended schemas; new types are exported.

**Human review:** no

---

### Step 2. Add label mapping helpers in `@gogol/share`

**Goal:** Export `labelForSourceType`, `labelForStatus`, `labelForUsageBasis` from `@gogol/share/material-credits`.

**Agent actions:**

- Add `labelForSourceType(sourceType: MaterialSourceType, labels: MaterialCreditLabels): string` to `packages/share/src/material-credits.ts`.
- Add `labelForStatus(status: MaterialCreditStatus, labels: MaterialCreditLabels): string`.
- Add `labelForUsageBasis(type: UsageBasisType, labels: MaterialCreditLabels): string`.
- Update `formatMaterialCreditLine` to use `labelForSourceType` instead of raw `credit.sourceType`.

**Validation:**

- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** Label mapping helpers are exported and build passes.

**Human review:** no

---

### Step 3. Implement RFC-0488 migrator

**Goal:** Create idempotent migrator that transforms existing sidecar YAML files.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0488.ts`.
- Implement migrator logic:
  1. Add `status: active` to all records.
  2. For `ai-generated` records: add `aiUsage` with context-dependent `copyrightClaimed` (true if humanContribution or Person creator or non-default copyrightNotice; false otherwise).
  3. For `third-party` records: add `usageBasis: { type: "unverified", note: "Rights review required" }`.
  4. For `screenshot-of-linked-public-source` records: map `sourceType` to `screenshot`, add `usageBasis: { type: "unverified" }`.
  5. For `human-made` records with `creator: Organization`: rename role to `commissionedBy`, flag as `needs-review`.
- Register `rfc0488Migrator` in `packages/os/site-kernel-handoff/src/migrators/registry.ts`.
- Create `rfc-0488.pbt.test.ts` — idempotency test: `f(f(x)) === f(x)`.
- Create `rfc-0488.snapshot.test.ts` — snapshot test on real `warpgogol-com` sidecar data.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run migrator.registry.validate`

**Completion criterion:** Migrator is registered, idempotency PBT passes, snapshot test passes, `migrator.registry.validate` passes.

**Human review:** no

---

### Step 4. Update generator in `@gogol/site-kernel-codegen`

**Goal:** `renderMaterialCreditProse` and `runGenerateMaterialCreditsPage` use label mapping, render AI fields, usage locations, and stable anchors.

**Agent actions:**

- Update `renderMaterialCreditProse` in `packages/os/site-kernel-codegen/src/service.ts`:
  1. Use `labelForSourceType` instead of raw `credit.sourceType`.
  2. Render `usageBasis` line using `labelForUsageBasis`.
  3. Render AI-specific fields when `aiUsage` is present.
  4. Render usage locations list.
  5. Emit stable anchors (`## {id}` headings).
  6. Suppress repetitive copyright notices; render per-material usage status.
  7. Render `copyrightExplanation` at the bottom.
- Update `runGenerateMaterialCreditsPage` to discover usage locations by scanning page blocks for references to each credit's `target.id` (reuse `collectMaterialRefs` logic from `site-kernel-checks`).
- Update the prose template (`src/content/prose/credits.md.template`) if needed for new sections.

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run test`

**Completion criterion:** Generator builds; `renderMaterialCreditProse` output includes labels, AI fields, usage locations, anchors.

**Human review:** no

---

### Step 5. Update `credits-gallery-section.astro` in `@gogol/ui`

**Goal:** Gallery section renders type badges, AI section, usage locations, status badges, stable anchors, neutral placeholders, and `copyrightExplanation`.

**Agent actions:**

- Update `packages/ui/src/sections/credits-gallery/credits-gallery-section.astro`:
  1. Add `id={anchorForCredit(credit)}` to card `<li>` and `<h2>`.
  2. Render type badge using `labelForSourceType`.
  3. Render status badge using `labelForStatus` when `status` is present.
  4. Render AI section when `aiUsage` is present (copyright status, human contribution).
  5. Render usage locations list with page links.
  6. Replace single-letter placeholder with neutral type-labeled placeholder (e.g. `labels.noPreviewLabel`).
  7. Render `labels.copyrightExplanation` once at the bottom of the page.
- Update `credits-gallery-section.types.ts` if the prop shape changes (new optional fields from schema).

**Validation:**

- `pnpm --filter @gogol/ui run build:check`

**Completion criterion:** Gallery section builds; renders new fields without runtime errors.

**Human review:** no

---

### Step 6. Add validation rules in `@gogol/site-kernel-checks`

**Goal:** `material.credits.validate` enforces new fail and warn rules.

**Agent actions:**

- Add to `runMaterialCreditsValidate` in `packages/os/site-kernel-checks/src/material-credits.ts`:
  - `missing-preview` (fail): active record with no resolvable preview.
  - `blocked-status` (fail): blocked record present.
  - `expired-status` (fail): expired record present.
  - `missing-usage-basis` (fail): third-party/screenshot/commissioned record without `usageBasis`.
  - `unverified-usage-basis` (fail): record with `usageBasis.type: "unverified"`.
  - `organization-as-author` (fail): human-made record with Organization `creator` or `coCreator`.
  - `ai-copyright-overstatement` (fail): AI-generated record with `copyrightClaimed: true` but no `humanContribution`.
  - `orphaned-status` (warn): orphaned record present.
  - `needs-review-status` (warn): needs-review record present.
- Fail rules use `resultFromViolations` (exit 1); warn rules use `diagnosticsResult` (exit 0).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-checks run test`

**Completion criterion:** Validator builds; new rules fire correctly on test fixtures.

**Human review:** no

---

### Step 7. Add labels to `labels.md` (DE + UK)

**Goal:** `src/content/site/{lang}/labels.md` includes all new `materialCredits` label keys.

**Agent actions:**

- Add to `src/content/site/de/labels.md` and `src/content/site/uk/labels.md`:
  - `sourceTypeLabels` with all 10 values.
  - `statusLabels` with all 5 values.
  - `usageBasisLabels` with all 8 values.
  - `aiUsageLabels` with 5 sub-keys.
  - `usedOnLabel`, `verifiedAtLabel`, `noPreviewLabel`, `copyrightExplanation`.

**Validation:**

- `materialCreditLabelsSchema.parse()` passes on both label files.

**Completion criterion:** Both DE and UK labels files pass schema validation.

**Human review:** no — but operator should review label wording for legal accuracy.

---

### Step 8. Run migrator on `warpgogol-com`

**Goal:** Transform existing sidecar YAML files in the `warpgogol-com` workpiece.

**Agent actions:**

- Run the RFC-0488 migrator on the `warpgogol-com` workpiece via `mission.migrate`.
- Verify migrated sidecars pass the extended `materialCreditSchema`.

**Validation:**

- `pnpm exec site-kernel run material.credits.validate --site warpgogol-com --json`

**Completion criterion:** Migrator runs without errors; sidecars are transformed.

**Human review:** no

---

### Step 9. Operator rights audit

**Goal:** Operator reviews Stuttgart Marathon photo and Komoot screenshot.

**Agent actions:**

- Present the two third-party materials to the operator.
- Operator decides: add verified `usageBasis` or remove the sidecar and asset.

**Validation:**

- `pnpm exec site-kernel run material.credits.validate --site warpgogol-com --json` (no `unverified-usage-basis` violations)

**Completion criterion:** No `unverified-usage-basis` violations remain.

**Human review:** **yes** — operator makes the legal decision about each third-party material.

---

### Step 10. Regenerate credits page and verify

**Goal:** Regenerate the credits page for `warpgogol-com` and verify the rendered output.

**Agent actions:**

- Run `pnpm exec site-kernel run material.credits.generate --site warpgogol-com`.
- Start dev build and verify `/bildnachweise/` renders without runtime errors.
- Verify stable anchors work (`/bildnachweise/#warpgogol-promo-video`).
- Verify no raw enum values are visible.

**Validation:**

- `pnpm exec site-kernel run material.credits.validate --site warpgogol-com --json` exits 0.
- `pnpm exec site-kernel run content.references.validate --site warpgogol-com` exits 0.
- Dev build of `warpgogol-com` starts without runtime errors on `/bildnachweise/`.

**Completion criterion:** Credits page renders correctly; all validation passes.

**Human review:** no

---

### Step 11. Update `amendedBy` on RFC-0220 and RFC-0232

**Goal:** Add `RFC-0488` to the `amendedBy` frontmatter of the amended RFCs.

**Agent actions:**

- Add `RFC-0488` to `amendedBy` in `docs/rfcs/archive/implemented/rfc-0220-*.md`.
- Add `RFC-0488` to `amendedBy` in `docs/rfcs/archive/implemented/rfc-0232-*.md`.

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0488 --json` (V-19 warnings resolved)

**Completion criterion:** `rfc.validate RFC-0488` passes with zero warnings.

**Human review:** no

---

### Step 12. Update documentation

**Goal:** Update `packages/share/AGENTS.md` and check Compass sync.

**Agent actions:**

- Update `packages/share/AGENTS.md` to document new label mapping helpers and schema extensions.
- Check `docs/technology.xml` — update if it tracks `@gogol/share` schema exports.
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` in modified source files.

**Validation:**

- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** Documentation is synchronized with code changes.

**Human review:** no

---

### Step 13. Final validation and evidence

**Goal:** Run full validation suite and emit verification evidence.

**Agent actions:**

- Run all validation commands (see section 4).
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0488` (RFC-0330).
- Stamp RFC-0488 as `implemented` via `rfc.implement.stamp`.

**Validation:**

- See section 4.1.

**Completion criterion:** All validation passes; RFC-0488 is `implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0488`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/ui run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run migrator.registry.validate`
- `pnpm exec site-kernel run material.credits.validate --site warpgogol-com --json`
- `pnpm exec site-kernel run content.references.validate --site warpgogol-com`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0488` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0488.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0488` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Schema migration risk | Step 3: migrator is idempotent with PBT + snapshot tests |
| Label completeness (`.strict()` schema) | Step 7: labels update is in the same mission as schema change (step 1); schema parse catches missing keys |
| Usage location discovery accuracy | Step 4: reuses existing `collectMaterialRefs` logic from validators |
| Rights audit operator burden | Step 9: operator makes legal decision; RFC provides framework |
| AI copyright nuance complexity | Step 3: migrator sets `copyrightClaimed` context-dependently; Step 6: validator enforces `ai-copyright-overstatement` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-4 or DNA-5, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0488 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the migrator cannot handle a sidecar edge case (e.g. malformed YAML), raise `MigrationError` and let the operator fix the sidecar in the workpiece before restarting.
- If the rights audit reveals a third-party material that cannot be verified and cannot be removed (e.g. legally required imprint image), escalate to the operator for a case-by-case decision.
