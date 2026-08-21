---
rfcId: RFC-0908
planId: PLAN-RFC-0908-01
status: draft
owner: architecture
createdAt: 2026-08-21
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/verification-plan.xml
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0908

## 1. Objectives

- [ ] Objective 1 — Create `host.canonical.config.validate` command with HOST-CANON-01..03 rules — maps to acceptance criteria 1, 3, 4, 5
- [ ] Objective 2 — Create `trailing.slash.config.validate` command with SLASH-01..03 rules — maps to acceptance criteria 2, 6, 7, 8
- [ ] Objective 3 — Register both commands in `31-public-surface.ts` and wire into `SITES_CHECK_POSTBUILD_PIPELINE` — maps to acceptance criteria 1, 2, 9
- [ ] Objective 4 — Verify DNA-86 entry in `docs/architecture-dna.md` — maps to acceptance criterion 11
- [ ] Objective 5 — Update `packages/werkstatt-site/AGENTS.md` with both new commands — maps to acceptance criterion 12
- [ ] Objective 6 — Unit tests pass for both validators — maps to acceptance criterion 13
- [ ] Objective 7 — `rfc.validate` passes on RFC-0908 — maps to acceptance criterion 14

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/host-canonical.ts` — **new file**: `host.canonical.config.validate` command handler
- `packages/werkstatt-site/src/checks/trailing-slash.ts` — **new file**: `trailing.slash.config.validate` command handler
- `packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts` — **modified**: import and register both new commands
- `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` — **modified**: add both commands after `redirect.shadow.validate`, before `robots.page.validate`

### 2.2 Configuration and data

No configuration files or data artifacts are modified. Both validators read existing files (`astro.config.mjs`, `public/_redirects`, `wrangler.toml`/`wrangler.jsonc`, Worker source) in read-only mode.

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — **verify** DNA-86 entry already exists (added during RFC creation); no changes expected
- `docs/verification-plan.xml` — **verify** `vm-44` entry already exists; no changes expected
- `packages/werkstatt-site/AGENTS.md` — **modified**: add `host.canonical.config.validate` and `trailing.slash.config.validate` to the "Check commands" section

### 2.4 Validation and pipelines

- `SITES_CHECK_POSTBUILD_PIPELINE` — both commands inserted at position after `redirect.shadow.validate` (line 42) and before `robots.page.validate` (line 44)
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt-site run test` — vitest unit tests

## 3. Step sequence

### Step 1. Create `host.canonical.config.validate` command handler

**Goal:** Implement the host canonicalization validator that checks wrangler config and Worker source for host redirect logic.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/host-canonical.ts`
- Import `readAstroSiteUrl` from `../lib/astro-site-url.ts`
- Import `parseRedirectRules` from `@warpgogol/werkstatt-shared/share/redirects` (not used for host checks, but imported for potential _redirects reading if needed for trailing-slash cross-reference)
- Import `resolveDeploymentAdapter` from `./public-surface/managed-public.ts`
- Import `diagnosticsResult` from `../result-helpers.ts`
- Import `Diagnostic` type from `@warpgogol/werkstatt/schemas`
- Implement `runHostCanonicalConfigValidate` function:
  - Read `astro.config.mjs` via `readAstroSiteUrl` → extract canonical host
  - Determine canonical variant: apex (no `www.` prefix) or www
  - If site URL missing or ambiguous (localhost, empty) → HOST-CANON-03 warning, skip
  - Read `wrangler.toml`/`wrangler.jsonc` from app directory → scan for route patterns matching non-canonical host
  - If no wrangler route found, scan `src/middleware/` directory and `src/middleware.ts` in the workpiece for host redirect logic patterns:
    - `request.headers.get("host")` comparisons
    - `URL` host comparisons against canonical host
    - `Response.redirect()` with host canonicalization
  - If no redirect found → emit HOST-CANON-01 (apex canonical, missing www→apex) or HOST-CANON-02 (www canonical, missing apex→www)
  - Return `diagnosticsResult("host.canonical.config.validate", diagnostics)`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes with the new file

**Completion criterion:** `host-canonical.ts` exists, exports `runHostCanonicalConfigValidate`, and compiles without errors

**Human review:** no

---

### Step 2. Create `trailing.slash.config.validate` command handler

**Goal:** Implement the trailing-slash normalization validator that checks `build.format` consistency and `_redirects` for normalization rules.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/trailing-slash.ts`
- Import `readAstroSiteUrl` from `../lib/astro-site-url.ts`
- Import `parseRedirectRules` from `@warpgogol/werkstatt-shared/share/redirects`
- Import `diagnosticsResult` from `../result-helpers.ts`
- Import `Diagnostic` type from `@warpgogol/werkstatt/schemas`
- Implement `runTrailingSlashConfigValidate` function:
  - Assume `trailingSlash: "always"` (literal type in `CanonicalUrlOptions`, not a union — no call-site scanning needed)
  - Read `astro.config.mjs` → extract `build.format` (regex: `build\.format\s*:\s*["'](\w+)["']`)
  - If `build.format` not found → assume `"directory"` (Astro default)
  - If `build.format !== "directory"` → SLASH-02 error
  - Read `public/_redirects` via `parseRedirectRules` → scan for trailing-slash normalization patterns:
    - Rules where `from` does not end with `/` and `to` ends with `/` (or `to` is undefined but pattern implies normalization)
    - Cloudflare Pages `_redirects` does not support named placeholders like `/:path*` — check for explicit path rules and wildcard patterns where the `from` path lacks a trailing slash and the `to` path has one
  - If no normalization rules found → SLASH-01 error
  - Return `diagnosticsResult("trailing.slash.config.validate", diagnostics)`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes with the new file

