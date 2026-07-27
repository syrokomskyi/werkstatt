/*
<MODULE_CONTRACT>
<purpose>PBP semantic profile adapter — maps PBP compiler output to SemanticSiteProfile (RFC-0469).</purpose>
<non-goals>
  <item>Does not define SemanticSiteProfile — that lives in @gogol/share/semantic.</item>
  <item>Does not implement the compiler — delegates to @gogol/pbp/compiler.</item>
  <item>Does not handle page-level semantic models — use buildPbpPageSemanticModel instead.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0469 — PBP semantic profile adapter for webgogol-com cutover.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildOrganizationProfile, type SemanticSiteProfile } from "@gogol/share/semantic";
import { compilePbpProfile } from "./compiler/index.js";
import type { PbpCompilerResult } from "./compiler/types.js";

function resolveSourceDirectory(sourceDirectory: string): string {
  if (existsSync(sourceDirectory)) return sourceDirectory;
  const fallback = join(process.cwd(), "src/content/business-profile");
  if (existsSync(fallback)) return fallback;
  return sourceDirectory;
}

// RFC-0470: buildPageSemanticModel is local to @gogol/pbp.
// Sites import it from @gogol/pbp/semantic-profile.
export { buildPageSemanticModel } from "./semantic-model.ts";
export { buildPageSemanticModel as buildPbpPageSemanticModel } from "./semantic-model.ts";

export type { SemanticSiteProfile };

export async function buildPbpSemanticProfile(
  locale: string,
  siteUrl: URL | string,
  sourceDirectory: string,
): Promise<SemanticSiteProfile> {
  const resolvedDirectory = resolveSourceDirectory(sourceDirectory);

  const result = await compilePbpProfile({
    sourceDirectory: resolvedDirectory,
    locale,
    defaultLocale: "de",
    strictness: "production",
  });

  return projectToSemanticSiteProfile(result, siteUrl);
}

export function projectToSemanticSiteProfile(
  result: PbpCompilerResult,
  siteUrl: URL | string,
): SemanticSiteProfile {
  const graph = result.resolvedGraph;
  const business = graph.business as unknown as Record<string, unknown>;
  const businessName = (business.name as string) ?? "";
  const description = (business.description as string) ?? (business.summary as string) ?? "";
  const foundingYear = business.yearEstablished ? String(business.yearEstablished) : undefined;

  const legalIdentity = graph.legalIdentity as unknown as Record<string, unknown> | undefined;
  const legalName = legalIdentity?.legalName as string | undefined;
  const responsiblePerson = legalIdentity?.responsiblePerson as Record<string, unknown> | undefined;
  const representativeName = responsiblePerson?.name as string | undefined;

  const place = Object.values(graph.places)[0] as unknown as Record<string, unknown> | undefined;
  const address = place?.address as Record<string, unknown> | undefined;

  const contactPoint = Object.values(graph.contactPoints)[0] as unknown as
    Record<string, unknown> | undefined;
  const email = contactPoint?.value as string | undefined;
  const contactType = contactPoint?.channel as string | undefined;

  // RFC-0530: Extract externalIdentifiers from Business and convert to sameAs URLs.
  const businessExternalIds = (business.externalIdentifiers ?? {}) as Record<
    string,
    { schemeRef: string; value: string }
  >;
  const businessSameAs = Object.values(businessExternalIds).map(
    (id) => `${id.schemeRef}${id.value}`,
  );

  // RFC-0530: Extract sameAs from social-profile WebPresence entities.
  const webPresenceSameAs = Object.values(graph.webPresences)
    .filter((wp) => (wp as unknown as Record<string, unknown>).kind === "social-profile")
    .flatMap(
      (wp) => ((wp as unknown as Record<string, unknown>).sameAs as string[] | undefined) ?? [],
    );

  const sameAs = [...businessSameAs, ...webPresenceSameAs];

  const offerings = Object.values(graph.offerings).sort((a, b) => {
    const aPricing = (a as unknown as Record<string, unknown>).pricing as
      Record<string, unknown> | undefined;
    const bPricing = (b as unknown as Record<string, unknown>).pricing as
      Record<string, unknown> | undefined;
    const aCharges = Object.keys((aPricing?.charges as Record<string, unknown>) || {}).length;
    const bCharges = Object.keys((bPricing?.charges as Record<string, unknown>) || {}).length;
    if (bCharges !== aCharges) return bCharges - aCharges;
    return a.id.localeCompare(b.id);
  });
  const firstOffering = offerings[0] as unknown as Record<string, unknown> | undefined;
  const pricing = firstOffering?.pricing as Record<string, unknown> | undefined;
  const charges = pricing?.charges as Record<string, unknown> | undefined;

  const monthlyCharge = charges?.monthlySubscription as Record<string, unknown> | undefined;
  const monthlyAmount = (monthlyCharge?.amount as Record<string, unknown>)?.value as
    string | undefined;
  const yearlyCharge = charges?.yearlySubscription as Record<string, unknown> | undefined;
  const yearlyAmount = (yearlyCharge?.amount as Record<string, unknown>)?.value as
    string | undefined;
  const setupCharge = charges?.activation as Record<string, unknown> | undefined;
  const setupAmount = (setupCharge?.amount as Record<string, unknown>)?.value as string | undefined;
  const currency = pricing?.currency as string | undefined;

  const offer = firstOffering
    ? {
        prices: [
          ...(monthlyAmount
            ? [
                {
                  id: "monthly",
                  label: "Monatlich",
                  amount: `${monthlyAmount} ${currency ?? "EUR"}`,
                },
              ]
            : []),
          ...(yearlyAmount
            ? [
                {
                  id: "yearly",
                  label: "Jährlich",
                  amount: `${yearlyAmount} ${currency ?? "EUR"}`,
                },
              ]
            : []),
          ...(setupAmount
            ? [
                {
                  id: "setup",
                  label: "Setup",
                  amount: `${setupAmount} ${currency ?? "EUR"}`,
                },
              ]
            : []),
        ],
      }
    : undefined;

  return buildOrganizationProfile({
    lang: result.context.locale,
    siteUrl,
    brandName: businessName,
    description,
    foundingYear,
    founders: [],
    boardMembers: [],
    legalName,
    representativeName,
    ...(address
      ? {
          address: {
            street: address.street as string | undefined,
            streetNumber: address.streetNumber as string | undefined,
            zip: address.postalCode as string | undefined,
            city: address.locality as string | undefined,
            country: address.countryCode as string | undefined,
          },
        }
      : {}),
    email,
    contactType,
    ...(offer ? { offer: offer as unknown as SemanticSiteProfile["organization"]["offer"] } : {}),
    schemaType: ["Organization", "ProfessionalService"],
    ...(sameAs.length ? { sameAs } : {}),
  });
}
