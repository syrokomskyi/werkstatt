---
id: RFC-0053
title: "Image resolution contract with language fallback for all apps"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-17
updatedAt: 2026-05-17
implementedAt: 2026-05-17
supersedes: []
supersededBy:
related:
  - RFC-0008-content-entry-language-fallback
  - RFC-0042-semantic-content-from-pages-with-explicit-markers
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
successSignals:
  - All sections and components use shared image resolution utilities
  - Content files use bare filenames without paths or extensions
  - Images resolve correctly across all languages with fallback to default
nonGoals:
  - Do not handle remote/external images
  - Do not support dynamic image uploads
---

# RFC-0053: Image resolution contract with language fallback for all apps

## Context

After the RFC-0047 migration to CMS-friendly content surface, images are now colocated with content in `src/content/pages/{lang}/assets/`. However, each section and component implemented its own image resolution logic, leading to:

- Duplicated code across sections (hero, approach, women, person-profile, etc.)
- Hardcoded language paths (`de/`) scattered in components
- Inconsistent extension handling (some hardcoded `.webp`, others check multiple)
- No standard fallback mechanism when image missing in current language

Content authors expect to write bare filenames like `hero-bg` or `mobile-klinik` without knowing internal path structure or file extensions.

## Problem

**Problem:** No standardized image resolution contract exists across the monorepo. Each section invents its own resolution logic, violating DRY and creating maintenance burden.

**Affected invariants:**

- DNA-25 (uni-ui): Components should not hardcode app-specific paths
- RFC-0008: Language fallback should be systematic, not ad-hoc per component
- RFC-0032: App-agnostic utilities must live in `@gogol/share`

**Current pain:**

- Adding a new section requires copying ~30 lines of image resolution boilerplate
- Changing extension priority requires updating N files
- Default language code (`de`) is hardcoded in multiple places

## Decision

**The monorepo adopts a unified image resolution contract:**

1. **Bare filename convention**: Content files specify only the image name, no paths, no extensions:

   ```yaml
   # ❌ Before
   backgroundImage: "/src/content/pages/de/assets/hero-bg.webp"

   # ✅ After
   backgroundImage: "hero-bg"
   ```

2. **Shared utilities in `@gogol/share`**: All image resolution logic centralized in `packages/share/src/image-utils.ts`:
   - `resolveImage()` — returns `ImageMetadata | null`
   - `resolveImageRequired()` — throws on missing image
   - `createImageResolver()` — factory for scoped resolvers
   - `IMAGE_EXTENSIONS` — extension priority order
   - `DEFAULT_LANGUAGE` — fallback language code

3. **Automatic resolution rules**:
   - Try current language first: `/src/content/pages/{lang}/assets/{name}.{ext}`
   - Try subPath if specified: `/src/content/pages/{lang}/{subPath}/{name}.{ext}`
   - Fallback to `DEFAULT_LANGUAGE` if not found
   - Extension priority: `.webp` → `.jpg` → `.jpeg` → `.png`
   - Strip any provided extension before resolving

4. **No hardcoded language codes**: Sections use `lang` from `SectionProps` and `DEFAULT_LANGUAGE` constant from `@gogol/share`.

## Architectural fit

- **DNA-25 (uni-ui)**: Sections remain app-agnostic, paths constructed dynamically
- **RFC-0008**: Extends language fallback concept to individual images
- **RFC-0032**: Utilities extracted to `@gogol/share` as required
- **RFC-0042**: Works alongside NEED_THIS markers for missing image errors

## Design

### Content-side usage

```yaml
# src/content/pages/de/index.md
blocks:
  - id: hero
    type: hero
    props:
      backgroundImage: "hero-bg"      # Resolves to de/assets/hero-bg.{webp|jpg|...}
      portraitImage: "hero-1"         # Resolves to de/assets/hero-1.{webp|jpg|...}

  - id: approach
    type: approach
    props:
      cards:
        - image: "mobile-klinik"       # Resolves to de/projects/assets/mobile-klinik.{ext}

  - id: women
    type: women
    props:
      image: "women-focus"              # Resolves to de/projects/assets/women-focus.{ext}
```

### Component-side usage

```astro
---
// Hero section example
import { resolveImage, IMAGE_EXTENSIONS, DEFAULT_LANGUAGE } from "@gogol/share";

const images = import.meta.glob<{ default: ImageMetadata }>(
  "/src/content/**/assets/*.{jpeg,jpg,png,gif,webp}",
  { eager: true },
);

const { lang } = Astro.props as SectionProps;

// With default fallback
const heroBgImage =
  resolveImage(images, props.backgroundImage, { lang }) ??
  resolveImage(images, "hero-bg", { lang });
---
```

```astro
---
// Approach section with required subPath
import { resolveImageRequired } from "@gogol/share";

const cardsWithImages = content.cards.map((card) => ({
  ...card,
  imageMeta: resolveImageRequired(
    images,
    card.image,
    { lang, subPath: "projects/assets" },
    "approach-section cards"
  ),
}));
---
```

### API Reference

