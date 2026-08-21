---
id: RFC-0902
title: "Remove TLD suffix from Sternsystem IDs — business ID only"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-21
updatedAt: 2026-08-21
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0354
  - RFC-0790
amendedBy: []
related:
  - DNA-44
  - DNA-45
satisfies:
  - DNA-44
  - DNA-45
versionBump: minor
commands:
  proposed: []
  added:
    - sternsystem.id.validate
  changed:
    - sternsystem.validate
    - sternsystem.register
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - packages/werkstatt
successSignals:
  - "sternsystem.validate rejects IDs ending in a known TLD suffix"
  - "sternsystem.register rejects IDs ending in a known TLD suffix at registration time"
  - "No Sternsystem ID in systems-cache/ contains a TLD suffix"
  - "warpgogol-com renamed to warpgogol with zero backward-compatibility shims"
nonGoals:
  - "Backward compatibility with existing TLD-suffixed IDs"
  - "Automated rename migration script"
  - "Legacy code preservation"
  - "Support for existing missions, releases, or deployment history during migration"
---

# RFC-0902: Remove TLD suffix from Sternsystem IDs — business ID only

## Context

Sternsystem IDs currently encode the client's domain TLD as a suffix: `warpgogol-com`, `nicaragua-projekt-org`. This convention couples the immutable system identity to a mutable DNS detail. Two operational pressures make this unsustainable:

1. **Domain changes**: A client may switch from `warpgogol.com` to `warpgogol.de` (or move to an entirely different domain). The Sternsystem ID must not change when the domain changes — it is the durable business identifier, not a DNS record.
2. **Multiple domains**: A client may operate multiple sites on different domains under the same business identity. The Sternsystem ID represents the business, not a specific domain.

The current `STERNSYSTEM_ID_REGEX` (`/^[a-z0-9]+(-[a-z0-9]+)*$/`) already enforces lowercase Latin letters, digits, and hyphens. The charset is correct — the problem is that the *semantic convention* allows TLD segments to appear as the final hyphen-separated component, and nothing prevents or detects this.

DNA-44 states: "Sternsystem ids are kebab-case, lowercase, latin-only." DNA-45 states: "Each Sternsystem is discovered via convention-based per-system files in `systems-cache/{id}/`." Neither invariant currently prohibits TLD suffixes. This RFC tightens both.

## Problem

**No automated enforcement exists** to prevent or detect TLD-suffixed Sternsystem IDs. The regex allows any kebab-case string, including those that end in `-com`, `-org`, `-de`, or any other TLD. Operators and agents must manually avoid the pattern, which is unreliable.

The existing site `warpgogol-com` is the sole deployed Sternsystem and carries the `-com` TLD suffix. Every downstream artifact — `system-config.yaml` `id` field, mirror paths, worker names, mission IDs, fleet sites YAML, service zone configs, external git remote — is contaminated with the TLD suffix.

## Decision

Sternsystem IDs are **business identifiers only**. They must not encode any domain TLD as a terminal hyphen-separated segment. The ID `warpgogol-com` becomes `warpgogol`; `nicaragua-projekt-org` becomes `nicaragua-projekt`.

A new validation rule `STERN-ID-TLD` is added to `sternsystem.validate` and enforced at registration time in `sternsystem.register`. The rule rejects any ID whose final hyphen-separated segment matches a known TLD from a maintained list.

No backward compatibility is maintained. No migration script is provided. The migration is destructive: existing `systems-cache/`, `systems-git/`, missions, releases, and external mirrors for TLD-suffixed IDs are deleted, and the Sternsystem is re-registered with the clean business ID.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract)**: Tightened — "Sternsystem ids are kebab-case, lowercase, latin-only, and must not end in a known TLD suffix." This RFC amends DNA-44.
- **DNA-45 (Fleet registry)**: Tightened — `discoverSystems` in `systems-cache/{id}/` now requires TLD-free IDs. This RFC amends DNA-45.
- **DNA-6 (Kebab-case filenames)**: Unaffected — the charset remains kebab-case; only the semantic convention changes.
- **Anti-Patterns**: Prevents the implicit anti-pattern of coupling immutable system identity to mutable DNS details.

