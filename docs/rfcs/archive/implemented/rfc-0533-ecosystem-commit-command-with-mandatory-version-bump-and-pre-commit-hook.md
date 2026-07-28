---
id: RFC-0533
title: "Ecosystem commit command with mandatory version bump and pre-commit hook"
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
createdAt: 2026-07-25
updatedAt: 2026-07-25
enhancedAt: 2026-07-26
implementedAt: 2026-07-25
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0478
amendedBy: []
related:
  - RFC-0364
  - RFC-0478
  - RFC-0479
  - RFC-0534
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
  added:
    - ecosystem.commit
  changed:
    - platform.consistency.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-handoff
successSignals:
  - "ecosystem.commit command is registered in the ECOSYSTEM_COMMANDS table and callable via site-kernel run ecosystem.commit"
  - "Pre-commit hook at hooks/pre-commit blocks direct git commit when staged files include paths in packages/**, integrations/**, or services/** without ECOSYSTEM_COMMIT env var set"
  - "ecosystem.commit atomically bumps package.json version, writes docs/platform-version-log.generated.yaml with working-tree semantic hash (resolvePlatformSemanticHash from @gogol/fingerprint), and commits with X-Platform-Bump / X-Platform-Version / X-RFC trailers"
  - "platform.consistency.validate includes PC-04 rule: commits in platform scope without X-Platform-Bump trailer in git history produce an error"
  - "ecosystem.commit --dry-run outputs the planned bump, new version, and PC-02/PC-03 forecast without committing"
  - "ecosystem.commit --amend recalculates version, hash, and trailers; refuses if the target commit has been pushed to a remote"
  - "ecosystem.commit refuses when versionBump: none is declared in the referenced RFC"
  - "ecosystem.commit refuses when no staged files match the platform scope (packages/**, integrations/**, services/**)"
  - "ecosystem.commit refuses when package.json or docs/platform-version-log.generated.yaml are already staged by the operator"
nonGoals:
  - "Do not replace mission.git.commit — mission workpiece commits are client-site-only and do not bump the ecosystem version"
  - "Do not add a --bump flag — bump type is determined solely from RFC versionBump frontmatter or defaults to patch when no RFC is referenced"
  - "Do not validate conventional commit message format — message body is the operator's responsibility"
  - "Do not manage git staging — the operator stages files; ecosystem.commit only adds package.json and the version log to the existing staged set"
  - "Do not enforce that all staged files are within platform scope — non-platform files may be included in the same commit"
  - "Do not check working-tree cleanliness — unstaged changes may remain after ecosystem.commit"
  - "Do not support multi-RFC commits — one commit references at most one RFC"
  - "Do not address general enforcement of ecosystem commands beyond git commit — that is a separate concern"
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

# RFC-0533: Ecosystem commit command with mandatory version bump and pre-commit hook

## Context

RFC-0478 established platform versioning enforcement: every RFC changing `packages/*` declares a `versionBump` field, and `platform.consistency.validate` guards against semantic-hash drift without a corresponding version bump (PC-01). However, the version bump itself is a **manual operator step** — the operator must read the RFC frontmatter, compute the new SemVer, edit `package.json`, and commit. This creates two gaps:

1. **Manual bump is error-prone** — operators forget to bump, bump the wrong segment, or bump without updating `docs/platform-version-log.generated.yaml`, triggering false PC-01 violations.
2. **No enforcement against direct `git commit`** — nothing prevents an operator or agent from committing changes to `packages/**`, `integrations/**`, or `services/**` via plain `git commit`, bypassing the version-bump workflow entirely. PC-01 catches this in CI, but the feedback is delayed.

This RFC closes both gaps by introducing `ecosystem.commit` — the mandatory commit command for platform-scope changes — and a pre-commit hook that blocks direct `git commit` when staged files touch platform scope.

**Amends RFC-0478:** RFC-0478 declared as a nonGoal: "Does not automate version bumping on commit — enforcement is at RFC merge and CI validation time." This RFC amends that nonGoal: version bumping is now automated at commit time via `ecosystem.commit`, and enforcement is both local (pre-commit hook) and in CI (PC-04). The manual bump workflow is replaced, not supplemented.

## Problem

The platform version invariant (DNA-53) relies on two manual disciplines that are not enforced at commit time:

1. **Manual version bump** — `platform.consistency.validate` (PC-01) detects hash drift without version change, but the version bump is a separate manual step. The operator must: read RFC frontmatter `versionBump` field → compute new SemVer → edit `package.json` → update `docs/platform-version-log.generated.yaml` → commit. Any skipped step produces a PC-01 violation discovered only in CI.

