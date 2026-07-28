---
rfcId: RFC-0360
planId: PLAN-RFC-0360-01
status: draft
owner: architecture
createdAt: 2026-07-09
updatedAt: 2026-07-09
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - "packages/os/site-kernel-checks/README.md"
    - "packages/os/site-kernel-checks/AGENTS.md"
    - "packages/os/site-kernel-checks/docs/check-module-guide.md"
---

# Implementation Plan: RFC-0360

## Notes

- **Pilot plan.** RFC-0360 is currently `status: draft`. This plan describes the implementation path but requires explicit architecture acceptance of the RFC before any code changes are executed.
- **RFC amendment completed during planning:** the narrow `Dockerfile`/`Caddyfile` tool-mandated exemption was added to RFC-0360 so that the extended lint does not flag standard service deployment files. The kebab-case invariant (DNA-6) itself is unchanged.

## 1. Objectives

- [ ] Replace the hard-coded `NAMING_CONVENTION_SCAN_ROOTS` with a `resolveScanPlan()` function that derives scan roots from registered static lists and filesystem intersection. Maps to acceptance criterion: `NAMING_CONVENTION_SCAN_ROOTS` replaced with `resolveScanPlan()`.
- [ ] Define registered recursive roots, registered ephemeral roots, and `NAMING_CONVENTION_IGNORED_TOP_LEVEL` in a new `workspace-topology.ts` module. Maps to acceptance criterion: registered roots and ignored top-level set defined.
- [ ] Validate every top-level directory name (including gitignored ephemeral roots) for kebab-case compliance and fail on unknown top-level directories. Maps to acceptance criteria: top-level names validated, unknown dirs fail.
- [ ] Preserve existing exemptions and add the narrow `Dockerfile`/`Caddyfile` tool-mandated exemption. Maps to acceptance criterion: exemptions preserved with the new tool-mandated exemption.
- [ ] Handle `readdirSync` failure gracefully with a warning and fallback to static root lists. Maps to acceptance criterion: `readdirSync` failures handled.
- [ ] Skip symlinks at every level and normalize paths for cross-platform stability. Maps to acceptance criterion: symlinked directories not followed.
- [ ] Extend the `naming.convention.lint --json` output with scan-plan metadata. Maps to acceptance criterion: `--json` output includes extended `scannedRoots`.
- [ ] Confirm zero pre-existing violations in the newly scanned directories after applying exemptions. Maps to acceptance criterion: no pre-existing violations (or fixed).
- [ ] Pass `pnpm -s run build:check` and `rfc.validate` after the change. Maps to acceptance criteria: `build:check` passes, `rfc.validate` passes.

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/lib/workspace-topology.ts` (new) — exports the registered recursive roots, ephemeral roots, and ignored top-level set as the single source of truth for `naming.convention.lint`.
- `packages/os/site-kernel-checks/src/structure/naming-convention.ts` — import registered roots from the workspace-topology module; replace `NAMING_CONVENTION_SCAN_ROOTS` with `resolveScanPlan()`, add ignored top-level set, unknown-root diagnostics, `Dockerfile`/`Caddyfile` exemption, symlink handling, `readdirSync` fallback, and extended JSON output.
- `packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts` — update the `naming.convention.lint` description to reflect repo-wide scope and add the `--include-ignored` flag schema.
- `packages/os/site-kernel-checks/src/structure.ts` — update module contract comment if it still says "apps/ and packages/".

### 2.2 Configuration and data

- No new configuration files. The static registered root lists live in `packages/os/site-kernel-checks/src/lib/workspace-topology.ts`.
- `.gitignore` and `.windsurfignore` continue to be read by the existing ignore-pattern logic.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0360-extend-filename-conventions-to-the-whole-repo.md` — reference only; amendments already applied during planning.
- `packages/os/site-kernel-checks/README.md` — update the `naming.convention.lint` row to describe repo-wide scope.
- `packages/os/site-kernel-checks/AGENTS.md` — update the command summary if it mentions only `apps/` and `packages/`.
- `packages/os/site-kernel-checks/docs/check-module-guide.md` — update the command purpose and pipeline references.

