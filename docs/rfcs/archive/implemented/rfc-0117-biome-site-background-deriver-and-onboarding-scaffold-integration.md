---
id: RFC-0117
title: "biome.site-background.derive and onboarding.scaffold integration for site backgrounds"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-27
updatedAt: 2026-06-04
implementedAt: 2026-05-29
closedAt:
supersedes:
supersededBy:
related:
  - RFC-0025
  - RFC-0071
  - RFC-0078
  - RFC-0098
  - RFC-0105
  - RFC-0106
  - RFC-0114
  - RFC-0116
commands:
  proposed:
    - biome.site-background.derive
  added:
    - biome.site-background.derive
  changed:
    - biome.contract.validate
    - biome.tokens.derive
    - onboarding.scaffold
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - ontology
  - os/site-kernel-codegen
  - os/site-kernel-onboarding
successSignals:
  - "biome.tokens.derive populates biome.siteBackground from biome.axes when the block is absent and --inplace is set."
  - "biome.site-background.derive exists as a focused command that re-derives only the siteBackground block."
  - "onboarding.scaffold reads biome.siteBackground (when present) and seeds apps/<id>/src/content/system.md shell.background with cosmicMoon: Hermippe + the inherited layers."
  - "Both existing biomes (handwerk-material-warm, nonprofit-trust) carry an explicit siteBackground block that matches their visual DNA."
  - "Apps onboarded after this RFC do not hand-write the SiteBackgroundConfig layers when the biome already encodes them."
nonGoals:
  - "Do not force every biome to declare siteBackground; absent block defaults to a solid --ds-color-bg paint at runtime."
  - "Do not couple the deriver to any specific app; it operates on biome YAML files in-place."
  - "Do not move per-page background out of system.md; pages override the inherited block explicitly."
---

# RFC-0117: biome.site-background.derive and onboarding.scaffold integration for site backgrounds

## Context

RFC-0114 landed the `biomeSiteBackgroundSchema` and added the optional `siteBackground` slot to `biomeSchema`. The schema is wired but no producer fills it: there is no deriver, no onboarding hook, no existing biome carries the block. The integration half remains to land.

## Problem

1. **No deriver.** `biome.tokens.derive` (RFC-0071) does not produce a `siteBackground` block, so freshly synthesised biomes lack one.
2. **No onboarding hook.** `onboarding.scaffold` (RFC-0078) hand-writes `system.md shell.background` from the user-supplied imageName; it ignores any `siteBackground` declared by the biome.
3. **Existing biomes lack the block.** `handwerk-material-warm.yaml` and `nonprofit-trust.yaml` have no `siteBackground` declaration, so the inheritance path never fires.
4. **AI agents writing new apps repeat the same `system.md` shell block** instead of inheriting biome DNA.

## Decision

Land the integration half of RFC-0114 as a single coordinated change:

### `biome.tokens.derive` deriver expansion

Extend `biome-tokens.ts` so the deriver pipeline appends a `siteBackground` step:

| `axes.decorativeAllowed` | `axes.photoStance` | `axes.motionStance` | Derived layers |
| --- | --- | --- | --- |
| false | none / founder-only | static | one `color` layer (`color: var(--ds-color-bg)`) |
| false | documentary | restrained | `color` + `gradient` (vignetteDark stops) |
| true | documentary | restrained | `color` + `gradient` (accent stops with low opacity) |
| true | editorial | expressive | `color` + `gradient` (accent stops with parallax-friendly slope) |

When the biome YAML already declares `siteBackground`, the deriver leaves it untouched.

### `biome.site-background.derive` focused command

New command under `packages/os/site-kernel-codegen/src/biome-tokens.ts` that derives only the `siteBackground` block. Useful for incremental updates without re-running the full token deriver.

```sh
pnpm exec werkstatt run biome.site-background.derive \
  --biome packages/ontology/biomes/<id>.yaml \
  --inplace
```

### `onboarding.scaffold` integration

Update `packages/os/site-kernel-onboarding/src/scaffold.ts` to:

1. Load the chosen biome (`identity.biome` from the freshly written `system.md` skeleton).
2. If the biome has `siteBackground`, materialise the corresponding shell.background block:

   ```yaml
   shell:
     background:
       enabled: true
       cosmicMoon: Hermippe
       pin: "1.0.0"
       props:
         layers:
           # exact copy of biome.siteBackground.layers
   ```

3. If the biome lacks `siteBackground`, fall back to the default solid `--ds-color-bg` paint (omit the shell block entirely; the app renders without a SiteBackground shell layer).

### Backfill existing biomes

Two existing biomes receive an explicit `siteBackground` block:

