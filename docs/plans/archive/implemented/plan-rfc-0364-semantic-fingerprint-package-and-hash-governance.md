---
rfcId: RFC-0364
planId: PLAN-RFC-0364-01
status: draft
owner: architecture
createdAt: 2026-07-09
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/fingerprint"
    - "@gogol/site-kernel"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
    - "@gogol/site-kernel-integrity"
    - "@gogol/check-core"
    - "@gogol/check-runner-node"
    - "@gogol/ontology"
  note: "RFC-0364 packagesImpacted should be updated during implementation to include @gogol/check-core and @gogol/check-runner-node (not listed in the RFC frontmatter)."
  services: []
  docs:
    - docs/technology.xml
    - docs/development-plan.xml
    - docs/architecture-dna.md
    - packages/AGENTS.md
    - AGENTS.md
---

# Implementation Plan: RFC-0364

> **Pilot plan** — RFC-0364 has `status: draft`. Implementation requires explicit architecture acceptance (`draft → accepted`) before any code changes begin (RFC-0224).

## 1. Objectives

- [ ] Objective 1 — `@gogol/fingerprint` package exists and exports the public API (maps to acceptance criterion: "`@gogol/fingerprint` package exists and exports the API in this RFC")
- [ ] Objective 2 — Parser dependencies declared and normalizers implemented for all supported file types (maps to: "Parser dependencies are declared in `packages/fingerprint/package.json`")
- [ ] Objective 3 — Three commands registered and functional (maps to: "`fingerprint.calculate`, `fingerprint.usage.lint`, and `fingerprint.fixtures.validate` are registered")
- [ ] Objective 4 — Fixture suite covers all supported file types (maps to: "Fixture suite covers TypeScript, Astro, CSS, JSON, JSONC, YAML, Markdown, MDX, binary files")
- [ ] Objective 5 — `platformSemanticHash` replaces `packagesHash` in schema and writers (maps to: "Platform pin writers use `platformSemanticHash`")
- [ ] Objective 6 — Existing hash helpers migrated and deleted (maps to: "New Sternsystem/release/notausgang hashes are produced by `@gogol/fingerprint`")
- [ ] Objective 7 — `rfc.validate` passes (maps to: "`rfc.validate` passes on this file")

## 2. Affected artifacts

### 2.1 Code and commands

**New package:**

- `packages/fingerprint/package.json` — workspace package with parser dependencies
- `packages/fingerprint/tsconfig.json` — extends `tsconfig/node-lib.json`
- `packages/fingerprint/src/index.ts` — public API exports
- `packages/fingerprint/src/normalizers/typescript.ts` — `@typescript-eslint/typescript-estree` normalizer
- `packages/fingerprint/src/normalizers/astro.ts` — `@astrojs/compiler` + frontmatter normalization
- `packages/fingerprint/src/normalizers/css.ts` — `postcss` normalizer
- `packages/fingerprint/src/normalizers/json.ts` — JSON parse + stable stringify
- `packages/fingerprint/src/normalizers/jsonc.ts` — `jsonc-parser` normalizer
- `packages/fingerprint/src/normalizers/yaml.ts` — `yaml` normalizer
- `packages/fingerprint/src/normalizers/markdown.ts` — `unified` + `remark-parse` + `remark-frontmatter` + `remark-mdx`
- `packages/fingerprint/src/normalizers/text.ts` — fallback normalized text hash
- `packages/fingerprint/src/normalizers/binary.ts` — byte hash
- `packages/fingerprint/src/normalizers/index.ts` — dispatcher: file extension → normalizer
- `packages/fingerprint/src/fingerprint.ts` — `fingerprintFile`, `fingerprintTree`, `stableJsonHash`, `byteHash`
- `packages/fingerprint/src/types.ts` — `FingerprintOptions`, `FingerprintResult`
- `packages/fingerprint/src/tests/fixtures/` — paired fixture files
- `packages/fingerprint/src/tests/fixtures.test.ts` — fixture validation tests
- `packages/fingerprint/allowlist.json` — usage-lint allowlist with `{ file, reason }` entries

**New command table:**

