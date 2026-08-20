---
rfc: RFC-0888
createdAt: 2026-08-20
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 1
uniqueFindings: 3
---

# Design Summit: RFC-0888

## Architect

### Findings

- **A1 (concern):** The `--skip-bordbuch` flag creates a hidden coordination coupling between `nachweis.manifest.generate` and its callers (`nachweis.publish`, `nachweis.withdraw`). Any future command that calls `manifest.generate` internally must know about this flag to avoid duplicate `sichtpass` entries. The coupling is documented in the RFC but not discoverable from the command's flag registration alone — a code comment or named constant would make the coordination pattern explicit.
- **A2 (observation):** The RFC correctly amends RFC-0473 rather than superseding it. The `sichtpass` kind was explicitly deferred in RFC-0473, and this RFC fulfills that deferral. No structural issues.

### No concerns

- DNA-46 alignment is correctly explained — the RFC extends the audit trail within the existing mission lifecycle.
- No new packages, commands, or lifecycles are introduced. The change is additive to existing commands.
- Reversibility: removing `"sichtpass"` from the enum would break `bordbuch.validate` for entries already written with this kind. This is the same irreversibility as any Bordbuch kind addition — acceptable.

## Security Engineer

### Findings

No concerns. The `sichtpass` entry follows the same security patterns as existing Bordbuch kinds:

- Writer-role validation (`nachweis` role) is enforced via `WRITER_ROLE_KINDS`.
- `containsSensitivePayload` guard checks the summary field.
- Metadata contains only hashes (`recordHash`), booleans, and slugs — no sensitive payload.
- Hash-chain integrity is maintained — the entry is appended through `appendBordbuchEntry` which computes `previousHash` and `hash`.
- No new trust boundaries, no cookies, no client-side storage.

## QA Engineer

### Findings

- **Q1 (concern):** Edge case — what happens if an agent passes `--skip-bordbuch` to `nachweis.manifest.generate` standalone (not from publish/withdraw)? The manifest is regenerated but no `sichtpass` entry is appended, creating a gap in the audit trail. The RFC says the flag is "internal" and "not documented in CLI help", but it is still a valid CLI flag that an agent could discover by reading code or command registration. Should the command warn or log when `--skip-bordbuch` is set but the caller is not publish/withdraw? Recommendation: add a `logger.debug` or `logger.info` message when `--skip-bordbuch` is set, so the audit trail gap is at least logged.
- **Q2 (observation):** The plan's test suite (6 tests) covers the main paths. Missing test: `sichtpass` entry with empty manifest (no published records). The plan says `recordHash` = empty string — this should be tested.

## Product Manager

### Findings

- **P1 (concern):** The `slug: "__manifest__"` convention for standalone `manifest.generate` calls may confuse external verifiers. They'll see `sichtpass` events with real slugs (from publish/withdraw) and events with `slug: "__manifest__"` (from standalone manifest.generate). The semantic difference is "this event covers the entire manifest regeneration" vs "this event covers a specific record's lifecycle". Recommendation: document this convention in the RFC's Output format section or in a comment in the manifest handler, so verifiers understand the distinction.

### No concerns

- Problem statement is grounded — external verifiers cannot trace Sichtpass to a Bordbuch event. This is a real gap.
- Rollout is additive, no migration needed. Low risk.
- Scope is correctly bounded — one event kind, three commands, no feature creep.
- `nonGoals` are explicit and meaningful (no W3C VC, no other deferred kinds, no hash-chain changes).

## Developer Advocate

### Findings

- **D1 (concern):** The `--skip-bordbuch` flag is not documented in CLI help but is visible in the command registration code (`nachweis.module.ts`). A new agent reading the code will see the flag but won't understand its purpose without reading the RFC. Recommendation: add a code comment in `nachweis.module.ts` near the flag registration explaining: "Internal coordination flag — set by `nachweis.publish` and `nachweis.withdraw` to prevent duplicate `sichtpass` Bordbuch entries. See RFC-0888."
- **D2 (observation):** The RFC's `Implementation notes for agents` section is well-written — explicit MAY/MUST NOT rules, clear scope boundaries. No issues.

## Consensus findings

- **A1 + D1 (2 personas — Architect + Developer Advocate):** The `--skip-bordbuch` flag creates a coordination coupling that is documented in the RFC but not discoverable from code alone. Recommendation: add a code comment in `nachweis.module.ts` near the flag registration explaining the coordination pattern and referencing RFC-0888. This is a documentation-only fix that can be integrated into the implementation plan.

## Unique findings

- **Q1 (QA):** `--skip-bordbuch` set standalone creates a silent audit trail gap. Recommendation: log a message when the flag is set.
- **Q2 (QA):** Missing test for empty manifest `sichtpass` entry. Recommendation: add test case.
- **P1 (PM):** `slug: "__manifest__"` convention may confuse external verifiers. Recommendation: document the convention in the RFC or in code comments.

## Recommendation

**Proceed to acceptance.** The consensus finding (A1+D1) is a documentation-only improvement that can be integrated into the implementation plan as a code comment in Step 2. The unique findings are minor edge cases and documentation improvements that do not block acceptance. The RFC is well-structured, narrowly scoped, and follows established patterns.

Suggested plan amendments:
1. Step 2: Add code comment near `--skip-bordbuch` flag registration explaining the coordination pattern.
2. Step 6: Add test case for empty manifest `sichtpass` entry.
3. Step 3: Add `logger.info` when `--skip-bordbuch` is set, so the audit trail gap is logged.

---

*No findings does not mean no issues — it means no issues were found from these five perspectives.*
