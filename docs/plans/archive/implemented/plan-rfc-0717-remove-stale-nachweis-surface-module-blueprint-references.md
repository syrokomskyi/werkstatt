---
rfcId: RFC-0717
planId: PLAN-RFC-0717-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages: []
  services: []
  docs:
    - systems-cache/warpgogol-com/src/content/system.md
---

# Implementation Plan: RFC-0717

## 1. Objectives

- [ ] Remove stale `blueprints: [nachweis]` from cache clone `surface.modules.nachweis` — maps to acceptance criterion "Cache clone system.md surface.modules.nachweis has no blueprints key"
- [ ] Verify `surface.blueprints` does not list nachweis — maps to acceptance criterion "surface.blueprints does not list nachweis or any nachweis-* ID"
- [ ] Verify `surface.modules.nachweis` entry remains with `entitlement: nachweis` — maps to acceptance criterion "surface.modules.nachweis entry remains with entitlement: nachweis"
- [ ] Verify Nachweis pages continue to render via block-declarative model — maps to acceptance criterion "Nachweis pages continue to render via block-declarative model"

## 2. Affected artifacts

### 2.1 Code and commands

None. This RFC is a content-only fix in the cache clone `system.md`. No package code, no Site OS commands, no registry entries, no pipeline wiring changes.

### 2.2 Configuration and data

- `missions/warpgogol-com-m000033/workpiece/src/content/system.md` — already clean (no `blueprints` key under `surface.modules.nachweis`). No changes needed.
- `systems-cache/warpgogol-com/src/content/system.md` — stale `blueprints: [nachweis]` entry under `surface.modules.nachweis` (lines 140-141). Updated automatically via `mission.reconcile` from the clean workpiece.

### 2.3 Documentation and specs

- RFC file (read-only reference): `docs/rfcs/draft/rfc-0717-remove-stale-nachweis-surface-module-blueprint-references.md`
- No AGENTS.md updates needed — no new modules, commands, or ownership changes
- No Compass XML updates needed — no repository-wide semantics changed
- No `docs/architecture-dna.md` updates needed — no new DNA invariant

### 2.4 Validation and pipelines

- `rfc.validate --id RFC-0717` — verify RFC passes validation
- No `build:check` needed — no package code changes
- No acceptance probes declared in RFC frontmatter

## 3. Step sequence

### Step 1. Run mission.reconcile to sync clean workpiece into cache clone

**Goal:** Sync the clean workpiece `system.md` (mission m000033, already without `blueprints` key) into the cache clone, overwriting the stale `blueprints: [nachweis]` entry.

**Agent actions:**

- Verify workpiece `system.md` is clean: `grep -n "blueprints" missions/warpgogol-com-m000033/workpiece/src/content/system.md` — confirm `surface.modules.nachweis` has no `blueprints` key
- Run `pnpm exec werkstatt run mission.reconcile --mission warpgogol-com-m000033` to sync the clean workpiece into the cache clone
- Verify cache clone `system.md` is updated: `grep -n "blueprints" systems-cache/warpgogol-com/src/content/system.md` — confirm `surface.modules.nachweis` no longer has a `blueprints` key
- Verify `surface.modules.nachweis` entry still has `entitlement: nachweis`, `masterLocale: de`, `publishedLocales: [uk]`, and all other fields unchanged
- Verify `surface.blueprints` list is unchanged (`website-local`, `website-service`, `offer`, `ratgeber`)

**Validation:**

- `grep -n "blueprints" systems-cache/warpgogol-com/src/content/system.md` — confirm `surface.modules.nachweis` no longer has a `blueprints` key
- `grep -n "nachweis" systems-cache/warpgogol-com/src/content/system.md` — confirm `surface.modules.nachweis` entry still exists with `entitlement: nachweis`

**Completion criterion:** Cache clone `system.md` `surface.modules.nachweis` has no `blueprints` key; all other fields under `surface.modules.nachweis` are unchanged. The sync was performed via `mission.reconcile`, not by directly editing the cache clone (AGENTS.md: 'Agents MUST NEVER edit any Sternsystem mirror directly').

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Verify acceptance criteria, run code review, and stamp the RFC as implemented.

**Agent actions:**

- No AGENTS.md updates needed — no new modules, commands, or ownership changes.
- No Compass XML updates needed — no repository-wide semantics changed.
- No `docs/architecture-dna.md` updates needed — no new DNA invariant.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented change. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <check>)`.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0717 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0717`
- Review report exists for this session.

**Completion criterion:** All acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0717`
- No `build:check` needed — no package code changes
- No acceptance probes declared in RFC frontmatter

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0717` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent misinterpretation: seeing `blueprints: [nachweis]` might attempt to create a `nachweis.yaml` blueprint file | Step 1 syncs the clean workpiece via mission.reconcile, eliminating the stale entry |
| No validation impact: change does not affect `blueprint.validate` or `entitlement.module.validate` | Step 1 verification confirms `nachweis` is not in `surface.blueprints` |
| AGENTS.md violation: direct cache clone editing is forbidden | Step 1 uses mission.reconcile, not direct editing — complies with 'Agents MUST NEVER edit any Sternsystem mirror directly' |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0717 --reason "..." --invariant "DNA-24"` instead of working around it.
