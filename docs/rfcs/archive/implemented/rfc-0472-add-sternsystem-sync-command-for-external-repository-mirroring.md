---
id: RFC-0472
title: "Add sternsystem.sync command for external repository mirroring"
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
createdAt: 2026-07-20
updatedAt: 2026-07-20
enhancedAt: 2026-07-20
implementedAt: 2026-07-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0477
  - RFC-0480
related:
  - DNA-44
  - DNA-45
  - RFC-0354
  - RFC-0356
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-44
  - DNA-45
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
commands:
  proposed: []
  added:
    - sternsystem.sync
  changed:
    - sternsystem.validate
    - sternsystem.register
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/ontology"
  - "@gogol/site-kernel-handoff"
successSignals:
  - "Operator can sync local bare repo to GitHub with a single command"
  - "Bordbuch records mirror-sync events for audit trail"
  - "sternsystem.validate warns when mirror remote is missing or mismatched"
nonGoals:
  - "Does not replace the canonical origin (repo field) with GitHub"
  - "Does not automate sync after mission.reconcile — sync is manual"
  - "Does not support multiple mirror repositories (single mirror string for now)"
  - "Does not use git push --mirror (which deletes remote branches not present locally)"
  - "Does not add retry logic for network failures"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0472: Add sternsystem.sync command for external repository mirroring

## Context

The Sternsystem architecture (RFC-0354, DNA-44, DNA-45) uses a local bare git repository as the canonical `origin` for each system's cache clone. The `repo` field in `systems/registry.yaml` points to this local bare repo (e.g. `../systems-git/warpgogol-com`). `mission.materialize` fetches from this origin; `mission.reconcile` pushes to it.

This setup provides speed (local `file://` protocol) and offline capability. However, there is no mechanism to synchronize the local bare repo with an external remote (e.g. GitHub). Operators must manually run `git push` / `git fetch` against the external remote, remembering the exact git incantations. There is no audit trail for these operations, and `sternsystem.validate` does not check whether an external mirror is configured or consistent.

## Problem

Synchronizing a Sternsystem's local bare repo with an external git remote (e.g. GitHub) relies entirely on manual discipline. The operator must:

1. Remember the bare repo path (`../systems-git/<id>`)
2. Remember the external remote URL
3. Run `git push` / `git fetch` with the correct branch and remote name
4. No record of sync operations is written to the Bordbuch
5. `sternsystem.validate` does not warn about missing or mismatched mirror remotes

This creates a gap in DNA-45 (fleet registry as single source of truth): the registry knows nothing about external mirrors, and there is no command surface for mirror operations. Agents have no way to discover or execute mirror sync.

## Decision

The kernel gains a `sternsystem.sync` command that synchronizes a Sternsystem's local bare repo with an optional external mirror repository declared via a new `mirror` field in `systems/registry.yaml`. The command supports push, pull, and both directions, operates on the current branch by default (or all branches with `--all`), records evidence in the Bordbuch, and fails fast on network errors. `sternsystem.validate` is extended to warn when a declared mirror is not configured as a remote in the bare repo or when the remote URL does not match the registry.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract):** This RFC extends the Sternsystem contract with an optional mirror field. The local bare repo remains the canonical origin; the mirror is a secondary external copy. The data-only invariant is preserved — mirror sync operates on git history, not on content shape.
- **DNA-45 (Fleet registry):** The `mirror` field extends the registry entry schema. The registry remains the single source of truth — `sternsystem.sync` reads the mirror URL from the registry, not from git config. `sternsystem.validate` enforces consistency between the registry and the bare repo's remote configuration. DNA-45's prose in `docs/architecture-dna.md` must be updated to include `mirror` in the field list.
- **RFC-0354:** Extends `fleetRegistryEntrySchema` with an optional `mirror` string field. No existing fields change.
- **RFC-0356:** Does not modify `mission.materialize` or `mission.reconcile`. The pipeline continues to use `repo` as origin. Mirror sync is decoupled from the mission lifecycle.
- **Site OS operator model:** `sternsystem.sync` is a workspace-scope command in the `sternsystem` module. It is standalone — not integrated into `build.check` or any automated pipeline. Operators and agents invoke it manually.
- **Bordbuch (DNA-46):** Mirror sync events are recorded as a new `mirror-sync` entry kind, extending the closed `bordbuchEntryKindSchema` enum.

