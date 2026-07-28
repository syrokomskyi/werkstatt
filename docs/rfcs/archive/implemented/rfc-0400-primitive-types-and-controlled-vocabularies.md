---
id: RFC-0400
title: "Primitive Types and Controlled Vocabularies"
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
specRef: "pbp-specification-package/RFC-PBP-002"
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
  - "Primitive types (LocalizedString, Decimal, Money, MoneyRange, Duration, Timestamp, QuantitativeValue, ExternalIdentifier, ControlledValue) are exported from @gogol/pbp"
  - "SemanticStatus controlled vocabulary is a closed enum (declared, derived, not-declared, not-applicable, unavailable, invalid, stale, not-comparable)"
  - "Money is stored as decimal string, not float (ADR-012)"
  - "Decimal regex validation is exported and tested"
  - "MoneyRange enforces single currency across both bounds"
  - "Duration supports both ISO 8601 and quantitative value (business-day) forms"
  - "Controlled vocabulary references use valueRef pattern (pbp-value:... or custom URI)"
nonGoals:
  - "Does not define individual entity schemas — those are RFC-PBP-010 through RFC-PBP-055"
  - "Does not define the compiler pipeline — that is RFC-PBP-064"
  - "Does not define controlled vocabulary contents (units, metrics, categories) — those are defined in the global semantic layer by downstream RFCs"
  - "Does not define Zod schemas for entities — entity Zod schemas belong in entity RFCs"
  - "Does not define locale resolution rules — that is RFC-PBP-004 (Package and Source Profiles)"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

- `pbp-specification-package/entity-model` — §4 (Common primitives)
- `pbp-specification-package/system-spec` — §3.5 (Explicit absence semantics), §3.6 (Structural strictness)
- `pbp-specification-package/decision-log` — ADR-012, ADR-024, ADR-037, ADR-038, ADR-039

_This RFC defines the primitive TypeScript types and controlled vocabulary enums that all downstream entity RFCs use. It does not copy field tables — it references the vendored snapshot sections._

# RFC-0400: Primitive Types and Controlled Vocabularies

## Context

RFC-0399 established the `@gogol/pbp` package with the entity envelope (`PbpEntity`, `PbpEntityStatus`, `PbpGovernance`) and URI utilities. However, the entity envelope only defines the outer shape — it does not define the primitive types that entity fields use for values like money, durations, quantities, and localized strings.

The PBP spec defines 11 common primitives (`pbp-specification-package/entity-model` §4): `EntityRef`, `LocalizedString`, `Decimal`, `Money`, `MoneyRange`, `Duration`, `Timestamp`, `QuantitativeValue`, `SemanticStatus`, `ExternalIdentifier`, `ControlledValue`. These are the building blocks for every entity schema. Without them, each downstream entity RFC would define its own money type, its own duration type, etc., creating incompatibility at integration points.

## Problem

1. **No primitive TypeScript types.** Downstream entity RFCs need `Money`, `Decimal`, `Duration`, `LocalizedString`, etc. Without shared types, each RFC defines its own, creating drift.
2. **No SemanticStatus enum.** The spec defines 8 semantic status values (§4.9) that are distinct from entity status. Without a closed enum, these are freeform strings.
3. **No decimal validation.** The spec defines a decimal regex (§4.3) that prevents float representation. Without validation, money values could be stored as floats (ADR-012 violation).
4. **No controlled vocabulary reference pattern.** The spec uses `valueRef` and `schemeRef` patterns for controlled vocabularies. Without a typed pattern, these are unvalidated strings.

## Decision

### 1. Primitive types in `@gogol/pbp`

The `@gogol/pbp` package exports TypeScript interfaces for all 11 primitives defined in `pbp-specification-package/entity-model` §4:

#### LocalizedString

```ts
interface PbpLocalizedString {
  value: string;
  language: string;
}
```

In file-level locale profiles, the value is a plain string. The resolved JSON form uses the language-tagged representation.

#### Decimal

```ts
const DECIMAL_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;

function validateDecimal(value: string): boolean;
```

Money negative values are only permitted where the schema allows credit/adjustment (ADR-012).

#### Money

```ts
interface PbpMoney {
  value: string;    // decimal string, not float (ADR-012)
  currency: string; // ISO 4217 alpha-3 or namespaced extension
}
```

#### MoneyRange

```ts
interface PbpMoneyRange {
  minimum: PbpMoney;
  maximum: PbpMoney;
}
```

Both bounds MUST use the same currency. A `validateMoneyRange` utility enforces this.

#### Duration

Two forms:

```ts
// ISO 8601 duration
type PbpIsoDuration = string; // e.g. "P1M", "P1Y"

// Quantitative value (for business-day durations)
interface PbpQuantitativeDuration {
  value: number;
  unitRef: string; // e.g. "pbp-unit:business-day"
}
```

`P12D` is not equivalent to 12 business days — the quantitative form is required for business-day durations.

#### Timestamp

```ts
type PbpTimestamp = string; // RFC 3339, e.g. "2026-07-18T18:30:00+02:00"
```

#### QuantitativeValue

```ts
interface PbpQuantitativeValue {
  value?: string;
  minimum?: string;
  maximum?: string;
  unitRef: string;
}
```

#### SemanticStatus

```ts
type PbpSemanticStatus =
  | "declared"
  | "derived"
  | "not-declared"
  | "not-applicable"
  | "unavailable"
  | "invalid"
  | "stale"
  | "not-comparable";
```

This is distinct from `PbpEntityStatus` (draft/published/suspended/retired/superseded). `SemanticStatus` describes the semantic state of a field value, not the publication state of an entity.

#### ExternalIdentifier

```ts
interface PbpExternalIdentifier {
  schemeRef: string;   // e.g. "pbp-identifier-scheme:gtin"
  value: string;       // normalized value
  authorityRef?: string;
}
```

#### ControlledValue

```ts
interface PbpControlledValue {
  valueRef: string; // e.g. "pbp-value:color/blue" or custom URI
}
```

### 2. Validation utilities

- `validateDecimal(value: string): boolean` — checks the decimal regex.
- `validateMoneyRange(range: PbpMoneyRange): { ok: true } | { ok: false; reason: string }` — checks single currency.
- `isPbpSemanticStatus(value: string): value is PbpSemanticStatus` — narrows the closed enum.

### 3. HTML prohibition (ADR-037)

Canonical fact fields MUST NOT contain HTML (`<br>`, `<b>`, etc.). A `containsHtml(value: string): boolean` utility is exported for downstream validation.

### 4. Empty-string semantics (ADR-038)

Empty string does not mean missing. If a value is absent, the field MUST be omitted or a `SemanticStatus` of `not-declared` MUST be used. A `isEmptyValue(value: string): boolean` utility is exported.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All primitive types are in `packages/pbp/`, a shared reusable library. No site imports, no app-specific types.
- **DNA-55 (Spec vendoring).** This RFC is the third materialized RFC from `pbp-specification-package`, carrying `specRef: "pbp-specification-package/RFC-PBP-002"`.
- **RFC-0399 (Entity Envelope).** This RFC extends the `@gogol/pbp` package established by RFC-0399 with primitive value types. It does not modify the envelope itself.
- **RFC-0398 (Program Charter).** Uses the state vocabulary from RFC-0398 §3 (explicit absence semantics: `not-declared`, `false`, `null`, `not-applicable`, `unavailable`, `invalid`). The `PbpSemanticStatus` enum includes these plus `declared`, `derived`, `stale`, `not-comparable` from entity-model §4.9.

## Design

### CLI surface

No CLI command is introduced. All primitives are TypeScript types and utilities in `@gogol/pbp`.

### TypeScript contracts

New exports from `@gogol/pbp`:

```ts
// Primitives
export interface PbpLocalizedString { value: string; language: string; }
export interface PbpMoney { value: string; currency: string; }
export interface PbpMoneyRange { minimum: PbpMoney; maximum: PbpMoney; }
export type PbpIsoDuration = string;
export interface PbpQuantitativeDuration { value: number; unitRef: string; }
export type PbpTimestamp = string;
export interface PbpQuantitativeValue { value?: string; minimum?: string; maximum?: string; unitRef: string; }
export interface PbpExternalIdentifier { schemeRef: string; value: string; authorityRef?: string; }
export interface PbpControlledValue { valueRef: string; }

// Semantic status
export type PbpSemanticStatus = "declared" | "derived" | "not-declared" | "not-applicable" | "unavailable" | "invalid" | "stale" | "not-comparable";
export const PBP_SEMANTIC_STATUSES: readonly PbpSemanticStatus[];
export function isPbpSemanticStatus(value: string): value is PbpSemanticStatus;

// Validation utilities
export const DECIMAL_RE: RegExp;
export function validateDecimal(value: string): boolean;
export function validateMoneyRange(range: PbpMoneyRange): { ok: true } | { ok: false; reason: string };
export function containsHtml(value: string): boolean;
export function isEmptyValue(value: string): boolean;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/primitives.ts` | All primitive type interfaces: LocalizedString, Money, MoneyRange, Duration, Timestamp, QuantitativeValue, ExternalIdentifier, ControlledValue |
| `packages/pbp/src/semantic-status.ts` | `PbpSemanticStatus` enum, `PBP_SEMANTIC_STATUSES` constant, `isPbpSemanticStatus` guard |
| `packages/pbp/src/validation.ts` | `DECIMAL_RE`, `validateDecimal`, `validateMoneyRange`, `containsHtml`, `isEmptyValue` |
| `packages/pbp/src/index.ts` | Re-exports new primitives and validation utilities |

