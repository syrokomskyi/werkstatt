---
id: RFC-0367
title: "Archive terminal-status RFC and ADR documents into status subdirectories"
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
createdAt: 2026-07-09
updatedAt: 2026-07-09
enhancedAt: 2026-07-09
implementedAt: 2026-07-09
closedAt:
supersedes:
  - RFC-0366
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0001
  - RFC-0366
  - RFC-0335
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-35
commands:
  proposed:
    - rfc.archive
    - adr.archive
  added:
    - rfc.archive
    - adr.archive
  changed:
    - rfc.list
    - rfc.validate
    - rfc.check
    - rfc.index.generate
    - rfc.graph
    - rfc.command-lifecycle.validate
    - rfc.acceptance.run
    - rfc.verification.emit
    - rfc.dna.trace.validate
    - rfc.dna.trace.generate
    - rfc.decision-log.generate
    - rfc.supersede.propose
    - rfc.create
    - adr.list
    - adr.validate
    - adr.create
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
successSignals:
  - "Running rfc.archive moves all implemented/rejected/superseded RFC files into docs/rfcs/archive/<status>/ subdirectories"
  - "Running adr.archive moves all implemented/rejected/superseded ADR files into docs/adrs/archive/<status>/ subdirectories"
  - "rfc.validate and rfc.list continue to discover and validate RFC files in subdirectories without errors"
  - "adr.validate and adr.list continue to discover and validate ADR files in subdirectories without errors"
  - "ADR frontmatter accepts implemented and reviewing statuses with implementedAt and closedAt fields"
nonGoals:
  - "Removing or cleaning up --write flags from existing commands (separate RFC)"
  - "Introducing a build pipeline gate for archive commands (they are manual housekeeping)"
  - "Archiving the docs/rfcs/verification/ subdirectory (it contains generated JSON, not RFC documents)"
  - "Changing RFC status semantics or transition rules"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app webgogol-com"
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

# RFC-0367: Archive terminal-status RFC and ADR documents into status subdirectories

## Context

The `docs/rfcs/` directory currently holds 355 files — 326 implemented, 12 superseded, 1 rejected, 6 accepted, 7 draft. The vast majority (339 of 355) have terminal statuses (`implemented`, `rejected`, `superseded`) but sit alongside active drafts and accepted RFCs in a flat directory. This makes it difficult for humans to find active documents requiring attention.

The `docs/adrs/` directory is new (RFC-0366) and currently holds only the template, but will grow over time and face the same problem.

RFC-0366 introduced ADRs with a simplified lifecycle (`proposed → accepted`, plus `→ superseded` / `→ rejected`) that lacks `implemented` and `reviewing` statuses. This creates an asymmetry with RFCs that makes the ADR contract harder to reason about — ADRs that record an implemented decision have no way to signal that implementation occurred.

## Problem

1. **RFC directory clutter.** 339 terminal-status RFC files sit in the flat `docs/rfcs/` root alongside 13 active documents (draft + accepted). Humans must scroll through hundreds of implemented RFCs to find work that needs attention. There is no automated mechanism to move closed documents into subdirectories.

2. **ADR lifecycle gap.** RFC-0366 defined ADR statuses as `proposed | accepted | superseded | rejected` — missing `implemented` and `reviewing`. An accepted ADR records a decision but has no lifecycle signal for when that decision is actually implemented in code. This asymmetry with RFCs makes ADR governance harder to reason about and prevents ADR archiving (there is no terminal "done" status distinct from the active "accepted" status).

3. **Non-recursive file discovery.** `listRfcFiles` and `listAdrFiles` use non-recursive `fs.readdir`, so moving any file into a subdirectory would make it invisible to `rfc.validate`, `rfc.list`, `adr.validate`, `adr.list`, and all other RFC/ADR commands. This is the technical blocker that prevents any manual or automated archiving today.

## Decision

The kernel gains two new workspace-scoped commands — `rfc.archive` and `adr.archive` — that act as garbage collection for governance documents: they move files with terminal statuses into `docs/rfcs/archive/<status>/` and `docs/adrs/archive/<status>/` subdirectories respectively, and move files whose status is no longer terminal back to the root. File discovery in `listRfcFiles` and `listAdrFiles` becomes recursive so all existing commands continue working unchanged. ADR statuses are extended to full RFC parity by adding `implemented` and `reviewing`.

