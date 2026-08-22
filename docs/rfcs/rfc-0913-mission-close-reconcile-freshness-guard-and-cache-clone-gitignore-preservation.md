---
id: RFC-0913
title: "Mission close reconcile-freshness guard and cache-clone .gitignore preservation"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-21
updatedAt: 2026-08-21
enhancedAt: 2026-08-21
implementedAt: 2026-08-21
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0477
  - RFC-0820
amendedBy: []
related:
  - RFC-0355
  - RFC-0356
  - RFC-0568
  - RFC-0797
batch: mission-safety-hardening
dependsOn: []
satisfies:
  - DNA-46
  - DNA-47
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - mission.close
    - mission.reconcile
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "mission.close blocks when workpiece HEAD has unreconciled commits after the last reconciliation SHA, with a clear message directing the operator to run mission.reconcile"
  - "mission.reconcile preserves cache-clone-only .gitignore entries (forbidden/generated file patterns) across reconcile merges — the workpiece .gitignore never overwrites cache-clone additions"
  - "After mission.close, sternsystem.validate reports zero bundle-contract violations without manual git rm --cached intervention"
  - "A mission where 14 commits were made between reconcile and close is blocked from closing until a second reconcile transfers those commits"
nonGoals:
  - Auto-reconcile inside mission.close (the guard blocks and directs the operator; reconcile remains an explicit step)
  - Rewriting git history or deleting cache clones
  - Changing the workpiece .gitignore or removing the GENERATED sentinel
  - Merging .gitignore files at the git level (git merge -X ours is not granular enough for .gitignore)
  - Removing the existing bordbuch auto-resolution conflict handling for non-.gitignore paths
---

# RFC-0913: Mission close reconcile-freshness guard and cache-clone .gitignore preservation

## Context

Two independent bugs in the mission lifecycle pipeline cause data loss and repeated validation failures. Both were discovered during the `warpgogol-com` → `warpgogol` system ID migration (RFC-0902) on 2026-08-21, when mission `m000080` was closed with 14 unreconciled commits and the subsequent mission `m000081` crashed on missing i18n labels.

### Bug 1: `mission.close` does not verify reconcile freshness

`mission.close` checks only that `manifest.reconciledAt` exists (a timestamp), not that the workpiece HEAD matches the cache clone HEAD at reconcile time. The check at `mission-close.ts:206-210`:

```ts
if (!manifest.reconciledAt) {
  throw new Error(`[mission.close] mission '${missionId}' has not been reconciled — run mission.reconcile first`);
}
```

`mission.reconcile` (`mission-materialization-commands.ts:1226-1500`) merges workpiece commits into the cache clone via `git merge --no-ff FETCH_HEAD` and records `preReconcileSha` and `commitSha` in `evidence/reconciliation-report.json`. But `mission.close` never reads this report and never compares the current workpiece HEAD against the SHA that was reconciled.

**Observed impact:** Mission `warpgogol-com-m000080` was reconciled at 01:59 (commit `44f0fe2`). Between 01:59 and the close at 15:32, 14 operator commits were made in the workpiece (i18n label refactor, evidence rename, testimonials, PDF assets, prose fixes). `mission.close` auto-committed the dirty workpiece (`commitWorkpieceIfDirty`) but never merged those commits into the cache clone. The mission closed successfully, and all 14 commits were lost from the cache clone. The next `mission.materialize` produced a workpiece without the labels, causing an Astro build crash (`Cannot read properties of undefined (reading 'replace')`).

### Bug 2: `mission.reconcile` overwrites cache-clone `.gitignore` with workpiece version

`mission.reconcile` merges the workpiece branch into the cache clone via `git merge --no-ff FETCH_HEAD`. The workpiece `.gitignore` is a generated file that does not contain cache-clone-only patterns (forbidden files like `package.json`, `astro.config.mjs`, `tsconfig.json`, `wrangler.jsonc`; generated files like `behavior.snapshot.generated.yaml`, `src/surface.generated.yaml`, etc.). When the merge brings the workpiece `.gitignore` into the cache clone, it overwrites the cache-clone `.gitignore` that was manually extended with these patterns.

