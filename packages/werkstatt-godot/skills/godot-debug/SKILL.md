---
name: godot-debug
description: Use this skill when diagnosing a bug, crash, exception, or unexpected behavior in a Godot 4.x + C# project (editor errors, runtime exceptions, null reference on nodes, signal not firing, physics/rendering glitches).
invocation: user
category: fo
concerns: read-only
dependsOn: []
languagePolicy: ref(PREFERENCES.md)
triggers:
  - "debug godot crash"
  - "fix godot exception"
  - "diagnose godot bug"
  - "godot game not working"
  - "godot performance issue"
  - "godot null reference"
  - "scene loading error"
---

# Godot + C# Debugging

Before starting, read `PREFERENCES.md` at the repository root. If the file is missing or `aiLanguage` is unset, ask the operator once and create the file using the `my-preferences` skill semantics.

## Forge diagnostics

When working in a Forge-managed Godot project:

- Run `godot.smoke.test` for headless smoke test (catches startup crashes).
- Run Forge validators: `godot.scene.validate`, `godot.script.validate`, `godot.scene.reference.validate`, `godot.uid.validate`.
- Run `godot.context.generate` for structured project summary (scene tree, autoloads, input map) as debugging context.

## When to use

Trigger this skill when asked to fix a bug, investigate an error/exception, or explain unexpected runtime/editor behavior in a Godot + C# project.

## Process

1. **Reproduce with real commands** — do not guess. Run:

   ```bash
   dotnet build ./Game.csproj
   godot --path . --headless --quit
   ```

   Capture actual error output/stack trace before proposing a fix.

2. **Classify the error**
   - Build-time (C# compile error): check `.csproj` references, using directives, nullable annotations, LangVersion.
   - Import-time (Godot editor/headless import errors): check `.import` metadata, resource paths, `uid://` references.
   - Runtime null reference on a node: usually one of —
     - Node accessed before `_Ready()`.
     - `NodePath`/unique name (`%Name`) mismatch after a scene edit.
     - Node freed (`QueueFree`) but reference still held elsewhere.
   - Signal not firing: check the signal is connected (`Connect`) with matching signature, and that the emitting node is actually in the tree at the time of connection.
   - Resource-related bug (unexpected shared state): check if a `Resource` instance is shared across multiple nodes without `Duplicate()`.

3. **Trace to root cause, not the symptom**
   - Prefer fixing lifecycle/ordering issues over adding defensive null checks that mask the real problem.
   - If the bug stems from a renamed/removed `[Export]` field or node, check all `.tscn`/`.tres` files referencing it.

4. **Fix minimally**
   - Smallest diff that addresses the root cause.
   - Do not refactor unrelated code in the same change.

5. **Verify the fix**
   - Re-run `dotnet build`, relevant `dotnet test`, and `godot --headless --quit`.
   - If the bug only manifests in the editor/runtime visually, state clearly that manual verification in the Godot editor is still required.

## Common Godot + C# pitfalls

- Using a node in a constructor instead of `_Ready()`.
- Holding a C# reference to a freed Godot node (use `IsInstanceValid()`).
- Forgetting `CallDeferred` when modifying the scene tree from a signal callback during iteration.
- Mismatched signal signatures between `[Signal]` declaration and handler.
- Physics logic in `_Process` instead of `_PhysicsProcess` causing frame-rate-dependent behavior.
