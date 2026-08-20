---
rfcId: RFC-0893
auditId: AUDIT-RFC-0893-01
date: 2026-08-20
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0893

## Verdict: Needs revision

The RFC correctly identifies a real gap (no build-time vendor icon validation) and proposes a sound command structure. However, the component-source scanning step is practically useless (all `loadVendorIcon` calls use variable references, not literals), the `IconReferenceViolation` type doesn't cover all three defined rules, and the `related` RFC references lack in-body explanation.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Type contract gap**: `IconReferenceViolation.rule` is typed as `"ICON-REF-01"` only, but the Failure modes section defines three rules: `ICON-REF-01` (error), `ICON-REF-02` (warning), `ICON-REF-03` (error). The type should use a union `"ICON-REF-01" | "ICON-REF-02" | "ICON-REF-03"` or a string enum to accommodate all rules.
- **`related` references unexplained**: The frontmatter lists `RFC-0100`, `RFC-0103`, `RFC-0104` but the body never explains the connection. These RFCs established the section framework contracts (DNA-38) that introduced `VendorIconConfig` in list items, cards, and CTAs. The RFC body should state this relationship in the Architectural fit section.

## Axis B — DNA alignment

- **`satisfies: []` is empty but DNA-38 is relevant**: DNA-38 ("Standardized authored section-content contracts", established by RFC-0100) introduced the canonical `VendorIconConfig`-based item objects that this validator checks. The RFC should list `DNA-38` in `satisfies` since it enforces that authored icon references resolve to real assets.
- **K-0004 reference**: The body references K-0004 ("evaluation must not mutate its subject") — this is a learned principle, not a DNA invariant, so it's correctly not in `satisfies`. No issue, but the reference would be clearer if the RFC explained that K-0004 is the reason for the read-only constraint.

## Axis C — Ecosystem fit

- **Pipeline placement is correct**: `SITES_CHECK_AUTHOR_PIPELINE` after `public.icons.validate` (line 249) and before `generated.marker.validate` (line 261). Verified in `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts`.
- **Command-tables file not specified**: The RFC doesn't state which command-tables file will register the command. `public.icons.validate` is registered in `31-public-surface.ts`. The new command should either go there or in a new table file. The RFC should specify this.
- **Compass sync not addressed**: Adding a new check command requires updating `docs/verification-plan.xml` with the new validator. The RFC doesn't mention this.
- **AGENTS.md update mentioned but vague**: The acceptance criteria say "AGENTS.md updated with command description in the check commands list" but doesn't specify which AGENTS.md — `packages/werkstatt-site/AGENTS.md` is the correct one (it lists notable check commands).

## Axis D — Forward-only compliance

No issues. The RFC proposes a new command with no backward compatibility layers, no shims, no dual-paths.

## Axis E — Agent-facing policy

- No self-authorizing language found.
- Implementation notes correctly reference RFC-0224, RFC-0330, RFC-0334.
- No `NEEDS CLARIFICATION` markers found.
- No storage policy concerns (read-only validator).

## Axis F — Pragmatism

- **Component-source scanning is practically useless**: The Detection strategy step 3 proposes scanning `packages/werkstatt-site/src/domain/ui/components/**/*.astro` for `loadVendorIcon({ vendor: "...", collection: "...", name: "..." })` calls with literal string arguments. However, all actual `loadVendorIcon` calls in components use variable references:
  - `section-list.astro:64` → `loadVendorIcon(item.icon)`
  - `section-card-grid.astro:122` → `loadVendorIcon(card.icon)`
  - `section-cta.astro:62` → `loadVendorIcon(icon)`

  Zero components pass literal `VendorIconConfig` objects to `loadVendorIcon`. The icon references originate from content files (markdown frontmatter, YAML block props) where they are authored as data, not from component source. This scanning step adds complexity for zero benefit and should be removed or relegated to a non-goal.

- **Lean type contract**: `IconReferencesValidateData` has `checkedCount` and `availableIcons` — both useful for diagnostics. No speculative generality. Good.

## Axis G — Blind spots

- **Empty `icons/gen/` directory**: The RFC defines `ICON-REF-02` for when `icons/gen/` doesn't exist, but doesn't specify behavior when the directory exists but is empty (e.g., fresh workpiece before `icons.generate` runs, or package-level icons not yet generated). This should be the same `ICON-REF-02` warning.
- **Archetype YAML files**: The RFC mentions scanning `src/content/**/*.yaml` but doesn't address archetype YAML files in `packages/werkstatt-shared/src/ontology/archetypes/sections/` that embed `VendorIconConfig` shapes directly (e.g., `ownership-block.yaml` lines 34-40). These are schema definitions, not content — but if an archetype specifies an icon that doesn't exist, every site using that archetype will have a missing icon. The RFC should either scan archetypes or explicitly list them as a non-goal.
- **Content YAML vs. markdown frontmatter**: The RFC says it scans `src/content/**/*.md` and `src/content/**/*.yaml` but doesn't distinguish between YAML frontmatter in `.md` files (where `VendorIconConfig` appears as part of block props) and standalone `.yaml` files. The scanning strategy should clarify how it parses `VendorIconConfig` from each format.

## Questions for the author

1. Why scan `.astro` component source for literal `loadVendorIcon` calls when all actual calls use variable references? Should this step be removed?
2. Should archetype YAML files in `packages/werkstatt-shared/src/ontology/archetypes/` be scanned for `VendorIconConfig` references, or is that explicitly out of scope?
3. Should `DNA-38` be listed in `satisfies` since this validator enforces that authored icon references (established by DNA-38) resolve to real assets?
