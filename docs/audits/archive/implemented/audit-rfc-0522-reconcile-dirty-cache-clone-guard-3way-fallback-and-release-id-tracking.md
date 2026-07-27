---
rfcId: RFC-0522
auditId: AUDIT-RFC-0522-01
date: 2026-07-24
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
rfcPath: docs/rfcs/rfc-0522-reconcile-dirty-cache-clone-guard-3way-fallback-and-release-id-tracking.md
---

# Audit: RFC-0522

## Verdict: Needs revision

The RFC addresses real operational gaps with a well-structured incident report and pragmatic guard rails. However, it proposes a new `isCacheCloneDirty` helper that duplicates the existing generic `isWorkpieceDirty` function, has a design gap in `mission.close` releaseId precedence, and is missing the required "Implementation notes for agents" section. These are fixable in enhance.

## Mechanical validation (rfc.validate)

Pass with 2 warnings:
- **V-13:** Missing required section "## Implementation notes for agents"
- **V-19:** RFC-0522.amends includes RFC-0480, but RFC-0480.amendedBy does not include RFC-0522

## Axis A — Structural completeness

- **Missing "## Implementation notes for agents"** (V-13). The RFC has no explicit behavioral rules for agents implementing this RFC. Required section per V-13.
- **No "TypeScript contracts" section.** The RFC is small-scope (guard rails on existing commands) and code snippets in Design serve as minimal contracts. Acceptable for this scope, but an explicit contracts section would be cleaner.
- **No "File system responsibilities" table.** The RFC references existing files in the Design section (`mission-materialization-commands.ts`, `release-commands.ts`, `mission-close.ts`, `mission-validate.ts`). A table would improve agent navigability.
- **No "Failure modes" section.** Failure behavior is described inline in Design (dirty guard error, 3-way fallback failure, null releaseId warning). A consolidated table would be better but the content is present.
- **No "Output format" / `--json` shape.** No new commands are proposed; changed commands retain existing output shapes with additions (`warnings[]` in close-report, `releaseId` in mission manifest). Acceptable.

## Axis B — DNA alignment

- **DNA-46 (Mission lifecycle):** `satisfies` entry is real. Body §"Architectural fit" explains how the guards strengthen the lifecycle. ✓
- **DNA-47 (Materialization):** `satisfies` entry is real. Body explains reconcile is the materialization transfer step and guards make it more robust. ✓
- **DNA-48 (Release discipline):** `satisfies` entry is real. Body explains releaseId tracking makes the mission-to-release association explicit. ✓
- **DNA-51 (Werkstatt consistency primitives):** Listed in `related` but not `satisfies` — correct. The RFC explicitly states it does not change DNA-51 but adds guard rails on top. ✓
- **RFC-0480 amendment:** Correctly uses `amends` (not `supersedes`) — the core mechanism (`git format-patch` + `git am`) is preserved, only error handling and preconditions are added. ✓

## Axis C — Ecosystem fit

- **Package boundaries:** Only touches `@gogol/site-kernel-handoff`. ✓
- **Command lifecycle:** `commands.changed` lists `mission.reconcile`, `mission.validate`, `mission.close`, `release.prepare` — all existing registered commands. `commands.proposed/added/removed` are empty — correct, no new commands. ✓
- **Missing Compass sync:** The RFC changes `mission.validate` behavior (new warning) and `release.prepare` behavior (writes releaseId). It should identify which `docs/*.xml` files need synchronization — at minimum `docs/verification-plan.xml` for the new validate warning.
- **Missing AGENTS.md update:** `packages/os/site-kernel-handoff/AGENTS.md` documents RFC-0480 behaviors (dirty workpiece guard, reconcile mechanism). This RFC amends those behaviors — the AGENTS.md should be updated to document the cache clone guard, 3-way fallback, and releaseId tracking.

## Axis D — Forward-only compliance

No issues. The 3-way fallback is a retry mechanism within the same `git am` operation, not a dual-path. No compatibility shims. The RFC amends RFC-0480's contract directly. ✓

## Axis E — Agent-facing policy

