---
rfcId: RFC-0795
planId: PLAN-RFC-0795-01
status: draft
owner: architecture
createdAt: 2026-08-10
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - docs/architecture-dna.md
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0795

## 1. Objectives

- [ ] O1 — Add `dependsOn` and `batch` fields to `RfcFrontmatter` and `RFC_KNOWN_KEYS` — maps to acceptance criterion [dependsOn and batch fields added to RfcFrontmatter]
- [ ] O2 — Add V-33 and V-34 validation rules to `validate-rules.ts` — maps to acceptance criteria [V-33, V-34]
- [ ] O3 — Add RFC-IMP-07 dependency gate to `rfc.implement.stamp` — maps to acceptance criteria [RFC-IMP-07, RfcImplementStampRule]
- [ ] O4 — Extend `rfc.list` with `--batch` flag and `RfcListEntry` fields — maps to acceptance criteria [--batch flag, RfcListEntry, rfc.list --batch --json]
- [ ] O5 — Update skills (`fo-idea`, `fo-idea-plan`, `fo-idea-implement`) with session affinity and series creation updates — maps to acceptance criteria [fo-idea step 4c, fo-idea-plan, fo-idea-implement]
- [ ] O6 — Add DNA-65 to `docs/architecture-dna.md` — maps to acceptance criterion [DNA-65 entry]
- [ ] O7 — Retroactive batch auto-detection on existing implemented RFCs — maps to acceptance criterion [Retroactive batch auto-detection]
- [ ] O8 — Unit tests for V-33, V-34, RFC-IMP-07 — maps to acceptance criterion [Unit tests]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/rfc/types.ts` — `RfcFrontmatter` interface, `RfcListEntry` interface, `RfcImplementStampRule` union, `RFC_KNOWN_KEYS` array
- `packages/forge/os/rfc/handlers/validate-rules.ts` — V-33 (dependsOn referential integrity + self-dependency + rejected-dependency deadlock), V-34 (batch slug format)
- `packages/forge/os/rfc/handlers/implement-stamp.ts` — RFC-IMP-07 dependency gate using `loadRfcStatusMap`
- `packages/forge/os/rfc/handlers/list-create.ts` — `runRfcList` `--batch` flag filtering, `batch`/`dependsOn` in entry output
- `packages/forge/os/rfc/rfc.module.ts` — `batch` flag registration on `rfc.list` command
- `packages/forge/src/tests/validate-rules.test.ts` — V-33 and V-34 test cases
- `packages/forge/src/tests/implement-stamp.test.ts` — RFC-IMP-07 test cases

### 2.2 Configuration and data

- No YAML/JSON config changes. No ontology catalogs. No system.md changes.

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — add DNA-65 entry after DNA-64
- `packages/forge/AGENTS.md` — no changes needed (the forge OS module table already lists `rfc.list`, `rfc.validate`, `rfc.implement.stamp` as commands in `os/rfc/`)
- `packages/forge/skills/fo/fo-idea/SKILL.md` — step 4c: write `dependsOn` and `batch` during series creation
- `packages/forge/skills/fo/fo-idea-plan/SKILL.md` — session affinity recommendation
- `packages/forge/skills/fo/fo-idea-implement/SKILL.md` — session affinity recommendation
- `.agents/skills/fo-idea/SKILL.md` — synced copy
- `.agents/skills/fo-idea-plan/SKILL.md` — synced copy
- `.agents/skills/fo-idea-implement/SKILL.md` — synced copy

### 2.4 Validation and pipelines

- `rfc.validate --id RFC-0795` — must pass with zero errors after implementation
- `pnpm --filter @warpgogol/forge run build` — scoped build for impacted package
- No new pipeline steps. V-33/V-34 are warnings, not errors. No `build.check` or `build.prepare` integration.

## 3. Step sequence

### Step 1. Contracts — types and known keys

**Goal:** Add `dependsOn` and `batch` to `RfcFrontmatter`, `RFC_KNOWN_KEYS`, `RfcListEntry`, and `RfcImplementStampRule`.

**Agent actions:**

- Add `dependsOn?: string[]` and `batch?: string` to `RfcFrontmatter` interface in `packages/forge/os/rfc/types.ts` (after `liveSpec` field, with JSDoc comments from RFC TypeScript contracts section)
- Add `"dependsOn"` and `"batch"` to `RFC_KNOWN_KEYS` array in `packages/forge/os/rfc/types.ts` (after `"liveSpec"`)
- Add `batch?: string` and `dependsOn?: string[]` to `RfcListEntry` interface in `packages/forge/os/rfc/types.ts`
- Add `| "RFC-IMP-07"` to `RfcImplementStampRule` union in `packages/forge/os/rfc/types.ts`
- Update `CHANGE_SUMMARY` in `types.ts` header comment with `<item>RFC-0795: added dependsOn, batch fields to RfcFrontmatter and RFC_KNOWN_KEYS; added RFC-IMP-07 to RfcImplementStampRule; added batch/dependsOn to RfcListEntry.</item>`

**Validation:**

- `pnpm --filter @warpgogol/forge run build` — TypeScript compiles without errors

**Completion criterion:** `RfcFrontmatter` has `dependsOn` and `batch` fields; `RFC_KNOWN_KEYS` includes both; `RfcListEntry` has both; `RfcImplementStampRule` includes `"RFC-IMP-07"`; TypeScript compiles.

**Human review:** no

---

### Step 2. Commands — V-33 and V-34 validation rules

**Goal:** Add V-33 (dependsOn referential integrity, self-dependency, rejected-dependency deadlock) and V-34 (batch slug format) to `validate-rules.ts`.

**Agent actions:**

- In `packages/forge/os/rfc/handlers/validate-rules.ts`, after the V-32 block (implementation commit drift), add:
  - **V-33**: check `fm["dependsOn"]` — if array, for each entry:
    - If entry does not match `allParsed.has(ref)` → warning: `dependsOn "{ref}" does not match any existing RFC`
    - If entry === `rfcId` (self-dependency) → warning: `dependsOn includes itself — an RFC cannot depend on itself`
    - If entry exists and its status is `rejected` → warning: `dependsOn "{ref}" has status "rejected" — this dependency will never be satisfied. Remove the entry or supersede the rejected RFC.`
  - **V-34**: check `fm["batch"]` — if present and not matching `/^[a-z0-9]+(-[a-z0-9]+)*$/` → warning: `batch slug "{value}" does not match kebab-case pattern /^[a-z0-9]+(-[a-z0-9]+)*$/`
- Update `CHANGE_SUMMARY` in `validate-rules.ts` header comment

**Validation:**

- `pnpm --filter @warpgogol/forge run build` — TypeScript compiles
- `pnpm exec werkstatt run rfc.validate --id RFC-0795 --json` — still passes (RFC-0795 has no dependsOn/batch fields yet)

**Completion criterion:** V-33 and V-34 rules exist in `validate-rules.ts`; V-33 checks referential integrity, self-dependency, and rejected-dependency deadlock; V-34 checks batch slug format; both are warning severity; TypeScript compiles.

**Human review:** no

---

### Step 3. Commands — RFC-IMP-07 dependency gate in implement-stamp

**Goal:** Add the `dependsOn` dependency gate to `rfc.implement.stamp` that hard-blocks stamping when any dependency is not `implemented`.

**Agent actions:**

- In `packages/forge/os/rfc/handlers/implement-stamp.ts`, after the RFC-IMP-02 criterion checks (line ~296) and before the RFC-IMP-04 clean-file check (line ~317), add:
  - Read `dependsOn` from `fm` (target RFC frontmatter)
  - If `dependsOn` is a non-empty array, call `loadRfcStatusMap(rfcDirPath)` from `../frontmatter-io.ts`
  - For each `depId` in `dependsOn`:
    - If `depId` not in statusMap → violation `RFC-IMP-07`: `RFC {targetId} depends on {depId}, which does not exist in {RFC_DIR}.`
    - If statusMap.get(depId) !== "implemented" → violation `RFC-IMP-07`: `RFC {targetId} depends on {depId}, which is not implemented (status: {status}). Implement {depId} first.`
- Import `loadRfcStatusMap` from `../frontmatter-io.ts` at the top of the file
- Update `CHANGE_SUMMARY` in `implement-stamp.ts` header comment with `<item>RFC-0795: added RFC-IMP-07 dependsOn dependency gate.</item>`

**Validation:**

- `pnpm --filter @warpgogol/forge run build` — TypeScript compiles

**Completion criterion:** `rfc.implement.stamp` checks `dependsOn` entries via `loadRfcStatusMap` and pushes `RFC-IMP-07` violations for unimplemented dependencies; TypeScript compiles.

**Human review:** no

---

### Step 4. Commands — rfc.list --batch flag

**Goal:** Extend `rfc.list` with `--batch <slug>` filtering and include `batch`/`dependsOn` in output entries.

**Agent actions:**

- In `packages/forge/os/rfc/handlers/list-create.ts` `runRfcList`:
  - Add `const filterBatch = input.flags["batch"] as string | undefined;` after `filterOwner`
  - After the `filterOwner` check (line 93), add: `if (filterBatch && String(fm["batch"] ?? "") !== filterBatch) continue;`
  - In the `entries.push` object (line 95-105), add: `batch: fm["batch"] ? String(fm["batch"]) : undefined,` and `dependsOn: Array.isArray(fm["dependsOn"]) ? (fm["dependsOn"] as string[]) : undefined,`
- In `packages/forge/os/rfc/rfc.module.ts`, in the `rfc.list` command registration (lines 42-63), add to `flags`:
  ```ts
  batch: {
    kind: "string",
    description: "Filter by batch slug (e.g. engine-consolidation).",
  },
  ```

**Validation:**

- `pnpm --filter @warpgogol/forge run build` — TypeScript compiles
- `pnpm exec werkstatt run rfc.list --json` — runs without error, entries include `batch` and `dependsOn` fields (undefined for RFCs without them)

**Completion criterion:** `rfc.list --batch <slug>` filters by batch slug; `rfc.list --json` entries include `batch` and `dependsOn` fields; `batch` flag registered in `rfc.module.ts`; TypeScript compiles.

**Human review:** no

---

### Step 5. Documentation — DNA-65 and skill updates

**Goal:** Add DNA-65 to `docs/architecture-dna.md` and update the three skill files with session affinity and series creation instructions.

**Agent actions:**

- Add DNA-65 entry to `docs/architecture-dna.md` after DNA-64:
  ```
  ## DNA-65 · RFC dependency and batch tracking

  RFCs in a series declare direct implementation dependencies via the `dependsOn` frontmatter field (array of RFC-XXXX IDs) and batch identity via the `batch` field (kebab-case slug). `rfc.implement.stamp` enforces a hard block (RFC-IMP-07) when any `dependsOn` entry is not `implemented`. `rfc.validate` checks referential integrity (V-33) and slug format (V-34) as warnings. `rfc.list --batch <slug>` filters by batch. Dependencies are direct-only (not transitive). Both fields are optional — standalone RFCs need neither. Enforcement: `rfc.implement.stamp` (RFC-IMP-07), `rfc.validate` (V-33, V-34), `rfc.list` (--batch flag). Established by RFC-0795.
  ```
- In `packages/forge/skills/fo/fo-idea/SKILL.md` step 4c, after the existing cross-reference instructions (line 224-228), add:
  - **`dependsOn`** — for each document, based on the decomposition plan's dependency edges, write `dependsOn: [RFC-XXXX]` listing the RFC IDs that must be `implemented` before this RFC can be stamped. Direct dependencies only.
  - **`batch`** — write a shared `batch: <kebab-case-slug>` for all documents in the series. The slug should be descriptive of the overall task (e.g. "pbp-locale-fixes", "engine-consolidation").
- In `packages/forge/skills/fo/fo-idea-plan/SKILL.md`, add a session affinity recommendation section before the Constraints section:
  ```
  ## Session affinity (advisory)

  When an RFC was planned in this session, prefer implementing it in this session too. The session context contains edge cases and mental models not fully captured in the plan text. If starting a new session, re-read the plan file and the RFC body before implementing. This is a recommendation, not a machine-enforced constraint — sessions have no forge-internal identity.
  ```
- In `packages/forge/skills/fo/fo-idea-implement/SKILL.md`, add the same session affinity section before the Constraints section (step 5 area, before "## Constraints")
- Copy all three updated skill files to their `.agents/skills/<name>/SKILL.md` synced locations

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0795 --json` — passes
- `pnpm --filter @warpgogol/forge run build` — TypeScript compiles

