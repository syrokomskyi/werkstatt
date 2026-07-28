---
rfcId: RFC-0505
planId: PLAN-RFC-0505-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/share"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - docs/verification-plan.xml
    - docs/COMMANDS.md
    - docs/requirements.xml
    - docs/technology.xml
    - docs/knowledge-graph.xml
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0505

## 1. Objectives

- [ ] Objective 1 — Claim record Zod schema exported from `@gogol/share/schemas` (maps to acceptance criterion: "Claim record Zod schema is exported from @gogol/share/schemas")
- [ ] Objective 2 — `ratgeber.claim.validate` command implemented with RG-CLAIM-01..09 rules (maps to acceptance criteria: "ratgeber.claim.validate is implemented and registered", "RG-CLAIM-01..09 rules are implemented", "ratgeber.claim.validate --site warpgogol-com --json passes")
- [ ] Objective 3 — `ratgeber.provenance.validate` updated: RG-PROV-03 checks claim records, RG-PROV-06 added (maps to acceptance criteria: "RG-PROV-03 checks claim records instead of sidecars", "RG-PROV-06 checks article claimIds resolve to claim records")
- [ ] Objective 4 — Migrator `rfc-0505` transforms claim sidecars into claim records and deletes sidecars (maps to acceptance criteria: "Migrator rfc-0505 is registered and transforms claim sidecars", "Migrator deletes claim sidecars after transformation")
- [ ] Objective 5 — `surface/claims/{lang}/*.md` collection created with initial claim records (maps to acceptance criterion: "surface/claims/{lang}/*.md collection exists with initial claim records")
- [ ] Objective 6 — Compass sync and documentation updated (maps to acceptance criterion: "rfc.validate RFC-0505 passes")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/schemas/claim-records.ts` — New: `claimRecordSchema` Zod schema + `ClaimRecord` type
- `packages/share/src/schemas/index.ts` — Updated: re-export `claimRecordSchema`, `ClaimRecord`
- `packages/os/site-kernel-checks/src/ratgeber-claim-validate.ts` — New: validator with RG-CLAIM-01..09
- `packages/os/site-kernel-checks/src/lib/surface-claims.ts` — New: `loadClaimRecords` helper
- `packages/os/site-kernel-checks/src/ratgeber-provenance-validate.ts` — Updated: RG-PROV-03 resolves against claim records, add RG-PROV-06
- `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` — Updated: register `ratgeber.claim.validate` command entry, update `ratgeber.provenance.validate` reads list
- `packages/os/site-kernel-handoff/src/migrators/rfc-0505.ts` — New: migrator
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — Extended: register `rfc-0505`
- `packages/os/site-kernel-handoff/src/migrators/rfc-0505.pbt.test.ts` — New: PBT idempotency test
- `packages/os/site-kernel-handoff/src/migrators/rfc-0505.snapshot.test.ts` — New: snapshot test

### 2.2 Configuration and data

- `tools/kernel.config.ts` — Register `ratgeber.claim.validate` command
- `surface/claims/{lang}/*.md` — New content collection (created by migrator, populated by operator)

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0505-ratgeber-extended-claim-registry-structured-claim-records.md` — Read-only reference
- `docs/rfcs/rfc-0502-ratgeber-editorial-provenance-authors-sources-claims.md` — Updated: add `amendedBy: [RFC-0505]`
- `packages/os/site-kernel-checks/AGENTS.md` — Updated: document `ratgeber-claim-validate.ts` module, RG-PROV-03/RG-PROV-06 changes
- `docs/verification-plan.xml` — Add RG-CLAIM-01..09 checks
- `docs/COMMANDS.md` — Add `ratgeber.claim.validate` command
- `docs/requirements.xml` — Update: new claim record collection
- `docs/technology.xml` — Update: new validator, migrator, schema
- `docs/knowledge-graph.xml` — Update: RFC-0505 relationships

### 2.4 Validation and pipelines

- `ratgeber.claim.validate` runs in `build.check` (blocking) — site-scoped
- `ratgeber.provenance.validate` runs in `build.check` (blocking) — updated
- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck + test
- `pnpm --filter @gogol/site-kernel-handoff run build:check` — typecheck + test (migrator)
- `pnpm --filter @gogol/share run build:check` — typecheck (schema)

## 3. Step sequence

### Step 1. Create claim record Zod schema in `@gogol/share`

**Goal:** Define the `claimRecordSchema` and `ClaimRecord` type in `@gogol/share/schemas`.

**Agent actions:**

- Create `packages/share/src/schemas/claim-records.ts` with `claimRecordSchema` (Zod, `.strict()`) and `ClaimRecord` type per RFC-0505 TypeScript contracts section.
- Add re-export in `packages/share/src/schemas/index.ts`: `export { claimRecordSchema, type ClaimRecord } from "./claim-records.ts";`

**Validation:**

- `pnpm --filter @gogol/share run build:check` passes.

**Completion criterion:** `claimRecordSchema` and `ClaimRecord` are exported from `@gogol/share/schemas` and typecheck passes.

**Human review:** no

---

### Step 2. Create `loadClaimRecords` helper in `@gogol/site-kernel-checks`

**Goal:** Provide a reusable loader for claim records from `surface/claims/{lang}/*.md`.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/lib/surface-claims.ts` with `loadClaimRecords(appDir: string): Promise<Map<string, ClaimRecord>>` that scans `src/content/surface/claims/{lang}/*.md`, parses frontmatter with `parseMarkdownFrontmatter`, validates with `claimRecordSchema`, and returns a map keyed by `claimId`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.

**Completion criterion:** `loadClaimRecords` compiles and is importable from `@gogol/site-kernel-checks/src/lib/surface-claims.ts`.

**Human review:** no

---

### Step 3. Implement `ratgeber.claim.validate` command

**Goal:** Create the validator with all 9 rules (RG-CLAIM-01..09).

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/ratgeber-claim-validate.ts` with `runRatgeberClaimValidate` function.
- Implement RG-CLAIM-01 (required fields), RG-CLAIM-02 (claimId uniqueness), RG-CLAIM-03 (articleId resolution), RG-CLAIM-04 (factual/regulatory sourceRefs), RG-CLAIM-05 (calculation calculationInputs), RG-CLAIM-06 (sourceRefs URL validity), RG-CLAIM-07 (expiresAt warning), RG-CLAIM-08 (disputed warning), RG-CLAIM-09 (PBP value drift warning).
- Use `loadClaimRecords` from step 2, `loadArticleRecords` pattern from `ratgeber-provenance-validate.ts`, `loadSourceDescriptors` from `content-source-binding.ts`.
- For RG-CLAIM-09: read PBP data files to compare `calculationInputs[].value` against the current value at the `ref` path. If the `ref` path does not resolve, emit a warning.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.
- Unit tests in `packages/os/site-kernel-checks/src/tests/ratgeber-claim-validate.test.ts` cover all 9 rules.

**Completion criterion:** `ratgeber-claim-validate.ts` compiles with all 9 rules, unit tests pass.

**Human review:** no

---

### Step 4. Register `ratgeber.claim.validate` in command table

**Goal:** Wire the new command into the kernel command registry.

**Agent actions:**

- Add command entry to `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` after the `ratgeber.provenance.validate` entry:
  ```ts
  {
    name: "ratgeber.claim.validate",
    description: "RFC-0505: validate ratgeber claim records — schema, source binding, claimId uniqueness, expiry, review status, and calculation input drift.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/surface/claims/**/*.md",
      "<app>/src/content/surface/articles/**/*.md",
      "integrations/truth-sources/*.yaml",
    ],
    execute: runRatgeberClaimValidate,
  },
  ```
- Add import for `runRatgeberClaimValidate` at the top of the file.
- Update the `ratgeber.provenance.validate` entry's `reads` list: replace `<app>/src/content/surface/articles/**/*.claims.yaml` with `<app>/src/content/surface/claims/**/*.md`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.
- `pnpm exec site-kernel run ratgeber.claim.validate --site warpgogol-com --json` — command is recognized (may pass or produce diagnostics depending on content state).

**Completion criterion:** `ratgeber.claim.validate` is registered and callable via the kernel CLI.

**Human review:** no

---

### Step 5. Update `ratgeber.provenance.validate` — RG-PROV-03 and RG-PROV-06

**Goal:** Change RG-PROV-03 to resolve claimIds against claim records instead of sidecars; add RG-PROV-06.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/ratgeber-provenance-validate.ts`:
  - Replace the sidecar-based RG-PROV-03 logic (lines ~253-300) with claim-record-based resolution: use `loadClaimRecords` to build a map of valid claimIds, then check each `sources[].claimIds` entry against that map.
  - Add RG-PROV-06: for every `claimId` in `sources[].claimIds`, check it resolves to a claim record in `surface/claims/{lang}/`. This is the same check as the updated RG-PROV-03 but scoped to the article's language directory. (RG-PROV-03 and RG-PROV-06 can be unified: RG-PROV-03 checks claimId existence, RG-PROV-06 checks article-to-claim-record binding — both resolve against the claim record collection.)
  - Remove the `existsSync(sidecarPath)` and sidecar YAML parsing logic — claim sidecars are no longer the source of truth.
