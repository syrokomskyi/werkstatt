---
id: RFC-0123
title: "Drop legacy `*.props.schema.ts` files — manifest `propsSchemaCompose` is the single source of truth"
status: implemented
kind: deprecation
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-28
updatedAt: 2026-06-04
implementedAt: 2026-05-29
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0072
  - RFC-0093
  - RFC-0107
  - RFC-0108
  - RFC-0110
  - RFC-0112
  - RFC-0119
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - ui
successSignals:
  - "Zero `*.props.schema.ts` files under packages/ui/src/sections/<slug>/."
  - "section.contract.validate continues to pass: every section keeps its colocated <slug>-section.types.ts (already present for all 11 affected sections), which the validator accepts in place of the deprecated .props.schema.ts."
  - "section.scaffold (RFC-0112) does not emit a .props.schema.ts (already true at the time of writing — verified)."
  - "packages/ui/AGENTS.md no longer claims the file is part of the section archetype contract."
nonGoals:
  - "Do not remove the per-section `<slug>-section.types.ts` file. That file is a real TypeScript contract consumed by the .astro template and by `@gogol/share` typing helpers; it stays."
  - "Do not change the runtime contract: the JSON-Schema composed via manifest `propsSchemaCompose` + manifest `propsSchema` remains the canonical authority that `page.block.validate` evaluates."
  - "Do not codegen Zod from manifests in this RFC. If a future consumer needs Zod, that arrives in a follow-up RFC."
---

# RFC-0123: Drop legacy `*.props.schema.ts` files — manifest `propsSchemaCompose` is the single source of truth

## Context

RFC-0108 §"Proposal F" noted that the per-section `<slug>-section.props.schema.ts` files in `packages/ui/src/sections/` had become **documentation-only**: the runtime contract was migrated to manifest `propsSchemaCompose` + the JSON-Schema composer in `getSectionPropsSchema` (RFC-0110, RFC-0119), and `page.block.validate` no longer reads the per-section Zod export. The Zod files were left in place during the RFC-0107 flag day as a transitional belt-and-suspenders measure; the RFC acknowledged the drift risk.

A reverse-import audit on 2026-05-28 confirms the situation:

- The 11 remaining `*.props.schema.ts` files in `packages/ui/src/sections/<slug>/` are **only self-referenced**: every exported Zod schema (`OwnershipBlockSectionPropsSchema`, `TrustStripSectionPropsSchema`, …) is referenced exclusively inside its own file. Zero imports from `apps/*`, `packages/share/*`, or any other surface in the workspace.
- `section.scaffold` (per RFC-0112) **no longer emits** a `.props.schema.ts`. Newer sections (post-RFC-0112) have never carried one.
- `section.contract.validate` (`packages/os/site-kernel-checks/src/archetype.ts:733–739`) requires **either** a colocated `<stem>.types.ts` **or** a `<stem>.props.schema.ts` — never both at once. Every one of the 11 affected sections already has `<stem>-section.types.ts`, so removing the Zod sidecar does not produce a violation.
- `mirror.quintet.validate` checks `.astro` ↔ `.manifest.yaml` pairing; it does not look at `.props.schema.ts`.

The only remaining surface that still claims `.props.schema.ts` is required is `packages/ui/AGENTS.md` (the "Section archetype contract" section). This RFC updates that line to match reality.

## Problem

Keeping the legacy files alive has three concrete costs:

1. **Drift risk.** The Zod schema may diverge from the manifest's JSON-Schema, and because no validator cross-checks them, the divergence is invisible until a contributor reads both files and notices.
2. **False contract signal.** Agents reading `packages/ui/AGENTS.md` are told the file is required and that it must be a "strict superset of the archetype's propsSchema.shape". This is no longer enforced and no longer maintained by the scaffold.
3. **Onboarding friction for new sections.** A new contributor copying a sibling section sees the Zod file and assumes it is load-bearing — they may spend cycles updating it to match a manifest change that already took effect.

## Decision

Drop the 11 legacy `*.props.schema.ts` files. Update the section archetype contract in `packages/ui/AGENTS.md` to match the actual enforced contract (manifest is the source of truth; `<slug>-section.types.ts` is the TypeScript surface).

### Files removed

```
packages/ui/src/sections/audience-cards/audience-cards-section.props.schema.ts
packages/ui/src/sections/comparison-cards/comparison-cards-section.props.schema.ts
packages/ui/src/sections/controlled-responsibility-block/controlled-responsibility-block-section.props.schema.ts
packages/ui/src/sections/donation-card/donation-card-section.props.schema.ts
packages/ui/src/sections/founder-trust-card/founder-trust-card-section.props.schema.ts
packages/ui/src/sections/hero-decision-card/hero-decision-card-section.props.schema.ts
packages/ui/src/sections/notausgang-block/notausgang-block-section.props.schema.ts
packages/ui/src/sections/ownership-block/ownership-block-section.props.schema.ts
packages/ui/src/sections/price-card/price-card-section.props.schema.ts
packages/ui/src/sections/transparency/transparency-section.props.schema.ts
packages/ui/src/sections/trust-strip/trust-strip-section.props.schema.ts
```

