---
id: RFC-0703
title: "Enforce platform version bump discipline and auto-pin on mission close"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-44
  - DNA-46
  - DNA-47
  - RFC-0533
satisfies:
  - DNA-44
  - DNA-46
  - DNA-47
versionBump: minor
commands:
  proposed:
    - platform.commit.discipline.validate
  added: []
  changed:
    - mission.close
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "platform.commit.discipline.validate blocks PRs with platform-scope commits missing X-Platform-Bump trailer"
  - "mission.close updates system.pin.json and registry pinnedPlatform after successful close"
  - "pre-commit hook blocks direct git commit for platform-scope changes"
nonGoals:
  - "Retrofitting version bumps for past commits that bypassed ecosystem.commit"
  - "Automatic pin propagation to all systems on every ecosystem.commit"
  - "Validating X-Platform-Bump trailer values (patch/minor/major) — that is platform.consistency.validate's job"
---

# RFC-0703: Enforce platform version bump discipline and auto-pin on mission close

## Context

The Werkstatt has a `pre-commit` hook at `hooks/pre-commit` that blocks direct `git commit` for platform-scope changes (`packages/**`, `integrations/**`, `services/**`) and directs the operator to `ecosystem.commit`. However, this hook is not activated — `git config core.hooksPath` is unset, and no `.git/hooks/pre-commit` symlink exists. As a result, 46 of the last 50 platform-scope commits bypassed `ecosystem.commit` and were committed via plain `git commit`, leaving the platform version frozen at 4.5.4 despite significant platform changes.

Additionally, `sternsystem.pin` — the only command that updates `system.pin.json` and `pinnedPlatform` in the registry — is a manual step. Neither `mission.close` nor `mission.reconcile` invokes it. This means sites are not reliably re-pinned to the current platform version after a mission completes, creating drift between the actual platform version and the recorded pin.

## Problem

Two invariant gaps:

1. **No enforced version bump discipline.** The pre-commit hook exists but is dormant. There is no CI gate that checks for `X-Platform-Bump` trailers on platform-scope commits. An operator or agent can commit platform changes without bumping the version, and nothing catches it until a manual `platform.consistency.validate` run — which may never happen.

2. **No auto-pin on mission close.** `mission.materialize` detects version drift (`pinVersion < platformVersion` → "catch-up") and runs migration. But after the mission completes, the pin is not updated. The site's `system.pin.json` still records the old platform version, so the next mission sees the same "catch-up" verdict even though the site already migrated.

## Decision

The kernel gains a `platform.commit.discipline.validate` command that checks every commit in a `--base..HEAD` range for `X-Platform-Bump` trailers when the commit touches platform scope. This command is added to CI (`ci.yml`) and `ci.local.validate`. The pre-commit hook is activated via `git config core.hooksPath hooks`. `mission.close` calls `sternsystem.pin` after successful close to update the site's pin to the current platform version.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract):** `system.pin.json` is the persistent version pin. Auto-pin on `mission.close` keeps it current without manual intervention.
- **DNA-46 (Mission lifecycle):** `mission.close` is the terminal lifecycle event. Adding pin-update at close ensures the site records the platform version it was validated against.
- **DNA-47 (Materialization):** `mission.materialize` uses `pinVersion` to determine catch-up. Auto-pin at close closes the loop: materialize detects drift → mission migrates → close pins to new version → next mission sees in-sync.

## Design

### CLI surface

```sh
# CI gate (in ci.yml)
pnpm exec site-kernel run platform.commit.discipline.validate --base origin/main --json

# Local pre-push check (in ci.local.validate pipeline)
pnpm exec site-kernel run platform.commit.discipline.validate --base main --json
```

`--base` is required — no default. The command resolves the base ref via `git rev-parse --verify <base>` and fails hard if the ref does not exist.

### TypeScript contracts

