---
id: RFC-0718
title: "Add pre-commit CSS design token validation for staged .css files"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
supersedes: []
amends: []
amendedBy: []
related: []
satisfies:
  - DNA-10
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted: []
successSignals:
  - "Pre-commit hook rejects commits with invalid --ds-* CSS tokens in staged .css files"
  - "Token validation runs in <2 seconds for typical commit sizes"
  - "biome.tokens.validate continues to run in build.check as the comprehensive check"
nonGoals:
  - "Does not replace biome.tokens.validate — the pre-commit check is a fast subset for early feedback"
  - "Does not validate tokens in .astro or .ts files — only .css files are checked at pre-commit"
  - "Does not validate token semantics (e.g. color contrast) — only token name existence"
  - "Does not validate --ds-* token declarations outside tokens.css — tokens.ds.lint in build.check already covers this"
---

# RFC-0718: Add pre-commit CSS design token validation for staged .css files

## Context

The Warpgogol monorepo enforces DNA-10 («No hardcoded design tokens») via `tokens.ds.lint` and `tokens.colors.lint` in `build.check`. The canonical token list lives in `packages/tokens/src/tokens.css`. The existing `hooks/pre-commit` hook already validates `.env.example` files (ENV-CONTRACT-05, ENV-CONTRACT-06) and warns about command manifest staleness — establishing a pattern for pre-commit validation checks.

## Problem

During RFC-0708 implementation, Nachweis UI component CSS files used non-existent design tokens (`--ds-font-size-sm`, `--ds-color-warning`, `--ds-color-text-tertiary`, `--ds-color-focus`, `--ds-font-size-base`). These were caught by `biome.tokens.validate` during `build.check`, but only after the CSS files were already committed. The invalid tokens caused build failures that required a follow-up fix commit.

The existing `hooks/pre-commit` already validates `.env.example` files (ENV-CONTRACT-05, ENV-CONTRACT-06) and warns about command manifest staleness. Adding CSS token validation at pre-commit time catches invalid tokens before they enter the repository.

A preliminary implementation was already added to `hooks/pre-commit` (lines 94–121) during RFC-0708 work. This RFC formalizes that implementation and fixes a substring-matching bug in the validation logic (see Design).

## Decision

Extend `hooks/pre-commit` with a fast CSS token validation step that checks staged `.css` files for `--ds-*` token references against the canonical token list from `packages/tokens/src/tokens.css`. The check uses exact declaration matching to avoid false negatives from substring matches.

## Architectural fit

This RFC directly satisfies **DNA-10** («No hardcoded design tokens» — «CSS must use `--ds-*` custom properties only»). DNA-10 is enforced at build time by `tokens.ds.lint` and `tokens.colors.lint` in `build.check`. This RFC adds a pre-commit fast-path that catches invalid token **names** (not values) before they reach the build pipeline.

The pre-commit hook is the correct placement because:

- It runs on every commit, providing immediate feedback before the build.
- It follows the existing pattern of ENV-CONTRACT-05/06 validation in the same hook.
- It is advisory-only for non-CSS files (`.astro`, `.ts` with inline styles are excluded — see nonGoals).

`biome.tokens.validate` remains the comprehensive check in `build.check` — the pre-commit check is a fast subset for early feedback, not a replacement.

No AGENTS.md updates are required. The root `AGENTS.md` already documents the pre-commit hook pattern for ENV-CONTRACT-05; the CSS token validation follows the same structure without needing a separate rule entry.

## Design

### Token extraction

Extract valid `--ds-*` token names from `packages/tokens/src/tokens.css` at pre-commit time:

```bash
# Extract all --ds-* custom property declarations from tokens.css
VALID_TOKENS=$(grep -oP '^\s*\K--ds-[a-z0-9-]+' packages/tokens/src/tokens.css | sort -u)
```

### Validation logic

For each staged `.css` file:

1. Extract all `var(--ds-...)` references
2. Check each against the valid token list using **exact declaration match** (not substring)
3. Report any invalid tokens with file:line context

The previous implementation used `grep -qF "$token"` which performs substring matching. This caused false negatives: `--ds-color-primary` (invalid) would match as a substring of `--ds-color-primary-500` (valid). The fix uses `grep -qP "^\s*\Q$token\E\s*:"` to match only complete token declarations.

```bash
CSS_FILES=$(git diff --cached --name-only -- '*.css' || true)
if [ -n "$CSS_FILES" ]; then
  TOKENS_FILE="packages/tokens/src/tokens.css"
  if [ ! -f "$TOKENS_FILE" ]; then
    echo "WARNING: $TOKENS_FILE not found — skipping CSS token validation" >&2
  else
    CSS_ERRORS=""
    for f in $CSS_FILES; do
      if [ ! -f "$f" ]; then continue; fi
      while IFS= read -r token; do
        [ -z "$token" ] && continue
        if ! grep -qP "^\s*\Q$token\E\s*:" "$TOKENS_FILE"; then
          CSS_ERRORS="$CSS_ERRORS\n  $f — invalid token: $token"
        fi
      done < <(grep -oP 'var\(\s*\K--ds-[a-z0-9-]+' "$f")
    done
    if [ -n "$CSS_ERRORS" ]; then
      echo "ERROR: Invalid CSS design tokens detected:" >&2
      echo -e "$CSS_ERRORS" >&2
      echo "" >&2
      echo "Only --ds-* tokens from packages/tokens/src/tokens.css are allowed." >&2
      echo "Fix: replace invalid tokens with valid ones from the token list." >&2
      exit 1
    fi
  fi
fi
```

