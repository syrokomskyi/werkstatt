---
reviewId: REVIEW-CODE-2026-08-08-01
date: 2026-08-08
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 4fc3535c...HEAD
filesReviewed:
  - packages/ontology/archetypes/sections/send-message.yaml
  - packages/ui/src/sections/send-message/send-message-section.manifest.yaml
  - packages/ui/src/sections/send-message/send-message-section.types.generated.ts
  - packages/ui/src/sections/send-message/send-message-section.astro
  - packages/ui/src/sections/send-message/send-message-section.client.ts
  - packages/ui/src/sections/send-message/send-message-section.css
  - packages/os/site-kernel-handoff/src/migrators/rfc-0757.ts
  - packages/os/site-kernel-handoff/src/migrators/rfc-0757.snapshot.test.ts
  - packages/os/site-kernel-handoff/src/migrators/rfc-0757.pbt.test.ts
  - packages/os/site-kernel-handoff/src/migrators/registry.ts
  - packages/os/site-kernel-handoff/src/tests/migrators.test.ts
  - packages/os/site-kernel-handoff/src/tests/sternsystem.test.ts
---

# Code Review: RFC-0757 — extend send-message with site-defined checklist items

### Verdict: Needs revision

The implementation correctly generalizes the send-message checklist from 2 hardcoded items to N configurable items. The schema, template, client script, migrator, and tests are all structurally sound. However, the client script retains dead code (`hasContactDetails()` function and `minMessageLength` variable) from the pre-refactoring era, and the submit handler double-evaluates `evaluateRule` unnecessarily.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/ontology build:check`, `pnpm --filter @warpgogol/ui build:check`, `pnpm --filter @warpgogol/site-kernel-handoff build:check` all pass. All 798 handoff tests pass.

### Axis A — Structural correctness

1. **Dead code: `hasContactDetails()` function** — `send-message-section.client.ts:58-60` defines `hasContactDetails()` but it is no longer called anywhere. The `evaluateRule()` dispatcher handles contact-details checking internally via `EMAIL_EXTRACT_REGEX.test(message) || PHONE_EXTRACT_REGEX.test(message)`. Remove the function.

2. **Unused variable: `minMessageLength`** — `send-message-section.client.ts:233` reads `const minMessageLength = Number(form.dataset.minMessageLength ?? "0");` but never uses it. The min-length check now uses `item.value` from `checklistItems` via `evaluateRule`. Remove the variable declaration.

3. **Double evaluation in submit handler** — `send-message-section.client.ts:285-287` calls `checklistItems.find((item) => !evaluateRule(item.rule, message, item))` to find the first failing item, but `updateChecklist` (line 181-189) already evaluated all items and found `firstFailingItem`. The first failing item's rule could be returned from `updateChecklist` alongside `firstFailingItem` to avoid re-evaluating all rules. This is a performance issue (N regex tests on every submit) and a DRY violation.

4. **Dead data attributes on form element** — `send-message-section.astro:143-144` still sets `data-checklist-length-label` and `data-checklist-contact-label` on the form, but the client script no longer reads them (the labels now come from the `checklistItems` JSON). These are harmless but add unnecessary DOM weight. Note: the RFC explicitly requires keeping the _props_ in the schema as fallback defaults, but the _data attributes_ on the form are redundant since the client gets labels from `checklistItems` JSON.

### Axis B — DNA alignment

No issues. The migrator follows the forward-only pattern (DNA-48 release discipline). No DNA invariants are violated by this change.

### Axis C — Ecosystem fit

No issues. Package boundaries are respected (ontology → ui → client script). The migrator is correctly registered in the registry with proper version range. The archetype and manifest versions are bumped in sync.

### Axis D — Forward-only compliance

No issues. No backward compatibility shims. The default 2-item fallback is not a compatibility layer — it is the default configuration when `checklistItems[]` is absent, which is the intended design per the RFC.

### Axis E — Agent-facing clarity

No issues. All new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. CHANGE_SUMMARY entries are added to all modified files. Variable and function names are clear (`evaluateRule`, `checklistItems`, `defaultChecklistItems`).

### Axis F — Pragmatism

1. **Catch-all error message** — `send-message-section.client.ts:292-294` uses `contactRequirementMessage` as the error message for `url-presence` and `keyword-match` rule failures. This may confuse visitors — a "please include contact details" message is shown when the actual failure is "please include a URL" or "please mention a keyword". Consider adding per-rule error messages or a generic checklist error message prop.

### Axis G — Blind spots

No issues. The checklist is client-side UX only (server-side validation is the security boundary per RFC-0572). Empty `checklistItems[]` is handled (checklist container is not rendered). JSON parse failure is caught with a `console.warn`.

### Spec compliance

| Requirement from RFC-0757 | Status | Evidence |
| --- | --- | --- |
| Add `checklistItems[]` to archetype | Done | `send-message.yaml:47-53`, version 1.3.0 |
| Add `checklistItems[]` to manifest | Done | `send-message-section.manifest.yaml:144-175`, version 1.3.0 |
| Regenerate types | Done | `send-message-section.types.generated.ts:115-118` |
| Render N items in template | Done | `send-message-section.astro:196-212` |
| `evaluateRule()` dispatcher with 4 rule types | Done | `send-message-section.client.ts:41-57` |
| Default 2-item fallback | Done | `send-message-section.astro:66-78` |
| No-op migrator registered | Done | `rfc-0757.ts`, `registry.ts:83` |
| Tests for migrator | Done | `rfc-0757.snapshot.test.ts`, `rfc-0757.pbt.test.ts` |
| Keep individual label props as fallback | Done | Props remain in schema and template |

### Questions for the author

1. Should `hasContactDetails()` and `minMessageLength` be removed now that `evaluateRule()` handles all rule evaluation, or are they kept for future use?
2. Is the double `evaluateRule` call in the submit handler acceptable, or should `updateChecklist` return the first failing item's rule to avoid re-evaluation?
3. Should `url-presence` and `keyword-match` rule failures show a specific error message instead of the generic `contactRequirementMessage`?
