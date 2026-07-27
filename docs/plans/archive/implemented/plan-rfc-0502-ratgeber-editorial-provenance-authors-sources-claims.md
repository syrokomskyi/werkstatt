---
rfcId: RFC-0502
planId: PLAN-RFC-0502-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps:
    - webgogol-com
  packages:
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
    - "@gogol/share"
  services: []
  docs:
    - docs/verification-plan.xml
    - docs/COMMANDS.md
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0502

## 1. Objectives

- [ ] O1 — Author collection created with initial author record — maps to acceptance criterion "surface/authors/{lang}/*.md created with initial author record"
- [ ] O2 — Migrator creates author record file idempotently — maps to acceptance criterion "surface/authors/{lang}/*.md created" (migrator path)
- [ ] O3 — `ratgeber.provenance.validate` command implemented and registered — maps to acceptance criteria "every authorId resolves", "every sourceId resolves", "every claimId exists"
- [ ] O4 — Provenance footer block emitted by `bakeRatgeberArticle` — maps to acceptance criterion "article pages display provenance footer"
- [ ] O5 — `source.binding.validate` updated to scan article claim sidecars — maps to acceptance criterion "every sourceId resolves"
- [ ] O6 — All validation passes (`rfc.validate`, `build:check`, `migrator.registry.validate`) — maps to acceptance criterion "rfc.validate passes"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/ratgeber-provenance-validate.ts` — **New**: validator implementation (RG-PROV-01..05)
- `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts` — **Updated**: add provenance footer `markdown` block as final block
- `packages/os/site-kernel-checks/src/lib/surface-articles.ts` — **Updated**: add `loadAuthorRecords` function
- `packages/os/site-kernel-checks/src/content-source-binding.ts` — **Updated**: scan `surface/articles/{lang}/` for claim sidecars in addition to `paths.businessDirectory`
- `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` — **Updated**: register `ratgeber.provenance.validate` command entry
- `packages/os/site-kernel-handoff/src/migrators/rfc-0502.ts` — **New**: migrator that creates `surface/authors/{lang}/andrii-syrokomskyi.md`
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — **Updated**: register `rfc0502Migrator`
- `packages/os/site-kernel-handoff/src/migrators/index.ts` — **Updated**: re-export if needed
- `packages/os/site-kernel-handoff/src/tests/migrators.test.ts` — **Updated**: update migrator count
- `tools/kernel.config.ts` — **Updated**: register `ratgeber.provenance.validate`

### 2.2 Configuration and data

- `surface/authors/{lang}/andrii-syrokomskyi.md` — **New content** (created by migrator): author record with id, name, role, bio, contactUrl
- `integrations/truth-sources/*.yaml` — **Existing**: source descriptors referenced by `sourceId` (no new descriptors created by this RFC)

### 2.3 Documentation and specs

- `docs/verification-plan.xml` — add `ratgeber.provenance.validate` check entry
- `docs/COMMANDS.md` — add `ratgeber.provenance.validate` command documentation
- `packages/os/site-kernel-checks/AGENTS.md` — update if new module needs ownership entry
- `docs/rfcs/rfc-0502-ratgeber-editorial-provenance-authors-sources-claims.md` — read-only reference

### 2.4 Validation and pipelines

- `build.check` — `ratgeber.provenance.validate` joins as a site-scoped check
- `migrator.registry.validate` — must pass after registering the new migrator
- `rfc.validate RFC-0502` — must pass
- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck
- `pnpm --filter @gogol/site-kernel-handoff run build:check` — typecheck

## 3. Step sequence

### Step 1. TypeScript contracts — AuthorRecord and ArticleSourceBinding

**Goal:** Define the TypeScript interfaces for author records and article source bindings.

**Agent actions:**

- Add `AuthorRecord` interface to `packages/os/site-kernel-checks/src/ratgeber-provenance-validate.ts` (or a shared types file if the team prefers)
- Add `ArticleSourceBinding` interface to the same file
- Export both types for use in the validator and baker

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** Both interfaces are defined, exported, and typecheck passes.

**Human review:** no

---

### Step 2. Migrator — rfc-0502.ts

**Goal:** Create the idempotent migrator that creates the initial author record file.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0502.ts`
- Implement `rfc0502Migrator` with:
  - `id: "rfc-0502"`
  - `fromVersion: "4.13.0"` (after RFC-0501)
  - `toVersion: "4.14.0"`
  - `transform`: check if `surface/authors/{lang}/andrii-syrokomskyi.md` exists for each lang; if not, create it with default frontmatter (id, name, role, bio, contactUrl). If it exists, no-op (idempotent).
- Register in `packages/os/site-kernel-handoff/src/migrators/registry.ts` — add import and add to `migratorRegistry` array
- Update `packages/os/site-kernel-handoff/src/tests/migrators.test.ts` — update migrator count from 11 to 12, add `rfc-0502` to expected ids
- Create PBT test: `packages/os/site-kernel-handoff/src/migrators/rfc-0502.pbt.test.ts` — test `f(f(x)) == f(x)`
- Create snapshot test: `packages/os/site-kernel-handoff/src/migrators/rfc-0502.snapshot.test.ts` — test on real data

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` — typecheck passes
- `pnpm --filter @gogol/site-kernel-handoff run test` — migrator tests pass
- `pnpm exec site-kernel run migrator.registry.validate` — registry is valid

**Completion criterion:** Migrator is registered, tests pass, `migrator.registry.validate` passes.

**Human review:** no

---

### Step 3. Validator — ratgeber-provenance-validate.ts

**Goal:** Implement the `ratgeber.provenance.validate` command with RG-PROV-01..05 rules.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/ratgeber-provenance-validate.ts`
- Implement `runRatgeberProvenanceValidate` following the pattern of `ratgeber-article-validate.ts`:
  - Load article records from `src/content/surface/articles/{lang}/*.md`
  - Load author records from `src/content/surface/authors/{lang}/*.md` (new `loadAuthorRecords` function in `lib/surface-articles.ts`)
  - Load source descriptors via existing `loadSourceDescriptors` from `content-source-binding.ts`
  - Load claim sidecars from `surface/articles/{lang}/{slug}.claims.yaml` directly (not via `collectClaimSidecars`)
  - Load prose bodies from `src/content/prose/{lang}/ratgeber-{slug}.md` for Quellen section check
  - **RG-PROV-01**: check every article's `authorId` resolves to an author record
  - **RG-PROV-02**: check every `sourceId` in `sources` resolves to a source descriptor
  - **RG-PROV-03**: check every `claimId` in `sources[].claimIds` exists as a key in the article's claim sidecar
  - **RG-PROV-04**: check every `sourceId` appears in the prose body's `## Quellen` section (full string match)
  - **RG-PROV-05**: warn if article has no sources (suppress for `grundlagenartikel` and `begriffserklaerung`)
- Use `diagnosticsResult` from `result-helpers.ts` for output
- Add `loadAuthorRecords` to `packages/os/site-kernel-checks/src/lib/surface-articles.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** Validator compiles, all 5 rules implemented, typecheck passes.

**Human review:** no

---

### Step 4. Register command in command table and kernel config

**Goal:** Wire `ratgeber.provenance.validate` into the command registry and pipeline.

**Agent actions:**

- Add command entry to `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts`:
  - `name: "ratgeber.provenance.validate"`
  - `scope: "app"`
  - `supportsAllSites: true`
  - `reads`: article records, author records, claim sidecars, source descriptors, prose bodies
  - `execute: runRatgeberProvenanceValidate`
- Import `runRatgeberProvenanceValidate` at the top of the command table file
- Register in `tools/kernel.config.ts` if needed

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec site-kernel run ratgeber.provenance.validate --site webgogol-com --json` — command is found and runs

**Completion criterion:** Command is registered, discoverable, and runs without crashing (empty diagnostics on a clean site or appropriate diagnostics on a site with issues).

**Human review:** no

---

### Step 5. Update bakeRatgeberArticle with provenance footer

**Goal:** Emit a provenance footer `markdown` block as the final block in baked article pages.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts`
- After the closing CTA block, append a `markdown` block with provenance content:
  - Heading: "Redaktion" (DE) / "Редакція" (UK)
  - Author name and role from the author record (resolved via `authorId`)
  - Review date from `reviewedAt`
  - Source list from source descriptors (title + URL if endpoint present)
- The footer is a `markdown` block type — do NOT create a new block type
- Load author records via `loadAuthorRecords` or inline file reading from `BakeCtx.supplementaryCollections`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec site-kernel run surface.generate --site webgogol-com` — surface generates with provenance footer block

**Completion criterion:** Baked article pages include the provenance footer as the final block.

**Human review:** no

---

### Step 6. Update source.binding.validate to scan article claim sidecars

**Goal:** Extend `source.binding.validate` to check article claim sidecars for sourceRef resolution.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/content-source-binding.ts`
- In `runSourceBindingValidate`, after scanning business claim sidecars via `collectClaimSidecars(paths.businessDirectory)`, add a second scan for article claim sidecars at `surface/articles/{lang}/`
- For each article claim sidecar, check `sourceRef` resolution against the same `byId` descriptor map (CKL-SRC-02)
- Reuse the existing diagnostic pattern

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec site-kernel run source.binding.validate --site webgogol-com --json` — runs without error

**Completion criterion:** `source.binding.validate` scans both business and article claim sidecars.

**Human review:** no

---

### Step 7. Tests

**Goal:** Add unit tests for the new validator and migrator.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/ratgeber-provenance-validate.test.ts`:
  - Test RG-PROV-01: article with unresolvable authorId → error
  - Test RG-PROV-02: sourceId that doesn't resolve → error
  - Test RG-PROV-03: claimId not in sidecar → error
  - Test RG-PROV-04: sourceId missing from Quellen section → error
  - Test RG-PROV-05: article with no sources → warning (non-exempt type), suppressed (exempt type)
  - Test clean article → pass
- Create migrator PBT and snapshot tests (Step 2 already covers this)

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run test` — tests pass
- `pnpm --filter @gogol/site-kernel-handoff run test` — migrator tests pass

**Completion criterion:** All tests pass.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Update documentation artifacts to reflect the new command and check.

**Agent actions:**

- Update `docs/verification-plan.xml` — add `ratgeber.provenance.validate` check entry
- Update `docs/COMMANDS.md` — add `ratgeber.provenance.validate` command documentation
- Update `packages/os/site-kernel-checks/AGENTS.md` if the new module needs an ownership entry
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed

**Validation:**

- `git diff --name-only` — confirm all scope.docs files are updated or documented as not-applicable

**Completion criterion:** All documentation artifacts in scope are updated.

**Human review:** no

---

### Final Step. Acceptance criteria verification and stamp

**Goal:** Verify all acceptance criteria, run final validation, and stamp the RFC as implemented.

**Agent actions:**

- Check off acceptance criteria:
  - [ ] `surface/authors/{lang}/*.md` created with initial author record — verify file exists
  - [ ] Every published article's `authorId` resolves to an author record — run `ratgeber.provenance.validate`
  - [ ] Every `sourceId` resolves to a source descriptor — run `ratgeber.provenance.validate`
  - [ ] Every `claimId` exists in the article's claim sidecar — run `ratgeber.provenance.validate`
  - [ ] Article pages display provenance footer — run `surface.generate` and inspect output
  - [ ] `rfc.validate` passes — run `pnpm exec site-kernel run rfc.validate RFC-0502 --json`
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0502 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate RFC-0502 --json` — passes
- `pnpm --filter @gogol/site-kernel-checks run build:check` — passes
- `pnpm --filter @gogol/site-kernel-handoff run build:check` — passes
- `pnpm exec site-kernel run migrator.registry.validate` — passes

**Completion criterion:** All acceptance criteria checked off with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0502 --json`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-checks run test`
- `pnpm --filter @gogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run migrator.registry.validate`
- `pnpm exec site-kernel run ratgeber.provenance.validate --site webgogol-com --json`
- `pnpm exec site-kernel run source.binding.validate --site webgogol-com --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0502` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0502.generated.json` — verification evidence (if acceptance probes declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Migrator creates author record that operators may want to edit | Step 2: migrator is idempotent — operator edits after `mission.migrate`, re-run is no-op |
| Claim sidecar collection path mismatch with existing CKL scanners | Step 6: `source.binding.validate` updated to scan both paths; Step 3: validator loads article sidecars directly |
| Quellen section false positives from sourceId renaming | Step 3: RG-PROV-04 uses full string match; validator flags both old (RG-PROV-02) and new (RG-PROV-04) sourceIds |
| Agent auto-generates claim sidecars without human review | RFC Implementation notes prohibit this; claim sidecar creation is a human review point in the mission workflow |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-16, DNA-24, or DNA-53, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0502 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the provenance footer block cannot be represented as a `markdown` block (DNA-24 conflict), escalate to a superseding RFC proposing a new block type.
- If `source.binding.validate` cannot be extended to scan article claim sidecars without breaking existing behavior, escalate to a separate RFC for the scanner extension.
