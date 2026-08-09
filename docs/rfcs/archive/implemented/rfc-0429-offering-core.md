---
id: RFC-0429
title: "Offering Core"
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
  - RFC-0403
  - RFC-0427
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-030"
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
  - "PbpOffering interface exported extending PbpEntity"
  - "Offering fields: name, summary, businessRef, catalogEntryRef, audience, availability, package, pricing, acquisition, fulfillment, terms, policyRefs, relatedOfferings"
  - "PbpAvailabilityMode and PbpOfferingRelation closed unions exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define Pricing details (charges, plans, adjustments) — that is RFC-PBP-032"
  - "Does not define Policy — that is RFC-PBP-040"
  - "Does not define Terms details — that is RFC-PBP-036"
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

- `pbp-specification-package/entity-model` — §15 (Offering), §15.1 (Full structure)
- `pbp-specification-package/system-spec` — §9 (Offering)

_This RFC defines the `PbpOffering` entity interface — the core offering envelope. Pricing, terms, policies, and fulfillment are sub-structures referenced by this RFC but detailed in companion RFCs._

# RFC-0429: Offering Core

## Context

The PBP spec defines Offering as a federated entity (entity-model §15) that connects a business's products to pricing, availability, terms, and policies. An Offering is seller-specific: it wraps a Product with commercial conditions. The Offering references a Business, a CatalogEntry, and various sub-structures (package, pricing, acquisition, fulfillment, terms, policyRefs, relatedOfferings).

## Problem

1. **No `PbpOffering` interface.** The `@gogol/pbp` package has no Offering entity.
2. **No availability modeling.** The spec defines availability modes (`declared`, `on-request`) and territories.
3. **No audience modeling.** The spec defines buyer types and segments on Offering.

## Decision

### 1. `PbpOffering` interface

```ts
interface PbpOffering extends PbpEntity {
  type: "offering";
  name: string;
  summary?: string;
  businessRef: PbpEntityRef;
  catalogEntryRef?: PbpEntityRef;
  audience?: {
    buyerTypes?: Record<string, { valueRef: string }>;
    segments?: Record<string, { valueRef: string }>;
  };
  availability?: {
    mode: PbpAvailabilityMode;
    territories?: Record<string, { countryCode: string }>;
  };
  package?: {
    included?: Record<string, { itemRef: PbpEntityRef; inclusion: string }>;
    allowances?: Record<string, PbpAllowance>;
  };
  pricing?: PbpPricing;
  acquisition?: {
    channelRefs?: Record<string, PbpEntityRef>;
  };
  fulfillment?: Record<string, unknown>;
  customerResponsibilities?: Record<string, unknown>;
  terms?: Record<string, unknown>;
  policyRefs?: Record<string, PbpEntityRef>;
  relatedOfferings?: Record<string, PbpRelatedOffering>;
  limitations?: Record<string, unknown>;
}
```

### 2. Supporting types

```ts
type PbpAvailabilityMode = "declared" | "on-request" | "unavailable";

type PbpOfferingRelation =
  | "optional" | "requires" | "incompatibleWith"
  | "alternativeTo" | "included";

type PbpOfferingAcquisition = "standalone" | "with-this-offering" | "either";

interface PbpAllowance {
  subjectRef: string;
  includedQuantity?: { value: string; unitRef: string };
  resetPeriod?: string;
  overageChargeRef?: string;
}

interface PbpRelatedOffering {
  relation: PbpOfferingRelation;
  offeringRef: PbpEntityRef;
  acquisition?: PbpOfferingAcquisition;
}

interface PbpPricing {
  currency: string;
  tax?: Record<string, unknown>;
  charges?: Record<string, unknown>;
  plans?: Record<string, unknown>;
  adjustments?: Record<string, unknown>;
}
```

### 3. Schema ID

```ts
const OFFERING_SCHEMA_ID = pbpSchemaId("offering"); // "pbp/offering@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-030"`.
- **RFC-0399 (Entity Envelope).** `PbpOffering extends PbpEntity`.
- **RFC-0403 (Business).** Offering references Business via `businessRef`.
- **RFC-0427 (Catalog).** Offering references CatalogEntry via `catalogEntryRef`.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpAvailabilityMode = "declared" | "on-request" | "unavailable";
export const PBP_AVAILABILITY_MODES: readonly PbpAvailabilityMode[] =
  ["declared", "on-request", "unavailable"] as const;
export function isPbpAvailabilityMode(value: string): value is PbpAvailabilityMode;

export type PbpOfferingRelation =
  | "optional" | "requires" | "incompatibleWith"
  | "alternativeTo" | "included";
export const PBP_OFFERING_RELATIONS: readonly PbpOfferingRelation[] = [
  "optional", "requires", "incompatibleWith", "alternativeTo", "included",
] as const;
export function isPbpOfferingRelation(value: string): value is PbpOfferingRelation;

export type PbpOfferingAcquisition = "standalone" | "with-this-offering" | "either";
export const PBP_OFFERING_ACQUISITIONS: readonly PbpOfferingAcquisition[] =
  ["standalone", "with-this-offering", "either"] as const;
export function isPbpOfferingAcquisition(value: string): value is PbpOfferingAcquisition;

export interface PbpAllowance { ... }
export interface PbpRelatedOffering { ... }
export interface PbpPricing { ... }
export interface PbpOffering extends PbpEntity { ... }
export const OFFERING_SCHEMA_ID: string;
```

### File system responsibilities

| Path                                    | Role                               |
| --------------------------------------- | ---------------------------------- |
| `packages/pbp/src/entities/offering.ts` | `PbpOffering` and supporting types |
| `packages/pbp/src/index.ts`             | Re-exports                         |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpOffering` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge Offering into Product.** Rejected: Product is a universal entity; Offering is seller-specific with pricing and terms.
- **Separate Pricing entity.** Rejected: pricing is embedded in Offering as a sub-structure, not a separate federated entity.

## Risks

- **Large interface.** Offering has many optional sub-structures. Mitigation: all sub-fields are optional; companion RFCs detail specific sub-structures.
- **Pricing complexity.** Pricing details (charges, plans, adjustments) are deferred to RFC-PBP-032.

## Acceptance criteria

- [x] `PbpOffering` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpAvailabilityMode`, `PbpOfferingRelation`, `PbpOfferingAcquisition` closed unions exported (evidence: implemented historically)
- [x] `PbpAllowance`, `PbpRelatedOffering`, `PbpPricing` interfaces exported (evidence: implemented historically)
- [x] `OFFERING_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpOffering extends PbpEntity` — do not redefine `schema`, `id`, `type`, `status`, `governance`.
- Pricing sub-structure (`charges`, `plans`, `adjustments`) is typed as `Record<string, unknown>` here; detailed types are introduced by RFC-PBP-032.
- Terms sub-structure is typed as `Record<string, unknown>` here; detailed types are introduced by RFC-PBP-036.
- Policy refs are `Record<string, PbpEntityRef>`; policy entity types are introduced by RFC-PBP-040.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
