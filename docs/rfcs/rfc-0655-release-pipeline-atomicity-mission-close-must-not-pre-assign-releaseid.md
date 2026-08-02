---
id: RFC-0655
title: "Release pipeline atomicity — mission.close must not pre-assign releaseId"
status: draft
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
reviewers: []
createdAt: 2026-08-02
updatedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-48
  - DNA-46
  - DNA-51
  - RFC-0522
  - RFC-0357
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-48
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
  added:
    - release.state.validate
  changed:
    - mission.close
    - release.prepare
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/os/site-kernel-handoff
successSignals:
  - mission.close close-report.json releaseId field is never null when mission.yaml releaseId is set
  - release.state.validate detects orphaned releaseIds (prepared but never published)
  - No phantom release numbers reserved without corresponding release artifacts
nonGoals:
  - Making mission.close and release.prepare a single atomic command — they remain separate steps
  - Auto-publishing or auto-propagating releases upon mission close
  - Changing the release state machine (prepared → published → alt-deployed → promoted)
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

# RFC-0655: Release pipeline atomicity — mission.close must not pre-assign releaseId

## Context

During the 2026-08-02 release session for `warpgogol-com`, three structural problems were observed in the release pipeline:

1. **Phantom releaseId**: `missions/warpgogol-com-m000025/mission.yaml` carried `releaseId: warpgogol-com-r000006`, but `evidence/close-report.json` reported `missing-release-id` with `releaseId: null`. The bordbuch `mission-close` event also recorded `releaseId: null`. Release r000006 existed in `releases/` but was never published or propagated — `registry.yaml` still showed `lastRelease: warpgogol-com-r000005`.

2. **close-report / mission.yaml desync**: `mission.close` writes `close-report.json` at close time with whatever `releaseId` is known at that moment (line 164: `releaseIdFlag ?? manifest.releaseId ?? null`). If `release.prepare` runs later (which is the supported flow — `release.prepare` requires `state: closed`), it writes `releaseId` to `mission.yaml` (line 481) but does NOT update `close-report.json`. The two files permanently disagree.

3. **No orphan detection**: A release can be `prepared` but never `published`. No command checks whether a mission's `releaseId` points to a release that actually progressed through the state machine. The operator must manually inspect `releases/<id>/release.yaml` and `registry.yaml`.

These gaps violate DNA-48 (release discipline: a release is a promoted, immutable artifact) and DNA-46 (mission lifecycle: every mission is recorded in the Bordbuch with accurate metadata).

## Problem

DNA-48 states that a release is a promoted, immutable artifact with a state machine `prepared → published → alt-deployed → promoted → rolled-back`. But nothing enforces that a `releaseId` written to `mission.yaml` by `release.prepare` actually progresses through this machine. A release can be prepared and then abandoned, leaving `mission.yaml` pointing to a stale `releaseId` while `registry.yaml.lastRelease` references an older release.

DNA-46 requires that bordbuch events carry accurate metadata. The `mission-close` bordbuch entry records `releaseId: null` when close runs before `release.prepare`, but `mission.yaml` later shows a `releaseId` — the bordbuch and manifest disagree.

DNA-51 (Werkstatt consistency primitives) provides locks and atomic staging, but the close → prepare → publish chain is not covered by any consistency validator. There is no command that detects:

- A mission.yaml `releaseId` pointing to a non-existent or abandoned release
- A close-report.json `releaseId` that disagrees with mission.yaml
- A release in `prepared` state whose mission is already closed (orphaned release)

## Decision

The kernel gains a `release.state.validate` command that checks consistency between `mission.yaml`, `close-report.json`, `release.yaml`, and `registry.yaml` for a given mission or release. Additionally, `release.prepare` updates `close-report.json` after writing `releaseId` to `mission.yaml`, and `mission.close` appends a `release-associated` bordbuch entry when `releaseId` is already present in the manifest at close time.

## Architectural fit

- **DNA-48** (Release discipline): `release.state.validate` enforces that a `releaseId` in `mission.yaml` points to a release that has progressed through the state machine, not an abandoned `prepared` release.
- **DNA-46** (Mission lifecycle): `release.prepare` updates `close-report.json` to keep it in sync with `mission.yaml`, ensuring the bordbuch and evidence trail are consistent.
- **DNA-51** (Werkstatt consistency primitives): The new validator extends the existing consistency primitive family (`werkstatt.lock.status`, `werkstatt.operation.validate`) to cover the release pipeline.
- **Site OS operator model**: `release.state.validate` is a workspace-scope command in the `release` module, callable standalone or integrated into `build.check` as a warn-level validator.

## Design

### CLI surface

```sh
# Validate a specific mission's release state
pnpm exec site-kernel run release.state.validate --mission warpgogol-com-m000025

# Validate a specific release
pnpm exec site-kernel run release.state.validate --release warpgogol-com-r000008

# Validate all releases for a system
pnpm exec site-kernel run release.state.validate --system warpgogol-com
```

Flags: `--mission` (string), `--release` (string), `--system` (string). Exactly one is required. Scope: workspace.

### TypeScript contracts