- `packages/os/site-kernel-checks/src/command-tables/37-fingerprint.ts` — `FINGERPRINT_COMMANDS` array with three command entries
- `packages/os/site-kernel-checks/src/command-tables/index.ts` — add import and spread `FINGERPRINT_COMMANDS`
- `packages/os/site-kernel-checks/src/fingerprint-calculate.ts` — handler for `fingerprint.calculate`
- `packages/os/site-kernel-checks/src/fingerprint-usage-lint.ts` — handler for `fingerprint.usage.lint`
- `packages/os/site-kernel-checks/src/fingerprint-fixtures-validate.ts` — handler for `fingerprint.fixtures.validate`

**Pipeline wiring:**

- `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` — add `fingerprint.usage.lint` and `fingerprint.fixtures.validate` steps

**Schema changes:**

- `packages/ontology/src/schemas/handoff.ts` — `handoffEcosystemSchema`: add `platformSemanticHash` field, deprecate `packagesHash` (dual-read during migration, removed in step 7)

**Migration — delete old hash helpers:**

- `packages/os/site-kernel-integrity/src/hash.ts` — delete; update all call sites in `move-detection.ts`, `run-update.ts`, `verify.ts`, `signing.ts`, `run-init.ts`, `build.ts` to import from `@gogol/fingerprint`
- `packages/check-core/src/hash.ts` — delete; update `evidence.ts` to import from `@gogol/fingerprint`
- `packages/os/site-kernel-handoff/src/bundle-io.ts` — delete `sha256OfBytes` and `hashFile`; update to import `byteHash` from `@gogol/fingerprint`; update `resolvePackagesHash` to use `byteHash` from the package
- `packages/os/site-kernel-checks/src/surface/shared.ts` — delete local `sha256Hex`; import `stableJsonHash` / `byteHash` from `@gogol/fingerprint`
- `packages/os/site-kernel/src/rfc/verification-evidence.ts` — delete local `sha256Hex`; import from `@gogol/fingerprint`
- `packages/check-runner-node/src/index.ts` — update `sha256Hex` import from `@gogol/check-core` to `@gogol/fingerprint`

**Package dependency updates:**

- `packages/os/site-kernel-integrity/package.json` — add `@gogol/fingerprint: workspace:*`
- `packages/check-core/package.json` — add `@gogol/fingerprint: workspace:*`
- `packages/os/site-kernel-handoff/package.json` — add `@gogol/fingerprint: workspace:*`
- `packages/os/site-kernel-checks/package.json` — add `@gogol/fingerprint: workspace:*`
- `packages/os/site-kernel/package.json` — add `@gogol/fingerprint: workspace:*`
- `packages/check-runner-node/package.json` — add `@gogol/fingerprint: workspace:*`

### 2.2 Configuration and data

- `packages/fingerprint/allowlist.json` — initial allowlist for legitimate byte-hash call sites (passport signing, Stripe webhook verification, Bordbuch hash chaining, behavior snapshots, AI cache)
- `pnpm-workspace.yaml` — no change needed (`packages/*` already covers the new package)

### 2.3 Documentation and specs

- `packages/AGENTS.md` — add `@gogol/fingerprint` row to ownership table (§ "Ownership boundaries")
- `docs/technology.xml` — register `@gogol/fingerprint` package and its parser dependencies
- `docs/development-plan.xml` — reference staged migration and pipeline placement
- `AGENTS.md` (root) — reference `@gogol/fingerprint` as the sole hash API in the shared helpers catalog
- `docs/architecture-dna.md` — no change (DNA-53 already established by RFC-0364)

### 2.4 Validation and pipelines

- `PACKAGES_CHECK_PIPELINE` — gains `fingerprint.usage.lint` (warning mode initially) and `fingerprint.fixtures.validate`
- `pnpm --filter @gogol/fingerprint run build:check` — TypeScript compilation
- `pnpm exec werkstatt run rfc.validate RFC-0364 --json` — RFC validation
- `pnpm exec werkstatt run packages-check.run --json` — workspace package validation (includes new fingerprint commands)

## 3. Step sequence

### Step 1. Create `@gogol/fingerprint` package scaffold

**Goal:** Create the workspace package with `package.json`, `tsconfig.json`, and empty source files.

**Agent actions:**

