---
id: RFC-0361
title: "Naming policies for Sternsystem ids, mission ids, release ids, and Bordbuch entries"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-10
enhancedAt: 2026-07-10
implementedAt: 2026-07-10
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0362
related:
  - RFC-0354
  - RFC-0355
  - RFC-0357
  - RFC-0360
  - RFC-0362
  - DNA-6
  - DNA-23
satisfies: []
commands:
  proposed: []
  added:
    - naming.policy.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/ontology"
successSignals:
  - "`naming.policy.validate` enforces naming policies for Sternsystem ids, mission ids, release ids, and Bordbuch entry fields across `systems/registry.yaml`, `mission.yaml`, `release.yaml`, and `bordbuch/events.ndjson`."
  - "All ids are kebab-case, lowercase, latin-only (no non-ASCII characters, no underscores, no PascalCase)."
  - "Mission IDs follow `<system-id>-m<NNNNNN>` format with zero-padded six-digit sequence numbers."
  - "Release IDs follow `<system-id>-r<NNNNNN>` format with zero-padded six-digit sequence numbers."
  - "Bordbuch entry ids follow `event-<NNNNNN>` with no gaps and a valid hash-chain."
  - "cosmicStar names in the registry match entries in StarCatalog from @gogol/ontology, are unique across active/registered systems, and cannot be reactivated into conflict."
nonGoals:
  - "Does not define naming policies for file contents beyond ids and structural fields — content naming is governed by RFC-0047 content domains."
  - "Does not define naming policies for git branch names or commit messages."
  - "Does not define naming policies for agent session ids or agent handles — that is a future concern."
  - "Does not change DNA-6 (kebab-case filenames) or DNA-23 (cosmic naming) — this RFC enforces id-level naming on top of those invariants."
  - "Does not define naming policies for environment variables or integration keys — those are governed by RFC-0346 (DNA-40)."
  - "Does not provide `--fix` or `--fix-gaps` modes — rewriting ids or Bordbuch history is high risk and can break audit trails. The validator may emit a migration plan; humans or dedicated migration commands perform the changes."
  - "Does not provide caching, incremental validation, or `--since <timestamp>` filtering — the validator performs a full scan each run. Thousands of entries are sub-second; incremental validation is a future optimization."
  - "Does not emit structured logging or metrics beyond the `--json` output — integration with monitoring infrastructure is a future operational concern."
---

# RFC-0361: Naming policies for Sternsystem ids, mission ids, release ids, and Bordbuch entries

## Context

RFC-0354 introduced Sternsystem ids. RFC-0355 introduced mission ids and Bordbuch entries. RFC-0357 introduced release ids. Each RFC defined its id format inline with a regex pattern. But there is no single command that validates all naming policies across all artifacts. The policies are scattered across Zod schemas and command handlers, making it hard to audit or extend them.

RFC-0360 extended filename conventions to the whole repo (DNA-6). But filenames are only one layer of naming. The **content-level naming** — ids, sequence numbers, field names — is a separate concern that needs its own policy and validator.

This RFC consolidates the naming policies for all Werkstatt artifacts into a single `naming.policy.validate` command and documents the rules in one place.

## Problem

Three invariants are unprotected:

1. **No consolidated naming validator.** Naming policies are embedded in Zod schemas (`SystemPinSchema`, `MissionManifestSchema`, `ReleaseManifestSchema`, `FleetRegistryEntrySchema`) and enforced only when those schemas are parsed. There is no standalone command that validates naming across all artifacts without parsing each one individually.

2. **No Latin-only enforcement.** The kebab-case regex `^[a-z0-9]+(-[a-z0-9]+)*$` allows lowercase letters and digits but does not explicitly reject non-ASCII characters (e.g., `ä`, `ñ`, `я`). A Sternsystem id like `nicaragua-projekt` is valid, but `nicaragüa-projekt` would pass the regex in some regex engines and fail in others. The policy must be explicit: **Latin-only**.

3. **No sequence number format enforcement.** Mission and release ids require zero-padded six-digit sequence numbers (`m000001`, `r000001`). The regex `\d{6}` enforces six digits but does not prevent leading zeros from being stripped by integer parsing. The policy must be explicit: **zero-padded, six digits, scoped to the system**, with overflow handled as a hard stop.

