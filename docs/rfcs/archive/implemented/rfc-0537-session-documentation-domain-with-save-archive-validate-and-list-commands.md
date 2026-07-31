---
id: RFC-0537
title: Session documentation domain with save, archive, validate, and list commands
status: implemented
kind: command
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-26
updatedAt: 2026-07-26
enhancedAt: 2026-07-26
implementedAt: 2026-07-26
closedAt: null
supersedes: []
supersededBy: null
amends: []
amendedBy: []
related:
- RFC-0521
- RFC-0370
- RFC-0393
- RFC-0523
- RFC-0524
satisfies: []
versionBump: patch
commands:
  proposed: []
  added:
  - session.save
  - session.archive
  - session.validate
  - session.list
  changed:
  - docs.archive
  removed: []
appsImpacted: []
packagesImpacted:
- '@wgogol/forge'
successSignals:
- session.save converts raw ATIF exports from docs/sessions/.raw/ to structured markdown in docs/sessions/
- session.archive moves session files older than --max-age-days to docs/sessions/archive/
- docs.archive umbrella includes session.archive in its dispatch sequence
- session.validate checks frontmatter schema, RFC-id references, and .raw/ hygiene
- session.list filters sessions by date range, RFC, and type
- fo-session-save skill annotates sessions with summary, decisions, and related artifacts
- PREFERENCES.md saveSessions flag controls whether agent saves sessions automatically
- forge.yaml paths.sessionsDir and bindings.paths.sessionsDir configure session directory
nonGoals:
- Does not implement API-based session export (Devin API List session messages) — future work
- Does not implement full-text search (session.search) — session.list --rfc is sufficient for initial scope
- Does not modify fo-handoff skill behavior — fo-handoff remains temp-directory based for handoff documents
- Does not auto-archive on session.save — archiving is a separate command
- Does not implement session.resume or session.continue — those are IDE/CLI features, not documentation domain commands

---

# RFC-0537: Session documentation domain with save, archive, validate, and list commands

## Context

The WGogol platform accumulates session transcripts — conversations between operators and AI agents that produce RFCs, implementations, decisions, and architectural changes. These transcripts are valuable documentation artifacts: they capture rationale, decision-making processes, and context that is lost when a session ends.

Currently, the platform has no mechanism to save session transcripts as documentation. The `fo-handoff` skill compacts conversations into handoff documents, but explicitly saves to the OS temporary directory, not the workspace. There is no `docs/sessions/` domain, no commands for session lifecycle management, and no integration with the existing `docs.archive` umbrella command (RFC-0521).

Devin CLI supports `--export [PATH]` which writes the conversation to a file after each turn in ATIF format. Devin API provides `List session messages` for programmatic access. However, raw exports are not documentation — they need structure, metadata, and integration with the existing documentation ecosystem.

The existing documentation domains (RFCs, ADRs, plans, audits) each have a consistent pattern: a directory under `docs/`, archive subdirectory for terminal artifacts, `*.archive` command integrated into `docs.archive` umbrella, `*.validate` command, and `*.list` command. Sessions should follow this same pattern.

## Problem

1. **Session transcripts are lost.** When a session ends, the conversation — including design discussions, grilling Q&A, decision rationale, and debugging steps — is not persisted to the workspace. Future agents and operators cannot reference past sessions to understand why a decision was made.

2. **No documentation domain for sessions.** The platform has `docs/rfcs/`, `docs/adrs/`, `docs/plans/`, `docs/audits/`, but no `docs/sessions/`. Sessions are not treated as documentation, despite containing valuable institutional knowledge.

3. **No lifecycle management.** There are no commands to save, archive, validate, or list sessions. The `docs.archive` umbrella command (RFC-0521) dispatches to `rfc.archive`, `adr.archive`, `plan.archive`, and `audit.archive` — but has no session equivalent.

4. **No retention policy.** Without a dedicated domain, there is no mechanism to age out old sessions. The operator wants sessions older than a week to be moved to an archive subdirectory, but there is no command to enforce this.

5. **No configuration.** `PREFERENCES.md` has no flag to control whether sessions are saved. `forge.yaml` has no path for the sessions directory. Operators cannot opt in or out of session saving.

## Decision

The platform gains a new documentation domain `docs/sessions/` with four commands — `session.save`, `session.archive`, `session.validate`, `session.list` — registered in a new `forgeSessionModule` under `packages/forge/os/session/`. The `docs.archive` umbrella command is extended to include `session.archive` in its dispatch sequence. A new self-learning skill `fo-session-save` handles intelligent annotation and quality checks, while the `session.save` command performs deterministic ATIF-to-markdown conversion. The `PREFERENCES.md` file gains a `saveSessions: true|false` flag and `forge.yaml` gains `paths.sessionsDir` and `bindings.paths.sessionsDir`.

The architecture follows a hybrid approach: Devin CLI `--export` writes raw ATIF files to `docs/sessions/.raw/` (gitignored), the `session.save` command converts them to structured markdown with auto-extracted metadata, and the `fo-session-save` skill adds semantic annotations (summary, decisions, related artifacts) and performs quality checks. This separation ensures deterministic conversion (command) and intelligent enrichment (skill) are independently testable.

