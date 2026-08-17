/*
<MODULE_CONTRACT>
<purpose>Maintains packages/observability/src/redact.ts as an authored observability authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not import node: modules — must be Workers-compatible.</item>
  <item>Do not redact at the collector level — this is a convenience for emitters.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0337: initial implementation.</item>
  <item>Fix 2026-07-11: only trim the URL root slash so redaction is idempotent for multi-slash paths.</item>
</CHANGE_SUMMARY>
*/

export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    const redacted = parsed.toString();
    if (parsed.pathname === "/") return redacted.replace(/\/$/, "");
    return redacted;
  } catch {
    return url;
  }
}
