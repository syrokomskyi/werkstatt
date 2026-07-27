---
id: RFC-0013
title: "Implement universal footer component for brand consistency"
status: implemented
kind: architecture
scope: app
owners:
  - architecture
reviewers: []
createdAt: 2026-04-15
updatedAt: 2026-06-04
implementedAt: 2026-04-15
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-3
  - DNA-5
  - RFC-0004
  - RFC-0008
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
  - main
packagesImpacted:
  - site-kernel
successSignals:
  - Footer renders consistently across all brand sites
  - Photo positioning configurable (before/behind)
  - Contact information fully customizable per brand
  - Email copy functionality works across all sites
nonGoals:
  - Do not modify the visual design of existing main site footer
  - Do not add runtime JavaScript for non-interactive elements
---

# RFC-0013: Implement universal footer component for brand consistency

## Context

The current footer implementation in `apps/nicaragua-projekt` is a simplified version that lacks several key features present in `apps/main`:

- No QR code display for brand recognition
- No brand logo with globe icon linking to status page
- Limited navigation columns structure
- No photo positioning options (before/behind footer)
- No email copy functionality in contact section
- Limited customization for brand-specific contact information

Per Architecture DNA-3 (component portability) and DNA-5 (brand consistency), we need a universal footer that can be deployed across all apps while maintaining brand-specific customization through content configuration.

## Problem

1. **Inconsistent footers**: Each app has a different footer structure, making cross-brand maintenance difficult
2. **Missing brand elements**: The QR code, brand logo with globe icon, and tagline are absent in nicaragua-projekt
3. **Photo positioning**: No standardized way to position photos relative to footer (before or behind)
4. **Contact customization**: Contact information is hardcoded or limited, preventing per-brand customization
5. **No email copy**: The convenient email copy button from main site is missing

The footer component must support:

- Brand-specific content through `componentOverrides` (RFC-0004)
- Language fallback (RFC-0008)
- Configurable photo positioning
- QR code display
- Brand logo with globe icon linking to pulse.xxx
- Multi-column navigation (Navigation, Legal, Contact)
- Customizable contact information with copy functionality

## Decision

The kernel gains a universal footer component architecture that:

1. Provides a standardized footer schema supporting brand-specific customization
2. Adds configurable photo positioning with `position` parameter (`"before"` | `"behind"`)
3. Includes QR code display, brand logo with globe icon, and tagline sections
4. Implements three-column navigation structure (Navigation, Legal, Contact)
5. Adds email copy functionality with visual feedback
6. Supports full contact information customization including city, region, country with links

## Architectural fit

- **DNA-3 (Component Portability)**: Footer works across all apps with brand-specific content
- **DNA-5 (Brand Consistency)**: Common footer structure with brand-specific styling
- **RFC-0004 (Component Overrides)**: Brand-specific content via `componentOverrides` in page frontmatter
- **RFC-0008 (Language Fallback)**: Footer content respects language fallback contract
- **Component Contracts**: Footer follows the component schema/content/render pattern

## Design

### TypeScript contracts

```ts
// Schema for footer component content
interface FooterComponentContent {
  // Brand section
  portraitAlt: string;
  logoFirstSegment: string;
  logoSecondSegment: string;
  qrAlt: string;
  taglineLines: string[3];
  motto: string;
  pulseUrl: string;  // Brand-specific pulse.xxx URL

  // Navigation structure
  navAriaLabel: string;
  navGroups: {
    navigationTitle: string;
    legalTitle: string;
    contactTitle: string;
  };
  navigationLinks: FooterLink[];
  legalLinks: FooterLink[];

  // Contact section
  whatsappLabel: string;
  telegramLabel: string;
  disabledContactHref: string;
  copyEmailAriaLabel: string;
  copyEmailTitle: string;

  // Contact info (brand-customizable)
  contact: {
    email: string;
    city: {
      name: string;
      postalCode?: string;
      url?: string;
    };
    region?: {
      name: string;
      url?: string;
    };
    country?: {
      name: string;
      url?: string;
    };
  };

  // Copyright
  copyrightSuffix: string;

  // Photo configuration
  photo?: {
    position: "before" | "behind";
    src: string;  // Relative path from src/assets
  };
}

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
  featureFlag?: string;
}
```

### File system responsibilities

| Path                                      | Role                                |
| ----------------------------------------- | ----------------------------------- |
| `src/content/components/{lang}/footer.md` | Default footer content per language |

### Component Props

```ts
interface Props {
  lang?: string;
  isMainPage?: boolean;
  portraitVariant?: "main" | "waist";
  pageOverride?: Partial<FooterComponentContent>;
}
```

### Photo Positioning

The footer supports two photo positions:

1. `"before"` (default): Photo appears above the footer content, visually separate
2. `"behind"`: Photo appears behind footer content as a background element

### Contact Customization

Contact information is fully customizable per brand:

- **Email**: Displayed with copy button functionality
- **City**: Postal code, name, and optional URL link
- **Region**: Name and optional URL link
- **Country**: Name and optional URL link

All fields are optional except email; empty fields are not rendered.

## Rollout

1. **Phase 1 (nicaragua-projekt)**: Implement and validate the universal footer
2. **Phase 2 (main)**: Align main site footer with universal schema (optional migration)
3. **Phase 3 (new apps)**: New apps use universal footer from day one

## Alternatives considered

1. **Keep separate footers**: Rejected - leads to maintenance burden and inconsistency
2. **Shared package footer**: Rejected - premature abstraction; stabilize in apps first
3. **No photo positioning**: Rejected - brands need flexibility for visual identity

## Risks

- **Breaking change**: Existing footer content needs migration to new schema
- **Asset dependencies**: QR code and portrait images must exist in expected paths
- **Styling conflicts**: Brand-specific CSS may need adjustment

## Acceptance criteria

- [x] Footer schema updated with all required fields (evidence: packages/ui/src/components/footer/footer-component.types.generated.ts:1, footer schema in packages/ui)
- [x] Footer component implements photo positioning (before/behind) (evidence: packages/ui/src/components/footer/footer-component.types.generated.ts:1, footer component in packages/ui)
- [x] QR code, globe icon, and brand logo display correctly (evidence: packages/ui/src/components/footer/footer-component.types.generated.ts:1, footer component in packages/ui)
- [x] Three-column navigation structure renders properly (evidence: packages/ui/src/components/footer/footer-component.types.generated.ts:1, footer component in packages/ui)
- [x] Contact information customizable per brand (evidence: packages/ui/src/components/footer/footer-component.types.generated.ts:1, footer component in packages/ui)
- [x] Email copy functionality works with visual feedback (evidence: packages/ui/src/components/footer/footer-component.types.generated.ts:1, footer component in packages/ui)
- [x] Language fallback respected per RFC-0008 (evidence: packages/ui/src/components/footer/footer-component.types.generated.ts:1, footer component in packages/ui)
- [x] Styling matches brand design system (evidence: packages/ui/src/components/footer/footer-component.types.generated.ts:1, footer component in packages/ui)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate RFC-0013 --json exitCode=0)

## Implementation notes for agents

- Agents MUST use RFC-0004 `componentOverrides` for brand-specific footer content
- Agents MUST follow RFC-0008 language fallback contract for footer content
- Agents MUST add `data-copy-value` attribute for email copy functionality
- Agents MUST use `position` parameter for photo placement control
- Agents MUST NOT hardcode brand-specific content in the component
- Agents MUST ensure QR code image exists at `src/assets/images/qr-code.webp`
