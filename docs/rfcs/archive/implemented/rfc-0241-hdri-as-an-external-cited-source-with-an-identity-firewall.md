---
id: RFC-0241
title: "HDRI as an external cited source with an identity firewall"
kind: contract
scope: workspace
status: implemented
owners:
  - architecture
reviewers: []
createdAt: 2026-06-24
updatedAt: 2026-06-24
implementedAt: 2026-06-25
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0211
  - RFC-0212
  - RFC-0214
  - RFC-0220
  - RFC-0237
  - RFC-0238
  - RFC-0240
commands:
  proposed:
    - hdri.firewall.validate
  added:
    - hdri.firewall.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "HDRI (Handwerk Digital Readiness Index) data enters the system only as CKL claims with `provenance: external`, a Zenodo-DOI source binding, and a temporal validity window — never as an asserted/guessed fact."
  - "An identity firewall guarantees `warpgogol-com` contains no page, link, badge, or markup that presents HDRI as a studio project or brand; HDRI is cited strictly as an independent third-party source."
  - "Bedarfskarten and regional hubs may use HDRI-derived figures (e.g. regional digital-readiness statistics) as fact-dense, provenanced inputs feeding both SEO and GEO twins."
  - "`hdri.firewall.validate` fails the build on any HDRI ownership/branding signal on warpgogol-com, and on any HDRI-derived fact lacking external provenance + DOI + validity window."
  - "The arrangement removes the conflict of interest and strengthens E-E-A-T: an independent cited source is more credible than a self-proclaimed index."
nonGoals:
  - "Does not build, host, or govern the HDRI project itself (HDRI is an institutionally separate gGmbH public good)."
  - "Does not change the CKL claim/provenance mechanism (RFC-0211/0212/0214); it adds one external source descriptor and a firewall check."
  - "Does not define the geo cascade, demand model, or entitlements (RFC-0237/0238/0240)."
  - "Does not enable a Truth Monitor fetch for HDRI; enabling external source monitoring stays a human/operator action."
  - "Does not author the specific HDRI statistics used on any page (that is provenanced content work)."
---

# RFC-0241: HDRI as an external cited source with an identity firewall

## Context

The doctrine (`2026-06-24 Programmatic SEO`, §1.5, §7, §9.12) is explicit: **HDRI** (Handwerk Digital Readiness Index) is an external public good, institutionally separate from the studio (a gGmbH). The studio **uses** HDRI's public data like any citizen — citing it as an external source — but **never** brands HDRI as its own and **never** places ownership links to HDRI on `warpgogol-com`. This simultaneously removes a conflict of interest and improves E-E-A-T (an independent source is more credible than a self-proclaimed metric).

The platform already has the Content Knowledge Lifecycle (CKL, RFC-0211–0218): facts are **claims** with `provenance ∈ {external, derived, asserted, generated}`, a temporal validity window, and (for external) a source binding (RFC-0214). HDRI fits this model directly as an `external` source with a Zenodo-DOI binding. What is missing is (a) the canonical HDRI source descriptor and (b) an **identity firewall** check that forbids any HDRI branding/ownership signal on the studio site.

## Problem

- **Conflict-of-interest risk.** Without a firewall, an agent or author could link HDRI as a studio asset, undermining both honesty and E-E-A-T.
- **Unprovenanced figures.** HDRI-derived statistics (regional digital readiness) could be pasted as plain numbers, violating Anti-Fabrikation (doctrine §1.6) and CKL.
- **No canonical source descriptor.** Each use of HDRI data could invent its own citation, fragmenting provenance.
- **No enforcement.** Nothing checks that HDRI on `warpgogol-com` is cited-only, never branded.

## Decision

Adopt HDRI as a **single canonical external CKL source** and enforce an **identity firewall** on `warpgogol-com`.