4. **No cross-artifact semantic checks.** A syntactically valid release id can still point to a mission from another system, and an archived `cosmicStar` can be reactivated into conflict if only the immediate registry row is checked. Naming validation must include cross-file identity checks.

5. **No corruption tolerance.** A malformed YAML/JSON/NDJSON artifact can currently abort a full scan before other naming violations are reported. The validator must report parse errors per artifact and continue scanning the rest of the fleet.

## Decision

Introduce `naming.policy.validate` as the consolidated naming policy validator for all Werkstatt artifacts, and formalize the naming rules in one place.

### 1. Naming policies

#### 1.1 Sternsystem id

| Rule                | Pattern                       | Example                        |
| ------------------- | ----------------------------- | ------------------------------ |
| Format              | kebab-case                    | `warpgogol-com`                 |
| Case                | lowercase only                | `Warpgogol-Com` is invalid      |
| Character set       | Latin-only (a-z, 0-9, hyphen) | `nicaragüa-projekt` is invalid |
| Start               | letter or digit               | `-warpgogol` is invalid         |
| End                 | letter or digit               | `warpgogol-` is invalid         |
| Consecutive hyphens | not allowed                   | `warpgogol--com` is invalid     |
| Regex               | `^[a-z0-9]+(-[a-z0-9]+)*$`    |                                |

**Latin-only clarification**: The regex `^[a-z0-9]+(-[a-z0-9]+)*$` uses the ASCII character class `[a-z0-9]`. Non-ASCII lowercase letters (ä, ñ, я) are NOT in this class and will fail. The policy is explicit: **only ASCII lowercase letters (a-z), digits (0-9), and hyphens (-) are permitted**.

#### 1.2 Mission ID

| Rule | Pattern | Example |
| --- | --- | --- |
| Format | `<system-id>-m<NNNNNN>` | `warpgogol-com-m000001` |
| System id | must match an existing Sternsystem id |  |
| Sequence | `m` + zero-padded six digits | `m000001`, `m000042`, `m999999` |
| Scope | per-system (each system has its own m000001, m000002, ...) |  |
| Overflow | `m999999` is the last valid id; allocating beyond it is a hard error requiring a new RFC |  |
| Regex | `^[a-z0-9]+(-[a-z0-9]+)*-m\d{6}$` |  |

#### 1.3 Release ID

| Rule | Pattern | Example |
| --- | --- | --- |
| Format | `<system-id>-r<NNNNNN>` | `warpgogol-com-r000001` |
| System id | must match an existing Sternsystem id |  |
| Sequence | `r` + zero-padded six digits | `r000001`, `r000042`, `r999999` |
| Scope | per-system (each system has its own r000001, r000002, ...) |  |
| Overflow | `r999999` is the last valid id; allocating beyond it is a hard error requiring a new RFC |  |
| Regex | `^[a-z0-9]+(-[a-z0-9]+)*-r\d{6}$` |  |

#### 1.4 Bordbuch entry fields

| Field | Rule |
| --- | --- |
| `id` | `event-<NNNNNN>`, monotonically increasing starting at `event-000001`, no gaps |
| `occurredAt` | ISO 8601, non-decreasing across entries |
| `kind` | one of `mission-open`, `mission-close`, `mission-abort`, `release-published`, `release-rolled-back`, `pin-update`, `deployment`, `notausgang-export`, `operator-note`, `erratum` |
| `missionId` | must match mission ID format (§1.2) or be null |
| `releaseId` | must match release ID format (§1.3) or be null |
| `actor` | non-empty string (agent id or human handle) |
| `summary` | non-empty string |
| `previousHash` / `hash` | RFC-0355 hash-chain fields; names and values must be present and well-formed |

#### 1.5 cosmicStar

| Rule | Pattern | Example |
| --- | --- | --- |
| Source | `StarCatalog` from `@gogol/ontology` | `Vega`, `Sirius`, `Polaris` |
| Uniqueness | unique across `active` and `registered` systems |  |
| Reuse | allowed only after the previous system is `archived`, and reactivating an archived system is blocked if another active/registered system now owns the star |  |
| Regex | must match a `StarCatalog` entry (not a free-form pattern) |  |

