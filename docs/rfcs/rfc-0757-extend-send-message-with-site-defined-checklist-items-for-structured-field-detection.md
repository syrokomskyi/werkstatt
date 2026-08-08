---
id: RFC-0757
title: "Extend send-message with site-defined checklist items for structured-field detection"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-08
updatedAt: 2026-08-08
enhancedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0514
  - RFC-0572
  - RFC-0567
  - RFC-0140
  - RFC-0181
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
# RFC-0480: explicitly declare that this RFC does NOT modify packages/ontology/src/external-surfaces/
# (it modifies archetypes/sections/send-message.yaml only). Silences V-30 warning.
breaksC: false
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/ui"
  - "@warpgogol/ontology"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "The send-message section renders a site-defined checklist with N configurable items, each with its own label, detection rule, and checked/unchecked state."
  - "The submit button is disabled (or visually gated) until all checklist items are satisfied, replacing the hardcoded 2-item (length + contact) checklist."
  - "Existing sites using send-message with the current 2-item checklist continue to work via backward-compatible defaults that map to the new N-item schema."
  - "Sites can define custom checklist items (e.g. 'include website URL', 'describe current CMS', 'mention budget range') via block props without code changes."
nonGoals:
  - "Does not add structured input fields (email, phone, select, radio) to the form — the single textarea UX from RFC-0572 is preserved."
  - "Does not change the server-side API, IntegrationEvent contract, or QStash delivery pipeline."
  - "Does not add CAPTCHA, honeypot, or bot protection."
  - "Does not change the referrerField (RFC-0567) — it remains optional."
  - "Does not remove the existing length and contact detection — they become default checklist items that sites can override or extend."
  - "Does not add server-side validation of checklist completeness — the checklist is a client-side UX gate only; the server still validates message content via regex extraction (RFC-0572)."
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

# RFC-0757: Extend send-message with site-defined checklist items for structured-field detection

## Context

The `send-message` section (`packages/ui/src/sections/send-message/`) is the primary B2B contact path on warpgogol-com. RFC-0572 reverted the form from structured fields (RFC-0514) back to a single textarea with regex-based email/phone extraction. Alongside the revert, a real-time validation checklist was added to the client script: two hardcoded items — **message length** (`minMessageLength`) and **contact details** (email or phone regex match) — with visual indicators that update on input and gate the submit button.

The current checklist is hardcoded to exactly two items in `send-message-section.client.ts`: `lengthItem` and `contactItem`. The archetype manifest (`send-message.yaml`) exposes `checklistTitle`, `checklistReadyLabel`, `checklistLengthLabel`, and `checklistContactLabel` as props, but there is no mechanism for sites to define additional checklist items or customize the detection logic per item.

A new page planned for warpgogol-com ("Відповідальні рекомендації" — Responsible Recommendations) requires two forms with different informational requirements: one form asks the visitor to include their website URL and current CMS in the message; another asks for a motivation statement and availability. These are different checklist items than the default length + contact pair. Without a generalizable checklist mechanism, each new form variant would require code changes to the shared `send-message` client script.

## Problem

1. **Hardcoded checklist items.** The `send-message-section.client.ts` `updateChecklist()` function checks exactly two conditions: `message.length >= minMessageLength` and `hasContactDetails(message)`. Sites cannot add, remove, or reorder checklist items without modifying the shared client script. This violates the composition-only principle: sites should configure behavior through props, not fork shared code.

2. **Fixed detection logic.** The `hasContactDetails()` function uses two hardcoded regex patterns (`EMAIL_EXTRACT_REGEX` and `PHONE_EXTRACT_REGEX`). Sites cannot define custom detection rules (e.g. "message contains a URL", "message mentions a CMS name", "message exceeds N characters about motivation") without code changes.

3. **Manifest/schema gap.** The archetype manifest (`send-message.yaml`) has individual props for each checklist label (`checklistLengthLabel`, `checklistContactLabel`) rather than a generalizable `checklistItems[]` array. Adding a third checklist item requires adding a new prop to the manifest, a new label to the client script, a new DOM element to the template, and a new detection function — all in shared packages.

4. **Template rigidity.** The `send-message-section.astro` template renders exactly two checklist items with fixed `data-send-message-checklist-item="length"` and `data-send-message-checklist-item="contact"` attributes. It cannot render N items from a configuration array.

## Decision

The `send-message` section gains a generalizable `checklistItems[]` prop that allows sites to define N checklist items, each with a label and a detection rule. The submit button is gated until all items are satisfied. The existing 2-item checklist (length + contact) becomes the default configuration that sites can override, extend, or replace. Detection rules are selected from a closed set of 4 rule types (`min-length`, `contact-details`, `url-presence`, `keyword-match`) to avoid arbitrary code execution from content.

