---
rfcId: RFC-0555
planId: PLAN-RFC-0555-01
status: draft
owner: architecture
createdAt: 2026-07-27
updatedAt:
scope:
  apps: []
  packages:
    - studio-gate
    - os/site-kernel-handoff
    - os/site-kernel-content
    - warpgogol-skills
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/source-markup.xml
    - docs/ecosystem.generated.yaml
    - packages/AGENTS.md
---

# Implementation Plan: RFC-0555

## 1. Objectives

- [ ] O1 — `workpiece.read` Site OS command registered in `site-kernel-handoff` with DNA-22 path validation — maps to AC[1,3,4]
- [ ] O2 — `workpiece.write` Site OS command registered in `site-kernel-handoff` with DNA-22 path validation, stdin content, no auto-commit — maps to AC[2,3,4]
- [ ] O3 — `packages/studio-gate` MCP server package created with 12 tools via stdio transport — maps to AC[5,6]
- [ ] O4 — `wg-site-content-edit` skill created in wg skill pack and injected as `serverInfo.instructions` — maps to AC[7,8]
- [ ] O5 — DNA-56 entry in `docs/architecture-dna.md` includes `mission.abort` — maps to AC[9]
- [ ] O6 — Documentation sync: `packages/AGENTS.md` ownership table, Compass XML, ecosystem manifest — maps to AC[10]
- [ ] O7 — End-to-end validation: `build:check` passes for both packages, `rfc.validate` passes — maps to AC[11,12,13]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/workpiece/workpiece-read.ts` — new command implementation
- `packages/os/site-kernel-handoff/src/workpiece/workpiece-write.ts` — new command implementation
- `packages/os/site-kernel-handoff/src/workpiece/dna-22-checker.ts` — shared DNA-22 path validation (uses `loadSystemManifest` from `@warpgogol/site-kernel-content`)
- `packages/os/site-kernel-handoff/src/workpiece/index.ts` — barrel export
- `packages/os/site-kernel-handoff/src/mission/mission.module.ts` — register `workpiece.read` and `workpiece.write` commands
- `packages/os/site-kernel-handoff/src/index.ts` — re-export workpiece commands
- `packages/os/site-kernel-handoff/src/tests/workpiece-read.test.ts` — unit tests
- `packages/os/site-kernel-handoff/src/tests/workpiece-write.test.ts` — unit tests
- `packages/os/site-kernel-handoff/src/tests/dna-22-checker.test.ts` — unit tests for path validation
- `packages/studio-gate/package.json` — new package manifest
- `packages/studio-gate/tsconfig.json` — TypeScript config
- `packages/studio-gate/turbo.json` — Turborepo config
- `packages/studio-gate/src/index.ts` — MCP server entrypoint (stdio transport, WERKSTATT_ROOT)
- `packages/studio-gate/src/tools.ts` — 12 tool definitions and schemas
- `packages/studio-gate/src/executor.ts` — command execution via child_process
- `packages/studio-gate/src/dna-22-checker.ts` — re-export from site-kernel-handoff (or inline)
- `packages/studio-gate/AGENTS.md` — package-level agent guide
- `packages/warpgogol-skills/skills/wg-site-content-edit/SKILL.md` — process layer skill
- `tools/kernel.config.ts` — no change needed (mission module already registered; workpiece commands register in mission module)
- `pnpm-workspace.yaml` — no change needed (packages/* glob already covers studio-gate)

### 2.2 Configuration and data

- No YAML/JSON/NDJSON changes.
- No `system.md` changes — `clientEditable[]` is read, not modified.
- No ontology catalog changes.

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — DNA-56 already exists; verify `mission.abort` is included (done in enhance step)
- `docs/source-markup.xml` — add new source files in `packages/studio-gate/` and `packages/os/site-kernel-handoff/src/workpiece/`
- `docs/ecosystem.generated.yaml` — regenerated via `ecosystem.manifest.generate`
- `packages/AGENTS.md` — add `studio-gate` to ownership table
- `packages/studio-gate/AGENTS.md` — new package-level agent guide

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — unit tests
- `pnpm --filter @warpgogol/studio-gate run build:check` — typecheck
- `pnpm exec site-kernel run rfc.validate RFC-0555 --json` — RFC validation
- `pnpm exec site-kernel run ecosystem.manifest.generate` — ecosystem manifest update
- No new pipeline checks needed — `workpiece.read`/`write` are runtime commands, not build-time validators

## 3. Step sequence

### Step 1. DNA-22 path validation shared module

**Goal:** Create the shared DNA-22 path validation function used by both `workpiece.read` and `workpiece.write`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/workpiece/dna-22-checker.ts`
- Implement `isClientEditable(workpieceRoot: string, relativePath: string): Promise<boolean>`:
  - Load `system.md` via `loadSystemManifest()` from `@warpgogol/site-kernel-content`
  - Parse `clientEditable[]` from the manifest
  - Resolve `path.resolve(workpieceRoot, relativePath)` and verify it starts with `workpieceRoot` (traversal check)
  - Pattern-match `relativePath` against `clientEditable[]` entries (same glob logic as `client.edit.validate` in `packages/os/site-kernel-checks/src/client-edit.ts`)
  - Return `true` if matched, `false` otherwise
