---
id: RFC-0480
title: Mission git workpiece, edits-only-through-missions, and Layer C protection
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-21
updatedAt: 2026-07-24
enhancedAt: 2026-07-21
implementedAt: 2026-07-24
closedAt: null
supersedes: []
supersededBy: null
amends:
- RFC-0472
amendedBy:
- RFC-0568
- RFC-0522
related:
- DNA-44
- DNA-45
- DNA-46
- DNA-47
- DNA-48
- DNA-49
- DNA-50
- DNA-53
- RFC-0269
- RFC-0354
- RFC-0355
- RFC-0356
- RFC-0357
- RFC-0358
- RFC-0359
- RFC-0472
- RFC-0478
- RFC-0479
satisfies:
- DNA-46
- DNA-47
commands:
  proposed: []
  added:
  - mission.cleanup
  - mission.git.commit
  - surface.contract.validate
  changed:
  - mission.materialize
  - mission.reconcile
  - mission.abort
  - mission.close
  - mission.preview
  - release.prepare
  - sternsystem.sync
  - sternsystem.validate
  removed: []
appsImpacted: []
packagesImpacted:
- '@gogol/site-kernel-handoff'
- '@gogol/ontology'
- '@gogol/share'
- '@gogol/forge'
successSignals:
- Workpiece is a fresh git repository with step-by-step commits for materialize, migrate, and operator edits
- mission.reconcile transfers workpiece commits to cache clone via git format-patch + git am
- mission.preview runs a dev server for any mission (open, closed, or aborted) for side-by-side comparison
- Edits to Sternsystem content outside a mission are detected and rejected
- Layer C surfaces (URL schema, JSON-LD, sitemaps) are protected by declarative contracts in @gogol/ontology
nonGoals:
- Does not define migrator semantics or versioning enforcement — those are RFC-0478 and RFC-0479
- Does not replace the local bare repo as canonical origin — mirror remains a secondary backup
- Does not implement branch protection enforcement on the git hosting side — that is an operator action
- Does not define the full Layer C contract schema — initial contract covers URL patterns, JSON-LD types, and sitemap shape; extension is incremental
versionBump: patch

---

# RFC-0480: Mission git workpiece, edits-only-through-missions, and Layer C protection

## Context

The WGogol platform develops sites without backward compatibility for internal layers (A: platform packages, B: data contracts) while protecting external surfaces (C: URL schema, JSON-LD, sitemaps). RFC-0478 enforces platform versioning; RFC-0479 introduces the migrator system and `mission.migrate` step. This RFC completes the governance layer: it defines how workpiece changes are tracked, how edits flow exclusively through missions, how mirror synchronization is scoped, and how Layer C is protected from breaking changes.

Today, `mission.reconcile` (DNA-46) copies data paths from workpiece to the cache clone and makes a single git commit (`git add -A && git commit -m "Reconcile <mission-id>"`). All step-by-step changes within a mission — materialization, migration, operator edits — are collapsed into one commit, losing the audit trail. Workpiece is a plain directory, not a git repository, so there is no local history of changes within a mission.

`sternsystem.sync` (RFC-0472) synchronizes the local bare repo with an external mirror (e.g. GitHub) bidirectionally. The ecosystem has no enforcement that site edits happen only through missions — an operator could clone the external mirror, edit content, push back, and `sternsystem.sync` would pull those changes into the cache clone, bypassing the mission lifecycle entirely.

Layer C (external surfaces) has no dedicated protection. Behavior snapshots (RFC-0269, DNA-48) compare readable and production builds, but do not explicitly cover URL structure, JSON-LD output, or sitemap shape. Breaking changes to A or B can inadvertently change C, harming SEO positions and breaking external integrations.

## Problem

Three governance gaps:

1. **No step-by-step audit trail in missions.** `mission.reconcile` makes one commit with all changes. Materialization, migration, and operator edits are indistinguishable in git history. Debugging "which step broke this content" requires archeology.

