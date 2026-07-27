---
rfcId: RFC-0542
planId: PLAN-RFC-0542-01
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
---

# Implementation Plan: RFC-0542

## 1. Objectives

- [ ] O1 — Add `ForgeNextStep` type and `nextSteps?` field to `ForgeCommandResult` (maps to acceptance criterion 1)
- [ ] O2 — Implement `renderNextSteps`, `renderIdeRecommendation`, and registry-driven `generateHelp` in `bin/cli.ts` (maps to acceptance criteria 3, 4, 5)
- [ ] O3 — Populate `nextSteps` in `forge.init`, `forge.scaffold`, `forge.doctor` command wrappers (maps to acceptance criterion 2)
- [ ] O4 — Print IDE recommendation from `forge.init` (maps to acceptance criterion 3)
- [ ] O5 — Enforce English-only CLI output (maps to acceptance criterion 6)
- [ ] O6 — Unit-test `renderNextSteps`, `renderIdeRecommendation`, and `generateHelp` (maps to acceptance criterion 7)
- [ ] O7 — Update `packages/forge/AGENTS.md` with the output contract (maps to acceptance criterion 8)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/types.ts` — add `ForgeNextStep` interface; add `nextSteps?: ForgeNextStep[]` to `ForgeCommandResult`
- `packages/forge/bin/cli.ts` — add `renderNextSteps()`, `renderIdeRecommendation()`, `generateHelp()`; replace hand-maintained `printHelp`; add `--help <command>` flag; update JSON output to include `nextSteps`; render `nextSteps` and IDE recommendation in pretty mode
- `packages/forge/os/core/core.module.ts` — populate `nextSteps` in `initWrapper`, `scaffoldWrapper`, `doctorWrapper`; add IDE recommendation to `initWrapper`
- `packages/forge/src/onboarding/doctor.ts` — return `nextSteps` in doctor result (fail-state: "fix the violations above and re-run"; pass-state: empty)

### 2.2 Configuration and data

None — no YAML/JSON config changes.

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — add "Output contract (RFC-0542)" section documenting `nextSteps`, IDE recommendation, and English-only CLI output
- `docs/rfcs/rfc-0542-*.md` — read-only reference (acceptance criteria checked off during final step)

### 2.4 Validation and pipelines

- `pnpm --filter @wgogol/forge run build:check` — typecheck
- `pnpm --filter @wgogol/forge run test` — unit tests
- `pnpm exec site-kernel run rfc.validate` — RFC validation

## 3. Step sequence

### Step 1. Add `ForgeNextStep` type and extend `ForgeCommandResult`

**Goal:** Establish the TypeScript contract for next-step guidance.

**Agent actions:**

- Add `ForgeNextStep` interface to `packages/forge/src/types.ts`:
  ```ts
  export interface ForgeNextStep {
    action: string;
    kind: "required" | "optional";
  }
  ```
- Add `nextSteps?: ForgeNextStep[]` to `ForgeCommandResult` (alongside `data`, `exitCode`, `summary`, `timing`):
  ```ts
  export interface ForgeCommandResult<TData = unknown> {
    data?: TData;
    nextSteps?: ForgeNextStep[];
    exitCode?: number;
    summary?: string;
    timing?: ForgeCommandTiming;
  }
  ```
- Export `ForgeNextStep` from the package entrypoint (`src/index.ts`) so consumers can type-check `nextSteps` in `--json` output.

**Design note:** `nextSteps` is placed on `ForgeCommandResult` itself, not inside `data`. Rationale: `nextSteps` is a cross-cutting output concern shared by all commands, while `data` is command-specific (`InitResult`, `ScaffoldResult`, etc.). Placing it on `ForgeCommandResult` avoids modifying every command's data type and lets the CLI render it uniformly.

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` — typecheck passes

**Completion criterion:** `ForgeNextStep` type exists in `types.ts`; `ForgeCommandResult` has `nextSteps?` field; typecheck passes.

**Human review:** no

---

### Step 2. Implement `renderNextSteps`, `renderIdeRecommendation`, and `generateHelp` in `bin/cli.ts`

