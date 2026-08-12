---
rfcId: RFC-0808
planId: PLAN-RFC-0808-01
status: draft
owner: architecture
createdAt: 2026-08-11
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - packages/forge/AGENTS.md
    - docs/technology.xml
---

# Implementation Plan: RFC-0808

## 1. Objectives

- [ ] O1 — Create `obsidian-vault.yaml` profile that passes `forge profile.validate` (maps to acceptance criterion 1)
- [ ] O2 — `forge scaffold --profile obsidian-vault` creates valid vault structure (maps to criterion 2)
- [ ] O3 — `note.link.validate` detects broken wikilinks in test fixtures, exits non-zero (maps to criterion 3)
- [ ] O4 — `note.frontmatter.validate` detects missing required frontmatter fields (maps to criterion 4)
- [ ] O5 — `note.orphan.detect` reports orphan notes as warnings, exits zero (maps to criterion 5)
- [ ] O6 — NOTE-03 invariant detects code files in `vault/` via invariant engine (maps to criterion 6)
- [ ] O7 — Profile terminology maps `artifact: note`, `module: folder`, `operator: author` (maps to criterion 7)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/profiles/profile-schema.ts` — add 3 new check kinds to `profileInvariantCheckSchema` enum and `ProfileInvariantCheck` interface
- `packages/forge/src/onboarding/invariant-engine.ts` — add `link-resolution`, `frontmatter-required`, `path-exclusion` cases to `runCheck`
- `packages/forge/profiles/obsidian-vault.yaml` — new profile YAML
- `packages/forge/src/validators/note-link-validate.ts` — new handler for `note.link.validate`
- `packages/forge/src/validators/note-frontmatter-validate.ts` — new handler for `note.frontmatter.validate`
- `packages/forge/src/validators/note-orphan-detect.ts` — new handler for `note.orphan.detect`
- `packages/forge/os/notes/notes.module.ts` — new ForgeModule registering the 3 note commands
- `packages/forge/src/index.ts` — export new handler functions and types
- `tools/kernel.config.ts` — register `forgeNotesModule`

### 2.2 Configuration and data

- `packages/forge/profiles/obsidian-vault.yaml` — the profile itself (terminology, invariants, workspace, artifacts, workspaceTypes)

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — add `forgeNotesModule` to OS modules table
- `docs/technology.xml` — add `obsidian-vault` to stack profile inventory

### 2.4 Validation and pipelines

- `packages/forge/src/tests/note-link-validate.test.ts` — unit tests
- `packages/forge/src/tests/note-frontmatter-validate.test.ts` — unit tests
- `packages/forge/src/tests/note-orphan-detect.test.ts` — unit tests
- `packages/forge/os/core/handlers/invariant-engine.test.ts` — add test cases for 3 new check kinds

## 3. Step sequence

### Step 1. Extend profile invariant schema with 3 new check kinds

**Goal:** Add `link-resolution`, `frontmatter-required`, `path-exclusion` to the zod schema and TypeScript interface.

**Agent actions:**

- Edit `packages/forge/src/profiles/profile-schema.ts`:
  - Add 3 new kinds to `profileInvariantCheckSchema` enum: `"link-resolution"`, `"frontmatter-required"`, `"path-exclusion"`
  - Add `fields` optional string array to the schema object (for `frontmatter-required`)
  - Update `ProfileInvariantCheck` interface with the 3 new kinds and `fields?: string[]`
  - Add `.refine()` for `frontmatter-required` requiring `fields` to be non-empty
- Update `CHANGE_SUMMARY` comment with `RFC-0808` entry

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`

**Completion criterion:** Schema accepts the 3 new check kinds; TypeScript compiles; existing tests still pass.

**Human review:** no

---

### Step 2. Extend invariant engine with 3 new check kinds

**Goal:** Implement enforcement logic for `link-resolution`, `frontmatter-required`, `path-exclusion` in the generic invariant engine.

**Agent actions:**