2. **No local enforcement against bypass** — an operator or AI agent can `git add packages/foo.ts && git commit -m "fix: ..."` directly, bypassing the entire version-bump workflow. The pre-commit hook at `.git/hooks/pre-commit` is not versioned and does not exist by default. PC-01 catches the drift in CI, but the feedback loop is minutes-to-hours, not seconds.

The platform semantic hash scope (RFC-0364) covers `packages/**`, `integrations/**`, and `services/**` — any commit touching these paths changes the hash and requires a version bump. There is no mechanism to enforce this at commit time.

## Decision

The kernel gains an `ecosystem.commit` command that replaces direct `git commit` for all changes touching platform scope (`packages/**`, `integrations/**`, `services/**`). The command atomically:

1. Determines the bump type from the referenced RFC's `versionBump` frontmatter (or defaults to `patch` when no `--rfc` is provided).
2. Bumps the `version` field in root `package.json` according to SemVer rules.
3. Computes the `platformSemanticHash` from the working tree using `resolvePlatformSemanticHash` (extended to cover `packages/**`, `integrations/**`, `services/**`). The hash is computed after `git add` but reads from the working tree, not the git index — unstaged changes in platform scope are included in the hash. This is acceptable because `ecosystem.commit` manages `package.json` and `docs/platform-version-log.generated.yaml` staging; the operator is expected to stage all platform-scope changes before invoking `ecosystem.commit`.
4. Writes `docs/platform-version-log.generated.yaml` with the new hash, version, and timestamp.
5. Adds `package.json` and `docs/platform-version-log.generated.yaml` to the staged set.
6. Commits with `git commit` and appends `X-Platform-Bump`, `X-Platform-Version`, and optionally `X-RFC` trailers to the commit message.

A versioned pre-commit hook at `hooks/pre-commit` blocks any direct `git commit` (not invoked through `ecosystem.commit`) when staged files include paths in `packages/**`, `integrations/**`, or `services/**`. The hook detects `ecosystem.commit` via the `ECOSYSTEM_COMMIT` environment variable and produces an actionable error message directing the operator or agent to use `ecosystem.commit` instead.

### Pre-commit hook script

The hook script at `hooks/pre-commit` is a bash script with the following logic:

```bash
#!/bin/bash
# Pre-commit hook: block direct git commit for platform-scope changes.
# Activated via: git config core.hooksPath hooks/

set -euo pipefail

# ecosystem.commit sets ECOSYSTEM_COMMIT=1 when invoking git commit
if [ -n "${ECOSYSTEM_COMMIT:-}" ]; then
  exit 0
fi

# Check if any staged file matches platform scope
PLATFORM_FILES=$(git diff --cached --name-only -- 'packages/' 'integrations/' 'services/' || true)

if [ -n "$PLATFORM_FILES" ]; then
  echo "ERROR: Direct git commit blocked for platform-scope changes." >&2
  echo "" >&2
  echo "Staged files touch platform scope (packages/**, integrations/**, services/**)." >&2
  echo "Use ecosystem.commit instead:" >&2
  echo "" >&2
  echo "  pnpm exec site-kernel run ecosystem.commit --message "<your message>" [--rfc RFC-XXXX]" >&2
  echo "" >&2
  echo "Tip for AI agents: remember this rule — platform-scope changes MUST use" >&2
  echo "ecosystem.commit, not git commit. Non-platform changes (docs/rfcs/**, missions/**)" >&2
  echo "may use git commit directly." >&2
  exit 1
fi

exit 0
```

### PC-04 cutoff mechanism

PC-04 uses a **commit-SHA-based cutoff** to determine which commits to check. The implementation commit of RFC-0533 (the commit that adds PC-04 to `platform-consistency.ts`) is recorded as a constant in the PC-04 rule. PC-04 only checks commits after this SHA in the git history. This is precise (no timezone issues) and deterministic. The cutoff SHA is hardcoded in the rule implementation and updated when the RFC is implemented.

### `platform-version-log.generated.yaml` write interaction

`ecosystem.commit` writes the log file on commit (after `git commit` succeeds). `platform.consistency.validate` writes the log on success (when no errors are found). When `ecosystem.commit` writes the log, the next `platform.consistency.validate` run sees `lastHash === currentHash` and `lastVersion === currentVersion` — no drift, no write needed. The two writers do not conflict: `ecosystem.commit` is the primary writer at commit time, `platform.consistency.validate` is the CI-side writer that catches any commits made without `ecosystem.commit` (bypass scenarios).

