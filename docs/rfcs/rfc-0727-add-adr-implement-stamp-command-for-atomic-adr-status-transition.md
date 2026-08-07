---
id: RFC-0727
title: "Add adr.implement.stamp command for atomic ADR status transition"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-07
updatedAt: 2026-08-07
enhancedAt: 2026-08-07
implementedAt: 2026-08-07
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0625
amendedBy: []
related:
  - RFC-0476
  - RFC-0224
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
  proposed:
    - adr.implement.stamp
  added: []
  changed:
    - adr.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/forge"
successSignals:
  - "adr.implement.stamp atomically transitions ADR status from accepted/proposed to implemented"
  - "ADR-IMP-01 rejects ADRs not in accepted or proposed status"
  - "ADR-IMP-03 validates implementation commit is reachable from HEAD and references the ADR id"
  - "ADR-IMP-04 rejects stamping when the ADR file has uncommitted changes"
  - "ADR-IMP-05 acquires exclusive lock to prevent concurrent stamp operations"
  - "AV-16 warning message directs agents to adr.implement.stamp instead of manual editing"
  - "fo-idea-implement step 4.10 uses adr.implement.stamp instead of manual frontmatter editing"
  - "fo-idea-plan step 8 references adr.implement.stamp for ADR transitions"
nonGoals:
  - "Does not add acceptance criteria evaluation to ADR stamping — ADRs do not have acceptance criteria"
  - "Does not add evidence/probe infrastructure — ADRs do not have acceptance probes"
  - "Does not change rfc.implement.stamp or its preconditions"
  - "Does not add ADR lifecycle transitions beyond accepted/proposed → implemented"
  - "Does not make AV-16 an error — it remains a warning"
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

# RFC-0727: Add adr.implement.stamp command for atomic ADR status transition

## Context

RFC-0476 established `rfc.implement.stamp` as the exclusive atomic path for `accepted → implemented` RFC transitions, with preconditions (RFC-IMP-01..06) that validate status, acceptance criteria, implementation commit, file cleanliness, concurrent safety, and evidence. This command has been operational since 2026-07-15 and has successfully prevented manual frontmatter editing errors for RFCs.

RFC-0625 (implemented 2026-07-31) added drift detection for both RFCs and ADRs: V-32 for RFCs and AV-16 for ADRs. However, RFC-0625 explicitly excluded ADR stamping infrastructure from its scope (nonGoals: "Does not add ADR stamping infrastructure — ADRs remain manually transitioned per existing process"). The AV-16 warning message currently directs agents to manually set `status: implemented` and `implementedAt`.

The current ADR stamping process is manual: an agent edits the frontmatter directly, changing `status` to `implemented`, setting `implementedAt` to the current date, and updating `updatedAt`. There is no atomic mutation, no commit validation, no file cleanliness check, and no concurrent safety. Errors in this manual process (wrong date format, missing `implementedAt`, typos in `status` value) are only caught by `adr.validate` after the fact.

## Problem

Five gaps exist in the current ADR status transition process:

1. **No atomic mutation** — manual frontmatter editing is error-prone. An agent can forget `implementedAt`, use the wrong date format, or introduce typos. The `mutateFrontmatter` function in `rfc.implement.stamp` demonstrates the safe pattern: regex-based replacement of `status`, `implementedAt`, and `updatedAt` fields with validated values.

2. **No implementation commit validation** — `rfc.implement.stamp` validates that the implementation commit is reachable from HEAD and references the RFC id (RFC-IMP-03). ADRs have no equivalent check. An agent can stamp an ADR as implemented without any evidence that the implementation was actually committed.

3. **No file cleanliness check** — `rfc.implement.stamp` rejects stamping when the RFC file has uncommitted changes (RFC-IMP-04). ADRs have no equivalent check. An agent can stamp an ADR while the file has uncommitted edits, creating a race between the stamp and other changes.

