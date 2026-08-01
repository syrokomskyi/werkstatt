---
id: RFC-0632
title: "Auto-wrap maskable icons with Android safe-zone when no explicit maskable source"
status: accepted
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
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0631
amendedBy: []
related:
  - DNA-4
  - RFC-0309
  - RFC-0631
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
  - "Maskable PNG icons are auto-wrapped with 80% safe-zone from favicon.svg when no explicit maskable source exists"
  - "ICON-SRC-04 warning fires when maskable auto-wrap is applied"
  - "favicon-maskable.svg is no longer read — auto-wrap always applies to favicon.svg"
nonGoals:
  - "Supporting site-authored maskable SVG sources (favicon-maskable.svg is removed by this RFC)"
  - "Changing the buildIconSvg fallback design (first-letter + biome palette)"
  - "Changing the regular (non-maskable) icon generation pipeline"
  - "Generalizing the safe-zone pattern to other generated artifacts"
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

# RFC-0632: Auto-wrap maskable icons with Android safe-zone when no explicit maskable source

## Context

RFC-0631 introduced site-authored favicon SVG sources (`src/content/favicon.svg`) with a `buildIconSvg` fallback. The `resolveIconSvg` helper resolves the maskable variant by checking for `src/content/favicon-maskable.svg`, then falling back to the regular `src/content/favicon.svg` as-is — a verbatim copy with no safe-zone transformation.

Android adaptive icons require maskable icons to keep all visible content within the central 80% of the canvas (the "safe zone"). The outer 10% per side is a "danger zone" that Android masks into circles, rounded squares, squircles, or other shapes. When a site's `favicon.svg` has visual elements near the edges (e.g., warpgogol-com's `logo-2.svg` has brand dots at 34px from the edge of a 400px canvas), the current maskable PNGs are identical to regular PNGs — Android cuts off those edge elements.

## Problem

RFC-0631's `resolveIconSvg` at `packages/os/site-kernel-checks/src/public-surface/icons.ts:173-177` returns the regular `favicon.svg` content verbatim for maskable variants when no `favicon-maskable.svg` exists. This produces maskable PNGs that are pixel-identical to regular PNGs — no safe-zone padding, no background fill extension. Android's adaptive icon system clips edge elements, producing visually broken icons.

The optional `favicon-maskable.svg` escape hatch (RFC-0631) is unused in practice — no site has created one. The mechanism adds contractual surface area without value: two source files, two validation paths, ICON-SRC-03 diagnostic. A single auto-wrap transformation from the regular source is simpler and produces correct Android icons by default.

## Decision

The `public.icons.generate` command auto-wraps the regular `src/content/favicon.svg` content into an Android-compliant maskable SVG by applying a `translate(51.2, 51.2) scale(0.8)` transform (80% safe zone) and a full-canvas background `<rect>`. The optional `src/content/favicon-maskable.svg` source file is removed — auto-wrap always applies. A new `wrapMaskableSvg` helper performs the SVG-level transformation. The `public.icons.validate` command reports `ICON-SRC-04` (warning) when auto-wrap is applied, prompting operators to verify safe-zone compliance visually.

## Architectural fit

- **DNA-4 (Canonical content in `src/content/`)** — the favicon SVG source remains in `src/content/favicon.svg`. The maskable variant is derived automatically, not authored separately.
- **RFC-0631 (site-authored favicon SVG source)** — this RFC amends RFC-0631: removes `favicon-maskable.svg`, changes the maskable fallback from verbatim copy to auto-wrap transformation.
- **RFC-0309 (icon generation suite)** — extends the existing generator with a safe-zone transformation; does not add new commands.
- **Site composition principle (AGENTS.md)** — sites provide one SVG source (`favicon.svg`); the generator handles Android compliance automatically. No per-site maskable expertise required.
- **Scaling Playbook** — applies uniformly: all sites with a custom favicon get correct maskable icons without additional configuration.

## Design

### CLI surface

No new commands. Existing commands change behavior:

```sh
# Generation: auto-wraps favicon.svg for maskable variants
pnpm exec site-kernel run public.icons.generate --site warpgogol-com

# Validation: reports ICON-SRC-04 when auto-wrap is applied
pnpm exec site-kernel run public.icons.validate --site warpgogol-com
```

No new flags. The auto-wrap is unconditional when `favicon.svg` exists — there is no opt-out.

### TypeScript contracts

