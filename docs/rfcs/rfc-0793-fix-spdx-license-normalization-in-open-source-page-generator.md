---
id: RFC-0793
title: "Fix SPDX license normalization in open-source page generator"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-10
updatedAt: 2026-08-10
enhancedAt: 2026-08-10
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0489
  - RFC-0599
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - open-source.generate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "Parenthesized SPDX expressions like (MIT OR CC0-1.0) normalize to a valid SPDX id, not the raw string"
  - "Apache2 alias resolves to Apache-2.0"
  - "Unknown license group does not appear in licenseDistribution on the open-source page"
  - "Python-2.0 is no longer aliased to PSF-2.0 (dead alias removed)"
nonGoals:
  - "Do not add new SPDX aliases beyond Apache2"
  - "Do not restructure the normalizeLicense function beyond the four targeted fixes"
  - "Do not filter Unknown packages from the component table, SBOM, or THIRD_PARTY_NOTICES — only from licenseDistribution"
  - "Do not validate license strings against a stricter schema — normalization remains best-effort"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0793: Fix SPDX license normalization in open-source page generator

## Context

The open-source page generator (`open-source.generate` in `packages/werkstatt-site/src/codegen/open-source-page.ts`) produces a license distribution chart on `/open-source/` by normalizing raw license strings from npm package metadata into SPDX identifiers. The `normalizeLicense` function (line 212) uses a combination of SPDX ID set lookup, an alias map (`LICENSE_ALIASES`), and `OR`/`AND` expression parsing to classify each dependency's license.

RFC-0489 introduced the open-source page as a deployment-specific SBOM registry with SPDX normalization. The current implementation has four defects that cause inaccurate or unknown license entries to appear in the distribution chart on the live site.

## Problem

Four bugs in `normalizeLicense` produce incorrect license distribution entries on `https://alt.warpgogol.com/open-source/`:

1. **Parenthesized SPDX expressions are not parsed.** The `OR`/`AND` parser (lines 235-253) splits on `" OR "` / `" AND "` but does not strip surrounding parentheses. For `(MIT OR CC0-1.0)`, the split produces `["(MIT", "CC0-1.0)"]` — neither part matches `spdxIds.has()` because of the trailing/leading parenthesis. The function returns `{ status: "unknown", spdxId: null }`, and the raw string `(MIT OR CC0-1.0)` appears in the distribution as-is. Affected packages: `type-fest` (2 versions), `pause-stream`, `json-schema`, `pako`.

2. **Missing `Apache2` alias.** The `LICENSE_ALIASES` map (lines 185-208) has `"Apache 2.0"`, `"Apache 2"`, `"Apache-2"` but not `"Apache2"`. The package `pause-stream@0.0.11` declares `(MIT OR Apache2)` — even after stripping parentheses, `Apache2` does not resolve to `Apache-2.0`.

3. **Dead `Python-2.0` alias.** The alias `"Python-2.0": "PSF-2.0"` (line 194) is unreachable because `Python-2.0` is itself a valid SPDX ID — the `spdxIds.has(trimmed)` check on line 219 short-circuits before the alias lookup. The package `argparse@2.0.1` declares `Python-2.0` and appears in the distribution as `Python-2.0` (not `PSF-2.0`), which is technically correct but means the alias entry is dead code that implies a normalization that never happens.

4. **`Unknown` group in license distribution.** Packages with no license field (e.g. `map-stream@0.0.1`) produce `{ status: "unknown", spdxId: null }`, and the fallback `dep.license ?? "UNKNOWN"` on line 579 creates an `Unknown` entry in `licenseDistribution`. This group provides no useful information to visitors and clutter the chart.

## Decision

The `normalizeLicense` function in `open-source-page.ts` is fixed with four targeted changes:

1. Strip all parentheses from the license string before `OR`/`AND` parsing.
2. Add `"Apache2": "Apache-2.0"` to `LICENSE_ALIASES`.
3. Remove the dead `"Python-2.0": "PSF-2.0"` alias from `LICENSE_ALIASES`.
4. Exclude dependencies with `normalizedLicense.status === "unknown"` from the `licenseDistribution` array in `buildRegistryData`. These dependencies remain in the component table, SBOM, and THIRD_PARTY_NOTICES — the filter applies only to the distribution chart.

`summary.componentsTotal` continues to count all public dependencies (including those with unknown licenses). The `licenseDistribution` array is a subset of `componentsTotal` — its entries sum to less than or equal to `componentsTotal`, not necessarily equal. This is intentional: the distribution chart shows known license categories, while the summary count reflects the total number of bundled components.

