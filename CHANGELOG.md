# Changelog

All notable changes to the `werkstatt` project are documented here.

## 2026-07-30 — 2026-08-05

### Added
- Add SKILL-09 instructions to PREFERENCES.md for six ef-* skills and fo-session-retro.
- Add editframe profile with React template and migrate former editframe-html assets to use it.
- Vendor six Editframe domain skills into Forge and add their documentation.
- Add and update tests for Editframe profile migration and associated skills.
- Add support for actionable context checkpoint directives to pipeline conventions skills for both .agents and packages/forge copies.
- Add SKILL guidance for 'fo-idea-i-just-want-to-see-the-result' skill templates in both .agents and packages/forge directories.
- Add setTimeout stub testing rule to AGENTS.md in site-kernel-handoff.
- Add semantic binding keys to forge.yaml for skills configuration.
- Add dependency direction rule, Axiom gate severity rule, JSON.parse error handling rule, barrel export rule, numeric flag parsing rule, createRequire pnpm rule, RFC TypeScript contract review discipline rule, and session retro rules to AGENTS.md files.
- Add formalization details and new tests to the RFC-0613 markdown twin provenance documentation.
- Add ownership.sync.validate command implementation and unit tests to site-kernel modules.
- Add two-pass bitrate-capped MP4 encoding to video variants and update related property-based tests.

### Changed
- Update fo-session-retro/SKILL.md instructions and adjust SKILL-01/17 references.
- Update ef-* skills for React support and synchronize documentation to reflect these changes.
- Rename editframe-html to editframe and migrate profile/schema/test files as needed.
- Update 'fo-idea-i-just-want-to-see-the-result' skill templates in .agents and packages/forge for increased clarity and pipeline integration.
- Update site-kernel-handoff AGENTS.md with new setTimeout stub testing rule.
- Update domain-neutral skill language in SKILL.md files for fo-doc-audit, fo-idea-implement, and forge-bootstrap.
- Update skill language in packages/forge/skills/fo/fo-doc-audit/SKILL.md, packages/forge/skills/fo/fo-idea-implement/SKILL.md, and packages/forge/skills/meta/forge-bootstrap/SKILL.md to use semantic binding keys.
- Update architecture-dna.md, command-manifest.generated.yaml, and COMMANDS.md with new Axiom and kernel discipline guidelines and sync changes.
- Update RFC-0613 markdown twin provenance documentation to improve clarity and expand coverage.
- Update stale validate and generated validate modules for ownership sync integration.
- Refactor shared encoder args in video variants generator for improved maintainability.

### Fixed
- Correct and standardize skill instructions across 6 ef-* skills and fo-session-retro to align with PREFERENCES.md guidance.
- Fix YAML escaping issues and synchronize related test expectations.
- Correct and enhance skill templates to align with new context management conventions across .agents/skills and packages/forge/skills directories.
- Fix fo-review findings in leitstand-0649-freshness.test.ts to remove dead vi.useRealTimers() and correct CHANGE_SUMMARY text.
- Correct skill binding and language issues in fo-doc-audit and fo-idea-implement SKILL.md files.
- Remove stale favicon-maskable.svg references from command-tables and test names for icons.
- Correct issues in RFC-0613 documentation regarding null lastModified handling and YAML null parsing in markdown twin provenance.
- Fix placeholder expansion and null lastModified acceptance in generated file validators, and improve bordbuch conflict auto-resolution.
- Relocate property-based tests for video variants generator to src/tests/ directory and fix pass-log cleanup.

### Removed
- Remove obsolete editframe-html template file.
- Remove unnecessary use of vi.useRealTimers() from leitstand-0649-freshness.test.ts as part of fo-review findings remediation.
- Remove redundant logger.success from leitstand.dev-deploy.
- Remove dead code from axiom-report.ts and src/mission-check-converter.ts.
- Remove outdated or redundant sections from the RFC-0613 markdown twin provenance documentation.

### Documentation
- Update AGENTS.md and skill documentation for Editframe profile rename and new skills.
- Document favicon SVG source override in site-composition.md; update site-composition and AGENTS.md files with latest rules and conventions.
- Clarify implementation requirements and acceptance criteria in RFC-0613 documentation, including test documentation updates.
- Update bordbuch auto-resolution RFC, ownership.sync.validate RFC and audit documentation to reflect latest acceptance and implementation.

## 2026-07-23 — 2026-07-29

### Added
- Add pre-flight git status check step to fo-fix and fo-idea-implement skill files to enforce session-start hygiene.
- Add fo-memory-sync skill and associate documentation for knowledge synchronization workflows.
- Add new check-fixture-lint.baseline.generated.yaml and file-size-lint.baseline.generated.yaml for validation tracking in packages/os/site-kernel-checks.
- Add two new baseline kernel flag files to packages/os/site-kernel-checks/src.
- Add section-body/cards/section-card-grid and comparison/section-comparison support for testing and storybook in packages/ui.

### Changed
- Update AGENTS.md to include session-start pre-flight rule for agent work hygiene.
- Update grilling/learned-principles.md and grilling/qa-log.md to reflect revised knowledge principles and Q&A content.
- Rename 'check-webgogol.ts' to 'check-warpgogol.ts' in packages/os/site-kernel-checks/src/command-tables and diagnostics/rules.

### Fixed
- Restore pre-flight git status steps in fo-fix and fo-idea-implement skills to ensure proper git hygiene at session start.
- Register the new fo-memory-sync skill in the forge registry.
- Update all references from 'wgogol' or 'webgogol' to 'warpgogol' throughout packages/os/site-kernel-checks, ui, and related service layers to ensure consistency in package naming and documentation.

### Removed
- Remove obsolete or duplicate pre-flight git status content in fo-fix and fo-idea-implement skill files.
- Remove outdated entries from grilling/learned-principles.md and grilling/qa-log.md.
- Remove check-webgogol-runner/README.md and wgogol-skills from the repository.

### Security
- Standardize kernel config and registry files for improved clarity in registry settings.

### Documentation
- Update DOCS to reflect the 'warpgogol' branding, harmonize command reference and manifest files, and ensure storybook and manifest coverage of newly renamed UI components.