2. **No enforcement of edits-only-through-missions.** The ecosystem is intended to be the sole write-path for Sternsystem content, but `sternsystem.sync` (pull direction) can import external edits, bypassing the mission lifecycle. There is no detection or prevention.

3. **No dedicated Layer C protection.** Breaking changes to A (platform packages) or B (data contracts) can change URL patterns, JSON-LD types, or sitemap structure without explicit review. Behavior snapshots catch structural parity between readable and production builds but do not guard against C-level regressions.

## Decision

### 1. Workpiece as git repository

Each mission's workpiece becomes a fresh git repository (no shared ancestor with the cache clone). `mission.materialize` initializes git and commits the materialized state. Each subsequent step (`mission.migrate`, operator edits via `mission.git.commit`) makes a separate commit. `mission.reconcile` transfers the full commit history from workpiece to cache clone using `git format-patch` + `git am`.

On `mission.close` and `mission.abort`, a `git bundle` is created in `missions/<id>/evidence/` as an audit artifact. The workpiece directory remains on disk (not deleted) to support `mission.preview` for side-by-side comparison. Cleanup is an explicit operator action (`mission.cleanup`) or automated by age (workpieces older than a configurable threshold with no active mission).

### 2. Edits-only-through-missions

A new invariant: **site content edits are possible only through missions.** Enforcement:

- `sternsystem.sync` `--direction pull` and `--direction both` are deprecated for normal workflow. `sternsystem.sync` is explicitly scoped to disaster recovery only (cache clone lost or corrupted). `sternsystem.sync --direction pull` emits a warning that it bypasses the mission lifecycle.
- `sternsystem.validate` detects commits in the cache clone that do not correspond to any recorded `mission.reconcile` Bordbuch entry. If detected, the Sternsystem status is demoted to `paused` and `mission.materialize` refuses to proceed until the discrepancy is resolved.
- `AGENTS.md` documents the invariant: agents MUST NOT edit Sternsystem content outside a mission. Agents MUST NOT recommend `sternsystem.sync --direction pull` for normal workflow.

### 3. Layer C protection

Layer C (external surfaces) is protected by three mechanisms:

**a) Declarative C-contract in `@gogol/ontology`**

A new `packages/ontology/src/external-surfaces/` module declares the canonical C-contract:

- `url-schema.yaml` — URL pattern definitions (route patterns, parameter shapes, locale prefix rules).
- `jsonld-types.yaml` — JSON-LD `@type` catalog and required property sets per type.
- `sitemap-shape.yaml` — Sitemap URL entry shape, changefreq/priority fields, alternate hreflang structure.

Code that generates C-surfaces (route registry, semantic layer, sitemap generator) MUST conform to these contracts. Changing a C-contract requires a separate RFC with `breaksC: true` in frontmatter — a new field introduced by this RFC.

**b) Behavior snapshot C-coverage**

Behavior snapshots (RFC-0269, DNA-48) are extended to include:

- Full URL list (all routes, all locales).
- JSON-LD output per page (type + property set).
- Sitemap XML structure.

The snapshot diff flags any C-level change. If a breaking change to A or B changes C without a `breaksC: true` RFC — `release.prepare` blocks.

**c) Contract tests**

A test suite in `packages/share/src/__tests__/external-surfaces/` validates that generated C-surfaces match the declarative contract. These tests run in `ci.local.validate` and `build.check`.

### 4. `breaksC` frontmatter field

New optional RFC frontmatter field:

```yaml
breaksC: true  # or omit / false
```

If an RFC changes Layer C (URL schema, JSON-LD types, sitemap shape), it MUST declare `breaksC: true`. `rfc.validate` checks:

- If `breaksC: true` — the RFC must also update the declarative C-contract in `packages/ontology/src/external-surfaces/`.
- If `breaksC` is absent or `false` but the RFC changes files in `packages/ontology/src/external-surfaces/` — V-30 warning.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract):** Workpiece as git repository does not change the data-only invariant — the workpiece is still disposable and non-canonical. The cache clone remains the canonical local copy.
- **DNA-45 (Fleet registry):** `sternsystem.validate` gains Bordbuch-vs-git-log consistency check. Registry `status: paused` is used when external edits are detected.
- **DNA-46 (Mission lifecycle):** Workpiece is now a git repository with step-by-step commits. `mission.close` and `mission.abort` create git bundles. Bordbuch records `git-bundle` events. `migratedAt`, `previewedAt` timestamps added to mission manifest.
- **DNA-47 (Materialization):** `mission.materialize` initializes git in workpiece. `mission.reconcile` uses `git format-patch` + `git am` instead of `copyDir` + single commit.
- **DNA-48 (Release discipline):** Behavior snapshots extended with C-coverage. `release.prepare` blocks on C-level changes without `breaksC: true` RFC.
- **DNA-49 (Fleet propagation):** Layer C protection ensures that fleet propagation does not deploy C-breaking changes to production without explicit RFC approval.
- **DNA-50 (Notausgang export):** Notausgang exports the `dist` — Layer C protection ensures the exported `dist` has consistent C-surfaces.
- **DNA-53 (Semantic fingerprint):** C-contract files in `packages/ontology/src/external-surfaces/` are included in the platform semantic hash, so C-contract changes trigger version enforcement (RFC-0478).
- **RFC-0472 (sternsystem.sync):** Amended — `sternsystem.sync --direction pull` and `--direction both` are removed (forward-only). `sternsystem.sync` supports push-only. For disaster recovery, operators use raw `git fetch` in the bare repo.
- **RFC-0479 (Migrator system):** `mission.migrate` commits to the workpiece git repository. `mission.reconcile` transfers all commits including migration commits.

## Design

### Workpiece as git repository

#### `mission.materialize` changes

After copying data to the staging directory and before atomic move to workpiece:

1. `git init` in the staging directory.
2. `git add -A && git commit -m "materialize from pin <version>"`.
3. Atomic move to workpiece (includes `.git`).

#### `mission.migrate` commits

After applying migrators:

1. `git add -A && git commit -m "migrate <applied-migrator-ids>"` in workpiece.

If no changes (all migrators were no-op on already-current data):

1. No commit — `git commit --allow-empty -m "migrate (no-op) <ids>"` for audit trail.

#### `mission.git.commit` command

New command for operator edits:

```sh
pnpm exec site-kernel run mission.git.commit --mission <id> --message "operator fix: breadcrumb labels"
```

Commits all changes in the workpiece directory with the provided message. This is the canonical way for operators (and agents on their behalf) to commit edits within a mission.

Direct `git commit` in the workpiece is discouraged but not technically prevented — the workpiece is a plain git repository and any git client can commit. This is acceptable because the workpiece is disposable and non-canonical. The real enforcement boundary is the cache clone: `mission.reconcile` is the only path from workpiece to cache clone, and `sternsystem.validate` Bordbuch-vs-git-log check detects external edits on the cache clone. Direct workpiece commits that bypass `mission.git.commit` are not a governance risk — they simply lack the structured audit trail message format.

#### `mission.reconcile` changes

Replaces `copyDir` + single commit with:

1. Record cache clone's current HEAD SHA as `preReconcileSha` (stored in Bordbuch `reconcile` entry and reconciliation report).
2. `git format-patch --root` in workpiece (exports all commits as patch series).
3. `git am <patches>` in cache clone (applies commits one by one with original metadata).
4. `git push origin <branch>` in cache clone.
5. If `git am` conflicts — error with conflict details, operator resolves in workpiece and re-runs reconcile.

**Idempotency on re-run after partial `git am` failure:** `git am` is not idempotent — re-applying already-applied patches fails. On re-run, `mission.reconcile` resets the cache clone to `preReconcileSha` before applying patches:

1. Read `preReconcileSha` from the previous reconciliation report (or Bordbuch entry).
2. `git reset --hard <preReconcileSha>` in cache clone.
3. `git am <patches>` — all patches applied from scratch.

This is safe because the cache clone is locked during the mission (DNA-51) and the workpiece is the source of truth for the patch series.

