---
name: wg-site-content-edit
description: Edit site content through the Studio Gate MCP server using mission lifecycle. Use when the user asks to edit, update, or modify site content files.
invocation: mcp
category: wg
concerns: content-mutation
dependsOn: []
knowledge: []
languagePolicy: ref(PREFERENCES.md)
---

# wg-site-content-edit

This skill provides process instructions for LLMs editing site content through the Studio Gate MCP server (RFC-0555). The MCP server injects this document as `serverInfo.instructions`.

## Process

### 1. Identify the Sternsystem and mission

Determine the Sternsystem id from the operator's request. If no open mission exists for this Sternsystem, open one:

1. Call `mission.open` with `system` and `brief` arguments.
2. Record the returned `missionId`.

If an open mission already exists, reuse it. Check `systems/registry.yaml` for `currentMission`.

### 2. Materialize the workpiece

If the mission was just opened, call `mission.materialize` to populate the workpiece from the pinned Sternsystem bundle. This creates a fresh git repo in the workpiece.

### 3. Read existing content (optional)

Before editing, call `workpiece.read` to inspect the current content:

- `mission`: the mission id
- `path`: relative path within the workpiece (e.g. `src/content/pages/home.md`)

The path must be within the `clientEditable[]` surface declared in `system.md` (DNA-22). If the path is outside the client-editable surface, the command will reject it.

### 4. Write content

Call `workpiece.write` to write the file:

- `mission`: the mission id
- `path`: relative path within the workpiece
- `content`: the full file content (passed via stdin to the command)

**Important:** `workpiece.write` does NOT auto-commit. You must call `mission.git.commit` separately to commit the changes. This allows grouping multiple writes into a single commit.

### 5. Commit changes

After all edits are complete, call `mission.git.commit`:

- `mission`: the mission id
- `message`: a descriptive commit message

### 6. Validate

Call `mission.validate` to run build checks on the workpiece. If validation fails, fix the errors and re-commit.

### 7. Reconcile

Call `mission.reconcile` to transfer the committed changes to the Sternsystem repo.

### 8. Close or abort

- If everything succeeded: call `mission.close` to close the mission.
- If something went wrong and the operator wants to discard: call `mission.abort` to abort the mission (creates a git bundle evidence trail before state transition).

## DNA-22 constraints

The `clientEditable[]` array in `system.md` declares which content paths the client may edit without engineering involvement. Typical entries:

- `pages` — page content files
- `prose` — prose content files
- `business` — business information files

Paths outside this surface (e.g. `src/components/`, `src/sections/`, `packages/`) are rejected by `workpiece.read` and `workpiece.write`.

## Error handling

- **"Path is outside client-editable surface (DNA-22)"** — the requested path is not in `clientEditable[]`. Ask the operator if the path should be added to `system.md` (requires engineering review).
- **"Mission is not open"** — the mission was closed or aborted. Open a new mission.
- **"Workpiece not found"** — run `mission.materialize` first.
- **"Path traversal detected"** — the path contains `..` segments that escape the workpiece root. Use relative paths only.
