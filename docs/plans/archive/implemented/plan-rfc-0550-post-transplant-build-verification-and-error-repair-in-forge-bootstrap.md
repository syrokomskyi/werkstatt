---
rfcId: RFC-0550
planId: PLAN-RFC-0550-01
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
    - packages/forge/skills/meta/forge-bootstrap/SKILL.md
---

# Implementation Plan: RFC-0550

## 1. Objectives

- [ ] Objective 1 — Add build verification sub-step (6.7) to forge-bootstrap transplant flow in SKILL.md — maps to acceptance criterion "forge-bootstrap SKILL.md includes a build verification sub-step (6.7)"
- [ ] Objective 2 — Renumber current "Fill forge.yaml" sub-step from 7 to 6.8 — maps to acceptance criterion "with the current Fill forge.yaml sub-step renumbered to 6.8"
- [ ] Objective 3 — Use `ref(forge.yaml bindings.commands.scopedBuild)` instead of hardcoded `pnpm build` — maps to acceptance criterion "runs the build command resolved via `ref(forge.yaml bindings.commands.scopedBuild)`"
- [ ] Objective 4 — Enhance existing post-setup install to capture bin-link warnings (no second install run) — maps to acceptance criterion "enhances the existing post-setup install to capture bin-link warnings"
- [ ] Objective 5 — Handle null `scopedBuild` binding, install failure, and timeout (300s) edge cases — maps to acceptance criteria for null binding and failure modes
- [ ] Objective 6 — Define error parsing (structured list with error code, file, message), operator ask, fix scope (no business logic), and 3-round iterative fix loop — maps to acceptance criteria for error parsing, operator ask, and fix verification
- [ ] Objective 7 — Ensure zero CLI commands in operator-facing text per RFC-0542 — maps to acceptance criterion "No CLI commands appear in operator-facing text"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/skills/meta/forge-bootstrap/SKILL.md` — the only file modified. Add sub-step 6.7 (build verification and error repair) to the transplant process section. Renumber current sub-step 7 (Fill forge.yaml) to sub-step 6.8.
- No new TypeScript code, no new commands, no registry entries, no pipeline wiring.

### 2.2 Configuration and data

- None. The RFC does not introduce new YAML/JSON config, manifests, or ontology catalogs.

### 2.3 Documentation and specs

- `packages/forge/skills/meta/forge-bootstrap/SKILL.md` — the skill definition itself is the documentation artifact. It is both the implementation and the spec.
- `packages/forge/AGENTS.md` — no update needed (the Output contract section already covers skill reports using `aiLanguage` with zero CLI commands). The RFC explicitly states this.
- No `docs/*.xml` Compass files need synchronization — this is a skill-level process change, not a repository-wide semantic change.
- No `docs/architecture-dna.md` update — no new DNA invariant.

### 2.4 Validation and pipelines

- `forge.skill.validate` — must pass after SKILL.md changes (SKILL-11: no hardcoded `pnpm exec werkstatt run` in instruction lines; SKILL-12: concerns taxonomy; SKILL-13: knowledge files exist).
- `rfc.validate` — must pass on RFC-0550 after implementation.
- No build pipeline changes — this is a skill file, not compiled TypeScript.

## 3. Step sequence

### Step 1. Add build verification sub-step 6.7 to SKILL.md

**Goal:** Insert the new build verification and error repair sub-step into the transplant flow section of `packages/forge/skills/meta/forge-bootstrap/SKILL.md`, between the current post-setup sub-step (6) and the Fill forge.yaml sub-step (7).

**Agent actions:**

- Read the current transplant sub-steps in SKILL.md (lines 107–128).
- After sub-step 6 (Post-setup), insert sub-step 6.7 with the full build verification process as specified in RFC-0550 Design section:
  - Enhance existing post-setup install to capture bin-link ENOENT warnings (no second install run).
  - If install fails (exit code != 0), report in human language, skip build verification, continue to welcoming report.
  - Resolve build command via `ref(forge.yaml bindings.commands.scopedBuild)`. If null, skip build verification with a note in the welcoming report.
  - Run the resolved build command with 300s timeout, capture stdout/stderr.
  - Parse build output for TS2307 (missing modules), TS2xxx (type errors), ELIFECYCLE (build failures), and bin-link ENOENT warnings (cosmetic, reported as noise).
  - If errors detected (excluding bin-link warnings): present as structured list (error code, file path, message) in `aiLanguage`, ask operator "Your project has some build errors. Would you like me to fix them?"
  - If operator accepts: fix in-session (install missing deps, fix import paths, resolve type errors — NOT business logic changes). Re-run build to verify, up to 3 rounds.
  - If operator declines: report errors and continue.
  - If no errors: confirm the project builds successfully.
- Use `ref(forge.yaml bindings.commands.scopedBuild)` in the skill text — do NOT hardcode `pnpm build` (DNA-54 / SKILL-11 compliance).
- Use `ref(forge.yaml project.packageManager)` for the install command — do NOT hardcode `pnpm install`.
- Ensure all operator-facing text uses `aiLanguage` and contains zero CLI commands (RFC-0542).

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --json` — must pass with zero SKILL-11 violations (no hardcoded project literals in instruction lines).

**Completion criterion:** SKILL.md contains sub-step 6.7 with all 8 numbered items from the RFC Design section, using binding references instead of hardcoded commands.

**Human review:** no

---

### Step 2. Renumber Fill forge.yaml sub-step from 7 to 6.8

**Goal:** Renumber the current sub-step 7 (Fill forge.yaml) to sub-step 6.8 to maintain sequential numbering after the new 6.7 insertion.

**Agent actions:**

- In SKILL.md, change the current sub-step 7 heading/number from "7." to "6.8." in the transplant process section.
- Update any internal cross-references within SKILL.md that refer to "sub-step 7" or "step 7" in the transplant flow to "sub-step 6.8".
- Verify the auto-run doctor section (currently "### 7.") is NOT affected — it is a top-level step, not a transplant sub-step. Confirm its numbering remains unchanged.

**Validation:**

- Visual inspection: sub-step numbering in transplant flow is sequential (1, 2, 3, 4, 5, 6, 6.7, 6.8).
- `pnpm exec werkstatt run forge.skill.validate --json` — must still pass.

**Completion criterion:** Fill forge.yaml is numbered 6.8; transplant sub-steps are sequentially numbered; top-level step 7 (auto-run doctor) is unchanged.

**Human review:** no

---

### Step 3. Validate skill and RFC

**Goal:** Run all mechanical validators to confirm the SKILL.md changes and RFC are clean.

**Agent actions:**

- Run `pnpm exec werkstatt run forge.skill.validate --json` — confirm zero violations.
- Run `pnpm exec werkstatt run rfc.validate RFC-0550 --json` — confirm zero errors (V-19 warnings for amendedBy back-fill are expected and acceptable).
- If SKILL-11 violations appear (hardcoded `pnpm build` or `pnpm install` in instruction lines), fix by replacing with binding references and re-run.

**Validation:**

- `forge.skill.validate` passes with zero violations.
- `rfc.validate` passes with zero errors (warnings acceptable).

**Completion criterion:** Both validators pass clean.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` does not need updates (the Output contract section already covers skill reports using `aiLanguage` with zero CLI commands — confirmed in RFC acceptance criteria).
- Verify no `docs/*.xml` Compass files need synchronization (skill-level process change, not repository-wide semantic change).
- Verify no `docs/architecture-dna.md` update needed (no new DNA invariant — DNA-54 is existing and referenced, not modified).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` only if command surfaces or pipeline topology changed (they did not — skip).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in RFC-0550 against the implemented SKILL.md changes. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0550 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate RFC-0550` — passes with zero errors.
- `pnpm exec werkstatt run forge.skill.validate` — passes with zero violations.
- Review report exists for this session.

**Completion criterion:** All acceptance criteria checked off with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; `git status` clean.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0550` — RFC mechanical validation
- `pnpm exec werkstatt run forge.skill.validate` — skill validation (SKILL-11/12/13)
- `pnpm --filter @warpgogol/forge run build:check` — package typecheck (confirms no TS regressions in forge package, though this RFC is skill-only)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0550` in the subject line (RFC-0265 commit hygiene)
- Implementation commit and RFC stamp commit are SEPARATE commits (per mandatory checklist)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positive error detection | Step 1: skill text specifies parsing TypeScript error codes precisely (TS2xxx), not free-text matching |
| Fix introduces regressions | Step 1: skill text specifies re-run build after each fix, up to 3 rounds |
| Build timeout (large projects >300s) | Step 1: skill text sets 300s configurable timeout with report-and-continue on timeout |
| Agent misinterpretation (fixing without asking) | Step 1: skill text explicitly states "MUST NOT fix build errors without asking the operator first" |
| Operator confusion (build errors jargon) | Step 1: skill text specifies errors presented in human language with concrete descriptions, not raw compiler output |
| SKILL-11 violation (hardcoded commands) | Step 1: use `ref(forge.yaml bindings.commands.scopedBuild)` and `ref(forge.yaml project.packageManager)` instead of `pnpm build`/`pnpm install`; Step 3 validates via `forge.skill.validate` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0550 --reason "..." --invariant "DNA-54"` instead of working around it.
- If `forge.skill.validate` reports SKILL-11 violations that cannot be resolved by replacing hardcoded commands with binding references, escalate to the operator — the binding key may need to be added to `forge.yaml` first.