- Create `packages/fingerprint/package.json` with `name: "@gogol/fingerprint"`, `private: true`, `type: "module"`, `exports` mapping `.` → `./src/index.ts`, parser dependencies (`@typescript-eslint/typescript-estree`, `@astrojs/compiler`, `postcss`, `jsonc-parser`, `yaml`, `unified`, `remark-parse`, `remark-frontmatter`, `remark-mdx`), `@gogol/share: workspace:*` dependency, and `build:check` script
- Create `packages/fingerprint/tsconfig.json` extending `tsconfig/node-lib.json`
- Create empty `packages/fingerprint/src/index.ts`, `src/types.ts`, `src/fingerprint.ts`, `src/normalizers/index.ts`
- Run `pnpm install` to link the new workspace package

**Validation:**

- `pnpm --filter @gogol/fingerprint run build:check` passes (empty package compiles)
- `pnpm exec werkstatt run workspace.discovery.validate --json` passes (new package discovered)

**Completion criterion:** `packages/fingerprint/` exists, `pnpm install` succeeds, `build:check` passes with zero errors.

**Human review:** No

---

### Step 2. Implement types and public API

**Goal:** Implement `FingerprintOptions`, `FingerprintResult`, and the four exported functions.

**Agent actions:**

- Define `FingerprintOptions` and `FingerprintResult` interfaces in `src/types.ts` per RFC §2
- Implement `byteHash(bytes: Uint8Array | string): string` in `src/fingerprint.ts` — wraps `createHash("sha256")`, returns `sha256:<hex>`
- Implement `stableStringify(value: unknown): string` — sort object keys recursively, produce stable JSON string (used for file writing and as input to `stableJsonHash`)
- Implement `stableJsonHash(value: unknown): string` — `byteHash(stableStringify(value))`
- Implement `fingerprintFile(path, options)` — dispatch to normalizer by file extension, return single-file result
- Implement `fingerprintTree(root, options)` — walk directory, sort entries by normalized path, hash each file, combine into tree hash
- Export all from `src/index.ts` (public API: `byteHash`, `stableStringify`, `stableJsonHash`, `fingerprintFile`, `fingerprintTree`, `FingerprintOptions`, `FingerprintResult`)

**Validation:**

- `pnpm --filter @gogol/fingerprint run build:check` passes
- Manual smoke test: `node -e "import('./packages/fingerprint/src/index.ts').then(m => console.log(m.byteHash('test')))"` returns `sha256:<hex>`

**Completion criterion:** All four functions exported, TypeScript compiles, `byteHash` and `stableJsonHash` produce deterministic `sha256:`-prefixed output.

**Human review:** No

---

### Step 3. Implement normalizers

**Goal:** Implement all file-type normalizers per RFC §1 and §3.

**Agent actions:**

- `src/normalizers/typescript.ts` — parse with `@typescript-eslint/typescript-estree`, serialize AST without comments, location metadata, or formatting whitespace; preserve array/expression order
- `src/normalizers/astro.ts` — parse with `@astrojs/compiler`, normalize frontmatter as TypeScript, normalize template HTML structure (ignore whitespace between tags), preserve attribute order and expression order
- `src/normalizers/css.ts` — parse with `postcss`, serialize normalized AST without comments, preserve declaration order
- `src/normalizers/json.ts` — parse JSON, stable stringify (sorted keys, no trailing whitespace)
- `src/normalizers/jsonc.ts` — parse with `jsonc-parser`, strip comments, stable stringify
- `src/normalizers/yaml.ts` — parse with `yaml`, re-serialize in stable form (sorted keys unless order-preserving)
- `src/normalizers/markdown.ts` — parse with `unified` + `remark-parse` + `remark-frontmatter` + `remark-mdx`, strip HTML comments outside code fences, normalize whitespace, preserve block order and fenced code content
- `src/normalizers/text.ts` — normalize line endings to `\n`, hash normalized text
- `src/normalizers/binary.ts` — hash raw bytes
- `src/normalizers/index.ts` — dispatcher: map file extension → normalizer, fallback to `text.ts` for unknown text types, `binary.ts` for binary types

**Validation:**

- `pnpm --filter @gogol/fingerprint run build:check` passes
- Each normalizer produces deterministic output for identical content with different formatting

**Completion criterion:** All 9 normalizers implemented, dispatcher resolves file extensions correctly, TypeScript compiles.

