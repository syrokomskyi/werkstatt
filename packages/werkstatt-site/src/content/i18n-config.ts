/*
<MODULE_CONTRACT>
<purpose>Load and validate i18n configuration from content-declared system manifest (RFC-0038).</purpose>
<keywords>i18n, localization, language configuration, content-declared</keywords>
<responsibilities>
  <item>Load i18n configuration from src/content/assets/system.md (YAML frontmatter).</item>
  <item>Validate that default language exists in supported languages.</item>
  <item>Generate LANGUAGE_MAPPING from content-declared languages.</item>
  <item>Provide type-safe ResolvedI18n interface for apps.</item>
</responsibilities>
<non-goals>
  <item>Do not implement runtime language switching logic.</item>
  <item>Do not handle Accept-Language parsing (separate middleware).</item>
  <item>Do not persist language preferences (localStorage handled in client script).</item>
  <item>Do not use cookies — forbidden repository-wide.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="loadI18nConfig">Load and validate i18n config from system.md.</entry>
  <entry key="ResolvedI18n">Type-safe resolved i18n configuration.</entry>
  <entry key="I18nConfig">Content-declared i18n configuration interface.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation for RFC-0038 Wave 1.</item>
  <item>Cookie usage removed — localStorage (client) + Accept-Language (server) only.</item>
</CHANGE_SUMMARY>
*/

import * as fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";

export interface I18nLanguageConfig {
  name: string;
  flag?: string;
  hreflang: string;
  rtl?: boolean;
}

export interface I18nDetectionConfig {
  /** Server-side detection order. "cookie" and "localStorage" are silently stripped (forbidden). */
  order?: ("url" | "acceptLanguage" | "default")[];
  persistToLocalStorage?: boolean;
  acceptLanguageFuzzyMatch?: boolean;
}

export interface I18nConfig {
  default: string;
  supported: Record<string, I18nLanguageConfig>;
  detection?: I18nDetectionConfig;
}

export interface ResolvedI18n {
  config: I18nConfig;
  /** LANGUAGE_MAPPING compatible with createLocalizationHelpers */
  languageMapping: Record<string, string>;
  /** Whether site supports multiple languages */
  isMultilingual: boolean;
  /** Default language code */
  defaultLanguageCode: string;
}

const SYSTEM_MANIFEST_PATH = "src/content/system.md";

/**
 * Load i18n configuration from app's system.md file.
 * Per RFC-0038: languages are declared in content, not code.
 */
export async function loadI18nConfig(appDirectory: string): Promise<ResolvedI18n> {
  const systemMdPath = path.join(appDirectory, SYSTEM_MANIFEST_PATH);

  let config: I18nConfig;

  try {
    const content = await fs.readFile(systemMdPath, "utf-8");
    const frontmatter = extractFrontmatter(content);

    if (!frontmatter?.i18n) {
      // Fallback: infer from legacy configure/common.ts pattern
      // This is a transitional state — apps should migrate to system.md i18n
      throw new Error(
        `No i18n section found in ${SYSTEM_MANIFEST_PATH}. ` +
          `Add i18n configuration per RFC-0038: ` +
          `{ default: "de", supported: { de: { name: "Deutsch", hreflang: "de-DE" } } }`,
      );
    }

    config = validateI18nConfig(frontmatter.i18n);
  } catch {
    // If system.md doesn't exist or has no i18n, provide minimal fallback
    // This allows gradual migration per RFC-0038
    config = {
      default: "de",
      supported: {
        de: { name: "Deutsch", hreflang: "de-DE" },
      },
    };
  }

  // Validate: default must be in supported
  if (!(config.default in config.supported)) {
    throw new Error(
      `i18n.default "${config.default}" not found in i18n.supported languages: ` +
        Object.keys(config.supported).join(", "),
    );
  }

  // Build LANGUAGE_MAPPING for createLocalizationHelpers
  const languageMapping: Record<string, string> = {};
  for (const [code, langConfig] of Object.entries(config.supported)) {
    languageMapping[code] = langConfig.name;
  }

  return {
    config,
    languageMapping,
    isMultilingual: Object.keys(config.supported).length > 1,
    defaultLanguageCode: config.default,
  };
}

