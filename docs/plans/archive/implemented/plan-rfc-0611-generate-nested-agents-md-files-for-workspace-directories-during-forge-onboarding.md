---
rfcId: RFC-0611
planId: PLAN-RFC-0611-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0611

## 1. Objectives

- [ ] Objective 1 — `forge.agents.generate` discovers workspace directories and generates nested `AGENTS.md` with generated marker (maps to acceptance criterion 1)
- [ ] Objective 2 — workspace type auto-detection classifies app/service/package correctly (maps to acceptance criterion 2)
- [ ] Objective 3 — edit guard skips hand-written nested `AGENTS.md`, regenerates generated ones (maps to acceptance criteria 3, 4)
- [ ] Objective 4 — `forge.upgrade` generates missing nested `AGENTS.md` and regenerates stale generated ones (maps to acceptance criterion 5)
- [ ] Objective 5 — `forge.doctor` reports missing, stale, and hand-written improvement opportunities (maps to acceptance criterion 6)
- [ ] Objective 6 — `forge-bootstrap` proposes improvements to hand-written `AGENTS.md` during transplant (maps to acceptance criterion 7)
- [ ] Objective 7 — `--json` output includes `generated` and `skipped` arrays for root + nested files (maps to acceptance criterion 8)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/onboarding/agents-generate.ts` — extend `runAgentsGenerate` with workspace discovery, type auto-detection, nested file generation, `skipped` array in result
- `packages/forge/src/onboarding/upgrade.ts` — extend `runUpgrade` to call nested AGENTS.md generation after skill sync
- `packages/forge/src/onboarding/doctor.ts` — extend `runDoctor` with nested AGENTS.md checks (missing, stale, hand-written improvement)
- `packages/forge/src/onboarding/workspace-discovery.ts` — **new file** — `discoverWorkspaces`, `detectWorkspaceType`, `WorkspaceDir` interface
- `packages/forge/src/onboarding/nested-agents-templates.ts` — **new file** — `buildNestedAgentsMd` pure function (minimal stub: generated marker, type label, root reference, 2-3 lines type-specific guidance)
- `packages/forge/src/onboarding/nested-agents-generate.ts` — **new file** — `generateNestedAgentsMd` function (discovery + edit guard + write, reused by `runAgentsGenerate` and `runUpgrade`)
- `packages/forge/src/tests/agents-generate.test.ts` — extend with nested generation tests
- `packages/forge/src/tests/workspace-discovery.test.ts` — **new file** — unit tests for discovery and type detection
- `packages/forge/src/tests/upgrade.test.ts` — extend with nested generation tests (if exists, else add)
- `packages/forge/src/tests/doctor.test.ts` — extend with nested AGENTS.md check tests (if exists, else add)

### 2.2 Configuration and data

- `packages/forge/src/types.ts` — extend `AgentsGenerateResult` with `skipped: string[]` and `renderedFiles?: { [path: string]: string }` fields (dryRun support, RFC-0601 pattern)

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — add rule about workspace-type detection being defined in RFC-0611 (agents MUST NOT add new detection rules without an amending RFC)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge run build:check` — typecheck
- `pnpm --filter @warpgogol/forge run test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0611` — RFC validation

## 3. Step sequence

### Step 1. Workspace discovery and type detection

**Goal:** Create the workspace discovery module that scans for `package.json` directories and auto-detects workspace type.

**Agent actions:**

- Create `packages/forge/src/onboarding/workspace-discovery.ts` with:
  - `WorkspaceDir` interface: `{ path: string; type: "app" | "package" | "service"; hasAgentsMd: boolean; isGenerated: boolean }`
  - `discoverWorkspaces(workspaceRoot: string): WorkspaceDir[]` — recursively scan for directories containing `package.json`, skip `node_modules/`, `.git/`, `dist/`, `.turbo/`, `.cache/`, `.agents/`
  - `detectWorkspaceType(dirPath: string): "app" | "service" | "package" | null` — check for `astro.config.*` (app), `Dockerfile` or `service.config.yaml` (service), else `package`. Return null if no `package.json`.
  - Precedence: app > service > package
- Add MODULE_CONTRACT and CHANGE_SUMMARY Compass headers
- Export from `packages/forge/src/utils/index.ts` or a new barrel if appropriate

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — typecheck passes

**Completion criterion:** `workspace-discovery.ts` exists, exports `discoverWorkspaces` and `detectWorkspaceType`, typecheck passes.

**Human review:** no

---

### Step 2. Nested AGENTS.md template builder (minimal stub)

**Goal:** Create a pure function that renders nested AGENTS.md content for a workspace.

**Agent actions:**

