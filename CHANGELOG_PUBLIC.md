# Changelog

All notable client-facing changes are documented here.

## Platform Updates 2026-07-30 — 2026-08-05

This update delivers productivity and reliability improvements, especially for creative workflows using editframe templates and the Forge CLI. Clients benefit from streamlined command usage, improved onboarding, more resilient deployment operations, and enhanced documentation—in particular for integrating and building frontend solutions with European compliance considerations.

### Added

- Progress and diagnostic logging have been added to project creation using the Forge CLI, giving users clearer real-time feedback during onboarding and installation steps.
- Introduced a set of domain-specific video composition and onboarding skills for Editframe, enabling advanced video workflow automation and improved onboarding experiences.
- Added React-based templates for Editframe profiles, allowing more flexible and modern video project configurations.
- Implemented a build-time check for duplicate section headings within content pages, making documentation and site navigation clearer (EU-wide).
- Added command options for advanced cache management in the Axiom diagnostic tool, with new flags for cache directory and disabling cache use—providing greater transparency and control over diagnostic data (EU-wide).
- Introduced a new protocol for verifying RFC (feature) implementation as part of session-end workflows, making feature validation transparent and trackable (EU-wide).
- Added profile-driven lifecycle commands and validation routines to the platform, automating environment and asset checks across project stages for improved deployment consistency and onboarding (EU-wide).
- Implemented profile-based validation for release artifacts and deterministic builds, allowing for more reliable and consistent software releases (EU-wide).
- Integrated new rule sets and documentation in agent guides to clarify configuration, compliance, and process conventions for teams (EU-wide).
- Introduced build cache for repeated site deployments, allowing much faster deploys when there are no source file changes. This reduces waiting times for updates and staging/test cycles (EU-wide).
- Added a post-build check to automatically validate the structural integrity of all generated HTML files, helping to prevent visual or semantic issues before release (EU-wide).
- Implemented multi-layered knowledge management (hot/warm/cold) for content and automated compaction/distillation commands, reducing technical debt and improving data maintainability for content-rich deployments (EU-wide).
- New command for ensuring Playwright Chromium is available in build pipelines, improving cross-browser consistency in automated tests (EU-wide).
- Added support for .env example documentation for configuring S3-compatible storage, making evidence storage easier to set up for compliance archiving (EU-wide).
- Section numbering is now included in UI section shells, providing unique ARIA IDs for assistive technology and easier navigation for screen readers (EU-wide).
- Video sections now include captions, and notices for translated content are marked with status roles to improve accessibility for all users (EU-wide).
- Introduced automatic commit functionality after each operator request, reducing manual steps and improving audit traceability (EU-wide).
- Added a real-time validation checklist with visual feedback to the send-message section, enabling users to verify message requirements at a glance before submission.
- Implemented a command for validating generated file ownership, enhancing the detection of inconsistencies in file registries and supporting compliance workflows (EU-wide).
- Automated detection and validation for outdated or orphaned generated files, improving the reliability and consistency of the project’s generated content.
- New automated validation commands to ensure timestamps within generated files are deterministic, supporting reproducibility (EU-wide).
- Introduction of automated passport key management, including generation and verification, to meet compliance standards for build and deployment processes (EU-wide).
- Automated generation of nested documentation files (AGENTS.md) across workspace directories, simplifying developer onboarding and improving project transparency.
- Introduced two-pass bitrate-capped MP4 encoding for videos, improving playback quality with more efficient file sizes (EU-wide).
- Added pre-commit content validators to the publishing workflow, helping ensure that only validated content is committed, reducing the risk of errors and improving compliance (EU-wide).
- Implemented validation gates in deployment workflows to further safeguard quality and prevent incomplete deployments (EU-wide).

### Improved

- The editframe template in Forge now provides a working Vite project by default, simplifying frontend starter projects.
- Editframe templates and related agents have been synced with the latest canonical content, ensuring access to up-to-date features and documentation (EU-wide).
- Forge CLI commands have been reworked to use unqualified names, removing the redundant 'forge.' prefix; this simplifies usage and reduces the risk of command name collisions for all users.
- Forge documentation and skill definitions have been updated to clarify usage of preferences and quick start instructions, making initial setup easier for new users.
- Enhanced pipeline execution with dependency graphs, scheduler integration, and concurrency controls to accelerate build and validation steps, reducing overall processing times (EU-wide).
- Strengthened the mission.check tool by adding per-host concurrency controls and pipeline fast-paths, offering better performance and scalability for large sites or multi-environment checks.
- Improved the clarity and accuracy of agent documentation, including skill counts, configuration details, and profile rules, making it easier to maintain compliance and understand system behavior.
- Upgraded onboarding routines for mandatory tooling (RTK installation now required during onboarding), and made the bootstrap command idempotent, reducing setup pain for new projects (EU-wide).
- Enhanced command registration, schema definitions, and asset management for profile-based deployment, improving automation and project reproducibility (EU-wide).
- Clarified and added many platform rules in documentation, including environment variable handling, CLI flag conventions, evidence management, and agent command block standards, ensuring consistent compliance and knowledge transfer (EU-wide).
- Expanded artifact caching and handling in the deployment pipeline based on real-world usage reviews, covering more cache cases and edge scenarios for even faster and more predictable builds (EU-wide).
- Enhanced file-based agent memory layer and cross-skill knowledge sharing, leading to better synchronisation, less manual intervention, and smarter automation for distributed content teams (EU-wide).
- Optimized HTML and asset fingerprinting for more reliable build outputs and cache busting, helping browsers and CDNs always show the correct, latest content (EU-wide).
- Accessibility improvements were made in the pillar hub section by splitting catalog and adaptation headings, making navigation clearer for screen readers (EU-wide).
- Faster detection of development channels for automated crawling, leading to faster site checks and improved feedback time (EU-wide).
- Revised reporting for accessibility audits to better distinguish between violations and incomplete areas, providing more actionable insights (EU-wide).
- Documentation updates on deployment channels, CI reliability patterns, and S3-compatible storage configuration, giving teams clear operational guidance.
- Brand color contrast has been increased in material palettes to meet WCAG accessibility guidelines, supporting users with visual impairments (EU-wide).
- Background color inheritance has been applied to multiple UI elements, ensuring consistent color contrast and improving compliance with accessibility testing tools (EU-wide).
- Multiple accessibility improvements in tables and translation notices, such as tabindex updates and translation status roles, further enhance usability for keyboard and screen reader users.
- Favicon behavior now prefers SVG sources with a reliable fallback and improved error handling, ensuring optimal icon display across devices (EU-wide).
- Integrated post-deployment CDN cache purging, ensuring users always see the latest updates immediately after deployments, reducing the likelihood of stale data being served (EU-wide).
- Enhanced deployment processes with automatic retry and backoff for Cloudflare deployments, decreasing failure risk due to transient network/API errors—resulting in more reliable releases (EU-wide).
- Optimized handling of generated files and timestamp validation to minimize build inconsistencies and improve reproducibility (EU-wide).
- Refined user interface in the send-message section, replacing checklist borders with visually clearer Lord Icon indicators for a modern look and better accessibility.
- Enhanced deterministic generation of preview images to ensure that builds are consistent and reproducible across environments.
- Improved validation logic for visibility and geo-location rules, resulting in more accurate content targeting for European regions.
- Expanded checks to automatically resolve conflicts in specific documentation files (Bordbuch), streamlining the publishing process.
- Enhanced UI in open-source component tables by normalizing vertical spacing, centering the arrow indicator, and collapsing tables by default for improved readability.
- Adjusted deployment metadata cards and favicon icon color palette for better visual consistency and accessibility.
- Added compact density spacing in ownership and trust strip sections, creating a more modern, space-efficient look.
- Ensured all skill report templates systematically include aiLanguage translation for improved accessibility and compliance in multilingual contexts (EU-wide).

### Fixed

