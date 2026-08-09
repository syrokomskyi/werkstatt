---
id: RFC-0650
title: "Evidence preservation with R2 archive topology"
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
createdAt: 2026-08-02
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt: 2026-08-02
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - DNA-52
  - RFC-0629
  - RFC-0630
  - RFC-0649
  - RFC-0628
  - RFC-0574
  - RFC-0363
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
  - DNA-52
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
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "evidence-metadata.json includes runTimestamp field in ISO 8601 UTC filesystem-safe format"
  - "mission.check accepts optional --run-timestamp flag for explicit timestamp specification"
  - "R2 bucket layout, lifecycle rules, and Data Catalog schema documented in packages/os/site-kernel-handoff/AGENTS.md"
nonGoals:
  - "Does not define the evidence.sync or evidence.fetch commands — those are RFC-0651"
  - "Does not integrate evidence sync into mission.close or leitstand.dev-deploy — that is RFC-0652"
  - "Does not implement deduplication — content-addressed storage is explicitly rejected for simplicity"
  - "Does not change local evidence directory structure — local evidence remains ephemeral (latest run only)"
  - "Does not archive non-Axiom evidence (close-report.json, validation-report.json) — those are separate concerns"
  - "Does not use Git LFS or any Git-based storage for evidence — Git is not suited for 153 MB binary artifacts per run"
  - "Does not replicate R2 data to a secondary S3-compatible provider — single R2 bucket is sufficient for the current scale"
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

# RFC-0650: Evidence preservation with R2 archive topology

## Context

`mission.check` (RFC-0629, RFC-0630) generates Axiom evidence artifacts in `missions/{mission}/evidence/axiom/` on each run: `study-run.json` (~6 MB), `observation-bundle.json` (~7 MB), `staged-capsule.json` (~60 KB), `evidence-metadata.json` (~43 B), and `raw/` (~153 MB screenshots + axe JSON). Additionally, `axiom.report` (RFC-0633) generates `report.html` (~5 MB) in the same directory after `mission.check` completes — `leitstand.dev-deploy` auto-invokes it. Total per run: ~172 MB.

These artifacts are **ephemeral**:

1. `mission.check` cleans stale evidence before each run (`mission-check.ts:583-591`) — JSON files and `raw/` are deleted and regenerated.
2. The entire `missions/` directory is gitignored (`.gitignore:266`) — evidence is not in any Git repository.
3. `mission.cleanup` preserves evidence on disk (`mission-cleanup.ts:79`) but does not back it up.
4. `mission.close` adds a `workpiece.git-bundle` to `evidence/` but does not archive Axiom evidence.

The result: only the latest run's evidence exists locally. There is no cross-run history, no remote backup, and no way to query past results. If the operator needs to compare findings between runs or inspect a past run's screenshots, the data is gone.

DNA-52 (Release artifact store) established the pattern of durable, content-addressed records in the Werkstatt artifact store for release `dist` artifacts. Axiom evidence deserves the same treatment — it is the verification record that gates deployment decisions (DNA-49, RFC-0649).

## Problem

DNA-46 (Mission lifecycle) defines the mission as an ephemeral lifecycle container with evidence, but does not specify evidence preservation beyond the mission's lifetime. DNA-52 (Release artifact store) covers release `dist` artifacts but not Axiom evidence. Three gaps exist:

1. **No cross-run history**: `mission.check` overwrites evidence on each run (`mission-check.ts:583-591`). The operator cannot compare findings between runs or track regression trends over time.

2. **No off-site durability**: Evidence exists only on the local filesystem. A disk failure or accidental `mission.cleanup` destroys all evidence permanently. The gitignored `missions/` directory is not in any Git repo or remote backup.

3. **No queryable index**: Even if evidence were preserved, there is no way to query run metadata (findings count, commit SHA, closure status) without downloading and parsing each run's JSON files. The operator cannot ask "show me all runs for mission X sorted by findings count" without manual scripting.

The combination of these gaps means Axiom evidence — the verification record that gates dev deploys (RFC-0628, RFC-0649) and release propagation (DNA-49) — is treated as disposable when it should be treated as a durable audit trail.

## Decision

