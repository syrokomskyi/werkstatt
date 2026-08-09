---
rfcId: RFC-0537
planId: PLAN-RFC-0537-01
status: draft
owner: architecture
createdAt: 2026-07-26
updatedAt:
scope:
  apps: []
  packages:
    - "@wgogol/forge"
  services: []
  docs:
    - docs/rfcs/rfc-0537-session-documentation-domain-with-save-archive-validate-and-list-commands.md
    - packages/forge/AGENTS.md
    - AGENTS.md
    - docs/authoring/session-composition.md
    - docs/COMMANDS.md
    - forge.yaml
    - PREFERENCES.md
    - .gitignore
---

# Implementation Plan: RFC-0537

## 1. Objectives

- [ ] O1 — Create `forgeSessionModule` with 4 commands (`session.save`, `session.archive`, `session.validate`, `session.list`) — maps to AC[1,3,5,7,9]
- [ ] O2 — `session.save` converts raw ATIF to structured markdown with idempotency — maps to AC[2,3,4]
- [ ] O3 — `session.archive` age-based bidirectional archiving with `--dry-run`/`--json` — maps to AC[5,6,7]
- [ ] O4 — `session.validate` enforces SES-01..05 rules — maps to AC[8]
- [ ] O5 — `session.list` with date/rfc/type filters and `--json` — maps to AC[9]
- [ ] O6 — Integrate `session.archive` into `docs.archive` umbrella — maps to AC[10,11]
- [ ] O7 — Extend `forge.yaml` schema and config with `sessionsDir` — maps to AC[12,13,14]
- [ ] O8 — Add `saveSessions` to `PREFERENCES.md` and `.gitignore` entry — maps to AC[15,16]
- [ ] O9 — Create `fo-session-save` skill with knowledge files — maps to AC[17,18]
- [ ] O10 — Documentation: `session-composition.md`, AGENTS.md updates, COMMANDS.md regen — maps to AC[19,21,22,23]
- [ ] O11 — Shell wrapper `scripts/devin-export.sh` — maps to AC[20]
- [ ] O12 — Tests: unit, integration, PBT — maps to AC[24,25,26,27,28]
- [ ] O13 — Validation: `rfc.validate`, `build:check` — maps to AC[29,30]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/session/session.module.ts` — new `forgeSessionModule`
- `packages/forge/os/session/types.ts` — session types, constants, SES rules
- `packages/forge/os/session/frontmatter-io.ts` — `parseSessionFile`, `listSessionFiles`, `readAndParseSession`
- `packages/forge/os/session/handlers/save.ts` — `runSessionSave`
- `packages/forge/os/session/handlers/archive.ts` — `runSessionArchive`
- `packages/forge/os/session/handlers/validate.ts` — `runSessionValidate`
- `packages/forge/os/session/handlers/list.ts` — `runSessionList`
- `packages/forge/os/session/atif-parser.ts` — ATIF format parser
- `packages/forge/os/core/core.module.ts` — extend `docs.archive` subCommands array
- `packages/forge/src/config/forge-config.ts` — add `sessionsDir` to `forgeConfigSchema.paths` and `forgeBindingsSchema.paths`
- `packages/forge/src/onboarding/init.ts` — write `saveSessions: true` to PREFERENCES.md
- `packages/forge/src/onboarding/doctor.ts` — add `sessionsDir` to `BINDING_PATH_KEYS`
- `packages/forge/src/tests/forge-config.test.ts` — test `sessionsDir` schema
- `packages/forge/bin/cli.ts` — add `forgeSessionModule` to autonomous CLI registry
- `packages/forge/os/session/index.ts` — barrel re-export file (matching `os/plan/index.ts` pattern)
- `packages/forge/package.json` — add `"./os/session"` and `"./os/session-module"` to `exports` (both source and `publishConfig` sections)
- `tools/kernel.config.ts` — register `forge-session` module loader
- `scripts/devin-export.sh` — shell wrapper for Devin export

### 2.2 Configuration and data

- `forge.yaml` — add `paths.sessionsDir: docs/sessions` and `bindings.paths.sessionsDir: docs/sessions`
- `PREFERENCES.md` — add `saveSessions: true`
- `.gitignore` — add `docs/sessions/.raw/` entry

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0537-*.md` — read-only reference (acceptance criteria source)
- `packages/forge/AGENTS.md` — add `forgeSessionModule` row to OS modules table
- `AGENTS.md` (root) — document session domain and `saveSessions` preference
- `docs/authoring/session-composition.md` — new file: session format conventions
- `docs/COMMANDS.md` — regenerated via `command.manifest.generate` + `docs.commands.generate`
- `packages/forge/skills/fo/fo-session-save/SKILL.md` — new skill definition
- `packages/forge/skills/fo/fo-session-save/qa-log.md` — knowledge file
- `packages/forge/skills/fo/fo-session-save/learned-principles.md` — knowledge file
- `packages/forge/skills/fo/fo-session-save/fix-patterns.md` — knowledge file