/**
 * Synchronous twin of loadI18nConfig — required by Astro module-evaluation
 * contexts (content.config.ts, top-level imports) where async is not allowed.
 *
 * Apps SHOULD call this once at module load and cache the result. Returns
 * `null` when system.md is missing or has no i18n block — callers must decide
 * whether that should throw (recommended for production) or use a fallback.
 *
 * Per RFC-0038: never hardcode language lists. If this returns null at build
 * time, the caller should treat it as a hard configuration error, not silently
 * substitute defaults.
 */
export function loadI18nConfigSync(appDirectory: string): ResolvedI18n | null {
  const systemMdPath = path.join(appDirectory, SYSTEM_MANIFEST_PATH);

  let frontmatter: Record<string, unknown> | null;
  try {
    const content = readFileSync(systemMdPath, "utf-8");
    frontmatter = extractFrontmatter(content);
  } catch {
    return null;
  }

  if (!frontmatter?.i18n) return null;

  let config: I18nConfig;
  try {
    config = validateI18nConfig(frontmatter.i18n);
  } catch {
    return null;
  }

  if (!(config.default in config.supported)) return null;

  const languageMapping: Record<string, string> = {};
  for (const [code, langConfig] of Object.entries(config.supported)) {
    languageMapping[code] = langConfig.name;
  }

  return {
    config,
    languageMapping,
    isMultilingual: Object.keys(config.supported).length > 1,
    defaultLanguageCode: config.default,
  };
}

/**
 * Extract YAML frontmatter from markdown content.
 */
function extractFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  try {
    return parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Validate and normalize i18n configuration.
 */
function validateI18nConfig(raw: unknown): I18nConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("i18n configuration must be an object");
  }

  const config = raw as Record<string, unknown>;

  // Validate default
  if (typeof config.default !== "string" || !config.default.match(/^[a-z]{2}(-[A-Z]{2})?$/)) {
    throw new Error('i18n.default must be a valid BCP-47 language code (e.g., "de", "de-DE")');
  }

  // Validate supported
  if (!config.supported || typeof config.supported !== "object") {
    throw new Error("i18n.supported must be an object mapping language codes to config");
  }

  const supported = config.supported as Record<string, unknown>;

  for (const [code, langRaw] of Object.entries(supported)) {
    if (!code.match(/^[a-z]{2}(-[A-Z]{2})?$/)) {
      throw new Error(`Invalid language code "${code}" in i18n.supported`);
    }

    if (!langRaw || typeof langRaw !== "object") {
      throw new Error(`i18n.supported["${code}"] must be an object with name and hreflang`);
    }

    const lang = langRaw as Record<string, unknown>;

    if (typeof lang.name !== "string" || lang.name.length === 0) {
      throw new Error(`i18n.supported["${code}"].name is required`);
    }

    if (typeof lang.hreflang !== "string" || !lang.hreflang.match(/^[a-z]{2}(-[A-Z]{2})?$/)) {
      throw new Error(`i18n.supported["${code}"].hreflang must be a valid BCP-47 code`);
    }
  }

  return {
    default: config.default,
    supported: config.supported as Record<string, I18nLanguageConfig>,
    detection: config.detection as I18nDetectionConfig | undefined,
  };
}

/**
 * Validate i18n configuration for an app.
 * Returns array of validation errors (empty if valid).
 */
