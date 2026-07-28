---
id: RFC-0572
title: "Revert contact form to single-textarea with message-embedded contact extraction"
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
createdAt: 2026-07-28
updatedAt: 2026-07-28
enhancedAt: 2026-07-28
implementedAt: 2026-07-28
closedAt:
supersedes:
  - RFC-0514
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0140
  - RFC-0168
  - RFC-0181
  - RFC-0514
  - RFC-0567
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
  proposed: []
  added: []
  changed: []
  removed:
    - contact.form.validate
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/ui"
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "The send-message section renders a single textarea and a submit button. No structured email or phone input fields are rendered. The referrerField remains optional."
  - "Client-side validation checks that the message text contains an email address or phone number via regex before submitting. If neither is found, a contactRequirementMessage hint is shown."
  - "Server-side API extracts email and phone from the message body via regex and populates IntegrationEvent.contact with the extracted values. At least one of email or phone must be present."
  - "The QStash delivery pipeline (RFC-0181) is unchanged — IntegrationEvent is published to QStash EU with contact populated from regex extraction."
  - "contact.form.validate command is removed from site-kernel-checks and from SITES_BUILD_CHECK_PIPELINE."
  - "A migrator removes emailField and phoneField props from existing sites' send-message block configurations and re-adds contactRequirementMessage."
  - "The contact page on warpgogol-com renders the simplified single-textarea form."
nonGoals:
  - "Does not change the QStash delivery pipeline, IntegrationEvent contract, or /api/integration-route callback."
  - "Does not remove the referrerField (RFC-0567) — it remains optional."
  - "Does not add CAPTCHA, honeypot, or bot protection — that is a separate concern."
  - "Does not improve regex accuracy beyond the pre-RFC-0514 patterns — the trade-off of fragile extraction is accepted for UX simplicity."
  - "Does not add server-side email validation beyond format checking — SMTP verification is out of scope."
  - "Does not make phone mandatory — the visitor may provide email OR phone in the message text."
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

# RFC-0572: Revert contact form to single-textarea with message-embedded contact extraction

## Context

The send-message section (`packages/ui/src/sections/send-message/`) is the primary B2B contact path on warpgogol-com. RFC-0514 (implemented 2026-07-24) replaced the original single-textarea UX — where the visitor writes everything in one field and the system regex-extracts email/phone from the message body — with structured `emailField` (required) and `phoneField` (optional) `<input>` fields alongside the textarea.

The operator has determined that the structured-fields form is more friction than the audience needs. The original single-textarea form was simpler and converted better for the target audience (artisans and small local businesses who write a few sentences and naturally include their phone or email in the text). The structured form adds visible fields, labels, and validation steps that make the form feel longer and more bureaucratic.

The form already participates in the ecosystem: it publishes an `IntegrationEvent` to QStash EU (RFC-0181), which fans out to channels (Telegram, WhatsApp, Email) and CRM (Pipedrive/Supabase) via `/api/integration-route`. This ecosystem integration is unchanged by the revert — only the UX layer (form fields and extraction method) changes.

## Problem

1. **UX friction.** The structured-fields form (RFC-0514) adds two visible input fields (email + phone) plus an optional referrer field on top of the textarea. For the target audience — artisans and small local businesses — this is more form than they need. The original single-textarea form let them write naturally and include contact details in the text.

2. **Over-engineered validation.** RFC-0514 introduced `contact.form.validate` to enforce `emailField.enabled: true` across all locales. This command is only meaningful while structured fields exist. Without them, it is dead code that adds pipeline overhead with no value.

3. **Manifest complexity.** The `send-message-section.manifest.yaml` requires `emailField` as a mandatory prop in `propsSchema`. Sites cannot use the section without declaring it. This forces every site to configure structured fields even when the simpler single-textarea UX is preferred.

## Decision

The send-message section reverts to a single-textarea UX with regex-based contact extraction from the message body. RFC-0514 is superseded: structured `emailField` and `phoneField` props are removed from the manifest, the `<input>` fields are removed from the template, and the client/API return to regex extraction of email and phone from the message text. The `referrerField` (RFC-0567) remains optional. The `contact.form.validate` command is removed. A migrator strips `emailField`/`phoneField` props from existing sites and re-adds `contactRequirementMessage`. The QStash delivery pipeline (RFC-0181) and `IntegrationEvent` contract are unchanged.