- Export `ClientEditableChecker` interface and `createClientEditableChecker` factory

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `dna-22-checker.ts` exists, exports `isClientEditable`, and typecheck passes.

**Human review:** no

---

### Step 2. `workpiece.read` command

**Goal:** Implement the `workpiece.read` Site OS command.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/workpiece/workpiece-read.ts`
- Implement `runWorkpieceRead(input, context)`:
  - Resolve mission workpiece root from `--mission` flag (find mission in `missions/<id>/workpiece/`)
  - Validate mission is open (check mission manifest status)
  - Resolve and traversal-check `--path` against workpiece root
  - Call `isClientEditable(workpieceRoot, relativePath)` — reject if `false` with `Path '<path>' is outside client-editable surface (DNA-22)`
  - Read file content via `fs.readFile`
  - Return `{ path, content }` as JSON
- Create `packages/os/site-kernel-handoff/src/workpiece/index.ts` barrel export
- Re-export from `packages/os/site-kernel-handoff/src/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `workpiece-read.ts` exists, exports `runWorkpieceRead`, and typecheck passes.

**Human review:** no

---

### Step 3. `workpiece.write` command

**Goal:** Implement the `workpiece.write` Site OS command with stdin content.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/workpiece/workpiece-write.ts`
- Implement `runWorkpieceWrite(input, context)`:
  - Resolve mission workpiece root from `--mission` flag
  - Validate mission is open
  - Resolve and traversal-check `--path` against workpiece root
  - Call `isClientEditable(workpieceRoot, relativePath)` — reject if `false`
  - Read content from stdin (not a CLI flag) via `process.stdin`
  - Write file via `fs.writeFile` (atomic at OS level)
  - Return `{ path, bytesWritten }` as JSON
  - Does NOT auto-commit — LLM must call `mission.git.commit` separately
- Re-export from barrel and package index

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `workpiece-write.ts` exists, exports `runWorkpieceWrite`, reads from stdin, and typecheck passes.

**Human review:** no

---

### Step 4. Register workpiece commands in mission module

**Goal:** Register `workpiece.read` and `workpiece.write` in the mission module so they are available via `site-kernel run`.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/mission/mission.module.ts`:
  - Add `workpiece.read` command registration: `scope: "workspace"`, `flags: { mission: string, path: string }`, `reads: ["missions/{mission}/workpiece/**"]`
  - Add `workpiece.write` command registration: `scope: "workspace"`, `mutatesState: true`, `flags: { mission: string, path: string, stdin: boolean }`, `writes: ["missions/{mission}/workpiece/**"]`
- Verify dynamic import wiring is consistent with existing mission commands

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes
- `pnpm exec site-kernel run workpiece.read --help` shows the command (if `--help` is supported, otherwise verify via `command.manifest.generate`)

**Completion criterion:** Both commands appear in the command manifest and are callable via `site-kernel run`.

**Human review:** no

---

### Step 5. Unit tests for workpiece commands

**Goal:** Write unit tests covering DNA-22 enforcement, traversal rejection, and happy path.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/dna-22-checker.test.ts`:
  - Test: path inside `clientEditable[]` → `true`
  - Test: path outside `clientEditable[]` → `false`
  - Test: path traversal `../../packages/` → `false`
  - Test: `system.md` not found → throws
- Create `packages/os/site-kernel-handoff/src/tests/workpiece-read.test.ts`:
  - Test: read file inside clientEditable → returns content
  - Test: read file outside clientEditable → rejects with DNA-22 error
  - Test: path traversal → rejects
  - Test: mission not open → rejects
  - Test: workpiece not materialized → rejects
- Create `packages/os/site-kernel-handoff/src/tests/workpiece-write.test.ts`:
  - Test: write file inside clientEditable via stdin → writes and returns bytesWritten
  - Test: write file outside clientEditable → rejects with DNA-22 error
  - Test: path traversal → rejects
  - Test: no auto-commit (verify git status is dirty after write)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` passes

