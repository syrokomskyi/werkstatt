---
rfcId: RFC-0556
auditId: AUDIT-RFC-0556-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0556

## Verdict: Needs revision

The core architectural decision (inline + dependency inversion) is sound and consistent with the established `writeFileAtomic`/`buildGeneratedHeader` pattern. However, the RFC underestimates the code volume by ~70%, misses three API-surface mismatches between `KernelRuntimeContext` and `ForgeRuntimeContext`, and omits `packages/AGENTS.md` from the update scope. These are fixable in enhance.

## Mechanical validation (rfc.validate)

**Pass** with 1 warning:
- V-19 (warning): `RFC-0556.amends` includes `RFC-0374`, but `RFC-0374.amendedBy` does not include `RFC-0556`. Expected — the `amendedBy` entry will be added during enhance/implementation.

## Axis A — Structural completeness

**Findings:**

1. **TypeScript contracts incomplete — `resolveCompassScanRoot` signature mismatch.** The RFC proposes `resolveCompassScanRoot(context: ForgeRuntimeContext): string` (line 171), but the actual implementation at `@/packages/os/site-kernel/src/resolve-compass-scan-root.ts:33` takes `(input: KernelCommandInput, context: KernelRuntimeContext)` and accesses `context.site` and `context.siteExplicit` — fields that do not exist on `ForgeRuntimeContext`. The RFC's type signature drops the `input` parameter entirely and doesn't address how site-scoped scanning works in autonomous mode (where there is no `site` concept).

2. **`getRevisionByPath` signature mismatch.** The RFC proposes `getRevisionByPath(filePath: string): number` (line 174), but the actual implementation at `@/packages/os/site-kernel-integrity/src/compass-audit-helpers.ts:26` takes `(cwd: string, repoPath: string)` and returns `Promise<RevisionByPathResult>` (an object with `revision`, `entityId`, `contentHash`), not a bare `number`. The RFC's signature is synchronous and returns a number — both wrong.

3. **`writeFileIfChanged` return type omitted.** The RFC proposes `writeFileIfChanged(path: string, content: string): Promise<void>` (line 166), but the actual implementation at `@/packages/os/site-kernel/src/fs-idempotent.ts:28` returns `Promise<"written" | "unchanged">`. The return type is used by callers to log whether a write occurred.

## Axis B — DNA alignment

**No issues.**

- DNA-42: The RFC body (line 129) explains how `compass.validate` and `compass.summary.trim` enforce it. ✓
- DNA-43: The RFC body (line 130) explains how `compass.audit.*` enforces it with git-history-only fallback. ✓
- DNA-51: The RFC body (line 131) explains how `werkstatt.lock.*` and `werkstatt.operation.validate` enforce it. ✓
- No conflicts with existing DNA invariants. The RFC amends RFC-0374 (which established the "graceful skip" pattern) — this is the correct mechanism for changing an existing contract.

## Axis C — Ecosystem fit

**Findings:**

1. **Missing `packages/AGENTS.md` update.** The file system responsibilities table (line 199) lists `packages/forge/AGENTS.md` but not `packages/AGENTS.md`. The `packages/AGENTS.md` ownership table describes forge as "`src/` is portable (no kernel imports); `os/` is kernel-dependent" — after this RFC, `os/compass/` and `os/werkstatt/` are no longer kernel-dependent. This needs updating.

2. **`site-kernel` in `packagesImpacted` but absent from file system responsibilities.** `packagesImpacted` (line 64-68) lists `site-kernel`, but the file system responsibilities table has no `site-kernel` entries. Either `site-kernel` is impacted (and the table should list `packages/os/site-kernel/src/compass-inventory.ts` and `resolve-compass-scan-root.ts` as "unchanged, still exported for backward compatibility") or it's not impacted (and should be removed from `packagesImpacted`). The `createCompassInventoryEntries` and `resolveCompassScanRoot` functions currently live in `site-kernel` and are re-exported by `site-kernel-checks` — after inlining into forge, `site-kernel` itself doesn't change, but the dependency direction does.

3. **Root `AGENTS.md` import rule update.** Root `AGENTS.md` says "os/ modules MAY dynamically import @warpgogol/* packages" (in the forge section). After this RFC, `os/compass/` and `os/werkstatt/` no longer need this exception. The RFC should mention updating the root `AGENTS.md` forge import rules section, or explicitly state that the rule remains for other `os/` modules (spec, adr, etc.).

## Axis D — Forward-only compliance

**No issues.**

- No compatibility shim or dual-path. The try/catch skip pattern is eliminated entirely. ✓
- The RFC amends RFC-0374 directly — changes the contract, not adds a parallel interpretation. ✓
- Legacy code paths (try/catch, dynamic `@warpgogol/*` imports) are deleted, not maintained behind a flag. ✓

