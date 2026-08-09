---
rfcId: RFC-0664
planId: PLAN-RFC-0664-01
status: draft
owner: architecture
createdAt: 2026-08-03
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - AGENTS.md
    - .agents/skills/fo-session-retro/SKILL.md
    - .agents/skills/fo-handoff/SKILL.md
    - .agents/skills/fo-memory-sync/SKILL.md
    - packages/forge/skills/fo/fo-session-retro/SKILL.md
    - packages/forge/skills/fo/fo-handoff/SKILL.md
    - packages/forge/skills/fo/fo-memory-sync/SKILL.md
---

# Implementation Plan: RFC-0664

## 1. Objectives

- [ ] Objective 1 — Create `scaffoldMemoryLayer` in `packages/forge/src/onboarding/memory-scaffold.ts` with idempotent creation of `MEMORY.md`, `daily/.gitkeep`, and marker-delimited `.gitignore` block — maps to acceptance criterion 1
- [ ] Objective 2 — Wire `scaffoldMemoryLayer` into `forge.create` and `forge.upgrade` — maps to acceptance criterion 1
- [ ] Objective 3 — Add memory-layer health checks to `forge.doctor` (budget usage, gitignore coverage, daily count, leak warning) — maps to acceptance criterion 2
- [ ] Objective 4 — Change `fo-session-retro` Context routing to daily logs / MEMORY.md with Memory DB as optional mirror — maps to acceptance criterion 3
- [ ] Objective 5 — Add memory layer pointer to `fo-handoff` and import-source to `fo-memory-sync` — maps to acceptance criterion 4
- [ ] Objective 6 — Add session-start read rule to `forge.agents.generate` template; add equivalent note to this monorepo's hand-written root AGENTS.md; amend `.agents/**` convention in root AGENTS.md and `fo-session-retro` constraint — maps to acceptance criterion 5
- [ ] Objective 7 — Write unit tests for scaffold idempotency, gitignore marker handling, doctor warning conditions — maps to acceptance criterion 7

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/onboarding/memory-scaffold.ts` — **new file**: `scaffoldMemoryLayer()` + `checkMemoryLayerHealth()` functions
- `packages/forge/src/onboarding/create.ts` — call `scaffoldMemoryLayer` after `runInit` (step 7.5)
- `packages/forge/src/onboarding/upgrade.ts` — call `scaffoldMemoryLayer` after skill sync (step 3.5)
- `packages/forge/src/onboarding/doctor.ts` — add `checkMemoryLayer` check function, wire into `runDoctor` checks array
- `packages/forge/src/onboarding/agents-generate.ts` — add session-start read rule section to generated AGENTS.md content
- `packages/forge/src/config/forge-config.ts` — add `bindings.memory.budget` to `forgeBindingsSchema` (optional, default 4096)
- `packages/forge/src/tests/memory-scaffold.test.ts` — **new file**: unit tests

### 2.2 Configuration and data

- `forge.yaml` (this monorepo) — no change required (`bindings.memory.budget` is optional with default 4096)
- `.gitignore` (consumer projects) — scaffolded by `forge.create`/`forge.upgrade` with marker-delimited block
- `.agents/memory/MEMORY.md` — scaffolded template (this monorepo gets it via `forge.upgrade`)
- `.agents/memory/daily/.gitkeep` — scaffolded

### 2.3 Documentation and specs

- `AGENTS.md` (root, this monorepo) — amend `.agents/**` rule to recognise `.agents/memory/` as active context store; add session-start read rule note
- `.agents/skills/fo-session-retro/SKILL.md` — change Context routing table cell; amend `.agents/**` constraint text
- `.agents/skills/fo-handoff/SKILL.md` — add memory layer pointer
- `.agents/skills/fo-memory-sync/SKILL.md` — add memory layer as import source
- `packages/forge/skills/fo/fo-session-retro/SKILL.md` — source of truth for the synced copy
- `packages/forge/skills/fo/fo-handoff/SKILL.md` — source of truth for the synced copy
- `packages/forge/skills/fo/fo-memory-sync/SKILL.md` — source of truth for the synced copy

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge run build:check` — typecheck for forge package
- `pnpm --filter @warpgogol/forge run test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0664` — RFC validation
- No pipeline integration (memory layer is agent-facing state, never build input)

## 3. Step sequence

### Step 1. TypeScript contracts and config schema

**Goal:** Create the `memory-scaffold.ts` module with types and scaffold function, and add `bindings.memory.budget` to the config schema.

**Agent actions:**

- Create `packages/forge/src/onboarding/memory-scaffold.ts` with:
  - `MemoryScaffoldResult` interface (`created`, `gitignoreUpdated`, `skipped`)
  - `MemoryLayerHealth` interface (`memoryMdChars`, `budget`, `gitignoreCoversDaily`, `dailyFileCount`)
  - `scaffoldMemoryLayer(workspaceRoot: string): MemoryScaffoldResult` — idempotent: creates `.agents/memory/MEMORY.md` template, `.agents/memory/daily/.gitkeep`, and marker-delimited `.gitignore` block. Never overwrites existing files.
  - `checkMemoryLayerHealth(workspaceRoot: string): MemoryLayerHealth` — reads `MEMORY.md` char count, counts daily files, checks gitignore coverage, resolves budget from `bindings.memory.budget` (default 4096).
  - Marker constants: `MEMORY_GITIGNORE_START = "# forge-agent-memory"`, `MEMORY_GITIGNORE_END = "# /forge-agent-memory"`.
  - `MEMORY.md` template content with header and `## Current focus` / `## Decisions in flight` / `## Environment notes` sections.
- Add `bindings.memory.budget` to `forgeBindingsSchema` in `packages/forge/src/config/forge-config.ts` as `z.number().int().positive().optional().default(4096)`.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes with the new module.

**Completion criterion:** `memory-scaffold.ts` exists, exports `scaffoldMemoryLayer` and `checkMemoryLayerHealth`, and `build:check` passes.

**Human review:** no

---

### Step 2. Wire scaffold into forge.create and forge.upgrade

**Goal:** Integrate `scaffoldMemoryLayer` into the existing onboarding pipeline.

**Agent actions:**

- In `packages/forge/src/onboarding/create.ts`: after `runInit` (step 7) and before `runAgentsGenerate` (step 9), call `scaffoldMemoryLayer(targetDir)`. Add scaffolded files to `filesCreated` array. Log created paths in pretty mode.
- In `packages/forge/src/onboarding/upgrade.ts`: after `syncForgeSkills` + `syncPackSkills` (step 3b) and before `addMissingBindingDefaults` (step 4), call `scaffoldMemoryLayer(workspaceRoot)`. Track `gitignoreUpdated` in the upgrade result.
- Both calls must be idempotent — if `.agents/memory/MEMORY.md` already exists, it goes to `skipped`, not `created`.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes.
- Manual: run `forge.create --name test-mem --profile forge-shell` in a temp dir and verify `.agents/memory/MEMORY.md`, `.agents/memory/daily/.gitkeep`, and `.gitignore` block exist.

**Completion criterion:** `forge.create` scaffolds the memory layer; `forge.upgrade` adds it to existing projects; both are idempotent.

**Human review:** no

---

### Step 3. Add memory-layer health checks to forge.doctor

**Goal:** Wire `checkMemoryLayerHealth` into the doctor diagnostics.

**Agent actions:**

- In `packages/forge/src/onboarding/doctor.ts`:
  - Import `checkMemoryLayerHealth` from `./memory-scaffold.ts`.
  - Add a `checkMemoryLayer` function that calls `checkMemoryLayerHealth` and returns a `DoctorCheck`:
    - `status: "pass"` when `gitignoreCoversDaily` is true and `memoryMdChars <= budget`.
    - `status: "warn"` when `gitignoreCoversDaily` is false AND `dailyFileCount > 0` (leak risk), OR when `memoryMdChars > budget` (over budget).
    - `status: "pass"` when `dailyFileCount === 0` and gitignore block is absent (no leak risk yet).
    - Message includes `memoryMdChars/budget`, `dailyFileCount`, and `gitignoreCoversDaily` status.
  - Wire `checkMemoryLayer` into the `checks` array in `runDoctor`, after the `knowledge-budgets` check (line ~881).
  - Add `memoryLayer` to the doctor JSON output (alongside `checks`, `allPass`, etc.).
- Update the `DoctorCheck` CHANGE_SUMMARY comment with RFC-0664 entry.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes.
- Manual: run `forge.doctor --json` in a project with `.agents/memory/` and verify `memoryLayer` fragment appears.

**Completion criterion:** `forge.doctor` reports memory-layer health and warns on untracked-daily leak risk; warnings never change exit code (advisory only).

**Human review:** no

---

### Step 4. Add session-start read rule to forge.agents.generate

**Goal:** Generated AGENTS.md files include the memory-layer read discipline.

**Agent actions:**

- In `packages/forge/src/onboarding/agents-generate.ts`: add a new section to `dynamicLines` after the behavioral layer section (after line ~491). The section should contain:
  - `## Project memory layer` heading
  - Brief explanation: `.agents/memory/MEMORY.md` is the curated hot store (versioned); `.agents/memory/daily/YYYY-MM-DD.md` are append-only warm logs (git-ignored).
  - Read discipline: "At session start, read `MEMORY.md` (always), then `daily/<today>.md` and `daily/<yesterday>.md` (if present). Older daily files are cold — use grep when a task references past context."
  - Note that this is advisory, not mechanically enforced.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes.
- Manual: run `forge.agents.generate --dry-run` and verify the read rule section appears in `renderedFiles["AGENTS.md"]`.

**Completion criterion:** Generated AGENTS.md includes the session-start read rule.

**Human review:** no

---

### Step 5. Update fo-session-retro skill — Context routing change

**Goal:** Change the Context category destination from Memory DB to `.agents/memory/`.

**Agent actions:**

- In `packages/forge/skills/fo/fo-session-retro/SKILL.md`:
  - Update the routing table (line ~46): change Context row destination from "Memory DB" to "`.agents/memory/daily/<today>.md` (default) or `MEMORY.md` (when durable); Memory DB optional mirror".
  - Update the mechanism column: "Direct edit (daily log append) or curated edit (MEMORY.md); Memory DB via `create_memory` tool (optional mirror)".
  - Update step 4f (Context → memory): replace `create_memory` tool instructions with daily-log append instructions. Add the per-insight choice: daily (ephemeral) vs MEMORY.md (durable, curated). Both require operator confirmation.
  - Add redaction discipline note: "Redact API keys, passwords, and PII before appending to daily logs."
  - Amend the `.agents/**` constraint text (lines 147, 280): change from "`.agents/**` is reference/historical only" to "`.agents/**` is reference/historical only, except `.agents/memory/` (active context store, RFC-0664) and `.agents/skills/` (synced by forge) and `.agents/operator-profile.md` (written by this skill)".
- Sync the change to `.agents/skills/fo-session-retro/SKILL.md` (the synced copy must match the source).

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --name fo-session-retro` passes.
- Diff between `packages/forge/skills/fo/fo-session-retro/SKILL.md` and `.agents/skills/fo-session-retro/SKILL.md` is empty.

**Completion criterion:** `fo-session-retro` routes Context to `.agents/memory/` with Memory DB as optional mirror; constraint text amended.

**Human review:** no

---

### Step 6. Update fo-handoff and fo-memory-sync skills

**Goal:** Add memory layer pointer to handoff and import-source to memory-sync.

**Agent actions:**

- In `packages/forge/skills/fo/fo-handoff/SKILL.md`:
  - In step 2 (Write the handoff document), add a bullet: "Reference `.agents/memory/MEMORY.md` and recent daily logs for current project context. The next agent should read them at session start per the read discipline."
  - Do not duplicate the read discipline text — reference the AGENTS.md rule.
- In `packages/forge/skills/fo/fo-memory-sync/SKILL.md`:
  - In step 3 (Discover external memory and sessions), add a new subsection 3d: "Project memory layer" — read `.agents/memory/daily/` files as import source material, same direction as Codex memories. Present relevant daily-log entries to the operator for import decisions.
  - In the routing table (step 6), add: "Project context from daily logs | `.agents/memory/MEMORY.md` or `docs/sessions/` | Direct edit or session file".
  - Clarify: no bidirectional sync, no export direction.
- Sync both changes to `.agents/skills/fo-handoff/SKILL.md` and `.agents/skills/fo-memory-sync/SKILL.md`.

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --name fo-handoff` passes.
- `pnpm exec werkstatt run forge.skill.validate --name fo-memory-sync` passes.
- Diffs between source and synced copies are empty.

**Completion criterion:** `fo-handoff` references the memory layer; `fo-memory-sync` treats it as an import source.

**Human review:** no

---

### Step 7. Amend root AGENTS.md

**Goal:** Amend the `.agents/**` convention in this monorepo's hand-written AGENTS.md and add the session-start read rule note.

**Agent actions:**

- In `AGENTS.md` (root):
  - Amend line 99: change "Keep `.agents/**` as reference or historical documentation, not as the primary active instruction layer." to "Keep `.agents/**` as reference or historical documentation, not as the primary active instruction layer. **Exception:** `.agents/memory/` is an active context store (RFC-0664) — curated `MEMORY.md` is versioned, `daily/` logs are git-ignored."
  - Add a new section or paragraph after the existing agent rules block: "## Session-start memory read discipline" with the read rule (MEMORY.md + today/yesterday daily logs). Note this is advisory.

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0664` passes (AGENTS.md change doesn't affect RFC validation, but confirms no regressions).

**Completion criterion:** Root AGENTS.md recognises `.agents/memory/` as an active context store and includes the read discipline note.

**Human review:** no — this is a documentation amendment directed by the accepted RFC.

---

### Step 7.5. Run forge.upgrade on this monorepo

**Goal:** Scaffold the memory layer in this monorepo so `.agents/memory/` exists here too, not only in new/external projects.

**Agent actions:**

- After all code changes (Steps 1–7) are committed, run `pnpm exec werkstatt run forge.upgrade` in this monorepo.
- Verify `.agents/memory/MEMORY.md` and `.agents/memory/daily/.gitkeep` are created.
- Verify `.gitignore` has the marker-delimited `forge-agent-memory` block.
- Commit the scaffolded files: `git add .agents/memory/MEMORY.md .agents/memory/daily/.gitkeep .gitignore && git commit -m "chore: scaffold memory layer via forge.upgrade (RFC-0664)"`.

**Validation:**

- `ls .agents/memory/MEMORY.md .agents/memory/daily/.gitkeep` — both exist.
- `grep -q "forge-agent-memory" .gitignore` — marker block present.
- `pnpm exec werkstatt run forge.doctor --json` — `memoryLayer` fragment appears with `gitignoreCoversDaily: true`.

**Completion criterion:** This monorepo has `.agents/memory/` scaffolded and committed.

**Human review:** no

---

### Step 8. Unit tests

**Goal:** Cover scaffold idempotency, gitignore marker handling, and doctor warning conditions.

**Agent actions:**

- Create `packages/forge/src/tests/memory-scaffold.test.ts` with:
  - **Scaffold idempotency:** call `scaffoldMemoryLayer` twice on the same temp dir; verify second call returns `created: []`, `skipped: ["MEMORY.md", "daily/.gitkeep"]`, `gitignoreUpdated: false`.
  - **Gitignore marker handling:** scaffold on a dir with existing `.gitignore` content; verify marker block is inserted without duplicating; verify existing content above and below markers is preserved.
  - **Gitignore already has block:** scaffold on a dir where `.gitignore` already contains the marker block; verify `gitignoreUpdated: false`.
  - **Doctor health — healthy:** create memory layer with small `MEMORY.md` and gitignore block; verify `checkMemoryLayerHealth` returns `gitignoreCoversDaily: true`, `memoryMdChars <= budget`.
  - **Doctor health — leak risk:** create daily files without gitignore block; verify `checkMemoryLayerHealth` returns `gitignoreCoversDaily: false`.
  - **Doctor health — over budget:** create `MEMORY.md` exceeding 4096 chars; verify `memoryMdChars > budget`.
  - **Doctor health — no daily files, no gitignore:** verify `gitignoreCoversDaily: false` but `dailyFileCount === 0` (no leak risk, doctor should stay silent).

**Validation:**

- `pnpm --filter @warpgogol/forge run test` passes with all new tests green.

**Completion criterion:** All test cases pass; test file covers idempotency, gitignore handling, and all doctor warning conditions.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify all files listed in `scope.docs` are updated — check each path against `git diff`.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `forge.create`/`forge.upgrade`/`forge.doctor`/`forge.agents.generate` behavior changed — check if manifest needs refresh).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in RFC-0664 against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Dogfood check:** verify that a fresh agent following only the documented read discipline can reconstruct current project context from files (acceptance criterion 6). This can be verified by checking that `MEMORY.md` template + daily logs exist and the read rule is in AGENTS.md.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0664 --implementation-commit <sha>`. Ensure working tree is clean before stamping.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0664`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0664`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0664` (RFC-0330, for probe-bearing RFCs created on or after 2026-07-07)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0664.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0664` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| MEMORY.md becomes a junk drawer | Step 3 (doctor budget warning, advisory) + Step 5 (curation only through retro with operator confirmation) |
| Sensitive content in versioned MEMORY.md | Step 5 (retro redaction discipline) + Step 8 (daily logs are git-ignored, redaction test) |
| Agents skip the session-start read | Step 4 (read rule in generated AGENTS.md) + Step 7 (read rule in root AGENTS.md) — advisory enforcement model |
| Dual-write drift between files and Memory DB | Step 5 (files declared source of truth, Memory DB is optional mirror) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0664 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `.agents/**` convention amendment in Step 7 reveals a deeper conflict with the root AGENTS.md instruction model, escalate via `rfc.supersede.propose` rather than weakening the convention.