```ts
/**
 * Wraps a regular favicon SVG into an Android-compliant maskable SVG.
 *
 * Extracts the inner content of the source <svg>, removes the original
 * background <rect> (identified as the first <rect> with width="512"
 * height="512" or width="100%" height="100%"), wraps the remaining
 * elements (including <defs> blocks) in a <g> with
 * translate(51.2, 51.2) scale(0.8) (80% safe zone, centered), and
 * prepends a full-canvas <rect> with the extracted background fill
 * (or #ffffff if no background rect is found).
 *
 * @param svg - The source SVG string (must have viewBox="0 0 512 512")
 * @returns A new SVG string with safe-zone transform applied
 */
export function wrapMaskableSvg(svg: string): string;

/**
 * Resolves the favicon SVG source for a site.
 * For maskable=true, applies wrapMaskableSvg to the regular source.
 * Falls back to buildIconSvg when no source SVG exists.
 */
async function resolveIconSvg(
  app: AppPublicContext,
  context: KernelRuntimeContext,
  maskable: boolean,
): Promise<string>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/content/favicon.svg` | Site-authored favicon source (read by generator, validated by validator) |
| `src/content/favicon-maskable.svg` | **Removed** — no longer read by generator or validator |
| `public/favicon.svg` | Generated output (regular variant, overwritten by generator) |
| `public/icon-maskable-192.png` | Generated output (maskable variant, auto-wrapped from favicon.svg) |
| `public/icon-maskable-512.png` | Generated output (maskable variant, auto-wrapped from favicon.svg) |
| `packages/os/site-kernel-checks/src/public-surface/icons.ts` | Generator and validator implementation (wrapMaskableSvg, resolveIconSvg) |

### Output format

`public.icons.generate` output is unchanged (writes 8 icon artifacts). The maskable PNGs are now auto-wrapped from the regular source.

`public.icons.validate` gains one new diagnostic:

```json
{
  "command": "public.icons.validate",
  "status": "pass",
  "diagnostics": [
    {
      "ruleId": "ICON-SRC-04",
      "severity": "warning",
      "file": "src/content/favicon.svg",
      "message": "Maskable icons were auto-wrapped with 80% safe-zone transform. Verify visually on Android.",
      "fixHint": "If edge elements are still clipped, provide a favicon.svg with more internal padding or create a dedicated maskable design via a new RFC."
    }
  ]
}
```

Diagnostic rules after this RFC:

- `ICON-SRC-01` — source SVG viewBox is not `0 0 512 512` (error) — unchanged
- `ICON-SRC-02` — source SVG is not valid XML (error) — unchanged
- `ICON-SRC-03` — **removed** (was: maskable source SVG viewBox check; `favicon-maskable.svg` no longer exists)
- `ICON-SRC-04` — maskable auto-wrap applied (warning) — **new**

### Failure modes

- **Source SVG missing** — generator falls back to `buildIconSvg` for both regular and maskable variants. `buildIconSvg(app, true)` already has maskable-aware padding. No auto-wrap, no ICON-SRC-04.
- **Source SVG invalid XML** — generator falls back to `buildIconSvg`, validator reports ICON-SRC-02 (error). No auto-wrap.
- **Source SVG wrong viewBox** — validator reports ICON-SRC-01 (error). Generator may still attempt auto-wrap, but the transform assumes 512×512 coordinates; the result may be visually incorrect. Fix ICON-SRC-01 first.
- **Auto-wrap fails to extract background** — `wrapMaskableSvg` identifies the background rect as the first `<rect>` with `width="512" height="512"` (or `width="100%" height="100%"`). If no such rect is found, the maskable background defaults to `#ffffff`. ICON-SRC-04 still fires as a warning. If the background rect uses a gradient/pattern fill (`fill="url(#...)"`), the URL reference is preserved in the new background rect — `<defs>` blocks are included in the wrapped content, so gradient/pattern references remain intact.
- **Auto-wrap fails to parse inner content** — if the SVG has no recognizable inner elements (e.g., only a `<defs>` block with no visible shapes), `wrapMaskableSvg` returns the original SVG as-is. ICON-SRC-04 fires, prompting visual verification.
- **Sharp conversion failure** — if `sharp` throws during PNG/ICO conversion, the generator catches the error and falls back to `buildIconSvg` for both variants (unchanged from RFC-0631).
- **`favicon-maskable.svg` still present on disk** — the generator and validator ignore it. No error, no warning. The file is inert. Operators may delete it at their convenience.

## Rollout

- **Default behavior**: auto-wrap is unconditional for all sites with `src/content/favicon.svg`. No opt-in, no flag, no grace period.
- **Existing apps with favicon.svg**: maskable PNGs change on next `public.icons.generate` run — they now have safe-zone padding. This is a visual improvement, not a regression.
- **Existing apps with favicon-maskable.svg**: the file is ignored. Maskable PNGs are auto-wrapped from `favicon.svg` instead. Operators may delete `favicon-maskable.svg` at their convenience — it has no effect.
- **Sites without favicon.svg**: unaffected. `buildIconSvg` fallback already has maskable-aware padding via `inset` and `fontSize` parameters.
- **New apps**: automatically get correct maskable icons when they add `src/content/favicon.svg`.
- **Pipeline integration**: `public.icons.validate` is part of `build.check`; ICON-SRC-04 (warning) surfaces there. It does not fail the build.
- **Documentation update**: `docs/authoring/site-composition.md` should be updated to remove the `favicon-maskable.svg` mention and document the auto-wrap behavior.
- **AGENTS.md update**: `packages/os/site-kernel-checks/AGENTS.md` should mention `wrapMaskableSvg` in the icon generation rules section.

## Alternatives considered

