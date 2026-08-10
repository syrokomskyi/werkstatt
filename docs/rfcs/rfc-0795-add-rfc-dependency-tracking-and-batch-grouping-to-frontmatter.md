---
id: RFC-0795
title: "Add RFC dependency tracking and batch grouping to frontmatter"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: policy
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-10
updatedAt: 2026-08-10
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-54
  - RFC-0331
  - RFC-0476
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
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
    - rfc.implement.stamp
    - rfc.list
    - rfc.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - rfc.implement.stamp refuses to stamp an RFC whose dependsOn entries are not all implemented
  - rfc.list --batch <slug> returns all RFCs sharing that batch slug
  - rfc.validate warns on dependsOn entries pointing to non-existent RFCs
  - fo-idea-plan and fo-idea-implement skills contain session affinity recommendation text
nonGoals:
  - Transitive dependency resolution — dependsOn declares direct dependencies only
  - Machine-enforced session affinity — sessions have no forge-internal identity
  - Bidirectional dependency links — no dependedBy field; reverse lookup via rfc.list scan
  - Batch-level acceptance gating — each RFC in a batch is accepted/stamped independently
  - Restructuring the fo-idea decomposition workflow — batch and dependsOn are written during existing series creation
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

# RFC-0795: Add RFC dependency tracking and batch grouping to frontmatter

## Context

The Forge governance pipeline (`fo-idea` → `fo-idea-create-rfc` → `fo-idea-audit` → `fo-idea-enhance` → `fo-idea-plan` → `fo-idea-implement`) supports RFC series: when a task decomposes into multiple atomic decisions, `fo-idea` step 4 creates each document in dependency order and cross-references them via the `related` field.

However, the dependency relationship between RFCs in a series is only expressed in the decomposition plan text presented to the operator (step 4b: "Creation order: 1 → 2 → ... → N"). After creation, this ordering information evaporates — it is not written into frontmatter. No downstream tool can verify that RFC-A was implemented before RFC-B when RFC-B logically depends on RFC-A.

Similarly, when multiple RFCs are designed as a coherent set (e.g. RFC-0772..0776 engine consolidation, RFC-0781..0782 PBP locale fixes), there is no machine-readable field identifying them as a batch. Reviewing a batch requires manual identification by scanning `related` fields and creation dates.

The operator raised this gap during a session on 2026-08-10: "сейчас, когда мы пишем набор RFC или ADR для реализации идеи, мы не указываем, как эти идеи будут выполняться." The operator proposed parallel planning with sequential implementation in the same sessions to improve coherence and reliability.

## Problem

1. **No `dependsOn` field in RFC frontmatter.** The `RfcFrontmatter` interface in `packages/forge/os/rfc/types.ts` has `related`, `supersedes`, `amends` — but no field declaring that one RFC's implementation requires another RFC to be implemented first. Dependencies are only expressed in the `fo-idea` decomposition plan text and are lost after document creation.

2. **No `batch` field in RFC frontmatter.** RFCs created as a series share `related` cross-references, but `related` is a loose association field — it also references DNA invariants, anti-patterns, and specs. There is no dedicated field identifying RFCs as members of a coherent design set.

3. **`rfc.implement.stamp` does not check dependencies.** The stamping handler in `packages/forge/os/rfc/handlers/` transitions `accepted → implemented` without verifying that prerequisite RFCs are `implemented`. An agent can stamp RFC-B before RFC-A, producing an implementation that references contracts or commands not yet established.

4. **`rfc.list` cannot filter by batch.** Reviewing a batch of RFCs requires manual identification — scanning `related` fields, creation dates, and titles. There is no `--batch` flag to retrieve all members of a design set.

5. **Session affinity is undocumented.** The operator observed that implementing an RFC in the same session where it was planned produces more reliable results — the session context contains edge cases and mental models not fully captured in the plan text. This insight is not recorded anywhere in the skill instructions.

## Decision

The RFC frontmatter schema gains two optional fields: `dependsOn: string[]` (RFC IDs that must be `implemented` before this RFC can be stamped) and `batch: string` (a kebab-case slug grouping RFCs designed as a coherent set). `rfc.implement.stamp` hard-blocks stamping when any `dependsOn` entry is not `implemented`. `rfc.list` gains a `--batch <slug>` flag. `rfc.validate` checks referential integrity of `dependsOn` entries. `fo-idea-plan` and `fo-idea-implement` skill instructions gain a session affinity recommendation. DNA-65 (RFC dependency and batch tracking) is established by this RFC.

