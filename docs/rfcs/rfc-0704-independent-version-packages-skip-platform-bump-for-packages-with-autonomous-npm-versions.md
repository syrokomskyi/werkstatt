---
id: RFC-0704
title: "Independent version packages — skip platform bump for packages with autonomous npm versions"
status: draft
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
reviewers: []
createdAt: 2026-08-05
updatedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0533
  - RFC-0703
  - RFC-0478
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-53
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
    - ecosystem.commit
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
  - site-kernel-checks
successSignals:
  - "`ecosystem.commit` skips root package.json bump and platform-version-log write when all staged platform files belong to independentVersionPackages"
  - "`forge.yaml` declares `independentVersionPackages` list"
  - "`forge.doctor` validates that independentVersionPackages paths exist"
  - "AGENTS.md documents the independent version package contract"
nonGoals:
  - "This RFC does not change the pre-commit hook blocking behavior for platform-scope files — ECOSYSTEM_COMMIT=1 bypass remains the only sanctioned bypass"
  - "This RFC does not add per-package version bump automation — independent packages manage their own version in their own package.json manually"
  - "This RFC does not change how platform.consistency.validate (PC-02/PC-03) works — the platform version log is only written when a platform bump occurs"
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

# RFC-0704: Independent version packages — skip platform bump for packages with autonomous npm versions

## Context

The Werkstatt monorepo has a single root `package.json` version (`4.7.x`) that represents the platform version. RFC-0533 introduced `ecosystem.commit` as the mandatory commit path for `packages/**`, `integrations/**`, and `services/**` changes. The command automatically bumps the root version and writes `docs/platform-version-log.generated.yaml` on every commit.

`@warpgogol/forge` (`packages/forge`) is the only package in the monorepo with `"private": false` and its own independent npm version (`0.x.y`). It is published to npm as a standalone tool — consumers install it without the Werkstatt monorepo. Changes to `packages/forge` (profile fixes, template updates, skill changes) do not affect the Werkstatt platform version, yet `ecosystem.commit` bumps the root version on every such commit.

This was observed in practice on 2026-08-05: a fix to the editframe React bootstrap template (7 bug fixes in profile templates) was committed via `ecosystem.commit`, which bumped the root version from `4.7.0` to `4.7.1` and wrote a new `platform-version-log.generated.yaml` entry — even though no platform code changed. The root version bump and version log entry had to be manually reverted via `git commit --amend`.

## Problem

`ecosystem.commit` (RFC-0533) treats all `packages/**` files identically — every commit bumps the root platform version and writes `docs/platform-version-log.generated.yaml`. There is no mechanism to declare that certain packages have their own independent npm version and do not contribute to the platform version.

This causes:

1. **False version bumps** — the root platform version increments even though no platform code changed. This pollutes the version history and can trigger unnecessary `platform.consistency.validate` (PC-02/PC-03) warnings.
2. **Agent confusion** — AI agents use `ecosystem.commit` for all `packages/**` changes (as required by the pre-commit hook), but there is no documented exception for independent-version packages. Agents cannot know that `packages/forge` should not trigger a platform bump.
3. **Manual workaround risk** — the only current workaround is `git commit --amend` to revert the root version change, which is error-prone and defeats the purpose of `ecosystem.commit`.

## Decision

`forge.yaml` gains an `independentVersionPackages` field — a list of package root paths (relative to the workspace root) whose changes do not trigger a platform version bump. When all staged platform-scope files belong to packages in this list, `ecosystem.commit` skips the root `package.json` version bump, the `docs/platform-version-log.generated.yaml` write, and the `X-Platform-Bump` / `X-Platform-Version` trailers. The commit still goes through `ECOSYSTEM_COMMIT=1` to bypass the pre-commit hook.

## Architectural fit

