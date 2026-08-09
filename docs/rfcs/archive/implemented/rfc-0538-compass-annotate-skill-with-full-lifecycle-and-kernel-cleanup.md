---
id: RFC-0538
title: "Compass annotate Forge skill with full lifecycle, forge.yaml bindings, and kernel command cleanup"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-26
updatedAt: 2026-07-26
enhancedAt: 2026-07-26
implementedAt: 2026-07-26
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0348
amendedBy: []
related:
  - RFC-0350
  - RFC-0349
  - RFC-0393
  - RFC-0391
# DNA invariants this RFC implements, protects, or extends.
satisfies:
  - DNA-42
  - DNA-54
# RFC-0478: Platform versioning enforcement.
# minor = Breaks-B (requires migrator), patch = safe, none = prose-only,
# major = architectural. This RFC removes kernel commands and changes forge.yaml.
versionBump: minor
commands:
  proposed: []
  added:
    - compass.summary.trim
  changed:
    - compass.changesummary.validate
  removed:
    - compass.annotate
    - compass.clear
    - compass.markup.migrate
    - compass.invariant.add
    - compass.changesummary.tidy
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
  - "@wgogol/forge"
successSignals:
  - "fo-compass-annotate skill generates valid MODULE_CONTRACT + CHANGE_SUMMARY headers"
  - "fo-compass-annotate skill updates CHANGE_SUMMARY on file modification via git diff"
  - "fo-compass-annotate skill performs semantic audit of purpose/non-goals vs code"
  - "compass.summary.trim cleans CHANGE_SUMMARY to <=30 items preserving RFC/ADR items"
  - "forge.yaml compass.fileExtensions binding controls which files are annotated"
  - "forge-bootstrap asks operator for file extensions and test patterns"
  - "fo-fix pipeline includes compass header update step"
nonGoals:
  - "Do not call OpenAI API directly from kernel commands — LLM work lives in the skill"
  - "Do not annotate test files (*.test.ts, *.spec.ts, **/test/**, **/tests/**)"
  - "Do not annotate generated files (dist/, node_modules/, *.generated.*, GENERATED_MARKER)"
  - "Do not annotate trivial re-export shims (<10 lines, only export...from)"
  - "Do not integrate external @syrokomskyi/code-compass package — skill is self-contained"
  - "Do not support multiple annotation schemas — one schema (MODULE_CONTRACT + CHANGE_SUMMARY + @ai-invariant)"
  - "Do not annotate mission workpiece generated-from-template files"
---

# RFC-0538: Compass annotate Forge skill with full lifecycle, forge.yaml bindings, and kernel command cleanup

## Context

The ecosystem has a Compass source-file markup contract (`docs/source-markup.xml`) requiring `MODULE_CONTRACT` and `CHANGE_SUMMARY` header blocks in authored source files. The current `compass.annotate` kernel command (RFC-0350) inserts deterministic `TODO(compass)` skeleton placeholders — it explicitly does not generate prose, leaving that to the file author. This creates a gap: headers are either missing, skeleton-only, or manually written with inconsistent quality.

An external package (`@syrokomskyi/code-compass`) demonstrated LLM-driven annotation generation using OpenAI GPT-4o, but it conflicts with RFC-0350's retirement of LLM-based generation from kernel commands and depends on an external API key.

The operator's motivation: **clear, competent, guaranteed, verifiable, and updatable** annotations that LLMs can consume without reading entire files. The Forge skill mechanism is the correct home for LLM-driven work — the agent has in-IDE context, can read code directly, and does not require external API keys.

## Problem

1. **No LLM-driven annotation generation.** RFC-0350 retired LLM generation from kernel commands. `compass.annotate` only inserts `TODO(compass)` skeletons. Headers remain unfilled or manually written with inconsistent quality.

2. **No lifecycle management.** `CHANGE_SUMMARY` is not automatically updated when files change. `purpose`/`non-goals` drift from code over time. No semantic audit exists outside `compass.audit.*` ledger tracking.

