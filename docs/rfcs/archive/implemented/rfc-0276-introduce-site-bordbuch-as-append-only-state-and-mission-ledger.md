---
id: RFC-0276
title: "Introduce site Bordbuch as append-only state and mission ledger"
status: superseded
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-03
updatedAt: 2026-07-05
implementedAt: 2026-07-05
closedAt: 2026-07-20
supersedes: []
supersededBy: RFC-0473
amends: []
amendedBy: []
related:
  - RFC-0169
  - RFC-0192
  - RFC-0197
  - RFC-0215
  - RFC-0217
  - RFC-0221
  - RFC-0245
  - RFC-0255
  - RFC-0269
  - RFC-0271
  - RFC-0272
  - RFC-0274
  - RFC-0275
commands:
  proposed:
    - site.bordbuch.append
    - site.bordbuch.generate
    - site.bordbuch.validate
    - site.bordbuch.status
  added:
    - site.bordbuch.append
    - site.bordbuch.generate
    - site.bordbuch.validate
    - site.bordbuch.status
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
successSignals:
  - "Every meaningful site operation can append a mission/event to a hash-chained Bordbuch ledger."
  - "A site exposes a noindex Bordbuch status page that explains current module state, review queues, validation state, and recent missions."
  - "Stellarpass, Bordbuch, Sichtpass, and Quartalsbericht have separate roles and cross-links without replacing each other."
  - "PSEO generation, translation readiness, target-locale review, validation, and observability transitions are visible as site history, not scattered command output."
nonGoals:
  - "Do not build a real-time analytics dashboard."
  - "Do not make Bordbuch a public SEO surface."
  - "Do not replace Stellarpass, Sichtpass, Quartalsbericht, or the CKL ledger."
  - "Do not require implementation of the full fleet Leitstand in this RFC."
---

# RFC-0276: Introduce site Bordbuch as append-only state and mission ledger

## Context

The platform already has several adjacent concepts:

- Stellarpass answers "what is the signed state of this site now?"
- Quartalsbericht answers "what happened over this quarter, in a client-readable report?"
- Sichtpass is the private client-facing access/passport surface.
- CKL ledgers record factual claim lineage.
- Pipeline telemetry records command timing.

The missing object is the continuous operational story of a site: how the current state came to be, which missions ran, which generated artifacts are waiting for review, which translations are stale, which validators are red, and which PSEO experiments are currently active.

The Bordbuch notes define exactly this missing role: an append-only mission log with errata, hash-chain integrity, reverse-chronological navigation, and cross-links to Stellarpass. This RFC brings that concept into the Site OS as a first-class state and mission ledger.

## Problem

Without a Bordbuch:

- important state transitions live only in terminal output, generated files, or scattered validation reports;
- a developer cannot open one page and see whether a site is healthy, blocked, awaiting translation review, or drifting;
- PSEO lifecycle decisions are hard to audit after the fact;
- future Leitstand/fleet automation lacks a per-site ledger to consume;
- Sichtpass and Quartalsbericht are tempted to absorb operational status that does not belong in their genre.

## Decision

Each managed site gains a **Bordbuch**: an append-only, hash-chained mission/event ledger plus generated noindex projections.

The ledger records meaningful state transitions, not raw logs. Examples:

- deploy completed;
- Stellarpass emitted;
- PSEO surface generated;
- PSEO artifact approved;
- artifact marked ready for translation;
- translation generated;
- target-language QA failed/passed;
- validator changed from red to green;
- GSC import updated PSEO cluster metrics;
- Quartalsbericht archived;
- Sichtpass issued or revoked;
- Notausgang export verified.

Bordbuch has two generated projections:

1. `/.well-known/bordbuch.json`: machine-readable ledger projection with hash-chain validation metadata.
2. `/.well-known/bordbuch`: noindex human-readable status and history page, with filters and anchors.

For client sites, access policy may route the HTML projection through Sichtpass or another private access layer. The JSON projection may be public, private, or partially redacted by policy, but it is never an SEO page.

## Architectural fit

- Stellarpass remains the current signed state; Bordbuch records the path through missions and links to relevant Stellarpass versions.
- Quartalsbericht can summarize Bordbuch events each quarter; it does not replace the ledger.
- Sichtpass can expose Bordbuch/Quartalsbericht to the client; it is an access and ownership surface, not the source ledger.
- RFC-0217 CKL remains claim-specific lineage; Bordbuch records site missions and may link to claim ledger events.
- RFC-0271..0275 PSEO lifecycle events become observable through Bordbuch entries.
- Future Leitstand reads many site Bordbücher and status projections; Bordbuch is the per-site primitive.

## Design

### Event shape

```ts
export interface BordbuchEvent {
  id: string;                 // mission-000001 style, monotonic per site
  site: string;
  occurredAt: string;         // ISO
  kind:
    | "deploy"
    | "stellarpass"
    | "pseo"
    | "translation"
    | "validation"
    | "sichtpass"
    | "quartalsbericht"
    | "notausgang"
    | "erratum";
  status: "done" | "waiting" | "checking" | "escalated" | "aborted";
  title: string;
  summary: string;
  refs?: Array<{ type: string; id: string; href?: string }>;
  erratumOf?: string;
  supersedes?: string[];
  previousHash: string | null;
  hash: string;
}
```

