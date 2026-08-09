---
id: RFC-0658
title: "Protect Bordbuch integrity in cache clone from accidental deletion"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-03
updatedAt: 2026-08-03
enhancedAt: 2026-08-03
implementedAt: 2026-08-03
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0584
  - RFC-0614
  - RFC-0626
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
  - DNA-51
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - mission.close
    - mission.materialize
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - site-kernel-handoff
  - site-kernel-checks
successSignals:
  - "mission.close fails with bordbuch validation error when bordbuch is corrupted"
  - "Pre-commit hook in cache clone rejects commits that delete bordbuch/events.ndjson"
  - "build.prepare pipeline includes bordbuch.validate step"
nonGoals:
  - "Does not add bordbuch.validate to leitstand.dev-deploy directly — build.prepare covers it"
  - "Does not modify commitBordbuchProjections — pre-commit hook covers deletion prevention"
  - "Does not protect against bordbuch content truncation (only full deletion is blocked by the hook)"
  - "Does not add bordbuch.validate to SITES_BUILD_PREPARE_DEV_PIPELINE — the dev pipeline is codegen-only for fast materialization; bordbuch.validate is full-pipeline-only, consistent with bordbuch.generate and bordbuch.commit placement"
  - "Does not install the pre-commit hook in workpiece clones — git clone does not copy hooks; the hook targets cache clone mutations only"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0658: Protect Bordbuch integrity in cache clone from accidental deletion

## Context

During mission warpgogol-com-m000026 (2026-08-02), a manual `git add -A` in the cache clone (`../systems-cache/warpgogol-com/`) staged the deletion of `bordbuch/events.ndjson` along with 50+ content files. The resulting commit (`c5f9cc7`) erased all 10 bordbuch events, including the `mission-open` event for m000026. When `mission.close` subsequently appended a `mission-close` event, it wrote into an empty file — creating an `orphan-mission-close` violation (no preceding `mission-open`). The next `mission.open` (for m000027) detected the violation and required `bordbuch.repair` to proceed.

The bordbuch (`systems/<id>/bordbuch/events.ndjson`) is an append-only hash-chained log that records every mission and release lifecycle event (DNA-46). Its integrity is fundamental to the Sternsystem's audit trail. Currently, no mechanism prevents accidental deletion of bordbuch files in the cache clone outside of the `mission.reconcile` merge path (RFC-0584 handles delete-modify conflicts during reconcile, but not manual commits).

## Problem

Three gaps in bordbuch integrity enforcement exist:

1. **No deletion guard in cache clone.** The cache clone (`mirrors[0]`) is a non-bare git repo where operators and agents can make commits. Nothing prevents a `git add -A` from staging the deletion of `bordbuch/events.ndjson`. RFC-0584 auto-resolves bordbuch delete-modify conflicts during `mission.reconcile` merges, but this only covers the merge path — manual commits bypass it entirely.

2. **No direct bordbuch validation in `mission.close`.** `mission.close` runs `mission.validate` inline (RFC-0593), which runs `build.prepare`. However, RFC-0635 allows `mission.validate` to skip the build cycle (including `build.prepare`) when the build-input-hash matches (distribution reuse). In that skip path, bordbuch is not validated. A close event can be appended to a corrupted bordbuch, producing orphan-mission-close violations that are only discovered on the next `mission.open`.

3. **No bordbuch validation in the `build.prepare` pipeline.** `bordbuch.validate` exists in the `sites-check-author` pipeline (`packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`), which runs after `astro build`. But `build.prepare` — which runs before `astro build` and is the first pipeline to execute during `mission.validate` and `mission.build` — does not include `bordbuch.validate`. A corrupted bordbuch is not detected until `sites-check-author` or `mission.open`, which may be much later than the corruption event.

## Decision

The Werkstatt installs a pre-commit hook in every Sternsystem cache clone during `mission.materialize` that rejects commits deleting `bordbuch/events.ndjson`. Additionally, `mission.close` validates bordbuch integrity before appending the close event (hard fail on violations), and `build.prepare` includes a `bordbuch.validate` step that fails the pipeline on hash-chain or lifecycle violations.

## Architectural fit