3. **Kernel commands doing generative work that belongs in a skill.** `compass.annotate` (skeleton), `compass.invariant.add` (insert), `compass.markup.migrate` (v1→v2), `compass.clear` (remove) are generative/mutating commands that are either obsolete or better handled by an LLM-driven skill.

4. **No portability mechanism.** File extensions for Compass annotation are hardcoded. Forging into non-TypeScript projects (JS, C++, Python, Rust) requires a configurable extension list.

5. **No test-file exclusion configuration.** Test files are skipped by convention but not configurable per project.

## Decision

### 1. Create `fo-compass-annotate` Forge skill

A standalone Forge skill that handles the **full lifecycle** of Compass headers:

- **Initial generation** — for files without `MODULE_CONTRACT` or with `TODO(compass)` skeletons
- **Update on modification** — `CHANGE_SUMMARY` append (down) via git diff + LLM significance judgment
- **Semantic audit** — `purpose`/`non-goals` drift detection via LLM code-vs-header comparison
- **Risk detection** — `@ai-invariant` insertion via LLM → patterns fallback → operator confirmation cascade
- **Batch-end validation** — `compass.validate` + autorretry
- **Cleanup** — `compass.summary.trim` invocation

### 2. Add `forge.yaml` bindings

```yaml
bindings:
  compass:
    fileExtensions: [".ts", ".astro"]
    testPatterns: ["*.test.ts", "*.spec.ts", "**/test/**", "**/tests/**"]
```

Skill reads `ref(forge.yaml bindings.compass.fileExtensions)` and `ref(forge.yaml bindings.compass.testPatterns)`. If bindings are absent, skill uses hardcoded defaults.

### 3. Update `forge-bootstrap` skill

Add a new step between Language selection and Verify prerequisites:

1. **Project detection** — scan for `package.json`, `tsconfig.json`, `Cargo.toml`, `CMakeLists.txt`, `*.csproj`, `go.mod`, `pyproject.toml`, etc. Determine stack/languages.
2. **Operator confirmation** — show detected profile, ask operator to confirm or correct.
3. **Compass extensions** — propose `compass.fileExtensions` and `compass.testPatterns` based on confirmed profile. Operator adjusts if needed.

### 4. Add `compass.summary.trim` kernel command

Deterministic cleanup of `CHANGE_SUMMARY` blocks:

- Removes oldest items (top of block) when total exceeds 30 items
- **Preserves** items referencing RFCs or ADRs (matched by `PROTECTED_RE` from RFC-0349)
- Replaces removed items with fallback: `"Tidied by compass.summary.trim; see git history for prior entries."`
- This is a **rename and extension** of the existing `compass.changesummary.tidy` (RFC-0349), which already does similar logic with a cap of 3 unprotected items. The new command raises the cap to 30 total items and uses the name `compass.summary.trim` for clarity.
- **`compass.changesummary.validate` cap update**: The retained `compass.changesummary.validate` command (COMPASS-CS-02) currently checks for >3 unprotected items. Its cap is raised to 30 total items to match `compass.summary.trim`, so that the validate fix hint "run `compass.summary.trim`" actually resolves the violation. Both commands use the same 30-total cap.
- **Rename rationale**: The name `compass.changesummary.tidy` implied a narrow focus on boilerplate removal. The new name `compass.summary.trim` better reflects the broader lifecycle role (cap management + boilerplate removal) and aligns with the skill's batch-end cleanup step. The rename is forward-only — `compass.changesummary.tidy` is removed, `compass.summary.trim` is added.

### 5. Remove obsolete kernel commands

| Command                  | Reason                                             |
| ------------------------ | -------------------------------------------------- |
| `compass.annotate`       | Skeleton generation replaced by LLM-driven skill   |
| `compass.clear`          | Header removal not needed; forward-only            |
| `compass.markup.migrate` | v1→v2 migration complete; forward-only             |
| `compass.invariant.add`  | `@ai-invariant` insertion handled by skill via LLM |

### 6. Integrate into `fo-fix` pipeline