```ts
interface ReleaseStateValidateInput {
  mission?: string;
  release?: string;
  system?: string;
}

interface ReleaseStateCheck {
  check: string;
  passed: boolean;
  message: string;
  severity: "error" | "warning";
}

interface ReleaseStateValidateData {
  missionId: string | null;
  releaseId: string | null;
  releaseState: "prepared" | "published" | "alt-deployed" | "promoted" | "rolled-back" | "missing";
  checks: ReleaseStateCheck[];
  summary: string;
}
```

Checks performed:

1. `mission-yaml-release-id-exists` — if `mission.yaml` has a `releaseId`, the release directory and `release.yaml` must exist.
2. `close-report-release-id-consistent` — `close-report.json` releaseId (if present) must match `mission.yaml` releaseId.
3. `release-state-progressed` — if release exists, its state must be at least `published` (warn if `prepared`).
4. `bordbuch-release-id-consistent` — the latest `mission-close` bordbuch event's `releaseId` must match `mission.yaml`.
5. `registry-last-release-consistent` — if release state is `promoted`, `registry.yaml.lastRelease` must point to this release or a newer one.

### File system responsibilities

| Path                                            | Role                                       |
| ----------------------------------------------- | ------------------------------------------ |
| `missions/{mission}/mission.yaml`               | Read — check releaseId field               |
| `missions/{mission}/evidence/close-report.json` | Read — check releaseId consistency         |
| `releases/{release}/release.yaml`               | Read — check release state                 |
| `systems/registry.yaml`                         | Read — check lastRelease consistency       |
| `systems/{system}/bordbuch/events.ndjson`       | Read — check mission-close event releaseId |

`release.prepare` additionally writes to: | `missions/{mission}/evidence/close-report.json` | Updated — releaseId field set after prepare |

### Output format

```json
{
  "command": "release.state.validate",
  "missionId": "warpgogol-com-m000025",
  "releaseId": "warpgogol-com-r000006",
  "releaseState": "prepared",
  "checks": [
    {
      "check": "mission-yaml-release-id-exists",
      "passed": true,
      "message": "Release directory exists",
      "severity": "error"
    },
    {
      "check": "close-report-release-id-consistent",
      "passed": false,
      "message": "close-report.json has releaseId: null, mission.yaml has warpgogol-com-r000006",
      "severity": "error"
    },
    {
      "check": "release-state-progressed",
      "passed": false,
      "message": "Release state is 'prepared' — never published",
      "severity": "warning"
    }
  ],
  "summary": "2 error(s), 1 warning(s)"
}
```

### Failure modes

- **Error-level checks** (exit 1): missing release directory, close-report/mission.yaml releaseId mismatch, bordbuch releaseId mismatch.
- **Warning-level checks** (exit 0): release in `prepared` state (orphaned but not yet published), registry.lastRelease behind latest promoted release.
- `--json` output includes all checks regardless of severity. Pretty output shows only failures and warnings.

## Rollout

- `release.state.validate` is introduced as a standalone command, not yet integrated into `build.check`.
- `release.prepare` is updated to write `releaseId` to `close-report.json` after writing it to `mission.yaml`. This is a backward-compatible change — existing close-reports with `releaseId: null` are not modified retroactively.
- `mission.close` is updated to append a `release-associated` bordbuch entry when `manifest.releaseId` is already set at close time (e.g., from a prior `release.prepare` on a re-opened mission).
- After a grace period, `release.state.validate` is integrated into `build.check` as a warn-level validator.

## Alternatives considered

- **Single atomic `mission.release` command** (close + prepare + publish in one step): Rejected — the three steps have different lock scopes, failure modes, and side effects. Combining them reduces flexibility without eliminating the need for individual commands.
- **Auto-run `release.prepare` inside `mission.close`**: Rejected — `release.prepare` runs a full build pipeline (~25s) and requires a clean workpiece. Forcing this inside `mission.close` would make close significantly slower and more failure-prone.
- **Remove `releaseId` from `mission.close` entirely**: Rejected — the field is useful for associating a release with a mission after the fact. The problem is consistency, not the field itself.

## Risks

- **False positives for re-opened missions**: A mission that was closed, re-opened, and closed again may have a stale `releaseId` from the first close. The validator must account for this by checking the latest bordbuch `mission-close` event, not any earlier one.
- **Performance**: `release.state.validate` reads multiple files across `missions/`, `releases/`, `systems/`, and bordbuch. For large fleets, validating all releases for a system may be slow. Mitigation: validate by mission or release ID, not system-wide, by default.
- **Agent confusion**: Agents may interpret `release.state.validate` failures as blocking when they are advisory. The command exits 1 only for error-level checks; agents should treat warnings as informational.

## Acceptance criteria

- [ ] `release.state.validate` command registered in the `release` module with `--mission`, `--release`, `--system` flags
- [ ] `release.state.validate` detects: missing release directory, close-report/mission.yaml releaseId mismatch, orphaned prepared releases, bordbuch releaseId mismatch, registry lastRelease inconsistency
- [ ] `release.prepare` updates `close-report.json` releaseId field after writing to `mission.yaml`
- [ ] `mission.close` appends `release-associated` bordbuch entry when releaseId is present at close time
- [ ] `--json` output format documented and stable
- [ ] Unit tests cover all five checks with both pass and fail scenarios
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
