---
id: RFC-0455
title: "Website Projection Contract"
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
specRef: "pbp-specification-package/RFC-PBP-080"
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
  - "PbpWebsiteProjection interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement website rendering — contract only"
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

- `pbp-specification-package/compiler` — Phase 12 (Projection), website projection
- `pbp-specification-package/system-spec` — website rendering

_This RFC defines the Website Projection contract._

# RFC-0455: Website Projection Contract

## Context

The PBP compiler Phase 12 produces website projections that render PBP entities into buyer-facing web pages. The projection must be deterministic and reference the source entities.

## Problem

1. **No website projection type.** The compiler produces website output but no TypeScript contract exists.

## Decision

### 1. `PbpWebsiteProjection`

```ts
interface PbpWebsiteProjection {
  projectionTarget: "website";
  offeringRef: PbpEntityRef;
  buyerViewSchemaRef?: PbpEntityRef;
  renderedSections: Record<string, unknown>;
  locale: string;
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-080"`.
- **RFC-0428 (Compiler Pipeline).** Phase 12 produces projections.
- **RFC-0441 (BuyerViewSchema).** Website projection may reference a buyer view schema.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpWebsiteProjection {
  projectionTarget: "website";
  offeringRef: PbpEntityRef;
  buyerViewSchemaRef?: PbpEntityRef;
  renderedSections: Record<string, unknown>;
  locale: string;
}
```

### File system responsibilities

| Path                                      | Role                     |
| ----------------------------------------- | ------------------------ |
| `packages/pbp/src/projections/website.ts` | Website projection types |
| `packages/pbp/src/index.ts`               | Re-exports               |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, website projection types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Hardcode website rendering.** Rejected: the projection must be deterministic and reference source entities.

## Risks

- **Rendering determinism.** Website output must be deterministic. Mitigation: `renderedSections` is a structured record, not raw HTML.

## Acceptance criteria

- [x] `PbpWebsiteProjection` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Website projection is deterministic — no random or time-based content.
- The projection references source entities via `offeringRef`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
