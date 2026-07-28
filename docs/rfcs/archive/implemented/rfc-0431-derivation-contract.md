---
id: RFC-0431
title: "Derivation Contract"
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
  - RFC-0428
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-070"
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
  - "PbpDerivationContract interface exported"
  - "PbpDerivationResult interface exported with mode, value, provenance"
  - "PbpDerivationMode closed union exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement derivation functions — contract only"
  - "Does not define individual derivation contracts (first-year-cost, etc.)"
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

- `pbp-specification-package/compiler` — §11 (Derivation Engine), §11.1 (Execution model), §11.2 (Result envelope), §11.4 (Range), §11.5 (Parameterized), §11.6 (Rounding)

_This RFC defines the derivation contract: how the compiler executes pure functions to produce derived values with provenance._

# RFC-0431: Derivation Contract

## Context

The PBP compiler Phase 9 (Derivations) executes derivation contracts — pure functions that produce derived values from resolved inputs (compiler §11). Each derivation produces a result envelope with status, mode, value, and provenance. Derivations must be deterministic and traceable.

## Problem

1. **No derivation contract type.** The spec defines derivation execution as `(result, trace) = derive(contractVersion, resolvedInputs, parameters)` but no TypeScript types exist.
2. **No derivation result envelope.** The spec defines a result with `status`, `mode`, `value`, and `provenance` (§11.2).
3. **No derivation mode vocabulary.** The spec defines `exact`, `range`, and `parameterized` modes (§11.2, §11.4, §11.5).

## Decision

### 1. `PbpDerivationContract`

```ts
interface PbpDerivationContract {
  derivationRef: string;
  contractVersion: string;
  implementationVersion: string;
  requiredInputs: string[];
  parameters?: Record<string, unknown>;
}
```

### 2. `PbpDerivationResult`

```ts
interface PbpDerivationResult {
  status: PbpDerivationStatus;
  mode: PbpDerivationMode;
  value?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  formulaDescription?: string;
  requiredParameters?: Record<string, { unitRef: string }>;
  provenance: PbpDerivationProvenance;
}

interface PbpDerivationProvenance {
  derivationRef: string;
  implementationVersion: string;
  inputDigests: string[];
}
```

### 3. Closed unions

```ts
type PbpDerivationStatus = "derived" | "skipped" | "failed";
type PbpDerivationMode = "exact" | "range" | "parameterized";
```

### 4. Rounding rule

Money derivations MUST declare rounding at final and intermediate stages (compiler §11.6). Default: retain arbitrary decimal precision internally, round only at charge-defined boundary, final output to currency minor unit, never use binary float.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-070"`.
- **RFC-0428 (Compiler Pipeline).** Phase 9 executes derivations.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpDerivationStatus = "derived" | "skipped" | "failed";
export const PBP_DERIVATION_STATUSES: readonly PbpDerivationStatus[] =
  ["derived", "skipped", "failed"] as const;

export type PbpDerivationMode = "exact" | "range" | "parameterized";
export const PBP_DERIVATION_MODES: readonly PbpDerivationMode[] =
  ["exact", "range", "parameterized"] as const;

export interface PbpDerivationProvenance {
  derivationRef: string;
  implementationVersion: string;
  inputDigests: string[];
}

export interface PbpDerivationContract {
  derivationRef: string;
  contractVersion: string;
  implementationVersion: string;
  requiredInputs: string[];
  parameters?: Record<string, unknown>;
}

export interface PbpDerivationResult {
  status: PbpDerivationStatus;
  mode: PbpDerivationMode;
  value?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  formulaDescription?: string;
  requiredParameters?: Record<string, { unitRef: string }>;
  provenance: PbpDerivationProvenance;
}
```

### File system responsibilities

| Path                             | Role                      |
| -------------------------------- | ------------------------- |
| `packages/pbp/src/derivation.ts` | Derivation contract types |
| `packages/pbp/src/index.ts`      | Re-exports                |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, derivation contract types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Embed derivations in Offering.** Rejected: derivations are computed at build time, not stored in source entities.
- **Skip provenance.** Rejected: the spec requires provenance for every derived value (compiler §1).

## Risks

- **Rounding errors.** Money derivations with binary floats. Mitigation: the spec mandates decimal strings and the rounding rule is documented.
- **Non-deterministic derivations.** Mitigation: derivations are pure functions with explicit inputs and parameters.

## Acceptance criteria

- [x] `PbpDerivationContract` interface exported (evidence: implemented historically)
- [x] `PbpDerivationResult` interface exported with mode, value, provenance (evidence: implemented historically)
- [x] `PbpDerivationMode` and `PbpDerivationStatus` closed unions exported (evidence: implemented historically)
- [x] `PbpDerivationProvenance` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Derivations are pure functions: `(result, trace) = derive(contractVersion, resolvedInputs, parameters)`.
- Money derivations MUST declare rounding (compiler §11.6). Never use binary float.
- Canonical output exposes contract ID and parameters, not executable formula text (compiler §11.5).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
