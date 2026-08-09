---
rfcId: RFC-0544
planId: PLAN-RFC-0544-01
status: draft
owner: architecture
createdAt: 2026-07-26
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - packages/forge/AGENTS.md
    - packages/forge/README.md
---

# Implementation Plan: RFC-0544

## 1. Objectives

- [ ] O1 — `forge.create` handler exists and creates a project directory in one command — maps to acceptance criterion "forge.create is registered in forgeCoreModule"
- [ ] O2 — `forge-shell` profile exists as the default minimal profile — maps to "Default profile is forge-shell when --profile is omitted"
- [ ] O3 — `forge.create` delegates to `forge.scaffold` then `forge.init` — maps to "forge create my-project creates ./my-project/ with forge.yaml, synced skills, docs/rfcs/, docs/adrs/"
- [ ] O4 — `forge.yaml` in the created project has non-null forge-CLI bindings (RFC-0540) and `forge.syncedVersion` — maps to "forge.yaml in the created project has non-null forge-CLI bindings and forge.syncedVersion"
- [ ] O5 — Non-empty target directory is refused — maps to "Non-empty target directory is refused with exit 1"
- [ ] O6 — `nextSteps` and IDE recommendation are emitted per RFC-0542 — maps to "Output includes nextSteps with IDE recommendation"
- [ ] O7 — `--package-manager` post-processing works — maps to "--package-manager flag writes the specified PM into forge.yaml"
- [ ] O8 — `packages/forge/AGENTS.md` updated with `forge.create` in command list — maps to "packages/forge/AGENTS.md updated"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/profiles/forge-shell.yaml` — new minimal stack profile
- `packages/forge/src/onboarding/create.ts` — new `runCreate` handler
- `packages/forge/os/core/core.module.ts` — register `forge.create` in `forgeCoreModule`
- `packages/forge/bin/cli.ts` — add `forge.create` to the IDE recommendation condition (line 277)
- `packages/forge/src/tests/create.test.ts` — new unit tests

### 2.2 Configuration and data

- No data files or schemas change. `forge.yaml` schema already supports `forge.syncedVersion` (RFC-0543) and binding defaults (RFC-0540).

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — add `forge.create` to `forgeCoreModule` command list
- `packages/forge/README.md` — document `forge create` as the first command a consumer runs (if README exists)

### 2.4 Validation and pipelines

- `pnpm --filter @wgogol/forge run build:check` — typecheck
- `pnpm --filter @wgogol/forge run test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0544` — RFC validation

## 3. Step sequence

### Step 1. Create `forge-shell` stack profile

**Goal:** Create a minimal stack profile that produces a bare forge project without stack-specific files or install commands.

**Agent actions:**

- Create `packages/forge/profiles/forge-shell.yaml` with:
  - `schema: forge/stack-profile@1`
  - `id: forge-shell`
  - `displayName: Forge Shell (minimal)`
  - `detect:` with `anyOf: []` (no detection markers — this profile is not auto-detected)
  - `workspace:` with empty `dirs: []` and `files: []` (no stack-specific files)
  - No `install` section (no package installation needed)
  - No `firstWorkspace` section (no first workspace creation)

**Validation:**

- `listStackProfiles(forgeRoot)` includes `forge-shell` in the returned array
- `forge.scaffold --profile forge-shell --name test-project` succeeds in an empty temp dir

**Completion criterion:** `packages/forge/profiles/forge-shell.yaml` exists and is loadable by `listStackProfiles`

**Human review:** no

---

### Step 2. Implement `runCreate` handler

**Goal:** Create the `forge.create` handler that composes `forge.scaffold` + `forge.init` + post-processing.

**Agent actions:**

- Create `packages/forge/src/onboarding/create.ts`
- Import `runScaffoldProject` from `./scaffold-project.ts` and `runInit` from `./init.ts`
- Import `loadForgeConfig`, `defaultForgeConfig`, `resolveForgeRoot`, `resolvePackageManager` from `../config/forge-config.ts`
- Import `stringify as stringifyYaml`, `parse as parseYaml` from `yaml`
- Define `CreateCommandInput` and `CreateCommandResult` interfaces per RFC TypeScript contracts
- Implement `runCreate` function:
  1. Read `<name>` from `input.args[0]` (positional arg, not a flag — follows `git clone` / `npm create` convention per grilling decision)
  2. Validate `<name>` against kebab-case regex `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`
  3. Resolve target directory: `path.resolve(process.cwd(), name)` (or `context.workspaceRoot`)
  4. Refuse if target directory exists and is non-empty
  5. Create target directory `fs.mkdirSync(targetDir, { recursive: true })`
  6. Build a child context with `workspaceRoot` set to `targetDir`
  7. Call `runScaffoldProject` with `flags: { profile, name }` and child context (scaffold expects `--name` and `--profile` as flags)
  8. If scaffold fails, return fail result with scaffold errors
  9. Call `runInit` with `flags: {}` and child context
  10. If init fails, return fail result with init errors
  11. If `--package-manager` was provided and differs from `pnpm`, post-process `forge.yaml`:
      - Load the written `forge.yaml` via `loadForgeConfig(targetDir)`
      - Set `config.project.packageManager = resolvePackageManager(pm)`
      - Re-derive binding defaults via `applyCliBindingDefaults(pm)` and update `config.bindings.commands`
      - Re-serialize and write `forge.yaml`
  12. Collect `filesCreated` from scaffold + init results
  13. Return `CreateCommandResult` with `status`, `projectDir`, `profile`, `filesCreated`

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes (typecheck)
- Handler is importable from `packages/forge/src/onboarding/create.ts`

**Completion criterion:** `runCreate` function exists, is typed, and passes typecheck

**Human review:** no

---

### Step 3. Register `forge.create` in `forgeCoreModule`

**Goal:** Wire `forge.create` into the command registry with `nextSteps` and IDE recommendation.

**Agent actions:**

- Edit `packages/forge/os/core/core.module.ts`:
  - Add `const { runCreate } = await import("../../src/onboarding/create.ts");` to the dynamic imports
  - Create a `createWrapper` async function (following the pattern of `initWrapper` and `scaffoldWrapper`):
    - Call `runCreate(input, context)`
    - Set `nextSteps`:
      - On pass: `[{ action: "Open the project in Windsurf", kind: "required" }, { action: "Run /forge-bootstrap to configure the project interactively", kind: "optional" }]`
      - On fail: `[{ action: "Fix the errors above and re-run forge.create", kind: "required" }]`
    - Return `ForgeCommandResult` with `data`, `nextSteps`, `exitCode`, `summary`
  - Register command:
    - `name: "forge.create"`
    - `description: "Create a new forge project in one command: scaffold + init + binding defaults."`
    - `scope: "workspace"`
    - `flags:` `profile` (string, optional, default forge-shell), `package-manager` (string, optional, default pnpm)
    - Positional arg: `name` (read from `input.args[0]` in the handler, not a flag)
    - `cacheable: false`
    - `execute: createWrapper`

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- `forge.create` appears in `registry.listCommandNames()` when `forgeCoreModule` is registered

**Completion criterion:** `forge.create` is registered and dispatches to `runCreate` via `createWrapper`

**Human review:** no

---

### Step 3b. Update CLI IDE recommendation condition

**Goal:** Make `forge create` print the IDE recommendation in pretty mode, matching `forge.init`.

**Agent actions:**

- Edit `packages/forge/bin/cli.ts` line 277:
  - Change `if (commandName === "forge.init")` to `if (commandName === "forge.init" || commandName === "forge.create")`

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- `forge create my-project` (pretty mode) prints the IDE recommendation after Next steps

**Completion criterion:** IDE recommendation renders for both `forge.init` and `forge.create`

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Cover all execution paths: success, non-empty refusal, invalid name, default profile, package-manager override, delegation.

**Agent actions:**

- Create `packages/forge/src/tests/create.test.ts`
- Follow the pattern from `scaffold-project.test.ts` (temp dirs, silent logger, `makeContext`)
- Test cases:
  1. `forge create my-project` (positional arg) — creates dir, forge.yaml exists, skills synced, docs/rfcs/ and docs/adrs/ exist
  2. `forge create my-project` with non-empty target — fails with "already exists and is not empty"
  3. `forge create MyProject` — fails with kebab-case regex error
  4. `forge create my-project --profile forge-shell` — uses forge-shell profile (default)
  5. `forge create my-project --package-manager npm` — `forge.yaml` has `packageManager: npm` and binding defaults use `npx` prefix
  6. `forge create my-project --package-manager pnpm` — `forge.yaml` has `packageManager: pnpm` (no post-processing needed, same as default)
  7. `forge.yaml` in created project has non-null `validateRfc`, `validateAdr`, `implementStamp`, `specValidate` and null `typecheck`, `test`, `scopedBuild`
  8. `forge.yaml` in created project has `forge.syncedVersion` set
  9. Result includes `nextSteps` with "Open the project in Windsurf" (required) and "Run /forge-bootstrap" (optional)

**Validation:**

- `pnpm --filter @wgogol/forge run test` — all new tests pass

**Completion criterion:** All 9 test cases pass

**Human review:** no

---

### Step 5. Update documentation

**Goal:** Sync `AGENTS.md` and `README.md` with the new command.

**Agent actions:**

- Edit `packages/forge/AGENTS.md`:
  - Add `forge.create` to the `forgeCoreModule` command list in the OS modules table
  - Add a note in the Stack profiles section that `forge-shell` is the default profile for `forge.create`
- Check if `packages/forge/README.md` exists; if so, add `forge create` as the recommended first command

**Validation:**

- `packages/forge/AGENTS.md` contains `forge.create` in the `forgeCoreModule` row
- `packages/forge/AGENTS.md` contains `forge-shell` in the shipped profiles list

**Completion criterion:** Both docs reference `forge.create` and `forge-shell`

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Verify all acceptance criteria, stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @wgogol/forge run build:check` — typecheck
- Run `pnpm --filter @wgogol/forge run test` — all tests pass
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0544` — zero violations
- Check off acceptance criteria in the RFC file with inline `(evidence: ...)` annotations
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0544 --implementation-commit <sha>` to atomically transition `accepted → implemented`
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (new command registered)

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0544` — passes
- All acceptance criteria marked `[x]` with evidence

**Completion criterion:** RFC stamped as `implemented` via `rfc.implement.stamp`; all criteria verified

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0544`
- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @wgogol/forge run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0544` in the subject line
- Test output showing all create.test.ts cases pass

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Profile staleness — forge-shell renamed/removed | Step 1 creates the profile; Step 4 tests default profile resolution |
| Execution cost — scaffold install commands | Step 1 creates forge-shell with no install section; default path is fast |
| Name collision with forge commands | Step 4 tests name validation; README warns (Step 5) |
| Agent misinterpretation — running inside existing project | Step 4 tests non-empty refusal; handler checks target dir before creating |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0544 --reason "..." --invariant "DNA-54"` instead of working around it.
- If `forge.init` or `forge.scaffold` contracts need to change to support composition, stop — the RFC explicitly forbids changing their contracts. Create a superseding RFC instead.