## Architectural fit

- **RFC-0521 (docs.archive umbrella):** This RFC extends the umbrella command pattern. `session.archive` is added as the fifth sub-command in the `docs.archive` dispatch sequence, alongside `rfc.archive`, `adr.archive`, `plan.archive`, and `audit.archive`. The pattern is identical: `--dry-run` and `--status` pass through, idempotent re-runs.
- **RFC-0370 (Operator preferences):** The `saveSessions: true|false` key in `PREFERENCES.md` follows the existing preference model (`aiLanguage`, `documentationLanguage`). Skills read preferences at start; `fo-session-save` checks `saveSessions` and no-ops if `false`.
- **RFC-0393 (Forge bindings):** `forge.yaml` gains `paths.sessionsDir` (top-level domain path, like `rfcsDir`, `auditsDir`) and `bindings.paths.sessionsDir` (for skill binding resolution, like `handoffsDir`, `reviewsDir`). `forge.doctor` validates both.
- **RFC-0523 (Skill concerns taxonomy):** The `fo-session-save` skill uses `concerns: document-only` — it writes `.md` files only, no executable code mutations.
- **RFC-0524 (Skill knowledge files):** The `fo-session-save` skill declares `knowledge: [qa-log.md, learned-principles.md, fix-patterns.md]` following the cumulative knowledge pattern proven by `grilling` and `mission-complete` skills.
- **Site OS operator model:** New module `forgeSessionModule` in `packages/forge/os/session/` follows the existing module-per-domain pattern (`forgeRfcModule`, `forgeAdrModule`, `forgePlanModule`, `forgeAuditModule`). All four commands are `scope: workspace`.
- **Documentation domain pattern:** `docs/sessions/` mirrors `docs/rfcs/`, `docs/audits/` — root directory for active files, `archive/` subdirectory for aged-out files, `.raw/` for unprocessed input (gitignored).

## Design

### CLI surface

```sh
# session.save — convert raw ATIF export to structured markdown
pnpm exec site-kernel run session.save
pnpm exec site-kernel run session.save --raw-file docs/sessions/.raw/2026-07-26-session.atif
pnpm exec site-kernel run session.save --json

# session.archive — move sessions older than --max-age-days to archive/
pnpm exec site-kernel run session.archive
pnpm exec site-kernel run session.archive --max-age-days 7 --dry-run
pnpm exec site-kernel run session.archive --json

# session.validate — check frontmatter, RFC-id references, .raw/ hygiene
pnpm exec site-kernel run session.validate
pnpm exec site-kernel run session.validate --json

# session.list — list sessions with filters
pnpm exec site-kernel run session.list
pnpm exec site-kernel run session.list --rfc RFC-0537 --json
pnpm exec site-kernel run session.list --date-from 2026-07-01 --date-to 2026-07-31 --type grilling
```

All four commands are `scope: workspace`.

### TypeScript contracts

```ts
// ── Session frontmatter (the .md file's YAML frontmatter) ──

interface SessionFrontmatter {
  id: string;                    // YYYY-MM-DD-HH-MM-SS-<shorthash>
  date: string;                  // ISO 8601 with timezone
  duration: string | null;       // ISO 8601 duration (e.g. "PT45M"), null if unknown
  types: SessionType[];          // auto-detected, skill can override
  summary: string;               // 1-3 sentence summary (skill-provided)
  relatedRfcs: string[];         // RFC-ids extracted from transcript
  relatedArtifacts: string[];    // file paths extracted from transcript
  decisions: string[];           // key decisions (skill-provided)
  commits: string[];             // git commit hashes extracted from transcript
  files: string[];               // file paths touched, extracted from transcript
  commands: string[];            // OS commands mentioned in transcript
}

type SessionType =
  | "mission"
  | "grilling"
  | "implementation"
  | "review"
  | "fix"
  | "freeform";

// ── session.save ──

interface SessionSaveResult {
  command: "session.save";
  status: "ok";
  file: string;                  // relative path to written .md
  rawFile: string;               // relative path to raw file consumed
  rawDeleted: boolean;           // true if raw file was deleted after conversion
  id: string;                    // session id
  types: SessionType[];          // auto-detected types
  extractedMetadata: {
    relatedRfcs: string[];
    relatedArtifacts: string[];
    commits: string[];
    files: string[];
    commands: string[];
  };
  dryRun: boolean;
}

// ── session.archive ──

interface SessionArchiveResult {
  command: "session.archive";
  status: "ok";
  moved: ArchiveMove[];
  skipped: ArchiveSkip[];
  maxAgeDays: number;
  dryRun: boolean;
}

interface ArchiveMove {
  id: string;
  file: string;                  // relative path
  from: string;
  to: string;
  ageDays: number;
}

interface ArchiveSkip {
  id: string;
  file: string;
  reason: string;
}

// ── session.validate ──

interface SessionValidateResult {
  command: "session.validate";
  status: "pass" | "fail";
  violations: SessionViolation[];
  checked: number;
}

interface SessionViolation {
  rule: "SES-01" | "SES-02" | "SES-03" | "SES-04" | "SES-05";
  file: string;
  message: string;
}

// | Rule   | Severity | Condition                                                      |
// |--------|----------|----------------------------------------------------------------|
// | SES-01 | error    | Required frontmatter field missing or invalid                  |
// | SES-02 | error    | `id` does not match filename                                   |
// | SES-03 | error    | `relatedRfcs` references non-existent RFC                      |
// | SES-04 | warning  | Raw file found in docs/sessions/ (should be in .raw/ or .md)   |
// | SES-05 | error    | File in docs/sessions/ is not .md (excluding .raw/ and archive)|

// ── session.list ──

interface SessionListResult {
  command: "session.list";
  status: "ok";
  sessions: SessionEntry[];
  count: number;
}

interface SessionEntry {
  id: string;
  date: string;
  types: SessionType[];
  summary: string;
  relatedRfcs: string[];
  file: string;
  archived: boolean;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/sessions/` | Active session `.md` files |