### 2.4 Validation and pipelines

- `naming.convention.lint` is already wired into `PACKAGES_CHECK_PIPELINE` and `APPS_CHECK_AUTHOR_PIPELINE`. No pipeline reordering is required; the command remains workspace-scoped and runs at the same position.
- The command will now scan `services/`, `docs/`, `integrations/`, `onboarding/`, `fleet/`, `tools/`, `scripts/`, and `systems/` (when present) in addition to `apps/` and `packages/`.

## 3. Step sequence

### Step 1. Verify RFC-0360 state

**Goal:** Confirm the RFC is enhanced, consistent with the filesystem, and carries the `Dockerfile`/`Caddyfile` exemption.

**Agent actions:**

- Read `docs/rfcs/rfc-0360-extend-filename-conventions-to-the-whole-repo.md`.
- Confirm `enhancedAt` is present and `services/` (not `backs/`) is used as the registered root name.
- Confirm `Dockerfile` and `Caddyfile` are listed in the exemptions section.

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0360 --json` passes.

**Completion criterion:** `rfc.validate` reports zero violations for RFC-0360.

**Human review:** No — this is a verification step.

---

### Step 2. Create the workspace-topology module and `resolveScanPlan()`

**Goal:** Make `naming.convention.lint` derive scan roots from a single registered source of truth and filesystem intersection.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/lib/workspace-topology.ts`:
  - Export the static registered root sets from RFC-0360:
    - `NAMING_CONVENTION_RECURSIVE_ROOTS` (apps, packages, services, docs, integrations, onboarding, fleet, tools, scripts, systems)
    - `NAMING_CONVENTION_EPHEMERAL_ROOTS` (missions, releases, agents, .werkstatt)
    - `NAMING_CONVENTION_IGNORED_TOP_LEVEL` (node_modules, .git, .turbo, .astro, .wrangler, .vscode, .idea, coverage, .changelog-system, .codex-runlogs, .agents)
  - Export a helper `isRegisteredOrIgnoredTopLevel(name)` that returns `true` for registered recursive roots, registered ephemeral roots, and ignored top-level entries.
  - Export a `NamingScanPlan` type and a `resolveScanPlan(repoRoot)` function that:
    - reads top-level directories with `readdirSync` (with `withFileTypes: true`);
    - skips symlinks (`!e.isSymbolicLink()`);
    - normalizes names via `normalizePathSegment` (lowercase, forward-slash style);
    - returns `{ recursiveRoots, ephemeralRoots, unknown }`.
  - Wrap `readdirSync` in `try/catch`: on failure, log a warning and fall back to the static registered lists. If the fallback also fails, fail closed.
- In `packages/os/site-kernel-checks/src/structure/naming-convention.ts`:
  - Replace the local `NAMING_CONVENTION_SCAN_ROOTS` with imports from the workspace-topology module.
  - Use `resolveScanPlan()` to derive the scan plan and set `topologySource: "workspace-topology"` in the JSON output when filesystem discovery succeeds; use `"static-fallback"` when the fallback path is taken.

**Validation:**

- `pnpm exec site-kernel run naming.convention.lint --json` returns successfully.
- JSON output contains `scannedRoots`, `ephemeralRootsSkipped`, `unknownTopLevelDirs`, and `topologySource: "workspace-topology"`.

**Completion criterion:** The workspace-topology module is created, `naming.convention.lint` imports from it, and the JSON output includes the new scan-plan metadata fields.

**Human review:** No.

---

### Step 3. Add unknown-top-level diagnostics and top-level name validation

**Goal:** Fail the lint when an unregistered top-level directory exists or when a registered root has a non-kebab-case name.

**Agent actions:**

