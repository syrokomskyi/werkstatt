---
rfcId: RFC-0551
planId: PLAN-RFC-0551-01
status: draft
owner: architecture
createdAt: 2026-07-27
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0551

## 1. Objectives

- [ ] Objective 1 — Update forge-bootstrap SKILL.md Section 4 with register-specific capabilities (maps to acceptance criterion 1, 2, 6)
- [ ] Objective 2 — Add always-next-step section to extended-behavioral-layer.ts (maps to acceptance criterion 3)
- [ ] Objective 3 — Add register-conditional commit policy to agents-generate.ts generateBehavioralLayer() (maps to acceptance criterion 4, 5)
- [ ] Objective 4 — Update packages/forge/AGENTS.md with new behavioral policies (maps to file system responsibilities)
- [ ] Objective 5 — Validate with rfc.validate, build:check, and forge.skill.validate (maps to acceptance criterion 7)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/skills/meta/forge-bootstrap/SKILL.md` — update Section 4 "What you can do now" with register-specific capability lists
- `packages/forge/src/onboarding/agents-generate.ts` — add Commit policy section to `generateBehavioralLayer()` function (after the Ownership section, before the conditional extended layer)
- `packages/forge/src/onboarding/extended-behavioral-layer.ts` — add Always-next-step section (section 10, after Creative confidence)

No new commands. No new TypeScript types. No registry changes. No pipeline wiring.

### 2.2 Configuration and data

None. No YAML/JSON/NDJSON changes. No ontology catalogs. No content schemas.

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — update Core behavioral layer and Extended behavioral layer sections to document the new commit policy and always-next-step policy
- RFC file is read-only reference (status: accepted → implemented via stamp)

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run rfc.validate --id RFC-0551` — must pass with zero errors (V-19 warnings expected)
- `pnpm --filter @warpgogol/forge run build:check` — typecheck must pass
- `pnpm exec site-kernel run forge.skill.validate` — SKILL-11 (no hardcoded project literals), SKILL-12 (concerns), SKILL-13 (knowledge files) must pass

## 3. Step sequence

### Step 1. Update forge-bootstrap SKILL.md Section 4 with register-specific capabilities

**Goal:** Replace the three generic bullet points in Section 4 with register-specific capability lists.

**Agent actions:**

- Read `packages/forge/skills/meta/forge-bootstrap/SKILL.md` lines 193-201 (current Section 4)
- Replace the three generic bullets with register-conditional content:
  - Creative register: 5 capabilities emphasizing creative flow, idea capture, project growth, creative partnership, visual thinking
  - Business register: 5 capabilities emphasizing efficiency, quality, project management, decision tracking, health checks
- Add a note that the skill presents the register-appropriate list based on `PREFERENCES.md` `register` field
- Ensure zero CLI commands in the capability text (per RFC-0542 output contract)
- Ensure zero skill names with `fo-` prefix in the capability text

**Validation:**

- `grep -n "pnpm\|forge doctor\|fo-idea\|fo-fix\|fo-review" packages/forge/skills/meta/forge-bootstrap/SKILL.md` — no matches in Section 4
- Visual inspection: Section 4 shows two distinct capability lists (creative vs business)

**Completion criterion:** SKILL.md Section 4 contains 3-5 capabilities per register, creative and business lists differ, no CLI commands or skill names appear in the text.

**Human review:** no — content change in skill file, validated by forge.skill.validate.

---

### Step 2. Add always-next-step section to extended-behavioral-layer.ts

**Goal:** Add a new "Always-next-step" section to the extended behavioral layer content builder.

**Agent actions:**

- Read `packages/forge/src/onboarding/extended-behavioral-layer.ts` (86 lines, 9 sections)
- Add section 10 "Always-next-step" after "Creative confidence" (section 9), before the `return lines` statement
- Content: the policy text from RFC-0551 Design §2, including the supersession note for RFC-0549's "at most one per session" limit
- Update the MODULE_CONTRACT CHANGE_SUMMARY with `RFC-0551: added always-next-step section.`
- Update the JSDoc comment to reflect "ten sections" instead of "nine sections"

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — typecheck passes
- Visual inspection: `buildExtendedBehavioralLayer()` returns 10 sections, with "Always-next-step" as section 10

**Completion criterion:** `extended-behavioral-layer.ts` exports `buildExtendedBehavioralLayer()` that returns 10 sections including "Always-next-step" with the supersession note.

**Human review:** no — content addition to existing pure function, validated by typecheck.

---

### Step 3. Add register-conditional commit policy to agents-generate.ts

