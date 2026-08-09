---
rfcId: RFC-0783
planId: PLAN-RFC-0783-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs:
    - docs/rfcs/rfc-0783-add-agent-discovery-metadata-generators-for-api-catalog-and-mcp-server-card.md
---

# Implementation Plan: RFC-0783

## 1. Objectives

- [ ] O1 — Define `buildApiCatalog` pure projection function — maps to acceptance criterion 1
- [ ] O2 — Define `buildMcpServerCard` pure projection function — maps to acceptance criterion 2
- [ ] O3 — Register four new commands in `29-agent-surface.ts` — maps to acceptance criteria 3, 4
- [ ] O4 — Wire generate commands into `build.prepare` pipeline — maps to acceptance criterion 5
- [ ] O5 — Wire validate commands into `sites-check-author` pipeline — maps to acceptance criterion 6
- [ ] O6 — Implement `agent.enabled: false` and `mcp: null` skip patterns — maps to acceptance criterion 7
- [ ] O7 — Add `Content-Type: application/linkset+json` for `/.well-known/api-catalog` in `_headers.template` — maps to acceptance criterion 8
- [ ] O8 — Register generated files in `generator-ownership.ts` for `generated.drift.validate` coverage (DNA-58)
- [ ] O9 — `rfc.validate` passes — maps to acceptance criterion 10

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/share/agent/api-catalog.ts` — **new** — `ApiCatalogLink`, `ApiCatalog` types, `buildApiCatalog` pure function
- `packages/werkstatt-site/src/domain/share/agent/mcp-card.ts` — **new** — `McpServerCard` type, `buildMcpServerCard` pure function
- `packages/werkstatt-site/src/domain/share/agent/index.ts` — **amended** — re-export `api-catalog.ts` and `mcp-card.ts`
- `packages/werkstatt-site/src/checks/agent/agent-api-catalog.ts` — **new** — `runAgentApiCatalogGenerate`, `runAgentApiCatalogValidate` handlers
- `packages/werkstatt-site/src/checks/agent/agent-mcp-card.ts` — **new** — `runAgentMcpCardGenerate`, `runAgentMcpCardValidate` handlers
- `packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts` — **amended** — four new command entries
- `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts` — **amended** — two generate commands after `agent.openapi.generate`
- `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts` — **amended** — two validate commands alongside `agent.openapi.validate`
- `packages/werkstatt-site/src/checks/generator-ownership.ts` — **amended** — two new entries in `GENERATOR_OWNERSHIP_MAP`
- `packages/werkstatt-site/src/checks/kernel-flags-lint.ts` — **amended** — four new command-to-function mappings

### 2.2 Configuration and data

- `packages/werkstatt-site/src/codegen/templates/app-boilerplate/public/_headers.template` — **amended** — add `Content-Type: application/linkset+json` block for `/.well-known/api-catalog`

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0783-*.md` — read-only reference (accepted RFC)
- No `AGENTS.md` updates needed — the new commands follow the existing agent surface pattern documented in `packages/werkstatt-site/AGENTS.md`
- No `docs/*.xml` Compass sync needed — no repository-wide requirements or shared contract changes
- No `docs/architecture-dna.md` changes — RFC satisfies existing DNA-34, DNA-35, DNA-58

### 2.4 Validation and pipelines

- `build.prepare` — two new generate commands inserted after `agent.openapi.generate`
- `sites-check-author` — two new validate commands inserted alongside `agent.openapi.validate`
- `generated.drift.validate` — covers the two new generated files via `generator-ownership.ts` entries

## 3. Step sequence

### Step 1. Pure projection functions (contracts)

**Goal:** Define the framework-free, deterministic pure functions that project the Agent Surface Manifest into RFC 9727 linkset+json and SEP-1649 MCP Server Card formats.

**Agent actions:**

- Create `packages/werkstatt-site/src/domain/share/agent/api-catalog.ts` with `ApiCatalogLink`, `ApiCatalog` interfaces and `buildApiCatalog(manifest: AgentSurfaceManifest): ApiCatalog` function. The function must:
  - Produce linkset entries for each knowledge ref (`rel: "item"`, `type: "application/json"`)
  - Produce linkset entries for `agent.json` (`rel: "service-meta"`), `agent.openapi.json` (`rel: "service-desc"`), `mcp/server-card.json` (`rel: "service-desc"`), `agent/mcp` (`rel: "service"`), `llms.txt` (`rel: "service-doc"`)
  - Use empty-string anchor (site root context)
  - Sort entries deterministically by `href` to ensure byte-identical output (DNA-58)
