---
rfcId: RFC-0812
planId: PLAN-RFC-0812-01
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

# Implementation Plan: RFC-0812

## 1. Objectives

- [ ] Export `toApiRecord` from `dns-record-upsert.ts` — maps to acceptance criterion "toApiRecord exported from dns-record-upsert.ts"
- [ ] Write unit tests covering SVCB, HTTPS, A, AAAA, TXT, CNAME record types — maps to acceptance criteria for each record type
- [ ] Write unit tests for optional fields (`priority`, `ttl`, `comment`) — maps to acceptance criterion "Unit test for optional fields"
- [ ] Write edge case tests (empty value, missing target, single-part content) — maps to acceptance criterion "Edge case tests"
- [ ] All tests pass — maps to acceptance criterion "All tests pass with pnpm --filter @warpgogol/werkstatt run test"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/dns/dns-record-upsert.ts` — add `export` keyword to `toApiRecord` function (line 154)
- `packages/werkstatt/src/dns/dns-record-upsert.test.ts` — new colocated test file

### 2.2 Configuration and data

None.

### 2.3 Documentation and specs

- RFC file (read-only reference): `docs/rfcs/rfc-0812-add-dns-svcb-https-record-format-unit-tests.md`
- No AGENTS.md updates needed (no new commands, no architectural changes)
- No Compass XML sync needed (no repository-wide semantics changed)
- No `docs/architecture-dna.md` changes (no new DNA invariant)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run test` — vitest run
- `pnpm --filter @warpgogol/werkstatt run build:check` — tsc --noEmit
- `pnpm exec werkstatt run rfc.validate --id RFC-0812`

## 3. Step sequence

### Step 1. Export `toApiRecord`

**Goal:** Make `toApiRecord` importable from the test file.

**Agent actions:**

- Add `export` keyword to the `toApiRecord` function declaration at line 154 of `packages/werkstatt/src/dns/dns-record-upsert.ts` (change `function toApiRecord` to `export function toApiRecord`)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes

**Completion criterion:** `toApiRecord` is exported and typecheck passes.

**Human review:** no

---

### Step 2. Write unit tests

**Goal:** Create the test file covering all record types, optional fields, and edge cases.

**Agent actions:**

- Create `packages/werkstatt/src/dns/dns-record-upsert.test.ts`
- Import `toApiRecord` from `./dns-record-upsert.ts` and `DnsRecordDeclaration` type from `@warpgogol/werkstatt-site/ontology/schemas`
- Write test groups:
  1. **SVCB records**: full content parsing (priority, target, value), content with only priority and target (value = ""), content with only priority (target = ".", value = "")
  2. **HTTPS records**: full content parsing, same edge cases as SVCB
  3. **A records**: content pass-through, no `data` object, `proxied: true`
  4. **AAAA records**: content pass-through, no `data` object
  5. **TXT records**: verify `normalizeTxtContent()` is applied (e.g. quoted content `"v=spf1 -all"` becomes `v=spf1 -all`), not raw pass-through
  6. **CNAME records**: content pass-through, no `data` object
  7. **Optional fields**: `ttl` present → included; `ttl` absent → omitted. `comment` present → included; `comment` absent → omitted. `priority` (non-SVCB) present → included; absent → omitted
  8. **Edge cases**: empty content `""` for SVCB (priority = 0, target = ".", value = ""), single-part content `"1"` (priority = 1, target = ".", value = "")
- Add a known-issue test or comment documenting that `split(/\s+/)` does not handle quoted values with spaces (e.g. `alpn="h3 h2"`)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` — all tests pass
- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes (test file compiles)

**Completion criterion:** All test groups pass; test file covers every acceptance criterion checkbox.

**Human review:** no

---

### Step 3. Validate, review, fix, and stamp

**Goal:** Run full validation suite, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck
- Run `pnpm --filter @warpgogol/werkstatt run test` — all tests pass
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0812` — zero violations
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0812` — emit evidence (RFC-0330, RFC created after 2026-07-07)
- Commit the implementation: `git add packages/werkstatt/src/dns/dns-record-upsert.ts packages/werkstatt/src/dns/dns-record-upsert.test.ts` + commit with `implement: RFC-0812` prefix
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations
- Check off acceptance criteria: verify each criterion against the implemented code. Mark `[x]` with inline `(evidence: <file:line>, <test-or-command>)` annotations (V-27)
- Stamp the RFC: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0812 --implementation-commit <sha>` (first `implement:` commit SHA). Run `--dry-run` first, then without
- Commit the stamped RFC separately (implementation commit and stamp commit MUST be separate)

**Validation:**

- `git status` — no uncommitted changes from this session
- `pnpm exec werkstatt run rfc.validate --id RFC-0812` — passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented`; review passed.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0812`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0812` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0812.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0812` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Export visibility — `toApiRecord` may need to be exported | Step 1 adds the `export` keyword; build:check confirms no type errors |
| Content parsing fragility — `split(/\s+/)` doesn't handle quoted values | Step 2 documents this as a known issue in the test file; nonGoals explicitly exclude fixing it |

## 6. Escalation triggers

- If implementation reveals that `toApiRecord` cannot be exported without breaking the autonomy guard (DNA-64), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0812 --reason "export violates autonomy guard" --invariant "DNA-64"` instead of working around it.