#### Git bundle on close/abort

`mission.close` and `mission.abort`:

1. `git bundle create <mission-dir>/evidence/workpiece.git-bundle --all` in workpiece.
2. Bordbuch entry: `git-bundle` kind, metadata: `bundlePath`, `commitCount`, `headSha`.
3. Workpiece and distribution directories remain on disk (not deleted) for `mission.preview`.

**`mission.abort` distribution handling:** The current implementation deletes both workpiece and distribution. This RFC changes `mission.abort` to preserve both, consistent with the workpiece preservation design. The git bundle in `evidence/` is the audit trail; the on-disk workpiece and distribution enable `mission.preview` for side-by-side comparison of the aborted state.

#### `mission.preview` command

```sh
pnpm exec site-kernel run mission.preview --mission <id> --port 4321
pnpm exec site-kernel run mission.preview --mission <id> --port 4321 --production
```

Starts a dev server (or production preview with `--production`) for the workpiece. Works for open, closed, or aborted missions. Multiple `mission.preview` commands on different ports enable side-by-side comparison.

**Process model:** Blocking — the command runs `astro dev` (or `astro preview` with `--production`) in the foreground, streaming server output directly to the terminal. The operator opens separate terminal tabs for parallel previews on different ports. This is the standard Astro dev-server workflow and gives full visibility into server logs, HMR events, and errors.

#### `mission.cleanup` command

```sh
pnpm exec site-kernel run mission.cleanup --mission <id>
pnpm exec site-kernel run mission.cleanup --older-than 30d
```

Removes the workpiece directory (git bundle in evidence is preserved). `--older-than` cleans workpieces for closed/aborted missions older than the threshold. Active missions are never cleaned.

**Timestamp source:** `--older-than` is evaluated against `closedAt` or `abortedAt` from the mission manifest (not directory mtime or git bundle creation date). This is deterministic and matches the mission lifecycle state.

### Edits-only-through-missions enforcement

#### `sternsystem.sync` amendment (RFC-0472)

- `--direction pull` and `--direction both` are removed (forward-only). `sternsystem.sync` supports push-only.
- For disaster recovery, operators use raw `git fetch` in the bare repo — this is a manual operator action, not a platform command.
- `AGENTS.md` documents: agents MUST NOT recommend `sternsystem.sync --direction pull` (removed). For DR, recommend raw `git fetch` in the bare repo.

#### `sternsystem.validate` Bordbuch-vs-git-log check

New validation:

1. Read the cache clone git log (all commits on the current branch).
2. Read Bordbuch `reconcile` entries — each entry records `commitSha` (the cache clone HEAD after reconcile) and `preReconcileSha` (the cache clone HEAD before reconcile).
3. Build a set of expected SHAs: for each Bordbuch `reconcile` entry, the range `preReconcileSha..commitSha` defines the commits that the reconcile introduced. Union all ranges.
4. If git log contains commits not in any expected range → violation: `external-edit-detected`.
5. On violation: `sternsystem.validate` recommends demoting Sternsystem to `paused`.

**Matching algorithm:** Commits are matched by SHA, not by message. `mission.reconcile` records both `preReconcileSha` and `commitSha` in the Bordbuch `reconcile` entry. `sternsystem.validate` uses `git rev-list preReconcileSha..commitSha` to enumerate the expected commits for each reconcile event. Any cache-clone commit outside these ranges is an external edit.

#### `mission.materialize` guard

If Sternsystem status is `paused` (due to external edit detection), `mission.materialize` refuses to proceed:

- Error: `[mission.materialize] system '<id>' is paused due to external edit detection — resolve discrepancy before proceeding`.

### Layer C protection

#### Declarative C-contract

```
packages/ontology/src/external-surfaces/
  url-schema.yaml
  jsonld-types.yaml
  sitemap-shape.yaml
  index.ts          # re-exports parsed contracts + Zod schemas
```

**`url-schema.yaml`:**

