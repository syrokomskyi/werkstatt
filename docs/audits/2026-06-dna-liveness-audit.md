# DNA liveness audit — 2026-06

**Scope:** all 38 entries in the canonical registry `docs/architecture-dna.md`. **Method:** `dna.registry.validate` (RFC-0158, incl. the RFC-0161 DNA-REG-05 enforcement check) + manual review. **Re-run:** `node packages/werkstatt/bin/werkstatt.mjs run dna.registry.validate`.

## Why

A DNA invariant is only real if it is (a) actually enforced and (b) true of the live apps. The 2026-06 RFC audit found the registry had drifted (DNA-27..38 unrecorded); this follow-up asks the next question — **are the recorded invariants live?** It separates genuine enforced invariants from foundational axioms, from feature-bets that were elevated to "DNA" prematurely.

## Classification of the 38

| Class | DNA | Notes |
| --- | --- | --- |
| **Foundational axioms** (pre-RFC) | 1, 2, 3, 4, 6, 7, 10, 11 | Monorepo, pnpm/Turbo, Astro, content-canonical, kebab-case, thin routes, design tokens, language mirroring. Not attributable to an RFC. |
| **Active, enforced** (enforcer registered **and** pipelined, or structural) | 5, 8, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 35, 36, 37, 38 | The section/content/ontology/i18n/onboarding spine that serves the client-site pipeline. |
| **Active but UNDER-ENFORCED** (enforcer registered, **not** pipelined) | **9, 13, 20** | Feature-graph + business-profile validators exist but run in no `*_PIPELINE` → not checked by `build.check`. See findings. |
| **Policy, no dedicated enforcer** | 12, 14 | Rely transitively on the feature-graph validators (DNA-9/13). DNA-12 has since been merged into DNA-9 (2026-07-14); it is retained for traceability only. |
| **Reclassified to features** (RFC-0161) | 27, 28, 29, 30, 31, 32, 33, 34 | Growth + cosmic-passport layers — governed by RFC-0027/0028 as features, not binding DNA (studio priority is the client-site pipeline). Exempt from enforcement. |

## Findings

- **F1 — feature-graph enforcement is not in CI (DNA-9, DNA-12, DNA-13).** `feature.graph.validate`, `feature.links.validate`, and `feature.projections.validate` are registered but wired into **no** pipeline. So the visibility contract (DNA-9, which now also covers the former DNA-12 "centralized visibility control"), and the "disabled content must not leak" invariant (DNA-13) are **not actually enforced** on `build.check`. This is the single biggest liveness gap. _(Note: DNA-12 was merged into DNA-9 on 2026-07-14; both names are retained here for historical traceability.)_
- **F2 — business-profile completeness is not in CI (DNA-20).** `business.profile.validate` is registered but not pipelined. The "business layer is the canonical site description" invariant isn't gated at build. (Adjacent business gates _are_ live: `content.business.validate`, `business.projection.validate`.)
- **F3 — RESOLVED by reclassification (RFC-0161).** DNA-31's absolute claim ("every build emits a signed cosmic passport") was false — `passportEnabled` is set in 0 of 2 live apps — and DNA-28 named a non-existent `growth.funnels.validate`. Both are now features, not binding DNA, so the contradiction is gone rather than papered over.
- **F4 — the guard is now machine-enforced.** `dna.registry.validate` DNA-REG-05 surfaces F1/F2 as advisory warnings on every run and will catch any future DNA whose enforcer is absent (error) or unpipelined (warning). The canonical enforcer marker is the literal phrase ``Enforced by `cmd` ``.

## Recommendations

1. **Decide on F1/F2 (the under-enforced active DNA).** Either:
   - **Wire** `feature.graph.validate` / `feature.links.validate` / `feature.projections.validate` and `business.profile.validate` into `APPS_CHECK_AUTHOR_PIPELINE` so the invariants are real (preferred — but run them against the 2 live apps first; they may surface pre-existing debt); **or**
   - **Downgrade** the affected entries' wording from "Enforced by" to "Intended contract (not yet gated)" so the registry stops claiming enforcement it doesn't have. Do not leave them as silent prose claims.
2. **After F1/F2 are resolved, flip DNA-REG-05 "not pipelined" from warning → error** (the ratchet), so an active DNA can never again claim an unenforced contract.
3. **Keep the reclassified layer (DNA-27..34) as features.** Re-promote a specific item to a binding invariant only via a feature RFC that also wires a real, pipelined enforcer.

## Current state

`dna.registry.validate`: **0 errors, 6 advisory warnings** — all DNA-REG-05 (DNA-9 ×3, DNA-13 ×2, DNA-20 ×1), i.e. exactly findings F1+F2. Registry is contiguous (DNA-1..38) and every entry has provenance.
