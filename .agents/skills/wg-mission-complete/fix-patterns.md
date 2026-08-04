# Fix Patterns (L1) — Reactive Error Catalog

Error→resolution mappings for `wg-mission-complete`. Entries are reactive — applied _after_ an error occurs. Each entry carries `confirmations: N` — at N≥3 the skill auto-resolves without asking the operator.

<!-- Entries are appended by the skill after encountering and resolving an error. -->
<!-- Format:
## EC-XX: <error signature>
- **Command:** <kernel command name>
- **Trigger:** <exact error message or pattern>
- **Root cause:** <one-line explanation>
- **Resolution:** <step-by-step fix>
- **Auto-resolvable:** yes | no
- **Encountered:** <date>, <date> (append on repeat)
- **Confirmations:** N
-->

## EC-01: git am whitespace error

- **Command:** mission.reconcile
- **Trigger:** `git am` fails with "new blank line at EOF" or "whitespace errors"
- **Root cause:** Generated files may have trailing newlines that `git am` rejects by default
- **Resolution:** Use `git am --whitespace=fix` for both plain and 3-way attempts
- **Auto-resolvable:** yes
- **Encountered:** 2026-07-26
- **Confirmations:** 1

## EC-02: git am add/add conflict on generated files

- **Command:** mission.reconcile
- **Trigger:** `git am --3way` fails with "CONFLICT (add/add)" on `*.generated.yaml` or `*.generated.json` files
- **Root cause:** Cache clone and workpiece both have generated files (from different build.prepare runs) with no common ancestor — git sees them as add/add conflicts
- **Resolution:** `git checkout --theirs -- <conflict files>` → `git add -- <conflict files>` → `GIT_EDITOR=true git am --continue`. Generated files are deterministic — the workpiece version from the latest build.prepare is always authoritative
- **Auto-resolvable:** yes
- **Encountered:** 2026-07-26
- **Confirmations:** 1

## EC-03: Dirty cache clone blocks reconcile

- **Command:** mission.reconcile
- **Trigger:** "cache clone for system '<id>' has N uncommitted file(s) — reconcile will fail until resolved"
- **Root cause:** Bordbuch entries from mission.open are committed to cache clone but not pushed, or other files were modified outside mission workflow
- **Resolution:** Check `git status` in `systems/<id>/`. If only `bordbuch/events.ndjson` is dirty — commit it (`git add bordbuch/events.ndjson && git commit -m "chore: bordbuch entry from mission.open"`). If other files are dirty — investigate before committing
- **Auto-resolvable:** yes (bordbuch-only case), no (other files)
- **Encountered:** 2026-07-26
- **Confirmations:** 1

## EC-04: Dirty workpiece blocks reconcile

- **Command:** mission.reconcile
- **Trigger:** "workpiece has N uncommitted file(s)"
- **Root cause:** Generated artifacts from build.prepare (content-ref-index, entitlements, env.example) or operator edits not committed
- **Resolution:** Commit via `pnpm exec site-kernel run mission.git.commit --mission <id> --message "<msg>"`. If only generated files are dirty — commit with "chore: regenerate artifacts from build.prepare"
- **Auto-resolvable:** yes
- **Encountered:** 2026-07-26
- **Confirmations:** 1

## EC-05: release.prepare fails — mission not validated

- **Command:** release.prepare
- **Trigger:** "mission '<id>' has not passed validation"
- **Root cause:** mission.validate was not run or failed
- **Resolution:** Run `pnpm exec site-kernel run mission.validate --mission <id>` first. If it fails — fix the reported errors, commit, re-validate
- **Auto-resolvable:** yes
- **Encountered:** 2026-07-26
- **Confirmations:** 1
