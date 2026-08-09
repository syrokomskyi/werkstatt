---
rfcId: RFC-0770
planId: PLAN-RFC-0770-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
  services: []
  docs:
    - AGENTS.md
    - docs/rfcs/rfc-0770-werkstatt-plugin-contract-and-stack-profile-binding.md
---

# Implementation Plan: RFC-0770

## 1. Objectives

- [ ] O1 — Define `WerkstattPlugin`, `WerkstattPluginHooks`, `PluginRegistry`, `PluginHookContext`, `HookResult`, `StackPathConventions`, `StackInvariant` types in `packages/werkstatt` — maps to acceptance criterion "types defined in the engine package"
- [ ] O2 — Implement and register `werkstatt.plugin.validate` command (workspace scope) with `--json` output — maps to acceptance criterion "werkstatt.plugin.validate registered"
- [ ] O3 — Implement PLUGIN-01..05 failure modes with warn-only behavior for PLUGIN-01 — maps to acceptance criterion "PLUGIN-01..05 failure modes covered by unit tests" and "warn-only behavior implemented and tested"
- [ ] O4 — Implement profile binding cross-check (plugin `profileId` ↔ `forge.yaml` `profile` field) — maps to acceptance criterion "profile binding cross-check implemented"
- [ ] O5 — Document the plugin contract in root `AGENTS.md` — maps to acceptance criterion "Root AGENTS.md documents the plugin contract"
- [ ] O6 — `rfc.validate` passes on RFC-0770 — maps to acceptance criterion "rfc.validate passes"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/` — new minimal package (package.json, tsconfig.json, src/index.ts, src/plugin-contract.ts, src/plugin-registry.ts, src/types.ts)
- `packages/werkstatt/src/validate/` — `werkstatt.plugin.validate` command handler
- `packages/werkstatt/src/validate/plugin-validate.ts` — main handler
- `packages/werkstatt/src/validate/plugin-validate.test.ts` — unit tests for PLUGIN-01..05
- `packages/werkstatt/os/werkstatt-plugin.module.ts` — ForgeModule registration for the validate command
- `tools/kernel.config.ts` — add `werkstatt-plugin` module loader entry
- `pnpm-workspace.yaml` — no change needed (packages/* already globbed)

### 2.2 Configuration and data

- `packages/werkstatt/package.json` — new package manifest (`@warpgogol/werkstatt`, private, type: module)
- `packages/werkstatt/tsconfig.json` — extends `tsconfig/base.json`

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add "Werkstatt plugin contract" section documenting the `werkstatt/plugin@1` interface, profile binding, and the one-plugin-per-workshop rule
- `docs/rfcs/rfc-0770-werkstatt-plugin-contract-and-stack-profile-binding.md` — read-only reference (acceptance criteria check-off at final step)

### 2.4 Validation and pipelines

- `packages/werkstatt` must pass `build:check` (tsc --noEmit)
- `werkstatt.plugin.validate` registered at workspace scope
- No pipeline changes — the validator joins `packages.check` pipeline in a later step (after RFC-0772 creates the engine, per the rollout section)

## 3. Step sequence

### Step 1. Create `packages/werkstatt` package scaffold

**Goal:** Create the minimal `@warpgogol/werkstatt` package with package.json, tsconfig.json, and directory structure.

**Agent actions:**

- Create `packages/werkstatt/package.json` with:
  - `name: "@warpgogol/werkstatt"`
  - `private: true`
  - `type: "module"`
  - `scripts: { "build:check": "tsc --noEmit" }`
  - `exports` field mapping `.` → `./src/index.ts` and `./plugin` → `./src/plugin-contract.ts`
- Create `packages/werkstatt/tsconfig.json` extending `tsconfig/base.json`
- Create `packages/werkstatt/src/` directory

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes (empty package, no errors)
- `pnpm install` resolves the new workspace package

**Completion criterion:** `packages/werkstatt` exists, is recognized by pnpm workspace, and `build:check` passes with zero errors.

**Human review:** no

---

### Step 2. Define plugin contract types

**Goal:** Define all TypeScript interfaces from the RFC in `packages/werkstatt/src/plugin-contract.ts`.

**Agent actions:**

- Create `packages/werkstatt/src/plugin-contract.ts` with:
  - `WerkstattPlugin` interface (schema, id, profileId, moduleLoaders, pipelines?, deployAdapters?, hooks?, paths, invariants?)
  - `WerkstattPluginHooks` interface (materialize?, build?, checkGate?, releaseEvidence?, scaffoldProject?)
  - `PluginHookContext` interface (workspaceRoot, logger, workpiecePath?, missionId?)
  - `HookResult` type ({ success: boolean, errors?: string[], warnings?: string[], data?: unknown })
  - `StackPathConventions` interface (contentDir, distDir, entryPoints)
  - `StackInvariant` interface (id, description, check?)
  - `DeployAdapterFactory` type (placeholder — exact shape re-homed by RFC-0772)
  - Re-export `KernelModule`, `KernelPipelineStep` from `@warpgogol/site-kernel/types` (temporary until RFC-0772 re-homes them)
- Create `packages/werkstatt/src/plugin-registry.ts` with `PluginRegistry` interface and a concrete `createPluginRegistry()` factory implementing `register()` and `resolve()` (throws on zero or multiple)
- Create `packages/werkstatt/src/index.ts` barrel exporting all public types
- Add Compass scaffolding (`MODULE_CONTRACT`, `CHANGE_SUMMARY`) to each new source file

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- Types are importable: `import { WerkstattPlugin } from "@warpgogol/werkstatt"` resolves

**Completion criterion:** All RFC-specified types exist, are exported, and typecheck cleanly.

**Human review:** no

---

### Step 3. Implement `werkstatt.plugin.validate` command

**Goal:** Create the validation command handler that checks plugin registration, profile binding, module loader resolution, and deploy adapter presence.

**Agent actions:**

- Create `packages/werkstatt/src/validate/plugin-validate.ts` with handler `runPluginValidate`:
  1. Check `tools/kernel.config.ts` exists → PLUGIN-05 if missing
  2. Dynamic import `tools/kernel.config.ts`, call `defineKernelConfig` to get the config
  3. Scan `moduleLoaders` for entries that resolve to a `WerkstattPlugin` (by checking `schema === "werkstatt/plugin@1"` on the resolved module) → PLUGIN-01 if zero or multiple
  4. Read `forge.yaml` `profile` field → resolve to stack profile id
  5. Compare plugin `profileId` with forge profile id → PLUGIN-02 if mismatch
  6. Dynamic import each plugin moduleLoader → PLUGIN-03 if any fails to resolve
  7. Read `systems/registry.yaml` deploy adapter references → PLUGIN-04 if adapter not in engine or plugin
  8. Warn-only mode for PLUGIN-01: if no plugin found AND `forge.yaml` has no `profile` field, emit warning (not error), exit 0
- Create `packages/werkstatt/os/werkstatt-plugin.module.ts` — ForgeModule registering `werkstatt.plugin.validate` at workspace scope with `--json` flag
- Add `werkstatt-plugin` entry to `tools/kernel.config.ts` moduleLoaders: `async () => (await import("@warpgogol/werkstatt/os/werkstatt-plugin.module")).forgeWerkstattPluginModule`
- Output format per RFC § Output format

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- `pnpm exec werkstatt run werkstatt.plugin.validate --json` runs and returns warn-only result (PLUGIN-01 as warning, exit 0) since no plugin is registered yet

**Completion criterion:** Command is registered, runs without crash, returns documented JSON output, and correctly emits warn-only for PLUGIN-01 in the current workshop state.

**Human review:** no

---

### Step 4. Write unit tests for PLUGIN-01..05

**Goal:** Cover all five failure modes plus the warn-only transition behavior and the pass case.

**Agent actions:**

- Create `packages/werkstatt/src/validate/plugin-validate.test.ts` with vitest tests:
  - PLUGIN-01 (zero plugins, warn-only): no plugin in kernel.config → warning, exit 0
  - PLUGIN-01 (zero plugins, enforce): no plugin + `forge.yaml` has `profile` field → error, exit 1
  - PLUGIN-01 (multiple plugins): two plugins → error, exit 1
  - PLUGIN-02: plugin `profileId` ≠ `forge.yaml` `profile` → error, exit 1
  - PLUGIN-03: moduleLoader throws on import → error, exit 1
  - PLUGIN-04: registry references deploy adapter not provided → error, exit 1
  - PLUGIN-05: `tools/kernel.config.ts` missing → error, exit 1
  - Pass case: one plugin, matching profileId, all loaders resolve, adapters present → exit 0
- Use temp directories and mock `tools/kernel.config.ts` / `forge.yaml` / `systems/registry.yaml` per test

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` passes (all 8 test cases green)

