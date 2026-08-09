---
rfcId: RFC-0466
planId: PLAN-RFC-0466-01
status: complete
owner: architecture
createdAt: 2026-07-20
updatedAt: 2026-07-20
scope:
  apps: []
  packages:
    - "@gogol/pbp"
  services: []
  docs:
    - packages/pbp/AGENTS.md
    - docs/technology.xml
    - docs/requirements.xml
---

# Implementation Plan: RFC-0466

## 1. Objectives

- [ ] O1 — Create Zod schemas for all Wave 1 PBP entities in `packages/pbp/src/schemas/` — maps to acceptance criteria 1–2
- [ ] O2 — Create typed locale-aware loaders in `packages/pbp/src/loaders.ts` — maps to acceptance criterion 3
- [ ] O3 — Create Astro content collection definitions in `packages/pbp/src/astro.ts` — maps to acceptance criterion 4
- [ ] O4 — Update `packages/pbp/package.json` with export paths and dependencies — maps to acceptance criteria 5–6
- [ ] O5 — Create golden fixture tests for each entity schema — maps to acceptance criterion 7
- [ ] O6 — Pass `tsc --noEmit` and `vitest run` for `@gogol/pbp` — maps to acceptance criteria 8–9
- [ ] O7 — No site imports from `@gogol/pbp` — maps to acceptance criterion 10

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/schemas/` — new directory with ~25 Zod schema files
- `packages/pbp/src/schemas/index.ts` — barrel export + `pbpSchemaById` registry
- `packages/pbp/src/loaders.ts` — typed locale-aware loader functions
- `packages/pbp/src/astro.ts` — `pbpCollections` Astro content collection definitions
- `packages/pbp/src/schemas/__tests__/` — golden fixture tests

### 2.2 Configuration and data

- `packages/pbp/package.json` — new export paths (`./schemas`, `./loaders`, `./astro`) and dependencies (`zod`, `@gogol/content-source`, `@gogol/share`, `@gogol/site-kernel-content`, `astro`)

### 2.3 Documentation and specs

- `packages/pbp/AGENTS.md` — add sections for `./schemas`, `./loaders`, `./astro` export paths
- `docs/technology.xml` — add `@gogol/pbp` export paths to package technology inventory
- `docs/requirements.xml` — add `src/content/business-profile/` content directory contract

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/pbp run build:check` — tsc --noEmit
- `pnpm --filter @gogol/pbp run test` — vitest run
- `pnpm exec werkstatt run rfc.validate RFC-0466 --json`

## 3. Step sequence

### Step 1. Primitive and envelope Zod schemas

**Goal:** Create foundational Zod schemas for PBP primitives and entity envelope.

**Agent actions:**

- Create `packages/pbp/src/schemas/primitives.ts` — Zod schemas for `PbpMoney`, `PbpMoneyRange`, `PbpLocalizedString`, `PbpQuantitativeValue`, `PbpExternalIdentifier`, `PbpControlledValue`, `PbpTimestamp`, `PbpIsoDuration`, `PbpQuantitativeDuration`
- Create `packages/pbp/src/schemas/envelope.ts` — `pbpEntityStatusSchema`, `pbpGovernanceSchema`, `pbpEntitySchema` (base envelope with `schema` discriminator field)
- Create `packages/pbp/src/schemas/entity-ref.ts` — `pbpEntityRefSchema`
- Enforce ADR-037 (no HTML), ADR-038 (no empty strings), ADR-012 (money as decimal string), ADR-025 (no locale in ID)

**Validation:**

- `tsc --noEmit` for `packages/pbp/` passes with new schema files

**Completion criterion:** Primitive and envelope schema files exist and type-check

**Human review:** no

---

### Step 2. Entity Zod schemas (20+ entities)

**Goal:** Create one Zod schema file per Wave 1 entity, mirroring TypeScript interfaces from RFC-0399..0462.

**Agent actions:**

- Create schema files for all entities listed in RFC-0466 §1 table:
  - `business.ts`, `legal-identity.ts`, `brand.ts`, `place.ts`, `contact-point.ts`, `web-presence.ts`, `category.ts`
  - `product.ts`, `product-group.ts`, `product-variant.ts`
  - `catalog.ts` (Catalog + CatalogEntry)
  - `offering.ts` (imports `pricing.ts` and `terms.ts`)
  - `pricing.ts`, `terms.ts` (embedded in offering, not exported individually)
  - `policy.ts`, `sla-policy.ts`, `guarantee-policy.ts`, `ownership-policy.ts`, `exit-policy.ts`, `data-retention-policy.ts`
  - `claim.ts`, `evidence-source.ts`, `disclosure.ts`, `public-document.ts`
- Each schema extends `pbpEntitySchema` with `type: z.literal(...)` and entity-specific fields
- Use `z.strict()` on all entity schemas to reject unknown keys
- Create `packages/pbp/src/schemas/index.ts` barrel: re-export all schemas + `pbpSchemaById` registry + `pbpEntityDiscriminatedUnion` (z.discriminatedUnion on `schema` field)

**Validation:**

- `tsc --noEmit` for `packages/pbp/` passes with all entity schemas

**Completion criterion:** All entity schema files exist, type-check, and are exported from `./schemas`

**Human review:** no

---

### Step 3. Locale-aware loaders

**Goal:** Create typed loader functions mirroring `@gogol/business/src/loaders.ts` patterns.

**Agent actions:**

