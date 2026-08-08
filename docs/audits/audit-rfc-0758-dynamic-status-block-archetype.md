---
rfcId: RFC-0758
title: "Add dynamic-status-block archetype for data-driven status indicators"
auditDate: 2026-08-08
auditor: agent
verdict: needs-revision
axes:
  structural-completeness: pass-with-findings
  dna-alignment: pass
  ecosystem-fit: fail
  forward-only-compliance: pass
  agent-facing-policy: pass-with-findings
  pragmatism: pass-with-findings
  blind-spots: pass-with-findings
findings:
  critical: 0
  major: 3
  minor: 6
  info: 1
---

# Audit Report: RFC-0758

## Mechanical validation

| Rule | Severity | Message | Status |
| --- | --- | --- | --- |
| V-30 | warning | `@warpgogol/ontology` is in `packagesImpacted` but `breaksC` is not true. If this RFC modifies `packages/ontology/src/external-surfaces/`, declare `breaksC: true` (RFC-0480). | Recorded — false positive (see F-12) |

`rfc.validate` status: **pass** (exitCode 0, 1 warning).

## Ecosystem context loaded

- `docs/architecture-dna.md` — DNA-17, DNA-19, DNA-24
- `AGENTS.md` (root), `packages/ontology/AGENTS.md`, `packages/ui/AGENTS.md`, `packages/os/site-kernel-codegen/AGENTS.md`, `packages/os/site-kernel-checks/AGENTS.md`
- `packages/ontology/src/enums.ts` — closed enums (Industry, ComponentRole, Layer), SemanticRole open alias (RFC-0084)
- `packages/ontology/src/manifest.ts` — KNOWN_INTENTS list
- `packages/ontology/src/schemas/section-archetype.ts` — Zod schema for archetype YAML (bodyKind enum, propsSchema, acceptedCosmicNames)
- `packages/ontology/src/cosmic/planet-catalog.ts` — PlanetCatalog closed list
- `packages/ontology/archetypes/index.yaml` — generated registry (58 entries, 29 section roles)
- `packages/ontology/archetypes/sections/impact.yaml`, `markdown.yaml`, `transparency.yaml`, `trust-strip.yaml` — reference archetypes
- `packages/share/src/page.ts` — PLANET_IMPORT_PATHS is registry-derived (RFC-0091)
- `packages/os/site-kernel-codegen/src/section-scaffold.ts` — scaffold command implementation
- `packages/os/site-kernel-checks/src/archetype/registry-build.ts` — archetype.registry.build
- `packages/os/site-kernel-checks/src/archetype/cosmic-name.ts` — cosmic.name.pick
- Related RFCs: RFC-0757, RFC-0026, RFC-0047, RFC-0023, RFC-0480

## Axis 1: Structural completeness — pass with findings

All required frontmatter fields present: `id`, `title`, `status`, `kind`, `scope`, `owners`, `createdAt`, `updatedAt`, `packagesImpacted`, `successSignals`, `nonGoals`, `satisfies`, `versionBump`, `commands`. All required markdown sections present: Context, Problem, Decision, Architectural fit, Design, Rollout, Alternatives considered, Risks, Acceptance criteria, Implementation notes for agents. `reviewers` empty (correct for draft). `implementedAt`/`closedAt` empty (correct for draft).

### F-01 (minor) — `related` field incomplete

The RFC body references RFC-0101..0107 (section framework) and RFC-0040 (animated stat counter style) in the Architectural fit and Design sections, but neither is listed in the `related` frontmatter field. RFC-0040 is particularly relevant because the `animated` prop explicitly references its animation style.

**Evidence:** RFC-0758 line 113 — "RFC-0101..0107 (Section framework)"; line 140 — "animated?: boolean; // Optional count-up animation (RFC-0040 style)"; frontmatter `related` lists only RFC-0757, RFC-0026, RFC-0047.

### F-02 (minor) — Incorrect section archetype count

The Context section states "28 section archetypes" but the actual count is 29.

**Evidence:** `packages/ontology/archetypes/index.yaml` `sectionRoles` array has 29 entries; `totalCount: 58` includes both sections and components.

## Axis 2: DNA alignment — pass

- **DNA-17 (Mirror Quintet):** The RFC correctly states the new archetype will ship a colocated `manifest.yaml` with all required fields. `section.scaffold` generates the manifest automatically. `satisfies: DNA-17` is valid.
- **DNA-19 (Closed ontology vocabularies):** The RFC correctly uses `semanticRole` as an open type alias (RFC-0084) and draws `cosmicName` from the existing `PlanetCatalog` without extending it. No DNA-19 extension — correctly not listed in `satisfies`.
- **DNA-24 (Block-declarative pages):** The archetype is consumed via `blocks[].type: dynamic-status-block` in page content files. Compliant.

