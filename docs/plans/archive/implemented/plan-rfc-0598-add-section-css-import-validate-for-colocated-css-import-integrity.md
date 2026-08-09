---
rfcId: RFC-0598
planId: PLAN-RFC-0598-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
    - docs/COMMANDS.md
---

# Implementation Plan: RFC-0598

## 1. Objectives

- [ ] O1 — Implement `runSectionCssImportValidate` validator with CSS-IMPORT-01 and CSS-NAME-01 rules — maps to acceptance criterion [command registered + rules implemented]
- [ ] O2 — Register `section.css.import.validate` in `08-section-framework.ts` command table — maps to acceptance criterion [command registered with scope: workspace]
- [ ] O3 — Add pipeline entry to `PACKAGES_CHECK_PIPELINE` after `section.shell.contract.validate` — maps to acceptance criterion [Command added to PACKAGES_CHECK_PIPELINE]
- [ ] O4 — Write unit tests covering both rules + cross-import exemption + no-.astro exemption — maps to acceptance criterion [Unit test in src/tests/css-import-validate.test.ts]
- [ ] O5 — Update `AGENTS.md` module table + `docs/COMMANDS.md` — maps to acceptance criterion [AGENTS.md update note in RFC file-system table]
- [ ] O6 — Verify `--json` output follows `KernelCommandResult` shape — maps to acceptance criterion [--json output follows standard shape]
- [ ] O7 — Run `fo-review` + `fo-fix` on all session code changes — maps to final step

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/section-framework/css-import.ts` — **new** validator module (`runSectionCssImportValidate`)
- `packages/os/site-kernel-checks/src/section-framework/shared.ts` — add `walkCssFiles` + `walkAllAstroFiles` helpers (or inline in `css-import.ts`)
- `packages/os/site-kernel-checks/src/command-tables/08-section-framework.ts` — add command entry + import
- `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` — add `{ command: "section.css.import.validate" }` after `section.shell.contract.validate`
- `packages/os/site-kernel-checks/src/tests/css-import-validate.test.ts` — **new** test file

### 2.2 Configuration and data

None — no YAML/JSON/manifest changes.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — add module table row for `src/section-framework/css-import.ts`
- `docs/COMMANDS.md` — regenerate via `pnpm exec site-kernel run docs.commands.generate` (if command docs are generated; otherwise manual entry)
- `docs/ecosystem.generated.yaml` — regenerate via `pnpm exec site-kernel run ecosystem.manifest.generate` (if command surface changed)

### 2.4 Validation and pipelines

- `PACKAGES_CHECK_PIPELINE` — new entry after `section.shell.contract.validate` (line ~101 in `packages-check.ts`)
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — must pass
- `pnpm exec site-kernel run rfc.validate RFC-0598` — must pass

## 3. Step sequence

### Step 1. Implement validator module `css-import.ts`

**Goal:** Create the core validator with CSS-IMPORT-01 and CSS-NAME-01 rules.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/section-framework/css-import.ts`
- Import `collectFiles` from `@warpgogol/share/fs`, `relative` from `node:path`, `ok`/`fail`/`Violation`/`CheckResult` from `./shared.ts`
- Implement `runSectionCssImportValidate(input, context)`:
  - Scan `packages/ui/src/sections/**/*.css` and `packages/ui/src/components/**/*.css` via `collectFiles`
  - Scan `packages/ui/src/sections/**/*.astro` and `packages/ui/src/components/**/*.astro` via `collectFiles`
  - For each `.css` file, read all `.astro` files and search for `import ".*<css-filename>"` (regex on raw text, not AST — CSS imports are side-effect imports not parsed by the Astro compiler frontmatter analysis)
  - **CSS-IMPORT-01**: if no `.astro` file contains an import of the `.css` filename, emit violation `{ rule: "CSS-IMPORT-01", file: <css-rel-path>, message: "CSS file '<name>' is not imported by any .astro file in packages/ui/src/" }`
  - **CSS-NAME-01**: for each `.css` file, check if a `.astro` file exists in the same directory. If yes, compare filenames (minus extension). If they don't match, emit violation `{ rule: "CSS-NAME-01", file: <css-rel-path>, astroFile: <astro-rel-path>, message: "CSS filename '<css-name>' does not match colocated .astro filename '<astro-name>'" }`. If no `.astro` exists in the same directory, skip CSS-NAME-01 for that file.
  - Return `ok("section.css.import.validate")` if no violations, `fail(...)` otherwise

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — TypeScript compiles
- Manual: `pnpm exec site-kernel run section.css.import.validate --json` — exits 0 (all current CSS files are imported)

