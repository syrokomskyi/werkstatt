# RFC base consistency audit — 2026-06

**Scope:** all 138 RFCs in `docs/rfcs/` (`RFC-0001`–`RFC-0152`; numbers 0056–0069 unused). **Authorization:** the RFC governance process (RFC-0001 + templates) states _"agents MUST NOT change the `status` field."_ This audit edits governed fields (`status`, `implementedAt`, `closedAt`, acceptance checkboxes, supersession links) under **explicit architecture-owner authorization** given in the session of 2026-06-04. Each commit cites that authorization. **Re-run the checks:** `node packages/os/site-kernel/bin/site-kernel.mjs run rfc.validate` (V-01…V-20). The lifecycle/referential rules this audit applied by hand were folded into the validator by RFC-0153 (V-12 bidirectional, V-16 status/date, V-17 strict supersededBy, V-18 related integrity) and RFC-0157 (V-19 amends, V-20 unknown-key), so the standalone `scripts/rfc-audit.mjs` backstop was retired.

## Why this audit

The RFC frontmatter is the machine-readable contract behind `rfc.list`/`rfc.validate`/`rfc.check`, and the first thing an AI agent or new contributor reads to understand "what is decided and live." A frontmatter parse showed cross-referencing was already strong (136/138 had `related[]`) but the lifecycle state had **drifted from reality**: ~30 implemented RFCs still said `accepted`, supersession edges were one-directional or mis-used, `closedAt` was placed on non-terminal RFCs, and ~30 implemented RFCs had zero acceptance boxes checked. Net effect: the base under-reported what was actually built and could not be trusted for planning. This pass reconciles frontmatter with the code, makes relationships bidirectional and truthful, verifies acceptance criteria, and files the defects found in passing as a backlog.

## Result at a glance

| Metric | Before | After (final) |
| --- | --- | --- |
| `rfc.validate` | **fail** (RFC-0152 V-14/V-15) | **pass**, 0 violations (143 RFCs incl. 5 new drafts) |
| status: implemented | 85 | 127 |
| status: accepted | 50 | 0 (+5 new `draft` backlog RFCs) |
| status: draft | 2 | 5 (RFC-0153…0157 backlog; the 2 old drafts were implemented) |
| status: superseded | 1 | 11 |
| `related[]` populated | 136/138 | 138/138 |
| audit-script inconsistencies | 109 | 2 (both documented stray keys; all status/date/supersession/acceptance drift resolved) |

## Conventions applied (decision rules)

1. **status⟺implementedAt** — `implemented` requires an `implementedAt`; an `implementedAt` with `status: accepted` is treated as status lag and flipped to `implemented`.
2. **Strict supersession lifecycle** — a _genuine_ supersession (declared bidirectionally by the original authors: supersedee has `supersededBy`, superseder has `supersedes`) flips the supersedee to `superseded` + `closedAt`. A `supersedes` entry that the body shows is really "builds-on/extends" (only the superseder declared it; no back-link) is **demoted to `related`** rather than forcing a live RFC to `superseded`.
3. **closedAt is terminal-only** — reserved for `superseded`/`rejected`. Cleared from `implemented` RFCs; the "done" date is `implementedAt`.
4. **implementedAt dating** — precise commit/memory date where known; otherwise `implementedAt = createdAt` for verified-live older RFCs whose first implementation commit predates clean attribution (V-08-safe; flagged here, not silently invented).
5. **updatedAt** bumped to 2026-06-04 on every touched RFC (schema: "date of last frontmatter update").
6. **Verification before flip** — every status change is backed by an artifact check (`Grep`/`Glob`/`git log`) or a cited commit/memory note; no blind flips. `rfc.check` was **not** used as an oracle (see backlog B1 — it false-positives on glob/placeholder paths).

## W1 — status + date reconciliation (73 files; applied via a reviewed one-shot script, since removed — changes are in commit `1c1cb209`)

- **accepted/draft → implemented (already dated):** 0006, 0021, 0031, 0034, 0039, 0082–0095, 0097, 0098, 0109, 0110, 0137, 0138.
- **accepted/draft → implemented + backfilled implementedAt (verified-live):** 0009, 0012, 0024 (draft), 0032 (draft), 0050, 0051, 0052, 0096, 0134, 0135, 0136, 0144–0148, 0149, 0150, 0151, 0152. Evidence: signature artifacts present (e.g. `@warpgogol/share/semantic`, `business-projection.ts`, `responsive-image.astro`, `preview.images.generate` registered, `src/pages/api/send-message.ts` + adapter, effects `registry.ts`).
- **implementedAt backfilled (already implemented):** 0003→2026-04-13, 0125→2026-05-28, 0129→2026-05-29.
- **createdAt typo fixes:** RFC-0013 `2025-01-15`→`2026-04-15`, RFC-0016 `2025-01-17`→`2026-04-17` (the `2025` values predated RFC-0001 by 15 months and broke chronological ordering with neighbours 0011/0014/0015).
- **closedAt cleared (non-terminal):** 0108, 0109, 0110, 0114, 0117, 0122, 0123, 0124, 0126, 0127, 0128, 0130, 0131, 0132, 0133.
- **RFC-0134** implementedAt set to `2026-05-29` (= createdAt; the glass-panel work at 2026-05-26 predated the formal RFC — kept V-08-valid).

