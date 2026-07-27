/*
<MODULE_CONTRACT>
<purpose>
RFC-0200: closed affiliation vocabulary for Person records. Used by the People
section check in @warpgogol/site-kernel-checks to validate person affiliations.
This is a closed vocabulary used by check infrastructure, not PBP entity code.
</purpose>
<non-goals>
  <item>Do not export the full personSchema — person records now live in a standalone `people` content collection (RFC-0471).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0470: moved PERSON_AFFILIATIONS from @warpgogol/business/schemas/person.ts to @warpgogol/share/schemas/person.ts.</item>
  <item>RFC-0471: @warpgogol/business package deleted. Person records now live in a standalone `people` content collection.</item>
</CHANGE_SUMMARY>
*/

/**
 * Closed affiliation vocabulary. `founder` → Organization.founder, `board` →
 * Organization.member (governance), `team`/`patron`/`author` are presentational
 * roles shown in the People section but not governance JSON-LD.
 */
export const PERSON_AFFILIATIONS = ["founder", "board", "team", "patron", "author"] as const;
export type PersonAffiliation = (typeof PERSON_AFFILIATIONS)[number];
