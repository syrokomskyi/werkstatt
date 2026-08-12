---
id: RFC-0818
title: "Fix bordbuch sync lag in external mirror push ordering"
status: accepted
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-12
updatedAt: 2026-08-12
enhancedAt: 2026-08-12
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0477
  - RFC-0472
amendedBy: []
related:
  - RFC-0574
  - RFC-0705
  - RFC-0762
  - RFC-0797
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - sternsystem.sync
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/werkstatt
successSignals:
  - "External mirrors (GitHub) receive the bordbuch sync-entry commit, not just the pre-bordbuch content commit"
  - "refs/mirror/${branch} accurately tracks the SHA that was pushed to external mirrors"
  - "mission.close mirror check no longer produces false positives from the one-commit lag"
nonGoals:
  - "Does not change the star topology (cache → bare → external)"
  - "Does not add retry logic or change non-fatal failure handling"
  - "Does not change bordbuch entry schema or content"
  - "Does not change the mission.close mirror check logic — the fix is in sync ordering, not in the check"
---

# RFC-0818: Fix bordbuch sync lag in external mirror push ordering

## Context

`sternsystem.sync` (RFC-0472, RFC-0477) synchronizes a Sternsystem's mirrors via star topology: cache clone → bare repo → external mirrors. RFC-0477 added a bordbuch `mirror-sync` entry commit after the external push, creating a permanent one-commit lag on external mirrors (e.g. GitHub). The `refs/mirror/${branch}` ref tracks the post-bordbuch SHA, not the SHA actually pushed to external mirrors, causing `mission.close`'s mirror sync check to produce false positives.

## Problem

### Current operation ordering in `sternsystem-sync.ts`

```
1. Push cache clone → bare repo              (bare HEAD = N)
2. Push bare repo → external mirrors         (GitHub = N)
3. Create git bundles from bare repo         (bundle = N)
4. Capture commitSha = bare HEAD             (= N)
5. appendAndCommitBordbuch                   (cache + bare HEAD = N+1)
6. Update refs/mirror/${branch} = bare HEAD  (= N+1)
```

### Result

| Repository              | SHA                         |
| ----------------------- | --------------------------- |
| Cache clone             | N+1                         |
| Bare repo               | N+1                         |
| External (GitHub)       | **N** (lags by 1)           |
| `refs/mirror/${branch}` | N+1 (claims GitHub has N+1) |

### Why this is a problem

- **`refs/mirror/${branch}` lies.** It should track the SHA that was actually pushed to external mirrors. Instead it tracks the post-bordbuch SHA, which never reached external mirrors.
- **`mission.close` mirror check — false positive.** The check compares `refs/mirror/${branch}` with bare HEAD. Both are N+1, so the check passes. But GitHub actually has N.
- **Permanent gap.** Each sync pushes the previous bordbuch commit to GitHub but creates a new one that is not pushed. GitHub always lags by 1 commit.
- **Bundle mirrors also lag.** Bundles created before the bordbuch commit do not include the bordbuch entry.

### Severity

- **Site content:** All mission content reaches GitHub. The lag affects only bordbuch metadata.
- **Disaster recovery:** The missing bordbuch entry can be reconstructed from the workshop repo.
- **`mission.close`:** Mirror check passes but is a false positive.

## Decision

Reorder `sternsystem.sync` operations so that the bordbuch commit happens **before** the external mirror push. This ensures the bordbuch entry commit is included in the push to external mirrors and in bundle creation.

### New ordering

```
1. Push cache clone → bare repo              (bare HEAD = N)
2. Capture commitSha = bare HEAD             (= N)
3. appendAndCommitBordbuch                   (cache + bare HEAD = N+1)
4. Push bare repo → external mirrors         (GitHub = N+1)
5. Create git bundles from bare repo         (bundle = N+1)
6. Update refs/mirror/${branch} = bare HEAD  (= N+1)
```

### Result after fix

| Repository              | SHA   |
| ----------------------- | ----- |
| Cache clone             | N+1   |
| Bare repo               | N+1   |
| External (GitHub)       | N+1 ✓ |
| `refs/mirror/${branch}` | N+1 ✓ |

## Architectural fit

- **No DNA invariant is enforced, protected, or extended by this RFC.** The fix corrects an operational ordering bug in an existing protocol (RFC-0472, RFC-0477). Hence `kind: policy`.
- **RFC-0472 (sternsystem.sync):** Amended — external push moved after bordbuch commit.
- **RFC-0477 (bordbuch git synchronization):** Amended — bordbuch commit now precedes external push.
- **RFC-0574 (star topology):** Unchanged — topology is still cache → bare → external.
- **RFC-0705 / RFC-0762 / RFC-0797 (auto-sync in reconcile/close):** Benefit from the fix — their auto-sync calls now produce accurate `refs/mirror` values.

