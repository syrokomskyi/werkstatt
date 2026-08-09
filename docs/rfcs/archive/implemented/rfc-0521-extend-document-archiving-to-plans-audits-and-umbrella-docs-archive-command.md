---
id: RFC-0521
title: "Extend document archiving to plans, audits, and umbrella docs.archive command"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-24
updatedAt: 2026-07-24
enhancedAt: 2026-07-24
implementedAt: 2026-07-24
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0367
  - RFC-0374
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-35
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - plan.archive
    - audit.archive
    - docs.archive
  added:
    - plan.archive
    - audit.archive
    - docs.archive
  changed:
    - adr.archive
    - adr.list
    - adr.validate
    - adr.create
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@wgogol/forge"
  - "@gogol/site-kernel"
successSignals:
  - "Running docs.archive moves terminal-status RFC, ADR, plan, and audit files into their respective archive/<status>/ subdirectories in one command"
  - "Running plan.archive moves plan files whose parent RFC has terminal status into docs/plans/archive/<status>/"
  - "Running audit.archive moves audit files whose parent RFC has terminal status into docs/audits/archive/<status>/"
  - "Running adr.archive moves terminal-status ADR files into docs/adrs/archive/<status>/ (migrated from site-kernel to forge)"
  - "Standalone audit files (not matching audit-rfc-XXXX-*) remain in docs/audits/ root after audit.archive"
  - "rfcPath field is removed from all audit frontmatter and the audit template"
nonGoals:
  - "Introducing plan.validate, plan.list, audit.validate, or audit.list commands — separate future RFC"
  - "Adding adr.implement.stamp command — ADR status transitions remain manual frontmatter edits"
  - "Archiving standalone audit files (not linked to an RFC) — they remain in docs/audits/ root"
  - "Pipeline integration for archive commands — archiving is manual housekeeping per RFC-0367"
  - "Changing RFC or ADR status semantics or transition rules"
  - "Archiving the docs/rfcs/verification/ subdirectory"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0521: Extend document archiving to plans, audits, and umbrella docs.archive command

## Context

RFC-0367 introduced `rfc.archive` and `adr.archive` commands that move terminal-status governance documents into `archive/<status>/` subdirectories. `rfc.archive` was subsequently migrated to `@wgogol/forge` (RFC-0374), but `adr.archive` and the rest of the ADR module remain in `packages/os/site-kernel/src/adr/`.

The `docs/plans/` directory currently holds ~70 implementation plan files (`plan-rfc-XXXX-*`) and `docs/audits/` holds ~85 audit files (`audit-rfc-XXXX-*` plus standalone audits). When an RFC is archived via `rfc.archive`, its associated plan and audit files remain in the root of their respective directories. There is no automated mechanism to archive them — operators must manually move files or leave them cluttering the active directories.

Additionally, audit frontmatter contains a `rfcPath` field that duplicates the `rfcId` information and becomes stale when the referenced RFC is moved into an archive subdirectory. This field is not consumed by any code — it is a convenience field for humans that creates a maintenance burden.

Finally, archiving all four document types requires running four separate commands (`rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive`) manually. Forgetting one leaves the repository in a partially-archived state.

## Problem

1. **Plan and audit directory clutter.** ~70 plan files and ~85 audit files sit in flat `docs/plans/` and `docs/audits/` roots. The vast majority correspond to implemented or superseded RFCs that have already been archived. Humans and agents must scroll through hundreds of stale documents to find active ones.

2. **No automated plan/audit archiving.** `rfc.archive` moves RFC files but leaves associated plans and audits behind. There is no command to archive them — operators must manually move files, which is error-prone and rarely done.

3. **ADR module split across packages.** `adr.archive`, `adr.create`, `adr.validate`, and `adr.list` live in `packages/os/site-kernel/src/adr/` while the analogous RFC commands were migrated to `@wgogol/forge/os/rfc/` (RFC-0374). This half-migrated state means governance commands are split across two packages with no clear principle.