## Architectural fit

- **DNA-17 (Uni manifest contract):** The RFC modifies the send-message section's manifest `propsSchema` — removing `emailField` (required) and `phoneField` (optional), re-adding `contactRequirementMessage` (optional). The manifest remains the authoritative source for the section's prop contract; generated types are regenerated by `props.types.generate`. The manifest version bumps from `1.1.0` to `1.2.0`.
- **Forward-only:** This is a clean supersede of RFC-0514, not a dual-path. Structured fields are removed entirely. Existing sites are migrated by a migrator (RFC-0479) that strips `emailField`/`phoneField` props and re-adds `contactRequirementMessage`. No compatibility shim, no fallback path.
- **RFC-0181 (QStash EU delivery):** Unchanged. The API still publishes `IntegrationEvent` to QStash. The `contact` object is populated from regex extraction instead of structured fields, but the `IntegrationEvent` contract (`contact?: { email?: string; phone?: string }`) already supports this — both fields are optional.
- **RFC-0567 (referrerField):** Preserved. The optional referrer field remains in the manifest, template, client, and API.
- **Layer C:** No URL, JSON-LD, or sitemap changes — `breaksC: false`.

## Design

### CLI surface

No new commands. One command is removed:

```sh
# Removed — no longer needed after RFC-0514 supersede
# pnpm exec site-kernel run contact.form.validate --site warpgogol-com
```

Generated types are regenerated by the existing command:

```sh
pnpm exec site-kernel run props.types.generate
```

The migrator runs during `mission.migrate`:

```sh
pnpm exec site-kernel run mission.migrate --mission <missionId>
```

### TypeScript contracts

```ts
// Client payload — email/phone are no longer top-level fields
interface SendMessagePayload {
  message: string;
  formId: string;
  referrer?: string;
}

// API extracts email/phone from the message body via regex
const EMAIL_EXTRACT_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_EXTRACT_REGEX = /(?:\+?\d[\d\s\-()]{7,}\d)/;

function extractContact(message: string): { email?: string; phone?: string } {
  const emailMatch = message.match(EMAIL_EXTRACT_REGEX);
  const phoneMatch = message.match(PHONE_EXTRACT_REGEX);
  return {
    ...(emailMatch ? { email: emailMatch[0] } : {}),
    ...(phoneMatch ? { phone: phoneMatch[0] } : {}),
  };
}

function hasContactDetails(message: string): boolean {
  return EMAIL_EXTRACT_REGEX.test(message) || PHONE_EXTRACT_REGEX.test(message);
}
```

The manifest `propsSchema` changes:

- `emailField` — **removed** from required and properties
- `phoneField` — **removed** from properties
- `contactRequirementMessage` — **re-added** as optional string (hint shown when message contains no email or phone)
- `referrerField` — **unchanged** (optional)

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/sections/send-message/send-message-section.manifest.yaml` | Remove `emailField`/`phoneField` from `propsSchema`; re-add `contactRequirementMessage`; bump version to 1.2.0 |
| `packages/ui/src/sections/send-message/send-message-section.types.generated.ts` | Regenerated by `props.types.generate` |
| `packages/ui/src/sections/send-message/send-message-section.astro` | Remove email/phone `<input>` field rendering; remove `data-email-field-*`/`data-phone-field-*` attributes; add `data-contact-requirement-message` attribute |
| `packages/ui/src/sections/send-message/send-message-section.client.ts` | Re-add `EMAIL_EXTRACT_REGEX`, `PHONE_EXTRACT_REGEX`, `hasContactDetails()`; remove `emailInput`/`phoneInput` logic; validate contact presence in message before submit |
| `packages/ui/src/sections/send-message/send-message-section.api.ts` | Re-add regex extraction from message body; remove `email`/`phone` as top-level payload fields; require at least one of extracted email/phone |
| `packages/ui/src/sections/send-message/send-message-section.css` | Remove `.send-message__field--email`/`.send-message__field--phone` styles |
| `packages/os/site-kernel-checks/src/contact-form.ts` | **Deleted** — `contact.form.validate` command removed |
| `packages/os/site-kernel-checks/src/pipelines/build-check.ts` | Remove `contact.form.validate` step from `SITES_BUILD_CHECK_PIPELINE` |
| `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` | Remove `contact.form.validate` command table entry (line ~453) |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0572.ts` | New migrator (`fromVersion: "4.19.0"`, `toVersion: "4.20.0"`) — strips `emailField`/`phoneField` props, re-adds `contactRequirementMessage`; no-op on sites without structured fields |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Register the RFC-0572 migrator |
| `systems/warpgogol-com/src/content/pages/{de,uk}/contact.md` | Remove `emailField`/`phoneField` props; update `body.paragraphs` to reflect single-textarea UX |

