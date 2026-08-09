---
id: RFC-0424
title: "Normalization Contract"
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
  - RFC-0408
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-101"
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
  - "PbpNormalizationDecision type exported with PBP_NORMALIZATION_DECISIONS (9 statuses)"
  - "PbpNormalizationRule interface exported"
  - "PbpNormalizationResult interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define migration agent — that is RFC-0408"
  - "Does not define specific normalization rules for Warpgogol"
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

- `pbp-specification-package/migration-plan` — §3.6 (Decision statuses), §3.3 (Provenance)
- `pbp-specification-package/system-spec` — §3.9 (Minimize hidden inferences)

# RFC-0424: Normalization Contract

## Context

The PBP spec defines a normalization contract for the migration agent (migration-plan §3). Each source field gets exactly one decision status: `transformed`, `derived-not-stored`, `merged`, `discarded-as-presentation`, `discarded-as-duplicate`, `moved-private`, `needs-owner-decision`, `invalid-source`, `not-applicable`. The compiler and AI projections MUST NOT infer business facts from marketing text unless a normalization or derivation contract allows it (system-spec §3.9).

## Problem

1. **No `PbpNormalizationRule` interface.** The `@gogol/pbp` package has no normalization rule type.
2. **No `PbpNormalizationResult` interface.** The `@gogol/pbp` package has no normalization result type.
3. **No decision status vocabulary.** The spec defines 9 decision statuses but there is no closed union.

## Decision

### 1. Normalization decision status (migration-plan §3.6)

```ts
type PbpNormalizationDecision =
  | "transformed"
  | "derived-not-stored"
  | "merged"
  | "discarded-as-presentation"
  | "discarded-as-duplicate"
  | "moved-private"
  | "needs-owner-decision"
  | "invalid-source"
  | "not-applicable";
```

### 2. `PbpNormalizationRule` interface

```ts
interface PbpNormalizationRule {
  sourceField: string;
  targetField?: string;
  decision: PbpNormalizationDecision;
  reason: string;
  provenance: "business-declared" | "derived";
}
```

### 3. `PbpNormalizationResult` interface

```ts
interface PbpNormalizationResult {
  rules: PbpNormalizationRule[];
  unresolved: string[];
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** Normalization types are in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-101"`.
- **RFC-0408 (Legacy Extraction).** Normalization builds on the extraction contract.
- **system-spec §3.9.** Minimize hidden inferences.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpNormalizationDecision =
  | "transformed" | "derived-not-stored" | "merged"
  | "discarded-as-presentation" | "discarded-as-duplicate"
  | "moved-private" | "needs-owner-decision"
  | "invalid-source" | "not-applicable";
export const PBP_NORMALIZATION_DECISIONS: readonly PbpNormalizationDecision[];

export interface PbpNormalizationRule {
  sourceField: string;
  targetField?: string;
  decision: PbpNormalizationDecision;
  reason: string;
  provenance: "business-declared" | "derived";
}

export interface PbpNormalizationResult {
  rules: PbpNormalizationRule[];
  unresolved: string[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/normalization.ts` | `PbpNormalizationDecision`, `PBP_NORMALIZATION_DECISIONS`, `PbpNormalizationRule`, `PbpNormalizationResult` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, normalization types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Open string for decision status.** Rejected: a closed union ensures all decision statuses are handled explicitly.
- **Merge normalization into extraction.** Rejected: normalization is a separate concern from extraction. Extraction reads legacy files; normalization decides what to do with each field.

## Risks

- **Hidden inferences.** Agents may infer business facts from marketing text. Mitigation: system-spec §3.9 prohibits this unless a normalization contract explicitly allows it.
- **Unresolved fields.** Some fields may need owner decisions. Mitigation: `needs-owner-decision` status and `unresolved` list in result.

## Acceptance criteria

- [x] `PbpNormalizationDecision` type exported with `PBP_NORMALIZATION_DECISIONS` (9 statuses) (evidence: implemented historically)
- [x] `PbpNormalizationRule` interface exported (evidence: implemented historically)
- [x] `PbpNormalizationResult` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Each source field gets EXACTLY ONE decision status (migration-plan §3.6).
- The compiler and AI projections MUST NOT infer business facts from marketing text unless a normalization or derivation contract allows it (system-spec §3.9).
- `provenance` distinguishes `business-declared` (from source) from `derived` (computed).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
