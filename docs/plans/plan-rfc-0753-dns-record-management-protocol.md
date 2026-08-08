---
rfcId: RFC-0753
planId: PLAN-RFC-0753-01
status: draft
owner: architecture
createdAt: 2026-08-08
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/ontology"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0753

## 1. Objectives

- [ ] Objective 1 — Zod schema for DNS record declaration file exists and is exported from `@warpgogol/ontology` (maps to acceptance criterion: declaration file schema)
- [ ] Objective 2 — Shared Cloudflare API client in `src/cloudflare/` handles auth, pagination, and retry (maps to acceptance criterion: Cloudflare API usage)
- [ ] Objective 3 — Four DNS record commands (`dns.record.upsert`, `dns.record.validate`, `dns.record.list`, `dns.record.delete`) are registered in the kernel command table (maps to acceptance criteria: command registration)
- [ ] Objective 4 — `dns.record.upsert` is idempotent and supports `--dry-run` (maps to acceptance criteria: upsert idempotency)
- [ ] Objective 5 — `dns.record.validate` detects drift, missing records, and extra records (maps to acceptance criteria: validate states)
- [ ] Objective 6 — `dns.record.delete` handles multi-value types with `--content` disambiguation (maps to acceptance criteria: delete)
- [ ] Objective 7 — `dns.records.schema.validate` is integrated into `PACKAGES_CHECK_PIPELINE` as a warning-level workspace check (schema-only, no API) (maps to acceptance criterion: pipeline integration)
- [ ] Objective 8 — `systems/warpgogol-com/dns-records.yaml` declaration file exists with email records (maps to acceptance criterion: studio zone declaration)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/schemas/dns-records.ts` — new Zod schema file (`dnsRecordDeclarationSchema`, `dnsRecordFileSchema`)
- `packages/ontology/src/schemas/index.ts` — export new schemas
- `packages/os/site-kernel-handoff/src/cloudflare/` — new directory:
  - `cloudflare-client.ts` — shared API client (auth, pagination, retry with exponential backoff)
  - `cloudflare-client.test.ts` — unit tests for client
- `packages/os/site-kernel-handoff/src/dns/` — new directory:
  - `dns-record-upsert.ts` — upsert handler
  - `dns-record-validate.ts` — validate handler
  - `dns-record-list.ts` — list handler
  - `dns-record-delete.ts` — delete handler
  - `dns-records.test.ts` — unit tests for all four commands
  - `txt-normalize.ts` — TXT content normalization utility
- `packages/os/site-kernel-handoff/src/dns.module.ts` — new kernel module registering all four commands
- `packages/os/site-kernel-handoff/src/index.ts` — export `createDnsModule`
- `packages/os/site-kernel-handoff/src/module.ts` — register `createDnsModule` in the module list
- `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` — add `dns.records.schema.validate` check entry (workspace scope, warning-level, schema-only, no API calls)
- `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` — add `{ command: "dns.records.schema.validate" }` step
- `systems/warpgogol-com/dns-records.yaml` — new declaration file with email records and external CNAMEs

### 2.2 Configuration and data

- `systems/registry.yaml` — ensure `cloudflareZoneId` field exists on `warpgogol-com` entry (may already exist from RFC-0752)
- `systems/warpgogol-com/dns-records.yaml` — new version-controlled declaration file

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — document the new DNS command family and shared `src/cloudflare/` API client
- No `docs/*.xml` Compass files require synchronization (operational concern, not content model)
- No `docs/architecture-dna.md` changes (satisfies existing DNA-40, no new invariant)

### 2.4 Validation and pipelines

- `PACKAGES_CHECK_PIPELINE` — new `dns.records.schema.validate` step (warning-level, schema-only, no API calls)
- `rfc.validate --id RFC-0753` — must pass before stamping
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — must pass
- `pnpm --filter @warpgogol/ontology run build:check` — must pass
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — must pass

## 3. Step sequence

### Step 1. Zod schema for DNS record declaration file

**Goal:** Create the canonical schema for `dns-records.yaml` declaration files.

**Agent actions:**

- Create `packages/ontology/src/schemas/dns-records.ts` with:
  - `dnsRecordTypeSchema` — enum: A, AAAA, CNAME, MX, TXT, SRV, CAA
  - `dnsRecordDeclarationSchema` — `{ name, type, content, priority?, proxied?, comment? }`
  - `dnsRecordFileSchema` — `{ kind: "dns-records", schemaVersion: 1, zone, updatedAt, records[] }`
  - Export types: `DnsRecordDeclaration`, `DnsRecordFile`
- Add exports to `packages/ontology/src/schemas/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/ontology run build:check` passes
- Schema parses the example declaration from the RFC

**Completion criterion:** `dnsRecordFileSchema` is exported from `@warpgogol/ontology` and `build:check` passes.

**Human review:** no

---

### Step 2. Shared Cloudflare API client

**Goal:** Create the shared API client in `src/cloudflare/` that handles authentication, pagination, and retry.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/cloudflare/cloudflare-client.ts`:
  - `createCloudflareClient(token: string)` — returns client object
  - `listDnsRecords(zoneId: string)` — paginated GET, returns all records
  - `createDnsRecord(zoneId, record)` — POST
  - `updateDnsRecord(zoneId, recordId, record)` — PUT
  - `deleteDnsRecord(zoneId, recordId)` — DELETE
  - Retry logic: 3 attempts for 502/503/504/522 with 1s, 2s backoff
  - Pagination: automatic page traversal (50 per page)
- Create `packages/os/site-kernel-handoff/src/cloudflare/cloudflare-client.test.ts`:
  - Mock `fetch` responses for success, pagination, retry, and error cases
  - Verify retry behavior on transient failures
  - Verify pagination traverses all pages

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes
- Unit tests pass

**Completion criterion:** Client handles auth, pagination, and retry. Unit tests cover success, pagination, retry, and error paths.

**Human review:** no

---

### Step 3. TXT content normalization utility

**Goal:** Create a utility that normalizes TXT record content for comparison.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/dns/txt-normalize.ts`:
  - `normalizeTxtContent(content: string): string` — trims whitespace, concatenates split character-strings
  - Handles Cloudflare's long-record splitting (> 255 bytes)
- Add unit tests for normalization cases

**Validation:**

- Unit tests pass for: simple TXT, split TXT, whitespace-padded TXT, empty TXT

**Completion criterion:** `normalizeTxtContent` produces identical output for semantically identical TXT records with different formatting.

**Human review:** no

---

### Step 4. DNS record command handlers

**Goal:** Implement all four DNS record command handlers.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/dns/dns-record-upsert.ts`:
  - Read declaration file, resolve zone ID, list existing records (paginated)
  - For each declared record: find match, create/update/skip (with TXT normalization)
  - Support `--dry-run` flag (no API mutations, hypothetical results with `id: null`)
  - Continue on per-record errors (collect in `errors[]`)
  - Return `DnsRecordUpsertResult`
- Create `packages/os/site-kernel-handoff/src/dns/dns-record-validate.ts`:
  - Read declaration file, resolve zone ID, list existing records
  - Compare declared vs. Cloudflare (with TXT normalization)
  - Return `DnsRecordValidateResult` with `state: valid | drifted | missing-records`
  - Exit 0 with info message if declaration file is missing
- Create `packages/os/site-kernel-handoff/src/dns/dns-record-list.ts`:
  - Resolve zone ID, list all records (paginated)
  - Return `DnsRecordListResult`
- Create `packages/os/site-kernel-handoff/src/dns/dns-record-delete.ts`:
  - Resolve zone ID, find record(s) by `--name` and `--type`
  - For multi-value types (MX, TXT), require `--content`; error if multiple matches without `--content`
  - Delete via API, return `DnsRecordDeleteResult`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** All four handlers are implemented and type-check cleanly.

**Human review:** no

---

### Step 5. Kernel module registration

**Goal:** Register all four DNS commands in the kernel.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/dns.module.ts`:
  - `createDnsModule(): KernelModule` — registers `dns.record.upsert`, `dns.record.validate`, `dns.record.list`, `dns.record.delete`
  - Each command declares `scope: "workspace"`, `flags`, `reads`, `writes`, `mutatesState`, `cacheable: false`
  - `dns.record.upsert` flags: `--zone` (required), `--dry-run` (optional)
  - `dns.record.validate` flags: `--zone` (required), `--mode` (optional, default "warning")
  - `dns.record.list` flags: `--zone` (required)
  - `dns.record.delete` flags: `--zone` (required), `--name` (required), `--type` (required), `--content` (optional)
- Export `createDnsModule` from `packages/os/site-kernel-handoff/src/index.ts`
- Register `createDnsModule()` in `packages/os/site-kernel-handoff/src/module.ts` module list

**Validation:**

- `pnpm exec site-kernel run dns.record.list --zone warpgogol.com --json` returns a result (or a clear error if token/zone missing)
- `command.reads.validate` passes for all new commands

**Completion criterion:** All four commands appear in the kernel command registry and can be invoked.

**Human review:** no

---

### Step 6. Pipeline integration

**Goal:** Integrate `dns.records.schema.validate` (schema-only, no API calls) into `PACKAGES_CHECK_PIPELINE` as a warning-level workspace check.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/dns/dns-records-schema-validate.ts`:
  - `runDnsRecordsSchemaValidate` handler — scans all `systems/*/dns-records.yaml` files
  - Validates each file against `dnsRecordFileSchema` (Zod)
  - No Cloudflare API calls — pure schema validation
  - Skips zones without a declaration file (info-level, not error)
  - Reports schema violations as warnings
- Register `dns.records.schema.validate` command in `dns.module.ts`:
  - `scope: "workspace"`, `mutatesState: false`, `cacheable: true`
  - `reads: ["systems/*/dns-records.yaml"]`
  - No flags (scans all zones automatically)
- Add `{ command: "dns.records.schema.validate" }` to `PACKAGES_CHECK_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/packages-check.ts`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- `packages-check.run` includes the new step without errors

**Completion criterion:** `dns.records.schema.validate` runs as part of `PACKAGES_CHECK_PIPELINE`, validates declaration file schemas, and skips zones without declaration files.

**Human review:** no

---

### Step 7. Studio zone declaration file

**Goal:** Create the first declaration file for `warpgogol.com`.

**Agent actions:**

- Create `systems/warpgogol-com/dns-records.yaml` with:
  - MX records (Cloudflare Email Routing)
  - SPF TXT record
  - DKIM TXT record (public key only)
  - DMARC TXT record
  - External CNAMEs (e.g. Pulsetic monitoring)
  - Domain verification TXT records
- Verify `systems/registry.yaml` has `cloudflareZoneId` for `warpgogol-com` entry

**Validation:**

- `yaml.parse.validate` passes on the new file
- `dnsRecordFileSchema` parses the file successfully

**Completion criterion:** `systems/warpgogol-com/dns-records.yaml` exists and validates against the Zod schema.

**Human review:** yes — DNS records are external contract changes (Cloudflare zone). Operator must verify records match their Cloudflare zone before running `dns.record.upsert`.

---

### Step 8. Unit tests

**Goal:** Comprehensive unit tests for all DNS record commands and the Cloudflare API client.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/dns/dns-records.test.ts`:
  - Mock `fetch` for Cloudflare API responses
  - Test `dns.record.upsert`: create, update, unchanged, dry-run, per-record error, missing declaration file
  - Test `dns.record.validate`: valid, drifted, missing-records, extra records, TXT normalization
  - Test `dns.record.list`: paginated response, empty zone
  - Test `dns.record.delete`: single-value, multi-value with `--content`, multi-value without `--content` (error), not found
