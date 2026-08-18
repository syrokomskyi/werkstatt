---
id: RFC-0871
title: "Separate RFC 3161 timestamp evidence from eIDAS qualified timestamp claims"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-18
updatedAt: 2026-08-18
enhancedAt: 2026-08-18
implementedAt: 2026-08-18
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0715
  - RFC-0716
amendedBy: []
related:
  - ADR-0028
  - ADR-0054
satisfies:
  - DNA-53
  - DNA-59
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - nachweis.timestamp
    - nachweis.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "Public copy does not call a generic RFC 3161 token 'qualified' unless eIDAS qualification evidence is present"
  - "N3 cryptographic mechanics remain Ed25519 + verified RFC 3161 timestamp"
  - "Timestamp assurance is machine-readable"
nonGoals:
  - "Does not replace the TSA adapter"
  - "Does not implement QES"
  - "Does not require a QTSP for all N3 records"
---

# RFC-0871: Separate RFC 3161 timestamp evidence from eIDAS qualified timestamp claims

## Context

RFC-0715 implemented N3 cryptographic verification for the Nachweisregister: Ed25519 operator signature + RFC 3161 timestamp token via a TSA adapter (FreeTSA.org for pilot, configurable for production). RFC-0716 projected the Nachweisregister onto the warpgogol-com homepage with public copy calling the timestamp "qualified".

## Problem

RFC-0715 correctly implemented an RFC 3161 timestamp token and made it part of N3. It also uses a FreeTSA adapter for the pilot and allows a different TSA in production.

Some prose in RFC-0715/RFC-0716 calls the RFC 3161 timestamp "qualified". In EU trust-services terminology, `RFC 3161` is a protocol/form, while an eIDAS **qualified electronic time stamp** is a legal assurance category with additional requirements.

The public evidence system must not make a stronger legal/trust claim than its timestamp provider can support.

Affected public copy on warpgogol-com (both DE and UK):

- `home.md`: "Qualifizierter Zeitstempel (RFC 3161)" / "Кваліфікована мітка часу (RFC 3161)"
- `services.md`: "qualifizierten Zeitstempel" (DE)
- `nachweise.md`: "qualifizierter Zeitstempel" / "кваліфікована мітка часу"
- `nachweis-verify.md`: "qualifizierter Zeitstempel" / "кваліфікована мітка часу"
- UI components: `qualifiedTimestamp` prop with label "Qualifizierter Zeitstempel"

## Architectural fit

- **ADR-0028** (Nachweisregister as PBP trust layer extension) establishes the PBP entity model that Nachweis timestamps extend. Timestamp assurance metadata is stored in Bordbuch (the audit trail), not in PBP entities (content records).
- **ADR-0054** (Technical assessments as first-class Nachweisregister evidence profile) defines the evidence profile pattern that timestamp assurance metadata follows — a typed, machine-readable assurance claim with an optional evidence reference.
- **DNA-53** (Semantic fingerprint governance): adding `timestampAssurance` to Bordbuch metadata extends the semantic identity of timestamp events. The assurance field is part of the durable, append-only record.
- **DNA-59** (Evidence preservation): assurance metadata is preserved in Bordbuch as append-only evidence. Legacy entries without assurance are projected, not mutated.
- **K-0001** (Durable decisions are fail-closed and identity-bound): the assurance claim is a historical fact recorded at timestamp creation time. A TSA provider losing qualified status later does not rewrite past assurance — it creates a new Bordbuch event with a new assurance value.

## Decision

### N3 definition

Normalize the public and internal definition to:

```text
N3 = Ed25519 operator signature + verified RFC 3161 timestamp token
```

N3 itself does not imply eIDAS qualification.

### Timestamp assurance metadata

Every effective N3 timestamp records:

```ts
type TimestampAssurance =
  | "rfc3161"
  | "eidas-qualified";

interface NachweisTimestampAssurance {
  assurance: TimestampAssurance;
  tsaUrl: string;
  providerName?: string;
  qualificationEvidenceRef?: string;
}
```

Rules:

- default is `rfc3161`;
- `eidas-qualified` MUST NOT be set merely because a token is RFC 3161;
- `eidas-qualified` requires operator-verified evidence that the service/provider is qualified for the relevant trust service at the time of use;
- the verification basis/ref is recorded in Bordbuch metadata.

### Public copy

When assurance is `rfc3161`, use:

- DE: `RFC 3161-Zeitstempel`
- UK: `мітка часу RFC 3161`

Do not use:

- `qualifizierter Zeitstempel`
- `qualifizierte Zeitmarke`
- equivalent legal-assurance wording.

When assurance is `eidas-qualified`, the UI MAY additionally show:

- DE: `qualifizierter elektronischer Zeitstempel (eIDAS)`

provided the qualification evidence reference is present.

### Existing records

Do not rewrite old Bordbuch events.

Projection/rendering code interprets legacy timestamp events without assurance metadata as:

```text
assurance = rfc3161
```

unless a later append-only Bordbuch event records verified qualification.

### Command behavior

`nachweis.timestamp` gains optional explicit assurance metadata, but MUST default to `rfc3161`.

Example:

```sh
pnpm exec werkstatt run nachweis.timestamp \
  --system warpgogol-com \
  --slug <slug> \
  --tsa-url <url> \
  --timestamp-assurance rfc3161
```

If `--timestamp-assurance eidas-qualified` is requested, require a non-empty `--qualification-evidence-ref`; otherwise fail with:

```text
TIMESTAMP_QUALIFICATION_EVIDENCE_REQUIRED
```

`nachweis.validate` fails a published record that claims `eidas-qualified` without the evidence reference.

## UI changes

Rename any component prop or label whose semantics imply qualification without evidence.

Preferred data shape:

```ts
timestamp: {
  tokenPresent: boolean;
  assurance: "rfc3161" | "eidas-qualified";
  providerName?: string;
  qualificationEvidenceRef?: string;
}
```

Components MUST accept the new `timestamp` prop shape. A read-only internal projection from legacy `qualifiedTimestamp` string props to the new shape (with `assurance: "rfc3161"`) is permitted within the component's rendering logic during migration. The legacy `qualifiedTimestamp` prop MUST NOT remain as a public API beyond this RFC's implementation — it is removed when all page content has migrated to the new `timestamp` shape.

## Design

### Bordbuch metadata schema

The `nachweis-timestamped` Bordbuch entry metadata gains two optional fields:

```ts
interface NachweisTimestampedMetadata {
  slug: string;
  timestampTokenBase64: string;
  tsaUrl: string;
  tsaName: string;
  // RFC-0871 additions:
  timestampAssurance?: "rfc3161" | "eidas-qualified"; // default: "rfc3161"
  qualificationEvidenceRef?: string; // required when assurance === "eidas-qualified"
}
```

Legacy entries without `timestampAssurance` are projected as `"rfc3161"` by all read-side code. No existing Bordbuch entry is mutated.

### nachweis.timestamp command

New flags:

- `--timestamp-assurance` (string, default `rfc3161`, values: `rfc3161` | `eidas-qualified`)
- `--qualification-evidence-ref` (string, required when `--timestamp-assurance eidas-qualified`)

Validation: if `--timestamp-assurance eidas-qualified` is set and `--qualification-evidence-ref` is empty or missing, fail with exit code 1 and error code `TIMESTAMP_QUALIFICATION_EVIDENCE_REQUIRED`.

The `NachweisTimestampResult` interface gains:

```ts
timestampAssurance: "rfc3161" | "eidas-qualified";
qualificationEvidenceRef?: string;
```

### nachweis.verify-signature command

The `NachweisVerifySignatureResult` interface gains:

```ts
timestampAssurance: "rfc3161" | "eidas-qualified";
```

When a `nachweis-timestamped` entry exists, the command reads `timestampAssurance` from Bordbuch metadata, defaulting to `"rfc3161"` for legacy entries. When no timestamped entry exists, `timestampAssurance` is `"rfc3161"` (consistent with `timestampVerified: false`).

### nachweis.validate command

