---
reviewId: REVIEW-CODE-2026-07-21-01
date: 2026-07-21
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: workpiece uncommitted changes (rfc-0483 migrator output)
filesReviewed:
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/business.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/offerings/digital-foundation.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/offerings/visibility.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/offerings/booking.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/offerings/reputation.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/offerings/multilingual.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/offerings/automation.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/policies/cancellation.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/policies/availability-sla.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/policies/ownership.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/policies/renewal.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/policies/portability.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/policies/support-response.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/policies/small-changes.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/policies/exit-package.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/policies/price-changes.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/policies/delivery-guarantee.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/policies/backup-retention.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/contact/general-email.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/places/backnang.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/web/primary.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/organization/legal-identity.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/organization/brand.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/catalog/catalog.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/catalog/entries/digital-foundation.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/catalog/entries/visibility.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/catalog/entries/booking.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/catalog/entries/reputation.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/catalog/entries/multilingual.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/catalog/entries/automation.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/products/business-website.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/products/website-operation.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/products/visibility.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/products/booking.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/products/reputation.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/products/multilingual.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/products/automation.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/trust/claims/platform-cost-models.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/trust/disclosures/cloudflare.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/trust/evidence/platform-pricing-sources.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/documents/imprint.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/documents/legal-notice.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/documents/privacy.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/documents/terms.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/company.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/contact.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/location.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/de/web.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/uk/business.md
  - missions/warpgogol-com-m000009/workpiece/src/content/business-profile/uk/offerings/digital-foundation.md
---

# Code Review: rfc-0483 migrator output — de/ PBP entities (first-draft copies from uk/)

### Verdict: Needs revision

The rfc-0483 migrator successfully migrated 329 `{business.*}` references and created 44 new de/ PBP entities, but the output has three serious issues: (1) 4 old-format files that RFC-0483 explicitly requires to be deleted remain in `business-profile/de/`, (2) all 37 de/ PBP entities with text fields contain Ukrainian text instead of German, and (3) a `ref`/`id` mismatch on `contactPointRefs` makes the business entity point to a non-existent URI. The first-draft copy approach is acknowledged by RFC-0483, but the old-format file deletion gap and ref/id mismatch are migrator bugs, not operator tasks.

### Mechanical floor

Pass — `astro dev` starts cleanly, home page returns `[200]`, no `[content-reference]` or `Invalid content reference` errors.

### Axis A — Structural correctness

- **Fail — old-format files not deleted.** 4 files in `business-profile/de/` remain in the old (pre-PBP) format, despite RFC-0483 §File system responsibilities explicitly listing them for deletion:
  - `de/company.md` — no `schema:` field, old `@warpgogol/business` format. RFC-0483: "Delete — old format, data moved to `de/business.md`"
  - `de/contact.md` — no `schema:` field. RFC-0483: "Delete — old format, data moved to `de/contact/general-email.md`"
  - `de/location.md` — no `schema:` field. RFC-0483: "Delete — old format, data moved to `de/places/backnang.md`"
  - `de/web.md` — no `schema:` field. RFC-0483: "Delete — replaced by `de/web/primary.md`"

  The migrator's `deleteBusinessDirectory()` only removes `src/content/business/` — it does not remove old-format files in `business-profile/`. These files are loaded by the `business-profile` Astro collection and may cause PBP compiler confusion or duplicate entity conflicts.

- **Pass — PBP schema compliance.** All 44 new de/ entities carry valid `schema: pbp/*@1` declarations and correct `type` fields.

### Axis B — DNA alignment

- **Fail — DNA-4 (canonical content).** All 37 de/ PBP entities with `name` fields contain Ukrainian text instead of German. This is the `de/` (default) locale — the site renders Ukrainian names, descriptions, guarantees, and policy labels to German visitors. Examples:
  - `de/offerings/digital-foundation.md:6` — `name: Цифровий фундамент` (should be "Digitales Fundament")
  - `de/policies/cancellation.md:6` — `name: "Розірвання"` (should be "Kündigung")
  - `de/places/backnang.md:6` — `name: "Бакнанг"` (should be "Backnang")
  - `de/contact/general-email.md:6` — `name: "Загальний контакт"` (should be "Allgemeiner Kontakt")
  - `de/organization/brand.md:7` — `tagline: "«Цифровий фундамент» — надійна цифрова основа для малого бізнесу та ремесел"`
  - `de/organization/legal-identity.md:9` — `responsiblePerson.name: Андрій Сирокомський` (should be "Andrii Syrokomskyi")
  - `de/places/backnang.md:12` — `administrativeArea: "Баден-Вюртемберг"` (should be "Baden-Württemberg")

  RFC-0483 acknowledges this: "de/ PBP entities created by the migrator are first-draft translations from uk/ — the operator reviews and refines during the operator edits step." This is acceptable as a draft state, but it MUST be resolved before `mission.validate` / release.

- **Pass — DNA-6 (kebab-case).** All new filenames use kebab-case.

### Axis C — Ecosystem fit