- In `runNamingConventionLint`:
  - After resolving the scan plan, if `unknown.length > 0`, emit one error per unknown directory and increment `violations`.
  - For each registered root (recursive or ephemeral) that exists, check its basename against the kebab-case rule using existing `hasNamingViolation`. If it violates, emit an error and increment `violations`.
  - For each ephemeral root, validate its top-level name even though its contents are skipped by default.
  - Keep the existing filename violation loop unchanged.

**Validation:**

- Create a temporary unregistered top-level directory (e.g., `temp-lint-test/`) and run `naming.convention.lint`; it should fail with an unknown-top-level error. Remove the directory afterward.
- Verify that ephemeral roots like `.werkstatt` (if present) are not flagged as unknown.

**Completion criterion:** A temporary unknown top-level directory causes a non-zero exit code; registered roots pass.

**Human review:** No.

---

### Step 4. Add the `--include-ignored` flag and preserve exemptions

**Goal:** Allow opt-in scanning of gitignored ephemeral roots while keeping existing exemptions and adding the `Dockerfile`/`Caddyfile` exemption.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts`:
  - Add a `--include-ignored` boolean flag to the `naming.convention.lint` entry.
- In `runNamingConventionLint`:
  - Read `input.flags["include-ignored"]`.
  - When `false` (default), skip contents of ephemeral roots but still validate their top-level names.
  - When `true`, scan ephemeral root contents recursively using the same exemption/violation logic as recursive roots.
- In `isNamingExempt`:
  - Add `Dockerfile` and `Caddyfile` to the tool-mandated exemption list. Use exact filename matching (not substring matching) to keep the exemption narrow.
- Ensure dotfiles, underscore-prefixed files, ALLCAPS stems, `config`/`module` keywords, and exempt directories still pass.

**Validation:**

- Run `pnpm exec site-kernel run naming.convention.lint --json` and confirm `services/*/Dockerfile` and `services/observability-stack/caddy/Caddyfile` are not flagged.
- Run `pnpm exec site-kernel run naming.convention.lint --include-ignored --json` (if ephemeral roots exist) and confirm it scans deeper without crashing.

**Completion criterion:** `Dockerfile`/`Caddyfile` are not flagged; `--include-ignored` is accepted by the command parser.

**Human review:** No.

---

### Step 5. Update command description and documentation

**Goal:** Keep human-facing docs aligned with the new repo-wide scope.

**Agent actions:**

- Update `packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts` description from "across apps/ and packages/" to "across the registered repo topology".
- Update `packages/os/site-kernel-checks/README.md` row for `naming.convention.lint`.
- Update `packages/os/site-kernel-checks/AGENTS.md` if the command summary mentions only `apps/` and `packages/`.
- Update `packages/os/site-kernel-checks/docs/check-module-guide.md` command purpose and pipeline references.
- Update the `packages/os/site-kernel-checks/src/structure/naming-convention.ts` MODULE_CONTRACT comment to reflect repo-wide scope.
- Update `packages/os/site-kernel-checks/src/structure.ts` MODULE_CONTRACT comment if it still says "apps/ and packages/".

**Validation:**

- `pnpm exec site-kernel run command.manifest.generate`
- `pnpm exec site-kernel run docs.commands.generate`
- `pnpm exec site-kernel run command.manifest.validate --json` passes.
- `pnpm exec site-kernel run docs.commands.validate --json` passes.

**Completion criterion:** Generated command manifest and docs reflect the new description and no validators fail.

**Human review:** No.

---

### Step 6. Verify zero pre-existing violations in newly scanned roots

**Goal:** Confirm that extending the scan roots does not introduce unexpected violations.

**Agent actions:**

- Run `pnpm exec site-kernel run naming.convention.lint --json`.
- If any unexpected violations appear, fix them by renaming files (do not add new exemptions). If a violation is found in a generated or gitignored directory that should be skipped, verify it is covered by an existing exemption or by `--include-ignored` behavior.

**Validation:**

- `naming.convention.lint` reports `violations: []` and `unknownTopLevelDirs: []`.

**Completion criterion:** Zero violations and zero unknown top-level directories.

**Human review:** No — unless a violation requires a policy decision.

---

### Step 7. Run full validation suite

**Goal:** Confirm the change does not break the package check pipeline or RFC validation.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0360 --json`.
- Run `pnpm -s run build:check` (or the repository's equivalent root command).
- Run `pnpm exec site-kernel run packages-check.run --json`.
- Run `pnpm exec site-kernel run apps-check.author --app warpgogol-com --json` (or another representative app) to confirm the app-scoped pipeline still passes.

**Validation:**

- All commands above exit with code 0.

**Completion criterion:** `build:check`, `packages-check.run`, and `rfc.validate` all pass.

**Human review:** No.

---

### Step 8. Emit verification evidence and transition RFC status

**Goal:** Satisfy RFC-0224 / RFC-0330 transition preconditions.

**Agent actions:**

- If RFC-0360 gains acceptance probes before implementation, run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0360` and commit the generated evidence file.
- If no probes are present, verify that the acceptance-criteria checkboxes in the RFC are checked (only after the implementation steps above are proven).
- Transition the RFC frontmatter from `status: accepted` to `status: implemented`, set `implementedAt`, and commit.

**Validation:**

- `rfc.validate` passes after the status change.

**Completion criterion:** RFC-0360 is marked `implemented` and the verification evidence (if applicable) is committed.

**Human review:** Yes — the architecture role must accept the RFC before this step is executed.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0360`
- `pnpm exec site-kernel run naming.convention.lint --json`
- `pnpm exec site-kernel run naming.convention.lint --include-ignored --json`
- `pnpm exec site-kernel run command.manifest.validate --json`
- `pnpm exec site-kernel run docs.commands.validate --json`
- `pnpm -s run build:check`
- `pnpm exec site-kernel run packages-check.run --json`
- `pnpm exec site-kernel run apps-check.author --app warpgogol-com --json` (representative app)
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0360` (only if acceptance probes are added)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0360.generated.json` — only if acceptance probes are present and `rfc.verification.emit` is run (RFC-0330).
- Commit messages referencing `RFC-0360` in the subject line (RFC-0265 commit hygiene).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Pre-existing violations in newly scanned directories | Step 6 scans the extended roots and fixes any violations before merging. `Dockerfile`/`Caddyfile` are covered by the narrow tool-mandated exemption documented in Step 4. |
| Topology registry drift causes missing roots | Step 2 uses a checked-in static fallback list; `workspace.surface.validate` remains the drift guard for topology generation. |
| Unknown scratch directory breaks lint | Step 3 intentionally fails on unknown top-level directories; developers must register real workspace roots or use ignored tool/cache directories. |
| Gitignored directories scanned too deeply | Step 4 checks only ephemeral-root top-level names by default; `--include-ignored` is required to scan contents. |
| `readdirSync` failure breaks CI | Step 2 wraps the call in try/catch and falls back to static lists; if fallback fails, the command fails closed. |
| Windows case-insensitive filesystem produces unstable diagnostics | Step 2 normalizes path segments and uses the on-disk name for comparison; violation messages use the normalized relative path. |

## 6. Escalation triggers

- If implementation reveals that the kebab-case invariant itself (DNA-6) needs to be weakened beyond the documented `Dockerfile`/`Caddyfile` exemption, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0360 --reason "..." --invariant "DNA-6"` instead of adding ad-hoc exemptions.
- If an unknown top-level directory is discovered that is a legitimate new workspace layer (e.g., a new top-level category), register it via the appropriate RFC or command manifest change rather than silently adding it to `naming-convention.ts`.
- If `--include-ignored` scanning of `missions/` or `releases/` surfaces violations that are not clearly tool-generated, pause and confirm whether the root should be registered as recursive or ephemeral before renaming files.
