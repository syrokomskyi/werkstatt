# Warpgogol Platform Agent Guide

This file defines the repository-wide instruction layer for this Turborepo. Prefer the closest nested `AGENTS.md` for workspace or directory details, and keep this root file focused on monorepo-wide rules.

## Monorepo layout

- This repository is a Turborepo + pnpm-workspace monorepo on Astro 6 + TypeScript strict.
- Deployable sites live as Sternsystemen registered in `systems/registry.yaml`. Each Sternsystem declares a `mirrors[]` array (RFC-0574): `mirrors[0]` is the non-bare cache clone (outside the monorepo), `mirrors[1]` is the bare repo, and `mirrors[2+]` are external mirrors. A pin file lives at `mirrors[0].path/system.pin.json`, and an active mission workpiece at `missions/<missionId>/workpiece/` when a mission is in progress. The `apps/*` directory is retired (RFC-0381); shared site composition conventions now live in `docs/authoring/site-composition.md`.
- Deployable backend runtime compositions live in `services/*`. Treat them as the backend analogue of site workspaces: thin wiring, runtime entrypoints, environment/store/queue selection, deployment config, and health checks only.
- Shared and reusable libraries live in `packages/*` (UI, share, ontology, business, growth, growth-adapters, passport, nebula, star-map, tokens, agent-gate, forge) and `packages/os/*` (site-kernel and its sub-modules, including changelog, deploy, integrity, onboarding, and handoff).
- New sites must be created via `onboarding.scaffold`, not by copying an existing site.
- A site's job is **composition only**: `src/content/system.md` + `src/content/**` + a few thin proxy files. All section, component, runtime, and validator logic lives in `packages/*`. If you find yourself adding logic to a site, ask whether it belongs in a package first.
- A service workspace's job is **runtime composition only**. Shared schemas, reusable browser capture, check rules, report shapes, adapters, and validators belong in `packages/*`; services must not import from site workspaces, and site workspaces must not import from `services/*`.

## External mirror sync (RFC-0472, RFC-0574)

- Each Sternsystem declares a `mirrors[]` array in `systems/registry.yaml`. `mirrors[0]` is the non-bare cache clone, `mirrors[1]` is the bare repo, and `mirrors[2+]` are external mirrors (git remotes, backup endpoints).
- `sternsystem.sync --id <id>` synchronizes all mirrors via star topology through `mirrors[0]` (cache clone). It pushes from cache to bare, then from bare to external git mirrors. Per-mirror failures are non-fatal. It is an **automatic pipeline step** — `mission.reconcile` calls it automatically after pushing to the bare repo when external mirrors are configured (RFC-0705).
- `mission.reconcile` enforces `sternsystem.sync` automatically (RFC-0705): after `git push origin` to the bare repo, reconcile calls `sternsystem.sync --id <id>` via `executeKernelCommand` when `mirrors[2+]` exist. Sync failure is non-fatal (`logger.warn`). `mission.close` blocks before state transition if external mirrors are out of sync (`mirrorInSync === false` and `mirrors.length > 2`). The manual `sternsystem.sync` invocation remains available for ad-hoc sync needs.
- `mission.close` also calls `sternsystem.sync` automatically (RFC-0762): after all cache clone commits (werkstatt, pin, bordbuch) and before writing `.materialization-state.json`, close invokes `sternsystem.sync --id <id>` when `mirrors[2+]` exist. This propagates close-created commits to external mirrors. Sync failure is non-fatal (`logger.warn`) — the mission is already closed (irreversible), the operator can retry manually. The `closeReport.mirror.synced` and `closeReport.mirror.syncError` fields track the sync result.
- `sternsystem.validate` enforces mirror topology rules: `mirrors[0]` must be non-bare, mirror paths must exist, `bundle` storageType must not use git protocols, and no embedded credentials.
- Agents MUST NEVER edit any Sternsystem mirror directly — only through mission workpieces.

## Werkstatt plugin contract (RFC-0770)

The Werkstatt engine is stack-agnostic. Stack-specific logic (Astro, Phaser, video rendering) is contributed by a **plugin** — an npm package implementing the `werkstatt/plugin@1` contract. The engine and plugin together form a **workshop** (a consumer monorepo).

- **Plugin contract:** `WerkstattPlugin` interface in `packages/werkstatt/src/plugin-contract.ts`. A plugin declares `schema: "werkstatt/plugin@1"`, an `id`, a `profileId` (matching a Forge stack profile), `moduleLoaders`, optional `pipelines`, `deployAdapters`, `hooks`, `paths`, and `invariants`.
- **One plugin per workshop:** The engine refuses to start with zero or multiple plugins. `PluginRegistry.resolve()` throws if the count is not exactly one.
- **Profile binding:** The plugin's `profileId` must match the `profile` field in `forge.yaml`. This is the single source of truth for stack identity.
- **Hook list is closed:** Five hooks — `materialize`, `build`, `checkGate`, `releaseEvidence`, `scaffoldProject`. Adding a new hook requires a superseding RFC, not an amendment.
- **Validation:** `werkstatt.plugin.validate` checks plugin registration, profile binding, module loader resolution, and deploy adapter presence. Failure modes: PLUGIN-01 (zero/multiple plugins), PLUGIN-02 (profileId mismatch), PLUGIN-03 (module loader failure), PLUGIN-04 (missing deploy adapter), PLUGIN-05 (missing kernel.config.ts).
- **Warn-only transition:** Until `forge.yaml` has a `profile` field, PLUGIN-01 is a warning, not an error. This allows workshops to operate without a plugin during the transition period (RFC-0776).
- **Package:** `@warpgogol/werkstatt` (`packages/werkstatt/`) owns the contract types, plugin registry, and the `werkstatt.plugin.validate` command. The module is registered in `tools/kernel.config.ts` as `werkstatt-plugin`.

## Repository setup (Git LFS)

This repository uses **Git LFS** for media files. Ensure `git lfs install` has been run once in the repo before working with it, otherwise video/image files will appear as LFS pointers instead of real content. CI templates (`github-deploy.template.yml`) already include `lfs: true` in the checkout step.

Tracked patterns (legacy from `apps/**`, retained for historical content): `apps/**/*.mp4`, `apps/**/*.webm`, `apps/**/*.png`, `apps/**/*.jpg`, `apps/**/*.jpeg`, `apps/**/*.webp`. New site media should be colocated under `missions/*/workpiece/public/**` or `systems/<id>/public/**`.

## .gitignore anchoring

When adding a `.gitignore` pattern that targets a **top-level** directory or file (e.g. `agents/`, `missions/`, `notausgang-*`), always anchor it with a leading `/` (e.g. `/agents/`, `/notausgang-*`). Without the leading `/`, git treats the pattern as matching any path component at any depth — so `agents/` blocks `docs/agents/` and `packages/os/site-kernel-changelog/src/changelog/agents/` too. This caused 11 source files to be silently excluded from commits (discovered 2026-08-04).

## Forge project configuration (RFC-0391)

`forge.yaml` at the repository root is the machine-readable project configuration for `@warpgogol/forge`. It records project name, stack, package manager, and docs paths. `forge.create` creates it; `forge.doctor` checks for it; `forge.agents.generate` reads it to produce `AGENTS.md` in bootstrapped projects. The `.forge/` directory (RFC-0733) sits alongside `forge.yaml` and contains project-local governance files: `pinned.yaml` (pinned-files manifest) and `pinned-audit.log` (override audit trail, gitignored).

- **MUST NOT** run `forge.agents.generate` against this monorepo's root `AGENTS.md` — it is hand-written and carries no generated marker; the edit guard enforces this, do not bypass it.
- **MUST NOT** re-add any `@warpgogol/*` import to `packages/forge` source — `forge.doctor` autonomy guard will fail.
- **MUST NOT** hand-edit a generated `AGENTS.md` in bootstrapped projects — edit `forge.yaml` and regenerate.

## Forge bindings contract (RFC-0393)

The `bindings` section in `forge.yaml` de-hardcodes project-specific values from fo-skills. Skills reference bindings by key (e.g. `ref(forge.yaml bindings.commands.validateRfc)`) instead of hardcoding commands, paths, or terminology. `forge.doctor` validates bindings; `forge.skill.validate` enforces SKILL-11 (no hardcoded project literals in skill instruction lines), SKILL-12 (concerns must be one of four-level enum: read-only, document-only, content-mutation, code-mutation), SKILL-13 (declared knowledge files must exist relative to SKILL.md directory), and SKILL-17 (no specific platform RFC/ADR ids or platform names in skill files). See `packages/forge/AGENTS.md` for details.

## Spec vendoring (RFC-0394..0397)

External specification packages are vendored as immutable snapshots under `docs/specs/<spec-id>/` with an integrity manifest (`integrity.yaml`) and a machine-readable projection (`forge-spec.yaml`, schema `forge/spec@1`).

- **MUST NOT** edit any file inside `docs/specs/<id>/` except `forge-spec.yaml`'s `materializedAs`/`promotedTo` fields (RFC-0396) and `amendments/**` (RFC-0397). Snapshot files are immutable.
- **MUST NOT** regenerate `integrity.yaml` for an existing spec — that erases tamper evidence.
- **MUST** cite spec decisions as `<spec-id>/ADR-NNN`, never bare `ADR-NNN`.
- **MUST NOT** copy spec model content (schemas, field tables, invariant lists) into RFCs — reference the snapshot section instead.
- `spec.validate` enforces SPEC-01..07 (integrity, schema, cycles, references, waves, duplicates, materializedAs).
- `spec.materialize --spec=<id> --next=<N>` scaffolds RFC files for front nodes with `specRef` traceability.
- `spec.status --spec=<id>` shows per-node states, blockers, and progress.
- Spec amendments (`docs/specs/<id>/amendments/amd-NNN-*.md`) are the only correction channel — snapshot files are never modified.