- **DNA-53 (Semantic fingerprint governance):** This RFC does not change fingerprint computation, but it prevents false entries in `platform-version-log.generated.yaml` — the log records a semantic hash per platform version, and spurious version bumps create entries that do not correspond to actual platform semantic changes.
- **RFC-0533 (ecosystem.commit):** This RFC amends the behavior of `ecosystem.commit` by adding a conditional path that skips the version bump. The pre-commit hook blocking behavior and `ECOSYSTEM_COMMIT=1` bypass are unchanged.
- **RFC-0703 (Platform version bump discipline):** This RFC refines the discipline by distinguishing platform-version changes from independent-package-version changes. `mission.close` auto-pinning behavior is unaffected — the platform version only changes when a real platform bump occurs.
- **RFC-0478 (Platform versioning enforcement):** The SemVer delta declaration (`versionBump` field) remains unchanged. Independent-package commits produce no platform version delta.

## Design

### Configuration: `forge.yaml`

```yaml
independentVersionPackages:
  - packages/forge
```

Paths are relative to the workspace root. Each path must point to a directory containing a `package.json`. The list is read by `ecosystem.commit` at commit time.

### CLI surface

No new command. The existing `ecosystem.commit` command is modified:

```sh
# Same invocation as before — the skip is automatic based on staged files
pnpm exec site-kernel run ecosystem.commit --message "fix: forge template bug"
```

When all staged platform files are inside `independentVersionPackages` paths, the command:

1. Does NOT read or bump the root `package.json` version
2. Does NOT write `docs/platform-version-log.generated.yaml`
3. Does NOT add `X-Platform-Bump` / `X-Platform-Version` trailers
4. Commits via `ECOSYSTEM_COMMIT=1` as usual

When at least one staged platform file is outside `independentVersionPackages`, the command behaves exactly as before (RFC-0533).

### TypeScript contracts

