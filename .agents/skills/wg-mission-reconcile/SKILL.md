---
name: wg-mission-reconcile
description: Reconcile a mission workpiece to its cache clone — pre-flight checks, conflict resolution, post-flight verification, and learning. Use when the operator wants to reconcile or close a mission.
invocation: user
concerns: content-mutation
dependsOn: ['my-preferences']
languagePolicy: ref(PREFERENCES.md)
knowledge:
  - qa-log.md
  - fix-patterns.md
  - learned-principles.md
---

# wg-mission-reconcile

Before starting, read `PREFERENCES.md` at the repository root. If the file is missing or `aiLanguage` is unset, ask the operator once and create the file using the `my-preferences` skill semantics.

Reconcile a mission's workpiece commits to its Sternsystem cache clone. The command `mission.reconcile` transfers commits via `git format-patch` + `git am`, but it fails on common situations: dirty workpiece, dirty cache clone, missing validation, add/add conflicts on generated files, and missing pre-image blobs. This skill wraps the command with pre-flight checks, conflict resolution, and post-flight verification — turning a multi-error debugging session into a predictable process.

## Knowledge layers

- **`fix-patterns.md`** (L1) — baseline fix patterns for common reconcile failures.
- **`learned-principles.md`** (L2) — distilled principles from past runs, with `confirmations: N` counter.
- **`qa-log.md`** (L0) — append-only raw Q&A pairs from each run.

Read L1 and L2 at the start of each run. Append to L0 during the run. Distill L2 from L0 at the end.

## Process

### 1. Resolve mission

Read the mission manifest at `missions/<missionId>/mission.yaml`. Extract:

- `systemId` — the Sternsystem ID (e.g. `warpgogol-com`)
- `state` — must be `open`
- `reconciledAt` — if already set, warn the operator (reconcile may be a re-run)

Resolve paths:

- Workpiece: `missions/<missionId>/workpiece/`
- Cache clone: `systems/<systemId>/`
- Evidence: `missions/<missionId>/evidence/`

### 2. Pre-flight checks

Run all checks before attempting reconcile. Each check is deterministic and prevents a known failure mode.

#### 2.1 Workpiece dirty check

Run `git status --porcelain` in the workpiece directory.

- **Dirty** → commit via `pnpm exec site-kernel run mission.git.commit --mission <missionId> --message "<descriptive message>"`. Re-run the check.
- **Clean** → proceed.

#### 2.2 Cache clone dirty check

Run `git status --porcelain` in the cache clone directory.

- **Dirty** → check L2 for a known principle. If the dirty file is `bordbuch/events.ndjson`, commit it: `git add bordbuch/events.ndjson && git commit -m "bordbuch: record <event description>"`. For other files, ask the operator. Re-run the check.
- **Clean** → proceed.

#### 2.3 Validation check

Check if `missions/<missionId>/evidence/validation-report.json` exists and contains `contractFull.passed: true`.

- **Missing or not passed** → run `pnpm exec site-kernel run mission.validate --mission <missionId>`. After validation, re-run pre-flight checks 2.1 and 2.2 (validation may generate files).
- **Passed** → proceed.

#### 2.4 Cache clone divergence check

Compare the cache clone HEAD tree with the workpiece materialize commit tree:

```sh
git rev-parse HEAD^{tree}           # in cache clone
git rev-list --max-parents=0 HEAD   # in workpiece — get materialize root SHA
git rev-parse <rootSha>^{tree}      # in workpiece
```

If trees differ significantly (more than bordbuch and generated files), warn the operator: "Cache clone has diverged from materialize base. Patch conflicts are likely. Proceeding with conflict resolution."

### 3. Run mission.reconcile

```sh
pnpm exec site-kernel run mission.reconcile --mission <missionId>
```

- **Success** → skip to step 5 (post-flight verification).
- **Failure** → read the error message and proceed to step 4 (conflict resolution).