Add a new step between step 4 (Commit the fixes) and step 5 (Documentation audit):

- **Step 4.5: Update Compass headers** — invoke `fo-compass-annotate` for files changed in the current session. Separate commit: `compass: update headers for changed files`.

### 7. Keep infrastructure kernel commands

| Command | Reason |
| --- | --- |
| `compass.validate` | Batch-end validation, called by skill |
| `compass.inventory` | File classification, markup detection |
| `compass.audit.plan` / `record` / `baseline` / `validate` | Ledger + revision tracking for audit-triggered updates |
| `compass.changesummary.validate` | Validation of CHANGE_SUMMARY structure (cap updated to 30 total items to match `compass.summary.trim`) |

## Architectural fit

- **RFC-0350 alignment**: RFC-0350 retired LLM generation from kernel commands. This RFC moves LLM generation to a Forge skill — the correct layer for agent-driven work. Kernel commands remain deterministic infrastructure.
- **Forge bindings (RFC-0393)**: `compass.fileExtensions` and `compass.testPatterns` follow the binding pattern for de-hardcoding project-specific values from skills.
- **Forge bootstrap (RFC-0391)**: `forge.yaml` is the machine-readable project configuration. Adding compass bindings extends it naturally.
- **Forward-only (DNA)**: No backward compatibility for removed commands. `compass.annotate`, `compass.clear`, `compass.markup.migrate`, `compass.invariant.add`, `compass.changesummary.tidy` are removed without deprecation period.
- **DNA-42 update**: DNA-42 (Compass markup contract, established by RFC-0348) names `compass.markup.migrate`, `compass.changesummary.tidy`, and `compass.invariant.add` as enforcement commands. This RFC amends RFC-0348 to update the DNA-42 enforcement command list: removed commands are dropped, `compass.changesummary.tidy` is replaced by `compass.summary.trim`, and the `fo-compass-annotate` skill is added as the LLM-driven annotation mechanism.
- **DNA-54 (Forge bindings contract)**: The `compass` binding section extends the `forge/bindings@1` schema. The Zod schema in `packages/forge/src/config/forge-config.ts` must be updated to recognize the new `compass` key — without this, `loadForgeConfig` would silently strip the `compass` section from the parsed config.
- **`compass.validate` fix hints**: The `compass.validate` command in `packages/os/site-kernel-checks/src/compass.ts` emits fix hints referencing removed commands (e.g. `"fix: remove ${marker}; run compass.markup.migrate"`). These hints are updated to reference the `fo-compass-annotate` skill instead.
- **Skill file granulation**: Skill files are granulated — templates and reference data live in separate files alongside `SKILL.md`, mirroring `site-kernel-codegen` convention (RFC-0087: templates under `src/templates/**`).

## Design

### Skill structure

```
.agents/skills/fo-compass-annotate/
├── SKILL.md                    # Pipeline description, steps, triggers
├── templates/
│   ├── header-prompt.md        # LLM prompt template for header generation
│   ├── audit-prompt.md         # LLM prompt template for semantic audit
│   └── header-format.md        # Canonical MODULE_CONTRACT + CHANGE_SUMMARY format reference
└── reference/
    ├── risk-patterns.md        # Deterministic patterns for risk detection fallback
    ├── comment-styles.md       # Extension → comment style mapping (defaults)
    └── learned-principles.md   # Operator preferences for this skill
```

### Skill pipeline

```
1. Discover files
   ├── Read forge.yaml bindings (fileExtensions, testPatterns)
   ├── Scan workspace for matching files
   ├── Skip test files (testPatterns match)
   ├── Skip generated files (heuristic: dist/, node_modules/, *.generated.* + GENERATED_MARKER)
   └── Skip trivial files (<10 lines, only export...from)

2. For each file:
   ├── No header → Generate (LLM reads code, writes MODULE_CONTRACT + CHANGE_SUMMARY)
   ├── TODO(compass) skeleton → Replace entirely (LLM reads code, writes full header)
   ├── Has header + git diff → Update CHANGE_SUMMARY (heuristic filter → LLM significance → append down)
   ├── Has header + audit trigger → Semantic audit (LLM compares purpose/non-goals vs code)
   └── Risk detection → @ai-invariant (LLM → patterns → operator cascade)

3. Batch-end validation
   ├── Run compass.validate
   ├── For failures: autorretry (LLM fixes)
   └── Remaining failures: report to operator

4. Cleanup (optional, explicit trigger)
   └── Run compass.summary.trim

5. Report
   └── Markdown summary in chat: annotated (N), updated (N), skipped (N), failed (N)
```