- Multiple bug fixes have been made to the editframe React bootstrap template and associated YAML profiles, addressing issues in layout, child element rendering, and test coverage. This results in smoother project scaffolding and more predictable UI behavior (EU-wide).
- The Forge CLI now reliably uses the correct file URL formats and has improved handling on Windows systems, ensuring smooth cross-platform operation.
- Suppression warning instructions have been standardized across several skills and documentation, including clarified acceptance criteria, to ensure better maintainability and integration of compliance rules (EU-wide).
- Resolved issues with video player asset loading and duplicate section IDs in frontend components, ensuring correct media playback and consistent section navigation.
- Corrected YAML syntax and escape issues in profile configurations, preventing errors during automated processing and compliance validation.
- Fixed trash bin behavior so that only user-initiated (LLM-directed) deletions are sent to trash, while internal system deletions no longer pollute the user trash, keeping file recovery workflows accurate (EU-wide).
- Addressed various test sync and validation errors across onboarding and composition skills, improving confidence in automated onboarding and video processing.
- Resolved issues in validation and environment-check routines, including accurate detection of invalid states and false positive errors during onboarding and mission close (EU-wide).
- Fixed anchor link scrolling in the web UI, restoring reliable navigation for users (EU-wide).
- Corrected baseline validation for skills, significantly reducing false positives and improving code and process validation accuracy (EU-wide).
- Addressed several review findings across asset management, lifecycle, and onboarding, resulting in more robust error handling and workflow compliance (EU-wide).
- Resolved minor issues in robots.txt enforcement, section ID generation, and test failures, ensuring that privacy preferences and content navigation work consistently across site environments (EU-wide).
- Addressed bugs in content reference detection, release directory handling, and cache state file generation to ensure clean deployments and reduce manual troubleshooting for web managers (EU-wide).
- Corrected heading order, table accessibility (tabindex), and label usage in generated HTML reports for audits, resulting in better compliance with accessibility standards (EU-wide).
- Resolved an issue with git command parameters in commit operations, reducing the risk of failed deployments in automated workflows.
- Clarified messages and severity levels in infrastructure diagnostics, ensuring more precise issues reporting and error handling.
- Resolved an issue where edge seams appeared on video posters, resulting in a cleaner appearance for embedded videos.
- Addressed accessibility issues by ensuring color contrast and adding missing ARIA roles, improving the experience for users with disabilities.
- Several compatibility fixes for the site deployment and kernel checks to better handle browser automation, clean up temporary evidence files, and manage dependencies, contributing to more reliable and transparent deployments.
- Fixed conditional ownership and maskable icon logic, reducing errors during icon generation and display in various deployment scenarios.
- Resolved several issues in file generation, cache busting, and deployment logging, leading to more deterministic builds, improved error reporting, and consistent deployments (EU-wide).
- Corrected auto-resolution of document conflicts, ensuring content merges and deletions are handled as expected with fewer manual interventions (EU-wide).
- Resolved issues in placeholder expansion for validators, ensuring null or missing last-modified fields are handled safely and automatically correcting documentation conflicts.
- Fixed handling of manifest rollbacks to only process missing files, avoiding unintended data alterations (DE).
- Corrected scope of certain automation routines to avoid impacting unrelated documentation files or project areas.
- Patched various small issues in test coverage and configuration, resulting in more robust developer experience and platform validation.
- Removed the 'Version' column from the open-source component table for a cleaner view.
- Resolved wildcard matching issues in behavior snapshot routes, which ensures more accurate redirects and routing behavior.
- Fixed alignment issues in open-source registry section UI details and handled display of long deployment codes for improved legibility.
- Addressed issues in redirect route handling to guarantee correct processing of special cases, improving user navigation reliability.
- Updated the session save skill and associated scripts to improve compatibility and portability.

### Security & Compliance

- Skills and AGENT definitions have been updated to support clearer implementation of organizational preferences, which helps in maintaining documentation discipline and compliance readiness, with particular importance for regulated sectors in the EU.
- Enhanced diagnostic suppression and validation workflows, including clearer documentation for rules, edge cases, and profile pattern checks, supporting regulatory and audit readiness (EU-wide).
- Removed indirect secrets file handling in favor of convention-based environment variable management for improved transparency and compliance in deployment (EU-wide).
- Updated .env.example and documentation to clarify handling of sensitive credentials such as R2 evidence, ensuring best practices for data protection in line with GDPR/DSGVO requirements (EU-wide).
- Added automated validation and code review steps for integrity of content and data layers, increasing confidence that releases meet quality and reliability standards required by EU businesses.
- Introduced new rules and documentation for evidence lifecycle management, including archiving and retention practices, supporting legal and regulatory needs such as GDPR (EU-wide).
- Documented and implemented conventions around the use of the 'main' branch in repositories, streamlining auditability and meeting EU DevOps best practices.
- Deployment and site-check automation now strips restrictive Content Security Policy (CSP) headers on test runs to allow accessibility auditing injects, supporting legal accessibility compliance checks relevant for the EU (EU-wide).
- Improvements to mission check diagnostics and reliability harden the validation of deployments, providing better transparency and traceability in line with enterprise and regulatory expectations.
- Expanded automated validation and drift detection tooling, helping ensure regulatory file and registry accuracy across updates (EU-wide).
- Strengthened command validation flows to comply with European data and documentation integrity standards (EU-wide).
- Reinforced audit routines for automatic file checking to further support GDPR/DSGVO and open-source compliance.
- Enforced aiLanguage translation across all skill report templates to ensure accessibility and alignment with legal/regulatory guidance on inclusivity (EU-wide).

### Integrations

- Scaffolding and bootstrap flows for editframe templates have been enhanced to ensure compatibility with key European frontend workflows and automated test suites (EU-wide).
- Expanded and clarified integration with Axiom diagnostics, including fine-grained cache controls and verification of suppressed findings, providing more customized reporting and compliance tooling (EU-wide).
- Improved integration routines for Axiom monitoring and reporting, including enhanced boundary contracts and resilience for deployment pipelines, which contribute to more stable audit trails and compliance (EU-wide).
- Upgraded dependency packages across all platform modules to include recent security and functionality patches (EU-wide).
- Implemented evidence synchronization and fetch commands using S3-compatible (R2) storage solutions, enabling secure archiving and recovery of compliance-related data (EU-wide).
- Kernel and publishing automation now automatically installs required browser binaries and fully aligns browser automation versions across the platform, increasing speed, reliability, and lowering onboarding friction for teams deploying in European regions (EU-wide).
- Extended automation and audit support for Cloudflare CDN workflows, delivering faster content delivery and smoother deployments for EU-hosted sites.
- Updated geo-location data provider to '@tansuasici/country-state-city' for enhanced European locale support (EU-wide).
- Restored pre-flight git status check step in the canonical source update skill, increasing reliability when updating source repositories.

## Platform Updates 2026-07-23 — 2026-07-29

This release delivers improvements to diagnostics, validation, and workflow automation, enhancing both reliability and ease of use for content and deployment management. Updates focus on providing clearer diagnostic feedback, streamlined build and release processes, improved automation in mission operations, and automatic handling of merge conflicts, making systems more robust and user-friendly. The update also introduces improvements to the onboarding experience, project creation, and skill validation, making it more accessible and user-friendly. Several behavioral enhancements ensure a smoother project start, while fixes and additional metadata fields improve reliability, transparency, and automation. These changes ensure more transparent operations and help prevent manual errors in daily project work.

### Added

- Introduced 'bordbuch.repair' command, enabling the restoration of the Bordbuch hash chain and inserting missing mission-open entries, which simplifies recovery of corrupted or incomplete project histories.
- Added 'nextSteps' guidance to mission validation and archive commands, providing users with actionable suggestions immediately after command execution to improve workflow clarity.
- Implemented structured diagnostics for build failures during mission validation, offering developers more precise feedback so that errors are easier to understand and fix.
- Provided automatic commit of workspace side effects for key project lifecycle commands (such as open, close, abort, materialize, migrate), reducing manual steps and improving project consistency.
- Enriched content diagnostic rules to explicitly detect missing links and mirroring issues, enhancing content quality control.
- Added a new 'referrer' field to contact and messaging forms, allowing projects to track how users found the site, enhancing attribution and analytics (EU-wide).
- Introduced new commands and tooling for validating and migrating computed formula expressions within content references, helping to ensure content data quality and reducing manual verification (EU-wide).
- Enabled transfer of git-ignored files during onboarding migrations, ensuring all relevant assets are preserved even if not tracked in version control.
- Introduced initial version of the platform with modular site kernel, content management, analytics, integration, UI components, and deployment automation packages for streamlined web operations (EU-wide).
- Added GDPR-ready legal page templates (privacy, terms, imprint) and compliance-oriented documentation to help ensure regulatory conformity for EU clients.
- Included regional and country-specific settings, data subjects, and payment/adaptation templates to support localisation and regulatory requirements (EU-wide, DE).
- Launched a comprehensive open-source UI component library and icons, enabling clients to present a tailored, modern, and accessible digital experience.
- Introduced packaged connectors for Stripe and Supabase CRM, aligning with typical European payment and data management needs.
- Released analytics adapters supporting Matomo and consent-based integrations, providing GDPR-aligned tracking and marketing analytics (EU-wide).
- Deployed built-in observability with privacy-conscious logging and metrics gathering, along with deployment scripts optimised for EU-based hosting scenarios.
- Published initial documentation and onboarding materials for both technical users and business operators, streamlining adoption and knowledge transfer.
- Released self-contained, ready-to-run Docker-based service runners, making local development and cloud/on-premise deployments straightforward.
- Introduced new minimal stack profile 'forge-shell' as the default for new projects, making initial project setup faster and easier.
- New 'triggers' metadata field is now included for all skills, providing better transparency on how and when automated actions are initiated—benefitting automation and auditability (EU-wide).
- NEXT_STEPS.md guidance is automatically created for new projects, offering clear instructions for next actions tailored to different starting scenarios (greenfield vs. transplant).
- Operator routing category, entry expiry, and profile review features have been added to fo-session-retro, enabling more effective operator support and timely interaction handling.
- Introduced session documentation domain with save, archive, validate, and list commands, making it easier to manage project documentation throughout its lifecycle.
- Added 'compass annotate' skill for clear content review and annotation, supporting full lifecycle operations and streamlined kernel cleanup.
- Integrated portable skill registry and skill pack discovery, allowing projects to reuse or manage standard skill sets more efficiently.
- Added 'mission-complete' and 'mission-reconcile' skills to formalize project closure processes and next actions, ensuring handover compliance.
- Developed new onboarding skills to support Sternsystem-specific onboarding workflows (DE/EU).
- Introduced support for session save commands and directory configuration, allowing flexible storage of documentation sessions.
- Added ability to track skill invocations for increased transparency and auditability.
- Introduced new validation commands and pipelines for ensuring the quality of content before publishing, helping maintain high standards for site content throughout the platform (EU-wide).
- Structured input fields for the contact form are now rendered and validated, allowing separate capture of email and phone data for more reliable and compliant data collection (EU-wide).
- Added support for locale-aware cosmic pages so that critical site pages like passport and star map now display translated titles and descriptions where available, enhancing the experience for international visitors.
- Implemented new video manifest schemas with AV1 format support for improved video compression and delivery, benefiting visitors with faster load times and reduced bandwidth usage.
- Added skill documentation and new skill features, such as site scan and session-retro actions, to power agency workflows (EU-wide).
- Introduced machine-readable team and participant profiles, providing structured data endpoints and standardized JSON-LD for individuals and teams, which improves interoperability with search engines and external platforms (EU-wide).
- Added new page archetypes: AI-agent and human profiles, supporting detailed responsibility, authority, and consent capture—these offer greater clarity and auditability for organizational documentation (EU-wide).
- Created a full-featured editorial hub for articles (Ratgeber), with 12-section layouts, dedicated policy pages, changelog/toc/article-header UI components, and a structured directory for participant management (DE).
- Implemented extended claim records and registry for articles, capturing structured editorial and evidence-based statements, supporting transparent fact-checking and compliance (DE).
- Introduced 'dossier' blocks for industry and service pages, enabling richer and more structured information for each sector (EU-wide).
- Implemented specialized content collection for city-level (depth-4) and service-level (depth-5) pages, improving local relevance of displayed content (DE, EU-wide).
- Added new validation commands and quality reports for duplicate content, doorway risk, and industry/service validation, ensuring higher quality and trustworthiness of published information (EU-wide).

