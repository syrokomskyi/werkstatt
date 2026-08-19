---
rfcId: RFC-0875
auditId: AUDIT-RFC-0875-01
date: 2026-08-18
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0875

## Verdict: Needs revision

The RFC has a solid conceptual foundation and correctly follows the provider-adapter pattern established by RFC-0873/RFC-0874, but it is missing 7 required markdown sections (V-13), documents the wrong package in `packagesImpacted`, and lacks CLI/output format/failure mode specifications needed for an implementing agent to proceed without guessing.

## Mechanical validation (rfc.validate)

Pass with 7 V-13 warnings for missing required sections: `## Problem`, `## Architectural fit`, `## Design`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Implementation notes for agents`.

## Axis A — Structural completeness

- **Missing required sections**: `## Problem`, `## Architectural fit`, `## Design`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Implementation notes for agents` — all 7 are V-13 warnings.
- **No `## CLI` section**: The RFC does not show exact command invocations with flags and scope. RFC-0873 and RFC-0874 both have `## CLI` sections with flag tables. An implementing agent needs to know the flag names (`--system`, `--url`, `--series-id`, `--methodology`, `--freshness-days`, `--dry-run`, `--json`?) and their defaults.
- **No `## TypeScript contracts`**: The RFC references `AssessmentBundleV1` (which exists in `nachweis-io.ts`) but does not show the adapter's own type signatures (e.g. `CloudflareAgentReadinessMeasureResult`, parser types).
- **No `## File system responsibilities`**: The RFC names canonical artifacts (`cloudflare-submission.json`, `cloudflare-result.json`, `provider-parser-metadata.json`) but does not specify which directories the adapter writes to (temp dir? workpiece? cache clone?).
- **No `## Output format`**: The `--json` result shape is not documented. RFC-0874 defines `LighthouseMeasureResult` — RFC-0875 should define the analogous result type.
- **No `## Failure modes`**: The RFC mentions `ASSESSMENT_SCHEMA_UNSUPPORTED` and `CLOUDFLARE_SCAN_TIMEOUT` but does not provide a complete table of error codes with exit codes and warn-vs-fail behavior. What happens on missing env vars? HTTP 401? HTTP 429?
- **Acceptance criteria**: 14 items, all checkable. However "Parser has real/official fixture coverage" is not verifiable by an agent without access to the real API — the RFC should clarify what evidence satisfies this criterion (e.g. "a fixture file exists under `tests/fixtures/` and is referenced by a unit test").
- **`reviewers: []` is empty**: V-25 will fail when stamping. Add at least one reviewer (e.g. `human:andrii-syrokomskyi`).

## Axis B — DNA alignment

- `satisfies: []` is empty. This is a `command` kind RFC, so `--satisfies` is not required by RFC-0331. However, the RFC should explain how it aligns with DNA-59 (evidence preservation in R2) since it stores raw scanner results as private R2 artifacts.
- No new DNA invariant is established — correct for a command-kind RFC.
- `related[]` references (ADR-0054, RFC-0872, RFC-0873, RFC-0713) are all relevant and implemented.

## Axis C — Ecosystem fit

- **Package boundary error**: `packagesImpacted` lists `@warpgogol/werkstatt-site` but the command should live in `@warpgogol/werkstatt` — the same package as `nachweis.measure.lighthouse` (`packages/werkstatt/src/nachweis/nachweis-lighthouse-measure.ts`). The Lighthouse handler is in the engine package, not the site plugin. The Cloudflare adapter should follow the same boundary.
- **Pipeline placement**: Not mentioned. The RFC should state explicitly that this is a manually-invoked command, not a pipeline step (same as `nachweis.measure.lighthouse`).
- **Compass sync**: The RFC does not identify which `docs/*.xml` files need synchronization. If the command is registered in the kernel module, `docs/COMMANDS.md` needs regeneration (via `command.manifest.generate`).
- **AGENTS.md updates**: The RFC does not mention updating `packages/werkstatt/AGENTS.md` or the nachweis module documentation.
- **Command lifecycle**: `commands.proposed: [nachweis.measure.cloudflare-agent-readiness]` is internally consistent — will land in `added` upon implementation.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy maintenance. The RFC is purely additive.

## Axis E — Agent-facing policy

- **No `## Implementation notes for agents`**: This is a required section (V-13) and is critical. The RFC scatters implementation rules throughout the body ("The implementing agent MUST...", "The adapter MUST..."), but these should be consolidated into a dedicated section for agent guidance.
- **Status gate**: No self-authorizing language. The RFC is in `draft` and does not grant implementation permission.
- **Anti-fabrication**: Good — "The implementing agent MUST first obtain a real completed API result" and "MUST NOT invent paths based on field names heuristically" are explicit anti-fabrication rules.
- **Storage policy**: No cookies. Uses env vars for credentials. Correct.
- **NEEDS CLARIFICATION markers**: None found.

## Axis F — Pragmatism

- **Minimal command surface**: One new command per provider adapter — follows the RFC-0874 Lighthouse pattern. Justified.
- **Lean contracts**: Reuses existing `AssessmentBundleV1` from RFC-0873. No new schema types proposed. Good.
- **Existing patterns**: Correctly builds on `nachweis.assessment.ingest` and follows the same delegation pattern as `nachweis.measure.lighthouse`.
- **Scope discipline**: `appsImpacted: [warpgogol-com]` is acceptable (same as RFC-0874), but `packagesImpacted` should list `@warpgogol/werkstatt`, not `@warpgogol/werkstatt-site`.

## Axis G — Blind spots

- **Env vars and `.env.example`**: The RFC introduces `CLOUDFLARE_URL_SCANNER_ACCOUNT_ID` and `CLOUDFLARE_URL_SCANNER_API_TOKEN` but does not mention adding them to `.env.example` with `# How to obtain:` instructions (DNA-40, ENV-CONTRACT-05). The `HOW_TO_OBTAIN` map in `env-example.ts` will need entries for these variables.
- **R2 credential isolation**: RFC-0713 isolates R2 credentials per bucket. The RFC correctly states "Never reuse the R2 Nachweis credentials for Cloudflare API scanning" but does not address whether the Cloudflare URL Scanner API token needs a separate R2 bucket or whether raw results are stored in the existing nachweis R2 bucket via `nachweis.assessment.ingest`.
- **Polling endpoint**: The RFC documents the submission endpoint (`POST /client/v4/accounts/{account_id}/urlscanner/v2/scan`) but does not document the polling endpoint. How does the adapter check scan completion? What endpoint, what response shape indicates in-progress vs complete?
- **Performance**: The command polls for up to 5 minutes with 15s intervals. This is manually invoked, not a pipeline step, so impact is bounded. The RFC should still document expected duration.
- **Edge cases**: Good coverage of schema drift, timeout, terminal failure, not-checked dimensions, and unknown dimension preservation.

## Questions for the author

1. Why does `packagesImpacted` list `@warpgogol/werkstatt-site` instead of `@warpgogol/werkstatt`? The Lighthouse measure handler lives in `packages/werkstatt/src/nachweis/` — the Cloudflare adapter should follow the same boundary.
2. What is the polling endpoint and response shape? The RFC documents the submission endpoint but not how to check scan completion. Does the submission response return a job ID? What endpoint is polled?
3. What is the exact `--json` output shape? The RFC should define a `CloudflareAgentReadinessMeasureResult` type analogous to `LighthouseMeasureResult` from RFC-0874.