- Create `packages/os/site-kernel-handoff/src/cloudflare/cloudflare-client.test.ts`:
  - Test pagination, retry, auth error, malformed response

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` passes
- All test cases pass

**Completion criterion:** All unit tests pass and cover the acceptance criteria scenarios.

**Human review:** no

---

### Step 9. AGENTS.md documentation

**Goal:** Document the new DNS command family in the handoff package AGENTS.md.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/AGENTS.md`:
  - Add section for DNS record commands (`dns.record.upsert`, `dns.record.validate`, `dns.record.list`, `dns.record.delete`)
  - Document the shared `src/cloudflare/` API client
  - Note the boundary: `dns.record.*` manages arbitrary DNS records; `subdomain.*` (RFC-0752) manages Worker-backed subdomains

**Validation:**

- `git diff` shows only the AGENTS.md file changed

**Completion criterion:** AGENTS.md documents the DNS command family and the shared API client.

**Human review:** no

---

### Step 10. Validation suite

**Goal:** Run all validation checks and verify acceptance criteria.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0753`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/ontology run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- Run `pnpm exec site-kernel run packages-check.run` (includes `dns.record.validate` step)
- Check off acceptance criteria in the RFC

**Validation:**

- All commands pass with exit code 0

**Completion criterion:** All validation checks pass. Every acceptance criterion is either checked off or documented as blocked (e.g. requires live Cloudflare API token).

**Human review:** no

---

### Step 11. Evidence emission

**Goal:** Emit verification evidence for the RFC.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0753`
- If evidence file is generated, commit it

