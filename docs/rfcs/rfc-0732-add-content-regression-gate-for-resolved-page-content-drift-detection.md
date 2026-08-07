---
id: RFC-0732
title: "Add content regression gate for resolved page content drift detection"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-07
updatedAt: 2026-08-07
enhancedAt: 2026-08-07
implementedAt: 2026-08-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-58
  - DNA-48
  - RFC-0269
  - RFC-0357
  - RFC-0601
  - RFC-0607
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-58
  - DNA-61
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed:
    - content.regression.check
    - content.regression.snapshot.update
  added: []
  changed:
    - mission.validate
    - mission.close
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "content.regression.check emits CREG-01 diagnostics when resolved page content differs from golden snapshot"
  - "mission.validate fails on content drift unless --skip-content-regression is passed"
  - "mission.close updates golden snapshot in cache clone after bordbuch commit"
  - "Cold start (no golden snapshot) emits CREG-03 warning, does not block first mission"
nonGoals:
  - "Translation parity (semantic comparison across languages) — requires NLP-level text comparison, out of scope"
  - "Binary content regression (images, videos, PDFs) — covered by RFC-0602 and RFC-0603"
  - "Generated public file drift (llms.txt, robots.txt, sitemap.xml) — covered by generated.drift.validate (RFC-0601)"
  - "Route metadata drift (title, OG tags, JSON-LD) — covered by behavior.snapshot.validate (RFC-0269)"
  - "Auto-fixing content drift — the command is read-only; operators must edit content and re-validate"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
acceptance:
  - probe: command-registered
    name: "content.regression.check"
  - probe: command-registered
    name: "content.regression.snapshot.update"
  - probe: file-contains
    path: "packages/os/site-kernel-checks/src/pipelines/build-check.ts"
    pattern: "content.regression.check"
  - probe: file-contains
    path: "packages/os/site-kernel-handoff/src/mission/mission-close.ts"
    pattern: "content.regression"
  - probe: file-contains
    path: "docs/architecture-dna.md"
    pattern: "DNA-61"
---

# RFC-0732: Add content regression gate for resolved page content drift detection

## Context

The build pipeline currently catches four classes of regression:

1. **Structural** — schema validation, route topology, page block contracts (`page.block.validate`, `mirror.quintet.validate`).
2. **Metadata** — route-level metadata drift via `behavior.snapshot.validate` (SNAP-01, RFC-0269): title, meta description, canonical, hreflang, OG/Twitter, JSON-LD, breadcrumbs.
3. **Generated-file determinism** — `generated.drift.validate` (DRIFT-01, RFC-0601): re-invokes generators with `dryRun: true` and compares output against committed files.
4. **Visual** — Axiom visual regression via Playwright (`mission.check`).

A fifth class is **unprotected**: **semantic content regressions** — changes in resolved page content (block text after formula/reference substitution, prose body text, FAQ answers) that alter what users read without changing route structure, metadata, or visual layout.

Real-world example: a formula reference `=(business.offer.price.setup)` that previously resolved to `"200 €"` now resolves to `"150 €"` because a content file was edited. No schema breaks, no route changes, no visual layout breaks — but the semantic meaning of the page has shifted. This change passes every existing gate and reaches production silently.

## Problem

No system snapshots **resolved page content** (block props after `resolveReferencesDeep` substitution, prose body text, FAQ Q&A pairs) and diffs it against a golden baseline. Specifically:

- `behavior.snapshot.validate` (RFC-0269) inspects route-level metadata only — title, OG tags, JSON-LD, canonical. It does not inspect resolved block content, formula values, or prose body text.
- `generated.drift.validate` (RFC-0601) checks files with registered generators in `GENERATOR_OWNERSHIP_MAP`. Resolved page content has no registered generator — it is built from content files at render time via `loadSemanticSiteModel`.
- `semantic.targets.validate` checks structural semantic targets, not content drift.
- Axiom visual regression checks visual layout, not semantic text content.

A content edit that changes a formula result, a referenced label, or a prose paragraph passes all existing gates if it does not break schema, route structure, or visual layout. DNA-58 (generated-file content determinism) covers generated files only. There is no DNA invariant for resolved page content determinism.

## Decision

The kernel gains a `content.regression.check` command that snapshots resolved page content for every route, hashes it per-route, and diffs against a golden baseline stored in the cache clone. Content drift emits `CREG-01` diagnostics and gates `mission.validate`. A companion `content.regression.snapshot.update` command updates the golden baseline after operator review. `mission.close` copies the current snapshot to the cache clone as the new golden baseline, mirroring the existing `.cache/video/` copy pattern. DNA-61 (resolved content regression gate) is established by this RFC.