## Architectural fit

- **DNA-17 (Uni manifest contract):** The RFC modifies the `send-message` section's archetype manifest `propsSchema` — adding a `checklistItems[]` array alongside the existing individual checklist label props (which are kept as fallback defaults). The manifest remains the authoritative source for the section's prop contract; generated types are regenerated by `props.types.generate`. The archetype YAML version bumps from `1.0.0` to `1.3.0`; the UI section manifest version bumps from `1.2.0` to `1.3.0`.
- **RFC-0572 (single-textarea revert):** Preserved. The single textarea UX, regex-based contact extraction, and `contactRequirementMessage` hint remain. This RFC generalizes the checklist that was added alongside RFC-0572's revert — it does not re-introduce structured input fields.
- **RFC-0567 (referrerField):** Preserved. The optional referrer field remains in the manifest, template, client, and API, orthogonal to the checklist mechanism.
- **RFC-0140 (colocated client script):** The client script remains colocated. The detection logic is refactored from two hardcoded functions to a rule dispatcher, but stays in `send-message-section.client.ts`.
- **RFC-0181 (QStash EU delivery):** Unchanged. The API still publishes `IntegrationEvent` to QStash. The checklist is a client-side UX gate — the server validation path (regex extraction) is unchanged.
- **Forward-only with default fallback:** The `checklistItems[]` prop defaults to the current 2-item configuration (length + contact) when absent. Existing sites that don't set `checklistItems[]` continue to work identically. The individual checklist label props (`checklistTitle`, `checklistReadyLabel`, `checklistLengthLabel`, `checklistContactLabel`) are kept as default label sources — they are still consumed by the default checklist construction, not dead code. A no-op migrator advances the cursor for RFC-0757.
- **Layer C:** No URL, JSON-LD, or sitemap changes — `breaksC: false`.

## Design

### CLI surface

No new commands. Generated types are regenerated by the existing command:

```sh
pnpm exec site-kernel run props.types.generate
```

The migrator runs during `mission.migrate`:

```sh
pnpm exec site-kernel run mission.migrate --mission <missionId>
```

### TypeScript contracts

```ts
// Closed set of detection rule types — no arbitrary code from content
type ChecklistRuleType =
  | "min-length"        // message.length >= value
  | "contact-details"   // email or phone regex match (RFC-0572 patterns)
  | "url-presence"      // URL regex match
  | "keyword-match";    // at least one keyword from items[] is present

interface ChecklistItem {
  id: string;           // unique within this checklist (e.g. "length", "contact", "website-url")
  label: string;        // display text shown to the visitor
  rule: ChecklistRuleType;
  value?: number;       // for min-length: the minimum character count
  keywords?: string[];  // for keyword-match: keywords to search for (case-insensitive)
}

// Manifest propsSchema addition (replaces individual checklist label props):
// checklistItems: z.array(z.object({ ... })).optional()
// When absent, defaults to [
//   { id: "length", label: checklistLengthLabel, rule: "min-length", value: minMessageLength },
//   { id: "contact", label: checklistContactLabel, rule: "contact-details" },
// ]

// Client-side rule dispatcher
function evaluateRule(
  rule: ChecklistRuleType,
  message: string,
  item: ChecklistItem,
): boolean {
  switch (rule) {
    case "min-length":
      return message.length >= (item.value ?? 1);
    case "contact-details":
      return EMAIL_EXTRACT_REGEX.test(message) || PHONE_EXTRACT_REGEX.test(message);
    case "url-presence":
      return URL_REGEX.test(message);
    case "keyword-match":
      const lower = message.toLowerCase();
      return (item.keywords ?? []).some((kw) => lower.includes(kw.toLowerCase()));
  }
}
```

The manifest `propsSchema` changes:

- `checklistTitle` — **kept** (optional, backward compatible)
- `checklistReadyLabel` — **kept** (optional, backward compatible)
- `checklistLengthLabel` — **kept** as fallback label for the default length item when `checklistItems` is absent
- `checklistContactLabel` — **kept** as fallback label for the default contact item when `checklistItems` is absent
- `checklistItems` — **added** as optional array of `ChecklistItem` objects
- `minMessageLength` — **kept** (used as `value` for the default length item when `checklistItems` is absent)

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/archetypes/sections/send-message.yaml` | Add `checklistItems[]` to `propsSchema.shape`; bump version to 1.3.0 |
| `packages/ui/src/sections/send-message/send-message-section.manifest.yaml` | Add `checklistItems[]` to `propsSchema`; bump version to 1.3.0 |
| `packages/ui/src/sections/send-message/send-message-section.types.generated.ts` | Regenerated by `props.types.generate` |
| `packages/ui/src/sections/send-message/send-message-section.astro` | Render N checklist items from `checklistItems[]` instead of 2 hardcoded items; fall back to default 2 items when prop is absent |
| `packages/ui/src/sections/send-message/send-message-section.client.ts` | Replace hardcoded `updateChecklist()` with `evaluateRule()` dispatcher; iterate over `checklistItems[]`; gate submit on all items satisfied |
| `packages/ui/src/sections/send-message/send-message-section.css` | Generalize checklist item styles from `.send-message__checklist-item--length`/`--contact` to `.send-message__checklist-item` with `data-send-message-checklist-item` attribute using item `id` as value |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0757.ts` | New no-op migrator (`fromVersion: "4.70.10"`, `toVersion: "4.71.0"`) — advances migrator cursor for RFC-0757; no content transformation needed because defaults work when `checklistItems[]` is absent |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Register the RFC-0757 migrator |

### Output format

No new `--json` output. The API response shape is unchanged (RFC-0572):

```json
{ "ok": true }
```

### Failure modes

- **Client-side:** If `checklistItems[]` is absent → fall back to the default 2-item checklist (length + contact), constructed from `checklistLengthLabel`, `checklistContactLabel`, and `minMessageLength`. If `checklistItems[]` is present but empty → the checklist container is not rendered and the submit button is always enabled (no gating). If a rule type is unknown → the item is ignored and a `console.warn` is emitted.
- **Server-side:** Unchanged from RFC-0572. The server validates message content via regex extraction independently of the client-side checklist. The checklist is a UX gate, not a security boundary.
- **Empty checklist edge case:** If `checklistItems: []` is explicitly set, the checklist UI is not rendered (the `<div data-send-message-checklist>` element is omitted from the template) and the form behaves like a plain textarea + submit (no checklist gating). This is intentional — some forms may not need a checklist.
- **Dynamic label text:** For `min-length` items, the client script updates the label text on each input event to show the remaining character count (e.g. "Mindestens 20 Zeichen (5 übrig)"). For all other rule types, the label text is static — set once from the item's `label` field during template render. The template renders the label text inside `<span data-send-message-checklist-text="{item.id}">` for each item; the client script updates only the `min-length` item's text span on input.

## Rollout

- **Default fallback:** The `checklistItems[]` prop defaults to the current 2-item configuration (length + contact) when absent. Existing sites that don't set `checklistItems[]` continue to work identically — no visual or behavioral change. The individual checklist label props (`checklistTitle`, `checklistReadyLabel`, `checklistLengthLabel`, `checklistContactLabel`) serve as default label sources for the fallback configuration; they are still consumed when `checklistItems[]` is absent.
- **Migrator (RFC-0479):** A no-op migrator (`rfc-0757.ts`) advances the migrator cursor during `mission.migrate`. No content transformation is needed because the default fallback works when `checklistItems[]` is absent. This follows the no-op migrator pattern established by RFC-0495, RFC-0496, RFC-0497, RFC-0498, RFC-0506, and RFC-0512.
- **warpgogol-com adoption:** After RFC acceptance, the contact page continues to use the default 2-item checklist. The new "Відповідальні рекомендації" page (separate RFC) will define custom `checklistItems[]` for its two forms.
- **New sites:** `onboarding.scaffold` does not need changes — the default 2-item checklist applies automatically when `checklistItems[]` is absent.
- **Pipeline integration:** No new pipeline steps. `page.block.validate` validates the `checklistItems[]` schema via the archetype manifest's `propsSchema`.
- **Performance:** Negligible. The `evaluateRule()` dispatcher runs N regex/string checks per input event, where N is typically 2–5. No measurable impact vs. the current 2-item hardcoded approach.

## Alternatives considered

- **Re-introduce structured input fields (RFC-0514 style).** Rejected — RFC-0572 explicitly superseded RFC-0514 because structured fields added UX friction for the target audience. The operator confirmed that the single-textarea approach with checklist detection is preferred over visible input fields.

- **Site-local archetype for send-message.** Rejected — the operator decided that all archetypes remain shared. A site-local archetype would fragment the section registry and violate the composition-only principle. The generalizable `checklistItems[]` approach keeps `send-message` shared while allowing site-specific configuration.

