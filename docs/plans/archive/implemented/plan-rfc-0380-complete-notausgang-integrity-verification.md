---
rfcId: RFC-0380
planId: PLAN-RFC-0380-01
status: draft
owner: architecture
createdAt: 2026-07-12
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-handoff"
    - "@gogol/ontology"
  services: []
  docs:
    - docs/technology.xml
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0380

## 1. Objectives

- [ ] O1 — Zod manifest schema in `@gogol/ontology` has up-to-date Compass markup (maps to: "Export manifest is parsed as YAML and schema-validated against a Zod schema in `@gogol/ontology`" + "Zod schema includes regex validation for `systemId` and `releaseId`")
- [ ] O2 — `notausgang.export` writes YAML artifacts and uses `@gogol/fingerprint` for all hashes (maps to: "notausgang.export writes ... (not .json)" + "No crypto.createHash calls remain")
- [ ] O3 — `notausgang.validate` performs deep integrity verification with `CheckStatus` enum types (maps to: 6 acceptance criteria about re-computation, schema validation, Bordbuch, pin, snapshots, YAML-only + "NotausgangValidateData uses CheckStatus enum fields" + "No --strict flag")
- [ ] O4 — Secret scanner excludes safe locations and includes additional patterns (maps to: "Secret scanner excludes safe locations ...")
- [ ] O5 — Documentation updated: `packages/os/site-kernel-handoff/AGENTS.md` and `docs/technology.xml` (maps to: 2 acceptance criteria about docs)
- [ ] O6 — Tests cover export YAML output, validate deep verification, hash mismatch, Bordbuch parse, pin mismatch, legacy JSON violation, secret scan exclusions (maps to: "--json output includes violations array")
- [ ] O7 — `fingerprint.usage.lint` passes — no ad hoc hashing anywhere in the notausgang module (maps to: "No crypto.createHash calls remain in notausgang-commands.ts")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts` — rewrite `runNotausgangExport` (YAML + `@gogol/fingerprint`), rewrite `runNotausgangValidate` (deep verification), update `NotausgangValidateData` and `NotausgangViolation` types, add `CheckStatus` type
- `packages/os/site-kernel-handoff/src/notausgang/index.ts` — update type re-exports (`CheckStatus`, `NotausgangValidateData`), update command descriptions
- `packages/ontology/src/operations/notausgang.ts` — update `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass markup; schema shape unchanged (already uses `STERNSYSTEM_ID_REGEX` and `RELEASE_ID_REGEX`)
- `packages/ontology/src/operations/index.ts` — no change needed (already exports `notausgangManifestSchema` and `NotausgangManifest`)

### 2.2 Configuration and data

