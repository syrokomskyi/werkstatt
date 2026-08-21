---
rfcId: RFC-0916
planId: PLAN-RFC-0916-01
status: draft
owner: architecture
createdAt: 2026-08-21
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-shared
    - packages/werkstatt-site
  services: []
  docs:
    - packages/werkstatt-shared/AGENTS.md
---

# Implementation Plan: RFC-0916

## 1. Objectives

- [ ] Create `utility-registry.yaml` with slug utility entry — maps to acceptance criterion [registry created]
- [ ] Implement `utility.provenance.validate` command — maps to acceptance criterion [command registered]
- [ ] Register command in `command-tables/infra-contracts.ts` — maps to acceptance criterion [command registered]
- [ ] Add command to `PACKAGES_CHECK_PIPELINE` with `--mode warning` — maps to acceptance criterion [pipeline registered]
- [ ] Unit tests for all three violation types + allowlist — maps to acceptance criteria [UTIL-PROV-01/02/03 tests]
- [ ] `build:check` passes with new command in pipeline — maps to acceptance criterion [build:check passes]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-shared/src/share/utility-registry.yaml` — Created: utility registry
- `packages/werkstatt-site/src/checks/utility-provenance.ts` — Created: validator implementation
- `packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts` — Modified: register command
- `packages/werkstatt-site/src/checks/pipelines/packages-check.ts` — Modified: add to pipeline
- `packages/werkstatt-site/src/checks/tests/utility-provenance.test.ts` — Created: unit tests

### 2.2 Configuration and data

- `packages/werkstatt-shared/src/share/utility-registry.yaml` — registry with slug utility entry

### 2.3 Documentation and specs

- `packages/werkstatt-shared/AGENTS.md` — document registry location and utility addition process

### 2.4 Validation and pipelines

- `PACKAGES_CHECK_PIPELINE` — new entry after `fingerprint.usage.lint`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.validate --id RFC-0916`

## 3. Step sequence

### Step 1. Create utility registry

**Goal:** Create the YAML registry file with the slug utility entry.

**Agent actions:**

- Create `packages/werkstatt-shared/src/share/utility-registry.yaml` with:
  - `id: slug`
  - `canonicalPath: packages/werkstatt-shared/src/share/slug/`
  - `forbiddenImports`: `@sindresorhus/slugify`, `cyrillic-to-translit-js`, `github-slugger`
  - `functionNames`: `slugify`, `toSlug`, `makeSlug`, `createSlug`, `slugUrl`, `slugId`
  - `patterns`: NFKD normalize + diacritic strip + non-alphanumeric replace regex
  - `allowlist`: canonical slug module path, legacy extract.ts during migration

**Validation:**

- File exists and is valid YAML (parse with `js-yaml` or equivalent)

**Completion criterion:** Registry file created with slug entry.

**Human review:** no

---

### Step 2. Implement validator

**Goal:** Create the `utility.provenance.ts` validator following the `fingerprint.usage.lint` pattern.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/utility-provenance.ts`
- Implement `runUtilityProvenanceValidate(input, context)` function:
  - Load `utility-registry.yaml` from `packages/werkstatt-shared/src/share/`
  - If registry missing or invalid YAML: emit `UTIL-REG-01` error, exit 1
  - For each `patterns[].regex`: validate regex compiles; if invalid: emit `UTIL-REG-02` error, exit 1
  - Collect all `packages/**/*.ts` files (reuse `collectFiles` from existing checks)
  - For each file:
    - Skip if inside any `canonicalPath` or matches `allowlist` entry
    - Check for `forbiddenImports` in import/require statements → `UTIL-PROV-01`
    - Check for `functionNames` in function declarations/const assignments → `UTIL-PROV-02`
    - Check for `patterns[].regex` matches → `UTIL-PROV-03`
  - Apply `--mode` flag: `warning` (default) → severity "warning", exit 0; `fail` → severity "error", exit 1
  - Return `diagnosticsResult("utility.provenance.validate", diagnostics)`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** Validator compiles and exports `runUtilityProvenanceValidate`.

**Human review:** no

---

### Step 3. Register command in command table

**Goal:** Add `utility.provenance.validate` to the infra-contracts command table.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts`:
  - Import `runUtilityProvenanceValidate` from `../utility-provenance.ts`
  - Add command entry:
    ```typescript
    {
      name: "utility.provenance.validate",
      description: "Scan packages/**/*.ts for reimplemented canonical utilities (RFC-0916, DNA-88). Use --mode warning (default) or --mode fail.",
      scope: "workspace",
      flags: {
        mode: {
          kind: "string",
          default: "warning",
          description: "Diagnostic mode: warning or fail.",
        },
      },
      reads: ["packages/**/*.ts", "packages/werkstatt-shared/src/share/utility-registry.yaml"],
      execute: runUtilityProvenanceValidate,
    },
    ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- Command appears in `ALL_COMMANDS` (via `INFRA_CONTRACTS_COMMANDS` aggregation)

**Completion criterion:** Command registered and visible in command table.

**Human review:** no

---

### Step 4. Add to PACKAGES_CHECK_PIPELINE

**Goal:** Wire the validator into the pipeline.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/pipelines/packages-check.ts`:
  - Add `{ command: "utility.provenance.validate", args: ["--mode", "warning"] }` after `{ command: "fingerprint.usage.lint", args: ["--mode", "warning"] }`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- `pnpm exec werkstatt run utility.provenance.validate --mode warning` — runs without crash

