---
rfcId: RFC-0650
planId: PLAN-RFC-0650-01
status: draft
owner: architecture
createdAt: 2026-08-02
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
    - docs/architecture-dna.md
---

# Implementation Plan: RFC-0650

## 1. Objectives

- [ ] Objective 1 — Add `runTimestamp` field to `evidence-metadata.json` written by `mission.check` (maps to acceptance criterion 1)
- [ ] Objective 2 — Add `--run-timestamp` optional flag to `mission.check` command (maps to acceptance criterion 2)
- [ ] Objective 3 — Auto-generate `runTimestamp` when `--run-timestamp` not provided (maps to acceptance criterion 3)
- [ ] Objective 4 — Document R2 bucket layout and lifecycle rules in `packages/os/site-kernel-handoff/AGENTS.md` (maps to acceptance criteria 4, 5)
- [ ] Objective 5 — Document R2 Data Catalog table schema in `packages/os/site-kernel-handoff/AGENTS.md` (maps to acceptance criterion 6)
- [ ] Objective 6 — Append DNA-59 entry to `docs/architecture-dna.md` (maps to acceptance criterion 7)
- [ ] Objective 7 — Pass `rfc.validate` and code review (maps to acceptance criterion 8)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/mission-check.ts` — add `--run-timestamp` flag parsing, generate `runTimestamp`, write it to `evidence-metadata.json`
- `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` — add `run-timestamp` flag to `mission.check` command definition, update description to mention `runTimestamp`
- `packages/os/site-kernel-checks/src/tests/mission-check-rfc-0650.test.ts` — new unit test file for `runTimestamp` behavior

### 2.2 Configuration and data

- No YAML/JSON config changes. The `evidence-metadata.json` schema gains a `runTimestamp: string` field (always present after implementation).

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — update `mission.check` module description to mention `--run-timestamp` flag and `runTimestamp` in `evidence-metadata.json`
- `packages/os/site-kernel-handoff/AGENTS.md` — add new "Evidence preservation (RFC-0650)" section documenting R2 bucket layout, lifecycle rules, Data Catalog schema, and operator-only R2 setup policy
- `docs/architecture-dna.md` — append `## DNA-59 · Evidence preservation` entry after acceptance

### 2.4 Validation and pipelines

- No pipeline changes. `mission.check` is already invoked by `leitstand.dev-deploy` (RFC-0628). The `runTimestamp` field is transparent to existing consumers.
- `pnpm exec site-kernel run command.manifest.generate` — regenerate command manifest after adding `--run-timestamp` flag
- `pnpm exec site-kernel run rfc.validate --id RFC-0650` — validate RFC before stamping

## 3. Step sequence

### Step 1. Add `--run-timestamp` flag parsing and `runTimestamp` generation to `mission-check.ts`

**Goal:** Implement the core code change — parse the `--run-timestamp` flag, validate its format, generate a default timestamp when not provided, and write `runTimestamp` to `evidence-metadata.json`.

**Agent actions:**

- Add `--run-timestamp` flag parsing after the `commit-sha` flag parsing (around line 510). Read `input.flags["run-timestamp"]` as optional string.
- If provided, validate the format matches `YYYY-MM-DDTHH-MM-SS-mmmZ` (ISO 8601 UTC with colons replaced by hyphens). On invalid format, return `failResult` with exit code 1 and `INVALID_FLAG` diagnostic: `mission.check: Invalid --run-timestamp format '<value>'. Expected YYYY-MM-DDTHH-MM-SS-mmmZ (ISO 8601 UTC with colons replaced by hyphens).`
- If not provided, generate automatically: `new Date().toISOString()` with colons replaced by hyphens: `toISOString().replace(/:/g, "-")`. This produces the filesystem-safe format `YYYY-MM-DDTHH-MM-SS-mmmZ`.
- Extend the `evidenceMetadata` object type at line 732 to include `runTimestamp: string`. Set `evidenceMetadata.runTimestamp = runTimestamp` (always present, not optional).
- Write the `runTimestamp` value to `evidence-metadata.json` alongside `missionId` and `commitSha`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — TypeScript compiles
- Manual inspection: `evidence-metadata.json` type includes `runTimestamp: string`

**Completion criterion:** `mission-check.ts` parses `--run-timestamp` flag, validates format, generates default timestamp, and writes `runTimestamp` to `evidence-metadata.json`. TypeScript compiles without errors.

**Human review:** no

---

### Step 2. Update `mission.check` command definition in `infra-contracts.ts`

**Goal:** Register the `--run-timestamp` flag in the command table so it appears in the command manifest and is available to CLI consumers.

**Agent actions:**

- Add `run-timestamp` flag entry to the `flags` object in the `mission.check` command definition (after `commit-sha`):
  ```ts
  "run-timestamp": {
    kind: "string",
    description:
      "RFC-0650: Explicit run timestamp in YYYY-MM-DDTHH-MM-SS-mmmZ format (ISO 8601 UTC with colons replaced by hyphens). Defaults to current time if not provided. Embedded in evidence-metadata.json.",
  },
  ```
