---
rfcId: RFC-0498
planId: PLAN-RFC-0498-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/ontology"
    - "@gogol/share"
    - "@gogol/pbp"
    - "@gogol/surface"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - docs/requirements.xml
    - docs/verification-plan.xml
    - packages/ontology/AGENTS.md
    - packages/share/AGENTS.md
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0498

## 1. Objectives

- [ ] O1 — Add per-depth JSON-LD type policy to the C-contract (`jsonld-types.yaml`) — maps to acceptance criterion "Every surface page emits WebPage as the primary JSON-LD type"
- [ ] O2 — Extend the baker to emit JSON-LD according to per-depth policy for all surface depths — maps to acceptance criteria "No surface page emits LocalBusiness/Electrician/HairSalon", "No surface page emits Offer/BookAction/PriceSpecification", "website-local depth-1, website-service depth-1, and website-local depth-5 pages emit Service with provider.name: Warpgogol"
- [ ] O3 — Extend `seo.structured.data.validate` with prohibited-type, Service provider, and fabricated-offer checks — maps to acceptance criterion "seo.structured.data.validate enforces required types, prohibited types, Service provider, and fabricated offer checks for surface pages"
- [ ] O4 — Extend `surface.validate` with BreadcrumbList URL check — maps to acceptance criterion "surface.validate checks BreadcrumbList URLs in generated surface artifacts"
- [ ] O5 — Extend `surface.contract.validate` with per-depth JSON-LD type policy checks — maps to acceptance criterion "surface.contract.validate includes per-depth JSON-LD type policy checks against the C-contract"
- [ ] O6 — Register no-op migrator `rfc-0498` — maps to acceptance criterion "Migrator rfc-0498 registered in packages/os/site-kernel-handoff/src/migrators/registry.ts"

## 2. Affected artifacts

### 2.1 Code and commands

