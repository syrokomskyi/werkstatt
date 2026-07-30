import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>Shared projection logic for agent knowledge — computeKnowledgeEnvelopes and helpers.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted computeKnowledgeEnvelopes from agent-knowledge.ts into agent-knowledge-compute.ts.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import {
  loadSystemManifest,
  loadSemanticSiteModel,
  createNodeFsContentProvider,
  collectMarkdownFiles,
  parseMarkdownFrontmatter,
} from "@warpgogol/site-kernel-content";
import {
  formatAgentKnowledge,
  AGENT_KNOWLEDGE_DOMAINS,
  omitEmptyKnowledgeValues,
  type AgentKnowledgeDomain,
  type AgentKnowledgeEnvelope,
  type AgentKnowledgeFreshness,
} from "@warpgogol/share/agent";
import { projectWeb } from "@warpgogol/share/semantic";
import type { AuthoredFreshnessLedger } from "@warpgogol/share/knowledge";
import { defaultLanguageFromManifest } from "../lib/i18n.ts";

const FRESHNESS_LEDGER_FILE = "src/freshness.generated.yaml";

/** Domain → business file/collection stem, for freshness-subject binding (best-effort). */
const DOMAIN_STEM: Record<AgentKnowledgeDomain, string> = {
  company: "company",
  legal: "legal",
  contact: "contact",
  offer: "offer",
  service: "services",
  location: "location",
  web: "web",
  people: "people",
  trust: "trust",
  faq: "faq",
};

export async function readFaqEntries(
  contentDir: string,
  lang: string,
  defaultLang: string,
): Promise<Array<{ question: string; answer: string; tags?: string[]; serviceSlug?: string }>> {
  let files = await collectMarkdownFiles(join(contentDir, "business", lang, "faq"));
  if (files.length === 0 && lang !== defaultLang) {
    files = await collectMarkdownFiles(join(contentDir, "business", defaultLang, "faq"));
  }
  const entries: Array<{
    question: string;
    answer: string;
    tags?: string[];
    serviceSlug?: string;
  }> = [];
  for (const file of files) {
    const parsed = parseMarkdownFrontmatter(await readFile(file, "utf-8"));
    const data = parsed.data as {
      featureFlag?: boolean;
      question?: string;
      answer?: string;
      tags?: string[];
      serviceSlug?: string;
    };
    if (data.featureFlag) continue;
    entries.push({
      question: data.question ?? "",
      answer: data.answer ?? "",
      ...(data.tags?.length ? { tags: data.tags } : {}),
      ...(data.serviceSlug ? { serviceSlug: data.serviceSlug } : {}),
    });
  }
  return entries;
}

/**
 * Shared projection: for every AGENT_KNOWLEDGE_DOMAINS entry, compute the
 * per-language payload (empty object ⇒ no content ⇒ domain omitted entirely).
 * Reused by both generate (writes) and validate (recomputes for parity, AGK-04).
 */
