---
rfcId: RFC-0494
planId: PLAN-RFC-0494-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0494

## 1. Objectives

- [ ] Objective 1 — `expand.ts` loads `surface/cities/{lang}/*.md` and merges into city axis data for axes with `provider: geo.cities` (maps to acceptance criterion 1)
- [ ] Objective 2 — `bakePage` depth-4 specialization for `website-local` consumes `uniqueIntro`, `uniqueFaq`, `localEvidence` (maps to acceptance criterion 2)
- [ ] Objective 3 — `bake-helpers.ts` gains `uniqueFaqList` and `localEvidenceList` helpers (maps to acceptance criterion 3)
- [ ] Objective 4 — `surface.doorway-risk.report` passes for city pages with complete city records (maps to acceptance criterion 4)
- [ ] Objective 5 — Sites without `surface/cities/{lang}/` produce identical depth-4 pages (maps to acceptance criterion 5)
- [ ] Objective 6 — Compass `CHANGE_SUMMARY` blocks updated in all three modified files (maps to DNA-42)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/surface-expand/expand.ts` — add supplementary content collection loading for geo-provider axes (lines 152-163, inside the `for (const l of genLangs)` loop)
- `packages/os/site-kernel-checks/src/surface-expand/bake.ts` — add depth-4 `website-local` specialization in `bakePage` (before the generic bake path, after the depth-1 dossier check at line 373)
- `packages/os/site-kernel-checks/src/surface-expand/bake-helpers.ts` — add `uniqueFaqList` and `localEvidenceList` helper functions (after `citySpecificQaList` at line 353)
- `packages/os/site-kernel-checks/src/tests/surface-doorway-risk.test.ts` — existing tests already cover the doorway-risk report; verify they still pass

### 2.2 Configuration and data

- `packages/ontology/blueprints/website-local.yaml` — read-only reference (city axis already declares `provider: geo.cities`)
- `missions/*/workpiece/src/content/surface/cities/{lang}/*.md` — new city content records (operator-authored, not agent-authored)

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — update the surface-expand module description to mention city content loading
- RFC file `docs/rfcs/rfc-0494-city-content-collection-for-depth-4-local-context.md` — read-only reference

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck the modified package
- `pnpm --filter @gogol/site-kernel-checks run test` — run unit tests
- `pnpm exec site-kernel run surface.doorway-risk.report --site warpgogol-com` — verify doorway-risk report (when city records exist)

## 3. Step sequence

### Step 1. Add `uniqueFaqList` and `localEvidenceList` helpers to `bake-helpers.ts`

**Goal:** Create the two new helper functions that extract city-level content fields from axis-value data, analogous to existing `citySpecificQaList` and `localFactList`.

**Agent actions:**

- Add `uniqueFaqList(values: Array<Record<string, unknown>>): Array<{ question: string; answer: string }>` — extracts `uniqueFaq` from the first axis-value that has it (same pattern as `citySpecificQaList`, but reads from `valuesDeepFirst` axis data, not `recordValues`). Filters to complete Q&A pairs.
- Add `localEvidenceList(values: Array<Record<string, unknown>>): string[]` — extracts `localEvidence` string array from the first axis-value that has it (same pattern as `stringList`, but for the `localEvidence` field specifically).
- Update the `CHANGE_SUMMARY` Compass block with `<item>RFC-0494: add uniqueFaqList and localEvidenceList helpers for city content fields.</item>`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes.

**Completion criterion:** Both helpers are exported from `bake-helpers.ts` and typecheck passes.

**Human review:** no

---

### Step 2. Add supplementary content collection loading to `expand.ts`

**Goal:** For any axis with `universe: { provider: geo.cities }` (or any geo-provider axis), `expand.ts` additionally loads the supplementary content collection derived from the provider name and merges content fields into the geo-provided axis data.

**Agent actions:**

- In the `for (const l of genLangs)` loop (lines 150-165), after the `if ("provider" in axis.universe)` branch that sets `perAxis.set(axis.id, new Map(result.entries.map(...)))`, add the supplementary content merge:
  - Derive the collection name from the provider name: `axis.universe.provider.split(".").pop()` (e.g. `"geo.cities"` → `"cities"`).
  - Call `loadDataset(ctx.appDir, collectionName, l)` to load content records.
  - For each content entry whose slug matches a geo entry, shallow-merge: `geoMap.set(ce.slug, { ...existing, ...ce.data })`.
- The merge is inside the existing per-language loop, so each language gets its own content records merged.
- Update the `CHANGE_SUMMARY` Compass block with `<item>RFC-0494: merge supplementary content collection for geo-provider axes.</item>`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes.
- Verify that the existing `loadDataset` import from `expand-helpers.ts` is already present (it is, line 40).

**Completion criterion:** `expand.ts` loads `surface/cities/{lang}/*.md` when the directory exists and merges content fields into geo axis data. Typecheck passes.

**Human review:** no

---

### Step 3. Add depth-4 city specialization to `bakePage` in `bake.ts`

**Goal:** `bakePage` gains a depth-4 `website-local` specialization that consumes `uniqueIntro` (hero lead replacement), `uniqueFaq` (separate md blocks after demand-record `citySpecificQa` blocks), and `localEvidence` (separate `listCards` block after demand-record `localFacts` block).

**Agent actions:**

- In `bakePage`, after the depth-1 dossier check (line 373) and before the generic bake path (line 375), add a depth-4 `website-local` check:
  - If `entry.surfaceId === "website-local" && entry.depth === 4`, proceed with the depth-4 specialization.
  - Load city axis data via `valData(ctx, "city", entry.axes.city, lang)` — this now contains merged geo + content fields.
  - Read `uniqueIntro` from city data. If present, it replaces the hero lead (`description` slot in the hero block).
  - Read `uniqueFaq` via the new `uniqueFaqList` helper. Emit as separate `md` blocks after the existing `citySpecificQa` blocks.
  - Read `localEvidence` via the new `localEvidenceList` helper. Emit as a separate `listCards` block after the existing `localFacts` block.
  - The rest of the generic bake path (focus, decision, scenarios, pitfalls, trust, practical, teasers, CTA) remains unchanged — the specialization only overrides the hero lead and inserts two new block sequences.
- The specialization can be inline in `bakePage` (like the depth-0 and depth-1 specializations) — no separate function needed. The key change is: (1) compute `uniqueIntro` and use it as the hero `description` when present, (2) compute `uniqueFaq`/`localEvidence` lists and insert their blocks at the right positions.
- Import `uniqueFaqList` and `localEvidenceList` from `./bake-helpers.ts`.
- Update the `CHANGE_SUMMARY` Compass block with `<item>RFC-0494: depth-4 city specialization — uniqueIntro hero lead, uniqueFaq md blocks, localEvidence listCards block.</item>`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes.
- `pnpm --filter @gogol/site-kernel-checks run test` — existing tests pass.

**Completion criterion:** `bakePage` produces depth-4 pages with city-specific hero lead, FAQ blocks, and evidence blocks when city content records exist. Typecheck and tests pass.

**Human review:** no

---

### Step 4. Add unit tests for the new helpers and depth-4 specialization

**Goal:** Verify that the new helpers extract fields correctly and that the depth-4 specialization produces the expected blocks.

**Agent actions:**

- Add tests to `packages/os/site-kernel-checks/src/tests/surface-doorway-risk.test.ts` or a new test file `surface-expand-city-content.test.ts`:
  - Test `uniqueFaqList` with valid data, empty data, and partial Q&A pairs.
  - Test `localEvidenceList` with valid data, empty data, and non-string entries.
  - Test that `bakePage` for a depth-4 `website-local` entry with city content produces: hero with `uniqueIntro` as description, `md` blocks for `uniqueFaq` items after `citySpecificQa` blocks, and a `listCards` block for `localEvidence` after `localFacts` block.
  - Test that `bakePage` for a depth-4 `website-local` entry without city content produces the same output as before (regression test for graceful degradation).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run test` — all tests pass.

**Completion criterion:** New tests pass and cover both the presence and absence of city content fields.

**Human review:** no

---

### Step 5. Update AGENTS.md and verify acceptance criteria

**Goal:** Synchronize documentation artifacts, verify all acceptance criteria, and request human operator to stamp the RFC as implemented.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md` — add a note about the city content collection loading in the surface-expand module description.
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0494` — verify RFC still passes validation.
- Run `pnpm --filter @gogol/site-kernel-checks run build:check` — final typecheck.
- Run `pnpm --filter @gogol/site-kernel-checks run test` — final test run.
- Check off acceptance criteria in the RFC:
  - [x] `expand.ts` loads `surface/cities/{lang}/*.md` and merges into city axis data (evidence: `expand.ts` code)
  - [x] `bakePage` depth-4 specialization consumes `uniqueIntro`, `uniqueFaq`, `localEvidence` (evidence: `bake.ts` code)
  - [x] `bake-helpers.ts` gains `uniqueFaqList` and `localEvidenceList` (evidence: `bake-helpers.ts` code)
  - [ ] `surface.doorway-risk.report` passes for city pages with complete city records — requires runtime verification with actual city records (operator-authored content)
  - [x] Sites without `surface/cities/{lang}/` produce identical depth-4 pages (evidence: regression test in step 4)
  - [ ] `content.references.validate` and `content.voice.lint` pass — requires runtime verification with actual city records
  - [x] `rfc.validate` passes on this file (evidence: command output)
- **DO NOT stamp RFC or plan status as `implemented`** — request the human operator to run `rfc.implement.stamp --id RFC-0494 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0494`
- All typecheck and test commands pass.

**Completion criterion:** All documentation artifacts in scope are updated; all verifiable acceptance criteria are checked off; agent has requested the human operator to perform the `accepted → implemented` transition.

**Human review:** yes — the `accepted → implemented` transition requires human architecture review (RFC-0224). The operator verifies remaining runtime acceptance criteria (doorway-risk report, content validators) and runs `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0494`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-checks run test`
- `pnpm exec site-kernel run surface.doorway-risk.report --site warpgogol-com` (runtime, requires city records)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0494` in the subject line (RFC-0265 commit hygiene)
- Test output demonstrating depth-4 specialization with and without city content

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Implicit loading magic | Step 2 derives collection name from provider name (`geo.cities` → `cities`), documented in code comments and this plan |
| Slug mismatch between geo and content | Step 2 silently skips non-matching slugs; doorway-risk report (existing) flags missing fields — no new mitigation needed |
| Content authoring burden | Out of scope for implementation — operator authors city records incrementally |
| Agent misinterpretation (LLM content) | RFC implementation notes prohibit LLM-generated content; agents only implement code changes in steps 1-4 |
| Accidental geo-field override | Step 2 shallow merge lets content win; operators should review city records before authoring |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 or DNA-53, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0494 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the supplementary content loading causes a performance regression in `surface.generate`, profile the `loadDataset` calls and consider caching the collection across languages (but do not change the design without a follow-up RFC).
