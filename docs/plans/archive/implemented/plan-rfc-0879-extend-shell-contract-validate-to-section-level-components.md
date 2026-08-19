---
rfcId: RFC-0879
planId: PLAN-RFC-0879-01
status: draft
owner: architecture
createdAt: 2026-08-19
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0879

## 1. Objectives

- [ ] O1 — Fix pre-existing path bugs in `walkAstroSections`, `walkSectionManifests`, and `sectionSlugOf` (maps to acceptance criteria: path bug fixes)
- [ ] O2 — Add `walkSectionLevelComponents()` helper to `shared.ts` (maps to AC: `walkSectionLevelComponents()` helper added)
- [ ] O3 — Add `UTILITY_COMPONENT_SLUGS` allow-list with 11 pure sub-component entries (maps to AC: allow-list added)
- [ ] O4 — Update `runSectionShellContractValidate` in `shell.ts` to scan both sections and section-level components (maps to AC: scans both `sections/` and `components/`)
- [ ] O5 — Write unit tests for component scanning: pass, fail, not-registered, utility-allow-listed (maps to AC: 4 unit tests)
- [ ] O6 — Update `packages/werkstatt-site/AGENTS.md` with note about component-level shell enforcement (maps to AC: AGENTS.md updated)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/section-framework/shared.ts` — fix `walkAstroSections` path, fix `walkSectionManifests` path, fix `sectionSlugOf` regex, add `UTILITY_COMPONENT_SLUGS`, add `walkSectionLevelComponents()`
- `packages/werkstatt-site/src/checks/section-framework/shell.ts` — update `runSectionShellContractValidate` to merge section + component file lists
- `packages/werkstatt-site/src/checks/tests/section-shell-component-scan.test.ts` — new unit test file

### 2.2 Configuration and data

- `packages/werkstatt-site/src/domain/ontology/archetypes/index.yaml` — read-only (no changes)

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — add note to Check commands section about expanded `section.shell.contract.validate` scope
- `docs/verification-plan.xml` — check if new verification method entry needed (likely not — same command, expanded scope)

### 2.4 Validation and pipelines

- `PACKAGES_CHECK_PIPELINE` — no change needed (`section.shell.contract.validate` already registered at line 103 of `packages-check.ts`)
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck
- `pnpm --filter @warpgogol/werkstatt-site run test` — unit tests

## 3. Step sequence

### Step 1. Fix pre-existing path bugs in shared.ts

**Goal:** Correct the `walkAstroSections`, `walkSectionManifests`, and `sectionSlugOf` functions that currently point to non-existent `ui/src/sections/` path.

**Agent actions:**

- Fix `walkAstroSections` (line 95): remove extra `"src"` from path — change `"ui", "src", "sections"` to `"ui", "sections"`
- Fix `walkSectionManifests` (line 100): same path fix — remove extra `"src"`
- Fix `sectionSlugOf` (line 85): change regex from `packages\/ui\/src\/sections\/` to `packages\/werkstatt-site\/src\/domain\/ui\/sections\/`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- Manual: `walkAstroSections` returns non-empty array when called with workspace root

**Completion criterion:** `walkAstroSections` and `walkSectionManifests` point to `packages/werkstatt-site/src/domain/ui/sections/` (no extra `src/`); `sectionSlugOf` regex matches actual file paths.

**Human review:** no

---

### Step 2. Add UTILITY_COMPONENT_SLUGS and walkSectionLevelComponents to shared.ts

**Goal:** Add the utility allow-list and the new component-scanning helper function.

**Agent actions:**

- Add `UTILITY_COMPONENT_SLUGS` set with 11 entries: `brand-label`, `copyright`, `currency-selector`, `lang-switcher`, `layout`, `not-found`, `live-photo`, `material-credit`, `responsive-image`, `scroll-to-top`, `social-meta`
- Add `walkSectionLevelComponents(workspaceRoot: string): Promise<string[]>` function:
  - Collect all `.astro` files from `packages/werkstatt-site/src/domain/ui/components/`
  - Read archetype index from `packages/werkstatt-site/src/domain/ontology/archetypes/index.yaml`
  - Parse YAML, filter entries with `layer: component` and `sourceFile` containing `/components/`
  - Extract directory names from `sourceFile` paths (e.g. `not-found` from `components/not-found.yaml`)
  - Filter component files: include only those whose directory matches a registered directory AND is not in `UTILITY_COMPONENT_SLUGS`
  - Catch `readFile` errors → return empty (IO-01 failure mode)
- Add `import { readFile } from "node:fs/promises"` to imports

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** `UTILITY_COMPONENT_SLUGS` exported from `shared.ts`; `walkSectionLevelComponents` function exported and returns filtered file list.

**Human review:** no

---

### Step 3. Update runSectionShellContractValidate in shell.ts

**Goal:** Merge section files and component files into a single scan list.

**Agent actions:**

- Import `walkSectionLevelComponents` from `./shared.ts`
- Replace `const files = await walkAstroSections(context.workspaceRoot)` with:
  ```ts
  const sectionFiles = await walkAstroSections(context.workspaceRoot);
  const componentFiles = await walkSectionLevelComponents(context.workspaceRoot);
  const files = [...sectionFiles, ...componentFiles];
  ```
- The existing `isUtilitySection(rel)` check remains — it only matches section paths, not component paths, so component files won't be falsely skipped

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- `pnpm --filter @warpgogol/werkstatt-site run test` passes

**Completion criterion:** `runSectionShellContractValidate` scans both `sections/` and section-level `components/` in a single pass.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Create unit tests covering the four acceptance criteria test cases.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/section-shell-component-scan.test.ts`
- Test 1: Component with `<SectionShell>` passes — create temp `.astro` file in a registered component directory (e.g. `nachweis-list/`), verify no SHELL-01 violation
- Test 2: Component without `<SectionShell>` fails with SHELL-01 — create temp `.astro` with bare `<section>`, verify SHELL-01 violation
- Test 3: Pure sub-component not in archetype registry is not scanned — create temp `.astro` in an unregistered directory (e.g. `effect-host/`), verify it's not in the file list
- Test 4: Registered sub-component in `UTILITY_COMPONENT_SLUGS` is not scanned — create temp `.astro` in `responsive-image/` directory, verify it's excluded
- Use mocking for `workspaceRoot` pointing to a temp directory with minimal fixture structure

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- section-shell-component-scan` passes

**Completion criterion:** All 4 test cases pass.

**Human review:** no

---

### Step 5. Update packages/werkstatt-site/AGENTS.md

**Goal:** Document the expanded scope of `section.shell.contract.validate`.

**Agent actions:**

- Add a note in the Check commands section of `packages/werkstatt-site/AGENTS.md` stating that `section.shell.contract.validate` now also scans section-level components in `packages/werkstatt-site/src/domain/ui/components/` filtered by the archetype registry, with `UTILITY_COMPONENT_SLUGS` allow-list exclusions

**Validation:**

- File modified, no broken markdown

**Completion criterion:** `packages/werkstatt-site/AGENTS.md` mentions component-level shell enforcement.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, stamp RFC as implemented.

**Agent actions:**

- Verify `packages/werkstatt-site/AGENTS.md` updated (step 5)
- Check `docs/verification-plan.xml` — likely no change needed (same command, expanded scope), document if not applicable
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against implemented code. Mark `[x]` with inline `(evidence: <file:line>)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0879 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0879`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts updated; code review passed; all acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0879`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0879` in the subject line
- Test file `packages/werkstatt-site/src/checks/tests/section-shell-component-scan.test.ts`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Performance: YAML parsing on every invocation | Step 2: YAML parsed once per invocation, not per file |
| False positives for utility components | Step 2: `UTILITY_COMPONENT_SLUGS` with 11 entries |
| Archetype index missing | Step 2: try/catch returns empty, IO-01 warning |
| Pre-existing path bug masks the real scan | Step 1: fix path bugs first, before adding component scanning |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-8 or DNA-37, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0879 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the archetype index schema changes during implementation, stop and update the RFC before proceeding.
