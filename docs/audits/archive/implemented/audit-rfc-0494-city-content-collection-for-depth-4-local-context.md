---
rfcId: RFC-0494
auditId: AUDIT-RFC-0494-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0494

## Verdict: Needs revision

The RFC's proposed `expand.ts` code snippet contains a pluralization bug (`${axis.id}s` produces `"citys"` not `"cities"`) that would prevent the feature from working. The `versionBump: minor` declaration without a migrator is internally contradictory — if the change is a no-op for existing sites (which the RFC argues), it is `patch`, not `minor`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0494 --json` exits 0 with zero violations.

## Axis A — Structural completeness

1. **Code snippet pluralization bug.** The RFC's `expand.ts` code snippet (line 151) uses `loadDataset(ctx.appDir, \`${axis.id}s\`, l)` to derive the collection name. The blueprint (`packages/ontology/blueprints/website-local.yaml:25`) declares `id: city`, so `${axis.id}s`produces`"citys"`. But the doorway-risk validator (`packages/os/site-kernel-checks/src/surface-doorway-risk.ts:103`) loads `"cities"`— the correct English plural. The code would load from`surface/citys/{lang}/`(nonexistent) instead of`surface/cities/{lang}/`, making the merge a permanent no-op. The RFC's prose says "cities" correctly, but the code is wrong. The implementation must derive the collection name from the provider name (`geo.cities`→`"cities"`) or use an explicit axis-to-collection mapping, not naive `+s` pluralization.

2. **TypeScript contracts are minimal and adequate.** The `CityContentFields` interface is documentation-only — no new interfaces are introduced in `@gogol/surface`. This is consistent with the design (fields are plain frontmatter merged into `axisDataByLang`).

3. **File system responsibilities table is concrete** — names exact paths in `packages/os/site-kernel-checks/src/surface-expand/`.

4. **Failure modes are well-specified** — missing directory, slug mismatch, missing fields, language fallback all documented with expected behavior.

## Axis B — DNA alignment

1. **`versionBump: minor` without migrator is contradictory.** The RFC declares `versionBump: minor` (Breaks-B, requires migrator per RFC-0478) but argues no migrator is needed because "there are no existing city content records to migrate." The RFC's own Rollout section states: "if the directory does not exist, `loadDataset` returns `[]` and the merge is a no-op" — meaning existing sites produce identical output. If the change is a no-op for all existing sites, it is not Breaks-B, and the correct declaration is `versionBump: patch`. The Risks section's defense ("Breaks-B without migrator") is circular: if there is nothing to break, it is not Breaks-B. Either change to `patch` or justify why the `axisDataByLang` shape change is a real break for existing consumers.

2. **DNA-24 (Block-declarative pages):** Correctly satisfied — `uniqueIntro`, `uniqueFaq`, `localEvidence` map to existing block types (hero lead, md, listCards). No new archetypes.

3. **DNA-53 (Semantic fingerprint governance):** Correctly satisfied — no new ad hoc hashing helpers. The RFC reuses `loadDataset`.

## Axis C — Ecosystem fit

1. **`@gogol/surface` incorrectly listed in `packagesImpacted`.** The RFC body explicitly states "No new interfaces are introduced in `@gogol/surface`" (line 208). All code changes are in `@gogol/site-kernel-checks` (`expand.ts`, `bake.ts`, `bake-helpers.ts`). Remove `@gogol/surface` from `packagesImpacted` unless a real change to the package is identified.

2. **Compass sync not mentioned.** The RFC modifies `expand.ts`, `bake.ts`, and `bake-helpers.ts` — all existing authored source files with `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass blocks (DNA-42). The RFC does not mention updating these blocks. Per root AGENTS.md Compass document duties, the implementation must add `<item>RFC-0494: ...</item>` entries to each file's `CHANGE_SUMMARY`.

3. **Command lifecycle is consistent.** `commands.changed: ["surface.generate"]` is correct — the command's behavior changes implicitly through `expand.ts`. No new commands are proposed.

## Axis D — Forward-only compliance

No issues. The RFC does not propose compatibility shims, dual paths, or legacy preservation. The implicit loading is additive — absent directory = no-op, not a fallback path that keeps old behavior alive alongside new.

## Axis E — Agent-facing policy

1. **Status gate is correct.** The RFC is `status: draft` and does not contain self-authorizing language. Implementation notes correctly reference RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation), and RFC-0330 (verification evidence).

2. **Anti-fabrication is explicit.** Line 283: "Agents MUST NOT fill city content fields with LLM-generated content." The acceptance criteria distinguish between code changes (agent-may-implement) and content authoring (operator-must-author). Good.

3. **Storage policy:** No cookies, no persistence changes. No issues.

## Axis F — Pragmatism

1. **`@gogol/surface` in `packagesImpacted` is incorrect** (see Axis C finding 1).

2. **Naive pluralization convention is unreliable.** The RFC claims the implicit loading "generalizes to future geo-provider axes" (line 250). But `${axis.id}s` produces wrong plurals for `city` → `citys`, `industry` → `industrys`, `country` → `countrys`. Only `region` → `regions` and `demand` → `demands` happen to be correct. The convention should derive the collection name from the provider name (`geo.cities` → `"cities"`) instead.

3. **Scope discipline is good.** `nonGoals` are explicit and meaningful (7 items). `appsImpacted` lists only `warpgogol-com`. The RFC does not over-reach.

## Axis G — Blind spots

1. **Performance of supplementary loading.** The RFC adds one `loadDataset` call per geo-provider axis per language. For the current blueprint (1 geo-provider axis with content, 3 geo-provider axes total, 2 languages), this is 6 additional filesystem scans. Trivial for 6 cities, but the RFC claims generalization to future axes. A blueprint with N geo-provider axes × L languages adds N×L scans. Not a bottleneck today, but the RFC should note the cost.

2. **Edge case: content record with extra fields.** The RFC says the merge is shallow — content fields overlay geo fields. If a content record accidentally includes a `name` field that differs from the geo name, the content value silently wins. The RFC mentions this ("content is more specific") but doesn't describe a validation path to catch accidental geo-field overrides.

3. **No `breaksC` field needed.** The RFC doesn't change URL schema, JSON-LD types, or sitemap shape. Adding new blocks to depth-4 pages changes page content but not Layer C surfaces. Correctly absent.

## Questions for the author

1. The proposed code uses `${axis.id}s` to derive the collection name, but `city` + `s` = `citys`, not `cities`. Will the implementation derive the collection name from the provider name (`geo.cities` → `"cities"`) or use an explicit mapping? How will this generalize correctly to future geo-provider axes?

2. If the change is a no-op for all existing sites (no `surface/cities/` directory exists), why is `versionBump: minor` instead of `patch`? What concrete existing data contract is broken?

3. Why is `@gogol/surface` listed in `packagesImpacted` when the RFC explicitly states no new interfaces are introduced there?