**Completion criterion:** DNA-65 exists in `docs/architecture-dna.md`; `fo-idea` step 4c mentions `dependsOn` and `batch`; `fo-idea-plan` and `fo-idea-implement` have session affinity sections; `.agents/skills/` copies are synced.

**Human review:** no

---

### Step 6. Tests — V-33, V-34, RFC-IMP-07

**Goal:** Add unit tests for the new validation rules and stamping gate.

**Agent actions:**

- In `packages/forge/src/tests/validate-rules.test.ts` (or the appropriate test file), add:
  - **V-33 referential integrity**: RFC with `dependsOn: ["RFC-9999"]` where RFC-9999 does not exist → 1 V-33 warning
  - **V-33 self-dependency**: RFC with `dependsOn: ["RFC-0001"]` (self) → 1 V-33 warning
  - **V-33 rejected dependency**: RFC with `dependsOn: ["RFC-0002"]` where RFC-0002 status is `rejected` → 1 V-33 warning
  - **V-33 valid dependency**: RFC with `dependsOn: ["RFC-0003"]` where RFC-0003 exists and is `implemented` → 0 V-33 warnings
  - **V-34 valid slug**: RFC with `batch: "engine-consolidation"` → 0 V-34 warnings
  - **V-34 invalid slug**: RFC with `batch: "Engine Consolidation"` (uppercase, spaces) → 1 V-34 warning
  - **V-34 missing batch**: RFC without `batch` field → 0 V-34 warnings