- **DNA-46 (Mission lifecycle):** Bordbuch is the append-only hash-chained log recording every mission event. This RFC strengthens enforcement of its integrity beyond the existing `bordbuch.validate` and `bordbuch.repair` commands.
- **DNA-51 (Werkstatt consistency primitives):** The pre-commit hook is a new consistency primitive for cache clone mutations, complementing the existing lock, idempotency, and atomic staging primitives.
- **RFC-0584 / RFC-0614:** These RFCs handle bordbuch conflict auto-resolution during `mission.reconcile` merges. This RFC covers a different attack surface — manual commits in the cache clone outside of reconcile.
- **RFC-0626:** Introduced `bordbuch.commit` for auto-committing bordbuch projections. This RFC does not modify `bordbuch.commit` — the pre-commit hook is git-level and covers all commit paths.
- **Site OS operator model:** The pre-commit hook is installed transparently during `mission.materialize` — no operator action required. The `bordbuch.validate` step in `build.prepare` follows the standard pipeline step pattern.

## Design

### Pre-commit hook installation

During `mission.materialize`, after the cache clone is synchronized, the kernel writes a `pre-commit` hook to `<cache-clone>/.git/hooks/pre-commit`:

```bash
#!/bin/sh
# Warpgogol bordbuch integrity guard (RFC-0658)
# Rejects commits that delete bordbuch/events.ndjson
if git diff --cached --name-status --diff-filter=D | grep -q 'bordbuch/events.ndjson'; then
  echo "ERROR: refusing to delete bordbuch/events.ndjson (RFC-0658)" >&2
  echo "If you need to reset bordbuch, use bordbuch.repair instead." >&2
  exit 1
fi
```

The hook is idempotent — `mission.materialize` overwrites it on each materialization, ensuring it stays current even if the cache clone is recreated. The hook is installed only in the cache clone (`mirrors[0]`), not in workpiece clones — `git clone` (used by `mission.materialize` to create the workpiece, RFC-0568) does not copy hooks. This is correct behavior: the hook targets cache clone mutations where manual `git add -A` can occur. Workpiece clones are ephemeral and reconciled via `mission.reconcile`.

### bordbuch.validate step in build.prepare

A new pipeline step `bordbuch.validate` is added to `SITES_BUILD_PREPARE_PIPELINE` (full pipeline only), after `bordbuch.generate` and before `bordbuch.commit`. It is NOT added to `SITES_BUILD_PREPARE_DEV_PIPELINE` — the dev pipeline is codegen-only and excludes bordbuch steps for fast materialization. The step calls the existing `validateBordbuch` function from `bordbuch-io.ts` and fails the pipeline on any violation.

Note: `bordbuch.validate` validates `events.ndjson` (the raw hash-chained ledger), not the generated projections. The ordering relative to `bordbuch.generate` and `bordbuch.commit` is not significant for correctness — `bordbuch.validate` reads `events.ndjson` which is not modified by either of those steps. The step is placed between them for logical grouping with other bordbuch steps.

### bordbuch validation in mission.close

`runMissionClose` calls `validateBordbuch` directly before appending the `mission-close` event. This is needed because `mission.close` already runs `mission.validate` inline (RFC-0593), but RFC-0635 allows `mission.validate` to skip `build.prepare` when the build-input-hash matches (distribution reuse). In that skip path, the `bordbuch.validate` pipeline step is not executed. The direct `validateBordbuch` call provides defense-in-depth for the distribution-reuse skip path. If violations are found, it returns an error result with `exitCode: 1` and a summary listing the violations. The operator must run `bordbuch.repair` first.

### CLI surface

No new CLI commands. The changes are internal to existing commands:

```sh
# mission.materialize installs the pre-commit hook transparently
pnpm exec werkstatt run mission.materialize --mission <id>

# mission.close now validates bordbuch before closing
pnpm exec werkstatt run mission.close --mission <id>

# build.prepare now includes bordbuch.validate step
pnpm exec werkstatt run mission.build --mission <id>
```

### TypeScript contracts

