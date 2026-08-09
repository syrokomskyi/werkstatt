/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/semantic/llms.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not parse raw content or validate input models.</item>
  <item>Do not manage external data fetching.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added full llms.txt generation and optional title-aware page labels.</item>
  <item>RFC-0184: canonical Markdown links, blockquoted summary, absolute URLs, llms-full.txt reference, and empty-section filtering.</item>
  <item>RFC-0372: formatBlocks reads from unified page.blocks instead of answerBlocks + contentBlocks.</item>
</CHANGE_SUMMARY>
*/

import { toPathname } from "./ids.ts";
import {
  canonicalizeGeneratedMarkdownText,
  formatGeneratedMarkdownListItem,
  normalizeGeneratedMarkdownText,
} from "./markdown-hygiene.ts";
import { canonicalStaticUrl } from "../astro/canonical-url.ts";
import type { SemanticLlmsDepth, SemanticPageModel, SemanticSiteModel } from "./models.ts";

/** RFC-0142: effective llms depth for a page. Defaults to `full` when unresolved. */
function pageDepth(page: SemanticPageModel): SemanticLlmsDepth {
  return page.output?.llms?.depth ?? "full";
}

/** RFC-0142: pages that contribute a row to the llms.txt index. */
function inIndex(page: SemanticPageModel): boolean {
  return pageDepth(page) !== "exclude";
}

/** RFC-0142: pages that contribute a body section to llms-full.txt. */
function inFull(page: SemanticPageModel): boolean {
  const depth = pageDepth(page);
  return depth === "full" || depth === "summary";
}

function pageLabel(page: SemanticPageModel): string {
  return page.heading ?? page.title;
}

function pageSummary(page: SemanticPageModel): string {
  return canonicalizePageText(page, page.lead ?? page.description);
}

function canonicalizePageText(page: SemanticPageModel, text: string | undefined): string {
  return canonicalizeGeneratedMarkdownText(text, {
    baseUrl: page.url ? new URL(page.url).origin : undefined,
    defaultLanguage: page.defaultLanguage,
  });
}

function formatBlocks(page: SemanticPageModel): string {
  const excludeIds = new Set(page.output?.llms?.sections?.exclude ?? []);
  return page.blocks
    .filter((block) => block.heading && !excludeIds.has(block.id))
    .filter((block) => block.summary || block.body || block.facts?.length || block.items?.length)
    .map((block) => {
      const parts = [`### ${block.heading}`];
      if (block.summary) {
        parts.push(canonicalizePageText(page, block.summary));
      }
      if (block.body) {
        parts.push(canonicalizePageText(page, block.body));
      }
      if (block.facts?.length) {
        parts.push(
          ...block.facts.flatMap((fact) =>
            formatGeneratedMarkdownListItem(canonicalizePageText(page, fact)),
          ),
        );
      }
      if (block.items?.length) {
        for (const item of block.items) {
          const desc = item.description ? `: ${item.description}` : "";
          parts.push(`- ${item.title}${desc}`);
        }
      }
      return parts.join("\n\n");
    })
    .join("\n\n");
}

function formatPeople(page: SemanticPageModel): string {
  if (!page.people?.length) {
    return "";
  }

  return [
    "### People",
    ...page.people.map((person) => {
      const details = [person.role, person.description].filter(Boolean).join(" — ");
      return details ? `- ${person.name}: ${details}` : `- ${person.name}`;
    }),
  ].join("\n");
}

function formatInitiatives(page: SemanticPageModel): string {
  if (!page.initiatives?.length) {
    return "";
  }

  return [
    "### Initiatives",
    ...page.initiatives.map((initiative) => {
      const facts = initiative.facts?.length ? ` (${initiative.facts.join("; ")})` : "";
      return `- ${initiative.name}: ${initiative.summary}${facts}`;
    }),
  ].join("\n");
}

