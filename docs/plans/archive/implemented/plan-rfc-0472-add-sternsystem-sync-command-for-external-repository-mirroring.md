---
rfcId: RFC-0472
planId: PLAN-RFC-0472-01
status: draft
owner: architecture
createdAt: 2026-07-20
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/ontology"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/COMMANDS.md
    - AGENTS.md
    - systems/registry.yaml
---

# Implementation Plan: RFC-0472

## 1. Objectives

- [ ] O1 — Add `mirror` optional field to `fleetRegistryEntrySchema` — maps to acceptance criterion [mirror field added]
- [ ] O2 — Add `mirror-sync` to `bordbuchEntryKindSchema` — maps to acceptance criterion [mirror-sync added]
- [ ] O3 — Implement `sternsystem.sync` command with `--id`, `--direction`, `--all` flags — maps to acceptance criteria [command implemented, registered, JSON output]
- [ ] O4 — Extend `sternsystem.validate` with mirror remote warning + credential warning — maps to acceptance criteria [validate warnings]
- [ ] O5 — Add `--mirror` optional flag to `sternsystem.register` — maps to acceptance criterion [register supports --mirror]
- [ ] O6 — Update documentation: DNA-45, COMMANDS.md, AGENTS.md, registry.yaml — maps to acceptance criteria [DNA-45 updated, COMMANDS.md, AGENTS.md, registry.yaml]
- [ ] O7 — Validate: `rfc.validate`, `build:check` for both packages — maps to acceptance criteria [validate passes, build:check passes]

## 2. Affected artifacts

### 2.1 Code and commands

| File | Change |
| --- | --- |
| `packages/ontology/src/operations/sternsystem.ts` | Add `mirror` optional field to `fleetRegistryEntrySchema` |
| `packages/ontology/src/operations/mission.ts` | Add `"mirror-sync"` to `bordbuchEntryKindSchema` enum |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts` | New file: `runSternsystemSync` command handler |
| `packages/os/site-kernel-handoff/src/sternsystem/index.ts` | Register `sternsystem.sync` command, export `runSternsystemSync` + `SternsystemSyncData` |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts` | Add mirror remote check + credential URL check |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts` | Add `--mirror` optional flag, include `mirror` in entry construction |

### 2.2 Configuration and data

| File | Change |
| --- | --- |
| `systems/registry.yaml` | Add `mirror: git@github.com:syrokomskyi/warpgogol-com.git` to `warpgogol-com` entry |

### 2.3 Documentation and specs

| File | Change |
| --- | --- |
| `docs/architecture-dna.md` | Update DNA-45 prose to include `mirror` in field list |
| `docs/COMMANDS.md` | Add `sternsystem.sync` row to command table |
| `AGENTS.md` | Add agent guidance: recommend `sternsystem.sync` after `mission.reconcile` when `mirror` is configured; sync is manual |

### 2.4 Validation and pipelines

No pipeline integration. `sternsystem.sync` is standalone. Validation:

- `pnpm exec site-kernel run rfc.validate RFC-0472`
- `pnpm --filter @gogol/ontology build:check`
- `pnpm --filter @gogol/site-kernel-handoff build:check`

## 3. Step sequence

### Step 1. Add `mirror` field to fleet registry schema

**Goal:** Extend `fleetRegistryEntrySchema` with optional `mirror` string field.

**Agent actions:**

- Edit `packages/ontology/src/operations/sternsystem.ts`: add `mirror: z.string().regex(repoRe, "mirror must be a valid git URL (SSH, HTTPS) or local file path").optional()` to `fleetRegistryEntrySchema`
- The `repoRe` regex is already defined at line 25 — reuse it

**Validation:**

- `pnpm --filter @gogol/ontology build:check`

**Completion criterion:** `fleetRegistryEntrySchema` includes optional `mirror` field; `build:check` passes.

**Human review:** no

---

### Step 2. Add `mirror-sync` to Bordbuch kind enum

**Goal:** Extend `bordbuchEntryKindSchema` with `"mirror-sync"` value.

**Agent actions:**

- Edit `packages/ontology/src/operations/mission.ts`: add `"mirror-sync"` to `bordbuchEntryKindSchema` enum array (line 39-50)

**Validation:**

- `pnpm --filter @gogol/ontology build:check`

**Completion criterion:** `bordbuchEntryKindSchema` includes `"mirror-sync"`; `build:check` passes.

**Human review:** no

---

### Step 3. Implement `sternsystem.sync` command handler

**Goal:** Create the command handler that syncs the local bare repo with the external mirror.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts`
- Implement `runSternsystemSync(input, context)` with:
  - Read `--id`, `--direction` (default `push`), `--all` flags
  - Read registry, find entry by id
  - Resolve bare repo path from `repo` field (same logic as `syncCacheClone` in `mission-materialize.ts:269-271`)
  - Check `mirror` field exists; error if absent
  - Check bare repo exists; error if not found
  - Check bare repo has commits; error if empty
  - Ensure `mirror` remote exists in bare repo: `git remote get-url mirror` → if missing, `git remote add mirror <url>`; if URL mismatch, `git remote set-url mirror <url>`
  - Determine branch: `git symbolic-ref HEAD` for current branch, or `*` for `--all`
  - Execute sync based on direction:
    - `push`: `git push mirror <branch>` (or `git push mirror --all` + `git push mirror --tags` for `--all`)
    - `pull`: `git fetch mirror <branch>` (or `git fetch mirror --all` for `--all`)
    - `both`: push then pull
  - Get commit SHA: `git rev-parse HEAD`
  - Append Bordbuch entry: kind `mirror-sync`, writerRole `sternsystem`, metadata: `mirrorUrl`, `direction`, `branch`, `commitSha`, `result`
  - Return `SternsystemSyncData` with `--json` output shape per RFC
