---
rfcId: RFC-0575
planId: PLAN-RFC-0575-01
status: draft
owner: architecture
createdAt: 2026-07-28
updatedAt:
scope:
  apps: []
  packages: []
  services: []
  docs:
    - AGENTS.md
    - .agents/skills/fo-idea-implement/SKILL.md
    - .agents/skills/fo-fix/SKILL.md
---

# Implementation Plan: RFC-0575

## 1. Objectives

- [ ] Objective 1 — Add NON-NEGOTIABLE session-start pre-flight rule to AGENTS.md §Commit discipline (maps to acceptance criterion 1)
- [ ] Objective 2 — Add pre-flight git status step to fo-idea-implement SKILL.md (maps to acceptance criterion 2)
- [ ] Objective 3 — Add pre-flight git status step to fo-fix SKILL.md (maps to acceptance criterion 3)
- [ ] Objective 4 — Verify rfc.validate passes on RFC-0575 (maps to acceptance criterion 4)

## 2. Affected artifacts

### 2.1 Code and commands

No code or commands are affected. This is a prose-only policy RFC.

### 2.2 Configuration and data

No configuration or data files are affected.

### 2.3 Documentation and specs

- `AGENTS.md` (root) — §Commit discipline (RFC-0480) section, adding a new NON-NEGOTIABLE bullet for session-start pre-flight
- `.agents/skills/fo-idea-implement/SKILL.md` — adding a pre-flight step before step 3.1 (Prerequisite checks)
- `.agents/skills/fo-fix/SKILL.md` — adding a pre-flight step before step 1 (Check for an existing review)

### 2.4 Validation and pipelines

- `rfc.validate` on RFC-0575 — must pass with zero RFC-0575-specific errors
- No build checks needed (prose-only changes to `.md` files)
- No pipeline changes

## 3. Step sequence

### Step 1. Add session-start pre-flight rule to AGENTS.md

**Goal:** Add a NON-NEGOTIABLE bullet to the §Commit discipline (RFC-0480) section in root AGENTS.md.

**Agent actions:**

- Read `AGENTS.md` §Commit discipline (lines 171–205).
- Add a new NON-NEGOTIABLE bullet after the existing "Session-start pre-flight" content. The bullet text (from RFC-0575 §Design → AGENTS.md rule placement):

```markdown
- **Session-start pre-flight (NON-NEGOTIABLE):** At the start of `fo-idea-implement`
  and `fo-fix` skill pipelines, the agent MUST run `git status --short` in the werkstatt
  root and in each active mission workpiece (if any). If foreign uncommitted changes are
  found, the agent MUST: (1) report them to the operator, (2) never modify, stage, or
  discard them, (3) stage only its own files by explicit path, (4) verify
  `git diff --cached --name-only` before every commit excludes foreign files.
```

- Insert the bullet after the existing "Before sending any response to the operator..." bullet (line 204) and before the "Git hook activation" bullet (line 205).

**Validation:**

- `grep -n "Session-start pre-flight" AGENTS.md` — confirms the rule text is present.

**Completion criterion:** AGENTS.md §Commit discipline contains the NON-NEGOTIABLE session-start pre-flight bullet with the full 4-point procedure.

**Human review:** no

---

### Step 2. Add pre-flight step to fo-idea-implement SKILL.md

**Goal:** Add a pre-flight git status check step before the existing step 3.1 (Prerequisite checks) in fo-idea-implement.

**Agent actions:**

- Read `.agents/skills/fo-idea-implement/SKILL.md` lines 44–60.
- Insert a new step "#### 3.0. Pre-flight: git status check" before "#### 3.1. Prerequisite checks (per RFC)".
- Step text (from RFC-0575 §Design → fo-skill modifications):

