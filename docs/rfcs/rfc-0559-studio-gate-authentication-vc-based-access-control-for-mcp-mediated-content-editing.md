---
id: RFC-0559
title: "Studio Gate Authentication: VC-based access control for MCP-mediated content editing"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-27
updatedAt: 2026-07-27
enhancedAt: 2026-07-27
implementedAt: 2026-07-27
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0555
amendedBy: []
related:
  - DNA-56
  - DNA-22
  - RFC-0555
  - RFC-0558
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-56
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/studio-gate
successSignals:
  - "Studio Gate rejects an MCP call without a credential in enforced mode with a clear authentication-required error."
  - "Studio Gate accepts an MCP call with a valid SiteOwnershipCredential and passes the actor identity to the underlying Site OS command."
  - "Studio Gate rejects an MCP call with a credential for site B when the mission targets site A with a site-mismatch error."
  - "Studio Gate in permissive mode logs a warning when no credential is presented but still executes the command."
nonGoals:
  - "Do not implement authentication for the Agent Gate HTTP surface (packages/agent-gate) — that is a separate concern for inter-site communication."
  - "Do not implement role-based access control beyond owner and delegated agent in the pilot."
  - "Do not implement credential refresh or token rotation — credentials are static VCs with explicit expiry."
  - "Do not implement audit logging beyond existing Bordbuch — auth decisions are logged in Bordbuch via the actor field."
  - "Do not implement a WERKSTATT_CREDENTIAL env var fallback for MCP clients that do not support _meta.identity — if _meta is unavailable, the X-Werkstatt-Credential header is the fallback. Env var fallback is deferred to a future RFC if a real client need arises."
  - "Do not modify Site OS command implementations (workpiece.read, workpiece.write, mission lifecycle commands) — command-level changes to accept actor from auth context are in RFC-0558's scope. This RFC only adds the MCP server middleware."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0559: Studio Gate Authentication: VC-based access control for MCP-mediated content editing

## Context

RFC-0555 established the Studio Gate MCP server for site owner content editing. The Studio Gate exposes `workpiece.read`, `workpiece.write`, and mission lifecycle commands as MCP tools. However, RFC-0555 explicitly omitted authentication: any MCP client can call any tool without proving identity or ownership.

DNA-56 mandates that "LLMs interacting with site content have no direct filesystem access — only MCP tools." This RFC adds the missing auth layer: before any MCP tool is dispatched, Studio Gate verifies a VC-based credential (defined in RFC-0558) and enforces site ownership and scope checks.

The grilling session (2026-07-27) established model (B): Studio Gate for content editing with auth, IDE for platform code. This RFC implements the auth middleware for the Studio Gate side.

## Problem

1. **No access control on MCP tools.** `packages/studio-gate/src/index.ts` dispatches all MCP tool calls without verifying the caller's identity. Any process that connects to the Studio Gate stdio MCP server can call `workpiece.write` or `mission.reconcile`.
2. **No site-scoping.** A credential holder for site A can call mission commands targeting site B. There is no check that the credential's `siteId` matches the mission's `systemId`.
3. **No scope enforcement.** A delegated LLM agent with `workpiece.read` scope can call `workpiece.write` or `release.publish`. There is no per-tool scope check.
4. **No auth mode toggle.** There is no way to transition from unauthenticated pilot mode to enforced auth without a code change.

## Decision

Studio Gate gains an auth middleware that verifies VC credentials (from RFC-0558) before dispatching any MCP tool. The middleware checks credential validity, site ownership match, and scope sufficiency. Auth mode is controlled by `werkstatt.identity.json` field `authMode` (`permissive` | `enforced`), defaulting to `permissive` for pilot operation. `permissive` mode is a permanent configuration option, not a temporary rollout phase — it serves environments where auth is unnecessary (development, testing, single-operator pilot). It is a runtime toggle on a single code path, not a backward compatibility layer: the same middleware code handles both modes, differing only in whether failures block or warn.

## Architectural fit