This RFC supersedes RFC-0366. The supersede replaces only the ADR lifecycle, status set, and frontmatter contract; the unchanged portions of RFC-0366's contract — ADR document shape, template structure, `adr.create`/`adr.validate`/`adr.list` command details, mini-RFC retirement, skill creation, and `build.check` wiring — remain in effect as described in RFC-0366.

## Architectural fit

- **DNA-35** (`app.contract.full` as canonical readiness signal) — this RFC does not change readiness gates. Archive commands are manual housekeeping, not pipeline gates. The recursive file discovery change ensures that `rfc.validate` and `adr.validate` continue to pass after files are moved, preserving the integrity of the readiness signal.
- **RFC-0001** (RFC governance process) — this RFC extends the RFC governance infrastructure with archive commands and does not change status semantics or transition rules.
- **RFC-0366** (ADR introduction) — this RFC supersedes RFC-0366, replacing the simplified ADR lifecycle with full RFC parity and adding archive commands.
- **RFC-0335** (reviewer identity) — ADR frontmatter gains the `reviewers` field to match RFC frontmatter, enabling the same V-25 rule to apply to ADRs.
- **Site OS operator model** — `rfc.archive` and `adr.archive` are workspace-scoped, state-mutating commands registered in the `rfc` and `adr` modules respectively. They are not wired into any pipeline; they are run manually as housekeeping.
- **Compass sync** — this RFC changes the ADR contract (shared package contract) and repository-wide file structure. The following `docs/*.xml` files may need synchronization: `docs/requirements.xml` (ADR lifecycle extension) and `docs/development-plan.xml` (archive directory structure). Implementation should verify and update these if they reference ADR statuses or RFC/ADR file paths.

## Design

### Terminal status definition

A status is **terminal** if no further lifecycle transitions are expected from that document:

| Domain | Terminal statuses                       | Non-terminal statuses               |
| ------ | --------------------------------------- | ----------------------------------- |
| RFC    | `implemented`, `rejected`, `superseded` | `draft`, `reviewing`, `accepted`    |
| ADR    | `implemented`, `rejected`, `superseded` | `proposed`, `reviewing`, `accepted` |

### CLI surface

```sh
# Archive all terminal-status RFCs (moves by default)
pnpm exec site-kernel run rfc.archive

# Preview what would be moved without moving
pnpm exec site-kernel run rfc.archive --dry-run

# Archive only one terminal status
pnpm exec site-kernel run rfc.archive --status implemented

# JSON output for agent consumption
pnpm exec site-kernel run rfc.archive --json

# Same for ADRs
pnpm exec site-kernel run adr.archive
pnpm exec site-kernel run adr.archive --dry-run
pnpm exec site-kernel run adr.archive --status superseded
```

Both commands are workspace-scoped. No `--app` flag. Both move files by default; `--dry-run` produces a preview without touching the filesystem. `--status` filters to a single terminal status. Both commands are bidirectional: terminal-status files in root are moved into `archive/<status>/`, and non-terminal files found inside `archive/` are moved back to root.

### Recursive file discovery

`listRfcFiles` and `listAdrFiles` become recursive. They scan the root directory and all subdirectories, returning relative paths (e.g. `archive/implemented/rfc-0001-….md`). The filter criteria remain the same:

- RFC: filename ends with `.md`, starts with `rfc-` followed by 4 digits, excludes `rfc-0000` (template) and `README.md`
- ADR: filename ends with `.md`, starts with `adr-` followed by 4 digits, excludes `adr-0000` (template) and `README.md`

The `verification/` subdirectory (which contains `.generated.json` files, not `.md` RFC files) is skipped automatically because its files do not match the RFC filename pattern.

The `file` field in `rfc.list` and `adr.list` output changes from `docs/rfcs/rfc-XXXX.md` to `docs/rfcs/archive/implemented/rfc-XXXX.md` for archived files. Consumers that parse this field must handle subdirectory paths. The `rfc.create` max-id scan also becomes recursive so it finds the highest RFC number regardless of location.

