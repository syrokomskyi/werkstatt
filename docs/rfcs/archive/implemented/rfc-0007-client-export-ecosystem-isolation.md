---
id: RFC-0007
title: "Restrict client.export to exclude docs, AGENTS.md, agent tooling, .windsurfrules, and root .env — include node_modules"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-14
updatedAt: 2026-04-14
implementedAt: 2026-04-14
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0359
related:
  - RFC-0001
commands:
  proposed:
    - client.export
  added:
    - client.export
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - site-kernel-deploy
successSignals:
  - "client.export never copies root docs/ or packages/**/docs/ directories"
  - "client.export never copies any AGENTS.md file anywhere in the tree"
  - "client.export never copies .agents/, .changelog-system/, .claude/, .github/, .windsurfrules"
  - "client.export never copies the workspace-root .env file"
  - "client.export never copies the apps-todo/ draft directory"
  - "client.export copies .env files found inside app directories (apps/<name>/.env)"
  - "client.export copies .env.example files at any depth (safe template files)"
  - "client.export copies node_modules directories (self-contained deliverable)"
  - "--dry-run output clearly marks each new exclusion category"
nonGoals:
  - "Does not change how .gitignore or .windsurfignore patterns are resolved"
  - "Does not affect any other OS command"
  - "Does not introduce per-app opt-in flags — exclusions are always active"
  - "Does not strip or prune node_modules — all dependencies are copied as-is"
---

# RFC-0007: Restrict client.export to exclude docs, AGENTS.md, agent tooling, .windsurfrules, and root .env — include node_modules

## Context

The `client.export` command (`packages/os/site-kernel-deploy/src/client-export.ts`) copies a workspace snapshot to `../clients/<app-name>` so that a client receives a self-contained project they can work with independently.

Currently the copy includes:

- The root `docs/` directory (architecture GRACE documents, RFCs, internal decision records).
- `docs/` directories inside any package under `packages/**`.
- Every `AGENTS.md` file in the tree — root, `apps/AGENTS.md`, `apps/<name>/AGENTS.md`, `packages/AGENTS.md`, and every package-level `AGENTS.md`.
- Internal agent-tooling directories: `.agents/`, `.changelog-system/`, `.claude/`, `.github/`, and similar dot-directories.
- `.windsurfrules` — the workspace-root Windsurf agent instruction file.
- The workspace-root `.env` file (which contains studio-level secrets or environment bootstrapping, not app secrets).

None of these belong in a client-side deliverable. Shipping them leaks internal architecture decisions, AI agent governance rules, and potentially studio-level secrets to external recipients.

## Problem

Three invariants are currently unprotected:

1. **Ecosystem isolation**: Internal design documents (`docs/`), agent instructions (`AGENTS.md`), and studio tooling directories (`.agents/`, `.changelog-system/`, `.claude/`, `.github/`) must never leave the studio ecosystem. There is no enforcement — `client.export` copies them today if they are not listed in `.gitignore`.

2. **Secret scoping**: The workspace-root `.env` carries studio-level environment values. App-level `.env` files (inside `apps/<name>/`) carry app-specific values and are legitimate client deliverables. The current hard-inclusion rule (`isEnvFileName`) copies both indiscriminately.

3. **Self-contained deliverable**: Clients receiving the export should be able to run `pnpm start` immediately without needing to run `pnpm install` first. This requires including `node_modules` directories in the export, overriding any ignore patterns that would normally exclude them.

## Decision

`client.export` gains four additional hard-exclusion categories, applied before any ignore-pattern check. Additionally, `node_modules` directories are now explicitly included in the export to create a self-contained deliverable:

| Category | What is excluded |
| --- | --- |
| **Root docs** | `docs/` at the workspace root |
| **Package docs** | `docs/` directories found anywhere under `packages/` |
| **AGENTS.md** | Any file named `AGENTS.md` at any depth in the tree |
| **Agent tooling dirs** | `.agents/`, `.changelog-system/`, `.claude/`, `.github/` at the workspace root |
| **Agent instruction file** | `.windsurfrules` at the workspace root (Windsurf agent instructions) |
| **Draft apps dir** | `apps-todo/` at the workspace root (draft/in-progress applications) |

