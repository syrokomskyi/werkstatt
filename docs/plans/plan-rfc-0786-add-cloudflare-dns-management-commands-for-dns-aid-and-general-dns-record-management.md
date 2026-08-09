---
rfcId: RFC-0786
planId: PLAN-RFC-0786-01
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
    - docs/rfcs/rfc-0786-add-cloudflare-dns-management-commands-for-dns-aid-and-general-dns-record-management.md
    - docs/audits/audit-rfc-0786-add-cloudflare-dns-management-commands-for-dns-aid-and-general-dns-record-management.md
---

# Implementation Plan: RFC-0786

## 1. Objectives

- [ ] Objective 1 — Add `ttl?: number` to `dnsRecordDeclarationSchema` — maps to acceptance criterion "ttl?: number field added to dnsRecordDeclarationSchema"
- [ ] Objective 2 — Implement `buildDnsAidRecord` pure function — maps to acceptance criterion "buildDnsAidRecord pure function defined"
- [ ] Objective 3 — Implement `agent.dns-aid.generate` command handler — maps to acceptance criteria "agent.dns-aid.generate registered", "integrated into build.prepare", "agent.enabled: false skip pattern", "writes DNS-AID TXT record in marked section", "idempotent"
- [ ] Objective 4 — Implement `agent.dns-aid.validate` command handler — maps to acceptance criteria "agent.dns-aid.validate registered", "integrated into build.check", "AGD-01..04 diagnostics", "advisory exit 0"
- [ ] Objective 5 — Wire pipelines and verify build passes — maps to acceptance criteria "integrated into build.prepare", "integrated into build.check", "rfc.validate passes"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/ontology/schemas/dns-records.ts` — add `ttl?: number` to `dnsRecordDeclarationSchema`
- `packages/werkstatt-site/src/domain/share/agent/dns-aid.ts` — new module: `buildDnsAidRecord` pure function + `DnsAidRecord` interface
- `packages/werkstatt-site/src/checks/agent/agent-dns-aid.ts` — new module: `runAgentDnsAidGenerate` + `runAgentDnsAidValidate` handlers
- `packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts` — amend: add `agent.dns-aid.generate` and `agent.dns-aid.validate` entries
- `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts` — amend: add `{ command: "agent.dns-aid.generate" }` after `agent.manifest.generate` in `SITES_BUILD_PREPARE_PIPELINE` (and `SITES_BUILD_PREPARE_DEV_PIPELINE` per RFC-0787 exclusion note)
- `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts` — amend: add `{ command: "agent.dns-aid.validate" }` after `agent.openapi.validate` in `SITES_CHECK_AUTHOR_PIPELINE`

### 2.2 Configuration and data

- `systems/warpgogol-com/dns-records.yaml` — will gain a `# BEGIN dns-aid` / `# END dns-aid` marked section after the first `agent.dns-aid.generate` run (not hand-edited)

### 2.3 Documentation and specs

- RFC file (read-only reference)
- No `AGENTS.md` updates needed — DNS-AID commands are package-level, not monorepo-wide
- No `docs/*.xml` Compass files need synchronization — DNS-AID is an operational concern, not a content model change

### 2.4 Validation and pipelines

- `SITES_BUILD_PREPARE_PIPELINE` — new step after `agent.manifest.generate`
- `SITES_BUILD_PREPARE_DEV_PIPELINE` — excluded per RFC-0787 (dev pipeline excludes `public/`-producing generators; DNS-AID writes to `systems/<id>/dns-records.yaml`, not `public/`, but the RFC-0787 note explicitly lists `dns-aid` as excluded from dev)
- `SITES_CHECK_AUTHOR_PIPELINE` — new step after `agent.openapi.validate`
- `generated.drift.validate` (DNA-58) — `dns-records.yaml` is a mixed file (operator-authored + generator-managed section) and is NOT registered in `GENERATOR_OWNERSHIP_MAP`. Idempotency is guaranteed by `writeFileIfChanged` in the generator handler, not by drift validation.

## 3. Step sequence

### Step 1. Schema extension: add `ttl` field

**Goal:** Extend `dnsRecordDeclarationSchema` to support optional `ttl` field for DNS records.

