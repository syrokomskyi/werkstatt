---
rfcId: RFC-0552
auditId: AUDIT-RFC-0552-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0552

## Verdict: Needs revision

The RFC contains a factual error in its core problem statement (problem 1 — git init is already implemented), a DNA invariant mismatch (DNA-54 is about bindings, not git/skill sync), and confused references to `forge.init` as a CLI command when it was removed by RFC-0546. The skill conflict reporting gap (problem 3) is real but the scenario needs reframing.

## Mechanical validation (rfc.validate)

Pass with 2 V-19 warnings:

- `RFC-0552.amends includes RFC-0545, but RFC-0545.amendedBy does not include RFC-0552`
- `RFC-0552.amends includes RFC-0546, but RFC-0546.amendedBy does not include RFC-0552`

These must be fixed during enhance by adding `RFC-0552` to the `amendedBy` arrays of RFC-0545 and RFC-0546.

## Axis A — Structural completeness

No structural issues. All required sections are present with real content. Decision is present tense. File system responsibilities table names concrete paths. Failure modes are documented. Acceptance criteria are checkable. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

**FAIL.** `satisfies: [DNA-54]` is incorrect. DNA-54 is the Forge bindings contract: "Canonical forge skill bodies must not contain hardcoded project-specific literals." This RFC does not change the bindings contract — it adds git init, skill commit, and conflict reporting. The RFC body says "DNA-54 (Forge bindings contract) — extends forge-bootstrap and forge.init behavior" but this is not about bindings; it is about git and skill conflict handling.

No existing DNA invariant is a natural fit for this RFC. Options:

- Drop `satisfies` entirely (the RFC is a hardening/bugfix, not all RFCs must satisfy a DNA invariant).
- If the operator wants a DNA reference, the closest is DNA-54 only if the RFC also adds a binding key for the skill commit behavior — but that would be over-engineering.

## Axis C — Ecosystem fit

**FAIL — multiple issues.**

1. **`forge.init` is removed as a CLI command.** The RFC repeatedly references `forge.init` as if it is still a standalone CLI command (problem statement 2, problem statement 3, design section 2, design section 3, file system responsibilities). RFC-0546 removed `forge.init` from `forgeCoreModule` registration. The internal function `runInit()` remains in `packages/forge/src/onboarding/init.ts` and is called exclusively by `forge.create`. The RFC must reference `runInit()` or `forge.create` (which calls `runInit()`), not `forge.init`.

2. **Timing confusion.** The RFC says "after `forge.init` copies skills into `.agents/skills/`, forge-bootstrap commits them." But `runInit()` is called by `forge.create` BEFORE `forge-bootstrap` runs. By the time `forge-bootstrap` runs, skills are already in `.agents/skills/`. The commit step must either:
   - Happen in `forge.create` after `runInit()` completes, or
   - Happen in `forge-bootstrap` after the skill sync (but `forge-bootstrap` does not sync skills — `forge.create` already did).

3. **Skill conflict scenario is unclear.** The RFC says "if the source project has skills in `.agents/skills/` with the same names as Forge skills." But in transplant mode, the source project's `.agents/skills/` would be copied to `apps/<appName>/.agents/skills/` by the migration adapter, not to the forge project root. The forge project root's `.agents/skills/` is populated by `runInit()` with Forge skills only. The conflict scenario the RFC describes does not occur in the transplant flow. The real conflict scenario is:
   - `forge.upgrade` re-runs `runInit()` and overwrites existing skills in `.agents/skills/` (including custom or pack skills with the same name).
   - Pack skills (RFC-0539) discovered via `discoverPackSkills` could have the same name as a Forge skill — `init.ts:206-208` copies them without existence checks.

4. **No AGENTS.md updates identified.** The RFC does not mention updating `packages/forge/AGENTS.md` or root `AGENTS.md` to document the new git init, commit, and conflict reporting behavior.

