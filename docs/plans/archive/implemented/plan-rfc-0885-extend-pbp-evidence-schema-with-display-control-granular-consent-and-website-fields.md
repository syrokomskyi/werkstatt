---
rfcId: RFC-0885
planId: PLAN-RFC-0885-01
status: draft
owner: architecture
createdAt: 2026-08-20
updatedAt:
scope:
  apps: []
  packages:
    - werkstatt-site
    - werkstatt
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
    - packages/werkstatt/AGENTS.md
---

# Implementation Plan: RFC-0885

## 1. Objectives

- [ ] O1 — Add `PbpEvidenceDisplay`, `PbpWebsiteScreenshot` types and `display?`, `websiteUrl?`, `websiteScreenshot?` fields to `PbpEvidenceSource` — maps to acceptance criteria 1, 3
- [ ] O2 — Add `PbpConsentScope`, `PbpConsentScopeEntry`, `PbpConsentScopeStatus` types and `consentScope` field to `PbpConsent`; remove `consentStatus`, `grantedAt`, `method` — maps to acceptance criteria 2, 4
- [ ] O3 — Update Zod schemas with new fields, `superRefine` for display requirement/rejection, `refine` for consentScope grantedAt — maps to acceptance criteria 5, 6
- [ ] O4 — Update engine consumers: `evaluateGateV2`, `nachweis.consent.update`, `nachweis.withdraw`, `nachweis.validate` — maps to acceptance criteria 8–11
- [ ] O5 — Create and register RFC-0885 migrator with complete consentStatus→consentScope mapping — maps to acceptance criterion 12
- [ ] O6 — Update test fixtures in `nachweis-commands.test.ts` and `nachweis-rfc-0872.test.ts` — maps to acceptance criterion 13
- [ ] O7 — Verify validation, run review/fix, stamp implemented — maps to acceptance criteria 7, 14, 15

## 2. Affected artifacts

### 2.1 Code and commands

**`packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts`**
- Add `PbpEvidenceDisplayAspect` type (`"visible" | "hidden"`)
- Add `PbpEvidenceDisplay` interface (`document`, `screenshot`, `websiteLink`)
- Add `PbpWebsiteScreenshot` interface (`sha256`, `mediaType`, `storage`, `url?`)
- Add `display?`, `websiteUrl?`, `websiteScreenshot?` to `PbpEvidenceSource`
- Export new types from `index.ts`

**`packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts`**
- Add `pbpEvidenceDisplayAspectSchema`, `pbpEvidenceDisplaySchema`, `pbpWebsiteScreenshotSchema`
- Add `display`, `websiteUrl`, `websiteScreenshot` to `evidenceSourceSchema.extend()`
- Add `superRefine`: require `display` for `NACHWEIS_EVIDENCE_KINDS`, reject for non-Nachweis kinds

**`packages/werkstatt-site/src/domain/pbp/entities/consent.ts`**
- Add `PbpConsentScopeStatus` type (`"not_requested" | "granted" | "denied"`)
- Add `PbpConsentScopeEntry` interface (`status`, `grantedAt`, `method`)
- Add `PbpConsentScope` interface (`document`, `screenshot`, `websiteLink`)
- Add `consentScope` to `PbpConsent`; remove `consentStatus`, `grantedAt`, `method`
- Remove `PbpConsentStatus` type and `PBP_CONSENT_STATUSES` constant
- Export new types from `index.ts`; remove old exports

**`packages/werkstatt-site/src/domain/pbp/schemas/consent.ts`**
- Add `pbpConsentScopeStatusSchema`, `pbpConsentScopeEntrySchema`, `pbpConsentScopeSchema`
- Remove `consentStatus`, `grantedAt`, `method` from `consentSchema.extend()`
- Add `consentScope: pbpConsentScopeSchema`
- Update `refine`: each scope entry with `status: "granted"` must have non-null `grantedAt`
- Remove `pbpConsentStatusSchema`

**`packages/werkstatt/src/nachweis/nachweis-io.ts`**
- `evaluateGateV2` (line 271): change `input.consentData?.consentStatus === "granted"` → `input.consentData?.consentScope?.document?.status === "granted"`

**`packages/werkstatt/src/nachweis/nachweis-consent.ts`**
- `runNachweisConsentUpdate` (lines 83–92): replace `data.consentStatus = newStatus`, `data.method = method`, `data.grantedAt = ...` with `data.consentScope = { document: { status: newStatus, grantedAt: ..., method }, screenshot: existing or not_requested, websiteLink: existing or not_requested }`
- Update Bordbuch metadata to reference `consentScope.document.status` instead of `consentStatus`

**`packages/werkstatt/src/nachweis/nachweis-withdraw.ts`**
- Line 130: replace `consentData.consentStatus = "revoked"` with setting `consentScope.document.status` to `"denied"`

**`packages/werkstatt/src/nachweis/nachweis-validate.ts`**
- Lines 194–206: replace `c.data.consentStatus` check with `c.data.consentScope?.document?.status` check; check `consentScope.document.grantedAt` instead of `c.data.grantedAt`