**Goal:** Create the CLI rendering functions and replace the hand-maintained help.

**Agent actions:**

- Add `renderNextSteps(steps: ForgeNextStep[]): string` — renders the "Next steps" block:
  ```text
  Next steps:
    • <action>        [must do | can do]
  ```
  Returns empty string if `steps` is empty or undefined.
- Add `renderIdeRecommendation(): string` — returns the IDE recommendation string:
  ```text
  Recommended IDE: Windsurf (tested with forge). Other IDEs (VS Code, Cursor)
  work but are not tested.
  ```
- Add `generateHelp(registry: ForgeCliRegistry): string` — iterates `registry.listCommands()` and groups by module. Replaces the hand-maintained `printHelp` function. The generator outputs:
  - Header (usage, version)
  - Grouped command list (by module name, sorted alphabetically within each group)
  - Flags section
- Replace `printHelp` with `generateHelp` in the `--help` / no-args path.
- Add `--help <command>` flag handling: if `argv[0] === "--help"` and `argv[1]` exists, print per-command flags and description from `registry.getCommand(argv[1])`. Exit 1 if command not found.
- Update the main result printing block to:
  - JSON mode: `console.log(JSON.stringify({ ...(result.data ?? {}), nextSteps: result.nextSteps ?? [] }, null, 2))`
  - Pretty mode: print `result.summary` if present, then `renderNextSteps(result.nextSteps)`, then `renderIdeRecommendation()` if the command is `forge.init`.

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` — typecheck passes

**Completion criterion:** `renderNextSteps`, `renderIdeRecommendation`, and `generateHelp` exist; `printHelp` hand-maintained list is removed; `--help <command>` flag works; typecheck passes.

**Human review:** no

---

### Step 3. Populate `nextSteps` in lifecycle command wrappers

**Goal:** Make `forge.init`, `forge.scaffold`, `forge.doctor` produce next-step guidance.

**Agent actions:**

- In `os/core/core.module.ts`:
  - `initWrapper`: set `nextSteps` on the result:
    - pass-state: `[{ action: "Open the project in Windsurf", kind: "required" }, { action: "Run /forge-bootstrap to configure the project", kind: "optional" }]`
    - fail-state: `[{ action: "Fix the errors above and re-run forge.init", kind: "required" }]`
  - `scaffoldWrapper` (`forge.port.scaffold`): set `nextSteps`:
    - pass-state: `[{ action: "Edit the scaffolded SKILL.md to implement your skill", kind: "required" }, { action: "Run forge.skill.validate to check compliance", kind: "optional" }]`
    - fail-state: `[{ action: "Fix the errors above and re-run forge.port.scaffold", kind: "required" }]`
  - `doctorWrapper` (`forge.doctor`): set `nextSteps`:
    - pass-state: `[]` (empty — doctor at pass has no follow-up)
    - fail-state: `[{ action: "Fix the violations above and re-run forge.doctor", kind: "required" }]`
  - `runScaffoldProject` (`forge.scaffold`): set `nextSteps`:
    - pass-state: `[{ action: "Open the project in Windsurf", kind: "required" }, { action: "Run forge.init to deploy skills and docs dirs", kind: "required" }]`
    - fail-state: `[{ action: "Fix the errors above and re-run forge.scaffold", kind: "required" }]`

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` — typecheck passes
- Manual: run `forge init --json` in a temp dir and verify `nextSteps` appears in output

**Completion criterion:** `forge.init`, `forge.scaffold`, `forge.doctor` all populate `nextSteps` in both pretty and JSON output.

**Human review:** no

---

### Step 4. Add IDE recommendation to `forge.init` output

**Goal:** Print the IDE recommendation after the Next steps block for `forge.init`.

**Agent actions:**

