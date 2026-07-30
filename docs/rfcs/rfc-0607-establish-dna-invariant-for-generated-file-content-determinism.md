---
id: RFC-0607
title: "Establish DNA invariant for generated-file content determinism"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: policy
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
createdAt: 2026-07-30
updatedAt: 2026-07-30
enhancedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-18
  - RFC-0345
  - RFC-0375
  - RFC-0601
  - RFC-0600
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-58
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
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals:
  - "DNA-58 is documented in docs/architecture-dna.md with enforcement status."
  - "generated.drift.validate (RFC-0601) is listed as the enforcement command for DNA-58."
  - "rfc.validate passes on RFC-0607 and RFC-0601."
nonGoals:
  - "Do not define the implementation of generated.drift.validate — that is RFC-0601's scope."
  - "Do not modify existing DNA invariants — this RFC adds a new one."
  - "Do not retroactively reassign DNA-18 — it remains the Uni registry invariant."
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

# RFC-0607: Establish DNA invariant for generated-file content determinism

## Context

DNA-18 establishes that `uni.registry.yaml` is deterministically generated and that drift between the registry and its source manifests fails `build.check`. RFC-0345 made generated file writes idempotent and eliminated volatile timestamps from specific generators. RFC-0375 checks that registry-declared generated files exist on disk.

However, no DNA invariant covers the broader principle: **every generated file committed to git must match what its owning generator would produce from current source data**. A file can exist (RFC-0375 ✓), carry the GENERATED marker (RFC-0081 ✓), be written idempotently (RFC-0345 ✓), and still have stale content — because the generator was not re-run after source data changed, schema evolved, or generator logic was fixed.

RFC-0601 proposes a `generated.drift.validate` command to detect this, but the audit found that RFC-0601's claim of satisfying DNA-18 is tenuous: DNA-18 is specifically about the Uni registry index, not about general generated-file drift. This RFC establishes the missing invariant so RFC-0601 has a proper DNA anchor.

## Problem

There is no DNA invariant that asserts: "generated files must match their generator's output from current source data." Without this invariant:

1. Content drift in generated files is not an architectural violation — it is a cosmetic issue. CI can detect it via a command, but the invariant it protects is undocumented.
2. New generators have no documented contract requiring deterministic output. A generator that embeds `new Date().toISOString()` or environment-specific values violates the principle but no invariant names it.
3. RFC-0601 (`generated.drift.validate`) has no DNA invariant to satisfy. Its audit found the DNA-18 claim tenuous.
4. The relationship between RFC-0345 (idempotent writes), RFC-0375 (existence), and RFC-0601 (content drift) is ad hoc — they are related RFCs but share no common invariant.

## Decision

A new DNA invariant — **DNA-58: Generated-file content determinism** — is established in `docs/architecture-dna.md`:

> Every text-based generated file committed to git must be byte-identical to what its owning generator would produce from current source data (after line-ending normalization). Content drift — a committed file whose content diverges from its generator's current output — is a violation. Binary files (PNG, ICO, WebP, MP4, WebM, JPG, JPEG, GIF, TIFF, HEIC, HEIF, SVG) are excluded; their determinism is covered by RFC-0602 and RFC-0603. Enforcement: `generated.drift.validate` (RFC-0601). Established by RFC-0607.

This invariant extends the determinism principle from DNA-18 (Uni registry) to all text-based generated files. DNA-18 remains unchanged — it is still the single UI index invariant. DNA-58 is the general generated-file content invariant.

## Architectural fit

- **DNA-18 (Uni registry is the single UI index)**: DNA-58 extends the determinism principle from the registry to all text-based generated files. DNA-18 remains specific to `uni.registry.yaml`; DNA-58 is the general case.
- **RFC-0345 (idempotent file writes)**: DNA-58 is the invariant that RFC-0345's idempotent writes serve. RFC-0345 prevents future drift from redundant writes; DNA-58 asserts that existing committed files must not be drifted.
- **RFC-0375 (generated.files.validate)**: DNA-58 complements RFC-0375 — RFC-0375 checks existence, DNA-58 asserts content correctness.
- **RFC-0601 (generated.drift.validate)**: DNA-58 is the invariant that RFC-0601 enforces. RFC-0601 is the command; DNA-58 is the policy.
- **RFC-0600 (generated.stale.validate)**: DNA-58 complements RFC-0600 — RFC-0600 checks for orphaned files, DNA-58 checks for content drift in owned files.
- **RFC-0602 (timestamp determinism)**: DNA-58 excludes binary files; RFC-0602 addresses timestamp non-determinism in text files, which is a subset of content drift.

