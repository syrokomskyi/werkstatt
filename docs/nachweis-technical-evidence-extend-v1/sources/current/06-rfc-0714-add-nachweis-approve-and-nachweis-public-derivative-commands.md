---
id: RFC-0714
title: "Add nachweis.approve and nachweis.public-derivative commands"
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
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
implementedAt: 2026-08-06
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0707
amendedBy: []
related:
  - RFC-0707
  - RFC-0706
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
  added:
    - nachweis.approve
    - nachweis.public-derivative
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals: []
nonGoals: []
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

# RFC-0714: Add nachweis.approve and nachweis.public-derivative commands

## Context

RFC-0707 introduced the Nachweis kernel module with six commands: `ingest`, `validate`, `manifest.generate`, `consent.update`, `publish`, `withdraw`. The publication gate in `nachweis.publish` (and mirrored in `nachweis.validate`) checks six conditions:

1. `consentGranted` — covered by `nachweis.consent.update`
2. `sourceIntegrityVerified` — covered by `nachweis.ingest` (SHA-256)
3. `recordApproved` — **no command** — checked via Bordbuch entry with summary containing "approved"
4. `verificationLevelMet` — **no command** — checked via Bordbuch metadata `verificationLevel: N3`
5. `publicDerivativeReady` — **no command** — checked via `items[].storage === "public"` in evidence-source
6. `legalContentCheckPassed` — **no command** — checked via Bordbuch metadata `legalContentCheckPassed: true`

Conditions 3–6 have no kernel command to satisfy them. Operators must manually edit Bordbuch `events.ndjson` and evidence-source frontmatter, which is error-prone and bypasses the audit trail.

## Problem

Four of six publication gate conditions lack dedicated commands:

- **`recordApproved`** — requires a Bordbuch entry with summary containing "approved". No command writes this.
- **`verificationLevelMet`** — requires Bordbuch metadata `verificationLevel: N3`. No command sets this.
- **`legalContentCheckPassed`** — requires Bordbuch metadata `legalContentCheckPassed: true`. No command records this.
- **`publicDerivativeReady`** — requires `items[].storage === "public"` in the evidence-source entity. `nachweis.ingest` sets `storage: private`. No command creates a public derivative or flips storage.

This means the publication workflow is blocked after `consent.update` — there is no programmatic path to satisfy the remaining gate conditions.

## Decision

The Nachweis kernel module gains two new commands:

1. **`nachweis.approve`** — records human approval, sets verification level, and records legal content check in a single Bordbuch entry. Satisfies gate conditions 3, 4, and 6.
2. **`nachweis.public-derivative`** — uploads a public-derivative PDF to R2 and updates the evidence-source `items[].storage` to `"public"`. Satisfies gate condition 5.

## Architectural fit

- **Site OS operator model** — both commands are registered in the `nachweis` kernel module alongside existing commands.
- **Bordbuch audit trail** — `nachweis.approve` appends a `nachweis-record` Bordbuch entry with structured metadata, maintaining the hash-chain.
- **R2 storage** — `nachweis.public-derivative` uploads to the same `nachweis` bucket under a `public/` path prefix. Credentials are resolved from `R2_NACHWEIS_*` env vars (per-bucket isolation, implemented in `nachweis-io.ts` via `envPrefix` parameter to `resolveR2ConfigFromEnv`).
- **PBP entity model** — `nachweis.public-derivative` updates the evidence-source entity's `items[].storage` field from `private` to `public`.

## Design

### CLI surface

```sh
# Approve a record — sets verification level and legal content check
pnpm exec werkstatt run nachweis.approve \
  --system warpgogol-com \
  --slug mein-kunde-xyz \
  --verification-level N3 \
  --legal-content-check passed

# Create a public derivative — uploads redacted PDF and flips storage
pnpm exec werkstatt run nachweis.public-derivative \
  --system warpgogol-com \
  --slug mein-kunde-xyz \
  --file /path/to/public-derivative.pdf
```

### `nachweis.approve` flags

| Flag | Required | Description |
| --- | --- | --- |
| `--system` | No (defaults to `context.site.name`) | Sternsystem ID |
| `--slug` | Yes | Record slug to approve |
| `--verification-level` | Yes | Verification level: `N0`, `N1`, `N2`, `N3` |
| `--legal-content-check` | Yes | Legal content check result: `passed` or `failed` |
| `--dry-run` | No | Skip Bordbuch write, return what would happen |
| `--json` | No | Output JSON result |

### `nachweis.public-derivative` flags

| Flag        | Required                             | Description                                 |
| ----------- | ------------------------------------ | ------------------------------------------- |
| `--system`  | No (defaults to `context.site.name`) | Sternsystem ID                              |
| `--slug`    | Yes                                  | Record slug to create public derivative for |
| `--file`    | Yes                                  | Path to the public-derivative PDF file      |
| `--dry-run` | No                                   | Skip R2 upload and entity update            |
| `--json`    | No                                   | Output JSON result                          |

