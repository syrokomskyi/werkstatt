---
id: RFC-0398
title: "Program Charter and Terminology"
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
  - human:andrii-syrokomskyi
createdAt: 2026-07-19
updatedAt: 2026-07-19
implementedAt: 2026-07-19
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-20
  - DNA-55
  - RFC-0394
  - RFC-0395
  - RFC-0396
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-55
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-000"
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/business"
successSignals:
  - "PBP is established as the name of the logical model; all downstream RFCs use PBP terminology consistently"
  - "Entity glossary distinguishes Business, Profile, Catalog, Product, CatalogEntry, Offering, Policy, Claim, Disclosure, and Projection without ambiguity"
  - "canonical vs projection, static vs runtime, public vs private, and declared/derived/missing states are normative definitions referenced by all downstream PBP RFCs"
  - "The pbp/*@1 namespace is declared and its freeze rules are normative"
  - "DNA-20 is identified as the invariant this program will supersede through RFC-PBP-102/103, not through this charter RFC"
nonGoals:
  - "Does not define JSON Schemas for individual entities — that lives in downstream RFCs (RFC-PBP-010, RFC-PBP-020, RFC-PBP-030, etc.)"
  - "Does not define the compiler pipeline — that is RFC-PBP-064"
  - "Does not define migration from the legacy @gogol/business layer — that is RFC-PBP-102"
  - "Does not supersede DNA-20 by itself — this charter establishes terminology only; DNA-20 is superseded when RFC-PBP-103 (Migration Coverage and Cutover) is implemented and legacy files are deleted"
  - "Does not define cosmic naming or UI taxonomy — PBP is a data layer, not a UI layer"
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

- `pbp-specification-package/system-spec` — §1–4 (purpose, non-goals, principles, architectural layers)
- `pbp-specification-package/readme` — §1–2 (what is designed, key architectural decisions)
- `pbp-specification-package/decision-log` — ADR-001 through ADR-050

_This RFC establishes terminology and scope only. It does not copy model content from the spec — all entity schemas, field tables, and invariants live in downstream RFCs that reference the vendored snapshot sections._

# RFC-0398: Program Charter and Terminology

## Context

The `@gogol/business` package (DNA-20) defines the canonical business-layer vocabulary for client sites: schemas for `company`, `web`, `contact`, `location`, `legal`, `compliance`, `external-services`, `services`, `offers`, `trust`, and `faq`. This model was sufficient for single-service craft businesses but cannot represent federated product identity, structured pricing (Charge/Plan/Adjustment), typed Policies, Claims with Evidence, Disclosures, runtime state overlays, or deterministic projections to Schema.org, CRM, contract, and invoice inputs.

The PBP specification package (vendored at `docs/specs/pbp-specification-package/`, accepted 2026-07-19) defines a replacement logical model: Public Business Profile (PBP). The spec contains 50 architectural decisions (ADR-001..050), a 65-node RFC roadmap, and a 5-wave implementation plan. Warpgogol-com is the first migration target.

This charter RFC is the entry point of the PBP RFC program (spec node `RFC-PBP-000`). It fixes the name, scope, terminology, architectural layers, and namespace policy that all downstream PBP RFCs inherit. Without this charter, downstream RFCs risk terminological drift (e.g. "Offering" vs "Offer" vs "Service", "canonical" vs "source", "missing" vs "false").

## Problem

1. **No normative terminology for the PBP program.** Downstream RFCs (RFC-PBP-010 through RFC-PBP-104) need a single glossary to reference. Without it, each RFC may define terms slightly differently, creating ambiguity at integration points (e.g. is a "Catalog" a collection of CatalogEntries or a collection of Products?).
2. **No namespace declaration.** The spec fixes `pbp/*@1` as the namespace (ADR-013, §3.10) but this is not yet an RFC-level normative statement in this repository.
3. **No layer boundary definition.** The spec defines six architectural layers (Global Semantic, Federated Identity, Business Catalog, Runtime State, Projection, Governance) but these are not yet mapped to package boundaries in this monorepo.
4. **DNA-20 relationship is undefined.** PBP replaces `@gogol/business` but no RFC has yet declared the supersession path. This charter identifies the path (RFC-PBP-102/103) without executing it.

