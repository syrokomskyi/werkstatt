---
name: godot-feature
description: Implement new gameplay features in Godot 4.x + C# projects — scene/script/resource pattern, signal wiring, lifecycle management, verification.
invocation: user
concerns: code-mutation
dependsOn: []
---

# godot-feature

Implement new gameplay features, entities, or systems in Godot 4.x + C# projects.

## When to use

When adding a new gameplay element: player ability, enemy type, UI panel, item, mechanic, or system that requires scene, script, and resource coordination.

## Process

1. **Understand scope.** Read the feature spec or request. Identify which scenes, scripts, and resources are affected. Check for existing similar features to follow established patterns.

2. **Scene first.** Create or modify `.tscn` files in `Scenes/`. Define node hierarchy, attach scripts via `ExtResource`, expose editable properties. Use `uid://` references for stable resource paths.

3. **Script second.** Create or modify `.cs` files in `Scripts/`. Use `partial class` matching the node name. Declare `[Export]` properties for inspector-editable fields. Override `_Ready()`, `_Process()`, `_PhysicsProcess()`, `_Input()` as needed.

4. **Resources third.** Create or modify `.tres` files in `Resources/` for data-driven configuration. Use `Resource` subclasses with `[GlobalClass]` for custom resource types.

5. **Wire signals.** Connect signals via `Connect()` in `_Ready()` or via the scene editor. Always disconnect in `_ExitTree()` if connecting dynamically. Use `[Signal]` delegate for custom signals.

6. **Verify.** Run:
   - `dotnet build ./Game.csproj` — compile check
   - `dotnet test` — unit tests (if any)
   - `godot --path . --headless --quit` — engine boot check
   - `godot --path . --editor --quit` — editor import check (optional)

## Anti-patterns

- **Do not** hardcode node paths — use `GetNode<T>()` with relative paths or `[Export] NodePath`.
- **Do not** put logic in `_Process()` that belongs in `_PhysicsProcess()` (physics) or signals (event-driven).
- **Do not** create `.tscn` files outside `Scenes/` — GODOT-01 violation.
- **Do not** create `.cs` files outside `Scripts/` — GODOT-01 violation.
- **Do not** commit `.godot/` directory — GODOT-02 violation.
- **Do not** hardcode API keys or secrets in C# source — GODOT-03 violation.
- **Do not** modify `project.godot` autoloads or input map without explicit confirmation — GODOT-04 warning.

## Diff hygiene

- Keep scene changes minimal — avoid reordering unrelated nodes.
- Keep script changes focused — one feature per PR.
- Keep resource changes explicit — new `.tres` files must be referenced by a scene or script.
