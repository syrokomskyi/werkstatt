---
rfcId: RFC-0789
planId: PLAN-RFC-0789-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs: []
---

# Implementation Plan: RFC-0789

## 1. Objectives

- [ ] Objective 1 — Add `agent` field to `SemanticSiteModel` and populate it in the semantic loader (maps to acceptance criterion: `agent.enabled: false` omits all agent discovery links)
- [ ] Objective 2 — Amend `buildLlmsIndex` to include API Catalog, MCP Server Card, and OpenAPI links conditional on `agent.enabled` (maps to acceptance criteria: links present, links use `canonicalStaticUrl`, `agent.enabled: false` omits links)
- [ ] Objective 3 — Add unit tests for `buildLlmsIndex` covering both `agent.enabled: true` and `agent.enabled: false` paths (maps to acceptance criterion: `llms.txt` still passes `llms.validate`)
- [ ] Objective 4 — Verify `semantic.parity` stays in sync (maps to acceptance criterion: `llms.txt` still passes `llms.validate`)
- [ ] Objective 5 — Run typecheck and test suite, review, fix, stamp implemented (maps to acceptance criterion: `rfc.validate` passes)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/share/semantic/models.ts` — `SemanticSiteModel` type gains optional `agent` field
- `packages/werkstatt-site/src/domain/share/semantic/llms.ts` — `buildLlmsIndex` amended with conditional agent discovery links
- `packages/werkstatt-site/src/content/semantic-loader.ts` — `loadSemanticSiteModel` populates `agent` from `system.md` manifest
- `packages/werkstatt-site/src/checks/semantic-parity.ts` — no change needed (calls `buildLlmsIndex` via same loader, stays in sync automatically)
- `packages/werkstatt-site/src/checks/llms.ts` — no change needed (handler calls `buildLlmsIndex`, which handles the conditional internally)

### 2.2 Configuration and data

No configuration or data files changed.

### 2.3 Documentation and specs

- RFC file (read-only reference): `docs/rfcs/rfc-0789-enhance-llms-txt-generation-with-agent-surface-discovery-links.md`
- No `AGENTS.md` updates needed — no new modules, commands, or ownership changes.
- No `docs/*.xml` Compass files need updates — no repository-wide semantics changed.
- No `docs/architecture-dna.md` update — no new DNA invariant.

### 2.4 Validation and pipelines

- `pnpm --filter packages/werkstatt-site run build:check` — TypeScript typecheck
- `pnpm --filter packages/werkstatt-site run test` — Vitest unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0789` — RFC mechanical validation
- No pipeline changes — `llms.generate` is already wired in `build.prepare` after agent generators

## 3. Step sequence

### Step 1. Add `agent` field to `SemanticSiteModel`

**Goal:** Extend the semantic site model type so `buildLlmsIndex` can check `agent.enabled`.

**Agent actions:**

- Edit `packages/werkstatt-site/src/domain/share/semantic/models.ts` — add `agent?: { enabled?: boolean }` field to `SemanticSiteModel` type (after `pages: SemanticPageModel[]`)
- Add RFC-0789 comment on the new field

**Validation:**

- `pnpm --filter packages/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** `SemanticSiteModel` type includes optional `agent` field; typecheck passes.

**Human review:** no

---

### Step 2. Populate `agent` field in semantic loader

**Goal:** The semantic loader reads the `agent` block from `system.md` and populates `site.agent`.

**Agent actions:**

- Edit `packages/werkstatt-site/src/content/semantic-loader.ts` — in `loadSemanticSiteModel`, after `const { manifest } = await loadSystemManifest(contentDir)`, extract the `agent` block from `manifest` and include it in the returned `SemanticSiteModel` object
- The extraction follows the same pattern as `readAgentBlock` in `agent-shared.ts`: `(manifest as Record<string, unknown>).agent as { enabled?: boolean } | undefined`
- Add the `agent` field to the return object at line 608-614

**Validation:**

- `pnpm --filter packages/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** `loadSemanticSiteModel` returns a `SemanticSiteModel` with `agent` populated from `system.md`'s `agent` block; typecheck passes.

**Human review:** no

---

### Step 3. Amend `buildLlmsIndex` with conditional agent discovery links

**Goal:** `buildLlmsIndex` includes API Catalog, MCP Server Card, and OpenAPI links when `agent.enabled !== false`, and omits all agent links (including the existing `agent.json` link) when `agent.enabled: false`.

**Agent actions:**

- Edit `packages/werkstatt-site/src/domain/share/semantic/llms.ts` — in `buildLlmsIndex`:
  - Replace the hardcoded `agentJsonUrl` line with a conditional block that builds an `agentLinks` array
  - When `site.agent?.enabled !== false`: include `agent.json`, `api-catalog`, `mcp/server-card.json`, `agent.openapi.json` links
  - When `site.agent?.enabled === false`: `agentLinks` is empty array
  - Spread `...agentLinks` into the return array after the `llms-full.txt` line
  - Remove the standalone `agentJsonUrl` variable (now inside the conditional)

**Validation:**

- `pnpm --filter packages/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** `buildLlmsIndex` produces output with 4 agent links when `agent.enabled !== false` and 0 agent links when `agent.enabled === false`; typecheck passes.

**Human review:** no

---

### Step 4. Add unit tests for `buildLlmsIndex`

**Goal:** Unit tests verify both the enabled and disabled paths of `buildLlmsIndex`.

**Agent actions:**

- Create `packages/werkstatt-site/src/domain/share/tests/llms-0789.test.ts`
- Test 1: `buildLlmsIndex` with `agent` absent (defaults to enabled) — output contains `agent.json`, `api-catalog`, `mcp/server-card.json`, `agent.openapi.json`
- Test 2: `buildLlmsIndex` with `agent.enabled: true` — output contains all 4 agent links
- Test 3: `buildLlmsIndex` with `agent.enabled: false` — output contains zero agent links (no `agent.json`, no `api-catalog`, no `server-card.json`, no `agent.openapi.json`)
- Test 4: all agent links use absolute URLs (start with `https://`)
- Use a minimal `SemanticSiteModel` fixture with `baseUrl: "https://example.com"`, a single page, and a minimal organization

**Validation:**

- `pnpm --filter packages/werkstatt-site run test -- --run llms-0789` — new tests pass

**Completion criterion:** 4 unit tests pass covering enabled, disabled, default, and URL absoluteness paths.

**Human review:** no

---

### Step 5. Typecheck and full test suite

**Goal:** Verify no regressions in the full package.

**Agent actions:**

- Run `pnpm --filter packages/werkstatt-site run build:check`
- Run `pnpm --filter packages/werkstatt-site run test`

**Validation:**

- Both commands exit 0

**Completion criterion:** Typecheck and full test suite pass with zero failures.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No `AGENTS.md` updates needed — no new modules or ownership changes.
- No `docs/*.xml` Compass files need updates.
- No `docs/architecture-dna.md` update.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0789`
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0789 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0789`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476). Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0789`
- `pnpm --filter packages/werkstatt-site run build:check`
- `pnpm --filter packages/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0789` (RFC-0330 — will skip silently since acceptance probes are commented out)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0789.generated.json` — verification evidence (may be skipped if no acceptance probes)
- Commit messages referencing `RFC-0789` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| llms.txt size — 3 new lines (~300 bytes) | Negligible, no mitigation needed |
| Broken links — endpoints not generated | Pipeline ordering (RFC-0787) ensures generators run before `llms.generate`; Step 3 uses `canonicalStaticUrl` which produces correct absolute URLs |
| llms.txt validation — no validation for new links | Accepted as advisory; `agent.api-catalog.validate` and `agent.mcp-card.validate` already check endpoint existence |
| semantic.parity drift | Step 2 populates `agent` in the loader; `semantic.parity` calls `buildLlmsIndex` via the same loader, so output matches automatically |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0789 --reason "..." --invariant "DNA-N"` instead of working around it.