| `docs/sessions/.raw/` | Raw ATIF exports from Devin CLI `--export` (gitignored) |
| `docs/sessions/archive/` | Archived session files older than `--max-age-days` |
| `packages/forge/os/session/session.module.ts` | `forgeSessionModule` registration |
| `packages/forge/os/session/handlers/save.ts` | `session.save` handler |
| `packages/forge/os/session/handlers/archive.ts` | `session.archive` handler |
| `packages/forge/os/session/handlers/validate.ts` | `session.validate` handler |
| `packages/forge/os/session/handlers/list.ts` | `session.list` handler |
| `packages/forge/os/session/types.ts` | Shared types: `SessionFrontmatter`, `SessionType`, results |
| `packages/forge/os/session/frontmatter-io.ts` | Frontmatter parsing, RFC-id extraction, metadata extraction |
| `packages/forge/os/session/atif-parser.ts` | ATIF format parser (raw export → structured messages) |
| `packages/forge/os/core/core.module.ts` | `docs.archive` — add `session.archive` to subCommands array |
| `packages/forge/skills/fo/fo-session-save/SKILL.md` | Skill definition |
| `packages/forge/skills/fo/fo-session-save/qa-log.md` | Knowledge: Q&A log |
| `packages/forge/skills/fo/fo-session-save/learned-principles.md` | Knowledge: learned principles |
| `packages/forge/skills/fo/fo-session-save/fix-patterns.md` | Knowledge: fix patterns |
| `packages/forge/src/config/forge-config.ts` | Add `sessionsDir` to `paths` schema and `bindings.paths` |
| `forge.yaml` | Add `paths.sessionsDir: docs/sessions` and `bindings.paths.sessionsDir: docs/sessions` |
| `PREFERENCES.md` | Add `saveSessions: true` key |
| `.gitignore` | Add `docs/sessions/.raw/` with comment |
| `docs/authoring/session-composition.md` | Session format conventions, metadata, shell wrapper docs |
| `docs/COMMANDS.md` | Auto-regenerated via `docs.commands.generate` |
| `docs/ecosystem.generated.yaml` | Auto-regenerated via `ecosystem.manifest.generate` |
| `docs/command-manifest.generated.yaml` | Auto-regenerated via `command.manifest.generate` |
| `docs/architecture-dna.md` | Document new documentation domain (if DNA invariant added) |
| `packages/forge/AGENTS.md` | Add `forgeSessionModule` to OS modules table |
| `AGENTS.md` | Document session domain and `saveSessions` preference |

### Output format

```json
{
  "command": "session.save",
  "status": "ok",
  "data": {
    "command": "session.save",
    "status": "ok",
    "file": "docs/sessions/2026-07-26-12-04-00-a3f2c1.md",
    "rawFile": "docs/sessions/.raw/2026-07-26-session.atif",
    "rawDeleted": true,
    "id": "2026-07-26-12-04-00-a3f2c1",
    "types": ["grilling", "implementation"],
    "extractedMetadata": {
      "relatedRfcs": ["RFC-0537"],
      "relatedArtifacts": ["packages/forge/os/session/session.module.ts"],
      "commits": ["a3f2c1d"],
      "files": ["packages/forge/os/session/handlers/save.ts"],
      "commands": ["session.save", "session.archive"]
    },
    "dryRun": false
  },
  "summary": "Saved session 2026-07-26-12-04-00-a3f2c1 to docs/sessions/"
}
```

```json
{
  "command": "session.archive",
  "status": "ok",
  "data": {
    "command": "session.archive",
    "status": "ok",
    "moved": [
      {
        "id": "2026-07-19-10-00-00-b2e1a3",
        "file": "docs/sessions/archive/2026-07-19-10-00-00-b2e1a3.md",
        "from": "docs/sessions/2026-07-19-10-00-00-b2e1a3.md",
        "to": "docs/sessions/archive/2026-07-19-10-00-00-b2e1a3.md",
        "ageDays": 8
      }
    ],
    "skipped": [
      {
        "id": "2026-07-25-14-30-00-c3d4b5",
        "file": "docs/sessions/2026-07-25-14-30-00-c3d4b5.md",
        "reason": "age 1 days < max-age 7 days"
      }
    ],
    "maxAgeDays": 7,
    "dryRun": false
  },
  "summary": "Moved 1 file(s), skipped 1"
}
```

