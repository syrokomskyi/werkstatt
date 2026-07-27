---
rfcId: RFC-0545
auditId: AUDIT-RFC-0545-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0545

## Verdict: Needs revision

The RFC proposes a redesign of the `forge-bootstrap` skill but does not acknowledge that the skill already exists, registered, and synced. The proposed frontmatter uses an invalid `category: lifecycle` (the enum allows only `fo | shared | meta`), and the proposed path `skills/fo/forge-bootstrap/` conflicts with the existing `skills/meta/forge-bootstrap/`. These are blocking ecosystem-fit and structural issues that must be fixed before implementation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0545 --json` returns zero violations.

## Axis A — Structural completeness

- **Factual error in Context** — line 87 states "Today there is no such skill." This is false. `forge-bootstrap` exists at `@/home/syrokomskyi/projects/webgogol/webgogol-4/packages/forge/skills/meta/forge-bootstrap/SKILL.md:1-62`, is registered in `FORGE_SKILLS` at `@/home/syrokomskyi/projects/webgogol/webgogol-4/packages/forge/src/registry.ts:325-331`, and is referenced by `forge.create`'s `nextSteps` at `@/home/syrokomskyi/projects/webgogol/webgogol-4/packages/forge/src/onboarding/create.ts:56`. The Context must describe the existing skill and its limitations, not claim nonexistence.
- **Rollout step 2 is wrong** — line 193 says "Add `forge-bootstrap` to `FORGE_SKILLS`". It is already there. This must be "Update the existing `forge-bootstrap` entry in `FORGE_SKILLS`" with the specific field changes (`concerns`, `description`, etc.).
- **Rollout step 1 proposes wrong path** — line 192 says "Create `packages/forge/skills/fo/forge-bootstrap/SKILL.md`". The existing skill is at `skills/meta/forge-bootstrap/SKILL.md`. The RFC must say "Replace the existing `skills/meta/forge-bootstrap/SKILL.md`".
- **Missing frontmatter fields** — the proposed frontmatter (lines 113-121) omits `bindings` and `languagePolicy` that the existing skill has. The RFC should specify whether these are kept, changed, or removed. If the redesigned skill no longer needs `bindings.optional: [commands.validateRfc]`, that should be stated explicitly.
- **`concerns` change not acknowledged** — the existing skill has `concerns: code-mutation`; the RFC proposes `concerns: content-mutation`. This is the right level for the redesigned skill (writes YAML + MD, not code), but the RFC should explicitly note the change and justify it.

## Axis B — DNA alignment

- **DNA-54 alignment is correct** — the skill fills binding keys (`typecheck`, `test`, `scopedBuild`) in `forge.yaml` rather than hardcoding command strings in skill bodies. This is the human-in-the-loop complement to `forge.init`'s machine defaults (RFC-0540), exactly as DNA-54 intends.
- No issues.

## Axis C — Ecosystem fit

- **FAIL: `category: lifecycle` is not a valid value.** `ForgeSkillEntry.category` at `@/home/syrokomskyi/projects/webgogol/webgogol-4/packages/forge/src/registry.ts:35` allows only `"fo" | "shared" | "meta"`. The registry test at `@/home/syrokomskyi/projects/webgogol/webgogol-4/packages/forge/src/tests/registry.test.ts:33-38` enforces this. `lifecycle` would fail `forge.skill.validate` (SKILL-01) and the registry test. The RFC must use `category: meta` (the existing value) or propose extending the enum in a separate RFC.
- **FAIL: path prefix mismatch.** The proposed path `skills/fo/forge-bootstrap/SKILL.md` would fail the registry test at `@/home/syrokomskyi/projects/webgogol/webgogol-4/packages/forge/src/tests/registry.test.ts:68-72` which checks `path.startsWith(`skills/${category}/`)`. If category is `meta`, path must be `skills/meta/forge-bootstrap/SKILL.md`. `forge-bootstrap` is not a `fo-` prefixed skill.
- **AGENTS.md update not identified** — `@/home/syrokomskyi/projects/webgogol/webgogol-4/packages/forge/AGENTS.md` states "3 meta skills" in the Architecture section. The RFC does not identify this file as needing update if the skill description changes.
- **`forge.create` nextSteps confirmation** — the RFC correctly states that `forge.create`'s `nextSteps` already point to `/forge-bootstrap` (line 195). Verified at `@/home/syrokomskyi/projects/webgogol/webgogol-4/packages/forge/src/onboarding/create.ts:56`.

## Axis D — Forward-only compliance

- **Dual-path risk** — the RFC proposes creating a new file at `skills/fo/forge-bootstrap/SKILL.md` without removing the existing `skills/meta/forge-bootstrap/SKILL.md`. This would leave two skill files with the same name, breaking the registry's no-duplicate-names test. The RFC must explicitly state that the existing file is replaced, not duplicated.
- No other issues — the redesign replaces the old skill in place, which is forward-only.

## Axis E — Agent-facing policy

- No issues. The RFC has proper MUST NOTs in implementation notes, no self-authorizing language, and correct status gate (`draft`).

## Axis F — Pragmatism

- **New category is unnecessary** — introducing `category: lifecycle` would require changing `ForgeSkillEntry`, the registry test, `forge.skill.validate`, and `packages/forge/AGENTS.md` — all for zero semantic gain. `meta` is the correct category for bootstrap/lifecycle skills (alongside `skill-create` and `port-to-forge`).
- **Transplant scope is large but justified** — the operator explicitly requested both modes. The transplant mode is a significant feature, but splitting it into a follow-up RFC is not required since the modes share the same skill file and guardrails.

## Axis G — Blind spots

- **Transplant with no recognizable stack** — the RFC says the skill reads `package.json` / `tsconfig.json` / `Cargo.toml` (line 144) but doesn't specify what happens if none are found. Does it fall back to greenfield interview? Does it refuse? The failure modes section (line 187) only covers "unreadable" source, not "unrecognized" source.
- **Malformed `forge.yaml`** — the guardrail says the skill refuses without `forge.yaml` (line 153), but doesn't address the case where `forge.yaml` exists but is malformed (invalid YAML, missing `bindings` section).
- **Idempotency not explicit** — the failure modes section says "Stack binding already non-null → skill skips it" (line 186), which implies idempotency, but the RFC should state explicitly whether re-running the skill is supported and what happens to `PREFERENCES.md` on re-run (overwrite? merge? skip?).

## Questions for the author

1. The `forge-bootstrap` skill already exists at `skills/meta/forge-bootstrap/SKILL.md` and is registered in `FORGE_SKILLS`. Why does the RFC claim it doesn't exist, and what is the migration path for the existing skill file and registry entry?
2. `category: lifecycle` is not in the `ForgeSkillEntry` enum (`fo | shared | meta`). Should the RFC use `meta` (the existing value), or is there a reason to extend the enum?
3. The proposed path `skills/fo/forge-bootstrap/` would fail the registry's path-prefix test. Should the skill stay at `skills/meta/forge-bootstrap/`?