No violations found.

## Axis 3: Ecosystem fit — fail

The RFC correctly uses valid enum values (`bodyKind: composite`, `layoutHint: single-column`, `expectedIntents` from `KNOWN_INTENTS`, `expectedIndustryFit` from `Industry` enum) and valid `propsSchema.compose` fragments (`section-visual`, `section-header`). However, several factual errors about the implementation pipeline would mislead agents.

### F-03 (major) — `section.scaffold` CLI example is wrong

The RFC's CLI example:
```sh
pnpm exec site-kernel run section.scaffold --archetype dynamic-status-block --site warpgogol-com
```

The actual command requires `--name=<slug>` and `--archetype=<id>`. There is no `--site` flag. The command scaffolds into `packages/ui/src/sections/<slug>/`, not into an app directory.

**Evidence:** `packages/os/site-kernel-codegen/src/section-scaffold.ts:101-107`:
```ts
const slug = String(input.flags.name ?? input.flags.slug ?? "").trim();
const archetypeId = String(input.flags.archetype ?? "").trim();
if (!slug || !archetypeId) {
  return { exitCode: 1, summary: "section.scaffold requires --name=<slug> and --archetype=<id>" };
}
```

### F-04 (major) — File extension mismatch in file system responsibilities

The file system responsibilities table lists `dynamic-status-block-section.types.ts` but `section.scaffold` generates `.types.generated.ts`, not `.types.ts`.

**Evidence:** `packages/os/site-kernel-codegen/src/section-scaffold.ts:138`:
```ts
const typesPath = join(sectionDir, `${fileStem}.types.generated.ts`);
```

### F-05 (major) — `PLANET_IMPORT_PATHS` is registry-derived, not manually edited

The file system responsibilities table lists `packages/share/src/page.ts` for manual `PLANET_IMPORT_PATHS` entry. However, since RFC-0091, `PLANET_IMPORT_PATHS` is derived from the archetype registry at import time — there is no literal constant to update.

**Evidence:** `packages/share/src/page.ts:160-163`:
```ts
export const PLANET_IMPORT_PATHS: Record<string, string> = {
  ...PLANET_IMPORT_PATHS_FALLBACK,
  ...registryPlanetImportPaths,
};
```

The RFC should instead say: "Run `archetype.registry.build` to regenerate `index.yaml`/`index.json`; `PLANET_IMPORT_PATHS` is registry-derived and requires no manual edit."

### F-06 (minor) — `index.yaml` is generated, not hand-edited

The file system responsibilities table lists `packages/ontology/archetypes/index.yaml` for manual registration of `blockTypeToCosmicName`, `roleByCosmicName`, `planetImportPaths`. This file is generated by `archetype.registry.build`. The RFC should mention running `archetype.registry.build` after adding the archetype YAML.

**Evidence:** `packages/os/site-kernel-checks/src/archetype/registry-build.ts:111-112`:
```ts
await writeFileAtomic(outputFile, yamlStringify(registry) + "\n");
await writeFileAtomic(outputJsonFile, JSON.stringify(registry, null, 2) + "\n");
```

### F-07 (minor) — Incorrect `impact` semantic role

The alternatives section states `impact` has semantic role `impact-highlight`, but the actual value is `impact`.

**Evidence:** `packages/ontology/archetypes/sections/impact.yaml:4` — `semanticRole: impact`.

### F-08 (minor) — `animated` prop implementation undefined for composite bodyKind

The `animated?: boolean` prop references "RFC-0040 style" count-up animation. The `impact` archetype implements GSAP animation via `SectionStats` (bodyKind: stats, `body-stats` fragment). However, `dynamic-status-block` uses `bodyKind: composite`, meaning it owns its bespoke layout and cannot reuse `SectionStats`. The RFC does not explain how the `animated` prop will be implemented — whether it will duplicate GSAP counter logic, create a new shared animation utility, or delegate to an existing component.

**Evidence:** `packages/ontology/archetypes/sections/impact.yaml:14` — `bodyKind: stats`; `packages/os/site-kernel-codegen/src/section-scaffold.ts:288-296` — composite bodyKind generates a bespoke layout without SectionStats.

## Axis 4: Forward-only compliance — pass

The RFC is purely additive: no `supersedes`, no `amends`, no existing commands changed, no existing archetypes modified. No existing content is broken. No migration required (stated in Rollout). No violations found.

## Axis 5: Agent-facing policy — pass with findings

The "Implementation notes for agents" section is present and covers: implementation permission gating (draft → accepted → implemented), `section.scaffold` usage mandate, distinction from `impact`, no client-side hydration, invariant conflict resolution. All standard agent instructions are present.

### F-09 (minor) — Agent instruction references wrong CLI syntax