- **Keep `favicon-maskable.svg` as optional escape hatch** — rejected. No site has used it since RFC-0631. It adds contractual surface area (extra file, extra validation, ICON-SRC-03) without value. Auto-wrap from `favicon.svg` is simpler and correct for the common case. If a site needs a completely different maskable design in the future, a new RFC can reintroduce the escape hatch.
- **Bitmap-level safe-zone via sharp composite** — rejected. SVG-level transform preserves vector quality, is deterministic, and produces a readable `public/favicon.svg` (for maskable). Bitmap composite would require rasterizing twice and compositing — more complex, less deterministic, and no readable intermediate SVG.
- **85% safe zone (conservative)** — rejected. Google's standard is 80%. While 85% is safer for unusual masks (droplet, diamond), 80% is the industry baseline and produces larger visible content. Operators who need more padding can adjust their `favicon.svg` source.
- **75% safe zone (aggressive)** — rejected. Too aggressive — risks clipping on standard circle and squircle masks.
- **No ICON-SRC-04 diagnostic** — rejected. The warning prompts operators to visually verify maskable icons, which is important since auto-wrap is a heuristic — edge elements may still be too close to the 80% boundary for some designs.

## Risks

- **Auto-wrap heuristic failure**: `wrapMaskableSvg` uses regex-based SVG parsing (not a full XML parser, per the DOMParser rule in AGENTS.md). Complex SVGs with namespaces, comments, or CDATA may not parse correctly. Mitigated by the fallback to `#ffffff` background and the ICON-SRC-04 warning prompting visual verification.
- **80% safe zone insufficient for some designs**: a `favicon.svg` with elements at the exact 80% boundary may still be clipped by aggressive masks (droplet, diamond). Mitigated by ICON-SRC-04 warning and the operator's ability to adjust the source SVG.
- **Background color extraction failure**: if the source SVG has no recognizable full-canvas `<rect>`, the maskable background defaults to `#ffffff`, which may not match the site's biome palette. Mitigated by ICON-SRC-04 warning.
- **Agent confusion**: agents may create `favicon-maskable.svg` expecting it to be used. Mitigated by documentation update and the file being silently ignored (no error, but no effect).
- **Maintenance burden**: low — one new helper function (`wrapMaskableSvg`) and one diagnostic. The `resolveIconSvg` function is simplified (no maskable source check).
- **False positive rate**: ICON-SRC-04 fires whenever `favicon.svg` exists and auto-wrap is applied. This is by design — it is a reminder, not an error. It does not fail the build.

## Acceptance criteria

- [x] `wrapMaskableSvg` helper extracts inner content from source SVG, applies `translate(51.2, 51.2) scale(0.8)` transform, and prepends full-canvas background `<rect>` with extracted color (or `#ffffff` fallback) (evidence: `packages/os/site-kernel-checks/src/public-surface/icons.ts:168-194`, `src/tests/icons-source-svg.test.ts:182-242`)
- [x] `resolveIconSvg` with `maskable=true` applies `wrapMaskableSvg` to the regular `favicon.svg` source — no longer reads `favicon-maskable.svg` (evidence: `packages/os/site-kernel-checks/src/public-surface/icons.ts:196-207`, `src/tests/icons-source-svg.test.ts:118-141`)
- [x] `public.icons.validate` reports `ICON-SRC-04` (warning) when maskable auto-wrap is applied (evidence: `packages/os/site-kernel-checks/src/public-surface/icons.ts:394-407`, `src/tests/icons-source-svg.test.ts:244-271`)
- [x] `ICON-SRC-03` diagnostic is removed — `favicon-maskable.svg` is no longer read or validated (evidence: `packages/os/site-kernel-checks/src/public-surface/icons.ts:386-407` — validateSourceSvg call for favicon-maskable.svg removed, ICON-SRC-03 no longer referenced)
- [x] Generated maskable PNGs differ from regular PNGs (safe-zone padding visible) when `favicon.svg` has edge elements (evidence: `wrapMaskableSvg` applies `translate(51.2, 51.2) scale(0.8)` transform at `icons.ts:193`, producing visually distinct maskable PNGs via `buildIconWrites` at `icons.ts:209-224`)
- [x] Sites without `src/content/favicon.svg` are unaffected — `buildIconSvg` fallback produces identical output to pre-RFC behavior (evidence: `packages/os/site-kernel-checks/src/public-surface/icons.ts:201-206`, `src/tests/icons-source-svg.test.ts:110-116`)
- [x] `docs/authoring/site-composition.md` updated to remove `favicon-maskable.svg` mention and document auto-wrap (evidence: `docs/authoring/site-composition.md:455-459`)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0632 --json` → status: pass, 0 warnings)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT use `DOMParser` or other browser-only APIs in `wrapMaskableSvg` — use regex-based SVG parsing per the AGENTS.md rule on browser-only APIs.
- Agents MUST NOT create `src/content/favicon-maskable.svg` — it is no longer read by the generator or validator. The auto-wrap from `favicon.svg` is the only maskable path.
- Agents MUST NOT remove the `buildIconSvg` fallback — it is still the zero-config default for sites without `favicon.svg`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
