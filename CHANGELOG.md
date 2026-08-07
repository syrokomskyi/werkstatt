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
- Expand search.exclude patterns in VS Code settings to improve file search filtering.

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
- Update .vscode/settings.json with enhanced search exclusions.

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
- Remove .vscode/settings.default.json configuration file.

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
- Add triggers field to all fo-skill SKILL.md frontmatters and synchronize changes to corresponding files in .agents and packages/forge, enhancing automation and skill activation metadata.
- Implement validation for the triggers field in the skill frontmatter schema (SKILL-16), updating validators and schema files to enforce new requirements.
- Register SKILL-16 validation logic and tests, including unit and snapshot tests for SKILL.md triggers field validation and proper agents-generate behavior.
- Auto-run forge.agents.generate from forge.create after initialization, improving onboarding workflows and ensuring agents are generated consistently.
- Add behavioral layer generation in agents-generate, introducing a routing table and register for enhanced behavior control (RFC-0548).
- Extend fo-session-retro skill to support Operator routing category, entry expiry, and profile review functionalities (RFC-0548).
- Create minimal forge-shell stack profile for forge.create default, simplifying initial project setup.
- Add unit tests for index-based content reference resolver (RFC-0527 step 6).
- Add content.ref-index.generate command and integrate it into the build-prepare pipeline.
- Introduce new content reference index generation utility module and wire service module template for index-based processing.
- Add JSON-LD team profile endpoints, schema updates, and related validation pipeline steps to support machine-readable team profiles (RFC-0512).
- Introduce participant, profile, AI-agent, and team directory schemas, validation commands, and page synthesis targeting new standardized archetypes (RFC-0508, RFC-0510, RFC-0511, RFC-0509).
- Implement extended claim registries, editorial policy/status validators, and provenance handling for ratgeber content including related commands and surface models (RFC-0502, RFC-0503, RFC-0505).
- Add documentation and test coverage for new profile and content validators across participant, AI-agent, team hub, and ratgeber modules.
- Add surface.hub.validate command for surface hub validation as part of RFC-0490.
- Add pillar block and 'collection' semantic type to depth-0 blueprint for website-local surfaces.

### Changed

- Update AGENTS.md to include session-start pre-flight rule for agent work hygiene.
- Update grilling/learned-principles.md and grilling/qa-log.md to reflect revised knowledge principles and Q&A content.
- Rename 'check-webgogol.ts' to 'check-warpgogol.ts' in packages/os/site-kernel-checks/src/command-tables and diagnostics/rules.
- Update AGENTS.md and README.md to document the Core behavioral layer, forge-shell profile, forge.create command, and Output contract enhancements (RFC-0548).
- Enhance various skills, AGENTS.md, and source files to reflect newly introduced behavioral layer features and operator interaction (RFC-0548), and add IDE recommendations to onboarding processes.
- Update content.reference to use index and support braceless syntax in references validation (RFC-0527 step 4).
- Refactor content reference logic to use a framework-agnostic, index-based resolver for improved flexibility in semantic model and Astro content handlers.
- Refactor and expand archetype model structures for participant profiles, human/AI-agent roles, and ratgeber content blocks to match revised RFC requirements.
- Synchronize Compass documentation, generated manifests, and XML files to document new validation commands and model fields.
- Update function calls, renames, and breadcrumbs for new team, participant, and content archetypes, as well as related baking/render logic.
- Update bakePillarHub for depth-0 pillar specialization to support collections.
- Extend bake helpers and surface expand logic to handle hub and collection structures in alignment with RFC-0490.

### Fixed

- Restore pre-flight git status steps in fo-fix and fo-idea-implement skills to ensure proper git hygiene at session start.
- Register the new fo-memory-sync skill in the forge registry.
- Update all references from 'wgogol' or 'webgogol' to 'warpgogol' throughout packages/os/site-kernel-checks, ui, and related service layers to ensure consistency in package naming and documentation.
- Replace deleted real content with synthetic fixtures in rfc-0483 snapshot test to restore proper test coverage and reliability.
- Fix undefined-value edge case in index-based content reference resolver (RFC-0527 step 6).
- Update content reference implementation to address legacy coupling and ensure consistent reference resolution.
- Correct command names, discriminated union schemas, and validation logic for participant, team hub, and structured data checks to resolve review and RFC validation findings.
- Fix generated comment prefixes and update documentation artifacts for consistency.
- Pass collectionItems through buildPageSemanticModel and Astro page templates to ensure proper ItemList JSON-LD rendering for collection-type pages.