- Export package artifacts (runtime, not repo-tracked):
  - `<export>/notausgang-manifest.yaml` (replaces `.json`)
  - `<export>/artifact-manifest.yaml` (replaces `.json`)
  - `<export>/system.pin.yaml` (replaces `.json`)

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add `## Notausgang` section documenting deepened validation contract, YAML-only artifact format, no JSON fallback
- `docs/technology.xml` — update `pkg-kernel-handoff` workspace role to mention Notausgang integrity verification and YAML artifact format
- `docs/rfcs/rfc-0380-complete-notausgang-integrity-verification.md` — read-only reference (no modification during implementation except status transition)

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/site-kernel-handoff build:check` — must pass after code changes
- `pnpm --filter @gogol/ontology build:check` — must pass after schema markup changes
- `pnpm --filter @gogol/site-kernel-handoff test` — must pass with new notausgang tests
- `pnpm exec site-kernel run rfc.validate RFC-0380 --json` — must pass
- `pnpm exec site-kernel run fingerprint.usage.lint` — must pass (DNA-53 compliance)
- `notausgang.validate` is not part of any build pipeline (on-demand only)

## 3. Step sequence

### Step 1. Update Zod schema Compass markup in `@gogol/ontology`

**Goal:** Ensure the existing `notausgangManifestSchema` has up-to-date Compass scaffolding reflecting RFC-0380's deep validation role.

**Agent actions:**

- Update `MODULE_CONTRACT` purpose in `packages/ontology/src/operations/notausgang.ts` to mention RFC-0380 deep validation
- Add `CHANGE_SUMMARY` entry for RFC-0380
- Verify schema already uses `STERNSYSTEM_ID_REGEX` and `RELEASE_ID_REGEX` (confirmed: it does)
- No schema shape changes needed — the existing schema matches the RFC's contract

**Validation:**

- `pnpm --filter @gogol/ontology build:check`

**Completion criterion:** `packages/ontology/src/operations/notausgang.ts` has updated Compass markup referencing RFC-0380 and `build:check` passes.

**Human review:** no

---

### Step 2. Rewrite export, validate, and types in a single coordinated pass

**Goal:** Replace `NotausgangValidateData`/`NotausgangViolation` types, rewrite `runNotausgangExport` for YAML + `@gogol/fingerprint`, and rewrite `runNotausgangValidate` for deep verification — all in one step to avoid intermediate broken states.

**Agent actions:**

**Types:**

- Add `export type CheckStatus = "valid" | "invalid" | "missing";` to `notausgang-commands.ts`
- Rewrite `NotausgangValidateData` interface: replace paired boolean fields with `CheckStatus` for `manifest`, `site`, `dist`, `bordbuch`, `pin`, `snapshots`, `artifactManifest`; keep boolean fields for `runtimeFilesAbsent`, `*HashMatch`, `liveKeyScan`
- Remove `severity` from `NotausgangViolation` — all violations are errors
- Update type re-exports in `index.ts`

**Export (`runNotausgangExport`):**

- Remove `hashDir` and `hashFile` helper functions (ad hoc `crypto.createHash`)
- Import `fingerprintTree`, `fingerprintFile` from `@gogol/fingerprint/semantic`
- Replace `hashDir(distDir)` with `fingerprintTree(distDir, { mode: "byte" })`
- Replace `hashDir(siteDir)` with `fingerprintTree(siteDir, { mode: "semantic" })`
- Replace `hashFile(bordbuchPath)` with `fingerprintFile(bordbuchPath, { mode: "semantic" })` (`.ndjson` falls through to `text` normalizer)
- Write `notausgang-manifest.yaml` using `yaml.stringify()` instead of `JSON.stringify`
- Write `artifact-manifest.yaml` using `yaml.stringify()` instead of `JSON.stringify`
- Read system pin (`system.pin.json` from the source system), parse it, write as `system.pin.yaml` using `yaml.stringify()`
- Remove all `crypto.createHash` calls and `import { createHash } from "node:crypto"`

**Validate (`runNotausgangValidate`):**

- Import `notausgangManifestSchema` from `@gogol/ontology/operations`
- Import `fingerprintTree`, `fingerprintFile` from `@gogol/fingerprint/semantic`
- Import `parse as parseYaml` from `yaml`
- Read `notausgang-manifest.yaml` — if absent but `notausgang-manifest.json` exists, record `legacy-json-artifact` violation; if neither exists, `manifest: "missing"`
- Parse YAML manifest, validate with `notausgangManifestSchema.safeParse()` — record `manifest-schema-invalid` on failure, `manifest: "invalid"`; on success `manifest: "valid"`
- Re-compute `distHash` via `fingerprintTree(distDir, { mode: "byte" })`, compare against manifest — record `dist-hash-mismatch` on mismatch
- Re-compute `siteHash` via `fingerprintTree(siteDir, { mode: "semantic" })`, compare against manifest — record `site-hash-mismatch` on mismatch
- Re-compute `bordbuchHash` via `fingerprintFile(bordbuchPath, { mode: "semantic" })`, compare against manifest — record `bordbuch-hash-mismatch` on mismatch
- Re-compute `behaviorSnapshotHash` via `fingerprintTree(snapshotsDir, { mode: "semantic" })` — if `behavior-snapshots/` is absent, `snapshots: "missing"` + violation `snapshots-missing`; on mismatch record `snapshot-hash-mismatch`
- Re-compute `artifactManifestHash` via `fingerprintFile(artifactManifestPath, { mode: "byte" })` — if `artifact-manifest.yaml` absent but `.json` exists, record `legacy-json-artifact`; on mismatch record `artifact-hash-mismatch`
- Validate Bordbuch NDJSON line-by-line: parse each line as JSON, check `eventId` non-empty, `type` string, `timestamp` valid ISO 8601, `systemId` matches manifest — record `bordbuch-line-parse` or `bordbuch-field-missing` per malformed line
- Read `system.pin.yaml` — if absent but `system.pin.json` exists, record `legacy-pin-format` violation; otherwise parse YAML and check `systemId` and `platformVersion` match manifest — record `pin-content-mismatch` on mismatch
- Check for legacy `.json` artifacts (`notausgang-manifest.json`, `artifact-manifest.json`) — record `legacy-json-artifact` violations
- Check runtime files absent (existing logic, keep as-is)
- Run refined secret scan (Step 3)
- Build `NotausgangValidateData` with `CheckStatus` enum fields
- Return `exitCode: 1` if any violations recorded

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `grep -r "createHash" packages/os/site-kernel-handoff/src/notausgang/` returns no results

**Completion criterion:** No `crypto.createHash` calls in `notausgang-commands.ts`; export writes `.yaml` artifacts; validate performs all deep verification checks; `NotausgangValidateData` uses `CheckStatus` enum; `NotausgangViolation` has no `severity`; `build:check` passes; no `--strict` flag in command registration.

**Human review:** no

---

### Step 3. Refine secret scanning patterns

**Goal:** Replace broad `/[a-f0-9]{32}/` pattern with context-aware patterns that exclude safe locations.

**Agent actions:**

- Skip files under `bordbuch/` directory (event IDs are hex)
- Skip `*.hash` files and hash fields in manifest YAML
- Skip `system.pin.yaml` (contains platform hash)
- Keep existing patterns for `sk_live_`, `sk_test_`, JWT tokens, Cloudflare API tokens
- Add patterns for `xoxb-` (Slack), `ghp_` (GitHub PAT), `AKIA` (AWS)
- Update the `liveKeyScan` result string accordingly

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`