function formatOrganizationFacts(site: SemanticSiteModel): string[] {
  return [
    `- Name: ${site.organization.legalName ?? site.organization.name}`,
    ...(site.organization.foundingYear ? [`- Founded: ${site.organization.foundingYear}`] : []),
    ...(site.organization.registration
      ? [`- Registration: ${site.organization.registration}`]
      : []),
    ...(site.organization.representative
      ? [`- Representative: ${site.organization.representative}`]
      : []),
    ...(site.organization.email ? [`- Email: ${site.organization.email}`] : []),
    ...(site.organization.areaServed?.length
      ? [`- Areas served: ${site.organization.areaServed.join("; ")}`]
      : []),
    ...(site.organization.address
      ? [
          `- Address: ${[
            site.organization.address.streetAddress,
            site.organization.address.postalCode,
            site.organization.address.addressLocality,
            site.organization.address.addressCountry,
          ]
            .filter(Boolean)
            .join(", ")}`,
        ]
      : []),
    ...(site.organization.founders?.length
      ? [`- Founders: ${site.organization.founders.map((person) => person.name).join("; ")}`]
      : []),
    ...(site.organization.boardMembers?.length
      ? [
          `- Board: ${site.organization.boardMembers
            .map((person) => (person.role ? `${person.role} — ${person.name}` : person.name))
            .join("; ")}`,
        ]
      : []),
    ...(site.organization.contactPoints?.length
      ? [
          `- Contact points: ${site.organization.contactPoints
            .map((contactPoint) =>
              [contactPoint.contactType, contactPoint.email].filter(Boolean).join(" — "),
            )
            .join("; ")}`,
        ]
      : []),
    ...(site.organization.donationAccount
      ? (() => {
          const { accountHolder, bankName, iban, bic } = site.organization.donationAccount;
          const hasReal = (v: string | undefined) =>
            typeof v === "string" && v.length > 0 && !v.startsWith("NEED_THIS_");
          if (!hasReal(iban) || !hasReal(bic)) {
            return [];
          }
          const parts = [accountHolder, bankName, iban, bic].filter(hasReal);
          return [`- Donation account: ${parts.join("; ")}`];
        })()
      : []),
  ];
}

/** RFC-0147: render the projected offer (prices + written guarantees + growth modules + terms). */
function formatOffer(site: SemanticSiteModel): string[] {
  const offer = site.organization.offer;
  if (
    !offer ||
    (!offer.prices?.length &&
      !offer.guarantees?.length &&
      !offer.growthModules?.length &&
      !offer.changePrice &&
      !offer.hourlyRate &&
      !offer.billingDay)
  ) {
    return [];
  }
  const lines: string[] = ["## Offer"];
  if (offer.prices?.length) {
    lines.push(...offer.prices.map((price) => `- ${price.label}: ${price.amount}`));
  }
  if (offer.changePrice || offer.hourlyRate || offer.billingDay) {
    const terms: string[] = [];
    if (offer.changePrice) terms.push(`- Change price: ${offer.changePrice} EUR per change`);
    if (offer.hourlyRate) terms.push(`- Hourly rate: ${offer.hourlyRate} EUR per hour`);
    if (offer.billingDay) terms.push(`- Billing day: ${offer.billingDay}`);
    lines.push("", "### Terms", ...terms);
  }
  if (offer.guarantees?.length) {
    lines.push("", "### Guarantees");
    lines.push(
      ...offer.guarantees.map((g) => (g.detail ? `- ${g.label}: ${g.detail}` : `- ${g.label}`)),
    );
  }
  if (offer.growthModules?.length) {
    lines.push("", "### Growth modules");
    lines.push(
      ...offer.growthModules.map((m) => {
        const desc = m.description
          ? `: ${normalizeGeneratedMarkdownText(m.description).replace(/\n+/g, " ")}`
          : "";
        const price = m.price
          ? ` (${normalizeGeneratedMarkdownText(m.price).replace(/\n+/g, " ")})`
          : "";
        return `- ${m.label}${desc}${price}`;
      }),
    );
  }
  if (offer.capacity) {
    lines.push(
      "",
      "### Capacity policy",
      `- Wave cadence: ${offer.capacity.cadence}`,
      `- Starts at: ${offer.capacity.startsAt}`,
      `- Timezone: ${offer.capacity.timezone}`,
      `- Slot range: ${offer.capacity.slotRange.min}-${offer.capacity.slotRange.max}`,
      `- Max slots per wave: ${offer.capacity.maxSlotsPerWave}`,
      `- Availability status: ${offer.capacity.availabilityStatus}`,
    );
  }
  lines.push("");
  return lines;
}

/** RFC-0373: render the projected business service catalog. */
function formatServices(site: SemanticSiteModel): string[] {
  const services = site.organization.services;
  if (!services?.length) return [];
  const lines: string[] = ["## Services"];
  for (const service of services) {
    const desc = service.description ? `: ${service.description}` : "";
    lines.push(`- ${service.name}${desc}`);
  }
  lines.push("");
  return lines;
}

/** RFC-0148: render the projected location (NAP + service area). */
function formatLocation(site: SemanticSiteModel): string[] {
  const location = site.organization.location;
  if (!location) return [];
  const facts = [
    ...(location.locality ? [`- Locality: ${location.locality}`] : []),
    ...(location.region ? [`- Region: ${location.region}`] : []),
    ...(location.country ? [`- Country: ${location.country}`] : []),
    ...(location.serviceArea?.length ? [`- Service area: ${location.serviceArea.join("; ")}`] : []),
  ];
  if (facts.length === 0) return [];
  return ["## Location", ...facts, ""];
}

/** RFC-0148: render the projected public team (name, role, bio). */
function formatTeam(site: SemanticSiteModel): string[] {
  const team = site.organization.team;
  if (!team?.length) return [];
  const lines: string[] = ["## Team"];
  for (const member of team) {
    const role = member.role ? ` (${member.role})` : "";
    const bio = member.description
      ? `: ${member.description.replace(/\s*\n\s*/g, " ").trim()}`
      : "";
    lines.push(`- ${member.name}${role}${bio}`);
  }
  lines.push("");
  return lines;
}

