---
rfc: RFC-0730
createdAt: 2026-08-07
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 1
uniqueFindings: 3
---

# Design Summit: RFC-0730

## Architect

### Findings

- **A1 (concern):** RFC-0729 (Formula pipe + money formatter) is still in `draft` status — not yet implemented. RFC-0730 depends on RFC-0729 for the `money` pipe formatter used in `resolveFormula`. The implementation plan must sequence RFC-0729 before RFC-0730, or implement both in the same mission. The RFC's rollout section says "All three RFCs can be implemented in sequence within the same mission" but does not make the ordering dependency explicit enough for an agent.

- **A2 (observation):** Removing `presentation` from `offeringSchema` (`.strict()`) is a breaking schema change. Any offering file that still includes `presentation` after migration will fail with `PBP-SCHEMA-VALIDATION`. This is the correct enforcement mechanism — better than the previous approach of keeping the field and relying on `PBP-LEGACY-KEY`/`PBP-MONEY` semantic checks. No concern, just noting the enforcement is now structural (Zod) rather than semantic.

### No concerns

- DNA-4 alignment is correct and well-justified.
- The decision to add `guarantees` to `offeringSchema` as a typed field is the right architectural call — it moves unvalidated data into the schema layer.
- `pbpRelatedOfferingSchema` extension with `label`/`description` is additive and non-breaking.
- `fulfillment` remaining loose-typed is appropriately scoped out.

## Security Engineer

### Findings

No concerns.

- No new trust boundaries are created. The RFC changes how display data is formatted (render-time vs stored), not who can access it.
- `resolveFormula` uses `expr-eval`'s `Parser` which is sandboxed — no arbitrary code execution risk.
- Price data is already public on the website. Moving from stored display strings to render-time formatted canonical values does not change the exposure surface.
- No cookies, client-side storage, or persistence changes.

## QA Engineer

### Findings

- **Q1 (concern):** The acceptance criteria do not include unit tests for the schema changes. The plan should add tests verifying:
  1. `offeringSchema.safeParse()` rejects an offering file with `presentation` field (`.strict()` enforcement).
  2. `offeringSchema.safeParse()` accepts an offering file with `guarantees` field.
  3. `pbpRelatedOfferingSchema.safeParse()` accepts `label` and `description` fields.
  4. Price-card component renders formatted output from structured `PriceCardPricingProp` props via `resolveFormula`.

- **Q2 (question):** What happens if `resolveFormula` returns `{ resolved: false }` inside the price-card component? The RFC doesn't specify the failure rendering behavior. Should the component show a placeholder, hide the price row, or throw? The plan should specify this.

### No concerns

- Acceptance criteria are otherwise checkable by an agent or human.
- Empty states (new site with no offerings) are handled — price-card component simply won't be used.
- The 12 offering files (6 UK + 6 DE) are a manageable test surface.

## Product Manager

### Findings

- **P1 (concern):** RFC-0729 dependency is a blocking prerequisite. RFC-0729 is `draft` — the `money` pipe formatter does not exist in the codebase yet (confirmed: `resolveFormula` in `packages/share/src/formula-eval.ts` already has the pipe syntax and `money` formatter registered, so RFC-0729 appears to be implemented but not yet stamped as `implemented`). The plan should verify RFC-0729's actual implementation status before starting RFC-0730 implementation.

### No concerns

- The problem statement is grounded in real validation errors (`PBP-MONEY`, `PBP-LEGACY-KEY`) and data duplication.
- Rollout impact is internal only — display output should remain visually identical to users.
- Scope is correctly bounded to offerings. Non-goals are explicit.
- Single-site rollout (warpgogol-com) is pragmatic.

## Developer Advocate

### Findings

- **D1 (question):** The RFC doesn't explain how the price-card component obtains the `ContentRefIndex` required by `resolveFormula`. The `resolveFormula(index, expression, lang, defaultLang)` function needs a `ContentRefIndex` object at render time. The RFC shows the component calling `resolveFormula` but doesn't show where the `index` comes from. Is it passed as a prop? Imported from a shared module? Built at page level and injected? The plan should specify the data flow.

- **D2 (observation):** The implementation notes are clear and explicit. The UK-first translation discipline is correctly referenced. The `mission.git.commit` requirement is stated. Agent-facing policy is well-defined.

### No concerns

- The RFC is self-contained for an agent familiar with the PBP ecosystem.
- Terms are well-defined in existing code and documentation.
- The enhanced RFC's TypeScript contracts section provides enough detail for implementation.

## Consensus findings

- **A1 + P1 (2 personas — high priority):** RFC-0729 implementation status must be verified before RFC-0730 implementation begins. RFC-0729 is listed as `draft` in the RFC file, but the codebase already contains the pipe syntax and `money` formatter in `packages/share/src/formula-eval.ts`. The plan should either: (a) confirm RFC-0729 is actually implemented (code exists but status not stamped), or (b) implement RFC-0729 first if the code is not yet present. The `resolveFormula` function with pipe support and `money` formatter registration was found in the codebase, suggesting RFC-0729 may be implemented but not yet stamped.

## Unique findings

- **Q1 (QA — medium priority):** Add unit tests for schema changes to acceptance criteria. The plan should include test steps for `offeringSchema` rejecting `presentation`, accepting `guarantees`, and `pbpRelatedOfferingSchema` accepting display fields.
- **Q2 (QA — medium priority):** Specify failure rendering behavior in the price-card component when `resolveFormula` returns `resolved: false`.
- **D1 (Dev Advocate — medium priority):** Specify the data flow for `ContentRefIndex` to the price-card component. The plan should document whether it's passed as a prop, imported, or built at page level.

## Recommendation

**Proceed to planning with findings incorporated.** The consensus finding (RFC-0729 status verification) and unique findings (tests, failure behavior, data flow) should be addressed in the implementation plan. No RFC revision is needed — these are plan-level details, not RFC-level decisions.

The summit findings will be incorporated into the plan as additional steps and acceptance criteria.

---

*No findings does not mean no issues — it means no issues were found from these five perspectives.*
