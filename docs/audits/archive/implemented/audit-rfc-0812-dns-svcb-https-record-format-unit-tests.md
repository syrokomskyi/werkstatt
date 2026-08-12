---
rfcId: RFC-0812
auditId: AUDIT-RFC-0812-01
date: 2026-08-12
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0812

## Verdict: Needs revision

The RFC correctly identifies a real test gap (no unit tests for `toApiRecord`), but contains three factual errors about the codebase and one convention mismatch that would produce a non-functional acceptance probe and a misplaced test file.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0812 --json` returns exitCode 0, zero violations.

## Axis A — Structural completeness

- **Acceptance probe command is wrong.** The probe runs `werkstatt run vitest -- packages/werkstatt/src/dns/tests/dns-record-upsert.test.ts`, but there is no `werkstatt run vitest` command. The correct test invocation is `pnpm --filter @warpgogol/werkstatt run test` (which runs `vitest run`) or `pnpm exec vitest run packages/werkstatt/src/dns/dns-record-upsert.test.ts` for a single file. The probe will fail at implementation time.
- **Test path uses non-existent `tests/` subdirectory.** The RFC proposes `packages/werkstatt/src/dns/tests/dns-record-upsert.test.ts`, but all existing DNS tests are colocated directly in `packages/werkstatt/src/dns/`: `dns-helpers.test.ts`, `dns-records-schema-validate.test.ts`, `txt-normalize.test.ts`. There is no `tests/` subdirectory anywhere in `packages/werkstatt/src/dns/`. The file system responsibilities table and acceptance probe both use the wrong path.
- **AAAA record missing from test plan.** The Problem section (line 54) lists "A, AAAA, CNAME, TXT, SVCB, HTTPS" as handled types, but the Decision section (lines 60-66) and acceptance criteria omit AAAA. Either add an AAAA test or explicitly list it as a non-goal.

## Axis B — DNA alignment

No issues. The RFC is `kind: command` with no `satisfies[]` — no DNA invariants are claimed or conflicted with.

## Axis C — Ecosystem fit

- **Test placement convention mismatch.** As noted in Axis A, the existing convention in `packages/werkstatt/src/dns/` is colocated tests (`*.test.ts` next to `*.ts`), not a `tests/` subdirectory. The RFC should follow the existing convention: `packages/werkstatt/src/dns/dns-record-upsert.test.ts`.
- **`DnsRecordDeclaration` import path not documented.** The type is imported from `@warpgogol/werkstatt-site/ontology/schemas` (line 38 of `dns-record-upsert.ts`), not defined locally. The RFC's implementation notes say "The `DnsRecordDeclaration` type used in tests should match the existing type in `dns-record-upsert.ts`" but don't mention the actual import path. The test file will need this import.

## Axis D — Forward-only compliance

No issues. The RFC adds tests only — no compatibility shims, no legacy paths.

## Axis E — Agent-facing policy

No issues. Status gate is correct (draft → accepted before implementation). Implementation notes correctly state tests should verify current behavior, not change it.

## Axis F — Pragmatism

- **TXT test claim is factually wrong.** The RFC's Decision section (line 66) says "TXT record: Verify `content` is passed through." But the actual implementation at line 182 of `dns-record-upsert.ts` applies `normalizeTxtContent(declared.content)` for TXT records — it is NOT a pass-through. The test must verify normalized content, not raw pass-through.
- **`priority`, `ttl`, `comment` optional fields untested.** The `toApiRecord` function handles `declared.priority` (line 184), `declared.ttl` (lines 175, 185), and `declared.comment` (lines 176, 186) as optional fields. The RFC's test plan doesn't cover any of these. At minimum, one test should verify these fields are included when present and omitted when absent.

## Axis G — Blind spots

- **Quoted values in SVCB content not addressed.** The implementation uses `split(/\s+/)` to parse SVCB/HTTPS content (line 165). DNS SVCB values can contain quoted strings with spaces (e.g. `alpn="h3,h2" dohpath="/dns-query{?dns}"`). The RFC's Risks section (line 169) mentions this fragility but the edge case tests (line 68) don't specify testing quoted values. An edge case test with a quoted value would document the current (broken) behavior.
- **Single-part content edge case is vague.** The RFC says "single-part content" (line 68) but doesn't define it. Does this mean content `"1"` (only priority, no target)? The current code would set `target = "."` (fallback) and `value = ""`. The expected behavior should be stated explicitly.

## Questions for the author

1. Should the test file be colocated at `packages/werkstatt/src/dns/dns-record-upsert.test.ts` (matching existing convention) or in a new `tests/` subdirectory (breaking convention)?
2. The acceptance probe command `werkstatt run vitest` does not exist — what is the correct command? Should it be `pnpm --filter @warpgogol/werkstatt run test`?
3. The TXT record test claims "content is passed through" but the implementation applies `normalizeTxtContent()` — should the test verify normalized output instead?
