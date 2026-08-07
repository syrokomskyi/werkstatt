# Exploration: Content Regression Gate

**Date:** 2026-08-05 **Status:** Design decisions resolved — ready for RFC creation

## Problem Statement

The existing pipeline catches structural regressions (schema validation, route topology), visual regressions (Axiom + Playwright), and generated-file determinism (DRIFT-01). But it does **not** catch **semantic content regressions** — changes in resolved content that alter what users read without changing route structure or failing schema validation.

Example: a formula reference `=(business.offer.price.setup)` that previously resolved to `"200 €"` now resolves to `"150 €"` because a content file was edited. No schema breaks, no route changes, no visual layout breaks — but the semantic meaning of the page has shifted.

## Existing Systems and Gaps

### What exists

| System | What it checks | Where it runs | Gap |
| --- | --- | --- | --- |
| `behavior.snapshot.validate` (SNAP-01) | Route-level metadata: title, metaDescription, canonical, hreflang, OG/Twitter, JSON-LD, breadcrumbs, robotsMeta, inSitemap, hasMarkdownTwin | `build.post` pipeline (`@/packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts:62`) | Does not inspect resolved block content, formula values, or prose body text |
| `generated.drift.validate` (DRIFT-01) | Generated file determinism via dryRun re-render and byte comparison | `build.check` pipeline (`@/packages/os/site-kernel-checks/src/pipelines/build-check.ts:44`) | Only checks files with registered generators in `GENERATOR_OWNERSHIP_MAP`. Does not check resolved page content |
| `generated.stale.validate` | Orphaned files in public/ | `build.prepare` pipeline | File existence only, not content |
| `semantic.targets.validate` | Page semantic targets fail as diagnostics | `sites-check.author` pipeline | Structural validation, not content drift |
| Axiom visual regression | Visual invariants via Playwright | External (mission.check) | Visual layout, not semantic text content |

### The gap

No system snapshots **resolved page content** (block props after formula/reference substitution, prose body text, FAQ answers) and diffs it against a golden baseline. A content edit that changes a formula result, a referenced label, or a prose paragraph passes all existing gates if it doesn't break schema or route structure.

## Proposed System: Content Regression Gate

### Overview

A snapshot-based system that:

1. **Snapshots** resolved content for every page/route after `build.prepare` + content resolution
2. **Diffs** the snapshot against a golden baseline stored in the cache clone
3. **Gates** publication: drift blocks `mission.close` unless explicitly approved
4. **Updates** the golden snapshot on `mission.close` or via an explicit command

### Integration Points

#### 1. New kernel command: `content.regression.check`

**Registration:** Add to `command-tables/build-infra.ts` (alongside `behavior.snapshot.validate` and `generated.drift.validate`).

**Pipeline placement:** Add as a step in `SITES_BUILD_CHECK_PIPELINE` (`@/packages/os/site-kernel-checks/src/pipelines/build-check.ts`), after `generated.drift.validate`:

```ts
// Content regression gate — semantic content drift detection
{ command: "content.regression.check" },
```

**Scope:** `app` (same as other build checks). Runs against the workpiece after `build.prepare` has generated the content ref index.

**What it does:**

1. Load `SemanticSiteModel` for each supported language via `loadSemanticSiteModel` (`@/packages/os/site-kernel-content/src/semantic-loader.ts:487`). Each call returns pages with fully-resolved routes (route path already encodes language via prefix per RFC-0160).
2. For each route, extract resolved content: block heading, lead, body, items, FAQ Q&A pairs
3. Hash the resolved content per route (route path is the key — language is encoded in the path, not a separate dimension)
4. Compare against the golden snapshot stored in the cache clone
5. Emit `CREG-01` (content drift) diagnostics with a per-route diff summary

**Golden snapshot location:** `{cacheClonePath}/.cache/content-regression/{systemId}.snapshot.yaml`

This follows the existing pattern of storing derived artifacts in the cache clone (`.cache/video/`, `.cache/video-live/`, `.materialization-state.json`).

#### 2. Golden snapshot lifecycle

**Creation/Update via explicit command:** `content.regression.snapshot.update`

A standalone kernel command that regenerates the golden snapshot and writes it to the cache clone. Operators run this when they've reviewed the drift and approved it.

**Auto-update on `mission.close`:** In `runMissionClose` (`@/packages/os/site-kernel-handoff/src/mission/mission-close.ts:160`), after the bordbuch commit and before the final `.materialization-state.json` write, add a step that copies the current workpiece's content regression snapshot to the cache clone as the new golden baseline.

This mirrors the existing pattern where `mission.close` copies `.cache/video/` and `.cache/video-live/` from workpiece to cache clone (`@/packages/os/site-kernel-handoff/src/mission/mission-close.ts:576-598`).

**Flow:**

```
mission.validate
  → build.prepare (generates content-ref-index)
  → build.check (includes content.regression.check)
    → diff against golden snapshot in cache clone
    → CREG-01 diagnostics on drift
  → astro build
  → build.post

mission.close
  → inline mission.validate (re-checks)
  → locks acquired
  → bordbuch commit
  → copy content regression snapshot → cache clone (new golden)
  → write .materialization-state.json
```

#### 3. Operator approval workflow

When `content.regression.check` detects drift:

- The validator returns `CREG-01` diagnostics with per-page changed fields
- `mission.validate` fails (exitCode 1), blocking the pipeline
- Operator reviews the diff (printed in the validation report)
- If approved: operator runs `content.regression.snapshot.update --site <systemId>` to update the golden
- Then re-runs `mission.validate` → passes → `mission.reconcile` → `mission.close`