## W2 — supersession integrity (strict)

**Group A — genuine supersessions → supersedee flipped to `superseded` + `closedAt`** (back-links already consistent; both authors had declared the edge):

| Superseded         | by       | closedAt   |
| ------------------ | -------- | ---------- |
| RFC-0002, RFC-0010 | RFC-0038 | 2026-05-01 |
| RFC-0018           | RFC-0019 | 2026-04-21 |
| RFC-0022           | RFC-0037 | 2026-05-01 |
| RFC-0029, RFC-0030 | RFC-0070 | 2026-05-18 |
| RFC-0033           | RFC-0077 | 2026-05-18 |
| RFC-0078, RFC-0079 | RFC-0081 | 2026-05-21 |
| RFC-0140           | RFC-0149 | 2026-06-03 |

**Group B — loose/mis-used `supersedes` → demoted to `related`** (the body shows "builds-on/extends", only one side had declared it; supersedee stays live):

| RFC | removed from `supersedes` | rationale |
| --- | --- | --- |
| RFC-0099 | RFC-0008, RFC-0042, RFC-0077 | Context/Architectural-fit cite them as _foundations it builds on_; moved into `related`. |
| RFC-0100 | RFC-0035 | "extends runtime prop unification with authored content-shape unification" — extension, not replacement; already in `related`. 0100 stays `superseded` by 0103. |
| RFC-0125 | RFC-0108 | RFC-0125 is a policy closeout of only _Proposal G_ inside 0108; introduces nothing; already in `related`. 0108 stays `implemented`. |

## W3 — acceptance criteria (deep-verified) — _done_ (commit `9239af64`)

49 `implemented`/`superseded` RFCs had 0 of N boxes checked. Each criterion was verified against the live command registry (175 registered commands), package artifacts, referenced commits, and memory; **418 met criteria were checked.** The verified-unmet/deferred deliverables were left unchecked with an inline explanation:

| RFC | unchecked criterion | reason |
| --- | --- | --- |
| RFC-0048 | `routes.localized.validate` (×3) | validator never built; localized route resolution itself is live and exercised via `app.contract.full` |
| RFC-0100 | `section.content`/`list-item.contract.validate` | superseded by RFC-0103 (realized as `section.body`/`section.contract.validate`) |
| RFC-0134 | `effects.contract.validate` + `effects.coverage.audit` | deferred → RFC-0156; enforcement lives in `effectAssignmentSchema.superRefine` |
| RFC-0151 | `effects.contract.validate` | same; deferred → RFC-0156 |
| RFC-0024 | `business.profile.validate --app main` | `apps-todo/main` not yet graduated into `apps/` |

Note on depth: "verified" means each command/artifact deliverable was confirmed against the registry/filesystem and outcome/doc criteria were accepted on the strength of the RFC being confirmed-implemented. Several early RFCs (0009/0012/0042/0050…) describe app-local artifacts the later thin-app migration moved into packages — their _outcomes_ still hold, so the boxes are checked; the structural move is recorded by the superseding/successor RFCs.

## W4 — cross-reference integrity — _done_ (commit `b78473ba`)

