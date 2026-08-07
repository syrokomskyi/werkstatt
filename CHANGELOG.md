# Changelog

All notable changes to the `werkstatt` project are documented here.

## 2026-07-30 — 2026-08-05

### Added
- Document SKILL-09 PREFERENCES.md instruction in 6 ef-* skills and SKILL-01/17 in fo-session-retro across corresponding SKILL.md files.
- Vendor Editframe domain skills into core and forge skill directories, including ef-brand-video-generator, ef-composition, ef-dev-server, ef-editor-gui, ef-motion-design, and ef-webhooks with corresponding SKILL.md documentation.
- Add configurable axiom methodologies with per-methodology gate to methodologies-config, axiom-report, methodologies-validate, mission-check, pipelines/packages-check and related tests.
- Add RFC-0653 implementation with pipeline build caching and build skip in leitstand module and print PDF component.
- Add unit tests for RFC-0653 build-skip cache and print.pdf.copy.
- Add YAML backtick scanning guidance to the forge agent documentation.
- Add new regression test for conditional ownership entry coverage in generated.stale.validate.
- Add documentation convention for shared utilities to AGENTS.md.
- Add support for the ownership.sync.validate command, including implementation, integration into build and author check pipelines, updates to the command table, and new unit tests.
- Add fo-session-save skill portability support and tests in Forge config and onboarding scripts.

### Changed
- Update source field and skill count in forge and AGENTS.md files to reflect new PREFERENCES requirements.
- Rename editframe-html profile and templates to editframe with a React template and update YAML files accordingly.
- Update Editframe profile-related tests and golden fixtures to reflect the profile rename and YAML escape fixes.
- Update skill documentation for ef-composition-review, ef-onboard, and ef-render-verify to align with React integration and improve skill clarity.
- Update profile schema and related test cases for attribute-pattern handling and YAML quoting rules.
- Update AGENTS.md and AGENTS.md for site-kernel-handoff to document changes and clarify behavior.
- Update command-tables/infra-contracts.ts to support new methodologies functionality.
- Update leitstand-commands.ts for methodologies and gate changes.
- Update command tables, print-pdf logic, and pipeline build-post integration to support pipeline cache and build skip for leitstand.dev-deploy.
- Update platform version log and package.json to reflect guidance addition.
- Update wrapMaskableSvg implementation and shared diagnostic type in icons.ts for improved error logging and coverage in icon handling.
- Update AGENTS.md with RFC-CMD-02 manifest staleness rule and new documentation details.
- Update generated-stale-validate.ts to support ownership.sync.validate command with validation logic.
- Update build-prepare.ts and sites-check-author.ts to invoke the new ownership.sync.validate command as part of pipeline execution.
- Update SKILL.md files for fo-session-save to include sessionSave binding information.

### Fixed
- Correct information and editorial consistency in multiple ef-* and fo-* SKILL.md files, addressing redundancy in PREFERENCES instructions.
- Correct YAML escaping and update test suites to handle revised YAML schemas.
- Fix AGENTS.md entries and various test files for consistency with new methodologies logic.
- Correct command-table logic for codegen and print to align with build skip changes.
- Correct a platform version log entry to reflect YAML backtick quotation fixes.
- Register build-identity.json in GENERATOR_OWNERSHIP_MAP and fix conditional flag semantics in generated.stale.validate.
- Correct documentation and reword/expand certain AGENTS.md conventions.
- Correct stale validation command implementation and test coverage.
- Correct bindings for fo-session-save skills to ensure proper session save functionality across agents and Forge.

### Removed
- Remove deprecated editframe-html-templates/composition.html template as part of migration to React-based templates.
- Remove deprecated entries from COMMANDS.md.
- 
- Remove stale grilling QA log and fix-patterns entries from grilling and wg-mission-complete skills.
- Remove outdated and replaced AGENTS.md rules to align with current conventions.
- Remove redundant lines in session save skill definitions to streamline bindings.

### Security
- 
- Include security review for AGENTS.md shared code recommendations.

### Documentation
- Update AGENTS.md and skill documentation for profile and skill name changes, YAML field quoting, and React template integration.
- Stamp RFC-0653 as implemented in the RFC documentation, update .gitignore, and revise AGENTS.md to describe the build caching and skip capabilities.
- Expand forge AGENTS.md with new YAML guidance.
- Clarify and refine AGENTS.md rules for package-specific conventions.