### Merge commits and cherry-picks

PC-04 skips merge commits — merge commits do not carry `X-Platform-Bump` trailers and are not checked. Cherry-picked commits preserve trailers; PC-04 trusts trailers on cherry-picked commits (the trailer is part of the commit message, which is preserved by `git cherry-pick`).

### `--amend` undo behavior

`--amend` reads the previous commit's `X-Platform-Version` trailer to determine the previous version. It restores `package.json` to that version, then applies the new bump. If the previous commit has no `X-Platform-Bump` trailer (not an `ecosystem.commit` commit), `--amend` refuses with an error: "The target commit was not created by ecosystem.commit and cannot be amended." The `docs/platform-version-log.generated.yaml` is regenerated with the new hash and version.

`platform.consistency.validate` gains a new PC-04 rule that checks git history for `X-Platform-Bump` trailers on commits touching platform scope, providing CI-side enforcement as a safety net for the local hook.

## Architectural fit

- **Architecture DNA (DNA-53):** This RFC automates the platform version bump that DNA-53 requires. The semantic hash → version coupling is enforced at commit time, not just at CI time. The hash is computed using `resolvePlatformSemanticHash` from `packages/os/site-kernel-handoff/src/bundle-io.ts`, which uses `@gogol/fingerprint` (DNA-53 compliant).
- **RFC-0364 (semantic fingerprint):** The platform scope (`packages/**`, `integrations/**`, `services/**`) is identical to the `platformSemanticHash` coverage defined in RFC-0364. The hook trigger and the hash computation use the same path set. **Note:** The existing `resolvePlatformSemanticHash` function only covers `packages/`. This RFC extends it to cover `integrations/` and `services/` as well, matching the platform scope.
- **RFC-0478 (platform versioning enforcement):** `ecosystem.commit` reads the `versionBump` frontmatter field introduced by RFC-0478. PC-01/PC-02/PC-03 rules remain as CI safety nets; PC-04 is added as a new CI-side trailer check. This RFC amends RFC-0478's nonGoal "Does not automate version bumping on commit" — automation is now the default for platform-scope changes.
- **RFC-0479 (migrator registry):** `versionBump: minor` implies Breaks-B and requires a migrator. `ecosystem.commit` does not perform `minor` or `major` bumps without an RFC reference (default is `patch`), preserving the migrator-ordering invariant. This RFC itself declares `versionBump: patch` — it adds platform infrastructure (command + hook + CI rule) without breaking any site data contract (Layer B), so no migrator is required.
- **Site OS operator model:** The command is registered in the `ECOSYSTEM_COMMANDS` table in `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts`, alongside `ecosystem.manifest.generate` and `ecosystem.manifest.validate`. Scope is `workspace`. The pre-commit hook is a developer-tooling concern, not a kernel command — it lives in `hooks/pre-commit` and is activated via `git config core.hooksPath hooks/`.
- **Mission workpiece separation:** `mission.git.commit` operates on client-site workpieces and is unaffected. `ecosystem.commit` operates on the platform repository root. The two paths never intersect.

## Design

### CLI surface

```sh
# Commit a platform change without an RFC (defaults to patch bump)
pnpm exec site-kernel run ecosystem.commit --message "fix: resolve null-pointer in fingerprint normalizer"

# Commit a platform change referencing an RFC (bump type from RFC frontmatter)
pnpm exec site-kernel run ecosystem.commit --message "feat: add ecosystem.commit command" --rfc RFC-0533

# Dry-run: preview the bump, new version, and PC-02/PC-03 forecast without committing
pnpm exec site-kernel run ecosystem.commit --message "fix: resolve null-pointer" --dry-run

# Amend the last commit (recalculates version, hash, trailers; refuses if pushed)
pnpm exec site-kernel run ecosystem.commit --message "fix: resolve null-pointer" --amend

# JSON output for agent consumption
pnpm exec site-kernel run ecosystem.commit --message "fix: ..." --json
```

Flags:

| Flag | Kind | Required | Description |
| --- | --- | --- | --- |
| `--message` | string | yes | Commit message body. Trailers are appended automatically. |
| `--rfc` | string | no | RFC-id (e.g. `RFC-0533`). When provided, bump type is read from the RFC's `versionBump` frontmatter. When absent, defaults to `patch`. |
| `--dry-run` | boolean | no | Preview bump, new version, hash, and PC-02/PC-03 forecast without committing or writing the log. |
| `--amend` | boolean | no | Amend the last commit instead of creating a new one. Recalculates version, hash, and trailers. Refuses if the target commit has been pushed to a remote. |
| `--json` | boolean | no | JSON output for agent consumption. |

