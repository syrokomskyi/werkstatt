---
rfcId: RFC-0530
planId: PLAN-RFC-0530-01
status: draft
owner: architecture
createdAt: 2026-07-25
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/pbp"
    - "@gogol/ontology"
  services: []
  docs:
    - packages/pbp/AGENTS.md
    - packages/ontology/AGENTS.md
---

# Implementation Plan: RFC-0530

## 1. Objectives

- [ ] Objective 1 — Add `externalIdentifiers` optional field to `PbpBusiness`, `PbpBrand`, `PbpLegalIdentity` schemas and interfaces (maps to acceptance criteria 1-6)
- [ ] Objective 2 — Add `sameAs` optional field to `PbpWebPresence` schema and interface (maps to acceptance criteria 4, 6)
- [ ] Objective 3 — Project `sameAs` from `Business.externalIdentifiers` and social-profile `WebPresence.sameAs` to `buildOrganizationProfile` in `projectToSemanticSiteProfile` (maps to acceptance criterion 7)
- [ ] Objective 4 — Declare `Organization` type with comprehensive `optional` list in `jsonld-types.yaml` Layer C contract (maps to acceptance criterion 8)
- [ ] Objective 5 — Create unit test for `sameAs` projection (maps to acceptance criterion 7)
- [ ] Objective 6 — Verify `surface.contract.validate` passes after contract update (maps to acceptance criterion 9)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/schemas/business.ts` — add `externalIdentifiers` field
- `packages/pbp/src/schemas/brand.ts` — add `externalIdentifiers` field
- `packages/pbp/src/schemas/legal-identity.ts` — add `externalIdentifiers` field
- `packages/pbp/src/schemas/web-presence.ts` — add `sameAs` field
- `packages/pbp/src/schemas/primitives.ts` — no change needed (`pbpExternalIdentifierSchema` already exported)
- `packages/pbp/src/entities/business.ts` — add `externalIdentifiers` to interface
- `packages/pbp/src/entities/brand.ts` — add `externalIdentifiers` to interface
- `packages/pbp/src/entities/legal-identity.ts` — add `externalIdentifiers` to interface
- `packages/pbp/src/entities/web-presence.ts` — add `sameAs` to interface
- `packages/pbp/src/semantic-profile.ts` — add `sameAs` projection in `projectToSemanticSiteProfile`
- `packages/pbp/src/__tests__/semantic-profile.test.ts` — new test file for `sameAs` projection
- `packages/ontology/src/external-surfaces/jsonld-types.yaml` — add `Organization` type

### 2.2 Configuration and data

- No content file changes required (additive optional fields, no migration).

### 2.3 Documentation and specs

- `packages/pbp/AGENTS.md` — document new `externalIdentifiers` field on `PbpBusiness`, `PbpBrand`, `PbpLegalIdentity` and `sameAs` field on `PbpWebPresence`
- `packages/ontology/AGENTS.md` — document `Organization` type addition to `jsonld-types.yaml`
- `docs/requirements.xml` — synchronize if it tracks PBP schema fields or C-contract types
- `docs/technology.xml` — synchronize if it tracks PBP schema fields or C-contract types

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/pbp run build:check` — typecheck
- `pnpm --filter @gogol/pbp run test` — unit tests
- `pnpm --filter @gogol/ontology run build:check` — typecheck
- `pnpm exec site-kernel run surface.contract.validate` — C-contract validation
- `pnpm exec site-kernel run rfc.validate RFC-0530 --json` — RFC validation

## 3. Step sequence

### Step 1. Add `externalIdentifiers` to PBP entity schemas

**Goal:** Add optional `externalIdentifiers` field to `businessSchema`, `brandSchema`, `legalIdentitySchema` using existing `pbpExternalIdentifierSchema`.

**Agent actions:**

- Import `pbpExternalIdentifierSchema` in `packages/pbp/src/schemas/business.ts` (if not already imported), add `externalIdentifiers: z.record(z.string(), pbpExternalIdentifierSchema).optional()` to `businessSchema.extend({})`
- Import `pbpExternalIdentifierSchema` in `packages/pbp/src/schemas/brand.ts`, add same field to `brandSchema.extend({})`
- Import `pbpExternalIdentifierSchema` in `packages/pbp/src/schemas/legal-identity.ts`, add same field to `legalIdentitySchema.extend({})`
- Import `PbpExternalIdentifier` type in `packages/pbp/src/entities/business.ts`, add `externalIdentifiers?: Record<string, PbpExternalIdentifier>` to `PbpBusiness` interface
- Add same to `packages/pbp/src/entities/brand.ts` (`PbpBrand`) and `packages/pbp/src/entities/legal-identity.ts` (`PbpLegalIdentity`)

**Validation:**

- `pnpm --filter @gogol/pbp run build:check` passes

**Completion criterion:** All three schemas and interfaces include the `externalIdentifiers` optional field; typecheck passes.

**Human review:** no

---

### Step 2. Add `sameAs` to WebPresence schema and interface

**Goal:** Add optional `sameAs: string[]` field to `webPresenceSchema` and `PbpWebPresence` interface.

**Agent actions:**

- Import `nonEmptyString` in `packages/pbp/src/schemas/web-presence.ts` (if not already imported), add `sameAs: z.array(nonEmptyString).optional()` to `webPresenceSchema.extend({})`
- Add `sameAs?: string[]` to `PbpWebPresence` interface in `packages/pbp/src/entities/web-presence.ts`

**Validation:**

- `pnpm --filter @gogol/pbp run build:check` passes

**Completion criterion:** `webPresenceSchema` includes `sameAs` optional field; `PbpWebPresence` interface includes `sameAs?: string[]`; typecheck passes.