- **Missing "## Implementation notes for agents"** (V-13). The RFC needs explicit behavioral rules: e.g., "Agents MUST NOT auto-stash dirty cache clone changes", "Agents MUST use `writeMissionManifest` (not raw YAML) when writing releaseId".
- **No self-authorizing language.** The RFC is `status: draft` and does not grant implementation permission. ✓
- **No content authoring in acceptance criteria.** All criteria are code changes. ✓
- **No storage/cookie concerns.** ✓

## Axis F — Pragmatism

- **Duplicate helper function.** The RFC proposes a new `isCacheCloneDirty(systemDir)` function (§Design, line 164) that duplicates the existing generic `isWorkpieceDirty(dir)` helper from `mission-git-commit.ts:37`. The existing function takes any directory, checks `.git` existence, and runs `git status --porcelain`. It is already used in 4 commands (reconcile, validate, close, abort). The RFC should either:
  1. Reuse `isWorkpieceDirty` by passing the cache clone directory (it's generic — the name is misleading but the implementation works on any git repo), or
  2. Rename the existing function to `isGitDirDirty` (or similar) and use it for both workpiece and cache clone checks, or
  3. Extend `WorkpieceDirtyResult` to optionally include file names (the RFC's `isCacheCloneDirty` returns `files: string[]` while the existing helper returns `fileCount: number`).

- **`isCacheCloneDirty` doesn't handle non-git directories.** The proposed function (line 164) runs `execSync("git status --porcelain")` without checking `.git` existence. The existing `isWorkpieceDirty` handles this gracefully (returns `{ dirty: false }`). The cache clone may not be a git repo (the existing reconcile code has a non-git fallback via `copyDir` at line 622). The guard would throw on non-git systems.

- **`release.prepare` design uses raw YAML instead of existing helpers.** The RFC's design code (line 238) uses `YAML.parse`/`YAML.stringify` to write `releaseId` to `mission.yaml`. The existing codebase has `readMissionManifest`/`writeMissionManifest` helpers (`mission-io.ts:30-47`) that use Zod-validated `missionManifestSchema`. The RFC should use `writeMissionManifest` to maintain schema validation.

## Axis G — Blind spots

- **`mission.close` releaseId precedence gap.** The existing `mission.close` code (`mission-close.ts:97`) reads `releaseId` from `flagString(input, "release") ?? null` and overwrites the manifest value at line 162: `manifest.releaseId = releaseId`. If `release.prepare` writes `releaseId` to the manifest (as this RFC proposes), but `mission.close` is called without `--release`, the existing code sets `releaseId = null`, overwriting the manifest value. The RFC must specify precedence: does `--release` flag override the manifest? Does `mission.close` read from the manifest if `--release` is not provided? The current design would cause the "missing-release-id" warning to fire even when `release.prepare` wrote a valid `releaseId`.

- **Non-git cache clone edge case.** The existing reconcile code has a `copyDir` fallback for non-git system dirs (line 622-636). The RFC's dirty cache clone guard should be placed inside the `if (existsSync(gitDir))` block, not before it. The RFC's design code (line 181) shows the guard running before the git existence check.

- **No migration path discussion.** Missions already in flight when the new guards are deployed may have dirty cache clones. The RFC doesn't discuss whether the new guard should be advisory for existing missions or how to handle the transition.

- **3-way merge conflict markers.** The Risks table says "partial conflicts are not possible in `am` mode" — this is correct for `git am` (it either applies cleanly or fails entirely, unlike `git merge` which can leave conflict markers). However, `git am --3way` can produce conflict markers in the working tree when the 3-way merge fails. The RFC should clarify that `git am --3way` failure leaves conflict markers that `git am --abort` cleans up, and that the abort is mandatory before throwing.

## Questions for the author

1. Why propose a new `isCacheCloneDirty` helper instead of reusing the existing generic `isWorkpieceDirty` function from `mission-git-commit.ts`? The existing function works on any git repo directory — is there a functional difference beyond the return type (`files[]` vs `fileCount`)?
2. What is the precedence when `mission.close` is called with `--release <id>` but `release.prepare` already wrote a different `releaseId` to `mission.yaml`? And when `--release` is omitted — should `mission.close` read `releaseId` from the manifest instead of defaulting to null?
3. Should the dirty cache clone guard run inside the `if (existsSync(gitDir))` block (after confirming the cache clone is a git repo), or before it? The current design would throw on non-git Sternsystems that use the `copyDir` fallback.