```yaml
routePatterns:
  - pattern: "/:locale?/:slug"
    params:
      locale:
        optional: true
        enum: [de, en]
      slug:
        type: string
    generated: false  # authored routes
  - pattern: "/:locale?/:industry/:city"
    params:
      locale: { optional: true, enum: [de, en] }
      industry: { type: string, from: ontology.Industry }
      city: { type: string }
    generated: true   # PSEO routes
localePrefix:
  strategy: optional-prefix
  default: de
```

**`jsonld-types.yaml`:**

```yaml
types:
  - @type: LocalBusiness
    required: [name, address, url]
    optional: [telephone, openingHours, geo, image]
  - @type: BreadcrumbList
    required: [itemListElement]
    optional: []
  - @type: FAQPage
    required: [mainEntity]
    optional: []
```

**`sitemap-shape.yaml`:**

```yaml
urlEntry:
  required: [loc]
  optional: [lastmod, changefreq, priority, alternates]
alternates:
  required: [hreflang, href]
  optional: []
```

#### `surface.contract.validate` command

```sh
pnpm exec site-kernel run surface.contract.validate
pnpm exec site-kernel run surface.contract.validate --app warpgogol-com
```

Validates that generated C-surfaces match the declarative contract:

1. Route registry URLs match `url-schema.yaml` patterns.
2. JSON-LD output per page matches `jsonld-types.yaml` type definitions.
3. Sitemap XML matches `sitemap-shape.yaml` shape.

Included in `build.check` and `ci.local.validate` as a **blocking** check (hard fail on violation). A C-surface contract mismatch is a correctness issue — advisory warnings would allow broken C-surfaces to reach production.

#### Behavior snapshot C-coverage

`release.prepare` (DNA-48) behavior snapshot diff extended:

- **URL list:** all routes × all locales, sorted, compared between readable and production builds.
- **JSON-LD per page:** `@type` + sorted property key set, compared between readable and production.
- **Sitemap structure:** URL count, URL patterns, hreflang coverage.

If any C-surface differs between readable and production → snapshot diff fails. If any C-surface differs from previous release AND no `breaksC: true` RFC is found in the release's RFC range → `release.prepare` blocks with `C-surface-regression` violation.

#### `breaksC` frontmatter field

Added to `RFC_KNOWN_KEYS`:

```ts
breaksC: z.boolean().optional()
```

V-30 rule in `rfc.validate`:

- If `breaksC: true` — RFC must modify files in `packages/ontology/src/external-surfaces/`.
- If `breaksC` absent or `false` but RFC modifies `packages/ontology/src/external-surfaces/` — V-30 warning.

### TypeScript contracts

```ts
interface MissionPreviewData {
  missionId: string;
  systemId: string;
  port: number;
  url: string;
  mode: "dev" | "production";
  startedAt: string;
}

interface MissionCleanupData {
  missionId: string;
  cleanedPaths: string[];
  bundlePreserved: boolean;
  cleanedAt: string;
}

interface MissionGitCommitData {
  missionId: string;
  commitSha: string;
  message: string;
  committedAt: string;
}

interface SurfaceContractData {
  urlSchemaValid: boolean;
  jsonldTypesValid: boolean;
  sitemapShapeValid: boolean;
  violations: SurfaceContractViolation[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<id>/workpiece/` | Git repository with step-by-step commits |
