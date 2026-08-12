---
id: RFC-0822
title: "Persist workpiece env files in cache clone across missions"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-12
updatedAt: 2026-08-12
enhancedAt: 2026-08-12
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  # Reference DNA invariants, anti-patterns, spec docs, or other RFCs:
  # - DNA-1
  # - AP-3
  # - RFC-0005
  # - PAGE-MANDATORY-ARTIFACTS
  # - COMPONENT-THREE-WAY-MIRROR
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
  - DNA-47
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
    - sternsystem.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "Operator-filled .env files survive mission close and are restored in the next mission's workpiece without manual re-entry"
  - "mission.close logs the count of env files copied to cache clone"
  - "mission.materialize logs a warning when no .env files are found in cache clone"
  - "sternsystem.validate emits ENV-PERSIST-01 warning when cache clone lacks .env but workpiece has one"
nonGoals:
  - "No git commit of .env files — they remain gitignored in cache clone"
  - "No merge of .env with .env.example — simple file copy only"
  - "No encryption of .env files in cache clone — cache clone is a local protected store"
  - "No copying at mission.abort — only mission.close preserves env files"
  - "No changes to .env.example contract (DNA-40)"
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

# RFC-0822: Persist workpiece env files in cache clone across missions

## Context

Operator-filled `.env` files in a mission workpiece contain runtime secrets (API tokens, Supabase keys, Upstash QStash credentials, Telegram bot tokens). These files are `.gitignore`d in both the workpiece and cache clone — they never enter git history. The current `mission.materialize` code preserves `.env` from the **old workpiece** before `atomicMoveDir` replaces it (line 1154–1196 of `mission-materialize.ts`), but this only works for **re-materialization within the same mission**. When a mission is closed and a new mission is opened for the same Sternsystem, the new workpiece is materialized from the cache clone — which does not contain `.env`. The old workpiece is at a different path (`missions/<old-id>/workpiece/`), and the preservation code reads from `missions/<current-id>/workpiece/` (the new mission's workpiece), so it finds nothing to preserve. The operator must re-enter all secrets manually for every new mission.

The cache clone (`systems-cache/<id>/`) is a local, protected store that persists across missions. It already holds `.env.example` (committed) and is the canonical source for the next materialization. Copying `.env*` files into the cache clone at `mission.close` and reading them back at `mission.materialize` closes the gap.

## Problem

DNA-46 (Mission lifecycle) and DNA-47 (Materialization) define the mission lifecycle and materialization flow, but neither covers the persistence of operator-filled secrets across missions. The current preservation code in `mission-materialize.ts` (line 1154–1196) reads `.env` from the old workpiece path (`missions/<current-id>/workpiece/.env`) — which is the **new** mission's workpiece, not the old one. After `mission.close`, the old workpiece sits at `missions/<old-id>/workpiece/` and is never consulted. The cache clone at `systems-cache/<id>/` has no `.env` (it is gitignored and never copied there). Result: every new mission starts with an empty `.env` from `.env.example`, and the operator must re-enter all secrets. This was discovered during warpgogol-com-m000052 when integration secrets (Upstash QStash, Telegram, Supabase buffer) had to be manually re-filled after each materialization.

## Decision

`mission.close` copies all `.env*` files from the workpiece to the cache clone (untracked, not committed) as a final step in the existing artifact-copy block (alongside `.cache/` and `.materialization-state.json` copy, lines 687–846 of `mission-close.ts`). `mission.materialize` reads `.env*` files from the cache clone and restores them into the new workpiece after `atomicMoveDir`, replacing the current preservation code that reads from the old workpiece path. After restoring file contents, `PUBLIC_IMAGE_PROVIDER` is set to `build-portable` in each restored `.env` file, preserving the invariant from the current code (line 1191–1195). `sternsystem.validate` emits a non-blocking `ENV-PERSIST-01` warning when the cache clone lacks `.env` files but a workpiece has them (indicating a close did not persist secrets).

## Architectural fit

- **DNA-46 (Mission lifecycle):** Extends `mission.close` with a secret-persistence step. The cache clone is already the canonical inter-mission store — this RFC adds `.env*` files to the set of untracked artifacts it carries, alongside `.cache/video/` and `.cache/content-regression/` (RFC-0597).
- **DNA-47 (Materialization):** Extends `mission.materialize` to restore `.env*` from the cache clone instead of the old workpiece path. The current preservation code (line 1154–1196) is replaced, not duplicated.
- **DNA-40 (Env-example contract):** Not modified. `.env.example` remains the committed template; `.env` remains gitignored. This RFC adds an untracked copy in the cache clone, not a git-tracked one.
- **Cache clone topology (RFC-0574):** `mirrors[0]` is the non-bare cache clone. `.env*` files are written to its working directory, not committed. External mirrors (`mirrors[2+]`) never receive `.env*` — they are git remotes, and untracked files do not propagate via `git push`.

## Design

### CLI surface

No new commands. The change is internal to three existing commands:

```sh
# mission.close — now copies .env* to cache clone as a final step
pnpm exec werkstatt run mission.close --mission=<id>

# mission.materialize — now restores .env* from cache clone (replaces old-workpiece preservation)
pnpm exec werkstatt run mission.materialize --mission=<id>

# sternsystem.validate — now emits ENV-PERSIST-01 warning
pnpm exec werkstatt run sternsystem.validate --id=<id>
```

### TypeScript contracts

```ts
/** Result of copying .env* files from workpiece to cache clone. */
interface EnvPersistResult {
  copied: string[];      // filenames copied, e.g. [".env", ".env.dev"]
  skipped: string[];     // filenames that did not exist in workpiece
}

/**
 * Copy all .env* files from the workpiece directory to the cache clone directory.
 * Called during mission.close. Files are written to the cache clone working
 * directory (untracked, not git-added). Existing files in cache clone are
 * overwritten.
 */
async function persistEnvFilesToCacheClone(
  workpieceDir: string,
  cacheCloneDir: string,
): Promise<EnvPersistResult>;

/**
 * Restore all .env* files from the cache clone directory to the workpiece directory.
 * Called during mission.materialize after atomicMoveDir. Files that do not
 * exist in cache clone are skipped — the workpiece already has .env.example
 * from the staging clone.
 *
 * After restoring file contents, each restored .env file has its
 * PUBLIC_IMAGE_PROVIDER line replaced with `PUBLIC_IMAGE_PROVIDER=build-portable`,
 * preserving the invariant enforced by the current materialize code (line 1191–1195).
 * This ensures the build always uses the build-portable image provider regardless
 * of what the operator may have manually set in the cache clone .env.
 */
async function restoreEnvFilesFromCacheClone(
  cacheCloneDir: string,
  workpieceDir: string,
): Promise<EnvPersistResult>;
```

The glob pattern for env files is `.env*` with the following exclusions:

- `.env.example` — committed template, already in cache clone via git
- `.env.*.example` (e.g. `.env.dev.example`) — committed templates, already in cache clone via git
- Skip directories, only copy files

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<id>/workpiece/.env*` | Source — read during mission.close |
| `systems-cache/<id>/.env*` | Destination — written during mission.close, read during mission.materialize |
| `missions/<new-id>/workpiece/.env*` | Destination — written during mission.materialize after atomicMoveDir |
| `packages/werkstatt/src/mission/mission-close.ts` | Modified — add persistEnvFilesToCacheClone call |
| `packages/werkstatt/src/mission/mission-materialize.ts` | Modified — replace old-workpiece preservation with restoreEnvFilesFromCacheClone |
| `packages/werkstatt/src/sternsystem/sternsystem-validate.ts` | Modified — add ENV-PERSIST-01 warning |
| `packages/werkstatt/src/mission/env-persist.ts` | New module — persistEnvFilesToCacheClone, restoreEnvFilesFromCacheClone, glob logic |

### Output format

`mission.close` log output:

```
  Persisted 2 .env file(s) to cache clone: .env, .env.dev
```

`mission.materialize` log output (success):

```
  Restored 2 .env file(s) from cache clone: .env, .env.dev
```

`mission.materialize` log output (no env files in cache clone):

```
  Warning: no .env files found in cache clone — using .env.example template. Operator must fill secrets manually.
```

`sternsystem.validate` warning in `--json` output (uses the existing `SternsystemValidateData.warnings` shape `{ systemId, field, message }`):

```json
{
  "command": "sternsystem.validate",
  "status": "ok",
  "warnings": [
    {
      "systemId": "<id>",
      "field": "ENV-PERSIST-01",
      "message": "Cache clone for system '<id>' has no .env files but workpiece has 1 — run mission.close to persist secrets"
    }
  ]
}
```

### Failure modes

- **mission.close — copy failure:** Non-fatal. `logger.warn` with the error message. Close proceeds — secrets may be lost, but the mission closes. Rationale: a file system error should not block mission closure.
- **mission.materialize — restore failure:** Non-fatal. `logger.warn` with the error message. Materialize proceeds with `.env.example` template. Operator sees the warning and fills secrets manually.
- **mission.materialize — no .env in cache clone:** Warning log. Not an error — first mission or never filled. Workpiece uses `.env.example`.
- **sternsystem.validate — ENV-PERSIST-01:** Non-blocking warning. Does not affect exit code. Visible in `--json` output and pretty log.

## Rollout

- **Default behavior:** Active from implementation. No opt-in flag — every `mission.close` copies `.env*`, every `mission.materialize` restores them.
- **Existing missions:** Missions opened before implementation will not have `.env*` in cache clone. `mission.materialize` logs a warning and the operator fills `.env` manually. After the first close with the new code, subsequent missions get automatic restoration.
- **No migration step:** The change is additive — it adds a copy step to close and changes the source path in materialize. No data migration, no schema change.
- **Pipeline integration:** No pipeline changes. `sternsystem.validate` warning is advisory — not integrated into `build.check` or any blocking pipeline.

## Alternatives considered

1. **Git-commit `.env` in cache clone with `git add -f` (force-add).** Rejected: secrets in git history pose a security risk. Cache clone pushes to bare repo and external mirrors — secrets would propagate to all mirrors, including backup endpoints outside the operator's control.
2. **Merge `.env` with `.env.example` during restore.** Rejected by the operator: adds complexity. If new variables are needed, the operator adds them directly in the workpiece `.env`, and the next `mission.close` copies the updated file. Simple copy is sufficient.
3. **Copy at `mission.reconcile` instead of `mission.close`.** Rejected: reconcile pushes commits to bare repo — `.env` is gitignored and would not propagate. Close is the natural finalization point.
4. **Preserve via old workpiece path fallback.** Rejected by the operator: "we don't dig into old workpieces." Cache clone is the single source of truth for inter-mission state.
5. **Copy at `mission.abort` too.** Rejected by the operator: abort means cancellation, secrets are not preserved.

## Risks

- **Secret exposure via cache clone backup:** If an external mirror (`mirrors[2+]`) is a backup endpoint that copies the entire cache clone directory (not just git), `.env` files could leak. Mitigation: external mirrors are git remotes — `git push` does not transfer untracked files. Operators should verify that backup scripts do not `rsync` the cache clone directory.
- **Stale secrets:** If an operator removes a secret from `.env` in the workpiece but the cache clone still has the old value, the next materialize restores the stale value. Mitigation: `mission.close` always overwrites cache clone `.env*` with the workpiece version — the last close wins.
- **Agent confusion:** Agents may try to `git add -f .env` in the cache clone. Mitigation: implementation notes explicitly forbid git-committing `.env`.
- **ENV-PERSIST-01 false positives:** `sternsystem.validate` may warn when a system has never had secrets (e.g., a brand-new Sternsystem). This is expected — the warning is advisory and non-blocking.

## Acceptance criteria

- [x] `persistEnvFilesToCacheClone` and `restoreEnvFilesFromCacheClone` implemented in `packages/werkstatt/src/mission/env-persist.ts` (evidence: packages/werkstatt/src/mission/env-persist.ts:62-118)
- [x] `mission.close` calls `persistEnvFilesToCacheClone` in the final artifact-copy block (alongside `.cache/` copy, lines 687–846) and logs copied file count (evidence: packages/werkstatt/src/mission/mission-close.ts:727-747)
- [x] `mission.materialize` calls `restoreEnvFilesFromCacheClone` after `atomicMoveDir`, replacing the old-workpiece preservation code (line 1154–1196) (evidence: packages/werkstatt/src/mission/mission-materialize.ts:1155-1184)
- [x] `mission.materialize` logs a warning when no `.env*` files are found in cache clone (evidence: packages/werkstatt/src/mission/mission-materialize.ts:1169-1171)
- [x] `sternsystem.validate` emits `ENV-PERSIST-01` warning when cache clone lacks `.env` but workpiece has one (evidence: packages/werkstatt/src/sternsystem/sternsystem-validate.ts:440-461)
- [x] Unit tests cover: copy, restore, missing files, glob exclusion of `.env.example` (evidence: packages/werkstatt/src/tests/env-persist.test.ts, 10 tests pass)
- [x] `AGENTS.md` updated with env-persistence policy in the mission lifecycle section (evidence: AGENTS.md:25-31)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0822 --json → 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT `git add -f` `.env` files in the cache clone — they are untracked by design. Force-adding secrets to git history is a security violation.
- Agents MUST NOT read `.env*` from old workpiece paths (`missions/<old-id>/workpiece/`) during materialization. The cache clone is the single source of truth.
- Agents MUST NOT copy `.env.example` — it is git-tracked and arrives via `git clone` from the cache clone.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
