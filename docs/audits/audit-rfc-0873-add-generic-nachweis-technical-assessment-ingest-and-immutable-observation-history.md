---
rfcId: RFC-0873
auditId: AUDIT-RFC-0873-01
date: 2026-08-18
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0873

## Verdict: Needs revision

The RFC has a solid core design (AssessmentBundleV1, idempotency semantics, R2 layout, transaction ordering) but is missing 7 required markdown sections, lists an incorrect `packagesImpacted`, and makes a factual claim about a "PBP authoring/write helper" that does not exist in the codebase. These must be fixed before the RFC can proceed to enhance/plan.

## Mechanical validation (rfc.validate)

Pass with 8 warnings (all non-blocking for draft status):

- **V-13** (7 warnings): Missing required sections: `## Problem`, `## Architectural fit`, `## Design`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Implementation notes for agents`.
- **V-19** (1 warning): `amends` includes RFC-0707, but RFC-0707.amendedBy does not include RFC-0873. This must be fixed during enhance (add RFC-0873 to RFC-0707.amendedBy).

## Axis A — Structural completeness

- **A-1 (fail)**: Missing `## Problem` section. The `## Context` section explains *why* the RFC exists but does not enumerate the specific problems (no generic ingest, providers duplicating R2/hash/PBP/Bordbuch logic, inconsistent observation paths).
- **A-2 (fail)**: Missing `## Architectural fit` section. The RFC does not name the module placement (`packages/werkstatt/src/nachweis/`), the Bordbuch integration pattern (`appendAndCommitBordbuch`), the R2 credential isolation (RFC-0713 `R2_NACHWEIS_*`), or the fingerprint integration (`byteHashFile`).
- **A-3 (fail)**: Missing `## Design` section. The `AssessmentBundleV1` interface is defined inline but there is no File system responsibilities table, no TypeScript contracts section for the command handler, and no pipeline integration discussion.
- **A-4 (fail)**: Missing `## Rollout` section. No description of default behavior, entitlement gating, or adoption path.
- **A-5 (fail)**: Missing `## Alternatives considered` section. No discussion of why a new command is preferred over extending `nachweis.ingest` with a `--bundle` flag.
- **A-6 (fail)**: Missing `## Risks` section. No discussion of R2 orphan objects, atomicity gaps, or bordbuch growth from repeated observations.
- **A-7 (fail)**: Missing `## Implementation notes for agents` section. No governance rules for agent implementation.
- **A-8 (pass)**: `## Decision` is present and clear: "Add `nachweis.assessment.ingest`".
- **A-9 (pass)**: CLI surface is documented with exact flags and examples.
- **A-10 (pass)**: Failure modes table is comprehensive (9 codes).
- **A-11 (pass)**: Acceptance criteria are checkable and cover the full scope (11 items).

## Axis B — DNA alignment

- **B-1 (n/a)**: `satisfies: []` is empty — acceptable for a `command` kind RFC (RFC-0331 requires `--satisfies` only for architecture/contract RFCs).
- **B-2 (pass)**: No DNA invariants are silently conflicted. The RFC amends RFC-0707 (Nachweis kernel module) and builds on RFC-0872 (technical-assessment PBP contract) and RFC-0713 (R2 credential isolation).
- **B-3 (pass)**: `related[]` references (ADR-0054, RFC-0872, RFC-0713, RFC-0715) are relevant and not decorative.

## Axis C — Ecosystem fit

- **C-1 (fail)**: `packagesImpacted` lists only `@warpgogol/werkstatt-site`. The command handler will live in `packages/werkstatt/src/nachweis/` (the engine package), as shown by the existing `nachweis.module.ts` at `@/packages/werkstatt/src/nachweis/nachweis.module.ts:26`. The list must include `@warpgogol/werkstatt`. The `@warpgogol/werkstatt-site` entry is only correct if the RFC modifies the PBP evidence-source schema (which RFC-0872 already did — this RFC consumes it, not modifies it).
- **C-2 (pass)**: Command lifecycle buckets are internally consistent: `proposed: ["nachweis.assessment.ingest"]`, `added: []`, `changed: []`, `removed: []`.
- **C-3 (fail)**: No AGENTS.md updates identified. The RFC should note that `packages/werkstatt/AGENTS.md` may need a nachweis assessment ingest rule (entitlement gating, R2 credential prerequisite).
- **C-4 (fail)**: No Compass sync identified. If the command adds a new pipeline step or changes the verification surface, `docs/verification-plan.xml` may need synchronization.
- **C-5 (n/a)**: Cosmic naming is not relevant — this RFC does not touch manifests or component/section/page contracts.

## Axis D — Forward-only compliance

