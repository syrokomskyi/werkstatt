---
id: RFC-0667
title: "Axiom Audit ID Boundary Contract"
status: draft
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
reviewers: []
createdAt: 2026-08-03
updatedAt: 2026-08-03
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0665
  - RFC-0630
amendedBy: []
related:
  - DNA-48
  - DNA-59
  - RFC-0627
  - RFC-0629
  - RFC-0652
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-48
  - DNA-59
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
    - mission.check
    - axiom.report
    - leitstand.propagate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "evidence-metadata.json contains auditId (not missionId) after mission.check"
  - "axiom.report generates without TypeError on auditId field"
  - "leitstand.propagate reads auditId from evidence-metadata.json and matches release missionId"
nonGoals:
  - "Does not rename missionId to auditId in internal werkstatt interfaces — missionId remains the internal identifier"
  - "Does not change the external Axiom CLI (pipelines/) — that project has its own governance"
  - "Does not add new Site OS commands — only changes the contract of existing ones"
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

# RFC-0667: Axiom Audit ID Boundary Contract

## Context

The external Axiom CLI (in the `pipelines/` project) renamed `missionId` to `auditId` in its public API (RFC-0041 in the Axiom project). This rename affects:

1. **`evidence-metadata.json`** — the boundary file written by the external Axiom CLI now contains `auditId` instead of `missionId`.
2. **`LocalInstrumentContext`** — the external `@syrokomskyi/axiom-study` type now expects `auditId` in `toDeterministicContext`.
3. **`DeterministicInstrumentContext`** — the external type uses `validTimeStart` which must be an ISO 8601 UTC timestamp.

The werkstatt codebase had to adapt to these changes. During the adaptation, several bugs were discovered:

- `axiom-adapter.ts` read `evidence-metadata.json` and passed `metadata.auditId` to `escapeHtml()`, but the file still contained `missionId` (old format), causing `TypeError: Cannot read properties of undefined (reading 'replace')`.
- `leitstand.propagate` read `missionId` from `evidence-metadata.json` but the file now contains `auditId`, causing a mismatch with the release's `missionId`.
- All check modules (`cloudflare-assets.ts`, `consent.ts`, `fonts.ts`, etc.) called `toDeterministicContext` with `missionId`, but the external type now requires `auditId`.
- `validTimeStart` was set to `git:${commitSha}` instead of an ISO 8601 timestamp, causing all instruments to fail Zod validation with `invalid_format`.

## Problem

The boundary between werkstatt's internal `missionId` identifier and the external Axiom `auditId` identifier is not formalized. This caused four distinct failure modes:

1. **Adapter TypeError**: `axiom-adapter.ts` (`packages/os/site-kernel-checks/src/axiom-adapter.ts:349`) read `evidence-metadata.json` and accessed `metadata.auditId` directly. When the file contained the old `missionId` format, `auditId` was `undefined`, causing `escapeHtml(undefined)` to throw `TypeError: Cannot read properties of undefined (reading 'replace')` in `report.ts:121`.

2. **Propagate mismatch**: `leitstand.propagate` (`packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:1090`) read `missionId` from `evidence-metadata.json` and compared it to the release's `missionId`. After the external Axiom CLI started writing `auditId`, the comparison always failed, blocking ALT deployment.

3. **Instrument context type mismatch**: All check modules called `toDeterministicContext({ missionId: "..." })`, but the external `LocalInstrumentContext` type from `@syrokomskyi/axiom-study` was renamed to expect `auditId`. This caused TypeScript build failures.

4. **ValidTimeStart format violation**: `buildInstrumentContext` in `orchestrator.ts` set `validTimeStart` to `git:${commitSha}` when a commit SHA was provided. The Zod schema `utcTimestampSchema` requires `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$`. All 7 instruments failed validation, producing 0 observations, which cascaded to `observationBundleIds: too_small` in `studyRunSchema.parse`.

## Decision

The werkstatt codebase uses a **boundary adapter pattern** for the `missionId` ↔ `auditId` mapping: `missionId` remains the internal identifier in werkstatt function parameters, mission state, and release state; `auditId` is the external identifier in evidence-metadata.json, `LocalInstrumentContext`, and other external Axiom types. The mapping happens exclusively at the boundary in `axiom-adapter.ts`. The adapter MUST be resilient to both `auditId` and `missionId` formats in evidence-metadata.json.

## Architectural fit

- **DNA-48 (Release discipline)**: `leitstand.propagate` is the gate between `dev` and `alt` channels. It reads `auditId` from `evidence-metadata.json` and compares it to the release's `missionId`. This contract formalizes that comparison.
- **DNA-59 (Evidence preservation)**: `evidence-metadata.json` is the boundary file between werkstatt and the R2 archive. Its schema must be stable and well-defined.
- **RFC-0665**: Amended — `evidence-metadata.json` schema now uses `auditId` instead of `missionId`.
- **RFC-0630**: Amended — `mission.check` writes `auditId` to evidence-metadata.json via the external Axiom CLI.
- **RFC-0627**: Related — `leitstand.dev-deploy` calls `mission.check` which produces the evidence.
- **RFC-0629**: Related — native Axiom capsules use `auditId` in the external contract.
- **RFC-0652**: Related — evidence lifecycle integration with mission close reads `auditId`.

