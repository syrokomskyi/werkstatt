# Audit Report: RFC-0703 — Enforce platform version bump discipline and auto-pin on mission close

- **RFC**: RFC-0703
- **Status**: accepted
- **Kind**: architecture
- **Scope**: workspace
- **Audit date**: 2026-08-05
- **Validator**: agent (fo-idea-audit)
- **rfc.validate**: fail (1 violation — V-25: empty reviewers)

---

## Verdict: Needs revision

The RFC addresses two real invariant gaps (dormant pre-commit hook, no auto-pin on close), but the proposed `platform.commit.discipline.validate` command significantly overlaps with the existing PC-04 rule in `platform.consistency.validate`, and `ci.yml` is already out of sync with `CI_LOCAL_CHECKED_COMMANDS` (missing `platform.consistency.validate --check --json`). The auto-pin design doesn't specify registry write sequencing within `mission.close`. These issues should be resolved before implementation.

---

## Mechanical validation (rfc.validate)

**Fail** — 1 violation:

- **V-25**: accepted RFC created 2026-08-05 has empty `reviewers` — the deciding human must record their identity (RFC-0335).

This is a mechanical issue, not a semantic one. It will be fixed during implementation by adding the reviewer identity.

---

## Axis A — Structural completeness

No issues.

All standard sections are present and well-structured: Context, Problem, Decision, Architectural fit, Design, Rollout, Alternatives considered, Risks, Acceptance criteria, Implementation notes. The CLI surface shows exact commands with `--base` flag. TypeScript contracts are minimal and clear. File system responsibilities table maps each path to its role. Output format is documented with a concrete JSON example. Failure modes specify exit codes. Acceptance criteria are checkable (13 items). The `commands` frontmatter correctly lists `platform.commit.discipline.validate` under `proposed` and `mission.close` under `changed`.

---

## Axis B — DNA alignment

No issues.

- **DNA-44** (Sternsystem bundle contract): `system.pin.json` is the persistent version pin. Auto-pin on `mission.close` keeps it current without manual intervention. ✓
- **DNA-46** (Mission lifecycle): `mission.close` is the terminal lifecycle event. Adding pin-update at close ensures the site records the platform version it was validated against. ✓
- **DNA-47** (Materialization): `mission.materialize` uses `pinVersion` to determine catch-up. Auto-pin at close closes the loop: materialize detects drift → mission migrates → close pins to new version → next mission sees in-sync. ✓

The `satisfies` field correctly lists DNA-44, DNA-46, DNA-47.

---

## Axis C — Ecosystem fit

### Findings

**[C-1] `ci.local.validate` has no "pipeline" — it has `CI_LOCAL_CHECKED_COMMANDS`**

The RFC says "Command added to `ci.local.validate` pipeline". But `ci.local.validate` (`packages/os/site-kernel-checks/src/ci-local.ts`) doesn't have a pipeline — it has a `CI_LOCAL_CHECKED_COMMANDS` array that checks for command _presence_ in `ci.yml`. The correct integration is adding the new command string to this array. The RFC's wording is imprecise and could mislead the implementer.

**[C-2] `ci.yml` is already out of sync with `CI_LOCAL_CHECKED_COMMANDS`**

`CI_LOCAL_CHECKED_COMMANDS` includes `pnpm exec site-kernel run platform.consistency.validate --check --json` (added per RFC-0478), but `ci.yml` does NOT run this command. This means `ci.local.validate` currently fails with CI-LOCAL-01 in CI. The RFC proposes adding a new command to both `ci.yml` and `CI_LOCAL_CHECKED_COMMANDS` but doesn't notice or fix this pre-existing gap. The implementation should add the missing `platform.consistency.validate --check --json` step to `ci.yml` alongside the new `platform.commit.discipline.validate` step.

**[C-3] Registry write sequencing in `mission.close` not specified**

`mission.close` writes to the registry (`entry.currentMission = null` → `writeRegistry`) and then calls `commitWerkstattSideEffects` which commits `registry.yaml`. `sternsystem.pin` also writes to the registry (`entry.pinnedPlatform = platform` → `writeRegistry`). The RFC doesn't specify whether pin is called before or after `commitWerkstattSideEffects`. If pin is called after the commit, there will be an uncommitted registry change. If pin is called before `writeRegistry` in close, close's `writeRegistry` would overwrite pin's changes. The correct sequencing is: pin writes registry → close writes registry (clearing `currentMission`) → `commitWerkstattSideEffects` commits both changes in one commit. The RFC should specify this.

**[C-4] `sternsystem.pin` does not acquire locks — safe inside `mission.close`'s lock scope**

`mission.close` holds `registry`, `system:<id>`, and `mission:<id>` locks. `sternsystem.pin` reads and writes the registry without acquiring locks. Calling pin inside close's lock scope is safe (no lock re-acquisition), but the RFC should note that pin is called within the lock scope and must not release/re-acquire locks.

**[C-5] Compass XML synchronization not mentioned**

Adding a new command (`platform.commit.discipline.validate`) and changing `mission.close` likely affects `docs/verification-plan.xml` and possibly `docs/development-plan.xml`. The RFC doesn't mention which Compass files need synchronization. The `fo-doc-audit` step after implementation will catch this, but the RFC should flag it.

---

## Axis D — Forward-only compliance

No issues.

No compatibility shims are proposed. Hook activation via `git config core.hooksPath hooks` is forward-only — existing clones need one-time setup, new clones need it too, and CI gate is the backstop. Auto-pin on `mission.close` is forward-only — existing sites will benefit on their next mission close. No backward compatibility concerns.

---

## Axis E — Agent-facing policy

### Findings

