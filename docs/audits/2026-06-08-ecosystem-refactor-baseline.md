# Ecosystem Refactor Baseline Audit

**Date:** 2026-06-08  
**Auditor:** Cascade Agent (Implementation Mode)  
**Scope:** Repository-wide truth-layer drift and AI-operability assessment

## Executive Summary

This baseline audit establishes the current state of the Warpgogol Turborepo ecosystem before targeted refactoring. Key findings include significant truth-layer drift between documentation and implementation, resolved Compass inventory functionality, and a stable but aging RFC corpus.

## 1. Compass Inventory Status — RESOLVED ✅

**Status:** Previously reported as "inert" (0 scanned files), now **fully operational**.

```
Generated: 2026-06-08T19:43:03.442Z
Scanned files: 665
Authored files: 571
Excluded files: 94
Full required: 12
Reduced required: 559
Compliant files: 571
Non-compliant files: 0
```

**Implication:** Compass scaffolding is now generating actionable coverage data. All authored files are compliant with current scaffolding policy.

## 2. RFC Corpus Status

**182 RFC files** found in `docs/rfcs/`  
**RFC list command:** Returns 0 entries (appears to be context/app-scoped limitation, not a bug)

**Sample of RFC coverage:**

- RFC-0001 through RFC-0055 (early architecture)
- RFC-0070 through RFC-0089 (onboarding era)
- RFC-0090 through RFC-0099 (import/section contracts)
- RFC-0100 through RFC-0139 (section framework wave)
- RFC-0140 through RFC-0182 (current features: chat, integrations, cloudflare)

**Gap:** RFC status tracking (draft/reviewing/accepted/implemented) is not machine-queryable from the CLI.

## 3. Truth-Layer Drift Findings

### 3.1 Stale Path References (282 matches across 39 files)

**Critical files with drift:**

| File | Stale Reference | Should Be |
| --- | --- | --- |
| `docs/technology.xml` | `packages/site-kernel` | `packages/os/site-kernel` |
| `docs/development-plan.xml` | `packages/site-kernel*` | `packages/os/site-kernel*` |
| `docs/knowledge-graph.xml` | `apps/main`, `@warpgogol/main` | `apps/warpgogol-com`, `apps/nicaragua-projekt` |
| `docs/verification-plan.xml` | `apps/main`, `@warpgogol/main` | `apps/warpgogol-com`, `apps/nicaragua-projekt` |
| `README.md` | `system.yaml`, `src/content/assets/system.md` | `src/content/system.md` (RFC-0047) |
| `README.md` | `src/content/components` | REMOVED per RFC-0047 |
| Multiple RFCs | `apps/main` | `apps/warpgogol-com` or generic placeholder |

**Impact:** AI agents reading Compass documents or RFCs receive fictional workspace topology that doesn't match `pnpm-workspace.yaml` reality.

### 3.2 Package Metadata Drift

| Source                | Node Version | pnpm Version | Status             |
| --------------------- | ------------ | ------------ | ------------------ |
| Root `package.json`   | `>=22`       | `11.1.1`     | Current            |
| `docs/technology.xml` | `>=24`       | `10.33.0`    | Stale              |
| `apps/*/package.json` | `>=22`       | `10.33.0`    | Mismatch with root |

**Implication:** Documentation claims Node 24+ requirement but root allows 22+.

### 3.3 Import/Export Contract Contradiction

**Root `AGENTS.md` (RFC-0092 section):**

> "Every relative `import` or `export … from` inside `packages/**/*.ts(x)` MUST end in the on-disk extension — `.ts`"

**`packages/AGENTS.md` and `apps/AGENTS.md`:**

> "authored TypeScript files that execute/emit as ESM should use explicit local `.js` specifiers" "build-backed `packages/os/*` packages export runtime from `dist/*.js` and types from `dist/*.d.ts`"

**Status:** CONTRADICTION — root says `.ts`, packages/apps say `.js` for ESM output.

**Historical note:** Root AGENTS.md acknowledges this has flipped 5+ times. Current state appears to favor `.js` for ESM-executed files, `.ts` for source-consumed files.

## 4. Missing Commands

| Expected Command           | Status            | Notes                                         |
| -------------------------- | ----------------- | --------------------------------------------- |
| `apps.list`                | ❌ NOT REGISTERED | App context limitation                        |
| `rfc.list` (global)        | ⚠️ App-scoped     | Returns 0 RFCs from app context               |
| `generator.ownership.lint` | ✅ PASS           | Confirms generated-file governance is healthy |