### Removed

- Remove obsolete or duplicate pre-flight git status content in fo-fix and fo-idea-implement skill files.
- Remove outdated entries from grilling/learned-principles.md and grilling/qa-log.md.
- Remove check-webgogol-runner/README.md and wgogol-skills from the repository.
- Remove legacy references from content reference implementation as part of the migration to index-based resolution.
- Remove deprecated or migrated people and legacy profile validation code where replaced by new schema and command implementations.

### Security

- Standardize kernel config and registry files for improved clarity in registry settings.

### Documentation

- Update DOCS to reflect the 'warpgogol' branding, harmonize command reference and manifest files, and ensure storybook and manifest coverage of newly renamed UI components.
- Document new agent behavioral layer concepts and triggers schema in AGENTS.md and skill documentation; mark RFC-0548 as accepted, implemented, and audited with annotations and evidence.
- Document new and updated commands, manifests, validation modules, acceptance criteria verification, and associate evidence across implemented RFCs.
- Audit and enhance RFC documentation to align with implementation and review outcomes.
- Update RFC-0490 documentation to reflect hub validation, collection specialization, and add or amend evidence and acceptance criteria.

## 2026-07-16 — 2026-07-22

### Added

- Add dirty workpiece guards to mission lifecycle commands, ensuring key operations such as abort, close, and materialize honor workpiece state.
- Add test coverage for mission dirty guard behaviors.
- Add type-guards test suite for guarantee-policy entities in the PBP package.
- Add foundational documentation and model files for the Public Business Profile (PBP) specification, including README, entity/field model, compiler validation, migration plans, and decision logs.

### Changed

- Update agent guidance and mission-related templates to explain and document dirty workpiece guard rules.
- Update docs/reviews/pbp-package-review.md and guarantee-policy entity type guard exports.
- Update root documentation, contributing guidelines, onboarding guide, and README to reflect current architecture.

### Fixed

- Fix patch reconciliation and integrate build into validate within mission materialization commands.
- Fix export and type guard implementation for PbpGuaranteeOperator constants in the PBP package.
- Fix typographical and formatting issues in specification markdown files (e.g., README and entity/model documents).

### Removed

- Remove outdated content from contributing and onboarding documentation.

## 2026-07-09 — 2026-07-15

### Added

- Add pnpm-lock.yaml updates to reflect RFC-0389 workspace dependencies and new handoff workspace dependencies.
- Add ecosystem.generated.yaml changes to project new RFC-0389-related workspace dependencies.
- Add readYamlFile helper function to the share/fs module for reading YAML files.
- Add StarMapManifestSubset documentation to AGENTS.md and README.md for the Star Map package.

### Changed

- Update mission-materialize.ts to replace inline stubs with full boilerplate generation for missions and align SITE_LINE token usage with onboarding scaffold pattern.
- Update dedup-helper-lint to use the new readYamlFile helper from share/fs.
- Update documentation formatting and improve descriptions for StarMapManifestSubset in AGENTS.md and README.md.

### Fixed

- Address RFC-0389 review findings in mission-materialize.ts, handling unquoted domain in system.md frontmatter and undefined exitCode in runGeneratedFileSet.
- Remove duplicate logger.success in mission handler scripts and fix staging directory path resolution for Windows and other environments.
- Correct AGENTS.md to reference the new helper.
- Correct documentation for StarMapManifestSubset by updating descriptions and adjusting formatting in AGENTS.md and README.md.

### Removed

- Remove legacy .dev.vars.example from lagebild-sync-worker.

### Documentation

- Regenerate ecosystem.generated.yaml and command-manifest.generated.yaml for RFC-0389 dependencies and commands.
- Update ecosystem.generated.yaml with RFC-0389 workspace dependency changes.
- Document and clarify the StarMapManifestSubset in both AGENTS.md and README.md for enhanced package usability.

## 2026-07-02 — 2026-07-08

### Added