### Improved

- Reworked the production build and release workflow to always perform a full build for validated releases and prevent publishing if the output has not changed, increasing reliability for release deliveries (EU-wide).
- Enhanced Cloudflare Workers deployment by updating archive handling to tar.gz format, enforcing adapter limits, and exporting more helpers for integration robustness.
- Excluded redirected or retired routes from content behavior snapshots, ensuring reports accurately reflect only live routes and simplifying content audits.
- Enabled three-phase build pipeline for critical commands, aligning build results, validation, and deployment steps for more reliable and predictable outcomes.
- Automatically resolves specific conflicting changes (delete-modify) in Bordbuch files during mission reconciliation, reducing manual intervention and lowering the risk of merge errors.
- Contact forms have been reverted to a simplified single-textarea format for user messages, streamlining the submission process and reducing complexity for site visitors (EU-wide).
- The pipeline for working with project artifacts has been made more reliable by switching to a clone-based materialization approach, reducing risks of configuration drift or untracked file loss during content and code updates (EU-wide).
- Markdown-rendered headings now automatically receive IDs, making it easier to link to specific sections in public-facing content (EU-wide).
- Added a new 'eyebrow' label/tag option to the markdown section schema for visually enriched section headers and better content differentiation.
- Unified structure, naming conventions, and contract-driven templates for all packages and modules, enhancing long-term maintainability and ease of cross-package integrations.
- Enhanced agent skill catalogues and onboarding routines, making automation, platform setup, and skill-based customisation more intuitive for operators.
- Forge Bootstrap onboarding flow has been fully redesigned to better support both new (greenfield) and imported (transplant) projects, reducing onboarding friction and clarifying key choices.
- Behavioral layer enhancements in registration and onboarding now provide proactive guidance, always present the next step, and support automatic commit of completed actions—leading to a more guided and efficient experience for users.
- The agent behavioral layer was expanded to include capability showcase and tailored operator recommendations to ensure new users receive meaningful, actionable feedback.
- Forge now auto-runs 'forge.agents.generate' after project initialization, ensuring that necessary agent files are always up to date and reducing manual steps.
- Behavioral layer generation in agents-generate now includes an intent-based routing table and register, improving skill coverage and future automation possibilities.
- Upgraded ffmpeg video variant generator with faster presets and optional AV1 support, providing higher quality video delivery and reduced processing times (EU-wide).
- Extended build pipelines with portable image provider defaults, simplifying deployment of portable assets.
- Refined skill validation and diagnostics, adding new rules for completeness and compliance checking.
- Enhanced coverage for external identifiers and 'sameAs' projections in legal and business schemas, boosting Linked Data compatibility.
- Updated command output contracts and documentation for more self-explanatory, traceable system usage.
- Reworked content reference resolution to a more flexible and framework-agnostic approach, supporting easier integration and future-proofing content delivery.
- Pre-materialize content quality gate processes are now integrated across the mission pipeline for automated early validation of content quality issues (EU-wide).
- Section manifest schemas and people-section properties updated to reflect missing or corrected configuration items, ensuring administrators and editors see accurate options when managing site sections.
- Better language handling in redirect logic, now ensuring correct language suffixes for redirected URLs in non-default locales (EU-wide).
- Enhanced editorial validation by wiring automated checks for article sections, provenance, claim structure, and data consistency throughout editorial and team modules to reduce manual errors and improve data quality.
- Breadcrumb navigation and parent-child linking on profile pages have been overhauled for easier navigation and greater clarity, especially for team and participant directories (EU-wide).
- Updated surface metadata handling, including stricter prevention against media metadata leakage and explicit type policies per surface and depth, improving user privacy and search indexing in line with EU best practices and GDPR requirements.
- Enhanced structured data policies to uniformly apply across all content layers, supporting better consistency for SEO and automated content aggregation (EU-wide).
- Streamlined semantic models and blueprints to correctly support industry and service page types, making site structures clearer and more maintainable (EU-wide).
- Expanded cross-linking of service dossier and industry dossier content, enabling more intuitive navigation for end users (EU-wide).

### Fixed

- Corrected preflight checks and snapshot validation for Cloudflare Workers deployments, ensuring successful builds and reducing false deployment errors.
- Fixed duplicate logging and refined protocol detection in several handlers for cleaner logs and more accurate system messaging.
- Resolved misreported or double-read redirect file diagnostics, which helps avoid confusion when working with content redirects.
- Updated error messages to no longer reference hardcoded internal paths, improving clarity in error outputs for end users.
- Numerous fixes were applied to resolve minor content validation errors, type generation mismatches, and UI inconsistencies in profile blocks, forms, and markdown processing, resulting in more consistent display and improved reliability (EU-wide).
- Corrected project dependencies to ensure all necessary modules are available during validation and onboarding steps.
- Resolved issues with route lookups for team and profile pages, improving site navigation (EU-wide).
- Resolved language and legal markup inconsistencies in page templates and onboarding materials, ensuring default deployments meet European legal standards.
- Resolved issues with project creation and upgrade workflows in various onboarding scripts, ensuring that profiles, paths, and version handling work reliably from any directory.
- Addressed silent skipping of skills and improved messaging when skills are missing or configuration files are improperly placed.
- Multiple test coverage and reliability fixes across content source adapters and registration flows, resulting in better long-term stability.
- Corrected file key and language fallback mechanisms in content resolution to ensure accurate multilingual content display (EU-wide).
- Fixed permission checks to prevent mission abort if project state is inconsistent or there are unreconciled changes.
- Patched media metadata handling to ensure site URLs are correctly formatted and edge video formats are skipped.
- Addressed potential browser build problems for external validators by limiting Node.js dependencies.
- Resolved whitespace errors, broken tests, and improved resilience in project reconciliation and mission closure routines.
- Resolved an issue where non-visual properties could cause false positive results in visibility rules, which now accurately reflect section or user block visibility (EU-wide).
- Corrected city and industry lookups and validation mode for the doorway-risk feature, improving accuracy in surfacing potential content risks.
- Addressed schema and client/server alignment for the contact form, so required fields display and process consistently, reducing submission and integration errors (EU-wide).
- Improved the handling of retired surface redirects to properly prepend language prefixes for localized pages, ensuring navigation reliability for international users.
- Fixed an issue where certain developer properties could incorrectly impact validation and schema checks, providing more predictable and robust validation processes.
- Resolved inaccuracies in generated types and command validator descriptions, which improves internal consistency and supports smoother future upgrades.
- Corrected several command names and acceptance criteria to ensure all platform documentation and validation checks pass as intended.
- Corrected blueprint depth and validation logic on service blueprints, ensuring all new and existing service pages render accurately (EU-wide).
- Aligned extraction and reporting of dossier fields, fixing possible inconsistencies in page output (EU-wide).
- Resolved issues with redirect logic for legacy URLs, leading to fewer errors when users access sites through outdated links (EU-wide).

### Security & Compliance

- Added explicit 410 Gone 'tombstone' responses in middleware for permanently retired routes (EU-wide), supporting GDPR and content removal requirements and making route removals more transparent for users and search engines.
- Environment variable names and configuration references have been updated to use a consistent and correct naming convention, improving security clarity for analytics, observability, and deployment across EU-based infrastructure (EU-wide).
- Ensured all core modules and templates provide privacy notice defaults and GDPR/DSGVO checklists, supporting legally-compliant site operations from first deployment (EU-wide).
- Skill validation logic was tightened to ensure that internal platform references and reserved names are rejected during validation, aligning with internal governance and keeping skills registry compliant for auditability (EU-wide).
- Added and enforced mandatory version bumps and pre-commit checks for ecosystem commands, minimizing risks of unnoticed breaking changes and supporting auditable change history.
- Improved regulatory documentation structure for onboarding materials, including GDPR, accessibility, and legal notices (DE, EU-wide).
- By explicitly capturing structured contact form data (separating email and phone), the platform streamlines compliance with EU data collection regulations and facilitates more transparent record-keeping (GDPR/EU-wide).
- Strengthened GDPR/DSGVO compliance by adding deeper validation and documentation around data consent, participant schema, and metadata policies across the editorial and team surfaces (EU-wide).
- Implemented automated YAML configuration validation and quoting policy enforcement to prevent accidental data and configuration errors across deployments. This supports traceability and regulatory compliance for data governance (EU-wide).

### Integrations