## Design

### TLD detection strategy

A maintained set of common TLDs is hardcoded in `packages/werkstatt/src/schemas/naming-policy.ts`. The validation rule checks whether the final hyphen-separated segment of the Sternsystem ID matches any entry in this set (case-insensitive, but the regex already enforces lowercase).

```ts
export const KNOWN_TLDS = new Set([
  // Generic
  "com", "org", "net", "io", "co", "dev", "app", "info", "biz", "me",
  "tv", "xyz", "ai", "cloud", "tech", "online", "store", "site",
  // Country-code (common)
  "de", "eu", "uk", "us", "fr", "it", "es", "nl", "ch", "at", "be",
  "pl", "ru", "cn", "jp", "ca", "au", "se", "no", "dk", "fi", "cz",
  "pt", "ie", "lu", "li", "is",
]);

export function hasTldSuffix(id: string): boolean {
  const segments = id.split("-");
  if (segments.length < 2) return false;
  const last = segments[segments.length - 1];
  return KNOWN_TLDS.has(last);
}
```

The set is intentionally conservative. Adding TLDs is a code change in `naming-policy.ts`, not an RFC — the set is a living allowlist of known TLDs, not an architectural decision. The set covers all TLDs currently in use across the workshop and common ones likely to appear.

### CLI surface

```sh
# Validate one or all Sternsystems (now includes STERN-ID-TLD rule)
pnpm exec werkstatt run sternsystem.validate
pnpm exec werkstatt run sternsystem.validate --id warpgogol

# Register a new Sternsystem (now rejects TLD-suffixed IDs)
pnpm exec werkstatt run sternsystem.register --id warpgogol --cosmicStar Vega --mirrors ...
```

No new standalone command is added. The TLD check is integrated into the existing `sternsystem.validate` and `sternsystem.register` commands. The `commands.added` entry `sternsystem.id.validate` in frontmatter refers to the internal validation function, not a separate CLI command — it is callable programmatically by other kernel commands.

### TypeScript contracts

```ts
// packages/werkstatt/src/schemas/naming-policy.ts

export const KNOWN_TLDS: ReadonlySet<string>;

export function hasTldSuffix(id: string): boolean;

export const STERNSYSTEM_ID_POLICY = {
  regex: STERNSYSTEM_ID_REGEX,
  charset: "ASCII lowercase letters (a-z), digits (0-9), hyphens (-)",
  description: "kebab-case, lowercase, latin-only, no TLD suffix",
  examples: ["warpgogol", "nicaragua-projekt"],
  counterExamples: [
    "warpgogol-com",
    "nicaragua-projekt-org",
    "Warpgogol",
    "nicaragüa-projekt",
    "warpgogol--com",
    "-warpgogol",
    "warpgogol-",
  ],
} as const;
```

```ts
// packages/werkstatt/src/sternsystem/sternsystem-validate.ts

// New violation rule added to the existing violations array:
{
  ruleId: "STERN-ID-TLD",
  severity: "error",
  systemId: id,
  field: "id",
  message: `Sternsystem ID '${id}' ends in TLD suffix '-${lastSegment}' — use the business ID without domain TLD (e.g. 'warpgogol' not 'warpgogol-com')`,
}
```

### File system responsibilities

| Path | Role |
|---|---|
| `packages/werkstatt/src/schemas/naming-policy.ts` | Add `KNOWN_TLDS`, `hasTldSuffix()`, update `STERNSYSTEM_ID_POLICY` examples |
| `packages/werkstatt/src/sternsystem/sternsystem-validate.ts` | Add `STERN-ID-TLD` rule to validation loop |
| `packages/werkstatt/src/sternsystem/sternsystem-register.ts` | Call `hasTldSuffix()` before creating config, throw on match |
| `packages/werkstatt/src/schemas/sternsystem.ts` | Update `kebabRe` error messages to mention "no TLD suffix" |
| `packages/werkstatt/src/tests/naming-policy.test.ts` | Add tests for `hasTldSuffix()`, update `STERNSYSTEM_ID_POLICY` examples |
| `systems-cache/{id}/system-config.yaml` | `id` field must be TLD-free |
| `systems-cache/{id}/system-state.yaml` | `systemId` field must be TLD-free |

