# Cross-RFC acceptance matrix

This matrix is normative for the implementation mission. A weaker agent MUST use it as a final checklist in addition to each RFC's acceptance criteria.

## A. Regression safety

| ID | Test | Required result |
|---|---|---|
| A-01 | Existing Nicaragua project attestation fixture | Same validation semantics as before |
| A-02 | Existing Style Expert attestation fixture | Same validation semantics as before |
| A-03 | Published attestation without granted Consent | FAIL |
| A-04 | Published attestation without public derivative | FAIL |
| A-05 | Attestation withdrawal | Existing Consent revocation behavior preserved |
| A-06 | Nachweis pages rendering model | Still block-declarative; no surface blueprint |
| A-07 | `nachweis` entitlement absent | Existing skip/gating behavior preserved |

## B. Technical-assessment contract

| ID | Test | Required result |
|---|---|---|
| B-01 | technical-assessment without `assessment` | FAIL |
| B-02 | technical-assessment without canonical raw artifact | FAIL |
| B-03 | canonical raw artifact without SHA-256 | FAIL |
| B-04 | technical-assessment without Consent | VALID draft |
| B-05 | technical-assessment without public derivative | VALID draft |
| B-06 | technical-assessment published without N3 | FAIL |
| B-07 | technical-assessment published without human approval | FAIL |
| B-08 | technical-assessment published without legal content check | FAIL |
| B-09 | technical-assessment without authorization basis | FAIL |
| B-10 | score >100 / <0 / NaN | FAIL |
| B-11 | numerator > denominator | FAIL |
| B-12 | DE and UK copies differ in machine assessment fields | FAIL |
| B-13 | unknown non-Nachweis PBP kind enters publisher | FAIL closed |

## C. Publication gate V2

| ID | Test | Required result |
|---|---|---|
| C-01 | required condition = not_applicable | `allPassed=false` |
| C-02 | optional Consent for technical | `not_applicable`, not fake pass |
| C-03 | optional public derivative for technical | `not_applicable` |
| C-04 | legacy attestation policy | all six legacy requirements preserved |
| C-05 | technical withdrawal | no Consent mutation |
| C-06 | manifest | technical series/observation/observedAt emitted |
| C-07 | deterministic build | no wall-clock freshness boolean emitted |

## D. Generic assessment ingest

| ID | Test | Required result |
|---|---|---|
| D-01 | valid dry-run | no mutation |
| D-02 | valid ingest | R2 + PBP + Bordbuch |
| D-03 | same observation/same hashes | idempotent success |
| D-04 | same observation/different hash | conflict FAIL |
| D-05 | same series/new observation | new immutable history |
| D-06 | `../` artifact escape | FAIL |
| D-07 | symlink escape | FAIL |
| D-08 | API token-like secret in bundle prohibited path/field | FAIL or redacted per explicit rule |
| D-09 | network unavailable during R2 | structured failure, no false Bordbuch success |
| D-10 | entitlement absent | normal Nachweis skip behavior |

## E. Lighthouse adapter

| ID | Test | Required result |
|---|---|---|
| E-01 | exact dependency version | pinned |
| E-02 | default run count | 5 |
| E-03 | execution | sequential |
| E-04 | 5 valid LHRs | aggregate + ingest |
| E-05 | 1 of 5 runtime-invalid | whole canonical batch FAIL |
| E-06 | values 80,90,91,95,100 | median 91; samples retained |
| E-07 | Agentic Browsing pass count | numerator/denominator, not fake score |
| E-08 | unknown category shape | fail safely, raw retained locally |
| E-09 | raw LHR metadata | version/fetchTime/userAgent/URL/config captured |
| E-10 | supplied screenshot values | never hard-coded |

## F. Cloudflare adapter

| ID | Test | Required result |
|---|---|---|
| F-01 | request | URL Scanner API |
| F-02 | Agent Readiness option | enabled |
| F-03 | visibility | Unlisted by default |
| F-04 | poll | 15s default, bounded |
| F-05 | max wait | 5 min default |
| F-06 | API token | absent from artifacts/logs |
| F-07 | raw result | canonical JSON retained |
| F-08 | parser | fixture-backed exact paths |
| F-09 | provider schema drift | `ASSESSMENT_SCHEMA_UNSUPPORTED` |
| F-10 | additional provider dimension | not silently dropped |
| F-11 | Commerce not checked | not mapped to zero |
| F-12 | supplied screenshot values | never hard-coded |

## G. Timestamp assurance

| ID | Test | Required result |
|---|---|---|
| G-01 | generic RFC 3161 token | assurance=`rfc3161` |
| G-02 | legacy event no assurance | projects as `rfc3161` |
| G-03 | eidas-qualified without evidence ref | FAIL |
| G-04 | public copy generic token | says RFC 3161, not qualified |
| G-05 | N3 cryptographic gate | unchanged in strength |

## H. UI

| ID | Test | Required result |
|---|---|---|
| H-01 | attestation card | unchanged |
| H-02 | technical card | semantic article + time + details |
| H-03 | technical card | visible limitation |
| H-04 | operator-run Lighthouse | execution provenance visible |
| H-05 | provider-run Cloudflare | provider-run provenance visible |
| H-06 | Agentic Browsing | text/pass-count, accessible |
| H-07 | registry | technical + attestation sections |
| H-08 | carousel | absent |
| H-09 | provider logos | not required/present by default |
| H-10 | footer | no changing scores |
| H-11 | history | prior observations remain discoverable |
| H-12 | color-only status | prohibited |

## I. Warpgogol pilot

| ID | Test | Required result |
|---|---|---|
| I-01 | Lighthouse | new canonical production run after implementation |
| I-02 | Cloudflare | new canonical API scan after implementation |
| I-03 | bootstrap screenshots | stored only as non-canonical reference |
| I-04 | both records | N3 + approved + legal check + published |
| I-05 | dummy Consent | none |
| I-06 | dummy public PDF | none |
| I-07 | homepage placement | after demo, before collaboration |
| I-08 | homepage values | dynamic from published records |
| I-09 | `/nachweise/` | both technical records visible |
| I-10 | detail/Sichtpass | correct hashes/method/date/provenance |
| I-11 | status JSON | correct published status |
| I-12 | manifest | technical metadata present |
| I-13 | DE/UK | semantic parity and machine-data equality |
| I-14 | site accessibility | WCAG checks pass under existing pipeline |

## J. Repository governance

| ID | Test | Required result |
|---|---|---|
| J-01 | root `AGENTS.md` read | yes |
| J-02 | impacted package `AGENTS.md` read | yes |
| J-03 | actual RFC/ADR IDs allocated from live repo | yes |
| J-04 | no guessed next ID | yes |
| J-05 | ADR accepted before dependent implementation | according to current lifecycle |
| J-06 | each RFC validates | pass |
| J-07 | acceptance probes added where repository vocabulary supports them | pass |
| J-08 | verification evidence emitted before implemented transition where required | pass |
| J-09 | no invariant workaround | supersede/escalate instead |
| J-10 | final build/check/test suite | pass |

## Final release blocker rule

Any failed REQUIRED row blocks marking the relevant RFC implemented.

A "good looking" page is not sufficient acceptance evidence.