| File | Change |
| --- | --- |
| `packages/ontology/src/external-surfaces/jsonld-types.yaml` | Add `surfacePolicy` section with per-depth required/prohibited types |
| `packages/ontology/src/external-surfaces/index.ts` | Add `surfacePolicySchema` to `jsonldTypesContract` Zod schema; export `JsonldSurfacePolicyEntry` type |
| `packages/share/src/semantic/jsonld/service.ts` | Extend `buildServiceNodes` to gate Service emission by per-depth policy for all depths (currently only depth-1 website-local) |
| `packages/share/src/semantic/jsonld.ts` | Extend `buildJsonLd` to suppress org-level Service nodes for all depths where Service is prohibited (currently only depth-1 website-local) |
| `packages/pbp/src/semantic-model.ts` | Extend `buildPageSemanticModel` to set `industryService` for website-service depth-1 and website-local depth-5 (currently only website-local depth-1) |
| `packages/surface/src/types.ts` | Add optional `jsonldPolicy?: JsonldSurfacePolicyEntry` field to `VirtualRouteEntry` for semantic model consumption |
| `packages/os/site-kernel-checks/src/audit/validators/seo-structured-data.ts` | Add prohibited-type check, Service provider check, fabricated-offer check for surface pages |
| `packages/os/site-kernel-checks/src/surface/validate.ts` | Add BreadcrumbList URL check (SURF-BREADCRUMB-URL) for surface artifacts |
| `packages/os/site-kernel-handoff/src/surface-contract.ts` | Add per-depth JSON-LD type policy checks against C-contract `surfacePolicy` section |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0498.ts` | New: no-op migrator (pattern from `rfc-0495.ts`) |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Import and register `rfc0498Migrator` |

### 2.2 Configuration and data

| File | Change |
| --- | --- |
| `packages/ontology/src/external-surfaces/jsonld-types.yaml` | C-contract — gains `surfacePolicy` array with 7 entries (one per surface+depth combination) |

### 2.3 Documentation and specs

| File | Change |
| --- | --- |
| `docs/requirements.xml` | Add structured data policy requirements if structured data rules are present |
| `docs/verification-plan.xml` | Add verification steps for per-depth JSON-LD type policy |
| `packages/ontology/AGENTS.md` | Note `surfacePolicy` section in jsonld-types.yaml C-contract |
| `packages/share/AGENTS.md` | Note per-depth Service emission gating in semantic/jsonld/service.ts |
| `packages/os/site-kernel-checks/AGENTS.md` | Note prohibited-type checking extension in seo-structured-data.ts |

### 2.4 Validation and pipelines

| Pipeline | Command | Role |
| --- | --- | --- |
| `build.check` | `surface.contract.validate` | Verifies C-contract `surfacePolicy` section is present and types are declared |
| `build.check` | `surface.validate` | Extended with BreadcrumbList URL check (SURF-BREADCRUMB-URL) |
| `sites-check-postbuild` | `seo.structured.data.validate` | Extended with prohibited-type, Service provider, fabricated-offer checks |

## 3. Step sequence

### Step 1. Add `surfacePolicy` to C-contract and Zod schema

**Goal:** Declare the per-depth JSON-LD type policy in the Layer C contract.

**Agent actions:**

- Add `surfacePolicy` array to `packages/ontology/src/external-surfaces/jsonld-types.yaml` with 7 entries:
  - `{ surface: website-local, depth: 0, requiredTypes: [WebPage], prohibitedTypes: [LocalBusiness, Service, Offer, BookAction] }`
  - `{ surface: website-local, depth: 1, requiredTypes: [WebPage, BreadcrumbList, Service], prohibitedTypes: [LocalBusiness, Electrician, HairSalon, Offer, BookAction, PriceSpecification] }`
  - `{ surface: website-service, depth: 1, requiredTypes: [WebPage, BreadcrumbList, Service], prohibitedTypes: [LocalBusiness, Electrician, HairSalon, Offer, BookAction, PriceSpecification] }`
  - `{ surface: website-local, depth: 2, requiredTypes: [WebPage, BreadcrumbList], prohibitedTypes: [Service, LocalBusiness, Offer, BookAction] }`
  - `{ surface: website-local, depth: 3, requiredTypes: [WebPage, BreadcrumbList], prohibitedTypes: [Service, LocalBusiness, Offer, BookAction] }`
  - `{ surface: website-local, depth: 4, requiredTypes: [WebPage, BreadcrumbList], prohibitedTypes: [Service, LocalBusiness, Offer, BookAction] }`
  - `{ surface: website-local, depth: 5, requiredTypes: [WebPage, BreadcrumbList, Service], prohibitedTypes: [LocalBusiness, Electrician, HairSalon, Offer, BookAction, PriceSpecification] }`
- Add `surfacePolicySchema` Zod schema to `packages/ontology/src/external-surfaces/index.ts`
- Extend `jsonldTypesContract` to include `surfacePolicy: z.array(surfacePolicySchema)`
- Export `JsonldSurfacePolicyEntry` type
- Add `CHANGE_SUMMARY` entry: `RFC-0498: add surfacePolicy to jsonld-types.yaml C-contract`

**Validation:**

- `pnpm --filter @gogol/ontology build:check` passes
- `surface.contract.validate --site warpgogol-com` passes (contract loads with new section)

**Completion criterion:** `jsonldTypesContract.parse(loadYaml("jsonld-types.yaml"))` succeeds with `surfacePolicy` array containing 7 entries.

**Human review:** no

---

### Step 2. Extend baker JSON-LD emission for all surface depths

**Goal:** The baker emits JSON-LD according to the per-depth type policy for all surface depths, not just depth-1 website-local.

**Agent actions:**

- In `packages/share/src/semantic/jsonld/service.ts`:
  - Extend `buildServiceNodes` to check the per-depth policy from the C-contract (imported via `@gogol/ontology/external-surfaces`)
  - For surface+depth combinations where `Service` is in `prohibitedTypes`: return `[]` (no Service nodes)
  - For surface+depth combinations where `Service` is in `requiredTypes`: emit the industry-specific Service node (extend the current depth-1 website-local logic to also cover website-service depth-1 and website-local depth-5)
  - For website-local depth-5: include `areaServed: { @type: City, name: {city} }` in the Service node
- In `packages/share/src/semantic/jsonld.ts`:
  - Extend `buildJsonLd` to suppress org-level Service nodes and the services ItemList for all depths where `Service` is prohibited (currently only depth-1 website-local)
- In `packages/pbp/src/semantic-model.ts`:
  - Extend `buildPageSemanticModel` to set `industryService` for website-service depth-1 and website-local depth-5 (currently only website-local depth-1)
  - For website-local depth-5: set `industryService.areaServed` to the city name from the page context
- In `packages/surface/src/types.ts`:
  - Add optional `jsonldPolicy?: JsonldSurfacePolicyEntry` field to `VirtualRouteEntry` (imported from `@gogol/ontology/external-surfaces`)
- Add `CHANGE_SUMMARY` entries to all modified files with `RFC-0498` prefix
- Update existing tests in `packages/share/src/tests/jsonld-service.test.ts` to cover website-service depth-1 and website-local depth-5
- Add new test: depth-0/2/3/4 pages emit no Service nodes (prohibited)

**Validation:**

- `pnpm --filter @gogol/share build:check` passes
- `pnpm --filter @gogol/pbp build:check` passes
- `pnpm --filter @gogol/surface build:check` passes
- `pnpm --filter @gogol/share test` passes (including new JSON-LD tests)

**Completion criterion:** `buildJsonLd` emits Service nodes only for surface+depth combinations where Service is required; no Service nodes for prohibited depths.

**Human review:** no

---

### Step 3. Extend `seo.structured.data.validate` with prohibited-type checks

**Goal:** The existing SEO structured data validator enforces the per-depth type policy on rendered HTML.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/audit/validators/seo-structured-data.ts`:
  - Import `jsonldTypes` (specifically `surfacePolicy`) from `@gogol/ontology/external-surfaces`
  - Import `extractAllJsonLdNodes`, `jsonLdNodeHasType` from `./helpers.ts` (already available)
  - For each surface page (identified by route path matching surface URL patterns):
    - Resolve the surface+depth from the route registry or `SemanticModelOptions`
    - Check required types are present (existing logic, extended to use C-contract policy)
    - Check no prohibited types are present (new: `seo-structured-data.prohibited-{type}`)
    - Check Service `provider.name` is "Warpgogol" when Service is emitted (new: `seo-structured-data.service-provider-mismatch`)
    - Check no `Offer`, `BookAction`, `PriceSpecification`, `QuantitativeValue` nodes are present (new: `seo-structured-data.fabricated-offer`)
  - Non-surface pages continue to use the existing per-page `structuredData` requirements from `system.md`