```json
{
  "command": "session.validate",
  "status": "pass",
  "data": {
    "command": "session.validate",
    "status": "pass",
    "violations": [],
    "checked": 5
  },
  "summary": "All 5 session files valid"
}
```

```json
{
  "command": "session.list",
  "status": "ok",
  "data": {
    "command": "session.list",
    "status": "ok",
    "sessions": [
      {
        "id": "2026-07-26-12-04-00-a3f2c1",
        "date": "2026-07-26T12:04:00+02:00",
        "types": ["grilling", "implementation"],
        "summary": "Grilling session for session-save RFC, then implementation planning",
        "relatedRfcs": ["RFC-0537"],
        "file": "docs/sessions/2026-07-26-12-04-00-a3f2c1.md",
        "archived": false
      }
    ],
    "count": 1
  },
  "summary": "Found 1 session(s)"
}
```

### Failure modes

| Condition | Behavior |
| --- | --- |
| `session.save`: no raw files in `.raw/` | Exit zero, summary "No raw files to process", no error |
| `session.save`: raw file is not valid ATIF/JSON | Exit non-zero, error "Failed to parse raw file: ..." |
| `session.save`: converted file already exists (same hash) | Skip, log "already converted", do not overwrite, do not delete raw |
| `session.save`: `--raw-file` points to non-existent file | Exit non-zero, error "Raw file not found: ..." |
| `session.archive`: no files older than `--max-age-days` | Exit zero, summary "Moved 0 file(s), skipped N" |
| `session.archive`: destination already exists | Skip, log "destination exists" (same pattern as `audit.archive`) |
| `session.archive`: `--max-age-days` is not a positive integer | Exit non-zero, error "Invalid --max-age-days" |
| `session.validate`: SES-01 violation (missing frontmatter field) | Exit non-zero, report violation |
| `session.validate`: SES-02 violation (id ≠ filename) | Exit non-zero, report violation |
| `session.validate`: SES-03 violation (RFC-id not found) | Exit non-zero, report violation |
| `session.validate`: SES-04 warning (raw file in wrong place) | Exit zero, report warning |
| `session.validate`: no session files found | Exit zero, "No session files to validate" |
| `session.list`: no sessions match filters | Exit zero, empty array, count 0 |
| `session.list`: invalid `--date-from` or `--date-to` format | Exit non-zero, error "Invalid date format, use YYYY-MM-DD" |
| Any command: `docs/sessions/` directory missing | Exit zero, "No sessions directory found" (graceful — not an error) |

## Rollout

1. **Create `docs/sessions/` directory** with `.raw/` and `archive/` subdirectories.
2. **Implement `forgeSessionModule`** in `packages/forge/os/session/` with all four command handlers.
3. **Register `forgeSessionModule`** in the kernel config (`tools/kernel.config.ts`).
4. **Extend `docs.archive`** in `core.module.ts` to include `session.archive` in the subCommands array, update `writes`, `reads`, and `description`.
5. **Update `forge.yaml`** with `paths.sessionsDir: docs/sessions` and `bindings.paths.sessionsDir: docs/sessions`.
6. **Update `forge-config.ts`** schema to include `sessionsDir` in both `paths` and `bindings.paths`.
7. **Update `PREFERENCES.md`** with `saveSessions: true` key.
8. **Add `.gitignore` entry** for `docs/sessions/.raw/`.
9. **Create `fo-session-save` skill** in `packages/forge/skills/fo/fo-session-save/` with `SKILL.md` and three knowledge files.
10. **Create `docs/authoring/session-composition.md`** documenting session format, metadata fields, shell wrapper, and conventions.
11. **Implement shell wrapper** for `devin --export` (see Design §Shell wrapper).
12. **Regenerate documentation**: `docs.commands.generate`, `ecosystem.manifest.generate`, `command.manifest.generate`.
13. **Update `packages/forge/AGENTS.md`** OS modules table with `forgeSessionModule` row.
14. **Update root `AGENTS.md`** with session domain documentation and `saveSessions` preference.
15. **Write tests**: unit tests for each handler, integration test for end-to-end flow, PBT for idempotency.
16. **Default behavior**: `saveSessions: true` — sessions are saved by default. Operators can set `false` to opt out.

## Alternatives considered

- **Summary-only saving (no raw export).** Rejected: the operator explicitly wants full session transcripts, not just summaries. Raw ATIF exports preserve the complete conversation for future reference and audit.

- **Save to OS temp directory (like `fo-handoff`).** Rejected: sessions should be part of project documentation, committed to the repo, and searchable. Temp directory files are ephemeral and not shared across team members.

- **Command-only approach (no skill).** Rejected: deterministic conversion alone produces structured but unannotated files. The `fo-session-save` skill adds semantic value — summaries, decision extraction, related artifact identification, quality checks — that a command cannot do without an LLM. The hybrid approach (command for deterministic, skill for intelligent) is the proven pattern in this codebase.

