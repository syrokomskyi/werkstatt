---
rfcId: RFC-0791
planId: PLAN-RFC-0791-01
status: draft
owner: architecture
createdAt: 2026-08-10
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs: []
---

# Implementation Plan: RFC-0791

## 1. Objectives

- [ ] O1 — Add complementary `.well-known/` glob to `publicPaths` in `aggregate.ts` (maps to acceptance criterion 1)
- [ ] O2 — Remove manual `routePaths.add` calls for `.well-known/` routes from `aggregate.ts` (maps to acceptance criterion 2)
- [ ] O3 — `public.surface.lint` recognizes extensionless `.well-known/` files via `publicPaths` (maps to acceptance criterion 3)
- [ ] O4 — Unit tests cover extensionless file, extension file, and missing directory cases (maps to acceptance criteria 4-6)
- [ ] O5 — `rfc.validate` passes and RFC is stamped implemented (maps to acceptance criterion 7)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/public-surface/aggregate.ts` — add complementary `.well-known/` glob after `publicPaths` construction; remove manual `routePaths.add` calls at lines 173-177
- `packages/werkstatt-site/src/checks/public-surface/shared.ts` — no changes (existing `normalizePublicRelPath`, `publicPathFromRelPath`, `isPublicTextArtifact` are reused)

### 2.2 Configuration and data

No configuration or data changes.

### 2.3 Documentation and specs

- RFC file (read-only reference)
- No AGENTS.md updates needed — the change is internal to an existing command, no new modules or ownership changes
- No `docs/*.xml` Compass sync needed — no repository-wide semantics change

### 2.4 Validation and pipelines

- `public.surface.lint` already runs in `sites-check-author` pipeline — no pipeline change
- No CI workflow changes

## 3. Step sequence

### Step 1. Add complementary `.well-known/` glob to `publicPaths`

**Goal:** Extend `publicPaths` in `runPublicSurfaceLint` to include extensionless `.well-known/` files that `isPublicTextArtifact` filters out.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/public-surface/aggregate.ts`, after the `publicPaths` set is built from `isPublicTextArtifact`-filtered files (line ~155), add a complementary glob:
  ```ts
  // RFC-0791: Include extensionless .well-known/ files (e.g. api-catalog)
  // that isPublicTextArtifact filters out. Node's fs.glob returns both files
  // and directories — use stat to filter out directories.
  const wellKnownEntries = await context.io.glob(".well-known/**/*", { cwd: app.publicDirectory });
  for (const relPath of wellKnownEntries) {
    const normalized = normalizePublicRelPath(relPath);
    const stats = await stat(join(app.publicDirectory, normalized));
    if (stats.isFile()) {
      publicPaths.add(publicPathFromRelPath(normalized));
    }
  }
  ```
- Add `stat` to the existing `import { readFile } from "node:fs/promises"` line → `import { readFile, stat } from "node:fs/promises"`.
- Ensure `normalizePublicRelPath` and `publicPathFromRelPath` are already imported (they are — used in the existing `publicPaths` construction).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles

**Completion criterion:** `publicPaths` includes extensionless `.well-known/` files; `build:check` passes.

**Human review:** no

---

### Step 2. Remove manual `routePaths.add` calls for `.well-known/` routes

**Goal:** Remove the now-redundant manual route registrations.

**Agent actions:**

- Remove these lines from `aggregate.ts` (currently ~lines 173-177):
  ```ts
  routePaths.add("/.well-known/agent.json");
  // RFC-0789: agent discovery surface files linked from llms.txt.
  routePaths.add("/.well-known/api-catalog");
  routePaths.add("/.well-known/mcp/server-card.json");
  routePaths.add("/.well-known/agent.openapi.json");
  ```
- These routes are now covered by `publicPaths` via the complementary glob from Step 1.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles

**Completion criterion:** No manual `.well-known/` `routePaths.add` calls remain; `build:check` passes.

**Human review:** no

---

### Step 3. Add unit tests

**Goal:** Verify the complementary glob handles extensionless files, extension files, and missing directories.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/rfc-0791-well-known-routes.test.ts`
- Test 1: site with `public/.well-known/api-catalog` (extensionless) → no PUBTXT-07 for a link to `/.well-known/api-catalog`
- Test 2: site with `public/.well-known/agent.json` → no PUBTXT-07 (regression guard — already worked via `isPublicTextArtifact`)
- Test 3: site without `public/.well-known/` → no error, `publicPaths` unchanged
- Use the existing test pattern: `createDefaultIO()` from `@warpgogol/werkstatt/kernel`, temp directory with `src/content/system.md` (minimal frontmatter with `identity.domain`, `i18n.default`, `i18n.supported`), `public/` directory with test files
- Create a `llms.txt` in `public/` with a same-site link to `/.well-known/api-catalog` to trigger PUBTXT-07 if the route is not in `publicPaths`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass

**Completion criterion:** 3 test cases pass; extensionless `.well-known/` file no longer triggers PUBTXT-07.

**Human review:** no

---

### Step 4. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Verify acceptance criteria, run code review, stamp RFC as implemented.

**Agent actions:**

- No AGENTS.md or Compass XML updates needed — change is internal to an existing command.
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check`
- Run `pnpm --filter @warpgogol/werkstatt-site run test`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0791`
- Check off acceptance criteria in the RFC file, marking `[x]` with inline evidence.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes.
- Run fix if needed: invoke `fo-fix` if `fo-review` reported findings. Re-run `fo-review` to confirm. Max 3 iterations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0791 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0791` — passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented`.

**Human review:** no — `accepted → implemented` is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0791`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- No acceptance probes declared in RFC-0791 frontmatter — `rfc.verification.emit` not required
- Commit messages referencing `RFC-0791` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Performance — extra glob for `.well-known/` | Step 1 — single glob, directory is typically <20 files |
| Stray files in `.well-known/` enter `publicPaths` | Step 3 — test verifies behavior; stray files are harmless (only suppress PUBTXT-07 for non-existent links) |
| False negatives — unlinked files in `publicPaths` | Correct behavior per RFC — PUBTXT-07 checks link targets exist, not that all files are linked |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0791 --reason "..." --invariant "DNA-N"` instead of working around it.
