{{GENERATED_HEADER}}

# Styles Instructions

Apply these instructions when reading or editing files under `src/styles/`.

## Local reminders

- Keep styles file-based under `src/styles/`.
- Use only `--ds-*` design tokens.
- Prefer shared styles in `global.css`, component styles in `components/`, and page styles in `pages/`.
- Do not move styling responsibility into `.astro` files.

## CSS file naming (RFC-0020)

- Root CSS files under `src/styles/components/` must end with `-component`: `footer-component.css`, `header-component.css`.
- CSS files under `src/styles/components/section/` must end with `-section`: `hero-section.css`.
- CSS files outside `src/styles/components/` (e.g. `src/styles/pages/`) must **not** contain `-style` in the filename.
- Enforced by `naming.suffixes.lint`.