## Design

### CLI surface

```sh
# Default: push current branch to mirror
pnpm exec site-kernel run sternsystem.sync --id warpgogol-com

# Pull from mirror into local bare repo
pnpm exec site-kernel run sternsystem.sync --id warpgogol-com --direction pull

# Both directions
pnpm exec site-kernel run sternsystem.sync --id warpgogol-com --direction both

# All branches + tags
pnpm exec site-kernel run sternsystem.sync --id warpgogol-com --all

# JSON output for agent consumption
pnpm exec site-kernel run sternsystem.sync --id warpgogol-com --json
```

**Scope:** workspace

**Flags:**

| Flag          | Kind    | Required | Description                                             |
| ------------- | ------- | -------- | ------------------------------------------------------- |
| `--id`        | string  | yes      | Sternsystem id                                          |
| `--direction` | string  | no       | `push` (default), `pull`, or `both`                     |
| `--all`       | boolean | no       | Sync all branches + tags instead of current branch only |

### TypeScript contracts

**Registry schema extension** (`@gogol/ontology/operations`):

```ts
// In fleetRegistryEntrySchema, add:
mirror: z.string().regex(repoRe, "mirror must be a valid git URL (SSH, HTTPS) or local file path").optional()

// In bordbuchEntryKindSchema, add:
"mirror-sync"
```

**Command result** (`@gogol/site-kernel-handoff`):

```ts
interface SternsystemSyncData {
  systemId: string;
  mirrorUrl: string;
  direction: "push" | "pull" | "both";
  branch: string;       // branch name, or "*" when --all
  commitSha: string;    // HEAD after sync
  syncedAt: string;     // ISO timestamp
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/registry.yaml` | Read for `repo` and `mirror` fields |
| `../systems-git/<id>/` (bare repo) | Git operations target — remote add, push, fetch |
| `systems/<id>/bordbuch/events.ndjson` | Append `mirror-sync` Bordbuch entry |
| `packages/ontology/src/operations/sternsystem.ts` | Schema: add `mirror` field |
| `packages/ontology/src/operations/mission.ts` | Schema: add `mirror-sync` to Bordbuch kind enum |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts` | New command implementation |
| `packages/os/site-kernel-handoff/src/sternsystem/index.ts` | Register `sternsystem.sync` command |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts` | Add mirror remote warning |
| `docs/COMMANDS.md` | Add command to table |
| `AGENTS.md` | Document agent guidance for mirror sync |

### Output format

```json
{
  "command": "sternsystem.sync",
  "status": "ok",
  "data": {
    "systemId": "warpgogol-com",
    "mirrorUrl": "git@github.com:syrokomskyi/warpgogol-com.git",
    "direction": "push",
    "branch": "master",
    "commitSha": "a1b2c3d4e5f6...",
    "syncedAt": "2026-07-20T19:20:00.000Z"
  },
  "summary": "[sternsystem.sync] warpgogol-com mirrored (push, branch: master)"
}
```

On failure:

```json
{
  "command": "sternsystem.sync",
  "status": "fail",
  "data": {
    "systemId": "warpgogol-com",
    "mirrorUrl": "git@github.com:syrokomskyi/warpgogol-com.git",
    "direction": "push",
    "branch": "master",
    "commitSha": null,
    "syncedAt": "2026-07-20T19:20:00.000Z"
  },
  "summary": "[sternsystem.sync] failed: git push exited with code 1 — fatal: Could not read from remote repository"
}
```

### Failure modes

