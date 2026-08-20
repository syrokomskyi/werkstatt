---
rfcId: RFC-0893
planId: PLAN-RFC-0893-01
status: draft
owner: architecture
createdAt: 2026-08-20
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0893

## 1. Objectives

- [ ] Objective 1 — TypeScript types and validator implementation in `packages/werkstatt-site/src/checks/` (maps to acceptance criterion 1)
- [ ] Objective 2 — CLI command registered as `icon.references.validate` with scope `app` in command-tables file `31-public-surface.ts` (maps to acceptance criterion 2)
- [ ] Objective 3 — `--json` output format documented and stable (maps to acceptance criterion 3)
- [ ] Objective 4 — Integrated into `SITES_CHECK_AUTHOR_PIPELINE` after `public.icons.validate` (maps to acceptance criterion 4)
- [ ] Objective 5 — Unit tests cover: missing icon detected, existing icon passes, no icons passes, malformed config detected, empty `icons/gen/` emits ICON-REF-02 (maps to acceptance criterion 5)
- [ ] Objective 6 — `packages/werkstatt-site/AGENTS.md` and `docs/verification-plan.xml` updated (maps to acceptance criteria 6 and 7)
- [ ] Objective 7 — `rfc.validate` passes on RFC-0893 (maps to acceptance criterion 8)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/icon-references.ts` — **new file**: validator implementation (`runIconReferencesValidate`)
- `packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts` — add `icon.references.validate` command entry
- `packages/werkstatt-site/src/checks/index.ts` — export `runIconReferencesValidate`
- `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts` — add `{ command: "icon.references.validate" }` after `public.icons.validate` (line 249)
- `packages/werkstatt-site/src/checks/generator-ownership.ts` — add `icon.references.validate` to the non-generator validator list (if applicable)

### 2.2 Configuration and data

No configuration or data files need changes. The validator reads:
- `<app>/src/content/**/*.md` — YAML frontmatter parsed for `VendorIconConfig` objects
- `<app>/src/content/**/*.yaml` — standalone YAML parsed for `VendorIconConfig` objects
- `packages/werkstatt-site/src/domain/ui/icons/gen/**/*.astro` — available-icon index built from filesystem

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0893-add-icon-references-validate-command.md` — read-only reference
- `packages/werkstatt-site/AGENTS.md` — add `icon.references.validate` to notable check commands section
- `docs/verification-plan.xml` — add validator entry

### 2.4 Validation and pipelines

- `SITES_CHECK_AUTHOR_PIPELINE` — new step after `public.icons.validate` (line 249), before `not-found.validate` (line 250)
- No CI workflow changes needed

## 3. Step sequence

### Step 1. Implement validator types and logic

**Goal:** Create the `icon-references.ts` validator file with types, icon index builder, content scanner, and cross-reference logic.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/icon-references.ts`
- Define `IconReferenceViolation` interface with `rule: "ICON-REF-01" | "ICON-REF-02" | "ICON-REF-03"` union
- Define `IconReferencesValidateData` interface with `violations`, `checkedCount`, `availableIcons`
- Implement `buildAvailableIconIndex()`: scan `packages/werkstatt-site/src/domain/ui/icons/gen/` for `.astro` files, extract vendor/collection/name from path structure using `resolveIconFileName` logic from `icon-resolver.ts`
- Import `resolveIconFileName` from `@warpgogol/werkstatt-site/ui/icons/icon-resolver` (or the correct subpath export) to ensure build-time and runtime resolution consistency
- Implement `scanContentFiles()`: parse `src/content/**/*.md` frontmatter (YAML between `---` delimiters) and `src/content/**/*.yaml` standalone files; traverse parsed data tree for objects matching `{ vendor: string, collection: string, name: string }` shape; collect with file path and line number
- Implement `runIconReferencesValidate()`: orchestrate index build → scan → cross-reference; emit ICON-REF-01 for missing icons, ICON-REF-02 for missing/empty `icons/gen/`, ICON-REF-03 for malformed configs; use `passResult`/`failResult` from `result-helpers.ts`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` headers following existing conventions

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles with zero errors

**Completion criterion:** `icon-references.ts` exists, exports `runIconReferencesValidate`, and TypeScript compiles cleanly.

**Human review:** no

---

### Step 2. Register command in command-tables

**Goal:** Register `icon.references.validate` in the command table and export the validator.