**Completion criterion:** Validator module compiles and passes on current codebase.

**Human review:** no

---

### Step 2. Register command in `08-section-framework.ts`

**Goal:** Add the command table entry so the kernel can dispatch `section.css.import.validate`.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/command-tables/08-section-framework.ts`:
  - Add import: `import { runSectionCssImportValidate } from "../section-framework/css-import.ts";`
  - Add entry after `section.image.contract.validate` (before `tokens.colors.section-shell.lint`):
    ```ts
    {
      name: "section.css.import.validate",
      description:
        "Validate every colocated .css file under packages/ui/src/sections/ and packages/ui/src/components/ is imported by at least one .astro file (CSS-IMPORT-01) and that .css filename matches colocated .astro filename (CSS-NAME-01).",
      scope: "workspace",
      flags: {},
      supportsAllSites: true,
      reads: [
        "packages/ui/src/sections/**/*.css",
        "packages/ui/src/sections/**/*.astro",
        "packages/ui/src/components/**/*.css",
        "packages/ui/src/components/**/*.astro",
      ],
      execute: runSectionCssImportValidate,
    },
    ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — compiles
- `pnpm exec site-kernel run command.manifest.validate` — no manifest drift

**Completion criterion:** Command appears in manifest, `command.manifest.validate` passes.

**Human review:** no

---

### Step 3. Add to `PACKAGES_CHECK_PIPELINE`

**Goal:** Wire the validator into the autonomous package quality gate.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/pipelines/packages-check.ts`:
  - Add `{ command: "section.css.import.validate" }` after `{ command: "section.image.contract.validate" }` (line ~106)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — compiles
- `pnpm exec site-kernel run workspace.surface.validate` — pipeline surface represented

**Completion criterion:** Pipeline entry exists, `workspace.surface.validate` passes.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Cover both rules, the cross-import exemption, and the no-.astro exemption.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/css-import-validate.test.ts`
- Test cases:
  1. **CSS-IMPORT-01 pass**: `.css` file imported by colocated `.astro` → no violations
  2. **CSS-IMPORT-01 fail**: `.css` file not imported by any `.astro` → violation
  3. **CSS-IMPORT-01 cross-import**: `.css` file imported by `.astro` in a different directory → no violations
  4. **CSS-NAME-01 pass**: `foo-section.css` + `foo-section.astro` in same directory → no violations
  5. **CSS-NAME-01 fail**: `bar.css` + `foo-section.astro` in same directory → violation
  6. **CSS-NAME-01 no-.astro exemption**: `.css` file in directory with no `.astro` → CSS-NAME-01 skipped, CSS-IMPORT-01 still checked
  7. **Multiple .css in one directory**: `effect-host.css` + `effect-text.css` + `effect-host.astro` → `effect-host.css` passes CSS-NAME-01, `effect-text.css` skipped (no matching `.astro` in same directory)
- Use `vitest` with mock filesystem or temp directories (follow existing test patterns in `src/tests/`)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests pass

**Completion criterion:** All 7 test cases pass.

**Human review:** no

---

### Step 5. Update documentation

**Goal:** Sync AGENTS.md module table and generated command docs.

**Agent actions:**