**Human review:** no

---

### Step 3. Add `sameAs` projection to `projectToSemanticSiteProfile`

**Goal:** Extract `externalIdentifiers` from `Business` and `sameAs` from social-profile `WebPresence` entities, concatenate, and pass to `buildOrganizationProfile`.

**Agent actions:**

- In `packages/pbp/src/semantic-profile.ts`, after the existing business field extraction (around line 57-72), add extraction of `business.externalIdentifiers` and conversion to `sameAs` URL strings via `schemeRef + value` concatenation
- Extract `sameAs` from `graph.webPresences` entries where `kind === "social-profile"`
- Concatenate `businessSameAs` and `webPresenceSameAs` into a single `sameAs` array
- Pass `...(sameAs.length ? { sameAs } : {})` to the `buildOrganizationProfile({ ... })` call at line 133

**Validation:**

- `pnpm --filter @gogol/pbp run build:check` passes

**Completion criterion:** `projectToSemanticSiteProfile` passes `sameAs` to `buildOrganizationProfile` when `Business` has `externalIdentifiers` or any social-profile `WebPresence` has `sameAs`; typecheck passes.

**Human review:** no

---

### Step 4. Declare `Organization` type in `jsonld-types.yaml`

**Goal:** Add `Organization` type to the Layer C contract with comprehensive `optional` list covering all properties `buildOrganizationNode` emits.

**Agent actions:**

- Add to the `types` list in `packages/ontology/src/external-surfaces/jsonld-types.yaml`:
  ```yaml
  - "@type": Organization
    required: [name, url]
    optional: [legalName, description, foundingDate, email, address, sameAs, logo, image, contactPoint, identifier, founder, member, areaServed, employee, makesOffer]
  ```

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` passes
- `pnpm exec site-kernel run surface.contract.validate` passes

**Completion criterion:** `jsonld-types.yaml` declares `Organization` type with `sameAs` and all emitted properties in `optional`; `surface.contract.validate` exits 0.

**Human review:** no

---

### Step 5. Create unit test for `sameAs` projection

**Goal:** Create `packages/pbp/src/__tests__/semantic-profile.test.ts` with tests verifying `sameAs` projection from `Business.externalIdentifiers` and social-profile `WebPresence.sameAs`.

**Agent actions:**

- Create `packages/pbp/src/__tests__/semantic-profile.test.ts`
- Test case 1: `projectToSemanticSiteProfile` with `Business.externalIdentifiers` produces `sameAs` URLs in the output
- Test case 2: `projectToSemanticSiteProfile` with social-profile `WebPresence.sameAs` produces `sameAs` URLs in the output
- Test case 3: `projectToSemanticSiteProfile` without `externalIdentifiers` or `sameAs` omits `sameAs` from output (no regression)
- Test case 4: `projectToSemanticSiteProfile` with both `Business.externalIdentifiers` and `WebPresence.sameAs` concatenates both sources

**Validation:**

- `pnpm --filter @gogol/pbp run test` passes

**Completion criterion:** All test cases pass; test file covers the four projection scenarios.

**Human review:** no

---

### Step 6. Documentation sync

**Goal:** Update `AGENTS.md` files and Compass XML to reflect the new schema fields and C-contract type.

**Agent actions:**

- Update `packages/pbp/AGENTS.md` to document `externalIdentifiers` on `PbpBusiness`, `PbpBrand`, `PbpLegalIdentity` and `sameAs` on `PbpWebPresence` in the entity field listings
- Update `packages/ontology/AGENTS.md` to document the `Organization` type in `jsonld-types.yaml`
- Check `docs/requirements.xml` and `docs/technology.xml` for PBP schema field tracking; update if needed

**Validation:**

- `git diff` shows only the intended documentation files

**Completion criterion:** All affected `AGENTS.md` files updated; Compass XML synchronized if applicable.

**Human review:** no

---

### Final Step. Acceptance criteria verification and RFC stamp

**Goal:** Verify all acceptance criteria, stamp RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @gogol/pbp run build:check`
- Run `pnpm --filter @gogol/pbp run test`
- Run `pnpm --filter @gogol/ontology run build:check`
- Run `pnpm exec site-kernel run surface.contract.validate`
- Run `pnpm exec site-kernel run rfc.validate RFC-0530 --json`
- Check off each acceptance criterion in the RFC with inline `(evidence: ...)` annotation
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0530 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- All validation commands exit 0

**Completion criterion:** All acceptance criteria marked `[x]` with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0530 --json`
- `pnpm --filter @gogol/pbp run build:check`
- `pnpm --filter @gogol/pbp run test`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm exec site-kernel run surface.contract.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0530` in the subject line (RFC-0265 commit hygiene)
- Implementation commit and RFC stamp commit are SEPARATE commits

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Layer C declarative accuracy | Step 4 includes comprehensive `optional` list covering all `buildOrganizationNode` emitted properties |
| Projection URL construction | Step 3 uses verbatim `schemeRef + value` concatenation; future `wikidata.validate` (RFC-0531) will check URL validity |
| Agent misinterpretation (Product externalIdentifiers) | Step 6 updates AGENTS.md to clarify only Business externalIdentifiers are projected; Product remains catalog-only |
| PBP namespace freeze | Steps 1-2 add additive optional fields only — no key renames or semantic changes |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-16, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0530 --reason "..." --invariant "DNA-16"` instead of working around it (RFC-0334).
- If `surface.contract.validate` fails after adding the `Organization` type, check that the `optional` list matches all properties emitted by `buildOrganizationNode` — a missing property indicates the contract is incomplete, not that the RFC is wrong.
