---
id: RFC-0491
title: "Enforce rfc.create as the only sanctioned path for RFC creation and fix spec.materialize archive scanning"
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
createdAt: 2026-07-22
updatedAt: 2026-07-22
enhancedAt: 2026-07-22
implementedAt: 2026-07-22
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0001
  - RFC-0329
  - RFC-0366
  - RFC-0396
  - RFC-0478
  - RFC-0479
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-53
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
    - rfc.next-id
  added:
    - rfc.next-id
  changed:
    - spec.materialize
    - rfc.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@wgogol/forge"
successSignals:
  - "Agents never manually determine RFC numbers by listing files or running ls/find — they call rfc.create or rfc.next-id which scans the full docs/rfcs/ tree recursively including archive/."
  - "rfc.next-id returns the next free RFC number (max existing + 1) by scanning all rfc-*.md files recursively under docs/rfcs/, including archive/ subdirectories."
  - "spec.materialize uses the shared listRfcFiles from frontmatter-io.ts (recursive scan) instead of its own non-recursive fs.readdir, eliminating the risk of duplicate or non-monotonic RFC ids when archived RFCs have higher numbers."
  - "AGENTS.md explicitly instructs agents to use rfc.create (or rfc.next-id for number-only queries) before creating any RFC file, and prohibits manual number determination."
  - "V-02 duplicate-id error message continues to mention archive scanning as a recovery hint, but the primary prevention is the agent instruction + rfc.create / rfc.next-id."
  - "No RFC file created after this RFC's implementation has a duplicate or non-monotonic id relative to the full tree (including archive)."
nonGoals:
  - "Does not change the RFC template, required sections, or frontmatter schema."
  - "Does not change V-28 (monotonicity) or V-02 (duplicate id detection) logic — these remain as post-hoc safety nets. V-31 is additive, not a modification of V-02."
  - "Does not add a pre-commit hook or git hook for RFC number validation — the contract is enforced through agent instructions and command design, not git hooks."
  - "Does not merge spec.materialize's RFC creation logic into rfc.create — spec.materialize has spec-specific scaffolding (specRef, node binding) that rfc.create does not need."
  - "Does not change the rfc.create flag surface (--title, --kind, --scope, --satisfies) — these are already sufficient."
  - "Does not add a registry or database of RFC numbers — the filesystem is the single source of truth, scanned recursively."
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

# RFC-0491: Enforce rfc.create as the only sanctioned path for RFC creation and fix spec.materialize archive scanning

## Context

RFC-0001 introduced the RFC governance process with `rfc.create` as the command for scaffolding new RFC drafts. `rfc.create` uses `listRfcFiles` from `frontmatter-io.ts` which recursively scans `docs/rfcs/` including subdirectories (`archive/implemented/`, `archive/superseded/`). This ensures the next RFC number is always `max(all existing numbers) + 1`, where "all" includes archived RFCs.

RFC-0396 introduced `spec.materialize` which scaffolds RFC files from vendored spec nodes. `spec.materialize` has its own local `listRfcFiles` function (`packages/forge/os/spec/spec-materialize.ts:71-75`) that uses `fs.readdir` without recursion — it scans only the top-level `docs/rfcs/` directory and misses `archive/` subdirectories.

The V-02 validation rule (duplicate id detection) already includes a hint message that references this exact failure mode: "This happens when an RFC is created by scanning only the top-level docs/rfcs/ directory, missing archived RFCs under docs/rfcs/archive/." This confirms the problem is known and has occurred before.

