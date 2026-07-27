---
rfcId: RFC-0484
auditId: AUDIT-RFC-0484-01
date: 2026-07-21
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0484

## Verdict: Needs revision

The RFC's core decision is sound and well-scoped — removing a noisy `console.debug` for group directories that legitimately lack manifests. However, two mechanical validation errors (invalid `kind` and `scope` frontmatter values) block `rfc.validate`, and two required sections (`## Design`, `## Rollout`) are missing. These must be fixed before the RFC can transition to `accepted`.

## Mechanical validation (rfc.validate)

**Fail** — 2 errors, 3 warnings:

| Rule | Severity | Message |
| --- | --- | --- |
| V-04 | error | Invalid kind "patch". Must be one of: architecture, contract, command, policy, deprecation |
| V-05 | error | Invalid scope "package". Must be one of: app, workspace |
| V-13 | warning | Missing required section "## Design" |
| V-13 | warning | Missing required section "## Rollout" |
| V-30 | warning | @gogol/ontology is in packagesImpacted but breaksC is not true. If this RFC modifies packages/ontology/src/external-surfaces/, declare breaksC: true (RFC-0480). |

The V-30 warning is a **false positive** — the RFC modifies `src/schemas/manifest-resolver.ts`, not `src/external-surfaces/`. No action needed on V-30.

## Axis A — Structural completeness

- **Missing `## Design` section (V-13 warning).** The RFC has `## Decision` and `## Implementation` but lacks the required `## Design` section. For a single-line change, this section can be brief — it should describe the code structure before/after the change and why the try/catch/continue flow is preserved.
- **Missing `## Rollout` section (V-13 warning).** The RFC does not describe default behavior, adoption path for existing apps, or new-app compliance. For this change, rollout is automatic (no migration needed), but the section should state this explicitly.
- **Decision** is a single decision in present tense — passes.
- **Alternatives considered** is honest with 3 real alternatives and rejection reasons — passes.
- **Risks** addresses the silent-failure concern with mitigation via `section.contract.validate` and `component.contract.validate` — passes.
- **Acceptance criteria** items are checkable and cover the decision's scope — passes.
- **Implementation notes for agents** are explicit behavioral rules — passes.

## Axis B — DNA alignment

- **`satisfies[]` is empty.** The RFC body references DNA-42 ("No schema changes — only logging behaviour") in the Architectural fit section but does not list it in `satisfies[]`. Since the RFC explicitly claims DNA-42 alignment, it should be listed in `satisfies[]` with a brief explanation of how it's preserved (no schema changes, only logging behaviour).
- **`related: [RFC-0072]`** is relevant — RFC-0072 (archetype catalog and section library growth) establishes that group directories are structural containers, not components. The RFC body correctly references this.
- No new DNA invariant is established. No conflict with existing DNA invariants.

## Axis C — Ecosystem fit

- **Package boundaries:** the RFC modifies `@gogol/ontology/src/schemas/manifest-resolver.ts` — correct package, correct module. The manifest-resolver was extracted to this location per the package's AGENTS.md.
- **`packagesImpacted: ["@gogol/ontology"]`** — correct and minimal.
- **`appsImpacted: []`** — correct. No apps are impacted.
- **V-30 warning (breaksC):** false positive. The RFC does not modify `packages/ontology/src/external-surfaces/`. The validator fires defensively for any `packagesImpacted` entry. No action needed.
- **Cosmic naming:** not directly relevant — the RFC does not touch manifests or cosmic names.
- **Command lifecycle:** `commands.proposed/added/changed/removed` are all empty — correct. No commands are changed.
- **Compass sync:** no `docs/*.xml` files need synchronization — the change is logging-only, no contract changes.
- **AGENTS.md updates:** no AGENTS.md files need rule updates — the change is internal to one module.

## Axis D — Forward-only compliance

No issues. The change is a pure removal of a `console.debug` call — no backward compatibility layer, no dual-path, no deprecation grace period. Legacy behaviour (the debug message) is deleted, not maintained behind a flag.

## Axis E — Agent-facing policy

No issues.

- **Status gate:** the RFC has `status: draft` and explicitly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language.
- **Implementation notes** are explicit: remove the `console.debug` in the "no manifest" catch block, keep the YAML parse failure `console.debug`, do not weaken enforcement rules.
- **Anti-fabrication:** not relevant — no content authoring.
- **Storage policy:** not relevant — no persistence changes.

## Axis F — Pragmatism

- **Invalid `kind: patch` (V-04 error).** Valid kinds are: `architecture`, `contract`, `command`, `policy`, `deprecation`. This RFC is closest to `contract` (it changes the behaviour of a package-internal resolver contract) or `architecture` (it changes logging behaviour). The author should pick the most appropriate valid kind. Given that this is a behavioural change to a resolver function, `contract` is the most fitting.
- **Invalid `scope: package` (V-05 error).** Valid scopes are: `app`, `workspace`. Since the RFC impacts a shared package (`@gogol/ontology`), the correct scope is `workspace`.
- **Minimal command surface:** no commands proposed — passes.
- **Lean contracts:** no TypeScript types proposed — passes.
- **Existing patterns:** the RFC extends the existing try/catch/continue flow by removing a log — minimal and correct.
- **Scope discipline:** `packagesImpacted` and `appsImpacted` are accurate. `nonGoals` are explicit and meaningful — passes.

## Axis G — Blind spots

- **Performance:** the change slightly improves build performance (fewer `console.debug` calls during directory scanning). No performance risk.
- **False positives:** the RFC addresses this in Risks — if a component directory is missing its manifest due to a naming error, the resolver will skip it silently. Mitigation: `section.contract.validate` and `component.contract.validate` enforce manifest presence independently. This is adequate.
- **Edge cases:** the RFC considers the naming-error edge case. It does not consider the case where a future group directory is added — but the fix is general (any directory without a manifest is skipped silently), so future group directories are automatically handled.
- **Migration path:** no migration needed — the change is automatic. Existing apps pass without changes.
- **Security/privacy:** not relevant.

## Questions for the author

1. What is the correct `kind` for this RFC? The current value `patch` is invalid. Given that this changes the behaviour of a resolver function in a shared package, is `contract` the intended kind?
2. Should `satisfies: [DNA-42]` be added to the frontmatter? The RFC body claims DNA-42 alignment but does not list it in `satisfies[]`.
3. Should the `## Design` and `## Rollout` sections be added (even briefly), or should the RFC seek a waiver for these sections given the single-line scope of the change?
