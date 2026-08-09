# Language Configuration Guide

How to add, remove, or modify languages for your site without engineering involvement.

## Overview

Per [RFC-0038](../../docs/rfcs/RFC-0038-content-declared-language-configuration-and-visitor-language-detection.md), language configuration is **content-declared** in `src/content/assets/system.md`. This means:

- **No code changes** required to add/remove languages
- **Client-editable** — content editors can manage languages
- **Validated** — `i18n.config.validate` ensures configuration is correct

## Quick Reference

### Current Language Configuration

```yaml
# src/content/assets/system.md
i18n:
  default: de
  supported:
    de:
      name: "Deutsch"
      flag: "🇩🇪"
      hreflang: "de-DE"
      rtl: false
    en:
      name: "English"
      flag: "🇬🇧"
      hreflang: "en-US"
      rtl: false
```

## Adding a New Language

### Step 1: Edit system.md

Add a new entry under `i18n.supported`:

```yaml
i18n:
  default: de
  supported:
    de:
      name: "Deutsch"
      flag: "🇩🇪"
      hreflang: "de-DE"
      rtl: false
    en:
      name: "English"
      flag: "🇬🇧"
      hreflang: "en-US"
      rtl: false
    es:                    # ← New language
      name: "Español"
      flag: "🇪🇸"
      hreflang: "es-ES"
      rtl: false
```

### Step 2: Create Content Files

Create content for the new language in each collection:

```
src/content/
├── pages/
│   ├── de/
│   │   └── index.md      # German content
│   ├── en/
│   │   └── index.md      # English content
│   └── es/               # ← New directory
│       └── index.md      # Spanish content
├── components/
│   └── es/               # ← New directory
│       └── hero.md
└── sections/
    └── es/               # ← New directory
        └── about.md
```

### Step 3: Validate

Run the validation command:

```bash
rtk pnpm exec werkstatt run i18n.config.validate --site <your-app>
```

### Step 4: Regenerate Middleware (if using language detection)

If you're using auto-generated language detection:

```bash
rtk pnpm exec werkstatt run i18n.detect.implement --site <your-app>
```

This updates `src/middleware/language-detect.ts` with the new language.

## Removing a Language

### Step 1: Remove from system.md

```yaml
i18n:
  default: de
  supported:
    de:
      name: "Deutsch"
      flag: "🇩🇪"
      hreflang: "de-DE"
      rtl: false
    # en section removed ←
```

### Step 2: Remove Content Files (optional)

Delete or archive the language directory:

```bash
rtk rm -rf src/content/pages/en
rtk rm -rf src/content/components/en
```

### Step 3: Validate

```bash
rtk pnpm exec werkstatt run i18n.config.validate --site <your-app>
```

⚠️ **Warning**: Removing a language without removing its content files will trigger validation warnings for "orphan content".

## Changing Default Language

### Step 1: Update system.md

```yaml
i18n:
  default: en      # ← Changed from de
  supported:
    de:
      name: "Deutsch"
      flag: "🇩🇪"
      hreflang: "de-DE"
      rtl: false
    en:
      name: "English"
      flag: "🇬🇧"
      hreflang: "en-US"
      rtl: false
```

⚠️ **Important**: The `default` value **must** exist in `supported`.

### Step 2: Validate

```bash
rtk pnpm exec werkstatt run i18n.config.validate --site <your-app>
```

### Step 3: Update Static Generation (if needed)

If your build process generates static pages only for the default language, the change is automatic. Verify by building:

```bash
rtk pnpm run build
```

## Language Configuration Schema

### Required Fields

| Field            | Type     | Description                                    |
| ---------------- | -------- | ---------------------------------------------- |
| `i18n.default`   | `string` | Default language code (must be in `supported`) |
| `i18n.supported` | `object` | Map of language codes to configurations        |

### Per-Language Fields

| Field      | Type      | Required | Description                      |
| ---------- | --------- | -------- | -------------------------------- |
| `name`     | `string`  | ✅       | Display name (e.g., "Deutsch")   |
| `flag`     | `string`  | ✅       | Emoji flag (e.g., "🇩🇪")          |
| `hreflang` | `string`  | ✅       | SEO hreflang tag (e.g., "de-DE") |
| `rtl`      | `boolean` | ✅       | Right-to-left text direction     |

### Optional Detection Settings

> Cookies are forbidden in this repository. Server-side detection uses URL + Accept-Language only. Client-side persistence uses localStorage.

```yaml
i18n:
  default: de
  supported:
    de: { name: "Deutsch", flag: "🇩🇪", hreflang: "de-DE", rtl: false }
    en: { name: "English", flag: "🇬🇧", hreflang: "en-US", rtl: false }
  detection:
    order: ["url", "acceptLanguage", "default"]
    persistToLocalStorage: true
    acceptLanguageFuzzyMatch: true
```

## Validation Rules

The `i18n.config.validate` command checks:

1. ✅ `i18n.default` exists
2. ✅ `i18n.supported` has at least one language
3. ✅ `i18n.default` is in `i18n.supported`
4. ✅ All required fields present for each language
5. ✅ No duplicate `hreflang` values
6. ✅ No orphan content files (content exists for unsupported languages)

## Troubleshooting

### "default-not-in-supported" Error

**Problem**: `i18n.default` is set to a language not in `i18n.supported`.

**Fix**: Add the language to `supported` or change `default` to an existing language.

### "orphan-content" Warnings

**Problem**: Content files exist for a language not in `i18n.supported`.

**Fix**: Either:

- Add the language to `i18n.supported`
- Delete the orphan content files

### "missing-i18n-section" Error

**Problem**: No `i18n` section in `system.md`.

**Fix**: Add the `i18n` section per this guide.

## See Also

- [RFC-0038: Content-Declared Language Configuration](../../docs/rfcs/RFC-0038-content-declared-language-configuration-and-visitor-language-detection.md)
- [Visitor Language Detection](./visitor-language-detection.md)
- [system.md Reference](./system-manifest.md)
