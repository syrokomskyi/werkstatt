---
rfcId: RFC-0872
auditId: AUDIT-RFC-0872-01
date: 2026-08-18
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0872

## Verdict: Needs revision

The RFC introduces a well-motivated `technical-assessment` evidence profile and policy-driven gate matrix, but has critical ecosystem-fit errors (wrong package paths, missing `@warpgogol/werkstatt` in `packagesImpacted`), missing required V-13 sections (Problem, Architectural fit, Design, Rollout, Alternatives, Risks, Implementation notes), and a forward-only violation (indefinite legacy boolean compatibility period).

## Mechanical validation (rfc.validate)

Pass — `exitCode: 0`, `ok: true`. 10 warnings:

- V-13: Missing required sections: `## Problem`, `## Architectural fit`, `## Design`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Implementation notes for agents`
- V-19: `amendedBy` not backfilled on RFC-0706, RFC-0707, RFC-0714 (3 warnings)

## Axis A — Structural completeness

- **Missing required sections** (V-13 confirmed): `## Problem`, `## Architectural fit`, `## Design`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Implementation notes for agents`. The RFC has `## Context` and `## Decision` but no `## Problem` section articulating the gap. No `## Rollout` describes default behavior or adoption path. No `## Alternatives considered` with a real alternative and rejection reason. No `## Risks` includes agent misinterpretation risk or false-positive rate. No `## Implementation notes for agents` with explicit behavioral rules.
- **No CLI surface**: The RFC does not show exact command invocations with flags for the changed commands (`nachweis.validate`, `nachweis.publish`, `nachweis.withdraw`, `nachweis.manifest.generate`). The `--json` output shape is not documented.
- **Acceptance criteria** are checkable and cover the decision's scope — this is good.

## Axis B — DNA alignment

- **DNA-46 (Mission lifecycle)**: The RFC amends `nachweis.withdraw` and publication gate behavior. Bordbuch entries are still used for lifecycle events. Alignment is implicit but not discussed in a `## Architectural fit` section — the RFC must explain how it extends the mission lifecycle without breaking existing Bordbuch semantics.
- **DNA-53 (Semantic fingerprint governance)**: The RFC requires "byte-equivalent normalized `assessment` values after canonical JSON serialization" for locale drift detection (line 198). The RFC does not name `@warpgogol/werkstatt/fingerprint` or `snapshotCanonicalJsonObjectV1` (RFC-0849) as the canonical JSON authority. This must be explicit — ad hoc canonical JSON is forbidden by DNA-53.
- **DNA-59 (Evidence preservation)**: The RFC says "leave immutable raw artifacts/Bordbuch history intact" for technical withdrawal (line 283). This aligns with DNA-59's append-only archive principle. No issue.

## Axis C — Ecosystem fit

- **CRITICAL — Wrong file paths**: The `## File responsibilities` section (lines 317–323) lists `packages/werkstatt-site/src/checks/nachweis/nachweis-publish.ts` etc. The actual nachweis kernel code lives in `packages/werkstatt/src/nachweis/nachweis-publish.ts` (engine package, post-RFC-0776 consolidation). The RFC-0776 migration moved nachweis code from `packages/os/site-kernel-handoff` to `@warpgogol/werkstatt`. The PBP entity code (`evidence-source.ts`) does live in `@warpgogol/werkstatt-site` — that path is correct.
- **CRITICAL — Missing `@warpgogol/werkstatt` in `packagesImpacted`**: The RFC lists `@warpgogol/werkstatt-site` and `@warpgogol/werkstatt-shared` but not `@warpgogol/werkstatt`. The nachweis command handlers (`nachweis-validate.ts`, `nachweis-publish.ts`, `nachweis-withdraw.ts`, `nachweis-manifest.ts`, `nachweis-io.ts`) all live in `@warpgogol/werkstatt`. This must be added.
- **`NACHWEIS_EVIDENCE_KINDS` sets**: Three locations hard-code the 4 attestation kinds and must be extended with `technical-assessment`: `nachweis-validate.ts:48-53`, `nachweis-manifest.ts` (NACHWEIS_EVIDENCE_KINDS), `nachweis-routes.ts:29-34` in `werkstatt-site`. The RFC does not mention these.
- **No AGENTS.md updates identified**: The RFC should specify whether `packages/werkstatt/AGENTS.md` or `packages/werkstatt-site/AGENTS.md` need updates for the new evidence kind and gate semantics.
- **Command lifecycle**: `commands.changed` lists `pbp.content.validate`, `nachweis.validate`, `nachweis.publish`, `nachweis.withdraw`, `nachweis.manifest.generate` — these are all existing registered commands. Internally consistent.