- Edit `packages/forge/src/onboarding/invariant-engine.ts`:
  - Add `case "link-resolution"`: parse `[[wikilinks]]` from file content, resolve each against all `.md` files in the vault directory, report unresolved links as violations
  - Add `case "frontmatter-required"`: parse YAML frontmatter (between `---` delimiters), check for required fields, report missing fields as violations
  - Add `case "path-exclusion"`: check if any files match the glob pattern (existence check, not content check), report each matching file as a violation
  - Update `CHANGE_SUMMARY` comment with `RFC-0808` entry
- Add test cases to `packages/forge/os/core/handlers/invariant-engine.test.ts`:
  - `link-resolution` detects broken wikilinks
  - `frontmatter-required` detects missing title field
  - `path-exclusion` detects code files in vault

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge test`

**Completion criterion:** All 3 new check kinds produce correct violations in test fixtures; existing tests still pass.

**Human review:** no

---

### Step 3. Create obsidian-vault profile YAML

**Goal:** Create the profile file that declares terminology, invariants, workspace, artifacts, and workspaceTypes.

**Agent actions:**

- Create `packages/forge/profiles/obsidian-vault.yaml` with:
  - `schema: forge/stack-profile@1`, `id: obsidian-vault`, `displayName: Obsidian Vault`
  - `detect.anyOf: [.obsidian/]` (Obsidian config directory)
  - `domain: knowledge-base`, `register: business`
  - `terminology`: artifact=note, artifactPlural=notes, module=folder, source=note file, output=vault report, verify=validate, operator=author
  - `artifacts`: note (.md, .canvas), image (.png, .jpg, .jpeg, .webp, .svg, .pdf, .mp4, .webm)
  - `workspaceTypes`: vault (glob **/*.md, contains ---)
  - `invariants`: NOTE-01..04 as specified in RFC
  - `workspace.dirs`: [vault, scripts, .forge]
  - `workspace.files`: forge.yaml, .gitignore, package.json, pnpm-workspace.yaml
  - `scriptDir: scripts`
  - `install: [pnpm add -D @warpgogol/forge]`

**Validation:**

- `pnpm exec werkstatt run forge.profile.validate --id obsidian-vault --json`

**Completion criterion:** Profile validates clean against the extended schema.

**Human review:** no

---

### Step 4. Implement note.link.validate command

**Goal:** Standalone command that scans `vault/**/*.md`, parses `[[wikilinks]]`, resolves each against the note graph, and reports broken links.

**Agent actions:**

- Create `packages/forge/src/validators/note-link-validate.ts`:
  - Export `runNoteLinkValidate(input, context)` returning `ForgeCommandResult<NoteLinkValidateResult>`
  - `NoteLinkValidateResult`: `{ command, violations: NoteLinkViolation[], count }`
  - `NoteLinkViolation`: `{ file, line, link, rule: "NOTE-01", message }`
  - Logic: collect all `.md` files under `vault/`, build a note name → file path map, scan each file for `[[wikilinks]]`, resolve each link, report unresolved
  - Support `--json` and `--path` flags (path scopes the scan to a subdirectory)
  - Support `--vault-dir` flag (default: `vault`)
- Write tests in `packages/forge/src/tests/note-link-validate.test.ts`:
  - Detects broken wikilink in test fixture
  - Passes when all links resolve
  - `--path` flag scopes scan
  - Empty vault returns zero violations

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge test`

**Completion criterion:** Command detects broken wikilinks in test fixtures and exits non-zero; all tests pass.

**Human review:** no

---

### Step 5. Implement note.frontmatter.validate command

**Goal:** Standalone command that scans `vault/**/*.md`, parses YAML frontmatter, and reports missing required fields.

**Agent actions:**

- Create `packages/forge/src/validators/note-frontmatter-validate.ts`:
  - Export `runNoteFrontmatterValidate(input, context)` returning `ForgeCommandResult<NoteFrontmatterValidateResult>`
  - `NoteFrontmatterValidateResult`: `{ command, violations: FrontmatterViolation[], count }`
  - `FrontmatterViolation`: `{ file, field, rule: "NOTE-02", message }`
  - Logic: scan each `.md` file, parse frontmatter between `---` delimiters using `yaml` package, check for `title` field (or first H1 as fallback), report missing
  - Support `--json` and `--vault-dir` flags