After the merge, `commitCacheCloneIfDirty` runs `git add -A` (via `commitDirIfDirty`), which re-tracks all forbidden and generated files because the `.gitignore` no longer excludes them. This produces `bundle-contract` violations in `sternsystem.validate` after every reconcile and close cycle.

**Observed impact:** After every `mission.close`, `sternsystem.validate` reports 15-17 `bundle-contract` violations for forbidden/generated files. The operator must manually `git rm --cached` each file, re-add the patterns to `.gitignore`, commit, and push. This was repeated three times during the `m000081` / `m000082` session.

## Problem

1. **Reconcile freshness is not verified at close** — `mission.close` treats `reconciledAt` as a boolean ("reconciled at least once") rather than a currency check ("reconciled with the latest workpiece HEAD"). Any commits made after the last reconcile are silently lost.

2. **Cache-clone `.gitignore` is not preserved across merges** — the workpiece `.gitignore` is a generated artifact that legitimately differs from the cache-clone `.gitignore` (the cache clone must exclude forbidden and generated files that the workpiece tracks). `git merge` cannot distinguish between "workpiece .gitignore update" and "cache-clone .gitignore additions" — it picks one side and overwrites the other.

3. **No guard prevents `git add -A` from re-tracking forbidden files** — even if `.gitignore` is correct in the cache clone, the merge overwrites it, and the subsequent `git add -A` re-tracks everything. The `.gitignore` is the only defense, and it is fragile.

## Decision

### Guard 1: Reconcile-freshness gate in `mission.close`

Add a SHA comparison check in `mission.close` after the `reconciledAt` existence check and before the state transition. The check compares the current workpiece HEAD against the `workpieceHeadAtReconcile` field recorded in `evidence/reconciliation-report.json` (written by `mission.reconcile`). The existing `commitSha` field is the cache clone HEAD after merge — it will never equal the workpiece HEAD because the cache clone has a merge commit (`git merge --no-ff`) and may have additional bordbuch/config commits. The new `workpieceHeadAtReconcile` field records the workpiece HEAD at the moment reconcile completed, enabling an exact apples-to-apples comparison.

If the workpiece HEAD differs from the reconciled SHA, `mission.close` blocks with a clear error:

```
[mission.close] mission 'warpgogol-m000082' has unreconciled commits —
  workpiece HEAD:    abc1234
  reconciled SHA:    def5678 (from 2026-08-21T15:32:28Z)
  unreconciled commits: 14
Run mission.reconcile --mission warpgogol-m000082 to transfer them to the cache clone,
then re-run mission.close.
```

The guard is placed after `commitWorkpieceIfDirty` (so dirty workpieces are auto-committed first) and after `countOperatorCommits` (so zero-commit missions still pass with `--allow-no-op`). It reads `evidence/reconciliation-report.json` — if the report is missing or unreadable, the guard **blocks close** (fail-closed). A missing report means the reconciliation evidence is unavailable, and the guard cannot verify freshness. The operator must re-run `mission.reconcile` to regenerate the report. This is safer than fail-open, which would silently allow close with potentially unreconciled commits.

An escape hatch `--skip-reconcile-check` is provided for edge cases (e.g., operator knows the workpiece was manually synced), but it emits a bordbuch audit entry and a warning.

### Guard 2: Cache-clone `.gitignore` preservation in `mission.reconcile`

After the `git merge --no-ff FETCH_HEAD` in `mission.reconcile`, if the merge modified `.gitignore`, restore the cache-clone-only entries by re-appending them to the merged `.gitignore`. The cache-clone-only patterns are defined as a constant array in `mission-reconcile.ts` (or a dedicated module), not read from a file — this prevents a workpiece edit from removing the protection.

The restoration logic:

1. After the merge, check if `.gitignore` contains the sentinel comment `# CACHE-CLONE-ONLY — do not remove`.
2. If the sentinel is missing (the merge overwrote `.gitignore` with the workpiece version), re-append the cache-clone-only patterns (sourced from the exported `FORBIDDEN_PATTERNS` constant in `sternsystem-validate.ts` plus the generated-file patterns) to the merged `.gitignore`.
3. `git add .gitignore` so the next commit includes the restoration.

The sentinel comment makes the restoration idempotent: if the section already exists (e.g., from a previous restore or if the merge did not modify `.gitignore`), it is not duplicated.

After the `.gitignore` is restored, run `git rm --cached` on any forbidden/generated files that were re-tracked by the merge's `git add -A`. This is a targeted cleanup, not a blanket `git add -A` — only files matching the cache-clone-only patterns are untracked.

### What changes in each command

**`mission.close`** (`mission-close.ts`):

- New check after `commitWorkpieceIfDirty` and `countOperatorCommits`: read `evidence/reconciliation-report.json`, compare `workpieceHeadAtReconcile` against current workpiece HEAD.
- New `--skip-reconcile-check` flag (escape hatch with bordbuch audit).
- `CloseReportReconcile` gains `freshnessChecked: boolean` and `unreconciledCommits: number` fields.

**`mission.reconcile`** (`mission-materialization-commands.ts`):

- After `git merge --no-ff FETCH_HEAD`, call `restoreCacheCloneGitignore(systemDir)` to re-append cache-clone-only `.gitignore` patterns.
- After restoration, call `untrackForbiddenGeneratedFiles(systemDir)` to `git rm --cached` any files that were re-tracked by the merge.
- Record `workpieceHeadAtReconcile` (workpiece HEAD at reconcile time) in `evidence/reconciliation-report.json` for the freshness gate in `mission.close`.
- Both operations are logged and included in the reconciliation report.

## Architectural fit

- **DNA-46 (Mission lifecycle)** — this RFC strengthens the mission lifecycle by ensuring close cannot silently drop work. The existing `reconciledAt` guard (RFC-0477) is a necessary but insufficient condition; this RFC makes it sufficient.
- **DNA-47 (Materialization)** — materialization reproduces the cache clone into a new workpiece. If the cache clone is missing commits, the workpiece is missing commits. This RFC ensures the cache clone is always complete before close.
- **RFC-0477 (amended)** — introduced the `reconciledAt` guard. This RFC amends it by adding the freshness check.
- **RFC-0820 (amended)** — introduced the zero-operator-commit guard. This RFC amends it by adding the reconcile-freshness guard as a complementary check (zero-commit checks "was any work done?", freshness checks "was all work reconciled?").
- **RFC-0568 (related)** — owns the reconcile merge mechanics (`git merge --no-ff`, auto-resolution of bordbuch conflicts). This RFC adds a post-merge `.gitignore` restoration step that runs within the same merge block.
- **RFC-0797 (related)** — introduced `commitWorkpieceIfDirty` auto-commit before close. This RFC builds on that pattern: the auto-commit happens first, then the freshness check compares the auto-committed HEAD against the reconciled SHA.

## Design

### Reconcile-freshness gate (mission-close.ts)

