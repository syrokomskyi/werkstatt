---
rfcId: RFC-0716
auditId: AUDIT-RFC-0716-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0716

## Verdict: Needs revision

The RFC is a clean content-only composition proposal that correctly uses existing block types and the block-declarative pattern. However, it has one critical ecosystem-fit issue: the team page does not have Tethys (transparency) pinned in its `planets[]` in `system.md`, so the proposed `transparency` block will fail `page.block.validate`. The RFC also does not list `system.md` as a file to modify.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0716` exits 0 with zero violations.

## Axis A — Structural completeness

1. **Design examples use German text, not UK.** The YAML examples in § Design (lines 149-189) show German headings and body text ("Nachweisregister", "Dokumentierte Projektbestätigungen", etc.). Acceptance criterion 7 states "UK content is source of truth, DE maintains semantic parity." The design examples should show UK text as the primary source, or explicitly note that examples are illustrative in DE for readability but implementation must author UK first.

2. **File system responsibilities table is incomplete.** The table (lines 193-204) lists 10 page `.md` files but omits `src/content/system.md`. The team page needs Tethys added to its `planets[]` (see Axis C finding 1). The RFC must list system.md as a file to modify, or choose a block type already pinned for the team page.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-24]` is correct — the RFC adds blocks to existing pages' `blocks[]` arrays, which is the block-declarative pattern established by RFC-0026. The RFC body explains how it extends DNA-24 (§ Architectural fit, line 135).

## Axis C — Ecosystem fit

1. **Critical: Tethys not pinned for team page.** The team page (`pageId: team`) in `system.md` (line 678-695) has `planets: [Hyperion, Dione, Europa, Mimas]`. The RFC proposes adding a `transparency` block (archetype `transparency` → cosmicPlanet `Tethys`) to the team page (line 127), but Tethys is not in the team page's `planets[]`. This will fail `page.block.validate` with rule B-02: "Tethys is not listed in src/content/system.md pages[pageId=team].planets[]". The RFC must either:
   - Add `Tethys` (pin 1.3.0) to the team page's `planets[]` in `system.md`, or
   - Use a block type already pinned for the team page (e.g. `Dione` → `final-cta`, but that changes the semantic role).

   The other four pages (home, services, pricing, notausgang) all have Tethys pinned. Only team is missing it.

2. **Block type usage is correct.** The RFC uses `type: trust-strip` (Deimos) and `type: transparency` (Tethys) — both are valid archetype names in the registry. The RFC correctly uses CMS-friendly `type:` names, not retired `use: PlanetName` (RFC-0047).

3. **CTA target is valid.** `target: nachweise` references the `nachweise` pageId, which exists in `system.md` (line 697). The CTA format (`target: <pageId>`) matches existing usage in `home.md`.

4. **No new commands or packages.** `commands.proposed/added/changed/removed` are all empty. `packagesImpacted: []` is correct for a pure content change.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual-paths. The RFC is purely additive content.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes (lines 237-245) correctly reference governance rules: status gate, `mission.git.commit`, UK-first authoring, existing block types only, supersede escalation on invariant conflict. No NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

No issues. The RFC is minimal: no new commands, no new packages, no new components. It reuses existing `trust-strip` and `transparency` archetypes. `nonGoals` are explicit and meaningful (lines 58-63). `appsImpacted: [warpgogol-com]` is correct.

## Axis G — Blind spots

1. **Duplicate trust-strip on homepage.** The homepage already has a `trust-strip` block (`id: promo`, line 92 of `uk/home.md`). Adding a second `trust-strip` block (`id: nachweis-register`) is valid — block ids are unique and heading text differs ("Подивіться..." vs "Nachweisregister" / "Реєстр доказів"), so axe landmark-unique will not flag it. The RFC should note the existing block and confirm distinct heading text to prevent future drift.

2. **Empty state is addressed.** The Risks section (line 221) correctly identifies the empty Nachweisregister page risk and references the RFC-0708 empty-state design. No gap.

3. **Entitlement gate is addressed.** The Rollout section (line 209) correctly explains that projections are static content blocks not gated by the `nachweis` entitlement, and the CTA target `/nachweise/` is itself gated. No gap.

## Questions for the author

1. How should the team page be handled — add Tethys to its `planets[]` in `system.md`, or use a different block type that is already pinned (e.g. `Dione` → `final-cta`)? Adding Tethys is the cleaner option since `transparency` is the semantically correct archetype for a Nachweis reference.
2. Should the design examples show UK text as the primary source, given that acceptance criterion 7 requires UK as source of truth?
3. Should the RFC list `system.md` in the file system responsibilities table, or should the team page projection be dropped to keep the RFC purely content-only (no manifest changes)?