## Axis E — Agent-facing policy

**No issues.**

- Status gate: The RFC is `draft` and does not contain self-authorizing language. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." ✓
- Implementation notes reference correct governance rules: RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation), RFC-0330 (verification evidence). ✓
- Anti-fabrication: Not applicable — no content authoring. ✓
- Storage policy: Not applicable. ✓

## Axis F — Pragmatism

**Findings:**

1. **Code volume underestimate.** The Risks section (line 238) says "Code duplication (~1300 lines)." The actual code to inline is approximately:
   - `compass-inventory.ts`: 522 lines
   - `compass.ts` (handlers): ~293 lines
   - `compass-audit.ts`: 382 lines
   - `compass-change-summary.ts`: 286 lines
   - `resolve-compass-scan-root.ts`: 73 lines
   - `fs-idempotent.ts`: 42 lines
   - `compass-audit-helpers.ts`: 67 lines
   - `git.ts` (`getFileRevisionFromHistory`): ~25 lines
   - `werkstatt-lock-status.ts`: 71 lines
   - `werkstatt-lock-recover.ts`: 174 lines
   - `lock.ts`: 145 lines
   - `werkstatt-operation-validate.ts`: 105 lines
   - `werkstatt.ts` (schema from ontology): ~50 lines

   **Total: ~2,235 lines** — ~70% more than the RFC claims. The "mitigated by dependency inversion" argument is correct (kernel-packages delegate to forge, so one implementation), but the initial inlining volume is larger than stated.

## Axis G — Blind spots

**Findings:**

1. **`context.io.readFile` API mismatch.** `werkstatt-operation-validate.ts` (line 69) uses `context.io.readFile(filePath)` — the `WorkspaceIO` abstraction from `KernelRuntimeContext`. `ForgeRuntimeContext` has no `io` field. The inlined implementation must use `node:fs/promises` `readFile` directly. The RFC doesn't mention this API mismatch.

2. **`context.site` / `context.siteExplicit` dependency.** `resolveCompassScanRoot` accesses `context.site` and `context.siteExplicit` — neither exists on `ForgeRuntimeContext`. In autonomous mode (external project), there is no `site` concept; the scan root is always the workspace root. The RFC needs to specify how `resolveCompassScanRoot` behaves in autonomous mode: either always return `workspaceRoot`, or accept a simplified context without site fields.

3. **`getRevisionByPath` return value discrepancy.** The RFC says "returns 0 when git is unavailable" (line 249, line 207). The existing implementation at `@/packages/os/site-kernel-integrity/src/git.ts:86-93` returns `1` (not `0`) when git fails or the file has no history. The RFC should either match the existing behavior (return `1`) or explicitly explain why the inlined version changes to `0` and what the semantic difference is.

4. **`getRevisionByPath` git command discrepancy.** The RFC implementation notes (line 267) suggest `git log --follow --oneline <file> | wc -l` as the fallback. The existing implementation at `git.ts:80-81` uses `git log --follow --diff-filter=AMT --format=%H -- <file>` and counts lines. The `--diff-filter=AMT` flag excludes deleted files from the count. The RFC's suggested command would include deletions, producing a different revision count. The RFC should reference the existing implementation, not propose a different command.

5. **`registry.ts` and `loadEntitiesById` / `loadPathsCurrent` dependency.** The existing `getRevisionByPath` first tries the integrity registry (`loadPathsCurrent`, `loadEntitiesById`) before falling back to git. The RFC says "git-history-only is sufficient for autonomous mode" (line 77, 207) — this is correct, but the RFC should explicitly state that the integrity-registry path is dropped entirely in the inlined version, not just "fallback."

## Questions for the author

1. **How should `resolveCompassScanRoot` work in autonomous mode?** The current implementation depends on `context.site` and `context.siteExplicit` for site-scoped scanning. In an external project with forge-only, there is no `site` concept. Should the inlined version always return `workspaceRoot`, or should it accept a simplified context? What happens to the `--packages` and `--package` flags — do they still work without a site context?

2. **Should the inlined `getRevisionByPath` return `0` or `1` when git is unavailable?** The RFC says `0`, the existing code returns `1`. Returning `0` means every file is immediately "audit overdue" (revision 0 vs threshold 30 = overdue). Returning `1` means files are treated as "just created" (revision 1 vs threshold 30 = not overdue). Which semantic is correct for autonomous mode?

3. **What happens to `createCompassInventoryEntries` and `resolveCompassScanRoot` in `site-kernel`?** They are currently exported from `@warpgogol/site-kernel` and re-exported by `site-kernel-checks`. After inlining into forge, do they remain in `site-kernel` for backward compatibility, or are they deleted? If they remain, is `site-kernel` actually impacted (and should be in the file system responsibilities table)?