- Create `packages/forge/src/onboarding/nested-agents-templates.ts` with:
  - `buildNestedAgentsMd(workspace: WorkspaceDir, config: ForgeConfig): string` — pure function, no I/O
  - Uses `buildGeneratedHeader` from `utils/generated-marker.ts` with `filePath: "AGENTS.md"`, `ownerCommand: "forge.agents.generate"`, `commandPrefix: "forge"`
  - **Minimal stub content** (per grilling decision): generated marker header, `# Agent Guide: <workspace path>` title, workspace type label (`app` / `package` / `service`), reference to root `AGENTS.md` for project-wide rules, 2-3 lines of type-specific guidance:
    - **app**: "This is an app workspace. Follow thin-route and content-driven composition rules from the root AGENTS.md."
    - **package**: "This is a package workspace. Expose stable typed APIs. Do not import from apps or services."
    - **service**: "This is a service workspace. Runtime composition only. Shared schemas and validators belong in packages."
  - Content evolves in code without RFC amendments (per RFC non-goal)
- Add MODULE_CONTRACT and CHANGE_SUMMARY Compass headers

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — typecheck passes

**Completion criterion:** `nested-agents-templates.ts` exists, exports `buildNestedAgentsMd`, produces content with `GENERATED_MARKER`, typecheck passes.

**Human review:** no

---

### Step 3. Extract `generateNestedAgentsMd` and extend `forge.agents.generate`

**Goal:** Create a reusable nested generation function and integrate it into `runAgentsGenerate`. Also add dryRun support (RFC-0601 pattern) for staleness detection.

**Agent actions:**

- Create `packages/forge/src/onboarding/nested-agents-generate.ts` with:
  - `generateNestedAgentsMd(workspaceRoot: string, config: ForgeConfig, dryRun: boolean): { generated: string[]; skipped: string[]; renderedFiles: { [path: string]: string } }` — discovery + edit guard + write (or render-only in dryRun)
  - Uses `discoverWorkspaces`, `buildNestedAgentsMd`, `hasGeneratedMarker`, `writeFileIfChanged`
  - In dryRun mode: skip edit guards, render all workspaces, return content in `renderedFiles` (no file writes)
  - In normal mode: check edit guard per workspace, write via `writeFileIfChanged`, populate `generated` and `skipped` arrays
  - Add MODULE_CONTRACT and CHANGE_SUMMARY Compass headers
- In `packages/forge/src/onboarding/agents-generate.ts`:
  - After root `AGENTS.md` generation, call `generateNestedAgentsMd(workspaceRoot, config, dryRun)`
  - Merge nested `generated`/`skipped`/`renderedFiles` into result
  - Extend `AgentsGenerateResult` with `skipped: string[]` and `renderedFiles?: { [path: string]: string }` (dryRun mode)
  - When `context.dryRun` is true: skip root edit guard, render root content into `renderedFiles` too, skip all file writes
  - Update CHANGE_SUMMARY with RFC-0611 entry
- The root AGENTS.md edit guard (hand-written check, exit 1) remains unchanged in normal mode — it runs first, before any nested generation

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — typecheck passes
- Existing tests in `agents-generate.test.ts` still pass (root-only behavior preserved when no workspaces exist)

**Completion criterion:** `runAgentsGenerate` generates nested files, returns `generated`/`skipped`/`renderedFiles` arrays, dryRun mode works, typecheck passes, existing tests pass.

**Human review:** no

---

### Step 4. Extend `forge.upgrade` with nested generation

**Goal:** Extend `runUpgrade` to generate missing nested AGENTS.md and regenerate stale generated ones.

**Agent actions:**

- In `packages/forge/src/onboarding/upgrade.ts`:
  - After skill sync (step 3) and before doctor (step 6), call `generateNestedAgentsMd(workspaceRoot, config, false)` (normal mode, not dryRun)
  - This reuses the shared function from Step 3 — no logic duplication
  - Hand-written files are skipped (edit guard inside `generateNestedAgentsMd`)
  - Generated files are regenerated if content differs (`writeFileIfChanged` handles this)
  - Update CHANGE_SUMMARY with RFC-0611 entry
  - Add `nestedAgentsGenerated: string[]` to `UpgradeResult`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — typecheck passes

**Completion criterion:** `runUpgrade` generates/regenerates nested AGENTS.md files via shared function, typecheck passes.

**Human review:** no

---

### Step 5. Extend `forge.doctor` with nested AGENTS.md checks (dryRun pattern)

**Goal:** Extend `runDoctor` to report missing, stale, and hand-written improvement opportunities using the dryRun pattern (RFC-0601).

**Agent actions:**

- In `packages/forge/src/onboarding/doctor.ts`:
  - Add check "nested-AGENTS.md-missing" — workspace directories without AGENTS.md (info diagnostic)
  - Add check "nested-AGENTS.md-stale" — call `runAgentsGenerate` with `dryRun: true` to get `renderedFiles`, compare each rendered nested file to the committed file on disk. If content differs — warning diagnostic. This follows the RFC-0601 dryRun pattern: re-invoke the generator in memory, compare output to committed file.
  - Add check "nested-AGENTS.md-handwritten" — hand-written files (no generated marker) analyzed for forge conventions (generated marker presence, reference to root AGENTS.md, workspace-type sections). Info diagnostic with suggestions. The specific convention checks are an implementation detail.
  - Update CHANGE_SUMMARY with RFC-0611 entry

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — typecheck passes