### Output format

```json
{
  "command": "sternsystem.validate",
  "status": "fail",
  "violations": [
    {
      "ruleId": "STERN-ID-TLD",
      "severity": "error",
      "systemId": "warpgogol-com",
      "field": "id",
      "message": "Sternsystem ID 'warpgogol-com' ends in TLD suffix '-com' — use the business ID without domain TLD (e.g. 'warpgogol' not 'warpgogol-com')"
    }
  ]
}
```

### Failure modes

- **`sternsystem.validate`**: `STERN-ID-TLD` is an error-severity violation. Any match sets `exitCode: 1` and blocks `mission.materialize` (existing gate behavior).
- **`sternsystem.register`**: Throws before writing any files or creating directories. The error message includes the detected TLD and the suggested clean ID.
- **`sternsystem.register --amend`**: Also checks the existing ID. If the Sternsystem was registered with a TLD-suffixed ID before this RFC, amend will fail with `STERN-ID-TLD` — the operator must perform the destructive migration (see Rollout).

## Rollout

The migration is **destructive and manual**. No backward compatibility, no rename script, no migration command. The operator performs these steps:

### Step 1: Delete existing TLD-suffixed Sternsystem artifacts

```sh
# Remove cache clone
rm -rf ../systems-cache/warpgogol-com

# Remove bare repo
rm -rf ../systems-git/warpgogol-com

# Remove all missions (active + archived)
rm -rf missions/warpgogol-com-m*
rm -rf missions/archive/warpgogol-com-m*

# Remove external mirror (GitHub) — operator deletes the repo manually
# https://github.com/syrokomskyi/warpgogol-com → delete or rename
```

### Step 2: Re-register with clean business ID

```sh
# Create new external mirror repo on GitHub: syrokomskyi/warpgogol.git
pnpm exec werkstatt run sternsystem.register \
  --id warpgogol \
  --cosmicStar Vega \
  --mirrors ../systems-cache/warpgogol:non-bare,../systems-git/warpgogol:bare,git@github.com:syrokomskyi/warpgogol.git:bare
```

### Step 3: Restore content from backup

The operator restores authored content (`src/content/`, `system.md`, images, data sidecars) from a backup or from the deleted cache clone before deletion. The Bordbuch history, mission history, and release history are **not preserved** — they are accepted as the cost of a clean break.

### Step 4: Update downstream service configs

These files reference the old `warpgogol-com` site ID and must be updated manually:

- `services/cf-analytics-poller/zones.yaml` — `siteId: warpgogol-com` → `siteId: warpgogol`, `workerScripts` updated
- `services/fleet-probe-runner/targets.overrides.yaml` — `siteId: warpgogol-com` → `siteId: warpgogol`
- `services/check-runner/service.config.yaml` — `ownerApp: check-warpgogol-com` → `ownerApp: check-warpgogol` (if the Check site is also re-registered)
- `services/lagebild-sync/.env.example` — `TENANT_WARPGOGOL_COM_*` env vars → `TENANT_WARPGOGOL_*`
- `services/lagebild-sync/wrangler.jsonc` — comments referencing `warpgogol-com` site name
- `fleet/fleet.sites.yaml` — regenerated by `fleet.sites.generate` after re-registration

### Step 5: Verify

```sh
pnpm exec werkstatt run sternsystem.validate
pnpm exec werkstatt run sternsystem.validate --id warpgogol
```

Both must pass with zero violations.

### New Sternsystems

