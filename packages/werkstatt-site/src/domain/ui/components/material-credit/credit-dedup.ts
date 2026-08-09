/*
<MODULE_CONTRACT>
<purpose>
  RFC-0227 per-page material-credit JSON-LD dedup. A single credited asset may be
  surfaced more than once on a page (e.g. a baked Programmatic Surface hero and a
  section both rendering the same image), but the page graph must carry exactly one
  JSON-LD node per @id. This module is the build-lifetime singleton that lets the
  shared <MaterialCredit> component emit a given (page, @id) node only once while
  still rendering every visible disclosure.
</purpose>
<non-goals>
  <item>Do not decide visibility — the component always renders the visible disclosure.</item>
  <item>Do not build the node — callers pass the already-resolved @id.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0227: initial per-page credit-node dedup so jsonld.parity sees one node per @id.</item>
</CHANGE_SUMMARY>
*/

/** pageKey → set of credit @ids already emitted as a JSON-LD script for that page. */
const emittedByPage = new Map<string, Set<string>>();

/**
 * RFC-0227: claim the JSON-LD node for `atId` on `pageKey`. Returns true the first
 * time the pair is seen (the caller should emit the <script>), false on every
 * subsequent occurrence (a duplicate disclosure of the same asset on the same page).
 * Scoping by `pageKey` keeps the dedup per-page across the whole build.
 */
export function claimCreditNode(pageKey: string, atId: string): boolean {
  let seen = emittedByPage.get(pageKey);
  if (!seen) {
    seen = new Set<string>();
    emittedByPage.set(pageKey, seen);
  }
  if (seen.has(atId)) return false;
  seen.add(atId);
  return true;
}