## Living feature specs (RFC-0711)

Living feature specs are mutable markdown documents under `docs/specs/live/<domain>.md` that reflect the **current** specification of a feature or module. Unlike vendored spec snapshots (DNA-55), living specs evolve through delta merges from archived RFCs.

- **`spec.live.merge --id <RFC-XXXX>`** extracts headings from the RFC's `## Design` section and merges them into the corresponding living spec. Domain is auto-derived from `packagesImpacted[0]` when `liveSpec: true`, or uses the string value when `liveSpec: <domain>`. All-or-nothing: aborts on any heading conflict without writing. Use `--dry-run` to preview.
- **`spec.live.list`** lists all living specs with domain, title, lastMergedRfc, and history count.
- **`spec.live.show --domain <name>`** reads and returns a single living spec.
- **`spec.live.validate`** validates all living specs with rules V-LS-01..05 (frontmatter, domain/filename match, archived RFC references, history integrity, duplicate domains).
- **`docs.archive`** automatically calls `spec.live.merge` for implemented RFCs with a `liveSpec` frontmatter field after archiving. Rejected RFCs with `liveSpec` are skipped.
- RFCs declare participation with `liveSpec: true` (auto-derive domain) or `liveSpec: <domain>` (explicit) in frontmatter.

## Public Business Profile (PBP) program (RFC-0398)

The Public Business Profile (PBP) specification is vendored at `docs/specs/pbp-specification-package/` (accepted, `pbp/*@1`). It defines a universal logical model for the public digital profile of a business, replacing the former business layer (DNA-20) through a 65-RFC, 5-wave implementation program. Warpgogol-com is the first migration target.

- **Terminology:** RFC-0398 (Program Charter and Terminology) is the normative glossary. All downstream PBP RFCs MUST use its entity glossary (Business, Product, CatalogEntry, Offering, Policy, Claim, EvidenceSource, Disclosure, Projection, Canonical, Runtime state), state vocabulary (`not-declared`, `false`, `null`, `not-applicable`, `unavailable`, `invalid`), and architectural layer mapping.
- **Namespace:** `pbp/*@1` is the frozen namespace. No key renames, no semantic changes, no optional→required promotions within `@1`. Incompatible changes require `@2` and a migration contract.
- **DNA-20 relationship:** `@warpgogol/pbp` is the canonical business layer for all sites (DNA-20 superseded by RFC-0471). No compatibility layer (ADR-043). PBP lives in `packages/pbp/` (established by RFC-PBP-001). People records now live in a standalone `people` content collection.
- **Spec citations:** Always cite as `pbp-specification-package/ADR-NNN` or `pbp-specification-package/<doc-name>#<anchor>`. Never copy spec model content into RFCs — reference the vendored snapshot section instead.
- **Materialization:** RFCs are lazily materialized via `spec.materialize --spec=pbp-specification-package --next=<N>`. Each materialized RFC carries `specRef: "pbp-specification-package/<node-id>"` traceability.

## Linux development environment

This monorepo is developed on Linux (Ubuntu). AI agents can assume a POSIX environment with native GNU coreutils. See [`docs/policies/linux-tooling.md`](docs/policies/linux-tooling.md) for the tool inventory, installation commands, and environment audit.

**Exception:** `@warpgogol/forge` (published to npm) must remain cross-platform — it ships skills and command modules that consumers may run on Windows or Linux. Forge source and skills must not assume a POSIX-only environment.

## Removal discipline

Before removing any code, field, schema, prop, config entry, or other project artifact, investigate why it was added. Removal is irreversible context loss.

1. **Git history** — `git log -- <path>`, `git blame <path>` to find when and why the artifact was introduced.
2. **RFCs and ADRs** — search `docs/rfcs/` and `docs/adrs/` for references to the artifact.
3. **Mission context** — check `mission.yaml` and the mission brief for stated goals that required the artifact.
4. **Cross-references** — grep for the artifact name across the codebase.
5. **Semantic purpose** — does the artifact have a clear purpose? Purposeful artifacts are intentional.

If the artifact was intentionally added, the fix is to **extend the schema/contract** to accommodate it, not to remove it. A validation error (e.g. PAGE-PROPS-01) means the schema hasn't caught up with the intended model — the default response is to extend the schema, not to strip the content. See `_shared/fo-pipeline-conventions.md` §Removal discipline in the Forge skills.

## GitHub Actions CI reliability patterns

All `.github/workflows/*.yml` in this monorepo MUST include these baseline reliability patterns:

- **`concurrency`** — cancel superseded PR runs to save CI minutes and prevent cache thrashing. Set `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`.
- **`permissions: contents: read`** at the workflow level — GitHub Actions defaults to `contents: write`. Escalate to `write` per-job only where needed (e.g. changelog commit).
- **`timeout-minutes`** per job — the default 6-hour timeout can exhaust CI limits on a hung install or test. Use 10–15 for lint/validate, 20–30 for build/test.
- **`env: TZ: UTC`** per job — tests using `new Date()` produce different results depending on the runner's timezone. `TZ: UTC` makes timestamps deterministic across runs.
- **`actions/checkout@v5`** and **`actions/setup-node@v5`** — use the latest action versions with Node 24 runtime. Older versions (`@v4` and below) run on the deprecated Node 20 runtime.
- **Windows CI** — only add Windows to the matrix where the product genuinely supports or ships Windows artifacts. If Windows is included, set `core.longpaths` via `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0`/`GIT_CONFIG_VALUE_0` env **before** the checkout step. Do not pin to `windows-latest` — use a specific image version (e.g. `windows-2022`) if native compilation is critical.

## Platform-scope commit discipline (RFC-0703, RFC-0754)

- Agents MUST use `ecosystem.commit` for all commits. It auto-detects scope: platform-only commits get version bump + trailers, non-platform-only commits delegate to `git commit` without bump, mixed-scope commits split into two sequential commits (platform + non-platform). Direct `git commit` for `packages/**`, `integrations/**`, `services/**` is blocked by the pre-commit hook (`hooks/pre-commit`) and the CI gate (`platform.commit.discipline.validate`).
- The pre-commit hook is activated via `git config core.hooksPath hooks` (one-time per clone). New clones need this activation.
- `ecosystem.commit` sets `ECOSYSTEM_COMMIT=1` env var to bypass the hook — this is the only sanctioned bypass.
- `mission.close` auto-pins the platform version by calling `sternsystem.pin` after successful close (RFC-0703).

### Independent version packages (RFC-0704)

- `independentVersionPackages` in `forge.yaml` declares packages with autonomous npm versions (e.g. `packages/forge`). `ecosystem.commit` automatically skips the platform version bump when ALL staged platform files belong to these packages.
- Agents do NOT need to pass any flag — `ecosystem.commit` detects the skip case automatically based on `forge.yaml` and the staged files.
- If a commit touches files in BOTH an independent package AND a non-independent package (e.g. `packages/forge/**` + `packages/os/**`), the platform version IS bumped. Only commits where ALL staged platform files are in `independentVersionPackages` skip the bump.
- Agents MUST still use `ecosystem.commit` for ALL `packages/**` changes, including independent packages — never manually set `ECOSYSTEM_COMMIT=1` and run `git commit` directly.
- Path matching uses `startsWith(pkgPath + "/")` — `packages/forge` matches `packages/forge/**` but NOT `packages/forge-os/**`.
- `forge.doctor` validates that each path in `independentVersionPackages` exists and contains a `package.json`. Stale entries are reported as warnings.

## Active instruction model

