# Orchestrator prompt — implement Nachweis technical evidence extension

Copy the text below into the coding/architecture agent that has access to the live Werkstatt repository.

---

You are implementing a governed extension to the existing Werkstatt Nachweisregister.

Your job is **not** to redesign the trust system from scratch. The attached package is the architecture/remediation package. The live repository, its accepted ADR/RFCs, Architecture DNA and `AGENTS.md` rules remain authoritative for repository mechanics and any newer decisions.

## Inputs you must read in full

Read, in this order:

1. repository root `AGENTS.md`;
2. every `AGENTS.md` governing files you may touch;
3. current Architecture DNA / invariant registry;
4. current RFC/ADR lifecycle and ID-allocation rules;
5. package `sources/current/01-adr-0028-...md`;
6. package `sources/current/02-rfc-0706-...md`;
7. package `sources/current/03-rfc-0707-...md`;
8. package `sources/current/05-rfc-0713-...md`;
9. package `sources/current/06-rfc-0714-...md`;
10. package `sources/current/07-rfc-0715-...md`;
11. package `sources/current/04-rfc-0708-...md`;
12. package `sources/current/08-rfc-0716-...md`;
13. package `sources/current/09-rfc-0717-...md`;
14. `01-BASELINE-AND-GAP-ANALYSIS.md`;
15. all new ADR/RFC drafts in this package;
16. `09-ACCEPTANCE-MATRIX.md`.

If a newer accepted/implemented repository ADR/RFC conflicts with this package, STOP and report the exact conflict. Do not silently choose one.

## Phase 0 — preflight only, no implementation

1. Identify the active Warpgogol mission/workpiece and canonical edit locations.
2. Determine the current highest/available ADR and RFC IDs using the repository-supported allocator/process.
3. Allocate one ADR ID and six RFC IDs for the package drafts.
4. Replace every `ADR-TBD-*` and `RFC-TBD-*` reference consistently.
5. Adapt frontmatter to current repository schema without changing substantive decisions.
6. Validate the drafts with the current repository validator.
7. Present the allocated IDs, dependency order and any detected conflicts for human acceptance.

Do **not** guess ID numbers.
Do **not** implement code while the required governance state is still draft/unaccepted.

## Architecture you must preserve

- Nachweisregister remains a PBP + Bordbuch trust-layer extension.
- No parallel technical-test registry.
- `technical-assessment` is a new `PbpEvidenceKind`.
- Technical metadata lives in a nested `assessment` object on `PbpEvidenceSource`.
- Existing client/project attestation semantics stay intact.
- Publication gate becomes policy-driven and tri-state.
- Technical assessments do not need dummy Consent or dummy public PDF.
- N3 remains required for published technical evidence.
- A canonical machine-readable raw artifact is required.
- Repeated measurements create immutable observations under a stable series.
- Provider adapters feed one generic assessment ingest.
- UI remains inside existing Nachweis components/routes and block-declarative pages.
- No Nachweis surface blueprint.

## Required implementation sequence

### 1. Timestamp assurance patch

Implement `RFC-TBD-TIMESTAMP`.

Do not call a generic RFC 3161 timestamp "qualified" unless qualification evidence is actually present.

Preserve N3 mechanics.

### 2. PBP + publication policy

Implement `RFC-TBD-CONTRACT`.

Before changing code, write regression tests proving legacy attestation gate behavior.

Then add:

- `technical-assessment`;
- assessment/artifact contract;
- policy resolver;
- tri-state gate;
- technical withdrawal semantics;
- manifest extensions;
- locale machine-data parity validation.

### 3. Generic assessment ingest

Implement `RFC-TBD-ASSESSMENT-KERNEL`.

The core command owns:

- bundle validation;
- artifact path safety;
- SHA-256;
- R2 immutable layout;
- PBP persistence;
- Bordbuch append;
- idempotency/conflict behavior.

Provider adapters MUST reuse it.

### 4. Lighthouse adapter

Implement `RFC-TBD-LIGHTHOUSE`.

Hard requirements:

- exact workspace-pinned Lighthouse;
- five sequential runs;
- all five canonical LHR JSONs retained;
- one invalid canonical run fails the batch;
- median for numeric categories;
- all samples/min/max retained;
- pass-count/experimental Agentic Browsing is not a 0–100 score;
- supplied screenshot numbers are not hard-coded.

