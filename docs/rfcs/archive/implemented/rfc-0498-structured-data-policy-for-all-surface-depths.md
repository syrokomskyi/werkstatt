---
id: RFC-0498
title: Structured data policy for all surface depths
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-23
updatedAt: 2026-07-23
enhancedAt: 2026-07-23
implementedAt: 2026-07-23
closedAt: null
supersedes: []
supersededBy: null
amends:
- RFC-0238
- RFC-0492
amendedBy:
- RFC-0500
- RFC-0506
related:
- RFC-0074
- RFC-0192
- RFC-0193
- RFC-0238
- RFC-0432
- RFC-0478
- RFC-0479
- RFC-0480
- RFC-0492
- RFC-0495
- RFC-0496
- RFC-0497
satisfies:
- DNA-16
- DNA-24
- DNA-53
breaksC: true
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
  - surface.validate
  - seo.structured-data.validate
  - surface.contract.validate
  removed: []
appsImpacted:
- warpgogol-com
packagesImpacted:
- '@gogol/surface'
- '@gogol/ontology'
- '@gogol/site-kernel-checks'
- '@gogol/share'
- '@gogol/pbp'
- '@warpgogol/ontology'
successSignals:
- Every surface page emits JSON-LD with @type WebPage as the primary type — never LocalBusiness, Electrician, HairSalon, or any trade-specific business type.
- Depth-1 industry pages (website-local) emit WebPage + BreadcrumbList + Service (provider=Warpgogol, serviceType=Digitales Fundament für {industry}, audience={industry}).
- website-service depth-1 service pages emit WebPage + BreadcrumbList + Service (provider=Warpgogol, serviceType=Digitales Fundament für {industry} — {service}, audience={industry}).
- Depth-4 city pages emit WebPage + BreadcrumbList (no Service, no LocalBusiness — the city page is a navigation hub, not a service offering).
- Depth-5 intersection pages emit WebPage + BreadcrumbList + Service (provider=Warpgogol, serviceType=Digitales Fundament für {industry} — {service}, areaServed={city}, audience={industry}) — only when the intersection gate (RFC-0497) passes.
- No surface page emits Offer, BookAction, PriceSpecification, or QuantitativeValue with fabricated values — Warpgogol does not sell haircuts or electrical installations.
- No surface page emits LocalBusiness, Electrician, HairSalon, or any schema.org business type — Warpgogol is not a local business.
- 'The Service JSON-LD on surface pages always has provider: { @type: Organization, name: Warpgogol } — never a fabricated business.'
- BreadcrumbList JSON-LD reflects the canonical URL hierarchy (RFC-0495) — no /deu/bw/ segments in breadcrumb URLs.
- 'seo.structured-data.validate (RFC-0074) enforces the per-depth type policy for surface pages: required types present, prohibited types absent, Service provider.name is Warpgogol, no fabricated Offer/PriceSpecification.'
- surface.validate checks BreadcrumbList URLs in generated surface artifacts against the canonical URL hierarchy (no /deu/bw/ segments).
- surface.contract.validate includes per-depth JSON-LD type policy checks against the C-contract.
nonGoals:
- Does not change the JSON-LD emission for non-surface pages (home, legal, pricing, blog, etc.) — those are governed by their own RFCs and system.md declarations.
- Does not add new JSON-LD types beyond WebPage, BreadcrumbList, and Service — FAQPage, Organization, etc. are already handled by existing structured data emission.
- Does not change the structured data audit validator (RFC-0074) beyond updating it to enforce the surface per-depth policy — the validator's core logic is preserved.
- Does not emit Review, AggregateRating, or other reputation-type JSON-LD — Warpgogol does not have reviews to markup.
- Does not emit Event, Product, or Offer JSON-LD on surface pages — the surface is not an e-commerce or event surface.

---

# RFC-0498: Structured data policy for all surface depths

## Context

RFC-0432 established the schema.org mapping contract for the PBP compiler. RFC-0492 (industry dossier model) specified that depth-1 industry pages emit `WebPage + BreadcrumbList + Service` — not `Electrician`, `HairSalon`, or `LocalBusiness` — and extended `SemanticModelOptions` with `surfaceId` and `depth` to gate the depth-1 correction. However, RFC-0492's correction was limited to depth-1 `website-local` pages. An external expert review (file 14.3, §14) reinforced this for all surface depths:

> Warpgogol не является салоном и не продаёт Haarschnitt.
>
> Если страница существует, использовать: WebPage, Service, BreadcrumbList.
>
> Не размечать вымышленные цены, availability или парикмахерские услуги.

Currently, the structured data emission for surface pages is not governed by a per-depth policy. The baker emits JSON-LD based on the page's semantic type, but there is no explicit enforcement that prevents `LocalBusiness`, `HairSalon`, `Electrician`, `Offer`, or `BookAction` from appearing on surface pages.

## Problem

1. **No per-depth type policy.** The baker may emit trade-specific business types (`HairSalon`, `Electrician`, `LocalBusiness`) on surface pages, creating a false impression that Warpgogol is such a business.
2. **No prohibition on fabricated offers.** Surface pages may emit `Offer`, `BookAction`, or `PriceSpecification` with fabricated values — prices, availability, or service details that Warpgogol does not actually provide.
3. **No enforcement.** `seo.structured-data.validate` (RFC-0074) checks for required types but does not check for prohibited types.
4. **Breadcrumb inconsistency.** BreadcrumbList JSON-LD may still reflect the old URL hierarchy with `/deu/bw/` segments (RFC-0495 changes the URL structure).

## Decision

### Per-depth JSON-LD type policy

| Surface | Depth | Constellation | Required types | Prohibited types |
| --- | --- | --- | --- | --- |
| website-local | 0 | website-pillar | `WebPage` | `LocalBusiness`, `Service`, `Offer`, `BookAction` |
| website-local | 1 | website-industry | `WebPage`, `BreadcrumbList`, `Service` | `LocalBusiness`, `Electrician`, `HairSalon`, `Offer`, `BookAction`, `PriceSpecification` |
| website-service | 1 | website-service | `WebPage`, `BreadcrumbList`, `Service` | `LocalBusiness`, `Electrician`, `HairSalon`, `Offer`, `BookAction`, `PriceSpecification` |
| website-local | 2 | website-country | `WebPage`, `BreadcrumbList` | `Service`, `LocalBusiness`, `Offer`, `BookAction` |
| website-local | 3 | website-region | `WebPage`, `BreadcrumbList` | `Service`, `LocalBusiness`, `Offer`, `BookAction` |
| website-local | 4 | website-city | `WebPage`, `BreadcrumbList` | `Service`, `LocalBusiness`, `Offer`, `BookAction` |
| website-local | 5 | bedarfskarte | `WebPage`, `BreadcrumbList`, `Service` | `LocalBusiness`, `Electrician`, `HairSalon`, `Offer`, `BookAction`, `PriceSpecification` |

### Service JSON-LD shape

The `Service` JSON-LD on website-local depth-1, website-service depth-1, and website-local depth-5 pages always has:

```json
{
  "@type": "Service",
  "provider": {
    "@type": "Organization",
    "name": "Warpgogol"
  },
  "serviceType": "Digitales Fundament für {industry}",
  "audience": {
    "@type": "BusinessAudience",
    "audienceType": "{industry}"
  }
}
```

For website-local depth-5 (intersection) pages, the Service also includes:

```json
{
  "areaServed": {
    "@type": "City",
    "name": "{city}"
  }
}
```

No `Offer`, `PriceSpecification`, `QuantitativeValue`, or `BookAction` is attached to the Service. Warpgogol does not sell the trade service; it sells the Digitales Fundament (website product), which is referenced from PBP, not from surface page JSON-LD.

### BreadcrumbList

The `BreadcrumbList` reflects the canonical URL hierarchy (RFC-0495):

```json
{
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Website", "item": "/website/" },
    { "@type": "ListItem", "position": 2, "name": "{industry}", "item": "/website/{industry}/" },
    { "@type": "ListItem", "position": 3, "name": "{city}", "item": "/website/{industry}/{city}/" },
    { "@type": "ListItem", "position": 4, "name": "{service}", "item": "/website/{industry}/{city}/{service}/" }
  ]
}
```

No `/deu/bw/` segments in breadcrumb URLs.

### Enforcement

`seo.structured-data.validate` (RFC-0074) is extended with prohibited-type checking for surface pages. The existing validator already scans rendered HTML for required JSON-LD types — this RFC adds:

1. **Required types check** (existing): every emitted surface page has the required JSON-LD types for its surface+depth.
2. **Prohibited types check** (new): no surface page has any prohibited JSON-LD type for its surface+depth.
3. **Service provider check** (new): the Service JSON-LD has `provider.name: Warpgogol` — not a fabricated business name.
4. **Fabricated offer check** (new): no surface page emits `Offer`, `BookAction`, `PriceSpecification`, or `QuantitativeValue` with fabricated values.