## Design

### CLI surface

```sh
# Unchanged — no new flags, no new commands
pnpm exec werkstatt run sternsystem.sync --id <system-id>
```

### Output format

The `SternsystemSyncData` output shape is unchanged — no new fields, no removed fields. Downstream consumers (mission.reconcile, mission.close) are not affected.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/sternsystem/sternsystem-sync.ts` | Reorder: bordbuch commit before external push + bundle creation |

### Code change

The change moves the external mirror push loop and bundle creation block to **after** the `appendAndCommitBordbuch` call. The `commitSha` capture stays before the bordbuch commit (it records the content SHA that was synced, not the bordbuch commit SHA).

```ts
// 1. Push cache clone → bare repo (unchanged)
git(cachePath, `push origin ${branchName}`);

// 2. Capture commitSha BEFORE bordbuch commit (records content SHA)
const commitSha = git(bareRepoPath, "rev-parse HEAD");

// 3. Append bordbuch entry + commit + push cache → bare (moved UP)
await appendAndCommitBordbuch(workspaceRoot, id, "mirror-sync", ...);

// 4. Push bare repo → external mirrors (moved DOWN — now includes bordbuch commit)
for (const mirrorUrl of mirrorUrls) {
  git(bareRepoPath, `push ${remoteName} ${refSpec}${tagSpec}`);
}

// 5. Create git bundles from bare repo (moved DOWN — now includes bordbuch commit)
for (const bundleMirror of bundleMirrors) {
  git(bareRepoPath, `bundle create "${bundlePath}" --all`);
}

// 6. Update refs/mirror/${branch} = bare HEAD (unchanged — now accurate)
git(bareRepoPath, `update-ref refs/mirror/${branchName} ${headSha}`);
```

### Failure modes

- **External push fails (non-fast-forward):** Same behavior as before — non-fatal warning, sync continues. `refs/mirror` is still updated to bare HEAD. Residual gap: bare HEAD = N+1 (includes bordbuch commit), external = N, `refs/mirror` = N+1. This is a false positive — same as the current bug, but only on push failure, not on every sync. The operator can detect this by comparing `refs/mirror` with the actual external HEAD.
- **Bordbuch commit or push to bare fails:** Bare HEAD stays at the content SHA (N). External push sends N, `refs/mirror` = N. No false positive — the system is consistent, just missing the bordbuch audit entry for this sync.
- **Bundle creation fails:** Same behavior as before — non-fatal warning.

## Rollout

- **Immediate.** The fix is backward-compatible — no migration needed. The next `sternsystem.sync` call will push the current bordbuch commit (plus any lagging ones) to external mirrors, closing the gap.
- **No config changes.** No new flags, no new commands.
- **Test update.** The existing integration test `sync with external mirrors creates refs/mirror/${branch} matching bare repo HEAD` continues to pass — `refs/mirror` still matches bare HEAD. A new test verifies that the external mirror's HEAD also matches `refs/mirror` after sync.

## Alternatives considered

- **Push bordbuch commit separately to external mirrors after step 5:** Rejected — adds a second external push round-trip. Simpler to move the entire external push after the bordbuch commit.
- **Skip bordbuch entry for sync events:** Rejected — bordbuch audit trail is valuable. The fix preserves the audit trail and ensures it reaches external mirrors.
- **Change `refs/mirror` to track the pre-bordbuch SHA:** Rejected — this would make `refs/mirror` accurate about what was pushed, but external mirrors would still lag. The root cause is the ordering, not the ref tracking.

## Risks

- **External push now includes bordbuch commits.** External mirrors receive more commits per sync than before. This is correct behavior, not a risk.
- **Bundle files are larger.** Bundles now include the bordbuch commit. Negligible size increase (one NDJSON line + status YAML).
- **`commitSha` in bordbuch entry metadata is the content SHA, not the post-bordbuch SHA.** This is semantically correct — the bordbuch entry records what content was synced, not the bordbuch commit itself.

## Acceptance criteria

- [ ] External mirror HEAD matches `refs/mirror/${branch}` after `sternsystem.sync` with external mirrors configured
- [ ] `refs/mirror/${branch}` matches bare repo HEAD after sync (existing test continues to pass)
- [ ] Bundle mirrors include the bordbuch commit (bundle HEAD = bare HEAD after sync)
- [ ] Integration test verifies external mirror HEAD matches `refs/mirror/${branch}`
- [ ] `sternsystem.sync` non-fatal failure handling unchanged (per-mirror failures still non-fatal)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0818` and commit the evidence file in the same commit.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0818 --reason "..." --invariant "DNA-N"` instead of working around it.