### 4. Conflict resolution

Identify the conflict type from the error message. Check L2 first, then L1, then ask the operator.

#### 4.1 Missing pre-image blob

**Symptom:** `error: sha1 information is lacking or useless (<file>)` or `error: could not build fake ancestor`

**Fix (L1 Pattern A):** Fetch workpiece objects into the cache clone, then retry:

```sh
git fetch <workpiece-path> --no-tags    # in cache clone
```

Reset cache clone to pre-reconcile SHA (from `evidence/reconciliation-report.json` if it exists, or `git reflog`). Re-run `mission.reconcile`.

#### 4.2 Add/add conflict on generated files

**Symptom:** `CONFLICT (add/add): Merge conflict in <file>` on files like `entitlements.generated.yaml`, `freshness.generated.yaml`, `surface.generated.yaml`, `surface/states/*.state.yaml`, `pointer.yaml`

**Fix (L1 Pattern B):** These files are generated artifacts. The workpiece version is authoritative (it was just validated). Resolve with `--theirs`:

```sh
git checkout --theirs .
git add -A
git am --continue
```

If `git am --continue` fails (more conflicts in subsequent patches), repeat for each conflicting patch.

#### 4.3 Other conflicts

For conflicts on authored content files (`.md`, `.yaml` in `src/content/`):

1. Read both versions (ours = cache clone, theirs = workpiece).
2. The workpiece version is authoritative — it was validated.
3. If the conflict is trivial (whitespace, timestamp), resolve with `--theirs`.
4. If the conflict involves meaningful content divergence, ask the operator. Record the Q&A in L0.

#### 4.4 Manual patch application (when mission.reconcile fails mid-way)

If `mission.reconcile` fails and cannot be retried (e.g. partial patch application left the cache clone in an inconsistent state):

1. Reset cache clone to pre-reconcile SHA: `git reset --hard <preReconcileSha>`
2. Fetch workpiece objects: `git fetch <workpiece-path> --no-tags`
3. Apply patches manually:

   ```sh
   PATCH_DIR="missions/<missionId>/evidence/patches"
   for patch in $(ls "$PATCH_DIR"/*.patch | sort); do
     if git am --3way "$patch" 2>&1; then
       echo "OK: applied $(basename "$patch")"
     else
       git checkout --theirs .
       git add -A
       git am --continue 2>&1 || git am --skip 2>&1
     fi
   done
   ```

4. Push to origin: `git push origin master`
5. Create reconciliation report manually (see step 5.2).

### 5. Post-flight verification

#### 5.1 Tree comparison

Compare cache clone HEAD tree with workpiece HEAD tree:

```sh
git rev-parse HEAD^{tree}                              # cache clone
git --git-dir=<workpiece>/.git rev-parse HEAD^{tree}   # workpiece
```

If trees match → perfect reconcile. If trees differ → check that differences are only in cache-clone-specific files (bordbuch, infrastructure files that diverged before materialize). Content files should match.

#### 5.2 Reconciliation report

If `mission.reconcile` succeeded, the report is at `evidence/reconciliation-report.json`. If it failed and patches were applied manually:

```sh
COMMIT_SHA=$(git rev-parse HEAD)    # in cache clone
PRE_RECONCILE_SHA=<sha before patches>
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
cat > evidence/reconciliation-report.json << EOF
{
  "schemaVersion": "1.0.0",
  "missionId": "<missionId>",
  "systemId": "<systemId>",
  "commitSha": "$COMMIT_SHA",
  "preReconcileSha": "$PRE_RECONCILE_SHA",
  "reconciledAt": "$NOW",
  "message": "manual reconcile — <description>",
  "copiedPaths": []
}
EOF
```

#### 5.3 Update mission manifest

Update `missions/<missionId>/mission.yaml`:

```yaml
reconciledAt: <ISO timestamp>
```

#### 5.4 Push to origin

```sh
git push origin master    # in cache clone
```

