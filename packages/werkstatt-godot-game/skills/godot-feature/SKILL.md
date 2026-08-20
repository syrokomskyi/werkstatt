---
name: godot-feature
description: Use this skill when implementing a new gameplay feature, entity, or system in a Godot 4.x + C# project (e.g. new enemy, ability, UI screen, item, mechanic). Ensures the scene/script/resource pattern is followed and verification steps run before completion.
invocation: user
category: fo
concerns: content-mutation
dependsOn: []
languagePolicy: ref(PREFERENCES.md)
triggers:
  - "add a feature to the godot game"
  - "implement a new entity"
  - "create a gameplay system"
  - "add a new scene"
  - "implement player mechanics"
  - "add enemy ai"
  - "create a new godot script"
---

# Godot Gameplay Feature Implementation

Before starting, read `PREFERENCES.md` at the repository root. If the file is missing or `aiLanguage` is unset, ask the operator once and create the file using the `my-preferences` skill semantics.

## Forge workflow

When working in a Forge-managed Godot project:

1. **Materialize** — ensure you are working in a mission workpiece via `mission.materialize`.
2. **Implement** — create scenes, scripts, and resources following the steps below.
3. **Validate** — run Forge validators: `godot.scene.validate`, `godot.script.validate`, `godot.scene.reference.validate`, `godot.uid.validate`.
4. **Build** — run the build hook (`dotnet build` + Godot export).
5. **Smoke test** — run `godot.smoke.test` to catch runtime errors headless.
6. **Reconcile** — `mission.reconcile` to sync back to the cache clone.
7. **Close** — `mission.close` when the feature is complete.

## When to use

Trigger this skill whenever the user asks to add, implement, or create a new gameplay feature, entity, system, or UI screen in a Godot + C# project.

## Steps

1. **Understand scope**
   - Identify whether the feature needs: a new scene, a new script, a new Resource (data), or a combination.
   - Check existing similar features in `Scenes/` and `Scripts/` for naming and structural conventions before creating new files.

2. **Follow the three-part pattern** (when applicable)
   - `.tscn` scene: node hierarchy, minimal and named clearly (PascalCase), use unique names (`%Name`) for nodes referenced from code.
   - C# controller script: attach to the scene root, keep game-rule logic in plain C# methods/services where feasible, use `[Export]` only for inspector-configurable fields.
   - `Resource` (`.tres`/custom `Resource` subclass): for tunable data (stats, config, drop tables, etc.) that designers may want to edit without touching code.

3. **Wire dependencies via signals**
   - Prefer C# events/Godot signals for cross-node communication over direct node references or long `NodePath` chains.
   - Disconnect/unsubscribe signals on node cleanup (`_ExitTree` or `QueueFree` path) to avoid leaks.

4. **Respect lifecycle**
   - Initialize node-dependent state in `_Ready()`, not in the constructor.
   - Do not assume sibling/parent nodes are ready before `_Ready()` runs; use `CallDeferred` or signals if ordering matters.

5. **Verify before declaring done**
   - Run `dotnet build ./Game.csproj`.
   - Run `dotnet test ./Tests/Tests.csproj` if tests exist for the area.
   - Run `godot --path . --headless --quit` to catch scene/script import errors.
   - Report explicitly what was verified automatically vs. what needs manual testing in the editor (e.g., visual layout, animation timing, input feel).

6. **Diff hygiene**
   - Keep `.tscn` diffs minimal; avoid reordering unrelated nodes/properties.
   - Do not touch `.godot/`, `bin/`, `obj/`, or imported asset metadata.

## Anti-patterns to avoid

- Putting business logic directly in `_Process()` without separation.
- Renaming `[Export]` fields or node names without checking scene/resource references elsewhere in the project.
- Creating a new Resource type when an existing one covers the need.
- Blocking the main thread with I/O or heavy computation.