**Completion criterion:** `trailing-slash.ts` exists, exports `runTrailingSlashConfigValidate`, and compiles without errors

**Human review:** no

---

### Step 3. Register both commands in command table

**Goal:** Add both new commands to `PUBLIC_SURFACE_COMMANDS` so they are discoverable by the kernel.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts`:
  - Add imports: `import { runHostCanonicalConfigValidate } from "../host-canonical.ts"` and `import { runTrailingSlashConfigValidate } from "../trailing-slash.ts"`
  - Add two `CheckCommandEntry` objects to `PUBLIC_SURFACE_COMMANDS` array:
    - `host.canonical.config.validate`: scope `app`, `supportsAllSites: true`, `reads` includes `<app>/astro.config.mjs`, `<app>/wrangler.toml`, `<app>/wrangler.jsonc`, `modulePaths` includes `host-canonical.ts`
    - `trailing.slash.config.validate`: scope `app`, `supportsAllSites: true`, `reads` includes `<app>/astro.config.mjs`, `<app>/public/_redirects`, `modulePaths` includes `trailing-slash.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** Both commands appear in `PUBLIC_SURFACE_COMMANDS` with correct name, scope, and flags

**Human review:** no

---

### Step 4. Wire both commands into postbuild pipeline

**Goal:** Add both validators to `SITES_CHECK_POSTBUILD_PIPELINE` at the correct position.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts`:
  - Insert after `{ command: "redirect.shadow.validate" }` (line 42) and before `{ command: "robots.page.validate" }` (line 44):
    ```ts
    // RFC-0908: host canonicalization — check wrangler config and Worker source
    // for www↔apex redirect configuration.
    { command: "host.canonical.config.validate" },
    // RFC-0908: trailing-slash normalization — check build.format consistency
    // and _redirects for normalization rules.
    { command: "trailing.slash.config.validate" },
    ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** Both commands appear in `SITES_CHECK_POSTBUILD_PIPELINE` between `redirect.shadow.validate` and `robots.page.validate`

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Create unit tests covering all rule IDs (HOST-CANON-01..03, SLASH-01..03) and edge cases.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/host-canonical.test.ts`:
  - Test: HOST-CANON-01 — apex canonical host, no www→apex redirect in wrangler or Worker source → error emitted
  - Test: HOST-CANON-01 pass — apex canonical host, www→apex redirect found in wrangler routes → no error
  - Test: HOST-CANON-02 — www canonical host, no apex→www redirect → error emitted
  - Test: HOST-CANON-03 — site URL missing → warning emitted, remaining checks skipped
  - Test: HOST-CANON-03 — site URL is localhost → warning emitted
  - Test: no violations → exitCode 0, summary with `canonicalHost` and `redirectConfigured`
  - Test: Worker source with `request.headers.get("host")` comparison → redirect detected, no error
- Create `packages/werkstatt-site/src/checks/tests/trailing-slash.test.ts`:
  - Test: SLASH-01 — `build.format: "directory"`, no normalization redirects in `_redirects` → error emitted
  - Test: SLASH-01 pass — normalization rules present in `_redirects` → no error
  - Test: SLASH-02 — `build.format: "file"` → error emitted
  - Test: SLASH-02 pass — `build.format: "directory"` → no error
  - Test: `build.format` not set → assume `"directory"`, no SLASH-02
  - Test: `_redirects` missing → SLASH-01 error
  - Test: no violations → exitCode 0, summary with `policy` and `normalizationConfigured`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site exec vitest run src/checks/tests/host-canonical.test.ts src/checks/tests/trailing-slash.test.ts`