**Human review:** No

---

### Step 4. Create fixture suite

**Goal:** Create paired fixture files and a test runner that validates normalization invariants.

**Agent actions:**

- Create fixture pairs in `src/tests/fixtures/`:
  - `ts-comment-only.before.ts` / `ts-comment-only.after.ts` — same semantic hash (comment-only diff)
  - `ts-formatting-only.before.ts` / `ts-formatting-only.after.ts` — same semantic hash (whitespace diff)
  - `ts-meaningful-change.before.ts` / `ts-meaningful-change.after.ts` — different semantic hash (AST change)
  - `json-key-order.before.json` / `json-key-order.after.json` — same semantic hash (key order diff)
  - `json-value-change.before.json` / `json-value-change.after.json` — different semantic hash
  - `jsonc-comment-only.before.jsonc` / `jsonc-comment-only.after.jsonc` — same semantic hash
  - `yaml-key-order.before.yaml` / `yaml-key-order.after.yaml` — same semantic hash
  - `md-trailing-whitespace.before.md` / `md-trailing-whitespace.after.md` — same semantic hash
  - `md-html-comment.before.md` / `md-html-comment.after.md` — same semantic hash
  - `md-fenced-code-change.before.md` / `md-fenced-code-change.after.md` — different semantic hash
  - `css-comment-only.before.css` / `css-comment-only.after.css` — same semantic hash
  - `astro-formatting-only.before.astro` / `astro-formatting-only.after.astro` — same semantic hash
  - `binary-change.before.bin` / `binary-change.after.bin` — different byte hash
- Create `src/tests/fixtures.test.ts` — iterate fixture pairs, assert same/different hash per RFC §5.3 rules
- Create `src/tests/tree.test.ts` — test `fingerprintTree` on a small directory, verify sorted entries and combined hash

**Validation:**

- `pnpm --filter @gogol/fingerprint run test` passes (all fixture pairs validate)
- `pnpm --filter @gogol/fingerprint run build:check` passes

**Completion criterion:** All fixture pairs pass, covering TypeScript, Astro, CSS, JSON, JSONC, YAML, Markdown, MDX, and binary files.

**Human review:** No

---

### Step 5. Register commands