- Create `packages/werkstatt-site/src/domain/share/agent/mcp-card.ts` with `McpServerCard` interface and `buildMcpServerCard(manifest: AgentSurfaceManifest): McpServerCard` function. The function must:
  - Read `manifest.interfaces.mcp` for `url` and `protocolVersion`
  - Set `transport.type: "streamable-http"`, `transport.url` from manifest
  - Set `serverInfo.name` from `manifest.site` + `-agent-gate`, `serverInfo.version` from `manifest.surfaceVersion`
  - Set `capabilities` to `{ tools: { listChanged: false }, resources: { listChanged: false, subscribe: false }, prompts: { listChanged: false } }`
- Add `export * from "./api-catalog.ts"` and `export * from "./mcp-card.ts"` to `packages/werkstatt-site/src/domain/share/agent/index.ts`
- Add `CHANGE_SUMMARY` entries to `index.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- Functions are pure (no I/O, no `Date.now()`, no non-deterministic operations)

**Completion criterion:** Both pure functions exist, are exported from the agent barrel, and TypeScript compiles.

**Human review:** no

---

### Step 2. Command handlers

**Goal:** Implement the four Site OS command handlers: generate + validate for API Catalog and MCP Server Card.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/agent/agent-api-catalog.ts` with:
  - `runAgentApiCatalogGenerate` — reads internal manifest (`src/agent-surface.generated.yaml`), calls `buildApiCatalog`, writes `public/.well-known/api-catalog` as JSON. Skip pattern: when `agent.enabled: false`, remove stale file and return skip. When manifest missing, return error.
  - `runAgentApiCatalogValidate` — validates file exists, is valid JSON, and entries match manifest refs (AGC-01..03 rule IDs)
- Create `packages/werkstatt-site/src/checks/agent/agent-mcp-card.ts` with:
  - `runAgentMcpCardGenerate` — reads internal manifest, calls `buildMcpServerCard`, writes `public/.well-known/mcp/server-card.json`. Skip pattern: when `agent.enabled: false` OR `manifest.interfaces.mcp` is `null`, remove stale file and return skip. `mkdir -p` the `public/.well-known/mcp/` directory before writing.
  - `runAgentMcpCardValidate` — validates file exists, is valid JSON, and `transport.url`/`protocolVersion` match manifest (AGM-01..03 rule IDs)
- Both generate handlers follow the `agent.openapi.generate` pattern: use `requireAstroSitePaths`, `loadSystemManifest`, `loadInternalManifest`, `writeFileIfChanged` from `@warpgogol/werkstatt`
- Both validate handlers use `diagnosticsResult` from `../result-helpers.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles

**Completion criterion:** All four handler functions exist and TypeScript compiles.

**Human review:** no

---

### Step 3. Command table registration

**Goal:** Register the four new commands in the agent surface command table.

**Agent actions:**

- Add four `CheckCommandEntry` entries to `AGENT_SURFACE_COMMANDS` in `packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts`:
  - `agent.api-catalog.generate` — `scope: app`, `supportsAllSites: true`, `mutatesState: true`, `writes: ["<app>/public/.well-known/api-catalog"]`, `reads: ["<app>/src/agent-surface.generated.yaml"]`, `modulePaths: ["agent/agent-api-catalog.ts"]`
  - `agent.api-catalog.validate` — `scope: app`, `supportsAllSites: true`, `reads: ["<app>/public/.well-known/api-catalog", "<app>/src/agent-surface.generated.yaml"]`, `modulePaths: ["agent/agent-api-catalog.ts"]`
  - `agent.mcp-card.generate` — `scope: app`, `supportsAllSites: true`, `mutatesState: true`, `writes: ["<app>/public/.well-known/mcp/server-card.json"]`, `reads: ["<app>/src/agent-surface.generated.yaml"]`, `modulePaths: ["agent/agent-mcp-card.ts"]`
  - `agent.mcp-card.validate` — `scope: app`, `supportsAllSites: true`, `reads: ["<app>/public/.well-known/mcp/server-card.json", "<app>/src/agent-surface.generated.yaml"]`, `modulePaths: ["agent/agent-mcp-card.ts"]`
- Add imports for the four handler functions at the top of the file
- Add `CHANGE_SUMMARY` entry

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `pnpm exec werkstatt run command.manifest.generate` — command manifest includes the four new commands

**Completion criterion:** All four commands are registered and the command manifest reflects them.

**Human review:** no

---

### Step 4. Pipeline wiring

**Goal:** Insert the new generate and validate commands into the correct pipeline positions.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts`, add after `agent.openapi.generate` (line ~73):
  ```ts
  // RFC-0783: project the manifest into RFC 9727 API Catalog linkset+json.
  { command: "agent.api-catalog.generate" },
  // RFC-0783: project the manifest into SEP-1649 MCP Server Card.
  { command: "agent.mcp-card.generate" },
  ```
