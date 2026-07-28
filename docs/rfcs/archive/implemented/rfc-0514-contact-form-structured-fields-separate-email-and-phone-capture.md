---
id: RFC-0514
title: "Contact form structured fields — separate email and phone capture"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
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
createdAt: 2026-07-24
updatedAt: 2026-07-24
enhancedAt: 2026-07-24
implementedAt: 2026-07-24
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0168
  - RFC-0181
  - RFC-0331
  - RFC-0479
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-17
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed:
    - contact.form.validate
  added:
    - contact.form.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/ui"
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "The send-message section renders structured email and phone input fields alongside the message textarea, submitted as separate payload fields rather than regex-extracted from free text."
  - "Server-side API receives email and phone as top-level fields in the IntegrationEvent contact object; regex-based extraction from the message body is removed."
  - "contact.form.validate enforces that sites using the send-message section declare emailField props consistently across locales, and that emailField.enabled is true (email is the minimum required structured field)."
  - "The fallback email-copy UX still works when structured fields are present — the composed fallback body includes the typed email/phone."
  - "A migrator adds default emailField and phoneField props to existing sites' send-message block configurations during mission.migrate."
nonGoals:
  - "Does not remove the textarea or make it optional — the message description remains the primary input."
  - "Does not add CAPTCHA, honeypot, or bot protection — that is a separate concern."
  - "Does not change the QStash delivery pipeline or IntegrationEvent shape beyond passing structured contact fields through the existing contact object."
  - "Does not add server-side email validation beyond format checking — SMTP verification is out of scope."
  - "Does not make phone mandatory — phone is opt-in per site; email is the minimum required structured field."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0514: Contact form structured fields — separate email and phone capture

## Context

The send-message section (`packages/ui/src/sections/send-message/`) is the primary B2B contact path. It uses a single textarea where the visitor writes their message and must include an email address or phone number within the free text. Client-side validation (`send-message-section.client.ts:21-26`) and server-side extraction (`send-message-section.api.ts:27-63`) both use regex to detect and extract contact details from the message body.

The final integration audit (file 17, finding F-005) identified this as a UX and data-quality gap: visitors must be instructed via placeholder text to leave contact details in the message, and the regex extraction is fragile — phone formats vary internationally, and the regex may miss or misparse edge cases.

## Problem

1. **Fragile contact extraction.** The server-side API (`send-message-section.api.ts:62-63`) extracts email and phone from the message body via regex. International phone formats, multiline inputs, and edge cases can cause missed or incorrect extraction, leading to leads with no usable contact path.

2. **Poor UX.** The visitor must read and follow placeholder instructions to embed their contact details in free text. There is no structured input that signals the expected data type. The audit (F-005) flagged this as requiring an RFC because the fix touches `packages/ui` (the section component), `packages/share` (block extractor), and the API route.

3. **No validation contract.** The manifest (`send-message-section.manifest.yaml`) has no props for structured email/phone fields. Sites cannot configure whether email is required, optional, or disabled. The `contactRequirementMessage` data attribute is the only enforcement — a soft hint, not a structured field.

## Decision

The send-message section gains structured `emailField` and `phoneField` props in its manifest. `emailField` is required (enabled: true) for all sites using the send-message section; `phoneField` is opt-in. When enabled, the section renders labeled `<input>` fields alongside the existing textarea. The client script and server API accept `email` and `phone` as top-level payload fields. The regex-based extraction from the message body is removed entirely — no dual-path, no fallback. A new `contact.form.validate` command checks that sites declare these props consistently across locales. A migrator (RFC-0479) adds default `emailField`/`phoneField` props to existing sites' send-message block configurations.

## Architectural fit

- **DNA-17 (Uni manifest contract):** The RFC extends the send-message section's manifest by adding `emailField` (required) and `phoneField` (optional) to its `propsSchema`. The manifest remains the authoritative source for the section's prop contract, and the generated types are regenerated by `props.types.generate`.
- **Component contracts:** The send-message section manifest (`send-message-section.manifest.yaml`) gains new props; the generated types file is regenerated by `props.types.generate`. The manifest version bumps from `1.0.0` to `1.1.0`.
- **Forward-only:** The regex extraction path is removed entirely. Existing sites are migrated by a migrator (RFC-0479) that adds default `emailField`/`phoneField` props to their send-message block configurations. No dual-path, no compatibility shim.
- **Layer C:** No URL, JSON-LD, or sitemap changes — `breaksC: false`.