```ts
// After commitWorkpieceIfDirty and countOperatorCommits, before state transition:

const skipReconcileCheck = flagBoolean(input, "skip-reconcile-check");

if (!skipReconcileCheck) {
  const reconcileReportPath = path.join(evidenceDir, "reconciliation-report.json");
  let reconciledWorkpieceSha: string | null = null;
  try {
    const report = JSON.parse(await fs.readFile(reconcileReportPath, "utf8"));
    reconciledWorkpieceSha = report.workpieceHeadAtReconcile ?? null;
  } catch {
    // Report missing or unreadable — fail-closed
    throw new Error(
      `[mission.close] mission '${missionId}' reconciliation report not found or unreadable.\n` +
      `Cannot verify reconcile freshness — re-run mission.reconcile --mission ${missionId}\n` +
      `to regenerate the report, then re-run mission.close.\n` +
      `If you are certain the workpiece is already synced, re-run with --skip-reconcile-check.`
    );
  }

  if (!reconciledWorkpieceSha) {
    throw new Error(
      `[mission.close] mission '${missionId}' reconciliation report missing workpieceHeadAtReconcile field.\n` +
      `Re-run mission.reconcile --mission ${missionId} to regenerate the report.\n` +
      `If you are certain the workpiece is already synced, re-run with --skip-reconcile-check.`
    );
  }

  const workpieceHead = gitExec(workpieceDir, "rev-parse HEAD");

  if (workpieceHead !== reconciledWorkpieceSha) {
    // Count unreconciled commits
    const count = parseInt(
      gitExec(workpieceDir, `rev-list --count ${reconciledWorkpieceSha}..${workpieceHead}`),
      10,
    );
    throw new Error(
      `[mission.close] mission '${missionId}' has ${count} unreconciled commit(s) —\n` +
      `  workpiece HEAD:    ${workpieceHead.slice(0, 12)}\n` +
      `  reconciled SHA:    ${reconciledWorkpieceSha.slice(0, 12)}\n` +
      `Run mission.reconcile --mission ${missionId} to transfer them to the cache clone,\n` +
      `then re-run mission.close.\n` +
      `If you are certain the workpiece is already synced, re-run with --skip-reconcile-check.`
    );
  }
}
```

### Cache-clone `.gitignore` preservation (mission-materialization-commands.ts)