`surface.validate` is extended with: 5. **BreadcrumbList URL check** (new): BreadcrumbList URLs in generated surface artifacts match the canonical URL hierarchy (no `/deu/bw/` segments, per RFC-0495).

The existing per-page `structuredData` requirements in `system.md` continue to apply to non-surface pages. Surface page type checking is gated by `surfaceId` and `depth` in `SemanticModelOptions` (already present from RFC-0492).

### Layer C contract

The per-depth type policy is declared in the Layer C contract (`packages/ontology/src/external-surfaces/jsonld-types.yaml`, RFC-0480). The `jsonld-types.yaml` file is extended with a `surfacePolicy` section that maps surface+depth to required and prohibited types. `surface.contract.validate` checks that the emitted JSON-LD matches the contract.

## Architectural fit

- **DNA-16 (Semantic layer shares topology with navigation):** The per-depth JSON-LD type policy is derived from the same page topology (`getRouteRegistry()` from `@gogol/share`) used for navigation rendering. The surface identity and depth that gate the JSON-LD emission are the same fields used by the route registry. No parallel page-structure model is introduced.
- **DNA-24 (Block-declarative pages):** The baker emits JSON-LD based on the block-declarative page's surface identity and depth — extending DNA-24's block model to the semantic output layer. The per-depth type policy is a semantic-layer projection of the block-declarative page structure: pages with Service blocks (depth-1, website-service, depth-5) emit `Service` JSON-LD; pages without Service blocks (depth-0, 2, 3, 4) do not.
- **DNA-53 (Semantic fingerprint governance):** No new ad hoc hashing helpers are introduced outside `@gogol/fingerprint`. The per-depth type policy is a declarative contract in YAML, not a hashing function. If the validator ever needs content-addressed fingerprints for JSON-LD comparison, it must use `@gogol/fingerprint` per DNA-53.
- **RFC-0238 (website-local surface):** Amended — the per-depth type policy governs JSON-LD emission for all depths of the `website-local` surface. The five-axis cascade is preserved; only the JSON-LD type policy is new.
- **RFC-0492 (industry dossier model):** Amended — RFC-0492 established the depth-1 JSON-LD correction (`WebPage + BreadcrumbList + Service` instead of `LocalBusiness`/`Electrician`/`HairSalon`). This RFC extends that correction to all surface depths and codifies it as a declarative per-depth policy in the C-contract.
- **RFC-0495 (URL restructuring):** The BreadcrumbList URL check enforces the canonical URL hierarchy defined by RFC-0495 — no `/deu/bw/` segments.
- **RFC-0496 (service dossier):** The `website-service` surface's depth-1 pages are included in the per-depth type policy table. Service pages emit `WebPage + BreadcrumbList + Service` with the same Service shape as `website-local` depth-1.
- **RFC-0497 (intersection gate):** The `website-local` depth-5 intersection pages emit `WebPage + BreadcrumbList + Service` only when the intersection gate passes — pages not emitted have no JSON-LD.
- **RFC-0480 (Layer C protection):** `breaksC: true` declared. The `jsonld-types.yaml` C-contract is updated with the per-depth type policy in the same RFC. `surface.contract.validate` verifies compliance.
- **RFC-0478 (Platform versioning):** `versionBump: minor` — the C-contract file (`jsonld-types.yaml`) is in `packages/ontology/`, so the platform semantic hash changes. A migrator is required (RFC-0479).
- **RFC-0479 (Migrator system):** A no-op migrator with id `rfc-0498` is registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts`. The migrator advances `migratorCursor` without transforming authored data — the per-depth type policy is a C-contract change, not a data contract change. The migrator is idempotent (PBT `f(f(x))==f(x)`): it returns authored data unchanged.
- **RFC-0074 (SEO audit):** `seo.structured-data.validate` is extended with prohibited-type checking for surface pages. The validator's core logic (scanning rendered HTML for JSON-LD types) is preserved — the extension adds prohibited-type and Service-provider checks gated by surface identity.

## Design

### CLI surface

No new commands. Existing commands are updated:

```sh
# Extended with prohibited-type checking for surface pages
pnpm exec werkstatt run seo.structured-data.validate --site warpgogol-com

