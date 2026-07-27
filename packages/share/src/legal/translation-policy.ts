/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0174] Binding-language policy resolver for legal documents.
  Pure functions that turn a page's authored `translation` frontmatter block into
  a render-time decision: is this the binding-language version, what is the locale's
  translation status, must the mandatory language notice + "unofficial translation"
  indicator be shown, and where does the binding document live.
</purpose>
<non-goals>
  <item>Do not read content or the route registry — the binding URL is injected by the caller.</item>
  <item>Do not render markup — that is @gogol/ui's translation-notice component.</item>
  <item>Do not translate copy — the notice component owns localized microcopy.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0174: initial binding-language policy resolver.</item>
</CHANGE_SUMMARY>
*/

/** Per-locale translation status for a legal document. */
export type TranslationStatus = "official" | "unofficial" | "disabled";

export const TRANSLATION_STATUSES: readonly TranslationStatus[] = [
  "official",
  "unofficial",
  "disabled",
] as const;

/**
 * Authored `translation` block, declared once in the binding-language page file
 * (e.g. `pages/de/datenschutz.md`). Lives in the client-editable `pages` surface
 * (DNA-22) so the client toggles it without engineering.
 */
export interface PageTranslationPolicy {
  /** Legally binding language code for this page (e.g. "de"). */
  binding: string;
  /** pageId of the binding document; defaults to the declaring page's id. */
  bindingPageId?: string;
  /** Localized display name of the binding document, e.g. "Datenschutzerklärung". */
  bindingDocLabel?: string;
  /**
   * Mandatory language notice. Default true. The validator forbids `false` while
   * any non-binding locale is `unofficial`.
   */
  notice?: boolean;
  /** Persistent "unofficial translation" indicator. Default true. */
  indicator?: boolean;
  /**
   * Per-locale status. A locale absent here that has a translation file is treated
   * as "unofficial". The binding language itself is always treated as official.
   */
  locales?: Record<string, TranslationStatus>;
}

/** Render-time decision for the current (lang, pageId). */
export interface ResolvedTranslationContext {
  /** Is the current render the binding-language version? */
  isBinding: boolean;
  /** Effective status of the current locale. */
  status: TranslationStatus;
  /** Binding language code (for dual-language notice copy). */
  bindingLang: string;
  /** Localized name of the binding document for the notice link text. */
  bindingDocLabel?: string;
  /** Absolute or localized URL of the binding document (notice link + redirect target). */
  bindingUrl: string;
  /** Inject the mandatory language-notice banner. */
  showNotice: boolean;
  /** Render the persistent "unofficial translation" indicator. */
  showIndicator: boolean;
  /**
   * When set, this locale is `disabled` and the route should redirect to the
   * binding-language document instead of serving the untrusted translation.
   */
  redirectTo?: string;
}

function normalizeStatus(value: unknown): TranslationStatus | undefined {
  return TRANSLATION_STATUSES.includes(value as TranslationStatus)
    ? (value as TranslationStatus)
    : undefined;
}

/**
 * Resolve the binding-language decision for one render.
 *
 * Returns `null` when the page declares no `translation.binding` (i.e. it is not a
 * legal page under policy) — callers then render normally with no notice.
 *
 * @param resolveBindingUrl Callback that maps (bindingPageId, bindingLang) to the
 *        binding document's URL. Injected so this module stays free of the route
 *        registry / content dependencies.
 */
export function resolveTranslationContext(args: {
  lang: string;
  pageId: string;
  policy: PageTranslationPolicy | undefined | null;
  resolveBindingUrl: (bindingPageId: string, bindingLang: string) => string | null;
}): ResolvedTranslationContext | null {
  const { lang, pageId, policy, resolveBindingUrl } = args;
  if (!policy || typeof policy.binding !== "string" || policy.binding.length === 0) {
    return null;
  }

  const bindingLang = policy.binding;
  const bindingPageId = policy.bindingPageId ?? pageId;
  const isBinding = lang === bindingLang;

  // The binding-language render is the authoritative text — never gets a notice.
  const status: TranslationStatus = isBinding
    ? "official"
    : (normalizeStatus(policy.locales?.[lang]) ?? "unofficial");

  const bindingUrl = resolveBindingUrl(bindingPageId, bindingLang) ?? "";
  const noticeEnabled = policy.notice !== false;
  const indicatorEnabled = policy.indicator !== false;

  const showNotice = !isBinding && status === "unofficial" && noticeEnabled;
  const showIndicator = !isBinding && status === "unofficial" && indicatorEnabled;
  const redirectTo = !isBinding && status === "disabled" ? bindingUrl : undefined;

  return {
    isBinding,
    status,
    bindingLang,
    bindingDocLabel: policy.bindingDocLabel,
    bindingUrl,
    showNotice,
    showIndicator,
    ...(redirectTo ? { redirectTo } : {}),
  };
}