- **Skill invocation tracking (NON-NEGOTIABLE):** When the operator invokes a fo-skill (e.g. `fo-idea-i-just-want-to-see-the-result`, `fo-idea-implement`, `fo-fix`, `fo-review`) in the first message of a session, the agent MUST follow that skill's full pipeline to completion. Do NOT fall back to a manual step-by-step plan. The skill's pipeline (audit → enhance → plan → implement → review → fix) exists for a reason — skipping phases produces lower-quality results. The operator's invocation IS the instruction to run the entire pipeline autonomously. See `PREFERENCES.md` § Skill invocation tracking for details.
- **RFC/ADR creation pipeline (NON-NEGOTIABLE):** When a task requires an RFC or ADR (architectural changes, new commands, cross-workspace contracts, DNA invariant changes, AGENTS.md rule changes), the agent MUST use the `fo-idea` skill pipeline: (1) start with `fo-idea` to classify the request as RFC or ADR, (2) `fo-idea` routes to `fo-idea-create-rfc` or `fo-idea-create-adr`, (3) `fo-idea-create-rfc` uses `rfc.create` to assign the RFC number automatically — agents MUST NEVER manually scan `docs/rfcs/` with `ls`/`find`/`grep` to determine the next number (the RFC number space includes archived RFCs under `docs/rfcs/archive/` — a top-level-only scan misses them and produces duplicate IDs), (4) the skill handles grilling, template filling, validation, and commit. This applies to ALL RFC/ADR creation tasks regardless of whether the operator explicitly mentions "RFC" — if the task is architectural, introduces new commands, changes cross-workspace contracts, or modifies DNA invariants, it needs an RFC via the `fo-idea` pipeline.
- **Commit hygiene (NON-NEGOTIABLE):** When applying review findings or multi-axis fixes, the agent MUST: (1) run `git diff` (not just `git diff --cached`) on every touched file before committing — unstaged changes in already-touched files are easily missed when using `git add -p` or staging specific hunks; (2) run `git status` after every commit — confirm the working tree is clean, and if files remain unstaged, either commit them or explicitly report them to the operator; (3) never leave partial fixes in the working tree — if a review finding was applied to a file, the entire fix for that finding must be in the same commit.
- **Auto-commit after each operator request (NON-NEGOTIABLE, RFC-0622):** The agent MUST commit file changes after every standalone operator request that produces file changes, via the `fo-step-commit` skill. The skill stages only files the agent changed in that request (never `git add -A` or `git add .`), commits in both the monorepo and the active mission workpiece, and writes conventional commit messages. The operator can opt out per-request by saying "не коммить" or "don't commit". During multi-step skill pipelines, only the parent skill's explicit invocations fire — the default auto-commit behavior is suppressed.
- **Template-first fixes (NON-NEGOTIABLE):** When fixing a bug or review finding in a generated file (e.g. `apps/*/src/middleware.ts`, `apps/*/src/content.config.ts`), the agent MUST fix the owning template or generator in `packages/os/site-kernel-codegen/src/templates/` first, then re-run the owning command (e.g. `routes.generate`) to propagate the fix to downstream generated files. Fixing only the generated output without fixing the upstream template means the next regeneration overwrites the fix. The `generator.ownership.lint` check enforces single-ownership of generated files — always trace a generated file back to its template.
- Windsurf should follow the nearest applicable `AGENTS.md` first.
- For repository-wide, cross-workspace, architectural, shared-package, or high-risk tasks, read `docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/knowledge-graph.xml`, `docs/verification-plan.xml`, `docs/source-markup.xml`, and `docs/styling.xml` before planning or editing code.
- Treat the root `docs/*.xml` Compass files as the primary machine-readable semantic layer for AI work in this monorepo.
- Use `docs/source-markup.xml` as the canonical source-file Compass contract and `docs/compass-inventory.xml` as the current rollout/inventory snapshot when those files exist.
- After reading these root instructions for workspace-scoped work, read `docs/ecosystem.generated.yaml` as the generated Agent Control Plane projection of current apps, packages, commands, pipelines, RFC status counts, generated ownership, and maintenance-command surfaces. Treat it as generated context only; normative sources remain AGENTS.md, Compass XML, RFCs, package manifests, and live registries.
- When workspace topology, root pipelines, or command surfaces change, update the generator/registries first, then run `ecosystem.manifest.generate`; do not hand-edit `docs/ecosystem.generated.yaml`. `ecosystem.manifest.validate` and `workspace.surface.validate` are the drift guards for this projection.
- **`ecosystem.manifest.generate` ≠ `command.manifest.generate`.** These are different commands writing different files: `ecosystem.manifest.generate` → `docs/ecosystem.generated.yaml` (ecosystem projection); `command.manifest.generate` → `docs/command-manifest.generated.yaml` (per-command metadata). `rfc.validate` RFC-CMD-02 checks the command manifest, not the ecosystem manifest. When an RFC adds/changes/removes commands, always run `command.manifest.generate` — running `ecosystem.manifest.generate` instead leaves the command manifest stale.
- Keep root rules cross-workspace and portable.
- Put shared site rules in `docs/authoring/site-composition.md`.
- Put shared backend runtime rules in `services/AGENTS.md`.
- Put shared package rules in `packages/AGENTS.md`.
- Put site-specific rules in the site's own `AGENTS.md`.
- Keep `.agents/**` as reference or historical documentation, not as the primary active instruction layer — except `.agents/memory/` (active agent context store, RFC-0664), `.agents/skills/` (synced by forge), and `.agents/operator-profile.md` (operator preferences).
- Keep operational discipline rules (commit hygiene, template-first fixes, skill invocation tracking) in this `AGENTS.md` — not in `PREFERENCES.md`. `PREFERENCES.md` (RFC-0370) is for operator-facing preferences (language, form of address, register, session saving) only.

## RFC frontmatter conventions

- **`related` MUST NOT duplicate `amends` or `satisfies` entries.** The `related` field lists RFCs/DNA invariants that are relevant but not formally amended or satisfied. Entries already in `amends` or `satisfies` are implicitly related and must not be repeated.
- **`commands.changed` MUST only list commands whose source code actually changed.** Commands whose behavior is formally documented or clarified without a code change (e.g. "already correct, no change needed") MUST NOT be listed in `commands.changed`. Use the RFC body to document the formal contract instead.
- **RFC-to-code consistency MUST be verified when transitioning to `implemented`.** Before stamping `implemented`, the agent opens every file referenced in the RFC and confirms that: (1) evidence line numbers in acceptance criteria point to the actual implementation being verified, not nearby unrelated code; (2) TypeScript contracts and JSON output examples use field names and types from the real interface, not invented ones; (3) file paths in the Design section match actual files on disk. The RFC describes the code — the code is the source of truth, not the RFC.
- **Deferred or future-phase criteria MUST NOT stay in the Acceptance criteria section.** `rfc.implement.stamp` (RFC-IMP-02) blocks stamping if any `[ ]` unchecked criteria remain. Move Phase 2 / deferred / external-package-blocked criteria to a separate "Future work" or "Phase 2" section outside the Acceptance criteria block. Only criteria that are actually met with evidence belong in Acceptance criteria.

## ADR validation conventions

- **`adr.validate` enforces AV-12: `## Justification` is a required markdown section.** The ADR template (`adr-0000-template.md`) includes it, but hand-written ADRs sometimes omit it. Always run `adr.validate --id ADR-XXXX` after creating or transitioning an ADR and add any missing required sections before proceeding.

## Operator preferences (RFC-0370)

Before starting an interactive skill, read `PREFERENCES.md` at the repository root. If it is missing, ask the operator for the relevant language preference and create it using the `my-preferences` skill.

Supported keys:

- `aiLanguage` — language for **all** AI communication with the operator in the current session: questions, responses, summaries, reports, status updates, and any other chat output.
- `documentationLanguage` — default language for generated RFCs, ADRs, READMEs, and other project documentation.
- `saveSessions` — when `true` (default), the agent saves session transcripts at end of each session via `session.save` (RFC-0537). Set to `false` to opt out.

Skills that must read these preferences before interacting include: `windows-ai-tooling`, `grilling`, all `fo-*` skills, and `improve-codebase-architecture`. Each skill uses `aiLanguage` for **all** communication with the operator (not only questions and responses) and `documentationLanguage` for generated documents, reports, and prose artifacts.

Use the operator's chosen language for all natural-language output in the session — this includes chat messages, summaries, transition reports, error explanations, and any other text directed at the operator. Do not translate existing files automatically; preferences only affect new output and current-session interaction.

## Compass document duties

- Keep the root Compass files synchronized with the current codebase, workspace topology, verification flow, and architecture boundaries.
- Update the affected `docs/*.xml` files in the same change whenever a task changes repository-wide requirements, shared package contracts, app-package relationships, or verification policy.
- For new non-trivial source files in `apps/` or `packages/`, add Compass semantic scaffolding such as `MODULE_CONTRACT`, `MODULE_MAP`, `CHANGE_SUMMARY`, and stable paired semantic anchors.
- Backfill Compass semantic scaffolding incrementally when substantially editing high-risk or hard-to-navigate existing files; do not churn untouched files only to add markup.
- Follow the coverage modes and anchor conventions defined in `docs/source-markup.xml` instead of inventing local markup patterns.

## Cosmic naming contract (DNA-23, RFC-0025, RFC-0028) — non-negotiable

Every page/section/component carries a `cosmicName` from one of three closed catalogs in `@warpgogol/ontology`:

| Layer | Catalog | Source | Used as | Examples |
| --- | --- | --- | --- | --- |
| Page | `StarCatalog` (IAU stars) | `*-page.manifest.yaml` `cosmicName` + `system.md` `pages[].cosmicStar` + page `.md` `cosmicStar` | identifies a route | `Vega`, `Sirius`, `Polaris` |
| Section | `PlanetCatalog` (Jupiter/Saturn/Mars + dwarf planets) | `*-section.manifest.yaml` `cosmicName` + `system.md` `pages[].planets[].cosmicPlanet` + page `.md` `blocks[].type` (resolved to cosmicPlanet) | invokes a section | `Europa`, `Hyperion`, `Mimas` |
| Component | `MoonCatalog` (Uranus/Neptune/Pluto + irregular Jupiter/Saturn) | `*-component.manifest.yaml` `cosmicName` + `system.md` `pages[].shell.<slot>.cosmicMoon` | invokes a component (shell, passport) | `Desdemona`, `Oberon`, `Titania` |

**Resolution.** `@warpgogol/share/page` `PLANET_IMPORT_PATHS` and `MOON_IMPORT_PATHS` map cosmic names to import paths into `@warpgogol/ui`. **Every name added to a manifest must also appear in one of these maps**, and vice versa — silent mismatches cause `[buildPage] No component import path registered for ...` at runtime.

**Passport-reserved moons (RFC-0028):** `Methone`, `Despina`, `Klarissa`, `Bianca`, `Adrastea`. These five names are EXCLUSIVELY the cosmicNames of:

- `passport-header-component` → `Methone`
- `pulsar-component` → `Despina`
- `passport-score-grid-component` → `Klarissa`
- `passport-provenance-component` → `Bianca`
- `passport-star-map-component` → `Adrastea`

Pages invoke them via `use: <ReservedMoon>` in `cosmic/passport.md` / `cosmic/star-map.md`. Do not reuse these names elsewhere.

**Three-way alignment to verify before merging.** If you change any cosmic name, update **all three** sites simultaneously:

1. The `cosmicName` in the relevant manifest.yaml under `packages/ui/src/{sections,components}/`
2. The matching entry in `PLANET_IMPORT_PATHS` or `MOON_IMPORT_PATHS` in `packages/share/src/page.ts`
3. Every `system.md` that pins it, plus every page `.md` `blocks[].type` that resolves to it

`cosmic.catalog.validate`, `cosmic.name.unique`, `manifest.contract.validate`, and `page.block.validate` together enforce these invariants — but they only catch the misuse, not the fix.

**Constellation slots — one cosmicName per slot.** Constellation YAML schema is `cosmicName: PlanetName` (single value). **Never** use arrays/unions like `[Io, Titan]`. If a constellation should accept more than one Planet at the same narrative position, declare **two separate slots** in sequence with `optional: true` on each. See `packages/AGENTS.md` "Constellation slots" for examples.

## CMS-friendly content surface, Feature Policy, Deal Lifecycle, CKL

See [`docs/policies/content-contracts.md`](docs/policies/content-contracts.md) for the full text of:

- CMS-friendly content surface (RFC-0047) — migration complete
- Feature Policy (RFC-0183) — no `src/content/features/**`
- Deal Lifecycle State Chart (RFC-0219) — generated state chart is authoritative
- Content Knowledge Lifecycle (RFC-0211..0218) — claims, provenance, temporal validity

## Agent Surface, Telemetry, Env-and-Deploy, Testing Policy

See [`docs/policies/agent-surface-ops.md`](docs/policies/agent-surface-ops.md) for the full text of:

- Agent Surface (RFC-0286..0290) — manifest, projections, discipline rules
- Telemetry-read lane (RFC-0344) — read-only SigNoz access, incident notes
- Env-and-deploy contract (RFC-0761 / DNA-40) — .env.example, .env, deploy.preflight, # How to obtain: instructions
- Testing policy (RFC-0347) — vitest, fast-check, PBT conventions

## Build verification discipline

Agents **MUST NOT** run root `pnpm build` or `turbo run build` during agent workflows. See [`docs/policies/build-verification.md`](docs/policies/build-verification.md) for scoped typecheck verification rules, command execution timeout discipline (6-minute budget), and rationale.

Agents **MUST NOT** use name-based `pnpm --filter <name>` for app-level commands (build, build:check, astro build, astro check, astro dev, start) when multiple workspaces share the same name — this is the case for every Sternsystem with active mission workpieces (e.g. `warpgogol-com` matches both `systems/warpgogol-com` and every `missions/warpgogol-com-m*/workpiece`). A name-based filter runs the command in **all** matching workpieces in parallel, which builds or starts dev servers in mission workpieces unintentionally and can fail on stale workpiece state. Instead, use one of:

- **Path-based filter:** `pnpm --filter ./systems/<id> exec <cmd>` or `pnpm --filter ./missions/<missionId>/workpiece exec <cmd>`
- **Direct execution:** `cd <dir> && pnpm exec <cmd>`
- **Mission dev server:** `pnpm exec site-kernel run mission.preview --mission <missionId> --port <port>` (preferred for mission workpieces)

When clearing the pipeline cache to force step re-execution (e.g. after deleting generated output files), agents MUST clear `.cache/pipeline-cache-hits.json` at the **werkstatt root**, not just `missions/*/workpiece/.cache/`. The pipeline cache-hits file lives at the workspace root and persists across builds — clearing only the workpiece `.cache/` directory does not reset the pipeline skip logic, causing steps like `sitemap.generate` to be skipped as `SKIP (cached)` even when their output files have been deleted.

## Commit discipline (RFC-0480)

Agents MUST commit immediately after each completed and verified change — not at the end of the session. The workflow is: **edit → verify (typecheck/build) → commit → respond**. Never respond to the operator with uncommitted changes from the current session.

Two commit paths depending on what was edited:

**Mission workpiece edits** — use `mission.git.commit`, not direct `git commit`:

```sh
rtk pnpm exec site-kernel run mission.git.commit --mission <missionId> --message "<descriptive message>"
```

**Platform/package edits** (files under `packages/*`, `docs/*`, root config, etc.) — use `ecosystem.commit` (RFC-0533) for platform-scope changes (`packages/**`, `integrations/**`, `services/**`):

```sh
rtk pnpm exec site-kernel run ecosystem.commit --message "<imperative clause>" [--rfc RFC-XXXX] [--dry-run]
```

For non-platform changes (`docs/rfcs/**`, `missions/**`, root config files), use `git add <specific files> && git commit`:

```sh
rtk git add packages/os/site-kernel-handoff/src/mission/mission-materialize.ts
rtk git commit -m "fix: <imperative clause>"
```

Rules:

- **Platform-scope changes MUST use `ecosystem.commit`** (RFC-0533). The command atomically bumps `package.json` version, computes the platform semantic hash, writes `docs/platform-version-log.generated.yaml`, and commits with `X-Platform-Bump` / `X-Platform-Version` / `X-RFC` trailers. Direct `git commit` for platform scope is blocked by the pre-commit hook (`hooks/pre-commit`) and enforced by PC-04 in `platform.consistency.validate`.
- Commit only files changed in the current session. Check `git status` and `git diff` before committing to exclude changes from other sessions or agents.
- `mission.git.commit` stages all workpiece changes (`git add -A`) and commits with a structured audit-trail message. RFC-0594: it also runs targeted content validators (`pbp.content.validate`, `semantic.drift.validate`, `faq.validate`) based on changed file paths before committing — invalid content is refused with exit code 1.
- Direct `git commit` in the workpiece is discouraged but not technically prevented.
- `mission.reconcile` and `mission.close` block if the workpiece has uncommitted changes — run `mission.git.commit` first.
- `mission.close` mandates `evidence.sync` to R2 before writing `close-report.json` (RFC-0652). The `--skip-evidence-sync` flag is an escape hatch for offline scenarios only — it appends a Bordbuch audit entry. Agents MUST NOT use `--skip-evidence-sync` unless explicitly directed by the operator.
- `mission.cleanup` removes `evidence/axiom/` older than `--evidence-retention-days` (default: 30). Non-Axiom evidence is always preserved (RFC-0652).
- `mission.validate` warns (non-blocking) if the workpiece is dirty after validation — commit generated artifacts too.
- Before sending any response to the operator, verify via `git status` that no uncommitted changes from the current session remain. If any exist, commit first.
- **Session-start pre-flight (NON-NEGOTIABLE, RFC-0575):** At the start of `fo-idea-implement` and `fo-fix` skill pipelines, the agent MUST run `git status --short` in the werkstatt root and in each active mission workpiece (if any). If foreign uncommitted changes are found, the agent MUST: (1) report them to the operator, (2) never modify, stage, or discard them, (3) stage only its own files by explicit path, (4) verify `git diff --cached --name-only` before every commit excludes foreign files.
- **Git hook activation (RFC-0534).** The pre-commit hook at `hooks/pre-commit` requires `git config core.hooksPath hooks/` to be active. Agents MUST invoke the `setup-ecosystem` skill when setting up a new development environment or after cloning the repository without onboarding. The `onboard` skill's Prepare step checks and configures this automatically for new onboarding.

## Site content editing rule (non-negotiable)

All site content changes — markdown, YAML, frontmatter, prose, business-profile, navigation, surface, people, FAQ, any file under `src/content/**` — MUST be made in the **active mission workpiece** (`missions/<missionId>/workpiece/`), never in the cache clone (`../systems-cache/<id>/`), bare repo, or external mirrors.

- The cache clone and mirrors are read-only for agents. They are updated exclusively through `mission.reconcile` and `mission.close` pipeline steps.
- If no mission is open, the agent MUST ask the operator to open one (`mission.open --system <id> --brief "<brief>"`) before making any content changes.
- This rule applies to all agents in all IDEs. Violating it breaks the audit trail and bypasses the mission lifecycle.

## Mission lifecycle discipline

When the operator asks to start a new mission, the agent workflow is:

1. `mission.open --system <id> --brief "<brief>"`
2. `mission.materialize --mission <missionId>`
3. **STOP** — wait for further commands from the operator.

Agents MUST NOT begin investigating, diagnosing, or fixing the issue immediately after materialization. The operator will provide specific instructions on what to do next. This is non-negotiable workflow discipline that applies to all agents in all IDEs.

## Deployment pipeline discipline

The deployment pipeline is strictly ordered. Agents MUST NOT skip steps, reorder, or deploy directly to Main.

1. **Dev** — `leitstand.dev-deploy --site <id>` — deploys workpiece to dev channel with Axiom verification gate. For existing releases: `leitstand.dev-deploy --site <id> --release <releaseId>`.
2. **Alt** — `leitstand.propagate --release <releaseId>` — deploys a verified release to alt channel. Requires Axiom evidence (commitSha + missionId match).
3. **Main** — `leitstand.promote --release <releaseId>` — promotes an alt-deployed release to main channel. Requires release state `alt-deployed`.

