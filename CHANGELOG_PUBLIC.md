# Changelog

All notable client-facing changes to the `werkstatt` project are documented here.

## Platform Updates 2026-07-30 — 2026-08-05

This release cycle includes several improvements to onboarding workflows, usability updates for creative tools, enhanced commit process reliability, and updates to documentation for clarity. Notably, 'forge' tools received a reworked command set and simplified onboarding with better logging, while stability and automation were enhanced for platform deployment and validation tasks. These changes support smoother project startup, reduce manual error possibilities, and provide a more consistent experience for end users.

### Added
- Progress indicators and diagnostic logging were added to the 'forge create' and onboarding commands, making installation and project setup more transparent for new users (EU-wide).
- The 'editframe' profile now supports working Vite projects out of the box, streamlining creative project setup (EU-wide).
- Introduced new Editframe video composition and onboarding skills, including ef-composition-review, ef-render-verify, ef-onboard, and six additional domain skills (EU-wide), to enhance video creation and project onboarding capabilities.
- Added React-based templates for Editframe profiles, allowing for more advanced and interactive video composition workflows (EU-wide).
- Implemented a build-time check for duplicate section headings on content pages, reducing potential content duplication and improving site clarity (EU-wide).
- Integrated workspace tree indexing and modification time-based cache mechanisms to the automated pipeline, enabling faster build times and smarter incremental updates (EU-wide).
- Introduced profile-driven asset management, artifact validation, release lifecycle, and determinism verification to core workflows. This provides automated, customizable checking of releases, assets, and outputs, simplifying compliance and quality assurance (EU-wide).
- Added session-end protocol steps for RFC implementation verification and transcript logging, ensuring traceability and process reliability (EU-wide).
- Included a mandatory RTK (Run-Time Kit) installation step in onboarding, reducing manual setup and ensuring consistent project environments for all users.
- Provided clear documentation and rule enhancements covering onboarding, agent lifecycle, command conventions, versioning, and .gitignore usage, offering improved guidance for technical and non-technical stakeholders.
- Introduced artifact caching for repeated build steps, reducing redundant code generation and speeding up deployments (EU-wide).
- Implemented post-build automated checks for HTML structural integrity, helping ensure that sites meet quality and compliance requirements out of the box.
- Launched new unit and property-based testing patterns for HTML/CSS mutator functions to help safeguard site rendering and stability.
- Environment configuration files can now be loaded automatically, providing easier setup for deployments and reducing manual steps (EU-wide).
- Unique ARIA IDs are now assigned to each page section, improving navigation for users with assistive technology (EU-wide).
- Video captions and translation status roles were added to relevant UI sections, enhancing accessibility and internationalization support.
- Introduced automatic post-deployment CDN cache purge for Cloudflare-integrated workflows, ensuring website visitors see the latest content and updates immediately (EU-wide).
- Added auto-commit skills that trigger a commit after each operator action in the system, reducing risks related to data loss and providing a transparent workflow audit (EU-wide).
- Enabled mission checklist real-time validation with interactive feedback and visual indicators for smoother operator experience.
- Introduced new validation commands to automatically check for orphaned, outdated, or inconsistent generated files, helping to ensure your build output is accurate and clean (EU-wide).
- Per-page preview images are now registered and validated, providing more predictable visual consistency across deployments.
- Added 'passport.key.ensure' functionality to automate secure key creation for deployments, supporting smoother onboarding and improved security management (DE, EU-wide).
- Compact density spacing was introduced for ownership and trust sections, improving readability on dense layouts.
- Support for transparency links in the website footer was added, providing better access to key information for users (EU-wide).