- Update the `ratgeber.provenance.validate` command table entry's `reads` list (already done in step 4).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.
- Existing `ratgeber-provenance-validate.test.ts` tests are updated: RG-PROV-03 tests now use claim records instead of sidecars.

**Completion criterion:** RG-PROV-03 resolves against `surface/claims/`, RG-PROV-06 is implemented, tests pass.

**Human review:** no

---

### Step 6. Create migrator `rfc-0505`

**Goal:** Transform existing claim sidecars into claim records and delete sidecars.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0505.ts`:
  - Scan `surface/articles/{lang}/{slug}.claims.yaml` files.
  - For each sidecar entry, create a claim record file at `surface/claims/{lang}/{claimId}.md` with the field mapping from RFC-0505 Migrator section.
  - Prefix `claimId` with `{article-slug}-` to enforce article-scoped naming.
  - Resolve `sourceRef` to source descriptor for `url` and `title`.
  - Set `reviewStatus: unverified` for all migrated claims.
  - Delete the sidecar file after transformation.
  - Idempotent: if claim record file already exists, skip (do not overwrite).
- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0505.pbt.test.ts` — PBT idempotency test: `f(f(x)) === f(x)`.
- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0505.snapshot.test.ts` — snapshot test on real data.
- Register migrator in `packages/os/site-kernel-handoff/src/migrators/registry.ts`:
  - Add import: `import { rfc0505Migrator } from "./rfc-0505.ts";`
  - Add to `migratorRegistry` array after `rfc0504Migrator`.
  - Add `CHANGE_SUMMARY` entry: `<item>RFC-0505: register rfc-0505 content migrator (claim sidecar → claim record transformation).</item>`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes.
- PBT test passes: `f(f(x)) === f(x)`.
- Snapshot test passes.

**Completion criterion:** Migrator is registered, PBT + snapshot tests pass, migrator transforms sidecars and deletes them.

**Human review:** no

---

### Step 7. Update `amendedBy` on RFC-0502

**Goal:** Record the amendment relationship.

**Agent actions:**

- In `docs/rfcs/rfc-0502-ratgeber-editorial-provenance-authors-sources-claims.md`, update `amendedBy: [RFC-0505]` (currently `amendedBy: - RFC-0505` — verify it's already there from enhance, or add it).

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0502 --json` passes.

