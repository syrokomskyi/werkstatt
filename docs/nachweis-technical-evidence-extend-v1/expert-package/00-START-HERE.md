# Nachweisregister — Technical Evidence Extension v1

**Status:** implementation package  
**Prepared:** 2026-08-18  
**Target:** Werkstatt / Warpgogol Site OS  
**Pilot site:** `warpgogol-com`

## Purpose

Extend the already implemented Nachweisregister so that the same reusable module can publish not only client/project attestations, but also reproducible technical assessments such as:

- Google Lighthouse;
- Cloudflare Agent Readiness;
- later: accessibility checks, security/header checks, uptime/operational evidence and other provider/tool measurements.

The extension MUST be immediately usable by `warpgogol-com` and MUST remain reusable for client Sternsysteme.

## Non-negotiable baseline

1. Do **not** create a second evidence registry or parallel JSON business schema.
2. Keep ADR-0028: Nachweisregister remains an extension of PBP + Bordbuch.
3. Keep the `nachweis` entitlement and block-declarative page model.
4. Keep N3 as the publication integrity level unless a future accepted RFC explicitly changes it.
5. Do not weaken existing attestation consent rules.
6. Technical assessments are **point-in-time observations**, not certifications, guarantees, endorsements, or proof of future performance.
7. A test initiated by Warpgogol using an external tool MUST NOT be described as an "independent audit".
8. Supplied screenshots are bootstrap/reference artifacts only. They MUST NOT be converted directly into canonical published measurements.
9. Canonical technical evidence MUST originate from a reproducible machine-readable run after the implementation exists.
10. No score may be hidden or discarded merely because it is lower than expected. Exploratory runs and canonical evidence runs are separate concepts.

## Why the package uses TBD RFC/ADR IDs

The supplied baseline ends at ADR-0028 / RFC-0717. The live Werkstatt registry may have advanced since then. A weaker agent MUST NOT guess that the next IDs are ADR-0029 or RFC-0718.

Before creating repository RFC/ADR files, the implementation agent MUST:

1. read the current root and package `AGENTS.md` files;
2. inspect the current RFC/ADR registry and repository-supported allocation workflow;
3. allocate collision-free IDs using the repository's current mechanism;
4. replace every `ADR-TBD-*` / `RFC-TBD-*` reference consistently;
5. run the repository's RFC/ADR validators before asking for acceptance.

No architectural decision remains open merely because the numeric IDs are TBD; ID allocation is a repository-state operation.

## Documents and implementation order

| Order | Document | Role |
|---:|---|---|
| 0 | `01-BASELINE-AND-GAP-ANALYSIS.md` | Read-only map of current system and exact gaps |
| 1 | `02-ADR-DRAFT-technical-assessments-as-nachweis-profile.md` | Architecture decision |
| 2 | `03-RFC-DRAFT-timestamp-assurance-language.md` | Fix misleading "qualified" timestamp terminology |
| 3 | `04-RFC-DRAFT-technical-assessment-contract-and-publication-policy.md` | PBP contract + policy-driven publication gate |
| 4 | `05-RFC-DRAFT-assessment-kernel.md` | Generic assessment ingest and immutable observation/history model |
| 5 | `06-RFC-DRAFT-lighthouse-adapter.md` | Deterministic Lighthouse adapter |
| 6 | `07-RFC-DRAFT-cloudflare-agent-readiness-adapter.md` | Cloudflare URL Scanner Agent Readiness adapter |
| 7 | `08-RFC-DRAFT-ui-history-and-warpgogol-pilot.md` | UI, registry, homepage projection, pilot publication |
| 8 | `09-ACCEPTANCE-MATRIX.md` | Cross-RFC verification matrix |
| 9 | `10-ORCHESTRATOR-PROMPT.md` | Ready-to-paste instruction for the implementing agent |
| — | `examples/*` | Normative example payload shapes |
| — | `bootstrap/*` | User-supplied screenshots; non-canonical |
| — | `sources/current/*` | Supplied implemented ADR/RFC baseline |
| — | `11-SOURCE-NOTES.md` | External primary-source notes used in the design |

## Dependency graph

```text
ADR-TBD-TECH
      |
      +--------------------------+
      |                          |
RFC-TBD-TIMESTAMP          RFC-TBD-CONTRACT
                                  |
                           RFC-TBD-ASSESSMENT-KERNEL
                             /               \
                            /                 \
                  RFC-TBD-LIGHTHOUSE   RFC-TBD-CLOUDFLARE
                            \                 /
                             \               /
                       RFC-TBD-UI-WARPGOGOL
```

`RFC-TBD-TIMESTAMP` can be implemented independently, but it MUST land before the new public technical-assessment copy is deployed.

## Required human gates

A coding agent may draft and implement only according to the repository's current RFC lifecycle. At minimum, the following remain human decisions:

- acceptance of each newly allocated ADR/RFC;
- production credentials and external-account provisioning;
- final legal/content approval before publishing real Warpgogol evidence;
- whether a provider report is exposed publicly or only its hash/normalized record is published.

## Completion definition

The mission is complete only when:

- old Nicaragua/Style-Expert attestation behavior still validates unchanged;
- `technical-assessment` is first-class PBP evidence;
- technical assessments can publish without dummy Consent or dummy public PDF;
- N3 still authenticates the normalized record and fixes its time;
- canonical raw machine artifacts are hashed and retained;
- Lighthouse and Cloudflare assessments are reproducible through dedicated commands;
- `warpgogol.com/nachweise` shows technical evidence and human/project evidence as distinct classes;
- the homepage shows a compact, dynamic evidence projection at the agreed decision point;
- no score is hard-coded from the supplied screenshots;
- DE and UK output are semantically and machine-data equivalent;
- all package/RFC acceptance checks, workspace checks and site checks pass.
