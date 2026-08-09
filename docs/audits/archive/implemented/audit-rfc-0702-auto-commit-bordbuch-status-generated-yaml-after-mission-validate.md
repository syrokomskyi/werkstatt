---
rfcId: RFC-0702
auditId: AUDIT-RFC-0702-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0702

## Verdict: Needs revision

The RFC's core premise is factually incorrect: `bordbuch.commit` (RFC-0626) already runs as a step in `SITES_BUILD_PREPARE_PIPELINE` and commits `status.generated.yaml` to the cache clone during `build.prepare`, which `mission.validate` executes. The RFC does not mention `bordbuch.commit` or RFC-0626 anywhere. Additionally, the proposed `commitAndPushBordbuch` API signature does not match the actual function signature, and the file paths in the design section point to the workpiece instead of the cache clone.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **Context section is factually wrong.** The RFC states: _"mission.validate does not call commitAndPushBordbuch — it generates the status file but leaves it uncommitted in the cache clone."_ This is incorrect. `mission.validate` runs `build.prepare` pipeline (`mission-materialization-commands.ts:306-311`), which includes `bordbuch.commit` at step 129 of `build-prepare.ts`. `bordbuch.commit` calls `commitBordbuchProjections` (`bordbuch-commit.ts:46-89`) which stages and commits `bordbuch/status.generated.yaml`, `public/.well-known/bordbuch.json`, and `public/.well-known/bordbuch/index.html` to the cache clone.

2. **Problem section is factually wrong.** The RFC states: _"bordbuch/status.generated.yaml is generated during mission.validate but not committed to the cache clone."_ It IS committed — by `bordbuch.commit` (RFC-0626), which runs inside `build.prepare` at step 129. The CHANGE_SUMMARY in `build-prepare.ts` line 17 explicitly records: _"RFC-0626: added bordbuch.commit after bordbuch.generate to auto-commit bordbuch projections."_

3. **TypeScript contracts section has wrong API signature.** The RFC proposes:

   ```ts
   await commitAndPushBordbuch(cacheCloneDir, systemId, {
     message: `mission.validate: update bordbuch status for ${missionId}`,
     push: true,
   });
   ```

   The actual API (`bordbuch-io.ts:321-324`) is:

   ```ts
   export async function commitAndPushBordbuch(
     systemDir: string,
     message: string,
   ): Promise<CommitAndPushResult>
   ```

   There is no options object, no `systemId` parameter, and no `push` flag. Push is always attempted.

4. **File system responsibilities table has wrong paths.** The RFC lists `missions/<id>/workpiece/bordbuch/status.generated.yaml` as the file being committed. The actual file is in the cache clone at `<cache-clone>/bordbuch/status.generated.yaml` (see `bordbuch-generate.ts:204`: `const statusPath = join(cachePath, "bordbuch", "status.generated.yaml")`). The workpiece does not have a `bordbuch/` directory.

5. **RFC-0626 is absent from `related[]`.** The RFC lists RFC-0477, RFC-0584, RFC-0597 in `related[]` but not RFC-0626, which is the RFC that added `bordbuch.commit` to the pipeline — the directly relevant prior art.

## Axis B — DNA alignment

No issues. `satisfies[]` is empty, which is acceptable for a `kind: command` RFC. No DNA conflicts.

## Axis C — Ecosystem fit

1. **Redundant commit mechanism.** The RFC proposes calling `commitAndPushBordbuch` after `bordbuch.generate`, but `bordbuch.generate` runs inside the `build.prepare` pipeline, not as a separate call in `mission.validate`. There is no direct `bordbuch.generate` call in `runMissionValidate` to place the proposed code after. The proposed placement ("after bordbuch.generate") would need to be after the entire `build.prepare` pipeline completes — but `bordbuch.commit` already runs inside that pipeline. This would produce two commits for the same files: one from `bordbuch.commit` (pipeline step) and one from `commitAndPushBordbuch` (post-pipeline call).

2. **Distribution reuse path not considered.** `mission.validate` has a distribution reuse path (`mission-materialization-commands.ts:214-297`) where `build.prepare` is skipped entirely when `build-input-hash` matches. In this path, neither `bordbuch.generate` nor `bordbuch.commit` runs. The RFC does not address this path — the proposed `commitAndPushBordbuch` call would either (a) not run in the reuse path, or (b) run but have nothing to commit.