- Add RFC-0362 documenting Werkstatt consistency primitives for locks, idempotency, and atomic state.
- Add RFC-0363 describing release artifact store and retention contract.
- Add RFC-0364 for semantic fingerprint package and hash governance.
- Add installable icon and manifest suite (including maskable and standard icons) for check-webgogol-com, nicaragua-projekt, and webgogol-com apps to enhance installability and PWA support.
- Add humans.txt and update manifest.webmanifest for check-webgogol-com, nicaragua-projekt, and webgogol-com apps to document credits and legal information.
- Add public artifacts such as ai.txt, security.txt, and indexnow.txt for check-webgogol-com, nicaragua-projekt, and webgogol-com to support readiness and search integration.

### Changed

- Update RFC-0361 to replace the executive summary and critical issues analysis with revised sections.
- Update and enhance manifest.webmanifest and _redirects handling for all apps to support new icon files and redirects.
- Update _headers file and template to set appropriate Cache-Control headers for static assets such as png, jpg, jpeg, ico, mp4, webm, and pdf.

### Fixed

- Fix and add missing amendedBy entries in RFC-0007, RFC-0320, RFC-0323, RFC-0355, RFC-0356, RFC-0357, RFC-0358, RFC-0359, RFC-0360, and RFC-0363 to ensure bidirectional amendment integrity.
- Fix and update check-webgogol humans RFC documentation status and metadata.

### Removed

- Remove obsolete GRACE-to-Compass migration verification scripts (_verify-all.ps1, _verify-ts-strict.ps1, _verify-ts.ps1).
- Remove outdated favicon.ico.ts utility files for check-webgogol-com, nicaragua-projekt, and webgogol-com apps for cleanup.

### Security

- Add and update .well-known/security.txt in public folders to provide security contact details for check-webgogol-com, nicaragua-projekt, and webgogol-com.

### Documentation

- Introduce 'rfc-audit' folder with audits for several RFCs related to the Sternsystem bundle contract, mission lifecycle, behavior snapshot gating, fleet propagation, and more.
- Update docs/COMMANDS.md, command-manifest.generated.json, and ecosystem.generated.json to document icon suite and public artifact commands.
- Update and mark RFCs for installable icon suite, public-readiness, and humans.txt status as implemented.

## 2026-06-25 — 2026-07-01

### Added

- Add maintenance debt queues to documentation, generated queue artifacts, and kernel checks command tables and diagnostics rules.
- Introduce new generated JSON files for maintenance debt queues.

### Changed

- Update development, requirements, and verification planning documents with maintenance debt queue features.
- Synchronize RFC-0256 implementation status and related metadata across documentation files.

### Fixed

- Correct and update details in ecosystem and RFC-0256 documentation to reflect implemented status.

### Documentation

- Document newly implemented maintenance debt queue features and update relevant RFC implementation status.

## 2026-06-18 — 2026-06-24

### Added

- Allow authors to override the default video caption flag via page frontmatter in German and Ukrainian home pages.
- Add bottom fade to hero section lead images on the Nicaragua Projekt home pages.
- Add .prettierignore entries for onboarding/, apps/**/public/, apps/**/provenance/, and archetype, open-source license paths to exclude generated and public assets from formatting.
- Add scripts/clean.mjs and a clean script to package.json for workspace artifact cleanup.

### Changed

- Update UI media component to support author override of video caption and enhance caption control logic.
- Update .prettierignore to better exclude generated static, provenance, and icon-related files.

### Fixed

- Add bottom fade to people section spotlight images on German and Ukrainian home pages.
- Reformat scripts/clean.mjs for consistency and maintainability.

### Removed

- Remove duplicate prettier entries from open-source license pages in both German and English variants.

## 2026-06-11 — 2026-06-17

### Added

- Implement default site background for programmatic surface pages in the page handler.

### Changed

- Update background image handling and logic in the page handler for programmatic surface pages.

### Fixed

- Correct language switcher on PSEO pages to link to the sibling page instead of home.

### Removed

- Remove redundant or obsolete background logic from the page handler.

## 2026-06-04 — 2026-06-10

### Added

- Add comprehensive accessibility statement (BFSG/EN 301 549) to webgogol-com barrierefreiheit page and llms index.
- Add responsive-image component manifest.
- Register Ariel and Belinda cosmic names for the responsive-image component.
- Implement provider-agnostic responsive images on Cloudflare runtime via RFC-0152 Image Provider Port.
- Add Cloudflare image-transformations runbook and RFC-0152 Image Provider Port documentation.

### Changed

- Update Cloudflare Pulse URL to project-specific domain in nicaragua-projekt footer labels.
- Rename responsive-image cosmic name from Ariel to Belinda in ontology archetypes and manifest.
- Update section-shell style constraints and content width behaviors.
- Update markdown formatting in RFC-0152 documentation.