### CLI surface

Standalone invocation:

```sh
# Annotate all files in workspace
/fo-compass-annotate

# Annotate specific file
/fo-compass-annotate --file packages/os/site-kernel/src/registry.ts

# Annotate changed files (git diff)
/fo-compass-annotate --changed

# Run cleanup only
/fo-compass-annotate --cleanup

# Audit-triggered (uses compass.audit.plan work-order)
/fo-compass-annotate --audit
```

Pipeline integration (called from `fo-fix` step 4.5):

```
fo-compass-annotate --changed
```

### `compass.summary.trim` command

```sh
pnpm exec werkstatt run compass.summary.trim --root .
pnpm exec werkstatt run compass.summary.trim --root . --dry-run
```

```ts
interface CompassSummaryTrimResult {
  command: "compass.summary.trim";
  status: "ok";
  files: Array<{
    path: string;
    removed: string[];
    kept: number;
  }>;
}
```

This is an extension of the existing `compass.changesummary.tidy` logic (RFC-0349) with:

- Cap raised from 3 unprotected items to 30 total items
- Renamed from `compass.changesummary.tidy` to `compass.summary.trim` for clarity
- Same protected-item preservation (RFC/ADR references)
- Same fallback item insertion

`compass.changesummary.validate` is updated in parallel: its COMPASS-CS-02 cap is raised from 3 unprotected to 30 total items, so validate and trim use the same cap logic. The fix hint for COMPASS-CS-02 is updated from `"run compass.changesummary.tidy"` to `"run compass.summary.trim"`.

### Failure modes

- **All items are boilerplate**: `compass.summary.trim` inserts the fallback item (same as `compass.changesummary.tidy`). The block is never emptied.
- **File has no CHANGE_SUMMARY block**: Skipped silently (not an error).
- **File is not authored**: Skipped silently (same `authoringStatus !== "authored"` filter as tidy).
- **Dry-run mode**: No files are written; results are reported only.

### `forge.yaml` bindings

```yaml
bindings:
  schema: forge/bindings@1
  compass:
    fileExtensions: [".ts", ".astro"]
    testPatterns: ["*.test.ts", "*.spec.ts", "**/test/**", "**/tests/**"]
```

### Comment styles (skill reference)

| Extension | Comment style | Notes |
| --- | --- | --- |
| `.ts`, `.js`, `.mjs`, `.cjs` | `/* ... */` | Block comment at file top |
| `.astro` | `/* ... */` inside frontmatter | After opening `---`, before imports |
| `.py` | `# ...` per line | Hash comments |
| `.rs` | `// ...` per line | Line comments |
| `.cpp`, `.h`, `.hpp` | `/* ... */` | Block comment (default), `//` override via binding |
| `.go` | `/* ... */` | Block comment |
| `.lua` | `--[[ ... ]]` | Long comment |

### Risk detection cascade

```
1. LLM judgment (primary)
   ├── LLM reads code, determines blast-radius (middleware, registry, runtime core, etc.)
   ├── If high-risk: generate @ai-invariant
   └── If confident: done

2. Pattern fallback (if LLM not confident)
   ├── Check against risk-patterns.md (sign, crypto, vault, migrate, publish, etc.)
   ├── If patterns match: generate @ai-invariant
   └── If no match: proceed to operator

3. Operator confirmation (if still ambiguous)
   ├── Ask operator: "File X looks potentially high-risk. Add @ai-invariant?"
   └── Operator decides
```