- Write tests in `packages/forge/src/tests/note-frontmatter-validate.test.ts`:
  - Detects missing title in frontmatter
  - Passes when title is present
  - Falls back to first H1 if no frontmatter title
  - Files without frontmatter are flagged

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge test`

**Completion criterion:** Command detects missing frontmatter fields in test fixtures; all tests pass.

**Human review:** no

---

### Step 6. Implement note.orphan.detect command

**Goal:** Standalone command that scans `vault/**/*.md`, builds a link graph, and reports notes with zero inbound links.

**Agent actions:**

- Create `packages/forge/src/validators/note-orphan-detect.ts`:
  - Export `runNoteOrphanDetect(input, context)` returning `ForgeCommandResult<NoteOrphanDetectResult>`
  - `NoteOrphanDetectResult`: `{ command, orphans: OrphanReport[], count }`
  - `OrphanReport`: `{ file, inboundLinks: 0, severity: "warning" }`
  - Logic: collect all `.md` files, build inbound link count per note by scanning all wikilinks, report notes with zero inbound links
  - Always exits zero (warnings, not errors)
  - Support `--json` and `--vault-dir` flags
- Write tests in `packages/forge/src/tests/note-orphan-detect.test.ts`:
  - Detects orphan notes (zero inbound links)
  - Notes with inbound links are not reported
  - Empty vault returns zero orphans
  - Exit code is always 0

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge test`

**Completion criterion:** Command reports orphan notes as warnings and exits zero; all tests pass.

**Human review:** no

---

### Step 7. Create forgeNotesModule and register commands

**Goal:** Register the 3 note commands in a new ForgeModule and wire it into the kernel config.

**Agent actions:**

- Create `packages/forge/os/notes/notes.module.ts`:
  - `forgeNotesModule: ForgeModule` with `name: "forge-notes"`, `version: "0.1.0"`
  - Register `note.link.validate`, `note.frontmatter.validate`, `note.orphan.detect` commands
  - Each command: `scope: "workspace"`, `supportsAllSites: false`, flags for `--json`, `--vault-dir`, `--path` (link validate only)
  - Dynamic import of handler functions
- Export `forgeNotesModule` from `packages/forge/src/index.ts`
- Register `forgeNotesModule` in `tools/kernel.config.ts`
- Update `packages/forge/AGENTS.md` OS modules table with `forgeNotesModule` row

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm exec werkstatt run command.manifest.generate` (regenerate command manifest)

**Completion criterion:** All 3 commands appear in `forge --help`; command manifest includes them.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Update AGENTS.md and Compass XML to reflect the new profile and commands.

**Agent actions:**

- Update `packages/forge/AGENTS.md` OS modules table: add `forgeNotesModule` row with 3 commands
- Update `docs/technology.xml`: add `obsidian-vault` to stack profile inventory section
- Verify every file in `scope.docs` is updated

**Validation:**

- `git diff --name-only` shows all scope.docs files modified

**Completion criterion:** All documentation artifacts in scope are updated.

**Human review:** no

---

### Final Step. Review, fix, verify acceptance criteria, and stamp implemented

**Goal:** Run code review, fix findings, verify all acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0808`
- Run `pnpm --filter @warpgogol/forge run build:check`
- Run `pnpm --filter @warpgogol/forge test`
- Run `pnpm exec werkstatt run forge.profile.validate --id obsidian-vault`
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- **Check off acceptance criteria:** verify each criterion against implemented code. Mark `[x]` with `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0808 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0808`
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0808`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge test`
- `pnpm exec werkstatt run forge.profile.validate --id obsidian-vault`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0808` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Wikilink resolution false positives on short-form links | Step 4: short-form links resolved against note graph; ambiguous matches logged as warnings, not errors |
| Performance on 100k+ notes | Step 4: `--path` flag allows scoping; O(n) scan is documented |
| Schema extension breaks existing profiles | Step 1: new check kinds are additive to enum; existing profiles unaffected |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0808 --reason "..." --invariant "DNA-N"` instead of working around it.
