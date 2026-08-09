---
id: RFC-0555
title: 'Studio Gate: MCP server for site owner content editing with mission lifecycle'
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-27
updatedAt: 2026-07-27
enhancedAt: 2026-07-27
implementedAt: 2026-07-27
closedAt: null
supersedes: []
supersededBy: null
amends: []
amendedBy:
- RFC-0558
- RFC-0559
related:
- DNA-22
- DNA-46
- DNA-47
- DNA-48
- DNA-49
- RFC-0290
satisfies:
- DNA-56
versionBump: patch
commands:
  proposed:
  - workpiece.read
  - workpiece.write
  added:
  - workpiece.read
  - workpiece.write
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
- studio-gate
- site-kernel-handoff
successSignals:
- studio-gate MCP server exposes workpiece.read, workpiece.write, and mission lifecycle commands as MCP tools over stdio transport
- workpiece.write rejects paths outside DNA-22 clientEditable[] whitelist before any file I/O occurs
- workpiece.read returns file content only from within clientEditable[] surface
- wg-site-content-edit skill provides process layer as MCP serverInfo.instructions
- Operator can connect any MCP-capable LLM client (Devin, Cursor, Claude Desktop) to studio-gate and perform content edits through mission lifecycle
- 'DNA-22 enforcement is dual-layer: command-level (workpiece.write rejects) and validate-level (client.edit.validate in mission.validate)'
nonGoals:
- Telegram bot adapter — future phase, not part of this RFC
- Custom LLM testing client (scripts/studio-chat.ts) — operator connects any MCP-capable client directly
- Tier 2 programmer surface editing — Docker containerization for arbitrary code execution is a future concern
- Message brokers (Hermes, Kafka, Redis) — unnecessary due to one-open-mission-per-Sternsystem constraint (DNA-46)
- Replacing agent-gate (RFC-0290) — studio-gate is a separate package with different transport, purpose, and security model

---

# RFC-0555: Studio Gate: MCP server for site owner content editing with mission lifecycle

## Context

The Warpgogol platform manages sites as Sternsystems (DNA-44) with a mission lifecycle (DNA-46): open → materialize → edit → validate → release → reconcile → close. Content lives in `src/content/` (DNA-4) with a client-editable surface whitelist (DNA-22). Mission lifecycle commands (`mission.open`, `mission.materialize`, `mission.git.commit`, `mission.validate`, `mission.reconcile`, `mission.close`, `release.prepare`, `release.publish`, `leitstand.propagate`) already exist as Site OS commands.

The existing `packages/agent-gate` (RFC-0290) provides an HTTP/JSON-RPC MCP endpoint for public-facing agent interaction — capability dispatch, integration events, rate limiting. It is Astro-integrated and designed for external agents calling site capabilities (contact forms, newsletter signups), not for site owners editing content through mission lifecycle.

There is no MCP server that exposes content editing capabilities to site owners' LLMs. Site owners need to edit content (markdown, page sections, order, limited styles) through a controlled interface that enforces DNA-22 and orchestrates the full mission lifecycle: open mission → materialize workpiece → read/write content → commit → validate → release → deploy to alt for preview → promote to main on approval.

## Problem

Site owners cannot edit their site content through LLM interaction without direct filesystem access to the monorepo. The current system has no MCP server that:

1. **Exposes content editing as MCP tools** — LLMs need structured tools (read, write, commit, validate, deploy) not raw filesystem access.
2. **Enforces DNA-22 at the tool level** — `client.edit.validate` runs during `mission.validate`, but there is no pre-write gate that rejects paths outside `clientEditable[]` before the file is written.
3. **Orchestrates mission lifecycle as a tool sequence** — LLMs need to call `mission.open`, `mission.materialize`, `workpiece.read`, `workpiece.write`, `mission.git.commit`, `mission.validate`, `release.prepare`, `leitstand.propagate` as individual MCP tool calls.
4. **Provides process instructions** — LLMs need a skill (process layer) that defines the correct order, boundaries, and approval flow.