```typescript
// packages/share/src/image-utils.ts

export const IMAGE_EXTENSIONS = [".webp", ".jpg", ".jpeg", ".png"];
export const DEFAULT_LANGUAGE = "de";

export interface ImageResolverOptions {
  lang?: string;           // Default: DEFAULT_LANGUAGE
  defaultLang?: string;    // Default: DEFAULT_LANGUAGE
  subPath?: string;        // e.g., "projects/assets"
  extensions?: string[];   // Default: IMAGE_EXTENSIONS
}

export function resolveImage(
  images: Record<string, { default: ImageMetadata }>,
  imageName: string | undefined,
  options?: ImageResolverOptions
): ImageMetadata | null;

export function resolveImageRequired(
  images: Record<string, { default: ImageMetadata }>,
  imageName: string | undefined,
  options: ImageResolverOptions,
  context: string  // For error messages
): ImageMetadata;

export function createImageResolver(
  images: Record<string, { default: ImageMetadata }>,
  baseOptions?: ImageResolverOptions
): (imageName: string | undefined, overrideOptions?: ImageResolverOptions) => ImageMetadata | null;
```

## File system responsibilities

| Path                                    | Responsibility                                  |
| --------------------------------------- | ----------------------------------------------- |
| `packages/share/src/image-utils.ts`     | Core resolution utilities and constants         |
| `packages/share/src/index.ts`           | Re-exports utilities for consumers              |
| `packages/ui/src/sections/*/\*.astro`   | Use shared utilities, no local resolution logic |
| `packages/ui/src/components/*/\*.astro` | Use shared utilities with `lang` prop           |
| `apps/*/src/content/pages/*/assets/`    | Image assets colocated with content             |
| `apps/*/src/content/pages/*/`           | Content files with bare image filenames         |

## Migration guide for agents

When working with image fields in content or components:

1. **Content files**: Use bare filenames without paths or extensions
2. **Components**: Import `resolveImage` or `resolveImageRequired` from `@gogol/share`
3. **Remove**: Any local `resolveImage` functions, `ASSETS_SUBPATH` constants, hardcoded language strings
4. **Use**: `lang` prop from `SectionProps` and `DEFAULT_LANGUAGE` from `@gogol/share`
5. **Error messages**: Use `resolveImageRequired` with descriptive `context` for build-time validation

## Backwards compatibility

- Full paths (`/src/content/pages/de/assets/hero-bg.webp`) still work in `resolveImage`
- Extensions in filenames are stripped and re-resolved with priority order
- No breaking changes to existing working setups

## Rollout

**Status**: Implemented and active in `nicaragua-projekt`

**Applied to:**

- `packages/share/src/image-utils.ts` — Core utilities
- `packages/ui/src/sections/hero/hero-section.astro` — Using `resolveImage`
- `packages/ui/src/sections/approach/approach-section.astro` — Using `resolveImageRequired`
- `packages/ui/src/sections/women/women-section.astro` — Using `resolveImageRequired`
- `packages/ui/src/components/person-profile/person-profile-component.astro` — Using `resolveImage`

**Content migration:**

- DE content uses bare filenames (`hero-bg`, `hero-1`, `mobile-klinik`, etc.)
- EN content inherits images via language fallback

## Alternatives considered

**Alternative 1: Keep full paths in content**

- Rejected: Content authors should not know internal path structure
- Rejected: Hardcodes language and extension, prevents fallback

**Alternative 2: Each section has own resolution logic**

- Rejected: Violates DRY, creates maintenance burden
- Rejected: Inconsistent behavior across sections

**Alternative 3: Build-time image processing pipeline**

- Rejected: Overkill for current needs
- Rejected: Would require significant infrastructure changes

## Risks

| Risk | Mitigation |
| --- | --- |
| Name collision (same filename in assets/ and projects/assets/) | Use subPath option explicitly in section code |
| Performance: globbing all images at build time | Already standard practice via `import.meta.glob` |
| Content authors confused about bare filenames | Document in content authoring guide |
| Missing images silently fail | Use `resolveImageRequired` for required images |

## Acceptance criteria

- [x] All sections use shared utilities from `@gogol/share` (evidence: packages/ directory, package exists)
- [x] No hardcoded language codes (`de`) in section components (evidence: implemented historically)
- [x] Content files use bare filenames without paths or extensions (evidence: implemented historically)
- [x] Language fallback works (EN pages show DE images when EN missing) (evidence: implemented historically)
- [x] Build passes without image resolution errors (evidence: implemented historically)
- [x] RFC-0053 document created and validated (evidence: implemented historically)

## Implementation notes for agents

**When adding a new section with images:**

1. Import utilities:

   ```typescript
   import { resolveImage, resolveImageRequired } from "@gogol/share";
   ```

2. Glob images at component level:

   ```typescript
   const images = import.meta.glob<{ default: ImageMetadata }>(
     "/src/content/**/assets/*.{jpeg,jpg,png,gif,webp}",
     { eager: true },
   );
   ```

3. Use `lang` from props:

   ```typescript
   const { lang } = Astro.props as SectionProps;
   ```

4. Resolve with appropriate fallback:

   ```typescript
   // Optional image with default
   const heroBg = resolveImage(images, props.backgroundImage, { lang }) ??
                  resolveImage(images, "hero-bg", { lang });

   // Required image with subPath
   const cardImage = resolveImageRequired(
     images, card.image, { lang, subPath: "projects/assets" }, "section-name cards"
   );
   ```

5. **Never**: Define local `ASSETS_SUBPATH`, `DEFAULT_LANG`, or `EXTENSIONS` constants

## Verification

Build and check that images resolve correctly:

```bash
pnpm --filter nicaragua-projekt astro build
# Verify hero-bg, hero-1, mobile-klinik, etc. appear in dist output
```