**[E-1] `ECOSYSTEM_COMMIT=1` bypass mechanism not mentioned**

The RFC says "Agents MUST use `ecosystem.commit` for all platform-scope changes" and the pre-commit hook blocks direct `git commit`. But the RFC doesn't mention that `ecosystem.commit` sets `ECOSYSTEM_COMMIT=1` env var to bypass the hook (`hooks/pre-commit` line 8). Agents need to know this to understand why `ecosystem.commit` doesn't trigger the hook it's enforcing. This is an implementation detail, but it's critical for agent understanding.

**[E-2] "AGENTS.md updated" acceptance criterion is vague**

The acceptance criterion says "AGENTS.md updated with platform-scope commit discipline rule" but doesn't specify which AGENTS.md. Since the rule is workspace-wide, it should be the root `AGENTS.md`. The RFC should specify this.

---

## Axis F — Pragmatism

### Findings

**[F-1] (major) Significant overlap with existing PC-04 rule**

`platform.consistency.validate` already includes PC-04 (`packages/os/site-kernel-handoff/src/platform-consistency.ts:168-186`), which checks every commit since `PC_04_CUTOFF_SHA` for `X-Platform-Bump` trailer presence on platform-scope files. The proposed `platform.commit.discipline.validate` does the same check but with a `--base..HEAD` range.

The RFC's nonGoals says: "Validating X-Platform-Bump trailer values (patch/minor/major) — that is `platform.consistency.validate`'s job." But PC-04 checks trailer **presence**, not values. PC-01/02/03 check semantic correctness (hash drift, version bump correspondence). The RFC creates a false distinction to justify a separate command.

The real difference is:

- PC-04: checks all commits since a fixed cutoff SHA (cumulative, includes merged branches)
- Proposed command: checks only `--base..HEAD` range (per-PR isolation)

This is a meaningful difference — per-PR isolation is better for CI because it attributes violations to the specific PR, not to historical commits. But the RFC doesn't make this argument. It should either:

- (a) Extend `platform.consistency.validate` with a `--base` flag that switches from cutoff-based to range-based checking, or
- (b) Explicitly justify why a separate command is needed (per-PR isolation, standalone CI step, different output format with `violations[].files`).

Option (b) is reasonable — `platform.consistency.validate` is a workspace health check bundled with drift checks, and adding `--base` would conflate PR-range checking with drift checking. But the RFC must make this argument explicitly.

**[F-2] `violations[].files` field is a useful addition but could be added to PC-04**

The proposed `PlatformCommitDisciplineResult` includes `violations[].files` (platform-scope files in the commit). PC-04 doesn't expose this. This is a useful addition for debugging, but it could also be added to PC-04's output. The RFC should note this as an intentional design choice.

---

## Axis G — Blind spots

### Findings

**[G-1] Performance cost of `sternsystem.pin` on every `mission.close`**

`sternsystem.pin` calls `resolvePlatformSemanticHash` (hashes all `packages/`, `integrations/`, `services/` directories), `snapshotCapabilities`, and `allMigratorIds`. These are expensive operations (~2-5 seconds). Running this on every `mission.close` adds to the close flow duration. The RFC should note this cost and confirm it's acceptable.

**[G-2] Documentation-only changes in platform scope**

The RFC mentions README-in-packages as a false positive case and says `versionBump: none` + `ecosystem.commit` handles it. But `ecosystem.commit` blocks `versionBump: none` with EC-06 ("versionBump: none — no version bump needed") and suggests using `git commit`. But `git commit` is blocked by the pre-commit hook for platform scope. This creates a catch-22 for documentation-only changes in `packages/` that don't warrant a version bump. The RFC should address this edge case — possible solutions: (a) allow `ecosystem.commit` to proceed with `versionBump: none` (skip the version bump but still add the trailer), or (b) exempt documentation-only files from platform scope classification.

**[G-3] Archived systems and `sternsystem.pin` failure during `mission.close`**

The RFC says "If pin fails, the close fails. This is intentional." But for archived systems where the cache clone may have been removed, `sternsystem.pin` would fail with "cache clone for '<id>' is absent". This would permanently block close for archived systems. The RFC should either: (a) skip pin for archived systems, or (b) provide an escape hatch flag (e.g., `--skip-pin`).

**[G-4] `core.hooksPath hooks` activates ALL hooks in `hooks/`, not just `pre-commit`**

The RFC proposes `git config core.hooksPath hooks`. This makes git look for all hook types in `hooks/` (pre-commit, pre-push, post-merge, etc.). Currently only `pre-commit` exists in `hooks/`. The RFC should note that any future hooks added to `hooks/` will be automatically activated, and that `hooks/setup-worktree.sh` is NOT a git hook (it's a setup script).

---

## Questions for the author

1. Why not extend `platform.consistency.validate` with a `--base` flag instead of creating a new command? PC-04 already does trailer presence checking — the only difference is the commit range. If a separate command is preferred, please justify it explicitly (per-PR isolation, standalone CI step, different output format).
2. `ci.yml` is currently missing `platform.consistency.validate --check --json` (required by `CI_LOCAL_CHECKED_COMMANDS` since RFC-0478). Should the RFC fix this pre-existing gap as part of its CI changes?
3. Where exactly in the `mission.close` flow should `sternsystem.pin` be called — before or after `commitWerkstattSideEffects`? Pin writes to the registry, and close also writes to the registry. The sequencing matters for the auto-commit.
4. How should agents handle documentation-only changes in `packages/` (e.g., README updates) that don't warrant a version bump? `ecosystem.commit` blocks `versionBump: none` with EC-06, but `git commit` is blocked by the pre-commit hook.