## Axis D — Forward-only compliance

- **Legacy boolean compatibility period**: Lines 271–275 state "for one transition period, `nachweis.validate --json` MAY expose the legacy booleans alongside `gateV2`" and "no caller may derive publishability from legacy booleans after this RFC is implemented." This is a dual-path. Forward-only discipline requires removal in the same RFC wave, not an indefinite grace period. The RFC must either (a) remove legacy booleans immediately and replace `NachweisPublicationGate` with `NachweisPublicationGateV2`, or (b) specify a concrete removal mechanism (e.g., "legacy booleans removed in RFC-0873"). An unspecified "transition period" is a forward-only violation.
- The `evaluateGate` function in `nachweis-validate.ts:97-142` and the inline gate in `nachweis-publish.ts:111-137` both compute legacy booleans. The RFC should specify that these are replaced by V2 gate evaluation, not kept alongside.

## Axis E — Agent-facing policy

- **Missing `## Implementation notes for agents`**: Required by V-13 and critical for agents to know behavioral rules (e.g., "agents MUST NOT fabricate Consent entities for technical-assessment records", "agents MUST NOT use `git commit --no-verify` to bypass cache-clone hooks").
- **No NEEDS CLARIFICATION markers** found.
- **No self-authorizing language** detected — the RFC is in `draft` status and does not claim implementation permission.

## Axis F — Pragmatism

- **`NachweisAssessmentDimension` field proliferation**: The interface has 10 optional fields (`score`, `numerator`, `denominator`, `status`, `level`, `experimental`, `min`, `max`, `samples`, `providerLabel`). Some may be speculative generality for the initial implementation with Lighthouse and Cloudflare Agent Readiness. The RFC should justify which fields are needed for the initial providers and which are speculative.
- **`operational-measurement-v1` policy**: Pragmatically reuses existing fields/Bordbuch metadata instead of defining a new schema. Good.
- **`packagesImpacted`** is missing `@warpgogol/werkstatt` (the engine package where nachweis commands live). This is a scope discipline failure.

## Axis G — Blind spots

- **Performance**: The locale drift check (line 198) requires canonical JSON serialization of `assessment` values across all locale copies. The RFC does not specify the number of locales or the cost of canonical JSON serialization per record. For a site with 2 locales and 50 technical assessments, this is 100 canonical JSON serializations per validation run.
- **Ambiguous invariant**: Line 104 — "screenshots MUST NOT be the only canonical artifact when the adapter/provider supplied machine-readable output." How is "adapter supplied machine-readable output" determined at validation time? This is a runtime property of the adapter, not a property of the evidence entity. The invariant is unenforceable without a field marking the artifact source.
- **Edge cases**: What happens when `dimensions` has exactly 1 dimension? The RFC says "non-empty" but doesn't specify a minimum count. What about `methodology.runCount = 1` — is a single run sufficient for publication?
- **Migration path**: Existing attestation records — the RFC says "same publish/pass/fail outcomes" but doesn't describe the code migration path. The `evaluateGate` function and inline gate in `nachweis-publish.ts` must be replaced with policy-driven evaluation. No rollout section describes this.
- **Security/privacy**: `providerReportUrl` (line 173) could leak sensitive information about client site performance. The RFC requires HTTPS but doesn't address whether the URL should be public or gated.

## Questions for the author

1. Why does `packagesImpacted` omit `@warpgogol/werkstatt` when all nachweis command handlers live there? What is the concrete removal mechanism for legacy gate booleans?
2. Which `NachweisAssessmentDimension` fields are required for the initial Lighthouse and Cloudflare Agent Readiness providers, and which are speculative? Can the interface be narrowed for v1?
3. How is the "adapter supplied machine-readable output" invariant (line 104) enforced at validation time without a field marking the artifact source on the evidence entity?