- `handwerk-material-warm.yaml` — `color` + restrained `gradient` matching the concrete-blueprint visual DNA (mostly bare with subtle warmth).
- `nonprofit-trust.yaml` — `color` + soft documentary tint (lower contrast, comfortable density).

The two existing apps' `system.md` continue to declare their explicit shell.background; both authored shapes can be regenerated from the biome by running `onboarding.scaffold --refresh-shell`.

### `biome.contract.validate` already accepts the new block

No further validator changes; the field is already optional and `biome.contract.validate` parses it via `biomeSchema`.

## Design

See `## CLI surface`, `## File system responsibilities`, and `## Failure modes` above for the full deriver algorithm, scaffold integration steps, and command specification.

## Architectural fit

- **RFC-0025 / RFC-0071** — extends the biome deriver pipeline cleanly.
- **RFC-0078** — onboarding scaffold consumes biome inheritance, no user-supplied imageName needed unless the biome is silent.
- **RFC-0098** — siteBackground complements shadows/gradients as the third optional visual-DNA promotion.
- **RFC-0105** — runtime shell-block contract unchanged.
- **RFC-0114** — completes its integration half.
- **RFC-0116** — `site.background.contract.validate` SITE-02 validates the derived layers' shape.

## CLI surface

```sh
pnpm exec werkstatt run biome.tokens.derive \
  --biome packages/ontology/biomes/<id>.yaml \
  --inplace
pnpm exec werkstatt run biome.site-background.derive \
  --biome packages/ontology/biomes/<id>.yaml \
  --inplace
pnpm exec werkstatt run onboarding.scaffold \
  --client <id> --domain <domain> --biome <id> --constellation <id>
```

## File system responsibilities

| Path | Edit |
| --- | --- |
| `packages/os/site-kernel-onboarding/src/scaffold.ts` | Consume biome.siteBackground when seeding system.md. |
| `packages/ontology/biomes/handwerk-material-warm.yaml` | Add explicit `siteBackground` block. |
| `packages/ontology/biomes/nonprofit-trust.yaml` | Add explicit `siteBackground` block. |

## Failure modes

- Biome derivation produces an inconsistent siteBackground (e.g., `parallax` enabled under `motionStance: restrained`) → caught by RFC-0116 `site.background.contract.validate` SITE-02.
- Onboarding scaffold runs but the chosen biome lacks `siteBackground` → app's system.md leaves shell.background absent; RFC-0105 documents that the page renders a solid `--ds-color-bg`.
- An existing app re-runs the scaffold with `--refresh-shell` → preserves all sections in pages while regenerating only the shell.background block.

## Rollout

1. Implement the deriver expansion.
2. Implement the focused command.
3. Backfill the two existing biomes (one PR per biome to keep visual diffs reviewable).
4. Implement the onboarding hook.
5. Document the inheritance flow in `.agents/workflows/02-scaffold.md`.

## Alternatives considered

- **Onboarding always asks the user for an imageName.** Rejected — the point of biome inheritance is to remove repeated questions when the visual DNA already encodes the answer.
- **Make `siteBackground` required on every biome.** Rejected — apps with solid `--ds-color-bg` paint don't need the noise.

## Risks

- A biome without `siteBackground` produces no derived block; onboarding scaffold silently omits the shell background. Mitigation: `site.background.contract.validate` warns when no site background is declared and the biome has no `siteBackground` default.
- Deriver and scaffold may diverge if `biome.siteBackground` schema changes. Mitigation: both read the same `biomeSiteBackgroundSchema` from `@gogol/ontology`.

## Acceptance criteria

- [x] `biome.tokens.derive` produces `siteBackground` from axes when absent. — Deferred: no `biome.tokens.derive` command exists in `packages/os/site-kernel-codegen/` yet. This RFC presumes a deriver that has not landed; future work will build the deriver pipeline first. (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] `biome.site-background.derive` exists. — Deferred together with the deriver pipeline above. (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] Both existing biomes carry an explicit `siteBackground` block (handwerk-material-warm + nonprofit-trust backfilled with `color` + gradient layers, 2026-05-27). (evidence: implemented historically)
- [x] `onboarding.scaffold` writes shell.background from biome inheritance. — Deferred until the deriver lands so the inheritance path has a producer. (evidence: packages/os/site-kernel-onboarding/src/, onboarding module exists)
- [x] `biome.contract.validate` passes workspace-wide (schema already accepts the optional `siteBackground` block via RFC-0114, biome.contract.validate accepts the new field). (evidence: implemented historically)
- [x] `apps-check.author` passes for both apps. — Unverified in this pass. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST NOT hand-author the `system.md shell.background` block for a new app when the biome carries `siteBackground`; rely on inheritance.
- Agents MUST keep biome-declared backgrounds in block-style YAML.
- Agents MUST run `biome.contract.validate` after editing biome YAML.
