/*
<MODULE_CONTRACT>
<purpose>
  RFC-0051 ai.txt generation. Pure function buildAiTxt produces the
  machine-readable AI policy file from a structured AiPolicy config.
</purpose>
<non-goals>
  <item>Do not read content files or validate input — the caller is responsible.</item>
  <item>Do not manage default policy fallback — caller decides skip vs fallback.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0051: Initial implementation.</item>
</CHANGE_SUMMARY>
*/

export interface AiProviderOverride {
  name: string;
  policy: "allow" | "disallow" | "limited";
  training?: "allow" | "disallow";
  usage?: string[];
  commercial?: "yes" | "no";
  attribution?: "required" | "optional" | "none";
  license?: string;
  contact?: string;
  url?: string;
}

export interface AiPolicy {
  policy: "allow" | "disallow" | "limited";
  training?: "allow" | "disallow";
  usage?: string[];
  commercial?: "yes" | "no";
  attribution?: "required" | "optional" | "none";
  license?: string;
  contact?: string;
  url?: string;
  version?: string;
  updated?: string;
  providers?: AiProviderOverride[];
}

function formatKeyValue(key: string, value: string | undefined): string | null {
  if (value === undefined || value === null) return null;
  return `${key}: ${value}`;
}

function formatList(key: string, values: string[] | undefined): string | null {
  if (!values || values.length === 0) return null;
  return `${key}: ${values.join(", ")}`;
}

export function buildAiTxt(policy: AiPolicy, siteUrl: string): string {
  const lines: string[] = [];

  const headerComment = siteUrl
    ? `# ai.txt for ${siteUrl.replace(/^https?:\/\//, "")}`
    : "# ai.txt";
  lines.push(headerComment);
  lines.push("# AI training and usage policy");
  if (policy.url) lines.push(`# See: ${policy.url}`);
  if (policy.contact) lines.push(`# Contact: ${policy.contact}`);
  lines.push("");

  const version = policy.version ?? "0.1";
  const updated = policy.updated ?? new Date().toISOString().slice(0, 10);
  lines.push(`version: ${version}`);
  lines.push(`updated: ${updated}`);
  lines.push("");

  lines.push("# Default policy for AI systems");
  lines.push(`policy: ${policy.policy}`);

  const optionalGlobalFields: Array<[string, string | undefined]> = [
    ["license", policy.license],
    ["url", policy.url],
    ["contact", policy.contact],
  ];

  const pushLine = (key: string, val: string | undefined | string[]) => {
    if (Array.isArray(val) && val.length > 0) {
      lines.push(`${key}: ${val.join(", ")}`);
    } else if (typeof val === "string" && val.length > 0) {
      lines.push(`${key}: ${val}`);
    }
  };

  pushLine("training", policy.training);
  pushLine("usage", policy.usage);
  pushLine("commercial", policy.commercial);
  pushLine("attribution", policy.attribution);

  for (const [key, val] of optionalGlobalFields) {
    const line = formatKeyValue(key, val);
    if (line) lines.push(line);
  }

  const unknownKeys = new Set(Object.keys(policy));
  const knownKeys = new Set([
    "policy",
    "training",
    "usage",
    "commercial",
    "attribution",
    "license",
    "contact",
    "url",
    "version",
    "updated",
    "providers",
  ]);
  for (const key of unknownKeys) {
    if (!knownKeys.has(key)) {
      const val = (policy as unknown as Record<string, unknown>)[key];
      if (typeof val === "string" && val.length > 0) {
        lines.push(`${key}: ${val}`);
      }
    }
  }

  if (policy.providers && policy.providers.length > 0) {
    lines.push("");
    for (const provider of policy.providers) {
      lines.push(`[${provider.name}]`);
      lines.push(`policy: ${provider.policy}`);
      if (provider.training) lines.push(`training: ${provider.training}`);
      if (provider.usage && provider.usage.length > 0) {
        lines.push(`usage: ${provider.usage.join(", ")}`);
      }
      if (provider.commercial) lines.push(`commercial: ${provider.commercial}`);
      if (provider.attribution) lines.push(`attribution: ${provider.attribution}`);
      if (provider.license) lines.push(`license: ${provider.license}`);
      if (provider.contact) lines.push(`contact: ${provider.contact}`);
      if (provider.url) lines.push(`url: ${provider.url}`);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
