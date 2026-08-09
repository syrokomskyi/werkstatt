---
id: RFC-0728
title: "Enforce pbpChargeSchema on offering pricing charges"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-07
updatedAt: 2026-08-07
enhancedAt: 2026-08-07
implementedAt: 2026-08-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0400
  - RFC-0437
  - RFC-0444
  - RFC-0466
  - pbp-specification-package/ADR-012
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-55
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/pbp"
successSignals:
  - "offeringSchema charges field uses pbpChargeSchema instead of z.unknown()"
  - "All 12 offering files (6 UK + 6 DE) have quoted decimal strings for value/unitValue/minimum/maximum fields"
  - "All 12 offering files (6 UK + 6 DE) have model discriminator on every charge amount"
  - "All 12 offering files (6 UK + 6 DE) have purpose field on every charge"
  - "pnpm --filter @warpgogol/pbp build:check passes"
  - "pnpm --filter @warpgogol/pbp test passes"
nonGoals:
  - "Does not enforce pbpPlanSchema on pricing.plans — left as z.unknown() for a follow-up RFC"
  - "Does not enforce pbpAdjustmentSchema on pricing.adjustments — left as z.unknown() for a follow-up RFC"
  - "Does not modify the presentation field (RFC-0482 legacy migration field)"
  - "Does not change the decimalString type or ADR-012 — this RFC applies the existing standard, not redefines it"
  - "Does not add new kernel commands or validators"
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

# RFC-0728: Enforce pbpChargeSchema on offering pricing charges

## Context

The PBP specification (vendored at `docs/specs/pbp-specification-package/`) mandates that monetary values be stored as decimal strings (ADR-012: `"70.00"`, not float). RFC-0400 implemented the `decimalString` primitive type and `validateDecimal` utility. RFC-0437 defined `PbpCharge`, `PbpChargeAmount`, and `PbpChargeType` TypeScript interfaces. RFC-0466 created Zod schemas (`pbpChargeSchema`, `pbpChargeAmountSchema`) with a `model` discriminated union and `decimalString` enforcement.

However, the offering schema (`packages/pbp/src/schemas/offering.ts:42`) declares `charges` as `z.record(z.string(), z.unknown())` — the strict `pbpChargeSchema` is never applied. This means:

1. Decimal values can be written as YAML floats (`value: 70.00`) instead of strings (`value: "70.00"`), losing trailing zeros and violating ADR-012.
2. The `model` discriminator (`fixed`, `range`, `unit-rate`, `tiered`) is optional in practice — charges omit it entirely.
3. The `purpose` field (required by `pbpChargeSchema`) is absent from all offering files.

The warpgogol-com site (the only active site) is multilingual (DE + UK). Both language versions have 6 offering files each (12 total) with inconsistent charge data: `digital-foundation.md` uses unquoted decimals and lacks `model`/`purpose` in both UK and DE; `automation.md` has `model: range` but no `purpose`; others have neither `model` nor `purpose`.

## Problem

The `charges` field in `offeringSchema` (`packages/pbp/src/schemas/offering.ts:42`) uses `z.record(z.string(), z.unknown())`, bypassing the strict `pbpChargeSchema` defined in `packages/pbp/src/schemas/pricing.ts:37-46`. This creates three concrete risks:

1. **ADR-012 violation goes undetected.** YAML parses `value: 70.00` as float `70.0`, stripping trailing zeros. The schema does not reject this because `z.unknown()` accepts any type. For monetary values, this is a precision and formatting violation per `pbp-specification-package/01-PBP-System-Specification.md` §10.3 and §30 invariant #10.

2. **Missing `model` discriminator.** `pbpChargeAmountSchema` is a `z.discriminatedUnion("model", ...)` — every charge amount requires a `model` field (`fixed`, `range`, `unit-rate`, `tiered`). Without schema enforcement, 5 of 6 UK offering files omit `model` (same in DE), making charges structurally ambiguous.

3. **Missing `purpose` field.** `pbpChargeSchema` requires `purpose: nonEmptyString` — a semantic label for the charge (e.g. `subscription`, `activation`, `additional-service`). All 12 offering files (6 UK + 6 DE) omit it.

The strict `pbpChargeSchema` already exists (RFC-0466) but is never applied. This RFC closes the gap between the defined contract and the runtime schema.

## Decision