**Goal:** Add a "Commit policy" section to the core behavioral layer generated by `generateBehavioralLayer()`.

**Agent actions:**

- Read `packages/forge/src/onboarding/agents-generate.ts` lines 71-276 (`generateBehavioralLayer` function)
- Add a new "Commit policy" section after "Ownership and collaboration" (the last core section before the conditional extended layer check at line 269)
- Content: the policy text from RFC-0551 Design §3, including:
  - Creative register: auto-commit after each completed logical step
  - Business register: ask before committing
  - Auto-commit does not skip verification
  - Auto-commit does not fire in companion mode
  - Auto-commit preserves separate implementation/stamp commits
  - Auto-commit applies to forge projects, not WGogol missions
- The section must be inside the `<!-- forge:begin behavioral-layer -->` / `<!-- forge:end behavioral-layer -->` markers
- Update the MODULE_CONTRACT CHANGE_SUMMARY with `RFC-0551: added register-conditional commit policy to core behavioral layer.`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — typecheck passes
- Visual inspection: `generateBehavioralLayer()` includes a "Commit policy" section with register-conditional text

**Completion criterion:** `agents-generate.ts` `generateBehavioralLayer()` includes a "Commit policy" section stating that in creative register the agent auto-commits without asking, and in business register the agent asks before committing, with the companion mode and verification caveats.

**Human review:** no — content addition to existing function, validated by typecheck.

---

### Step 4. Update packages/forge/AGENTS.md

**Goal:** Document the new commit policy and always-next-step in the forge package AGENTS.md.

**Agent actions:**

- Read `packages/forge/AGENTS.md` — find the "Core behavioral layer (RFC-0548)" and "Extended behavioral layer (RFC-0549)" sections
- Add a note under "Core behavioral layer" about the register-conditional commit policy (RFC-0551)
- Add a note under "Extended behavioral layer" about the always-next-step policy (RFC-0551) and its supersession of the "at most one per session" limit

**Validation:**

- `grep -n "RFC-0551\|commit policy\|always-next-step" packages/forge/AGENTS.md` — matches found in both sections

**Completion criterion:** `packages/forge/AGENTS.md` documents both the commit policy and always-next-step policy with RFC-0551 references.

**Human review:** no — documentation update.

---

### Step 5. Validate and run skill validation

**Goal:** Run all validation checks to confirm the implementation is clean.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0551 --json` — must pass (V-19 warnings expected)
- Run `pnpm --filter @warpgogol/forge run build:check` — typecheck must pass
- Run `pnpm exec site-kernel run forge.skill.validate` — SKILL-11/12/13 must pass for forge-bootstrap
- Check `git status` — no uncommitted changes from this session

**Validation:**

- All three commands exit 0
- No new violations compared to pre-implementation baseline

**Completion criterion:** rfc.validate passes, build:check passes, forge.skill.validate passes, git status clean.

**Human review:** no — automated validation.

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` is updated (step 4)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (they did not — skip)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0551 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0551` — passes
- Review report exists for this session
- All acceptance criteria checked off with evidence annotations

**Completion criterion:** All documentation artifacts updated; code review passed; all acceptance criteria checked off with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0551` — must pass (V-19 warnings expected for amending draft)
- `pnpm --filter @warpgogol/forge run build:check` — typecheck must pass
- `pnpm exec site-kernel run forge.skill.validate` — SKILL-11/12/13 must pass

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0551` in the subject line (RFC-0265 commit hygiene)
- Implementation commit and RFC stamp commit are SEPARATE commits (per PREFERENCES.md)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| Agent misinterprets auto-commit and applies it in business register | Step 3: policy text explicitly states "In the business register, the agent asks before committing" |
| Always-next-step feels pushy | Step 2: policy text includes "If the agent cannot think of a useful next step, it asks the operator what they feel inspired to do next" |
| Capability showcase becomes stale | Step 1: capability list maintained in SKILL.md, updated with each Forge release; forge.doctor warns on version mismatch |
| Auto-commit commits unwanted changes | Step 3: policy text includes that operator can say "undo that" and agent handles git reset automatically |

## 6. Escalation triggers

- If implementation reveals that `generateBehavioralLayer()` cannot accommodate the commit policy without refactoring (e.g. function too long), consider extracting to a separate `behavioral-layer.ts` file — but this is out of scope for this RFC. Document the finding and proceed with inline addition.
- If `forge.skill.validate` reports SKILL-11 violations (hardcoded project literals) in the new capability text, the capability text must be reworded to use generic Forge constants, not project-specific values.
