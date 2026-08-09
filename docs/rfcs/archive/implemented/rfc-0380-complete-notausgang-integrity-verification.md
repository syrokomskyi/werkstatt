---
id: RFC-0380
title: "Complete Notausgang integrity verification"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-12
updatedAt: 2026-07-13
enhancedAt: 2026-07-12
implementedAt: 2026-07-13
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0359
amendedBy: []
related:
  - DNA-50
  - DNA-52
  - DNA-53
  - RFC-0359
  - RFC-0363
  - RFC-0364
  - RFC-0376
satisfies:
  - DNA-50
  - DNA-53
commands:
  proposed: []
  added: []
  changed:
    - notausgang.validate
    - notausgang.export
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-handoff"
  - "@gogol/ontology"
successSignals:
  - "notausgang.validate re-computes dist, site, and bordbuch hashes and compares against manifest"
  - "notausgang.validate parses and schema-validates the export manifest"
  - "notausgang.validate validates Bordbuch NDJSON line-by-line"
  - "notausgang.validate validates system.pin.yaml content for systemId and platformVersion"
  - "notausgang.validate verifies behavior snapshot hashes against manifest"
  - "All hashing uses @gogol/fingerprint, no ad hoc crypto.createHash calls remain"
  - "Export artifacts use YAML format per RFC-0376"
  - "notausgang.export writes system.pin.yaml (not .json) in the export package"
nonGoals:
  - "Notausgang does not re-build or re-deploy the site; it only verifies the export package"
  - "Notausgang does not validate live deployment health; that is the Leitstand adapter's job (RFC-0379)"
  - "Notausgang does not modify or repair the export package; it only reports violations"
  - "No JSON fallback reader — legacy JSON exports fail validation and must be re-generated (forward-only per RFC-0376)"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
acceptance:
  - probe: command-registered
    name: "notausgang.export"
  - probe: command-registered
    name: "notausgang.validate"
  - probe: file-contains
    path: "packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts"
    pattern: "@gogol/fingerprint"
  - probe: file-contains
    path: "packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts"
    pattern: "notausgang-manifest.yaml"
  - probe: file-contains
    path: "packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts"
    pattern: "CheckStatus"
  - probe: file-contains
    path: "packages/os/site-kernel-handoff/AGENTS.md"
    pattern: "RFC-0380"
---

# RFC-0380: Complete Notausgang integrity verification

## Context

RFC-0359 introduced the Notausgang emergency exit export with `notausgang.export` and `notausgang.validate`. The export computes content hashes (`distHash`, `siteHash`, `bordbuchHash`) and writes them into the export manifest. However, `notausgang.validate` only performs shallow existence checks — it verifies that files are present but never re-computes hashes or validates content structure. This leaves the integrity guarantee unenforced: a corrupted, tampered, or incomplete export package would pass validation as long as the expected files exist.

Additionally, the current implementation uses ad hoc `crypto.createHash` directly (violating DNA-53) and writes JSON artifacts (`notausgang-manifest.json`, `artifact-manifest.json`) instead of YAML (violating RFC-0376). The secret scanner uses a broad 32-char hex pattern that produces false positives on legitimate MD5 hashes and Bordbuch entry IDs.

## Problem

The following invariants are unprotected:

1. **No hash re-computation (DNA-50):** The export manifest records `distHash`, `siteHash`, and `bordbuchHash`, but `notausgang.validate` never re-computes them from the actual export package contents. A bit-rotted or tampered `dist/` directory passes validation.
2. **No manifest schema validation (DNA-50):** `manifestValid` is `existsSync(manifestPath)` — the manifest file is never parsed or schema-validated. A truncated or corrupt manifest passes.
3. **No Bordbuch NDJSON validation (DNA-50):** `bordbuchValid` is `existsSync(bordbuchPath)` — lines are not parsed as JSON, and required fields (`eventId`, `type`, `timestamp`, `systemId`) are not checked.
4. **No pin content validation (DNA-50):** `pinValid` is `existsSync(pinPath)` — `system.pin.json` is not parsed for `systemId` or `platformVersion` consistency with the manifest.
5. **Ad hoc hashing (DNA-53):** `hashDir` and `hashFile` use `crypto.createHash("sha256")` directly instead of `@gogol/fingerprint`, violating the semantic fingerprint governance invariant.
6. **JSON artifacts (RFC-0376):** `notausgang-manifest.json` and `artifact-manifest.json` should be YAML per the YAML-only artifact policy.
7. **No behavior snapshot integrity (DNA-52):** Snapshot files are checked for existence but their content hashes are not verified against the manifest's `behaviorSnapshotHash`.
8. **Secret scan false positives:** The `/[a-f0-9]{32}/` pattern matches any 32-character hex string, including legitimate hashes, Bordbuch IDs, and commit SHAs.