- Updated dependencies for @astrojs and Cloudflare Workers adapters (EU-wide), providing compatibility with the latest EU cloud hosting platforms and ensuring ongoing vendor support.
- Playwright Chromium is now automatically installed during site materialization, ensuring required tooling for visual/tests is available without manual steps.
- Integrated European-friendly analytics (Matomo) and payment solutions (Stripe), enabling clients to use locally preferred providers (EU-wide).
- Added support for Cloudflare-based asset delivery and observability-stack deployments in EU infrastructure, making traffic data and uptime monitoring privacy-safe and compliant with EU data residency requirements.
- The Forge CLI and key project workflows now ensure correct loading and synchronization of skill metadata and profiles, improving compatibility with integrated automated toolchains and plugin systems.
- Extended platform command handlers to support registering and executing custom skill packs, increasing adaptability to team-specific workflows.
- Video encoding pipeline now emits AV1 format as the preferred source, aligning with the latest browser support and providing broad compatibility without additional configuration (EU-wide).
- Standardized on schema.org and JSON-LD formats for all profiles and articles, simplifying integrations with search engines and publishing platforms (EU-wide).
- Added semantic models for industry-related services and expanded JSON-LD exports, improving compatibility with third-party services and search engines (EU-wide).

## Platform Updates 2026-07-16 — 2026-07-22

This period saw major improvements to site content provenance, navigation structure, and business model handling, emphasizing transparency and legal compliance (notably for EU/DE requirements). Legacy technical debt was addressed, and several UI and validation enhancements were made to promote correctness and auditability across the platform.

### Added

- Introduced a provenance registry for material credits, allowing clearer disclosure of asset origins, authorship (including organizations and AI-generated content), and copyright status. This helps clients demonstrate compliance with content provenance and intellectual property requirements (EU-wide).
- Added an industry navigation hub feature, enabling easier browser-based exploration of industry-specific site areas. This supports efficient access to relevant information for site visitors.
- Launched a deployment-specific open-source Software Bill of Materials (SBOM) registry section, improving supply chain transparency for open-source dependencies and supporting legal/regulatory best practices (EU-wide).
- Implemented new checks for business model lifecycle changes: deprecated B2C withdrawal routes have been removed for webgogol-com, aligning with updated business focus and regulatory expectations (DE).
- Introduced a pluggable FAQ content module, allowing clients to manage frequently asked questions more flexibly and recover content in case of accidental deletion.
- Added a new command for verifying platform consistency and versioning, ensuring platforms operate under the correct software version for improved reliability (EU-wide).
- Released new commands to automate Bordbuch generation and status reporting, making compliance and documentation processes more transparent (DE).
- Integrated unit and golden fixture tests for critical platform pipelines and validation rules, supporting higher quality across deployments.
- Enabled external repository mirroring with a new synchronization command, simplifying backup and migration processes (EU-wide).
- Introduced the Public Business Profile (PBP) system, providing detailed specifications and structured entities for business, product, claim, identity, policies, and migration scenarios. This helps clients manage, validate, and migrate business data in line with regulatory and business requirements (EU-wide).
- Implemented a comprehensive set of RFCs for PBP, covering support for legal identity, brand/person relations, localization, policies, product variants, bundles, catalog entries, pricing models, service levels, guarantees, taxation, exit management, fulfillment, and data retention contracts. This enables clients to model more complex business arrangements, support compliance, and add flexibility in business operations (EU-wide).
- Added new adapters and schema mappings including for Shopify PIM and schema.org, allowing for better system interoperability and integration options with third-party product and CRM systems (EU-wide).
- Launched advanced processing features for incremental/bulk updates, canonical serialization, AI projections/answers, and support for invoice, quote, contract, and digital signatures. These additions facilitate efficient data processing, enhanced reporting, and digital contract workflows (EU-wide).

### Improved

- Enhanced validation rules for credits and business profile content, including status, usage basis, copyright, and correct pathing—resulting in more accurate, auditable disclosures for site content (EU-wide).
- Refined semantic site and business profile schemas for better handling of legacy data and to support more flexible URL and presentation formats.
- Optimized content validation workflows, making site page reviews more systematic and ensuring thorough cross-content dependency checks and compliance verification.
- Migrated all business content and logic from the legacy package to the new @gogol/pbp package, unifying content management for better maintainability and legal compliance.
- Enhanced mission workflow commands to prevent reuse of aborted mission IDs and improved handling of environment files, increasing data integrity and avoiding accidental state persistence (EU-wide).
- Expanded acceptance criteria and evidence annotation requirements across governance documentation, improving transparency and auditability (EU-wide).
- Optimized build and reconcile workflows to ignore irrelevant files and run preparatory checks before validation, reducing build-time errors and increasing reliability.
- Updated and extended the master PBP specification manifest to incorporate all newly materialized entity types, contract projections, and migration scenarios, ensuring alignment with current standards and ongoing regulatory developments (EU-wide).
- Applied audit-driven enhancements and comprehensive reviewer feedback to PBP-related specifications and entities, increasing clarity, consistency, and documentation quality to keep all models and processes up to date with legal, business, and technical best practices relevant for European clients.

### Fixed

- Resolved issues with preview images and label mapping in the material credits system, reducing the risk of broken asset links or inaccurate attributions.
- Corrected migration of legacy business content to the new business profile system, ensuring all references and paths are consistent and eliminating deprecated content collections.
- Fixed UI validation to surface schema violations for page properties, helping clients quickly identify and address integration or configuration issues.
- Resolved validation and registration issues in Bordbuch and FAQ modules, addressing incorrect module handling and strengthening command flag management (DE).
- Fully removed unused and outdated legacy references and files to prevent confusion and improve maintainability (EU-wide).
- Corrected cache and file handling in mission workflows to avoid sync problems and stale lock states, ensuring smooth operation and minimizing downtime.
- Addressed review feedback for recent platform migrations by refining command documentation, correcting lifecycle issues, and improving content and personnel references.
- Corrected and unified design sections, resolved duplicate identifiers, and applied numerous audit/review-driven fixes across the PBP RFC/specification documents to address inconsistencies and fully meet V-25 compliance for reviewer attribution, which supports robust governance and risk management (EU-wide).

### Security & Compliance

- Expanded asset and credits systems to support accurate author/source tracking, AI-generated content, and detailed provenance, providing an audit trail that supports GDPR and copyright compliance (EU-wide).
- B2C consumer withdrawal routes have been removed from webgogol-com, reducing exposure to regulatory obligations that no longer apply to the business model (DE).
- Introduced supply chain transparency improvements through SBOM registry enhancements, making open-source dependency tracking easier for legal review (EU-wide).
- Strengthened governance around RFC evidence and acceptance criteria, enforcing more complete documentation and stricter quality gates (EU-wide).
- Ensured obsolete or superseded compliance documentation is archived or marked as such to prevent usage of outdated practices.
- Implemented and documented policies on data retention, deletion, legal boundaries, ownership, portability, and guarantees, supporting GDPR and other EU legal requirements for business data handling and consumer protection (EU-wide).

### Integrations

- Deployment-specific SBOM registry UI section now integrates with the open-source page generator, ensuring that SBOM data stays in sync with site deployments and can be readily exported for due diligence or audits.
- Improved integration of external analytics and synchronization with regional hosting requirements, supporting EU data residency and GDPR compliance (EU-wide).
- Enhanced integration paths for external product information management (PIM) systems and CRM projections, making it easier to connect to platforms such as Shopify and synchronize rich product and business data between systems (EU-wide).

## Platform Updates 2026-07-09 — 2026-07-15

This period brings significant stability, compliance, and process consistency improvements for platform users. Redundant applications and content were retired to streamline experiences and reduce maintenance effort. Several updates focus on stricter configuration validation, better handling of environment files, and bug fixes in workflows. These changes contribute to a more reliable, compliant, and maintainable platform for clients in Europe.

### Added

- Introduced strict validation for environment configuration files (.env.example) and documented formatting rules. This reduces the risk of deployment errors due to misconfigured environments. (EU-wide)
- Exported new template helpers for configuration and onboarding steps, supporting more flexible project scaffolding. (EU-wide)
- Introduced universal detection and lookup of generated files, increasing clarity and traceability of automated content and making audits easier for stakeholders (EU-wide).
- Added a new command for YAML contract file linting, providing an automated check to help maintain data quality and reduce configuration errors (EU-wide).
- Implemented a whitelist for YAML contract checks, giving clients transparent control over allowable schema entries (EU-wide).
- Added validation for the projection of organization-level services, supporting richer business catalog extraction (DE/EU-wide).
- Introduced Fontsource CSS imports for all web applications, providing a more robust and privacy-conscious typography solution (EU-wide).
- Added automated font import generation and contract validation to ensure consistent font usage and easier maintenance.
- Implemented environment audit command allowing for quick assessment of required tooling on local machines, supporting smoother cross-platform deployments.

### Improved

- Converted project, service, and deployment configuration files from JSON to YAML format for consistency and easier validation, aligning with European compliance and transparency preferences. (EU-wide)
- Enhanced reporting capabilities: command execution reports now list modified files, making it easier for clients to trace changes and outputs in automated workflows. (EU-wide)
- Migrated all generated project artifacts and configurations from JSON to YAML, streamlining file handling, improving human readability, and facilitating future compliance audits (EU-wide).
- Enhanced generated-file edit protections to apply across all file types, reducing accidental data loss or undesired modifications (EU-wide).
- Unified semantic block projection for pages, eliminating special-casing of home pages and ensuring more consistent content structure across all sites.
- Refined Matomo analytics adapter architecture and extended its validation, supporting robust, region-compliant integrations (EU).
- Migrated font management to standardized Fontsource CSS imports, removing previous ad-hoc copying and reducing the risk of missing or outdated fonts (EU-wide).
- Enhanced chat widget integration to support deeper configuration and improved delivery, facilitating a more seamless user messaging experience.
- Extended stylesheets and validators to support italic and specialty font weights, supporting richer typography options for branding needs.
- Refined document rendering and type validation in key platform modules, resulting in more accurate and reliable display of content.