**Agent actions:**

- Add `ttl: z.number().int().min(1).max(86400).optional()` to `dnsRecordDeclarationSchema` in `packages/werkstatt-site/src/domain/ontology/schemas/dns-records.ts`
- Add `ttl?: number` to the `DnsRecordDeclaration` type (automatic via `z.infer`)
- Add `<item>RFC-0786: add ttl?: number field to dnsRecordDeclarationSchema.</item>` to the `CHANGE_SUMMARY` comment block

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- Existing `dns-records-schema-validate` tests still pass: `pnpm --filter @warpgogol/werkstatt run test -- --grep dns-records`

**Completion criterion:** `ttl?: number` field present in `dnsRecordDeclarationSchema`; TypeScript compiles; existing schema tests pass.

**Human review:** no

---

### Step 2. Pure function: `buildDnsAidRecord`

**Goal:** Implement the pure projection from `AgentSurfaceManifest` to `DnsAidRecord`.

**Agent actions:**

- Create `packages/werkstatt-site/src/domain/share/agent/dns-aid.ts`
- Define `DnsAidRecord` interface: `{ name: string; type: "TXT"; content: string; ttl: number; proxied: false }`
- Implement `buildDnsAidRecord(manifest: AgentSurfaceManifest): DnsAidRecord` — extracts domain from `manifest.baseUrl`, returns record with `name: _agent.<domain>`, `content: <baseUrl>/.well-known/agent.json`, `ttl: 3600`, `proxied: false`
- Export via the `@warpgogol/werkstatt-site/share/agent` subpath export
- Write unit tests in `packages/werkstatt-site/src/domain/share/agent/dns-aid.test.ts`: determinism (same input → same output), domain extraction, content URL construction

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test -- --grep dns-aid`

**Completion criterion:** `buildDnsAidRecord` pure function exported; unit tests pass; TypeScript compiles.

**Human review:** no

---

### Step 3. Command handlers: generate + validate

**Goal:** Implement the two command handlers following the established agent surface pattern.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/agent/agent-dns-aid.ts`
- Implement `runAgentDnsAidGenerate`:
  - Load system manifest, check `agent.enabled` (skip pattern: remove stale section if disabled)
  - Load internal manifest (`src/agent-surface.generated.yaml`) — fail with exit 1 if missing
  - Call `buildDnsAidRecord(manifest)` to get the record
  - Read `systems/<id>/dns-records.yaml` (text-level, not YAML parse)
  - Find `# BEGIN dns-aid` / `# END dns-aid` markers; if found, replace section content; if not found, append section at end of `records:` array
  - If file does not exist, create it with header (`kind: dns-records`, `schemaVersion: 1`, `zone: <from registry>`, `updatedAt: <today>`) and the marked section
  - Update `updatedAt` field to current date
  - Use `writeFileIfChanged` for byte-identical output on unchanged input (DNA-58)
  - Return JSON result with `action: "created" | "updated" | "unchanged" | "removed" | "skipped"`
- Implement `runAgentDnsAidValidate`:
  - Load system manifest, check `agent.enabled` (skip if disabled, check for stale section → AGD-03)
  - Load internal manifest
  - Read `dns-records.yaml`, extract DNS-AID section
  - AGD-01: section missing or empty → error
  - AGD-02: record content does not match manifest URL → error
  - AGD-03: `agent.enabled: false` but section exists → error
  - AGD-04: record declared but not found in Cloudflare → warning (advisory, exit 0)
  - Return `diagnosticsResult("agent.dns-aid.validate", diagnostics)` — advisory (exit 0)
- Add `<MODULE_CONTRACT>` and `<CHANGE_SUMMARY>` comment blocks following the established pattern

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- Unit tests: `packages/werkstatt-site/src/checks/agent/agent-dns-aid.test.ts` — test generate (create, update, unchanged, skip, remove), validate (AGD-01..04, advisory exit 0)

**Completion criterion:** Both handlers implemented; unit tests pass; TypeScript compiles.

**Human review:** no

---

### Step 4. Command table registration

**Goal:** Register the two new commands in the agent surface command table.

**Agent actions:**

