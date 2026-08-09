---
rfcId: RFC-0559
planId: PLAN-RFC-0559-01
status: draft
owner: architecture
createdAt: 2026-07-27
updatedAt:
scope:
  apps: []
  packages:
    - packages/studio-gate
  services: []
  docs:
    - packages/studio-gate/AGENTS.md
    - docs/source-markup.xml
---

# Implementation Plan: RFC-0559

## 1. Objectives

- [ ] O1 — Add site-scoping to auth middleware (credential siteId must match `_meta.system` provided by MCP client) — maps to acceptance criterion "Calls with credential for wrong site return MCP error with `site-mismatch`"
- [ ] O2 — Add per-tool scope enforcement (ActorDelegationCredential scopes must include tool name) — maps to acceptance criterion "Calls with credential with insufficient scope return MCP error with `insufficient-scope`"
- [ ] O3 — Replace plain-text auth errors with MCP JSON-RPC error responses carrying codes -32001 through -32007 — maps to acceptance criteria for `authentication-required`, `site-mismatch`, `insufficient-scope`, `credential-revoked`, `auth-config-missing`, `auth-config-malformed`, `system-id-required`
- [ ] O4 — Add `auth-config-malformed` failure mode (distinct from `auth-config-missing`) — maps to failure modes table
- [ ] O5 — Distinguish `credential-revoked` from `authentication-required` in enforced mode — maps to failure modes table
- [ ] O6 — Verify `SiteOwnershipCredential` grants scope `*` and `ActorDelegationCredential` grants only listed scopes — maps to acceptance criteria for scope semantics
- [ ] O7 — Confirm actor context injection via `--_authActor` CLI arg works for all 12 tools (keeping `--_authActor` prefix to avoid conflict with user-provided `--actor` in mission.open/close/abort) — maps to acceptance criterion "Auth result is injected into MCP tool args as `actor`"
- [ ] O8 — Update `packages/studio-gate/AGENTS.md` with auth module documentation — maps to RFC AGENTS.md updates section

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/studio-gate/src/auth.ts` — extend with site-scoping, scope enforcement, malformed config detection, distinct error types
- `packages/studio-gate/src/index.ts` — replace plain-text auth error responses with MCP JSON-RPC error objects carrying codes -32001 through -32006
- `packages/studio-gate/src/tests/auth.test.ts` — new test file for auth middleware (site-scoping, scope enforcement, error codes, malformed config)

### 2.2 Configuration and data

- `werkstatt.identity.json` — read by auth middleware (already exists from RFC-0558). No schema changes needed — `authMode` and `revokedCredentialIds` fields already present in `WerkstattIdentityConfigSchema`.

### 2.3 Documentation and specs

- `packages/studio-gate/AGENTS.md` — add `src/auth.ts` to "What lives here" table (already done by RFC-0558), add "Authentication" section documenting error codes, site-scoping, scope enforcement
- `docs/source-markup.xml` — update `packages/studio-gate/src/auth.ts` entry to reflect RFC-0559 additions (site-scoping, scope enforcement)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/studio-gate build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/studio-gate test` — Vitest unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0559` — RFC mechanical validation

## 3. Step sequence

### Step 1. Extend auth.ts with site-scoping and scope enforcement

**Goal:** Add siteId check (credential siteId vs mission systemId) and per-tool scope check to the auth middleware.

**Agent actions:**

- Add `siteId` field to `StudioGateAuthResult` interface (extracted from credential subject)
- Add `scopes` field to `StudioGateAuthResult` interface (from credential: `["*"]` for SiteOwnershipCredential, explicit list for ActorDelegationCredential)
- Add `systemId` parameter to `verifyAuthFromMeta` signature (the target system id, extracted from `_meta.system` — MCP client is responsible for providing it)
- If `systemId` is absent in enforced mode, return `{ authenticated: false, error: "system-id-required" }` (new error code -32007)
- If `systemId` is absent in permissive mode, skip site-scoping (warn)
- After credential verification passes, check `credential.subject.siteId === systemId` — return `{ authenticated: false, error: "site-mismatch", expected: systemId, presented: credential.subject.siteId }` if mismatch
- After site check, check `scopes.includes("*") || scopes.includes(toolName)` — return `{ authenticated: false, error: "insufficient-scope", required: toolName, presented: scopes }` if insufficient
- Add `toolName` parameter to `verifyAuthFromMeta` signature
- Handle malformed `werkstatt.identity.json` distinctly from missing: catch JSON parse errors and Zod validation errors separately, return `{ authenticated: false, error: "auth-config-malformed" }` for parse/validation failures, `{ authenticated: false, error: "auth-config-missing" }` for file-not-found

**Validation:**

- `pnpm --filter @warpgogol/studio-gate build:check` passes with the extended types

**Completion criterion:** `auth.ts` exports `verifyAuthFromMeta` that accepts `(meta, werkstattRoot, toolName, systemId)` and returns `StudioGateAuthResult` with `siteId`, `scopes`, and distinct error strings for `site-mismatch`, `insufficient-scope`, `auth-config-missing`, `auth-config-malformed`, `credential-revoked`.

**Human review:** no

---

### Step 2. Update index.ts with MCP JSON-RPC error responses

**Goal:** Replace plain-text auth error responses with structured MCP JSON-RPC error objects carrying codes -32001 through -32006.

**Agent actions:**

- Map auth error strings to MCP error codes:
  - `authentication-required` → -32001
  - `site-mismatch` → -32002
  - `insufficient-scope` → -32003
  - `credential-revoked` → -32004
  - `auth-config-missing` → -32005
  - `auth-config-malformed` → -32006
  - `system-id-required` → -32007
  - `no-credential-permissive` → no error (permissive mode, warn only)
  - `identity-not-configured` → -32005 (same as auth-config-missing)
  - `credential-not-found` → -32001 (treat as authentication-required)
  - `credential-expired` → -32001 (treat as authentication-required)
  - `signature-invalid` → -32001 (treat as authentication-required)
- In the `CallToolRequestSchema` handler, extract `systemId` from `request.params._meta.system` (MCP client provides the target system id)
- Pass `toolName` and `systemId` to `verifyAuthFromMeta`
- Map `system-id-required` error to MCP error code -32007 with `data.hint: "_meta.system is required in enforced mode for site-scoping"`
- In enforced mode, return MCP error response with `code`, `message`, and `data` fields matching the RFC output format
- In permissive mode, write warning to stderr but continue execution

**Validation:**

- `pnpm --filter @warpgogol/studio-gate build:check` passes
- Manual verification: error response shape matches RFC-0559 Output format section

**Completion criterion:** `index.ts` returns MCP JSON-RPC error objects with codes -32001 through -32006 for auth failures in enforced mode, and stderr warnings in permissive mode.

**Human review:** no

---

### Step 3. Add auth tests

**Goal:** Unit tests covering site-scoping, scope enforcement, error codes, malformed config, permissive vs enforced modes.

**Agent actions:**

- Create `packages/studio-gate/src/tests/auth.test.ts`
- Test cases:
  - Permissive mode, no credential → warns, executes (authenticated: false, error: no-credential-permissive)
  - Permissive mode, valid credential → authenticated: true
  - Enforced mode, no credential → authentication-required (-32001)
  - Enforced mode, invalid signature → authentication-required (-32001)
  - Enforced mode, expired credential → authentication-required (-32001)
  - Enforced mode, revoked credential → credential-revoked (-32004)
  - Enforced mode, wrong site → site-mismatch (-32002)
  - Enforced mode, insufficient scope → insufficient-scope (-32003)
  - Enforced mode, config missing → auth-config-missing (-32005)
  - Enforced mode, config malformed → auth-config-malformed (-32006)
  - Enforced mode, missing `_meta.system` → system-id-required (-32007)
  - SiteOwnershipCredential → scopes `["*"]`, all tools pass
  - ActorDelegationCredential with `["workpiece.read"]` → only workpiece.read passes, workpiece.write fails

**Validation:**

- `pnpm --filter @warpgogol/studio-gate test` passes

**Completion criterion:** All test cases pass, covering every row in the RFC failure modes table and both credential types.

**Human review:** no

---

### Step 4. Update AGENTS.md and Compass sync

**Goal:** Synchronize documentation artifacts with the implementation changes.

**Agent actions:**

- Update `packages/studio-gate/AGENTS.md`:
  - Add "Authentication" section documenting: credential presentation via `_meta.identity`, permissive vs enforced modes, error codes (-32001 through -32006), site-scoping, scope enforcement
  - Update `src/auth.ts` row in "What lives here" table to mention RFC-0559 additions
- Update `docs/source-markup.xml` — update `packages/studio-gate/src/auth.ts` entry to reflect RFC-0559 changes (site-scoping, scope enforcement, error codes)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands in this RFC, so likely no change needed)

**Validation:**

- `git diff packages/studio-gate/AGENTS.md` shows the new Authentication section
- `git diff docs/source-markup.xml` shows updated auth.ts entry

**Completion criterion:** AGENTS.md has an Authentication section with error codes and mode descriptions; source-markup.xml reflects the auth.ts changes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (do not hand-edit `docs/ecosystem.generated.yaml`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0559 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0559`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0559`
- `pnpm --filter @warpgogol/studio-gate build:check`
- `pnpm --filter @warpgogol/studio-gate test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0559` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Credential extraction fragility | Step 2 uses existing `_meta.identity` extraction from RFC-0558; no new extraction paths |
| Performance (Ed25519 verify per call) | Step 1 reuses existing `verifyIdentityCredential` from RFC-0558; ~1ms per call, negligible |
| Agent confusion (credential presentation) | Step 4 documents credential setup in AGENTS.md Authentication section |
| Permissive mode false sense of security | Step 4 AGENTS.md documents the mode toggle and recommends enforced mode for production |
| Credential theft via process inspection | Out of scope for this plan — short expiry on delegation credentials is an RFC-0558 concern |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-56 or DNA-22, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0559 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `systemId` extraction from `_meta.system` proves insufficient (e.g., MCP clients cannot provide it), escalate to the operator rather than falling back to mission manifest I/O.