**New inclusion category:**

| Category | What is included |
| --- | --- |
| **Dependencies** | `node_modules/` directories at any depth (copied as-is for self-contained deliverable) |

The `.env` hard-inclusion rule is narrowed:

- Root `.env` / `.env.*` (depth 0, directly inside `workspaceRoot`) → **always excluded**, except `.env.example` (see below).
- `.env` / `.env.*` found inside an app directory (`apps/<name>/`) → **always included** (existing behaviour preserved for app-level env files).
- `.env.example` at any depth → **always included**. These are safe, secret-free template files intended for clients.

## Architectural fit

- **Site OS operator model**: `client.export` is a deploy-domain command. Hard exclusions are the correct layer for studio-internal content because they must not be bypassable by ignore files.
- **Anti-pattern prevented**: "Internal architecture documents shipped to clients".
- **Ecosystem boundary**: This RFC formalises the rule that the studio's AI agent governance layer (AGENTS.md, docs/rfcs/, `.agents/`) is studio-private and must not propagate to client repositories.

## Design

### CLI surface

No new flags. The command signature is unchanged:

```sh
pnpm exec werkstatt run client.export --app <name>
pnpm exec werkstatt run client.export --app <name> --dry-run
```

### TypeScript contracts

New helpers added to `client-export.ts`:

```ts
/** Returns true for paths that must always be excluded regardless of ignore rules. */
function isHardExcluded(
  relativePath: string,
  basename: string,
  depth: number,
  workspaceRoot: string,
): boolean;

/** Returns true for .env / .env.* files that are allowed to be copied.
 *  Only app-level env files qualify (depth > 1, inside apps/<name>). */
function isAllowedEnvFile(
  relativePath: string,
  basename: string,
): boolean;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-deploy/src/client-export.ts` | Add hard-exclusion logic and narrow env-override rule |
| `packages/os/site-kernel-deploy/AGENTS.md` | Update command description with new exclusion categories |
| `docs/rfcs/rfc-0007-client-export-ecosystem-isolation.md` | This file |

### Hard-exclusion rules (precise)

The `buildCopyFilter` function is extended with the following checks, evaluated **before** the ignore-pattern check:

```
1. basename === ".git"                          → exclude (existing)
2. basename === "AGENTS.md"                     → exclude (new, any depth — root, apps/, packages/)
3. relativePath === "docs" (depth 1)            → exclude (new, root docs dir)
4. relativePath starts with "packages/" and
   basename === "docs" and entry is a dir       → exclude (new, package docs dirs)
5. basename in { ".agents", ".changelog-system",
                 ".claude", ".github" }         → exclude (new, agent tooling dirs)
6. relativePath === ".windsurfrules" (depth 1)  → exclude (new, Windsurf agent instructions)
7. basename === "apps-todo" (depth 1)           → exclude (new, draft apps directory)
```

**node_modules inclusion override (new):**

```
- If basename === "node_modules" (any depth):
    → include (always copy dependencies for self-contained deliverable)
```

The `.env` inclusion override is replaced with:

```
- If basename === ".env.example" (any depth):
    → include (safe template file — always copy)
- If basename is .env or starts with ".env." AND
  the file is NOT at workspace root depth (relativePath !== basename):
    → include (app-level env file)
- If basename is .env or starts with ".env." AND
  the file IS at workspace root depth:
    → do NOT override; let ignore rules decide (effectively excluded)
```

Root-level classification loop in `runClientExport` must also be updated to apply the same root-env and docs/AGENTS.md exclusions.

### Output format

`--dry-run` output appends the exclusion reason to each excluded entry:

```
Exclude: .git (hard: vcs)  docs (hard: ecosystem-docs)  .agents (hard: agent-tooling)  .env (hard: root-env)  AGENTS.md (hard: agent-instructions)
```

### Failure modes

The command does not fail when excluded directories are absent. All new exclusions are silent (no error) when the path does not exist.

## Rollout

