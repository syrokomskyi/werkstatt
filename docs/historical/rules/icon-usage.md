# Icon Usage Rules

## Core rule

**Use generated icon components instead of emoji, Unicode symbols, or inline SVG on all pages.**

Icons must come from the project's icon sets stored in `src/assets/icons/lordicon/`.

## Available icon sets

| Set | Folder | Style | Best for |
| --- | --- | --- | --- |
| Doodle Black | `lordicon/doodle-black/` | Hand-drawn, monochrome | Playful/informal pages |
| Doodle Color | `lordicon/doodle-color/` | Hand-drawn, colorful | Hero sections, feature highlights |
| Doodle Outline | `lordicon/doodle-outline/` | Hand-drawn, outline only | Subtle decorative accents |
| System Regular | `lordicon/system-regular/` | Clean, geometric | Navigation, UI controls, forms |

## How to choose a set

- Pick **one primary icon set** per site/brand — consistency matters.
- Document the chosen set in the project's design rules or `README.md`.
- Mix sets only when there is a clear design rationale (e.g., `system-regular` for nav + `doodle-color` for hero).

## How to use icons

1. **Generate icon components** before dev/build:

   ```bash
   pnpm icons:gen
   ```

   This creates Astro components in `src/components/icons/gen/` from the JSON assets.

2. **Import and use** the generated component:

   ```astro
   ---
   import { SampleCheckIcon } from "@components/icons/gen/lordicon/system-regular";
   ---
   <SampleCheckIcon size={32} />
   ```

3. **Clean generated icons** when switching sets or after removing source JSON:
   ```bash
   pnpm icons:clean
   ```

## Forbidden patterns

- ❌ Do **not** use emoji characters (🔥, ✅, 📈, etc.) in visitor-facing copy.
- ❌ Do **not** use Unicode symbols (→, •, ✓, etc.) as decorative icons.
- ❌ Do **not** inline raw SVG in `.astro` templates when an icon component exists.
- ❌ Do **not** commit the `src/components/icons/gen/` folder — it is generated.

## Adding new icons

1. Place the Lottie JSON file in the appropriate `src/assets/icons/lordicon/{set}/` folder.
2. Run `pnpm icons:gen`.
3. Import the generated component by its PascalCase name.