**Completion criterion:** All tests pass and cover the acceptance criteria for DNA-22 enforcement and traversal rejection.

**Human review:** no

---

### Step 6. Create `packages/studio-gate` MCP server

**Goal:** Create the new `packages/studio-gate` package with the stdio MCP server.

**Agent actions:**

- Create `packages/studio-gate/package.json`:
  - `name: "@warpgogol/studio-gate"`, `private: true`, `type: "module"`
  - `dependencies`: `@modelcontextprotocol/sdk` (>=1.0.0), `@warpgogol/site-kernel-handoff` (workspace:*), `@warpgogol/site-kernel-content` (workspace:*)
  - `devDependencies`: `vitest`, `fast-check`, `typescript`
  - `scripts`: `build`, `build:check`, `test`, `start` (entrypoint)
- Create `packages/studio-gate/tsconfig.json` (extend `tsconfig/base.json`)
- Create `packages/studio-gate/turbo.json`
- Create `packages/studio-gate/src/index.ts`:
  - Read `WERKSTATT_ROOT` env var (fallback to `process.cwd()`)
  - Read `wg-site-content-edit` SKILL.md from `packages/warpgogol-skills/skills/wg-site-content-edit/SKILL.md`
  - Create MCP `Server` with `serverInfo.instructions`
  - Register `tools/list` and `tools/call` handlers
- Create `packages/studio-gate/src/tools.ts`:
  - Define 12 tool schemas: `workpiece.read`, `workpiece.write`, `mission.open`, `mission.materialize`, `mission.git.commit`, `mission.validate`, `mission.reconcile`, `mission.close`, `mission.abort`, `release.prepare`, `release.publish`, `leitstand.propagate`
  - Each tool has `name`, `description`, `inputSchema` (JSON Schema)
- Create `packages/studio-gate/src/executor.ts`:
  - `executeCommand(command: string, args: string[], options: { cwd: string, stdin?: string }): Promise<{ stdout: string, stderr: string, exitCode: number }>`
  - Uses `child_process.execFile` with `cwd: werkstattRoot`
  - For `workpiece.write`, passes content via stdin

**Validation:**

- `pnpm --filter @warpgogol/studio-gate run build:check` passes
- `pnpm install` resolves workspace dependencies

**Completion criterion:** Package builds, typecheck passes, MCP server entrypoint exists with 12 tool definitions.

**Human review:** no

---

### Step 7. Create `wg-site-content-edit` skill

**Goal:** Create the process layer skill that guides LLMs through the mission lifecycle for content editing.

**Agent actions:**

- Create `packages/warpgogol-skills/skills/wg-site-content-edit/SKILL.md`:
  - Frontmatter: `name: wg-site-content-edit`, `description`, `invocation: mcp`, `category: wg`, `concerns: content-mutation`, `languagePolicy: ref(PREFERENCES.md)`
  - Process section: define the mission lifecycle sequence (open → materialize → read → write → commit → validate → release.prepare → leitstand.propagate alt → approve → release.publish → leitstand.propagate main → reconcile → close)
  - Boundaries: DNA-22 client-editable surface, no direct filesystem access, no auto-commit
  - Error handling: what to do when `workpiece.write` rejects (path outside DNA-22, mission not open, workpiece not materialized)

**Validation:**

- Skill file exists at the expected path
- Studio-gate MCP server can read it at startup

**Completion criterion:** `SKILL.md` exists with process instructions covering the full mission lifecycle.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Update all documentation artifacts affected by the new package and commands.

**Agent actions:**

- Create `packages/studio-gate/AGENTS.md`:
  - Package role: stdio MCP server for site owner content editing
  - Boundaries: stdio only (no HTTP), no direct filesystem access, proxies to Site OS commands
  - Transport contract: MCP stdio, `WERKSTATT_ROOT` env var