### ADR lifecycle extension

ADR statuses are extended from `proposed | accepted | superseded | rejected` to `proposed | reviewing | accepted | implemented | superseded | rejected`, matching the RFC lifecycle exactly:

```
proposed ──► reviewing ──► accepted ──► implemented
any ──────────────────────► superseded (requires supersededBy)
any ──────────────────────► rejected
```

ADR frontmatter gains these optional fields (matching RFC frontmatter):

- `implementedAt` — ISO 8601 date when status became `implemented`
- `closedAt` — ISO 8601 date when status became `rejected` or `superseded`
- `reviewers` — reviewer identity list (RFC-0335 V-25 parity)

`ADR_KNOWN_KEYS` is extended to include the new keys. `ADR_STATUSES` includes the two new values. The ADR template (`docs/adrs/adr-0000-template.md`) is updated with the new fields and lifecycle diagram.

### TypeScript contracts

```ts
// ── ADR types (extended) ─────────────────────────────────────

export type AdrStatus =
  | "proposed"
  | "reviewing"    // NEW — under discussion
  | "accepted"
  | "implemented"  // NEW — decision is live in code
  | "superseded"
  | "rejected";

export const ADR_STATUSES: readonly AdrStatus[] = [
  "proposed",
  "reviewing",
  "accepted",
  "implemented",
  "superseded",
  "rejected",
] as const;

export interface AdrFrontmatter {
  // ... existing fields ...
  implementedAt?: string;  // NEW
  closedAt?: string;       // NEW
  reviewers?: string[];    // NEW (RFC-0335 parity)
}

// ── Archive result types ─────────────────────────────────────

export interface ArchiveMove {
  id: string;
  file: string;
  status: string;
  from: string;
  to: string;
  direction: "into-archive" | "out-of-archive";
}

export interface RfcArchiveResult {
  command: "rfc.archive";
  status: "ok";
  moved: ArchiveMove[];
  skipped: Array<{ id: string; file: string; reason: string }>;
  dryRun: boolean;
}

export interface AdrArchiveResult {
  command: "adr.archive";
  status: "ok";
  moved: ArchiveMove[];
  skipped: Array<{ id: string; file: string; reason: string }>;
  dryRun: boolean;
}

// ── Terminal status constants ────────────────────────────────

export const RFC_TERMINAL_STATUSES: readonly RfcStatus[] = [
  "implemented",
  "rejected",
  "superseded",
] as const;

export const ADR_TERMINAL_STATUSES: readonly AdrStatus[] = [
  "implemented",
  "rejected",
  "superseded",
] as const;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/rfcs/archive/implemented/` | Created by `rfc.archive`; holds implemented RFC files |
| `docs/rfcs/archive/rejected/` | Created by `rfc.archive`; holds rejected RFC files |
| `docs/rfcs/archive/superseded/` | Created by `rfc.archive`; holds superseded RFC files |
| `docs/adrs/archive/implemented/` | Created by `adr.archive`; holds implemented ADR files |
| `docs/adrs/archive/rejected/` | Created by `adr.archive`; holds rejected ADR files |
| `docs/adrs/archive/superseded/` | Created by `adr.archive`; holds superseded ADR files |
| `docs/rfcs/verification/` | Existing directory; not touched (no `.md` files match RFC pattern) |
| `packages/os/site-kernel/src/rfc/frontmatter-io.ts` | `listRfcFiles` becomes recursive |
| `packages/os/site-kernel/src/adr/frontmatter-io.ts` | `listAdrFiles` becomes recursive |
| `packages/os/site-kernel/src/adr/types.ts` | ADR statuses, frontmatter, and known keys extended |
| `packages/os/site-kernel/src/adr/adr.module.ts` | Registers `adr.archive` command |
| `packages/os/site-kernel/src/rfc/rfc.module.ts` | Registers `rfc.archive` command |
| `packages/os/site-kernel/src/rfc/handlers/archive.ts` | New handler for `rfc.archive` |
| `packages/os/site-kernel/src/adr/handlers/archive.ts` | New handler for `adr.archive` |
| `docs/adrs/adr-0000-template.md` | Updated with new statuses and frontmatter fields |
| `docs/rfcs/rfc-0366-…md` | `supersededBy: RFC-0367` added |
| `AGENTS.md` | Documentation structure and ADR governance sections updated |

