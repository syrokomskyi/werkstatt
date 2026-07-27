---
reviewId: REVIEW-CODE-2026-07-11-01
date: 2026-07-11
reviewer:
  skill: wg-review
  model: unknown
verdict: approved
diffRange: acbdf7832~1...HEAD
filesReviewed:
  - packages/share/src/semantic/business-projection.ts
  - packages/share/src/semantic/models.ts
  - packages/share/src/semantic/organization-profile.ts
  - packages/share/src/semantic/jsonld/context.ts
  - packages/share/src/semantic/jsonld/service.ts
  - packages/share/src/semantic/jsonld.ts
  - packages/share/src/semantic/jsonld/webpage.ts
  - packages/share/src/semantic/llms.ts
  - packages/share/src/semantic/page-builders/home-page.ts
  - packages/business/src/schemas/service.ts
  - packages/business/src/semantic-profile.ts
  - packages/os/site-kernel-content/src/semantic-loader.ts
  - packages/os/site-kernel-checks/src/services-projection.ts
  - packages/os/site-kernel-checks/src/command-tables/16-offer.ts
  - packages/os/site-kernel-checks/src/pipelines/build-check.ts
  - docs/ecosystem.generated.json
  - docs/rfcs/rfc-0373-extract-services-at-organization-level-from-business-catalog.md
---

# Code Review: acbdf7832~1...HEAD (RFC-0373 implementation)

### Verdict: Approved

The diff cleanly implements RFC-0373: services are projected from the business catalog at the organization level, page-level services are removed, JSON-LD and LLM output are rewired to the org profile, and a new validation command is registered. The change is forward-only, minimal, and follows existing patterns. Two minor findings are advisory.

### Mechanical floor

Pass — all four impacted packages pass `build:check` (`@gogol/share`, `@gogol/business`, `@gogol/site-kernel-checks`, `@gogol/site-kernel-content`). `rfc.validate RFC-0373` passes. `services.projection.validate` passes on all three apps. Pre-existing `growth.adapter.contract` failure in `webgogol-com` and `nicaragua-projekt` build:check is unimpacted (confirmed via stash test).

### Axis A — Structural correctness

No issues. `projectServices()` follows the exact pattern of `projectPeople()`, `projectLocation()`, and `projectOffer()`. The `SemanticService.description` type change from `string` to `string?` is propagated correctly to all consumers (JSON-LD service node conditionally includes description). No `any` types, no magic numbers, no dead code.

### Axis B — DNA alignment

No issues.

