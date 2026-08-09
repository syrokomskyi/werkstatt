---
rfcId: RFC-0606
auditId: AUDIT-RFC-0606-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0606

## Verdict: Needs revision

The RFC correctly identifies that `"systems/"` is missing from `WORKSPACE_ABSOLUTE_PREFIXES`, but its core claim — that adding the prefix will fix "false-positive `GEN-FILES-01` errors" for bordbuch files — is incorrect. The bordbuch paths contain `{system}`, which triggers the glob branch in `runGeneratedFilesValidate`. The glob branch does not verify file existence for non-`*` patterns; `expandGlob` returns the literal unexpanded path, `files.length` is 1, and no error is reported. The fix changes the base path but does not change the outcome — the validator silently passes regardless. The Risks section's claim that "`expandGlob` handles `{` patterns" is factually wrong.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0606 --json` exits 0 with zero violations.

## Axis A — Structural completeness

- **Line number discrepancies**: The RFC cites `WORKSPACE_ABSOLUTE_PREFIXES` at "line 35" (correct), `isWorkspaceAbsolute` at "line 37" (actual: line 43), `resolveEntryPath` at "line 42" (actual: line 48), `expandGlob` `{` handling at "line 66" (actual: `hasGlobPattern` is at line 71), and the bordbuch ownership map entry at "line 386" (correct). The `isWorkspaceAbsolute` and `resolveEntryPath` line numbers are off by 6, suggesting the RFC was written from a slightly different version or from memory. These should be corrected or removed — line numbers are brittle references.
- **Decision section**: Present tense, single decision — good.
- **Acceptance criteria**: Criterion 2 ("`generated.files.validate --site warpgogol-com` finds `systems/warpgogol-com/public/.well-known/bordbuch.json`") is not achievable with the proposed fix alone (see Axis G). Criterion 3 ("No false-positive `GEN-FILES-01` errors for `systems/{system}/` paths") is already satisfied — the glob branch does not produce errors for these paths (see Axis G).

## Axis B — DNA alignment

- `satisfies[]` is empty. The RFC does not establish or extend any DNA invariant. This is acceptable for a command-kind bug fix.
- No DNA conflicts identified.

## Axis C — Ecosystem fit

- **Package boundaries**: Correct — the fix targets `packages/os/site-kernel-checks/src/generated-files-validate.ts`, which owns the validator.
- **Command lifecycle**: `commands.changed: [generated.files.validate]` is correct — this is an existing registered command.
- **Related RFCs**: `related: [RFC-0604, RFC-0375]` — appropriate. RFC-0604 depends on this fix; RFC-0375 is the establishing RFC for `generated.files.validate`.
- **AGENTS.md updates**: Not needed for this change — it is an internal path resolution fix, not a governance change.

## Axis D — Forward-only compliance

No issues. The fix is a one-line addition to an array — no compatibility shim, no dual-path, no backward compatibility layer.

## Axis E — Agent-facing policy

- **Status gate**: The RFC has `status: draft` and does not contain self-authorizing language. Good.
- **Implementation notes**: Reference the correct governance rules (RFC-0224 transition, RFC-0334 supersede escalation).

## Axis F — Pragmatism

- **Minimal change**: Adding `"systems/"` to `WORKSPACE_ABSOLUTE_PREFIXES` is a minimal, correct addition. The prefix is needed for `resolveEntryPath` to correctly handle `systems/{system}/` paths in the non-glob branch.
- **Scope discipline**: `packagesImpacted` lists only `@warpgogol/site-kernel-checks` — correct. `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

**Critical finding — the fix does not achieve the stated goal.**

The bordbuch entries in `GENERATOR_OWNERSHIP_MAP` use the path pattern `systems/{system}/public/.well-known/bordbuch.json` (line 386 of `generator-ownership.ts`). This path contains `{system}`, which causes `hasGlobPattern()` (line 71) to return `true`. When `hasGlobPattern` is true, `runGeneratedFilesValidate` enters the glob branch (line 182), not the file-existence branch (line 206).

In the glob branch, `expandGlob` is called. But `expandGlob`'s internal `hasWildcards` helper (line 85) only checks for `*`, not `{`:

```ts
const hasWildcards = (p: string): boolean => p.includes("*");
```

Since `systems/{system}/public/.well-known/bordbuch.json` contains no `*`, `hasWildcards` returns `false`, and `expandGlob` returns `[join(basePath, posixPattern)]` — the literal path with `{system}` unexpanded (line 87-89). No filesystem scan is performed. `files.length` is 1, so the `files.length === 0` check (line 192) does not trigger. No error is reported.

This means:

1. **Before the fix**: `isWorkspaceAbsolute` → false → basePath is `siteDirectory` or `apps/<app>/` → `expandGlob` returns literal path → `files.length` = 1 → no error. The validator silently passes.
2. **After the fix**: `isWorkspaceAbsolute` → true → basePath is `workspaceRoot` → `expandGlob` returns literal path → `files.length` = 1 → no error. The validator silently passes.

The outcome is identical. The RFC's claim that the fix eliminates "false-positive `GEN-FILES-01` errors" is incorrect — there are no false-positive errors to eliminate because the glob branch never reports them. The real problem is that `{system}` is never expanded to actual system IDs, so the validator cannot check file existence at all.

**The Risks section is factually wrong.** It states: "The existing `expandGlob` function handles `{` patterns (line 66: `path.includes("{")`)." In reality, `hasGlobPattern` (line 71) detects `{`, but `expandGlob` (line 79) does not expand `{}` brace patterns. `expandGlob` only handles `*` and `**` — its `hasWildcards` helper explicitly checks only `*`.

**Pre-existing issue**: The same problem affects `packages/ui/src/sections/{id}/{id}.types.generated.ts` and `packages/ui/src/components/{id}/{id}.types.generated.ts` entries (lines 298, 302). These use `{id}` and are workspace-absolute (prefix `packages/`), but `{id}` is never expanded. The validator silently passes for these too.

**What the RFC should do**:

1. Keep the `"systems/"` addition to `WORKSPACE_ABSOLUTE_PREFIXES` — it is necessary for `resolveEntryPath` correctness in the non-glob branch.
2. Additionally fix `expandGlob` to handle `{placeholder}` brace expansion — either by resolving `{system}` to the actual system ID from the `--site` flag, or by expanding `{system}` to all directories under `systems/`.
3. Or alternatively: make the glob branch verify file existence for returned paths when no `*` wildcards are present (treat non-wildcard glob results as candidates that need existence checks).
4. Correct the Risks section to accurately describe `expandGlob`'s limitations.
5. Update acceptance criteria to reflect the actual required fix.

## Questions for the author

1. How does `generated.files.validate` currently report a `GEN-FILES-01` error for bordbuch files if the glob branch (triggered by `{system}`) never checks file existence? Can you reproduce the false-positive error described in the Problem section?
2. Should `expandGlob` be extended to expand `{system}` to actual system IDs (e.g., by reading `systems/registry.yaml` or by substituting the `--site` flag value), or should the glob branch verify existence for non-`*` patterns?
3. The same `{placeholder}` issue affects `packages/ui/src/sections/{id}/{id}.types.generated.ts` entries — should this RFC fix brace expansion globally, or is a separate RFC needed for the `{id}` case?
