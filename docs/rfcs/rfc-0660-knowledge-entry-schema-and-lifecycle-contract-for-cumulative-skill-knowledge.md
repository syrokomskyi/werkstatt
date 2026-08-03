---
id: RFC-0660
title: "Knowledge entry schema and lifecycle contract for cumulative skill knowledge"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: contract
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
createdAt: 2026-08-03
updatedAt: 2026-08-03
enhancedAt: 2026-08-03
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0524
  - RFC-0661
  - RFC-0662
  - RFC-0663
  - RFC-0664
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-54
  - DNA-60
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - forge.skill.validate
    - forge.doctor
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - "`forge.skill.validate` reports SKILL-19/SKILL-20 violations for malformed knowledge entries and passes on all migrated forge skills"
  - "All knowledge files under packages/forge/skills/ parse into structured entries via parseKnowledgeFile with zero legacy sections"
  - "The knowledge-entry fenced block format round-trips: parse → serialize → parse produces identical metadata"
nonGoals:
  - No external memory providers, vector databases, graph databases, or SQLite — knowledge stays in plain markdown files in git
  - No automatic semantic deduplication — duplicate detection across skills is RFC-0663 scope and uses deterministic title normalization only
  - No background or scheduled compaction — lifecycle mutations run only via explicit operator-invoked commands (RFC-0662)
  - No changes to the AGENTS.md / ADR / DNA routing targets of fo-session-retro — only the knowledge file entry format is in scope
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0660: Knowledge entry schema and lifecycle contract for cumulative skill knowledge

## Context

RFC-0524 established the cumulative knowledge system for forge skills: a three-layer reference pattern (L0 `qa-log.md`, L1 `fix-patterns.md`, L2 `learned-principles.md`), a `knowledge:` frontmatter declaration, SKILL-13 existence validation, one-way sync to `.agents/skills/`, and empty-template shipping to npm. The pattern is adopted by `grilling`, `fo-session-save`, `fo-memory-sync`, and `windows-ai-tooling`, and is documented in `writing-great-skills` § Cumulative knowledge pattern.

What RFC-0524 deliberately did **not** define is the structure of an individual knowledge entry. Entries today are freeform markdown: numbered paragraphs (`fo-session-save/learned-principles.md`), bullet lists (`grilling/qa-log.md` behind an HTML comment describing an informal format), or skill-specific prose. The only machine-facing convention is the L2 `confirmations: N` counter, which exists as prose text, not as parseable data.

Forge projects are designed to live for years, and forge targets any project type — not only software — with a zero-external-services installation constraint. External agent systems that chose the same file-first philosophy (OpenClaw's `MEMORY.md` + daily logs, Hermes' hard-capped `MEMORY.md`) all discovered the same lesson within months: **unstructured knowledge files do not survive long horizons**. They grow unboundedly, stale entries are indistinguishable from live ones, and nothing can be validated, expired, deduplicated, compacted, or promoted without re-reading prose with an LLM every time.

This RFC is the foundation of a five-RFC series (RFC-0660..0664) that gives cumulative skill knowledge a full lifecycle: schema (this RFC) → layer budgets (RFC-0661) → compaction and distillation (RFC-0662) → cross-skill promotion (RFC-0663) → project-level memory (RFC-0664).

## Problem

1. **Entries are not machine-readable.** A deterministic command cannot answer "which L2 principles have `confirmations >= 3`?", "which entries are older than 90 days?", or "is this principle duplicated in another skill?" without invoking an LLM. Every lifecycle operation the series needs (budgeting, compaction, promotion) is blocked on this.
2. **No entry identity.** Entries have no stable `id`. One entry cannot supersede another, a shared-layer promotion cannot leave a pointer behind, and an agent cannot cite an entry unambiguously.
3. **No temporal metadata.** There is no `created` / `lastConfirmedAt`, so staleness cannot be computed. The only expiry rule in the ecosystem (operator-profile 90-day expiry, an `fo-session-retro` convention) is hand-applied prose.
4. **No validation surface.** SKILL-13 checks only that declared knowledge files exist. Malformed, contradictory, or duplicated entries pass silently.
5. **No supersession.** When a principle is refined, the old text is edited in place or both versions coexist. There is no `supersedes` link, so history and intent are lost.

## Decision