- In `packages/os/site-kernel-checks/AGENTS.md`, add row to the module table: `| src/section-framework/css-import.ts | runSectionCssImportValidate — CSS-IMPORT-01 (unimported .css) + CSS-NAME-01 (filename mismatch) |`
- Run `pnpm exec site-kernel run docs.commands.generate` to regenerate `docs/COMMANDS.md`
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` to regenerate `docs/ecosystem.generated.yaml`
- Run `pnpm exec site-kernel run gate.catalog.generate` to regenerate gate catalog

**Validation:**

- `pnpm exec site-kernel run docs.commands.validate` — no drift
- `pnpm exec site-kernel run ecosystem.manifest.validate` — no drift
- `pnpm exec site-kernel run gate.catalog.validate` — no drift

**Completion criterion:** All generated docs are in sync, validators pass.

**Human review:** no

---

### Step 6. Full validation suite

**Goal:** Run all required checks before stamping.

**Agent actions:**

- `pnpm exec site-kernel run rfc.validate RFC-0598`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec site-kernel run section.css.import.validate --json` — manual smoke test
- `pnpm exec site-kernel run command.reads.validate` — `reads` field declared
- `pnpm exec site-kernel run yaml.parse.validate` — no YAML errors

**Validation:**

- All commands exit 0

**Completion criterion:** Full validation suite passes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Run code review, fix findings, verify acceptance criteria, stamp as implemented.

**Agent actions:**

- Verify all `scope.docs` files are updated (AGENTS.md, COMMANDS.md, ecosystem.generated.yaml)
- Run `fo-review` via `skill` tool on all session code changes
- If findings, run `fo-fix` via `skill` tool; re-run `fo-review` (max 3 iterations)
- Check off acceptance criteria in RFC:
  - [x] Command registered in `08-section-framework.ts` with `scope: workspace`
  - [x] `runSectionCssImportValidate` implemented in `src/section-framework/css-import.ts`
  - [x] CSS-IMPORT-01 detects unimported `.css` files
  - [x] CSS-NAME-01 detects filename mismatches
  - [x] `ownership-block-section.astro` and `trust-strip-section.astro` already import CSS (verified)
  - [x] Command added to `PACKAGES_CHECK_PIPELINE`
  - [x] `--json` output follows `KernelCommandResult` shape
  - [x] Unit test covers both rules + cross-import exemption
  - [x] `rfc.validate` passes
- Commit acceptance criteria update
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0598 --implementation-commit <sha>`
- Commit stamp transition

**Validation:**

- `git status` — clean working tree
- `pnpm exec site-kernel run rfc.validate RFC-0598` — passes
- Review report in `docs/reviews/code/`

**Completion criterion:** RFC stamped as `implemented` via `rfc.implement.stamp`; all acceptance criteria checked off with evidence.

**Human review:** no — automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0598`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec site-kernel run command.manifest.validate`
- `pnpm exec site-kernel run docs.commands.validate`
- `pnpm exec site-kernel run ecosystem.manifest.validate`
- `pnpm exec site-kernel run gate.catalog.validate`
- `pnpm exec site-kernel run command.reads.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0598` in subject line (RFC-0265)
- Test output confirming all 7 test cases pass

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent adds `import "./section.css"` to fix CSS-IMPORT-01 without checking CSS content | Step 4 test case 2 verifies the validator catches the violation; agents fixing violations is the intended workflow |
| Naming convention drift (not formally DNA-level) | CSS-NAME-01 enforces naming without elevating to DNA — Step 4 tests verify enforcement |
| Performance (<50ms for ~60 files) | Validator reads raw text, not AST — negligible I/O; Step 6 smoke test confirms timing |

## 6. Escalation triggers

- If implementation reveals that CSS imports require AST-level parsing (not regex), create a follow-up RFC — the regex approach may produce false positives for commented-out imports.
- If `collectFiles` does not support the `packages/ui/src/components/**/*.css` glob, check whether a new helper is needed in `@warpgogol/share/fs`.
