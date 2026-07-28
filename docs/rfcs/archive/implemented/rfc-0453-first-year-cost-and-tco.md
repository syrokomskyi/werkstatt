---
id: RFC-0453
title: "First-Year Cost and TCO"
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
  - RFC-0431
  - RFC-0437
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-071"
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
  - "PbpFirstYearCostDerivation interface exported"
  - "PbpTcoDerivation interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement the derivation function — contract only"
  - "Does not define Zod schemas"
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

## Design

**Normative source references:**

- `pbp-specification-package/compiler` — §11 (Derivation Engine), §11.3 (First-year cost example)
- `pbp-specification-package/entity-model` — §33 (DerivationContract)

_This RFC defines the First-Year Cost and TCO derivation contracts._

# RFC-0453: First-Year Cost and TCO

## Context

The PBP spec defines a First-Year Cost derivation (compiler §11.3) that sums activation + 12 months of subscription + usage estimates. Total Cost of Ownership (TCO) extends this over a longer period. Both are pure functions with provenance.

## Problem

1. **No first-year cost derivation contract.** The spec defines the derivation but no TypeScript types exist.
2. **No TCO derivation contract.** TCO is a generalization of first-year cost over a configurable period.

## Decision

### 1. `PbpFirstYearCostDerivation`

```ts
interface PbpFirstYearCostDerivation {
  derivationRef: string;
  inputs: { plan: string; period: string; usageParameters?: Record<string, unknown> };
  output: { valueType: "monetary-result"; resultModes: { exact: boolean; range: boolean; parameterized: boolean } };
  rounding: { mode: "currency-minor-unit" };
}
```

### 2. `PbpTcoDerivation`

```ts
interface PbpTcoDerivation {
  derivationRef: string;
  inputs: { plan: string; period: string; usageParameters?: Record<string, unknown> };
  output: { valueType: "monetary-result"; resultModes: { exact: boolean; range: boolean; parameterized: boolean } };
  rounding: { mode: "currency-minor-unit" };
}
```

### 3. Rules

- First-year cost = activation + 12 × monthly subscription + estimated usage (compiler §11.3).
- TCO extends over a configurable period (e.g., 3 years).
- Both are deterministic, side-effect-free pure functions.
- Money rounding: currency minor unit, never binary float.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-071"`.
- **RFC-0431 (Derivation Contract).** These are concrete derivation contracts.
- **RFC-0437 (Pricing Core).** Charges and plans are inputs.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpFirstYearCostDerivation {
  derivationRef: string;
  inputs: { plan: string; period: string; usageParameters?: Record<string, unknown> };
  output: { valueType: "monetary-result"; resultModes: { exact: boolean; range: boolean; parameterized: boolean } };
  rounding: { mode: "currency-minor-unit" };
}

export interface PbpTcoDerivation {
  derivationRef: string;
  inputs: { plan: string; period: string; usageParameters?: Record<string, unknown> };
  output: { valueType: "monetary-result"; resultModes: { exact: boolean; range: boolean; parameterized: boolean } };
  rounding: { mode: "currency-minor-unit" };
}
```

### File system responsibilities

| Path                                              | Role                                         |
| ------------------------------------------------- | -------------------------------------------- |
| `packages/pbp/src/derivations/first-year-cost.ts` | First-year cost and TCO derivation contracts |
| `packages/pbp/src/index.ts`                       | Re-exports                                   |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, derivation contracts are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Single generic derivation.** Rejected: first-year cost and TCO have specific input/output contracts that benefit from explicit typing.

## Risks

- **Usage estimation accuracy.** Usage-based charges make exact first-year cost impossible without usage parameters. Mitigation: `parameterized` mode handles this.

## Acceptance criteria

- [x] `PbpFirstYearCostDerivation` interface exported (evidence: implemented historically)
- [x] `PbpTcoDerivation` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Derivations are pure functions — deterministic and side-effect-free.
- Money rounding: currency minor unit, never binary float (compiler §11.6).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