Axiom evidence is preserved as an append-only archive in Cloudflare R2 (S3-compatible object storage) with timestamped keys. Each `mission.check` run produces a unique prefix `axiom-evidence/{systemId}/{missionId}/{runTimestamp}/` containing all evidence artifacts. Raw artifacts (`raw/`) are subject to R2 lifecycle rules that transition them to Infrequent Access storage after 7 days. R2 Data Catalog (managed Apache Iceberg) provides a queryable metadata index — each run appends a row to an Iceberg table, enabling SQL queries via R2 SQL from the Cloudflare dashboard. The `mission.check` command adds a `runTimestamp` field to `evidence-metadata.json` to enable timestamped key generation. This RFC establishes DNA-59 (Evidence preservation).

## Architectural fit

- **DNA-46 (Mission lifecycle)**: Evidence is produced during the mission lifecycle but its value extends beyond the mission's closure. This RFC extends DNA-46 by specifying that evidence is preserved in durable external storage, not just on local disk.
- **DNA-52 (Release artifact store)**: Established the pattern of durable, content-addressed records for release artifacts. This RFC applies the same durability principle to Axiom evidence, using R2 instead of the local artifact store because evidence includes large binary artifacts (screenshots) that are not suited for the local store.
- **RFC-0629 / RFC-0630 (Axiom capsules)**: Defined the Axiom evidence format (study-run, observation-bundle, staged-capsule). This RFC preserves those artifacts without changing their format — R2 stores the same files that `mission.check` generates.
- **RFC-0649 (Axiom gate freshness)**: Made CDN freshness verification mandatory before the Axiom gate runs. This RFC complements it by preserving the gate's results for historical analysis — if the gate produces false positives in the future, the operator can compare past runs to identify patterns.
- **RFC-0628 (dev deploy with Axiom gate)**: Integrated `mission.check` into `leitstand.dev-deploy`. This RFC ensures that every dev deploy's Axiom results are preserved, not just the latest.
- **RFC-0574 (mirror topology)**: Established the star topology for Sternsystem repos. This RFC uses a different storage model (R2 object storage, not Git repos) because evidence artifacts are large binary files not suited for Git.
- **Site OS operator model**: This RFC defines the storage contract only. The `evidence.sync` and `evidence.fetch` commands that implement the contract are defined in RFC-0651. Integration into `mission.close` and `leitstand.dev-deploy` is defined in RFC-0652.
- **DNA-59 (Evidence preservation)**: Established by this RFC. Axiom evidence from `mission.check` is preserved as an append-only archive in S3-compatible storage (Cloudflare R2) with timestamped keys. Raw artifacts are subject to lifecycle-based storage tier transition. The archive is queryable via R2 Data Catalog. Local evidence is ephemeral (latest run only); R2 is the durable history.

## Design

### CLI surface

No new commands in this RFC. The `mission.check` command gains a `--run-timestamp` flag for explicit timestamp specification (used by `evidence.sync` in RFC-0651 to ensure key consistency):

```sh
# mission.check with explicit run timestamp (default: now, ISO 8601 UTC)
pnpm exec werkstatt run mission.check --mission warpgogol-com-m000025 --run-timestamp 2026-08-02T13-46-00-000Z

# mission.check without --run-timestamp (uses current time)
pnpm exec werkstatt run mission.check --mission warpgogol-com-m000025
```

### R2 bucket layout

Single shared bucket `axiom-evidence` with key prefix per system:

```
axiom-evidence/                                    ← R2 bucket
  {systemId}/                                      ← e.g. warpgogol-com
    {missionId}/                                   ← e.g. warpgogol-com-m000025
      {runTimestamp}/                              ← e.g. 2026-08-02T13-46-00-000Z
        evidence-metadata.json                     ← ~43 B, includes runTimestamp + commitSha
        study-run.json                             ← ~6 MB, findings + methodology
        observation-bundle.json                    ← ~7 MB, raw axe observations
        staged-capsule.json                        ← ~60 KB, capability manifest + closure
        report.html                                ← ~5 MB, self-contained HTML triage
        raw/                                       ← ~153 MB, screenshots + axe JSON
          {page-slug}-axe-raw-result.json
          {page-slug}-screenshot.webp
          ...
```

Key format: `{systemId}/{missionId}/{runTimestamp}/{filename}`

Timestamp format: ISO 8601 UTC with colons replaced by hyphens and milliseconds included: `YYYY-MM-DDTHH-MM-SS-mmmZ`. This is filesystem-safe and sorts lexicographically.

### R2 lifecycle rules

