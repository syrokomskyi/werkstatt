---
rfcId: RFC-0735
auditId: AUDIT-RFC-0735-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: cascade
verdict: approved
---

# Audit: RFC-0735 — Multi-Currency Pricing Module — Program Charter

## Verdict: Approved

The RFC is a well-structured program charter that correctly grounds itself in the existing PBP ecosystem, derivation engine, and entitlement catalog. All 10 child RFCs (0736–0745) already exist as drafts. The charter's architectural principles (canonical price untouched, business-level strategy, build-time materialization, entitlement gating) are sound and consistent with existing DNA invariants. Minor blind spots (service workspace not in frontmatter, charter acceptance transition undefined) are non-blocking.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0735` exits 0 with zero violations.

## Axis A — Structural completeness

No blocking issues.

- Frontmatter is complete: `id`, `title`, `status: draft`, `kind: architecture`, `scope: workspace`, `owners`, `createdAt`, `updatedAt`, `related`, `satisfies`, `versionBump: minor`, `commands`, `appsImpacted`, `packagesImpacted`, `successSignals`, `nonGoals` — all present.
- `satisfies: [DNA-4, DNA-55]` — correctly declared for an architecture RFC created after 2026-07-07 (RFC-0331).
- Required markdown sections for architecture kind: Context, Problem, Decision, Architectural fit, Design, Rollout, Alternatives considered, Risks, Acceptance criteria, Implementation notes for agents — all present.
- `commands` block has all empty arrays — correct for a program charter that proposes no CLI commands itself.
- `packagesImpacted` lists `@warpgogol/pbp`, `@warpgogol/share`, `@warpgogol/ui`, `@warpgogol/site-kernel-checks` — all verified as real packages in the workspace.
- `appsImpacted: [warpgogol-com]` — verified as a registered Sternsystem.

## Axis B — DNA alignment

No issues.

- **DNA-4 (Canonical content in `src/content/`)** — correctly satisfied. Currency policies, rate policies, and rate schedules are authored content in `src/content/business-profile/`. Derived prices are compiler-materialized, not authored.
- **DNA-55 (Spec vendoring)** — correctly satisfied. The RFC explicitly states "New entities are platform RFCs, not spec amendments" and references `pbp-specification-package/ADR-010`, `ADR-011`, `ADR-012` as related context. The vendored spec is not modified.
- **DNA-20 (superseded by RFC-0471)** — the RFC correctly uses `@warpgogol/pbp` as the canonical business layer. No references to the deleted `@warpgogol/business` package.
- No new DNA invariants are established by this charter — correct for a program charter.

## Axis C — Ecosystem fit

No issues.

- **PBP pricing core (RFC-0437)** — correctly references `PbpCharge`, `PbpChargeAmount` in `packages/pbp/src/entities/pricing.ts`. The charter's principle "Canonical price is untouched" aligns with the existing schema.
- **Charge schema enforcement (RFC-0728)** — correctly states `pbpChargeSchema` enforcement is unchanged. Derived prices are separate from the authored charge.
- **Money pipe formatter (RFC-0729)** — correctly identifies that `money` formatter already supports `targetCurrency` and `rate` params in `packages/share/src/formula-eval.ts:58-78`.
- **Presentation elimination (RFC-0730)** — correctly states price display routes through canonical PBP references + pipe formatting.
- **Derivation engine** — correctly identifies `runDerivations` in `packages/pbp/src/compiler/derivations.ts` as the extension point for `currency-conversion`. The existing `first-year-cost` and `tco` contracts are referenced.
- **Entitlement catalog** — correctly identifies `ENTITLED_FEATURES` in `packages/share/src/entitlement.ts` as the place to add `multi-currency`. The existing catalog pattern (blog, pseo, nachweis) is followed.
- **Exploration document** — `docs/explorations/multi-currency-pricing-module.md` exists and is referenced. The charter's 35 design decisions are adopted from it.
- **Child RFCs** — all 10 child RFCs (0736–0745) exist in `docs/rfcs/` as draft. The dependency graph in the RFC sequence table is internally consistent.
- **PBP spec ADRs** — ADR-010 (`pricing` block name), ADR-011 (Charge/Plan/Adjustment separation), ADR-012 (decimal string money) all exist in `docs/specs/pbp-specification-package/07-PBP-Decision-Log.md` and are correctly referenced.

## Axis D — Forward-only compliance