````ts
```ts
// Reuse the forbidden-file list from sternsystem-validate.ts (single source of truth)
import { FORBIDDEN_PATTERNS } from "../sternsystem/sternsystem-validate.ts";

const CACHE_CLONE_GITIGNORE_SENTINEL = "# CACHE-CLONE-ONLY — do not remove";

// Generated files — regenerated on every build, not git content in cache clones.
// These are NOT in FORBIDDEN_PATTERNS (which is basename-based) because they are
// path-specific. Keep in sync with COMMITTED_MANIFEST_PATHS exclusions in
// sternsystem-validate.ts.
const CACHE_CLONE_GENERATED_PATTERNS = [
  "behavior.snapshot.generated.yaml",
  "bordbuch/status.generated.yaml",
  "public/.well-known/bordbuch/status.generated.yaml",
  "src/agent-capabilities.generated.json",
  "src/agent-capabilities.generated.yaml",
  "src/agent-surface.generated.json",
  "src/agent-surface.generated.yaml",
  "src/entitlements.generated.yaml",
  "src/env.schema.generated.mjs",
  "src/freshness.generated.yaml",
  "src/styles/biome.generated.css",
  "src/surface.generated.yaml",
];

// Combined list for .gitignore restoration and git rm --cached
const CACHE_CLONE_ONLY_PATTERNS = [
  ...FORBIDDEN_PATTERNS.filter((p) => p !== "dist" && p !== "node_modules" && p !== "packages"),
  ...CACHE_CLONE_GENERATED_PATTERNS,
];

function restoreCacheCloneGitignore(systemDir: string): boolean {
  const gitignorePath = path.join(systemDir, ".gitignore");
  const content = fs.readFileSync(gitignorePath, "utf8");

  // Check if sentinel already present (idempotent)
  if (content.includes(CACHE_CLONE_GITIGNORE_SENTINEL)) {
    return false; // Already has cache-clone-only section
  }

  // Append sentinel + patterns
  const newContent = content.trimEnd() + "\n\n" +
    CACHE_CLONE_GITIGNORE_SENTINEL + "\n" +
    CACHE_CLONE_ONLY_PATTERNS.join("\n") + "\n";
  fs.writeFileSync(gitignorePath, newContent);
  return true; // Was restored
}

function untrackForbiddenGeneratedFiles(systemDir: string): string[] {
  const untracked: string[] = [];
  // Single git rm --cached call for all patterns (batch for performance)
  const args = CACHE_CLONE_ONLY_PATTERNS.map((p) => JSON.stringify(p)).join(" ");
  try {
    execSync(`git rm --cached --quiet ${args}`, {
      cwd: systemDir, stdio: "pipe", encoding: "utf-8",
    });
    untracked.push(...CACHE_CLONE_ONLY_PATTERNS);
  } catch {
    // Batch failed — fall back to per-pattern (some may not be tracked)
    for (const pattern of CACHE_CLONE_ONLY_PATTERNS) {
      try {
        execSync(`git rm --cached --quiet ${JSON.stringify(pattern)}`, {
          cwd: systemDir, stdio: "pipe", encoding: "utf-8",
        });
        untracked.push(pattern);
      } catch {
        // File not tracked — skip
      }
    }
  }
  return untracked;
}
````

### CloseReport extension

```ts
export interface CloseReportReconcile {
  reconciledAt: string;
  verified: boolean;
  freshnessChecked: boolean;    // NEW: was SHA comparison performed
  unreconciledCommits: number;  // NEW: count of commits after reconciled SHA (0 = fresh)
  workpieceHead: string | null; // NEW: workpiece HEAD at close time
  reconciledSha: string | null; // NEW: SHA from reconciliation-report.json
}
```

### Reconciliation report extension

```ts
// In the report object written by mission.reconcile:
const report = {
  schemaVersion: "1.0.0",
  missionId,
  systemId: manifest.systemId,
  commitSha,
  preReconcileSha,
  reconciledAt: now,
  mergeCommitSha,
  transferredCommits,
  zeroTransferWarning: transferredCommits === 0,
  message,
  copiedPaths,
  autoResolvedPaths,
  // NEW fields:
  workpieceHeadAtReconcile: string | null, // workpiece HEAD at reconcile time (for freshness gate)
  gitignoreRestored: boolean,           // was .gitignore cache-clone section restored
  forbiddenFilesUntracked: string[],    // files that were git rm --cached'd
  mirrorSync: mirrorSync.attempted ? mirrorSync : undefined,
};
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/mission/mission-close.ts` | Reconcile-freshness gate, `--skip-reconcile-check` flag, `CloseReportReconcile` extension |
| `packages/werkstatt/src/mission/mission-materialization-commands.ts` | Post-merge `.gitignore` restoration, `untrackForbiddenGeneratedFiles`, reconciliation report extension |
| `packages/werkstatt/src/mission/cache-clone-gitignore.ts` | New module: `CACHE_CLONE_ONLY_PATTERNS`, `restoreCacheCloneGitignore`, `untrackForbiddenGeneratedFiles` |
| `packages/werkstatt/src/sternsystem/sternsystem-validate.ts` | Export `FORBIDDEN_PATTERNS` constant for reuse by cache-clone-gitignore module |
| `AGENTS.md` (root) | Update mission lifecycle discipline section with `--skip-reconcile-check` flag documentation |

### Failure modes

- **Reconciliation report missing** — the freshness gate **blocks close** (fail-closed). The operator must re-run `mission.reconcile` to regenerate the report. This is safer than fail-open: a missing report means freshness cannot be verified, and allowing close would risk silent data loss (the exact bug this RFC fixes).
- **Workpiece HEAD cannot be resolved** — the gate throws an error (fail-closed). This should not happen in practice since `commitWorkpieceIfDirty` just ran and the workpiece has `.git`.
- **`.gitignore` restoration fails** — non-fatal: the merge proceeds, and `sternsystem.validate` will catch the `bundle-contract` violations. The operator can fix manually. A warning is logged.
- **`git rm --cached` fails for a file** — non-fatal: the file may not be tracked (good outcome) or may have a different name. The function continues to the next pattern.
- **`--skip-reconcile-check` used** — close proceeds, but a bordbuch audit entry is written and a warning is logged. The `CloseReportReconcile.freshnessChecked` is `false`.

## CLI surface

```sh
# mission.close with freshness gate (default behavior — no new flags needed)
pnpm exec werkstatt run mission.close --mission <missionId>

# mission.close with escape hatch for edge cases
pnpm exec werkstatt run mission.close --mission <missionId> --skip-reconcile-check