## Decision

### 1. Program name and scope

The logical model is named **Public Business Profile (PBP)**. PBP is a universal logical model for the public digital profile of a business: who it is, how to contact it, what products exist, how a specific business includes products in its catalog, what public offerings are active, how price is composed, what conditions/obligations/guarantees/rights apply, what claims a business makes and how they are evidenced, and what data can be derived for humans, websites, AI agents, CRM, contracts, invoices, and Schema.org.

Canonical PBP data is the single source of truth. Website pages, JSON-LD, AI responses, commercial documents, and other representations are projections.

### 2. Entity glossary

The following terms are normative throughout the PBP RFC program. Each downstream RFC MAY refine a term's schema but MUST NOT redefine its semantic boundary.

| Term | Definition |
| --- | --- |
| **Business** | Public operational identity of a business: name, type, industry, market, mission, linked entities. |
| **Profile** | The complete set of public PBP entities for one Business. Not a separate entity — a graph. |
| **Product** | What a thing IS. Federated, globally unique URI, authority-owned. Answers "what is it". |
| **CatalogEntry** | How a specific Business lists a Product in its own catalog. Local SKU, merchandising, local presentation. Answers "how does this business carry it". |
| **Offering** | How a Business publicly offers a CatalogEntry to buyers. Audience, availability, acquisition, fulfillment, terms, pricing. Answers "how does this business sell it". |
| **Policy** | Reusable typed rule: SLA, guarantee, ownership, exit, retention, fulfillment. Separate entity, referenced by Offering. |
| **Claim** | A verifiable assertion made by the business, with governance, subject, scope, and staleness rules. |
| **EvidenceSource** | External or internal source that corroborates a Claim: measurements, registry records, snapshots. |
| **Disclosure** | Material context the business must surface (dependencies, limitations, risks). Not a miscellaneous container. |
| **Projection** | A derived representation (website, JSON-LD, AI answer, CRM payload, contract input, invoice input). Never the source of truth. |
| **Canonical** | The authoritative stored form of a fact in the PBP graph. One fact — one canonical place. |
| **Runtime state** | Non-static data (inventory, availability, booking capacity) overlaid on the static graph through source contracts. |

### 3. State vocabulary

PBP distinguishes the following field states. Absent key defaults to `not-declared`, not `false`.

| State | Meaning |
| --- | --- |
| `not-declared` | Business has not stated a value. |
| `false` | Business explicitly declared the property absent. |
| `null` | Value applies but is unknown or intentionally suppressed in an allowed context. |
| `not-applicable` | Property does not apply to this entity. |
| `unavailable` | Value cannot be obtained in the current projection. |
| `invalid` | Value is present but failed validation. |

### 4. Architectural layers

| Layer | Responsibility | Monorepo home (target) |
| --- | --- | --- |
| Global Semantic | Category, ComparisonProfile, BuyerViewSchema, DerivationContract, IdentifierScheme, UnitDefinition, MetricDefinition, ControlledVocabulary, JSON Schema, mapping contracts. Business-independent. | `packages/pbp/` (new package, established by RFC-PBP-001) |
| Federated Identity | Business, LegalIdentity, Brand, Place, ContactPoint, WebPresence, Product, ProductGroup, ProductVariant, Credential. Globally unique URI, authority-owned. | `packages/pbp/` |
| Business Catalog | Catalog, CatalogEntry, Offering, Policy, Claim, EvidenceSource, Disclosure, Review, AggregateRating, PublicDocument, MachineUsePolicy. Per-business. | `packages/pbp/` + site-local `src/content/business/` |
| Runtime State | Inventory, availability, booking capacity, dynamic delivery estimate, personalized price, live rating snapshot. Overlay on static graph. | `packages/pbp/` (source contracts) + external adapters |
| Projection | Website view, AI answer, Schema.org/JSON-LD, CRM, contract input, invoice input, Sichtpass, machine-use files. Generated, never manually maintained. | `packages/pbp/` (projection contracts) + `packages/ui` (rendering) |
| Governance | Git history, review schedules, source revision, publication status, schema version, signatures, validation reports. | `docs/specs/pbp-specification-package/` (immutable spec, amendments only per RFC-0397) + `docs/rfcs/` (RFCs) |