```ts
interface PlatformCommitDisciplineInput {
  base: string; // required — git ref (e.g. "origin/main", "main")
}

interface PlatformCommitDisciplineResult {
  command: "platform.commit.discipline.validate";
  status: "pass" | "fail";
  base: string;
  checkedCommits: number;
  platformScopeCommits: number;
  violations: Array<{
    sha: string;
    subject: string;
    files: string[]; // platform-scope files in this commit
    message: string;
  }>;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `hooks/pre-commit` | Existing hook — activated via `git config core.hooksPath hooks` |
| `.github/workflows/ci.yml` | New CI step calling `platform.commit.discipline.validate --base origin/main` |
| `packages/os/site-kernel-checks/src/platform-commit-discipline.ts` | New command handler |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | Modified — calls `sternsystem.pin` after successful close |
| `tools/kernel.config.ts` | Register new command |

### Output format

```json
{
  "command": "platform.commit.discipline.validate",
  "status": "fail",
  "base": "origin/main",
  "checkedCommits": 12,
  "platformScopeCommits": 3,
  "violations": [
    {
      "sha": "c0d1e73",
      "subject": "fix(ui): close overflow menu when header hides on scroll",
      "files": ["packages/ui/src/components/header/header-component.astro"],
      "message": "Commit touches platform scope but has no X-Platform-Bump trailer. Use ecosystem.commit for platform-scope changes."
    }
  ]
}
```

### Failure modes

- **Base ref not found:** `exitCode: 1`, error message "Could not resolve base ref '<base>'. Ensure the ref exists." No silent skip.
- **Violations found:** `exitCode: 1`, status `fail`, violations array populated.
- **No platform-scope commits:** `exitCode: 0`, status `pass`, `platformScopeCommits: 0`.
- **All platform-scope commits have trailers:** `exitCode: 0`, status `pass`.

## Rollout

- **Pre-commit hook activation:** `git config core.hooksPath hooks` — one-time setup on the werkstatt root. Documented in AGENTS.md.
- **CI gate:** Added as a new step in the existing `autonomous-quality` job in `ci.yml`. Runs on every PR.
- **`ci.local.validate`:** Command added to the local pipeline so operators and agents can catch violations before push.
- **`mission.close` auto-pin:** Integrated into the existing close flow. After all close steps succeed, `sternsystem.pin --id <systemId>` is called. If pin fails, the close fails.
- **Existing sites:** No migration needed. The next mission for each site will naturally benefit from auto-pin at close.

## Alternatives considered

- **Shell-only CI check (no kernel command):** Rejected — not reusable locally, not testable, not JSON-structured.
- **Automatic pin on every `ecosystem.commit`:** Rejected — operator may make several platform changes before migrating a site. Auto-pin per commit creates registry churn.
- **Pin on `mission.materialize` (start of mission):** Rejected — pin should record the version the site was validated against, not the version at the start of work.
- **Trailer value validation (patch/minor/major):** Rejected — that is `platform.consistency.validate`'s responsibility (PC-01, PC-02). This command checks process discipline, not semantic correctness.

## Risks

- **False positives:** A commit that touches `packages/` for a non-platform reason (e.g. updating a README inside `packages/`) will be flagged. Mitigation: `versionBump: none` in the RFC + `ecosystem.commit` still produces the trailer.
- **Hook not activated on fresh clone:** `git config core.hooksPath hooks` is per-clone. New clones need activation. CI gate is the backstop.
- **`mission.close` pin failure blocks close:** If `sternsystem.pin` fails (e.g. cache clone missing), the mission cannot close. This is intentional — a mission that cannot pin is in an inconsistent state.

## Acceptance criteria

- [x] `platform.commit.discipline.validate` command implemented in `packages/os/site-kernel-checks` (evidence: packages/os/site-kernel-checks/src/platform-commit-discipline.ts)
- [x] Command registered in `tools/kernel.config.ts` (evidence: packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts:341-361 — registered via ECOSYSTEM_COMMANDS, auto-registered by createStandardCheckModule)
- [x] `--base` flag required, no default (evidence: packages/os/site-kernel-checks/src/platform-commit-discipline.ts:106-111 — throws if --base missing)
- [x] Command fails hard when base ref cannot be resolved (evidence: packages/os/site-kernel-checks/src/platform-commit-discipline.ts:67-69 — throws Error)
- [x] Command checks only platform-scope commits for `X-Platform-Bump` trailer presence (evidence: packages/os/site-kernel-checks/src/platform-commit-discipline.ts:118-121 — hasPlatformScopeFiles + hasTrailer)
- [x] CI step added to `ci.yml` in the `autonomous-quality` job (evidence: .github/workflows/ci.yml:81-82)
- [x] Command added to `ci.local.validate` pipeline (evidence: packages/os/site-kernel-checks/src/ci-local.ts:41)
- [x] `mission.close` calls `sternsystem.pin` after successful close (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:473-496)
- [x] Pre-commit hook activated via `git config core.hooksPath hooks` (evidence: git config core.hooksPath = hooks)
- [x] Unit tests for `platform.commit.discipline.validate` (pass, fail, base-not-found, no-platform-commits) (evidence: packages/os/site-kernel-checks/src/tests/platform-commit-discipline.test.ts)
- [x] Unit test for `mission.close` auto-pin behavior (evidence: packages/os/site-kernel-handoff/src/tests/mission-close-auto-pin.test.ts)
- [x] `AGENTS.md` updated with platform-scope commit discipline rule (evidence: AGENTS.md:85-90)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate --id RFC-0703 exitCode 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Agents MUST use `ecosystem.commit` for all platform-scope changes. Direct `git commit` for `packages/**`, `integrations/**`, `services/**` is blocked by the pre-commit hook and the CI gate.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0703 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
