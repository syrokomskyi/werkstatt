---
id: RFC-0373
title: "Extract services at organization level from the business catalog"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-07
updatedAt: 2026-07-11
enhancedAt: 2026-07-10
implementedAt: 2026-07-11
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0147
amendedBy: []
related:
  - DNA-16
  - RFC-0147
  - RFC-0148
  - RFC-0372
  - RFC-0239
satisfies:
  - DNA-16
commands:
  proposed:
    - services.projection.validate
  added:
    - services.projection.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/business"
  - "@gogol/site-kernel-content"
  - "@gogol/site-kernel-checks"
successSignals:
  - "SemanticOrganization.services is populated from business/{lang}/services/{slug}.md for every app that authors a service catalog."
  - "JSON-LD Service nodes are emitted from the organization profile, not from a per-page field."
  - "llms-full.txt includes a ## Services section listing each service name and description."
  - "After RFC-0372 removes buildHomePageSemantic(), the services field is not dead — it lives on the organization."
  - "nicaragua-projekt (no commercial services) omits the section with no error."
nonGoals:
  - "Do not author business service catalog content — this RFC defines the projection contract only."
  - "Do not change the businessServiceSchema field set beyond adding an optional description."
  - "Do not project services per-page — services are site-wide facts about the business."
  - "Do not project pricingOptions or deliveryTime into the semantic model — the minimal SemanticService shape (id, name, description) is sufficient for AI/JSON-LD."
  - "Do not address the offer family PSEO pages (RFC-0239 owns those)."
  - "Do not preserve backward compatibility for SemanticPageModel.services — forward-only removal."
---

# RFC-0373: Extract services at organization level from the business catalog

## Context

The semantic model has two `services` fields:

- `SemanticOrganization.services?: SemanticService[]` — declared in `models.ts`, but **never populated**. `buildOrganizationProfile()` in `packages/share/src/semantic/organization-profile.ts` does not accept or set `services`.
- `SemanticPageModel.services?: SemanticService[]` — populated **only** by `buildHomePageSemantic()` in `packages/share/src/semantic/page-builders/home-page.ts` via `extractServices()`, which reads `approach` block cards and falls back to `organization.offer.growthModules`.

RFC-0147 originally intended to project the business service catalog (`business/{lang}/services.md`) into the semantic model at the organization level. Its acceptance criteria explicitly deferred this: _"services.md projection deferred — its on-disk shape does not match the service-catalog schema."_ The `BUSINESS_DOMAIN_VISIBILITY.service` entry was set to `"public"` in `business-projection.ts`, but no projector function was ever written.

RFC-0372 (accepted, not yet implemented) deletes `buildHomePageSemantic()` and the `semanticType === "home"` special branch in `buildSemanticPageModelWith()`. After RFC-0372 lands, `SemanticPageModel.services` becomes a dead field — no code path populates it. JSON-LD `buildServiceNodes()` and the `servicesListNode` in `buildJsonLd()` read from `context.page.services`; they will emit nothing.

The business layer already has the infrastructure for a repeatable services collection:

- `packages/business/src/schemas/service.ts` defines `businessServiceSchema` (slug, name, category, serviceType, deliveryTime, pricingOptions, etc.).
- `packages/business/src/dispatcher.ts` registers `"services/": businessServiceSchema` in `repeatableBusinessSchemasByPrefix`.
- `packages/business/src/loaders.ts` exports `getBusinessServices()` which reads `business/{lang}/services/{slug}.md` with default-language fallback.

But no `business/{lang}/services/` subdirectory exists in any app yet. The orphan `business/de/services.md` file in warpgogol-com (`{ websiteDevelopment: { backupRetentionDays: "30" } }`) is a config fragment, not a service catalog — it matches no schema and is not the source this RFC projects.

## Problem

The unprotected invariant is:

> The AI projection of a site must list the services the business offers when that information is authored as structured data. A semantic model with a dead `services` field is not a faithful projection.

Current failure modes:

1. **`SemanticOrganization.services` is a dead type field.** Declared, visibility-mapped as `"public"`, but never populated by any loader or builder.
2. **`SemanticPageModel.services` will die with RFC-0372.** The only code path that populates it (`buildHomePageSemantic()`) is scheduled for deletion.
3. **JSON-LD Service nodes are page-scoped, not org-scoped.** `buildServiceNodes()` reads from `context.page.services` — wrong granularity for site-wide facts.
4. **`llms-full.txt` has no `## Services` section.** `formatOffer()` emits `## Offer` (prices, guarantees, growth modules), but services are absent from the AI text output.
5. **The business service catalog is invisible to AI.** `getBusinessServices()` exists but is never called from any semantic pipeline.

## Decision

Project the business service catalog into `SemanticOrganization.services` at the organization level, wire both loaders (disk + Astro) to read it, emit JSON-LD `Service` nodes from the org profile, and add a `## Services` section to `llms-full.txt`. Remove `SemanticPageModel.services` (forward-only).

1. **`projectServices()` projector.** Add a pure projector to `packages/share/src/semantic/business-projection.ts` that maps `BusinessServiceData[]` → `SemanticService[]`. Each entry: `{ id: slug, name, description? }`. Records without a `name` are dropped. Order preserved (loaders pre-sort by `order`).

2. **`businessServiceSchema` gains `description`.** Add `description: z.string().optional()` to `packages/business/src/schemas/service.ts` so authors can provide a human/AI-readable service summary.

3. **`OrganizationProfileInput` gains `services`.** Add `services?: SemanticService[]` to the input type in `organization-profile.ts`. `buildOrganizationProfile()` sets `organization.services` when the array is non-empty.

4. **Both loaders read the services collection.**
   - Disk path (`semantic-loader.ts`): read `business/{lang}/services/` via `readBusinessCollection()`, project via `projectServices()`, pass to `buildOrganizationProfile()`.
   - Astro path (`packages/business/src/semantic-profile.ts`): call `getBusinessServices()`, project via `projectServices()`, pass to `buildOrganizationProfile()`.

5. **`SemanticPageModel.services` is removed.** Forward-only — no backward compat. The field, its JSON-LD wiring (`servicesListId` from page, `buildServiceNodes()` from page, `servicesListNode` in `buildJsonLd()`, `webpage.ts` mentions), and the `extractServices()` function in `home-page.ts` are deleted.

6. **JSON-LD reads from organization.**
   - `buildServiceNodes()` reads from `context.page.organization.services`.
   - `servicesListId` in `createJsonLdContext()` is derived from `organization.services` and scoped to `${ids.organization}/services` (org-level, not page-level).
   - `servicesListNode` in `buildJsonLd()` reads from `context.page.organization.services`.
   - `buildOrganizationNode()` does not need a new property — each `Service` node already links to the organization via `provider: { "@id": ids.organization }`. The `ItemList` is referenced from the WebPage via `mentions`.
   - `webpage.ts` `mentions` references the org-level services list.
   - `buildServiceNode()` conditionally includes `description` only when present (since `SemanticService.description` is now optional).

7. **`llms-full.txt` gains `## Services`.** Add `formatServices()` to `llms.ts` that emits `## Services` with each service as `- {name}: {description}` (description omitted when absent). Inserted after `## Offer` and before `## Location` in the org-section order.

8. **`services.projection.validate` command.** App-scoped Site OS command in `packages/os/site-kernel-checks` that verifies:
   - Every `business/{lang}/services/*.md` file has at least `slug` and `name` — **blocking (fail)**.
   - Slugs are unique within a language — **blocking (fail)**.
   - Projected `SemanticService[]` has no duplicate ids — **blocking (fail)**.
   - No `services.md` single-file orphan exists alongside a `services/` collection (ambiguous source) — **advisory (warn)**.

   Exit code: 0 on pass, non-zero on fail. Advisory warnings do not affect exit code.

## Architectural fit

**DNA-16 (semantic layer shares topology with navigation).** The current per-page `services` field is populated by `buildHomePageSemantic()` — a special home-page builder that reads `approach` block cards, not from navigation topology. This creates a divergent parallel model: the semantic `services` field on the home page does not reflect the same topology used for navigation rendering. By removing `SemanticPageModel.services` and projecting services at the organization level from the repeatable business catalog, this RFC eliminates the divergence. Org-level services are above page topology, not parallel to it — they do not vary per page and cannot diverge from navigation.

