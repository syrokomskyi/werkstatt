---
rfcId: RFC-0481
planId: PLAN-RFC-0481-01
status: draft
owner: architecture
createdAt: 2026-07-21
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - docs/rfcs/rfc-0481-migrate-legacy-business-content-to-pbp-business-profile.md
---

# Implementation Plan: RFC-0481

## 1. Objectives

- [ ] O1 — Create `rfc-0481` migrator that generates `business-profile/{lang}/business.md` from legacy `business/{lang}/company.md` — maps to acceptance criteria 1, 2, 7, 8
- [ ] O2 — Register migrator in `migratorRegistry` — maps to acceptance criterion 2
- [ ] O3 — Write PBT idempotency test (`f(f(x)) == f(x)`) — maps to acceptance criteria 5, 6
- [ ] O4 — Write snapshot test on real `warpgogol-com` data — maps to acceptance criterion 7
- [ ] O5 — Pass `build:check`, `test`, and `migrator.registry.validate` — maps to acceptance criteria 3, 4, 5
- [ ] O6 — Verify `mission.migrate` creates `business.md` for both locales — maps to acceptance criterion 8
- [ ] O7 — Verify `astro build` no longer throws `PBP-REF: No Business entity found` — maps to acceptance criterion 9

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/migrators/rfc-0481.ts` — **Create** — migrator implementation
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — **Edit** — add `rfc0481Migrator` to `migratorRegistry` array
- `packages/os/site-kernel-handoff/src/migrators/__tests__/rfc-0481.pbt.test.ts` — **Create** — PBT idempotency test
- `packages/os/site-kernel-handoff/src/migrators/__tests__/rfc-0481.snapshot.test.ts` — **Create** — snapshot test

### 2.2 Configuration and data

- No static config changes. The migrator writes `src/content/business-profile/{lang}/business.md` at runtime (in mission workpieces), not in source.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0481-migrate-legacy-business-content-to-pbp-business-profile.md` — read-only reference (accepted)
- No `docs/*.xml` Compass sync needed (RFC does not change repository-wide requirements)
- No `AGENTS.md` updates needed (migrator follows existing RFC-0479 pattern, already documented in `packages/os/site-kernel-handoff/AGENTS.md`)

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/site-kernel-handoff build:check` — scoped tsc
- `pnpm --filter @gogol/site-kernel-handoff test` — vitest including new tests
- `pnpm exec site-kernel run migrator.registry.validate` — registry validation
- `pnpm exec site-kernel run rfc.validate RFC-0481` — RFC validation

## 3. Step sequence

### Step 1. Create migrator implementation

**Goal:** Create `rfc-0481.ts` with the migrator that maps `business/{lang}/company.md` → `business-profile/{lang}/business.md`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0481.ts`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding (DNA-42)
- Import `Migrator`, `SternsystemData`, `MigrationContext`, `MigrationError` from `./types.ts`
- Implement `mapCompanyToBusiness(rawFrontmatter, lang)` — parse YAML frontmatter from `company.md`, map fields per RFC §Decision.1:
  - `schema` → `pbp/business@1`
  - `id` → `https://warpgogol.com/id/business`
  - `type` → `business`
  - `status` → `published`
  - `name` → `brand.name` or top-level `name`
  - `description` → from `description`
  - `mission` → from `mission`
  - `yearEstablished` → `parseInt(foundingYear)`
  - `brandRefs.default` → `{ ref: "https://warpgogol.com/id/brand", expectedType: "brand" }`
  - `legalIdentityRef` → `{ ref: "https://warpgogol.com/id/legal-identity", expectedType: "legal-identity" }`
  - `placeRefs.office` → `{ ref: "https://warpgogol.com/id/places/backnang", expectedType: "place" }`
  - `contactPointRefs.default` → `{ ref: "https://warpgogol.com/id/contact-points/general-email", expectedType: "contact-point" }`
  - `webPresenceRefs.default` → `{ ref: "https://warpgogol.com/id/web-presences/primary", expectedType: "web-presence" }`
  - `governance` → `{ authorityRef: "https://warpgogol.com/id/business", effectiveFrom: "2026-01-01", reviewEvery: "P1Y" }`
- Implement `transform(data, ctx)`:
  - Read locales from `ctx` (need to determine how locales are available — check if `MigrationContext` has locales or if we read from `system.md`)
  - For each locale: check if `business-profile/{lang}/business.md` exists with `schema: pbp/business@1` → skip (idempotent)
  - If not: read `business/{lang}/company.md`, parse frontmatter, map to PBP, write `business-profile/{lang}/business.md`
  - If `company.md` missing: throw `MigrationError`
