/*
<MODULE_CONTRACT>
<purpose>RFC-0148: the single, framework-agnostic organization-profile assembler. The mapping from business-schema fields to SemanticOrganization lives here once; the disk llms path and the Astro JSON-LD path both resolve their own data (each reads + substitutes content references in its own way) and delegate the assembly here. Replaces the two duplicated org builders (no legacy).</purpose>
<non-goals>
  <item>Do not read files or substitute content references — callers pass resolved values.</item>
  <item>Do not iterate pages — this builds the site-wide profile only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0148: extracted the shared org-profile assembler from the disk + Astro builders.</item>
</CHANGE_SUMMARY>
*/

import { getBaseUrl, toAbsoluteUrl } from "./ids.ts";
import type {
  SemanticInitiative,
  SemanticLocation,
  SemanticOffer,
  SemanticOrganization,
  SemanticPerson,
  SemanticService,
} from "./models.ts";

export type SemanticSiteProfile = {
  organization: SemanticOrganization;
  people: SemanticPerson[];
  initiatives: SemanticInitiative[];
};

/** Resolved owner address primitives (content references already substituted). */
export interface ProfileAddressInput {
  street?: string;
  streetNumber?: string;
  zip?: string;
  city?: string;
  country?: string;
}

/** Resolved bank primitives (accountHolder already substituted). */
export interface ProfileBankInput {
  accountHolder?: string;
  iban?: string;
  bic?: string;
  bankName?: string;
  konto?: string;
  blz?: string;
}

/**
 * Normalized, fully-resolved business primitives. Each caller (disk fs reader,
 * Astro content-layer reader) maps its source into this shape — including any
 * RFC-0045 content-reference substitution — so the assembly below is identical
 * regardless of source.
 */
export interface OrganizationProfileInput {
  lang: string;
  siteUrl: URL | string;
  /** Resolved brand name. */
  brandName: string;
  description: string;
  foundingYear?: string;
  areaServed?: string[];
  founders: SemanticPerson[];
  boardMembers: SemanticPerson[];
  legalName?: string;
  registration?: string;
  representativeName?: string;
  address?: ProfileAddressInput;
  /** Present when a bank block exists (drives donationAccount emission). */
  bank?: ProfileBankInput;
  email?: string;
  contactType?: string;
  offer?: SemanticOffer;
  location?: SemanticLocation;
  team?: SemanticPerson[];
  /* RFC-0163: social/profile URLs → Organization.sameAs. */
  sameAs?: string[];
  /* RFC-0163: absolute logo URL → Organization.logo. */
  logoUrl?: string;
  /** RFC-0373: projected business service catalog. */
  services?: SemanticService[];
  /** RFC-0242: explicit schema.org @type override (e.g. Bodenstation → Organization/ProfessionalService). */
  schemaType?: string[];
}

/** RFC-0148: assemble the site profile from resolved business primitives. */
export function buildOrganizationProfile(input: OrganizationProfileInput): SemanticSiteProfile {
  const baseUrl = getBaseUrl(input.siteUrl);
  // Use the full team when available (includes founders, board, team, patron, etc.),
  // otherwise fall back to founders + boardMembers. Deduplicate by name.
  const rawPeople = input.team?.length
    ? [...input.team]
    : [...input.founders, ...input.boardMembers];
  const seen = new Set<string>();
  const people: SemanticPerson[] = [];
  for (const p of rawPeople) {
    if (!seen.has(p.name)) {
      seen.add(p.name);
      people.push(p);
    }
  }

  const organization: SemanticOrganization = {
    name: input.brandName,
    legalName: input.legalName,
    description: input.description,
    url: toAbsoluteUrl(baseUrl, `/${input.lang}/`),
    foundingYear: input.foundingYear,
    email: input.email,
    registration: input.registration,
    representative: input.representativeName,
    ...(input.address
      ? {
          address: {
            streetAddress: `${input.address.street} ${input.address.streetNumber}`,
            postalCode: input.address.zip,
            addressLocality: input.address.city,
            addressCountry: input.address.country,
          },
        }
      : {}),
    ...(input.areaServed?.length ? { areaServed: input.areaServed } : {}),
    ...(input.founders.length ? { founders: input.founders } : {}),
    ...(input.boardMembers.length ? { boardMembers: input.boardMembers } : {}),
    ...(input.contactType || input.email
      ? {
          contactPoints: [
            {
              contactType: input.contactType ?? "",
              email: input.email,
            },
          ],
        }
      : {}),
    ...(input.bank
      ? {
          donationAccount: {
            accountHolder: input.bank.accountHolder ?? "",
            iban: input.bank.iban,
            bic: input.bank.bic,
            bankName: input.bank.bankName,
            accountNumber: input.bank.konto,
            bankCode: input.bank.blz,
          },
        }
      : {}),
    ...(input.offer ? { offer: input.offer } : {}),
    ...(input.location ? { location: input.location } : {}),
    ...(input.team?.length ? { team: input.team } : {}),
    // RFC-0163: entity-grounding signals. `image` always points at the guaranteed
    // /og-image.png fallback (a real, present asset); sameAs/logo emit only when authored.
    image: toAbsoluteUrl(baseUrl, "/og-image.png"),
    ...(input.sameAs?.length ? { sameAs: input.sameAs } : {}),
    ...(input.logoUrl ? { logo: input.logoUrl } : {}),
    ...(input.schemaType?.length ? { schemaType: input.schemaType } : {}),
    ...(input.services?.length ? { services: input.services } : {}),
  };

  return { organization, people, initiatives: [] };
}