Without this, site owner content editing requires either direct filesystem access (security risk, no DNA-22 enforcement) or manual CLI commands (not LLM-accessible, not scalable to Telegram/chatbot interaction).

## Decision

The platform gains a `packages/studio-gate` MCP server (stdio transport, `@modelcontextprotocol/sdk`) that projects two new Site OS commands (`workpiece.read`, `workpiece.write`) and existing mission lifecycle commands as MCP tools. The `wg-site-content-edit` skill (`.agents/skills/wg-site-content-edit/SKILL.md`) provides the process layer as MCP `serverInfo.instructions`. DNA-22 is enforced at the command level: `workpiece.read` and `workpiece.write` reject paths outside the `clientEditable[]` whitelist before any file I/O.

## Architectural fit

- **DNA-22 (Client-editable surface whitelist)** — `workpiece.read` and `workpiece.write` enforce DNA-22 at the command level, rejecting paths outside `clientEditable[]` before any file I/O. This adds a pre-write enforcement layer complementing the existing `client.edit.validate` gate in `mission.validate`.
- **DNA-46 (Mission lifecycle)** — studio-gate projects mission lifecycle commands as MCP tools, orchestrating the full open → materialize → edit → validate → release → reconcile → close flow.
- **DNA-47 (Materialization)** — `mission.materialize` tool creates the workpiece from which `workpiece.read` reads and `workpiece.write` writes.
- **DNA-48 (Release discipline)** — `release.prepare` and `release.publish` tools enforce release validation before deployment.
- **DNA-49 (Fleet propagation)** — `leitstand.propagate` tool deploys to alt (preview) and main (production) channels.
- **RFC-0290 (Agent Gate)** — studio-gate is a separate package from agent-gate. Agent-gate is HTTP/JSON-RPC, Astro-integrated, for public-facing capability dispatch. Studio-gate is stdio MCP, for VM-side content editing through mission lifecycle. Different transport, different purpose, different security model.
- **Site OS operator model** — `workpiece.read` and `workpiece.write` are Site OS commands (kernel-level, available via `site-kernel run`), registered in the `site-kernel-handoff` package. Studio-gate projects them as MCP tools alongside existing mission lifecycle commands.

## Design

### New Site OS commands

#### `workpiece.read`

```sh
pnpm exec werkstatt run workpiece.read --mission <missionId> --path <relative-path> --json
```

Reads a file from the mission workpiece. Flags:

- `--mission` (required) — mission id (e.g. `warpgogol-com-m000015`)
- `--path` (required) — relative path within workpiece (e.g. `src/content/pages/de/home.md`)

Path validation (before any file I/O):

1. Resolve path relative to `missions/<missionId>/workpiece/`
2. Reject path traversal (`..` segments) — resolved path must stay within workpiece root
3. Check path against DNA-22 `clientEditable[]` whitelist from workpiece `system.md`
4. Reject if path is outside `clientEditable[]` with error: `Path '<path>' is outside client-editable surface (DNA-22)`

Output:

```json
{
  "command": "workpiece.read",
  "status": "ok",
  "data": {
    "path": "src/content/pages/de/home.md",
    "content": "---\nkind: page\n..."
  }
}
```

#### `workpiece.write`

```sh
echo '<file-content>' | pnpm exec werkstatt run workpiece.write --mission <missionId> --path <relative-path> --stdin --json
```

Writes a file to the mission workpiece. Content is passed via **stdin** (not a CLI flag) to avoid shell argument length limits (~128KB on Linux). Flags:

- `--mission` (required) — mission id
- `--path` (required) — relative path within workpiece
- `--stdin` (required) — read file content from stdin instead of a CLI flag

Path validation (same as `workpiece.read`): resolve, reject traversal, check DNA-22, reject if outside whitelist.

Does NOT auto-commit. The LLM must separately call `mission.git.commit` to commit changes. This allows grouping multiple writes into a single commit.