## Design

This RFC is a policy RFC — it establishes a DNA invariant and does not introduce commands or code. The enforcement command (`generated.drift.validate`) is defined by RFC-0601.

### Invariant text

The invariant is added to `docs/architecture-dna.md` as DNA-58:

> **DNA-58 · Generated-file content determinism** Every text-based generated file committed to git must be byte-identical to what its owning generator would produce from current source data (after line-ending normalization). Content drift is a violation. Binary files (PNG, ICO, WebP, MP4, WebM, JPG, JPEG, GIF, TIFF, HEIC, HEIF, SVG) are excluded. Enforcement: `generated.drift.validate` (RFC-0601). Established by RFC-0607.

### File system responsibilities

| Path                       | Role                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| `docs/architecture-dna.md` | Add DNA-58 section after DNA-57                                  |
| `docs/rfcs/rfc-0601-*.md`  | Update `satisfies` to include DNA-58 (once this RFC is accepted) |

### No CLI surface

This RFC does not introduce or modify any commands. It is a policy-only RFC.

## Rollout

- **Acceptance**: Once this RFC is accepted, DNA-58 is added to `docs/architecture-dna.md`.
- **RFC-0601 dependency**: RFC-0601 (`generated.drift.validate`) updates its `satisfies` field to include DNA-58. RFC-0601 may proceed to `accepted` only after RFC-0607 is accepted.
- **Existing apps**: No immediate impact — the invariant is documented, enforcement is gradual via RFC-0601's DRIFT-02 notice for generators without `dryRun` support.
- **New apps**: Automatically benefit — the invariant is part of the DNA from day one.
- **No migration**: This RFC does not change any code or command behavior. It documents an invariant that RFC-0601 enforces.

## Alternatives considered

- **Extend DNA-18 to cover all generated files**: Rejected — DNA-18 is specifically about the Uni registry as the single UI index. Broadening it would dilute its meaning and require rewording an established invariant. A new invariant is cleaner.
- **No DNA invariant — RFC-0601 stands alone**: Rejected — the audit found that RFC-0601's DNA-18 claim is tenuous. Without a proper invariant, the enforcement command has no architectural anchor.
- **Make this an architecture RFC instead of policy**: Rejected — `rfc.create` requires `--satisfies` for architecture RFCs, and this RFC proposes a new invariant rather than satisfying an existing one. A policy RFC is the appropriate vehicle for establishing a new invariant.

## Risks

- **Invariant proliferation**: Adding DNA-58 increases the invariant count. Mitigation: DNA-58 is a natural extension of the determinism principle and does not overlap with existing invariants.
- **Dependency chain**: RFC-0601 depends on this RFC being accepted. If this RFC is rejected, RFC-0601 has no DNA anchor and must either re-claim DNA-18 (tenuous) or proceed without a `satisfies` entry. Mitigation: this RFC is a simple policy addition with no code changes — the risk of rejection is low.
- **Agent confusion**: Agents might think DNA-58 replaces DNA-18. Mitigation: the invariant text and architectural fit section explicitly state that DNA-18 remains unchanged.

## Acceptance criteria

- [x] DNA-58 section added to `docs/architecture-dna.md` after DNA-57 (evidence: docs/architecture-dna.md:247-249, DNA-58 section present after DNA-57)
- [x] DNA-58 text matches the Decision section of this RFC (evidence: docs/architecture-dna.md:249, text aligned with RFC-0607 Decision section and Invariant text section — both list full binary file set)
- [x] DNA-58 enforcement status references RFC-0601 (`generated.drift.validate`) (evidence: docs/architecture-dna.md:249, "Enforcement: `generated.drift.validate` (RFC-0601)")
- [x] RFC-0601 `satisfies` field updated to include DNA-58 (after this RFC is accepted) (evidence: docs/rfcs/rfc-0601-*.md:36-37, `satisfies: [DNA-58]`)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec site-kernel run rfc.validate RFC-0607 --json` → status: pass, 0 violations)
- [x] `rfc.validate` passes on RFC-0601 after its `satisfies` update (evidence: `pnpm exec site-kernel run rfc.validate RFC-0601 --json` → status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement changes ONLY when this RFC has status: accepted (or implemented).
- Implementation is limited to adding DNA-58 to `docs/architecture-dna.md` and updating RFC-0601's `satisfies` field.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