## Design

### Boundary adapter pattern

The `missionId` ↔ `auditId` mapping follows a strict boundary adapter pattern:

| Layer | Identifier | Where |
| --- | --- | --- |
| Internal werkstatt | `missionId` | Function parameters, mission state, release state, leitstand commands |
| Boundary file | `auditId` | `evidence-metadata.json` (written by external Axiom CLI) |
| External Axiom types | `auditId` | `LocalInstrumentContext`, `toDeterministicContext`, `DeterministicInstrumentContext` |
| Boundary adapter | maps both | `axiom-adapter.ts` — `runAxiomCheck` and `runAxiomReport` |

### CLI surface

No new CLI commands. Existing commands changed:

```sh
# mission.check — passes --mission <missionId> to external Axiom CLI
# External CLI writes auditId to evidence-metadata.json
pnpm exec site-kernel run mission.check --mission warpgogol-com-m000027 --external-preview

# axiom.report — reads evidence-metadata.json, maps auditId ↔ missionId
pnpm exec site-kernel run axiom.report --mission warpgogol-com-m000027

# leitstand.propagate — reads auditId from evidence-metadata.json, compares to release missionId
pnpm exec site-kernel run leitstand.propagate --system warpgogol-com
```

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/axiom-adapter.ts

// Internal EvidenceMetadata (boundary file schema)
interface EvidenceMetadata {
  auditId: string;         // external identifier (was missionId)
  commitSha?: string;
  runTimestamp?: string;
  methodologies?: Array<{ id: string; digest?: string | DigestRef | null; blockOn?: string[] }>;
}

// Boundary mapping in runAxiomReport
function readEvidenceMetadata(evidenceDir: string, missionId: string): EvidenceMetadata {
  const raw = JSON.parse(readFileSync(join(evidenceDir, "evidence-metadata.json"), "utf-8"));
  return {
    auditId: raw.auditId ?? raw.missionId ?? missionId,  // resilient fallback
    commitSha: raw.commitSha,
    runTimestamp: raw.runTimestamp,
    methodologies: raw.methodologies,
  };
}

// packages/os/site-kernel-handoff/src/evidence/evidence-fetch.ts
// packages/os/site-kernel-handoff/src/evidence/evidence-sync.ts
interface EvidenceMetadata {
  auditId: string;  // not missionId — matches external Axiom format
  commitSha?: string;
  runTimestamp?: string;
  methodologies?: unknown[];
}

// packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
// leitstand.propagate reads auditId, compares to release.missionId
const evidenceAuditId = metadata.auditId ?? metadata.missionId;
if (evidenceAuditId !== release.missionId) {
  throw new Error(`evidence auditId mismatch: ${evidenceAuditId} !== ${release.missionId}`);
}
```

### Check modules and toDeterministicContext

Check modules (`cloudflare-assets.ts`, `consent.ts`, `fonts.ts`, `independent-qa.ts`, `lighthouse.ts`, `sitemap-images.ts`) call `toDeterministicContext` from `@syrokomskyi/axiom-study`. This is an **external Axiom type** that expects `auditId`. The check modules are on the external side of the boundary — they produce instrument context for the external Axiom study pipeline.

The `auditId` value in check modules is an **instrument-specific identifier** (e.g. `"cloudflare.assets.validate"`), not the mission's audit ID. This is correct: each instrument run has its own audit identifier within the study run.

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<missionId>/evidence/axiom/evidence-metadata.json` | Boundary file: written by external Axiom CLI with `auditId`, read by `axiom-adapter.ts` and `leitstand.propagate` |
| `packages/os/site-kernel-checks/src/axiom-adapter.ts` | Boundary adapter: maps `missionId` ↔ `auditId` |
| `packages/os/site-kernel-handoff/src/evidence/evidence-fetch.ts` | Evidence sync: reads `auditId` from evidence-metadata.json |
| `packages/os/site-kernel-handoff/src/evidence/evidence-sync.ts` | Evidence sync: `EvidenceMetadata` interface uses `auditId` |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | `leitstand.propagate`: reads `auditId`, compares to release `missionId` |
| `packages/os/site-kernel-checks/src/{cloudflare-assets,consent,fonts,independent-qa,lighthouse,sitemap-images}.ts` | Check modules: call `toDeterministicContext` with `auditId` (external Axiom contract) |

### Failure modes

1. **Old evidence-metadata.json with `missionId`**: The adapter falls back to `raw.missionId` and then to the provided `missionId` parameter. This ensures backward compatibility with evidence files produced by older versions of the external Axiom CLI.

2. **Missing evidence-metadata.json**: The adapter defaults to `{ auditId: missionId }` using the provided mission ID. This allows `axiom.report` to generate even if the metadata file is missing.

