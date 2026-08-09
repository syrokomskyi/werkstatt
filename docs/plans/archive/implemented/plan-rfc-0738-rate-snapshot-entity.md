---
rfcId: RFC-0738
planId: PLAN-RFC-0738-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps: []
  packages:
    - packages/pbp
  services: []
  docs:
    - packages/pbp/AGENTS.md
---

# Implementation Plan: RFC-0738

## 1. Objectives

- [ ] Objective 1 — Create `PbpRateSnapshot` entity interface, `PbpRateSnapshotDigest`, `PbpRateSnapshotSource` interfaces, and `RATE_SNAPSHOT_SCHEMA_ID` constant (maps to acceptance criteria 1–5)
- [ ] Objective 2 — Create `rateSnapshotSchema` Zod schema inheriting `pbpEntitySchema` with `.strict()` (maps to acceptance criterion 6)
- [ ] Objective 3 — Register schema in `pbpSchemaById` and `pbpEntityDiscriminatedUnion` (maps to acceptance criterion 7)
- [ ] Objective 4 — Add `rate-snapshot` Astro collection to `pbpCollections` (maps to acceptance criterion 8)
- [ ] Objective 5 — Update `packages/pbp/AGENTS.md` with new exports (maps to acceptance criterion 9)
- [ ] Objective 6 — Write unit tests for schema validation, digest computation, and ID convention (maps to acceptance criterion 10)
- [ ] Objective 7 — Pass `tsc --noEmit`, `vitest run`, and `rfc.validate` (maps to acceptance criteria 11–13)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/entities/rate-snapshot.ts` — new file: entity interface + `RATE_SNAPSHOT_SCHEMA_ID` constant
- `packages/pbp/src/schemas/rate-snapshot.ts` — new file: `rateSnapshotSchema` Zod schema
- `packages/pbp/src/schemas/index.ts` — register `rateSnapshotSchema` in `pbpSchemaById` and `pbpEntityDiscriminatedUnion`
- `packages/pbp/src/index.ts` — re-export `PbpRateSnapshot`, `PbpRateSnapshotDigest`, `PbpRateSnapshotSource`, `RATE_SNAPSHOT_SCHEMA_ID`
- `packages/pbp/src/astro.ts` — add `rate-snapshot` collection to `pbpCollections`

### 2.2 Configuration and data

- No configuration files changed. RateSnapshot content files are created by RFC-0744, not this RFC.

### 2.3 Documentation and specs

- `packages/pbp/AGENTS.md` — add `PbpRateSnapshot`, `PbpRateSnapshotDigest`, `PbpRateSnapshotSource`, `RATE_SNAPSHOT_SCHEMA_ID` to API surface
- `docs/rfcs/rfc-0738-rate-snapshot-entity.md` — read-only reference (acceptance criteria source of truth)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/pbp run build:check` (tsc --noEmit)
- `pnpm --filter @warpgogol/pbp run test` (vitest run)
- `pnpm exec site-kernel run rfc.validate --id RFC-0738`

## 3. Step sequence

### Step 1. Create entity interface

**Goal:** Create `packages/pbp/src/entities/rate-snapshot.ts` with the `PbpRateSnapshot` interface and supporting types.

**Agent actions:**

- Create `packages/pbp/src/entities/rate-snapshot.ts`
- Import `PbpEntity`, `PbpEntityRef` from `../envelope.js`
- Import `PbpRateMode`, `PbpRateDirection` from `./rate-policy.js` (RFC-0737 — reuse, do not duplicate)
- Import `pbpSchemaId` from `../schema-id.js`
- Export `RATE_SNAPSHOT_SCHEMA_ID = pbpSchemaId("rate-snapshot")`
- Export `PbpRateSnapshotDigest` interface (`algorithm: string`, `value: string`)
- Export `PbpRateSnapshotSource` interface (`kind: PbpRateMode`, `sourceContractRef?: PbpEntityRef`, `rateScheduleRef?: PbpEntityRef`, `rateScheduleEntryKey?: string`)
- Export `PbpRateSnapshot extends PbpEntity` interface
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass blocks (DNA-42)

**Validation:**

- `tsc --noEmit` passes for `packages/pbp/`

**Completion criterion:** File exists, exports match RFC contracts, `tsc --noEmit` passes.

**Human review:** no

---

### Step 2. Create Zod schema

**Goal:** Create `packages/pbp/src/schemas/rate-snapshot.ts` with `rateSnapshotSchema`.

**Agent actions:**

- Create `packages/pbp/src/schemas/rate-snapshot.ts`
- Import `z` from `zod`
- Import `pbpEntitySchema` from `./envelope.js`
- Import `pbpEntityRefSchema` from `./entity-ref.js`
- Import `nonEmptyString`, `decimalString` from `./primitives.js`
- Import `pbpRateModeSchema`, `pbpRateDirectionSchema` from `./rate-policy.js` (RFC-0737)
- Export `pbpRateSnapshotDigestSchema`, `pbpRateSnapshotSourceSchema`
- Export `rateSnapshotSchema = pbpEntitySchema.extend({...}).strict()` — same pattern as `claimSchema`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass blocks (DNA-42)

**Validation:**