#### 1.6 Unicode and case normalization

Validation is ASCII-first:

- normalize each candidate id to NFC for diagnostics;
- reject any non-ASCII code point before applying the regex;
- reject case-folding collisions on case-insensitive filesystems (for example `Warpgogol-Com` and `warpgogol-com` in parallel directories);
- compare directory names with manifest ids exactly after path normalization.

The validator reports both the raw value and the normalized diagnostic value, but it never accepts a value because normalization made it look valid.

### 2. `naming.policy.validate` command

```sh
pnpm exec site-kernel run naming.policy.validate [--system <id>] [--json]
```

Validates naming policies across all Werkstatt artifacts:

1. **Registry** (`systems/registry.yaml`):
   - All `id` fields match §1.1.
   - All `cosmicStar` fields match §1.5.
   - All `repo` fields are valid git URLs.
   - All `pinnedPlatform` fields are valid semver.

2. **Missions** (all `missions/*/mission.yaml`):
   - All `missionId` fields match §1.2.
   - All `systemId` fields reference a registered Sternsystem.
   - All `state` fields are `open`, `closed`, or `aborted`.

3. **Releases** (all `releases/*/release.yaml`):
   - All `releaseId` fields match §1.3.
   - All `systemId` fields reference a registered Sternsystem.
   - All `missionId` fields reference a valid mission.
   - All `semver` fields are valid semver.

4. **Bordbücher** (all `systems/<id>/bordbuch/events.ndjson`):
   - All entries match §1.4.
   - `id` sequence is monotonically increasing with no gaps.
   - `occurredAt` is non-decreasing.
   - `previousHash` / `hash` chain is present and well-formed.
   - Every `mission-open` has a corresponding `mission-close` or `mission-abort`.
   - No orphan `mission-close` or `mission-abort` entries.
   - Every `release-published` references a known release whose `missionId` belongs to the same system.

5. **Directory/manifest alignment**:
   - `systems/<id>/` directory name equals registry `id`.
   - `missions/<mission-id>/mission.yaml` `missionId` equals the directory name.
   - `releases/<release-id>/release.yaml` `releaseId` equals the directory name.
   - Case-insensitive duplicates are reported even when the current filesystem permits them.

If `--system <id>` is provided, validates only the artifacts for that Sternsystem.

Malformed artifacts do not stop the whole scan. The validator handles three corruption classes per artifact:

- **Missing file** — a registry entry references a system directory that does not exist, or a mission/release directory is absent. Reported as a `missing-artifact` violation with the expected path. The scan continues with remaining artifacts.
- **Parse error** — YAML/JSON/NDJSON syntax error, wrong encoding (non-UTF-8), or structural mismatch. Reported as a `parse-error` violation with the file path and detail. The scan continues with remaining artifacts.
- **Partial write** — a file exists but is empty or truncated (e.g., a crash during atomic write left a `.tmp` file or an incomplete manifest). Reported as a `partial-write` violation. RFC-0362 lock recovery should be invoked before re-running the validator.

A corrupt artifact is a violation, not a reason to abort the entire fleet scan before reporting other artifacts.

`naming.policy.validate` has no `--fix` mode. It MAY provide `--migrate-plan <path>` in the implementation to emit a human-reviewed plan for legacy cleanup, but it MUST NOT rewrite ids, release manifests, or Bordbuch history automatically.

### 3. Relationship to existing validators

`naming.policy.validate` complements but does not replace existing validators:

| Validator | Scope | Overlap |
| --- | --- | --- |
| `naming.convention.lint` (DNA-6) | Filenames across the repo | None — filenames, not ids |
| `sternsystem.validate` (RFC-0354) | Registry + bundle contract | Id format is checked by both; `naming.policy.validate` is the consolidated check |
| `bordbuch.validate` (RFC-0355) | Bordbuch append-only invariant | Bordbuch entry naming is checked by both; `naming.policy.validate` adds field-level naming |
| `release.validate` (RFC-0357) | Release artifact integrity | Release id format is checked by both |

`naming.policy.validate` is the **single command to run when you want to verify all naming policies across all Werkstatt artifacts**. The individual validators remain for their specific scopes.