```markdown
#### 3.0. Pre-flight: git status check

Before starting implementation, check the working tree for foreign uncommitted changes:

1. Run `git status --short` in the werkstatt root.
2. If `systems/registry.yaml` has a `currentMission`, also run `git status --short` in
   each active mission workpiece directory (`missions/<missionId>/workpiece/`).
3. If either repository has changes, report them to the operator before proceeding.
4. Treat all pre-existing changes as foreign — never modify, stage, or discard them.
5. When committing, stage only files you created or modified in this session by explicit
   path. Never use `git add -A` or `git add .`.
6. Before every commit, verify `git diff --cached --name-only` excludes foreign files.
```

**Validation:**

- `grep -n "Pre-flight: git status check" .agents/skills/fo-idea-implement/SKILL.md` — confirms the step is present.

**Completion criterion:** fo-idea-implement SKILL.md contains the pre-flight step before step 3.1 with the full 6-point procedure.

**Human review:** no

---

### Step 3. Add pre-flight step to fo-fix SKILL.md

**Goal:** Add a pre-flight git status check step before the existing step 1 (Check for an existing review) in fo-fix.

**Agent actions:**

- Read `.agents/skills/fo-fix/SKILL.md` lines 32–34.
- Insert a new step "### 0. Pre-flight: git status check" before "### 1. Check for an existing review".
- Step text (same as step 2, from RFC-0575 §Design → fo-skill modifications):

```markdown
### 0. Pre-flight: git status check

Before starting the fix workflow, check the working tree for foreign uncommitted changes:

1. Run `git status --short` in the werkstatt root.
2. If `systems/registry.yaml` has a `currentMission`, also run `git status --short` in
   each active mission workpiece directory (`missions/<missionId>/workpiece/`).
3. If either repository has changes, report them to the operator before proceeding.
4. Treat all pre-existing changes as foreign — never modify, stage, or discard them.
5. When committing, stage only files you created or modified in this session by explicit
   path. Never use `git add -A` or `git add .`.
6. Before every commit, verify `git diff --cached --name-only` excludes foreign files.
```

**Validation:**

- `grep -n "Pre-flight: git status check" .agents/skills/fo-fix/SKILL.md` — confirms the step is present.

**Completion criterion:** fo-fix SKILL.md contains the pre-flight step before step 1 with the full 6-point procedure.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify all files in `scope.docs` are updated: `AGENTS.md`, `.agents/skills/fo-idea-implement/SKILL.md`, `.agents/skills/fo-fix/SKILL.md`.
- No `docs/*.xml` Compass files need updates — this RFC does not change repository-wide semantics, shared package contracts, or app-package relationships.
- No `docs/architecture-dna.md` update needed — no new DNA invariant.
- No `ecosystem.manifest.generate` needed — no command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented changes. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0575 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --root docs/rfcs/rfc-0575-session-start-pre-flight-git-status-guard-for-agent-work-hygiene.md` — zero RFC-0575-specific errors.
- Every file in `scope.docs` is updated.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --root docs/rfcs/rfc-0575-session-start-pre-flight-git-status-guard-for-agent-work-hygiene.md` — zero RFC-0575-specific errors
- No build checks needed (prose-only changes to `.md` files, no `packages/*` or `apps/*` touched)
- No acceptance probes declared in RFC frontmatter

### 4.2 Evidence artifacts

- No verification evidence file needed (no acceptance probes declared)
- Commit messages referencing `RFC-0575` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent non-compliance — soft guard depends on agent discipline | Step 1 puts the rule in AGENTS.md as NON-NEGOTIABLE; fo-review checks session commits for foreign file contamination |
| False sense of safety — operators may assume full contamination prevention | Step 1 rule text is explicit about what the agent MUST and MUST NOT do |
| Skill drift — pre-flight step lost if SKILL.md is regenerated | Step 1 AGENTS.md rule is the primary enforcement surface; skill steps are reinforcing |
| Workpiece path resolution — stale currentMission | RFC §Failure modes covers this: pre-flight skips missing workpiece silently |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0575 --reason "..." --invariant "DNA-N"` instead of working around it.
