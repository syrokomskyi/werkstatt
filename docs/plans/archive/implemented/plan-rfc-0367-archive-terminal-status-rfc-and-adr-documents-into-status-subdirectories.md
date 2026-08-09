---
rfcId: RFC-0367
planId: PLAN-RFC-0367-01
status: draft
owner: architecture
createdAt: 2026-07-09
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel"
  services: []
  docs:
    - docs/rfcs/rfc-0367-*.md
    - docs/rfcs/rfc-0366-*.md
    - docs/adrs/adr-0000-template.md
    - AGENTS.md
---

# Implementation Plan: RFC-0367

## 1. Objectives

- [ ] O1 — `listRfcFiles` and `listAdrFiles` are recursive (maps to AC: "listRfcFiles and listAdrFiles are recursive and discover files in subdirectories")
- [ ] O2 — ADR types extended with `implemented`, `reviewing`, `implementedAt`, `closedAt`, `reviewers` (maps to AC: "AdrStatus includes implemented and reviewing; ADR_KNOWN_KEYS includes implementedAt, closedAt, reviewers")
- [ ] O3 — `rfc.archive` command registered and functional (maps to AC: "rfc.archive command registered…" and "rfc.archive moves terminal-status RFC files…")
- [ ] O4 — `adr.archive` command registered and functional (maps to AC: "adr.archive command registered…" and "adr.archive moves terminal-status ADR files…")
- [ ] O5 — Existing commands work after archiving (maps to AC: "rfc.validate passes…", "adr.validate passes…", "rfc.list and adr.list show correct file paths…")
- [ ] O6 — RFC-0366 superseded, ADR template updated, AGENTS.md updated (maps to AC: "RFC-0366 frontmatter has supersededBy", "AGENTS.md…updated", "adr-0000-template.md updated…")
- [ ] O7 — `rfc.validate` passes on RFC-0367 (maps to AC: "rfc.validate passes on this file before merging")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel/src/rfc/frontmatter-io.ts` — `listRfcFiles` becomes recursive
- `packages/os/site-kernel/src/adr/frontmatter-io.ts` — `listAdrFiles` becomes recursive
- `packages/os/site-kernel/src/adr/types.ts` — `AdrStatus`, `ADR_STATUSES`, `AdrFrontmatter`, `ADR_KNOWN_KEYS` extended
- `packages/os/site-kernel/src/adr/handlers/validate.ts` — validation rules accept new statuses/keys
- `packages/os/site-kernel/src/adr/handlers/list-create.ts` — `adr.create` max-id scan works with recursive paths; `adr.list` file path handles subdirectories
- `packages/os/site-kernel/src/rfc/handlers/list-create.ts` — `rfc.create` max-id scan works with recursive paths; `rfc.list` file path handles subdirectories
- `packages/os/site-kernel/src/rfc/handlers/archive.ts` — **NEW** handler for `rfc.archive`
- `packages/os/site-kernel/src/adr/handlers/archive.ts` — **NEW** handler for `adr.archive`
- `packages/os/site-kernel/src/rfc/rfc.module.ts` — register `rfc.archive` command
- `packages/os/site-kernel/src/adr/adr.module.ts` — register `adr.archive` command
- `packages/os/site-kernel/src/rfc/index.ts` — export archive handler
- `packages/os/site-kernel/src/adr/index.ts` — export archive handler (if exists)
- All other RFC handlers that call `listRfcFiles` (14 files total) — verify they handle relative paths with subdirectories correctly

### 2.2 Configuration and data

- `docs/adrs/adr-0000-template.md` — add `implementedAt`, `closedAt`, `reviewers` fields and lifecycle diagram
- `docs/rfcs/rfc-0366-*.md` — set `supersededBy: RFC-0367`

### 2.3 Documentation and specs

- `AGENTS.md` — update documentation structure section (archive subdirectories), ADR governance section (new statuses, lifecycle, archive commands)
- `docs/requirements.xml` — verify if ADR lifecycle is referenced; update if so
- `docs/development-plan.xml` — verify if RFC/ADR file structure is referenced; update if so

### 2.4 Validation and pipelines

- No new pipeline gates. Archive commands are manual housekeeping.
- `rfc.validate` and `adr.validate` must continue passing after files are moved to subdirectories.

## 3. Step sequence

### Step 1. Make `listRfcFiles` recursive

**Goal:** RFC file discovery scans subdirectories, returning relative paths like `archive/implemented/rfc-0001-….md`.

**Agent actions:**

- Replace `fs.readdir` with recursive directory scanning in `listRfcFiles` (`packages/os/site-kernel/src/rfc/frontmatter-io.ts`)
- Use `fs.readdir` with `{ withFileTypes: true }` and recurse into subdirectories
- Return relative paths (relative to `rfcDirPath`) including subdirectory prefix
- Keep the same filter: `.md` extension, starts with `rfc-` + 4 digits, excludes `rfc-0000` and `README.md`
- The `verification/` subdirectory is skipped automatically (`.generated.json` files don't match the `.md` filter)

**Validation:**

- `pnpm exec werkstatt run rfc.validate --json` passes (all RFCs still found)
- `pnpm exec werkstatt run rfc.list --json` returns the same count as before

**Completion criterion:** `listRfcFiles` returns files from subdirectories when they exist, and all existing root-level files are still discovered.

**Human review:** no

---

### Step 2. Make `listAdrFiles` recursive

**Goal:** ADR file discovery scans subdirectories, same as Step 1 for RFCs.

**Agent actions:**

- Replace `fs.readdir` with recursive directory scanning in `listAdrFiles` (`packages/os/site-kernel/src/adr/frontmatter-io.ts`)
- Same pattern as Step 1: `withFileTypes: true`, recurse, return relative paths
- Keep the same filter: `.md` extension, starts with `adr-` + 4 digits, excludes `adr-0000` and `README.md`

**Validation:**

- `pnpm exec werkstatt run adr.validate --json` passes

**Completion criterion:** `listAdrFiles` returns files from subdirectories when they exist.

**Human review:** no

---

### Step 3. Fix `rfc.list` and `rfc.create` for subdirectory paths

**Goal:** `rfc.list` shows correct `file` paths for files in subdirectories; `rfc.create` max-id scan works with recursive paths.

**Agent actions:**

- In `packages/os/site-kernel/src/rfc/handlers/list-create.ts`:
  - `runRfcList`: `path.join(RFC_DIR, fileName)` already produces correct relative paths when `fileName` includes a subdirectory prefix (e.g. `archive/implemented/rfc-0001-….md`). Verify this works on Windows (path separators).
  - `runRfcCreate`: the max-id regex `f.match(/^rfc-(\d{4})/)` won't match `archive/implemented/rfc-0001-….md`. Update to extract the filename basename before matching, or update the regex to match `rfc-(\d{4})` anywhere in the path.

**Validation:**

- `pnpm exec werkstatt run rfc.list --json` — verify `file` paths are correct
- `pnpm exec werkstatt run rfc.create --title "Test" --kind command --scope workspace` — verify next ID is correct (then delete the test file)

**Completion criterion:** `rfc.list` shows correct paths; `rfc.create` assigns the correct next ID even when files are in subdirectories.

**Human review:** no

---

### Step 4. Fix `adr.list` and `adr.create` for subdirectory paths

**Goal:** Same as Step 3 but for ADR commands.

**Agent actions:**

- In `packages/os/site-kernel/src/adr/handlers/list-create.ts`:
  - `runAdrList`: verify `path.join(ADR_DIR, fileName)` works with subdirectory prefixes
  - `runAdrCreate`: update max-id regex `f.match(/^adr-(\d{4})/)` to handle subdirectory paths

**Validation:**

- `pnpm exec werkstatt run adr.list --json` — verify `file` paths are correct
- `pnpm exec werkstatt run adr.create --title "Test" --scope package` — verify next ID is correct (then delete the test file)

**Completion criterion:** `adr.list` shows correct paths; `adr.create` assigns the correct next ID.

**Human review:** no

---

### Step 5. Extend ADR types

**Goal:** `AdrStatus` includes `implemented` and `reviewing`; `AdrFrontmatter` and `ADR_KNOWN_KEYS` include `implementedAt`, `closedAt`, `reviewers`.

**Agent actions:**

- In `packages/os/site-kernel/src/adr/types.ts`:
  - Add `"reviewing"` and `"implemented"` to `AdrStatus` type
  - Add `"reviewing"` and `"implemented"` to `ADR_STATUSES` array
  - Add `implementedAt?: string`, `closedAt?: string`, `reviewers?: string[]` to `AdrFrontmatter` interface
  - Add `"implementedAt"`, `"closedAt"`, `"reviewers"` to `ADR_KNOWN_KEYS`
  - Update the JSDoc comment on `AdrStatus` to reflect the new lifecycle

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` — TypeScript compiles

