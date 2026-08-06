---
rfcId: RFC-0710
planId: PLAN-RFC-0710-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - docs/explorations/
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0710

## 1. Objectives

- [ ] Objective 1 — Create `fo-explore` skill in `packages/forge/skills/fo/fo-explore/SKILL.md` and sync to `.agents/skills/fo-explore/SKILL.md` (maps to acceptance criteria 1, 2)
- [ ] Objective 2 — Create `docs/explorations/` directory with `.gitkeep` (maps to acceptance criterion 3)
- [ ] Objective 3 — Create `forgeExplorationModule` in `packages/forge/os/exploration/` with `exploration.list`, `exploration.show`, `exploration.archive` commands (maps to acceptance criteria 4, 5, 6, 7)
- [ ] Objective 4 — Update `fo-idea` skill with explore suggestion step 1b (maps to acceptance criterion 8)
- [ ] Objective 5 — Update `packages/forge/AGENTS.md` with new skill count and OS module entry (maps to acceptance criterion 9)
- [ ] Objective 6 — Pass `skill.validate` on `fo-explore` SKILL.md and `rfc.validate` on RFC-0710 (maps to acceptance criteria 10, 11)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/exploration/exploration.module.ts` — new `forgeExplorationModule` registration
- `packages/forge/os/exploration/handlers/list.ts` — `exploration.list` handler
- `packages/forge/os/exploration/handlers/show.ts` — `exploration.show` handler
- `packages/forge/os/exploration/handlers/archive.ts` — `exploration.archive` handler
- `packages/forge/src/index.ts` — export `forgeExplorationModule`
- `packages/forge/bin/cli.ts` — add `forgeExplorationModule` to CLI registry `modules[]` array
- `tools/kernel.config.ts` — add `"forge-exploration"` module loader
- `packages/forge/skills/fo/fo-explore/SKILL.md` — new skill definition
- `.agents/skills/fo-explore/SKILL.md` — synced copy (committed in same session)
- `.agents/skills/fo-idea/SKILL.md` — updated with step 1b explore suggestion
- `packages/forge/skills/fo/fo-idea/SKILL.md` — updated with step 1b explore suggestion (canonical source)

### 2.2 Configuration and data

- `docs/explorations/.gitkeep` — new directory placeholder

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — update skill count from "36 fo skills" to "37 fo skills" and add `forgeExplorationModule` row to OS modules table
- `docs/rfcs/rfc-0710-add-explore-mode-for-pre-specification-idea-exploration.md` — read-only reference (accepted status)

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run skill.validate` — must pass on new `fo-explore` skill
- `pnpm exec site-kernel run rfc.validate --id RFC-0710` — must pass
- `pnpm --filter @warpgogol/forge run build:check` — must pass (new module compiles)
- No pipeline integration needed — exploration notes are not part of any build or validation pipeline

## 3. Step sequence

### Step 1. Create exploration note directory

**Goal:** Establish `docs/explorations/` as the persistent storage location for exploration notes.

**Agent actions:**

- Create `docs/explorations/.gitkeep` (empty file)

**Validation:**

- `ls docs/explorations/.gitkeep` succeeds

**Completion criterion:** `docs/explorations/` directory exists with a `.gitkeep` file

**Human review:** no

---

### Step 2. Create TypeScript contracts and exploration OS module

**Goal:** Implement `forgeExplorationModule` with three command handlers following the forge OS module pattern.

**Agent actions:**

- Create `packages/forge/os/exploration/exploration.module.ts` — register `forgeExplorationModule` with `exploration.list`, `exploration.show`, `exploration.archive` commands. Follow the pattern of `forgeAdrModule` (`os/adr/adr.module.ts`): import `ForgeModule`, use `registry.registerCommand()` with name, description, scope, flags, reads, writes, execute.
- Create `packages/forge/os/exploration/handlers/list.ts` — `runExplorationList` handler: scan `docs/explorations/*.md`, parse YAML frontmatter, return `ExplorationListResult` with `id`, `title`, `status`, `createdAt` for each note. Support `--status <status>` filter. Return `{ explorations: [] }` with exit code 0 when directory is empty or missing.
- Create `packages/forge/os/exploration/handlers/show.ts` — `runExplorationShow` handler: read `docs/explorations/<slug>.md`, parse frontmatter + body, return `ExplorationShowResult`. Return exit code 1 if slug not found.
- Create `packages/forge/os/exploration/handlers/archive.ts` — `runExplorationArchive` handler: read note, set `status: archived` in frontmatter, optionally append `--rfc <id>` to `related` field, write back. Idempotent — if already `archived`, return exit code 0 with `previousStatus: "archived"` (no-op). Return exit code 1 if slug not found or invalid slug (non-kebab-case).
- Define TypeScript interfaces (`ExplorationNote`, `ExplorationListResult`, `ExplorationShowResult`, `ExplorationArchiveResult`) inline in the handlers or in a shared `types.ts` within `os/exploration/`.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes with new module