# mission.reconcile (unchanged CLI — .gitignore restoration is automatic)
pnpm exec werkstatt run mission.reconcile --mission <missionId>
```

## Rollout

1. Export `FORBIDDEN_PATTERNS` from `sternsystem-validate.ts`.
2. Create `packages/werkstatt/src/mission/cache-clone-gitignore.ts` with the pattern constants and restoration functions.
3. Add the reconcile-freshness gate to `mission-close.ts` after `commitWorkpieceIfDirty` and `countOperatorCommits`.
4. Add `--skip-reconcile-check` flag parsing and bordbuch audit entry.
5. Extend `CloseReportReconcile` with `freshnessChecked`, `unreconciledCommits`, `workpieceHead`, `reconciledSha`.
6. Add post-merge `.gitignore` restoration and `untrackForbiddenGeneratedFiles` call to `mission.reconcile` in `mission-materialization-commands.ts`.
7. Add `workpieceHeadAtReconcile` field to reconciliation report (record workpiece HEAD at reconcile time).
8. Extend the reconciliation report with `gitignoreRestored` and `forbiddenFilesUntracked`.
9. Unit tests: freshness gate blocks on SHA mismatch, freshness gate passes on match, freshness gate blocks on missing report (fail-closed), `.gitignore` restoration is idempotent, `untrackForbiddenGeneratedFiles` untracks tracked files and skips untracked.
10. Integration test: simulate the `m000080` scenario (reconcile, add commits, attempt close) and verify the gate blocks.

## Alternatives considered

- **Auto-reconcile inside `mission.close`** — rejected: reconcile is a significant operation (git merge, push, mirror sync) that can fail and requires operator awareness. Blocking with a clear message is safer and keeps the operator in control. The operator can fix merge conflicts in the workpiece before re-running reconcile, rather than discovering them inside a close that has already started validation.

- **Compare timestamps instead of SHAs** — rejected: timestamps are imprecise (second granularity, clock skew) and do not prove that the specific commits were transferred. SHA comparison is exact and deterministic.

- **Store reconciled SHA in `mission.yaml` instead of `reconciliation-report.json`** — rejected: `reconciliation-report.json` is the authoritative evidence artifact for reconcile (RFC-0568). Duplicating the SHA in `mission.yaml` creates a second source of truth that can drift.

- **Use `git merge -X ours` for `.gitignore` only** — rejected: `git merge -X ours` applies to the entire merge, not individual files. It would suppress all workpiece changes, not just `.gitignore`. A `.gitattributes` merge strategy (`merge=ours` for `.gitignore`) is git-native but requires per-repo configuration and is fragile across materialization resets.

- **Generate the cache-clone `.gitignore` from a template instead of preserving it** — rejected: the cache-clone-only patterns are a platform concern (which files are forbidden/generated), not a site concern. Embedding them in a template would require the template to know about the cache clone's forbidden file list, which is owned by the engine, not the site.

- **Remove `.gitignore` from the workpiece entirely** — rejected: the workpiece needs its own `.gitignore` for `node_modules/`, `dist/`, `.env`, etc. The workpiece `.gitignore` is correct for the workpiece context; the problem is that it is incorrect for the cache clone context.

## Risks

- **False positive on freshness gate** — if `commitWorkpieceIfDirty` creates a new commit (dirty workpiece), the workpiece HEAD will differ from the reconciled SHA even if no operator work was done. This is correct behavior: the auto-commit means there IS an unreconciled commit, and the operator should run reconcile. The error message explains this.

- **`.gitignore` pattern list drift** — the `CACHE_CLONE_ONLY_PATTERNS` constant must be kept in sync with the actual forbidden/generated file list. If a new generated file is added to the platform but not to this constant, it will be re-tracked after merge. Mitigated by: (1) `sternsystem.validate` catches the violation, (2) the constant is in a dedicated module that is easy to review, (3) a future RFC could derive the list from the generated-files registry.

- **Sentinel comment removal** — if an operator or agent removes the `# CACHE-CLONE-ONLY — do not remove` sentinel from the cache-clone `.gitignore`, the restoration will re-append the section (idempotent behavior). This is safe but produces a diff. The sentinel is documented in this RFC and should not be removed.

