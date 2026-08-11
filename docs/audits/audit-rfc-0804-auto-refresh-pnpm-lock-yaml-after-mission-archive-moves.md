---
rfcId: RFC-0804
auditId: AUDIT-RFC-0804-01
date: 2026-08-11
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0804

## Verdict: Needs revision

The RFC correctly identifies the root cause (stale pnpm-lock.yaml importer entries after mission.archive moves) and proposes a reasonable solution. However, it contains a factual error about the current handler's implementation, does not address a MODULE_CONTRACT non-goal violation, and the proposed `git add` code snippet has a bug that would fail at runtime.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Implementation notes for agents** (lines 222-237): The section still contains the template HTML comment block (`<!-- Rules that govern how AI agents interact with this RFC. ... -->`) instead of explicit behavioral rules. The comment should be replaced with actual agent-facing policy, or the section should state "No additional agent-facing policy beyond standard RFC governance."

## Axis B — DNA alignment

No issues. `satisfies: []` is correct for a `kind: command` RFC. No new DNA invariant is established.

## Axis C — Ecosystem fit

- **Factual error** (line 109): The RFC states "`mission.archive` ... already uses `execSync` for filesystem operations." This is incorrect. `packages/forge/os/mission/handlers/archive.ts` uses `fs.rename` from `node:fs/promises` (async) for all filesystem operations. No `execSync` import exists (confirmed by grep). The RFC's claim should be corrected to: "The handler currently uses `node:fs/promises` for filesystem operations. Adding `execSync` from `node:child_process` is a new import."

- **MODULE_CONTRACT violation** (archive.ts lines 9-13): The non-goals state "Does not import from @warpgogol/* packages — uses node:fs and yaml only." Adding `execSync` from `node:child_process` and `execSync("git ...")` operations contradicts "uses node:fs and yaml only." The RFC must either (a) propose updating the MODULE_CONTRACT non-goals to include `node:child_process`, or (b) delegate the pnpm install + git commit to a werkstatt utility (e.g. `commitWerkstattSideEffects`) that already handles git operations.

- **Git commit is a new responsibility**: `mission.archive` currently does NOT commit moved directories to git — it only moves them on disk via `fs.rename`. The RFC proposes adding `git add` + `git commit` as a new behavior. This scope expansion should be explicitly called out in the Decision section, not just in the implementation snippet.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers or shims proposed.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Status gate is respected (RFC is `draft`, implementation notes reference standard governance rules).

## Axis F — Pragmatism

- **Git add approach is fragile** (lines 152-157): The code snippet does `git add ${JSON.stringify(m.from)} ${JSON.stringify(m.to)}`. After `fs.rename` has already moved the directory, `m.from` (e.g. `missions/warpgogol-com-m000049`) no longer exists on disk. `git add missions/warpgogol-com-m000049` would silently succeed (git tracks deletions), but the approach is fragile. A more robust pattern is `git add -A missions/ pnpm-lock.yaml` which stages all changes (deletions + additions) under `missions/` plus the lockfile.

- **Alternative: delegate to werkstatt**: `mission.close` already uses `commitWerkstattSideEffects` from `packages/werkstatt` for git commits. The RFC could propose a similar pattern instead of raw `execSync("git ...")` in a forge handler. This would keep git operations in werkstatt, respecting the forge/werkstatt boundary.

## Axis G — Blind spots

- **`git add` on moved paths** (lines 152-157): As noted in Axis F, `git add` on the source path after `fs.rename` is unreliable. The RFC should use `git add -A` or `git add missions/ pnpm-lock.yaml` to capture both sides of the rename.

- **Concurrent execution**: Two simultaneous `mission.archive` invocations would both run `pnpm install` concurrently, potentially corrupting `pnpm-lock.yaml` or failing with lockfile conflicts. The RFC should mention whether `mission.archive` is expected to be single-instance (the existing lock mechanism doesn't cover archive operations).

- **`pnpm install` side effects**: `pnpm install` may modify `node_modules/` symlinks across the entire workspace, not just `pnpm-lock.yaml`. If the workpiece had unique dependencies not present in any other workspace package, `pnpm install` might remove packages from the shared store. This is usually benign but worth noting.

## Questions for the author

1. Should the MODULE_CONTRACT non-goals in `archive.ts` be updated to allow `node:child_process`, or should the pnpm install + git commit be delegated to a werkstatt utility (e.g. `commitWerkstattSideEffects`) to keep the forge handler free of git operations?
2. The `git add` snippet stages `m.from` (source path) after `fs.rename` has already moved the directory — should this use `git add -A missions/ pnpm-lock.yaml` instead to reliably capture renames?
3. `mission.archive` currently does not commit moved directories to git at all. Is adding git commit a deliberate new behavior, or should the lockfile be committed separately (leaving directory moves uncommitted as today)?
