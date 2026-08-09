---
rfcId: RFC-0781
planId: PLAN-RFC-0781-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - werkstatt-site
  services: []
  docs: []
---

# Implementation Plan: RFC-0781

## 1. Objectives

- [ ] O1 — Create shared `deepMerge` utility with JSON Merge Patch semantics (null = delete) — maps to acceptance criteria 1-2
- [ ] O2 — Extend `PbpEntity` with `locale?: string` field so `buildEntityIndex` can key by locale — prerequisite for O3 (not in RFC, discovered during plan exploration)
- [ ] O3 — Make `buildEntityIndex` locale-aware: `Map<string, Map<string, PbpEntity>>` with `PBP-ID-LOCALE-DUPLICATE` — maps to acceptance criteria 5-7
- [ ] O4 — Make `resolveLocales` functional: deep-merge overlay onto base, fallback to default, overlay-only as-is — maps to acceptance criteria 8-10
- [ ] O5 — Replace divergent `deepMerge` in `locale.ts` and `loaders.ts` with shared utility — maps to acceptance criteria 3-4
- [ ] O6 — Align all 20 failing UK PBP files to DE schema structure — maps to acceptance criterion 12
- [ ] O7 — Write unit tests for `deepMerge`, `buildEntityIndex`, `resolveLocales`, and integration test for `compilePbpProfile` — maps to acceptance criteria 13-17
- [ ] O8 — Update `pipeline.ts` to pass new index type to `resolveLocales` — maps to acceptance criterion 11
- [ ] O9 — Extend `PbpValidationError` with optional `locale` field — maps to RFC failure modes section
- [ ] O10 — All tests pass, `build:check` passes, RFC stamped as implemented — maps to acceptance criteria 18-20

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/pbp/utils/deep-merge.ts` — **Created**: shared `deepMerge` with JSON Merge Patch
- `packages/werkstatt-site/src/domain/pbp/envelope.ts` — **Modified**: add `locale?: string` to `PbpEntity`
- `packages/werkstatt-site/src/domain/pbp/validation-errors.ts` — **Modified**: add `locale?: string` to `PbpValidationError`
- `packages/werkstatt-site/src/domain/pbp/compiler/validate.ts` — **Modified**: attach `locale` from `ParsedEntity` to validated `PbpEntity`
- `packages/werkstatt-site/src/domain/pbp/compiler/entity-index.ts` — **Modified**: locale-aware index `Map<id, Map<locale, PbpEntity>>`
- `packages/werkstatt-site/src/domain/pbp/compiler/locale.ts` — **Modified**: consume new index, use shared `deepMerge`, `findDiffPaths` stays local
- `packages/werkstatt-site/src/domain/pbp/compiler/pipeline.ts` — **Modified**: pass new index type to `resolveLocales`
- `packages/werkstatt-site/src/domain/pbp/loaders.ts` — **Modified**: use shared `deepMerge`, remove local copy
- `packages/werkstatt-site/src/domain/pbp/compiler/__tests__/entity-index.test.ts` — **Created**: unit tests
- `packages/werkstatt-site/src/domain/pbp/compiler/__tests__/locale-resolution.test.ts` — **Created**: unit tests
- `packages/werkstatt-site/src/domain/pbp/compiler/__tests__/compiler-pipeline.test.ts` — **Modified**: update duplicate-ID test, add locale merge test
- `packages/werkstatt-site/src/domain/pbp/__tests__/deep-merge.test.ts` — **Created**: unit tests

### 2.2 Configuration and data

- `missions/warpgogol-com-m000042/workpiece/src/content/business-profile/uk/**` — 20 files aligned to DE schema structure

### 2.3 Documentation and specs

- RFC file (read-only reference)
- No AGENTS.md updates needed (internal compiler fix, no new rules)
- No Compass XML sync needed (no repository-wide semantics change)
- No `docs/architecture-dna.md` update needed (no new DNA invariant)

### 2.4 Validation and pipelines

- `pnpm --filter werkstatt-site run build:check` (tsc --noEmit)
- `pnpm --filter werkstatt-site run test` (vitest run)
- `pnpm exec werkstatt run rfc.validate --id RFC-0781`

## 3. Step sequence

### Step 1. Align UK PBP files to DE schema structure

**Goal:** Rewrite all 20 failing UK files to match their DE counterparts' field names, types, and structure. This MUST be done before the compiler fix — deep-merging misaligned files produces broken hybrids (RFC mandate).

**Agent actions:**

- For each of the 20 failing UK files, read the corresponding DE file as structural template
- Rewrite the UK file using DE field names, types, and structure
- Translate only content fields (name, description, statement, label, detail) to Ukrainian
- Policy files (10): `policyKind` → `kind`, `type: sla-policy` → `type: policy`, `objectives: []` → `objective: {}`, `remedies: []` → `remedy: {}`
- Product files (3): `purpose` string → `{ statement: "..." }`
- Claim file (1): add `statement`, remove `display`/`provenance`/`asOf`/`criticality`
- Evidence-source file (1): add `authority: { kind: "external-web-sources" }`
- Web-presence file (1): add `kind`, `businessRef`, `control`; fix `locales` values
- Place file (1): add `kind: locality`
- Public-document file (1): add `canonicalUrl`
- Offering file (1): `includedQuantity.value` number → string
- After each file, run Zod validation to verify alignment

**Validation:**

- Run `compilePbpProfile` with `strictness: "production"` on UK files — all 20 must pass Zod validation
- Run `compilePbpProfile` with `locale: "uk"` on full DE+UK corpus — no schema validation errors

**Completion criterion:** All 54 UK PBP files pass Zod schema validation; `compilePbpProfile` succeeds with `locale: "uk"`.

**Human review:** no

---

### Step 2. Create shared `deepMerge` utility

**Goal:** Extract a single `deepMerge` function with JSON Merge Patch (RFC 7386) semantics to `packages/werkstatt-site/src/domain/pbp/utils/deep-merge.ts`.

**Agent actions:**

- Create `packages/werkstatt-site/src/domain/pbp/utils/deep-merge.ts`
- Implement `isPlainObject` guard using `Object.prototype.toString.call(value) === "[object Object]"`
- Implement `deepMerge<T>(base: T, overlay: Partial<T>): T` with:
  - `null` in overlay → delete key from result
  - `undefined` in overlay → skip (retain base value)
  - Plain objects → merge recursively
  - Arrays and primitives → replace wholesale
- Create `packages/werkstatt-site/src/domain/pbp/__tests__/deep-merge.test.ts` with tests for: null-delete, undefined skip, nested object merge, array replacement, primitive replacement, class instance replacement (Date), empty objects

**Validation:**

- `pnpm --filter werkstatt-site exec vitest run src/domain/pbp/__tests__/deep-merge.test.ts`
- `pnpm --filter werkstatt-site run build:check`

**Completion criterion:** `deepMerge` utility exists, all unit tests pass, tsc clean.

**Human review:** no

---

### Step 3. Extend `PbpEntity` with `locale` field and `PbpValidationError` with `locale`

**Goal:** Add `locale?: string` to `PbpEntity` interface so `buildEntityIndex` can key entities by locale. Optional (not required) to avoid breaking `loaders.ts` and other code that creates `PbpEntity` objects without going through `validateRaw`.

**Agent actions:**

- Add `locale?: string;` to `PbpEntity` interface in `packages/werkstatt-site/src/domain/pbp/envelope.ts`
- Update `validateRaw` in `packages/werkstatt-site/src/domain/pbp/compiler/validate.ts` to attach `locale` from `ParsedEntity` after Zod parsing:
  ```ts
  const entity = result.data as unknown as PbpEntity;
  entity.locale = entry.locale;
  entities.push(entity);
  ```
- Do the same for the migration-mode path (line 57)
- Add `locale?: string` to `PbpValidationError` in `packages/werkstatt-site/src/domain/pbp/validation-errors.ts`
- Run `build:check` to find any TypeScript errors from the interface change

**Validation:**

- `pnpm --filter werkstatt-site run build:check`

**Completion criterion:** `PbpEntity` has `locale?: string`, `PbpValidationError` has `locale?: string`, `validateRaw` attaches locale, tsc clean.

**Human review:** no

---

### Step 4. Make `buildEntityIndex` locale-aware

**Goal:** Change `buildEntityIndex` from `Map<string, PbpEntity>` to `Map<string, Map<string, PbpEntity>>` (id → locale → entity). Same-`(id, locale)` duplicates are fatal (`PBP-ID-LOCALE-DUPLICATE`); same `id` across different locales is accepted.

**Agent actions:**

- Rewrite `buildEntityIndex` in `packages/werkstatt-site/src/domain/pbp/compiler/entity-index.ts`:
  - Change `EntityIndexResult.index` type to `Map<string, Map<string, PbpEntity>>`
  - Sort by `id` then `locale` for determinism
  - For each entity, get or create `localeMap` for `entity.id`
  - Use `entity.locale ?? ""` as the locale key (optional field)
  - If `localeMap.has(entity.locale ?? "")` → push `PBP-ID-LOCALE-DUPLICATE` fatal error with `locale` field, skip
  - Otherwise `localeMap.set(entity.locale ?? "", entity)`
- Create `packages/werkstatt-site/src/domain/pbp/compiler/__tests__/entity-index.test.ts` with tests for:
  - Locale-aware indexing (same ID, different locales → both indexed)
  - Same-locale duplicate → fatal `PBP-ID-LOCALE-DUPLICATE`
  - Cross-locale same-ID → no error
  - Deterministic ordering

**Validation:**

- `pnpm --filter werkstatt-site exec vitest run src/domain/pbp/compiler/__tests__/entity-index.test.ts`
- `pnpm --filter werkstatt-site run build:check`

**Completion criterion:** `buildEntityIndex` returns locale-aware index, unit tests pass, tsc clean.

**Human review:** no

---

### Step 5. Make `resolveLocales` functional

**Goal:** Rewrite `resolveLocales` to consume the new locale-aware index and perform real deep-merging.

**Agent actions:**

- Rewrite `resolveLocales` in `packages/werkstatt-site/src/domain/pbp/compiler/locale.ts`:
  - Change signature to accept `Map<string, Map<string, PbpEntity>>`
  - For each `(id, localeMap)`:
    - If `locale === defaultLocale`: use `baseEntity ?? overlayEntity`, set in resolved
    - If no `overlayEntity`: fallback to `baseEntity`, record fallback entry with `path: "*"`
    - If no `baseEntity`: use `overlayEntity` as-is
    - If both exist: `deepMerge(base, overlay)` using shared utility, record `findDiffPaths` fallbacks
  - Keep `findDiffPaths` local to `locale.ts`
  - Remove local `deepMerge` function, import from `../utils/deep-merge.js`
- Create `packages/werkstatt-site/src/domain/pbp/compiler/__tests__/locale-resolution.test.ts` with tests for:
  - Deep-merge with null-delete (overlay sets field to null → field removed from result)
  - Fallback to default locale (no overlay → base entity used, fallback recorded)
  - Overlay-only entity (no base → overlay used as-is)
  - Partial overlay merge (overlay overrides some fields, base fills rest)
  - Default locale compilation (only default-locale entities in resolved)

**Validation:**

- `pnpm --filter werkstatt-site exec vitest run src/domain/pbp/compiler/__tests__/locale-resolution.test.ts`
- `pnpm --filter werkstatt-site run build:check`

**Completion criterion:** `resolveLocales` deep-merges correctly, unit tests pass, tsc clean.

**Human review:** no

---

### Step 6. Update `pipeline.ts` and replace `loaders.ts` deepMerge

**Goal:** Wire the new index type through the pipeline orchestrator and replace the divergent `deepMerge` in `loaders.ts` with the shared utility.

**Agent actions:**

- Update `pipeline.ts` line 49: `resolveLocales` now receives `Map<string, Map<string, PbpEntity>>` from `buildEntityIndex` — the call site already passes `index`, so verify the type flows correctly
- In `loaders.ts`:
  - Remove local `deepMerge` function (lines 49-64) and local `isPlainObject` (lines 45-47)
  - Import `deepMerge` from `../utils/deep-merge.js`
  - Update both `loadSingleton` (line 122) and `loadRepeatable` (line 173) to use shared `deepMerge`
- Run `build:check` to catch any type errors from the pipeline change

**Validation:**

- `pnpm --filter werkstatt-site run build:check`
- `pnpm --filter werkstatt-site exec vitest run src/domain/pbp/compiler/__tests__/compiler-pipeline.test.ts`

**Completion criterion:** Pipeline passes new index type, `loaders.ts` uses shared `deepMerge`, existing tests pass, tsc clean.

**Human review:** no

---

### Step 7. Update `compiler-pipeline.test.ts`

**Goal:** Update the existing duplicate-ID test to use the new error code and add a cross-locale merge integration test.

**Agent actions:**

- In `compiler-pipeline.test.ts`:
  - Update the "detects duplicate entity IDs" test (line 75): change error code check from `PBP-ID-DUPLICATE` to `PBP-ID-LOCALE-DUPLICATE`
  - Add new test: "compiles with locale overrides via deep-merge" — write a DE business entity and a UK overlay with same ID, compile with `locale: "uk"`, verify merged result has UK name and DE fallback fields
  - Add new test: "accepts same entity ID across different locales" — write DE and UK entities with same ID, compile with `locale: "uk"`, verify no `PBP-ID-LOCALE-DUPLICATE` error

**Validation:**

- `pnpm --filter werkstatt-site exec vitest run src/domain/pbp/compiler/__tests__/compiler-pipeline.test.ts`

**Completion criterion:** Updated test passes, new locale merge tests pass.

**Human review:** no — structural alignment, not content authoring

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No AGENTS.md updates needed (internal compiler fix)
- No Compass XML sync needed
- No `docs/architecture-dna.md` update needed
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (they didn't — skip)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Run `rfc.verification.emit`:** `pnpm exec werkstatt run rfc.verification.emit --id RFC-0781` (RFC-0330, acceptance probes are commented out so this will produce no evidence file — expected)
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0781 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0781`
- `pnpm --filter werkstatt-site run build:check`
- `pnpm --filter werkstatt-site run test`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence; code review passed; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0781`
- `pnpm --filter werkstatt-site run build:check`
- `pnpm --filter werkstatt-site run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0781` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0781.generated.json` — verification evidence (may be empty if acceptance probes are commented out)
- Commit messages referencing `RFC-0781` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| UK file alignment is manual work (20 files) | Step 1: validate each file after rewriting; run full corpus compile at end |
| `deepMerge` null-delete behavior surprise | Step 2: unit tests cover null-delete explicitly; Step 5: locale-resolution tests verify null-delete in merge |
| `entityIndex` shape change breaks consumers | Step 6: only `pipeline.ts` passes index to `resolveLocales` — verified during exploration, no other consumers |
| `PBP-ID-DUPLICATE` → `PBP-ID-LOCALE-DUPLICATE` rename | Step 7: update `compiler-pipeline.test.ts` error code check |
| `PbpEntity` lacks `locale` field (discovered during plan) | Step 3: extend `PbpEntity` with `locale?: string`, have `validateRaw` attach it |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-11 or DNA-4, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0781 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If the `PbpEntity.locale` field addition causes widespread TypeScript errors beyond `validate.ts`, stop and assess — the field is already optional (`locale?: string`) in the plan, but further issues may require revisiting the approach.