If push fails (non-fatal), log a warning — the next `syncCacheClone` will catch up.

### 6. Meta-analysis and learning

After successful reconcile:

1. Review L0 (`qa-log.md`) entries from this run.
2. Identify recurring decision patterns (e.g. "bordbuch/events.ndjson is always dirty after mission.migrate").
3. Formulate concrete principles (conflict type + condition → action).
4. Present principles to the operator for approval.
5. Append approved principles to L2 (`learned-principles.md`).
6. Commit knowledge file updates: `git add packages/warpgogol-skills/skills/wg-mission-reconcile/learned-principles.md packages/warpgogol-skills/skills/wg-mission-reconcile/qa-log.md && git commit -m "chore: update wg-mission-reconcile knowledge from run"`.

### 7. Final report

Output a structured report:

```
# wg-mission-reconcile report

## Mission
- ID: <missionId>
- System: <systemId>
- State: reconciled

## Pre-flight
- Workpiece dirty: yes/no (N files committed)
- Cache clone dirty: yes/no (N files committed)
- Validation: passed / ran (N steps)
- Divergence: yes/no

## Reconcile
- Method: command / manual
- Patches: N applied (M conflicts)
- Conflicts resolved: list

## Post-flight
- Trees match: yes/no
- Push to origin: success/failed
- Reconciliation report: created/exists

## Learned principles
- New principles: N (see below)
- Approved by operator: yes

## Next actions
- Offered: release.prepare / mission.close
- Operator chose: <choice>
- Mission state after: closed / open (awaiting release)
```

### 8. Next actions

After successful reconcile, the mission is still `open`. Present the operator with two options:

1. **Release** — run `pnpm exec site-kernel run release.prepare --mission <missionId>` to prepare a release. This associates a `releaseId` with the mission and enables `release.ready`. After release.prepare, run `mission.close` to close the mission with the release associated.

2. **Close without release** — run `pnpm exec site-kernel run mission.close --mission <missionId>` to close the mission immediately. This is valid for verification-only missions (no content changes to publish). The close report will contain a `missing-release-id` warning — this is expected.

Ask the operator which path they want. If the operator chooses release, run `release.prepare` first, then `mission.close`. If the operator chooses close, run `mission.close` directly.

After `mission.close` completes, verify:

- `missions/<missionId>/mission.yaml` has `state: closed` and `closedAt` set.
- `evidence/close-report.json` exists.
- `evidence/workpiece.git-bundle` exists (audit trail).
- `systems/registry.yaml` has `currentMission: null` for this system.
- Commit the registry change: `git add systems/registry.yaml && git commit -m "chore: clear currentMission for <systemId> after mission.close <missionId>"`.

## Completion criteria

- Cache clone HEAD contains all workpiece commits (verified by tree comparison or patch count).
- `evidence/reconciliation-report.json` exists with correct `commitSha` and `reconciledAt`.
- `missions/<missionId>/mission.yaml` has `reconciledAt` set.
- Cache clone pushed to origin (or push failure logged as non-fatal warning).
- L0 appended with any Q&A from this run.
- L2 updated with any new approved principles.
- `git status` is clean in the platform repo (no uncommitted changes from this session).
- Operator was offered release.prepare or mission.close as next step.

## Constraints

- **User-invoked only.** Never auto-run.
- **Commit immediately after each verified change.** Workpiece via `mission.git.commit`, cache clone via `git add && git commit`, platform via `git add && git commit`. Never respond with uncommitted changes.
- **Workpiece version is authoritative.** When in doubt about generated files, take `--theirs` (workpiece side).
- **`--max-time 10` on all curl commands** if probing dev servers.
- **Never `git add -A` in the platform repo.** Stage only files from this session's work.
- **Knowledge files grow only through AI per operator direction.** Never hand-edit `fix-patterns.md`, `learned-principles.md`, or `qa-log.md` manually outside the skill.