**Completion criterion:** All tests pass with correct rule IDs and severities

**Human review:** no

---

### Step 6. Update documentation

**Goal:** Sync AGENTS.md and verify Compass docs are already up to date.

**Agent actions:**

- Edit `packages/werkstatt-site/AGENTS.md`: add two entries to the "Check commands" section:
  - `host.canonical.config.validate` (RFC-0908) — checks that host canonicalization (www↔apex redirect) is configured in wrangler config or Worker source code. Emits HOST-CANON-01 (missing www→apex), HOST-CANON-02 (missing apex→www), HOST-CANON-03 (ambiguous canonical host, warning). Integrated into `SITES_CHECK_POSTBUILD_PIPELINE` after `redirect.shadow.validate`.
  - `trailing.slash.config.validate` (RFC-0908) — checks trailing-slash normalization: `build.format` consistency with `trailingSlash: "always"` policy and presence of normalization redirects in `_redirects`. Emits SLASH-01 (missing normalization redirects), SLASH-02 (inconsistent build.format), SLASH-03 (missing policy declaration, warning). Integrated into `SITES_CHECK_POSTBUILD_PIPELINE` after `host.canonical.config.validate`.
- Verify `docs/architecture-dna.md` contains DNA-86 entry (already added during RFC creation)
- Verify `docs/verification-plan.xml` contains `vm-44` entry (already present)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed

**Validation:**

- `git diff docs/architecture-dna.md` — no changes expected (DNA-86 already present)
- `git diff docs/verification-plan.xml` — no changes expected (vm-44 already present)

**Completion criterion:** AGENTS.md updated with both new commands; DNA-86 and vm-44 verified present

**Human review:** no

---

### Step 7. Validation suite

**Goal:** Run all validation checks to verify the implementation is complete and correct.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt-site run build:check`
- Run `pnpm --filter @warpgogol/werkstatt-site run test`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0908`
- Run `pnpm exec werkstatt run host.canonical.config.validate --app <test-app> --json` (if test app available)
- Run `pnpm exec werkstatt run trailing.slash.config.validate --app <test-app> --json` (if test app available)

**Validation:**

- All commands pass with exit code 0
- `rfc.validate` reports no violations

**Completion criterion:** All validation commands pass

**Human review:** no

---

### Step 8. Evidence and stamp

**Goal:** Generate verification evidence and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0908` (if acceptance probes declared)
- Check off all acceptance criteria in the RFC file with inline `(evidence: <file:line>)` annotations
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0908 --implementation-commit <sha>`

**Validation:**

- `rfc.validate` passes on the stamped RFC
- `git status` clean

**Completion criterion:** RFC-0908 status is `implemented`, all acceptance criteria checked with evidence

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files with new commands (done in Step 6).
- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with `(evidence: <file:line>)`.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0908 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0908`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with inline evidence; RFC is stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0908`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0908` (if acceptance probes declared)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0908.generated.json` — verification evidence (if probes declared)
- Commit messages referencing `RFC-0908` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positive: Worker handles host redirects programmatically without detectable patterns | Step 1: scan Worker source for `request.headers.get("host")` and `Response.redirect()` patterns; document escape hatch in RFC for future follow-up |
| False positive: Worker handles trailing-slash normalization programmatically | Step 2: check `_redirects` for normalization patterns; document escape hatch in RFC |
| SLASH-02 false positive: `build.format` not set in astro.config.mjs | Step 2: assume `"directory"` (Astro default) when `build.format` is not explicitly set |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-86, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0908 --reason "..." --invariant "DNA-86"` instead of working around it.
- If the Worker source scanning approach proves insufficient for detecting host redirects (too many false positives), escalate to a follow-up RFC proposing a `host-redirect.config.yaml` escape hatch.