### 2.4 Validation and pipelines

- `rfc.validate RFC-0537` — mechanical validation
- `pnpm --filter @wgogol/forge build:check` — typecheck
- `pnpm --filter @wgogol/forge test` — unit + integration + PBT tests (requires adding `fast-check` to `@wgogol/forge` devDependencies)
- `pnpm exec werkstatt run command.manifest.generate` — regenerate command manifest
- `pnpm exec werkstatt run docs.commands.generate` — regenerate COMMANDS.md
- No pipeline integration — `session.validate` is on-demand only

## 3. Step sequence

### Step 1. TypeScript contracts and types

**Goal:** Create the type definitions, constants, and frontmatter I/O for the session domain.

**Agent actions:**

- Create `packages/forge/os/session/types.ts` with:
  - `SESSION_DIR = "docs/sessions"` constant
  - `SessionFrontmatter` interface (id, date, duration, types, summary, relatedRfcs, relatedArtifacts, decisions, commits, files, commands)
  - `SessionType` union: `"grilling" | "implementation" | "review" | "fix" | "mission" | "freeform"`
  - `SessionListEntry`, `SessionListResult` interfaces
  - `SessionValidationResult`, `SessionValidationViolation` interfaces
  - `SessionSaveResult`, `SessionArchiveResult` interfaces
  - `SESSION_KNOWN_KEYS`, `SESSION_REQUIRED_SECTIONS` arrays
  - SES-01..05 rule constants
- Create `packages/forge/os/session/frontmatter-io.ts`:
  - `parseSessionFile(source)` — same pattern as `parseRfcFile`/`parseAdrFile`
  - `listSessionFiles(sessionDirPath)` — list `.md` files, excluding `archive/` and `.raw/` subdirectories
  - `readAndParseSession(sessionDirPath, fileName)` — read + parse
- Create `packages/forge/os/session/atif-parser.ts`:
  - `parseAtif(rawContent)` — extract message turns, timestamps, roles from ATIF format
  - **Start with raw text passthrough** — no existing ATIF parser or format spec in the codebase. The initial implementation treats the entire raw content as a single turn and extracts metadata via regex. ATIF-specific parsing logic is added incrementally as real Devin exports are tested.
  - Fallback to raw text passthrough if ATIF parsing fails

**Validation:**

- `pnpm --filter @wgogol/forge build:check` passes with new files

**Completion criterion:** `packages/forge/os/session/types.ts`, `frontmatter-io.ts`, and `atif-parser.ts` exist and typecheck without errors.

**Human review:** no

---

### Step 2. Command handlers — save, archive, validate, list

**Goal:** Implement the four session command handlers.

**Agent actions:**

- Create `packages/forge/os/session/handlers/save.ts`:
  - `runSessionSave(input, context)` — scan `.raw/`, parse ATIF, extract metadata via regex (RFC-ids, file paths, commit hashes, skill names, session types), compute session id (`YYYY-MM-DD-HH-MM-SS-<shorthash>`), write structured markdown, delete raw file (unless `--keep-raw`), skip if output exists
  - Flags: `--raw-file` (string), `--json` (boolean), `--keep-raw` (boolean), `--dry-run` (boolean)
  - Follow `ENOENT` catch pattern for concurrent execution safety
- Create `packages/forge/os/session/handlers/archive.ts`:
  - `runSessionArchive(input, context)` — list session files, compute age from frontmatter `date` field, move files older than `--max-age-days` to `archive/`, bidirectional: move files in `archive/` younger than threshold back to `docs/sessions/`
  - Flags: `--max-age-days` (number, default 7), `--dry-run` (boolean), `--json` (boolean)
  - Follow `ENOENT` catch pattern from existing archive handlers
- Create `packages/forge/os/session/handlers/validate.ts`:
  - `runSessionValidate(input, context)` — SES-01 (frontmatter schema), SES-02 (id-filename match), SES-03 (RFC-id existence via `loadRfcStatusMap`), SES-04 (raw file hygiene), SES-05 (non-markdown file detection)
  - Flags: `{}` (no flags, positional arg for single-file validation)
- Create `packages/forge/os/session/handlers/list.ts`:
  - `runSessionList(input, context)` — list session files with frontmatter parsing, filter by `--date-from`, `--date-to`, `--rfc`, `--type`
  - Flags: `--date-from` (string), `--date-to` (string), `--rfc` (string), `--type` (string), `--json` (boolean)

