# @gogol/studio-gate

RFC-0555: stdio MCP server for site owner content editing with mission lifecycle.

## What lives here

| Module | Exports |
| --- | --- |
| `src/index.ts` | MCP server entrypoint — stdio transport, WERKSTATT_ROOT env var, serverInfo.instructions from wg-site-content-edit SKILL.md |
| `src/tools.ts` | 12 tool definitions (workpiece.read, workpiece.write, mission.open, mission.materialize, mission.git.commit, mission.validate, mission.reconcile, mission.close, mission.abort, release.prepare, release.publish, leitstand.propagate) |
| `src/executor.ts` | Command executor via child_process — passes content via stdin for workpiece.write |

## Boundaries

- **stdio only** — no HTTP transport. `agent-gate` handles HTTP/JSON-RPC for public-facing agent interactions.
- **No direct filesystem access** — all file operations go through `workpiece.read` and `workpiece.write` Site OS commands, which enforce DNA-22.
- **Proxies to Site OS commands** — the MCP server is a thin wrapper that calls `pnpm exec site-kernel run <command>` via child_process.
- **WERKSTATT_ROOT env var** — resolves the workspace root for command execution. Falls back to `process.cwd()` if unset.

## Transport contract

- MCP stdio transport (JSON-RPC over stdin/stdout)
- `serverInfo.instructions` populated from `packages/wgogol-skills/skills/wg-site-content-edit/SKILL.md`
- 12 tools exposed via `tools/list` and `tools/call`

## Validation

```sh
pnpm --filter @gogol/studio-gate build:check
pnpm --filter @gogol/studio-gate test
```