| `missions/<id>/workpiece/.git/` | Workpiece git repository metadata |
| `missions/<id>/evidence/workpiece.git-bundle` | Git bundle audit artifact (close/abort) |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | Init git in staging, commit materialized state |
| `packages/os/site-kernel-handoff/src/mission/mission-migrate.ts` | Commit migration results to workpiece git |
| `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts` | New: `mission.git.commit` command |
| `packages/os/site-kernel-handoff/src/mission/mission-preview.ts` | New: `mission.preview` command |
| `packages/os/site-kernel-handoff/src/mission/mission-cleanup.ts` | New: `mission.cleanup` command |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Update `reconcile` with `format-patch` + `git am`; update `abort` with bundle |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts` | Remove `--direction pull` and `--direction both` (forward-only) |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts` | Bordbuch-vs-git-log consistency check |
| `packages/ontology/src/external-surfaces/url-schema.yaml` | Declarative URL pattern contract |
| `packages/ontology/src/external-surfaces/jsonld-types.yaml` | Declarative JSON-LD type contract |
| `packages/ontology/src/external-surfaces/sitemap-shape.yaml` | Declarative sitemap shape contract |
| `packages/ontology/src/external-surfaces/index.ts` | Re-exports + Zod schemas |
| `packages/ontology/package.json` | Add `./external-surfaces` subpath export |
| `packages/os/site-kernel-handoff/src/surface-contract.ts` | New: `surface.contract.validate` command |
| `packages/forge/os/rfc/types.ts` | Add `breaksC` to `RFC_KNOWN_KEYS` |
| `packages/forge/os/rfc/handlers/validate-rules.ts` | Add V-30 rule |
| `tools/kernel.config.ts` | Register new commands |
| `docs/requirements.xml` | Document edits-only-through-missions invariant |
| `docs/verification-plan.xml` | Add `surface.contract.validate` check |
| `docs/COMMANDS.md` | Add new commands |
| `AGENTS.md` | Document edits-only-through-missions, Layer C protection, `breaksC` field |

### Mission lifecycle (updated)

```
mission.open
  → mission.materialize (git init + commit "materialize from pin <version>")
  → mission.migrate (commit "migrate <ids>")
  → operator edits (mission.git.commit per edit or batch)
  → mission.validate
  → mission.release.prepare (from workpiece, fast feedback)
  → mission.reconcile (git format-patch + git am to cache clone + push)
  → mission.release.publish (requires successful reconcile)
  → mission.close (git bundle to evidence, workpiece remains)
```

Abort path:

```
mission.abort (git bundle to evidence, workpiece remains, no reconcile)
```

Preview path (any time after materialize):

```
mission.preview --mission <id> --port <N>
```

Cleanup path (after close or abort):

```
mission.cleanup --mission <id>
mission.cleanup --older-than 30d
```

### Failure modes

| Condition | Behavior |
| --- | --- |
| `git am` conflict during reconcile | Error with conflict details, operator resolves in workpiece, re-runs reconcile |
| `git bundle create` fails on close/abort | Warning: bundle creation failed, close/abort proceeds, Bordbuch records failure |
| `mission.preview` port already in use | Error: port <N> is in use, suggest alternative |
| `mission.preview` workpiece not materialized | Error: workpiece not found — run mission.materialize first |
| `mission.cleanup` on active mission | Error: cannot clean workpiece for an active (open) mission |
| `sternsystem.validate` detects external edits | Violation: `external-edit-detected`, recommend demote to `paused` |
| `mission.materialize` on `paused` Sternsystem | Error: system is paused due to external edit detection |
| `surface.contract.validate` finds URL pattern mismatch | Violation: `url-schema-mismatch`, details on which route/pattern |
| `release.prepare` detects C-surface regression without `breaksC: true` | Block: `C-surface-regression`, list changed surfaces |
| `surface.contract.validate` on new system with no content/routes | Pass: no surfaces = no violations (empty contract is valid) |
| `mission.preview` on same mission from multiple terminals | Allowed: each blocks its own terminal, different `--port` values required |
| `mission.reconcile` re-run after partial `git am` failure | Reset cache clone to `preReconcileSha`, re-apply all patches from scratch |

## Rollout