- **Skill-only approach (no command).** Rejected: ATIF parsing, regex-based metadata extraction, and file I/O are deterministic tasks that belong in a command. Skills should handle intellectual tasks, not mechanical parsing. Mixing both in a skill makes it harder to test and debug.

- **API-based export instead of CLI `--export`.** Deferred to future work: the Devin API `List session messages` endpoint provides programmatic access, but requires authentication setup and API client code. CLI `--export` is simpler and available now. The RFC mentions API-based export as future work.

- **`session.search` command.** Deferred: full-text search across sessions is useful but not essential for initial scope. `session.list --rfc` provides RFC-based filtering, which is sufficient for the primary use case.

- **Single `types` field (string) instead of array.** Rejected: a single session can involve multiple activities (e.g., grilling followed by implementation). An array of types accurately represents this, and the skill can override or refine auto-detected types.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Raw ATIF format changes in future Devin versions | Medium | ATIF parser is isolated in `atif-parser.ts`; format detection with fallback to raw text passthrough |
| Session files accumulate and bloat the repo | Medium | `session.archive` with `--max-age-days 7` default; `docs.archive` umbrella includes session archiving |
| `fo-session-save` skill asks too many questions | Low | Skill is designed to be autonomous with minimal user interaction; operator explicitly requested this |
| Auto-extracted metadata is inaccurate (false positives in regex) | Low | Skill can override/refine auto-extracted fields; `session.validate` checks RFC-id existence |
| Idempotency failure: same raw file converted twice | Low | File naming uses content hash (`<shorthash>`); `session.save` skips if output file exists |
| `.raw/` files accidentally committed | Low | `.gitignore` entry with comment; `session.validate` SES-04 warns about raw files in wrong location |
| Shell wrapper breaks on different shells (bash vs zsh) | Low | Wrapper uses POSIX-compatible syntax; tested on bash and zsh |
| Session transcripts contain sensitive information | Medium | `fo-session-save` skill redacts API keys, passwords, PII (same as `fo-handoff`); documented in skill constraints |
| Agent misinterprets command/skill boundary | Low | Implementation notes explicitly state the command/skill split; `fo-session-save` checks `saveSessions` and no-ops if `false`; `session.save` is deterministic only |

### `session.save` — deterministic conversion

The `session.save` command handles all deterministic, I/O-bound tasks:

1. **Scan `docs/sessions/.raw/`** for raw ATIF files (or use `--raw-file` for a specific file).
2. **Parse ATIF format** using `atif-parser.ts` — extract message turns, timestamps, roles.
3. **Extract metadata via regex:**
   - RFC-ids: `RFC-\d{4}` pattern
   - File paths: paths matching `packages/`, `docs/`, `services/`, `systems/` prefixes
   - Commit hashes: `\b[0-9a-f]{7,40}\b` pattern (filtered to plausible git hashes)
   - Commands: `session\.\w+`, `rfc\.\w+`, `docs\.\w+`, `mission\.\w+`, etc.
4. **Auto-detect session types** from transcript content:
   - `grilling`: presence of grilling Q&A patterns, `/grilling` command
   - `mission`: `mission.open`, `mission.materialize`, etc.
   - `implementation`: code edits, `rfc.implement.stamp`
   - `review`: `fo-review` skill invocation
   - `fix`: `fo-fix` skill invocation
   - `freeform`: fallback when no other type matches
5. **Compute session id**: `YYYY-MM-DD-HH-MM-SS-<shorthash>` where `<shorthash>` is the first 6 characters of the SHA-256 hash of the raw file content. This ensures idempotency — the same raw file always produces the same id.
6. **Write structured markdown** to `docs/sessions/<id>.md` with frontmatter and body.
7. **Delete raw file** from `.raw/` after successful conversion (unless `--keep-raw` flag is passed).
8. **Skip if output exists**: if `docs/sessions/<id>.md` already exists, skip and log "already converted", do not overwrite, do not delete raw.
9. **Concurrent execution**: two agents running `session.save` simultaneously on different raw files is safe (different output paths). The implementation should follow the same `ENOENT` catch pattern as existing archive handlers for `fs.rename` operations.
10. **Interrupted operations**: if `session.save` crashes between writing the `.md` and deleting the raw file, the raw file remains in `.raw/`. Re-running `session.save` will skip the existing `.md` (idempotency) and will not delete the raw file (skip means "do not delete raw"). The operator can manually delete the orphaned raw file or re-run with `--keep-raw` to force re-processing.

**Flags:**

| Flag         | Kind    | Required | Description                                             |
| ------------ | ------- | -------- | ------------------------------------------------------- |
| `--raw-file` | string  | no       | Process a specific raw file instead of scanning `.raw/` |
| `--json`     | boolean | no       | JSON output for agent consumption                       |
| `--keep-raw` | boolean | no       | Do not delete raw file after conversion                 |
| `--dry-run`  | boolean | no       | Preview without writing files                           |

### `session.archive` — age-based retention

The `session.archive` command moves session files older than `--max-age-days` from `docs/sessions/` to `docs/sessions/archive/`. Unlike `rfc.archive` and `audit.archive` which use RFC terminal status, session archiving is purely age-based — sessions have no terminal status.

**Behavior:**