## Architectural fit

### Architecture DNA

- **DNA-58** (generated-file content determinism) — extended. DNA-58 covers generated files with registered generators. This RFC extends the determinism principle to resolved page content that has no registered generator.
- **DNA-61** (resolved content regression gate) — established by this RFC. Every route's resolved content is snapshot-hashed and compared against a golden baseline. Content drift is a gate violation.
- **DNA-48** (release discipline) — aligned. The release state machine requires behavior snapshot diff to pass. Content regression adds a parallel content-level diff gate.
- **DNA-46** (mission lifecycle) — aligned. The gate integrates into `mission.validate` and `mission.close`, following the same pattern as behavior snapshot and evidence sync.

### Relationship to existing systems

| System | What it checks | Relationship |
| --- | --- | --- |
| `behavior.snapshot.validate` (SNAP-01) | Route metadata: title, OG, JSON-LD, canonical | Complementary — metadata vs content |
| `generated.drift.validate` (DRIFT-01) | Generated file determinism via dryRun re-render | Complementary — file-level vs route-level |
| `mirroring.validate` | File-level mirroring across language dirs | Superset — CREG-02 checks route-level parity |
| Axiom visual regression | Visual layout via Playwright | Orthogonal — visual vs semantic |

### Site OS operator model

- **Command scope:** `app` — runs against a single site workpiece.
- **Module placement:** `packages/os/site-kernel-checks/src/content-regression.ts` — alongside `generated-drift-validate.ts` and `behavior-snapshot.ts`.
- **Pipeline integration:** `SITES_BUILD_CHECK_PIPELINE`, after `generated.drift.validate`.
- **Mission lifecycle:** `mission.validate` runs the gate; `mission.close` updates the golden baseline.
- **Scaling:** applies uniformly across all Sternsystems. No per-site configuration needed.

## Design

### CLI surface

```sh
# Validate resolved content against golden snapshot (runs in build.check pipeline)
pnpm exec site-kernel run content.regression.check --site warpgogol-com

# Update golden snapshot after operator review (prints diff first, requires --confirm to write)
pnpm exec site-kernel run content.regression.snapshot.update --site warpgogol-com --confirm

# Skip content regression gate during mission.validate (escape hatch)
pnpm exec site-kernel run mission.validate --site warpgogol-com --skip-content-regression
```

**Flags:**

| Command | Flag | Description |
| --- | --- | --- |
| `content.regression.check` | `--site <name>` | Site to validate (required, app scope) |
| `content.regression.check` | `--dry-run` | Render snapshot without writing; return diagnostics |
| `content.regression.snapshot.update` | `--site <name>` | Site to update (required, app scope) |
| `content.regression.snapshot.update` | `--confirm` | Required to write; without it, prints diff and exits 0 |
| `mission.validate` | `--skip-content-regression` | Skip content regression gate (escape hatch) |

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/content-regression.ts

interface ContentRegressionSnapshot {
  schemaVersion: 1;
  systemId: string;
  contentHash: string;  // sha256 of all route hashes
  routes: ContentRegressionRoute[];
}

interface ContentRegressionRoute {
  route: string;           // full route path (encodes language via prefix, RFC-0160)
  blocks: ContentRegressionBlock[];
  faq?: ContentRegressionFaqEntry[];
  hash: string;            // per-route sha256
}

interface ContentRegressionBlock {
  id: string;              // block id or `block-N`
  blockType: string;       // PlanetName from PlanetCatalog
  heading: string;
  lead?: string;
  body?: string;
  items?: string[];
  hash: string;            // per-block sha256 for diff attribution
}

interface ContentRegressionFaqEntry {
  question: string;
  answer: string;
}

interface ContentRegressionDiff {
  addedRoutes: string[];
  removedRoutes: string[];
  changedRoutes: ContentRegressionRouteDiff[];
}

interface ContentRegressionRouteDiff {
  route: string;
  changedBlocks: ContentRegressionBlockDiff[];
  faqChanged: boolean;
}

