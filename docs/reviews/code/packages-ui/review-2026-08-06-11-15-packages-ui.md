---
reviewId: REVIEW-CODE-2026-08-06-01
date: 2026-08-06
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: d10f98ba^...HEAD
filesReviewed:
  - packages/ui/src/components/nachweis-card/nachweis-card-component.astro
  - packages/ui/src/components/nachweis-card/nachweis-card-component.css
  - packages/ui/src/components/nachweis-card/nachweis-card-component.manifest.yaml
  - packages/ui/src/components/nachweis-list/nachweis-list-component.astro
  - packages/ui/src/components/nachweis-list/nachweis-list-component.css
  - packages/ui/src/components/nachweis-list/nachweis-list-component.manifest.yaml
  - packages/ui/src/components/nachweis-detail/nachweis-detail-component.astro
  - packages/ui/src/components/nachweis-detail/nachweis-detail-component.css
  - packages/ui/src/components/nachweis-detail/nachweis-detail-component.manifest.yaml
  - packages/ui/src/components/nachweis-verify/nachweis-verify-component.astro
  - packages/ui/src/components/nachweis-verify/nachweis-verify-component.css
  - packages/ui/src/components/nachweis-verify/nachweis-verify-component.manifest.yaml
  - packages/ui/src/components/footer/footer-component.astro
  - packages/ui/src/components/footer/footer-component.manifest.yaml
  - packages/share/src/astro/nachweis-routes.ts
  - packages/share/src/astro/routes/registry.ts
  - packages/share/src/astro/site-content-handlers.ts
  - packages/share/src/entitlement.ts
  - packages/ontology/archetypes/components/nachweis-card.yaml
  - packages/ontology/archetypes/components/nachweis-list.yaml
  - packages/ontology/archetypes/components/nachweis-detail.yaml
  - packages/ontology/archetypes/components/nachweis-verify.yaml
  - tools/kernel.config.ts
---

# Code Review: d10f98ba^...HEAD (RFC-0708)

### Verdict: Needs revision

Four findings across axes A and E. The core implementation is structurally sound — semantic HTML, entitlement gating, route registry folding, and manifest alignment are all correct. The findings are documentation drift from the `publication.visibility` → `status` migration and a missing prop propagation.

### Mechanical floor

Pass — `tsc --noEmit` (packages/ui), `astro check` (workpiece), `rfc.validate --id RFC-0708`, `entitlement.module.validate --site warpgogol-com`, `nachweis.validate --system warpgogol-com` all exit 0.

### Axis A — Structural correctness

**A1 — Duplicated Code (Fowler).** `getNachweisRoutes()` and `getNachweisVerifyRoutes()` in `packages/share/src/astro/nachweis-routes.ts:75-113` and `:120-160` share ~90% identical logic: system loading, i18n extraction, collection filtering by `defaultLang`, `type === "evidence-source"`, `NACHWEIS_EVIDENCE_KINDS.has(data.kind)`, and `status !== "published"` guard. Extract a shared `loadPublishedNachweisEntries()` helper that returns the filtered default-language entries; both functions consume it and build their route shapes from the result.

**A2 — Incomplete interface propagation.** `verifiedDate` was added to `nachweis-card-component.astro` Props (line 41) but is missing from:

- `NachweisRecord` interface in `nachweis-list-component.astro:27-41` — records passed via `{...record}` spread won't type-check if they include `verifiedDate`.
- `Props` interface in `nachweis-detail-component.astro:37-52` — the detail component passes props to `NachweisCard` explicitly (lines 75-89), not via spread, so `verifiedDate` is silently dropped. Add `verifiedDate?: string` to both interfaces and forward it in the detail component.

### Axis B — DNA alignment

No issues. DNA-17 (trust layer), DNA-23 (entitlement gating), DNA-24 (Nachweisregister) are satisfied. Entitlement gating follows the established `entitledFeatures` pattern mirroring `blog`, `pseo`, and `team.profiles`.

### Axis C — Ecosystem fit

No issues. Package boundaries are correct — route source lives in `@warpgogol/share/astro`, components in `@warpgogol/ui`, archetypes in `@warpgogol/ontology`. Route registry folding follows the same pattern as surface and people routes. Footer handler follows the documented `footerHandler` nav-group completeness rule.

### Axis D — Forward-only compliance

No issues. No compatibility shims or legacy paths. The `publication.visibility` → `status` migration was applied consistently in code.

### Axis E — Agent-facing clarity

**E1 — Documentation drift in MODULE_CONTRACT.** `nachweis-routes.ts:7` says `filters by publication.visibility: published (excludes preview records)` but the code uses `data.status !== "published"` (line 98). Update the MODULE_CONTRACT to say `filters by status: published (excludes draft records)`.

**E2 — Documentation drift in registry comment.** `registry.ts:254` says `Sourced from PBP EvidenceSource records with Nachweis evidence kinds and publication.visibility: published. Preview records are excluded` but the code filters by `status !== "published"`. Update to say `status: published. Draft records are excluded`.

### Axis F — Pragmatism

No issues. Four components, four archetypes, one route source, one entitlement — each earns its existence. No speculative generality.

### Axis G — Blind spots

No issues. Empty state is handled (`nachweis-list-component.astro:52-53`). Draft records produce no routes (fail-safe). Entitlement fail-open follows the established pattern.

### Spec compliance

| Requirement from RFC-0708 | Status | Evidence |
| --- | --- | --- |
| 4 UI components with semantic HTML | Done | `.astro` files with article, blockquote, dl, time, cite, aria-labelledby |
| 4 manifests with correct cosmicNames | Done | Nix, Hydra, Kerberos, Styx in manifest.yaml files |
| 4 archetype entries | Done | `packages/ontology/archetypes/components/nachweis-*.yaml` |
| `getNachweisRoutes()` route source | Done | `packages/share/src/astro/nachweis-routes.ts` |
| Route registry folding with entitlement gate | Done | `registry.ts:252-291` |
| 3 Nachweis page entries in system.md | Done | Workpiece system.md |
| JSON endpoint | Done | `src/pages/nachweise/status/[id].json.ts` |
| Static manifest | Done | `public/nachweise/manifest.json` |
| Footer navigation | Done | trustIds/trustLinks in footer handler + component |
| 2 PBP Claim entities (de + uk) | Done | 4 claim files (2 records × 2 langs) |
| 2 PBP EvidenceSource entities (de + uk) | Done | 4 evidence files (2 records × 2 langs) |
| 2 PBP Consent entities (de + uk) | Done | 4 consent files (2 records × 2 langs) |
| All pilot records status: draft | Done | All 12 files have `status: draft` |
| `entitlementsOverride: ["nachweis"]` | Done | system.md + entitlements.generated.yaml |
| `nachweis.validate` passes | Done | exit 0 |
| `entitlement.module.validate` passes | Done | exit 0 |
| `astro check` passes | Done | exit 0 |
| `rfc.validate` passes | Done | exit 0 |

### Questions for the author

1. Should `verifiedDate` be propagated through `nachweis-list` and `nachweis-detail` to reach `nachweis-card`, or is it only intended for direct card usage?
2. Is the duplicated system-loading + collection-filtering logic in `nachweis-routes.ts` intentional (to keep functions as independent leaves), or should it be extracted?
