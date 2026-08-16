/*
<MODULE_CONTRACT>
<purpose>
  Generate agent discovery endpoint files that are not covered by existing
  agent surface commands: auth.md, agent-skills/index.json,
  oauth-protected-resource, oauth-authorization-server.
  These are static files derived from system.md and the agent surface manifest.
</purpose>
<non-goals>
  <item>Do not duplicate logic from agent-api-catalog or agent-manifest.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial: auth.md, agent-skills/index.json, oauth-protected-resource, oauth-authorization-server generators.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { createHash } from "node:crypto";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { loadInternalManifest, readAgentBlock } from "./agent-shared.ts";

async function writeFileIfChanged(
  context: KernelRuntimeContext,
  filePath: string,
  content: string,
): Promise<boolean> {
  if (await context.io.exists(filePath)) {
    const existing = await context.io.readFile(filePath);
    if (existing === content) return false;
  }
  await context.io.writeFile(filePath, content);
  return true;
}

function buildAuthMd(domain: string): string {
  return `# auth.md

This site supports AI agent discovery via standard protocols.

## Discovery Endpoints

- **Agent Manifest**: \`/.well-known/agent.json\`
- **OpenAPI Spec**: \`/.well-known/agent.openapi.json\`
- **API Catalog**: \`/.well-known/api-catalog\` (RFC 9264 linkset+json)
- **MCP Server Card**: \`/.well-known/mcp/server-card.json\`
- **Agent Skills**: \`/.well-known/agent-skills/index.json\`
- **OAuth Protected Resource**: \`/.well-known/oauth-protected-resource\`
- **OAuth Authorization Server**: \`/.well-known/oauth-authorization-server\`
- **LLMs.txt**: \`/llms.txt\`

## Content Negotiation

This site supports \`Accept: text/markdown\` content negotiation (RFC-0785).
Send \`Accept: text/markdown\` to any HTML page to receive its markdown twin.

## Robots.txt

See \`/robots.txt\` for crawl directives and Content-Signal preferences.

## DNS-AID

DNS-AID SVCB record at \`_index._agents.${domain}\` points to this site's
agent.json manifest.

## Registration

This site supports anonymous agent access — no registration or credentials
are required to read public discovery endpoints.

- **Register URI**: \`https://${domain}/auth\`
- **Identity Type**: anonymous
- **Credential Type**: none
- **Claim URI**: \`/.well-known/agent.json\`

Agents can discover this site's capabilities by fetching the endpoints listed
above. For authenticated operations, use the OAuth 2.0 authorization code flow
with PKCE (S256) via the Authorization Server metadata at
\`/.well-known/oauth-authorization-server\`.

## Contact

For agent-related inquiries, refer to the contact information in the
Agent Manifest at \`/.well-known/agent.json\`.
`;
}

interface AgentSkillEntry {
  name: string;
  type: string;
  description: string;
  url: string;
  digest: string;
}

function buildAgentSkillsIndex(
  manifest: { baseUrl: string; knowledge: Array<{ domain: string; url: string; schema: string }> },
  siteName: string,
): string {
  const skills: AgentSkillEntry[] = [];

  for (const ref of manifest.knowledge) {
    const digest = createHash("sha256").update(`${ref.url}:${ref.schema}`).digest("hex");
    skills.push({
      name: ref.domain,
      type: "skill-md",
      description: `Agent knowledge for ${ref.domain} domain`,
      url: ref.url,
      digest: `sha256:${digest}`,
    });
  }

  // Add core discovery skills
  skills.push({
    name: "agent-manifest",
    type: "skill-json",
    description: "Agent surface manifest with capabilities and interfaces",
    url: "/.well-known/agent.json",
    digest: `sha256:${createHash("sha256").update("agent-manifest").digest("hex")}`,
  });

  skills.push({
    name: "openapi-spec",
    type: "skill-json",
    description: "OpenAPI 3.1 specification for agent API endpoints",
    url: "/.well-known/agent.openapi.json",
    digest: `sha256:${createHash("sha256").update("openapi-spec").digest("hex")}`,
  });

  skills.push({
    name: "llms-txt",
    type: "skill-txt",
    description: "LLM-friendly site summary",
    url: "/llms.txt",
    digest: `sha256:${createHash("sha256").update("llms-txt").digest("hex")}`,
  });

  const doc = {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    site: siteName,
    skills,
  };

  return `${JSON.stringify(doc, null, 2)}\n`;
}

function buildOauthProtectedResource(origin: string): string {
  const doc = {
    resource: `${origin}/`,
    authorization_servers: [`${origin}/.well-known/oauth-authorization-server`],
    bearer_methods_supported: ["header"],
    scopes_supported: [],
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function buildOauthAuthorizationServer(origin: string): string {
  const doc = {
    issuer: `${origin}/`,
    authorization_endpoint: `${origin}/auth`,
    token_endpoint: `${origin}/api/auth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [],
    agent_auth: {
      skill: "auth.md",
      register_uri: `${origin}/auth`,
      identity_types_supported: ["anonymous"],
      anonymous: {
        credential_types_supported: ["none"],
        claim_uri: `${origin}/.well-known/agent.json`,
      },
    },
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export async function runAgentDiscoveryEndpointsGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const { manifest: systemManifest } = await loadSystemManifest(paths.contentDirectory);
  const enabled = readAgentBlock(systemManifest).enabled !== false;

  const wellKnownDir = join(paths.publicDirectory, ".well-known");
  const agentSkillsDir = join(wellKnownDir, "agent-skills");

  if (!enabled) {
    // Remove stale files if agent is disabled
    const filesToRemove = [
      join(paths.publicDirectory, "auth.md"),
      join(agentSkillsDir, "index.json"),
      join(wellKnownDir, "oauth-protected-resource"),
      join(wellKnownDir, "oauth-authorization-server"),
    ];
    for (const f of filesToRemove) {
      if (await context.io.exists(f)) await context.io.rm(f);
    }
    return {
      data: {
        command: "agent.discovery-endpoints.generate",
        status: "skip",
        site: context.site?.name,
      },
      exitCode: 0,
      summary: "agent.discovery-endpoints.generate: skipped — agent.enabled is false",
    };
  }

  const internalManifest = await loadInternalManifest(context, paths.appDirectory);
  const domain = systemManifest.identity?.domain?.trim() ?? "example.com";
  const origin = `https://${domain}`;

  const filesWritten: string[] = [];

  // auth.md
  const authMdPath = join(paths.publicDirectory, "auth.md");
  const authMdContent = buildAuthMd(domain);
  if (await writeFileIfChanged(context, authMdPath, authMdContent)) {
    filesWritten.push("auth.md");
  }

  // agent-skills/index.json
  await context.io.mkdir(agentSkillsDir);
  const skillsPath = join(agentSkillsDir, "index.json");
  const skillsContent = buildAgentSkillsIndex(
    internalManifest ?? { baseUrl: origin, knowledge: [] },
    context.site?.name ?? "site",
  );
  if (await writeFileIfChanged(context, skillsPath, skillsContent)) {
    filesWritten.push(".well-known/agent-skills/index.json");
  }

  // oauth-protected-resource
  const oprPath = join(wellKnownDir, "oauth-protected-resource");
  const oprContent = buildOauthProtectedResource(origin);
  if (await writeFileIfChanged(context, oprPath, oprContent)) {
    filesWritten.push(".well-known/oauth-protected-resource");
  }

  // oauth-authorization-server
  const oasPath = join(wellKnownDir, "oauth-authorization-server");
  const oasContent = buildOauthAuthorizationServer(origin);
  if (await writeFileIfChanged(context, oasPath, oasContent)) {
    filesWritten.push(".well-known/oauth-authorization-server");
  }

  return {
    data: {
      command: "agent.discovery-endpoints.generate",
      status: "pass",
      site: context.site?.name,
      filesWritten,
    },
    exitCode: 0,
    summary: `agent.discovery-endpoints.generate: ${filesWritten.length} file(s) written`,
  };
}