The `offeringSchema` `pricing.charges` field is changed from `z.record(z.string(), z.unknown())` to `z.record(z.string(), pbpChargeSchema)`, enforcing the strict charge schema defined in RFC-0466. All offering content files in both language versions (UK and DE, 12 files total) are updated to comply: decimal values are quoted strings, every charge amount has a `model` discriminator, and every charge has a `purpose` field.

## Architectural fit

- **DNA-55 (Spec vendoring contract).** By applying `pbp-specification-package/ADR-012` (decimal string money) to the runtime Zod schema, this RFC makes the vendored spec binding for charge data — the spec becomes the single source of truth not just in principle but at runtime. Without enforcement, the spec's ADR-012 decision is advisory; with it, the spec's contract is enforced during `astro build`. This protects DNA-55 by ensuring spec decisions are reflected in runtime schemas, not just documentation.
- **RFC-0400 (Primitive types).** Established `decimalString` and `validateDecimal`. This RFC uses the existing primitive — does not redefine it.
- **RFC-0437 (Pricing core).** Defined `PbpCharge` and `PbpChargeAmount` TypeScript interfaces. This RFC enforces them at the Zod schema level.
- **RFC-0466 (Runtime Zod schemas).** Created `pbpChargeSchema` and `pbpChargeAmountSchema`. This RFC applies them to `offeringSchema` — the schema was defined but never wired.
- **RFC-0444 (Usage/range/tiered pricing).** Extended charge amount types. This RFC ensures those types are enforced.

## Design

### CLI surface

No new CLI commands. The change is a schema enforcement in `@warpgogol/pbp` — the Astro content collection validation automatically applies the Zod schema at build time. Offering files that violate `pbpChargeSchema` will fail content collection parsing during `astro build` and `astro check`.

### TypeScript contracts

The change is a single import and type replacement in `packages/pbp/src/schemas/offering.ts`:

```ts
// Before
const pbpPricingSchema = z.object({
  currency: nonEmptyString,
  tax: z.record(z.string(), z.unknown()).optional(),
  charges: z.record(z.string(), z.unknown()).optional(),
  plans: z.record(z.string(), z.unknown()).optional(),
  adjustments: z.record(z.string(), z.unknown()).optional(),
});

// After
import { pbpChargeSchema } from "./pricing.js";

const pbpPricingSchema = z.object({
  currency: nonEmptyString,
  tax: z.record(z.string(), z.unknown()).optional(),
  charges: z.record(z.string(), pbpChargeSchema).optional(),
  plans: z.record(z.string(), z.unknown()).optional(),
  adjustments: z.record(z.string(), z.unknown()).optional(),
});
```