**RFC-0147 (offer + service catalog projection).** This RFC completes the deferred `services.md` projection. The original RFC's acceptance criterion _"services.md projection deferred"_ is satisfied by wiring the repeatable `services/{slug}` collection through a pure projector.

**RFC-0148 (business schema projection registry).** `projectServices()` joins `projectOffer()`, `projectLocation()`, `projectPeople()`, and `projectWeb()` in `business-projection.ts`. The `BUSINESS_DOMAIN_VISIBILITY.service = "public"` entry (already present) is now exercised.

**RFC-0372 (unify semantic block projection).** This RFC is complementary. If RFC-0372 lands first, `page.services` becomes dead and this RFC fills the gap at the org level. If this RFC lands first, services move to org before the home builder is deleted. Either order is safe.

**RFC-0239 (offer family).** The offer family PSEO pages (`/leistungen/`, `/uk/posluhy/`) are individual landing pages for each service. The org-level `SemanticOrganization.services` projection is the catalog-level summary that drives JSON-LD and llms.txt. They are complementary: the offer family pages render individual services; the org projection summarizes the catalog for AI consumers.

## Design

### CLI surface

```sh
pnpm exec site-kernel run services.projection.validate --app warpgogol-com
pnpm exec site-kernel run services.projection.validate --all --json
```

App-scoped. Reads `business/{lang}/services/*.md` from the app's content directory. Validates schema compliance, slug uniqueness, and projection integrity.

### TypeScript contracts

```ts
// packages/share/src/semantic/business-projection.ts

/** RFC-0373: project business service catalog entries into SemanticService[]. */
export function projectServices(
  records: ReadonlyArray<Record<string, unknown>> | undefined,
): SemanticService[] {
  if (!records?.length) return [];
  const services: SemanticService[] = [];
  for (const r of records) {
    const name = typeof r["name"] === "string" ? (r["name"] as string).trim() : "";
    if (!name) continue;
    const slug = typeof r["slug"] === "string" ? (r["slug"] as string) : "";
    const description = typeof r["description"] === "string" ? (r["description"] as string).trim() : "";
    services.push({
      id: slug || name,
      name,
      ...(description ? { description } : {}),
    });
  }
  return services;
}
```

```ts
// packages/share/src/semantic/organization-profile.ts

export interface OrganizationProfileInput {
  // ... existing fields ...
  /** RFC-0373: projected business service catalog. */
  services?: SemanticService[];
}

// buildOrganizationProfile() adds:
//   ...(input.services?.length ? { services: input.services } : {}),
```

```ts
// packages/share/src/semantic/models.ts

export type SemanticService = {
  id: string;
  name: string;
  description?: string; // was: string (required) — now optional
};

// SemanticPageModel.services is REMOVED.
// SemanticOrganization.services remains (already declared).
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/business-projection.ts` | Add `projectServices()` projector. |
| `packages/share/src/semantic/organization-profile.ts` | Add `services?` to `OrganizationProfileInput`; set on org. |
| `packages/share/src/semantic/models.ts` | Make `SemanticService.description` optional; remove `SemanticPageModel.services`. |
| `packages/share/src/semantic/llms.ts` | Add `formatServices()` → `## Services` section. |
| `packages/share/src/semantic/jsonld/service.ts` | Read from `context.page.organization.services`; conditionally include `description`. |
| `packages/share/src/semantic/jsonld.ts` | `servicesListNode` reads from `context.page.organization.services`; `@id` uses org-scoped `servicesListId`. |
| `packages/share/src/semantic/jsonld/context.ts` | Derive `servicesListId` from `organization.services`; scope to `${ids.organization}/services`. |
| `packages/share/src/semantic/jsonld/organization.ts` | No change needed — services link via `provider` on each `Service` node. |
| `packages/share/src/semantic/jsonld/webpage.ts` | `mentions` references org-level services list. |
| `packages/share/src/semantic/page-builders/home-page.ts` | Delete `extractServices()` and `services` from the return. |
| `packages/business/src/schemas/service.ts` | Add `description: z.string().optional()`. |
| `packages/business/src/semantic-profile.ts` | Call `getBusinessServices()`, project, pass to builder. |
| `packages/os/site-kernel-content/src/semantic-loader.ts` | Read `business/{lang}/services/`, project, pass to builder. |
| `packages/os/site-kernel-checks/src/services-projection.ts` | New: `services.projection.validate` command. |