- Export `SternsystemSyncData` interface and `runSternsystemSync` function
- Use `execSync` for git operations (consistent with `mission-materialization-commands.ts:475-484`)
- Use `appendBordbuchEntry` from `../bordbuch/bordbuch-io.ts` for Bordbuch writing
- Use `readRegistry`, `findEntry` from `./registry-io.ts` for registry access

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`

**Completion criterion:** `sternsystem-sync.ts` compiles; `runSternsystemSync` is exported; `build:check` passes.

**Human review:** no

---

### Step 4. Register `sternsystem.sync` command in module

**Goal:** Wire the command into the kernel module registry.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/sternsystem/index.ts`:
  - Import `runSternsystemSync` and `SternsystemSyncData` from `./sternsystem-sync.ts`
  - Add export: `export { runSternsystemSync, type SternsystemSyncData } from "./sternsystem-sync.ts"`
  - Register command in `register()`:
    - `name: "sternsystem.sync"`
    - `description: "Synchronize a Sternsystem's local bare repo with an external mirror (RFC-0472). Flags: --id, [--direction push|pull|both], [--all]."`
    - `scope: "workspace"`
    - `supportsAllSites: false`
    - `mutatesState: true`
    - `flags: { id: { kind: "string", required: true }, direction: { kind: "string" }, all: { kind: "boolean" } }`
    - `writes: ["systems/{id}/bordbuch/events.ndjson"]`
    - `execute: runSternsystemSync`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`

**Completion criterion:** Command registered with correct name, flags, scope; `build:check` passes.

**Human review:** no

---

### Step 5. Extend `sternsystem.validate` with mirror warnings

**Goal:** Add mirror remote consistency and credential URL warnings to the validate command.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts`:
  - After the pin validation block (around line 195), add mirror checks:
    - If `entry.mirror` is set and bare repo exists at `repo` path:
      - Run `git remote get-url mirror` in bare repo dir
      - If remote missing: warning `mirror-remote-missing` — "mirror remote not configured in bare repo"
      - If URL mismatch: warning `mirror-remote-mismatch` — "mirror remote URL '<actual>' does not match registry mirror '<expected>'"
    - If `entry.mirror` is set and URL matches `https://[^:]+:[^@]+@` pattern: warning `mirror-credentials` — "mirror URL contains embedded credentials, use SSH URL instead"
  - Warnings are added to `violations` array with appropriate `rule` names
  - Mirror warnings do not affect exit code (warning severity, not error) — or use a separate warnings array if the current structure only has violations

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`

**Completion criterion:** `sternsystem.validate` produces warnings for missing/mismatched mirror remote and credential URLs; `build:check` passes.

**Human review:** no

---

### Step 6. Add `--mirror` flag to `sternsystem.register`

**Goal:** Allow setting `mirror` during system registration.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts`:
  - Add `const mirror = flagString(input, "mirror")` after line 47
  - Add `mirror` to the entry object (line 78-88): `mirror: mirror ?? undefined`
  - Add `--mirror` flag to the command registration in `index.ts`:
    - `mirror: { kind: "string", description: "External mirror repository URL (optional)." }`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`

**Completion criterion:** `sternsystem.register --mirror <url>` sets the `mirror` field in registry; `build:check` passes.

**Human review:** no

---

### Step 7. Add `mirror` to `warpgogol-com` in registry.yaml

**Goal:** Configure the mirror for the existing system.

**Agent actions:**

- Edit `systems/registry.yaml`: add `mirror: git@github.com:syrokomskyi/warpgogol-com.git` after the `repo` line in the `warpgogol-com` entry

**Validation:**

- `pnpm exec site-kernel run sternsystem.validate --id warpgogol-com --json`

**Completion criterion:** `warpgogol-com` entry has `mirror` field; `sternsystem.validate` passes (may show mirror-remote-missing warning if remote not yet configured — that's expected).

**Human review:** no

---

### Step 8. Update DNA-45 prose in architecture-dna.md

**Goal:** Include `mirror` in the DNA-45 field list.

**Agent actions:**

- Edit `docs/architecture-dna.md` line 197: add `mirror` to the field list: "Each entry carries: `id`, `cosmicStar`, `repo`, `mirror`, `pinnedPlatform`, ..."

**Validation:**

- Visual inspection

**Completion criterion:** DNA-45 prose includes `mirror` in the field list.

**Human review:** no

---

### Step 9. Update COMMANDS.md

**Goal:** Document the new command in the command table.

**Agent actions:**

- Edit `docs/COMMANDS.md`: add row for `sternsystem.sync` with scope, flags, description

**Validation:**

- Visual inspection

**Completion criterion:** `sternsystem.sync` appears in the COMMANDS.md table.

**Human review:** no

---

### Step 10. Update AGENTS.md

**Goal:** Add agent guidance for mirror sync.

**Agent actions:**

- Edit root `AGENTS.md`: add a note in the Sternsystem section that `sternsystem.sync` is available for external mirror synchronization, is manual (not automated after `mission.reconcile`), and agents MAY recommend it when `mirror` is configured

**Validation:**

- Visual inspection

**Completion criterion:** AGENTS.md mentions `sternsystem.sync` and its manual nature.

**Human review:** no

---

### Step 11. Final validation

**Goal:** Run all validation checks.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0472 --json`
- Run `pnpm --filter @gogol/ontology build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff build:check`

**Validation:**

- All three commands pass

**Completion criterion:** `rfc.validate` passes, both `build:check` pass.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0472`
- `pnpm --filter @gogol/ontology build:check`
- `pnpm --filter @gogol/site-kernel-handoff build:check`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0472` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Operator forgets to run `sternsystem.sync` after `mission.reconcile` | Step 10: AGENTS.md instructs agents to recommend sync |
| SSH key not configured for GitHub | Step 3: fail-fast with git stderr |
| Mirror URL changes | Step 5: `sternsystem.validate` warns on URL mismatch |
| Agent runs sync automatically | Step 10: AGENTS.md states sync is manual |
| `bordbuchEntryKindSchema` enum extension breaks validators | Step 2: adding enum value is backward-compatible |
| Bare repo path resolution fails | Step 3: reuses same `repo` path resolution as `syncCacheClone` |
| `mirror` URL contains embedded credentials | Step 5: `sternsystem.validate` warns on credential URLs |
| Empty bare repo | Step 3: fail-fast with "no commits" error |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44 or DNA-45, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0472 --reason "..." --invariant "DNA-N"` instead of working around it.
