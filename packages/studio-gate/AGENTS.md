# @warpgogol/studio-gate

RFC-0555: stdio MCP server for site owner content editing with mission lifecycle.

## What lives here

| Module | Exports |
| --- | --- |
| `src/index.ts` | MCP server entrypoint — stdio transport, WERKSTATT_ROOT env var, serverInfo.instructions from wg-site-content-edit SKILL.md, routes build-triggering tools through BuildQueue (ADR-0005) |
| `src/tools.ts` | 12 tool definitions (workpiece.read, workpiece.write, mission.open, mission.materialize, mission.git.commit, mission.validate, mission.reconcile, mission.close, mission.abort, release.prepare, release.ready, leitstand.propagate) |
| `src/executor.ts` | Command executor via child_process — passes content via stdin for workpiece.write |
| `src/build-queue.ts` | ADR-0005: in-memory semaphore-based build queue — limits concurrent build-triggering tool calls (mission.validate, mission.build) per VM |
| `src/auth.ts` | RFC-0558/RFC-0559: VC-based auth middleware — `verifyAuthFromMeta()` reads `werkstatt.identity.json`, verifies VC tokens from MCP metadata. Supports permissive (warn-only) and enforced (reject) modes. RFC-0559: site-scoping via `_meta.system`, per-tool scope enforcement, distinct error codes (-32001..-32007). RFC-0561: `verifyOwnership()` reads fleet registry and checks `entry.owner` against VC credential subject id. |
| `src/auth-errors.ts` | Auth error mapping and formatting — `AUTH_ERROR_CODES` map and `formatAuthError()` for MCP JSON-RPC error responses. Extracted from `index.ts`. |
| `src/tool-dispatcher.ts` | Tool dispatch — `findTool()`, `buildCommandArgs()`, `dispatchTool()`. Handles tool lookup, CLI argument building, and execution dispatch. Extracted from `index.ts`. |

## Boundaries

- **stdio only** — no HTTP transport. `agent-gate` handles HTTP/JSON-RPC for public-facing agent interactions.
- **No direct filesystem access** — all file operations go through `workpiece.read` and `workpiece.write` Site OS commands, which enforce DNA-22.
- **Proxies to Site OS commands** — the MCP server is a thin wrapper that calls `pnpm exec site-kernel run <command>` via child_process.
- **WERKSTATT_ROOT env var** — resolves the workspace root for command execution. Falls back to `process.cwd()` if unset.
- **STUDIO_GATE_BUILD_CONCURRENCY env var** — max concurrent build-triggering tool calls (default: 2). ADR-0005: the build queue prevents VM resource exhaustion when multiple sites' missions are built simultaneously.

## Transport contract

- MCP stdio transport (JSON-RPC over stdin/stdout)
- `serverInfo.instructions` populated from `packages/warpgogol-skills/skills/wg-site-content-edit/SKILL.md`
- 12 tools exposed via `tools/list` and `tools/call`

## Authentication (RFC-0559)

The auth middleware verifies VC tokens before dispatching to Site OS commands.

### Credential presentation

MCP clients present credentials via `_meta.identity` in the `tools/call` request:

- String form: `_meta.identity: "<credentialId>"`
- Object form: `_meta.identity.credentialId: "<credentialId>"`

The target system id is provided via `_meta.system` for site-scoping.

### Auth modes

- **permissive** — warns on missing/invalid credentials but allows execution. Use for development.
- **enforced** — rejects unauthenticated calls with MCP JSON-RPC error responses. Use for production.

Configured in `werkstatt.identity.json` via the `authMode` field (RFC-0558).

### Error codes

| Code | Error string | Meaning |
| --- | --- | --- |
| -32001 | `authentication-required` | No credential, credential not found, expired, or signature invalid |
| -32002 | `site-mismatch` | Credential siteId does not match `_meta.system` |
| -32003 | `insufficient-scope` | ActorDelegationCredential scopes do not include the tool name |
| -32004 | `credential-revoked` | Credential is in `revokedCredentialIds` |
| -32005 | `auth-config-missing` | `werkstatt.identity.json` not found |
| -32006 | `auth-config-malformed` | `werkstatt.identity.json` is invalid JSON or fails schema validation |
| -32007 | `system-id-required` | `_meta.system` is absent in enforced mode |

### Scope semantics

- `SiteOwnershipCredential` — grants scope `*` (all tools)
- `ActorDelegationCredential` — grants only the scopes listed in `subject.scopes`

### Actor context injection

Authenticated actor id is injected via `--_authActor` CLI flag (not `--actor`, which is a user-provided parameter in some mission commands).

## Validation

```sh
rtk pnpm --filter @warpgogol/studio-gate build:check
rtk pnpm --filter @warpgogol/studio-gate test
```
