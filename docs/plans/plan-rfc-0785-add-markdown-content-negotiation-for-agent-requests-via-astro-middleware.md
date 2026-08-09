---
rfcId: RFC-0785
planId: PLAN-RFC-0785-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps:
    - apps/*
  packages:
    - packages/werkstatt-site
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0785

## 1. Objectives

- [ ] Objective 1 — Create `agent.markdown-negotiation.generate` command that scaffolds Astro middleware for Accept-header-based markdown content negotiation — maps to acceptance criterion "registered in command table"
- [ ] Objective 2 — Create middleware template and amend middleware index template to chain the new middleware — maps to acceptance criteria "template created" and "index amended"
- [ ] Objective 3 — Wire the command into `build.prepare` pipeline after `page.markdown.generate` — maps to acceptance criterion "integrated into build.prepare"
- [ ] Objective 4 — Implement `agent.enabled: false` skip pattern with stale file removal — maps to acceptance criterion "skip pattern works"
- [ ] Objective 5 — Write unit tests for `resolveMarkdownTwinPath` covering root path, i18n paths, trailing slash, non-page routes, static assets — maps to acceptance criterion "Unit tests for resolveMarkdownTwinPath"
- [ ] Objective 6 — Verify runtime behavior with curl and isitagentready.com — maps to acceptance criteria for curl responses and Vary header

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/agent/agent-markdown-negotiation.ts` — **new** — generate handler module
- `packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts` — **amend** — add `agent.markdown-negotiation.generate` command entry
- `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware/markdown-negotiation.template.ts` — **new** — middleware source template
- `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware.template.ts` — **amend** — chain `markdownNegotiationMiddleware` into `sequence()` call
- `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts` — **amend** — add `agent.markdown-negotiation.generate` step after `page.markdown.generate` in both `SITES_BUILD_PREPARE_PIPELINE` and `SITES_BUILD_PREPARE_DEV_PIPELINE`
- `packages/werkstatt-site/src/checks/agent/agent-markdown-negotiation.test.ts` — **new** — unit tests for `resolveMarkdownTwinPath`

### 2.2 Configuration and data

- No YAML/JSON configuration changes required. The middleware is generated code, not configuration.

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — update if the agent surface command table documentation needs the new command listed
- RFC file is read-only reference (`docs/rfcs/rfc-0785-add-markdown-content-negotiation-for-agent-requests-via-astro-middleware.md`)

### 2.4 Validation and pipelines

- `build.prepare` pipeline — new step `agent.markdown-negotiation.generate` after `page.markdown.generate`
- `build.prepare` dev pipeline — same step added to `SITES_BUILD_PREPARE_DEV_PIPELINE`
- No new validate command required (the middleware is a generated artifact, not a validated contract)
- No CI workflow changes required

## 3. Step sequence

### Step 1. Create the middleware template

**Goal:** Create the Astro middleware template that implements Accept-header-based content negotiation.

**Agent actions:**

- Create `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware/markdown-negotiation.template.ts`
- Implement `resolveMarkdownTwinPath` function: map `/about/` → `/about/index.md`, `/` → `/index.md`, skip `/api/*`, `/.well-known/*`, and static asset extensions
- Implement `onRequest` middleware using `defineMiddleware` from `astro:middleware`: check `Accept: text/markdown`, fetch twin, return with `Content-Type: text/markdown; charset=utf-8`, `Vary: Accept`, `Cache-Control: public, max-age=300`
- Add `{{GENERATED_HEADER}}` at the top
- Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks

**Validation:**

- File exists at the correct template path
- `resolveMarkdownTwinPath` returns `null` for `/api/*`, `/.well-known/*`, and static asset extensions
- `resolveMarkdownTwinPath` maps `/about/` → `/about/index.md` (not `/about.md`)

**Completion criterion:** Template file exists with correct path resolution logic and Compass blocks.

**Human review:** no

---

### Step 2. Amend the middleware index template

**Goal:** Chain the new `markdownNegotiationMiddleware` into the existing middleware sequence.

**Agent actions:**

- Edit `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware.template.ts`
- Add import: `import markdownNegotiationMiddleware from "./middleware/markdown-negotiation";`
- Add to both `sequence()` calls (dev and prod): insert `markdownNegotiationMiddleware` after `languageRedirectMiddleware` and before `devNormalize` (dev) or at the end (prod)
- Update `CHANGE_SUMMARY` with RFC-0785 entry
- Update `@ai-invariant` comment if needed

**Validation:**

- `middleware.template.ts` imports `markdownNegotiationMiddleware`
- Both `sequence()` calls include `markdownNegotiationMiddleware`
- Template still has valid Compass blocks

**Completion criterion:** Middleware index template chains the new middleware in both dev and prod sequences.

**Human review:** no

---

### Step 3. Create the generate handler module

**Goal:** Implement the `agent.markdown-negotiation.generate` command handler.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/agent/agent-markdown-negotiation.ts`
- Implement `runAgentMarkdownNegotiationGenerate` following the pattern of `runAgentOpenApiGenerate`:
  - Read `agentBlock.enabled` from system manifest
  - If `agent.enabled: false`: remove stale middleware file and unchain from index, return `status: "skip"`
  - If enabled: write middleware file from template, amend middleware index to chain it, return `status: "pass"` with `filesWritten` and `filesAmended`
- Use `writeFileIfChanged` for all generated file writes (DNA-58, package AGENTS.md rule)
- Export `resolveMarkdownTwinPath` as a pure function for unit testing

**Validation:**

- Module exports `runAgentMarkdownNegotiationGenerate` and `resolveMarkdownTwinPath`
- Handler follows the `KernelCommandResult` return shape
- Skip pattern matches other agent surface generators

**Completion criterion:** Handler module compiles and follows established agent surface generator patterns.

**Human review:** no

---

### Step 4. Register the command in the command table

**Goal:** Add `agent.markdown-negotiation.generate` to the agent surface command table.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts`
- Add new entry to `AGENT_SURFACE_COMMANDS` array after `agent.routes.generate`:
  - `name: "agent.markdown-negotiation.generate"`
  - `description: "Generate Astro middleware for Accept-header-based markdown content negotiation (RFC-0785)."`
  - `scope: "app"`
  - `supportsAllSites: true`
  - `mutatesState: true`
  - `writes: ["<app>/src/middleware/markdown-negotiation.ts", "<app>/src/middleware/index.ts"]`
  - `reads: ["<app>/src/content/system.md"]`
  - `modulePaths: ["agent/agent-markdown-negotiation.ts"]`
  - `execute: runAgentMarkdownNegotiationGenerate`
- Add import for `runAgentMarkdownNegotiationGenerate` at the top of the file

**Validation:**

- `pnpm exec werkstatt run agent.markdown-negotiation.generate --site <site> --dry-run` does not error with "command not found"

**Completion criterion:** Command is registered and discoverable by the kernel.

**Human review:** no

---

### Step 5. Wire into build.prepare pipeline

**Goal:** Add `agent.markdown-negotiation.generate` to both `build.prepare` pipelines.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts`
- In `SITES_BUILD_PREPARE_PIPELINE`: add `{ command: "agent.markdown-negotiation.generate" }` after `{ command: "page.markdown.generate" }` (line 107)
- In `SITES_BUILD_PREPARE_DEV_PIPELINE`: add `{ command: "agent.markdown-negotiation.generate" }` after the corresponding position (after `i18n.middleware.generate` or at the end of the dev pipeline, since `page.markdown.generate` is excluded from dev)

**Validation:**

- `build.prepare` pipeline includes the new command in the correct position
- Dev pipeline includes the new command (middleware is needed in dev mode for content negotiation testing)

**Completion criterion:** Both pipelines include `agent.markdown-negotiation.generate` in the correct position.

**Human review:** no

---

### Step 6. Write unit tests for resolveMarkdownTwinPath

**Goal:** Cover all edge cases of the twin path resolution function.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/agent/agent-markdown-negotiation.test.ts`
- Test cases:
  - Root path: `/` → `/index.md`
  - Simple page: `/about/` → `/about/index.md`
  - Trailing slash normalization: `/about` → `/about/index.md`
  - I18n path: `/de/preise/` → `/de/preise/index.md`
  - Nested path: `/blog/post-1/` → `/blog/post-1/index.md`
  - API route skip: `/api/agent/mcp` → `null`
  - Well-known skip: `/.well-known/agent.json` → `null`
  - Static asset skip: `/favicon.ico` → `null`, `/style.css` → `null`, `/script.js` → `null`
  - Non-GET method: middleware calls `next()` (test via mock)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` passes with new tests

**Completion criterion:** All test cases pass and cover the acceptance criteria for `resolveMarkdownTwinPath`.

**Human review:** no

---

### Step 7. Build verification and type checking

**Goal:** Verify the package compiles and all tests pass.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` (TypeScript type checking)
- Run `pnpm --filter @warpgogol/werkstatt-site run test` (vitest)
- Fix any type errors or test failures

**Validation:**

- `build:check` exits 0
- `test` exits 0

**Completion criterion:** Package compiles cleanly and all tests pass.

**Human review:** no

---

### Step 8. Runtime verification on a workpiece

**Goal:** Verify content negotiation works end-to-end on a real site.

**Agent actions:**

- Run `pnpm exec werkstatt run build.prepare --site warpgogol-com` on a workpiece
- Verify `src/middleware/markdown-negotiation.ts` was written
- Verify `src/middleware/index.ts` chains the new middleware
- Start dev server: `pnpm start` in the workpiece
- Run `curl -H "Accept: text/markdown" http://localhost:4321/about/` — verify `Content-Type: text/markdown; charset=utf-8` and `Vary: Accept` headers
- Run `curl -H "Accept: text/html" http://localhost:4321/about/` — verify HTML response (unchanged)
- Run `curl -H "Accept: text/markdown" http://localhost:4321/api/agent/mcp` — verify pass-through (not intercepted)

**Validation:**

- curl responses match expected headers and content types
- Non-page routes are not intercepted

**Completion criterion:** All curl tests pass with correct headers and content types.

**Human review:** no — but operator may want to verify isitagentready.com results after deploy

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/werkstatt-site/AGENTS.md` if the agent surface command table documentation needs the new command listed
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why (e.g. "requires deploy to verify isitagentready.com").
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0785 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0785`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0785`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0785` (RFC-0330, for probe-bearing RFCs created on or after 2026-07-07 — but RFC-0785 has commented-out acceptance probes, so this will produce no evidence file)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0785` in the subject line (RFC-0265 commit hygiene)
- No verification evidence file expected (RFC-0785 has no active acceptance probes — `rfc.verification.emit` will return `filesModified: []`)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| Performance: middleware runs on every GET request | Step 1 — fast `Accept` header string check before any fetch; pass-through to `next()` is near-zero overhead |
| Same-origin fetch recursion | Step 1 — fetch targets static `.md` asset (not a rendered page), no recursion risk; Astro Cloudflare adapter resolves via `ASSETS` binding |
| Cache poisoning | Step 1 — `Vary: Accept` always set on negotiated responses; Step 8 — curl verification confirms header presence |
| Twin path resolution edge cases | Step 6 — comprehensive unit tests for root path, i18n, trailing slash, non-page routes, static assets |
| Maintenance burden | Steps 1-5 — one new generator + one template + one index amendment, ~30 lines of middleware logic |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-57 (dev/prod egress parity), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0785 --reason "..." --invariant "DNA-57"` instead of working around it.
- If the Astro middleware API changes in a way that breaks the `defineMiddleware` pattern, create a superseding RFC rather than patching the template.
- If `page.markdown.generate` changes its output layout (e.g. from `/about/index.md` to `/about.md`), update `resolveMarkdownTwinPath` and its tests — no new RFC needed for a path layout change within the same RFC's scope.
