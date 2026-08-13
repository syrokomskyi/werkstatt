---
rfcId: RFC-0834
planId: PLAN-RFC-0834-01
status: draft
owner: architecture
createdAt: 2026-08-13
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs:
    - docs/policies/content-contracts.md
    - docs/rfcs/archive/implemented/rfc-0204-*.md
    - docs/rfcs/archive/implemented/rfc-0210-*.md
---

# Implementation Plan: RFC-0834

## 1. Objectives

- [ ] Objective 1 — Verify onboarding `.gitignore` template no longer gitignores manifest files (maps to acceptance criterion: "Onboarding `.gitignore` template updated")
- [ ] Objective 2 — Update cache clone `.gitignore` and track manifest files there (maps to acceptance criteria: "`src/image-variants.generated.yaml` removed from workpiece `.gitignore`", "`src/video-manifest.generated.yaml` removed from workpiece `.gitignore`")
- [ ] Objective 3 — Verify `public/_img/` and `public/_video/` remain gitignored (maps to acceptance criterion: "`public/_img/` and `public/_video/` remain in workpiece `.gitignore`")
- [ ] Objective 4 — Verify `amendedBy` fields in RFC-0204 and RFC-0210 include RFC-0834 (maps to acceptance criteria: "RFC-0204 `amendedBy` includes RFC-0834", "RFC-0210 `amendedBy` includes RFC-0834")
- [ ] Objective 5 — Verify `docs/policies/content-contracts.md` reflects the new commit policy (maps to acceptance criterion: "`docs/policies/content-contracts.md` updated")
- [ ] Objective 6 — Regression check: `git check-ignore` returns non-zero for manifest files in an active workpiece (maps to acceptance criterion: "Regression check")
- [ ] Objective 7 — `rfc.validate` passes for RFC-0834 (maps to acceptance criterion: "`rfc.validate` passes")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/onboarding/templates/runtime/gitignore.template` — onboarding template (already updated during RFC drafting; verify consistency with final RFC text)
- No code changes to generators or validators (`image.variants.generate`, `image.variants.validate`, `video.variants.generate`, `video.variants.validate`)

### 2.2 Configuration and data

- `../systems-cache/warpgogol-com/.gitignore` — cache clone gitignore (still has old lines: `src/image-variants.generated.yaml` and `src/video-manifest.generated.yaml` on lines 34 and 38)
- `missions/warpgogol-com-m000054/workpiece/.gitignore` — active workpiece gitignore (already updated during RFC drafting)
- `missions/warpgogol-com-m000054/workpiece/src/image-variants.generated.yaml` — manifest file (already tracked in workpiece git)
- `missions/warpgogol-com-m000054/workpiece/src/video-manifest.generated.yaml` — manifest file (already tracked in workpiece git)

### 2.3 Documentation and specs

- `docs/policies/content-contracts.md` — already updated during RFC drafting; verify consistency with final RFC text
- `docs/rfcs/archive/implemented/rfc-0204-*.md` — `amendedBy` field already includes `RFC-0834`; verify
- `docs/rfcs/archive/implemented/rfc-0210-*.md` — `amendedBy` field already includes `RFC-0834`; verify
- No `docs/*.xml` Compass files need synchronization (no structural or semantic change to the platform architecture)
- No `AGENTS.md` files need updates (no new commands, modules, or ownership changes)

### 2.4 Validation and pipelines

- No pipeline changes (no new commands)
- `rfc.validate --id RFC-0834` — must pass
- `git check-ignore` regression check on active workpiece

## 3. Step sequence

### Step 1. Verify onboarding template consistency

**Goal:** Confirm the onboarding `.gitignore` template matches the final RFC text.

**Agent actions:**

- Read `packages/werkstatt-site/src/onboarding/templates/runtime/gitignore.template`
- Verify lines 32-38 match the RFC's `.gitignore` diff (manifest lines removed, `public/_img/` and `public/_video/` kept, RFC-0834 reference comments present)
- If inconsistent, edit to match the RFC's final diff

**Validation:**

- `grep -n "image-variants\|video-manifest" packages/werkstatt-site/src/onboarding/templates/runtime/gitignore.template` — should show only comment lines referencing RFC-0834, no gitignore rules for manifest files

**Completion criterion:** Onboarding template has no gitignore rule for `src/image-variants.generated.yaml` or `src/video-manifest.generated.yaml`; `public/_img/` and `public/_video/` remain gitignored.

**Human review:** no

---

### Step 2. Update cache clone `.gitignore` and track manifests

**Goal:** Update the cache clone (`../systems-cache/warpgogol-com/`) `.gitignore` to match the new policy and commit the manifest files there.

**Agent actions:**

- Read `../systems-cache/warpgogol-com/.gitignore`
- Remove lines `src/image-variants.generated.yaml` and `src/video-manifest.generated.yaml` (lines 34 and 38)
- Update comments to match the RFC's diff (binary variants only, manifest IS committed)
- Run `image.variants.generate` and `video.variants.generate` in the cache clone workpiece to produce manifest files (if not already present)
- `git add src/image-variants.generated.yaml src/video-manifest.generated.yaml .gitignore`
- Commit via `git commit -m "rfc-0834: track variant manifests for drift detection"` in the cache clone

**Validation:**

- `git -C ../systems-cache/warpgogol-com check-ignore src/image-variants.generated.yaml` returns non-zero (not ignored)
- `git -C ../systems-cache/warpgogol-com ls-files src/image-variants.generated.yaml` lists the file

**Completion criterion:** Cache clone `.gitignore` no longer ignores manifest files; manifest files are tracked in cache clone git.

**Human review:** no

---

### Step 3. Verify `docs/policies/content-contracts.md` consistency

**Goal:** Confirm the policy doc matches the final RFC text.

**Agent actions:**

- Read `docs/policies/content-contracts.md`
- Verify lines 110, 119, 123 reflect: manifest IS committed for drift detection (RFC-0834), binary variants remain gitignored
- If inconsistent, edit to match the final RFC text

**Validation:**

- `grep -n "RFC-0834\|image-variants.generated\|video-manifest.generated" docs/policies/content-contracts.md` — should show RFC-0834 references and correct commit policy

**Completion criterion:** Policy doc states manifest files are committed for drift detection; binary variants remain gitignored; RFC-0834 is referenced.

**Human review:** no

---

### Step 4. Verify `amendedBy` fields in RFC-0204 and RFC-0210

**Goal:** Confirm both amended RFCs include RFC-0834 in their `amendedBy` frontmatter.

**Agent actions:**

- Read `docs/rfcs/archive/implemented/rfc-0204-*.md` frontmatter — verify `amendedBy` includes `RFC-0834`
- Read `docs/rfcs/archive/implemented/rfc-0210-*.md` frontmatter — verify `amendedBy` includes `RFC-0834`

**Validation:**

- `grep -n "RFC-0834" docs/rfcs/archive/implemented/rfc-0204-*.md docs/rfcs/archive/implemented/rfc-0210-*.md` — should show `RFC-0834` in `amendedBy` arrays

**Completion criterion:** Both RFCs list `RFC-0834` in their `amendedBy` frontmatter array.

**Human review:** no

---

### Step 5. Regression check: `git check-ignore` on active workpiece

**Goal:** Verify manifest files are not gitignored in an active workpiece.

**Agent actions:**

- Run `git -C missions/warpgogol-com-m000054/workpiece check-ignore src/image-variants.generated.yaml` — must return non-zero (not ignored)
- Run `git -C missions/warpgogol-com-m000054/workpiece check-ignore src/video-manifest.generated.yaml` — must return non-zero (not ignored)
- Run `git -C missions/warpgogol-com-m000054/workpiece check-ignore public/_img/` — must return zero (still ignored)
- Run `git -C missions/warpgogol-com-m000054/workpiece check-ignore public/_video/` — must return zero (still ignored)

**Validation:**

- All four `git check-ignore` commands return expected exit codes

**Completion criterion:** Manifest files are not ignored; binary variant directories are still ignored.

**Human review:** no

---

### Step 6. Run `rfc.validate` and commit changes

**Goal:** Validate the RFC and commit all changes made during implementation.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0834` — must pass
- Commit any changes made in steps 1-4 via `ecosystem.commit` (platform-scope changes)
- Commit cache clone changes (step 2) via `git commit` in the cache clone repo

**Validation:**

- `rfc.validate --id RFC-0834` exits 0
- `git status` clean in werkstatt repo
- `git -C ../systems-cache/warpgogol-com status` clean in cache clone

**Completion criterion:** RFC validates; all repos clean.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Verify all acceptance criteria, run code review, and stamp the RFC as implemented.

**Agent actions:**

- Check off all acceptance criteria in the RFC with inline `(evidence: ...)` annotations
- Run `fo-review` via the `skill` tool on all session code changes
- Run `fo-fix` if findings (max 3 iterations)
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0834 --implementation-commit <sha>` to transition `accepted → implemented`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0834` — passes
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0834`
- `git -C missions/warpgogol-com-m000054/workpiece check-ignore src/image-variants.generated.yaml` (regression check)
- `git -C missions/warpgogol-com-m000054/workpiece check-ignore src/video-manifest.generated.yaml` (regression check)
- `git -C ../systems-cache/warpgogol-com check-ignore src/image-variants.generated.yaml` (cache clone regression check)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0834` in the subject line
- `docs/rfcs/verification/rfc-0834.generated.json` — verification evidence (if acceptance probes are declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Merge conflicts on manifest files | Step 2 commits manifests to cache clone; generator is idempotent — re-running after merge resolves conflicts |
| Stale committed manifest | Git diff is the sole drift detection layer; `image.variants.validate` checks missing files in `build.check` |
| Larger git diffs (~21KB for 31 images) | Acceptable trade-off; comparable to other committed generated artifacts |

## 6. Escalation triggers

- If the cache clone `.gitignore` has unexpected entries or conflicts with the onboarding template, investigate before modifying — the cache clone may have diverged from the template.
- If `rfc.implement.stamp` fails due to unchecked acceptance criteria, document why each unchecked criterion cannot be verified and ask the operator.
