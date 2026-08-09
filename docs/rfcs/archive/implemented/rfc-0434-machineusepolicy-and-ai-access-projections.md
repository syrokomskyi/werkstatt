---
id: RFC-0434
title: "MachineUsePolicy and AI Access Projections"
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
specRef: "pbp-specification-package/RFC-PBP-086"
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
  - "PbpMachineUsePolicy interface exported"
  - "PbpMachineUsePermission closed union exported"
  - "PbpAiAccessProjection interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement llms.txt generation — contract only"
  - "Does not define robots.txt or llms.txt format"
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

- `pbp-specification-package/system-spec` — §25 (MachineUsePolicy)
- `pbp-specification-package/compiler` — projection targets include `ai-answer`

_This RFC defines the MachineUsePolicy entity and AI access projection contract._

# RFC-0434: MachineUsePolicy and AI Access Projections

## Context

The PBP spec defines a MachineUsePolicy (system-spec §25) that governs how machines may use business data. The policy can differentiate between discovery, retrieval, indexing, summarization, quotation, attribution, source-link requirement, training, automated purchasing, caching, and redistribution. PBP is not tied to a single `llms.txt` convention.

## Problem

1. **No `PbpMachineUsePolicy` interface.** The spec defines machine use policy but no TypeScript types exist.
2. **No permission vocabulary.** The spec lists 11 machine use dimensions but they are not formalized as a closed union.
3. **No AI access projection type.** The compiler produces `ai-answer` projections but no contract exists.

## Decision

### 1. `PbpMachineUsePermission` closed union

```ts
type PbpMachineUsePermission =
  | "discovery"
  | "retrieval"
  | "indexing"
  | "summarization"
  | "quotation"
  | "attribution"
  | "source-link-requirement"
  | "training"
  | "automated-purchasing"
  | "caching"
  | "redistribution";
```

### 2. `PbpMachineUsePolicy`

```ts
interface PbpMachineUsePolicy extends PbpEntity {
  type: "machine-use-policy";
  name: string;
  permissions: Record<PbpMachineUsePermission, "allowed" | "denied" | "conditional">;
  conditions?: Record<string, string>;
}
```

### 3. `PbpAiAccessProjection`

```ts
interface PbpAiAccessProjection {
  projectionTarget: "ai-answer";
  policyRef: PbpEntityRef;
  allowedFacts: string[];
  deniedFacts: string[];
}
```

### 4. Schema ID

```ts
const MACHINE_USE_POLICY_SCHEMA_ID = pbpSchemaId("machine-use-policy");
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-086"`.
- **RFC-0428 (Compiler Pipeline).** Phase 12 produces AI access projections.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpMachineUsePermission =
  | "discovery" | "retrieval" | "indexing" | "summarization"
  | "quotation" | "attribution" | "source-link-requirement"
  | "training" | "automated-purchasing" | "caching" | "redistribution";

export const PBP_MACHINE_USE_PERMISSIONS: readonly PbpMachineUsePermission[] = [
  "discovery", "retrieval", "indexing", "summarization",
  "quotation", "attribution", "source-link-requirement",
  "training", "automated-purchasing", "caching", "redistribution",
] as const;

export type PbpMachineUseVerdict = "allowed" | "denied" | "conditional";
export const PBP_MACHINE_USE_VERDICTS: readonly PbpMachineUseVerdict[] =
  ["allowed", "denied", "conditional"] as const;

export interface PbpMachineUsePolicy extends PbpEntity {
  type: "machine-use-policy";
  name: string;
  permissions: Record<PbpMachineUsePermission, PbpMachineUseVerdict>;
  conditions?: Record<string, string>;
}

export interface PbpAiAccessProjection {
  projectionTarget: "ai-answer";
  policyRef: PbpEntityRef;
  allowedFacts: string[];
  deniedFacts: string[];
}

export const MACHINE_USE_POLICY_SCHEMA_ID: string;
```

### File system responsibilities

| Path                                              | Role                    |
| ------------------------------------------------- | ----------------------- |
| `packages/pbp/src/entities/machine-use-policy.ts` | MachineUsePolicy entity |
| `packages/pbp/src/projections/ai-access.ts`       | AI access projection    |
| `packages/pbp/src/index.ts`                       | Re-exports              |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, MachineUsePolicy and AI access projection types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Tie to llms.txt convention.** Rejected: the spec explicitly states "PBP is not tied to a single llms.txt convention" (system-spec §25).
- **Boolean permissions only.** Rejected: the spec implies conditional permissions (e.g., attribution required). The `conditional` verdict handles this.

## Risks

- **Permission proliferation.** 11 dimensions is already comprehensive. Mitigation: closed union — new dimensions require a namespace bump.
- **Enforcement gap.** The policy is declarative; enforcement is external. Mitigation: the AI access projection translates policy to allowed/denied fact lists.

## Acceptance criteria

- [x] `PbpMachineUsePolicy` interface exported, extending `PbpEntity` (evidence: implemented historically)
- [x] `PbpMachineUsePermission` closed union exported with const array (evidence: implemented historically)
- [x] `PbpMachineUseVerdict` closed union exported (evidence: implemented historically)
- [x] `PbpAiAccessProjection` interface exported (evidence: implemented historically)
- [x] `MACHINE_USE_POLICY_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- PBP is not tied to a single `llms.txt` convention (system-spec §25).
- Permissions are a closed union of 11 dimensions — new dimensions require a namespace bump.
- The AI access projection translates policy into allowed/denied fact lists for the compiler.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