**Validation:**

- `pnpm --filter @wgogol/forge build:check` passes

**Completion criterion:** All four handler files exist, export their `run*` functions, and typecheck without errors.

**Human review:** no

---

### Step 3. Module registration — forgeSessionModule

**Goal:** Create the `forgeSessionModule`, barrel re-export, package.json exports, and register it in the kernel config and CLI.

**Agent actions:**

- Create `packages/forge/os/session/session.module.ts`:
  - Export `forgeSessionModule: ForgeModule`
  - Register `session.save`, `session.archive`, `session.validate`, `session.list` commands with descriptions, scope, flags, reads, writes
  - Follow the exact pattern of `forgeAdrModule` / `forgePlanModule` / `forgeAuditModule`
- Create `packages/forge/os/session/index.ts`:
  - Barrel re-export: `export { forgeSessionModule } from "./session.module.ts";`
  - Match the pattern of `os/plan/index.ts`, `os/audit/index.ts`
- Edit `packages/forge/package.json`:
  - Add to `exports`: `"./os/session": { "types": "./os/session/index.ts", "default": "./os/session/index.ts" }` and `"./os/session-module": { "types": "./os/session/session.module.ts", "default": "./os/session/session.module.ts" }`
  - Add corresponding entries to `publishConfig.exports` (dist paths)
- Add `forge-session` module loader to `tools/kernel.config.ts`:
  ```ts
  "forge-session": async () => (await import("@wgogol/forge/os/session-module")).forgeSessionModule,
  ```
- Add `forgeSessionModule` to `packages/forge/bin/cli.ts` autonomous CLI registry
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` headers to `session.module.ts`

**Validation:**

- `pnpm --filter @wgogol/forge build:check` passes
- `pnpm exec werkstatt run session.list --json` returns `{ status: "ok", count: 0 }` (empty sessions dir)

**Completion criterion:** `forgeSessionModule` is registered, all four commands are discoverable via `session.list --json`.

**Human review:** no

---

### Step 4. Extend docs.archive umbrella command

**Goal:** Integrate `session.archive` into the `docs.archive` umbrella command.

**Agent actions:**

- Edit `packages/forge/os/core/core.module.ts`:
  - Import `runSessionArchive` from `../session/handlers/archive.ts`
  - Add `{ name: "session.archive", fn: runSessionArchive as ArchiveHandler }` to `subCommands` array
  - Add `"docs/sessions/*.md"` and `"docs/sessions/archive/**"` to `writes` array
  - Add `"docs/sessions/**/*.md"` to `reads` array
  - Update `description` to mention `session.archive`
  - Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` headers

**Validation:**

- `pnpm --filter @wgogol/forge build:check` passes
- `pnpm exec werkstatt run docs.archive --dry-run` includes session.archive in output

**Completion criterion:** `docs.archive --dry-run` dispatches to `session.archive` alongside rfc/adr/plan/audit.

**Human review:** no

---

### Step 5. Extend forge.yaml schema with sessionsDir

**Goal:** Add `sessionsDir` to `forgeConfigSchema.paths` and `forgeBindingsSchema.paths`.

**Agent actions:**

- Edit `packages/forge/src/config/forge-config.ts`:
  - Add `sessionsDir: z.string().default("docs/sessions")` to `forgeConfigSchema.paths`
  - Add `sessionsDir: z.string().nullable().default(null)` to `forgeBindingsSchema.paths`
- Edit `packages/forge/src/onboarding/doctor.ts`:
  - Add `"sessionsDir"` to `BINDING_PATH_KEYS` array
- Edit `forge.yaml`:
  - Add `sessionsDir: docs/sessions` to `paths` section
  - Add `sessionsDir: docs/sessions` to `bindings.paths` section
- Add test in `packages/forge/src/tests/forge-config.test.ts`:
  - Test that `sessionsDir` is parsed correctly in both `paths` and `bindings.paths`
  - Test default value when absent

**Validation:**

- `pnpm --filter @wgogol/forge build:check` passes
- `pnpm --filter @wgogol/forge test` passes (including new config tests)
- `pnpm exec werkstatt run forge.doctor` validates `sessionsDir` binding

**Completion criterion:** `forge.yaml` includes `sessionsDir` in both `paths` and `bindings.paths`, schema validates, doctor checks pass.

**Human review:** no

---

### Step 6. PREFERENCES.md and .gitignore

**Goal:** Add `saveSessions: true` to PREFERENCES.md and `.gitignore` entry for raw session files.

**Agent actions:**

