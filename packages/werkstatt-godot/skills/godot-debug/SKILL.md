---
name: godot-debug
description: Diagnose bugs, crashes, and unexpected behavior in Godot 4.x + C# projects — reproduction, error classification, root cause tracing, minimal fixes.
invocation: user
concerns: code-mutation
dependsOn: []
---

# godot-debug

Diagnose bugs, crashes, exceptions, or unexpected behavior in Godot 4.x + C# projects.

## When to use

When a game crashes, throws an exception, behaves unexpectedly, or produces visual/audio glitches.

## Process

1. **Reproduce.** Establish a reliable reproduction sequence. Run with real commands:
   - `dotnet build ./Game.csproj` — check for compile errors
   - `godot --path . --headless --quit` — check for engine boot errors
   - `godot --path . --headless --script res://Scripts/TestRunner.cs --quit` — for headless test scenarios

2. **Classify the error.**
   - **Compile error**: CS#### — C# compiler error, usually in `Scripts/*.cs`.
   - **Runtime exception**: `System.Exception` or derived — C# runtime error.
   - **Engine error**: `ERROR:` or `WARNING:` in Godot output — scene loading, resource, signal issues.
   - **Crash**: Segfault or hard crash — usually native code, memory, or engine bug.
   - **Visual glitch**: Incorrect rendering — shader, material, or node hierarchy issue.
   - **Logic bug**: Wrong behavior without error — algorithm or state management issue.

3. **Trace to root cause.**
   - Read the full error message and stack trace.
   - Identify the file and line number.
   - Check the scene hierarchy for missing or misconfigured nodes.
   - Check signal connections — missing or duplicate connections.
   - Check resource loading — null references from `Load<T>()` or `GD.Load<T>()`.
   - Check lifecycle order — `_Ready()` vs `_Process()` vs `_Input()` timing.

4. **Fix minimally.**
   - Change the smallest amount of code necessary.
   - Do not refactor while fixing — that's a separate task.
   - Add a comment explaining the fix if non-obvious.
   - Test the fix with the reproduction sequence.

5. **Verify.**
   - `dotnet build ./Game.csproj` — compile check
   - `dotnet test` — unit tests (if any)
   - `godot --path . --headless --quit` — engine boot check
   - Run the original reproduction sequence — confirm the bug is fixed.
   - Run related gameplay — confirm no regression.

## Common Godot + C# pitfalls

- **NullReferenceException from GetNode.** Node path is wrong or node not yet ready. Use `GetNodeOrNull<T>()` or check `!= null`.
- **Signal not firing.** Signal not connected, or connected to wrong method name. Check `Connect()` call and method signature.
- **Script not attached.** `.tscn` references a script path that doesn't exist or class name doesn't match.
- **Resource load returns null.** Path is wrong or resource type mismatch. Use `GD.Load<T>()` with correct type parameter.
- **_Ready order.** Child nodes are ready before parent. Don't access sibling nodes in `_Ready()` — use `CallDeferred()` or signals.
- **_Process vs _PhysicsProcess.** Physics in `_Process()` causes jitter. Use `_PhysicsProcess()` for `move_and_slide`, collision, rigidbody.
- **Forgotten Disconnect.** Dynamically connected signals must be disconnected in `_ExitTree()` or they fire on freed nodes.
- **UID mismatch.** Changed `uid://` in `.tscn` breaks resource references. Regenerate UIDs in the editor, not by hand.
