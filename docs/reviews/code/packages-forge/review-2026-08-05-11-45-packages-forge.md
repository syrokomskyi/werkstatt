---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 03a9d434...HEAD
filesReviewed:
  - packages/forge/src/profiles/profile-schema.ts
  - packages/forge/src/onboarding/invariant-engine.ts
  - packages/forge/os/core/handlers/invariant-engine.test.ts
  - packages/forge/os/core/handlers/lifecycle-handlers.test.ts
  - packages/forge/profiles/editframe.yaml
  - packages/forge/profiles/editframe-templates/composition.tsx
  - packages/forge/profiles/editframe-templates/composition-agents.md
  - packages/forge/skills/fo/ef-composition/SKILL.md
  - packages/forge/skills/fo/ef-dev-server/SKILL.md
  - packages/forge/skills/fo/ef-editor-gui/SKILL.md
  - packages/forge/skills/fo/ef-webhooks/SKILL.md
  - packages/forge/skills/fo/ef-brand-video-generator/SKILL.md
  - packages/forge/skills/fo/ef-motion-design/SKILL.md
  - packages/forge/skills/fo/ef-onboard/SKILL.md
  - packages/forge/skills/fo/ef-composition-review/SKILL.md
  - packages/forge/skills/fo/ef-render-verify/SKILL.md
  - packages/forge/src/tests/editframe-profile.test.ts
  - packages/forge/src/tests/profile-schema.test.ts
  - packages/forge/src/tests/agents-generate-domain.test.ts
  - packages/forge/src/tests/fixtures/agents-generate-business-before.txt
  - packages/forge/AGENTS.md
---

# Code Review: 03a9d434...HEAD (RFC-0694 implementation)

### Verdict: Needs revision

The implementation is structurally sound and all mechanical checks pass (626/626 tests, profile.validate, skill.validate). However, two findings require attention: a potential regex backtracking issue in the `attribute-pattern` engine and a missing `source` field in vendored skill frontmatter.

### Mechanical floor

Pass — `build:check`, `test` (626/626), `forge.profile.validate` (4/4), `forge.skill.validate` (0 violations).

### Axis A — Structural correctness

- **`elementRegex` lastIndex not reset between files** (`invariant-engine.ts:194`): The `elementRegex` is created with `"gi"` flags outside the file loop. `RegExp.exec` with `g` flag maintains `lastIndex` state. After processing one file, `lastIndex` may be non-zero when starting the next file, causing skipped matches. The `attrRegex` (line 195) is created outside the loop but without `g` flag, so it's fine. **Fix**: reset `elementRegex.lastIndex = 0` before each file, or move the `new RegExp` inside the file loop.

### Axis B — DNA alignment

No issues. The diff correctly replaces `html-attribute-pattern` with `attribute-pattern` and updates all related schemas and tests. No DNA invariants are weakened.

### Axis C — Ecosystem fit

- **Skill count in AGENTS.md not updated** (`packages/forge/AGENTS.md:8`): The AGENTS.md still says "29 fo skills + 4 shared + 3 meta = 36 skills". With 6 new ef-* skills, the count should be "35 fo skills + 4 shared + 3 meta = 42 skills". The root `AGENTS.md` also references "36 skills" in the ownership table.

### Axis D — Forward-only compliance

No issues. `html-attribute-pattern` is fully removed — no backward compatibility layer. The profile rename is clean.

### Axis E — Agent-facing clarity

- **Vendored skills missing `source` field**: The RFC (line 298) states "vendored skills carry a `source` reference in frontmatter." The 4 skills with canonical URLs should declare `source: https://editframe.com/skills/<name>.md` in frontmatter. The 2 skills without canonical URLs should declare `source: domain-knowledge`. None of the 6 new skill files include a `source` field.

### Axis F — Pragmatism

No issues. The `elements` array generalization is minimal and extensible. The profile YAML is well-structured.

### Axis G — Blind spots

- **`elementRegex` with `[^>]*` on large files**: The `<(${elementAlternation})[^>]*>` pattern with `gi` flags could cause slow backtracking on very large JSX files with deeply nested generics or type annotations in angle brackets. This is a low risk for composition `.tsx` files (typically small), but worth noting. The `[^>]*` is the simplest approach and acceptable for the video composition domain.

### Spec compliance

| Requirement from the RFC | Status | Evidence |
| --- | --- | --- |
| `editframe.yaml` with `id: editframe`, React template | Done | `editframe.yaml:2` |
| `editframe-html.yaml` deleted | Done | `git mv` in commit 2d067084 |
| `composition.tsx` with React components | Done | `editframe-templates/composition.tsx` |
| `composition-agents.md` references React | Done | `editframe-templates/composition-agents.md` |
| `attribute-pattern` in schema with `elements` array | Done | `profile-schema.ts:123-127` |
| `ProfileInvariantCheck` uses `elements?: string[]` | Done | `profile-schema.ts:145` |
| `invariant-engine.ts` implements `attribute-pattern` | Done | `invariant-engine.ts:180-226` |
| `html-attribute-pattern` case removed | Done | No occurrences in source |
| VIDEO-01..09 use `compositions/**/*.tsx` | Done | `editframe.yaml:67,74,81,88,95,106,117,128,134` |
| 6 new skill directories with SKILL.md | Done | `skills/fo/ef-*/SKILL.md` |
| `ef-onboard` no `npm create @editframe` | Done | Removed in step 5 |
| `ef-onboard` no stack preference question | Done | Removed in step 5 |
| `ef-composition-review` references `.tsx` and React | Done | `ef-composition-review/SKILL.md:21,27,33` |
| `ef-render-verify` references `compositions/**/*.tsx` | Done | `ef-render-verify/SKILL.md:21` |
| `editframe-profile.test.ts` updated | Done | `editframe-profile.test.ts:16,18-20` |
| `invariant-engine.test.ts` has JSX syntax test | Done | `invariant-engine.test.ts` |
| `packages/forge/AGENTS.md` references `editframe` | Done | `AGENTS.md:120` |
| `forge build:check` passes | Done | Verified |
| `forge test` passes | Done | 626/626 |
| Vendored skills carry `source` in frontmatter | **Partial** | Missing from all 6 skills |
| Skill count updated in AGENTS.md | **Missing** | Still says "29 fo skills" |

### Questions for the author

1. Should `elementRegex.lastIndex` be reset to 0 before each file to prevent skipped matches when the regex with `g` flag carries state from a previous file?
2. Should the 6 vendored skills include a `source` field in frontmatter as specified in the RFC's risk mitigation section?
3. Should the skill count in `packages/forge/AGENTS.md` be updated from 36 to 42 to reflect the 6 new skills?