**Completion criterion:** Secret scanner excludes `bordbuch/`, `*.hash`, `system.pin.yaml`; includes `xoxb-`, `ghp_`, `AKIA` patterns; `build:check` passes.

**Human review:** no

---

### Step 4. Write tests for export and validate

**Goal:** Cover the deep verification contract with integration tests using programmatic fixtures.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/notausgang.test.ts`
- Test approach: call `runNotausgangExport` programmatically to create a valid export package, then call `runNotausgangValidate` on the result. For negative tests, modify the exported package after export (tamper dist, corrupt bordbuch, rename `.yaml` to `.json`, etc.)
- Test `runNotausgangExport`:
  - Writes `notausgang-manifest.yaml` (not `.json`)
  - Writes `system.pin.yaml` (not `.json`)
  - Writes `artifact-manifest.yaml` (not `.json`)
  - Hashes use `sha256:` prefix from `@gogol/fingerprint`
- Test `runNotausgangValidate`:
  - Passes on a valid export package (exit 0, no violations)
  - Fails on hash mismatch (tampered `dist/` file) — `dist-hash-mismatch`
  - Fails on manifest schema violation (corrupted manifest YAML)
  - Fails on Bordbuch line parse error (malformed NDJSON line) — `bordbuch-line-parse`
  - Fails on pin content mismatch (`systemId` mismatch) — `pin-content-mismatch`
  - Fails on legacy `notausgang-manifest.json` — `legacy-json-artifact`
  - Fails on legacy `system.pin.json` — `legacy-pin-format`
  - Fails on missing `behavior-snapshots/` — `snapshots-missing`
  - Fails on secret detected (file with `sk_live_` pattern outside safe locations)
  - `NotausgangValidateData` uses `CheckStatus` enum values (`"valid"`, `"invalid"`, `"missing"`)
  - `NotausgangViolation` has no `severity` field
- Use `tmpdir` for test export packages; clean up after tests

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff test`

**Completion criterion:** All notausgang tests pass; test file covers export YAML output, validate deep verification, hash mismatch, Bordbuch parse, pin mismatch, legacy JSON violation, missing snapshots, secret scan exclusions.