export async function computeKnowledgeEnvelopes(
  paths: { appDirectory: string; contentDirectory: string },
  siteUrl: string,
): Promise<{ site: string; envelopes: AgentKnowledgeEnvelope[] }> {
  const { manifest } = await loadSystemManifest(paths.contentDirectory);
  const defaultLang = defaultLanguageFromManifest(manifest);
  const i18n = (manifest as { i18n?: { supported?: Record<string, unknown> } }).i18n;
  const supported = Object.keys(i18n?.supported ?? { [defaultLang]: {} });
  const site = String((manifest as { app?: string }).app ?? "site");

  const provider = createNodeFsContentProvider(paths.contentDirectory, defaultLang);

  const perDomain = new Map<AgentKnowledgeDomain, Record<string, unknown>>();
  for (const domain of AGENT_KNOWLEDGE_DOMAINS) perDomain.set(domain, {});

  for (const lang of supported) {
    const model = await loadSemanticSiteModel({
      contentDir: paths.contentDirectory,
      lang,
      siteUrl,
    });
    const org = model.organization;

    const company: Record<string, unknown> = {
      name: org.name,
      ...(org.legalName ? { legalName: org.legalName } : {}),
      description: org.description,
      ...(org.foundingYear ? { foundingYear: org.foundingYear } : {}),
      ...(org.areaServed?.length ? { areaServed: org.areaServed } : {}),
      ...(org.founders?.length ? { founders: org.founders } : {}),
      ...(org.boardMembers?.length ? { boardMembers: org.boardMembers } : {}),
      ...(org.schemaType?.length ? { schemaType: org.schemaType } : {}),
    };
    perDomain.get("company")![lang] = company;

    const legal: Record<string, unknown> = {
      ...(org.legalName ? { legalName: org.legalName } : {}),
      ...(org.registration ? { registration: org.registration } : {}),
      ...(org.representative ? { representative: org.representative } : {}),
      ...(org.address ? { address: org.address } : {}),
      ...(org.donationAccount ? { donationAccount: org.donationAccount } : {}),
    };
    if (Object.keys(legal).length > 0) perDomain.get("legal")![lang] = legal;

    const contact: Record<string, unknown> = {
      ...(org.email ? { email: org.email } : {}),
      ...(org.contactPoints?.length ? { contactPoints: org.contactPoints } : {}),
    };
    if (Object.keys(contact).length > 0) perDomain.get("contact")![lang] = contact;

    if (org.offer) perDomain.get("offer")![lang] = org.offer;
    if (org.location) perDomain.get("location")![lang] = org.location;
    if (org.team?.length) perDomain.get("people")![lang] = org.team;

    const webEntry = await provider.getEntry({ domain: "business", id: `${lang}/web` });
    const web = projectWeb(webEntry?.data as Record<string, unknown> | undefined);
    if (web) perDomain.get("web")![lang] = web;

    const faq = await readFaqEntries(paths.contentDirectory, lang, defaultLang);
    if (faq.length > 0) perDomain.get("faq")![lang] = faq;
  }

  const envelopes: AgentKnowledgeEnvelope[] = [];
  for (const domain of AGENT_KNOWLEDGE_DOMAINS) {
    const data = perDomain.get(domain)!;
    if (Object.keys(data).length === 0) continue;

    let freshness: AgentKnowledgeFreshness | undefined;
    try {
      const ledger = yamlParse(
        await readFile(join(paths.appDirectory, FRESHNESS_LEDGER_FILE), "utf-8"),
      ) as AuthoredFreshnessLedger;
      const stem = DOMAIN_STEM[domain];
      const matchDates = ledger.entries
        .filter((e) => {
          const subject = e.subject.split("#")[0] ?? "";
          return supported.some(
            (lang) =>
              subject === `business/${lang}/${stem}` ||
              subject.startsWith(`business/${lang}/${stem}/`),
          );
        })
        .map((e) => e.asOf)
        .filter((d): d is string => typeof d === "string");
      if (matchDates.length > 0) {
        freshness = {
          lastVerified: matchDates.sort().at(-1)!,
          source: "ckl-claim-ledger",
          coverage: "domain",
        };
      } else {
        // No CKL claim entries for this domain — use derived-source freshness
        // so the knowledge file passes AGK-08 (freshness metadata required).
        freshness = {
          lastVerified: null,
          source: "derived-source",
          coverage: "domain",
        };
      }
    } catch {
      // no ledger yet — use derived-source freshness
      freshness = {
        lastVerified: null,
        source: "derived-source",
        coverage: "domain",
      };
    }

    const prunedData: Record<string, unknown> = {};
    for (const [lang, payload] of Object.entries(data)) {
      const pruned = omitEmptyKnowledgeValues(payload);
      if (pruned !== undefined) {
        prunedData[lang] = pruned;
      }
    }
    if (Object.keys(prunedData).length === 0) continue;

    envelopes.push(
      formatAgentKnowledge({
        domain,
        site,
        baseUrl: siteUrl,
        languages: { default: defaultLang, supported },
        data: prunedData as Record<string, unknown>,
        ...(freshness ? { freshness } : {}),
      }),
    );
  }

  return { site, envelopes };
}
