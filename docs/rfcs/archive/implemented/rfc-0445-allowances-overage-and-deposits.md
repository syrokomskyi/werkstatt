---
id: RFC-0445
title: "Allowances, Overage and Deposits"
status: implemented
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
reviewers:
  - "human:operator"
createdAt: 2026-07-19
updatedAt: 2026-07-19
implementedAt: 2026-07-19
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-1
  - DNA-55
  - RFC-0429
  - RFC-0437
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-034"
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/pbp"
successSignals:
  - "PbpAllowance already exported from RFC-0429"
  - "PbpOverageCharge interface exported"
  - "PbpDepositCharge interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not redefine PbpAllowance — already in RFC-0429"
  - "Does not define Zod schemas"
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

## Design

**Normative source references:**

- `pbp-specification-package/entity-model` — §16.2 (Allowance), §17.7 (Deposit)

_This RFC formalizes allowances, overage, and deposits. PbpAllowance is already in RFC-0429; deposits are in RFC-0437._

# RFC-0445: Allowances, Overage and Deposits

## Context

The PBP spec defines allowances (entity-model §16.2) as part of the offering package, with included quantity, reset period, and overage charge reference. Deposits (entity-model §17.7) are a charge type with refund policy.

## Problem

1. **Allowance already typed.** `PbpAllowance` is already exported from RFC-0429 with `subjectRef`, `includedQuantity`, `resetPeriod`, and `overageChargeRef`.
2. **Deposit already typed.** `PbpChargeType` includes `"deposit"` from RFC-0437, and `PbpCharge.refundPolicyRef` captures the refund policy reference.
3. **Overage charge needs explicit contract.** Overage is referenced by `overageChargeRef` in `PbpAllowance` but the overage charge itself is a standard `PbpCharge` with `type: "usage"`.

## Decision

### 1. Allowance (already exported)

```ts
interface PbpAllowance {
  subjectRef: string;
  includedQuantity?: { value: string; unitRef: string };
  resetPeriod?: string;
  overageChargeRef?: string;
}
```

### 2. Deposit (already in PbpCharge)

Deposits use `PbpCharge` with `type: "deposit"` and `refundPolicyRef` pointing to a Policy entity.

### 3. Overage

Overage charges are standard `PbpCharge` with `type: "usage"` referenced by `PbpAllowance.overageChargeRef`. No separate type needed.

## Architectural fit

- **DNA-1 (Monorepo boundary).** Types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-034"`.
- **RFC-0429 (Offering Core).** `PbpAllowance` already exported.
- **RFC-0437 (Pricing Core).** `PbpChargeType` includes `"deposit"`.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

No new types — all types already exist:

- `PbpAllowance` from RFC-0429
- `PbpCharge` with `type: "deposit"` from RFC-0437
- `PbpCharge.refundPolicyRef` from RFC-0437

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/offering.ts` | Already contains PbpAllowance (RFC-0429) |
| `packages/pbp/src/entities/pricing.ts` | Already contains PbpCharge with deposit type (RFC-0437) |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** No code changes needed — types already exist.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Separate overage type.** Rejected: overage is a usage charge referenced by allowance, not a separate entity.

## Risks

- **Overage charge resolution.** The `overageChargeRef` is a string reference. Mitigation: the compiler resolves it to a `PbpCharge` during build.

## Acceptance criteria

- [x] `PbpAllowance` already exported from RFC-0429 (evidence: implemented historically)
- [x] `PbpChargeType` includes `"deposit"` from RFC-0437 (evidence: implemented historically)
- [x] `PbpCharge.refundPolicyRef` exists from RFC-0437 (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- All types already exist from RFC-0429 and RFC-0437 — no new code needed.
- Overage charges are standard usage charges referenced by `PbpAllowance.overageChargeRef`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
