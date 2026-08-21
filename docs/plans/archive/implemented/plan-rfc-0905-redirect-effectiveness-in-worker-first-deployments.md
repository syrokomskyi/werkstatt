---
rfcId: RFC-0905
planId: PLAN-RFC-0905-01
status: draft
owner: architecture
createdAt: 2026-08-22
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

# Implementation Plan: RFC-0905

## 1. Objectives

- [ ] O1 — Create `redirect.shadow.validate` command with RSHAD-01, RSHAD-02, RSHAD-03 rules (maps to acceptance criteria 1-5)
- [ ] O2 — Enhance `redirect.map.validate` with REDIR-07 static file shadow check (maps to acceptance criterion 6)
- [ ] O3 — Wire `redirect.shadow.validate` into `SITES_CHECK_POSTBUILD_PIPELINE` after `redirect.map.validate` (maps to acceptance criterion 7)
- [ ] O4 — Verify `--json` output shape matches RFC contract (maps to acceptance criterion 8)
- [ ] O5 — Add DNA-84 to `docs/architecture-dna.md` (maps to acceptance criterion 9)
- [ ] O6 — Document `redirect.shadow.validate` in `packages/werkstatt-site/AGENTS.md` (maps to acceptance criterion 10)
- [ ] O7 — Unit tests pass for both validators (maps to acceptance criterion 11)
- [ ] O8 — `rfc.validate` passes on RFC-0905 (maps to acceptance criterion 12)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/redirect-shadow.ts` — **new file**: `runRedirectShadowValidate` implementation with RSHAD-01..03 rules
- `packages/werkstatt-site/src/checks/public-surface/managed-public.ts` — **modified**: add REDIR-07 rule to `runRedirectMapValidate`, export `checkStaticFileShadow` helper and `normalizeUrlPath`
- `packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts` — **modified**: register `redirect.shadow.validate` command entry
- `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` — **modified**: add `{ command: "redirect.shadow.validate" }` after `redirect.map.validate`
- `packages/werkstatt-site/src/checks/tests/redirect-shadow.test.ts` — **new file**: unit tests for RSHAD-01..03, adapter gating, missing file handling
- `packages/werkstatt-site/src/checks/tests/redirect-map-validate.test.ts` — **modified**: add REDIR-07 test cases

### 2.2 Configuration and data

- No configuration files change. `wrangler.jsonc` is read-only at validation time.
- No ontology catalogs or manifests change.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0905-redirect-effectiveness-in-worker-first-deployments.md` — read-only reference
- `docs/architecture-dna.md` — **modified**: add DNA-84 entry (already present in file as of audit, verify content matches RFC)
- `docs/verification-plan.xml` — **modified**: add RSHAD-01..03 and REDIR-07 rule IDs
- `packages/werkstatt-site/AGENTS.md` — **modified**: document `redirect.shadow.validate` command in Check commands section

### 2.4 Validation and pipelines

- `SITES_CHECK_POSTBUILD_PIPELINE` — add `redirect.shadow.validate` after `redirect.map.validate`
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript must pass
- `pnpm --filter @warpgogol/werkstatt-site run test` — unit tests must pass
- `pnpm exec werkstatt run rfc.validate --id RFC-0905` — must pass

## 3. Step sequence

### Step 1. Extract shared `checkStaticFileShadow` helper

**Goal:** Create the shared helper that both REDIR-07 and RSHAD-01 will use to detect static file shadows.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/public-surface/managed-public.ts`:
  - Export `normalizeUrlPath` (currently private)
  - Add and export `checkStaticFileShadow` function:
    ```ts
    export async function checkStaticFileShadow(
      context: KernelRuntimeContext,
      distClientDir: string,
      sourcePath: string,
    ): Promise<boolean>
    ```
  - Logic: normalize source path, check `dist/client/{source}/index.html`, `dist/client/{source}.html` existence via `context.io.exists`
  - Skip pattern sources (containing `*` or `:`) — return `false`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles

**Completion criterion:** `checkStaticFileShadow` and `normalizeUrlPath` are exported from `managed-public.ts` and TypeScript compiles.

**Human review:** no

---

### Step 2. Add REDIR-07 to `redirect.map.validate`

**Goal:** Enhance `runRedirectMapValidate` with the REDIR-07 static file shadow check.

**Agent actions:**

- In `runRedirectMapValidate` in `managed-public.ts`:
  - After the existing REDIR-04 check (source is in sitemap), add REDIR-07:
    - Call `checkStaticFileShadow(context, join(app.appDirectory, "dist", "client"), rule.from)`
    - If true, emit error: `REDIR-07 static file shadows redirect source: ${rule.from}`
    - `fixHint`: "Remove the static file from dist/client/ or remove the redirect from _redirects"
  - Skip pattern sources (containing `*` or `:`) — same as REDIR-04
  - Resolve `dist/client/` path from `app.appDirectory` (consistent with other post-build validators)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test` — existing tests still pass