1. **Workpiece git:** Update `mission.materialize` to init git and commit. Update `mission.migrate` (RFC-0479) to commit. Implement `mission.git.commit`.
2. **Reconcile:** Update `mission.reconcile` to use `git format-patch` + `git am`.
3. **Bundle:** Implement git bundle creation in `mission.close` and `mission.abort`.
4. **Preview:** Implement `mission.preview` command.
5. **Cleanup:** Implement `mission.cleanup` command.
6. **Edits-only:** Remove `--direction pull` and `--direction both` from `sternsystem.sync`. Add Bordbuch-vs-git-log check to `sternsystem.validate`. Add `paused` guard to `mission.materialize`.
7. **Layer C contract:** Create `packages/ontology/src/external-surfaces/` with initial contracts. Implement `surface.contract.validate`.
8. **Behavior snapshot C-coverage:** Extend `release.prepare` snapshot diff with URL, JSON-LD, sitemap comparison.
9. **`breaksC` field:** Add to `RFC_KNOWN_KEYS`, implement V-30 rule.
10. **Contract tests:** Add `packages/share/src/__tests__/external-surfaces/` test suite.
11. **Documentation:** Update `AGENTS.md`, `docs/COMMANDS.md`, mission lifecycle docs.
12. **Amend RFC-0472:** Update `sternsystem.sync` documentation to reflect push-only scope. Remove pull/both direction documentation.

## Alternatives considered

- **Workpiece as sub-directory of cache clone (shared ancestor).** Rejected: breaks isolation — abort would leave the cache clone in a dirty state. Fresh git repository per mission is cleaner.
- **`git cherry-pick` instead of `format-patch` + `git am`.** Rejected: cherry-pick requires shared ancestor or manual range; `format-patch` + `git am` is the standard git mechanism for transferring commits between unrelated repositories.
- **Delete workpiece on close.** Rejected: prevents `mission.preview` for side-by-side comparison, which is a stated requirement.
- **Automatic workpiece cleanup by age.** Rejected as sole mechanism: explicit `mission.cleanup` gives operator control; age-based is a supplement, not the primary path.
- **Branch protection as sole enforcement for edits-only-through-missions.** Rejected: branch protection is on the git hosting side (GitHub/GitLab), not controllable by the platform. Bordbuch-vs-git-log check is platform-side enforcement.
- **SemVer-based C-contract versioning.** Rejected: C-contract changes are tied to RFCs, not SemVer. `breaksC: true` in the RFC frontmatter is the signal, validated by `rfc.validate`.
- **Declarative C-contract as closed enum (DNA-19 style).** Rejected: URL patterns and JSON-LD types evolve with the platform; a closed enum would require an RFC for every new route pattern. The declarative contract is versioned in `packages/ontology/` and changes through the normal RFC process with `breaksC: true`.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `git am` conflicts during reconcile | Low | Cache clone is locked during mission (DNA-51); conflicts only if disaster recovery sync introduced changes |
| Workpiece disk usage grows with many missions | Medium | `mission.cleanup --older-than` automates cleanup; git bundle in evidence is compact |
| `mission.preview` dev server port conflicts | Low | `--port` flag with clear error on conflict |
| Operator bypasses edits-only-through-missions via direct git push to mirror | Low | `sternsystem.validate` Bordbuch-vs-git-log check detects external commits on next sync |
| Declarative C-contract becomes stale | Medium | `surface.contract.validate` in `build.check` catches drift; contract is in `packages/ontology/` which is in the platform semantic hash (DNA-53) |
| `breaksC` field not declared when needed | Medium | V-30 warning + `release.prepare` blocks on C-surface regression without `breaksC: true` |
| Behavior snapshot C-coverage false positive on locale additions | Low | Snapshot diff reports additions as `added`, not `changed` — additions do not trigger `C-surface-regression` |

## Acceptance criteria

