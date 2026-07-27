# External Links Convention

This rule defines the standard for marking and styling external links in the warpgogol-3 project.

## Core rule

**All external links must be visually marked with `data-external-link="1"` attribute to indicate they lead to external resources.**

### When to mark links as external

- Links with `target="_blank"` attribute
- Links with `rel="noopener"` or `rel="noopener noreferrer"` attributes
- Links pointing to domains different from the current site
- Links in coach profiles, partner links, and external resources

### Implementation pattern

```astro
<a
  href="https://external-site.com"
  target="_blank"
  rel="noopener"
  class="component-link"
  data-external-link="1"
>
  Link text
</a>
```

### Styling guidelines

External links use CSS pseudo-elements with the `↗` symbol:

```css
.component-link[data-external-link="1"] {
  --ds-component-external-outline: color-mix(
    in srgb,
    currentColor 35%,
    transparent
  );
  position: relative;
  padding-right: 1.15em;
}

.component-link[data-external-link="1"]::after {
  content: "↗";
  position: absolute;
  top: 0.05em;
  right: 0;
  font-size: 0.95em;
  line-height: 1;
  opacity: 0.9;
}

.component-link[data-external-link="1"]::before {
  content: "";
  position: absolute;
  left: -0.25em;
  right: -0.1em;
  top: 0.05em;
  bottom: 0.05em;
  border-radius: var(--ds-radius-1);
  transition: background-color 180ms var(--ds-ease-smooth);
}

.component-link[data-external-link="1"]:hover::before {
  background: var(--ds-component-external-outline);
}
```

### Component examples

- **Coach profile links:** In `QuotePhotoSection` component for coach profiles
- **Program links:** In funding program cards
- **External resources:** In documentation and reference materials
- **Markdown content:** Automatically applied in `MarkdownContent.css`

### Style inheritance

External link styles inherit from the base `.markdown-content a[data-external-link="1"]` pattern in `src/styles/components/MarkdownContent.css`. Component-specific styles should follow the same pattern with component-specific CSS variables.

### Accessibility

- Use semantic HTML with proper `target="_blank"` and `rel="noopener"`
- The visual `↗` indicator is decorative and handled via CSS
- Screen readers will announce external links through standard link behavior

### Consistency requirements

- Always use `data-external-link="1"` attribute for external links
- Maintain consistent CSS variable naming: `--ds-[component]-external-outline`
- Use the same `↗` symbol and positioning across all components
- Follow the hover effect pattern with subtle background highlight

### Validation checklist

Before completing external link work:

- [ ] All external links have `data-external-link="1"` attribute
- [ ] CSS follows the established pattern with proper variables
- [ ] Hover effects work with the outline background
- [ ] Symbol positioning is consistent (top: 0.05em, right: 0)
- [ ] Component styles use appropriate CSS variable names
- [ ] Accessibility attributes are correct (target, rel)
