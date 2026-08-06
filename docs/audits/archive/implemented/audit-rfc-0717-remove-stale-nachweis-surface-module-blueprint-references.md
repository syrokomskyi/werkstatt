---
rfcId: RFC-0717
auditId: AUDIT-RFC-0717-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: rejected
---

# Audit: RFC-0717

## Verdict: Rejected

RFC-0717 claims to fix validation failures caused by stale Nachweis blueprint references in `system.md`, but the actual codebase state contradicts the RFC's factual premise. The workpiece `system.md` already has no `blueprints` key under `surface.modules.nachweis` and no Nachweis entries in `surface.blueprints`. The cache clone has `blueprints: [nachweis]` (a single entry, not the three the RFC claims), and `nachweis` is NOT listed in `surface.blueprints` — so the claimed `blueprint.validate` and `entitlement.module.validate` failures do not occur. The RFC is solving a problem that does not exist in the current codebase.

### Mechanical validation (rfc.validate)

**Fail** — 1 error, 8 warnings:

- **V-24 (error):** Architecture RFC created 2026-08-06 (>= 2026-07-07) must declare at least one DNA invariant in `satisfies` (RFC-0331). `satisfies: []` is empty.
- **V-13 (warning ×7):** Missing required sections: `## Problem`, `## Architectural fit`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Acceptance criteria`, `## Implementation notes for agents`.
- **V-19 (warning):** `amends` includes RFC-0708, but RFC-0708's `amendedBy` does not include RFC-0717.
- **V-20 (warning):** Unknown frontmatter key `supersedesBy` — should be `supersededBy`.

### Axis A — Structural completeness

1. **7 required sections missing (V-13):** The RFC has `## Context`, `## Decision`, `## Justification`, `## Design`, `## Consequences`, `## Evolution` — but is missing `## Problem`, `## Architectural fit`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Acceptance criteria`, `## Implementation notes for agents`. The `successSignals` in frontmatter are not a substitute for `## Acceptance criteria`.

2. **No acceptance criteria:** The RFC has `successSignals` in frontmatter (4 items) but no `## Acceptance criteria` section with checkable criteria. An implementing agent cannot verify completion without checkable criteria.

3. **No implementation notes:** No `## Implementation notes for agents` section. An agent picking this up has no behavioral rules.

### Axis B — DNA alignment

1. **`satisfies: []` is empty (V-24 error):** The RFC is `kind: architecture`, created 2026-08-06, and must declare at least one DNA invariant in `satisfies[]` per RFC-0331. The RFC references DNA-24 in `related[]` and discusses it in `## Justification` — it should be in `satisfies[]`.

2. **DNA-24 relationship is real but misclassified:** The RFC correctly identifies that Nachweis pages follow DNA-24 (block-declarative pages) and that declaring surface blueprints for block-declarative pages is a category error. But DNA-24 is in `related[]`, not `satisfies[]`. The RFC protects DNA-24 by removing contradictory configuration — this is a `satisfies` relationship.

### Axis C — Ecosystem fit

1. **`supersedesBy` should be `supersededBy` (V-20):** Line 14 has `supersedesBy:` — the correct field name is `supersededBy`. This is a frontmatter schema violation.

2. **V-19: `amends` not reciprocated:** `amends: [RFC-0708]` is declared, but RFC-0708's `amendedBy` field does not include RFC-0717. This must be fixed in both RFCs before validation can pass.

3. **`packagesImpacted: []` is incomplete:** The RFC changes `system.md` in a site workspace. While `appsImpacted: [warpgogol-com]` is correct, the empty `packagesImpacted` is technically accurate (no package code changes) but the RFC should clarify that the change is content-only in the site workspace.

### Axis D — Forward-only compliance

No issues. The RFC removes dead configuration — no compatibility shim, no dual-path, no backward compatibility layer.

### Axis E — Agent-facing policy

1. **No acceptance criteria section:** Without `## Acceptance criteria`, an implementing agent has no checkable criteria to verify. The `successSignals` in frontmatter are descriptive, not checkable.

2. **No implementation notes:** Without `## Implementation notes for agents`, an agent has no behavioral rules for implementing the change.

3. **No NEEDS CLARIFICATION markers.** Not applicable.

### Axis F — Pragmatism

1. **Critical: the RFC's factual premise is incorrect.** The RFC claims:
   - "RFC-0708 also declared a `surface.modules.nachweis` entry with `blueprints: [nachweis-list, nachweis-detail, nachweis-verify]`" — **FALSE**. The workpiece `system.md` (mission m000033) has NO `blueprints` key under `surface.modules.nachweis`. The cache clone has `blueprints: [nachweis]` (a single entry, not three).
   - "listed those same IDs in `surface.blueprints`" — **FALSE**. Neither the workpiece nor the cache clone lists `nachweis-list`, `nachweis-detail`, or `nachweis-verify` in `surface.blueprints`. Both have `surface.blueprints: [website-local, website-service, offer, ratgeber]`.
   - "`blueprint.validate` fails with `system.md surface.blueprints lists "nachweis" but no such Blueprint exists`" — **UNVERIFIABLE**. The error at `@/packages/os/site-kernel-checks/src/blueprint.ts:157` only fires for IDs listed in `surface.blueprints`. Since `nachweis` is not in `surface.blueprints`, the error does not fire.
   - "`entitlement.module.validate` fails with `module-context-missing`" — **UNVERIFIABLE**. The check at `@/packages/os/site-kernel-checks/src/entitlement-module.ts:65-76` iterates over `declaredBlueprints` (from `surface.blueprints`), not module blueprints. Since `nachweis` is not in `surface.blueprints`, the check is never reached.

2. **The RFC-0708 plan vs actual implementation diverged:** The RFC-0708 plan (`@/docs/plans/archive/implemented/plan-rfc-0708-...md:181-182`) instructed adding `blueprints: [nachweis-list, nachweis-detail, nachweis-verify]` and listing them in `surface.blueprints`. But the actual implementation either didn't follow this or was already corrected. The workpiece already has the clean state the RFC proposes.

3. **The cache clone has a minor stale entry:** `surface.modules.nachweis.blueprints: [nachweis]` in the cache clone is dead config (no `nachweis.yaml` exists), but it doesn't cause validation errors because `nachweis` is not in `surface.blueprints`. This is a cosmetic issue, not a functional one.

### Axis G — Blind spots

1. **No verification of current state:** The RFC was written based on the RFC-0708 plan, not the actual `system.md` state. The author did not verify whether the plan was followed or whether the claimed validation failures actually occur.

2. **No edge cases considered:** What happens if `surface.modules.nachweis` has no `blueprints` key? The RFC doesn't address this because it assumes the key exists.

3. **No migration path needed:** The RFC correctly identifies this as a cleanup, but since the workpiece is already clean, the only remaining action is syncing the cache clone (removing `blueprints: [nachweis]` from `surface.modules.nachweis`).

### Questions for the author

1. **Did you verify the actual `system.md` state before writing this RFC?** The workpiece already has no `blueprints` key under `surface.modules.nachweis` and no Nachweis entries in `surface.blueprints`. The RFC's premise is factually incorrect.
2. **Did you run `blueprint.validate` and `entitlement.module.validate` to confirm the claimed failures?** The validators iterate over `surface.blueprints`, which does not include Nachweis entries — so the claimed errors do not occur.
3. **Is this RFC still needed?** The workpiece is already in the desired state. The only remaining issue is the cache clone's `blueprints: [nachweis]` entry, which is dead config but doesn't cause validation errors. This could be a direct fix (content data correction) rather than an RFC.
