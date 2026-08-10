---
rfcId: RFC-0798
planId: PLAN-RFC-0798-01
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
    - docs/COMMANDS.md
---

# Implementation Plan: RFC-0798

## 1. Objectives

- [ ] Verify `lead.submit.yaml` exists and matches the RFC normative spec — maps to acceptance criterion 1
- [ ] Run `agent.capability.validate` and confirm it passes — maps to acceptance criterion 2
- [ ] Confirm `agent.manifest.generate` produces non-empty actions — maps to acceptance criterion 3
- [ ] Confirm `agent.openapi.json` contains the lead.submit path — maps to acceptance criterion 4
- [ ] Confirm `agent.routes.generate` emits the action route file — maps to acceptance criterion 5
- [ ] Confirm MCP tools/list includes `action.lead.submit` — maps to acceptance criterion 6
- [ ] Confirm sites without `send-message` don't activate the capability — maps to acceptance criterion 7

## 2. Affected artifacts

### 2.1 Code and commands

No code changes. The capability YAML file is the sole artifact. All pipeline commands (`agent.manifest.generate`, `agent.openapi.generate`, `agent.routes.generate`, `agent.capability.validate`) already exist and pick up the YAML automatically.

### 2.2 Configuration and data

- `packages/werkstatt-site/src/domain/ontology/capabilities/lead.submit.yaml` — pre-existing, verify content matches RFC normative spec

### 2.3 Documentation and specs

- `docs/COMMANDS.md` — no new commands, no change needed (verify only)
- No AGENTS.md updates needed (no new modules, commands, or ownership changes)
- No `docs/*.xml` Compass sync needed (no repository-wide semantic changes)
- No `docs/architecture-dna.md` update needed (no new DNA invariant)

### 2.4 Validation and pipelines

- `agent.capability.validate` in `build.check` — already wired, will now validate the new catalog record
- `agent.manifest.generate` in `build.prepare` — already wired, will now produce non-empty actions
- `agent.openapi.generate` in `build.prepare` — already wired, will now produce the lead.submit path
- `agent.routes.generate` in `build.prepare` — already wired, will now emit the action route file

## 3. Step sequence

### Step 1. Verify capability YAML matches RFC normative spec

**Goal:** Confirm the pre-existing `lead.submit.yaml` file matches the RFC's normative YAML block exactly.

**Agent actions:**

- Read `packages/werkstatt-site/src/domain/ontology/capabilities/lead.submit.yaml`
- Compare field-by-field against the RFC's YAML block (lines 92–137 of the RFC)
- If any field differs, update the YAML file to match the RFC (the RFC is normative)

**Validation:**

- `rtk pnpm exec werkstatt run rfc.validate --id RFC-0798 --json`

**Completion criterion:** YAML file content matches RFC normative spec; `rfc.validate` passes.

**Human review:** no

---

### Step 2. Run scoped typecheck and unit tests

**Goal:** Confirm the package compiles and existing tests pass with the capability YAML in place.

**Agent actions:**

- Run `rtk pnpm --filter @warpgogol/werkstatt-site run build:check`
- Run `rtk pnpm --filter @warpgogol/werkstatt-site run test`

**Validation:**

- `build:check` exits 0
- `test` exits 0

**Completion criterion:** Both commands pass with zero errors.

**Human review:** no

---

### Step 3. Run acceptance criteria verification

**Goal:** Verify all 7 acceptance criteria from the RFC.

**Agent actions:**

- Verify criterion 1: `lead.submit.yaml` exists in `packages/werkstatt-site/src/domain/ontology/capabilities/`
- Verify criterion 2: `rtk pnpm exec werkstatt run agent.capability.validate --site warpgogol-com` passes (requires mission context — if no active mission, verify via `loadCapabilityCatalog` directly or skip with note)
- Verify criterion 3: Check that `resolveActiveCapabilities` returns `lead.submit` when `agent.actions` entitlement and `send-message` section are present (unit test or code inspection)
- Verify criterion 4: Check that `formatAgentOpenApi` produces `/api/agent/actions/lead.submit` path (unit test or code inspection)
- Verify criterion 5: Check that `agent.routes.generate` emits `src/pages/api/agent/actions/[id].ts` when `activeCapabilities.length > 0` (code inspection — already confirmed in `agent-routes.ts:124-126`)
- Verify criterion 6: Check that `buildToolsList` in `mcp/tools.ts` produces `action.lead.submit` for active capabilities (code inspection — already confirmed)
- Verify criterion 7: Check that `resolveActiveCapabilities` returns empty array when `send-message` is not in `renderedSectionTypes` (code inspection — already confirmed in `capability.ts:45-56`)

**Validation:**

- Each criterion verified with evidence (file path, code line, or command output)

**Completion criterion:** All 7 criteria verified with inline evidence annotations.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `docs/COMMANDS.md` — no new commands, no update needed
- Verify no AGENTS.md files need updates (no new modules or ownership changes)
- Verify no `docs/*.xml` Compass files need sync (no repository-wide semantic changes)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`
- Check off acceptance criteria: mark `[x]` for verified criteria with `(evidence: ...)` annotations
- Stamp the RFC as implemented: run `rtk pnpm exec werkstatt run rfc.implement.stamp --id RFC-0798 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `rtk pnpm exec werkstatt run rfc.validate --id RFC-0798`
- Review report exists in `docs/reviews/code/` for this session (if fo-review produced one)

**Completion criterion:** All acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `rtk pnpm exec werkstatt run rfc.validate --id RFC-0798`
- `rtk pnpm --filter @warpgogol/werkstatt-site run build:check`
- `rtk pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- No acceptance probes declared in RFC frontmatter — `rfc.verification.emit` will skip (no evidence file generated)
- Commit messages referencing `RFC-0798` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Spam/abuse | Step 1 verifies rate limits (3/min/IP, 10KB) are in the YAML |
| Schema evolution | Step 1 verifies `version: 1` is in the YAML |
| False agent expectations | Step 1 verifies description includes async-delivery note |

## 6. Escalation triggers

- If `agent.capability.validate` reports AGC-02 or AGC-03 violations, check that `integration.source: "agent"` and `humanEquivalent.sectionType: "send-message"` are correctly set in the YAML.
- If `rfc.implement.stamp` fails with RFC-IMP-04 (dirty RFC file), check for uncommitted changes to the RFC file and commit them before retrying.
