---
id: RFC-0754
title: "Unify commit path: ecosystem.commit auto-detect and fallback"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
enhancedAt: 2026-08-08
implementedAt: 2026-08-08
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0224
  - RFC-0362
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - ecosystem.commit
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel"
successSignals:
  - "ecosystem.commit handles both platform-scope and non-platform-scope staged files without operator choosing between ecosystem.commit and git commit."
  - "Platform version bump is applied only when at least one staged file matches platform scope (packages/**, integrations/**, services/**)."
  - "Non-platform-scope-only commits are delegated to git commit under the hood without a version bump."
  - "Mixed-scope commits are split into two sequential commits: platform (with bump) and non-platform (without bump)."
nonGoals:
  - Do not change the platform version bump logic itself (minor/patch/major rules stay in RFC-0224).
  - Do not remove the direct git commit guard for platform-scope files — the guard stays as a safety net.
  - Do not change how mission workpiece commits work (those use mission.git.commit, not ecosystem.commit).
  - Do not change the RFC-0704 independentVersionPackages skip-bump logic — the existing skip-bump path is preserved within the new auto-detect framework.
---

# RFC-0754: Unify commit path: ecosystem.commit auto-detect and fallback

## Context

The monorepo has two commit paths: `ecosystem.commit` (for platform-scope changes in `packages/**`, `integrations/**`, `services/**`) and direct `git commit` (for everything else). A pre-commit guard blocks direct `git commit` when platform-scope files are staged, redirecting to `ecosystem.commit`. Conversely, `ecosystem.commit` blocks with `EC-01` when no staged files match platform scope.

This creates a guessing game for operators and agents: which command to use? Picking wrong wastes a round-trip. During RFC-0752 implementation, this happened twice — once when committing ontology schema changes (needed `ecosystem.commit`), and once when committing only the RFC markdown file (`ecosystem.commit` blocked, had to use `git commit`).

## Problem

- **Operator must know scope rules before committing.** The correct command depends on which files are staged, which is not always obvious (e.g. a commit touching both `packages/` and `docs/`).
- **Mixed-scope commits are impossible.** If an operator stages both `packages/foo.ts` and `docs/rfcs/rfc-XXXX.md`, neither command works cleanly: `ecosystem.commit` wants only platform files, `git commit` is blocked for platform files.
- **Agent friction.** AI agents must inspect staged files, classify them, and choose the right command — adding unnecessary complexity to every commit step.

## Decision

`ecosystem.commit` becomes the single commit entry point. It auto-detects the scope of staged files and handles all three cases:

1. **Platform-scope only** — all staged files in `packages/**`, `integrations/**`, `services/**` → current behavior (version bump + commit).
2. **Non-platform-scope only** — no staged files in platform scope → delegate to `git commit` under the hood (no version bump).
3. **Mixed-scope** — split into two sequential commits: platform-scope files first (with bump), then non-platform-scope files (without bump). Both commits share the same message.

The direct `git commit` guard for platform-scope files remains as a safety net — but the primary path is always `ecosystem.commit`.

## Architectural fit

- **DNA-2 (pnpm workspace + Turborepo)** — no change to workspace structure.
- **RFC-0224 (platform versioning)** — version bump rules are unchanged; `ecosystem.commit` still applies the same bump logic when platform files are present.
- **RFC-0362 (Werkstatt atomic operations)** — the split-commit approach preserves atomicity per scope; each commit is independent.
- **Site OS operator model** — `ecosystem.commit` is a workspace-scope command; this change extends its coverage without adding a new command.

## Design

### CLI surface

```sh
# No change to flags — same interface, now handles all scopes
pnpm exec werkstatt run ecosystem.commit --message "feat: add new schema field"

# Dry-run still works
pnpm exec werkstatt run ecosystem.commit --message "..." --dry-run
```

### TypeScript contracts

The existing `EcosystemCommitInput` is extended — no flags are removed:

```ts
interface EcosystemCommitInput {
  message: string;
  rfc?: string;        // existing — retained
  bump?: string;       // existing — retained (patch|minor|major override)
  dryRun?: boolean;    // existing — retained
  amend?: boolean;     // existing — retained
  json?: boolean;      // existing — retained (output formatting, handled by kernel)
}
```

The existing `EcosystemCommitResult` is extended with an optional `nonPlatformCommit` field for the split-commit case. The existing single-commit fields (`previousVersion`, `newVersion`, `bumpType`, `rfcId`, `platformSemanticHash`, `commitSha`, `trailers`, `pcForecast`, `violations`, `skipPlatformBump`, `warnings`) remain unchanged — they describe the platform commit. When the commit is non-platform-only (case 2), the platform fields are empty/zero and `skipPlatformBump: true` is set. When the commit is mixed-scope (case 3), the platform fields describe the platform commit and `nonPlatformCommit` describes the second commit:

```ts
interface EcosystemCommitResult {
  // ... all existing fields unchanged ...
  nonPlatformCommit?: {
    sha: string;
    files: string[];
  };
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/ecosystem-commit.ts` | Main handler — scope detection, split logic, delegation |
| `packages/os/site-kernel/src/platform-scope.ts` | `isPlatformScope` helper — already exported, reused for scope detection |
| `.git/hooks/pre-commit` | Existing guard remains; no change needed |

### Output format

Non-platform-only commit (case 2 — new fallback):

```json
{
  "command": "ecosystem.commit",
  "status": "ok",
  "previousVersion": "",
  "newVersion": "",
  "bumpType": "none",
  "rfcId": null,
  "platformSemanticHash": "",
  "commitSha": "def5678",
  "trailers": {},
  "skipPlatformBump": true
}
```

Mixed-scope commit (case 3 — split into two commits):

```json
{
  "command": "ecosystem.commit",
  "status": "ok",
  "previousVersion": "4.61.0",
  "newVersion": "4.61.1",
  "bumpType": "patch",
  "rfcId": "RFC-0754",
  "platformSemanticHash": "sha256:abc...",
  "commitSha": "abc1234",
  "trailers": {
    "X-Platform-Bump": "patch",
    "X-Platform-Version": "4.61.1",
    "X-RFC": "RFC-0754"
  },
  "nonPlatformCommit": {
    "sha": "def5678",
    "files": ["docs/rfcs/rfc-0754-unify-commit-path.md"]
  }
}
```

### Failure modes

- **No staged files** — error: "No staged files to commit." (unchanged)
- **Platform-scope guard violation in split path** — if the non-platform commit somehow includes platform files, the guard catches it. This should not happen because the split is explicit.
- **Git failure on second commit (mixed-scope)** — the first commit (platform) is already done. The command reports the failure with the platform commit SHA and the list of pending non-platform files, advising: "Platform commit <sha> succeeded. Non-platform commit failed. Run `git add <files> && git commit -m '<message>'` to commit the remaining files manually."
- **`--amend` with non-platform or mixed-scope** — `--amend` only applies to the platform commit. If no platform files are staged (case 2), `--amend` is an error: "--amend requires platform-scope files." In mixed-scope (case 3), the platform commit is amended; the non-platform commit is a new commit.

### Interaction with RFC-0704 skipPlatformBump

The existing `skipPlatformBump` path (RFC-0704) is preserved within the new auto-detect framework. The auto-detect logic runs in this order:

1. **Get staged files** — `git diff --cached --name-only`.
2. **Partition** — split staged files into `platformFiles` and `nonPlatformFiles` using `isPlatformScope()`.
3. **Platform subset check** — if `platformFiles` is non-empty, run the existing `skipPlatformBump` checks on `platformFiles`:
   - All in `independentVersionPackages` → skip bump for the platform commit.
   - All documentation-only (`.md`) → skip bump for the platform commit.
   - Otherwise → apply version bump (existing logic: `--bump` override > RFC `versionBump` > default `patch`).
4. **Non-platform subset** — `nonPlatformFiles` always commit without bump, regardless of `skipPlatformBump`.
5. **Commit ordering** — platform commit first (with or without bump per step 3), then non-platform commit.

This means a commit with only `.md` files in `packages/` still skips the bump (RFC-0704 preserved), while a commit with `.md` files in `docs/` delegates to the non-platform path (new fallback).

### Flag behavior in mixed-scope commits

- **`--rfc`**: The `X-RFC` trailer is attached to the platform commit only. The non-platform commit does not carry the trailer.
- **`--bump`**: The override applies to the platform commit only. The non-platform commit never has a bump.
- **`--amend`**: Amends the platform commit. The non-platform commit is a new commit. If no platform files are staged, `--amend` is an error.
- **`--dry-run`**: Reports what would happen for each scope: platform commit forecast (existing fields) + non-platform commit plan.

### Split-commit mechanics

The split is performed via `git reset HEAD -- <non-platform-files>` + `git add <platform-files>` (if not already staged) + commit, then `git add <non-platform-files>` + commit. The `ECOSYSTEM_COMMIT=1` env var is set for both commits to bypass the pre-commit guard. The guard does not fire for non-platform files anyway, but the env var ensures no interference.

## Rollout

- **Default behavior**: `ecosystem.commit` immediately handles all scopes. No flag day.
- **Existing apps**: no migration needed — the command interface is unchanged (flags retained, result extended).
- **Direct `git commit` guard**: stays in place. Operators who bypass `ecosystem.commit` for platform files still get the guard error. Over time, the guard becomes a safety net rather than the primary enforcement.
- **Agent guidance**: update root `AGENTS.md` § ecosystem.commit rules to state "always use `ecosystem.commit`" instead of "use `ecosystem.commit` for platform changes, `git commit` otherwise".
- **Compass sync**: run `command.manifest.generate` if the command's flag set or metadata changes in the kernel config.
- **AGENTS.md sections to update**: root `AGENTS.md` (ecosystem.commit usage rule), `packages/os/site-kernel-checks/AGENTS.md` (handler ownership note).

## Alternatives considered

