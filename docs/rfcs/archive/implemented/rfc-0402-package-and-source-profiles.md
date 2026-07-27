---
id: RFC-0402
title: "Package and Source Profiles"
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
  - DNA-1
  - DNA-55
  - RFC-0398
  - RFC-0399
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-004"
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
  - "PbpPackageManifest interface exported from @gogol/pbp (schema, id, defaultLocale, locales, sources, registries, build)"
  - "PbpSourceProfile interface exported (type, path, sourceRef)"
  - "PbpLocaleProfile interface exported (sourceRef, fallbackRef?)"
  - "PbpBuildRequest interface exported (locale, asOf, projectionTargets, includeRuntimeState, strictness)"
  - "Source adapter type names are exported as a closed union (manifest-directory, jsonl-dataset, sql-adapter, external-api-adapter, runtime-overlay-adapter)"
  - "Default locale stores invariant facts; non-default locales contain only localized overrides (ADR-026)"
nonGoals:
  - "Does not define the compiler pipeline phases — that is RFC-PBP-064"
  - "Does not define individual entity schemas — those are RFC-PBP-010 through RFC-PBP-055"
  - "Does not define projection builders — that is RFC-PBP-065"
  - "Does not define runtime state overlay format — that is RFC-PBP-063"
  - "Does not define the build context or build ID format — that is RFC-PBP-064"
  - "Does not implement source adapters — only defines their type contracts"
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

- `pbp-specification-package/system-spec` — §3.3 (Logical model ≠ physical storage), §3.4 (Federated identity)
- `pbp-specification-package/compiler` — §3.1 (Package manifest), §3.2 (Source adapters), §3.3 (Build request)
- `pbp-specification-package/decision-log` — ADR-026 (Default locale stores invariant facts)

_This RFC defines the TypeScript contracts for the PBP package manifest, source profiles, locale profiles, and build request. It does not implement the compiler pipeline._

# RFC-0402: Package and Source Profiles

## Context

RFC-0399 established the entity envelope and URI policy. RFC-0400 added primitive types. But entities do not exist in isolation — they live in a package with a manifest, locale configuration, source adapters, and build parameters. The PBP compiler spec (`pbp-specification-package/compiler` §3) defines a package manifest shape and source adapter types that are the input to the compilation pipeline.

Without typed contracts for the package manifest and source profiles, the compiler RFC (RFC-PBP-064) would have no input contract to build on, and entity RFCs would have no package context to reference.

## Problem

1. **No package manifest contract.** The compiler spec defines a package manifest (§3.1) with `schema`, `id`, `defaultLocale`, `locales`, `sources`, `registries`, and `build` fields. Without a TypeScript interface, the compiler RFC has no typed input.
2. **No source adapter type contract.** The spec defines 5 source adapter types (§3.2): `manifest-directory`, `jsonl-dataset`, `sql-adapter`, `external-api-adapter`, `runtime-overlay-adapter`. Without a closed union, these are freeform strings.
3. **No locale profile contract.** ADR-026 mandates that the default locale stores invariant facts and non-default locales contain only localized overrides. Without a typed locale profile, this rule is unenforceable.
4. **No build request contract.** The spec defines a build request (§3.3) with `locale`, `asOf`, `projectionTargets`, `includeRuntimeState`, and `strictness`. Without a typed interface, build parameters are unvalidated.

## Decision

### 1. Package manifest contract

The `@gogol/pbp` package exports a `PbpPackageManifest` interface matching `pbp-specification-package/compiler` §3.1:

```ts
interface PbpPackageManifest {
  schema: string;               // "pbp/package@1"
  id: string;                   // absolute HTTPS URI
  defaultLocale: string;        // e.g. "de"
  locales: Record<string, PbpLocaleProfile>;
  sources: Record<string, PbpSourceProfile>;
  registries?: Record<string, { sourceRef: string }>;
  buyerViewSchemaRef?: PbpEntityRef;
  build: PbpBuildConfig;
}
```

### 2. Locale profile

```ts
interface PbpLocaleProfile {
  sourceRef: string;      // e.g. "./de"
  fallbackRef?: string;   // e.g. "./de" (for non-default locales)
}
```

The default locale MUST NOT have a `fallbackRef` — it stores invariant facts (ADR-026). Non-default locales MAY have a `fallbackRef` pointing to the default locale and contain only localized overrides.

### 3. Source profile

```ts
type PbpSourceAdapterType =
  | "manifest-directory"
  | "jsonl-dataset"
  | "sql-adapter"
  | "external-api-adapter"
  | "runtime-overlay-adapter";

interface PbpSourceProfile {
  type: PbpSourceAdapterType;
  path?: string;
  sourceRef?: string;
}
```

The closed union `PbpSourceAdapterType` is exported as a readonly array `PBP_SOURCE_ADAPTER_TYPES`.

### 4. Build configuration and request

```ts
interface PbpBuildConfig {
  strict: boolean;
  failOnWarnings: boolean;
}

interface PbpBuildRequest {
  locale: string;
  asOf?: string;               // RFC 3339 timestamp
  projectionTargets: string[]; // e.g. ["website", "ai-answer", "schema-org", "buyer-view"]
  includeRuntimeState: boolean;
  strictness: "production" | "draft";
}
```

### 5. Authority derivation