All cumulative skill knowledge files (L0 `qa-log.md`, L1 `fix-patterns.md`, L2 `learned-principles.md`, and any future knowledge files declared via the `knowledge:` frontmatter field) adopt a **structured entry format**: each entry is a markdown section that starts with a normalized `###` heading carrying a stable identifier, followed immediately by a fenced `knowledge-entry` YAML metadata block, followed by a freeform markdown body. `forge.skill.validate` gains two rules — SKILL-19 (entry schema validity) and SKILL-20 (entry identifier uniqueness) — and forge gains a shared parser module (`parseKnowledgeFile`) that every lifecycle command in the series (RFC-0661 budgets, RFC-0662 compaction, RFC-0663 promotion) builds on. Existing freeform entries are grandfathered as _legacy sections_: they parse losslessly, produce warnings (not errors) during the migration window, and are migrated by the RFC-0662 compaction command with operator approval.

## Architectural fit

- **DNA-54 (Forge bindings contract):** this RFC extends the same validation surface (`forge.skill.validate`) and the same portability constraint — the entry schema is domain-neutral (no software-specific fields), so knowledge files remain portable to any project type. Budget overrides land in `forge.yaml` bindings (RFC-0661), following the bindings pattern rather than hardcoded literals.
- **RFC-0524 (Cumulative knowledge system):** extends, does not replace. The three-layer pattern, the `knowledge:` frontmatter field, SKILL-13, the source-of-truth mutation contract, and npm empty-template shipping are unchanged. This RFC adds the missing per-entry contract underneath them.
- **Forward-only:** the structured format becomes the single entry format. Legacy freeform entries are migrated; no parallel format persists after the migration window.
- **Site OS operator model:** no new commands. `forge.skill.validate` gains SKILL-19/SKILL-20; `forge.doctor` surfaces legacy-section counts; knowledge file templates shipped in `packages/forge/skills/` are structured-empty (preamble + zero entries) and `forge.create` copies them as-is during project initialization. Lifecycle mutations stay in RFC-0662's explicit command — nothing here runs automatically in pipelines.
- **DNA-60 (proposed, established by this series):** "Cumulative skill knowledge has a schema-backed lifecycle — structured entries, budgeted layers, explicit compaction, and audited promotion." This RFC establishes the schema half; RFC-0661 and RFC-0662 establish the lifecycle half. The implementing change adds DNA-60 to `docs/architecture-dna.md` and links RFC-0660..0662.

## Design

### Entry format

A knowledge file is a markdown document with an optional freeform preamble (title, purpose paragraph, format comments), followed by entries. An **entry** is:

1. A level-3 heading: `### <entry-id>: <title>` where `<entry-id>` matches `^K-\d{4}$` and is unique within the file.
2. Immediately after the heading, a fenced code block tagged `knowledge-entry` containing the YAML metadata.
3. A freeform markdown body until the next `### ` heading or end of file.

Example (`learned-principles.md`, L2):

````markdown
### K-0007: Verify RFC-id exists before listing as related

```knowledge-entry
id: K-0007
layer: L2
created: 2026-07-20
lastConfirmedAt: 2026-08-01
confirmations: 4
expiresAt: null
supersedes: []
promotedTo: null
status: active
```

The auto-extraction command pulls RFC-ids via regex (`RFC-\d{4}`), which matches references in
comments, URLs, and quoted text. Before confirming a `relatedRfcs` entry, check that the RFC
file exists in the RFCs directory.
````

Example (`qa-log.md`, L0 — minimal metadata):

````markdown
### K-0042: Entry format for knowledge records

```knowledge-entry
id: K-0042
layer: L0
created: 2026-08-03
status: active
```

- **Question:** Entry format for L0/L1/L2 knowledge records?
- **Answer:** Markdown files with per-entry YAML metadata blocks.
````

### Metadata schema

