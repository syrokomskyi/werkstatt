# Changelog

All notable client-facing changes to the `werkstatt` project are documented here.

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

This release delivers improvements to diagnostics, validation, and workflow automation, enhancing both reliability and ease of use for content and deployment management. Updates focus on providing clearer diagnostic feedback, streamlined build and release processes, improved automation in mission operations, and automatic handling of merge conflicts, making systems more robust and user-friendly. These changes ensure more transparent operations and help prevent manual errors in daily project work.

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

### Fixed
- Corrected preflight checks and snapshot validation for Cloudflare Workers deployments, ensuring successful builds and reducing false deployment errors.
- Fixed duplicate logging and refined protocol detection in several handlers for cleaner logs and more accurate system messaging.
- Resolved misreported or double-read redirect file diagnostics, which helps avoid confusion when working with content redirects.
- Updated error messages to no longer reference hardcoded internal paths, improving clarity in error outputs for end users.
- Numerous fixes were applied to resolve minor content validation errors, type generation mismatches, and UI inconsistencies in profile blocks, forms, and markdown processing, resulting in more consistent display and improved reliability (EU-wide).
- Corrected project dependencies to ensure all necessary modules are available during validation and onboarding steps.
- Resolved issues with route lookups for team and profile pages, improving site navigation (EU-wide).
- Resolved language and legal markup inconsistencies in page templates and onboarding materials, ensuring default deployments meet European legal standards.

### Security & Compliance
- Added explicit 410 Gone 'tombstone' responses in middleware for permanently retired routes (EU-wide), supporting GDPR and content removal requirements and making route removals more transparent for users and search engines.
- Environment variable names and configuration references have been updated to use a consistent and correct naming convention, improving security clarity for analytics, observability, and deployment across EU-based infrastructure (EU-wide).
- Ensured all core modules and templates provide privacy notice defaults and GDPR/DSGVO checklists, supporting legally-compliant site operations from first deployment (EU-wide).

### Integrations
- Updated dependencies for @astrojs and Cloudflare Workers adapters (EU-wide), providing compatibility with the latest EU cloud hosting platforms and ensuring ongoing vendor support.
- Playwright Chromium is now automatically installed during site materialization, ensuring required tooling for visual/tests is available without manual steps.
- Integrated European-friendly analytics (Matomo) and payment solutions (Stripe), enabling clients to use locally preferred providers (EU-wide).
- Added support for Cloudflare-based asset delivery and observability-stack deployments in EU infrastructure, making traffic data and uptime monitoring privacy-safe and compliant with EU data residency requirements.