### Improved
- The 'forge' command line interface (CLI) was simplified by removing redundant 'forge.' prefixes and introducing unqualified command names, reducing the risk of command collisions and clarifying usage for operators (EU-wide).
- Creative operator guides and quick start instructions were clarified in the documentation, helping non-technical users begin without needing to know terminal commands.
- Install and scaffold logging for editframe profiles was made clearer and more verbose, speeding up issue diagnosis for new projects.
- Refined validation logic for profile fields, including support for html-attribute-pattern checks and video model invariants to ensure stricter compliance and catch configuration errors earlier (EU-wide).
- Updated progress logging for long-running platform operations, providing more responsive feedback during automated tasks (EU-wide).
- Enhanced concurrent processing in pipelines and checks by adding concurrency settings and dependency graphs, speeding up automated workflows (EU-wide).
- Made the onboarding process more robust by enforcing RTK installation and providing idempotent forge-bootstrap (safe to re-run), minimizing onboarding errors and downtime.
- Enhanced automated profile enforcement, including stricter invariant and artifact checks, improving early error detection for releases and assets.
- Implemented workflow improvements for automatic cleanups and final transcript archiving, helping maintain clean repositories and operational insight.
- Strengthened Axiom integration resilience with additional timeout, retry, and pre-flight handling for production and development deployments, helping prevent deployment interruptions (EU-wide).
- Refined the release pipeline to ensure that state and metadata are correctly propagated across build and deployment steps, minimizing the chance of inconsistencies (EU-wide).
- Enhanced site kernel to enforce robots.txt in all environments, helping meet privacy and SEO requirements (EU-wide).
- Optimized pipeline caching and build-skip logic for faster dev deployments, ensuring more responsive updates and efficient developer workflows.
- Expanded documentation and rules for command manifests, agent roles, and test strategies, making operational procedures clearer and more auditable for clients (EU-wide).
- Platform UI accessibility updated: Headings in catalog and adaptation sections are now clearly separated for better screen reader and assistive technology support (EU-wide).
- Automated detection of development channels enables faster crawling during development, speeding up CI processes (EU-wide).
- The validation report interface now distinguishes clearly between violations and incomplete results, making it easier to identify and address specific issues (EU-wide).
- Brand label and footer components now use inherited background colors to comply with accessibility contrast standards (WCAG), ensuring readability for all users.
- Darkened brand colours in specific UI themes improve contrast and meet accessibility regulations (WCAG) (EU-wide).
- Table elements and markdown sections have improved tab navigation and role tagging for better screen reader and keyboard accessibility.
- The system now propagates section numbers through the UI, enabling more robust and accessible markup structures for users with disabilities.
- Enhanced validation of content and generated files, including new rules for timestamp handling and fresh content detection, improving auditability and data quality.
- Expanded documentation with clear operational rules, test coverage expectations, and deployment pipeline conventions for more predictable integration and maintenance.
- Updated build automation and dev pipeline scripts for easier local development and more reliable workflow execution.
- Preview image generation is now fully deterministic, ensuring consistent previews and better reproducibility throughout deployments, which reduces surprises during QA or after rollouts.
- Build file validation now includes stricter checks for file timestamps, preventing issues caused by non-reproducible builds and minimizing audit risks (EU-wide).
- Enhancements in the release preparation and reconciliation pipeline improve process automation and reduce manual intervention required during build and release stages.
- Table layouts and vertical spacing in the open-source registry section were refined, ensuring consistent alignment of arrow indicators and component headings.
- Icons for generated favicons now use a standardized color palette, resulting in a more visually cohesive appearance.
- The design of deployment metadata cards was updated to handle longer codes (such as commit SHA) without layout issues.
- The component table in the open-source registry now starts in a collapsed state by default, reducing visual clutter for users.

### Fixed
- Numerous corrections to the editframe template and React bootstrap templates address issues with dimensions, children rendering, and CSS grid layouts, ensuring more consistent UI appearance (EU-wide).
- Redundant log outputs and diagnostic messaging in sync and commit routines were streamlined to reduce noise and improve reliability.
- The platform's commit workflow now properly respects dry-run flags and several edge cases around autosave, skip-bump, and pin operations, which helps prevent accidental deployments (EU-wide).
- Skill command naming was synchronized across documentation to prevent confusion.
- Behaviors around warning-only states for certain errors (such as ERR_PNPM_IGNORED_BUILDS and secondary hash mismatches in deployments) were clarified; affected errors now report more clearly but do not block healthy deployments.
- Resolved issues with YAML escaping for configuration files and corrected documentation to accurately reflect feature sets and skill lists (EU-wide).
- Addressed a logging issue where completion messages could display incorrectly when file uploads failed (EU-wide).
- Corrected false positives and misclassifications in health checks (e.g. forge.doctor AGENTS.md validation, clean up of resurrected source paths) and fixed context routing to ensure smoother mission closeouts.
- Resolved anchor link scrolling issues in the site UI, restoring consistent navigation for users.
- Fixed issues related to .env file persistence and environment variable handling, preventing configuration drift and supporting secure, reproducible deployments.
- Resolved several findings from code reviews, addressing test reliability, state propagation during release, and artifact path mismatches to prevent deployment issues.
- Corrected issues in content reference handling and improved HTML comment-stripping to ensure robustness in document generation.
- Prevented possible loss of cache or state by ensuring generated artifacts are properly committed during site operations.
- Keyboard navigation and accessibility have been improved in generated report pages, including correct heading order, better table navigation (tabindex fixes), and proper labeling of textareas—benefitting all users, especially those relying on assistive technologies (EU-wide).
- Addressed an issue with command commit syntax to ensure smoother and more reliable automation for repository actions (EU-wide).
- Video thumbnails no longer show unwanted seams, resulting in a more consistent media display.
- Contrast and color adjustments applied across UI elements resolve previously flagged accessibility issues by automated tools.
- Automated accessibility checks (axe/axe-core) now reliably ignore non-critical content security policies and automatically handle required browser binaries, ensuring comprehensive testing on all environments (EU-wide).
- SVG handling for icons is now more robust, including support for non-self-closing SVG tags and improved error logging, ensuring consistent display and fewer compatibility issues.
- Component adjustments and improved synchronization across manifest and documentation files fix minor inconsistencies and prevent test fixture errors during deployment workflows.
- Resolved several minor and edge case errors in validation logic, including improved placeholder expansion, better error logging, and prevention of rare validation failures (EU-wide).
- Removed non-deterministic timestamps in content generators to ensure repeatable builds for audit and compliance purposes.
- Improved tests and logic to prevent inconsistent state during mission close and materialization processes.
- Corrected file path resolution and placeholder handling in generated file validation, eliminating false positives/negatives during checks.
- Improved error handling for deployment rollbacks, limiting catch conditions to only the relevant missing manifest scenarios.
- Resolved smaller bugs in validators around placeholder expansion, null value acceptance, and content reconciliation to further reduce disruption during updates.
- The Version column was removed from the open-source component table to streamline the presentation and avoid redundant information.
- The tokenizer was corrected to handle CSS content in style blocks accurately, resolving display and parsing issues.
- Minor fixes were applied in skill report templates to ensure language localization and translation consistency in all outputs.

