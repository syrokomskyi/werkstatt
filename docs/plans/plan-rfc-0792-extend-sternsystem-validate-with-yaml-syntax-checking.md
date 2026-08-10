---
rfcId: RFC-0792
planId: PLAN-RFC-0792-01
status: draft
owner: architecture
createdAt: 2026-08-10
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - packages/werkstatt/src/sternsystem/sternsystem-validate.ts
    - packages/werkstatt/src/sternsystem/yaml-syntax-validate.test.ts
---

# Implementation Plan: RFC-0792

## 1. Objectives

- [ ] Objective 1 — Implement `validateYamlFiles` helper that scans top-level YAML files in `systems-cache/<id>/` and reports syntax errors (maps to acceptance criterion: `validateYamlFiles` helper implemented)
- [ ] Objective 2 — Wire `validateYamlFiles` into `runSternsystemValidate` per-system loop (maps to acceptance criterion: `sternsystem.validate` calls `validateYamlFiles` and reports `yaml-syntax-error` violations)
- [ ] Objective 3 — Unit tests covering valid YAML, broken YAML, no YAML files, and subdirectory exclusion (maps to acceptance criteria: 4 unit test criteria)
- [ ] Objective 4 — `rfc.validate` passes before merging (maps to acceptance criterion: `rfc.validate` passes)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/sternsystem/sternsystem-validate.ts` — add `validateYamlFiles` helper, call it inside the per-system loop after existing checks
- `packages/werkstatt/src/sternsystem/test-helpers.ts` — new file with shared test helpers extracted from `mirror-validate.test.ts`
- `packages/werkstatt/src/sternsystem/mirror-validate.test.ts` — update to import from `test-helpers.ts` instead of defining locally
- `packages/werkstatt/src/sternsystem/yaml-syntax-validate.test.ts` — new test file for YAML syntax validation

### 2.2 Configuration and data

None — no configuration files, schemas, or ontology catalogs are changed.

### 2.3 Documentation and specs

- `packages/werkstatt/src/sternsystem/sternsystem-validate.ts` `MODULE_CONTRACT` `CHANGE_SUMMARY` — add `RFC-0792` entry
- No `AGENTS.md` updates needed — the command surface does not change
- No `docs/*.xml` Compass sync needed — no repository-wide semantics change
- No `docs/architecture-dna.md` update needed — no new DNA invariant

### 2.4 Validation and pipelines

- `sternsystem.validate` is already called by `mission.validate` and `mission.close` — no pipeline wiring change needed
- No CI workflow changes needed

## 3. Step sequence

### Step 1. Implement `validateYamlFiles` helper

**Goal:** Add a pure helper function that scans top-level `.yaml`/`.yml` files in a directory and reports YAML parse errors.

**Agent actions:**

- Add `validateYamlFiles(cacheDir: string, systemId: string): Promise<Array<{ systemId: string; rule: string; message: string }>>` to `packages/werkstatt/src/sternsystem/sternsystem-validate.ts`
- Use `readdir` from `node:fs/promises` to read top-level directory entries (non-recursive)
- Filter for files matching `*.yaml` or `*.yml` (check `isFile()` via `stat`)
- For each file, read with `readFile`, parse with `parse as parseYaml` from `"yaml"` (already imported in `registry-io.ts`)
- On parse error, push `{ systemId, rule: "yaml-syntax-error", message: "${relativePath}: YAML syntax error: ${error.message}" }`
- Return violations array (empty if all files parse successfully)
- Add `RFC-0792` entry to `CHANGE_SUMMARY` in `MODULE_CONTRACT` header

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** `validateYamlFiles` function exists, is typed, and typecheck passes.

**Human review:** no

---

### Step 2. Wire helper into `runSternsystemValidate`

**Goal:** Call `validateYamlFiles` inside the per-system loop and push results into the existing `violations` array.

**Agent actions:**

- Inside `runSternsystemValidate`'s `for (const entry of systems)` loop, after the existing Bordbuch-vs-git-log check (last check before loop close), add:

```ts
// RFC-0792: YAML syntax checking for all top-level YAML files
const yamlViolations = await validateYamlFiles(cacheDir, entry.id);
violations.push(...yamlViolations);
```

- `cacheDir` is already resolved earlier in the loop as `resolveMirrors(workspaceRoot, entry).cachePath`
- No changes to the return shape — `violations` array already feeds into `SternsystemValidateData`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** `sternsystem.validate` calls `validateYamlFiles` for each system and `yaml-syntax-error` violations appear in the output.

**Human review:** no

---

### Step 3. Extract shared test helpers and write unit tests

**Goal:** Extract common test helpers from `mirror-validate.test.ts` into a shared file, then write YAML syntax validation tests.

**Agent actions:**

- Create `packages/werkstatt/src/sternsystem/test-helpers.ts` with the following extracted from `mirror-validate.test.ts`:
  - `makeInput(flags: Record<string, unknown>): KernelCommandInput`
  - `makeContext(root: string): KernelRuntimeContext`
  - `writeSystemConfig(root: string, mirrors: MirrorEntry[]): Promise<void>`
  - `BASE_SETUP` async function
  - `MirrorEntry` interface
- Update `mirror-validate.test.ts` to import these from `test-helpers.ts` instead of defining locally — remove the local definitions, add import statement
- Create `packages/werkstatt/src/sternsystem/yaml-syntax-validate.test.ts` importing from `test-helpers.ts`
- Test cases:
  1. **Valid YAML files → no violations**: create `systems-cache/test-site/` with valid `system-config.yaml` and valid `dns-records.yaml`, run validate, expect 0 `yaml-syntax-error` violations
  2. **Broken YAML file → `yaml-syntax-error` violation**: create `systems-cache/test-site/` with valid `system-config.yaml` and broken `dns-records.yaml` (bad indentation), run validate, expect 1 `yaml-syntax-error` violation with file name and error message in `message` field
  3. **No YAML files → no error**: create `systems-cache/test-site/` with only `system-config.yaml` (already created by `writeSystemConfig`), no other YAML files, run validate, expect 0 `yaml-syntax-error` violations
  4. **YAML file in subdirectory → not scanned**: create `systems-cache/test-site/subdir/broken.yaml` with broken YAML, run validate, expect 0 `yaml-syntax-error` violations (subdirectory files not scanned)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes
- `pnpm --filter @warpgogol/werkstatt run test` — all tests pass (existing mirror tests + new YAML syntax tests)

**Completion criterion:** All 4 test cases pass; existing mirror-validate tests still pass after helper extraction.

**Human review:** no

---

### Step 4. Validate and stamp

**Goal:** Run full validation suite, verify acceptance criteria, stamp RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck
- Run `pnpm --filter @warpgogol/werkstatt run test` — unit tests
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0792` — RFC validation
- Check off all acceptance criteria in the RFC with inline evidence
- Run `fo-review` on all session code changes
- Run `fo-fix` if review findings exist (max 3 iterations)
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0792 --implementation-commit <sha>` to transition `accepted → implemented`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0792` — passes
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0792`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0792` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives from YAML parser | Step 1 uses the same `yaml` npm package already used in `registry-io.ts` — parser behavior is consistent |
| Performance | Step 1 scans only top-level files (typically 2-3 per system) — negligible cost |
| Error message clarity | Step 1 includes file name and parser error text in `message` field |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44 or DNA-45, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0792 --reason "..." --invariant "DNA-N"` instead of working around it.
