---
rfcId: RFC-0653
planId: PLAN-RFC-0653-01
status: draft
owner: architecture
createdAt: 2026-08-02
updatedAt:
scope:
  apps: []
  packages:
    - site-kernel-checks
    - site-kernel-handoff
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0653

## 1. Objectives

- [ ] O1 — Make `preview.images.generate` cacheable via RFC-0390 (maps to AC: `reads` declared, `cacheable: false` removed)
- [ ] O2 — Split `print.pdf.generate` into cacheable generate + new `print.pdf.copy` (maps to AC: `reads`/`writes` changed, `print.pdf.copy` registered, implementation copies from `.cache/pdf/`)
- [ ] O3 — Add `print.pdf.copy` to `build.post` pipeline (maps to AC: pipeline includes copy between generate and validate)
- [ ] O4 — Implement build-skip cache in `leitstand.dev-deploy` (maps to AC: skip logic with `commitSha` + `platformVersion` + `platformSemanticHash`, `--force-build` flag, `buildSkipped` field)
- [ ] O5 — Unit tests for all three optimizations (maps to AC: build-skip tests, `print.pdf.copy` tests)
- [ ] O6 — `command.reads.validate` passes for all modified commands (maps to AC: CRC-01 compliance)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` — `preview.images.generate` entry: remove `cacheable: false`, add `reads` with `packages/ontology/biomes/**/*.yaml`
- `packages/os/site-kernel-checks/src/command-tables/22-print.ts` — `print.pdf.generate` entry: remove `cacheable: false`, add `reads`, change `writes` to `.cache/pdf/**`; add new `print.pdf.copy` entry
- `packages/os/site-kernel-checks/src/print-pdf.ts` — `runPrintPdfGenerate` implementation: write to `.cache/pdf/<hash>/` with `.done` marker + `manifest.json`; add `runPrintPdfCopy` function
- `packages/os/site-kernel-checks/src/pipelines/build-post.ts` — insert `{ command: "print.pdf.copy" }` between `print.pdf.generate` and `print.pdf.validate`
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — `runLeitstandDevDeploy`: add build-skip cache logic before `pnpm build`, add `--force-build` flag, add `buildSkipped` to `DevDeployResult`
- `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts` — register `--force-build` flag on `leitstand.dev-deploy` command
- `packages/os/site-kernel-handoff/src/leitstand/index.ts` — register `--force-build` flag (mirror module.ts)

### 2.2 Configuration and data

- `.gitignore` — already covers `missions/` (monorepo root) and `.cache/` (workpiece-level). No changes needed.
- `missions/<missionId>/.dev-deploy-build-cache.json` — new ephemeral cache file (gitignored via `missions/` entry)
- `<app>/.cache/pdf/` — new PDF cache directory (gitignored via `.cache/` entry in workpiece `.gitignore`)

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — document `print.pdf.copy` command and `print.pdf.generate` output directory change
- `packages/os/site-kernel-handoff/AGENTS.md` — document `--force-build` flag and build-skip cache in leitstand section

### 2.4 Validation and pipelines

- `build.post` pipeline — new `print.pdf.copy` step
- `command.reads.validate` — must pass for `preview.images.generate` and `print.pdf.generate` (CRC-01)
- `rfc.validate --id RFC-0653` — must pass before stamping

## 3. Step sequence

### Step 1. Make `preview.images.generate` cacheable

**Goal:** Enable RFC-0390 pipeline caching for `preview.images.generate` by removing `cacheable: false` and declaring `reads`.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts`: remove `cacheable: false` from `preview.images.generate` entry, add `reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md", "packages/ontology/biomes/**/*.yaml"]`, add `writes: ["<app>/public/preview/**", "<app>/public/og-image.png"]`

**Validation:**

- `pnpm exec werkstatt run command.reads.validate --json` passes (CRC-01: `reads` declared or `cacheable: false`)
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** `preview.images.generate` has `reads` declared and no `cacheable: false` in the command table; `command.reads.validate` passes.

**Human review:** no

---

### Step 2. Modify `print.pdf.generate` to write to `.cache/pdf/`

**Goal:** Change `print.pdf.generate` output from `dist/client/_print/` to `.cache/pdf/<hash>/` with internal `.done` marker caching.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/command-tables/22-print.ts`: remove `cacheable: false` from `print.pdf.generate`, add `reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md", "<app>/dist/client/**/*.html"]`, change `writes` to `["<app>/.cache/pdf/**"]`
- Edit `packages/os/site-kernel-checks/src/print-pdf.ts` `runPrintPdfGenerate`:
  - Compute composite hash from source HTML files + print config: `stableJsonHash({ pages: [{ route, lang, htmlHash, printCfg }] })`
  - Cache directory: `.cache/pdf/<composite-hash>/`
  - If `.cache/pdf/<composite-hash>/.done` exists → skip Playwright, return cached report
  - Otherwise → render PDFs via Playwright, write to `.cache/pdf/<composite-hash>/`, write `.done` marker
  - Write manifest at `.cache/pdf/manifest.json` mapping `(lang, route)` → cache directory
  - Use `writeFileIfChanged` for all writes (per packages/AGENTS.md rule)

**Validation:**

- `pnpm exec werkstatt run command.reads.validate --json` passes
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** `print.pdf.generate` writes to `.cache/pdf/<hash>/` with `.done` marker and `manifest.json`; `reads`/`writes` declared in command table; `cacheable: false` removed.

**Human review:** no

---

### Step 3. Implement `print.pdf.copy` command

**Goal:** New command that copies PDFs from `.cache/pdf/` to `dist/client/_print/` based on `manifest.json`.

**Agent actions:**

- Add `runPrintPdfCopy` function to `packages/os/site-kernel-checks/src/print-pdf.ts`:
  - Read `.cache/pdf/manifest.json` (wrap `JSON.parse` in try/catch with descriptive error)
  - For each entry in manifest, copy PDF from cache dir to `dist/client/_print/<lang>/<route>.pdf`
  - Return `{ command, status, copied, outputDir }` result
  - If manifest missing or empty, exit 0 with `copied: 0` and warning summary
- Add `print.pdf.copy` entry to `packages/os/site-kernel-checks/src/command-tables/22-print.ts`:
  - `cacheable: false`, `reads: ["<app>/.cache/pdf/**/*.pdf"]`, `writes: ["<app>/dist/client/_print/**"]`
- Import `runPrintPdfCopy` in the command table file

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- `pnpm exec werkstatt run command.reads.validate --json` passes

**Completion criterion:** `print.pdf.copy` command registered with `cacheable: false`, implementation copies PDFs from `.cache/pdf/` to `dist/client/_print/` based on `manifest.json`.

**Human review:** no

---

### Step 4. Add `print.pdf.copy` to `build.post` pipeline

**Goal:** Insert `print.pdf.copy` between `print.pdf.generate` and `print.pdf.validate` in the `build.post` pipeline.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/pipelines/build-post.ts`: add `{ command: "print.pdf.copy" }` between `print.pdf.generate` and `print.pdf.validate`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** `build.post` pipeline includes `print.pdf.copy` between `print.pdf.generate` and `print.pdf.validate`.

**Human review:** no

---

### Step 5. Implement build-skip cache in `leitstand.dev-deploy`

**Goal:** Skip `pnpm build` when `commitSha` + `platformVersion` + `platformSemanticHash` match a cache file and `dist/` exists.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`:
  - Add `DevDeployBuildCache` interface: `{ commitSha, platformVersion, platformSemanticHash, writtenAt }`
  - Add `buildSkipped: boolean` to `DevDeployResult`
  - Before `pnpm build` call (after `computeBuildInputHash` and `commitSha` capture):
    1. Read `missions/<missionId>/.dev-deploy-build-cache.json` (try/catch JSON.parse)
    2. Check `--force-build` flag — if set, skip cache check
    3. If cache exists AND `dist/` exists AND all three keys match → skip `pnpm build`, log skip, set `buildSkipped: true`
    4. If build skipped, also skip preliminary `build-identity.json` write to `public/.well-known/`
    5. After successful build (not skipped), write cache file with current values
  - Register `--force-build` flag in `leitstand.module.ts` and `leitstand/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `leitstand.dev-deploy` skips `pnpm build` when cache matches; `--force-build` bypasses; `buildSkipped` field in result; cache file written after successful build.

**Human review:** no

---

### Step 6. Unit tests

**Goal:** Cover build-skip cache hit/miss/force-build and `print.pdf.copy` with existing/missing manifest.

**Agent actions:**

- Add tests to `packages/os/site-kernel-handoff/src/tests/leitstand-0628-dev-deploy.test.ts`:
  - Build-skip cache hit: second run with unchanged `commitSha` + `platformVersion` + `platformSemanticHash` skips build
  - Build-skip cache miss: changed `commitSha` triggers build
  - `--force-build` override: cache exists but flag bypasses skip
  - Include `package.json` with `version` in temp workspace (per memory: `computeBuildInputHash` requires it)
- Add tests to `packages/os/site-kernel-checks/src/tests/` (new file `print-pdf-copy.test.ts`):
  - `print.pdf.copy` with existing `manifest.json` copies PDFs to `dist/client/_print/`
  - `print.pdf.copy` with missing `manifest.json` exits 0 with `copied: 0`
  - `print.pdf.copy` with empty manifest exits 0 with `copied: 0`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` passes
- `pnpm --filter @warpgogol/site-kernel-checks run test` passes

**Completion criterion:** All new tests pass; build-skip cache hit/miss/force-build covered; `print.pdf.copy` with existing/missing manifest covered.

**Human review:** no

---

### Step 7. Documentation sync

**Goal:** Update AGENTS.md files with new command and behavior changes.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md`: add `print.pdf.copy` to the print module documentation; note `print.pdf.generate` output directory change to `.cache/pdf/`
- Update `packages/os/site-kernel-handoff/AGENTS.md`: add `--force-build` flag and build-skip cache description to the leitstand section

**Validation:**

- `git diff` shows only the intended AGENTS.md changes

**Completion criterion:** Both AGENTS.md files updated with new command and behavior documentation.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0653 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0653`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0653`
- `pnpm exec werkstatt run command.reads.validate --json`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0653` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Stale `dist/` on skip-build | Step 5: `--force-build` flag; Axiom gate + CDN freshness check still run after deploy |
| `preview.images.generate` cache hit with deleted PNGs | Step 1: `reads = content only` pattern; `--force` on pipeline regenerates |
| `print.pdf.generate` cache hit with deleted `.cache/pdf/` | Step 2: `.done` marker check; `--force` on pipeline regenerates |
| `dist/client/**/*.html` non-determinism | Step 2: pattern already used by 15+ existing cacheable commands |
| Agent misinterpretation of output dir | Step 7: AGENTS.md documents `.cache/pdf/` output and `print.pdf.copy` bridge |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0653 --reason "..." --invariant "DNA-49"` instead of working around it.