### Fixed

- Corrected issues in handling mission workflows, including duplicate log entries, unhandled error cases, and seamless processing for onboarding and staging operations. These fixes reduce confusion and improve the reliability of deployment pipelines. (EU-wide)
- Addressed several post-review findings related to tenant management and site commands to prevent stale references and resolve specific validation errors, improving overall platform robustness. (EU-wide)
- Adjusted SQL scripts for Supabase-based CRM systems to use distinct quoting, preventing edge-case sync failures and supporting better database compatibility. (EU-wide)
- Fixed restoration and consistency of public API files and improved archetype registry handling, ensuring all references and registries match the live system for transparent technical evidence (EU-wide).
- Resolved issues with command and service projections, providing more reliable business and technical check reports.
- Corrected language policy enforcement, skill file documentation, and review step requirements for contributors, increasing reliability for multinational and multilingual teams (EU).
- Resolved minor issues in chat and starmap integrations, including type inconsistencies and assertion errors, improving reliability of these features.
- Corrected data handling in content and entity modules, ensuring stricter type checks and cleaner code, which reduces the risk of runtime errors for end users.
- Addressed validator cache and deprecated comment issues in content handling logic, improving stability for dynamic content sites.

### Security & Compliance

- Unified environment file handling and enforced stricter deployment preflight checks. This simplification and standardization ensure all environments comply with latest operational and legal (e.g., GDPR/DSGVO) best practices. (EU-wide)
- Improved generated file ownership and compliance logic, helping to separate human-edited and system-generated files and reducing accidental exposure of sensitive or non-compliant content (GDPR/EU).
- Updated open-source license disclosures and added new dependencies to maintain transparency and compliance with EU legal obligations (DE).

### Integrations

- Implemented tenant lifecycle commands with persistent storage in Supabase, enhancing the reliability and traceability of customer/project management operations. (EU-wide)
- Improved Stripe and Supabase CRM adapter reliability via multiple fixes, ensuring smoother payment and CRM data flows (EU).
- Upgraded font and chat integrations across all web applications, streamlining vendor interoperability and simplifying maintenance for diverse European deployments.

## Platform Updates 2026-07-02 — 2026-07-08

This update focuses on improved generated content hygiene and clarity, expanded claim support for business content (DE/UK), compliance improvements, and error message refinements. Clients will benefit from reduced manual editing effort for generated files, cleaner page frontmatter for easier audits, and more accurate legal/claim handling for content published in Germany and Nicaragua.

### Added

- Introduced and documented a standardized advisory header in generated files to clarify automatic content origins and prevent accidental manual editing (EU-wide).
- Added support and content for CKL (comparative commercial claims) sidecars to business and legal content for webgogol-com (DE/UK) and nicaragua-projekt (DE), making claim audit trails more transparent per compliance requirements.
- Added a full set of installable icons and manifest metadata to all public web apps, enabling better compatibility when saving the site to mobile devices’ home screens (EU-wide).
- Introduced detailed 'humans.txt' files to list project contributors and credits in a human-readable format on public sites, increasing transparency and recognition (EU-wide).
- Published '.well-known/security.txt' and 'ai.txt' files to reinforce compliance with security disclosure and AI policy requirements, in line with EU best practices.
- New 'indexnow.txt' endpoints published to all sites for faster search engine indexing.

### Improved

- All generated Markdown content now cleanly separates machine-inserted headers from YAML frontmatter, improving file clarity for audits and legal records (EU-wide).
- Adjusted output to reduce duplicate content and ensure proper registration of modules for change-impact and hygiene checks, enhancing transparency for future changes (EU-wide).
- Updated HTTP headers to enforce optimized browser caching for images, videos, icons, and PDFs across all apps, resulting in faster repeat visits and reduced bandwidth use (EU-wide).

### Fixed

- Shortened meta descriptions on webgogol-com's legal pages (UK) to fit recommended search engine length for better SEO.
- Resolved errors and warnings related to page-block and markdown validators to properly handle HTML comment markers and multiline content, reducing false positives in content linting.
- Updated translated content for clarity, e.g., replaced 'günstig' with legally approved alternatives like 'preiswert' in DE language guides.
- Added missing content fields (such as names and slugs) in business person profiles (UK) for webgogol-com to ensure correct display and indexing.
- Removed invalid or obsolete status URLs and added required fields in content and claim files to ensure proper validation and eligibility for audit.
- Fixed logic to correctly write environment schema exports in generated content files, ensuring technical accuracy in distributed files.
- Adjusted handling of business claim logic to exclude certain sidecar claims from repeatable checks, aligning with business process requirements.
- Corrected and completed metadata and implementation status in contributor and technical documentation to ensure all public documents accurately reflect current capabilities.

### Security & Compliance

- Improved handling and tracking of claim and legal data in content files, especially for German-language (DE) and Nicaragua content, supporting transparency for regulatory audits.
- Strengthened public readiness and compliance by ensuring essential discovery files ('security.txt', 'ai.txt', 'humans.txt') are up-to-date and included in all major deployments (EU-wide).

### Integrations

- Added and extended Compass (formerly GRACE) audit ledger documentation and content, enhancing automated project compliance reporting and auditability.

## Platform Updates 2026-06-25 — 2026-07-01

During this period, the platform introduced significant enhancements to geo-location content organization and diagnostics, making navigation clearer and site health more transparent for clients. Additional improvements were made to asset resolution, data quality enforcement, and open-source compliance, while several bugs were addressed to ensure smoother end-user experiences. These changes collectively increase the reliability, accessibility, and manageability of sites across German and European contexts.

### Added

- Introduced hierarchical demand record structure and precise geo-location slugs for service and city pages, improving SEO, navigation, and regional content management (DE, EU-wide).
- Launched a dedicated geo metadata package (@gogol/geo) and enriched demand records with accurate country, region, and city data for better location-based targeting (DE, EU-wide).
- Provided fallback images and skyline artwork for city-level pages, ensuring visually consistent experiences even where primary assets are missing (DE).
- Added new demand records and surface sections for Friseur and Elektriker services in pilot cities, covering both German and Ukrainian content (DE, UK).
- Published documentation updates and new agent guides for geo and content packages to clarify best practices for clients expanding regionally.

### Improved

- Optimized navigation by collapsing geo breadcrumb paths with only one available option, making site traversal simpler for end-users (DE, EU-wide).
- Refined asset search and resolution logic so city, service, and industry pages reliably display the correct visuals (DE).
- Enhanced diagnostics and structured validation for surface data and demand hierarchy, reducing the risk of outdated or duplicate entries (DE, EU-wide).
- Increased open-source attribution transparency by updating license documentation and including new dependencies.
- Clarified language and asset linking within content directories, streamlining multi-language maintenance and improving consistency across localizations (DE, UK).

### Fixed

- Resolved slug and URL normalization issues, ensuring that PSEO and sitemap entries use consistent, service-driven addresses across the site (DE).
- Eliminated duplicate and obsolete demand records, removing confusion from navigation and search results (DE).
- Fixed navigation bugs where city names or geo levels displayed incorrectly, resulting in accurate breadcrumbs and card behaviors for surface and industry listings (DE, EU-wide).
- Addressed asset lookup bugs that previously caused missing or mismatched images and content on geo and service pages.

### Security & Compliance

- Reviewed and updated open-source license attributions to ensure transparency and compliance with third-party requirements (EU-wide).

### Integrations

- Updated key package dependencies (including Astro, Wrangler, and AI/slug utilities) across the platform for broader compatibility, improved security, and future-proofing (EU-wide).

## Platform Updates 2026-06-18 — 2026-06-24

This update introduces several new features and improvements aimed at enhancing media and content presentation, accessibility, and maintainability for European clients. Key highlights include advanced support and controls for credit attributions, improved video playback across devices, enriched content clarity, and expanded UI options for custom section styling. These changes provide clients in the EU greater flexibility, better brand consistency, and improved compliance with digital content standards.

### Added

- Ability to add and display detailed credits for all visual assets, including images and videos, on credits pages and directly in sections such as hero and people (EU-wide). This supports transparency and compliance with intellectual property requirements.
- New visual-control system for site builds, enabling automated checks for content quality, SEO, and accessibility during development (EU-wide).
- Site-wide material credits and provenance disclosures are now shown, helping end-users view the origin and rights holders of assets (EU-wide).
- Structured claim ledgers and freshness tracking for business and legal content, making it easy to visualize and validate content provenance and updates (EU-wide).
- Bottom fade-out effect added to hero section images for a smoother visual transition (apps/nicaragua-projekt, EU-wide).
- Brand color palette updates to support bolder design tokens for stronger card titles and improved color contrast (DE, EU-wide).
- Blocklist for malicious scanners (e.g., nikto, nmap, sqlmap) and allowlist for friendly AI crawlers added in robots.txt, increasing website security and crawl compliance (EU-wide).
- Support for clickable person names in spotlight cards where profiles are available (DE, UK).
- Support for HTML section header in the people block to increase accountability and transparency (DE, UK).
- Expanded German city coverage for key services, featuring newly added bespoke city pages and skyline images for Baden-Württemberg cities (DE), making local content more relevant and visually appealing.
- Introduced video transcoding, new video section, and standardized media handling across the platform, enabling seamless, high-quality video playback for home promos and rich media experiences (EU-wide).
- Animated live team portraits and media 'LivePhoto' support on profile and About pages, enhancing user engagement and showcasing team authenticity (DE, EN, UK).
- Added AI founder and team biography pages to navigation and system, increasing transparency and depth about leadership (DE, UK).
- Integrated more comprehensive FAQ entries and bios for team members on multilingual About and contact pages (EN, DE, UK), helping users find relevant information and build trust.