**Completion criterion:** REDIR-07 rule fires when a static file exists at a redirect source path; existing REDIR-01..06 tests still pass.

**Human review:** no

---

### Step 3. Create `redirect.shadow.validate` command

**Goal:** Implement the new `redirect.shadow.validate` command with RSHAD-01..03 rules.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/redirect-shadow.ts`:
  - Import `parseRedirectRules` from `@warpgogol/werkstatt-shared/share/redirects`
  - Import `loadPublicContext`, `appRel`, `readTextIfExists`, `diagnostics` from `./public-surface/shared.ts`
  - Import `resolveDeploymentAdapter`, `checkStaticFileShadow`, `normalizeUrlPath` from `./public-surface/managed-public.ts`
  - Import `sitemapPaths` — if not exported, extract and export from `managed-public.ts`
  - Implement `runRedirectShadowValidate`:
    1. Load public context via `loadPublicContext(context)`
    2. Read `public/_redirects` — if missing, skip with info (REDIR-01 handles this)
    3. Parse rules via `parseRedirectRules(body)`
    4. Resolve adapter via `resolveDeploymentAdapter(context, app.appId)`
    5. For each rule:
       - RSHAD-01: call `checkStaticFileShadow` → error if true
       - RSHAD-02: only when adapter is `cloudflare-workers` or `cloudflare-pages`:
         - Read `wrangler.jsonc` from app directory (strip JSONC comments, `JSON.parse`)
         - If no `wrangler.jsonc`, try `wrangler.toml` (skip if neither exists)
         - Parse `routes[]` array — if absent or empty, skip RSHAD-02
         - Convert each route pattern to regex (`*` → `.*`)
         - If any route pattern matches redirect source → error
       - RSHAD-03: if target is not in sitemap AND static file exists at target path → warning
    6. Return `diagnostics("redirect.shadow.validate", messages)`
  - Handle failure modes per RFC §Failure modes

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `runRedirectShadowValidate` function exists, compiles, and implements RSHAD-01..03 per RFC spec.

**Human review:** no

---

### Step 4. Register command in command-tables

**Goal:** Register `redirect.shadow.validate` in the command table so it is discoverable by the kernel.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts`:
  - Import `runRedirectShadowValidate` from `../redirect-shadow.ts`
  - Add command entry after `redirect.map.validate`:
    ```ts
    {
      name: "redirect.shadow.validate",
      description: "Cross-reference _redirects sources against dist/client/ static files and Worker route patterns for shadow detection (RFC-0905).",
      scope: "app",
      flags: {},
      supportsAllSites: true,
      reads: ["<app>/public/_redirects", "<app>/dist/client/**/*", "<app>/wrangler.jsonc"],
      modulePaths: ["redirect-shadow.ts", "public-surface/managed-public.ts", "public-surface/shared.ts", "result-helpers.ts"],
      execute: runRedirectShadowValidate,
    },
    ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `redirect.shadow.validate` appears in `PUBLIC_SURFACE_COMMANDS` array with correct metadata.

**Human review:** no

---

### Step 5. Wire into postbuild pipeline

**Goal:** Add `redirect.shadow.validate` to `SITES_CHECK_POSTBUILD_PIPELINE`.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts`:
  - Add `{ command: "redirect.shadow.validate" }` immediately after `{ command: "redirect.map.validate" }`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `redirect.shadow.validate` appears in `SITES_CHECK_POSTBUILD_PIPELINE` after `redirect.map.validate`.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Create comprehensive unit tests for both `redirect.shadow.validate` and the REDIR-07 enhancement.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/redirect-shadow.test.ts`:
  - Test RSHAD-01: static file at redirect source → error
  - Test RSHAD-01: no static file → no error
  - Test RSHAD-01: pattern sources (`*`, `:`) are skipped
  - Test RSHAD-02: Worker route matches redirect source → error (when adapter is cloudflare-workers)
  - Test RSHAD-02: no routes[] in wrangler.jsonc → skip
  - Test RSHAD-02: missing wrangler.jsonc → skip
  - Test RSHAD-02: adapter is not cloudflare-workers → skip
  - Test RSHAD-03: target not in sitemap + static file at target → warning
  - Test RSHAD-03: target in sitemap → no warning
  - Test: missing _redirects → skip with info
  - Test: missing dist/client/ → skip with info
  - Use temp directories with `mkdtemp`, mock `KernelRuntimeContext` with `io.exists`, `io.readFile`, `io.glob`
- Add REDIR-07 test cases to `packages/werkstatt-site/src/checks/tests/redirect-map-validate.test.ts`:
  - Test REDIR-07: static file at redirect source → error
  - Test REDIR-07: no static file → no error

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test`