### Output format

No new `--json` output. The `contact.form.validate` command is removed; its output shape is no longer relevant.

The API response shape is unchanged:

```json
{ "ok": true }
```

Error responses gain a new code:

```json
{ "ok": false, "error": "no-contact-details" }
```

Returned when the message body contains neither an email address nor a phone number.

### Failure modes

- **Client-side:** If the message is empty → show `emptyMessage` hint. If the message contains no email or phone → show `contactRequirementMessage` hint. The form is not submitted.
- **Server-side:** If the message is empty → `400 { error: "empty-message" }`. If the message exceeds `MAX_MESSAGE_LENGTH` → `400 { error: "message-too-long" }`. If regex extraction finds no email and no phone → `400 { error: "no-contact-details" }`. If QStash publish fails → `502 { error: "publish-failed" }`.
- **Regex miss:** A visitor may include a contact method in a format the regex does not match (e.g. an unusual phone format). The form shows `contactRequirementMessage` and the visitor can adjust. This is the accepted trade-off of the single-textarea approach.

## Rollout

- **Migrator (RFC-0479):** A migrator (`rfc-0572.ts`, `fromVersion: "4.19.0"`, `toVersion: "4.20.0"`) runs during `mission.migrate` for each site with a `send-message` block. It removes `emailField` and `phoneField` props from the block configuration (if present) and re-adds `contactRequirementMessage` if not present. The migrator is idempotent and a no-op on sites that never had structured fields (e.g. sites created after RFC-0572). The migrator also removes `emailFieldLabel`, `phoneFieldLabel`, `emailFieldPlaceholder`, `phoneFieldPlaceholder` from site labels if they exist. The RFC-0514 migrator remains in the registry (append-only); the RFC-0572 migrator runs after it.
- **warpgogol-com adoption:** After RFC acceptance and migrator application, the contact page renders a single textarea with a submit button. The placeholder instructs the visitor to include their email or phone in the message. The `body.paragraphs` are updated to reflect the single-textarea UX.
- **New sites:** `onboarding.scaffold` includes `contactRequirementMessage` in the contact page template by default. No `emailField` or `phoneField` props.
- **Pipeline integration:** `contact.form.validate` is removed from `SITES_BUILD_CHECK_PIPELINE`. The `build.check` pipeline no longer includes the contact form validation step.
- **Performance:** No new runtime cost. Regex extraction is a single-pass string match — negligible (< 1ms). The removal of `contact.form.validate` reduces build-check pipeline I/O.

## Alternatives considered

- **Keep structured fields as optional (dual-path).** Rejected — the platform is forward-only. Keeping structured fields as optional alongside regex extraction creates a dual-path that is harder to maintain and violates the forward-only principle. A clean supersede is the correct approach.
- **Improve regex accuracy before reverting.** Rejected — the operator has decided that UX simplicity outweighs regex fragility. The pre-0514 regex patterns are adequate for the target audience. Improving regex can be done in a follow-up RFC if needed.
- **Remove referrerField too.** Rejected — the operator explicitly chose to keep it. It is optional and does not add friction when disabled.
- **Repurpose contact.form.validate.** Rejected — the command was created specifically for RFC-0514's structured-fields invariant. Without structured fields, there is nothing meaningful to validate statically. Removing the command is cleaner than repurposing it for hint-text checking.

## Risks