export async function validateI18nConfigApp(
  appDirectory: string,
): Promise<Array<{ rule: string; message: string; file?: string }>> {
  const errors: Array<{ rule: string; message: string; file?: string }> = [];
  const systemMdPath = path.join(appDirectory, SYSTEM_MANIFEST_PATH);

  try {
    const content = await fs.readFile(systemMdPath, "utf-8");
    const frontmatter = extractFrontmatter(content);

    if (!frontmatter) {
      errors.push({
        rule: "missing-frontmatter",
        message: `No YAML frontmatter found in ${SYSTEM_MANIFEST_PATH}`,
        file: SYSTEM_MANIFEST_PATH,
      });
      return errors;
    }

    if (!frontmatter.i18n) {
      errors.push({
        rule: "missing-i18n-section",
        message: `No i18n section in ${SYSTEM_MANIFEST_PATH}. Add per RFC-0038.`,
        file: SYSTEM_MANIFEST_PATH,
      });
      return errors;
    }

    try {
      const config = validateI18nConfig(frontmatter.i18n);

      // Check default in supported
      if (!(config.default in config.supported)) {
        errors.push({
          rule: "default-not-in-supported",
          message: `i18n.default "${config.default}" not in supported: ${Object.keys(config.supported).join(", ")}`,
          file: SYSTEM_MANIFEST_PATH,
        });
      }

      // Check for duplicate hreflangs
      const hreflangs = Object.values(config.supported).map((l) => l.hreflang);
      const uniqueHreflangs = new Set(hreflangs);
      if (hreflangs.length !== uniqueHreflangs.size) {
        errors.push({
          rule: "duplicate-hreflang",
          message: "Duplicate hreflang values in i18n.supported",
          file: SYSTEM_MANIFEST_PATH,
        });
      }
    } catch (validationError) {
      errors.push({
        rule: "invalid-i18n-config",
        message:
          validationError instanceof Error ? validationError.message : String(validationError),
        file: SYSTEM_MANIFEST_PATH,
      });
    }
  } catch (error) {
    errors.push({
      rule: "missing-system-md",
      message: `Cannot read ${SYSTEM_MANIFEST_PATH}: ${error instanceof Error ? error.message : String(error)}`,
      file: SYSTEM_MANIFEST_PATH,
    });
  }

  return errors;
}

export interface LanguageDetectionMiddlewareOptions {
  /** App directory for resolving paths */
  appDirectory: string;
  /** Whether to generate client-side persistence script */
  generateClientScript?: boolean;
}

export interface GeneratedMiddlewareResult {
  /** Generated middleware TypeScript code */
  middlewareCode: string;
  /** Generated client script TypeScript code (if requested) */
  clientScriptCode?: string;
  /** Detected language codes from system.md */
  supportedLanguages: string[];
  /** Default language code */
  defaultLanguage: string;
}

/**
 * Generate language detection middleware code from content-declared i18n config.
 * Per RFC-0038 Wave 4: Auto-generate visitor language detection middleware.
 */
export async function generateLanguageDetectionMiddleware(
  options: LanguageDetectionMiddlewareOptions,
): Promise<GeneratedMiddlewareResult> {
  const { appDirectory, generateClientScript = true } = options;

  // Load i18n config from system.md
  const i18n = await loadI18nConfig(appDirectory);
  const supportedLanguages = Object.keys(i18n.config.supported);
  const defaultLanguage = i18n.config.default;
  const detection = i18n.config.detection ?? {};

  // Detection order (default: url -> acceptLanguage -> default)
  // Cookies are forbidden in this repository — use localStorage on client, Accept-Language on server.
  const order = (detection.order ?? ["url", "acceptLanguage", "default"]).filter(
    (s: string) => s !== "cookie" && s !== "localStorage",
  );
  const persistToLocalStorage = detection.persistToLocalStorage ?? true;
  const acceptLanguageFuzzyMatch = detection.acceptLanguageFuzzyMatch ?? true;

  // Generate middleware code
  const middlewareCode = generateMiddlewareCode({
    supportedLanguages,
    defaultLanguage,
    order,
    persistToLocalStorage,
    acceptLanguageFuzzyMatch,
  });

  // Generate client script if requested
  let clientScriptCode: string | undefined;
  if (generateClientScript && persistToLocalStorage) {
    clientScriptCode = generateClientScriptCode({
      supportedLanguages,
      defaultLanguage,
    });
  }

  return {
    middlewareCode,
    clientScriptCode,
    supportedLanguages,
    defaultLanguage,
  };
}