**Goal:** Implement and register the three Site OS commands.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/fingerprint-calculate.ts` — handler that reads `--path` and `--mode` flags, calls `fingerprintFile` or `fingerprintTree`, returns `FingerprintResult` in `data`
- Create `packages/os/site-kernel-checks/src/fingerprint-usage-lint.ts` — handler that scans `packages/**` for `createHash` imports and helper names matching `sha256`, `hashTree`, `packagesHash`, `contentHash`; reads `packages/fingerprint/allowlist.json`; `--mode warning` emits diagnostics with exit 0, `--mode fail` exits 1 on violations
- Create `packages/os/site-kernel-checks/src/fingerprint-fixtures-validate.ts` — handler that runs the fixture suite and returns `{ violations, count }`
- Create `packages/os/site-kernel-checks/src/command-tables/37-fingerprint.ts` — `FINGERPRINT_COMMANDS` array with three `CheckCommandEntry` objects (name, description, scope: "workspace", flags, execute)
- Update `packages/os/site-kernel-checks/src/command-tables/index.ts` — import and spread `FINGERPRINT_COMMANDS`
- Add `@gogol/fingerprint: workspace:*` to `packages/os/site-kernel-checks/package.json` dependencies

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- `pnpm exec werkstatt run fingerprint.calculate --path packages/fingerprint/src/index.ts --mode semantic --json` returns a `FingerprintResult`
- `pnpm exec werkstatt run fingerprint.fixtures.validate --json` passes
- `pnpm exec werkstatt run fingerprint.usage.lint --mode warning --json` returns diagnostics (existing hash calls are violations during migration)

**Completion criterion:** All three commands registered, callable via `site-kernel run`, and return correct `--json` envelopes.

**Human review:** No

---

### Step 6. Wire pipeline placement

**Goal:** Add `fingerprint.usage.lint` and `fingerprint.fixtures.validate` to `PACKAGES_CHECK_PIPELINE`.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` — add `{ command: "fingerprint.usage.lint" }` (warning mode initially) and `{ command: "fingerprint.fixtures.validate" }` after `json.generated.marker.validate` (end of pipeline)
- Add RFC-0364 comment annotation to the pipeline file

**Validation:**

- `pnpm exec werkstatt run packages-check.run --json` passes (new steps run in warning mode)
- `pnpm --filter @gogol/site-kernel-checks run build:check` passes

**Completion criterion:** `PACKAGES_CHECK_PIPELINE` includes both new steps; `packages-check.run` passes with zero failures (warnings allowed for existing hash calls).

**Human review:** No

---

### Step 7. Add `platformSemanticHash` to schema

**Goal:** Update `handoffEcosystemSchema` to accept `platformSemanticHash` alongside `packagesHash` (dual-read).

**Agent actions:**

- Edit `packages/ontology/src/schemas/handoff.ts`:
  - Add `platformSemanticHash: z.string().regex(sha256Re).optional()` to `handoffEcosystemSchema`
  - Keep `packagesHash: z.string().regex(sha256Re).optional()` (dual-read during migration)
  - Add JSDoc comment: "Semantic hash from `@gogol/fingerprint`. Replaces `packagesHash`."
- Update `packages/os/site-kernel-handoff/src/handoff-pack.ts` — write `platformSemanticHash` using `fingerprintTree` from `@gogol/fingerprint` on `packages/**` with `mode: "semantic"`, computed from the **working tree** (files on disk, not git committed state); continue writing `packagesHash` for dual-read compatibility. This replaces the current `resolvePackagesHash` (which uses `git rev-parse HEAD:packages`) with a semantic hash that sees uncommitted changes and ignores formatting-only edits.
- Update `packages/os/site-kernel-handoff/src/bundle-io.ts` — replace `resolvePackagesHash` with `resolvePlatformSemanticHash` that calls `fingerprintTree` from `@gogol/fingerprint`; keep `packagesHash` writer as a thin wrapper that calls `resolvePlatformSemanticHash` for dual-read compatibility
- Update `packages/os/site-kernel-handoff/src/version-compare.ts` — compare `platformSemanticHash` when present, fall back to `packagesHash` for legacy bundles
- Update `packages/os/site-kernel-handoff/src/absorb-report.ts` — pass `platformSemanticHash` through `buildCatchupReport`
- Add `@gogol/fingerprint: workspace:*` to `packages/os/site-kernel-handoff/package.json` dependencies

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff run test` passes (version-compare tests updated)

**Completion criterion:** Schema accepts `platformSemanticHash`, handoff-pack writes it, version-compare uses it when present.

**Human review:** No

---

### Step 8. Migrate existing hash helpers

**Goal:** Delete `site-kernel-integrity/src/hash.ts` and `check-core/src/hash.ts`; update all call sites to import from `@gogol/fingerprint`.

**Agent actions:**

- Delete `packages/os/site-kernel-integrity/src/hash.ts`
- Update `packages/os/site-kernel-integrity/src/move-detection.ts` — import `byteHash` from `@gogol/fingerprint`; replace `sha256FileHex` with `fingerprintFile(path, { mode: "byte" })`
- Update `packages/os/site-kernel-integrity/src/run-update.ts` — same pattern
- Update `packages/os/site-kernel-integrity/src/verify.ts` — same pattern
- Update `packages/os/site-kernel-integrity/src/signing.ts` — import `byteHash` and `stableStringify` from `@gogol/fingerprint`; replace `sha256StringHex` with `byteHash`; replace `stableStringify` from `./json.ts` with `stableStringify` from `@gogol/fingerprint`
- Update `packages/os/site-kernel-integrity/src/json.ts` — delete local `stableStringify` and `sortValue` implementations; import `stableStringify` from `@gogol/fingerprint` and re-export it (so existing imports from `./json.ts` still work during transition)
- Update `packages/os/site-kernel-integrity/src/run-init.ts` — same pattern
- Update `packages/os/site-kernel-integrity/src/build.ts` — same pattern
- Delete `packages/check-core/src/hash.ts`
- Update `packages/check-core/src/evidence.ts` — import `sha256Hex` / `stableStringify` from `@gogol/fingerprint` (or equivalent: `byteHash` / `stableJsonHash`)
- Update `packages/check-runner-node/src/index.ts` — update import chain
- Update `packages/os/site-kernel-handoff/src/bundle-io.ts` — delete `sha256OfBytes` and `hashFile`; import `byteHash` from `@gogol/fingerprint`; update `hashFile` call sites in `validation-pack.ts` and `derived-edits.ts` to use `byteHash(await fs.readFile(path))` from `@gogol/fingerprint`
- Update `packages/os/site-kernel-checks/src/surface/shared.ts` — delete local `sha256Hex`; import from `@gogol/fingerprint`
- Update `packages/os/site-kernel/src/rfc/verification-evidence.ts` — delete local `sha256Hex`; import from `@gogol/fingerprint`
- Add `@gogol/fingerprint: workspace:*` to all affected `package.json` files

**Validation:**

- `pnpm --filter @gogol/site-kernel-integrity run build:check` passes
- `pnpm --filter @gogol/check-core run build:check` passes
- `pnpm --filter @gogol/check-runner-node run build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- `pnpm --filter @gogol/site-kernel run build:check` passes
- `pnpm exec werkstatt run fingerprint.usage.lint --mode warning --json` — violations reduced (migrated call sites no longer flagged)

**Completion criterion:** `hash.ts` files deleted, all call sites import from `@gogol/fingerprint`, all affected packages compile, `fingerprint.usage.lint` shows reduced violations.

**Human review:** No

---

### Step 9. Create initial allowlist

**Goal:** Populate `packages/fingerprint/allowlist.json` with legitimate byte-hash call sites.

**Agent actions:**

- Run `pnpm exec werkstatt run fingerprint.usage.lint --mode warning --json` to identify remaining violations after migration
- For each remaining violation, determine if it is a legitimate byte-hash use (HMAC, signature, external protocol, artifact integrity)
- Add entries to `packages/fingerprint/allowlist.json` with `{ "file": "<glob>", "reason": "<why byte hashing is required>" }`
- Re-run `fingerprint.usage.lint --mode warning` to verify allowlisted entries are suppressed

**Validation:**

- `pnpm exec werkstatt run fingerprint.usage.lint --mode warning --json` — only allowlisted entries remain, all with reasons

**Completion criterion:** Allowlist covers all legitimate byte-hash uses with documented reasons; unallowlisted violations are zero.

**Human review:** No

---

### Step 10. Update documentation

**Goal:** Synchronize `AGENTS.md`, Compass XML, and ownership tables.

**Agent actions:**

- Edit `packages/AGENTS.md` ownership table — add row: `| fingerprint | Semantic and byte fingerprint package (RFC-0364). Deterministic normalized hashes for TypeScript, Astro, CSS, JSON, JSONC, YAML, Markdown, and binary files. All platform/content/release hashes route through this package. |`
- Edit `docs/technology.xml` — register `@gogol/fingerprint` package and its parser dependencies
- Edit `docs/development-plan.xml` — reference the staged migration and pipeline placement
- Edit root `AGENTS.md` — add `@gogol/fingerprint` to the shared helpers catalog section

**Validation:**

- `pnpm exec werkstatt run compass.validate --json` passes
- `pnpm exec werkstatt run ecosystem.manifest.validate --json` passes
- `pnpm exec werkstatt run workspace.surface.validate --json` passes

**Completion criterion:** All documentation files updated, Compass validation passes, ecosystem manifest is fresh.

**Human review:** No

---

### Step 11. Promote `fingerprint.usage.lint` to blocking

**Goal:** Switch `fingerprint.usage.lint` from warning mode to fail mode in `PACKAGES_CHECK_PIPELINE`.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` — change `fingerprint.usage.lint` step to `{ command: "fingerprint.usage.lint", args: ["--mode", "fail"] }` (pipeline steps support `args?: string[]` per `KernelPipelineStep`)
- Verify `packages-check.run` passes with zero violations

**Validation:**

- `pnpm exec werkstatt run packages-check.run --json` passes (zero violations, exit 0)

**Completion criterion:** `fingerprint.usage.lint` runs in fail mode in `PACKAGES_CHECK_PIPELINE`; `packages-check.run` passes.

**Human review:** No

---

### Step 12. Remove `packagesHash` read support

**Goal:** Remove `packagesHash` from schemas and all read paths; only `platformSemanticHash` is accepted.

**Agent actions:**

- Edit `packages/ontology/src/schemas/handoff.ts` — remove `packagesHash` field from `handoffEcosystemSchema`; make `platformSemanticHash` required
- Edit `packages/os/site-kernel-handoff/src/version-compare.ts` — remove `packagesHash` fallback; use only `platformSemanticHash`
- Edit `packages/os/site-kernel-handoff/src/absorb-report.ts` — remove `packagesHash` references
- Edit `packages/os/site-kernel-handoff/src/handoff-pack.ts` — stop writing `packagesHash`
- Edit `packages/os/site-kernel-handoff/src/handoff-absorb.ts` — remove `packagesHash` references
- Update `packages/os/site-kernel-handoff/src/tests/version-compare.test.ts` — update test fixtures to use `platformSemanticHash` only

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff run test` passes
- `pnpm exec werkstatt run packages-check.run --json` passes

**Completion criterion:** `packagesHash` fully removed from schemas and code; only `platformSemanticHash` is accepted; all tests pass.

**Human review:** No

---

### Step 13. Final validation and evidence

**Goal:** Run the full validation suite and emit verification evidence.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate RFC-0364 --json` — verify pass
- Run `pnpm exec werkstatt run packages-check.run --json` — verify pass
- Run `pnpm run build:check` for each affected package — verify pass
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0364` (RFC-0330) — emit verification evidence
- Update RFC-0364 acceptance criteria checkboxes to reflect verified state

**Validation:**

- `rfc.validate RFC-0364` passes
- `packages-check.run` passes
- All affected `build:check` passes
- Verification evidence file emitted

**Completion criterion:** All validation passes, evidence artifact committed, acceptance criteria checkboxes updated.

**Human review:** Yes — architecture acceptance required to transition RFC from `draft` to `accepted` before implementation begins (RFC-0224). After implementation, architecture review required to transition from `accepted` to `implemented`.

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0364 --json`
- `pnpm --filter @gogol/fingerprint run build:check`
- `pnpm --filter @gogol/fingerprint run test`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`
- `pnpm --filter @gogol/site-kernel-integrity run build:check`
- `pnpm --filter @gogol/check-core run build:check`
- `pnpm --filter @gogol/check-runner-node run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel run build:check`
- `pnpm exec werkstatt run packages-check.run --json`
- `pnpm exec werkstatt run compass.validate --json`
- `pnpm exec werkstatt run ecosystem.manifest.validate --json`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0364` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0364.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0364` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Semantic normalizer misses a meaningful change | Step 4: fixture suite covers each file type with both same-hash and different-hash pairs |
| Parser dependency churn | Step 1: parser dependencies pinned in `package.json`; Step 4: fixtures pin parser behavior |
| Usage lint blocks legitimate crypto code | Step 9: allowlist with documented reasons for legitimate byte-hash uses |
| Migration is too large for one PR | Steps 1-6 (package creation), Steps 7-9 (schema + migration), Steps 10-12 (promotion + cleanup) are independently committable |
| Agent uses `byteHash` where `fingerprintFile` with `mode: "semantic"` is required | Step 7: handoff-pack explicitly uses `fingerprintTree` with `mode: "semantic"`; Step 10: AGENTS.md documents the distinction |
| `fingerprint.usage.lint` false positives on legitimate crypto code | Step 9: allowlist burn-down; Step 11: promoted to blocking only after allowlist is complete |
| Parser-backed tree fingerprinting is slow on large trees | Step 5: `fingerprint.calculate` is a utility command, not in `build.check`; pipeline steps (`usage.lint`, `fixtures.validate`) do not compute tree fingerprints |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-53, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0364 --reason "..." --invariant "DNA-53"` instead of working around it.
- If a normalizer cannot be implemented for a file type listed in the RFC (e.g., `@astrojs/compiler` does not expose a usable AST), escalate via `rfc.supersede.propose` with `--reason "Normalizer implementation infeasible for <file type>"`.
- If the migration of `site-kernel-integrity/src/hash.ts` call sites reveals that semantic hashing is required where byte hashing was previously used (i.e., the existing hash was serving as an implicit semantic hash), escalate to update the RFC before proceeding.