| Prefix pattern | Transition | After | Rationale |
| --- | --- | --- | --- |
| `*/raw/*` | Standard → Infrequent Access | 7 days | Raw artifacts (screenshots, axe JSON) are rarely accessed after the first week. IA reduces storage cost while maintaining accessibility. |
| `*/raw/*` | Infrequent Access → delete | 365 days | After 1 year, raw screenshots have no forensic value. Structured JSON + report.html retain the findings history. |
| `*` (all other objects) | No transition | — | Structured JSON and report.html are small (~19 MB total) and may be accessed for historical comparison at any time. |

R2 pricing: Standard $0.015/GB/month, Infrequent Access $0.01/GB/month. For 10 runs/day × 172 MB/run = 1.7 GB/day = ~50 GB/month:

- First 7 days (Standard): 50 GB × $0.015 = $0.75/month
- After 7 days (IA): 50 GB × $0.01 = $0.50/month (for raw/ portion ~153 MB)
- After 365 days: raw/ deleted, only ~19 MB/run remains

### R2 Data Catalog

R2 Data Catalog (managed Apache Iceberg) is enabled on the `axiom-evidence` bucket. A single Iceberg table `axiom_evidence_runs` stores per-run metadata:

| Column | Type | Description |
| --- | --- | --- |
| `system_id` | string | Sternsystem ID (e.g. `warpgogol-com`) |
| `mission_id` | string | Mission ID (e.g. `warpgogol-com-m000025`) |
| `run_timestamp` | timestamp | Run timestamp (ISO 8601 UTC) |
| `commit_sha` | string | Git commit SHA from evidence-metadata.json |
| `findings_count` | int | Total findings from study-run.json |
| `errors_count` | int | Error-level findings |
| `warnings_count` | int | Warning-level findings |
| `closure_satisfied` | boolean | Whether staged-capsule.json indicates closure |
| `r2_key_prefix` | string | R2 key prefix for this run (e.g. `warpgogol-com/warpgogol-com-m000025/2026-08-02T13-46-00-000Z/`) |

Operators query the table via R2 SQL from the Cloudflare dashboard:

```sql
-- List all runs for a mission, newest first
SELECT * FROM axiom_evidence_runs
WHERE mission_id = 'warpgogol-com-m000025'
ORDER BY run_timestamp DESC;

-- Find runs with the most errors
SELECT mission_id, run_timestamp, errors_count
FROM axiom_evidence_runs
WHERE errors_count > 0
ORDER BY errors_count DESC
LIMIT 20;

-- Track regression trends
SELECT DATE(run_timestamp) as day, AVG(errors_count) as avg_errors
FROM axiom_evidence_runs
WHERE system_id = 'warpgogol-com'
GROUP BY day
ORDER BY day DESC;
```

The Iceberg table is written by `evidence.sync` (RFC-0651) using the Iceberg REST catalog API. The table is partitioned by `system_id` to optimize queries for a single system.

### TypeScript contracts

```ts
// evidence-metadata.json — extended by this RFC
interface EvidenceMetadata {
  missionId: string;
  commitSha?: string;
  // NEW: run timestamp in ISO 8601 UTC (filesystem-safe format)
  runTimestamp: string;
}

// R2 key structure (contract, not a runtime type)
type R2EvidenceKey =
  `${string}/${string}/${string}/${string}`;
  // systemId / missionId / runTimestamp / filename

// Iceberg table row (written by evidence.sync in RFC-0651)
interface AxiomEvidenceRunRow {
  system_id: string;
  mission_id: string;
  run_timestamp: string; // ISO 8601 UTC
  commit_sha: string | null;
  findings_count: number;
  errors_count: number;
  warnings_count: number;
  closure_satisfied: boolean;
  r2_key_prefix: string;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/{mission}/evidence/axiom/evidence-metadata.json` | Gains `runTimestamp` field; written by `mission.check` |
| `packages/os/site-kernel-checks/src/mission-check.ts` | Writes `runTimestamp` to `evidence-metadata.json` |
| `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` | Documents `mission.check` writes `runTimestamp` |
| `packages/os/site-kernel-handoff/AGENTS.md` | Documents R2 bucket layout and lifecycle rules |
| Cloudflare R2 bucket `axiom-evidence` | Created by operator via `wrangler r2 bucket create axiom-evidence` |
| R2 Data Catalog on `axiom-evidence` | Enabled by operator via `wrangler r2 bucket catalog enable axiom-evidence` |
| R2 lifecycle rule | Configured by operator via `wrangler r2 bucket lifecycle axiom-evidence` |