### Security & Compliance
- Automation for platform version bump discipline and auto-pinning was enforced, ensuring deployments meet compliance and auditability requirements automatically (EU-wide).
- Expanded the Axiom finding suppression system with per-site configuration for easier and more targeted diagnostic suppression, aiding EU clients in managing compliance noise (EU-wide).
- Removed deprecated secretsFile environment variables in favor of convention-based configuration, increasing security and aligning with best practices for multi-environment (.env.alt, .env.main) setups (EU-wide).
- Clarified and documented evidence credentials management for R2 storage, supporting better GDPR compliance and transparency in cloud evidence storage (EU-wide).
- Added measures for integrity protection in deployment journals (bordbuch), reducing risk of data loss or accidental deletion by verifying state at key steps in the release process (EU-wide).
- Automated detection and logging of structural and semantic issues in customer-facing site artifacts, supporting compliance with industry QC standards.
- Accessibility fixes and improved color contrast ensure compliance with EU accessibility standards and support for users with disabilities (EU-wide).
- Hardened drift detection and registry validation for generated file checks, supporting stricter audit scenarios and regulatory compliance (EU-wide).
- Aligned cache purging and validation mechanisms with GDPR/DSGVO data consistency standards for EU deployments.
- Automated detection and cleanup of stale or unauthorized generated files strengthens compliance for audits and protects against accidental information leakage (EU-wide).
- Documentation and pipeline rules updated to clearly describe automated checks and their impact, supporting your compliance documentation needs for regulatory requirements like GDPR.
- Automated artifact storage in the release process was improved, reducing the likelihood of missing or failed deployments.

### Integrations
- Improvements to handling empty values in environment variable processing (sourceDotenv) allow for more robust integrations with cloud environments like Cloudflare Workers.
- Extended support for React and improved synchronization of skill and profile templates within the Editframe and video lifecycle feature set (EU-wide).
- Improved integration with Axiom data services, ensuring audit ID boundaries are handled robustly and fallback mechanisms are in place for edge cases.
- Updated preflight and deployment checks to be compatible with cross-platform requirements, providing consistent reliability regardless of hosting or deployment environment (EU-wide).
- Updated integration and configuration sync to reliably resolve sites from the registry for automated processes.
- Automated accessibility testing via axe-core is now reliably executed during deployment, supporting ongoing compliance efforts (EU-wide).
- Improved robustness and transparency of Cloudflare deployment routines by adding retry mechanisms with backoff for API operations, reducing downtime due to transient failures (EU-wide).
- Enhanced observer and audit trails for integrations, supporting external compliance verification and operational trust.
- Passport key management is now integrated directly into the automated build process, supporting consistent and secure key handling for cloud environments and EU hosting.
- Restored and enhanced git status pre-flight checks in the fix process, and improved session management compatibility in onboarding and doctor functions.