| Condition | Behavior |
| --- | --- |
| `--id` not provided | Error: `[sternsystem.sync] --id is required` |
| System not found in registry | Error: `[sternsystem.sync] system '<id>' not found in registry` |
| `mirror` field absent or empty | Error: `[sternsystem.sync] system '<id>' has no mirror configured` |
| Bare repo not found at `repo` path | Error: `[sternsystem.sync] bare repo not found at <path>` |
| Bare repo has no commits yet (empty repo) | Error: `[sternsystem.sync] bare repo has no commits — nothing to push` |
| Network error (GitHub unreachable, SSH key missing) | Fail-fast: report git stderr, exit non-zero, no retry |
| `git push` rejected (non-fast-forward) | Fail-fast: report error, suggest `--direction pull` first |
| `git fetch` conflict (local diverged) | Fail-fast: report error, suggest manual resolution |
| Bordbuch write fails | Warning: sync succeeded but Bordbuch entry could not be written |

The command always exits non-zero on failure. `--json` output includes the error message in `summary`. Pretty output prints the error to stderr.

## Rollout

- **Default behavior:** `mirror` is an optional field. Existing systems without `mirror` are unaffected — `sternsystem.sync` errors with "no mirror configured", `sternsystem.validate` produces no warning.
- **Adoption for warpgogol-com:** Add `mirror: git@github.com:syrokomskyi/warpgogol-com.git` to the registry entry. Run `sternsystem.sync --id warpgogol-com` to perform the initial push.
- **New systems:** Set `mirror` during `sternsystem.register --mirror <url>` if an external repo is available. The `--mirror` flag is optional on `sternsystem.register`. Systems without a mirror are valid.
- **No pipeline integration:** `sternsystem.sync` is not part of `build.check`, `mission.reconcile`, or any automated pipeline. It is a standalone operator/agent command.
- **No deprecation:** No existing command is superseded. `sternsystem.validate` is extended with a warning, not a breaking change.

## Alternatives considered

1. **Replace `repo` with GitHub URL directly.** Set `repo: git@github.com:syrokomskyi/warpgogol-com.git` in the registry. Rejected: loses offline capability and local `file://` speed. `mission.materialize` and `mission.reconcile` would require network access for every fetch/push.

2. **Replace `repo` with `localRepo` + `remoteRepo` fields.** Two explicit fields instead of `repo` + `mirror`. Rejected: breaks the existing `fleetRegistryEntrySchema` contract (renaming `repo`), requires changes to `syncCacheClone` and `mission.reconcile`, and adds complexity for a single mirror. The `mirror` approach is additive and non-breaking.

3. **Post-receive git hook in bare repo.** A `hooks/post-receive` script that auto-pushes to GitHub on every push. Rejected: not visible to the platform, not recorded in Bordbuch, not discoverable by agents, and requires manual file management outside the command surface.

4. **Automate sync in `mission.reconcile` with `--sync-mirror` flag.** Rejected: couples reconcile to network availability, breaks offline-safe invariant of the mission pipeline. Sync should be a separate, explicit operation.

5. **ADR instead of RFC.** Rejected: adds a new Site OS command, modifies `AGENTS.md`, and changes a cross-workspace schema in `@gogol/ontology` — three criteria that disqualify ADR per the `fo-idea-create-adr` skill rules.