**Completion criterion:** Pipeline includes the new command in warning mode.

**Human review:** no

---

### Step 5. Unit tests

**Goal:** Test all three violation types, allowlist, and clean file scenarios.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/utility-provenance.test.ts`
- Test cases:
  1. **UTIL-PROV-01 (import)**: file with `import slugify from "@sindresorhus/slugify"` outside canonical path → violation
  2. **UTIL-PROV-02 (name)**: file with `function slugify(value: string)` outside canonical path → violation
  3. **UTIL-PROV-03 (pattern)**: file with `.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")` outside canonical path → violation
  4. **Allowlist**: file matching allowlist entry with forbidden import → no violation
  5. **Canonical path**: file inside `canonicalPath` with forbidden import → no violation
  6. **Clean file**: file with no slug-related code → no violation
  7. **--mode warning**: violations have severity "warning", exit 0
  8. **--mode fail**: violations have severity "error", exit 1
  9. **UTIL-REG-01**: missing registry file → error, exit 1
  10. **UTIL-REG-02**: invalid regex in registry → error, exit 1

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- --grep "utility-provenance"` — all tests pass

**Completion criterion:** All 10 test cases pass.

**Human review:** no

---

### Step 6. Update AGENTS.md

**Goal:** Document the registry location and utility addition process.

**Agent actions:**

- In `packages/werkstatt-shared/AGENTS.md`:
  - Add "Utility registry" section documenting:
    - Location: `packages/werkstatt-shared/src/share/utility-registry.yaml`
    - How to add a new canonical utility: add entry with `id`, `canonicalPath`, `forbiddenImports`, `functionNames`, `patterns`, `allowlist`
    - Rule: agents MUST check the registry before creating new utility functions
    - Enforcement: `utility.provenance.validate` in `PACKAGES_CHECK_PIPELINE`

**Validation:**

- AGENTS.md contains registry documentation

**Completion criterion:** AGENTS.md updated with registry section.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, stamp as implemented.

**Agent actions:**

- Verify `packages/werkstatt-shared/AGENTS.md` has registry section
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`, re-run `fo-review` (max 3 iterations)
- Check off acceptance criteria: verify each criterion against implemented code, mark `[x]` with `(evidence: <file:line>)`
- Stamp the RFC: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0916 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0916`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All documentation updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0916`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run utility.provenance.validate --mode warning`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0916` in the subject line
- `docs/rfcs/verification/rfc-0916.generated.json` (if acceptance probes declared — none in this RFC)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives from pattern detection | Step 5 — allowlist test case; Step 1 — allowlist entries with reasons |
| Invalid regex crashes validator | Step 2 — catch regex compilation, emit UTIL-REG-02; Step 5 — test case |
| Performance (scanning all packages/**/*.ts) | Step 4 — reuse existing `collectFiles` pattern from fingerprint lint |
| Agent workarounds (renamed functions) | Step 1 — pattern-based detection catches underlying logic; import detection catches direct package imports |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0916 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the validator produces excessive false positives that cannot be mitigated with allowlists, stop and assess whether the pattern-based detection strategy needs revision (this may require an amending RFC).