- [x] `mission.materialize` initializes git in workpiece and commits materialized state (evidence: mission-materialize.ts — git init + initial commit — 2026-07-24)
- [x] `mission.migrate` (RFC-0479) commits migration results to workpiece git (evidence: mission-migrate.ts commits after applying migrators — 2026-07-24)
- [x] `mission.git.commit` command implemented for operator edits (evidence: mission-git-commit.ts — 2026-07-24)
- [x] `mission.reconcile` uses `git format-patch` + `git am` to transfer commits to cache clone (evidence: mission-reconcile.ts — 2026-07-24)
- [x] `mission.close` creates git bundle in `evidence/` (evidence: mission-close.ts — 2026-07-24)
- [x] `mission.abort` creates git bundle in `evidence/` (no reconcile) (evidence: mission-abort.ts — 2026-07-24)
- [x] `mission.preview` command starts dev server for any mission (open, closed, aborted) (evidence: mission-preview.ts — 2026-07-24)
- [x] `mission.cleanup` command removes workpiece (preserves bundle in evidence) (evidence: mission-cleanup.ts — 2026-07-24)
- [x] `sternsystem.sync --direction pull` and `--direction both` removed (forward-only) (evidence: sternsystem-sync.ts — push-only — 2026-07-24)
- [x] `sternsystem.validate` detects external edits via Bordbuch-vs-git-log consistency check (evidence: external-edit-guard.ts — 2026-07-24)
- [x] `mission.materialize` refuses to proceed on `paused` Sternsystem (evidence: mission-materialize.ts paused guard — 2026-07-24)
- [x] `packages/ontology/src/external-surfaces/` created with URL, JSON-LD, sitemap contracts (evidence: url-schema.yaml, jsonld-types.yaml, sitemap-shape.yaml — 2026-07-24)
- [x] `surface.contract.validate` command implemented and included in `build.check` (evidence: surface-contract.ts — 2026-07-24)
- [x] `release.prepare` behavior snapshot includes URL list, JSON-LD, sitemap comparison (evidence: c-surface-guard.ts — 2026-07-24)
- [x] `release.prepare` blocks on C-surface regression without `breaksC: true` RFC (evidence: c-surface-guard.ts, breaks-c-helper.ts — 2026-07-24)
- [x] `breaksC` field added to `RFC_KNOWN_KEYS` (evidence: forge/os/rfc/types.ts:533 — 2026-07-24)
- [x] V-30 rule implemented in `rfc.validate` (evidence: validate-rules.ts — V-30 warning shown in rfc.validate output — 2026-07-24)
- [x] Contract tests in `packages/share/src/__tests__/external-surfaces/` pass (evidence: c-surface-guard.test.ts, external-edit-guard.test.ts — 2026-07-24)
- [x] `AGENTS.md` documents edits-only-through-missions invariant and Layer C protection (evidence: root AGENTS.md — 2026-07-24)
- [x] `docs/COMMANDS.md` updated with new commands (evidence: COMMANDS.md — 2026-07-24)
- [x] RFC-0472 amended with push-only scope for `sternsystem.sync` (pull/both removed) (evidence: sternsystem-sync.ts push-only — 2026-07-24)
- [x] `rfc.validate` passes on this file (evidence: pnpm exec site-kernel run rfc.validate RFC-0480 — 0 errors, 2 warnings — 2026-07-24)
- [x] `pnpm --filter @gogol/site-kernel-handoff build:check` passes (evidence: tsc --noEmit exit 0 — 2026-07-24)
- [x] `pnpm --filter @gogol/ontology build:check` passes (evidence: tsc --noEmit exit 0 — 2026-07-24)
- [x] `pnpm --filter @gogol/forge build:check` passes (evidence: tsc --noEmit exit 0 — 2026-07-24)
- [x] `packages/ontology/package.json` exports `./external-surfaces` subpath (evidence: package.json:42-45 — 2026-07-24)

## Implementation notes for agents

- Agents MAY implement this RFC only after it is accepted.
- Agents MUST use `rfc.implement.stamp` (RFC-0476) to transition this RFC from accepted to implemented.
- Agents MUST NOT edit Sternsystem content outside a mission — the ecosystem is the sole write-path.
- Agents MUST NOT recommend `sternsystem.sync --direction pull` — it is removed. For disaster recovery, recommend raw `git fetch` in the bare repo.
- Agents MUST declare `breaksC: true` in any RFC that modifies `packages/ontology/src/external-surfaces/`.
- Agents MUST use `mission.git.commit` to commit operator edits within a mission — direct `git commit` in workpiece is discouraged but not technically prevented.
- Agents MAY recommend `mission.preview` for side-by-side comparison of sites from different missions.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