**Validation:**

- Evidence file exists at `docs/rfcs/verification/rfc-0753.generated.json` (or emission is skipped with a documented reason)

**Completion criterion:** Evidence emission attempted and result documented.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated with DNS command family documentation.
- Verify no `docs/*.xml` Compass files need synchronization (operational concern, not content model).
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion against the implemented code. Mark `[x]` for verified. For unchecked `[ ]`, document why (e.g. "requires live Cloudflare API token").
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0753 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0753`
- Review report exists for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0753`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/ontology run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run packages-check.run`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0753` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0753.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0753` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Email deliverability disruption | Step 4: `--dry-run` flag on upsert; Step 7: human review of declaration file before upsert |
| Cloudflare API rate limits | Step 2: paginated API calls in shared client; Step 4: per-record upsert (not bulk) |
| Declaration file drift | Step 4: `dns.record.validate` before upsert; Step 7: human review of declaration |
| Agent misinterpretation (dns.record vs subdomain) | Step 9: AGENTS.md documents the boundary |
| DKIM key security | Step 7: declaration file contains only public keys; schema has no private key field |
| TXT content normalization false-positives | Step 3: `normalizeTxtContent` utility handles split/whitespace/quotes |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-40, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0753 --reason "..." --invariant "DNA-40"` instead of working around it.
- If the shared `src/cloudflare/` client cannot be used by RFC-0752 (e.g. different auth model), create a follow-up RFC to reconcile the client contracts.
- If `dns.records.schema.validate` in `PACKAGES_CHECK_PIPELINE` causes CI failures, ensure the handler gracefully skips zones without declaration files (info-level, not error). No `CLOUDFLARE_API_TOKEN` is needed for schema-only validation.