| Field | Type | Required | Layers | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `^K-\d{4}$` | yes | all | Stable identifier, unique within the file. Allocated by the writer as `max(existing ids) + 1`. |
| `layer` | `L0 \| L1 \| L2` | yes | all | Must match the file's declared layer (see file-layer mapping below). |
| `created` | `YYYY-MM-DD` | yes | all | Creation date. |
| `lastConfirmedAt` | `YYYY-MM-DD \| null` | L2 only | L2 | Last date the operator confirmed this principle. Drives staleness (RFC-0662). |
| `confirmations` | integer `>= 0` | L2 only | L2 | Confidence counter per RFC-0524. Autonomy threshold stays 3. Rejection resets to 0. |
| `expiresAt` | `YYYY-MM-DD \| null` | no | all | Hard expiry; the RFC-0662 compact command archives expired entries regardless of other state. |
| `supersedes` | `K-\d{4}` list | no | L1, L2 | Entries this entry replaces. Superseded entries get `status: superseded` and are archived by compaction. |
| `promotedTo` | `shared/K-\d{4} \| null` | no | L2 | Set by RFC-0663 promotion: the entry moved to the shared layer; the local entry becomes a pointer. |
| `status` | `active \| stale \| superseded \| archived` | yes | all | `stale` is computed/set by compaction (RFC-0662); writers create entries as `active` only. |

Layer-specific rules:

- **L0** (`qa-log.md`): only `id`, `layer`, `created`, `status` are required. `confirmations` and `lastConfirmedAt` are forbidden (Q&A pairs are raw material, not principles).
- **L1** (`fix-patterns.md`): `id`, `layer`, `created`, `status` required; `supersedes` allowed; `confirmations` forbidden (L1 is trusted by design per RFC-0524 — no counter).
- **L2** (`learned-principles.md`): all fields allowed; `confirmations` and `lastConfirmedAt` required.

File-layer mapping is conventional: file named `qa-log.md` → L0, `fix-patterns.md` → L1, `learned-principles.md` → L2. Skills declaring custom knowledge file names record the layer in the file preamble comment (`<!-- knowledge-layer: L1 -->`); the parser falls back to the file name mapping.

**Knowledge-adjacent files:** files declared in `knowledge:` that contain no `### K-NNNN` headings and no `<!-- knowledge-layer: -->` preamble are _knowledge-adjacent files_ (templates, reference docs) — they are synced by `forge.create` and checked for existence by SKILL-13, but are exempt from SKILL-19/SKILL-20. This covers cases like `forge-bootstrap`'s `forge-about.md` and `operator-profile-template.md`, which are static templates rather than cumulative knowledge entries.

### Legacy sections

Any markdown content after the preamble that does not match the entry grammar is a **legacy section**. The parser returns legacy sections as opaque text ranges so the RFC-0662 compact command can present them for operator-approved migration. Legacy sections never fail parsing; they produce SKILL-19 warnings with `severity: warning` during the migration window.

### TypeScript contracts

New module `packages/forge/src/knowledge/` (portable, no kernel imports — same tier as `src/registry.ts`):

```ts
type KnowledgeLayer = "L0" | "L1" | "L2";
type KnowledgeEntryStatus = "active" | "stale" | "superseded" | "archived";

interface KnowledgeEntryMeta {
  id: string;                    // ^K-\d{4}$
  layer: KnowledgeLayer;
  created: string;               // YYYY-MM-DD
  lastConfirmedAt?: string | null;
  confirmations?: number;
  expiresAt?: string | null;
  supersedes?: string[];
  promotedTo?: string | null;    // "shared/K-0007"
  status: KnowledgeEntryStatus;
}

interface KnowledgeEntry {
  meta: KnowledgeEntryMeta;
  title: string;                 // from the ### heading
  body: string;                  // freeform markdown after the metadata block
  lineStart: number;             // 1-based, for diagnostics
}

interface LegacySection {
  text: string;
  lineStart: number;
}

interface ParsedKnowledgeFile {
  path: string;
  layer: KnowledgeLayer;
  preamble: string;
  entries: KnowledgeEntry[];
  legacySections: LegacySection[];
}

// Tolerant: never throws on malformed files. Malformed entries surface as
// parseIssues so validators can report them with file:line precision.
function parseKnowledgeFile(path: string): ParsedKnowledgeFile & { parseIssues: ParseIssue[] };

// Round-trip serializer used by RFC-0662 compaction and RFC-0663 promotion.
function serializeKnowledgeFile(parsed: ParsedKnowledgeFile): string;

// Zod schema for the metadata block; layer-specific refinements encode the
// required/forbidden field matrix above.
const knowledgeEntryMetaSchema: z.ZodType<KnowledgeEntryMeta>;
```