- Add `CHANGE_SUMMARY` entry: `RFC-0498: extend with prohibited-type, Service provider, and fabricated-offer checks for surface pages`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build:check` passes
- `pnpm exec werkstatt run seo.structured.data.validate --site warpgogol-com` passes on a built site

**Completion criterion:** `seo.structured.data.validate` reports `prohibited-{type}`, `service-provider-mismatch`, and `fabricated-offer` findings for surface pages that violate the per-depth policy.

**Human review:** no

---

### Step 4. Extend `surface.validate` with BreadcrumbList URL check

**Goal:** The surface validator checks BreadcrumbList URLs in generated artifacts against the canonical URL hierarchy.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/surface/validate.ts`:
  - Add a new check loop after the existing RFC-0495 SURF-OLD-URL check
  - For each surface entry with `page.blocks` containing a `breadcrumbList` block (or any block that emits BreadcrumbList JSON-LD):
    - Extract breadcrumb `item` URLs from the block props
    - Check that no URL contains `/deu/` or `/bw/` segments (old URL hierarchy)
    - Report `SURF-BREADCRUMB-URL` violation with the pageId and the offending URL
  - This check operates on the generated artifact (`surface.generated.yaml`), not on rendered HTML — it catches breadcrumb URL drift before build
- Add `CHANGE_SUMMARY` entry: `RFC-0498: add SURF-BREADCRUMB-URL check for canonical URL hierarchy compliance`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build:check` passes
- `pnpm exec werkstatt run surface.validate --site warpgogol-com` passes

**Completion criterion:** `surface.validate` reports `SURF-BREADCRUMB-URL` for any surface artifact with breadcrumb URLs containing old `/deu/bw/` segments.

**Human review:** no

---

### Step 5. Extend `surface.contract.validate` with per-depth type policy checks

**Goal:** The C-contract validator verifies that the `surfacePolicy` section is present and consistent.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/surface-contract.ts`:
  - After the existing JSON-LD types check (section 2, line ~98-116), add a new check:
    - Verify `jsonldTypes.surfacePolicy` is present and has entries
    - Verify each `surfacePolicy` entry has `surface`, `depth`, `requiredTypes`, `prohibitedTypes`
    - Verify no `requiredTypes` and `prohibitedTypes` overlap within the same entry
    - Report `jsonld-surface-policy-missing` if absent
    - Report `jsonld-surface-policy-overlap` if required and prohibited types overlap