4. **No concurrent safety** — `rfc.implement.stamp` acquires an exclusive lock per RFC id (RFC-IMP-05) to prevent concurrent stamp operations. ADRs have no equivalent protection. Two agents stamping the same ADR simultaneously could produce conflicting writes.

5. **AV-16 message inconsistency** — the AV-16 warning message says "Set status: implemented and implementedAt to complete," directing agents to manual editing. After this RFC, the message should direct agents to `adr.implement.stamp`, matching how V-32 directs agents to `rfc.implement.stamp`.

## Decision

The Forge ADR module gains `adr.implement.stamp` — the exclusive atomic path for `accepted → implemented` and `proposed → implemented` ADR transitions. The command validates preconditions (ADR-IMP-01, 03, 04, 05), atomically mutates ADR frontmatter, and provides dry-run support. The AV-16 warning message is updated to direct agents to `adr.implement.stamp` instead of manual editing. The `fo-idea-implement` step 4.10 and `fo-idea-plan` step 8 are updated to use `adr.implement.stamp` for ADR transitions.

## Architectural fit

- **RFC-0476:** this RFC mirrors the `rfc.implement.stamp` pattern for ADRs, reusing the same structural approach (precondition validation, atomic frontmatter mutation, exclusive lock, dry-run support). The ADR command is simpler because ADRs lack acceptance criteria and evidence probes.
- **RFC-0625 (amended):** this RFC amends RFC-0625 by adding the ADR stamping infrastructure that RFC-0625 consciously excluded. The AV-16 drift detection rule remains unchanged in logic — only its warning message is updated to reference the new command.
- **RFC-0224:** retains the agent-permitted lifecycle transition model. `adr.implement.stamp` is the ADR analogue of `rfc.implement.stamp` — both are the exclusive mutation path for `→ implemented` transitions.
- **Site OS operator model:** `adr.implement.stamp` is registered in `forgeAdrModule` alongside `adr.list`, `adr.create`, `adr.validate`, and `adr.archive`. It follows the same scope (`workspace`), flag, and result patterns as the existing ADR commands.

## Design

### CLI surface

```sh
# Dry-run (preview without mutation)
pnpm exec site-kernel run adr.implement.stamp --id ADR-0003 --implementation-commit <sha> --dry-run

# Atomic stamp
pnpm exec site-kernel run adr.implement.stamp --id ADR-0003 --implementation-commit <sha>
```

Flags:

| Flag                      | Required | Description                       |
| ------------------------- | -------- | --------------------------------- |
| `--id`                    | yes      | Target ADR id (e.g. `ADR-0003`)   |
| `--implementation-commit` | yes      | SHA of the implementation commit  |
| `--dry-run`               | no       | Preview without mutating the file |

Scope: `workspace`.

### TypeScript contracts

```ts
type AdrImplementStampRule =
  | "ADR-IMP-01"  // ADR not found or status not accepted/proposed
  | "ADR-IMP-03"  // implementation commit not reachable or does not reference ADR id
  | "ADR-IMP-04"  // ADR file has uncommitted changes
  | "ADR-IMP-05"; // concurrent stamp operation in progress

interface AdrImplementStampData {
  adrId: string;
  implementationCommit: string;
  stampedAt: string;  // ISO 8601 datetime
}

interface AdrImplementStampViolation {
  rule: AdrImplementStampRule;
  message: string;
}

interface AdrImplementStampResult {
  command: "adr.implement.stamp";
  status: "pass" | "fail";
  data?: AdrImplementStampData;
  violations: AdrImplementStampViolation[];
}
```

The `mutateAdrFrontmatter` function mirrors `mutateFrontmatter` from `rfc.implement.stamp`:

```ts
function mutateAdrFrontmatter(
  source: string,
  status: "implemented",
  implementedAt: string,  // YYYY-MM-DD
  updatedAt: string,      // YYYY-MM-DD
): string
```