- In `packages/forge/src/tests/implement-stamp.test.ts`, add:
  - **RFC-IMP-07 blocks when dependency not implemented**: RFC-0002 has `dependsOn: ["RFC-0001"]`, RFC-0001 is `accepted` → stamp fails with RFC-IMP-07
  - **RFC-IMP-07 passes when dependency implemented**: RFC-0002 has `dependsOn: ["RFC-0001"]`, RFC-0001 is `implemented` → stamp succeeds
  - **RFC-IMP-07 blocks when dependency does not exist**: RFC-0002 has `dependsOn: ["RFC-9999"]` → stamp fails with RFC-IMP-07
  - **RFC-IMP-07 passes when dependsOn is empty/absent**: RFC-0001 without `dependsOn` → stamp succeeds (no dependency check)

**Validation:**

- `pnpm --filter @warpgogol/forge run test` — all tests pass

**Completion criterion:** All V-33, V-34, and RFC-IMP-07 test cases pass; tests cover positive and negative scenarios.

**Human review:** no

---

### Step 7. Retroactive batch auto-detection

**Goal:** Scan existing `implemented` RFCs for batch groupings based on mutual `related` references and close creation dates.

**Agent actions:**

- Scan `docs/rfcs/` (including `archive/implemented/`) for `implemented` RFCs
- For each group of 2+ RFCs that mutually reference each other via `related` AND share creation dates within 7 days:
  - Derive a batch slug from the common theme (e.g. "engine-consolidation" for RFC-0772..0776)
  - Add `batch: <slug>` to each RFC's frontmatter