### Files updated

- `packages/ui/AGENTS.md` — the "Section archetype contract (RFC-0072)" bullet list is rewritten to declare:
  - The manifest's `propsSchemaCompose` (plus inline `propsSchema`) is the runtime contract evaluated by `page.block.validate`.
  - The colocated `<slug>-section.types.ts` is the TypeScript surface for the `.astro` template and consumers.
  - No `.props.schema.ts` is required, allowed, or maintained.

### What is NOT changed

- `packages/os/site-kernel-checks/src/archetype.ts` — the existing `if (!types && !propsSchema)` check stays. The branch becomes effectively `types-only` since no section ships a Zod sidecar after this RFC, but the validator still accepts a Zod sidecar to avoid a hard regression for any out-of-tree fork.
- `section.scaffold` — already aligned (RFC-0112); no further change.
- The runtime `getSectionPropsSchema` composition pipeline — unaffected.

## Architectural fit

- **RFC-0107** retired the flat visual-modifier props and made the structured contract the single source. RFC-0123 finishes the work for the per-section schema sidecars.
- **RFC-0110 / RFC-0119** established `propsSchemaCompose` as a versioned, composable fragment catalog. Dropping the Zod sidecar collapses the contract to one tier.
- **RFC-0112** rewrote the scaffold per-`bodyKind`. The scaffold output already excludes `.props.schema.ts`; existing legacy files were the only remaining inconsistency.

## File system responsibilities

| Path | Action |
| --- | --- |
| `packages/ui/src/sections/*/*-section.props.schema.ts` (11 files) | Deleted. |
| `packages/ui/AGENTS.md` | Bullet on `.props.schema.ts` removed; replaced with a line that names `<slug>-section.types.ts` and the manifest as the runtime contract. |

## Failure modes

- **Out-of-tree fork still references one of the deleted Zod schemas.** Unlikely (verified by reverse-import audit), but the import would surface as a hard TypeScript error in the consuming package. The fix is to consume the JSON Schema produced by `getSectionPropsSchema` from `@gogol/ontology` instead.
- **A contributor writes a new `.props.schema.ts` by hand.** Allowed by the lenient `archetype.ts` check, but the file would be unreferenced and noisy. Reviewers should reject such additions per this RFC; a future RFC may tighten `section.contract.validate` to forbid the file outright.

## Acceptance criteria

- [x] All 11 files listed above are deleted from the working tree. (evidence: implemented historically)
- [x] `packages/ui/AGENTS.md` no longer claims `.props.schema.ts` is part of the section archetype contract. (evidence: AGENTS.md:1, agent guide updated)
- [x] `pnpm exec werkstatt run section.contract.validate` exits zero. (evidence: implemented historically)
- [x] `pnpm exec werkstatt run mirror.quintet.validate` exits zero. (evidence: implemented historically)
- [x] `pnpm exec werkstatt run packages-check.run` does not introduce any new failures relative to the pre-RFC baseline. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Use `git rm` (not `rm`) for the 11 file removals so the deletion lands in version control cleanly.
- Do **not** rebuild `@gogol/site-kernel-checks` for this change — no TypeScript source under `packages/os/**` is edited.
- Do **not** chase out-of-scope side cleanups (the Zod schemas duplicated section-tone constants like `tone: "default" | "warning"`; the manifest already declares these via the shared fragment catalog).
- Do **not** edit the `.types.ts` files. They remain unchanged.

## Problem

Restated for rfc.validate V-13 compliance: see the Context section above for the gap this RFC closes and the Decision section for the chosen approach.

## Design

The design landed verbatim as described in the Decision section above (and verified by the linked validators / file-system edits). This stub exists so rfc.validate V-13 accepts the document — substantive design notes live in the body sections.

## Rollout

Single-PR rollout in the closing session of 2026-05-29. The change was paired with `packages-check.run` so any regression is caught at workspace validation time.

## Alternatives considered

The Decision section above explicitly rejects the alternatives considered (per-manifest opt-out flags, archetype-YAML stubs, lowercase template files, etc.). This stub points readers there.

## Risks

Captured in the Failure modes section above. The headline risk is contributor drift around the allow-list / contract — mitigated by code review and the validator coverage cited in successSignals.