interface ContentRegressionBlockDiff {
  blockId: string;
  fields: string[];  // which fields changed: heading, lead, body, items
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `{cacheClonePath}/.cache/content-regression/{systemId}.snapshot.yaml` | Golden snapshot — read by `content.regression.check`, written by `content.regression.snapshot.update` and `mission.close` |
| `{workpiecePath}/.cache/content-regression/current.snapshot.yaml` | Working snapshot — generated during `build.check`, copied to cache clone on `mission.close` |
| `packages/os/site-kernel-checks/src/content-regression.ts` | Implementation: snapshot builder, diff logic, validator |
| `packages/os/site-kernel-checks/src/command-tables/build-infra.ts` | Command registration |
| `packages/os/site-kernel-checks/src/pipelines/build-check.ts` | Pipeline step addition |
| `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` | CREG-01, CREG-02, CREG-03 diagnostic rules |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | Golden snapshot copy step |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | `--skip-content-regression` flag handling |
| `docs/architecture-dna.md` | DNA-61 entry |

The snapshot file is **not committed to the workpiece git repo** — it lives only in the cache clone's `.cache/` directory, mirroring `.materialization-state.json` and `.cache/video/`.

### Output format

```json
{
  "command": "content.regression.check",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "CREG-01",
      "severity": "error",
      "route": "/leistungen/digitales-fundament",
      "message": "Resolved content for route differs from golden snapshot.",
      "data": {
        "changedBlocks": [
          { "blockId": "block-1", "fields": ["items"] }
        ],
        "faqChanged": false
      },
      "fixHint": "Review the content diff. If intended, run: pnpm exec site-kernel run content.regression.snapshot.update --site warpgogol-com"
    },
    {
      "ruleId": "CREG-02",
      "severity": "error",
      "route": "/uk/leistungen/neue-seite",
      "message": "Route exists in current snapshot but not in golden.",
      "fixHint": "New route detected. Run content.regression.snapshot.update to baseline the new route set."
    },
    {
      "ruleId": "CREG-03",
      "severity": "warning",
      "message": "No golden snapshot found for system. First mission will create the baseline on mission.close."
    }
  ],
  "summary": { "error": 2, "warning": 1, "info": 0 }
}
```

**Diagnostic rules:**

| Rule    | Severity | Description                                                                |
| ------- | -------- | -------------------------------------------------------------------------- |
| CREG-01 | error    | Resolved content for a route differs from golden snapshot                  |
| CREG-02 | error    | Route set mismatch — route exists in current but not golden, or vice versa |
| CREG-03 | warning  | No golden snapshot found — cold start, first mission creates baseline      |

### Failure modes

- **CREG-01 (content drift):** `exitCode: 1` — blocks `mission.validate`. Operator must review the diff and either update the golden snapshot or revert the content change.
- **CREG-02 (route set mismatch):** `exitCode: 1` — blocks `mission.validate`. New routes require a golden snapshot update; removed routes require operator acknowledgment.
- **CREG-03 (no golden snapshot):** `exitCode: 0` — warning only. Does not block the first mission. `mission.close` creates the baseline.
- **`--skip-content-regression` on `mission.validate`:** skips the gate entirely. `exitCode: 0` for content regression. Bordbuch audit entry recommended.
- **`loadSemanticSiteModel` failure:** `exitCode: 1` — propagated as a KERNEL error, not a CREG diagnostic. The content regression gate cannot run if the semantic model cannot be loaded.
- **Cache clone not accessible:** `exitCode: 0` with `CREG-03` warning — degrades gracefully. Cannot compare without a cache clone, but does not block the pipeline.
- **`--dry-run` mode:** renders the snapshot in memory, compares against golden, returns diagnostics without writing any files.

## Rollout

### Default behavior

- **First mission (cold start):** `content.regression.check` emits `CREG-03` warning (no golden snapshot). Does not block. `mission.close` creates the baseline by copying the working snapshot to the cache clone.
- **Subsequent missions:** `content.regression.check` compares against the golden snapshot. Drift blocks `mission.validate` with `CREG-01` or `CREG-02`.

### Existing apps

No flag day. Existing Sternsystems adopt automatically on their next mission:

1. First mission after implementation: cold start, baseline created on `mission.close`.
2. Second mission onward: full gate enforcement.

No content changes needed — the gate is purely additive. Existing content is the baseline.

### New apps

New Sternsystems created via `onboarding.scaffold` get the gate from their first mission. Cold start semantics apply — first `mission.close` creates the baseline.

### Pipeline integration

`content.regression.check` is added to `SITES_BUILD_CHECK_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/build-check.ts`, after `generated.drift.validate`:

```ts
// Content regression gate — resolved page content drift detection (RFC-0732)
{ command: "content.regression.check" },
```

### Mission lifecycle integration

**`mission.validate`:** runs `content.regression.check` as part of `build.check`. `--skip-content-regression` flag bypasses the gate.

**`mission.close`:** after the bordbuch commit and after writing `.materialization-state.json`, copies `{workpiece}/.cache/content-regression/current.snapshot.yaml` to `{cacheClone}/.cache/content-regression/{systemId}.snapshot.yaml`. This mirrors the existing `.cache/video/` copy pattern at `packages/os/site-kernel-handoff/src/mission/mission-close.ts` (state file write at line 558, media cache copy at line 576 — both are after the bordbuch commit).

### Compass document synchronization

Adding DNA-61 and two new kernel commands requires synchronizing the following Compass documents:

- `docs/verification-plan.xml` — add content regression gate verification entry
- `docs/development-plan.xml` — add `content.regression.check` and `content.regression.snapshot.update` to the command development plan

The `fo-doc-audit` step during implementation handles the actual sync.

### AGENTS.md updates

- `packages/os/site-kernel-checks/AGENTS.md` — add module entry for `content-regression.ts`
- Root `AGENTS.md` — add a rule clarifying the gate boundary: CREG-01 (content drift) vs DRIFT-01 (generated file drift) vs SNAP-01 (metadata drift)

### Programmatic surface routes

`loadSemanticSiteModel` loads all routes, including programmatic surface pages (DNA-39) generated from PBP data and supplementary collections. Surface routes ARE included in the content regression snapshot intentionally. When an operator updates PBP data (e.g., changes a price), surface page content changes — this produces CREG-01 diagnostics. The operator workflow is the same as for authored content changes: review the diff, run `content.regression.snapshot.update` if the changes are legitimate. The `--skip-content-regression` escape hatch is available when the operator knows all changes are PBP-driven.

### `--skip-content-regression` flag propagation

`mission.validate` runs the `build.check` pipeline via `executeKernelPipeline`. The `--skip-content-regression` flag is passed as a pipeline-scoped flag to `executeKernelPipeline`. The `content.regression.check` pipeline step checks for this flag in its `KernelCommandInput.flags` and short-circuits to a pass result when set. This is the same mechanism used by other pipeline steps that support skip flags.

### Performance estimate

`loadSemanticSiteModel` takes ~50-100ms per language for a medium site (~50 routes). For warpgogol-com (3 languages), this adds ~150-300ms to `build.check`. The cost is only paid when content actually changes (distribution reuse skips the build cycle when `build-input-hash` matches). For larger sites (100+ routes), the cost scales linearly with route count.

### Distribution reuse

`build-input-hash` already includes the content tree hash. If content is unchanged, the build cycle is skipped and `content.regression.check` is not invoked. The golden snapshot is a gate, not a build input — it is not included in `build-input-hash`.

## Alternatives considered

### Extend `behavior.snapshot.validate` to include content fields

**Rejected.** `behavior.snapshot.validate` checks route-level metadata (title, OG tags, JSON-LD). Content fields (block text, formula results, FAQ answers) have different semantics, different granularity (per-block vs per-route), and different update frequency. Conflating metadata drift with content drift would produce confusing diagnostics and make it harder to attribute changes. Separate commands provide cleaner separation of concerns and independent caching.

### Extend `generated.drift.validate` to cover semantic content

**Rejected.** `generated.drift.validate` works by re-invoking registered generators with `dryRun: true` and comparing output. Resolved page content has no registered generator — it is built from content files at render time via `loadSemanticSiteModel`. The `GENERATOR_OWNERSHIP_MAP` pattern does not apply. A fundamentally different mechanism (semantic model loading + content hashing) is needed.

### Commit the snapshot to the workpiece git repo

**Rejected.** The snapshot is a derived artifact, not authored content. Committing it to the workpiece would create git churn on every content edit and pollute diffs with generated content. The cache clone is the correct location — it mirrors `.materialization-state.json` and `.cache/video/`.

### Use route set parity as a separate command

**Rejected.** Route set parity (CREG-02) is fundamentally part of content regression — it answers "did the set of routes with content change?" Splitting it into a separate command adds registration overhead without benefit. CREG-01 and CREG-02 share the same snapshot and the same pipeline step.

## Risks

### Performance

`content.regression.check` calls `loadSemanticSiteModel` for each supported language. For sites with many pages and languages, this adds N×L semantic model loads to `build.check`. Mitigation: the gate is skipped when `build-input-hash` matches (distribution reuse), so the cost is only paid when content actually changes.

### False positives

Content references that resolve differently based on environment (e.g., env-dependent fallbacks) could produce false CREG-01 diagnostics. Mitigation: `resolveReferencesDeep` is deterministic given the same content ref index — the index is generated in `build.prepare` and is stable for a given content tree.

### Agent misinterpretation

Agents may confuse `CREG-01` (content drift) with `DRIFT-01` (generated file drift) or `SNAP-01` (metadata drift). The `fixHint` in each diagnostic explicitly names the command to run. The RFC and `AGENTS.md` must clearly state which gate covers which concern.

### Escape hatch abuse

`--skip-content-regression` could be used to bypass the gate routinely. Mitigation: the flag is per-`mission.validate` invocation, not a persistent setting. Bordbuch audit entry is recommended when used. The flag does not skip the golden snapshot update on `mission.close` — even if validation is skipped, the baseline is refreshed.

### Snapshot staleness

If an operator updates the golden snapshot without reviewing the diff, content regressions are silently accepted. Mitigation: `content.regression.snapshot.update` prints the diff to stdout before writing. The command requires `--confirm` flag to write — without it, the command prints the diff and exits 0 without updating. This two-step workflow (review diff, then `--confirm`) prevents accidental golden snapshot updates. This is a human discipline issue, not a technical one — same as `behavior.snapshot.generate`.

## Acceptance criteria

- [x] `content.regression.check` command registered in `command-tables/build-infra.ts` with `scope: app`, `cacheable: false`, `supportsAllSites: true` (evidence: 026bf9f7)
- [x] `content.regression.snapshot.update` command registered in `command-tables/build-infra.ts` (evidence: 026bf9f7)
- [x] `content.regression.check` added to `SITES_BUILD_CHECK_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/build-check.ts` (evidence: 1c0985cd)
- [x] `CREG-01`, `CREG-02`, `CREG-03` diagnostic rules registered in `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` (evidence: 1c0985cd)
- [x] Snapshot structure: YAML with `schemaVersion`, `systemId`, `contentHash`, `routes[]` (each route has `route`, `blocks[]`, `faq?[]`, `hash`) (evidence: 747b4999)
- [x] Snapshot stored at `{cacheClonePath}/.cache/content-regression/{systemId}.snapshot.yaml` — not committed to workpiece git (evidence: 747b4999)
- [x] `mission.close` copies working snapshot to cache clone after bordbuch commit, after `.materialization-state.json` write (mirrors `.cache/video/` pattern) (evidence: f740028b)
- [x] `mission.validate` supports `--skip-content-regression` flag (evidence: 7bf9bf67)
- [x] Cold start: `CREG-03` warning emitted when no golden snapshot exists; `exitCode: 0`; does not block first mission (evidence: 9a3cf0f0)
- [x] `DNA-61` entry added to `docs/architecture-dna.md` with reference to this RFC (evidence: 71ad541f)
- [x] Unit tests: red (drift detected → CREG-01), green (no drift → pass), cold start (no golden → CREG-03), route set mismatch (CREG-02) (evidence: 9a3cf0f0)
- [x] `rfc.validate` passes on this file with zero errors (evidence: rfc.validate --id RFC-0732 exit 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The snapshot file MUST NOT be committed to the workpiece git repo. It lives only in the cache clone's `.cache/` directory.
- The unit of measurement is the **route** (path). Language is encoded in the route path via prefix (RFC-0160), not a separate dimension. The system treats routes as opaque paths and does not care about language.
- Snapshot content includes **resolved values only** (after `resolveReferencesDeep`). Raw formula syntax is structural — covered by `semantic.targets.validate`.
- `content.regression.check` MUST support `dryRun: true` for consistency with other validators.
- The `--skip-content-regression` flag on `mission.validate` is an escape hatch, not a routine workflow. Bordbuch audit entry recommended when used.
- `mission.close` MUST update the golden snapshot even if `--skip-content-regression` was used during validation — the baseline is always refreshed on close.
- Use `writeFileIfChanged` from `@warpgogol/site-kernel` for all snapshot file writes.
- Use `byteHash` / `stableJsonHash` from `@warpgogol/fingerprint` for content hashing (DNA-53).
- Use `buildGeneratedHeader` from `@warpgogol/site-kernel` for the snapshot file header (YAML comment style).
- Use `diagnosticsResult` from `packages/os/site-kernel-checks/src/result-helpers.ts` for diagnostic output format.