# Extended with BreadcrumbList URL checks for surface artifacts
pnpm exec werkstatt run surface.validate --site warpgogol-com

# Extended with per-depth JSON-LD type policy checks against C-contract
pnpm exec werkstatt run surface.contract.validate --site warpgogol-com
```

All three commands are `scope: app` (they operate on a specific site's built artifacts). `seo.structured-data.validate` runs in `sites-check-postbuild` (it requires built `dist/` HTML). `surface.validate` runs in `build.check`. `surface.contract.validate` runs in `build.check`.

### TypeScript contracts

```ts
/** Per-depth JSON-LD type policy entry. Lives in jsonld-types.yaml as a surfacePolicy[] array. */
interface JsonldSurfacePolicyEntry {
  surface: string;
  depth: number;
  requiredTypes: string[];
  prohibitedTypes: string[];
}

/** Extension to the existing jsonldTypesContract schema. */
interface JsonldTypesContractWithPolicy {
  types: Array<{ "@type": string; required: string[]; optional: string[] }>;
  surfacePolicy: JsonldSurfacePolicyEntry[];
}
```

The `seo.structured-data.validate` extension uses the existing `extractAllJsonLdNodes()` and `jsonLdNodeHasType()` helpers from `audit/validators/helpers.ts`. The surface+depth of each page is resolved from `SemanticModelOptions` (already present from RFC-0492) or from the route registry.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/src/external-surfaces/jsonld-types.yaml` | C-contract — gains `surfacePolicy` section with per-depth required/prohibited types |
| `packages/ontology/src/external-surfaces/index.ts` | Zod schema — `surfacePolicySchema` added to `jsonldTypesContract` |
| `packages/os/site-kernel-checks/src/audit/validators/seo-structured-data.ts` | Extended — prohibited-type checking, Service provider check, fabricated offer check for surface pages |
| `packages/os/site-kernel-checks/src/surface/validate.ts` | Extended — BreadcrumbList URL check against canonical URL hierarchy |
| `packages/os/site-kernel-handoff/src/surface-contract.ts` | Extended — per-depth JSON-LD type policy checks against C-contract |
| `packages/share/src/semantic/jsonld/service.ts` | Extended — `buildServiceNodes` gates Service emission by per-depth policy for all depths, not just depth-1 |
| `packages/pbp/src/semantic-model.ts` | Extended — `buildPageSemanticModel` applies per-depth type policy for all surface depths |
| `packages/surface/src/types.ts` | Types — `VirtualRouteEntry` gains optional `jsonldPolicy?: JsonldSurfacePolicyEntry` field for semantic model consumption |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0498.ts` | New: no-op migrator |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Register `rfc0498Migrator` |

### Output format

No new `--json` output shapes. `seo.structured-data.validate` produces its standard `AuditResult` with additional `ruleId` patterns:

- `seo-structured-data.prohibited-{type}` — prohibited type found on surface page
- `seo-structured-data.service-provider-mismatch` — Service provider.name is not "Warpgogol"
- `seo-structured-data.fabricated-offer` — Offer/BookAction/PriceSpecification/QuantitativeValue found on surface page

`surface.validate` produces its standard output with additional `SURF-BREADCRUMB-URL` diagnostic for breadcrumb URLs containing `/deu/bw/` segments.

### Failure modes

| Condition | Behavior |
| --- | --- |
| Surface page missing required type | `seo.structured-data.validate` reports `seo-structured-data.missing-{type}` (error) |
| Surface page has prohibited type | `seo.structured-data.validate` reports `seo-structured-data.prohibited-{type}` (error) |
| Service provider.name is not "Warpgogol" | `seo.structured-data.validate` reports `seo-structured-data.service-provider-mismatch` (error) |
| Surface page emits Offer/BookAction/PriceSpecification | `seo.structured-data.validate` reports `seo-structured-data.fabricated-offer` (error) |
| BreadcrumbList URL contains /deu/bw/ segments | `surface.validate` reports `SURF-BREADCRUMB-URL` (error) |
| `jsonld-types.yaml` surfacePolicy section missing | `surface.contract.validate` reports `jsonld-surface-policy-missing` (error) |
| Empty surface (no generated pages) | All validators exit 0 with empty findings — graceful degradation |
| Migrator applied to already-migrated data | No-op: migrator returns data unchanged (idempotent) |

## Rollout

### Default behavior

- **Lands with C-contract update.** The `jsonld-types.yaml` `surfacePolicy` section, `seo.structured-data.validate` extension, `surface.validate` extension, and `surface.contract.validate` extension are merged in the same change.
- **No backward compatibility.** Prohibited JSON-LD types are removed from the baker's emission — no dual-path, no feature flag. Existing `dist/` artifacts that contain prohibited types will fail `seo.structured-data.validate` until rebuilt.
- **Pilot = `warpgogol-com`.** The current dataset has 2 industries × 6 cities × ~4 services = ~48 potential pages. The validator scan cost is trivial for this scale.
- **New sites** comply from day one — the baker emits correct JSON-LD per the C-contract policy from the first build.
- **Pipeline.** `surface.contract.validate` (in `build.check`) verifies C-contract compliance. `seo.structured-data.validate` (in `sites-check-postbuild`) verifies rendered HTML. `surface.validate` (in `build.check`) verifies generated artifacts.

### Migration path

The migrator (`rfc-0498`) is a no-op on authored data — the per-depth type policy is a C-contract change, not a data contract change. `mission.migrate` runs the migrator, which advances `migratorCursor` without changing content files. The next `surface.generate` regenerates `src/surface.generated.json` with the correct JSON-LD emission per the updated baker.

### Deployment sequence

1. Platform change merged: C-contract, baker JSON-LD emission, validator extensions, migrator.
2. Next mission for `warpgogol-com`: `mission.materialize` → `mission.migrate` (no-op) → operator edits (if any) → `mission.validate` → `release.prepare` → `mission.reconcile` → `release.publish`.
3. `release.publish` deploys the new `dist` with correct JSON-LD — no intermediate state where prohibited types are served.

## Alternatives considered

1. **New `surface.structured-data.validate` command.** Rejected — the existing `seo.structured-data.validate` (RFC-0074) already scans rendered HTML for JSON-LD types. Adding prohibited-type checking is a natural extension of the existing validator, not a separate concern. A new command would duplicate the HTML scanning infrastructure and create confusion about which validator is authoritative for surface pages. RFC-0492's `surface.industry.validate` earned its existence because it checks publication gates, claim restrictions, and duplicate content — much more than type checking. RFC-0498's enforcement is purely type-based, which fits naturally as an extension of the existing structured data validator.

2. **Inline the per-depth policy in the baker code.** Rejected — the per-depth type policy is a declarative contract that belongs in the C-contract (`jsonld-types.yaml`), not in baker code. Inlining would make the policy invisible to `surface.contract.validate` and would require code changes for every policy adjustment. The declarative approach allows operators to adjust the policy by editing YAML, not code.

3. **Extend `surface.contract.validate` only, without `seo.structured-data.validate` changes.** Rejected — `surface.contract.validate` checks the C-contract against generated artifacts, but it does not scan rendered HTML. `seo.structured-data.validate` scans the actual rendered output, which is the authoritative source for what search engines see. Both checks are needed: the C-contract check catches policy drift at build time, and the rendered HTML check catches baker bugs that emit wrong types despite the contract.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| False positive: legitimate type on prohibited list | Low | The prohibited list is per-depth — types are only prohibited where they don't belong. `Service` is prohibited on depth-0/2/3/4 but required on depth-1/website-service/depth-5. No type is globally prohibited. |
| Baker emits wrong type despite C-contract | Low | `seo.structured-data.validate` catches this at post-build. The C-contract check catches policy drift at build time. Two-layer enforcement. |
| Performance: scanning all surface pages | Low | Current dataset has ~48 pages. HTML scanning is O(pages × jsonLdBlocksPerPage) — trivial. Future scaling should cache parsed JSON-LD per page. |
| Agent misinterpretation: adding new JSON-LD types | Low | Implementation notes explicitly state that no new JSON-LD types beyond WebPage, BreadcrumbList, and Service are added. The C-contract `types` list is the closed set. |
| Existing dist artifacts fail after upgrade | Medium | `seo.structured-data.validate` runs in `sites-check-postbuild` — artifacts are rebuilt before validation. Old dist artifacts are replaced by the next `build.prepare`. |
| Layer C break | Low | `breaksC: true` declared; C-contract updated in the same change; `surface.contract.validate` verifies compliance. |
| Migrator not registered | None | `versionBump: minor` requires migrator (RFC-0479); no-op migrator `rfc-0498` registered in the same change. |

## Implementation plan

1. Add `surfacePolicy` section to `jsonld-types.yaml` C-contract with per-depth required/prohibited types.
2. Add `surfacePolicySchema` to `jsonldTypesContract` Zod schema in `@gogol/ontology/external-surfaces`.
3. Extend `buildServiceNodes` in `@gogol/share` to gate Service emission by per-depth policy for all depths (not just depth-1).
4. Extend `buildPageSemanticModel` in `@gogol/pbp` to apply per-depth type policy for all surface depths.
5. Extend `seo.structured-data.validate` with prohibited-type checking, Service provider check, and fabricated offer check for surface pages.
6. Extend `surface.validate` with BreadcrumbList URL check against canonical URL hierarchy.
7. Extend `surface.contract.validate` with per-depth JSON-LD type policy checks.
8. Update BreadcrumbList emission to use canonical URLs (RFC-0495).
9. Register no-op migrator `rfc-0498` in `packages/os/site-kernel-handoff/src/migrators/registry.ts`.
10. Update `docs/requirements.xml` and `docs/verification-plan.xml` if they contain structured data rules.

## Acceptance criteria

- [x] Every surface page emits `WebPage` as the primary JSON-LD type. (evidence: buildWebPageNode in packages/share/src/semantic/jsonld/webpage.ts always emits WebPage; surface pages inherit this via buildJsonLd)
- [x] No surface page emits `LocalBusiness`, `Electrician`, `HairSalon`, or any trade-specific business type. (evidence: surfacePolicy prohibitedTypes in packages/ontology/src/external-surfaces/jsonld-types.yaml; seo.structured-data.validate checks prohibited types in packages/os/site-kernel-checks/src/audit/validators/seo-structured-data.ts)
- [x] No surface page emits `Offer`, `BookAction`, `PriceSpecification`, or `QuantitativeValue` with fabricated values. (evidence: fabricated-offer check in seo-structured-data.ts lines 201-216; prohibitedTypes in surfacePolicy entries)
- [x] website-local depth-1, website-service depth-1, and website-local depth-5 pages emit `Service` with `provider.name: Warpgogol`. (evidence: buildServiceNodes in packages/share/src/semantic/jsonld/service.ts emits industry Service for these depths; buildPageSemanticModel in packages/pbp/src/semantic-model.ts sets industryService; service-provider-mismatch check in seo-structured-data.ts)
- [x] BreadcrumbList URLs match the canonical URL hierarchy (no `/deu/bw/` segments). (evidence: SURF-BREADCRUMB-URL check in packages/os/site-kernel-checks/src/surface/validate.ts lines 173-184)
- [x] `seo.structured-data.validate` enforces required types, prohibited types, Service provider, and fabricated offer checks for surface pages. (evidence: packages/os/site-kernel-checks/src/audit/validators/seo-structured-data.ts lines 153-218; build:check passes)
- [x] `surface.validate` checks BreadcrumbList URLs in generated surface artifacts. (evidence: packages/os/site-kernel-checks/src/surface/validate.ts SURF-BREADCRUMB-URL check; build:check passes)
- [x] `surface.contract.validate` includes per-depth JSON-LD type policy checks against the C-contract. (evidence: packages/os/site-kernel-handoff/src/surface-contract.ts lines 119-140; build:check passes)
- [x] Migrator `rfc-0498` registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts`. (evidence: packages/os/site-kernel-handoff/src/migrators/rfc-0498.ts; registry.ts includes rfc0498Migrator; PBT test passes)
- [x] `rfc.validate` passes on this file. (evidence: pnpm exec werkstatt run rfc.validate reports no errors for RFC-0498)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT add new JSON-LD types beyond `WebPage`, `BreadcrumbList`, and `Service` to surface pages — the C-contract `types` list is the closed set. Adding a new type requires a superseding RFC.
- Agents MUST update `jsonld-types.yaml` in the same change as the baker emission changes — `breaksC: true` requires the C-contract to be updated.
- Agents MUST register the `rfc-0498` migrator in `packages/os/site-kernel-handoff/src/migrators/registry.ts` — `versionBump: minor` requires a migrator (RFC-0479).
- Agents MUST run `seo.structured-data.validate`, `surface.validate`, and `surface.contract.validate` after implementation to verify the per-depth type policy is enforced.
- Agents MUST update the `CHANGE_SUMMARY` Compass blocks in modified files with `RFC-0498` entries (DNA-42).
- Agents MUST update `docs/requirements.xml` and `docs/verification-plan.xml` if they contain structured data rules that reference the old type policy.
