---
rfcId: RFC-0787
planId: PLAN-RFC-0787-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs:
    - packages/werkstatt-site/src/checks/pipelines/build-prepare.ts
---

# Implementation Plan: RFC-0787

## 1. Objectives

- [ ] Objective 1 — Remove `agent.api-catalog.generate` and `agent.mcp-card.generate` from `SITES_BUILD_PREPARE_DEV_PIPELINE` (maps to acceptance criterion: "SITES_BUILD_PREPARE_DEV_PIPELINE excludes agent.api-catalog.generate and agent.mcp-card.generate")
- [ ] Objective 2 — Verify production pipeline ordering is correct (maps to acceptance criterion: "SITES_BUILD_PREPARE_PIPELINE includes agent.api-catalog.generate, agent.mcp-card.generate, agent.dns-aid.generate before agent.surface.sign and after agent.manifest.generate")
- [ ] Objective 3 — Verify validators are in `SITES_CHECK_AUTHOR_PIPELINE` (maps to acceptance criterion: "SITES_CHECK_AUTHOR_PIPELINE includes agent.api-catalog.validate, agent.mcp-card.validate, agent.dns-aid.validate after agent.surface.validate")
- [ ] Objective 4 — Verify `agent.markdown-negotiation.generate` is in both pipelines (maps to acceptance criterion: "SITES_BUILD_PREPARE_DEV_PIPELINE includes agent.markdown-negotiation.generate")
- [ ] Objective 5 — Pass `rfc.validate` and `build:check` (maps to acceptance criterion: "rfc.validate passes on this file before merging")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts` — remove two steps from `SITES_BUILD_PREPARE_DEV_PIPELINE`

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts` — update `CHANGE_SUMMARY` comment to note RFC-0787 dev pipeline adjustment

### 2.4 Validation and pipelines

- `SITES_BUILD_PREPARE_DEV_PIPELINE` — two steps removed
- `SITES_BUILD_PREPARE_PIPELINE` — no changes (verify only)
- `SITES_CHECK_AUTHOR_PIPELINE` — no changes (verify only)

## 3. Step sequence

### Step 1. Remove public/-producing generators from dev pipeline

**Goal:** Remove `agent.api-catalog.generate` and `agent.mcp-card.generate` from `SITES_BUILD_PREPARE_DEV_PIPELINE` in `build-prepare.ts`.

**Agent actions:**

- Remove the two lines `{ command: "agent.api-catalog.generate" }` and `{ command: "agent.mcp-card.generate" }` from `SITES_BUILD_PREPARE_DEV_PIPELINE` in `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts`
- Add `CHANGE_SUMMARY` entry: `RFC-0787: removed agent.api-catalog.generate and agent.mcp-card.generate from SITES_BUILD_PREPARE_DEV_PIPELINE (public/ producers not needed for dev).`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- Visual inspection: `SITES_BUILD_PREPARE_DEV_PIPELINE` no longer contains `agent.api-catalog.generate` or `agent.mcp-card.generate`

**Completion criterion:** `SITES_BUILD_PREPARE_DEV_PIPELINE` array in `build-prepare.ts` does not contain `agent.api-catalog.generate` or `agent.mcp-card.generate`.

**Human review:** no

---

### Step 2. Verify production pipeline and validator placement

**Goal:** Confirm the production pipeline and validators match the RFC's acceptance criteria.

**Agent actions:**

- Verify `SITES_BUILD_PREPARE_PIPELINE` contains `agent.api-catalog.generate`, `agent.mcp-card.generate`, `agent.dns-aid.generate` after `agent.manifest.generate` and before `agent.surface.sign`
- Verify `SITES_BUILD_PREPARE_PIPELINE` contains `agent.markdown-negotiation.generate` after `page.markdown.generate`
- Verify `SITES_CHECK_AUTHOR_PIPELINE` contains `agent.api-catalog.validate`, `agent.mcp-card.validate`, `agent.dns-aid.validate` after `agent.surface.validate`
- Verify `SITES_BUILD_PREPARE_DEV_PIPELINE` still contains `agent.markdown-negotiation.generate`

**Validation:**

- `grep_search` for each command name in the pipeline files

**Completion criterion:** All four verification checks pass.

**Human review:** no

---

### Step 3. Run validation suite

**Goal:** Confirm TypeScript compilation and RFC validation pass.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt-site run build:check`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0787`

**Validation:**

- Both commands exit 0

**Completion criterion:** `build:check` and `rfc.validate` both pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No `AGENTS.md` updates needed — pipeline wiring is internal to `packages/werkstatt-site`
- No `docs/*.xml` Compass files need updates — no repository-wide semantics changed
- No `docs/architecture-dna.md` updates needed — no new DNA invariant
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0787 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0787`
- Review report exists for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0787`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0787` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Pipeline ordering bugs | Step 2 verifies ordering matches acceptance criteria |
| Dev pipeline bloat | Step 1 removes public/ producers from dev pipeline |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-58, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0787 --reason "..." --invariant "DNA-58"` instead of working around it.
