---
id: RFC-0215
title: "Derived-content staleness: derivedFrom and sourceHash stamping for translations and generated copy"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-20
updatedAt: 2026-06-20
implementedAt: 2026-06-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0044
  - RFC-0045
  - RFC-0174
  - RFC-0197
  - RFC-0203
  - RFC-0207
  - RFC-0211
  - RFC-0212
  - RFC-0216
commands:
  proposed:
    - content.derived.stamp
    - content.derived.validate
  added:
    - content.derived.stamp
    - content.derived.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - business
  - share
  - os
successSignals:
  - "When a source paragraph changes, every translation and copy derived from it is automatically flagged outdated instead of silently passing coverage checks."
  - "A reviewer can re-stamp a derivative after updating it, recording exactly which source version it now reflects."
  - "The frozen-provenance pattern proven for enriched pSEO content (RFC-0197/0207) becomes the general mechanism for all derived content."
nonGoals:
  - "Does not auto-translate or auto-regenerate derivatives; it detects staleness and records currency."
  - "Does not replace coverage/mirroring checks; it adds the time dimension they lack."
  - "Does not apply to live references {collection.file.field} (RFC-0045), which resolve fresh by construction."
---

# RFC-0215: Derived-content staleness: derivedFrom and sourceHash stamping for translations and generated copy

## Context

The platform already guarantees that a _referenced_ value cannot go stale: `{collection.file.field}` (RFC-0045) resolves live at render, so a price referenced across pages is always current. The gap is **copied** content. A translation is not a reference — it is an independent copy of a source paragraph. `mirroring.validate` and `content.coverage.validate` confirm a translation _exists_; nothing confirms it still _reflects the current source_. A German price description edited today leaves the Ukrainian translation structurally valid but semantically stale, and every check passes.

RFC-0197/0207 already solved a closely related problem for pSEO: enriched content is generate-once, _frozen_, _provenanced_, hashed, and `approved`. This RFC lifts that exact pattern out of the surface module and makes it the general contract for any derived content — translations first.

## Problem

Derived content (translations, summaries, generated narrative copies, localized legal notices) silently diverges from its source over a site's lifetime because:

- the derivative stores no link to the specific source it was produced from;
- it stores no fingerprint of that source at derivation time, so "did the source change since?" is unanswerable;
- existence/coverage checks are blind to staleness — a stale translation is indistinguishable from a current one.

This is the "перевод рассинхронизировался" failure: on one language the text was updated, on another the old version remains, and the build is green.

## Decision

Introduce a **derivation stamp** on derived content: `derivedFrom` (the source subject — collection, file, fieldPath, lang) plus `sourceHash` (a normalized hash of the source value at the moment the derivative was produced/approved). A new workspace validator `content.derived.validate` recomputes each source's current hash and flags any derivative whose stored `sourceHash` no longer matches as `outdated`. `content.derived.stamp` (re)writes the stamp after a human/agent has updated the derivative, recording the new source hash and bumping the derivative's `asOf`.

The stamp lives in the RFC-0212 claim sidecar (`provenance: derived`), so derivation is just a claim specialization — no new file kind.

### Lifecycle

```
author source paragraph  ──►  derive translation  ──►  stamp(derivedFrom, sourceHash=H0, asOf)
source paragraph edited (hash → H1)                ──►  content.derived.validate: H0 ≠ H1 → OUTDATED
update translation, re-approve                     ──►  content.derived.stamp: sourceHash=H1, asOf bumped
```

While a derivative is `outdated`, policy (per `system.md`) chooses: report only, show with a "translation pending" notice (reuse RFC-0174 legal-translation notice machinery), or `noindex` the affected page.

## Architectural fit

- **Generalizes RFC-0197/0207.** The frozen + hash + `approved` model of enriched content is the template; this RFC factors the hash/stamp/compare logic into `@gogol/share` and applies it to translations and any generate-once copy. Enriched content becomes one consumer of the shared mechanism.
- **Claim model (RFC-0211/0212).** A derivative is a `provenance: derived` claim carrying `derivedFrom` + `sourceHash`. No new annotation surface.
- **References (RFC-0045) untouched.** Live references resolve fresh and are explicitly out of scope — only copies need stamping.
- **Coverage/mirroring complement.** `content.derived.validate` adds the temporal axis those checks lack; it does not replace them.
- **RFC-0203 Diagnostics + planner (RFC-0216).** `outdated` is a Diagnostic and a planner task ("refresh UK translation of offer.priceDescription against DE source").

## Design

### CLI surface

```sh
pnpm exec werkstatt run content.derived.validate --app warpgogol-com
pnpm exec werkstatt run content.derived.validate --app warpgogol-com --json
# Re-stamp after updating a derivative (records current source hash + bumps asOf)
pnpm exec werkstatt run content.derived.stamp --app warpgogol-com \
  --subject "business/uk/offer#priceDescription"
```

### Stamp shape (in the claim sidecar)

`src/content/business/uk/offer.claims.yaml`:

```yaml
priceDescription:
  provenance: derived
  derivedFrom: "business/de/offer#priceDescription"   # source subject (RFC-0044 stem + fieldPath)
  sourceHash: "sha256:9f2c…"                            # normalized hash of DE value at derivation
  asOf: 2026-06-20
  owner: agent:localization
```

### TypeScript contracts

```ts
export interface DerivationStamp {
  derivedFrom: ClaimSubject;   // RFC-0211
  sourceHash: string;          // normalized hash (whitespace/markup-insensitive)
  asOf: string;
}

export type DerivedState = "current" | "outdated" | "source-missing";

export interface DerivedLedgerEntry {
  subject: ClaimSubject;       // the derivative
  source: ClaimSubject;
  state: DerivedState;
  storedHash: string;
  currentHash?: string;        // absent when source-missing
}
```

