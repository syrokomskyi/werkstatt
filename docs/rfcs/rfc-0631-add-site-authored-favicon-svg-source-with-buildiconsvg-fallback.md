---
id: RFC-0631
title: "Add site-authored favicon SVG source with buildIconSvg fallback"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-01
updatedAt: 2026-08-01
enhancedAt: 2026-08-01
implementedAt: 2026-08-01
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-4
  - RFC-0309
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-4
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
    - public.icons.generate
    - public.icons.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - site-kernel-checks
successSignals:
  - "public.icons.generate uses src/content/favicon.svg when present, buildIconSvg fallback otherwise"
  - "public.icons.validate reports ICON-SRC-01 when source SVG has wrong viewBox"
nonGoals:
  - "Generalizing the site-authored-source pattern to og-image, preview images, or other generated artifacts"
  - "Changing the buildIconSvg fallback design (first-letter + biome palette)"
  - "Adding a maskable-specific source file requirement (maskable source is optional)"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0631: Add site-authored favicon SVG source with buildIconSvg fallback

## Context

The `public.icons.generate` command (RFC-0309) generates all favicon artifacts (SVG, ICO, PNG, maskable PNGs, webmanifest) for every site. The base SVG is produced by `buildIconSvg` in `packages/os/site-kernel-checks/src/public-surface/icons.ts`, which programmatically draws a first-letter design using the site's biome palette colors.