function toAbsoluteUrl(site: SemanticSiteModel, pathname: string): string {
  const rawBase = site.organization.url ?? site.baseUrl;
  const base = (() => {
    try {
      return new URL(rawBase).origin;
    } catch {
      return rawBase.replace(/\/$/, "");
    }
  })();
  const defaultLang = site.defaultLanguage ?? "de";
  const normalizedPathname =
    site.lang === defaultLang
      ? pathname.replace(new RegExp(`^/${defaultLang}(?=/|$)`), "") || "/"
      : pathname;
  // RFC-0317: ensure trailing slash to match canonicalPageUrl output.
  const withTrailingSlash =
    normalizedPathname === "/" ? "/" : normalizedPathname.replace(/\/?$/, "/");
  return `${base}${withTrailingSlash}`;
}

/** RFC-0184: Format a Markdown link row for llms.txt. */
function formatMarkdownLinkRow(site: SemanticSiteModel, page: SemanticPageModel): string {
  const title = pageLabel(page);
  const url = toAbsoluteUrl(site, toPathname(page.url));
  const summary = pageSummary(page);
  return `- [${title}](${url}): ${summary}`;
}

export function buildLlmsIndex(site: SemanticSiteModel): string {
  const indexPages = site.pages.filter(inIndex);
  const llmsFullUrl = canonicalStaticUrl("/llms-full.txt", { baseUrl: site.baseUrl });
  const siteDescription = site.organization.description ?? "";

  // RFC-0789: agent discovery links — omitted when agent.enabled is false.
  const agentEnabled = site.agent?.enabled !== false;
  const agentLinks = agentEnabled
    ? [
        `> Machine-readable Agent Surface (structured knowledge + capabilities): [agent.json](${canonicalStaticUrl("/.well-known/agent.json", { baseUrl: site.baseUrl })}).`,
        `> API discovery catalog (RFC 9727): [api-catalog](${canonicalStaticUrl("/.well-known/api-catalog", { baseUrl: site.baseUrl })}).`,
        `> MCP Server Card (SEP-1649): [server-card.json](${canonicalStaticUrl("/.well-known/mcp/server-card.json", { baseUrl: site.baseUrl })}).`,
        `> OpenAPI 3.1 specification: [agent.openapi.json](${canonicalStaticUrl("/.well-known/agent.openapi.json", { baseUrl: site.baseUrl })}).`,
      ]
    : [];

  // RFC-0184: canonical Markdown link rows with absolute URLs
  const primarySources = indexPages.map((page) => formatMarkdownLinkRow(site, page));

  return [
    `# ${site.organization.name}`,
    // RFC-0184: blockquoted site description with llms-full.txt reference
    ...(siteDescription ? [`> ${siteDescription}`] : []),
    `> For complete documentation in a single file, see [llms-full.txt](${llmsFullUrl}).`,
    ...agentLinks,
    "",
    "## Primary sources",
    ...primarySources,
    "",
    "## Organization",
    ...formatOrganizationFacts(site),
  ].join("\n");
}

export function buildLlmsFull(site: SemanticSiteModel): string {
  const pages = site.pages
    .filter(inFull)
    .map((page) => {
      // RFC-0184: absolute URL in the header
      const header = [
        `## ${pageLabel(page)}`,
        `URL: ${toAbsoluteUrl(site, toPathname(page.url))}`,
        `Description: ${canonicalizePageText(page, page.description)}`,
        ...(page.lead ? [`Lead: ${canonicalizePageText(page, page.lead)}`] : []),
      ];

      // RFC-0142: `summary` depth emits only the page header (description / lead),
      // skipping the answer-block dump and entity sections.
      if (pageDepth(page) === "summary") {
        return header.join("\n");
      }

      // RFC-0184: filter empty body sections to avoid blank placeholder gaps
      const bodySections = [formatBlocks(page), formatPeople(page), formatInitiatives(page)].filter(
        (s) => s.length > 0,
      );

      if (bodySections.length === 0) {
        return header.join("\n");
      }

      return [...header, "", ...bodySections].join("\n");
    })
    .join("\n\n");

  // RFC-0184: filter empty organization-level sections
  const orgSections = [
    ...formatOffer(site),
    ...formatServices(site),
    ...formatLocation(site),
    ...formatTeam(site),
  ].filter((s) => s.length > 0);

  return [
    `# ${site.organization.name}`,
    site.organization.description,
    "",
    "## Organization facts",
    ...formatOrganizationFacts(site),
    ...(orgSections.length > 0 ? ["", ...orgSections] : []),
    ...(pages.length > 0 ? ["", pages] : []),
  ].join("\n");
}