- Edit `PREFERENCES.md`:
  - Add `saveSessions: true` key after existing keys
- Edit `.gitignore`:
  - Add section:
    ```
    # Session raw exports (RFC-0537) — converted by session.save, not committed
    docs/sessions/.raw/
    ```
- Edit `packages/forge/src/onboarding/init.ts`:
  - Add `saveSessions: true` to the default PREFERENCES.md template written by `forge.init`

**Validation:**

- `PREFERENCES.md` contains `saveSessions: true`
- `.gitignore` contains `docs/sessions/.raw/`
- `git status` shows no raw files tracked

**Completion criterion:** `saveSessions: true` in PREFERENCES.md, `.gitignore` entry present, `forge.init` writes the key.

**Human review:** no

---

### Step 7. fo-session-save skill

**Goal:** Create the `fo-session-save` skill with SKILL.md and three knowledge files.

**Agent actions:**

- Create `packages/forge/skills/fo/fo-session-save/SKILL.md`:
  - Frontmatter: `name: fo-session-save`, `description: ...`, `invocation: user`, `category: fo`, `concerns: document-only`, `knowledge: [qa-log.md, learned-principles.md, fix-patterns.md]`, `bindings: { requires: [paths.sessionsDir], optional: [] }`
  - Body: autonomous skill that reads PREFERENCES.md, no-ops if `saveSessions: false`, enhances saved session transcripts with semantic annotations, summaries, quality checks
- Create `packages/forge/skills/fo/fo-session-save/qa-log.md` — empty knowledge file with header
- Create `packages/forge/skills/fo/fo-session-save/learned-principles.md` — empty knowledge file with header
- Create `packages/forge/skills/fo/fo-session-save/fix-patterns.md` — empty knowledge file with header
- Run `pnpm exec werkstatt run forge.skill.validate` to verify SKILL-11/12/13 compliance

**Validation:**

- `forge.skill.validate` passes for `fo-session-save`
- `forge.init` syncs the skill to `.agents/skills/`

**Completion criterion:** Skill created with valid frontmatter, three knowledge files exist, `forge.skill.validate` passes.

**Human review:** no

---

### Step 8. Shell wrapper

**Goal:** Create `scripts/devin-export.sh` for exporting Devin sessions.

**Agent actions:**

- Create `scripts/devin-export.sh`:
  - POSIX-compatible shell script
  - Exports Devin session to ATIF format to `docs/sessions/.raw/`
  - Usage: `./scripts/devin-export.sh <session-id>` or `./scripts/devin-export.sh --latest`
  - Creates `.raw/` directory if it doesn't exist
- Test the wrapper manually:
  - `chmod +x scripts/devin-export.sh`
  - `./scripts/devin-export.sh --help` shows usage
  - Test with a dummy session if available

**Validation:**

- `scripts/devin-export.sh --help` exits 0
- Script is executable (`chmod +x`)

**Completion criterion:** Shell wrapper exists, is executable, and shows help output.

**Human review:** no

---

### Step 9. Tests — unit, integration, PBT

**Goal:** Write comprehensive tests for all four command handlers.

**Agent actions:**

- Add `fast-check` to `packages/forge/package.json` `devDependencies` (currently used by 30+ packages in the workspace but not by forge)
- Create `docs/sessions/` and `docs/sessions/.raw/` directories (needed for test fixtures and runtime)

- Create `packages/forge/os/session/tests/save.test.ts`:
  - Unit test: parse ATIF, extract metadata, compute session id, write markdown, delete raw
  - PBT: idempotency — `session.save` twice on same raw file yields same `.md`
  - Test `--keep-raw` flag
  - Test `--dry-run` flag
  - Test skip-if-output-exists
- Create `packages/forge/os/session/tests/archive.test.ts`:
  - Unit test: age-based archiving, bidirectional behavior
  - PBT: archive then unarchive returns to original state
  - Test `--dry-run` flag
  - Test `--max-age-days` custom threshold
- Create `packages/forge/os/session/tests/validate.test.ts`:
  - Unit test: SES-01..05 rules
  - Test valid session passes
  - Test each SES rule violation is detected
- Create `packages/forge/os/session/tests/list.test.ts`:
  - Unit test: filter by date, rfc, type
  - Test `--json` output
- Create `packages/forge/os/session/tests/integration.test.ts`:
  - End-to-end: raw file → `session.save` → `.md` → `session.validate` → `session.archive`
- Create test fixtures in `packages/forge/os/session/tests/fixtures/`:
  - `sample-atif.txt` — minimal ATIF format sample
  - `sample-session.md` — valid session markdown

**Validation:**