```ts
// New function for hook installation (in bordbuch-io.ts or new bordbuch-hook.ts)
interface BordbuchHookResult {
  installed: boolean;
  hookPath: string;
  systemId: string;
}

async function installBordbuchPreCommitHook(
  cacheClonePath: string,
  systemId: string,
): Promise<BordbuchHookResult>;

// mission.close validation addition (added to existing MissionCloseData interface)
interface MissionCloseData {
  // ... existing fields ...
  bordbuchValidation: {
    violations: BordbuchViolation[];
    checked: boolean;
  };
}

// build.prepare pipeline step registration
const bordbuchValidateStep: PipelineStep = {
  name: "bordbuch.validate",
  module: "@warpgogol/site-kernel-handoff",
  handler: runBordbuchValidateStep,
  // runs after bordbuch.generate, before bordbuch.commit
};
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `<cache-clone>/.git/hooks/pre-commit` | Created/overwritten by `mission.materialize` |
| `systems/<id>/bordbuch/events.ndjson` | Read by `bordbuch.validate` step; never modified by this RFC |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` | `validateBordbuch` already exists; `installBordbuchPreCommitHook` added |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | `runMissionMaterialize` calls hook installer after cache clone sync |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | `runMissionClose` calls `validateBordbuch` before appending close event |
| `packages/os/site-kernel-handoff/src/pipeline/build-prepare.module.ts` | New `bordbuch.validate` step registered |

### Output format

`mission.close` with bordbuch validation failure:

```json
{
  "command": "mission.close",
  "exitCode": 1,
  "data": {
    "bordbuchValidation": {
      "checked": true,
      "violations": [
        {
          "rule": "orphan-mission-close",
          "message": "mission-close for 'warpgogol-com-m000026' has no preceding mission-open"
        }
      ]
    }
  },
  "summary": "[mission.close] bordbuch validation failed: 1 violation(s) — run bordbuch.repair first"
}
```

`build.prepare` with bordbuch validation failure:

```json
{
  "command": "build.prepare",
  "exitCode": 1,
  "data": {
    "step": "bordbuch.validate",
    "violations": [
      {
        "rule": "hash-chain-gap",
        "message": "expected previousHash 'sha256:abc...', got 'sha256:def...'",
        "eventId": "event-000005"
      }
    ]
  },
  "summary": "[build.prepare] bordbuch.validate: 1 violation(s) found"
}
```

### Failure modes

- **Pre-commit hook blocks deletion:** `git commit` exits with code 1 and a message pointing to `bordbuch.repair`. The staged deletion remains in the index — the operator must `git reset HEAD bordbuch/events.ndjson` to unstage.
- **mission.close blocks on violation:** Returns `exitCode: 1` with violation details. Operator runs `bordbuch.repair --system <id>` then retries `mission.close`.
- **build.prepare blocks on violation:** Pipeline stops at `bordbuch.validate` step. The build does not proceed until bordbuch is repaired.
- **Pre-commit hook missing (old cache clones):** No error — the hook is installed on the next `mission.materialize`. The `bordbuch.validate` step in `build.prepare` and the validation in `mission.close` provide defense-in-depth for cache clones without the hook.

## Rollout

- **Default behavior: fail-hard from day one.** All three measures are active immediately — no grace period, no opt-in. Bordbuch integrity is a correctness concern, not a style preference.
- **Existing cache clones:** The pre-commit hook is installed on the next `mission.materialize`. Until then, `bordbuch.validate` in `build.prepare` and `mission.close` provide defense-in-depth.
- **New Sternsystems:** The hook is installed during the first `mission.materialize` for any new Sternsystem.
- **No migration path needed:** The `validateBordbuch` function and `bordbuch.repair` command already exist. This RFC adds call sites, not new validation logic.
- **Pipeline integration:** `bordbuch.validate` is added to `SITES_BUILD_PREPARE_PIPELINE` (full pipeline only) alongside `bordbuch.generate` and `bordbuch.commit`. It is NOT added to `SITES_BUILD_PREPARE_DEV_PIPELINE` — the dev pipeline excludes bordbuch steps for fast materialization.

## Alternatives considered

- **Double-check in `commitBordbuchProjections`:** Add a guard in `bordbuch.commit` that verifies `bordbuch/events.ndjson` is not staged for deletion. Rejected — the pre-commit hook is git-level and covers all commit paths, including manual `git add -A`. Adding a second check in `bordbuch.commit` is redundant and does not cover the actual failure mode (manual commits outside of `bordbuch.commit`).

- **Git attributes filter instead of pre-commit hook:** Use `.gitattributes` with a filter to prevent bordbuch modifications. Rejected — git filters operate on content, not on file deletion. A `clean`/`smudge` filter cannot prevent `git rm`.