New violation rule: `n3-timestamp-qualification-evidence-missing`.

For each published N3 record with a `nachweis-timestamped` entry where `metadata.timestampAssurance === "eidas-qualified"` and `metadata.qualificationEvidenceRef` is empty or missing, emit:

```text
Record '<slug>' claims eidas-qualified timestamp but has no qualificationEvidenceRef in Bordbuch metadata.
```

### nachweis.manifest.generate command

`NachweisManifestEntry` gains:

```ts
timestampAssurance: "rfc3161" | "eidas-qualified"; // default: "rfc3161"
```

The manifest generator reads `timestampAssurance` from the `nachweis-timestamped` Bordbuch entry for each record, defaulting to `"rfc3161"` for legacy entries.

### UI components

`nachweis-verify-component.astro` and `nachweis-detail-component.astro` replace the `qualifiedTimestamp?: string` prop with:

```ts
timestamp?: {
  tokenPresent: boolean;
  assurance: "rfc3161" | "eidas-qualified";
  providerName?: string;
  qualificationEvidenceRef?: string;
};
```

Label logic:

- `assurance === "rfc3161"`: DE `RFC 3161-Zeitstempel`, UK `мітка часу RFC 3161`
- `assurance === "eidas-qualified"`: DE `qualifizierter elektronischer Zeitstempel (eIDAS)`, UK `кваліфікована електронна мітка часу (eIDAS)`

### Data flow: Bordbuch → UI

1. `nachweis.timestamp` writes `timestampAssurance` and `qualificationEvidenceRef` to Bordbuch metadata.
2. `nachweis.manifest.generate` reads assurance from Bordbuch and writes it to `public/nachweise/manifest.json`.
3. Content authors fill page block props (`timestamp.assurance`) from the manifest or by inspecting Bordbuch.
4. UI components render the label based on the `assurance` field.

### `qualificationEvidenceRef` format

A URL pointing to the EU trusted list entry for the TSA provider at the time of timestamp creation. Example: `https://webgate.ec.europa.eu/tl-browser/tl/?locale=EN&tlId=...`. The operator verifies the URL content before setting `eidas-qualified`.

## Rollout

1. Kernel commands (`nachweis.timestamp`, `nachweis.validate`, `nachweis.verify-signature`, `nachweis.manifest.generate`) gain the new fields — default `rfc3161` ensures backward compatibility.
2. UI components accept the new `timestamp` prop shape alongside the legacy `qualifiedTimestamp` prop (internal projection).
3. Page content on warpgogol-com is updated: `qualifiedTimestamp` props replaced with `timestamp` shape, public copy text changed from `qualifizierter Zeitstempel` to `RFC 3161-Zeitstempel` (DE) and from `кваліфікована мітка часу` to `мітка часу RFC 3161` (UK).
4. Legacy `qualifiedTimestamp` prop is removed from components after all page content has migrated.

Existing N3 records continue to verify without changes — their Bordbuch entries lack `timestampAssurance` metadata and are projected as `rfc3161`.

## Alternatives considered

- **Rename `qualifiedTimestamp` to `timestamp` without adding assurance metadata.** Rejected because it removes the distinction between RFC 3161 and eIDAS-qualified without providing a mechanism to record the difference. The whole point of the RFC is to make the assurance class machine-readable.

- **Add a separate `nachweis.qualify` command that upgrades a timestamped record to `eidas-qualified`.** Rejected because it creates a second Bordbuch event type and a two-step workflow. The assurance metadata belongs in the `nachweis-timestamped` event itself — it is a property of the timestamp, not a separate lifecycle stage.

- **Store assurance metadata in the EvidenceSource PBP entity instead of Bordbuch.** Rejected because timestamp assurance is a cryptographic-evidence property, not a business-profile property. Bordbuch is the append-only audit trail for N3 artifacts; PBP entities are content records. Mixing them violates the separation established by RFC-0707.

## Risks