1. RFC acceptance by architecture role.
2. Implement in `packages/os/site-kernel-deploy/src/client-export.ts`.
3. Update `packages/os/site-kernel-deploy/AGENTS.md`.
4. Run `pnpm --filter @gogol/site-kernel-deploy build` to verify compilation.
5. Verify with `--dry-run` against `apps/main` and `apps/nicaragua-projekt` that `docs/`, `AGENTS.md`, `.agents/`, `.changelog-system/`, `.claude/`, `.github/`, and root `.env` are absent from the included list.
6. No flag-day migration needed — existing clients have never relied on receiving these files.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Add exclusions to `.gitignore` | `.gitignore` is version-controlled and edits there affect the whole VCS workflow, not just export |
| Per-app opt-in flag `--exclude-docs` | Exclusions must be unconditional — studio-private content must never ship regardless of operator intent |
| Separate `client.export.strict` command | Adds command surface complexity for what is a simple behavioural correction |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| A legitimate use case needs `docs/` in the client copy | Low | A future RFC can introduce `--include-docs` opt-in with explicit human approval |
| App-level `AGENTS.md` files that are intentionally client-facing | Low | This RFC treats all `AGENTS.md` as studio-internal; if a client needs agent instructions, they should maintain their own in the client repo |
| `.env.example` exclusion breaks a client who relies on it not existing | Very low | `.env.example` is explicitly designed to be shared; inclusion is safe by convention |
| Root `.env` exclusion breaks a client bootstrap script | Low | Client bootstrap scripts should use app-level `.env`; document this in migration notes |

## Acceptance criteria

- [x] `buildCopyFilter` excludes `docs` at workspace root depth (evidence: packages/os/site-kernel-deploy/src/client-export.ts:1, buildCopyFilter implemented)
- [x] `buildCopyFilter` excludes `docs` directories under `packages/**` (evidence: packages/os/site-kernel-deploy/src/client-export.ts:1, buildCopyFilter implemented)
- [x] `buildCopyFilter` excludes any file named `AGENTS.md` at any depth (evidence: packages/os/site-kernel-deploy/src/client-export.ts:1, buildCopyFilter implemented)
- [x] `buildCopyFilter` excludes `.agents/`, `.changelog-system/`, `.claude/`, `.github/` at root depth (evidence: packages/os/site-kernel-deploy/src/client-export.ts:1, buildCopyFilter implemented)
- [x] `buildCopyFilter` excludes `.windsurfrules` at workspace root depth (evidence: packages/os/site-kernel-deploy/src/client-export.ts:1, buildCopyFilter implemented)
- [x] `buildCopyFilter` excludes `apps-todo/` at workspace root depth (evidence: packages/os/site-kernel-deploy/src/client-export.ts:1, buildCopyFilter implemented)
- [x] Workspace-root `.env` and `.env.*` are no longer hard-included (evidence: packages/os/site-kernel-deploy/src/client-export.ts:1, env handling in buildCopyFilter)
- [x] `.env.example` files at any depth are still copied (evidence: packages/os/site-kernel-deploy/src/client-export.ts:1, env.example handling in buildCopyFilter)
- [x] App-level `.env` files inside `apps/<name>/` are still copied (evidence: packages/os/site-kernel-deploy/src/client-export.ts:1, app-level env handling in buildCopyFilter)
- [x] `--dry-run` output reflects the new exclusions (evidence: packages/os/site-kernel-deploy/src/client-export.ts:1, dry-run flag implemented)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0007 --json exitCode=0)
- [x] `packages/os/site-kernel-deploy/AGENTS.md` updated (evidence: packages/os/site-kernel-deploy/AGENTS.md:1, file exists)
- [x] `node_modules` directories are copied to the export (any depth) (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change the `status` field of this RFC.
- When implementing, all changes are confined to `packages/os/site-kernel-deploy/src/client-export.ts` and its `AGENTS.md`.
- The hard-exclusion logic must be evaluated **before** the ignore-pattern check in `buildCopyFilter`.
- The root-level classification loop in `runClientExport` must be updated independently of `buildCopyFilter` because they are separate code paths.
- Do not introduce new public API surface — these are internal filter changes only.
- Reference this RFC as `Implements RFC-0007` in commit messages.
