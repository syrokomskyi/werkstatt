---
rfcId: RFC-0771
auditId: AUDIT-RFC-0771-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0771

## Verdict: Needs revision

The RFC provides a solid normative module map for the engine consolidation, but has significant gaps: a complete package (`site-kernel-check-warpgogol`) and multiple `site-kernel-handoff/src/` subdirectories (`nachweis/`, `subdomain/`, `dns/`, `behavior-snapshot/`, `migrators/`) are unaccounted for; `agent-gate` has stack-specific dependencies (`astro`, `@warpgogol/share`, `@warpgogol/ontology`, `@warpgogol/integration`) that contradict the engine's stack-agnostic invariant; and `satisfies[]` omits DNA-51/52/53 which the RFC body explicitly references.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **A-1 (site plugin section lacks table).** The "Into the site plugin" section (line 112) is a single sentence: "`site-kernel-astro`, `site-kernel-checks`, `site-kernel-codegen`, `site-kernel-content`, `site-kernel-onboarding`, `site-kernel-audit`, concrete Cloudflare deploy adapter, and all site domain packages." For a self-described "normative inventory", this is less precise than the engine table. Each package should get its own row with source, notes, and rationale (e.g. why `site-kernel-audit` is plugin, not engine).
- **A-2 (workshop-local section lacks table).** The "Stays workshop-local" section (line 116) is similarly a one-liner. A table with rationale per item would match the engine section's normative level.
- **A-3 (`packagesImpacted` empty).** `packagesImpacted: []` (line 49) is empty, but this RFC impacts every `packages/os/*` package, `packages/fingerprint`, `packages/agent-gate`, `packages/share`, `packages/ontology`. The field should list at least the directly impacted packages.
- **A-4 (`versionBump` should be `none`).** The RFC is a specification with no code changes (`nonGoals`: "No physical code moves — that is RFC-0772"). `versionBump: patch` implies a code-level SemVer delta. Charter RFC-0769 uses `versionBump: none` for the same reason. This RFC should match.

## Axis B — DNA alignment

- **B-1 (`satisfies[]` omits referenced DNA invariants).** The RFC body references DNA-51 (line 103, 127), DNA-52 (line 127), DNA-53 (line 106, 127), and DNA-64 (line 126) in the "Architectural fit" section, but `satisfies[]` only lists `DNA-1` and `DNA-2`. DNA-51, DNA-52, and DNA-53 exist in `docs/architecture-dna.md` and are directly relevant — the RFC moves the modules that enforce them into the engine. They should be in `satisfies[]`.
- **B-2 (DNA-64 forward reference).** The RFC references "DNA-64 (RFC-0769)" in the "Architectural fit" section (line 126), but DNA-64 does not exist in `docs/architecture-dna.md` yet (the file ends at DNA-63). RFC-0769 is still `draft`. This is a forward dependency — RFC-0771 cannot be `accepted` until RFC-0769 is `accepted` and DNA-64 is appended. The RFC should note this dependency explicitly (e.g. in `related[]` or in the rollout section).

## Axis C — Ecosystem fit

- **C-1 (`site-kernel-check-warpgogol` missing from module map).** `packages/os/site-kernel-check-warpgogol` exists in the codebase, depends on `@warpgogol/site-kernel-astro`, `@warpgogol/site-kernel-content`, `@warpgogol/check-core`, `@warpgogol/check-runner-node`, and `@warpgogol/share`. It is clearly site-plugin territory but is not mentioned in any of the three sections (engine, plugin, workshop-local). The success signal says "Module map covers every packages/os/* module" — this package is uncovered.
- **C-2 (missing `site-kernel-handoff/src/` subdirectories).** The engine module table lists `mission/`, `sternsystem/`, `release/`, `leitstand/`, `bordbuch/`, `notausgang/`, `artifact-store/`, `evidence/`, `deploy/`, `identity/`, `werkstatt/` from `site-kernel-handoff/src/`. However, the actual directory also contains: `nachweis/` (19 items — N3 verification, RFC-0707), `subdomain/` (6 items), `dns/` (12 items), `behavior-snapshot/` (4 items), `migrators/` (86 items — forward migrator registry). These are not mentioned anywhere in the RFC. The "Decision protocol for unlisted files" (line 152) covers individual files, not entire subdirectories — these should be explicitly classified.
- **C-3 (`agent-gate` has stack-specific dependencies).** The RFC puts `agent-gate/` entirely into the engine (line 107). However, `packages/agent-gate/package.json` declares `astro: ^7.1.6` as a dependency, and `src/astro.ts` imports from `astro`. The `/astro` subpath export is stack-specific. Cross-cutting rule 1 says "No engine module imports Astro, sharp, playwright, or any stack-specific dependency" and success signal 2 says "No engine module imports Astro...". The RFC must address this: either split `agent-gate` (root entry → engine, `/astro` subpath → site plugin) or explain how the astro dependency is resolved.
- **C-4 (`agent-gate` depends on non-engine `@warpgogol/*` packages).** `agent-gate` imports from `@warpgogol/integration`, `@warpgogol/ontology`, and `@warpgogol/share` (18 import sites across 10 files). Cross-cutting rule 1 says "Zero `@warpgogol/*` imports outside the engine". These three packages are not in the engine module map. The RFC's rule 2 addresses `share`/`ontology` symbol-level splits, but `@warpgogol/integration` is not mentioned at all. The RFC must classify `integration` and explain how agent-gate's dependencies are resolved.
- **C-5 (`site-kernel-deploy` is not "adapter framework only").** The RFC says `deploy/` comes from `.../src/deploy` + `packages/os/site-kernel-deploy` (adapter framework only) (line 101). However, `site-kernel-deploy/src/client-export.ts` is 16KB of concrete implementation (`runClientExport`, gitignore parsing, hard exclusions per RFC-0007). This is not a framework — it's a working command module. The RFC should classify `client-export.ts` explicitly: is it engine (stack-agnostic file copy logic) or plugin (site-specific export rules)?