### Fixed

- Use formal address in Ukrainian homepage tagline for webgogol-com.
- Restore and align pulse icon positioning in the footer next to the wordmark.
- Ensure Cloudflare runtime image provider defaults to raw origin unless transforms are enabled.

### Removed

- Remove wall-clock timestamp from open-source.md files to ensure idempotent builds.

### Documentation

- Add component manifest contract rules for packages/ui.
- Document section-content width constraint rule for all apps and biomes.
- Expand onboarding guide with Wave 8 deploy step and Cloudflare image-transformations checklist.
- Document RFC-0152 Image Provider Port for humans and agents.

## 2026-05-28 — 2026-06-03

### Added

- Add typographic effects to section headings for German and Ukrainian hero sections on digitales-fundament and notausgang pages.
- Add missing manifest.yaml for effect-host component.

### Changed

- Update digitales-fundament and notausgang page content to include new heading effects in both German and Ukrainian locales.
- Update section-card-grid styles for glass panel and surface effects.

### Fixed

- Correct formatting to support heading effects in markdown for both de and uk hero sections.
- Correct spelling of 'cardTitle' property in section-card-grid manifest.

### Removed

- Remove glass-panel and related styles, types, and schema from glass-panel and associated references in ontology, UI, and shared schemas.

### Documentation

- Update section-framework token contract documentation and AGENTS.md after glass-panel removal and section effect migration.

## 2026-05-21 — 2026-05-27

### Added

- Add detailed documentation on section framework rules and onboarding scaffold integration to respective RFC markdown files.
- Add new RFCs defining and documenting section framework motion, site background, orchestrator rules, onboarding integration, parallax image settings, section versioning, and framework validators.

### Changed

- Update RFC documentation to reflect acceptance and enforcement of RFC-0116 and RFC-0117 section validator and biome deriver integration.

### Fixed

- Correct and streamline RFC documentation for motion, onboarding, parallax, versioning, and validator rules by reducing redundant or outdated content and improving clarity.

### Removed

- Remove legacy, transparent, verticalFade, and animated flags from 8 sections in the English home page to standardize section configuration and avoid redundancy.

## 2026-05-14 — 2026-05-20

### Added

- Add generated.marker.validate command to validate pipeline using generated markers.
- Implement conditional site field generation logic in onboarding config regeneration.
- Add German open-source content file.
- Introduce serialization of route registry to JSON for static build language switching.
- Add documentation for supporting localized page slugs and route resolution.

### Changed

- Unify generated-file marker protocol in gitignore templates, public file generators, and related onboarding/checks/codegen modules.
- Simplify formatting and logic in onboarding config regeneration.
- Convert image imports to eager loading and dynamically import scheduler/animation modules in shared scripts and UI sections.
- Inline language switching logic and remove route registry serialization in relevant Astro and utility files.
- Simplify the resolveSectionAnchor props type from explicit interface to any.
- Replace hardcoded section IDs with dynamic resolveSectionAnchor across UI and shared components.
- Use resolveAnchorFragment for dynamic section IDs in approach and transparency sections.
- Standardize anchor values to language-neutral anchorIds in German/English navigation files and system documentation.
- Update AGENTS.md files to reflect RFC-0047 content surface migration and RFC-0048 route registry.
- Update AGENTS.md references from blocks[].use to blocks[].type and system.yaml to system.md.
- Remove anchor span and list formatting from donation/contact German and English prose content.
- Remove donation account details section from English donation/contact content.
- Update import paths for LayoutContent and StructuredData components in layout Astro file.
- Extract route registry serialization to a dedicated utility module.
- Consolidate and update .gitignore patterns for generated registry and open-source license files.

### Fixed

- Improve consistency and enforcement of generated-file governance markers across related templates and source files, and fix small template edge cases.
- Add fallback empty string for page.route in star mapping in passport emit module.
- Add type assertions for manifest parameter compatibility in passport module.

### Removed

- Remove custom implementations now replaced by unified generated-file marker protocol in onboarding/config regeneration.
- Remove obsolete uni.registry.json from repository root.
- Remove obsolete migration markdown files from documentation and app directories.
- Remove static route registry file from public directory.
- Remove generated open-source license markdown file.
- Remove icons migration summary document.

### Security