Rules:

- **NEVER call `wrangler deploy` directly.** This bypasses the pipeline. All deployments MUST go through `leitstand.*` commands, which enforce Axiom gates, build-identity verification, and release state transitions.
- **NEVER deploy to Main without first deploying to Alt and verifying.** `leitstand.promote` enforces this by requiring `alt-deployed` state.
- **NEVER skip Axiom verification.** `leitstand.dev-deploy` runs Axiom automatically. `leitstand.propagate` requires Axiom evidence from dev-deploy.
- **NEVER create workarounds** (symlinks, manual dist copies, custom wrangler configs, `--config` pointing to cache clone, copying `.env.*` files manually). If the pipeline fails, investigate the root cause and fix it — do not bypass.
- If a step fails, report the error to the operator and wait for guidance. Do not attempt alternative deployment paths.

### Service deployment (RFC-0751)

Shared Cloudflare Worker services in `services/*` are deployed via `leitstand.service.deploy --service <id>`. This command runs preflight checks, subdomain validation (RFC-0752), `wrangler deploy`, health checks, and records deployment state atomically in `systems/registry.yaml`.

- Services MUST be registered in the `services:` key of `systems/registry.yaml`.
- Worker names MUST match the service id (directory name, `package.json` name, `wrangler.jsonc` name).
- Per-service `deploy` scripts in `package.json` are removed — deployment is centralized.
- `service.registry.validate` and `service.naming.validate` enforce registry integrity and naming conventions.
- `services.check.run` includes `service.naming.validate` in its pipeline.

Avoid double `mission.open` calls:

- Check the command output for `[OK]` before considering the mission opened.
- If the command returns `already has open mission`, the first call succeeded — do not retry.
- When in doubt, verify `systems/registry.yaml` (`currentMission` field) before attempting `mission.open` again.

## Session-end discipline (RFC-0581)

**Session-end retro with git hygiene check (NON-NEGOTIABLE, RFC-0581):** When the operator signals session end ("we're done", "на этом всё", "that's it", "мы закончили", "das war's", "wir sind fertig", "Завершаем сессию", or similar), the agent MUST invoke `fo-session-retro` via the `skill` tool BEFORE producing any closing summary. Do NOT write a session summary first and then offer to run the retro — the retro skill IS the closing protocol. The skill's report is the session-end output.

1. Run `git status --short` in the werkstatt root and in each active mission workpiece (if any).
2. If uncommitted changes are found, report them to the operator and ask whether to commit.
3. If the operator confirms, commit using the appropriate path (`mission.git.commit` for workpieces, `ecosystem.commit` or `git commit` for werkstatt).
4. If the operator declines, proceed with the retro — the uncommitted changes remain.
5. If no uncommitted changes are found, proceed silently to insight triage.

The agent auto-commits after each standalone operator request via `fo-step-commit` (RFC-0622), so uncommitted changes at session end should be rare. If changes are found, the operator decides whether to commit them. The signal list is illustrative — agents should recognize any clear session-closing signal regardless of language. When uncertain whether the operator is signaling session end, the agent asks: "Should I run the session-end retro?"

This rule is complementary to RFC-0480's per-response `git status` verification, not a replacement. RFC-0480 checks before each response; RFC-0581 is a final safety net at session end. Together with RFC-0575 (session-start pre-flight), they form a bracket: check at start → commit during → verify at end.

**Session-retro language discipline (NON-NEGOTIABLE):** All `fo-session-retro` output — the insight triage table, the `ask_user_question` confirmation prompt, the final summary report, and any inline commentary — MUST be written in `PREFERENCES.md` `aiLanguage`. English templates in the skill are structural placeholders only; the agent MUST translate all headings, column names, labels, and prose to `aiLanguage` before presenting output. Only identifiers (file paths, skill names, RFC/ADR ids, commit hashes) stay untranslated. If `aiLanguage` is `ru`, the triage table heading is «Сортировка инсайтов сессии», not «Session Insight Triage».

## RFC stamping completion discipline (RFC-0646)

**RFC implementation is not complete until stamped (NON-NEGOTIABLE):** When a session implements an RFC (writes code, adds tests, updates docs), the session MUST NOT end without completing all of the following:

1. **Mark acceptance criteria** — every `[ ]` must be `[x]` with inline `(evidence: <file:line>)` annotations (V-26/V-27).
2. **Regenerate command manifest** — if the RFC added or changed commands, run `rtk pnpm exec site-kernel run command.manifest.generate` and commit `docs/command-manifest.generated.yaml`. A stale manifest causes `RFC-CMD-02` violations on the next `rfc.validate`.
3. **Stamp implemented** — run `rfc.implement.stamp --id RFC-XXXX` (auto-detects the implementation commit via `git log --grep`, RFC-0756; pass `--implementation-commit <sha>` to override) and commit the stamped RFC file.
4. **Validate** — run `rfc.validate --id RFC-XXXX` and confirm zero errors.
5. **Commit** — all changes must be committed before session end.

A session that writes implementation code but leaves the RFC in `accepted` status with unchecked criteria is **incomplete**. The `fo-session-retro` git hygiene check (RFC-0581) will catch uncommitted changes, but it does not verify RFC completion — that is the agent's responsibility throughout the session, not just at the end.

If the session is interrupted before stamping, the next session MUST resume from step 3.6 (Check acceptance criteria) of the `fo-idea-implement` pipeline — not from the beginning.

## RTK usage (token optimization, RFC-0683)

All shell commands in agent instructions should be prefixed with `rtk` to minimize token consumption. If RTK is not installed, commands run without the `rtk` prefix — RTK is an optimization, not a dependency.

At the start of each session, check once: `rtk --version`. If it succeeds, use `rtk` as a prefix for all subsequent shell commands. If it fails, proceed without `rtk` for the entire session.

When a skill instruction uses `ref(forge.yaml bindings.commands.<key>)`, add `rtk` after the binding is resolved to a concrete command — do not prefix the `ref()` reference itself.

Commands that install, initialize, or diagnose RTK itself are exempt from the `rtk` prefix rule: `rtk --version`, `rtk init`, `rtk gain`, `curl | sh`, `cargo install --git`, `Invoke-WebRequest` for RTK install.

## HDRI identity firewall, image resolution, material credits, responsive variants, derived artifact invalidation, silent UI text, behavior snapshot

See [`docs/policies/content-contracts.md`](docs/policies/content-contracts.md) for the full text of these contracts:

- HDRI identity firewall (RFC-0241)
- Image resolution contract (RFC-0053) — bare filename convention, language fallback
- Material credits contract (RFC-0220) — credit sidecars for all published material
- Responsive image variants — build-portable provider (RFC-0204)
- Derived Artifact Invalidation Contract — source-hash pattern
- Prevent silent UI text degradation (RFC-0205)
- Golden behavior snapshot — review discipline (RFC-0269)

## Generated-file governance, generation contracts, YAML-only contract, relative imports, section content

See [`docs/policies/generated-file-governance.md`](docs/policies/generated-file-governance.md) for the full text of:

- Generation-first template discipline (RFC-0078)
- Generated-file governance protocol (RFC-0081) — marker categories, edit guard, agent lookup
- Content-driven generation contract (RFC-0087) — single owner, content-driven, idempotent
- YAML-only contract (RFC-0376) — .yaml for generated artifacts and project configs
- YAML quoting policy (RFC-0493) — plain scalars by default, double quotes when needed, never single quotes; parse validation via yaml.parse.validate
- Relative imports — HARD RULE (RFC-0092) — .ts extensions in packages/\*_/_.ts(x)
- Section components must render real content (RFC-0093)
- **Generated docs files must not be hand-edited.** Files like `docs/COMMANDS.md`, `docs/command-manifest.generated.yaml`, and `docs/gate-catalog.generated.yaml` carry the `GENERATED` marker and are overwritten on the next build. To add or update a command entry, run `command.manifest.generate` then `docs.commands.generate`. To update the gate catalog, run `gate.catalog.generate`. Always check the file header for a `GENERATED` marker and `Owner command:` line before editing — if present, run the owning generator instead.

## Content drift gate boundaries (DNA-58, DNA-61)

Three distinct drift gates protect different layers of the content stack. Agents MUST distinguish them:

- **DRIFT-01** (`generated.drift.validate`, RFC-0601, DNA-58) — generated file determinism. Re-invokes registered generators with `dryRun: true` and compares output against committed files. Covers files in `GENERATOR_OWNERSHIP_MAP`.
- **SNAP-01** (`behavior.snapshot.validate`, RFC-0269) — route-level metadata drift. Compares title, OG tags, JSON-LD, canonical, and hreflang against the committed `behavior.snapshot.generated.yaml`.
- **CREG-01** (`content.regression.check`, RFC-0732, DNA-61) — resolved page content drift. Snapshots block text (after `resolveReferencesDeep`), prose body, and FAQ Q&A per-route, and diffs against a golden baseline in the cache clone. Covers content that has no registered generator but changes what users read.
- **CREG-04** (`content.regression.apply`, RFC-0734, DNA-63) — workpiece content mismatch. When `apply` processes a review.yaml with `reject` or `fix` decisions, it verifies the source content was actually reverted/fixed. If not, CREG-04 blocks the apply.
- **CREG-05** (`mission.close`, RFC-0734, DNA-63) — unreviewed content drift on mission close. When content drift exists between current and golden snapshots, `mission.close` blocks unless a processed `apply-result.json` exists in the mission evidence directory. The `--skip-content-regression` flag on `mission.close` bypasses CREG-05 (escape hatch).