5. **V-19 warnings.** `amends: [RFC-0545, RFC-0546]` requires back-references in the amended RFCs' `amendedBy` arrays. These are currently missing.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers proposed. The RFC amends RFC-0545 and RFC-0546 directly.

## Axis E — Agent-facing policy

No issues. Implementation notes are explicit. No self-authorizing language. Status gate is correct (draft → accepted → implemented). References to RFC-0224 and RFC-0334 are present.

## Axis F — Pragmatism

**FAIL — problem 1 is already solved.**

1. **Git init is already implemented.** The RFC claims "if the source project has no `.git`, the transplant flow does not create one." This is factually incorrect:
   - `packages/forge/src/migration-adapters/git-utils.ts:42-45` — `runPostSetup()` already runs `git init` in the target directory when `.git` does not exist.
   - `packages/forge/skills/meta/forge-bootstrap/SKILL.md:125` — step 6.5 already says "If the source project has no `.git` directory: skip the git history question and run `git init` directly."
   - `packages/forge/skills/meta/forge-bootstrap/SKILL.md:121` — "If no: the skill runs `git init` in the new project (clean repository, no history from source)."

   The RFC should either drop problem 1 entirely or reframe it as a different gap (e.g., "git init is not committed with an initial commit" — but `runPostSetup` does run `git init`, it just doesn't make an initial commit).

2. **Problem 2 (uncommitted synced skills) is real but misattributed.** `runInit()` copies skills to `.agents/skills/` but does not commit them. This is a real gap. However, the fix belongs in `forge.create` (which calls `runInit()`) or in `runInit()` itself, not in `forge-bootstrap` (which runs after `forge.create`).

3. **Problem 3 (silent skill overwrites) is real but the scenario is wrong.** The overwrite happens in `runInit()` (init.ts:161-164) and `discoverPackSkills` (init.ts:206-208), not in the transplant source. The fix belongs in `runInit()`, not in the transplant flow.

## Axis G — Blind spots

1. **`forge.upgrade` not considered.** `forge.upgrade` also calls `runInit()` and would have the same overwrite issue. The RFC should address this or explicitly scope it out.

2. **Pack skills not considered.** `discoverPackSkills` (init.ts:194-236) copies pack skills without existence checks. The conflict detection logic should cover both Forge skills and pack skills.

3. **Initial commit content.** The RFC says `git init` + initial commit, but does not specify what goes in the initial commit. If `runInit()` hasn't run yet, there's nothing to commit. If it has, the commit should include the scaffolded project files + skills. The ordering matters.

4. **Greenfield mode not addressed.** The RFC says "Greenfield projects: git init is already handled by `forge.create`" but `forge.create` does NOT run `git init` — it only scaffolds and runs `runInit()`. Git init in greenfield mode happens in `forge-bootstrap` step 6.5, which is only reached if the operator chooses greenfield. If the operator skips `forge-bootstrap`, there is no git repository.

5. **No tests specified.** The RFC does not mention unit tests for the conflict detection logic, which is the only programmatic change (the rest is skill body edits).

## Questions for the author

1. **Problem 1 is already solved — should it be dropped?** `runPostSetup()` in `git-utils.ts` already runs `git init` when `.git` is absent, and SKILL.md step 6.5 already documents this. What gap remains that this RFC addresses?

2. **Where should the skill commit happen — `forge.create` or `forge-bootstrap`?** `runInit()` is called by `forge.create`, which runs before `forge-bootstrap`. If the commit belongs in `forge-bootstrap`, there may be a window where skills are uncommitted. If it belongs in `forge.create`, it should be added to `create.ts` after `runInit()` completes.

3. **What is the real conflict scenario?** The transplant source's `.agents/skills/` is copied to `apps/<appName>/.agents/skills/` by the migration adapter, not to the forge project root. The forge project root's `.agents/skills/` is populated by `runInit()` with Forge skills only. When would a conflict occur — during `forge.upgrade`? When pack skills have the same name as Forge skills? The RFC should describe the actual scenario it is fixing.
