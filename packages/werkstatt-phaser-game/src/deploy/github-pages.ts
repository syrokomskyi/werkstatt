/*
<MODULE_CONTRACT>
<purpose>GitHub Pages deploy adapter for the Phaser plugin.</purpose>
<keywords>deploy, github, pages, phaser</keywords>
<responsibilities>
  <item>Deploys dist/ to GitHub Pages using npx gh-pages.</item>
  <item>Credentials (GitHub token) injected from channel config: deploy.github.token.</item>
  <item>Never reads credentials from environment variables directly.</item>
</responsibilities>
<non-goals>
  <item>Does not build — build hook runs before deploy.</item>
  <item>Does not manage DNS or custom domains.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial GitHub Pages deploy adapter — npx gh-pages deploy to gh-pages branch.</item>
  <item>Fix: import DeployResult from shared deploy/types.ts instead of defining locally.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DeployResult } from "./types.ts";

export interface GitHubPagesDeployConfig {
  token: string;
  repo?: string;
  branch?: string;
}

export interface GitHubPagesAdapter {
  deploy(workpiecePath: string, config: GitHubPagesDeployConfig): DeployResult;
}

export function createGitHubPagesAdapter(): GitHubPagesAdapter {
  return {
    deploy(workpiecePath: string, config: GitHubPagesDeployConfig): DeployResult {
      const distDir = join(workpiecePath, "dist");
      if (!existsSync(distDir)) {
        return {
          success: false,
          errors: [`dist/ directory not found at ${distDir} — run build first`],
        };
      }

      if (!config.token) {
        return {
          success: false,
          errors: ["GitHub token not provided in channel config (deploy.github.token)"],
        };
      }

      try {
        const args = ["gh-pages", "-d", "dist"];
        if (config.branch) {
          args.push("-b", config.branch);
        }

        const env: Record<string, string> = {
          ...process.env,
          GH_TOKEN: config.token,
        };

        if (config.repo) {
          args.push("-r", `https://x-access-token:${config.token}@github.com/${config.repo}.git`);
        }

        execFileSync("npx", ["gh-pages-clean"], {
          cwd: workpiecePath,
          encoding: "utf-8",
          timeout: 30_000,
          stdio: ["pipe", "pipe", "pipe"],
          env,
        });

        execFileSync("npx", args, {
          cwd: workpiecePath,
          encoding: "utf-8",
          timeout: 120_000,
          stdio: ["pipe", "pipe", "pipe"],
          env,
        });

        const url = config.repo
          ? `https://${config.repo.split("/")[0]}.github.io/${config.repo.split("/")[1]}`
          : undefined;

        return { success: true, url };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          errors: [`GitHub Pages deploy failed: ${message}`],
        };
      }
    },
  };
}
