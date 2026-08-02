---
id: RFC-0651
title: "Evidence sync and fetch commands with S3-compatible R2 client"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-02
updatedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0650
  - RFC-0652
  - DNA-52
  - DNA-59
  - RFC-0629
  - RFC-0630
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-52
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
    - evidence.sync
    - evidence.fetch
  added:
    - evidence.sync
    - evidence.fetch
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "evidence.sync uploads all evidence artifacts to R2 and appends a row to the Iceberg table"
  - "evidence.fetch downloads a historical run from R2 to a local directory"
  - "evidence.sync --dry-run reports what would be uploaded without making any R2 API calls"
  - "R2 SQL query SELECT * FROM axiom_evidence_runs returns rows for synced runs"
nonGoals:
  - "Does not define the R2 bucket layout or lifecycle rules — those are RFC-0650"
  - "Does not integrate evidence.sync into mission.close or leitstand.dev-deploy — that is RFC-0652"
  - "Does not implement content-addressed deduplication — rejected for simplicity (RFC-0650)"
  - "Does not implement a custom Cloudflare Worker for Iceberg writes — uses the Iceberg REST catalog API directly from Node.js"
  - "Does not support partial sync (uploading only some files) — sync is all-or-nothing per run"
  - "Does not support resumable uploads — if sync fails mid-way, the operator re-runs the command"
  - "Does not implement a TUI or dashboard for browsing evidence history — R2 SQL in the Cloudflare dashboard is the query interface"
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

# RFC-0651: Evidence sync and fetch commands with S3-compatible R2 client

## Context

RFC-0650 established the R2 archive topology: timestamped keys, lifecycle rules, and R2 Data Catalog for queryable metadata. The `mission.check` command now writes a `runTimestamp` field to `evidence-metadata.json`. However, no command exists to upload evidence to R2 or download historical runs from R2. The operator has the storage contract (RFC-0650) but no tools to interact with it.

The workshop already uses S3-compatible APIs for Cloudflare R2 in the `lagebild-sync-worker` service, but that is a service-level integration, not a Site OS command. Evidence sync needs to be a Site OS command — callable from `leitstand.dev-deploy` (RFC-0652), `mission.close` (RFC-0652), and manually by the operator.

## Problem

RFC-0650 defines the R2 bucket layout and Data Catalog schema, but there is no Site OS command to:

1. **Upload evidence to R2**: After `mission.check` runs, the evidence sits in `missions/{mission}/evidence/axiom/` locally. Without an upload command, the R2 archive remains empty.

2. **Write Iceberg table rows**: The `axiom_evidence_runs` Iceberg table in R2 Data Catalog needs rows appended for each synced run. Without a command that writes to the Iceberg REST catalog API, the table stays empty and R2 SQL queries return nothing.

3. **Download historical runs**: If the operator needs to inspect a past run's evidence (e.g., compare findings, view screenshots), there is no command to fetch it from R2. The operator would need to use `wrangler r2 object get` manually for each file.

4. **List available runs**: There is no command to list runs stored in R2 for a given mission or system. The operator would need to use `wrangler r2 object list` with prefix filtering and parse the keys manually.

Without these commands, the R2 archive topology from RFC-0650 is an unused contract — the infrastructure exists but nothing writes to or reads from it.

## Decision

The kernel gains two new Site OS commands: `evidence.sync` and `evidence.fetch`. `evidence.sync` uploads all evidence artifacts from a mission's local `evidence/axiom/` directory to R2 under the timestamped key prefix defined in RFC-0650, and appends a row to the `axiom_evidence_runs` Iceberg table via the R2 Data Catalog REST API. `evidence.fetch` downloads a historical run from R2 to a local directory. Both commands use the `@aws-sdk/client-s3` package with R2's S3-compatible endpoint, configured via `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` environment variables.

## Architectural fit