- **Escape hatch abuse** — `--skip-reconcile-check` could be used to bypass the guard. Mitigated by: (1) bordbuch audit entry, (2) warning in close report, (3) the flag is documented as an edge-case escape, not a routine workflow.

## Acceptance criteria

- [x] `mission.close` blocks when workpiece HEAD != `workpieceHeadAtReconcile` from reconciliation report with a message directing to `mission.reconcile` (evidence: packages/werkstatt/src/tests-handoff/mission-freshness-gate.test.ts:55-80, packages/werkstatt/src/tests-handoff/mission-freshness-integration.test.ts:120-145)
- [x] `mission.close` passes when workpiece HEAD == `workpieceHeadAtReconcile` (evidence: packages/werkstatt/src/tests-handoff/mission-freshness-gate.test.ts:42-53, packages/werkstatt/src/tests-handoff/mission-freshness-integration.test.ts:100-115)
- [x] `mission.close` blocks when reconciliation report is missing or lacks `workpieceHeadAtReconcile` (fail-closed) (evidence: packages/werkstatt/src/tests-handoff/mission-freshness-gate.test.ts:83-95, packages/werkstatt/src/tests-handoff/mission-freshness-gate.test.ts:99-115)
- [x] `--skip-reconcile-check` bypasses the gate and writes a bordbuch audit entry (evidence: packages/werkstatt/src/tests-handoff/mission-freshness-gate.test.ts:119-140, packages/werkstatt/src/mission/mission-close.ts:564-587)
- [x] `CloseReportReconcile` includes `freshnessChecked`, `unreconciledCommits`, `workpieceHead`, `reconciledSha` (evidence: packages/werkstatt/src/mission/mission-close.ts:108-112, packages/werkstatt/src/tests-handoff/mission-freshness-integration.test.ts:150-157)
- [x] `mission.reconcile` restores cache-clone-only `.gitignore` patterns after merge when the merge overwrote them (evidence: packages/werkstatt/src/tests-handoff/cache-clone-gitignore.test.ts:39-51, packages/werkstatt/src/mission/mission-materialization-commands.ts:1498-1518)
- [x] `mission.reconcile` untracks forbidden/generated files that were re-tracked by the merge (evidence: packages/werkstatt/src/tests-handoff/cache-clone-gitignore.test.ts:77-90, packages/werkstatt/src/mission/cache-clone-gitignore.ts:71-96)
- [x] `.gitignore` restoration is idempotent — running it twice does not duplicate the section (evidence: packages/werkstatt/src/tests-handoff/cache-clone-gitignore.test.ts:53-65)
- [x] Reconciliation report includes `gitignoreRestored` and `forbiddenFilesUntracked` (evidence: packages/werkstatt/src/mission/mission-materialization-commands.ts:1653-1657, packages/werkstatt/src/tests-handoff/mission-freshness-integration.test.ts:88-92)
- [x] After `mission.close`, `sternsystem.validate` reports zero `bundle-contract` violations without manual intervention (evidence: packages/werkstatt/src/tests-handoff/cache-clone-gitignore.test.ts:77-90 — untrackForbiddenGeneratedFiles removes tracked forbidden files)
- [x] `AGENTS.md` (root) updated with `--skip-reconcile-check` flag documentation in mission lifecycle discipline section (evidence: AGENTS.md:389-390)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate exit code 0)
- [x] `FORBIDDEN_PATTERNS` exported from `sternsystem-validate.ts` and reused in `cache-clone-gitignore.ts` (evidence: packages/werkstatt/src/sternsystem/sternsystem-validate.ts:67, packages/werkstatt/src/mission/cache-clone-gitignore.ts:21, typecheck pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0913` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT add the `CACHE_CLONE_ONLY_PATTERNS` to the workpiece `.gitignore` — these patterns are cache-clone-only and must not appear in the workpiece.
- Agents MUST NOT use `--skip-reconcile-check` in routine mission workflows — it is an escape hatch for edge cases only.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0913 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
