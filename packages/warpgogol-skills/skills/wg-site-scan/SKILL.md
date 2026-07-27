---
name: wg-site-scan
description: Autonomous site scanner — runs page.block.validate, fixes violations, verifies via dev server, learns from operator decisions.
invocation: user
category: fo
concerns: content-mutation
dependsOn: ['my-preferences']
languagePolicy: ref(PREFERENCES.md)
knowledge:
  - qa-log.md
  - fix-patterns.md
  - learned-principles.md
bindings:
  requires:
    - commands.pageBlockValidate
    - commands.missionGitCommit
  optional:
    - commands.astroDev
---

# wg-site-scan

Before starting, read `PREFERENCES.md` at the repository root. If the file is missing or `aiLanguage` is unset, ask the operator once and create the file using the `my-preferences` skill semantics.

Autonomous site scanner. Discovers `page.block.validate` violations, fixes them, verifies via dev server + visual, and learns from operator decisions. The operator participates minimally — only when the skill encounters a decision it cannot make autonomously.

## Knowledge layers

The skill maintains three knowledge files, all living alongside `SKILL.md`:

- **`fix-patterns.md`** (L1) — baseline fix patterns A/B/C. The starter set, grown by AI per operator direction.
- **`learned-principles.md`** (L2) — distilled concrete principles extracted from past runs. Grows after each run's meta-analysis, with operator approval.
- **`qa-log.md`** (L0) — append-only raw Q&A pairs from each run. Used for meta-analysis and for prioritizing suggested solutions.

Read L1 and L2 at the start of each run. Append to L0 during the run. Distill L2 from L0 at the end.

## Process

### 1. Resolve site

Read `systems/registry.yaml`. If exactly one active system exists, use it. If multiple, ask the operator to choose. Resolve the site id (e.g. `warpgogol-com`) and the current mission id.

### 2. Discovery loop (max 6 iterations)

Run `pnpm exec site-kernel run page.block.validate --site <site-id> --json` from the repository root.

Parse violations. For each violation:

1. **Check L2 (`learned-principles.md`)** — is there a principle matching this violation code + context? If yes, apply it autonomously.
2. **Check L1 (`fix-patterns.md`)** — is there a baseline pattern matching this violation? If yes, propose the solution and ask the operator to confirm. Use L0 (`qa-log.md`) to prioritize suggestions — if the operator has chosen a particular answer for similar violations before, surface that first.
3. **No match** — ask the operator openly. Propose 2-3 options with recommended answer. Record the Q&A pair in L0.

For each fix, classify it as one of three patterns (see `fix-patterns.md`):

- **Pattern A (remove prop)** — extraneous prop not in schema, component does not use it. Remove from content file.
- **Pattern B (change type)** — props belong to a different cosmicName. Change the block's `type` in the content file.
- **Pattern C (update schema)** — prop is used by the component but missing from the manifest. Add to `propsSchema` in the manifest.

Apply fixes grouped by pattern. After each group:

1. **Verify** — re-run `page.block.validate` for the affected pages.
2. **Commit** — workpiece content fixes via `pnpm exec site-kernel run mission.git.commit --mission <missionId> --message "fix: <pattern description>"`. Platform manifest fixes via `git add <files> && git commit -m "fix: <pattern description>"`.

If violations remain after 6 iterations, stop and report what is left for manual intervention.

### 3. HTTP probe

Start the dev server from the workpiece directory (see `dev-server.md`). Fetch `sitemap-content.xml` and `sitemap-legal.xml`. Probe every URL with `curl -s -o /dev/null -w "%{http_code}" --max-time 10`.

Report:

- **200** — page renders correctly.
- **404** — outside scope of this skill. List in the report but do not attempt to fix.
- **500** — should not occur after fixes. If any remain, diagnose via `pnpm astro dev logs` and re-enter the fix loop.

### 4. Visual verification

For pages where structural changes were applied (pattern B type changes, pattern C schema changes), open `browser_preview` and ask the operator to confirm the render is correct.

### 5. Meta-analysis and learning

After all fixes and verification:

1. Review L0 (`qa-log.md`) entries from this run.
2. Identify recurring decision patterns.
3. Formulate concrete principles (violation code + cosmicName + condition → action).
4. Present principles to the operator for approval.
5. Append approved principles to L2 (`learned-principles.md`).
6. Commit knowledge file updates to the main repo: `git add packages/warpgogol-skills/skills/wg-site-scan/learned-principles.md packages/warpgogol-skills/skills/wg-site-scan/qa-log.md && git commit -m "chore: update wg-site-scan knowledge from run"`.

### 6. Final report

Output a structured report:

```
# wg-site-scan report

## Discovery
- Site: <site-id> (mission <mission-id>)
- Iterations: N of 6
- page.block.validate: 0 violations (green)

## Fixes applied
| Pattern | Violation | Block | Page(s) | Commit |
|---|---|---|---|---|
| A (remove prop) | B-03 | <block> (<cosmicName>) | <pages> | <sha> |
| B (change type) | B-03 | <block> (<from→to>) | <pages> | <sha> |
| C (update schema) | B-03 | <section> (<cosmicName>) | <manifest> | <sha> |

## HTTP probe
- 200: N pages
- 404: M pages (outside scope — see list)
- 500: 0

## Visual verification
- [browser_preview opened on K key pages]
- Operator confirmed: render correct

## Learned principles
- New principles extracted: N (see below)
- [principle 1: ...]
- Approved by operator: yes

## Q&A log
- N questions asked, N answers recorded (appended to qa-log.md)
```

## Constraints

- **User-invoked only.** Never auto-run.
- **Commit immediately after each verified fix group.** Workpiece via `mission.git.commit`, platform via `git add && git commit`. Never respond with uncommitted changes.
- **`--max-time 10` on all curl commands.** Dev server 500 errors can hang curl indefinitely.
- **6 iteration guardrail.** Stop if violations remain after 6 passes.
- **404s are out of scope.** Report them, do not fix them.
- **No `fo-doc-audit`.** This skill does not invoke `fo-doc-audit`.
- **Knowledge files grow only through AI per operator direction.** Never hand-edit `fix-patterns.md`, `learned-principles.md`, or `qa-log.md` manually.