## Design

### CLI surface

```sh
pnpm exec site-kernel run contact.form.validate --site warpgogol-com
pnpm exec site-kernel run contact.form.validate --all --json
```

Checks that sites using the send-message section declare `emailField` and `phoneField` props consistently across all published locales. Warns if a locale enables a structured field that another locale does not.

### TypeScript contracts

```ts
interface SendMessagePayload {
  message: string;
  formId: string;
  email?: string;
  phone?: string;
}

interface EmailFieldConfig {
  enabled: boolean;
  required: boolean;
  label?: string;
  placeholder?: string;
}

interface PhoneFieldConfig {
  enabled: boolean;
  required: boolean;
  label?: string;
  placeholder?: string;
}
```

The manifest props schema gains `emailField: EmailFieldConfig` (required) and `phoneField?: PhoneFieldConfig` (optional). When `enabled` is false, the field is not rendered and the payload does not include it. The `contactRequirementMessage` prop is removed from the required list — it was only needed for the regex-based UX and is replaced by per-field labels and placeholders.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/sections/send-message/send-message-section.manifest.yaml` | Add `emailField` (required) and `phoneField` (optional) to propsSchema; remove `contactRequirementMessage` from required list |
| `packages/ui/src/sections/send-message/send-message-section.types.generated.ts` | Regenerated by `props.types.generate` |
| `packages/ui/src/sections/send-message/send-message-section.astro` | Render `<input>` fields when `enabled: true` |
| `packages/ui/src/sections/send-message/send-message-section.client.ts` | Read and validate structured fields, include in payload; remove `hasContactDetails` regex check |
| `packages/ui/src/sections/send-message/send-message-section.api.ts` | Accept `email`/`phone` as top-level payload fields; remove regex extraction (`EMAIL_REGEX`, `PHONE_REGEX`, `hasContactDetails`) |
| `packages/share/src/semantic/block-extraction.ts` | Extract email/phone field labels for semantic index |
| `packages/os/site-kernel-checks/src/contact-form.ts` | New `contact.form.validate` command implementation |
| `packages/os/site-kernel-checks/src/pipelines/build-check.ts` | Add `contact.form.validate` step to `SITES_BUILD_CHECK_PIPELINE` |
| `src/content/site/{de,uk}/labels.md` | Add `emailFieldLabel`, `phoneFieldLabel`, `emailFieldPlaceholder`, `phoneFieldPlaceholder` |

### Output format

```json
{
  "command": "contact.form.validate",
  "status": "pass",
  "warnings": []
}
```

### Privacy and GDPR

The privacy posture is unchanged from the existing send-message flow. Structured email and phone fields are PII transmitted through the same `IntegrationEvent.contact` object and delivered via the same QStash EU pipeline (RFC-0181). No new persistence is introduced — the delivery queue is in-flight only, and visitor PII is not stored (RFC-0177 clause 4). No cookies are used. The structured fields do not change the data residency, retention, or processing scope.

### Failure modes

- `contact.form.validate` exits non-zero if a site using the send-message section does not declare `emailField` with `enabled: true` in any locale (email is the minimum required structured field).
- `contact.form.validate` exits non-zero if a locale declares `emailField.enabled: true` but another locale for the same site does not declare it at all (cross-locale inconsistency).
- The server API returns `400` with `error: "missing-email"` when `emailField.required` is true and no email is provided as a structured field.
- The server API returns `400` with `error: "invalid-email"` when the provided email fails format validation.
- The server API returns `400` with `error: "missing-phone"` when `phoneField.required` is true and no phone is provided.

## Rollout

- **Migrator (RFC-0479):** A migrator adds default `emailField: { enabled: true, required: true }` and `phoneField: { enabled: false, required: false }` props to existing sites' send-message block configurations. The migrator also removes `contactRequirementMessage` from block props (no longer needed). The migrator runs during `mission.migrate` for each site with a send-message block.
- **warpgogol-com adoption:** After RFC acceptance and migrator application, verify `emailField: { enabled: true, required: true }` and `phoneField: { enabled: true, required: false }` on the contact page's send-message block. Add corresponding labels to `site/{de,uk}/labels.md`.
- **New sites:** `onboarding.scaffold` includes `emailField: { enabled: true, required: true }` by default in the contact page template.
- **Pipeline integration:** `contact.form.validate` runs in `SITES_BUILD_CHECK_PIPELINE` (in `build.check`) for all sites that use the send-message section. It is a blocking step — cross-locale inconsistency or missing `emailField` fails the build.
- **Performance:** `contact.form.validate` scans page content files for send-message blocks across all published locales. For a typical site (2 locales, ~50 pages), this is a single-pass file scan reading ~100 files — negligible I/O cost (< 100ms).

## Alternatives considered

- **Retain regex fallback as a compatibility layer.** Rejected — the platform is forward-only (no backward compatibility for layers A+B). Keeping the regex path alive alongside structured fields creates a dual-path that is harder to maintain and violates the forward-only principle. Existing sites are migrated by a migrator instead.
- **Add a dedicated `contact-form` block type separate from `send-message`.** Rejected — the send-message section already handles the full UX (form, validation, fallback, success state). Adding a parallel type would duplicate logic and create migration burden.
- **Use a third-party form service (e.g. Formspark, Web3Forms).** Rejected — the QStash delivery pipeline (RFC-0181) is already built and EU-resident. Outsourcing would add a third-party dependency and data residency risk.

## Risks

- **Increased form complexity.** Adding fields may reduce conversion rate if the form feels longer. Mitigation: email is the only required structured field; phone is optional.
- **Client-side validation bypass.** A visitor could submit with an invalid email format. Mitigation: server-side API validates email format when provided as a structured field.
- **Migrator failure on edge-case configurations.** Sites with non-standard send-message block props might not migrate cleanly. Mitigation: the migrator is idempotent (RFC-0479) and `contact.form.validate` catches missing `emailField` after migration.
- **Cross-locale rendering divergence.** If one locale enables `phoneField` and another doesn't, the form renders differently per locale. This is by design (locale-specific configuration), but `contact.form.validate` warns on `emailField` inconsistency to prevent accidental divergence on the required field.

## Acceptance criteria

- [x] `emailField` (required) and `phoneField` (optional) props added to `send-message-section.manifest.yaml` (evidence: commit 3be7d0f30, manifest version 1.1.0)
- [x] `contactRequirementMessage` removed from manifest required props list (evidence: commit 3be7d0f30, property and required entry removed)
- [x] Generated types regenerated via `props.types.generate` (evidence: commit 1857de6ce, send-message-section.types.generated.ts has emailField/phoneField)
- [x] `send-message-section.astro` renders `<input>` fields when `enabled: true` (evidence: commit 9e083a2b2, conditional email/phone inputs with data attributes)
- [x] `send-message-section.client.ts` reads, validates, and includes structured fields in payload; `hasContactDetails` regex check removed (evidence: commit 5e9b85f6d, EMAIL_FORMAT_REGEX replaces EMAIL_REGEX/PHONE_REGEX)
- [x] `send-message-section.api.ts` accepts `email`/`phone` as top-level payload fields; regex extraction (`EMAIL_REGEX`, `PHONE_REGEX`, `hasContactDetails`) removed (evidence: commit e01bfca17, SendMessageBody has email/phone, EMAIL_FORMAT_REGEX validates format)
- [x] `contact.form.validate` command registered in `@gogol/site-kernel-checks` and integrated into `SITES_BUILD_CHECK_PIPELINE` (evidence: commit af358dbcd, contact-form.ts + 09-build-artifacts.ts + build-check.ts)
- [x] Migrator registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts` that adds default `emailField`/`phoneField` props and removes `contactRequirementMessage` from existing sites' send-message blocks (evidence: commit 44e4c3af8 + 17d262bf9, rfc-0514.ts with snapshot+PBT tests)
- [x] `AGENTS.md` updated where agent behavior rules changed (evidence: commit ac371389d, site-kernel-checks/AGENTS.md module table)
- [x] `rfc.validate` passes on this file before merging (evidence: no RFC-0514 errors in rfc.validate output)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
