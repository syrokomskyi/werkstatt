---
id: RFC-0713
title: "Isolate R2 credentials per bucket (nachweis vs axiom-evidence)"
status: accepted
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
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0707
amendedBy: []
related:
  - RFC-0707
  - RFC-0651
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
    - nachweis.ingest
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "nachweis.ingest reads R2_NACHWEIS_* env vars instead of R2_* vars"
  - "evidence.sync continues using R2_* vars with no behavioral change"
  - "MissingEnvError for nachweis reports R2_NACHWEIS_ACCOUNT_ID when vars absent"
nonGoals:
  - "Does not change evidence.sync env var contract — R2_* vars remain unchanged"
  - "Does not introduce per-site R2 credentials — per-feature isolation is sufficient"
  - "Does not rename the R2 bucket — bucket name discrepancy between RFC-0707 text (\"nachweise\") and code (\"nachweis\") is pre-existing and out of scope"
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

# RFC-0713: Isolate R2 credentials per bucket (nachweis vs axiom-evidence)

## Context

RFC-0707 introduced the Nachweis kernel module with `nachweis.ingest` uploading PDF evidence to an R2 bucket named `nachweis`. RFC-0651 introduced `evidence.sync` uploading Axiom evidence to a separate R2 bucket named `axiom-evidence`.

Both modules resolve credentials from the same three environment variables: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (see `packages/os/site-kernel-handoff/src/evidence/r2-client.ts:65-78`). This means a single R2 API token must have access to **both** buckets, violating least-privilege isolation.

> **Note:** RFC-0707 text refers to the bucket as `nachweise` (with trailing 'e'), but the implemented code in `nachweis-io.ts:30` uses `NACHWEIS_BUCKET = "nachweis"` (without 'e'). This RFC uses `nachweis` to match the code. The discrepancy in RFC-0707's text is pre-existing and out of scope for this RFC.

## Problem

The shared credential contract means:

1. **No bucket isolation** — a compromised `nachweis` token can read/write Axiom evidence and vice versa.
2. **Operational friction** — creating a token scoped to only `nachweis` breaks `evidence.sync`, and a token scoped to only `axiom-evidence` breaks `nachweis.ingest`.
3. **AGENTS.md already mandates least-privilege** — `packages/os/site-kernel-handoff/AGENTS.md` states: "Scope tokens to the `axiom-evidence` bucket only (least-privilege)." The current code makes this impossible when both features are in use.

## Decision

The R2 client gains support for **prefixed env var resolution**. The `resolveR2ConfigFromEnv` function accepts an optional `envPrefix` parameter. When provided, it reads `{PREFIX}_R2_ACCOUNT_ID`, `{PREFIX}_R2_ACCESS_KEY_ID`, `{PREFIX}_R2_SECRET_ACCESS_KEY` instead of the unprefixed vars. When omitted, it falls back to the existing `R2_*` vars (backward compatible).

The Nachweis module uses `R2_NACHWEIS_*` prefixed vars. The evidence sync module continues using unprefixed `R2_*` vars.

## Architectural fit

- **Site OS operator model** — env var contract is part of the command surface; this RFC changes the contract for nachweis commands only.
- **Backward compatibility** — existing `R2_*` vars continue to work for `evidence.sync` with zero changes.
- **Least-privilege** — operators can now create separate R2 API tokens scoped per bucket.

## Design

### CLI surface

No new commands. Existing commands unchanged in flags/behavior. Only the env var contract changes:

```sh
# evidence.sync — unchanged, uses R2_*
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...

# nachweis.ingest — now uses R2_NACHWEIS_*
R2_NACHWEIS_ACCOUNT_ID=...
R2_NACHWEIS_ACCESS_KEY_ID=...
R2_NACHWEIS_SECRET_ACCESS_KEY=...
```

### TypeScript contracts