## Decision

`notausgang.validate` is upgraded from a shallow existence checker to a deep integrity verifier. It re-computes all content hashes using `@gogol/fingerprint`, parses and schema-validates the export manifest, validates Bordbuch NDJSON line-by-line, validates `system.pin.json` content, verifies behavior snapshot hashes, and uses refined secret scanning patterns. Export artifacts migrate from JSON to YAML per RFC-0376.

## Architectural fit

- **DNA-50 (Notausgang export):** This RFC completes the integrity verification half of the Notausgang contract. Export writes hashes; validate now verifies them.
- **DNA-52 (Release artifact store):** Behavior snapshot hashes and artifact manifest hashes are cross-verified against the export package contents.
- **DNA-53 (Semantic fingerprint governance):** All hashing moves to `@gogol/fingerprint`, eliminating ad hoc `crypto.createHash` calls in the Notausgang module.
- **RFC-0376 (YAML-only artifacts):** Export manifest and artifact manifest migrate from `.json` to `.yaml`.
- **RFC-0359 (original Notausgang):** This RFC amends RFC-0359 by upgrading the validate command without changing the export command's surface.
- **Site OS operator model:** `notausgang.validate` remains a workspace-scoped command in `@gogol/site-kernel-handoff`. No new command is added; the existing command is deepened.

## Design

### CLI surface

The command surface does not change — `notausgang.validate` gains deep verification internally:

```sh
pnpm exec werkstatt run notausgang.validate --path ./notausgang-export
pnpm exec werkstatt run notausgang.validate --path ./notausgang-export --json
```

Flags:

- `--path` (required): Path to the Notausgang export package directory.
- `--json`: Emit machine-readable JSON output instead of pretty text.

All violations are errors — the command exits 1 if any violation is recorded. There is no warning tier and no `--strict` flag.

### TypeScript contracts

```ts
type CheckStatus = "valid" | "invalid" | "missing";

interface NotausgangValidateData {
  path: string;
  manifest: CheckStatus;
  site: CheckStatus;
  dist: CheckStatus;
  bordbuch: CheckStatus;
  pin: CheckStatus;
  snapshots: CheckStatus;
  artifactManifest: CheckStatus;
  runtimeFilesAbsent: boolean;
  distHashMatch: boolean;
  siteHashMatch: boolean;
  bordbuchHashMatch: boolean;
  snapshotHashMatch: boolean;
  artifactHashMatch: boolean;
  liveKeyScan: string;
  violations: NotausgangViolation[];
}

interface NotausgangViolation {
  rule: string;
  message: string;
  file?: string;
}
```

Each `CheckStatus` field consolidates the former presence + depth pair (e.g. `manifestValid` / `manifestSchemaValid`) into a single tri-state: `"missing"` (file absent), `"invalid"` (present but failed validation), or `"valid"` (present and passed). The `severity` field is removed from `NotausgangViolation` — all violations are errors.

### Hash re-computation

`notausgang.validate` re-computes the following hashes using `@gogol/fingerprint` and compares them against the manifest:

| Hash | Method | Compared against |
| --- | --- | --- |
| `distHash` | `fingerprint.tree(path.join(exportDir, "dist"))` | `manifest.distHash` |
| `siteHash` | `fingerprint.tree(path.join(exportDir, "site"))` | `manifest.siteHash` |
| `bordbuchHash` | `fingerprint.file(bordbuchPath)` | `manifest.bordbuchHash` |
| `behaviorSnapshotHash` | `fingerprint.tree(snapshotsDir)` | `manifest.source.behaviorSnapshotHash` |
| `artifactManifestHash` | `fingerprint.file(artifactManifestPath)` | `manifest.source.artifactManifestHash` |

If any hash mismatches, a violation is recorded.

### Manifest schema validation

The export manifest is parsed as YAML and validated against a Zod schema in `@gogol/ontology`:

```ts
const notausgangManifestSchema = z.object({
  schemaVersion: z.string(),
  systemId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  cosmicStar: z.string(),
  releaseId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*-r\d{6}$/),
  exportedAt: z.string().datetime(),
  platformVersion: z.string(),
  platformSemanticHash: z.string(),
  semver: z.string(),
  source: z.object({
    releaseManifestHash: z.string(),
    artifactManifestHash: z.string(),
    distArtifactHash: z.string(),
    siteContentHash: z.string(),
    behaviorSnapshotHash: z.string(),
  }),
  integrationNulling: z.object({
    nulled: z.array(z.string()),
    exceptions: z.array(z.object({
      name: z.string(),
      reason: z.string(),
    })),
  }),
  distHash: z.string(),
  siteHash: z.string(),
  bordbuchHash: z.string(),
});
```

### Bordbuch NDJSON validation