### Storage

The implementation may choose NDJSON or one-file-per-event YAML, but the invariant is append-only:

| Path | Role |
| --- | --- |
| `apps/<app>/src/bordbuch/events.ndjson` | Append-only source ledger, not generated output |
| `apps/<app>/src/bordbuch/status.generated.json` | Generated current state projection |
| `apps/<app>/public/.well-known/bordbuch.json` | Generated machine-readable projection |
| `apps/<app>/public/.well-known/bordbuch/index.html` | Generated human-readable noindex projection |

If another path is chosen during implementation, `generator.ownership.lint` and generated-file governance must still know which files are authored ledger entries and which are generated projections.

### Status projection

`site.bordbuch.status` summarizes current state:

- latest Stellarpass hash and date;
- latest deploy mission;
- validator summary;
- PSEO module context summary;
- PSEO page counts by language, depth, indexability, evidence, and duplicate status;
- enrichment queues: draft, approved, readyForTranslation, translationDraft, translationApproved, outdated;
- translator notes and glossaries by target locale;
- GSC/visibility metrics when configured;
- open escalations and blocking missions.

### CLI surface

```sh
pnpm exec site-kernel run site.bordbuch.append --app warpgogol-com --kind pseo --status done --title "Generated website-local surface"
pnpm exec site-kernel run site.bordbuch.generate --app warpgogol-com
pnpm exec site-kernel run site.bordbuch.validate --app warpgogol-com --json
pnpm exec site-kernel run site.bordbuch.status --app warpgogol-com --json
```

Commands may append automatically after successful high-level operations once this RFC is implemented, but they must append only meaningful mission events. Raw debug output does not belong in Bordbuch.

### Access and indexing

- Bordbuch HTML carries `noindex` and is excluded from sitemap/llms public promotion.
- Client sites may require Sichtpass access for the HTML view.
- Public dogfood sites may expose a redacted Bordbuch as proof of discipline.
- Sensitive values, secrets, personal data, and raw analytics are never written to events.

### Errata

Ledger entries are not edited to rewrite history. Corrections use `kind: erratum` with `erratumOf`. Typos may carry `editedAt` only if the implementation explicitly allows typo-only metadata edits and preserves hash-chain semantics.

## Failure modes

- Hash-chain mismatch: `site.bordbuch.validate` errors.
- Event references a missing Stellarpass/artifact/page id: warning or error by ref type.
- Event contains secrets or personal data patterns: error.
- Generated status projection is stale against ledger hash: error.
- Ledger grows too large for HTML rendering: generator paginates by year and status.

## Rollout

1. Define event schema and hash-chain validator.
2. Add manual `site.bordbuch.append` and generated JSON/HTML projections.
3. Append events from PSEO generation, translation lifecycle, validators, Stellarpass, and Quartalsbericht commands.
4. Add Sichtpass access integration only after the basic projections are stable.
5. Let a future Leitstand read `site.bordbuch.status` across many apps.

## Alternatives considered

- **Use git log as Bordbuch.** Rejected: git tracks code commits, not site missions, generated artifact state, access events, or validation transitions.
- **Use Quartalsbericht as the status page.** Rejected: Quartalsbericht is quarterly and client-readable; Bordbuch is continuous and operational.
- **Use Stellarpass only.** Rejected: Stellarpass signs current state; it does not explain how the site arrived there.
- **Build Leitstand first.** Rejected: fleet control should consume a per-site primitive, not invent its own hidden state store.

## Risks

- Bordbuch can become noisy. Mitigation: only append meaningful mission events and summarize raw telemetry elsewhere.
- Bordbuch can leak sensitive operational data. Mitigation: redaction policy, secret scanning, access controls, and no raw analytics.
- Hash-chain append-only rules can make corrections awkward. Mitigation: errata are a feature; they preserve auditability.

## Acceptance criteria

- [x] Bordbuch event schema and hash-chain algorithm are defined. (evidence: implemented historically)
- [x] `site.bordbuch.append`, `site.bordbuch.generate`, `site.bordbuch.validate`, and `site.bordbuch.status` are registered. (evidence: implemented historically)
- [x] HTML projection is noindex and sitemap/llms-excluded. (evidence: implemented historically)
- [x] Status projection includes PSEO module context, generation queues, translation queues, validation summary, latest Stellarpass, and open escalations. (evidence: implemented historically)
- [x] Erratum semantics are documented and validated. (evidence: implemented historically)
- [x] Secret/personal-data guard exists for event payloads. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Do not treat Bordbuch as a marketing timeline. It is an operational ledger.
- Do not put raw logs, secrets, or personal data into events.
- Keep Stellarpass, Sichtpass, Quartalsbericht, and Bordbuch separate: state, access/report, quarterly synthesis, and mission history are different jobs.
