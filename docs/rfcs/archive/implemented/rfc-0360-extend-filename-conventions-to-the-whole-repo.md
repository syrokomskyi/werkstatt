---
id: RFC-0360
title: "Extend filename conventions to the whole repo"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-10
enhancedAt: 2026-07-09
implementedAt: 2026-07-10
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0365
related:
  - RFC-0354
  - RFC-0355
  - RFC-0356
  - RFC-0357
  - RFC-0358
  - RFC-0359
  - DNA-6
satisfies: []
commands:
  proposed: []
  added: []
  changed:
    - naming.convention.lint
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-checks"
successSignals:
  - "`naming.convention.lint` validates all registered top-level directory names, including gitignored Werkstatt roots, and scans registered source/documentation roots across the repo."
  - "No filename violations in the new directories after the scan roots are extended."
  - "Existing exemptions (dotfiles, underscore-prefixed, ALLCAPS, config/module keywords, exempt directories) continue to apply to the new scan roots."
  - "The scan roots are data-driven from the workspace topology registry and filesystem intersection, not hard-coded to `apps` and `packages` only and not open to arbitrary root sandboxes."
nonGoals:
  - "Does not change the kebab-case rule itself — DNA-6 remains the invariant."
  - "Does not change the exemption rules, except for adding the narrow `Dockerfile`/`Caddyfile` tool-mandated exemption to the existing exemption set."
  - "Does not define naming policies for content within Sternsystem repos — that is RFC-0361."
  - "Does not lint file contents (only filenames)."
  - "Does not lint git branch names or commit message conventions."
  - "Does not add performance metrics beyond the existing file-count and scan-root metadata in JSON output."
---

# RFC-0360: Extend filename conventions to the whole repo

## Context

DNA-6 establishes the kebab-case filename invariant: "All filenames in `apps/` and `packages/` use kebab-case. No underscores, no `PascalCase` filenames. Enforced by `naming.convention.lint`."

The `naming.convention.lint` command (in `packages/os/site-kernel-checks/src/structure/naming-convention.ts`) currently scans only two roots:

```ts
const NAMING_CONVENTION_SCAN_ROOTS = ["apps", "packages"];
```

The Werkstatt architecture (RFC-0354..0359) introduces new top-level directories: `systems/`, `missions/`, `releases/`, `agents/`. The repo also has existing directories that are not scanned: `services/`, `docs/`, `integrations/`, `onboarding/`, `fleet/`, `tools/`, `scripts/`.

Filenames in these directories are currently unenforced. An agent or developer may create a file like `systems/MySystem/system.yaml` (PascalCase directory) or `missions/Mission_001/manifest.yaml` (underscore + PascalCase) without any lint catching it.

## Problem

The kebab-case invariant (DNA-6) is scoped too narrowly. It protects `apps/` and `packages/` but leaves the rest of the repo unenforced. With the Werkstatt architecture adding `systems/`, `missions/`, `releases/`, and `agents/`, the gap widens. Inconsistent naming across the repo makes navigation harder and breaks the assumption that all paths are kebab-case.

## Decision

Extend `naming.convention.lint` to scan the **registered repo topology** (excluding gitignored contents and explicitly exempt directories), making the kebab-case invariant repo-wide without allowing ad hoc top-level sandbox directories.

### 1. Top-level directory contract

Every top-level directory in the repo root is classified before any recursive scan starts:

1. **Registered source/documentation roots** are scanned recursively.
2. **Registered ephemeral roots** have their root directory name validated, but their contents are skipped by default because they are gitignored or generated.
3. **Explicit tool/cache exclusions** are ignored (`.git`, `node_modules`, `.turbo`, and equivalent tool-managed caches).
4. **Unknown top-level directories are violations.** The repo does not allow unregistered root sandboxes. Adding a new top-level directory requires updating the topology registry or command manifest ownership first.

Unknown top-level directories are not allowed. Developers may not create root-level sandbox directories (e.g., `temp-experiments/` or `scratch/`) to bypass the lint. Any unregistered, non-ignored top-level directory is a violation and must either be registered as a workspace root or removed. The initial registered roots are:

```ts
const NAMING_CONVENTION_RECURSIVE_ROOTS = [
  "apps",
  "packages",
  "services",
  "docs",
  "integrations",
  "onboarding",
  "fleet",
  "tools",
  "scripts",
  "systems",     // RFC-0354 data registries and local clones when present
];

const NAMING_CONVENTION_EPHEMERAL_ROOTS = [
  "missions",    // RFC-0355 — gitignored; root name checked, contents skipped unless --include-ignored
  "releases",    // RFC-0357 — gitignored; root name checked, contents skipped unless --include-ignored
  "agents",      // agent work areas; root name checked, contents skipped unless --include-ignored
  ".werkstatt",  // RFC-0362/RFC-0363 operation and artifact state; root name explicitly allowed
];
```

### 2. Data-driven scan roots

Instead of hard-coding only `apps` and `packages`, scan roots are derived from the workspace topology registry and intersected with the filesystem. The implementation may source the registry from `docs/ecosystem.generated.json`, `docs/command-manifest.generated.json`, or a small shared topology module, but the behavior is:

- registered recursive roots that exist are scanned recursively;
- registered ephemeral roots that exist have their root name validated and their contents skipped unless `--include-ignored` is passed;
- unknown top-level directories fail the lint;
- symlinks are not followed at any level — top-level symlinked directories are treated as non-directories and ignored;
- paths are normalized through `realpath`/`relative` so Windows separators and case-insensitive filesystems produce stable diagnostics; the command uses the on-disk name as returned by the filesystem and compares it to the registered sets.

```ts
function resolveScanPlan(repoRoot: string): NamingScanPlan {
  const entries = readdirSync(repoRoot, { withFileTypes: true });
  const topLevelDirs = entries
    .filter((e) => e.isDirectory() && !e.isSymbolicLink())
    .map((e) => normalizePathSegment(e.name));

  const unknown = topLevelDirs.filter((name) => !isRegisteredOrIgnoredTopLevel(name));
  const recursiveRoots = registeredRecursiveRoots().filter((name) => topLevelDirs.includes(name));
  const ephemeralRoots = registeredEphemeralRoots().filter((name) => topLevelDirs.includes(name));

  return { recursiveRoots, ephemeralRoots, unknown };
}
```

If the generated topology registry cannot be read, the command logs a warning and falls back to the checked-in static root lists above. If reading the repo root with `readdirSync` fails (permission denied, network mount issue, race condition), the command logs the error, falls back to the static root lists, and continues. If both the generated registry and the static fallback list are unavailable, the command fails closed. The fallback is intentionally the same static set so that CI/CD pipelines do not break when the generated registry is temporarily stale.

The ignored top-level set contains tool/cache directories that are never scanned:

```ts
const NAMING_CONVENTION_IGNORED_TOP_LEVEL = new Set([
  "node_modules",
  ".git",
  ".turbo",
  ".astro",
  ".wrangler",
  ".vscode",
  ".idea",
  "coverage",
  ".changelog-system",
  ".codex-runlogs",
  ".agents",      // reference/historical documentation
]);
```

Gitignored roots are not invisible. Their **top-level directory name** is still validated for kebab-case compliance and must be registered; only their contents are skipped by default. For example, `missions/`, `releases/`, and `agents/` must themselves be kebab-case and registered as ephemeral roots even when their contents are ignored.

### 3. Existing exemptions preserved

All existing exemptions from `naming-convention.ts` continue to apply to the new scan roots:

1. **Dotfiles**: filenames starting with `.` (`.env`, `.gitignore`, `.gitattributes`).
2. **Underscore-prefixed**: filenames starting with `_` (`_headers`, `_redirects`, `_shared.ts`).
3. **ALLCAPS**: filenames in all uppercase (`AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `ONBOARDING_AI.md`).
4. **Config/module keywords**: filenames containing `config` or `module` (`kernel.config.ts`, `check.module.ts`).
5. **Exempt directories**: `components/icons/gen`, `migrations`, `_img`, `_video`, `spec`, `todo`.
6. **Tool-mandated filenames**: `Dockerfile` and `Caddyfile` are exempt because Docker and Caddy use these exact PascalCase names as their default file identifiers. This exemption is narrow and does not extend to arbitrary PascalCase names.
7. **Gitignored contents**: files matching `.gitignore` and `.windsurfignore` patterns are not scanned unless `--include-ignored` is passed. The top-level directory names are still checked.

### 4. New directory-specific considerations

#### 4.1 `systems/` and `missions/`

Sternsystem ids and mission ids are kebab-case, lowercase, latin-only (enforced by RFC-0354 and RFC-0355 Zod schemas). Directory names under `systems/` and `missions/` will naturally pass the kebab-case lint.

The `systems/registry.yaml` file is kebab-case. The `systems/<id>/` cache clone directories are kebab-case (because the id is kebab-case).

#### 4.2 `releases/`

Release IDs follow `<system-id>-r<NNNNNN>` (kebab-case). Directory names under `releases/` will pass when `--include-ignored` is used.

#### 4.3 `docs/`

The `docs/` directory contains RFC files with the naming convention `rfc-NNNN-<kebab-case-title>.md` and `RFC-NNNN-<title>.md`. The mixed-case RFC files (`RFC-NNNN-...`) are **exempt** as ALLCAPS filenames (the `RFC` prefix is all uppercase). The lowercase `rfc-NNNN-...` files are kebab-case and pass.

The `docs/*.xml` files (`requirements.xml`, `technology.xml`, etc.) are kebab-case and pass.

#### 4.4 `onboarding/`

The `onboarding/` directory contains input and output files with numeric prefixes (`00-brief.md`, `01-classification.json`). These are kebab-case (lowercase, digits, hyphens) and pass.

The `.input/` and `.output/` directories are dot-prefixed and exempt.

### 5. Implementation

The change is minimal: replace the hard-coded `NAMING_CONVENTION_SCAN_ROOTS` array with `resolveScanPlan`, add the registered root sets, and add unknown-top-level diagnostics. The existing exemption logic, ignore-pattern reading, and violation reporting remain unchanged.

## Architectural fit

- **DNA-6 (Kebab-case filenames):** This RFC extends the scope of DNA-6 from `apps/` and `packages/` to the entire repo. The invariant itself is unchanged; the enforcement scope is widened.
- **RFC-0354..0359 (Werkstatt architecture):** The new directories (`systems/`, `missions/`, `releases/`, `agents/`) are covered by the extended scan.
- **RFC-0353 (Compass rename):** Uses Compass terminology.
- **Anti-patterns prevented:** "inconsistent naming across repo directories" and "untracked directories bypassing the kebab-case invariant".

## Design

### CLI surface

No new commands. The existing `naming.convention.lint` command is changed to scan the extended roots.

```sh
pnpm exec werkstatt run naming.convention.lint
pnpm exec werkstatt run naming.convention.lint --json
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/structure/naming-convention.ts` | Replace hard-coded `NAMING_CONVENTION_SCAN_ROOTS` with `resolveScanPlan()`; add registered root sets, ignored top-level set, symlink skip, and unknown-root diagnostics |

### Output format

The `naming.convention.lint --json` output keeps the existing fields and adds scan-plan metadata:

```json
{
  "command": "naming.convention.lint",
  "status": "pass",
  "data": {
    "scannedRoots": ["apps", "packages", "services", "docs", "integrations", "onboarding", "fleet", "tools", "scripts", "systems"],
    "ephemeralRootsSkipped": ["missions", "releases", "agents", ".werkstatt"],
    "unknownTopLevelDirs": [],
    "topologySource": "docs/ecosystem.generated.json",
    "scannedFiles": 1308,
    "violations": []
  },
  "summary": "[naming.convention.lint] 1308 files scanned, 0 violations"
}
```

### Failure modes

Existing filename violation reporting (file path, expected kebab-case, fix hint) is unchanged. New failure modes:

| Condition | Exit code | Message |
| --- | --- | --- |
| Unknown top-level directory | non-zero | `[naming.convention.lint] unknown top-level directory '<name>'; register it or remove it` |
| Registered root has invalid name | non-zero | `[naming.convention.lint] top-level directory '<name>' violates naming convention` |
| Topology registry unavailable but fallback succeeds | `0` if no other violations | `[naming.convention.lint] warning: topology registry unavailable, using fallback scan roots` |
| Topology registry and fallback both unavailable | non-zero | `[naming.convention.lint] cannot resolve naming scan roots` |
| `readdirSync` of repo root fails but fallback succeeds | `0` if no other violations | `[naming.convention.lint] warning: failed to read repo root (<error>), using fallback scan roots` |

## Rollout

1. RFC acceptance by the architecture role.
2. Replace `NAMING_CONVENTION_SCAN_ROOTS` with `resolveScanPlan()` in `naming-convention.ts`.
3. Add registered recursive roots, registered ephemeral roots, and `NAMING_CONVENTION_IGNORED_TOP_LEVEL`.
4. Run `naming.convention.lint` to identify any pre-existing violations in the newly scanned directories.
5. Fix any pre-existing violations (rename files to kebab-case).
6. Run `build:check` to verify the extended lint passes.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Keep scanning only `apps/` and `packages/` | Leaves the Werkstatt directories (`systems/`, `missions/`, `releases/`, `agents/`) unenforced. Inconsistent naming would go undetected. |
| Add new roots individually (`systems`, `missions`, etc.) to the hard-coded array only | Still hard-coded to one command; future directories would drift from ecosystem/command manifests. The topology-derived approach is future-proof while still rejecting unregistered root sandboxes. |
| Scan every top-level directory automatically | Allows arbitrary root sandboxes and generated trash to become de facto repo structure. Unknown top-level directories must fail until registered. |
| Create a separate `naming.convention.lint.repo` command | Two commands for the same invariant is confusing. One command, extended scope, is simpler. |
| Scan everything including dot-directories | Dot-directories (`.git`, `.turbo`, `.astro`) contain generated/tool-managed files with non-kebab-case names. They must remain exempt. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Pre-existing violations in newly scanned directories | Medium | Run the lint after extending and fix violations before merging. The `docs/` directory has mixed-case RFC files that are exempt as ALLCAPS. |
| Topology registry drift causes missing roots | Medium | Fall back to the checked-in static root sets with a warning; `workspace.surface.validate` remains the drift guard for topology generation. |
| Unknown scratch directory breaks lint | Medium | This is intentional. Root-level sandboxes are not allowed; use ignored tool/cache directories or register a real workspace root. |
| Gitignored directories (missions, releases, agents) are scanned too deeply | Low | Their root names are checked, but contents are skipped unless `--include-ignored` is passed. |

## Acceptance criteria

- [x] `NAMING_CONVENTION_SCAN_ROOTS` replaced with `resolveScanPlan()` function (evidence: implemented historically)
- [x] Registered recursive roots, registered ephemeral roots, and `NAMING_CONVENTION_IGNORED_TOP_LEVEL` are defined (evidence: implemented historically)
- [x] `naming.convention.lint` validates every top-level directory name, including gitignored roots, for kebab-case compliance (evidence: implemented historically)
- [x] Unknown top-level directories fail the lint unless registered or explicitly ignored as tool/cache directories (evidence: implemented historically)
- [x] Root-level sandbox directories are explicitly disallowed (evidence: implemented historically)
- [x] Symlinked directories are not followed (evidence: implemented historically)
- [x] `readdirSync` failures are handled with a warning and fallback to static root lists (evidence: implemented historically)
- [x] Existing exemptions preserved, with the addition of the narrow `Dockerfile`/`Caddyfile` tool-mandated exemption (evidence: implemented historically)
- [x] No pre-existing violations in newly scanned directories (or fixed) after applying the documented exemptions (evidence: implemented historically)
- [x] `naming.convention.lint --json` output includes extended `scannedRoots` (evidence: implemented historically)
- [x] `pnpm -s run build:check` passes with the extended lint (deferred to full build:check run) (evidence: build:check passes, exitCode=0)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0360` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0360 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The change is minimal: replace the hard-coded array with a function that reads top-level directories. Do NOT refactor the exemption logic, ignore-pattern reading, or violation reporting.
- If pre-existing violations are found in newly scanned directories, rename the files to kebab-case. Do NOT add new exemptions to silence violations — that weakens the invariant, except for the narrow `Dockerfile`/`Caddyfile` tool-mandated exemption already documented in the RFC.
- Do NOT add root-level sandbox directories to avoid the lint. Unknown top-level directories are violations; there is no project-specific opt-out mechanism beyond the registered tool/cache exclusions.
- Gitignored roots still have their top-level names validated for kebab-case compliance. Their contents are skipped by default and scanned only with `--include-ignored`.
- Normalize paths before diagnostics and do not follow symlinks.
- The `docs/` directory has mixed-case RFC files (`RFC-NNNN-...`). These are exempt as ALLCAPS filenames. The lowercase `rfc-NNNN-...` files are kebab-case. Both pass the lint.
- Use Compass terminology (not GRACE) in all new code, documentation, and log messages (RFC-0353).