- Harmonize generated-file marker protocol to support project-specific governance, minimizing risk of accidental file overwrites.

### Documentation

- Document generated-file marker protocol, its enforcement, and new validation commands in AGENTS.md and module guides.
- Update and restructure agent rules documentation files.

## 2026-05-07 — 2026-05-13

### Added

- Add glass mode with semi-transparent background to impact section on the homepage.

### Changed

- Update homepage content pages, impact section, and global styles to support glass and transparent backgrounds.

### Fixed

- Fix issue with impact-section manifest and types to support new glass mode.

## 2026-04-30 — 2026-05-06

### Added

- Make image extension optional in the Footer Promo component and automatically append '.webp' format support.

### Changed

- Refactor Footer Promo component type definitions to allow omission of image extension and improve asset handling.

### Fixed

- Update German Footer Promo content to reflect new image extension logic.

## 2026-04-23 — 2026-04-29

### Added

- Add section-noise.svg texture to public assets for Nicaragua Projekt.
- Add business layer content and configuration for Germany (de) to Nicaragua Projekt.
- Add type definitions for UI component-content types in @webgogol/ui.
- Add functional and manifest schema enhancements for site-kernel-checks pipeline, schema drift, and content types.
- Add localized open-source prose page to Nicaragua Projekt content.

### Changed

- Refactor growth and passport module dependencies to make the passport signing key optional and streamline client logic.
- Refactor and migrate component-content TypeScript types to @webgogol/ui package, updating related layout and semantic page files.
- Reformat UI manifest for team section for consistency.

### Fixed

- Correct static path generation for untranslated pages in Nicaragua Projekt per RFC-0008.
- Fix .gitignore path for generated open-source prose components.
- Resolve build errors and various minor bugs across Nicaragua Projekt components, UI, and kernel modules.

### Removed

- Delete orphaned page and dispatcher schemas from Nicaragua Projekt content and utility files as part of RFC-0033 cleanup.
- Remove legacy per-page open-source stylesheets, migrating styles to global.css.
- Remove legacy component-content type definitions and dispatcher schemas from Nicaragua Projekt component and layout schemas.
- Remove orphaned .manifest.yaml files from content pages and pages/[lang] in Nicaragua Projekt.
- Remove hard adapter dependencies from growth and passport configurations.
- Remove layout.astro default parameter in Nicaragua Projekt scripts.

### Documentation

- Document business layer wiring and usage patterns in AGENTS.md and onboarding README.
- Document acceptance and implementation status for RFC-0033, RFC-0034, and related architectural changes in RFC markdown files.

## 2026-04-16 — 2026-04-22

### Added

- Add RFC-0020 document for layer-specific file suffix contracts and suffix-aware OS validation.

### Changed

- Rename German schema files in content.config.ts to match route-stem alignment for wir-ueber-uns, projekte, and spenden-kontakt.

### Fixed

- Fix type exports in content.config.ts to reference newly renamed schema files.

### Removed

- Remove English content files about, projects, and donation-contact, and update usages to use German equivalents.

## 2026-04-09 — 2026-04-15

### Added

- Add my-main project (formerly my-webgogol-3) to the apps directory following monorepo conventions, including pages, assets, configuration, icons, and initial content.
- Add English versions of AGN, privacy policy, legal notice, and withdrawal policy content pages to the nicaragua-projekt app for improved localization and compliance.

### Changed

- Update my-main package.json and wrangler.jsonc configuration for monorepo integration.
- Update contact information and wording in German privacy policy, legal notice, terms and conditions, and withdrawal policy pages to ensure accuracy and clarity.

### Fixed

- Fix incorrect references and ensure kernel tooling commands and pipelines are included for my-main app.
- Correct file naming inconsistencies by renaming 'legal.md' to 'impressum.md' in the English content pages for legal notice compliance.

### Removed

- Remove deprecated or duplicate documentation and page contract files from original locations to prevent conflicts.
- Remove unused English legal content page 'legal.md' to prevent redundancy and maintain a clear file structure.

### Security

- Register required integrity modules and kernel/module files to support content validation and integrity for my-main.
- Ensure the English privacy policy content is available to enhance user data protection transparency for international visitors.

### Documentation

- Add AGENTS.md to my-main and update kernel config, service module, and check module documentation to guide required app conventions and onboarding.
- Document the addition of new English content pages for legal and privacy information in the changelog runtime module.