Do not use `@latest`.

### 5. Cloudflare adapter

Implement `RFC-TBD-CLOUDFLARE`.

Hard requirements:

- official URL Scanner API;
- `agentReadiness` enabled;
- Unlisted by default;
- dedicated least-privilege env vars;
- bounded polling;
- raw submission/result retained;
- parser from a real/official fixture;
- schema drift fails closed;
- do not assume fixed category count;
- not-checked is not zero;
- no UI scraping.

If you cannot obtain a real API fixture because credentials are not available, implement all non-network infrastructure and STOP before claiming the parser/adapter RFC implemented. Report the exact operator action needed. Do not fabricate a Cloudflare response shape.

### 6. UI + pilot

Implement `RFC-TBD-UI-WARPGOGOL`.

- extend existing cards with discriminated technical variant;
- umbrella `/nachweise/`;
- separate technical and attestation sections;
- history by `seriesId`;
- timestamp assurance-correct copy;
- no badge wall/carousel;
- footer link only, no changing scores;
- dynamic homepage evidence after demo and before collaboration.

Then run the actual production measurements.

The supplied screenshots in `bootstrap/` are NON-CANONICAL. The new runs are authoritative.

For each pilot observation:

```text
measure
→ ingest
→ validate
→ sign
→ timestamp
→ approve N3
→ publish
→ manifest
→ build/check/deploy
```

Technical pilot records MUST NOT use fake Consent or fake public derivative.

## Content policy for public claims

Never write:

- `unabhängig geprüft` for a Warpgogol-run Lighthouse test;
- `zertifiziert` unless there is an actual certification;
- `von Google bestätigt`;
- `von Cloudflare empfohlen`;
- `garantiert`;
- `100 % verifiziert` as a blanket marketing claim.

Use factual provenance:

- Lighthouse: `Messung mit Google Lighthouse; durch Warpgogol/Werkstatt ausgeführt`.
- Cloudflare: `Test durch Cloudflare`.
- Always show measured date and scope.
- Always show: `Punktuelle technische Messung. Keine Zertifizierung und keine Garantie zukünftiger Werte.`

## Anti-cherry-picking invariant

A canonical run is designated by the command/workflow **before its result is known**.

You may perform exploratory runs during development, but once an operator initiates the canonical evidence command:

- do not delete a valid low score;
- do not rerun solely to obtain a higher number and pretend the lower canonical observation never existed;
- if a run is invalid because of a documented runtime/provider failure, record the failure operationally and follow the RFC's batch-failure rule;
- every successfully ingested canonical observation remains immutable.

## Tests and acceptance

Use `09-ACCEPTANCE-MATRIX.md` as a release blocker.

Also follow all current repository-specific RFC transition rules. Where the repository requires acceptance probes or verification evidence, generate them before transitioning to implemented.

Run at least:

- impacted package typecheck/tests;
- PBP validation tests;
- Nachweis command tests;
- UI/component accessibility tests;
- site page/block validation;
- build.prepare/build.check or their current equivalents;
- full repository check required by current AGENTS.md.

Do not mark an RFC implemented because code compiles. Every relevant matrix row must have evidence.

## Stop conditions

STOP and ask/report instead of guessing when:

- current ADR/RFC IDs cannot be safely allocated;
- a newer architecture decision conflicts with the package;
- Cloudflare credentials are required to capture the real fixture;
- a provider schema differs from the documented fixture;
- the live project no longer uses the paths/types described by the supplied RFCs;
- a DNA invariant would need to be weakened;
- a legal/trust phrase would overstate what the cryptographic/provider evidence proves.

When stopped, provide:

1. exact blocker;
2. files/commands inspected;
3. invariant/RFC affected;
4. smallest operator decision/action required;
5. what is already safe to continue independently.

## Definition of done

Do not finish until:

- all accepted RFCs are implemented with evidence;
- legacy attestation behavior is regression-safe;
- Warpgogol has two newly captured, N3-published technical observations;
- `/nachweise/` and homepage projections show those records correctly;
- old observations remain immutable;
- status JSON and manifest are correct;
- DE/UK parity holds;
- no screenshot score is hard-coded;
- no misleading "qualified", "independent audit" or "certification" language remains.