**Completion criterion:** TypeScript compiles with the new types; `ADR_STATUSES` has 6 entries; `ADR_KNOWN_KEYS` has 13 entries.

**Human review:** no

---

### Step 6. Update ADR validation for new statuses and keys

**Goal:** `adr.validate` accepts the new statuses and frontmatter keys without warnings.

**Agent actions:**

- In `packages/os/site-kernel/src/adr/handlers/validate.ts`:
  - AV-03 (valid status) already checks against `ADR_STATUSES` — no change needed, it will accept the new values automatically
  - AV-15 (unknown keys) already checks against `ADR_KNOWN_KEYS` — no change needed, it will accept the new keys automatically
  - Verify no hardcoded status lists exist elsewhere in the validator

**Validation:**

- `pnpm exec werkstatt run adr.validate --json` — passes with no warnings on the template

**Completion criterion:** `adr.validate` accepts ADRs with `implemented` and `reviewing` statuses and the new frontmatter keys.

**Human review:** no

---

### Step 7. Update ADR template

**Goal:** `docs/adrs/adr-0000-template.md` includes the new frontmatter fields and lifecycle diagram.

**Agent actions:**

- Add `implementedAt:`, `closedAt:`, `reviewers:` fields to the template frontmatter
- Add a lifecycle diagram comment showing `proposed → reviewing → accepted → implemented` + `→ superseded` / `→ rejected`
- Update the `status:` comment to list all 6 statuses