Hash normalization is whitespace- and markup-insensitive (so a cosmetic reflow of the source does not falsely mark every translation stale) but content-sensitive (a wording or number change does). The normalizer is shared with the enriched-content hasher.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/knowledge/derivation.ts` | Stamp schema, normalized hasher, compare (shared with RFC-0207) |
| `packages/os/site-kernel-checks/src/content-derived.ts` | `content.derived.validate` + `content.derived.stamp` |
| `src/content/business/{lang}/*.claims.yaml` | Carries `derivedFrom` + `sourceHash` on derived claims |
| `src/content/system.md` | `derivation.policy`: outdated handling (report / notice / noindex) |

### Output format

```json
{
  "command": "content.derived.validate",
  "status": "pass",
  "diagnostics": [
    {
      "ruleId": "CKL-DERIV-01",
      "severity": "warning",
      "file": "src/content/business/uk/offer.claims.yaml",
      "line": 4,
      "message": "Derivative offer.priceDescription (uk) is outdated: source business/de/offer#priceDescription changed since sha256:9f2c…",
      "fix": "Update the UK translation, then run content.derived.stamp --subject business/uk/offer#priceDescription"
    }
  ]
}
```

### Failure modes

`CKL-DERIV-01` (`outdated`) is `warning` by default; per `system.md derivation.policy` it may be promoted to `error` for contract-critical content (e.g. legal notices, prices). `CKL-DERIV-02` (`source-missing`: `derivedFrom` points at a subject that no longer exists) is `error` — a dangling derivation is a real defect. `content.derived.stamp` refuses to stamp when the source subject does not resolve, preventing a stamp from masking a broken link.

## Rollout

1. Factor the enriched-content hasher into `packages/share/src/knowledge/derivation.ts`; refactor RFC-0207's enrich flow onto it with parity.
2. Land `content.derived.validate` at `warning`; land `content.derived.stamp`.
3. Backfill stamps for existing translated business records on `warpgogol-com` (DE↔UK) via agent localization (RFC-0218), establishing the baseline hashes.
4. Promote `CKL-DERIV-01` to `error` for legal/price content via `derivation.policy` once the baseline is stamped and clean.

## Alternatives considered

- **Translation-management system (Crowdin/TMS) as source of truth.** Rejected as primary: re-creates a second store outside the repo; the stamp keeps derivation status version-controlled. A TMS may _feed_ stamps later.
- **Compare full rendered text instead of a hash.** Rejected: noisy, slow, and couples to markup; a normalized content hash is stable and cheap.
- **Treat translations as references.** Rejected: natural-language translation is not a substitutable reference; it is a human/agent transformation that must be re-done, not re-resolved.
- **Block any outdated derivative immediately.** Rejected: too brittle for non-critical copy; criticality is author-declared and promotion staged, consistent with RFC-0213.

## Risks

- **Hash sensitivity tuning.** Too sensitive → false `outdated` on cosmetic edits; too loose → misses real changes. Mitigated by the shared normalizer (markup/whitespace-insensitive) and tests against real edit patterns.
- **Backfill cost.** Stamping existing translations is a one-time effort. Mitigated by `content.derived.stamp` operating in batch and by agents doing it at adoption (RFC-0218).
- **Source identity churn.** Renaming a source field breaks `derivedFrom`. Mitigated: `CKL-DERIV-02` catches it as `source-missing`, and RFC-0044 locale-independent stems keep cross-language links stable.

## Acceptance criteria

- [x] Shared `derivation.ts` (normalized hasher + compare). _Enrich (RFC-0207) keeps its own hasher for now; folding it onto this shared hasher is a low-risk follow-up to avoid touching the frozen-provenance path in the same change._ (evidence: implemented historically)
- [x] `content.derived.validate` registered, emits RFC-0203 Diagnostics: `CKL-DERIV-01` outdated (warning), `CKL-DERIV-02` source-missing/malformed (error). _Registered at **app** scope (not workspace) for consistency with the other CKL content validators and the per-app author pipeline._ (evidence: implemented historically)
- [x] `content.derived.stamp` registered; refuses to stamp against a non-resolving source (verified). (evidence: implemented historically)
- [x] `derived` claims carry `derivedFrom` + `sourceHash` in the RFC-0212 sidecar; no new file kind. (evidence: implemented historically)
- [x] `system.md` criticality promotion (`knowledge.derivation.critical`) controls outdated → blocking. _Render-side handling modes (notice / noindex) are deferred to the rendering integration; validate currently reports + gates._ (evidence: implemented historically)
- [x] DE↔UK translation on `warpgogol-com` stamped (`uk/company#tagline`); unstamped/changed source ⇒ outdated, re-stamp ⇒ current (verified end-to-end + unit-tested). (evidence: implemented historically)
- [x] `docs/COMMANDS.md` + `AGENTS.md` updated; `rfc.validate` passes on this file. (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Agents MUST re-stamp a derivative ONLY after actually updating it to reflect the current source — never stamp to silence an `outdated` warning without doing the work.
- Agents MUST set `derivedFrom` to the locale-independent source stem (RFC-0044) so cross-language links survive locale moves.
- Agents MUST NOT mark live references (RFC-0045) as derived; only copies carry stamps.
- Agents MUST reuse the shared normalized hasher, never an ad-hoc hash, so enriched and derived content agree on what "changed" means.
