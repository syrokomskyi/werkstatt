---
reviewId: REVIEW-CODE-2026-07-27-01
date: 2026-07-27
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: 6839d7d...HEAD
filesReviewed:
  - packages/studio-gate/src/auth.ts
  - packages/studio-gate/src/index.ts
  - packages/studio-gate/src/tests/auth.test.ts
  - packages/studio-gate/AGENTS.md
  - docs/rfcs/rfc-0559-studio-gate-authentication-vc-based-access-control-for-mcp-mediated-content-editing.md
---

# Code Review: 6839d7d...HEAD (RFC-0559 implementation)

### Verdict: Approved

The implementation correctly extends the Studio Gate auth middleware with site-scoping, scope enforcement, and structured MCP JSON-RPC error codes. All 15 tests pass, build:check passes, RFC validation passes. Three minor findings (cosmetic/placement) — no axis B, D, or E failures.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/studio-gate build:check` and `pnpm --filter @warpgogol/studio-gate test` (39 tests, 3 files) pass. `rfc.validate RFC-0559` passes.

### Axis A — Structural correctness

1. **Minor — placement of `AUTH_ERROR_CODES` and `formatAuthError`.** Both are defined after the `main()` call at the bottom of `index.ts` (lines 161-209). While this works due to hoisting (function declaration) and module-level `const` initialization before any async handler runs, it is unconventional. These should be defined before `main()` for readability — a reader encountering `formatAuthError(authResult)` at line 120 has to scroll past `main()` to find the definition.

2. **Minor — hardcoded `authMode: "enforced"` in config-missing/malformed returns.** In `auth.ts:112` and `auth.ts:115`, the `authMode` field is hardcoded to `"enforced"` when config is missing or malformed. This is semantically correct (safe default when mode is unknown), but the literal could be a named constant for clarity.

### Axis B — DNA alignment

No issues. DNA-56 (Studio Gate MCP-mediated content editing) is respected — auth is enforced at the gate, not at individual tools. DNA-22 (client-editable surface) is unaffected — still enforced at command level. DNA-42 (Compass markup) — all modified files carry updated `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks; new test file has scaffolding.

### Axis C — Ecosystem fit

No issues. Package boundaries are correct (`studio-gate` imports from `@warpgogol/passport`, never reverse). AGENTS.md updated with Authentication section including error codes table, scope semantics, and actor injection documentation. No new commands or package graph changes.

### Axis D — Forward-only compliance

1. **Minor — dead entry in `AUTH_ERROR_CODES` map.** The `identity-not-configured` entry (line 172) maps to -32005, but the new code never produces this error string — it was replaced by `auth-config-missing`. This is dead code in the map and should be removed per forward-only discipline.

No other issues. The old `loadIdentityConfig` return type (`WerkstattIdentityConfig | undefined`) was cleanly replaced with `IdentityConfigResult` (union with status discriminant). The old permissive-mode short-circuit (returning `authenticated: true` without signature verification) was removed — permissive mode now runs the full verification pipeline and only differs in whether failures block or warn.

### Axis E — Agent-facing clarity

No issues. Compass scaffolding present and updated on all files. Function and variable names are descriptive (`extractScopes`, `extractSiteId`, `configResult`, `credentialSiteId`). Error messages include hints for MCP clients. The `AUTH_ERROR_CODES` map is readable and self-documenting.

### Axis F — Pragmatism

No issues. The error code map is the minimum needed — 11 entries covering all error strings produced by `verifyAuthFromMeta`. No speculative generality. The `formatAuthError` function is lean and single-purpose. Scope discipline is maintained — only `auth.ts`, `index.ts`, tests, and AGENTS.md were touched.

### Axis G — Blind spots

No issues. Performance is documented (~1ms Ed25519 per call). Concurrent execution is safe — auth middleware is stateless. Edge cases covered: config missing vs malformed, missing systemId, expired credentials, revoked credentials, wrong site, insufficient scope. All 15 test cases cover the failure modes table.

### Spec compliance

| Requirement from RFC-0559 | Status | Evidence |
| --- | --- | --- |
| Site-scoping (credential siteId vs _meta.system) | Done | auth.ts:159-168, auth.test.ts:243-250 |
| Per-tool scope enforcement | Done | auth.ts:170-179, auth.test.ts:253-261 |
| MCP JSON-RPC error codes -32001..-32007 | Done | index.ts:161-173, formatAuthError |
| auth-config-malformed distinct from auth-config-missing | Done | auth.ts:54-68, auth.test.ts:316-330 |
| credential-revoked distinct from authentication-required | Done | auth.ts:139-141, auth.test.ts:208-215 |
| SiteOwnershipCredential grants scope * | Done | auth.ts:92-96, auth.test.ts:270-275 |
| ActorDelegationCredential grants only listed scopes | Done | auth.ts:92-96, auth.test.ts:253-261 |
| Actor injection via --_authActor | Done | index.ts:129-131 |
| Permissive mode warns, executes | Done | index.ts:123-125, auth.test.ts:167-173 |
| Enforced mode rejects with MCP error | Done | index.ts:119-121, auth.test.ts:191-196 |

### Questions for the author

1. The `identity-not-configured` entry in `AUTH_ERROR_CODES` is dead — should it be removed?
2. Would moving `AUTH_ERROR_CODES` and `formatAuthError` above `main()` improve readability?
