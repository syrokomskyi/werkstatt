---
rfcId: RFC-0740
auditId: AUDIT-RFC-0740-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0740

## Verdict: Needs revision

The RFC is architecturally sound and well-structured, but has several findings: DNA-4 satisfaction is a stretch (generated files under `src/content/` are not "canonical content"), DNA-55 satisfaction is decorative (no spec vendoring occurs), the `derivation` block duplicates fields already in `trace`, and the command's relationship to the compiler pipeline is underspecified.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0740 --json` returned zero violations.

## Axis A — Structural completeness

1. **`chargeRef` format undefined.** The `PbpMaterializedDerivedPrice.chargeRef` field is `string`, but the RFC does not specify its format. Since `PbpPricing.charges` is `Record<string, unknown>` (keys are charge IDs), `chargeRef` should be documented as the charge key within `pricing.charges`, or as a fully-qualified URI. As-is, an implementor cannot determine how to populate it.

2. **`derivation.modelRef` undefined.** The `derivation.modelRef` field is `string` but the RFC does not explain what it references. Is it the `derivationContractRef` from `CurrencyPricingPolicy`? The `PbpDerivationContract.derivationRef`? The RFC should specify the expected value.

3. **`derivation.calculatedAt` format unspecified.** The field is `string` but no format is given (ISO 8601? build timestamp? epoch?). Should be ISO 8601 UTC for determinism.

4. **Generated file `.gitignore` location unspecified.** The RFC says the generated file is "added to `.gitignore`" but does not specify which `.gitignore` — the workpiece `.gitignore`, the monorepo root `.gitignore`, or a new one. Since generated files live in the workpiece, it should be the workpiece `.gitignore`.

5. **Command `scope` not declared.** The CLI surface shows `--system <id>` but the RFC does not declare whether the command is `scope: "app"` or `scope: "workspace"`. Existing commands that take `--system` (e.g. `mission.materialize`) are `scope: "workspace"`. The RFC should declare the scope explicitly.

6. **Output format missing standard envelope.** The output JSON shows `{ command, status, system, materializedCount, ... }` but does not include `exitCode` or the standard `KernelCommandResult` envelope shape. The RFC should document the `--json` output as a `KernelCommandResult` wrapper.

7. **Validation rules reference undefined concepts.** Rules 12 ("PriceDerivationModel has no version"), 13 ("Pipeline contains unsupported operation"), 23 ("Two active PriceDerivationModel versions overlap in time"), and 24 ("Projection attempts to modify the final amount") reference concepts not defined in this RFC or in any dependency RFC. "PriceDerivationModel" is mentioned in RFC-0735 decision #15 as a business-level model, but no RFC defines its type. Rule 24 references "Projection" which is RFC-0742's scope. These rules should either be defined here or deferred to their owning RFCs.

## Axis B — DNA alignment

1. **DNA-4 satisfaction is a stretch.** DNA-4 says "All user-visible copy, configuration, and metadata live in `src/content/`." The RFC places generated derived prices in `src/content/generated/derived-prices.json`. Generated build artifacts are not "canonical content" in the DNA-4 sense — they are derived outputs. The RFC argues this is "a generated subdirectory, not authored content," but DNA-4 does not distinguish generated vs. authored within `src/content/`. The RFC should either (a) place the file outside `src/content/` (e.g. `src/generated/` or a build cache directory), or (b) explicitly justify why generated files under `src/content/generated/` do not violate DNA-4's canonical content rule.

2. **DNA-55 satisfaction is decorative.** DNA-55 is the spec vendoring contract — it governs immutable snapshots of external specification packages. The RFC says "Follows the PBP compiler pattern (pure functions, deterministic output)." This describes a coding pattern, not spec vendoring. The RFC does not vendor any spec package. DNA-55 should be in `related[]` (the RFC extends the PBP namespace) not `satisfies[]` (the RFC does not enforce or extend the spec vendoring contract).

## Axis C — Ecosystem fit

1. **Command table registration not specified.** The RFC lists `packages/os/site-kernel-checks/src/derived-prices-materialize.ts` as the command handler but does not mention which command table file (`src/command-tables/*.ts`) the new `CheckCommandEntry` will be added to. The existing pattern requires adding an entry to one of the numbered table files (e.g. `04-content-quality.ts` or a new table file). The RFC should name the target table file.

2. **Relationship to `compilePbpProfile` unclear.** The RFC says the command "Reads the compiled PBP graph (from `pbp.compile` output)" but there is no `pbp.compile` kernel command. The compiler is invoked via `compilePbpProfile()` from `@warpgogol/pbp/compiler`. The RFC should specify whether the materialization command calls `compilePbpProfile()` internally, or reads a previously compiled graph from a file, or receives the graph as an input parameter.

3. **Pipeline placement deferred without declaration.** The RFC says "RFC-0741 integrates `derived-prices.materialize` into the `build-prepare` pipeline" but does not declare the pipeline placement intention in its own frontmatter or design section. The `commands.proposed` list is correct, but the RFC should note the target pipeline (`build-prepare`) and blocking vs. advisory behavior.