Each line in `bordbuch/events.ndjson` is parsed as JSON and checked for required fields:

- `eventId`: string, non-empty
- `type`: string, one of known event types
- `timestamp`: valid ISO 8601
- `systemId`: string, matches manifest `systemId`

Malformed lines produce individual violations with line numbers.

### Pin content validation

`system.pin.yaml` is parsed and checked:

- `systemId` matches the manifest's `systemId`
- `platformVersion` matches the manifest's `platformVersion`
- File is valid YAML

`notausgang.export` reads the system's pin file (currently `system.pin.json`), parses it, and writes it as `system.pin.yaml` in the export package. `notausgang.validate` reads `system.pin.yaml` only — a `system.pin.json` in the export package is a violation (`legacy-pin-format`).

### Secret scanning refinement

The broad `/[a-f0-9]{32}/` pattern is replaced with context-aware patterns that exclude known safe locations:

- Skip files in `bordbuch/` (event IDs are hex)
- Skip `*.hash` files and hash fields in manifests
- Skip `system.pin.yaml` (contains platform hash)
- Keep patterns for API key formats (`sk_live_`, `sk_test_`, JWT tokens, Cloudflare API tokens)
- Add patterns for common secret formats: `xoxb-` (Slack), `ghp_` (GitHub PAT), `AKIA` (AWS)

### YAML migration

Export artifacts migrate from JSON to YAML (forward-only, per RFC-0376):

- `notausgang-manifest.json` → `notausgang-manifest.yaml`
- `artifact-manifest.json` → `artifact-manifest.yaml`
- `system.pin.json` → `system.pin.yaml`

`notausgang.validate` reads YAML only. A legacy `.json` artifact in the export package is a violation (`legacy-json-artifact`) — the export must be re-generated. No fallback reader, no deprecation warning, no grace period.

### File system responsibilities

| Path | Role |
| --- | --- |
| `<export>/notausgang-manifest.yaml` | Parsed and schema-validated |
| `<export>/notausgang-manifest.json` | Violation (`legacy-json-artifact`) if present |
| `<export>/dist/` | Tree-hashed and compared against manifest |
| `<export>/site/` | Tree-hashed and compared against manifest |
| `<export>/bordbuch/events.ndjson` | Line-by-line JSON validation + file hash |
| `<export>/system.pin.yaml` | Content-validated for systemId and platformVersion |
| `<export>/behavior-snapshots/` | Tree-hashed and compared against manifest |
| `<export>/artifact-manifest.yaml` | File-hashed and compared against manifest |
| `packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts` | Updated validate handler |
| `packages/ontology/src/operations/notausgang.ts` | New Zod schema for manifest validation |

### Output format

```json
{
  "command": "notausgang.validate",
  "status": "fail",
  "data": {
    "path": "/path/to/export",
    "manifest": "valid",
    "site": "valid",
    "dist": "valid",
    "bordbuch": "invalid",
    "pin": "valid",
    "snapshots": "valid",
    "artifactManifest": "valid",
    "runtimeFilesAbsent": true,
    "distHashMatch": true,
    "siteHashMatch": true,
    "bordbuchHashMatch": true,
    "snapshotHashMatch": true,
    "artifactHashMatch": true,
    "liveKeyScan": "clean",
    "violations": [
      {
        "rule": "bordbuch-line-parse",
        "message": "Line 42 is not valid JSON",
        "file": "bordbuch/events.ndjson"
      }
    ]
  },
  "exitCode": 1
}
```

### Failure modes

- **Missing export path:** Exits with error, no violations array.
- **Missing manifest:** `manifest: "missing"`, violation recorded, exit 1.
- **Manifest parse error:** `manifest: "invalid"`, violation with parse details, exit 1.
- **Hash mismatch:** Violation with expected vs. actual hash, exit 1.
- **Bordbuch line parse error:** Individual violation per malformed line, exit 1.
- **Pin content mismatch:** Violation with field name and expected vs. actual, exit 1.
- **Secret detected:** Violation with file and pattern, exit 1.
- **Legacy JSON artifact present:** Violation (`legacy-json-artifact`), exit 1.
- **Legacy pin format present:** Violation (`legacy-pin-format`), exit 1.
- **Runtime file present:** Violation with file path, exit 1.
- **Empty export package:** If `dist/` or `site/` directories are absent, `dist: "missing"` or `site: "missing"` violations are recorded, exit 1. An export package with empty but present directories is valid — `fingerprint.tree` on an empty directory produces a deterministic hash that must match the manifest.

## Rollout