- Amend `packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts`:
  - Import `runAgentDnsAidGenerate`, `runAgentDnsAidValidate` from `../agent/agent-dns-aid.ts`
  - Add entry for `agent.dns-aid.generate`: `scope: "app"`, `supportsAllSites: true`, `mutatesState: true`, `writes: ["systems/<id>/dns-records.yaml"]`, `reads: ["<app>/src/agent-surface.generated.yaml"]`, `modulePaths: ["agent/agent-dns-aid.ts"]`
  - Add entry for `agent.dns-aid.validate`: `scope: "app"`, `supportsAllSites: true`, `reads: ["systems/<id>/dns-records.yaml", "<app>/src/agent-surface.generated.yaml"]`, `modulePaths: ["agent/agent-dns-aid.ts"]`
- Update `CHANGE_SUMMARY` comment block

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm exec werkstatt run kernel.wire` — command table regenerates kernel wiring

**Completion criterion:** Both commands registered in `AGENT_SURFACE_COMMANDS`; `kernel.wire` succeeds; TypeScript compiles.

**Human review:** no

---

### Step 5. Pipeline wiring

**Goal:** Wire the new commands into the build.prepare and sites-check-author pipelines.

**Agent actions:**

- Amend `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts`:
  - Add `{ command: "agent.dns-aid.generate" }` after `{ command: "agent.manifest.generate" }` in `SITES_BUILD_PREPARE_PIPELINE`
  - Do NOT add to `SITES_BUILD_PREPARE_DEV_PIPELINE` (per RFC-0787: dev pipeline excludes dns-aid)
- Amend `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts`:
  - Add `{ command: "agent.dns-aid.validate" }` after `{ command: "agent.openapi.validate" }` in `SITES_CHECK_AUTHOR_PIPELINE`
- Update `CHANGE_SUMMARY` comment blocks in both files

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm exec werkstatt run kernel.wire` — pipeline wiring regenerates

**Completion criterion:** Both pipeline steps added in correct positions; TypeScript compiles; `kernel.wire` succeeds.

**Human review:** no

---

### Step 6. Integration tests

**Goal:** Verify the commands work end-to-end with the pipeline.

**Agent actions:**

- Write integration test: run `agent.dns-aid.generate` on a test fixture app, verify `dns-records.yaml` has the marked section with correct content
- Write integration test: run `agent.dns-aid.generate` twice, verify byte-identical output (idempotency, DNA-58)
- Write integration test: `agent.enabled: false` → stale section removed
- Write integration test: `agent.dns-aid.validate` returns AGD-01 when section missing
- Write integration test: `agent.dns-aid.validate` returns AGD-02 when content mismatches
- Write integration test: `agent.dns-aid.validate` returns AGD-04 (warning) when record not in Cloudflare (mock or skip Cloudflare check)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- --grep dns-aid`

**Completion criterion:** All integration tests pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No `AGENTS.md` updates needed — DNS-AID is a package-level concern
- No `docs/*.xml` Compass files need synchronization
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (they did — two new commands)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0786 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0786`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- Review report exists for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0786`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0786` (if acceptance probes declared — currently commented out)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0786` in the subject line (RFC-0265 commit hygiene)
- No `rfc.verification.emit` needed (acceptance probes are commented out)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| DNS-AID spec status (draft proposal) | Step 3 — single TXT record, zero maintenance, harmless if ignored |
| DNS propagation delay | Out of scope — inherent to DNS, not a code concern |
| `dns-records.yaml` merge conflicts | Step 3 — text-level marked section replacement preserves manual edits |
| Concurrent execution | Step 3 — idempotent generator, text-level section replacement; re-running fixes any corruption |
| Agent misinterpretation risk | Step 4 — distinct command namespaces (`agent.dns-aid.*` vs `dns.record.*`) |
| Cloudflare API token permissions | No new permissions needed — RFC-0753 already requires `Zone:DNS:Edit` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-58 (determinism), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0786 --reason "..." --invariant "DNA-58"` instead of working around it (RFC-0334).
- If `dns-records.yaml` needs drift validation coverage, escalate to a superseding RFC that introduces a `section-marked` marker policy to the ownership infrastructure rather than disabling or working around the existing `ownership.sync.validate`.