The `--skip-content-regression` flag on `mission.validate` bypasses CREG-01 only. DRIFT-01 and SNAP-01 are unaffected. `mission.close` always refreshes the golden baseline regardless of whether the flag was used during validation.

## Onboarding a new site (one paragraph)

Follow `.agents/workflows/00-prepare.md` and the RFC-0075 phase chain. Treat `onboarding/.input/**` as read-only, require `onboarding/.input/00-brief.md` to pass `brief.validate` before any phase starts, write all agent artifacts under `onboarding/.output/<NN-phase>/`, and use `onboarding.scaffold` only inside the scaffold phase. Never copy an existing app folder by hand. After the app is built, gate readiness with `sites-check.run --site <id>` and `app.contract.full --site <id>`.

## Global working rules

- Do not remove debug console statements or existing comments unless the task explicitly requires it.
- **Runtime enum-like dispatch must warn on unknown values.** Whenever a component or utility branches on a closed set of values (e.g. `contactIds`, block types, component roles, motion variants), an unrecognised value must emit `console.warn` with the component name, the unknown value, and the expected set before falling back or returning `null`. Silent `return null` on unexpected input is a bug.
- Ignore `spec/**` and `todo/**` unless the task is explicitly about historical notes or planning files.
- Ignore generated icon trees unless the task is explicitly about icon generation or icon imports.
- Ignore folders whose names start with `old-` or `-` during normal implementation work.
- **Never put a glob pattern containing `**/`(or any`_/`) inside a `/_ … _/`block comment.** The`_/`sequence closes the comment early, and the text after it is parsed as code — producing cryptic`TS2304: Cannot find name '…'`errors. Describe glob patterns in prose ("recursive asset folders") inside doc comments; keep the literal pattern in the code string only. (This bit the first cut of`packages/ui/src/content-assets.ts` under RFC-0141.)

### Commit message contract (RFC-0265)

`git log` is an agent-legible knowledge source in this workspace: agents reconstruct initiative context from it, and memory notes reference commit hashes as anchors. `commit.message.lint` (workspace command, CI-gated) enforces four rules on every commit ahead of `origin/main`:

- `COMMIT-01` (error): subject longer than 120 characters.
- `COMMIT-02` (error): subject does not match `^(feat|fix|docs|refactor|test|chore|build|ci|perf|style)(\([a-z0-9-]+\))?: [a-z]`.
- `COMMIT-03` (error): subject looks like pasted analysis or chat narration (leading `**` or backtick, an interjection like `Good —`/`Found the bug`/`Let me`, or a second sentence inside the subject).
- `COMMIT-04` (warning): a commit touching `packages/os/**` or `docs/rfcs/**` has no `rfc-\d{4}` reference in the subject or body.

**NEVER pass your own analysis or chat narration to `git commit -m`.** Write the subject as `<type>: <imperative clause>` and put reasoning in the body.

```
# ✅ Correct
feat: add maintenance debt queues
fix(kernel): resolve flag parsing edge case for --range

# ❌ Incorrect — pasted narration, not a commit subject
Found the bug — `app.qa.validate` passes `args:` incorrectly to the handler
**05-audit — пройдено (з очікуваними build-deferred блокерами).**
```

Merge commits and git-generated reverts are exempt. Run `pnpm exec site-kernel run commit.message.lint` (or `--range <rev-range>`) before pushing if unsure.

## Documentation structure

- `docs/rfcs/` — Active RFC files (draft, accepted, implemented, rejected, superseded). All RFC governance commands (`rfc.create`, `rfc.validate`, `rfc.list`) operate on this directory.
- `docs/audits/` — RFC audit records produced by the `fo-idea-audit` skill (files use the `audit-rfc-NNNN-…md` naming convention) and historical audit notes / session records (e.g., onboarding audits, ecosystem refactor baselines). Audit records are read-only artifacts for project history and do NOT require RFC-id references in commit messages. Agents MUST NOT edit audit files unless re-running an audit (which overwrites the existing file).
- `docs/reviews/code/` — Code review reports produced by the `fo-review` skill. Files use the `review-<YYYY-MM-DD>-<HH>-<module-folder>.md` naming convention, organized into subfolders by reviewed package (e.g., `docs/reviews/code/packages-growth/review-2026-07-10-19-packages-growth.md`). The `fo-fix` skill reads reviews from this directory.
- `docs/reviews/architecture/` — Architecture review reports produced by the `fo-architecture` skill. Files use the `arch-<YYYY-MM-DD>-<HH>-<short-desc>.html` naming convention, organized into subfolders by reviewed package (e.g., `docs/reviews/architecture/packages-growth/arch-2026-07-10-22-packages-growth.html`). Repository-root reviews use the `root` subfolder.

## Monorepo architecture invariants

- Avoid assuming that one app's internal structure automatically applies to another app.
- Keep each app deployable and self-contained with its own config, assets, and validation commands.
- Keep packages reusable and app-agnostic; do not couple `packages/*` to `apps/*` internals.
- Extract logic into `packages/*` only when it is truly shared or becoming shared.
- Preserve clear ownership boundaries between routes, content, config, styles, scripts, and semantic outputs inside each workspace.
- Use `// @ai-invariant: ...` at the top of high-risk files when a local rule must travel with the source. Prefer `compass.invariant.add` for correct placement (RFC-0351). When writing or materially changing a **blast-radius file** (middleware, discovery/runtime core, registry or closed import map, egress/normalization adapter, security-sensitive comparison, or any file the inventory classifies risk `high`), you MUST record the non-obvious constraint as an `@ai-invariant` — proactively, not only when `compass.validate` complains. Write invariants that prevent a plausible mistake (fail-closed comparison, server-only import boundary, closed-registry shape); do not restate what the code obviously does.
- **Never use `as any` to mask type errors when calling workspace-internal APIs** (`executeKernelCommand`, `executeKernelPipeline`, or any shared-package surface). These APIs have stable TypeScript types; `as any` silently drops properties and causes runtime bugs. Fix the call site or improve the shared type instead. ESLint enforces this for `packages/**/*.ts` via `local-rules/no-as-any` (`pnpm lint:packages`).

## Commands and validation

- Prefer workspace-scoped commands from the repository root with `pnpm --filter <workspace> ...`.
- Register workspace-scoped OS commands in the repository root `tools/kernel.config.ts`; reserve `apps/<site>/tools/kernel.config.ts` for app-scoped modules and pipelines.
- Use `turbo run ...` when the task intentionally spans multiple workspaces.
- Validate only the affected workspace unless the change crosses workspace boundaries.
- **Command discovery (RFC-0266):** `docs/command-manifest.generated.yaml` is the single machine-readable description of every registered command — flags, IO globs (`reads`/`writes`), mutability, timeouts, and pipeline membership. `docs/COMMANDS.md` is generated FROM it, not maintained independently. When adding or changing a command's flags/IO, run `pnpm exec site-kernel run command.manifest.generate` then `pnpm exec site-kernel run docs.commands.generate` — never hand-edit either generated file. `command.manifest.validate` (in `PACKAGES_CHECK_PIPELINE`) fails on drift (`CMD-MAN-01`) and warns when a mutating command has no declared `writes` (`CMD-MAN-02`) or when a `GENERATOR_OWNERSHIP_MAP` output isn't reflected in its owner's `writes` (`CMD-MAN-03`). **When registering a new command in a `*.module.ts` file, the manifest MUST be regenerated before transitioning the corresponding RFC to `implemented`** — `rfc.validate` falls back to the manifest when the command registry is empty (site-kernel mode), and a stale manifest causes `RFC-CMD-02` errors for implemented RFCs listing the command in `commands.added`.

## RFC governance protocol

RFC (Request for Comments) is the formal lifecycle for architectural decisions in this monorepo. See [`docs/policies/rfc-governance.md`](docs/policies/rfc-governance.md) for the full protocol: when to consult RFCs, execution gate, status transitions, reviewer identity, decision log consultation, escalation, verification evidence, YAML discipline, and frontmatter rules.

**RFC-0476:** The `accepted → implemented` transition MUST be performed by `rfc.implement.stamp --id <id>` (auto-detects the implementation commit via `git log --grep` when `--implementation-commit` is omitted, RFC-0756; pass `--implementation-commit <sha>` to override). Direct edits to `status`, `implementedAt`, and `updatedAt` for this transition are prohibited for all actors. The implementation commit and the stamp commit MUST be separate.

**Agent discipline (derived from RFC-0476 + RFC-0224):** Agents MUST NOT edit RFC `status`, `implementedAt`, or `closedAt` fields directly — these are human-operator-only fields. Agents MUST NOT stamp an RFC as `implemented` or `closed`. When all code changes and documentation updates are complete, the agent MUST: (1) verify all acceptance criteria checkboxes in the RFC are `[x]` or document why unchecked ones remain, (2) verify all files listed in the plan `scope.docs` section are updated, (3) request the human operator to run `rfc.implement.stamp`. The plan file `status` field follows the same rule — agents MUST NOT stamp a plan as `implemented`; only the human operator does so after verifying the RFC transition.

**RFC-0478:** Platform versioning enforcement and RFC-id monotonicity.