**Completion criterion:** `runDoctor` reports three new check categories using dryRun pattern for staleness, typecheck passes.

**Human review:** no

---

### Step 6. Extend `forge-bootstrap` skill with hand-written improvement proposals (LLM instructions)

**Goal:** During transplant onboarding, propose improvements to existing hand-written AGENTS.md files via LLM instructions in SKILL.md.

**Agent actions:**

- In `packages/forge/skills/forge-bootstrap/SKILL.md` (transplant onboarding step):
  - Add a step that instructs the LLM to check existing hand-written `AGENTS.md` files in workspace directories
  - LLM checks for: generated marker presence (should be absent for hand-written), reference to root `AGENTS.md`, workspace-type-appropriate sections
  - If improvement opportunities are found, LLM proposes them to the operator in creator-facing language (per RFC-0542 output contract)
  - Improvements are applied only with operator confirmation — the LLM asks before modifying any file
  - No new programmatic command — the check is LLM-driven per the skill's existing pattern

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate` — skill validation passes (SKILL-01..17)

**Completion criterion:** `forge-bootstrap` SKILL.md includes transplant step with LLM instructions for hand-written AGENTS.md improvement proposals.

**Human review:** no

---

### Step 7. Unit tests

**Goal:** Comprehensive unit tests for all new functionality.

**Agent actions:**

- Create `packages/forge/src/tests/workspace-discovery.test.ts`:
  - Test `discoverWorkspaces` finds directories with `package.json`
  - Test skip directories (`node_modules/`, `.git/`, etc.)
  - Test `detectWorkspaceType` classifies app (astro.config), service (Dockerfile, service.config.yaml), package (package.json only)
  - Test precedence: app > service > package
  - Test no markers → null (skipped)
- Extend `packages/forge/src/tests/agents-generate.test.ts`:
  - Test nested AGENTS.md generated for workspace directories
  - Test hand-written nested AGENTS.md skipped (in `skipped` array)
  - Test generated nested AGENTS.md regenerated when content differs
  - Test `generated` array includes nested paths
  - Test `skipped` array includes hand-written paths
  - Test idempotency — running twice produces same content
  - Test no workspaces → only root AGENTS.md generated (existing behavior)
  - Test dryRun mode: no file writes, `renderedFiles` contains root + nested content
  - Test dryRun mode: edit guard skipped (renders even for hand-written root)
- Add tests for `generateNestedAgentsMd` (shared function)
- Add tests for upgrade nested AGENTS.md behavior (extend existing test files or create new ones)
- Add tests for doctor nested AGENTS.md checks (staleness via dryRun, missing, hand-written)

**Validation:**

- `pnpm --filter @warpgogol/forge run test` — all tests pass

**Completion criterion:** All new tests pass, existing tests still pass.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Update `packages/forge/AGENTS.md` with new rules.

**Agent actions:**

- In `packages/forge/AGENTS.md`:
  - Add rule under "Core behavioral layer" or a new section: "Workspace-type detection rules (app/service/package) are defined in RFC-0611. Agents MUST NOT add new detection rules without an amending RFC."
  - Update the `forge.agents.generate` description to mention nested file generation

**Validation:**

- `git diff packages/forge/AGENTS.md` shows the new rule

**Completion criterion:** `packages/forge/AGENTS.md` updated with workspace-type detection rule.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` is updated (step 8).
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0611` — must pass.
- Run `pnpm --filter @warpgogol/forge run build:check` — must pass.
- Run `pnpm --filter @warpgogol/forge run test` — all tests pass.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0611 --implementation-commit <sha>`. Commit the stamp transition separately.

**Validation:**

- `git status` — no uncommitted changes from this session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0611` — passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; `git status` clean.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0611`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0611` in the subject line
- Acceptance criteria annotations with `(evidence: <file:line>)` in the RFC file

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Type auto-detection misclassifies a workspace | Step 1: precedence rules (app > service > package); Step 7: tests for all detection scenarios |
| Generated nested AGENTS.md becomes stale | Step 5: doctor staleness check via in-memory comparison; Step 4: upgrade regenerates stale files |
| Agents ignore generated marker and edit by hand | Step 3: edit guard skips hand-written files; Step 5: doctor detects marker loss |
| forge-bootstrap proposals are noisy | Step 6: opt-in with operator confirmation, creator-facing language |
| Performance — scanning all directories | Step 1: skip `node_modules/`, `.git/`, `dist/`, `.turbo/`, `.cache/`; O(n) scan is acceptable for non-pipeline command |
| Concurrent execution / interrupted writes | Step 3: use `writeFileIfChanged` (which uses `writeFileAtomic`) for all writes |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0611 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the type-specific template content requires RFC-level specification (contrary to the non-goal), create an amending RFC via `fo-idea-create-rfc` with `amends: [RFC-0611]`.