- `tsc --noEmit` passes for `packages/pbp/`

**Completion criterion:** Schema file exists, inherits `pbpEntitySchema`, applies `.strict()`, `tsc --noEmit` passes.

**Human review:** no

---

### Step 3. Register schema in barrel and re-exports

**Goal:** Register `rateSnapshotSchema` in `pbpSchemaById` and `pbpEntityDiscriminatedUnion`, and re-export from `index.ts`.

**Agent actions:**

- Edit `packages/pbp/src/schemas/index.ts`:
  - Add `export { rateSnapshotSchema } from "./rate-snapshot.js"`
  - Add import `rateSnapshotSchema as _rateSnapshot` in the registry section
  - Add `[pbpSchemaId("rate-snapshot")]: _rateSnapshot` to `pbpSchemaById`
  - Add `_rateSnapshot` to `pbpEntityDiscriminatedUnion` array
- Edit `packages/pbp/src/index.ts`:
  - Add export block for `PbpRateSnapshot`, `PbpRateSnapshotDigest`, `PbpRateSnapshotSource`, `RATE_SNAPSHOT_SCHEMA_ID` from `./entities/rate-snapshot.js`

**Validation:**

- `tsc --noEmit` passes for `packages/pbp/`

**Completion criterion:** Schema registered in both registry and discriminated union; types re-exported from main entry point; `tsc --noEmit` passes.

**Human review:** no

---

### Step 4. Add Astro collection

**Goal:** Add `rate-snapshot` collection to `pbpCollections` in `packages/pbp/src/astro.ts`.

**Agent actions:**

- Edit `packages/pbp/src/astro.ts`
- Add a `rate-snapshot` collection definition using `rateSnapshotSchema` for frontmatter validation
- Follow the existing collection pattern (e.g. `claim`, `consent`)

**Validation:**

- `tsc --noEmit` passes for `packages/pbp/`

**Completion criterion:** `rate-snapshot` collection added to `pbpCollections`; `tsc --noEmit` passes.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Create unit tests for schema validation, digest computation, and ID convention.

**Agent actions:**

- Create `packages/pbp/src/schemas/__tests__/rate-snapshot.test.ts`
- Test valid snapshot passes schema validation (use example from RFC §8)
- Test invalid snapshots fail: missing required fields, wrong `source.kind` without required ref, non-decimal `value`, unknown fields (`.strict()`)
- Test `pbpSchemaById` contains `rate-snapshot` entry
- Test `pbpEntityDiscriminatedUnion` parses a valid rate-snapshot
- Create `packages/pbp/src/entities/__tests__/rate-snapshot.test.ts` (or co-locate)
- Test `RATE_SNAPSHOT_SCHEMA_ID` equals `pbpSchemaId("rate-snapshot")` → `"pbp/rate-snapshot@1"`
- Test `computeSnapshotDigest` using `stableStringify` + `byteHash` from `@warpgogol/fingerprint` — verify digest changes when any field changes, verify digest is stable across runs

**Validation:**

- `pnpm --filter @warpgogol/pbp run test` passes

**Completion criterion:** All tests pass; schema validation, digest computation, and ID convention are covered.

**Human review:** no

---

### Step 6. Update AGENTS.md

**Goal:** Update `packages/pbp/AGENTS.md` with new exports.

**Agent actions:**

- Edit `packages/pbp/AGENTS.md`
- Add `PbpRateSnapshot`, `PbpRateSnapshotDigest`, `PbpRateSnapshotSource`, `RATE_SNAPSHOT_SCHEMA_ID` to the API surface section (under a new "Rate Snapshot (RFC-0738)" subsection or the appropriate entity group)
- Document that `PbpRateMode` is reused from RFC-0737

**Validation:**

- File modified, no broken references

**Completion criterion:** `packages/pbp/AGENTS.md` lists all new exports.

**Human review:** no

---

### Step 7. Final validation, review, fix, and stamp

**Goal:** Run full validation suite, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0738`
- Run `pnpm --filter @warpgogol/pbp run build:check` (tsc --noEmit)
- Run `pnpm --filter @warpgogol/pbp run test` (vitest run)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Max 3 iterations.
- Check off acceptance criteria: verify each criterion against implemented code. Mark `[x]` with inline `(evidence: ...)` annotations.
- Stamp: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0738 --implementation-commit <sha>`

**Validation:**

- `rfc.validate` passes
- `tsc --noEmit` passes
- `vitest run` passes
- Review report exists in `docs/reviews/code/`
- `rfc.implement.stamp` succeeds

**Completion criterion:** All validation passes; code review clean; all acceptance criteria checked with evidence; RFC stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0738`
- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/pbp run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0738` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Snapshot proliferation (~365/year per pair) | Out of scope — RFC-0744 handles pruning. This RFC only defines the entity. |
| Digest algorithm portability | Step 2 uses `@warpgogol/fingerprint` (`byteHash`) which wraps SHA-256. The `algorithm` field allows future changes. Step 5 tests digest stability. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-53 (fingerprint governance), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0738 --reason "..." --invariant "DNA-53"` instead of working around it.
- If `PbpRateMode` from RFC-0737 is not yet exported when implementation begins, block on RFC-0737 implementation first — do not create a duplicate type.