- **DNA-52 (Release artifact store)**: `evidence.sync` follows the same pattern as `artifact.store.put` — durable, content-tracked records in external storage. The difference is the storage backend (R2 vs local artifact store) and the content type (evidence vs release dist).
- **DNA-59 (Evidence preservation)**: Established by RFC-0650. This RFC implements the commands that make the preservation contract operational.
- **RFC-0650 (R2 archive topology)**: Defines the bucket layout, key structure, lifecycle rules, and Data Catalog schema. This RFC implements the commands that write to and read from that topology.
- **RFC-0652 (Evidence lifecycle integration)**: Will integrate `evidence.sync` into `mission.close` (mandatory) and `leitstand.dev-deploy` (best-effort auto-sync). This RFC defines the commands; RFC-0652 wires them into the lifecycle.
- **Site OS operator model**: Two new commands in `packages/os/site-kernel-handoff`, registered in the `evidence` command module. Both are standalone commands — not pipeline steps. They are invoked manually or by other commands (RFC-0652).
- **Existing R2 usage**: The `lagebild-sync-worker` service already uses S3-compatible APIs for R2. This RFC brings the same pattern into the Site OS command layer, using `@aws-sdk/client-s3` which is already a dependency in the monorepo.

## Design

### CLI surface

```sh
# Sync current evidence to R2
pnpm exec site-kernel run evidence.sync --mission warpgogol-com-m000025

# Sync with explicit run timestamp (defaults to evidence-metadata.json runTimestamp)
pnpm exec site-kernel run evidence.sync --mission warpgogol-com-m000025 --run-timestamp 2026-08-02T13-46-00-000Z

# Dry-run: report what would be uploaded without making R2 API calls
pnpm exec site-kernel run evidence.sync --mission warpgogol-com-m000025 --dry-run

# Sync with JSON output
pnpm exec site-kernel run evidence.sync --mission warpgogol-com-m000025 --json

# Fetch a historical run from R2 to a local directory
pnpm exec site-kernel run evidence.fetch --mission warpgogol-com-m000025 --run-timestamp 2026-08-02T13-46-00-000Z --output-dir /tmp/evidence-review

# Fetch only structured JSON (skip raw/ artifacts — faster, less data)
pnpm exec site-kernel run evidence.fetch --mission warpgogol-com-m000025 --run-timestamp 2026-08-02T13-46-00-000Z --no-raw --output-dir /tmp/evidence-review

# List available runs for a mission (queries Iceberg table)
pnpm exec site-kernel run evidence.fetch --mission warpgogol-com-m000025 --list

# List with JSON output
pnpm exec site-kernel run evidence.fetch --mission warpgogol-com-m000025 --list --json
```

### TypeScript contracts

```ts
interface EvidenceSyncInput {
  missionId: string;
  runTimestamp?: string; // defaults to evidence-metadata.json runTimestamp
  dryRun?: boolean;
}

interface EvidenceSyncResult {
  missionId: string;
  systemId: string;
  runTimestamp: string;
  r2KeyPrefix: string;
  uploadedFiles: string[];
  skippedFiles: string[]; // files that already exist in R2 with same content
  icebergRowWritten: boolean;
  totalBytes: number;
  durationMs: number;
}

interface EvidenceFetchInput {
  missionId: string;
  runTimestamp?: string; // required unless --list
  outputDir: string;
  noRaw?: boolean; // skip raw/ artifacts
  list?: boolean; // list available runs instead of fetching
}

interface EvidenceFetchResult {
  missionId: string;
  runTimestamp: string;
  r2KeyPrefix: string;
  downloadedFiles: string[];
  totalBytes: number;
  outputDir: string;
}

interface EvidenceListResult {
  missionId: string;
  runs: Array<{
    runTimestamp: string;
    commitSha: string | null;
    findingsCount: number;
    errorsCount: number;
    warningsCount: number;
    closureSatisfied: boolean;
    r2KeyPrefix: string;
  }>;
}

// R2 S3 client configuration
interface R2ClientConfig {
  accountId: string; // R2_ACCOUNT_ID env var
  accessKeyId: string; // R2_ACCESS_KEY_ID env var
  secretAccessKey: string; // R2_SECRET_ACCESS_KEY env var
  bucketName: string; // default: "axiom-evidence"
}

// Iceberg REST catalog client (for axiom_evidence_runs table)
interface IcebergCatalogConfig {
  catalogUri: string; // from wrangler r2 bucket catalog info
  warehouse: string; // from wrangler r2 bucket catalog info
  tableName: string; // "axiom_evidence_runs"
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/evidence/evidence-sync.ts` | `evidence.sync` command handler |
| `packages/os/site-kernel-handoff/src/evidence/evidence-fetch.ts` | `evidence.fetch` command handler |
| `packages/os/site-kernel-handoff/src/evidence/r2-client.ts` | S3-compatible R2 client wrapper (PutObject, GetObject, ListObjectsV2) |
| `packages/os/site-kernel-handoff/src/evidence/iceberg-client.ts` | Iceberg REST catalog client (append row to `axiom_evidence_runs`) |
| `packages/os/site-kernel-handoff/src/evidence/evidence-module.ts` | Command module registration (evidence.sync, evidence.fetch) |
| `packages/os/site-kernel-handoff/src/command-tables/infra-contracts.ts` | Command contracts for evidence.sync and evidence.fetch |
| `missions/{mission}/evidence/axiom/` | Read by evidence.sync, written by evidence.fetch |
| `.env.example` | Documents R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY |
| `packages/os/site-kernel-handoff/AGENTS.md` | Documents evidence.sync and evidence.fetch commands |