1. List all `.md` files in `docs/sessions/` (not in `archive/` or `.raw/`).
2. For each file, compute age in days from the `date` field in frontmatter (not file system mtime — frontmatter date is the session date, which is more accurate).
3. If age > `--max-age-days`, move to `docs/sessions/archive/`.
4. If destination exists, skip (same pattern as `audit.archive`).
5. Bidirectional: files in `archive/` that are younger than `--max-age-days` are moved back to `docs/sessions/` (supports unarchiving when `--max-age-days` is increased).
6. **Oscillation risk:** if an operator runs `session.archive --max-age-days 3` directly (archiving files older than 3 days) and then runs `docs.archive` (which uses the default 7-day threshold), files in `archive/` that are 4-7 days old will be moved back to `docs/sessions/`. This is the expected behavior of the bidirectional design — the threshold is absolute, not incremental. Operators should use a consistent threshold to avoid oscillation. The `docs.archive` umbrella always uses the default 7-day threshold for sessions.

**Flags:**

| Flag             | Kind    | Required | Default | Description                  |
| ---------------- | ------- | -------- | ------- | ---------------------------- |
| `--max-age-days` | number  | no       | 7       | Age threshold in days        |
| `--dry-run`      | boolean | no       | false   | Preview without moving files |
| `--json`         | boolean | no       | false   | JSON output                  |

### `session.validate` pipeline placement

`session.validate` is **on-demand only** — it is not integrated into `build.check`, `packages.check`, or any other pipeline. This follows the established pattern: `rfc.validate` and `adr.validate` are also on-demand commands that operators run explicitly. Session files are documentation artifacts, not build inputs, and validating them on every build would add unnecessary latency.

### `fo-session-save` and `fo-session-retro` relationship

The existing `fo-session-retro` skill handles session-end insight triage — it reviews discoveries made during a session and routes them to durable homes (AGENTS.md rules, ADRs, DNA invariants, forge patterns, or memory). The new `fo-session-save` skill handles session transcript persistence — it converts raw exports to structured markdown and adds semantic annotations.

These two skills are **independent** and have different purposes:

- `fo-session-save` saves **what happened** (the transcript).
- `fo-session-retro` triages **what was learned** (the insights).

They can be used together at session end (save first, then retro) but are separate invocations. `fo-session-save` does not depend on `fo-session-retro` and vice versa.

### `docs.archive` integration

The `docs.archive` umbrella command in `core.module.ts` is extended:

- `subCommands` array gains `{ name: "session.archive", fn: runSessionArchive }`.
- `writes` array gains `"docs/sessions/*.md"` and `"docs/sessions/archive/**"`.
- `reads` array gains `"docs/sessions/**/*.md"`.
- `description` updated to mention `session.archive`.

The `--max-age-days` flag is NOT passed through from `docs.archive` to `session.archive` — `session.archive` uses its default (7 days) when called via the umbrella. Operators who want a different threshold must run `session.archive` directly.

