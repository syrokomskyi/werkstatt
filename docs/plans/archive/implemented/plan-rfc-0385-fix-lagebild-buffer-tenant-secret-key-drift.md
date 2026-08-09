---
rfcId: RFC-0385
planId: PLAN-RFC-0385-01
status: draft
owner: architecture
createdAt: 2026-07-14
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/integration-adapter-supabase-crm"
    - "@gogol/ui"
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - docs/specs/visitor-funnel/05-site-config.md
    - packages/integration-adapter-supabase-crm/README.md
    - packages/integration-adapter-supabase-crm/AGENTS.md
---

# Implementation Plan: RFC-0385

## 1. Objectives

- [ ] Objective 1 — Rename `TENANT_ID` to `SUPABASE_BUFFER_TENANT_ID` in `SUPABASE_BUFFER_SECRETS` — maps to acceptance criterion 1
- [ ] Objective 2 — Update delivery route import and injection — maps to acceptance criterion 2
- [ ] Objective 3 — Update chat-widget manifest `api[].secrets` — maps to acceptance criterion 3
- [ ] Objective 4 — Update `LAGEBILD_BUFFER_KEYS` in env-example generator — maps to acceptance criterion 4
- [ ] Objective 5 — Update README and AGENTS.md secret references — maps to acceptance criterion 8
- [ ] Objective 6 — Verify no stale `TENANT_ID` buffer references remain — maps to acceptance criterion 5
- [ ] Objective 7 — Pass scoped build:check and rfc.validate — maps to acceptance criteria 6, 7, 9

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/integration-adapter-supabase-crm/src/adapter.ts` — `SUPABASE_BUFFER_SECRETS` tuple line 113: `"TENANT_ID"` → `"SUPABASE_BUFFER_TENANT_ID"`; JSDoc comment line 108
- `packages/ui/src/integration-routes/integration-delivery.api.ts` — import line 40: `TENANT_ID` → `SUPABASE_BUFFER_TENANT_ID`; injection line 59: `TENANT_ID` → `SUPABASE_BUFFER_TENANT_ID`
- `packages/ui/src/sections/chat-widget/chat-widget-section.manifest.yaml` — `api[].secrets` line 68: `TENANT_ID` → `SUPABASE_BUFFER_TENANT_ID`
- `packages/ui/src/sections/send-message/send-message-section.manifest.yaml` — `api[].secrets` line 54: `TENANT_ID` → `SUPABASE_BUFFER_TENANT_ID` (discovered during plan grilling; this manifest also feeds the generated env schema)
- `packages/os/site-kernel-checks/src/env/env-example.ts` — `LAGEBILD_BUFFER_KEYS` line 65: `"TENANT_ID"` → `"SUPABASE_BUFFER_TENANT_ID"`; comment line 161

### 2.2 Configuration and data

- No YAML/JSON config changes beyond the manifest listed above.
- No ontology catalog changes.
- No system.md changes.

### 2.3 Documentation and specs

- `docs/specs/visitor-funnel/05-site-config.md` — verify only (already uses canonical name)
- `packages/integration-adapter-supabase-crm/README.md` — line 31: `TENANT_ID` → `SUPABASE_BUFFER_TENANT_ID`
- `packages/integration-adapter-supabase-crm/AGENTS.md` — line 35: `TENANT_ID` → `SUPABASE_BUFFER_TENANT_ID`
- No `docs/*.xml` Compass sync needed (no repository-wide requirement or technology changes)
- No `architecture-dna.md` changes (no new DNA invariant)

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/integration-adapter-supabase-crm run build:check`
- `pnpm --filter @gogol/ui run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec werkstatt run rfc.validate RFC-0385 --json`
- Grep verification: no `TENANT_ID` as buffer tenant secret outside historical RFC text

## 3. Step sequence

### Step 1. Rename in adapter.ts

**Goal:** Change the `SUPABASE_BUFFER_SECRETS` tuple and JSDoc to use the canonical name.

**Agent actions:**

- Edit `packages/integration-adapter-supabase-crm/src/adapter.ts` line 113: replace `"TENANT_ID"` with `"SUPABASE_BUFFER_TENANT_ID"`
- Edit JSDoc comment line 108: replace `TENANT_ID` with `SUPABASE_BUFFER_TENANT_ID`

**Validation:**

- `pnpm --filter @gogol/integration-adapter-supabase-crm run build:check`

**Completion criterion:** `SUPABASE_BUFFER_SECRETS` array contains `"SUPABASE_BUFFER_TENANT_ID"` and does not contain `"TENANT_ID"`.

**Human review:** no

---

### Step 2. Update delivery route

**Goal:** Change the import and injection in the delivery API route.

**Agent actions:**

- Edit `packages/ui/src/integration-routes/integration-delivery.api.ts` line 40: rename import `TENANT_ID` → `SUPABASE_BUFFER_TENANT_ID`
- Edit line 59: rename injection `TENANT_ID` → `SUPABASE_BUFFER_TENANT_ID`

**Validation:**

- `pnpm --filter @gogol/ui run build:check`

**Completion criterion:** No `TENANT_ID` reference in `integration-delivery.api.ts`; `SUPABASE_BUFFER_TENANT_ID` imported and injected.

**Human review:** no

---

### Step 3. Update section manifests

**Goal:** Change the `api[].secrets` entries in both manifests that declare the buffer tenant secret so the generated env schema matches.

**Agent actions:**

- Edit `packages/ui/src/sections/chat-widget/chat-widget-section.manifest.yaml` line 68: replace `TENANT_ID` with `SUPABASE_BUFFER_TENANT_ID`
- Edit `packages/ui/src/sections/send-message/send-message-section.manifest.yaml` line 54: replace `TENANT_ID` with `SUPABASE_BUFFER_TENANT_ID`

**Validation:**

- `pnpm --filter @gogol/ui run build:check`

**Completion criterion:** Both manifests' `api[].secrets` lists for `integration-route` reference `SUPABASE_BUFFER_TENANT_ID`, not `TENANT_ID`.

**Human review:** no

---

### Step 4. Update env-example generator

**Goal:** Change the hardcoded `LAGEBILD_BUFFER_KEYS` array and comment in the env-example generator.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/env/env-example.ts` line 65: replace `"TENANT_ID"` with `"SUPABASE_BUFFER_TENANT_ID"`
- Edit comment line 161: replace `TENANT_ID` with `SUPABASE_BUFFER_TENANT_ID`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `LAGEBILD_BUFFER_KEYS` contains `"SUPABASE_BUFFER_TENANT_ID"` and comment uses canonical name.

**Human review:** no

---

### Step 5. Update README and AGENTS.md

**Goal:** Update documentation references to the canonical secret name.

**Agent actions:**

- Edit `packages/integration-adapter-supabase-crm/README.md` line 31: `TENANT_ID` → `SUPABASE_BUFFER_TENANT_ID`
- Edit `packages/integration-adapter-supabase-crm/AGENTS.md` line 35: `TENANT_ID` → `SUPABASE_BUFFER_TENANT_ID`

**Validation:**

- Visual confirmation of edited lines

**Completion criterion:** Both files reference `SUPABASE_BUFFER_TENANT_ID` in the required secrets list.

**Human review:** no

---

### Step 6. Grep verification

**Goal:** Confirm no stale `TENANT_ID` buffer-tenant references remain in active source.

**Agent actions:**

- Run grep for `TENANT_ID` across `packages/`, `services/`, `apps/` (excluding `docs/rfcs/`, `docs/audits/`, `docs/specs/visitor-funnel/` historical text)
- Verify remaining hits are only `tenant_id` (lowercase DB column names in `client.ts`, `crm-buffer.ts`) — those are Postgres column names, not env secret names, and are out of scope

**Validation:**

- Grep results show no uppercase `TENANT_ID` env secret reference outside historical RFC/audit text

**Completion criterion:** No workspace source outside historical RFC text references `TENANT_ID` as the buffer tenant secret.

**Human review:** no

---

### Step 7. Validate and stamp

**Goal:** Run all validation and transition RFC to implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate RFC-0385 --json`
- Run scoped `build:check` for all three packages
- Verify spec `05-site-config.md` uses canonical name (already confirmed)
- Stamp RFC `status: implemented`, `implementedAt: 2026-07-14`
- Commit

**Validation:**

- `rfc.validate RFC-0385` passes
- All three `build:check` commands pass

**Completion criterion:** All acceptance criteria checkboxes can be checked; RFC stamped implemented.

**Human review:** no

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0385 --json`
- `pnpm --filter @gogol/integration-adapter-supabase-crm run build:check`
- `pnpm --filter @gogol/ui run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- Grep: no uppercase `TENANT_ID` as buffer env secret in active source

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0385` in the subject line (RFC-0265 commit hygiene)
- No verification evidence artifact needed (RFC-0385 has no acceptance probes)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Operator secrets already set as `TENANT_ID` | Step 7 verifies canonical name; RFC-0387 runbook covers operator migration |
| Agent misinterpretation (restoring fallback) | Step 1-4 are pure renames with no fallback logic; implementation notes forbid it |
| False-positive validators | Validators become stricter; `integration.secrets.validate` reads dynamically from `requiredSecrets` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-40, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0385 --reason "..." --invariant "DNA-40"` instead of working around it.