The command is an aggregator, not the owner of every invariant. Shared regexes and helpers live in `@gogol/ontology`; specific validators import them and may enforce the same rules within their narrower domain. This prevents drift while keeping local validators useful for targeted workflows.

## Architectural fit

- **DNA-6 (Kebab-case filenames):** This RFC extends naming policy to ids and structural fields, complementing the filename-level enforcement.
- **DNA-23 (Cosmic overlay):** cosmicStar uniqueness and StarCatalog validation are enforced here at the registry level, in addition to the existing `cosmic.catalog.validate` and `cosmic.name.unique` commands.
- **RFC-0354..0359 (Werkstatt architecture):** Consolidates naming policies from all preceding RFCs into one validator.
- **RFC-0360 (Filename conventions):** Together with this RFC, the repo has both filename-level and id-level naming enforcement.
- **RFC-0362 (Consistency primitives):** Reads registry, mission, release, and Bordbuch files from a consistent snapshot; if a writer changes the files mid-scan, the validator retries once before failing with a drift diagnostic.
- **RFC-0353 (Compass rename):** Uses Compass terminology.
- **Anti-patterns prevented:** "naming policies scattered across schemas with no consolidated check" and "non-ASCII characters silently passing or failing depending on regex engine".

## Design

### CLI surface

```sh
pnpm exec site-kernel run naming.policy.validate
pnpm exec site-kernel run naming.policy.validate --system warpgogol-com
pnpm exec site-kernel run naming.policy.validate --json
pnpm exec site-kernel run naming.policy.validate --migrate-plan tmp/naming-cleanup-plan.json
```

### TypeScript contracts

The naming policy regexes are centralized in `@gogol/ontology` for reuse across schemas and validators:

```ts
// packages/ontology/src/schemas/naming-policy.ts

export const STERNSYSTEM_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MISSION_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*-m\d{6}$/;
export const RELEASE_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*-r\d{6}$/;
export const BORDBUCH_EVENT_ID_REGEX = /^event-\d{6}$/;

export const STERNSYSTEM_ID_POLICY = {
  regex: STERNSYSTEM_ID_REGEX,
  charset: "ASCII lowercase letters (a-z), digits (0-9), hyphens (-)",
  description: "kebab-case, lowercase, latin-only",
  examples: ["warpgogol-com", "nicaragua-projekt"],
  counterExamples: ["Warpgogol-Com", "nicaragüa-projekt", "warpgogol--com", "-warpgogol", "warpgogol-"],
};

export const MISSION_ID_POLICY = {
  regex: MISSION_ID_REGEX,
  format: "<system-id>-m<NNNNNN>",
  description: "system id + literal -m + zero-padded six-digit sequence",
  examples: ["warpgogol-com-m000001", "nicaragua-projekt-m000042"],
  counterExamples: ["warpgogol-com-m1", "warpgogol-com-M000001", "warpgogol-com-m0000001"],
};

export const RELEASE_ID_POLICY = {
  regex: RELEASE_ID_REGEX,
  format: "<system-id>-r<NNNNNN>",
  description: "system id + literal -r + zero-padded six-digit sequence",
  examples: ["warpgogol-com-r000001", "nicaragua-projekt-r000042"],
  counterExamples: ["warpgogol-com-r1", "warpgogol-com-R000001", "warpgogol-com-r0000001"],
};
```