- **D-1 (pass)**: No backward compatibility layers, shims, or dual-paths proposed.
- **D-2 (pass)**: No legacy code paths maintained behind a flag.
- **D-3 (pass)**: The RFC amends RFC-0707 by adding a new command to the same module — it does not add a parallel interpretation. The V-19 warning (RFC-0707.amendedBy not updated) must be fixed during enhance.

## Axis E — Agent-facing policy

- **E-1 (pass)**: No self-authorizing language. The RFC does not grant implementation permission while draft.
- **E-2 (fail)**: Missing `## Implementation notes for agents` section — no governance rules for agent implementation (entitlement gating, R2 prerequisite, commit message format, RFC-0224 transition rules).
- **E-3 (pass)**: No NEEDS CLARIFICATION markers found.
- **E-4 (pass)**: Storage policy uses R2 (server-side), no cookies or client-side persistence.
- **E-5 (fail)**: The RFC states "The command MUST use the repository's existing PBP authoring/write helper. It MUST NOT construct ad-hoc YAML/Markdown if a canonical helper exists." However, examining the codebase, **no such canonical PBP write helper exists**. Existing nachweis commands (e.g. `nachweis-public-derivative.ts:97-154`) read/write entity files directly using `parseMarkdownFrontmatter`/`stringifyMarkdownFrontmatter` from `@warpgogol/werkstatt-shared/content`. The RFC's claim is factually incorrect and will confuse implementing agents.

## Axis F — Pragmatism

- **F-1 (pass)**: One new command — `nachweis.assessment.ingest` earns its existence. It cannot be a flag on `nachweis.ingest` because the input shape (AssessmentBundleV1 JSON) is fundamentally different from `nachweis.ingest` (single PDF file).
- **F-2 (pass)**: `AssessmentBundleV1` type is minimal and purpose-built — no speculative generality.
- **F-3 (fail)**: `packagesImpacted` is incomplete — missing `@warpgogol/werkstatt` (see C-1).
- **F-4 (pass)**: `nonGoals` are explicit and meaningful: "Does not run Lighthouse", "Does not call Cloudflare", "Does not approve, sign, timestamp or publish automatically".
- **F-5 (fail)**: The RFC says "at least one canonical `raw-result`" but the Cloudflare example bundle at `@/docs/nachweis-technical-evidence-extend-v1/examples/assessment-bundle.cloudflare.example.json:53-58` has `cloudflare-submission` with `canonical: false` and only `cloudflare-result` with `canonical: true`. The rule and example are consistent, but the RFC should clarify whether multiple canonical raw-results are allowed (the Lighthouse example has 5 canonical raw-results).

## Axis G — Blind spots

- **G-1 (pass)**: Performance is not a concern — the command processes one bundle per invocation, no file scanning.
- **G-2 (pass)**: False positives are not applicable — this is an ingest command, not a validator.
- **G-3 (pass)**: Edge cases are well-covered: idempotency (same identity + same hashes → no-op), conflict (same identity + different data → fail), new observation in same series (preserve old), path traversal, symlink escape.
- **G-4 (pass)**: Migration path is not applicable — new command, no existing apps to migrate.
- **G-5 (pass)**: Security is well-addressed: no credentials in bundle/Bordbuch, redact sensitive headers, reject path traversal, no `--force-overwrite`, no external URL following.
- **G-6 (fail)**: The R2 layout `private/assessments/{systemId}/{seriesId}/{observationId}/` differs from the existing nachweis R2 layout `{systemId}/private/{recordId}/v{version}/source.pdf`. The RFC says to "adapt this pattern under the existing bucket root" but does not specify the exact final path. The implementing agent needs to know: will it be `{systemId}/private/assessments/{seriesId}/{observationId}/{artifactKey}.{ext}` or `private/assessments/{systemId}/...`? This ambiguity could lead to divergent implementations.
- **G-7 (fail)**: The RFC does not discuss what happens when R2 credentials (`R2_NACHWEIS_*`) are missing. The existing pattern (RFC-0713) returns a `MISSING_ENV` result with `exitCode: 1`. The RFC should document this failure mode explicitly.

## Questions for the author

1. What is the exact R2 path pattern? The RFC shows `private/assessments/{systemId}/...` but the existing nachweis code uses `{systemId}/private/{recordId}/...`. Which prefix order will the implementation use?
2. Does "at least one canonical `raw-result`" mean exactly one, or can there be multiple canonical raw-results (as the Lighthouse example with 5 canonical LHR runs suggests)? If multiple, how are they distinguished in PBP `items`?
3. The RFC says "The command MUST use the repository's existing PBP authoring/write helper" — but no such helper exists. Should the RFC instead say "The command MUST use `parseMarkdownFrontmatter`/`stringifyMarkdownFrontmatter` from `@warpgogol/werkstatt-shared/content`, following the same pattern as `nachweis.public-derivative`"?