4. **File system responsibilities include another RFC's changes.** The table lists `packages/pbp/src/compiler/derivations.ts` with note "Dispatcher gains `currency-conversion` branch (from RFC-0739)". This is RFC-0739's responsibility, not RFC-0740's. Including it here creates ambiguity about which RFC owns that change. Remove it from this RFC's file system responsibilities or mark it clearly as "dependency — owned by RFC-0739, not modified by this RFC."

5. **`PbpPricing.charges` is `Record<string, unknown>`.** The RFC says "For each Charge in the Offering" and iterates `pricing.charges`, but the actual type is `Record<string, unknown>` — not `Record<string, PbpCharge>`. The materialization logic will need to cast or validate each entry as a `PbpCharge` before extracting `amount`. The RFC should acknowledge this type gap and specify how charges are accessed.

## Axis D — Forward-only compliance

No issues. The `derivedPrices?` optional field is a clean extension, not a compatibility shim. No migration, no legacy paths, no dual-path. The RFC explicitly states "No backward compatibility."

## Axis E — Agent-facing policy

1. **Validation rules include non-applicable items.** Rules 9, 20, 21, 22 are marked "not currently applicable." Including non-applicable rules in a binding RFC is speculative — they describe behavior for future phases that don't exist yet. These rules should be moved to their respective future RFCs (quote, contract, invoice, aggregate-then-convert) and removed from this RFC. Only rules that are enforceable in the current phase should be listed.

2. **No `NEEDS CLARIFICATION` markers found.** OK.

3. **Status gate language is correct.** "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." OK.

## Axis F — Pragmatism

1. **`derivation` block duplicates `trace` fields.** The `derivation` block contains `rateSnapshotRef`, `rateSnapshotDigest`, `rateValue`, `rateDirection` — all of which also appear in `trace.rate` (`trace.rate.value`, `trace.rate.direction`, `trace.rate.snapshotDigest`). The `derivation.modelRef` and `derivation.modelVersion` overlap with `trace.model.id` and `trace.model.version`. This is redundant. Either (a) justify the duplication (e.g. "flat fields for quick access without unwinding the trace"), or (b) remove the `derivation` block and use `trace` as the single source of provenance.

2. **`priceKind: "indicative"` is speculative.** The RFC says `indicative` is "reserved for future use" and "not produced in the current phase." Defining a union member with no producer is speculative generality. The `PbpPriceKind` union should be `"derived"` only for now, and `"indicative"` added by a future RFC when it is needed. Same for `PbpCommercialMeaning: "indicative"`.

3. **24 validation rules is heavy.** Of the 24 rules, 4 are non-applicable (see Axis E), and 4 reference undefined concepts (see Axis A). That leaves 16 actionable rules — still a large number. The RFC should consider whether all 16 are enforceable by this RFC's materialization command, or whether some belong in the compiler's semantic validation phase (Phase 10, `validateSemantic`).

## Axis G — Blind spots

1. **Cold start behavior unspecified.** What happens when `derived-prices.json` does not exist? The command should create it. But what happens if the site tries to read it before the command has run? The RFC should specify the site's behavior when the file is absent (e.g. "the site falls back to canonical prices only").

2. **Concurrent execution not considered.** Two builds running simultaneously could both write to `derived-prices.json`. The RFC should specify whether `writeFileIfChanged` (the standard generated-file write utility) is used, which mitigates race conditions by comparing content before writing.

3. **Offering without `pricing` or `charges` not considered.** Both `PbpOffering.pricing` and `PbpPricing.charges` are optional. The RFC's materialization step says "For each Offering with `pricing.charges`" but does not specify behavior when `pricing` is absent, `charges` is absent, or `charges` is empty. The command should skip such Offerings gracefully.

4. **`PbpChargeAmount` variant handling unspecified.** `PbpChargeAmount` is a discriminated union: `fixed`, `range`, `unit-rate`, `tiered`. The RFC says "For each Charge" but does not specify how derived prices are computed for non-`fixed` charge amounts (e.g. `range` with `minimum`/`maximum`, `tiered` with multiple tiers). The currency-conversion derivation (RFC-0739) takes `sourceAmount: string` — but for a `range` charge, there are two amounts. The RFC should specify that only `model: "fixed"` charges are materialized in the current phase, or define how other models are handled.

## Questions for the author

1. How does the materialization command obtain the compiled PBP graph — does it call `compilePbpProfile()` internally, read from a file, or receive it as a parameter? There is no `pbp.compile` kernel command to read from.

2. Why does `src/content/generated/derived-prices.json` live under `src/content/` when DNA-4 reserves that path for canonical authored content? Should it be in a build-output directory instead?

3. How are non-`fixed` `PbpChargeAmount` variants (range, unit-rate, tiered) handled during materialization? The derivation contract takes a single `sourceAmount: string`, but these variants have multiple or computed amounts.
