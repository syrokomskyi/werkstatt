---
name: godot-scene-review
description: Review Godot scene and resource changes — .tscn, .tres, project.godot, .csproj serialization and compatibility risks.
invocation: user
concerns: read-only
dependsOn: []
---

# godot-scene-review

Review diffs and PRs touching `.tscn`, `.tres`, `project.godot`, or `.csproj` files in Godot 4.x + C# projects.

## When to use

When reviewing a PR that modifies scene files, resource files, project configuration, or C# project configuration.

## Checklist

### Scene files (.tscn)

- **Node hierarchy changes.** Check for added/removed nodes. Verify script attachments (`ExtResource`) still resolve.
- **UID stability.** `uid://` references must not change for existing resources. New UIDs are fine; changed UIDs break references.
- **Transform changes.** Position/rotation/scale changes should be intentional. Watch for accidental `Transform2D` or `Transform3D` resets.
- **Sub-scene inheritance.** If a scene inherits from another, check that inherited changes don't break child overrides.
- **Load steps.** `load_steps` count must match actual `ext_resource` + `sub_resource` entries. Mismatch causes load warnings.

### Resource files (.tres)

- **Resource type.** Verify `[ext_resource]` type matches the actual resource class.
- **Property changes.** Check for removed properties — they may cause load failures in scenes referencing this resource.
- **Script references.** If a `.tres` references a `.cs` script, verify the script path and class name match.

### project.godot

- **Autoloads.** Added/removed autoloads affect global class availability. Confirm with operator — GODOT-04.
- **Input map.** Added/removed/changed input actions affect gameplay. Confirm with operator — GODOT-04.
- **Physics layers.** Layer name changes break collision masks. Confirm with operator — GODOT-04.
- **Rendering settings.** Changes to renderer (Forward+/Mobile/Compatibility) affect platform compatibility.

### .csproj

- **TargetFramework.** Must match Godot .NET SDK requirements (`net8.0` for Godot 4.x).
- **Nullable.** `<Nullable>enable</Nullable>` should be consistent across the project.
- **Package references.** New `<PackageReference>` entries must be compatible with Godot's .NET runtime.

## Verification

After review, run:

- `dotnet build ./Game.csproj` — compile check
- `godot --path . --headless --quit` — engine boot check

## Findings format

- **Blocking**: UID changes, broken references, missing scripts, load step mismatch.
- **Needs confirmation**: Autoload changes, input map changes, physics layer changes, rendering setting changes.
- **Minor notes**: Style, naming, optional improvements.
