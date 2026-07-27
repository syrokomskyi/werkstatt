# Open Source / 3rd Party Notices Page Pattern

This document defines the technical organization of the "Open Source" page (`src/pages/[lang]/open-source.astro`), which serves as a comprehensive, automated repository of third-party software licenses and notices.

## Core Principle: Automated Synchronization

The page is designed as a **self-updating component**. Content is never authored manually; instead, it is synchronized with the project's actual production dependencies.

### 1. Data Source (Audit Pipeline)

The project uses `@quantco/pnpm-licenses` to extract license information from the `pnpm` workspace.

- **Command (List)**: `pnpm exec pnpm-licenses list --prod --output-file dependencies.json`
- **Command (Disclaimer)**: `pnpm exec pnpm-licenses generate-disclaimer --prod --output-file third-party-licenses.txt`

### 2. Synchronization Script

The script `scripts/service/generate-open-source-md.ts` coordinates the audit and transformation:

- **Logic**: Executes the audit commands, reads the results, and formats them into a single Markdown document.
- **Storage**: Outputs to `src/content/pages/{lang}/legal/open-source.md`.
- **Content Collection**: Part of the `legalPages` collection.

### 3. Content Format

The generated Markdown follows a strict structure:

- **Frontmatter**:
  - `pageTitle`: "Drittanbieter-Hinweise"
  - `metaDescription`: Localized SEO description.
  - `breadcrumbLabel`: Label for navigation.
- **Body**:
  - Summarized stats (count, generation date).
  - A Markdown table listing Package, Version, License, and Links.
  - Detailed license and NOTICE texts captured in HTML `<details>` elements for readability.

## Application Architecture

### Route Implementation

The Astro route (`src/pages/[lang]/open-source.astro`) must remain "thin":

- **Fetching**: Uses `getEntry("legalPages", ...)` to retrieve the localized Markdown entry.
- **Rendering**: Directly renders the `page.body` through the project's standard Markdown component (e.g., `MarkdownPage`).
- **Localization**: Follows the standard `[lang]` route pattern.

## Technical Portability (Re-creation Guide)

To recreate this pattern on another project:

1. **Prerequisites**: Ensure `pnpm` is used as the package manager and install `@quantco/pnpm-licenses` as a dev dependency.
2. **Generation Script**:
   - Implement a TypeScript script that runs the audit commands described above.
   - Aggregate the `dependencies.json` and `third-party-licenses.txt` into a Markdown template.
   - Design the template to include placeholders for project-specific metadata (domain, email).
3. **Integration**:
   - Define a `Content Collection` in Astro to host legal/static pages.
   - Create a corresponding `.astro` route that reads from the collection and renders the body.