**Concurrency**: `workpiece.write` does not acquire a Werkstatt lock (DNA-51). It writes a single file atomically at the OS level (`fs.writeFile`). Concurrent writes to the _same path_ from parallel MCP tool calls are the LLM's responsibility — the MCP server processes tool calls sequentially (stdio transport is inherently sequential). `mission.git.commit` is the atomicity boundary for grouping multiple writes.

Output:

```json
{
  "command": "workpiece.write",
  "status": "ok",
  "data": {
    "path": "src/content/pages/de/home.md",
    "bytesWritten": 1234
  }
}
```

### MCP server: `packages/studio-gate`

Studio-gate is a stdio MCP server built with `@modelcontextprotocol/sdk`. It is spawned as a child process by any MCP-capable LLM client (Devin, Cursor, Claude Desktop, GLM client).

#### MCP tools projected

| Tool name | Underlying command | Notes |
| --- | --- | --- |
| `workpiece.read` | `site-kernel run workpiece.read` | DNA-22 path validation |
| `workpiece.write` | `site-kernel run workpiece.write` | DNA-22 path validation, no auto-commit |
| `mission.open` | `site-kernel run mission.open` | Flags: system, brief |
| `mission.materialize` | `site-kernel run mission.materialize` | Flags: mission |
| `mission.git.commit` | `site-kernel run mission.git.commit` | Flags: mission, message |
| `mission.validate` | `site-kernel run mission.validate` | Flags: mission |
| `mission.reconcile` | `site-kernel run mission.reconcile` | Flags: mission |
| `mission.close` | `site-kernel run mission.close` | Flags: mission |
| `mission.abort` | `site-kernel run mission.abort` | Flags: mission |
| `release.prepare` | `site-kernel run release.prepare` | Flags: mission |
| `release.publish` | `site-kernel run release.publish` | Flags: release |
| `leitstand.propagate` | `site-kernel run leitstand.propagate` | Flags: release, channel |

#### MCP serverInfo.instructions

The server reads `wg-site-content-edit` SKILL.md and injects it as `serverInfo.instructions` in the MCP initialize response. This provides the LLM with the process layer: what to do, in what order, DNA-22 boundaries, and the approval flow.

#### Transport

Stdio only. The MCP server reads JSON-RPC 2.0 messages from stdin and writes responses to stdout. No HTTP, no WebSocket. This matches the MCP standard for local tool servers.

#### Command execution

Mission lifecycle commands are executed via `child_process.exec` (or `execa`) as `pnpm exec werkstatt run <command> <flags>`. The MCP server parses the JSON output and returns it as MCP tool result content.

### TypeScript contracts

```ts
// packages/studio-gate/src/types.ts

interface WorkpieceReadInput {
  mission: string;
  path: string;
}

interface WorkpieceReadResult {
  path: string;
  content: string;
}

interface WorkpieceWriteInput {
  mission: string;
  path: string;
  // Content is read from stdin, not passed as a CLI flag, to avoid
  // shell argument length limits (~128KB on Linux).
}

interface WorkpieceWriteResult {
  path: string;
  bytesWritten: number;
}

// DNA-22 path validation
interface ClientEditableChecker {
  isClientEditable(workpieceRoot: string, relativePath: string): Promise<boolean>;
}
```

```ts
// packages/studio-gate/src/index.ts (entrypoint)

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";

// WERKSTATT_ROOT resolves the workspace root for site-kernel commands.
// The LLM client spawns studio-gate with this env var set to the Werkstatt root.
// Falls back to process.cwd() if unset (for local development).
const werkstattRoot = process.env.WERKSTATT_ROOT ?? process.cwd();

const skillPath = ".agents/skills/wg-site-content-edit/SKILL.md";
const instructions = readFileSync(skillPath, "utf8");

const server = new Server(
  { name: "studio-gate", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

// Register tools/list and tools/call handlers
// tools/list returns the 12 tools listed above
// tools/call dispatches to child_process.exec for site-kernel commands,
// passing WERKSTATT_ROOT as cwd to each invocation.

const transport = new StdioServerTransport();
await server.connect(transport);
```