- Export `rfc0481Migrator` and `RFC_0481_MIGRATOR_ID`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes (tsc --noEmit)

**Completion criterion:** File exists, exports `rfc0481Migrator`, tsc passes.

**Human review:** no

---

### Step 2. Register migrator in registry

**Goal:** Add `rfc0481Migrator` to `migratorRegistry` in `registry.ts`.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/migrators/registry.ts`
- Import `rfc0481Migrator` from `./rfc-0481.ts`
- Add to `migratorRegistry` array (after `rfc0479Migrator`, ordered by RFC-id numeric)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm exec site-kernel run migrator.registry.validate` passes

**Completion criterion:** `migratorRegistry` includes `rfc0481Migrator`, registry validation passes.

**Human review:** no

---

### Step 3. Write PBT idempotency test

**Goal:** Create `rfc-0481.pbt.test.ts` proving `f(f(x)) == f(x)`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/__tests__/rfc-0481.pbt.test.ts`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding
- Use `fast-check` to generate random `company.md` frontmatter (valid subset: `name`, `description`, `mission`, `foundingYear`, `brand.name`)
- Create temp directory with `business/{lang}/company.md` and empty `business-profile/{lang}/`
- Run migrator twice, assert output `business.md` is identical
- Follow the pattern from `rfc-0479.pbt.test.ts` (temp dir, `withTempPin`-style helper)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff test` passes (including new PBT test)

**Completion criterion:** PBT test passes, idempotency proven for random inputs.

**Human review:** no

---

### Step 4. Write snapshot test

**Goal:** Create `rfc-0481.snapshot.test.ts` that runs the migrator on real `warpgogol-com` `business/de/company.md` and snapshots the output.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/__tests__/rfc-0481.snapshot.test.ts`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding
- Read real `systems/warpgogol-com/src/content/business/de/company.md` as input
- Run migrator on temp dir with that input
- Snapshot the output `business-profile/de/business.md` using vitest snapshot
- Verify snapshot contains `schema: pbp/business@1`, `type: business`, `name: Warpgogol`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff test` passes (including snapshot test)

**Completion criterion:** Snapshot test passes, output matches expected PBP format.

**Human review:** no

---

### Step 5. Run full validation suite

**Goal:** Verify all acceptance criteria pass.

**Agent actions:**

- Run `pnpm --filter @gogol/site-kernel-handoff build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff test`
- Run `pnpm exec site-kernel run migrator.registry.validate`
- Run `pnpm exec site-kernel run rfc.validate RFC-0481`
- Fix any failures

**Validation:**

- All commands exit 0

**Completion criterion:** All 4 commands pass.

**Human review:** no

---

### Step 6. Stamp implemented and commit

**Goal:** Transition RFC to `implemented` and commit all changes.

**Agent actions:**

- Set `status: implemented` and `implementedAt: 2026-07-21` in RFC frontmatter
- Run `pnpm exec site-kernel run rfc.validate RFC-0481` to confirm
- Commit all files: migrator, registry edit, tests, RFC status change
- Commit message: `feat(rfc-0481): implement PBP business singleton migrator`

**Validation:**

- `rfc.validate` passes with `status: implemented`

**Completion criterion:** RFC is `implemented`, all changes committed.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm --filter @gogol/site-kernel-handoff build:check` — tsc --noEmit
- `pnpm --filter @gogol/site-kernel-handoff test` — vitest (PBT + snapshot)
- `pnpm exec site-kernel run migrator.registry.validate` — registry validation
- `pnpm exec site-kernel run rfc.validate RFC-0481` — RFC validation

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0481` in the subject line (RFC-0265 commit hygiene)
- PBT test output proving idempotency
- Snapshot test output showing correct PBP entity format

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Incomplete `de/` PBP content (only business.md created) | Step 5 validates build — if remaining entities are missing, `astro build` will fail and the operator will know |
| Legacy `business/` collection remains as debt | Out of scope for this RFC — nonGoals explicitly defer to future RFC |
| `company.md` missing for a locale | Migrator throws `MigrationError` (Step 1) — fail fast with clear error |
| `MigrationContext` does not have `locales` field | Step 1 will discover this during implementation — read locales from `system.md` in the `data.rootPath` or add `locales` to `MigrationContext` if needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0481 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `MigrationContext` needs a new field (`locales`), this is a contract change to `@gogol/site-kernel-handoff` — assess whether it needs a separate RFC or can be an additive change within this RFC's scope.