**Completion criterion:** All new tests pass; existing tests still pass.

**Human review:** no

---

### Step 7. Update documentation

**Goal:** Synchronize all documentation artifacts affected by this RFC.

**Agent actions:**

- `docs/architecture-dna.md` — verify DNA-84 entry exists and matches RFC text. If already present (added during audit), verify content. If missing, add:
  ```
  ## DNA-84 · Redirect effectiveness gate

  Every redirect rule in `public/_redirects` MUST be checked for static-file and Worker-route shadowing before deployment. A redirect that is shadowed by a static file in `dist/client/` or by a Cloudflare Worker route pattern will never fire — Google crawls the stale content instead of following the redirect. The check cross-references each redirect source against `dist/client/` file existence and Worker route patterns from `wrangler.toml`/`wrangler.jsonc`. Enforced by `redirect.shadow.validate` (RSHAD-01..03) and enhanced `redirect.map.validate` (REDIR-07). Established by RFC-0905.
  ```
- `docs/verification-plan.xml` — add RSHAD-01, RSHAD-02, RSHAD-03, REDIR-07 rule IDs to the appropriate rule catalog section
- `packages/werkstatt-site/AGENTS.md` — add `redirect.shadow.validate` to the Check commands section with description and rule IDs

**Validation:**

- `git diff docs/architecture-dna.md docs/verification-plan.xml packages/werkstatt-site/AGENTS.md` — all three files modified

**Completion criterion:** All three documentation files updated with RFC-0905 content.

**Human review:** no

---

### Step 8. Validate and run review

**Goal:** Run full validation suite, code review, fix findings, and stamp RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0905 --json` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — must pass
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surface changed
- Check off acceptance criteria in RFC-0905 with inline `(evidence: <file:line>)` annotations
- Run `fo-review` via `skill` tool on all session code changes
- Run `fo-fix` if review findings, re-run `fo-review` (max 3 iterations)
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0905 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0905` — passes
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; code review passed.

**Human review:** no — `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0905`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0905` in the subject line (RFC-0265 commit hygiene)
- `rfc.implement.stamp` evidence recorded in RFC frontmatter

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| Performance: O(R) file-existence checks | Step 3: uses `context.io.exists` (single stat per path), not directory scan |
| RSHAD-02 false positives | Step 3: skip RSHAD-02 when `routes[]` absent or empty — current project uses `run_worker_first: true` without explicit `routes[]` |
| REDIR-07 / RSHAD-01 implementation drift | Step 1: shared `checkStaticFileShadow` helper prevents drift |
| JSONC parsing complexity | Step 3: strip `//` comments with regex before `JSON.parse` — wrangler.jsonc is simple JSONC, no block comments in template |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-73 (sequential deployment pipeline), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0905 --reason "..." --invariant "DNA-73"` instead of working around it.
- If `wrangler.toml` support is needed (not just `wrangler.jsonc`), add `smol-toml` as a dependency to `@warpgogol/werkstatt-site` — current project only uses `wrangler.jsonc`, so TOML parsing is deferred.
