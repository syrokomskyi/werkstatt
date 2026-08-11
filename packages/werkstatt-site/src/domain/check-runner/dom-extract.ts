/*
<MODULE_CONTRACT>
<purpose>
  DOM evidence extraction seam for the check-runner-node. Isolates the
  browser-side page.evaluate() callback into a named, typed function so it
  can be tested independently of Playwright orchestration.
</purpose>
<non-goals>
  <item>Do not import Playwright here; this module must be browser-evaluable and Node-importable without Playwright.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from captureSiteEvidenceGraph inline page.evaluate() to improve testability and interface clarity.</item>
</CHANGE_SUMMARY>
*/

export interface RawSectionEvidence {
  id: string;
  index: number;
  anchor: string | undefined;
  heading: string | undefined;
  text: string;
  html: string;
}

export interface RawAgentFeatures {
  webmcpRegisterTool: boolean;
  agentManifestLink: boolean;
  llmsTxtLink: boolean;
}

export interface RawPageEvidence {
  title: string | undefined;
  lang: string | undefined;
  canonical: string | undefined;
  metaDescription: string | undefined;
  text: string;
  sections: RawSectionEvidence[];
  links: string[];
  agentFeatures: RawAgentFeatures;
}

export function extractPageEvidenceFromDOM(): RawPageEvidence {
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  const metaDescription = document.querySelector<HTMLMetaElement>(
    'meta[name="description"]',
  )?.content;
  const sectionNodes = Array.from(document.querySelectorAll("main section, section, main > *"));
  const sections = sectionNodes.map((node, index) => {
    const element = node as HTMLElement;
    const heading =
      element.querySelector("h1,h2,h3,h4,h5,h6")?.textContent?.replace(/\s+/g, " ").trim() ||
      undefined;
    return {
      id: element.id || `section-${index + 1}`,
      index,
      anchor: element.id ? `#${element.id}` : undefined,
      heading,
      text: element.innerText.replace(/\s+/g, " ").trim(),
      html: element.innerHTML,
    };
  });
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .map((link) => link.href)
    .filter(Boolean);
  const inlineScripts = Array.from(document.querySelectorAll("script"))
    .map((s) => s.textContent || "")
    .join("\n");
  const webmcpRegisterTool =
    inlineScripts.includes("document.modelContext") && inlineScripts.includes("registerTool");
  const headHtml = document.head?.innerHTML || "";
  const agentManifestLink =
    /<link[^>]+rel=["']alternate["'][^>]+type=["']application\/json["'][^>]+href=["'][^"']*\.well-known\/agent\.json["']/i.test(
      headHtml,
    );
  const llmsTxtLink = /<link[^>]+href=["'][^"']*\/llms\.txt["']/i.test(headHtml);
  return {
    title: document.title || undefined,
    lang: document.documentElement.lang || undefined,
    canonical,
    metaDescription,
    text: document.body.innerText.replace(/\s+/g, " ").trim(),
    sections,
    links,
    agentFeatures: {
      webmcpRegisterTool,
      agentManifestLink,
      llmsTxtLink,
    },
  };
}