## Architectural fit

- **DNA-54 (Forge bindings contract)** — adjacent. DNA-54 governs how forge skill bodies reference project-specific values. This RFC extends the forge governance surface (frontmatter schema, validation rules, stamping gate) in the same package (`packages/forge`).
- **DNA-65 (new)** — established by this RFC. Codifies that RFCs in a series declare dependencies and batch identity in frontmatter, and that `rfc.implement.stamp` enforces dependency ordering.
- **RFC-0331** — `--satisfies` enforcement. This RFC is `kind: policy`, so `--satisfies` is not required. DNA-65 is added to `docs/architecture-dna.md` during implementation.
- **RFC-0476** — `rfc.implement.stamp` command. This RFC extends the stamping handler with a dependency check, following the existing pattern of stamp-time validation (RFC-IMP-02 evidence annotations, RFC-IMP-03 commit message reference, RFC-IMP-04 dirty file check).
- **Existing referential integrity pattern** — `rfc.validate` already checks `supersedes`/`supersededBy` (V-10..V-12) and `amends`/`amendedBy` (V-19) bidirectionally. `dependsOn` follows the same referential integrity pattern (V-31: entries must match existing RFC IDs) but without a reverse field — reverse lookup is done by scanning all RFCs.

## Design

### CLI surface

```sh
# List all RFCs in a batch
pnpm exec werkstatt run rfc.list --batch engine-consolidation --json

# Stamp an RFC whose dependencies are all implemented (succeeds)
pnpm exec werkstatt run rfc.implement.stamp --id RFC-0782 --implementation-commit abc123

# Stamp an RFC whose dependencies are NOT all implemented (fails)
pnpm exec werkstatt run rfc.implement.stamp --id RFC-0782 --implementation-commit abc123
# Error: RFC-DEP-01: RFC-0782 depends on RFC-0781, which is not implemented (status: accepted)
```

No new commands are introduced. Two existing commands are extended:

- `rfc.list` gains `--batch <slug>` flag (optional, filters by batch slug)
- `rfc.implement.stamp` gains internal dependency check (no CLI surface change)
- `rfc.validate` gains V-31 validation rule (no CLI surface change)

### TypeScript contracts

```ts
// packages/forge/os/rfc/types.ts — additions to RfcFrontmatter

export interface RfcFrontmatter {
  // ... existing fields ...

  /**
   * RFC-0795: IDs of RFCs that must be `implemented` before this RFC
   * can be stamped `implemented` via `rfc.implement.stamp`.
   * Direct dependencies only — not transitive.
   * Each entry must match ^RFC-\d{4}$ and exist in docs/rfcs/.
   * Validated by V-31 (referential integrity) and RFC-DEP-01 (stamp gate).
   */
  dependsOn?: string[];

  /**
   * RFC-0795: Kebab-case slug grouping RFCs designed as a coherent set.
   * Example: "engine-consolidation", "pbp-locale-fixes".
   * Must match /^[a-z0-9]+(-[a-z0-9]+)*$/.
   * Optional — RFCs without a batch are standalone.
   * Filterable via `rfc.list --batch <slug>`.
   */
  batch?: string;
}

// Addition to RFC_KNOWN_KEYS
export const RFC_KNOWN_KEYS: readonly string[] = [
  // ... existing keys ...
  "dependsOn",
  "batch",
] as const;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/os/rfc/types.ts` | Add `dependsOn` and `batch` to `RfcFrontmatter` and `RFC_KNOWN_KEYS` |
| `packages/forge/os/rfc/handlers/validate-rules.ts` | Add V-31 (dependsOn referential integrity) and V-32 (batch slug format) |
| `packages/forge/os/rfc/handlers/rfc-implement-stamp.ts` | Add RFC-DEP-01 dependency gate before status transition |
| `packages/forge/os/rfc/handlers/rfc-list.ts` | Add `--batch` flag filtering |
| `packages/forge/os/rfc/rfc.module.ts` | Register `--batch` flag on `rfc.list` command |
| `packages/forge/skills/fo/fo-idea-plan/SKILL.md` | Add session affinity recommendation |
| `packages/forge/skills/fo/fo-idea-implement/SKILL.md` | Add session affinity recommendation |
| `packages/forge/skills/fo/fo-idea/SKILL.md` | Step 4c: write `dependsOn` and `batch` during series creation |
| `docs/architecture-dna.md` | Add DNA-65 entry |