- **Arbitrary JavaScript detection functions from content.** Rejected — allowing content authors to define custom detection functions would create a code injection vector and break the content/code separation. The closed `ChecklistRuleType` enum ensures detection logic is reviewed and safe.

- **Keep the 2-item checklist and fork the client script for new forms.** Rejected — forking shared code for each new form variant violates the composition-only principle and creates maintenance burden. The generalizable approach scales to N items without code changes.

- **Move the checklist to a separate section archetype.** Rejected — the checklist is tightly coupled to the form's submit-gating behavior. Separating it would require inter-section communication and complicate the page composition model.

## Risks

- **Closed rule set extensibility.** The `ChecklistRuleType` enum has 4 values. Future forms may need detection rules not covered (e.g. "message contains a date", "message mentions a specific product name"). Mitigation: the `keyword-match` rule with a `keywords[]` array covers many cases. New rule types can be added via follow-up RFCs without breaking existing configurations.

- **Checklist bypass.** The checklist is a client-side UX gate only — a technically savvy visitor can bypass it via dev tools. Mitigation: the server-side validation (RFC-0572 regex extraction) remains the security boundary. The checklist improves UX quality, not security.

- **Default migration noise.** Not applicable — the migrator is a no-op (cursor advance only). No content is transformed; existing sites rely on the default fallback when `checklistItems[]` is absent.

- **Agent misinterpretation.** Agents may see the individual checklist label props (`checklistLengthLabel`, `checklistContactLabel`) and assume the checklist is still 2-item hardcoded. Mitigation: the `Implementation notes for agents` section explicitly states that `checklistItems[]` is the generalizable mechanism and the individual label props are backward-compatible fallbacks.

- **Visual regression.** Changing the template from 2 hardcoded items to N dynamic items may affect CSS layout. Mitigation: the CSS generalizes from specific item classes to a generic `.send-message__checklist-item` class. The existing `data-send-message-checklist-item` attribute is kept, with the item's `id` as the value (e.g. `data-send-message-checklist-item="length"`). The 2 default items render identically to the current layout.

## Acceptance criteria

- [ ] `checklistItems[]` added to `send-message.yaml` archetype `propsSchema` with `ChecklistItem` shape (id, label, rule, value?, keywords?) and `ChecklistRuleType` enum (min-length, contact-details, url-presence, keyword-match) (evidence: archetype YAML, version 1.3.0)
- [ ] `checklistItems[]` added to `send-message-section.manifest.yaml` `propsSchema` matching the archetype (evidence: manifest YAML, version 1.3.0)
- [ ] Generated types regenerated via `props.types.generate` (evidence: `send-message-section.types.generated.ts` has `checklistItems?: ChecklistItem[]`)
- [ ] `send-message-section.astro` renders N checklist items from `checklistItems[]` prop, falling back to default 2-item configuration when prop is absent (evidence: template code, no hardcoded `length`/`contact` item attributes)
- [ ] `send-message-section.client.ts` implements `evaluateRule()` dispatcher with all 4 rule types and gates submit on all items being satisfied (evidence: client code, `evaluateRule` function present)
- [ ] Existing sites with `send-message` blocks continue to work without changes when `checklistItems[]` is absent (evidence: `pnpm --filter @warpgogol/ui build:check` passes; warpgogol-com contact page renders identically before and after the change, verified by behavior.snapshot.validate or visual diff)
- [ ] Migrator registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts` that adds default `checklistItems[]` to existing sites (evidence: `rfc-0757.ts` with tests)
- [ ] `AGENTS.md` updated where agent behavior rules changed (evidence: `packages/ui/AGENTS.md` or `packages/ontology/AGENTS.md` if needed)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented). Draft RFCs cannot grant implementation permission.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT re-introduce structured input fields (email, phone, select, radio) to the send-message section. RFC-0572's single-textarea UX is preserved — this RFC generalizes the checklist, not the input fields.
- Agents MUST NOT add detection rule types beyond the closed `ChecklistRuleType` enum without a follow-up RFC. Arbitrary detection logic from content is prohibited.
- Agents MUST NOT remove the individual checklist label props (`checklistTitle`, `checklistReadyLabel`, `checklistLengthLabel`, `checklistContactLabel`) — they serve as default label sources for the fallback configuration when `checklistItems[]` is absent. They may be removed in a future RFC once all sites have explicit `checklistItems[]`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The `checklistItems[]` prop is optional. When absent, the section constructs the default 2-item checklist (length + contact) from the existing label props and `minMessageLength`. This is the default fallback path — do not remove it.
- The migrator is a no-op (cursor advance only). No content transformation is needed because the default fallback works when `checklistItems[]` is absent.