- Update `packages/AGENTS.md`:
  - Add `studio-gate` row to ownership table: `stdio MCP server for site owner content editing with mission lifecycle (RFC-0555). Projects workpiece.read/write and mission lifecycle commands as MCP tools. WERKSTATT_ROOT env var resolves workspace root.`
- Update `docs/source-markup.xml`:
  - Add source file entries for `packages/studio-gate/src/*.ts` and `packages/os/site-kernel-handoff/src/workpiece/*.ts`
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` to update `docs/ecosystem.generated.yaml`
- Verify `docs/architecture-dna.md` DNA-56 includes `mission.abort` (already done in enhance step)

**Validation:**

- `git diff` shows all scope.docs files updated
- `pnpm exec site-kernel run ecosystem.manifest.validate` passes

**Completion criterion:** All documentation artifacts in scope are updated; ecosystem manifest is regenerated.

**Human review:** no

---

### Step 9. Integration test — end-to-end mission lifecycle via MCP

**Goal:** Verify the operator can connect an MCP client and perform a content edit through the full mission lifecycle.

**Agent actions:**

- Write a manual test script or integration test that:
  1. Starts the studio-gate MCP server
  2. Calls `mission.open` via MCP `tools/call`
  3. Calls `mission.materialize`
  4. Calls `workpiece.read` on a client-editable file
  5. Calls `workpiece.write` with modified content via stdin
  6. Calls `mission.git.commit`
  7. Calls `mission.validate`
  8. Calls `mission.close` (or `mission.abort` for cleanup)
- If a full integration test is not feasible in the current environment, document the manual test procedure and verify each command individually via `site-kernel run`

**Validation:**

- Each command in the sequence succeeds
- `workpiece.write` rejects paths outside `clientEditable[]`
- `workpiece.write` rejects path traversal

**Completion criterion:** End-to-end lifecycle completes successfully (or individual commands verified with documented manual procedure).

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files (root, packages/) with new modules, commands, or ownership changes.
- Update affected `docs/*.xml` Compass files (source-markup) when repository-wide semantics changed.
- Update `docs/architecture-dna.md` if a new DNA invariant was introduced (DNA-56 already exists).
- **Verify every file listed in `scope.docs` is updated** — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (do not hand-edit `docs/ecosystem.generated.yaml`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why (e.g. "requires runtime command blocked by environment").
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0555 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). The command validates all preconditions (status, criteria, clean tree, commit reachability). Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields — use the command.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0555`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0555`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm --filter @warpgogol/studio-gate run build:check`
- `pnpm exec site-kernel run ecosystem.manifest.validate`
- `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0555 --implementation-commit <sha>`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0555.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0555` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| DNA-22 path validation false positives | Step 1 uses `loadSystemManifest` (system.md) and shares glob logic with `client.edit.validate` |
| LLM confusion from tool count (12 tools) | Step 7 skill provides process layer as `serverInfo.instructions` |
| Command execution latency | Acceptable for content editing; no hot-path optimization needed |
| MCP SDK dependency | Step 6 pins `@modelcontextprotocol/sdk` >=1.0.0 in `package.json` |
| Agent misinterpretation (skip mission.open) | Step 2/3 commands reject with clear error if mission not open or workpiece not materialized |
| Path traversal attacks | Step 1 `dna-22-checker.ts` resolves and verifies path before any file I/O |
| No auto-commit means dirty workpiece | `mission.validate` warns; `mission.reconcile`/`mission.close` block if dirty; skill reminds LLM |
| `--content` shell argument length limit | Step 3 uses stdin instead of CLI flag |
| WERKSTATT_ROOT not set | Step 6 logs warning on startup; falls back to `process.cwd()` |
| Concurrent MCP tool calls | stdio transport is sequential; `mission.git.commit` is atomicity boundary |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-22 (e.g. `clientEditable[]` pattern matching cannot be shared between `client.edit.validate` and `workpiece.read`/`write`), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0555 --reason "..." --invariant "DNA-22"` instead of working around it.
- If `@modelcontextprotocol/sdk` >=1.0.0 does not support `serverInfo.instructions` as expected, document the SDK version constraint and adjust the implementation to use the supported API surface.
- If `loadSystemManifest` from `@warpgogol/site-kernel-content` cannot be used in the workpiece context (e.g. workpiece `system.md` has a different structure), create a shared loader function in `packages/os/site-kernel-content` instead of duplicating the parsing logic.