### Improved

- Flexible video caption controls on webgogol-com pages, allowing authors to override default caption settings for each page (DE, UK).
- Visual and structural enhancements to credits pages, including deduplication of entries, improved formatting, and LinkedIn attributions (DE, UK).
- Video playback now prioritizes iOS compatibility by skipping WebM playback if no MP4 fallback is available and overlaying living-photo clips on the site background for seamless display (EU-wide).
- Adaptive and more accessible navigation for desktop, with improved overflow logic ensuring all navigation links are visible even on small screens (DE, UK).
- Markdown and content updates ensure proper localization of credit descriptors, rights holder labels, and guarantee labels for clarity and legal accuracy (DE, UK).
- Refined visual styles and color contrasts in sections and card grids for improved readability (EU-wide).
- Refined teaser section for founder/people with better background gradients and header structures (DE, UK).
- Enriched local service pages (DE, UK) with bespoke AI-generated narratives and localized images for industries like Elektriker (Electrician) and Friseur (Hairdresser), delivering more targeted information and better search visibility.
- Upgraded hero and promo video sections for improved visual quality and aspect ratio consistency, ensuring more professional presentation for main site entry points.
- Enhanced content structure with improved semantic extraction and FAQ support in Markdown, allowing clearer separation and display of information (EU-wide).
- Optimized media and video formats with better support and fallbacks for modern browsers and iOS, providing more reliable playback for all users.
- Navigation menus in both German and Ukrainian have been updated with streamlined entries for faster access to new content.

### Fixed

- Corrected rendering and root-relative navigation links for breadcrumbs to support multi-level trails as per updated standards (EU-wide).
- Resolved excessive bolding in list items on Ukrainian language service pages for electricians and hairdressers, resulting in more balanced and readable content (DE, UK).
- FAQ/service structured data emitted as required on home pages to improve SEO and meet search engine regulations (EU-wide).
- Deduplication of material-credit nodes in JSON-LD metadata, reducing potential SEO issues (EU-wide).
- Skipped caption requirement warnings for silent videos, reducing false alerts during media validation (EU-wide).
- Ensured consistent aspect ratios for lead images in hero/portrait slots, maintaining layout integrity across different devices.
- Corrected anchor link localization in the hero section to respect each page's language, improving usability for multilingual audiences.
- Removed deprecated and city-inconsistent content to avoid confusion and keep city/industry lists up-to-date (DE).

### Security & Compliance

- Expanded and clarified robots.txt rules, including blocklists and allowlists, enhancing the site’s protection from unwanted crawlers and improving search engine compliance (EU-wide).
- Unified visibility policy for content attributions and credit disclosures to support GDPR-compliant presentation of rights information (EU-wide).
- Donation forms and privacy policy content updated for accuracy, which supports ongoing GDPR compliance (DE, EN).

### Integrations

- New site handoff bundle and a version-aware absorb workflow to support seamless transitions between project environments, reducing risk of outdated or mismatched configuration (EU-wide).
- Integrated Open Source licensing transparency for video and media playback components, making third-party technology disclosures easily accessible to clients (EU-wide).

## Platform Updates 2026-06-11 — 2026-06-17

This update introduces major improvements for client-facing people/team pages, enhanced multi-language support (Ukrainian, German, English) across site structure and navigation, and increased programmatic control over site page rendering and design. Usability, accessibility, and SEO have been refined for European and multi-regional clients, including new navigation, better section hierarchy, and per-member profile enhancements.

### Added

- Introduced a new People module with canonical person records and dedicated profile pages, offering structured and discoverable team member profiles (DE, UK).
- Enabled per-member profile pages with gated access, providing richer, more detailed team profiles for site visitors (DE, UK).
- Emitted structured JSON-LD data (ProfilePage) on each member’s profile, improving search engine visibility and compliance with semantic web standards.
- Added landing pages for surface sections to the main and footer navigation in both German and English, making it easier for users to find key areas (DE, UK).
- Added localized navigation items and labels for team and section pages, increasing accessibility for German and UK audiences.
- Enabled background images on top-level Programmatic SEO (PSEO) axis pages for a more visually engaging presentation (DE).
- Added per-language (Ukrainian, German, English) slugs and alternates for surface and editorial pages, enabling fully localized URLs and improved multilingual SEO.
- Rendered explicit linked cards (with title, description, and link) for teasers on axis and surface overview pages, enhancing user navigation and engagement.

### Improved

- Redesigned the People section as a unified, data-driven block with hierarchical typographic improvements for section names and quotes, creating clearer structure and easier reading.
- Enhanced hero sections to show section numbers contextually and allow background images at the shell layer, contributing to better organization and stronger visual branding.
- Improved language switching on PSEO pages: the language selector now links directly to the corresponding sibling page instead of the homepage, making multilingual browsing more user-friendly.
- Adjusted contrast settings for light biomes in PSEO hero descriptions to ensure clear, accessible text for all users.

### Fixed

- Resolved issues with localized titles for lazily generated surface pages, ensuring proper language display across all supported regions.
- Corrected navigation and data paths for team/founder profiles, making certain that profile links, governance, and search data are consistent and accurate.

### Security & Compliance

- Emitted structured ProfilePage JSON-LD on member profile pages, supporting SEO best practices and compliance requirements (EU-wide).

### Integrations

- Added build and task support for integration-adapter-stripe and integration-adapter-supabase-crm, enhancing compatibility with EU payment processing and customer management systems.

## Platform Updates 2026-06-04 — 2026-06-10

This update introduces several improvements focused on accessibility, integration, legal compliance, and performance. Notable highlights include new accessibility statements, more robust integration and delivery options with EU guarantees, enhanced legal translation and privacy policies, and multiple user interface refinements. These changes aim to provide a more secure, user-friendly, and compliant digital experience for clients in the European context.

### Added

- A comprehensive accessibility statement has been published, covering BFSG and EN 301 549 requirements to support barrier-free access for users (DE/EU-wide).
- Introduced a consent-gated, privacy-sensitive chat widget that only loads with user approval, supporting modern GDPR/DSGVO standards (EU-wide).
- Added support for EU-resident message delivery using Upstash QStash and Redis, ensuring that all interactive features (like chat) comply with EU data residency laws.
- Implemented per-page Markdown exports for AI agents, making all main content available in a format suitable for automated processing and accessibility.
- New option to hide the chat widget on contact pages to reduce distraction for users completing forms (DE, UK, webgogol-com).
- Optional inclusion of a lead image in the homepage 'hero' section to allow greater visual customisation (DE, UK, webgogol-com).
- Introduced a responsive image component supporting provider-agnostic delivery via Cloudflare runtime, enabling optimized images for faster load times across all regions.
- Registered both 'Ariel' and 'Belinda' as cosmic names for the responsive-image component, helping organize and reference image variants in a consistent way.

### Improved

- Standardized and clarified the presentation of legal translation notices within main content, making legal disclaimers more visible and user-friendly (DE/UK).
- Enhanced the hero section on the homepage and other major pages with a consistent white shadow effect for headings, improving contrast and readability (DE/UK, webgogol-com).
- Refined breadcrumb, layout, and spacing rules for global navigation and page headers, offering a cleaner and more intuitive structure on all pages.
- Self-hosted all web fonts rather than relying on external (Google Fonts) sources, improving page load speed and eliminating cross-border data transfer concerns (EU-wide).
- Enhanced the site's image delivery to use Cloudflare at runtime by default unless transformations are enabled, ensuring images are fetched directly from the original source in a safe-by-default manner.
- Introduced RFC-0152 Image Provider Port, standardizing how images are managed and optimized within the platform, leading to greater flexibility and compatibility across different providers (EU-wide).

### Fixed

- Corrected the tagline on the Ukrainian homepage to use the formal address, ensuring cultural appropriateness (UK, webgogol-com).
- Adjusted the footer and navigation components for better spacing, usability, and external link icon placement.
- Resolved issues where negative margin or z-index layering in breadcrumb and header areas occasionally caused layout overlap or visual glitches.
- Adjusted footer layout so the pulse icon is now properly aligned with the site wordmark, improving visual consistency on all pages.
- Clarified and enforced section-content width constraints for better visual harmony throughout all application screens.

### Security & Compliance

- Updated privacy policy and disclosed all relevant third-party data delivery roles explicitly, improving transparency for German and Ukrainian users (DE/UK).
- Refined integration handling and legal text to clarify and limit Cloudflare's role as a processor, disclosing all EU data flows for client review (EU-wide).
- Integrated GDPR/DSGVO-compliant mechanisms for storage, consent, and third-party script policies across all chat and widget features.

### Integrations

- Upstash QStash and Redis are now active for all user message and chat widget delivery, ensuring all communication data is processed within the EU for compliance and reliability.
- Live pilot integrations established for inbound chat hub with Pipedrive and standardized message routing, supporting EU data residency (EU-wide, webgogol-com).

## Platform Updates 2026-05-28 — 2026-06-03

Recent updates focused on enhanced UI effects, improved legal and content clarity, and better platform deployment practices. Clients will notice visual upgrades, more accessible legal content, and improved background processes for EU hosting and compliance.

### Added