```ts
// r2-client.ts — extended signature
export function resolveR2ConfigFromEnv(
  bucketName?: string,
  envPrefix?: string,
): R2ClientConfig

// When envPrefix is provided:
//   reads `${envPrefix}_R2_ACCOUNT_ID` etc.
// When envPrefix is omitted:
//   reads `R2_ACCOUNT_ID` etc. (existing behavior)
```

```ts
// nachweis-io.ts — updated call
const config = resolveR2ConfigFromEnv(NACHWEIS_BUCKET, "R2_NACHWEIS");
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/evidence/r2-client.ts` | Extended with `envPrefix` param |
| `packages/os/site-kernel-handoff/src/nachweis/nachweis-io.ts` | Updated to pass `"R2_NACHWEIS"` prefix |
| `missions/*/workpiece/.env` | Add `R2_NACHWEIS_*` vars, remove `R2_*` values if nachweis-only |
| `missions/*/workpiece/.env.example` | Add `R2_NACHWEIS_*` placeholders |

### Failure modes

- If `R2_NACHWEIS_*` vars are absent, `nachweis.ingest` throws `MissingEnvError("R2_NACHWEIS_ACCOUNT_ID")` with the same `MISSING_ENV` diagnostic as before.
- If `R2_*` vars are absent, `evidence.sync` behavior is unchanged (non-fatal warning in `mission.close`).

## Rollout

- **Default**: Nachweis module requires `R2_NACHWEIS_*` vars. No grace period needed — the feature is not yet in production.
- **Existing apps**: `evidence.sync` continues using `R2_*` vars with zero changes.
- **New apps**: `.env.example` template includes both `R2_*` (for evidence sync) and `R2_NACHWEIS_*` (for nachweis) sections.
- **AGENTS.md**: Update the R2 setup note to document per-bucket token scoping.

## Alternatives considered

- **Single token, both buckets** — rejected: violates least-privilege, already documented in AGENTS.md as undesirable.
- **Bucket-per-site isolation** — rejected: over-engineered for pilot; per-feature isolation is sufficient.
- **Custom credentials object passed to `createR2Client`** — rejected: env var resolution is the established pattern; adding a credentials param would bifurcate the API.

## Risks

- **Operator confusion** — two sets of R2 env vars instead of one. Mitigated by clear `.env.example` comments and separate sections.
- **Migration** — operators who already set `R2_*` for nachweis need to add `R2_NACHWEIS_*`. Low risk since nachweis is not yet in production.

## Acceptance criteria

- [x] `resolveR2ConfigFromEnv` accepts optional `envPrefix` parameter (evidence: `packages/os/site-kernel-handoff/src/evidence/r2-client.ts:67-70`, `pnpm --filter @warpgogol/site-kernel-handoff exec vitest run src/tests/r2-client-env-prefix.test.ts`)
- [x] `nachweis-io.ts` passes `"R2_NACHWEIS"` prefix to `resolveR2ConfigFromEnv` (evidence: `packages/os/site-kernel-handoff/src/nachweis/nachweis-io.ts:138`)
- [x] `evidence.sync` continues using unprefixed `R2_*` vars — no behavioral change (evidence: `packages/os/site-kernel-handoff/src/evidence/r2-client.ts:71`, default prefix `R2_` when `envPrefix` omitted, backward compat test passes)
- [x] `.env.example` includes `R2_NACHWEIS_*` placeholders with "How to obtain" comments (evidence: `.env.example:43-53`)
- [x] `MissingEnvError` for nachweis reports `R2_NACHWEIS_ACCOUNT_ID` (not `R2_ACCOUNT_ID`) when vars absent (evidence: `packages/os/site-kernel-handoff/src/tests/r2-client-env-prefix.test.ts:46-53`, `pnpm --filter @warpgogol/site-kernel-handoff exec vitest run src/tests/r2-client-env-prefix.test.ts`)
- [x] `AGENTS.md` updated to document per-bucket R2 token scoping (evidence: `packages/os/site-kernel-handoff/AGENTS.md:34`)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0713 --json`, exit code 0)

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
