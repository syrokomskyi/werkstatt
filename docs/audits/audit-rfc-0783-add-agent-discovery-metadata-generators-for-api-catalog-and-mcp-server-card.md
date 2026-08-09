---
rfcId: RFC-0783
auditId: AUDIT-RFC-0783-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0783

## Verdict: Needs revision

The RFC is structurally sound and follows the established `agent.openapi.generate`/`agent.openapi.validate` pattern correctly. However, it has a factual error about OpenAPI signing, omits two files from the responsibilities table, lists an unnecessary package in `packagesImpacted`, and includes a post-deploy acceptance criterion that an agent cannot verify during implementation.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **A-1**: File system responsibilities table omits `packages/werkstatt-site/src/checks/generator-ownership.ts`. The new generated files (`public/.well-known/api-catalog` and `public/.well-known/mcp/server-card.json`) must be registered in `GENERATOR_OWNERSHIP_MAP` for `generated.drift.validate` to cover them (DNA-58). The RFC claims DNA-58 coverage in the architectural fit section but doesn't list the file that enforces it.

- **A-2**: File system responsibilities table omits `packages/werkstatt-site/src/codegen/templates/app-boilerplate/public/_headers.template`. The RFC mentions in implementation notes that `_headers` needs a new `Content-Type: application/linkset+json` entry for `/.well-known/api-catalog`, but this file change is not in the responsibilities table.

- **A-3**: Acceptance criterion 10 ("isitagentready.com reports both endpoints present for warpgogol.com after deploy") is a post-deploy external verification. An agent cannot verify this during implementation — it requires a production deploy and an external audit service. This criterion should be separated from code-level criteria or marked as a post-deploy success signal rather than an implementation acceptance criterion.

## Axis B — DNA alignment

- **B-1**: DNA-58 (generated-file content determinism) is referenced in the architectural fit section — "DNA-58 (generated-file content determinism) — both files are generator-owned and deterministic; `generated.drift.validate` covers them" — but is not listed in `related[]`. Should be in `related[]` for traceability, since the RFC claims its generated files are covered by this invariant.

## Axis C — Ecosystem fit

- **C-1**: `packagesImpacted` lists `packages/werkstatt` but the RFC does not touch any files in that package. All new modules (`agent-api-catalog.ts`, `agent-mcp-card.ts`, `api-catalog.ts`, `mcp-card.ts`), the command table (`29-agent-surface.ts`), the pipeline files (`build-prepare.ts`, `sites-check-author.ts`), `generator-ownership.ts`, and `_headers.template` are all in `packages/werkstatt-site`. The `packages/werkstatt` entry should be removed.

## Axis D — Forward-only compliance

No issues.

## Axis E — Agent-facing policy

- **E-1**: Same as A-3 — acceptance criterion 10 is a post-deploy external verification that conflates deploy-dependent validation with code-level acceptance. The RFC should distinguish between criteria an agent can verify during implementation (file exists, command registered, validator passes) and post-deploy success signals (isitagentready.com report). The `successSignals` field already captures the post-deploy signal — criterion 10 duplicates it as an acceptance criterion.

## Axis F — Pragmatism

No issues beyond C-1. The four-command surface follows the established `agent.openapi.*` pattern. The alternatives section honestly considers and rejects a single aggregated generator. TypeScript contracts are minimal.

## Axis G — Blind spots

- **G-1**: The RFC does not specify what `agent.mcp-card.generate` should do when `manifest.interfaces.mcp` is `null`. The `AgentSurfaceManifest` type allows `mcp: { url: string; protocolVersion: string } | null`, but `buildMcpServerCard` returns a `McpServerCard` with required `transport` and `protocolVersion` fields. The generate command should skip (and remove any stale file) when `mcp` is null — same as the `agent.enabled: false` skip pattern. This edge case is not addressed.

- **G-2**: The signing section states "same as `agent.openapi.json` which is also not yet signed" — this is factually incorrect. `agent.surface.sign` DOES sign the OpenAPI document when `PASSPORT_SIGNING_KEY` is set (see `packages/werkstatt-site/src/checks/agent/agent-surface-sign.ts:268-301`). The `AgentProofArtifactKind` type includes `"openapi"`. The RFC should correct this statement and note that a follow-up signing amendment would need to extend `AgentProofArtifactKind` to include `"api-catalog"` and `"mcp-card"`.

## Questions for the author

1. What should `agent.mcp-card.generate` do when `manifest.interfaces.mcp` is `null` — skip silently and remove any stale file, or produce an error?
2. Should the `_headers.template` change for `Content-Type: application/linkset+json` be listed in the file system responsibilities table, or is the implementation note sufficient?
3. Should acceptance criterion 10 be moved to `successSignals` only, or split into a code-level criterion (file exists with correct content type) and a post-deploy signal (isitagentready.com)?
