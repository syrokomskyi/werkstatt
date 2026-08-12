---
rfcId: RFC-0815
planId: PLAN-RFC-0815-01
status: draft
owner: architecture
createdAt: 2026-08-12
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0815

## 1. Objectives

- [ ] O1 — Create `template.peer-deps.validate` check command that resolves the template's dependency tree and validates peer dependency constraints — maps to acceptance criterion "command registered"
- [ ] O2 — Emit `PEER-01` violations when a peer constraint is violated, `PEER-02` for missing template, `PEER-03` for resolution failure — maps to acceptance criterion "PEER-01 violation emitted"
- [ ] O3 — Strip `workspace:*` dependencies before resolution — maps to acceptance criterion "workspace:* dependencies stripped"
- [ ] O4 — Integrate into `SITES_BUILD_CHECK_PIPELINE` after `template.deps.drift` — maps to acceptance criterion "integrated into pipeline"
- [ ] O5 — Document `--json` output format — maps to acceptance criterion "output format documented"
- [ ] O6 — Update `packages/werkstatt-site/AGENTS.md` with check documentation — maps to acceptance criterion "AGENTS.md updated"
- [ ] O7 — Unit tests covering workspace:* stripping, peer violation detection, and pass case — maps to acceptance criterion "existing template passes"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/template-peer-deps-validate.ts` — **new** validator implementation
- `packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts` — add `template.peer-deps.validate` entry to `ECOSYSTEM_COMMANDS`
- `packages/werkstatt-site/src/checks/pipelines/build-check.ts` — add `{ command: "template.peer-deps.validate" }` after `template.deps.drift`
- `packages/werkstatt-site/src/checks/diagnostics/rules/governance.ts` — register `PEER-01`, `PEER-02`, `PEER-03` rule IDs

### 2.2 Configuration and data

- No configuration files changed. The command reads `packages/werkstatt-site/src/onboarding/templates/package.template.json` (existing).

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — add `template.peer-deps.validate` to "Check commands" section
- RFC file is read-only reference (`docs/rfcs/rfc-0815-...md`)

### 2.4 Validation and pipelines

- `SITES_BUILD_CHECK_PIPELINE` in `packages/werkstatt-site/src/checks/pipelines/build-check.ts` — new step after `template.deps.drift`
- Unit tests in `packages/werkstatt-site/src/checks/tests/template-peer-deps-validate.test.ts`

## 3. Step sequence

### Step 1. Register PEER rule IDs in governance diagnostics

**Goal:** Register the three new rule IDs so diagnostics are traceable.

**Agent actions:**

- Add `PEER-01`, `PEER-02`, `PEER-03` entries to the `RULES` object in `packages/werkstatt-site/src/checks/diagnostics/rules/governance.ts`, following the existing `rule(id, description, command)` pattern.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles without errors.

**Completion criterion:** Three new rule IDs registered with descriptions and command association `template.peer-deps.validate`.

**Human review:** no

---

### Step 2. Implement `template.peer-deps.validate` check command

**Goal:** Create the validator that reads the template, strips `workspace:*` deps, resolves the dependency tree via `pnpm install --dry-run`, extracts peer dependencies, and checks constraints.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/template-peer-deps-validate.ts`.
- Follow the pattern from `template-deps-drift.ts`: MODULE_CONTRACT header, imports from `@warpgogol/werkstatt/kernel`, `diagnosticsResult` from `./result-helpers.ts`, `TEMPLATES_DIR` from `../onboarding/templates.ts`.
- Implement `runTemplatePeerDepsValidate(input, context)`:
  1. Read `--site` flag (required, same as `template.deps.drift`).
  2. Read `package.template.json` from `TEMPLATES_DIR`. Emit `PEER-02` if missing.
  3. Parse JSON, extract `dependencies` + `devDependencies`.
  4. Filter out `workspace:*` entries — these are monorepo-internal.
  5. Create a temp directory in `os.tmpdir()` with prefix `peer-deps-validate-`.
  6. Write a minimal `package.json` with only the filtered deps.
  7. Run `pnpm install --dry-run --strict-peer-dependencies --ignore-scripts --json` in the temp dir via `child_process.execFile`. The `--strict-peer-dependencies` flag makes pnpm exit non-zero on any unsatisfied peer dep. `--ignore-scripts` prevents lifecycle script execution in the temp dir.
  8. If pnpm exits 0: all peer deps satisfied, return pass result.
  9. If pnpm exits non-zero: parse stderr/stdout for peer dep violation messages. Extract package name, required range, and required-by from the output. Emit `PEER-01` for each violation.
  10. If pnpm fails due to registry/network error (not peer dep issue): emit `PEER-03` (warning, exit 0).
  11. Clean up temp directory in `finally` block.
- No `semver` package dependency needed — pnpm does the peer dep checking via `--strict-peer-dependencies`.
- Export `PeerDepsValidateData` interface matching the RFC's TypeScript contracts.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles.