interface MiddlewareCodeOptions {
  supportedLanguages: string[];
  defaultLanguage: string;
  order: string[];
  persistToLocalStorage: boolean;
  acceptLanguageFuzzyMatch: boolean;
}

function generateMiddlewareCode(options: MiddlewareCodeOptions): string {
  const { supportedLanguages, defaultLanguage, order, acceptLanguageFuzzyMatch } = options;

  const supportedLangsArray = supportedLanguages.map((l) => `"${l}"`).join(", ");
  const orderArray = order.map((o) => `"${o}"`).join(", ");

  return `// GENERATED. Do not change this line unless the file contains project specific changes.
/*
<MODULE_CONTRACT>
<purpose>Auto-generated language detection middleware (RFC-0038).</purpose>
<keywords>language detection, middleware, i18n, auto-generated</keywords>
<responsibilities>
  <item>Detect visitor's preferred language from URL or Accept-Language header.</item>
  <item>Redirect non-language-prefixed URLs to detected language version.</item>
  <item>Skip static assets and API routes.</item>
</responsibilities>
<non-goals>
  <item>Do not handle language switching logic (handled by UI components).</item>
  <item>Do not manage translation content.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="detectLanguage">Main detection algorithm per RFC-0038.</entry>
  <entry key="onRequest">Astro middleware entry point.</entry>
</MODULE_MAP>
<COMPASS_BLOCK id="language-detect">
</COMPASS_BLOCK>
<CHANGE_SUMMARY>
  <item>Auto-generated by i18n.detect.implement (RFC-0038 Wave 4).</item>
  <item>Supported languages: [${supportedLanguages.join(", ")}].</item>
  <item>Default language: ${defaultLanguage}.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: Middleware runs on every request. Keep imports lightweight.
import type { MiddlewareHandler } from "astro";

// [RFC-0038] Content-declared language configuration
// Cookies are forbidden in this repository — server detects via URL + Accept-Language only.
const SUPPORTED_LANGUAGES = [${supportedLangsArray}];
const DEFAULT_LANGUAGE = "${defaultLanguage}";
const DETECTION_ORDER = [${orderArray}];
const ACCEPT_LANGUAGE_FUZZY_MATCH = ${acceptLanguageFuzzyMatch};

function isStaticAsset(pathname: string): boolean {
  return pathname.match(/\\.(ico|png|jpg|jpeg|svg|css|js|json|txt|xml|woff|woff2|ttf|otf)$/) !== null;
}

function parseAcceptLanguage(header: string | null): string[] {
  if (!header) return [];

  // RFC 4647 compliant parsing
  const languages = header
    .split(",")
    .map((lang) => {
      const [code, q = "q=1"] = lang.trim().split(";");
      const quality = parseFloat(q.replace("q=", "")) || 1;
      return { code: code.trim().toLowerCase(), quality };
    })
    .sort((a, b) => b.quality - a.quality)
    .map((l) => l.code);

  return languages;
}

function matchLanguage(preferred: string[], supported: string[]): string | null {
  for (const lang of preferred) {
    // Exact match
    if (supported.includes(lang)) return lang;

    // Fuzzy match (e.g., "en-US" -> "en")
    if (ACCEPT_LANGUAGE_FUZZY_MATCH) {
      const baseLang = lang.split("-")[0];
      if (supported.includes(baseLang)) return baseLang;
    }
  }
  return null;
}

function detectLanguage(request: Request): string {
  const url = new URL(request.url);
  const pathname = url.pathname;

  for (const source of DETECTION_ORDER) {
    switch (source) {
      case "url": {
        // Check if URL starts with /{lang}/
        const pathLang = pathname.split("/")[1];
        if (pathLang && SUPPORTED_LANGUAGES.includes(pathLang)) {
          return pathLang;
        }
        break;
      }

      case "acceptLanguage": {
        const header = request.headers.get("accept-language");
        const preferred = parseAcceptLanguage(header);
        const matched = matchLanguage(preferred, SUPPORTED_LANGUAGES);
        if (matched) return matched;
        break;
      }

      case "default": {
        return DEFAULT_LANGUAGE;
      }
    }
  }

  return DEFAULT_LANGUAGE;
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { request, url } = context;
  const pathname = url.pathname;

  // Skip static assets
  if (isStaticAsset(pathname)) {
    return next();
  }

  // Skip API routes
  if (pathname.startsWith("/api/")) {
    return next();
  }

  // Detect language
  const detectedLang = detectLanguage(request);

  // Check if URL already has language prefix
  const pathLang = pathname.split("/")[1];
  const hasLangPrefix = SUPPORTED_LANGUAGES.includes(pathLang);

  if (!hasLangPrefix && detectedLang !== DEFAULT_LANGUAGE) {
    // Redirect to detected language
    const redirectUrl = new URL(url);
    redirectUrl.pathname = \`/${"$"}{detectedLang}${"$"}{pathname}\`;
    return Response.redirect(redirectUrl, 302);
  }

  // Continue to page (language is either in URL or is default)
  context.locals.language = detectedLang;
  return next();
};
`;
}

