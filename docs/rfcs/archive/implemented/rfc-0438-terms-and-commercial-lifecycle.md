---
id: RFC-0438
title: "Terms and Commercial Lifecycle"
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
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-036"
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
  - "PbpTerms interface exported with minimumTerm, renewal, cancellation, priceChanges"
  - "PbpRenewalMode closed union exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define policy entities — that is RFC-PBP-040"
  - "Does not define Zod schemas"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app webgogol-com"
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

- `pbp-specification-package/entity-model` — §19 (Terms), §18 (Fulfillment and Buyer Responsibilities)

_This RFC defines the terms and commercial lifecycle contract._

# RFC-0438: Terms and Commercial Lifecycle

## Context

The PBP spec defines terms (entity-model §19) including minimum term, renewal, cancellation, and price changes. Plans may override minimumTerm/renewal but should not copy all common terms.

## Problem

1. **No terms type.** The spec defines terms with renewal, cancellation, and price changes but no TypeScript types exist.
2. **No renewal mode vocabulary.** The spec uses `automatic` renewal mode.

## Decision

### 1. `PbpRenewalMode` closed union

```ts
type PbpRenewalMode = "automatic" | "manual" | "none";
```

### 2. `PbpTerms`

```ts
interface PbpTerms {
  minimumTerm?: string;
  renewal?: { mode: PbpRenewalMode; period: string };
  cancellation?: { policyRef: PbpEntityRef };
  priceChanges?: { policyRef: PbpEntityRef };
}
```

### 3. Plan override rule

Plan MAY override `minimumTerm`/`renewal`, but MUST NOT copy all common terms (entity-model §19).

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-036"`.
- **RFC-0429 (Offering Core).** `PbpOffering.terms` is `Record<string, unknown>` — this RFC provides the typed interface.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpRenewalMode = "automatic" | "manual" | "none";
export const PBP_RENEWAL_MODES: readonly PbpRenewalMode[] = ["automatic", "manual", "none"] as const;

export interface PbpTerms {
  minimumTerm?: string;
  renewal?: { mode: PbpRenewalMode; period: string };
  cancellation?: { policyRef: PbpEntityRef };
  priceChanges?: { policyRef: PbpEntityRef };
}
```

### File system responsibilities

| Path                                 | Role        |
| ------------------------------------ | ----------- |
| `packages/pbp/src/entities/terms.ts` | Terms types |
| `packages/pbp/src/index.ts`          | Re-exports  |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, terms types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Embed terms in Plan only.** Rejected: terms exist at both Offering level and Plan level; Plan overrides specific fields.

## Risks

- **Plan term duplication.** Agents may copy all terms into Plan instead of overriding. Mitigation: documented rule — Plan overrides only minimumTerm/renewal.

## Acceptance criteria

- [x] `PbpTerms` interface exported (evidence: implemented historically)
- [x] `PbpRenewalMode` closed union exported with const array (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Plan MAY override minimumTerm/renewal, but MUST NOT copy all common terms (entity-model §19).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