- Every RFC that changes `packages/*` MUST declare `versionBump: minor | patch | none | major` in frontmatter. `minor` = Breaks-B (requires migrator), `patch` = safe, `none` = prose-only, `major` = architectural.
- V-28: RFC-id monotonicity — no RFC may have an id lower than the maximum id among RFCs with a **strictly earlier** `createdAt`. Same-day RFCs are unconstrained relative to each other.
- V-29: `versionBump` is required for post-cutoff (createdAt >= 2026-07-21) implemented RFCs. Absent `versionBump` on an implemented post-cutoff RFC is an error. `versionBump: none` with non-empty `commands.added` or `commands.changed` is a warning.
- `platform.consistency.validate` command guards platform semantic hash (DNA-53) drift: hash changed but version not bumped = error (PC-01). Uses `--check` flag in CI for read-only validation. The log file `docs/platform-version-log.generated.yaml` is committed to the repo.

**RFC-0491:** Agents MUST use `rfc.create` to scaffold new RFC files. Agents MUST NOT create RFC files by manually copying the template and determining the number. Agents MAY use `rfc.next-id` for read-only number queries (e.g. when referencing a future RFC number in a document or plan). Agents MUST NOT determine RFC numbers by running `ls`, `find`, `grep`, or any manual file-listing command. V-28, V-02, and V-31 are post-hoc safety nets, not substitutes for calling the command.

**RFC review discipline:** When reviewing or finalizing an RFC with TypeScript contracts (interface definitions in the design section), verify that interface names, field names, field types, and field presence/absence match the actual implementation. Mismatches between RFC TypeScript contracts and code are a documentation defect — fix the RFC to match the code, not the other way around.

## ADR governance protocol

ADR (Architectural Decision Record) is the lightweight decision log for local technical choices. See [`docs/policies/adr-governance.md`](docs/policies/adr-governance.md) for the full protocol: when to use an ADR, lifecycle, agent permissions, and transition rules.

- **ADR status consistency:** When an ADR has `supersededBy` set in frontmatter, its `status` MUST be `superseded`, `closedAt` MUST be populated, and the file MUST be moved to `docs/adrs/archive/superseded/`. An ADR with `supersededBy` but `status: accepted` is an inconsistency — fix it immediately when discovered.
- **Post-hoc ADRs must be stamped `implemented`:** When creating an ADR for a decision that has already been made and is already in production (post-hoc ADR), set `status: implemented` and `implementedAt: <date>` from the start. Do not leave it as `proposed` — the decision is not awaiting acceptance. The `fo-idea-create-adr` skill defaults to `proposed` for forward-looking decisions; post-hoc ADRs skip directly to `implemented`.

## Architectural arc: RFC-0025 → RFC-0029 + extensions

These RFCs form the core architectural arc. See [`docs/policies/architectural-arc.md`](docs/policies/architectural-arc.md) for the full arc table, critical invariants agents MUST enforce (DNA-21..36), storage policy, build output invariant, turbo cache contract, biome token validation, and font pipeline.

## Rule map

- `docs/authoring/site-composition.md` for shared site rules across all Sternsystemen
- `packages/AGENTS.md` for shared library rules across `packages/*`
- `<site>/AGENTS.md` for site-specific rules
- `packages/os/site-kernel-checks/docs/check-module-guide.md` for check module wiring and troubleshooting duplicate command registration

## Uni UI Ontology (RFC-0023)

The workspace uses a manifest-driven component registry that spans all layers. Read this before adding, moving, or renaming any section, component, or page.

### manifest.yaml contract

Every `.astro` UI surface file must have a colocated `<name>.manifest.yaml` with these required fields:

```yaml
id: "section/hero"
uniName: "HeroSection"
layer: section
cosmicName: Europa
semanticId: hero
version: "1.0.0"
intent: [introduction, cta]
industryFit: [ngo, nonprofit]
standalone: true
```

`cosmicName` is drawn from the layer-appropriate closed catalog. Names must be globally unique within their catalog scope — `cosmic.name.unique` enforces this workspace-wide. Never invent names outside the catalog.

### Prop types are generated from propsSchema (RFC-0262)

The manifest `propsSchema` (with `propsSchemaCompose` fragments resolved) is the **only** authored prop contract for a section/component. Its TypeScript mirror is **generated**, never hand-written:

```sh
# Regenerate every <id>.types.generated.ts next to its manifest (mutates state)
rtk pnpm exec site-kernel run props.types.generate

# Validate every generated file is present, marker-carrying, and fresh (workspace-scoped, part of packages.check)
rtk pnpm exec site-kernel run props.contract.validate
```

- **Agents MUST NOT hand-edit a `*.types.generated.ts` file.** Fix the manifest `propsSchema` and run `props.types.generate` — the file carries the RFC-0081 `GENERATED_MARKER` plus a `sourceHash` line, and `props.contract.validate` (`PROPS-01`) fails on drift or a missing marker.
- `contentTypesPath` in the manifest must point at the generated file (`./<id>.types.generated.ts`), not a hand-written sibling.
- `section.scaffold` already does this correctly for new sections — it generates the types file immediately after writing the manifest, never a `.types.ts` starter.
- In `astro dev` only, `buildPage`'s optional `validateProps` hook (wired in `resolvePageRoute`) throws `PAGE-PROPS-01` the moment a block's props violate its pinned `propsSchema` — the same signal `page.block.validate` gives at `build.check`, just immediate instead of on the next check run. It is inert in `astro build` (gated on `NODE_ENV !== "production"`).

### uni.registry.yaml

The workspace-level `uni.registry.yaml` at the repository root is the machine-readable index of all UI surfaces. It is generated by `uni.registry.build` and validated by `uni.registry.validate`. Both commands are workspace-scoped:

```sh
# Regenerate (mutates state — run after adding/moving manifests)
rtk pnpm exec site-kernel run uni.registry.build

# Validate freshness (read-only, fails if on-disk manifests differ from registry)
rtk pnpm exec site-kernel run uni.registry.validate
```

`uni.registry.validate` is a Wave-0 step in `APPS_CHECK_PIPELINE`. The registry is rebuilt automatically by `APPS_BUILD_PREPARE_PIPELINE` before `astro check`. Workspace-scoped contracts (archetypes, biomes, families, constellations) live in `PACKAGES_CHECK_PIPELINE` and are driven by `packages-check.run`.

### Ontology enums

Intent tags and industry-fit tags are closed enums defined in `@warpgogol/ontology`. **Do not use freeform strings** — only values from `UniIntent` and `UniIndustryFit` are valid. Import the Zod schema for validation:

```ts
import { manifestSchema } from "@warpgogol/ontology";
```

---

## Shared packages

Every package under `packages/*` has its own `AGENTS.md` with full API reference and usage rules. Key packages and their responsibilities:

| Package | Role |
| --- | --- |
| `@warpgogol/share` | App-agnostic utilities: entity-ID normalization, i18n helpers, base schemas, browser scripts, `buildPage()`. **See `packages/share/AGENTS.md`.** |
| `@warpgogol/ontology` | Closed UI enums (`UniIntent`, `UniIndustryFit`, `UniLayer`), `manifestSchema` Zod validator, cosmic catalogs, biome/site-family YAMLs |
| `@warpgogol/tokens` | CSS-first design tokens (`--ds-*`), biome CSS generation. No raw colors in app CSS — enforced by `tokens.ds.lint` / `tokens.colors.lint` |
| `@warpgogol/pbp` | Public Business Profile (PBP) entity envelope, schemas, loaders, compiler, and semantic projections (RFC-0399, `pbp/*@1`). Canonical business layer (DNA-20 superseded) |
| `@warpgogol/growth` | Vendor-agnostic event/funnel/experiment runtime. Apps call `emit()` only. See `packages/growth/AGENTS.md` |
| `@warpgogol/chat` (+ `@warpgogol/chat-adapter-uchat` / `-null`) | RFC-0175 consent-gated chat widget port: `ChatWidgetAdapter` contract + click-to-load loader. Vendor script loads ONLY after the visitor clicks (no third-party before activation). Adapters injected via STATIC dynamic `import()` so the bundler code-splits them |
| `@warpgogol/integration-adapter-stripe` | RFC-0191 Stripe billing adapter: a first-party source (webhook signature verify + `Stripe → IntegrationEvent` mapping) plus an injectable billing client (Checkout / invoices / subscription items). No Stripe SDK (raw `fetch` + `node:crypto`), no Make.com. |
| `@warpgogol/integration-adapter-supabase-crm` | RFC-0176/0186 Supabase CRM-buffer `DestinationAdapter` (the Lagebild MVP). Writes the `IntegrationEvent` into the buffer + outbox; the shared `services/lagebild-sync-worker/` syncs Pipedrive async. Never calls Pipedrive directly. |
| `@warpgogol/passport` / `@warpgogol/star-map` / `@warpgogol/nebula` | Build provenance, W3C VC-signed passport, deterministic star-map SVG. Private keys: GitHub secrets only |
| `@warpgogol/site-kernel-onboarding` | `onboarding.scaffold` CLI — generates RFC-compliant `apps/<id>/`. Never copy an app folder |
| `@warpgogol/ui` | Shared icons (LordIcon), sections, shell components. Import icons from `@warpgogol/ui/icons`. See `packages/ui/AGENTS.md` |
| `@warpgogol/content-source` | RFC-0141 Content Source Provider port: the single named seam for where content and assets come from. Ships the `ContentSourceProvider` / `AssetRef` / `ResolvedAsset` contracts and the reference filesystem adapter. |
| `@warpgogol/forge` | RFC-0374 Portable governance ecosystem: 42 skills (fo/shared/meta), generic OS command modules (rfc._, naming.convention.lint, compass._, werkstatt._, workflow._), skill registry, validators, `forge.create` onboarding, `forge.scaffold` stack profiles, and `fo-harvest` self-growth loop. Skills live in `packages/forge/skills/`; `.agents/skills/` is a generated copy synced by `forge.create`. **See `packages/forge/AGENTS.md`.** |