4. **Stale `rfcPath` in audit frontmatter.** Audit files contain `rfcPath: docs/rfcs/rfc-XXXX-*.md` which becomes a broken reference after `rfc.archive` moves the RFC into `docs/rfcs/archive/<status>/`. The field is not consumed by any code — `rfcId` is the stable identifier.

5. **No umbrella command.** Archiving all document types requires running 2–4 commands manually. Forgetting one creates a partially-archived state where RFCs are in `archive/` but their plans and audits remain in the root.

## Decision

The forge gains two new archive commands — `plan.archive` and `audit.archive` — that move plan and audit files into `docs/plans/archive/<status>/` and `docs/audits/archive/<status>/` subdirectories based on the terminal status of their parent RFC. An umbrella `docs.archive` command in `forgeCoreModule` orchestrates all four archive commands (`rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive`) in a single invocation. The ADR module (`adr.create`, `adr.validate`, `adr.list`, `adr.archive`) is migrated from `packages/os/site-kernel/src/adr/` to `@wgogol/forge/os/adr/` with site-kernel re-exporting for backward compatibility. The `rfcPath` field is removed from audit frontmatter and the audit template.

## Architectural fit

- **DNA-35** (`app.contract.full` as canonical readiness signal) — this RFC does not change readiness gates. Archive commands are manual housekeeping, not pipeline gates. Recursive file discovery ensures that future `plan.validate` / `audit.validate` commands (when introduced) will continue to discover archived files.
- **RFC-0367** (archive terminal-status documents) — this RFC extends the archive pattern from RFC/ADR to plans and audits, completing the governance document lifecycle.
- **RFC-0374** (forge portability) — this RFC completes the ADR module migration from site-kernel to forge, aligning with the principle that governance commands live in `@wgogol/forge`.
- **Site OS operator model** — all new commands are workspace-scoped, state-mutating, and not wired into any pipeline. They are run manually as housekeeping, consistent with `rfc.archive` and `adr.archive`.
- **Compass sync** — this RFC changes the repository-wide file structure (new archive subdirectories) and shared package contracts (ADR module migration). `docs/development-plan.xml` may need synchronization if it references ADR module paths.

## Design

### CLI surface

```sh
# Archive all terminal-status plans (moves by default)
pnpm exec tsx packages/forge/bin/cli.ts plan.archive

# Preview what would be moved without moving
pnpm exec tsx packages/forge/bin/cli.ts plan.archive --dry-run

# Archive only plans whose parent RFC has status implemented
pnpm exec tsx packages/forge/bin/cli.ts plan.archive --status implemented

# Same for audits
pnpm exec tsx packages/forge/bin/cli.ts audit.archive
pnpm exec tsx packages/forge/bin/cli.ts audit.archive --dry-run
pnpm exec tsx packages/forge/bin/cli.ts audit.archive --status superseded

# Umbrella: archive all four document types in one command
pnpm exec tsx packages/forge/bin/cli.ts docs.archive
pnpm exec tsx packages/forge/bin/cli.ts docs.archive --dry-run
pnpm exec tsx packages/forge/bin/cli.ts docs.archive --status implemented

# ADR archive (migrated from site-kernel to forge)
pnpm exec tsx packages/forge/bin/cli.ts adr.archive
pnpm exec tsx packages/forge/bin/cli.ts adr.archive --dry-run
```

All commands are workspace-scoped. No `--app` flag. All move files by default; `--dry-run` produces a preview without touching the filesystem. `--status` filters to a single terminal status (`implemented`, `rejected`, `superseded`). All commands are bidirectional: terminal-status files in root are moved into `archive/<status>/`, and non-terminal files found inside `archive/` are moved back to root.