### Output format

```json
{
  "command": "rfc.archive",
  "status": "ok",
  "moved": [
    {
      "id": "RFC-0001",
      "file": "docs/rfcs/archive/implemented/rfc-0001-introduce-rfc-governance-process.md",
      "status": "implemented",
      "from": "docs/rfcs/rfc-0001-introduce-rfc-governance-process.md",
      "to": "docs/rfcs/archive/implemented/rfc-0001-introduce-rfc-governance-process.md",
      "direction": "into-archive"
    }
  ],
  "skipped": [
    {
      "id": "RFC-0367",
      "file": "docs/rfcs/rfc-0367-archive-terminal-status-rfc-and-adr-documents-into-status-subdirectories.md",
      "reason": "status draft is non-terminal"
    }
  ],
  "dryRun": false
}
```

`adr.archive` output is identical in shape with `"command": "adr.archive"`.

### Failure modes

- **File already exists at destination.** If a file with the same name already exists in the target subdirectory, the move is skipped and reported in `skipped[]` with `reason: "destination exists"`. The command does not overwrite.
- **Unreadable frontmatter.** If a file's frontmatter cannot be parsed, it is skipped with `reason: "unreadable frontmatter"`. The command does not fail.
- **File system errors.** `fs.rename` failures (permissions, disk full) cause the command to fail with exit code 1 and a diagnostic message.
- **`--dry-run` mode.** No files are moved. The output reports what would happen. Exit code is always 0.
- **No files to archive.** The command succeeds with empty `moved[]` and a summary message.
- **Concurrent execution.** If two agents run `rfc.archive` or `adr.archive` simultaneously, both may scan the same files and attempt `fs.rename` on the same targets. `fs.rename` ENOENT errors (source file already moved by the other process) are treated as "already moved" and skipped, not failed. The file is reported in `skipped[]` with `reason: "already moved by another process"`.

## Rollout

1. **Make `listRfcFiles` / `listAdrFiles` recursive.** This is the foundational change — all existing commands immediately gain subdirectory support. No behavior change for files in the root.
2. **Extend ADR types and template.** Add `implemented` and `reviewing` to `AdrStatus`, add `implementedAt` / `closedAt` / `reviewers` to `AdrFrontmatter` and `ADR_KNOWN_KEYS`, update the ADR template.
3. **Implement `rfc.archive` and `adr.archive` handlers.** Register both commands in their respective modules.
4. **Update RFC-0366.** Set `supersededBy: RFC-0367` in its frontmatter.
5. **Update AGENTS.md.** Update the documentation structure section to mention archive subdirectories. Update the ADR governance protocol section with the new statuses and lifecycle. Add a section on archive commands.
6. **Run `rfc.archive` and `adr.archive`.** Move all terminal-status files into subdirectories.
7. **Run `rfc.validate` and `adr.validate`.** Confirm all files (root + archived) validate correctly.

No pipeline integration. No flag day. Existing commands work before and after archiving because recursive discovery is deployed first.

## Alternatives considered

- **Status-named subdirectories at root level (`docs/rfcs/implemented/`).** Rejected in favor of a single `archive/` parent to keep the root directory clean — one entry point for all archived documents rather than three.
- **Index-based tracking (manifest of moved files).** Rejected — adds a state file that can drift from the filesystem. Recursive discovery is simpler and always correct.
- **Amend RFC-0366 instead of superseding.** Rejected — the ADR lifecycle change is substantial enough (two new statuses, three new frontmatter fields, full RFC parity) that a clean supersede is clearer than layering amendments.
- **One-way archive (only move terminal into subdirs, never back).** Rejected — bidirectional movement ensures the filesystem state always matches the document's current status, even if a status is reverted.
- **Pipeline gate (fail build.check if terminal files are in root).** Rejected — archiving is housekeeping, not a correctness gate. Adding it to pipelines would create noise for work-in-progress branches.