**Escape hatch:** `--skip-content-regression` flag on `mission.validate` (same pattern as `--skip-evidence-sync` on `mission.close`). Use sparingly — bordbuch audit entry recommended.

#### 4. Snapshot structure

```yaml
# Generated by content.regression.check
schemaVersion: 1
systemId: warpgogol-com
generatedAt: null  # deterministic — no timestamp
contentHash: sha256:...
routes:
  - route: /leistungen/digitales-fundament  # default language (unprefixed, RFC-0160)
    blocks:
      - id: block-0
        blockType: hero-decision-card
        heading: "Digitales Fundament"
        lead: "..."
        body: null
        items: null
      - id: block-1
        blockType: price-card
        heading: "..."
        items:
          - "200 €"
          - "70 €"
    faq:
      - question: "..."
        answer: "..."
    hash: sha256:...  # per-route hash
  - route: /uk/leistungen/digitales-fundament  # Ukrainian (prefixed)
    blocks: [...]
    hash: sha256:...
  - route: /de/leistungen/digitales-fundament  # German (prefixed)
    blocks: [...]
    hash: sha256:...
```

#### 5. Route set parity

Since every route encodes language in its path, route set parity is simply comparing the set of routes in the current snapshot against the golden snapshot. Missing or extra routes are `CREG-02` diagnostics.

This is **not** a cross-language check — it's a route-set check. If a route `/uk/leistungen/digitales-fundament` exists in the golden but not in the current snapshot, that's `CREG-02` regardless of which language it represents. The system treats routes as opaque paths.

Existing `mirroring.validate` (`@/packages/os/site-kernel-checks/src/checks/mirroring.ts`) checks file-level mirroring across language directories. `CREG-02` checks route-level parity in the resolved snapshot — a stronger signal because it operates on the semantic model, not just file existence.

#### 6. Generated text files in `public/`

The existing `generated.drift.validate` (DRIFT-01) already covers generated public files (`llms.txt`, `llms-full.txt`, `robots.txt`, `sitemap.xml`, etc.) by re-invoking generators with `dryRun: true` and comparing output.

The content regression gate **does not duplicate** this. It focuses on resolved page content that has no registered generator — the semantic model built from content files at render time.

However, the `llms-full.txt` file is a special case: it contains resolved page content (page descriptions, leads, body text, FAQ answers). If `generated.drift.validate` already catches drift in `llms-full.txt`, the content regression gate provides a **finer-grained** signal: which specific page's content changed, not just "the file differs."

**Recommendation:** The content regression gate and `generated.drift.validate` are complementary. DRIFT-01 catches file-level drift; CREG-01 catches page-level semantic drift with attribution.

### Key Files to Modify

| File | Change |
| --- | --- |
| `packages/os/site-kernel-checks/src/command-tables/build-infra.ts` | Register `content.regression.check` and `content.regression.snapshot.update` commands |
| `packages/os/site-kernel-checks/src/pipelines/build-check.ts` | Add `content.regression.check` step to `SITES_BUILD_CHECK_PIPELINE` |
| New: `packages/os/site-kernel-checks/src/content-regression.ts` | Implementation: snapshot builder, diff logic, validator |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | Add golden snapshot copy step (after bordbuch, before materialization state) |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Add `--skip-content-regression` flag handling in `runMissionValidate` |
| `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` | Register `CREG-01` and `CREG-02` diagnostic rules |

### Dependencies (existing infrastructure to reuse)

- `loadSemanticSiteModel` from `@warpgogol/site-kernel-content` — builds the resolved semantic model
- `resolveReferencesDeep` from `@warpgogol/share` — resolves content references in block props
- `resolveCachePath` from `@/packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts` — resolves cache clone path
- `fingerprintTree` / `byteHash` from `@warpgogol/fingerprint` — content hashing
- `diagnosticsResult` from `@/packages/os/site-kernel-checks/src/result-helpers.ts` — diagnostic output format
- `buildGeneratedHeader` from `@warpgogol/site-kernel` — generated file header for snapshot file

### Relationship to existing `behavior.snapshot`

The behavior snapshot (`behavior.snapshot.generated.yaml`) checks route-level metadata. The content regression gate checks page-level resolved content. They are complementary:

- **behavior.snapshot:** "Did the route's metadata change?" (title, OG tags, JSON-LD, canonical)
- **content.regression.check:** "Did the route's content change?" (block text, formula results, FAQ answers)

Both use the same golden-snapshot-in-cache-clone pattern and the same diff-then-gate workflow.

### Design decisions (resolved)

1. **Snapshot format:** YAML — human-readable, diff-friendly, matches `behavior.snapshot.generated.yaml`.
2. **Unit of measurement:** Route (path). Language is encoded in the route path via prefix (RFC-0160), not a separate dimension. The system works with routes and does not care about language.
3. **Hash granularity:** Per-route hash for gate decisions + per-block hashes for diff attribution. Route is the key.
4. **Snapshot storage:** Cache clone only (like `.materialization-state.json`). Derived artifact, not authored content.
5. **Cold start:** `content.regression.check` emits `CREG-03` warning when no golden snapshot exists. First `mission.close` creates the baseline. Does not block the first mission.
6. **Distribution reuse:** `build-input-hash` already includes content tree hash. If content unchanged, build cycle is skipped and `content.regression.check` is not invoked. Golden snapshot is a gate, not a build input — not included in `build-input-hash`.
7. **Route set parity:** Part of `content.regression.check` (not a separate command). `CREG-02` covers missing/extra routes. The system treats routes as opaque paths — language is irrelevant.
8. **dryRun support:** Yes, for consistency with other validators.
9. **Snapshot content:** Resolved values only (after `resolveReferencesDeep`). Raw formula syntax is structural — covered by `semantic.targets.validate`.