- Do NOT add `dependsOn` retroactively
- If a group is ambiguous (RFCs reference each other but could belong to different batches), skip it
- Commit retroactive changes separately

**Validation:**

- `pnpm exec werkstatt run rfc.validate --json` — no new errors from retroactive batch fields

**Completion criterion:** At least one batch group detected and populated (if any exist); no `dependsOn` added retroactively; `rfc.validate` passes.

**Human review:** no — the heuristic is deterministic and non-destructive (adds optional field only)

---

### Step 8. Validation, review, fix, and stamp

**Goal:** Run all validation, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0795 --json` — confirm zero errors
- Run `pnpm --filter @warpgogol/forge run build` — confirm scoped build passes
- Run `pnpm --filter @warpgogol/forge run test` — confirm all tests pass
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` — no new commands, but `rfc.list` and `rfc.implement.stamp` and `rfc.validate` are changed (internal logic only, no CLI surface change for stamp/validate; `rfc.list` gains `--batch` flag). Check if manifest needs regeneration.
- Check off all acceptance criteria in the RFC with `(evidence: ...)` annotations
- Set `reviewers` to `human:andrii-syrokomskyi` (already set)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`
- Stamp the RFC: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0795 --implementation-commit <sha>`
- Commit the stamped RFC file

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0795` — zero errors
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0795`
- `pnpm --filter @warpgogol/forge run build`
- `pnpm --filter @warpgogol/forge run test`
- No acceptance probes declared (commented out in frontmatter) — `rfc.verification.emit` not required

### 4.2 Evidence artifacts

- No verification evidence file (acceptance probes commented out)
- Commit messages referencing `RFC-0795` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False blocking of legitimate workflows (dependsOn on rejected RFC) | Step 2: V-33 warns on rejected-dependency deadlock at validation time, surfacing the issue before stamping |
| Agent misinterpretation: declaring dependsOn too broadly | Step 5: fo-idea step 4c instructs agents to declare only direct implementation dependencies |
| Retroactive batch auto-detection errors | Step 7: heuristic requires mutual `related` AND close creation dates; ambiguous cases skipped |
| V-33 false positives during parallel series creation | Step 2: V-33 is warning severity, not error — by design |
| Maintenance burden | Steps 1-4: small surface, follows existing patterns in validate-rules.ts and implement-stamp.ts |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-65 or any other DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0795 --reason "..." --invariant "DNA-N"` instead of working around it.