`plans` and `adjustments` remain `z.unknown()` — deferred to a follow-up RFC (see non-goals).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/schemas/offering.ts` | Schema change: `charges` field type |
| `packages/pbp/src/schemas/pricing.ts` | Source of `pbpChargeSchema` (no changes needed) |
| `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/uk/offerings/*.md` | 6 UK offering files updated to comply with schema |
| `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/de/offerings/*.md` | 6 DE offering files updated to comply with schema |

### Output format

N/A — no new commands. Schema violations surface as Astro content collection errors during `astro build` / `astro check` with standard Zod error messages.

### Failure modes

- **Astro content collection parse failure.** When an offering file has unquoted decimal values (parsed as YAML float), missing `model`, or missing `purpose`, `astro build` and `astro check` fail with Zod validation errors pointing to the offending file and field.
- **No silent coercion.** Unlike `z.unknown()`, `pbpChargeSchema` rejects non-conforming shapes — there is no fallback to untyped data.
- **`plans` and `adjustments` remain untyped.** Files with invalid plan/adjustment data do not fail — this is intentional (deferred to follow-up RFC).

## Rollout

- **Immediate, no grace period.** The schema change and content updates ship in the same implementation commit. There is no transitional period where the schema is strict but content is non-compliant.
- **Single site impact.** Warpgogol-com is the only active site. All 12 offering files (6 UK + 6 DE) are updated in the same mission workpiece. No multi-site migration needed.
- **No new commands.** Enforcement happens through the existing Astro content collection pipeline (`pbpCollections` from `@warpgogol/pbp/astro`). No `build.check` integration changes — the Zod schema is already wired into content collection parsing.
- **Follow-up RFC planned.** `pricing.plans` and `pricing.adjustments` remain `z.unknown()`. A separate RFC will enforce `pbpPlanSchema` and `pbpAdjustmentSchema` once plan/adjustment content is designed.

## Alternatives considered

- **Use `number` for money values instead of `decimalString`.** Rejected: ADR-012 explicitly mandates decimal string. IEEE 754 float precision errors (`0.1 + 0.2 = 0.30000000000000004`) are unacceptable for monetary values. JCS canonicalization for signatures requires stable string representation. This alternative was already rejected in RFC-0400.

- **Make `model` optional in `pbpChargeAmountSchema`.** Rejected: the PBP spec (§17) shows `model` in every charge amount example. Making it optional would weaken the discriminated union — Zod cannot discriminate without the field. The correct fix is adding `model` to content, not weakening the schema.

- **Enforce `plans` and `adjustments` in the same RFC.** Rejected: `plans` in `digital-foundation.md` is a placeholder string (`"{}"`), not a real plan object. Enforcing `pbpPlanSchema` would require designing real plan content — that is a content design task, not a schema enforcement task. Scope creep risk. Deferred to a follow-up RFC.

- **Add a custom kernel validator for charge compliance.** Rejected: the Zod schema already enforces the contract through Astro content collections. Adding a separate validator would duplicate enforcement and create maintenance burden.

## Risks

- **Build breakage on non-compliant content.** The schema change is fail-hard — any offering file missing `model` or `purpose`, or using unquoted decimals, will break `astro build`. Mitigation: all 12 offering files (6 UK + 6 DE) are updated in the same implementation commit.
- **Agent authoring friction.** Agents creating new offering files must know to include `model`, `purpose`, and quoted decimal strings. Mitigation: the Zod error messages are self-documenting (missing required field, invalid type). The `pbpChargeSchema` structure is visible in `packages/pbp/src/schemas/pricing.ts`.
- **`plans`/`adjustments` enforcement gap remains.** Until the follow-up RFC, `plans` and `adjustments` remain `z.unknown()`. Agents may assume all pricing sub-fields are typed. Mitigation: `nonGoals` section explicitly documents the deferral.
- **No `purpose` controlled vocabulary.** `pbpChargeSchema` types `purpose` as `nonEmptyString`, not an enum. Agents may use inconsistent values. Mitigation: PBP spec examples (`subscription`, `activation`, `additional-service`) serve as convention; a controlled vocabulary can be added in a future RFC without breaking changes.

## Acceptance criteria

- [x] `offeringSchema` in `packages/pbp/src/schemas/offering.ts` uses `z.record(z.string(), pbpChargeSchema)` for `charges` instead of `z.record(z.string(), z.unknown())` (evidence: packages/pbp/src/schemas/offering.ts:43, build:check passed)
- [x] All 12 offering files (6 UK + 6 DE) have quoted decimal strings for all `value`, `unitValue`, `minimum`, `maximum` fields (evidence: missions/warpgogol-com-m000035/workpiece/src/content/business-profile/{uk,de}/offerings/*.md)
- [x] All 12 offering files (6 UK + 6 DE) have `model` discriminator on every charge amount (`fixed`, `range`, `unit-rate`, or `tiered`) (evidence: missions/warpgogol-com-m000035/workpiece/src/content/business-profile/{uk,de}/offerings/*.md)
- [x] All 12 offering files (6 UK + 6 DE) have `purpose` field on every charge (evidence: missions/warpgogol-com-m000035/workpiece/src/content/business-profile/{uk,de}/offerings/*.md)
- [x] `pnpm --filter @warpgogol/pbp build:check` passes (typecheck) (evidence: tsc --noEmit exit code 0)
- [x] `pnpm --filter @warpgogol/pbp test` passes (evidence: 178 passed, 20 pre-existing failures unrelated to RFC-0728 — confirmed via git stash)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate --id RFC-0728 status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- When updating offering content files, agents MUST quote all decimal string values (e.g. `"70.00"`, not `70.00`) to prevent YAML float coercion.
- When adding charges to offering files, agents MUST include `model` (one of `fixed`, `range`, `unit-rate`, `tiered`) and `purpose` (semantic label from PBP spec convention: `subscription`, `activation`, `additional-service`, `setup`).
- Agents MUST NOT add `model`/`purpose` to `plans` or `adjustments` — those remain `z.unknown()` until the follow-up RFC.