```ts
// forge.yaml schema extension (in forge/config@1)
interface ForgeConfig {
  // ... existing fields ...
  independentVersionPackages?: string[]; // paths relative to workspace root
}

// ecosystem.commit result — new fields for the skip case
interface EcosystemCommitResult {
  // ... existing fields ...
  skipPlatformBump?: boolean; // true when all staged files are in independentVersionPackages
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `forge.yaml` | Declares `independentVersionPackages` list |
| `packages/os/site-kernel-checks/src/ecosystem-commit.ts` | Reads config, checks staged files, skips bump when applicable |
| `packages/forge/src/forge-config.ts` | Schema validation for `independentVersionPackages` field |
| `docs/platform-version-log.generated.yaml` | NOT written when skip is active |
| `package.json` (root) | NOT modified when skip is active |

### Output format

```json
{
  "command": "ecosystem.commit",
  "status": "ok",
  "skipPlatformBump": true,
  "previousVersion": "4.7.1",
  "newVersion": "4.7.1",
  "bumpType": "none",
  "commitSha": "abc1234",
  "trailers": {}
}
```

### Failure modes

- **Invalid path in `independentVersionPackages`:** `ecosystem.commit` emits a warning and proceeds with normal bump behavior. The invalid path does not block the commit.
- **`forge.yaml` missing or unreadable:** `ecosystem.commit` proceeds with normal bump behavior (backward compatible).
- **Mixed staged files (some in independent packages, some not):** Normal bump occurs — the platform version increments because at least one file is outside the independent list.

## Rollout

- **Default behavior:** The `independentVersionPackages` field is optional. If absent in `forge.yaml`, `ecosystem.commit` behaves exactly as before (RFC-0533). No flag day.
- **Adoption:** Add `independentVersionPackages: [packages/forge]` to `forge.yaml` in the same commit that implements this RFC. From that point on, commits touching only `packages/forge/**` will skip the platform bump.
- **New packages:** If a future package gets published to npm with its own version, add its path to the list.
- **`forge.doctor` integration:** `forge.doctor` validates that each path in `independentVersionPackages` exists and contains a `package.json`. Stale entries are reported as warnings.
- **No pipeline integration needed:** This change only affects `ecosystem.commit` behavior. No `build.check` or `build.prepare` pipeline changes required.

## Alternatives considered

1. **`--no-platform-bump` flag on `ecosystem.commit`** — require the operator or agent to pass a flag for each independent-package commit. Rejected: agents would need to know when to pass it, which is the same knowledge gap that caused the original bug. The declarative list in `forge.yaml` is automatic and does not require agent judgment.

2. **Auto-detection via `"private": false` in `package.json`** — `ecosystem.commit` checks if all staged files belong to packages with `private: false`. Rejected: `private: false` means "publishable", not "has independent version". A package could be publishable but still tracked at the platform version. The explicit list is clearer and does not couple commit behavior to a package metadata field that serves a different purpose.

3. **Exclude `packages/forge` from the pre-commit hook** — allow direct `git commit` for `packages/forge/**` without `ECOSYSTEM_COMMIT=1`. Rejected: this breaks the uniform platform-scope rule and creates an exception in the hook. The `ecosystem.commit` path is still valuable for audit trail and semantic hash computation.

## Risks

- **Agent misinterpretation:** Agents might think ALL `packages/forge` changes skip the platform bump, even when they also touch `packages/os/**` (which is platform scope). The mixed-files rule (at least one file outside the list → normal bump) must be clearly documented in AGENTS.md.
- **Stale list entries:** If a package is removed from the monorepo but stays in `independentVersionPackages`, `ecosystem.commit` emits a warning but does not block. `forge.doctor` should catch this.
- **Future publishable packages:** If a second package becomes independently versioned, someone must remember to add it to the list. This is a low-frequency event and the list is self-documenting.
- **PC-02/PC-03 interaction:** `platform.consistency.validate` compares the semantic hash in `platform-version-log.generated.yaml` against the current hash. Skipping the log write means the log stays at the last real platform version — which is correct, since no platform code changed.

## Acceptance criteria

- [ ] `forge.yaml` schema accepts `independentVersionPackages` field (evidence: `packages/forge/src/forge-config.ts`)
- [ ] `independentVersionPackages: [packages/forge]` declared in `forge.yaml` (evidence: `forge.yaml`)
- [ ] `ecosystem.commit` skips root version bump and version log write when all staged platform files are in `independentVersionPackages` (evidence: `packages/os/site-kernel-checks/src/ecosystem-commit.ts`)
- [ ] `ecosystem.commit` performs normal bump when at least one staged file is outside `independentVersionPackages` (evidence: `packages/os/site-kernel-checks/src/ecosystem-commit.ts`)
- [ ] `ecosystem.commit` emits warning for invalid paths in `independentVersionPackages` (evidence: `packages/os/site-kernel-checks/src/ecosystem-commit.ts`)
- [ ] `forge.doctor` validates `independentVersionPackages` paths exist (evidence: `packages/forge/os/core/handlers/doctor.ts`)
- [ ] `AGENTS.md` documents the independent version package contract and agent behavior (evidence: `AGENTS.md`)
- [ ] Unit tests cover skip-bump, mixed-files, and invalid-path scenarios (evidence: `packages/os/site-kernel-checks/src/tests/ecosystem-commit.test.ts`)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).

### Agent commit behavior for independent-version packages

- Agents MUST still use `ecosystem.commit` for ALL `packages/**` changes, including `packages/forge`. The pre-commit hook blocks direct `git commit` for platform scope.
- `ecosystem.commit` automatically detects whether the commit is platform-version or independent-version based on `forge.yaml` `independentVersionPackages` and the staged files. Agents do NOT need to pass any flag.
- If a commit touches files in BOTH `packages/forge/**` AND `packages/os/**` (or any other non-independent package), the platform version IS bumped. Only commits where ALL staged platform files are in `independentVersionPackages` skip the bump.
- Agents MUST NOT manually set `ECOSYSTEM_COMMIT=1` and run `git commit` directly for `packages/forge` changes — always use `ecosystem.commit`.
- To publish an independent-version package to npm, use `pnpm --filter <name> publish` after `ecosystem.commit`. The package's own `package.json` version is managed manually (or by the operator).