- `pnpm --filter @wgogol/forge test` passes all session tests
- PBT tests pass with 100 runs

**Completion criterion:** All unit, integration, and PBT tests pass.

**Human review:** no

---

### Step 10. Documentation sync

**Goal:** Update all documentation artifacts to reflect the new session domain.

**Agent actions:**

- Create `docs/authoring/session-composition.md`:
  - Session format conventions (frontmatter schema, body structure)
  - Metadata documentation (fields, types, auto-extraction rules)
  - Shell wrapper instructions
  - Command/skill split explanation
- Edit `packages/forge/AGENTS.md`:
  - Add `forgeSessionModule` row to OS modules table: `| forgeSessionModule | session.save, session.archive, session.validate, session.list | os/session/ |`
- Edit root `AGENTS.md`:
  - Add session domain to documentation domains list
  - Document `saveSessions` preference key
- Regenerate command manifest:
  - `pnpm exec werkstatt run command.manifest.generate`
  - `pnpm exec werkstatt run docs.commands.generate`
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed

**Validation:**

- `docs/COMMANDS.md` includes `session.save`, `session.archive`, `session.validate`, `session.list`
- `docs/COMMANDS.md` `docs.archive` description mentions session archiving
- `packages/forge/AGENTS.md` OS modules table includes `forgeSessionModule`
- Root `AGENTS.md` mentions session domain

**Completion criterion:** All documentation files in scope are updated, `docs/COMMANDS.md` regenerated.

**Human review:** no

---

### Final Step. Acceptance criteria verification and RFC stamp

**Goal:** Verify all acceptance criteria, stamp the RFC as implemented.

**Agent actions:**

- Verify every acceptance criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Run `pnpm exec werkstatt run rfc.validate RFC-0537` — must pass with zero errors
- Run `pnpm --filter @wgogol/forge build:check` — must pass
- Run `pnpm --filter @wgogol/forge test` — must pass
- Run `pnpm exec werkstatt run forge.skill.validate` — must pass
- Run `git status` — no uncommitted changes from this session
- Stamp the RFC as implemented: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0537 --implementation-commit <sha>`
- The stamp command validates all preconditions (status, criteria, clean tree, commit reachability)

**Validation:**

- `git status` — clean
- `rfc.validate RFC-0537` — pass
- `build:check` — pass
- `test` — pass
- `forge.skill.validate` — pass

**Completion criterion:** All 30 acceptance criteria checked off with evidence annotations, RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0537`
- `pnpm --filter @wgogol/forge build:check`
- `pnpm --filter @wgogol/forge test`
- `pnpm exec werkstatt run forge.skill.validate`
- `pnpm exec werkstatt run forge.doctor`

### 4.2 Evidence artifacts

- Implementation commits referencing `RFC-0537` in the subject line (RFC-0265 commit hygiene)
- Separate commit for RFC stamp (implementation commit ≠ stamp commit)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Raw ATIF format changes | Step 1: ATIF parser isolated in `atif-parser.ts` with raw text fallback |
| Session files bloat repo | Step 2: `session.archive` with 7-day default; Step 4: `docs.archive` includes sessions |
| `fo-session-save` asks too many questions | Step 7: SKILL.md documents autonomous behavior, reads PREFERENCES.md |
| Regex false positives in metadata extraction | Step 9: unit tests cover edge cases; skill can override auto-extracted fields |
| Idempotency failure | Step 1: content hash in filename; Step 9: PBT verifies idempotency |
| `.raw/` files accidentally committed | Step 6: `.gitignore` entry; Step 2: SES-04 warns about raw files |
| Shell wrapper breaks on different shells | Step 8: POSIX-compatible syntax, tested |
| PII in session transcripts | Step 7: skill redacts API keys, passwords, PII |
| Agent misinterprets command/skill boundary | Step 7: SKILL.md checks `saveSessions`; Step 10: docs explain the split |
| Concurrent execution race | Step 2: `ENOENT` catch pattern from existing archive handlers |
| Interrupted operations | Step 2: idempotent skip-if-exists; operator can re-run with `--keep-raw` |

## 6. Escalation triggers

- If implementation reveals that `session.validate` must run in a pipeline (contradicting the RFC's on-demand-only decision), run `rfc.supersede.propose` instead of silently adding it to `build.check`.
- If the ATIF format requires a parser dependency that breaks forge's autonomy guard (no `@gogol/*` imports in `src/`), escalate to create a separate parser package or move the parser to `os/`.
- If `docs.archive` umbrella dispatch cannot accommodate `session.archive`'s `--max-age-days` flag without breaking the existing `--status` pass-through, escalate to amend RFC-0521.