3. **`auditId` mismatch in `leitstand.propagate`**: If `evidence-metadata.json` contains `auditId` that does not match the release's `missionId`, propagate fails with a clear error message indicating the mismatch.

## Rollout

- **Already implemented**: All code changes are in place — `axiom-adapter.ts`, `evidence-fetch.ts`, `evidence-sync.ts`, `leitstand-commands.ts`, and all check modules use `auditId`.
- **Test fixtures updated**: All test files that write mock `evidence-metadata.json` now use `auditId` instead of `missionId`.
- **Backward compatibility**: The adapter's `raw.auditId ?? raw.missionId ?? missionId` fallback ensures old evidence files still work.
- **No migration needed**: Existing evidence files with `missionId` are handled by the fallback chain.
- **Future evidence files**: Will contain `auditId` as written by the external Axiom CLI.

## Alternatives considered

1. **Full rename `missionId` → `auditId` in all werkstatt interfaces**: Rejected. `missionId` is a fundamental concept in werkstatt's mission lifecycle (DNA-46). Renaming it would break dozens of interfaces, commands, and state files for no benefit — the external Axiom rename does not require an internal werkstatt rename.

2. **No adapter, direct `auditId` everywhere**: Rejected. This would couple werkstatt internals to external Axiom's naming choices. If Axiom renames `auditId` again, werkstatt would need to change all internal code. The boundary adapter pattern isolates this.

3. **Wrapper type in `axiom-study` that accepts both**: Rejected. This would require changing the external Axiom package, which has its own governance. The adapter pattern is cleaner — werkstatt owns the boundary.

## Risks

- **Stale fallback**: The `raw.missionId` fallback in the adapter could mask a real missing-`auditId` bug in the external Axiom CLI. Mitigation: the fallback chain is `raw.auditId ?? raw.missionId ?? missionId` — if `auditId` is missing, `missionId` is used, which is the same value. No data loss.
- **External Axiom changes `auditId` again**: If the external Axiom CLI renames `auditId` to something else, the adapter will need updating. This is expected — the boundary adapter is the single point of change.
- **Agent confusion**: Agents reading check modules might wonder why `auditId` is used instead of `missionId`. The `nonGoals` section and this RFC's Design section explain the boundary pattern.
- **Test fixture drift**: Test files that write mock `evidence-metadata.json` must use `auditId`. If agents write new tests with `missionId`, the fallback will handle it, but tests should use the current format.

## Acceptance criteria

- [x] `axiom-adapter.ts` maps `raw.auditId ?? raw.missionId ?? missionId` when reading `evidence-metadata.json` (evidence: `packages/os/site-kernel-checks/src/axiom-adapter.ts:349-355`)
- [x] `EvidenceMetadata` interface in `evidence-fetch.ts` uses `auditId` (evidence: `packages/os/site-kernel-handoff/src/evidence/evidence-fetch.ts:55-59`)
- [x] `EvidenceMetadata` interface in `evidence-sync.ts` uses `auditId` (evidence: `packages/os/site-kernel-handoff/src/evidence/evidence-sync.ts:48-57`)
- [x] `leitstand.propagate` reads `auditId` from `evidence-metadata.json` and compares to release `missionId` (evidence: `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:1090-1129`)
- [x] All check modules use `auditId` in `toDeterministicContext` calls (evidence: `cloudflare-assets.ts:83-103`, `consent.ts:125-145`, `fonts.ts:219-239`, `independent-qa.ts:396-416`, `lighthouse.ts:374-394`, `sitemap-images.ts:199-219`)
- [x] All test fixtures use `auditId` in mock `evidence-metadata.json` (evidence: `evidence-sync-fetch.test.ts:160-164`, `rfc-0652-mission-close-evidence-sync.test.ts:138-142`, `leitstand-0608-propagate-channel-removed.test.ts:193-213`, `rfc-0652-mission-cleanup-evidence-retention.test.ts:71-91`, `evidence-integration.test.ts:52-72`)
- [x] `axiom.report` generates without `TypeError` on `auditId` field (evidence: `mission-check8.log` — `[OK] axiom.report: generated report.html — 80 finding(s), closure satisfied`)
- [x] `mission.check` produces evidence-metadata.json with `auditId` (evidence: `missions/warpgogol-com-m000027/evidence/axiom/evidence-metadata.json` — `auditId: warpgogol-com-m000027`)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0667` — 0 errors after V-27 fix)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken the boundary adapter pattern — `missionId` is internal, `auditId` is external, mapping happens in `axiom-adapter.ts`.
- Agents MUST NOT remove the `raw.auditId ?? raw.missionId ?? missionId` fallback chain — it ensures backward compatibility with old evidence files.
- When writing new test fixtures that include `evidence-metadata.json`, agents MUST use `auditId` (not `missionId`) as the JSON key.
- When adding new check modules that call `toDeterministicContext`, agents MUST use `auditId` (not `missionId`) as the parameter name, matching the external `LocalInstrumentContext` contract.
- If the external Axiom CLI changes the `auditId` field name again, agents MUST update only `axiom-adapter.ts` — not internal interfaces.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