**Completion criterion:** `forgeExplorationModule` compiles, exports three registered commands, and follows the `ForgeModule` interface

**Human review:** no

---

### Step 3. Wire module into kernel and CLI

**Goal:** Register `forgeExplorationModule` in all three integration points so commands are discoverable.

**Agent actions:**

- Add export to `packages/forge/src/index.ts`: `export { forgeExplorationModule } from "../os/exploration/exploration.module.ts";`
- Add to `packages/forge/bin/cli.ts` `modules[]` array: `await import("../os/exploration/exploration.module.ts").then((m) => m.forgeExplorationModule),`
- Add to `tools/kernel.config.ts` `moduleLoaders`: `"forge-exploration": async () => (await import("@warpgogol/forge/os/exploration")).forgeExplorationModule,`
- Add entry to `MODULE_MAP` comment in `tools/kernel.config.ts`: `<entry key="exploration.*">Registers workspace exploration note commands (RFC-0710).</entry>`
- Add `<item>RFC-0710: Register forgeExplorationModule for exploration.list, exploration.show, exploration.archive.</item>` to `CHANGE_SUMMARY` in `tools/kernel.config.ts`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- `pnpm exec site-kernel run exploration.list --json` returns `{ explorations: [] }` with exit code 0

**Completion criterion:** All three integration points (index.ts, cli.ts, kernel.config.ts) reference `forgeExplorationModule`; `exploration.list` command is discoverable via CLI

**Human review:** no

---

### Step 4. Create `fo-explore` skill

**Goal:** Author the canonical `fo-explore` SKILL.md with frontmatter and process instructions matching the RFC specification.

**Agent actions:**

- Create `packages/forge/skills/fo/fo-explore/SKILL.md` with frontmatter:
  ```yaml
  name: fo-explore
  description: Explore an idea in the codebase without creating an RFC or ADR. Produces a markdown exploration note in docs/explorations/.
  invocation: user
  category: fo
  concerns: document-only
  dependsOn: ['my-preferences']
  bindings:
    requires: [paths.invariantsFile]
    optional: []
  triggers: ["explore this idea", "let me think about this", "what are the options for"]
  ```
- Write the skill body following the 6-step process from RFC-0710 § Design → Process: read the idea, explore the codebase, weigh options, assess feasibility, persist the exploration note, suggest next steps.
- Include the exploration note format template from RFC-0710 § Design → Exploration note format.
- Include the frontmatter fields table from RFC-0710 § Design → Frontmatter fields.
- Include the file system responsibilities table from RFC-0710 § Design → File system responsibilities.
- Include the failure modes from RFC-0710 § Design → Failure modes.
- Include a step in the skill process to transition the note's `status` from `open` to `explored` by editing the frontmatter directly (the skill is `concern: document-only` and may edit `.md` files). No separate command needed for this transition.
- Use `ref(forge.yaml bindings.paths.invariantsFile)` for path references (DNA-54 compliance — no hardcoded project literals).
- Copy the SKILL.md to `.agents/skills/fo-explore/SKILL.md` (canonical sync path is flat).

**Validation:**

- `pnpm exec site-kernel run skill.validate` passes on `fo-explore` SKILL.md (SKILL-01..21)
- `pnpm exec site-kernel run forge.skill.validate` passes with 0 violations

**Completion criterion:** `fo-explore` skill created in `packages/forge/skills/fo/fo-explore/SKILL.md`, synced to `.agents/skills/fo-explore/SKILL.md`, and `skill.validate` passes

**Human review:** no

---

### Step 5. Update `fo-idea` skill with explore suggestion

**Goal:** Add step 1b (explore suggestion) to the `fo-idea` skill's process.

