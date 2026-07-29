---
rfcId: RFC-0568
auditId: AUDIT-RFC-0568-01
date: 2026-07-28
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0568

## Verdict: Needs revision

The RFC correctly identifies the root cause of reconcile failures (disconnected git histories) and proposes a sound high-level fix (clone instead of init, merge instead of am). However, it has a critical design gap: it does not specify how the materialize commit (which contains platform boilerplate files) is excluded from the merge into the cache clone. Without this, `git merge --no-ff` would pollute the cache clone with platform files that the Sternsystem data-only repo must not contain (DNA-44 violation).

## Mechanical validation (rfc.validate)

Pass — 0 errors, 0 warnings.

## Axis A — Structural completeness

1. **Failure mode 5 is incorrect.** The RFC states "Workpiece has no commits after materialize: Reconcile is a no-op." But the materialize step creates a commit on top of the cloned history. With `git merge --no-ff`, this materialize commit would be merged into the cache clone, bringing boilerplate files. This is not a no-op.

2. **Output format section missing.** No `--json` output shape documented for changed commands.

3. **`UntrackedFileReport` file shape unclear.** The file system responsibilities table lists `evidence/untracked-files-report.json`, but the RFC only defines a per-file interface. Is the JSON file an array or a wrapper object?

4. **`ReconciliationReport` omits existing fields.** The current report includes `message` and `copiedPaths`. The RFC's proposed interface drops them without stating whether they are removed or preserved.

## Axis B — DNA alignment

1. **`satisfies: [DNA-42]` is weakly justified.** DNA-42 is the Compass markup contract (MODULE_CONTRACT/CHANGE_SUMMARY blocks in source files). The RFC's connection — "git history ensures Compass blocks can trace evolution" — is tangential. The core change does not enforce, protect, or extend DNA-42.

2. **Missing `satisfies` for DNA-46 and DNA-47.** The RFC directly changes `mission.materialize` (DNA-47) and `mission.reconcile` (DNA-46). These are the most directly affected invariants but are absent from both `satisfies[]` and `related[]`.

## Axis C — Ecosystem fit

1. **Interaction with `syncCacheClone` not addressed.** The current `mission-materialize.ts:275-365` syncs the cache clone from remote before materialization. The RFC proposes `git clone systems/<id>/` but does not explain whether `syncCacheClone` still runs before the clone or is replaced by it.

2. **Non-data-path files from cache clone not handled.** Current materialize copies only `STERNSYSTEM_DATA_PATHS` (`src/content`, `public`, `provenance`). A full `git clone` inherits the entire cache clone directory, including `bordbuch/`, `system.pin.json`, `.env`. The RFC should specify whether these are kept, removed, or gitignored.

3. **Materialize commit exclusion from merge not specified (CRITICAL).** The current reconcile skips the root commit: `git format-patch ${rootSha}..HEAD`. With clone-based materialize, the materialize commit sits on top of the cache clone's history — it is no longer a root commit. `git merge --no-ff` would merge it, transferring platform boilerplate (`package.json`, `astro.config.mjs`, `wrangler.jsonc`) into the Sternsystem data-only cache clone. This violates DNA-44. The RFC must specify a mechanism to exclude the materialize commit from the merge.

## Axis D — Forward-only compliance

No issues. Old code paths are removed, no compatibility shims proposed.

## Axis E — Agent-facing policy

1. **Interactive prompt lacks non-interactive mode.** The cache clone drift prompt ("merge or overlay") has no flag equivalent (e.g., `--overlay`). CI pipelines and automated agents cannot use it without stdin.

2. **No bypass flag for untracked file block.** The RFC blocks reconcile on untracked files with no `--force` bypass. This is consistent with RFC-0522's hard refusal pattern, but the RFC should explicitly state that no bypass is provided and why.

## Axis F — Pragmatism

1. **`UntrackedFileReport.likelyOrigin` matching algorithm undefined.** The RFC says "match against known mission artifacts, check Bordbuch" but does not define decision rules for `"previous-mission"` vs `"direct-commit"` vs `"unknown"`.

2. **"Detect cache clone drift" comparison method unspecified.** "Compare cache clone HEAD with pin authored content" — compare SHAs? File contents? A diff of `src/content/`? Needs to be concrete.

3. **"Pin" terminology imprecise.** The RFC says "Copy authored files from the pin bundle." The pin (`system.pin.json`) is a metadata file, not a content bundle. Authored content lives in the cache clone's data directories.

## Axis G — Blind spots

1. **Branch name hardcoded as `master`.** `git fetch <workpiece-dir> master` fails if the cache clone uses `main`. Should use `HEAD` or determine branch dynamically.

2. **Generated file conflicts during merge not addressed.** The current code auto-resolves generated file conflicts by taking "theirs". The RFC removes this mechanism but does not specify how generated file conflicts are handled with `git merge --no-ff`.

3. **Merge conflict resolution location unclear.** Failure mode 4 says "Operator resolves in cache clone" — but the cache clone is the canonical local copy. Modifying it outside a reconcile operation could be detected as external edits by `sternsystem.validate` (RFC-0480 Bordbuch-vs-git-log check). Should conflicts be resolved in the workpiece instead?

4. **`git push origin <branch>` after merge not mentioned.** The current reconcile pushes after applying patches (`mission-materialization-commands.ts:684-692`). The RFC's reconcile flow does not mention pushing the merge commit to origin.

## Questions for the author

1. How is the materialize commit (containing platform boilerplate) excluded from the merge into the cache clone to avoid violating DNA-44 (Sternsystem data-only contract)?
2. What is the concrete comparison method for "cache clone drift detection" — SHA comparison, file content diff, or something else?
3. How does the reconcile flow handle generated file conflicts that the current auto-resolve mechanism was designed to address?
4. Should merge conflicts during reconcile be resolved in the workpiece (re-consolidated) or in the cache clone (risking external-edit detection by `sternsystem.validate`)?