- **Regex fragility.** International phone formats, multiline inputs, and edge cases can cause missed or incorrect extraction. The `PHONE_EXTRACT_REGEX` pattern is permissive — it may match long digit sequences in addresses, dates, or postal codes — producing false positives. Mitigation: the `contactRequirementMessage` hint tells the visitor to include email or phone, and the form does not submit until contact details are detected. The visitor can visually verify and adjust before resubmitting. The trade-off of fragile extraction is accepted for UX simplicity (see nonGoals).
- **Data quality.** Regex-extracted contact details may contain trailing punctuation or partial matches. Mitigation: the regex patterns use bounded character classes; extracted values are trimmed before being placed into `IntegrationEvent.contact`.
- **Migrator failure on edge-case configurations.** Sites with non-standard send-message block props might not migrate cleanly. Mitigation: the migrator is idempotent (RFC-0479) and only touches `emailField`/`phoneField`/`contactRequirementMessage` — it leaves other props untouched.
- **Agent misinterpretation.** Agents may see the archived RFC-0514 and re-add structured fields. Mitigation: this RFC's `supersedes: [RFC-0514]` and the `Implementation notes for agents` section explicitly state that structured fields are removed.
- **Reduced lead data.** Without a required email field, some leads may arrive with only a phone number. Mitigation: the `IntegrationEvent.contact` contract already supports phone-only leads, and downstream channels (Telegram, WhatsApp) work with phone numbers.

## Acceptance criteria

- [x] `emailField` and `phoneField` removed from `send-message-section.manifest.yaml` `propsSchema` (evidence: commit 74c230b, manifest version 1.2.0, no `emailField`/`phoneField` in required or properties)
- [x] `contactRequirementMessage` re-added as optional string prop in manifest `propsSchema` (evidence: commit 74c230b, `contactRequirementMessage` in properties with type: string, minLength: 1)
- [x] Generated types regenerated via `props.types.generate` (evidence: commit 74c230b, `send-message-section.types.generated.ts` has `contactRequirementMessage?: string`, no `emailField`/`phoneField`)
- [x] `send-message-section.astro` no longer renders email/phone `<input>` fields (evidence: commit 74c230b, no `data-send-message-email`/`data-send-message-phone` in template)
- [x] `send-message-section.client.ts` re-adds `hasContactDetails()` regex check and shows `contactRequirementMessage` when no contact found in message (evidence: commit 74c230b, `EMAIL_EXTRACT_REGEX`/`PHONE_EXTRACT_REGEX`/`hasContactDetails` present, `emailInput`/`phoneInput` logic removed)
- [x] `send-message-section.api.ts` extracts email/phone from message body via regex and returns `400 { error: "no-contact-details" }` when neither is found (evidence: commit 74c230b, `extractContact()` function present, no `email`/`phone` in `SendMessageBody`)
- [x] `contact.form.validate` command removed from `site-kernel-checks` and from `SITES_BUILD_CHECK_PIPELINE` (evidence: commit 0e8d303, `contact-form.ts` deleted, no `contact.form.validate` in command tables or pipeline)
- [x] Migrator registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts` that strips `emailField`/`phoneField` and re-adds `contactRequirementMessage` (evidence: commit 3a563a6, `rfc-0572.ts` with snapshot+PBT tests, 287 tests pass)
- [x] `AGENTS.md` updated where agent behavior rules changed (evidence: commit 0e8d303, `site-kernel-checks/AGENTS.md` module table no longer lists `contact-form.ts`)
- [x] `rfc.validate` passes on this file before merging (evidence: no RFC-0572-specific validation errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented). Draft RFCs cannot grant implementation permission.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT re-add `emailField` or `phoneField` structured input props to the send-message section manifest, template, client, or API. RFC-0514 is superseded by this RFC — structured fields are removed, not optional.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Agents MUST NOT remove the `referrerField` (RFC-0567) — it is preserved by this RFC and remains optional.
- The RFC-0514 migrator (`rfc-0514.ts`) remains in the migrator registry (append-only, RFC-0479). The RFC-0572 migrator runs after it — sites that already ran RFC-0514 will have `emailField` which RFC-0572 strips.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