- **bordbuch.validate in `leitstand.dev-deploy` only:** Add validation after build in dev-deploy. Rejected — this only covers the dev-deploy path. Adding to `build.prepare` covers all paths (dev-deploy, mission.validate, mission.build) with a single integration point.

- **Soft warn in `mission.close`:** Log bordbuch violations as warnings but allow close to proceed. Rejected — this allows corrupted bordbuch to persist and accumulate more events. Hard fail is consistent with `mission.open`, which already blocks on violations.

## Risks

- **Pre-commit hook not present on existing cache clones:** Until the next `mission.materialize`, existing cache clones do not have the hook. Defense-in-depth from `build.prepare` and `mission.close` validation covers this gap, but a manual `git add -A` + commit could still delete bordbuch in the interim.

- **Pre-commit hook bypassed with `--no-verify`:** `git commit --no-verify` skips hooks. This is an accepted limitation — `--no-verify` is an explicit operator override. The `bordbuch.validate` step in `build.prepare` catches the corruption on the next build.

- **False positive on `bordbuch.repair`:** `bordbuch.repair` rewrites `events.ndjson` but does not delete it. The hook only checks for `D` (deletion) status, so `bordbuch.repair` is unaffected.

- **Performance:** `validateBordbuch` reads and parses all ndjson lines, computing SHA-256 hashes. For systems with hundreds of events, this adds <100ms to `build.prepare` and `mission.close` — negligible compared to the 2+ minute build pipeline.

- **Agent misinterpretation:** Agents might attempt to bypass the pre-commit hook with `--no-verify`. Agents MUST NOT use `--no-verify` — if the hook blocks a commit, the agent must address the root cause (run `bordbuch.repair`) rather than bypassing the guard.

## Acceptance criteria

- [x] `installBordbuchPreCommitHook` function exists and writes a valid pre-commit hook to `<cache-clone>/.git/hooks/pre-commit` (evidence: packages/os/site-kernel-handoff/src/bordbuch/bordbuch-hook.ts:46, bordbuch-hook.test.ts:32)
- [x] `mission.materialize` calls `installBordbuchPreCommitHook` after cache clone synchronization (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:622)
- [x] Pre-commit hook rejects `git rm bordbuch/events.ndjson` + `git commit` with a clear error message (evidence: packages/os/site-kernel-handoff/src/bordbuch/bordbuch-hook.ts:28, hook script uses diff-filter=D + exit 1)
- [x] `mission.close` calls `validateBordbuch` before appending the close event and returns `exitCode: 1` on violations (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:272, rfc-0658-mission-close-bordbuch-validate.test.ts:155)
- [x] `build.prepare` pipeline includes a `bordbuch.validate` step that fails on hash-chain or lifecycle violations (evidence: packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:127, build-prepare-pipeline.test.ts:80)
- [x] Unit test: pre-commit hook blocks deletion of `bordbuch/events.ndjson` (evidence: packages/os/site-kernel-handoff/src/tests/bordbuch-hook.test.ts, 6 tests pass)
- [x] Unit test: `mission.close` fails when bordbuch has `orphan-mission-close` violation (evidence: packages/os/site-kernel-handoff/src/tests/rfc-0658-mission-close-bordbuch-validate.test.ts:155)
- [x] Unit test: `build.prepare` fails when bordbuch hash chain is broken (evidence: packages/os/site-kernel-checks/src/tests/build-prepare-pipeline.test.ts:80, bordbuch.validate step in pipeline catches hash-chain violations via validateBordbuch)
- [x] `bordbuch.repair` is not blocked by the pre-commit hook (it rewrites, not deletes) (evidence: packages/os/site-kernel-handoff/src/bordbuch/bordbuch-hook.ts:28, hook script uses diff-filter=D which only triggers on deletion, not modification)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0658 --json exits 0 with 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT use `git commit --no-verify` to bypass the pre-commit hook. If the hook blocks a commit, the agent must address the root cause (e.g., run `bordbuch.repair`) rather than bypassing the guard.
- Agents MUST NOT weaken or remove the pre-commit hook or the `bordbuch.validate` pipeline step without a new RFC that supersedes this RFC.
- The pre-commit hook is installed by `mission.materialize` — agents MUST NOT manually edit or delete `.git/hooks/pre-commit` in cache clones.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