### Output format

`rfc.list --batch engine-consolidation --json`:

```json
{
  "command": "rfc.list",
  "status": "ok",
  "rfcs": [
    {
      "id": "RFC-0772",
      "title": "Consolidate engine core into packages/werkstatt",
      "status": "implemented",
      "batch": "engine-consolidation",
      "dependsOn": []
    },
    {
      "id": "RFC-0773",
      "title": "Engine publication pipeline",
      "status": "implemented",
      "batch": "engine-consolidation",
      "dependsOn": ["RFC-0772"]
    }
  ]
}
```

`rfc.implement.stamp` failure when dependency not implemented:

```json
{
  "command": "rfc.implement.stamp",
  "status": "fail",
  "exitCode": 1,
  "errors": [
    {
      "rule": "RFC-DEP-01",
      "message": "RFC-0782 depends on RFC-0781, which is not implemented (status: accepted). Implement RFC-0781 first."
    }
  ]
}
```

### Failure modes

- **RFC-DEP-01 (hard block)**: `rfc.implement.stamp` refuses to stamp an RFC when any `dependsOn` entry is not `implemented`. The error message names the blocking RFC and its current status. The operator must implement the dependency first, or remove the `dependsOn` entry via an amending RFC.
- **V-31 (warning)**: `rfc.validate` warns when a `dependsOn` entry does not match any existing RFC file. This is a warning, not an error — the referenced RFC may not yet have been created (e.g. during parallel series creation where RFC-A is created before RFC-B).
- **V-32 (warning)**: `rfc.validate` warns when a `batch` slug does not match the kebab-case pattern `/^[a-z0-9]+(-[a-z0-9]+)*$/`.
- **Missing `dependsOn`/`batch`**: No violation. Both fields are optional. Standalone RFCs need neither.

## Rollout

- **Backward compatible**: Both `dependsOn` and `batch` are optional frontmatter fields. Existing RFCs without these fields pass `rfc.validate` without warnings. No migration is required for existing RFCs to pass validation.

- **Stamping gate active immediately**: `rfc.implement.stamp` begins enforcing `dependsOn` as soon as the implementation is deployed. RFCs without `dependsOn` are unaffected (empty array = no dependencies = no blocking).

- **Retroactive batch auto-detection**: During implementation, scan existing `implemented` RFCs for `related` cross-references that indicate series membership. When a group of 2+ RFCs mutually reference each other via `related` and share close creation dates (within 7 days), auto-populate `batch` with a derived slug. `dependsOn` is NOT populated retroactively — dependency ordering cannot be reliably auto-detected from `related` fields. If auto-detection is ambiguous (e.g. RFCs reference each other but could belong to different batches), skip — do not ask the operator.

- **New RFC series**: `fo-idea` step 4c (series creation) writes `dependsOn` and `batch` into frontmatter during document creation. The decomposition plan (step 4a) already records dependency edges — these are now written to frontmatter instead of being lost.

- **Skill updates**: `fo-idea-plan` and `fo-idea-implement` gain a session affinity recommendation paragraph. This is advisory text, not enforced — sessions have no forge-internal identity.

- **No pipeline integration**: `rfc.validate` V-31/V-32 are warnings, not errors. No `build.check` or `build.prepare` pipeline step is added. The dependency gate lives exclusively in `rfc.implement.stamp`.

## Alternatives considered

1. **Warning-only at `fo-idea-implement` (no stamp block).** Rejected: the operator chose hard block at stamping. A warning at implementation start is insufficient because the agent may proceed and produce code that references contracts not yet established. The stamping gate is the last checkpoint before `implemented` status — blocking here prevents incomplete implementations from being marked done.

2. **Structured `batch` object (`{ id, size, order }`).** Rejected: the order of implementation is already expressed via `dependsOn`. The size of a batch is a derived value (count of RFCs with the same slug). Additional metadata would complicate frontmatter and validation without adding value.

3. **Separate `rfc.batch.list` command.** Rejected: `rfc.list` already scans all RFCs. Adding a `--batch` flag is a minimal extension. A separate command would duplicate scanning logic for a single filter criterion.

4. **Transitive dependency resolution.** Rejected: transitivity would require building a dependency graph and topologically sorting it at stamp time. If RFC-C truly depends on RFC-A (transitively through RFC-B), it should declare `dependsOn: [RFC-B, RFC-A]` explicitly. Direct dependencies are readable in frontmatter without computation.