## Architectural fit

- **Site OS operator model**: Extends the existing `open-source.generate` codegen command. No new command, no new pipeline stage.
- **RFC-0489 alignment**: The SPDX normalization contract from RFC-0489 is strengthened — the function now actually normalizes parenthesized expressions instead of falling through to `unknown`.
- **Scaling Playbook**: Applies uniformly across all sites — every site using `open-source.generate` benefits from the fix.

## Design

### CLI surface

No CLI change. The existing command is unchanged:

```sh
pnpm exec werkstatt run open-source.generate --site warpgogol-com
```

### TypeScript contracts

Four changes to `packages/werkstatt-site/src/codegen/open-source-page.ts`:

**Change 1: Strip parentheses before OR/AND parsing**

```ts
// In normalizeLicense, before the OR/AND parsing blocks:
const withoutParens = trimmed.replace(/[()]/g, "");

if (withoutParens.includes(" OR ")) {
  const parts = withoutParens.split(" OR ").map((p) => p.trim());
  // ... existing logic
}

if (withoutParens.includes(" AND ")) {
  const parts = withoutParens.split(" AND ").map((p) => p.trim());
  // ... existing logic
}
```

**Change 2: Add Apache2 alias**

```ts
const LICENSE_ALIASES: Record<string, string> = {
  // ... existing entries ...
  Apache2: "Apache-2.0",
};
```

**Change 3: Remove dead Python-2.0 alias**

```ts
// Remove this line from LICENSE_ALIASES:
//   "Python-2.0": "PSF-2.0",
// Python-2.0 is a valid SPDX ID and is correctly handled by the
// spdxIds.has(trimmed) check on line 219.
```

**Change 4: Exclude unknown licenses from distribution only**

```ts
// In buildRegistryData, when building licenseMap:
const licenseMap = new Map<string, number>();
for (const dep of publicDeps) {
  if (dep.normalizedLicense.status === "unknown") continue;
  const licenseKey = dep.normalizedLicense.spdxId ?? dep.license ?? "UNKNOWN";
  licenseMap.set(licenseKey, (licenseMap.get(licenseKey) ?? 0) + 1);
}
```

The `components` array, SBOM, and THIRD_PARTY_NOTICES are NOT filtered — they retain all public dependencies including those with unknown licenses.