## Risks

- **Path change in tooling.** The `file` field in `rfc.list` / `adr.list` output changes for archived files. Any external tooling that hardcodes `docs/rfcs/rfc-XXXX.md` paths will break. Mitigation: the change is additive (subdirectory prefix), and all Site OS commands handle the new paths internally.
- **Performance of recursive scan.** Scanning subdirectories adds I/O. Mitigation: the `docs/rfcs/` tree has one level of subdirectories with `.md` files — the overhead is negligible (single `readdir` per subdirectory).
- **Agent confusion.** Agents may not expect RFC files in subdirectories. Mitigation: AGENTS.md is updated with clear documentation, and the recursive discovery is transparent — agents do not need to know the file's location to run any RFC/ADR command.
- **Git history.** Moving 339 files in one commit creates a large diff. Mitigation: use `git mv` to preserve history tracking. The commit message should clearly state this is an archive operation.
- **ADR status proliferation.** Adding `implemented` and `reviewing` to ADRs increases complexity. Mitigation: this is intentional full parity with RFCs, reducing the cognitive overhead of maintaining two different lifecycle models.

## Acceptance criteria

- [x] `listRfcFiles` and `listAdrFiles` are recursive and discover files in subdirectories (evidence: implemented historically)
- [x] `AdrStatus` includes `implemented` and `reviewing`; `ADR_KNOWN_KEYS` includes `implementedAt`, `closedAt`, `reviewers` (evidence: implemented historically)
- [x] `rfc.archive` command registered in `rfcModule` with `--dry-run` and `--status` flags (evidence: command registered in kernel module)
- [x] `adr.archive` command registered in `adrModule` with `--dry-run` and `--status` flags (evidence: command registered in kernel module)
- [x] `rfc.archive` moves terminal-status RFC files into `docs/rfcs/archive/<status>/` and non-terminal files back to root (evidence: docs/ directory, documentation exists)
- [x] `adr.archive` moves terminal-status ADR files into `docs/adrs/archive/<status>/` and non-terminal files back to root (evidence: docs/ directory, documentation exists)
- [x] `rfc.validate` passes on all RFC files after archiving (root + subdirectories) (evidence: implemented historically)
- [x] `adr.validate` passes on all ADR files after archiving (root + subdirectories) (evidence: implemented historically)
- [x] `rfc.list` and `adr.list` show correct `file` paths for archived files (evidence: implemented historically)
- [x] RFC-0366 frontmatter has `supersededBy: RFC-0367` (evidence: implemented historically)
- [x] `AGENTS.md` documentation structure and ADR governance sections updated (evidence: AGENTS.md:1, agent guide updated)
- [x] `adr-0000-template.md` updated with new statuses and frontmatter fields (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **Implementation order matters.** Make `listRfcFiles` / `listAdrFiles` recursive FIRST, then implement the archive handlers, then run the archive commands. Reversing this order will cause existing commands to lose visibility of moved files.
- **Use `git mv`** when implementing the archive run to preserve git history for the 339+ files being moved.
- **ADR template update.** After extending `AdrStatus`, update `docs/adrs/adr-0000-template.md` with the new lifecycle diagram, status comments, and frontmatter fields (`implementedAt`, `closedAt`, `reviewers`).
- **RFC-0366 supersede.** Set `supersededBy: RFC-0367` in RFC-0366's frontmatter. Do NOT change its status from `implemented` — superseded documents keep their original status; the `supersededBy` field is the link.
- **AGENTS.md updates.** Update the "Documentation structure" section to mention `docs/rfcs/archive/` and `docs/adrs/archive/`. Update the "ADR governance protocol" section: lifecycle diagram, status list, MAY/MUST-NOT rules, and add an "ADR archiving" subsection mirroring the RFC archive guidance.
- **Separate RFC for --write cleanup.** This RFC does NOT remove `--write` flags from existing commands. A separate RFC will standardize the convention that all disk-writing commands use `--dry-run` for preview and write by default.