### TypeScript contracts

```ts
interface NachweisApproveResult {
  slug: string;
  systemId: string;
  verificationLevel: string;
  legalContentCheckPassed: boolean;
  bordbuchEventId: string | null;
}

interface NachweisPublicDerivativeResult {
  slug: string;
  systemId: string;
  r2Path: string;
  publicDerivativeSha256: string;
  bordbuchEventId: string | null;
  alreadyUploaded: boolean;
}
```

### `nachweis.approve` behavior

1. Resolve system and check nachweis entitlement (same pattern as other commands).
2. Acquire `system:` and `bordbuch:` locks.
3. Append a `nachweis-record` Bordbuch entry with:
   - `summary`: `"Record 'mein-kunde-xyz' approved (verification: N3, legal: passed)"`
   - `metadata`: `{ slug, verificationLevel: "N3", legalContentCheckPassed: true, approved: true }`
   - `writerRole`: `"nachweis"`
4. Release locks.
5. Return `NachweisApproveResult`.

The gate evaluator in `nachweis-validate.ts` and `nachweis-publish.ts` checks:

- `recordApproved`: `e.summary.includes("approved")` — satisfied by the summary text.
- `verificationLevelMet`: `e.metadata?.verificationLevel === "N3"` — satisfied by metadata.
- `legalContentCheckPassed`: `e.metadata?.legalContentCheckPassed === true` — satisfied by metadata.

### `nachweis.public-derivative` behavior

1. Resolve system and check nachweis entitlement.
2. Read the evidence-source entity file for the given slug. Throw `NOT_FOUND` if it does not exist.
3. Extract `recordId` and `version` from the evidence-source frontmatter (fields `recordId` and `version`).
4. Compute SHA-256 of the provided public-derivative PDF via `byteHashFile`.
5. **Idempotency check**: if the evidence-source already has `items.public.sha256` matching the computed hash, return a no-op result with `alreadyUploaded: true`. Do not upload or append Bordbuch.
6. Upload to R2 at `{systemId}/public/{recordId}/v{version}/public.pdf` using `uploadToR2`.
7. Update the evidence-source entity: set `items.public` to `{ sha256: <computed>, storage: "public", mediaType: "application/pdf" }`. This uses the existing `sha256` and `storage` fields from RFC-0706's EvidenceSource items schema — no new field is introduced.
8. Write the updated entity back to disk.
9. Acquire `system:` and `bordbuch:` locks.
10. Append a `nachweis-record` Bordbuch entry with:
    - `summary`: `"Public derivative created for 'mein-kunde-xyz'"`
    - `metadata`: `{ slug, publicDerivativeSha256, r2Path }`
    - `writerRole`: `"nachweis"`
11. Release locks.
12. Return `NachweisPublicDerivativeResult` with `alreadyUploaded: false`.

The gate evaluator checks `Object.values(items).some((item) => item.storage === "public")` — adding `items.public.storage: "public"` satisfies `publicDerivativeReady`.

### Output format

Both commands return `KernelCommandResult<T>` with `--json` support:

```json
{
  "command": "nachweis.approve",
  "data": {
    "slug": "mein-kunde-xyz",
    "systemId": "warpgogol-com",
    "verificationLevel": "N3",
    "legalContentCheckPassed": true,
    "bordbuchEventId": "event-000125"
  },
  "exitCode": 0,
  "summary": "[nachweis.approve] warpgogol-com: approved 'mein-kunde-xyz' (N3, legal: passed)"
}
```

```json
{
  "command": "nachweis.public-derivative",
  "data": {
    "slug": "mein-kunde-xyz",
    "systemId": "warpgogol-com",
    "r2Path": "warpgogol-com/public/nr_mein-kunde-xyz_20260806/v1/public.pdf",
    "publicDerivativeSha256": "a1b2c3...",
    "bordbuchEventId": "event-000126",
    "alreadyUploaded": false
  },
  "exitCode": 0,
  "summary": "[nachweis.public-derivative] warpgogol-com: public derivative for 'mein-kunde-xyz' uploaded"
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/nachweis/nachweis-approve.ts` | New command handler |
| `packages/os/site-kernel-handoff/src/nachweis/nachweis-public-derivative.ts` | New command handler |
| `packages/os/site-kernel-handoff/src/nachweis/nachweis.module.ts` | Register two new commands |
| `packages/os/site-kernel-handoff/src/nachweis/nachweis-io.ts` | Add result interfaces, `resolveNachweisPublicR2Path` helper |
| `missions/*/workpiece/src/content/business-profile/{lang}/evidence-source/*.md` | Updated by `public-derivative` |
| `missions/*/workpiece/bordbuch/events.ndjson` | Appended by both commands |

### Failure modes

