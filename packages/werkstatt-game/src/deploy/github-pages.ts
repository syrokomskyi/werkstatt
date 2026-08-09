/*
<MODULE_CONTRACT>
<purpose>GitHub Pages deploy adapter for the game plugin (RFC-0777).</purpose>
<keywords>deploy, github-pages, game</keywords>
<responsibilities>
  <item>Deploys dist/ to GitHub Pages using git push to gh-pages branch.</item>
  <item>Credentials (GitHub token) injected from channel config: deploy.github.token.</item>
  <item>Never reads credentials from environment variables directly.</item>
</responsibilities>
<non-goals>
  <item>Does not build — build hook runs before deploy.</item>
  <item>Does not manage DNS or custom domains.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0777: GitHub Pages deploy adapter — git push to gh-pages branch.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface GitHubPagesDeployConfig {
  token: string;
  repo?: string;
  branch?: string;
  distDir?: string;
}

export interface GitHubPagesAdapter {
  deploy(workpiecePath: string, config: GitHubPagesDeployConfig): DeployResult;
}

export interface DeployResult {
  success: boolean;
  url?: string;
  errors?: string[];
}

export function createGitHubPagesAdapter(): GitHubPagesAdapter {
  return {
    deploy(workpiecePath: string, config: GitHubPagesDeployConfig): DeployResult {
      const distDir = config.distDir ?? "dist";
      const branch = config.branch ?? "gh-pages";
      const distPath = join(workpiecePath, distDir);

      if (!existsSync(distPath)) {
        return {
          success: false,
          errors: [`dist/ directory not found at ${distPath} — run build first`],
        };
      }

      if (!config.token) {
        return {
          success: false,
          errors: ["GitHub token not provided in channel config (deploy.github.token)"],
        };
      }

      try {
        // Use git subtree push to deploy dist/ to gh-pages branch
        const repoUrl = config.repo
          ? `https://x-access-token:${config.token}@github.com/${config.repo}.git`
          : undefined;

        // Stage dist/ as gh-pages branch root
        execFileSync("npx", ["gh-pages-clean"], {
          cwd: workpiecePath,
          encoding: "utf-8",
          timeout: 30_000,
          stdio: ["pipe", "pipe", "pipe"],
        });

        execFileSync(
          "npx",
          ["gh-pages", "-d", distDir, "-b", branch, ...(repoUrl ? ["-r", repoUrl] : [])],
          {
            cwd: workpiecePath,
            encoding: "utf-8",
            timeout: 120_000,
            stdio: ["pipe", "pipe", "pipe"],
          },
        );

        return {
          success: true,
          url: repoUrl
            ? `https://${config.repo!.split("/")[0]}.github.io/${config.repo!.split("/")[1]}`
            : undefined,
        };
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
