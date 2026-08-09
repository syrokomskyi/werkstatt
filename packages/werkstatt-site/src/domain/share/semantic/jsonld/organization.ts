/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/semantic/jsonld/organization.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not validate input context.</item>
  <item>Do not fetch external data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added Organization JSON-LD generation.</item>
</CHANGE_SUMMARY>
*/

import type { JsonLdContext } from "./context.ts";
import type { JsonLdNode } from "./types.ts";

export function buildOrganizationNode(context: JsonLdContext): JsonLdNode {
  const { page, ids } = context;

  return {
    // RFC-0242: a Bodenstation studio deployment overrides this to ["Organization", "ProfessionalService"].
    "@type": page.organization.schemaType ?? ["Organization", "NGO"],
    "@id": ids.organization,
    name: page.organization.name,
    legalName: page.organization.legalName,
    description: page.organization.description,
    url: page.organization.url,
    email: page.organization.email,
    ...(page.organization.foundingYear ? { foundingDate: page.organization.foundingYear } : {}),
    ...(page.organization.registration ? { identifier: page.organization.registration } : {}),
    ...(page.organization.founders?.length
      ? {
          founder: page.organization.founders.map((person) => ({
            "@id": ids.person(person.name),
          })),
        }
      : {}),
    ...(page.organization.boardMembers?.length
      ? {
          member: page.organization.boardMembers.map((person) => ({
            "@id": ids.person(person.name),
          })),
        }
      : {}),
    ...(page.organization.contactPoints?.length
      ? {
          contactPoint: page.organization.contactPoints.map((contactPoint) => ({
            "@type": "ContactPoint",
            contactType: contactPoint.contactType,
            email: contactPoint.email,
          })),
        }
      : {}),
    ...(page.organization.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: page.organization.address.streetAddress,
            postalCode: page.organization.address.postalCode,
            addressLocality: page.organization.address.addressLocality,
            addressCountry: page.organization.address.addressCountry,
          },
        }
      : {}),
    ...(page.organization.areaServed?.length ? { areaServed: page.organization.areaServed } : {}),
    ...(page.organization.location?.serviceArea?.length && !page.organization.areaServed?.length
      ? { areaServed: page.organization.location.serviceArea }
      : {}),
    ...(page.organization.team?.length
      ? {
          // RFC-0148: public team members as schema.org employees.
          employee: page.organization.team.map((member) => ({
            "@type": "Person",
            name: member.name,
            ...(member.description ? { description: member.description } : {}),
          })),
        }
      : {}),
    ...(page.organization.offer?.prices?.length
      ? {
          // RFC-0147: project the canonical offer as schema.org Offer nodes.
          // RFC-0745: emit priceCurrency from canonical source currency when available.
          makesOffer: page.organization.offer.prices.map((price) => ({
            "@type": "Offer",
            name: price.label,
            priceSpecification: {
              "@type": "PriceSpecification",
              price: price.amount,
            },
            ...(price.currency ? { priceCurrency: price.currency } : {}),
          })),
        }
      : {}),
    // RFC-0163: entity-grounding signals for Google Knowledge Graph + LLM disambiguation.
    ...(page.organization.sameAs?.length ? { sameAs: page.organization.sameAs } : {}),
    ...(page.organization.logo
      ? { logo: { "@type": "ImageObject", url: page.organization.logo } }
      : {}),
    ...(page.organization.image ? { image: page.organization.image } : {}),
  };
}