**Completion criterion:** All 8 test cases pass, covering every failure mode and the warn-only transition.

**Human review:** no

---

### Step 5. Document plugin contract in root AGENTS.md

**Goal:** Add a section to root `AGENTS.md` that documents the `werkstatt/plugin@1` contract for agents.

**Agent actions:**

- Add a "Werkstatt plugin contract" section to `AGENTS.md` (after the existing "Forge project configuration" section or in a logically appropriate location) covering:
  - The `werkstatt/plugin@1` schema and `WerkstattPlugin` interface
  - One-plugin-per-workshop rule
  - Profile binding: `forge.yaml` `profile` ↔ plugin `profileId`
  - The 5 hooks (closed list)
  - `werkstatt.plugin.validate` command and its warn-only transition behavior
  - Reference to RFC-0770 and RFC-0769

**Validation:**

- `AGENTS.md` contains the new section
- No existing content removed

**Completion criterion:** Root `AGENTS.md` has a "Werkstatt plugin contract" section that an agent can read to understand the contract.

**Human review:** no

---

### Step 6. Final validation and rfc.validate

**Goal:** Run all validation checks and confirm the RFC passes mechanical validation.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0770 --json` — must pass
- Run `pnpm --filter @warpgogol/werkstatt run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt run test` — must pass
- Run `pnpm exec werkstatt run werkstatt.plugin.validate --json` — must return warn-only result (exit 0)
- Run `pnpm exec werkstatt run command.manifest.generate` if command surface changed

**Validation:**

- All four commands above return exit 0

**Completion criterion:** All validation commands pass with zero errors.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `AGENTS.md` (root) is updated with the plugin contract section (Step 5)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (new `werkstatt.plugin.validate` command)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in RFC-0770 against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)`. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0770 --implementation-commit <sha>` (run `--dry-run` first, then without). The command validates all preconditions (status, criteria, clean tree, commit reachability).

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0770` — passes
- Every file in `scope.docs` is either updated or documented as not-applicable
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0770`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run werkstatt.plugin.validate --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0770` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Hook granularity — too coarse/fine | Step 2 defines exactly 5 hooks per RFC; closed list means no churn |
| Hidden site assumptions (Astro-isms) | Out of scope for RFC-0770; deferred to RFC-0772 (nonGoals) |
| Missing `tools/kernel.config.ts` | Step 3 implements PLUGIN-05; Step 4 tests it |
| `packages/werkstatt` doesn't exist yet | Step 1 creates it minimally; RFC-0772 fills it later |
| Warn-only transition could mask real issues | Step 4 tests both warn-only and enforce modes; enforce activates when `forge.yaml` has `profile` field |

## 6. Escalation triggers

- If implementation reveals that `KernelModule` / `KernelPipelineStep` types from `@warpgogol/site-kernel/types` are insufficient for the plugin contract, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0770 --reason "..." --invariant "DNA-64"` instead of working around it.
- If the dynamic import of `tools/kernel.config.ts` is not feasible (e.g. ESM/CJS interop issues), create an ADR documenting the alternative discovery mechanism.
- If RFC-0772's inversion reveals a missing hook, a superseding RFC must be created — do not amend RFC-0770 to add hooks.
