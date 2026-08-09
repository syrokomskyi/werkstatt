/*
<MODULE_CONTRACT>
<purpose>Cloudflare Pages deploy adapter for the game plugin (RFC-0777).</purpose>
<keywords>deploy, cloudflare-pages, game</keywords>
<responsibilities>
  <item>Deploys dist/ to Cloudflare Pages using wrangler pages deploy.</item>
  <item>Credentials (API token, account ID) injected from channel config: deploy.cloudflare.apiToken, deploy.cloudflare.accountId.</item>
  <item>Never reads credentials from environment variables directly.</item>
</responsibilities>
<non-goals>
  <item>Does not build — build hook runs before deploy.</item>
  <item>Does not manage DNS or custom domains.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0777: Cloudflare Pages deploy adapter — wrangler pages deploy.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DeployResult } from "./github-pages.ts";

export interface CloudflarePagesDeployConfig {
  apiToken: string;
  accountId?: string;
  projectName: string;
  distDir?: string;
  branch?: string;
}

export interface CloudflarePagesAdapter {
  deploy(workpiecePath: string, config: CloudflarePagesDeployConfig): DeployResult;
}

export function createCloudflarePagesAdapter(): CloudflarePagesAdapter {
  return {
    deploy(workpiecePath: string, config: CloudflarePagesDeployConfig): DeployResult {
      const distDir = config.distDir ?? "dist";
      const distPath = join(workpiecePath, distDir);

      if (!existsSync(distPath)) {
        return {
          success: false,
          errors: [`dist/ directory not found at ${distPath} — run build first`],
        };
      }

      if (!config.apiToken) {
        return {
          success: false,
          errors: [
            "Cloudflare API token not provided in channel config (deploy.cloudflare.apiToken)",
          ],
        };
      }

      if (!config.projectName) {
        return {
          success: false,
          errors: ["Cloudflare Pages project name not provided in channel config"],
        };
      }

      try {
        const env: Record<string, string> = {
          ...process.env,
          CLOUDFLARE_API_TOKEN: config.apiToken,
        };
        if (config.accountId) {
          env.CLOUDFLARE_ACCOUNT_ID = config.accountId;
        }

        const args = ["wrangler", "pages", "deploy", distDir, "--project-name", config.projectName];
        if (config.branch) {
          args.push("--branch", config.branch);
        }

        execFileSync("npx", args, {
          cwd: workpiecePath,
          encoding: "utf-8",
          timeout: 120_000,
          stdio: ["pipe", "pipe", "pipe"],
          env,
        });

        return {
          success: true,
          url: `https://${config.projectName}.pages.dev`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          errors: [`Cloudflare Pages deploy failed: ${message}`],
        };
      }
    },
  };
}