**Human review:** no

---

### Step 5. Update `packages/os/site-kernel-handoff/AGENTS.md`

**Goal:** Document the deepened validation contract and YAML-only artifact format.

**Agent actions:**

- Add a `## Notausgang` section to `packages/os/site-kernel-handoff/AGENTS.md`
- Document:
  - `notausgang.export` writes YAML artifacts (`notausgang-manifest.yaml`, `artifact-manifest.yaml`, `system.pin.yaml`) and uses `@gogol/fingerprint` for all hashing
  - `notausgang.validate` performs deep integrity verification (hash re-computation, manifest schema validation, Bordbuch NDJSON line-by-line, pin content validation, behavior snapshot hash verification, secret scanning)
  - No JSON fallback — legacy `.json` artifacts produce violations
  - All violations are errors — no `--strict` flag, no warning tier
  - `NotausgangValidateData` uses `CheckStatus` enum fields
  - Fingerprint modes: `byte` for `dist/` and `artifact-manifest.yaml`, `semantic` for `site/` and `bordbuch/events.ndjson`
  - Missing `behavior-snapshots/` is a violation

**Validation:**

- Visual review

**Completion criterion:** `packages/os/site-kernel-handoff/AGENTS.md` has a Notausgang section documenting the deepened contract.

**Human review:** no

---

### Step 6. Update `docs/technology.xml`

**Goal:** Reflect the Notausgang manifest format change in the Compass technology map.

**Agent actions:**

- Update the `pkg-kernel-handoff` workspace role to mention Notausgang integrity verification and YAML artifact format
- Add a note about RFC-0380 deepening the Notausgang validate contract

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0380 --json`

**Completion criterion:** `docs/technology.xml` `pkg-kernel-handoff` workspace role mentions Notausgang integrity verification and YAML format.

**Human review:** no

---

### Step 7. Full validation suite

**Goal:** Run all validation commands to confirm the implementation is complete.

**Agent actions:**

- Run `pnpm --filter @gogol/ontology build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff test`
- Run `pnpm exec site-kernel run rfc.validate RFC-0380 --json`
- Run `pnpm exec site-kernel run fingerprint.usage.lint` (DNA-53 compliance — no ad hoc hashing)
- Verify no `crypto.createHash` calls remain: `grep -r "createHash" packages/os/site-kernel-handoff/src/notausgang/`

**Validation:**

- All commands exit 0

**Completion criterion:** All validation commands pass; `fingerprint.usage.lint` passes; no `createHash` calls in notausgang module.

**Human review:** no

---

### Step 8. Transition RFC to implemented and emit verification evidence

**Goal:** Stamp `implemented` status and emit verification evidence per RFC-0330.

**Agent actions:**

- Set `status: implemented` and `implementedAt: 2026-07-12` in RFC-0380 frontmatter
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0380`
- Commit the evidence file alongside the status transition

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0380 --json`

**Completion criterion:** RFC-0380 has `status: implemented`, `implementedAt` set, verification evidence committed.

**Human review:** yes — operator confirms implementation is complete before stamping `implemented`.

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0380 --json`
- `pnpm --filter @gogol/ontology build:check`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec site-kernel run fingerprint.usage.lint` (DNA-53 compliance)
- `grep -r "createHash" packages/os/site-kernel-handoff/src/notausgang/` (must return no results)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0380.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0380` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Performance on large dist trees | Step 2 uses `fingerprintTree` which is already used by the release pipeline and is acceptably fast |
| Secret scan false negatives | Step 3 adds extensible patterns; scan is secondary defense, integration nulling is primary |
| Agent misinterpretation of legacy JSON fallback | Step 5 AGENTS.md update explicitly documents no fallback; Step 2 enforces it with `legacy-json-artifact` violations |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-50, DNA-52, or DNA-53, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0380 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `@gogol/fingerprint` lacks a needed hashing mode for Bordbuch NDJSON or behavior snapshots, do not add ad hoc hashing — extend `@gogol/fingerprint` first or escalate via `rfc.supersede.propose`.