The implementation notes say "Agents MUST use `section.scaffold` to materialize the section" but the RFC's own CLI example (F-03) uses incorrect flags. An agent following the RFC's example would get an error. This compounds F-03 — the agent-facing instruction is correct in intent but the example it would reference is wrong.

## Axis 6: Pragmatism — pass with findings

The problem is well-motivated with a concrete use case (warpgogol-com "Відповідальні рекомендації" page). Alternatives are well-considered (misuse impact, site-local section, markdown with inline value, extend impact). Risks are identified (data freshness, archetype proliferation, cosmic name collision, agent misinterpretation). Acceptance criteria are specific and checkable.

### F-10 (minor) — `versionBump: minor` inconsistent with additive change

The frontmatter declares `versionBump: minor` which means "Breaks-B, requires migrator" per the frontmatter comment. However, the RFC explicitly states "No migrator needed: The archetype is additive — no existing blocks are changed or removed." Adding a new archetype to the catalog is purely additive and does not break any existing contract. The correct value should be `patch` (safe).

**Evidence:** RFC-0758 line 40 — `versionBump: minor`; RFC-0758 line 211 — "No migrator needed: The archetype is additive."

## Axis 7: Blind spots — pass with findings

### F-11 (minor) — Missing `archetype.registry.build` step

The RFC does not mention running `archetype.registry.build` after adding the new archetype YAML. This is a required step for the archetype to be discoverable by registry-derived consumers (`PLANET_IMPORT_PATHS`, `BLOCK_TYPE_TO_COSMIC_NAME`, `roleByCosmicName`). Without this step, `page.block.validate` would not recognize `type: dynamic-status-block` blocks.

**Evidence:** `packages/os/site-kernel-checks/src/archetype/registry-build.ts:111-112`; `packages/share/src/page.ts:160-163` — `PLANET_IMPORT_PATHS` is derived from registry output.

### F-12 (info) — V-30 warning is a false positive

The `rfc.validate` V-30 warning fires because `@warpgogol/ontology` is in `packagesImpacted` and `breaksC` is not `true`. However, the RFC only adds a new file under `packages/ontology/archetypes/sections/` — it does not modify `packages/ontology/src/external-surfaces/` (the Layer C contract directory). The RFC correctly declares `breaksC: false` and states "No URL, JSON-LD, or sitemap changes" but does not acknowledge the warning or explain why it is safe to ignore.

**Evidence:** RFC-0758 line 114 — "Layer C: No URL, JSON-LD, or sitemap changes — `breaksC: false`."; RFC-0480 — V-30 rule targets `packages/ontology/src/external-surfaces/` changes.

## Summary

| Axis | Verdict | Findings |
| --- | --- | --- |
| Structural completeness | pass with findings | F-01, F-02 |
| DNA alignment | pass | — |
| Ecosystem fit | fail | F-03, F-04, F-05, F-06, F-07, F-08 |
| Forward-only compliance | pass | — |
| Agent-facing policy | pass with findings | F-09 |
| Pragmatism | pass with findings | F-10 |
| Blind spots | pass with findings | F-11, F-12 |

**Total findings:** 0 critical, 3 major, 6 minor, 1 info.

## Verdict: needs-revision

The RFC is structurally sound, forward-only compliant, and DNA-aligned. However, three major findings (F-03, F-04, F-05) contain factual errors about the `section.scaffold` command interface, file naming conventions, and registry derivation that would cause implementation failures and agent confusion. These must be corrected before implementation.

### Required revisions before implementation

1. **F-03:** Fix the `section.scaffold` CLI example to use `--name=<slug> --archetype=<id>` and remove the non-existent `--site` flag.
2. **F-04:** Change `.types.ts` to `.types.generated.ts` in the file system responsibilities table.
3. **F-05:** Remove the `packages/share/src/page.ts` manual edit step. Replace with "Run `archetype.registry.build` to regenerate `index.yaml`/`index.json`; `PLANET_IMPORT_PATHS` is registry-derived."
4. **F-10:** Change `versionBump` from `minor` to `patch` to match the additive nature of the change.

### Recommended revisions

5. **F-01:** Add RFC-0040 and RFC-0101..0107 to the `related` field.
6. **F-02:** Correct the section archetype count from 28 to 29.
7. **F-06:** Mention `archetype.registry.build` as a required post-scaffold step.
8. **F-07:** Correct `impact` semantic role from `impact-highlight` to `impact`.
9. **F-08:** Explain how `animated: true` will be implemented for `bodyKind: composite` (reuse SectionStats? new utility? duplicate GSAP logic?).
10. **F-11:** Add `archetype.registry.build` to the rollout or acceptance criteria.
11. **F-12:** Acknowledge the V-30 warning and explain why `breaksC: false` is correct.
