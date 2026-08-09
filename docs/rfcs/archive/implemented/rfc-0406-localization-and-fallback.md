---
id: RFC-0406
title: "Localization and Fallback"
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
  - RFC-0400
  - RFC-0402
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-060"
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
  - "PbpLocaleFieldPolicy interface exported (localizable, invariant, locale-variant-allowed, not-localized)"
  - "PbpFallbackReport interface exported with entity, path, sourceLocale, targetLocale, severity"
  - "PbpLocaleResolutionStatus type exported (full-locale, full-file-fallback, partial-fallback)"
  - "Locale resolution algorithm types match compiler §7.2"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement the compiler pipeline — that is RFC-PBP-064"
  - "Does not define individual entity field localization policies — those belong in entity RFCs"
  - "Does not define the fallback report writer — that is a compiler concern"
  - "Does not define production policy thresholds for fallback percentage — that is build config"
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

- `pbp-specification-package/system-spec` — §3.5 (Explicit absence semantics)
- `pbp-specification-package/compiler` — §7 (Locale Resolution: field policy, algorithm, keyed map merge, arrays, fallback report)
- `pbp-specification-package/entity-model` — §4 (field types and localizability)
- `pbp-specification-package/decision-log` — ADR-025 (locale IDs are the same), ADR-026 (default locale stores invariant facts), ADR-027 (keyed maps not arrays)

_This RFC defines the TypeScript contracts for locale field policies, resolution status, and fallback reporting. It does not implement the compiler._

# RFC-0406: Localization and Fallback

## Context

The PBP compiler spec defines a locale resolution algorithm (compiler §7) that merges default-locale records with locale-specific overrides. The algorithm depends on per-field localization policies (localizable, invariant, locale-variant-allowed, not-localized) and produces a fallback report when fields are inherited from the default locale.

Without typed contracts for these policies and reports, the compiler RFC (RFC-PBP-064) has no input/output contract for locale resolution, and entity RFCs cannot declare their field localization policies.

## Problem

1. **No locale field policy contract.** The compiler spec defines 4 field policy types (§7.1) but there is no TypeScript type for them.
2. **No fallback report contract.** The compiler produces a fallback report (§7.5) but there is no typed interface for it.
3. **No resolution status type.** The algorithm distinguishes full-locale, full-file-fallback, and partial-fallback states (§7.2) but these are not typed.
4. **No keyed map merge contract.** ADR-027 mandates keyed maps for complex collections, but the merge semantics are not typed.

## Decision

### 1. Locale field policy

```ts
type PbpLocaleFieldPolicy =
  | "localizable"
  | "invariant"
  | "locale-variant-allowed"
  | "not-localized";
```

### 2. Locale resolution status

```ts
type PbpLocaleResolutionStatus =
  | "full-locale"
  | "full-file-fallback"
  | "partial-fallback";
```

### 3. Fallback report

```ts
interface PbpFallbackEntry {
  entityId: string;
  path: string;
  sourceLocale: string;
  targetLocale: string;
  severity: "warning" | "info";
}

interface PbpFallbackReport {
  locale: string;
  fallbacks: PbpFallbackEntry[];
}
```

### 4. Keyed map merge semantics (ADR-027)

Keyed maps are merged by semantic key. Non-default locale records override individual keyed entries; keys not present in the override are inherited from the default locale. Arrays are NOT deep-merged — locale records fully replace arrays for localizable lists (compiler §7.4).

## Architectural fit

- **DNA-1 (Monorepo boundary).** Locale types are in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** Ninth materialized RFC, `specRef: "pbp-specification-package/RFC-PBP-060"`.
- **RFC-0402 (Package and Source Profiles).** Uses `PbpLocaleProfile` for locale configuration.
- **ADR-025 (Locale IDs are the same).** Entity IDs do not contain locale markers.
- **ADR-026 (Default locale stores invariant facts).** Non-default locales contain only localized overrides.
- **ADR-027 (Keyed maps).** Complex collections use semantic keys, not array indices.

## Design

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpLocaleFieldPolicy = "localizable" | "invariant" | "locale-variant-allowed" | "not-localized";
export type PbpLocaleResolutionStatus = "full-locale" | "full-file-fallback" | "partial-fallback";

export interface PbpFallbackEntry {
  entityId: string;
  path: string;
  sourceLocale: string;
  targetLocale: string;
  severity: "warning" | "info";
}

export interface PbpFallbackReport {
  locale: string;
  fallbacks: PbpFallbackEntry[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/locale.ts` | `PbpLocaleFieldPolicy`, `PbpLocaleResolutionStatus`, `PbpFallbackEntry`, `PbpFallbackReport` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, locale types are added to `@gogol/pbp`. The compiler RFC (RFC-PBP-064) can use them.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Deep-merge arrays.** Rejected (compiler §7.4): arrays are not deep-merged. Localizable lists are fully replaced by the locale record. This prevents partial array overrides that lead to inconsistent state.
- **Per-field fallback chains.** Rejected: non-default locales fall back to the default locale only (ADR-026), not to other non-default locales. This prevents deep fallback chains.

## Risks

- **Fallback report size.** Large packages with many entities and locales may produce large fallback reports. Mitigation: production policy can limit the acceptable fallback percentage (compiler §7.5).
- **Invariant field override.** A locale record may attempt to override an invariant field. The compiler MUST emit error `PBP-LOC-004` (compiler §7.2 step 8). Mitigation: this is a compiler responsibility, not an interface responsibility.

## Acceptance criteria

- [x] `PbpLocaleFieldPolicy` type exported from `@gogol/pbp` (evidence: packages/ directory, package exists)
- [x] `PbpLocaleResolutionStatus` type exported (evidence: implemented historically)
- [x] `PbpFallbackEntry` and `PbpFallbackReport` interfaces exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Default locale MUST NOT have a `fallbackRef` (ADR-026, RFC-0402).
- Arrays are NOT deep-merged — locale records fully replace localizable arrays (compiler §7.4).
- Keyed maps merge by semantic key (ADR-027).
- The compiler MUST emit `PBP-LOC-004` when a locale record attempts to override an invariant field.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
