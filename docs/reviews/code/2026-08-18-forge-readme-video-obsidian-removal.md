# Code Review: Forge README Video/Obsidian Removal

- **Date**: 2026-08-18
- **Diff**: `2a4ec4e1...HEAD` (2 commits)
- **Files**: `packages/forge/README.md`, `packages/forge/README.uk.md`
- **Reviewer**: fo-review skill (automated)

## Summary

Documentation-only change. Removed all mentions of the Video/editframe project type, `@warpgogol/werkstatt-video` package, FFmpeg prerequisites, and the Obsidian Vault project type from both English and Ukrainian READMEs. Added Godot game project type and `@warpgogol/werkstatt-godot` package documentation.

## Mechanical floor

- **markdownlint-cli2**: 0 issues in 2 files. PASS.
- **TypeScript/build checks**: N/A (`.md` files only).

## Axis A — Structural correctness

- **Markdown structure**: PASS. Tables, code blocks, and headings are well-formed.
- **Bilingual consistency**: PASS. Both READMEs are structurally identical — same 4 project types, same 5 packages in engine table, same 4 profiles in stack profiles table, same CLI examples.
- **No orphaned references**: PASS. No remaining mentions of `editframe`, `obsidian`, `ffmpeg`, or `werkstatt-video` in either README (beyond the negative descriptor "no video" / "без відео" in the Governance/library row, which is a legitimate exclusionary description).
- **Duplicated Code**: PASS. No duplication between the two READMEs beyond expected bilingual mirroring.

## Axis B — DNA alignment

No invariants file changes. N/A.

## Axis C — Ecosystem fit

### FAIL — Documentation-code mismatch: profiles still shipped

The README now documents 4 project types and 4 profiles, but `packages/forge/profiles/` still contains 6 profile YAML files:

- `editframe.yaml` (23.8K) — still shipped to npm (`"files": ["profiles/"]` in `package.json`)
- `obsidian-vault.yaml` (2.2K) — still shipped to npm

An agent or user running `forge create --profile editframe` or `forge create --profile obsidian-vault` will succeed — the profiles exist and work — but the README gives no indication they exist. This creates a discoverability gap.

**Evidence**: `packages/forge/profiles/editframe.yaml`, `packages/forge/profiles/obsidian-vault.yaml` exist on disk and are included in the npm `files` array.

### FAIL — README-AGENTS.md inconsistency

`packages/forge/AGENTS.md` still documents editframe extensively:

- Line 111: "Editframe template rules" section
- Lines 117–121: Editframe-specific technical rules (height: 100%, PlaybackController, TypeScript types)
- Line 166: "Shipped profiles: ... `editframe` (video domain — first non-software profile, RFC-0641, React template RFC-0694)"
- Lines 367–368: Test references to `editframe-e2e.test.ts`

An agent following the root `AGENTS.md` instruction to "prefer the closest nested `AGENTS.md`" will read the forge AGENTS.md and find editframe rules, profiles, and test patterns that the README no longer mentions. The two documents are now inconsistent.

### FAIL — werkstatt-video package still exists

`packages/werkstatt-video/` still exists as a package in the monorepo. The README's engine table no longer lists `@warpgogol/werkstatt-video`, but the package is still built, tested, and referenced in `packages/AGENTS.md` (line: "RFC-0778: Werkstatt video plugin — Editframe stack. Implements `werkstatt/plugin@1` with `profileId: "editframe"`").

The user's request mentioned "удалим их упоминания и все идущие с ними зависимости-пакеты" (remove their mentions and all associated dependency packages). The README mentions were removed, but the actual package was not deleted. If the intent was to remove the package itself, that work remains. If the intent was README-only, this is a documentation-code gap to be aware of.

## Axis D — Forward-only discipline

- **No legacy compatibility paths introduced**: PASS. The change is a pure removal from documentation.
- **No dual-schema or fallback readers**: N/A.

## Axis E — Agent clarity

### WARN — Agent discoverability gap

An agent reading the README will not know that `editframe` or `obsidian-vault` profiles exist. If it needs to create a video project or an Obsidian vault project, it will not find the profile in the README. The agent would only discover these profiles by running `forge profile.validate` or by reading the `profiles/` directory directly.

This is mitigated by the fact that `packages/forge/AGENTS.md` still lists `editframe` as a shipped profile (line 166), so an agent that reads AGENTS.md will find it. But the README is the primary entry point for new users and agents.

## Axis F — Removal discipline

### WARN — Removal without investigation of why the artifacts were added

The `editframe` profile was added via RFC-0641 (video domain — first non-software profile) and RFC-0694 (React template). The `obsidian-vault` profile was added via RFC-0808. The README removal does not reference or supersede these RFCs.

If the intent is to deprecate these profiles, the RFCs should be superseded. If the intent is to remove them from the README only (while keeping the code), the documentation-code gap should be acknowledged.

The user's request was explicit: "удалим их упоминания" (remove their mentions). This was a README-only change, not a code removal. The removal is justified by user intent, but the gap between documentation and code is a finding.

## Axis G — Pragmatism

- **Change is minimal and focused**: PASS. Only README files were touched.
- **No over-engineering**: PASS.
- **Commit messages are clear**: PASS. Both commits have descriptive messages.

## Verdict

**2 FAILs, 2 WARNs, rest PASS.**

The core issue is a documentation-code mismatch. The README now claims 4 project types, but Forge ships 6 profiles and the `werkstatt-video` package still exists. The `packages/forge/AGENTS.md` still documents editframe extensively. This creates three gaps:

1. **README vs. shipped profiles** — `editframe.yaml` and `obsidian-vault.yaml` are still in `profiles/` and published to npm.
2. **README vs. AGENTS.md** — AGENTS.md still lists editframe as a shipped profile with detailed technical rules.
3. **README vs. packages** — `@warpgogol/werkstatt-video` package still exists in the monorepo.

**Recommendation**: If the user's intent was to remove these features entirely, a follow-up task should:

1. Delete `packages/forge/profiles/editframe.yaml` and `packages/forge/profiles/obsidian-vault.yaml`
2. Remove editframe-related content from `packages/forge/AGENTS.md`
3. Delete `packages/werkstatt-video/` and remove references from `packages/AGENTS.md`
4. Supersede RFC-0641, RFC-0694, and RFC-0808

If the intent was README-only, the documentation-code gap is accepted but should be tracked.