**Agent actions:**

- Edit `packages/forge/skills/fo/fo-idea/SKILL.md` — add step 1b after the existing step 1 (analyze the request), per RFC-0710 § Design → fo-idea routing extension:
  > **1b. Explore suggestion.** If the operator's description is ambiguous, exploratory, or contains phrases like "what are the options", "let me think about", "explore", or "what if we", suggest using `fo-explore` before creating an RFC. Use `ask_user_question` with recommended option "Explore first".
- Copy the updated SKILL.md to `.agents/skills/fo-idea/SKILL.md` (synced copy)

**Validation:**

- `pnpm exec site-kernel run skill.validate` passes on `fo-idea` SKILL.md

**Completion criterion:** `fo-idea` skill includes step 1b explore suggestion in both canonical and synced locations; `skill.validate` passes

**Human review:** no

---

### Step 6. Update `packages/forge/AGENTS.md`

**Goal:** Reflect the new skill and OS module in the forge agent guide.

**Agent actions:**

- Edit `packages/forge/AGENTS.md`:
  - Update skill count from "36 fo skills + 5 shared + 3 meta = 44 skills" to "37 fo skills + 5 shared + 3 meta = 45 skills"
  - Add row to OS modules table: `| forgeExplorationModule | exploration.list, exploration.show, exploration.archive | os/exploration/ |`
  - Add `<item>RFC-0710: Register forgeExplorationModule for exploration.list, exploration.show, exploration.archive.</item>` to CHANGE_SUMMARY if applicable

**Validation:**

- `git diff packages/forge/AGENTS.md` shows the two changes

**Completion criterion:** `packages/forge/AGENTS.md` reflects 37 fo skills and includes `forgeExplorationModule` in the OS modules table

**Human review:** no

---

### Step 7. Write unit tests for exploration command handlers

**Goal:** Verify command handlers work correctly for happy path and edge cases.

**Agent actions:**

- Create `packages/forge/os/exploration/handlers/exploration.handlers.test.ts` (or separate test files per handler)
- Test `exploration.list`:
  - Empty directory → `{ explorations: [] }`, exit code 0
  - Directory with notes → correct metadata extracted from frontmatter
  - `--status` filter works
- Test `exploration.show`:
  - Existing slug → full note content + frontmatter returned
  - Non-existent slug → exit code 1
- Test `exploration.archive`:
  - Open/explored note → status transitions to `archived`, `related` updated if `--rfc` provided
  - Already archived note → exit code 0, no-op (idempotent)
  - Non-existent slug → exit code 1
  - Invalid slug (non-kebab-case) → exit code 1

**Validation:**

- `pnpm --filter @warpgogol/forge run test` passes

**Completion criterion:** All handler tests pass covering happy path, empty state, not-found, idempotent archive, and invalid slug

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` is updated (step 6).
- Run `pnpm exec site-kernel run command.manifest.generate` — new commands (`exploration.list/show/archive`) were added and must appear in `docs/command-manifest.generated.yaml` (RFC-CMD-02 checks this file, not `ecosystem.generated.yaml`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in RFC-0710 against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0710 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0710`
- `pnpm exec site-kernel run skill.validate`
- `pnpm --filter @warpgogol/forge run build:check`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0710`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec site-kernel run skill.validate`
- `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0710` (if acceptance probes declared)
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0710` (RFC-0330, for probe-bearing RFCs created on or after 2026-07-07)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0710.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0710` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Exploration note rot | Step 2 — `exploration.list` returns `status` field so agents can filter stale notes; notes are informational, not authoritative |
| Scope creep (fo-explore evolves into mini-RFC) | Step 4 — skill instructions explicitly state "exploration notes are not governance documents"; `concern: document-only` enforces no code changes |
| Operator confusion (exploration note mistaken for RFC) | Step 4 — note format is visually distinct (no RFC frontmatter fields like `kind`, `scope`, `satisfies`); different directory (`docs/explorations/` vs `docs/rfcs/`) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54 (Forge bindings contract), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0710 --reason "..." --invariant "DNA-54"` instead of working around it.
- If `skill.validate` fails on `fo-explore` SKILL.md due to SKILL-11 (hardcoded literals), fix the skill body to use `ref(forge.yaml bindings.*)` references instead of bypassing the validator.