Replaces `status`, inserts/updates `implementedAt`, and updates `updatedAt` using regex-based field replacement.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/os/adr/adr.module.ts` | Register `adr.implement.stamp` command |
| `packages/forge/os/adr/handlers/implement-stamp.ts` | New handler — main stamp logic |
| `packages/forge/os/adr/types.ts` | Add `AdrImplementStamp*` types and `AdrImplementStampRule` |
| `packages/forge/os/adr/handlers/validate.ts` | Update AV-16 warning message to reference `adr.implement.stamp` |
| `packages/forge/AGENTS.md` | Update `forgeAdrModule` command table to include `adr.implement.stamp` |
| `packages/forge/skills/fo/fo-idea-implement/SKILL.md` | Step 4.10 uses `adr.implement.stamp` instead of manual editing |
| `packages/forge/skills/fo/fo-idea-plan/SKILL.md` | Step 8 references `adr.implement.stamp` for ADR transitions |
| `.agents/skills/fo/fo-idea-implement/SKILL.md` | Synced copy |
| `.agents/skills/fo/fo-idea-plan/SKILL.md` | Synced copy |

### Output format

Success (`--json`):

```json
{
  "command": "adr.implement.stamp",
  "status": "pass",
  "data": {
    "adrId": "ADR-0003",
    "implementationCommit": "abc123def456",
    "stampedAt": "2026-08-07T05:30:00.000Z"
  },
  "violations": []
}
```

Failure (`--json`):

```json
{
  "command": "adr.implement.stamp",
  "status": "fail",
  "violations": [
    {
      "rule": "ADR-IMP-01",
      "message": "ADR ADR-0003 has status \"superseded\" — only \"accepted\" or \"proposed\" ADRs can be stamped to \"implemented\"."
    }
  ]
}
```

Pretty output mirrors `rfc.implement.stamp`: success message, implementation commit, stamped-at timestamp.

### Failure modes

- **ADR-IMP-01 (status check):** rejects ADRs not in `accepted` or `proposed` status. Terminal statuses (`implemented`, `superseded`, `rejected`) and `reviewing` are not stampable. `reviewing` is excluded because it indicates the ADR is still under active review and not ready for implementation.
- **ADR-IMP-03 (commit validation):** rejects when the implementation commit is not reachable from HEAD (not an ancestor) or when the commit message/changed files do not reference the ADR id. The commit message check uses `implement: ADR-XXXX` prefix matching, same as AV-16 drift detection. The changed-files check uses case-insensitive slug matching (e.g. `adr-0003` in filename).
- **ADR-IMP-04 (file cleanliness):** rejects when the ADR file has uncommitted changes. Only the target ADR file is checked — uncommitted changes in unrelated files from other agents do not block stamping (same as RFC-IMP-04).
- **ADR-IMP-05 (concurrent lock):** rejects when another stamp operation is in progress for the same ADR id. Lock files are stored in `.adr-locks/<adr-id>.lock` (mirrors `.rfc-locks/` pattern).
- **Dry-run:** all preconditions are checked, but the file is not mutated. The result includes the same `data` fields as a real stamp, allowing agents to verify before committing.
- **Post-hoc ADRs:** ADRs created as `proposed` to document already-implemented decisions can be stamped directly from `proposed → implemented` without first transitioning to `accepted`. This is the key difference from `rfc.implement.stamp`, which only allows `accepted → implemented`. For post-hoc ADRs where the implementation predates the ADR creation, the ADR creation commit itself is a valid `--implementation-commit` value — the changed-files check (slug matching `adr-XXXX` in filename) will match by definition.

## Rollout

1. Add `AdrImplementStamp*` types to `packages/forge/os/adr/types.ts`.
2. Create `packages/forge/os/adr/handlers/implement-stamp.ts` with the stamp handler, reusing git helper patterns from `rfc.implement.stamp` (execGit, isAdrFileClean, commitReachableFromHead, commitReferencesAdr, lock acquire/release, mutateAdrFrontmatter).
3. Register `adr.implement.stamp` in `packages/forge/os/adr/adr.module.ts`.
4. Update AV-16 warning message in `packages/forge/os/adr/handlers/validate.ts` to say: `Run: site-kernel run adr.implement.stamp --id <adr-id> --implementation-commit <sha>` instead of `Set status: implemented and implementedAt to complete.`
5. Update `fo-idea-implement/SKILL.md` step 4.10 to use `adr.implement.stamp` instead of manual frontmatter editing. Also update step 4.10b gate text to reference `adr.implement.stamp` instead of manual editing. Sync to `.agents/skills/`.
6. Update `fo-idea-plan/SKILL.md` step 8 to reference `adr.implement.stamp` for ADR transitions. Sync to `.agents/skills/`.
7. Add unit tests covering: ADR-IMP-01 (wrong status), ADR-IMP-03 (commit not reachable / does not reference ADR), ADR-IMP-04 (dirty file), ADR-IMP-05 (concurrent lock), dry-run pass, atomic stamp pass, post-hoc ADR (proposed → implemented).
8. Existing ADRs are not retroactively affected — the command is opt-in. ADRs already in `implemented` status were manually transitioned and remain valid.
9. `adr.implement.stamp` does not join `build.check` or CI pipelines — it is a manual command, same as `rfc.implement.stamp`.
10. Add `adr.implement.stamp` to `forge.yaml` bindings as `adrImplementStamp`.
11. Add `.adr-locks` to `.gitignore` (mirrors existing `.rfc-locks` entry).

## Alternatives considered

- **Keep manual editing only (status quo).** Rejected: manual editing has no atomic mutation, no commit validation, no file cleanliness check, and no concurrent safety. RFC-0476 already proved that stamping commands prevent real errors. The ADR analogue closes the same gap.

- **Extend `rfc.implement.stamp` to handle ADRs.** Rejected: RFC and ADR modules are separate Forge modules with separate types, file paths, and validation rules. Mixing them would violate module boundaries and require conditional logic ("if ADR, skip criteria/evidence checks"). A separate command in the ADR module is cleaner.

- **Allow `proposed → implemented` only (no `accepted`).** Rejected: many ADRs go through `accepted` before implementation. Excluding `accepted` would force a manual `accepted` transition first, then stamping — two steps where one suffices.

- **Make `--implementation-commit` optional.** Rejected: the commit validation (ADR-IMP-03) is a key safety check. Without it, an agent can stamp an ADR as implemented without any evidence that the implementation was committed. Post-hoc ADRs can reference the commit that created the ADR itself or the commit that implemented the decision.

- **Add ADR-IMP-02 (required sections check).** Rejected: `adr.validate` already checks required sections via AV-12. Duplicating this check in the stamp command adds maintenance burden without value — `adr.validate` runs as a post-stamp verification step anyway.

## Risks

- **Post-hoc ADR abuse:** allowing `proposed → implemented` could encourage agents to create ADRs as `proposed` and immediately stamp them without proper review. Mitigation: the `decider` field is required in ADR frontmatter (AV-05), and `adr.validate` checks all frontmatter fields. The stamp command does not bypass ADR validation — it only transitions status.
- **Commit reference false negatives from squash merges:** same as RFC-IMP-03 — if implementation commits are squashed into a single commit with a different message, ADR-IMP-03 will not detect them. Acceptable: ADR-IMP-03 is a safety net, not a hard gate. The agent can reference the squash commit.
- **Lock file cleanup:** if a stamp operation crashes before releasing the lock, the lock file remains. Same risk as `rfc.implement.stamp` — the `finally` block releases the lock. A stale lock can be manually removed.
- **Agent confusion from `proposed → implemented`:** agents might stamp ADRs as implemented prematurely. The dry-run flag allows previewing before committing. The `fo-idea-implement` step 4.10b gate (from RFC-0625) still verifies the stamp happened.
- **Skill sync drift:** updating `fo-idea-implement` and `fo-idea-plan` requires syncing to `.agents/skills/`. If sync is forgotten, `forge.doctor` will report drift. This is the standard sync pattern for all forge skill edits.

## Acceptance criteria

- [x] `adr.implement.stamp` command registered in `forgeAdrModule` with `--id`, `--implementation-commit`, and `--dry-run` flags (evidence: packages/forge/os/adr/adr.module.ts:127-156, rfc.validate pass)
- [x] ADR-IMP-01 rejects ADRs not in `accepted` or `proposed` status (evidence: packages/forge/os/adr/handlers/implement-stamp.ts:155-162, adr-implement-stamp.test.ts:97-116)
- [x] ADR-IMP-03 validates implementation commit is reachable from HEAD and references the ADR id (evidence: packages/forge/os/adr/handlers/implement-stamp.ts:183-201, adr-implement-stamp.test.ts:165-246)
- [x] ADR-IMP-04 rejects stamping when the ADR file has uncommitted changes (evidence: packages/forge/os/adr/handlers/implement-stamp.ts:175-181, adr-implement-stamp.test.ts:250-269)
- [x] ADR-IMP-05 acquires exclusive lock to prevent concurrent stamp operations (evidence: packages/forge/os/adr/handlers/implement-stamp.ts:203-214, adr-implement-stamp.test.ts:274-294)
- [x] `--dry-run` mode checks all preconditions without mutating the file (evidence: packages/forge/os/adr/handlers/implement-stamp.ts:230-247, adr-implement-stamp.test.ts:299-319)
- [x] Atomic stamp mutates `status`, `implementedAt`, and `updatedAt` in ADR frontmatter (evidence: packages/forge/os/adr/handlers/implement-stamp.ts:249-257, adr-implement-stamp.test.ts:324-346)
- [x] `proposed → implemented` transition works for post-hoc ADRs (evidence: packages/forge/os/adr/handlers/implement-stamp.ts:155-162, adr-implement-stamp.test.ts:351-366)
- [x] AV-16 warning message updated to reference `adr.implement.stamp` (evidence: packages/forge/os/adr/handlers/validate.ts:402)
- [x] `fo-idea-implement` step 4.10 uses `adr.implement.stamp` instead of manual editing (evidence: packages/forge/skills/fo/fo-idea-implement/SKILL.md:435-457)
- [x] `fo-idea-plan` step 8 references `adr.implement.stamp` for ADR transitions (evidence: packages/forge/skills/fo/fo-idea-plan/SKILL.md:146)
- [x] Synced copies in `.agents/skills/` match forge skill source files (evidence: .agents/skills/fo-idea-implement/SKILL.md, .agents/skills/fo-idea-plan/SKILL.md)
- [x] Unit tests cover all ADR-IMP rules, dry-run, atomic stamp, and post-hoc ADR (evidence: packages/forge/src/tests/adr-implement-stamp.test.ts, 13 tests pass)
- [x] `rfc.validate` passes on this file with zero errors (evidence: rfc.validate --id RFC-0727 --json, exitCode 0)

## Implementation notes for agents

- Agents MAY implement this RFC only after it is accepted.
- Agents MUST create `packages/forge/os/adr/handlers/implement-stamp.ts` following the structure of `packages/forge/os/rfc/handlers/implement-stamp.ts`.
- Agents MUST reuse git helper patterns from `rfc.implement.stamp` (execGit, file cleanliness check, commit reachability, commit reference check, lock acquire/release).
- Agents MUST NOT add acceptance criteria or evidence probe checks — ADRs do not have these.
- Agents MUST update AV-16 warning message to reference `adr.implement.stamp`.
- Agents MUST update `fo-idea-implement` step 4.10 and `fo-idea-plan` step 8 to use `adr.implement.stamp`.
- Agents MUST sync skill updates to `.agents/skills/` in the same commit.
- Agents MUST add `adrImplementStamp` binding to `forge.yaml`.
- Agents MUST NOT make `adr.implement.stamp` join `build.check` or CI pipelines — it is a manual command.
- Direct edits to ADR `status`, `implementedAt`, and `updatedAt` are prohibited after this RFC is implemented — use `adr.implement.stamp` instead (mirrors RFC-0476 prohibition for RFCs).
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
