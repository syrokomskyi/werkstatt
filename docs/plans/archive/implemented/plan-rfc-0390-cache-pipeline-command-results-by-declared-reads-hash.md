---
rfcId: RFC-0390
planId: PLAN-RFC-0390-01
status: draft
owner: architecture
createdAt: 2026-07-17
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel"
    - "@gogol/site-kernel-checks"
    - "@gogol/fingerprint"
  services: []
  docs:
    - docs/requirements.xml
    - docs/technology.xml
    - packages/os/site-kernel/AGENTS.md
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0390

## 1. Objectives

- [ ] O1 — Add `cacheable` to `KernelCommandMetadata` and update `reads` JSDoc (maps to acceptance criteria 1, 2)
- [ ] O2 — Create `command-result-cache.ts` module with hash computation and get/set helpers (maps to acceptance criterion 3)
- [ ] O3 — Add `picomatch` dependency to `@gogol/site-kernel` (maps to acceptance criterion 4)
- [ ] O4 — Integrate cache lookup/store into `executePipelineForSite` and `executePipelineForWorkspace` (maps to acceptance criteria 5, 6, 7, 8)
- [ ] O5 — Register `command.reads.validate` command and add to `PACKAGES_CHECK_PIPELINE` (maps to acceptance criteria 9, 10)
- [ ] O6 — Annotate all ~176 `SITES_CHECK_AUTHOR_PIPELINE` commands with `reads` or `cacheable: false` (maps to acceptance criterion 11)
- [ ] O7 — Annotate all `PACKAGES_CHECK_PIPELINE` commands with `reads` or `cacheable: false` (maps to acceptance criterion 12)
- [ ] O8 — Verify cache namespace visibility and clear command (maps to acceptance criteria 13, 14)
- [ ] O9 — Write unit tests for `command-result-cache.ts` (maps to acceptance criterion 15)
- [ ] O10 — Update Compass docs and AGENTS.md files (maps to acceptance criteria 17–20)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel/src/types.ts` — add `cacheable` to `KernelCommandMetadata`; update `reads` JSDoc; add `force?: boolean` to `ExecuteKernelPipelineOptions`
- `packages/os/site-kernel/src/cache/command-result-cache.ts` — new module: `COMMAND_RESULT_CACHE_NAMESPACE`, `COMMAND_RESULT_CACHE_SCHEMA_VERSION`, `CommandResultCacheKey`, `buildCommandResultCacheKey`, `computeInputsHash`, `computeModuleHash`, `getCachedCommandResult`, `setCachedCommandResult`
- `packages/os/site-kernel/src/runtime/execute-pipeline.ts` — integrate cache lookup/store in `executePipelineForSite` and `executePipelineForWorkspace`; respect `force` and `dryRun` flags
- `packages/os/site-kernel-checks/src/command-tables/*.ts` — add `reads` or `cacheable: false` to every command definition that lacks it
- `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` — add `command.reads.validate` step
- `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` (or new file) — register `command.reads.validate` command handler
- `packages/os/site-kernel/package.json` — add `picomatch` dependency
- `tools/kernel.config.ts` — no change needed (command.reads.validate is workspace-scoped, registered via module)

### 2.2 Configuration and data

- `.cache/kernel-cache.db` — `command_results` namespace created automatically by SQLite cache layer

### 2.3 Documentation and specs

- `packages/os/site-kernel/AGENTS.md` — extend "Kernel cache (RFC-0382)" section with command-result cache documentation
- `packages/os/site-kernel-checks/AGENTS.md` — document mandatory `reads`/`cacheable` contract for command authors
- `docs/requirements.xml` — add requirement entry for command-level result caching
- `docs/technology.xml` — add `picomatch` entry to tooling section

### 2.4 Validation and pipelines

- `PACKAGES_CHECK_PIPELINE` — gains `command.reads.validate` step
- `pnpm --filter @gogol/site-kernel run build:check` — must pass after type changes
- `pnpm --filter @gogol/site-kernel-checks run build:check` — must pass after command annotations
- Unit tests in `packages/os/site-kernel/src/cache/__tests__/command-result-cache.test.ts`

## 3. Step sequence

### Step 1. Add `cacheable` to `KernelCommandMetadata` and update `reads` JSDoc

**Goal:** Extend the type contract to support cacheable flag and document the new functional role of `reads`.

**Agent actions:**

- Add `cacheable?: boolean` to `KernelCommandMetadata` in `packages/os/site-kernel/src/types.ts` with JSDoc referencing RFC-0390
- Update `reads` JSDoc on `KernelCommandDefinition` to reference RFC-0390 functional cache role
- Add `force?: boolean` to `ExecuteKernelPipelineOptions` for `--force` flag support
- Add `cached?: boolean` to `KernelExecutionReport` for cache-hit marker

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes (typecheck only, no runtime change yet)

**Completion criterion:** `cacheable` field exists on `KernelCommandMetadata`, `reads` JSDoc references RFC-0390, `force` on `ExecuteKernelPipelineOptions`, `cached` on `KernelExecutionReport`.

**Human review:** no

---

### Step 2. Add `picomatch` dependency

**Goal:** Make picomatch available for glob pattern matching in the cache module.

**Agent actions:**

- Add `"picomatch": "^4.0.0"` to `dependencies` in `packages/os/site-kernel/package.json`
- Run `pnpm install` to update lockfile

**Validation:**

- `pnpm install` succeeds
- `pnpm --filter @gogol/site-kernel run build:check` passes

**Completion criterion:** `picomatch` is in `packages/os/site-kernel/package.json` dependencies and installed.

**Human review:** no

---

### Step 3. Create `command-result-cache.ts` module

**Goal:** Implement the cache key construction, hash computation, and get/set helpers.

**Agent actions:**

- Create `packages/os/site-kernel/src/cache/command-result-cache.ts`
- Export `COMMAND_RESULT_CACHE_NAMESPACE = "command_results"`, `COMMAND_RESULT_CACHE_SCHEMA_VERSION = 1`
- Export `CommandResultCacheKey` interface, `buildCommandResultCacheKey` function
- Implement `computeInputsHash(reads, baseDir, workspaceRoot)` — resolve `<app>` token, expand globs via picomatch, hash matching files via `@gogol/fingerprint` (`fingerprintFile` for individual files, `stableJsonHash` for composite)
- Implement `computeModuleHash(moduleSrcDir)` — `fingerprintTree` of the command's package `src/` directory
- Implement `getCachedCommandResult(cache, key)` — `cache.get(NAMESPACE, key)`, deserialize `KernelExecutionReport`, set `cached: true`
- Implement `setCachedCommandResult(cache, key, report)` — `cache.set(NAMESPACE, key, report, mtime, contentHash)`
- Add MODULE_CONTRACT and CHANGE_SUMMARY Compass markup

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes
- Module exports match the RFC TypeScript contracts section

**Completion criterion:** Module exists, exports match RFC contracts, typecheck passes.

**Human review:** no

---

### Step 4. Integrate cache into `executePipelineForSite` and `executePipelineForWorkspace`

**Goal:** Add cache lookup before command execution and cache store after successful execution.

**Agent actions:**

- In `executePipelineForSite` and `executePipelineForWorkspace`, before `executeRegisteredCommand`:
  1. Check `command.cacheable !== false` and `!options.dryRun` and `!options.force`
  2. If cacheable: resolve `reads` globs relative to `site.directory ?? options.workspaceRoot`
  3. Compute `inputsHash` via `computeInputsHash`
  4. Compute `moduleHash` via `computeModuleHash` (cache per-package per-run in a `Map<string, string>`)
  5. Build cache key, query `CacheLayer`
  6. On hit: return cached report with `cached: true`, skip execution, record `durationMs: 0` in telemetry
  7. On miss: execute command, if `ok: true` store result in cache, return report. If `ok: false`, do NOT store — failing commands re-execute on every run until they succeed
- On `--force`: skip cache lookup but still store successful results (refreshing entries)
- On `dryRun`: skip cache entirely (no read, no write)
- Create `CacheLayer` instance once per pipeline run via `createCacheLayer(options.workspaceRoot)`
- Update progress output to show `SKIP (cached)` for cache hits

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes
- Manual test: run a pipeline twice, verify second run shows SKIP (cached) for unchanged commands

**Completion criterion:** Cache lookup/store integrated in both `executePipelineForSite` and `executePipelineForWorkspace`; `--force` bypasses reads; `dryRun` bypasses entirely; only `ok: true` results cached.

**Human review:** no

---

### Step 5. Implement `command.reads.validate` command

**Goal:** Create the workspace-scoped validation command that enforces the `reads`/`cacheable` contract.

**Agent actions:**

- Create command handler in `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` (or a new `command-reads-validate.ts` file)
- Register `command.reads.validate` as workspace-scoped command with `reads: ["docs/command-manifest.generated.yaml"]`
- Implementation: iterate all registered commands via `listRegisteredKernelCommands`, check:
  - CRC-01: each command has non-empty `reads` OR `cacheable: false` → fail if neither
  - CRC-02: each `reads` pattern is valid picomatch syntax → fail on parse error
- Return `Diagnostic[]` with errors for CRC-01/CRC-02

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- `pnpm exec werkstatt run command.reads.validate --json` runs (will fail until commands are annotated, which is expected)

**Completion criterion:** Command registered, runs, produces CRC-01/CRC-02 diagnostics.

**Human review:** no

---

### Step 6. Add `command.reads.validate` to `PACKAGES_CHECK_PIPELINE`

**Goal:** Wire the validation command into the workspace pipeline so it runs on every `packages.check`.

**Agent actions:**

- Add `{ command: "command.reads.validate" }` to `PACKAGES_CHECK_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` (after `command.manifest.validate`)
- Add CHANGE_SUMMARY entry referencing RFC-0390

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes

**Completion criterion:** `command.reads.validate` is in `PACKAGES_CHECK_PIPELINE`.

**Human review:** no

---

### Step 7. Annotate `PACKAGES_CHECK_PIPELINE` commands (file-by-file)

**Goal:** Ensure all ~173 commands in `PACKAGES_CHECK_PIPELINE` declare `reads` or `cacheable: false`.

**Agent actions:**

- Process command-tables files one at a time: `01-codegen.ts` → `02-layout-cosmic.ts` → ... → `infra-contracts.ts`
- For each file, annotate every command that lacks `reads`:
  - If the command reads files deterministically: add `reads: [...]` with appropriate globs
  - If the command depends on external state (network, time, binaries): add `cacheable: false`
- After each file, run `pnpm exec werkstatt run command.reads.validate --json` to check progress
- Use the command handler's source code to determine which files it reads
- For workspace-scoped commands, use workspace-root-relative paths
- For app-scoped commands, use `<app>` token

**Validation:**

- `pnpm exec werkstatt run command.reads.validate --json` passes (0 CRC-01/CRC-02 violations for PACKAGES_CHECK_PIPELINE commands)
- `pnpm --filter @gogol/site-kernel-checks run build:check` passes

**Completion criterion:** `command.reads.validate` reports 0 violations for all `PACKAGES_CHECK_PIPELINE` commands.

**Human review:** no

---

### Step 8. Annotate `SITES_CHECK_AUTHOR_PIPELINE` commands (file-by-file)

**Goal:** Ensure all ~176 commands in `SITES_CHECK_AUTHOR_PIPELINE` declare `reads` or `cacheable: false`.

**Agent actions:**

- Same file-by-file process as Step 7, but for `SITES_CHECK_AUTHOR_PIPELINE` commands
- These are app-scoped commands — use `<app>` token for site-relative paths
- Common patterns: `<app>/src/content/system.md`, `<app>/src/content/**/*.md`, `<app>/src/content/**/*.yaml`
- After each command-tables file, run `command.reads.validate` to verify progress

**Validation:**

- `pnpm exec werkstatt run command.reads.validate --json` passes (0 violations for all commands)
- `pnpm --filter @gogol/site-kernel-checks run build:check` passes

**Completion criterion:** `command.reads.validate` reports 0 violations for all registered commands.

**Human review:** no

---

### Step 9. Write unit tests for `command-result-cache.ts`

**Goal:** Cover cache miss, cache hit, force bypass, cacheable:false, schema version bump, only-success-cached.

**Agent actions:**

- Create `packages/os/site-kernel/src/cache/__tests__/command-result-cache.test.ts`
- Test cases:
  1. `computeInputsHash` — empty reads → stable hash
  2. `computeInputsHash` — matching files → hash changes when file content changes
  3. `computeModuleHash` — directory hash changes when a file in `src/` changes
  4. `buildCommandResultCacheKey` — includes schema version, command name, site name, hashes
  5. `getCachedCommandResult` — miss returns null
  6. `getCachedCommandResult` — hit returns report with `cached: true`
  7. `setCachedCommandResult` — stores report, subsequent get returns it
  8. Schema version bump — key changes when `COMMAND_RESULT_CACHE_SCHEMA_VERSION` changes
  9. Only-success-cached — report with `ok: false` is NOT stored; report with `ok: true` is stored and retrieved
  10. Cacheable false — not cached (handled at pipeline level, but test the contract)

**Validation:**

- `pnpm --filter @gogol/site-kernel run test` passes
- `pnpm --filter @gogol/site-kernel run build:check` passes

**Completion criterion:** All test cases pass.

**Human review:** no

---

### Step 10. Update AGENTS.md files and Compass XML

**Goal:** Document the new cache system and mandatory contract.

**Agent actions:**

- Extend "Kernel cache (RFC-0382)" section in `packages/os/site-kernel/AGENTS.md` with:
  - `command-result-cache.ts` module description
  - `command_results` namespace
  - `--force` flag behavior
  - `cacheable: false` opt-out
- Add "Command reads/cacheable contract (RFC-0390)" section to `packages/os/site-kernel-checks/AGENTS.md`:
  - Every command MUST declare `reads` or `cacheable: false`
  - `command.reads.validate` enforces this in `PACKAGES_CHECK_PIPELINE`
  - `<app>` token for app-scoped paths
  - Network-dependent commands MUST use `cacheable: false`
- Add requirement entry to `docs/requirements.xml`:
  - "Pipeline command results are cached by declared `reads` hash + module hash. Every command MUST declare `reads` or `cacheable: false` (RFC-0390)."
- Add `picomatch` entry to `docs/technology.xml` tooling section

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0390 --json` passes
- `pnpm --filter @gogol/site-kernel run build:check` passes

