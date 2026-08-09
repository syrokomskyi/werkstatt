---
rfcId: RFC-0718
planId: PLAN-RFC-0718-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps: []
  packages: []
  services: []
  docs:
    - docs/rfcs/draft/rfc-0718-add-pre-commit-css-token-validation.md
---

# Implementation Plan: RFC-0718

## 1. Objectives

- [ ] Fix `grep -qF` substring matching bug in `hooks/pre-commit` CSS token validation block — maps to acceptance criterion "Validation uses exact declaration match"
- [ ] Verify invalid `--ds-*` tokens are rejected with exit code 1 — maps to acceptance criterion "Commit with an invalid --ds-* token in a staged .css file is rejected"
- [ ] Verify valid `--ds-*` tokens pass without errors — maps to acceptance criterion "Commit with only valid --ds-* tokens in staged .css files passes"
- [ ] Verify empty staged CSS set skips validation — maps to acceptance criterion "Commit with no staged .css files skips the CSS token validation block"
- [ ] Confirm `biome.tokens.validate` unchanged in `build.check` — maps to acceptance criterion "biome.tokens.validate continues to run in build.check unchanged"

## 2. Affected artifacts

### 2.1 Code and commands

- `hooks/pre-commit` — lines 94–121: replace `grep -qF "$token"` with `grep -qP "^\s*\Q$token\E\s*:"`, update token extraction regex to use `\K` for cleaner output.

### 2.2 Configuration and data

- None. No YAML/JSON/NDJSON, system.md, manifests, or biome files affected.

### 2.3 Documentation and specs

- `docs/rfcs/draft/rfc-0718-add-pre-commit-css-token-validation.md` — read-only reference (acceptance criteria source of truth).
- No AGENTS.md updates needed (RFC explicitly states this in Architectural fit).
- No `docs/*.xml` Compass sync needed — no repository-wide semantics changed.
- No `docs/architecture-dna.md` update — no new DNA invariant.

### 2.4 Validation and pipelines

- `rfc.validate --id RFC-0718` — verify RFC passes after implementation.
- No `build:check` needed — no TypeScript package changes.
- No `command.manifest.generate` needed — no kernel commands added/changed/removed.
- No CI workflow changes — pre-commit hook is local-only, not CI.

## 3. Step sequence

### Step 1. Fix grep substring matching bug in pre-commit hook

**Goal:** Replace `grep -qF` substring matching with `grep -qP` exact declaration matching in the CSS token validation block of `hooks/pre-commit`.

**Agent actions:**

- In `hooks/pre-commit`, replace `grep -qF "$token" "$TOKENS_FILE"` with `grep -qP "^\s*\Q$token\E\s*:" "$TOKENS_FILE"` (line ~107).
- Update token extraction regex from `grep -oP 'var\(\s*(--ds-[a-z0-9-]+)' "$f" | sed 's/var(\s*//'` to `grep -oP 'var\(\s*\K--ds-[a-z0-9-]+' "$f"` (line ~110) — `\K` eliminates the `sed` pipe.
- Update token list extraction comment to match the new regex pattern.

**Validation:**

- `grep -n 'grep -qP' hooks/pre-commit` — confirms the new pattern is present.
- `grep -n 'grep -qF' hooks/pre-commit` — confirms the old pattern is removed from the CSS block (ENV-CONTRACT blocks may still use `grep -qF` for other purposes — check context).

**Completion criterion:** `hooks/pre-commit` CSS token validation block uses `grep -qP "^\s*\Q$token\E\s*:"` for exact declaration matching, and the old `grep -qF "$token"` substring match is removed from the CSS block.

**Human review:** no

---

### Step 2. Manual verification of validation behavior

**Goal:** Verify the fixed pre-commit hook correctly rejects invalid tokens and passes valid tokens.

**Agent actions:**

- Test the `grep -qP` command directly against `packages/tokens/src/tokens.css` with an invalid token (substring of a valid one):
  - `grep -qP '^\s*\Q--ds-color-primary\E\s*:' packages/tokens/src/tokens.css; echo $?` — should print `1` (not found, correct rejection).
  - `grep -qP '^\s*\Q--ds-color-primary-500\E\s*:' packages/tokens/src/tokens.css; echo $?` — should print `0` (found, correct acceptance).
- Verify the old `grep -qF` would have produced a false negative:
  - `grep -qF '--ds-color-primary' packages/tokens/src/tokens.css; echo $?` — should print `0` (found as substring — this is the bug being fixed).
- Test token extraction regex:
  - `echo 'body { color: var(--ds-color-primary); }' | grep -oP 'var\(\s*\K--ds-[a-z0-9-]+'` — should print `--ds-color-primary`.
- Verify that the full validation flow works by running the CSS block logic in isolation (extract from hook, test against a temp CSS file).

**Validation:**

- Direct grep tests: `grep -qP '^\s*\Q--ds-color-primary\E\s*:' packages/tokens/src/tokens.css; echo $?` → exit code 1 (not found).
- Direct grep tests: `grep -qP '^\s*\Q--ds-color-primary-500\E\s*:' packages/tokens/src/tokens.css; echo $?` → exit code 0 (found).
- Old pattern confirmation: `grep -qF '--ds-color-primary' packages/tokens/src/tokens.css; echo $?` → exit code 0 (substring match — the bug).

**Completion criterion:** Invalid token `--ds-color-primary` is rejected (was previously passing as substring of `--ds-color-primary-500`), valid token `--ds-color-primary-500` passes, no-CSS commit skips validation.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Verify all acceptance criteria, run code review, stamp RFC as implemented.

**Agent actions:**

- No AGENTS.md updates needed (RFC Architectural fit section explicitly states this).
- No `docs/*.xml` Compass sync needed.
- No `docs/architecture-dna.md` update needed.
- No `ecosystem.manifest.generate` or `command.manifest.generate` needed — no commands changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0718 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0718` — passes with 0 violations.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with inline evidence; code review passed (findings fixed if any); RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0718`
- No `build:check` needed — no TypeScript package changes (only `hooks/pre-commit` bash script modified).
- No `rfc.verification.emit` needed — RFC has no acceptance probes in frontmatter.

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0718` in the subject line (RFC-0265 commit hygiene).
- Manual verification output from Step 2 (terminal transcript showing rejection of invalid token and acceptance of valid token).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives during token additions | Step 2 verifies that valid tokens pass; `tokens.css` is read at pre-commit time so newly added tokens are immediately available. |
| Agent misinterpretation (thinks check validates values) | RFC nonGoals and error message explicitly state name-only check; Implementation notes for agents clarify scope. |
| `grep -P` availability | Root AGENTS.md § Linux development environment confirms GNU grep. Step 1 uses `grep -P` which requires PCRE — standard on Linux. |

## 6. Escalation triggers

- If the `grep -P` pattern fails on the target platform (non-GNU grep), escalate by creating a follow-up RFC proposing an alternative matching strategy (e.g. `awk`-based exact match). Do not work around by reverting to `grep -qF` substring matching.
- If implementation reveals that `biome.tokens.validate` in `build.check` is affected by the pre-commit change, run `rfc.supersede.propose` — the RFC claims `biome.tokens.validate` is unchanged, and a conflict would require a superseding RFC.