No issues.

- `supersedes: []`, `amends: []` — correct for a new program charter. No existing RFCs are superseded or amended.
- `versionBump: minor` — correct for an architecture RFC that adds new entities without breaking existing contracts.
- The RFC explicitly states "No backward compatibility. No migration." — acceptable because the module is additive (new entities, new derivation, new entitlement) and does not replace or break existing functionality.
- `PbpCharge.amount` is explicitly left unchanged — no existing field is renamed or semantically changed.
- The `pbp/*@1` namespace is extended additively (new entity types), not modified — consistent with DNA-55's additive-only constraint.

## Axis E — Agent-facing policy

No issues.

- Implementation notes are clear and unambiguous:
  - "Agents MAY implement code changes ONLY when each RFC has status: accepted (or implemented)."
  - "Implement RFCs sequentially: 0736 → 0737 → 0738 → 0739 → 0740 → 0741 → 0742 → 0743 → 0744 → 0745."
  - "No migration, no backward compatibility. Rewrite content files directly."
  - "Agents MUST NOT weaken or remove enforcement rules established by any RFC in this program without a new RFC that supersedes it."
- Acceptance criteria are checkbox items — appropriate for a draft. Evidence annotations will be needed at stamp time (RFC-IMP-02).
- The `nonGoals` section is explicit: no Quote/Contract/Invoice/Settlement, no automatic invoice generation, no multiple strategies per target currency, no min/max price clamps, no price endings other than ...9 and ...99.

## Axis F — Pragmatism

No issues.

- 11 RFCs for a multi-currency pricing module is justified by the domain complexity: 4 new entities, 1 new derivation, materialization, entitlement gating, UI, service, Schema.org mapping. The decomposition follows clean separation of concerns.
- Transactional integration (Quote, Contract, Invoice, Settlement) is correctly deferred to a future phase via `currentUses: prohibited`.
- The `currentUses` field is a pragmatic design — it allows future enablement without model changes.
- Build-time materialization (not runtime conversion) is the correct choice for a static site platform — deterministic, reproducible, cacheable.
- The rate fetcher as a separate service workspace (RFC-0744) is justified — it's a runtime concern (daily rate fetching) that doesn't belong in the build-time PBP compiler.

## Axis G — Blind spots

1. **`services/rate-fetcher-worker` not in frontmatter.** The body mentions `services/rate-fetcher-worker` under "Package impact" but the frontmatter only has `appsImpacted` and `packagesImpacted`. There is no `servicesImpacted` field in the RFC frontmatter schema. The service is mentioned in the body but not machine-readable in frontmatter. Consider adding a `servicesImpacted` field to the RFC schema (separate concern) or documenting the service under `packagesImpacted` with a note.

2. **Charter acceptance transition undefined.** The acceptance criteria are program-level (all 11 RFCs implemented). The charter itself doesn't define when it transitions from `draft` to `accepted` — is it upon architecture review approval, or upon all child RFCs being implemented? Consider clarifying: the charter can be `accepted` upon architecture review (the design is approved), while child RFCs are `accepted` individually as they pass review.

3. **Decimal arithmetic library not named.** The charter mentions "decimal-string arithmetic" (Risk: Decimal arithmetic precision) but doesn't specify the implementation approach. RFC-0739 is expected to handle this, but the charter could mention candidates (e.g., bigint-based decimal, decimal.js, or a custom decimal-string parser) to guide the downstream RFC.

4. **Rate source candidates not named.** The charter defers rate source selection to RFC-0744 but doesn't mention any candidates (ECB, Open Exchange Rates, Fixer.io, etc.). This is intentional flexibility but could lead to analysis paralysis in RFC-0744.

5. **No `liveSpec` field.** The RFC doesn't declare `liveSpec: true` or `liveSpec: <domain>`. A living spec for the multi-currency pricing module would be useful for future reference after implementation. Optional, not blocking.

## Questions for the author

1. When should the charter itself transition from `draft` to `accepted` — upon architecture review approval, or only after all 11 child RFCs are implemented?
2. Should `services/rate-fetcher-worker` be captured in frontmatter, and if so, should a `servicesImpacted` field be added to the RFC schema?
3. Does the `pbp/*@1` namespace permit adding new entity types (like `currency-pricing-policy`) without a namespace bump to `@2`? The charter assumes yes — confirm this is consistent with DNA-55's "additive-only within `@1`" constraint.