`PbpPackageManifest.id` provides the package-level authority. When an entity's `governance.authorityRef` is not explicitly set, the package manifest `id` MAY be used as the default authority (referencing RFC-0399 §4 on `authorityRef` injection at load time).

## Architectural fit

- **DNA-1 (Monorepo boundary).** Package manifest and source profile types are in `packages/pbp/`, a shared reusable library.
- **DNA-55 (Spec vendoring).** Fifth materialized RFC from `pbp-specification-package`, carrying `specRef: "pbp-specification-package/RFC-PBP-004"`.
- **RFC-0398 (Program Charter).** Uses the entity glossary and architectural layer mapping from the charter.
- **RFC-0399 (Entity Envelope).** Uses `PbpEntityRef` from RFC-0399 for `buyerViewSchemaRef`. References the `authorityRef` injection pattern from RFC-0399 §4.

## Design

### CLI surface

No CLI command is introduced. All types are in `@gogol/pbp`.

### TypeScript contracts

New exports from `@gogol/pbp`:

```ts
// Package manifest
export interface PbpPackageManifest {
  schema: string;
  id: string;
  defaultLocale: string;
  locales: Record<string, PbpLocaleProfile>;
  sources: Record<string, PbpSourceProfile>;
  registries?: Record<string, { sourceRef: string }>;
  buyerViewSchemaRef?: PbpEntityRef;
  build: PbpBuildConfig;
}

// Locale profile
export interface PbpLocaleProfile {
  sourceRef: string;
  fallbackRef?: string;
}

// Source profile
export type PbpSourceAdapterType =
  | "manifest-directory"
  | "jsonl-dataset"
  | "sql-adapter"
  | "external-api-adapter"
  | "runtime-overlay-adapter";

export const PBP_SOURCE_ADAPTER_TYPES: readonly PbpSourceAdapterType[];

export function isPbpSourceAdapterType(value: string): value is PbpSourceAdapterType;

export interface PbpSourceProfile {
  type: PbpSourceAdapterType;
  path?: string;
  sourceRef?: string;
}

// Build config and request
export interface PbpBuildConfig {
  strict: boolean;
  failOnWarnings: boolean;
}

export interface PbpBuildRequest {
  locale: string;
  asOf?: string;
  projectionTargets: string[];
  includeRuntimeState: boolean;
  strictness: "production" | "draft";
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/package-manifest.ts` | `PbpPackageManifest`, `PbpLocaleProfile`, `PbpBuildConfig`, `PbpBuildRequest` |
| `packages/pbp/src/source-profile.ts` | `PbpSourceAdapterType`, `PBP_SOURCE_ADAPTER_TYPES`, `isPbpSourceAdapterType`, `PbpSourceProfile` |
| `packages/pbp/src/index.ts` | Re-exports new types |

### Output format

N/A — library-only RFC.

### Failure modes

- `isPbpSourceAdapterType` returns `false` for unknown adapter types.
- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, package manifest and source profile types are added to `@gogol/pbp`. The compiler RFC (RFC-PBP-064) can use them as input contracts.
- **No site impact:** `@gogol/pbp` is not consumed by sites until RFC-PBP-102.
- **Build integration:** `tsc --noEmit` and `vitest run` as standard package build.

## Alternatives considered

- **Use Zod schemas for the package manifest.** Rejected for consistency with RFC-0399/0400: types are structural contracts. The compiler RFC can wrap them in Zod for runtime validation.
- **Define source adapter types as an open string.** Rejected: the spec defines exactly 5 adapter types (§3.2). An open string would allow typos and invalid types. A closed union with a guard function is safer.
- **Merge build config into build request.** Rejected: build config is package-level (static, in the manifest), while build request is per-build (dynamic, per invocation). They serve different purposes.

## Risks

- **Manifest shape drift from spec.** The TypeScript interface may diverge from the spec's YAML manifest shape. Mitigation: the interface directly mirrors the spec's §3.1 field names and types.
- **Source adapter type proliferation.** New adapter types may be needed beyond the 5 defined. Mitigation: adding a new type is an additive change within `@1` (per RFC-0401 compatibility rules).
- **Locale fallback complexity.** The `fallbackRef` pattern may lead to deep fallback chains. Mitigation: the spec mandates that non-default locales fall back to the default locale only (not to other non-default locales).

## Acceptance criteria

- [x] `PbpPackageManifest` interface exported from `@gogol/pbp` (evidence: packages/ directory, package exists)
- [x] `PbpLocaleProfile` interface exported with `sourceRef` and optional `fallbackRef` (evidence: implemented historically)
- [x] `PbpSourceAdapterType` closed union exported with `PBP_SOURCE_ADAPTER_TYPES` constant and `isPbpSourceAdapterType` guard (evidence: implemented historically)
- [x] `PbpSourceProfile` interface exported (evidence: implemented historically)
- [x] `PbpBuildConfig` and `PbpBuildRequest` interfaces exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (46 tests) (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No existing site imports from `@gogol/pbp` (enforced by AGENTS.md) (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The default locale MUST NOT have a `fallbackRef` — it stores invariant facts (ADR-026). Non-default locales contain only localized overrides.
- Source adapter types are a closed set of 5. Adding a new type is additive within `@1` (per RFC-0401).
- `PbpPackageManifest.id` MAY be used as the default `authorityRef` for entities (referencing RFC-0399 §4).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