### Output format

```json
{
  "command": "services.projection.validate",
  "status": "pass",
  "app": "warpgogol-com",
  "servicesProjected": 3,
  "services": [
    { "id": "website-development", "name": "Website Development" },
    { "id": "seo-audit", "name": "SEO Audit" }
  ]
}
```

Failure:

```json
{
  "command": "services.projection.validate",
  "status": "fail",
  "app": "warpgogol-com",
  "violations": [
    {
      "file": "src/content/business/de/services/website-development.md",
      "rule": "missing-name",
      "message": "Service entry has slug 'website-development' but no name field."
    }
  ]
}
```

### llms-full.txt output sketch

```txt
## Offer
- Monthly: 70 €/Monat
- Yearly: 700 €/Jahr
- Setup: 200 €

### Guarantees
- Fertig in 12 Werktagen: ...

## Services
- Website Development: Full website build with Astro, including design, content integration, and deployment.
- SEO Audit: Comprehensive technical SEO audit with actionable recommendations.

## Location
- Locality: Freiburg
...
```

### Failure modes

- **No `business/{lang}/services/` directory** → `projectServices()` returns `[]`; `organization.services` omitted; `## Services` omitted; no error. (nicaragua-projekt has no commercial services.)
- **Service file missing `name`** → record dropped silently by projector; `services.projection.validate` flags it as `missing-name`.
- **Duplicate slugs** → projector preserves both (order preserved); `services.projection.validate` flags as `duplicate-slug`.
- **Orphan `services.md` alongside `services/` directory** → `services.projection.validate` flags as `ambiguous-source`.

## Rollout

1. **Phase 1 — model + projector.** Add `projectServices()` to `business-projection.ts`. Make `SemanticService.description` optional. Add `services?` to `OrganizationProfileInput`. Remove `SemanticPageModel.services`.

2. **Phase 2 — loaders.** Wire both `semantic-loader.ts` (disk) and `semantic-profile.ts` (Astro) to read `business/{lang}/services/`, project, and pass to `buildOrganizationProfile()`.

3. **Phase 3 — JSON-LD + llms.** Update `buildServiceNodes()`, `createJsonLdContext()`, `buildOrganizationNode()`, and `webpage.ts` to read from org. Add `formatServices()` to `llms.ts`.

4. **Phase 4 — validation.** Implement `services.projection.validate` in `packages/os/site-kernel-checks`. Wire into `APPS_BUILD_CHECK_PIPELINE`.

5. **Phase 5 — content authoring (out of scope).** Apps author `business/{lang}/services/{slug}.md` files with at least `slug` and `name`. This is content work, not this RFC's implementation.

6. **Phase 6 — RFC-0372 coordination.** If RFC-0372 has not yet landed, `extractServices()` in `home-page.ts` still runs but its output (`page.services`) is no longer consumed by JSON-LD or llms. When RFC-0372 lands, `extractServices()` and `page.services` are deleted cleanly.

## Alternatives considered

**Keep services per-page (Option B).** Rejected. Services are site-wide facts about the business, not properties of individual pages. Per-page projection duplicates the same service list across every page's semantic model and creates a false per-page granularity. The offer projection (RFC-0147) is already org-level for the same reason.

**Combined org + page (Option C).** Rejected. Two projection paths for the same concept create ambiguity: which source wins? The business catalog is the canonical source; block-derived services are a fallback that existed only because the catalog projection was deferred. Once the catalog is wired, the fallback is unnecessary.

**Extend `SemanticService` with category, serviceType, pricingOptions.** Rejected as over-engineering for this RFC. The minimal shape (id, name, description) is sufficient for JSON-LD `Service` nodes and llms.txt. Richer fields can be added by a future RFC if AI consumers need them.

**Synthesize description from category + serviceType.** Rejected. Synthesized descriptions are less faithful than authored ones. Adding `description` to the business schema is a one-line change that gives authors control.

## Risks

**`SemanticPageModel.services` removal is a breaking change.** Any code reading `page.services` will fail to compile. Mitigation: the only consumers are `jsonld/service.ts`, `jsonld/context.ts`, `jsonld/webpage.ts`, `jsonld.ts` (top-level `servicesListNode`), and `home-page.ts` — all updated in the same change. No app-level code reads `page.services` directly.