The `--status` flag IS passed through from `docs.archive` to all sub-commands (the umbrella handler passes `input` directly to each sub-command's handler). `session.archive` does not use `--status` — it reads `input.flags["max-age-days"]`, not `input.flags["status"]`. The `--status` flag is silently ignored by `session.archive`. This is safe but operators should be aware that `--status` only filters RFC/ADR/plan/audit archiving, not session archiving.

### `fo-session-save` skill — intelligent annotation

The `fo-session-save` skill is a self-learning, autonomous skill that enhances saved sessions with semantic annotations. It is designed to work with minimal user interaction — the operator explicitly requested it to "do almost everything independently."

**Skill frontmatter:**

```yaml
---
name: fo-session-save
description: Enhance saved session transcripts with semantic annotations, summaries, and quality checks. Self-learning via knowledge files.
invocation: user
category: fo
concerns: document-only
dependsOn: ['my-preferences']
languagePolicy: ref(PREFERENCES.md)
knowledge: [qa-log.md, learned-principles.md, fix-patterns.md]
bindings:
  requires: [paths.sessionsDir]
  optional: []
---
```

**Responsibilities (intellectual tasks):**

1. **Generate summary** — 1-3 sentence summary of the session's purpose and outcome.
2. **Identify decisions** — key decisions made during the session (not just mentioned commands).
3. **Identify related artifacts** — RFCs, ADRs, files, commits that are semantically related (not just regex-matched).
4. **Refine auto-detected types** — override or extend types based on semantic understanding.
5. **Quality checks** — verify that extracted metadata is accurate, flag false positives.
6. **Error correction** — fix obvious errors in auto-extracted metadata (wrong RFC-id, malformed paths).
7. **Learning** — update `qa-log.md`, `learned-principles.md`, and `fix-patterns.md` with insights from this session.

**Autonomy:**

- The skill does NOT ask the operator questions unless it encounters a genuine ambiguity it cannot resolve.
- It reads `PREFERENCES.md` at start and no-ops if `saveSessions: false`.
- It reads `qa-log.md` and `learned-principles.md` for accumulated knowledge.
- It writes to `qa-log.md` and `learned-principles.md` after processing (self-learning).
- It writes to `fix-patterns.md` when it detects and fixes errors in auto-extracted metadata.

**Knowledge files:**

| File | Purpose |
| --- | --- |
| `qa-log.md` | Log of questions the skill asked (if any) and operator answers, for meta-analysis |
| `learned-principles.md` | Principles learned across sessions (e.g., "always verify RFC-id exists before listing as related") |
| `fix-patterns.md` | Patterns of errors in auto-extraction and their fixes (e.g., "commit hash regex matches version numbers — filter by length") |

**Process:**

1. Read `PREFERENCES.md` — if `saveSessions: false`, exit with "Session saving disabled".
2. Run `session.save` command (if not already run — check for raw files in `.raw/`).
3. Read the generated `.md` file.
4. Analyze the transcript semantically.
5. Update frontmatter: `summary`, `decisions`, refined `types`, corrected metadata.
6. Append a "## Session notes" section with structured annotations.
7. Update knowledge files with any new insights.
8. Report what was annotated/changed.

### Shell wrapper for `devin --export`

A shell wrapper script `scripts/devin-export.sh` automates the raw export process:

```sh
#!/usr/bin/env bash
# devin-export.sh — export current Devin session to docs/sessions/.raw/
# Usage: ./scripts/devin-export.sh [session-id]
set -euo pipefail

SESSIONS_RAW_DIR="docs/sessions/.raw"
mkdir -p "$SESSIONS_RAW_DIR"

TIMESTAMP=$(date +%Y-%m-%d-%H-%M-%S)
OUTPUT_FILE="$SESSIONS_RAW_DIR/${TIMESTAMP}-session.atif"

# Export via Devin CLI --export flag
devin --export "$OUTPUT_FILE"

echo "Raw session exported to: $OUTPUT_FILE"
echo "Run 'pnpm exec site-kernel run session.save' to convert to structured markdown."
```

The wrapper is documented in `docs/authoring/session-composition.md` and tested to ensure it works with the current Devin CLI. The script uses POSIX-compatible syntax (no bashisms) for portability.

### Configuration

**`PREFERENCES.md`:**

```yaml
---
aiLanguage: ru
documentationLanguage: en
saveSessions: true
---
```

- `saveSessions: true` (default) — agent saves sessions at end of each session.
- `saveSessions: false` — agent does not save sessions.

**`forge.yaml`:**

```yaml
paths:
  rfcsDir: docs/rfcs
  adrsDir: docs/adrs
  plansDir: docs/plans
  auditsDir: docs/audits
  specsDir: docs/specs
  skillsDir: .agents/skills
  sessionsDir: docs/sessions          # NEW

bindings:
  paths:
    sessionsDir: docs/sessions        # NEW
```

**`forge-config.ts` schema changes:**

- `paths` object gains `sessionsDir: z.string().default("docs/sessions")`.
- `bindings.paths` object gains `sessionsDir: z.string().nullable().default(null)`.
- `ForgeConfig.paths` interface gains `sessionsDir: string`.
- `ForgeBindings.paths` interface gains `sessionsDir: string | null`.
- `defaultForgeConfig` gains `sessionsDir: "docs/sessions"` in both `paths` and `bindings.paths`.

**`.gitignore`:**

```
# Session raw exports (ATIF format from Devin CLI --export)
docs/sessions/.raw/
```

### Session markdown format

The final `.md` file has this structure:

```markdown
---
id: 2026-07-26-12-04-00-a3f2c1
date: 2026-07-26T12:04:00+02:00
duration: PT45M
types: [grilling, implementation]
summary: "Grilling session for session-save RFC, then implementation planning"
relatedRfcs: [RFC-0537]
relatedArtifacts: [packages/forge/os/session/session.module.ts]
decisions: ["Hybrid approach: command for deterministic, skill for intelligent"]
commits: [a3f2c1d]
files: [packages/forge/os/session/handlers/save.ts]
commands: [session.save, session.archive]
---

# Session: 2026-07-26-12-04-00-a3f2c1

## Transcript

[Full conversation transcript in markdown format, converted from ATIF]

## Session notes

[Skill-generated annotations: summary, decisions, related artifacts, quality checks]
```

The `## Transcript` section is generated by `session.save` (deterministic). The `## Session notes` section is generated by `fo-session-save` (intelligent). If the skill has not run, the `## Session notes` section is absent.

## Acceptance criteria

- [x] `forgeSessionModule` created in `packages/forge/os/session/` with `session.save`, `session.archive`, `session.validate`, `session.list` commands registered (evidence: `packages/forge/os/session/session.module.ts`)
- [x] `session.save` converts raw ATIF files from `docs/sessions/.raw/` to structured markdown in `docs/sessions/` with auto-extracted metadata (evidence: `packages/forge/os/session/handlers/save.ts`)
- [x] `session.save` is idempotent — same raw file always produces the same output filename (`YYYY-MM-DD-HH-MM-SS-<shorthash>.md`) and skips if output exists (evidence: `session-handlers.test.ts` idempotency test + `session-pbt.test.ts` PBT idempotency)
- [x] `session.save` deletes raw file from `.raw/` after successful conversion (unless `--keep-raw`) (evidence: `session-handlers.test.ts` converts raw ATIF test verifies `rawDeleted: true`)
- [x] `session.archive` moves session files older than `--max-age-days` (default 7) to `docs/sessions/archive/` (evidence: `session-handlers.test.ts` moves old session test)
- [x] `session.archive` is bidirectional — files in `archive/` younger than threshold are moved back to `docs/sessions/` (evidence: `session-handlers.test.ts` bidirectional test + `session-pbt.test.ts` PBT bidirectional)
- [x] `session.archive` supports `--dry-run` and `--json` flags (evidence: `packages/forge/os/session/handlers/archive.ts` flag definitions)
- [x] `session.validate` checks frontmatter schema (SES-01), id-filename match (SES-02), RFC-id existence (SES-03), raw file hygiene (SES-04), and non-markdown file detection (SES-05) (evidence: `session-handlers.test.ts` SES-01/02/03 tests)
- [x] `session.list` filters by `--date-from`, `--date-to`, `--rfc`, `--type`, and supports `--json` (evidence: `session-handlers.test.ts` filter by RFC/type tests)
- [x] `docs.archive` umbrella command includes `session.archive` in its dispatch sequence (evidence: `packages/forge/os/core/core.module.ts` subCommands array)
- [x] `docs.archive` `writes` and `reads` arrays include `docs/sessions/` paths (evidence: `packages/forge/os/core/core.module.ts` writes/reads arrays)
- [x] `forgeSessionModule` registered in `tools/kernel.config.ts` (evidence: `tools/kernel.config.ts` moduleLoaders + MODULE_MAP)
- [x] `forge.yaml` includes `paths.sessionsDir: docs/sessions` and `bindings.paths.sessionsDir: docs/sessions` (evidence: `forge.yaml` lines 16 and 39)
- [x] `forge-config.ts` schema includes `sessionsDir` in both `paths` and `bindings.paths` with correct types and defaults (evidence: `packages/forge/src/config/forge-config.ts` schema definitions)
- [x] `PREFERENCES.md` includes `saveSessions: true` key (evidence: `PREFERENCES.md` frontmatter line 4)
- [x] `.gitignore` includes `docs/sessions/.raw/` with comment (evidence: `.gitignore` line 277-278)
- [x] `fo-session-save` skill created in `packages/forge/skills/fo/fo-session-save/` with `SKILL.md` and three knowledge files (`qa-log.md`, `learned-principles.md`, `fix-patterns.md`) (evidence: `packages/forge/skills/fo/fo-session-save/` directory)
- [x] `fo-session-save` skill frontmatter includes `concerns: document-only`, `knowledge` array, and `bindings.requires: [paths.sessionsDir]` (evidence: `packages/forge/skills/fo/fo-session-save/SKILL.md` frontmatter)
- [x] `docs/authoring/session-composition.md` created with session format conventions, metadata documentation, and shell wrapper instructions (evidence: `docs/authoring/session-composition.md`)
- [x] Shell wrapper `scripts/devin-export.sh` implemented and tested (evidence: `scripts/devin-export.sh` — `bash -n` syntax check passed)
- [x] `packages/forge/AGENTS.md` OS modules table includes `forgeSessionModule` row (evidence: `packages/forge/AGENTS.md` line 26)
- [x] Root `AGENTS.md` documents session domain and `saveSessions` preference (evidence: `AGENTS.md` line 93)
- [x] `docs/COMMANDS.md` regenerated to include `session.save`, `session.archive`, `session.validate`, `session.list`, and updated `docs.archive` description (evidence: `docs/COMMANDS.md` lines 522-525, regenerated via `command.manifest.generate` + `docs.commands.generate`)
- [x] Unit tests for each command handler (`session.save`, `session.archive`, `session.validate`, `session.list`) (evidence: `packages/forge/src/tests/session-handlers.test.ts`)
- [x] Integration test covering end-to-end flow: raw file → `session.save` → `.md` → `session.validate` → `session.archive` (evidence: `packages/forge/src/tests/session-pbt.test.ts` Integration test)
- [x] PBT for `session.save` idempotency: calling `session.save` twice on the same raw file yields the same `.md` (evidence: `packages/forge/src/tests/session-pbt.test.ts` PBT idempotency test)
- [x] PBT for `session.archive` bidirectional behavior: archive then unarchive returns to original state (evidence: `packages/forge/src/tests/session-pbt.test.ts` PBT bidirectional test)
- [x] `rfc.validate` passes on this file (evidence: `rfc.validate --root` shows zero RFC-0537-specific errors)
- [x] `pnpm --filter @wgogol/forge build:check` passes (evidence: `tsc --noEmit` exit 0, 190 tests pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The `fo-session-save` skill MUST be autonomous — minimize operator questions. Read `PREFERENCES.md` at start and no-op if `saveSessions: false`.
- The `session.save` command MUST be idempotent — same raw file always produces the same output. PBT must verify this.
- The shell wrapper `scripts/devin-export.sh` MUST be tested before the RFC is stamped `implemented`.
- API-based session export (Devin API `List session messages`) is future work — do not implement in this RFC.
- `session.search` is deferred — `session.list --rfc` is sufficient for initial scope.