**Agent actions:**

- Add `runIconReferencesValidate` to the import block in `packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts`
- Add command entry after `public.icons.validate` (line 104):
  ```ts
  {
    name: "icon.references.validate",
    description:
      "Validate that VendorIconConfig references in content resolve to generated icon components (RFC-0893).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.md", "<app>/src/content/**/*.yaml"],
    modulePaths: ["icon-references.ts"],
    execute: runIconReferencesValidate,
  },
  ```
- Add `export { runIconReferencesValidate } from "./icon-references.ts";` to `packages/werkstatt-site/src/checks/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles with zero errors

**Completion criterion:** Command appears in `PUBLIC_SURFACE_COMMANDS` array, validator is exported from `index.ts`.

**Human review:** no

---

### Step 3. Wire into SITES_CHECK_AUTHOR_PIPELINE

**Goal:** Add the validator to the author-time check pipeline.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts`, add `{ command: "icon.references.validate" }` after `{ command: "public.icons.validate" }` (line 249) and before `{ command: "not-found.validate" }` (line 250)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles with zero errors

**Completion criterion:** Pipeline step is present in `SITES_CHECK_AUTHOR_PIPELINE` at the correct position.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Create fixture-based unit tests covering all acceptance criterion scenarios.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/icon-references.test.ts`
- Test cases:
  1. **Missing icon detected**: content references `lordicon/doodle-outline/NonExistentIcon` → ICON-REF-01 error, exitCode 1
  2. **Existing icon passes**: content references a real icon from `icons/gen/` → pass, exitCode 0
  3. **No icon references found**: content with no `VendorIconConfig` → pass, `checkedCount: 0`
  4. **Malformed config detected**: content with `{ vendor: "lordicon", collection: "doodle-outline" }` (missing `name`) → ICON-REF-03 error
  5. **Empty icons/gen/ directory**: `icons/gen/` exists but has no `.astro` files → ICON-REF-02 warning, does not fail build
- Use `mkdtemp` + `writeFile` pattern from existing tests (see `content-references.test.ts`, `helpers.ts`)
- Mock or fixture the `icons/gen/` directory by creating a temp directory structure

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass

**Completion criterion:** All 5 test cases pass in vitest.

**Human review:** no

---

### Step 5. Update documentation

**Goal:** Update AGENTS.md and verification-plan.xml with the new command.

**Agent actions:**

- In `packages/werkstatt-site/AGENTS.md`, add to the "Check commands" section:
  ```
  - `icon.references.validate` (RFC-0893) — scans content markdown frontmatter and YAML block props for VendorIconConfig references and checks each against available generated icon components. Emits ICON-REF-01 (error, missing icon), ICON-REF-02 (warning, empty icons/gen/), ICON-REF-03 (error, malformed config). Integrated into `SITES_CHECK_AUTHOR_PIPELINE` after `public.icons.validate`.
  ```
- In `docs/verification-plan.xml`, add a validator entry for `icon.references.validate` following the existing pattern

**Validation:**

- Visual inspection of both files

**Completion criterion:** Both files contain the new command description.

**Human review:** no

---

### Step 6. Validate and run review

**Goal:** Run all validation checks, code review, and fix any findings.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0893 --json` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass with zero errors
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all tests must pass
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.

**Validation:**

- `rfc.validate` clean
- `build:check` clean
- All tests pass
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All validation green, review passed (findings fixed if any).

**Human review:** no

---

### Final Step. Stamp implemented

**Goal:** Verify acceptance criteria and stamp the RFC as implemented.

**Agent actions:**

- Check off each acceptance criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0893` (RFC-0330)
- Commit evidence file if produced
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0893 --implementation-commit <sha>` to transition `accepted → implemented`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0893`
- All acceptance criteria checked off

**Completion criterion:** RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0893`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0893` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0893.generated.json` — verification evidence (if acceptance probes declared)
- Commit messages referencing `RFC-0893` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| False positives from dynamic icon names in content | Step 4 test case 3 verifies no-icon content passes cleanly |
| Performance: scanning content files | Step 1 implementation is O(n) in content files + O(m) in icons; Step 4 tests verify < 1s execution |
| Empty `icons/gen/` directory | Step 4 test case 5 verifies ICON-REF-02 warning behavior |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-38, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0893 --reason "..." --invariant "DNA-38"` instead of working around it.
