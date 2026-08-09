---
rfcId: RFC-0656
planId: PLAN-RFC-0656-01
status: draft
owner: architecture
createdAt: 2026-08-02
updatedAt:
scope:
  apps: []
  packages:
    - packages/fingerprint
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - packages/fingerprint/AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0656

## 1. Objectives

- [ ] Objective 1 — `fingerprintTree` supports `mode: "stable"` with normalizers for PDF, source map, and JSON (maps to acceptance criterion: "fingerprintTree supports mode: stable...")
- [ ] Objective 2 — `FingerprintOptions.mode` type is `"byte" | "semantic" | "stable"` with existing modes retained (maps to: "FingerprintOptions.mode type is...")
- [ ] Objective 3 — `dist.determinism.validate` command registered and functional with `--release` and `--mission` flags (maps to: "dist.determinism.validate command registered...")
- [ ] Objective 4 — `release.prepare` and `leitstand.dev-deploy` use `mode: "stable"` for `distTreeHash` computation (maps to: "release.prepare uses mode: stable..." and "leitstand.dev-deploy uses mode: stable...")
- [ ] Objective 5 — Two builds from the same commit produce identical `distTreeHash` in stable mode (maps to: "Two builds from the same commit...")
- [ ] Objective 6 — Unit tests cover each normalizer with pass/fail scenarios (maps to: "Unit tests cover each normalizer...")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/fingerprint/src/types.ts` — extend `FingerprintOptions.mode` to `"byte" | "semantic" | "stable"`
- `packages/fingerprint/src/fingerprint.ts` — add `mode: "stable"` branch in `fingerprintFile`, dispatching to stable normalizers
- `packages/fingerprint/src/normalizers/stable.ts` — new: stable-mode normalizer dispatcher (PDF, source map, JSON timestamp stripping)
- `packages/fingerprint/src/normalizers/pdf.ts` — new: PDF metadata stripping (`/CreationDate`, `/ModDate`, `/ID`)
- `packages/fingerprint/src/normalizers/sourcemap.ts` — new: source map path normalization (relative paths, strip `sourceRoot`)
- `packages/fingerprint/package.json` — add `pdf-lib` dependency
- `packages/os/site-kernel-handoff/src/release/release-commands.ts` — add `runDistDeterminismValidate` handler; change `fingerprintTree` call from `mode: "byte"` to `mode: "stable"` in `runReleasePrepare`
- `packages/os/site-kernel-handoff/src/release/release.module.ts` — register `dist.determinism.validate` command
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — change `fingerprintTree` call from `mode: "byte"` to `mode: "stable"` in `leitstand.dev-deploy`

### 2.2 Configuration and data

- No YAML/JSON/manifest changes. No ontology catalog changes. No `system.md` changes.

### 2.3 Documentation and specs

- `packages/fingerprint/AGENTS.md` — document the third mode (`stable`) in the "Two entry points" table and normalizer behavior list
- `packages/os/site-kernel-handoff/AGENTS.md` — document `dist.determinism.validate` command in the release/leitstand section
- `docs/architecture-dna.md` — no changes (no new DNA invariant; DNA-53, DNA-48, DNA-49 are satisfied, not established)
- `docs/*.xml` Compass files — no structural changes (no new package, no new pipeline topology)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/fingerprint run build:check` — TypeScript type-check
- `pnpm --filter @warpgogol/fingerprint run test` — unit tests for normalizers
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — TypeScript type-check
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — unit tests for dist.determinism.validate handler
- `pnpm exec werkstatt run rfc.validate --id RFC-0656` — RFC validation
- No new pipeline validator in this phase (build.check integration is deferred per RFC rollout)

## 3. Step sequence

### Step 1. Extend FingerprintOptions type and add stable normalizer infrastructure

**Goal:** Add `mode: "stable"` to the type system and create the stable normalizer dispatcher.

**Agent actions:**

- Edit `packages/fingerprint/src/types.ts`: change `FingerprintOptions.mode` from `"byte" | "semantic"` to `"byte" | "semantic" | "stable"`. Update `FingerprintFileResult.mode` and `FingerprintResult.mode` similarly.
- Create `packages/fingerprint/src/normalizers/stable.ts`: a dispatcher that selects the correct stable normalizer based on file extension (`.pdf` → PDF, `.js.map`/`.mjs.map` → source map, `.json` → JSON timestamp stripping). For unhandled extensions, return `null` (caller falls back to byte hash).
- Create `packages/fingerprint/src/normalizers/pdf.ts`: strip `/CreationDate`, `/ModDate`, `/ID` from PDF metadata using `pdf-lib`. Accept `Uint8Array`, return `Uint8Array` (normalized bytes).
- Create `packages/fingerprint/src/normalizers/sourcemap.ts`: parse source map JSON, normalize `sources` paths to be relative to the dist root, strip `sourceRoot` field, re-serialize with sorted keys. Accept `string` (file content), return `string` (normalized content).
- Create `packages/fingerprint/src/normalizers/json-stable.ts`: parse JSON, remove `createdAt`/`buildTimestamp`/`generatedAt` keys recursively, re-serialize with sorted keys via `stableStringify`. Accept `string`, return `string`.
- Add `pdf-lib` to `packages/fingerprint/package.json` dependencies.

**Validation:**

- `pnpm --filter @warpgogol/fingerprint run build:check` — type-check passes with new types and modules.

**Completion criterion:** `FingerprintOptions.mode` includes `"stable"`; stable normalizer modules exist and type-check; `pdf-lib` is in dependencies.

**Human review:** no

---

### Step 2. Wire stable mode into fingerprintFile and fingerprintTree

**Goal:** Make `fingerprintTree` with `mode: "stable"` use the stable normalizers for known file types and byte hashing for all others.

**Agent actions:**

- Edit `packages/fingerprint/src/fingerprint.ts`: in `fingerprintFile`, add a `mode: "stable"` branch. For stable mode:
  - Check if the file extension has a stable normalizer (PDF, source map, JSON).
  - If yes: read bytes, run the stable normalizer, hash the normalized bytes with `byteHash`.
  - If no: fall back to raw `byteHash` (same as `mode: "byte"`).
  - On normalizer failure: fall back to byte hash, emit warning (same pattern as semantic mode).
- In `fingerprintTree`: the `mode: "stable"` case flows through `fingerprintFile` — no separate logic needed in `fingerprintTree` itself.
- Update `FingerprintFileResult` for stable mode: `mode: "stable"`, `normalizer: "pdf" | "sourcemap" | "json-stable" | "binary"`.

**Validation:**

- `pnpm --filter @warpgogol/fingerprint run build:check` — type-check passes.
- `pnpm --filter @warpgogol/fingerprint run test` — existing tests still pass (byte and semantic modes unchanged).

**Completion criterion:** `fingerprintTree(dir, { mode: "stable" })` produces a hash; known non-deterministic file types are normalized; unknown types use byte hashing.

**Human review:** no

---

### Step 3. Implement dist.determinism.validate command

**Goal:** Create the `dist.determinism.validate` command handler and register it in the release module.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/release/release-commands.ts`: add `runDistDeterminismValidate` handler.
  - Accept `--release` or `--mission` flag (exactly one required).
  - For `--release`: resolve dist path from `releases/{release}/dist/`.
  - For `--mission`: resolve dist path from `missions/{mission}/workpiece/dist/` if exists, else `missions/{mission}/distribution/dist/`.
  - If dist directory is empty or missing: exit 1 with error message.
  - Compute `stableHash` via `fingerprintTree(distPath, { mode: "stable" })`.
  - Compute `byteHash` via `fingerprintTree(distPath, { mode: "byte" })`.
  - Per-file comparison: for each file, compute both byte hash and stable hash. Files where the two differ are listed in `nonDeterministicFiles[]` with a reason derived from the normalizer that was applied (e.g., "PDF /CreationDate stripped", "Source map sources normalized", "JSON timestamp fields removed").
  - Return `DistDeterminismValidateData` with `hashesMatch` boolean.
  - Exit 0 if `hashesMatch` is true; exit 1 if false.
- In `packages/os/site-kernel-handoff/src/release/release.module.ts`: register `dist.determinism.validate` command with `--release` and `--mission` flags, `scope: "workspace"`, `mutatesState: false`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — type-check passes.
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — existing tests still pass.

**Completion criterion:** `dist.determinism.validate` command is registered, type-checks, and resolves dist paths correctly for both `--release` and `--mission` flags.

**Human review:** no

---

### Step 4. Switch release.prepare and leitstand.dev-deploy to stable mode

**Goal:** Change the `fingerprintTree` calls in `release.prepare` and `leitstand.dev-deploy` from `mode: "byte"` to `mode: "stable"`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/release/release-commands.ts` (`runReleasePrepare`): change `fingerprintTree(distDest, { mode: "byte" })` to `fingerprintTree(distDest, { mode: "stable" })` at line 411.
- In `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` (`leitstand.dev-deploy`): change `fingerprintTree(distPath, { mode: "byte" })` to `fingerprintTree(distPath, { mode: "stable" })` at line 675.
- Update the RFC-0634 test file `packages/os/site-kernel-handoff/src/tests/rfc-0634-dev-deploy-build-identity.test.ts`: the existing tests use `mode: "byte"` directly — these tests verify build-identity.json exclusion behavior and should continue to use `mode: "byte"` (they test the exclusion mechanism, not the hashing mode). No change needed unless tests assert on the mode used by the command handlers.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — type-check passes.
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — existing tests pass.

**Completion criterion:** Both `release.prepare` and `leitstand.dev-deploy` use `mode: "stable"` for `fingerprintTree` calls; existing tests pass.

**Human review:** no

---

### Step 5. Write unit tests for stable normalizers

**Goal:** Cover each stable normalizer (PDF, source map, JSON) with pass/fail scenarios.

**Agent actions:**

- Create `packages/fingerprint/src/tests/stable-normalizers.test.ts`:
  - **PDF normalizer**: create a minimal PDF with `/CreationDate` and `/ID`, normalize it, verify the normalized bytes are identical across two runs with different timestamps. Verify content is preserved.
  - **Source map normalizer**: create a source map with absolute paths in `sources[]` and a `sourceRoot` field, normalize it, verify paths are relative and `sourceRoot` is stripped. Verify two source maps with different absolute paths but same relative paths produce the same hash.
  - **JSON stable normalizer**: create JSON with `createdAt` and `buildTimestamp` fields, normalize it, verify timestamp fields are removed and keys are sorted. Verify two JSONs with different timestamps but same content produce the same hash.
  - **fingerprintTree stable mode**: create a temp directory with a PDF, a source map, a JSON with timestamps, and a plain text file. Hash twice — verify identical `distTreeHash`. Verify the plain text file contributes byte-level changes (modify content → hash changes).
  - **Empty directory edge case**: `fingerprintTree` on an empty directory produces a deterministic hash (hash of empty input).
  - **Fallback**: a corrupt PDF falls back to byte hash with a warning in `FingerprintResult.warnings[]`.
- Create test fixtures as needed in `packages/fingerprint/src/tests/fixtures/`.

**Validation:**

- `pnpm --filter @warpgogol/fingerprint run test` — all new tests pass.

**Completion criterion:** Each normalizer has pass/fail tests; `fingerprintTree` stable mode determinism test passes; fallback test passes.

**Human review:** no

---

### Step 6. Write unit test for dist.determinism.validate handler

**Goal:** Cover the `dist.determinism.validate` command handler.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/dist-determinism-validate.test.ts`:
  - **--release flag**: create a temp release directory with a dist containing a PDF with timestamps and a plain HTML file. Run `runDistDeterminismValidate` with `--release`. Verify `nonDeterministicFiles` lists the PDF, `hashesMatch` is false, exit code is 1.
  - **--mission flag (workpiece)**: create a temp mission directory with `workpiece/dist/`. Run with `--mission`. Verify it reads from `workpiece/dist/`.
  - **--mission flag (distribution fallback)**: create a temp mission directory with `distribution/dist/` but no `workpiece/dist/`. Run with `--mission`. Verify it reads from `distribution/dist/`.
  - **All deterministic**: create a dist with only plain HTML files. Verify `hashesMatch` is true, exit code is 0.
  - **Empty dist**: create an empty dist directory. Verify exit code is 1 with error message.
  - **Missing dist**: point to a non-existent path. Verify exit code is 1 with error message.
- Mock `fingerprintTree` if needed to avoid real file I/O complexity, but prefer using real temp directories with fixture files for integration coverage.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` — all new tests pass.

**Completion criterion:** `dist.determinism.validate` handler tests cover all flag combinations, edge cases, and exit codes.

**Human review:** no

---

### Step 7. Update documentation

**Goal:** Synchronize `AGENTS.md` files with the new mode and command.

**Agent actions:**

- Update `packages/fingerprint/AGENTS.md`:
  - Add `mode: "stable"` to the normalizer behavior list.
  - Document the three modes: `byte` (raw), `semantic` (AST-based), `stable` (byte + targeted normalization).
  - Document the new normalizer files (`stable.ts`, `pdf.ts`, `sourcemap.ts`, `json-stable.ts`).
  - Note `pdf-lib` as a new dependency.
- Update `packages/os/site-kernel-handoff/AGENTS.md`:
  - Document `dist.determinism.validate` command in the release section.
  - Note that `release.prepare` and `leitstand.dev-deploy` now use `mode: "stable"` for `distTreeHash`.

**Validation:**

- `git diff` shows only the intended AGENTS.md files changed.
- No Compass XML updates needed (no structural change).

**Completion criterion:** Both `AGENTS.md` files reflect the new mode, command, and dependency.

**Human review:** no

---

### Step 8. Run full validation suite

**Goal:** Verify all acceptance criteria pass before stamping.

**Agent actions:**

- Run `pnpm --filter @warpgogol/fingerprint run build:check`
- Run `pnpm --filter @warpgogol/fingerprint run test`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0656`
- Verify acceptance criteria checkboxes can be marked `[x]`:
  - `fingerprintTree` supports `mode: "stable"` — verified by tests in Step 5.
  - `FingerprintOptions.mode` type is `"byte" | "semantic" | "stable"` — verified by type-check.
  - `dist.determinism.validate` registered in `release.module.ts` — verified by type-check and test in Step 6.
  - `dist.determinism.validate --mission` reads `workpiece/dist/` or falls back — verified by test in Step 6.
  - `dist.determinism.validate` reports non-deterministic files — verified by test in Step 6.
  - `dist.determinism.validate` exits 1 on empty/missing dist — verified by test in Step 6.
  - `release.prepare` uses `mode: "stable"` — verified by code change in Step 4.
  - `leitstand.dev-deploy` uses `mode: "stable"` — verified by code change in Step 4.
  - Two builds produce identical `distTreeHash` — verified by `fingerprintTree` stable mode determinism test in Step 5.
  - Unit tests cover each normalizer — verified by tests in Step 5.
  - `pdf-lib` added to `package.json` — verified by dependency addition in Step 1.
  - `rfc.validate` passes — verified in this step.

**Validation:**

- All commands exit 0.
- All acceptance criteria checkboxes are checkable.

**Completion criterion:** All validation commands pass; all acceptance criteria can be marked `[x]` with evidence references.

**Human review:** no

---

### Step 9. Run code review and fix

**Goal:** Run `fo-review` on all session code changes and fix any findings.

**Agent actions:**

- Invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`).
- Wait for the review report in `docs/reviews/code/`.
- If findings are reported, invoke `fo-fix` via the `skill` tool.
- Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.

**Validation:**

- Review report exists in `docs/reviews/code/` for this session.
- All findings are resolved (or no findings were reported).

**Completion criterion:** Code review passed; findings fixed if any.

**Human review:** no

---

### Step 10. Stamp RFC as implemented

**Goal:** Transition RFC-0656 from `accepted` to `implemented`.

**Agent actions:**

- Mark all acceptance criteria checkboxes as `[x]` in the RFC file with inline `(evidence: ...)` annotations.
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0656 --implementation-commit <sha>` to atomically transition `accepted → implemented`.
- Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields — use the command.

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0656` — passes with `implemented` status.
- `git status` — no uncommitted changes from the current session.

**Completion criterion:** RFC-0656 is stamped as `implemented` via `rfc.implement.stamp`; all acceptance criteria are checked off with evidence.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0656`
- `pnpm --filter @warpgogol/fingerprint run build:check`
- `pnpm --filter @warpgogol/fingerprint run test`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0656` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review` (Step 9)
- No `rfc.verification.emit` needed — RFC-0656 has no acceptance probes declared

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Normalizer correctness — buggy PDF normalizer strips meaningful content | Step 5: PDF normalizer test verifies content is preserved; only metadata fields are stripped |
| Performance — normalization adds ~1-2s for large dist directories | Step 5: `fingerprintTree` stable mode test uses a multi-file directory; acceptable for release.prepare which runs once |
| False negatives — uncovered non-deterministic file types | Step 3: `dist.determinism.validate` makes them visible; Step 6: test verifies reporting |
| Hash migration — cross-mode mismatch during transition | Step 4: both callers switch simultaneously; RFC documents transition sequence (re-deploy dev with same release) |
| pdf-lib dependency weight (~2MB) | Step 1: dependency is proportionate for PDF metadata parsing; RFC allows lighter alternative if found during implementation |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-53 (fingerprint governance), DNA-48 (release discipline), or DNA-49 (fleet propagation), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0656 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `pdf-lib` cannot parse certain PDF variants (encrypted, linearized), document the limitation in `packages/fingerprint/AGENTS.md` and add a fallback to byte hashing with a warning — do not suppress the error silently.