- **DNA-56 (Studio Gate):** Extends the Studio Gate architecture from RFC-0555 by adding the auth layer that RFC-0555 omitted. The MCP tool surface is unchanged — auth is enforced at the gate, not at individual tools.
- **DNA-22 (Client-editable surface):** The client-editable whitelist is already enforced at the `workpiece.read`/`workpiece.write` command level. This RFC adds identity verification on top, not a replacement for path checks.
- **RFC-0558 (Identity Model):** Depends on RFC-0558 for VC types, `identity.credential.verify` command, and `werkstatt.identity.json` config. This RFC implements the consumer side of the identity model.
- **RFC-0555 (Studio Gate):** Amends RFC-0555 by adding auth middleware to the existing `CallToolRequestSchema` handler in `packages/studio-gate/src/index.ts`.
- **Scaling:** The auth middleware is designed to work with future P2P peer identity (RFC-0562) without changes — the credential verification interface is agnostic to the credential source.
- **Forward-only compliance:** `permissive` mode is a configuration option, not a compatibility shim. The auth middleware is the single code path for all MCP tool dispatch — there is no legacy unauthenticated dispatch path maintained alongside it. In `permissive` mode, the middleware still runs; it simply logs warnings instead of rejecting. Removing `permissive` mode would not delete a code path — it would remove a configuration value.

## Design

### Actor context propagation

The auth middleware extracts `actorId` and `siteId` from the verified VC and injects `actor` into the MCP tool arguments. The existing `buildCommandArgs` function in `packages/studio-gate/src/index.ts` already converts args to `--key value` CLI flags. For commands that already accept `--actor` (`mission.open`, `mission.close`, `mission.abort`), this is transparent. For commands that do not currently accept `--actor`, the command-level changes to accept and log the actor are in RFC-0558's scope (RFC-0558 file system responsibilities: "Mission commands receive actor from auth middleware, not CLI flag"). This RFC does not modify any Site OS command implementations.

### CLI surface

No new CLI commands. Auth is enforced inside the Studio Gate MCP server process. The operator configures auth mode by editing `werkstatt.identity.json`:

```json
{
  "authMode": "permissive"
}
```

Changing `authMode` to `"enforced"` takes effect on the next Studio Gate process start. No restart-during-operation is needed.

### TypeScript contracts

```ts
// packages/studio-gate/src/auth.ts

import type { StudioGateAuthResult } from "@warpgogol/passport";

export interface AuthMiddlewareOptions {
  authMode: "permissive" | "enforced";
  identityConfigPath: string;  // path to werkstatt.identity.json
}

export async function authenticateMcpCall(
  request: unknown,           // MCP CallToolRequest
  toolName: string,
  options: AuthMiddlewareOptions,
): Promise<StudioGateAuthResult> {
  // 1. Extract credential from request._meta.identity or X-Werkstatt-Credential header
  // 2. Call identity.credential.verify on the credential
  // 3. Check siteId matches the mission's systemId (for mission-scoped tools)
  // 4. Check scopes include the tool name (for delegated credentials)
  // 5. Return auth result
}

// Scopes are derived from STUDIO_GATE_TOOLS in packages/studio-gate/src/tools.ts.
// Each tool name IS its scope name — no separate TOOL_SCOPES mapping is needed.
// SiteOwnershipCredential has scope "*" (all tools).
// ActorDelegationCredential has explicit scopes[] from the credential.
// The middleware checks: credential.scopes.includes("*") || credential.scopes.includes(toolName).
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/studio-gate/src/index.ts` | Auth middleware inserted before `CallToolRequestSchema` handler. Calls `authenticateMcpCall` and rejects unauthenticated calls in enforced mode. Injects `actor` into tool args from VC subject id. |
| `packages/studio-gate/src/auth.ts` | New file. Auth middleware implementation: credential extraction, verification, site match, scope check. |
| `werkstatt.identity.json` | Read by auth middleware for `authMode` and revocation list. |

### AGENTS.md updates

- `packages/studio-gate/AGENTS.md` — add `src/auth.ts` module to the "What lives here" table, document the `authMode` configuration in the "Boundaries" section, and add an "Authentication" section describing credential presentation, permissive vs enforced modes, and error codes.