- **Remove the guard entirely** — rejected. The guard prevents accidental platform-scope commits without version bumps. Keeping it as a safety net is safer.
- **Make `git commit` auto-delegate to `ecosystem.commit`** — rejected. Git hooks cannot reliably intercept and replace commands; the guard can only block, not redirect.
- **Add a `--scope auto` flag** — rejected. Auto-detect should be the default, not opt-in. Adding a flag increases cognitive load.

## Risks

- **Split-commit atomicity**: in mixed-scope commits, the platform commit succeeds but the non-platform commit fails. Mitigated by clear error reporting and the fact that the operator can re-commit the remaining files.
- **Behavior change for agents**: agents that currently choose between `ecosystem.commit` and `git commit` will always use `ecosystem.commit`. This is simpler but is a behavior change — update `AGENTS.md` promptly.
- **Performance**: scope detection requires `git diff --cached --name-only`, which is fast even for large repos.

## Acceptance criteria

- [x] `ecosystem.commit` handles platform-scope-only commits with version bump (existing behavior preserved) (evidence: packages/os/site-kernel-checks/src/ecosystem-commit.ts:488-748, test 'actual commit bumps version and writes trailers')
- [x] `ecosystem.commit` handles non-platform-scope-only commits without version bump (new fallback) (evidence: packages/os/site-kernel-checks/src/ecosystem-commit.ts:327-374, test 'RFC-0754: non-platform-only commit succeeds without version bump')
- [x] `ecosystem.commit` handles mixed-scope commits by splitting into two sequential commits (evidence: packages/os/site-kernel-checks/src/ecosystem-commit.ts:377-386,691-729, test 'RFC-0754: mixed-scope commit splits into two commits')
- [x] RFC-0704 `skipPlatformBump` path is preserved — `.md`-only and `independentVersionPackages` files in platform scope still skip the bump (evidence: packages/os/site-kernel-checks/src/ecosystem-commit.ts:285-300,385-486, test 'RFC-0754: skipPlatformBump preserved — .md files in packages/ still skip bump in mixed-scope')
- [x] `--rfc` trailer is attached to the platform commit only in mixed-scope commits (evidence: packages/os/site-kernel-checks/src/ecosystem-commit.ts:616-618, test 'RFC-0754: --rfc trailer on platform commit only in mixed-scope')
- [x] `--bump` override applies to the platform commit only in mixed-scope commits (evidence: packages/os/site-kernel-checks/src/ecosystem-commit.ts:488-501, non-platform commit at 691-729 uses plain message without bump)
- [x] `--amend` amends the platform commit; errors if no platform files are staged (evidence: packages/os/site-kernel-checks/src/ecosystem-commit.ts:276-283 EC-11, test 'RFC-0754: EC-11 --amend with non-platform only → error')
- [x] `--dry-run` reports what would happen for each scope (evidence: packages/os/site-kernel-checks/src/ecosystem-commit.ts:329-346,387-413,627-661, tests 'RFC-0754: non-platform-only commit succeeds without version bump (dry-run)' and 'RFC-0754: mixed-scope commit splits into two commits (dry-run)')
- [x] `--json` output includes `nonPlatformCommit` field when mixed-scope split occurs (evidence: packages/os/site-kernel-checks/src/ecosystem-commit.ts:74-77,743, test 'RFC-0754: mixed-scope commit splits into two commits (actual)' verifies nonPlatformCommit.sha and .files)
- [x] Direct `git commit` guard for platform-scope files remains functional (hooks/pre-commit unchanged) (evidence: hooks/pre-commit:10-20, ECOSYSTEM_COMMIT env var bypass preserved)
- [x] Root `AGENTS.md` updated to direct agents to always use `ecosystem.commit` (evidence: AGENTS.md:108-113, 'Agents MUST use ecosystem.commit for all commits')
- [x] Unit tests cover all three scope scenarios (platform-only, non-platform-only, mixed-scope) (evidence: packages/os/site-kernel-checks/src/tests/ecosystem-commit.test.ts, tests 'actual commit bumps version and writes trailers', 'RFC-0754: non-platform-only commit succeeds without version bump', 'RFC-0754: mixed-scope commit splits into two commits')
- [x] Unit tests verify `skipPlatformBump` is still applied within the platform subset (evidence: packages/os/site-kernel-checks/src/tests/ecosystem-commit.test.ts, test 'RFC-0754: skipPlatformBump preserved — .md files in packages/ still skip bump in mixed-scope')
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0754 --json → exitCode 0, zero errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits. Use `rfc.implement.stamp --id RFC-0754 --implementation-commit <sha>` (RFC-0476) — direct edits to `status`/`implementedAt` are prohibited.
- Agents MUST NOT weaken or remove the direct `git commit` guard for platform-scope files — it remains as a safety net.
- Agents MUST NOT change the version bump logic (minor/patch/major rules stay in RFC-0224).
- Agents MUST NOT remove the `--rfc`, `--bump`, or `--amend` flags — they are retained.
- Agents MUST preserve the RFC-0704 `skipPlatformBump` path within the platform subset.