**Validation:**

- `pnpm exec werkstatt run adr.validate --json` — template still passes (it's `adr-0000` so excluded from validation, but good to check no regressions)

**Completion criterion:** Template has the new fields and lifecycle diagram.

**Human review:** no

---

### Step 8. Implement `rfc.archive` handler

**Goal:** New handler that moves terminal-status RFC files into `archive/<status>/` subdirectories and non-terminal files back to root.

**Agent actions:**

- Create `packages/os/site-kernel/src/rfc/handlers/archive.ts`:
  - Read all RFC files via `listRfcFiles`
  - Parse each file's frontmatter to get `status`
  - Define `RFC_TERMINAL_STATUSES = ["implemented", "rejected", "superseded"]`
  - For each file:
    - If status is terminal and file is in root: move to `archive/<status>/<filename>`
    - If status is non-terminal and file is in `archive/`: move to root
    - If status is terminal and file is already in `archive/<status>/`: skip
    - If `--status` flag is provided, only process files with that status
  - Create `archive/<status>/` directories as needed via `fs.mkdir({ recursive: true })`
  - Use `fs.rename` for moves; catch ENOENT as "already moved by another process" (skip)
  - If `--dry-run`: report what would happen without moving
  - Return `RfcArchiveResult` with `moved[]` and `skipped[]` arrays
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding (DNA-42)
- Export from `packages/os/site-kernel/src/rfc/index.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` — TypeScript compiles
- `pnpm exec werkstatt run rfc.archive --dry-run --json` — preview works, no files moved

**Completion criterion:** `rfc.archive --dry-run` produces correct preview output listing all terminal-status RFCs that would be moved.

**Human review:** no

---

### Step 9. Implement `adr.archive` handler

**Goal:** Same as Step 8 but for ADRs.

**Agent actions:**

- Create `packages/os/site-kernel/src/adr/handlers/archive.ts`:
  - Same logic as Step 8 but using `listAdrFiles`, `ADR_DIR`, `ADR_TERMINAL_STATUSES`
  - `ADR_TERMINAL_STATUSES = ["implemented", "rejected", "superseded"]`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding (DNA-42)
- Export from ADR module barrel

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` — TypeScript compiles
- `pnpm exec werkstatt run adr.archive --dry-run --json` — preview works

**Completion criterion:** `adr.archive --dry-run` produces correct preview output.

**Human review:** no

---

### Step 10. Register commands in modules

**Goal:** `rfc.archive` and `adr.archive` are registered as Site OS commands.

**Agent actions:**

- In `packages/os/site-kernel/src/rfc/rfc.module.ts`:
  - Register `rfc.archive` command with description, scope `workspace`, flags `--dry-run` (boolean), `--status` (string), `--json` (boolean)
- In `packages/os/site-kernel/src/adr/adr.module.ts`:
  - Register `adr.archive` command with same flags

**Validation:**

- `pnpm exec werkstatt run rfc.archive --dry-run --json` — command is found and runs
- `pnpm exec werkstatt run adr.archive --dry-run --json` — command is found and runs

**Completion criterion:** Both commands are registered and callable.

**Human review:** no

---

### Step 11. Supersede RFC-0366

**Goal:** RFC-0366's frontmatter has `supersededBy: RFC-0367`.

**Agent actions:**

- In `docs/rfcs/rfc-0366-*.md`: set `supersededBy: RFC-0367`
- Do NOT change RFC-0366's status from `implemented`

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0367 --json` — V-12 warning is resolved

**Completion criterion:** `rfc.validate RFC-0367` passes with zero warnings.

**Human review:** no

---

### Step 12. Run archive commands

**Goal:** Move all terminal-status RFC and ADR files into subdirectories.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.archive --json` — moves all terminal-status RFCs
- Run `pnpm exec werkstatt run adr.archive --json` — moves all terminal-status ADRs (likely none yet, but command should succeed)
- Verify files are in correct subdirectories

**Validation:**

- `pnpm exec werkstatt run rfc.validate --json` — all RFCs still validate (root + subdirectories)
- `pnpm exec werkstatt run adr.validate --json` — all ADRs still validate
- `pnpm exec werkstatt run rfc.list --json` — correct count, correct file paths

**Completion criterion:** All terminal-status RFC files are in `docs/rfcs/archive/<status>/` subdirectories; `rfc.validate` and `rfc.list` work correctly.

**Human review:** no

---

### Step 13. Update AGENTS.md

**Goal:** AGENTS.md reflects the new archive subdirectories, ADR lifecycle, and archive commands.

**Agent actions:**

- Update the documentation structure section to mention `docs/rfcs/archive/` and `docs/adrs/archive/`
- Update the ADR governance section: lifecycle diagram (6 statuses), status list, MAY/MUST-NOT rules
- Add an "ADR archiving" subsection mirroring the RFC archive guidance
- Mention `rfc.archive` and `adr.archive` commands

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0367 --json` — still passes

**Completion criterion:** AGENTS.md has the new sections.

**Human review:** no

---

### Step 14. Verify Compass sync

**Goal:** Check if `docs/*.xml` files need updates for the ADR lifecycle extension and archive directory structure.

**Agent actions:**

- Search `docs/requirements.xml` for ADR status references; update if found
- Search `docs/development-plan.xml` for RFC/ADR file path references; update if found
- If no references exist, skip

**Validation:**

- `pnpm exec werkstatt run rfc.validate --json` — passes

**Completion criterion:** Compass files are either updated or confirmed to not reference ADR statuses/file paths.

**Human review:** no

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --json` — all RFCs pass
- `pnpm exec werkstatt run adr.validate --json` — all ADRs pass
- `pnpm --filter @gogol/site-kernel run build:check` — TypeScript compiles
- `pnpm exec werkstatt run rfc.archive --dry-run --json` — preview works
- `pnpm exec werkstatt run adr.archive --dry-run --json` — preview works
- `pnpm exec werkstatt run rfc.list --json` — correct count and file paths
- `pnpm exec werkstatt run adr.list --json` — correct count and file paths

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0367` in the subject line (RFC-0265 commit hygiene)
- No acceptance probes declared in RFC-0367 frontmatter, so `rfc.verification.emit` is not required (RFC-0330 applies only to probe-bearing RFCs)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Path change in tooling | Steps 3-4 fix `rfc.list`/`adr.list`/`rfc.create`/`adr.create` to handle subdirectory paths |
| Performance of recursive scan | Step 1-2 use single `readdir` per subdirectory — negligible overhead |
| Agent confusion | Step 13 updates AGENTS.md with clear documentation |
| Git history | Step 12 uses `fs.rename` (git will track as rename); commit message states it's an archive operation |
| ADR status proliferation | Step 5 extends types with full RFC parity, reducing cognitive overhead |
| Concurrent execution | Steps 8-9 catch ENOENT as "already moved" and skip |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-35, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0367 --reason "..." --invariant "DNA-35"` instead of working around it.
- If making `listRfcFiles` recursive breaks any existing handler in a way that cannot be fixed by updating path handling, escalate via `rfc.supersede.propose` rather than maintaining a non-recursive fallback.