5. **Bidirectional `dependedBy` field.** Rejected: unlike `supersedes`/`supersededBy` (1:1), dependencies are potentially N:M. A `dependedBy` field would need to be updated on RFC-A every time a new RFC depends on it — fragile and prone to drift. Reverse lookup is done by scanning all RFCs for `dependsOn` references, which `rfc.list --json` already supports.

6. **Machine-enforced session affinity.** Rejected: sessions have no machine-readable identity in forge. Session affinity is a skill-level recommendation, not an enforceable contract. The plan file and RFC body capture the necessary context for cross-session implementation.

## Risks

- **False blocking of legitimate workflows.** An RFC may declare `dependsOn` on another RFC that is accepted but never implemented (e.g. rejected after acceptance, or deferred indefinitely). The stamping gate would block forever. Mitigation: the operator can remove a `dependsOn` entry via an amending RFC, or the blocking RFC can be superseded/rejected to unblock dependents.

- **Agent misinterpretation: declaring dependsOn too broadly.** Agents may add `dependsOn` entries for loosely related RFCs, creating unnecessary blocking. Mitigation: `fo-idea` step 4c instructs agents to declare only direct implementation dependencies ("RFC-B's implementation requires contracts or commands established by RFC-A"), not general relatedness.

- **Retroactive batch auto-detection errors.** Auto-detecting batch groupings from `related` fields may produce false positives (grouping RFCs that reference each other but were not designed as a batch). Mitigation: the auto-detection heuristic requires mutual `related` references AND close creation dates. Ambiguous cases are skipped, not guessed.

- **V-31 false positives during parallel series creation.** When RFC-A and RFC-B are created in parallel sessions, RFC-B's `dependsOn: [RFC-A]` may reference an RFC that does not yet exist. V-31 is a warning, not an error — this is by design. The warning disappears once RFC-A is created.

- **Maintenance burden.** Two new frontmatter fields, two new validation rules, one stamping gate check, one list filter. The maintenance surface is small and follows existing patterns in `validate-rules.ts`.

## Acceptance criteria

- [ ] `dependsOn` and `batch` fields added to `RfcFrontmatter` interface in `packages/forge/os/rfc/types.ts`
- [ ] `dependsOn` and `batch` added to `RFC_KNOWN_KEYS` array
- [ ] V-31 validation rule added to `validate-rules.ts` (dependsOn referential integrity, warning severity)
- [ ] V-32 validation rule added to `validate-rules.ts` (batch slug format, warning severity)
- [ ] RFC-DEP-01 dependency gate added to `rfc.implement.stamp` handler (hard block when dependsOn entry is not `implemented`)
- [ ] `--batch` flag added to `rfc.list` command registration and handler
- [ ] `rfc.list --batch <slug> --json` returns only RFCs with matching batch slug
- [ ] `fo-idea` step 4c updated to write `dependsOn` and `batch` during series creation
- [ ] `fo-idea-plan` SKILL.md updated with session affinity recommendation
- [ ] `fo-idea-implement` SKILL.md updated with session affinity recommendation
- [ ] DNA-65 entry added to `docs/architecture-dna.md`
- [ ] Retroactive batch auto-detection implemented for existing `implemented` RFCs
- [ ] Unit tests for V-31, V-32, and RFC-DEP-01 in `validate-rules.test.ts` and stamp handler tests
- [ ] `rfc.validate` passes on this file with zero errors

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **Retroactive batch auto-detection**: scan `docs/rfcs/` (including `archive/implemented/`) for groups of 2+ `implemented` RFCs that mutually reference each other via `related` AND share creation dates within 7 days. For each detected group, derive a batch slug from the common theme (e.g. "engine-consolidation" for RFC-0772..0776). Add `batch: <slug>` to each RFC's frontmatter. Do NOT add `dependsOn` retroactively. If a group is ambiguous, skip it — do not ask the operator.
- **Session affinity recommendation text** for skills: "When an RFC was planned in this session, prefer implementing it in this session too. The session context contains edge cases and mental models not fully captured in the plan text. If starting a new session, re-read the plan file and the RFC before implementing."
- **fo-idea step 4c update**: when creating documents in a series, write `dependsOn` for each document based on the decomposition plan's dependency edges. Write `batch` with a shared kebab-case slug for all documents in the series. The slug should be descriptive of the overall task (e.g. "pbp-locale-fixes", "engine-consolidation").