**`packages/werkstatt/src/migrators/rfc-0885.ts`** (new)
- Migrator with `id: "rfc-0885"`, `fromVersion: "6.19.55"`, `toVersion: "6.20.0"`
- Transform: scan `src/content/business-profile/*/consent/*.md` and `src/content/business-profile/*/evidence-source/*.md`
- Apply consentStatus→consentScope mapping table from RFC rollout section
- Add default `display` to Nachweis EvidenceSource entities

**`packages/werkstatt/src/migrators/registry.ts`**
- Import and register `rfc0885Migrator` at end of `migratorRegistry` array

### 2.2 Configuration and data

No YAML/JSON configuration files need changes. The schema changes are in TypeScript only.

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — update if PBP entity documentation references `consentStatus` (check; update if needed)
- `packages/werkstatt/AGENTS.md` — update if nachweis command documentation references `consentStatus` (check; update if needed)
- No `docs/*.xml` Compass files reference PBP entities — no XML sync needed

### 2.4 Validation and pipelines

- `pnpm --filter werkstatt-site run build:check` — TypeScript compilation
- `pnpm --filter werkstatt run build:check` — TypeScript compilation
- `pnpm --filter werkstatt run test` — vitest (nachweis-commands.test.ts, nachweis-rfc-0872.test.ts)
- `pnpm exec werkstatt run rfc.validate --id RFC-0885 --json` — RFC mechanical validation

## 3. Step sequence

### Step 1. Update PBP entity types (werkstatt-site)

**Goal:** Add new TypeScript types and modify entity interfaces.

**Agent actions:**

- Add `PbpEvidenceDisplayAspect`, `PbpEvidenceDisplay`, `PbpWebsiteScreenshot` to `packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts`
- Add `display?`, `websiteUrl?`, `websiteScreenshot?` to `PbpEvidenceSource` interface
- Add `PbpConsentScopeStatus`, `PbpConsentScopeEntry`, `PbpConsentScope` to `packages/werkstatt-site/src/domain/pbp/entities/consent.ts`
- Add `consentScope: PbpConsentScope` to `PbpConsent`; remove `consentStatus`, `grantedAt`, `method` fields
- Remove `PbpConsentStatus` type and `PBP_CONSENT_STATUSES` constant
- Update `packages/werkstatt-site/src/domain/pbp/index.ts` exports: add new types, remove `PbpConsentStatus`, `PBP_CONSENT_STATUSES`, `isPbpConsentStatus`

**Validation:**

- `pnpm --filter werkstatt-site run build:check` — expect type errors in consumers (engine files) which will be fixed in Step 3

**Completion criterion:** New types are exported, old types are removed, entity interfaces match RFC design.

**Human review:** no

---

### Step 2. Update Zod schemas (werkstatt-site)

**Goal:** Update Zod schemas to match new entity types.

**Agent actions:**

- Add `pbpEvidenceDisplayAspectSchema`, `pbpEvidenceDisplaySchema`, `pbpWebsiteScreenshotSchema` to `packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts`
- Add `display: pbpEvidenceDisplaySchema.optional()`, `websiteUrl: nonEmptyString.optional()`, `websiteScreenshot: pbpWebsiteScreenshotSchema.optional()` to `evidenceSourceSchema.extend()`
- Add `superRefine` logic: require `display` for `NACHWEIS_EVIDENCE_KINDS`, reject `display` for non-Nachweis kinds
- Add `pbpConsentScopeStatusSchema`, `pbpConsentScopeEntrySchema`, `pbpConsentScopeSchema` to `packages/werkstatt-site/src/domain/pbp/schemas/consent.ts`
- Remove `consentStatus`, `grantedAt`, `method` from `consentSchema.extend()`; add `consentScope: pbpConsentScopeSchema`
- Update `refine`: each scope entry with `status: "granted"` must have non-null `grantedAt`
- Remove `pbpConsentStatusSchema`

**Validation:**

- `pnpm --filter werkstatt-site run build:check`

**Completion criterion:** Zod schemas match RFC design; `superRefine` enforces display requirement/rejection; `refine` enforces consentScope grantedAt.

**Human review:** no

---

### Step 3. Update engine consumers (werkstatt)

**Goal:** Update all engine files that read or write removed consent fields.

**Agent actions:**

- `nachweis-io.ts`: change `evaluateGateV2` line 271 from `input.consentData?.consentStatus === "granted"` to `input.consentData?.consentScope?.document?.status === "granted"`
- `nachweis-consent.ts`: update `runNachweisConsentUpdate` to write `consentScope.document` instead of `consentStatus`/`method`/`grantedAt`; preserve existing `screenshot` and `websiteLink` scope entries if present, default to `not_requested` if absent
- `nachweis-withdraw.ts`: replace `consentData.consentStatus = "revoked"` with `consentData.consentScope = { ...existing, document: { status: "denied", grantedAt: null, method: "none" } }`
- `nachweis-validate.ts`: update consent check (lines 194–206) to read `c.data.consentScope?.document?.status` and `c.data.consentScope?.document?.grantedAt`