- **Fail — ref/id mismatch on contactPointRefs.** `de/business.md:22` and `uk/business.md:22` both declare:

  ```yaml
  contactPointRefs:
    default:
      ref: "https://warpgogol.com/id/contact-points/general-email"
  ```

  But the actual contact entity at `de/contact/general-email.md:3` and `uk/contact/general-email.md:3` has:

  ```yaml
  id: https://warpgogol.com/id/contact/general-email
  ```

  The ref URI (`contact-points/general-email`) does not match the entity id URI (`contact/general-email`). This is a pre-existing issue in uk/ that was copied to de/ by the migrator. The PBP compiler may fail to resolve this ref or silently skip it.

- **Pass — package boundaries.** No cross-workspace import violations.

- **Pass — pipeline placement.** Migrator is correctly registered in the migrator registry and invoked via `mission.migrate`.

### Axis D — Forward-only compliance

- **Pass.** The migrator deletes the legacy `business/` directory and removes the stopgap `business` collection from `content.config.ts`. No compatibility shims remain.

### Axis E — Agent-facing clarity

- **Pass — Compass scaffolding.** The migrator source file (`rfc-0483.ts`) carries `MODULE_CONTRACT` and `CHANGE_SUMMARY`.

- **Fail — anti-fabrication (mixed-language entity).** `de/offerings/digital-foundation.md` is a mixed-language entity: structural fields (`name`, `guarantees.*.label/detail`) are in Ukrainian (copied from uk/), while `presentation.*` fields (populated from legacy `business/de/offer.md`) are in German. This creates a jarring inconsistency within a single entity — a visitor sees Ukrainian guarantee labels alongside German price display strings. The migrator should either copy presentation fields from uk/ too (keeping the entity internally consistent in Ukrainian) or translate structural fields to German (which is the operator's job). The current half-populated state is the worst of both worlds.

### Axis F — Pragmatism

- **Pass.** The migrator is scoped to the minimum needed. The 60-entry mapping table covers all real reference patterns.

- **Fail — missing `availableLanguage` on de/ contact point.** RFC-0483 §1 says: "Copy from `uk/contact/general-email.md`, translate `name`, set `availableLanguage: "de"`". The migrator copies the file but does not set `availableLanguage`. The field is also missing from the uk/ source, suggesting it was never authored. This is a spec gap in the migrator.

### Axis G — Blind spots

- **Fail — old-format files cause duplicate entity IDs.** The `business-profile` collection loads all `.md` files under `business-profile/`. The old-format `de/company.md` has `id: Warpgogol` (not a URI), while `de/business.md` has `id: https://warpgogol.com/id/business`. The `toDataEntryId` loader generates IDs from file paths, so `de/company.md` and `de/business.md` get different collection entry IDs, but both are loaded into the same collection. The PBP compiler iterates entities by `schema` field — `de/company.md` has no `schema` field, so it may be silently skipped or cause a validation error depending on compiler strictness. This is an edge case the migrator did not consider.

- **Pass — false-positive suppression.** The migrator correctly skips `{business.offer.*}` wildcard patterns in comments.

### Spec compliance

| Requirement from RFC-0483 | Status | Evidence |
| --- | --- | --- |
| Create missing de/ PBP entities from uk/ templates | Done | 44 new files created under `de/` |
| Populate presentation.* fields from legacy business/de/*.md | Done | `de/offerings/digital-foundation.md` has German presentation fields |
| Migrate 329 {business.*} references | Done | grep confirms 0 remaining `{business.*}` references |
| Remove business collection from content.config.ts | Done | Template already updated; migrator also strips it |
| Delete src/content/business/ directory | Done | Directory absent |
| Delete old-format de/company.md | **Missing** | File still exists at `business-profile/de/company.md` |
| Delete old-format de/contact.md | **Missing** | File still exists at `business-profile/de/contact.md` |
| Delete old-format de/location.md | **Missing** | File still exists at `business-profile/de/location.md` |
| Delete old-format de/web.md | **Missing** | File still exists at `business-profile/de/web.md` |
| Set availableLanguage: "de" on de/ contact point | **Missing** | `de/contact/general-email.md` has no `availableLanguage` field |
| Translate de/ entity name/description fields to German | **Partial** | `de/business.md` has German description (from rfc-0481); all other entities have Ukrainian names (by design — operator task) |
| ref/id consistency on contactPointRefs | **Missing** | `contact-points/general-email` ≠ `contact/general-email` |

### Questions for the author

1. Should the rfc-0483 migrator be extended to delete the 4 old-format files (`de/company.md`, `de/contact.md`, `de/location.md`, `de/web.md`) that it missed, or should this be a manual operator step? RFC-0483 §File system responsibilities explicitly lists these for deletion, so this is a migrator bug.

2. The `contactPointRefs.default.ref` in `business.md` points to `https://warpgogol.com/id/contact-points/general-email` but the actual entity id is `https://warpgogol.com/id/contact/general-email`. Is this a pre-existing uk/ bug that should be fixed in both locales, or is the PBP compiler resolving refs by file path rather than by `id` URI?

3. The `de/offerings/digital-foundation.md` entity is internally mixed-language (Ukrainian structural fields + German presentation fields). Should the migrator populate presentation fields from uk/ legacy data too (keeping the entity internally Ukrainian until the operator translates), or is the current half-German state acceptable as a draft?
