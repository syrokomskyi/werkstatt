---
rfcId: RFC-0514
auditId: AUDIT-RFC-0514-01
date: 2026-07-24
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0514

## Verdict: Needs revision

The RFC has a clear problem statement and a reasonable design, but two findings block approval: (1) the `satisfies: [DNA-24]` reference is factually wrong — DNA-24 is "Block-declarative pages," not "B2B trust funnel" — and (2) the RFC explicitly proposes an indefinite dual-path (regex fallback retained alongside structured fields), violating the forward-only principle. Several smaller ecosystem-fit issues also need resolution.

## Mechanical validation (rfc.validate)

Pass for RFC-0514. The full `rfc.validate` run reports errors for other RFCs (RFC-0475, 0478, 0511, 0512, 0513), but no diagnostics target RFC-0514.

## Axis A — Structural completeness

- **`commands.changed` lists `content.voice.lint` without explanation.** The RFC body never mentions voice linting or describes any change to `content.voice.lint`. If new labels (`emailFieldLabel`, `phoneFieldLabel`, etc.) require voice-lint coverage, the RFC should say so. Otherwise, remove this entry from `commands.changed`.
- **File system responsibilities table has an incorrect path.** The RFC lists `packages/share/src/semantic/block-extractors/index.ts` but the actual file is `packages/share/src/semantic/block-extraction.ts` (a single file, not a directory with an `index.ts`).

## Axis B — DNA alignment

- **FAIL: `satisfies: [DNA-24]` is incorrect and mislabeled.** DNA-24 is "Block-declarative pages" — it governs frontmatter-only page documents with `blocks[]` arrays. The RFC's architectural fit section says "DNA-24 (B2B trust funnel): Structured contact fields improve lead quality…" — this label is fabricated; DNA-24 has nothing to do with B2B trust funnels. The RFC does not explain how adding structured email/phone fields to a section manifest enforces, protects, or extends the block-declarative pages invariant. Either find the correct DNA invariant or remove the `satisfies` entry. There is no "B2B trust funnel" DNA invariant in `docs/architecture-dna.md`.

## Axis C — Ecosystem fit

- **`packagesImpacted` omits `@gogol/site-kernel-checks`.** The proposed `contact.form.validate` command will live in `packages/os/site-kernel-checks/` (where all other validators reside — see `src/command-tables/` and `src/pipelines/`). The RFC lists only `@gogol/ui` and `@gogol/share`.
- **Pipeline placement is underspecified.** The RFC says `contact.form.validate` is "integrated into `build.check`" but doesn't name the pipeline constant (`SITES_BUILD_CHECK_PIPELINE`) or describe whether it's a blocking or advisory step. Looking at `packages/os/site-kernel-checks/src/pipelines/build-check.ts`, the pipeline is a flat list — the RFC should specify where the new step inserts.
- **Cosmic naming not addressed.** The RFC adds new props to `send-message-section.manifest.yaml` (cosmicName: Ceres) but doesn't discuss whether the manifest's `version` field should bump (currently `1.0.0`) or whether `props.types.generate` regeneration is sufficient without a manifest version change.

## Axis D — Forward-only compliance

- **FAIL: Indefinite dual-path (regex fallback).** The RFC explicitly states: "falling back to regex extraction from the message body only when structured fields are absent (backward compatibility)" (line 103) and "The regex fallback path is retained indefinitely for backward compatibility but is not the recommended path for new deployments" (line 184). This is a compatibility shim that keeps legacy behavior alive alongside the new structured-fields path. The forward-only principle requires that deprecation means removal in the same RFC wave, not an indefinite grace period. The RFC should either: (a) remove the regex extraction entirely and require all sites using the send-message section to declare `emailField`/`phoneField` props (with a migrator for existing sites), or (b) set a concrete removal timeline within this RFC wave and mark the regex path as deprecated-with-expiry, not "retained indefinitely."

## Axis E — Agent-facing policy

No issues. The RFC correctly gates implementation on `status: accepted`, references RFC-0224, RFC-0334, and RFC-0330 in the implementation notes, and does not introduce cookies or self-authorizing language.

## Axis F — Pragmatism

- The `contact.form.validate` command earns its existence — cross-locale consistency of structured field props is a real validation gap that no existing command covers.
- TypeScript contracts (`SendMessagePayload`, `EmailFieldConfig`, `PhoneFieldConfig`) are minimal and focused.
- `nonGoals` are explicit and meaningful (no CAPTCHA, no SMTP verification, no QStash changes).

## Axis G — Blind spots

- **Performance of `contact.form.validate` is unspecified.** The command scans all locales of all sites using the send-message section. The RFC should estimate the cost (file count, I/O pattern) since it runs in `build.check` on every build.
- **GDPR/privacy posture not explicitly addressed.** The RFC adds structured PII capture (email, phone) but doesn't state that the privacy posture is unchanged — the same `IntegrationEvent.contact` shape, the same QStash EU delivery pipeline, and the same retention rules apply. This should be explicit.
- **Cross-locale runtime behavior is unaddressed.** The validator catches configuration inconsistency, but the RFC doesn't describe what happens at runtime when one locale enables `emailField` and another doesn't — does the section render different fields per locale? This is a UX edge case worth documenting.

## Questions for the author

1. Which DNA invariant does this RFC actually satisfy? DNA-24 is "Block-declarative pages" — if the intent was to reference a B2B trust funnel invariant, no such DNA entry exists. Should the RFC create one, or remove the `satisfies` entry?
2. Why is `content.voice.lint` listed under `commands.changed`? What change does this RFC make to voice linting?
3. Will the regex fallback be removed in this RFC wave, or is there a concrete deprecation timeline? "Retained indefinitely" violates the forward-only principle — what is the removal path?
