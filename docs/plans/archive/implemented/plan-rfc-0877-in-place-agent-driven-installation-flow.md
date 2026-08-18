---
rfcId: RFC-0877
planId: PLAN-RFC-0877-01
status: draft
owner: architecture
createdAt: 2026-08-18
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
    - packages/werkstatt
  services: []
  docs:
    - AGENTS.md
    - packages/forge/README.md
    - packages/forge/skills/meta/forge-bootstrap/SKILL.md
    - packages/werkstatt/AGENTS.md
    - docs/authoring/site-composition.md
    - docs/COMMANDS.md
    - docs/command-manifest.generated.yaml
    - docs/ecosystem.generated.yaml
    - docs/decision-log.generated.yaml
    - docs/decision-log.generated.md
    - packages/forge/README.uk.md
---

# Implementation Plan: RFC-0877

## 1. Objectives

- [ ] O1 — `forge create --in-place` scaffolds in cwd without subdirectory (maps to AC: `--in-place` test)
- [ ] O2 — `--profile` required, `--name` optional override, name auto-derived from folder (maps to AC: profile-required, name-derivation, name-override tests)
- [ ] O3 — Allowlist-based conflict check tolerates non-forge files, refuses forge-specific files (maps to AC: conflict-check tests)
- [ ] O4 — `workshop.scaffold` command, module files, barrel, exports, and kernel config entry removed (maps to AC: workshop deletion, kernel.config, AGENTS.md entry points)
- [ ] O5 — README rewritten for agent-driven flow only (maps to AC: README)
- [ ] O6 — AGENTS.md updated with agent installation instructions and unsupported-type handling (maps to AC: AGENTS.md, root AGENTS.md line 12)
- [ ] O7 — `forge-bootstrap` skill updated for agent-driven entry (maps to AC: forge-bootstrap)
- [ ] O8 — Generated files regenerated without `workshop.scaffold` (maps to AC: generated files)
- [ ] O9 — Summit findings A1+Q1 addressed: verify `forge create --in-place` produces same artifact set as `workshop.scaffold` (maps to AC: artifact parity)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/onboarding/create.ts` — add `--in-place` flag, conflict check, name-from-folder, remove subdirectory mode
- `packages/forge/os/core/core.module.ts` — update `forge.create` command registration: add `--in-place` flag, make `--name` optional, make `--profile` required, update description
- `packages/forge/src/tests/create.test.ts` — rewrite tests for in-place mode, add conflict-check tests, add name-derivation tests
- `packages/werkstatt/src/workshop/workshop-scaffold.ts` — delete
- `packages/werkstatt/src/workshop/workshop.module.ts` — delete
- `packages/werkstatt/src/workshop/templates.ts` — delete
- `packages/werkstatt/src/workshop/workshop-scaffold.test.ts` — delete
- `packages/werkstatt/src/workshop/index.ts` — delete
- `packages/werkstatt/package.json` — remove `./workshop` and `./workshop-module` from `exports`
- `tools/kernel.config.ts` — remove `workshop` module loader entry

### 2.2 Configuration and data

- `packages/forge/README.md` — rewrite installation guide
- `packages/forge/skills/meta/forge-bootstrap/SKILL.md` — update entry flow description
- `.agents/skills/forge-bootstrap/SKILL.md` — sync with canonical copy

### 2.3 Documentation and specs

- `AGENTS.md` (root) — replace `workshop.scaffold` reference (line 12), add agent installation flow section
- `packages/werkstatt/AGENTS.md` — remove workshop entry points from table
- `docs/authoring/site-composition.md` — remove `workshop.scaffold` reference
- `docs/COMMANDS.md` — regenerate
- `docs/command-manifest.generated.yaml` — regenerate
- `docs/ecosystem.generated.yaml` — regenerate

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec forge rfc.validate --id RFC-0877`

## 3. Step sequence

### Step 1. Verify artifact parity (summit A1+Q1)

**Goal:** Confirm `forge create --in-place` produces the same artifact set as `workshop.scaffold` — specifically `tools/kernel.config.ts`, `.npmrc`, CI workflows, `pnpm-workspace.yaml`, `turbo.json`.