### TypeScript contracts

```ts
interface EcosystemCommitInput {
  message: string;
  rfc?: string;          // e.g. "RFC-0533"
  dryRun?: boolean;
  amend?: boolean;
  json?: boolean;
}

interface EcosystemCommitResult {
  command: "ecosystem.commit";
  status: "ok" | "blocked" | "dry-run";
  previousVersion: string;
  newVersion: string;
  bumpType: "patch" | "minor" | "major";
  rfcId: string | null;
  platformSemanticHash: string;
  commitSha: string | null;   // null in dry-run mode
  trailers: {
    "X-Platform-Bump": string;
    "X-Platform-Version": string;
    "X-RFC"?: string;
  };
  pcForecast?: {
    pc02: "pass" | "warning";
    pc03: "pass" | "error";
  };
}

interface EcosystemCommitViolation {
  code: string;
  message: string;
  fixHint: string;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `package.json` (root) | Read for current version; `version` field bumped and staged by `ecosystem.commit`. Refuses if already staged by operator. |
| `docs/platform-version-log.generated.yaml` | Written atomically with new hash, version, timestamp; staged by `ecosystem.commit`. Refuses if already staged by operator. |
| `docs/rfcs/**/*.md` | Read when `--rfc` is provided — frontmatter `versionBump` field is extracted. RFC existence is verified. |
| `packages/**` | Platform scope — staged files here trigger the pre-commit hook requirement. Hash is computed over this tree. |
| `integrations/**` | Platform scope — same as `packages/**`. |
| `services/**` | Platform scope — same as `packages/**`. |
| `hooks/pre-commit` | New versioned file — the pre-commit hook script. Activated via `git config core.hooksPath hooks/`. |
| `packages/os/site-kernel-checks/src/ecosystem-commit.ts` | New file — `runEcosystemCommit` handler function. |
| `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts` | `ecosystem.commit` entry added to `ECOSYSTEM_COMMANDS` array. |
| `packages/os/site-kernel-handoff/src/platform-consistency.ts` | PC-04 rule added to `runPlatformConsistencyValidate`. |
| `packages/os/site-kernel-handoff/src/bundle-io.ts` | `resolvePlatformSemanticHash` extended to cover `integrations/` and `services/` in addition to `packages/`. |
| `AGENTS.md` (root) | Updated with instructions to use `ecosystem.commit` for platform-scope changes. |
| `docs/verification-plan.xml` | Updated to include PC-04 in the platform consistency verification flow. |

### Output format

```json
{
  "command": "ecosystem.commit",
  "status": "ok",
  "data": {
    "previousVersion": "4.5.0",
    "newVersion": "4.5.1",
    "bumpType": "patch",
    "rfcId": null,
    "platformSemanticHash": "sha256:abc123...",
    "commitSha": "a1b2c3d",
    "trailers": {
      "X-Platform-Bump": "patch",
      "X-Platform-Version": "4.5.1"
    }
  },
  "exitCode": 0,
  "summary": "Committed platform change: 4.5.0 → 4.5.1 (patch)"
}
```

Dry-run output:

```json
{
  "command": "ecosystem.commit",
  "status": "dry-run",
  "data": {
    "previousVersion": "4.5.0",
    "newVersion": "4.5.1",
    "bumpType": "patch",
    "rfcId": "RFC-0533",
    "platformSemanticHash": "sha256:abc123...",
    "commitSha": null,
    "trailers": {
      "X-Platform-Bump": "patch",
      "X-Platform-Version": "4.5.1",
      "X-RFC": "RFC-0533"
    },
    "pcForecast": {
      "pc02": "pass",
      "pc03": "pass"
    }
  },
  "exitCode": 0,
  "summary": "Dry-run: 4.5.0 → 4.5.1 (patch, RFC-0533)"
}
```

### Failure modes

All failures produce exit code 1 with a `status: "blocked"` result and at least one `EcosystemCommitViolation` with a `fixHint`.

| Code | Condition | Message | Fix hint |
| --- | --- | --- | --- |
| `EC-01` | No staged files in platform scope | "No staged files match platform scope (packages/\*\*, integrations/\*\*, services/\*\*)." | "Use `git commit` for non-platform changes, or stage platform files first." |
| `EC-02` | `package.json` already staged | "package.json is already staged by the operator." | "Unstage package.json — ecosystem.commit manages it exclusively." |
| `EC-03` | `docs/platform-version-log.generated.yaml` already staged | "platform-version-log.generated.yaml is already staged by the operator." | "Unstage the log file — ecosystem.commit manages it exclusively." |
| `EC-04` | RFC not found | "RFC-XXXX not found in docs/rfcs/." | "Run `rfc.next-id` for the next free RFC number, or `rfc.create --title \"...\"` to create one." |
| `EC-05` | `versionBump` absent in post-cutoff RFC | "RFC-XXXX has no versionBump field." | "Add `versionBump: patch\\ | minor\\ | none\\ | major` to RFC frontmatter before committing." |
| `EC-06` | `versionBump: none` | "RFC-XXXX declares versionBump: none — no version bump needed." | "Use `git commit` for prose-only RFC changes that do not touch platform scope." |
| `EC-07` | `--amend` on pushed commit | "The target commit has been pushed to a remote and cannot be amended." | "Create a new commit instead of amending." |

In `--json` mode, violations are returned as a `violations` array. In pretty mode, violations are printed to stderr with colored output.

## Rollout

- **Default behavior:** `ecosystem.commit` is available immediately upon implementation. The pre-commit hook is opt-in via `git config core.hooksPath hooks/` (automated by RFC-0534's `setup-ecosystem` skill and onboarding).
- **Existing operators:** must run `git config core.hooksPath hooks/` once to activate the hook. Until then, `ecosystem.commit` is available but not enforced locally — CI (PC-04) catches bypasses.
- **New operators:** get the hook automatically through onboarding.scaffold (RFC-0534) or the `setup-ecosystem` skill (RFC-0534).
- **CI integration:** PC-04 is added to `platform.consistency.validate` and runs in `build.check` as a gate. No grace period — PC-04 is an error from day one. The cutoff is the implementation commit SHA of this RFC (see PC-04 cutoff mechanism above).
- **No deprecation:** `git commit` is not deprecated for non-platform paths. It is only blocked for platform-scope paths when the hook is active.

## Alternatives considered

- **`--bump` flag on `ecosystem.commit`** — allow the operator to override the bump type (`--bump minor`) without an RFC. Rejected because it creates a loophole around RFC-0479's migrator requirement: `minor` = Breaks-B = migrator required. Without an RFC, there is no migrator. Bump type must come from RFC frontmatter or default to `patch`.

- **Husky for hook management** — use the `husky` npm package instead of `core.hooksPath`. Rejected because it adds a runtime dependency for a single hook file. `core.hooksPath hooks/` is a one-time git config with no dependency and the `hooks/` directory already exists in the repository (`hooks/setup-worktree.sh`).

- **CI-only enforcement (no local hook)** — rely solely on PC-04 in CI to catch bypasses. Rejected because the operator explicitly requires local feedback to prevent errors before they reach CI. The feedback loop of CI is minutes; the hook is seconds.

- **Env var only (no trailer)** — use `ECOSYSTEM_COMMIT` env var as the sole marker, skip commit-message trailers. Rejected because env vars are transient and leave no audit trail in git history. Trailers (`X-Platform-Bump`, `X-Platform-Version`, `X-RFC`) provide permanent traceability. CI (PC-04) checks trailers, not env vars.

- **Trailer only (no env var)** — check `X-Platform-Bump` trailer in the pre-commit hook by reading `.git/COMMIT_EDITMSG`. Rejected because `ecosystem.commit` passes the message via `-m`, which may not populate `COMMIT_EDITMSG` reliably. The env var is a simpler, more reliable transient gate for the hook; the trailer is the permanent record for CI.

- **Single RFC (RFC-0533 covers both core mechanism and setup automation)** — rejected in favor of two RFCs. The core mechanism (command + hook + PC-04) is `versionBump: patch` (platform infrastructure addition, no data contract break). Setup automation (skill + onboarding + docs) is also `versionBump: patch` (developer experience). Splitting allows independent implementation and release.

## Risks

- **Semantic hash computation latency** — `resolvePlatformSemanticHash` parses all `.ts` files in `packages/`. On a large tree, this adds seconds to each commit. Mitigated by computing after `git add` (working tree is final) and before `git commit` (single pass). Acceptable for platform commits, which are not high-frequency.

- **Env var bypass** — an agent or operator could set `ECOSYSTEM_COMMIT=1` manually and use `git commit` directly, bypassing the version bump. Mitigated by PC-04 in CI, which checks for `X-Platform-Bump` trailer in git history. The env var is a local convenience gate, not a security boundary.

- **Hook not activated** — if an operator forgets `git config core.hooksPath hooks/`, the hook is inactive and direct `git commit` works. Mitigated by RFC-0534 (onboarding + skill automation) and PC-04 (CI safety net).

- **Amend complexity** — `--amend` must undo the previous version bump before applying the new one. If the previous commit was a `minor` bump and the amend changes to `patch`, the version must be rolled back and re-bumped. Implementation must handle this carefully to avoid version drift.

- **Agent confusion** — AI agents accustomed to `git commit` may initially bypass `ecosystem.commit`. The hook error message includes a direct command to run and a "remember this rule" tip. AGENTS.md must be updated with explicit instructions to use `ecosystem.commit` for platform-scope changes.

## Acceptance criteria

- [x] `ecosystem.commit` command registered in `ECOSYSTEM_COMMANDS` table at `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts` (evidence: commit 2dd2bef57)
- [x] `ecosystem.commit --message <msg>` bumps `package.json` version, writes `docs/platform-version-log.generated.yaml` with working-tree semantic hash (`resolvePlatformSemanticHash`), and commits with `X-Platform-Bump` / `X-Platform-Version` trailers (evidence: ecosystem-commit.test.ts "actual commit bumps version and writes trailers" passes)
- [x] `ecosystem.commit --rfc RFC-XXXX` reads `versionBump` from RFC frontmatter; absent `versionBump` in post-cutoff RFC produces EC-05 error (evidence: ecosystem-commit.test.ts "EC-05" and "--rfc reads versionBump" pass)
- [x] `ecosystem.commit` refuses with EC-01 when no staged files match platform scope (`packages/**`, `integrations/**`, `services/**`) (evidence: ecosystem-commit.test.ts "EC-01" passes)
- [x] `ecosystem.commit` refuses with EC-02/EC-03 when `package.json` or `docs/platform-version-log.generated.yaml` are already staged (evidence: ecosystem-commit.test.ts "EC-02" passes)
- [x] `ecosystem.commit` refuses with EC-06 when RFC declares `versionBump: none` (evidence: ecosystem-commit.test.ts "EC-06" passes)
- [x] `ecosystem.commit --dry-run` outputs planned bump, new version, hash, and PC-02/PC-03 forecast without committing or writing the log (evidence: ecosystem-commit.test.ts "--dry-run returns forecast without committing" passes)
- [x] `ecosystem.commit --amend` recalculates version, hash, and trailers; refuses with EC-07 if target commit has been pushed to a remote (evidence: handler logic in ecosystem-commit.ts lines 200-225)
- [x] `ecosystem.commit` sets `ECOSYSTEM_COMMIT=1` env var when invoking `git commit` (evidence: ecosystem-commit.ts gitCommit call with env ECOSYSTEM_COMMIT: "1")
- [x] `hooks/pre-commit` script exists and blocks direct `git commit` when staged files include platform-scope paths and `ECOSYSTEM_COMMIT` env var is not set (evidence: commit 939b62bb6, hooks/pre-commit)
- [x] Hook error message includes the exact `ecosystem.commit` command to run and a "remember this rule" tip for AI agents (evidence: hooks/pre-commit lines 8-16)
- [x] PC-04 rule added to `platform.consistency.validate` — checks git history for `X-Platform-Bump` trailer on commits touching platform scope (evidence: commit 940c025cc, platform-consistency-pc04.test.ts 3 tests pass)
- [x] `--json` output format matches the `EcosystemCommitResult` interface (evidence: EcosystemCommitResult interface in ecosystem-commit.ts)
- [x] `AGENTS.md` updated with instructions to use `ecosystem.commit` for platform-scope changes (evidence: commit 8a4446be6)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate run in final validation step)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **Platform-scope commits:** Agents MUST use `ecosystem.commit --message <msg> [--rfc RFC-XXXX]` for any commit that includes files in `packages/**`, `integrations/**`, or `services/**`. Direct `git commit` for platform-scope changes is blocked by the pre-commit hook and by PC-04 in CI.
- **Non-platform commits:** Agents MAY use `git commit` directly for changes outside platform scope (e.g. `docs/rfcs/**`, `missions/**`, `onboarding/**`, `systems/**`).
- **RFC reference:** When implementing an RFC, agents MUST pass `--rfc RFC-XXXX` to `ecosystem.commit` so the bump type is read from the RFC frontmatter.