### Validation rules

New rules in `packages/forge/src/validators/skill-validate.ts`, applied to every file declared in a skill's `knowledge:` frontmatter (forge skills and pack skills alike):

- **SKILL-19 (entry schema):** every structured entry's metadata block parses and satisfies `knowledgeEntryMetaSchema` with the layer-specific refinements. Violations: error. Legacy sections: one aggregated warning per file ("N legacy sections predate RFC-0660 — run the knowledge compaction command to migrate") during the migration window; after the window closes (separate follow-up decision), the warning becomes an error.
- **SKILL-20 (identifier uniqueness):** entry ids are unique within a file and match `^K-\d{4}$`; `supersedes` references resolve to entries in the same file; `promotedTo` matches `^shared/K-\d{4}$`. Violations: error.

`forge.doctor` gains an informational count of legacy sections across all knowledge files (no failure). Knowledge file templates in `packages/forge/skills/` are structured-empty (preamble + zero entries); `forge.create` copies them as-is during project initialization. `skill-create` documents the format for skill authors.

**Performance:** the parser runs as part of `forge.skill.validate`, which already scans all skill files. Currently 4 skills declare knowledge files (11 files total). The parser is linear in file size; incremental cost over the existing SKILL-13 existence check is negligible (~11 small markdown files, typically <10 KB each).

### CLI surface

```sh
# Existing commands, extended behavior — no new commands
pnpm exec site-kernel run forge.skill.validate --all
pnpm exec site-kernel run forge.skill.validate --skill fo-memory-sync --json
pnpm exec site-kernel run forge.doctor --json
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/knowledge/parse.ts` | Tolerant parser: markdown → `ParsedKnowledgeFile` |
| `packages/forge/src/knowledge/schema.ts` | Zod metadata schema + layer refinements |
| `packages/forge/src/knowledge/serialize.ts` | Round-trip serializer |
| `packages/forge/src/validators/skill-validate.ts` | SKILL-19 / SKILL-20 rules |
| `packages/forge/skills/**/{qa-log,fix-patterns,learned-principles}.md` | Migrated to structured format (via RFC-0662 compact with operator approval) |
| `packages/forge/skills/shared/writing-great-skills/SKILL.md` | § Cumulative knowledge pattern updated with the entry format contract |
| `packages/forge/skills/meta/skill-create/SKILL.md` | Authoring guidance for knowledge files |
| `packages/forge/AGENTS.md` | Skills section updated to document SKILL-19/SKILL-20 alongside SKILL-13 |

### Output format

`forge.skill.validate --json` with SKILL-19/SKILL-20 violations:

```json
{
  "command": "forge.skill.validate",
  "status": "fail",
  "violations": [
    {
      "skill": "fo-memory-sync",
      "rule": "SKILL-19",
      "file": "learned-principles.md",
      "line": 14,
      "severity": "error",
      "message": "Entry K-0003: confirmations must be an integer >= 0 (got 'three')"
    },
    {
      "skill": "grilling",
      "rule": "SKILL-19",
      "file": "qa-log.md",
      "severity": "warning",
      "message": "3 legacy sections predate RFC-0660 — run the knowledge compaction command to migrate"
    },
    {
      "skill": "fo-session-save",
      "rule": "SKILL-20",
      "file": "fix-patterns.md",
      "line": 31,
      "severity": "error",
      "message": "Duplicate entry id K-0002 (first occurrence at line 9)"
    }
  ]
}
```

### Failure modes

- **Malformed YAML in a metadata block** → SKILL-19 error with the YAML parser's message and line number. The rest of the file still parses (tolerant parser isolates the bad entry).
- **Unparseable heading id** (e.g. `### K-7: title`) → SKILL-20 error suggesting the `K-NNNN` form.
- **Layer/file mismatch** (L0 file containing an entry with `confirmations`) → SKILL-19 error naming the forbidden field for that layer.
- **File with only legacy sections** → warning only; exit code unaffected during the migration window.
- **Non-knowledge markdown in the skill folder** → untouched; only files listed in `knowledge:` frontmatter are parsed.

## Rollout