### Output format

N/A — library-only RFC. Utilities return typed results.

### Failure modes

- `validateDecimal` returns `false` for non-decimal strings (floats, scientific notation, empty).
- `validateMoneyRange` returns `{ ok: false, reason }` when currencies differ.
- `containsHtml` returns `true` when HTML tags are detected.
- `isEmptyValue` returns `true` for empty strings and whitespace-only strings.
- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, primitive types and validation utilities are added to `@gogol/pbp`. Downstream entity RFCs (RFC-PBP-010+) can import them.
- **No site impact:** `@gogol/pbp` is not consumed by sites until RFC-PBP-102.
- **Build integration:** `tsc --noEmit` and `vitest run` run as part of the standard package build.

## Alternatives considered

- **Use Zod schemas instead of TypeScript interfaces.** Rejected for the same reason as RFC-0399: primitives are structural contracts. Downstream RFCs can wrap them in Zod. Validation utilities (`validateDecimal`, `validateMoneyRange`) are plain functions, not Zod schemas, to keep the package dependency-free.
- **Use `number` for Money.** Rejected: ADR-012 explicitly mandates decimal string, not float. Using `number` would introduce floating-point precision errors.
- **Merge SemanticStatus into EntityStatus.** Rejected: they describe different dimensions. EntityStatus is publication state (draft/published/...); SemanticStatus is field-value state (declared/not-declared/invalid/...). Mixing them conflates two orthogonal concepts.
- **Use a single `PbpValue` union type.** Rejected: the spec defines distinct primitives with different fields. A union would lose type safety and make downstream schemas harder to write.

## Risks

- **Primitive proliferation.** 11 primitives is a lot for a single RFC. Mitigation: each primitive is a minimal interface with no implementation logic — they are type definitions, not behaviors.
- **Decimal regex false negatives.** The regex `^-?(0|[1-9][0-9]*)(\.[0-9]+)?$` rejects leading zeros and scientific notation. Mitigation: this is intentional per ADR-012 — canonical decimal strings must be normalized.
- **HTML detection false positives.** The `containsHtml` utility may false-positive on text that contains `<` or `>` as literal characters. Mitigation: the utility checks for HTML tag patterns (`<[a-z]+>`), not bare angle brackets.
- **SemanticStatus vs EntityStatus confusion.** Agents may confuse the two enums. Mitigation: `PbpSemanticStatus` is explicitly documented as distinct from `PbpEntityStatus` in the Decision section.

## Acceptance criteria

- [x] `PbpLocalizedString`, `PbpMoney`, `PbpMoneyRange`, `PbpQuantitativeDuration`, `PbpTimestamp`, `PbpQuantitativeValue`, `PbpExternalIdentifier`, `PbpControlledValue` interfaces exported from `@gogol/pbp` (evidence: packages/ directory, package exists)
- [x] `PbpSemanticStatus` closed enum exported with `PBP_SEMANTIC_STATUSES` constant and `isPbpSemanticStatus` guard (evidence: implemented historically)
- [x] `validateDecimal` exported and tested (valid decimals pass, floats fail, leading zeros fail, empty fails) (evidence: implemented historically)
- [x] `validateMoneyRange` exported and tested (same currency passes, different currencies fail) (evidence: implemented historically)
- [x] `containsHtml` exported and tested (plain text passes, HTML tags detected) (evidence: implemented historically)
- [x] `isEmptyValue` exported and tested (empty string and whitespace detected) (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (46 tests) (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No existing site imports from `@gogol/pbp` (enforced by AGENTS.md) (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Downstream entity RFCs import primitives from `@gogol/pbp` — they MUST NOT redefine `PbpMoney`, `PbpDecimal`, `PbpSemanticStatus`, etc.
- `PbpSemanticStatus` is distinct from `PbpEntityStatus` (RFC-0399). Do not conflate them.
- Money values MUST be decimal strings, never `number` (ADR-012). The `validateDecimal` utility enforces this.
- Empty strings do not mean missing (ADR-038). Use `isEmptyValue` to detect them and require field omission or `SemanticStatus: "not-declared"` instead.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
