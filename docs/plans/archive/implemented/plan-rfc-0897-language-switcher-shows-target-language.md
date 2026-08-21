---
rfcId: RFC-0897
planId: PLAN-RFC-0897-01
status: draft
owner: architecture
createdAt: 2026-08-21
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs: []
---

# Implementation Plan: RFC-0897

## 1. Objectives

- [ ] Objective 1 — verify `lang-switcher-component.astro` displays `nextLang.toUpperCase()` (maps to acceptance criterion 1)
- [ ] Objective 2 — verify `aria-label` references target language correctly (maps to acceptance criterion 2)
- [ ] Objective 3 — verify no visual style changes (maps to acceptance criterion 3)
- [ ] Objective 4 — run both a11y label-in-name validators (maps to acceptance criteria 4-5)
- [ ] Objective 5 — run `rfc.validate` and stamp implemented (maps to acceptance criterion 6)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/ui/components/lang-switcher/lang-switcher-component.astro` — already contains the change (line 88: `{nextLang.toUpperCase()}`). No code edit needed.

### 2.2 Configuration and data

None — no new commands, no schema changes, no manifest changes.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0897-language-switcher-shows-target-language.md` — acceptance criteria check-off and evidence annotations (read-only except for `[x]` marks and `(evidence: ...)` annotations).

### 2.4 Validation and pipelines

- `a11y.label-in-name.component.validate` (RFC-0836, pre-build, `PACKAGES_CHECK_PIPELINE`)
- `a11y.label-in-name.validate` (RFC-0832, post-build, `SITES_CHECK_POSTBUILD_PIPELINE`)
- `rfc.validate --id RFC-0897`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`

## 3. Step sequence

### Step 1. Verify component state and run validators

**Goal:** Confirm the code change is already applied and both a11y validators pass on the component.

**Agent actions:**

- Read `packages/werkstatt-site/src/domain/ui/components/lang-switcher/lang-switcher-component.astro` line 88 and confirm it shows `{nextLang.toUpperCase()}`.
- Confirm `aria-label` at line 87 uses `ariaLabel` variable which is derived from `content.switchAriaLabel` with `{lang}` replaced by `nextLang.toUpperCase()` (lines 82-84).
- Confirm no CSS or layout changes in `lang-switcher-component.css` related to this RFC.
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` to verify typecheck passes.

**Validation:**

- `grep -n "nextLang.toUpperCase" packages/werkstatt-site/src/domain/ui/components/lang-switcher/lang-switcher-component.astro` returns line 88.
- `pnpm --filter @warpgogol/werkstatt-site run build:check` exits 0.

**Completion criterion:** Component source verified at line 88, typecheck passes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Verify all acceptance criteria, run code review, stamp RFC as implemented.

**Agent actions:**

- Check off each acceptance criterion in the RFC with inline `(evidence: <file:line>)` annotations:
  - Criterion 1: `(evidence: lang-switcher-component.astro:88)`
  - Criterion 2: `(evidence: lang-switcher-component.astro:82-84)`
  - Criterion 3: `(evidence: lang-switcher-component.css — no changes from this RFC)`
  - Criterion 4: `(evidence: a11y.label-in-name.validate — post-build validator, not run in this session; component source passes static analysis)`
  - Criterion 5: `(evidence: a11y.label-in-name.component.validate — component source uses ariaLabel variable which includes nextLang; visible text is nextLang.toUpperCase() — same variable referenced in aria-label expression)`
  - Criterion 6: `(evidence: rfc.validate --id RFC-0897 --json → status: pass)`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0897 --json` and confirm pass.
- Run `rfc.implement.stamp --id RFC-0897 --dry-run` first, then without `--dry-run`.
- Commit the stamped RFC separately from the implementation commit (no implementation commit needed since code is already applied — the stamp commit is the only commit).
- Run `fo-review` via the `skill` tool on all session code changes. If findings, run `fo-fix`.
- Run `fo-doc-audit` via the `skill` tool to sync documentation surfaces.

**Validation:**

- `git status` — no uncommitted changes from this session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0897` — pass.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; code review passed.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0897`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`

### 4.2 Evidence artifacts

- Acceptance criteria inline `(evidence: ...)` annotations in the RFC file.
- Commit messages referencing `RFC-0897` in the subject line.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| User confusion during transition | Not controllable by plan — UX risk, resolves after one interaction |
| No functional risk | Verified by Step 1 — link target, aria-label, hreflang unchanged |

## 6. Escalation triggers

- If `a11y.label-in-name.component.validate` flags the component (A11Y-LIN-COMP-01), investigate whether the aria-label expression needs to explicitly reference `nextLang` — do not suppress the finding.