### Output format

No `--json` output changes in this RFC. The `mission.check` output remains the same. The `evidence-metadata.json` file gains a `runTimestamp` field:

```json
{
  "missionId": "warpgogol-com-m000025",
  "commitSha": "abc123...",
  "runTimestamp": "2026-08-02T13-46-00-000Z"
}
```

### Failure modes

| Failure | Behavior |
| --- | --- |
| `--run-timestamp` not provided | `mission.check` uses `new Date().toISOString()` with colons replaced by hyphens |
| `--run-timestamp` invalid format | `mission.check` exits 1 with `INVALID_FLAG` diagnostic |
| R2 bucket not configured | No impact on `mission.check` — R2 sync is handled by `evidence.sync` (RFC-0651) |
| R2 Data Catalog not enabled | No impact on `mission.check` — Iceberg table writes are handled by `evidence.sync` (RFC-0651) |

## Rollout

- **Default behavior**: The `runTimestamp` field in `evidence-metadata.json` is always present after implementation. `mission.check` generates it automatically — no operator action needed.
- **R2 bucket setup**: The operator creates the R2 bucket and enables Data Catalog manually (one-time setup):
  ```sh
  npx wrangler r2 bucket create axiom-evidence
  npx wrangler r2 bucket catalog enable axiom-evidence
  npx wrangler r2 bucket lifecycle axiom-evidence --rule 'prefix=*/raw/*,transition=IA,days=7' --rule 'prefix=*/raw/*,expiration=365d'
  ```
- **Existing missions**: No migration needed — existing `evidence-metadata.json` files without `runTimestamp` are not synced to R2 (they are local-only). The first `mission.check` after implementation produces a `runTimestamp` and becomes the first syncable run.
- **New missions**: Automatically compliant — `mission.check` always writes `runTimestamp`.
- **Pipeline integration**: No pipeline changes in this RFC. `mission.check` is already invoked by `leitstand.dev-deploy` (RFC-0628). The `runTimestamp` field is transparent to existing consumers (`axiom.report` reads other fields).
- **Deprecation**: None — this RFC adds a field, does not remove or rename existing fields.
- **DNA-59**: After this RFC is accepted, the `## DNA-59` entry is appended to `docs/architecture-dna.md`.

## Alternatives considered

1. **Git LFS evidence repo (Sternsystem-style mirror)**: Store evidence in a Git bare repo with Git LFS for `raw/` artifacts, mirroring the Sternsystem `mirrors[]` topology. Rejected because Git is not suited for 153 MB of binary artifacts per run — LFS quota management, repo bloat, and slow clone/fetch operations make it impractical. The operator explicitly rejected Git for this use case.

2. **Supabase Storage**: S3-compatible, already integrated for `buffer_outbox`. Rejected because the free tier has a 1 GB limit (exhausted in ~6 runs) and the paid tier ($25/month for 8 GB) is still size-constrained. R2's zero-egress model and larger free tier (10 GB) are better suited for 172 MB/run evidence.

3. **Local timestamped snapshots only**: Change `mission.check` to write to `evidence/axiom/runs/{timestamp}/` locally, no remote backup. Rejected because it provides no off-site durability — a disk failure destroys all history. R2 provides durable storage with 11 nines advertised durability.

4. **Content-addressed deduplication**: Store raw artifacts by SHA-256 hash to deduplicate identical screenshots across runs. Rejected by the operator — "Дедупликация не нужна: Чем меньше сложность, тем лучше." Dedup adds a manifest layer, non-readable keys, and complexity for modest storage savings (~30-50% on ~$0.75/month).

5. **R2 object metadata + ListObjectsV2 (no Data Catalog)**: Use R2 custom metadata on objects and `ListObjectsV2` for listing instead of R2 Data Catalog. Rejected because the operator specifically requested R2 Data Catalog for SQL queryability. Data Catalog enables aggregation queries (regression trends, error counts over time) that are not possible with object listing.

## Risks

- **R2 availability**: R2 is a single-region service by default. A region outage makes evidence history temporarily inaccessible. Mitigation: R2's advertised durability is 11 nines; the evidence is also available locally (latest run) during outages. Multi-region R2 can be enabled in the future if needed.