- Added glass morphism visual effects to section cards, decision cards, and notausgang page for a more modern and visually appealing design (DE).
- Introduced send-message contact form section, replacing the previous final call-to-action and enabling direct message sending from the contact page (DE).
- Added English legal pages (impressum, privacy policy, terms and withdrawal rights) for nicaragua-projekt, supporting better accessibility for international users (EU-wide).
- Implemented preview images for legal and principal content pages, improving link previews on social media for both nicaragua-projekt and webgogol-com (DE, EN, UK).
- Enabled typographic heading effects and animated section headings, enhancing home and landing pages in both German and Ukrainian locales.
- Support for animated underline hover effect on footer navigation links, making site navigation more interactive and visually appealing (EU-wide).
- New optional section header in founder trust card sections, allowing clear titles and numbering for improved clarity and trust signals (DE).
- Optional motto display below brand labels in the site header, providing more space for custom branding or mission statements (DE).
- Diagnostics and runtime warnings for unresolved icons, content references, and target links. This proactive feedback prevents display issues or broken references, leading to greater reliability.
- Support for optional background images in the website footer, improving visual consistency with brand assets (DE).
- Optional fallback marker for section-list and split-list items without custom icons, maintaining consistent list appearance.
- Ability to align content per item in SectionList for more flexible list layouts.

### Improved

- Legal documents for German and Ukrainian were cleaned up: developer notes, draft markers, and unnecessary horizontal lines were removed. Relative links are now absolute, and locale-specific placeholders were replaced with production values for higher trust and clearer references (DE, UK).
- The German and Ukrainian legal content now provides consistent, accessible markdown formatting, including correct use of formal address in Ukrainian ('Ви/Ваш'), standardized line breaks, and proper document versioning.
- The contact page and send-message section received layout and usability enhancements, including better alignment and fallback copy in case of errors (DE, UK).
- Image handling across all UI components was streamlined by replacing the Astro Image component with standard img tags, ensuring images are displayed reliably regardless of platform.
- All section backgrounds now support flexible configuration, with new hero and decision card backgrounds added for home, pricing, and legal pages (DE, UK).
- Footer motto and trust statements updated to emphasize reliability and performance for the German market (DE).
- Brand group in header supports flexible height and multi-line formatting with aligned elements, ensuring better adaptation for longer brand names or slogans.
- Section-shell and edge-to-edge sections now share consistent border-radius logic, ensuring seamless visual transitions between adjacent sections.
- Section-header, hero panel, and core content panels benefit from cleaner layout alignment and better flexbox handling, resulting in more balanced visuals and easier section customization.
- Section list, split-list, and comparison panels now support visual 'glass surface' effects, offering modern, layered look and optional UI highlights.
- Enhanced FAQ and transparency sections on German home page: improved backgrounds and doodle icons for a more engaging and localized experience (DE).
- On Nicaragua-Projekt, home page trust-strip card layout adjusted from two to three columns for a clearer presentation on wider screens.
- Hero sections have improved mobile behavior: the portrait image is now hidden on smaller screens, and hero area height adapts more responsively to the viewport.
- Clearer language switcher and card section hover/focus colors, aligning color choices more closely with main text for broader accessibility.

### Fixed

- Corrected positioning of animated globe icon in the footer and adjusted glass effects to prevent layout issues, ensuring cleaner site appearance (DE, EU-wide).
- Fixed language detection in content reference resolution, improving the reliability of language fallback and internationalization across the site.
- Addressed overlapping header issues in hero-decision-card sections, and ensured that all form status and labels show correct information to users.
- Resolved various small copy and formatting inconsistencies on content pages, navigation, and legal documents in German and Ukrainian.
- Corrected multiple references and icons in footer and navigation for German-language sites, avoiding errors with contact links and improving navigation reliability (DE).
- Resolved layout violations and content duplication in trust-strip and transparency sections, ensuring single, accurate blocks on German home pages (DE).

### Security & Compliance

- Deployment scripts and Cloudflare Workers integrations were updated to use session storage in memory and prevent KV namespace collisions, improving platform compliance and reliability for EU deployments.
- Cloudflare deployment unified for static sites, removing unused workers bindings and improving isolation of server-side sessions, in line with best practices for EU data privacy.
- Page content compliance checks added on home and contact pages for webgogol.com, helping ensure alignment with required content and page validation rules (DE, EU-wide).

### Integrations

- Enabled central deployment and session management through Cloudflare Workers for all principal apps, simplifying hosting and supporting EU data residency needs.
- GSAP animation library now optimized in the build process and site configuration for nicaragua-projekt and webgogol.com, improving animation performance and consistency (EU-wide).

## Platform Updates 2026-05-21 — 2026-05-27

This release introduces enhanced visual styling controls for section components, including improved support for transparency, glassmorphism, icon customization, and content schema consistency. Several sections were migrated to standardized contracts to ensure consistency, maintainability, and a smoother content editing experience. Minor adjustments and fixes further improve accessibility and design alignment, particularly for EU clients.

### Added

- Introduced glassmorphism (blur/glass overlay) and granular opacity controls for section components, allowing for modern visual effects and more flexible layout designs (EU-wide).
- Enabled vertical fade opacity (top and bottom) for specific sections such as approach, donation-use, final-cta, problem, social-proof, transparency, and women, supporting nuanced gradient transitions and improved content hierarchy (EU-wide).
- Added support for per-item animated icons (lordicon) and customizable icon sizes in the ownership-block and controlled-responsibility-block sections, making iconography more expressive, accessible, and visually consistent (EU-wide).

### Improved

- Standardized section content contracts across list-based and card-based components, aligning all list sections (including price-card, notausgang-block, controlled-responsibility-block, ownership-block, and transparency) to a unified schema for easier content management and maintenance (EU-wide).
- Unified visual modifier logic (such as glass effect) across all sections by introducing a centralized VisualModifiers type, resulting in more predictable design behavior (EU-wide).
- Migrated 23 sections and 9 pages to use modern SectionShell and SectionHeader components, significantly improving maintainability, flexibility, and design consistency for content editors (EU-wide).

### Fixed

- Aligned icon sizes and center alignment in ownership-block and controlled-responsibility-block sections, improving accessibility and ensuring a consistent look (EU-wide).
- Removed legacy and redundant properties from section schemas and home pages, simplifying data management (EU-wide).
- Resolved minor visual layout issues, such as improved border-radius consistency across UI elements and fixed vertical stacking for hero and section backgrounds (EU-wide).

### Security & Compliance

- No user-facing security or compliance changes were made during this period.

### Integrations

- No new third-party integrations or payment provider changes this period.

## Platform Updates 2026-05-14 — 2026-05-20

This release introduces a unified system for managing generated files, making automation and file tracking more predictable and transparent for clients. Additionally, a new validation step was added to check for prohibited !important rules in CSS files, supporting better frontend standards and maintainability. Various improvements reduce manual maintenance, contributing to a more reliable and easier-to-audit platform.

### Added

- Introduced a platform-wide protocol for marking and recognizing auto-generated files (EU-wide), making the management and clean-up of generated content consistent and auditable across projects.
- Added automated validation to ensure no !important rules are used in CSS files, helping avoid style conflicts and maintain a cleaner design system.
- Introduced a command to validate the presence and correctness of generated file markers in the code generation pipeline, supporting easier audits (EU-wide).
- Added missing open-source project information in German, ensuring compliance and transparency with open-source obligations (DE).
- Implemented serialization of route registry to JSON to support more reliable language switching on static builds, making language selection smoother (DE).

### Improved

- Streamlined the inclusion and removal of various auto-generated files in apps and public directories, reducing clutter and minimizing the risk of unintended changes being tracked.
- Simplified onboarding workflows for site generation, including smarter conditional generation of configuration fields and easier updates to project boilerplate.
- Enhanced CSS processing pipeline for onboarding, making it easier to manage and update styling rules.
- Converted image imports to use eager loading and made animation modules dynamically imported, leading to improved page load speed and a more responsive interface.
- Standardized section anchor links throughout all page sections, enabling consistent and dynamic navigation across languages and reducing the likelihood of broken links (DE, EN).
- Updated navigation and anchor values to use language-neutral identifiers, simplifying navigation structure and ensuring consistency in both German and English versions.
- Optimized the structure of language switching logic, removing redundant code and making language selection faster and less error-prone.

### Fixed

- Addressed inconsistencies between template and generated files, minimizing potential build issues and mismatches for client projects.
- Added type assertions and fallback mechanisms to ensure compatibility with various manifest formats, preventing navigation errors and improving reliability in multi-language environments (DE).
- Corrected mapping for route values in dynamic routing, ensuring accurate linking and display especially when routes may be missing or undefined.
- Cleaned up formatting and outdated details in donation/contact page content, providing a clearer and more up-to-date presentation for end users.

### Security & Compliance

- Consistently applied generated-file markers to help with compliance and file provenance tracking, supporting easier demonstrations of change provenance for regulatory purposes (EU-wide).
- Ensured visible documentation of open-source components, supporting compliance with EU open-source license requirements (DE).

### Integrations

- Unified the way platform tools handle file generation and marking, helping integrations and CI pipelines operate more smoothly and predictably.
- Extended manifest loading to support both YAML and standard file formats, increasing compatibility with third-party systems and improving integration flexibility.

## Platform Updates 2026-05-07 — 2026-05-13

This update improves the navigation, footer, and localization for both German and English users. Clients will notice enhanced footer customization, consistent navigation across languages, clearer legal and compliance information, and improved display of contact and promotional information. These changes contribute to a more user-friendly and compliant experience for site visitors in the EU.

### Added

- Footer now features customizable group titles and a promo section, allowing for regionally relevant content display (DE, EN).
- Taglines and mottos can be added to the footer for stronger brand presence (DE, EN).
- Legal links in the footer are now fully configurable, enabling more transparent communication of company credentials (DE, EN).
- Header and footer navigation can now be filtered for a focus on important links relevant to each language version (DE, EN).
- Location details (city, region, country) are included in the footer’s contact section for enhanced regional transparency (EU-wide).