### Output format

`evidence.sync --json`:

```json
{
  "command": "evidence.sync",
  "data": {
    "missionId": "warpgogol-com-m000025",
    "systemId": "warpgogol-com",
    "runTimestamp": "2026-08-02T13-46-00-000Z",
    "r2KeyPrefix": "warpgogol-com/warpgogol-com-m000025/2026-08-02T13-46-00-000Z/",
    "uploadedFiles": [
      "evidence-metadata.json",
      "study-run.json",
      "observation-bundle.json",
      "staged-capsule.json",
      "report.html",
      "raw/page-1-axe-raw-result.json",
      "raw/page-1-screenshot.webp"
    ],
    "skippedFiles": [],
    "icebergRowWritten": true,
    "totalBytes": 180355123,
    "durationMs": 4523
  },
  "exitCode": 0,
  "summary": "[evidence.sync] warpgogol-com-m000025: uploaded 7 files (172 MB) to R2 in 4.5s"
}
```

`evidence.fetch --list --json`:

```json
{
  "command": "evidence.fetch",
  "data": {
    "missionId": "warpgogol-com-m000025",
    "runs": [
      {
        "runTimestamp": "2026-08-02T13-46-00-000Z",
        "commitSha": "abc123...",
        "findingsCount": 964,
        "errorsCount": 0,
        "warningsCount": 46,
        "closureSatisfied": true,
        "r2KeyPrefix": "warpgogol-com/warpgogol-com-m000025/2026-08-02T13-46-00-000Z/"
      }
    ]
  },
  "exitCode": 0,
  "summary": "[evidence.fetch] warpgogol-com-m000025: 1 run available"
}
```

### Failure modes

| Failure | Behavior |
| --- | --- |
| `R2_ACCOUNT_ID` not set | `evidence.sync` exits 1 with `MISSING_ENV` diagnostic: "R2_ACCOUNT_ID environment variable is required" |
| `R2_ACCESS_KEY_ID` or `R2_SECRET_ACCESS_KEY` not set | Same `MISSING_ENV` diagnostic |
| Evidence directory does not exist | `evidence.sync` exits 1 with `NOT_FOUND` diagnostic: "evidence/axiom/ directory not found for mission {id}" |
| `evidence-metadata.json` missing or invalid | `evidence.sync` exits 1 with `INVALID_EVIDENCE` diagnostic: "evidence-metadata.json missing runTimestamp field — run mission.check first" |
| R2 PutObject API error | `evidence.sync` exits 1 with `R2_UPLOAD_ERROR` diagnostic including API response |
| Iceberg REST catalog API error | `evidence.sync` logs warning, continues — files are uploaded to R2 but Iceberg row is not written. `icebergRowWritten: false` in output. Non-fatal because R2 objects are the primary store; Iceberg is the query index. |
| `--dry-run` | No R2 API calls made. Output reports what would be uploaded. `exitCode: 0` always. |
| `evidence.fetch` run not found in R2 | Exits 1 with `NOT_FOUND` diagnostic: "no evidence found for mission {id} run {timestamp}" |
| `evidence.fetch --list` Iceberg query error | Falls back to `ListObjectsV2` with prefix `{systemId}/{missionId}/` and parses timestamps from keys. Logs warning about Iceberg unavailability. |
| Network timeout | Both commands exit 1 with `NETWORK_ERROR` diagnostic. No retry — the operator re-runs the command. |