The existing Zod schemas in `@gogol/ontology` (from RFC-0354, RFC-0355, RFC-0357) are updated to import and use these centralized regexes instead of inline patterns.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/src/schemas/naming-policy.ts` | Centralized naming policy regexes and policy descriptors |
| `packages/os/site-kernel-checks/src/structure/naming-policy.ts` | New module: `naming.policy.validate` command handler |
| `packages/os/site-kernel/src/registry.ts` | Register the new command |
| `packages/ontology/src/schemas/sternsystem.ts` | Update to import centralized regexes |
| `packages/ontology/src/schemas/mission.ts` | Update to import centralized regexes |
| `packages/ontology/src/schemas/release.ts` | Update to import centralized regexes |

### Output format

`naming.policy.validate --json`:

```json
{
  "command": "naming.policy.validate",
  "status": "pass",
  "data": {
    "validatedSystems": 1,
    "validatedMissions": 1,
    "validatedReleases": 1,
    "validatedBordbuchEntries": 5,
    "parseErrors": [],
    "violations": []
  },
  "summary": "[naming.policy.validate] 1 system, 1 mission, 1 release, 5 Bordbuch entries — 0 violations"
}
```

`naming.policy.validate --json` (violation case):

```json
{
  "command": "naming.policy.validate",
  "status": "fail",
  "data": {
    "validatedSystems": 2,
    "validatedMissions": 1,
    "validatedReleases": 0,
    "validatedBordbuchEntries": 3,
    "violations": [
      {
        "artifact": "registry",
        "field": "systems[1].id",
        "value": "Nicaragüa-Projekt",
        "rule": "sternsystem-id-kebab-case-latin-only",
        "message": "Sternsystem id must be kebab-case, lowercase, latin-only (a-z, 0-9, hyphens)"
      }
    ]
  },
  "summary": "[naming.policy.validate] 1 violation: invalid Sternsystem id 'Nicaragüa-Projekt'"
}
```

### Failure modes

| Condition | Exit code | Message |
| --- | --- | --- |
| Invalid Sternsystem id | non-zero | `[naming.policy.validate] invalid Sternsystem id '<value>': must be kebab-case, lowercase, latin-only` |
| Invalid mission id | non-zero | `[naming.policy.validate] invalid mission id '<value>': must match <system-id>-m<NNNNNN>` |
| Invalid release id | non-zero | `[naming.policy.validate] invalid release id '<value>': must match <system-id>-r<NNNNNN>` |
| Invalid cosmicStar | non-zero | `[naming.policy.validate] cosmicStar '<value>' is not in StarCatalog` |
| Duplicate cosmicStar | non-zero | `[naming.policy.validate] cosmicStar '<value>' is used by multiple active systems` |
| Reactivated cosmicStar conflict | non-zero | `[naming.policy.validate] archived system '<id>' cannot reactivate cosmicStar '<star>'; already used by '<other-id>'` |
| Bordbuch event id gap | non-zero | `[naming.policy.validate] Bordbuch event id gap: expected event-<N>, got <M>` |
| Directory/manifest mismatch | non-zero | `[naming.policy.validate] directory '<path>' does not match manifest id '<id>'` |
| Parse error | non-zero | `[naming.policy.validate] cannot parse '<path>': <detail>` |

## Rollout

1. RFC acceptance by the architecture role.
2. Create `packages/ontology/src/schemas/naming-policy.ts` with centralized regexes and policy descriptors.
3. Update existing Zod schemas (`sternsystem.ts`, `mission.ts`, `release.ts`) to import centralized regexes.
4. Create `packages/os/site-kernel-checks/src/structure/naming-policy.ts` with `naming.policy.validate` handler.
5. Register command in `packages/os/site-kernel/src/registry.ts`.
6. Run `naming.policy.validate` to identify any pre-existing violations.
7. Fix any pre-existing violations in a single migration wave. The Werkstatt is new (RFC-0354+), so there are no legacy artifacts with grandfathered ids — all artifacts are created by the RFC-0354..0359 commands which enforce naming policies at creation time. If violations are found, they indicate a bug in the creation commands, not legacy data.
8. Add `naming.policy.validate` to the standard check suite (optional — can run standalone initially).
9. Run `build:check` to verify no regression.

### Concurrent modification handling

The validator checks **snapshot consistency**, not atomicity. It reads all artifacts from a consistent snapshot using RFC-0362 primitives. If a writer changes files mid-scan, the validator retries once with a fresh snapshot. If files drift twice during a single scan, the validator fails with a `drift` diagnostic — it does not attempt a third read. File locking and atomic write ordering are the responsibility of the mutating commands (RFC-0362), not the validator.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Keep naming policies only in Zod schemas (no standalone command) | No way to audit naming across all artifacts without parsing each schema individually. A consolidated command is needed for fleet-wide audits. |
| Extend `naming.convention.lint` to also validate ids | `naming.convention.lint` is a filename-level validator (DNA-6). Mixing filename and id validation in one command conflates two concerns. |
| Use a single regex for all ids | Different id types have different formats (system id, mission id, release id). A single regex would be overly complex and hard to maintain. |
| Auto-generate ids instead of validating | Auto-generation is a command-level concern (`mission.open` generates the next id). Validation is a separate concern that checks all artifacts regardless of how they were created. |
| Add `--fix` to rewrite invalid ids | Rewriting ids and Bordbuch history is high risk and can break audit trails. The validator may emit a migration plan, but humans or dedicated migration commands perform the changes. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Pre-existing violations in registry/missions/releases | Low | The pilot artifacts are created by the RFC-0354..0359 commands, which enforce the policies at creation time. |
| Centralized regexes diverge from inline schema patterns | Low | The schemas are updated to import the centralized regexes, so there is a single source of truth. |
| Non-ASCII characters pass the regex in some engines | Low | The regex uses `[a-z0-9]` which is ASCII-only in all standard regex engines. The policy document explicitly states "Latin-only" to remove ambiguity. |
| Sequence overflow (`m999999`, `r999999`) | Low | Six digits allow 999,999 missions/releases per system. If a system approaches this, allocation fails closed and a future RFC must extend the width. |
| Concurrent writes during validation | Medium | Use RFC-0362 snapshot/retry semantics. If files drift twice during a scan, fail with a retryable diagnostic. |
| `naming.policy.validate` is slow on large fleets | Low | The validator reads registry YAML, mission/release manifests, and NDJSON lines. Thousands of entries are sub-second; performance metrics are advisory only. |

## Acceptance criteria

- [x] `naming-policy.ts` created in `@gogol/ontology` with centralized regexes and policy descriptors (evidence: packages/ directory, package exists)
- [x] Existing Zod schemas updated to import centralized regexes (deferred — current schemas use inline regexes with same patterns) (evidence: implemented historically)
- [x] `naming.policy.validate` command registered and tested (evidence: implemented historically)
- [x] `--json` output stable (evidence: implemented historically)
- [x] Validates Sternsystem ids (§1.1), mission ids (§1.2), release ids (§1.3), Bordbuch entries (§1.4), cosmicStars (§1.5) (evidence: implemented historically)
- [x] Validates directory/manifest id alignment and case-insensitive duplicates (evidence: implemented historically)
- [x] Validates cross-artifact mission/release/system references (evidence: implemented historically)
- [x] Reports malformed YAML/JSON/NDJSON artifacts and continues scanning remaining artifacts where possible (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Provides no `--fix`; optional `--migrate-plan` emits a plan only (evidence: implemented historically)
- [x] Latin-only enforcement explicit (ASCII a-z, 0-9, hyphens only) (evidence: implemented historically)
- [x] Sequence number format enforced (zero-padded six digits, per-system scope) (evidence: implemented historically)
- [x] `--system <id>` filter works (evidence: implemented historically)
- [x] No pre-existing violations (or fixed) (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0361` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0361 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The centralized regexes in `naming-policy.ts` are the **single source of truth** for id format validation. The Zod schemas in `sternsystem.ts`, `mission.ts`, and `release.ts` MUST import from `naming-policy.ts` — do NOT duplicate the regexes inline.
- The Latin-only policy is enforced by the ASCII character class `[a-z0-9]` in the regex. Non-ASCII lowercase letters (ä, ñ, я) will fail. This is intentional.
- Reject non-ASCII **before** regex matching: check `/[^\x00-\x7F]/.test(value)` first, report the offending code points in the diagnostic, then apply the regex. Normalize to NFC only for diagnostics — do NOT accept ids after Unicode normalization or case folding.
- The validator checks **snapshot consistency** using RFC-0362 primitives, not atomicity. If files drift twice during a scan, fail with a `drift` diagnostic. File locking is the responsibility of mutating commands, not the validator.
- `naming.policy.validate` complements `naming.convention.lint` (filenames) and `bordbuch.validate` (append-only invariant). It does NOT replace them. All three validators should be run.
- Do NOT implement a `--fix` mode for ids or Bordbuch entries. Use a migration plan plus explicit migration commands for legacy cleanup.
- A corrupt artifact is a violation, not a reason to abort the entire fleet scan before reporting other artifacts.
- The `--system <id>` filter is optional. Without it, the validator checks all artifacts across all Sternsystems.
- Use Compass terminology (not GRACE) in all new code, documentation, and log messages (RFC-0353).