3. **`commitAndPushBordbuch` uses `gitExec` (no retry), while `bordbuch.commit` uses `gitExecWithRetry`.** The existing pipeline step (`bordbuch-commit.ts:57-86`) uses `gitExecWithRetry` with `[12_000, 60_000]` backoff (RFC-0646). The proposed `commitAndPushBordbuch` call uses `gitExec` without retry (`bordbuch-io.ts:329-358`). The RFC's solution would be LESS resilient than the existing mechanism.

## Axis D — Forward-only compliance

No issues. The change is additive and does not propose backward compatibility layers.

## Axis E — Agent-facing policy

1. **Implementation note about no-op case is incorrect.** The RFC states: _"Agents MUST NOT skip the commit when status.generated.yaml is unchanged — commitAndPushBordbuch should handle the no-op case (no changes to commit)."_ But `commitAndPushBordbuch` does NOT handle the no-op case gracefully — `git commit` fails with "nothing to commit" when there are no staged changes, and the function catches this and returns `{ commitSha: null, pushed: false, error: null }` (bordbuch-io.ts:346-348). The RFC would need to check for dirty files before calling `commitAndPushBordbuch`, or the function would silently fail on every reuse-path invocation.

2. **`bordbuchCommitted` output field is underspecified.** The RFC adds a `bordbuchCommitted: boolean` field to the output but does not define it in the `MissionValidateData` type or mention which type file needs updating. The existing `MissionValidateData` type is in `mission-materialization-commands.ts` and the RFC does not reference it.

## Axis F — Pragmatism

1. **The problem is already solved.** `bordbuch.commit` (RFC-0626) already commits `status.generated.yaml` during `build.prepare`. The RFC proposes a redundant mechanism without explaining why the existing one is insufficient. If `bordbuch.commit` sometimes fails (e.g., git lock conflict after retry exhaustion), the RFC should document that scenario and propose fixing `bordbuch.commit` rather than adding a parallel commit path.

2. **`commitAndPushBordbuch` is the wrong helper for this context.** `commitAndPushBordbuch` commits `events.ndjson` + `status.generated.yaml` and pushes. But `events.ndjson` is not modified by `mission.validate` — it's an append-only event log modified by `mission.open`, `mission.close`, `mission.abort`, and `sternsystem.sync`. Calling it from `mission.validate` would attempt to commit `events.ndjson` even when it hasn't changed, producing an empty commit or a silent failure.

3. **If the goal is to push, that should be the stated problem.** `bordbuch.commit` commits but does not push. If the real issue is that bordbuch projections are committed locally but not pushed to the bare repo / external mirrors, the RFC should reframe around adding push to `bordbuch.commit`, not adding a separate `commitAndPushBordbuch` call.

## Axis G — Blind spots

1. **No analysis of why the existing `bordbuch.commit` might fail.** If the operator observes dirty cache clone warnings despite `bordbuch.commit` being in the pipeline, the root cause could be: (a) `bordbuch.commit` fails silently after retry exhaustion, (b) something modifies `status.generated.yaml` after `bordbuch.commit` runs, (c) the distribution reuse path skips the pipeline. The RFC does not investigate any of these.

2. **Concurrent execution not considered.** If two `mission.validate` runs execute concurrently for the same system, both would trigger `bordbuch.commit` and the proposed `commitAndPushBordbuch`, creating git lock conflicts. The RFC mentions git lock conflicts as a risk but does not consider concurrent execution as a cause.

3. **Extra commit churn.** If both `bordbuch.commit` (pipeline step) and the proposed `commitAndPushBordbuch` call run, each `mission.validate` invocation produces two bordbuch commits. The RFC's Risks section mentions "extra commits" but does not acknowledge that the existing `bordbuch.commit` already produces one.

## Questions for the author

1. Why is `bordbuch.commit` (RFC-0626) not mentioned? It already commits `status.generated.yaml` in `build.prepare` at step 129. Is there a specific observed scenario where `bordbuch.commit` fails to clean the cache clone? If so, should the RFC fix `bordbuch.commit` rather than add a parallel mechanism?

2. If the real problem is that `bordbuch.commit` does not push (only commits locally), should the RFC modify `bordbuch.commit` to also push, rather than introducing `commitAndPushBordbuch` (which uses `gitExec` without retry and is less resilient)?

3. What happens in the distribution reuse path (lines 214-297 of `mission-materialization-commands.ts`) where `build.prepare` is skipped? The proposed `commitAndPushBordbuch` call would have nothing to commit — how should this be handled?