**Content gap.** No `business/{lang}/services/` content exists yet. The projection is ready but unexercised until content is authored. This is acceptable — the contract is in place for when content arrives, and `services.projection.validate` passes (no files = no violations).

**Orphan `services.md` file.** The existing `business/de/services.md` config fragment may confuse agents. Mitigation: `services.projection.validate` flags it if a `services/` directory also exists. The file itself is not modified by this RFC.

**RFC-0372 ordering.** If RFC-0372 lands first, there is a window where `page.services` is dead and org-level services are not yet wired. Mitigation: the window is harmless — JSON-LD and llms simply omit services during that interval. If this RFC lands first, `extractServices()` still runs but its output is unused — also harmless.

**`services.projection.validate` false-positive on `ambiguous-source`.** The orphan `business/de/services.md` config fragment in warpgogol-com predates this RFC. If a `services/` directory is later created alongside it, the validator flags `ambiguous-source`. Mitigation: this rule is advisory (warn), not blocking — the projection reads from `services/`, not `services.md`. The orphan file is not modified by this RFC.

**Agent misinterpretation of content scope.** Agents implementing this RFC might assume they need to author `business/{lang}/services/{slug}.md` content files. Mitigation: Phase 5 explicitly states content authoring is out of scope. NonGoals reinforces this. The projection contract is ready for when content arrives; `services.projection.validate` passes with no services files.

## Acceptance criteria

- [x] `projectServices()` added to `business-projection.ts`; maps `BusinessServiceData[]` → `SemanticService[]`. (evidence: implemented historically)
- [x] `businessServiceSchema` gains `description: z.string().optional()`. (evidence: implemented historically)
- [x] `OrganizationProfileInput` gains `services?: SemanticService[]`; `buildOrganizationProfile()` sets `organization.services`. (evidence: implemented historically)
- [x] `SemanticService.description` made optional; `SemanticPageModel.services` removed. (evidence: implemented historically)
- [x] Disk loader (`semantic-loader.ts`) reads `business/{lang}/services/` and passes projected services to `buildOrganizationProfile()`. (evidence: implemented historically)
- [x] Astro loader (`semantic-profile.ts`) calls `getBusinessServices()` and passes projected services to `buildOrganizationProfile()`. (evidence: implemented historically)
- [x] `buildServiceNodes()` reads from `context.page.organization.services`. (evidence: implemented historically)
- [x] `servicesListNode` in `buildJsonLd()` reads from `context.page.organization.services`. (evidence: implemented historically)
- [x] `servicesListId` derived from `organization.services` in `createJsonLdContext()`; scoped to `${ids.organization}/services`. (evidence: implemented historically)
- [x] `buildOrganizationNode()` needs no new property — services link via `provider` on each `Service` node. (evidence: implemented historically)
- [x] `formatServices()` added to `llms.ts`; `## Services` section emitted in `llms-full.txt`. (evidence: implemented historically)
- [x] `extractServices()` and `services` return field removed from `home-page.ts`. (evidence: implemented historically)
- [x] `services.projection.validate` command registered and wired into `APPS_BUILD_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)
- [x] `pnpm build` green for warpgogol-com and nicaragua-projekt. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] nicaragua-projekt (no services) omits `## Services` with no error. (evidence: original apps retired by RFC-0381, implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference `RFC-0373` in commits.
- Agents MUST NOT add `SemanticPageModel.services` back — the removal is forward-only.
- Agents MUST NOT project services per-page — the organization level is the single projection point.
- Agents MUST NOT invent a new content domain for services — the `business/{lang}/services/{slug}.md` repeatable collection already has schema, dispatcher, and loader support.
- Agents MUST keep `projectServices()` pure and side-effect-free, matching the `projectOffer()` / `projectLocation()` / `projectPeople()` contract.
- Agents MUST update `amendedBy: [RFC-0373]` on RFC-0147 when implementing.
- Agents MUST synchronize `docs/technology.xml` (new projector in `@gogol/share`) and `docs/verification-plan.xml` (new `services.projection.validate` command) when implementing.
- No `AGENTS.md` rule changes are required by this RFC — package ownership boundaries are unchanged.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0373 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
