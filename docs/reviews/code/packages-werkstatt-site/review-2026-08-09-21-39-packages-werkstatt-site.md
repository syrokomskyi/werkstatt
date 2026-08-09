---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: a1c5fc9a...HEAD
filesReviewed:
  - packages/werkstatt-site/src/domain/share/agent/api-catalog.ts
  - packages/werkstatt-site/src/domain/share/agent/mcp-card.ts
  - packages/werkstatt-site/src/domain/share/agent/index.ts
  - packages/werkstatt-site/src/checks/agent/agent-api-catalog.ts
  - packages/werkstatt-site/src/checks/agent/agent-mcp-card.ts
  - packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts
  - packages/werkstatt-site/src/checks/generator-ownership.ts
  - packages/werkstatt-site/src/checks/kernel-flags-lint.ts
  - packages/werkstatt-site/src/checks/pipelines/build-prepare.ts
  - packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts
  - packages/werkstatt-site/src/codegen/templates/app-boilerplate/public/_headers.template
  - packages/werkstatt-site/src/domain/share/tests/api-catalog.test.ts
  - packages/werkstatt-site/src/domain/share/tests/mcp-card.test.ts
  - packages/werkstatt-site/src/checks/tests/agent-api-catalog.test.ts
  - packages/werkstatt-site/src/checks/tests/agent-mcp-card.test.ts
---

# Code Review: RFC-0783 agent discovery metadata generators

### Verdict: Needs revision

The implementation is architecturally sound — pure projections, thin kernel handlers, deterministic output, correct pipeline placement. Two findings require revision: duplicated boilerplate across handler files and missing `Content-Type: application/json` header for the MCP server card path in `_headers.template`.

### Mechanical floor

Pass — zero new TypeScript errors in the diff. All 73 pre-existing errors are in unrelated files (resolve-route.ts, print-pdf.ts, content-surface.ts, etc.). 23/23 new tests pass.

### Axis A — Structural correctness

**Finding A-1: Duplicated boilerplate (Duplicated Code smell).** `loadInternalManifest`, `readAgentBlock`, `AgentSystemBlock`, `INTERNAL_MANIFEST_FILE` are copy-pasted across three files: `agent-openapi.ts`, `agent-api-catalog.ts`, and `agent-mcp-card.ts`. The exact same 30-line block appears verbatim. Extract to a shared helper in `agent/agent-manifest.ts` or a new `agent/shared.ts` module.

### Axis B — DNA alignment

No issues. DNA-58 (generated-file content determinism) is satisfied — both `buildApiCatalog` and `buildMcpServerCard` are pure functions with sorted output. DNA-34 (VC signing + `/.well-known/` discovery) is extended correctly. DNA-35 (`app.contract.full`) is satisfied via pipeline integration.

### Axis C — Ecosystem fit

No issues. Pipeline placement is correct: generate in `build.prepare` after `agent.openapi.generate`, validate in `sites-check.author` alongside `agent.openapi.validate`. Command table registration follows existing patterns. Generator ownership map entries use correct paths.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no legacy paths, no dual-path logic.

### Axis E — Agent-facing clarity

No issues. All new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Compass markup is present on all four new non-trivial source files.

### Axis F — Pragmatism

**Finding F-1: Missing `Content-Type` for MCP server card path.** Acceptance criterion 9 requires `/.well-known/mcp/server-card.json` served with `Content-Type: application/json`. The `_headers.template` adds a specific block for `/.well-known/api-catalog` but does not add one for `/.well-known/mcp/server-card.json`. While Cloudflare Pages defaults `.json` to `application/json`, the RFC explicitly lists this as an acceptance criterion. Add a specific block for consistency and explicitness, or annotate the acceptance criterion that the wildcard `/.well-known/*` + Cloudflare default covers it (which is what was done in the evidence annotation — acceptable but fragile if the deployment target changes).

### Axis G — Blind spots

No issues. Empty state (no knowledge refs, no MCP interface) is handled — `buildMcpServerCard` returns null, `buildApiCatalog` always includes service-meta + service-doc links. The `agent.enabled: false` skip pattern removes stale artifacts. Concurrent execution is safe — pure functions, no shared mutable state.

### Spec compliance

| Requirement from RFC-0783 | Status | Evidence |
| --- | --- | --- |
| `buildApiCatalog` pure function | Done | `api-catalog.ts:67` |
| `buildMcpServerCard` pure function | Done | `mcp-card.ts:52` |
| Four commands registered | Done | `29-agent-surface.ts:113-163` |
| Generate in `build.prepare` | Done | `build-prepare.ts:74-77` |
| Validate in `sites-check.author` | Done | `sites-check-author.ts:201-204` |
| `agent.enabled: false` skip | Done | Tests: generate-skip cases |
| `_headers` Content-Type for api-catalog | Done | `_headers.template:24-28` |
| `_headers` Content-Type for server-card.json | Partial | Covered by wildcard + CF default, no explicit block |
| Generator ownership map entries | Done | `generator-ownership.ts:479-493` |
| Kernel-flags-lint registration | Done | `kernel-flags-lint.ts:130-149` |
| Unit tests | Done | 23 tests, 4 files |
| `rfc.validate` passes | Done | 0 violations |

### Questions for the author

1. Should the duplicated `loadInternalManifest`/`readAgentBlock` boilerplate be extracted to a shared module before merging, or is copy-paste acceptable for the agent surface handler family?
2. Is the wildcard `/.well-known/*` + Cloudflare default sufficient for the MCP server card Content-Type, or should an explicit block be added to `_headers.template`?