### Generated file detection

```
Skip if ANY match:
  - File contains GENERATED_MARKER (// GENERATED or similar)
  - Path matches: dist/**, node_modules/**, build/**, *.generated.*
  - Path matches binding excludePatterns (if present)
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `.agents/skills/fo-compass-annotate/SKILL.md` | Skill pipeline definition |
| `.agents/skills/fo-compass-annotate/templates/*.md` | LLM prompt templates and format reference |
| `.agents/skills/fo-compass-annotate/reference/*.md` | Risk patterns, comment styles, learned principles |
| `forge.yaml` | `compass.fileExtensions` and `compass.testPatterns` bindings |
| `packages/forge/src/config/forge-config.ts` | **Updated** — `forgeBindingsSchema` extended with optional `compass` section (fileExtensions, testPatterns) |
| `packages/forge/os/compass/compass.module.ts` | **Updated** — remove registrations for `compass.annotate`, `compass.clear`, `compass.markup.migrate`, `compass.invariant.add`; add `compass.summary.trim` |
| `packages/os/site-kernel-codegen/src/compass-annotate.ts` | **Removed** |
| `packages/os/site-kernel-codegen/src/compass-clear.ts` | **Removed** |
| `packages/os/site-kernel-codegen/src/compass-markup-migrate.ts` | **Removed** |
| `packages/os/site-kernel-codegen/src/compass-invariant-add.ts` | **Removed** |
| `packages/os/site-kernel-codegen/src/index.ts` | **Updated** — remove exports for `runCompassAnnotate`, `runCompassClear`, `runCompassMarkupMigrate`, `runCompassInvariantAdd` |
| `packages/os/site-kernel-codegen/README.md` | **Updated** — remove documentation for 4 removed commands |
| `packages/os/site-kernel-codegen/AGENTS.md` | **Updated** — remove documentation for 4 removed commands |
| `packages/os/site-kernel-checks/src/compass-change-summary.ts` | **Renamed** to `compass-summary-trim.ts`, cap raised to 30, command name changed to `compass.summary.trim` |
| `packages/os/site-kernel-checks/src/compass.ts` | **Updated** — fix hints referencing `compass.markup.migrate` updated to reference `fo-compass-annotate` skill |
| `packages/os/site-kernel-checks/src/pipelines/standard-compass.ts` | **Updated** to remove `compass.markup.migrate` and `compass.annotate` steps |
| `packages/os/site-kernel-checks/README.md` | **Updated** — remove wiring examples for 4 removed commands |
| `packages/os/site-kernel-checks/AGENTS.md` | **Updated** — remove example code referencing `compass.annotate` |
| `packages/os/site-kernel-checks/docs/compass-operations.md` | **Updated** — remove documentation for 4 removed commands, update `compass.changesummary.tidy` references to `compass.summary.trim` |
| `docs/COMMANDS.md` | **Regenerated** — remove 4 removed commands, rename `compass.changesummary.tidy` to `compass.summary.trim` |
| `docs/architecture-dna.md` | **Updated** — DNA-42 enforcement command list updated (amends RFC-0348) |
| `.agents/skills/forge-bootstrap/SKILL.md` | **Updated** with project detection step |
| `.agents/skills/fo-fix/SKILL.md` | **Updated** with step 4.5 (compass header update) |

### Output format

Skill summary (Markdown in chat):

```markdown
## Compass annotate summary

| Status | Count |
|---|---|
| Annotated (new) | 12 |
| Updated (CHANGE_SUMMARY) | 5 |
| Audited (purpose/non-goals) | 3 |
| Skipped (test/generated/trivial) | 8 |
| Failed | 1 |

### Failed
- `packages/os/site-kernel/src/legacy.ts`: LLM generated invalid purpose (<10 words), autorretry failed
```

## Rollout

- **Default behavior**: Skill is opt-in (operator invokes explicitly or via `fo-fix` pipeline).
- **Existing files**: No bulk annotation. Skill annotates files when invoked. Operator can run `/fo-compass-annotate` on workspace to batch-process.
- **Removed commands**: `compass.annotate`, `compass.clear`, `compass.markup.migrate`, `compass.invariant.add` are removed immediately. No deprecation period (forward-only, no backward compatibility for layer A).
- **`compass.changesummary.tidy` → `compass.summary.trim`**: Renamed and cap raised. Existing tidy logic preserved and extended.
- **`STANDARD_COMPASS_PIPELINE`**: Updated to remove `compass.markup.migrate` and `compass.annotate` steps. Remaining: `compass.inventory`, `compass.validate`, `compass.changesummary.validate`.
- **`forge.yaml`**: `compass` binding section added to existing `forge.yaml` in this repo. Other projects get it via `forge-bootstrap`.
- **`forge-bootstrap`**: Updated with project detection step. New projects get compass bindings during bootstrap.

## Alternatives considered

1. **Integrate external `@syrokomskyi/code-compass` package** — Rejected. Uses OpenAI API directly (requires API key), conflicts with RFC-0350's retirement of LLM from kernel commands, and adds external dependency. Forge skill is self-contained and uses the agent's built-in LLM.

2. **Initial generation only (no lifecycle)** — Rejected. Operator explicitly requires "updatable" annotations. Without lifecycle management, headers drift from code.

3. **Keep `compass.annotate` skeleton + skill fills TODO** — Rejected. Skill replaces skeleton entirely (grilling Q6). Skeleton is a placeholder, not structure. Keeping `compass.annotate` creates dual responsibility.

4. **`compass.summary.trim` as separate skill** — Rejected. Cleanup is deterministic (trim to 30, preserve RFC/ADR items), not LLM work. Belongs in kernel.

5. **File extensions in `PREFERENCES.md`** — Rejected. Preferences are operator behavior settings, not project topology. `forge.yaml` bindings are the correct mechanism for project-specific configuration.

6. **Test file annotation** — Rejected. Test files are self-documenting via describe/it. Headers add noise without value.

7. **Keep `compass.changesummary.tidy` name, only raise cap** — Rejected. The name `changesummary.tidy` implies a narrow focus on boilerplate removal. The new name `summary.trim` better reflects the broader lifecycle role (cap management + boilerplate removal) and aligns with the skill's batch-end cleanup step. The rename is forward-only — the old command is removed, the new one is added. Churn in fix hints, docs, and COMMANDS.md is accepted as part of the forward-only policy.

8. **Keep cap at 3 unprotected items, only rename** — Rejected. The 3-unprotected cap was too aggressive for active development — files accumulating legitimate change entries would be trimmed prematurely. The 30-total cap preserves more history while still bounding block size.

## Risks

- **LLM quality variance**: LLM-generated headers may be inconsistent. Mitigation: batch-end `compass.validate` + autorretry. Skill templates constrain output format.
- **Skill portability**: Skill must work in non-TypeScript projects. Mitigation: `forge.yaml` bindings for extensions, hardcoded comment-style defaults with binding override.
- **Pipeline integration surprise**: `fo-fix` now modifies headers automatically. Mitigation: separate commit (`compass: update headers for changed files`), visible in git log.
- **`compass.summary.trim` cap change**: Raising cap from 3 unprotected to 30 total changes existing behavior. Mitigation: this is forward-only, no backward compatibility for layer A.
- **`compass.changesummary.validate` cap change**: Raising validate's cap from 3 unprotected to 30 total means files that previously failed COMPASS-CS-02 will now pass. Mitigation: `compass.summary.trim` is run as part of the skill lifecycle, keeping blocks bounded. The cap alignment between validate and trim ensures the fix hint is actionable.
- **Removed commands break existing scripts**: Any script referencing `compass.annotate`, `compass.clear`, `compass.markup.migrate`, `compass.invariant.add`, or `compass.changesummary.tidy` will fail. Mitigation: forward-only policy; update scripts in same RFC.
- **`forge/bindings@1` schema extension**: Adding a `compass` section to the bindings schema requires updating the Zod schema in `packages/forge/src/config/forge-config.ts`. Without this, `loadForgeConfig` would silently strip the `compass` section. Mitigation: schema update is listed in file system responsibilities and acceptance criteria.
- **`compass.validate` TODO(compass) sentinel check**: `compass.ts:251–274` checks for `TODO(compass)` sentinels and emits COMPASS-TODO-01. When `compass.annotate` is removed, stale sentinels would still be flagged. Mitigation: the skill replaces all `TODO(compass)` sentinels with LLM-generated prose. The COMPASS-TODO-01 fix hint is updated to reference the skill. Files with stale sentinels are cleaned by the skill's initial-generation pass.
- **Performance: skill scan cost**: The skill scans all matching files in the workspace. For a large monorepo with hundreds of `packages/**` and `services/**` files, this could be slow. Mitigation: `--changed` flag limits scan to git-diff files; `--file` targets a single file. Default invocation (`/fo-compass-annotate` without flags) scans everything but is opt-in.
- **Concurrent execution**: Two agents running the skill simultaneously on the same workspace could race on file writes. Mitigation: the skill's batch-end `compass.validate` + autorretry loop would catch conflicts. This is the same risk as the existing `compass.annotate` command and is not a regression. Operators should not run multiple annotation passes concurrently.

## Acceptance criteria

- [x] `fo-compass-annotate` skill created at `.agents/skills/fo-compass-annotate/` with `SKILL.md`, `templates/`, and `reference/` (evidence: commit 28bfe0b09)
- [x] Skill generates valid `MODULE_CONTRACT` + `CHANGE_SUMMARY` headers for files without headers (evidence: SKILL.md step 2a + templates/header-prompt.md)
- [x] Skill replaces `TODO(compass)` skeleton blocks entirely with LLM-generated prose (evidence: SKILL.md step 4 cleanup + templates/header-prompt.md)
- [x] Skill updates `CHANGE_SUMMARY` by appending items down when files change (git diff + LLM significance) (evidence: SKILL.md step 2b)
- [x] Skill performs semantic audit of `purpose`/`non-goals` vs code (evidence: SKILL.md step 2c + templates/audit-prompt.md)
- [x] Skill detects high-risk files and generates `@ai-invariant` via LLM → patterns → operator cascade (evidence: SKILL.md step 2d + reference/risk-patterns.md)
- [x] Skill skips test files (matching `compass.testPatterns` binding) (evidence: SKILL.md step 1 + forge.yaml compass.testPatterns)
- [x] Skill skips generated files (heuristic + GENERATED_MARKER) (evidence: SKILL.md step 1 skip rules)
- [x] Skill skips trivial re-export shims (<10 lines, only `export...from`) (evidence: SKILL.md step 1 skip rules)
- [x] Skill runs `compass.validate` at batch end with autorretry for failures (evidence: SKILL.md step 3)
- [x] Skill reports Markdown summary in chat (annotated, updated, skipped, failed counts) (evidence: SKILL.md step 5)
- [x] `compass.summary.trim` kernel command registered (renamed from `compass.changesummary.tidy`, cap raised to 30 total items) (evidence: commit 22b7646b9, compass.module.ts:102-118)
- [x] `compass.annotate` kernel command removed from `site-kernel-codegen` (evidence: commit 22b7646b9, compass-annotate.ts deleted)
- [x] `compass.clear` kernel command removed from `site-kernel-codegen` (evidence: commit 22b7646b9, compass-clear.ts deleted)
- [x] `compass.markup.migrate` kernel command removed from `site-kernel-codegen` (evidence: commit 22b7646b9, compass-markup-migrate.ts deleted)
- [x] `compass.invariant.add` kernel command removed from `site-kernel-codegen` (evidence: commit 22b7646b9, compass-invariant-add.ts deleted)
- [x] `compass.changesummary.tidy` kernel command removed (renamed to `compass.summary.trim`) (evidence: commit 22b7646b9)
- [x] `compass.changesummary.validate` cap updated from 3 unprotected to 30 total items (COMPASS-CS-02), fix hint updated to reference `compass.summary.trim` (evidence: commit 22b7646b9, compass-change-summary.ts:12,75)
- [x] `compass.validate` fix hints updated — references to `compass.markup.migrate` replaced with `fo-compass-annotate` skill reference (evidence: commit 22b7646b9, compass.ts:237)
- [x] `forgeBindingsSchema` in `packages/forge/src/config/forge-config.ts` extended with optional `compass` section (fileExtensions, testPatterns) (evidence: commit step 1, forge-config.ts:40-69)
- [x] `packages/forge/os/compass/compass.module.ts` updated — registrations for 4 removed commands deleted, `compass.summary.trim` added (evidence: commit 22b7646b9)
- [x] `packages/os/site-kernel-codegen/src/index.ts` updated — exports for 4 removed commands deleted (evidence: commit 22b7646b9)
- [x] `docs/COMMANDS.md` regenerated — 4 removed commands deleted, `compass.changesummary.tidy` renamed to `compass.summary.trim` (evidence: commit 7c7585f31)
- [x] `docs/architecture-dna.md` DNA-42 enforcement command list updated (amends RFC-0348) (evidence: commit 7c7585f31)
- [x] `packages/os/site-kernel-checks/README.md` updated — wiring examples for 4 removed commands deleted (evidence: commit 7c7585f31)
- [x] `packages/os/site-kernel-checks/AGENTS.md` updated — example code referencing `compass.annotate` deleted (evidence: commit 6f55cd625)
- [x] `packages/os/site-kernel-checks/docs/compass-operations.md` updated — documentation for 4 removed commands deleted, `compass.changesummary.tidy` references updated to `compass.summary.trim` (evidence: commit 7c7585f31)
- [x] `packages/os/site-kernel-codegen/README.md` updated — documentation for 4 removed commands deleted (evidence: commit 7c7585f31)
- [x] `packages/os/site-kernel-codegen/AGENTS.md` updated — documentation for 4 removed commands deleted (evidence: commit 6f55cd625)
- [x] `STANDARD_COMPASS_PIPELINE` updated to remove `compass.markup.migrate` and `compass.annotate` steps (evidence: commit 22b7646b9, standard-compass.ts:16-20)
- [x] `forge.yaml` updated with `compass.fileExtensions` and `compass.testPatterns` bindings (evidence: commit 9cd4b67df)
- [x] `forge-bootstrap` skill updated with project detection step (scan → confirm → propose extensions) (evidence: commit eb49257fe)
- [x] `fo-fix` skill updated with step 4.5 (compass header update, separate commit) (evidence: commit eb49257fe, fo-fix/SKILL.md:114-118)
- [x] `forge.skill.validate` passes on `fo-compass-annotate` skill (evidence: forge.skill.validate output, 0 violations for fo-compass-annotate)
- [x] `rfc.validate` passes on this RFC file (evidence: rfc.validate RFC-0538 status=pass)
- [x] All affected packages pass `build:check` (typecheck) (evidence: site-kernel-checks, site-kernel-codegen, @wgogol/forge all pass tsc --noEmit)
- [x] `AGENTS.md` updated where agent behavior rules changed (evidence: commit 6f55cd625)
- [x] `enhancedAt` set to today's date (evidence: RFC frontmatter enhancedAt: 2026-07-26)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **Skill file granulation**: Keep templates, prompts, and reference data in separate files alongside `SKILL.md`. Do not embed prompt text inline in `SKILL.md`.
- **Minimize operator distraction**: Skill works autonomously by default. Only ask operator when there is genuine ambiguity (e.g. risk detection cascade reaches step 3).
- **No external API keys**: Skill uses the agent's built-in LLM, not OpenAI API. Do not add `openai` dependency.
- **Forward-only**: Removed commands (`compass.annotate`, `compass.clear`, `compass.markup.migrate`, `compass.invariant.add`) are gone. Do not add backward compatibility shims.
