---
rfcId: RFC-0519
planId: PLAN-RFC-0519-01
status: draft
owner: architecture
createdAt: 2026-07-24
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-checks
  services: []
  docs:
    - docs/verification-plan.xml
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0519

## 1. Objectives

- [ ] Objective 1 — Create `gate.catalog.generate` command that produces `docs/gate-catalog.generated.yaml` from live command registrations and pipeline placement (acceptance criterion 1)
- [ ] Objective 2 — Create `gate.catalog.validate` command that drift-checks the catalog against live state (acceptance criterion 2)
- [ ] Objective 3 — Wire `gate.catalog.validate` into `PACKAGES_CHECK_PIPELINE` after `workspace.surface.validate` (acceptance criterion 3)
- [ ] Objective 4 — Catalog entries include all fields: command, severity, phase, pipelines, conditional, surfaces, rules, blocks, metadata status, RFC provenance (acceptance criterion 4)
- [ ] Objective 5 — Commands without `gate` metadata appear with `metadata: absent` and produce GATE-CAT-03 warnings (acceptance criterion 5)
- [ ] Objective 6 — `ecosystem.manifest.generate` includes `docs/gate-catalog.generated.yaml` in source hashes (acceptance criterion 6)
- [ ] Objective 7 — `pnpm --filter @gogol/site-kernel-checks run build:check` passes (acceptance criterion 7)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/gate-catalog.ts` — **new file**: `runGateCatalogGenerate`, `runGateCatalogValidate`, `GateCatalogEntry`, `GateCatalog` interfaces, gate discovery, phase priority, deduplication
- `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts` — register both commands
- `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` — add `gate.catalog.validate` step after `workspace.surface.validate`
- `packages/os/site-kernel-checks/src/ecosystem/manifest.ts` — add `docs/gate-catalog.generated.yaml` to `collectSourceHashes()` source paths
- `packages/os/site-kernel-checks/src/workspace-write-boundary.ts` — add `gate.catalog.generate` to `SHARED_WRITE_ALLOWLIST`
- `docs/gate-catalog.generated.yaml` — **new generated artifact**

### 2.2 Configuration and data

- `docs/gate-catalog.generated.yaml` — generated catalog (YAML, deterministic, sorted by command name)

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — add `src/gate-catalog.ts` module entry
- `docs/verification-plan.xml` — add `gate.catalog.validate` to `PACKAGES_CHECK_PIPELINE` verification surface

### 2.4 Validation and pipelines

- `PACKAGES_CHECK_PIPELINE` — new step after `workspace.surface.validate`
- `SHARED_WRITE_ALLOWLIST` — new entry for `gate.catalog.generate`
- `ecosystem.manifest.generate` source hashes — new entry

## 3. Step sequence

### Step 1. TypeScript contracts and gate discovery logic

**Goal:** Create `gate-catalog.ts` with interfaces, discovery logic, phase priority, deduplication.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/gate-catalog.ts`
- Define `GateCatalogEntry` and `GateCatalog` interfaces per RFC TypeScript contracts
- Implement gate discovery via `listRegisteredKernelCommands()` from `@gogol/site-kernel`
- Implement pipeline scanning: `SITES_CHECK_AUTHOR_PIPELINE`, `SITES_CHECK_POSTBUILD_PIPELINE`, `PACKAGES_CHECK_PIPELINE`, `MISSION_PREFLIGHT_CRITICAL`, `MISSION_PREFLIGHT_WARNING` — deduplicate by command name, record all pipelines
- Implement phase priority: `release > mission > postbuild > author > workspace`
- Implement `metadata: "present" | "absent"` discriminator
- Implement RFC provenance lookup from `docs/ecosystem.generated.yaml` `commandProvenance`
- Use `@gogol/fingerprint` (`byteHash`) for content/source hashes (DNA-53)
- Use `writeFileAtomic` from `@gogol/site-kernel` for catalog write

**Validation:** `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** `gate-catalog.ts` exists with all interfaces and discovery logic, typecheck passes.

**Human review:** no

---

### Step 2. Command handlers — generate and validate

**Goal:** Implement `runGateCatalogGenerate` and `runGateCatalogValidate`.

**Agent actions:**

- Implement `runGateCatalogGenerate`: read live registrations, scan pipelines, build deterministic catalog, compute contentHash, write via `writeFileAtomic`, support `--json`
- Implement `runGateCatalogValidate`: read committed catalog, rebuild expected, compare hashes (GATE-CAT-02), check missing file (GATE-CAT-01), GATE-CAT-03/04/05 warnings, support `--json`
- Handle edge case: empty catalog (valid with `total: 0`)

**Validation:** `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** Both handlers implemented, typecheck passes, `--json` shape matches RFC.

**Human review:** no

---

### Step 3. Command registration and pipeline wiring

**Goal:** Register commands, wire pipeline, add write boundary entry.

**Agent actions:**