The favicon is site-specific visual identity — it belongs in the content layer (DNA-4: "All user-visible copy, configuration, and metadata live in `src/content/`"). However, the current architecture hardcodes the favicon design in a shared package. A site that needs a custom logo (e.g., warpgogol-com's network-grid logo) has no way to provide its own SVG source — `buildIconSvg` always overwrites `public/favicon.svg` on every regeneration.

## Problem

DNA-4 states that all user-visible configuration and metadata live in `src/content/`. The favicon is user-visible visual identity, but its design is hardcoded in `packages/os/site-kernel-checks/src/public-surface/icons.ts:75` — a shared package. There is no mechanism for a site to provide its own favicon SVG source. Every `public.icons.generate` run overwrites `public/favicon.svg` with the `buildIconSvg` output, destroying any hand-authored custom design.

This violates the site composition principle (AGENTS.md: "A site's job is composition only: `src/content/system.md` + `src/content/**` + a few thin proxy files"). The favicon design should be site-authored content, not shared-package logic.

## Decision

The `public.icons.generate` command checks for a site-authored SVG source at `src/content/favicon.svg` (and optionally `src/content/favicon-maskable.svg`). If present, the authored SVG is used as the base for all icon artifact generation. If absent, `buildIconSvg` remains the fallback. The `public.icons.validate` command validates the source SVG (when present) for correct SVG structure and `viewBox="0 0 512 512"`.

## Architectural fit

- **DNA-4 (Canonical content in `src/content/`)** — the favicon SVG source moves from a shared package into `src/content/`, aligning visual identity with the content layer.
- **Site composition principle (AGENTS.md)** — sites compose from content; the favicon design becomes site-authored content rather than shared-package logic.
- **RFC-0309 (icon generation suite)** — extends the existing generator with a source-override mechanism; does not replace or deprecate the command.
- **`buildIconSvg` fallback** — preserves the zero-config default for new sites that don't need a custom logo.
- **Scaling Playbook** — applies uniformly across all sites: sites without a custom SVG are unaffected; sites with one opt in by placing a file.

## Design

### CLI surface

No new commands. Existing commands change behavior:

```sh
# Generation: reads src/content/favicon.svg if present, falls back to buildIconSvg
pnpm exec site-kernel run public.icons.generate --site warpgogol-com

# Validation: validates source SVG (when present) + existing artifact checks
pnpm exec site-kernel run public.icons.validate --site warpgogol-com
```

No new flags. The source-override is file-presence-based, not flag-based.

### TypeScript contracts

```ts
// New helper in icons.ts

/**
 * Resolves the favicon SVG source for a site.
 * Checks src/content/favicon.svg first; falls back to buildIconSvg.
 */
async function resolveIconSvg(
  app: AppPublicContext,
  context: KernelRuntimeContext,
  maskable: boolean,
): Promise<string>;

/**
 * Validates a site-authored source SVG.
 * Returns diagnostics for invalid XML or wrong viewBox.
 */
async function validateSourceSvg(
  svgContent: string,
  filePath: string,
): Promise<Array<{ severity: "error" | "warning"; message: string; file: string }>>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/content/favicon.svg` | Site-authored favicon source (read by generator, validated by validator) |
| `src/content/favicon-maskable.svg` | Optional site-authored maskable favicon source |
| `public/favicon.svg` | Generated output (overwritten by generator) |
| `public/favicon.ico` | Generated output (overwritten by generator) |
| `public/icon-*.png` | Generated output (overwritten by generator) |
| `public/manifest.webmanifest` | Generated output (overwritten by generator) |
| `packages/os/site-kernel-checks/src/public-surface/icons.ts` | Generator and validator implementation |

### Output format

`public.icons.generate` output is unchanged (writes 8 icon artifacts).

`public.icons.validate` gains new diagnostics when a source SVG is present:

```json
{
  "command": "public.icons.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "ICON-SRC-01",
      "severity": "error",
      "file": "src/content/favicon.svg",
      "message": "Source SVG must have viewBox=\"0 0 512 512\", got \"0 0 100 100\".",
      "fixHint": "Set viewBox to \"0 0 512 512\" and scale all elements accordingly."
    }
  ]
}
```

Diagnostic rules:

- `ICON-SRC-01` — source SVG viewBox is not `0 0 512 512` (error)
- `ICON-SRC-02` — source SVG is not valid XML (error)
- `ICON-SRC-03` — maskable source SVG viewBox is not `0 0 512 512` (error)

### Failure modes

- **Source SVG missing** — generator falls back to `buildIconSvg` silently (no warning). This is the default for sites without a custom logo.
- **Source SVG invalid XML** — generator falls back to `buildIconSvg` and validator reports `ICON-SRC-02` (error). Generation does not fail; the fallback ensures the site always has valid icons.
- **Source SVG wrong viewBox** — generator uses the source as-is (sharp may handle non-512 viewBoxes by scaling), but validator reports `ICON-SRC-01` (error). The error must be fixed for visual correctness.
- **Sharp conversion failure** — if `sharp` throws during PNG/ICO conversion of a source SVG that is valid XML but not a valid SVG document (e.g., root element is not `<svg>`, or SVG references unsupported features), the generator catches the error and falls back to `buildIconSvg`. The validator does not report a separate diagnostic for this case — the fallback ensures the site always has valid icons. The operator should fix the source SVG and re-run `public.icons.generate`.
- **Maskable source missing** — generator uses the regular source SVG for maskable variants. No diagnostic.
- **Both sources missing** — `buildIconSvg` generates both regular and maskable variants as before.

## Rollout

- **Default behavior**: opt-in via file presence. Sites without `src/content/favicon.svg` are unaffected — `buildIconSvg` fallback produces identical output to pre-RFC behavior.
- **Existing apps**: no migration required. Sites that want a custom favicon place `src/content/favicon.svg` and re-run `public.icons.generate`.
- **New apps**: automatically get the `buildIconSvg` fallback. They can opt in to a custom favicon by adding the source file.
- **No flag day**: the change is backward-compatible. No existing generated artifact changes unless a site adds a source SVG.
- **Pipeline integration**: `public.icons.validate` is already part of `build.check`; the new diagnostics (`ICON-SRC-*`) will surface there for sites with source SVGs.
- **Documentation update**: `docs/authoring/site-composition.md` should be updated to mention `src/content/favicon.svg` and `src/content/favicon-maskable.svg` as site-authored content files, so agents discover the override mechanism without reading this RFC.

## Alternatives considered

- **Site provides favicon.svg directly in public/** — rejected because `public.icons.generate` overwrites `public/favicon.svg` on every run. The source must live outside `public/` to avoid being overwritten.
- **Flag-based override (`--source-svg <path>`)** — rejected because file-presence-based detection is simpler, requires no flag management, and follows the convention of other content-driven overrides in the kernel.
- **Generalize to all generated artifacts (og-image, preview)** — rejected as premature. Each generator has different requirements (HTML rendering, screenshots). The pattern can be extracted to a separate RFC if it proves useful.
- **Remove `buildIconSvg` entirely, require all sites to provide SVG** — rejected because it breaks the zero-config default for new sites and adds onboarding friction.

## Risks

- **Agent confusion**: agents may edit `public/favicon.svg` directly instead of `src/content/favicon.svg`. Mitigated by the generated-file marker in `public/favicon.svg` and the validator's `fixHint` pointing to `src/content/favicon.svg`.
- **Invalid SVG breaking generation**: if the source SVG is malformed, `sharp` may fail during PNG conversion. Mitigated by the fallback to `buildIconSvg` when the source is invalid XML (ICON-SRC-02).
- **ViewBox mismatch**: a source SVG with a non-512 viewBox may render incorrectly in PNG/ICO. Mitigated by ICON-SRC-01 validation.
- **Maintenance burden**: low — one new helper function (`resolveIconSvg`) and one validator addition. The `buildIconSvg` fallback is unchanged.
- **False positive rate**: ICON-SRC-01 only fires when a source SVG exists and has the wrong viewBox. No false positives for sites without a source SVG.

## Acceptance criteria

- [x] `resolveIconSvg` helper reads `src/content/favicon.svg` when present, falls back to `buildIconSvg` otherwise (evidence: `packages/os/site-kernel-checks/src/public-surface/icons.ts:154`, `src/tests/icons-source-svg.test.ts:62`)
- [x] `resolveIconSvg` reads `src/content/favicon-maskable.svg` for maskable variant when present, falls back to regular source SVG (evidence: `packages/os/site-kernel-checks/src/public-surface/icons.ts:154-174`, `src/tests/icons-source-svg.test.ts:80`)
- [x] `public.icons.validate` reports `ICON-SRC-01` when source SVG has wrong viewBox (evidence: `packages/os/site-kernel-checks/src/public-surface/icons.ts:356-361`, `src/tests/icons-source-svg.test.ts:97`)
- [x] `public.icons.validate` reports `ICON-SRC-02` when source SVG is invalid XML (evidence: `packages/os/site-kernel-checks/src/public-surface/icons.ts:386-413`, `src/tests/icons-source-svg.test.ts:108`)
- [x] `public.icons.validate` reports `ICON-SRC-03` when maskable source SVG has wrong viewBox (evidence: `packages/os/site-kernel-checks/src/public-surface/icons.ts:363-368`, `src/tests/icons-source-svg.test.ts:119`)
- [x] Generator falls back to `buildIconSvg` when `sharp` throws during PNG/ICO conversion of a valid-XML source SVG (evidence: `packages/os/site-kernel-checks/src/public-surface/icons.ts:201-207`, `src/tests/icons-source-svg.test.ts:135`)
- [x] Sites without `src/content/favicon.svg` are unaffected — `buildIconSvg` fallback produces identical output to pre-RFC behavior (evidence: `packages/os/site-kernel-checks/src/public-surface/icons.ts:169-173`, `src/tests/icons-source-svg.test.ts:71`)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0631 --json` → status: pass, violations: [])

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT edit `public/favicon.svg` directly — it is a generated file. The source is `src/content/favicon.svg`.
- Agents MUST NOT modify `buildIconSvg` to produce site-specific designs — it is the shared fallback only. Site-specific design belongs in `src/content/favicon.svg`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