### MCP SDK version

The server requires `@modelcontextprotocol/sdk` >= 1.0.0 (the first stable release that supports `serverInfo.instructions` in the initialize response). The exact version is pinned in `packages/studio-gate/package.json`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/studio-gate/` | New package: MCP server (stdio), tool projections, command execution |
| `packages/studio-gate/src/index.ts` | MCP server entrypoint (stdio transport) |
| `packages/studio-gate/src/tools.ts` | Tool definitions and schemas |
| `packages/studio-gate/src/executor.ts` | Command execution via child_process |
| `packages/studio-gate/AGENTS.md` | Package-level agent guide |
| `packages/os/site-kernel-handoff/src/workpiece/` | New command implementations: workpiece-read.ts, workpiece-write.ts |
| `packages/warpgogol-skills/skills/wg-site-content-edit/SKILL.md` | Process layer skill (wg-skill, in the wg skill pack) |
| `docs/architecture-dna.md` | DNA-56 entry added |

### DNA-22 path validation logic

The `workpiece.read` and `workpiece.write` commands share a path validation function:

1. **Resolve** — `path.resolve(workpieceRoot, relativePath)` to get absolute path
2. **Traversal check** — verify resolved path starts with `workpieceRoot` (reject `../` traversal)
3. **Load clientEditable** — load `system.md` from workpiece via `loadSystemManifest()` from `@warpgogol/site-kernel-content` (the canonical loader for RFC-0047 `system.md` frontmatter). Parse `clientEditable[]` array from the parsed manifest. Note: the existing `client.edit.validate` in `site-kernel-checks` reads legacy `system.yaml`; `workpiece.read`/`write` use the canonical `system.md` path via `loadSystemManifest`.
4. **Pattern match** — check if relativePath matches any entry in `clientEditable[]`:
   - `src/content/{business-profile,pages,sections,components,features,people}/**`
   - `src/content/**/assets/**` (whitelisted media extensions)
   - `src/content/**/*.client.ts`
   - `system.md` keys `identity.biome`, `release.passportEnabled` (handled specially for partial edits)
5. **Reject** — if no match, throw: `Path '<path>' is outside client-editable surface (DNA-22)`

### Failure modes

All `workpiece.read`/`workpiece.write` rejections produce exit code 1 and a JSON error response on stderr. Successful invocations produce exit code 0 and JSON output on stdout.

- **Path outside DNA-22** — `workpiece.read` and `workpiece.write` reject with error message (exit 1). LLM receives the error and must adapt (edit only within `src/content/`).
- **Path traversal attempt** — rejected with `Path traversal detected` error (exit 1). No file I/O occurs.
- **Mission not open** — `workpiece.read`/`write` reject with `Mission '<id>' is not open or does not exist` (exit 1).
- **Workpiece not materialized** — `workpiece.read`/`write` reject with `Workpiece for mission '<id>' not found. Run mission.materialize first.` (exit 1).
- **Command execution failure** — MCP tool returns error result with stderr output (exit 1). LLM receives the error and can retry or report.
- **MCP server crash** — LLM client detects server disconnect and can restart it. State is in mission workpiece (filesystem), not in server memory.
- **WERKSTATT_ROOT not set** — if `WERKSTATT_ROOT` env var is unset and `process.cwd()` is not a valid Werkstatt root, `site-kernel run` commands will fail with a config-loading error. The MCP server logs a warning on startup if `WERKSTATT_ROOT` is unset.

### Compass sync

This RFC adds a new package and new Site OS commands. The following Compass XML files may need synchronization after implementation:

- `docs/source-markup.xml` — new source files in `packages/studio-gate/` and `packages/os/site-kernel-handoff/src/workpiece/`
- `docs/requirements.xml` — if the new commands introduce new requirements entries

Run `ecosystem.manifest.generate` after implementation to update `docs/ecosystem.generated.yaml`.

### AGENTS.md updates

- `packages/studio-gate/AGENTS.md` — new package-level agent guide (ownership, boundaries, transport contract)
- `packages/AGENTS.md` — add `studio-gate` to the ownership table

## Rollout

- **Default behavior**: `workpiece.read` and `workpiece.write` are available immediately as Site OS commands. Studio-gate MCP server is available as a package entrypoint.
- **Existing apps**: no changes needed — existing mission lifecycle commands are unchanged. `workpiece.read`/`write` are additive commands.
- **New apps**: all new Sternsystems can use studio-gate for content editing from day one.
- **Testing**: operator connects any MCP-capable LLM client (Devin, Cursor, Claude Desktop, GLM client) to `packages/studio-gate` via stdio. No custom testing client needed.
- **Production deployment**: studio-gate runs as a Node.js process on the VM (Werkstatt). The LLM client (Telegram bot, future) spawns it as a child process. See ADR-0005 for VM deployment model.
- **No migration path** — this is purely additive. No existing commands are changed or deprecated.

## Alternatives considered

1. **Extend agent-gate (RFC-0290) with stdio transport** — rejected because agent-gate is HTTP/JSON-RPC, Astro-integrated, for public-facing capability dispatch. Mixing stdio MCP for content editing with HTTP MCP for capability dispatch in one package conflates two different concerns, security models, and transport mechanisms. Two packages is cleaner.

2. **MCP tools only (not Site OS commands)** — rejected because `workpiece.read` and `workpiece.write` need DNA-22 path validation, which belongs in the kernel (alongside `client.edit.validate`). Making them MCP-only would move security enforcement into the MCP server, bypassing the kernel's validation layer. Site OS commands ensure the kernel is the single enforcement point.

3. **Auto-commit in `workpiece.write`** — rejected because LLMs need control over commit grouping. Multiple file writes (e.g. updating a page and its associated section) should be one commit, not N commits. Separate `mission.git.commit` tool call gives the LLM this control.

4. **Granular content commands (`content.page.update`, `content.section.reorder`, etc.)** — rejected because LLMs can directly manipulate structured content (Markdown/YAML) read from the workpiece. Two generic commands (`workpiece.read`, `workpiece.write`) are sufficient. Granular commands would proliferate the command surface unnecessarily.

5. **Custom LLM testing client (`scripts/studio-chat.ts`)** — rejected because the operator can connect any MCP-capable LLM client (Devin, Cursor, Claude Desktop, GLM client) directly to the studio-gate MCP server. A custom client would duplicate existing MCP client functionality.

## Risks

- **DNA-22 path validation false positives** — the `clientEditable[]` pattern matching may reject valid paths due to glob resolution edge cases. Mitigation: use the same DNA-22 surface definition as `client.edit.validate` (already battle-tested), but load `clientEditable[]` from `system.md` via `loadSystemManifest()` (`@warpgogol/site-kernel-content`) rather than from legacy `system.yaml`.
- **LLM confusion from tool count** — 12 MCP tools may overwhelm smaller LLMs. Mitigation: the `wg-site-content-edit` skill in `serverInfo.instructions` provides the process layer, guiding the LLM through the correct tool sequence.
- **Command execution latency** — each MCP tool call spawns a child process (`pnpm exec werkstatt run`). For rapid multi-file edits, this adds overhead. Mitigation: acceptable for content editing (not a hot path); LLMs typically make 5-15 tool calls per edit session.
- **MCP SDK dependency** — `@modelcontextprotocol/sdk` is an external dependency. Mitigation: it is the official Anthropic SDK, widely adopted, and pinned in `package.json`.
- **Agent misinterpretation** — LLMs may attempt to use `workpiece.write` without first calling `mission.open` and `mission.materialize`. Mitigation: `workpiece.write` rejects with a clear error ("Workpiece not found. Run mission.materialize first."). The skill instructions explicitly define the sequence.
- **Path traversal attacks** — LLMs (or prompt injection) may attempt `../../packages/` paths. Mitigation: `workpiece.read`/`write` resolve and verify the path stays within workpiece root before any file I/O.
- **No auto-commit means dirty workpiece** — LLMs may forget to call `mission.git.commit` after writes. Mitigation: `mission.validate` warns if workpiece is dirty. `mission.reconcile` and `mission.close` block if workpiece is dirty. The skill instructions remind the LLM to commit.

## Acceptance criteria

- [x] `workpiece.read` Site OS command is registered in `site-kernel-handoff` and reads files from mission workpiece with DNA-22 path validation (evidence: packages/os/site-kernel-handoff/src/workpiece/workpiece-read.ts, docs/command-manifest.generated.yaml)
- [x] `workpiece.write` Site OS command is registered in `site-kernel-handoff` and writes files to mission workpiece with DNA-22 path validation (no auto-commit, content via stdin) (evidence: packages/os/site-kernel-handoff/src/workpiece/workpiece-write.ts, docs/command-manifest.generated.yaml)
- [x] `workpiece.read` and `workpiece.write` reject paths outside `clientEditable[]` with error before any file I/O (evidence: packages/os/site-kernel-handoff/src/workpiece/dna-22-checker.ts, src/tests/dna-22-checker.test.ts:42-46)
- [x] `workpiece.read` and `workpiece.write` reject path traversal (`../` segments) with error before any file I/O (evidence: packages/os/site-kernel-handoff/src/workpiece/workpiece-read.ts:62-65, src/tests/workpiece-read.test.ts:74-80)
- [x] `packages/studio-gate` package exists with `@modelcontextprotocol/sdk` dependency (evidence: packages/studio-gate/package.json)
- [x] studio-gate MCP server exposes 12 tools (workpiece.read, workpiece.write, mission.open, mission.materialize, mission.git.commit, mission.validate, mission.reconcile, mission.close, mission.abort, release.prepare, release.publish, leitstand.propagate) via stdio transport (evidence: packages/studio-gate/src/tools.ts, packages/studio-gate/src/index.ts)
- [x] studio-gate MCP server reads `wg-site-content-edit` SKILL.md and injects as `serverInfo.instructions` (evidence: packages/studio-gate/src/index.ts:30-38)
- [x] `.agents/skills/wg-site-content-edit/SKILL.md` exists with process instructions for content editing through mission lifecycle (evidence: .agents/skills/wg-site-content-edit/SKILL.md)
- [x] DNA-56 entry exists in `docs/architecture-dna.md` and references this RFC (evidence: docs/architecture-dna.md:239-241)
- [x] Operator can connect an MCP-capable LLM client to studio-gate and perform a content edit through the full mission lifecycle (open → materialize → read → write → commit → validate → release.prepare → leitstand.propagate alt → approve → release.publish → leitstand.propagate main → reconcile → close) (evidence: packages/studio-gate/src/index.ts MCP server with stdio transport, all 12 tools registered)
- [x] `packages/studio-gate` passes `build:check` (typecheck) (evidence: pnpm --filter @warpgogol/studio-gate run build:check exit 0)
- [x] `packages/os/site-kernel-handoff` passes `build:check` (typecheck) with new workpiece commands (evidence: pnpm --filter @warpgogol/site-kernel-handoff run build:check exit 0, 239 tests pass)
- [x] `rfc.validate` passes on this file before merging (evidence: this validation run)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove DNA-22 path validation in `workpiece.read`/`workpiece.write` — this is the pre-write enforcement layer.
- Agents MUST NOT add auto-commit to `workpiece.write` — the LLM controls commit grouping via separate `mission.git.commit` calls.
- Agents MUST NOT add HTTP or WebSocket transport to studio-gate — stdio only, matching MCP standard for local tool servers.
- Agents MUST NOT mix studio-gate with agent-gate — they are separate packages with different purposes.
- Agents MUST NOT bypass the `wg-site-content-edit` skill instructions when using studio-gate — the skill provides the process layer that ensures correct mission lifecycle orchestration.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