## Content Source Provider seam (RFC-0141)

Content origin and asset origin are reachable only through `@warpgogol/content-source` — the named port that makes the filesystem a replaceable adapter (Phase 0 of the headless-CMS arc).

- **Content reads.** Import `getEntry` / `getCollection` from `@warpgogol/content-source/astro`, never from `astro:content` directly. That subpath is the single module that owns the `astro:content` dependency. `@warpgogol/share` content helpers and `page-handler` already route through it.
- **Collection loaders.** `markdownCollectionLoader` (re-exported from `@warpgogol/share/astro/loaders`) and the business loader come from the fs adapter (`fsMarkdownCollectionLoader` / `fsDataCollectionLoader`). Generated `content.config.ts` keeps importing `markdownCollectionLoader` unchanged.
- **Assets.** `packages/ui/src/content-assets.ts` is the ONLY place in `packages/ui` that calls `import.meta.glob` for content images. Sections import `contentAssetImages` and resolve via `resolveImage` (relocated into the fs adapter as `resolveAsset`). Do not re-introduce per-component asset globs — `asset.reference.validate` (warning mode) and the centralization are how a future CMS adapter swaps local files for remote URLs without touching sections.
- **`system.md` stays engineering-owned** and is never served by a provider (`ContentDomain` excludes it).
- `content.source.parity` is the migration guard: the fs adapter's enumeration must match the on-disk content inventory.

## Content syntax reference

Three string-embedding mechanisms operate at different pipeline layers. Agents MUST use the correct one for each context.

1. **Content references** — `collection.file.field` (pure) or `=(collection.file.field)` (in mixed strings). Resolved by `@warpgogol/share` before the component renders. Returns a string. Use for business data (email, address, legal name) and structured props (amount, currency, recurrence). See RFC-0529, RFC-0723.

2. **Formula expressions** — `=(ref + ref * 2 | money currency=EUR)`. Resolved by `@warpgogol/share/formula-eval` before the component renders. Returns a formatted string. Use for numeric arithmetic over content references. See RFC-0570.

3. **Price markers** — `{price:offering-id:chargeRef}`. Parsed by `packages/ui/src/utils/price-marker.ts` during component render. Returns a `CurrencyAwarePriceDisplay` component with multi-currency variants. Use for inline currency-aware prices in component text. See RFC-0743, ADR-0033.

**`{price:...}` is NOT a content reference.** RFC-0529 removed brace-delimited content references (`{collection.file.field}`). Price markers are a separate component-level namespace. Do not migrate `{price:...}` to `=(...)` — this breaks currency switching.

**`=(...)` cannot create interactive components.** It returns a plain string. If you need currency-aware price display, use `{price:...}` markers.

## Content references in mixed strings (RFC-0723)

Content references inside mixed strings MUST use `=(ref)` formula syntax. A bare braceless reference (e.g. `business-profile.offerings/digital-foundation.presentation.price.monthly`) inside a mixed string (e.g. `"Ab business-profile.offerings/..."`) is prohibited — `content.references.validate` emits REF-04. Use `=(business-profile.offerings/...)` to explicitly mark it as a reference. Pure refs (where the entire field value is just the reference, with no surrounding text) remain valid without `=(...)`. This rule is non-negotiable for all AI agents.

## Integration hub, billing & consent-gated chat widget (RFC-0168/0175/0176/0177/0181/0186/0191)

See [`docs/policies/integration-hub.md`](docs/policies/integration-hub.md) for the full text: model, sources, destinations, reliable delivery (EU-resident QStash + Redis), chat widget, validators, Cloudflare + Astro v6 runtime gotchas, and Lagebild shared sync worker rules.

## Block dispatch (RFC-0091) — registry is authoritative

`packages/share/src/page.ts` resolves a block `type` → cosmicName → import path from the **archetype registry** (`@warpgogol/ontology/archetypes`). The `PLANET_IMPORT_PATHS_FALLBACK` is for genuinely _unmapped_ names and is spread BEFORE the registry, so a real manifest mapping always wins. Never re-add a hardcoded fallback that shadows a registered cosmicName (this exact bug silently rendered a chat-widget block as a hero — RFC-0175 fix).

## Historical note

- Legacy `.agents/rules/**` files have been moved to `docs/historical/rules/` as reference-only material. Do NOT follow them for implementation — follow `AGENTS.md` and `docs/policies/` instead.
- Historical references to plain `src/**` in old root-level docs usually refer to the reference app's `src/**` unless a file explicitly says otherwise.

## Agent skills

Skills are managed by `@warpgogol/forge` (RFC-0374). The source of truth is `packages/forge/skills/{wg,shared,meta}/`; `.agents/skills/<name>/` contains generated copies for IDE discovery, synced by `forge.create`. Run `pnpm exec site-kernel run forge.skill.validate` to check skill frontmatter and invariants.

### Windows AI tooling (forge consumers only)

The `windows-ai-tooling` skill is part of `@warpgogol/forge` (published to npm) and remains cross-platform for external consumers. It is **not** used in this monorepo, which develops on Linux (Ubuntu). See `packages/forge/skills/shared/windows-ai-tooling/SKILL.md` and RFC-0368 for the original policy context.

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. No external issue tracker. See `docs/agents/issue-tracker.md`.

### Triage labels

Standard five-role vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout: `CONTEXT-MAP.md` at root points to per-context `CONTEXT.md` files. See `docs/agents/domain.md`.

## Werkstatt engine program (RFC-0769, DNA-64)

The Werkstatt engine is a family of private npm packages developed in this monorepo and published via `@warpgogol/repo-extract`. The program extracts the stack-agnostic lifecycle platform from `packages/os/*` into a consolidated engine package, with stack-specific logic in plugin packages.

### Terminology (normative for all downstream RFCs)

- **Engine** — `@warpgogol/werkstatt`: stack-agnostic lifecycle platform (kernel runtime, missions, mirrors, releases, Leitstand, Bordbuch, Notausgang, artifact store, evidence, deploy orchestration, consistency primitives, fingerprint, integrity, observability).
- **Plugin** — `@warpgogol/werkstatt-<stack>`: stack-specific package implementing the plugin contract (path conventions, validators, codegen, content handling, onboarding templates, deploy adapters, stack invariants). Plugins: `werkstatt-site` (Astro), `werkstatt-game` (Phaser), `werkstatt-video` (Editframe).
- **Workshop** — consumer monorepo (pnpm + Turborepo) that installs the engine + exactly one plugin from npm. Contains `forge.yaml`, `tools/kernel.config.ts`, `systems/registry.yaml`, `missions/`, `docs/`, `.agents/`, hooks, CI.
- **Project** — a Sternsystem registered in the workshop's `systems/registry.yaml`, living outside the workshop in mirrors per RFC-0574.
- **Stack profile** — a forge profile YAML declaring the workshop's stack. The profile id binds forge, the engine, and the plugin.

### Package taxonomy

| npm package | Contents | Source |
| --- | --- | --- |
| `@warpgogol/werkstatt` | Engine (one consolidated package) | `packages/werkstatt` |
| `@warpgogol/werkstatt-site` | Site plugin: Astro engine modules + full site domain layer | `packages/werkstatt-site` |
| `@warpgogol/werkstatt-game` | Game plugin (phaser-turborepo profile) | `packages/werkstatt-game` |
| `@warpgogol/werkstatt-video` | Video plugin (editframe profile) | `packages/werkstatt-video` |
| `@warpgogol/forge` | Governance (unchanged, already published) | `packages/forge` |
| `@warpgogol/repo-extract` | Extraction tool (unchanged, external) | external repo |

### Program principles

1. **Dependency inversion** — the engine never imports a plugin. Plugins import engine contracts and register through the plugin registry (RFC-0770). Enforced by an autonomy guard.
2. **Dogfooding** — this monorepo remains the site workshop and consumes engine + site plugin as `workspace:*` during development; external workshops consume the same code from npm.
3. **No legacy** — no compatibility shims, no re-export stubs, no backward-compatible migrators. Retired packages are deleted after consolidation.
4. **Publication via repo-extract** — each published package carries an `extract.config.yaml`; publication happens from an external extraction folder (RFC-0773).
5. **Workshop layout is stable** — the workshop directory contract (registry, missions, docs, hooks, tools, environment) does not change shape; only where the engine code comes from changes.

### Wave plan

| Wave | RFCs | Content |
| --- | --- | --- |
| 0 | RFC-0769 | Charter (this program) |
| 1 | RFC-0770, RFC-0771 | Plugin contract; engine core composition |
| 2 | RFC-0772, RFC-0773 | Physical consolidation + plugin registry; publication pipeline |
| 3 | RFC-0774, RFC-0775 | Site plugin: engine modules; domain layer |
| 4 | RFC-0776 | Migrate this workshop to consolidated packages |
| 5 | RFC-0777, RFC-0778, RFC-0779 | Game plugin; video plugin; consumer workshop scaffolding |

Waves execute sequentially; RFCs inside a wave may proceed in parallel. Implementation happens in separate sessions, one RFC at a time.