- In `command-tables/20-ecosystem.ts`: add `gate.catalog.generate` (mutatesState, writes, cacheable: false) and `gate.catalog.validate` entries
- In `pipelines/packages-check.ts`: add `{ command: "gate.catalog.validate" }` after `workspace.surface.validate` (line 82)
- In `workspace-write-boundary.ts`: add `SharedWriteEntry` for `gate.catalog.generate` to `SHARED_WRITE_ALLOWLIST`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec werkstatt run command.manifest.validate`
- `pnpm exec werkstatt run workspace.write.boundary.lint`

**Completion criterion:** Commands registered, pipeline step added, write boundary entry added, all validations pass.

**Human review:** no

---

### Step 4. Ecosystem manifest source hash integration

**Goal:** Add `docs/gate-catalog.generated.yaml` to ecosystem manifest source hashes.

**Agent actions:**

- In `ecosystem/manifest.ts`: add `"docs/gate-catalog.generated.yaml"` to `sourcePaths` in `collectSourceHashes()`
- Run `pnpm exec werkstatt run ecosystem.manifest.generate`
- Commit updated `docs/ecosystem.generated.yaml`

**Validation:**

- `pnpm exec werkstatt run ecosystem.manifest.validate`
- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `docs/gate-catalog.generated.yaml` in ecosystem manifest sources, `ecosystem.manifest.validate` passes.

**Human review:** no

---

### Step 5. Initial catalog generation

**Goal:** Produce the initial `docs/gate-catalog.generated.yaml`.

**Agent actions:**

- Run `pnpm exec werkstatt run gate.catalog.generate`
- Verify catalog structure: `meta.schemaVersion: 1`, `meta.deterministic: true`, `meta.contentHash` populated, `gates` sorted by command name, `summary.total` > 0, `summary.withoutMetadata` > 0
- Run `pnpm exec werkstatt run gate.catalog.validate` — should pass with expected GATE-CAT-03 warnings
- Commit `docs/gate-catalog.generated.yaml`

**Validation:** `pnpm exec werkstatt run gate.catalog.validate` — passes (0 errors, expected warnings)

**Completion criterion:** Catalog exists, is valid, `gate.catalog.validate` passes.

**Human review:** no

---

### Step 6. Unit tests

**Goal:** Add unit tests for generator and validator.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/gate-catalog.test.ts` (or per existing convention)
- Test cases: generate produces valid catalog, deduplicates commands in multiple pipelines, correct phase priority, marks missing metadata as `absent`, empty catalog edge case, deterministic hash, validate GATE-CAT-01..05, passes when fresh

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run test`
- `pnpm exec werkstatt run test.signal.validate`

**Completion criterion:** All tests pass, test signal classified as real.

**Human review:** no

---

### Step 7. Documentation sync

**Goal:** Update `AGENTS.md` and Compass XML.

**Agent actions:**

- In `packages/os/site-kernel-checks/AGENTS.md`: add module table entry for `src/gate-catalog.ts`
- In `docs/verification-plan.xml`: add `gate.catalog.validate` to `PACKAGES_CHECK_PIPELINE` verification surface
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed
- Commit documentation changes

**Validation:**

- `pnpm exec werkstatt run ecosystem.manifest.validate`
- `pnpm exec werkstatt run workspace.surface.validate`

**Completion criterion:** `AGENTS.md` includes `gate-catalog.ts`, `docs/verification-plan.xml` includes `gate.catalog.validate`, all validations pass.

**Human review:** no

---

### Final Step. Acceptance criteria verification and RFC stamping

**Goal:** Verify all acceptance criteria, stamp RFC as implemented.

**Agent actions:**

- Verify each RFC acceptance criterion against implemented code
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0519`
- Run `pnpm --filter @gogol/site-kernel-checks run build:check`
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0519 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0519`
- Every file in `scope.docs` is updated or documented as not-applicable

**Completion criterion:** All acceptance criteria checked off, RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0519`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec werkstatt run gate.catalog.validate`
- `pnpm exec werkstatt run ecosystem.manifest.validate`
- `pnpm exec werkstatt run workspace.write.boundary.lint`
- `pnpm exec werkstatt run command.manifest.validate`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0519.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0519` in the subject line (RFC-0265)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Catalog staleness | Step 3 wires `gate.catalog.validate` into `PACKAGES_CHECK_PIPELINE` — drift is caught on every packages check |
| GATE-CAT-03 noise (~200 warnings) | Step 5 verifies warnings are expected and non-blocking; GATE-CAT-03 is warning mode by design |
| Phase mismatch false positives | Step 1 implements full priority order `release > mission > postbuild > author > workspace`; catalog lists all pipelines |
| Pipeline double-counting | Step 1 implements deduplication by command name across all scanned pipelines |
| Empty catalog edge case | Step 2 handles empty catalog as valid with `total: 0` |
| Concurrent execution race | Step 1 uses `writeFileAtomic` (required by `SHARED_WRITE_ALLOWLIST`) — prevents partial writes |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-53 (fingerprint governance), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0519 --reason "..." --invariant "DNA-53"` instead of working around it.
- If `listRegisteredKernelCommands()` does not expose `gate` metadata (RFC-0518 not yet implemented), escalate — RFC-0518 is a hard prerequisite.
