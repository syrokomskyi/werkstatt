---
reviewId: REVIEW-CODE-2026-08-02-03
date: 2026-08-02
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 8cb9de6...HEAD
filesReviewed:
  - packages/forge/profiles/editframe-html.yaml
  - packages/forge/profiles/editframe-html-templates/composition.html
  - packages/forge/profiles/editframe-html-templates/composition-agents.md
  - packages/forge/src/tests/editframe-profile.test.ts
  - packages/forge/src/tests/profile-schema.test.ts
  - packages/forge/AGENTS.md
  - docs/rfcs/rfc-0641-editframe-video-stack-profile.md
---

# Code Review: 8cb9de6...HEAD (RFC-0641 Editframe Video Stack Profile)

### Verdict: Needs revision

One finding on Axis F: the `editframe-html-templates/composition.html` file is not referenced by the profile YAML or any documentation, making it an orphan artifact. The profile's `firstWorkspace` has inline content for the scaffold output, and `workspaceTypes[].agentsMdTemplate` references `composition-agents.md`, but nothing references `composition.html`.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge run build:check` passes, 417 tests pass, `rfc.validate --id RFC-0641` passes.

### Axis A — Structural correctness

No issues. Profile YAML follows existing profile patterns (`astro-typescript-turborepo`, `phaser-turborepo`, `forge-shell`). Test file has proper Compass scaffolding (`MODULE_CONTRACT`, `CHANGE_SUMMARY`). No magic numbers, no dead code, no `any` types. The `profile-schema.test.ts` change is minimal and correctly guards domain field assertions with `if (profile.id !== "editframe-html")`.

### Axis B — DNA alignment

No issues. DNA-54 (Forge bindings contract): the profile provides domain-specific values (`editframe render`, `editframe check`) that `forge.create` writes into `forge.yaml` bindings. Skills reference `ref(bindings.commands.produce)` instead of hardcoding. The profile is a data file, not a skill body — no hardcoded literals in instruction lines.

### Axis C — Ecosystem fit

No issues. Profile is in `packages/forge/profiles/` — correct location. `packages/forge/AGENTS.md` updated with `editframe-html` in shipped profiles list. No new commands. No Compass XML changes needed. The `profiles/` directory is included in `package.json` `files` field, so the templates subdirectory ships with the npm package.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy code. The `profile-schema.test.ts` update is a direct change from 3 to 4 profiles with a conditional guard — no parallel interpretation.

### Axis E — Agent-facing clarity

No issues. `editframe-profile.test.ts` has `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Profile YAML and template files are data files, not source code — no scaffolding required. Test names are descriptive. No ungrounded assertions.

### Axis F — Pragmatism

**Finding F-1:** `packages/forge/profiles/editframe-html-templates/composition.html` is not referenced by the profile YAML or any documentation. The profile's `firstWorkspace.files` has inline `composition.html` content for scaffolding, and `workspaceTypes[].agentsMdTemplate` references `composition-agents.md`, but nothing references the standalone `composition.html` template file. Operators have no way to discover it. Either reference it from the profile (e.g., as a `templateFile` field in the workspace type) or document it in `composition-agents.md` as a reference template for new compositions.

### Axis G — Blind spots

No issues. Performance: profile loading is a single file read — negligible. False positives: VIDEO-01 checks filename format only; enforcement is deferred to follow-up RFCs. Edge cases: multiple profiles with `domain: video` are disambiguated by `detect.anyOf` markers. Migration: not applicable — new profile, no existing projects affected.

### Spec compliance

| Requirement from RFC-0641 | Status | Evidence |
| --- | --- | --- |
| Profile YAML exists and parses | Done | `packages/forge/profiles/editframe-html.yaml:1`, 417 tests pass |
| domain: video, register: creative | Done | `editframe-html.yaml:7-8` |
| Terminology map (artifact, module, operator) | Done | `editframe-html.yaml:10-16` |
| Artifacts with composition extensions and CLI commands | Done | `editframe-html.yaml:18-30` |
| workspaceTypes with detection markers | Done | `editframe-html.yaml:34-39` |
| detect.anyOf with editframe.config.* | Done | `editframe-html.yaml:5-6` |
| At least 3 VIDEO-* invariants | Done | `editframe-html.yaml:44-53` (VIDEO-01, VIDEO-02, VIDEO-03) |
| Workspace layout with compositions/ | Done | `editframe-html.yaml:55` |
| First workspace template with sample HTML | Done | `editframe-html.yaml:151-194` |
| forge create --profile scaffolds project | Done | workspace.dirs/files/firstWorkspace declared; forge.create --profile support in RFC-0640 |
| Unit test verifies profile parses | Done | `editframe-profile.test.ts`, 417 tests pass |
| AGENTS.md updated | Done | `packages/forge/AGENTS.md:99` |
| rfc.validate passes | Done | `rfc.validate --id RFC-0641 --json` — status: pass |

### Questions for the author

1. Should the `editframe-html-templates/composition.html` file be referenced by the profile YAML (e.g., as a `templateFile` in the workspace type) or documented in `composition-agents.md` so operators can discover it?