## Axis D — Forward-only compliance

No issues. The RFC explicitly defers physical moves to RFC-0772 and states "No legacy" in cross-cutting rules. No compatibility shims or dual-paths proposed.

## Axis E — Agent-facing policy

- No self-authorizing language found.
- Implementation notes are standard template.
- No NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

- **F-1 (duplicate of A-3).** `packagesImpacted: []` should list the impacted packages for downstream tooling and agent context.
- **F-2 (duplicate of A-4).** `versionBump: patch` should be `none`.
- **F-3 (changelog split underspecified).** The RFC says `changelog/` (framework) goes into the engine with "site-specific renderers move to the site plugin" (line 108). `site-kernel-changelog/src/` has `changelog-command.ts` (8.5KB) and `changelog/` (15 items). The RFC doesn't specify which parts are framework vs. renderer. This ambiguity will force ad hoc decisions during RFC-0772 — exactly what this RFC exists to prevent.

## Axis G — Blind spots

- **G-1 (`nachweis/` subsystem unclassified).** `site-kernel-handoff/src/nachweis/` has 19 items implementing N3 verification (RFC-0707): TSA adapters, Ed25519 signing, signature verification. These involve external service calls (FreeTSA), cryptographic keys, and evidence artifacts. The RFC doesn't classify this subsystem. Is it engine (lifecycle/evidence concern) or plugin (site-specific verification)? The decision protocol (line 152) doesn't clearly answer this — nachweis doesn't import Astro, but it does interact with site-specific evidence formats.
- **G-2 (`migrators/` registry unclassified).** `site-kernel-handoff/src/migrators/` has 86 items — the forward migrator registry. These are version-specific migration scripts. The RFC doesn't mention them. Are they engine (part of the handoff/version-compare lifecycle) or do they contain site-specific migrations that belong in the plugin?
- **G-3 (`share`/`ontology` split complexity).** The RFC acknowledges `share` has 191 items (line 166) but doesn't estimate the split for `ontology/operations` which has 10 schema domains (handoff, sternsystem, werkstatt, mission, release, leitstand, notausgang, materialization, artifact-store, naming-policy). Rule 2 says "operations schemas → engine; UI taxonomy, page/content schemas → site plugin" — but `ontology` also has `archetypes/`, `cosmic/`, `shared-section-props/`, `external-surfaces/` which are UI-specific and go to the plugin. The split is clear in principle but the RFC should acknowledge the `ontology` split is multi-dimensional, not just `operations` vs. `schemas`.

## Questions for the author

1. How should `agent-gate` be handled? Its `package.json` declares `astro` as a dependency and `src/astro.ts` imports from `astro` — this violates the "no stack-specific imports" engine invariant. Should the `/astro` subpath move to the site plugin, or should `agent-gate` stay entirely in the site plugin?
2. Where do `nachweis/`, `subdomain/`, `dns/`, `behavior-snapshot/`, and `migrators/` go? These are significant subdirectories of `site-kernel-handoff/src/` (86 items in `migrators/` alone) that are not mentioned in the module map.
3. Why is `site-kernel-check-warpgogol` not in the module map? It exists as a `packages/os/*` package with clear site-plugin dependencies — it should be explicitly classified.
4. Should `satisfies[]` include DNA-51, DNA-52, and DNA-53? The RFC body references them in "Architectural fit" as invariants whose modules move into the engine — this is an "extends" or "protects" relationship.
5. Is `versionBump: patch` correct for a specification-only RFC with no code changes? RFC-0769 (also a charter/specification) uses `versionBump: none`.