- **DNA-1** (monorepo boundary): imports flow `packages/business → packages/share` and `packages/os/site-kernel-content → packages/share`. No `apps/* → apps/*` imports.
- **DNA-42** (Compass markup): new file `services-projection.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Updated files have `CHANGE_SUMMARY` entries.
- **DNA-16** (semantic topology alignment): services now live on `SemanticOrganization`, aligning with the navigation topology where services are an org-level concept, not a page-level one.

### Axis C — Ecosystem fit

No issues.

- **Package boundaries**: correct — projectors in `@gogol/share`, schema in `@gogol/business`, validators in `@gogol/site-kernel-checks`, disk loader in `@gogol/site-kernel-content`.
- **Pipeline placement**: `services.projection.validate` placed in `APPS_BUILD_CHECK_PIPELINE` after `print.layout.validate`. Correct — it validates source files, not build artifacts.
- **Command lifecycle**: registered in `16-offer.ts` alongside `offer.capacity.validate` and `offer.provider.validate`. Command metadata includes `scope: "app"`, `supportsAllApps: true`, `flags: {}`.
- **Compass sync**: `ecosystem.generated.json` regenerated. `ecosystem.manifest.validate` and `workspace.surface.validate` pass.
- **AGENTS.md**: no new rules or patterns requiring AGENTS.md updates — the change follows existing projection and command-registration patterns.

### Axis D — Forward-only compliance

No issues. `SemanticPageModel.services` is removed — no compatibility shim. `extractServices()` is deleted — no dual path. JSON-LD consumers are updated to read from `page.organization.services` — no fallback to `page.services`. The `description` field on `SemanticService` is made optional, not kept as required with a default empty string.

### Axis E — Agent-facing clarity

No issues.

- **Compass scaffolding**: `services-projection.ts` has `MODULE_CONTRACT` (purpose + non-goals) and `CHANGE_SUMMARY`. All modified files have `CHANGE_SUMMARY` entries referencing RFC-0373.
- **No ungrounded assertions**: `projectServices()` docstring references "loaders pre-sort by `order`" — consistent with `projectPeople()` docstring.
- **Readable by another agent**: function names are clear (`projectServices`, `formatServices`, `runServicesProjectionValidate`). Variable names reveal intent (`servicesListId`, `ambiguous-source`).

### Axis F — Pragmatism

**Minor finding (advisory):** `services.projection.validate` reads service files twice for the default language — once in the per-language loop (for `missing-name`, `duplicate-slug`, `ambiguous-source` rules) and again after the loop (for `duplicate-id` rule via `projectServices`). This is a negligible I/O cost (0 files currently, expected <20 files at scale), but the second read could reuse cached results. Not a blocking issue.

Otherwise no issues. The command earns its existence — it validates schema compliance, slug uniqueness, and orphan detection, which are distinct from `offer.capacity.validate` or `offer.provider.validate`. No scope creep.

### Axis G — Blind spots

**Minor finding (advisory):** The validator's `duplicate-id` rule only checks the default language's projected services. If a non-default language has services with ids that collide with default-language ids, the collision is not detected. This is acceptable for now since the projection falls back to default language, but a future enhancement could check cross-language id uniqueness.

- **Performance**: validator scans `business/{lang}/services/` directory — O(n) where n = number of service files. Negligible.
- **False positives**: `ambiguous-source` is advisory (warning severity), so it does not fail the pipeline. Correct for migration period.
- **Edge cases**: empty states (no business directory, no services directory, no service files) all return `passResult`. Verified on all three apps.
- **Migration path**: existing apps without `business/{lang}/services/` content are unaffected — projection returns empty array, validator passes.

### Spec compliance

| Requirement from RFC-0373 | Status | Evidence |
| --- | --- | --- |
| Add `projectServices()` projector | Done | `business-projection.ts:199-217` |
| Add `description` to `businessServiceSchema` | Done | `service.ts:28` |
| Add `services` to `OrganizationProfileInput` | Done | `organization-profile.ts:80` |
| Make `SemanticService.description` optional | Done | `models.ts:149` |
| Remove `SemanticPageModel.services` | Done | `models.ts` — field removed |
| Wire Astro loader | Done | `semantic-profile.ts:96-100` |
| Wire disk loader | Done | `semantic-loader.ts:232-234` |
| JSON-LD reads from org services | Done | `service.ts:31`, `context.ts:38`, `jsonld.ts:40`, `webpage.ts:57` |
| `servicesListId` org-scoped | Done | `context.ts:38` — `${ids.organization}/services` |
| Conditional `description` in JSON-LD | Done | `service.ts:25` |
| `formatServices()` in llms.ts | Done | `llms.ts:225-236` |
| Remove `extractServices()` from home-page.ts | Done | `home-page.ts` — function deleted |
| Register `services.projection.validate` | Done | `16-offer.ts:38-46` |
| Wire into `APPS_BUILD_CHECK_PIPELINE` | Done | `build-check.ts:34-35` |
| `rfc.validate` passes | Done | Verified |
| Apps without services build green | Done | nicaragua-projekt passes validator |

### Questions for the author

1. The `duplicate-id` check only runs against the default language's projected services. Should cross-language id collisions be detected, or is the default-language-only check sufficient given the fallback semantics?
2. The `services-projection.ts` validator reads files twice for the default language (once in the loop, once for `duplicate-id`). Is this acceptable, or should the results be cached?