- Filled the 2 empty `related[]`: RFC-0001 → RFC-0003; RFC-0017 → RFC-0015. `related[]` now populated on **138/138**.
- `scripts/rfc-audit.mjs` confirms every `RFC-XXXX` in `related[]` resolves (0 dangling).
- Verified the W3-checked cross-ref criteria are truthful: RFC-0040/0041 already carry `related:[0103,0106,0113]` + dated "Updated by" notes; RFC-0108 already records "Proposal G … RFC-0125 (explicit closeout)".
- **Finding (→ backlog B6 / RFC-0153 V-18):** `DNA-37` and `DNA-38` are referenced by RFC-0035/0100/0101/0102/0103/0106 but are **not defined** in `docs/architecture-dna.md` (canonical stops at DNA-36). The DNA registry needs a sync (not done here — editing the normative DNA doc is the founder's call). Also minor: DNA/AP ids use inconsistent zero-padding (`DNA-1` vs `DNA-02`).

## Backlog — future RFCs (defects & omissions found in passing)

**Update 2026-06-04:** the founder accepted RFC-0153–RFC-0157 and they are now **`implemented`** (commits `ae68ab3e`, `8310b12a`, `5e099a78`, `0674aedb`, `141f5d57`). The lifecycle/referential rules (B1) now live in `rfc.validate` (V-12 bidirectional, V-16…V-20) and the standalone `scripts/rfc-audit.mjs` was retired. **B7 is also resolved** (commits `ab9de507`, `c2709fe8`): DNA-27…38 were backfilled into the canonical `docs/architecture-dna.md` from their establishing RFCs, DNA-17…23 gained establishing-RFC citations, the two DNA docs were reconciled (root = canonical numbered registry, packages copy = derived view), and **RFC-0158** added `dna.registry.validate` (DNA-REG-01…04) so the drift cannot recur. `rfc.validate` V-18 now emits **0** warnings. All backlog items are closed. Original entries below, for the record:

- **B1 — Harden `rfc.validate`/`rfc.check` (→ draft RFC-0153, command).**
  - Remove leftover debug code in `packages/os/site-kernel/src/rfc/handlers.ts:482-499`: it writes `C:/Temp/rfc-debug.json` on _every_ validate of RFC-0100 (a filesystem side-effect in a read-only command, Windows-path-hardcoded) and leaks `(debug keys: …)` into the V-11 message.
  - **V-12 is asymmetric**: it only checks `supersededBy`→`supersedes`, never `supersedes`→`supersededBy`, so the 5 broken back-links this audit fixed were invisible to the validator. Make it bidirectional.
  - `rfc.check` C-01 `fs.access`-tests glob/placeholder/prose paths verbatim (`apps/*/…`, `apps/<app>/…`, "Every generator module") → 339 false-positive "missing" artifacts. Skip or glob-expand non-literal paths.
  - Add **V-16** status⟺implementedAt / terminal⟺closedAt coupling, **V-17** strict supersededBy⟹superseded, **V-18** `related[]` referential integrity (these are exactly what `scripts/rfc-audit.mjs` checks today out-of-band).
- **B2 — Build idempotency for tracked business content (→ draft RFC-0154, architecture).** `pnpm build` rewrites/blanks `NEED_THIS_*` markers in `apps/*/src/content/business/**` (observed on warpgogol-com de `legal.md`/`company.md`); blanking removes the marker `semantic.page.validate` relies on to fail prod builds → missing legal data could silently pass. Add a clean-tree/idempotency guard.
- **B3 — Compass scaffolding for section-owned client/css assets (→ draft RFC-0155, command).** `compass.validate` fails on `packages/ui/src/sections/send-message/*.client.ts|.css` (missing MODULE_CONTRACT/MAP/CHANGE_SUMMARY) — RFC-0140/0149 follow-up.
- **B4 — Effects contract & coverage validators (→ draft RFC-0156, command).** RFC-0134 _proposed_ `effects.contract.validate` + `effects.coverage.audit`; they were never built (enforcement lives ad-hoc in `effectAssignmentSchema.superRefine`). Build them or formally drop the proposal.
- **B5 — Formalize the `amends`/`revisionHistory` relationships (→ draft RFC-0157, policy).** Two non-schema frontmatter keys exist: `amends: RFC-0149` (RFC-0152) and `revisionHistory:` (RFC-0008). They carry real meaning the schema can't express ("partially modifies" is weaker than supersedes). Either add first-class `amends`/`amendedBy` (+ revision log) to `RfcFrontmatter` or migrate them into the body. Until then they are intentionally retained.
- **B6 — `rfc.index.generate` / supersession-graph + formalized `amends` (→ draft RFC-0157, policy).** Phase-2 command RFC-0001 deferred; lets agents query relationships without parsing 138 files; folded together with the `amends`/`revisionHistory` formalization (B5).
- **B7 — Sync the DNA registry (non-RFC doc action).** Add `DNA-37` (runtime + authored content-shape prop unification) and `DNA-38` (standardized authored section-content contracts) to `docs/architecture-dna.md`; they are introduced by RFC-0035/0100 and referenced by RFC-0100/0101/0102/0103/0106 but undefined in the canonical doc. Normalize DNA/AP id zero-padding while there. (RFC-0153 V-18 would then enforce DNA/AP referential integrity.)

## Open items for the founder

- **W1 flipped every `accepted`/`draft` to `implemented` or `superseded`** — the process had no genuinely "accepted-but-unbuilt" RFC; `accepted` was a way-station the author rarely advanced. If any RFC was _intentionally_ parked as accepted-not-implemented, flag it and it will be reverted.
- **RFC-0024 / RFC-0032 were `draft`** and flipped straight to `implemented` (their substance — business layer, share extraction — is live). W3 confirmed their criteria; RFC-0024's "`--app main` once it graduates" criterion is the only one left unchecked (apps-todo/main has not graduated).
- **Strict supersession** flipped 10 RFCs to `superseded` (incl. 0018/0022/0029/0030/0079 that were `implemented`). They remain historically valid; the flip means "the governing decision now lives in the superseding RFC."