**Completion criterion:** All four documentation files updated with RFC-0390 content.

**Human review:** no

---

### Step 11. End-to-end validation and evidence

**Goal:** Run the full validation suite and emit verification evidence.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate RFC-0390 --json` — must pass
- Run `pnpm --filter @gogol/site-kernel run build:check` — must pass
- Run `pnpm --filter @gogol/site-kernel-checks run build:check` — must pass
- Run `pnpm --filter @gogol/site-kernel run test` — must pass
- Run `pnpm exec werkstatt run command.reads.validate --json` — must pass (0 violations)
- Run `pnpm exec werkstatt run kernel.cache.status --json` — verify `command_results` namespace visible
- Run `pnpm exec werkstatt run kernel.cache.clear --namespace command_results --json` — verify clear works
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0390` — emit evidence file
- Stamp RFC-0390 as `implemented` with `implementedAt: 2026-07-17`
- Commit evidence + status stamp

**Validation:**

- All above commands pass
- Evidence file committed in same commit as status stamp

**Completion criterion:** RFC-0390 status is `implemented`, evidence file committed, all acceptance criteria checkboxes checked.

**Human review:** yes — human reviews the implementation before the `accepted → implemented` stamp is finalized. The human should verify that the cache actually skips unchanged commands on a real `build:check` run.

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0390` — RFC frontmatter validation
- `pnpm --filter @gogol/site-kernel run build:check` — typecheck + lint for site-kernel
- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck + lint for site-kernel-checks
- `pnpm --filter @gogol/site-kernel run test` — unit tests including new cache tests
- `pnpm exec werkstatt run command.reads.validate --json` — 0 violations
- `pnpm exec werkstatt run kernel.cache.status --json` — `command_results` namespace visible
- `pnpm exec werkstatt run kernel.cache.clear --namespace command_results --json` — clears successfully
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0390` — evidence file emitted

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0390.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0390` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False cache hit from stale `reads` declaration | Step 5 (command.reads.validate) + Step 7/8 (bulk annotation) |
| Module hash over-invalidation | Step 3 (computeModuleHash cached per-package per-run) |
| Bulk annotation effort (~170 commands) | Step 7 + Step 8 (mechanical, one command at a time) |
| picomatch dependency | Step 2 (add dependency, verify build passes) |
| Cache database growth | Step 11 (verify kernel.cache.clear works) |
| Concurrent pipeline executions | Step 3 (WAL mode already configured by RFC-0382) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-53 (fingerprint governance), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0390 --reason "..." --invariant "DNA-53"` instead of working around it.
- If the `cacheable` field placement on `KernelCommandMetadata` conflicts with existing type usage, create a superseding RFC rather than adding a parallel field.
- If `picomatch` introduces a transitive dependency that violates the zero-dependency preference, evaluate `micromatch` as an alternative via a new RFC.
