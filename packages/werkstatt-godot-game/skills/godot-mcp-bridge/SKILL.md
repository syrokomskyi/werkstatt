---
name: godot-mcp-bridge
description: Playbook for working with Godot MCP (Model Context Protocol) plugins that give AI agents direct editor and runtime control.
invocation: When the operator asks to connect an AI agent to a live Godot editor, use MCP tools, or integrate a Godot MCP plugin.
category: workflow
concerns:
  - mcp
  - editor-integration
  - agent-effectiveness
dependsOn: []
languagePolicy: Respond in the operator's language.
triggers:
  - "MCP"
  - "model context protocol"
  - "godot editor"
  - "live editor"
  - "agent bridge"
  - "godot-mcp"
  - "playtest with screenshots"
---

# Godot MCP Bridge — Playbook

## When to use

Use this skill when the operator wants to connect an AI agent (Windsurf, Cursor, Claude Code, Devin) to a **live Godot Editor** via MCP. This gives the agent "hands and eyes" inside the editor — creating nodes, editing properties, connecting signals, running playtests, and capturing screenshots — without fragile manual `.tscn` editing.

## Prerequisites

1. **Godot Editor** must be running with the MCP plugin installed and enabled.
2. **MCP server** must be reachable (WebSocket or HTTP, typically `localhost:6030` or similar).
3. **AI client** (Windsurf/Cursor/Claude Code) must have the MCP server configured in its settings.

## Architecture

```
AI client (Windsurf/Cursor/Claude Code)
  <--MCP--> MCP server (WebSocket/HTTP)
  <--plugin--> Godot Editor (running instance)
```

The MCP server exposes tools like:
- `create_node`, `delete_node`, `move_node`
- `set_property`, `get_property`
- `connect_signal`
- `save_scene`, `open_scene`
- `run_playtest`, `stop_playtest`
- `capture_screenshot`
- `get_class_db` (introspect available Godot types)

## Workflow

### 1. Verify MCP connectivity

Before starting work, verify the MCP server is reachable and the editor is running:

- Ask the operator to confirm Godot Editor is open with the project loaded.
- Check if the MCP plugin is enabled in `project.godot` `[editor_plugins]`.
- If the MCP plugin is not installed, guide the operator to install it from the Godot Asset Library.

### 2. Prefer MCP tools over file editing

For scene operations (`.tscn`, `.tres`), **always prefer MCP tools** over manual file editing:

- **Create nodes**: Use `create_node` instead of writing `.tscn` text.
- **Set properties**: Use `set_property` instead of editing the property block.
- **Connect signals**: Use `connect_signal` instead of editing the signal connection block.
- **Save scenes**: Use `save_scene` to ensure the editor writes the file with correct UIDs.

Manual `.tscn` editing is fragile because of:
- UID generation (`uid://` references must be unique and valid).
- Sub-resource IDs (sequential integers that must not collide).
- Signal connection blocks (complex syntax that is easy to break).

### 3. Use MCP for playtesting

When the operator asks to test gameplay:

1. Use `run_playtest` to launch the game in the editor's play mode.
2. Use `capture_screenshot` to get visual feedback.
3. Use `stop_playtest` to stop the game.
4. Analyze the screenshot to verify the game state matches expectations.

### 4. Fallback: file-based mode

If the MCP server is not available (editor closed, plugin not installed), fall back to file-based editing:

- Use `godot.context.generate` to get project structure.
- Edit `.tscn`/`.tres` files carefully, preserving UIDs and sub-resource IDs.
- Run `godot.smoke.test` to verify the project loads without errors.
- Run `godot.playtest` for headless gameplay testing.

### 5. Forge integration

Within a Forge mission lifecycle:

1. **`mission.materialize`** — set up the workpiece.
2. **`godot.context.generate`** — get full project context for the agent.
3. **Implement changes** — prefer MCP tools, fall back to file editing.
4. **`godot.smoke.test`** — verify no startup errors.
5. **`godot.playtest`** — verify no gameplay runtime errors.
6. **`godot.screenshot`** — capture visual evidence (if Xvfb available).
7. **`mission.validate`** — run all 12 validators (GODOT-01..12).
8. **`mission.reconcile`** — sync to cache clone.
9. **`mission.close`** — finalize and deploy.

## Anti-patterns

- **Do NOT** manually edit `.tscn` files when the MCP server is available — use `create_node`/`set_property` instead.
- **Do NOT** ignore MCP connectivity issues — if the server is down, switch to file-based mode explicitly and inform the operator.
- **Do NOT** assume screenshots work in pure headless mode — they require Xvfb or a real display.
- **Do NOT** forget to `save_scene` after MCP edits — unsaved changes are lost when the editor closes.
- **Do NOT** mix MCP edits with concurrent file edits — the editor may overwrite file changes on save.

## Forge validators reference

| Validator | What it checks | MCP relevance |
| --- | --- | --- |
| `godot.uid.validate` (GODOT-10) | UID uniqueness | MCP auto-generates valid UIDs |
| `godot.scene.reference.validate` (GODOT-05) | res:// references exist | MCP creates valid references |
| `godot.addon.validate` (GODOT-12) | Addon structure and NuGet deps | Validates MCP plugin itself |
| `godot.script.validate` (GODOT-08) | C# script conventions | MCP doesn't affect scripts |

## Common MCP plugins

| Plugin | Protocol | C# support | Notes |
| --- | --- | --- | --- |
| Godot-MCP | WebSocket | Yes | Most popular, hybrid mode (live editor + file fallback) |
| Godot MCP Native | WebSocket | Yes | Native C# implementation, requires NuGet deps in .csproj |
| Godot Agent Loop | HTTP | Yes | Includes playtest loop with deterministic input |
| Open Godot MCP | WebSocket | Partial | Open-source, extensible tool registry |

When using a C# MCP plugin, ensure its NuGet dependencies are declared in `Game.csproj` — `godot.addon.validate` (GODOT-12) will catch missing packages.