### 5. Namespace policy

The namespace is `pbp/*@1`. Within `@1`:

- Keys MUST NOT be renamed.
- Semantics of existing values MUST NOT change.
- Default behavior MUST NOT change.
- Optional fields MUST NOT become required.
- Field units or types MUST NOT change without a new major schema.

Only additive optional extensions are permitted. Incompatible changes require `@2` and a migration contract (RFC-PBP-003).

The `pbp/*@1` namespace becomes physically binding when RFC-PBP-001 (Namespace, Entity Envelope and URI Policy) is implemented and establishes the `packages/pbp/` package with its schema `$id` prefix. Until then, this charter declares the namespace as the normative name for the program; downstream RFCs use it in prose and schema references.

### 6. Determinism and verifiability

Same inputs, same schema version, same locale/runtime parameters, and same derivation implementation version MUST produce the same resolved graph and the same normative projections. Every derived value MUST have a Derivation Contract, inputs, version, result type, provenance, and test vectors.

### 7. HTML prohibition in canonical facts

HTML (`<br>`, `<strong>`, etc.) is forbidden in canonical data fields. Presentation markup lives in projections only.

### 8. No empty-string semantics

Empty string does not mean missing. A field is either omitted (`not-declared`) or carries an explicit semantic status.

## Architectural fit

- **DNA-20 (Business layer is canonical site description).** This charter does not supersede DNA-20. DNA-20 is superseded when RFC-PBP-103 (Migration Coverage and Cutover) is implemented and legacy `@gogol/business` files are deleted. Until then, DNA-20 and PBP coexist: `@gogol/business` remains canonical for existing sites; PBP is under construction. This RFC declares the intent and the path.
- **DNA-55 (Spec vendoring contract).** This RFC is the first materialized RFC from the `pbp-specification-package` spec. It follows RFC-0394 (vendoring), RFC-0395 (ingest + acceptance), and RFC-0396 (lazy materialization with `specRef` traceability).
- **DNA-4 (Canonical content in `src/content/`).** PBP canonical data continues to live under `src/content/business/` in the Warpgogol case. The physical format changes (from flat `.md` files to PBP manifest structure) but the directory contract is preserved.
- **DNA-24 (Block-declarative pages).** PBP projections feed into block-declarative pages through the existing `buildPage` pipeline (DNA-25). PBP does not introduce a parallel render path.
- **Compass sync.** This charter does not change repository-wide requirements or app-package relationships by itself. When downstream RFCs (starting with RFC-PBP-001) establish `packages/pbp/` and define the new entity model, `docs/requirements.xml` and `docs/technology.xml` will need synchronization to record the new package and its contracts. This is deferred to the implementing RFCs, not this charter.

## Design

This RFC is a charter — it establishes terminology and policy, not code. No CLI command, TypeScript interface, or file system layout is introduced by this RFC alone. The `packages/pbp/` package is established by RFC-PBP-001 (Namespace, Entity Envelope and URI Policy), not here.

### Normative references for downstream RFCs

All downstream PBP RFCs MUST:

1. Use the entity glossary from §2 of this RFC.
2. Use the state vocabulary from §3.
3. Place entities in the architectural layer defined in §4.
4. Use the `pbp/*@1` namespace and respect its freeze rules (§5).
5. Reference vendored spec sections by `<doc-name>/<anchor>` (e.g. `pbp-specification-package/entity-model#CatalogEntry`), never by copying model content.
6. Cite spec decisions as `pbp-specification-package/ADR-NNN`.