- Create `packages/pbp/src/loaders.ts`
- Export `PBP_DEFAULT_LANGUAGE_CODE = "de"`
- Implement 15 loader functions (getPbpBusiness, getPbpLegalIdentity, getPbpBrand, getPbpPlaces, getPbpContactPoints, getPbpWebPresences, getPbpProducts, getPbpCatalog, getPbpCatalogEntries, getPbpOfferings, getPbpPolicies, getPbpClaims, getPbpEvidenceSources, getPbpDisclosures, getPbpPublicDocuments)
- Use `getCollection`/`getEntry` from `astro:content` (same as legacy)
- Use `getEntryLanguage`, `stripEntryLanguage`, `toDataEntryId` from `@gogol/share/content`
- Use `emitPipelineLogEvent` from `@gogol/site-kernel-content`
- Implement deep-merge locale fallback (RFC-0008 pattern)
- Cache parsed entries per `languageCode:entityId` key
- Throw descriptive error if content directory is missing (empty state edge case)

**Validation:**

- `tsc --noEmit` for `packages/pbp/` passes with loaders

**Completion criterion:** Loaders file exists, exports all 15 functions, type-checks

**Human review:** no

---

### Step 4. Astro content collections

**Goal:** Create `pbpCollections` export for Astro content collection wiring.

**Agent actions:**

- Create `packages/pbp/src/astro.ts`
- Import `defineCollection` from `astro:content`, `fsDataCollectionLoader` from `@gogol/content-source`, `toDataEntryId` from `@gogol/share/content`
- Export `pbpCollections` object with `business-profile` collection:
  - `loader: fsDataCollectionLoader({ base: "src/content/business-profile", generateId: ... })`
  - `schema: z.object({}).catchall(z.any())` — permissive (per-entry validation deferred to loaders, same pattern as `@gogol/business/astro`)
- Place export at `@gogol/pbp/astro` (not root barrel) to avoid requiring Astro in non-Astro contexts

**Validation:**

- `tsc --noEmit` for `packages/pbp/` passes with astro.ts

**Completion criterion:** `pbpCollections` exported from `@gogol/pbp/astro`

**Human review:** no

---

### Step 5. Package.json exports and dependencies

**Goal:** Update `packages/pbp/package.json` with new export paths and dependencies.

**Agent actions:**

- Add export paths: `./schemas`, `./loaders`, `./astro`
- Add direct dependencies: `zod` (same version as `@gogol/business`: `^4.4.3`), `@gogol/content-source` (`workspace:*`), `@gogol/share` (`workspace:*`), `@gogol/site-kernel-content` (`workspace:*`), `astro` (`^7.0.5`)
- Run `pnpm install` to update lockfile

**Validation:**

- `pnpm install` succeeds
- `tsc --noEmit` for `packages/pbp/` passes with new dependencies

**Completion criterion:** `package.json` has all export paths and dependencies; `pnpm install` succeeds

**Human review:** no

---

### Step 6. Golden fixture tests

**Goal:** Create positive and negative fixture tests for each entity schema.

**Agent actions:**

- Create `packages/pbp/src/schemas/__tests__/` directory
- For each entity schema, create a test file with:
  - Positive test: valid entity fixture (derived from Warpgogol target manifest blueprint) passes validation
  - Negative tests: invalid fixtures (empty string, HTML in canonical field, locale in ID, wrong money format, unknown key) fail validation
- Create `packages/pbp/src/schemas/__tests__/index.test.ts` — tests for `pbpSchemaById` registry completeness and `pbpEntityDiscriminatedUnion` dispatch

**Validation:**

- `pnpm --filter @gogol/pbp run test` passes

**Completion criterion:** All golden fixture tests pass

**Human review:** no

---

### Step 7. Documentation updates

**Goal:** Update AGENTS.md and Compass XML files per RFC-0466 §Documentation updates required.

**Agent actions:**

- Update `packages/pbp/AGENTS.md`:
  - Add `./schemas`, `./loaders`, `./astro` to API surface section
  - Add "How to use in an app" section with `pbpCollections` wiring pattern
  - Keep critical rule about sites not consuming until RFC-0469
- Update `docs/technology.xml` — add `@gogol/pbp` export paths
- Update `docs/requirements.xml` — add `src/content/business-profile/` content directory contract

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0466 --json` passes

**Completion criterion:** All documentation files updated

**Human review:** no

---

### Step 8. Validation and evidence

**Goal:** Run full validation suite and emit verification evidence.

**Agent actions:**

- Run `pnpm --filter @gogol/pbp run build:check` — tsc --noEmit
- Run `pnpm --filter @gogol/pbp run test` — vitest run
- Run `pnpm exec werkstatt run rfc.validate RFC-0466 --json`
- Verify no site imports from `@gogol/pbp`: `grep -r "@gogol/pbp" systems/ --include="*.ts" --include="*.astro"` returns 0 results (excluding content.config.ts which is not yet switched — that's RFC-0469)
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0466` (RFC-0330)

**Validation:**

- All commands pass with exit code 0

**Completion criterion:** All validation passes, evidence file emitted

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0466`
- `pnpm --filter @gogol/pbp run build:check`
- `pnpm --filter @gogol/pbp run test`
- `grep -r "@gogol/pbp" systems/ --include="*.ts" --include="*.astro"` — 0 results (no site consumption yet)
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0466` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0466.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0466` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Schema drift from interfaces | Step 2: each schema file references the corresponding RFC in header comment; Step 6: golden fixtures validate both schema and interface |
| Migration complexity | Step 4: content directory contract is documented in RFC-0466; RFC-0468 handles the actual migration |
| Performance (30+ entities) | Step 3: loaders cache parsed entries per `languageCode:entityId` key |
| Empty state | Step 3: loaders throw descriptive error for missing content directory |
| Zod version compatibility | Step 5: `package.json` pins `zod@^4.4.3` (same as `@gogol/business`) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1 or DNA-20, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0466 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If `zod@^4.4.3` is incompatible with existing PBP TypeScript interfaces, create a new RFC to resolve the version conflict — do not downgrade or patch.