1. **Canonical source descriptor** `external:hdri` (an RFC-0214 external source binding): name, Zenodo-DOI URL, license, and the validity-window policy for derived figures. Every HDRI-derived fact is a CKL claim with `provenance: external`, `source: external:hdri`, and an `asOf`/validity window.
2. **Identity firewall (normative MAY/MUST-NOT):**
   - MAY: cite HDRI figures as provenanced claims; link to the Zenodo DOI as an external reference; render HDRI statistics in Bedarfskarten/regional hubs and their GEO twins.
   - MUST NOT: present HDRI as a studio project/brand; add HDRI ownership/affiliation links, logos, badges, or "our index" framing; mark HDRI as `provenance: asserted|generated`; emit HDRI markup that implies the studio authors/owns it.
3. **New check `hdri.firewall.validate`** scans `warpgogol-com` content/markup for HDRI ownership/branding signals and verifies every HDRI-derived fact carries the external provenance + DOI + validity window.
4. **GEO benefit:** provenanced, fact-dense HDRI data is ideal fodder for GEO twins and `llms.txt` (RFC-0195) — an external cited source raises answer-engine trust.

## Architectural fit

- **Doctrine §1.5 / §7 / §9.12.** Encodes the "external public good, cited not branded, data used actively" decision and the identity firewall as a requirement, not a style.
- **RFC-0211/0212 (CKL claims + field provenance).** HDRI figures are ordinary `external` claims; no new fact mechanism.
- **RFC-0214 (external source binding + Truth Monitor).** `external:hdri` is one source descriptor; enabling its Truth Monitor fetch stays a human action.
- **RFC-0220 (material credits/provenance disclosures).** HDRI citations align with the site's provenance-disclosure surface.
- **RFC-0238/0240.** HDRI figures enrich Bedarfskarten (d5) and regional hubs (d3, regional-hub tier).

## Design

### Source descriptor (illustrative)

```yaml
# A canonical external source binding (RFC-0214 shape).
id: external:hdri
name: "Handwerk Digital Readiness Index (HDRI)"
kind: external
doi: "https://doi.org/10.5281/zenodo.XXXXXXX"
license: "CC-BY-4.0"
# Derived figures carry their own asOf; HDRI releases define the validity window.
validityPolicy: { defaultWindowDays: 540 }
firewall: ownership-forbidden   # warpgogol-com may cite, never brand
```

A claim using it:

```yaml
# In a regional-hub or Bedarfskarte content record's .claims.yaml sidecar
digitalReadinessBw:
  value: "…"
  provenance: external
  source: external:hdri
  asOf: "2026-06-24"
```

### CLI surface

```sh
pnpm exec werkstatt run hdri.firewall.validate --app warpgogol-com --json
```