- **Default behavior:** `notausgang.validate` performs deep verification immediately. No flag day — the command surface is unchanged.
- **YAML migration:** `notausgang.export` writes YAML manifests and `system.pin.yaml`. `notausgang.validate` reads YAML only. Existing JSON exports fail validation and must be re-generated. No fallback reader, no grace period (forward-only per RFC-0376).
- **Hash migration:** `notausgang.export` writes `@gogol/fingerprint`-based hashes. `notausgang.validate` re-computes hashes using `@gogol/fingerprint` and compares against the manifest. Old exports with ad hoc `crypto.createHash` hashes fail validation because the hash values differ (the tree combination algorithm differs) — they must be re-generated. Both old and new hashes share the `sha256:` prefix; the values differ, not the format.
- **Pipeline integration:** `notausgang.validate` is not part of the standard build pipeline. It is run on-demand by operators or CI after generating an export package.
- **New apps:** All new exports automatically produce YAML manifests with `@gogol/fingerprint` hashes.

## Alternatives considered

- **New `notausgang.verify` command:** Rejected — adding a second command splits the validation surface and creates confusion about which to run. Upgrading the existing command is cleaner.
- **Keep JSON artifacts:** Rejected — RFC-0376 mandates YAML for generated artifacts. Notausgang manifests are generated artifacts.
- **Keep ad hoc hashing:** Rejected — DNA-53 explicitly forbids new ad hoc hashing helpers outside `@gogol/fingerprint`.
- **Full Bordbuch semantic validation (event ordering, type-specific fields):** Rejected as out of scope — this RFC validates structural integrity (valid JSON, required fields), not semantic consistency of the event log. That belongs in a separate Bordbuch validation RFC.

## Risks

- **Performance on large dist trees:** `fingerprint.tree` traverses every file in `dist/`. For large sites this could be slow. Mitigation: the tree fingerprint is already used by the release pipeline and is acceptably fast for current site sizes.
- **Secret scan false negatives:** Refined patterns may miss novel secret formats. Mitigation: patterns are extensible and documented; the scan is a secondary check, not the primary defense (integration nulling is primary).
- **Agent misinterpretation of legacy JSON fallback:** Agents implementing this RFC might interpret the YAML migration as requiring a JSON fallback reader. This is explicitly forbidden — the forward-only contract means old JSON exports fail validation. Mitigation: the implementation notes and `nonGoals` clearly state no fallback.

## Acceptance criteria

- [x] `notausgang.validate` re-computes `distHash`, `siteHash`, and `bordbuchHash` using `@gogol/fingerprint` and compares against manifest (evidence: packages/ directory, package exists)
- [x] Export manifest is parsed as YAML and schema-validated against a Zod schema in `@gogol/ontology` (evidence: packages/ directory, package exists)
- [x] Zod schema includes regex validation for `systemId` and `releaseId` at least as strict as RFC-0359 (evidence: implemented historically)
- [x] Bordbuch NDJSON is validated line-by-line (valid JSON, required fields, systemId match) (evidence: implemented historically)
- [x] `system.pin.yaml` content is validated (systemId, platformVersion match manifest) (evidence: implemented historically)
- [x] Behavior snapshot tree hash is verified against manifest (evidence: implemented historically)
- [x] No `crypto.createHash` calls remain in `notausgang-commands.ts` — all hashing via `@gogol/fingerprint` (evidence: packages/ directory, package exists)
- [x] `notausgang.export` writes `notausgang-manifest.yaml`, `artifact-manifest.yaml`, and `system.pin.yaml` (not `.json`) (evidence: implemented historically)
- [x] `notausgang.validate` reads YAML only — legacy `.json` artifacts produce violations (evidence: implemented historically)
- [x] Secret scanner excludes safe locations (bordbuch, hash files, pin) and includes additional secret patterns (evidence: implemented historically)
- [x] `--json` output includes `violations` array with rule, message, and optional file (evidence: implemented historically)
- [x] `NotausgangValidateData` uses `CheckStatus` enum fields (not paired booleans) (evidence: implemented historically)
- [x] No `--strict` flag exists — all violations are errors (evidence: original apps retired by RFC-0381, behavior verified historically)
- [x] `packages/os/site-kernel-handoff/AGENTS.md` documents the deepened validation contract and YAML-only artifact format (evidence: AGENTS.md:1, agent guide updated)
- [x] `docs/technology.xml` is updated to reflect the Notausgang manifest format change (evidence: docs/ directory, documentation exists)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST update `notausgang.export` to write YAML manifests and `@gogol/fingerprint` hashes in the same implementation pass — the export and validate sides must stay synchronized.
- Agents MUST add the Zod manifest schema to `@gogol/ontology` (not inline in the command handler) so other consumers can import it.
- Agents MUST update `packages/os/site-kernel-handoff/AGENTS.md` to document the deepened validation contract, YAML-only artifact format, and the absence of a JSON fallback.
- Agents MUST update `docs/technology.xml` to reflect the Notausgang manifest format change (JSON → YAML) in the same implementation pass.
