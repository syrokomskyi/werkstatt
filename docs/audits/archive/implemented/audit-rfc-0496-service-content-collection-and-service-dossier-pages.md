---
rfcId: RFC-0496
auditId: AUDIT-RFC-0496-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0496

## Verdict: Needs revision

The RFC has a fundamental design flaw: it proposes depth 1.5 (a fractional depth) in a blueprint schema that requires integer depths (`z.number().int().min(0)`). It also omits a migrator (required by `versionBump: minor` per RFC-0479), a C-contract update (required by `breaksC: true` per RFC-0480), and six required RFC sections including Implementation notes for agents. The axis-order interaction with the existing geo cascade is unaddressed.

## Mechanical validation (rfc.validate)

Pass (exit 0) with 7 warnings:

- **V-13** (×6): Missing required sections: `## Architectural fit`, `## Design`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Implementation notes for agents`.
- **V-19**: `RFC-0496.amends` includes `RFC-0238`, but `RFC-0238.amendedBy` does not include `RFC-0496`. (RFC-0238 is in `docs/rfcs/archive/implemented/` — its `amendedBy` field must be updated.)

## Axis A — Structural completeness

**Fail** — 6 of ~11 required sections are missing:

- **Architectural fit**: absent. The RFC must explain how it aligns with DNA-24, DNA-53, RFC-0192/0193, RFC-0238, RFC-0478, RFC-0480, and RFC-0492/0494/0495/0497.
- **Design**: absent. No CLI surface, no TypeScript contracts, no file system responsibilities table, no output format, no failure modes.
- **Rollout**: absent. No default behavior, no migration path, no pipeline integration table.
- **Alternatives considered**: absent. No real alternatives discussed.
- **Risks**: absent. No risk table, no agent misinterpretation risk, no false-positive analysis.
- **Implementation notes for agents**: absent. No behavioral rules for implementing agents.

The **Decision** section is present and uses present tense. The **Acceptance criteria** section has 8 checkable items — adequate in count but insufficient without the supporting sections. The **Implementation plan** is a bare 8-step list without file paths or verification steps.

## Axis B — DNA alignment

**Fail** — `satisfies: [DNA-24, DNA-53]` are both real invariants, but the RFC body does not explain how it enforces or protects them:

- **DNA-24 (Block-declarative pages)**: The RFC maps service fields to existing block types (hero, cardGrid, listCards, md, ctaBlock) and the nonGoals explicitly exclude new block archetypes. This is consistent with DNA-24, but the RFC never cites DNA-24 or explains the alignment — it only lists it in `satisfies[]`.
- **DNA-53 (Semantic fingerprint governance)**: The RFC does not mention `@gogol/fingerprint` anywhere. The `surface.service.validate` command uses string matching for claim restrictions, not fingerprints. DNA-53 is likely satisfied trivially (no new ad hoc hashing), but the RFC must state this explicitly. Compare RFC-0492's Architectural fit section which explains: "DNA-53 is satisfied trivially: no new ad hoc hashing helpers are introduced outside `@gogol/fingerprint`."

No new DNA invariant is established. No conflict with existing invariants.

## Axis C — Ecosystem fit

**Fail** — three critical issues:

1. **Blueprint schema incompatibility (critical).** The RFC proposes depth 1.5 in the blueprint levels table. The Zod schema at `@gogol/surface/src/blueprint-schema.ts:158` requires `depth: z.number().int().min(0)` — non-integer depths fail validation. The RFC must either:
   - Renumber all depths (e.g., 0=pillar, 1=industry, 2=service, 3=country, 4=region, 5=city, 6=demand) and update all depth-dependent logic (`minRecordsPerDepth`, `noindexBelowPerDepth`, `substanceMinPerDepth`, `evidencePerDepth`, `demandPerDepth`, `depthRoles`, `slaDaysPerDepth`, `regionalGateDepths`), or
   - Propose a schema extension to accept fractional depths and explain how all depth-comparison logic (`levelByDepth`, `childrenOf`, `siblingsOf`, `skipSingletonChildren`) handles non-integer depths.

   The RFC does neither. This is a blocking design gap.

2. **Axis order interaction unaddressed.** The current axis order is `industry × country × region × city × demand`. The RFC adds a `service` axis but does not specify its position in the axis order. The eligibility engine (`enumerateCandidateTuples`, `pathKey`, `childrenOf`, `siblingsOf`) uses axis order position to determine which axes are active at each depth. If `service` is inserted between `industry` and `country`, depth-2 becomes `industry × service`, not `industry × country`. The RFC says "The service axis is only active for depth-1.5 and depth-5" but the blueprint model does not support selectively activating axes at specific depths — axes are positional, active for all depths ≥ their position in the order.

3. **C-contract update missing.** `breaksC: true` is declared. The RFC introduces new URL patterns (`/website/{industry}/{service}/` and `/sait/{industry}/{service}/`). Per RFC-0480, the declarative C-contract at `packages/ontology/src/external-surfaces/url-schema.yaml` must be updated in the same RFC. The RFC does not mention `url-schema.yaml` or `surface.contract.validate`.

**Passing items:**

- Package boundaries: all `packagesImpacted` entries (`@gogol/surface`, `@gogol/ontology`, `@gogol/site-kernel-checks`, `@gogol/share`) are packages. No app-to-app imports.
- Command lifecycle: `proposed: [surface.service.validate]` → `added: [surface.service.validate]` is internally consistent. `changed: [surface.generate, surface.validate]` are existing registered commands.
- Pipeline placement: not specified — the RFC does not state which pipeline `surface.service.validate` runs in.
- Compass sync: not mentioned. The RFC should identify which `docs/*.xml` files need synchronization.
- AGENTS.md updates: not mentioned.
- Cosmic naming: the RFC introduces constellation `website-service` but does not address registration or three-way alignment.

## Axis D — Forward-only compliance

**Pass** — no backward compatibility shim, no dual-path, no feature flag. The RFC amends RFC-0238 but does not describe what specifically changes in RFC-0238's contract (the amendment relationship is declared but not explained in the body). Legacy depth numbering is not maintained alongside new numbering — forward-only.

## Axis E — Agent-facing policy

**Fail** — two issues:

1. **Implementation notes for agents missing (V-13).** The RFC has no `## Implementation notes for agents` section. Agents need explicit behavioral rules: status gate (draft → accepted → implemented per RFC-0224), migrator registration requirement (RFC-0479), C-contract update requirement (RFC-0480), anti-fabrication rules for service record content, and `surface.contract.validate` verification.

2. **Anti-fabrication gap.** Implementation plan step 8 says "Create initial service records for `friseur/strizhka` and `elektriker/elektroinstallation`." Service records carry 24 structured fields including `serviceVariants`, `pricePresentationModels`, `bookingRequirements`, `faq` — these require authored trade-specific expertise, not LLM-generated content. The RFC must distinguish between code changes an agent can make (blueprint, baker, validator) and content that requires human authoring (service records). Compare RFC-0492's explicit rule: "Agents MUST NOT fill dossier fields with LLM-generated content."

**Passing items:**

- Status gate: `status: draft`, no self-authorizing language.
- Storage policy: no persistence changes, no cookies.

## Axis F — Pragmatism

**Pass with minor findings:**

- **Minimal command surface**: `surface.service.validate` follows the pattern established by RFC-0492 (`surface.industry.validate`). Justified by analogy.
- **Lean contracts**: The service record schema has 24 fields. `recommendedComponents` and `recommendedPageStructure` overlap conceptually — the RFC could justify why both are needed. Minor.
- **Existing patterns**: The RFC correctly follows the RFC-0492 pattern (new content collection, baker specialization, validate command, publication gate, claim restrictions).
- **Scope discipline**: `appsImpacted` and `packagesImpacted` lists appear accurate.

## Axis G — Blind spots

**Fail** — four unaddressed blind spots:

1. **Migrator missing (critical).** `versionBump: minor` means Breaks-B (RFC-0478), which requires a migrator in the registry (RFC-0479). The implementation plan does not include registering a migrator. Compare RFC-0492 and RFC-0495, both of which register migrators. The migrator would handle the transition of existing demand records (which currently combine city and service context) and the new `service` axis.

2. **C-contract blind spot.** As noted in Axis C, `breaksC: true` requires `url-schema.yaml` to be updated with the new `/:locale?/:industry/:service` route pattern. Not mentioned.

3. **Empty-state edge case.** The RFC does not consider what happens when no service records exist yet. `surface.service.validate` should handle this gracefully (warn, not fail). The baker should not emit service pages when no records exist. Not addressed.

4. **Performance.** `surface.service.validate` scans all service records and checks text fields against claim restrictions. The RFC does not estimate the cost or describe I/O patterns. With potentially hundreds of industry×service tuples, this could be significant in `build.check`.

5. **False positives.** The claim restriction validator matches phrases like "mehr Anfragen" / "більше запитів". The RFC does not estimate the false-positive rate or describe suppression during migration. Compare RFC-0492 which addresses this: "the validator matches full phrases (e.g. 'більше запитів', not just 'більше')."

6. **Concurrent execution / interrupted operations.** Not considered.

## Questions for the author

1. **How does depth 1.5 work with `z.number().int().min(0)`?** The blueprint schema rejects non-integer depths. Either renumber all depths (and update all depth-dependent config) or extend the schema. Which approach do you intend, and what is the migration plan for existing depth references in `website-local.yaml`?

2. **Where does the `service` axis sit in the axis order?** The eligibility engine is positional — axes are active for all depths ≥ their position. If `service` is between `industry` and `country`, depth-2 becomes `industry × service`, not `industry × country`. How do you propose to handle a non-geo axis that is only active at specific depths without breaking the positional model?

3. **Where is the migrator?** `versionBump: minor` requires a migrator in `packages/os/site-kernel-handoff/src/migrators/registry.ts` per RFC-0479. What does the migrator transform — does it split existing demand records into service records, or is it a no-op like RFC-0495?

4. **How is `url-schema.yaml` updated?** `breaksC: true` requires the C-contract to be updated in the same RFC. What route pattern is added for `/:locale?/:industry/:service`?

5. **Which pipeline does `surface.service.validate` run in?** Is it `build.check` (blocking), `build.prepare`, or `sites-check`? Is it warn-mode initially like RFC-0492's `surface.industry.validate`?