**Agent actions:**

- Compare `getWorkshopFiles()` output in `packages/werkstatt/src/workshop/templates.ts` with `profile.workspace.files` in `packages/forge/profiles/` for each stack profile.
- List any artifacts produced by `workshop.scaffold` but not by `forge.scaffold` (via profile.workspace.files).
- If gaps exist, add missing files to the forge profile's `workspace.files` so `forge create --in-place` produces a complete workshop.

**Validation:**

- Diff `getWorkshopFiles()` paths vs `profile.workspace.files` paths for each profile — zero missing files.

**Completion criterion:** Every file produced by `workshop.scaffold` is also produced by `forge.scaffold` via profile.workspace.files, or explicitly documented as intentionally dropped.

**Human review:** no

---

### Step 2. Update `forge create` command handler

**Goal:** Add `--in-place` flag, conflict check, name-from-folder derivation; remove subdirectory-creation mode.

**Agent actions:**

- In `packages/forge/src/onboarding/create.ts`:
  - Add `--in-place` flag handling: when set, `targetDir = context.workspaceRoot` (not `workspaceRoot/name`).
  - Make `--profile` required (error if missing, list all supported profiles).
  - Make `--name` optional: if omitted, derive from `path.basename(context.workspaceRoot)` via `toKebabCase()`.
  - Add `toKebabCase()` function.
  - Replace empty-directory check with allowlist-based conflict check: refuse only `forge.yaml`, `.agents/`, `docs/`, `skills/`, `AGENTS.md`, `.forge/`; tolerate everything else.
  - Remove the old subdirectory-creation path entirely (`--name` as directory name is no longer accepted).
  - Update `forgeRoot` resolution for in-place mode (summit A2): when `targetDir === context.workspaceRoot`, `forgeRoot` is already in cwd — use `context.forgeRoot` or `resolveForgeRoot(context.workspaceRoot)`.
  - Specify `package.json` merge semantics (summit Q2): if `package.json` exists, forge create overwrites it with the forge project `package.json` (does not merge fields — the operator's `package.json` from `pnpm add -D` is a temporary bootstrap file, not a project config).
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` comments.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`

**Completion criterion:** `runCreate` handles `--in-place` flag, derives name from folder, performs conflict check, and no longer creates subdirectories. TypeScript compiles.

**Human review:** no

---

### Step 3. Update command registration

**Goal:** Update `forge.create` command registration in `core.module.ts` to reflect new flags.

**Agent actions:**

- In `packages/forge/os/core/core.module.ts`:
  - Add `in-place` flag: `{ kind: "boolean", required: true, description: "..." }`.
  - Change `name` flag: `{ kind: "string", required: false, description: "Project name override. If omitted, derived from folder name." }`.
  - Change `profile` flag: `{ kind: "string", required: true, description: "Stack profile id. Required." }`.
  - Update command description to reflect in-place mode only.
  - Update `CHANGE_SUMMARY` comment with RFC-0877 entry.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`

**Completion criterion:** Command registration reflects new flag requirements. TypeScript compiles.

**Human review:** no

---

### Step 4. Delete `workshop.scaffold` from engine

**Goal:** Remove `workshop.scaffold` command, module, templates, tests, barrel, and all references.

**Agent actions:**

- Delete `packages/werkstatt/src/workshop/workshop-scaffold.ts`.
- Delete `packages/werkstatt/src/workshop/workshop.module.ts`.
- Delete `packages/werkstatt/src/workshop/templates.ts`.
- Delete `packages/werkstatt/src/workshop/workshop-scaffold.test.ts`.
- Delete `packages/werkstatt/src/workshop/index.ts`.
- Remove `workshop` entry from `tools/kernel.config.ts` module loaders.
- Remove `./workshop` and `./workshop-module` from `packages/werkstatt/package.json` `exports` field.
- Remove `@warpgogol/werkstatt/workshop` and `@warpgogol/werkstatt/workshop-module` from `packages/werkstatt/AGENTS.md` entry points table.
- Remove "workshop scaffolding (RFC-0779)" from `packages/werkstatt/AGENTS.md` package architecture description.
- Remove `workshop.scaffold` from `packages/forge/AGENTS.md` if referenced.
- Run `pnpm install --no-frozen-lockfile` to verify no broken workspace references.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm install --no-frozen-lockfile` succeeds

**Completion criterion:** All workshop module files deleted, no broken imports, TypeScript compiles, tests pass.

**Human review:** no

---

### Step 5. Update tests

**Goal:** Rewrite `create.test.ts` for in-place mode; remove tests for subdirectory mode.

**Agent actions:**

- In `packages/forge/src/tests/create.test.ts`:
  - Remove tests that use `--name` as directory name (subdirectory creation).
  - Add test: `forge create --in-place --profile <id>` scaffolds in cwd.
  - Add test: missing `--profile` with `--in-place` fails with profile list.
  - Add test: name auto-derived from folder name (kebab-case conversion).
  - Add test: `--name` override used in `forge.yaml` only, not as directory name.
  - Add test: conflict check refuses `forge.yaml` but tolerates `package.json`, `node_modules/`, `.git/`, `.vscode/`.
  - Add test: conflict check refuses `.agents/`, `docs/`, `skills/`, `AGENTS.md`, `.forge/`.
  - Add test: folder name with non-alphanumeric chars is converted to kebab-case.
  - Add test: empty folder name (all non-alphanumeric) fails.
  - Update `CHANGE_SUMMARY` comment.

**Validation:**

- `pnpm --filter @warpgogol/forge run test`

**Completion criterion:** All new tests pass, no old subdirectory-mode tests remain.

**Human review:** no

---

### Step 6. Rewrite README

**Goal:** Rewrite `packages/forge/README.md` to describe only the agent-driven in-place flow.

**Agent actions:**

- Remove global install (`pnpm add -g`) instructions.
- Remove `pnpm dlx` instructions.
- Remove `forge create --name X` subdirectory instructions.
- Add "Installation" section: operator creates empty folder, opens for agent, agent installs forge from npm, agent runs `forge create --in-place --profile <type>`, agent installs engine+plugin.
- Add "Supported profiles" machine-readable table mapping profile id to project type, plugin package, and prerequisites.
- Add migration note for operators with existing global install (summit P1): "If you previously installed forge globally, uninstall it with `pnpm remove -g @warpgogol/forge` — the local devDependency is the only forge you need."

**Validation:**

- Manual review of README content.

**Completion criterion:** README contains only the agent-driven in-place flow, no global install or `pnpm dlx` references.

**Human review:** no

---

### Step 7. Update AGENTS.md files

**Goal:** Update root AGENTS.md and package AGENTS.md files with new installation flow.

**Agent actions:**

- In root `AGENTS.md`:
  - Replace line 12 (`workshop.scaffold` reference) with `forge create --in-place` instructions.
  - Add "Installation flow" section with agent instructions: check supported profiles via `listStackProfiles()` or README, run `forge create --in-place --profile <id>`, install engine+plugin packages, report unsupported types to operator.
  - Add agent verification step (summit S1): agent verifies package names against README profiles table before installation.
  - Add `listStackProfiles()` as programmatic fallback for supported types (summit D2).
- In `packages/werkstatt/AGENTS.md`:
  - Remove workshop entry points from table (already done in Step 4).
  - Remove "workshop scaffolding (RFC-0779)" from package architecture description (already done in Step 4).
- In `docs/authoring/site-composition.md`:
  - Remove `workshop.scaffold` reference.

**Validation:**

- `grep -r "workshop.scaffold" AGENTS.md docs/authoring/ packages/*/AGENTS.md` returns zero matches (excluding archive and RFC files).

**Completion criterion:** No `workshop.scaffold` references in active AGENTS.md or authoring docs. Root AGENTS.md has installation flow section.

**Human review:** no

---

### Step 8. Update forge-bootstrap skill

**Goal:** Update `forge-bootstrap` skill to reflect agent-driven entry flow.

**Agent actions:**

- In `packages/forge/skills/meta/forge-bootstrap/SKILL.md`:
  - Update description to reflect that the operator's agent ran `forge create --in-place`, not a terminal command.
  - Remove any references to terminal-driven `forge create --name X`.
  - Keep guardrails, process steps, and version check unchanged.
- Sync `.agents/skills/forge-bootstrap/SKILL.md` with the canonical copy.

**Validation:**

- `pnpm exec forge skill.validate` passes with 0 violations.

**Completion criterion:** Skill updated and synced, `skill.validate` passes.

**Human review:** no

---

### Step 9b. Version bump

**Goal:** Bump `@warpgogol/forge` to 2.0.0 and `@warpgogol/werkstatt` to next major version in `package.json` files.

**Agent actions:**

- In `packages/forge/package.json`: bump `version` to `2.0.0`.
- In `packages/werkstatt/package.json`: bump `version` to next major.
- Update `optionalDependencies` in `packages/forge/package.json` if werkstatt version range needs adjustment.
- Run `pnpm install --no-frozen-lockfile` to update lockfile.

**Validation:**

- `pnpm install --no-frozen-lockfile` succeeds.
- `pnpm --filter @warpgogol/forge run build:check` and `pnpm --filter @warpgogol/werkstatt run build:check` pass.

**Completion criterion:** Both packages have major version bumps in package.json, lockfile updated, builds pass.

**Human review:** no

---

### Step 9. Regenerate generated files

**Goal:** Regenerate `docs/COMMANDS.md`, `docs/command-manifest.generated.yaml`, `docs/ecosystem.generated.yaml` to remove `workshop.scaffold` entries.

**Agent actions:**

- Run `pnpm exec werkstatt run ecosystem.manifest.generate` (or equivalent regeneration command).
- Verify `workshop.scaffold` is absent from all generated files.
- Also update `packages/forge/README.uk.md` with the same changes as `packages/forge/README.md` (Step 6).

**Validation:**

- `grep "workshop.scaffold" docs/COMMANDS.md docs/command-manifest.generated.yaml docs/ecosystem.generated.yaml docs/decision-log.generated.yaml docs/decision-log.generated.md` returns zero matches.

**Completion criterion:** Generated files contain no `workshop.scaffold` entries. `README.uk.md` updated.

**Human review:** no

---

### Step 10. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec forge rfc.validate --id RFC-0877`.
- Run `pnpm --filter @warpgogol/forge run build:check` and `pnpm --filter @warpgogol/werkstatt run build:check`.
- Run `pnpm --filter @warpgogol/forge run test` and `pnpm --filter @warpgogol/werkstatt run test`.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0877 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec forge rfc.validate --id RFC-0877` — passes.
- All build:check and test commands pass.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec forge rfc.validate --id RFC-0877`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec forge skill.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0877` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0877.generated.json` — verification evidence (if acceptance probes declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Breaking change for existing users | Step 2 removes old mode entirely; Step 6 README documents migration path |
| Agent misinterprets unsupported project types | Step 7 AGENTS.md instructions mandate checking supported profiles table |
| Conflict check false positives | Step 2 uses allowlist approach — only forge-specific files refused |
| Folder name produces invalid kebab-case | Step 2 `toKebabCase()` fails on empty result; Step 5 tests this edge case |
| Major version bump coordination | Step 10 verifies both packages build and test cleanly |
| Artifact parity (summit A1+Q1) | Step 1 verifies `forge create --in-place` produces same artifact set as `workshop.scaffold` |
| `package.json` merge semantics (summit Q2) | Step 2 specifies overwrite semantics (not merge) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-64, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0877 --reason "..." --invariant "DNA-64"` instead of working around it.
- If `workshop.scaffold` deletion reveals hidden engine dependencies not identified during exploration, stop and create a new RFC for the dependency removal.
- If artifact parity (Step 1) reveals that `workshop.scaffold` produces artifacts that cannot be produced by `forge.scaffold` via profile.workspace.files, stop and document the gap — a separate RFC may be needed for the missing artifacts.
