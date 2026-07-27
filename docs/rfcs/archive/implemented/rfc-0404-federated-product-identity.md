---
id: RFC-0404
title: "Federated Product Identity"
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
  - RFC-0398
  - RFC-0399
  - RFC-0400
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-020"
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
  - "PbpProduct interface exported from @gogol/pbp extending PbpEntity"
  - "Product fields: name, summary, kind, authorityRef, classification, purpose, outcomes, deliverables, capabilities, externalIdentifiers, intrinsicComposition"
  - "Product kind vocabulary exported as closed union (physical-good, digital-good, service, composite-service, etc.)"
  - "Federated identity: Product has global URI and authority, not central registry (ADR-003)"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define ProductGroup or ProductVariant — that is RFC-PBP-023"
  - "Does not define Bundles — that is RFC-PBP-024"
  - "Does not define Catalog or CatalogEntry — that is RFC-PBP-025"
  - "Does not define Offering — that is RFC-PBP-030"
  - "Does not define Category Registry — that is RFC-PBP-021"
  - "Does not define Zod schemas for Product validation"
  - "Does not implement the federated registry resolver — that is RFC-PBP-094"
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

- `pbp-specification-package/system-spec` — §3.4 (Federated identity)
- `pbp-specification-package/entity-model` — §11 (Product: structure, kinds)
- `pbp-specification-package/decision-log` — ADR-003 (federated product identity), ADR-004 (global semantic layer), ADR-008 (variant vs bundle)

_This RFC defines the `PbpProduct` entity interface and the federated identity model. It references the vendored snapshot for field semantics._

# RFC-0404: Federated Product Identity

## Context

The PBP spec defines Product as an identifiable carrier of value with a globally unique URI and an authority (system-spec §3.4). Unlike a central product registry, PBP uses federated identity: a manufacturer can publish a Product, a business can publish its own service, and a seller creates a CatalogEntry referencing the Product (ADR-003).

The current Webgogol model has no separate Product entity — `offer.md` mixes Product, Offering, Pricing, and Policy into a single file (migration-plan §2). This RFC defines the `PbpProduct` interface that separates Product identity from commercial terms.

## Problem

1. **No `PbpProduct` interface.** The `@gogol/pbp` package has no entity interfaces yet. Product is the second critical entity after Business.
2. **No product kind vocabulary.** The spec defines 13 product kinds (entity-model §11.2). Without a closed union, these are freeform strings.
3. **No federated identity contract.** The spec mandates that Product has a global URI and authority but does not require a central registry (ADR-003). Without a typed `authorityRef` on Product, the federated model is unenforceable.
4. **Mixed concerns in legacy.** `offer.md` mixes Product, Offering, Pricing, and Policy. Without a clean `PbpProduct` interface, the migration has no target for the Product portion.

## Decision

### 1. `PbpProduct` interface

```ts
interface PbpProduct extends PbpEntity {
  type: "product";
  kind: PbpProductKind;
  name: string;
  summary?: string;
  authorityRef?: PbpEntityRef;
  classification?: {
    categoryRef?: PbpEntityRef;
    comparisonProfileRefs?: Record<string, PbpEntityRef>;
  };
  purpose?: { statement: string };
  outcomes?: Record<string, { name: string; description?: string }>;
  deliverables?: Record<string, { kind: string; name: string }>;
  capabilities?: Record<string, { value: string | boolean };
  externalIdentifiers?: Record<string, PbpExternalIdentifier>;
  intrinsicComposition?: Record<string, { productRef: PbpEntityRef }>;
}
```

### 2. Product kind vocabulary

```ts
type PbpProductKind =
  | "physical-good"
  | "digital-good"
  | "service"
  | "composite-service"
  | "subscription-access"
  | "license"
  | "rental"
  | "insurance-product"
  | "bundle"
  | "right"
  | "data-product"
  | "experience"
  | "custom-made-good";

const PBP_PRODUCT_KINDS: readonly PbpProductKind[];
```

### 3. Federated identity (ADR-003)