- **Record not found**: `nachweis.approve` does not read the evidence-source entity — it only writes a Bordbuch entry. If the slug does not correspond to an existing record, the Bordbuch entry is still written. `nachweis.validate` will report the mismatch. `nachweis.approve` emits a `logger.warn` if no evidence-source file is found for the slug (non-blocking, informational).
- **Idempotency — `nachweis.approve`**: not idempotent. Each invocation appends a Bordbuch entry (audit trail of each approval action), following the same pattern as `nachweis.consent.update`.
- **Idempotency — `nachweis.public-derivative`**: idempotent by SHA-256. If the evidence-source already has `items.public.sha256` matching the computed hash, the command returns a no-op with `alreadyUploaded: true`. If the file differs, it overwrites the R2 object and updates the entity.
- **R2 upload failure**: `nachweis.public-derivative` throws on upload error. The evidence-source entity is not updated.
- **Entity not found**: `nachweis.public-derivative` throws `NOT_FOUND` if no evidence-source file exists for the slug.
- **Entitlement not resolved**: Both commands return a skip result (same pattern as existing commands).

## Rollout

- **Default**: Both commands are available immediately after module registration. No feature flag needed.
- **Pipeline integration**: Neither command is added to `build.prepare` or `build.check`. They are operator-invoked during the Nachweis publication workflow, between `consent.update` and `publish`.
- **Workflow**: `ingest` → `consent.update` → `approve` → `public-derivative` → `validate` → `publish`.
- **AGENTS.md**: Update the Nachweis workflow documentation to include the new commands.

## Alternatives considered

- **Single `nachweis.gate.satisfy` command** — rejected: too generic, hides the distinct human actions (approval vs. public derivative creation) in one opaque command.
- **Manual Bordbuch editing** — rejected: error-prone, bypasses lock acquisition, no structured metadata.
- **Fold approval into `nachweis.publish`** — rejected: `publish` should be a gate check, not a gate satisfier. Mixing satisfaction with enforcement violates separation of concerns.
- **Public derivative as a flag on `nachweis.ingest`** — rejected: the public derivative is created after legal review, not at ingestion time. Different actor, different timestamp, different file.

## Risks

- **Verification level gaming** — `nachweis.approve` accepts any level the operator passes. Mitigated by: the command is operator-invoked (not agent-auto-run), and the Bordbuch entry records who approved and at what level.
- **Public derivative content** — the operator is responsible for ensuring the public-derivative PDF contains no private data. The command does not redact; it uploads what it is given.
- **Bordbuch growth** — each approve and public-derivative action adds an entry. Low risk — Nachweis records are low-volume.
- **Agent misinterpretation** — agents might confuse `nachweis.approve` with an automated step. The command is operator-invoked only; agents MUST NOT run it autonomously. The Bordbuch entry records the actor (`"agent"` or `"human"`) in the writer role.

## Acceptance criteria

- [x] `nachweis.approve` command handler created in `packages/os/site-kernel-handoff/src/nachweis/nachweis-approve.ts` (evidence: packages/os/site-kernel-handoff/src/nachweis/nachweis-approve.ts:49)
- [x] `nachweis.public-derivative` command handler created in `packages/os/site-kernel-handoff/src/nachweis/nachweis-public-derivative.ts` (evidence: packages/os/site-kernel-handoff/src/nachweis/nachweis-public-derivative.ts:58)
- [x] Both commands registered in `createNachweisModule` in `nachweis.module.ts` (evidence: packages/os/site-kernel-handoff/src/nachweis/nachweis.module.ts:168,200)
- [x] `nachweis.approve` appends Bordbuch entry with summary containing "approved", `metadata.verificationLevel`, and `metadata.legalContentCheckPassed` (evidence: packages/os/site-kernel-handoff/src/tests/nachweis-commands.test.ts:686-730)
- [x] `nachweis.public-derivative` uploads PDF to R2 and updates `items.public.storage` to `"public"` in evidence-source entity (evidence: packages/os/site-kernel-handoff/src/tests/nachweis-commands.test.ts:852-901)
- [x] `nachweis.public-derivative` is idempotent by SHA-256 — returns `alreadyUploaded: true` no-op when the same hash is already recorded (evidence: packages/os/site-kernel-handoff/src/tests/nachweis-commands.test.ts:904-943)
- [x] Both commands skip silently when `nachweis` entitlement is not resolved (evidence: packages/os/site-kernel-handoff/src/tests/nachweis-commands.test.ts:671,815)
- [x] Both commands support `--dry-run` flag (evidence: packages/os/site-kernel-handoff/src/tests/nachweis-commands.test.ts:733,946)
- [x] Both commands support `--json` output (evidence: packages/os/site-kernel-handoff/src/nachweis/nachweis.module.ts:192,220)
- [x] `nachweis.validate` gate evaluation passes all 6 conditions after `approve` + `public-derivative` + `consent.update` (evidence: packages/os/site-kernel-handoff/src/nachweis/nachweis-publish.ts:118-148 gate evaluator reads Bordbuch entries from approve + items.public.storage from public-derivative + consentStatus from consent.update)
- [x] `command.manifest.generate` updated to include both new commands (evidence: docs/command-manifest.generated.yaml:13767,14041)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0714 exit code 0)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