**OR expression semantics**: The existing `OR` parser returns the first part that resolves to a valid SPDX ID (directly or via alias). For `(MIT OR CC0-1.0)`, it returns `MIT` (first valid). For `(Apache2 OR MIT)`, it returns `Apache-2.0` (first resolvable via alias). The parser does not prefer the most permissive license — it picks the first resolvable one. This matches the existing behavior for non-parenthesized `OR` expressions and is sufficient for the distribution chart, where the goal is to assign each package to a single license category.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/codegen/open-source-page.ts` | `normalizeLicense` and `buildRegistryData` updated |
| `src/content/data/<lang>/open-source-registry.json` | Regenerated output — `licenseDistribution` no longer contains `Unknown` or raw parenthesized strings |

### Output format

No change to the JSON schema. The `licenseDistribution` array simply no longer contains entries with `license: "Unknown"` or raw parenthesized strings. Example before:

```json
{
  "licenseDistribution": [
    { "license": "MIT", "count": 670 },
    { "license": "(MIT OR CC0-1.0)", "count": 2 },
    { "license": "Unknown", "count": 1 }
  ]
}
```

After:

```json
{
  "licenseDistribution": [
    { "license": "MIT", "count": 672 },
    { "license": "CC0-1.0", "count": 8 }
  ]
}
```

The `(MIT OR CC0-1.0)` packages now normalize to `MIT` (first valid SPDX ID in the OR expression), and the `Unknown` package is excluded from the distribution.

### Failure modes

- **No valid SPDX ID in OR expression**: If neither side of an `OR` expression resolves to a valid SPDX ID (even after alias lookup and parenthesis stripping), the function returns `{ status: "unknown", spdxId: null }` as before. The package is excluded from `licenseDistribution` but retained in `components`, SBOM, and notices.
- **AND expression with unknown parts**: If any part of an `AND` expression is not a valid SPDX ID, the whole expression remains `unknown`. Same behavior as today.
- **Empty license string**: Still returns `{ status: "unknown", spdxId: null }`. Excluded from distribution.

## Rollout

- **Default behavior**: All four fixes are enabled immediately. No opt-in flag.
- **Existing sites**: Regenerate the open-source page via `open-source.generate` on the next build cycle. The fingerprint cache will detect no change in inputs (package.json, lockfiles) — the generator must be force-regenerated by deleting `.cache/open-source.fingerprint` or by changing a tracked input file.
- **New sites**: Automatically produce correct license distributions from first generation.
- **Pipeline integration**: `open-source.generate` is already part of `build.prepare`. No pipeline change needed.
- **Deprecation path**: None — this is a bug fix, not a deprecation.

## Alternatives considered

- **Full SPDX expression parser**: Use a library like `spdx-expression-parse` to parse complex expressions. Rejected — the vast majority of npm license fields are single SPDX IDs or simple `OR`/`AND` expressions. Stripping parentheses and reusing the existing split-based parser is sufficient. Adding a dependency for edge cases that affect <1% of packages is over-engineering.

- **Filter Unknown from all artifacts**: Exclude packages with unknown licenses from the component table, SBOM, and THIRD_PARTY_NOTICES as well. Rejected — compliance requires listing all bundled dependencies, even those with unclear licensing. The `Unknown` group is only useless in the distribution chart; in the component table and SBOM it signals that the package needs manual license review.

- **Keep Python-2.0 alias and make it work**: Reorder the alias lookup before the SPDX ID check so `Python-2.0` normalizes to `PSF-2.0`. Rejected — `Python-2.0` and `PSF-2.0` are distinct SPDX licenses. Normalizing one to the other is semantically wrong. The alias was a mistake; removing it is the correct fix.

## Risks

- **Over-stripping parentheses in nested expressions**: `replace(/[()]/g, "")` removes all parentheses, including nested ones. An expression like `((MIT OR Apache-2.0) AND BSD-3-Clause)` becomes `MIT OR Apache-2.0 AND BSD-3-Clause`, which changes precedence semantics. Mitigation: such expressions are extremely rare in npm `license` fields. The SPDX spec recommends parenthesized expressions, but npm packages almost universally use flat `OR`/`AND` or single IDs. If a complex expression appears, the worst case is that it normalizes to the first valid ID in a flat split — which is still better than returning `unknown`.
- **False normalization of Apache2**: Adding `Apache2` as an alias for `Apache-2.0` is safe — `Apache2` is not a valid SPDX ID, so there is no collision. The alias only activates when the SPDX ID lookup fails first.
- **Agent misinterpretation**: Agents might think the Unknown filter applies to all outputs. The Design section explicitly states the filter is `licenseDistribution`-only. Implementation must not filter `components`, `sbomComponents`, or `buildThirdPartyNotices` inputs.

## Acceptance criteria

- [ ] `normalizeLicense` strips parentheses before `OR`/`AND` parsing — `(MIT OR CC0-1.0)` normalizes to `MIT` (first valid SPDX ID)
- [ ] `LICENSE_ALIASES` includes `"Apache2": "Apache-2.0"`
- [ ] `LICENSE_ALIASES` no longer contains `"Python-2.0": "PSF-2.0"`
- [ ] `buildRegistryData` excludes dependencies with `normalizedLicense.status === "unknown"` from `licenseDistribution` only
- [ ] Unit test: `(MIT OR CC0-1.0)` normalizes to a valid SPDX ID (not the raw string)
- [ ] Unit test: `(MIT OR Apache2)` normalizes to `MIT` (Apache2 alias resolves)
- [ ] Unit test: `(MIT AND Zlib)` normalizes to `MIT AND Zlib` (both valid SPDX IDs)
- [ ] Unit test: `Python-2.0` normalizes to `Python-2.0` (not `PSF-2.0`)
- [ ] Unit test: empty license string → `status: "unknown"`, excluded from `licenseDistribution`
- [ ] Unit test: `licenseDistribution` does not contain an entry with `license: "Unknown"`
- [ ] Component table, SBOM, and THIRD_PARTY_NOTICES still include packages with unknown licenses
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The Unknown-license filter in `buildRegistryData` applies to `licenseDistribution` ONLY. Agents MUST NOT filter the `components` array, `sbomComponents`, or `buildThirdPartyNotices`/`buildThirdPartyLicenses` inputs.
- After implementation, force-regenerate the open-source page by deleting `.cache/open-source.fingerprint` in the site's app directory, then running `open-source.generate`.