interface ClientScriptOptions {
  supportedLanguages: string[];
  defaultLanguage: string;
}

function generateClientScriptCode(options: ClientScriptOptions): string {
  const { supportedLanguages, defaultLanguage } = options;
  const supportedArray = supportedLanguages.map((l) => `"${l}"`).join(", ");

  return `// GENERATED. Do not change this line unless the file contains project specific changes.
/*
<MODULE_CONTRACT>
<purpose>Auto-generated client-side language persistence (RFC-0038).</purpose>
<keywords>language detection, localStorage, i18n, auto-generated</keywords>
<responsibilities>
  <item>Read persisted language preference from localStorage.</item>
  <item>Persist detected language to localStorage for future visits.</item>
  <item>Expose utility for language switching.</item>
</responsibilities>
<non-goals>
  <item>Do not use cookies — forbidden in this repository.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="init">Auto-detect and persist language on page load.</entry>
  <entry key="window.__I18N__">Global i18n utility exposed to components.</entry>
</MODULE_MAP>
<COMPASS_BLOCK id="language-persist">
</COMPASS_BLOCK>
<CHANGE_SUMMARY>
  <item>Auto-generated by i18n.detect.implement (RFC-0038 Wave 4).</item>
  <item>Cookie usage removed — localStorage only.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: Client-side only. No server imports.
export {};

(function () {
  "use strict";

  const SUPPORTED_LANGUAGES = [${supportedArray}];
  const DEFAULT_LANGUAGE = "${defaultLanguage}";
  const STORAGE_KEY = "preferredLanguage";

  // Read from localStorage
  function getStoredLanguage(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  // Save to localStorage
  function persistLanguage(lang: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // localStorage unavailable (private browsing, etc.)
    }
  }

  // Detect initial language
  function detectInitialLanguage(): string {
    // 1. Check URL
    const pathLang = window.location.pathname.split("/")[1];
    if (SUPPORTED_LANGUAGES.includes(pathLang)) {
      persistLanguage(pathLang);
      return pathLang;
    }

    // 2. Check localStorage
    const stored = getStoredLanguage();
    if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
      return stored;
    }

    // 3. Check navigator.language
    const navLang = navigator.language.toLowerCase();
    const baseLang = navLang.split("-")[0];
    if (SUPPORTED_LANGUAGES.includes(baseLang)) {
      persistLanguage(baseLang);
      return baseLang;
    }

    // 4. Default
    return DEFAULT_LANGUAGE;
  }

  // Expose to global for components
  window.__I18N__ = {
    supported: SUPPORTED_LANGUAGES,
    default: DEFAULT_LANGUAGE,
    current: detectInitialLanguage(),
    setLanguage: function (lang: string) {
      if (SUPPORTED_LANGUAGES.includes(lang)) {
        persistLanguage(lang);
        this.current = lang;
      }
    },
  };
})();

// Type augmentation for window
declare global {
  interface Window {
    __I18N__: {
      supported: string[];
      default: string;
      current: string;
      setLanguage(lang: string): void;
    };
  }
}
`;
}
