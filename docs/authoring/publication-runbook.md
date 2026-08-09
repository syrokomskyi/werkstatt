# Publication Runbook — Private npm via repo-extract

This runbook describes the operator-triggered publication pipeline for `@warpgogol/werkstatt` and plugin packages (`werkstatt-site`, `werkstatt-game`, `werkstatt-video`) to private npm. Established by RFC-0773.

## Prerequisites

- npm account with access to the `@warpgogol` scope (restricted access).
- npm token with `publish` scope for the operator.
- `@warpgogol/repo-extract` available locally.
- Git LFS installed (`git lfs install`) if publishing packages with LFS-tracked assets (e.g. `werkstatt-site` UI assets).
- Extraction config (`extract.config.yaml`) exists for the target package and is pinned in `.forge/pinned.yaml`.

## Verification gate

Publication is operator-triggered. Run each step in sequence; abort on any non-zero exit.

### 1. Dry-run extraction

```sh
repo-extract --config packages/<name>/extract.config.yaml --dry-run
```

Review the extraction plan: file list, dependency rewrites, git remote target. Abort if unexpected files appear (e.g. `.npmrc`, secrets, tmp directories).

### 2. Real extraction

```sh
repo-extract --config packages/<name>/extract.config.yaml
```

This creates a standalone folder outside the monorepo, rewrites `workspace:*` deps to published versions, strips `@warpgogol/` scope prefixes, and pushes to the external git remote (`git.autoPush: true`).

### 3. Build and test in extraction folder

```sh
cd <extraction-folder>
pnpm install
pnpm build
pnpm test
```

Abort on any build or test failure. Fix in the monorepo, re-extract.

### 4. Pack and fixture smoke test

```sh
npm pack
```

Install the resulting tarball into the fixture workshop at `packages/werkstatt/test-fixtures/fixture-workshop/`:

```sh
cd packages/werkstatt/test-fixtures/fixture-workshop/
npm install <path-to-tarball>
```

Run smoke commands:

```sh
npx site-kernel --version
npx site-kernel run werkstatt.plugin.validate
```

Abort if smoke commands fail. The monorepo dogfooding gap that allowed the failure must be closed (add the missing check to `packages.check`).

### 5. Publish

```sh
cd <extraction-folder>
npm publish --access restricted
```

Verify publication:

```sh
npm view @warpgogol/<name>@<version>
```

## Token management

- The npm token lives in `.npmrc` inside the extraction folder only.
- It is never committed to git — `excludePathSegments: [".npmrc"]` in `extract.config.yaml` prevents extraction.
- Token rotation is operator-triggered:
  1. Revoke the old token in the npm dashboard.
  2. Generate a new token with `publish` scope.
  3. Write the new token to `.npmrc` in the extraction folder.
- Consumer workshops need an `.npmrc` with a `read`-scope token for the `@warpgogol` scope. This is documented in RFC-0779 scaffolding.

## Rollback

If `npm publish` succeeds but the published package is broken:

1. **Deprecate** the broken version:
   ```sh
   npm deprecate @warpgogol/<name>@<version> "<reason>"
   ```
2. **Fix-forward** — patch the issue in the monorepo, re-extract, publish a patch version.
3. **Unpublish** (new packages only, within 72h):
   ```sh
   npm unpublish @warpgogol/<name>@<version>
   ```
   This is not the primary path — the ecosystem is forward-only. Use `unpublish` only for packages with zero downstream installs.

## Failure modes

| Failure | Action |
| --- | --- |
| Secret scan hit | Abort publication. Fix in monorepo, re-extract. |
| Smoke test failure | Abort publication. Close the dogfooding gap in `packages.check`, re-extract. |
| `npm publish` network failure | Retry. Check `npm view <pkg>@<version>` before retrying — npm registry is eventually consistent, a failed publish may leave the package in a pending state. |
| LFS pointer in extraction | Abort. repo-extract must materialize real content, not LFS pointers. If repo-extract lacks LFS support, create an upstream issue/PR before wave 3. |

## Plugin packages

Plugin packages (`werkstatt-site`, `werkstatt-game`, `werkstatt-video`) reuse the identical `extract.config.yaml` shape when they land. Each plugin's config adds the engine to `preservePackages` and pins the engine peer range in its `package.json`. See RFC-0773 for the versioning policy.