Despite `rfc.create` being available since RFC-0001, AI agents (including this session's agent) have been observed creating RFC files manually — writing the file from scratch, determining the RFC number by running `ls docs/rfcs/ | tail` or `find docs/rfcs -name 'rfc-*.md'` without scanning `archive/`. This bypasses the deterministic number assignment that `rfc.create` provides.

## Problem

Four gaps leave RFC id assignment vulnerable to human and agent error:

1. **`spec.materialize` does not scan `archive/`.** The local `listRfcFiles` in `spec-materialize.ts:71-75` uses `fs.readdir` (non-recursive). If archived RFCs have higher numbers than active RFCs, `spec.materialize` will compute `maxId` from the top-level only and may create an RFC with a number that duplicates or falls below an archived RFC. This breaks V-28 (monotonicity) and V-02 (uniqueness).

2. **No `rfc.next-id` command.** Agents that need to know the next free RFC number (e.g. for planning, for referencing in other documents, or for manual file creation) have no deterministic command to call. They resort to `ls`, `find`, or `grep` which are error-prone if the agent does not include `archive/` in the scan.

3. **No agent instruction in AGENTS.md.** The root `AGENTS.md` does not explicitly instruct agents to use `rfc.create` for RFC creation or prohibit manual number determination. The RFC governance protocol section references `rfc.create` as a command but does not state "agents MUST use rfc.create and MUST NOT determine RFC numbers manually." This leaves the contract to agent discretion.

4. **V-02 checks frontmatter `id` uniqueness, not filename-number uniqueness.** V-02 detects two RFCs with the same `id: RFC-0490` in frontmatter. But it does not detect:
   - Two files with the same numeric prefix but different frontmatter ids (e.g. `rfc-0490-foo.md` with `id: RFC-0491` and `rfc-0490-bar.md` with `id: RFC-0492`). The filename numbers are duplicated but V-02 sees different ids.
   - A file whose numeric prefix does not match its frontmatter id (e.g. `rfc-0490-foo.md` with `id: RFC-0488`). This is a filename/id mismatch that V-01 (id format) and V-02 (id uniqueness) do not catch.

   These gaps mean an RFC file can exist with a duplicate or mismatched filename number and pass `rfc.validate` without errors.

## Decision

Four changes close the gaps:

1. **Add `rfc.next-id` command** to the `forgeRfcModule`. The command scans all `rfc-*.md` files recursively under `docs/rfcs/` (using the shared `listRfcFiles`), extracts the numeric suffix from each filename, and returns `max + 1` as the next free RFC number. It does not create a file — it is a read-only query.

2. **Fix `spec.materialize`** to use the shared `listRfcFiles` from `frontmatter-io.ts` instead of its own non-recursive local copy. The local `listRfcFiles` function in `spec-materialize.ts` is deleted; the import from `../rfc/frontmatter-io.ts` replaces it.

3. **Add validation rule V-31** to `rfc.validate`: filename-number uniqueness and filename/id consistency. V-31 checks that (a) the numeric prefix of each RFC filename is unique across the full tree (including `archive/`), and (b) the numeric prefix of the filename matches the frontmatter `id`. This closes the gap where V-02 only checks frontmatter `id` uniqueness but not filename-number uniqueness or filename/id alignment.

4. **Update AGENTS.md** with an explicit agent instruction in the RFC governance protocol section: agents MUST use `rfc.create` (or `rfc.next-id` for number-only queries) before creating any RFC file. Agents MUST NOT determine RFC numbers manually by listing files, running `ls`/`find`/`grep`, or guessing. V-28, V-02, and V-31 are post-hoc safety nets, not substitutes for calling the command.

## Architectural fit

- **DNA-53 (Semantic fingerprint governance):** this RFC does not change fingerprint logic, but it protects the integrity of RFC ids which are inputs to the fingerprint system. Non-monotonic or duplicate RFC ids would corrupt the RFC-to-fingerprint mapping.
- **RFC-0001 (RFC governance process):** `rfc.create` was introduced by RFC-0001. This RFC extends the governance by adding `rfc.next-id` and enforcing `rfc.create` as the only sanctioned path.
- **RFC-0329 (decision log consultation):** `rfc.create` already consults the decision log before scaffolding. `rfc.next-id` does not need decision log consultation — it is a pure number query.
- **RFC-0366 (ADR retirement):** ADRs use a separate numbering scheme (`adr-NNNN`) and are not affected by this RFC.
- **RFC-0396 (spec.materialize):** this RFC fixes a bug in `spec.materialize`'s file scanning. The fix is minimal: replace the local `listRfcFiles` with the shared one.
- **RFC-0478 (platform versioning):** this RFC changes `packages/forge` source. `versionBump: patch` — the change is safe (bug fix + new read-only command, no schema or contract break).
- **RFC-0479 (migrator registry):** no migrator needed — this RFC does not change data contracts. The `spec.materialize` fix is a code fix, not a data migration.
- **Site OS operator model:** `rfc.next-id` is a workspace-scoped command in the `forgeRfcModule`. It does not run in build pipelines — it is an on-demand query for agents and operators.

## Design

### CLI surface

```sh
# Read-only query: get the next free RFC number
pnpm exec site-kernel run rfc.next-id

# JSON output for agent consumption
pnpm exec site-kernel run rfc.next-id --json

# Create an RFC (existing command, unchanged)
pnpm exec site-kernel run rfc.create --title "Short title" --kind architecture --satisfies DNA-24
```

`rfc.next-id` takes no flags (except `--json` for output format). It is workspace-scoped — it always scans `docs/rfcs/` relative to the workspace root.

### TypeScript contracts

```ts
export interface RfcNextIdResult {
  command: "rfc.next-id";
  nextId: string;       // e.g. "RFC-0492"
  nextNumber: number;   // e.g. 492
  maxExistingId: string; // e.g. "RFC-0491"
  scannedFiles: number;  // total rfc-*.md files scanned (including archive)
}
```

The command reuses the existing `listRfcFiles` from `frontmatter-io.ts`:

```ts
// Already exists — no change needed:
export async function listRfcFiles(rfcDirPath: string): Promise<string[]>
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/os/rfc/handlers/list-create.ts` | Add `runRfcNextId` handler (read-only query) |
| `packages/forge/os/rfc/rfc.module.ts` | Register `rfc.next-id` command |
| `packages/forge/os/rfc/types.ts` | Add `RfcNextIdResult` type |
| `packages/forge/os/spec/spec-materialize.ts` | Delete local `listRfcFiles`, import shared one from `../rfc/frontmatter-io.ts` |
| `packages/forge/os/rfc/handlers/validate-rules.ts` | Add V-31: filename-number uniqueness + filename/id consistency check |
| `AGENTS.md` | Add agent instruction: MUST use rfc.create / rfc.next-id, MUST NOT determine numbers manually |

### Output format

```json
{
  "command": "rfc.next-id",
  "nextId": "RFC-0492",
  "nextNumber": 492,
  "maxExistingId": "RFC-0491",
  "scannedFiles": 537
}
```

### Failure modes

`rfc.next-id` has no failure modes beyond filesystem errors (e.g. `docs/rfcs/` does not exist). If no RFC files are found, it returns `nextId: "RFC-0001"`, `nextNumber: 1`, `maxExistingId: "none"`, `scannedFiles: 0`.

The `spec.materialize` fix has no new failure modes — the shared `listRfcFiles` has the same signature and return type as the local one, with the only difference being recursive scanning.

V-31 has two sub-checks, both reported as errors:

- **Duplicate filename number:** two files with the same numeric prefix (e.g. `rfc-0490-foo.md` and `rfc-0490-bar.md`). Message: `Duplicate filename number 0490 — also in <other-file>`.
- **Filename/id mismatch:** the numeric prefix of the filename does not match the frontmatter `id` (e.g. `rfc-0490-foo.md` with `id: RFC-0488`). Message: `Filename number 0490 does not match frontmatter id RFC-0488`.

## Rollout

1. **Add `rfc.next-id`**: implement `runRfcNextId` in `list-create.ts`, register in `rfc.module.ts`, add type to `types.ts`.
2. **Fix `spec.materialize`**: delete the local `listRfcFiles` in `spec-materialize.ts`, add import from `../rfc/frontmatter-io.ts`.
3. **Add V-31 to `rfc.validate`**: implement filename-number uniqueness and filename/id consistency checks in `validate-rules.ts`. The check iterates all parsed RFC files (already available via the `allParsed` map keyed by RFC id, or equivalently `allParsedByFile` keyed by filename — both contain the same data), extracts the numeric prefix from each filename, and flags duplicates and mismatches. A pre-implementation scan of all 477 existing RFC files (including `archive/implemented/` and `archive/superseded/`) confirmed zero filename/id mismatches and zero duplicate filename numbers, so V-31 can safely apply to all RFCs without a cutoff date.
4. **Update AGENTS.md**: add the agent instruction to the RFC governance protocol section.
5. **Regenerate generated documentation**: run `pnpm exec site-kernel run command.manifest.generate`, `pnpm exec site-kernel run docs.commands.generate`, and `pnpm exec site-kernel run ecosystem.manifest.generate` to sync the new `rfc.next-id` command into `docs/command-manifest.generated.yaml`, `docs/COMMANDS.md`, and `docs/ecosystem.generated.yaml`.
6. **No migration needed**: the `spec.materialize` fix is a code change, not a data migration. Existing RFC files are unaffected.
7. **No pipeline integration**: `rfc.next-id` is an on-demand query, not a build pipeline step. V-28, V-02, and V-31 remain as post-hoc validators in `rfc.validate`.

## Alternatives considered

- **Add a pre-commit hook that validates RFC numbers.** Rejected — the WGogol platform does not use git hooks for contract enforcement (contracts are enforced through commands and agent instructions). A pre-commit hook would be a new pattern that requires CI setup and is bypassed by `--no-verify`.

- **Make `rfc.create` the only way to create RFC files (block manual creation).** Rejected — there is no mechanism to block manual file creation in a monorepo. The contract is enforced through AGENTS.md instructions and post-hoc validation (V-02, V-28), not through filesystem permissions.

- **Merge `spec.materialize`'s RFC creation into `rfc.create`.** Rejected — `spec.materialize` has spec-specific scaffolding (specRef traceability, node binding, amendment resolution) that `rfc.create` does not need. The fix is to share the file-scanning function, not to merge the creation logic.

- **Add a `--dry-run` flag to `rfc.create` instead of a separate `rfc.next-id` command.** Rejected — `rfc.create --dry-run` would still require a `--title` flag, which the agent may not have yet. `rfc.next-id` is a pure number query with no prerequisites. It is also useful for referencing future RFC numbers in other documents (e.g. "this will be RFC-NNNN") before the RFC is created.

- **Scan only active RFCs (not archive) for `rfc.next-id`.** Rejected — this is the exact bug that `spec.materialize` has. Archived RFCs occupy number space and must be included in the max calculation to prevent duplicates and non-monotonic ids.

- **Add a `--next-id` flag to `rfc.list` instead of a separate command.** Rejected — `rfc.list` returns a list of RFC entries (id, title, status, kind, scope, owners, dates, file). `rfc.next-id` returns a single number. The semantic distinction is strong: `rfc.next-id` is a pure scalar query with no filtering, no entry parsing, and a minimal result type (`RfcNextIdResult` with 5 fields vs. `RfcListResult` with an entries array). Adding `--next-id` to `rfc.list` would conflate two different output shapes behind one command and require conditional return-type logic in the handler. A separate command keeps each handler focused.

## Risks

- **Agent non-compliance.** Agents may still create RFC files manually despite the AGENTS.md instruction. Mitigated by V-02 (duplicate detection) and V-28 (monotonicity) as post-hoc safety nets. The instruction reduces the frequency; the validators catch the remainder.

- **`spec.materialize` behavior change.** The fix changes `spec.materialize` to scan recursively, which may find higher numbers in `archive/` than before. This could cause `spec.materialize` to assign higher RFC numbers than it previously did. This is correct behavior — the previous behavior was the bug. No existing data is affected because RFC numbers are never reused.

- **`rfc.next-id` race condition.** Two agents calling `rfc.next-id` simultaneously get the same number. This is not a real risk — RFC creation is a low-frequency, human-supervised operation. If it ever becomes a concern, a file lock can be added later.

- **Performance.** `rfc.next-id` scans all `rfc-*.md` files recursively. With ~500 RFCs, this is <100ms. Not a concern.

## Acceptance criteria

- [x] `runRfcNextId` handler is implemented in `packages/forge/os/rfc/handlers/list-create.ts`. (evidence: packages/forge/os/rfc/handlers/list-create.ts:255-292, rfc.next-id --json returns RFC-0492)
- [x] `rfc.next-id` command is registered in `packages/forge/os/rfc/rfc.module.ts`. (evidence: packages/forge/os/rfc/rfc.module.ts:97-106, command.manifest.generated.yaml contains rfc.next-id)
- [x] `RfcNextIdResult` type is defined in `packages/forge/os/rfc/types.ts`. (evidence: packages/forge/os/rfc/types.ts:367-373)
- [x] `rfc.next-id` scans `docs/rfcs/` recursively (including `archive/`) via the shared `listRfcFiles`. (evidence: packages/forge/os/rfc/handlers/list-create.ts:262 calls listRfcFiles from frontmatter-io.ts which scans recursively, frontmatter-io.test.ts verifies archive scanning)
- [x] `rfc.next-id --json` returns `{ command, nextId, nextNumber, maxExistingId, scannedFiles }`. (evidence: rfc.next-id --json output verified — nextId: RFC-0492, nextNumber: 492, maxExistingId: RFC-0491, scannedFiles: 477)
- [x] `rfc.next-id` returns `RFC-0001` when no RFC files exist. (evidence: packages/forge/os/rfc/handlers/list-create.ts:276 — maxId=0 yields nextId=RFC-0001, maxExistingId="none")
- [x] The local `listRfcFiles` in `packages/forge/os/spec/spec-materialize.ts` is deleted. (evidence: packages/forge/os/spec/spec-materialize.ts — local function removed, grep confirms no local definition)
- [x] `spec.materialize` imports `listRfcFiles` from `../rfc/frontmatter-io.ts`. (evidence: packages/forge/os/spec/spec-materialize.ts:33)
- [x] `spec.materialize` scans `archive/` recursively (verified by a test with an archived RFC having a higher number than active RFCs). (evidence: packages/forge/os/rfc/frontmatter-io.test.ts:8-28 — test creates archive/implemented/rfc-0500-archived.md and verifies listRfcFiles finds it)
- [x] V-31 is implemented in `packages/forge/os/rfc/handlers/validate-rules.ts`. (evidence: packages/forge/os/rfc/handlers/validate-rules.ts:750-781)
- [x] V-31 detects duplicate filename numbers across the full tree (including `archive/`). (evidence: packages/forge/os/rfc/handlers/validate-rules.test.ts:264-281 — test verifies duplicate detection)
- [x] V-31 detects filename/id mismatches (filename numeric prefix != frontmatter id). (evidence: packages/forge/os/rfc/handlers/validate-rules.test.ts:241-261 — test verifies mismatch detection)
- [x] `AGENTS.md` includes an explicit instruction that agents MUST use `rfc.create` or `rfc.next-id` and MUST NOT determine RFC numbers manually. (evidence: AGENTS.md:286 — RFC-0491 paragraph in RFC governance protocol section)
- [x] `rfc.validate RFC-0491` passes. (evidence: rfc.validate RFC-0491 --json returns status: pass, 0 violations)
- [x] `pnpm --filter @wgogol/forge build:check` passes. (evidence: tsc --noEmit exits 0, 155 tests pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST use `rfc.create` to scaffold new RFC files. Agents MUST NOT create RFC files by manually copying the template and determining the number.
- Agents MAY use `rfc.next-id` for read-only number queries (e.g. when referencing a future RFC number in a document or plan).
- Agents MUST NOT determine RFC numbers by running `ls`, `find`, `grep`, or any manual file-listing command. V-28 and V-02 are post-hoc safety nets, not substitutes for calling the command.
- The `spec.materialize` fix is a one-line import change — delete the local `listRfcFiles`, import the shared one. Do not refactor anything else in `spec-materialize.ts`.
- When implementing, reference RFC-0491 in commit messages.