For `plan.archive` and `audit.archive`, bidirectional movement uses the parent RFC's status, not the plan/audit's own `status` field. If a plan file is in `archive/implemented/` but the parent RFC's status has changed to non-terminal (e.g. `accepted`), the plan moves back to root. If the parent RFC is not found, the file is skipped (see Failure modes).

The umbrella `docs.archive` command calls `rfc.archive`, `adr.archive`, `plan.archive`, and `audit.archive` sequentially through the command registry by name. It is not atomic — each sub-command executes independently. All archive commands are idempotent, so re-running `docs.archive` after a partial failure is safe. The `--status` flag is passed through to all four sub-commands, filtering each to the same terminal status. The `--dry-run` flag is similarly passed through to all four.

### TypeScript contracts

```ts
// ── Plan archive types ───────────────────────────────────────

export interface PlanArchiveResult {
  command: "plan.archive";
  status: "ok";
  moved: ArchiveMove[];
  skipped: ArchiveSkip[];
  dryRun: boolean;
}

// ── Audit archive types ──────────────────────────────────────

export interface AuditArchiveResult {
  command: "audit.archive";
  status: "ok";
  moved: ArchiveMove[];
  skipped: ArchiveSkip[];
  dryRun: boolean;
}

// ── Umbrella docs archive types ──────────────────────────────

export interface DocsArchiveResult {
  command: "docs.archive";
  status: "ok";
  results: {
    rfc: RfcArchiveResult;
    adr: AdrArchiveResult;
    plan: PlanArchiveResult;
    audit: AuditArchiveResult;
  };
  totalMoved: number;
  totalSkipped: number;
  dryRun: boolean;
}

// ── Shared types (re-used from RFC-0367) ─────────────────────

export interface ArchiveMove {
  id: string;
  file: string;
  status: string;
  from: string;
  to: string;
  direction: "into-archive" | "out-of-archive";
}

export interface ArchiveSkip {
  id: string;
  file: string;
  reason: string;
}

// ── RFC status lookup helper (in os/rfc/) ────────────────────

export async function getRfcStatusById(
  rfcDirPath: string,
  rfcId: string,
): Promise<string | undefined>;
// Scans docs/rfcs/ recursively (including archive/) for the RFC
// with the given id. Returns its frontmatter status, or undefined
// if not found.

// ── Forge module registrations ────────────────────────────────

export const forgePlanModule: ForgeModule;
// Registers plan.archive command. Exported from @wgogol/forge/os/plan.

export const forgeAuditModule: ForgeModule;
// Registers audit.archive command. Exported from @wgogol/forge/os/audit.

export const forgeAdrModule: ForgeModule;
// Registers adr.list, adr.create, adr.validate, adr.archive commands.
// Exported from @wgogol/forge/os/adr. Migrated from site-kernel's adrModule.
// site-kernel re-exports forgeAdrModule as adrModule for backward compatibility.
```

The `ArchiveMove` and `ArchiveSkip` interfaces are shared across all four archive commands. `getRfcStatusById` is a new public helper in `os/rfc/frontmatter-io.ts` that `plan.archive` and `audit.archive` use to look up the parent RFC's status without duplicating file discovery logic.

**Performance note:** `getRfcStatusById` scans `docs/rfcs/` recursively. Implementations should batch-load all RFC frontmatter statuses into a `Map<string, string>` once per command invocation (not per-file), then look up by id. With ~500 RFC files and ~160 plan+audit files, per-file scanning would be O(n×m); batch-loading reduces this to O(n+m).