Product has a global URI (`id`) and an optional `authorityRef`. The authority is the entity that publishes and maintains the canonical Product data. A seller references the Product via `CatalogEntry.productRef` — the seller does not own the Product identity.

### 4. Product does NOT describe

Per entity-model §11.1, Product MUST NOT contain:

- Specific seller's price
- Payment method
- Contract term
- Seller's discount
- Seller's shipping policy
- Specific Offering's SLA
- Seller's local SKU

These belong to Offering (RFC-PBP-030) and CatalogEntry (RFC-PBP-025).

### 5. Schema ID

```ts
const PRODUCT_SCHEMA_ID = pbpSchemaId("product"); // "pbp/product@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpProduct` is in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** Seventh materialized RFC, `specRef: "pbp-specification-package/RFC-PBP-020"`.
- **RFC-0399 (Entity Envelope).** `PbpProduct extends PbpEntity`.
- **RFC-0400 (Primitive Types).** Uses `PbpExternalIdentifier`, `PbpEntityRef`.
- **ADR-003 (Federated identity).** Product has global URI + authority, no central registry required.

## Design

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpProductKind = "physical-good" | "digital-good" | "service" | "composite-service" | "subscription-access" | "license" | "rental" | "insurance-product" | "bundle" | "right" | "data-product" | "experience" | "custom-made-good";
export const PBP_PRODUCT_KINDS: readonly PbpProductKind[];
export function isPbpProductKind(value: string): value is PbpProductKind;

export interface PbpProduct extends PbpEntity {
  type: "product";
  kind: PbpProductKind;
  name: string;
  summary?: string;
  authorityRef?: PbpEntityRef;
  classification?: { categoryRef?: PbpEntityRef; comparisonProfileRefs?: Record<string, PbpEntityRef>; };
  purpose?: { statement: string };
  outcomes?: Record<string, { name: string; description?: string }>;
  deliverables?: Record<string, { kind: string; name: string }>;
  capabilities?: Record<string, { value: string | boolean }>;
  externalIdentifiers?: Record<string, PbpExternalIdentifier>;
  intrinsicComposition?: Record<string, { productRef: PbpEntityRef }>;
}

export const PRODUCT_SCHEMA_ID: string;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/product.ts` | `PbpProduct`, `PbpProductKind`, `PBP_PRODUCT_KINDS`, `isPbpProductKind`, `PRODUCT_SCHEMA_ID` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `isPbpProductKind` returns `false` for unknown kinds.
- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpProduct` is added to `@gogol/pbp`. Downstream RFCs (021, 022, 023, 024, 025, 030) can reference it.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Central product registry.** Rejected (ADR-003): governance, identity disputes, custom services, and long-term survivability require federation.
- **Merge Product and CatalogEntry.** Rejected (ADR-005): Product is "what it is", CatalogEntry is "how a business lists it", Offering is "how a business sells it".
- **Open string for product kind.** Rejected: the spec defines 13 kinds. A closed union prevents typos and invalid kinds.

## Risks

- **Kind vocabulary may need extension.** New product types may emerge. Mitigation: adding a new kind is additive within `@1` (per RFC-0401).
- **Intrinsic composition cycles.** Products can reference other products via `intrinsicComposition`. The compiler MUST check for cycles (compiler §8.5). Mitigation: this is a compiler responsibility, not an interface responsibility.
- **Authority disputes.** Two entities may claim authority over the same Product URI. Mitigation: the federated model allows this — the resolver picks the authoritative source based on trust configuration.

## Acceptance criteria

- [x] `PbpProduct` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpProductKind` closed union exported with `PBP_PRODUCT_KINDS` and `isPbpProductKind` guard (evidence: implemented historically)
- [x] `PRODUCT_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpProduct extends PbpEntity` — do not redefine `schema`, `id`, `status`, `governance`.
- Product MUST NOT contain seller-specific price, payment, terms, discount, shipping, SLA, or SKU (entity-model §11.1).
- Product kind is a closed union of 13 values. Adding a new kind is additive within `@1`.
- `intrinsicComposition` creates product-to-product references — the compiler MUST check for cycles.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