- **Data Catalog write complexity**: Writing to an Apache Iceberg table from Node.js requires the Iceberg REST catalog API (HTTP). There is no official Node.js Iceberg client library. The implementation (RFC-0651) must use the REST catalog HTTP API directly or via a Worker. Risk: the REST catalog API may have undocumented constraints. Mitigation: RFC-0651 includes a fallback to R2 object custom metadata + `ListObjectsV2` if the Iceberg write path proves too complex.

- **Cost growth**: 10 runs/day × 172 MB = 1.7 GB/day = ~50 GB/month = ~$0.75/month. After 1 year, raw/ is deleted by lifecycle rules, leaving only ~19 MB/run. Risk: if run frequency increases significantly (100+ runs/day), storage costs grow proportionally. Mitigation: lifecycle rules cap raw/ retention at 365 days; structured JSON is small enough to retain indefinitely.

- **Agent misinterpretation**: Agents may attempt to create the R2 bucket or enable Data Catalog automatically. The AGENTS.md rule must state that R2 bucket setup is a manual operator action — agents MUST NOT run `wrangler r2 bucket create` or `wrangler r2 bucket catalog enable` without explicit operator approval.

- **Performance impact on mission.check**: Adding `runTimestamp` to `evidence-metadata.json` is a single field addition — negligible performance impact (one additional string field in a 43 B JSON file). No additional I/O, no network calls.

- **Key collision**: Two runs with the same timestamp (same mission, same millisecond) would produce the same R2 key prefix. Risk: near-zero — `mission.check` takes minutes to run. Mitigation: if a collision is detected during sync (RFC-0651), the sync command appends a `-1`, `-2` suffix to the timestamp.

## Acceptance criteria

- [x] `evidence-metadata.json` includes `runTimestamp` field in ISO 8601 UTC filesystem-safe format (evidence: `packages/os/site-kernel-checks/src/mission-check.ts:748-755`, `mission-check-rfc-0650.test.ts` test "runTimestamp is always present")
- [x] `mission.check` accepts optional `--run-timestamp` flag for explicit timestamp specification (evidence: `packages/os/site-kernel-checks/src/mission-check.ts:513-525`, `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts:348-352`, `mission-check-rfc-0650.test.ts` test "uses explicit --run-timestamp value")
- [x] `mission.check` generates `runTimestamp` automatically when `--run-timestamp` is not provided (evidence: `packages/os/site-kernel-checks/src/mission-check.ts:526-528`, `mission-check-rfc-0650.test.ts` test "auto-generates runTimestamp")
- [x] R2 bucket layout documented in `packages/os/site-kernel-handoff/AGENTS.md` with key structure `{systemId}/{missionId}/{runTimestamp}/` (evidence: `packages/os/site-kernel-handoff/AGENTS.md` § Evidence preservation)
- [x] R2 lifecycle rules documented: `raw/` → Infrequent Access after 7 days, delete after 365 days (evidence: `packages/os/site-kernel-handoff/AGENTS.md` § Evidence preservation lifecycle rules table)
- [x] R2 Data Catalog table schema documented: `axiom_evidence_runs` with columns `system_id`, `mission_id`, `run_timestamp`, `commit_sha`, `findings_count`, `errors_count`, `warnings_count`, `closure_satisfied`, `r2_key_prefix` (evidence: `packages/os/site-kernel-handoff/AGENTS.md` § Evidence preservation Data Catalog schema)
- [x] DNA-59 entry appended to `docs/architecture-dna.md` after acceptance (evidence: `docs/architecture-dna.md` § DNA-59)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0650` exit 0, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT create the R2 bucket or enable Data Catalog automatically — `wrangler r2 bucket create` and `wrangler r2 bucket catalog enable` are manual operator actions. Agents MAY recommend the commands but MUST NOT execute them without explicit operator approval.
- Agents MUST NOT weaken or remove the `runTimestamp` field or lifecycle rules established by this RFC without a new RFC that supersedes it.
- Agents MUST NOT implement `evidence.sync` or `evidence.fetch` as part of this RFC — those commands are defined in RFC-0651.
- Agents MUST NOT integrate evidence sync into `mission.close` or `leitstand.dev-deploy` as part of this RFC — that integration is defined in RFC-0652.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- After acceptance, append `## DNA-59 · Evidence preservation` to `docs/architecture-dna.md` with the text from the Decision section.
