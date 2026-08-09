---
rfcId: RFC-0545
planId: PLAN-RFC-0545-01
status: draft
owner: architecture
createdAt: 2026-07-26
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - packages/forge/README.md
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0545

## 1. Objectives

- [ ] Objective 1 — Replace the existing `forge-bootstrap` SKILL.md with the redesigned greenfield/transplant interview flow (maps to acceptance criterion 1)
- [ ] Objective 2 — Update the `FORGE_SKILLS` registry entry to reflect `concerns: content-mutation` and the new description (maps to acceptance criterion 2)
- [ ] Objective 3 — Ensure the skill body passes `forge.skill.validate` (SKILL-01..13) including the `forge.yaml` guardrail and PREFERENCES.md instruction (maps to acceptance criteria 3, 6)
- [ ] Objective 4 — Verify the redesigned skill is synced by `forge.init` / `forge.upgrade` (maps to acceptance criterion 2)
- [ ] Objective 5 — Update `packages/forge/README.md` to describe both greenfield and transplant modes (maps to acceptance criterion 8)
- [ ] Objective 6 — Run `build:check`, `forge.skill.validate`, and registry tests (maps to acceptance criteria 7, 9)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/skills/meta/forge-bootstrap/SKILL.md` — skill definition (replaced in place)
- `packages/forge/src/registry.ts` — `FORGE_SKILLS` entry for `forge-bootstrap` (update `concerns` and `description`)

### 2.2 Configuration and data

- No `forge.yaml` changes (this monorepo's forge.yaml is not affected)
- No `system.md` or ontology catalog changes

### 2.3 Documentation and specs

- `packages/forge/README.md` — update the Lifecycle section to describe greenfield and transplant modes
- `packages/forge/AGENTS.md` — update the Architecture section if the skill count or description changes (currently says "3 meta skills" — count stays the same, but the description of forge-bootstrap changes)
- RFC file `docs/rfcs/rfc-0545-*.md` — read-only reference, not modified by the plan

### 2.4 Validation and pipelines

- `forge.skill.validate` — must pass on the redesigned skill (SKILL-01..13)
- `pnpm --filter @wgogol/forge run build:check` — typecheck must pass
- `pnpm --filter @wgogol/forge run test` — registry tests must pass (no new tests needed; existing registry tests validate the entry)

## 3. Step sequence

### Step 1. Replace SKILL.md with redesigned interview flow

**Goal:** Replace the existing minimal `forge-bootstrap` skill with the full greenfield/transplant interview flow from RFC-0545.

**Agent actions:**

- Write the new `packages/forge/skills/meta/forge-bootstrap/SKILL.md` with:
  - Frontmatter: `name: forge-bootstrap`, `description: Configure a freshly created forge project — greenfield or transplant.`, `invocation: user`, `concerns: content-mutation`, `category: meta`, `dependsOn: ['my-preferences']`, `languagePolicy: ref(PREFERENCES.md)`, `bindings: { requires: [], optional: [] }`
  - Body: "Read PREFERENCES.md…" instruction (SKILL-09), mode choice (greenfield/transplant), greenfield interview steps (language, stack, package manager, stack bindings, write PREFERENCES.md, emit next steps), transplant interview steps (source directory, analyze, propose, fill, write PREFERENCES.md, emit next steps), guardrails, failure modes, output format
  - Ensure no hardcoded `pnpm exec werkstatt run` or `docs/architecture-dna.md` in code blocks (SKILL-11)
  - Ensure no `pnpm run build` / `npm run test` patterns if concerns were read-only or document-only (SKILL-10 does not apply to `content-mutation`, but avoid unnecessary code execution instructions anyway)

**Validation:**

- `forge.skill.validate` passes with zero violations for `forge-bootstrap`
- SKILL-09: body contains "Read PREFERENCES.md" instruction

**Completion criterion:** `packages/forge/skills/meta/forge-bootstrap/SKILL.md` contains the redesigned interview flow with valid frontmatter and passes `forge.skill.validate`.

**Human review:** no

---

### Step 2. Update FORGE_SKILLS registry entry

**Goal:** Update the `forge-bootstrap` entry in `FORGE_SKILLS` to match the new frontmatter.

**Agent actions:**

- In `packages/forge/src/registry.ts`, update the `forge-bootstrap` entry:
  - Change `concerns: "code-mutation"` to `concerns: "content-mutation"`
  - The `description` field is not in the registry entry (it lives in SKILL.md frontmatter) — no change needed there
  - Keep `category: "meta"`, `invocation: "user"`, `dependsOn: ["my-preferences"]`, `path: "skills/meta/forge-bootstrap/SKILL.md"` unchanged

**Validation:**

- `pnpm --filter @wgogol/forge run test` — registry tests pass (no duplicate names, valid categories, valid concerns, valid invocations, path prefix matches category, dependsOn entries exist)

**Completion criterion:** `FORGE_SKILLS` entry for `forge-bootstrap` has `concerns: "content-mutation"` and all registry tests pass.

**Human review:** no

---

### Step 3. Update README.md

**Goal:** Update the Lifecycle section to describe both greenfield and transplant modes.

**Agent actions:**

- In `packages/forge/README.md`, update the Lifecycle section step 3:
  - Current: "3. **Bootstrap** — run `/forge-bootstrap` to configure the project for your stack"
  - New: "3. **Bootstrap** — run `/forge-bootstrap` to configure the project (greenfield interview or transplant from an existing codebase)"

**Validation:**

- README visually confirms `/forge-bootstrap` is documented as the post-create step with both modes mentioned

**Completion criterion:** `packages/forge/README.md` Lifecycle section mentions both greenfield and transplant modes.

**Human review:** no

---

### Step 4. Run forge.skill.validate and build:check

**Goal:** Verify the redesigned skill passes all validation rules and the package typechecks.

**Agent actions:**

- Run `pnpm exec werkstatt run forge.skill.validate --json` (or `pnpm --filter @wgogol/forge exec forge skill.validate --json`)
- Run `pnpm --filter @wgogol/forge run build:check`
- Run `pnpm --filter @wgogol/forge run test`

**Validation:**

- `forge.skill.validate` returns zero violations
- `build:check` exits 0
- All tests pass

**Completion criterion:** All three commands pass with zero errors.

**Human review:** no

---

### Step 5. Commit implementation changes

**Goal:** Commit all code changes as a single implementation commit.

**Agent actions:**

- `git add packages/forge/skills/meta/forge-bootstrap/SKILL.md packages/forge/src/registry.ts packages/forge/README.md`
- `git commit -m "feat: redesign forge-bootstrap skill with greenfield and transplant modes (RFC-0545)"`

**Validation:**

- `git status` shows clean working tree (no uncommitted changes from this session)

**Completion criterion:** Implementation changes committed; `git status` clean.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/forge/AGENTS.md` if the Architecture section skill description needs to reflect the redesign (the count stays "3 meta skills" but the forge-bootstrap description changes from "first-time forge deployment" to "greenfield and transplant configuration").
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0545 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate RFC-0545 --json` — passes with zero violations.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0545 --json`
- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @wgogol/forge run test`
- `pnpm exec werkstatt run forge.skill.validate --json` (or equivalent)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0545` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Skill drift from forge.yaml schema | Step 1 writes binding keys (`typecheck`, `test`, `scopedBuild`) that match `forgeConfigSchema`; Step 4 runs `forge.skill.validate` |
| Transplant false positives | Step 1 includes a "Propose" step where the operator confirms detected stack before writing |
| Agent misinterpretation (running outside forge project, modifying source) | Step 1 includes explicit guardrails and MUST NOTs in the skill body |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0545 --reason "..." --invariant "DNA-54"` instead of working around it.
