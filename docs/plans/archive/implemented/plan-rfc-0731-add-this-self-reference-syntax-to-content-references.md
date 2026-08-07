---
rfcId: RFC-0731
planId: PLAN-RFC-0731-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/share"
    - "@warpgogol/site-kernel-content"
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/pbp"
    - "@warpgogol/ui"
    - "@warpgogol/site-kernel-codegen"
  services: []
  docs:
    - packages/share/AGENTS.md
---

# Implementation Plan: RFC-0731

## 1. Objectives

- [ ] O1 — Add `SourceRef` interface and `sourceRef` optional parameter to `resolveReference`, `resolveReferencesInString`, `resolveReferencesDeep` in `@warpgogol/share/content-reference` — maps to acceptance criterion [1]
- [ ] O2 — Add `sourceRef` optional parameter to `resolveFormula` in `@warpgogol/share/formula-eval`; expand `this.` before `REF_IN_FORMULA_PATTERN` matching — maps to acceptance criterion [2]
- [ ] O3 — Implement `this.` expansion logic: `this.field.path` → `${sourceRef.collection}.${sourceRef.file}.field.path` before index lookup — maps to acceptance criterion [3]
- [ ] O4 — Emit REF-12 when `this.` is used without `sourceRef`; emit REF-13 when expanded field path is not found — maps to acceptance criteria [4, 5]
- [ ] O5 — Update `content.references.validate` to recognize `this.` references, derive `sourceRef` from file path, validate with REF-12/REF-13 — maps to acceptance criterion [6]
- [ ] O6 — Update all call sites to pass `sourceRef` from entity context — maps to acceptance criterion [7]
- [ ] O7 — Add unit tests for `this.` in plain references, formulas, pipe-formatted expressions, REF-12, REF-13 — maps to acceptance criteria [8, 9]
- [ ] O8 — Verify existing absolute references continue to resolve without behavior change — maps to acceptance criterion [10]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/content-reference.ts` — add `SourceRef` interface, `sourceRef` parameter to 3 functions, `this.` pre-expansion logic
- `packages/share/src/formula-eval.ts` — add `sourceRef` parameter to `resolveFormula`, `this.` pre-expansion before `REF_IN_FORMULA_PATTERN`
- `packages/os/site-kernel-content/src/semantic-loader.ts` — pass `sourceRef` at 4 call sites (lines 214, 232, 395, 412)
- `packages/pbp/src/semantic-model.ts` — pass `sourceRef` at 2 call sites (lines 84, 106)
- `packages/share/src/astro/page-handler/semantic.ts` — pass `sourceRef` at 1 call site (line 137)
- `packages/share/src/astro/content.ts` — pass `sourceRef` at 1 call site (line 142)
- `packages/ui/src/sections/markdown/prose-pipeline.ts` — pass `sourceRef` at 2 call sites (lines 112, 137)
- `packages/ui/src/components/section-body/rich/section-rich.astro` — pass `sourceRef` at 1 call site (line 74)
- `packages/os/site-kernel-codegen/src/material-metadata-write.ts` — pass `sourceRef` at 1 call site (line 277)
- `packages/os/site-kernel-checks/src/content-references.ts` — recognize `this.` references, derive `sourceRef` from file path, validate with REF-12/REF-13

### 2.2 Configuration and data

- No configuration changes. The `ContentRefIndex` format is unchanged.

### 2.3 Documentation and specs

- `packages/share/AGENTS.md` — update `@warpgogol/share/content-reference` and `@warpgogol/share/formula-eval` entry points to document `SourceRef` type and `sourceRef` parameter

### 2.4 Validation and pipelines

- `content.references.validate` in `build.check` — automatically validates `this.` references after implementation; no pipeline wiring change needed

## 3. Step sequence

### Step 1. Add `SourceRef` type and `this.` expansion to `@warpgogol/share/content-reference`

**Goal:** Add the `SourceRef` interface, `sourceRef` optional parameter to `resolveReference`, `resolveReferencesInString`, `resolveReferencesDeep`, and implement `this.` pre-expansion logic.

**Agent actions:**

- Add `export interface SourceRef { collection: string; file: string; }` to `packages/share/src/content-reference.ts`
- Add `sourceRef?: SourceRef` parameter to `resolveReference` signature
- In `resolveReference`: before matching `REF_PATTERN`, check if `ref` starts with `this.`. If so, expand to `${sourceRef.collection}.${sourceRef.file}.` + remainder. If `sourceRef` is not provided, return `{ value: undefined, resolved: false, error: "REF-12: this. reference used without sourceRef context" }`
- Add `sourceRef?: SourceRef` parameter to `resolveReferencesInString` signature
- In `resolveReferencesInString`: before `PURE_REF_PATTERN.test(text)`, check if text starts with `this.` and expand. Also update `BRACELESS_SCAN_PATTERN` scanning to detect `this.` prefixes and expand before resolving. Pass `sourceRef` through to `resolveReference` and `resolveFormula` calls
- Add `sourceRef?: SourceRef` parameter to `resolveReferencesDeep` signature
- In `resolveReferencesDeep`: pass `sourceRef` through to `resolveReferencesInString` via the `substituteRefsDeep` callback
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding

**Validation:**

- `pnpm --filter @warpgogol/share run build:check` — TypeScript compiles
- Existing tests pass: `pnpm --filter @warpgogol/share run test`

**Completion criterion:** `SourceRef` interface exported, all 3 functions accept `sourceRef`, `this.` pre-expansion works in `resolveReference`, existing tests pass without behavior change.

**Human review:** no

---

### Step 2. Add `sourceRef` to `resolveFormula` in `@warpgogol/share/formula-eval`

**Goal:** Add `sourceRef` parameter to `resolveFormula` and expand `this.` before `REF_IN_FORMULA_PATTERN` matching.

**Agent actions:**

- Add `sourceRef?: SourceRef` parameter to `resolveFormula` signature (import `SourceRef` type from `./content-reference.ts`)
- In `resolveFormula`: before scanning `arithmeticExpr` with `REF_IN_FORMULA_PATTERN`, expand any `this.` prefixed references using `sourceRef`. If `this.` is found but `sourceRef` is not provided, return `{ value: "", resolved: false, error: "REF-12: this. reference used without sourceRef context" }`
- The expansion: for each candidate match starting with `this.`, replace with `${sourceRef.collection}.${sourceRef.file}.` + remainder before resolution
- Pass `sourceRef` through to `resolveReference` calls within `resolveFormula`
- Update `CHANGE_SUMMARY` scaffolding

**Validation:**

- `pnpm --filter @warpgogol/share run build:check` — TypeScript compiles
- Existing formula-eval tests pass: `pnpm --filter @warpgogol/share run test`

**Completion criterion:** `resolveFormula` accepts `sourceRef`, `this.` references in formula expressions are expanded before pattern matching, existing tests pass.

**Human review:** no

---

### Step 3. Add unit tests for `this.` references

**Goal:** Add comprehensive unit tests covering `this.` in plain references, formulas, pipe-formatted expressions, REF-12, and REF-13.

**Agent actions:**

- In `packages/share/src/tests/content-ref-index.test.ts`, add tests:
  - `resolveReference` with `this.` prefix and `sourceRef` — resolves to same-file field
  - `resolveReference` with `this.` prefix but no `sourceRef` — returns REF-12
  - `resolveReference` with `this.` prefix, `sourceRef` provided, but field not found — returns REF-13
  - `resolveReferencesInString` with `this.` in embedded text — resolves correctly
  - `resolveReferencesInString` with `this.` as pure reference — resolves correctly
  - `resolveReferencesDeep` with `this.` in nested object — resolves correctly
  - Regression: existing absolute references still resolve without behavior change
- In `packages/share/src/tests/formula-eval.test.ts`, add tests:
  - `resolveFormula` with `this.` in arithmetic expression — resolves correctly
  - `resolveFormula` with `this.` as single-ref string interpolation `=(this.field)` — resolves to string value
  - `resolveFormula` with `this.` and pipe formatter `=(this.field | money currency=EUR)` — resolves with formatting
  - `resolveFormula` with `this.` but no `sourceRef` — returns REF-12

**Validation:**

- `pnpm --filter @warpgogol/share run test` — all new and existing tests pass

**Completion criterion:** All `this.` test cases pass; REF-12 and REF-13 error codes verified; regression tests confirm absolute references unchanged.

**Human review:** no

---

### Step 4. Update `content.references.validate` in `@warpgogol/site-kernel-checks`

**Goal:** Update the validator to recognize `this.` references, derive `sourceRef` from file path, and validate with REF-12/REF-13.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/content-references.ts`:
  - Add a `THIS_PATTERN` to detect `this.` prefixed references: `/\bthis\.([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)\b/g`
  - Add a function `deriveSourceRef(relativeFile: string, index: ContentRefIndex): SourceRef | null` that:
    - Extracts collection from path: first directory after `src/content/`
    - Extracts file slug: path after language directory, minus `.md` extension
    - Returns `{ collection, file }` or `null` if path doesn't match expected structure
  - In the main validation loop, after `BRACELESS_PATTERN` scanning, scan for `THIS_PATTERN` matches
  - For each `this.` reference: derive `sourceRef` from `doc.relativeFile`, call `resolveReference(index, expandedRef, inferredLang, defaultLang, sourceRef)`, report REF-12 if no sourceRef, REF-13 if field not found
  - Also scan for `this.` inside `=(...)` formula expressions and pass `sourceRef` to `resolveFormula`
  - Update `CHANGE_SUMMARY` scaffolding

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — TypeScript compiles
- `pnpm exec site-kernel run content.references.validate --app warpgogol-com` — passes (no `this.` refs in content yet, but validator doesn't crash)

**Completion criterion:** Validator recognizes `this.` references, derives `sourceRef` from file path, emits REF-12/REF-13 errors, existing absolute reference validation unchanged.

**Human review:** no

---

### Step 5. Update all call sites to pass `sourceRef`

**Goal:** Update all 12 call sites across 7 files to pass `sourceRef` from entity context.

**Agent actions:**

- `packages/os/site-kernel-content/src/semantic-loader.ts` (4 call sites):
  - `loadSiteSemanticProfile` (lines 214, 232): pass `sourceRef` derived from `business.company`, `business.legal`, `business.contact` file context
  - `createFsSemanticReader.getPageFrontmatter` (line 395): pass `sourceRef` from `{ collection: "pages", file: pageIdToContentFileSlug(pageId) }`
  - `createFsSemanticReader.getProseBody` (line 412): pass `sourceRef` from `{ collection: "prose", file: proseSlug }`
- `packages/pbp/src/semantic-model.ts` (2 call sites, lines 84, 106): pass `sourceRef` from page context `{ collection: "pages", file: slug }`
- `packages/share/src/astro/page-handler/semantic.ts` (1 call site, line 137): pass `sourceRef` from block context — derive from page's collection and file slug
- `packages/share/src/astro/content.ts` (1 call site, line 142): pass `sourceRef` from entity context — derive from the content entry's collection and slug
- `packages/ui/src/sections/markdown/prose-pipeline.ts` (2 call sites, lines 112, 137): pass `sourceRef` from prose context `{ collection: "prose", file: proseSlug }`
- `packages/ui/src/components/section-body/rich/section-rich.astro` (1 call site, line 74): pass `sourceRef` from prose entry context
- `packages/os/site-kernel-codegen/src/material-metadata-write.ts` (1 call site, line 277): pass `sourceRef` from material credit file context

For each call site: if the entity context (collection + file slug) is available, pass it. If not available (e.g. generic string resolution without entity context), pass `undefined` — `this.` references will produce REF-12, which is the correct fail-safe behavior.

**Validation:**

- `pnpm --filter @warpgogol/share run build:check`
- `pnpm --filter @warpgogol/site-kernel-content run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/ui run build:check`
- `pnpm --filter @warpgogol/site-kernel-codegen run build:check`

**Completion criterion:** All call sites pass `sourceRef` from entity context where available; TypeScript compiles across all packages; existing tests pass.

**Human review:** no

---

### Step 6. Update documentation and run final validation

**Goal:** Update `packages/share/AGENTS.md` to document `SourceRef` and `sourceRef` parameter, run full validation suite, review and fix, stamp implemented.

**Agent actions:**

- Update `packages/share/AGENTS.md`:
  - `@warpgogol/share/content-reference` entry: add `SourceRef` to exports list, note `sourceRef` optional parameter
  - `@warpgogol/share/formula-eval` entry: note `sourceRef` optional parameter and `this.` expansion support
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0731`
- Run `pnpm --filter @warpgogol/share run test` — all tests pass
- Run `pnpm --filter @warpgogol/share run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- Run `pnpm exec site-kernel run content.references.validate --app warpgogol-com` — passes
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0731 --implementation-commit <sha>` to transition `accepted → implemented`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0731`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0731`
- `pnpm --filter @warpgogol/share run build:check`
- `pnpm --filter @warpgogol/share run test`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-content run build:check`
- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/ui run build:check`
- `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- `pnpm exec site-kernel run content.references.validate --app warpgogol-com`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0731` in the subject line (RFC-0265 commit hygiene)
- No acceptance probes declared (commented out in frontmatter) — `rfc.verification.emit` will produce no evidence file, which is expected behavior

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Agent misinterpretation — `this.` in cross-file contexts | Step 4: validator derives `sourceRef` from file path, not author intent; REF-13 catches field-not-found |
| Pattern collision — `this` as English word | Step 1: `this.` only recognized when followed by dotted field path pattern; prose "this" unaffected |
| Call site coverage — missed call sites produce REF-12 | Step 5: all 12 call sites across 7 files enumerated and updated; REF-12 is fail-safe |
| REF-10 error code collision with RFC-0729 | Steps 1-2: use REF-12/REF-13 instead of REF-10/REF-11 |
| Performance — negligible | Step 1: single string prefix check before existing resolution path |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-4, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0731 --reason "..." --invariant "DNA-4"` instead of working around it.
