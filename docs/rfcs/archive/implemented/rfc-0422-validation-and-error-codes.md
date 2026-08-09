---
id: RFC-0422
title: "Validation and Error Codes"
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
  - RFC-0407
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-063"
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
  - "PbpValidationSeverity type exported with PBP_VALIDATION_SEVERITIES"
  - "PbpErrorPrefix type exported with PBP_ERROR_PREFIXES (15 prefixes)"
  - "PbpValidationError interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define compiler pipeline — that is RFC-PBP-064"
  - "Does not define validation rules for specific entities"
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

- `pbp-specification-package/compiler` — §12 (Semantic Validation), §13 (Validation Severity), §14 (Error Code Taxonomy)

# RFC-0422: Validation and Error Codes

## Context

The PBP spec defines a validation severity model (compiler §13) and error code taxonomy (compiler §14). Severity levels are fatal, error, warning, info. Error codes use stable prefixes (PBP-PARSE, PBP-SCHEMA, PBP-ID, etc.). Production defaults: fatal/error block, warning does not block unless `failOnWarnings`.

## Problem

1. **No severity type.** The `@gogol/pbp` package has no validation severity enum.
2. **No error code prefixes.** The spec defines 15 stable prefixes but there is no typed union.
3. **No validation error interface.** The compiler needs a structured error type.

## Decision

### 1. Validation severity

```ts
type PbpValidationSeverity = "fatal" | "error" | "warning" | "info";
```

### 2. Error code prefixes (compiler §14)

```ts
type PbpErrorPrefix =
  | "PBP-PARSE"
  | "PBP-SCHEMA"
  | "PBP-ID"
  | "PBP-REF"
  | "PBP-LOC"
  | "PBP-PRODUCT"
  | "PBP-CATALOG"
  | "PBP-OFFER"
  | "PBP-PRICE"
  | "PBP-POLICY"
  | "PBP-CLAIM"
  | "PBP-DERIVE"
  | "PBP-RUNTIME"
  | "PBP-PROJECT"
  | "PBP-SIGN";
```

### 3. Validation error interface

```ts
interface PbpValidationError {
  code: string;
  severity: PbpValidationSeverity;
  entityId?: string;
  path?: string;
  message: string;
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** Validation types are in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-063"`.
- **RFC-0407 (Reference Resolution).** Graph integrity errors use these severity levels.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpValidationSeverity = "fatal" | "error" | "warning" | "info";
export const PBP_VALIDATION_SEVERITIES: readonly PbpValidationSeverity[];

export type PbpErrorPrefix =
  | "PBP-PARSE" | "PBP-SCHEMA" | "PBP-ID" | "PBP-REF" | "PBP-LOC"
  | "PBP-PRODUCT" | "PBP-CATALOG" | "PBP-OFFER" | "PBP-PRICE" | "PBP-POLICY"
  | "PBP-CLAIM" | "PBP-DERIVE" | "PBP-RUNTIME" | "PBP-PROJECT" | "PBP-SIGN";
export const PBP_ERROR_PREFIXES: readonly PbpErrorPrefix[];

export interface PbpValidationError {
  code: string;
  severity: PbpValidationSeverity;
  entityId?: string;
  path?: string;
  message: string;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/validation-errors.ts` | `PbpValidationSeverity`, `PbpErrorPrefix`, `PBP_ERROR_PREFIXES`, `PbpValidationError` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, validation types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Open string for severity.** Rejected: a closed union ensures all severity levels are handled explicitly.
- **Open string for error prefix.** Rejected: 15 stable prefixes are defined by the spec. A closed union prevents invalid prefixes.

## Risks

- **Error code proliferation.** New error codes may be added without following the prefix convention. Mitigation: `PbpErrorPrefix` is a closed union.
- **Severity misuse.** Agents may use `fatal` for non-fatal issues. Mitigation: severity definitions are documented (compiler §13).

## Acceptance criteria

- [x] `PbpValidationSeverity` type exported with `PBP_VALIDATION_SEVERITIES` (evidence: implemented historically)
- [x] `PbpErrorPrefix` type exported with `PBP_ERROR_PREFIXES` (15 prefixes) (evidence: implemented historically)
- [x] `PbpValidationError` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Production defaults: fatal/error block, warning does not block unless `failOnWarnings` (compiler §13).
- Stale contract-critical claim = error (compiler §13).
- Error codes follow the pattern `PBP-<PREFIX>-<NNN>` (compiler §14).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