## Rollout

- **Default behavior**: `evidence.sync` and `evidence.fetch` are standalone commands, not pipeline steps. They are invoked manually or by other commands (RFC-0652). No fail-hard integration — the operator chooses when to sync.
- **Dependency**: `@aws-sdk/client-s3` must be added to `packages/os/site-kernel-handoff` dependencies. It is already in the monorepo's `pnpm-lock.yaml` via `lagebild-sync-worker`.
- **Environment variables**: The operator must set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` in the local `.env` file. The `.env.example` file is updated to document these.
- **R2 bucket prerequisite**: The operator must have created the `axiom-evidence` R2 bucket and enabled Data Catalog (RFC-0650 rollout). `evidence.sync` fails with a clear error if the bucket does not exist.
- **Iceberg table creation**: The `axiom_evidence_runs` table is created automatically by `evidence.sync` on first run if it does not exist. The table schema is defined in RFC-0650.
- **Existing missions**: No migration — `evidence.sync` only syncs runs that have `runTimestamp` in `evidence-metadata.json` (produced by `mission.check` after RFC-0650 implementation).
- **New missions**: Automatically supported — `mission.check` writes `runTimestamp`, then `evidence.sync` uploads to R2.
- **Pipeline integration**: None in this RFC. RFC-0652 integrates `evidence.sync` into `mission.close` and `leitstand.dev-deploy`.
- **Command manifest**: After implementation, run `pnpm exec site-kernel run command.manifest.generate` to update `docs/command-manifest.generated.yaml` (RFC-CMD-02).

## Alternatives considered

1. **Cloudflare Worker for Iceberg writes**: Deploy a Worker that receives evidence metadata via HTTP and writes to the Iceberg REST catalog. Rejected because it adds a deployment dependency — the Worker must be deployed and maintained. The Iceberg REST catalog API is HTTP-based and can be called directly from Node.js using `fetch`. If the REST API proves too complex, a Worker can be introduced in a future RFC.

2. **wrangler r2 CLI instead of S3 SDK**: Use `wrangler r2 object put` via `execSync` instead of `@aws-sdk/client-s3`. Rejected because `execSync` with `wrangler` is slower (process spawn per file), does not support streaming for large files, and requires `wrangler` to be installed in the execution environment. The S3 SDK is already a monorepo dependency and provides proper streaming, error handling, and retry logic.

3. **R2 custom metadata + ListObjectsV2 (no Iceberg)**: Store run metadata as R2 custom metadata on the `evidence-metadata.json` object. List runs via `ListObjectsV2` with prefix filtering. Rejected because the operator specifically requested R2 Data Catalog for SQL queryability (RFC-0650). However, `evidence.fetch --list` includes a fallback to `ListObjectsV2` if the Iceberg table is unavailable.

4. **Single command with subcommands**: `evidence sync`, `evidence fetch`, `evidence list` as subcommands of a single `evidence` command. Rejected because the Site OS command model uses flat `domain.command` names (e.g., `mission.check`, `mission.close`, `bordbuch.generate`). Subcommands are not the established pattern.

5. **Resumable uploads with multipart**: Use S3 multipart upload for `raw/` artifacts larger than 5 MB. Rejected for simplicity — individual raw files (screenshots ~200 KB, axe JSON ~500 KB) are well under the 5 MB multipart threshold. The largest single file is `observation-bundle.json` at ~7 MB, which is a single PutObject call. If file sizes grow significantly in the future, multipart can be added without an RFC.

## Risks

- **Iceberg REST catalog API complexity**: There is no official Node.js Iceberg client library. The implementation must use the REST catalog HTTP API directly. Risk: undocumented API constraints, auth flow complexity, or schema evolution issues. Mitigation: Iceberg row write is non-fatal — if it fails, R2 objects are still uploaded successfully. The `evidence.fetch --list` command falls back to `ListObjectsV2`.

- **R2 credentials management**: `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are long-lived credentials stored in `.env` (gitignored). Risk: credential leakage if `.env` is accidentally committed. Mitigation: `.env` is in `.gitignore:128`. R2 tokens can be scoped to a single bucket with read/write permissions only.