**Validation:**

- `pnpm --filter werkstatt run build:check`

**Completion criterion:** All engine files compile without referencing removed `consentStatus`/`grantedAt`/`method` fields.

**Human review:** no

---

### Step 4. Create migrator (werkstatt)

**Goal:** Create and register the RFC-0885 migrator.

**Agent actions:**

- Create `packages/werkstatt/src/migrators/rfc-0885.ts`:
  - `id: "rfc-0885"`, `fromVersion: "6.19.55"`, `toVersion: "6.20.0"`
  - `transform`: scan `dataPaths` for `consent/*.md` and `evidence-source/*.md` files
  - For consent entities: read frontmatter, map `consentStatus`→`consentScope` per RFC rollout table, remove old fields, write back
  - For evidence-source entities with Nachweis kinds: add `display: { document: "visible", screenshot: "hidden", websiteLink: "hidden" }` if absent
- Import and register in `packages/werkstatt/src/migrators/registry.ts`

**Validation:**

- `pnpm --filter werkstatt run build:check`

**Completion criterion:** Migrator file exists, compiles, and is registered in `migratorRegistry`.

**Human review:** no

---

### Step 5. Update test fixtures (werkstatt)

**Goal:** Update all test fixtures that use removed consent fields.

**Agent actions:**

- `packages/werkstatt/src/tests-handoff/nachweis-commands.test.ts`: replace all `consentStatus: "granted"` / `grantedAt: ...` / `method: ...` with `consentScope: { document: { status: "granted", grantedAt: ..., method: ... }, screenshot: { status: "not_requested", grantedAt: null, method: "none" }, websiteLink: { status: "not_requested", grantedAt: null, method: "none" } }`
- `packages/werkstatt/src/tests-handoff/nachweis-rfc-0872.test.ts`: same replacement for consent fixtures
- Update any assertions that check `consentStatus` to check `consentScope.document.status` instead

**Validation:**

- `pnpm --filter werkstatt run test -- --reporter=verbose 2>&1 | rtk grep -E '(nachweis-commands|nachweis-rfc-0872|FAIL|PASS|Tests)' | head -30`

**Completion criterion:** All nachweis tests pass with updated fixtures.

**Human review:** no

---

### Step 6. Documentation sync

**Goal:** Update AGENTS.md files if they reference removed fields.

**Agent actions:**

- Check `packages/werkstatt-site/AGENTS.md` for `consentStatus` references — update if found
- Check `packages/werkstatt/AGENTS.md` for `consentStatus` references — update if found
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `commands.changed` lists 4 commands — check if manifest needs regeneration)

**Validation:**

- `rtk grep -r 'consentStatus' packages/werkstatt-site/AGENTS.md packages/werkstatt/AGENTS.md` — expect no results

**Completion criterion:** No AGENTS.md file references removed `consentStatus` field.

**Human review:** no

---

### Step 7. Validation suite

**Goal:** Run all validation checks.

**Agent actions:**

- `pnpm --filter werkstatt-site run build:check`
- `pnpm --filter werkstatt run build:check`
- `pnpm --filter werkstatt run test`
- `pnpm exec werkstatt run rfc.validate --id RFC-0885 --json`

**Validation:**

- All commands exit 0

**Completion criterion:** All build checks and tests pass; `rfc.validate` is clean.

**Human review:** no

---

### Step 8. Review, fix, and stamp implemented

**Goal:** Run code review, fix findings, check acceptance criteria, stamp RFC as implemented.

**Agent actions:**

- Invoke `fo-review` via `skill` tool on all session code changes
- If findings: invoke `fo-fix` via `skill` tool; re-run `fo-review` (max 3 iterations)
- Check off all acceptance criteria in the RFC with inline `(evidence: <file:line>)` annotations
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0885 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0885 --json` — clean
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria checked with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — `accepted → implemented` is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0885 --json`
- `pnpm --filter werkstatt-site run build:check`
- `pnpm --filter werkstatt run build:check`
- `pnpm --filter werkstatt run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0885` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Migration risk — existing entities fail validation until migrated | Step 4 creates the migrator; it runs during mission materialization |
| Agent misinterpretation — `display` on non-Nachweis kinds | Step 2 adds `superRefine` that rejects `display` on non-Nachweis kinds |
| Schema strictness — old entities rejected without compatibility reader | Step 4 migrator transforms old entities; no compatibility reader added |
| Engine breakage — existing commands reference removed fields | Step 3 updates all engine consumers to use `consentScope` |
| Security/privacy — websiteUrl/screenshot publish client data | Consent scopes (`websiteLink`, `screenshot`) control publication; gate enforcement deferred to RFC-0886 |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-59, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0885 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the migrator cannot handle a specific `consentStatus` value not in the mapping table, add the value to the mapping table and update the RFC — do not skip the entity.