**Completion criterion:** `template-peer-deps-validate.ts` exists, exports `runTemplatePeerDepsValidate`, compiles without errors.

**Human review:** no

---

### Step 3. Register command in command table

**Goal:** Add `template.peer-deps.validate` to the `ECOSYSTEM_COMMANDS` array so it is auto-registered by `createStandardCheckModule`.

**Agent actions:**

- Add import of `runTemplatePeerDepsValidate` to `packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts`.
- Add a new `CheckCommandEntry` to `ECOSYSTEM_COMMANDS` after the `template.deps.drift` entry:
  - `name: "template.peer-deps.validate"`
  - `description: "Validate peer dependency constraints in package.template.json (RFC-0815)."`
  - `scope: "app"`
  - `flags: { site: { kind: "string", required: false, description: "Site id for pipeline context." } }`
  - `reads: ["packages/werkstatt-site/src/onboarding/templates/package.template.json"]`
  - `execute: runTemplatePeerDepsValidate`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles.
- `pnpm exec werkstatt run command.manifest.validate` — command manifest is valid.

**Completion criterion:** Command entry added, compiles, manifest validates.

**Human review:** no

---

### Step 4. Integrate into `SITES_BUILD_CHECK_PIPELINE`

**Goal:** Add the check to the build-check pipeline after `template.deps.drift`.

**Agent actions:**

- Add `{ command: "template.peer-deps.validate" }` to `SITES_BUILD_CHECK_PIPELINE` in `packages/werkstatt-site/src/checks/pipelines/build-check.ts`, immediately after the `template.deps.drift` entry.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles.

**Completion criterion:** Pipeline step added after `template.deps.drift`.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Cover workspace:* stripping, peer violation detection, pass case, and resolution failure.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/template-peer-deps-validate.test.ts`.
- Test cases:
  1. _*workspace:* stripping_* — mock template with `workspace:*` deps, verify they are excluded from the temp `package.json`.
  2. **PEER-01 violation** — mock `execFile` to return non-zero exit with peer dep conflict message in stderr, verify `PEER-01` diagnostic emitted, exit code 1.
  3. **Pass case** — mock `execFile` to return exit 0 (all peer deps satisfied), verify exit code 0, zero diagnostics.
  4. **PEER-02 missing template** — mock template file missing, verify `PEER-02` error.
  5. **PEER-03 resolution failure** — mock `execFile` to fail with network/registry error (not peer dep), verify `PEER-03` warning, exit code 0.
- Mock `child_process.execFile` and `node:fs/promises` to avoid real pnpm/registry calls.
- Follow the `vi.mock` path convention: paths are relative to the test file.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- --run template-peer-deps-validate` — all tests pass.

**Completion criterion:** All 5 test cases pass.

**Human review:** no

---

### Step 6. Update AGENTS.md documentation

**Goal:** Document the new check command in the package AGENTS.md.

**Agent actions:**

- Add a bullet entry to the "Check commands" section of `packages/werkstatt-site/AGENTS.md`, after the `template.deps.drift` entry:
  - `template.peer-deps.validate` (RFC-0815) — validates peer dependency constraints in `package.template.json` by resolving the dependency tree and checking all peer deps are satisfied. Emits `PEER-01` (peer constraint violated), `PEER-02` (template missing), `PEER-03` (resolution failed, warning). Integrated into `SITES_BUILD_CHECK_PIPELINE`.

**Validation:**

- Visual inspection — entry is present and follows the existing format.

**Completion criterion:** AGENTS.md updated with `template.peer-deps.validate` documentation.

**Human review:** no

---

### Step 7. Validate and verify acceptance criteria

**Goal:** Run all validation checks and verify every acceptance criterion.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0815` — must pass.
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass.
- Run `pnpm --filter @warpgogol/werkstatt-site run test -- --run template-peer-deps-validate` — must pass.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surface changed.
- Check off each acceptance criterion in the RFC with evidence annotations.

**Validation:**

- All commands exit 0.

**Completion criterion:** All validation commands pass; all acceptance criteria checked off with evidence.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/werkstatt-site/AGENTS.md` is updated (Step 6).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surface changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0815 --implementation-commit <sha>` to transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0815`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0815`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test -- --run template-peer-deps-validate`
- `pnpm exec werkstatt run command.manifest.validate` (if command manifest drift detected)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0815` in the subject line
- Unit test file at `packages/werkstatt-site/src/checks/tests/template-peer-deps-validate.test.ts`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives from optional peer dependencies | Step 2: skip optional peers not in template's dep set |
| Registry availability (offline CI) | Step 2: emit `PEER-03` warning, exit 0 |
| Performance (5-10s per site) | Step 4: pipeline placement after `template.deps.drift` — idempotent, acceptable cost |
| `workspace:*` deps break resolution | Step 2: strip `workspace:*` before creating temp `package.json` |
| Temp directory cleanup | Step 2: `try/finally` with `os.tmpdir()` prefix `peer-deps-validate-` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0815 --reason "..." --invariant "DNA-N"` instead of working around it.