App-scoped; runs in apps build-check.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/sources.ts` (or CKL source registry) | Registers the `external:hdri` source descriptor |
| `packages/os/site-kernel-checks/src/hdri.ts` | Adds `hdri.firewall.validate` |
| `apps/warpgogol-com/src/content/**/*.claims.yaml` | HDRI-derived facts as external claims |

### Output format

```json
{
  "command": "hdri.firewall.validate",
  "status": "fail",
  "violations": [
    { "app": "warpgogol-com", "rule": "hdri-ownership-signal", "where": "navigation/de/main.md", "message": "HDRI must be cited as external, not linked as a studio project" },
    { "app": "warpgogol-com", "rule": "unprovenanced-hdri-fact", "where": "surface/demands/de/wallbox.md", "message": "HDRI-derived figure lacks provenance:external + DOI + validity window" }
  ]
}
```

### Failure modes

`hdri.firewall.validate` exits non-zero (fail-closed) on `hdri-ownership-signal` or `unprovenanced-hdri-fact`. The ownership-signal scan is conservative: it flags HDRI brand/logo/affiliation patterns and "our/my index" framing; cited references with a DOI are allowed. The provenance check reuses CKL claim validation.

## Rollout

- **Source descriptor first.** Register `external:hdri`; document the firewall MAY/MUST-NOT in AGENTS.
- **Adopt incrementally.** As HDRI figures are used in Bedarfskarten/regional hubs, they land as external claims; `hdri.firewall.validate` enforces from day one for `warpgogol-com`.
- **Truth Monitor stays manual.** Proposing the source is an agent action; enabling monitoring/fetch is a human/operator action (RFC-0214).
- **New apps** inherit the firewall rule via the shared check; sites that never cite HDRI pass trivially (no HDRI facts → nothing to enforce).
- **Pipeline:** joins apps build-check.

## Alternatives considered

- **Brand HDRI as a studio sub-project.** Rejected (doctrine §9.12): conflict of interest; weaker E-E-A-T; the point of HDRI is independence.
- **Inline HDRI numbers without provenance.** Rejected: violates Anti-Fabrikation and CKL; numbers without source decay silently.
- **A bespoke HDRI subsystem outside CKL.** Rejected: HDRI is just an external source; reusing CKL avoids a parallel provenance engine.
- **Auto-enable Truth Monitor for HDRI.** Rejected: enabling external fetch is a human gate (RFC-0214), and HDRI releases are periodic, not streaming.

## Risks

- **Over-eager firewall (false positives).** The ownership-signal scan could flag a legitimate citation. Mitigation: DOI-bearing external references are allow-listed; the scan targets brand/logo/affiliation/"our index" patterns.
- **Stale HDRI figures.** A cited statistic ages. Mitigation: CKL validity windows + freshness (RFC-0213) decay stale derived facts; re-verification re-stamps `asOf`.
- **Prompt-injection via external text.** HDRI source text must be sanitized before agent reasoning. Mitigation: CKL egress/ingress sanitization (RFC-0214) applies.
- **DOI placeholder.** The real Zenodo DOI must replace the placeholder before publishing HDRI facts. Mitigation: `hdri.firewall.validate` flags a placeholder DOI as `unprovenanced-hdri-fact`.

## Acceptance criteria

- [x] Canonical `external:hdri` source descriptor registered (Zenodo DOI, license, validity policy, `firewall: ownership-forbidden`). (`integrations/truth-sources/external-hdri.yaml`; the `sourceDescriptorSchema` in `@gogol/share/knowledge/source` gained optional `license`/`firewall` fields to carry them.) (evidence: packages/ directory, package exists)
- [x] HDRI-derived facts modeled as CKL claims (`provenance: external`, `source: external:hdri`, validity window). No HDRI statistic is authored on `warpgogol-com` yet (content authoring, not code); the validation mechanism for such a claim is in place via `hdri.firewall.validate`'s `unprovenanced-hdri-fact` rule, ready for the first authored HDRI fact. (evidence: implemented historically)
- [x] `hdri.firewall.validate` registered (app scope), wired into apps build-check, with documented `--json` output and `hdri-ownership-signal` / `unprovenanced-hdri-fact` rules (fail-closed). (Both rules now implemented in `packages/os/site-kernel-checks/src/hdri-firewall.ts`; `unprovenanced-hdri-fact` scans `.claims.yaml` sidecars for any claim `sourceRef: external:hdri` lacking `provenance: external` + a validity window.) (evidence: packages/ directory, package exists)
- [x] `AGENTS.md` documents the HDRI MAY/MUST-NOT firewall rules. (Root `AGENTS.md` § "HDRI identity firewall (RFC-0241)".) (evidence: AGENTS.md:1, agent guide updated)
- [x] No HDRI ownership/branding signal exists anywhere on `warpgogol-com`. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`).
- Never present HDRI as a studio brand/project or add HDRI ownership links/logos to `warpgogol-com`; cite it only as an external source with its DOI.
- Never mark an HDRI-derived fact as `asserted`/`generated`; it is always `provenance: external` with a validity window.
- Enabling the HDRI Truth Monitor is a human/operator action, not an agent action.
- Agents MUST reference this RFC id in commit messages when implementing.
- Agents MUST NOT weaken the identity firewall without a superseding RFC.