**Completion criterion:** RFC-0502 `amendedBy` includes RFC-0505.

**Human review:** no

---

### Step 8. Documentation sync — AGENTS.md and Compass XML

**Goal:** Update all documentation surfaces affected by RFC-0505.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md`: add `ratgeber-claim-validate.ts` module entry, update `ratgeber-provenance-validate.ts` entry to note RG-PROV-03/RG-PROV-06 changes.
- Update `docs/verification-plan.xml`: add RG-CLAIM-01..09 checks.
- Update `docs/COMMANDS.md`: add `ratgeber.claim.validate` command.
- Update `docs/requirements.xml`: add claim record collection requirement.
- Update `docs/technology.xml`: add new validator, migrator, and schema files.
- Update `docs/knowledge-graph.xml`: add RFC-0505 relationships.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surface changed.

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0505 --json` passes.
- All scope docs are either updated or documented as not-applicable.

**Completion criterion:** All documentation surfaces in scope are updated.

**Human review:** no

---

### Step 9. Run migrator and verify validators

**Goal:** Execute the migrator on warpgogol-com and verify both validators pass.

**Agent actions:**

- Run migrator via `mission.migrate` on warpgogol-com mission workpiece (or manually if no active mission).
- Run `pnpm exec site-kernel run ratgeber.claim.validate --site warpgogol-com --json` — verify it passes (may have warnings for unverified/expired claims).
- Run `pnpm exec site-kernel run ratgeber.provenance.validate --site warpgogol-com --json` — verify it passes.
- Verify claim sidecar files are deleted and claim record files exist in `surface/claims/{lang}/`.

**Validation:**

- `ratgeber.claim.validate --site warpgogol-com --json` exits 0 or 2 (warnings only).
- `ratgeber.provenance.validate --site warpgogol-com --json` exits 0 or 2.
- No claim sidecar files remain in `surface/articles/{lang}/`.

**Completion criterion:** Both validators pass, sidecars are deleted, claim records exist.

**Human review:** yes — operator fills in `claimText`, `limitations`, and `calculationInputs` for the two reference articles (lokale-sichtbarkeit, website-kosten). This is human editorial work — the agent MUST NOT auto-generate these fields.

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0505 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.
- Commit the stamped RFC separately from the implementation commit.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate RFC-0505 --json` passes.
- Every file in `scope.docs` is either updated or documented as not-applicable.

**Completion criterion:** All documentation artifacts in scope are updated; all acceptance criteria are checked off with inline evidence annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0505 --json`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run ratgeber.claim.validate --site warpgogol-com --json`
- `pnpm exec site-kernel run ratgeber.provenance.validate --site warpgogol-com --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0505` in the subject line (RFC-0265 commit hygiene)
- PBT + snapshot test outputs for migrator `rfc-0505`
- `ratgeber.claim.validate` and `ratgeber.provenance.validate` JSON output showing pass status

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Claim collection maintenance burden | Step 9: start with two reference articles, `reviewStatus: unverified` allows gradual adoption |
| Source URL rot | Step 3: RG-CLAIM-07 warns on expired claims; `retrievedAt` records access date |
| Calculation input drift | Step 3: RG-CLAIM-09 warns when PBP value differs from recorded value |
| Agent auto-generates claim records without human review | Step 9: human review point — operator fills editorial fields; implementation notes prohibit auto-generation |
| RG-CLAIM-07 false positives during migration | Step 3: RG-CLAIM-07 is warning, not error — does not block publication |
| Migrator deletes claim sidecars | Step 6: migrator is idempotent — skips sidecars where claim records already exist |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-16, DNA-24, or DNA-53, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0505 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the claim record schema cannot be expressed as a strict Zod object without breaking `@gogol/share` barrel size limits (BARREL-01), split the schema into a subpath export instead of adding to the root barrel.
