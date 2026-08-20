---
id: RFC-0889
title: "Amend RFC-0886: correct screenshot R2 path in JSON output example"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-20
updatedAt: 2026-08-20
enhancedAt: 2026-08-20
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0886
amendedBy: []
related:
  - RFC-0872
  - RFC-0885
  - RFC-0887
  - DNA-46
  - DNA-59
dependsOn:
  - RFC-0886
batch: nachweis-evidence-display
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
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
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt
successSignals:
  - "RFC-0886 JSON output example for nachweis.screenshot.upload uses {systemId}/screenshots/{slug}/ R2 path, matching the TypeScript contract and existing code"
  - "No code changes required — existing resolveNachweisScreenshotR2Path already uses the correct path"
nonGoals:
  - "Does not redefine the schema fields from RFC-0885"
  - "Does not change the nachweis.screenshot.upload command interface or implementation — the existing code is already correct"
  - "Does not change gate condition placement — RFC-0886 was already correct (display-consent-consistent in attestation-v1 only)"
  - "Does not touch RFC-0887 (UI components) or ADR-0057 (UI design decisions)"
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

# RFC-0889: Amend RFC-0886: correct screenshot R2 path in JSON output example

## Context

RFC-0886 extends the Nachweis kernel with granular consent commands, screenshot upload, and per-artifact publication gates. During audit (AUDIT-RFC-0889-01), the RFC-0886 JSON output example for `nachweis.screenshot.upload` was found to contain an R2 key value that does not match the TypeScript contract or the existing code.

The initial draft of RFC-0889 claimed four contradictions within RFC-0886. The audit determined that three of the four were fabricated (the cited text does not exist in RFC-0886), and the remaining one is a single JSON example with an incorrect R2 key value.

## Problem

RFC-0886's JSON output example (line 298) shows:

```json
"r2Key": "nachweis/warpgogol-com/client-xyz/website-screenshot.webp"
```

This value uses a `nachweis/` prefix that does not match:

- **TypeScript contract** (RFC-0886 line 184): `{systemId}/screenshots/{slug}/website-screenshot.{ext}`
- **Existing code** (`resolveNachweisScreenshotR2Path` in `packages/werkstatt/src/nachweis/nachweis-io.ts:436-442`): `{systemId}/screenshots/{slug}/website-screenshot{ext}`
- **R2 path convention**: all existing nachweis R2 paths use `{systemId}/...` without a `nachweis/` prefix (`{systemId}/private/...`, `{systemId}/public/...`, `{systemId}/screenshots/...`)

The correct R2 key value should be `warpgogol-com/screenshots/client-xyz/website-screenshot.webp`.

## Decision

RFC-0886's JSON output example for `nachweis.screenshot.upload` is corrected: the `r2Key` value changes from `nachweis/{systemId}/{slug}/website-screenshot.{ext}` to `{systemId}/screenshots/{slug}/website-screenshot.{ext}`, matching the TypeScript contract and the existing `resolveNachweisScreenshotR2Path` function.

No code changes are required — the existing implementation is already correct.

## Architectural fit

- **DNA-46 (Mission lifecycle)**: No impact — the existing code already uses the correct R2 path.
- **DNA-59 (Evidence preservation)**: The corrected JSON example aligns the RFC document with the existing R2 path convention (`{systemId}/...`), ensuring documentation and code are consistent for future maintenance.
- **RFC-0886**: Amends the JSON output example only. The TypeScript contract, gate condition placement, storage tier, and field name (`r2Key`) in RFC-0886 were already correct and are not changed.

### Compass sync

- `docs/verification-plan.xml` — no change needed. The verification surface references the gate condition and violation rule, not the JSON example.

## Design

### Corrected JSON output example

The `r2Key` value in RFC-0886's JSON output example changes from:

```json
"r2Key": "nachweis/warpgogol-com/client-xyz/website-screenshot.webp"
```

to:

```json
"r2Key": "warpgogol-com/screenshots/client-xyz/website-screenshot.webp"
```

This matches the existing `resolveNachweisScreenshotR2Path` function (`packages/werkstatt/src/nachweis/nachweis-io.ts:436-442`) and the `{systemId}/...` R2 path convention used by all other nachweis R2 paths.

## Rollout

1. **Document-only amendment**: Correct the JSON output example in RFC-0886. No code changes are required — the existing `resolveNachweisScreenshotR2Path` function already uses the correct path.
2. **No migration**: No existing data needs migration. The R2 path in the code was always correct; only the RFC document's JSON example was wrong.

## Alternatives considered

- **Direct editorial fix to RFC-0886 without an amend RFC**: Rejected — RFC-0886 has status `accepted`, and accepted RFCs cannot be edited in place. An amend RFC is the correct governance path for correcting accepted RFCs.
- **Introduce `nachweis/` prefix for all R2 paths**: Rejected — all existing nachweis R2 paths (`{systemId}/private/...`, `{systemId}/public/...`, `{systemId}/screenshots/...`) use `{systemId}/...` without a `nachweis/` prefix. Introducing a new prefix for screenshots only would create inconsistency.

## Risks

- **None**: This RFC is a document-only correction. No code changes, no behavioral changes, no migration.

## Acceptance criteria

- [ ] RFC-0886 JSON output example for `nachweis.screenshot.upload` uses `{systemId}/screenshots/{slug}/website-screenshot.{ext}` R2 key value (not `nachweis/{systemId}/{slug}/...`)
- [ ] `resolveNachweisScreenshotR2Path` in `packages/werkstatt/src/nachweis/nachweis-io.ts` is unchanged (already correct)
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- This RFC is a document-only amendment — no code changes are required. The existing `resolveNachweisScreenshotR2Path` function already uses the correct R2 path.
- Agents MUST NOT change `resolveNachweisScreenshotR2Path` — the existing implementation is correct.
- Agents MUST NOT add `display-consent-consistent` to `operational-measurement-v1` or `technical-assessment-v1` policy. RFC-0886 was already correct: `attestation-v1` only.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
