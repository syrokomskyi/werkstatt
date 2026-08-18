# Code Review: godot-csharp profile enhancements

- **Commit**: `b91d49d9` (6.14.36)
- **Reviewer**: fo-review (automated)
- **Date**: 2026-08-18
- **Diff**: `git diff b91d49d9~1..b91d49d9`

## Mechanical floor

| Check | Result |
| --- | --- |
| `tsc --noEmit` (@warpgogol/forge) | PASS |
| `tsc --noEmit` (@warpgogol/werkstatt-godot) | PASS |
| vitest (@warpgogol/forge, 3 files) | 38/38 PASS |
| vitest (@warpgogol/werkstatt-godot, all) | 53/53 PASS |

## Axis A — Structural correctness

### FINDING-1 (FAIL): export_presets.cfg format mismatch

The scaffolded `export_presets.cfg` uses `[preset.0]` (dot notation — correct Godot 4.x format), but:

- `export-presets-validate.ts:63` checks `!/\[preset_\d+\]/.test(content)` (underscore)
- `parse-export-presets.ts:30` splits on `/\[preset_(\d+)\]/` (underscore)

The scaffolded file will fail GODOT-09 validation with "export_presets.cfg contains no preset sections" because the regex expects `[preset_0]` but the file contains `[preset.0]`.

**Root cause**: Pre-existing bug — parser and validator use underscore separator, but Godot 4.x uses dot separator (`[preset.0]`, `[preset.0.options]`).

**Fix**: Change both regex patterns from `[preset_(\d+)]` to `[preset\.(\d+)]` in:
- `packages/werkstatt-godot/src/checks/export-presets-validate.ts:63`
- `packages/werkstatt-godot/src/utils/parse-export-presets.ts:30`

**Severity**: High — the scaffolded file triggers a false GODOT-09 violation.

### FINDING-2 (NOTE): No tests for export-presets-validate

No test file exists for `export-presets-validate.ts`. The format mismatch (FINDING-1) would have been caught by a basic test. Consider adding tests that cover both Godot 4.x (`[preset.0]`) format.

### All other items: PASS

- **Strict typing**: No `any`, no implicit casts. `existsSync` import added correctly.
- **Minimalism**: `Game.csproj` simplified to `<Project Sdk="Godot.NET.Sdk" />` — properties moved to `Directory.Build.props`. Good MSBuild practice.
- **Dead code**: None introduced.
- **Error handling**: `csproj-validate.ts` reads `Directory.Build.props` with `existsSync` guard and try/catch for read errors. Correct.
- **Fowler code smells**: No smells. Constants are well-named and scoped.

## Axis B — DNA alignment

### FINDING-1 (FAIL): GODOT-09 violation (same as Axis A)

The scaffolded `export_presets.cfg` will fail GODOT-09 ("export_presets.cfg must have valid presets with non-empty relative export paths and known platforms") because the validator cannot parse `[preset.0]` sections.

### All other invariants: PASS

- **GODOT-06**: `csproj-validate.ts` correctly reads `Directory.Build.props` and combines with `Game.csproj`. `Sdk` check remains on `Game.csproj` only. Properties (`TargetFramework`, `EnableDynamicLoading`) checked in combined content. Correct.
- **GODOT-02**: `.gitignore` includes `.godot/`, `bin/`, `obj/`. Unchanged.
- **GODOT-01**: Scene files in `Scenes/`, scripts in `Scripts/`. Unchanged.
- **GODOT-08**: `Main.cs` has `partial class Main : Node2D`, `using Godot;`, class name matches file name. Unchanged.

## Axis C — Ecosystem fit

- **Package boundaries**: `@warpgogol/forge` (profile) and `@warpgogol/werkstatt-godot` (plugin) are correctly separated. Profile defines static file content; plugin defines runtime scaffold hook. No cross-imports. PASS.
- **Plugin contract**: `scaffoldProject` hook creates files via `writeFileIfChanged`. No new hooks added. PASS.
- **AGENTS.md alignment**: `packages/werkstatt-godot/AGENTS.md` lists scaffold files. The new files (`Directory.Build.props`, `global.json`, `Game.sln`, `export_presets.cfg`, `omnisharp.json`, `.vscode/settings.json`) are not listed in AGENTS.md but the file list there is descriptive, not normative. PASS with note.

## Axis D — Forward-only discipline

- **No removals without investigation**: `Game.csproj` properties moved to `Directory.Build.props` — not deleted, just relocated. `dotnet new sln` + `dotnet sln add` replaced by pre-created `Game.sln` — the solution file is still created, just pre-generated instead of runtime-generated. PASS.
- **No legacy adapters**: None added. PASS.

## Axis E — Agent clarity

- **File naming**: All new constants in scaffold-project.ts follow existing naming convention (`UPPER_SNAKE_CASE`). PASS.
- **Placeholder replacement**: `__PROJECT_NAME__` replaced in `Game.sln` via `.replace(/__PROJECT_NAME__/g, projectId)`. Consistent with existing pattern. PASS.
- **Profile readability**: YAML `firstWorkspace.files` entries are well-structured with clear `path` and `content` pairs. PASS.

## Axis F — Pragmatism

- **Over-engineering**: None. Each new file serves a concrete purpose:
  - `global.json` — pins SDK version (prevents version drift)
  - `Game.sln` — pre-created (survives install failures)
  - `export_presets.cfg` — enables export (GODOT-09)
  - `omnisharp.json` — C# formatting consistency
  - `.vscode/settings.json` — IDE file associations
  - `Directory.Build.props` — MSBuild property centralization
- **Speculative generality**: None. PASS.

## Axis G — Test coverage

- **csproj-validate.ts**: No new tests for `Directory.Build.props` reading. The existing tests pass because they don't test the `Directory.Build.props` path. Consider adding a test that verifies properties in `Directory.Build.props` are recognized.
- **export-presets-validate.ts**: No tests exist at all. FINDING-2.
- **scaffold-project.ts**: No tests for new file creation. Existing scaffold tests verify file creation but don't check the new files.

## Summary

| Axis | Result |
| --- | --- |
| A — Structural | **FAIL** (FINDING-1: export_presets.cfg format mismatch) |
| B — DNA | **FAIL** (FINDING-1: GODOT-09 false positive) |
| C — Ecosystem | PASS |
| D — Forward-only | PASS |
| E — Agent clarity | PASS |
| F — Pragmatism | PASS |
| G — Test coverage | **NOTE** (FINDING-2: no export-presets tests) |

## Required fixes

1. **FINDING-1**: Fix `[preset_` → `[preset.` in `export-presets-validate.ts:63` and `parse-export-presets.ts:30`. This is a pre-existing bug exposed by the new scaffolded file.

## Recommended fixes

1. **FINDING-2**: Add unit tests for `export-presets-validate.ts` covering Godot 4.x `[preset.0]` format.
2. Add a test for `csproj-validate.ts` verifying `Directory.Build.props` property merging.
