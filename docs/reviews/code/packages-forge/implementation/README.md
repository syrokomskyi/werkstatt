---
implementationSet: FORGE-KNOWLEDGE-HARDENING-2026-08-15
status: ready
sourceReview: ../review-2026-08-15-00-10-packages-forge.md
normativeRfcIds:
  - RFC-0524
  - RFC-0660
  - RFC-0661
  - RFC-0662
  - RFC-0663
---

# Forge knowledge lifecycle hardening — implementation index

This set turns the findings in the source review into five bounded work packets. It restores already accepted contracts; it does not introduce a new architecture decision and must not reopen, amend, stamp, or rearchive the terminal RFCs.

## Operator intent

- Implement one packet per session, in numeric order.
- A session owns only the files named by its packet plus unavoidable generated artifacts.
- Each packet must leave its scope internally consistent, tested, committed, and with all repository trees clean.
- Do not publish `@warpgogol/forge`. Publication remains a separate explicit operator action.
- The project may remain partially migrated between sessions. Dependency gates below prevent an agent from running code that assumes a later packet already exists.

## Fixed decisions

1. Existing document bytes are preserved with parser-produced source spans and targeted edits. Compaction must not reconstruct an existing file from semantic fields.
2. Compaction uses archive-first, idempotent convergence. A crash may leave a recoverable duplicate across archive/live, but must never lose an entry; the next run removes the duplicate without appending it again.
3. Shared knowledge is budgeted exactly once per workspace under `budgets.shared`, default 4096.
4. Authority is environment-dependent:
   - Forge monorepo: `packages/forge/skills/**` is canonical; `.agents/skills/**` is a replaceable mirror.
   - npm consumer: `.agents/skills/**/SKILL.md` is managed, but existing cumulative knowledge files are project-owned mutable state and must not be overwritten by upgrade.
   - declared pack source remains canonical inside the consumer workspace; its `.agents` copy is a mirror.
5. Accumulated monorepo knowledge remains in source control but is excluded from the npm payload. Consumers receive separate structured-empty templates.
6. No new Werkstatt command, compatibility path, or RFC is permitted unless a packet's explicit escalation condition is met.

## Execution order

| Order | Packet | Depends on | Session outcome |
| --- | --- | --- | --- |
| 1 | [01 — Byte-preserving documents](01-byte-preserving-knowledge-documents.md) | none | Parser spans, canonical serializer, targeted edit writer |
| 2 | [02 — Crash-safe compaction](02-crash-safe-compaction.md) | packet 01 committed | Async atomic compaction with convergent recovery and truthful report |
| 3 | [03 — Shared budget](03-shared-budget-enforcement.md) | packets 01–02 committed | Typed `shared` budget counted exactly once |
| 4 | [04 — Sync and publication boundary](04-sync-and-publication-boundary.md) | packets 01–03 committed | Correct authority modes, same-version repair, sanitized npm payload |
| 5 | [05 — Integration verification](05-integration-verification.md) | packets 01–04 committed | Full regression evidence and cross-surface review/fix |

Do not parallelize packets: packets 02 and 04 intentionally depend on contracts introduced earlier.

## Session entry protocol

Every implementation session must:

1. Read root and nearest `AGENTS.md`, the source review, this index, and only the assigned packet.
2. Confirm all prerequisite packet commits exist and the tree is clean with `bash scripts/check-clean-trees.sh`.
3. Use the `fo-fix` workflow against the assigned finding set. Do not use `fo-idea-implement`: the normative RFCs are terminal.
4. Inspect git history/RFC intent before removing or replacing an existing field or behavior.
5. Implement contract-first, then tests, then documentation/generated artifacts.
6. Run every packet-local command listed in the packet.
7. Run `fo-review`; apply all findings with `fo-fix` before reporting completion.
8. Commit only session-owned files through `ecosystem.commit`, then run `git status` and `bash scripts/check-clean-trees.sh`.

## Global forbidden shortcuts

- Do not make `serializeKnowledgeFile` return the original source unconditionally; that would silently ignore requested edits.
- Do not claim two-file atomicity from two independent `rename` calls.
- Do not write live before archive when moving entries.
- Do not deduplicate archive entries by title; identity is the structured entry ID.
- Do not infer shared budget identity from a basename or path substring.
- Do not overwrite npm-consumer knowledge during repair.
- Do not empty tracked monorepo knowledge before packing and restore it afterward.
- Do not add `.npmrc` or expose its contents in tests/logs.
- Do not weaken archived RFC acceptance language to match the current code.

## Escalation conditions

Stop the assigned packet and route only the newly discovered delta through `fo-idea` if implementation would require any of the following:

- a new public command or removal/rename of an existing command;
- a new knowledge entry identity scheme;
- a different authority model from the matrix above;
- guaranteed instantaneous all-or-nothing replacement of two files after process/OS crash;
- publication from a new registry or a change to operator-triggered publication policy;
- a DNA invariant change.

Ordinary type additions, additive report fields, async propagation through an existing handler, package-local pack filtering, tests, and restoration of documented behavior do not meet this threshold.

## Completion definition

This implementation set is complete only after packet 05 records all validations as passing, the final review verdict is `approved`, no tracked source knowledge was removed, no accumulated knowledge appears in the npm payload, and every checked tree is clean.