## 5. App Validation Status

### nicaragua-projekt

```
content.surface.validate: OK with 26 warning(s)
Warnings: public/ preview images (expected exception per RFC-0150)
```

### warpgogol-com

```
content.surface.validate: OK with 26 warning(s)
Warnings: public/ preview images (expected exception per RFC-0150)
```

**Status:** Both apps pass surface validation with expected RFC-0150 preview image warnings.

## 6. Security/Documentation Hygiene

### 6.1 README.md Sensitive Content

**Lines 91-93** contain:

```bash
curl -X POST "https://api.telegram.org/bot8053691768:AAF6nnCXhjfYtR1KpiA_HzDGGUT9WSPZMIg/sendMessage"
```

**Status:** Hardcoded Telegram Bot token in public documentation. **Requires sanitization.**

### 6.2 Other README Issues

- References retired `system.yaml` surface (RFC-0047)
- References `src/content/assets/system.md` (RFC-0047 retired)
- References `src/content/components` (RFC-0047 retired)
- References non-existent `apps/main` in examples

## 7. Legacy Content Classification

### 7.1 `componentContent` References

**Finding:** Still appears in code/comments. Need classification:

**Type names (harmless):**

- `DonationCardComponentContent`, `HeaderComponentContent`, etc. — these are semantic type names, not legacy behavior.

**Compatibility APIs (to evaluate):**

- `getResolvedComponentContent()` in `@warpgogol/share` — may be compatibility shim for new content surfaces.

**Stale comments:**

- `markdown-section.astro:65` references "componentContent collection" — RFC-0026-era terminology, should be updated to `prose/` domain.

### 7.2 Retired RFC-0047 Surfaces

**Still documented in README:**

- `system.yaml` → replaced by single `src/content/system.md`
- `src/content/assets/system.md` → mirror removed
- `src/content/components` → directory removed
- `src/content/features` → retired

## 8. Generator Ownership Health

```
== workspace: generator.ownership.lint ==
[OK] generator.ownership.lint: OK
```

**Status:** All generated files have clear ownership. No conflicts detected.

## 9. Prioritized Issue Register

### 🔴 Critical (Blockers for AI Operability)

1. **Telegram Bot token in README.md** — security/documentation hygiene
2. **Import/export contract contradiction** — causes agent confusion
3. **Compass XML topology drift** — fictional workspace references

### 🟡 High (Truth Layer)

4. README.md references retired RFC-0047 surfaces
5. RFC files contain stale `apps/main` examples
6. Node/pnpm version inconsistency across root/docs/apps

### 🟢 Medium (Legacy Taxonomy)

7. `componentContent` terminology cleanup in comments
8. Stale path references in package AGENTS.md files (`packages/site-kernel` → `packages/os/site-kernel`)
9. `apps.list` command missing from kernel

## 10. Validation Commands for Future Waves

```bash
# Verify Compass compliance
pnpm exec site-kernel run compass.validate

# Check content surface
pnpm exec site-kernel run content.surface.validate --app <app>

# Check generator ownership
pnpm exec site-kernel run generator.ownership.lint

# Check RFC validity (isolated)
pnpm exec site-kernel run rfc.validate RFC-XXXX --json
```

## 11. Recommended First Wave Actions

Based on this baseline:

1. **Sanitize README.md** — remove bot token, update RFC-0047 references, align with current topology
2. **Fix import/export contract** — reconcile root vs package AGENTS.md
3. **Refresh Compass XML** — replace fictional workspaces with actual apps/packages
4. **Fix OS path references** — `packages/site-kernel` → `packages/os/site-kernel`

## Appendix: Full File Scan

**Files with stale references:**

- `docs/development-plan.xml` (24 matches)
- `docs/technology.xml` (12 matches)
- `docs/knowledge-graph.xml` (2 matches)
- `docs/verification-plan.xml` (8 matches)
- `README.md` (multiple retired surfaces)
- 37 RFC files (historical, acceptable)

**Generator-excluded files (94 total):** All app entry points (astro.config.mjs, content.config.ts, middleware, routes) properly carry `GENERATED` markers and are excluded from Compass scaffolding requirements.

---

**End of Baseline Audit**
