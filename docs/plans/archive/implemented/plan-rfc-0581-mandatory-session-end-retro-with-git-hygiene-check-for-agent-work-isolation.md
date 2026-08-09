---
rfcId: RFC-0581
planId: PLAN-RFC-0581-01
status: draft
owner: architecture
createdAt: 2026-07-29
updatedAt:
scope:
  apps: []
  packages: []
  services: []
  docs:
    - AGENTS.md
    - .agents/skills/fo-session-retro/SKILL.md
---

# Implementation Plan: RFC-0581

## 1. Objectives

- [ ] Objective 1 — Add `## Session-end discipline (RFC-0581)` section to `AGENTS.md` after `## Commit discipline (RFC-0480)` — maps to acceptance criterion 1
- [ ] Objective 2 — Add step 1.5 "Git hygiene check" to `fo-session-retro/SKILL.md` before step 2 — maps to acceptance criterion 2
- [ ] Objective 3 — Verify the git hygiene check procedure covers werkstatt root and active mission workpieces — maps to acceptance criterion 3
- [ ] Objective 4 — Verify the rule states no auto-commit — maps to acceptance criterion 4
- [ ] Objective 5 — Verify trigger vocabulary includes English, Russian, and German phrases — maps to acceptance criterion 5
- [ ] Objective 6 — `rfc.validate` passes on RFC-0581 — maps to acceptance criterion 6

## 2. Affected artifacts

### 2.1 Code and commands

None. This RFC introduces no new commands, no code changes, no package modifications.

### 2.2 Configuration and data

None. No YAML/JSON/manifest changes.

### 2.3 Documentation and specs

- `AGENTS.md` (root) — new `## Session-end discipline (RFC-0581)` section after `## Commit discipline (RFC-0480)` (line ~208) and before `## HDRI identity firewall...` (line ~209).
- `.agents/skills/fo-session-retro/SKILL.md` — new step 1.5 "Git hygiene check" between step 1 (Read preferences and shared conventions) and step 2 (Gather session insights), around line 97.

### 2.4 Validation and pipelines

- `rfc.validate RFC-0581` — mechanical validation of the RFC file.
- No build checks needed (no code changes).
- No acceptance probes (RFC has none declared).

## 3. Step sequence

### Step 1. Add Session-end discipline section to AGENTS.md

**Goal:** Add the NON-NEGOTIABLE session-end discipline rule to the root AGENTS.md.

**Agent actions:**

- Read `AGENTS.md` to confirm current structure around `## Commit discipline (RFC-0480)` (line ~172) and `## HDRI identity firewall...` (line ~209).
- Insert a new `## Session-end discipline (RFC-0581)` section after the last bullet of `## Commit discipline (RFC-0480)` (after the Git hook activation bullet, line ~207) and before `## HDRI identity firewall...` (line ~209).
- Use the exact rule text from RFC-0581 §Design → AGENTS.md rule placement.

**Validation:**

- `grep -n "Session-end discipline" AGENTS.md` — confirms the section exists.
- `grep -n "RFC-0581" AGENTS.md` — confirms the RFC reference is present.

**Completion criterion:** `AGENTS.md` contains a `## Session-end discipline (RFC-0581)` section with the git hygiene check rule, placed between `## Commit discipline (RFC-0480)` and `## HDRI identity firewall...`.

**Human review:** no

---

### Step 2. Add step 1.5 to fo-session-retro SKILL.md

**Goal:** Add the git hygiene check pre-step to the fo-session-retro skill.

**Agent actions:**

- Read `.agents/skills/fo-session-retro/SKILL.md` to confirm current step structure (step 1 at ~line 91, step 2 at ~line 97).
- Insert a new `### 1.5. Git hygiene check` subsection between step 1 and step 2.
- Use the exact step text from RFC-0581 §Design → fo-session-retro SKILL.md modification.

**Validation:**

- `grep -n "1.5.*Git hygiene" .agents/skills/fo-session-retro/SKILL.md` — confirms the step exists.
- `grep -n "git status --short" .agents/skills/fo-session-retro/SKILL.md` — confirms the check command is present.

**Completion criterion:** `.agents/skills/fo-session-retro/SKILL.md` contains a `### 1.5. Git hygiene check` step between step 1 and step 2, with the full procedure (5 sub-steps).

**Human review:** no

---

### Step 3. Validate and verify acceptance criteria

**Goal:** Run mechanical validation and verify all acceptance criteria are met.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0581 --json` — confirm zero violations.
- Verify acceptance criterion 1: `grep -n "Session-end discipline" AGENTS.md` returns a match.
- Verify acceptance criterion 2: `grep -n "1.5.*Git hygiene" .agents/skills/fo-session-retro/SKILL.md` returns a match.
- Verify acceptance criterion 3: `grep -n "werkstatt" .agents/skills/fo-session-retro/SKILL.md` and `grep -n "workpiece" .agents/skills/fo-session-retro/SKILL.md` confirm both repositories are covered.
- Verify acceptance criterion 4: `grep -n "does not auto-commit\|operator decides" AGENTS.md` confirms the no-auto-commit rule.
- Verify acceptance criterion 5: `grep -n "das war's\|wir sind fertig" docs/rfcs/rfc-0581-*.md` confirms German phrases are in the RFC (referenced by the AGENTS.md rule).
- Verify acceptance criterion 6: rfc.validate passed.
- Check off all acceptance criteria in the RFC file with `[x]`.

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0581 --json` — must pass.
- `git status` — only AGENTS.md, SKILL.md, and RFC file should be modified.

**Completion criterion:** All 6 acceptance criteria verified and checked off in the RFC file. `rfc.validate` passes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No `docs/*.xml` Compass files need synchronization — this RFC does not change repository-wide requirements, technology, or development plans.
- No `docs/architecture-dna.md` changes — this RFC does not introduce a new DNA invariant.
- No `ecosystem.manifest.generate` needed — no command surfaces changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented changes. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0581 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate RFC-0581` — passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0581` — mechanical validation.
- No build checks needed (no code changes).
- No acceptance probes (RFC has none declared).
- No verification evidence needed (no acceptance probes, RFC-0330 not triggered).

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0581` in the subject line (RFC-0265 commit hygiene).
- Review report in `docs/reviews/code/` from `fo-review`.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent non-compliance | Step 1 adds NON-NEGOTIABLE rule to AGENTS.md with documented signal vocabulary |
| Operator closes chat without signaling | Step 1 rule text explicitly states this is a soft guard; RFC-0575 pre-flight is the fallback |
| Skill drift | Step 1 AGENTS.md rule is primary enforcement; Step 2 skill step is convenience |
| False sense of safety | Step 1 rule text is explicit about trigger condition (operator signal only) |
| Workpiece path resolution | Step 2 procedure includes "skip if workpiece not found" failure mode |
| Retro overhead | Negligible — two `git status --short` calls |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0581 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