- Add `CHANGE_SUMMARY` entry: `RFC-0498: add per-depth JSON-LD type policy checks against C-contract`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm exec werkstatt run surface.contract.validate --site warpgogol-com` passes

**Completion criterion:** `surface.contract.validate` reports `jsonld-surface-policy-missing` when the section is absent and `jsonld-surface-policy-overlap` when required and prohibited types overlap.

**Human review:** no

---

### Step 6. Register no-op migrator `rfc-0498`

**Goal:** The migrator registry includes a no-op migrator for RFC-0498 to advance `migratorCursor`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0498.ts`:
  - Copy the pattern from `rfc-0495.ts` (no-op migrator)
  - `id: "rfc-0498"`
  - `fromVersion: "4.11.0"` (or current platform version)
  - `toVersion: "4.12.0"`
  - `description: "No-op migrator — per-depth JSON-LD type policy is a C-contract change, not a data contract change. Advances migratorCursor for RFC-0498."`
  - `transform: async (data) => data` (no-op)
  - Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass blocks
- In `packages/os/site-kernel-handoff/src/migrators/registry.ts`:
  - Import `rfc0498Migrator` from `./rfc-0498.ts`
  - Add to `migratorRegistry` array after `rfc0497Migrator`
- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0498.pbt.test.ts`:
  - Idempotency test: `f(f(x)) === f(x)` (data unchanged after double apply)
  - Snapshot test on real industry records (data unchanged)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff test` passes (including new PBT tests)
- `pnpm exec werkstatt run migrator.registry.validate` passes

**Completion criterion:** `migrator.registry.validate` passes with `rfc0498Migrator` registered; idempotency PBT test passes.

**Human review:** no

---

### Step 7. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and request human operator to stamp the RFC as implemented.

**Agent actions:**

- Update `packages/ontology/AGENTS.md` with note about `surfacePolicy` section in `jsonld-types.yaml`
- Update `packages/share/AGENTS.md` with note about per-depth Service emission gating in `semantic/jsonld/service.ts`
- Update `packages/os/site-kernel-checks/AGENTS.md` with note about prohibited-type checking extension in `seo-structured-data.ts`
- Update `docs/requirements.xml` if structured data rules are present
- Update `docs/verification-plan.xml` with verification steps for per-depth JSON-LD type policy
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed
- Check off acceptance criteria in the RFC file with inline (evidence: ...) annotations
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0498 --implementation-commit <sha>` to transition the RFC to `implemented`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate RFC-0498` passes
- Every file in `scope.docs` is either updated or documented as not-applicable

**Completion criterion:** All documentation artifacts in scope are updated; all acceptance criteria are checked off with evidence; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0498`
- `pnpm --filter @gogol/ontology build:check`
- `pnpm --filter @gogol/share build:check`
- `pnpm --filter @gogol/pbp build:check`
- `pnpm --filter @gogol/surface build:check`
- `pnpm --filter @gogol/site-kernel-checks build:check`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec werkstatt run migrator.registry.validate`
- `pnpm exec werkstatt run surface.contract.validate --site warpgogol-com`
- `pnpm exec werkstatt run surface.validate --site warpgogol-com`
- `pnpm exec werkstatt run seo.structured.data.validate --site warpgogol-com` (requires built dist)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0498.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0498` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positive: legitimate type on prohibited list | Step 1 — prohibited list is per-depth, not global; `Service` is only prohibited where it doesn't belong |
| Baker emits wrong type despite C-contract | Step 3 — `seo.structured.data.validate` catches this at post-build; Step 5 — `surface.contract.validate` catches policy drift at build time |
| Performance: scanning all surface pages | Step 3 — current dataset has ~48 pages; HTML scanning is trivial |
| Agent misinterpretation: adding new JSON-LD types | Step 7 — AGENTS.md updates explicitly state the closed type set |
| Existing dist artifacts fail after upgrade | Step 3 — `seo.structured.data.validate` runs in `sites-check-postbuild`; artifacts are rebuilt before validation |
| Layer C break | Step 1 — C-contract updated in the same change; Step 5 — `surface.contract.validate` verifies compliance |
| Migrator not registered | Step 6 — no-op migrator registered and tested |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-16, DNA-24, or DNA-53, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0498 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `surfacePolicy` schema cannot be expressed in the existing `jsonldTypesContract` Zod schema without breaking existing consumers, escalate via `rfc.supersede.propose` — do not weaken the C-contract.
