# Fix Patterns (L1)

Baseline fix patterns for `mission.reconcile` failures. These are the starter set — the skill grows this file through AI per operator direction, never by hand.

## Pattern A — Missing pre-image blob

**When:** `git am --3way` fails with `error: sha1 information is lacking or useless (<file>)` or `error: could not build fake ancestor`.

**Cause:** The cache clone doesn't have the pre-image blob (the file version from the workpiece's materialize commit). This happens when the cache clone and workpiece diverged — the cache clone has a different version of the file, and git can't find the original blob to construct a 3-way merge base.

**Action:**

1. Fetch workpiece objects into the cache clone:
   ```sh
   git fetch <workpiece-path> --no-tags
   ```
2. Reset cache clone to pre-reconcile SHA (from `evidence/reconciliation-report.json` or `git reflog`).
3. Re-run `mission.reconcile` or apply patches manually.

**Example:**

```
error: sha1 information is lacking or useless (public/_redirects).
error: could not build fake ancestor
```

→ `git fetch /path/to/workpiece --no-tags`, then retry.

## Pattern B — Add/add conflict on generated files

**When:** `CONFLICT (add/add): Merge conflict in <file>` on generated artifacts.

**Typical files:** `entitlements.generated.yaml`, `freshness.generated.yaml`, `surface.generated.yaml`, `surface/states/pointer.yaml`, `surface/states/*.state.yaml`, `content-ref-index.generated.yaml`.

**Cause:** The cache clone already contains these files from previous missions. The workpiece creates them fresh during materialize. Git sees two unrelated additions of the same file and can't merge them.

**Action:** The workpiece version is authoritative (just validated). Resolve with `--theirs`:

```sh
git checkout --theirs .
git add -A
git am --continue
```

Repeat for each conflicting patch. Non-conflicting patches apply normally.

**Example:**

```
CONFLICT (add/add): Merge conflict in src/entitlements.generated.yaml
CONFLICT (add/add): Merge conflict in src/freshness.generated.yaml
```

→ `git checkout --theirs . && git add -A && git am --continue`

## Pattern C — Dirty bordbuch after mission.migrate

**When:** Cache clone has uncommitted changes in `bordbuch/events.ndjson` after `mission.migrate` ran.

**Cause:** `mission.migrate` appends an event to the bordbuch but doesn't commit it. The bordbuch is cache-clone-specific and not part of the workpiece.

**Action:** Commit the bordbuch event:

```sh
git add bordbuch/events.ndjson
git commit -m "bordbuch: record <event description>"
```

## Pattern D — Dirty workpiece after mission.validate

**When:** Workpiece has uncommitted files after `mission.validate` ran.

**Cause:** `mission.validate` runs `astro build`, which generates/modifies files in `public/` and `src/` (markdown pages, API JSON, SBOM, generated artifacts).

**Action:** Commit via:

```sh
pnpm exec site-kernel run mission.git.commit --mission <missionId> --message "build: astro build output and regenerated artifacts from mission.validate"
```

## Decision tree

```
mission.reconcile error:
├── "has not passed validation" → run mission.validate first
├── "uncommitted file(s)" in workpiece → commit (Pattern D)
├── "uncommitted file(s)" in cache clone → commit (Pattern C for bordbuch)
├── "sha1 information is lacking" → fetch workpiece objects (Pattern A)
├── "CONFLICT (add/add)" on generated files → --theirs (Pattern B)
├── "CONFLICT" on content files → ask operator
└── other → ask operator, record in L0
```