- In `bin/cli.ts` main result printing block (pretty mode): after `renderNextSteps`, check if `commandName === "forge.init"` and print `renderIdeRecommendation()`.
- In JSON mode: add `ideRecommendation: true` (or the recommendation string) to the JSON output for `forge.init` only. Alternatively, the IDE recommendation is implicit — `forge.init`'s `nextSteps` already includes "Open the project in Windsurf" as a required step, and the pretty-mode recommendation block provides the full context. For JSON consumers, the `nextSteps` array is sufficient; the recommendation block is a pretty-mode enhancement.

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` — typecheck passes
- Manual: run `forge init` (pretty mode) in a temp dir and verify the IDE recommendation appears

**Completion criterion:** `forge.init` prints the IDE recommendation in pretty mode.

**Human review:** no

---

### Step 5. Unit-test `renderNextSteps`, `renderIdeRecommendation`, and `generateHelp`

**Goal:** Cover the new CLI rendering functions with unit tests.

**Agent actions:**

- Create `packages/forge/src/tests/cli-output.test.ts`:
  - `renderNextSteps`:
    - empty/undefined input → empty string
    - single required step → renders with `[must do]`
    - single optional step → renders with `[can do]`
    - mixed steps → renders all, each with correct kind label
  - `renderIdeRecommendation`:
    - returns string containing "Windsurf" and "tested"
    - returns string containing "VS Code" and "not tested"
  - `generateHelp`:
    - returns string containing all registered command names
    - groups commands by module
    - does not contain the old hand-maintained command list text
- Run tests: `pnpm --filter @wgogol/forge run test`

**Validation:**

- `pnpm --filter @wgogol/forge run test` — all tests pass
- `pnpm --filter @wgogol/forge run build:check` — typecheck passes

**Completion criterion:** Unit tests pass for all three functions.

**Human review:** no

---

### Step 6. Update `packages/forge/AGENTS.md` with the output contract

**Goal:** Document the self-documenting output contract for forge contributors.

**Agent actions:**

- Add a new "Output contract (RFC-0542)" section to `packages/forge/AGENTS.md` after the existing "Bindings contract" section:
  - Every forge CLI command's output ends with a Next steps block (pretty mode) and `nextSteps` array (`--json` mode)
  - Each entry is `{ action: string, kind: "required" | "optional" }`
  - `forge.init` prints an IDE recommendation (Windsurf tested, alternatives without guarantee)
  - All forge CLI natural-language output is English regardless of `PREFERENCES.md`
  - `printHelp` is generated from the registry — no hand-maintained command list
  - `--help <command>` prints per-command flags and description

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` — typecheck passes (no code changes, doc only)

**Completion criterion:** `packages/forge/AGENTS.md` has the output contract section.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Verify all acceptance criteria, stamp the RFC as implemented.

**Agent actions:**

- Verify every acceptance criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- Run `pnpm exec site-kernel run rfc.validate` — zero RFC-0542 violations.
- Run `pnpm --filter @wgogol/forge run build:check` — typecheck passes.
- Run `pnpm --filter @wgogol/forge run test` — all tests pass.
- Stamp the RFC as implemented: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0542 --implementation-commit <sha>` (first `--dry-run`, then without).
- Commit the stamped RFC separately from the implementation commit.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate` — zero RFC-0542 violations.
- `pnpm --filter @wgogol/forge run build:check` — passes.
- `pnpm --filter @wgogol/forge run test` — passes.

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; implementation commit and stamp commit are separate.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate` — zero RFC-0542 violations
- `pnpm --filter @wgogol/forge run build:check` — typecheck passes
- `pnpm --filter @wgogol/forge run test` — all tests pass

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0542` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/rfc-0542-*.md` with all acceptance criteria marked `[x]` and `(evidence: ...)` annotations

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Stale next steps — handler's `nextSteps` hardcode guidance that drifts | Step 3: steps are short imperative sentences referencing command names; Step 6: AGENTS.md documents the contract for contributors |
| Help generator gaps — module fails to register in autonomous mode | Step 2: `generateHelp` iterates the live registry, so help is always honest about available commands |
| Agent misinterpretation — agent treats `optional` next steps as required | Step 1: `kind` field is explicit in the type; Step 6: AGENTS.md documents that `kind` must be respected |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0542 --reason "..." --invariant "DNA-54"` instead of working around it.
