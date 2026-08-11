---
rfcId: RFC-0814
planId: PLAN-RFC-0814-01
status: draft
owner: architecture
createdAt: 2026-08-12
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
  services: []
  docs: []
---

# Implementation Plan: RFC-0814

## 1. Objectives

- [ ] Objective 1 — Add `--system` auto-injection in `executePipelineForSite` for workspace-scoped commands that accept it (maps to acceptance: `--system` auto-injected for workspace-scoped commands that accept it)
- [ ] Objective 2 — Add `--system` auto-injection in `executeKernelCommand` CLI path for workspace-scoped commands (maps to acceptance: `--system` auto-injected in CLI path)
- [ ] Objective 3 — Revert `dns.record.upsert` `system` flag to `required: true` (maps to acceptance: `dns.record.upsert` `--system` flag reverted to `required: true`)
- [ ] Objective 4 — Unit tests covering injection, deduplication, non-string kind, and CLI path (maps to acceptance: 4 unit test criteria)
- [ ] Objective 5 — `rfc.validate` passes (maps to acceptance: `rfc.validate` passes)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts` — add `--system` injection after `--site` injection in `executePipelineForSite` (after line 694)
- `packages/werkstatt/src/kernel/runtime/execute-command.ts` — add `--system` injection after `--site` re-injection in `executeKernelCommand` (after line 404)
- `packages/werkstatt/src/dns/dns.module.ts` — revert `dns.record.upsert` `system` flag from optional to `required: true` (line 38-41)

### 2.2 Configuration and data

None.

### 2.3 Documentation and specs

- RFC file (read-only reference): `docs/rfcs/rfc-0814-add-system-flag-auto-injection-for-workspace-scoped-pipeline-commands.md`
- No AGENTS.md updates needed (internal behavior change, no new agent-facing rules)
- No Compass XML updates needed (no repository-wide semantics change)
- No `docs/architecture-dna.md` updates needed (no DNA invariant change)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt run test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0814` — RFC validation
- `pnpm exec werkstatt run command.manifest.generate` — regenerate command manifest if command metadata changed

## 3. Step sequence

### Step 1. Add `--system` injection in pipeline executor

**Goal:** Add `--system` auto-injection in `executePipelineForSite` after the existing `--site` injection.

**Agent actions:**

- In `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts`, after the `--site` injection block (line 692-694), add `--system` injection:
  ```ts
  if (command.scope === "workspace" && !stepArgs.includes("--system") && site.name) {
    const acceptsSystem = !command.flags || ("system" in command.flags && command.flags.system.kind === "string");
    if (acceptsSystem) {
      stepArgs.push("--system", site.name);
    }
  }
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes

**Completion criterion:** `executePipelineForSite` injects `--system` for workspace-scoped commands that declare a `system` string flag or have no flag schema.

**Human review:** no

---

### Step 2. Add `--system` injection in CLI command executor

**Goal:** Add `--system` auto-injection in `executeKernelCommand` after the existing `--site` re-injection for workspace commands.

**Agent actions:**

- In `packages/werkstatt/src/kernel/runtime/execute-command.ts`, after the `--site` re-injection block (line 402-404), add `--system` injection:
  ```ts
  if (options.siteName && !wsArgv.includes("--system")) {
    const acceptsSystem = !wsCommand.flags || ("system" in wsCommand.flags && wsCommand.flags.system.kind === "string");
    if (acceptsSystem) {
      wsArgv.push("--system", options.siteName);
    }
  }
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes

**Completion criterion:** `executeKernelCommand` injects `--system` for workspace-scoped commands that declare a `system` string flag or have no flag schema, when `options.siteName` is available.

**Human review:** no

---

### Step 3. Revert `dns.record.upsert` `system` flag to required

**Goal:** Revert the workaround that made `--system` optional on `dns.record.upsert`.

**Agent actions:**

- In `packages/werkstatt/src/dns/dns.module.ts`, change the `system` flag definition for `dns.record.upsert` (line 38-41) from optional to `required: true`:
  ```ts
  system: {
    kind: "string",
    required: true,
    description: "System ID from system-config.yaml. Auto-injected by pipeline/CLI when --site is provided.",
  },
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes

**Completion criterion:** `dns.record.upsert` declares `system` as `required: true` in its flag schema.

**Human review:** no

---

### Step 4. Unit tests

**Goal:** Add unit tests covering all injection scenarios.

**Agent actions:**

- Create `packages/werkstatt/src/kernel/runtime/execute-pipeline-system-injection.test.ts` (or add to existing pipeline test file):
  - Test 1: workspace command with `system: { kind: "string" }` flag receives `--system <site.name>` in pipeline
  - Test 2: workspace command without `system` flag is unaffected (no `--system` injected)
  - Test 3: explicit `--system` in step args is not duplicated
  - Test 4: workspace command with `system: { kind: "boolean" }` flag is unaffected (no `--system` injected)
  - Test 5: workspace command with no flag schema (legacy) receives `--system`
- Create or extend test for CLI path (`executeKernelCommand`):
  - Test 6: `werkstatt run dns.record.upsert --site warpgogol-com` injects `--system warpgogol-com` and exits 0

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` passes

**Completion criterion:** All 6 tests pass and cover the acceptance criteria for injection, deduplication, non-string kind, and CLI path.

**Human review:** no

---

### Step 5. Regenerate command manifest

**Goal:** Update the command manifest if `dns.record.upsert` metadata changed.

**Agent actions:**

- Run `pnpm exec werkstatt run command.manifest.generate`
- Verify `dns.record.upsert` entry reflects `required: true` for `system` flag

**Validation:**

- `git diff docs/ecosystem.generated.yaml` shows the `system` flag change for `dns.record.upsert`

**Completion criterion:** Command manifest regenerated and reflects the `required: true` change.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No AGENTS.md updates needed — verify by checking `git diff` against root, `packages/`, and `packages/werkstatt/` AGENTS.md files.
- No Compass XML updates needed — verify no `docs/*.xml` files were modified.
- No `docs/architecture-dna.md` updates needed — no new DNA invariant.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0814` — must pass.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0814 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0814` passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0814`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0814` (acceptance probe: `werkstatt run dns.record.upsert --site warpgogol-com` expects exitCode 0)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0814.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0814` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Site name ≠ system ID | Step 1-2 use `site.name`/`options.siteName` as system ID — mitigated by RFC-0790 1:1 convention. If this ever changes, a new RFC is needed. |
| Flag schema rejection for commands without `system` | Step 1-2 `acceptsSystem` check prevents injection. Step 4 test 2 verifies. |
| Non-string `system` flag kind (e.g. boolean) | Step 1-2 `kind === "string"` check prevents injection. Step 4 test 4 verifies. |
| CLI path missing injection | Step 2 adds injection to `executeKernelCommand`. Step 4 test 6 verifies. |

## 6. Escalation triggers

- If implementation reveals that `dns.record.upsert` cannot function with `required: true` even with CLI injection (e.g. `options.siteName` is unavailable in some CLI invocation paths), do not revert to optional — instead investigate the CLI path and ensure `--system` is injected in all paths where `--site` is available.
- If a command other than `dns.record.upsert` had `--system` made optional as a workaround, audit and revert it to `required: true` as well. If the command uses a different flag name (e.g. `--id`), that is out of scope for this RFC.