6. **`git push --mirror` for exact mirroring.** Rejected: `--mirror` deletes remote branches not present locally, which can destroy work pushed directly to GitHub. Default to current-branch push; `--all` flag covers all branches + tags without deletion.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Operator forgets to run `sternsystem.sync` after `mission.reconcile` | Medium | `AGENTS.md` instructs agents to recommend `sternsystem.sync` after reconcile when `mirror` is configured. Bordbuch gap is visible — no `mirror-sync` entry after a reconcile. |
| SSH key not configured for GitHub | Medium | Fail-fast with git stderr. Error message is self-explanatory. |
| Mirror URL changes (GitHub repo renamed) | Low | `sternsystem.validate` warns when remote URL in bare repo does not match registry. Operator updates registry and re-runs sync. |
| Agent runs sync automatically without operator consent | Low | `AGENTS.md` explicitly states sync is manual. Command is not in any automated pipeline. |
| `bordbuchEntryKindSchema` enum extension breaks existing validators | Low | Adding a new enum value is backward-compatible — existing entries are unaffected. `bordbuch.validate` accepts the new kind. |
| Bare repo path resolution fails (non-standard layout) | Low | `repo` field is already used by `syncCacheClone` with the same path resolution logic. |
| `mirror` URL contains embedded credentials (HTTPS with token) | Low | `sternsystem.validate` warns when `mirror` URL matches `https://[^:]+:[^@]+@` pattern. SSH URLs (recommended) do not embed credentials. |

## Acceptance criteria

- [x] `mirror` optional string field added to `fleetRegistryEntrySchema` in `@gogol/ontology/operations` (evidence: packages/ontology/src/operations/sternsystem.ts:59, build:check pass)
- [x] `mirror-sync` added to `bordbuchEntryKindSchema` in `@gogol/ontology/operations` (evidence: packages/ontology/src/operations/mission.ts:50, build:check pass)
- [x] `sternsystem.sync` command implemented in `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts` (evidence: sternsystem-sync.ts:1-185, build:check pass)
- [x] Command registered in `packages/os/site-kernel-handoff/src/sternsystem/index.ts` with correct flags and scope (evidence: index.ts:97-111, build:check pass)
- [x] `--json` output format matches the documented shape (evidence: sternsystem-sync.ts:148-165, SternsystemSyncData interface)
- [x] `sternsystem.validate` produces warning when `mirror` is set but remote is missing or URL mismatched in bare repo (evidence: sternsystem-validate.ts:197-234)
- [x] Bordbuch entry written with kind `mirror-sync`, metadata: `mirrorUrl`, `direction`, `branch`, `commitSha`, `result` (evidence: sternsystem-sync.ts:139-155, appendBordbuchEntry call)
- [x] `mirror: git@github.com:syrokomskyi/warpgogol-com.git` added to `warpgogol-com` in `systems/registry.yaml` (evidence: systems/registry.yaml:6)
- [x] DNA-45 prose in `docs/architecture-dna.md` updated to include `mirror` in the field list (evidence: docs/architecture-dna.md:197)
- [x] `sternsystem.register` supports optional `--mirror` flag (evidence: sternsystem-register.ts:48, index.ts:45)
- [x] `sternsystem.validate` warns when `mirror` URL contains embedded credentials (evidence: sternsystem-validate.ts:227-233)
- [x] `sternsystem.validate` mirror remote warning only fires when bare repo exists (evidence: sternsystem-validate.ts:204, existsSync check)
- [x] `docs/COMMANDS.md` updated with `sternsystem.sync` entry (evidence: docs/COMMANDS.md:552)
- [x] `AGENTS.md` updated with agent guidance for mirror sync after `mission.reconcile` (evidence: AGENTS.md:15-20)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate --json exit code 0)
- [x] `pnpm --filter @gogol/ontology build:check` passes (evidence: tsc --noEmit exit code 0)
- [x] `pnpm --filter @gogol/site-kernel-handoff build:check` passes (evidence: tsc --noEmit exit code 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT run `sternsystem.sync` automatically after `mission.reconcile` — sync is a manual operator action. Agents MAY recommend running `sternsystem.sync` in their output when `mirror` is configured.
- Agents MUST NOT use `git push --mirror` — it deletes remote branches not present locally. Use `git push mirror <branch>` or `git push mirror --all` + `git push mirror --tags`.
- Agents MUST NOT add retry logic to `sternsystem.sync` — fail-fast on network errors.
- Agents MUST NOT change the `repo` field semantics — `repo` remains the canonical origin (local bare repo). `mirror` is a secondary external copy.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
