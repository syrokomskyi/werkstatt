/*
<MODULE_CONTRACT>
<purpose>Applies security attributes to external anchor elements on the page.</purpose>
<non-goals>
  <item>Do not handle internal navigation or routing.</item>
  <item>Do not modify non-HTTP links (mailto:, tel:, etc.).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0011 Phase 2: Extracted from layout.astro inline script into src/scripts canonical pattern.</item>
  <item>Migrated to @gogol/share/scripts for platform-wide reuse.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: This function must only modify external HTTP/HTTPS links. Never touch mailto:, tel:, or internal links.
export function applyExternalLinkBehavior(): void {
  const anchors = document.querySelectorAll("a[href]");

  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");

    if (!href) {
      continue;
    }

    let resolvedUrl;

    try {
      resolvedUrl = new URL(href, window.location.href);
    } catch {
      continue;
    }

    const isHttpLink = resolvedUrl.protocol === "http:" || resolvedUrl.protocol === "https:";
    const isExternalLink = isHttpLink && resolvedUrl.origin !== window.location.origin;

    if (!isExternalLink) {
      continue;
    }

    anchor.setAttribute("data-external-link", "1");
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  }
}
