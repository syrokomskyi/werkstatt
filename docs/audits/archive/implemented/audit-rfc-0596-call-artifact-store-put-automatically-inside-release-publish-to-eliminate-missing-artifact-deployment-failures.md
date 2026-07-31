---
rfcId: RFC-0596
auditId: AUDIT-RFC-0596-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0596

## Verdict: Needs revision

The RFC solves a real operational gap (manual `artifact.store.put` between `release.publish` and `leitstand.propagate`), but has two critical design flaws that will cause runtime failures: (1) a lock conflict because `release.publish` and `artifact.store.put` both acquire `release:${releaseId}` and the lock is not reentrant, and (2) the claim that re-running `release.publish` is safe is false because the state check rejects already-published releases. Several field name mismatches between the RFC's TypeScript contracts and the actual `ArtifactStorePutData` interface will also cause implementation confusion.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **Field name mismatch: `artifactUri` vs `uri`**. The TypeScript contract uses `artifactResult.data.artifactUri` and `artifactResult.data.distArtifactHash`, but the actual `ArtifactStorePutData` interface (`packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts:72-83`) has `uri`, not `artifactUri`. The implementation will fail to compile or silently access `undefined`.

2. **Field name mismatch: `sizeBytes` vs `byteSize`**. The output format shows `"sizeBytes": 2345678`, but the actual interface has `byteSize`. The RFC's output shape does not match the real data structure.

3. **URI format mismatch**. The CLI surface shows `artifact-store://warpgogol-com-r000003`, but `runArtifactStorePut` returns `local://${manifestPath}` (line 195 of `artifact-store-commands.ts`). The RFC's URI scheme is aspirational, not grounded in the current implementation.

4. **Output shape change not described**. The RFC's output format shows a nested `artifact: { uri, distArtifactHash, sizeBytes }` object, but the current `ReleasePublishData` interface (`release-commands.ts:493-500`) has flat `artifactUri: string | null` and `distVerified: boolean`. The RFC does not explicitly describe how `ReleasePublishData` is being extended or whether `distVerified` is being removed.

5. **Failure mode contradiction**. The failure mode section says "dist directory missing: `release.publish` throws before state transition. The release remains `prepared`, not `published`." But the TypeScript contract places the dist check in the "NEW: store artifact inline after state transition" section. The existing code already checks dist existence before the state transition (`release-commands.ts:529-535`), so the RFC's proposed dist check is redundant and the failure mode description is contradictory.

6. **Existing dist check not acknowledged**. The RFC's TypeScript contract shows a dist existence check as new code, but `release.publish` already has this check at lines 529-535. The RFC should clarify that only the artifact storage call is new, not the dist check.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-52]` is correct — the RFC ensures every published release has an artifact store entry, directly enforcing DNA-52's "durable, content-addressed records" requirement. `related: [DNA-48]` is also correct — DNA-48 condition (5) requires "the release artifact is stored and hash-verified", which this RFC makes automatic.

## Axis C — Ecosystem fit

1. **AGENTS.md target not specified**. The acceptance criterion says "AGENTS.md updated with the automatic artifact storage behavior" but does not specify which AGENTS.md file. The correct target is `packages/os/site-kernel-handoff/AGENTS.md`, which already documents `artifact.store.put` behavior in the Leitstand section.

2. **`release.validate` not mentioned**. `release.validate` (`release-commands.ts:626-667`) currently checks `artifactPresent` as `existsSync(distDir) || manifest.artifact !== null`. The RFC should consider whether `release.validate` should enforce that published releases have a non-null `artifact` field, closing the gap further.

## Axis D — Forward-only compliance

No issues. The RFC does not propose a compatibility shim, does not deprecate the standalone `artifact.store.put` command, and does not create a dual-path. The standalone command remains available as a fallback.

## Axis E — Agent-facing policy

No issues. The RFC has explicit implementation notes prohibiting `--skip-artifact-store` flags, prohibiting calling `artifact.store.put` before the state transition, and requiring supersede escalation on invariant conflicts. The status gate is respected — the RFC is in `draft` and does not self-authorize implementation.

## Axis F — Pragmatism

1. **CRITICAL — Lock conflict not addressed**. `release.publish` acquires `release:${releaseId}` lock at `release-commands.ts:567`. `artifact.store.put` also acquires `release:${releaseId}` lock at `artifact-store-commands.ts:104-110`. The lock implementation (`packages/forge/os/werkstatt/handlers/lock.ts:48-93`) is NOT reentrant — it checks if the lock file exists and throws if it's not stale, regardless of whether the same process or operation holds it. Calling `runArtifactStorePut` from inside `runReleasePublish` will throw `[werkstatt.lock] lock 'release:<id>' held by operation '<opId>'`. The RFC's TypeScript contract will not work as written. The RFC must either: (a) extract the core storage logic from `runArtifactStorePut` into a lock-free helper that `release.publish` calls directly, or (b) release the lock before calling `runArtifactStorePut` and re-acquire after, or (c) pass a flag to skip lock acquisition. Option (a) is the cleanest.

## Axis G — Blind spots

1. **CRITICAL — Re-publish claim is false**. The RFC states "Re-running `release.publish` is safe (idempotent artifact storage)" in both the failure modes section and the acceptance criteria. But `release.publish` checks `state !== "prepared"` at line 517 and throws if the state is `published`. If `artifact.store.put` fails after the state transition, the release is `published` but the artifact is not stored. Re-running `release.publish` will fail with "release is not prepared (state: published)". The operator must run `artifact.store.put` manually in this case. The RFC must correct this claim and update the acceptance criterion.

2. **Partial failure recovery unclear**. The failure mode for `artifact.store.put` failing after state transition says the operator can "re-run `release.publish` (idempotent)" or "run `artifact.store.put` manually". As noted above, re-running `release.publish` is not possible. The only recovery is manual `artifact.store.put`. The RFC should state this clearly and consider whether the state transition should be moved after successful artifact storage (contradicting the implementation note that says "MUST NOT call `artifact.store.put` before the state transition"), or whether a re-publish path should be added for the `published` state.

3. **`systemId` derivation bug in existing `artifact.store.put`**. The existing `runArtifactStorePut` derives `systemId` as `releaseId.split("-m")[0]` (`artifact-store-commands.ts:162`), but release IDs use `-r` (e.g., `warpgogol-com-r000003`), not `-m`. There is no `-m` substring in a release ID, so `split("-m")[0]` returns the entire release ID, not the system ID. This is an existing bug, but the RFC should acknowledge it since `release.publish` will now call this function automatically, making the bug more visible. The artifact manifest's `systemId` field will contain the release ID instead of the system ID.

## Questions for the author

1. How will you resolve the lock conflict? `release.publish` holds `release:${releaseId}` and `artifact.store.put` tries to acquire the same scope. Will you extract a lock-free `storeArtifactCore` helper, or use a different approach?

2. If `artifact.store.put` fails after the state transition, the release is `published` but not deployable. Re-running `release.publish` fails because the state is `published`. Should the RFC add a re-publish path for already-published releases, or should the state transition be moved after successful artifact storage?

3. The `ReleasePublishData` interface currently has `artifactUri: string | null` and `distVerified: boolean`. The RFC's output format shows a nested `artifact` object. Is this a breaking change to the `--json` output shape? Should `release.publish` consumers be updated?
