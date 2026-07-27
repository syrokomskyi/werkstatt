/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/semantic/jsonld/person.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not validate person attributes.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added Person JSON-LD generation for organization members.</item>
  <item>Moved from app semantic/jsonld/person to packages/share.</item>
  <item>RFC-0512: emit address, knowsAbout, affiliation when present on SemanticPerson.</item>
</CHANGE_SUMMARY>
*/

import type { JsonLdContext } from "./context.ts";
import type { SemanticPerson } from "../models.ts";
import type { JsonLdNode } from "./types.ts";

function buildPersonNode(context: JsonLdContext, person: SemanticPerson): JsonLdNode {
  const { ids } = context;

  return {
    "@type": "Person",
    "@id": ids.person(person.name),
    name: person.name,
    ...(person.role ? { jobTitle: person.role } : {}),
    ...(person.description ? { description: person.description } : {}),
    // RFC-0200: lifespan, portrait, social grounding, and the profile-page URL.
    ...(person.birthDate ? { birthDate: person.birthDate } : {}),
    ...(person.deathDate ? { deathDate: person.deathDate } : {}),
    ...(person.image ? { image: person.image } : {}),
    ...(person.sameAs?.length ? { sameAs: person.sameAs } : {}),
    ...(person.profileUrl ? { url: person.profileUrl } : {}),
    // RFC-0512: extended Person fields for team profile pages.
    ...(person.address
      ? {
          address: {
            "@type": "PostalAddress",
            addressLocality: person.address.addressLocality,
            ...(person.address.addressRegion
              ? { addressRegion: person.address.addressRegion }
              : {}),
            addressCountry: person.address.addressCountry,
          },
        }
      : {}),
    ...(person.knowsAbout?.length ? { knowsAbout: person.knowsAbout } : {}),
    ...(person.affiliation
      ? {
          affiliation: {
            "@type": "Organization",
            name: person.affiliation.name,
            ...(person.affiliation.url ? { url: person.affiliation.url } : {}),
          },
        }
      : {}),
    worksFor: { "@id": ids.organization },
  };
}

export function buildPersonNodes(context: JsonLdContext): JsonLdNode[] {
  const people = [
    ...(context.page.organization.founders ?? []),
    ...(context.page.organization.boardMembers ?? []),
    ...(context.page.people ?? []),
  ];

  const uniquePeople = Array.from(new Map(people.map((person) => [person.name, person])).values());

  return uniquePeople.map((person) => buildPersonNode(context, person));
}