- In `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts`, add after `agent.openapi.validate` (line ~200):
  ```ts
  // RFC-0783: API Catalog — well-formedness + manifest↔linkset bijection
  { command: "agent.api-catalog.validate" },
  // RFC-0783: MCP Server Card — well-formedness + manifest↔card bijection
  { command: "agent.mcp-card.validate" },
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles

**Completion criterion:** Both pipeline files contain the new commands in the correct positions.

**Human review:** no

---

### Step 5. Generator ownership and kernel-flags-lint registration

**Goal:** Register the two new generated files in the generator ownership map and kernel-flags-lint.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/generator-ownership.ts`, add two entries to `GENERATOR_OWNERSHIP_MAP`:
  - `{ path: "public/.well-known/api-catalog", command: "agent.api-catalog.generate", markerPolicy: "registry-only", module: "packages/werkstatt-site/src/checks/agent/agent-api-catalog.ts" }`
  - `{ path: "public/.well-known/mcp/server-card.json", command: "agent.mcp-card.generate", markerPolicy: "registry-only", module: "packages/werkstatt-site/src/checks/agent/agent-mcp-card.ts" }`
- In `packages/werkstatt-site/src/checks/kernel-flags-lint.ts`, add four command-to-function mappings:
  - `agent.api-catalog.generate` → `runAgentApiCatalogGenerate`
  - `agent.api-catalog.validate` → `runAgentApiCatalogValidate`
  - `agent.mcp-card.generate` → `runAgentMcpCardGenerate`
  - `agent.mcp-card.validate` → `runAgentMcpCardValidate`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles

**Completion criterion:** Both registration files contain the new entries.

**Human review:** no

---

### Step 6. `_headers.template` Content-Type

**Goal:** Add the `Content-Type: application/linkset+json` header for `/.well-known/api-catalog` in the `_headers` template.

**Agent actions:**

- In `packages/werkstatt-site/src/codegen/templates/app-boilerplate/public/_headers.template`, add a new block after the existing `/.well-known/*` block:
  ```
  # RFC-0783: API Catalog — application/linkset+json content type
  /.well-known/api-catalog
    Content-Type: application/linkset+json; charset=utf-8
    X-Content-Type-Options: nosniff
    Cache-Control: public, max-age=300
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles (template is not TS but build:check covers the package)

**Completion criterion:** `_headers.template` contains the new `Content-Type` block for `/.well-known/api-catalog`.

**Human review:** no

---

### Step 7. Unit tests

**Goal:** Write unit tests for the pure projection functions and command handlers.

**Agent actions:**

- Create `packages/werkstatt-site/src/domain/share/agent/tests/api-catalog.test.ts`:
  - Test `buildApiCatalog` with a representative manifest — verify linkset entries match expected output
  - Test determinism — same input produces byte-identical output
  - Test with empty knowledge/actions arrays
- Create `packages/werkstatt-site/src/domain/share/agent/tests/mcp-card.test.ts`:
  - Test `buildMcpServerCard` with a manifest that has `mcp` interface — verify card fields
  - Test determinism
- Create `packages/werkstatt-site/src/checks/tests/agent-api-catalog.test.ts`:
  - Mock `KernelRuntimeContext` with in-memory I/O
  - Test generate: writes file with correct content
  - Test generate skip: `agent.enabled: false` removes stale file
  - Test validate: passes on valid file, fails on missing/invalid/divergent file
- Create `packages/werkstatt-site/src/checks/tests/agent-mcp-card.test.ts`:
  - Test generate: writes file with correct content
  - Test generate skip: `agent.enabled: false` removes stale file
  - Test generate skip: `mcp: null` removes stale file
  - Test validate: passes on valid file, fails on missing/invalid/divergent file

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass

**Completion criterion:** All test files exist and pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (do not hand-edit `docs/ecosystem.generated.yaml`).
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0783` — must pass.
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass.
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — must pass.
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0783` (RFC-0330 — acceptance probes are commented out, so this will produce no evidence file; this is expected).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0783 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0783`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0783`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0783` (RFC-0330 — expected no-op, acceptance probes commented out)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0783.generated.json` — verification evidence (may not be produced if acceptance probes are commented out — this is expected per RFC-0330)
- Commit messages referencing `RFC-0783` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Spec instability (SEP-1649 is a PR) | Step 1 isolates schema in `buildMcpServerCard` — one-file change if spec evolves |
| RFC 9727 linkset format ambiguity | Step 1 uses empty-string anchor (most common interpretation) |
| Maintenance burden (2 generators + 2 validators + 2 projections) | Same per-format cost as RFC-0289 (OpenAPI) — established pattern |
| Agent misinterpretation (MCP Server Card vs Studio Gate stdio) | `transport.type: "streamable-http"` in Step 1 makes HTTP explicit |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-34, DNA-35, or DNA-58, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0783 --reason "..." --invariant "DNA-N"` instead of working around it.
