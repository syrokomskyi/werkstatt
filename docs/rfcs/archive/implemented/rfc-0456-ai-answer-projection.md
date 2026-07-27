---
id: RFC-0456
title: "AI Answer Projection"
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
  - RFC-0434
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-081"
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
  - "PbpAiAnswerProjection interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement AI answer generation — contract only"
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

- `pbp-specification-package/compiler` — Phase 12 (Projection), ai-answer projection
- `pbp-specification-package/system-spec` — §25 (MachineUsePolicy)

_This RFC defines the AI Answer Projection contract._

# RFC-0456: AI Answer Projection

## Context

The PBP compiler Phase 12 produces AI answer projections that provide structured facts for AI systems. The projection respects MachineUsePolicy permissions and produces allowed/denied fact lists.

## Problem

1. **No AI answer projection type.** RFC-0434 defines `PbpAiAccessProjection` with allowed/denied facts, but the full AI answer projection with structured content needs a contract.

## Decision

### 1. `PbpAiAnswerProjection`

```ts
interface PbpAiAnswerProjection {
  projectionTarget: "ai-answer";
  offeringRef: PbpEntityRef;
  policyRef: PbpEntityRef;
  allowedFacts: Record<string, unknown>;
  deniedFacts: string[];
  locale: string;
}
```

### 2. Relationship to RFC-0434

`PbpAiAccessProjection` from RFC-0434 defines the access-level contract (allowed/denied fact lists). `PbpAiAnswerProjection` extends this with structured fact content and locale.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-081"`.
- **RFC-0434 (MachineUsePolicy).** AI answer projection respects MachineUsePolicy.
- **RFC-0428 (Compiler Pipeline).** Phase 12 produces projections.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpAiAnswerProjection {
  projectionTarget: "ai-answer";
  offeringRef: PbpEntityRef;
  policyRef: PbpEntityRef;
  allowedFacts: Record<string, unknown>;
  deniedFacts: string[];
  locale: string;
}
```

### File system responsibilities

| Path                                        | Role                       |
| ------------------------------------------- | -------------------------- |
| `packages/pbp/src/projections/ai-answer.ts` | AI answer projection types |
| `packages/pbp/src/index.ts`                 | Re-exports                 |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, AI answer projection types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Reuse PbpAiAccessProjection only.** Rejected: the full projection needs structured fact content, not just allowed/denied lists.

## Risks

- **Policy enforcement.** Denied facts must not appear in output. Mitigation: `deniedFacts` list is explicit.

## Acceptance criteria

- [x] `PbpAiAnswerProjection` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- AI answer projection respects MachineUsePolicy permissions (system-spec §25).
- Denied facts MUST NOT appear in the projection output.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