- Update the `mission.check` description string to mention `runTimestamp` in `evidence-metadata.json`: append `"RFC-0650: writes runTimestamp to evidence-metadata.json."` to the description.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run command.manifest.generate` — regenerate manifest
- Verify `run-timestamp` flag appears in `docs/command-manifest.generated.yaml` under `mission.check`

**Completion criterion:** `--run-timestamp` flag is registered in the command table and appears in the regenerated command manifest.

**Human review:** no

---

### Step 3. Write unit tests for `runTimestamp` behavior

**Goal:** Verify that `runTimestamp` is correctly generated, validated, and written to `evidence-metadata.json`.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/mission-check-rfc-0650.test.ts`
- Test cases:
  1. `runTimestamp` is auto-generated when `--run-timestamp` not provided — verify `evidence-metadata.json` contains `runTimestamp` matching `YYYY-MM-DDTHH-MM-SS-mmmZ` format
  2. `runTimestamp` uses explicit value when `--run-timestamp` provided — verify the exact value is written
  3. Invalid `--run-timestamp` format returns exit code 1 with `INVALID_FLAG` diagnostic
  4. `runTimestamp` is always present (not optional) in `evidence-metadata.json`
- Mock external dependencies (Playwright, Crawlee, chromium preflight) to isolate the `runTimestamp` logic. Follow existing `mission-check.test.ts` mock patterns.
- Use helper that reads `evidence-metadata.json` from the evidence dir and parses it.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test -- --run mission-check-rfc-0650`

**Completion criterion:** All 4 test cases pass. Tests verify `runTimestamp` presence, format, explicit override, and invalid format rejection.

**Human review:** no

---

### Step 4. Document R2 topology in `packages/os/site-kernel-handoff/AGENTS.md`

**Goal:** Add the R2 bucket layout, lifecycle rules, Data Catalog schema, and operator-only setup policy to the handoff AGENTS.md.

**Agent actions:**

- Add a new "## Evidence preservation (RFC-0650)" section after the existing Leitstand section.
- Document:
  - R2 bucket name: `axiom-evidence`
  - Key structure: `{systemId}/{missionId}/{runTimestamp}/{filename}`
  - Timestamp format: `YYYY-MM-DDTHH-MM-SS-mmmZ` (ISO 8601 UTC, colons → hyphens)
  - Lifecycle rules table (raw/ → IA after 7 days, raw/ → delete after 365 days, other objects no transition)
  - Data Catalog table `axiom_evidence_runs` schema (9 columns)
  - Operator-only setup: `wrangler r2 bucket create`, `wrangler r2 bucket catalog enable`, `wrangler r2 bucket lifecycle` — agents MUST NOT run these automatically
  - `evidence-metadata.json` now includes `runTimestamp` field (written by `mission.check`)
  - `evidence.sync` and `evidence.fetch` are RFC-0651, not this RFC

**Validation:**

- Visual inspection of the new AGENTS.md section

**Completion criterion:** R2 bucket layout, lifecycle rules, Data Catalog schema, and operator-only policy are documented in `packages/os/site-kernel-handoff/AGENTS.md`.

**Human review:** no

---

### Step 5. Update `packages/os/site-kernel-checks/AGENTS.md` mission.check description

**Goal:** Update the `mission.check` module table entry to mention the `--run-timestamp` flag and `runTimestamp` field.

**Agent actions:**

- In the `src/mission-check.ts` row of the module table, add `RFC-0650: writes runTimestamp to evidence-metadata.json. --run-timestamp flag (optional, ISO 8601 UTC filesystem-safe format, defaults to current time).` to the description.

**Validation:**

- Visual inspection

**Completion criterion:** `mission.check` module description in `packages/os/site-kernel-checks/AGENTS.md` mentions `--run-timestamp` flag and `runTimestamp` field.

**Human review:** no

---

### Step 6. Append DNA-59 to `docs/architecture-dna.md`

**Goal:** Add the DNA-59 invariant entry established by this RFC.

**Agent actions:**

- Append `## DNA-59 · Evidence preservation` section to `docs/architecture-dna.md` with the text from the RFC's Decision section:
  > Axiom evidence from `mission.check` is preserved as an append-only archive in S3-compatible storage (Cloudflare R2) with timestamped keys. Raw artifacts are subject to lifecycle-based storage tier transition. The archive is queryable via R2 Data Catalog. Local evidence is ephemeral (latest run only); R2 is the durable history.
- Reference RFC-0650 as the establishing RFC.

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0650` — should now pass without V-18 warning (DNA-59 exists)

**Completion criterion:** `## DNA-59 · Evidence preservation` entry exists in `docs/architecture-dna.md`.

**Human review:** no — DNA-59 was declared in the RFC and accepted by the operator.

---

### Step 7. Run full validation suite

**Goal:** Verify all code, tests, and documentation pass validation.

**Agent actions:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec site-kernel run command.manifest.generate`
- `pnpm exec site-kernel run rfc.validate --id RFC-0650`
- `git status` — verify only expected files changed

**Validation:**

- All commands exit 0

**Completion criterion:** TypeScript compiles, all tests pass, command manifest regenerated, RFC validation passes, no unexpected file changes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify all `scope.docs` files are updated: `packages/os/site-kernel-checks/AGENTS.md`, `packages/os/site-kernel-handoff/AGENTS.md`, `docs/architecture-dna.md`.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (not needed — no new commands, only a flag addition).
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0650 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0650`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0650`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec site-kernel run command.manifest.generate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0650` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent misinterpretation — agents may create R2 bucket automatically | Step 4 documents operator-only policy in AGENTS.md |
| Performance impact on mission.check | Step 1 adds a single string field — negligible |
| Key collision — two runs with same timestamp | Step 1 generates timestamp with millisecond precision; collision handling deferred to RFC-0651 |
| Data Catalog write complexity | Out of scope for this RFC — Iceberg writes are RFC-0651 |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-52, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0650 --reason "..." --invariant "DNA-N"` instead of working around it.