New Sternsystems registered after this RFC is implemented automatically comply — `sternsystem.register` rejects TLD-suffixed IDs at creation time. No additional operator action is needed.

## Alternatives considered

- **Automated rename script**: Rejected. The user explicitly stated that migration can ignore existing history, missions, and releases. A rename script would add complexity and need to handle edge cases (Bordbuch hash chain, release artifacts, deployment state) that are irrelevant when history is disposable.
- **Regex change to exclude TLDs**: Rejected. A regex cannot distinguish a TLD segment from a legitimate business-name segment (e.g., `warpgogol-ai` — is `ai` a TLD or a business descriptor?). A `KNOWN_TLDS` set with explicit detection is clearer and more maintainable.
- **External TLD list package (e.g. `tldts`)**: Rejected for now. The hardcoded set covers all TLDs in current use and common ones. If the set grows unwieldy, a package can be introduced later without an RFC.
- **Warning-only enforcement**: Rejected. The user explicitly requested strict enforcement ("Контроль. Контроль целостности."). A warning would allow TLD-suffixed IDs to persist.

## Risks

- **False positives**: A business whose legal name ends in a TLD-like segment (e.g., a company literally named "Studio Com") would be rejected. Mitigation: the `KNOWN_TLDS` set is conservative and can be adjusted. The operator can override by removing the TLD from the set if a legitimate case arises.
- **Destructive migration data loss**: Bordbuch history, mission history, and release artifacts for `warpgogol-com` are permanently lost. Mitigation: the operator has explicitly accepted this tradeoff. Content files are restored from backup.
- **External mirror orphan**: The GitHub repo `syrokomskyi/warpgogol-com` must be manually deleted or renamed by the operator. If left orphaned, it is harmless but confusing.
- **Service config drift**: Downstream service configs (`zones.yaml`, `targets.overrides.yaml`, env examples) reference the old ID and will be stale until manually updated. Mitigation: `sternsystem.validate` catches the Sternsystem side; service-side references are caught by `services.check.run` or manual review.

## Acceptance criteria

- [ ] `KNOWN_TLDS` set and `hasTldSuffix()` function defined in `packages/werkstatt/src/schemas/naming-policy.ts`
- [ ] `STERNSYSTEM_ID_POLICY` examples updated to TLD-free IDs (`warpgogol`, `nicaragua-projekt`)
- [ ] `STERNSYSTEM_ID_POLICY` counter-examples include `warpgogol-com`, `nicaragua-projekt-org`
- [ ] `sternsystem.validate` emits `STERN-ID-TLD` error violation for TLD-suffixed IDs
- [ ] `sternsystem.register` throws on TLD-suffixed IDs before writing any files
- [ ] `sternsystem.register --amend` throws on TLD-suffixed IDs
- [ ] Unit tests for `hasTldSuffix()` covering positive and negative cases
- [ ] Unit tests for `sternsystem.validate` `STERN-ID-TLD` rule
- [ ] Unit tests for `sternsystem.register` rejecting TLD-suffixed IDs
- [ ] `systems-cache/warpgogol-com/` deleted and re-registered as `warpgogol`
- [ ] `fleet/fleet.sites.yaml` regenerated with `warpgogol` site ID
- [ ] Downstream service configs updated to reference `warpgogol` instead of `warpgogol-com`
- [ ] `sternsystem.validate` passes with zero violations after migration
- [ ] `rfc.validate` passes on this file before merging
- [ ] DNA-44 and DNA-45 updated to mention "no TLD suffix" requirement

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT add backward-compatibility shims, legacy ID readers, or TLD-stripping migration helpers. The user explicitly forbade legacy code.
- Agents MUST NOT preserve existing missions, releases, or Bordbuch history for `warpgogol-com` during migration. The migration is destructive by design.
- Agents MUST NOT weaken or remove the `STERN-ID-TLD` enforcement rule without a new RFC that supersedes this one.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0902 --reason "..." --invariant "DNA-N"` instead of working around it.
