---
rfcId: RFC-0521
planId: PLAN-RFC-0521-01
status: draft
owner: architecture
createdAt: 2026-07-24
updatedAt:
scope:
  apps: []
  packages:
    - "@wgogol/forge"
    - "@gogol/site-kernel"
  services: []
  docs:
    - docs/audits/audit-0000-template.md
    - docs/audits/audit-rfc-*.md
    - docs/adrs/adr-0002-dirty-workpiece-guards.md
    - packages/forge/skills/fo/fo-idea-audit/SKILL.md
    - tools/kernel.config.ts
    - AGENTS.md
---

# Implementation Plan: RFC-0521

## 1. Objectives

- [ ] O1 — Add `getRfcStatusById` helper to forge RFC module (maps to AC: `getRfcStatusById` helper exists)
- [ ] O2 — Create `forgePlanModule` with `plan.archive` command (maps to AC: `plan.archive` registered in `forgePlanModule`)
- [ ] O3 — Create `forgeAuditModule` with `audit.archive` command (maps to AC: `audit.archive` registered in `forgeAuditModule`)
- [ ] O4 — Migrate ADR module from site-kernel to forge as `forgeAdrModule` (maps to AC: ADR module migrated, `adr.archive` available through forge CLI)
- [ ] O5 — Register `docs.archive` umbrella in `forgeCoreModule` (maps to AC: `docs.archive` registered in `forgeCoreModule`)
- [ ] O6 — Export `forgePlanModule`, `forgeAuditModule`, `forgeAdrModule` from `@wgogol/forge` (maps to AC: modules exported)
- [ ] O7 — Remove `rfcPath` from audit template, all `audit-rfc-*.md` files, and `fo-idea-audit` skill (maps to AC: `rfcPath` removed)
- [ ] O8 — Update ADR-0002 status to `implemented` (maps to AC: ADR-0002 status updated)
- [ ] O9 — Run `docs.archive` and verify all terminal-status files are archived (maps to AC: `plan.archive`/`audit.archive` move files, standalone audits remain in root)
- [ ] O10 — Update `tools/kernel.config.ts` and AGENTS.md (maps to AC: `rfc.validate` passes, documentation updated)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/rfc/frontmatter-io.ts` — add `getRfcStatusById` helper + batch-loading variant
- `packages/forge/os/rfc/types.ts` — re-export `ArchiveMove`, `ArchiveSkip` as shared types (if not already)
- `packages/forge/os/plan/` — new module: `plan.module.ts`, `handlers/archive.ts`, `frontmatter-io.ts`, `types.ts`; exports `forgePlanModule`
- `packages/forge/os/audit/` — new module: `audit.module.ts`, `handlers/archive.ts`, `frontmatter-io.ts`, `types.ts`; exports `forgeAuditModule`
- `packages/forge/os/adr/` — migrated from `packages/os/site-kernel/src/adr/`; exports `forgeAdrModule`
- `packages/forge/os/core/core.module.ts` — register `docs.archive` umbrella command
- `packages/forge/src/index.ts` — export `forgePlanModule`, `forgeAuditModule`, `forgeAdrModule`
- `packages/forge/bin/cli.ts` — add `forgePlanModule`, `forgeAuditModule`, `forgeAdrModule` to `buildRegistry()` module list
- `packages/os/site-kernel/src/adr/` — delete; replace with re-export barrel from `@wgogol/forge/os/adr`
- `packages/os/site-kernel/src/adr-module.ts` (or equivalent barrel) — re-export `forgeAdrModule` as `adrModule`
- `tools/kernel.config.ts` — update `adr` module loader from `@gogol/site-kernel/adr-module` to `@wgogol/forge/os/adr` (or keep site-kernel re-export if it works)
- `packages/forge/src/types.ts` — extend `CommandRegistry` interface with `getCommand()` method (needed for `docs.archive` umbrella to call sub-commands)

### 2.2 Configuration and data

- No YAML/JSON config changes. No ontology catalogs. No biome files.

### 2.3 Documentation and specs

- `docs/audits/audit-0000-template.md` — remove `rfcPath` field from frontmatter
- `docs/audits/audit-rfc-*.md` (78 files) — remove `rfcPath` field from frontmatter
- `packages/forge/skills/fo/fo-idea-audit/SKILL.md` — remove `rfcPath` from audit frontmatter template (line 210)
- `docs/adrs/adr-0002-dirty-workpiece-guards.md` — change `status: accepted` to `status: implemented`
- `AGENTS.md` — document new commands (`plan.archive`, `audit.archive`, `docs.archive`) and archive directory structure for plans and audits

### 2.4 Validation and pipelines

- No pipeline integration. Archive commands are manual housekeeping, not wired into `build.check` or `build.prepare`.
- `rfc.validate` must pass on RFC-0521 before stamping implemented.
- `adr.validate` must pass on all ADR files after ADR module migration.

## 3. Step sequence

### Step 1. Add `getRfcStatusById` helper to forge RFC module

**Goal:** Provide the foundational helper that `plan.archive` and `audit.archive` depend on.

**Agent actions:**

- Add `getRfcStatusById(rfcDirPath: string, rfcId: string): Promise<string | undefined>` to `packages/forge/os/rfc/frontmatter-io.ts` — scans `docs/rfcs/` recursively (including `archive/`) for the RFC with the given id, returns its frontmatter `status` or `undefined`.
- Add `loadRfcStatusMap(rfcDirPath: string): Promise<Map<string, string>>` — batch-loads all RFC frontmatter statuses into a Map for O(n+m) lookup. This is the batch-loading variant per the RFC's performance note.
- Export both from `packages/forge/os/rfc/index.ts`.

**Validation:**

- `pnpm exec tsx packages/forge/bin/cli.ts rfc.validate --json` passes with no new violations.

**Completion criterion:** `getRfcStatusById` and `loadRfcStatusMap` exist in `packages/forge/os/rfc/frontmatter-io.ts` and are exported from `packages/forge/os/rfc/index.ts`.

**Human review:** no

---

### Step 2. Create `forgePlanModule` with `plan.archive` command

**Goal:** Implement the plan archive command in a new forge OS module.

**Agent actions:**

- Create `packages/forge/os/plan/` directory with:
  - `types.ts` — `PlanArchiveResult` interface (reuses `ArchiveMove`/`ArchiveSkip` from `os/rfc/handlers/archive.ts`), `PLAN_DIR` constant, plan filename pattern.
  - `frontmatter-io.ts` — `listPlanFiles` (recursive, same pattern as `listRfcFiles`), `readAndParsePlan`, `parsePlanFile`. Plan files match `plan-rfc-XXXX-*` naming convention.
  - `handlers/archive.ts` — `runPlanArchive` handler. Uses `loadRfcStatusMap` to batch-load RFC statuses, then for each plan file: extract RFC id from filename (`plan-rfc-XXXX-*` → `RFC-XXXX`), look up parent RFC status, move into `docs/plans/archive/<status>/` if terminal, move back to root if non-terminal and in archive. Skip files with no `rfcId` in frontmatter or parent RFC not found.
  - `plan.module.ts` — `forgePlanModule: ForgeModule` registering `plan.archive` command with `--dry-run` and `--status` flags.
  - `index.ts` — barrel exporting `forgePlanModule` and types.
- Register `plan.archive` in `forgePlanModule` with `scope: "workspace"`, `mutatesState: true`, `writes: ["docs/plans/*.md", "docs/plans/archive/**"]`, `reads: ["docs/plans/**/*.md", "docs/rfcs/**/*.md"]`.

**Validation:**

- `pnpm exec tsx packages/forge/bin/cli.ts plan.archive --dry-run --json` produces valid JSON output with `command: "plan.archive"`.
- `pnpm exec tsx packages/forge/bin/cli.ts plan.archive --dry-run` shows preview without moving files.

**Completion criterion:** `plan.archive` command is registered in `forgePlanModule` and produces correct dry-run output.

**Human review:** no

---

### Step 3. Create `forgeAuditModule` with `audit.archive` command

**Goal:** Implement the audit archive command in a new forge OS module.

**Agent actions:**

- Create `packages/forge/os/audit/` directory with:
  - `types.ts` — `AuditArchiveResult` interface, `AUDIT_DIR` constant, audit filename pattern.
  - `frontmatter-io.ts` — `listAuditFiles` (recursive), `readAndParseAudit`, `parseAuditFile`. Audit files matching `audit-rfc-XXXX-*` are candidates; standalone audits (not matching this pattern) are skipped silently.
  - `handlers/archive.ts` — `runAuditArchive` handler. Same logic as `runPlanArchive` but for audit files. Standalone audit files (not matching `audit-rfc-XXXX-*`) are skipped silently — not reported in `skipped[]`.
  - `audit.module.ts` — `forgeAuditModule: ForgeModule` registering `audit.archive` command.
  - `index.ts` — barrel exporting `forgeAuditModule` and types.
- Register `audit.archive` with same flags and scope as `plan.archive`, with `writes: ["docs/audits/*.md", "docs/audits/archive/**"]`, `reads: ["docs/audits/**/*.md", "docs/rfcs/**/*.md"]`.

**Validation:**

- `pnpm exec tsx packages/forge/bin/cli.ts audit.archive --dry-run --json` produces valid JSON output with `command: "audit.archive"`.
- Standalone audit files (e.g. `2026-05-18-onboarding-claude-opus-4.7-max.md`) are not in `moved[]` or `skipped[]`.

**Completion criterion:** `audit.archive` command is registered in `forgeAuditModule` and produces correct dry-run output, with standalone audits excluded.

**Human review:** no

---

### Step 4. Migrate ADR module from site-kernel to forge

**Goal:** Complete the ADR module migration started by RFC-0374.

**Agent actions:**

- Move `packages/os/site-kernel/src/adr/` contents to `packages/forge/os/adr/`:
  - `adr.module.ts` → rename export from `adrModule: KernelModule` to `forgeAdrModule: ForgeModule`. Update the module to use `ForgeModule`, `ForgeCommandInput`, `ForgeCommandResult`, `ForgeRuntimeContext` types from `../../src/forge-module.ts` and `../../src/types.ts` (same pattern as `forgeRfcModule`).
  - `handlers/list-create.ts` — update imports from `../../types.ts` (site-kernel) to `../../src/types.ts` (forge).
  - `handlers/validate.ts` — update imports. The `loadRfcIds` helper already imports from `@wgogol/forge/os/rfc` — verify this still works from within forge.
  - `handlers/archive.ts` — update imports.
  - `frontmatter-io.ts` — no import changes needed (uses `node:fs` and `yaml`).
  - `types.ts` — no import changes needed (pure types).
  - `index.ts` — update barrel to export `forgeAdrModule` and all types.
- In `packages/os/site-kernel/src/adr-module.ts` (or create a new barrel): re-export `forgeAdrModule` from `@wgogol/forge/os/adr` as `adrModule` for backward compatibility. This preserves the `@gogol/site-kernel/adr-module` import path used by `tools/kernel.config.ts`.
- Delete the old `packages/os/site-kernel/src/adr/` directory.
- Update `packages/forge/bin/cli.ts` `buildRegistry()` to include `forgeAdrModule`.
- Update `packages/forge/src/index.ts` to export `forgeAdrModule` from `../os/adr/adr.module.ts`.

**Validation:**

- `pnpm exec tsx packages/forge/bin/cli.ts adr.list --json` produces valid output.
- `pnpm exec tsx packages/forge/bin/cli.ts adr.validate --json` passes.
- `pnpm exec tsx packages/forge/bin/cli.ts adr.archive --dry-run --json` produces valid output.
- `pnpm --filter @gogol/site-kernel run build:check` passes (re-export compiles).

**Completion criterion:** ADR module lives in `packages/forge/os/adr/`, exports `forgeAdrModule`, and all three ADR commands work through the forge CLI. Site-kernel re-export preserves the `@gogol/site-kernel/adr-module` import path.

**Human review:** no

---

### Step 5. Register `docs.archive` umbrella in `forgeCoreModule`

**Goal:** Implement the umbrella command that calls all four archive commands in sequence.

**Agent actions:**

- Extend `CommandRegistry` interface in `packages/forge/src/types.ts` with `getCommand(name: string): ForgeCommandDefinition | undefined`. This is needed for `docs.archive` to invoke sub-commands through the registry.
- Update `ForgeCliRegistry` in `packages/forge/bin/cli.ts` — it already has `getCommand()`, so it satisfies the extended interface.
- Add `docs.archive` command registration to `packages/forge/os/core/core.module.ts`:
  - Handler calls `rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive` sequentially via `context.commandRegistry.getCommand(name).execute(input, context)`.
  - Aggregates results into `DocsArchiveResult` with `totalMoved` and `totalSkipped`.
  - Passes `--dry-run` and `--status` flags through to all four sub-commands.
  - Not atomic — if one sub-command fails, prior moves are not rolled back. Re-running is safe.
- Register with `scope: "workspace"`, `mutatesState: true`, `flags: { "dry-run": ..., status: ... }`.

**Validation:**

- `pnpm exec tsx packages/forge/bin/cli.ts docs.archive --dry-run --json` produces valid `DocsArchiveResult` JSON with all four sub-results.
- `pnpm exec tsx packages/forge/bin/cli.ts docs.archive --dry-run --status implemented` filters all four sub-commands to `implemented` status.

**Completion criterion:** `docs.archive` command is registered in `forgeCoreModule` and calls all four sub-commands, aggregating results.

**Human review:** no

---

### Step 6. Export new modules from `@wgogol/forge` package entrypoint

**Goal:** Make `forgePlanModule`, `forgeAuditModule`, and `forgeAdrModule` importable from `@wgogol/forge`.

**Agent actions:**

- Add to `packages/forge/src/index.ts`:
  ```ts
  export { forgePlanModule } from "../os/plan/plan.module.ts";
  export { forgeAuditModule } from "../os/audit/audit.module.ts";
  export { forgeAdrModule } from "../os/adr/adr.module.ts";
  ```
- Add to `packages/forge/bin/cli.ts` `buildRegistry()`:
  ```ts
  await import("../os/plan/plan.module.ts").then((m) => m.forgePlanModule),
  await import("../os/audit/audit.module.ts").then((m) => m.forgeAuditModule),
  await import("../os/adr/adr.module.ts").then((m) => m.forgeAdrModule),
  ```

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes.
- `pnpm exec tsx -e "import { forgePlanModule, forgeAuditModule, forgeAdrModule } from '@wgogol/forge'; console.log(typeof forgePlanModule, typeof forgeAuditModule, typeof forgeAdrModule)"` prints `object object object`.

**Completion criterion:** All three new modules are exported from `@wgogol/forge` and loaded by the forge CLI.

**Human review:** no

---

### Step 7. Remove `rfcPath` from audit frontmatter

**Goal:** Eliminate the stale `rfcPath` field from all audit files, the template, and the skill.

**Agent actions:**

- Remove `rfcPath:` line from `docs/audits/audit-0000-template.md` frontmatter.
- Remove `rfcPath:` line from all 78 `docs/audits/audit-rfc-*.md` files. Use a script or `sed` to do this in one pass:
  ```sh
  grep -rl "rfcPath:" docs/audits/audit-rfc-*.md | xargs sed -i '/^rfcPath:/d'
  ```
- Remove `rfcPath: docs/rfcs/rfc-XXXX-*.md` line from `packages/forge/skills/fo/fo-idea-audit/SKILL.md` (line 210).

**Validation:**

- `grep -r "rfcPath:" docs/audits/ packages/forge/skills/fo/fo-idea-audit/SKILL.md` returns no matches.
- `pnpm exec tsx packages/forge/bin/cli.ts rfc.validate --json` passes (audit files are not RFCs, but verify no side effects).

**Completion criterion:** Zero occurrences of `rfcPath` in `docs/audits/` and `packages/forge/skills/fo/fo-idea-audit/SKILL.md`.

**Human review:** no

---

### Step 8. Update ADR-0002 status to `implemented`

**Goal:** Manually update ADR-0002's status to reflect its already-implemented state.

**Agent actions:**

- Edit `docs/adrs/adr-0002-dirty-workpiece-guards.md` frontmatter: change `status: accepted` to `status: implemented`. The `implementedAt: 2026-07-22` field is already present.

**Validation:**

- `pnpm exec tsx packages/forge/bin/cli.ts adr.validate --id ADR-0002 --json` passes.

**Completion criterion:** ADR-0002 frontmatter has `status: implemented`.

**Human review:** no

---

### Step 9. Update `tools/kernel.config.ts`

**Goal:** Update the ADR module loader to point to forge (or keep site-kernel re-export).

**Agent actions:**

- The current `adr` loader is: `async () => (await import("@gogol/site-kernel/adr-module")).adrModule`.
- If the site-kernel re-export barrel works (Step 4 creates it), no change is needed here — the re-export preserves the import path.
- If the re-export path does not resolve, update the loader to: `async () => (await import("@wgogol/forge/os/adr")).forgeAdrModule`.
- Update the `MODULE_MAP` comment for `adr.*` to note the migration to forge.

**Validation:**

- `pnpm exec tsx packages/forge/bin/cli.ts adr.list --json` works from the workspace root.
- `pnpm --filter @gogol/site-kernel run build:check` passes.

**Completion criterion:** ADR commands work from the workspace root via `tools/kernel.config.ts`.

**Human review:** no

---

### Step 10. Run `docs.archive` and verify

**Goal:** Execute the umbrella command to archive all terminal-status files.

**Agent actions:**

- Run `pnpm exec tsx packages/forge/bin/cli.ts docs.archive --dry-run --json` first to preview.
- Review the dry-run output for correctness (correct files moving to correct subdirectories).
- Run `pnpm exec tsx packages/forge/bin/cli.ts docs.archive --json` to execute.
- Verify `docs/plans/archive/implemented/`, `docs/plans/archive/superseded/`, `docs/audits/archive/implemented/`, `docs/audits/archive/superseded/` directories are created with the expected files.
- Verify standalone audit files remain in `docs/audits/` root.
- Run `pnpm exec tsx packages/forge/bin/cli.ts rfc.validate --json` — all RFC files validate.
- Run `pnpm exec tsx packages/forge/bin/cli.ts adr.validate --json` — all ADR files validate.

**Validation:**

- `docs.archive` output shows `totalMoved > 0` and no errors.
- `rfc.validate` and `adr.validate` pass on all files (root + archived).

**Completion criterion:** All terminal-status RFC, ADR, plan, and audit files are in their respective `archive/<status>/` subdirectories. Standalone audits remain in root. Validation passes.

**Human review:** no

---

### Step 11. Update AGENTS.md

**Goal:** Document the new commands and archive directory structure.

**Agent actions:**

- Update `AGENTS.md` (root) documentation structure section to mention `docs/plans/archive/` and `docs/audits/archive/`.
- Add `plan.archive`, `audit.archive`, `docs.archive` to the command documentation.
- Note that ADR commands are now in `@wgogol/forge` (not site-kernel).
- Update `packages/forge/AGENTS.md` OS modules table to include `forgePlanModule`, `forgeAuditModule`, `forgeAdrModule`.

**Validation:**

- `grep "plan.archive" AGENTS.md` returns matches.
- `grep "docs.archive" AGENTS.md` returns matches.
- `grep "forgeAdrModule" packages/forge/AGENTS.md` returns matches.

**Completion criterion:** AGENTS.md files document the new commands and module locations.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec tsx packages/forge/bin/cli.ts ecosystem.manifest.generate` if command surfaces changed (new commands registered).
- Check off acceptance criteria: verify each criterion in RFC-0521 against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec tsx packages/forge/bin/cli.ts rfc.implement.stamp --id RFC-0521 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec tsx packages/forge/bin/cli.ts rfc.validate --id RFC-0521` passes.
- Every file in `scope.docs` is either updated or documented as not-applicable.

**Completion criterion:** All documentation artifacts in scope are updated; all acceptance criteria are checked off with inline evidence annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec tsx packages/forge/bin/cli.ts rfc.validate --id RFC-0521`
- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @gogol/site-kernel run build:check`
- `pnpm exec tsx packages/forge/bin/cli.ts adr.validate --json`
- `pnpm exec tsx packages/forge/bin/cli.ts docs.archive --dry-run --json` (smoke test)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0521` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0521.generated.json` — verification evidence (RFC-0330), if acceptance probes are declared

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Path change in tooling | Step 10 verifies `rfc.validate` and `adr.validate` pass after archiving |
| Performance of recursive scan | Step 1 implements batch-loading `loadRfcStatusMap` for O(n+m) lookup |
| Agent confusion | Step 11 updates AGENTS.md with clear documentation of archive directories |
| Git history (moving ~160 files) | Step 10 uses `docs.archive` which uses `fs.rename` — commit message will note the archive operation |
| ADR module migration breakage | Step 4 creates site-kernel re-export barrel preserving `@gogol/site-kernel/adr-module` import path; Step 9 verifies `tools/kernel.config.ts` still works |
| `rfcPath` removal breaks external tooling | Step 7 removes the field; codebase search confirmed no code reads it |
| Umbrella partial failure confusion | Step 5 implements idempotent sub-commands; re-running `docs.archive` is safe |

## 6. Escalation triggers

- If the ADR module migration reveals an invariant conflict with DNA-35 (readiness signal), run `pnpm exec tsx packages/forge/bin/cli.ts rfc.supersede.propose --id RFC-0521 --reason "..." --invariant "DNA-35"` instead of working around it.
- If `docs.archive` umbrella cannot call sub-commands through the registry (e.g. `CommandRegistry` interface cannot be extended), escalate by creating a direct handler-to-handler call pattern instead of registry-based dispatch. Document the deviation in the implementation commit.
