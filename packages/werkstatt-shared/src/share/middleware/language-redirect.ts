/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/middleware/language-redirect.ts as an authored share middleware module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
<!-- @ai-invariant Generated factory output (RFC-0055) flows through system.md i18n config; do not hand-edit app copies. -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import { defineMiddleware } from "astro:middleware";

/**
 * Factory for language routing middleware.
 *
 * [RFC-0160] The default language is served WITHOUT a URL prefix (`/`,
 * `/<slug>`), and only non-default languages are prefixed (`/<lang>/…`).
 * Therefore unprefixed paths ARE default-language content and MUST NOT be
 * rewritten to `/<defaultLang>/…`. Client-side language detection for the
 * default audience happens exclusively at `/` (see the root entry page's
 * soft redirect, RFC-0159).
 *
 * This middleware also issues a 308 redirect when the default language is
 * accessed with its old prefixed URL (`/<defaultLang>/…`), so bookmarks and
 * search results do not 404. In static-output production this is handled by
 * the `_redirects` file; the middleware covers dev mode and SSR routes.
 */
export function createLanguageRedirectMiddleware(options: {
  supportedLangs: readonly string[];
  defaultLang: string;
}) {
  return defineMiddleware((ctx: any, next: any) => {
    const url = new URL(ctx.request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const firstSegment = segments[0];

    // Redirect /<defaultLang>/<rest> → /<rest> with a 308 Permanent Redirect.
    if (firstSegment === options.defaultLang) {
      const rest = segments.slice(1).join("/");
      const target = "/" + (rest ? rest + url.search : url.search);
      return ctx.redirect(target, 308);
    }

    return next();
  });
}
