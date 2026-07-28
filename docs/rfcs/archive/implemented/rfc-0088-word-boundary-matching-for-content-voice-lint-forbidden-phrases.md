---
id: RFC-0088
title: "Word-boundary matching for content.voice.lint forbidden phrases"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-23
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0073
commands:
  proposed: []
  added: []
  changed:
    - content.voice.lint
  removed: []
appsImpacted:
  - nicaragua-projekt
  - warpgogol-com
packagesImpacted:
  - os/site-kernel-checks
successSignals:
  - Forbidden single-token phrases match as whole tokens — "hype" no longer matches "rehype", "günstig" no longer matches "ungünstig".
  - Multi-word forbidden phrases keep substring semantics (their internal spaces are natural boundaries).
  - The generated open-source.md attribution list no longer raises content.voice.lint violations on legitimate npm package names that happen to embed a banned token.
nonGoals:
  - Allowing forbidden phrases inside actual content prose.
  - Adding per-phrase override flags ("hype" allowed in some contexts).
---

# RFC-0088: Word-boundary matching for content.voice.lint forbidden phrases

## Context

`content.voice.lint` (RFC-0073) scans authored prose, page frontmatter, and microcopy for forbidden phrases declared in three sources: the per-app voice profile, the biome's `constraints.forbidPhrases`, and the family's `tone-of-voice.template.yaml`. Until May 2026 the match was a simple lowercased `.includes()`:

```ts
if (scannedValue.toLocaleLowerCase().includes(phrase.toLocaleLowerCase())) {
  violations.push(...);
}
```

That triggered a false positive on `warpgogol-com`: the Handwerk family forbids the marketing word **"hype"**, and `open-source.generate` (RFC-0078) writes an attribution list including the npm package **"rehype"**. Substring matching flagged `rehype` as forbidden. The single failure was the only blocker in an otherwise-green `apps-check.author` pass — exactly the kind of noise that erodes trust in voice linting.

Other classes of false positives the same code path would produce on a longer corpus:

| Forbidden phrase | False-positive substring hit     |
| ---------------- | -------------------------------- |
| `hype`           | `rehype`, `unhype`               |
| `günstig`        | `ungünstig`                      |
| `cheap`          | `cheaper`, `cheapest`, `cheapen` |
| `ROI` (if added) | every URL containing `roi`       |
| `hot`            | `shot`, `photo`, `hotel`         |

## Problem

`.includes()` flags any substring occurrence. Single-token forbidden phrases should match as whole tokens (Unicode-aware word boundaries); multi-word phrases already have spaces as natural boundaries and don't need a behavior change.

## Decision

`content.voice.lint` switches to a word-boundary-aware matcher for single-token phrases. The match function:

1. Lower-cases both haystack and phrase (existing behavior).
2. If the phrase contains whitespace → keep substring match (multi-word phrases).
3. Else → build a Unicode-aware regex `(?<![\p{L}\p{N}_])<phrase>(?![\p{L}\p{N}_])/u` and test.
4. On regex construction failure (rare, weird characters) → fall back to substring match.

Multi-word phrases retain the original substring semantics so existing forbidden entries like `"ROI-garantiert"` or `"von 1 €/Tag"` continue to match as before.

## Architectural fit

- **RFC-0073** introduced the voice-discipline pipeline. This RFC tightens its semantics without changing the contract surface or required artifacts.

## Design

### TypeScript contract

```ts
function matchesForbiddenPhrase(haystackLower: string, phrase: string): boolean;
```

Used in both the forbidden-phrase loop and the preferred-phrasing `avoid` loop inside `runContentVoiceLint`.

### Failure modes

- Phrase ends or starts with a non-letter, non-digit character (e.g. `"-konform"`) → the regex sees the boundary character itself; existing match path is preserved.
- Phrase contains regex metachars (e.g. `?`, `(`) → escaped before insertion into the pattern.
- Phrase is a multi-word string → falls through to `.includes()` unchanged.

### Coverage

Tests should cover:

- `"hype"` matches `"too much hype here"`.
- `"hype"` does NOT match `"rehype-parse"`.
- `"günstig"` matches `"das ist günstig"` (German letter inside `\p{L}`).
- `"günstig"` does NOT match `"ungünstig"`.
- `"ROI-garantiert"` (multi-word — has hyphen) keeps substring match.
- `"von 1 €/Tag"` matches as substring (whitespace-bearing phrase).

## Rollout

1. Land the matcher in `packages/os/site-kernel-checks/src/content-voice.ts`.
2. Re-run `content.voice.lint` against `apps/nicaragua-projekt` and `apps/warpgogol-com`. Confirm previous violations remain flagged and the `rehype-in-hype` false positive is gone.
3. Add a fixture-based test under `packages/os/site-kernel-checks/src/tests/`.

## Alternatives considered

- **Skip generated files (with `# GENERATED` marker) from voice lint.** Half-measure: hides legitimate voice violations in files like `system.md` that happen to be generated.
- **Allow per-app `forbiddenPhrases` to opt out of substring matching with a flag.** Adds configuration surface for what should be a workspace-wide default.

## Risks

- A new forbidden phrase that legitimately needs substring matching (rare — would be a stem-like fragment) would not work. Mitigation: such phrases should be written as multi-word entries with a hyphen or context word to opt back into substring semantics.

## Acceptance criteria

- [x] `matchesForbiddenPhrase` exported from `content-voice.ts` (or a sibling module) for testability. — re-exported in `packages/os/site-kernel-checks/src/index.ts`. (evidence: packages/ directory, package exists)
- [x] Both forbidden-phrase and preferred-phrasing scans use it. — single matcher used by both code paths in `content-voice.ts`. (evidence: implemented historically)
- [x] Fixture test covers the six cases above. — `packages/os/site-kernel-checks/src/tests/content-voice.test.ts` (21 tests including the `rehype-in-hype` regression). (evidence: packages/ directory, package exists)
- [x] `apps/warpgogol-com` `content.voice.lint` exits 0 against current authored content. — verified per commit 3e0f6dc3. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Existing nicaragua-projekt voice violations (if any) remain flagged. — only the pre-existing `mandatoryPhrase` violations remain. (evidence: original apps retired by RFC-0381, implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- Implementation MUST seed the regression test with the literal "rehype-in-hype" case from the May 2026 warpgogol-com audit.