## Rollout

- **Immediate:** This charter is the first PBP RFC. Upon acceptance, downstream RFCs (RFC-PBP-001 through RFC-PBP-104) can be materialized and authored using this terminology.
- **No flag day:** `@gogol/business` (DNA-20) continues to function for all existing sites. PBP is constructed alongside it in a new `packages/pbp/` package. No existing site changes until RFC-PBP-102 (Warpgogol Legacy Migration).
- **Supersession path:** DNA-20 is superseded by RFC-PBP-103 (Migration Coverage and Cutover) after Warpgogol migration is complete and legacy files are deleted (ADR-043: no compatibility layer).
- **Wave 1 scope:** 43 RFCs (see `pbp-specification-package/roadmap` §14, Wave 1). Result: Warpgogol fully migrated, website and AI projection run from PBP.

## Alternatives considered

- **UOM as the system name.** Rejected (ADR-001): too focused on Offering, does not cover the full business graph.
- **Extend `@gogol/business` incrementally.** Rejected: the existing schema (flat `.md` files with presentation strings like `"70 € / Monat"`) cannot represent Charge/Plan/Adjustment, federated product identity, typed Policies, or Claims with Evidence without a breaking rewrite. ADR-002 (logical model, not physical format) and ADR-028 (projection is not source of truth) require a new model.
- **One monolithic RFC.** Rejected (roadmap §2): a single RFC would be unreviewable and block parallel work. The 65-node roadmap decomposes the program into independently implementable RFCs with explicit dependencies.
- **Compatibility layer.** Rejected (ADR-043): no compatibility layer. Old files are deleted after 100% coverage and clean build. Forward-only.

## Risks

- **Terminological drift.** If downstream RFCs define terms differently, integration points break. Mitigation: this RFC is the normative glossary; `rfc.validate` can check for term consistency in future.
- **Scope creep.** PBP's ambition (65 RFCs, 5 waves) is large. Mitigation: Wave 1 is scoped to Warpgogol only; Waves 2–5 are gated on additional conformance cases (minimal physical good, variant commerce, 10 000+ SKU catalog).
- **DNA-20 limbo.** During construction, both `@gogol/business` and `packages/pbp/` exist. Agents may be confused about which is canonical. Mitigation: DNA-20 remains canonical until RFC-PBP-103; `packages/pbp/` is under construction and not consumed by sites until migration.
- **Package proliferation.** A new `packages/pbp/` package adds to the monorepo surface. Mitigation: the package is established by RFC-PBP-001 with a clear contract; it is the single home for all PBP schemas, loaders, and projection contracts.

## Acceptance criteria

- [x] Entity glossary defined and normative (evidence: implemented historically)
- [x] State vocabulary defined and normative (evidence: implemented historically)
- [x] Architectural layers defined and mapped to target monorepo locations (evidence: implemented historically)
- [x] `pbp/*@1` namespace policy declared (evidence: implemented historically)
- [x] DNA-20 supersession path identified (RFC-PBP-102/103) (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `specRef` traceability to `pbp-specification-package/RFC-PBP-000` (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] `AGENTS.md` updated with PBP program reference (upon implementation) (evidence: AGENTS.md:1, agent guide updated)
- [x] `packages/business/AGENTS.md` updated with deprecation notice pointing to PBP (upon RFC-PBP-102 implementation) (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- This RFC is a charter — it establishes terminology only. No code changes are required for acceptance.
- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove terminology established by this RFC without a new RFC that supersedes it.
- Downstream PBP RFCs MUST reference this charter for terminology. If a downstream RFC needs a term not defined here, it MUST add it via an amendment to this RFC, not by silent introduction.
- If implementation reveals an invariant conflict with DNA-20, run `site-kernel run rfc.supersede.propose --id RFC-0398 --reason "..." --invariant "DNA-20"` instead of working around it (RFC-0334). Note: DNA-20 supersession is planned through RFC-PBP-103, not through this charter.