### Improved

- Navigation targets and labels are fully standardized between German and English, ensuring a more intuitive experience for both language groups (DE, EN).
- Navigation YAML and route configurations have been normalized for greater consistency, helping avoid broken or misdirected links.
- Header configuration comments have been added to site labels for easier future adjustments (DE, EN).

### Fixed

- Footer address spacing has been adjusted for improved postal code legibility (EU-wide).
- Redundant or confusing location fields were removed from the footer contact information to present only the most relevant details (EN, DE).

### Security & Compliance

- Compliance and legal information content has been updated and extended, supporting transparency and adherence to local and EU legal requirements (DE, EN, EU-wide).

## Platform Updates 2026-04-30 — 2026-05-06

This update brings improved visual consistency across all website sections, adds new animation features to highlight statistics and numbers, and introduces optional background effects for a more modern look. Several content pages received enhancements for clarity, compliance, or design polish, while updates to image format handling improve performance and meet European requirements.

### Added

- Animated statistic counters and number animations are now available in hero, impact, team, and markdown sections, making key data more visually engaging (DE, EN).
- Directional image fade effects can be applied in team member profiles and markdown sections, creating a more dynamic presentation.
- Noise texture overlays are optionally available across all sections and layout components, allowing for a subtle visual enhancement site-wide.
- Scroll-based header hide/show behavior has been introduced, making navigation less intrusive as users explore the site.

### Improved

- The homepage and impact sections now animate all statistical values smoothly when they enter the viewport, reducing abrupt changes and improving user experience.
- Footer promo images have been migrated to the webp format for improved loading speed and efficiency (EU-wide).
- Section and content spacing has been refined for consistency with the design system, ensuring a more harmonious page layout.
- Content section backgrounds can now be customized with transparent and vertical fade effects, giving each section greater visual separation.
- Team member biographies have been expanded with richer career information, offering more transparency for users (DE, EN).
- Breadcrumbs and legal/info pages have been streamlined and visually improved for easier navigation (DE, EN).

### Fixed

- Fade-to-transparent gradient effects in the main sections have been corrected to display consistently.
- Legal and informational pages no longer use cookies for language detection, relying instead on localStorage and browser language preferences in compliance with European privacy guidelines (EU-wide).
- Miscellaneous minor layout and spacing corrections implemented in headers, footers, and section spacings for a more polished appearance.

### Security & Compliance

- Image format restrictions now enforce webp format across the platform except for public assets, improving load efficiency and supporting European data protection guidelines (EU-wide).
- Cookies are now forbidden in favor of localStorage and Accept-Language headers for language preference persistence to comply with DSGVO/GDPR (EU-wide).

### Integrations

- Component content resolution and multilingual features have been migrated to a shared module, simplifying future expansions.
- Page background components can now be configured per page for more flexible design and compliance with branding or legal display requirements.

## Platform Updates 2026-04-23 — 2026-04-29

This period focused on a major architecture modernization, including a migration to more maintainable and reuse-friendly structures, particularly for the Nicaragua Projekt site. Content, layout and style management have been unified for easier updates, reducing long-term maintenance costs. Several content schema changes, content fixes, and UI improvements were made, all geared towards future-proofing the platform and ensuring continued European legal compliance.

### Added

- Introduced a centralized business layer describing company, compliance, legal, and contact information for the Nicaragua Projekt website (DE), enabling easier maintenance and faster content updates.
- Added a new global section background SVG to provide consistent modern visual styling across landing pages.
- Implemented dynamic generation of fallback static paths for non-translated pages, improving site accessibility for multi-language users (EU-wide).

### Improved

- Migrated component-content type definitions and feature schemas into shared packages, reducing code duplication and streamlining maintenance.
- Simplified open-source and About page content handling by adopting a unified, block-based content approach.
- Reorganized and normalized UI assets (such as images) to optimize loading and future-proof content delivery.
- Refined content validation and merging logic, ensuring that only valid and up-to-date company and legal information appears on client-facing pages (DE).

### Fixed

- Addressed several minor content errors and formatting inconsistencies in both German and English content pages.
- Fixed path errors for static assets and gitignore rules to avoid accidental publication of internal or temporary files.
- Resolved build issues by updating type and module references after content and type migrations.

### Security & Compliance

- Continued enforcement of DSGVO/GDPR compliance for German and EU stakeholders by centralizing and validating legal, contact and compliance content.

### Integrations

- Refactored analytics and growth tracking infrastructure to allow optional activation and vendor-agnostic operation, reducing dependency lock-in and ensuring compliance with privacy requirements (EU-wide).

## Platform Updates 2026-04-16 — 2026-04-22

This release completes a major migration to standardized file naming conventions, centralized shared components, and improved legal and UI documentation across the platform. Clients benefit from better alignment with European legal requirements, improved maintainability, and enhanced performance of the website components. Changes also further streamline processes for ongoing content and design consistency.

### Added

- Introduced a content layer for page layouts and contracts to bring greater consistency and flexibility to how page content and layouts are managed (EU-wide).
- Added comprehensive legal documentation for architecture and content contracts, offering transparent reference points for compliance and integrations (EU-wide).

### Improved

- Renamed component and schema files throughout the platform to follow standardized '-component' and section-based suffixes, making it easier to locate, update, and maintain UI building blocks (EU-wide).
- Refined navigation and footer link resolution so that internal linking is handled through structured targets, reducing the risk of broken or outdated links as the site evolves (EU-wide).
- Simplified and clarified interface definitions for navigation and footer links to ensure type correctness and improve developer confidence in application updates and further localization (EU-wide).
- Updated language switcher and navigation behavior so that their visibility now directly reflects content-layer feature settings, improving the accuracy and customizability of regional and language-based controls (EU-wide).
- Footer promotional elements and copyright sections are now handled with dedicated content-driven structures, allowing quicker and more flexible updates without modifying code (EU-wide).
- Made minor visual refinements to component CSS for more consistent visual hierarchy, improved spacing, and better adaptability to brand and design system changes (EU-wide).

### Fixed

- Resolved issues with navigation and footer links where some links previously used hardcoded paths, switching to dynamic resolution based on the official content schema for improved stability and fewer outdated links (EU-wide).
- Removed unused variables, imports, and helper functions from navigation and footer components, reducing the risk of maintenance errors and eliminating code that could cause confusion (EU-wide).
- Corrected link type matching and URL resolution in the navigation and footer for better compatibility with page structures (EU-wide).
- Fixed minor header and footer component issues, including class names and import paths, to ensure consistent styling and rendering (EU-wide).

### Security & Compliance

- Continued expansion of content and page schemas with dedicated fields for DSGVO/GDPR compliance, including improved documentation, default privacy policy structures, and transparent feature management (EU-wide).

### Integrations

- Updated project dependencies to ensure current, secure, and compatible integration with third-party systems and shared design/UI libraries (EU-wide).

## Platform Updates 2026-04-09 — 2026-04-15

This period introduces a multilingual language switcher to the Nicaragua Projekt website, improving accessibility for users in different languages. The update also restructures the site's content loading, adds dynamic copyright handling, and enhances the visual consistency and clarity of brand elements and the footer. These changes help ensure better user experience, legal clarity, and easier website navigation for both German and international visitors.

### Added

- A multilingual language switcher has been added to the site header, allowing users to change website language with a single click (DE, EN). This improves accessibility for international audiences.
- A dynamic copyright component has been introduced. This automatically displays the correct copyright years and owner information, supporting compliance and future-proofing legal displays (DE, EN).
- A brand tagline field was added to the brand label, making it possible to display an additional message below the brand name for more flexibility in communicating brand values.
- Markdown-based component overrides are now supported in page front matter, allowing per-page customization of specific content sections without code changes.
- Provided full English translations for Terms and Conditions (AGB), Privacy Policy (Datenschutz), Imprint (Impressum), and Cancellation Policy (Widerruf) pages, ensuring international users have access to all relevant legal content (EU-wide).

### Improved

- Brand and language switcher components have been refactored for visual clarity, better alignment, and improved contrast, making navigation and branding elements more accessible and visually appealing.
- The footer has been restyled for smoother background gradients and improved visual hierarchy, enhancing clarity and consistency across devices.
- Component content loading now uses caching and preloading to optimize performance and prevent build warnings about missing translation entries. Missing translated content now falls back gracefully to German by default, with clear warnings for transparent content management (EU-wide).
- Legal and informational pages now generate output for all supported languages (DE, EN), not just the default language, improving inclusivity and compliance (EU-wide).
- Clarified and synchronized legal page content and metadata across German and English language versions, offering clear information on site ownership, contact, data privacy, and withdrawal terms for all users (DE, EN/EU).

### Fixed

- Footer copyright information now uses schema-based validation instead of hardcoded text, ensuring accuracy and reducing manual maintenance (DE, EN).
- Content was restructured to move project-specific details out of shared components and into per-page overrides, preventing content duplication and inconsistencies.
- Corrected navigation issues and filename inconsistencies for English legal pages to ensure stable links and consistent access for end users (EU-wide).

### Security & Compliance

- Copyright logic and year handling are now schema-validated and consistent, supporting up-to-date compliance with copyright and intellectual property regulations (EU-wide).
- Aligned all legal disclosures, privacy policy information, and cancellation policy details with standard European requirements (GDPR/DSGVO), reducing legal risk and improving compliance across multiple regions.

### Integrations

- The lordicon icon set has been updated for footer and navigation. Icons now load more reliably and are visually enhanced, supporting CRISP branding across the interface.
- Updated routing logic to properly serve language-specific legal information under the correct URLs for both German and English visitors.