### Performance

The check spawns one `grep` subprocess per token reference found in staged CSS files. For a typical commit touching 1–5 CSS files with 10–30 token references each, this is 10–150 subprocess spawns — under 1 second on modern hardware. The `tokens.css` file is read once per token check (cached by the OS page cache after the first read).

For large CSS changes (100+ files), the check degrades linearly. This is acceptable because large CSS changes are rare and the check is still faster than a full `build.check` run.

### Edge cases

- **Empty staged CSS file set** — `CSS_FILES` is empty, the block is skipped entirely.
- **`tokens.css` missing** — warning emitted, check skipped (non-blocking).
- **Staged file deleted** — `[ ! -f "$f" ]` guard skips it.
- **Token reference in a comment** — `grep -oP 'var\(\s*\K--ds-[a-z0-9-]+'` matches `var(--ds-...` anywhere in the file, including comments. This is acceptable — invalid tokens in comments should also be fixed.
- **Token declaration outside `tokens.css`** — not checked by this pre-commit hook (caught by `tokens.ds.lint` in `build.check`).

### Placement in pre-commit hook

The existing implementation is at `hooks/pre-commit:94-121`, after the ENV-CONTRACT-05 block and before the command manifest staleness check. The fix replaces `grep -qF` with `grep -qP` for exact declaration matching.

## Rollout

The pre-commit hook is already active for all developers who have configured `git config core.hooksPath hooks/`. The fix (exact declaration match) is applied in-place — no migration needed. Existing CSS files that pass `biome.tokens.validate` in `build.check` will also pass the pre-commit check, because the pre-commit check is a strict subset (token name existence only).

## Alternatives considered

1. **Extend `biome.tokens.validate` with a `--staged-only` flag** — rejected because `biome.tokens.validate` is a kernel command that requires the full site-kernel runtime. Pre-commit hooks must be fast (bash/grep) and must not depend on Node.js or pnpm. The pre-commit hook runs in a bare shell context where `pnpm exec site-kernel` may not be available.

2. **TypeScript script instead of bash** — rejected because the existing pre-commit hook is entirely bash-based (ENV-CONTRACT-05, ENV-CONTRACT-06, command manifest check). Adding a TypeScript script would introduce a Node.js dependency in the hook, increasing startup time (~200ms for `node` vs ~10ms for `grep`).

3. **No pre-commit check, rely on `build.check` only** — rejected because the problem statement shows that invalid tokens were committed before `build.check` caught them. Pre-commit feedback is faster and prevents broken commits from entering the repository.

## Risks

- **False positives during token additions** — if a developer adds a new `--ds-*` token to `tokens.css` and uses it in a CSS file in the same commit, the pre-commit check will see the new token in `tokens.css` (which is staged) and pass. No risk.
- **Agent misinterpretation** — agents might think the pre-commit check validates token **values** (e.g. color contrast). The error message and nonGoals explicitly state it only checks token name existence.
- **`grep -P` availability** — Perl-compatible regex is available in GNU grep (standard on Linux). The monorepo is Linux-only (root AGENTS.md § Linux development environment), so this is safe.

## Acceptance criteria

- [ ] `hooks/pre-commit` contains a CSS token validation block that checks staged `.css` files for `--ds-*` token references against `packages/tokens/src/tokens.css`
- [ ] Validation uses exact declaration match (`grep -qP "^\s*\Q$token\E\s*:"`), not substring match (`grep -qF`)
- [ ] Commit with an invalid `--ds-*` token in a staged `.css` file is rejected with exit code 1
- [ ] Commit with only valid `--ds-*` tokens in staged `.css` files passes without errors
- [ ] Commit with no staged `.css` files skips the CSS token validation block entirely
- [ ] `biome.tokens.validate` continues to run in `build.check` unchanged
- [ ] Pre-commit CSS token validation completes in <2 seconds for a commit with 5 staged `.css` files

## Implementation notes for agents

- The implementation already exists in `hooks/pre-commit:94-121`. The only change needed is replacing `grep -qF "$token"` with `grep -qP "^\s*\Q$token\E\s*:"` and updating the token extraction regex to use `\K` for cleaner output.
- Do not add `--ds-*` token declarations outside `packages/tokens/src/tokens.css`. The pre-commit check only validates references (not declarations); `tokens.ds.lint` in `build.check` validates declaration locations.
- When adding new tokens to `tokens.css`, the pre-commit check automatically picks them up — no configuration change needed.
- The `\Q...\E` pattern in `grep -P` quotes the token name literally, preventing regex injection from token names (which only contain `[a-z0-9-]` anyway, but the guard is defense-in-depth).

## Evolution

If token validation needs to cover `.astro` or `.ts` files (which can also reference `--ds-*` tokens via inline styles), the pre-commit check can be extended. The canonical source of truth remains `packages/tokens/src/tokens.css`.