- **Upload time**: 172 MB per run over a typical home internet connection (~10 MB/s upload) takes ~17 seconds. For 10 runs/day, this is ~3 minutes of upload time. Risk: acceptable for dev workflow, but may slow down `leitstand.dev-deploy` if sync is integrated as a blocking step. Mitigation: RFC-0652 integrates sync as best-effort, non-blocking in `leitstand.dev-deploy`.

- **Agent misinterpretation**: Agents may attempt to run `evidence.sync` automatically after every `mission.check`. The AGENTS.md rule must state that `evidence.sync` is invoked by `mission.close` (mandatory) and `leitstand.dev-deploy` (best-effort) per RFC-0652 — agents MUST NOT invoke it independently unless explicitly asked by the operator.

- **Cost of R2 Class A operations**: PutObject calls are Class A operations ($4.50/million). 7 files + ~50 raw files = ~57 PutObject calls per run. 10 runs/day = 570 calls/day = ~17,000 calls/month. Cost: ~$0.08/month. Negligible.

- **SDK bundle size**: `@aws-sdk/client-s3` adds ~2 MB to the package's dependency tree. Acceptable — it is already in the monorepo via `lagebild-sync-worker`.

## Acceptance criteria

- [ ] `evidence.sync` command registered in the evidence command module with correct name and scope (evidence: `evidence-module.ts` registration)
- [ ] `evidence.fetch` command registered in the evidence command module with correct name and scope (evidence: `evidence-module.ts` registration)
- [ ] `evidence.sync --mission <id>` uploads all files from `evidence/axiom/` to R2 under `{systemId}/{missionId}/{runTimestamp}/` prefix (evidence: unit test with mocked S3 client)
- [ ] `evidence.sync --dry-run` reports what would be uploaded without making R2 API calls (evidence: unit test verifying no PutObject calls)
- [ ] `evidence.sync` appends a row to the `axiom_evidence_runs` Iceberg table via REST catalog API (evidence: unit test with mocked Iceberg client)
- [ ] `evidence.sync` exits 1 with `MISSING_ENV` diagnostic when `R2_ACCOUNT_ID` is not set (evidence: unit test)
- [ ] `evidence.sync` exits 1 with `INVALID_EVIDENCE` diagnostic when `evidence-metadata.json` is missing `runTimestamp` (evidence: unit test)
- [ ] `evidence.fetch --mission <id> --run-timestamp <ts> --output-dir <dir>` downloads all files from R2 to the local directory (evidence: unit test with mocked S3 client)
- [ ] `evidence.fetch --no-raw` downloads only structured JSON + report.html, skipping `raw/` prefix (evidence: unit test)
- [ ] `evidence.fetch --list` queries the Iceberg table and returns available runs (evidence: unit test with mocked Iceberg client)
- [ ] `evidence.fetch --list` falls back to `ListObjectsV2` when Iceberg table is unavailable (evidence: unit test)
- [ ] `--json` output format matches the documented shape for both commands (evidence: unit tests asserting JSON structure)
- [ ] `.env.example` documents `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (evidence: `.env.example` file)
- [ ] `packages/os/site-kernel-handoff/AGENTS.md` documents `evidence.sync` and `evidence.fetch` commands (evidence: `AGENTS.md` section)
- [ ] `command.manifest.generate` run to update `docs/command-manifest.generated.yaml` (evidence: commit with manifest update)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT invoke `evidence.sync` automatically after `mission.check` — sync is invoked by `mission.close` (mandatory) and `leitstand.dev-deploy` (best-effort) per RFC-0652. Agents MAY invoke `evidence.sync` manually when explicitly asked by the operator.
- Agents MUST NOT create R2 API tokens automatically — token creation is a manual operator action in the Cloudflare dashboard. Agents MAY recommend the dashboard URL.
- Agents MUST NOT hardcode R2 credentials in source files — credentials are read from environment variables only.
- Agents MUST NOT weaken or remove the Iceberg row write — it is non-fatal but must be attempted on every sync.
- If the Iceberg REST catalog API proves too complex to implement, agents MAY implement the `ListObjectsV2` fallback as the primary listing mechanism and document the deviation in the implementation commit. A future RFC can add Iceberg support.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