**ADR module type compatibility:** The current `adrModule` in site-kernel is of type `KernelModule`. After migration, `forgeAdrModule` is of type `ForgeModule`. Both types are structurally compatible — `ForgeModule` is a superset of `KernelModule` with forge-specific extensions (`supportsAllSites`, etc.). The `tools/kernel.config.ts` registration path accepts both types. Consumers importing `adrModule` from `@gogol/site-kernel` will receive `forgeAdrModule` (re-exported), which is assignable to `KernelModule`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/plans/archive/implemented/` | Created by `plan.archive`; holds plan files whose parent RFC is implemented |
| `docs/plans/archive/rejected/` | Created by `plan.archive`; holds plan files whose parent RFC is rejected |
| `docs/plans/archive/superseded/` | Created by `plan.archive`; holds plan files whose parent RFC is superseded |
| `docs/audits/archive/implemented/` | Created by `audit.archive`; holds audit files whose parent RFC is implemented |
| `docs/audits/archive/rejected/` | Created by `audit.archive`; holds audit files whose parent RFC is rejected |
| `docs/audits/archive/superseded/` | Created by `audit.archive`; holds audit files whose parent RFC is superseded |
| `packages/forge/os/plan/` | New forge module: `plan.module.ts`, `handlers/archive.ts`, `frontmatter-io.ts`, `types.ts`; exports `forgePlanModule` |
| `packages/forge/os/audit/` | New forge module: `audit.module.ts`, `handlers/archive.ts`, `frontmatter-io.ts`, `types.ts`; exports `forgeAuditModule` |
| `packages/forge/os/adr/` | Migrated from `packages/os/site-kernel/src/adr/`; contains all ADR commands; exports `forgeAdrModule` |
| `packages/forge/os/rfc/frontmatter-io.ts` | `getRfcStatusById` helper added |
| `packages/forge/os/core/core.module.ts` | `docs.archive` umbrella command registered |
| `packages/os/site-kernel/src/adr/` | Deleted; site-kernel re-exports from `@wgogol/forge/os/adr` |
| `docs/audits/audit-0000-template.md` | `rfcPath` field removed |
| `docs/audits/audit-rfc-*.md` | `rfcPath` field removed from all existing audit files |
| `packages/forge/skills/fo/fo-idea-audit/SKILL.md` | `rfcPath` field removed from audit frontmatter template |

### Output format

```json
{
  "command": "plan.archive",
  "status": "ok",
  "moved": [
    {
      "id": "PLAN-RFC-0482-01",
      "file": "docs/plans/archive/implemented/plan-rfc-0482-pbp-presentation-fields-for-legacy-business-data-migration.md",
      "status": "implemented",
      "from": "docs/plans/plan-rfc-0482-pbp-presentation-fields-for-legacy-business-data-migration.md",
      "to": "docs/plans/archive/implemented/plan-rfc-0482-pbp-presentation-fields-for-legacy-business-data-migration.md",
      "direction": "into-archive"
    }
  ],
  "skipped": [
    {
      "id": "PLAN-RFC-0518-01",
      "file": "docs/plans/plan-rfc-0518-gate-metadata-on-command-definitions.md",
      "reason": "parent RFC-0518 status draft is non-terminal"
    }
  ],
  "dryRun": false
}
```

`audit.archive` output is identical in shape with `"command": "audit.archive"`.

The umbrella `docs.archive` output aggregates all four sub-results:

```json
{
  "command": "docs.archive",
  "status": "ok",
  "results": {
    "rfc": { "command": "rfc.archive", "status": "ok", "moved": [], "skipped": [], "dryRun": false },
    "adr": { "command": "adr.archive", "status": "ok", "moved": [], "skipped": [], "dryRun": false },
    "plan": { "command": "plan.archive", "status": "ok", "moved": [], "skipped": [], "dryRun": false },
    "audit": { "command": "audit.archive", "status": "ok", "moved": [], "skipped": [], "dryRun": false }
  },
  "totalMoved": 42,
  "totalSkipped": 15,
  "dryRun": false
}
```

### Failure modes

- **File already exists at destination.** If a file with the same name already exists in the target subdirectory, the move is skipped and reported in `skipped[]` with `reason: "destination exists"`. The command does not overwrite.
- **Unreadable frontmatter.** If a file's frontmatter cannot be parsed, it is skipped with `reason: "unreadable frontmatter"`. The command does not fail.
- **No `rfcId` in frontmatter.** If a plan or audit file matches the `plan-rfc-XXXX-*` / `audit-rfc-XXXX-*` naming pattern but has no `rfcId` in frontmatter, it is skipped with `reason: "no rfcId in frontmatter"`. The command does not fail.
- **Parent RFC not found.** If `rfcId` references an RFC that does not exist (neither in root nor in archive), the file is skipped with `reason: "RFC-XXXX not found"`. The command does not fail.
- **Standalone audit files.** Files in `docs/audits/` that do not match the `audit-rfc-XXXX-*` naming pattern are skipped silently — they are not reported in `skipped[]` and are not moved. These are standalone audits that remain in the root by design.
- **File system errors.** `fs.rename` failures (permissions, disk full) cause the command to fail with exit code 1 and a diagnostic message.
- **`--dry-run` mode.** No files are moved. The output reports what would happen. Exit code is always 0.
- **No files to archive.** The command succeeds with empty `moved[]` and a summary message.
- **Concurrent execution.** If two agents run an archive command simultaneously, both may scan the same files and attempt `fs.rename` on the same targets. `fs.rename` ENOENT errors (source file already moved by the other process) are treated as "already moved" and skipped, not failed.
- **Umbrella partial failure.** `docs.archive` is not atomic. If one sub-command fails, prior sub-commands' moves are not rolled back. Re-running `docs.archive` is safe — idempotent commands skip already-archived files.

## Rollout

1. **Add `getRfcStatusById` helper to `os/rfc/frontmatter-io.ts`.** This is the foundational change — `plan.archive` and `audit.archive` depend on it. No behavior change for existing commands.
2. **Create `os/plan/` module in forge.** Implement `listPlanFiles` (recursive), `readAndParsePlan`, and `plan.archive` handler. Register `plan.archive` command.
3. **Create `os/audit/` module in forge.** Implement `listAuditFiles` (recursive), `readAndParseAudit`, and `audit.archive` handler. Register `audit.archive` command.
4. **Migrate ADR module from site-kernel to forge.** Move `packages/os/site-kernel/src/adr/` to `packages/forge/os/adr/`. Update site-kernel to re-export from forge. Update `tools/kernel.config.ts` if needed.
5. **Register `docs.archive` umbrella in `forgeCoreModule`.** The command calls `rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive` through the command registry by name.
6. **Remove `rfcPath` from audit frontmatter.** Update `docs/audits/audit-0000-template.md`, remove the field from all existing `audit-rfc-*.md` files, and update the `fo-idea-audit` skill (`packages/forge/skills/fo/fo-idea-audit/SKILL.md`) to remove `rfcPath` from its audit frontmatter template. Without the skill update, new audits would re-introduce the field.
7. **Update ADR-0002 status.** Manually edit `docs/adrs/adr-0002-dirty-workpiece-guards.md` frontmatter: change `status: accepted` to `status: implemented` (it already has `implementedAt: 2026-07-22`).
8. **Run `docs.archive`.** Move all terminal-status files across all four document types into their respective archive subdirectories.
9. **Run `rfc.validate` and `adr.validate`.** Confirm all files (root + archived) validate correctly.
10. **Update AGENTS.md.** Document the new commands and archive directory structure.

No pipeline integration. No flag day. Existing commands work before and after archiving because recursive discovery is deployed first. The ADR module migration is transparent — site-kernel re-exports preserve existing imports.

## Alternatives considered

- **RFC-linked archive via `rfc.archive` (single command moves RFC + plan + audit).** Rejected — `rfc.archive` would need to reach into `docs/plans/` and `docs/audits/`, violating the principle that each command owns its directory. Separate commands with an umbrella provide clean separation while maintaining convenience.

- **Flat archive (no status subdirectories for plans/audits).** Rejected in favor of mirroring the RFC structure (`archive/<status>/`). Consistency across all four document types makes navigation predictable and simplifies the `--status` filter.

- **Frontmatter `rfcId` as primary lookup, filename as fallback.** Rejected in favor of filename as primary, frontmatter as fallback. The filename convention (`plan-rfc-XXXX-*`, `audit-rfc-XXXX-*`) is stable and observed in all existing files. Frontmatter `rfcId` provides a reliable fallback for edge cases.

- **Own lifecycle status for plans (`draft → implemented`).** Rejected — plans and audits are implementation artifacts of RFCs, not independent governance documents. Their archive eligibility inherits from the parent RFC's terminal status. The plan's own `status: draft` field tracks document progress, not lifecycle decisions.

- **Pipeline gate (fail build.check if terminal files are in root).** Rejected — archiving is housekeeping, not a correctness gate. Consistent with RFC-0367's decision for RFC/ADR archiving.

- **Atomic umbrella with rollback.** Rejected — adds significant complexity for a rare failure mode. All archive commands are idempotent, so re-running `docs.archive` after a partial failure is safe and simple.

- **Keep `rfcPath` in audit frontmatter, update it on archive.** Rejected — modifying file content during archive violates the "archive only moves files" principle. `rfcId` is the stable identifier; `rfcPath` is a stale convenience field. Removing it eliminates the maintenance burden.

## Risks

- **Path change in tooling.** The `file` field in any future `plan.list` / `audit.list` output will include subdirectory prefixes for archived files. Mitigation: no existing commands consume plan/audit paths today. Future commands will handle subdirectory paths internally.
- **Performance of recursive scan.** Scanning subdirectories adds I/O. Mitigation: the `docs/plans/` and `docs/audits/` trees have one level of subdirectories with `.md` files — the overhead is negligible.
- **Agent confusion.** Agents may not expect plan/audit files in subdirectories. Mitigation: AGENTS.md is updated with clear documentation, and recursive discovery is transparent — agents do not need to know the file's location.
- **Git history.** Moving ~70 plan files and ~85 audit files in one commit creates a large diff. Mitigation: use `git mv` to preserve history tracking. The commit message should clearly state this is an archive operation.
- **ADR module migration breakage.** Moving the ADR module from site-kernel to forge may break imports. Mitigation: site-kernel re-exports all ADR types and handlers from forge, preserving existing import paths. The migration is transparent to consumers.
- **`rfcPath` removal breaks external tooling.** If any external tool reads `rfcPath` from audit frontmatter, it will break. Mitigation: codebase search confirmed no code reads this field. `rfcId` is the canonical reference.
- **Umbrella partial failure confusion.** If `rfc.archive` succeeds but `plan.archive` fails, the repository is in a partially-archived state. Mitigation: idempotent commands make re-running safe. `--dry-run` provides a full preview before execution.

## Acceptance criteria

- [x] `getRfcStatusById` helper exists in `packages/forge/os/rfc/frontmatter-io.ts` and returns the correct status for a given RFC id (including archived RFCs) (evidence: packages/forge/os/rfc/frontmatter-io.ts:72-117, commit 7ec1b583f)
- [x] `plan.archive` command registered in `forgePlanModule` with `--dry-run` and `--status` flags (evidence: packages/forge/os/plan/plan.module.ts, commit 7ec1b583f)
- [x] `audit.archive` command registered in `forgeAuditModule` with `--dry-run` and `--status` flags (evidence: packages/forge/os/audit/audit.module.ts, commit 7ec1b583f)
- [x] `docs.archive` umbrella command registered in `forgeCoreModule` with `--dry-run` and `--status` flags (evidence: packages/forge/os/core/core.module.ts:209-300, commit 228dec3c5)
- [x] `forgePlanModule`, `forgeAuditModule`, and `forgeAdrModule` exported from `@wgogol/forge` (evidence: packages/forge/src/index.ts:104-106, commit 011a1e421)
- [x] `plan.archive` moves plan files whose parent RFC has terminal status into `docs/plans/archive/<status>/` (evidence: dry-run output — 77 files would move, commit 7ec1b583f)
- [x] `audit.archive` moves audit files whose parent RFC has terminal status into `docs/audits/archive/<status>/` (evidence: dry-run output — 82 files would move, commit 7ec1b583f)
- [x] Standalone audit files (not matching `audit-rfc-XXXX-*`) remain in `docs/audits/` root after `audit.archive` (evidence: packages/forge/os/audit/handlers/archive.ts excludes non-matching files)
- [x] `docs.archive` calls all four sub-commands and aggregates results (evidence: dry-run output — 161 total moves aggregated, commit 74683179f)
- [x] ADR module migrated to `packages/forge/os/adr/`; site-kernel re-exports preserve existing imports (evidence: packages/os/site-kernel/src/adr/index.ts re-exports from @wgogol/forge/os/adr, commit 7ec1b583f)
- [x] `adr.archive` available through forge CLI (evidence: dry-run output — 2 ADR files would move, commit 7ec1b583f)
- [x] `rfcPath` field removed from `docs/audits/audit-0000-template.md` (evidence: grep confirms no rfcPath in template, commit 670e53686)
- [x] `rfcPath` field removed from all existing `docs/audits/audit-rfc-*.md` files (evidence: sed removed 80 lines, commit 670e53686)
- [x] `rfcPath` field removed from `packages/forge/skills/fo/fo-idea-audit/SKILL.md` audit frontmatter template (evidence: packages/forge/skills/fo/fo-idea-audit/SKILL.md:209, commit 670e53686)
- [x] ADR-0002 status updated to `implemented` (evidence: docs/adrs/adr-0002-dirty-workpiece-guards.md:4, commit 0b90c3332)
- [x] `listPlanFiles` and `listAuditFiles` are recursive and discover files in subdirectories (evidence: packages/forge/os/plan/frontmatter-io.ts and packages/forge/os/audit/frontmatter-io.ts use recursive scanDir)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0521 output — All 1 RFC(s) passed validation)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **Implementation order matters.** Add `getRfcStatusById` FIRST, then create plan/audit modules, then migrate ADR module, then register umbrella, then remove `rfcPath`, then run `docs.archive`.
- **Use `git mv`** when implementing the archive run to preserve git history for the ~155+ files being moved.
- **ADR module migration.** Move all files from `packages/os/site-kernel/src/adr/` to `packages/forge/os/adr/`. Update `packages/os/site-kernel/src/index.ts` to re-export from `@wgogol/forge/os/adr`. Update `tools/kernel.config.ts` to register `forgeAdrModule` if not already registered.
- **`rfcPath` removal.** Remove the `rfcPath:` line from all `docs/audits/audit-rfc-*.md` files. This is a bulk frontmatter edit — use a script or manual edits, not `audit.archive` (which only moves files, never modifies content).
- **ADR-0002 status update.** Manually edit `docs/adrs/adr-0002-dirty-workpiece-guards.md`: change `status: accepted` to `status: implemented`. The `implementedAt: 2026-07-22` field is already present. This is a manual frontmatter edit — there is no `adr.implement.stamp` command.
- **Umbrella `docs.archive` calls sub-commands through the registry by name**, not through direct handler imports. This ensures the umbrella works correctly even if sub-command handlers are in different modules.
- **`plan.archive` and `audit.archive` RFC-id lookup.** Primary: parse RFC id from filename (`plan-rfc-XXXX-*` → `RFC-XXXX`). Fallback: read `rfcId` from frontmatter. If neither yields a valid id, skip with warning.
- **Standalone audit filtering.** `audit.archive` only processes files matching `audit-rfc-XXXX-*` (4 digits after `rfc-`). Files like `2026-05-18-onboarding-claude-opus-4.7-max.md` or `architecture-review-20260707.html` are ignored silently.