- **Phase 1 (this RFC's implementation):** parser + serializer + SKILL-19/SKILL-20 land with legacy sections as warnings. Forge's own knowledge files are migrated in the same change by running the entry-format migration (scripted, operator-reviewed diff) so the dogfood is immediate: after implementation, `forge.skill.validate` passes with zero legacy warnings on `packages/forge/skills/`.
- **Phase 2 (RFC-0661/0662):** budgets and the compact command build on `parseKnowledgeFile`. Pack skills adopt via their next knowledge mutation; nothing forces a flag day.
- **New skills:** `skill-create` scaffolds structured knowledge files from day one; the format is the only documented one in `writing-great-skills`.
- **npm consumers:** knowledge files continue to ship as empty templates — now structured-empty (preamble only, zero entries), which is valid by construction.
- **Migration window close:** promoting the legacy-section warning to an error is a separate follow-up decision, taken after `forge.doctor` reports zero legacy sections across all knowledge files — a deterministic trigger that confirms the compaction cycle (RFC-0662) has migrated all legacy content.

## Alternatives considered

- **Pure YAML files per layer** (`learned-principles.yaml`) — rejected: loses the freeform body (rationale, examples, Q&A text) that makes entries useful to agents and reviewable by humans; contradicts the file-first, human-readable philosophy that RFC-0524 and OpenClaw-style systems validated.
- **Heading-inline metadata** (`### K-0007 · confirmations: 4 · created: 2026-07-20`) — rejected: fragile to parse, no schema validation, encourages malformed ad-hoc extensions.
- **SQLite/FTS5 index as source of truth** (Hermes `state.db` style) — rejected: adds a binary artifact that cannot be reviewed in git diffs, breaks the npm portability story, and violates the zero-external-services constraint. A derived index may be added later for retrieval, but the markdown files remain the source of truth.
- **External memory providers** (Mem0, vector DBs, knowledge graphs) — rejected: cloud dependency, cost, privacy, and install complexity contradict forge's target audience (non-technical operators, any project type). Recorded as a permanent non-goal.

## Risks

- **False positives on hand-edited entries.** Operators edit knowledge files by hand (a feature). Mitigation: tolerant parser, precise line-numbered errors, and `fixHint` text pointing at the schema table.
- **Agent misinterpretation: agents may write entries without metadata.** Mitigation: `writing-great-skills` update makes the format the single documented one; SKILL-19 catches violations at validation time; skill bodies that mutate knowledge files get one-line format reminders during RFC-0662/0663 implementation.
- **Id allocation races** when two agents append concurrently. Mitigation: ids are per-file and `max+1`; a collision is a SKILL-20 error caught on next validation — deterministic, never silent.
- **Parser drift between parse and serialize** breaking round-trips. Mitigation: property-based test (parse → serialize → parse ≡ identity) in the implementation, per the monorepo's PBT discipline.

## Acceptance criteria

- [ ] `packages/forge/src/knowledge/` exports `parseKnowledgeFile`, `serializeKnowledgeFile`, and `knowledgeEntryMetaSchema` with the layer-specific required/forbidden field matrix (L0/L1/L2) encoded as Zod refinements
- [ ] Parser is tolerant: malformed metadata blocks produce `parseIssues` with 1-based line numbers and never throw; legacy sections are returned as opaque ranges
- [ ] Property-based test proves parse → serialize → parse is lossless for generated valid files
- [ ] `forge.skill.validate` enforces SKILL-19 (schema, errors; legacy sections as aggregated warnings) and SKILL-20 (id uniqueness, `supersedes` resolution, `promotedTo` format) for forge and pack skills
- [ ] `forge.doctor` reports legacy-section counts as informational output
- [ ] All knowledge files under `packages/forge/skills/` are migrated to the structured format and validate with zero legacy warnings
- [ ] `writing-great-skills` § Cumulative knowledge pattern documents the entry format as the single entry contract; `skill-create` scaffolds structured templates
- [ ] `docs/architecture-dna.md` gains DNA-60 linking RFC-0660..0662
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0660` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT introduce a second entry format, a parallel knowledge store, or an external memory dependency; deviations require a superseding RFC.
- Agents MUST keep `packages/forge/src/knowledge/` free of `@warpgogol/*` imports (forge autonomy guard, `forge.doctor`).
- Agents MUST NOT auto-mutate knowledge files from validators — SKILL-19/SKILL-20 are read-only checks; all mutation flows through RFC-0662's explicit command.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0660 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