### Compass sync

This RFC adds one new source file (`packages/studio-gate/src/auth.ts`) and modifies `packages/studio-gate/src/index.ts`. After implementation:

- `docs/source-markup.xml` — add `packages/studio-gate/src/auth.ts` to the source-file inventory, update `packages/studio-gate/src/index.ts` entry.
- Run `ecosystem.manifest.generate` to update `docs/ecosystem.generated.yaml`.

### Output format

Auth errors are returned as MCP error responses (JSON-RPC error):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "authentication-required",
    "data": {
      "authMode": "enforced",
      "hint": "Provide a valid VC credential in _meta.identity or X-Werkstatt-Credential header"
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32002,
    "message": "site-mismatch",
    "data": {
      "expected": "warpgogol-com",
      "presented": "other-site"
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32003,
    "message": "insufficient-scope",
    "data": {
      "required": "workpiece.write",
      "presented": ["workpiece.read"]
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32004,
    "message": "credential-revoked",
    "data": {
      "credentialId": "urn:warpgogol:cred:abc123"
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32005,
    "message": "auth-config-missing",
    "data": {
      "hint": "werkstatt.identity.json not found. Run identity.bootstrap (RFC-0558) to create it."
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32006,
    "message": "auth-config-malformed",
    "data": {
      "hint": "werkstatt.identity.json is not valid JSON or is missing required fields."
    }
  }
}
```

### Failure modes

| Condition | Permissive mode | Enforced mode |
| --- | --- | --- |
| No credential presented | Warn, execute command | Reject with `authentication-required` (-32001) |
| Credential signature invalid | Warn, execute command | Reject with `authentication-required` (-32001) |
| Credential expired | Warn, execute command | Reject with `authentication-required` (-32001) |
| Credential revoked | Warn, execute command | Reject with `credential-revoked` (-32004) |
| Credential for wrong site | Warn, execute command | Reject with `site-mismatch` (-32002) |
| Credential scope insufficient | Warn, execute command | Reject with `insufficient-scope` (-32003) |
| `werkstatt.identity.json` not found | Warn, execute command | Reject with `auth-config-missing` (-32005) |
| `werkstatt.identity.json` malformed | Warn, execute command | Reject with `auth-config-malformed` (-32006) |

In permissive mode, warnings are written to stderr but the command still executes. This allows gradual rollout without breaking existing workflows.

Concurrent verification: the auth middleware is stateless — each `authenticateMcpCall` invocation reads `werkstatt.identity.json` independently and calls `identity.credential.verify` without shared mutable state. Concurrent MCP tool calls (possible via the BuildQueue for build-triggering tools, ADR-0005) are safe because Ed25519 verification is a pure function and `werkstatt.identity.json` is read-only during MCP server operation (modified only by `identity.credential.issue`/`revoke` CLI commands, not by the MCP server).

## Rollout

- **Phase 1 (permissive default):** Auth middleware is added but `authMode` defaults to `permissive`. Existing MCP clients continue to work without credentials. Warnings are logged to stderr for calls without credentials.
- **Phase 2 (operator enforces):** The operator runs `identity.bootstrap` (RFC-0558), confirms their VC works, then sets `authMode: "enforced"` in `werkstatt.identity.json`. Studio Gate process restart picks up the new mode.
- **Phase 3 (delegation):** The operator issues `ActorDelegationCredential` VCs for LLM agents with scoped permissions. Agents present these VCs via MCP `_meta.identity`.
- **No flag day:** The transition from permissive to enforced is a config file change, not a code change. Existing MCP clients that pass credentials continue to work in both modes.

## Alternatives considered

1. **Auth at each tool level.** Add auth checks inside every `workpiece.read`, `workpiece.write`, etc. Rejected: duplicates auth logic across 12+ tools, harder to maintain, and the MCP protocol naturally supports middleware at the request handler level.
2. **Auth via environment variable (API key).** Pass a static API key as an env var to Studio Gate. Rejected: no cryptographic identity, no site scoping, no delegation. Does not align with RFC-0558 VC model.
3. **Auth via MCP `initialize` handshake.** Require credentials during the MCP `initialize` call and cache for the session. Rejected: MCP stdio transport has no persistent session — each `CallToolRequest` is independent. Auth per-call is simpler and stateless.
4. **OAuth2 token validation.** Validate an OAuth2 bearer token against an external provider. Rejected: same reasons as RFC-0558 — external dependency, no offline operation, does not align with P2P architecture.

## Risks

- **Credential extraction fragility.** MCP stdio transport does not define a standard auth header. The credential is passed in `_meta.identity` (MCP metadata) or as a custom `X-Werkstatt-Credential` header. If MCP clients support neither, the operator must use a client that does or wait for a future RFC adding an env var fallback.
- **Performance.** Each MCP call now invokes `identity.credential.verify` (Ed25519 signature check, ~1ms). For a typical editing session with 50-100 MCP calls, this adds <100ms total. Negligible.
- **Agent confusion.** LLM agents may not understand how to present credentials. Mitigation: clear error messages with hints, and the `wg-site-content-edit` skill instructions can include credential setup steps.
- **Permissive mode false sense of security.** Operators may forget to switch to enforced mode. Mitigation: `identity.bootstrap` output includes a reminder to set `authMode: "enforced"` after testing.
- **Credential theft via process inspection.** On shared systems, another process could read the credential from the MCP client's memory. Mitigation: short expiry on delegation credentials, and future token binding to process identity.

## Acceptance criteria

- [x] `packages/studio-gate/src/auth.ts` exists with `authenticateMcpCall` function (evidence: packages/studio-gate/src/auth.ts:103 — implemented as `verifyAuthFromMeta`, same semantics)
- [x] `packages/studio-gate/src/index.ts` calls `authenticateMcpCall` before dispatching to `CallToolRequestSchema` handler (evidence: packages/studio-gate/src/index.ts:117 — calls `verifyAuthFromMeta` before command execution)
- [x] Auth middleware reads `authMode` from `werkstatt.identity.json` (evidence: packages/studio-gate/src/auth.ts:118 — `config.authMode` check)
- [x] In `permissive` mode, calls without credentials produce stderr warnings but execute (evidence: packages/studio-gate/src/index.ts:123-125 — stderr warning, continues execution)
- [x] In `enforced` mode, calls without valid credentials return MCP error with `authentication-required` (evidence: packages/studio-gate/src/index.ts:119-121, auth.test.ts:191-196)
- [x] Calls with credential for wrong site return MCP error with `site-mismatch` (evidence: auth.test.ts:243-250 — site-mismatch test, index.ts:161 — error code -32002)
- [x] Calls with credential with insufficient scope return MCP error with `insufficient-scope` (evidence: auth.test.ts:253-261 — insufficient-scope test, index.ts:163 — error code -32003)
- [x] `SiteOwnershipCredential` grants scope `*` (all tools) (evidence: auth.test.ts:270-275 — owner credential passes all tools, auth.ts:92-96 — `extractScopes` returns `["*"]` for owner)
- [x] `ActorDelegationCredential` grants only scopes listed in credential (evidence: auth.test.ts:253-261 — delegation with `workpiece.read` fails for `workpiece.write`)
- [x] Auth result (actorId, siteId) is injected into MCP tool args as `actor` by the MCP server (not by modifying Site OS command implementations — command-level changes are in RFC-0558) (evidence: packages/studio-gate/src/index.ts:129-131 — `--_authActor` CLI flag injection)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate RFC-0559 --json` — status: pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT bypass the auth middleware by adding direct command dispatch paths.
- The auth middleware MUST be the single entry point for all MCP tool calls in Studio Gate.
- Agents MUST NOT hardcode `authMode` — it is always read from `werkstatt.identity.json`.
- Scopes are derived from `STUDIO_GATE_TOOLS` in `packages/studio-gate/src/tools.ts` — each tool name IS its scope name. No separate `TOOL_SCOPES` mapping is needed. Adding a new tool to `STUDIO_GATE_TOOLS` automatically makes it a valid scope.
