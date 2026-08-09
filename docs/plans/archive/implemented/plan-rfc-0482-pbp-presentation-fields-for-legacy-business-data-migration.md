---
rfcId: RFC-0482
planId: PLAN-RFC-0482-01
status: draft
owner: architecture
createdAt: 2026-07-22
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/pbp"
  services: []
  docs:
    - packages/pbp/AGENTS.md
---

# Implementation Plan: RFC-0482

## 1. Objectives

- [ ] Objective 1 — Add `presentation: z.record(z.string(), z.unknown()).optional()` to 5 PBP entity Zod schemas (offering, legal-identity, web-presence, public-document, business) — maps to acceptance criteria 1–5
- [ ] Objective 2 — Update `CHANGE_SUMMARY` Compass scaffolding in each modified schema file with RFC-0482 entry — maps to implementation notes
- [ ] Objective 3 — Add golden fixture tests verifying `presentation` field acceptance and rejection of `null` — maps to acceptance criterion 7
- [ ] Objective 4 — Update `packages/pbp/AGENTS.md` to document the `presentation` field — maps to rollout section
- [ ] Objective 5 — Pass `build:check`, `test`, and `rfc.validate` — maps to acceptance criteria 6–9

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/schemas/offering.ts` — add `presentation` field to `offeringSchema`
- `packages/pbp/src/schemas/legal-identity.ts` — add `presentation` field to `legalIdentitySchema`
- `packages/pbp/src/schemas/web-presence.ts` — add `presentation` field to `webPresenceSchema`
- `packages/pbp/src/schemas/public-document.ts` — add `presentation` field to `publicDocumentSchema`
- `packages/pbp/src/schemas/business.ts` — add `presentation` field to `businessSchema`
- `packages/pbp/src/schemas/__tests__/golden-fixtures.test.ts` — add presentation field test cases

### 2.2 Configuration and data

No configuration or data files affected. The `pbpSchemaById` registry and `pbpEntityDiscriminatedUnion` in `packages/pbp/src/schemas/index.ts` do not need changes — they reference the schema objects, which will pick up the new field automatically.

### 2.3 Documentation and specs

- `packages/pbp/AGENTS.md` — add `presentation` field documentation to the Runtime layer section
- RFC file is read-only reference (`docs/rfcs/rfc-0482-pbp-presentation-fields-for-legacy-business-data-migration.md`)
- No `docs/*.xml` Compass files need synchronization — the change is scoped to a single package's schema files
- No `docs/architecture-dna.md` changes — no new DNA invariant

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/pbp run build:check` — tsc --noEmit
- `pnpm --filter @gogol/pbp run test` — vitest run
- `pnpm exec werkstatt run rfc.validate RFC-0482` — RFC mechanical validation

## 3. Step sequence

### Step 1. Add `presentation` field to 5 PBP entity schemas

**Goal:** Add the optional `presentation` record to the Zod schema definitions for offering, legal-identity, web-presence, public-document, and business entities.

**Agent actions:**

- Add `presentation: z.record(z.string(), z.unknown()).optional()` to `offeringSchema` in `packages/pbp/src/schemas/offering.ts` before the closing `}).strict()`
- Add the same field to `legalIdentitySchema` in `packages/pbp/src/schemas/legal-identity.ts`
- Add the same field to `webPresenceSchema` in `packages/pbp/src/schemas/web-presence.ts`
- Add the same field to `publicDocumentSchema` in `packages/pbp/src/schemas/public-document.ts`
- Add the same field to `businessSchema` in `packages/pbp/src/schemas/business.ts`
- Ensure the field is placed before the closing `}).strict()` or `.strict()` in each schema
- Do not change any existing fields or field ordering

**Validation:**

- `pnpm --filter @gogol/pbp run build:check` passes with no type errors

**Completion criterion:** All 5 schema files contain `presentation: z.record(z.string(), z.unknown()).optional()` and `tsc --noEmit` passes.

**Human review:** no

---

### Step 2. Update `CHANGE_SUMMARY` Compass scaffolding in modified schema files

**Goal:** Record the RFC-0482 change in the `CHANGE_SUMMARY` block of each modified schema file per DNA-42 Compass scaffolding requirements.

**Agent actions:**

- In each of the 5 schema files, add a new `<item>` to the existing `CHANGE_SUMMARY` block:
  ```xml
  <item>RFC-0482 — added optional `presentation` field for legacy business data migration.</item>
  ```
- Do not modify the `MODULE_CONTRACT` block

**Validation:**

- `pnpm --filter @gogol/pbp run build:check` still passes

**Completion criterion:** All 5 schema files have an RFC-0482 entry in `CHANGE_SUMMARY`.

**Human review:** no

---

### Step 3. Add golden fixture tests for `presentation` field

**Goal:** Add test cases to `packages/pbp/src/schemas/__tests__/golden-fixtures.test.ts` verifying that the `presentation` field is accepted with data, accepted without (omitted), and rejects `null`.

**Agent actions:**

- Add a test case to the `businessSchema` describe block: "accepts presentation field with display strings" — parse a business entity with `presentation: { platformComparison: { display: { pageText: "..." } } }` and verify it passes
- Add a test case: "accepts entity without presentation field" — verify existing entities without `presentation` still parse (covered by existing tests, but add an explicit assertion)
- Add a test case: "rejects null presentation" — verify `presentation: null` throws
- Add a test case to the `offeringSchema` describe block: "accepts presentation field with price labels" — parse an offering with `presentation: { price: { monthly: "70 € / Monat" } }` and verify it passes
- Add a test case: "rejects null presentation on offering" — verify `presentation: null` throws

**Validation:**

- `pnpm --filter @gogol/pbp run test` passes

**Completion criterion:** New test cases pass and existing tests still pass.

**Human review:** no

---

### Step 4. Update `packages/pbp/AGENTS.md` with `presentation` field documentation

**Goal:** Document the new `presentation` field in the package's AGENTS.md so agents and operators know it exists and how to use it.

**Agent actions:**

- Add a new subsection under "Runtime layer (RFC-0466)" → "Export paths" or after "Downstream RFC rules" titled "Presentation fields (RFC-0482)"
- Document: the `presentation` field is an optional `z.record(z.string(), z.unknown())` on 5 entity schemas (offering, legal-identity, web-presence, public-document, business)
- Document: the field holds site-specific display-formatted strings for content reference resolution (RFC-0045)
- Document: the field is intentionally loose-typed; structural validation belongs in the PBP spec, not in presentation
- Document: locale overlay interaction — `resolveLocales` deep-merges presentation fields; each locale should author its own presentation block

**Validation:**

- Visual inspection — no build check needed for AGENTS.md

**Completion criterion:** `packages/pbp/AGENTS.md` has a "Presentation fields (RFC-0482)" section.

**Human review:** no

---

### Step 5. Run full validation suite

**Goal:** Verify all acceptance criteria pass.

**Agent actions:**

- Run `pnpm --filter @gogol/pbp run build:check`
- Run `pnpm --filter @gogol/pbp run test`
- Run `pnpm exec werkstatt run rfc.validate RFC-0482`
- Verify all 9 acceptance criteria checkboxes in the RFC are satisfied

**Validation:**

- All 3 commands exit with code 0

**Completion criterion:** `build:check`, `test`, and `rfc.validate` all pass.

**Human review:** no

---

### Step 6. Transition RFC to implemented and emit verification evidence

**Goal:** Mark RFC-0482 as `implemented` per RFC-0224 and emit verification evidence.

**Agent actions:**

- Set `status: implemented` in the RFC frontmatter
- Set `implementedAt` to today's date
- Set `updatedAt` to today's date
- Commit the status transition
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0482` (if acceptance probes are declared — they are not, so this step is optional)

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0482` passes with `status: implemented`

**Completion criterion:** RFC-0482 has `status: implemented` and `implementedAt` set.

**Human review:** yes — the `accepted → implemented` transition should be confirmed by the operator per RFC-0224 preconditions. The operator verifies that all acceptance criteria are met.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0482`
- `pnpm --filter @gogol/pbp run build:check`
- `pnpm --filter @gogol/pbp run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0482` in the subject line (RFC-0265 commit hygiene)
- No verification evidence file needed — RFC-0482 does not declare acceptance probes (RFC-0268)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Loose typing of presentation data — typos in keys not caught at build time | Step 3 adds fixture tests; `content.references.validate` (existing) catches references to non-existent paths |
| Presentation data divergence across locales — deep-merge inherits default locale | Step 4 documents the locale overlay behavior in AGENTS.md; fallback report flags inherited paths |
| Future PBP spec conflict on `presentation` field name | No mitigation in this plan — if a conflict arises, a new superseding RFC will handle it |

## 6. Escalation triggers

- If implementation reveals that adding `presentation` to `.strict()` schemas causes existing entities to fail validation (e.g. because existing content already has a `presentation` field with incompatible data), stop and consult the operator. This would indicate the field is not purely additive.
- If the `versionBump: patch` declaration is rejected by `platform.consistency.validate` (RFC-0478), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0482 --reason "versionBump mismatch" --invariant "DNA-53"` instead of working around it.
