---
name: godot-scene-review
description: Use this skill when reviewing a pull request, diff, or set of changes in a Godot 4.x + C# project, especially changes touching .tscn, .tres, project.godot, or .csproj files. Ensures serialization and compatibility risks are caught.
invocation: user
category: fo
concerns: read-only
dependsOn: []
languagePolicy: ref(PREFERENCES.md)
triggers:
  - "review godot scene changes"
  - "review .tscn diff"
  - "review .tres changes"
  - "review project.godot changes"
  - "review godot pr"
  - "check scene integrity"
---

# Godot Scene & Resource Change Review

Before starting, read `PREFERENCES.md` at the repository root. If the file is missing or `aiLanguage` is unset, ask the operator once and create the file using the `my-preferences` skill semantics.

## Forge validators

When working in a Forge-managed Godot project, run these validators before manual review:

- `godot.scene.validate` — scene/script directory structure (GODOT-01)
- `godot.scene.reference.validate` — res:// reference integrity (GODOT-05)
- `godot.uid.validate` — UID uniqueness (GODOT-10)
- `godot.script.validate` — C# script conventions (GODOT-08)
- `godot.resource.validate` — .tres location and references (GODOT-07)
- `godot.csproj.validate` — Game.csproj settings (GODOT-06)
- `godot.export.presets.validate` — export presets config (GODOT-09)
- `godot.nuget.validate` — NuGet packages (GODOT-11)
- `godot.project.config.validate` — project.godot sensitive changes (GODOT-04, non-blocking)

## When to use

Trigger this skill when asked to review, audit, or check a diff/PR in a Godot + C# repository, or before merging changes that touch scene/resource files.

## Review checklist

### `.tscn` / `.tres` files

- Confirm the diff is minimal and localized — large unexplained rewrites of a scene file are a red flag (often caused by opening/resaving in a different editor version or config).
- Check for renamed or removed nodes referenced by `NodePath` elsewhere in code or other scenes/signals — these break silently at runtime.
- Check for changed `[Export]` field names/types on scripts used by this scene — renamed exported fields can silently drop serialized values.
- Verify unique names (`%Name`) are preserved if code depends on them.
- Confirm resource `uid://` / `path` references still resolve.

### `project.godot`

- Flag any change to input map, autoloads, physics layers, or rendering settings — these are project-wide and need explicit confirmation from the user/maintainer, not silent acceptance.

### `.csproj` / `Directory.Build.props`

- Flag new NuGet package references — confirm they're intended and licensed appropriately.
- Check target framework / LangVersion changes for compatibility.

### C# scripts

- Confirm `[Export]`, `[GlobalClass]`, `[Tool]`, and signal declarations are unchanged unless intentionally modified.
- Check for signal subscriptions without corresponding unsubscription (potential leak on node removal).
- Check for main-thread blocking calls (synchronous I/O, heavy loops) inside `_Process`/`_PhysicsProcess`.
- Verify shared `Resource` instances are duplicated (`Duplicate()`) before per-instance mutation, where relevant.

### Save-game / persistent data

- Any change to a class or Resource used for save serialization must be flagged explicitly, with a note on backward compatibility (e.g., versioning, migration, or default values for new fields).

## Output format

Summarize findings as:

- **Blocking issues** — must be fixed before merge (breaks build, breaks serialization, breaks save compatibility).
- **Needs confirmation** — project-wide or ambiguous changes requiring maintainer sign-off.
- **Minor notes** — style/convention deviations, non-blocking.

Always run `dotnet build` and `godot --headless --quit` as part of the review when possible, and report actual results rather than assumptions.
