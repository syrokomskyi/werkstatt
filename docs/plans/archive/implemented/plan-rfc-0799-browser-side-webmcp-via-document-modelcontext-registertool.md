---
rfcId: RFC-0799
planId: PLAN-RFC-0799-01
status: draft
owner: architecture
createdAt: 2026-08-10
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - werkstatt-site
  services: []
  docs:
    - docs/rfcs/rfc-0799-browser-side-webmcp-via-document-modelcontext-registertool.md
---

# Implementation Plan: RFC-0799

## 1. Objectives

- [ ] Verify `agent-webmcp-script.astro` component exists and matches RFC contract — maps to acceptance criterion "agent-webmcp-script.astro component exists in packages/werkstatt-site"
- [ ] Verify layout integration renders the component — maps to acceptance criterion "Default layout includes the component when agent.enabled is not false"
- [ ] Verify script registers `action.lead.submit` tool — maps to acceptance criterion "Script registers action.lead.submit tool when document.modelContext exists"
- [ ] Verify script registers `knowledge.{domain}.get` tools — maps to acceptance criterion "Script registers knowledge.{domain}.get tools for each knowledge domain"
- [ ] Verify silent exit when `document.modelContext` is undefined — maps to acceptance criterion "Script exits silently when document.modelContext is undefined"
- [ ] Verify no console errors without WebMCP support — maps to acceptance criterion "No console errors in browsers without WebMCP support"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/ui/components/agent-webmcp/agent-webmcp-script.astro` — inline script component (exists)
- `packages/werkstatt-site/src/domain/ui/components/layout/layout-component.astro` — imports and renders the component (exists)
- `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/pages/*.template.astro` — codegen templates pass `agentSurfaceManifest` prop (exists)
- No new Site OS commands

### 2.2 Configuration and data

- `missions/<id>/workpiece/src/agent-surface.generated.json` — generated manifest file read by page routes (exists in active mission)

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0799-browser-side-webmcp-via-document-modelcontext-registertool.md` — RFC file (read-only reference)
- No `AGENTS.md` updates required (progressive-enhancement addition following existing conventions)
- No `docs/*.xml` Compass sync required (no repository-wide semantic change)
- No `docs/architecture-dna.md` update required (no new DNA invariant)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — scoped typecheck
- `pnpm --filter @warpgogol/werkstatt-site run test` — vitest unit tests

## 3. Step sequence

### Step 1. Verify existing implementation against RFC contract

**Goal:** Confirm the component, layout integration, and codegen templates match the RFC's described design.

**Agent actions:**

- Read `packages/werkstatt-site/src/domain/ui/components/agent-webmcp/agent-webmcp-script.astro` and verify it matches the RFC Script contract (progressive enhancement, `is:inline`, `define:vars`, silent exit on missing `document.modelContext`)
- Read `packages/werkstatt-site/src/domain/ui/components/layout/layout-component.astro` and verify the import and `<AgentWebmcpScript manifest={agentSurfaceManifest} />` rendering in `<head>`
- Verify codegen templates (`index.template.astro`, `[...slug].template.astro`, `[lang]/[...slug].template.astro`, `404.template.astro`) pass `agentSurfaceManifest` prop
- Verify the `{manifest && ...}` guard prevents rendering when manifest is null

**Validation:**

- Visual inspection confirms all files match RFC description

**Completion criterion:** All existing files match the RFC's Design section; no discrepancies found.

**Human review:** no

---

### Step 2. Add unit tests for the WebMCP script component

**Goal:** Create tests that verify the script's behavior for all acceptance criteria.

**Agent actions:**

- Create `packages/werkstatt-site/src/domain/ui/components/agent-webmcp/agent-webmcp-script.test.ts`
- Test 1: Component renders nothing when manifest is null (progressive enhancement guard)
- Test 2: Component renders `<script is:inline>` with `define:vars` when manifest is provided
- Test 3: Serialized manifest JSON contains action ids with `action.` prefix
- Test 4: Serialized manifest JSON contains knowledge domains with `knowledge.` prefix
- Test 5: Script body contains `document.modelContext` feature detection guard
- Test 6: Script body contains `try/catch` with dev-mode `console.warn` guard

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- --run agent-webmcp`

**Completion criterion:** All 6 tests pass.

**Human review:** no

---

### Step 3. Run scoped typecheck

**Goal:** Verify no TypeScript errors in the package.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Validation:**

- Exit code 0, no type errors

**Completion criterion:** Typecheck passes with zero errors.

**Human review:** no

---

### Step 4. Code review and fix

**Goal:** Run automated code review on all session changes and fix any findings.

**Agent actions:**

- Invoke `fo-review` via the `skill` tool on all session code changes
- If findings are reported, invoke `fo-fix` via the `skill` tool
- Re-run `fo-review` to confirm all findings are resolved (max 3 iterations)

**Validation:**

- Review report exists in `docs/reviews/code/` for this session
- All findings resolved (or documented as not-applicable)

**Completion criterion:** Code review passed with zero unresolved findings.

**Human review:** no

---

### Step 5. Check off acceptance criteria and stamp implemented

**Goal:** Verify all acceptance criteria are met and transition the RFC to `implemented`.

**Agent actions:**

- Verify each acceptance criterion in the RFC against the implemented code:
  - [x] `agent-webmcp-script.astro` component exists in `packages/werkstatt-site` — verified in Step 1
  - [x] Default layout includes the component when `agent.enabled` is not false — verified in Step 1 (layout renders component; caller passes null when disabled)
  - [x] Script registers `action.lead.submit` tool when `document.modelContext` exists — verified in Step 2 (test 3)
  - [x] Script registers `knowledge.{domain}.get` tools for each knowledge domain — verified in Step 2 (test 4)
  - [x] Script exits silently when `document.modelContext` is undefined — verified in Step 2 (test 5)
  - [x] No console errors in browsers without WebMCP support — verified in Step 2 (test 5 + test 6)
- Mark acceptance criteria `[x]` in the RFC with inline `(evidence: ...)` annotations
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0799`
- Get the implementation commit SHA
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0799 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0799`
- `rfc.implement.stamp` succeeds (validates status, criteria, clean tree, commit reachability)

**Completion criterion:** RFC is stamped as `implemented` via `rfc.implement.stamp`; all acceptance criteria checked off with evidence annotations.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0799`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0799` in the subject line (RFC-0265 commit hygiene)
- Test file `packages/werkstatt-site/src/domain/ui/components/agent-webmcp/agent-webmcp-script.test.ts`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Spec instability — `document.modelContext` not yet standard | Step 2 tests verify feature detection guard (`if (!mc \|\| typeof mc.registerTool !== "function") return`) handles missing API |
| `import.meta.env.DEV` in `is:inline` script | Step 2 test 6 verifies the safe guard chain (`import.meta && import.meta.env && import.meta.env.DEV`) |
| Security — tool registration is discovery only | Step 1 verifies script body contains no invocation logic, only `registerTool` calls |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-15 (script placement), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0799 --reason "..." --invariant "DNA-15"` instead of working around it.