- **Agent misinterpretation risk:** An agent might set `eidas-qualified` because the TSA URL contains "qualified" or because FreeTSA claims RFC 3161 compliance. The Agent constraints section explicitly forbids this, and the `qualificationEvidenceRef` requirement creates a fail-closed gate.
- **False-positive rate for `n3-timestamp-qualification-evidence-missing`:** Zero for legacy records (they default to `rfc3161` and never trigger the check). Only records where an operator explicitly set `eidas-qualified` are checked.
- **Content migration risk:** Page content with `qualifiedTimestamp` props must be updated. If a page is missed, the internal projection handles it gracefully (renders as `rfc3161`), but the public copy text may still say "qualified" until the prose is updated.
- **Stale qualification evidence:** A TSA provider may lose qualified status after a timestamp was created. The RFC records assurance at the time of timestamping, not at validation time. This is consistent with K-0001 (durable decisions are identity-bound) — the assurance is a historical fact, not a current health check.

## Implementation notes for agents

- Do NOT set `timestampAssurance: "eidas-qualified"` unless the operator has explicitly verified the TSA provider's qualified status and provided a `qualificationEvidenceRef` URL.
- Do NOT infer eIDAS qualification from the word `TSA`, from RFC 3161 compliance, or from a provider marketing page.
- Do NOT silently upgrade legacy Bordbuch entries. Legacy entries without `timestampAssurance` are projected as `rfc3161` by read-side code — this is a projection rule, not a mutation.
- Do NOT weaken N3 merely to avoid the terminology correction. N3 remains Ed25519 + verified RFC 3161 timestamp; this RFC only corrects the public-facing label.
- When updating UI components, remove the `qualifiedTimestamp` prop from the interface and replace it with the `timestamp` prop shape. The internal projection from legacy `qualifiedTimestamp` to the new shape is a temporary rendering convenience, not a permanent API.
- When updating warpgogol-com page content, replace all occurrences of `qualifizierter Zeitstempel` (DE) and `кваліфікована мітка часу` (UK) with `RFC 3161-Zeitstempel` and `мітка часу RFC 3161` respectively. This applies to `home.md`, `services.md`, `nachweise.md`, and `nachweis-verify.md` in both `de/` and `uk/` locales.
- Update `packages/werkstatt/AGENTS.md` with the new `nachweis.timestamp` flags (`--timestamp-assurance`, `--qualification-evidence-ref`) and the new `nachweis.validate` violation rule (`n3-timestamp-qualification-evidence-missing`).
- Update `packages/werkstatt-site/AGENTS.md` with the new UI component prop shape (`timestamp` replacing `qualifiedTimestamp`).

## Acceptance criteria

- [x] Legacy N3 records still verify. (evidence: packages/werkstatt/src/nachweis/nachweis-n3.test.ts:447-488)
- [x] Legacy missing assurance projects as `rfc3161`. (evidence: packages/werkstatt/src/nachweis/nachweis-verify-signature.ts:139)
- [x] Default `nachweis.timestamp` records `rfc3161`. (evidence: packages/werkstatt/src/nachweis/nachweis-timestamp.ts:48-50)
- [x] `eidas-qualified` without qualification evidence fails deterministically. (evidence: packages/werkstatt/src/nachweis/nachweis-timestamp.ts:52-53)
- [x] Homepage Nachweis copy no longer says `RFC 3161 qualified timestamp` generically. (evidence: systems-cache/warpgogol-com/src/content/pages/de/home.md)
- [x] Verify/detail pages expose the actual assurance class. (evidence: packages/werkstatt-site/src/domain/ui/components/nachweis-verify/nachweis-verify-component.astro:107)
- [x] Unit tests cover both assurance classes and legacy projection. (evidence: packages/werkstatt/src/nachweis/nachweis-n3.test.ts)
- [x] No existing hash-chain entry is mutated. (evidence: packages/werkstatt/src/nachweis/nachweis-timestamp.ts:84-101)

## Agent constraints

- Do not infer eIDAS qualification from the word `TSA`, from RFC 3161 compliance, or from a provider marketing page.
- Do not silently upgrade legacy records.
- Do not weaken N3 merely to avoid the terminology correction.
